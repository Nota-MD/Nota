//! Native import for flat Typora theme directories.
//!
//! Source CSS and assets are copied unchanged. A small manifest tells Nota
//! which root CSS files are document themes; import expansion and asset
//! inlining happen only when the theme is loaded into the webview.

use std::collections::{BTreeMap, BTreeSet};
use std::io::{Read, Write};
use std::path::{Path, PathBuf};

use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};

use super::{install, ThemeFiles, ThemeImportReport};
use crate::error::{NotaError, Result};

pub(crate) const MANIFEST_FILE: &str = ".nota-themes.json";
const MANIFEST_VERSION: u32 = 1;
const MAX_SOURCE_FILES: usize = 4096;
const MAX_SOURCE_BYTES: usize = 128 * 1024 * 1024;
const MAX_CSS_BYTES: u64 = 8 * 1024 * 1024;
const MAX_IMPORT_DEPTH: usize = 16;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub(crate) struct ThemeEntry {
    pub id: String,
    pub name: String,
    pub css: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub(crate) struct CollectionManifest {
    pub version: u32,
    pub themes: Vec<ThemeEntry>,
}

pub(crate) fn read_manifest(package: &Path) -> Option<CollectionManifest> {
    let bytes = std::fs::read(package.join(MANIFEST_FILE)).ok()?;
    let manifest = serde_json::from_slice::<CollectionManifest>(&bytes).ok()?;
    (manifest.version <= MANIFEST_VERSION).then_some(manifest)
}

pub(super) fn install_source(
    path: &Path,
    document_root: &Path,
) -> Result<ThemeImportReport> {
    let (root, selected) = if path.is_dir() {
        (canonical(path)?, None)
    } else {
        (
            canonical(path.parent().ok_or_else(|| {
                NotaError::other("这个 CSS 文件没有上一级目录")
            })?)?,
            Some(
                path.file_name()
                    .and_then(|value| value.to_str())
                    .ok_or_else(|| NotaError::other("主题 CSS 文件名不是 UTF-8"))?
                    .to_owned(),
            ),
        )
    };

    let collection_id = collection_id(&root);
    let mut themes = Vec::new();
    for css in root_css_files(&root)? {
        if selected.as_ref().is_some_and(|name| name != &css) {
            continue;
        }
        let css_path = root.join(&css);
        if !is_document_theme_path(&css_path, &root, &mut BTreeSet::new())? {
            continue;
        }
        let stem = Path::new(&css)
            .file_stem()
            .and_then(|value| value.to_str())
            .ok_or_else(|| NotaError::other("主题 CSS 文件名不是 UTF-8"))?;
        themes.push(ThemeEntry {
            id: theme_id(&collection_id, &css),
            name: stem.to_owned(),
            css,
        });
    }
    if themes.is_empty() {
        return Err(NotaError::other(
            "没有找到可导入的 Typora 文档主题（#write 或 --doc-bg）",
        ));
    }
    themes.sort_by(|left, right| {
        left.name
            .cmp(&right.name)
            .then_with(|| left.id.cmp(&right.id))
    });

    let mut files = collect_source_files(&root)?;
    let manifest = CollectionManifest {
        version: MANIFEST_VERSION,
        themes: themes.clone(),
    };
    files.insert(
        MANIFEST_FILE.to_owned(),
        serde_json::to_vec_pretty(&manifest)
            .map_err(|error| NotaError::other(format!("主题清单编码失败：{error}")))?,
    );
    install(
        document_root,
        &collection_id,
        &ThemeFiles { files },
    )?;
    Ok(ThemeImportReport {
        ui: Vec::new(),
        document: themes.into_iter().map(|theme| theme.id).collect(),
    })
}

pub(super) fn install_zip(
    path: &Path,
    document_root: &Path,
) -> Result<ThemeImportReport> {
    let file = std::fs::File::open(path).map_err(|source| NotaError::Read {
        path: path.to_path_buf(),
        source,
    })?;
    let mut archive = zip::ZipArchive::new(file)
        .map_err(|error| NotaError::other(format!("主题 ZIP 打不开：{error}")))?;
    let temp = TemporaryDirectory::new()?;
    let mut files = 0usize;
    let mut total = 0usize;
    for index in 0..archive.len() {
        let entry = archive
            .by_index(index)
            .map_err(|error| NotaError::other(format!("读取主题 ZIP 条目失败：{error}")))?;
        let Some(parts) = super::safe_parts(entry.name()) else {
            return Err(NotaError::other(format!(
                "主题 ZIP 包含非法路径：{}",
                entry.name()
            )));
        };
        if entry.unix_mode().is_some_and(|mode| mode & 0o170000 == 0o120000) {
            return Err(NotaError::other("主题 ZIP 不能包含符号链接"));
        }
        let target = parts.iter().fold(temp.path.clone(), |path, part| path.join(part));
        if entry.is_dir() {
            std::fs::create_dir_all(&target).map_err(|source| NotaError::Write {
                path: target,
                source,
            })?;
            continue;
        }
        files += 1;
        if files > super::MAX_FILES {
            return Err(NotaError::other("Typora 主题文件数超过上限"));
        }
        if entry.size() as usize > super::MAX_FILE_BYTES {
            return Err(NotaError::other("Typora 主题里的单个文件太大"));
        }
        if let Some(parent) = target.parent() {
            std::fs::create_dir_all(parent).map_err(|source| NotaError::Write {
                path: parent.to_path_buf(),
                source,
            })?;
        }
        let mut bytes = Vec::new();
        entry
            .take(super::MAX_FILE_BYTES as u64 + 1)
            .read_to_end(&mut bytes)
            .map_err(|error| NotaError::other(format!("读取主题文件失败：{error}")))?;
        if bytes.len() > super::MAX_FILE_BYTES {
            return Err(NotaError::other("Typora 主题里的单个文件太大"));
        }
        total = total.saturating_add(bytes.len());
        if total > super::MAX_TOTAL_BYTES {
            return Err(NotaError::other("Typora 主题解压后超过 128 MiB"));
        }
        let mut output = std::fs::File::create(&target).map_err(|source| NotaError::Write {
            path: target.clone(),
            source,
        })?;
        output.write_all(&bytes).map_err(|source| NotaError::Write {
            path: target,
            source,
        })?;
    }
    let root = find_theme_root(&temp.path)?.ok_or_else(|| {
        NotaError::other("ZIP 里没有找到平铺的 Typora 主题 CSS")
    })?;
    install_source(&root, document_root)
}

struct TemporaryDirectory {
    path: PathBuf,
}

impl TemporaryDirectory {
    fn new() -> Result<Self> {
        let path = std::env::temp_dir().join(format!(
            "nota-typora-import-{}-{}",
            std::process::id(),
            std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .map(|time| time.as_nanos())
                .unwrap_or(0)
        ));
        std::fs::create_dir_all(&path).map_err(|source| NotaError::Write {
            path: path.clone(),
            source,
        })?;
        Ok(Self { path })
    }
}

impl Drop for TemporaryDirectory {
    fn drop(&mut self) {
        let _ = std::fs::remove_dir_all(&self.path);
    }
}

fn find_theme_root(root: &Path) -> Result<Option<PathBuf>> {
    let mut queue = std::collections::VecDeque::from([root.to_path_buf()]);
    while let Some(dir) = queue.pop_front() {
        let css = root_css_files(&dir)?;
        for name in css {
            if is_document_theme_path(
                &dir.join(name),
                root,
                &mut BTreeSet::new(),
            )? {
                return Ok(Some(dir));
            }
        }
        let Ok(entries) = std::fs::read_dir(&dir) else {
            continue;
        };
        for entry in entries.flatten() {
            let path = entry.path();
            if entry
                .file_type()
                .map(|kind| kind.is_dir() && !kind.is_symlink())
                .unwrap_or(false)
            {
                queue.push_back(path);
            }
        }
    }
    Ok(None)
}

/// Build the CSS delivered to the webview without modifying the installed
/// source files. Relative imports are expanded and local assets become data
/// URIs because the webview receives CSS as text rather than a theme URL.
pub(crate) fn load_runtime_css(css_path: &Path) -> Result<String> {
    let root = css_path
        .parent()
        .ok_or_else(|| NotaError::other("主题 CSS 没有上一级目录"))?;
    let root = canonical(root)?;
    expand_css(css_path, &root, &mut BTreeSet::new(), 0)
}

fn canonical(path: &Path) -> Result<PathBuf> {
    std::fs::canonicalize(path).map_err(|source| NotaError::Read {
        path: path.to_path_buf(),
        source,
    })
}

fn collection_id(root: &Path) -> String {
    let name = root
        .file_name()
        .and_then(|value| value.to_str())
        .unwrap_or("theme");
    format!("typora-{}", slug_limited(name, 40))
}

fn slug_limited(value: &str, limit: usize) -> String {
    let mut out = String::new();
    for ch in value.chars() {
        if ch.is_ascii_alphanumeric() || ch == '-' || ch == '_' {
            out.push(ch.to_ascii_lowercase());
        } else if !out.ends_with('-') {
            out.push('-');
        }
    }
    let trimmed = out.trim_matches('-');
    if trimmed.is_empty() {
        "theme".to_owned()
    } else {
        trimmed.chars().take(limit).collect()
    }
}

fn theme_id(collection: &str, css: &str) -> String {
    let stem = Path::new(css)
        .file_stem()
        .and_then(|value| value.to_str())
        .unwrap_or("theme");
    let digest = Sha256::digest(format!("{collection}\0{css}").as_bytes());
    let suffix = u32::from_be_bytes(digest[..4].try_into().unwrap());
    format!(
        "typora-{}-{suffix:08x}",
        slug_limited(stem, 36),
    )
}

fn root_css_files(root: &Path) -> Result<Vec<String>> {
    let mut out = Vec::new();
    for entry in std::fs::read_dir(root).map_err(|source| NotaError::Read {
        path: root.to_path_buf(),
        source,
    })? {
        let Ok(entry) = entry else { continue };
        let file_type = entry.file_type().map_err(|source| NotaError::Read {
            path: entry.path(),
            source,
        })?;
        if !file_type.is_file() || file_type.is_symlink() {
            continue;
        }
        let name = entry.file_name().to_string_lossy().into_owned();
        let lower = name.to_ascii_lowercase();
        if lower.ends_with(".css") && !lower.ends_with(".user.css") {
            out.push(name);
        }
    }
    out.sort();
    Ok(out)
}

fn read_css_text(path: &Path) -> Result<String> {
    crate::themes::check_size(path, MAX_CSS_BYTES)?;
    std::fs::read_to_string(path).map_err(|source| NotaError::Read {
        path: path.to_path_buf(),
        source,
    })
}

fn is_document_theme(css: &str) -> bool {
    css.contains("#write") || css.contains("--doc-bg")
}

fn is_document_theme_path(
    path: &Path,
    root: &Path,
    seen: &mut BTreeSet<PathBuf>,
) -> Result<bool> {
    if !path.is_file() {
        return Ok(false);
    }
    let full = canonical(path)?;
    if !full.starts_with(root) || !seen.insert(full.clone()) {
        return Ok(false);
    }
    let css = read_css_text(&full)?;
    if is_document_theme(&css) {
        return Ok(true);
    }
    let mut cursor = 0usize;
    while let Some(import) = find_import(&css, cursor) {
        if let Some(target) = local_import(&import.target) {
            let imported = full.parent().unwrap_or(root).join(target);
            if is_document_theme_path(&imported, root, seen)? {
                return Ok(true);
            }
        }
        cursor = import.end;
    }
    Ok(false)
}

fn collect_source_files(root: &Path) -> Result<BTreeMap<String, Vec<u8>>> {
    let mut out = BTreeMap::new();
    let mut total = 0usize;
    collect_directory(root, root, &mut out, &mut total)?;
    Ok(out)
}

fn collect_directory(
    root: &Path,
    current: &Path,
    out: &mut BTreeMap<String, Vec<u8>>,
    total: &mut usize,
) -> Result<()> {
    for entry in std::fs::read_dir(current).map_err(|source| NotaError::Read {
        path: current.to_path_buf(),
        source,
    })? {
        let Ok(entry) = entry else { continue };
        let file_type = entry.file_type().map_err(|source| NotaError::Read {
            path: entry.path(),
            source,
        })?;
        if file_type.is_symlink() {
            continue;
        }
        let path = entry.path();
        if file_type.is_dir() {
            collect_directory(root, &path, out, total)?;
            continue;
        }
        if !file_type.is_file() {
            continue;
        }
        if out.len() >= MAX_SOURCE_FILES {
            return Err(NotaError::other("Typora 主题文件数超过上限"));
        }
        let relative = path
            .strip_prefix(root)
            .map_err(|_| NotaError::other("主题文件不在导入目录内"))?
            .to_string_lossy()
            .replace('\\', "/");
        let bytes = std::fs::read(&path).map_err(|source| NotaError::Read {
            path: path.clone(),
            source,
        })?;
        *total = total.saturating_add(bytes.len());
        if *total > MAX_SOURCE_BYTES {
            return Err(NotaError::other("Typora 主题超过 128 MiB"));
        }
        out.insert(relative, bytes);
    }
    Ok(())
}

fn expand_css(
    path: &Path,
    root: &Path,
    seen: &mut BTreeSet<PathBuf>,
    depth: usize,
) -> Result<String> {
    if depth > MAX_IMPORT_DEPTH {
        return Err(NotaError::other("Typora 主题的 @import 层级太深"));
    }
    if !path.is_file() {
        return Ok(String::new());
    }
    let full = canonical(path)?;
    if !full.starts_with(root) {
        return Err(NotaError::other(format!(
            "主题引用了文件夹外的 CSS：{}",
            path.display()
        )));
    }
    if !seen.insert(full.clone()) {
        return Ok(String::new());
    }
    let css = simplify_font_sources(&read_css_text(&full)?);
    let mut out = String::with_capacity(css.len());
    let mut cursor = 0usize;
    while let Some(import) = find_import(&css, cursor) {
        out.push_str(&crate::theme_assets::inline(
            &css[cursor..import.start],
            &full,
            root,
        ));
        if let Some(target) = local_import(&import.target) {
            let imported = full.parent().unwrap_or(root).join(target);
            out.push_str(&expand_css(&imported, root, seen, depth + 1)?);
        }
        cursor = import.end;
    }
    out.push_str(&crate::theme_assets::inline(&css[cursor..], &full, root));
    seen.remove(&full);
    Ok(out)
}

struct Import {
    start: usize,
    end: usize,
    target: String,
}

fn find_import(css: &str, from: usize) -> Option<Import> {
    let bytes = css.as_bytes();
    let mut at = from;
    let mut quote = 0u8;
    while at < bytes.len() {
        if quote != 0 {
            if bytes[at] == b'\\' {
                at = (at + 2).min(bytes.len());
                continue;
            }
            if bytes[at] == quote {
                quote = 0;
            }
            at += 1;
            continue;
        }
        if bytes.get(at..at + 2) == Some(b"/*") {
            at += 2;
            while at + 1 < bytes.len() && bytes.get(at..at + 2) != Some(b"*/") {
                at += 1;
            }
            at = (at + 2).min(bytes.len());
            continue;
        }
        if bytes[at] == b'"' || bytes[at] == b'\'' {
            quote = bytes[at];
            at += 1;
            continue;
        }
        if bytes
            .get(at..at + 7)
            .is_some_and(|token| token.eq_ignore_ascii_case(b"@import"))
            && bytes
                .get(at + 7)
                .is_none_or(|next| next.is_ascii_whitespace())
        {
            let mut end = at + 7;
            let mut nested_quote = 0u8;
            while end < bytes.len() {
                if nested_quote != 0 {
                    if bytes[end] == b'\\' {
                        end = (end + 2).min(bytes.len());
                        continue;
                    }
                    if bytes[end] == nested_quote {
                        nested_quote = 0;
                    }
                } else if bytes[end] == b'"' || bytes[end] == b'\'' {
                    nested_quote = bytes[end];
                } else if bytes[end] == b';' {
                    break;
                }
                end += 1;
            }
            if end >= bytes.len() {
                return None;
            }
            return Some(Import {
                start: at,
                end: end + 1,
                target: import_target(&css[at + 7..end]).unwrap_or_default(),
            });
        }
        at += 1;
    }
    None
}

fn import_target(body: &str) -> Option<String> {
    let body = body.trim();
    let lower = body.to_ascii_lowercase();
    if lower.starts_with("url(") {
        let rest = &body[4..];
        let end = rest.find(')')?;
        return Some(unquote(rest[..end].trim()));
    }
    let first = body.split_whitespace().next()?;
    Some(unquote(first))
}

fn unquote(value: &str) -> String {
    value
        .strip_prefix('"')
        .and_then(|value| value.strip_suffix('"'))
        .or_else(|| {
            value
                .strip_prefix('\'')
                .and_then(|value| value.strip_suffix('\''))
        })
        .unwrap_or(value)
        .to_owned()
}

fn local_import(target: &str) -> Option<&str> {
    if target.is_empty() {
        return None;
    }
    let lower = target.to_ascii_lowercase();
    if lower.starts_with("http:")
        || lower.starts_with("https:")
        || lower.starts_with("//")
        || lower.starts_with("data:")
        || Path::new(target).is_absolute()
        || !lower.ends_with(".css")
    {
        return None;
    }
    Some(target)
}

fn simplify_font_sources(css: &str) -> String {
    let lower = css.to_ascii_lowercase();
    let mut out = String::with_capacity(css.len());
    let mut cursor = 0usize;
    while let Some(found) = lower[cursor..].find("@font-face") {
        let start = cursor + found;
        out.push_str(&css[cursor..start]);
        let Some(open_rel) = css[start..].find('{') else {
            cursor = start;
            break;
        };
        let open = start + open_rel;
        let Some(close_rel) = css[open + 1..].find('}') else {
            cursor = start;
            break;
        };
        let close = open + 1 + close_rel;
        out.push_str(&filter_font_sources(&css[start..=close]));
        cursor = close + 1;
    }
    out.push_str(&css[cursor..]);
    out
}

fn filter_font_sources(block: &str) -> String {
    let lower = block.to_ascii_lowercase();
    let Some(src_at) = lower.find("src:") else {
        return block.to_owned();
    };
    let Some(semi_rel) = block[src_at..].find(';') else {
        return block.to_owned();
    };
    let semi = src_at + semi_rel;
    let declaration = &block[src_at + 4..semi];
    if !declaration.to_ascii_lowercase().contains("data:") {
        return block.to_owned();
    }
    let keep = split_sources(declaration)
        .into_iter()
        .filter(|source| source.to_ascii_lowercase().contains("data:"))
        .collect::<Vec<_>>();
    if keep.is_empty() {
        return block.to_owned();
    }
    format!(
        "{}src: {};{}",
        &block[..src_at],
        keep.join(", "),
        &block[semi + 1..]
    )
}

fn split_sources(value: &str) -> Vec<String> {
    let mut out = Vec::new();
    let mut current = String::new();
    let mut depth = 0usize;
    let mut quote = None;
    for ch in value.chars() {
        if let Some(active) = quote {
            current.push(ch);
            if ch == active {
                quote = None;
            }
            continue;
        }
        match ch {
            '"' | '\'' => {
                quote = Some(ch);
                current.push(ch);
            }
            '(' => {
                depth += 1;
                current.push(ch);
            }
            ')' => {
                depth = depth.saturating_sub(1);
                current.push(ch);
            }
            ',' if depth == 0 => {
                let item = current.trim();
                if !item.is_empty() {
                    out.push(item.to_owned());
                }
                current.clear();
            }
            _ => current.push(ch),
        }
    }
    let item = current.trim();
    if !item.is_empty() {
        out.push(item.to_owned());
    }
    out
}

#[cfg(test)]
mod tests {
    use super::*;

    fn temp_root(name: &str) -> PathBuf {
        let root = std::env::temp_dir().join(format!(
            "nota-typora-theme-{name}-{}-{}",
            std::process::id(),
            std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .unwrap()
                .as_nanos()
        ));
        std::fs::create_dir_all(&root).unwrap();
        root
    }

    #[test]
    fn imports_flat_directory_without_rewriting_its_css() {
        let root = temp_root("directory");
        let source = "#write { --doc-bg: white; }\n";
        std::fs::write(root.join("paper.css"), source).unwrap();
        std::fs::write(
            root.join("paper-dark.css"),
            "@import \"./paper.css\";\n:root { --doc-bg: black; }",
        )
        .unwrap();
        std::fs::write(root.join("notes.css"), "p { color: black; }").unwrap();
        let installed = root.join("installed");
        let report = install_source(&root, &installed).unwrap();

        let collection = collection_id(&root);
        assert_eq!(
            report.document,
            vec![
                theme_id(&collection, "paper.css"),
                theme_id(&collection, "paper-dark.css"),
            ]
        );
        let package = installed.join(&collection);
        assert_eq!(
            std::fs::read_to_string(package.join("paper.css")).unwrap(),
            source
        );
        assert!(!package.join("theme.css").exists());
        let manifest = read_manifest(&package).unwrap();
        assert_eq!(manifest.themes[0].name, "paper");
        let _ = std::fs::remove_dir_all(root);
    }

    #[test]
    fn does_not_list_user_overrides_as_themes() {
        let root = temp_root("user-override");
        std::fs::write(
            root.join("paper.css"),
            "@import \"paper.user.css\";\n#write { --doc-bg: white; }",
        )
        .unwrap();
        std::fs::write(
            root.join("paper.user.css"),
            "#write { --text-color: black; }",
        )
        .unwrap();
        let installed = root.join("installed");
        let report = install_source(&root, &installed).unwrap();
        assert_eq!(report.document.len(), 1);
        let package = installed.join(collection_id(&root));
        let css = load_runtime_css(&package.join("paper.css")).unwrap();
        assert!(css.contains("--text-color: black"));
        let _ = std::fs::remove_dir_all(root);
    }

    #[test]
    fn runtime_expands_imports_and_inlines_relative_assets() {
        let root = temp_root("runtime");
        std::fs::create_dir_all(root.join("fonts")).unwrap();
        std::fs::write(root.join("fonts/base.css"), "p { color: red; }").unwrap();
        std::fs::write(root.join("assets.svg"), "<svg/>").unwrap();
        std::fs::write(
            root.join("demo.css"),
            "@import url(\"./fonts/base.css\");\n#write { background: url(./assets.svg); }",
        )
        .unwrap();
        let css = load_runtime_css(&root.join("demo.css")).unwrap();
        assert!(css.find("color: red").unwrap() < css.find("--doc-bg").unwrap_or(usize::MAX));
        assert!(css.contains("data:image/svg+xml;base64"));
        assert!(!css.contains("@import"));
        let _ = std::fs::remove_dir_all(root);
    }

    #[test]
    fn runtime_ignores_missing_optional_imports() {
        let root = temp_root("optional-import");
        std::fs::write(
            root.join("theme.css"),
            "@import \"theme.user.css\";\n@import \"missing.user.css\";\n#write { --doc-bg: white; }",
        )
        .unwrap();
        std::fs::write(
            root.join("theme.user.css"),
            "#write { --text-color: black; }",
        )
        .unwrap();
        let css = load_runtime_css(&root.join("theme.css")).unwrap();
        assert!(css.contains("--text-color: black"));
        assert!(css.contains("--doc-bg: white"));
        assert!(!css.contains("@import"));
        let _ = std::fs::remove_dir_all(root);
    }

    #[test]
    fn imports_flat_typora_zip_without_conversion() {
        let root = temp_root("zip");
        let archive = root.join("theme.zip");
        {
            let file = std::fs::File::create(&archive).unwrap();
            let mut zip = zip::ZipWriter::new(file);
            let options = zip::write::SimpleFileOptions::default();
            zip.start_file("wrapper/paper.css", options).unwrap();
            zip.write_all(b"#write { --doc-bg: white; }\n").unwrap();
            zip.start_file("wrapper/fonts/face.woff2", options)
                .unwrap();
            zip.write_all(b"font").unwrap();
            zip.finish().unwrap();
        }
        let installed = root.join("installed");
        let report = install_zip(&archive, &installed).unwrap();
        assert_eq!(report.document.len(), 1);
        let package = installed.join(collection_id(&root.join("wrapper")));
        assert_eq!(
            std::fs::read_to_string(package.join("paper.css")).unwrap(),
            "#write { --doc-bg: white; }\n"
        );
        assert_eq!(
            std::fs::read(package.join("fonts/face.woff2")).unwrap(),
            b"font"
        );
        let _ = std::fs::remove_dir_all(root);
    }

    #[test]
    fn prefers_embedded_font_data_and_drops_local_fallback() {
        let css = "@font-face { src: url(\"./font.otf\") format(\"opentype\"), url(\"data:font/woff2;base64,AA\") format(\"woff2\"); }";
        let simplified = simplify_font_sources(css);
        assert!(!simplified.contains("font.otf"));
        assert!(simplified.contains("data:font/woff2"));
    }

    #[test]
    fn audits_external_theme_paths_from_environment() {
        let Some(paths) = std::env::var_os("NOTA_TYPO_AUDIT_PATHS") else {
            return;
        };
        let installed = temp_root("external-audit");
        for path in std::env::split_paths(&paths) {
            match install_source(&path, &installed) {
                Ok(report) => {
                    for id in report.document {
                        let package = installed.join(collection_id(&path));
                        let manifest = read_manifest(&package).unwrap();
                        let theme = manifest.themes.iter().find(|theme| theme.id == id).unwrap();
                        let css = load_runtime_css(&package.join(&theme.css)).unwrap();
                        let font_faces = css.matches("@font-face").count();
                        let data_urls = css.matches("url(\"data:").count()
                            + css.matches("url(data:").count()
                            + css.matches("url('data:").count();
                        let imports = css.matches("@import").count();
                        println!(
                            "AUDIT\t{}\t{}\tbytes={}\tfont_faces={font_faces}\tdata_urls={data_urls}\timports={imports}",
                            path.display(),
                            id,
                            css.len()
                        );
                    }
                }
                Err(error) => panic!("{}: {error}", path.display()),
            }
        }
        let _ = std::fs::remove_dir_all(installed);
    }
}
