//! 警报：一个置顶的红窗，和一声尖锐的响。
//!
//! # 为什么是**另一个窗口**，不是一层盖在主窗上的红布
//!
//! ⚠️ 这是这个功能能不能成立的关键。用户要的是「红色大型弹窗**顶置**」，
//! 而触发警报的时候，用户**已经切到别的应用去了**——主窗在那些窗口**后面**。
//! 盖在主窗里的红布再大再红，用户在别的应用上什么都看不见，
//! 只会听见声音却找不到是谁在叫。
//!
//! 所以必须是一个真的系统级窗口：`always_on_top` + 全屏 + 抢焦点。
//! 它压在用户此刻正在用的**任何**程序上面——这正是用户要的效果，
//! 也是**首次说明弹窗里必须讲清楚**的代价（见 `ui/useForceFocus.ts` 那段说明）。
//!
//! # 开与关都认 [`阶段`](super::阶段) 一个真相源
//!
//! 计时线程每一拍对一次账：`phase == "alarm"` 而窗没开就开，
//! 不是 `"alarm"` 而窗开着就关。所以**没有第二条"什么时候关窗"的逻辑**——
//! [`super::确认`] 只管改阶段，窗自然在下一拍消失。
//!
//! ⚠️ 代价是关窗最多慢一拍（1 秒）。用 `确认` 里直接关窗能快一点，
//! 但那样"谁负责关窗"就有了两处，漏一处就是"点了按钮窗还在"。
//!
//! # 两种关法都要算数
//!
//! 1. 窗里那颗「我回来了」→ 前端调 `nota_focus_ack`；
//! 2. ⚠️ **Alt+F4 / 窗口管理器直接关掉** → `lib.rs` 的 `Destroyed` 分派里
//!    也调一次 `确认`。少了第 2 条会出现最难受的一种故障：窗被关掉了，
//!    阶段还停在 `alarm`，下一拍**又开一个**——用户按几次 Alt+F4 就冒出几个窗，
//!    而且他会以为这软件坏掉了（他猜得没错）。

use tauri::{Emitter, Manager};

use crate::settings::Focus;

/// 警报窗的 label。
///
/// ⚠️ `lib.rs` 里有两处分派靠这个串（`Focused` 与 `Destroyed`），
/// 写错字的症状分别是"失焦从不计费"和"Alt+F4 之后警报反复重开"。
pub const 窗_LABEL: &str = "focus-alarm";

/// 前端收到它就出声。载荷是空的——怎么响由前端决定（音色归它）。
pub const EVENT_BEEP: &str = "nota:focus-beep";

/// 响警报：出声 + 把窗顶出来。
///
/// ⚠️ 这个函数**在计时线程里跑**，所以里面不能做任何会阻塞的事。
/// 开窗是异步的（Tauri 自己安排），出声是 emit，两条都不会卡住那一拍。
pub fn 响(app: &tauri::AppHandle, 设置: &Focus) {
    if 设置.sound {
        // 主路径：前端合成。音色、节奏、渐强全在那边，好调也好听。
        let _ = app.emit(EVENT_BEEP, ());
    }
    开窗(app);
}

/// 警报窗的**系统窗口标题**。
///
/// ⚠️ 用户**看不见它**：这个窗 `.decorations(false)` 又全屏，没有标题栏可读。
/// 但任务栏、窗口切换器（`Alt+Tab`）、`xprop` 读的都是它——一个中文界面的
/// 用户在那个列表里认出一个整屏英文的条目，是没必要的别扭。
///
/// ⚠️ 跟的是 `lang::主语言`（`zh-CN` / `zh-TW` 都算 `zh`），**不是**硬比
/// `"zh-CN"`：哪天加了繁体文案表，硬比的那种写法会一声不吭地把它漏掉。
pub fn 标题(语言: &str) -> &'static str {
    if crate::lang::主语言(语言) == "zh" {
        "立刻回来写作"
    } else {
        "Back to writing"
    }
}

