//! Recoverable copies of documents that have edits not yet written to their
//! source file.
//!
//! Drafts are deliberately separate from Auto Save. Auto Save writes the
//! original file, while this store only affects Nota's data directory. A
//! crash, forced quit, or discarded tab can therefore be recovered without
//! changing the source document.

use std::io::Write;
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicU64, Ordering};
use std::time::{SystemTime, UNIX_EPOCH};

use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};

use crate::error::{NotaError, Result};
use crate::paths;

const DRAFT_VERSION: u32 = 1;
const MAX_DRAFTS: usize = 100;

/// A draft as exposed to the settings UI. The body is intentionally omitted;
/// it is only loaded by the restore command.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct DraftInfo {
    pub id: String,
    pub path: Option<String>,
    pub title: String,
    pub updated_at: u64,
}

/// A complete recovery copy.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct Draft {
    #[serde(default = "default_version")]
    pub version: u32,
    pub id: String,
    pub path: Option<String>,
    pub title: String,
    pub text: String,
    pub encoding: String,
    pub line_ending: String,
    pub updated_at: u64,
}

fn default_version() -> u32 {
    DRAFT_VERSION
}

impl Draft {
    pub fn info(&self) -> DraftInfo {
        DraftInfo {
            id: self.id.clone(),
            path: self.path.clone(),
            title: self.title.clone(),
            updated_at: self.updated_at,
        }
    }
}

fn now_seconds() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|duration| duration.as_secs())
        .unwrap_or(0)
}

fn draft_file(dir: &Path, id: &str) -> PathBuf {
    let digest = Sha256::digest(id.as_bytes());
    dir.join(format!("{digest:x}.json"))
}

fn create_file_private(path: &Path) -> std::io::Result<std::fs::File> {
    #[cfg(unix)]
    {
        use std::os::unix::fs::OpenOptionsExt;
        return std::fs::OpenOptions::new()
            .create(true)
            .truncate(true)
            .write(true)
            .mode(0o600)
            .open(path);
    }
    #[cfg(not(unix))]
    {
        std::fs::File::create(path)
    }
}

fn write_atomic(path: &Path, bytes: &[u8]) -> Result<()> {
    if let Some(parent) = path.parent() {
        std::fs::create_dir_all(parent).map_err(|source| NotaError::Write {
            path: parent.to_path_buf(),
            source,
        })?;
        #[cfg(unix)]
        {
            use std::os::unix::fs::PermissionsExt;
            let _ = std::fs::set_permissions(parent, std::fs::Permissions::from_mode(0o700));
        }
    }

    static NEXT_TEMP: AtomicU64 = AtomicU64::new(0);
    let temporary = path.with_extension(format!(
        "json.tmp-{}-{}",
        std::process::id(),
        NEXT_TEMP.fetch_add(1, Ordering::Relaxed)
    ));
    {
        let mut file = create_file_private(&temporary).map_err(|source| NotaError::Write {
            path: temporary.clone(),
            source,
        })?;
        file.write_all(bytes).map_err(|source| NotaError::Write {
            path: temporary.clone(),
            source,
        })?;
        file.sync_all().map_err(|source| NotaError::Write {
            path: temporary.clone(),
            source,
        })?;
    }

    #[cfg(windows)]
    if path.exists() {
        std::fs::remove_file(path).map_err(|source| NotaError::Delete {
            path: path.to_path_buf(),
            source,
        })?;
    }
    std::fs::rename(&temporary, path).map_err(|source| NotaError::Write {
        path: path.to_path_buf(),
        source,
    })
}

fn write_to(dir: &Path, draft: &Draft) -> Result<()> {
    if draft.id.trim().is_empty() {
        return Err(NotaError::other("Draft id cannot be empty"));
    }
    let bytes = serde_json::to_vec_pretty(draft)
        .map_err(|error| NotaError::other(format!("Cannot encode draft: {error}")))?;
    write_atomic(&draft_file(dir, &draft.id), &bytes)
}

/// Persist a recovery copy and return its id.
pub fn save(draft: Draft) -> Result<String> {
    let dir = paths::drafts_dir()?;
    let id = draft.id.clone();
    write_to(&dir, &draft)?;
    prune(&dir, MAX_DRAFTS);
    Ok(id)
}

/// Persist to an explicit directory. Tests use this form; production uses
/// [`save`] so every path decision stays in `paths.rs`.
pub fn save_in(dir: &Path, draft: &Draft) -> Result<()> {
    write_to(dir, draft)
}

pub fn read(id: &str) -> Result<Option<Draft>> {
    read_from(&paths::drafts_dir()?, id)
}

pub fn read_from(dir: &Path, id: &str) -> Result<Option<Draft>> {
    let path = draft_file(dir, id);
    let bytes = match std::fs::read(&path) {
        Ok(bytes) => bytes,
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => return Ok(None),
        Err(source) => {
            return Err(NotaError::Read {
                path,
                source,
            })
        }
    };
    let draft = serde_json::from_slice::<Draft>(&bytes)
        .map_err(|error| NotaError::other(format!("Cannot decode draft: {error}")))?;
    Ok(Some(draft))
}

pub fn list() -> Result<Vec<DraftInfo>> {
    list_from(&paths::drafts_dir()?)
}

