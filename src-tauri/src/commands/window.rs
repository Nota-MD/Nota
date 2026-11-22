use tauri::{Manager, WebviewUrl, WebviewWindowBuilder};

use crate::error::{NotaError, Result};

const MAIN_WINDOW: &str = "main";
const SETTINGS_WINDOW: &str = "settings";
const ABOUT_WINDOW: &str = "about";

#[cfg(target_os = "linux")]
pub(crate) fn focus_linux_webview(webview: &webkit2gtk::WebView) {
    use gtk::prelude::{Cast as _, GtkWindowExt as _, WidgetExt as _};

    if let Some(toplevel) = webview
        .toplevel()
        .and_then(|widget| widget.downcast::<gtk::Window>().ok())
    {
        toplevel.set_accept_focus(true);
        toplevel.deiconify();
        toplevel.present();
        if let Some(window) = toplevel.window() {
            window.raise();
            window.focus(gtk::current_event_time());
        }
    }
    webview.grab_focus();
}

#[tauri::command]
pub fn nota_window_show_main(app: tauri::AppHandle) -> Result<()> {
    let window = app
        .get_webview_window(MAIN_WINDOW)
        .ok_or_else(|| NotaError::other(format!("Window `{MAIN_WINDOW}` not found")))?;
    window.set_skip_taskbar(false).map_err(|error| {
        NotaError::other(format!("Could not reveal the taskbar entry: {error}"))
    })?;

    #[cfg(target_os = "windows")]
    window.hide().map_err(|error| {
        NotaError::other(format!("Could not hide the prewarmed window: {error}"))
    })?;
    window
        .center()
        .map_err(|error| NotaError::other(format!("Could not center the main window: {error}")))?;
    window
        .show()
        .map_err(|error| NotaError::other(format!("Could not show the main window: {error}")))?;
    window
        .set_focus()
        .map_err(|error| NotaError::other(format!("Could not focus the main window: {error}")))?;

    #[cfg(target_os = "linux")]
    window
        .with_webview(|webview| focus_linux_webview(&webview.inner()))
        .map_err(|error| {
            NotaError::other(format!("Could not focus the editor WebView: {error}"))
        })?;

    #[cfg(target_os = "linux")]
    {
        let app2 = app.clone();
        gtk::glib::timeout_add_local_once(std::time::Duration::from_millis(60), move || {
            let Some(window) = app2.get_webview_window(MAIN_WINDOW) else {
                return;
            };
            let _ = window.set_focus();
            let _ = window.with_webview(|webview| focus_linux_webview(&webview.inner()));
            let _ = window.eval("window.dispatchEvent(new Event('nota-window-shown'))");
        });
    }

    crate::debug_log!("[nota] editor ready; showing main window");
    Ok(())
}

#[tauri::command]
pub fn nota_window_open_debug_log() -> Result<()> {
    crate::debug_log!("[nota] opening debug log");
    let program = std::env::current_exe().map_err(|error| {
        NotaError::other(format!("Could not locate the Nota executable: {error}"))
    })?;
    crate::proc::background_command(&program)
        .arg(crate::cli::DEBUG_WINDOW_FLAG)
        .spawn()
        .map_err(|error| {
            NotaError::other(format!("Could not start the debug log window: {error}"))
        })?;
    Ok(())
}

#[tauri::command]
pub fn nota_window_open_devtools(app: tauri::AppHandle) -> Result<()> {
    let window = app
        .get_webview_window(MAIN_WINDOW)
        .ok_or_else(|| NotaError::other(format!("Window `{MAIN_WINDOW}` not found")))?;
    window.open_devtools();
    Ok(())
}

#[tauri::command]
pub fn nota_window_open_new(path: Option<String>) -> Result<()> {
    let program = std::env::current_exe().map_err(|error| {
        NotaError::other(format!("Could not locate the Nota executable: {error}"))
    })?;
    let mut command = crate::proc::background_command(&program);
    command.arg(crate::cli::NEW_WINDOW_FLAG);
    if let Some(path) = path.filter(|path| !path.trim().is_empty()) {
        command.arg(&path);
    }
    command.spawn().map_err(|error| {
        NotaError::other(format!(
            "Could not open a new window with {}: {error}",
            program.display()
        ))
    })?;
    crate::debug_log!("[nota] new window: {}", program.display());
    Ok(())
}

#[cfg(not(target_os = "windows"))]
#[tauri::command]
pub fn nota_window_open_settings(app: tauri::AppHandle) -> Result<()> {
    if show_settings_window(&app).is_ok() {
        return Ok(());
    }
    open_settings_process(false)
}

