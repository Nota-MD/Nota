use std::path::Path;
#[cfg(target_os = "linux")]
use std::path::PathBuf;
#[cfg(target_os = "linux")]
use std::time::Duration;

#[cfg(target_os = "linux")]
use base64::Engine as _;
use serde::{Deserialize, Serialize};
use tauri::AppHandle;

use crate::error::{NotaError, Result};
#[cfg(target_os = "linux")]
use crate::proc::{run_capture, Ran, RunOpts};

#[derive(Debug, Clone, Serialize)]
pub struct PrinterInfo {
    pub name: String,

    pub description: String,
    pub is_default: bool,
}

#[derive(Debug, Clone, Serialize)]
pub struct PrintEnvironment {
    pub cups_available: bool,

    pub problem: Option<String>,
    pub printers: Vec<PrinterInfo>,
}

#[derive(Debug, Clone, Deserialize)]
pub struct LayoutRequest {
    pub paper: String,
    pub landscape: bool,
    pub margin_mm: f64,
}

#[derive(Debug, Serialize)]
pub struct PrintPreview {
    pub pdf: String,

    pub engine: String,
    pub page_count: usize,

    pub pages: Vec<String>,

    pub truncated: bool,
}

#[cfg(target_os = "linux")]
const AND_PANEL_UPPER_THREAD: usize = 40;

#[cfg(target_os = "linux")]
const AND_PANEL_PART_EDIT_LV: &str = "72";

#[cfg(target_os = "linux")]
fn work_left_directory() -> Result<PathBuf> {
    let root_2 = crate::paths::cache_dir()?.join("print");
    crate::paths::ensure_dir(&root_2)?;

    request_old(&root_2);
    let name = format!(
        "{}",
        std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .map(|d| d.as_millis())
            .unwrap_or(0)
    );
    let directory_2 = root_2.join(name);
    crate::paths::ensure_dir(&directory_2)?;
    Ok(directory_2)
}

#[cfg(target_os = "linux")]
fn request_old(root_2: &Path) {
    let Ok(read_2) = std::fs::read_dir(root_2) else {
        return;
    };
    for item in read_2.flatten() {
        let name = item.file_name();
        let name = name.to_string_lossy();
        if name.chars().all(|c| c.is_ascii_digit()) {
            let _ = std::fs::remove_dir_all(item.path());
        }
    }
}

fn only_length_hold_store(name_2: &str) -> (f64, f64) {
    match name_2.trim().to_ascii_lowercase().as_str() {
        "a5" => (148.0, 210.0),
        "b5" => (176.0, 250.0),
        "letter" => (215.9, 279.4),
        "legal" => (215.9, 355.6),
        _ => (210.0, 297.0),
    }
}

pub fn list_printers() -> PrintEnvironment {
    #[cfg(target_os = "linux")]
    {
        let result_3 = crate::cups::list_printers();
        PrintEnvironment {
            cups_available: result_3.service_none_available,
            problem: result_3.text_question,
            printers: result_3
                .print_record
                .into_iter()
                .map(|p| PrinterInfo {
                    name: p.name,
                    description: p.description_data,
                    is_default: p.is_default,
                })
                .collect(),
        }
    }
    #[cfg(not(target_os = "linux"))]
    {
        PrintEnvironment {
            cups_available: false,
            problem: None,
            printers: Vec::new(),
        }
    }
}

pub fn ready_passive(
    app: &AppHandle,
    html: &str,
    base_dir: Option<&Path>,
    layout_2: LayoutRequest,
) -> Result<PrintPreview> {
    #[cfg(target_os = "linux")]
    {
        let (width, height) = only_length_hold_store(&layout_2.paper);
        let directory_2 = work_left_directory()?;
        let pdf = directory_2.join("print.pdf");
        let engine = crate::pdf_render::render_2(
            app,
            html,
            base_dir,
            &pdf,
            crate::pdf_print::PdfLayout {
                width_number_mi: width,
                height_number_mi: height,
                horizontal_item: layout_2.landscape,
                edit_sentence_number_mi: layout_2.margin_mm,
            },
        )?;

        let page_data = data_page(&pdf)?;
        let (pages, truncated) = out_lock_ignore_image(&pdf, &directory_2, page_data)?;

        Ok(PrintPreview {
            pdf: pdf.to_string_lossy().to_string(),
            engine,
            page_count: page_data,
            pages,
            truncated,
        })
    }

    #[cfg(not(target_os = "linux"))]
    {
        let _ = (app, html, base_dir, layout_2);
        Err(NotaError::other(
            "In-app printing is currently available only on Linux through WebKitGTK. Export to PDF and use the system print dialog on this platform.",
        ))
    }
}

pub fn save_as(pdf: &Path, target: &Path) -> Result<String> {
    let root_2 = crate::paths::cache_dir()?.join("print");
    let source_3 = pdf
        .canonicalize()
        .map_err(|e| NotaError::other(format!("Print PDF not found: {e}")))?;
    let root_2 = root_2
        .canonicalize()
        .map_err(|e| NotaError::other(format!("Print cache directory not found: {e}")))?;
    if !source_3.starts_with(&root_2) {
        return Err(NotaError::other(
            "Refusing to save a file outside the print cache directory",
        ));
    }
    std::fs::copy(&source_3, target)
        .map_err(|e| NotaError::other(format!("Could not save the PDF: {e}")))?;
    Ok(target.to_string_lossy().to_string())
}

pub fn system_print(
    app: &AppHandle,
    html: &str,
    base_dir: Option<&Path>,
    layout_2: LayoutRequest,
) -> Result<()> {
    let (width, height) = only_length_hold_store(&layout_2.paper);
    crate::pdf_print::print_html_dialog_with(
        app,
        html,
        base_dir,
        crate::pdf_print::PdfLayout {
            width_number_mi: width,
            height_number_mi: height,
            horizontal_item: layout_2.landscape,
            edit_sentence_number_mi: layout_2.margin_mm,
        },
    )
}

