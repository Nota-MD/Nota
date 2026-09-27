//! **会话与最近文件**：上次开着哪几份、最近打开过哪些、每份滚到哪儿。
//!
//! 落点是一份侧车：`~/.local/share/nota/session.toml`（[`crate::paths::session_file`]）。
//!
//! # ⚠️ 为什么是侧车，不写进文档、也不进 `settings.toml`
//!
//! - **不写进 `.md`**：本仓那条死规矩——**不改用户的字节**（`docs/08`）。
//!   滚动位置这种东西写进正文，等于用户滚一下鼠标就动了他的文件。
//! - **不并进 `settings.toml`**：那一份是**标量偏好**（`docs/03`：字号、宽度、
//!   缩进那几个开关），而这里是一串**随开随关一直在变的路径**，形状与生命周期
//!   都不同。并进去会让 `nota_settings_set` 那条"整份替换 + 落盘"的口径多带
//!   一份容易丢的清单（`plugins.toml` 分出去是同一个理由，见 `paths.rs`）。
//! - **放 `data` 不放 `config`**：判据就是 `paths.rs` 顶上那条——`config` 放
//!   **用户该能拿编辑器直接改的东西**，而这一份是**看的时候的状态**，用户不会
//!   去手改它、也不该在"设置目录"里看见它。判据与 [`crate::table_width`]
//!   那条一模一样，是这个判据下的第三个例外。
//!
//! ⚠️ 删掉这个文件的后果，全部只有"记忆没了"：**打开的标签不恢复**、
//! **最近文件列表空掉**、**滚动位置回到顶上**。文档正文一个字节都不受影响。
//!
//! # 形状
//!
//! ```toml
//! open = [
//!     "/home/lqy/笔记/a.md",
//!     "/home/lqy/笔记/b.md",
//! ]
//! active = "/home/lqy/笔记/b.md"
//! recent = [
//!     "/home/lqy/笔记/b.md",
//!     "/home/lqy/笔记/a.md",
//! ]
//!
//! [scroll]
//! "/home/lqy/笔记/a.md" = 0.42
//! ```
//!
//! 四样东西放一份文件、不拆四个：它们的**生命周期完全一样**（都是"上次用到哪儿"），
//! 而且都是同一个时刻写出去（切标签、开关文档）。拆开只会多三次读盘、多三份文件头。
//!
//! # ⚠️ 账一：路径是**字符串**，不是 `PathBuf`
//!
//! 存量一律按 `String` 走，与 `recent` / `open` 那两个数组本来就只能是文本一致。
//! 用的是 `to_string_lossy()`（与 [`crate::table_width`] 同一条口径）：非 UTF-8
//! 路径会被换成 `�`，两条不同的非 UTF-8 路径**可能**映成同一个键。**接受这个损失**
//! ——另一条路是直接报错，那就变成"这样命名的文档进不了最近列表"。
//!
//! # ⚠️ 账二：坏文件当"空的"用，而"空的"会被下一次写盘覆盖
//!
//! 读不出来 / 坏 TOML **一律当空的用，不报错**（口径与 `upload::读`、
//! `table_width::读` 一致）。代价是下一次写盘会把那份读不懂的文件整个覆盖掉——
//! 写盘是整体的（读一份、改内存、写回）。真被覆盖了，后果也只是"记忆没了"。
//!
//! # ⚠️ 账三：「最近」按**路径**去重，同一份文件改过名就算两份
//!
//! 与列宽那条账同源：宿主不去扫全盘对账，也不该去猜"这份新文件是不是原来那份"。
//! 「另存为」之后**新旧两条会同时在列表里**——旧那条点下去会报"路径不存在"，
//! 前端据此提示并忘掉它（[`忘最近`]）。
//!
//! # ⚠️ 滚动位置存的是**比例**，不是像素
//!
//! 像素在两个方向上都会撒谎：换字号、改正文宽度、开分屏，同一个像素偏移指向的
//! 是完全不同的地方。比例（`0.0` = 顶上、`1.0` = 底下）在这些情况下都还对得上。
//! 代价是**很长的文档里会有小偏差**（同一比例在不同字体下的绝对位置不同），
//! 而那属于"大致回到刚才那儿"就够了的场景。

