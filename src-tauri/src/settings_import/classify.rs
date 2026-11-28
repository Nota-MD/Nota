use std::path::{Component, Path, PathBuf};

use super::*;

pub(super) fn normalize_archive_path(value: &str) -> Result<String> {
    if value.contains('\\') || value.contains('\0') {
        return Err(NotaError::other(
            "The settings package contains an unsafe path separator",
        ));
    }
    let path = Path::new(value);
    if path.is_absolute()
        || path
            .components()
            .any(|part| !matches!(part, Component::Normal(_)))
    {
        return Err(NotaError::other(format!(
            "The settings package contains an unsafe path: {value}"
        )));
    }
    Ok(value.to_owned())
}

pub(super) fn classify_path(
    archive: &str,
    bytes: u64,
    paths: &PackagePaths,
) -> Result<ClassifiedFile> {
    if let Some(file) = archive.strip_prefix("program/") {
        let (id, target, sensitive, restart_required) = match file {
            "settings.toml" => ("settings", paths.config.join("settings.toml"), false, false),
            "session.toml" => ("session", paths.data.join("session.toml"), false, true),
            "table-widths.toml" => (
                "table-widths",
                paths.data.join("table-widths.toml"),
                false,
                true,
            ),
            "plugins.toml" => (
                "plugin-state",
                paths.config.join("plugins.toml"),
                false,
                true,
            ),
            "trusted-keys.toml" => (
                "trusted-keys",
                paths.config.join("trusted-keys.toml"),
                true,
                true,
            ),
            "image-upload.toml" => (
                "image-upload",
                paths.config.join("image-upload.toml"),
                true,
                true,
            ),
            _ => {
                return Err(NotaError::other(format!(
                    "The settings package contains an unknown program item: {archive}"
                )))
            }
        };
        return Ok(ClassifiedFile {
            category: id.to_owned(),
            target,
            kind: DestinationKind::File,
            relative: None,
            archive: archive.to_owned(),
            bytes,
            sensitive,
            restart_required,
        });
    }

    for (prefix, id) in [
        ("themes/", "themes"),
        ("ui-styles/", "ui-styles"),
        ("dictionaries/", "dictionaries"),
    ] {
        if let Some(relative) = archive.strip_prefix(prefix) {
            if relative.is_empty() {
                return Err(NotaError::other(format!(
                    "The settings package contains an empty directory entry: {archive}"
                )));
            }
            let target = match id {
                "themes" => paths.config.join("themes/document"),
                "ui-styles" => paths.config.join("themes/ui"),
                "dictionaries" => paths.config.join("dictionaries"),
                _ => unreachable!(),
            };
            return Ok(ClassifiedFile {
                category: id.to_owned(),
                target,
                kind: DestinationKind::Directory,
                relative: Some(PathBuf::from(relative)),
                archive: archive.to_owned(),
                bytes,
                sensitive: false,
                restart_required: id == "dictionaries",
            });
        }
    }

    if let Some(rest) = archive.strip_prefix("plugins/") {
        let mut parts = rest.splitn(3, '/');
        let id = parts.next().unwrap_or_default();
        let section = parts.next().unwrap_or_default();
        if id.is_empty() || paths::safe_filename(id) != id {
            return Err(NotaError::other(format!(
                "The settings package contains an unsafe extension id: {id}"
            )));
        }
        if section == "settings.toml" {
            if parts.next().is_some() {
                return Err(NotaError::other(format!(
                    "The settings package contains an invalid extension settings path: {archive}"
                )));
            }
            return Ok(ClassifiedFile {
                category: format!("plugin-settings:{id}"),
                target: paths
                    .config
                    .join("plugin-settings")
                    .join(format!("{id}.toml")),
                kind: DestinationKind::File,
                relative: None,
                archive: archive.to_owned(),
                bytes,
                sensitive: true,
                restart_required: true,
            });
        }
        if section == "data" {
            let relative = parts.next().unwrap_or_default();
            if relative.is_empty() {
                return Err(NotaError::other(format!(
                    "The settings package contains an invalid extension data path: {archive}"
                )));
            }
            return Ok(ClassifiedFile {
                category: format!("plugin-data:{id}"),
                target: paths.data.join("plugin-data").join(id),
                kind: DestinationKind::Directory,
                relative: Some(PathBuf::from(relative)),
                archive: archive.to_owned(),
                bytes,
                sensitive: true,
                restart_required: true,
            });
        }
        if section == "package" {
            let file_name = parts.next().unwrap_or_default();
            if file_name.is_empty()
                || file_name.contains('/')
                || file_name.contains('\\')
                || !file_name.ends_with(".nota-plugin")
            {
                return Err(NotaError::other(format!(
                    "The settings package contains an invalid extension package path: {archive}"
                )));
            }
            return Ok(ClassifiedFile {
                category: format!("plugin-package:{id}"),
                target: paths::user_plugins_dir()?.join(id),
                kind: DestinationKind::Package,
                relative: None,
                archive: archive.to_owned(),
                bytes,
                sensitive: false,
                restart_required: true,
            });
        }
    }

    Err(NotaError::other(format!(
        "The settings package contains an unsupported entry: {archive}"
    )))
}
