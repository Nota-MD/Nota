//! 注入给插件的 `nota.*` 表。
//!
//! # 一条硬规矩：**按能力装表，不装空壳**
//!
//! 插件没申请 `document.read`，`nota.document` 就是 `nil`。**不要**给它装一张
//! 调用时才报"你没权限"的表——那既让插件作者在开发期发现不了问题（写完才炸），
//! 也让"权限"变成一句运行时的客气话而不是一道结构上的墙。
//!
//! 唯一的例外是本文件里那几个**永远可用**的东西（`log` / `command` / `event` /
//! `diff` / `i18n` / `version` / `plugin_id`）：它们不碰文档也不碰磁盘，是插件跟自己、
//! 跟宿主说话用的，或者（`diff` / `i18n`）是**纯的**——前者一段文本进一段文本出，
//! 后者只读插件自己目录里的 `lang/<tag>.toml`（理由见 `api/i18n.rs` 顶上那段）。
//!
//! # 加新成员时的判据
//!
//! 见 `plugin/manifest.rs` 顶上那段：**加成员不动 API 版本号，改语义/改名才动**。

pub mod data;
pub mod devserver;
pub mod diff;
pub mod document;
pub mod fs;
pub mod git;
pub mod http;
pub mod i18n;
pub mod review;
pub mod settings;
pub mod time;
pub mod ui;
pub mod unified_diff;

use mlua::{Lua, Table, Value};

use crate::error::NotaError;
use crate::plugin::manifest::{Capability, Manifest, NOTA_PLUGIN_API_VERSION};
use crate::lua::HostContext;

/// 把 `NotaError` 转成 Lua 错误。统一从这一处走，报错信息里一定带得出人话。
pub fn lua_err(e: NotaError) -> mlua::Error {
    mlua::Error::RuntimeError(e.to_string())
}

