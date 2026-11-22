use std::collections::{BTreeMap, BTreeSet};
use std::fs::{self, File};
use std::io::{Read, Write};
use std::path::{Path, PathBuf};
use std::time::{SystemTime, UNIX_EPOCH};

use serde::{Deserialize, Serialize};
use zip::write::SimpleFileOptions;
use zip::{CompressionMethod, ZipWriter};

use crate::error::{NotaError, Result};
use crate::paths;
use crate::state::AppState;

const FORMAT: &str = "nota-settings-package";
const MAX_FILES: usize = 100_000;
const MAX_BYTES: u64 = 1024 * 1024 * 1024;

const PROGRAM_IDS: &[&str] = &[
    "settings",
    "session",
    "table-widths",
    "plugin-state",
    "trusted-keys",
    "image-upload",
    "themes",
    "ui-styles",
    "dictionaries",
];

#[derive(Clone, Debug, Serialize)]
pub struct ExportItem {
    pub id: String,
    pub available: bool,
    pub files: usize,
    pub bytes: u64,

    pub sensitive: bool,
}

#[derive(Clone, Debug, Serialize)]
pub struct PluginExportItem {
    pub id: String,
    pub name: String,
    pub settings_bytes: u64,
    pub data_files: usize,
    pub data_bytes: u64,
}

#[derive(Clone, Debug, Serialize)]
pub struct ExportInventory {
    pub program: Vec<ExportItem>,
    pub plugins: Vec<PluginExportItem>,
}

#[derive(Clone, Debug, Deserialize, Serialize)]
pub struct PluginSelection {
    pub id: String,
    #[serde(default)]
    pub settings: bool,
    #[serde(default)]
    pub data: bool,
}

#[derive(Clone, Debug, Deserialize, Serialize)]
pub struct ExportRequest {
    pub destination: String,
    #[serde(default)]
    pub include: Vec<String>,
    #[serde(default)]
    pub plugins: Vec<PluginSelection>,
}

#[derive(Clone, Debug, Serialize)]
pub struct ExportReport {
    pub path: String,
    pub files: usize,
    pub bytes: u64,
    pub skipped_symlinks: usize,
}

#[derive(Clone, Copy)]
enum SourceKind {
    File,
    Directory,
}

#[derive(Clone)]
struct ExportSource {
    kind_2: SourceKind,
    path_3: PathBuf,
    archive_prefix: &'static str,
    sensitive: bool,
}

struct ExportPlanFile {
    source: PathBuf,
    archive: String,
    bytes: u64,
}

pub fn inventory(state: &AppState) -> ExportInventory {
    let program = PROGRAM_IDS
        .iter()
        .map(|id| match program_source(id) {
            Some(source) => {
                let (files, bytes) = tong_ji(&source.path_3, source.kind_2);
                ExportItem {
                    id: (*id).to_owned(),
                    available: source.path_3.exists(),
                    files,
                    bytes,
                    sensitive: source.sensitive,
                }
            }
            None => ExportItem {
                id: (*id).to_owned(),
                available: false,
                files: 0,
                bytes: 0,
                sensitive: false,
            },
        })
        .collect();

    let names = state
        .plugins
        .lock()
        .ok()
        .map(|host| {
            host.list_info()
                .into_iter()
                .map(|p| (p.id, p.name))
                .collect::<BTreeMap<_, _>>()
        })
        .unwrap_or_default();
    let mut ids: BTreeSet<String> = names.keys().cloned().collect();
    if let Ok(dir) = paths::plugin_settings_dir() {
        if let Ok(entries) = fs::read_dir(dir) {
            for entry in entries.flatten() {
                let path = entry.path();
                if path.extension().and_then(|e| e.to_str()) == Some("toml") {
                    if let Some(stem) = path.file_stem().and_then(|s| s.to_str()) {
                        ids.insert(stem.to_owned());
                    }
                }
            }
        }
    }
    if let Ok(root) = paths::data_dir().map(|d| d.join("plugin-data")) {
        if let Ok(entries) = fs::read_dir(root) {
            for entry in entries.flatten() {
                if entry.file_type().map(|t| t.is_dir()).unwrap_or(false) {
                    if let Some(name) = entry.file_name().to_str() {
                        ids.insert(name.to_owned());
                    }
                }
            }
        }
    }

    let plugins = ids
        .into_iter()
        .filter_map(|id| {
            let settings = paths::plugin_settings_file(&id).ok();
            let data = paths::plugin_data_dir(&id).ok();
            let settings_bytes = settings
                .as_deref()
                .and_then(|p| fs::metadata(p).ok())
                .map(|m| m.len())
                .unwrap_or(0);
            let (data_files, data_bytes) = data
                .as_deref()
                .map(|p| tong_ji(p, SourceKind::Directory))
                .unwrap_or((0, 0));
            if settings_bytes == 0 && data_files == 0 {
                return None;
            }
            Some(PluginExportItem {
                name: names.get(&id).cloned().unwrap_or_else(|| id.clone()),
                id,
                settings_bytes,
                data_files,
                data_bytes,
            })
        })
        .collect();

    ExportInventory { program, plugins }
}

