//! `nota.ui` —— 插件往外壳里放东西。
//!
//! 插件能放三样：**通知**、**面板**、**菜单项**。它们分两类，**别混**：
//!
//! | | 是什么 | 怎么走 |
//! |---|---|---|
//! | 通知 | 一件**此刻发生**的事 | 推（`app.emit("nota:notify")`） |
//! | 面板 / 菜单项 | 一份**启动时声明、之后一直成立**的状态 | 拉（写进 registry，宿主按需读） |
//!
//! # ⚠️ 为什么面板和菜单不能推（BUG-13）
//!
//! `register_panel` / `register_menu` 是在**插件加载时**跑的（`setup()` 阶段），
//! 前端那时还没挂载、`listen()` 还没注册。推出去**没人收，而且不报错**——
//! Tauri 对没有监听者的频道 emit 是成功的。症状是"界面看着好好的，只是永远空着"。
//!
//! 修法不是"发两遍"或"起来后重放"，而是**根本不要发**：声明进 registry，
//! 前端挂载后调 `nota_plugin_panels` / `nota_plugin_menus` 拉一次。
//! 仓库里 `nota_commands` 一直是这个范式。完整理由见 `plugin/mod.rs::panels`。
//!
//! # 面板**内容**：声明式 DSL，2026-09-24 落地（`docs/07` 第 15 项）
//!
//! `register_panel` 多收一个 `render` 函数；它返回一串**内容块**，前端按白名单渲染：
//!
//! ```lua
//! nota.ui.register_panel({
//!   id = "git", title = "Git",
//!   render = function()
//!     return {
//!       { kind = "heading", text = "main" },
//!       { kind = "list", items = { { title = "a.md", badge = "已修改" } } },
//!       { kind = "buttons", items = { { label = "刷新", command = "refresh" } } },
//!     }
//!   end,
//! })
//! ```
//!
//! ⚠️ **内容仍然只由宿主和插件两方共同认识的形状构成**，插件写不出 HTML、
//! 也写不出脚本。前端那边是白名单渲染：认不出的 `kind` 如实显示"不认识"，
//! **不**退化成 `dangerouslySetInnerHTML`。理由见 `docs/12` §面板内容。
//!
//! ## 为什么内容要**拉**、而不是让插件把内容 emit 出来
//!
//! 同下面那条判据：面板内容是**状态**（"现在有哪些改动"），不是**发生的事**。
//! 所以前端打开面板时拉一次（`nota_plugin_panel_content`），插件只在
//! **自己知道内容变了**的时候喊一声 `nota.ui.refresh(id)`。
//!
//! ⚠️ 那一声**只是提示，丢了不影响正确性**：插件刷新时面板可能还没被打开，
//! 事件没人收；但用户打开面板时一定会拉一次，拉到的就是当时的内容。
//! 这条与 BUG-13 的教训一致，而不是它的例外。

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
                .map_err(|e| mlua::Error::RuntimeError(format!("发通知失败：{e}")))?;
                Ok(())
            })
            .map_err(mlua_to_nota)?;
        t.set("notify", notify).map_err(mlua_to_nota)?;
    }

    if manifest.has(Capability::UiPanel) {
        let 注册 = 面板表(lua, &manifest.meta.id).map_err(mlua_to_nota)?;
        t.set("register_panel", 注册).map_err(mlua_to_nota)?;
        // `nota.ui.refresh()` —— **"我这边的面板内容变了"**，前端收到就重拉。
        // 与 `register_panel` 同属"面板"这件事，所以同一条能力管着它。
        let 刷新 = 刷新表(lua, &manifest.meta.id, ctx.app.clone()).map_err(mlua_to_nota)?;
        t.set("refresh", 刷新).map_err(mlua_to_nota)?;
        // `nota.ui.review(id)` —— 把**已经在册的这个面板**摊到编辑区里（`nil` 收起来）。
        // 同属"面板"这件事，所以同一条能力管着它。
        let 预览 =
            super::review::预览表(lua, &manifest.meta.id, ctx.app.clone()).map_err(mlua_to_nota)?;
        t.set("review", 预览).map_err(mlua_to_nota)?;
        // `nota.ui.review_diff{...}` —— 在编辑区里**原地**画一份改动（2026-09-26）。
        // 与上面那条同一件事的另一种形态（都占"编辑区那一格"），所以同一条能力。
        let 预览改动 = super::review::预览改动表(lua, &manifest.meta.id, ctx.app.clone())
            .map_err(mlua_to_nota)?;
        t.set("review_diff", 预览改动).map_err(mlua_to_nota)?;
    }

    if manifest.has(Capability::UiMenu) {
        let 注册 = 菜单表(lua, &manifest.meta.id).map_err(mlua_to_nota)?;
        t.set("register_menu", 注册).map_err(mlua_to_nota)?;
    }

    // `nota.ui.open_url` —— **在用户的默认浏览器里打开一个网页**。
    //
    // 与面板里那块 `kind = "frame"` 是两件事，别混：
    //
    // - `frame` 是**嵌在 Nota 里**看，而且地址由宿主填（只能指向插件自己那场
    //   devserver 会话，见 `lua/api/devserver.rs`）；
    // - `open_url` 是**跳出 Nota**，把页面交给用户的浏览器——从一个本地预览
    //   跳去"在浏览器里打开"（能全屏演示、能用浏览器插件）走的是这条。
    if manifest.has(Capability::UiOpenUrl) {
        let 打开 = 打开网址表(lua, ctx.app.clone()).map_err(mlua_to_nota)?;
        t.set("open_url", 打开).map_err(mlua_to_nota)?;
    }

    Ok(t)
}

