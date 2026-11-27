use mlua::LuaSerdeExt;
use tauri::{Manager, State};

use crate::error::{NotaError, Result};
use crate::plugin::{PluginInfo, PluginMenuItem, PluginPanel, ReviewKind, ReviewState};
use crate::state::AppState;

fn plugin_lock<'a>(
    state: &'a AppState,
) -> Result<std::sync::MutexGuard<'a, crate::plugin::PluginHost>> {
    state.plugins.lock().map_err(|_| {
        NotaError::other("The extension host is unavailable after an earlier failure; restart Nota")
    })
}

fn plugin_guard<'a>(
    state: &'a AppState,
) -> Result<std::sync::MutexGuard<'a, crate::plugin::PluginHost>> {
    loop {
        let guard = plugin_lock(state)?;
        if guard.is_ready() {
            return Ok(guard);
        }
        drop(guard);
        std::thread::sleep(std::time::Duration::from_millis(10));
    }
}

#[tauri::command]
pub async fn nota_plugins_list(app: tauri::AppHandle) -> Result<Vec<PluginInfo>> {
    tauri::async_runtime::spawn_blocking(move || {
        let state = app.state::<AppState>();
        let host = plugin_guard(&state)?;
        Ok(host.list_info())
    })
    .await
    .map_err(|error| NotaError::other(format!("Could not read the extension list: {error}")))?
}

#[tauri::command]
pub async fn nota_plugin_set_enabled(
    app: tauri::AppHandle,
    id: String,
    enabled: bool,
) -> Result<()> {
    tauri::async_runtime::spawn_blocking(move || {
        let state = app.state::<AppState>();
        let mut host = plugin_lock(&state)?;
        host.set_enabled(&id, enabled)
    })
    .await
    .map_err(|error| {
        NotaError::other(format!(
            "Could not enable or disable the extension: {error}"
        ))
    })?
}

#[tauri::command]
pub async fn nota_plugin_install(app: tauri::AppHandle, path: String) -> Result<String> {
    tauri::async_runtime::spawn_blocking(move || {
        let state = app.state::<AppState>();
        let mut host = plugin_lock(&state)?;
        host.install_2(std::path::Path::new(&path))
    })
    .await
    .map_err(|error| NotaError::other(format!("Could not install the extension: {error}")))?
}

#[tauri::command]
pub async fn nota_plugin_uninstall(app: tauri::AppHandle, id: String) -> Result<()> {
    tauri::async_runtime::spawn_blocking(move || {
        let state = app.state::<AppState>();
        let mut host = plugin_lock(&state)?;
        host.uninstall(&id)
    })
    .await
    .map_err(|error| NotaError::other(format!("Could not uninstall the extension: {error}")))?
}

#[tauri::command]
pub fn nota_plugin_trust(state: State<'_, AppState>, id: String) -> Result<()> {
    let mut host = plugin_lock(&state)?;
    host.trust_2(&id)
}

#[tauri::command]
pub async fn nota_plugin_export(
    app: tauri::AppHandle,
    id: String,
    path: String,
) -> Result<crate::plugin::export::ExportReport> {
    tauri::async_runtime::spawn_blocking(move || {
        let state = app.state::<AppState>();
        let host = plugin_lock(&state)?;
        host.export_2(&id, std::path::Path::new(&path))
    })
    .await
    .map_err(|error| NotaError::other(format!("Could not export the extension: {error}")))?
}

#[tauri::command]
pub async fn nota_plugin_export_name(app: tauri::AppHandle, id: String) -> Result<String> {
    tauri::async_runtime::spawn_blocking(move || {
        let state = app.state::<AppState>();
        let host = plugin_guard(&state)?;
        host.default_export_name(&id)
    })
    .await
    .map_err(|error| {
        NotaError::other(format!("Could not read the extension export name: {error}"))
    })?
}

#[tauri::command]
pub fn nota_plugins_open_dir(app: tauri::AppHandle) -> Result<String> {
    use tauri_plugin_opener::OpenerExt;
    let dir = crate::paths::user_plugins_dir()?;
    if !dir.is_dir() {
        crate::paths::ensure_dir(&dir)?;
    }
    let shown = crate::paths::path_to_string(&dir)?;
    app.opener()
        .open_path(shown.clone(), None::<&str>)
        .map_err(|error| {
            NotaError::other(format!("Could not open the directory {shown}: {error}"))
        })?;
    Ok(shown)
}

