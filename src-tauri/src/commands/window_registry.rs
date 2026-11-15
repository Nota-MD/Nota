use tauri::{Manager, State};

use crate::error::{NotaError, Result};
use crate::window_registry::{RegistrySnapshot, TransferRequest, WindowRegistry};

#[tauri::command]
pub fn nota_window_registry_snapshot(registry: State<'_, WindowRegistry>) -> Result<RegistrySnapshot> {
    registry.snapshot()
}

#[tauri::command]
pub fn nota_window_picker_mode(registry: State<'_, WindowRegistry>, enabled: bool) -> Result<()> {
    registry.set_picker(enabled)
}

#[tauri::command]
pub async fn nota_window_transfer(
    registry: State<'_, WindowRegistry>,
    target_id: u32,
    path: Option<String>,
    text: Option<String>,
    title_hint: Option<String>,
    focus_target: bool,
) -> Result<()> {
    let registry = registry.inner().clone();
    tauri::async_runtime::spawn_blocking(move || {
        registry.transfer(target_id, path, text, title_hint, focus_target)
    })
    .await
    .map_err(|error| NotaError::other(format!("window transfer task failed: {error}")))?
}

#[tauri::command]
pub fn nota_window_take_transfer(
    registry: State<'_, WindowRegistry>,
) -> Result<Option<TransferRequest>> {
    registry.take_transfer()
}

#[tauri::command]
pub fn nota_window_ack_transfer(
    app: tauri::AppHandle,
    registry: State<'_, WindowRegistry>,
    request_id: String,
    ok: bool,
    error: Option<String>,
    focus: bool,
) -> Result<()> {
    registry.ack_transfer(&request_id, ok, error)?;
    if ok && focus {
        if let Some(window) = app.get_webview_window("main") {
            let _ = window.show();
            let _ = window.unminimize();
            let _ = window.set_focus();
        }
    }
    Ok(())
}