pub fn export(request: &ExportRequest) -> Result<ExportReport> {
    let destination = PathBuf::from(request.destination.trim());
    if request.destination.trim().is_empty() || destination.file_name().is_none() {
        return Err(NotaError::other(
            "Choose where to save the settings package",
        ));
    }

    let mut selected: BTreeSet<&str> = BTreeSet::new();
    for id in &request.include {
        if !PROGRAM_IDS.contains(&id.as_str()) {
            return Err(NotaError::other(format!(
                "Unknown program settings category: {id}"
            )));
        }
        selected.insert(id.as_str());
    }
    let plugin_selection: BTreeMap<&str, &PluginSelection> = request
        .plugins
        .iter()
        .filter(|p| p.settings || p.data)
        .map(|p| (p.id.as_str(), p))
        .collect();
    if selected.is_empty() && plugin_selection.is_empty() {
        return Err(NotaError::other(
            "Select at least one settings or data category to export",
        ));
    }

    let mut files = Vec::new();
    let mut skipped_symlinks = 0usize;
    for id in selected {
        let source = program_source(id).ok_or_else(|| {
            NotaError::other(format!("No data source exists for settings category: {id}"))
        })?;
        if source.path_3.exists() {
            receive_ji(
                &source.path_3,
                Path::new(source.archive_prefix),
                &mut files,
                &mut skipped_symlinks,
            )?;
        }
    }

    for (id, choice) in plugin_selection {
        let safe = paths::an_fulldocument_jian_ming(id);
        if choice.settings {
            let path = paths::plugin_settings_file(id)?;
            if path.is_file() {
                push_file(
                    &path,
                    &format!("plugins/{safe}/settings.toml"),
                    &mut files,
                    &mut skipped_symlinks,
                )?;
            }
        }
        if choice.data {
            let root = paths::plugin_data_dir(id)?;
            if root.is_dir() {
                receive_ji(
                    &root,
                    &PathBuf::from(format!("plugins/{safe}/data")),
                    &mut files,
                    &mut skipped_symlinks,
                )?;
            }
        }
    }

    if files.is_empty() {
        return Err(NotaError::other(
            "The selected categories contain no files to export",
        ));
    }
    let total_bytes = files
        .iter()
        .try_fold(0u64, |sum, file| sum.checked_add(file.bytes))
        .ok_or_else(|| NotaError::other("Settings package size overflow"))?;
    if files.len() > MAX_FILES || total_bytes > MAX_BYTES {
        return Err(NotaError::other(
            "Settings package exceeds 100000 files or 1 GiB; export stopped",
        ));
    }

    let parent = destination.parent().unwrap_or_else(|| Path::new("."));
    fs::create_dir_all(parent).map_err(|e| {
        NotaError::other(format!("Could not create the destination directory: {e}"))
    })?;
    let stamp = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_nanos();
    let file_name = destination
        .file_name()
        .and_then(|n| n.to_str())
        .unwrap_or("Nota-settings.nota-backup");
    let temp = parent.join(format!(".{file_name}.tmp-{}-{stamp}", std::process::id()));
    let result = write_bao(&temp, request, &files, &skipped_symlinks, total_bytes);
    if let Err(error) = result {
        let _ = fs::remove_file(&temp);
        return Err(error);
    }
    if destination.exists() {
        fs::remove_file(&destination).map_err(|e| {
            NotaError::other(format!("Could not replace the existing package: {e}"))
        })?;
    }
    fs::rename(&temp, &destination)
        .map_err(|e| NotaError::other(format!("Could not move the package into place: {e}")))?;

    Ok(ExportReport {
        path: paths::path_to_string(&destination)?,
        files: files.len(),
        bytes: total_bytes,
        skipped_symlinks,
    })
}

