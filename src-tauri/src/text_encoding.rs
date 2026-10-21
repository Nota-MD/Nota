//! **文件编码**：读进来怎么解码、写出去怎么编码（2026-10-16 新建）。
//!
//! 用户朋友那份清单里的第 6 条：「**功能:打开,保存编码增加**」。在那之前，这个
//! 程序读写文件走的是 `std::fs::read_to_string` / `std::fs::write`——也就是
//! **只认 UTF-8**：一份 GBK 的中文笔记打开是一片乱码，而"另存为"又会把那份乱码
//! 按 UTF-8 写回去。⚠️ 后一半比前一半危险：**打开看着乱、存一次就真毁了**。
//!
//! # 三个约定
//!
//! 1. **编码是文档的属性，不是全局设置**：同一批笔记里一份 GBK、一份 UTF-8 是常事，
//!    "全局默认编码"只在**新建**时给一个初值。改编码 = 改这一份。
//! 2. **认不出来就按 UTF-8**。这不是"猜对了"，是"按最可能的那一个办，而且界面上
//!    看得到现在用的是什么"——照 Typora 的做法：它也是先嗅探、嗅不出来按 UTF-8。
//! 3. **写盘一律用那份文档记着的编码**，不是"探测出来的那一个"：用户手动选过
//!    `GBK` 之后，存盘必须还是 GBK——不然"选编码"这件事在第一次存盘之后就失效了。
//!
//! # 依赖两个 crate，都是宽松许可（和本仓 BSD-2 相容）
//!
//! - `encoding_rs`（MIT / Apache-2.0，Henri Sivonen，也是 Firefox 里那份实现）：
//!   编解码本体，含 WHATWG 那张标签表（`gbk` / `big5` / `shift_jis` / …）；
//! - `chardetng`（MIT / Apache-2.0，同一个作者）：**猜**。⚠️ 它只在文件没有 BOM、
//!   而且不是合法 UTF-8 的时候才用得上——见 `猜着解码`。
//!
//! # ⚠️ 两个如实的代价
//!
//! - **`encode` 会把编不出来的字换成 HTML 数字实体**（`&#26085;`）——那是 WHATWG
//!   的编码器规范行为，不是我们选的。也就是说"用 GBK 存一份日文假名"写出来的是
//!   `&#12354;` 这样的字面量。⚠️ 界面**不拦**这件事：拦就要在存盘前把整篇按目标
//!   编码扫一遍，那份开销与误报都不划算；而"用户明确要 GBK"本来就意味着他知道
//!   自己在干什么。
//! - **UTF-16 我们写 BOM**：这两种不带 BOM 时谁都认不出来（包括记事本），
//!   所以写盘时补一个；UTF-8 **不写** BOM（Linux / git 世界的惯例，写了反而
//!   在文件头多出三个字节）。

use std::path::Path;

use chardetng::EncodingDetector;
use encoding_rs::{Encoding, UTF_16BE, UTF_16LE, UTF_8};

use crate::error::{NotaError, Result};

/// 认不出来、或者新建文档时用的那一个。
pub const 兜底编码: &str = "UTF-8";

/// 界面上那一个列表（`文件 → 编码 ▸`）与菜单都用它。
///
/// ⚠️ 顺序是**给人看的顺序**：先是 UTF-8，再按东亚语区、再西欧。⚠️ 第一个元素是
/// `encoding_rs` 认的 **label**（落盘、传给宿主的就是它），第二个是界面上写的那行
/// 说明——⚠️ **不翻译**（同 `ui/spell-langs.ts` 那条：这一列说的是"这门编码叫什么"，
/// 不是文案）。
pub const 常用编码: &[(&str, &str)] = &[
    ("UTF-8", "UTF-8（通用）"),
    ("GBK", "GBK / GB2312（简体中文）"),
    ("GB18030", "GB18030（简体中文，含生僻字）"),
    ("Big5", "Big5（繁体中文）"),
    ("Shift_JIS", "Shift_JIS（日文）"),
    ("EUC-JP", "EUC-JP（日文）"),
    ("EUC-KR", "EUC-KR（韩文）"),
    ("UTF-16LE", "UTF-16 LE（Windows 记事本）"),
    ("UTF-16BE", "UTF-16 BE"),
    ("windows-1252", "Windows-1252（西欧）"),
    ("ISO-8859-1", "ISO-8859-1（西欧）"),
];

