//! 命令行参数。
//!
//! 目前只认一件事：**头一个不像选项的参数就是"要打开的文件"**。
//! `nota 笔记.md`、文件管理器里的"用 Nota 打开"、把文件拖到图标上，
//! 三条路最后都是同一个 argv。⚠️ 2026-09-25 之前这里**什么都不认**：
//! 双击一个 `.md` 关联到 Nota，会开出来一个空白编辑器，用户以为文件丢了。
//!
//! ⚠️ **不在这里判"文件在不在"，也不在这里读文件**。判了就等于把失败吞在这一层：
//! 用户双击一个被删掉的文件，界面上什么都不会发生，他只会得出"Nota 打不开文件"。
//! 这里只回答"哪个参数算路径"，读不读得出来由**打开文档那条既有的路**照常报
//! （弹提示条）。所以本模块是纯函数、没有 IO，`commands` 那层也只是一行包装。
//!
//! ⚠️ 只认**第一个**。多个路径该"各开一个标签"还是"只认头一个"没人定过，
//! 先不做；真要做时改这一个函数，调用方不用动。
//!
//! # 2026-09-27 加：`nota://` 链接也走这一条
//!
//! 「从 URL scheme 打开」（`docs/10-feature-matrix.md` §9 那一格）落地的方式
//! 就是这个：**桌面项把 `nota://…` 当参数送进来，这里把它解成一个路径**。
//! 于是那条路和"双击一个 .md"是**同一条路**——从 `cli` 到 `openPath` 一行都不用
//! 为它新写，失败也自然走既有的提示条。
//!
//! ⚠️ 注册那个桌面项的是 `url_scheme.rs`，但**注册不注册都不影响这里**：
//! 手动 `nota 'nota://open?path=/x.md'` 一样能用，这条也是它的验法。

use std::ffi::OsString;
use std::path::PathBuf;

/// 从参数表里挑出"要打开的文件"，没有就是 `None`。
///
/// `args` **含零号参数**（程序自己的路径），要跳掉——不跳的话每次启动都会
/// 去"打开"那个二进制文件本身。
pub fn 首个要打开的文件(args: impl IntoIterator<Item = OsString>) -> Option<PathBuf> {
    args.into_iter()
        .skip(1)
        // ⚠️ 以 `-` 开头的当选项跳过。今天**一个选项都没有**，这条纯属防御：
        // 启动器（桌面环境、IDE、`cargo run -- …`）塞进来的 `--foo` 不该被
        // 当成一个叫 "--foo" 的文件去打开，然后弹一句"路径不存在"。
        // 空参数同理（`nota ""` 是手滑，不是要打开当前目录）。
        .find(|a| {
            let s = a.to_string_lossy();
            !s.is_empty() && !s.starts_with('-')
        })
        .map(|a| 看成路径(&a))
}

/// 一个参数**当什么用**：`nota://` 链接要先把里面的路径解出来，别的原样当路径。
///
/// # 为什么"解不出来"照样当路径往下走
///
/// ⚠️ 一个 `nota://` 开头、但里面没有可用路径的参数（拼错、漏了 `path=`、
/// 路径不是绝对路径），这里**不返回 `None`**——返回 `None` 的表现是
/// "界面正常打开、什么都没说"，用户只会以为 Nota 坏了。
/// 原样当路径往下走，打开那条路会如实报「读文件失败 nota://…：没有那个文件」，
/// **那串 URL 就印在提示里**，用户能拿它去对照自己点的是哪一条链接。
///
/// 这是 `cli.rs` 从一开始那条口径的同一个用法（见模块头）：**别把失败吞在这一层**。
fn 看成路径(参数: &std::ffi::OsStr) -> PathBuf {
    if let Some(文本) = 参数.to_str() {
        if 是链接(文本) {
            if let Some(路径) = 从链接取路径(文本) {
                return 路径;
            }
        }
    }
    PathBuf::from(参数)
}

/// 这个参数是不是一个 `nota://` 链接。⚠️ **协议名不分大小写**（RFC 3986），
/// 别处发出来的可能是 `NOTA://`，判错的表现就是"点链接没反应"。
///
/// ⚠️⚠️ **必须按字节比，不许 `&参数[..7]`**：那是个**字节**下标，而路径里
/// 常有汉字（`/tmp/笔记.md` 的第 5 个字节正是"笔"的头一个字节），
/// 切在字符中间会**当场 panic**——`cli` 是启动路径上的第一个函数，
/// 于是"打开一个中文名的文件"变成"进程直接崩"。这条有回归用例钉着。
pub fn 是链接(参数: &str) -> bool {
    let 字节 = 参数.as_bytes();
    字节.len() >= 7 && 字节[..7].eq_ignore_ascii_case(b"nota://")
}

