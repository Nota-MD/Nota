use tauri::{Emitter, Manager, State};
use tauri_plugin_opener::OpenerExt;

use crate::error::{NotaError, Result};
use crate::settings::Settings;
use crate::settings_import::PreparedImport;
use crate::state::AppState;

struct PluginInstallRollback {
    id: String,
    previous: Option<std::path::PathBuf>,
    enabled: bool,
}

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
pub fn nota_settings_patch(
    app: tauri::AppHandle,
    state: State<'_, AppState>,
    patch: serde_json::Value,
) -> Result<Settings> {
    let mut base = serde_json::to_value(Settings::load()?)
        .map_err(|error| NotaError::other(format!("Could not encode current settings: {error}")))?;
    merge_json(&mut base, patch);
    let next: Settings = serde_json::from_value(base)
        .map_err(|error| NotaError::other(format!("Could not apply settings patch: {error}")))?;
    save_settings(&app, &state, next.clone())?;
    Ok(next)
}

#[tauri::command]
pub fn nota_settings_complete_onboarding(
    app: tauri::AppHandle,
    state: State<'_, AppState>,
) -> Result<Settings> {
    let mut next = Settings::load()?;
    if next.general.onboarding_seen {
        return Ok(next);
    }
    next.general.onboarding_seen = true;
    save_settings(&app, &state, next.clone())?;
    Ok(next)
}

fn merge_json(base: &mut serde_json::Value, patch: serde_json::Value) {
    match (base, patch) {
        (serde_json::Value::Object(base_map), serde_json::Value::Object(patch_map)) => {
            for (key, value) in patch_map {
                merge_json(
                    base_map.entry(key).or_insert(serde_json::Value::Null),
                    value,
                );
            }
        }
        (base, patch) => *base = patch,
    }
}

#[tauri::command]
pub fn nota_settings_problem(state: State<'_, AppState>) -> Option<String> {
    state.settings_problem.clone()
}

#[tauri::command(rename = "nota_app_lang")]
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
    app: tauri::AppHandle,
    request: crate::settings_export::ExportRequest,
) -> Result<crate::settings_export::ExportReport> {
    tauri::async_runtime::spawn_blocking(move || {
        let stamp = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap_or_default()
            .as_nanos();
        let temp_root = std::env::temp_dir().join(format!(
            "nota-settings-export-{}-{stamp}",
            std::process::id()
        ));
        std::fs::create_dir_all(&temp_root).map_err(|error| {
            NotaError::other(format!(
                "Could not create the settings export workspace: {error}"
            ))
        })?;

        let result = (|| {
            let state = app.state::<AppState>();
            let host = state.plugins.lock().map_err(|_| {
                NotaError::other(
                    "The extension host is unavailable; restart Nota before exporting packages",
                )
            })?;
            let mut plugin_packages = std::collections::BTreeMap::new();
            for choice in request.plugins.iter().filter(|plugin| plugin.package) {
                let file_name = host.default_export_name(&choice.id)?;
                let target = temp_root
                    .join(crate::paths::safe_filename(&choice.id))
                    .join(file_name);
                host.export_2(&choice.id, &target)?;
                plugin_packages.insert(choice.id.clone(), target);
            }
            drop(host);
            crate::settings_export::export(&request, &plugin_packages)
        })();
        let _ = std::fs::remove_dir_all(&temp_root);
        result
    })
    .await
    .map_err(|e| NotaError::other(format!("Settings package export worker failed: {e}")))?
}

#[tauri::command]
pub fn nota_settings_import_inspect(
    package: String,
) -> Result<crate::settings_import::PackageInventory> {
    crate::settings_import::inspect(&package)
}

