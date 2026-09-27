//! 强制专注的命令层。
//!
//! ⚠️ 这一层**不做任何判断**，只是把 `crate::focus` 那几件事转出去、并把新状态
//! 广播给所有窗口。判断（什么时候扣、什么时候响）全在 `focus/mod.rs` 的
//! 计时线程里——那是唯一的真相源。在这里再判一次就会出现"按钮说的和账本做的
//! 不一样"，而那种故障用户完全没法排查（余额在他眼皮底下自己动）。
//!
//! ⚠️ **每一条都会 emit**（见 [`广播`]）：余额是每秒都在变的东西，
//! 命令返回的那一份到前端时可能已经过时了。让所有窗口以**事件**为准，
//! 命令的返回值只当"这一枪的即时回执"。
//!
//! ⚠️ 这几条要在 `FocusState` 与 `AppState` **两份**托管状态上操作：
//! 账本在前者，设置（开局给多少余额）在后者。取用顺序**必须先设置、后账本**
//!（`state.rs` 头部那条锁序的延伸，见 `focus/mod.rs` 顶上"锁序"那段）。

use tauri::{Emitter, State};

use crate::error::Result;
use crate::focus::{self, FocusState, 快照};
use crate::state::AppState;

/// 广播一份新状态给所有窗口。
///
/// ⚠️ 广播给**所有**窗口而不是只给主窗：警报窗也要看余额（它上面要显示
/// "你欠了多少"），而且将来要是有第三个窗，它也不该自己去轮询。
fn 广播(app: &tauri::AppHandle, 状态: &快照) {
    let _ = app.emit(focus::EVENT_FOCUS, 状态);
}

/// 此刻的余额与阶段。没在跑时 `running = false`。
///
/// ⚠️ 前端启动时拉一次（窗口可能是在会话开始之后才建的）。
#[tauri::command]
pub fn nota_focus_get(聚焦: State<'_, FocusState>) -> 快照 {
    focus::现在(&聚焦)
}

/// 开始一轮。
#[tauri::command]
pub fn nota_focus_start(
    app: tauri::AppHandle,
    聚焦: State<'_, FocusState>,
    应用: State<'_, AppState>,
) -> Result<快照> {
    // ⚠️ 先把设置读出来、放开，再去动账本（锁序）。
    let 设置 = {
        let g = 应用
            .settings
            .lock()
            .map_err(|_| crate::error::NotaError::Config("设置锁坏了".into()))?;
        g.focus.clone()
    };
    let 快照 = focus::开始(&聚焦, &设置);
    广播(&app, &快照);
    Ok(快照)
}

/// 停掉这一轮。**不问确认**：这一层没有任何不可逆的事，
/// 而这是一个"我想停下来"的按钮——停下来还要挨一句问，是最烦人的那种设计。
#[tauri::command]
pub fn nota_focus_stop(app: tauri::AppHandle, 聚焦: State<'_, FocusState>) -> Result<快照> {
    let 快照 = focus::停下(&聚焦);
    广播(&app, &快照);
    Ok(快照)
}

/// 用户在警报上点了「我回来了」。
///
/// 关掉警报、回到专注、余额留在 0、带冷却。为什么不留"启动资金"见
/// [`focus::确认`] 的文档。
#[tauri::command]
pub fn nota_focus_ack(app: tauri::AppHandle, 聚焦: State<'_, FocusState>) -> Result<快照> {
    let 快照 = focus::确认(&聚焦);
    广播(&app, &快照);
    Ok(快照)
}

/// 宿主兜底音。**前端在合成不出声音时**调这一条。
///
/// ⚠️ 它**不是**"再响一次"的按钮。前端才是警报声的主路径
/// （Web Audio 合成的音色可控），这一条只在 WebKit 的 autoplay 策略把
/// `AudioContext` 摁住时兜底。理由与代价写在 `focus/alarm.rs::系统提示音`。
#[tauri::command]
pub fn nota_focus_beep() {
    focus::alarm::系统提示音();
}

/// 把警报窗关掉（如果有）。
///
/// ⚠️ 供**警报窗自己**在退出前调一次，也供调试用。**不要拿它当"停止专注"**——
/// 那件事是 [`nota_focus_stop`]，它同时会把账本清掉。
#[tauri::command]
pub fn nota_focus_close_alarm(app: tauri::AppHandle) {
    focus::alarm::关窗(&app);
}
