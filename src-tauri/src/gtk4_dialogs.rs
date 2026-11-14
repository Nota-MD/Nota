//! GTK4 secondary-dialog bridge.
//!
//! GTK3 and GTK4 cannot be initialized in one process. The editor therefore
//! starts `nota-gtk4-dialogs`, a small GTK4-only helper, for file and print
//! dialogs. Release builds place that helper next to the main executable.

use std::path::{Path, PathBuf};
use std::process::Stdio;

use serde::Deserialize;

use crate::error::{NotaError, Result};

#[derive(Debug, Deserialize)]
struct FileResponse {
    paths: Vec<String>,
}

fn helper_path() -> Option<PathBuf> {
    if let Some(path) = std::env::var_os("NOTA_GTK4_DIALOGS") {
        let path = PathBuf::from(path);
        if path.is_file() {
            return Some(path);
        }
    }
    let path = std::env::current_exe().ok()?.parent()?.join("nota-gtk4-dialogs");
    path.is_file().then_some(path)
}

pub fn file_dialog(request: &serde_json::Value) -> Result<Option<Vec<String>>> {
    let helper = helper_path()
        .ok_or_else(|| NotaError::other("GTK4 dialog helper is not installed"))?;
    let stamp = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|value| value.as_nanos())
        .unwrap_or(0);
    let request_path =
        std::env::temp_dir().join(format!("nota-gtk4-file-{}-{stamp}.json", std::process::id()));
    let body = serde_json::to_vec(request)
        .map_err(|error| NotaError::other(format!("GTK4 dialog request failed: {error}")))?;
    std::fs::write(&request_path, body)
        .map_err(|error| NotaError::other(format!("GTK4 dialog request write failed: {error}")))?;

    let output = crate::proc::background_command(&helper)
        .arg("file")
        .arg(&request_path)
        .stdin(Stdio::null())
        .output();
    let _ = std::fs::remove_file(&request_path);
    let output = output
        .map_err(|error| NotaError::other(format!("GTK4 dialog helper failed to start: {error}")))?;
    if !output.status.success() {
        let error = String::from_utf8_lossy(&output.stderr).trim().to_string();
        return Err(NotaError::other(if error.is_empty() {
            "GTK4 dialog helper exited with an error".to_string()
        } else {
            error
        }));
    }
    let response: FileResponse = serde_json::from_slice(&output.stdout)
        .map_err(|error| NotaError::other(format!("GTK4 dialog response was invalid: {error}")))?;
    Ok((!response.paths.is_empty()).then_some(response.paths))
}

pub fn print_pdf(pdf: &Path) -> Result<()> {
    let helper = helper_path()
        .ok_or_else(|| NotaError::other("GTK4 dialog helper is not installed"))?;
    let output = crate::proc::background_command(&helper)
        .arg("print")
        .arg(pdf)
        .stdin(Stdio::null())
        .output()
        .map_err(|error| NotaError::other(format!("GTK4 print helper failed to start: {error}")))?;
    if output.status.success() {
        Ok(())
    } else {
        let error = String::from_utf8_lossy(&output.stderr).trim().to_string();
        Err(NotaError::other(if error.is_empty() {
            "GTK4 print dialog exited with an error".to_string()
        } else {
            error
        }))
    }
}
