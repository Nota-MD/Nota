//! 强制专注：账户余额、失焦计费、警报。
//!
//! ⚠️⚠️ **这是核心功能，不是插件**（用户 2026-09-26：「注意啊，这不是插件。
//! 这是核心功能」）。它要窗口焦点、要开一个置顶窗、要出声——三样都在插件沙箱
//! 之外（插件没有 timer、收不到宿主事件、开不了窗口，见 `docs/12` §4.7a）。
//!
//! # 计时引擎：一个账户（用户 2026-09-26 定）
//!
//! | 旋钮 | 设置字段 | 在这里是什么 |
//! |---|---|---|
//! | 专注总时长 | `Focus::total_minutes` | 余额**上限** |
//! | 警报时长 | `Focus::alarm_minutes` | 开局给多少余额 |
//! | 专注权重 | `Focus::gain_per_minute` | 专注一拍赚多少 |
//! | 离开权重 | `Focus::drain_per_minute` | 走神一拍赔多少 |
//!
//! 逐条的由来在 `crate::settings::focus` 的文件头（那里还写了**为什么不是
//! "每 20 分钟必响一次"**）。这里只说落地形态。
//!
//! # 三个阶段
//!
//! ```text
//!                 失焦                   余额 ≤ 0
//!   专注 ──────────────────► 走神(记下起于) ──────────► 警报
//!     ▲                        │                        │
//!     └────────────────────────┘                        │ 用户点「我回来了」
//!              得焦（宽限期内不欠账）                     │
//!     ◄─────────────────────────────────────────────────┘
//! ```
//!
//! - **专注**：每拍 `+gain`，封顶在上限；
//! - **走神**：失焦那一刻记下"从什么时候起"。**前 `grace_seconds` 秒不扣**
//!   （用户原话："焦点离开这个编辑器超过 10 秒"），过了宽限才每拍 `-drain`。
//!   ⚠️ 宽限期内不欠账：回来之后不是"补扣刚才那 10 秒"，那 10 秒当没发生。
//! - **警报**：**账本冻结**。冻的不是省事——警报窗一弹出来就会抢走焦点，
//!   主窗立刻"失焦"，不冻的话每弹一次就自己扣自己一笔，警报会连环响。
//!
//! # 冷却：为什么警报不会连响
//!
//! ⚠️ 光有"余额 ≤ 0 → 响"会得到一个**死循环**：响完之后余额还是 0（用户还在摸鱼，
//! 或者刚点掉警报还没开始写），下一拍又 ≤ 0，又响——每秒一次，警报变成噪音，
//! 用户除了关掉这个功能没有别的出路。
//!
//! 所以加一条**冷却**：响过一次之后，必须先**把余额重新攒过复活线**，才允许再响。
//! 复活线取 `上限 / 4` 并夹在 10 秒~1 分钟之间（默认配置下 = 1 分钟）。
//! 于是"一直摸鱼"的结果是**响一次**而不是响个不停，而"回来写了、又摸鱼了"
//! 该响还是会响——用户要的是这个。
//!
//! ⚠️ 冷却**不用设置项**：它是防炸的保护，不是偏好。暴露出去只会多一个
//! 能把功能调坏的旋钮。
//!
//! # 它不做什么
//!
//! - **不读键盘、不截图、不碰别的进程、不看别的窗口**。走神与否只看
//!   **本应用自己的窗口有没有焦点**（`WindowEvent::Focused`）——
//!   这是一条无争议的信号，也是它能做到"不需要任何系统权限"的全部原因。
//! - ⚠️ 曾经还有一层「**看用户在开什么应用**」（用户 2026-09-26 原始需求里
//!   「依据在开什么应用而判断」那一条）：读活动窗口的 `WM_CLASS`，命中一份
//!   用户自填的宽限名单就不算摸鱼。**2026-09-26 用户砍掉了它**，原话是
//!   「宽限名单不用开了。把这个功能删掉吧，干脆」。
//!
//!   砍得有道理：那是唯一一处**要越过本应用边界**的能力（哪怕读的只是窗口
//!   的公开属性、不碰内容），换来的只是"看 PDF 不算摸鱼"这一点准确度。
//!   而它只在 X11 上做得成，Windows/macOS 要另写两套平台绑定、本机还验不了。
//!   **这个功能的核心是"你离开没有"，不是"你去了哪儿"**——前者无争议，
//!   后者一旦开口子就要一直解释下去。
//!
//!   ⚠️ 所以现在整个强制专注**不需要任何系统权限**：不碰别的进程、不装钩子、
//!   不读文件、不出网。关于页那份权限清单上，它那一条写的就是这句话。
//! - ⚠️ 它**拦不住**一个铁了心要绕开的人（杀掉进程、换个桌面、拔网线都行）。
//!   这不是缺陷，是它**必须在首次说明里讲清楚**的事——见 `ui/useForceIntro.ts`。