/// `nota.ui.open_url(url)` —— 交给系统默认浏览器。
///
/// # ⚠️ 只放行 `https`
///
/// 这一条的边界是**协议**，不是域名。判据：`open_url` 的风险不在"用户看到什么"，
/// 而在"用户点开之后那个程序会去干什么"——而 `file://` 能开本机任意路径、
/// `mailto:`/自注册的 scheme 能拉起别的程序、`javascript:` 之类在某些处理程序里
/// 更是直接执行。只放 `https` 就一次把这些全关掉。
///
/// 为什么连 `http` 都不放：**这个能力是给"跳去某个正经页面"用的**（文档站、
/// 编辑器主页、预览的"在浏览器里打开"），而这些今天都是 `https`。要放 `http`
/// 得先有一个真的案例，而不是"万一有人要"。
///
/// ⚠️ 本机开发服务器的地址是 `http://localhost:…`，**故意不放行**：
/// 那种地址该走面板里的 `frame` 块（宿主自己填、看得见、关得掉），
/// 而不是把用户踢到浏览器里去。真要给，那是另一条能力、另一个决定。
fn 打开网址表(lua: &Lua, app: tauri::AppHandle) -> mlua::Result<mlua::Function> {
    use tauri_plugin_opener::OpenerExt;

    lua.create_function(move |_, url: String| {
        let trimmed = url.trim();
        if !trimmed.starts_with("https://") {
            return Err(mlua::Error::RuntimeError(format!(
                "nota.ui.open_url 只接受 `https://` 开头的地址（收到的是 `{}`）",
                trimmed.chars().take(40).collect::<String>()
            )));
        }
        app.opener()
            .open_url(trimmed, None::<&str>)
            .map_err(|e| mlua::Error::RuntimeError(format!("打不开这个地址：{e}")))?;
        Ok(())
    })
}

/// `nota.ui.register_panel`，**不含 `ctx`**。
///
/// 剥出来的理由与 `api/mod.rs::装_ui吗` 同一条：`build()` 要真的 `AppHandle`，
/// 用例里构造不出来，而"**注册进去的东西读得回来吗**"正是 BUG-13 的病灶
/// ——写的在一处、读的在另一处，两边都改了才算对。
/// 剥成纯函数，用例就能拿 `Lua::new()` 把整个来回走一遍。
pub(crate) fn 面板表(lua: &Lua, plugin_id: &str) -> mlua::Result<mlua::Function> {
    // 先把账本建出来，闭包再往里追加。与 `command_table` 同一形状：
    // registry 的值在 `build` 时就位，注册函数只管读回来写。
    lua.set_named_registry_value(REG_PANELS, lua.create_table()?)?;
    let plugin_id = plugin_id.to_owned();

    let register = lua
        .create_function(move |lua, spec: Table| {
            let id: String = spec
                .get("id")
                .map_err(|_| mlua::Error::RuntimeError("register_panel 需要 `id` 字段".to_owned()))?;
            let title: String = spec.get("title").unwrap_or_else(|_| id.clone());

            // 存归一化过的完整快照，**存的就是前端要的字段**：
            // 宿主读取侧只做搬运，不再补默认值。默认值只在这里定一次——
            // 那边再定一次就是又一对"两处相乘"。
            let entry = lua.create_table()?;
            entry.set("id", id.clone())?;
            entry.set("title", title)?;
            if let Ok(Some(icon)) = spec.get::<Option<String>>("icon") {
                entry.set("icon", icon)?;
            }
            // 默认 `right`（右侧插件栏）——用户 2026-09-22 定的。
            // 旧的 `sidebar` 是左栏还兼职装插件时的事，那一页已经搬走了。
            //
            // ⚠️ 这里**不校验取值**（`left` 之类照样存下来）：认不出的位置前端
            // 会如实列在「插件」页里（"没有落脚处"），那比"注册时就报错、
            // 于是插件整块加载失败"好——位置写错的插件别的东西还能用。
            //
            // 目前约定俗成的三个值：`right`（右侧栏一页）、`main`（编辑区，
            // 由插件喊 `nota.ui.review(id)` 摊开，见下面的 `预览表`）、
            // 以及还没落脚处的 `left`。
            entry.set(
                "location",
                spec.get::<Option<String>>("location")
                    .ok()
                    .flatten()
                    .unwrap_or_else(|| "right".to_owned()),
            )?;

            // 要不要放宽（见 `plugin/mod.rs::PluginPanel::wide`）。
            // 写成 `if true` 才存，是为了让"没写"和"写 false"在 registry 里
            // 长得一样——读取侧于是只用一条 `unwrap_or(false)`。
            if spec.get::<Option<bool>>("wide").ok().flatten() == Some(true) {
                entry.set("wide", true)?;
            }

            // 要不要**跟着时间自己动**（见 `plugin/mod.rs::PluginPanel::live`）。
            // 写成 `if true` 才存，理由同上面那条 `wide`——让"没写"和"写 false"
            // 在 registry 里长得一样，读取侧于是只用一条 `unwrap_or(false)`。
            if spec.get::<Option<bool>>("live").ok().flatten() == Some(true) {
                entry.set("live", true)?;
            }

            // `render` 是**函数**，不是数据——所以它只活在 registry 里，
            // 由 `面板内容()` 现调现取，**不进 `PluginPanel` 那个快照**。
            // ⚠️ 前端拿到的面板清单里**没有**它，也不需要：清单回答"有哪些面板"，
            // 内容回答"这个面板现在长什么样"，两个问题两条路（`docs/12` §面板内容）。
            match spec.get::<mlua::Value>("render") {
                Ok(mlua::Value::Nil) => {}
                Ok(mlua::Value::Function(f)) => entry.set("render", f)?,
                // 写错了要当场说，别等到用户打开面板时才发现——
                // 那时报错的地方离病因（插件里 `render` 写成了表）已经很远了。
                Ok(_) => {
                    return Err(mlua::Error::RuntimeError(format!(
                        "插件 {plugin_id} 的面板 `{id}`：`render` 必须是一个函数"
                    )))
                }
                Err(_) => {}
            }

            追加声明(lua, REG_PANELS, "id", &id, &entry, &format!("插件 {plugin_id} 重复注册面板"))?;
            Ok(())
        })?;

    Ok(register)
}