/// 把警报窗顶出来。已经开着就**只把它再顶一次**（不重建）。
///
/// ⚠️ 重复 `set_focus` 不是多余：用户可能又切走了（他就是在切来切去），
/// 而"窗在但被压在下面"和"窗不在"对他是一样的。
pub fn 开窗(app: &tauri::AppHandle) {
    if let Some(w) = app.get_webview_window(窗_LABEL) {
        let _ = w.set_focus();
        return;
    }

    // 独立 HTML 入口。Windows/WebView2 对自定义协议下初始 URL 的 fragment
    // 保留行为与 WebKit 不一致，依赖 hash 会让入口落回主应用并显示白屏。
    let 结果 = tauri::WebviewWindowBuilder::new(
        app,
        // ⚠️ **必须全屏 + 无边框**：有标题栏就带一个叉，用户会去点那个叉
        //（点了也算数，见文件头第 2 条），但那是"关掉一个窗"，
        // 而这里要传达的是"回去写字"。一整块红屏没有别的出口。
        // ⚠️ 也**不给关闭按钮、不给最小化**：留一个"稍后再说"就等于留一个后门。
        窗_LABEL,
        tauri::WebviewUrl::App("focus-alarm.html".into()),
    )
    // ⚠️ 标题跟着**界面语言**走（`AppState::app_lang`，启动时算好的那一个）。
    // 原来这里写死 `"Back to writing"`：中文界面的用户拿到的是一屏中文正文配
    // 一个英文标题（2026-09-27 开窗实测，见 `docs/06` §5.28）。
    // ⚠️ 取的是 `app_lang` 而不是"现读设置重算"——理由是 `state.rs` 那一格
    // 自己的文档：插件拿的是同一个值，现算会算出"下次启动才生效的语言"。
    .title(标题(&app.state::<crate::state::AppState>().app_lang))
    .decorations(false)
    .always_on_top(true)
    .fullscreen(true)
    .resizable(false)
    .focused(true)
    .build();

    match 结果 {
        Ok(w) => {
            // 双保险：builder 的 `focused(true)` 在某些窗口管理器下会被忽略
            // （新窗默认"请求焦点"和"真的拿到焦点"是两件事）。
            let _ = w.set_focus();
        }
        Err(e) => {
            // ⚠️ 开不出来的后果**不是"少了一个提示"**，而是"整个强制专注没有出口":
            // 账户照扣、但用户看不见任何东西。
            //
            // ⚠️ 这里**只记日志 + 退回一声响**，不弹 toast：能弹 toast 的地方是主窗，
            // 而主窗此刻正在用户背后——一个他看不见的提示等于没提示。
            // 声音是这种情况下**唯一**还能到达他的频道，所以兜底音量走它。
            crate::日志!("[nota] focus alarm window failed ({e}); using system beep");
            系统提示音();
        }
    }
}

/// 关掉警报窗（没有就什么都不做）。
///
/// ⚠️ 平时**由 [`对账`] 调**，别在 `确认` 里也调一次（理由见文件头）。
/// 直接调它的地方只剩"退出应用"那条路和调试用的命令。
pub fn 关窗(app: &tauri::AppHandle) {
    if let Some(w) = app.get_webview_window(窗_LABEL) {
        let _ = w.close();
    }
}

/// 按阶段对账：阶段说开着就把窗顶出来，说没开就把窗收掉。
/// **计时线程每一拍调一次**（`super::起`）。
///
/// ⚠️⚠️ 它就是文件头那句"开与关都认阶段一个真相源"的落点。
/// **少了它，"点了「我回来了」红屏赖着不走"**：`确认` 只改阶段，而窗
/// 没有第二个地方会去收——前端明说了不自己 `close()`
///（`ui/FocusAlarmWindow.tsx` 文件头），命令层那条
/// [`nota_focus_close_alarm`](crate::commands::focus::nota_focus_close_alarm)
/// 是给调试和退出用的、前端一个调用点都没有。
///
/// ⚠️ **2026-09-26 实测才发现的**：这一段设计写在文件头里、但计时线程里
/// 从来没实现过，症状是"按钮变成『这就回去…』之后就永远停在那儿"。
/// 当时写这段注释的人（我）把"打算这么做"当成"已经这么做"记下来了——
/// 所以往后改这里，先去 `super::起` 里数一眼调用点，别只读注释。
///
/// ⚠️ 参数收的是 [`阶段`](super::阶段) 而不是 `&str`：这里再拿 `"alarm"`
/// 比一次就是**第二个真相源**（同 `装快照` 里那段"阶段名走 `名字()`"的理由）。
/// ⚠️ 可见性是 **`pub(super)`**，不是 `pub`：参数那个 [`阶段`](super::阶段)
/// 是 `focus` 模块**私有**的枚举，写成 `pub` 就会得到
/// `type 阶段 is more private than the item 对账`（2026-09-26 用户把编译
/// 输出贴过来才发现的）。它唯一的调用点是 `super::起` 那一拍，
/// **没有一处需要它出 `focus` 这个模块**——按调用面收窄，别顺手写 `pub`。
pub(super) fn 对账(app: &tauri::AppHandle, 阶段: super::阶段) {
    let 开着 = app.get_webview_window(窗_LABEL).is_some();
    if matches!(阶段, super::阶段::警报) {
        if !开着 {
            开窗(app);
        }
    } else if 开着 {
        关窗(app);
    }
}

