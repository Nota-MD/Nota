//! `nota.ui.review` / `nota.ui.review_diff` —— 插件往**编辑区**里放东西。
//!
//! # 为什么从 `ui.rs` 里分出来（2026-09-26）
//!
//! `ui.rs` 讲的是"插件往外壳里放东西"（通知、面板、菜单），三样都是**声明式**
//! 的：写进 registry，宿主按需读。这两条不一样——它们放的是**编辑区那一格**，
//! 而且有**两种形态**（面板形态、就地形态），两种形态的差别是一整段能自己站住
//! 的话（见下面那张表）。留在 `ui.rs` 里的话，那一段会把"声明进 registry"
//! 那条主线淹掉；分出来之后 `ui.rs` 只剩注册与装配。
//!
//! # 形态只有两种，别加第三种
//!
//! | | `review(id)` | `review_diff{...}` |
//! |---|---|---|
//! | 编辑区里 | 正文**让位**，摊那个面板 | 正文**原地**画 diff，一个字不动 |
//! | 适合 | 插件自己的界面（提交树、图表……） | "改了一份文本给人看" |
//!
//! 用户 2026-09-26 定的口径：「直接将内容嵌入编辑区域……直接作用于编辑区域，
//! 而不是开一个独立界面」。所以**改动预览走 `review_diff` 这一条**，
//! 别再往 `review` 那条上堆。
//!
//! # 两条的共同点：编辑区只有一格，**收起来的责任在插件**
//!
//! 后放进去的把先放进去的顶掉（`plugin/mod.rs::ReviewState`）；用户点了接受/放弃
//! 之后，插件要自己 `nota.ui.review_diff(nil)`——宿主**不收**，因为它不知道
//! 那些按钮是什么意思。用户按 Esc / 点「收起预览」是前端直接收的
//! （`bridge/ipc.ts::reviewClose`）：插件可能正卡在一次慢调用里，那条路不能
//! 经过它。

use mlua::{Lua, Table};

use crate::plugin::{ReviewAction, ReviewKind};

/// `nota.ui.review([panel_id])` —— 把一个面板**摊到编辑区**里（`nil` 收起来）。
///
/// # 这是给谁用的
///
/// 「改动预览」这种**要占一大片地方才能读**的内容：AI 提了一处改动，
/// 右侧那 260px 的栏里只能挤出改动的那几行，而用户要的是"在正文那个位置、
/// 用正文那么宽"看一遍再决定要不要。所以插件可以把某个面板整个摊到编辑区，
/// 编辑区那份画的**还是这个面板的内容**（同一套内容块、同一套按钮、
/// 同一条 `render`——一份内容两处画，不新造格式）。
///
/// ⚠️ **`id` 必须是这个插件**注册过的面板。写错一个字符串的话，
/// 用户看到的是一句"插件 X 没有声明面板 Y"，而那时离病因（插件里那个
/// 字面量拼错了）已经很远——所以在这里当场报。
///
/// ⚠️ 现在还在用这条的是**看差异那一类**（`plugins/git/main.lua` 的
/// 「在编辑区看」：那份差异不是"某个文档该变成什么"，是 git 给出的一份只读
/// 产物，所以它不需要就地叠加）。"改一份文本给人看"走 [`预览改动表`]。
pub(crate) fn 预览表(
    lua: &Lua,
    plugin_id: &str,
    app: tauri::AppHandle,
) -> mlua::Result<mlua::Function> {
    let plugin_id = plugin_id.to_owned();

    lua.create_function(move |lua, id: Option<String>| {
        use tauri::Emitter;
        if let Some(panel) = id.as_deref() {
            if !super::ui::有面板吗(lua, panel) {
                return Err(mlua::Error::RuntimeError(format!(
                    "拓展 {plugin_id} 没有声明面板 `{panel}`，摊不到编辑区"
                )));
            }
        }
        // ⚠️ 状态写在这里、事件随后发：前端收到事件时会去拉当前那一格，
        // 所以顺序反过来（先发后写）会让前端拉到旧的——那正是 BUG-13 的
        // 形状（"界面看着好好的，只是内容晚一拍"）。
        let 格 = id.clone().map(|panel| ReviewKind::Panel { panel });
        {
            use tauri::Manager;
            app.state::<crate::plugin::ReviewState>().set(&plugin_id, 格);
        }
        app.emit(
            crate::plugin::EVENT_REVIEW,
            serde_json::json!({ "plugin": plugin_id, "kind": "panel", "id": id }),
        )
        .map_err(|e| mlua::Error::RuntimeError(format!("发预览事件失败：{e}")))?;
        Ok(())
    })
}

