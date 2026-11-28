pub mod cli;
pub mod commands;
#[cfg(target_os = "linux")]
pub mod cups;
pub mod debug_log;
pub mod dev_bridge;
pub mod devserver;
pub mod diagnostics;
pub mod diff;
pub mod distribution_bootstrap;
pub mod distribution_profile;
pub mod document;
pub mod draft;
pub mod error;
pub mod file_move;
pub mod focus;
pub mod format_keys;
#[cfg(target_os = "linux")]
pub mod gtk4_dialogs;
pub mod heartbeat;
pub mod image;
pub mod lang;
pub mod log;
pub mod lua;
mod mcp;
pub mod native_menu;
pub mod pandoc;
pub mod pandoc_format;

pub mod pandoc_probe;
pub mod paths;
pub mod pdf_print;
pub mod pdf_render;
pub mod plugin;
pub mod print_job;
pub mod proc;
pub mod remote;
pub mod session;
pub mod settings;
pub mod settings_export;
pub mod settings_import;
pub mod settings_watch;
pub mod settings_window_host;
pub mod single_instance;
pub mod spell;
pub mod state;
pub mod table_width;
pub mod text_encoding;
pub mod theme_assets;
pub mod theme_import;
pub mod themes;
pub mod ui_styles;
pub mod update;
pub mod upload;
pub mod url_scheme;
pub mod watch;
pub mod webview_security;
pub mod window_host;
pub mod window_registry;

use std::sync::{Arc, Mutex};

use lua::HostContext;
use plugin::PluginHost;
use settings::Settings;
use state::AppState;
use tauri::{Emitter, Manager};

fn match_only_webkit_render_start() {
    if !cfg!(target_os = "linux") {
        return;
    }
    if std::env::var_os("WEBKIT_DISABLE_DMABUF_RENDERER").is_some() {
        return;
    }
    let by_full_return_derive = std::env::var("NOTA_SAFE_RENDERING").is_ok_and(|v| {
        matches!(
            v.trim().to_ascii_lowercase().as_str(),
            "1" | "true" | "yes" | "on"
        )
    });
    if !by_full_return_derive {
        crate::debug_log!("[nota] WebKitGTK using default DMA-BUF/GPU rendering");
        return;
    }
    std::env::set_var("WEBKIT_DISABLE_DMABUF_RENDERER", "1");
    crate::debug_log!(
        "[nota] NOTA_SAFE_RENDERING: WebKitGTK DMA-BUF renderer disabled; \
         compatibility fallback reduces scrolling and typing frame rate."
    );
}

fn record_path_linux_display_backend() {
    if !cfg!(target_os = "linux") {
        return;
    }
    let requested = std::env::var("GDK_BACKEND").unwrap_or_else(|_| "auto".to_owned());
    let wayland = std::env::var("WAYLAND_DISPLAY").unwrap_or_default();
    let display = std::env::var("DISPLAY").unwrap_or_default();
    crate::debug_log!(
        "[nota] display backend requested={requested} WAYLAND_DISPLAY={} DISPLAY={}",
        if wayland.is_empty() {
            "(unset)"
        } else {
            &wayland
        },
        if display.is_empty() {
            "(unset)"
        } else {
            &display
        }
    );
}

#[cfg(target_os = "linux")]
fn match_only_webview_replace_store(app: &tauri::AppHandle) {
    let Some(window) = app.get_webview_window("main") else {
        return;
    };
    if let Err(error) = window.with_webview(|webview| {
        use webkit2gtk::{CacheModel, WebContextExt as _, WebViewExt as _};
        if let Some(context) = webview.inner().context() {
            let requested =
                std::env::var("NOTA_WEBKIT_CACHE_MODEL").unwrap_or_else(|_| "document".to_owned());
            let model = match requested.trim().to_ascii_lowercase().as_str() {
                "browser" => Some(CacheModel::WebBrowser),
                "default" => None,
                _ => Some(CacheModel::DocumentViewer),
            };
            if let Some(model) = model {
                context.set_cache_model(model);
            }
            crate::debug_log!(
                "[nota] WebKit cache model requested={requested} applied={}",
                if model.is_some() { "yes" } else { "default" }
            );
        }
    }) {
        crate::debug_log!("[nota] webview cache tuning unavailable: {error}");
    }
}

