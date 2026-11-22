use crate::diagnostics::{self, Diagnostics};
use crate::error::{NotaError, Result};

#[derive(serde::Serialize)]
pub struct DebugLogChunk {
    text: String,
    offset: u64,
    reset: bool,
}

#[tauri::command]
pub async fn nota_diagnostics() -> Result<Diagnostics> {
    tauri::async_runtime::spawn_blocking(diagnostics::collect)
        .await
        .map_err(|e| NotaError::other(format!("Could not collect diagnostics: {e}")))
}

#[tauri::command]
pub fn nota_debug_log_read(offset: u64) -> Result<DebugLogChunk> {
    let chunk = crate::log::read_increment(offset)
        .map_err(|e| NotaError::other(format!("Could not read the debug log: {e}")))?;
    Ok(DebugLogChunk {
        text: chunk.text,
        offset: chunk.offset,
        reset: chunk.reset,
    })
}

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
    crate::debug_log!(
        "[{}] {}",
        if scope.is_empty() { "frontend" } else { &scope },
        message
    );
    Ok(())
}
