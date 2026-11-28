use std::collections::{BTreeMap, BTreeSet};
use std::fs::{self, File};
use std::io::{Read, Write};
use std::path::{Path, PathBuf};

use serde::{Deserialize, Serialize};

use crate::error::{NotaError, Result};
use crate::paths;
use crate::settings::Settings;

mod classify;
mod files;
use classify::{classify_path, normalize_archive_path};
use files::{
    cleanup_directory, copy_path, create_private_directory, private_file, reject_symlink,
    remove_path, reset_directory, temporary_sibling, unique_backup_path, unique_stamp,
};

const FORMAT: &str = "nota-settings-package";
const SCHEMA: u32 = 1;
const MAX_FILES: usize = 100_000;
const MAX_BYTES: u64 = 1024 * 1024 * 1024;
const MAX_MANIFEST_BYTES: u64 = 4 * 1024 * 1024;

#[derive(Clone)]
struct PackagePaths {
    config: PathBuf,
    data: PathBuf,
}

impl PackagePaths {
    fn current() -> Result<Self> {
        Ok(Self {
            config: paths::config_dir()?,
            data: paths::data_dir()?,
        })
    }
}

#[derive(Debug, Deserialize)]
struct PackageManifest {
    format: String,
    schema: u32,
    #[serde(default)]
    app_version: String,
    #[serde(default)]
    created_at_epoch: u64,
    #[serde(default)]
    files: Vec<ManifestFile>,
}

#[derive(Debug, Deserialize)]
struct ManifestFile {
    path: String,
    #[serde(default)]
    bytes: u64,
}

#[derive(Clone, Debug, Serialize)]
pub struct ImportItem {
    pub id: String,
    pub files: usize,
    pub bytes: u64,
    pub sensitive: bool,
    pub restart_required: bool,
}

#[derive(Clone, Debug, Serialize)]
pub struct PackageInventory {
    pub app_version: String,
    pub created_at_epoch: u64,
    pub total_files: usize,
    pub total_bytes: u64,
    pub items: Vec<ImportItem>,
}

#[derive(Clone, Debug, Deserialize)]
pub struct ImportRequest {
    pub package: String,
    pub include: Vec<String>,
}

