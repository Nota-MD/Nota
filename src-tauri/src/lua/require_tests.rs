//! `require`（插件多文件）那一组用例——2026-09-27 从 `src/lua/mod.rs` 的
//! `mod tests` 里搬出来的，**只搬了行数，没搬内容**（`mod.rs` 加完 `装require`
//! 之后 1144 行，顶破了 `docs/09` §4 那条 1000 行上限）。
//!
//! 被测的东西是 `super::装require`：它给插件里那颗 `require` 装上"只认自己
//! 目录、只认 `.lua`"的规矩（理由与边界在 `docs/12` §5.9）。
//!
//! ⚠️ 这些用例**往临时目录里写文件**（造模块），所以一条一目录、跑完收摊；
//! 绝不能改去读 `plugins/`——那是仓库里的真插件。

use super::*;

/* ── 插件多文件：`require`（2026-09-27）─────────────────────────────── */

/// 一条用例一个临时插件目录。
///
/// ⚠️ **不引 `tempfile`**：`Cargo.toml` 里没有它（与 `table_width` 顶上那条
/// 注释同一个理由）。⚠️ 也**绝不能**拿真插件的目录来试——`装require` 只读，
/// 但这些用例要**往里写文件**（造模块），写到 `plugins/` 里就成了"跑一次测试
/// 在用户/仓库的插件目录里留下一堆垃圾"。
fn 插件目录(名: &str) -> std::path::PathBuf {
    let 唯一 = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_nanos())
        .unwrap_or(0);
    let 目录 = std::env::temp_dir().join(format!(
        "nota-require-{名}-{}-{唯一}",
        std::process::id()
    ));
    std::fs::create_dir_all(&目录).expect("建临时插件目录");
    目录
}

/// 收摊。⚠️ 用例中途断言失败会漏一个临时目录——**故意的**（同 `table_width`）。
fn 收摊(目录: &std::path::Path) {
    let _ = std::fs::remove_dir_all(目录);
}

/// 一个装了 `require` 的沙箱 ＋ 它的（临时）插件目录。
fn 带require的沙箱(名: &str) -> (Lua, std::path::PathBuf) {
    let lua = 硬化的_lua().expect("沙箱该建得起来");
    let 目录 = 插件目录(名);
    装require(&lua, &目录).expect("装 require");
    (lua, 目录)
}

/// 往临时插件目录里写一份模块。路径带 `/` 时会先建目录。
fn 写模块(根: &std::path::Path, 相对: &str, 源码: &str) {
    let p = 根.join(相对);
    if let Some(父) = p.parent() {
        std::fs::create_dir_all(父).expect("建子目录");
    }
    std::fs::write(&p, 源码).expect("写模块");
}

/// 调一次 `require`（从**全局**拿，不是直接调函数：钉的就是"它真装上了"）。
fn 要(lua: &Lua, 名: &str) -> mlua::Value {
    let f: mlua::Function = lua.globals().get("require").expect("`require` 该装上了");
    f.call(名.to_owned()).expect("这次 require 不该抛")
}

/// 调一次 `require`，要它抛，把话拿回来。
fn 要错(lua: &Lua, 名: &str) -> String {
    let f: mlua::Function = lua.globals().get("require").expect("`require` 该装上了");
    f.call::<mlua::Value>(名.to_owned())
        .expect_err("这次 require 该抛")
        .to_string()
}