/// `nota.ui.refresh([id])` —— 喊一声"我这边的面板内容变了"。
///
/// 不传 `id` 表示**这个插件的所有面板都该重拉**；传了就只重拉那一个。
///
/// ⚠️ **这是一条"发生了一件事"的事件，所以推是对的**（BUG-13 的判据）。
/// 它推的是"变了"这个**动作**，不是内容本身——内容仍然由前端去拉。
/// 这样即使这一枪没人听到（面板还没打开），用户打开时拉到的东西照样是对的。
///
/// 收在 `ctx.app` 上：`刷新表` 是本文件里少见的**需要 `AppHandle`** 的注册函数
/// （另一个是 `notify`）。所以它没能像 `面板表` / `菜单表` 那样剥成只收 `Lua`
/// 的纯函数，用例也钉不了它的发送侧——**发送侧的形状由 `ipc.ts` 的
/// `events.pluginPanel` 与 `ui/PluginDock.tsx` 的订阅两端对齐**，别只改一边。
pub(crate) fn 刷新表(
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
        .map_err(|e| mlua::Error::RuntimeError(format!("发面板刷新事件失败：{e}")))?;
        Ok(())
    })
}

// ⚠️ `nota.ui.review` / `nota.ui.review_diff` **不在这里**：它们放的是编辑区
// 那一格，两种形态的差别是一整段能自己站住的话，2026-09-26 分到了
// `api/review.rs`（`ui.rs` 这边只剩声明式的那三样：通知、面板、菜单）。

/// 这个插件的 registry 里有没有 `id` 这个面板。
///
/// 只回答"在册与否"——不碰 `render`（那是 [`面板内容`] 的事）。
///
/// ⚠️ `pub(crate)`：`api/review.rs::预览表` 也要问这一句（摊开一个不存在的面板
/// 要当场报，见那条的注释）。判据只有这一份，别在那边再写一遍。
pub(crate) fn 有面板吗(lua: &Lua, id: &str) -> bool {
    let Ok(list) = lua.named_registry_value::<Table>(REG_PANELS) else {
        return false;
    };
    (1..=list.raw_len()).any(|i| {
        matches!(list.raw_get::<Table>(i).and_then(|t| t.get::<String>("id")), Ok(v) if v == id)
    })
}

