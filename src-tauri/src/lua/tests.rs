//! `lua/mod.rs` 那一组用例——2026-09-29 从 `mod tests` 里搬出来的，
//! **只搬了行数，没搬内容**（`mod.rs` 当时 913 行，过了 `docs/09` §4 那条 800）。
//!
//! 被测的东西分三块，都挂在 `super::` 上：
//!
//! - **沙箱**（`硬化的_lua` / `插件标准库` / `必须为空的全局`）：BUG-10 的回归用例，
//!   把"必须在"和"必须不在"两半都钉住；
//! - **内置插件能不能被编译**（`内置插件都能被_lua_编译`）：扫 `plugins/` 里那几份真插件，
//!   **每一份 `.lua` 都编译一遍**（不只是清单里那个入口）——2026-09-29 放宽的，理由在
//!   那条用例的文档注释里；
//! - **多文件插件的 `require` 链真的跑得通**（`多文件插件的_require_链真的跑得通`）：
//!   上一条只编译不执行，这条用宿主那个 `装require` 把兄弟模块逐个求一次值。
//!   ⚠️ **两条是分层的，别合并**（一条管语法、一条管链子）；
//! - **插件的白名单能力**（`白名单里不许有_io_os_package_debug` / `插件跑不了_os_execute`）。
//!
//! ⚠️ 与隔壁 `require_tests.rs`（`require` 那一组）是**两拨**，别混：
//! 那一拨 2026-09-27 就搬出来了，理由一样（行数），内容互不相干。
//!
//! ⚠️ 这一份里没有 `mod tests` 那层壳，`use super::*;` 直接顶格——
//! 搬的时候按 `require_tests.rs` 的样子统一了缩进（少四格），代码一个字没改。

use super::*;

/// ⚠️ **这条就是 BUG-10 的回归用例。**
///
/// 从前这里是 `Lua::new()`，而它的 "safe" 只等于"不能加载 C 模块"——
/// `io` / `os` / `package` / `require` 全都在。这条用例把"必须在"和
/// "必须不在"两半都钉住：**谁把 `硬化的_lua()` 换回 `Lua::new()`，
/// 下面第二个循环立刻红。**
#[test]
fn 沙箱里不该有的全局一个都不能有() {
    let lua = 硬化的_lua().expect("沙箱该建得起来");

    for name in 必须为空的全局 {
        let v: mlua::Value = lua.globals().get(name).unwrap();
        assert!(
            v.is_nil(),
            "`{name}` 不该在拓展的 Lua 里存在。它一旦存在，能力围栏就能被绕过去——\
             一个只申请 `ui.notify` 的拓展可以 `os.execute(\"rm -rf ~\")` \
             或 `io.open(\"/etc/shadow\")`（BUG-10）"
        );
    }
}

/// `Lua::new()` 的默认值到底有多宽——**这条是"事实记录"，不是"要求"**。
///
/// 它的作用是：哪天 mlua 改了 `ALL_SAFE` 的定义，这条会红，
/// 于是有人回来重读本文件顶上那段、重新判一次 "safe" 指的是什么。
/// 断言的是**当前实测**：`io`/`os`/`package` 都在 `Lua::new()` 里。
///
/// 如果这条真的红了（说明 mlua 收紧了默认值），**别急着删它**：
/// 先确认收紧到什么程度，再决定 `硬化的_lua()` 还要不要保留那份显式抹除。
#[test]
fn mlua_的_default_safe_含_io_和_os() {
    let lua = Lua::new();
    for name in ["io", "os", "package", "require"] {
        let v: mlua::Value = lua.globals().get(name).unwrap();
        assert!(
            !v.is_nil(),
            "`Lua::new()` 里 `{name}` 竟然不存在了——mlua 的默认值变了！\
             本文件顶上「第一道闸曾经是假的」那一段的前提没了，\
             请重新判一次 `硬化的_lua()` 该怎么写，再改这条断言"
        );
    }
    // `debug` 是唯一真的被排除的那个（bit 31）。
    let dbg: mlua::Value = lua.globals().get("debug").unwrap();
    assert!(dbg.is_nil(), "`debug` 不该在 `Lua::new()` 里");
}

