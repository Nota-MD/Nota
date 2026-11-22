//! Commands for the active GFM table bridge.

use tauri::Manager;

use crate::error::{NotaError, Result};
use crate::state::AppState;
use crate::table_bridge::{TableAction, TableRender, TableSnapshot};

#[tauri::command]
pub async fn nota_table_snapshot_sync(
    app: tauri::AppHandle,
    snapshot: Option<TableSnapshot>,
) -> Result<()> {
    tauri::async_runtime::spawn_blocking(move || {
        let state = app.state::<AppState>();
        {
            let mut bridge = state.table_bridge.lock().unwrap();
            bridge.sync_snapshot(snapshot.clone());
        }
        if let Some(snapshot) = snapshot {
            let plugins = loop {
                let guard = state.plugins.lock().unwrap();
                if guard.is_ready() {
                    break guard;
                }
                drop(guard);
                std::thread::sleep(std::time::Duration::from_millis(10));
            };
            plugins.notify_table_snapshot(&snapshot);
        }
        Ok(())
    })
    .await
    .map_err(|error| NotaError::other(format!("table snapshot thread failed: {error}")))?
}

#[tauri::command]
pub async fn nota_table_actions(app: tauri::AppHandle) -> Result<Vec<TableAction>> {
    tauri::async_runtime::spawn_blocking(move || {
        let state = app.state::<AppState>();
        let plugins = loop {
            let guard = state.plugins.lock().unwrap();
            if guard.is_ready() {
                break guard;
            }
            drop(guard);
            std::thread::sleep(std::time::Duration::from_millis(10));
        };
        let actions = state.table_bridge.lock().unwrap().actions();
        Ok(actions
            .into_iter()
            .filter(|action| plugins.is_active(&action.plugin))
            .collect())
    })
    .await
    .map_err(|error| NotaError::other(format!("table action thread failed: {error}")))?
}

#[tauri::command]
pub async fn nota_table_renders(app: tauri::AppHandle) -> Result<Vec<TableRender>> {
    tauri::async_runtime::spawn_blocking(move || {
        let state = app.state::<AppState>();
        let renders = state.table_bridge.lock().unwrap().renders();
        Ok(renders)
    })
    .await
    .map_err(|error| NotaError::other(format!("table render thread failed: {error}")))?
}
