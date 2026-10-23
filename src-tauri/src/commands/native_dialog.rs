//! 系统原生文件选择器。
//!
//! 前端优先调用这里；只有命令本身不可用时才退回应用内自绘选择器。这样
//! GNOME/KDE 的搜索、最近文件、书签与 Windows 常用位置都由操作系统提供，
//! 不依赖 Nota 自己维护一份永远追不上的导航列表。

use std::path::{Path, PathBuf};

use serde::Deserialize;

use crate::error::Result;

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct NativeDialogFilter {
    name: String,
    extensions: Vec<String>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct NativeDialogRequest {
    mode: String,
    title: Option<String>,
    default_path: Option<String>,
    #[serde(default)]
    filters: Vec<NativeDialogFilter>,
    #[serde(default)]
    multiple: bool,
}

/// 打开系统文件选择器。返回 `None` 表示用户取消。
#[tauri::command]
pub async fn nota_dialog_native(
    request: NativeDialogRequest,
) -> Result<Option<Vec<String>>> {
    tauri::async_runtime::spawn_blocking(move || 打开(request))
        .await
        .map_err(|e| crate::error::NotaError::Other(format!("native dialog task failed: {e}")))
}

fn 打开(request: NativeDialogRequest) -> Option<Vec<String>> {
    let mut dialog = rfd::FileDialog::new();
    if let Some(title) = request.title.as_deref() {
        if !title.trim().is_empty() {
            dialog = dialog.set_title(title);
        }
    }

    if let Some(path) = request.default_path.as_deref().map(Path::new) {
        if path.is_dir() {
            dialog = dialog.set_directory(path);
        } else if let Some(parent) = path.parent() {
            if parent.is_dir() {
                dialog = dialog.set_directory(parent);
            }
            if request.mode == "save" {
                if let Some(name) = path.file_name().and_then(|name| name.to_str()) {
                    dialog = dialog.set_file_name(name);
                }
            }
        }
    }

    for filter in &request.filters {
        let extensions = filter
            .extensions
            .iter()
            .map(|ext| ext.trim().trim_start_matches("*.").trim_start_matches('.'))
            .filter(|ext| !ext.is_empty() && *ext != "*")
            .collect::<Vec<_>>();
        if !extensions.is_empty() {
            dialog = dialog.add_filter(&filter.name, &extensions);
        }
    }

    let picked: Vec<PathBuf> = match request.mode.as_str() {
        "save" => dialog.save_file().into_iter().collect(),
        "directory" => dialog.pick_folder().into_iter().collect(),
        _ if request.multiple => dialog.pick_files().unwrap_or_default(),
        _ => dialog.pick_file().into_iter().collect(),
    };

    if picked.is_empty() {
        None
    } else {
        Some(
            picked
                .into_iter()
                .map(|path| path.to_string_lossy().into_owned())
                .collect(),
        )
    }
}
