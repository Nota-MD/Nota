use mlua::{Lua, Table};

use super::mlua_to_nota;
use crate::error::{NotaError, Result as NotaResult};
use crate::lua::HostContext;
use crate::plugin::manifest::{Capability, Manifest};
use crate::plugin::{REG_MENUS, REG_PANELS};

pub fn build(lua: &Lua, manifest: &Manifest, ctx: &HostContext) -> NotaResult<Table> {
    let t = lua.create_table().map_err(mlua_to_nota)?;

    if manifest.has(Capability::UiNotify) {
        let app = ctx.app.clone();
        let plugin_id = manifest.meta.id.clone();
        let notify = lua
            .create_function(move |_, (msg, level): (String, Option<String>)| {
                use tauri::Emitter;
                app.emit(
                    "nota:notify",
                    serde_json::json!({
                        "plugin": plugin_id,
                        "message": msg,
                        "level": normalise_level(level.as_deref()),
                    }),
                )
                .map_err(|e| {
                    mlua::Error::RuntimeError(format!("Could not send the notification: {e}"))
                })?;
                Ok(())
            })
            .map_err(mlua_to_nota)?;
        t.set("notify", notify).map_err(mlua_to_nota)?;
    }

    if manifest.has(Capability::UiPanel) {
        let main_side = surface_half_table(lua, &manifest.meta.id).map_err(mlua_to_nota)?;
        t.set("register_panel", main_side).map_err(mlua_to_nota)?;

        let refresh_new =
            refresh_new_table(lua, &manifest.meta.id, ctx.app.clone()).map_err(mlua_to_nota)?;
        t.set("refresh", refresh_new).map_err(mlua_to_nota)?;

        let stream = is_is_table(lua, &manifest.meta.id, ctx.app.clone()).map_err(mlua_to_nota)?;
        t.set("stream", stream).map_err(mlua_to_nota)?;
        let show =
            show_panel_table(lua, &manifest.meta.id, ctx.app.clone()).map_err(mlua_to_nota)?;
        t.set("show", show).map_err(mlua_to_nota)?;

        let and_panel = super::review::and_panel_table(lua, &manifest.meta.id, ctx.app.clone())
            .map_err(mlua_to_nota)?;
        t.set("review", and_panel).map_err(mlua_to_nota)?;

        let and_panel_change =
            super::review::and_panel_change_table(lua, &manifest.meta.id, ctx.app.clone())
                .map_err(mlua_to_nota)?;
        t.set("review_diff", and_panel_change)
            .map_err(mlua_to_nota)?;
    }

    if manifest.has(Capability::UiMenu) {
        let main_side = extract_single_table(lua, &manifest.meta.id).map_err(mlua_to_nota)?;
        t.set("register_menu", main_side).map_err(mlua_to_nota)?;
    }

    if manifest.has(Capability::UiOpenUrl) {
        let open_2 = open_web_only_table(lua, ctx.app.clone()).map_err(mlua_to_nota)?;
        t.set("open_url", open_2).map_err(mlua_to_nota)?;
    }

    Ok(t)
}

pub(crate) fn show_panel_table(
    lua: &Lua,
    plugin_id: &str,
    app: tauri::AppHandle,
) -> mlua::Result<mlua::Function> {
    let plugin_id = plugin_id.to_owned();

    lua.create_function(move |lua, id: String| {
        use tauri::Emitter;
        if !has_surface_half(lua, &id) {
            return Err(mlua::Error::RuntimeError(format!(
                "Extension {plugin_id} does not declare panel `{id}`"
            )));
        }
        app.emit(
            crate::plugin::EVENT_PANEL_FOCUS,
            serde_json::json!({ "plugin": plugin_id, "id": id }),
        )
        .map_err(|e| {
            mlua::Error::RuntimeError(format!("Could not emit the panel visibility event: {e}"))
        })?;
        Ok(())
    })
}

fn open_web_only_table(lua: &Lua, app: tauri::AppHandle) -> mlua::Result<mlua::Function> {
    use tauri_plugin_opener::OpenerExt;

    lua.create_function(move |_, url: String| {
        let trimmed = url.trim();
        if !trimmed.starts_with("https://") {
            return Err(mlua::Error::RuntimeError(format!(
                "nota.ui.open_url only accepts HTTPS URLs; received `{}`",
                trimmed.chars().take(40).collect::<String>()
            )));
        }
        app.opener()
            .open_url(trimmed, None::<&str>)
            .map_err(|e| mlua::Error::RuntimeError(format!("Could not open the URL: {e}")))?;
        Ok(())
    })
}