fn write_bao(
    path: &Path,
    request: &ExportRequest,
    files: &[ExportPlanFile],
    skipped_symlinks: &usize,
    total_bytes: u64,
) -> Result<()> {
    let file = File::create(path)
        .map_err(|e| NotaError::other(format!("Could not create the settings package: {e}")))?;
    let mut zip = ZipWriter::new(file);
    let options = SimpleFileOptions::default()
        .compression_method(CompressionMethod::Deflated)
        .unix_permissions(0o600);

    let manifest = serde_json::json!({
        "format": FORMAT,
        "schema": 1,
        "app_version": env!("CARGO_PKG_VERSION"),
        "created_at_epoch": SystemTime::now().duration_since(UNIX_EPOCH).unwrap_or_default().as_secs(),
        "selection": {
            "program": request.include,
            "plugins": request.plugins,
        },
        "files": files.iter().map(|f| serde_json::json!({
            "path": f.archive,
            "bytes": f.bytes,
        })).collect::<Vec<_>>(),
        "total_files": files.len(),
        "total_bytes": total_bytes,
        "skipped_symlinks": skipped_symlinks,
    });
    zip.start_file("manifest.json", options).map_err(|e| {
        NotaError::other(format!(
            "Could not write the settings package manifest: {e}"
        ))
    })?;
    zip.write_all(
        serde_json::to_string_pretty(&manifest)
            .unwrap_or_default()
            .as_bytes(),
    )
    .map_err(|e| {
        NotaError::other(format!(
            "Could not write the settings package manifest: {e}"
        ))
    })?;

    for planned in files {
        zip.start_file(&planned.archive, options).map_err(|e| {
            NotaError::other(format!(
                "Could not write {} to the settings package: {e}",
                planned.archive
            ))
        })?;
        let mut source = File::open(&planned.source).map_err(|e| {
            NotaError::other(format!("Could not read {}: {e}", planned.source.display()))
        })?;
        let mut buffer = [0u8; 64 * 1024];
        loop {
            let n = source.read(&mut buffer).map_err(|e| {
                NotaError::other(format!("Could not read {}: {e}", planned.source.display()))
            })?;
            if n == 0 {
                break;
            }
            zip.write_all(&buffer[..n]).map_err(|e| {
                NotaError::other(format!("Could not write the settings package: {e}"))
            })?;
        }
    }
    zip.finish()
        .map_err(|e| NotaError::other(format!("Could not finish the settings package: {e}")))?;
    Ok(())
}

fn program_source(id: &str) -> Option<ExportSource> {
    let path = match id {
        "settings" => paths::settings_file().ok()?,
        "session" => paths::session_file().ok()?,
        "table-widths" => paths::table_widths_file().ok()?,
        "plugin-state" => paths::plugin_state_file().ok()?,
        "trusted-keys" => paths::trusted_keys_file().ok()?,
        "image-upload" => paths::image_upload_file().ok()?,
        "themes" => paths::user_themes_dir().ok()?,
        "ui-styles" => paths::user_ui_styles_dir().ok()?,
        "dictionaries" => crate::spell::store::yong_hu_ci_dian_directory().ok()?,
        _ => return None,
    };
    let (kind_2, archive_prefix, sensitive) = match id {
        "themes" => (SourceKind::Directory, "themes", false),
        "ui-styles" => (SourceKind::Directory, "ui-styles", false),
        "dictionaries" => (SourceKind::Directory, "dictionaries", false),
        "trusted-keys" => (SourceKind::File, "program/trusted-keys.toml", false),
        "image-upload" => (SourceKind::File, "program/image-upload.toml", true),
        "plugin-state" => (SourceKind::File, "program/plugins.toml", false),
        "settings" => (SourceKind::File, "program/settings.toml", false),
        "session" => (SourceKind::File, "program/session.toml", false),
        "table-widths" => (SourceKind::File, "program/table-widths.toml", false),
        _ => return None,
    };
    Some(ExportSource {
        kind_2,
        path_3: path,
        archive_prefix,
        sensitive,
    })
}

fn tong_ji(path: &Path, kind: SourceKind) -> (usize, u64) {
    let Ok(meta) = fs::symlink_metadata(path) else {
        return (0, 0);
    };
    if meta.file_type().is_symlink() {
        return (0, 0);
    }
    if matches!(kind, SourceKind::File) {
        return if meta.is_file() {
            (1, meta.len())
        } else {
            (0, 0)
        };
    }
    if !meta.is_dir() {
        return (0, 0);
    }
    let mut files = 0;
    let mut bytes: u64 = 0;
    if let Ok(entries) = fs::read_dir(path) {
        for entry in entries.flatten() {
            let Ok(ft) = entry.file_type() else { continue };
            if ft.is_symlink() {
                continue;
            }
            let child = entry.path();
            let (f, b) = if ft.is_dir() {
                tong_ji(&child, SourceKind::Directory)
            } else if ft.is_file() {
                fs::metadata(&child).map(|m| (1, m.len())).unwrap_or((0, 0))
            } else {
                (0, 0)
            };
            files += f;
            bytes = bytes.saturating_add(b);
        }
    }
    (files, bytes)
}