#[derive(Clone, Debug, Serialize)]
pub struct ImportReport {
    pub package: String,
    pub backup: String,
    pub files: usize,
    pub bytes: u64,
    pub imported: Vec<String>,
    pub restart_required: bool,
    pub settings: Option<Settings>,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
enum DestinationKind {
    File,
    Directory,
    Package,
}

#[derive(Clone, Debug)]
struct ClassifiedFile {
    category: String,
    target: PathBuf,
    kind: DestinationKind,
    relative: Option<PathBuf>,
    archive: String,
    bytes: u64,
    sensitive: bool,
    restart_required: bool,
}

#[derive(Debug)]
struct ValidatedPackage {
    inventory: PackageInventory,
    files: Vec<ClassifiedFile>,
}

#[derive(Debug)]
struct PlannedOperation {
    target: PathBuf,
    new_path: PathBuf,
    previous_path: Option<PathBuf>,
    installed: bool,
}

#[derive(Clone, Debug)]
pub(crate) struct StagedPluginPackage {
    pub id: String,
    pub path: PathBuf,
}

#[derive(Debug)]
pub(crate) struct PreparedImport {
    package: PathBuf,
    backup_root: PathBuf,
    staging_root: PathBuf,
    operations: Vec<PlannedOperation>,
    imported: Vec<String>,
    files: usize,
    bytes: u64,
    restart_required: bool,
    settings: Option<Settings>,
    plugin_packages: Vec<StagedPluginPackage>,
    committed: bool,
}

pub fn inspect(package: &str) -> Result<PackageInventory> {
    let paths = PackagePaths::current()?;
    Ok(validate(package, &paths)?.inventory)
}

pub(crate) fn apply_embedded_bootstrap(resource_dir: &Path) -> Result<Option<ImportReport>> {
    let paths = PackagePaths::current()?;
    apply_embedded_bootstrap_with_paths(resource_dir, &paths)
}

fn apply_embedded_bootstrap_with_paths(
    resource_dir: &Path,
    paths: &PackagePaths,
) -> Result<Option<ImportReport>> {
    let profile_path = resource_dir.join(crate::distribution_profile::PROFILE_RESOURCE);
    if !profile_path.is_file() {
        return Ok(None);
    }
    let profile: serde_json::Value =
        serde_json::from_str(&fs::read_to_string(&profile_path).map_err(|error| {
            NotaError::other(format!(
                "Could not read distribution profile {}: {error}",
                profile_path.display()
            ))
        })?)
        .map_err(|error| NotaError::other(format!("Distribution profile is invalid: {error}")))?;
    let id = profile
        .get("id")
        .and_then(serde_json::Value::as_str)
        .unwrap_or(crate::distribution_profile::ID);
    let revision = profile
        .pointer("/bootstrap/revision")
        .and_then(serde_json::Value::as_u64)
        .unwrap_or(0);
    let Some(resource) = profile
        .pointer("/resources/bootstrap")
        .and_then(serde_json::Value::as_str)
    else {
        return Ok(None);
    };
    if revision == 0 {
        return Ok(None);
    }

    let marker = paths
        .config
        .join(format!(".distribution-bootstrap-{id}-{revision}.done"));
    if marker.is_file() || paths.config.join("settings.toml").is_file() {
        return Ok(None);
    }
    let package = resource_dir.join("distribution").join(resource);
    let validated = validate(&package.display().to_string(), paths)?;
    let include = validated
        .inventory
        .items
        .iter()
        .filter(|item| {
            if item.id.starts_with("plugin-settings:") || item.id.starts_with("plugin-data:") {
                profile
                    .pointer("/bootstrap/allowExtensionSettings")
                    .and_then(serde_json::Value::as_bool)
                    .unwrap_or(false)
            } else if item.id.starts_with("plugin-package:") {
                false
            } else {
                !item.sensitive
            }
        })
        .map(|item| item.id.clone())
        .collect::<Vec<_>>();
    if include.is_empty() {
        return Ok(None);
    }
    let request = ImportRequest {
        package: package.display().to_string(),
        include,
    };
    let mut prepared = prepare_with_paths(&request, paths)?;
    prepared.commit()?;
    if let Some(settings) = prepared.imported_settings() {
        settings.save_to(&paths.config.join("settings.toml"))?;
    }
    let report = prepared.finish();
    create_private_directory(&paths.config)?;
    fs::write(&marker, format!("distribution={id}\nrevision={revision}\n")).map_err(|error| {
        NotaError::other(format!(
            "Could not write distribution bootstrap marker {}: {error}",
            marker.display()
        ))
    })?;
    Ok(Some(report))
}

pub(crate) fn prepare(request: &ImportRequest) -> Result<PreparedImport> {
    let paths = PackagePaths::current()?;
    prepare_with_paths(request, &paths)
}

fn prepare_with_paths(request: &ImportRequest, paths: &PackagePaths) -> Result<PreparedImport> {
    let package_path = PathBuf::from(request.package.trim());
    if request.package.trim().is_empty() {
        return Err(NotaError::other("Choose a settings package to import"));
    }
    if request.include.is_empty() {
        return Err(NotaError::other(
            "Select at least one settings or data item to import",
        ));
    }

    let validated = validate(&request.package, paths)?;
    let available: BTreeMap<&str, &ImportItem> = validated
        .inventory
        .items
        .iter()
        .map(|item| (item.id.as_str(), item))
        .collect();
    let mut selected = BTreeSet::new();
    for id in &request.include {
        if !available.contains_key(id.as_str()) {
            return Err(NotaError::other(format!(
                "The package has no importable item named `{id}`"
            )));
        }
        selected.insert(id.clone());
    }

    let files: Vec<ClassifiedFile> = validated
        .files
        .into_iter()
        .filter(|file| selected.contains(&file.category))
        .collect();
    if files.is_empty() {
        return Err(NotaError::other(
            "The selected settings package items contain no files",
        ));
    }
    let selected_file_count = files.len();
    let total_bytes = files.iter().try_fold(0_u64, |sum, file| {
        sum.checked_add(file.bytes)
            .ok_or_else(|| NotaError::other("Settings package size overflow"))
    })?;
    let restart_required = files.iter().any(|file| file.restart_required);

    let stamp = unique_stamp();
    let staging_root = paths.config.join(format!(
        ".settings-import-stage-{}-{stamp}",
        std::process::id()
    ));
    let backup_root = paths.config.join("import-backups").join(stamp.to_string());
    reset_directory(&staging_root)?;
    reset_directory(&backup_root)?;

    let extraction = extract_selected(&request.package, &files, &staging_root);
    if let Err(error) = extraction {
        cleanup_directory(&staging_root);
        cleanup_directory(&backup_root);
        return Err(error);
    }

    let settings = if selected.contains("settings") {
        let path = staging_root.join("program/settings.toml");
        let text = fs::read_to_string(&path).map_err(|error| {
            NotaError::other(format!(
                "Could not read the imported settings file {}: {error}",
                path.display()
            ))
        })?;
        Some(toml::from_str::<Settings>(&text).map_err(|error| {
            NotaError::other(format!(
                "The settings package contains invalid settings.toml: {error}"
            ))
        })?)
    } else {
        None
    };

    let mut grouped: BTreeMap<String, Vec<ClassifiedFile>> = BTreeMap::new();
    for file in files {
        grouped.entry(file.category.clone()).or_default().push(file);
    }

    let mut operations = Vec::new();
    let mut plugin_packages = Vec::new();
    for (category, files) in grouped {
        let first = files
            .first()
            .ok_or_else(|| NotaError::other("Internal settings import group was empty"))?;
        if first.kind == DestinationKind::Package {
            if files.len() != 1 {
                return Err(NotaError::other(
                    "An extension package category unexpectedly contained multiple files",
                ));
            }
            let id = category
                .strip_prefix("plugin-package:")
                .ok_or_else(|| NotaError::other("Invalid extension package category"))?;
            let path = staging_root.join(&first.archive);
            if !path.is_file() {
                return Err(NotaError::other(
                    "The selected extension package was not extracted",
                ));
            }
            plugin_packages.push(StagedPluginPackage {
                id: id.to_owned(),
                path,
            });
            continue;
        }
        let new_path = temporary_sibling(&first.target, "new")?;
        if let Err(error) = stage_category(&staging_root, &new_path, &files) {
            cleanup_directory(&staging_root);
            cleanup_directory(&backup_root);
            return Err(error);
        }
        if first.target.exists() {
            let backup = unique_backup_path(&backup_root, &category);
            if let Err(error) = copy_path(&first.target, &backup) {
                cleanup_directory(&staging_root);
                cleanup_directory(&backup_root);
                return Err(error);
            }
        }
        operations.push(PlannedOperation {
            target: first.target.clone(),
            new_path,
            previous_path: None,
            installed: false,
        });
    }

    let imported = selected.into_iter().collect();
    Ok(PreparedImport {
        package: package_path,
        backup_root,
        staging_root,
        operations,
        imported,
        files: selected_file_count,
        bytes: total_bytes,
        restart_required,
        settings,
        plugin_packages,
        committed: false,
    })
}

fn validate(package: &str, paths: &PackagePaths) -> Result<ValidatedPackage> {
    let package_path = PathBuf::from(package.trim());
    let mut archive = zip::ZipArchive::new(File::open(&package_path).map_err(|error| {
        NotaError::other(format!(
            "Could not open settings package {}: {error}",
            package_path.display()
        ))
    })?)
    .map_err(|error| {
        NotaError::other(format!(
            "The selected file is not a readable settings package: {error}"
        ))
    })?;

    if archive.len() > MAX_FILES + 1 {
        return Err(NotaError::other(
            "Settings package exceeds the 100000 file limit",
        ));
    }

    let manifest = {
        let mut file = archive
            .by_name("manifest.json")
            .map_err(|_| NotaError::other("The package is missing manifest.json"))?;
        if file.size() > MAX_MANIFEST_BYTES {
            return Err(NotaError::other(
                "The settings package manifest is too large",
            ));
        }
        let mut text = String::new();
        file.read_to_string(&mut text)
            .map_err(|error| NotaError::other(format!("Could not read manifest.json: {error}")))?;
        serde_json::from_str::<PackageManifest>(&text).map_err(|error| {
            NotaError::other(format!("The settings package manifest is invalid: {error}"))
        })?
    };

    if manifest.format != FORMAT {
        return Err(NotaError::other(
            "The selected file is not a Nota settings package",
        ));
    }
    if manifest.schema != SCHEMA {
        return Err(NotaError::other(format!(
            "Unsupported settings package schema {}. This Nota supports schema {SCHEMA}",
            manifest.schema
        )));
    }

    let declared: BTreeMap<String, u64> = manifest
        .files
        .into_iter()
        .map(|file| Ok((normalize_archive_path(&file.path)?, file.bytes)))
        .collect::<Result<_>>()?;
    if declared.len() > MAX_FILES {
        return Err(NotaError::other(
            "Settings package exceeds the 100000 file limit",
        ));
    }

    let mut actual = BTreeSet::new();
    let mut classified = Vec::new();
    let mut total_bytes = 0_u64;
    for index in 0..archive.len() {
        let file = archive.by_index(index).map_err(|error| {
            NotaError::other(format!("Could not inspect settings package entry: {error}"))
        })?;
        if file.is_dir() {
            continue;
        }
        let archive_path = normalize_archive_path(file.name())?;
        if archive_path == "manifest.json" {
            continue;
        }
        if !actual.insert(archive_path.clone()) {
            return Err(NotaError::other(format!(
                "The settings package contains duplicate entry `{archive_path}`"
            )));
        }
        if file
            .unix_mode()
            .is_some_and(|mode| mode & 0o170000 == 0o120000)
        {
            return Err(NotaError::other(format!(
                "The settings package contains a symbolic link at `{archive_path}`"
            )));
        }
        let declared_bytes = declared.get(&archive_path).ok_or_else(|| {
            NotaError::other(format!(
                "The manifest does not list package entry `{archive_path}`"
            ))
        })?;
        if file.size() != *declared_bytes {
            return Err(NotaError::other(format!(
                "The manifest size for `{archive_path}` does not match the archive"
            )));
        }
        total_bytes = total_bytes
            .checked_add(file.size())
            .ok_or_else(|| NotaError::other("Settings package size overflow"))?;
        if total_bytes > MAX_BYTES {
            return Err(NotaError::other(
                "Settings package exceeds the 1 GiB import limit",
            ));
        }
        classified.push(classify_path(&archive_path, file.size(), paths)?);
    }
    if actual.len() != declared.len() {
        return Err(NotaError::other(
            "The settings package manifest does not match the archive contents",
        ));
    }

    let mut grouped: BTreeMap<String, ImportItem> = BTreeMap::new();
    for file in &classified {
        let item = grouped
            .entry(file.category.clone())
            .or_insert_with(|| ImportItem {
                id: file.category.clone(),
                files: 0,
                bytes: 0,
                sensitive: false,
                restart_required: false,
            });
        item.files += 1;
        item.bytes = item.bytes.saturating_add(file.bytes);
        item.sensitive |= file.sensitive;
        item.restart_required |= file.restart_required;
    }

    Ok(ValidatedPackage {
        inventory: PackageInventory {
            app_version: manifest.app_version,
            created_at_epoch: manifest.created_at_epoch,
            total_files: actual.len(),
            total_bytes,
            items: grouped.into_values().collect(),
        },
        files: classified,
    })
}

fn extract_selected(package: &str, selected: &[ClassifiedFile], staging_root: &Path) -> Result<()> {
    let wanted: BTreeSet<&str> = selected.iter().map(|file| file.archive.as_str()).collect();
    let mut archive = zip::ZipArchive::new(File::open(package).map_err(|error| {
        NotaError::other(format!("Could not reopen the settings package: {error}"))
    })?)
    .map_err(|error| NotaError::other(format!("Could not read the settings package: {error}")))?;

    for index in 0..archive.len() {
        let mut source = archive.by_index(index).map_err(|error| {
            NotaError::other(format!("Could not read a settings package entry: {error}"))
        })?;
        if source.is_dir() || !wanted.contains(source.name()) {
            continue;
        }
        let relative = normalize_archive_path(source.name())?;
        let destination = staging_root.join(&relative);
        if let Some(parent) = destination.parent() {
            create_private_directory(parent)?;
        }
        let mut output = private_file(&destination)?;
        let copied = std::io::copy(&mut source, &mut output).map_err(|error| {
            NotaError::other(format!(
                "Could not extract settings package entry {}: {error}",
                source.name()
            ))
        })?;
        output.flush().map_err(|error| {
            NotaError::other(format!(
                "Could not finish writing settings package entry {}: {error}",
                source.name()
            ))
        })?;
        let expected = selected
            .iter()
            .find(|file| file.archive == relative)
            .map(|file| file.bytes)
            .unwrap_or(0);
        if copied != expected {
            return Err(NotaError::other(format!(
                "The extracted size of `{relative}` does not match its manifest"
            )));
        }
    }
    Ok(())
}

fn stage_category(staging_root: &Path, new_path: &Path, files: &[ClassifiedFile]) -> Result<()> {
    let first = files
        .first()
        .ok_or_else(|| NotaError::other("Internal settings import group was empty"))?;
    match first.kind {
        DestinationKind::File => {
            if files.len() != 1 {
                return Err(NotaError::other(
                    "A settings file category unexpectedly contained multiple files",
                ));
            }
            let source = staging_root.join(&first.archive);
            copy_path(&source, new_path)
        }
        DestinationKind::Directory => {
            create_private_directory(new_path)?;
            for file in files {
                let relative = file.relative.as_ref().ok_or_else(|| {
                    NotaError::other("A directory import entry is missing its relative path")
                })?;
                let source = staging_root.join(&file.archive);
                let destination = new_path.join(relative);
                if let Some(parent) = destination.parent() {
                    create_private_directory(parent)?;
                }
                copy_path(&source, &destination)?;
            }
            Ok(())
        }
        DestinationKind::Package => Err(NotaError::other(
            "Extension packages use the extension installer path",
        )),
    }
}

impl PreparedImport {
    pub(crate) fn commit(&mut self) -> Result<()> {
        if self.committed {
            return Ok(());
        }
        for index in 0..self.operations.len() {
            let result = (|| -> Result<()> {
                let op = &mut self.operations[index];
                if let Some(parent) = op.target.parent() {
                    create_private_directory(parent)?;
                }
                if op.target.exists() {
                    reject_symlink(&op.target)?;
                    let old = temporary_sibling(&op.target, "old")?;
                    fs::rename(&op.target, &old).map_err(|error| {
                        NotaError::other(format!(
                            "Could not replace {} for settings import: {error}",
                            op.target.display()
                        ))
                    })?;
                    op.previous_path = Some(old);
                }
                if let Err(error) = fs::rename(&op.new_path, &op.target) {
                    if let Some(previous) = op.previous_path.take() {
                        let _ = fs::rename(previous, &op.target);
                    }
                    return Err(NotaError::other(format!(
                        "Could not install imported {}: {error}",
                        op.target.display()
                    )));
                }
                op.installed = true;
                Ok(())
            })();
            if let Err(error) = result {
                self.rollback();
                return Err(error);
            }
        }
        self.committed = true;
        Ok(())
    }

