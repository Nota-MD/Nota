//! 诊断信息命令（「关于 → 故障排除」那一页要的那一组）。

use crate::diagnostics::{self, 诊断};
use crate::error::{NotaError, Result};

/// 采一份编译信息 ＋ 本机信息。
///
/// ⚠️ **异步 + `spawn_blocking`**：采本机信息要起 `uname` 子进程（2 秒超时，见
/// `diagnostics::问一行`），而 Tauri 的同步命令跑在**主线程**上——在那儿等就是
/// 把界面冻住。理由与 `nota_pandoc_probe` 一模一样。
///
/// ⚠️ 每条信息**取不到就是空串**，不报错（见 `diagnostics` 文件头那条口径）；
/// 这里可能返回 `Err` 只有一种情形：那个阻塞任务自己 panic 了。前端仍然要处理它。
#[tauri::command]
pub async fn nota_diagnostics() -> Result<诊断> {
    tauri::async_runtime::spawn_blocking(diagnostics::收集)
        .await
        .map_err(|e| NotaError::other(format!("采集诊断信息失败：{e}")))
}