/// 从链接里取出那个**要打开的文件**。
///
/// 认两种写法（宿主自己那一侧的桌面项写的是第一种，也是文档里推的那种）：
///
/// ```text
/// nota://open?path=%2Fhome%2Fu%2F%E7%AC%94%E8%AE%B0.md
/// nota:///%2Fhome%2Fu%2F%E7%AC%94%E8%AE%B0.md      ← 等价，短一点
/// ```
///
/// ⚠️ **只认"文件"，不认"命令"**：`nota://` 里能塞的东西理论上可以很多
/// （打开设置、跑一条插件命令……），但每多认一种，就多一条**外部程序能指挥
/// 本应用做事**的通道。今天只开一条：打开一份用户自己的文件——它和
/// `nota 文件.md` 这条既有的路**一模一样**，没有多出任何能力。
///
/// ⚠️ **要求绝对路径**：相对路径在"谁的工作目录"这个问题上没有答案
/// （链接是从浏览器点开的，那时的工作目录属于浏览器）。
pub fn 从链接取路径(链接: &str) -> Option<PathBuf> {
    let 余下 = &链接[7..]; // `nota://` 之后
    let 尾 = if 余下.starts_with('/') {
        // `nota:///绝对/路径`：斜杠后面就是要打开的路径本身。
        余下
    } else {
        // `nota://open?…`：第一段是"做什么"，只认 `open`。
        let (头, 后) = match 余下.find(['/', '?']) {
            Some(i) => (&余下[..i], &余下[i..]),
            None => (余下, ""),
        };
        if !头.eq_ignore_ascii_case("open") {
            return None;
        }
        // 查询串：找 `path=`。⚠️ **不认 `+` 当空格**（与表单那套不一样）：
        // 文件名里本来就可以有 `+`，把它当空格会打开一个**不存在的文件**，
        // 而那种失败看起来像"链接解析坏了"。
        let 查询 = 后.strip_prefix('?')?;
        let 值 = 查询.split('&').find_map(|项| 项.strip_prefix("path="))?;
        值
    };
    let 取到 = 百分号解码(尾)?;
    if !取到.starts_with(b"/") {
        return None;
    }
    // ⚠️ 这里**不要求 UTF-8**：Linux 上的路径可以不是（同 `single_instance.rs`
    // 文件头那段）。`OsString::from_vec` 收原始字节，不经过字符串。
    // ⚠️ 先落到 `OsString` 再进 `PathBuf`：`PathBuf: From<_>` 的实现有好几份
    // （glib / rfd / tauri 都塞了 impl 进来），直接 `from(Vec<u8>)` 推不出来。
    let 串: std::ffi::OsString = std::os::unix::ffi::OsStringExt::from_vec(取到);
    Some(PathBuf::from(串))
}

/// `%XX` 解码。⚠️ 出错一律 `None`（**含"解出来不是合法 UTF-8"以外的一切**）：
/// 半截的 `%2` 没法猜用户想写什么，猜出来的路径会指向一个别的地方。
///
/// ⚠️ 只解 `%XX`，**不解 `+`**——理由见 `从链接取路径` 里那段。
fn 百分号解码(输入: &str) -> Option<Vec<u8>> {
    let 字节 = 输入.split('#').next()?.as_bytes(); // `#` 之后是片段，不属于路径
    let mut 出 = Vec::with_capacity(字节.len());
    let mut i = 0;
    while i < 字节.len() {
        if 字节[i] == b'%' {
            let 高 = 十六进制(*字节.get(i + 1)?)?;
            let 低 = 十六进制(*字节.get(i + 2)?)?;
            出.push(高 * 16 + 低);
            i += 3;
        } else {
            出.push(字节[i]);
            i += 1;
        }
    }
    Some(出)
}

