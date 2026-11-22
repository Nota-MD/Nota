use mlua::{Lua, Table};

use crate::plugin::{ReviewAction, ReviewKind};

pub(crate) fn and_panel_table(
    lua: &Lua,
    plugin_id: &str,
    app: tauri::AppHandle,
) -> mlua::Result<mlua::Function> {
    let plugin_id = plugin_id.to_owned();

    lua.create_function(move |lua, id: Option<String>| {
        use tauri::Emitter;
        if let Some(panel) = id.as_deref() {
            if !super::ui::has_surface_half(lua, panel) {
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

pub(crate) fn and_panel_change_table(
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
                let text = get_character_service_stream(&t, "text")?.ok_or_else(|| {
                    mlua::Error::RuntimeError(
                        "nota.ui.review_diff requires text containing the complete proposed document, not a patch or hunk"
                            .to_owned(),
                    )
                })?;
                Some(ReviewKind::Diff {
                    title: get_character_service_stream(&t, "title")?.unwrap_or_default(),
                    text,
                    accept: get_by_button(&t, "accept")?,
                    reject: get_by_button(&t, "reject")?,
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

fn get_character_service_stream(t: &Table, value_2: &str) -> mlua::Result<Option<String>> {
    match t.get::<mlua::Value>(value_2)? {
        mlua::Value::Nil => Ok(None),
        mlua::Value::String(s) => Ok(Some(s.to_str()?.to_owned())),
        other => Err(mlua::Error::RuntimeError(format!(
            "nota.ui.review_diff field `{value_2}` must be a string, received {}",
            other.type_name()
        ))),
    }
}

fn get_by_button(t: &Table, value_2: &str) -> mlua::Result<Option<ReviewAction>> {
    let Some(character) = t.get::<Option<Table>>(value_2)? else {
        return Ok(None);
    };
    let label = character.get::<Option<String>>("label")?.ok_or_else(|| {
        mlua::Error::RuntimeError(format!(
            "nota.ui.review_diff field `{value_2}` requires a label"
        ))
    })?;
    let command = character.get::<Option<String>>("command")?.ok_or_else(|| {
        mlua::Error::RuntimeError(format!(
            "nota.ui.review_diff field `{value_2}` requires a command"
        ))
    })?;
    Ok(Some(ReviewAction { label, command }))
}