#[cfg(target_os = "linux")]
fn data_page(pdf: &Path) -> Result<usize> {
    let arguments_value = vec![pdf.to_string_lossy().to_string()];
    match run_capture(
        "pdfinfo",
        &arguments_value,
        RunOpts::timeout(Duration::from_secs(10)),
    ) {
        Ran::Done {
            ok: true, stdout, ..
        } => stdout
            .lines()
            .find_map(|line| line.strip_prefix("Pages:"))
            .and_then(|n| n.trim().parse::<usize>().ok())
            .ok_or_else(|| {
                NotaError::other("pdfinfo did not report a page count; the PDF may be invalid")
            }),
        Ran::NoProgram => Err(NotaError::other(
            "pdfinfo is missing. Install poppler-utils to use in-app printing.",
        )),
        Ran::Timeout => Err(NotaError::other(
            "pdfinfo did not respond within 10 seconds",
        )),
        Ran::Done {
            ok: false, stderr, ..
        } => Err(NotaError::other(format!(
            "pdfinfo could not read this PDF: {}",
            stderr.trim()
        ))),
        Ran::Failed(e) => Err(NotaError::other(format!("Could not start pdfinfo: {e}"))),
    }
}

#[cfg(target_os = "linux")]
fn out_lock_ignore_image(
    pdf: &Path,
    directory_2: &Path,
    page_data: usize,
) -> Result<(Vec<String>, bool)> {
    let need_out = page_data.min(AND_PANEL_UPPER_THREAD);
    let before_append = directory_2.join("page");
    let arguments_value = vec![
        "-png".to_string(),
        "-r".to_string(),
        AND_PANEL_PART_EDIT_LV.to_string(),
        "-f".to_string(),
        "1".to_string(),
        "-l".to_string(),
        need_out.max(1).to_string(),
        pdf.to_string_lossy().to_string(),
        before_append.to_string_lossy().to_string(),
    ];
    match run_capture(
        "pdftoppm",
        &arguments_value,
        RunOpts::timeout(Duration::from_secs(120)),
    ) {
        Ran::Done { ok: true, .. } => {}
        Ran::NoProgram => {
            return Err(NotaError::other(
                "pdftoppm is missing. Install poppler-utils to use in-app print previews.",
            ))
        }
        Ran::Timeout => {
            return Err(NotaError::other(
                "pdftoppm took longer than 120 seconds to create previews",
            ))
        }
        Ran::Done {
            ok: false, stderr, ..
        } => {
            return Err(NotaError::other(format!(
                "pdftoppm failed to create previews: {}",
                stderr.trim()
            )))
        }
        Ran::Failed(e) => return Err(NotaError::other(format!("Could not start pdftoppm: {e}"))),
    }

    let mut file_3: Vec<(usize, PathBuf)> = std::fs::read_dir(directory_2)
        .map_err(|e| NotaError::other(format!("Could not read the preview directory: {e}")))?
        .flatten()
        .filter_map(|item| {
            let path = item.path();
            let name = path.file_name()?.to_string_lossy().to_string();
            let data_character = name.strip_prefix("page-")?.strip_suffix(".png")?;
            Some((data_character.parse::<usize>().ok()?, path))
        })
        .collect();
    file_3.sort_by_key(|(n, _)| *n);

    let engine_2 = base64::engine::general_purpose::STANDARD;
    let mut out = Vec::with_capacity(file_3.len());
    for (_, path) in file_3 {
        let bytes = std::fs::read(&path)
            .map_err(|e| NotaError::other(format!("Could not read the preview image: {e}")))?;
        out.push(format!("data:image/png;base64,{}", engine_2.encode(bytes)));
    }

    if out.is_empty() && page_data > 0 {
        return Err(NotaError::other(
            "pdftoppm completed without producing any preview images",
        ));
    }
    Ok((out, page_data > need_out))
}

pub fn submit(pdf: &Path, printer: &str, copies: u32, ranges: Option<&str>) -> Result<String> {
    #[cfg(not(target_os = "linux"))]
    {
        let _ = (pdf, printer, copies, ranges);
        return Err(NotaError::other(
            "In-app printing is currently available only on Linux",
        ));
    }
    #[cfg(target_os = "linux")]
    {
        crate::cups::submit(pdf, printer, copies, ranges)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn only_length_name_person_record_long_use() {
        assert_eq!(only_length_hold_store("A4"), (210.0, 297.0));
        assert_eq!(only_length_hold_store(" a5 "), (148.0, 210.0));
        assert_eq!(only_length_hold_store("Letter"), (215.9, 279.4));

        assert_eq!(only_length_hold_store("babylon"), (210.0, 297.0));
    }

    #[test]
    fn request_old_only_touch_pure_data_character_directory() {
        let root_2 = std::env::temp_dir().join(format!("nota-print-test-{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&root_2);
        std::fs::create_dir_all(root_2.join("1712345678")).unwrap();
        std::fs::create_dir_all(root_2.join("\u{522b}\u{52a8}\u{6211}")).unwrap();
        request_old(&root_2);
        assert!(
            !root_2.join("1712345678").exists(),
            "\u{7eaf}\u{6570}\u{5b57}\u{76ee}\u{5f55}\u{8be5}\u{88ab}\u{6e05}\u{6389}"
        );
        assert!(
            root_2.join("\u{522b}\u{52a8}\u{6211}").exists(),
            "\u{522b}\u{7684}\u{540d}\u{5b57}\u{4e0d}\u{8bb8}\u{78b0}"
        );
        let _ = std::fs::remove_dir_all(&root_2);
    }
}
