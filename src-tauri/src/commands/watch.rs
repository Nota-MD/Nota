use std::path::PathBuf;

use serde::Deserialize;
use tauri::State;

use crate::document::DocId;
use crate::error::Result;
use crate::watch::FileWatcher;

#[derive(Debug, Clone, Deserialize)]
pub struct WatchedDocument {
    pub id: DocId,
    pub path: String,
}

#[tauri::command]
pub fn nota_watch_sync(watcher: State<'_, FileWatcher>, docs: Vec<WatchedDocument>) -> Result<()> {
    let files: Vec<(DocId, PathBuf)> = docs
        .into_iter()
        .map(|document| (document.id, PathBuf::from(document.path)))
        .collect();
    watcher.sync(&files);
    Ok(())
}
