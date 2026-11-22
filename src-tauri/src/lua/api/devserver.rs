use std::collections::HashMap;
use std::path::{Path, PathBuf};
use std::sync::Mutex;

use mlua::{Lua, Table, Value};
use tauri::{AppHandle, Manager};

use super::{lua_err, mlua_to_nota};
use crate::devserver::{self, DevServerState, Info, Probe, ProbeState};
use crate::document::DocId;
use crate::error::{NotaError, Result as NotaResult};
use crate::lua::HostContext;
use crate::plugin::manifest::{DevServerSpec, Manifest};

pub struct ProbeCache(Mutex<HashMap<String, Slot>>);

struct Slot {
    root: Option<String>,

    need: Option<String>,

    result: Option<Probe>,
}

#[derive(Debug)]
enum Peek {
    Ready(Probe),

    Running,

    Go,
}

impl ProbeCache {
    pub fn new() -> Self {
        Self(Mutex::new(HashMap::new()))
    }

    fn qu_huo_zhan_wei(&self, plugin: &str, root: &Option<String>, need: &Option<String>) -> Peek {
        let mut m = self.0.lock().unwrap();
        if let Some(slot) = m.get(plugin) {
            if slot.root == *root && slot.need == *need {
                return match &slot.result {
                    Some(p) => Peek::Ready(p.clone()),
                    None => Peek::Running,
                };
            }
        }

        m.insert(
            plugin.to_owned(),
            Slot {
                root: root.clone(),
                need: need.clone(),
                result: None,
            },
        );
        Peek::Go
    }

    fn receive_xia(&self, plugin: &str, root: &Option<String>, need: &Option<String>, p: Probe) {
        let mut m = self.0.lock().unwrap();
        if let Some(slot) = m.get_mut(plugin) {
            if slot.root == *root && slot.need == *need {
                slot.result = Some(p);
            }
            return;
        }
        m.insert(
            plugin.to_owned(),
            Slot {
                root: root.clone(),
                need: need.clone(),
                result: Some(p),
            },
        );
    }

    fn tan_huo_bu_tan(
        &self,
        plugin: &str,
        spec: &DevServerSpec,
        root: Option<PathBuf>,
        need: Option<String>,
        app: &AppHandle,
    ) -> Option<Probe> {
        let root_2 = root.as_ref().map(|p| p.display().to_string());
        match self.qu_huo_zhan_wei(plugin, &root_2, &need) {
            Peek::Ready(p) => return Some(p),
            Peek::Running => return None,
            Peek::Go => {}
        }

        let plugin = plugin.to_owned();
        let spec = spec.clone();
        let app = app.clone();
        let yao_de = need.clone();
        std::thread::spawn(move || {
            let p = devserver::probe(&spec, root.as_deref(), yao_de.as_deref());

            if let Some(cache) = app.try_state::<ProbeCache>() {
                cache.receive_xia(&plugin, &root_2, &need, p);
            }

            use tauri::Emitter;
            let _ = app.emit(
                crate::plugin::EVENT_PANEL_DIRTY,
                serde_json::json!({ "plugin": plugin, "id": serde_json::Value::Null }),
            );
        });
        None
    }
}

impl Default for ProbeCache {
    fn default() -> Self {
        Self::new()
    }
}

fn tan_bao_table(lua: &Lua, p: &Probe) -> mlua::Result<Table> {
    let t = lua.create_table()?;
    t.set("state", probe_state_str(p.state))?;
    t.set("command", p.command.clone())?;
    t.set("version", p.version.clone())?;
    t.set("detail", p.detail.clone())?;
    t.set("root", p.root.clone())?;
    t.set("marker_found", p.marker_found)?;

    t.set("need_found", p.need_found)?;
    Ok(t)
}

fn check_zhong_table(lua: &Lua, spec: &DevServerSpec, root: Option<&Path>) -> mlua::Result<Table> {
    let t = lua.create_table()?;
    t.set("state", "checking")?;
    t.set("command", spec.command())?;
    t.set("root", root.map(|p| p.display().to_string()))?;
    Ok(t)
}