#[tauri::command]
pub async fn nota_settings_import(
    app: tauri::AppHandle,
    state: State<'_, AppState>,
    request: crate::settings_import::ImportRequest,
) -> Result<crate::settings_import::ImportReport> {
    let mut prepared =
        tauri::async_runtime::spawn_blocking(move || crate::settings_import::prepare(&request))
            .await
            .map_err(|e| {
                NotaError::other(format!("Settings package import worker failed: {e}"))
            })??;

    let rollback_root = plugin_rollback_root();
    if !prepared.plugin_packages().is_empty() {
        std::fs::create_dir_all(&rollback_root).map_err(|error| {
            NotaError::other(format!(
                "Could not create the extension import rollback directory: {error}"
            ))
        })?;
    }
    let installed_plugins = match install_plugin_packages(&app, &prepared, &rollback_root) {
        Ok(records) => records,
        Err(error) => {
            let _ = std::fs::remove_dir_all(&rollback_root);
            return Err(error);
        }
    };

    if let Err(error) = prepared.commit() {
        restore_plugin_packages(&app, &installed_plugins);
        let _ = std::fs::remove_dir_all(&rollback_root);
        return Err(error);
    }
    if let Some(next) = prepared.imported_settings() {
        if let Err(error) = save_settings(&app, &state, next) {
            prepared.rollback();
            restore_plugin_packages(&app, &installed_plugins);
            let _ = std::fs::remove_dir_all(&rollback_root);
            return Err(error);
        }
    }

    let report = prepared.finish();
    let _ = std::fs::remove_dir_all(&rollback_root);
    app.emit("nota:settings-package-imported", &report)
        .map_err(|e| NotaError::other(format!("Could not announce settings import: {e}")))?;
    Ok(report)
}

fn plugin_rollback_root() -> std::path::PathBuf {
    let stamp = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap_or_default()
        .as_nanos();
    std::env::temp_dir().join(format!(
        "nota-settings-plugin-rollback-{}-{stamp}",
        std::process::id()
    ))
}

fn package_plugin_id(path: &std::path::Path) -> Result<String> {
    let package = crate::plugin::package::read_one_package(path)?;
    let manifest = package
        .find(crate::plugin::package::MANIFEST_FILE)
        .ok_or_else(|| {
            NotaError::other(format!(
                "The extension package {} does not contain plugin.toml",
                path.display()
            ))
        })?;
    let value: toml::Value = toml::from_str(
        std::str::from_utf8(manifest)
            .map_err(|_| NotaError::other("The packaged plugin.toml is not UTF-8 text"))?,
    )
    .map_err(|error| NotaError::other(format!("The packaged plugin.toml is invalid: {error}")))?;
    value
        .get("plugin")
        .and_then(toml::Value::as_table)
        .and_then(|plugin| plugin.get("id"))
        .and_then(toml::Value::as_str)
        .filter(|id| !id.is_empty())
        .map(str::to_owned)
        .ok_or_else(|| NotaError::other("The packaged plugin.toml has no extension id"))
}

fn install_plugin_packages(
    app: &tauri::AppHandle,
    prepared: &PreparedImport,
    rollback_root: &std::path::Path,
) -> Result<Vec<PluginInstallRollback>> {
    if prepared.plugin_packages().is_empty() {
        return Ok(Vec::new());
    }
    let state = app.state::<AppState>();
    let mut host = state.plugins.lock().map_err(|_| {
        NotaError::other("The extension host is unavailable; restart Nota and try again")
    })?;
    let mut records = Vec::new();

    for (index, staged) in prepared.plugin_packages().iter().enumerate() {
        let incoming_id = package_plugin_id(&staged.path)?;
        if incoming_id != staged.id {
            rollback_plugin_records(&mut host, &records);
            return Err(NotaError::other(format!(
                "The extension package path names `{}` but its manifest names `{incoming_id}`",
                staged.id
            )));
        }

        let previous_info = host
            .list_info()
            .into_iter()
            .find(|plugin| plugin.id == staged.id);
        let enabled = previous_info
            .as_ref()
            .map(|plugin| plugin.state == "loaded")
            .unwrap_or(false);
        let previous = previous_info.map(|_| {
            let path = rollback_root.join(format!(
                "{}-{index}.nota-plugin",
                crate::paths::safe_filename(&staged.id)
            ));
            host.export_2(&staged.id, &path).map(|_| path)
        });
        let previous = match previous {
            Some(result) => Some(result?),
            None => None,
        };

        match host.install_2(&staged.path) {
            Ok(id) if id == staged.id => {
                let has_previous = previous.is_some();
                records.push(PluginInstallRollback {
                    id: staged.id.clone(),
                    previous,
                    enabled,
                });
                if has_previous {
                    if let Err(error) = host.set_enabled(&staged.id, enabled) {
                        rollback_plugin_records(&mut host, &records);
                        return Err(error);
                    }
                }
            }
            Ok(id) => {
                rollback_plugin_records(&mut host, &records);
                return Err(NotaError::other(format!(
                    "The extension package installed `{id}` but the backup names `{}`",
                    staged.id
                )));
            }
            Err(error) => {
                rollback_plugin_records(&mut host, &records);
                return Err(NotaError::other(format!(
                    "Could not restore extension package `{}`: {error}",
                    staged.id
                )));
            }
        }
    }
    Ok(records)
}