/// 组装整张 `nota` 表。
pub fn build(
    lua: &Lua,
    manifest: &Manifest,
    ctx: &HostContext,
    语言: &i18n::语言包,
) -> Result<Table, NotaError> {
    let nota = lua.create_table().map_err(mlua_to_nota)?;

    // ── 永远可用：身份 ────────────────────────────────────────────────────
    set(nota.set("version", env!("CARGO_PKG_VERSION")), lua)?;
    set(nota.set("api_version", NOTA_PLUGIN_API_VERSION), lua)?;
    set(nota.set("plugin_id", manifest.meta.id.clone()), lua)?;

    // ── 永远可用：日志 ────────────────────────────────────────────────────
    // 前缀统一加上插件 id，多插件同时刷输出时分得清是谁。
    //
    // ⚠️ 这一族**也走调试闸门**（2026-09-25）：默认一个插件日志都不打。
    // 理由和宿主自己的日志一样——它只到 stderr，从图标启动的人永远看不到，
    // 而看得到的人（终端里跑的开发者）会被刷屏。想看就 `NOTA_DEBUG=1`。
    // ⚠️ 所以插件**别拿它当用户提示**：要对用户说话就走 `nota.ui.notify`。
    let prefix = format!("[nota:{}]", manifest.meta.id);
    let log = lua.create_table().map_err(mlua_to_nota)?;
    for (name, level) in [("info", "INFO"), ("warn", "WARN"), ("error", "ERROR")] {
        let p = prefix.clone();
        let f = lua
            .create_function(move |_, msg: Value| {
                crate::日志!("{p} {level} {}", value_to_text(&msg));
                Ok(())
            })
            .map_err(mlua_to_nota)?;
        set(log.set(name, f), lua)?;
    }
    set(nota.set("log", log), lua)?;

    // ── 永远可用：命令注册 ────────────────────────────────────────────────
    set(
        nota.set("command", command_table(lua, &manifest.meta.id)?),
        lua,
    )?;

    // ── 永远可用：事件 ────────────────────────────────────────────────────
    set(nota.set("event", event_table(lua, ctx)?), lua)?;

    // ── 永远可用：改动块（`nota.diff`）────────────────────────────────────
    //
    // 2026-09-24 加，跟 AI 插件那张「对话框」一起长出来的。判据与上面那几样
    // 一致：**它是纯的**——一段文本进、一段文本出，不碰文档、不碰磁盘、不碰网络，
    // 插件拿它做不出清单之外的事，所以不需要申请任何能力。
    //
    // ⚠️ 它**不是 AI 专有的**：界面上那块 `kind = "diff"` 的渲染本来就在宿主里
    //（`src/ui/panel-nodes.ts` 的白名单），格式的定义放这边才不会两边各写一份。
    // 详见 `lua/api/diff.rs` 顶上那段。
    set(nota.set("diff", diff::build(lua)?), lua)?;

    // ── 永远可用：插件自己的文案表（`nota.i18n`）──────────────────────────
    //
    // 2026-09-25 加，用户那句「插件也支持（多语言）。插件必须包含英语」。
    // 判据与 `diff` 是同一条：**它只碰插件自己的东西**——表是宿主按清单里的
    // `langs` 协商好、从插件目录里读出来的，插件拿它读不到清单之外的任何路径。
    //
    // ⚠️ 协商与读表在**加载时**就做完了（`i18n::装`，见 `lua/mod.rs::LuaPlugin::load`），
    // 所以这里只是把结果装成一张表。换语言要重启，理由写在 `settings/general.rs`
    // 的 `language` 字段注释里。
    set(
        nota.set("i18n", i18n::build(lua, 语言, ctx.应用语言.as_str())?),
        lua,
    )?;

    // ── 永远可用：墙钟（`nota.time`）────────────────────────────────────────
    //
    // 2026-09-27 加，给"写作统计"的**今日**那一步（`docs/07` 第 65 项第二轮）。
    // 判据与 `diff` / `i18n` 一致：**它不碰用户的任何数据**——只是把系统时钟
    // 报一遍（连文档都不读）。⚠️ 沙箱里没有 `os`，插件手上唯一的另一个时间是
    // `document.stats().clock_ms`，那是**单调钟**、回答不了"今天是哪一天"。
    // 详情见 `api/time.rs` 顶上那段。
    set(nota.set("time", time::build(lua)?), lua)?;

    // ── 按能力装 ──────────────────────────────────────────────────────────
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

    // `process.devserver`：宿主替插件起**清单里 `[devserver]` 声明的那一条命令**。
    //
    // ⚠️ 判据与 `process.git` 是同一条：能力放行的是**那一条命令**，不是"任意进程"。
    // Lua 那边交不出第二个程序名来——`nota.devserver.start` 只收"哪份文档"。
    // 细节与"为什么这套机制在宿主而不在插件里"见 `api/devserver.rs` 文件头。
    if manifest.has(Capability::ProcessDevServer) {
        set(
            nota.set("devserver", devserver::build(lua, manifest, ctx)?),
            lua,
        )?;
    }

    // ⚠️ 三条能力**都要列上**。这里漏一个，申请了那个能力的插件就拿不到 `nota.ui`
    // 这张表（`nil`），进而 `attempt to index a nil value`。
    // 漏 `UiMenu` 是 BUG-8：`ui.menu` 这一条能力曾经形同虚设，
    // 因为 `ui.rs` 表内虽然按 `UiMenu` 装了 `register_menu`，但**表本身**装不出来。
    // 里面有判据、外面也得有——两处是**相乘**的关系，不是一个能代替另一个。
    //
    // 判据剥成了 `装_ui吗()`：`build()` 要真的 `AppHandle`，构造不出来，
    // 而这条判断是纯的、正是最该被用例钉住的那一条（BUG-8 就是它的锅）。
    if 装_ui吗(manifest) {
        set(nota.set("ui", ui::build(lua, manifest, ctx)?), lua)?;
    }

    // ⚠️ 这两张表**曾经是空壳**：`network.http` 与 `settings.own` 在 2026-09-24 之前
    // 装的是「会明说尚未实现」的假表（那个 `not_implemented()` 辅助函数已经删了）。
    // 那份诚实是有用的（总比 `attempt to index a nil value` 强，后者会让人以为
    // 自己能力没申请对，白查半天），但**空壳终究是空壳**——AI 插件因此只能预览、
    // 存不住密钥。本轮（`docs/07` 第 12、13 项）两样都真做出来了，
    // 所以**本文件里再没有"装了但不能用"的表**：`nil` 只意味着"没申请"。
    if manifest.has(Capability::NetworkHttp) {
        set(nota.set("http", http::build(lua)?), lua)?;
    }

    if manifest.has(Capability::SettingsOwn) {
        set(nota.set("settings", settings::build(lua, &manifest.meta.id)?), lua)?;
    }

    // `data.own`：插件自己的数据目录（`api/data.rs`）。
    //
    // ⚠️ 与上面那条 `settings.own` 是**两件事**，别合并：设置是**用户该能改的
    // 偏好**（放 `config`、0600、里面有明文密钥那一族），数据是**插件自己写的账**
    // （放 `data`）。判据与"为什么另开一张表"写在 `api/data.rs` 文件头。
    if manifest.has(Capability::DataOwn) {
        set(nota.set("data", data::build(lua, &manifest.meta.id)?), lua)?;
    }

    Ok(nota)
}

