//!

//!
//! ```text
//! plugins -> documents -> settings
//! ```
//!

//!

//!

//!

use std::path::PathBuf;
use std::sync::{Arc, Mutex};

use crate::document::DocumentStore;
use crate::plugin::PluginHost;
use crate::settings::Settings;
use crate::table_bridge::TableBridge;

///

///

pub struct AppState {
    pub documents: Arc<Mutex<DocumentStore>>,
    pub settings: Arc<Mutex<Settings>>,

    pub workspace: Arc<Mutex<Option<PathBuf>>>,

    pub plugins: Mutex<PluginHost>,
    /// Current table snapshot and temporary display state owned by extensions.
    ///
    /// Plugin code may access this while holding the `plugins` lock. No path
    /// acquires these locks in the opposite order.
    pub table_bridge: Arc<Mutex<TableBridge>>,

    ///

    ///
    pub settings_problem: Option<String>,

    ///

    ///
    pub app_lang: String,
}
