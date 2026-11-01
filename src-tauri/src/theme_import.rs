//! Import a self-contained theme ZIP into the user theme directories.
//!
//! Accepted layouts:
//!
//! ```text
//! ui/<id>/theme.css
//! ui-styles/<id>/theme.css
//! document/<id>/theme.css
//! themes/<id>/theme.css
//! ```
//!
//! A single wrapper directory is allowed. Interface themes may use one root CSS
//! file whose name differs from the theme id; it is normalized to `theme.css`.

use std::collections::BTreeMap;
use std::fs::File;
use std::io::{Read, Seek};
use std::path::Path;

use serde::Serialize;

use crate::error::{NotaError, Result};
use crate::paths;
use crate::themes::check_id;

const MAX_FILES: usize = 2_048;
const MAX_TOTAL_BYTES: usize = 128 * 1024 * 1024;
const MAX_FILE_BYTES: usize = 64 * 1024 * 1024;

#[derive(Debug, Clone, Serialize)]
pub struct ThemeImportReport {
    pub ui: Vec<String>,
    pub document: Vec<String>,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, PartialOrd, Ord)]
enum ThemeKind {
    Ui,
    Document,
}

#[derive(Default)]
struct ThemeFiles {
    files: BTreeMap<String, Vec<u8>>,
}

fn safe_parts(path: &str) -> Option<Vec<String>> {
    let normalized = path.replace('\\', "/");
    if normalized.starts_with('/')
        || normalized.get(1..).is_some_and(|tail| tail.starts_with(':'))
    {
        return None;
    }
    let mut out = Vec::new();
    for part in normalized.split('/') {
        if part.is_empty() || part == "." {
            continue;
        }
        if part == ".." || part.contains('\0') {
            return None;
        }
        out.push(part.to_owned());
    }
    (!out.is_empty()).then_some(out)
}

fn classify(path: &str) -> Option<(ThemeKind, String, String)> {
    let parts = safe_parts(path)?;
    let root_index = parts
        .iter()
        .take(3)
        .position(|part| matches!(part.as_str(), "ui" | "ui-styles" | "document" | "themes"))?;
    let root = parts.get(root_index)?.as_str();
    let (kind, mut index) = match root {
        "ui" | "ui-styles" => (ThemeKind::Ui, root_index + 1),
        "document" => (ThemeKind::Document, root_index + 1),
        "themes" => {
            let next = parts.get(root_index + 1).map(String::as_str);
            if matches!(next, Some("ui" | "ui-styles")) {
                (ThemeKind::Ui, root_index + 2)
            } else {
                (ThemeKind::Document, root_index + 1)
            }
        }
        _ => return None,
    };

    let name = parts.get(index)?;
    if kind == ThemeKind::Document
        && name == "dark"
        && parts.len() == index + 2
        && parts[index + 1].to_ascii_lowercase().ends_with(".css")
    {
        let file = &parts[index + 1];
        let id = format!("{}-dark", &file[..file.len() - 4]);
        return Some((kind, id, "dark.css".to_owned()));
    }
    if kind == ThemeKind::Document && name.to_ascii_lowercase().ends_with(".css") {
        let id = name[..name.len() - 4].to_owned();
        return Some((kind, id, "theme.css".to_owned()));
    }

    let id = name.clone();
    index += 1;
    if index >= parts.len() {
        return None;
    }
    Some((kind, id, parts[index..].join("/")))
}

fn normalize_main_css(id: &str, package: &mut ThemeFiles) -> Result<()> {
    if package.files.contains_key("theme.css") {
        return Ok(());
    }
    let named = format!("{id}.css");
    if let Some(bytes) = package.files.remove(&named) {
        package.files.insert("theme.css".to_owned(), bytes);
        return Ok(());
    }
    let root_css: Vec<String> = package
        .files
        .keys()
        .filter(|path| !path.contains('/') && path.to_ascii_lowercase().ends_with(".css"))
        .cloned()
        .collect();
    if root_css.len() != 1 {
        return Err(NotaError::other(format!(
            "主题 {id} 缺少主样式文件：需要 theme.css、{id}.css，或根目录里恰好一个 .css"
        )));
    }
    let source = root_css[0].clone();
    let bytes = package
        .files
        .remove(&source)
        .ok_or_else(|| NotaError::other(format!("读不到主题 {id} 的主样式")))?;
    package.files.insert("theme.css".to_owned(), bytes);
    Ok(())
}