/// 宿主兜底音。
///
/// ⚠️ **这条是备用路径，不是主路径**。正常走前端合成（[`响`] 里那一枪），
/// 它只在两种情况下被调到：
///
/// 1. 警报窗根本没建起来（上面那个 `Err` 分支）；
/// 2. 前端自己报告"我这边播不出"（`nota_focus_beep` 命令，WebKit 的
///    autoplay 策略在某些环境下会把没有用户手势的 `AudioContext` 摁住）。
///
/// ⚠️ **它不自己合成音**，而是叫系统音效。自己合成要先写一个 WAV 到磁盘
/// 再找个播放器，那是"为了可控音色"付的代价；而这本来就是个兜底，
/// 音色好不好听不是它该操心的事。系统音效主题各机器不同，这一点如实写在这里。
///
/// ⚠️ **本机（无声卡的 Xvfb）验不了这个函数有没有声音**。验过的是
/// "这些程序在不在、调不调得起来"——`canberra-gtk-play` 与 `aplay` 都在宿主上。
pub fn 系统提示音() {
    use std::process::Command;

    // ⚠️ `alarm-clock-elapsed` 是 freedesktop 音效规范里最像"警报"的一个。
    // 依次往下试，第一个成功就收工。
    const 候选: &[&[&str]] = &[
        &["canberra-gtk-play", "-i", "alarm-clock-elapsed"],
        &["canberra-gtk-play", "-i", "dialog-warning"],
        // ALSA 自带的一个例子音。前两条都没有（没装 libcanberra）时用它，
        // 它不像警报，但比**没有声音**强——而这个功能的全部意义就在于
        // 让一个正盯着别的屏幕的人抬起头来。
        &["aplay", "-q", "/usr/share/sounds/alsa/Front_Center.wav"],
    ];

    for 命令 in 候选 {
        let Some((程序, 参数)) = 命令.split_first() else {
            continue;
        };
        let 起 = Command::new(程序)
            .args(参数)
            .stdin(std::process::Stdio::null())
            .stdout(std::process::Stdio::null())
            .stderr(std::process::Stdio::null())
            .spawn();
        if 起.is_ok() {
            return;
        }
    }
    // ⚠️ 三个都起不来就**到这里为止**，不再往下找。用户机器上没有这些程序
    // 是完全可能的（比如 Windows），而那不是错误——前端那条路才是主路径。
    // 记一条日志，不弹任何东西：警报没响这个事实，用户自己会注意到。
    crate::日志!("[nota] focus alarm: all system beep candidates failed");
}

#[cfg(test)]
mod tests {
    use super::*;

    /// 标题跟着语言走。
    ///
    /// ⚠️ 这两条**只钉住"选哪句"**，钉不住"那扇窗真拿到了它"——那要开窗才知道
    /// （跑法在 `docs/06` §5.28）。
    #[test]
    fn 标题_中文与英文各一句() {
        assert_eq!(标题("zh-CN"), "立刻回来写作");
        assert_eq!(标题("en"), "Back to writing");
    }

    /// ⚠️ 判据是**主语言**，不是字面量 `"zh-CN"`：加了繁体文案表之后
    /// `zh-TW` 也不该掉进英文那一句。
    #[test]
    fn 标题_认的是主语言不是那一个字面量() {
        assert_eq!(标题("zh-TW"), 标题("zh-CN"));
        // 认不出来的语言落到英文那一句（与 `i18n` 的兜底同一个方向）。
        assert_eq!(标题("fr"), "Back to writing");
        assert_eq!(标题(""), "Back to writing");
    }
}
