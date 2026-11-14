//! 系统原生文件选择器。
//!
//! 前端优先调用这里；只有命令本身不可用时才退回应用内自绘选择器。这样
//! GNOME/KDE 的搜索、最近文件、书签与 Windows 常用位置都由操作系统提供，
//! 不依赖 Nota 自己维护一份永远追不上的导航列表。

use std::path::{Path, PathBuf};

use serde::{Deserialize, Serialize};

use crate::error::Result;

#[derive(Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct NativeDialogFilter {
    name: String,
    extensions: Vec<String>,
}

#[derive(Debug, Deserialize, Serialize)]
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
    #[cfg(target_os = "linux")]
    {
        portal_dialog(request).await
    }

    #[cfg(not(target_os = "linux"))]
    {
        tauri::async_runtime::spawn_blocking(move || 打开(request))
            .await
            .map_err(|e| crate::error::NotaError::Other(format!("native dialog task failed: {e}")))
    }
}

#[cfg(not(target_os = "linux"))]
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

/// Linux file chooser: XDG Desktop Portal only.
///
/// This deliberately bypasses `rfd`'s GTK3/zenity fallbacks. GNOME serves the
/// request from its GTK4 portal frontend and KDE from Plasma, so the dialog
/// belongs to the desktop's native toolkit rather than the GTK3 main process.
#[cfg(target_os = "linux")]
async fn portal_dialog(request: NativeDialogRequest) -> Result<Option<Vec<String>>> {
    use ashpd::desktop::file_chooser::{FileFilter, SelectedFiles};
    use ashpd::desktop::{Request as PortalRequest, ResponseError};

    match serde_json::to_value(&request)
        .map_err(|error| crate::error::NotaError::other(error.to_string()))
        .and_then(|request| crate::gtk4_dialogs::file_dialog(&request))
    {
        Ok(paths) => return Ok(paths),
        Err(error) => crate::日志!("[nota] GTK4 dialog helper unavailable; using portal: {error}"),
    }

    let filters = request
        .filters
        .iter()
        .filter_map(|filter| {
            let mut portal = FileFilter::new(&filter.name);
            let mut any = false;
            for extension in &filter.extensions {
                let extension = extension
                    .trim()
                    .trim_start_matches("*.")
                    .trim_start_matches('.');
                if extension.is_empty() {
                    continue;
                }
                any = true;
                portal = if extension == "*" {
                    portal.glob("*")
                } else {
                    portal.glob(&format!("*.{extension}"))
                };
            }
            any.then_some(portal)
        })
        .collect::<Vec<_>>();

    let default_path = request.default_path.as_deref().map(Path::new);
    let current_folder = default_path.and_then(|path| {
        if path.is_dir() {
            Some(path.to_path_buf())
        } else {
            path.parent().map(Path::to_path_buf)
        }
    });
    let title = request.title.as_deref().filter(|title| !title.trim().is_empty());

    let portal: PortalRequest<SelectedFiles> = if request.mode == "save" {
        let current_name = default_path
            .and_then(Path::file_name)
            .and_then(std::ffi::OsStr::to_str);
        let mut dialog = SelectedFiles::save_file()
            .title(title)
            .current_name(current_name)
            .filters(filters);
        if let Some(folder) = current_folder {
            dialog = dialog
                .current_folder::<PathBuf>(Some(folder))
                .map_err(|e| crate::error::NotaError::other(format!("文件选择路径无效：{e}")))?;
        }
        dialog
            .send()
            .await
            .map_err(|e| crate::error::NotaError::other(format!("GTK4 文件门户不可用：{e}")))?
    } else {
        let mut dialog = SelectedFiles::open_file()
            .title(title)
            .multiple(request.multiple)
            .directory(request.mode == "directory")
            .filters(filters);
        if let Some(folder) = current_folder {
            dialog = dialog
                .current_folder::<PathBuf>(Some(folder))
                .map_err(|e| crate::error::NotaError::other(format!("文件选择路径无效：{e}")))?;
        }
        dialog
            .send()
            .await
            .map_err(|e| crate::error::NotaError::other(format!("GTK4 文件门户不可用：{e}")))?
    };

    let selected = match portal.response() {
        Ok(selected) => selected,
        Err(ashpd::Error::Response(ResponseError::Cancelled)) => return Ok(None),
        Err(error) => {
            return Err(crate::error::NotaError::other(format!(
                "GTK4 文件门户没有返回结果：{error}"
            )))
        }
    };
    let paths = selected
        .uris()
        .iter()
        .filter_map(|uri| uri.to_file_path().ok())
        .map(|path| path.to_string_lossy().into_owned())
        .collect::<Vec<_>>();
    Ok((!paths.is_empty()).then_some(paths))
}
