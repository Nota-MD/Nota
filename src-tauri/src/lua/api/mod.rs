pub mod ai;
pub mod assets;
pub mod data;
pub mod devserver;
pub mod diff;
pub mod document;
pub mod fs;
pub mod git;
pub mod http;
pub mod i18n;
pub mod json;
pub mod review;
pub mod settings;
pub mod time;
pub mod ui;
pub mod unified_diff;

use mlua::{Lua, Table, Value};

use crate::error::NotaError;
use crate::lua::HostContext;
use crate::plugin::manifest::{Capability, Manifest, NOTA_PLUGIN_API_VERSION};

pub fn lua_err(e: NotaError) -> mlua::Error {
    mlua::Error::RuntimeError(e.to_string())
}

pub fn build(
    lua: &Lua,
    manifest: &Manifest,
    ctx: &HostContext,
    language_2: &i18n::LanguagePack,
) -> Result<Table, NotaError> {
    let nota = lua.create_table().map_err(mlua_to_nota)?;

    set(nota.set("version", env!("CARGO_PKG_VERSION")), lua)?;
    set(
        nota.set("api_version", NOTA_PLUGIN_API_VERSION.to_string()),
        lua,
    )?;
    set(nota.set("plugin_id", manifest.meta.id.clone()), lua)?;

    set(nota.set("assets", assets::build(lua, manifest)?), lua)?;

    let prefix = format!("[nota:{}]", manifest.meta.id);
    let log = lua.create_table().map_err(mlua_to_nota)?;
    for (name, level) in [("info", "INFO"), ("warn", "WARN"), ("error", "ERROR")] {
        let p = prefix.clone();
        let f = lua
            .create_function(move |_, msg: Value| {
                crate::debug_log!("{p} {level} {}", value_to_text(&msg));
                Ok(())
            })
            .map_err(mlua_to_nota)?;
        set(log.set(name, f), lua)?;
    }
    set(nota.set("log", log), lua)?;

    set(
        nota.set("command", command_table(lua, &manifest.meta.id)?),
        lua,
    )?;

    set(nota.set("event", event_table(lua, ctx)?), lua)?;

    set(nota.set("diff", diff::build(lua)?), lua)?;

    set(nota.set("json", json::build(lua)?), lua)?;

    set(
        nota.set(
            "i18n",
            i18n::build(lua, language_2, ctx.application_language.as_str())?,
        ),
        lua,
    )?;

    set(nota.set("time", time::build(lua)?), lua)?;

    if manifest.has(Capability::AiContextRead) || manifest.has(Capability::AiContextWrite) {
        set(nota.set("ai", ai::build(lua, manifest, ctx)?), lua)?;
    }

    if manifest.has(Capability::DocumentRead) || manifest.has(Capability::DocumentWrite) {
        set(
            nota.set("document", document::build(lua, manifest, ctx)?),
            lua,
        )?;
    }

    if manifest.has(Capability::FsRead) || manifest.has(Capability::FsWrite) {
        set(nota.set("fs", fs::build(lua, manifest, ctx)?), lua)?;
    }

    if manifest.has(Capability::ProcessGit) {
        set(nota.set("git", git::build(lua, ctx)?), lua)?;
    }

    if manifest.has(Capability::ProcessDevServer) {
        set(
            nota.set("devserver", devserver::build(lua, manifest, ctx)?),
            lua,
        )?;
    }

    if install_ui(manifest) {
        set(nota.set("ui", ui::build(lua, manifest, ctx)?), lua)?;
    }

    if manifest.has(Capability::NetworkHttp) {
        set(nota.set("http", http::build(lua)?), lua)?;
    }

    if manifest.has(Capability::SettingsOwn) {
        set(
            nota.set("settings", settings::build(lua, &manifest.meta.id)?),
            lua,
        )?;
    }

    if manifest.has(Capability::DataOwn) {
        set(nota.set("data", data::build(lua, &manifest.meta.id)?), lua)?;
    }

    Ok(nota)
}

fn command_table(lua: &Lua, plugin_id: &str) -> Result<Table, NotaError> {
    let t = lua.create_table().map_err(mlua_to_nota)?;

    let commands = lua.create_table().map_err(mlua_to_nota)?;
    lua.set_named_registry_value("nota_commands", commands)
        .map_err(mlua_to_nota)?;

    let id = plugin_id.to_owned();
    let register = lua
        .create_function(move |lua, (name, f): (String, mlua::Function)| {
            if name.is_empty() {
                return Err(mlua::Error::RuntimeError(
                    "The command name cannot be empty".to_owned(),
                ));
            }
            let commands: Table = lua.named_registry_value("nota_commands")?;

            if let Ok(Value::Function(_)) = commands.get::<Value>(name.as_str()) {
                return Err(mlua::Error::RuntimeError(format!(
                    "Extension {id} registered duplicate command `{name}`"
                )));
            }
            commands.set(name, f)?;
            Ok(())
        })
        .map_err(mlua_to_nota)?;

    set(t.set("register", register), lua)?;
    Ok(t)
}