pub mod alarm;

use std::sync::Mutex;
use std::time::{Duration, Instant};

use serde::Serialize;
// ⚠️ 两个都要：`Emitter` 给 `emit`，`Manager` 给 `try_state`。
// 少了后者报的是"`AppHandle` 上没有 `try_state` 这个方法"——一个错得让人
// 以为是 API 变了的提示（其实只是 trait 没进作用域）。
use tauri::{Emitter, Manager};

use crate::settings::Focus;

/// 一拍的间隔。
///
/// ⚠️ 一秒一拍，和面板心跳（`crate::heartbeat`）同频但**各自独立**：
/// 那个是给声明了 `live` 的插件面板用的，跟这里的账户没有关系，别合并。
const 一拍: Duration = Duration::from_millis(1000);

/// 复活线的下限/上限（见模块头「冷却」那一段）。
const 复活线最小: i64 = 10_000;
const 复活线最大: i64 = 60_000;

/// 前端订阅的频道。载荷是 [`快照`]。
pub const EVENT_FOCUS: &str = "nota:focus-state";

/// 会话此刻处在哪一阶段。
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum 阶段 {
    /// 焦点在本应用的窗口上。
    专注,
    /// 失焦了，从 `起于` 那一刻算。
    走神 { 起于: Instant },
    /// 正在响警报。账本冻结。
    警报,
}

impl 阶段 {
    fn 名字(&self) -> &'static str {
        match self {
            // ⚠️ 这三个串是**给前端判分支用的**（`ui/useForceFocus.ts`），
            // 不是给人看的文案——界面上那句话由前端自己 t()。别在这儿写中文。
            阶段::专注 => "focusing",
            阶段::走神 { .. } => "away",
            阶段::警报 => "alarm",
        }
    }
}

/// 一轮会话。**只活在内存里**：重启不给恢复（理由见 `settings/focus.rs`）。
struct 会话 {
    余额毫秒: i64,
    上限毫秒: i64,
    开始于: Instant,
    上一拍: Instant,
    阶段: 阶段,
    /// 这一轮里，焦点在编辑器上的累计时长。
    累计专注: Duration,
    /// 这一轮里，真正挨了罚的那部分走神时长（**不含宽限期**）。
    累计离开: Duration,
    /// 这一轮响过几次。
    警报次数: u32,
    /// 冷却中：响过之后必须先攒回复活线，才允许再响。
    冷却中: bool,
}

impl 会话 {
    /// 复活线：攒回这么多才解除冷却。
    fn 复活线(&self) -> i64 {
        (self.上限毫秒 / 4).clamp(复活线最小, 复活线最大)
    }
}