/// 现调一个面板的 `render`，把结果剥成 JSON 交给前端。
///
/// # 剥的规矩（每一条都是**上限**，不是格式转换）
///
/// | 限制 | 值 | 挡的是 |
/// |---|---|---|
/// | 文本长度 | [`面板文本上限`] 字符 | 一个插件把一整个文件塞进 `text` |
/// | 一层里的项数 | [`面板节点上限`] | 一次渲染出几千行，前端卡死 |
/// | 嵌套层数 | [`面板层数上限`] | 自引用/超深表把栈打穿 |
/// | 值类型 | 只留 nil/bool/number/string/table | 函数、userdata 过不了 JSON |
///
/// ⚠️ **表格当数组还是字典，判据是"有没有连续整数键"**（同 `api/mod.rs::lua_to_json`）。
/// 两处必须同口径，否则同一个 Lua 表在事件里是一种形状、在面板里是另一种形状，
/// 而插件作者只会看见"有时候不灵"。
pub(crate) fn 面板内容(lua: &Lua, plugin_id: &str, panel_id: &str) -> NotaResult<serde_json::Value> {
    let list: Table = lua
        .named_registry_value(REG_PANELS)
        .map_err(|_| NotaError::other(format!("插件 {plugin_id} 没有申请 `ui.panel` 能力")))?;

    for i in 1..=list.raw_len() {
        let Ok(条目) = list.raw_get::<Table>(i) else {
            continue;
        };
        if !matches!(条目.get::<String>("id"), Ok(v) if v == panel_id) {
            continue;
        }

        let Ok(mlua::Value::Function(render)) = 条目.get::<mlua::Value>("render") else {
            // 声明了面板但没给 `render`。**这不算错**——一个插件可以只声明面板
            // 占个位（早期的 `register_panel` 就只有 id/title）。如实说清楚。
            return Err(NotaError::other(format!(
                "插件 {plugin_id} 的面板 `{panel_id}` 没有提供 `render`，所以没有内容可显示"
            )));
        };

        let 值 = render.call::<mlua::Value>(()).map_err(|e| NotaError::Lua {
            plugin: plugin_id.to_owned(),
            message: format!("面板 `{panel_id}` 渲染失败：{e}"),
        })?;

        return Ok(剥成_json(&值, 0));
    }

    Err(NotaError::other(format!(
        "插件 {plugin_id} 没有声明面板 `{panel_id}`"
    )))
}

/// 一条文本最多这么长（字符，不是字节）。超了从尾巴上截，并留一个 `…`。
///
/// ⚠️ 2026-09-24 从 4000 抬到 20000：**对话式面板里的一条消息就是一段回答**，
/// 4000 字会把一段正经的稿子或翻译从中间劈掉，而截断是**静默**的（只留一个
/// `…`），用户会以为模型就写到那儿。这一条是"防手滑"的上限（一个插件把整个
/// 文件塞进 `text`），不是"消息该多长"的规格——**消息长度由插件自己管**，
/// 前端也另有一刀（`panel-nodes.ts` 里 `message` 那一支）。
const 面板文本上限: usize = 20000;

/// 一个数组最多这么多项，一个字典最多这么多键。
const 面板节点上限: usize = 200;

/// 最多往下走这么多层。
const 面板层数上限: usize = 6;

/// Lua 值 → JSON，**带上限**。递归。
fn 剥成_json(v: &mlua::Value, 层: usize) -> serde_json::Value {
    use serde_json::Value as J;

    if 层 > 面板层数上限 {
        return J::Null;
    }

    match v {
        mlua::Value::Nil => J::Null,
        mlua::Value::Boolean(b) => J::Bool(*b),
        mlua::Value::Integer(i) => J::Number((*i).into()),
        mlua::Value::Number(n) => serde_json::Number::from_f64(*n)
            .map(J::Number)
            .unwrap_or(J::Null),
        mlua::Value::String(s) => J::String(截断(&s.to_string_lossy())),
        mlua::Value::Table(t) => {
            let len = t.raw_len();
            if len > 0 {
                let mut arr = Vec::with_capacity(len.min(面板节点上限));
                for i in 1..=len.min(面板节点上限) {
                    if let Ok(x) = t.raw_get::<mlua::Value>(i) {
                        arr.push(剥成_json(&x, 层 + 1));
                    }
                }
                J::Array(arr)
            } else {
                let mut map = serde_json::Map::new();
                for pair in t.pairs::<mlua::Value, mlua::Value>() {
                    let Ok((k, val)) = pair else { continue };
                    // 键只认字符串。数字键的表会被上面那条 `raw_len()` 当成数组，
                    // 走到这里来的表本来就该是"字符串键的字典"。
                    if let mlua::Value::String(ks) = k {
                        map.insert(截断(&ks.to_string_lossy()), 剥成_json(&val, 层 + 1));
                    }
                    if map.len() >= 面板节点上限 {
                        break;
                    }
                }
                J::Object(map)
            }
        }
        // 函数 / userdata / thread / error：**一律不发出去**。
        // 前端拿到 `null` 会当成"这块没内容"，比把一个函数序列化成
        // `"<function: 0x…>"` 那种假字符串诚实。
        _ => J::Null,
    }
}

/// 按**字符**截断（不是字节）——按字节截会把一个汉字劈成半个，
/// 前端拿到的是乱码，而且那种乱码看起来像是后端编码出了错。
fn 截断(s: &str) -> String {
    if s.chars().count() <= 面板文本上限 {
        return s.to_owned();
    }
    let mut out: String = s.chars().take(面板文本上限).collect();
    out.push('…');
    out
}