use std::collections::BTreeMap;
use std::path::{Path, PathBuf};

use serde::{Deserialize, Serialize};

use crate::error::NotaError;
use crate::paths;

/* ── 形状 ──────────────────────────────────────────────────────────────── */

/// 「最近」最多留几条。
///
/// ⚠️ 20 这个数**不是随便定的**：菜单里那一栏要能一屏看下来（多了要滚，
/// 而"最近文件"这个功能的价值就在"一眼看到"），同时 20 条足够覆盖"今天在写的
/// 那几篇"。它同时也是 `scroll` 那一节的**上限来源**之一（见 [`修剪`]）。
pub const 最近最多: usize = 20;

/// 「会话」里最多恢复几份文档。
///
/// ⚠️ 比 [`最近最多`] 小得多是刻意的：**一次开 30 个标签不是"会话"，是事故**
/// （多半是上一次崩了留下的）。恢复会话的判据是"回到刚才的样子"，不是"把
/// 历史全开出来"。
pub const 会话最多: usize = 12;

/// 滚动位置那一节的条数上限（见 [`修剪`]）。
///
/// ⚠️ 它**只是兜底**：正常情况下 [`修剪`] 会把 `scroll` 削到 `最近最多 + 会话最多`
/// 以内。这个数防的是"某个路径既不在 recent 也不在 open、却还挂在 scroll 里"
/// 那种不该出现的状态。
pub const 滚动最多: usize = 64;

/// 一份会话的全部内容。
#[derive(Debug, Clone, Default, PartialEq)]
pub struct 会话 {
    /// 上次退出时开着的那几份（顺序＝标签顺序）。
    pub open: Vec<String>,
    /// 上次前台是哪一份。**可能不在 `open` 里**（文件被删了），读的时候要兜。
    pub active: Option<String>,
    /// 最近打开过的路径，**最新在前**。
    pub recent: Vec<String>,
    /// 每份文档上次滚到哪儿（`0.0`~`1.0` 的比例）。
    pub scroll: BTreeMap<String, f64>,
}

/// 落盘形状。`toml` 要求顶层是一个表，所以包一层。
///
/// ⚠️ 字段名用英文 `snake_case`，与设置页那几张表一致（`upload.rs` 顶上那条注释
/// 说的是同一件事）：这个文件是**给人和别的工具看**的。
#[derive(Debug, Clone, Default, Serialize, Deserialize)]
struct 存档 {
    #[serde(default)]
    open: Vec<String>,
    #[serde(default)]
    active: Option<String>,
    #[serde(default)]
    recent: Vec<String>,
    #[serde(default)]
    scroll: BTreeMap<String, f64>,
}

/// 文件头。用户翻到这个文件时先看到它，知道这是什么、删了会怎样。
const 文件头: &str = "\
# 这个文件是 Nota 的「会话」：上次开着哪几份、最近打开过哪些、每份滚到哪儿。
# ⚠️ 删掉它 = 下次启动不恢复标签、最近文件列表空掉、滚动位置回到顶上，
#    你的 Markdown 文档一个字节都不受影响。
# ⚠️ 只列路径，不存正文；里面没有任何你的文字。
";

/* ── 纯函数那一半（用例主要钉这里） ────────────────────────────────────── */

/// 把一条路径推到「最近」的最前面。
///
/// 三条规则，缺一不可：
/// 1. **先去重再插**——同一份文件开两次只该有一条；
/// 2. **已经在最前面时原样不动**——否则每按一次 `Ctrl+S` 都要重写一遍文件
///    （前端按内容比过之后才落盘，但少一次写总是好的）；
/// 3. 超过 [`最近最多`] 的尾巴**砍掉**。
pub fn 推入最近(列表: &mut Vec<String>, 路径: &str) {
    if 列表.first().map(String::as_str) == Some(路径) {
        return;
    }
    列表.retain(|x| x != 路径);
    列表.insert(0, 路径.to_string());
    列表.truncate(最近最多);
}