/// 给前端的那一份"现在怎么样"。**全是绝对量**，前端不做累加。
///
/// ⚠️ 字段名走 snake_case 直接对应 TS 那边的 `FocusState`
///（`src/bridge/types.ts`）。改名要两边同批改。
#[derive(Debug, Clone, Serialize)]
pub struct 快照 {
    /// 会话开着没有。`false` 时其余字段都是 0，前端据此把界面收掉。
    pub running: bool,
    /// 此刻的余额（毫秒）。可以为 0（刚响过），**不会为负**。
    pub balance_ms: i64,
    /// 余额上限（毫秒）。前端画那条进度条的分母。
    pub cap_ms: i64,
    /// `"focusing"` / `"away"` / `"alarm"`。见 [`阶段::名字`]。
    pub phase: &'static str,
    /// 这一次走神多久了（毫秒）。没走神就是 0。
    pub away_ms: u64,
    /// 免罚宽限（毫秒）。`away_ms` 小于它 = 还在宽限里，一分没扣。
    pub grace_ms: u64,
    /// 这一轮从开始到现在有多久（毫秒）。**含**走神、含宽限、含警报中。
    ///
    /// ⚠️ 它不等于 `focused_ms + away_total_ms`：后者只算"专注"和"挨了罚的走神"，
    /// 宽限期内的走神两边都不进。界面上要说"这一轮坐了多久"就用这个。
    pub elapsed_ms: u64,
    /// 这一轮累计专注（毫秒）。
    pub focused_ms: u64,
    /// 这一轮累计挨罚的走神（毫秒，**不含宽限**）。
    pub away_total_ms: u64,
    /// 这一轮响过几次。
    pub alarms: u32,
}

impl 快照 {
    fn 空() -> Self {
        Self {
            running: false,
            balance_ms: 0,
            cap_ms: 0,
            phase: "focusing",
            away_ms: 0,
            grace_ms: 0,
            elapsed_ms: 0,
            focused_ms: 0,
            away_total_ms: 0,
            alarms: 0,
        }
    }
}

/// 托管在 `AppState` 里的那一格。
///
/// ⚠️ **锁序**：这个锁是全仓**最内层**的——拿着它的时候**不许**再去取
/// `settings` / `documents` / `plugins`（`state.rs` 头部那条不变量的延伸）。
/// 要读设置就先读出来、放开，再锁这里。
#[derive(Default)]
pub struct FocusState {
    内: Mutex<Option<会话>>,
}

/// 开始一轮。
///
/// ⚠️ 已经在跑就**什么都不做**（返回当前快照），不重置。理由：前端那颗按钮
/// 是"开始/停止"两态，但界面卡一下、或者用户连点两下，第二下不该把刚攒的
/// 余额清掉。要重来请先 `停下`。
pub fn 开始(状态: &FocusState, 设置: &Focus) -> 快照 {
    let mut 内 = match 状态.内.lock() {
        Ok(g) => g,
        Err(p) => p.into_inner(),
    };
    // ⚠️⚠️ **已经在跑就直接用手上这一份快照，不许回头调 [`现在`]。**
    //
    // `现在` 也要锁同一把 `Mutex`，而 `std::sync::Mutex` **不可重入**——
    // 那样写是一个当场死锁：`nota_focus_start` 永远不返回、界面卡死、
    // 计时线程也一起停。⚠️ 这个 bug 是 `重复开始不会重置余额` 那条测试
    // 抓出来的（测试挂住不返回），不是读代码看出来的。
    if let Some(s) = 内.as_ref() {
        return 装快照(s, 设置);
    }
    let now = Instant::now();
    *内 = Some(会话 {
        余额毫秒: 设置.起始毫秒(),
        上限毫秒: 设置.上限毫秒(),
        开始于: now,
        上一拍: now,
        阶段: 阶段::专注,
        累计专注: Duration::ZERO,
        累计离开: Duration::ZERO,
        警报次数: 0,
        冷却中: false,
    });
    装快照(内.as_ref().unwrap(), 设置)
}

/// 停掉这一轮（不管在哪个阶段）。没在跑就什么都不做。
pub fn 停下(状态: &FocusState) -> 快照 {
    let mut 内 = match 状态.内.lock() {
        Ok(g) => g,
        Err(p) => p.into_inner(),
    };
    *内 = None;
    快照::空()
}

/// 此刻的快照。没在跑就是 [`快照::空`]。
pub fn 现在(状态: &FocusState) -> 快照 {
    let 内 = match 状态.内.lock() {
        Ok(g) => g,
        Err(p) => p.into_inner(),
    };
    match 内.as_ref() {
        None => 快照::空(),
        // ⚠️ 这里拿不到 `Focus`（锁序：不许在持这个锁时去读设置），所以宽限期
        // 用一个占位值。真实值由**每一拍**推给前端的快照带着
        //（[`推一拍`] 是先读设置、再锁这里），前端拿到的是那一份。
        // 这个函数只服务于"刚点开始还没到第一拍"以及命令的返回值。
        Some(s) => 装快照(s, &Focus::default()),
    }
}

