//! 应用全局状态。
//!
//! ⚠️ **锁序不变量（全仓统一，别破）**：
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

pub struct AppState {
    pub documents: Arc<Mutex<DocumentStore>>,
    pub settings: Arc<Mutex<Settings>>,
    /// 当前工作区根目录。`None` = 没开文件夹（Typora 的"单文件模式"）。
    pub workspace: Arc<Mutex<Option<PathBuf>>>,
    /// 插件宿主。锁在**最外层**（见上面的锁序）。
    pub plugins: Mutex<PluginHost>,
}

impl AppState {
    pub fn new(settings: Settings, plugins: PluginHost) -> Self {
        Self {
            documents: Arc::new(Mutex::new(DocumentStore::new())),
            settings: Arc::new(Mutex::new(settings)),
            workspace: Arc::new(Mutex::new(None)),
            plugins: Mutex::new(plugins),
        }
    }
}