#[tauri::command]
pub fn nota_plugin_setting_set(
    app: tauri::AppHandle,
    plugin: String,
    key: String,
    value: serde_json::Value,
) -> Result<()> {
    use tauri::Emitter;

    let declaration_2 = {
        let state = app.state::<AppState>();
        let host = plugin_lock(&state)?;
        let p = host
            .get(&plugin)
            .ok_or_else(|| NotaError::other(format!("Extension not found: {plugin}")))?;
        p.manifest
            .settings
            .iter()
            .find(|s| s.key == key)
            .cloned()
            .ok_or_else(|| {
                NotaError::other(format!(
                    "Extension {plugin} does not declare setting `{key}` in its manifest (see `[[settings]]` in docs/11)"
                ))
            })?
    };

    let receive_3 = declaration_2.receive_value(&value)?;
    crate::lua::api::settings::host_write_one(&plugin, &key, receive_3)?;

    if !declaration_2.change_command.is_empty() {
        let state = app.state::<AppState>();
        let host = plugin_lock(&state)?;
        let extension = host
            .get(&plugin)
            .ok_or_else(|| NotaError::other(format!("Extension not found: {plugin}")))?;
        let lua_args = extension
            .lua
            .to_value(&serde_json::json!({ "value": value }))
            .map_err(|error| {
                NotaError::other(format!(
                    "Could not convert the setting value to Lua: {error}"
                ))
            })?;
        host.call_command(
            &extension.manifest.meta.id,
            &declaration_2.change_command,
            lua_args,
        )?;
    }

    app.emit(
        crate::plugin::EVENT_PANEL_DIRTY,
        serde_json::json!({ "plugin": plugin, "id": serde_json::Value::Null }),
    )
    .map_err(|error| {
        NotaError::other(format!("Could not emit the panel refresh event: {error}"))
    })?;

    Ok(())
}

#[tauri::command]
pub async fn nota_plugin_trust_list(
    app: tauri::AppHandle,
) -> Result<Vec<crate::plugin::TrustRecord>> {
    tauri::async_runtime::spawn_blocking(move || {
        let state = app.state::<AppState>();
        let host = plugin_guard(&state)?;
        Ok(host.trust_records())
    })
    .await
    .map_err(|error| {
        NotaError::other(format!("Could not read the extension trust list: {error}"))
    })?
}

#[tauri::command]
pub async fn nota_plugin_updates(
    app: tauri::AppHandle,
) -> Result<Vec<crate::plugin::updater::PluginUpdateStatus>> {
    let sources = {
        let state = app.state::<AppState>();
        let host = plugin_lock(&state)?;
        crate::plugin::updater::sources(&host)
    };
    let replacements_2 = {
        let state = app.state::<AppState>();
        state
            .settings
            .lock()
            .map(|s| s.download.replacements.clone())
            .unwrap_or_default()
    };
    tauri::async_runtime::spawn_blocking(move || {
        crate::plugin::updater::check_updates(&sources, &replacements_2)
    })
    .await
    .map_err(|error| NotaError::other(format!("Could not check for extension updates: {error}")))
}

#[tauri::command]
pub async fn nota_plugin_update(
    app: tauri::AppHandle,
    id: String,
) -> Result<crate::plugin::updater::PluginUpdateResult> {
    let source = {
        let state = app.state::<AppState>();
        let host = plugin_lock(&state)?;
        crate::plugin::updater::sources(&host)
            .into_iter()
            .find(|source| source.id == id)
            .ok_or_else(|| {
                NotaError::other(format!(
                    "Extension {id} does not declare an update repository"
                ))
            })?
    };
    let replacements_2 = {
        let state = app.state::<AppState>();
        state
            .settings
            .lock()
            .map(|s| s.download.replacements.clone())
            .unwrap_or_default()
    };
    let prepared = tauri::async_runtime::spawn_blocking(move || {
        crate::plugin::updater::prepare_update(&source, &replacements_2)
    })
    .await
    .map_err(|error| {
        NotaError::other(format!("Could not download the extension update: {error}"))
    })??;

    tauri::async_runtime::spawn_blocking(move || {
        let state = app.state::<AppState>();
        let mut host = plugin_lock(&state)?;
        crate::plugin::updater::install_update(&mut host, prepared)
    })
    .await
    .map_err(|error| NotaError::other(format!("Could not install the extension update: {error}")))?
}

