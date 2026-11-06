//! Commands for recovery copies that stay outside the user's source files.

use tauri::State;

use crate::document::DocId;
use crate::draft::{self, Draft, DraftInfo};
use crate::error::{NotaError, Result};
use crate::state::AppState;

/// Persist the current editor body if it differs from the clean source body.
///
/// Returns `true` when a draft was written and `false` when the editor is back
/// at the clean body (in which case any older draft is removed).
#[tauri::command]
pub fn nota_draft_save(state: State<'_, AppState>, id: DocId, text: String) -> Result<bool> {
    let snapshot = {
        let docs = state.documents.lock().unwrap();
        let doc = docs
            .get(id)
            .ok_or_else(|| NotaError::other("That document is no longer open"))?;
        if text == doc.clean_text {
            None
        } else {
            Some(Draft {
                version: 1,
                id: doc.draft_id.clone(),
                path: doc.path_string(),
                title: doc.title.clone(),
                text,
                encoding: doc.encoding.clone(),
                line_ending: doc.line_ending.clone(),
                updated_at: draft::updated_at(),
            })
        }
    };

    match snapshot {
        Some(value) => {
            draft::save(value)?;
            Ok(true)
        }
        None => {
            let draft_id = {
                let docs = state.documents.lock().unwrap();
                docs.get(id).map(|doc| doc.draft_id.clone())
            };
            if let Some(draft_id) = draft_id {
                draft::delete(&draft_id)?;
            }
            Ok(false)
        }
    }
}

/// List recovery copies that are not already represented by an open tab.
#[tauri::command]
pub fn nota_draft_list(state: State<'_, AppState>) -> Result<Vec<DraftInfo>> {
    let open = {
        let docs = state.documents.lock().unwrap();
        docs.list()
            .iter()
            .map(|doc| doc.draft_id.clone())
            .collect::<std::collections::HashSet<_>>()
    };
    let mut drafts = draft::list()?;
    drafts.retain(|item| !open.contains(&item.id));
    let mut seen_paths = std::collections::HashSet::new();
    drafts.retain(|item| match item.path.as_ref() {
        Some(path) => seen_paths.insert(path.clone()),
        None => true,
    });
    Ok(drafts)
}

/// Restore one draft as an open document without touching its source path.
#[tauri::command]
pub fn nota_draft_restore(state: State<'_, AppState>, id: String) -> Result<DocId> {
    let value = draft::read(&id)?
        .ok_or_else(|| NotaError::other("That recovery copy no longer exists"))?;
    let mut docs = state.documents.lock().unwrap();
    let document_id = docs.restore_draft(&value)?;
    if docs.get(document_id).is_some_and(|doc| !doc.dirty) {
        draft::delete(&id)?;
    }
    Ok(document_id)
}

/// Forget one recovery copy.
#[tauri::command]
pub fn nota_draft_discard(id: String) -> Result<()> {
    draft::delete(&id)
}

/// Forget the recovery copy belonging to an open document.
#[tauri::command]
pub fn nota_draft_discard_document(state: State<'_, AppState>, id: DocId) -> Result<()> {
    let draft_id = {
        let docs = state.documents.lock().unwrap();
        docs.get(id).map(|doc| doc.draft_id.clone())
    };
    if let Some(draft_id) = draft_id {
        draft::delete(&draft_id)?;
    }
    Ok(())
}
