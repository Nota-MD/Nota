use tauri::{Emitter, State};

use crate::error::Result;
use crate::focus::{self, FocusSnapshot, FocusState};
use crate::state::AppState;

fn broadcast(app: &tauri::AppHandle, status_2: &FocusSnapshot) {
    let _ = app.emit(focus::EVENT_FOCUS, status_2);
}

#[tauri::command]
pub fn nota_focus_get(focus_2: State<'_, FocusState>) -> FocusSnapshot {
    focus::now(&focus_2)
}

#[tauri::command]
pub fn nota_focus_start(
    app: tauri::AppHandle,
    focus_2: State<'_, FocusState>,
    app_2: State<'_, AppState>,
) -> Result<FocusSnapshot> {
    let settings_2 = {
        let g = app_2
            .settings
            .lock()
            .map_err(|_| crate::error::NotaError::Config("The settings lock is poisoned".into()))?;
        g.focus.clone()
    };
    let snapshot_2 = focus::start_2(&focus_2, &settings_2);
    broadcast(&app, &snapshot_2);
    Ok(snapshot_2)
}

#[tauri::command]
pub fn nota_focus_stop(
    app: tauri::AppHandle,
    focus_2: State<'_, FocusState>,
) -> Result<FocusSnapshot> {
    let snapshot_2 = focus::stop_2(&focus_2);
    broadcast(&app, &snapshot_2);
    Ok(snapshot_2)
}

#[tauri::command]
pub fn nota_focus_ack(
    app: tauri::AppHandle,
    focus_2: State<'_, FocusState>,
) -> Result<FocusSnapshot> {
    let snapshot_2 = focus::confirm(&focus_2);
    broadcast(&app, &snapshot_2);
    Ok(snapshot_2)
}

#[tauri::command]
pub fn nota_focus_beep() {
    focus::alarm::system_beep();
}

#[tauri::command]
pub fn nota_focus_close_alarm(app: tauri::AppHandle) {
    focus::alarm::close_window(&app);
}
