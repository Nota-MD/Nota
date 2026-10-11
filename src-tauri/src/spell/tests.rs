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
    let 后端 = 命令行后端 { 程序 };
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