/// 把比例夹进 `0.0~1.0`。
///
/// ⚠️ **`NaN` 会变成 `0.0`**：`clamp` 在 `NaN` 上的行为是"返回 `NaN`"，
/// 而一个 `NaN` 写进 TOML 是 `nan`——那是**合法的 TOML 浮点数**，
/// 于是它会一路活到前端，变成 `scrollTo(NaN)`。这类值只能在这一层挡住。
/// `无穷` 同理（`clamp` 恰好能处理，但显式写出来更好读）。
pub fn 夹比例(v: f64) -> f64 {
    if !v.is_finite() {
        return 0.0;
    }
    v.clamp(0.0, 1.0)
}

/// 丢掉指向"现在不存在的东西"的条目。`存在` 由调用方给（用例里给假的）。
///
/// ⚠️ **只在读的时候过滤，不顺手落盘**：删一份文件之后，它只是**不再显示**，
/// 那份侧车里的字节要等下一次真的写盘才变。理由是"读"这条路上不该出现
/// "用户打开一下应用、磁盘上某份文件被改了"这种看不见的写。
///
/// ⚠️ `active` **不在这里兜**：它是否还在 `open` 里由消费方判断
/// （见 `commands::session` 那一段），因为"兜底选哪一份"是界面口径，不是存储口径。
pub fn 清掉不存在的(会话: &mut 会话, 存在: impl Fn(&str) -> bool) {
    会话.open.retain(|p| 存在(p));
    会话.recent.retain(|p| 存在(p));
    会话.scroll.retain(|p, _| 存在(p));
}

/// 写盘前的修剪：`scroll` 只留**还在清单里**的那些路径，并且不超过 [`滚动最多`]。
///
/// ⚠️ 这是 `scroll` 唯一的增长上限。不修剪的话它会**只增不减**：用户开着
/// 500 篇文档各滚一遍，那个表就有 500 条，而其中大半再也不会被读到。
/// 判据用"还在 `recent`/`open` 里"而不是"最近用过"：这两份清单本身就是
/// 最近用过的那些，长度还各有上限，于是 `scroll` 自然被压到
/// `最近最多 + 会话最多` 以内——**不需要再记一个时间戳**。
pub fn 修剪(会话: &mut 会话) {
    let 保留: std::collections::HashSet<&str> = 会话
        .open
        .iter()
        .chain(会话.recent.iter())
        .map(String::as_str)
        .collect();
    会话.scroll.retain(|p, _| 保留.contains(p.as_str()));
    会话.open.truncate(会话最多);
    会话.recent.truncate(最近最多);
    if 会话.scroll.len() > 滚动最多 {
        // 走到这里说明上面那条不变式破了（理论上不该发生）。BTreeMap 的序是
        // 字典序、没有时间含义，所以这里**只能**按条数硬砍——留着比砍掉更糟：
        // 一个只会变大的文件是"越用越慢"的经典形状。砍的是排后面的那些。
        let 丢: Vec<String> = 会话
            .scroll
            .keys()
            .skip(滚动最多)
            .cloned()
            .collect();
        for k in 丢 {
            会话.scroll.remove(&k);
        }
    }
}

/// 落盘形状 → 会话。**唯一一处**做"读进来之后要修正什么"的地方。
///
/// 修两处：
/// - `active` 是**空串**时当没有（手改文件、或某次写到一半留下的形状）；
/// - 比例**再夹一遍**：这个文件用户能手改，`nan` 与 `-3` 都是合法 TOML，
///   不夹的话它会一路活到前端的 `scrollTo`。
fn 从存档(档: 存档) -> 会话 {
    会话 {
        open: 档.open,
        active: 档.active.filter(|s| !s.is_empty()),
        recent: 档.recent,
        scroll: 档
            .scroll
            .into_iter()
            .map(|(k, v)| (k, 夹比例(v)))
            .collect(),
    }
}

/// 文本 → 会话。**纯函数**：不打日志、不碰盘。
///
/// ⚠️ 坏 TOML 当"空的"用，**不报错**（口径见文件头"账二"）。
pub fn 从文本(text: &str) -> 会话 {
    从存档(toml::from_str::<存档>(text).unwrap_or_default())
}

