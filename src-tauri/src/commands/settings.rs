//! 设置相关命令。

use tauri::State;

use crate::error::Result;
use crate::settings::Settings;
use crate::state::AppState;

#[tauri::command]
pub fn nota_settings_get(state: State<'_, AppState>) -> Result<Settings> {
    let s = state.settings.lock().unwrap();
    Ok(s.clone())
}

/// 整份替换并落盘。
///
/// 走**整份替换**而不是逐项 patch：设置项还少，patch 语义（"没给的字段不动"
/// 还是"没给的字段恢复默认"）会变成一个新的、没人想要的理解负担。
/// 等设置项多到前端改一项要传一大坨时再改成分项，那时也有真实的理由了。
#[tauri::command]
pub fn nota_settings_set(state: State<'_, AppState>, settings: Settings) -> Result<()> {
    let mut current = state.settings.lock().unwrap();
    let previous = current.clone();
    *current = settings;

    // 先落盘，落盘失败就把内存里的改回去——否则会出现"界面上是新的、
    // 重开又变回去"这种最难解释的状态。
    if let Err(e) = current.save() {
        *current = previous;
        return Err(e);
    }
    Ok(())
}