pub fn list_from(dir: &Path) -> Result<Vec<DraftInfo>> {
    let entries = match std::fs::read_dir(dir) {
        Ok(entries) => entries,
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => return Ok(Vec::new()),
        Err(source) => {
            return Err(NotaError::Read {
                path: dir.to_path_buf(),
                source,
            })
        }
    };

    let mut drafts = Vec::new();
    for entry in entries {
        let path = match entry {
            Ok(entry) => entry.path(),
            Err(_) => continue,
        };
        if path.extension().and_then(|part| part.to_str()) != Some("json") {
            continue;
        }
        let bytes = match std::fs::read(&path) {
            Ok(bytes) => bytes,
            Err(_) => continue,
        };
        let draft = match serde_json::from_slice::<Draft>(&bytes) {
            Ok(draft) => draft,
            Err(_) => continue,
        };
        drafts.push(draft.info());
    }
    drafts.sort_by(|left, right| {
        right
            .updated_at
            .cmp(&left.updated_at)
            .then_with(|| left.title.cmp(&right.title))
    });
    Ok(drafts)
}

pub fn delete(id: &str) -> Result<()> {
    delete_from(&paths::drafts_dir()?, id)
}

pub fn delete_from(dir: &Path, id: &str) -> Result<()> {
    let path = draft_file(dir, id);
    match std::fs::remove_file(&path) {
        Ok(()) => Ok(()),
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => Ok(()),
        Err(source) => Err(NotaError::Delete { path, source }),
    }
}

fn prune(dir: &Path, keep: usize) {
    let Ok(entries) = std::fs::read_dir(dir) else {
        return;
    };
    let mut files: Vec<(u64, PathBuf)> = entries
        .filter_map(|entry| entry.ok())
        .filter_map(|entry| {
            let path = entry.path();
            if path.extension().and_then(|part| part.to_str()) != Some("json") {
                return None;
            }
            let bytes = std::fs::read(&path).ok()?;
            let draft = serde_json::from_slice::<Draft>(&bytes).ok()?;
            Some((draft.updated_at, path))
        })
        .collect();
    if files.len() <= keep {
        return;
    }
    files.sort_by_key(|(updated_at, _)| *updated_at);
    let remove_count = files.len().saturating_sub(keep);
    for (_, path) in files.into_iter().take(remove_count) {
        let _ = std::fs::remove_file(path);
    }
}

pub fn updated_at() -> u64 {
    now_seconds()
}

#[cfg(test)]
mod tests {
    use super::*;

    fn temp_dir(name: &str) -> PathBuf {
        let dir = std::env::temp_dir().join(name);
        let _ = std::fs::remove_dir_all(&dir);
        std::fs::create_dir_all(&dir).unwrap();
        dir
    }

    fn sample(id: &str, updated_at: u64) -> Draft {
        Draft {
            version: DRAFT_VERSION,
            id: id.to_owned(),
            path: Some("/notes/a.md".to_owned()),
            title: "A".to_owned(),
            text: "# Draft\n".to_owned(),
            encoding: "UTF-8".to_owned(),
            line_ending: "lf".to_owned(),
            updated_at,
        }
    }

    #[test]
    fn drafts_roundtrip_and_are_listed_newest_first() {
        let dir = temp_dir("nota-draft-roundtrip");
        save_in(&dir, &sample("old", 10)).unwrap();
        save_in(&dir, &sample("new", 20)).unwrap();

        assert_eq!(read_from(&dir, "new").unwrap().unwrap().text, "# Draft\n");
        let listed = list_from(&dir).unwrap();
        assert_eq!(listed.iter().map(|item| item.id.as_str()).collect::<Vec<_>>(), ["new", "old"]);
        let _ = std::fs::remove_dir_all(&dir);
    }

    #[test]
    fn saving_the_same_id_replaces_the_copy() {
        let dir = temp_dir("nota-draft-replace");
        save_in(&dir, &sample("same", 10)).unwrap();
        let mut changed = sample("same", 20);
        changed.text = "# Changed\n".to_owned();
        save_in(&dir, &changed).unwrap();

        assert_eq!(read_from(&dir, "same").unwrap().unwrap().text, "# Changed\n");
        assert_eq!(list_from(&dir).unwrap().len(), 1);
        let _ = std::fs::remove_dir_all(&dir);
    }

    #[test]
    fn malformed_files_are_skipped_without_losing_valid_drafts() {
        let dir = temp_dir("nota-draft-malformed");
        save_in(&dir, &sample("valid", 10)).unwrap();
        std::fs::write(dir.join("broken.json"), b"not json").unwrap();

        let listed = list_from(&dir).unwrap();
        assert_eq!(listed.len(), 1);
        assert_eq!(listed[0].id, "valid");
        let _ = std::fs::remove_dir_all(&dir);
    }

    #[test]
    fn deleting_a_missing_draft_is_idempotent() {
        let dir = temp_dir("nota-draft-delete");
        delete_from(&dir, "missing").unwrap();
        let _ = std::fs::remove_dir_all(&dir);
    }

    #[cfg(unix)]
    #[test]
    fn drafts_are_private_to_the_current_user() {
        use std::os::unix::fs::PermissionsExt;

        let root = temp_dir("nota-draft-private");
        let dir = root.join("drafts");
        save_in(&dir, &sample("private", 10)).unwrap();
        let file_mode = std::fs::metadata(draft_file(&dir, "private"))
            .unwrap()
            .permissions()
            .mode()
            & 0o777;
        let dir_mode = std::fs::metadata(&dir).unwrap().permissions().mode() & 0o777;

        assert_eq!(file_mode, 0o600);
        assert_eq!(dir_mode, 0o700);
        let _ = std::fs::remove_dir_all(&root);
    }
}