fn event_table(lua: &Lua, ctx: &HostContext) -> Result<Table, NotaError> {
    use tauri::Emitter;

    let t = lua.create_table().map_err(mlua_to_nota)?;

    let app = ctx.app.clone();

    let plugin_id = crate::plugin::manifest::channel_id(&ctx.plugin_id);
    let emit = lua
        .create_function(move |lua, (name, payload): (String, Value)| {
            let channel = format!("plugin:{plugin_id}:{name}");
            let json = lua_to_json(lua, payload)?;
            app.emit(&channel, json).map_err(|e| {
                mlua::Error::RuntimeError(format!("Could not emit event {channel}: {e}"))
            })?;
            Ok(())
        })
        .map_err(mlua_to_nota)?;

    set(t.set("emit", emit), lua)?;
    Ok(t)
}

fn set(r: mlua::Result<()>, _lua: &Lua) -> Result<(), NotaError> {
    r.map_err(mlua_to_nota)
}

pub fn mlua_to_nota(e: mlua::Error) -> NotaError {
    NotaError::other(format!("Lua\u{ff1a}{e}"))
}

fn value_to_text(v: &Value) -> String {
    match v {
        Value::Nil => "nil".to_owned(),
        Value::Boolean(b) => b.to_string(),
        Value::Integer(i) => i.to_string(),
        Value::Number(n) => n.to_string(),
        Value::String(s) => s.to_string_lossy().to_string(),
        other => format!("{other:?}"),
    }
}

pub fn lua_to_json(lua: &Lua, v: Value) -> mlua::Result<serde_json::Value> {
    Ok(match v {
        Value::Nil => serde_json::Value::Null,
        Value::Boolean(b) => serde_json::Value::Bool(b),
        Value::Integer(i) => serde_json::Value::Number(i.into()),
        Value::Number(n) => serde_json::Number::from_f64(n)
            .map(serde_json::Value::Number)
            .unwrap_or(serde_json::Value::Null),
        Value::String(s) => serde_json::Value::String(s.to_string_lossy().to_string()),
        Value::Table(t) => {
            let len = t.raw_len();
            if len > 0 {
                let mut arr = Vec::with_capacity(len);
                for i in 1..=len {
                    arr.push(lua_to_json(lua, t.raw_get(i)?)?);
                }
                serde_json::Value::Array(arr)
            } else {
                let mut map = serde_json::Map::new();
                for pair in t.pairs::<Value, Value>() {
                    let (k, val) = pair?;
                    if let Value::String(ks) = k {
                        map.insert(ks.to_string_lossy().to_string(), lua_to_json(lua, val)?);
                    }
                }
                serde_json::Value::Object(map)
            }
        }
        other => serde_json::Value::String(format!("{other:?}")),
    })
}

pub fn json_to_lua(lua: &Lua, v: &serde_json::Value) -> mlua::Result<Value> {
    Ok(match v {
        serde_json::Value::Null => Value::Nil,
        serde_json::Value::Bool(b) => Value::Boolean(*b),
        serde_json::Value::Number(n) => match n.as_i64() {
            Some(i) => Value::Integer(i),

            None => Value::Number(n.as_f64().unwrap_or(0.0)),
        },
        serde_json::Value::String(s) => Value::String(lua.create_string(s)?),
        serde_json::Value::Array(a) => {
            let t = lua.create_table()?;

            for (i, item) in a.iter().enumerate() {
                t.raw_set(i + 1, json_to_lua(lua, item)?)?;
            }
            Value::Table(t)
        }
        serde_json::Value::Object(o) => {
            let t = lua.create_table()?;
            for (k, val) in o {
                t.raw_set(k.as_str(), json_to_lua(lua, val)?)?;
            }
            Value::Table(t)
        }
    })
}

const UI_CAN_INNER: [Capability; 4] = [
    Capability::UiNotify,
    Capability::UiPanel,
    Capability::UiMenu,
    Capability::UiOpenUrl,
];

fn install_ui(manifest: &Manifest) -> bool {
    UI_CAN_INNER.iter().any(|c| manifest.has(*c))
}

