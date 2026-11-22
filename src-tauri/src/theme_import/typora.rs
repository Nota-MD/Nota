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

pub(super) fn install_source_bundle(
    path: &Path,
    ui_root: &Path,
    document_root: &Path,
) -> Result<ThemeImportReport> {
    let root = if path.is_dir() {
        canonical(path)?
    } else {
        canonical(
            path.parent()
                .ok_or_else(|| NotaError::other("Theme CSS has no parent directory"))?,
        )?
    };
    let selected = if path.is_dir() {
        None
    } else {
        Some(
            path.file_name()
                .and_then(|value| value.to_str())
                .ok_or_else(|| NotaError::other("Theme CSS filename is not UTF-8"))?
                .to_owned(),
        )
    };
    install_flat_source(&root, selected.as_deref(), ui_root, document_root)
}

pub(super) fn install_source(path: &Path, document_root: &Path) -> Result<ThemeImportReport> {
    let (root, selected) = if path.is_dir() {
        (canonical(path)?, None)
    } else {
        (
            canonical(
                path.parent()
                    .ok_or_else(|| NotaError::other("The CSS file has no parent directory"))?,
            )?,
            Some(
                path.file_name()
                    .and_then(|value| value.to_str())
                    .ok_or_else(|| NotaError::other("Theme CSS filename is not valid UTF-8"))?
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
            .ok_or_else(|| NotaError::other("Theme CSS filename is not valid UTF-8"))?;
        themes.push(ThemeEntry {
            id: theme_id(&collection_id, &css),
            name: stem.to_owned(),
            css,
        });
    }
    if themes.is_empty() {
        return Err(NotaError::other(
            "No importable Typora document theme was found (#write or --doc-bg)",
        ));
    }
    themes.sort_by(|left, right| {
        left.name
            .cmp(&right.name)
            .then_with(|| left.id.cmp(&right.id))
    });

    let mut files = match selected.as_deref() {
        Some(css) => collect_css_dependencies(&root, css)?,
        None => collect_source_files(&root)?,
    };
    let manifest = CollectionManifest {
        version: MANIFEST_VERSION,
        themes: themes.clone(),
    };
    files.insert(
        MANIFEST_FILE.to_owned(),
        serde_json::to_vec_pretty(&manifest).map_err(|error| {
            NotaError::other(format!("Could not encode the theme manifest: {error}"))
        })?,
    );
    install(document_root, &collection_id, &ThemeFiles { files })?;
    Ok(ThemeImportReport {
        ui: Vec::new(),
        document: themes.into_iter().map(|theme| theme.id).collect(),
    })
}

fn install_flat_source(
    root: &Path,
    selected: Option<&str>,
    ui_root: &Path,
    document_root: &Path,
) -> Result<ThemeImportReport> {
    let css_files = root_css_files(root)?;
    let selected_files = css_files
        .into_iter()
        .filter(|css| selected.is_none_or(|name| name == css))
        .collect::<Vec<_>>();

    let mut has_document = false;
    let mut ui_files = Vec::new();
    for css in &selected_files {
        let path = root.join(css);
        if is_document_theme_path(&path, root, &mut BTreeSet::new())? {
            has_document = true;
        } else if is_ui_theme_path(&path)? {
            ui_files.push(css.clone());
        }
    }

    let mut report = ThemeImportReport {
        ui: Vec::new(),
        document: Vec::new(),
    };
    if has_document {
        let document = if selected.is_some() {
            install_source(
                &root.join(selected.ok_or_else(|| NotaError::other("No theme CSS was selected"))?),
                document_root,
            )?
        } else {
            install_source(root, document_root)?
        };
        report.document.extend(document.document);
    }
    for css in ui_files {
        report.ui.push(install_ui_css(root, &css, ui_root)?);
    }
    if report.ui.is_empty() && report.document.is_empty() {
        return Err(NotaError::other(
            "No importable Nota UI theme or Typora document theme was found",
        ));
    }
    Ok(report)
}

fn install_ui_css(root: &Path, css: &str, ui_root: &Path) -> Result<String> {
    let path = root.join(css);
    let text = read_css_text(&path)?;
    let folder_id = Path::new(css)
        .file_stem()
        .and_then(|value| value.to_str())
        .ok_or_else(|| NotaError::other("UI theme CSS filename is not UTF-8"))?;
    let id = super::primary_ui_scope(folder_id, &text)?;
    let mut package = ThemeFiles {
        files: collect_css_dependencies(root, css)?,
    };
    super::normalize_main_css(&id, &mut package)?;
    super::validate_theme(super::ThemeKind::Ui, &id, &mut package)?;
    install(ui_root, &id, &package)?;
    Ok(id)
}

pub(super) fn install_zip(
    path: &Path,
    ui_root: &Path,
    document_root: &Path,
) -> Result<ThemeImportReport> {
    let file = std::fs::File::open(path).map_err(|source| NotaError::Read {
        path: path.to_path_buf(),
        source,
    })?;
    let mut archive = zip::ZipArchive::new(file)
        .map_err(|error| NotaError::other(format!("Could not open theme ZIP: {error}")))?;
    let temp = TemporaryDirectory::new()?;
    let mut files = 0usize;
    let mut total = 0usize;
    for index in 0..archive.len() {
        let entry = archive.by_index(index).map_err(|error| {
            NotaError::other(format!("Could not read theme ZIP entry: {error}"))
        })?;
        let Some(parts) = super::safe_parts(entry.name()) else {
            return Err(NotaError::other(format!(
                "Theme ZIP contains an invalid path: {}",
                entry.name()
            )));
        };
        if entry
            .unix_mode()
            .is_some_and(|mode| mode & 0o170000 == 0o120000)
        {
            return Err(NotaError::other(
                "Theme ZIP must not contain symbolic links",
            ));
        }
        let target = parts
            .iter()
            .fold(temp.path.clone(), |path, part| path.join(part));
        if entry.is_dir() {
            std::fs::create_dir_all(&target).map_err(|source| NotaError::Write {
                path: target,
                source,
            })?;
            continue;
        }
        files += 1;
        if files > super::MAX_FILES {
            return Err(NotaError::other("Typora theme exceeds the file limit"));
        }
        if entry.size() as usize > super::MAX_FILE_BYTES {
            return Err(NotaError::other("A file in the Typora theme is too large"));
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
            .map_err(|error| NotaError::other(format!("Could not read theme file: {error}")))?;
        if bytes.len() > super::MAX_FILE_BYTES {
            return Err(NotaError::other("A file in the Typora theme is too large"));
        }
        total = total.saturating_add(bytes.len());
        if total > super::MAX_TOTAL_BYTES {
            return Err(NotaError::other("Typora theme expands beyond 128 MiB"));
        }
        let mut output = std::fs::File::create(&target).map_err(|source| NotaError::Write {
            path: target.clone(),
            source,
        })?;
        output
            .write_all(&bytes)
            .map_err(|source| NotaError::Write {
                path: target,
                source,
            })?;
    }
    let root = find_theme_root(&temp.path)?.ok_or_else(|| {
        NotaError::other("ZIP contains no flat Nota UI or Typora document theme CSS")
    })?;
    install_flat_source(&root, None, ui_root, document_root)
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
            let path = dir.join(name);
            if is_document_theme_path(&path, root, &mut BTreeSet::new())?
                || is_ui_theme_path(&path)?
            {
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

pub(crate) fn load_runtime_css(css_path: &Path) -> Result<String> {
    let root = css_path
        .parent()
        .ok_or_else(|| NotaError::other("Theme CSS has no parent directory"))?;
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
    format!("typora-{}-{suffix:08x}", slug_limited(stem, 36),)
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
    let css = super::without_css_comments(css);
    css.contains("#write") || css.contains("--doc-bg")
}

fn is_ui_theme_path(path: &Path) -> Result<bool> {
    let css = read_css_text(path)?;
    Ok(super::without_css_comments(&css).contains("data-ui-style="))
}

fn is_document_theme_path(path: &Path, root: &Path, seen: &mut BTreeSet<PathBuf>) -> Result<bool> {
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

fn collect_css_dependencies(root: &Path, css: &str) -> Result<BTreeMap<String, Vec<u8>>> {
    let root = canonical(root)?;
    let mut out = BTreeMap::new();
    let mut total = 0usize;
    let mut seen = BTreeSet::new();
    collect_dependency(&root.join(css), &root, &mut out, &mut total, &mut seen)?;
    Ok(out)
}

fn collect_dependency(
    path: &Path,
    root: &Path,
    out: &mut BTreeMap<String, Vec<u8>>,
    total: &mut usize,
    seen: &mut BTreeSet<PathBuf>,
) -> Result<()> {
    if !path.is_file() {
        return Ok(());
    }
    let full = canonical(path)?;
    if !full.starts_with(root) || !seen.insert(full.clone()) {
        return Ok(());
    }
    if out.len() >= MAX_SOURCE_FILES {
        return Err(NotaError::other("Theme contains too many files"));
    }
    let bytes = std::fs::read(&full).map_err(|source| NotaError::Read {
        path: full.clone(),
        source,
    })?;
    if bytes.len() > super::MAX_FILE_BYTES {
        return Err(NotaError::other("Theme file is too large"));
    }

    if *total > MAX_SOURCE_BYTES {
        return Err(NotaError::other("Theme exceeds 128 MiB"));
    }
    let relative = full
        .strip_prefix(root)
        .map_err(|_| NotaError::other("Theme file is outside the import directory"))?
        .to_string_lossy()
        .replace('\\', "/");
    out.insert(relative, bytes.clone());

    if full
        .extension()
        .and_then(|value| value.to_str())
        .is_none_or(|value| !value.eq_ignore_ascii_case("css"))
    {
        return Ok(());
    }
    let Ok(css) = std::str::from_utf8(&bytes) else {
        return Ok(());
    };
    let base = full.parent().unwrap_or(root);

    let mut cursor = 0usize;
    while let Some(import) = find_import(css, cursor) {
        if let Some(target) = local_import(&import.target) {
            collect_dependency(&base.join(target), root, out, total, seen)?;
        }
        cursor = import.end;
    }

    cursor = 0usize;
    while let Some((raw, end)) = find_url(css, cursor) {
        if let Some(target) = local_url_path(&raw) {
            collect_dependency(&base.join(target), root, out, total, seen)?;
        }
        cursor = end;
    }
    Ok(())
}

fn find_url(css: &str, from: usize) -> Option<(String, usize)> {
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
            .get(at..at + 4)
            .is_some_and(|token| token.eq_ignore_ascii_case(b"url("))
        {
            return url_target(css, at + 4);
        }
        at += 1;
    }
    None
}

fn url_target(css: &str, mut at: usize) -> Option<(String, usize)> {
    let bytes = css.as_bytes();
    while at < bytes.len() && bytes[at].is_ascii_whitespace() {
        at += 1;
    }
    let (value, end) = if bytes
        .get(at)
        .is_some_and(|value| *value == b'"' || *value == b'\'')
    {
        let quote = bytes[at];
        let start = at + 1;
        at = start;
        while at < bytes.len() && bytes[at] != quote {
            at += 1;
        }
        if at >= bytes.len() {
            return None;
        }
        let value = css[start..at].to_owned();
        at += 1;
        while at < bytes.len() && bytes[at].is_ascii_whitespace() {
            at += 1;
        }
        if bytes.get(at) != Some(&b')') {
            return None;
        }
        (value, at + 1)
    } else {
        let start = at;
        while at < bytes.len() && bytes[at] != b')' {
            at += 1;
        }
        if at >= bytes.len() {
            return None;
        }
        (css[start..at].trim().to_owned(), at + 1)
    };
    Some((value, end))
}

fn local_url_path(raw: &str) -> Option<&str> {
    let value = raw.trim();
    if value.is_empty()
        || value.contains("var(")
        || value.bytes().any(|byte| byte == b'\0' || byte == b'\\')
    {
        return None;
    }
    let lower = value.to_ascii_lowercase();
    if lower.starts_with("data:")
        || lower.starts_with("http:")
        || lower.starts_with("https:")
        || lower.starts_with("blob:")
        || lower.starts_with("asset:")
        || lower.starts_with("file:")
        || lower.starts_with("//")
        || lower.starts_with('#')
    {
        return None;
    }
    let end = value.find(['?', '#']).unwrap_or(value.len());
    let path = &value[..end];
    (!path.is_empty() && !Path::new(path).is_absolute()).then_some(path)
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
            return Err(NotaError::other("Typora theme exceeds the file limit"));
        }
        let relative = path
            .strip_prefix(root)
            .map_err(|_| NotaError::other("Theme file is outside the import directory"))?
            .to_string_lossy()
            .replace('\\', "/");
        let bytes = std::fs::read(&path).map_err(|source| NotaError::Read {
            path: path.clone(),
            source,
        })?;

        if *total > MAX_SOURCE_BYTES {
            return Err(NotaError::other("Typora theme exceeds 128 MiB"));
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
        return Err(NotaError::other("Typora theme @import nesting is too deep"));
    }
    if !path.is_file() {
        return Ok(String::new());
    }
    let full = canonical(path)?;
    if !full.starts_with(root) {
        return Err(NotaError::other(format!(
            "Theme references CSS outside its directory: {}",
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
mod tests;
