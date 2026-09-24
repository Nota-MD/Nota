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
    let strict = settings.strict_markdown;

    // ⚠️ 这一对花括号不是装饰：`documents` 在锁序里**排在 `settings` 前面**
    // （`plugins → documents → settings`，见 `state.rs` 顶上），所以下面那段
    // 必须**等 `settings` 的锁放掉之后**再跑。握着 `settings` 去拿 `documents`
    // 是反方向，两边同时来一次就是死锁。
    {
        let mut current = state.settings.lock().unwrap();
        let previous = current.clone();
        *current = settings;

        // 先落盘，落盘失败就把内存里的改回去——否则会出现"界面上是新的、
        // 重开又变回去"这种最难解释的状态。
        if let Err(e) = current.save() {
            *current = previous;
            return Err(e);
        }
    }

    // 「严格模式」改了要**立刻重算已打开文档的标题**：标题是从正文猜的，
    // 而两种模式对"这一行算不算标题"看法不同（`#标签`）。不重算的话，
    // 用户改完设置盯着标签页看，会以为设置没生效。
    state.documents.lock().unwrap().set_strict_markdown(strict);
    Ok(())
}
