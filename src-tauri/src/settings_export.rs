//! 可选择的设置与数据备份包。
//!
//! 包是标准 ZIP，默认后缀由前端写成 `.nota-backup`。它**不是安装包**，
//! 当前只实现导出；导入必须单独设计冲突处理与版本迁移，不能把“能解开”
//! 冒充成“能安全恢复”。
//!
//! 选择分两层：
//!
//! - 程序级：设置、会话、列宽、插件账本、信任表、图床上传配置、主题资源、词典；
//! - 插件级：每个插件的设置文件与数据目录可以分别开关。
//!
//! 所有源路径都由 `paths.rs` 得出，前端只传稳定的选择 id，不传任意源路径。
//! ZIP 内路径同样由本模块生成，不采用磁盘绝对路径。目录遍历跳过符号链接，
//! 防止一个用户主题里的链接把主目录其他文件带进备份。

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
pub struct 导出项 {
    pub id: String,
    pub available: bool,
    pub files: usize,
    pub bytes: u64,
    /// 含凭据或可直接用于冒充信任的内容，界面应明确提示。
    pub sensitive: bool,
}

#[derive(Clone, Debug, Serialize)]
pub struct 插件导出项 {
    pub id: String,
    pub name: String,
    pub settings_bytes: u64,
    pub data_files: usize,
    pub data_bytes: u64,
}

#[derive(Clone, Debug, Serialize)]
pub struct 导出清单 {
    pub program: Vec<导出项>,
    pub plugins: Vec<插件导出项>,
}

#[derive(Clone, Debug, Deserialize, Serialize)]
pub struct 插件选择 {
    pub id: String,
    #[serde(default)]
    pub settings: bool,
    #[serde(default)]
    pub data: bool,
}

#[derive(Clone, Debug, Deserialize, Serialize)]
pub struct 导出请求 {
    pub destination: String,
    #[serde(default)]
    pub include: Vec<String>,
    #[serde(default)]
    pub plugins: Vec<插件选择>,
}

#[derive(Clone, Debug, Serialize)]
pub struct 导出报告 {
    pub path: String,
    pub files: usize,
    pub bytes: u64,
    pub skipped_symlinks: usize,
}

#[derive(Clone, Copy)]
enum 源种类 {
    文件,
    目录,
}

#[derive(Clone)]
struct 源 {
    种类: 源种类,
    路径: PathBuf,
    archive_prefix: &'static str,
    sensitive: bool,
}

struct 计划文件 {
    source: PathBuf,
    archive: String,
    bytes: u64,
}