/// ⚠️ **内置插件至少得能被 Lua 编译过去——每一份 `.lua` 都算。**
///
/// 为什么值得单独钉一条：`plugins/` 里的 Lua **只有应用启动那一刻才会被
/// 编译**，单元测试从来没碰过它们。所以那里写错一个字母，代价是"用户一开
/// 应用发现插件没了"，而我在提交前看不到任何红。
///
/// ⚠️⚠️ **2026-09-29 起扫的是整个插件目录，不是清单里那一个入口。**
/// 起因见下面函数体里那段注释：`plugins/ai/` 拆出的 `chat.lua` 里有个 `end)`，
/// 而**旧版这条用例全绿**——它一眼都没看过兄弟文件。`require` 多文件的用户
/// 现在有三个（`stats` / `git` / `ai`），而**除了这一条，没有任何自动化检查
/// 看得见那些兄弟文件**（①~⑧ 那几道闸不扫 `plugins/`，`cargo check` 和 `tsc`
/// 更不认识 Lua）。所以别把范围改回"只扫入口"。
///
/// ⚠️ **变量名不能写中文**：Lua 的标识符只认 `[A-Za-z_][A-Za-z0-9_]*`
///（`lislalpha` 用的是 C 的 `isalpha`，而 `local 键 = 1` 里的 UTF-8 字节在
/// 任何 locale 下都不算字母），所以那是**语法错误**，整份插件加载失败。
/// 注释和字符串里的中文不受影响——只有**名字**不行。
///
/// 这条用例就是替 Lua 把这句话说清楚：它自己报的是
/// `'<name>' expected near '<\233>'`，看到那句很难想到"是我用了中文变量名"。
#[test]
fn 内置插件都能被_lua_编译() {
    let lua = 硬化的_lua().expect("沙箱该建得起来");
    let mut 编译过几个 = 0;

    for dir in crate::paths::builtin_plugins_dirs(None) {
        let Ok(条目们) = std::fs::read_dir(&dir) else {
            continue;
        };
        for 条目 in 条目们.flatten() {
            let 清单路径 = 条目.path().join("plugin.toml");
            if !清单路径.is_file() {
                continue;
            }

            let m = crate::plugin::manifest::Manifest::load(&清单路径)
                .unwrap_or_else(|e| panic!("`{}` 读不出来：{e}", 清单路径.display()));

            // ⚠️⚠️ **扫这个插件目录下的每一份 `.lua`，不只是清单里那一个入口。**
            //
            // 2026-09-29 改的，起因是一次真事：`plugins/ai/` 拆成四份之后，
            // 拆出来的 `chat.lua` 里留了一处 `end)`（本应是 `end`）。这条用例
            // **全绿**——因为它从前只读 `m.meta.entry`（= `main.lua`），而那几份
            // 兄弟文件它一眼都没看过。最后是手写的冒烟脚本炸出来的。
            //
            // ⚠️ 插件多文件（`require`）现在有三个用户（`stats` / `git` / `ai`），
            // 而**除了这一条，没有任何自动化检查看得见那些兄弟文件**：
            // ①~⑧ 那几道闸不扫 `plugins/`，`cargo check` 与 `tsc` 更不认识 Lua。
            // 所以这里必须按目录扫，别退回"只扫入口"。
            let 这一份的 = 该插件下所有_lua(&m.dir);
            assert!(
                !这一份的.is_empty(),
                "`{}` 里一份 `.lua` 都没扫到——入口 `{}` 呢？",
                m.dir.display(),
                m.meta.entry
            );

            for 脚本 in 这一份的 {
                let code = std::fs::read_to_string(&脚本)
                    .unwrap_or_else(|e| panic!("`{}` 读不出来：{e}", 脚本.display()));

                // `into_function()` = **只编译不执行**。这里要的正是这一层：
                // 语法错在这里现形，而 `on_load` 那类要宿主环境的东西不掺进来。
                //
                // ⚠️ 也就是说**它不跑 `require`**：模块名拼错、循环依赖、模块级语句
                // 碰了 `nota` 这三类它都看不见。那一层归下面那条
                // `多文件插件的_require_链真的跑得通`——两条是**分层的**，别合并。
                lua.load(&code)
                    .set_name(脚本.to_string_lossy().as_ref())
                    .into_function()
                    .unwrap_or_else(|e| panic!("`{}` 编译不过：{e}", 脚本.display()));

                编译过几个 += 1;
            }
        }
    }

    assert!(
        编译过几个 >= 2,
        "一个内置拓展都没扫到（扫到 {编译过几个} 个）——`plugins/` 是挪走了，\
         还是 `builtin_plugins_dirs` 改了？测试要跟着改，别把这条删了"
    );
}

