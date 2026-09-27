//! **窗口自身的控制**（2026-09-27）：开发者工具。
//!
//! # 为什么这里只有一条命令
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