/// `nota.ui.review_diff{ title=, text=, accept=, reject= }` —— 在编辑区里
/// **原地**画一份改动（`nil` 收起来）。
///
/// # ⚠️ 收的是"整篇目标文本"，不是补丁
///
/// `text` 是**改完之后文档该长什么样**。理由有两条，都是硬的：
///
/// 1. **差异由编辑器那边算**（`editor/review.ts` 的 `差异`）。补丁/hunk 是
///    插件自己的表示（`plugins/ai/main.lua` 的 `apply_changes`），宿主与前端
///    没有理由认识它——多一种表示就多一处会对不齐的地方。
/// 2. **算差异要比的是"屏幕上此刻那份文本"**，而那份只有前端手里有（它是
///    文本的真相，见 `document/mod.rs` 顶上那段）。宿主手里那份可能慢一拍
///    （前端去抖还没推过来），拿它算出来的偏移量会**错位地划掉几行**。
///
/// # 按钮
///
/// `accept` / `reject` 各是一个 `{ label=, command= }`：**措辞归插件**（i18n），
/// 命令名前端交给 `nota_plugin_call` 去跑。不给就不画那个按钮（插件也可以
/// 只让用户看完，靠 `Esc` 或面板里自己的按钮收场）。
///
/// ⚠️ **收起来的责任仍然在插件**（同 [`预览表`] 那条）：用户点了接受/放弃之后，
/// 插件要自己 `nota.ui.review_diff(nil)`（`nota.ui.review(nil)` 也一样，
/// 两条收的是同一格）。
pub(crate) fn 预览改动表(
    lua: &Lua,
    plugin_id: &str,
    app: tauri::AppHandle,
) -> mlua::Result<mlua::Function> {
    let plugin_id = plugin_id.to_owned();

    lua.create_function(move |_lua, 参数: Option<Table>| {
        use tauri::Emitter;
        let 格 = match 参数 {
            None => None,
            Some(t) => {
                let text = 取字符串(&t, "text")?.ok_or_else(|| {
                    mlua::Error::RuntimeError(
                        "nota.ui.review_diff 少了 text：那是「改完之后文档该长什么样」\
                         的整篇文本（不是补丁、不是 hunk）"
                            .to_owned(),
                    )
                })?;
                Some(ReviewKind::Diff {
                    title: 取字符串(&t, "title")?.unwrap_or_default(),
                    text,
                    accept: 取按钮(&t, "accept")?,
                    reject: 取按钮(&t, "reject")?,
                })
            }
        };
        // ⚠️ 状态写在这里、事件随后发——同 `预览表` 那条理由（先发后写会让
        // 前端拉到旧的，那正是 BUG-13 的形状）。
        {
            use tauri::Manager;
            app.state::<crate::plugin::ReviewState>()
                .set(&plugin_id, 格.clone());
        }
        app.emit(
            crate::plugin::EVENT_REVIEW,
            serde_json::json!({ "plugin": plugin_id, "kind": "diff" }),
        )
        .map_err(|e| mlua::Error::RuntimeError(format!("发预览事件失败：{e}")))?;
        Ok(())
    })
}

/// 从表里取一个可选字符串。
///
/// ⚠️ 给了但**不是字符串**时当场报（不是当成没给）：`text = 42` 这种写法多半是
/// 插件作者写错了变量，静默忽略的话症状是"预览里一片空白"，而离病因很远。
fn 取字符串(t: &Table, 键: &str) -> mlua::Result<Option<String>> {
    match t.get::<mlua::Value>(键)? {
        mlua::Value::Nil => Ok(None),
        mlua::Value::String(s) => Ok(Some(s.to_str()?.to_owned())),
        别的 => Err(mlua::Error::RuntimeError(format!(
            "nota.ui.review_diff 的 `{键}` 要是字符串，给的是 {}",
            别的.type_name()
        ))),
    }
}

/// 从表里取一个可选的按钮（`{ label=, command= }`）。
fn 取按钮(t: &Table, 键: &str) -> mlua::Result<Option<ReviewAction>> {
    let Some(子) = t.get::<Option<Table>>(键)? else {
        return Ok(None);
    };
    let label = 子.get::<Option<String>>("label")?.ok_or_else(|| {
        mlua::Error::RuntimeError(format!(
            "nota.ui.review_diff 的 `{键}` 少了 label：按钮上得写点什么"
        ))
    })?;
    let command = 子.get::<Option<String>>("command")?.ok_or_else(|| {
        mlua::Error::RuntimeError(format!(
            "nota.ui.review_diff 的 `{键}` 少了 command：点了之后要跑哪条命令"
        ))
    })?;
    Ok(Some(ReviewAction { label, command }))
}
