use std::path::PathBuf;

use serde::Serialize;

use crate::error::Result;
use crate::session;

#[derive(Debug, Clone, Serialize)]
pub struct SessionView {
    pub open: Vec<String>,

    pub active: Option<String>,

    pub recent: Vec<String>,

    pub scroll: std::collections::BTreeMap<String, f64>,

    pub workspace: Option<String>,

    pub file: Option<String>,
}

fn is_file_2(p: &str) -> bool {
    std::fs::metadata(p).map(|m| m.is_file()).unwrap_or(false)
}

fn is_directory(p: &str) -> bool {
    std::fs::metadata(p).map(|m| m.is_dir()).unwrap_or(false)
}

#[tauri::command]
pub fn nota_session_get() -> Result<SessionView> {
    let mut session_2 = session::read_2();
    session::remove_missing(&mut session_2, is_file_2);
    Ok(SessionView {
        open: session_2.open,
        active: session_2.active,
        recent: session_2.recent,
        scroll: session_2.scroll,

        workspace: session_2.workspace.filter(|p| is_directory(p)),
        file: session::target_3().map(|p| p.to_string_lossy().into_owned()),
    })
}

#[tauri::command]
pub fn nota_session_set_open(open: Vec<String>, active: Option<String>) -> Result<()> {
    session::save_session(open, active).map_err(crate::error::NotaError::other)
}

#[tauri::command]
pub fn nota_session_set_scroll(path: String, ratio: f64) -> Result<()> {
    session::save_scroll(&path, ratio).map_err(crate::error::NotaError::other)
}

#[tauri::command]
pub fn nota_session_forget_recent(path: String) -> Result<()> {
    session::forget_recent(&path).map_err(crate::error::NotaError::other)
}

#[tauri::command]
pub fn nota_session_clear() -> Result<()> {
    let workspace_2 = session::read_2().workspace;
    session::write_2(&session::SessionState {
        workspace: workspace_2,
        ..Default::default()
    })
    .map_err(crate::error::NotaError::other)
}

#[tauri::command]
pub fn nota_session_file() -> Result<Option<String>> {
    Ok(session::target_3().map(|p: PathBuf| p.to_string_lossy().into_owned()))
}
