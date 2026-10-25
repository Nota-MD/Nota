//! 诊断信息命令（「关于 → 故障排除」那一页要的那一组）。

use crate::diagnostics::{self, 诊断};
use crate::error::{NotaError, Result};

#[derive(serde::Serialize)]
pub struct DebugLogChunk {
    text: String,
    offset: u64,
    reset: bool,
}

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

/// 读取调试日志增量。前端约 400ms 拉一次，实现实时跟随。
#[tauri::command]
pub fn nota_debug_log_read(offset: u64) -> Result<DebugLogChunk> {
    let chunk = crate::log::读取增量(offset)
        .map_err(|e| NotaError::other(format!("读取调试日志失败：{e}")))?;
    Ok(DebugLogChunk {
        text: chunk.text,
        offset: chunk.offset,
        reset: chunk.reset,
    })
}

/// 从前端追加一条结构化事件。只在调试闸门开启时真正落盘。
///
/// 禁止换行、限制长度与 scope 字符集，避免一次异常对象把日志写成不可读的一整段。
/// 不接收正文、选区文本或凭据；调用方只传生命周期节点和标量上下文。
#[tauri::command]
pub fn nota_debug_log_write(scope: String, message: String) -> Result<()> {
    let scope: String = scope
        .chars()
        .filter(|c| c.is_ascii_alphanumeric() || matches!(c, '-' | '_' | '.'))
        .take(32)
        .collect();
    let message: String = message
        .chars()
        .map(|c| if c.is_control() { ' ' } else { c })
        .take(16_384)
        .collect();
    crate::日志!("[{}] {}", if scope.is_empty() { "frontend" } else { &scope }, message);
    Ok(())
}