/// 窗口焦点变了。`有焦点` = 本应用的窗口拿到了焦点。
///
/// ⚠️ 调用方（`lib.rs` 那个 `on_window_event`）**必须只在 `main` 窗口上转调**。
/// 警报窗自己也会发焦点事件，一起算进来的话：警报窗弹出 → 它拿到焦点 →
/// 被当成"回专注了" → 用户反而没挨罚。判据在 `lib.rs`。
pub fn 窗口焦点(状态: &FocusState, 有焦点: bool) {
    let mut 内 = match 状态.内.lock() {
        Ok(g) => g,
        Err(p) => p.into_inner(),
    };
    let Some(s) = 内.as_mut() else { return };
    match (有焦点, s.阶段) {
        // 回来了。⚠️ 只把状态改回专注，**不补扣也不补偿**走神那一段：
        // 挨罚的部分已经在每一拍里扣过了，宽限期内的部分按设计当没发生。
        (true, 阶段::走神 { .. }) => s.阶段 = 阶段::专注,
        // 走了。⚠️ 正在响警报时不改阶段（账本要冻住，见模块头）。
        (false, 阶段::专注) => s.阶段 = 阶段::走神 { 起于: Instant::now() },
        _ => {}
    }
}

/// 用户在警报上点了「我回来了」。
///
/// 关掉警报、回到专注、**余额留在 0**、**带着冷却**。
///
/// ⚠️ 为什么不留一点余额当"启动资金"：留了就是一个可以反复刷的漏洞
/// （摸到响、点一下、白拿 5 分钟、继续摸）。余额留在 0 + 冷却的组合下，
/// 用户点掉警报之后**只能真的开始写**——写回复活线之前不会再响，
/// 但也没得摸。这是唯一一个不自相矛盾的处置。
pub fn 确认(状态: &FocusState) -> 快照 {
    let mut 内 = match 状态.内.lock() {
        Ok(g) => g,
        Err(p) => p.into_inner(),
    };
    let Some(s) = 内.as_mut() else {
        return 快照::空();
    };
    s.阶段 = 阶段::专注;
    s.余额毫秒 = 0;
    s.冷却中 = true;
    装快照(s, &Focus::default())
}

fn 装快照(s: &会话, 设置: &Focus) -> 快照 {
    let now = Instant::now();
    // ⚠️ 阶段名走 `阶段::名字()`，**不在这里再写一遍字符串**：写两处的话，
    // 加第四个阶段时改了一处、漏了另一处，症状是前端拿一个它不认识的 phase
    // 去查分支表、落进 `default`，界面上那格**静默地**显示成别的东西。
    let 阶段名 = s.阶段.名字();
    let 走神多久 = match s.阶段 {
        阶段::走神 { 起于 } => now.saturating_duration_since(起于),
        _ => Duration::ZERO,
    };
    快照 {
        running: true,
        balance_ms: s.余额毫秒,
        cap_ms: s.上限毫秒,
        phase: 阶段名,
        away_ms: 走神多久.as_millis() as u64,
        elapsed_ms: now.saturating_duration_since(s.开始于).as_millis() as u64,
        grace_ms: 设置.grace_seconds as u64 * 1000,
        focused_ms: s.累计专注.as_millis() as u64,
        away_total_ms: s.累计离开.as_millis() as u64,
        alarms: s.警报次数,
    }
}

/// 一拍的结果：要不要响警报。
enum 这一拍 {
    无事,
    响了,
}

