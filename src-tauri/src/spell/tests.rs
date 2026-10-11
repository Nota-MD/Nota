//! 拼写后端那几条**能测的**：纯函数 ＋ 一个假后端。
//!
//! ⚠️ 真词典那半测不了（取决于这台机器装了什么），所以这里钉的是**形状**：
//! 输出怎么对回下标、建议怎么抠、没有后端时那句话长什么样。

use super::*;

#[test]
fn 输出的词能对回原来的下标() {
    let 词们: Vec<String> = ["helo", "hello", "wrold", "hello"]
        .iter()
        .map(|s| s.to_string())
        .collect();
    // 假后端只会把拼错的打出来（`helo` / `wrold`），重复的那个 `hello` 一个都不该中。
    let 出 = 对回下标(&词们, "helo\nwrold\n");
    assert_eq!(出, vec![0, 2]);
}

#[test]
fn 同一个词出现两次时两个下标都要标出来() {
    let 词们: Vec<String> = ["helo", "x", "helo"].iter().map(|s| s.to_string()).collect();
    // 后端对两次出现会打两行 —— 按出现次数配对（不是按集合）。
    assert_eq!(对回下标(&词们, "helo\nhelo\n"), vec![0, 2]);
}

#[test]
fn 后端没说话时一个都不标() {
    // ⚠️ 空输出 = "一个都没错"，与"读不到后端"是两件事（后者在 `查` 里是 `None`）。
    let 词们: Vec<String> = vec!["hello".to_string()];
    assert!(对回下标(&词们, "").is_empty());
    assert!(对回下标(&词们, "   \n\n").is_empty());
}

#[test]
fn 建议从管道模式的输出里抠() {
    let 输出 = "@(#) International Ispell Version 3.2.06\n\
                 & helo 5 0: hello, halo, help, hell, hero\n\
                 * ok\n";
    assert_eq!(
        从建议输出里抠(输出),
        ["hello", "halo", "help", "hell", "hero"]
            .iter()
            .map(|s| s.to_string())
            .collect::<Vec<String>>()
    );
    // 没有 `&` 开头那一行（词是对的）就给空表，不报错。
    assert!(从建议输出里抠("* ok\n").is_empty());
}

#[test]
fn 没有后端时那句话要说得出怎么办() {
    let 话 = 没有后端的话();
    assert!(话.contains("enchant") && 话.contains("hunspell"), "{话}");
    // ⚠️ 别把"没装后端"说成"拼错了"：那句话里不许出现"错"这个字。
    assert!(!话.contains("拼错"), "{话}");
}

#[cfg(unix)]
#[test]
fn 假后端还真能跑一遍_查到词与建议() {
    use std::os::unix::fs::PermissionsExt;
    let 目录 = std::env::temp_dir().join(format!("nota-spell-test-{}", std::process::id()));
    let _ = std::fs::remove_dir_all(&目录);
    std::fs::create_dir_all(&目录).unwrap();
    let 假 = 目录.join("enchant-2");
    std::fs::write(
        &假,
        // ⚠️ 参数形状是 `-d <语言> -l`（见 `拼参数`），所以**旗子在 `$3`**：
        // 写成 `$2` 的话脚本会一路 `esac` 空跑——那正是这条用例第一次跑出来的样子
        //（`Some([])` 而不是 `Some([0])`，看着像"一个都没错"）。
        "#!/bin/sh\ncase \"$3\" in\n  -l) cat >/dev/null; printf 'helo\\n'; ;;\n  -a) cat >/dev/null; printf '& helo 2 0: hello, halo\\n'; ;;\nesac\n",
    )
    .unwrap();
    std::fs::set_permissions(&假, std::fs::Permissions::from_mode(0o755)).unwrap();

    // ⚠️ 用**路径**当程序名（`命令行后端` 的 `程序` 是 `&'static str`，测试里 leak 一下）
    let 程序: &'static str = Box::leak(假.display().to_string().into_boxed_str());
    // ⚠️ 随包词典目录给 `None`：这条用例测的是"把系统词典当后端"那条路，
    // 随包那份走的是 `词典参数` 里另一支（下面单有一条纯函数用例钉它）。
    let 后端 = 命令行后端 { 程序, 随包词典目录: None };
    let 词们: Vec<String> = ["helo", "hello"].iter().map(|s| s.to_string()).collect();
    assert_eq!(后端.查("en_US", &词们), Some(vec![0]));
    assert_eq!(
        后端.建议("en_US", "helo"),
        ["hello", "halo"]
            .iter()
            .map(|s| s.to_string())
            .collect::<Vec<String>>()
    );
    let _ = std::fs::remove_dir_all(&目录);
}

/// ⚠️ **随包词典那一支**（用户 2026-10-11：「字典随包分发」）：目录里真有
/// `<语言>.dic` 时，`-d` 要给**路径**（去掉后缀）；没有就给语言名，让后端去系统里找。
#[test]
fn 随包词典在时给路径_不在时给语言名() {
    let 临时 = std::env::temp_dir().join(format!("nota-dicts-{}", std::process::id()));
    let _ = std::fs::remove_dir_all(&临时);
    std::fs::create_dir_all(&临时).unwrap();
    std::fs::write(临时.join("en_US.dic"), b"2\nhello\nworld\n").unwrap();
    std::fs::write(临时.join("en_US.aff"), b"SET UTF-8\n").unwrap();
    let 带包 = 命令行后端 { 程序: "enchant-2", 随包词典目录: Some(临时.clone()) };
    // 去掉 `.dic` 后缀（hunspell 的 `-d` 收的是词干路径）。
    assert_eq!(带包.词典参数("en_US"), 临时.join("en_US").display().to_string());
    // 包里没带的那门语言：照旧交给系统词典。
    assert_eq!(带包.词典参数("zh_CN"), "zh_CN");
    let 不带 = 命令行后端 { 程序: "enchant-2", 随包词典目录: None };
    assert_eq!(不带.词典参数("en_US"), "en_US");
    let _ = std::fs::remove_dir_all(&临时);
}