fn validate_theme(kind: ThemeKind, id: &str, package: &mut ThemeFiles) -> Result<()> {
    check_id(id)?;
    let css = package
        .files
        .get("theme.css")
        .ok_or_else(|| NotaError::other(format!("主题 {id} 缺少 theme.css")))?;
    let text = std::str::from_utf8(css)
        .map_err(|_| NotaError::other(format!("主题 {id} 的 CSS 不是 UTF-8 文本")))?;
    match kind {
        ThemeKind::Ui => {
            let double = format!("[data-ui-style=\"{id}\"]");
            let single = format!("[data-ui-style='{id}']");
            if !text.contains(&double) && !text.contains(&single) {
                return Err(NotaError::other(format!(
                    "界面主题 {id} 的每条组件样式必须用 [data-ui-style=\"{id}\"] 限域"
                )));
            }
        }
        ThemeKind::Document => {
            if !text.contains("--doc-bg") && !text.contains("#write") {
                return Err(NotaError::other(format!(
                    "文档主题 {id} 没有找到 --doc-bg 或 #write"
                )));
            }
        }
    }
    Ok(())
}

fn without_css_comments(css: &str) -> String {
    let mut out = String::with_capacity(css.len());
    let mut rest = css;
    while let Some(start) = rest.find("/*") {
        out.push_str(&rest[..start]);
        let Some(end) = rest[start + 2..].find("*/") else {
            return out;
        };
        out.push('\n');
        rest = &rest[start + 2 + end + 2..];
    }
    out.push_str(rest);
    out
}

/// Interface scopes ordered by how much of the stylesheet they own.
///
/// Official themes can include shared overrides for several built-in ids, and
/// documentation comments may contain example selectors. The primary theme id
/// is therefore the most frequent real selector, with the containing folder as
/// a tie-breaker when it is one of the candidates.
fn ui_scope_ids(css: &str) -> Vec<String> {
    let css = without_css_comments(css);
    let mut counts: BTreeMap<String, usize> = BTreeMap::new();
    for quote in ['"', '\''] {
        let needle = format!("data-ui-style={quote}");
        let mut rest = css.as_str();
        while let Some(start) = rest.find(&needle) {
            rest = &rest[start + needle.len()..];
            let Some(end) = rest.find(quote) else {
                break;
            };
            let id = &rest[..end];
            if check_id(id).is_ok() {
                *counts.entry(id.to_owned()).or_default() += 1;
            }
            rest = &rest[end + 1..];
        }
    }
    let mut out: Vec<(String, usize)> = counts.into_iter().collect();
    out.sort_by(|(left_id, left_count), (right_id, right_count)| {
        right_count
            .cmp(left_count)
            .then_with(|| left_id.cmp(right_id))
    });
    out.into_iter().map(|(id, _)| id).collect()
}

fn primary_ui_scope(folder_id: &str, css: &str) -> Result<String> {
    let mut ids = ui_scope_ids(css);
    if ids.is_empty() {
        return Err(NotaError::other(format!(
            "界面主题 {folder_id} 没有声明 [data-ui-style=\"…\"]"
        )));
    }
    if let Some(index) = ids.iter().position(|id| id == folder_id) {
        ids.remove(index);
        ids.insert(0, folder_id.to_owned());
    }
    Ok(ids.remove(0))
}

fn install(root: &Path, id: &str, package: &ThemeFiles) -> Result<bool> {
    paths::ensure_dir(root)?;
    let token = format!(
        "{}-{}",
        std::process::id(),
        std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .map(|time| time.as_nanos())
            .unwrap_or(0)
    );
    let destination = root.join(id);
    let staging = root.join(format!(".import-{id}-{token}"));
    let previous = root.join(format!(".previous-{id}-{token}"));
    let _ = std::fs::remove_dir_all(&staging);
    paths::ensure_dir(&staging)?;

    for (relative, bytes) in &package.files {
        let target = staging.join(relative);
        if let Some(parent) = target.parent() {
            paths::ensure_dir(parent)?;
        }
        std::fs::write(&target, bytes).map_err(|source| NotaError::Write {
            path: target,
            source,
        })?;
    }

    let replaced = destination.exists();
    if replaced {
        std::fs::rename(&destination, &previous).map_err(|error| {
            let _ = std::fs::remove_dir_all(&staging);
            NotaError::other(format!("无法替换已有主题 {id}：{error}"))
        })?;
    }
    if let Err(error) = std::fs::rename(&staging, &destination) {
        if replaced {
            let _ = std::fs::rename(&previous, &destination);
        }
        let _ = std::fs::remove_dir_all(&staging);
        return Err(NotaError::other(format!("安装主题 {id} 失败：{error}")));
    }
    if replaced {
        let _ = std::fs::remove_dir_all(&previous);
    }
    Ok(replaced)
}