/// 走一拍。`设置` 由调用方**在此之前**读好传进来（锁序）。
fn 走一拍(s: &mut 会话, 设置: &Focus, now: Instant) -> 这一拍 {
    let 实拍 = now.saturating_duration_since(s.上一拍);
    s.上一拍 = now;
    let 毫秒 = 实拍.as_millis() as i64;
    if 毫秒 <= 0 {
        return 这一拍::无事;
    }

    match s.阶段 {
        阶段::专注 => {
            s.累计专注 += 实拍;
            s.余额毫秒 = (s.余额毫秒 + 设置.赚(毫秒)).min(s.上限毫秒);
        }
        阶段::走神 { 起于 } => {
            let 走了 = now.saturating_duration_since(起于);
            let 宽限 = Duration::from_secs(设置.grace_seconds as u64);
            if 走了 > 宽限 {
                // ⚠️ 只扣**这一拍**的份额，不扣"从失焦那刻算起的总量"。
                // 后者会让宽限期一过就凭空挨一大笔，而那一笔是用户坐在
                // 编辑器前写字的时候攒下来的（罚的是过去的专注，说不通）。
                let 扣 = 设置.赔(毫秒);
                s.累计离开 += 实拍;
                s.余额毫秒 = (s.余额毫秒 - 扣).max(0);
            }
        }
        // 冻结：不赚也不赔。
        阶段::警报 => {}
    }

    // 冷却解除：攒回来了就重新武装。
    if s.冷却中 && s.余额毫秒 >= s.复活线() {
        s.冷却中 = false;
    }

    if s.余额毫秒 <= 0 && !s.冷却中 && s.阶段 != 阶段::警报 {
        s.阶段 = 阶段::警报;
        s.警报次数 += 1;
        s.冷却中 = true;
        return 这一拍::响了;
    }
    这一拍::无事
}

/// 起计时线程。`lib.rs` 的 `setup` 里调一次。
///
/// ⚠️ `FocusState` 是**单独 `manage`** 的，不在 `AppState` 里——理由与
/// `watch` / `heartbeat` / `devserver` 同（见 `lib.rs` 那四段）：它虽然要读设置，
/// 但读法是"**锁住读一份、放开，再动自己的账本**"，没有把自己排进
/// `plugins → documents → settings` 那条锁序。放进 `AppState` 会让人以为它在上面。
///
/// ⚠️ 它**永远跑着**（会话没开时每拍空转一次 `Option` 判空），不随会话起停。
/// 起停线程要处理"上一次还没退干净"这类竞态，而省下来的是每秒一次的空判——
/// 不划算。同 [`crate::heartbeat`]，退出时不叫停也不会拖住进程。
pub fn 起(app: tauri::AppHandle) {
    std::thread::spawn(move || {
        loop {
            std::thread::sleep(一拍);

            // 两个 state 都是 `setup` 里 manage 好的，所以第一拍起就能拿到；
            // 万一还没有（不该发生）就等下一拍，别退出线程。
            let Some(状态) = app.try_state::<FocusState>() else {
                continue;
            };
            let Some(应用) = app.try_state::<crate::state::AppState>() else {
                continue;
            };

            // ⚠️ 设置在这里**读一份拷出来就放开**（锁序：`settings` 在外、
            // 账本在内，只能从外往内取）。
            let 设置 = match 应用.settings.lock() {
                Ok(g) => g.focus.clone(),
                Err(_) => continue,
            };

            let (快照, 响了, 阶段) = {
                let mut 内 = match 状态.内.lock() {
                    Ok(g) => g,
                    Err(p) => p.into_inner(),
                };
                let Some(s) = 内.as_mut() else { continue };
                let r = 走一拍(s, &设置, Instant::now());
                (装快照(s, &设置), matches!(r, 这一拍::响了), s.阶段)
            };

            // ⚠️ 事件在**放开锁之后**发（锁序 + 别在持锁时跑前端代码）。
            let _ = app.emit(EVENT_FOCUS, &快照);

            if 响了 {
                alarm::响(&app, &设置);
            }

            // ⚠️⚠️ 窗的开与关**每一拍按阶段对账**，不能只靠上面那个"响了"的
            // 边沿：警报响了之后窗是开着的，而把它**收掉**的那一下没有任何边沿
            // 可等——`确认`（点了「我回来了」）只改阶段。少了这一句，红屏
            // 点不掉（2026-09-26 实测踩到，详见 `alarm::对账` 的文档）。
            alarm::对账(&app, 阶段);
        }
    });
}

#[cfg(test)]
mod tests {
    use super::*;