pub(crate) fn surface_half_table(lua: &Lua, plugin_id: &str) -> mlua::Result<mlua::Function> {
    lua.set_named_registry_value(REG_PANELS, lua.create_table()?)?;
    let plugin_id = plugin_id.to_owned();

    let register = lua.create_function(move |lua, spec: Table| {
        let id: String = spec.get("id").map_err(|_| {
            mlua::Error::RuntimeError("register_panel requires an `id` field".to_owned())
        })?;
        let title: String = spec.get("title").unwrap_or_else(|_| id.clone());

        let entry = lua.create_table()?;
        entry.set("id", id.clone())?;
        entry.set("title", title)?;
        if let Ok(Some(icon)) = spec.get::<Option<String>>("icon") {
            entry.set("icon", icon)?;
        }

        entry.set(
            "location",
            spec.get::<Option<String>>("location")
                .ok()
                .flatten()
                .unwrap_or_else(|| "right".to_owned()),
        )?;

        if spec.get::<Option<bool>>("wide").ok().flatten() == Some(true) {
            entry.set("wide", true)?;
        }

        if spec.get::<Option<bool>>("live").ok().flatten() == Some(true) {
            entry.set("live", true)?;
        }

        match spec.get::<mlua::Value>("render") {
            Ok(mlua::Value::Nil) => {}
            Ok(mlua::Value::Function(f)) => entry.set("render", f)?,

            Ok(_) => {
                return Err(mlua::Error::RuntimeError(format!(
                    "Panel `{id}` in extension {plugin_id} requires a `render` function"
                )))
            }
            Err(_) => {}
        }

        append_add_declaration(
            lua,
            REG_PANELS,
            "id",
            &id,
            &entry,
            &format!("Extension {plugin_id} registered a duplicate panel"),
        )?;
        Ok(())
    })?;

    Ok(register)
}

pub(crate) fn refresh_new_table(
    lua: &Lua,
    plugin_id: &str,
    app: tauri::AppHandle,
) -> mlua::Result<mlua::Function> {
    let plugin_id = plugin_id.to_owned();

    lua.create_function(move |_, id: Option<String>| {
        use tauri::Emitter;
        app.emit(
            crate::plugin::EVENT_PANEL_DIRTY,
            serde_json::json!({ "plugin": plugin_id, "id": id }),
        )
        .map_err(|e| {
            mlua::Error::RuntimeError(format!("Could not emit the panel refresh event: {e}"))
        })?;
        Ok(())
    })
}

pub(crate) fn is_is_table(
    lua: &Lua,
    plugin_id: &str,
    app: tauri::AppHandle,
) -> mlua::Result<mlua::Function> {
    let plugin_id = plugin_id.to_owned();

    lua.create_function(move |_, text: Option<String>| {
        use tauri::Emitter;
        let text_2 = get_position_handle(&text.unwrap_or_default(), IS_IS_UPPER_THREAD);
        app.emit(
            crate::plugin::EVENT_PANEL_STREAM,
            serde_json::json!({ "plugin": plugin_id, "text": text_2 }),
        )
        .map_err(|e| mlua::Error::RuntimeError(format!("Could not emit streaming text: {e}")))?;
        Ok(())
    })
}

const IS_IS_UPPER_THREAD: usize = 8000;

fn get_position_handle(s: &str, n: usize) -> String {
    let character_data = s.chars().count();
    if character_data <= n {
        return s.to_owned();
    }
    s.chars().skip(character_data - n).collect()
}

pub(crate) fn has_surface_half(lua: &Lua, id: &str) -> bool {
    let Ok(list) = lua.named_registry_value::<Table>(REG_PANELS) else {
        return false;
    };
    (1..=list.raw_len()).any(|i| {
        matches!(list.raw_get::<Table>(i).and_then(|t| t.get::<String>("id")), Ok(v) if v == id)
    })
}

pub(crate) fn surface_half_content(
    lua: &Lua,
    plugin_id: &str,
    panel_id: &str,
) -> NotaResult<serde_json::Value> {
    let list: Table = lua.named_registry_value(REG_PANELS).map_err(|_| {
        NotaError::other(format!(
            "Extension {plugin_id} does not have the `ui.panel` capability"
        ))
    })?;

    for i in 1..=list.raw_len() {
        let Ok(item_target) = list.raw_get::<Table>(i) else {
            continue;
        };
        if !matches!(item_target.get::<String>("id"), Ok(v) if v == panel_id) {
            continue;
        }

        let Ok(mlua::Value::Function(render)) = item_target.get::<mlua::Value>("render") else {
            return Err(NotaError::other(format!(
                "Panel `{panel_id}` in extension {plugin_id} has no `render` function"
            )));
        };

        let value_2 = render.call::<mlua::Value>(()).map_err(|e| NotaError::Lua {
            plugin: plugin_id.to_owned(),
            message: format!("Could not render panel `{panel_id}`: {e}"),
        })?;

        return Ok(broadcast_success_json(
            &value_2,
            0,
            SURFACE_HALF_NODE_UPPER_THREAD,
        ));
    }

    Err(NotaError::other(format!(
        "Extension {plugin_id} does not declare panel `{panel_id}`"
    )))
}

const SURFACE_HALF_TEXT_UPPER_THREAD: usize = 20000;

const SURFACE_HALF_NODE_UPPER_THREAD: usize = 200;

const NETWORK_METADATA_SPEED_UPPER_THREAD: usize = 800;

