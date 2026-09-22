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
//! ⚠️ 面板**内容**仍由插件自己推事件填（`nota.event.emit`），宿主不解析 HTML。
//! 这样做在安全上是干净的（前端只渲染我们自己认识的组件），代价是插件作者得写点前端代码。
//! 纯 Lua 声明式的面板 DSL 排在后面轮次（`docs/07` 第 15 项）。

use mlua::{Lua, Table};

use super::mlua_to_nota;
use crate::error::Result as NotaResult;
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
    }

    if manifest.has(Capability::UiMenu) {
        let 注册 = 菜单表(lua, &manifest.meta.id).map_err(mlua_to_nota)?;
        t.set("register_menu", 注册).map_err(mlua_to_nota)?;
    }

    Ok(t)
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
            entry.set(
                "location",
                spec.get::<Option<String>>("location")
                    .ok()
                    .flatten()
                    .unwrap_or_else(|| "right".to_owned()),
            )?;

            追加声明(lua, REG_PANELS, "id", &id, &entry, &format!("插件 {plugin_id} 重复注册面板"))?;
            Ok(())
        })?;

    Ok(register)
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
    }
}
