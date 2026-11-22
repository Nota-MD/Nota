use mlua::{Lua, Table};
use regex::Regex;
use std::sync::LazyLock;

use super::{lua_err, mlua_to_nota};
use crate::error::NotaError;
use crate::lua::HostContext;
use crate::plugin::manifest::{Capability, Manifest};

pub fn build(lua: &Lua, manifest: &Manifest, ctx: &HostContext) -> Result<Table, NotaError> {
    let t = lua.create_table().map_err(mlua_to_nota)?;
    let can_read = manifest.has(Capability::DocumentRead);
    let can_write = manifest.has(Capability::DocumentWrite);

    if can_read {
        let docs = ctx.documents.clone();
        let get_text = lua
            .create_function(move |_, ()| {
                let store = docs.lock().unwrap();
                Ok(store.active().map(|d| d.text.clone()).unwrap_or_default())
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

        let docs = ctx.documents.clone();
        let stats = lua
            .create_function(move |lua, ()| {
                let store = docs.lock().unwrap();

                let (text_2, ban_ben, path_3) = match store.active() {
                    Some(d) => (d.text.clone(), d.revision, d.path_string()),
                    None => (String::new(), 0, None),
                };
                drop(store);

                let t = lua.create_table()?;

                t.set("chars", text_2.chars().count())?;

                t.set("words", word_count(&text_2))?;
                t.set(
                    "lines",
                    if text_2.is_empty() {
                        0
                    } else {
                        text_2.split('\n').count()
                    },
                )?;
                t.set("revision", ban_ben)?;
                t.set("path", path_3)?;
                t.set("clock_ms", dan_diao_hao_miao())?;
                Ok(t)
            })
            .map_err(mlua_to_nota)?;
        t.set("stats", stats).map_err(mlua_to_nota)?;

        let docs = ctx.documents.clone();
        let get_selection = lua
            .create_function(move |lua, ()| {
                let store = docs.lock().unwrap();
                let Some(d) = store.active() else {
                    return Ok(mlua::Value::Nil);
                };
                let Some(snapshot_2) = d.xuan_qu.as_ref() else {
                    return Ok(mlua::Value::Nil);
                };
                let t = lua.create_table()?;
                t.set("text", snapshot_2.text.clone())?;

                t.set("empty", snapshot_2.empty)?;
                Ok(mlua::Value::Table(t))
            })
            .map_err(mlua_to_nota)?;
        t.set("get_selection", get_selection)
            .map_err(mlua_to_nota)?;
    }

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

        let docs = ctx.documents.clone();
        let app = ctx.app.clone();
        let insert_at_cursor = lua
            .create_function(move |_, text: String| {
                if text.is_empty() {
                    return Ok(false);
                }

                let id = {
                    let store = docs.lock().unwrap();
                    match store.active_id() {
                        Some(id) => id,
                        None => return Ok(false),
                    }
                };
                emit_edit(&app, id, &text);
                Ok(true)
            })
            .map_err(mlua_to_nota)?;
        t.set("insert_at_cursor", insert_at_cursor)
            .map_err(mlua_to_nota)?;
    }

    Ok(t)
}

fn dan_diao_hao_miao() -> u64 {
    static QI_DIAN: std::sync::OnceLock<std::time::Instant> = std::sync::OnceLock::new();

    QI_DIAN
        .get_or_init(std::time::Instant::now)
        .elapsed()
        .as_millis() as u64
}

fn word_count(text: &str) -> usize {
    static CJK: LazyLock<Regex> = LazyLock::new(|| {
        Regex::new(r"[\x{3040}-\x{ABFF}\x{D7A4}-\x{FAFF}]").expect("valid CJK word range")
    });
    static APOSTROPHE_WORD: LazyLock<Regex> = LazyLock::new(|| {
        Regex::new("['\u{2019}][A-Za-z0-9_]+").expect("valid apostrophe word pattern")
    });
    static STANDALONE_PUNCTUATION: LazyLock<Regex> = LazyLock::new(|| {
        Regex::new(
            r"(?m)(^|\s+)[\u{3000}-\u{303F}\x{21}-\x{2F}\x{3A}-\x{40}\x{5B}-\x{60}\x{7B}-\x{7E}]+(\s+|$)",
        )
        .expect("valid standalone punctuation pattern")
    });
    static WORD_SEPARATOR: LazyLock<Regex> = LazyLock::new(|| {
        Regex::new(r"[\u{3000}-\u{303F}\s\x{21}-\x{2C}\x{3A}-\x{40}\x{5B}-\x{60}\x{7B}-\x{7E}]+")
            .expect("valid word separator pattern")
    });

    if text.trim().is_empty() {
        return 0;
    }

    let cjk = CJK.find_iter(text).count();
    let normalized = CJK.replace_all(text, " ");
    let normalized = APOSTROPHE_WORD.replace_all(&normalized, "b");
    let normalized = STANDALONE_PUNCTUATION.replace_all(&normalized, " ");
    let framed = format!("d {normalized} d");
    cjk + WORD_SEPARATOR.split(&framed).count() - 2
}

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

fn emit_edit(app: &tauri::AppHandle, id: crate::document::DocId, text: &str) {
    use tauri::Emitter;
    let _ = app.emit(
        crate::document::EVENT_EDIT,
        serde_json::json!({
            "id": id.0,
            "op": "insert-at-cursor",
            "text": text,
        }),
    );
}

#[cfg(test)]
mod tests {
    use super::word_count;

    #[test]
    fn zhong_wen_an_zi_suan() {
        assert_eq!(word_count("\u{4f60}\u{597d}"), 2);
        assert_eq!(
            word_count("\u{4f60}\u{597d}\u{ff0c}\u{4e16}\u{754c}\u{3002}"),
            5
        );
    }

    #[test]
    fn ying_wen_an_ci_suan_er_bu_shi_an_zi_mu() {
        assert_eq!(word_count("Hello, world!"), 2);
        assert_eq!(word_count("a b c"), 3);
    }

    #[test]
    fn pie_hao_yu_lian_zi_fu_dou_bu_duan_ci() {
        assert_eq!(word_count("don't"), 1);
        assert_eq!(word_count("well-known"), 1);

        assert_eq!(word_count("'"), 0);
        assert_eq!(word_count("a ' b"), 2);
    }

    #[test]
    fn kong_bai_yu_ascii_biao_dian_bu_ji_shu() {
        assert_eq!(word_count("  \n\t  "), 0);
        assert_eq!(word_count("..."), 0);
        assert_eq!(word_count(""), 0);
        assert_eq!(word_count("Nota2"), 1);
    }

    #[test]
    fn zhong_ying_hun_pai_ge_an_zi_ji_de_rule() {
        assert_eq!(word_count("abc\u{4e2d}\u{6587}"), 3);

        assert_eq!(word_count("abc\u{5199}def"), 3);
    }

    #[test]
    fn huan_xing_yu_kong_ge_zai_zhong_wen_li_ye_bu_ji_shu() {
        assert_eq!(
            word_count("\u{7b2c}\u{4e00}\u{6bb5}\n\n\u{7b2c}\u{4e8c}\u{6bb5}"),
            6
        );
    }

    #[test]
    fn matches_typora_punctuation_boundaries() {
        assert_eq!(word_count("---\n#"), 0);
        assert_eq!(word_count("foo_bar"), 2);
        assert_eq!(word_count("foo.bar a/b"), 2);
    }
}