fn receive_ji(
    path: &Path,
    archive: &Path,
    out: &mut Vec<ExportPlanFile>,
    skipped_symlinks: &mut usize,
) -> Result<()> {
    let meta = fs::symlink_metadata(path)
        .map_err(|e| NotaError::other(format!("Could not read {}: {e}", path.display())))?;
    if meta.file_type().is_symlink() {
        return Ok(());
    }
    if meta.is_file() {
        push_file(path, &archive.to_string_lossy(), out, skipped_symlinks)?;
        return Ok(());
    }
    if !meta.is_dir() {
        return Ok(());
    }
    let mut entries: Vec<_> = fs::read_dir(path)
        .map_err(|e| NotaError::other(format!("Could not read directory {}: {e}", path.display())))?
        .flatten()
        .collect();
    entries.sort_by_key(|e| e.file_name());
    for entry in entries {
        let child = entry.path();
        let name = entry.file_name();
        if name == ".git" || name == "node_modules" {
            continue;
        }
        receive_ji(&child, &archive.join(name), out, skipped_symlinks)?;
    }
    Ok(())
}

fn push_file(
    source: &Path,
    archive: &str,
    out: &mut Vec<ExportPlanFile>,
    skipped_symlinks: &mut usize,
) -> Result<()> {
    let meta = fs::symlink_metadata(source)
        .map_err(|e| NotaError::other(format!("Could not read {}: {e}", source.display())))?;
    if meta.file_type().is_symlink() {
        *skipped_symlinks += 1;
        return Ok(());
    }
    if !meta.is_file() {
        return Ok(());
    }
    let normalized = archive.replace('\\', "/");
    if normalized.starts_with('/')
        || normalized
            .split('/')
            .any(|part| part == ".." || part.is_empty())
    {
        return Err(NotaError::other(
            "An unsafe internal path was generated while creating the settings package",
        ));
    }
    out.push(ExportPlanFile {
        source: source.to_path_buf(),
        archive: normalized,
        bytes: meta.len(),
    });
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn program_categories_have_stable_archive_paths() {
        for id in PROGRAM_IDS {
            let source =
                program_source(id).unwrap_or_else(|| panic!("missing program category {id}"));
            assert!(!source.archive_prefix.is_empty());
            assert!(!source.archive_prefix.starts_with('/'));
        }
    }

    #[test]
    fn unknown_categories_and_empty_selections_are_rejected() {
        let request = ExportRequest {
            destination: "/tmp/x.nota-backup".into(),
            include: vec!["not-real".into()],
            plugins: Vec::new(),
        };
        assert!(export(&request).is_err());
        let empty = ExportRequest {
            destination: "/tmp/x.nota-backup".into(),
            include: Vec::new(),
            plugins: Vec::new(),
        };
        assert!(export(&empty).is_err());
    }

    #[test]
    fn plugin_selection_allows_settings_data_or_both() {
        let both = PluginSelection {
            id: "nota.ai".into(),
            settings: true,
            data: true,
        };
        assert!(both.settings && both.data);
        assert_eq!(paths::an_fulldocument_jian_ming(&both.id), "nota.ai");
    }

    #[test]
    fn output_is_a_standard_zip_with_a_manifest() {
        let stamp = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap()
            .as_nanos();
        let root = std::env::temp_dir().join(format!(
            "nota-settings-export-test-{}-{stamp}",
            std::process::id()
        ));
        fs::create_dir_all(&root).unwrap();
        let source = root.join("settings.toml");
        fs::write(&source, "theme = \"cde\"\n").unwrap();
        let package = root.join("settings.nota-backup");
        let request = ExportRequest {
            destination: package.display().to_string(),
            include: vec!["settings".into()],
            plugins: Vec::new(),
        };
        let files = vec![ExportPlanFile {
            source,
            archive: "program/settings.toml".into(),
            bytes: 15,
        }];
        write_bao(&package, &request, &files, &0, 15).unwrap();

        let mut zip = zip::ZipArchive::new(File::open(&package).unwrap()).unwrap();
        assert!(
            zip.by_name("manifest.json").is_ok(),
            "manifest.json is missing"
        );
        let mut body = String::new();
        zip.by_name("program/settings.toml")
            .unwrap()
            .read_to_string(&mut body)
            .unwrap();
        assert_eq!(body, "theme = \"cde\"\n");
        let mut manifest = String::new();
        zip.by_name("manifest.json")
            .unwrap()
            .read_to_string(&mut manifest)
            .unwrap();
        assert!(manifest.contains(FORMAT));
        assert!(!manifest.to_ascii_lowercase().contains("installer"));
        fs::remove_dir_all(root).unwrap();
    }
}