/// `nota.command` —— 注册命令给宿主/前端调。
fn command_table(lua: &Lua, plugin_id: &str) -> Result<Table, NotaError> {
    let t = lua.create_table().map_err(mlua_to_nota)?;

    // 命令表存在 registry 里，`LuaPlugin::call_command` 按名字取。
    let commands = lua.create_table().map_err(mlua_to_nota)?;
    lua.set_named_registry_value("nota_commands", commands)
        .map_err(mlua_to_nota)?;

    let id = plugin_id.to_owned();
    let register = lua
        .create_function(move |lua, (name, f): (String, mlua::Function)| {
            if name.is_empty() {
                return Err(mlua::Error::RuntimeError("命令名不能为空".to_owned()));
            }
            let commands: Table = lua.named_registry_value("nota_commands")?;
            // 同名覆盖要报出来：多半是复制粘贴改漏了，静默覆盖会让人对着
            // "怎么点下去跑的是另一个函数"查到天亮。
            if let Ok(Value::Function(_)) = commands.get::<Value>(name.as_str()) {
                return Err(mlua::Error::RuntimeError(format!(
                    "拓展 {id} 重复注册命令 `{name}`"
                )));
            }
            commands.set(name, f)?;
            Ok(())
        })
        .map_err(mlua_to_nota)?;

    set(t.set("register", register), lua)?;
    Ok(t)
}

/// `nota.event` —— 发事件给前端。
///
/// 本轮只做**插件 → 前端**这一个方向（`emit`）。前端 → 插件那一侧由命令承担，
/// `nota.command.register` 就是那条路——两条路各管一头，别混。
fn event_table(lua: &Lua, ctx: &HostContext) -> Result<Table, NotaError> {
    use tauri::Emitter;

    let t = lua.create_table().map_err(mlua_to_nota)?;

    let app = ctx.app.clone();
    // ⚠️ 用 `channel_id()` 而不是原样的 id：清单里的 id 允许 `.`（`nota.git`），
    // 而 Tauri 的事件名不认点。见 `manifest::channel_id` 的说明与 `docs/07` BUG-3。
    let plugin_id = crate::plugin::manifest::channel_id(&ctx.plugin_id);
    let emit = lua
        .create_function(move |lua, (name, payload): (String, Value)| {
            // 事件名统一加 `plugin:` 前缀，前端一眼看得出是从插件来的，
            // 也不会跟宿主自己的事件名撞。
            let channel = format!("plugin:{plugin_id}:{name}");
            let json = lua_to_json(lua, payload)?;
            app.emit(&channel, json)
                .map_err(|e| mlua::Error::RuntimeError(format!("发事件 {channel} 失败：{e}")))?;
            Ok(())
        })
        .map_err(mlua_to_nota)?;

    set(t.set("emit", emit), lua)?;
    Ok(t)
}

// ── 小工具 ────────────────────────────────────────────────────────────────

/// `Table::set` 返回 `Result<()>`，串起来写会很难看。这个把 `mlua::Error`
/// 转成 `NotaError` 好让 `?` 一路走到底。
fn set(r: mlua::Result<()>, _lua: &Lua) -> Result<(), NotaError> {
    r.map_err(mlua_to_nota)
}