pub fn build(lua: &Lua, manifest: &Manifest, ctx: &HostContext) -> NotaResult<Table> {
    let t = lua.create_table().map_err(mlua_to_nota)?;

    let spec = manifest.devserver.clone().ok_or_else(|| {
        NotaError::other(format!(
            "Extension {} has `process.devserver` but no `[devserver]` section",
            manifest.meta.id
        ))
    })?;
    let plugin = manifest.meta.id.clone();

    let ctx2 = ctx.clone();
    let spec2 = spec.clone();
    let plugin2 = plugin.clone();
    let probe = lua
        .create_function(move |lua, opts: Option<Table>| -> mlua::Result<Table> {
            let root = match opts
                .as_ref()
                .and_then(|o| o.get::<Option<String>>("root").ok().flatten())
            {
                Some(s) => Some(PathBuf::from(s)),
                None => huo_dong_document(&ctx2).and_then(|d| d.0),
            };

            let force = opts
                .as_ref()
                .and_then(|o| o.get::<Option<bool>>("force").ok().flatten())
                .unwrap_or(false);

            let need = opts
                .as_ref()
                .and_then(|o| o.get::<Option<String>>("need").ok().flatten())
                .filter(|s| !s.is_empty());

            let cache = ctx2.app.try_state::<ProbeCache>();
            let root_2 = root.as_ref().map(|p| p.display().to_string());

            if force {
                let p = devserver::probe(&spec2, root.as_deref(), need.as_deref());
                if let Some(c) = cache.as_deref() {
                    c.receive_xia(&plugin2, &root_2, &need, p.clone());
                }
                return tan_bao_table(lua, &p);
            }

            match cache.as_deref().and_then(|c| {
                c.tan_huo_bu_tan(&plugin2, &spec2, root.clone(), need.clone(), &ctx2.app)
            }) {
                Some(p) => tan_bao_table(lua, &p),

                None => check_zhong_table(lua, &spec2, root.as_deref()),
            }
        })
        .map_err(mlua_to_nota)?;
    t.set("probe", probe).map_err(mlua_to_nota)?;

    let ctx2 = ctx.clone();
    let spec2 = spec.clone();
    let plugin2 = plugin.clone();
    let start = lua
        .create_function(move |lua, opts: Option<Table>| -> mlua::Result<Table> {
            let doc = opts
                .as_ref()
                .and_then(|o| o.get::<Option<i64>>("doc").ok().flatten())
                .map(|n| DocId(n as u64));
            let (dir, text, id) = tiao_document(&ctx2, doc).ok_or_else(|| {
                mlua::Error::RuntimeError(
                    "No active document and no `doc` argument were provided".to_owned(),
                )
            })?;

            let state = status_2(&ctx2.app);
            let info = devserver::start(&state, &plugin2, &spec2, dir, Some(id), &text)
                .map_err(lua_err)?;
            info_table(lua, &info)
        })
        .map_err(mlua_to_nota)?;
    t.set("start", start).map_err(mlua_to_nota)?;

    let app = ctx.app.clone();
    let plugin2 = plugin.clone();
    let status = lua
        .create_function(move |lua, ()| -> mlua::Result<Value> {
            match devserver::status(&status_2(&app), &plugin2) {
                Some(info) => Ok(Value::Table(info_table(lua, &info)?)),

                None => Ok(Value::Nil),
            }
        })
        .map_err(mlua_to_nota)?;
    t.set("status", status).map_err(mlua_to_nota)?;

    let app = ctx.app.clone();
    let plugin2 = plugin.clone();
    let open_in_browser = lua
        .create_function(move |_, ()| {
            use tauri_plugin_opener::OpenerExt;
            let info = devserver::status(&status_2(&app), &plugin2)
                .filter(|i| i.alive)
                .ok_or_else(|| {
                    mlua::Error::RuntimeError(
                        "Preview is not running. Start it with `nota.devserver.start{doc=}` first."
                            .to_owned(),
                    )
                })?;
            app.opener().open_url(info.url, None::<&str>).map_err(|e| {
                mlua::Error::RuntimeError(format!("Could not open the browser: {e}"))
            })?;
            Ok(())
        })
        .map_err(mlua_to_nota)?;
    t.set("open_in_browser", open_in_browser)
        .map_err(mlua_to_nota)?;

    let app = ctx.app.clone();
    let plugin2 = plugin.clone();
    let log = lua
        .create_function(move |_, ()| Ok(devserver::log_tail(&status_2(&app), &plugin2)))
        .map_err(mlua_to_nota)?;
    t.set("log", log).map_err(mlua_to_nota)?;

    let app = ctx.app.clone();
    let plugin2 = plugin;
    let stop = lua
        .create_function(move |_, ()| {
            devserver::stop(&status_2(&app), &plugin2);
            Ok(())
        })
        .map_err(mlua_to_nota)?;
    t.set("stop", stop).map_err(mlua_to_nota)?;

    Ok(t)
}

