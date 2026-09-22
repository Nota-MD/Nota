//! `nota.document` —— 读写当前文档。
//!
//! 读的方法要 `document.read`，写的要 `document.write`；两者各自装表，
//! 只申请了读的插件拿到的 `nota.document` 上**没有** `set_text` 这一格。
//!
//! # 写完之后发生了什么
//!
//! `set_text` / `insert_text` 改的是后端镜像，**前端编辑器不会自己知道**。
//! 所以每次写完都往 `nota:document-changed` 发一条事件，前端收到就把编辑器内容
//! 换掉、光标落到合理位置。这条链路见 `docs/05-editor-bridge.md`。
//!
//! ⚠️ 写操作是**整篇替换**语义。插件想"在光标处插一段"目前只能拿到全文自己拼——
//! 精细的选区/位置 API 排在后面的轮次（`docs/07` 第 14 项）。

use mlua::{Lua, Table};

use super::{lua_err, mlua_to_nota};
use crate::error::NotaError;
use crate::lua::HostContext;
use crate::plugin::manifest::{Capability, Manifest};

pub fn build(lua: &Lua, manifest: &Manifest, ctx: &HostContext) -> Result<Table, NotaError> {
    let t = lua.create_table().map_err(mlua_to_nota)?;
    let can_read = manifest.has(Capability::DocumentRead);
    let can_write = manifest.has(Capability::DocumentWrite);

    // ── 读 ────────────────────────────────────────────────────────────────
    if can_read {
        let docs = ctx.documents.clone();
        let get_text = lua
            .create_function(move |_, ()| {
                let store = docs.lock().unwrap();
                Ok(store
                    .active()
                    .map(|d| d.text.clone())
                    .unwrap_or_default())
            })
            .map_err(mlua_to_nota)?;
        t.set("get_text", get_text).map_err(mlua_to_nota)?;

        let docs = ctx.documents.clone();
        let get_path = lua
            .create_function(move |_, ()| {
                let store = docs.lock().unwrap();
                Ok(store.active().and_then(|d| d.path_string()))
            })
            .map_err(mlua_to_nota)?;
        t.set("get_path", get_path).map_err(mlua_to_nota)?;

        let docs = ctx.documents.clone();
        let get_title = lua
            .create_function(move |_, ()| {
                let store = docs.lock().unwrap();
                Ok(store.active().map(|d| d.title.clone()).unwrap_or_default())
            })
            .map_err(mlua_to_nota)?;
        t.set("get_title", get_title).map_err(mlua_to_nota)?;

        let docs = ctx.documents.clone();
        let get_revision = lua
            .create_function(move |_, ()| {
                let store = docs.lock().unwrap();
                Ok(store.active().map(|d| d.revision).unwrap_or(0))
            })
            .map_err(mlua_to_nota)?;
        t.set("get_revision", get_revision).map_err(mlua_to_nota)?;

        let docs = ctx.documents.clone();
        let is_dirty = lua
            .create_function(move |_, ()| {
                let store = docs.lock().unwrap();
                Ok(store.active().map(|d| d.dirty).unwrap_or(false))
            })
            .map_err(mlua_to_nota)?;
        t.set("is_dirty", is_dirty).map_err(mlua_to_nota)?;
    }

    // ── 写 ────────────────────────────────────────────────────────────────
    if can_write {
        let docs = ctx.documents.clone();
        let app = ctx.app.clone();
        let set_text = lua
            .create_function(move |_, text: String| {
                let mut store = docs.lock().unwrap();
                let id = store
                    .active_id()
                    .ok_or_else(|| lua_err(NotaError::NoActiveDocument))?;
                store.sync(id, text.clone()).map_err(lua_err)?;
                drop(store);

                emit_changed(&app, id, &text);
                Ok(())
            })
            .map_err(mlua_to_nota)?;
        t.set("set_text", set_text).map_err(mlua_to_nota)?;

        let docs = ctx.documents.clone();
        let app = ctx.app.clone();
        let append_text = lua
            .create_function(move |_, tail: String| {
                let mut store = docs.lock().unwrap();
                let id = store
                    .active_id()
                    .ok_or_else(|| lua_err(NotaError::NoActiveDocument))?;
                let mut text = store.active().map(|d| d.text.clone()).unwrap_or_default();
                text.push_str(&tail);
                store.sync(id, text.clone()).map_err(lua_err)?;
                drop(store);

                emit_changed(&app, id, &text);
                Ok(())
            })
            .map_err(mlua_to_nota)?;
        t.set("append_text", append_text).map_err(mlua_to_nota)?;
    }

    Ok(t)
}

/// 把"文档被插件改了"告诉前端。
///
/// 事件名与宿主自己的 `nota:document-changed` 一致——**前端不必区分**
/// 是插件改的还是别处改的，反正都是"后端这份跟你的不一致了，来拿"。
fn emit_changed(app: &tauri::AppHandle, id: crate::document::DocId, text: &str) {
    use tauri::Emitter;
    let _ = app.emit(
        "nota:document-changed",
        serde_json::json!({
            "id": id.0,
            "text": text,
            "origin": "plugin",
        }),
    );
}