fn read_archive<R: Read + Seek>(reader: R) -> Result<BTreeMap<(ThemeKind, String), ThemeFiles>> {
    let mut archive = zip::ZipArchive::new(reader)
        .map_err(|error| NotaError::other(format!("主题 ZIP 打不开：{error}")))?;
    let mut packages: BTreeMap<(ThemeKind, String), ThemeFiles> = BTreeMap::new();
    let mut total = 0usize;
    let mut files = 0usize;

    for index in 0..archive.len() {
        let entry = archive
            .by_index(index)
            .map_err(|error| NotaError::other(format!("读取主题 ZIP 条目失败：{error}")))?;
        if safe_parts(entry.name()).is_none() {
            return Err(NotaError::other(format!(
                "主题 ZIP 包含非法路径：{}",
                entry.name()
            )));
        }
        if entry.is_dir() {
            continue;
        }
        if entry.unix_mode().is_some_and(|mode| mode & 0o170000 == 0o120000) {
            return Err(NotaError::other("主题 ZIP 不能包含符号链接"));
        }
        let Some((kind, id, relative)) = classify(entry.name()) else {
            continue;
        };
        files += 1;
        if files > MAX_FILES {
            return Err(NotaError::other(format!("主题 ZIP 文件数超过上限 {MAX_FILES}")));
        }
        if entry.size() as usize > MAX_FILE_BYTES {
            return Err(NotaError::other(format!("主题文件 {relative} 太大")));
        }
        let mut bytes = Vec::new();
        entry
            .take(MAX_FILE_BYTES as u64 + 1)
            .read_to_end(&mut bytes)
            .map_err(|error| NotaError::other(format!("读取主题文件 {relative} 失败：{error}")))?;
        if bytes.len() > MAX_FILE_BYTES {
            return Err(NotaError::other(format!("主题文件 {relative} 太大")));
        }
        total = total.saturating_add(bytes.len());
        if total > MAX_TOTAL_BYTES {
            return Err(NotaError::other("主题 ZIP 解压后超过 128 MiB"));
        }
        packages
            .entry((kind, id))
            .or_default()
            .files
            .insert(relative, bytes);
    }
    if packages.is_empty() {
        return Err(NotaError::other(
            "ZIP 里没有识别到主题。需要 ui/<id>/theme.css 或 document/<id>/theme.css",
        ));
    }
    Ok(packages)
}

fn prepare_packages(
    mut packages: BTreeMap<(ThemeKind, String), ThemeFiles>,
) -> Result<BTreeMap<(ThemeKind, String), ThemeFiles>> {
    let dark_keys: Vec<(ThemeKind, String)> = packages
        .keys()
        .filter(|(kind, id)| *kind == ThemeKind::Document && id.ends_with("-dark"))
        .cloned()
        .collect();
    for key in dark_keys {
        let Some(patch) = packages.remove(&key) else {
            continue;
        };
        let base_id = key.1.trim_end_matches("-dark");
        let Some(base) = packages.get_mut(&(ThemeKind::Document, base_id.to_owned())) else {
            continue;
        };
        let Some(patch_css) = patch.files.get("dark.css") else {
            continue;
        };
        let Some(base_css) = base.files.get("theme.css") else {
            continue;
        };
        let mut combined = base_css.clone();
        combined.push(b'\n');
        combined.extend_from_slice(patch_css);
        packages.insert(
            key,
            ThemeFiles {
                files: BTreeMap::from([("theme.css".to_owned(), combined)]),
            },
        );
    }
    let mut normalized: BTreeMap<(ThemeKind, String), ThemeFiles> = BTreeMap::new();
    for ((kind, folder_id), mut package) in packages {
        normalize_main_css(&folder_id, &mut package)?;
        let id = if kind == ThemeKind::Ui {
            let css = std::str::from_utf8(
                package
                    .files
                    .get("theme.css")
                    .ok_or_else(|| NotaError::other("界面主题缺少 theme.css"))?,
            )
            .map_err(|_| NotaError::other("界面主题的 CSS 不是 UTF-8 文本"))?;
            primary_ui_scope(&folder_id, css)?
        } else {
            folder_id
        };
        if kind == ThemeKind::Document && crate::themes::is_builtin(&id) {
            continue;
        }
        validate_theme(kind, &id, &mut package)?;
        normalized.insert((kind, id), package);
    }
    Ok(normalized)
}

