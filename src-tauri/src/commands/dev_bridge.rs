use serde_json::Value;
use tauri::State;

use crate::dev_bridge::{BridgeStatus, DevBridge};
use crate::error::{NotaError, Result};
use crate::state::AppState;

fn status_from(state: &AppState, bridge: &DevBridge) -> BridgeStatus {
    let general = state.settings.lock().unwrap().general.clone();
    let mut status = bridge.status();
    status.port = general.dev_bridge_port;
    status.whitelist = general.dev_bridge_whitelist;
    status
}

#[tauri::command]
pub fn nota_dev_bridge_status(
    state: State<'_, AppState>,
    bridge: State<'_, DevBridge>,
) -> BridgeStatus {
    status_from(&state, &bridge)
}

#[tauri::command]
pub fn nota_dev_bridge_enable(
    app: tauri::AppHandle,
    state: State<'_, AppState>,
    bridge: State<'_, DevBridge>,
    password: Option<String>,
    port: u16,
    whitelist: Vec<String>,
    enabled: bool,
) -> Result<BridgeStatus> {
    if enabled && !state.settings.lock().unwrap().general.debug_mode {
        return Err(NotaError::other(
            "Developer mode must be enabled before starting the developer bridge",
        ));
    }
    let next_whitelist = whitelist
        .into_iter()
        .map(|value| value.trim().to_owned())
        .filter(|value| !value.is_empty())
        .collect::<Vec<_>>();
    if enabled {
        bridge.configure(&app, password.as_deref(), &next_whitelist, port)?;
    } else {
        bridge.stop();
    }

    let mut guard = state.settings.lock().unwrap();
    let previous = guard.clone();
    guard.general.dev_bridge_enabled = enabled;
    guard.general.dev_bridge_port = port;
    guard.general.dev_bridge_whitelist = next_whitelist;
    if let Err(error) = guard.save() {
        *guard = previous;
        bridge.stop();
        return Err(NotaError::other(error.to_string()));
    }
    drop(guard);
    Ok(status_from(&state, &bridge))
}

#[tauri::command]
pub fn nota_dev_bridge_disable(
    _app: tauri::AppHandle,
    state: State<'_, AppState>,
    bridge: State<'_, DevBridge>,
) -> Result<BridgeStatus> {
    bridge.stop();
    let mut guard = state.settings.lock().unwrap();
    let previous = guard.clone();
    guard.general.dev_bridge_enabled = false;
    if let Err(error) = guard.save() {
        *guard = previous;
        return Err(NotaError::other(error.to_string()));
    }
    drop(guard);
    Ok(status_from(&state, &bridge))
}

#[tauri::command]
pub fn nota_dev_bridge_revoke(
    state: State<'_, AppState>,
    bridge: State<'_, DevBridge>,
) -> BridgeStatus {
    bridge.revoke_sessions();
    status_from(&state, &bridge)
}

#[tauri::command]
pub fn nota_dev_bridge_respond(
    bridge: State<'_, DevBridge>,
    request_id: String,
    result: Option<Value>,
    error: Option<String>,
) -> bool {
    bridge.respond(&request_id, result, error)
}
