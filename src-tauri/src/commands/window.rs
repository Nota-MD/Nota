//! **窗口自身的控制**（2026-09-27）：开发者工具、开一个新窗口。
//!
//! # 为什么这里只有两条命令
//!
//! 「窗口置顶」**不在这里**——它前端直接用 JS API 就够了
//! （`getCurrentWindow().setAlwaysOnTop()`，读回来是 `isAlwaysOnTop()`），
//! 而菜单上那个勾的判据**必须是"从窗口读回来的"**（与全屏同一条口径，
//! 见 `ui/useImmersive.ts`）。走 IPC 的话要多一条"读回来"的命令，
//! 而那条命令除了转发没有任何判断，纯属多一层。
//!
//! 「开发者工具」不一样：**它没有 JS API**。Tauri 的 `devtools` feature 只给了
//! Rust 侧一个 `WebviewWindow::open_devtools()`，前端够不着，所以必须在这儿开一条。
//!
//! ⚠️ **`devtools` 是在 `Cargo.toml` 里显式打开的**（`tauri = { features =
//! ["protocol-asset", "devtools"] }`）。去掉那个 feature，这个文件**编译不过**
//! ——不是"静默失效"，这正是要的：菜单里那一条要么真的能开，要么整仓编译失败。
//!
//! # 「在新窗口中打开」为什么是**再起一份进程**，不是 `WebviewWindowBuilder`
//!
//! 同一个进程里再建一个 webview 是能做到的（Tauri 就那一个 API），但那样两个
//! 窗口共用同一份 `AppState`：**文档表是同一张**，于是"新窗口"里看到的还是原来
//! 那一堆标签，关一个两边一起变。那不是用户要的"新窗口"。
//!
//! 再起一份进程天然就是独立的（文档、工作区、插件各一份），代价只有一处：
//! **跳过单实例那一关**（`cli.rs` 的 `--new-window`，判据与代价写在 `lib.rs` ⓿'）。

use tauri::Manager;

use crate::error::{NotaError, Result};

/// 主窗口的 label。⚠️ 与 `tauri.conf.json` 里那个窗口的 `label` **必须一致**；
/// 写错了的症状是"点了没反应"（命令报"找不到窗口"，而按钮看着是亮的）。
const 主窗口: &str = "main";

/// 打开主窗口的开发者工具（菜单「视图 → 开发者工具」/ `Shift+F12`）。
///
/// ⚠️ **再点一次是"聚焦"而不是"关掉"**：`open_devtools()` 在已经开着的时候
/// 只把它调到前面。前端菜单**不留勾**（它是动作不是状态）——「开发者工具开着没有」
/// 这件事 WebKitGTK 没有可读的接口，硬记一个内存状态就会和实际分叉。
#[tauri::command]
pub fn nota_window_open_devtools(app: tauri::AppHandle) -> Result<()> {
    let 窗 = app
        .get_webview_window(主窗口)
        .ok_or_else(|| NotaError::other(format!("找不到窗口 `{主窗口}`")))?;
    窗.open_devtools();
    Ok(())
}

/// 把一份文档**在新窗口里打开**（标签页右键那一条，2026-09-27）。
///
/// ⚠️ **`path` 是必需参数，没有"新开一个空白窗口"这一档**：这条命令的入口是
/// 一个**已经存在的标签页**，而一个没有路径的标签页（新建的、从没存过盘的）
/// 在那份菜单里是**灰的**——"在新窗口里打开一份不存在于磁盘上的东西"没有意义
/// （新进程只能按路径去读，它拿不到这一份内存里的正文）。⚠️ 界面上判一次、
/// 这里也判一次，不是重复：命令是对外开着的一条路，前端哪天多一个调用点
/// 就会漏。
///
/// ⚠️ **不 `wait()`**：等它退出等于把主窗口一起卡住，而新窗口活多久与这里无关。
/// 但 `spawn` 的失败**如实报错**（可执行文件没了、权限不对），别静默——
/// "点了菜单什么都没发生"是最难查的一种症状。
#[tauri::command]
pub fn nota_window_open_new(path: String) -> Result<()> {
    if path.trim().is_empty() {
        return Err(NotaError::other("这份文档还没有路径，先保存它再开新窗口"));
    }
    let 程序 = std::env::current_exe()
        .map_err(|e| NotaError::other(format!("找不到 Nota 自己的可执行文件：{e}")))?;
    std::process::Command::new(&程序)
        .arg(crate::cli::新窗口选项)
        .arg(&path)
        .spawn()
        .map_err(|e| {
            NotaError::other(format!("起不了新窗口（{}）：{e}", 程序.display()))
        })?;
    crate::日志!("[nota] 新窗口：{} {path}", 程序.display());
    Ok(())
}
