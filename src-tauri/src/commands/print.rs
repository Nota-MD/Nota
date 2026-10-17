//! **应用内打印**的三条命令（2026-10-17）：
//!
//! | 命令 | 干什么 |
//! |---|---|
//! | `nota_print_printers` | 这台机器上有哪些打印机（`lpstat`） |
//! | `nota_print_prepare` | 把 HTML 印成 PDF，再把每页出成缩略图 |
//! | `nota_print_send` | 把那份 PDF 投给选中的打印机（`lp`） |
//!
//! ⚠️ 三条都**只做接线**（本目录的规矩）：真正的活在 `print_job.rs`，
//! 而"HTML 怎么变 PDF"在 `pdf_print.rs`。
//!
//! ⚠️ `prepare` **必须是 `async`**：它里面会 `run_on_main_thread` 去起一个
//! 没显示过的 GTK 窗口印 PDF，然后在这边**等**结果。同步命令跑在主线程上，
//! 那就成了"主线程等主线程"，当场死锁。

use std::path::PathBuf;

use tauri::AppHandle;

use crate::error::Result;
use crate::print_job::{self, 打印预览, 打印机信息, 版面请求};

/// 列出打印机。⚠️ 没有 `lpstat` 时给空表**不算错**：界面要画成
/// "这台机器上还没有打印机"，而不是一条红色报错。
#[tauri::command]
pub fn nota_print_printers() -> Vec<打印机信息> {
    print_job::列打印机()
}

/// 出 PDF ＋ 出预览图。参数是**扁平的**（不是一个嵌套对象）：Tauri 的
/// 命令参数走 JSON，扁平的那几个字段在前端调用点上更好读。
#[tauri::command]
pub async fn nota_print_prepare(
    app: AppHandle,
    html: String,
    base_dir: Option<String>,
    paper: String,
    landscape: bool,
    margin_mm: f64,
) -> Result<打印预览> {
    let 目录: Option<PathBuf> = base_dir.map(PathBuf::from);
    print_job::准备(
        &app,
        &html,
        目录.as_deref(),
        版面请求 {
            paper,
            landscape,
            margin_mm,
        },
    )
}

/// 投给打印机，返回 CUPS 的任务号（`request id`）。
#[tauri::command]
pub async fn nota_print_send(
    pdf: String,
    printer: String,
    copies: u32,
    ranges: Option<String>,
) -> Result<String> {
    print_job::投递(
        std::path::Path::new(&pdf),
        &printer,
        copies.max(1),
        ranges.as_deref(),
    )
}

/// 这台系统上有没有**应用内打印**（2026-10-17）。
///
/// ⚠️ 判据就是"PDF 那一段有没有"——它靠 WebKitGTK 的打印后端，只有 Linux 有。
/// 前端拿它决定走哪条路：**有**就开打印框，**没有**就退回老那条
/// "写成 HTML 交给系统默认程序"（Windows / macOS 上那条一直是能用的）。
#[tauri::command]
pub fn nota_print_supported() -> bool {
    cfg!(target_os = "linux")
}