#[cfg(not(target_os = "linux"))]
fn match_only_webview_replace_store(_app: &tauri::AppHandle) {}

pub fn run() {
    let window_role = window_host::current_role();
    let opens_debug_window = window_role == Some(window_host::WindowRole::DebugLog);
    let standalone_settings_window = window_role == Some(window_host::WindowRole::Settings);
    let standalone_about_window = window_role == Some(window_host::WindowRole::About);
    let utility_window = window_role.is_some_and(window_host::WindowRole::utility);

    if standalone_settings_window {
        if let Some(pid) = settings_window_host::focus_existing() {
            crate::debug_log!("[nota] focused existing Settings window pid={pid}");
            return;
        }
    }

    crate::debug_log!("[nota] debug mode enabled (NOTA_DEBUG); log output is normally suppressed");
    match_only_webkit_render_start();
    record_path_linux_display_backend();

    if cli::wants_debug_log(std::env::args_os()) {
        match debug_log::create_and_open() {
            Ok(path) => eprintln!("[nota] debug report: {}", path.display()),
            Err(e) => {
                eprintln!("[nota] could not open the debug log: {e}");
                std::process::exit(5);
            }
        }
        std::process::exit(0);
    }

    let requested_open_file = cli::first_open_file(std::env::args_os());

    let single_instance_claim = if window_role.is_some() {
        crate::debug_log!("[nota] utility window: bypassing single instance");
        None
    } else {
        match single_instance::claim(requested_open_file.as_deref().map(|p| p.as_os_str())) {
            Ok(single_instance::Claim::First(listener)) => Some(listener),
            Ok(single_instance::Claim::Forwarded) => std::process::exit(0),

            Err(e) => {
                crate::debug_log!("[nota] single-instance unavailable (continuing): {e}");
                None
            }
        }
    };

    tauri::Builder::default()
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_screenshots::init())




        .plugin(tauri_plugin_clipboard_manager::init())
        .setup(move |app| {



            if opens_debug_window {
                return Ok(());
            }

            if let Some(resource_dir) = app.path().resource_dir().ok() {
                match settings_import::apply_embedded_bootstrap(&resource_dir) {
                    Ok(Some(_)) => {
                        crate::debug_log!("[nota] distribution bootstrap applied");
                    }
                    Ok(None) => {}
                    Err(error) => {
                        crate::debug_log!("[nota] distribution bootstrap skipped: {error}");
                    }
                }
            }












            let (settings, start_dynamic_is_text_question) = match Settings::load() {
                Ok(s) => (s, None),
                Err(e) => {
                    crate::debug_log!("[nota] settings read failed; using defaults: {e}");





                    let render = e
                        .to_string()
                        .split_whitespace()
                        .collect::<Vec<_>>()
                        .join(" ");
                    (Settings::default(), Some(render))
                }
            };
            log::set_debug_mode(settings.general.debug_mode);
            crate::debug_log!(
                "[nota] runtime: version={} pid={} os={} arch={} profile={}",
                env!("CARGO_PKG_VERSION"),
                std::process::id(),
                std::env::consts::OS,
                std::env::consts::ARCH,
                if cfg!(debug_assertions) { "debug" } else { "release" }
            );
            crate::debug_log!(
                "[nota] settings loaded: strict_markdown={} physics={} ui_style={} ui_mode={:?} document_theme={} limit_text_width={} debug_mode={}",
                settings.strict_markdown,
                settings.enable_physics,
                settings.ui_style,
                settings.ui_mode,
                settings.document_theme,
                settings.limit_text_width,
                settings.general.debug_mode
            );
            if let Ok(path) = crate::paths::settings_file() {
                crate::debug_log!("[nota] settings file: {}", path.display());
            }
            if let Err(error) = crate::paths::ensure_theme_directories() {
                crate::debug_log!("[nota] theme directories could not be prepared: {error}");
            }
            if let Err(error) = crate::paths::migrate_legacy_theme_directories() {
                crate::debug_log!("[nota] legacy theme migration skipped: {error}");
            }







            let documents = Arc::new(Mutex::new(document::DocumentStore::new(
                settings.strict_markdown,
            )));
            let settings_arc = Arc::new(Mutex::new(settings));
            let workspace = Arc::new(Mutex::new(None));
            let ai_context = Arc::new(Mutex::new(lua::api::ai::ContextRegistry::default()));






            let application_language = {
                let set_define = settings_arc
                    .lock()
                    .map(|s| s.general.language.clone())
                    .unwrap_or_else(|_| crate::lang::AUTO.to_owned());
                crate::lang::effective_language(&set_define, crate::lang::system_language())
            };
            crate::debug_log!("[nota] interface language: {application_language}");

            let resource_dir = app.path().resource_dir().ok();
            let base = HostContext {
                app: app.handle().clone(),
                documents: documents.clone(),
                settings: settings_arc.clone(),
                workspace: workspace.clone(),
                ai_context,
                plugin_id: String::new(),
                application_language: application_language.clone(),
            };



            let plugins = PluginHost::empty(&base);


            app.manage(AppState {
                documents,
                settings: settings_arc,
                workspace,
                plugins: Mutex::new(plugins),
                settings_problem: start_dynamic_is_text_question,

                app_language: application_language,
            });

            app.manage(devserver::DevServerState::new());
            app.manage(plugin::ReviewState::new());
            app.manage(plugin::watch::PluginWatch::default());
            app.manage(lua::api::devserver::ProbeCache::new());
            app.manage(dev_bridge::DevBridge::default());

            if standalone_settings_window || standalone_about_window {
                if standalone_settings_window {
                    match settings_window_host::start(app.handle().clone()) {
                        Ok(control) => {
                            app.manage(control);
                        }
                        Err(error) => {
                            crate::debug_log!("[nota] Settings window reuse unavailable: {error}");
                        }
                    }
                }
                crate::log::record(format!(
                    "[nota] utility-window pid={} role={:?} standalone runtime entered",
                    std::process::id(),
                    window_role
                ));
                app.manage(plugin::DeferredDiscovery::new(resource_dir, base));
                crate::debug_log!("[nota] standalone utility runtime ready");
                return Ok(());
            }

            let general = app
                .state::<AppState>()
                .settings
                .lock()
                .unwrap()
                .general
                .clone();
            if general.debug_mode && general.dev_bridge_enabled {
                if let Some(bridge) = app.try_state::<dev_bridge::DevBridge>() {
                    if let Err(error) = bridge.start_existing(
                        &app.handle(),
                        &general.dev_bridge_whitelist,
                        general.dev_bridge_port,
                    ) {
                        crate::debug_log!("[nota] developer bridge not started: {error}");
                    }
                }
            }

            app.manage(watch::FileWatcher::new(app.handle().clone()));
            app.manage(settings_watch::SettingsWatch::start(app.handle().clone()));





            app.manage(heartbeat::Heartbeat::default());
            heartbeat::start(app.handle().clone());






            app.manage(focus::FocusState::default());
            focus::start(app.handle().clone());
            app.manage(window_registry::WindowRegistry::register());




            app.manage(single_instance::Endpoint::default());
            if let Some(listener) = single_instance_claim {
                single_instance::start(app.handle().clone(), listener);
            }
            app.manage(plugin::DeferredDiscovery::new(resource_dir, base));
            match_only_webview_replace_store(app.handle());




            if distribution_profile::is_official() {
                url_scheme::main_side();
            }





            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            commands::diagnostics::nota_diagnostics,
            commands::distribution::nota_distribution_onboarding,
            commands::distribution::nota_distribution_legal,
            commands::distribution::nota_distribution_branding,
            commands::dev_bridge::nota_dev_bridge_status,
            commands::dev_bridge::nota_dev_bridge_enable,
            commands::dev_bridge::nota_dev_bridge_disable,
            commands::dev_bridge::nota_dev_bridge_revoke,
            commands::dev_bridge::nota_dev_bridge_respond,
            commands::diagnostics::nota_debug_log_read,
            commands::diagnostics::nota_debug_log_write,
            commands::file_picker::nota_picker_places,
            commands::file_picker::nota_picker_list,
            commands::file_picker::nota_picker_create_dir,
            commands::native_dialog::nota_dialog_native,
            commands::native_dialog::nota_dialog_text_file,
            commands::document::nota_doc_new,
            commands::document::nota_doc_new_with_text,
            commands::document::nota_doc_open,
            commands::document::nota_doc_sync,
            commands::document::nota_doc_settle,
            commands::document::nota_doc_cursor,
            commands::document::nota_doc_save,
            commands::document::nota_doc_rename,
            commands::document::nota_doc_move,
            commands::document::nota_doc_close,
            commands::document::nota_doc_delete,
            commands::document::nota_doc_set_active,
            commands::document::nota_doc_get,
            commands::document::nota_doc_list,
            commands::document::nota_doc_reload,
            commands::document::nota_doc_disk_text,
            commands::document::nota_doc_has_unsaved,
            commands::draft::nota_draft_save,
            commands::draft::nota_draft_list,
            commands::draft::nota_draft_restore,
            commands::draft::nota_draft_discard,
            commands::draft::nota_draft_discard_document,
            commands::diff::nota_diff_texts,
            commands::table_width::nota_table_widths_get,
            commands::table_width::nota_table_widths_set,
            commands::table_width::nota_table_widths_forget,

            commands::session::nota_session_get,
            commands::session::nota_session_set_open,
            commands::session::nota_session_set_scroll,
            commands::session::nota_session_forget_recent,
            commands::session::nota_session_clear,
            commands::session::nota_session_file,
            commands::watch::nota_watch_sync,
            commands::export::nota_export_write,
            commands::export::nota_export_write_bytes,
            commands::export::nota_export_print,
            commands::export::nota_export_reveal,

            commands::print::nota_print_supported,
            commands::print::nota_print_backend,
            commands::print::nota_print_printers,
            commands::print::nota_print_prepare,
            commands::print::nota_print_system,
            commands::print::nota_print_send,
            commands::print::nota_print_save_pdf,
            commands::image::nota_image_place,
            commands::image::nota_image_data_url,
            commands::image::nota_image_file_copy,
            commands::image::nota_image_file_move,
            commands::image::nota_image_file_delete,
            commands::image_upload::nota_image_upload_get,
            commands::image_upload::nota_image_upload_set,
            commands::image_upload::nota_image_upload_one,
            commands::pandoc::nota_pandoc_probe,
            commands::pandoc::nota_pandoc_export,
            commands::pandoc::nota_pandoc_import,
            commands::workspace::nota_workspace_open,
            commands::workspace::nota_workspace_close,
            commands::workspace::nota_workspace_get,
            commands::workspace::nota_workspace_delete_path,
            commands::workspace::nota_workspace_tree,
            commands::workspace::nota_workspace_excerpts,
            commands::settings::nota_settings_get,
            commands::settings::nota_settings_set,
            commands::settings::nota_settings_patch,
            commands::settings::nota_settings_complete_onboarding,
            commands::window::nota_window_open_devtools,
            commands::window::nota_window_open_debug_log,
            commands::window::nota_window_show_main,
            commands::window::nota_quit,
            commands::window::nota_window_open_new,
            commands::window_registry::nota_window_registry_snapshot,
            commands::window_registry::nota_window_picker_mode,
            commands::window_registry::nota_window_transfer,
            commands::window_registry::nota_window_take_transfer,
            commands::window_registry::nota_window_ack_transfer,
            commands::window::nota_window_open_settings,
            commands::window::nota_window_prepare_settings,
            commands::window::nota_window_hide_settings,
            commands::window::nota_window_open_about,
            commands::window::nota_window_prepare_about,
            commands::window::nota_window_hide_about,

            commands::path_kind::nota_paths_kind,


            commands::webview::nota_webview_spellcheck_get,
            commands::webview::nota_webview_spellcheck_set,
            commands::webview::nota_webview_spellcheck_languages_set,
            commands::webview::nota_webview_scroll_hard,
            commands::webview::nota_webview_notify_ime_cursor,



            spell::nota_spell_check,
            spell::nota_spell_suggest,
            spell::nota_spell_dictionaries,
            spell::nota_spell_dict_dir,
            spell::nota_spell_dict_reveal,
            spell::nota_spell_dict_import,
            spell::nota_spell_word_add,
            spell::nota_spell_word_ignore,
            commands::settings::nota_settings_open_dir,
            commands::settings::nota_settings_problem,
            commands::settings::nota_app_language,
            commands::settings::nota_settings_reset,
            commands::settings::nota_settings_export_inventory,
            commands::settings::nota_settings_export,
            commands::settings::nota_settings_import_inspect,
            commands::settings::nota_settings_import,


            commands::focus::nota_focus_get,
            commands::focus::nota_focus_start,
            commands::focus::nota_focus_stop,
            commands::focus::nota_focus_ack,

            commands::focus::nota_focus_beep,
            commands::focus::nota_focus_close_alarm,
            commands::theme::nota_doc_themes,
            commands::theme::nota_doc_theme_css,
            commands::theme::nota_doc_themes_open_dir,
            commands::theme::nota_theme_import,


            commands::ui_style::nota_ui_styles,
            commands::ui_style::nota_ui_style_css,
            commands::ui_style::nota_ui_styles_open_dir,
            commands::update::nota_update_check,
            commands::update::nota_update_install,
            commands::update::nota_update_cancel,
            commands::plugin::nota_plugins_list,
            commands::plugin::nota_plugin_set_enabled,
            commands::plugin::nota_plugin_call,
            commands::plugin::nota_plugin_find_command,
            commands::plugin::nota_plugin_panels,
            commands::plugin::nota_plugin_panel_content,
            commands::plugin::nota_plugin_review,
            commands::plugin::nota_plugin_review_open,
            commands::plugin::nota_plugin_review_close,
            commands::plugin::nota_plugin_menus,
            commands::plugin::nota_plugin_install,
            commands::plugin::nota_plugin_uninstall,
            commands::plugin::nota_plugin_trust,
            commands::plugin::nota_plugin_setting_set,
            commands::plugin::nota_plugin_trust_list,
            commands::plugin::nota_plugin_updates,
            commands::plugin::nota_plugin_update,
            commands::plugin::nota_plugin_export,
            commands::plugin::nota_plugin_export_name,
            commands::plugin::nota_plugins_open_dir,
            commands::menu::nota_native_menu_apply,
            nota_frontend_ready,
            nota_startup_file,
        ])






        .on_menu_event(|app, event| {
            let _ = app.emit("nota:native-menu", event.id().0.clone());
        })
        .on_window_event(move |window, event| {


















            if let tauri::WindowEvent::CloseRequested { api, .. } = event {
                if utility_window && window.label() == "main" {
                    api.prevent_close();
                    window.app_handle().exit(0);
                    return;
                }
                if window.label() == "settings" || window.label() == "about" {
                    api.prevent_close();
                    let _ = window.hide();
                    return;
                }
                if window.label() == "main" && close_window_before_need_text(window) {
                    api.prevent_close();
                    let _ = window.app_handle().emit("nota:close-requested", ());
                }
            }













            if let tauri::WindowEvent::Focused(has_call_point) = event {
                if window.label() == "main" {
                    if let Some(status_2) = window.try_state::<focus::FocusState>() {
                        focus::window_port_call_point(&status_2, *has_call_point);
                    }
                }
            }

            if let tauri::WindowEvent::Destroyed = event {













                match window.label() {
                    "main" => {

                        if let Some(state) = window.try_state::<AppState>() {
                            if let Ok(mut host) = state.plugins.lock() {
                                host.unload_all();
                            }
                        }






                        window.app_handle().exit(0);
                    }








                    l if l == focus::alarm::ALARM_LABEL => {
                        if let Some(status_2) = window.try_state::<focus::FocusState>() {
                            focus::confirm(&status_2);
                        }
                    }

                    _ => {}
                }
            }
        })














        .on_page_load(move |webview, payload| {
            let app = webview.app_handle();
            if let Some(state) = app.try_state::<AppState>() {
                let general = state.settings.lock().unwrap().general.clone();
                if let Err(error) = webview_security::configure(
                    app,
                    general.debug_mode,
                    general.webview_default_shortcuts,
                ) {
                    crate::debug_log!("[nota] WebView security configuration failed: {error}");
                }
            }
            if let Some(role) = window_role.filter(|role| role.utility()) {
                if webview.label() != "main" {
                    return;
                }
                let expected = role.page();
                let expected_suffix = format!("/{expected}");
                let loaded = payload.url().path().ends_with(&expected_suffix)
                    || payload.url().path().ends_with(expected);
                if loaded {
                    let window = webview.window();
                    let (width, height) = role.size();
                    let title = role.title();
                    let _ = window.set_title(&title);
                    let _ = window.set_size(tauri::LogicalSize::new(width, height));
                    let _ = window.set_skip_taskbar(false);
                    let _ = window.remove_menu();
                    let _ = window.center();
                    if let Err(error) = window.show() {
                        crate::log::record(format!(
                            "[nota] utility-window pid={} role={role:?} show failed: {error}",
                            std::process::id(),
                        ));
                    }
                    if let Err(error) = window.set_focus() {
                        crate::log::record(format!(
                            "[nota] utility-window pid={} role={role:?} focus failed: {error}",
                            std::process::id(),
                        ));
                    }
                    crate::log::record(format!(
                        "[nota] utility-window pid={} role={role:?} page shown url={}",
                        std::process::id(),
                        payload.url()
                    ));
                    window_host::signal_ready();
                    #[cfg(target_os = "linux")]
                    {
                        let _ = webview.with_webview(|platform| {
                            commands::window::focus_linux_webview(&platform.inner())
                        });
                    }
                } else if let Err(error) =
                    webview.eval(&format!("window.location.replace('{expected}')"))
                {
                    eprintln!("[nota] could not open {expected}: {error}");
                }
                return;
            }
            if window_role.is_some() {
                window_host::signal_ready();
            }
            if let Err(e) = format_keys::install(webview) {
                crate::debug_log!("[nota] format shortcut hook unavailable (Ctrl+B uses fallback): {e}");
            }
        })
        .build({
            let mut context = tauri::generate_context!();
            if let Some(role) = window_role {
                if let Some(window) = context.config_mut().app.windows.get_mut(0) {
                    window.url = tauri::WebviewUrl::App(role.page().into());
                    window.title = role.title().to_owned();
                    let (width, height) = role.size();
                    window.width = width;
                    window.height = height;
                    window.visible = false;
                    window.skip_taskbar = !role.utility();
                    if role.utility() {
                        let (min_width, min_height) = role.min_size();
                        window.min_width = Some(min_width);
                        window.min_height = Some(min_height);
                    }
                    #[cfg(target_os = "windows")]
                    if role == window_host::WindowRole::Settings {
                        window.data_directory =
                            Some(std::path::PathBuf::from("nota-settings-webview"));
                    }
                }
            }
            context
        })
        .expect("Nota failed to start")
        .run(|app, event| {












            if let tauri::RunEvent::Exit = event {
                if let Some(state) = app.try_state::<devserver::DevServerState>() {
                    state.stop_all();
                }





                if let Some(hb) = app.try_state::<heartbeat::Heartbeat>() {
                    hb.stop();
                }
                if let Some(watch) = app.try_state::<plugin::watch::PluginWatch>() {
                    watch.set_enabled(app, false);
                }




                if let Some(endpoint) = app.try_state::<single_instance::Endpoint>() {
                    if let Ok(slot) = endpoint.0.lock() {
                        if let Some(path) = slot.as_ref() {
                            let _ = std::fs::remove_file(path);
                        }
                    }
                }
            }
        })
}

fn close_window_before_need_text(window: &tauri::Window) -> bool {
    let Some(state) = window.try_state::<AppState>() else {
        return false;
    };
    let has_position_save = state
        .documents
        .lock()
        .map(|docs| docs.has_unsaved())
        .unwrap_or(false);
    if !has_position_save {
        return false;
    }
    state
        .settings
        .lock()
        .map(|s| s.confirm_unsaved)
        .unwrap_or(false)
}

#[tauri::command]
fn nota_startup_file() -> Result<Option<String>, error::NotaError> {
    let path = match cli::first_open_file(std::env::args_os()) {
        Some(p) => p,
        None => return Ok(None),
    };

    Ok(Some(crate::paths::path_to_string(&path)?))
}

#[tauri::command]
fn nota_frontend_ready(app: tauri::AppHandle) -> Result<(), String> {
    app.state::<plugin::DeferredDiscovery>().start(&app);
    Ok(())
}
