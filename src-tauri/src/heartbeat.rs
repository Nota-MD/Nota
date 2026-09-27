//! 面板心跳：让声明了 `live` 的面板**跟着时间自己动**（2026-09-26）。
//!
//! 用户 2026-09-26 要的「写作统计」是一件**实时**的东西（字/分钟 ＋ s-t 图），
//! 而插件面板在这之前只有三个刷新时机：切过去、插件喊 `nota.ui.refresh`、
//! 点了面板上的按钮。三条都是"**发生了什么事**"，没有一条是"**时间过去了**"。
//!
//! # 为什么心跳在宿主，不在插件
//!
//! ⚠️ **不给 Lua 加 timer** 这件事是刻意的，不是少写一行：加了它不是"多一个
//! 函数"，是**换一种插件模型**。今天所有插件代码都是"被叫一次、跑一遍、返回"
//! （`docs/12` §4.7），每一次执行都发生在**宿主的某次调用里**——于是锁归谁、
//! 线程归谁、抛错往哪儿报、插件被停用时那段代码还在不在，四条全都有明确的主人。
//! 让插件自己醒来，这四条要一条一条重新回答，而这个仓里没有任何一条现成的答案
//! （顺带一提：`docs/12` §6 那张"没实现"的表上，"没有 CPU 上限 / 没有超时看门狗"
//! 还挂着——一个能自己醒来的死循环比一个被叫起来的死循环难收得多）。
//!
//! 所以走**另一条**路：插件仍然是被动的，只是在注册面板时告诉宿主
//! "我这一页要跟着动"（`register_panel{ live = true }`，见 `api/ui.rs`），
//! 拍子由宿主来打。插件那边**没有 timer、也收不到宿主事件**这条事实一个字没改。
//!
//! # 一秒一次，且只叫该叫的
//!
//! ⚠️ 拍完只发"**该重拉了**"（同 `nota.ui.refresh`，`docs/12` §4.6）——
//! 内容仍旧由前端去拉、插件的 `render` 现跑。心跳**不是内容通道**：
//! 把这条事件整个丢掉，面板打开时显示的东西照样是对的。
//!
//! ⚠️ 只叫**声明了 `live` 的面板**。全叫的话，git 那种 `render` 里跑
//! `git status` 的面板会每秒起一个子进程，而它一点都不需要实时。
//!
//! ⚠️ 面板**没显示**时也照发（宿主不知道用户正开在哪一页上，那是前端的账）：
//! 多发的部分前端自己会丢掉（`PluginDock.tsx` 只重拉活动页），代价是一条空转的
//! 事件。要省掉它就得让宿主知道"现在哪一页开着"——那是把前端的界面状态在宿主
//! 这边抄一份，正是 `docs/12` 反复说的"两个真相源"。
//!
//! ⚠️ 线程是**裸的 `std::thread`**，不是 tokio 定时器：同 `watch.rs` / `devserver.rs`
//! 那几个循环（这个仓里没有一处 `tokio::time`）。退出靠 `Heartbeat::stop()`——
//! `lib.rs` 的 `RunEvent::Exit` 里调，最多晚一拍（1 秒）退出。

use std::sync::atomic::{AtomicBool, Ordering};
use std::time::Duration;

use tauri::{Emitter, Manager};

use crate::state::AppState;

/// 心跳的拍子。
///
/// ⚠️ 1 秒是**给眼睛定的**：一秒一跳看着才像"实时"，再快人眼也读不出差别。
/// 它同时是插件 `render` 的重跑频率上界，所以这个数还兼着"插件每秒最多
/// 被跑几遍"的预算——调小它之前先想清楚那几个 `live` 面板里在干什么。
const 拍子: Duration = Duration::from_millis(1000);

/// 心跳的开关。
///
/// ⚠️ 与 `DevServerState` / `ReviewState` / `ProbeCache` 一样**不进 `AppState`**
/// （`lib.rs` 里那条注释列了它们）：它不在那条锁序上，塞进去只会让人以为它在。
#[derive(Default)]
pub struct Heartbeat {
    停: AtomicBool,
}

impl Heartbeat {
    /// 叫停。⚠️ 只是**置一个位**，当前那一拍睡完才真的退出（最多 1 秒）。
    /// 这里**不 join**：`RunEvent::Exit` 是退出路径，在那儿等一秒是白等——
    /// 线程本身是分离的，进程一没它跟着没。
    pub fn stop(&self) {
        self.停.store(true, Ordering::Relaxed);
    }
}

/// 起心跳线程。⚠️ 只在 `setup` 里调一次。
pub fn 起(app: tauri::AppHandle) {
    std::thread::spawn(move || loop {
        std::thread::sleep(拍子);

        // 拿不到托管状态 ＝ 应用已经在收摊了，别恋战。
        let Some(hb) = app.try_state::<Heartbeat>() else {
            return;
        };
        if hb.停.load(Ordering::Relaxed) {
            return;
        }

        // 取"哪些面板要跟着动"。⚠️ `plugins` 锁**只在这一刻握一下**：
        // 下面那个块一结束锁就放了，绝不带进 `sleep`（它一秒才回来）。
        // ⚠️ 这一句读的是 registry（`plugin/mod.rs::读面板`），**不跑插件代码**，
        // 所以不存在"心跳把某个慢插件的 render 拖进来"这回事。
        let 名单: Vec<(String, String)> = {
            let Some(state) = app.try_state::<AppState>() else {
                return;
            };
            let Ok(host) = state.plugins.lock() else {
                return;
            };
            host.跟着动的面板()
        };

        for (plugin, id) in 名单 {
            let _ = app.emit(
                crate::plugin::EVENT_PANEL_DIRTY,
                serde_json::json!({ "plugin": plugin, "id": id }),
            );
        }
    });
}
