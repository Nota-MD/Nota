//! 文档相关命令。

use std::path::PathBuf;

use tauri::State;

use crate::document::{DocId, Document};
use crate::error::{NotaError, Result};
use crate::state::AppState;

/// 新建一份空文档。
#[tauri::command]
pub fn nota_doc_new(state: State<'_, AppState>) -> Result<DocId> {
    let mut docs = state.documents.lock().unwrap();
    Ok(docs.create_untitled())
}

/// 打开一个文件。**已打开就复用**（不重复开标签），并把活动标签切过去。
#[tauri::command]
pub fn nota_doc_open(state: State<'_, AppState>, path: String) -> Result<DocId> {
    let mut docs = state.documents.lock().unwrap();
    docs.open(&PathBuf::from(path))
}

/// 前端推来新文本。返回新的 revision。
///
/// 前端**去抖 300ms** 调一次（见 `docs/03` §真相在哪），存盘/插件读文档前会强制再调一次。
#[tauri::command]
pub fn nota_doc_sync(state: State<'_, AppState>, id: DocId, text: String) -> Result<u64> {
    let mut docs = state.documents.lock().unwrap();
    docs.sync(id, text)
}

/// 编辑器**装载完之后**把文本交回来认领。
///
/// ⚠️ 这是 `sync` 的兄弟，但语义完全不同：`sync` 是"用户改了"，
/// 本命令是"编辑器把文件规范化成了这个样子、用户还没碰呢"。
/// 混用会让 `dirty` 说谎（要么打开就脏、要么改完不脏）。见 `DocumentStore::settle`。
#[tauri::command]
pub fn nota_doc_settle(state: State<'_, AppState>, id: DocId, text: String) -> Result<u64> {
    let mut docs = state.documents.lock().unwrap();
    docs.settle(id, text)
}

/// 存盘。`path` 给了就是「另存为」。返回最终落盘路径。
#[tauri::command]
pub fn nota_doc_save(
    state: State<'_, AppState>,
    id: DocId,
    path: Option<String>,
) -> Result<String> {
    let mut docs = state.documents.lock().unwrap();
    let written = docs.save(id, path.map(PathBuf::from))?;
    crate::paths::path_to_string(&written)
}

/// 关掉一份文档。**不做未保存询问**——那是前端的事（它才知道用户点了什么）。
#[tauri::command]
pub fn nota_doc_close(state: State<'_, AppState>, id: DocId) -> Result<()> {
    let mut docs = state.documents.lock().unwrap();
    docs.close(id);
    Ok(())
}

/// 切换活动文档。
#[tauri::command]
pub fn nota_doc_set_active(state: State<'_, AppState>, id: DocId) -> Result<()> {
    let mut docs = state.documents.lock().unwrap();
    docs.set_active(id)
}

/// 取一份文档的当前状态。
#[tauri::command]
pub fn nota_doc_get(state: State<'_, AppState>, id: DocId) -> Result<Document> {
    let docs = state.documents.lock().unwrap();
    docs.get(id)
        .cloned()
        .ok_or_else(|| NotaError::other(format!("没有这份文档：{}", id.0)))
}

/// 列出所有打开的文档。
#[tauri::command]
pub fn nota_doc_list(state: State<'_, AppState>) -> Result<Vec<Document>> {
    let docs = state.documents.lock().unwrap();
    Ok(docs.list().to_vec())
}

/// 磁盘内容变了，重读一遍（外部改动 / 用户放弃修改）。
#[tauri::command]
pub fn nota_doc_reload(state: State<'_, AppState>, id: DocId) -> Result<Document> {
    let mut docs = state.documents.lock().unwrap();
    docs.reload(id)?;
    docs.get(id)
        .cloned()
        .ok_or_else(|| NotaError::other(format!("没有这份文档：{}", id.0)))
}

/// 有没有未保存的改动。退出前前端拿它决定要不要弹框。
#[tauri::command]
pub fn nota_doc_has_unsaved(state: State<'_, AppState>) -> Result<bool> {
    let docs = state.documents.lock().unwrap();
    Ok(docs.has_unsaved())
}