/// 一个插件目录下**所有** `.lua`（含子目录），按路径排好序。
///
/// ⚠️ 排序是为了报错信息稳定：`read_dir` 的顺序各文件系统不一样，同一份代码
/// 在两台机器上"第一个报错的文件"可能不同，那种 flaky 最难查。
fn 该插件下所有_lua(目录: &std::path::Path) -> Vec<std::path::PathBuf> {
    fn 走(目录: &std::path::Path, 收到: &mut Vec<std::path::PathBuf>) {
        let Ok(条目们) = std::fs::read_dir(目录) else {
            return;
        };
        for 条目 in 条目们.flatten() {
            let p = 条目.path();
            if p.is_dir() {
                走(&p, 收到);
            } else if p.extension().is_some_and(|e| e == "lua") {
                收到.push(p);
            }
        }
    }
    let mut 收到 = Vec::new();
    走(目录, &mut 收到);
    收到.sort();
    收到
}

/// 某份内置插件的入口源码。找不到给 `None`（各机器上 `plugins/` 的份数不一样）。
fn 内置插件源码(id: &str) -> Option<String> {
    for dir in crate::paths::builtin_plugins_dirs(None) {
        let 入口 = dir.join(id).join("main.lua");
        if let Ok(s) = std::fs::read_to_string(&入口) {
            return Some(s);
        }
    }
    None
}