/// 把界面上那个 label 认成一份编码。认不出来给 `None`（调用方报人话）。
pub fn 认编码(label: &str) -> Option<&'static Encoding> {
    Encoding::for_label(label.trim().as_bytes())
}

/// 一份编码的**规范名**（落盘用的那个）：`gbk` → `GBK`、`utf8` → `UTF-8`。
///
/// ⚠️ 存的是**规范名不是用户输入的原文**：用户在别处写 `gb2312`、菜单上那一行是
/// `GBK`，两个名字指同一份编码——存原文的话"当前用哪一种"就有好几种写法，
/// 而菜单上那个勾要按它比。
pub fn 规范名(label: &str) -> Option<String> {
    认编码(label).map(|e| e.name().to_string())
}

/// **读一份文件**：先看 BOM，再看是不是合法 UTF-8，最后交给探测器猜。
///
/// 返回解出来的文本与**用的那份编码**——后者要跟着文档一起存着，存盘时按它写回去。
pub fn 读文件(path: &Path) -> Result<(String, String)> {
    let 字节 = std::fs::read(path).map_err(|source| NotaError::Read {
        path: path.to_path_buf(),
        source,
    })?;
    Ok(猜着解码(&字节))
}

/// 按**指定**编码读（用户从「文件 → 编码」里点名的那一种）。
///
/// ⚠️ 指定的编码**不做 BOM 嗅探**：用户说 GBK 就是 GBK。这条路的目的正是
/// "自动那次猜错了，我来定"——再让 BOM 插一嘴，用户点名的那一次就可能不生效。
pub fn 按编码读(path: &Path, label: &str) -> Result<String> {
    let 编码 = 认编码(label).ok_or_else(|| NotaError::other(format!("认不出的编码：{label}")))?;
    let 字节 = std::fs::read(path).map_err(|source| NotaError::Read {
        path: path.to_path_buf(),
        source,
    })?;
    let (文本, _, _) = 编码.decode_without_bom_handling(&字节);
    Ok(文本.into_owned())
}

/// 按**指定**编码写一份文件。
pub fn 按编码写(path: &Path, 文本: &str, label: &str) -> Result<()> {
    let 编码 = 认编码(label).ok_or_else(|| NotaError::other(format!("认不出的编码：{label}")))?;
    let 字节 = 编码后的字节(编码, 文本);
    std::fs::write(path, 字节).map_err(|source| NotaError::Write {
        path: path.to_path_buf(),
        source,
    })
}

/// 猜着解码：BOM → 合法 UTF-8 → 探测器。
///
/// ⚠️ **判据的顺序不能换**：
/// 1. **BOM 最硬**——文件自己写着"我是什么"，猜没有资格推翻它；
/// 2. **合法 UTF-8 就当 UTF-8**，连猜都不猜：`chardetng` 对一份短文本**有可能**
///    猜成别的（它的统计模型吃"长文本"这一口），而"这份文件本来就是 UTF-8"是
///    本世纪最常见的情形；
/// 3. 剩下的才交给 `chardetng`。
fn 猜着解码(字节: &[u8]) -> (String, String) {
    if let Some((编码, _)) = Encoding::for_bom(字节) {
        let (文本, _, _) = 编码.decode(字节);
        return (文本.into_owned(), 编码.name().to_string());
    }
    if let Ok(文本) = std::str::from_utf8(字节) {
        return (文本.to_string(), UTF_8.name().to_string());
    }
    let mut 探测器 = EncodingDetector::new();
    探测器.feed(字节, true);
    let 编码 = 探测器.guess(None, true);
    let (文本, _, _) = 编码.decode(字节);
    (文本.into_owned(), 编码.name().to_string())
}

