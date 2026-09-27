//! 插入图片：**这张图落到哪、文档里写什么**——全仓唯一一处实现。
//!
//! 这张图从哪来（剪贴板 / 拖入的文件 / 用户填的路径 / 网络地址）是**来源**；
//! 用户选的那个动作（`设置 → 图像 → 插入图片时`，五个选项）是**规则**。
//! 本文件把「来源 + 规则 + 文档位置」算成两样东西：**磁盘上多出一个文件吗**、
//! **Markdown 里写哪一条地址**。前端的对话框、剪贴板、拖放三条路都走这里，
//! 所以它们的行为不会各不相同。
//!
//! # 三条口径（都不是实现细节，是产品选择）
//!
//! **一、写地址的三条规则**，按来源分：
//!
//! | 情况 | 写什么 |
//! |---|---|
//! | 网络地址（用户给了 URL，且规则没要求拉到本地） | **原样**写那条 URL |
//! | 本地路径，**没有**被复制（动作是「无特殊操作」，或该来源的开关没开） | 用户本来就写的是相对路径 → **原样**；写的是绝对路径 → `prefer_relative` 开着才换算成相对 |
//! | 本应用**自己弄到磁盘上**的那一份（复制 / 下载 / 剪贴板落盘） | **一律相对路径**（`add_dot_slash` 开着时加 `./`） |
//!
//! ⚠️ `prefer_relative` **只朝一个方向动**：绝对 → 相对。本来就是相对的那些原样
//! 保留——反过来的话，用户手打一条 `./img/x.png` 会被"修正"成一个绝对路径，
//! 那是**改用户写下的东西**，而且症状（文档里多出 `/home/…`）看起来像 bug。
//!
//! ⚠️ 自己弄到磁盘上的那一份**不看** `prefer_relative`：整件事的意义就在于
//! "这份副本跟文档一起走"，写成绝对路径等于白复制。这一条与上面那条不冲突——
//! 上面那条管的是**用户给**的地址，这条管的是**本应用产生**的地址。
//!
//! **二、同内容不重复写**。目标位置已经有一份**逐字节相同**的文件时，直接复用，
//! 不再复制一份改名的（连续粘贴同一张截图不该堆出 `image-a1b2.png`、
//! `image-a1b2-1.png`、`image-a1b2-2.png`）。名字被占用**且内容不同**时才加
//! `-1`、`-2`。
//!
//! **三、对网络图片的规则默认不开**（`apply_to_remote` 默认 `false`）。
//! 开了之后「复制到…」对网络图片的含义是**把它下载下来**——这是本应用替用户
//! 去取一个他已经写在文档里的地址，不是"把文档发出去"；但它是**联网动作**，
//! 所以默认关着，且只在用户显式打开后发生。见 `docs/10` §11.2 那一行。
//!
//! # 转义只动哪几个字符
//!
//! `escape_url` 只把下面这些换成百分号形式，**其余一个字都不动**：
//! 空格 / `"` / `<` / `>` / `` ` ``，本地路径另外加上 `?` / `#` / **落单的** `%`。
//!
//! ⚠️ 两个"不转"是刻意的：
//! - **中文等非 ASCII 不转**。转成 `%E4%B8%AD` 之后文档里的地址没法看、没法改，
//!   而 Markdown 本来就允许（GFM 如此）；
//! - **网络地址里的 `?` `#` `%` 不转**。它们在 URL 里是有意义的（查询串、锚点），
//!   而且用户贴进来的多半是一条**已经正确编码**的地址——再把 `%20` 里的 `%`
//!   转一遍会得到 `%2520`，那是**把一条好地址改坏**。
//!   本地路径里的 `?` `#` 没有这种含义（文件名里就是普通字符），所以照转。//!
//! # 这个模块拆成了四份（2026-09-26）
//!
//! 2026-09-26 它自己长到 1232 行，顶破了 1000 行硬线（`docs/09` §4），于是
//! **沿职责**拆成四块——不是对半砍：
//!
//! | 文件 | 管什么 |
//! |---|---|
//! | **本文件** | 类型（`来源` / `规则` / `计划` / `做了` / `结果`）与常量 |
//! | `image/address.rs` | 地址算术：网络判定、转义、相对路径 |
//! | `image/target.rs` | 落点与文件名：写到哪个目录、叫什么名字 |
//! | `image/plan.rs` | 算计划 + 落地（**唯一碰网络的地方**） |
//! | `image/tests.rs` | 用例 |
//!
//! ⚠️ 对外只有本文件的路径（`crate::image::放置` 这种）——下面那几行 `pub use`
//! 是为此存在的。**调用方看不见拆过**，所以这次拆分没有连带改任何调用点。
//! ⚠️ 本文件**不放实现**：它一旦开始放，四块又会慢慢长回一块。

use std::path::PathBuf;

use crate::settings::image::InsertImageAction;

mod address;
mod plan;
mod target;

#[cfg(test)]
mod tests;

pub use address::{加点点斜杠, 定本地文件, 是网络地址, 相对路径, 规则适用, 转义地址};
pub use plan::{放置, 算计划, 落地};
pub use target::{定名, 目标目录};