fn install_packages(
    normalized: BTreeMap<(ThemeKind, String), ThemeFiles>,
    ui_root: &Path,
    document_root: &Path,
) -> Result<ThemeImportReport> {
    let mut report = ThemeImportReport {
        ui: Vec::new(),
        document: Vec::new(),
    };
    for ((kind, id), package) in normalized {
        match kind {
            ThemeKind::Ui => {
                install(&ui_root, &id, &package)?;
                report.ui.push(id);
            }
            ThemeKind::Document => {
                install(&document_root, &id, &package)?;
                report.document.push(id);
            }
        }
    }
    Ok(report)
}

pub fn import_zip(path: &Path) -> Result<ThemeImportReport> {
    let file = File::open(path).map_err(|source| NotaError::Read {
        path: path.to_path_buf(),
        source,
    })?;
    let packages = prepare_packages(read_archive(file)?)?;
    install_packages(
        packages,
        &paths::user_ui_styles_dir()?,
        &paths::user_themes_dir()?,
    )
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::io::{Cursor, Write};

    #[test]
    fn accepts_official_ui_and_document_layouts() {
        assert!(matches!(
            classify("ui/macos/theme.css"),
            Some((ThemeKind::Ui, id, path)) if id == "macos" && path == "theme.css"
        ));
        assert!(matches!(
            classify("wrapper/document/github/theme.css"),
            Some((ThemeKind::Document, id, path)) if id == "github" && path == "theme.css"
        ));
        assert!(matches!(
            classify("themes/ui-styles/cde/assets/icon.svg"),
            Some((ThemeKind::Ui, id, path)) if id == "cde" && path == "assets/icon.svg"
        ));
        assert!(matches!(
            classify("document/minimal.css"),
            Some((ThemeKind::Document, id, path)) if id == "minimal" && path == "theme.css"
        ));
        assert!(matches!(
            classify("document/dark/minimal.css"),
            Some((ThemeKind::Document, id, path)) if id == "minimal-dark" && path == "dark.css"
        ));
    }

    #[test]
    fn rejects_path_traversal_and_unrecognized_files() {
        assert!(safe_parts("../theme.css").is_none());
        assert!(safe_parts("ui/a/../../theme.css").is_none());
        assert!(safe_parts("/ui/a/theme.css").is_none());
        assert!(classify("readme.md").is_none());
    }

    #[test]
    fn rejects_an_archive_when_any_entry_escapes_its_root() {
        let mut bytes = Cursor::new(Vec::new());
        {
            let mut zip = zip::ZipWriter::new(&mut bytes);
            let options = zip::write::SimpleFileOptions::default();
            zip.start_file("ui/safe/theme.css", options).unwrap();
            zip.write_all(b"[data-ui-style=\"safe\"] { color: red; }")
                .unwrap();
            zip.start_file("../outside.txt", options).unwrap();
            zip.write_all(b"not allowed").unwrap();
            zip.finish().unwrap();
        }
        bytes.set_position(0);
        let error = match read_archive(bytes) {
            Ok(_) => panic!("路径穿越条目不应通过"),
            Err(error) => error.to_string(),
        };
        assert!(error.contains("非法路径"), "实际：{error}");
    }

    #[test]
    fn reads_interface_and_document_themes_from_one_archive() {
        let mut bytes = Cursor::new(Vec::new());
        {
            let mut zip = zip::ZipWriter::new(&mut bytes);
            let options = zip::write::SimpleFileOptions::default();
            zip.start_file("wrapper/ui/plasma/plasma.css", options)
                .unwrap();
            zip.write_all(b"[data-ui-style=\"plasma\"] { --radius: 4px; }")
                .unwrap();
            zip.start_file("wrapper/document/paper/theme.css", options)
                .unwrap();
            zip.write_all(b":root { --doc-bg: white; --doc-fg: black; }")
                .unwrap();
            zip.finish().unwrap();
        }
        bytes.set_position(0);
        let packages = read_archive(bytes).unwrap();
        assert_eq!(packages.len(), 2);
    }

    #[test]
    fn interface_identity_comes_from_scope_not_archive_filename() {
        assert_eq!(
            ui_scope_ids(
                "[data-ui-style=\"plasma\"] { color: red; }\n\
                 [data-ui-style='plasma'] .menu { color: blue; }"
            ),
            vec!["plasma"]
        );
    }

    #[test]
    fn official_shared_scopes_and_comment_examples_pick_one_primary_id() {
        let css = r#"
            /* Example: [data-ui-style="x"] { color: red; } */
            [data-ui-style="plasma"] { color: black; }
            [data-ui-style="macos"], [data-ui-style="windows"] { color: blue; }
            [data-ui-style="plasma"] { color: white; }
        "#;
        assert_eq!(ui_scope_ids(css), vec!["plasma", "macos", "windows"]);
        assert_eq!(primary_ui_scope("breeze", css).unwrap(), "plasma");
        assert_eq!(
            primary_ui_scope(
                "adwaita",
                r#"[data-ui-style="adwaita"]{} [data-ui-style="adwaita"]{}"#
            )
            .unwrap(),
            "adwaita"
        );
    }

    #[test]
    fn install_writes_a_complete_theme_and_replaces_it_atomically() {
        let root = std::env::temp_dir().join(format!(
            "nota-theme-import-{}-{}",
            std::process::id(),
            std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .unwrap()
                .as_nanos()
        ));
        let first = ThemeFiles {
            files: BTreeMap::from([
                ("theme.css".to_owned(), b"one".to_vec()),
                ("assets/icon.svg".to_owned(), b"<svg/>".to_vec()),
            ]),
        };
        assert!(!install(&root, "demo", &first).unwrap());
        assert_eq!(
            std::fs::read(root.join("demo/theme.css")).unwrap(),
            b"one"
        );
        let second = ThemeFiles {
            files: BTreeMap::from([("theme.css".to_owned(), b"two".to_vec())]),
        };
        assert!(install(&root, "demo", &second).unwrap());
        assert_eq!(
            std::fs::read(root.join("demo/theme.css")).unwrap(),
            b"two"
        );
        assert!(!root.join("demo/assets/icon.svg").exists());
        let _ = std::fs::remove_dir_all(root);
    }

    #[test]
    fn installs_interface_document_dark_patch_and_assets_from_one_zip() {
        let mut bytes = Cursor::new(Vec::new());
        {
            let mut zip = zip::ZipWriter::new(&mut bytes);
            let options = zip::write::SimpleFileOptions::default();
            zip.start_file("package/ui/demo/plasma.css", options)
                .unwrap();
            zip.write_all(b"[data-ui-style=\"demo-ui\"] { color: red; }")
                .unwrap();
            zip.start_file("package/ui/same-name/same-name.css", options)
                .unwrap();
            zip.write_all(b"[data-ui-style=\"same-ui\"] { color: green; }")
                .unwrap();
            zip.start_file("package/ui/demo/assets/icon.svg", options)
                .unwrap();
            zip.write_all(b"<svg/>").unwrap();
            zip.start_file("package/document/demo/theme.css", options)
                .unwrap();
            zip.write_all(b"#write { --doc-bg: white; }").unwrap();
            zip.start_file("package/document/demo/assets/paper.png", options)
                .unwrap();
            zip.write_all(b"png").unwrap();
            zip.start_file("package/document/dark/demo.css", options)
                .unwrap();
            zip.write_all(b"#write { --doc-bg: black; }").unwrap();
            zip.finish().unwrap();
        }
        bytes.set_position(0);

        let root = std::env::temp_dir().join(format!(
            "nota-theme-import-package-{}-{}",
            std::process::id(),
            std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .unwrap()
                .as_nanos()
        ));
        let ui_root = root.join("ui");
        let document_root = root.join("document");
        let packages = prepare_packages(read_archive(bytes).unwrap()).unwrap();
        let report = install_packages(packages, &ui_root, &document_root).unwrap();

        assert_eq!(report.ui, vec!["demo-ui", "same-ui"]);
        assert_eq!(report.document, vec!["demo", "demo-dark"]);
        assert_eq!(
            std::fs::read(ui_root.join("demo-ui/assets/icon.svg")).unwrap(),
            b"<svg/>"
        );
        assert_eq!(
            std::fs::read(ui_root.join("same-ui/theme.css")).unwrap(),
            b"[data-ui-style=\"same-ui\"] { color: green; }"
        );
        assert_eq!(
            std::fs::read(document_root.join("demo/assets/paper.png")).unwrap(),
            b"png"
        );
        let dark = std::fs::read_to_string(document_root.join("demo-dark/theme.css")).unwrap();
        assert!(dark.contains("--doc-bg: white"));
        assert!(dark.contains("--doc-bg: black"));
        let _ = std::fs::remove_dir_all(root);
    }
}
