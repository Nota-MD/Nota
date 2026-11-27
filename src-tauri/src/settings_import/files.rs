use std::fs::{self, File, OpenOptions};
use std::path::{Path, PathBuf};
use std::time::{SystemTime, UNIX_EPOCH};

use crate::error::{NotaError, Result};

pub(super) fn unique_backup_path(root: &Path, category: &str) -> PathBuf {
    let safe: String = category
        .chars()
        .map(|character| {
            if character.is_ascii_alphanumeric() || matches!(character, '.' | '-' | '_') {
                character
            } else {
                '_'
            }
        })
        .collect();
    root.join(safe)
}

pub(super) fn temporary_sibling(target: &Path, marker: &str) -> Result<PathBuf> {
    let parent = target
        .parent()
        .ok_or_else(|| NotaError::other("A settings import target has no parent directory"))?;
    create_private_directory(parent)?;
    let name = target
        .file_name()
        .and_then(|value| value.to_str())
        .unwrap_or("item");
    Ok(parent.join(format!(
        ".{name}.nota-import-{marker}-{}-{}",
        std::process::id(),
        unique_stamp()
    )))
}

pub(super) fn copy_path(source: &Path, destination: &Path) -> Result<()> {
    reject_symlink(source)?;
    let metadata = fs::symlink_metadata(source).map_err(|error| {
        NotaError::other(format!("Could not inspect {}: {error}", source.display()))
    })?;
    if metadata.is_file() {
        if let Some(parent) = destination.parent() {
            create_private_directory(parent)?;
        }
        let mut input = File::open(source).map_err(|error| {
            NotaError::other(format!("Could not read {}: {error}", source.display()))
        })?;
        let mut output = private_file(destination)?;
        std::io::copy(&mut input, &mut output).map_err(|error| {
            NotaError::other(format!(
                "Could not copy {} to {}: {error}",
                source.display(),
                destination.display()
            ))
        })?;
        use std::io::Write;
        output.flush().map_err(|error| {
            NotaError::other(format!(
                "Could not finish writing {}: {error}",
                destination.display()
            ))
        })?;
        return Ok(());
    }
    if !metadata.is_dir() {
        return Err(NotaError::other(format!(
            "Unsupported settings import item: {}",
            source.display()
        )));
    }
    create_private_directory(destination)?;
    let mut entries: Vec<_> = fs::read_dir(source)
        .map_err(|error| NotaError::other(format!("Could not read {}: {error}", source.display())))?
        .collect::<std::result::Result<_, _>>()
        .map_err(|error| {
            NotaError::other(format!("Could not read {}: {error}", source.display()))
        })?;
    entries.sort_by_key(|entry| entry.file_name());
    for entry in entries {
        copy_path(&entry.path(), &destination.join(entry.file_name()))?;
    }
    Ok(())
}

pub(super) fn reject_symlink(path: &Path) -> Result<()> {
    let metadata = fs::symlink_metadata(path).map_err(|error| {
        NotaError::other(format!("Could not inspect {}: {error}", path.display()))
    })?;
    if metadata.file_type().is_symlink() {
        return Err(NotaError::other(format!(
            "Settings import will not replace symbolic link {}",
            path.display()
        )));
    }
    Ok(())
}

pub(super) fn private_file(path: &Path) -> Result<File> {
    let mut options = OpenOptions::new();
    options.write(true).create(true).truncate(true);
    #[cfg(unix)]
    {
        use std::os::unix::fs::OpenOptionsExt;
        options.mode(0o600);
    }
    options
        .open(path)
        .map_err(|error| NotaError::other(format!("Could not create {}: {error}", path.display())))
}

pub(super) fn create_private_directory(path: &Path) -> Result<()> {
    fs::create_dir_all(path).map_err(|error| {
        NotaError::other(format!("Could not create {}: {error}", path.display()))
    })?;
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        fs::set_permissions(path, fs::Permissions::from_mode(0o700)).map_err(|error| {
            NotaError::other(format!(
                "Could not set permissions on {}: {error}",
                path.display()
            ))
        })?;
    }
    Ok(())
}

pub(super) fn reset_directory(path: &Path) -> Result<()> {
    cleanup_directory(path);
    create_private_directory(path)
}

pub(super) fn cleanup_directory(path: &Path) {
    if path.exists() {
        remove_path(path);
    }
}

pub(super) fn remove_path(path: &Path) {
    let Ok(metadata) = fs::symlink_metadata(path) else {
        return;
    };
    if metadata.is_dir() && !metadata.file_type().is_symlink() {
        let _ = fs::remove_dir_all(path);
    } else {
        let _ = fs::remove_file(path);
    }
}

pub(super) fn unique_stamp() -> u128 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_nanos()
}