/// 会话 → 文本（带文件头）。**先修剪**（见 [`修剪`]）。
pub fn 到文本(会话: &会话) -> Result<String, String> {
    let mut 会话 = 会话.clone();
    修剪(&mut 会话);
    let 档 = 存档 {
        open: 会话.open,
        active: 会话.active,
        recent: 会话.recent,
        scroll: 会话.scroll,
    };
    let body = toml::to_string_pretty(&档)
        .map_err(|e| format!("会话写不成 TOML（这是个 bug，请上报）：{e}"))?;
    Ok(format!("{文件头}{body}"))
}

/* ── 落盘那一半 ────────────────────────────────────────────────────────── */

/// 从一份**具体的**路径读出会话。文件不在 / 读不出来 / 坏 TOML → **空的那一份**。
fn 读存档(文件: &Path) -> 会话 {
    let Ok(text) = std::fs::read_to_string(文件) else {
        return 会话::default(); // 文件不在 = 还没有会话
    };
    match toml::from_str::<存档>(&text) {
        Ok(档) => 从存档(档),
        Err(e) => {
            crate::日志!("[nota] 会话读不了（本次当「没有会话」用）：{}：{e}", 文件.display());
            会话::default()
        }
    }
}

/// 把会话写到一份具体的路径。**整体写**：不是局部改写。
fn 写存档(文件: &Path, 会话: &会话) -> Result<(), NotaError> {
    let text = 到文本(会话).map_err(NotaError::other)?;
    if let Some(父) = 文件.parent() {
        paths::ensure_dir(父)?;
    }
    // ⚠️ 裸 `std::fs::write`，与 `table_width::写存档` 同一套。**刻意不按 0600 建**：
    // 这一份里没有秘密（只有路径）。
    std::fs::write(文件, text).map_err(|source| NotaError::Write {
        path: 文件.to_path_buf(),
        source,
    })
}

/// 内部错误 → 给前端的那一句话（前面加一句"是哪件事失败了"）。
fn 人话(e: NotaError) -> String {
    format!("会话没记上：{e}")
}

/* ── 对外 ──────────────────────────────────────────────────────────────── */

/// 读整份会话。**文件不在 / 读不出来 / 坏文件一律当"空的"**，不报错。
pub fn 读() -> 会话 {
    match paths::session_file() {
        Ok(文件) => 读文件(&文件),
        Err(e) => {
            crate::日志!("[nota] 找不到会话的落点（本次当「没有会话」用）：{e}");
            会话::default()
        }
    }
}

/// 从一个具体路径读。用例走这个，[`读`] 只是把路径算出来的那一层。
pub fn 读文件(文件: &Path) -> 会话 {
    读存档(文件)
}

/// 把会话**整体**写到默认落点。
pub fn 写(会话: &会话) -> Result<(), String> {
    写文件(&paths::session_file().map_err(|e| 人话(e))?, 会话).map_err(人话)
}

/// 把会话**整体**写到一份具体的路径（覆盖那份文件）。
///
/// ⚠️ 这一条是"整份替换"的口径：谁调它，谁就得把**完整**的会话递进来。
pub fn 写文件(文件: &Path, 会话: &会话) -> Result<(), NotaError> {
    写存档(文件, 会话)
}

/// 记一条「最近」：读一份、改内存、再整体写回。
pub fn 记最近(路径: &str) -> Result<(), String> {
    let mut 会话 = 读();
    推入最近(&mut 会话.recent, 路径);
    写(&会话)
}

/// 忘掉一条「最近」（路径不存在时前端会调它）。
pub fn 忘最近(路径: &str) -> Result<(), String> {
    let mut 会话 = 读();
    会话.recent.retain(|p| p != 路径);
    会话.scroll.remove(路径);
    写(&会话)
}