#[tauri::command]
pub async fn nota_plugin_call(
    app: tauri::AppHandle,
    plugin: String,
    command: String,
    args: Option<serde_json::Value>,
) -> Result<serde_json::Value> {
    tauri::async_runtime::spawn_blocking(move || {
        let state = app.state::<AppState>();
        let host = plugin_lock(&state)?;

        let plug = host
            .get(&plugin)
            .ok_or_else(|| NotaError::other(format!("Extension not found: {plugin}")))?;

        let lua_args = match args {
            Some(v) => plug.lua.to_value(&v).map_err(|error| {
                NotaError::other(format!("Could not convert arguments to Lua: {error}"))
            })?,
            None => mlua::Value::Nil,
        };

        let result = host.call_command(&plug.manifest.meta.id, &command, lua_args)?;

        plug.lua
            .from_value::<serde_json::Value>(result)
            .map_err(|error| {
                NotaError::other(format!(
                    "Could not convert the return value to JSON: {error}"
                ))
            })
    })
    .await
    .map_err(|error| NotaError::other(format!("Could not run the extension command: {error}")))?
}

#[tauri::command]
pub async fn nota_plugin_panel_content(
    app: tauri::AppHandle,
    plugin: String,
    id: String,
) -> Result<serde_json::Value> {
    tauri::async_runtime::spawn_blocking(move || -> Result<serde_json::Value> {
        let state = app.state::<AppState>();
        let mut content_2 = {
            let host = plugin_lock(&state)?;
            host.panel_content(&plugin, &id)?
        };
        crate::lua::api::devserver::field_frame(&app, &plugin, &mut content_2);
        Ok(content_2)
    })
    .await
    .map_err(|error| NotaError::other(format!("Could not render the extension panel: {error}")))?
}

#[tauri::command]
pub fn nota_plugin_review(review: State<'_, ReviewState>) -> Result<Option<PluginReview>> {
    Ok(review
        .current()
        .map(|(plugin, kind)| PluginReview { plugin, kind }))
}

#[tauri::command]
pub fn nota_plugin_review_open(app: tauri::AppHandle, plugin: String, id: String) -> Result<()> {
    use tauri::Emitter;

    app.state::<ReviewState>()
        .set(&plugin, Some(ReviewKind::Panel { panel: id }));
    app.emit(crate::plugin::EVENT_REVIEW, serde_json::json!({}))
        .map_err(|error| NotaError::other(format!("Could not emit the preview event: {error}")))?;
    Ok(())
}

#[tauri::command]
pub fn nota_plugin_review_close(app: tauri::AppHandle, plugin: String) -> Result<()> {
    use tauri::Emitter;
    app.state::<ReviewState>().set(&plugin, None);
    app.emit(crate::plugin::EVENT_REVIEW, serde_json::json!({}))
        .map_err(|error| NotaError::other(format!("Could not emit the preview event: {error}")))?;
    Ok(())
}

#[derive(serde::Serialize)]
pub struct PluginReview {
    pub plugin: String,
    #[serde(flatten)]
    pub kind: crate::plugin::ReviewKind,
}

#[tauri::command]
pub fn nota_plugin_find_command(
    state: State<'_, AppState>,
    command: String,
) -> Result<Option<String>> {
    let host = plugin_lock(&state)?;
    Ok(host.find_command_owner(&command).map(str::to_owned))
}

#[tauri::command]
pub async fn nota_plugin_panels(app: tauri::AppHandle) -> Result<Vec<PluginPanel>> {
    tauri::async_runtime::spawn_blocking(move || {
        let state = app.state::<AppState>();
        let host = plugin_guard(&state)?;
        Ok(host.panels())
    })
    .await
    .map_err(|error| NotaError::other(format!("Could not read extension panels: {error}")))?
}

#[tauri::command]
pub async fn nota_plugin_menus(app: tauri::AppHandle) -> Result<Vec<PluginMenuItem>> {
    tauri::async_runtime::spawn_blocking(move || {
        let state = app.state::<AppState>();
        let host = plugin_guard(&state)?;
        Ok(host.menus())
    })
    .await
    .map_err(|error| NotaError::other(format!("Could not read extension menus: {error}")))?
}