fn status_2(app: &AppHandle) -> tauri::State<'_, DevServerState> {
    app.state::<DevServerState>()
}

fn tiao_document(
    ctx: &HostContext,
    doc: Option<DocId>,
) -> Option<(Option<PathBuf>, String, DocId)> {
    let store = ctx.documents.lock().unwrap();
    let d = match doc {
        Some(id) => store.get(id)?,
        None => store.active()?,
    };
    let dir = d.path.as_ref().and_then(|p| p.parent()).map(PathBuf::from);
    Some((dir, d.text.clone(), d.id))
}

fn huo_dong_document(ctx: &HostContext) -> Option<(Option<PathBuf>, String, DocId)> {
    tiao_document(ctx, None)
}

fn info_table(lua: &Lua, info: &Info) -> mlua::Result<Table> {
    let t = lua.create_table()?;
    t.set("port", info.port)?;
    t.set("url", info.url.clone())?;
    t.set("entry", info.entry.clone())?;
    t.set("alive", info.alive)?;
    Ok(t)
}

fn probe_state_str(s: ProbeState) -> &'static str {
    match s {
        ProbeState::Ready => "ready",
        ProbeState::Missing => "missing",
        ProbeState::Unknown => "unknown",
    }
}

pub(crate) fn tian_frame(app: &AppHandle, plugin_id: &str, v: &mut serde_json::Value) {
    match v {
        serde_json::Value::Array(items) => {
            for item in items {
                tian_frame(app, plugin_id, item);
            }
        }
        serde_json::Value::Object(map) => {
            if map.get("kind").and_then(|k| k.as_str()) == Some("frame") {
                map.remove("url");
                map.remove("alive");
                let you_2 = devserver::status(&status_2(app), plugin_id).filter(|i| i.alive);
                map.insert(
                    "url".to_owned(),
                    you_2
                        .as_ref()
                        .map(|i| serde_json::Value::String(i.url.clone()))
                        .unwrap_or(serde_json::Value::Null),
                );
                map.insert("alive".to_owned(), serde_json::Value::Bool(you_2.is_some()));
            }
            for (_, child) in map.iter_mut() {
                tian_frame(app, plugin_id, child);
            }
        }
        _ => {}
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn zao_manifest(name: &str) -> Manifest {
        let dir = std::env::temp_dir().join(format!("nota-devapi-{name}"));
        let _ = std::fs::remove_dir_all(&dir);
        std::fs::create_dir_all(&dir).unwrap();
        std::fs::write(
            dir.join("plugin.toml"),
            format!(
                "[plugin]\nid = \"nota.{name}\"\nname = \"T\"\napi = \"v2.3\"\n\
                 capabilities = [\"process.devserver\"]\n\
                 \n[devserver]\ncmd = \"echo\"\nargs = [\"{{port}}\"]\n\
                 entry = \".nota-{name}-{{doc}}.md\"\n"
            ),
        )
        .unwrap();
        Manifest::load(&dir.join("plugin.toml")).unwrap()
    }

    #[test]
    fn status_zi_mian_liang_shi_duan_heng_xian_na_tao() {
        assert_eq!(probe_state_str(ProbeState::Ready), "ready");
        assert_eq!(probe_state_str(ProbeState::Missing), "missing");
        assert_eq!(probe_state_str(ProbeState::Unknown), "unknown");
    }

    #[test]
    fn frame_kuai_li_plugin_zi_ji_write_de_address_hui_bei_mo_diao() {
        let mut v = serde_json::json!({
            "kind": "frame",
            "url": "https://example.com/\u{5077}\u{6765}\u{7684}",
            "alive": true,
            "height": 520
        });
        let map = v.as_object_mut().unwrap();
        map.remove("url");
        map.remove("alive");
        map.insert("url".to_owned(), serde_json::Value::Null);
        map.insert("alive".to_owned(), serde_json::Value::Bool(false));
        assert_eq!(v["url"], serde_json::Value::Null, "\u{62d3}\u{5c55}\u{5199}\u{7684}\u{5730}\u{5740}\u{5fc5}\u{987b}\u{88ab}\u{62b9}\u{6389}");
        assert_eq!(v["alive"], serde_json::Value::Bool(false));

        assert_eq!(v["height"], 520);
    }

    #[test]
    fn manifest_li_de_ru_kou_mo_ban_an_document_zhan_kai() {
        let m = zao_manifest("tpl");
        let spec = m.devserver.as_ref().expect("[devserver] \u{8be5}\u{5728}");
        assert_eq!(spec.entry_name(7).unwrap(), ".nota-tpl-7.md");
    }

    fn jia_jie_lun() -> Probe {
        Probe {
            state: ProbeState::Ready,
            command: "npx @slidev/cli".to_owned(),
            version: Some("53.0.0".to_owned()),
            detail: String::new(),
            root: None,
            marker_found: true,
            need_found: None,
        }
    }

    #[test]
    fn tan_de_guo_cheng_zhong_zai_wen_bu_hui_you_kai_yi_tiao() {
        let c = ProbeCache::new();
        assert!(
            matches!(c.qu_huo_zhan_wei("nota.a", &None, &None), Peek::Go),
            "\u{7b2c}\u{4e00}\u{6b21}\u{8be5}\u{53bb}\u{5f00}\u{63a2}\u{6d4b}"
        );
        assert!(
            matches!(c.qu_huo_zhan_wei("nota.a", &None, &None), Peek::Running),
            "\u{8fd8}\u{5728}\u{63a2}\u{7684}\u{65f6}\u{5019}\u{518d}\u{95ee}\u{ff0c}\u{8be5}\u{8bf4}\u{300c}\u{5728}\u{63a2}\u{300d}\u{800c}\u{4e0d}\u{662f}\u{518d}\u{5f00}\u{4e00}\u{6761}"
        );
        c.receive_xia("nota.a", &None, &None, jia_jie_lun());
        assert!(
            matches!(c.qu_huo_zhan_wei("nota.a", &None, &None), Peek::Ready(_)),
            "\u{7ed3}\u{8bba}\u{56de}\u{6765}\u{4e86}"
        );
    }

    #[test]
    fn huan_le_xiang_mu_root_yao_zhong_tan() {
        let c = ProbeCache::new();
        c.receive_xia("nota.a", &None, &None, jia_jie_lun());
        assert!(matches!(
            c.qu_huo_zhan_wei("nota.a", &None, &None),
            Peek::Ready(_)
        ));
        let bie_de_root = Some("/tmp/\u{522b}\u{7684}\u{9879}\u{76ee}".to_owned());
        assert!(
            matches!(c.qu_huo_zhan_wei("nota.a", &bie_de_root, &None), Peek::Go),
            "\u{6839}\u{6362}\u{4e86}\u{8981}\u{91cd}\u{63a2}"
        );
    }

    #[test]
    fn huan_le_yao_wen_de_dong_xi_ye_yao_zhong_tan() {
        let c = ProbeCache::new();
        let root_2 = Some("/tmp/\u{9879}\u{76ee}".to_owned());
        let jia_4 = Some("node_modules/@slidev/theme-default".to_owned());
        let yi_2 = Some("node_modules/@slidev/theme-seriph".to_owned());
        assert!(matches!(
            c.qu_huo_zhan_wei("nota.a", &root_2, &jia_4),
            Peek::Go
        ));
        c.receive_xia("nota.a", &root_2, &jia_4, jia_jie_lun());
        assert!(
            matches!(c.qu_huo_zhan_wei("nota.a", &root_2, &jia_4), Peek::Ready(_)),
            "\u{540c}\u{4e00}\u{4e2a}\u{95ee}\u{9898}\u{6709}\u{7ed3}\u{8bba}"
        );
        assert!(
            matches!(c.qu_huo_zhan_wei("nota.a", &root_2, &yi_2), Peek::Go),
            "\u{6362}\u{4e86}\u{4e2a}\u{4e1c}\u{897f}\u{8981}\u{91cd}\u{63a2}"
        );
    }

    #[test]
    fn gei_cuo_root_de_jie_lun_hui_bei_diu_diao() {
        let c = ProbeCache::new();
        let xin_root = Some("/tmp/\u{65b0}".to_owned());
        assert!(matches!(
            c.qu_huo_zhan_wei("nota.a", &xin_root, &None),
            Peek::Go
        ));

        c.receive_xia("nota.a", &None, &None, jia_jie_lun());
        assert!(
            matches!(c.qu_huo_zhan_wei("nota.a", &xin_root, &None), Peek::Running),
            "\u{65e7}\u{6839}\u{7684}\u{7ed3}\u{8bba}\u{4e0d}\u{8bb8}\u{9876}\u{66ff}\u{65b0}\u{6839}\u{90a3}\u{6b21}\u{63a2}\u{6d4b}"
        );
    }

    #[test]
    fn check_zhong_na_zhang_table_bu_dai_hai_mei_kan_guo_de_shi_shi() {
        let lua = Lua::new();
        let m = zao_manifest("checking");
        let spec = m.devserver.as_ref().expect("[devserver] \u{8be5}\u{5728}");
        let t = check_zhong_table(&lua, spec, Some(Path::new("/tmp/\u{9879}\u{76ee}"))).unwrap();

        assert_eq!(t.get::<String>("state").unwrap(), "checking");
        assert_eq!(t.get::<String>("command").unwrap(), spec.command());
        assert_eq!(t.get::<String>("root").unwrap(), "/tmp/\u{9879}\u{76ee}");
        assert!(
            t.get::<Value>("marker_found").unwrap().is_nil(),
            "\u{8fd8}\u{6ca1}\u{770b}\u{5c31}\u{8bf4}\u{300c}\u{6ca1}\u{627e}\u{5230}\u{300d}\u{ff0c}\u{7b49}\u{4e8e}\u{66ff}\u{62d3}\u{5c55}\u{4e0b}\u{4e86}\u{7ed3}\u{8bba}"
        );
        assert!(t.get::<Value>("version").unwrap().is_nil());
        assert!(t.get::<Value>("detail").unwrap().is_nil());
        assert!(
            t.get::<Value>("need_found").unwrap().is_nil(),
            "`nil` = \u{6ca1}\u{95ee}\u{8fc7}\u{ff0c}`false` = \u{95ee}\u{4e86}\u{6ca1}\u{6709}\u{2014}\u{2014}\u{8fd9}\u{4e00}\u{6863}\u{8fde}\u{95ee}\u{90fd}\u{6ca1}\u{95ee}"
        );
    }
}
