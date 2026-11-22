use tauri::{Emitter, Manager, State};
use tauri_plugin_opener::OpenerExt;

use crate::error::{NotaError, Result};
use crate::settings::Settings;
use crate::state::AppState;

#[tauri::command]
pub fn nota_settings_get(state: State<'_, AppState>) -> Result<Settings> {
    let s = state.settings.lock().unwrap();
    Ok(s.clone())
}

#[tauri::command]
pub fn nota_settings_set(
    app: tauri::AppHandle,
    state: State<'_, AppState>,
    settings: Settings,
) -> Result<()> {
    save_settings(&app, &state, settings)
}

#[tauri::command]
pub fn nota_settings_problem(state: State<'_, AppState>) -> Option<String> {
    state.settings_problem.clone()
}

#[tauri::command]
pub fn nota_app_language(state: State<'_, AppState>) -> AppLang {
    let setting = state
        .settings
        .lock()
        .map(|s| s.general.language.clone())
        .unwrap_or_else(|_| crate::lang::AUTO.to_owned());
    AppLang {
        setting,
        effective: state.app_language.clone(),

        available: crate::lang::SUPPORTED_LANGUAGES
            .iter()
            .zip(crate::lang::LANGUAGE_NAMES)
            .map(|(tag, label)| LanguageEntry {
                tag: (*tag).to_owned(),
                label: label.to_owned(),
            })
            .collect(),
    }
}

#[derive(serde::Serialize)]
pub struct AppLang {
    pub setting: String,
    pub effective: String,

    pub available: Vec<LanguageEntry>,
}

#[derive(serde::Serialize)]
pub struct LanguageEntry {
    pub tag: String,
    pub label: String,
}

#[tauri::command]
pub fn nota_settings_open_dir(app: tauri::AppHandle) -> Result<String> {
    let dir = crate::paths::config_dir()?;
    let shown = crate::paths::path_to_string(&dir)?;
    app.opener()
        .open_path(shown.clone(), None::<&str>)
        .map_err(|e| {
            NotaError::other(format!(
                "Could not open the directory with the system opener: {e}; directory: {shown}"
            ))
        })?;
    Ok(shown)
}

#[tauri::command]
pub fn nota_settings_reset(app: tauri::AppHandle, state: State<'_, AppState>) -> Result<Settings> {
    let next = Settings::default();
    save_settings(&app, &state, next.clone())?;
    Ok(next)
}

#[tauri::command]
pub fn nota_settings_export_inventory(
    state: State<'_, AppState>,
) -> crate::settings_export::ExportInventory {
    crate::settings_export::inventory(&state)
}

#[tauri::command]
pub async fn nota_settings_export(
    request: crate::settings_export::ExportRequest,
) -> Result<crate::settings_export::ExportReport> {
    tauri::async_runtime::spawn_blocking(move || crate::settings_export::export(&request))
        .await
        .map_err(|e| NotaError::other(format!("Settings package export worker failed: {e}")))?
}

pub(crate) fn save_settings(
    app: &tauri::AppHandle,
    state: &AppState,
    next: Settings,
) -> Result<()> {
    let mut next = next;
    let locked = state.plugins.lock().unwrap().locked_setting_values();
    if let Some(value) = locked.get("editor.spreadsheet_tables") {
        next.editor.spreadsheet_tables = *value;
    }
    let settings_snapshot = next.clone();
    let strict = next.strict_markdown;
    let debug_mode = next.general.debug_mode;
    let extensions_enabled = next.general.extensions_enabled;
    let lua_hot_reload = next.general.debug_mode && next.general.lua_hot_reload;
    let lua_hot_reload_changed;
    let extensions_changed;
    let bridge_config_changed;

    {
        let current = state.settings.lock().unwrap();
        let previous = current.clone();
        extensions_changed = previous.general.extensions_enabled != extensions_enabled;
        lua_hot_reload_changed =
            (previous.general.debug_mode && previous.general.lua_hot_reload) != lua_hot_reload;
        bridge_config_changed = previous.general.dev_bridge_enabled
            != next.general.dev_bridge_enabled
            || previous.general.debug_mode != next.general.debug_mode
            || previous.general.dev_bridge_port != next.general.dev_bridge_port
            || previous.general.dev_bridge_whitelist != next.general.dev_bridge_whitelist;
        let bridge_enabled = next.general.debug_mode && next.general.dev_bridge_enabled;
        let bridge_port = next.general.dev_bridge_port;
        let bridge_whitelist = next.general.dev_bridge_whitelist.clone();

        if let Err(e) = current.save() {
            return Err(e);
        }
        drop(current);

        if bridge_config_changed {
            if let Some(bridge) = app.try_state::<crate::dev_bridge::DevBridge>() {
                if bridge_enabled {
                    bridge.start_existing(app, &bridge_whitelist, bridge_port)?;
                } else {
                    bridge.stop();
                }
            }
        }
    }

    crate::log::set_debug_mode(debug_mode);

    state.documents.lock().unwrap().set_strict_markdown(strict);

    if extensions_changed {
        state
            .plugins
            .lock()
            .unwrap()
            .set_extensions_enabled(extensions_enabled);
    }
    if lua_hot_reload_changed {
        if let Some(watch) = app.try_state::<crate::plugin::watch::PluginWatch>() {
            watch.set_enabled(app, lua_hot_reload);
        }
    }
    app.emit("nota:settings-changed", &settings_snapshot)
        .map_err(|e| NotaError::other(format!("Could not broadcast settings update: {e}")))?;
    Ok(())
}