/// ⚠️ **这条是整个 `require` 的地基**：两种写法都认得出来。
#[test]
fn require_认得两种写法() {
    let (lua, 根) = 带require的沙箱("两种写法");
    写模块(&根, "chart.lua", r#"return { name = "chart" }"#);
    写模块(&根, "ui/palette.lua", r#"return { fg = '#fff' }"#);
    // ⚠️ 模块名必须是 ASCII（名字里出现中文会让 `require` 的**报错信息**本身
    //    变成乱码，而报错正是它的用处），所以这个目录只能叫 `kit`。
    写模块(&根, "kit/init.lua", r#"return { kind = "包" }"#);

    let 甲 = 要(&lua, "chart");
    let 甲 = 甲.as_table().expect("`chart` 该给一张表");
    assert_eq!(甲.get::<String>("name").unwrap(), "chart");

    // 点号 = 目录分隔（`ui.palette` → `ui/palette.lua`），照 Lua 的惯例。
    let 乙 = 要(&lua, "ui.palette");
    let 乙 = 乙.as_table().expect("`ui.palette` 该给一张表");
    assert_eq!(乙.get::<String>("fg").unwrap(), "#fff");

    // `<名>/init.lua`：这样"一个模块一个目录"也能用。
    let 丙 = 要(&lua, "kit");
    let 丙 = 丙.as_table().expect("`kit` 该给一张表");
    assert_eq!(丙.get::<String>("kind").unwrap(), "包");

    收摊(&根);
}

/// 一个模块**只求值一次**，第二次拿的是**同一个表**（不是"长得一样的表"）。
#[test]
fn require_只跑一次_第二次给的是同一个表() {
    let (lua, 根) = 带require的沙箱("只跑一次");
    // ⚠️ 模块里的**标识符也只能是 ASCII**（`__n`，不能写成 `__次`）：
    //    Lua 的 `isalpha` 不认 UTF-8 字节，用了中文名字就是语法错误——
    //    这一条在本仓踩过不止一次（`内置插件都能被_lua_编译` 那段注释）。
    写模块(
        &根,
        "counter.lua",
        "_G.__n = (_G.__n or 0) + 1\nreturn { n = _G.__n }",
    );

    let 一 = 要(&lua, "counter");
    let 一 = 一.as_table().expect("该给一张表").clone();
    let 二 = 要(&lua, "counter");
    let 二 = 二.as_table().expect("该给一张表").clone();

    assert_eq!(二.get::<i64>("n").unwrap(), 1, "模块被求值了两遍");
    // ⚠️ 光看 `n` 还不够：两份"各自求值一次"的表也是 `n == 1`。同一个**对象**
    //    才是真 `require` 的语义，也是本仓那些"模块里存了状态"的插件
    //    （缓存、连接、注册表）不炸的前提。
    一.set("后来加的", 42i64).unwrap();
    assert_eq!(二.get::<i64>("后来加的").unwrap(), 42, "两次拿到的不是同一个表");

    收摊(&根);
}

/// 什么都不返回的模块**当 `true`**（真 `require` 的老规矩）。
#[test]
fn require_什么都不返回时第二次给_true() {
    let (lua, 根) = 带require的沙箱("返回空");
    写模块(&根, "empty.lua", "local x = 1");

    // 第一次给的是**模块自己的返回值**（它没返回，就是 `nil`）。
    let 首 = 要(&lua, "empty");
    assert!(首.is_nil(), "第一次该是 `nil`（模块没有返回值）");
    // ⚠️ 第二次必须给 `true`、**不是**再求值一遍。缓存里存 `nil` 等于没缓存
    //    （上面 `if !旧.is_nil()` 那一句会把 `nil` 当"没求过"），症状是同一个
    //    文件被反复执行——只在模块里存了状态时才露头。
    let 二 = 要(&lua, "empty");
    assert!(
        matches!(二, mlua::Value::Boolean(true)),
        "第二次该给 `true`，实际：{二:?}"
    );

    收摊(&根);
}

/// 名字里跑出插件目录的花样，一律**在碰文件之前**就拒掉。
#[test]
fn require_名字不合法的直接拒() {
    let (lua, 根) = 带require的沙箱("名字");
    for 坏 in [
        "", "   ", "/etc/passwd", "../外面", "a/../../外面", "a..b", "有中文", "a b", "a;b",
        "a$b", "a\\b",
    ] {
        let 话 = 要错(&lua, 坏);
        assert!(
            话.contains("不合法"),
            "`{坏}` 该被**名字那道闸**拒掉（理由得说名字，不是「找不到模块」），实际：{话}"
        );
    }
    收摊(&根);
}

/// 软链指向插件目录外面时也拒——与 `nota.fs.*` 用**同一把尺**（`resolve_in`）。
#[test]
fn require_软链逃不出插件目录() {
    let (lua, 根) = 带require的沙箱("软链");
    let 外面 = 根
        .parent()
        .expect("临时目录该有爹")
        .join(format!("nota-require-偷来的-{}.lua", std::process::id()));
    std::fs::write(&外面, r#"return { 偷来的 = true }"#).expect("写外面的文件");

    #[cfg(unix)]
    {
        std::os::unix::fs::symlink(&外面, 根.join("link.lua")).expect("建软链");
        let 话 = 要错(&lua, "link");
        assert!(
            话.contains("找不到模块"),
            "软链该被 `resolve_in` 挡在门外（名字是合法的，所以不是「不合法」那句），实际：{话}"
        );
    }

    let _ = std::fs::remove_file(&外面);
    收摊(&根);
}

/// 循环 require 给一句能读的话，不是把栈撞死。
#[test]
fn require_转圈报的是人话() {
    let (lua, 根) = 带require的沙箱("转圈");
    写模块(&根, "a.lua", r#"return require("b")"#);
    写模块(&根, "b.lua", r#"return require("a")"#);

    let 话 = 要错(&lua, "a");
    assert!(话.contains("转圈"), "循环依赖该给人话，实际：{话}");

    // ⚠️ 失败之后那个模块**还能被再 require 一次**：`在途` 标记是"求值期间"
    //    的东西，求值结束（成或败）都必须摘掉——热重载、或者调用方 `pcall`
    //    之后重试都会走这条路。标记漏了的话，第二次报的是"转圈"，而它其实
    //    不是循环——那是最难查的一种。
    let 话2 = 要错(&lua, "a");
    assert!(话2.contains("转圈"), "第二次该是同一句话，实际：{话2}");

    收摊(&根);
}

/// 找不到模块时，话里得说清"试过哪两个文件名"和"只在自己目录里找"。
#[test]
fn require_找不到时话里有线索() {
    let (lua, 根) = 带require的沙箱("找不到");
    写模块(&根, "there.lua", "return 1");

    let 话 = 要错(&lua, "missing");
    assert!(话.contains("missing.lua"), "该说出试过哪个文件名：{话}");
    assert!(话.contains("init.lua"), "两种写法都该提到：{话}");
    assert!(
        话.contains("只在本插件自己的目录里找"),
        "该说清搜索范围（不然插件作者会去翻 `package.path`）：{话}"
    );

    // ⚠️ **只认 `.lua`**：`.so` 是绕过整个沙箱的一条路（C 扩展里什么都能干），
    //    而"能不能加载 C 模块"正是 `硬化的_lua()` 当初必须自己抹一遍的原因。
    写模块(&根, "native.so", "");
    let 话2 = 要错(&lua, "native");
    assert!(话2.contains("找不到模块"), "`.so` 不许被 require 到：{话2}");

    收摊(&根);
}

/// `require` 补回来了，但 `package` / `io` / `os` **一个都没跟着回来**。
///
/// ⚠️ 这条是**补这个洞时最该防的那个副作用**：为了让插件能多文件，把
/// `mlua::StdLib::PACKAGE` 整个开回去是最省事的写法，而那等于把 BUG-10
/// 又放回来一次（`package.loadlib` 能加载 C 模块）。
#[test]
fn 补上_require_不等于把_package_装回来() {
    let (lua, 根) = 带require的沙箱("包");
    for 名字 in ["package", "io", "os", "debug", "loadfile", "dofile"] {
        let v: mlua::Value = lua.globals().get(名字).unwrap();
        assert!(
            v.is_nil(),
            "`{名字}` 不该跟着 `require` 一起回来——补的是**一个函数**，\
             不是那个标准库（BUG-10 的闸不能拆）"
        );
    }
    // 而 `require` 自己这次确实在（不然上面几条全都在测空气）。
    let r: mlua::Value = lua.globals().get("require").unwrap();
    assert!(!r.is_nil(), "`require` 该装上——用例本身的前提没了");

    收摊(&根);
}