pub fn 清单(state: &AppState) -> 导出清单 {
    let program = PROGRAM_IDS
        .iter()
        .map(|id| match 程序源(id) {
            Some(source) => {
                let (files, bytes) = 统计(&source.路径, source.种类);
                导出项 {
                    id: (*id).to_owned(),
                    available: source.路径.exists(),
                    files,
                    bytes,
                    sensitive: source.sensitive,
                }
            }
            None => 导出项 {
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
                .map(|p| 统计(p, 源种类::目录))
                .unwrap_or((0, 0));
            if settings_bytes == 0 && data_files == 0 {
                return None;
            }
            Some(插件导出项 {
                name: names.get(&id).cloned().unwrap_or_else(|| id.clone()),
                id,
                settings_bytes,
                data_files,
                data_bytes,
            })
        })
        .collect();

    导出清单 { program, plugins }
}

pub fn 导出(request: &导出请求) -> Result<导出报告> {
    let destination = PathBuf::from(request.destination.trim());
    if request.destination.trim().is_empty() || destination.file_name().is_none() {
        return Err(NotaError::other("请选择设置包的保存位置"));
    }

    let mut selected: BTreeSet<&str> = BTreeSet::new();
    for id in &request.include {
        if !PROGRAM_IDS.contains(&id.as_str()) {
            return Err(NotaError::other(format!("不认识的程序设置类别：{id}")));
        }
        selected.insert(id.as_str());
    }
    let plugin_selection: BTreeMap<&str, &插件选择> = request
        .plugins
        .iter()
        .filter(|p| p.settings || p.data)
        .map(|p| (p.id.as_str(), p))
        .collect();
    if selected.is_empty() && plugin_selection.is_empty() {
        return Err(NotaError::other("至少选择一项要导出的设置或数据"));
    }

    let mut files = Vec::new();
    let mut skipped_symlinks = 0usize;
    for id in selected {
        let source = 程序源(id)
            .ok_or_else(|| NotaError::other(format!("这一类设置没有对应的数据源：{id}")))?;
        if source.路径.exists() {
            收集(
                &source.路径,
                Path::new(source.archive_prefix),
                &mut files,
                &mut skipped_symlinks,
            )?;
        }
    }

    for (id, choice) in plugin_selection {
        let safe = paths::安全文件名(id);
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
                收集(
                    &root,
                    &PathBuf::from(format!("plugins/{safe}/data")),
                    &mut files,
                    &mut skipped_symlinks,
                )?;
            }
        }
    }

    if files.is_empty() {
        return Err(NotaError::other("选中的项目里没有可导出的文件"));
    }
    let total_bytes = files
        .iter()
        .try_fold(0u64, |sum, file| sum.checked_add(file.bytes))
        .ok_or_else(|| NotaError::other("设置包总大小溢出"))?;
    if files.len() > MAX_FILES || total_bytes > MAX_BYTES {
        return Err(NotaError::other("设置包超过 100000 个文件或 1 GiB，已停止导出"));
    }

    let parent = destination.parent().unwrap_or_else(|| Path::new("."));
    fs::create_dir_all(parent).map_err(|e| NotaError::other(format!("建不了目标目录：{e}")))?;
    let stamp = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_nanos();
    let file_name = destination
        .file_name()
        .and_then(|n| n.to_str())
        .unwrap_or("Nota-settings.nota-backup");
    let temp = parent.join(format!(".{file_name}.tmp-{}-{stamp}", std::process::id()));
    let result = 写包(&temp, request, &files, &skipped_symlinks, total_bytes);
    if let Err(error) = result {
        let _ = fs::remove_file(&temp);
        return Err(error);
    }
    if destination.exists() {
        fs::remove_file(&destination)
            .map_err(|e| NotaError::other(format!("覆盖已有设置包失败：{e}")))?;
    }
    fs::rename(&temp, &destination)
        .map_err(|e| NotaError::other(format!("把设置包移到目标位置失败：{e}")))?;

    Ok(导出报告 {
        path: paths::path_to_string(&destination)?,
        files: files.len(),
        bytes: total_bytes,
        skipped_symlinks,
    })
}

fn 写包(
    path: &Path,
    request: &导出请求,
    files: &[计划文件],
    skipped_symlinks: &usize,
    total_bytes: u64,
) -> Result<()> {
    let file = File::create(path).map_err(|e| NotaError::other(format!("建不了设置包：{e}")))?;
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
    zip.start_file("manifest.json", options)
        .map_err(|e| NotaError::other(format!("写设置包清单失败：{e}")))?;
    zip.write_all(serde_json::to_string_pretty(&manifest).unwrap_or_default().as_bytes())
        .map_err(|e| NotaError::other(format!("写设置包清单失败：{e}")))?;

    for planned in files {
        zip.start_file(&planned.archive, options)
            .map_err(|e| NotaError::other(format!("写 {} 到设置包失败：{e}", planned.archive)))?;
        let mut source = File::open(&planned.source)
            .map_err(|e| NotaError::other(format!("读 {} 失败：{e}", planned.source.display())))?;
        let mut buffer = [0u8; 64 * 1024];
        loop {
            let n = source
                .read(&mut buffer)
                .map_err(|e| NotaError::other(format!("读 {} 失败：{e}", planned.source.display())))?;
            if n == 0 {
                break;
            }
            zip.write_all(&buffer[..n])
                .map_err(|e| NotaError::other(format!("写设置包失败：{e}")))?;
        }
    }
    zip.finish()
        .map_err(|e| NotaError::other(format!("收尾设置包失败：{e}")))?;
    Ok(())
}

fn 程序源(id: &str) -> Option<源> {
    let path = match id {
        "settings" => paths::settings_file().ok()?,
        "session" => paths::session_file().ok()?,
        "table-widths" => paths::table_widths_file().ok()?,
        "plugin-state" => paths::plugin_state_file().ok()?,
        "trusted-keys" => paths::trusted_keys_file().ok()?,
        "image-upload" => paths::image_upload_file().ok()?,
        "themes" => paths::user_themes_dir().ok()?,
        "ui-styles" => paths::user_ui_styles_dir().ok()?,
        "dictionaries" => crate::spell::store::用户词典目录().ok()?,
        _ => return None,
    };
    let (种类, archive_prefix, sensitive) = match id {
        "themes" => (源种类::目录, "themes", false),
        "ui-styles" => (源种类::目录, "ui-styles", false),
        "dictionaries" => (源种类::目录, "dictionaries", false),
        "trusted-keys" => (源种类::文件, "program/trusted-keys.toml", false),
        "image-upload" => (源种类::文件, "program/image-upload.toml", true),
        "plugin-state" => (源种类::文件, "program/plugins.toml", false),
        "settings" => (源种类::文件, "program/settings.toml", false),
        "session" => (源种类::文件, "program/session.toml", false),
        "table-widths" => (源种类::文件, "program/table-widths.toml", false),
        _ => return None,
    };
    Some(源 {
        种类,
        路径: path,
        archive_prefix,
        sensitive,
    })
}