/// 认得的图片后缀。**封闭集合**：剪贴板来的后缀要在里面，不认识的一律当 `png`。
///
/// ⚠️ `svg` 在里面（它是图片，Markdown 里就写 `![]`），但**不做任何净化**：
/// 本文件只负责"把这个字节搬到那个目录"，它不解析、不解码、不渲染。
/// 渲染那一侧的安全边界在 WebView（`src/editor/`），不在这里。
pub const 认得的后缀: [&str; 8] = ["png", "jpg", "jpeg", "gif", "webp", "bmp", "svg", "avif"];

/// 从哪来。
#[derive(Debug, Clone)]
pub enum 来源 {
    /// 磁盘上已经有一个文件（用户填的路径、拖进来的文件）。
    本地文件(PathBuf),
    /// 一条 http/https 地址。
    网络地址(String),
    /// 剪贴板里的图片数据。**没有原处**，所以它必须落盘。
    剪贴板 { 字节: Vec<u8>, 后缀: String },
}

impl 来源 {
    pub fn 是网络(&self) -> bool {
        matches!(self, 来源::网络地址(_))
    }
    /// 这个来源**必须**落盘吗？剪贴板是（它没有"原处"可指）。
    pub fn 必须落盘(&self) -> bool {
        matches!(self, 来源::剪贴板 { .. })
    }
    /// 用户看得懂的短描述，给报错与提示用。
    pub fn 描述(&self) -> String {
        match self {
            // ⚠️ 文件名而不是整条路径：路径常常长得没法读，而用户认得自己的文件名。
            来源::本地文件(p) => p
                .file_name()
                .map(|s| s.to_string_lossy().to_string())
                .unwrap_or_else(|| p.to_string_lossy().to_string()),
            来源::网络地址(u) => u.clone(),
            来源::剪贴板 { .. } => "剪贴板里的图片".to_string(),
        }
    }
}

/// 用户那几个设置（`设置 → 图像`）里跟"落地"有关的部分。
#[derive(Debug, Clone)]
pub struct 规则 {
    pub action: InsertImageAction,
    pub apply_to_local: bool,
    pub apply_to_remote: bool,
    pub custom_dir: String,
    pub prefer_relative: bool,
    pub add_dot_slash: bool,
    pub escape_url: bool,
}

impl 规则 {
    /// 从设置里取。**只取这一处**——多一个调用点自己拼字段，就会多一处
    /// "设置页上有、插入时不生效"的字段（`docs/07` 第 62 项记的就是这件事）。
    pub fn 从设置(i: &crate::settings::image::Image) -> Self {
        Self {
            action: i.insert_action,
            apply_to_local: i.apply_to_local,
            apply_to_remote: i.apply_to_remote,
            custom_dir: i.custom_dir.clone(),
            prefer_relative: i.prefer_relative,
            add_dot_slash: i.add_dot_slash,
            escape_url: i.escape_url,
        }
    }
}

/// 算好的计划。**纯函数产出**，不碰磁盘、不联网——所以它可以逐条测。
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum 计划 {
    /// 什么都不复制，文档里写这条地址。
    不动 { 地址: String },
    /// 把磁盘上那个文件复制到 `到` 目录里。
    复制 { 从: PathBuf, 到: PathBuf },
    /// 把这条地址下载下来，写进 `到` 目录。
    下载 { 地址: String, 到: PathBuf },
    /// 把这段字节写进 `到` 目录。
    写盘 { 字节: Vec<u8>, 到: PathBuf, 名字: String },
}

/// 实际做了哪件事。前端拿它拼提示语（**这里只给事实，不给句子**）。
///
/// ⚠️ 过 IPC 的名字**写死英文**（`rename` 一个一个给），不用 `rename_all`：
/// 变体名是中文，大小写那套转换对中文没有意义（结果一样，但那是**碰巧**），
/// 而且"留在原处"这种词直接当协议字段值，读日志的人还得先知道这是 Rust 里的
/// 哪个变体。前端 `ipc.ts` 里有一份对应的联合类型。
#[derive(Debug, Clone, Copy, PartialEq, Eq, serde::Serialize)]
pub enum 做了 {
    /// 图片留在原处，文档里指向它。
    #[serde(rename = "kept")]
    留在原处,
    /// 复制了一份副本。
    #[serde(rename = "copied")]
    复制,
    /// 从网络下载了一份副本。
    #[serde(rename = "downloaded")]
    下载,
    /// 剪贴板的图片写进了磁盘。
    #[serde(rename = "written")]
    写盘,
    /// 目标位置已经有一份一模一样的，复用它。
    #[serde(rename = "existing")]
    已有,
}

/// 落地结果。
#[derive(Debug, Clone, serde::Serialize)]
pub struct 结果 {
    /// 写进 Markdown 的那条地址。
    pub src: String,
    /// 磁盘上多出来（或复用）的那份文件。没落盘就是 `None`。
    pub 落到: Option<String>,
    pub 做了: 做了,
}
