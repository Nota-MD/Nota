//! 会话与最近文件相关命令。
//!
//! 存储、形状与三条账全在 `src-tauri/src/session.rs`，这一层只做三件事：
//! 把路径摊成前端好用的形状、**读的时候把死链滤掉**、把比例夹一遍。
//!
//! # ⚠️ 为什么在这里滤死链，而不是在存储那一层滤
//!
//! 「这条路径现在还存不存在」要碰一次文件系统。存储那一层（`session.rs`）是
//! **纯读文本**的，用例全靠"给一段文本、看读出来什么"来钉；往里塞 `fs` 调用会让
//! 那些用例全都得先造真文件。而命令层本来就在碰盘（另外几条命令都在写文件），
//! 多一次 `is_file()` 不改变它的性质。
//!
//! ⚠️ **过滤不等于清理**：文件删了之后，那条路径只是**不再显示**，侧车里的字节
//! 要等下一次真的写盘才变。这是刻意的——"用户打开一下应用、磁盘上某份文件就
//! 被改了"是看不见的写。真要它立刻消失，前端调 `nota_session_forget_recent`。
//!
//! # ⚠️ 「最近文件」里的死链没有对话框可弹
//!
//! 用户点一条已经没有的文件，前端会拿到"路径不存在"这条错——那正是我们要的
//! （如实说，不装作没发生）。前端同时该调 [`nota_session_forget_recent`] 把它忘掉，
//! 不然那条永远点不动、也永远赖在列表里。

use std::path::PathBuf;

use serde::Serialize;

use crate::error::Result;
use crate::session;

/// 读给前端的那一份。字段名与侧车一致（`open` / `active` / `recent` / `scroll`）。
#[derive(Debug, Clone, Serialize)]
pub struct 会话视图 {
    /// 上次开着的那几份，**只留现在还存在的**。
    pub open: Vec<String>,
    /// 上次前台是哪一份。⚠️ 它**可能已经被滤掉了**（文件没了），
    /// 这时仍然是原值——"上次是哪份"是个事实，兜底由前端做
    /// （它本来就有一套"当前文档不存在时换哪一份"的规则，见 `ui/useDocuments.ts`）。
    pub active: Option<String>,
    /// 最近打开过的，只留现在还存在的，最新在前。
    pub recent: Vec<String>,
    /// 每份滚到哪儿（比例），只留现在还存在的。
    pub scroll: std::collections::BTreeMap<String, f64>,
    /// 侧车在哪。界面上那句"这些记忆存在哪"用它，**不暴露就算了**——
    /// 与「打开设置目录」那颗按钮同一条口径。
    pub file: Option<String>,
}

/// 路径现在是不是一份**文件**（不是目录、不是坏链接）。
fn 是文件(p: &str) -> bool {
    std::fs::metadata(p).map(|m| m.is_file()).unwrap_or(false)
}

/// 取整份会话（死链已滤掉）。
#[tauri::command]
pub fn nota_session_get() -> Result<会话视图> {
    let mut 会话 = session::读();
    session::清掉不存在的(&mut 会话, 是文件);
    Ok(会话视图 {
        open: 会话.open,
        active: 会话.active,
        recent: 会话.recent,
        scroll: 会话.scroll,
        file: session::落点().map(|p| p.to_string_lossy().into_owned()),
    })
}

/// 记下"现在开着哪几份、前台是哪一份"。
///
/// 前端**去抖**调它（切标签、关标签、开文件之后各一次），与 `nota_doc_sync`
/// 那条 300ms 去抖同理：落盘是整体重写，逐次跟手写不值得。
#[tauri::command]
pub fn nota_session_set_open(open: Vec<String>, active: Option<String>) -> Result<()> {
    session::记会话(open, active).map_err(crate::error::NotaError::other)
}

/// 记一份文档的滚动位置（比例 `0.0`~`1.0`，越界的会被夹住）。
#[tauri::command]
pub fn nota_session_set_scroll(path: String, ratio: f64) -> Result<()> {
    session::记滚动(&path, ratio).map_err(crate::error::NotaError::other)
}

/// 把一条「最近」忘掉（点了一条已经不存在的文件之后调它）。
#[tauri::command]
pub fn nota_session_forget_recent(path: String) -> Result<()> {
    session::忘最近(&path).map_err(crate::error::NotaError::other)
}

/// 清掉整份会话（设置页那颗"忘掉最近打开的文件"）。
///
/// ⚠️ **这是唯一一条会"删记忆"的命令**，所以文案上要如实说清它删的是什么：
/// 不是删文件，只是把清单清空。
#[tauri::command]
pub fn nota_session_clear() -> Result<()> {
    session::写(&session::会话::default()).map_err(crate::error::NotaError::other)
}

/// 会话侧车的路径，给"打开所在目录"用（今天没有调用点，留着与另外三份一致）。
#[tauri::command]
pub fn nota_session_file() -> Result<Option<String>> {
    Ok(session::落点().map(|p: PathBuf| p.to_string_lossy().into_owned()))
}
