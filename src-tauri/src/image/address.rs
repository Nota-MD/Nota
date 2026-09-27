//! 地址算术：**一条地址最终是怎么写进 Markdown 的**。
//!
//! 2026-09-26 从 `image.rs` 拆出来（那边 1232 行顶破了 1000 行硬线）。这一支是
//! 纯粹的字符串活：是不是网络地址、哪几个字符要转义、两个绝对路径之间怎么写
//! 一条相对路径。**不碰磁盘、不读设置、不联网**——所以它是这三块里最好测的，
//! 也最该自己待着。
//!
//! ⚠️ 口径（转义只动哪几个字符、`prefer_relative` 只朝一个方向动）写在
//! `image.rs` 的文件头，这里**不重复一遍**：同一个口径写两处，迟早有一处过期。

use std::path::{Component, Path, PathBuf};

/// 这条地址是不是网络地址。**只认 http/https**。
///
/// ⚠️ 不认 `data:`：那种地址没有"原处"可言，也没有副本可写，
/// 插进文档里就是它自己（真要插，用户手打进去）。
pub fn 是网络地址(s: &str) -> bool {
    let s = s.trim();
    let 小写 = s.to_ascii_lowercase();
    小写.starts_with("http://") || 小写.starts_with("https://")
}

/// 百分号转义。`是网络` 决定 `?` `#` `%` 动不动（见文件头）。
pub fn 转义地址(s: &str, 是网络: bool) -> String {
    let mut out = String::with_capacity(s.len());
    let 字节: Vec<char> = s.chars().collect();
    for (i, c) in 字节.iter().enumerate() {
        let 要转 = match c {
            ' ' | '"' | '<' | '>' | '`' => true,
            // 本地路径里这三个是普通字符；网络地址里是有含义的定界符。
            '?' | '#' => !是网络,
            '%' => {
                // 落单的 `%` 才转：`%20` 这种已经是编码结果，再转一次就毁了。
                !是网络 && !后两位是十六进制(&字节, i)
            }
            _ => false,
        };
        if 要转 {
            let mut buf = [0u8; 4];
            for b in c.encode_utf8(&mut buf).as_bytes() {
                out.push_str(&format!("%{b:02X}"));
            }
        } else {
            out.push(*c);
        }
    }
    out
}

/// `字节[i+1]` 和 `字节[i+2]` 是不是两个十六进制数字。
fn 后两位是十六进制(字节: &[char], i: usize) -> bool {
    字节
        .get(i + 1)
        .zip(字节.get(i + 2))
        .is_some_and(|(a, b)| a.is_ascii_hexdigit() && b.is_ascii_hexdigit())
}

/// 从 `基准目录` 怎么看 `目标`——算成一条**用 `/` 分隔**的相对路径。
///
/// ⚠️ 分隔符写死 `/`：这是给 Markdown 用的，Windows 的反斜杠在 Markdown 链接里
/// 是转义符（`![](a\b.png)` 里的 `\b` 会被当成转义），写出来是坏的。
///
/// 两边有一边不是绝对路径就给 `None`（调用方退回绝对路径的原样写法）。
pub fn 相对路径(基准目录: &Path, 目标: &Path) -> Option<String> {
    if !基准目录.is_absolute() || !目标.is_absolute() {
        return None;
    }
    let a: Vec<Component> = 基准目录.components().collect();
    let b: Vec<Component> = 目标.components().collect();
    let mut i = 0;
    while i < a.len() && i < b.len() && a[i] == b[i] {
        i += 1;
    }
    // 只有正常层级可以往上退；根、盘符退不了（`C:` 上面没有东西）。
    let 往上 = a[i..]
        .iter()
        .filter(|c| matches!(c, Component::Normal(_)))
        .count();
    let mut 段: Vec<String> = vec!["..".to_string(); 往上];
    for c in &b[i..] {
        if let Component::Normal(s) = c {
            段.push(s.to_string_lossy().to_string());
        }
    }
    if 段.is_empty() {
        // 基准目录与目标同一个位置——只可能出现在"目标就是那个目录"这种错用上，
        // 给 `.` 而不是空串（空串插进 Markdown 会变成 `![]()`，看着像坏了）。
        return Some(".".to_string());
    }
    Some(段.join("/"))
}

/// 加上 `./` 前缀（`add_dot_slash` 开着时用）。
///
/// ⚠️ 已经是 `./` 或 `../` 开头的**不加**：`./../x.png` 是能用的，但没人这么写，
/// 而且它会让"开这一项"在跨目录的场合看起来很怪。
pub fn 加点点斜杠(相对: &str) -> String {
    if 相对.starts_with('.') {
        相对.to_string()
    } else {
        format!("./{相对}")
    }
}

/// 把一条"用户给的路径"定成一个**能拿去读的路径**：相对路径按文档目录算。
///
/// ⚠️ 只有**要读那个文件**的人用得上它（今天只有上传那一条：`upload/net.rs`）。
/// `image/plan.rs` 里那几条"写地址"的规则**不用**它——那边只把用户写的那串字
/// 搬进文档，一个字节都不读；而且"用户写的是相对路径就原样保留"恰恰是那边的
/// 口径（见 `image.rs` 文件头）。
///
/// ⚠️ 为什么不能直接用相对路径去 `std::fs::read`：那个路径是相对**文档**算的，
/// 而进程的工作目录是另一回事（双击图标启动时通常是家目录或 `/`）。
/// 文档没有路径（新文档还没存盘）时**原样返回**：读不到的那句报错里带的是用户
/// 自己写的那个路径，他认得；换成别的东西反而找不着北。
pub fn 定本地文件(给的: &Path, 文档目录: Option<&Path>) -> PathBuf {
    if 给的.is_absolute() {
        return 给的.to_path_buf();
    }
    match 文档目录 {
        Some(目录) => 目录.join(给的),
        None => 给的.to_path_buf(),
    }
}

/// 这条规则对这张图生效吗（对应设置页那两个开关）。
pub fn 规则适用(是网络: bool, apply_to_local: bool, apply_to_remote: bool) -> bool {
    if 是网络 {
        apply_to_remote
    } else {
        apply_to_local
    }
}