/// `nota.ui.register_menu`，**不含 `ctx`**。理由同 `面板表`。
pub(crate) fn 菜单表(lua: &Lua, plugin_id: &str) -> mlua::Result<mlua::Function> {
    lua.set_named_registry_value(REG_MENUS, lua.create_table()?)?;
    let plugin_id = plugin_id.to_owned();

    let register = lua
        .create_function(move |lua, spec: Table| {
            let label: String = spec.get("label").map_err(|_| {
                mlua::Error::RuntimeError("register_menu 需要 `label` 字段".to_owned())
            })?;
            // 点了要跑哪个命令——**必须**是插件自己注册过的命令名，
            // 前端点下去时按这个名回调宿主，宿主再找插件要。
            let command: String = spec.get("command").map_err(|_| {
                mlua::Error::RuntimeError("register_menu 需要 `command` 字段".to_owned())
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
            // `prompt`：点之前先问一句（「提交…」要的就是这个）。**原样存**，
            // 形状由读的一侧收（`plugin::读菜单::读提示`）——与 `icon` /
            // `accelerator` 同一个分工：注册函数只管收下来。
            if let Ok(Some(p)) = spec.get::<Option<Table>>("prompt") {
                entry.set("prompt", p)?;
            }

            // 去重键是 label：同一个菜单里两条同名项，用户分不出该点哪个。
            追加声明(lua, REG_MENUS, "label", &label, &entry, &format!("插件 {plugin_id} 重复注册菜单项"))?;
            Ok(())
        })?;

    Ok(register)
}

/// 把一条声明追加到 `reg` 名下，`键`（`id` / `label`）重复就报错。
///
/// ⚠️ **重名要报出来，不能静默覆盖。** 理由同 `nota.command.register`：
/// 多半是复制粘贴改漏了，静默覆盖会让人对着"怎么点下去跑的是另一个函数"查到天亮。
/// 面板这边还多一层：重名会让前端的两张卡片抢同一个 key。
fn 追加声明(
    lua: &Lua,
    reg: &str,
    键: &str,
    值: &str,
    条目: &Table,
    报错前缀: &str,
) -> mlua::Result<()> {
    let list: Table = lua.named_registry_value(reg)?;
    for i in 1..=list.raw_len() {
        let Ok(既有) = list.raw_get::<Table>(i) else {
            continue;
        };
        // 比字符串而不是比 `Result`：`LuaError` 不实现 `PartialEq`。
        if 如果重名(既有.get::<String>(键), 值) {
            return Err(mlua::Error::RuntimeError(format!("{报错前缀} `{值}`")));
        }
    }
    list.set(list.raw_len() + 1, 条目.clone())
}

/// 读出来的键值等于要声明的那个吗。
///
/// 抽出来只为绕开一件事：`LuaError` **不实现 `PartialEq`**，所以
/// `get::<String>(…).as_deref() == Ok(值)` 编不过（两个 `Result` 比不了）。
/// 顺手把"读失败"和"值不同"都归成 `false`——读不到就是没重名，该放行。
fn 如果重名(读到: mlua::Result<String>, 值: &str) -> bool {
    matches!(读到, Ok(v) if v == 值)
}

/// 把插件的 `level` 归一化。认不出的一律当 `info`——**别把插件的笔误变成一次报错**，
/// 那会让人为了一个无关紧要的通知层级去读栈。
fn normalise_level(level: Option<&str>) -> &'static str {
    match level {
        Some("warn") | Some("warning") => "warn",
        Some("error") => "error",
        Some("success") => "success",
        _ => "info",
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn 通知层级归一化() {
        assert_eq!(normalise_level(None), "info");
        assert_eq!(normalise_level(Some("warn")), "warn");
        assert_eq!(normalise_level(Some("warning")), "warn");
        assert_eq!(normalise_level(Some("error")), "error");
        assert_eq!(normalise_level(Some("随便写的")), "info");
    }

    // ── BUG-13 的回归用例 ─────────────────────────────────────────────────
    // 这几条**故意让写的一侧和读的一侧都参与**：`register_panel` 写进 registry，
    // `plugin::读面板` 读出来。BUG-13 的病灶就是这两头各写各的——
    // 只测一头永远测不出来。

    /// 走一遍完整来回：注册 → 读回。
    #[test]
    fn 注册的面板读得回来() {
        let lua = Lua::new();
        let register = 面板表(&lua, "nota.t").unwrap();

        let spec = lua.create_table().unwrap();
        spec.set("id", "git").unwrap();
        spec.set("title", "Git").unwrap();
        register.call::<()>(spec).unwrap();

        let got = crate::plugin::读面板(&lua, "nota.t");
        assert_eq!(got.len(), 1, "注册了一个，就该读回一个");
        assert_eq!(got[0].plugin, "nota.t");
        assert_eq!(got[0].id, "git");
        assert_eq!(got[0].title, "Git");
        assert_eq!(
            got[0].location, "right",
            "不写 `location` 该默认到右侧插件栏——默认值 `sidebar` 是左栏还兼职装插件时的事"
        );
    }

    #[test]
    fn 面板不写_title_就拿_id_顶上() {
        let lua = Lua::new();
        let register = 面板表(&lua, "nota.t").unwrap();
        let spec = lua.create_table().unwrap();
        spec.set("id", "only-id").unwrap();
        register.call::<()>(spec).unwrap();

        let got = crate::plugin::读面板(&lua, "nota.t");
        assert_eq!(got[0].title, "only-id");
    }

    #[test]
    fn 面板重名要报错() {
        let lua = Lua::new();
        let register = 面板表(&lua, "nota.t").unwrap();
        let spec = lua.create_table().unwrap();
        spec.set("id", "dup").unwrap();
        register.call::<()>(spec.clone()).unwrap();

        let err = register.call::<()>(spec).unwrap_err().to_string();
        assert!(err.contains("重复注册面板"), "实际报的是：{err}");
        // 报错之后**不能**留下半条：读回来还是一个。
        assert_eq!(crate::plugin::读面板(&lua, "nota.t").len(), 1);
    }

    #[test]
    fn 没声明过就读回空表() {
        // 没申请能力的插件，registry 里压根没有这个键——读回空表，**不是报错**。
        // 报错会让"装了但不带面板的插件"看起来像坏了。
        let lua = Lua::new();
        assert!(crate::plugin::读面板(&lua, "nota.t").is_empty());
        assert!(crate::plugin::读菜单(&lua, "nota.t").is_empty());
    }

    #[test]
    fn 注册的菜单项读得回来() {
        let lua = Lua::new();
        let register = 菜单表(&lua, "nota.t").unwrap();

        let spec = lua.create_table().unwrap();
        spec.set("label", "提交…").unwrap();
        spec.set("command", "commit").unwrap();
        register.call::<()>(spec).unwrap();

        let got = crate::plugin::读菜单(&lua, "nota.t");
        assert_eq!(got.len(), 1);
        assert_eq!(got[0].menu, "plugins", "不写 `menu` 默认挂在 plugins 下");
        assert_eq!(got[0].command, "commit");
        assert_eq!(got[0].accelerator, None);
        assert!(got[0].prompt.is_none(), "没写 `prompt` 就是直接跑，不该问");
    }

    /// 「提交…」要的就是这个：点了先弹框问提交信息，答完才跑命令。
    ///
    /// ⚠️ 走真的 Lua 源码（`lua.load(...)`）而不是手搭 `mlua::Table`：
    /// 插件作者写的是源码，两条路之间差着 Lua 自己的表构造。
    #[test]
    fn 菜单项的_prompt_读得回来() {
        let lua = Lua::new();
        let register = 菜单表(&lua, "nota.t").unwrap();
        let spec: Table = lua
            .load(
                r#"return {
                     label = "提交…", command = "commit",
                     prompt = { arg = "message", label = "提交信息", placeholder = "一句话说清这次改了什么" },
                   }"#,
            )
            .eval()
            .unwrap();
        register.call::<()>(spec).unwrap();

        let got = crate::plugin::读菜单(&lua, "nota.t");
        let p = got[0].prompt.as_ref().expect("`prompt` 该跟着回来");
        assert_eq!(p.arg, "message", "没有 `arg` 的话用户填的值没有地方放");
        assert_eq!(p.label, "提交信息");
        assert_eq!(p.placeholder, "一句话说清这次改了什么");
        assert!(!p.secret, "不写 `secret` 就是明文显示");
        assert_eq!(p.hint, "", "没写的字段给空串，不是 panic");
    }

    /// 没有 `arg` 的 `prompt` **当没写**：问了也送不出去，那就别问。
    #[test]
    fn 没有_arg_的_prompt_当没写() {
        let lua = Lua::new();
        let register = 菜单表(&lua, "nota.t").unwrap();
        let spec: Table = lua
            .load(r#"return { label = "提交…", command = "commit", prompt = { label = "提交信息" } }"#)
            .eval()
            .unwrap();
        register.call::<()>(spec).unwrap();

        assert!(crate::plugin::读菜单(&lua, "nota.t")[0].prompt.is_none());
    }

    /// 第二个字段（Git 身份的"名字 + 邮箱"要的就是这个）。
    ///
    /// ⚠️ 字段名是 **camelCase**（`secondArg`/`secondLabel`/`secondPlaceholder`）：
    /// 插件在 Lua 里写的、前端 TS 类型里读的、这里断言的，必须是同一套拼法。
    /// 结构体上那行 `rename_all` 就是干这个的——要是有人把它删了，
    /// 这个用例会红，而不是等到"弹框里第二行不见了"才发现。
    #[test]
    fn 两个字段的_prompt_读得回来() {
        let lua = Lua::new();
        let register = 菜单表(&lua, "nota.t").unwrap();
        let spec: Table = lua
            .load(
                r#"return {
                     label = "填身份…", command = "set_identity",
                     prompt = { arg = "name", label = "Git 身份", placeholder = "名字，比如：张三",
                                secondArg = "email", secondLabel = "邮箱",
                                secondPlaceholder = "you@example.com" },
                   }"#,
            )
            .eval()
            .unwrap();
        register.call::<()>(spec).unwrap();

        let got = crate::plugin::读菜单(&lua, "nota.t");
        let p = got[0].prompt.as_ref().expect("`prompt` 该跟着回来");
        assert_eq!(p.arg, "name");
        assert_eq!(p.second_arg, "email", "第二个值的键名");
        assert_eq!(p.second_label, "邮箱");
        assert_eq!(p.second_placeholder, "you@example.com");
    }

    /// 第二个字段**只给一半等于没给**。
    ///
    /// 判据与 `arg` 那条同源：缺了键名，用户填的值没有地方放。这里两个方向都试
    /// （只给键名 / 只给标签），因为漏的可以是任一半。
    #[test]
    fn 第二个字段只给一半等于没给() {
        for 半截 in [
            r#"secondArg = "email""#,
            r#"secondLabel = "邮箱", secondPlaceholder = "you@example.com""#,
        ] {
            let lua = Lua::new();
            let register = 菜单表(&lua, "nota.t").unwrap();
            let code = format!(
                r#"return {{ label = "填身份…", command = "set_identity",
                             prompt = {{ arg = "name", label = "Git 身份", {半截} }} }}"#
            );
            let spec: Table = lua.load(&code).eval().unwrap();
            register.call::<()>(spec).unwrap();

            let got = crate::plugin::读菜单(&lua, "nota.t");
            let p = got[0].prompt.as_ref().expect("`prompt` 本身还在");
            assert_eq!(p.arg, "name", "第一个字段不受影响");
            assert_eq!(p.second_arg, "", "只给一半：{半截}");
            assert_eq!(p.second_label, "");
            assert_eq!(p.second_placeholder, "");
        }
    }

    // ── 面板内容（`render`）的来回 ────────────────────────────────────────
    // 这里同样是"写的一侧 → 读的一侧"整条走一遍：`register_panel` 把 `render`
    // 存进 registry，`面板内容` 现调它、剥成 JSON。只测一头测不出
    // "存进去时丢了 render" 这种病。

    /// 装一个带 `render` 的面板，返回 `(lua, 面板 id)`。
    fn 带渲染的面板(body: &str) -> Lua {
        let lua = Lua::new();
        let register = 面板表(&lua, "nota.t").unwrap();

        // 用真的 Lua 源码拼 `render`，而不是在 Rust 里 `create_function`——
        // 插件作者写的是源码，读回来的是它**跑出来的**东西，中间经过
        // Lua 的表构造。手搭一个 `mlua::Table` 就绕过了这一步。
        let code = format!(
            "return {{ id = 'p', title = 'P', render = function() {body} end }}"
        );
        let spec: Table = lua.load(&code).eval().unwrap();
        register.call::<()>(spec).unwrap();
        lua
    }

    #[test]
    fn 面板渲染出来的内容读得回来() {
        let lua = 带渲染的面板(
            r#"return {
                 { kind = "heading", text = "main" },
                 { kind = "list", items = { { title = "a.md", badge = "已修改" } } },
                 { kind = "buttons", items = { { label = "刷新", command = "refresh" } } },
               }"#,
        );

        let v = 面板内容(&lua, "nota.t", "p").unwrap();
        let arr = v.as_array().expect("该是一个数组");
        assert_eq!(arr.len(), 3);
        assert_eq!(arr[0]["kind"], "heading");
        assert_eq!(arr[0]["text"], "main");
        assert_eq!(arr[1]["items"][0]["badge"], "已修改");
        assert_eq!(arr[2]["items"][0]["command"], "refresh");
    }

    /// ⚠️ **这条钉的是"内容每次都是现跑的"。**
    ///
    /// 面板内容不是快照——git 的改动列表每次都得现问 git。做成"注册时跑一次存起来"
    /// 的话，界面上会一直显示应用刚启动那一刻的改动，而且**看着像是对的**。
    #[test]
    fn 每次读都重新跑一遍_render() {
        let lua = Lua::new();
        let register = 面板表(&lua, "nota.t").unwrap();
        let spec: Table = lua
            .load(
                r#"
                local n = 0
                return { id = "p", render = function()
                    n = n + 1
                    return { { kind = "text", text = "第 " .. n .. " 次" } }
                end }
                "#,
            )
            .eval()
            .unwrap();
        register.call::<()>(spec).unwrap();

        for 期望 in ["第 1 次", "第 2 次", "第 3 次"] {
            let v = 面板内容(&lua, "nota.t", "p").unwrap();
            assert_eq!(v[0]["text"], 期望, "render 没有每次现跑");
        }
    }

    /// `render` 里抛错 → **一句人话**，不是一个裸的 Lua 栈。
    #[test]
    fn 渲染抛错时报的是插件自己的错() {
        let lua = 带渲染的面板(r#"error("磁盘满了")"#);
        let err = 面板内容(&lua, "nota.t", "p").unwrap_err().to_string();
        assert!(err.contains("磁盘满了"), "实际报的是：{err}");
        assert!(err.contains("渲染失败"), "该说清是渲染这一步出的错：{err}");
    }

    #[test]
    fn 没有_render_的面板如实说没有() {
        let lua = Lua::new();
        let register = 面板表(&lua, "nota.t").unwrap();
        let spec = lua.create_table().unwrap();
        spec.set("id", "bare").unwrap();
        register.call::<()>(spec).unwrap();

        let err = 面板内容(&lua, "nota.t", "bare").unwrap_err().to_string();
        assert!(err.contains("没有提供 `render`"), "实际报的是：{err}");
    }

    #[test]
    fn 没有的面板要报出来而不是给空() {
        let lua = 带渲染的面板("return {}");
        let err = 面板内容(&lua, "nota.t", "不存在").unwrap_err().to_string();
        assert!(err.contains("没有声明面板"), "实际报的是：{err}");
    }

    /// `render` 写的不是函数 → **注册时就报**。
    ///
    /// 拖到用户打开面板才报的话，报错的地方（前端一个渲染失败）离病因
    /// （插件里把 `render` 写成了表）已经很远了。
    #[test]
    fn render_不是函数当场就报() {
        let lua = Lua::new();
        let register = 面板表(&lua, "nota.t").unwrap();
        let spec: Table = lua
            .load(r#"return { id = "p", render = { "我是一张表" } }"#)
            .eval()
            .unwrap();
        let err = register.call::<()>(spec).unwrap_err().to_string();
        assert!(err.contains("必须是一个函数"), "实际报的是：{err}");
    }

    /// 超长文本按**字符**截，且一个汉字不该被劈成半个。
    #[test]
    fn 超长文本截断且不劈开汉字() {
        let lua = 带渲染的面板(&format!(
            r#"return {{ {{ kind = "text", text = string.rep("汉", {}) }} }}"#,
            面板文本上限 + 500
        ));
        let v = 面板内容(&lua, "nota.t", "p").unwrap();
        let text = v[0]["text"].as_str().unwrap();
        assert_eq!(text.chars().count(), 面板文本上限 + 1, "截断长度不对（+1 是那个省略号）");
        assert!(text.ends_with('…'), "截断该留个记号：{}", &text[..10]);
        assert!(text.chars().all(|c| c == '汉' || c == '…'), "汉字被劈开了");
    }

    /// 函数、userdata 这些过不了 JSON 的值，**替换成 null 而不是变成假字符串**。
    ///
    /// ⚠️ 键名只能是 ASCII——Lua 的标识符不含汉字（`回调 = …` 是**语法错**，
    /// 不是"能跑但取不到"）。这一条我实测踩过，别改回来。
    #[test]
    fn 过不了_json_的值变成_null() {
        let lua = 带渲染的面板(
            r#"return { { kind = "text", text = "x", cb = function() end } }"#,
        );
        let v = 面板内容(&lua, "nota.t", "p").unwrap();
        assert!(v[0]["cb"].is_null(), "函数该变成 null，实际是 {}", v[0]["cb"]);
        assert_eq!(v[0]["text"], "x", "同一个表里别的字段不该受影响");
    }

    /// 自引用的表不能把栈打穿——层数上限兜住。
    #[test]
    fn 自引用的表不会打穿栈() {
        let lua = 带渲染的面板(
            r#"local t = { kind = "text" }; t.me = t; return { t }"#,
        );
        let v = 面板内容(&lua, "nota.t", "p").unwrap();
        // 走到层数上限就停：一路是 `me`，最后一层是 null。
        let mut cur = &v[0]["me"];
        let mut 层 = 0;
        while !cur.is_null() {
            cur = &cur["me"];
            层 += 1;
            assert!(层 <= 面板层数上限 + 2, "递归没有停下来");
        }
        assert!(层 > 1, "至少该往下走几层才对");
    }

    /// 一个数组里的项数有上限。**不是为了防坏人，是为了防手滑**：
    /// 一个插件把整个目录树铺进面板，前端会卡死。
    #[test]
    fn 一层的项数有上限() {
        let lua = 带渲染的面板(&format!(
            r#"local items = {{}}
               for i = 1, {} do items[i] = {{ title = "x" }} end
               return {{ {{ kind = "list", items = items }} }}"#,
            面板节点上限 + 50
        ));
        let v = 面板内容(&lua, "nota.t", "p").unwrap();
        assert_eq!(v[0]["items"].as_array().unwrap().len(), 面板节点上限);
    }
}
