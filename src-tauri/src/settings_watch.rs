use std::path::PathBuf;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;

use notify::{RecommendedWatcher, RecursiveMode, Watcher};
use tauri::{Emitter, Manager};

use crate::settings::Settings;
use crate::state::AppState;

pub struct SettingsWatch {
    _watcher: Option<RecommendedWatcher>,
    stopped: Arc<AtomicBool>,
}

impl SettingsWatch {
    pub fn start(app: tauri::AppHandle) -> Self {
        let stopped = Arc::new(AtomicBool::new(false));
        let Some(path) = crate::paths::settings_file().ok() else {
            return Self {
                _watcher: None,
                stopped,
            };
        };
        let Some(parent) = path.parent().map(PathBuf::from) else {
            return Self {
                _watcher: None,
                stopped,
            };
        };
        let app_for_watch = app.clone();
        let stopped_for_watch = stopped.clone();
        let watched_file = path.clone();
        let watcher = notify::recommended_watcher(move |result: notify::Result<notify::Event>| {
            if stopped_for_watch.load(Ordering::Relaxed) {
                return;
            }
            let Ok(event) = result else {
                return;
            };
            if !event
                .paths
                .iter()
                .any(|candidate| candidate == &watched_file)
            {
                return;
            }
            reload(&app_for_watch, &watched_file);
        })
        .ok()
        .and_then(|mut watcher| {
            watcher.watch(&parent, RecursiveMode::NonRecursive).ok()?;
            Some(watcher)
        });

        Self {
            _watcher: watcher,
            stopped,
        }
    }
}

impl Drop for SettingsWatch {
    fn drop(&mut self) {
        self.stopped.store(true, Ordering::Relaxed);
    }
}

fn reload(app: &tauri::AppHandle, path: &PathBuf) {
    let Ok(next) = Settings::load() else {
        return;
    };
    let Ok(next_json) = serde_json::to_vec(&next) else {
        return;
    };
    let state = app.state::<AppState>();
    let Ok(mut current) = state.settings.lock() else {
        return;
    };
    let Ok(current_json) = serde_json::to_vec(&*current) else {
        return;
    };
    if current_json == next_json {
        return;
    }
    *current = next.clone();
    drop(current);

    crate::log::record(format!(
        "[nota] settings reloaded from external window: {}",
        path.display()
    ));
    state
        .documents
        .lock()
        .unwrap()
        .set_strict_markdown(next.strict_markdown);
    state
        .plugins
        .lock()
        .unwrap()
        .set_extensions_enabled(next.general.extensions_enabled);
    crate::log::set_debug_mode(next.general.debug_mode);
    let _ = app.emit("nota:settings-changed", next);
}
