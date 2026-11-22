use std::path::PathBuf;

use tauri::State;

use crate::devserver::{self, DevServerState};
use crate::document::{DocId, Document, SelectionSnapshot};
use crate::error::{NotaError, Result};
use crate::state::AppState;
use crate::watch::FileWatcher;

#[tauri::command]
pub fn nota_doc_new(state: State<'_, AppState>) -> Result<DocId> {
    let line_ending = configured_line_ending(&state);
    let mut docs = state.documents.lock().unwrap();
    let id = docs.create_untitled();
    docs.set_line_ending(id, line_ending)?;
    Ok(id)
}

#[tauri::command]
pub fn nota_doc_new_with_text(
    state: State<'_, AppState>,
    text: String,
    title_hint: Option<String>,
) -> Result<DocId> {
    let use_configured_line_ending = text.is_empty();
    let line_ending = configured_line_ending(&state);
    let mut docs = state.documents.lock().unwrap();
    let id = docs.create_untitled_with_text(text, title_hint);
    if use_configured_line_ending {
        docs.set_line_ending(id, line_ending)?;
    }
    Ok(id)
}

fn configured_line_ending(state: &AppState) -> &'static str {
    match state.settings.lock().unwrap().editor.line_ending {
        crate::settings::editor::LineEnding::Crlf => "crlf",
        crate::settings::editor::LineEnding::Lf => "lf",
    }
}

#[tauri::command]
pub fn nota_doc_open(
    state: State<'_, AppState>,
    watcher: State<'_, FileWatcher>,
    path: String,
) -> Result<DocId> {
    let path_3 = PathBuf::from(path);
    let (id, text_2) = {
        let mut docs = state.documents.lock().unwrap();
        let id = docs.open(&path_3)?;
        let text_2 = docs.get(id).map(|d| d.text.clone()).unwrap_or_default();
        (id, text_2)
    };
    watcher.remember(&path_3, &text_2);

    if let Err(e) = crate::session::remember_recent_2(&path_3.to_string_lossy()) {
        crate::debug_log!("[nota] recent file not recorded: {e}");
    }
    crate::debug_log!(
        "[nota] document opened: id={} chars={} path={}",
        id.0,
        text_2.chars().count(),
        path_3.display()
    );
    Ok(id)
}

#[tauri::command]
pub fn nota_doc_sync(
    state: State<'_, AppState>,
    dev: State<'_, DevServerState>,
    id: DocId,
    text: String,
) -> Result<u64> {
    let revision = {
        let mut docs = state.documents.lock().unwrap();
        docs.sync(id, text.clone())?
    };
    push_preview(&dev, id, &text);
    Ok(revision)
}

#[tauri::command]
pub fn nota_doc_settle(
    state: State<'_, AppState>,
    dev: State<'_, DevServerState>,
    id: DocId,
    text: String,
) -> Result<u64> {
    let revision = {
        let mut docs = state.documents.lock().unwrap();
        docs.settle(id, text.clone())?
    };
    push_preview(&dev, id, &text);
    Ok(revision)
}

#[tauri::command]
pub fn nota_doc_cursor(
    state: State<'_, AppState>,
    id: DocId,
    text: String,
    empty: bool,
) -> Result<()> {
    let mut docs = state.documents.lock().unwrap();
    docs.save_selection(id, SelectionSnapshot { text, empty })
}

fn push_preview(dev: &DevServerState, id: DocId, text: &str) {
    devserver::refresh(dev, id, text);
}

#[tauri::command]
pub fn nota_doc_save(
    state: State<'_, AppState>,
    watcher: State<'_, FileWatcher>,
    id: DocId,
    path: Option<String>,
) -> Result<String> {
    let is_save_as = path.is_some();
    let (written, draft_id) = {
        let mut docs = state.documents.lock().unwrap();
        let written = docs.save(id, path.map(PathBuf::from))?;
        let draft_id = docs.get(id).map(|doc| doc.draft_id.clone());
        (written, draft_id)
    };
    if let Some(draft_id) = draft_id {
        if let Err(error) = crate::draft::delete(&draft_id) {
            crate::debug_log!("[nota] draft cleanup after save failed: {error}");
        }
    }

    let text_2 = crate::text_encoding::read_file(&written)
        .map(|(text, _)| text)
        .unwrap_or_default();
    watcher.remember(&written, &text_2);

    if is_save_as {
        if let Err(e) = crate::session::remember_recent_2(&written.to_string_lossy()) {
            crate::debug_log!("[nota] recent file not recorded: {e}");
        }
    }
    crate::debug_log!(
        "[nota] document saved: id={} chars={} save_as={} path={}",
        id.0,
        text_2.chars().count(),
        is_save_as,
        written.display()
    );
    crate::paths::path_to_string(&written)
}

#[tauri::command]
pub fn nota_doc_rename(state: State<'_, AppState>, id: DocId, name: String) -> Result<String> {
    let name_2 = clean_filename(&name)?;
    let old = old_path(&state, id)?;
    let service = old.parent().ok_or_else(|| {
        NotaError::other(format!(
            "Cannot move \"{}\": no parent directory",
            old.display()
        ))
    })?;
    let target_2 = service.join(name_2);
    move_to(&state, id, &old, target_2)
}