/// **一份文件改了名 / 挪了地方**：把「最近」与「滚动位置」两笔账一起搬到新路径上。
///
/// ⚠️ **两条账一起搬、一次落盘**：它们都按路径存（`recent` 是一串路径、
/// `scroll` 是"路径 → 比例"），分两次读改写就会在两次之间留下一个"账在两边"
/// 的窗口（进程正好在这儿退出的话，最近列表里就多一条点不开的、而新名字
/// 反而进不去）。`推入最近` 那一段的口径也一样，见上面 `修剪`。
///
/// ⚠️ **老路径不在账里也照办**（新路径照样进「最近」）：一份从命令行直接开的
/// 文件本来就可能不在列表里，而"用户刚给它改过名"正该让它出现在那儿。
///
/// ⚠️ 老路径的滚动比例**要接过去**（先取、再删、再挂到新名字上）：改名与
/// "这本书看到第几页"是两回事，丢掉的代价是用户下次打开这份文件回到开头，
/// 而他会以为滚动位置那个功能坏了。
pub fn 改最近(老: &str, 新: &str) -> Result<(), String> {
    let mut 会话 = 读();
    搬路径(&mut 会话, 老, 新);
    写(&会话)
}

/// [`改最近`] 那个"改内存"的一半。**纯函数、不碰盘**——用例走它。
///
/// ⚠️ 拆出来不只是为了好测（`读` / `写` 落在**用户真实的** `session.toml` 上，
/// 用例直接调 `改最近` 会去动它）。同 `table_width.rs` 的 `记` / `记文件`。
pub fn 搬路径(会话: &mut 会话, 老: &str, 新: &str) {
    // ⚠️ 顺序：**先取比例，再删老路径**——反了就取不到了。
    let 比例 = 会话.scroll.remove(老);
    if let Some(比例) = 比例 {
        会话.scroll.insert(新.to_string(), 比例);
    }
    会话.recent.retain(|p| p != 老);
    推入最近(&mut 会话.recent, 新);
}

/// 记一份文档的滚动位置（比例）。
pub fn 记滚动(路径: &str, 比例: f64) -> Result<(), String> {
    let mut 会话 = 读();
    会话.scroll.insert(路径.to_string(), 夹比例(比例));
    写(&会话)
}

/// 记会话（开着哪几份、前台是哪一份）。
///
/// ⚠️ **不碰 `recent`**：会话是"现在开着什么"，最近是"曾经开过什么"，
/// 两者由不同的时刻驱动（切标签／关文档 vs 打开）。合并的话，把标签全关掉
/// 会顺手把最近列表也清空——那是两个功能互相拆台。
pub fn 记会话(open: Vec<String>, active: Option<String>) -> Result<(), String> {
    let mut 会话 = 读();
    会话.open = open;
    会话.active = active;
    写(&会话)
}

/// 会话落点，给前端显示用（"这些记忆存在哪"）。
pub fn 落点() -> Option<PathBuf> {
    paths::session_file().ok()
}

#[cfg(test)]
mod tests {
    use super::*;

    fn 造(open: &[&str], recent: &[&str]) -> 会话 {
        会话 {
            open: open.iter().map(|s| s.to_string()).collect(),
            active: open.first().map(|s| s.to_string()),
            recent: recent.iter().map(|s| s.to_string()).collect(),
            scroll: BTreeMap::new(),
        }
    }

    /// 推入最近：去重、插到最前、砍尾巴。
    #[test]
    fn 最近是去重且新的在前() {
        let mut 列表 = vec!["b.md".to_string(), "a.md".to_string()];
        推入最近(&mut 列表, "a.md");
        assert_eq!(列表, vec!["a.md", "b.md"], "老的那条要被提到最前，不是留两条");
        推入最近(&mut 列表, "c.md");
        assert_eq!(列表, vec!["c.md", "a.md", "b.md"]);
    }

    /// ⚠️ 已经在最前面时**一个字节都不该动**：不然每存一次盘都要重写文件。
    #[test]
    fn 重复推同一条不产生变化() {
        let mut 列表 = vec!["a.md".to_string(), "b.md".to_string()];
        let 原样 = 列表.clone();
        推入最近(&mut 列表, "a.md");
        assert_eq!(列表, 原样);
    }

    /// 超过上限砍尾巴，砍掉的是**最老的**那些。
    #[test]
    fn 最近有上限且砍的是尾巴() {
        let mut 列表: Vec<String> = Vec::new();
        for i in 0..(最近最多 + 5) {
            推入最近(&mut 列表, &format!("f{i}.md"));
        }
        assert_eq!(列表.len(), 最近最多);
        assert_eq!(列表[0], format!("f{}.md", 最近最多 + 4), "最新的要在最前");
        assert!(!列表.contains(&"f0.md".to_string()), "最老的要被砍掉");
    }