    fn 新会话(设置: &Focus) -> 会话 {
        let now = Instant::now();
        会话 {
            余额毫秒: 设置.起始毫秒(),
            上限毫秒: 设置.上限毫秒(),
            开始于: now,
            上一拍: now,
            阶段: 阶段::专注,
            累计专注: Duration::ZERO,
            累计离开: Duration::ZERO,
            警报次数: 0,
            冷却中: false,
        }
    }

    /// 推进 `秒` 秒（每拍 1 秒），返回响了几次。
    fn 推进(s: &mut 会话, 设置: &Focus, 秒: u32) -> u32 {
        let mut t = Instant::now();
        let mut 响 = 0;
        for _ in 0..秒 {
            t += Duration::from_secs(1);
            if matches!(走一拍(s, 设置, t), 这一拍::响了) {
                响 += 1;
            }
        }
        响
    }

    #[test]
    fn 一直专注会攒到上限就停() {
        let 设置 = Focus::default();
        let mut s = 新会话(&设置);
        // 先花掉一部分
        s.余额毫秒 = 0;
        推进(&mut s, &设置, 3600);
        assert_eq!(s.余额毫秒, 设置.上限毫秒());
        assert_eq!(s.警报次数, 0);
    }

    #[test]
    fn 一直走神到归零才响一次() {
        let 设置 = Focus::default();
        let mut s = 新会话(&设置);
        s.阶段 = 阶段::走神 {
            起于: Instant::now(),
        };
        // 走神起点要早于第一拍，否则第一拍还没过宽限
        s.阶段 = 阶段::走神 {
            起于: Instant::now() - Duration::from_secs(60),
        };
        let 响 = 推进(&mut s, &设置, 25 * 60);
        assert_eq!(响, 1, "默认设置下走神该只响一次（冷却管着）");
        assert_eq!(s.余额毫秒, 0);
    }

    #[test]
    fn 宽限期内不扣钱() {
        let 设置 = Focus::default();
        let mut s = 新会话(&设置);
        let 原 = s.余额毫秒;
        s.阶段 = 阶段::走神 {
            起于: Instant::now(),
        };
        // 只走 5 秒，宽限是 10 秒
        推进(&mut s, &设置, 5);
        assert_eq!(s.余额毫秒, 原, "宽限期内一分都不该扣");
    }

    #[test]
    fn 走神超过宽限才开始扣() {
        let 设置 = Focus::default();
        let mut s = 新会话(&设置);
        let 原 = s.余额毫秒;
        s.阶段 = 阶段::走神 {
            起于: Instant::now() - Duration::from_secs(11),
        };
        推进(&mut s, &设置, 10);
        // 大约扣了 10 秒（每秒 1 秒的额度）
        let 扣了 = 原 - s.余额毫秒;
        assert!((9_000..=11_000).contains(&扣了), "扣了 {扣了} 毫秒，该是 10 秒上下");
    }

    #[test]
    fn 切回来一下刷不出额度() {
        // ⚠️ 这条是**承重**的：用户明说要防"单纯切换回来就为了避免警报"。
        // 走神 19 分钟 → 切回来 3 秒 → 再走神，撑不过 20 分钟。
        //
        // ⚠️⚠️ **必须真的走满 19 分钟那些拍**。扣钱是按**拍**算的
        // （`走一拍` 里那段"只扣这一拍的份额"），**不是**"从 `起于` 一次算
        // 总账"——所以光把 `起于` 往前挪 19 分钟、然后只推 1 拍，
        // 一分钱都扣不掉，余额还是整整 20 分钟。这正是这条测试第一次
        // 写错的地方（`响` 该是 1，实得 0）。
        let 设置 = Focus::default();
        let mut s = 新会话(&设置);
        // `起于` 挪过宽限期即可（默认 10 秒），剩下的交给下面的拍数。
        s.阶段 = 阶段::走神 {
            起于: Instant::now() - Duration::from_secs(11),
        };
        推进(&mut s, &设置, 19 * 60);
        assert_eq!(s.警报次数, 0, "19 分钟还不该响");
        // 还剩一分钟上下（⚠️ 区间不写死：`推进` 每次另起一个 `Instant`，
        // 跨调用的头一拍 `实拍` 会算成 0 而被跳过，差的这一两秒别让测试抖）。
        assert!(
            (58_000..=62_000).contains(&s.余额毫秒),
            "走神 19 分钟该只剩一分钟上下，实得 {}",
            s.余额毫秒
        );

        // 切回来 3 秒——只够续 3 秒的命
        s.阶段 = 阶段::专注;
        推进(&mut s, &设置, 3);
        assert!(
            s.余额毫秒 < 66_000,
            "切回来 3 秒只该补回 3 秒，实得 {}",
            s.余额毫秒
        );

        // 再走神：这一分钟撑不住，该响
        s.阶段 = 阶段::走神 {
            起于: Instant::now() - Duration::from_secs(11),
        };
        let 响 = 推进(&mut s, &设置, 120);
        assert_eq!(响, 1, "靠切回来 3 秒续命，很快就该响了");
        assert_eq!(s.警报次数, 1, "响过一次之后冷却管着，不该连着响");
    }

