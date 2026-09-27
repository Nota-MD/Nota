//! 表格列宽相关命令。
//!
//! 用户 2026-09-26 点的：「**还有就是表格，允许拖动改变大小（咋存你来定）**」。
//! "咋存"定成了**进程外的一份侧车文件**（`~/.local/share/nota/table-widths.toml`，
//! 形状与理由见 `table_width.rs` 模块头）——不写进 Markdown 正文，因为
//! 列宽是**给人看的排版偏好**，不是文档内容：写进正文会污染原文、也会在
//! 别的 Markdown 工具里露出来。
//!
//! 这一层只做两件事：把路径换成 `PathBuf`、把 `记录` 摊成前端好用的 map。
//!
//! # 为什么返回 map 而不是 `Vec<记录>`
//!
//! 前端拿到列宽之后要回答的唯一问题是"**这个表格**该画多宽"——它手上已经有
//! 指纹了，直接查表最省事。而 `记录` 里那个 `文档` 字段对前端是纯冗余
//!（它自己刚把这个路径传上来），序列化过去还要多一个 `PathBuf → String` 的
//! lossy 转换，那个转换在非 UTF-8 路径上会**悄悄换掉**路径的字节
//!（`table_width.rs` 里对上这条有专门的说明）。
//!
//! ⚠️ 指纹的算法（表头文字＋列数那个）**在前端**（`editor/table-width.ts`）：
//! 宿主只当它是个字符串，不解释格式。理由与 `记录::指纹` 那段一致——
//! 改指纹算法不该动 Rust。

use std::collections::HashMap;
use std::path::PathBuf;

use crate::error::Result;

/// 取一份文档里所有表格的列宽。**返回空 map 是正常的**（没拖过 / 文件不在）。
///
/// ⚠️ 读不出来时给空的，不报错：侧车文件坏掉、路径算不出来，都不该让编辑器
/// 卡在"装不进去"上——拿不到列宽就按自动列宽画，这正是我们要的降级。
#[tauri::command]
pub fn nota_table_widths_get(path: String) -> Result<HashMap<String, Vec<u32>>> {
    Ok(crate::table_width::取(&PathBuf::from(path))
        .into_iter()
        .map(|一| (一.指纹, 一.宽度))
        .collect())
}

/// 记一个表格的列宽。`widths` 给**空数组**＝删掉这条记录（用户拖回自动那档）。
///
/// ⚠️ 前端**一次拖动会调很多次**（每次 pointermove 都要跟手）。落盘那一步
/// 有"值没变就不写"的判据（`table_width.rs::记文件`），所以这里不必再去重。
#[tauri::command]
pub fn nota_table_widths_set(
    path: String,
    fingerprint: String,
    widths: Vec<u32>,
) -> Result<()> {
    crate::table_width::记(&PathBuf::from(path), &fingerprint, &widths)
        .map_err(crate::error::NotaError::other)
}

/// 忘掉一份文档的全部列宽记录。
///
/// 今天没有调用点（「另存为」之后旧路径那份残留、文档改名都还没接）。
/// **留着**是因为它已经在 `table_width.rs` 里写好并测过了，而少这一条命令
/// 的话，将来要清残留就得往 Rust 里再加一次接线——那时更容易忘的是
/// "忘了它会凭空造出一个文件来"这条判据。
#[tauri::command]
pub fn nota_table_widths_forget(path: String) -> Result<()> {
    crate::table_width::忘(&PathBuf::from(path)).map_err(crate::error::NotaError::other)
}