fn 十六进制(b: u8) -> Option<u8> {
    match b {
        b'0'..=b'9' => Some(b - b'0'),
        b'a'..=b'f' => Some(b - b'a' + 10),
        b'A'..=b'F' => Some(b - b'A' + 10),
        _ => None,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn 参数表(v: &[&str]) -> Vec<OsString> {
        v.iter().map(OsString::from).collect()
    }

    #[test]
    fn 只有程序自己时没有要打开的文件() {
        assert_eq!(首个要打开的文件(参数表(&["/usr/bin/nota"])), None);
        assert_eq!(首个要打开的文件(Vec::new()), None);
    }

    #[test]
    fn 第一个非选项参数就是要打开的文件() {
        assert_eq!(
            首个要打开的文件(参数表(&["/usr/bin/nota", "/tmp/笔记.md"])),
            Some(PathBuf::from("/tmp/笔记.md"))
        );
    }

    /// ⚠️ 选项要跳过，但**不能因为见到选项就放弃**——后面那个路径还算数。
    #[test]
    fn 选项被跳过而它后面那个路径仍然算数() {
        assert_eq!(
            首个要打开的文件(参数表(&["nota", "--verbose", "-x", "a.md"])),
            Some(PathBuf::from("a.md"))
        );
        assert_eq!(首个要打开的文件(参数表(&["nota", "--verbose"])), None);
    }

    /// 路径的**存在性不在这一层判**（见模块头那段）：这里只挑参数，
    /// 挑出来的东西能不能读，是打开文档那条路的事。
    #[test]
    fn 不判存在性也不读文件() {
        assert_eq!(
            首个要打开的文件(参数表(&["nota", "/绝对不存在/的/文件.md"])),
            Some(PathBuf::from("/绝对不存在/的/文件.md"))
        );
        assert_eq!(首个要打开的文件(参数表(&["nota", ""])), None);
    }

    // ── `nota://` 链接（2026-09-27）────────────────────────────────────────

    #[test]
    fn 链接里带百分号的路径解得出来() {
        assert_eq!(
            从链接取路径("nota://open?path=%2Fhome%2Fu%2F%E7%AC%94%E8%AE%B0.md"),
            Some(PathBuf::from("/home/u/笔记.md"))
        );
    }

    /// ⚠️ 短写法（`nota:///绝对路径`）与长的**必须是同一个结果**：
    /// 两种写法都以文档里的面貌存在，只认一种的表现是"其中一半链接点不开"。
    #[test]
    fn 短写法与长写法同解() {
        let 长 = 从链接取路径("nota://open?path=%2Ftmp%2Fa.md");
        let 短 = 从链接取路径("nota:///%2Ftmp%2Fa.md");
        assert_eq!(长, Some(PathBuf::from("/tmp/a.md")));
        assert_eq!(短, 长);
    }

    /// ⚠️ 协议名**不分大小写**（RFC 3986）。判错的表现是"点链接没反应"。
    #[test]
    fn 协议名不分大小写() {
        assert!(是链接("NOTA://open?path=%2Ftmp%2Fa.md"));
        assert!(是链接("NoTa:///%2Ftmp%2Fa.md"));
        assert!(!是链接("nota:open?path=%2Ftmp%2Fa.md"), "少了 //，不当链接");
        assert!(!是链接("https://example.com"));
    }

    /// ⚠️ **`+` 不当初空格**：文件名里本来就可以有 `+`，把它当空格会去开一个
    /// 不存在的文件，而那种失败看起来像"链接解析坏了"。
    #[test]
    fn 加号原样留着不当空格() {
        assert_eq!(
            从链接取路径("nota://open?path=%2Ftmp%2Fa+b.md"),
            Some(PathBuf::from("/tmp/a+b.md"))
        );
    }

    /// ⚠️ 额外参数（`&` 之后那些）不该把 `path` 挤掉；`#` 之后是片段，不算路径。
    #[test]
    fn 认得path那一段别的参数不影响() {
        assert_eq!(
            从链接取路径("nota://open?other=1&path=%2Ftmp%2Fa.md&z=2"),
            Some(PathBuf::from("/tmp/a.md"))
        );
        assert_eq!(
            从链接取路径("nota://open?path=%2Ftmp%2Fa.md#frag"),
            Some(PathBuf::from("/tmp/a.md"))
        );
    }

    /// 解不出来的一律 `None`：**每一种都不是"猜一下"能救的**——猜出来的路径
    /// 会指向一个别的地方，比老实报错危险得多。
    #[test]
    fn 解不出来的一律给none() {
        assert_eq!(从链接取路径("nota://open?path="), None, "空路径");
        assert_eq!(从链接取路径("nota://open?nope=1"), None, "没有 path");
        assert_eq!(从链接取路径("nota://run?path=%2Ftmp%2Fa.md"), None, "只认 open");
        assert_eq!(从链接取路径("nota://open?path=%2"), None, "半截的 %");
        assert_eq!(从链接取路径("nota://open?path=%zz"), None, "不是十六进制");
        assert_eq!(
            从链接取路径("nota://open?path=tmp%2Fa.md"),
            None,
            "相对路径没有意义——那是浏览器的工作目录"
        );
    }

    /// ⚠️ 一个坏链接**照样交给打开那条路去报错**（见 `看成路径` 顶上那段）：
    /// 返回 `None` 的表现是"界面正常打开、什么都没说"。
    #[test]
    fn 坏链接不会被静默丢掉() {
        let 挑到 = 首个要打开的文件(参数表(&["nota", "nota://open?nope=1"]));
        assert_eq!(
            挑到,
            Some(PathBuf::from("nota://open?nope=1")),
            "要让它带着 URL 去报错，而不是当没看见"
        );
    }

    /// 一个解得出的链接，从这里出去时**已经是一个普通的路径**了——
    /// 后面的路（`nota_startup_file` → `openPath`）不必知道链接这回事。
    #[test]
    fn 好链接从参数表里挑出来时已经是路径() {
        assert_eq!(
            首个要打开的文件(参数表(&["nota", "nota://open?path=%2Ftmp%2Fb.md"])),
            Some(PathBuf::from("/tmp/b.md"))
        );
    }
}
