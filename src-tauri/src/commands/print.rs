use std::path::PathBuf;

use tauri::AppHandle;

use crate::error::Result;
use crate::print_job::{self, LayoutRequest, PrintEnvironment, PrintPreview};

#[tauri::command]
pub fn nota_print_printers() -> PrintEnvironment {
    print_job::list_printers()
}

#[tauri::command]
pub async fn nota_print_prepare(
    app: AppHandle,
    html: String,
    base_dir: Option<String>,
    paper: String,
    landscape: bool,
    margin_mm: f64,
) -> Result<PrintPreview> {
    let directory_2: Option<PathBuf> = base_dir.map(PathBuf::from);
    print_job::zhun_bei(
        &app,
        &html,
        directory_2.as_deref(),
        LayoutRequest {
            paper,
            landscape,
            margin_mm,
        },
    )
}

#[tauri::command]
pub async fn nota_print_system(
    app: AppHandle,
    html: String,
    base_dir: Option<String>,
    paper: String,
    landscape: bool,
    margin_mm: f64,
) -> Result<()> {
    let directory_2: Option<PathBuf> = base_dir.map(PathBuf::from);
    print_job::system_print(
        &app,
        &html,
        directory_2.as_deref(),
        LayoutRequest {
            paper,
            landscape,
            margin_mm,
        },
    )
}

#[tauri::command]
pub async fn nota_print_send(
    pdf: String,
    printer: String,
    copies: u32,
    ranges: Option<String>,
) -> Result<String> {
    print_job::submit(
        std::path::Path::new(&pdf),
        &printer,
        copies.max(1),
        ranges.as_deref(),
    )
}

#[tauri::command]
pub async fn nota_print_save_pdf(pdf: String, target: String) -> Result<String> {
    tauri::async_runtime::spawn_blocking(move || {
        print_job::save_as(std::path::Path::new(&pdf), std::path::Path::new(&target))
    })
    .await
    .map_err(|error| crate::error::NotaError::other(format!("Could not save the PDF: {error}")))?
}

#[tauri::command]
pub fn nota_print_supported() -> bool {
    cfg!(target_os = "linux") || cfg!(target_os = "windows")
}

#[tauri::command]
pub fn nota_print_backend() -> &'static str {
    if cfg!(target_os = "linux") {
        "pdf"
    } else {
        "browser"
    }
}