const SURFACE_HALF_LAYER_DATA_UPPER_THREAD: usize = 6;

fn broadcast_success_json(
    v: &mlua::Value,
    layer: usize,
    data_group_upper_thread: usize,
) -> serde_json::Value {
    use serde_json::Value as J;

    if layer > SURFACE_HALF_LAYER_DATA_UPPER_THREAD {
        return J::Null;
    }

    match v {
        mlua::Value::Nil => J::Null,
        mlua::Value::Boolean(b) => J::Bool(*b),
        mlua::Value::Integer(i) => J::Number((*i).into()),
        mlua::Value::Number(n) => serde_json::Number::from_f64(*n)
            .map(J::Number)
            .unwrap_or(J::Null),
        mlua::Value::String(s) => J::String(truncate_2(&s.to_string_lossy())),
        mlua::Value::Table(t) => {
            let len = t.raw_len();
            if len > 0 {
                let mut arr = Vec::with_capacity(len.min(data_group_upper_thread));
                for i in 1..=len.min(data_group_upper_thread) {
                    if let Ok(x) = t.raw_get::<mlua::Value>(i) {
                        arr.push(broadcast_success_json(
                            &x,
                            layer + 1,
                            data_group_upper_thread,
                        ));
                    }
                }
                J::Array(arr)
            } else {
                let mut map = serde_json::Map::new();
                let is_network = matches!(t.get::<String>("kind"), Ok(kind) if kind == "network");
                for pair in t.pairs::<mlua::Value, mlua::Value>() {
                    let Ok((k, val)) = pair else { continue };

                    if let mlua::Value::String(ks) = k {
                        let key = ks.to_string_lossy();
                        let child_limit = if is_network && matches!(key.as_ref(), "nodes" | "edges")
                        {
                            NETWORK_METADATA_SPEED_UPPER_THREAD
                        } else {
                            SURFACE_HALF_NODE_UPPER_THREAD
                        };
                        map.insert(
                            truncate_2(&key),
                            broadcast_success_json(&val, layer + 1, child_limit),
                        );
                    }
                    if map.len() >= SURFACE_HALF_NODE_UPPER_THREAD {
                        break;
                    }
                }
                J::Object(map)
            }
        }

        _ => J::Null,
    }
}

fn truncate_2(s: &str) -> String {
    if s.chars().count() <= SURFACE_HALF_TEXT_UPPER_THREAD {
        return s.to_owned();
    }
    let mut out: String = s.chars().take(SURFACE_HALF_TEXT_UPPER_THREAD).collect();
    out.push('\u{2026}');
    out
}

pub(crate) fn extract_single_table(lua: &Lua, plugin_id: &str) -> mlua::Result<mlua::Function> {
    lua.set_named_registry_value(REG_MENUS, lua.create_table()?)?;
    let plugin_id = plugin_id.to_owned();

    let register = lua.create_function(move |lua, spec: Table| {
        let label: String = spec.get("label").map_err(|_| {
            mlua::Error::RuntimeError("register_menu requires a `label` field".to_owned())
        })?;

        let command: String = spec.get("command").map_err(|_| {
            mlua::Error::RuntimeError("register_menu requires a `command` field".to_owned())
        })?;
        let menu: String = spec
            .get::<Option<String>>("menu")
            .ok()
            .flatten()
            .unwrap_or_else(|| "plugins".to_owned());

        let entry = lua.create_table()?;
        entry.set("label", label.clone())?;
        entry.set("command", command)?;
        entry.set("menu", menu)?;
        if let Ok(Some(acc)) = spec.get::<Option<String>>("accelerator") {
            entry.set("accelerator", acc)?;
        }

        if let Ok(Some(p)) = spec.get::<Option<Table>>("prompt") {
            entry.set("prompt", p)?;
        }

        append_add_declaration(
            lua,
            REG_MENUS,
            "label",
            &label,
            &entry,
            &format!("Extension {plugin_id} registered a duplicate menu item"),
        )?;
        Ok(())
    })?;

    Ok(register)
}

fn append_add_declaration(
    lua: &Lua,
    reg: &str,
    key: &str,
    value: &str,
    item_target: &Table,
    package_error_prefix: &str,
) -> mlua::Result<()> {
    let list: Table = lua.named_registry_value(reg)?;
    for i in 1..=list.raw_len() {
        let Ok(record_has) = list.raw_get::<Table>(i) else {
            continue;
        };

        if into_passed_middle_name(record_has.get::<String>(key), value) {
            return Err(mlua::Error::RuntimeError(format!(
                "{package_error_prefix} `{value}`"
            )));
        }
    }
    list.set(list.raw_len() + 1, item_target.clone())
}

fn into_passed_middle_name(read_result: mlua::Result<String>, value: &str) -> bool {
    matches!(read_result, Ok(existing) if existing == value)
}

fn normalise_level(level: Option<&str>) -> &'static str {
    match level {
        Some("warn") | Some("warning") => "warn",
        Some("error") => "error",
        Some("success") => "success",
        _ => "info",
    }
}

#[cfg(test)]
mod tests;