fn restore_plugin_packages(app: &tauri::AppHandle, records: &[PluginInstallRollback]) {
    if records.is_empty() {
        return;
    }
    let state = app.state::<AppState>();
    let Ok(mut host) = state.plugins.lock() else {
        return;
    };
    rollback_plugin_records(&mut host, records);
}

fn rollback_plugin_records(
    host: &mut crate::plugin::PluginHost,
    records: &[PluginInstallRollback],
) {
    for record in records.iter().rev() {
        if let Some(previous) = &record.previous {
            if host.install_2(previous).is_ok() {
                let _ = host.set_enabled(&record.id, record.enabled);
            }
        } else {
            let _ = host.uninstall(&record.id);
        }
    }
}

pub(crate) fn save_settings(
    app: &tauri::AppHandle,
    state: &AppState,
    next: Settings,
) -> Result<()> {
    let next = next;
    let settings_snapshot = next.clone();
    let strict = next.strict_markdown;
    let debug_mode = next.general.debug_mode;
    let extensions_enabled = next.general.extensions_enabled;
    let lua_hot_reload = next.general.debug_mode && next.general.lua_hot_reload;
    let lua_hot_reload_changed;
    let extensions_changed;
    let bridge_config_changed;

    {
        let mut current = state.settings.lock().unwrap();
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

        *current = next.clone();
        if let Err(e) = current.save() {
            *current = previous;
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
    if let Err(error) = crate::webview_security::configure(
        app,
        debug_mode,
        settings_snapshot.general.webview_default_shortcuts,
    ) {
        crate::debug_log!("[nota] WebView security update failed: {error}");
    }

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

#[cfg(test)]
mod tests {
    use super::merge_json;

    #[test]
    fn settings_patch_preserves_unmentioned_theme_fields() {
        let mut base = serde_json::json!({
            "document_theme": "ibm-document",
            "appearance": {
                "accent": "#0062ff",
                "dock_width": 320
            },
            "general": {
                "language": "zh-CN",
                "onboarding_seen": false
            }
        });
        merge_json(
            &mut base,
            serde_json::json!({
                "general": {
                    "onboarding_seen": true
                }
            }),
        );
        assert_eq!(base["document_theme"], "ibm-document");
        assert_eq!(base["appearance"]["accent"], "#0062ff");
        assert_eq!(base["appearance"]["dock_width"], 320);
        assert_eq!(base["general"]["language"], "zh-CN");
        assert_eq!(base["general"]["onboarding_seen"], true);
    }

    #[test]
    fn settings_patch_replaces_explicit_scalar_values() {
        let mut base = serde_json::json!({
            "appearance": { "ui_style": "adwaita" }
        });
        merge_json(
            &mut base,
            serde_json::json!({
                "appearance": { "ui_style": "macos" }
            }),
        );
        assert_eq!(base["appearance"]["ui_style"], "macos");
    }
}