pub fn mlua_to_nota(e: mlua::Error) -> NotaError {
    NotaError::other(format!("Lua：{e}"))
}

/// 把 Lua 值渲染成人看的文本（给日志用）。
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

/// Lua 值 → JSON，用于跨 IPC 发出去。
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
            // 是数组还是字典？Lua 里只有 table，靠"有没有 1..n 连续整数键"判。
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

/// JSON → Lua 值。**`lua_to_json` 的逆**，目前只有一处用得上：
/// `nota.http` 把响应体顺手拆开（见 `http.rs::收口`）。
///
/// ⚠️ **没有给插件一张 `nota.json` 表，这是有意的。** 现在只有"读 HTTP 响应"
/// 这一处需要解析 JSON，而多一张表就多一份要维护、要写文档、要进能力申请的
/// API 面。等真出现第二个需要它的地方再抽出去——那时这条注释就是判断的依据。
///
/// ⚠️ `null` 映射成 `nil`，于是 JSON 里值为 `null` 的键在 Lua 表里**不存在**。
/// 这是 Lua 的固有性质（表里存不了 nil），不是设计上的选择：插件那边读不到
/// 某个键时不能假定"上游一定给了非空值"。
///
/// ⚠️ 不自己限嵌套层数：`serde_json::from_str` 有 128 层的解析上限
/// （默认开着），能走到这里的结构就不可能更深，递归深度跟着它封顶。
pub fn json_to_lua(lua: &Lua, v: &serde_json::Value) -> mlua::Result<Value> {
    Ok(match v {
        serde_json::Value::Null => Value::Nil,
        serde_json::Value::Bool(b) => Value::Boolean(*b),
        serde_json::Value::Number(n) => match n.as_i64() {
            Some(i) => Value::Integer(i),
            // 小数、以及超出 i64 的大整数，走浮点。
            None => Value::Number(n.as_f64().unwrap_or(0.0)),
        },
        serde_json::Value::String(s) => Value::String(lua.create_string(s)?),
        serde_json::Value::Array(a) => {
            let t = lua.create_table()?;
            // ⚠️ 从 **1** 开始：Lua 的数组下标从 1 起，`t.raw_len()` 也按这个算。
            // 写成 0 起的话，`#json.choices` 会少一个，而第一个元素被静默丢掉。
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

/// 装 `nota.ui` 这张表需要哪些能力。
///
/// ⚠️ **`ui.rs` 里每多一个 `manifest.has(Capability::Ui…)`，这里就要多一项。**
/// 两处是**相乘**的关系：里面那个判据决定"表里有没有这个函数"，
/// 外面这个决定"表本身在不在"。漏一个就是 **BUG-8**——
/// 只申请 `ui.menu` 的插件曾经连 `nota.ui` 都拿不到，`register_menu` 无从谈起。
///
/// 写成数组而不是一串 `||`，是为了让用例能**遍历它**（见下面的 `tests`）：
/// 加能力时只要往数组里加一项，用例自动覆盖到。
const UI能力: [Capability; 4] = [
    Capability::UiNotify,
    Capability::UiPanel,
    Capability::UiMenu,
    Capability::UiOpenUrl,
];

/// `nota.ui` 这张表装不装。**纯函数**，单独剥出来是为了能被用例钉住。
fn 装_ui吗(manifest: &Manifest) -> bool {
    UI能力.iter().any(|c| manifest.has(*c))
}

#[cfg(test)]
mod tests {
    use super::*;

    /// 能力 → 清单里那个字符串。
    ///
    /// 用 serde 拿（`Capability` 上每条都有 `#[serde(rename = "…")]`），
    /// 不为测试专门加一个 `as_str()`。
    fn 能力名(c: Capability) -> String {
        serde_json::to_value(c).unwrap().as_str().unwrap().to_owned()
    }

    /// 写一份最小清单并读回来。与 `plugin/manifest.rs` 的用例同一个路子。
    fn 造清单(名字: &str, 能力: &[Capability]) -> Manifest {
        let dir = std::env::temp_dir().join(format!("nota-api-test-{名字}"));
        let _ = std::fs::remove_dir_all(&dir);
        std::fs::create_dir_all(&dir).unwrap();
        let caps = 能力
            .iter()
            .map(|c| format!("\"{}\"", 能力名(*c)))
            .collect::<Vec<_>>()
            .join(", ");
        std::fs::write(
            dir.join("plugin.toml"),
            format!(
                // ⚠️ 版本号用**常量**插值：宿主升版本时这份夹具跟着走。
                // 写死一个数的话，那条 API 版本精确匹配的规矩会让这里先红——
                // 而红灯指的方向（"改夹具里的数字"）与真正要改的东西毫无关系。
                "[plugin]\nid = \"nota.{名字}\"\nname = \"T\"\napi = {版本}\ncapabilities = [{caps}]\n",
                版本 = NOTA_PLUGIN_API_VERSION
            ),
        )
        .unwrap();
        Manifest::load(&dir.join("plugin.toml")).unwrap()
    }

    /// ⚠️ **这条就是 BUG-8 的回归用例。**
    ///
    /// `ui.rs` 里三个函数各自判一次能力，但**表本身**是这里判的。
    /// 曾经这里只写了 `ui.notify || ui.panel`，于是 `UI能力` 里的 `ui.menu`
    /// 判不出 `true`——只申请 `ui.menu` 的插件拿到 `nota.ui == nil`。
    #[test]
    fn 每一条_ui_能力都能单独装出_nota_ui() {
        for (i, c) in UI能力.iter().enumerate() {
            let m = 造清单(&format!("u{i}"), &[*c]);
            assert!(
                装_ui吗(&m),
                "只申请 `{}` 也应该装出 nota.ui —— 漏了它，拓展会拿到 nil 并报 \
                 `attempt to index a nil value`（BUG-8）",
                能力名(*c)
            );
        }
    }

    #[test]
    fn 没申请_ui_能力就不装_nota_ui() {
        // 按能力装表、不装空壳：没申请就是 nil，不是"存在但调用时报错"。
        // ⚠️ 目录名只能是 ASCII——清单的 id 过校验，`nota.空` 这种会被 `load` 拦下。
        let m = 造清单("empty", &[Capability::ProcessGit, Capability::DocumentRead]);
        assert!(!装_ui吗(&m), "没申请任何 ui.* 的拓展不该拿到 nota.ui");
    }

    /// ⚠️ **`UI能力` 与 `ui.rs` 里实际的判据必须一一对应。**
    ///
    /// Rust 没有反射，这条推不出来，所以退一步钉"数量"：
    /// 谁往 `ui.rs` 加了第四个 `ui.*` 判据，这条就会红，于是被提醒来改 `UI能力`。
    #[test]
    fn ui_能力清单要和_ui_rs_对得上() {
        let src = include_str!("ui.rs");
        let 实际 = src.matches("manifest.has(Capability::Ui").count();
        assert_eq!(
            实际,
            UI能力.len(),
            "`ui.rs` 里有 {实际} 处 `manifest.has(Capability::Ui…)`，\
             而 `UI能力` 只有 {} 项。两处必须一一对应：往 `UI能力` 补上缺的那一项，\
             并在 `api/mod.rs` 的表装配里也带上它——漏一项 = 那条能力形同虚设（BUG-8）",
            UI能力.len()
        );
    }

    /// `#[serde(rename)]` 与 `Capability::parse()` 必须说同一套名字。
    ///
    /// 这两处是**各写各的**（一个在属性上，一个在 `match` 里），
    /// 任一处改了另一处没改，插件清单就会出现"写得进、读不出"或反过来。
    /// 本用例的 `造清单` 正是靠 `能力名()` 拼清单再让 `parse()` 读回来，
    /// 任何不一致都会在这里炸。
    #[test]
    fn 能力的_serde_名字与_parse_说同一套话() {
        for c in UI能力 {
            let 名 = 能力名(c);
            assert_eq!(
                Capability::parse(&名).unwrap(),
                c,
                "`{名}` 这个名字 `parse()` 认，但认回来的不是同一个变体"
            );
        }
    }
}
