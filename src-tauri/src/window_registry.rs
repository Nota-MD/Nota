use serde::{Deserialize, Serialize};
use std::fs::{self, OpenOptions};
use std::io::Write;
use std::path::{Path, PathBuf};
use std::sync::Arc;
use std::time::{Duration, Instant, SystemTime, UNIX_EPOCH};

use crate::error::{NotaError, Result};

const TRANSFER_TIMEOUT: Duration = Duration::from_secs(5);

#[derive(Clone)]
pub struct WindowRegistry {
    inner: Option<Arc<Inner>>,
    problem: Option<String>,
}

struct Inner {
    root: PathBuf,
    id: u32,
    pid: u32,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
struct WindowRecord {
    id: u32,
    pid: u32,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RegistrySnapshot {
    pub id: u32,
    pub ids: Vec<u32>,
    pub picker_active: bool,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TransferRequest {
    pub request_id: String,
    pub source_id: u32,
    pub path: Option<String>,
    pub text: Option<String>,
    pub title_hint: Option<String>,
    pub focus_target: bool,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
struct TransferAck {
    ok: bool,
    error: Option<String>,
}

impl Drop for Inner {
    fn drop(&mut self) {
        let _ = fs::remove_file(self.windows_dir().join(format!("{}.json", self.id)));
        let _ = fs::remove_file(self.picker_dir().join(format!("{}.json", self.id)));
        let _ = fs::remove_dir_all(self.requests_dir().join(self.id.to_string()));
    }
}

impl WindowRegistry {
    pub fn register() -> Self {
        match Self::try_register() {
            Ok(inner) => Self {
                inner: Some(Arc::new(inner)),
                problem: None,
            },
            Err(error) => Self {
                inner: None,
                problem: Some(error.to_string()),
            },
        }
    }

    fn try_register() -> Result<Inner> {
        let root = runtime_root()?;
        for directory in ["windows", "picker", "requests", "acks"] {
            fs::create_dir_all(root.join(directory))
                .map_err(|error| NotaError::other(format!("create window registry: {error}")))?;
        }
        set_private_directory(&root)?;

        let pid = std::process::id();
        for id in 1..=9999 {
            let path = root.join("windows").join(format!("{id}.json"));
            let mut file = match OpenOptions::new().write(true).create_new(true).open(&path) {
                Ok(file) => file,
                Err(error) if error.kind() == std::io::ErrorKind::AlreadyExists => continue,
                Err(error) => {
                    return Err(NotaError::other(format!("reserve window id: {error}")));
                }
            };
            let record = WindowRecord { id, pid };
            if let Err(error) = serde_json::to_writer(&mut file, &record) {
                let _ = fs::remove_file(&path);
                return Err(NotaError::other(format!("write window id: {error}")));
            }
            let _ = file.flush();
            return Ok(Inner { root, id, pid });
        }
        Err(NotaError::other("no free Nota window id"))
    }

    pub fn snapshot(&self) -> Result<RegistrySnapshot> {
        let inner = self.inner()?;
        let mut ids = active_ids(inner);
        ids.sort_unstable();
        let picker_active = ids
            .iter()
            .any(|id| inner.picker_dir().join(format!("{id}.json")).is_file());
        Ok(RegistrySnapshot {
            id: inner.id,
            ids,
            picker_active,
        })
    }

    pub fn set_picker(&self, enabled: bool) -> Result<()> {
        let inner = self.inner()?;
        let path = inner.picker_dir().join(format!("{}.json", inner.id));
        if !enabled {
            let _ = fs::remove_file(path);
            return Ok(());
        }
        write_atomic(
            &path,
            &serde_json::to_vec(&WindowRecord {
                id: inner.id,
                pid: inner.pid,
            })
            .map_err(|error| NotaError::other(format!("encode picker marker: {error}")))?,
        )
    }

    pub fn transfer(
        &self,
        target_id: u32,
        path: Option<String>,
        text: Option<String>,
        title_hint: Option<String>,
        focus_target: bool,
    ) -> Result<()> {
        let inner = self.inner()?;
        if target_id == inner.id {
            return Err(NotaError::other("cannot move a tab to the same window"));
        }
        let ids = active_ids(inner);
        if !ids.contains(&target_id) {
            return Err(NotaError::other(format!(
                "window {target_id} is not available"
            )));
        }
        if path.as_deref().unwrap_or("").is_empty() && text.is_none() {
            return Err(NotaError::other("no document data to transfer"));
        }

        let request_id = request_id(inner.id, target_id);
        let request = TransferRequest {
            request_id: request_id.clone(),
            source_id: inner.id,
            path,
            text,
            title_hint,
            focus_target,
        };
        let target_dir = inner.requests_dir().join(target_id.to_string());
        fs::create_dir_all(&target_dir)
            .map_err(|error| NotaError::other(format!("prepare target inbox: {error}")))?;
        let encoded = serde_json::to_vec(&request)
            .map_err(|error| NotaError::other(format!("encode transfer: {error}")))?;
        write_atomic(&target_dir.join(format!("{request_id}.json")), &encoded)?;

        let ack = inner.acks_dir().join(format!("{request_id}.json"));
        let started = Instant::now();
        while started.elapsed() < TRANSFER_TIMEOUT {
            if let Ok(bytes) = fs::read(&ack) {
                let _ = fs::remove_file(&ack);
                let result: TransferAck = serde_json::from_slice(&bytes)
                    .map_err(|error| NotaError::other(format!("decode transfer ack: {error}")))?;
                if result.ok {
                    return Ok(());
                }
                return Err(NotaError::other(
                    result
                        .error
                        .unwrap_or_else(|| "target window rejected the transfer".into()),
                ));
            }
            std::thread::sleep(Duration::from_millis(40));
        }
        let _ = fs::remove_file(target_dir.join(format!("{request_id}.json")));
        Err(NotaError::other("target window did not respond"))
    }

    pub fn take_transfer(&self) -> Result<Option<TransferRequest>> {
        let inner = self.inner()?;
        let directory = inner.requests_dir().join(inner.id.to_string());
        let Ok(entries) = fs::read_dir(&directory) else {
            return Ok(None);
        };
        let mut requests: Vec<PathBuf> = entries
            .filter_map(|entry| entry.ok().map(|item| item.path()))
            .filter(|path| path.extension().and_then(|value| value.to_str()) == Some("json"))
            .collect();
        requests.sort();
        let Some(path) = requests.first() else {
            return Ok(None);
        };
        let taken = path.with_extension("taken");
        fs::rename(path, &taken)
            .map_err(|error| NotaError::other(format!("claim transfer: {error}")))?;
        let bytes = fs::read(&taken)
            .map_err(|error| NotaError::other(format!("read transfer: {error}")))?;
        serde_json::from_slice(&bytes)
            .map(Some)
            .map_err(|error| NotaError::other(format!("decode transfer: {error}")))
    }

    pub fn ack_transfer(&self, request_id: &str, ok: bool, error: Option<String>) -> Result<()> {
        let inner = self.inner()?;
        if !safe_request_id(request_id) {
            return Err(NotaError::other("invalid transfer request id"));
        }
        let bytes = serde_json::to_vec(&TransferAck { ok, error })
            .map_err(|value| NotaError::other(format!("encode transfer ack: {value}")))?;
        write_atomic(&inner.acks_dir().join(format!("{request_id}.json")), &bytes)?;
        let _ = fs::remove_file(
            inner
                .requests_dir()
                .join(inner.id.to_string())
                .join(format!("{request_id}.taken")),
        );
        Ok(())
    }

    pub fn id(&self) -> Result<u32> {
        Ok(self.inner()?.id)
    }

    fn inner(&self) -> Result<&Inner> {
        self.inner.as_deref().ok_or_else(|| {
            NotaError::other(
                self.problem
                    .clone()
                    .unwrap_or_else(|| "window registry unavailable".into()),
            )
        })
    }
}

impl Inner {
    fn windows_dir(&self) -> PathBuf {
        self.root.join("windows")
    }

    fn picker_dir(&self) -> PathBuf {
        self.root.join("picker")
    }

    fn requests_dir(&self) -> PathBuf {
        self.root.join("requests")
    }

    fn acks_dir(&self) -> PathBuf {
        self.root.join("acks")
    }
}

fn runtime_root() -> Result<PathBuf> {
    let base = dirs::runtime_dir().unwrap_or_else(std::env::temp_dir);
    Ok(base.join("nota-window-registry-v1"))
}

fn active_ids(inner: &Inner) -> Vec<u32> {
    let Ok(entries) = fs::read_dir(inner.windows_dir()) else {
        return vec![inner.id];
    };
    let mut ids = Vec::new();
    for entry in entries.flatten() {
        let path = entry.path();
        if path.extension().and_then(|value| value.to_str()) != Some("json") {
            continue;
        }
        let Ok(bytes) = fs::read(&path) else {
            continue;
        };
        let Ok(record) = serde_json::from_slice::<WindowRecord>(&bytes) else {
            continue;
        };
        if process_alive(record.pid) {
            ids.push(record.id);
        } else {
            let _ = fs::remove_file(path);
        }
    }
    if !ids.contains(&inner.id) {
        ids.push(inner.id);
    }
    ids
}

#[cfg(unix)]
fn process_alive(pid: u32) -> bool {
    let result = unsafe { libc::kill(pid as libc::pid_t, 0) };
    result == 0 || std::io::Error::last_os_error().raw_os_error() == Some(libc::EPERM)
}

#[cfg(not(unix))]
fn process_alive(_pid: u32) -> bool {
    true
}

fn write_atomic(path: &Path, bytes: &[u8]) -> Result<()> {
    let temporary = path.with_extension("tmp");
    let mut file = fs::File::create(&temporary)
        .map_err(|error| NotaError::other(format!("create {}: {error}", temporary.display())))?;
    file.write_all(bytes)
        .map_err(|error| NotaError::other(format!("write {}: {error}", temporary.display())))?;
    file.flush()
        .map_err(|error| NotaError::other(format!("flush {}: {error}", temporary.display())))?;
    fs::rename(&temporary, path)
        .map_err(|error| NotaError::other(format!("commit {}: {error}", path.display())))
}

#[cfg(unix)]
fn set_private_directory(path: &Path) -> Result<()> {
    use std::os::unix::fs::PermissionsExt;
    fs::set_permissions(path, fs::Permissions::from_mode(0o700))
        .map_err(|error| NotaError::other(format!("secure window registry: {error}")))
}

#[cfg(not(unix))]
fn set_private_directory(_path: &Path) -> Result<()> {
    Ok(())
}

fn request_id(source_id: u32, target_id: u32) -> String {
    let nanos = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_nanos();
    format!("{source_id}-{target_id}-{nanos}")
}

fn safe_request_id(value: &str) -> bool {
    !value.is_empty()
        && value.len() <= 128
        && value
            .bytes()
            .all(|byte| byte.is_ascii_alphanumeric() || byte == b'-' || byte == b'_')
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn closed_ids_remain_gaps_and_later_windows_are_not_renumbered() {
        let root = std::env::temp_dir().join(format!(
            "nota-window-registry-test-{}-{}",
            std::process::id(),
            SystemTime::now()
                .duration_since(UNIX_EPOCH)
                .unwrap_or_default()
                .as_nanos()
        ));
        fs::create_dir_all(root.join("windows")).expect("create windows dir");
        let pid = std::process::id();
        for id in [1, 3] {
            fs::write(
                root.join("windows").join(format!("{id}.json")),
                serde_json::to_vec(&WindowRecord { id, pid }).expect("encode record"),
            )
            .expect("write record");
        }
        let inner = Inner {
            root: root.clone(),
            id: 4,
            pid,
        };
        let mut ids = active_ids(&inner);
        ids.sort_unstable();
        assert_eq!(ids, vec![1, 3, 4]);
        assert!(root.join("windows/1.json").is_file());
        assert!(root.join("windows/3.json").is_file());
        assert!(!root.join("windows/2.json").exists());
        let _ = fs::remove_dir_all(root);
    }

    #[test]
    fn transfer_ids_cannot_escape_the_runtime_directory() {
        assert!(safe_request_id("1-2-123"));
        assert!(!safe_request_id("../1"));
        assert!(!safe_request_id("1/2"));
        assert!(!safe_request_id(""));
    }
}