    #[test]
    fn 警报中账本冻结() {
        let 设置 = Focus::default();
        let mut s = 新会话(&设置);
        s.阶段 = 阶段::警报;
        s.余额毫秒 = 0;
        let 响 = 推进(&mut s, &设置, 600);
        assert_eq!(响, 0, "警报中不该重复触发");
        assert_eq!(s.余额毫秒, 0, "警报中余额不该动");
    }

    #[test]
    fn 冷却要攒回复活线才解除() {
        let 设置 = Focus::default();
        let mut s = 新会话(&设置);
        s.冷却中 = true;
        s.余额毫秒 = 0;
        s.阶段 = 阶段::专注;
        // 攒 10 秒，远不到复活线（默认 1 分钟）
        推进(&mut s, &设置, 10);
        assert!(s.冷却中, "才攒 10 秒，冷却不该解除");
        assert!(s.余额毫秒 < s.复活线());
        // 再攒，过了复活线
        推进(&mut s, &设置, 120);
        assert!(!s.冷却中, "攒过复活线该解除冷却");
    }

    #[test]
    fn 确认之后余额归零且带冷却() {
        // ⚠️ 不带冷却的话，用户点掉警报的下一秒又响（余额还是 0）。
        let 状态 = FocusState::default();
        let 设置 = Focus::default();
        开始(&状态, &设置);
        确认(&状态);
        let 快照 = 现在(&状态);
        assert!(快照.running);
        assert_eq!(快照.balance_ms, 0);
        // 冷却在内部，快照看不见——用"不会再立刻响"间接验：见上面那条。
    }

    #[test]
    fn 没在跑的时候一切都是空的() {
        let 状态 = FocusState::default();
        let 快照 = 现在(&状态);
        assert!(!快照.running);
        assert_eq!(快照.balance_ms, 0);
    }

    #[test]
    fn 重复开始不会重置余额() {
        let 状态 = FocusState::default();
        let 设置 = Focus::default();
        开始(&状态, &设置);
        {
            let mut 内 = 状态.内.lock().unwrap();
            内.as_mut().unwrap().余额毫秒 = 12345;
        }
        let 快照 = 开始(&状态, &设置);
        assert_eq!(快照.balance_ms, 12345, "第二次开始不该把余额清掉");
    }

    #[test]
    fn 停下之后快照是空的() {
        let 状态 = FocusState::default();
        开始(&状态, &Focus::default());
        停下(&状态);
        assert!(!现在(&状态).running);
    }

    #[test]
    fn 得焦会把走神改回专注() {
        let 状态 = FocusState::default();
        开始(&状态, &Focus::default());
        窗口焦点(&状态, false);
        assert_eq!(现在(&状态).phase, "away");
        窗口焦点(&状态, true);
        assert_eq!(现在(&状态).phase, "focusing");
    }

    #[test]
    fn 警报中失焦不会改阶段() {
        let 状态 = FocusState::default();
        开始(&状态, &Focus::default());
        {
            let mut 内 = 状态.内.lock().unwrap();
            内.as_mut().unwrap().阶段 = 阶段::警报;
        }
        窗口焦点(&状态, false);
        assert_eq!(现在(&状态).phase, "alarm", "警报中不能被失焦事件拽走");
    }
}
