use std::collections::HashMap;
use std::path::{Path, PathBuf};
use std::sync::mpsc::channel;
use std::sync::{Arc, Mutex};
use std::time::Duration;

use notify::{RecommendedWatcher, RecursiveMode, Watcher};
use tauri::{AppHandle, Emitter};

use crate::document::DocId;

pub const EVENT_FILE_CHANGED: &str = "nota:file-changed";

const DEBOUNCE: Duration = Duration::from_millis(250);

#[derive(Debug, Clone)]
struct WatchedFile {
    id: DocId,
    digest: String,
}

struct Inner {
    watcher: Option<RecommendedWatcher>,

    dirs: HashMap<PathBuf, usize>,

    files: HashMap<PathBuf, WatchedFile>,
}

impl Inner {
    fn sync(&mut self, files: &[(DocId, PathBuf)]) {
        let wanted: HashMap<PathBuf, WatchedFile> = files
            .iter()
            .map(|(id, path)| {
                let digest = self
                    .files
                    .get(path)
                    .filter(|previous| previous.id == *id)
                    .map(|previous| previous.digest.clone())
                    .unwrap_or_else(|| read_digest(path).unwrap_or_default());
                (path.clone(), WatchedFile { id: *id, digest })
            })
            .collect();

        let mut target_dirs: HashMap<PathBuf, usize> = HashMap::new();
        for path in wanted.keys() {
            if let Some(parent) = path.parent() {
                *target_dirs.entry(parent.to_path_buf()).or_insert(0) += 1;
            }
        }
        for (directory, _) in target_dirs.iter() {
            if !self.dirs.contains_key(directory) {
                if let Some(w) = self.watcher.as_mut() {
                    match w.watch(directory, RecursiveMode::NonRecursive) {
                        Ok(()) => {}

                        Err(e) => crate::debug_log!(
                            "[nota] failed to watch directory {}: {e}",
                            directory.display()
                        ),
                    }
                }
            }
        }
        for directory in self.dirs.keys() {
            if !target_dirs.contains_key(directory) {
                if let Some(w) = self.watcher.as_mut() {
                    let _ = w.unwatch(directory);
                }
            }
        }
        self.dirs = target_dirs;
        self.files = wanted;
    }
}

pub fn digest(text: &str) -> String {
    let mut h: u64 = 0xcbf2_9ce4_8422_2325;
    for b in text.as_bytes() {
        h ^= *b as u64;
        h = h.wrapping_mul(0x0000_0100_0000_01b3);
    }
    format!("{h:016x}")
}

fn read_digest(path: &Path) -> Option<String> {
    std::fs::read(path)
        .ok()
        .map(|bytes| digest(&String::from_utf8_lossy(&bytes)))
}

pub struct FileWatcher {
    inner: Arc<Mutex<Inner>>,
}

impl FileWatcher {
    pub fn new(app: AppHandle) -> Self {
        let (tx, rx) = channel::<notify::Result<notify::Event>>();
        let watcher = notify::recommended_watcher(move |ev| {
            let _ = tx.send(ev);
        })
        .map_err(|e| crate::debug_log!("[nota] failed to start file watcher: {e}"))
        .ok();

        let inner = Arc::new(Mutex::new(Inner {
            watcher,
            dirs: HashMap::new(),
            files: HashMap::new(),
        }));

        let worker_inner = Arc::clone(&inner);
        std::thread::spawn(move || receive_events(app, worker_inner, rx));

        Self { inner }
    }

    pub fn sync(&self, files: &[(DocId, PathBuf)]) {
        self.inner.lock().unwrap().sync(files);
    }

    pub fn remember(&self, path: &Path, text: &str) {
        let mut inner = self.inner.lock().unwrap();
        if let Some(file) = inner.files.get_mut(path) {
            file.digest = digest(text);
        }
    }
}