    /// **改名之后那两笔账要跟着走**（2026-09-27，`docs/10` §2 那一格）。
    ///
    /// ⚠️ 不只是"最近列表里换个名字"：**滚动位置也要接过去**，否则用户打开
    /// 那份文件会回到开头，而他会以为滚动记忆坏了。这一条钉的就是那个比例。
    #[test]
    fn 改名之后最近与滚动位置一起搬过去() {
        let mut 会话 = 造(&[], &["/老.md", "/别的.md"]);
        会话.scroll.insert("/老.md".to_string(), 0.75);
        会话.scroll.insert("/别的.md".to_string(), 0.1);

        搬路径(&mut 会话, "/老.md", "/新.md");

        assert_eq!(会话.recent, vec!["/新.md", "/别的.md"], "新名字进列表、老名字出去");
        assert_eq!(会话.scroll.get("/新.md"), Some(&0.75), "看到第几页要跟着走");
        assert_eq!(会话.scroll.get("/老.md"), None, "老路径的账要清掉，别留个幽灵");
        assert_eq!(会话.scroll.get("/别的.md"), Some(&0.1), "别的文档一个字节都不许动");
    }

    /// ⚠️ 老路径**不在账里**时也要把新名字记进「最近」：一份从命令行直接打开的
    /// 文件本来就可能不在列表里，而"用户刚给它改过名"正该让它出现在那儿。
    #[test]
    fn 不在账里的文件改了名也进最近() {
        let mut 会话 = 造(&[], &["/别的.md"]);
        搬路径(&mut 会话, "/从来没记过的.md", "/新的.md");
        assert_eq!(会话.recent, vec!["/新的.md", "/别的.md"]);
        assert_eq!(会话.scroll.get("/新的.md"), None, "本来就没比例，别凭空造一个");
    }

    /// 比例夹紧。⚠️ **`NaN` 这条是重点**：`f64::clamp` 对 `NaN` 是原样返回，
    /// 而 `nan` 是合法 TOML——不挡的话它会一路活到前端的 `scrollTo`。
    #[test]
    fn 比例夹进零到一且挡住非数() {
        assert_eq!(夹比例(0.42), 0.42);
        assert_eq!(夹比例(-3.0), 0.0);
        assert_eq!(夹比例(7.5), 1.0);
        assert_eq!(夹比例(f64::NAN), 0.0, "NaN 必须变成 0——clamp 挡不住它");
        assert_eq!(夹比例(f64::INFINITY), 0.0);
        assert_eq!(夹比例(f64::NEG_INFINITY), 0.0);
    }

    /// 写出去再读回来，四样东西原样。
    #[test]
    fn 存读一圈不丢东西() {
        let mut 会话 = 造(&["/a.md", "/b.md"], &["/b.md", "/a.md"]);
        会话.active = Some("/b.md".to_string());
        会话.scroll.insert("/a.md".to_string(), 0.25);
        let text = 到文本(&会话).expect("写得出来");
        assert_eq!(从文本(&text), 会话);
    }

    /// 空会话写得出来、读得回来（首次启动那条路）。
    #[test]
    fn 空会话也能存能读() {
        let text = 到文本(&会话::default()).expect("写得出来");
        assert!(text.contains("删掉它"), "文件头要在：{text}");
        assert_eq!(从文本(&text), 会话::default());
    }

    /// ⚠️ 坏 TOML 当"空的"用，**不报错**——一份被手改坏的侧车不该让启动失败。
    #[test]
    fn 坏文件当空的用不报错() {
        assert_eq!(从文本("这不是 toml {{{"), 会话::default());
        assert_eq!(从文本(""), 会话::default());
    }

    /// 用户手改出来的越界比例，读进来也要被夹住（不能只在写的那一头夹）。
    #[test]
    fn 读进来的比例也夹() {
        let 会 = 从文本("[scroll]\n\"/a.md\" = 3.5\n\"/b.md\" = -1.0\n");
        assert_eq!(会.scroll["/a.md"], 1.0);
        assert_eq!(会.scroll["/b.md"], 0.0);
    }

