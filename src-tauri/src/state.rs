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

///

///

pub struct AppState {
    pub documents: Arc<Mutex<DocumentStore>>,
    pub settings: Arc<Mutex<Settings>>,

    pub workspace: Arc<Mutex<Option<PathBuf>>>,

    pub plugins: Mutex<PluginHost>,
    ///

    ///
    pub settings_problem: Option<String>,

    ///

    ///
    pub app_language: String,
}
