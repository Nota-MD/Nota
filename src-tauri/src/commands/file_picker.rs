//! 自绘文件选择器需要的只读目录浏览能力。
//!
//! 原生 GTK 文件对话框无法跟随 Nota 的界面主题，因此在应用内绘制选择器。宿主只
//! 提供位置清单、目录列表和“新建文件夹”；文件的打开、保存等业务命令仍由各自
//! 原有命令处理，这里不读写文件内容。

use std::path::{Path, PathBuf};

use serde::Serialize;

use crate::error::{NotaError, Result};
use crate::paths;

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PickerPlace {
    pub kind: String,
    pub path: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PickerEntry {
    pub name: String,
    pub path: String,
    pub is_dir: bool,
    pub is_symlink: bool,
    pub size: u64,
    pub modified_ms: Option<u64>,
    pub hidden: bool,
}

fn push_place(out: &mut Vec<PickerPlace>, seen: &mut std::collections::HashSet<PathBuf>, kind: &str, path: Option<PathBuf>) {
    let Some(path) = path else { return };
    let Ok(canonical) = path.canonicalize() else { return };
    if !canonical.is_dir() || !seen.insert(canonical.clone()) {
        return;
    }
    if let Ok(path) = paths::path_to_string(&canonical) {
        out.push(PickerPlace {
            kind: kind.to_string(),
            path,
        });
    }
}

#[tauri::command]
pub fn nota_picker_places() -> Vec<PickerPlace> {
    let mut out = Vec::new();
    let mut seen = std::collections::HashSet::new();
    push_place(&mut out, &mut seen, "home", dirs::home_dir());
    push_place(&mut out, &mut seen, "desktop", dirs::desktop_dir());
    push_place(&mut out, &mut seen, "documents", dirs::document_dir());
    push_place(&mut out, &mut seen, "downloads", dirs::download_dir());

    #[cfg(target_os = "windows")]
    for letter in b'A'..=b'Z' {
        let root = PathBuf::from(format!("{}:\\", letter as char));
        push_place(
            &mut out,
            &mut seen,
            &format!("drive:{}", letter as char),
            Some(root),
        );
    }
    #[cfg(not(target_os = "windows"))]
    push_place(
        &mut out,
        &mut seen,
        "root",
        Some(PathBuf::from("/")),
    );

    out
}

fn is_hidden(path: &Path, name: &str) -> bool {
    #[cfg(not(target_os = "windows"))]
    let _ = path;
    if name.starts_with('.') {
        return true;
    }
    #[cfg(target_os = "windows")]
    {
        use std::os::windows::fs::MetadataExt as _;
        if let Ok(meta) = std::fs::symlink_metadata(path) {
            const FILE_ATTRIBUTE_HIDDEN: u32 = 0x2;
            return meta.file_attributes() & FILE_ATTRIBUTE_HIDDEN != 0;
        }
    }
    false
}

#[tauri::command]
pub fn nota_picker_list(path: String, show_hidden: bool) -> Result<Vec<PickerEntry>> {
    let dir = PathBuf::from(path);
    if !dir.is_dir() {
        return Err(NotaError::other("这个位置不是文件夹"));
    }
    let mut out = Vec::new();
    let read = std::fs::read_dir(&dir)
        .map_err(|e| NotaError::other(format!("读取文件夹失败：{e}")))?;
    for entry in read.flatten() {
        let name = entry.file_name().to_string_lossy().to_string();
        if name.is_empty() {
            continue;
        }
        let path = entry.path();
        let symlink = entry.file_type().map(|t| t.is_symlink()).unwrap_or(false);
        let hidden = is_hidden(&path, &name);
        if hidden && !show_hidden {
            continue;
        }
        let meta = std::fs::metadata(&path).ok();
        let is_dir = meta.as_ref().is_some_and(|m| m.is_dir());
        let size = meta.as_ref().map(|m| m.len()).unwrap_or(0);
        let modified_ms = meta
            .and_then(|m| m.modified().ok())
            .and_then(|t| t.duration_since(std::time::UNIX_EPOCH).ok())
            .map(|d| d.as_millis() as u64);
        let path = paths::path_to_string(&path)?;
        out.push(PickerEntry {
            name,
            path,
            is_dir,
            is_symlink: symlink,
            size,
            modified_ms,
            hidden,
        });
    }
    out.sort_by(|a, b| {
        b.is_dir
            .cmp(&a.is_dir)
            .then_with(|| a.name.to_lowercase().cmp(&b.name.to_lowercase()))
    });
    Ok(out)
}

#[tauri::command]
pub fn nota_picker_create_dir(parent: String, name: String) -> Result<String> {
    let name = name.trim();
    if name.is_empty()
        || name == "."
        || name == ".."
        || name.contains('/')
        || name.contains('\\')
        || name.contains('\0')
    {
        return Err(NotaError::other("文件夹名不能为空，也不能包含路径分隔符"));
    }
    let parent = PathBuf::from(parent);
    if !parent.is_dir() {
        return Err(NotaError::other("当前位置不是文件夹"));
    }
    let target = parent.join(name);
    std::fs::create_dir(&target)
        .map_err(|e| NotaError::other(format!("新建文件夹失败：{e}")))?;
    paths::path_to_string(&target)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn 新建文件夹拒绝路径分隔符() {
        let parent = std::env::temp_dir();
        for bad in ["", "..", "a/b", "a\\b"] {
            assert!(nota_picker_create_dir(
                parent.to_string_lossy().to_string(),
                bad.to_string()
            )
            .is_err());
        }
    }

    #[test]
    fn 目录列表目录在前且可隐藏_hidden() {
        let root = std::env::temp_dir().join(format!(
            "nota-picker-test-{}",
            std::process::id()
        ));
        let _ = std::fs::remove_dir_all(&root);
        std::fs::create_dir_all(root.join("dir")).unwrap();
        std::fs::write(root.join("b.txt"), b"b").unwrap();
        std::fs::write(root.join(".hidden"), b"h").unwrap();
        let list = nota_picker_list(root.to_string_lossy().to_string(), false).unwrap();
        assert_eq!(list[0].name, "dir");
        assert!(!list.iter().any(|e| e.name == ".hidden"));
        let all = nota_picker_list(root.to_string_lossy().to_string(), true).unwrap();
        assert!(all.iter().any(|e| e.name == ".hidden"));
        let _ = std::fs::remove_dir_all(root);
    }
}
