//! 应用全局状态。
//!
//! ⚠️ **锁序不变量（全仓统一）**：
//!
//! ```text
//! plugins  →  documents  →  settings
//! ```
//!
//! 只能**从左往右**取锁，**不许反向**。违反它的后果是死锁，而且是最难查的那种——
//! 平时不触发，只在两个命令碰巧同时跑时才卡住。
//!
//! 为什么会交叉：插件的 Lua 回调（持着 `plugins`）要读文档（`documents`），
//! 而存盘流程（持着 `documents`）要读设置（`settings`）。只要所有路径都朝一个方向
//! 走就不会成环。
//!
//! 为什么 `documents` 是 `Arc<Mutex<_>>` 而不是直接 `Mutex<_>`：插件的 Lua 闭包
//! 需要长期持有它（生命周期比任何一次命令调用都长），所以得是 `Arc`。
//! `AppState` 和 `HostContext` 拿的是**同一个** `Arc`，不是两份拷贝。
//!
//! 这条不变量也写在 `docs/03-data-structures.md`。

use std::path::PathBuf;
use std::sync::{Arc, Mutex};

use crate::document::DocumentStore;
use crate::plugin::PluginHost;
use crate::settings::Settings;

/// ⚠️ **这个结构体没有构造函数**，`lib.rs` 是手写 `AppState { … }` 字面量建的。
///
/// 曾经有一个 `AppState::new(settings, plugins)`，**而且它没有任何调用者**——
/// 2026-09-24 删掉了。它死于一个具体的错误：它是全仓唯一一处把
/// `settings.strict_markdown` 传给文档仓的地方（"开机时标题按什么口径算"），
/// 而因为它没人调用，**那份设置开机时从来没到达文档仓**。两个构造函数里
/// 只有一个记得口径，另一个照样编译过——这就是"两处都改"那句告诫的反例。
///
/// 现在口径从 `DocumentStore::new(strict)` 的**参数**进去（忘就编译不过），
/// 见 `lib.rs` 第 ② 步。
pub struct AppState {
    pub documents: Arc<Mutex<DocumentStore>>,
    pub settings: Arc<Mutex<Settings>>,
    /// 当前工作区根目录。`None` = 没开文件夹（单文件模式）。
    pub workspace: Arc<Mutex<Option<PathBuf>>>,
    /// 插件宿主。锁在**最外层**（见上面的锁序）。
    pub plugins: Mutex<PluginHost>,
    /// 开机读设置时出的问题，读成功是 `None`。
    ///
    /// ⚠️ **只写一次、此后只读**，所以不是 `Mutex`——它在 `setup` 里定下来，
    /// 之后谁都不改。前端启动时拉一次，非空就弹一条 toast。
    ///
    /// ⚠️ 为什么要有这个字段（2026-09-25）：以前解析失败只往 stderr 写一行，
    /// 用户从界面上**完全看不出来**——看到的是一份出厂设置，于是"我的设置
    /// 自己变回默认了"。控制台那句话对双击图标的用户不存在。
    /// （那行 stderr 现在归调试闸门管，`NOTA_DEBUG=1` 才出，见 `log.rs`——
    /// 所以**更**不能拿它当提示了：默认连开发者之外的终端都是干净的。）
    pub settings_problem: Option<String>,
    /// **宿主此刻在说哪种语言**（`crate::lang::有效语言` 算出来的那个）。
    ///
    /// ⚠️ 与 `settings_problem` 同一条规矩：**启动时算一次，此后只读**。
    /// 它和插件加载时拿到的是**同一个值**（`lib.rs` 里算完，给 `HostContext`
    /// 一份、给这里一份），所以前端问"现在是什么语言"，得到的答案与插件
    /// 文案表的口径必然一致。
    ///
    /// ⚠️ 所以**别在命令里拿设置重算一遍**：用户改了设置但还没重启的那段时间里，
    /// 那样算出来的是"下次启动才会生效的语言"，而插件用的还是旧的那份——
    /// 前端会照着新语言去给插件挑提示语，说的却是插件没在做的事。
    /// 「重启后生效」这件事的落点就是这一格（理由见 `settings/general.rs`）。
    pub app_lang: String,
}