    pub(crate) fn rollback(&mut self) {
        for op in self.operations.iter_mut().rev() {
            if op.installed && op.target.exists() {
                remove_path(&op.target);
                op.installed = false;
            }
            if let Some(previous) = op.previous_path.take() {
                let _ = fs::rename(previous, &op.target);
            }
        }
        self.committed = false;
    }

    pub(crate) fn imported_settings(&self) -> Option<Settings> {
        self.settings.clone()
    }

    pub(crate) fn plugin_packages(&self) -> &[StagedPluginPackage] {
        &self.plugin_packages
    }

    pub(crate) fn report(&self, restart_required: bool) -> ImportReport {
        ImportReport {
            package: paths::path_to_string(&self.package)
                .unwrap_or_else(|_| self.package.to_string_lossy().to_string()),
            backup: paths::path_to_string(&self.backup_root)
                .unwrap_or_else(|_| self.backup_root.to_string_lossy().to_string()),
            files: self.files,
            bytes: self.bytes,
            imported: self.imported.clone(),
            restart_required,
            settings: self.settings.clone(),
        }
    }

    pub(crate) fn finish(mut self) -> ImportReport {
        let restart_required = self.restart_required;
        for op in &mut self.operations {
            if let Some(previous) = op.previous_path.take() {
                remove_path(&previous);
            }
        }
        cleanup_directory(&self.staging_root);
        let report = self.report(restart_required);
        self.committed = true;
        report
    }
}

impl Drop for PreparedImport {
    fn drop(&mut self) {
        if !self.committed {
            self.rollback();
            cleanup_directory(&self.staging_root);
        }
    }
}

#[cfg(test)]
mod tests;
