use mlua::{Lua, Table};

use crate::plugin::{ReviewAction, ReviewKind};

pub(crate) fn yu_lan_table(
    lua: &Lua,
    plugin_id: &str,
    app: tauri::AppHandle,
) -> mlua::Result<mlua::Function> {
    let plugin_id = plugin_id.to_owned();

    lua.create_function(move |lua, id: Option<String>| {
        use tauri::Emitter;
        if let Some(panel) = id.as_deref() {
            if !super::ui::you_mian_ban_ma(lua, panel) {
                return Err(mlua::Error::RuntimeError(format!(
                    "Extension {plugin_id} does not declare panel `{panel}`"
                )));
            }
        }

        let ge = id.clone().map(|panel| ReviewKind::Panel { panel });
        {
            use tauri::Manager;
            app.state::<crate::plugin::ReviewState>()
                .set(&plugin_id, ge);
        }
        app.emit(
            crate::plugin::EVENT_REVIEW,
            serde_json::json!({ "plugin": plugin_id, "kind": "panel", "id": id }),
        )
        .map_err(|e| mlua::Error::RuntimeError(format!("Could not emit the preview event: {e}")))?;
        Ok(())
    })
}

pub(crate) fn yu_lan_change_table(
    lua: &Lua,
    plugin_id: &str,
    app: tauri::AppHandle,
) -> mlua::Result<mlua::Function> {
    let plugin_id = plugin_id.to_owned();

    lua.create_function(move |_lua, args_2: Option<Table>| {
        use tauri::Emitter;
        let ge = match args_2 {
            None => None,
            Some(t) => {
                let text = qu_zi_fu_chuan(&t, "text")?.ok_or_else(|| {
                    mlua::Error::RuntimeError(
                        "nota.ui.review_diff requires text containing the complete proposed document, not a patch or hunk"
                            .to_owned(),
                    )
                })?;
                Some(ReviewKind::Diff {
                    title: qu_zi_fu_chuan(&t, "title")?.unwrap_or_default(),
                    text,
                    accept: qu_an_niu(&t, "accept")?,
                    reject: qu_an_niu(&t, "reject")?,
                })
            }
        };


        {
            use tauri::Manager;
            app.state::<crate::plugin::ReviewState>()
                .set(&plugin_id, ge.clone());
        }
        app.emit(
            crate::plugin::EVENT_REVIEW,
            serde_json::json!({ "plugin": plugin_id, "kind": "diff" }),
        )
        .map_err(|e| mlua::Error::RuntimeError(format!("Could not emit the preview event: {e}")))?;
        Ok(())
    })
}

fn qu_zi_fu_chuan(t: &Table, jian_2: &str) -> mlua::Result<Option<String>> {
    match t.get::<mlua::Value>(jian_2)? {
        mlua::Value::Nil => Ok(None),
        mlua::Value::String(s) => Ok(Some(s.to_str()?.to_owned())),
        bie_de => Err(mlua::Error::RuntimeError(format!(
            "nota.ui.review_diff field `{jian_2}` must be a string, received {}",
            bie_de.type_name()
        ))),
    }
}

fn qu_an_niu(t: &Table, jian_2: &str) -> mlua::Result<Option<ReviewAction>> {
    let Some(zi) = t.get::<Option<Table>>(jian_2)? else {
        return Ok(None);
    };
    let label = zi.get::<Option<String>>("label")?.ok_or_else(|| {
        mlua::Error::RuntimeError(format!(
            "nota.ui.review_diff field `{jian_2}` requires a label"
        ))
    })?;
    let command = zi.get::<Option<String>>("command")?.ok_or_else(|| {
        mlua::Error::RuntimeError(format!(
            "nota.ui.review_diff field `{jian_2}` requires a command"
        ))
    })?;
    Ok(Some(ReviewAction { label, command }))
}