#[cfg(target_os = "windows")]
#[tauri::command]
pub fn nota_window_open_settings(_app: tauri::AppHandle) -> Result<()> {
    open_settings_process(true)
}

fn open_settings_process(startup_log: bool) -> Result<()> {
    let program = std::env::current_exe()
        .map_err(|e| NotaError::other(format!("Could not locate the Nota executable: {e}")))?;
    crate::proc::background_command(&program)
        .arg(crate::cli::SETTINGS_WINDOW_FLAG)
        .spawn()
        .map(|_| {
            if startup_log {
                crate::debug_log!(
                    "[nota] settings window launched directly: {}",
                    program.display()
                );
            } else {
                crate::debug_log!("[nota] settings window fallback: {}", program.display());
            }
        })
        .map_err(|error| {
            NotaError::other(format!("Could not start the Preferences window: {error}"))
        })
}

#[cfg(target_os = "windows")]
#[tauri::command]
pub fn nota_window_prepare_settings(_app: tauri::AppHandle) -> Result<()> {
    Ok(())
}

#[cfg(not(target_os = "windows"))]
#[tauri::command]
pub fn nota_window_prepare_settings(app: tauri::AppHandle) -> Result<()> {
    ensure_settings_window(&app)?;
    crate::debug_log!("[nota] settings window prewarmed");
    Ok(())
}

#[tauri::command]
pub fn nota_window_hide_settings(app: tauri::AppHandle) -> Result<()> {
    if let Some(window) = app.get_webview_window(SETTINGS_WINDOW) {
        window.hide().map_err(|error| {
            NotaError::other(format!("Could not hide the Preferences window: {error}"))
        })?;
    }
    if crate::cli::opens_settings_window(std::env::args_os()) {
        app.exit(0);
    }
    Ok(())
}

#[tauri::command]
pub fn nota_window_open_about(app: tauri::AppHandle) -> Result<()> {
    let window = app
        .get_webview_window(ABOUT_WINDOW)
        .map(Ok)
        .unwrap_or_else(|| create_about_window(&app))?;
    window
        .show()
        .and_then(|_| window.unminimize())
        .and_then(|_| window.set_focus())
        .map_err(|error| NotaError::other(format!("Could not focus the About window: {error}")))?;
    Ok(())
}

#[tauri::command]
pub fn nota_window_prepare_about(app: tauri::AppHandle) -> Result<()> {
    if app.get_webview_window(ABOUT_WINDOW).is_none() {
        create_about_window(&app)?;
    }
    Ok(())
}

#[tauri::command]
pub fn nota_window_hide_about(app: tauri::AppHandle) -> Result<()> {
    if let Some(window) = app.get_webview_window(ABOUT_WINDOW) {
        window.hide().map_err(|error| {
            NotaError::other(format!("Could not hide the About window: {error}"))
        })?;
    }
    Ok(())
}

fn create_about_window(app: &tauri::AppHandle) -> Result<tauri::WebviewWindow> {
    WebviewWindowBuilder::new(
        app,
        ABOUT_WINDOW,
        WebviewUrl::App("index.html?about=1".into()),
    )
    .title("Nota")
    .inner_size(560.0, 720.0)
    .min_inner_size(420.0, 560.0)
    .visible(false)
    .build()
    .map_err(|error| NotaError::other(format!("Could not create the About window: {error}")))
}

#[cfg(not(target_os = "windows"))]
fn ensure_settings_window(app: &tauri::AppHandle) -> Result<tauri::WebviewWindow> {
    if let Some(window) = app.get_webview_window(SETTINGS_WINDOW) {
        return Ok(window);
    }
    WebviewWindowBuilder::new(
        app,
        SETTINGS_WINDOW,
        WebviewUrl::App("index.html?settings=1".into()),
    )
    .title("Nota Settings")
    .inner_size(1080.0, 700.0)
    .min_inner_size(720.0, 520.0)
    .visible(false)
    .focused(false)
    .build()
    .map_err(|error| NotaError::other(format!("Could not start the Preferences window: {error}")))
}

#[cfg(not(target_os = "windows"))]
fn show_settings_window(app: &tauri::AppHandle) -> Result<()> {
    let window = ensure_settings_window(app)?;
    window
        .set_skip_taskbar(false)
        .and_then(|_| window.show())
        .and_then(|_| window.unminimize())
        .and_then(|_| window.set_focus())
        .map_err(|error| {
            NotaError::other(format!("Could not start the Preferences window: {error}"))
        })
}

#[tauri::command]
pub fn nota_quit(app: tauri::AppHandle) {
    crate::debug_log!("[nota] quit confirmed by frontend");
    app.exit(0);
}