#[tauri::command]
pub fn nota_doc_move(state: State<'_, AppState>, id: DocId, dir: String) -> Result<String> {
    let old = old_path(&state, id)?;
    let name = old
        .file_name()
        .ok_or_else(|| {
            NotaError::other(format!("Cannot move \"{}\": no file name", old.display()))
        })?
        .to_os_string();
    let target_2 = PathBuf::from(dir).join(name);
    move_to(&state, id, &old, target_2)
}

fn old_path(state: &AppState, id: DocId) -> Result<PathBuf> {
    state
        .documents
        .lock()
        .unwrap()
        .get(id)
        .and_then(|d| d.path.clone())
        .ok_or_else(|| NotaError::other("Save the document before moving it"))
}

fn clean_filename(name_2: &str) -> Result<String> {
    let name_2 = name_2.trim();
    if name_2.is_empty() {
        return Err(NotaError::other("File names cannot be empty"));
    }
    if name_2.contains('/') || name_2.contains('\\') {
        return Err(NotaError::other(
            "File names cannot contain path separators; use Move to change folders",
        ));
    }
    if name_2 == "." || name_2 == ".." {
        return Err(NotaError::other("\".\" and \"..\" are not file names"));
    }
    Ok(name_2.to_owned())
}

fn move_to(
    state: &AppState,
    id: DocId,
    old: &std::path::Path,
    target_2: PathBuf,
) -> Result<String> {
    let new = {
        let mut docs = state.documents.lock().unwrap();
        docs.move_to_2(id, target_2.clone())?
    };

    let (old_text, new_text) = (
        old.to_string_lossy().into_owned(),
        new.to_string_lossy().into_owned(),
    );
    if let Err(e) = crate::session::replace_recent(&old_text, &new_text) {
        crate::debug_log!("[nota] recent list not updated after rename: {e}");
    }
    if let Err(e) = crate::table_width::replace_path(old, &new) {
        crate::debug_log!("[nota] table widths not updated after rename: {e}");
    }
    crate::paths::path_to_string(&new)
}

#[tauri::command]
pub fn nota_doc_close(state: State<'_, AppState>, id: DocId) -> Result<()> {
    let mut docs = state.documents.lock().unwrap();
    docs.close(id);
    Ok(())
}

#[tauri::command]
pub fn nota_doc_delete(state: State<'_, AppState>, id: DocId) -> Result<()> {
    let (path, draft_id) = {
        let docs = state.documents.lock().unwrap();
        let path = docs
            .get(id)
            .and_then(|doc| doc.path.clone())
            .ok_or_else(|| NotaError::other("The document has not been saved to disk"))?;
        let draft_id = docs.get(id).map(|doc| doc.draft_id.clone());
        (path, draft_id)
    };
    std::fs::remove_file(&path).map_err(|source| NotaError::Delete {
        path: path.clone(),
        source,
    })?;
    if let Ok(path_text) = crate::paths::path_to_string(&path) {
        if let Err(e) = crate::session::forget_recent(&path_text) {
            crate::debug_log!("[nota] recent list not updated after delete: {e}");
        }
    }
    if let Some(draft_id) = draft_id {
        if let Err(error) = crate::draft::delete(&draft_id) {
            crate::debug_log!("[nota] draft cleanup after delete failed: {error}");
        }
    }
    state.documents.lock().unwrap().close(id);
    Ok(())
}

#[tauri::command]
pub fn nota_doc_set_active(state: State<'_, AppState>, id: DocId) -> Result<()> {
    let mut docs = state.documents.lock().unwrap();
    docs.set_active(id)
}

#[tauri::command]
pub fn nota_doc_get(state: State<'_, AppState>, id: DocId) -> Result<Document> {
    let docs = state.documents.lock().unwrap();
    docs.get(id)
        .cloned()
        .ok_or_else(|| NotaError::other(format!("Document not found: {}", id.0)))
}

#[tauri::command]
pub fn nota_doc_list(state: State<'_, AppState>) -> Result<Vec<Document>> {
    let docs = state.documents.lock().unwrap();
    Ok(docs.list().to_vec())
}

#[tauri::command]
pub fn nota_doc_reload(
    state: State<'_, AppState>,
    watcher: State<'_, FileWatcher>,
    id: DocId,
) -> Result<Document> {
    let document_2 = {
        let mut docs = state.documents.lock().unwrap();
        docs.reload(id)?;
        docs.get(id)
            .cloned()
            .ok_or_else(|| NotaError::other(format!("Document not found: {}", id.0)))?
    };
    if let Some(draft_id) = state
        .documents
        .lock()
        .unwrap()
        .get(id)
        .map(|doc| doc.draft_id.clone())
    {
        if let Err(error) = crate::draft::delete(&draft_id) {
            crate::debug_log!("[nota] draft cleanup after reload failed: {error}");
        }
    }
    if let Some(path_3) = document_2.path.as_deref() {
        watcher.remember(path_3, &document_2.text);
    }
    Ok(document_2)
}

#[tauri::command]
pub fn nota_doc_disk_text(state: State<'_, AppState>, id: DocId) -> Result<String> {
    let path_3 = {
        let docs = state.documents.lock().unwrap();
        docs.get(id)
            .and_then(|d| d.path.clone())
            .ok_or_else(|| NotaError::other("The document has no path"))?
    };
    Ok(crate::text_encoding::read_file(&path_3)?.0)
}

#[tauri::command]
pub fn nota_doc_has_unsaved(state: State<'_, AppState>) -> Result<bool> {
    let docs = state.documents.lock().unwrap();
    Ok(docs.has_unsaved())
}