/// `plugins/slidev/main.lua` 里那段**纯字符串活**：从文档正文里读出 frontmatter
/// 的 `theme:`，再翻成"要去问哪个包"。
///
/// ⚠️ 为什么只有这一份插件值得这么一个测试：这两件事是**纯函数**（不碰宿主、
/// 不碰网络），而判错的代价两头都脏——
///   · **多问**一个不存在的包 ⇒ 面板说「主题没装」，把一次本来能跑的预览挡在门外；
///   · **少问**一个真缺的包 ⇒ 回到用户 2026-09-26 撞的那件事：面板说能跑、
///     进程两秒后退出来（`The theme "@slidev/theme-default" was not found`）。
///
/// ⚠️ **挂钩是"把源码末尾那句 `return M` 换掉"**。看着糙，但比别的路都干净：
/// 那两个函数是 `local function`，而插件没有 `require`（沙箱里没有 `package`），
/// 也不该为了测试把它们挂到 `M` 上——`M` 是插件的**对外面**，多一个键就要多
/// 一条 ABI 说明。换掉 `return` 之后整段照样要能**跑通**：那份文件的模块级语句
/// 不许碰 `nota`（文件头「`local T` 在 `on_load` 里重新绑一次」就是为此），
/// 所以直接 `eval` 是安全的。
#[test]
fn slidev_认得文档要的是哪个主题包() {
    let lua = 硬化的_lua().expect("沙箱该建得起来");
    let 源 = 内置插件源码("slidev").expect("内置拓展里该有一份 slidev/main.lua");

    let 尾 = "return M";
    let 剪掉 = 源.trim_end();
    assert!(
        剪掉.ends_with(尾),
        "`slidev/main.lua` 的结尾不再是 `{尾}` 了——这条测试的挂钩要跟着改"
    );
    let 代码 = format!(
        "{}\nreturn {{ theme_from_text = theme_from_text, theme_package = theme_package, \
         describe_probe = describe_probe }}\n",
        &剪掉[..剪掉.len() - 尾.len()]
    );
    let 表: mlua::Table = lua
        .load(&代码)
        .set_name("slidev/main.lua（测试挂钩）")
        .eval()
        .expect("整段该跑得起来：模块级语句不许碰 `nota`");
    let 读: mlua::Function = 表.get("theme_from_text").expect("读函数");
    let 翻: mlua::Function = 表.get("theme_package").expect("翻函数");

    // 一、正文里那行 `theme:` 读不读得出来。
    // ⚠️ 每一条都是**实测过的写法或真的踩过的坑**，不是凑数：
    let 用例: [(&str, &str, Option<&str>); 10] = [
        // 最常见的写法。
        ("---\ntheme: seriph\n---\n# 一页\n", "普通", Some("seriph")),
        // Windows 上存过的文件（CRLF）。
        ("---\r\ntheme: seriph\r\n---\r\n", "CRLF", Some("seriph")),
        // YAML 允许引号。
        ("---\ntheme: \"seriph\"\n---\n", "带引号", Some("seriph")),
        // 行尾注释是 YAML 的正常写法，不能把它当名字的一部分。
        ("---\ntheme: seriph # 备选：default\n---\n", "行尾注释", Some("seriph")),
        // 有些编辑器存盘带 BOM，带上之后第一行就不是 `---` 了。
        ("\u{feff}---\ntheme: seriph\n---\n", "带 BOM", Some("seriph")),
        // 正文里的 `---` 是**分隔线**，不是 frontmatter：不能拿它当结论。
        ("# 一页\n\n---\n\ntheme: seriph\n", "分隔线不在开头", None),
        // 没有收尾的 `---`：宁可少问一句，也不猜。
        ("---\ntheme: seriph\n", "没有收尾", None),
        // 有这个段，但里面没写主题 ⇒ 就是"没写"（要默认主题）。
        ("---\ntitle: 一页\n---\n", "没写 theme", None),
        // `theme:` 后面空着是 YAML 的嵌套地图，不是名字。
        ("---\ntheme:\n---\n", "值是空的", None),
        ("", "空文档", None),
    ];
    for (正文, 名字, 期望) in 用例 {
        let 得到 = 读.call::<Option<String>>(正文.to_owned()).unwrap();
        assert_eq!(
            得到.as_deref(),
            期望,
            "「{名字}」那份正文读出来的主题不对：{得到:?}（正文：{正文:?}）"
        );
    }

    // 二、主题名 → 要去问的那个**包名**。`nil` = 不用问。
    // 规则照 `@slidev/cli` 的 `resolver`（2026-09-26 从本机那份读出来的）。
    let 翻用例: [(&str, Option<&str>); 5] = [
        // 官方主题：`<名>` → `@slidev/theme-<名>`。
        ("seriph", Some("@slidev/theme-seriph")),
        // ⚠️ `none` 是 Slidev 自己的特例（`name === "none"` 就直接返回"不要主题"）：
        // 这条要是不认，一份写着 `theme: none` 的文档会被问一个根本不存在的包。
        ("none", None),
        // 带 `/` 的是**路径**（`./我的主题`、`/abs`、`@org/x`），不是包名。
        ("./我的主题", None),
        ("@org/我的主题", None),
        ("/tmp/主题", None),
    ];
    for (名字, 期望) in 翻用例 {
        let 得到 = 翻.call::<Option<String>>(名字.to_owned()).unwrap();
        assert_eq!(得到.as_deref(), 期望, "`theme: {名字}` 该问的包不对");
    }
    // 没写 `theme:` ⇒ Slidev 要的是默认主题包。
    // ⚠️ 参数是 `nil`（不是空串）：`theme_from_text` 给的正是 `nil`。
    let 默认 = 翻.call::<Option<String>>(mlua::Value::Nil).unwrap();
    assert_eq!(默认.as_deref(), Some("@slidev/theme-default"), "没写主题时该问默认包");

    // 三、给宿主那条 `need` 的口径：**相对路径**，前面拼上 `node_modules/`
    //     （宿主那边 `合法的相对路径` 会把绝对路径和 `..` 一律挡掉 —— 见
    //     `devserver/probe.rs`，所以这里拼错一个字符就永远问不出结果）。
    assert!(
        源.contains(r#"{ need = "node_modules/" .. pkg, pkg = pkg, theme_name = theme_name }"#),
        "`required_theme` 拼 `need` 的那一行变了——宿主收的是相对路径，改法要看 \
         `devserver/probe.rs`；`theme_name` 是下面第 四 段那两支的判据，一起带出去"
    );

    // 四、`describe_probe` 的 `notheme` 那两支：**文档到底写没写 `theme:`**
    //     决定说的是哪句话。
    //
    // ⚠️ 为什么这条值得测：那两句话的**出路不一样**。写了的人手上已经有那一行，
    // 改一个词就行；没写的人**连那行都没有**——2026-09-26 用户那份文档就是
    // 后一种（装了 `theme-seriph` 却一个字没写主题），而当时面板给的话是
    // 「把文档开头那行 `theme:` 改成一个装过的」：**照着做不出来**，因为他
    // 的文档里根本没有那一行。判据是 `want.theme_name`，两边都得钉住。
    let 说: mlua::Function = 表.get("describe_probe").expect("翻译函数");

    // 造一份"宿主给的探测报告"。`need` 是**三档**（没问 `nil` / 有 / 没有）。
    let 探报 = |state: &str, root: Option<&str>, marker: bool, need: Option<bool>| {
        let t = lua.create_table()?;
        t.set("state", state)?;
        t.set("version", "53.0.0")?;
        t.set("command", "npx @slidev/cli")?;
        t.set("detail", "")?;
        t.set("marker_found", marker)?;
        if let Some(r) = root {
            t.set("root", r)?;
        }
        if let Some(n) = need {
            t.set("need_found", n)?;
        }
        Ok::<mlua::Table, mlua::Error>(t)
    };
    // 造一份"这份文档要什么"（`required_theme` 那张表）。
    let 要的 = |theme_name: Option<&str>, pkg: &str| {
        let t = lua.create_table()?;
        t.set("need", format!("node_modules/{pkg}"))?;
        t.set("pkg", pkg)?;
        if let Some(n) = theme_name {
            t.set("theme_name", n)?;
        }
        Ok::<mlua::Table, mlua::Error>(t)
    };
    let 翻 = |p: mlua::Table, w: mlua::Table| -> mlua::Table {
        说.call((p, w)).expect("`describe_probe` 不该抛错")
    };

    // ① 文档**没写**主题（`theme_name` 缺位）⇒ 说的是"没写主题"那句，
    //    而且出路得是**照着做得到**的：加三行 frontmatter、或者装那个包。
    //
    // ⚠️ 断言只能钉**模板里字面有的**东西：`T` 在这个挂钩里是模块级那个恒等函数
    // （`local T = function(s) return s end`），**不格式化**——真正填 `%s` 的是
    // `on_load` 里重新绑过的那一份（它要 `nota`，这里没有）。所以"点名了哪个包"
    // 那件事在这里验不了，只验**两支说的话不一样、而且各自是照着做得出来的**。
    let d = 翻(
        探报("ready", Some("/tmp/甲"), true, Some(false)).unwrap(),
        要的(None, "@slidev/theme-default").unwrap(),
    );
    assert_eq!(d.get::<String>("state").unwrap(), "notheme", "缺那个包该报 notheme");
    let 没写的话: String = d.get("message").unwrap();
    let 没写的细: String = d.get("detail").unwrap();
    // ⚠️ 钉的是**英文原文**（2026-09-28 语言翻转：英语成了插件里的源语言，
    //    中文进 `lang/zh-CN.toml`。这里量的是模板本身，`T` 是恒等函数，
    //    所以只可能看见英文）。
    assert!(没写的话.contains("names no theme"), "没写 `theme:` 的文档该说「没写主题」：{没写的话}");
    assert!(没写的细.contains("theme: none"), "该给「加三行 frontmatter」这条照着做得到的路：{没写的细}");
    assert!(没写的细.contains("npm i"), "装包那条路也得在：{没写的细}");

    // ② 文档**写了**（`theme: seriph`，那个包没装）⇒ 老那句：改一个词就行。
    let d = 翻(
        探报("ready", Some("/tmp/甲"), true, Some(false)).unwrap(),
        要的(Some("seriph"), "@slidev/theme-seriph").unwrap(),
    );
    assert_eq!(d.get::<String>("state").unwrap(), "notheme");
    let 写了的话: String = d.get("message").unwrap();
    let 写了_细: String = d.get("detail").unwrap();
    assert!(!写了的话.contains("names no theme"), "写了 `theme:` 的文档不许说「没写主题」：{写了的话}");
    // 这一支才该讲"Slidev 按 `@slidev/theme-<名>`、`slidev-theme-<名>` 的顺序找"。
    assert!(写了_细.contains("slidev-theme-"), "写了主题的那支该讲解析顺序：{写了_细}");
    assert!(!没写的细.contains("slidev-theme-"), "没写主题的那支讲解析顺序是废话：{没写的细}");

    // ③ 那个包**装着了** ⇒ 不许报 `notheme`：多问一句会把一次本来能跑的预览
    //    挡在门外（这一支是这条测试存在的另一半理由）。
    let d = 翻(
        探报("ready", Some("/tmp/甲"), true, Some(true)).unwrap(),
        要的(None, "@slidev/theme-default").unwrap(),
    );
    assert_eq!(d.get::<String>("state").unwrap(), "ready");

    // ④ **没问过**（`need_found` 缺位）⇒ 也不许报：那是"不知道"，不是"没有"。
    //    （宿主那边"没问"给的是 `nil`，不是 `false` —— `devserver/probe.rs`。）
    let d = 翻(
        探报("ready", Some("/tmp/甲"), true, None).unwrap(),
        要的(None, "@slidev/theme-default").unwrap(),
    );
    assert_eq!(d.get::<String>("state").unwrap(), "ready");
}

/// `插件标准库()` 本身不能含 `io`/`os`/`package`/`debug`。
///
/// 前一条钉的是"结果"，这条钉的是"输入"——**两处都可能出错**：
/// 白名单开宽了，或者白名单没问题但 base 库把 `loadfile` 捎了进来
/// （后者由第一条用例的 `loadfile`/`dofile` 两项兜住）。
#[test]
fn 白名单里不许有_io_os_package_debug() {
    let libs = 插件标准库();
    for (name, flag) in [
        ("io", mlua::StdLib::IO),
        ("os", mlua::StdLib::OS),
        ("package", mlua::StdLib::PACKAGE),
        ("debug", mlua::StdLib::DEBUG),
    ] {
        assert!(
            !libs.contains(flag),
            "`拓展标准库()` 里不该含 `{name}`——它正是要挡的东西（BUG-10）"
        );
    }
    // 反过来：这几个是插件该有的，别哪天顺手删了。
    for (name, flag) in [
        ("coroutine", mlua::StdLib::COROUTINE),
        ("table", mlua::StdLib::TABLE),
        ("string", mlua::StdLib::STRING),
        ("math", mlua::StdLib::MATH),
    ] {
        assert!(libs.contains(flag), "`{name}` 该留着，拓展日常要用");
    }
}

/// 刀得真快：在硬化过的 `Lua` 里，`os.execute` 连索引都过不去。
///
/// 前三条是"这个不存在"，这条是"所以这事做不成"——**端到端的那一下**。
/// 光看 `globals().get("os").is_nil()` 是够的，但这条更贴插件作者的真实动作，
/// 失败时的报错也更好懂。
#[test]
fn 插件跑不了_os_execute() {
    let lua = 硬化的_lua().expect("沙箱该建得起来");
    let err = lua
        .load(r#"os.execute("touch /tmp/nota-sandbox-should-never-exist")"#)
        .eval::<mlua::Value>()
        .unwrap_err();
    let msg = err.to_string();
    assert!(
        msg.contains("nil value") || msg.contains("os"),
        "该报「`os` 是 nil」，实际：{msg}"
    );
    assert!(
        !std::path::Path::new("/tmp/nota-sandbox-should-never-exist").exists(),
        "文件竟然建出来了——沙箱没挡住"
    );
}

/// ⚠️ **多文件插件（`require`）的那条链，真的跑一遍。**
///
/// 上一条用例只 `into_function()`——**编译但不执行**，所以它看不见
/// 「模块名写错」「循环依赖」「某个模块在求值时炸了」这三类错。这条补上那一层：
/// 用宿主**真的**那个 `装require`（不是 `package.path`，那玩意儿在沙箱里根本
/// 不存在）按模块名 require 一遍，把每个兄弟模块都**求一次值**。
///
/// ⚠️ 之所以敢对**所有**内置插件一视同仁地求值，是因为多文件插件有一条硬规矩：
/// **模块级语句不许碰 `nota`**（`nota` 要到 `on_load` 才到手），文案那个 `T` 先立成
/// "原样返回"的桩、由 `bind_text` 换掉。所以 `require` 一个兄弟模块是**不需要宿主
/// 环境**的——它要是需要，那个模块本身就写错了，这条用例正好把它抓出来。
///
/// ⚠️ 入口（`main.lua`）**跳过不求值**：它的模块级是干净的，但它的用处全在
/// `on_load` 里，而 `on_load` 要一张完整的 `nota`——那是插件壳的活，不归单元测试。
///
/// 📌 2026-09-29 加这条的背景：`plugins/ai/` 拆成四份时 `chat.lua` 里留了个 `end)`
/// （语法错），而当时**唯一的**那道插件闸只编译入口、全绿。补完上一条的扫描范围之后
/// 语法错能抓了，但「`require("cht")` 拼错一个字母」这类仍然抓不到——就是这条的活。
#[test]
fn 多文件插件的_require_链真的跑得通() {
    let mut 求过值几个 = 0;

    for dir in crate::paths::builtin_plugins_dirs(None) {
        let Ok(条目们) = std::fs::read_dir(&dir) else {
            continue;
        };
        for 条目 in 条目们.flatten() {
            let 清单路径 = 条目.path().join("plugin.toml");
            if !清单路径.is_file() {
                continue;
            }
            let m = crate::plugin::manifest::Manifest::load(&清单路径)
                .unwrap_or_else(|e| panic!("`{}` 读不出来：{e}", 清单路径.display()));

            // ⚠️ 一个插件一个 `Lua` 状态（`docs/12` §2）：`require` 的缓存存在
            // registry 里，共用一份的话第二个插件拿到的是第一个的模块。
            let lua = 硬化的_lua().expect("沙箱该建得起来");
            装require(&lua, &m.dir)
                .unwrap_or_else(|e| panic!("`{}` 的 require 装不上：{e}", m.meta.id));

            for 脚本 in 该插件下所有_lua(&m.dir) {
                let 名 = 脚本
                    .file_stem()
                    .expect("`.lua` 文件该有 stem")
                    .to_string_lossy()
                    .to_string();
                if 名 == "main" {
                    continue;
                }

                // 用 `load` 拼一句真的 `require`（而不是直接调那个 Rust 闭包）：
                // 插件作者写的就是 `require("util")` 这一行，绕着它测就少了一段。
                let 表: mlua::Table = lua
                    .load(format!("return require({名:?})"))
                    .set_name(format!("{}（测试挂钩）", 脚本.display()))
                    .eval()
                    .unwrap_or_else(|e| {
                        panic!(
                            "`{}` 里的 `require({名:?})` 跑不通：{e}\n                             ⚠️ 模块名对不上、有循环依赖、或者模块级语句碰了 `nota`，                             三种都会在这里现形",
                             m.meta.id
                        )
                    });

                // 模块必须**交出点东西**（`return M` 那张表）。空表说明那个模块
                // 忘了写 `return M`、或者把 `M` 又 `local` 了一遍——
                // 两种情况宿主都不报错，只是那一块功能整个不存在。
                assert!(
                    表.pairs::<mlua::Value, mlua::Value>().count() > 0,
                    "`{}/{}.lua` require 回来是一张空表——`return M` 呢？",
                    m.meta.id,
                    名
                );
                求过值几个 += 1;
            }
        }
    }

    assert!(
        求过值几个 >= 2,
        "一个多文件插件的兄弟模块都没求到值（求到 {求过值几个} 个）——         `plugins/` 里那几份多文件插件（`stats` / `git` / `ai`）是没了，         还是都不拆了？这条用例的判据要跟着改，别删"
    );
}
