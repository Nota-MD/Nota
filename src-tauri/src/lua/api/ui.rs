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
        let zhu_ce = mian_ban_table(lua, &manifest.meta.id).map_err(mlua_to_nota)?;
        t.set("register_panel", zhu_ce).map_err(mlua_to_nota)?;

        let shua_xin =
            shua_xin_table(lua, &manifest.meta.id, ctx.app.clone()).map_err(mlua_to_nota)?;
        t.set("refresh", shua_xin).map_err(mlua_to_nota)?;

        let liu = shi_shi_table(lua, &manifest.meta.id, ctx.app.clone()).map_err(mlua_to_nota)?;
        t.set("stream", liu).map_err(mlua_to_nota)?;
        let show =
            show_panel_table(lua, &manifest.meta.id, ctx.app.clone()).map_err(mlua_to_nota)?;
        t.set("show", show).map_err(mlua_to_nota)?;

        let yu_lan = super::review::yu_lan_table(lua, &manifest.meta.id, ctx.app.clone())
            .map_err(mlua_to_nota)?;
        t.set("review", yu_lan).map_err(mlua_to_nota)?;

        let yu_lan_change =
            super::review::yu_lan_change_table(lua, &manifest.meta.id, ctx.app.clone())
                .map_err(mlua_to_nota)?;
        t.set("review_diff", yu_lan_change).map_err(mlua_to_nota)?;
    }

    if manifest.has(Capability::UiMenu) {
        let zhu_ce = cai_dan_table(lua, &manifest.meta.id).map_err(mlua_to_nota)?;
        t.set("register_menu", zhu_ce).map_err(mlua_to_nota)?;
    }

    if manifest.has(Capability::UiOpenUrl) {
        let open_2 = open_wang_zhi_table(lua, ctx.app.clone()).map_err(mlua_to_nota)?;
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
        if !you_mian_ban_ma(lua, &id) {
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

fn open_wang_zhi_table(lua: &Lua, app: tauri::AppHandle) -> mlua::Result<mlua::Function> {
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

pub(crate) fn mian_ban_table(lua: &Lua, plugin_id: &str) -> mlua::Result<mlua::Function> {
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

        zhui_jia_declaration(
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

pub(crate) fn shua_xin_table(
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

pub(crate) fn shi_shi_table(
    lua: &Lua,
    plugin_id: &str,
    app: tauri::AppHandle,
) -> mlua::Result<mlua::Function> {
    let plugin_id = plugin_id.to_owned();

    lua.create_function(move |_, text: Option<String>| {
        use tauri::Emitter;
        let text_2 = qu_wei_ba(&text.unwrap_or_default(), SHI_SHI_SHANG_XIAN);
        app.emit(
            crate::plugin::EVENT_PANEL_STREAM,
            serde_json::json!({ "plugin": plugin_id, "text": text_2 }),
        )
        .map_err(|e| mlua::Error::RuntimeError(format!("Could not emit streaming text: {e}")))?;
        Ok(())
    })
}

const SHI_SHI_SHANG_XIAN: usize = 8000;

fn qu_wei_ba(s: &str, n: usize) -> String {
    let zi_shu = s.chars().count();
    if zi_shu <= n {
        return s.to_owned();
    }
    s.chars().skip(zi_shu - n).collect()
}

pub(crate) fn you_mian_ban_ma(lua: &Lua, id: &str) -> bool {
    let Ok(list) = lua.named_registry_value::<Table>(REG_PANELS) else {
        return false;
    };
    (1..=list.raw_len()).any(|i| {
        matches!(list.raw_get::<Table>(i).and_then(|t| t.get::<String>("id")), Ok(v) if v == id)
    })
}

pub(crate) fn mian_ban_content(
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
        let Ok(tiao_mu) = list.raw_get::<Table>(i) else {
            continue;
        };
        if !matches!(tiao_mu.get::<String>("id"), Ok(v) if v == panel_id) {
            continue;
        }

        let Ok(mlua::Value::Function(render)) = tiao_mu.get::<mlua::Value>("render") else {
            return Err(NotaError::other(format!(
                "Panel `{panel_id}` in extension {plugin_id} has no `render` function"
            )));
        };

        let value_2 = render.call::<mlua::Value>(()).map_err(|e| NotaError::Lua {
            plugin: plugin_id.to_owned(),
            message: format!("Could not render panel `{panel_id}`: {e}"),
        })?;

        return Ok(bo_cheng_json(&value_2, 0, MIAN_BAN_NODE_SHANG_XIAN));
    }

    Err(NotaError::other(format!(
        "Extension {plugin_id} does not declare panel `{panel_id}`"
    )))
}

const MIAN_BAN_TEXT_SHANG_XIAN: usize = 20000;

const MIAN_BAN_NODE_SHANG_XIAN: usize = 200;

const NETWORK_METADATA_SU_SHANG_XIAN: usize = 800;

const MIAN_BAN_CENG_SHU_SHANG_XIAN: usize = 6;

fn bo_cheng_json(v: &mlua::Value, ceng: usize, shu_zu_shang_xian: usize) -> serde_json::Value {
    use serde_json::Value as J;

    if ceng > MIAN_BAN_CENG_SHU_SHANG_XIAN {
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
                let mut arr = Vec::with_capacity(len.min(shu_zu_shang_xian));
                for i in 1..=len.min(shu_zu_shang_xian) {
                    if let Ok(x) = t.raw_get::<mlua::Value>(i) {
                        arr.push(bo_cheng_json(&x, ceng + 1, shu_zu_shang_xian));
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
                            NETWORK_METADATA_SU_SHANG_XIAN
                        } else {
                            MIAN_BAN_NODE_SHANG_XIAN
                        };
                        map.insert(truncate_2(&key), bo_cheng_json(&val, ceng + 1, child_limit));
                    }
                    if map.len() >= MIAN_BAN_NODE_SHANG_XIAN {
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
    if s.chars().count() <= MIAN_BAN_TEXT_SHANG_XIAN {
        return s.to_owned();
    }
    let mut out: String = s.chars().take(MIAN_BAN_TEXT_SHANG_XIAN).collect();
    out.push('\u{2026}');
    out
}

pub(crate) fn cai_dan_table(lua: &Lua, plugin_id: &str) -> mlua::Result<mlua::Function> {
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

        zhui_jia_declaration(
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

fn zhui_jia_declaration(
    lua: &Lua,
    reg: &str,
    jian_2: &str,
    value_2: &str,
    tiao_mu: &Table,
    bao_cuo_qian_zhui: &str,
) -> mlua::Result<()> {
    let list: Table = lua.named_registry_value(reg)?;
    for i in 1..=list.raw_len() {
        let Ok(ji_you) = list.raw_get::<Table>(i) else {
            continue;
        };

        if ru_guo_zhong_ming(ji_you.get::<String>(jian_2), value_2) {
            return Err(mlua::Error::RuntimeError(format!(
                "{bao_cuo_qian_zhui} `{value_2}`"
            )));
        }
    }
    list.set(list.raw_len() + 1, tiao_mu.clone())
}

fn ru_guo_zhong_ming(read_dao: mlua::Result<String>, value_2: &str) -> bool {
    matches!(read_dao, Ok(v) if v == value_2)
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
