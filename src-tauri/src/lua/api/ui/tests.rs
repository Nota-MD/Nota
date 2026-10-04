//! `lua/api/ui.rs` 那一组用例——2026-09-29 从 `mod tests` 里搬出来的，
//! **只搬了行数，没搬内容**（`ui.rs` 当时 867 行，过了 `docs/09` §4 那条 800）。
//!
//! 被测的东西：`nota.ui` 那几张表的行为边界——通知层级归一化（`normalise_level`）、
//! 面板内容那条路的三条上限（文本 / 节点数 / 层数，`剥成_json` ＋ `截断`）、
//! 以及重名声明怎么判（`如果重名`）。
//!
//! ⚠️ **位置和 `lua/mod.rs` 那一份不一样**：那一份搬成了同级文件
//! （`lua/tests.rs`），这一份落在 **`lua/api/ui/tests.rs`**，是 `ui` 的**子模块**。
//! 差别在**能不能看见私有项**：这一组用到 `normalise_level` / `截断` /
//! 面板那三个上限，它们都是 `ui.rs` 的私有项，只有子模块看得见。改成同级文件就得
//! 把那几样放宽成 `pub(crate)`——为测试去改产品代码的可见性，不值当。
//!
//! ⚠️ 内容一个字没改，只是去掉 `mod tests` 那层壳、统一少四格缩进。

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
        "不写 `location` 该默认到右侧拓展栏——默认值 `sidebar` 是左栏还兼职装拓展时的事"
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

// ───────────────────────── `nota.ui.stream`（2026-10-04） ─────────────────────────
//
// ⚠️ **这条只钉得住纯的那一半**：`实时表` 本体要一个真的 `tauri::AppHandle` 才
// 发得出事件，单元测试里造不出来（`refresh` 那条路也一样，所以上面那一片用例
// 里没有一个碰过它）。真正"发出去、前端收到"那一段只能靠开窗目检——
// 那正是 `docs/07` 第 58 项剩下的验收动作。
//
// 下面这两条盯的是**唯一一处会算错的地方**：按字节取尾巴。

/// 短的一律原样给回，一个字都不动。
#[test]
fn 要的尾巴比原文还长就原样给回() {
    assert_eq!(取尾巴("短", 10), "短");
    assert_eq!(取尾巴("", 10), "");
    assert_eq!(取尾巴("正好五个字", 5), "正好五个字");
}

/// ⚠️ 按**字符**取，不按字节。
///
/// 这条要是写成按字节取（`&s[s.len()-n..]`），截出来的多半是半个汉字——那半个
/// 汉字进 JSON、进前端就是一个 `U+FFFD`。`http.rs::切出完整段` 是同一个坑的
/// 另一处落点，那边是**分块读**踩到的，这边是**截尾巴**踩到的。
#[test]
fn 取尾巴按字符不按字节() {
    let 原文 = "一二三四五六七八九十";
    assert_eq!(取尾巴(原文, 3), "八九十");
    // 按字节取的话这三个汉字的字节数是 9，取 9 个字节会切在"八"的中间。
    assert_eq!(取尾巴(原文, 3).chars().count(), 3);
}

/// 实时上限是给 `取尾巴` 的那把尺子；这个数本身不参与计算，但**它得和
/// `plugins/ai/panel.lua::HOST_TEXT_MAX` 差着量级**（收工时整段走拉那条路画，
/// 比这儿宽松是故意的）。钉住它只是为了让"哪天有人手滑改成 100000"当场红。
#[test]
fn 实时上限是个小数量级() {
    assert_eq!(实时上限, 8000);
    assert!(实时上限 < 20_000, "得比收工时那条路小");
}
