//! 拼写这一层**能测的**：纯函数 ＋ 一个假后端 ＋ 用户词表那两条。
//!
//! ⚠️ 真词典那半测不了（取决于这台机器装了什么），所以这里钉的是**形状**：
//! 输出怎么对回下标、建议怎么抠、用户词与忽略怎么减掉。真词典那条路在
//! `native.rs::tests`（那一份自己现写一份最小的 `.aff`/`.dic`，不靠系统）。

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
fn 没有这本词典时那句话要说得出三条出路() {
    let 话 = 没有这本词典的话("zh_CN");
    // ① 语言名要带上（用户得知道是哪一门）
    assert!(话.contains("zh_CN"), "{话}");
    // ② 三条出路都要有：装系统包 / 导入 zip / 拷进目录
    assert!(话.contains("hunspell-zh_CN"), "少了装系统包那条：{话}");
    assert!(话.contains("zip"), "少了导入那条：{话}");
    assert!(话.contains("dictionaries"), "少了拷进目录那条：{话}");
    // ⚠️ 别把"没词典"说成"拼错了"：那句话里不许出现"拼错"两个字
    //（同一条纪律的另一面写在文件头：失败给"不知道"，不给"拼错了"）。
    assert!(!话.contains("拼错"), "{话}");
}

/// ⚠️ **用户词与忽略是两件事**，这一条钉的就是它们的**共同点**：命中就减掉、
/// 不进引擎。差别（落盘 / 不落盘、谁清掉谁）在 [`加入用户词`] 与 [`忽略一个词`]。
#[test]
fn 用户词与忽略的词都不去问引擎() {
    let 词们: Vec<String> = ["hello", "Nota", "foobarbaz", "world"]
        .iter()
        .map(|s| s.to_string())
        .collect();
    let 用户: HashSet<String> = ["nota".to_string()].into_iter().collect();
    let 忽略: HashSet<String> = ["foobarbaz".to_string()].into_iter().collect();
    let 待查 = 要真查的(&词们, &用户, &忽略);
    // 剩下的是 hello 与 world，**下标是原来的**（0 和 3）——这一点最要紧：
    // 减完之后 0/1 会错位，界面就会把波浪线画到别的词上。
    assert_eq!(待查, vec![(0, "hello"), (3, "world")]);
}

/// ⚠️ 大小写不算差别（词典那条路本来就不敏感：实测 `Hello`/`HELLO` 都判对）。
///
/// ⚠️ **这张表必须是归一过的**（`读用户词表` 与 `加入用户词` 两头都统一小写）
/// ——这条用例后半截钉的就是那个约定：往里塞一个大写的词，`要真查的` 认不出来。
#[test]
fn 用户词表比大小写不敏感() {
    let 词们: Vec<String> = vec!["Nota".to_string()];
    let 用户: HashSet<String> = ["nota".to_string()].into_iter().collect();
    assert!(要真查的(&词们, &用户, &HashSet::new()).is_empty());
    // 归一那一步把两头拉平（用户写 `NOTA`、文档里写 `nota`，落进表里都是 `nota`）。
    assert_eq!(归一("NOTA"), "nota");
    assert_eq!(归一("  Nota  "), "nota");
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
        // 写成 `$2` 的话脚本会一路 `esac` 空跑——那正是这条用例第一次跑出来的
        // 样子（`Some([])` 而不是 `Some([0])`，看着像"一个都没错"）。
        "#!/bin/sh\ncase \"$3\" in\n  -l) cat >/dev/null; printf 'helo\\n'; ;;\n  -a) cat >/dev/null; printf '& helo 2 0: hello, halo\\n'; ;;\nesac\n",
    )
    .unwrap();
    std::fs::set_permissions(&假, std::fs::Permissions::from_mode(0o755)).unwrap();

    // ⚠️ 用**路径**当程序名（`命令行后端` 的 `程序` 是 `&'static str`，测试里 leak 一下）
    let 程序: &'static str = Box::leak(假.display().to_string().into_boxed_str());
    // ⚠️ 用户词典目录给 `None`：这条用例测的是"把系统词典当后端"那条路。
    let 后端 = 命令行后端 { 程序, 用户词典目录: None };
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

/// ⚠️ **用户词典那一支**：目录里真有 `<语言>.dic` 时，`-d` 要给**路径**（去掉
/// 后缀）；没有就给语言名，让后端去系统里找。
#[test]
fn 用户词典在时给路径_不在时给语言名() {
    let 临时 = std::env::temp_dir().join(format!("nota-dicts-{}", std::process::id()));
    let _ = std::fs::remove_dir_all(&临时);
    std::fs::create_dir_all(&临时).unwrap();
    std::fs::write(临时.join("en_US.dic"), b"2\nhello\nworld\n").unwrap();
    std::fs::write(临时.join("en_US.aff"), b"SET UTF-8\n").unwrap();
    let 带 = 命令行后端 { 程序: "enchant-2", 用户词典目录: Some(临时.clone()) };
    // 去掉 `.dic` 后缀（hunspell 的 `-d` 收的是词干路径）。
    assert_eq!(带.词典参数("en_US"), 临时.join("en_US").display().to_string());
    // 用户目录里没带的那门语言：照旧交给系统词典。
    assert_eq!(带.词典参数("zh_CN"), "zh_CN");
    let 不带 = 命令行后端 { 程序: "enchant-2", 用户词典目录: None };
    assert_eq!(不带.词典参数("en_US"), "en_US");
    let _ = std::fs::remove_dir_all(&临时);
}