/// 把文本编成字节。⚠️ UTF-16 补 BOM（理由在文件头最后一条）。
fn 编码后的字节(编码: &'static Encoding, 文本: &str) -> Vec<u8> {
    let (体, _, _) = 编码.encode(文本);
    let 补不补 = 编码 == UTF_16LE || 编码 == UTF_16BE;
    let mut 出: Vec<u8> = Vec::with_capacity(体.len() + if 补不补 { 2 } else { 0 });
    if 补不补 {
        // ⚠️ 只有 UTF-16 走到这儿（见上面那个布尔），所以这两支就够了。
        出.extend_from_slice(if 编码 == UTF_16BE {
            &[0xFE, 0xFF]
        } else {
            &[0xFF, 0xFE]
        });
    }
    出.extend_from_slice(&体);
    出
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn 规范名把别名收成同一个() {
        // ⚠️ 这几对是历史遗留的别名，落盘必须归一：不然菜单上那个勾要对好几种写法。
        assert_eq!(规范名("gb2312").as_deref(), Some("GBK"));
        assert_eq!(规范名("gbk").as_deref(), Some("GBK"));
        assert_eq!(规范名("utf8").as_deref(), Some("UTF-8"));
        assert_eq!(规范名("  UTF-8  ").as_deref(), Some("UTF-8"));
        assert_eq!(规范名("这不是编码"), None);
    }

    #[test]
    fn 纯ascii与合法utf8都当utf8() {
        // ⚠️ 这两条是"不交给探测器"的那两条路：短 ASCII 与合法 UTF-8 都可能在
        // 探测器那里被猜成别的（统计模型对短文本不靠谱）。
        assert_eq!(猜着解码(b"hello world").1, "UTF-8");
        assert_eq!(猜着解码("中文正文".as_bytes()).1, "UTF-8");
    }

    #[test]
    fn bom说了算() {
        let le = 编码后的字节(UTF_16LE, "中文");
        let (文本, 编码名) = 猜着解码(&le);
        assert_eq!(编码名, "UTF-16LE");
        assert_eq!(文本, "中文");
    }

    #[test]
    fn gbk往返() {
        let 原文 = "中文笔记：一二三\n第二行\n";
        let 字节 = 编码后的字节(认编码("gbk").unwrap(), 原文);
        // ⚠️ GBK 下这几个字各占两字节，所以字节数明显大于字符数——这一条顺带
        // 证明"真的按 GBK 编了"，而不是偷偷按 UTF-8 写出去。
        assert!(字节.len() >= 原文.chars().count() * 2 - 4);
        let (回, 编码名) = 猜着解码(&字节);
        assert_eq!(回, 原文);
        assert_eq!(编码名, "GBK");
    }

    #[test]
    fn big5与shiftjis也认() {
        for 标签 in ["big5", "shift_jis", "euc-kr", "utf-16le"] {
            assert!(认编码(标签).is_some(), "{标签} 应该认得出");
        }
    }

    #[test]
    fn utf16写盘补bom而utf8不补() {
        let 文 = "abc";
        let le = 编码后的字节(UTF_16LE, 文);
        assert_eq!(&le[..2], &[0xFF, 0xFE]);
        let be = 编码后的字节(UTF_16BE, 文);
        assert_eq!(&be[..2], &[0xFE, 0xFF]);
        // ⚠️ UTF-8 **不写** BOM：写了的话 git diff 里每个文件都多三个字节，
        // 而且 `head` 出来第一个字符是隐形的。
        let u8 = 编码后的字节(UTF_8, 文);
        assert_eq!(&u8[..1], b"a");
    }

    #[test]
    fn 认不出的编码报人话() {
        let 错 = 按编码写(Path::new("/tmp/nota-不存在-的目录/x.txt"), "a", "乱写的");
        assert!(错.is_err(), "认不出的编码要先报错，而不是去写盘");
    }

    #[test]
    fn 常用编码表里每一个都能认() {
        for (标签, _) in 常用编码 {
            assert!(认编码(标签).is_some(), "表里的 {标签} 必须认得出");
        }
    }
}