fn receive_events(
    app: AppHandle,
    inner: Arc<Mutex<Inner>>,
    rx: std::sync::mpsc::Receiver<notify::Result<notify::Event>>,
) {
    loop {
        let first = match rx.recv() {
            Ok(ev) => ev,
            Err(_) => return,
        };
        let mut changed: Vec<PathBuf> = Vec::new();
        let collect = |ev: notify::Result<notify::Event>, changed: &mut Vec<PathBuf>| match ev {
            Ok(e) => {
                if matches!(
                    e.kind,
                    notify::EventKind::Create(_)
                        | notify::EventKind::Modify(_)
                        | notify::EventKind::Remove(_)
                ) {
                    changed.extend(e.paths);
                }
            }
            Err(e) => crate::debug_log!("[nota] file watcher error: {e}"),
        };
        collect(first, &mut changed);

        while let Ok(ev) = rx.recv_timeout(DEBOUNCE) {
            collect(ev, &mut changed);
        }

        compare_and_emit(app.clone(), &inner, changed);
    }
}

fn compare_and_emit(app: AppHandle, inner: &Arc<Mutex<Inner>>, changed: Vec<PathBuf>) {
    let events = {
        let mut inner = inner.lock().unwrap();
        let mut events: Vec<(DocId, PathBuf, String)> = Vec::new();
        for path in changed {
            let Some(file) = inner.files.get(&path).cloned() else {
                continue;
            };
            let Some(next_digest) = read_digest(&path) else {
                continue;
            };
            if next_digest == file.digest {
                continue;
            }

            inner.files.get_mut(&path).unwrap().digest = next_digest.clone();
            events.push((file.id, path, next_digest));
        }
        events
    };

    for (id, path, digest) in events {
        crate::debug_log!("[nota] file changed externally: {}", path.display());
        let _ = app.emit(
            EVENT_FILE_CHANGED,
            serde_json::json!({
                "id": id.0,
                "path": path.to_string_lossy(),
                "hash": digest,
            }),
        );
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn digest_matches_identical_content() {
        assert_eq!(digest("same\ncontent\n"), digest("same\ncontent\n"));
        assert_ne!(digest("content"), digest("content "));
        assert_ne!(digest(""), digest("\n"));
    }

    #[test]
    fn digest_detects_multibyte_differences() {
        assert_ne!(digest("a"), digest("ab"));
    }

    #[test]
    fn sync_only_tracks_registered_paths() {
        let mut inner = Inner {
            watcher: None,
            dirs: HashMap::new(),
            files: HashMap::new(),
        };
        let a = PathBuf::from("/tmp/nota-watch-missing/a.md");
        let b = PathBuf::from("/tmp/nota-watch-missing/b.md");
        inner.sync(&[(DocId(1), a.clone())]);
        assert!(inner.files.contains_key(&a));
        assert!(
            !inner.files.contains_key(&b),
            "unregistered paths must not be watched"
        );

        inner.files.get_mut(&a).unwrap().digest = "abc".to_owned();
        inner.sync(&[(DocId(1), a.clone())]);
        assert_eq!(inner.files[&a].digest, "abc");

        inner.sync(&[(DocId(2), a.clone())]);
        assert_eq!(inner.files[&a].id, DocId(2));
    }

    #[test]
    fn sync_registers_parent_directories() {
        let mut inner = Inner {
            watcher: None,
            dirs: HashMap::new(),
            files: HashMap::new(),
        };
        let a = PathBuf::from("/tmp/nota-watch-a/a.md");
        let b = PathBuf::from("/tmp/nota-watch-a/b.md");
        inner.sync(&[(DocId(1), a), (DocId(2), b)]);
        assert_eq!(
            inner.dirs.get(Path::new("/tmp/nota-watch-a")),
            Some(&2),
            "both watched files must register their shared parent directory"
        );
    }

    #[test]
    fn sync_tolerates_missing_files() {
        let mut inner = Inner {
            watcher: None,
            dirs: HashMap::new(),
            files: HashMap::new(),
        };
        inner.sync(&[(
            DocId(7),
            PathBuf::from("/tmp/nota-watch-missing/no-such-file.md"),
        )]);
        assert!(
            inner.files[&PathBuf::from("/tmp/nota-watch-missing/no-such-file.md")]
                .digest
                .is_empty()
        );
    }
}