fn 统计(path: &Path, kind: 源种类) -> (usize, u64) {
    let Ok(meta) = fs::symlink_metadata(path) else {
        return (0, 0);
    };
    if meta.file_type().is_symlink() {
        return (0, 0);
    }
    if matches!(kind, 源种类::文件) {
        return if meta.is_file() { (1, meta.len()) } else { (0, 0) };
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
                统计(&child, 源种类::目录)
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

fn 收集(
    path: &Path,
    archive: &Path,
    out: &mut Vec<计划文件>,
    skipped_symlinks: &mut usize,
) -> Result<()> {
    let meta = fs::symlink_metadata(path)
        .map_err(|e| NotaError::other(format!("读 {} 失败：{e}", path.display())))?;
    if meta.file_type().is_symlink() {
        *skipped_symlinks += 1;
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
        .map_err(|e| NotaError::other(format!("读目录 {} 失败：{e}", path.display())))?
        .flatten()
        .collect();
    entries.sort_by_key(|e| e.file_name());
    for entry in entries {
        let child = entry.path();
        let name = entry.file_name();
        if name == ".git" || name == "node_modules" {
            continue;
        }
        收集(&child, &archive.join(name), out, skipped_symlinks)?;
    }
    Ok(())
}

fn push_file(
    source: &Path,
    archive: &str,
    out: &mut Vec<计划文件>,
    skipped_symlinks: &mut usize,
) -> Result<()> {
    let meta = fs::symlink_metadata(source)
        .map_err(|e| NotaError::other(format!("读 {} 失败：{e}", source.display())))?;
    if meta.file_type().is_symlink() {
        *skipped_symlinks += 1;
        return Ok(());
    }
    if !meta.is_file() {
        return Ok(());
    }
    let normalized = archive.replace('\\', "/");
    if normalized.starts_with('/') || normalized.split('/').any(|part| part == ".." || part.is_empty()) {
        return Err(NotaError::other("生成设置包时出现了不安全的内部路径"));
    }
    out.push(计划文件 {
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
    fn 程序类别都有稳定的导出路径() {
        for id in PROGRAM_IDS {
            let source = 程序源(id).unwrap_or_else(|| panic!("缺少程序类别 {id}"));
            assert!(!source.archive_prefix.is_empty());
            assert!(!source.archive_prefix.starts_with('/'));
        }
    }

    #[test]
    fn 未知类别被拒绝且空选择不能导出() {
        let request = 导出请求 {
            destination: "/tmp/x.nota-backup".into(),
            include: vec!["not-real".into()],
            plugins: Vec::new(),
        };
        assert!(导出(&request).is_err());
        let empty = 导出请求 {
            destination: "/tmp/x.nota-backup".into(),
            include: Vec::new(),
            plugins: Vec::new(),
        };
        assert!(导出(&empty).is_err());
    }

    #[test]
    fn 插件选择允许只拿设置或只拿数据() {
        let both = 插件选择 {
            id: "nota.ai".into(),
            settings: true,
            data: true,
        };
        assert!(both.settings && both.data);
        assert_eq!(paths::安全文件名(&both.id), "nota.ai");
    }

    #[test]
    fn 写出来的确是带清单的标准_zip() {
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
        let request = 导出请求 {
            destination: package.display().to_string(),
            include: vec!["settings".into()],
            plugins: Vec::new(),
        };
        let files = vec![计划文件 {
            source,
            archive: "program/settings.toml".into(),
            bytes: 15,
        }];
        写包(&package, &request, &files, &0, 15).unwrap();

        let mut zip = zip::ZipArchive::new(File::open(&package).unwrap()).unwrap();
        assert!(zip.by_name("manifest.json").is_ok(), "缺 manifest.json");
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