#[cfg(test)]
mod tests {
    use super::*;

    fn can_inner_name(c: Capability) -> String {
        serde_json::to_value(c)
            .unwrap()
            .as_str()
            .unwrap()
            .to_owned()
    }

    fn create_manifest(name_2: &str, can_inner: &[Capability]) -> Manifest {
        let dir = std::env::temp_dir().join(format!("nota-api-test-{name_2}"));
        let _ = std::fs::remove_dir_all(&dir);
        std::fs::create_dir_all(&dir).unwrap();
        let caps = can_inner
            .iter()
            .map(|c| format!("\"{}\"", can_inner_name(*c)))
            .collect::<Vec<_>>()
            .join(", ");
        std::fs::write(
            dir.join("plugin.toml"),
            format!(



                "[plugin]\nid = \"nota.{name_2}\"\nname = \"T\"\napi = \"{half_current}\"\ncapabilities = [{caps}]\n",
                half_current = NOTA_PLUGIN_API_VERSION
            ),
        )
        .unwrap();
        Manifest::load(&dir.join("plugin.toml")).unwrap()
    }

    #[test]
    fn each_one_item_ui_can_inner_all_can_single_read_install_out_nota_ui() {
        for (i, c) in UI_CAN_INNER.iter().enumerate() {
            let m = create_manifest(&format!("u{i}"), &[*c]);
            assert!(
                install_ui(&m),
                "\u{53ea}\u{7533}\u{8bf7} `{}` \u{4e5f}\u{5e94}\u{8be5}\u{88c5}\u{51fa} nota.ui \u{2014}\u{2014} \u{6f0f}\u{4e86}\u{5b83}\u{ff0c}\u{62d3}\u{5c55}\u{4f1a}\u{62ff}\u{5230} nil \u{5e76}\u{62a5} \
                 `attempt to index a nil value`\u{ff08}BUG-8\u{ff09}",
                can_inner_name(*c)
            );
        }
    }

    #[test]
    fn each_deep_request_ui_can_inner_old_not_install_nota_ui() {
        let m = create_manifest("empty", &[Capability::ProcessGit, Capability::DocumentRead]);
        assert!(!install_ui(&m), "\u{6ca1}\u{7533}\u{8bf7}\u{4efb}\u{4f55} ui.* \u{7684}\u{62d3}\u{5c55}\u{4e0d}\u{8be5}\u{62ff}\u{5230} nota.ui");
    }

    #[test]
    fn ui_can_inner_manifest_need_and_ui_rs_pair_upper() {
        let src = include_str!("ui.rs");
        let is_record = src.matches("manifest.has(Capability::Ui").count();
        assert_eq!(
            is_record,
            UI_CAN_INNER.len(),
            "`ui.rs` \u{91cc}\u{6709} {is_record} \u{5904} `manifest.has(Capability::Ui\u{2026})`\u{ff0c}\
             \u{800c} `UI\u{80fd}\u{529b}` \u{53ea}\u{6709} {} \u{9879}\u{3002}\u{4e24}\u{5904}\u{5fc5}\u{987b}\u{4e00}\u{4e00}\u{5bf9}\u{5e94}\u{ff1a}\u{5f80} `UI\u{80fd}\u{529b}` \u{8865}\u{4e0a}\u{7f3a}\u{7684}\u{90a3}\u{4e00}\u{9879}\u{ff0c}\
             \u{5e76}\u{5728} `api/mod.rs` \u{7684}\u{8868}\u{88c5}\u{914d}\u{91cc}\u{4e5f}\u{5e26}\u{4e0a}\u{5b83}\u{2014}\u{2014}\u{6f0f}\u{4e00}\u{9879} = \u{90a3}\u{6761}\u{80fd}\u{529b}\u{5f62}\u{540c}\u{865a}\u{8bbe}\u{ff08}BUG-8\u{ff09}",
            UI_CAN_INNER.len()
        );
    }

    #[test]
    fn can_inner_serde_name_and_parse_say_same_one_escape_render() {
        for c in UI_CAN_INNER {
            let name = can_inner_name(c);
            assert_eq!(
                Capability::parse(&name).unwrap(),
                c,
                "`{name}` \u{8fd9}\u{4e2a}\u{540d}\u{5b57} `parse()` \u{8ba4}\u{ff0c}\u{4f46}\u{8ba4}\u{56de}\u{6765}\u{7684}\u{4e0d}\u{662f}\u{540c}\u{4e00}\u{4e2a}\u{53d8}\u{4f53}"
            );
        }
    }
}