    /// `active` 是空串时当没有（手改文件、或某次写到一半留下的形状）。
    #[test]
    fn 空的_active_当没有() {
        assert_eq!(从文本("active = \"\"\n").active, None);
    }

    /// 清死链：不在的三处**都要**清掉——只清 `recent` 是最容易犯的那个漏。
    #[test]
    fn 清死链把三处都清掉() {
        let mut 会话 = 造(&["/a.md", "/没了.md"], &["/a.md", "/没了.md"]);
        会话.scroll.insert("/没了.md".to_string(), 0.5);
        会话.scroll.insert("/a.md".to_string(), 0.5);
        清掉不存在的(&mut 会话, |p| p == "/a.md");
        assert_eq!(会话.open, vec!["/a.md"]);
        assert_eq!(会话.recent, vec!["/a.md"]);
        assert_eq!(会话.scroll.len(), 1, "死链的滚动位置也要清：{:?}", 会话.scroll);
    }

    /// 修剪：`scroll` 只留还在清单里的，`open` 砍到 [`会话最多`]。
    #[test]
    fn 修剪把滚动的范围压回清单里() {
        let mut 会话 = 造(&["/a.md"], &["/a.md", "/b.md"]);
        会话.scroll.insert("/a.md".to_string(), 0.1);
        会话.scroll.insert("/b.md".to_string(), 0.2);
        会话.scroll.insert("/早就不开了.md".to_string(), 0.3);
        修剪(&mut 会话);
        assert_eq!(会话.scroll.len(), 2);
        assert!(!会话.scroll.contains_key("/早就不开了.md"));
    }

    /// ⚠️ 这条钉的是"`scroll` 不会只增不减"：把清单撑满之后，
    /// 存一轮下来它最多就是 `最近最多 + 会话最多` 条。
    #[test]
    fn 滚动表不会越存越大() {
        let mut 会话 = 会话::default();
        for i in 0..200 {
            let p = format!("/f{i}.md");
            推入最近(&mut 会话.recent, &p);
            会话.scroll.insert(p, 0.5);
        }
        let text = 到文本(&会话).expect("写得出来");
        let 回来 = 从文本(&text);
        assert!(
            回来.scroll.len() <= 最近最多,
            "滚动表没有被压回来：{} 条",
            回来.scroll.len()
        );
    }

    /// `open` 太长时砍掉多余的——一次开三十个标签是事故，不是会话。
    #[test]
    fn 会话条数有上限() {
        let 多: Vec<String> = (0..(会话最多 + 6)).map(|i| format!("/f{i}.md")).collect();
        let mut 会话 = 造(&[], &[]);
        会话.open = 多;
        修剪(&mut 会话);
        assert_eq!(会话.open.len(), 会话最多);
        assert_eq!(会话.open[0], "/f0.md", "砍的是后面的，顺序不许动");
    }

    /// 落盘那一圈：写到一个临时文件、再读回来。**用真文件**，
    /// 因为"整体覆盖"这个口径只有走一遍 `fs::write` 才算验过。
    #[test]
    fn 写文件再读回来() {
        let 目录 = std::env::temp_dir().join(format!(
            "nota-session-test-{}-{:?}",
            std::process::id(),
             std::thread::current().id()
        ));
        std::fs::create_dir_all(&目录).expect("建临时目录");
        let 文件 = 目录.join("session.toml");

        let 会话 = 造(&["/a.md"], &["/a.md", "/b.md"]);
        写文件(&文件, &会话).expect("写得出去");
        assert_eq!(读文件(&文件), 会话);

        // 覆盖：第二次写更少的东西，旧内容不许残留。
        写文件(&文件, &造(&[], &[])).expect("写得出去");
        assert_eq!(读文件(&文件), 会话::default());

        // 文件根本不在 = 没有会话，不是错误。
        std::fs::remove_file(&文件).expect("删得掉");
        assert_eq!(读文件(&文件), 会话::default());

        let _ = std::fs::remove_dir_all(&目录);
    }
}
