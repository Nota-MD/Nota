//! Opt-in Lua hot reload for developer mode.
//!
//! The watcher is inactive unless `[general].lua_hot_reload` is enabled.
//! Reloading validates the replacement first; a syntax or manifest error keeps
//! the previous Lua state alive.

use std::collections::{BTreeMap, BTreeSet};
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex};
use std::time::{Duration, UNIX_EPOCH};

use serde_json::json;
use tauri::{AppHandle, Emitter, Manager};

use crate::state::AppState;

type Snapshot = BTreeMap<PathBuf, (u64, u64)>;

/// Managed process-wide switch and worker handle.
#[derive(Default)]
pub struct PluginWatch {
    running: Arc<AtomicBool>,
    worker: Mutex<Option<std::thread::JoinHandle<()>>>,
}

impl PluginWatch {
    pub fn set_enabled(&self, app: &AppHandle, enabled: bool) {
        if enabled {
            self.start(app.clone());
        } else {
            self.stop();
        }
    }

    fn start(&self, app: AppHandle) {
        if self.running.swap(true, Ordering::SeqCst) {
            return;
        }
        let running = self.running.clone();
        let worker = std::thread::spawn(move || run(app, running));
        if let Ok(mut slot) = self.worker.lock() {
            if let Some(old) = slot.replace(worker) {
                old.join().ok();
            }
        }
    }

    fn stop(&self) {
        self.running.store(false, Ordering::SeqCst);
        if let Ok(mut slot) = self.worker.lock() {
            if let Some(worker) = slot.take() {
                worker.join().ok();
            }
        }
    }
}

fn snapshot_file(path: &Path, output: &mut Snapshot) {
    let Ok(meta) = std::fs::metadata(path) else {
        return;
    };
    let is_lua = path.extension().and_then(|value| value.to_str()) == Some("lua");
    let is_manifest = path.file_name().and_then(|value| value.to_str()) == Some("plugin.toml");
    if !meta.is_file() || (!is_lua && !is_manifest) {
        return;
    }
    let modified = meta
        .modified()
        .ok()
        .and_then(|value| value.duration_since(UNIX_EPOCH).ok())
        .map(|value| value.as_nanos() as u64)
        .unwrap_or(0);
    output.insert(path.to_path_buf(), (modified, meta.len()));
}

fn walk(current: &Path, output: &mut Snapshot) {
    let Ok(entries) = std::fs::read_dir(current) else {
        return;
    };
    for entry in entries.flatten() {
        let path = entry.path();
        if path.is_dir() {
            walk(&path, output);
        } else {
            snapshot_file(&path, output);
        }
    }
}

fn snapshot(roots: &[PathBuf]) -> Snapshot {
    let mut output = Snapshot::new();
    for root in roots {
        walk(root, &mut output);
    }
    output
}

fn changed_plugin_dirs(roots: &[PathBuf], before: &Snapshot, after: &Snapshot) -> BTreeSet<PathBuf> {
    let changed = before
        .keys()
        .chain(after.keys())
        .filter(|path| before.get(*path) != after.get(*path));
    let mut dirs = BTreeSet::new();
    for path in changed {
        let Some(root) = roots.iter().find(|root| path.starts_with(root)) else {
            continue;
        };
        let Ok(relative) = path.strip_prefix(root) else {
            continue;
        };
        let Some(first) = relative.components().next() else {
            continue;
        };
        let dir = root.join(first.as_os_str());
        if dir.is_dir() {
            dirs.insert(dir);
        }
    }
    dirs
}

fn run(app: AppHandle, running: Arc<AtomicBool>) {
    let mut roots = vec![crate::paths::user_plugins_dir().unwrap_or_default()];
    roots.extend(crate::paths::builtin_plugins_dirs(None));
    roots.retain(|root| root.is_dir());
    if roots.is_empty() {
        running.store(false, Ordering::SeqCst);
        return;
    }

    let mut previous = snapshot(&roots);
    while running.load(Ordering::SeqCst) {
        std::thread::sleep(Duration::from_millis(400));
        if !running.load(Ordering::SeqCst) {
            break;
        }
        let current = snapshot(&roots);
        let dirs = changed_plugin_dirs(&roots, &previous, &current);
        previous = current;
        if dirs.is_empty() {
            continue;
        }

        // Wait for editors that save through a temporary file or several writes.
        std::thread::sleep(Duration::from_millis(300));
        if !running.load(Ordering::SeqCst) {
            break;
        }
        previous = snapshot(&roots);
        for dir in dirs {
            let result = {
                let state = app.state::<AppState>();
                let mut host = state.plugins.lock().unwrap();
                host.reload_dir(&dir)
            };
            match result {
                Ok(Some(id)) => {
                    let _ = app.emit(
                        crate::plugin::EVENT_PANEL_DIRTY,
                        json!({ "plugin": id.clone(), "id": null }),
                    );
                    let _ = app.emit(
                        crate::plugin::EVENT_PLUGIN_RELOADED,
                        json!({ "plugin": id, "error": null }),
                    );
                }
                Ok(None) => {}
                Err(error) => {
                    let _ = app.emit(
                        crate::plugin::EVENT_PLUGIN_RELOADED,
                        json!({ "plugin": "", "error": error.to_string() }),
                    );
                }
            }
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn changed_lua_selects_only_its_plugin_directory() {
        let root = std::env::temp_dir().join("nota-plugin-watch-test");
        let _ = std::fs::remove_dir_all(&root);
        let plugin = root.join("demo");
        std::fs::create_dir_all(&plugin).unwrap();
        let lua = plugin.join("main.lua");
        std::fs::write(&lua, "return {}").unwrap();
        std::fs::write(plugin.join("notes.txt"), "ignored").unwrap();

        let roots = vec![root.clone()];
        let before = snapshot(&roots);
        std::fs::write(&lua, "return { version = 2 }").unwrap();
        let after = snapshot(&roots);
        let changed = changed_plugin_dirs(&roots, &before, &after);
        assert_eq!(changed.into_iter().collect::<Vec<_>>(), vec![plugin]);

        let _ = std::fs::remove_dir_all(&root);
    }

    #[test]
    fn non_lua_files_do_not_trigger() {
        let root = std::env::temp_dir().join("nota-plugin-watch-ignore-test");
        let _ = std::fs::remove_dir_all(&root);
        let plugin = root.join("demo");
        std::fs::create_dir_all(&plugin).unwrap();
        let notes = plugin.join("notes.txt");
        std::fs::write(&notes, "a").unwrap();
        let roots = vec![root.clone()];
        let before = snapshot(&roots);
        std::fs::write(&notes, "changed").unwrap();
        let after = snapshot(&roots);
        assert!(changed_plugin_dirs(&roots, &before, &after).is_empty());
        let _ = std::fs::remove_dir_all(&root);
    }
}
