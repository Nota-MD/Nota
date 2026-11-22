use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicU64, Ordering};
use std::time::Duration;

use crate::error::{NotaError, Result};
use crate::pdf_print::PdfLayout;
use crate::proc::{run_capture, split_command, Ran, RunOpts};

static TEMP_REQUIRED_NUMBER: AtomicU64 = AtomicU64::new(0);

struct TempDirectory(PathBuf);

impl Drop for TempDirectory {
    fn drop(&mut self) {
        let _ = std::fs::remove_dir_all(&self.0);
    }
}

fn create_temp_directory() -> Result<TempDirectory> {
    let unique = TEMP_REQUIRED_NUMBER.fetch_add(1, Ordering::Relaxed);
    let stamp = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_millis())
        .unwrap_or(0);
    let root = std::env::temp_dir().join(format!(
        "nota-print-{}-{stamp}-{unique}",
        std::process::id()
    ));
    std::fs::create_dir_all(&root).map_err(|e| {
        NotaError::other(format!("Could not create the PDF temporary directory: {e}"))
    })?;
    Ok(TempDirectory(root))
}

fn page_surface_sample_is(layout_2: PdfLayout) -> String {
    let (width, height) = if layout_2.horizontal_item {
        (layout_2.height_number_mi, layout_2.width_number_mi)
    } else {
        (layout_2.width_number_mi, layout_2.height_number_mi)
    };
    let edit_sentence = layout_2.edit_sentence_number_mi;
    format!(
        "<style data-nota-print-page>\
         @page {{ size: {width}mm {height}mm; margin: {edit_sentence}mm; }}\
         html {{ -webkit-print-color-adjust: exact; print-color-adjust: exact; }}\
         </style>"
    )
}

fn main_into_page_surface_sample_is(html: &str, layout_2: PdfLayout) -> String {
    let sample_is = page_surface_sample_is(layout_2);
    if let Some(index) = html.to_ascii_lowercase().rfind("</head>") {
        let mut out = String::with_capacity(html.len() + sample_is.len());
        out.push_str(&html[..index]);
        out.push_str(&sample_is);
        out.push_str(&html[index..]);
        out
    } else {
        format!("{sample_is}{html}")
    }
}

fn main_into_record_ready(html: String, base_dir: Option<&Path>) -> String {
    let Some(dir) = base_dir else {
        return html;
    };
    let Ok(base) = tauri::Url::from_directory_path(dir) else {
        return html;
    };
    let tag = format!("<base href=\"{}\">", base.as_str());
    if let Some(index) = html.to_ascii_lowercase().rfind("</head>") {
        let mut out = String::with_capacity(html.len() + tag.len());
        out.push_str(&html[..index]);
        out.push_str(&tag);
        out.push_str(&html[index..]);
        out
    } else {
        format!("{tag}{html}")
    }
}

fn stream_panel_start_candidates() -> Vec<(String, Vec<String>)> {
    if let Ok(custom) = std::env::var("NOTA_BROWSER_CMD") {
        if let Some((program, prefix)) = split_command(&custom) {
            return vec![(program, prefix)];
        }
    }
    let mut names: Vec<String> = if cfg!(target_os = "windows") {
        ["msedge", "microsoft-edge", "chrome", "chromium"]
            .iter()
            .map(|s| (*s).to_string())
            .collect()
    } else if cfg!(target_os = "macos") {
        [
            "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
            "/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge",
            "google-chrome",
            "chromium",
        ]
        .iter()
        .map(|s| (*s).to_string())
        .collect()
    } else {
        [
            "google-chrome",
            "google-chrome-stable",
            "chromium",
            "chromium-browser",
            "microsoft-edge",
            "/opt/google/chrome/chrome",
            "/opt/google/chrome-beta/chrome",
            "/opt/google/chrome-unstable/chrome",
            "/opt/microsoft/msedge/msedge",
            "/opt/chromium/chromium",
        ]
        .iter()
        .map(|s| (*s).to_string())
        .collect()
    };
    if cfg!(target_os = "windows") {
        for key in ["ProgramFiles(x86)", "ProgramFiles", "LocalAppData"] {
            let Ok(root) = std::env::var(key) else {
                continue;
            };
            names.push(format!("{root}\\Microsoft\\Edge\\Application\\msedge.exe"));
            names.push(format!("{root}\\Google\\Chrome\\Application\\chrome.exe"));
        }
    }
    names.into_iter().map(|name| (name, Vec::new())).collect()
}

fn run_checked(
    program: &str,
    args: &[String],
    timeout: Duration,
) -> std::result::Result<(), String> {
    match run_capture(program, args, RunOpts::timeout(timeout)) {
        Ran::NoProgram => Err(format!("Could not find {program}")),
        Ran::Timeout => Err(format!("{program} timed out")),
        Ran::Failed(error) => Err(error),
        Ran::Done { ok: true, .. } => Ok(()),
        Ran::Done {
            ok: false,
            stderr,
            stdout,
            ..
        } => {
            let detail = if stderr.trim().is_empty() {
                stdout.trim()
            } else {
                stderr.trim()
            };
            Err(if detail.is_empty() {
                format!("{program} exited with a non-zero status")
            } else {
                format!("{program}\u{ff1a}{detail}")
            })
        }
    }
}

fn wai_not_render_start(
    html: &str,
    base_dir: Option<&Path>,
    target: &Path,
    layout_2: PdfLayout,
) -> Result<String> {
    target
        .parent()
        .ok_or_else(|| NotaError::other("The PDF target has no parent directory"))?;
    let temp_root_2 = create_temp_directory()?;
    let directory_2 = &temp_root_2.0;
    let temp_2 = directory_2.join("document.html");
    let page_surface =
        main_into_record_ready(main_into_page_surface_sample_is(html, layout_2), base_dir);
    std::fs::write(&temp_2, page_surface)
        .map_err(|e| NotaError::other(format!("Could not write print HTML: {e}")))?;
    let file_address = tauri::Url::from_file_path(&temp_2)
        .map_err(|_| NotaError::other("Could not convert the print HTML path to a file URL"))?;
    let target_text = target.to_string_lossy().to_string();
    let file_text = file_address.as_str().to_string();

    let mut error_2 = Vec::new();
    for (stream_panel_start, prefix) in stream_panel_start_candidates() {
        let profile: PathBuf =
            directory_2.join(format!("chromium-{}", stream_panel_start.replace('.', "-")));
        let mut args_2 = prefix;
        args_2.extend([
            "--headless=new".to_string(),
            "--disable-gpu".to_string(),
            "--disable-extensions".to_string(),
            "--no-first-run".to_string(),
            "--no-default-browser-check".to_string(),
            "--disable-dev-shm-usage".to_string(),
            format!("--user-data-dir={}", profile.to_string_lossy()),
            format!("--print-to-pdf={target_text}"),
            "--print-to-pdf-no-header".to_string(),
            file_text.clone(),
        ]);
        match run_checked(&stream_panel_start, &args_2, Duration::from_secs(60)) {
            Ok(()) if target.is_file() && std::fs::metadata(target).is_ok_and(|m| m.len() > 0) => {
                return Ok(stream_panel_start);
            }
            Ok(()) => error_2.push(format!("{stream_panel_start} did not produce a PDF")),
            Err(e) => error_2.push(e),
        }
    }

    let weasy = vec![temp_2.to_string_lossy().to_string(), target_text.clone()];
    match run_checked("weasyprint", &weasy, Duration::from_secs(60)) {
        Ok(()) if target.is_file() && std::fs::metadata(target).is_ok_and(|m| m.len() > 0) => {
            return Ok("weasyprint".to_string());
        }
        Ok(()) => error_2.push("WeasyPrint did not produce a PDF".to_string()),
        Err(e) => error_2.push(e),
    }

    let wk = vec![
        "--enable-local-file-access".to_string(),
        temp_2.to_string_lossy().to_string(),
        target_text,
    ];
    match run_checked("wkhtmltopdf", &wk, Duration::from_secs(60)) {
        Ok(()) if target.is_file() && std::fs::metadata(target).is_ok_and(|m| m.len() > 0) => {
            Ok("wkhtmltopdf".to_string())
        }
        Ok(()) => {
            error_2.push("wkhtmltopdf did not produce a PDF".to_string());
            Err(NotaError::other(error_2.join("\u{ff1b}")))
        }
        Err(e) => {
            error_2.push(e);
            Err(NotaError::other(error_2.join("\u{ff1b}")))
        }
    }
}

pub fn render_2(
    app: &tauri::AppHandle,
    html: &str,
    base_dir: Option<&Path>,
    target: &Path,
    layout_2: PdfLayout,
) -> Result<String> {
    match wai_not_render_start(html, base_dir, target, layout_2) {
        Ok(engine) => return Ok(engine),
        Err(external) => {
            #[cfg(target_os = "linux")]
            {
                match crate::pdf_print::print_html_to_pdf_with(app, html, base_dir, target, layout_2) {
                    Ok(()) => return Ok("webkit2gtk".to_string()),
                    Err(webkit) => {
                        return Err(NotaError::other(format!(
                            "Could not generate a print PDF. Chromium/WeasyPrint/wkhtmltopdf: {external}; WebKitGTK: {webkit}"
                        )))
                    }
                }
            }
            #[cfg(not(target_os = "linux"))]
            {
                let _ = app;
                return Err(NotaError::other(format!(
                    "Could not generate a print PDF. Install Microsoft Edge, Google Chrome, or Chromium: {external}"
                )));
            }
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn page_surface_sample_is_write_enter_head_cut_horizontal_data_hold_store_return_call_replace()
    {
        let html = "<html><head><title>x</title></head><body>x</body></html>";
        let data_out = main_into_page_surface_sample_is(
            html,
            PdfLayout {
                width_number_mi: 210.0,
                height_number_mi: 297.0,
                horizontal_item: true,
                edit_sentence_number_mi: 12.0,
            },
        );
        assert!(data_out.contains("size: 297mm 210mm"));
        assert!(data_out.contains("margin: 12mm"));
        assert!(data_out.find(data_marker()).unwrap() < data_out.find("</head>").unwrap());
    }

    fn data_marker() -> &'static str {
        "data-nota-print-page"
    }

    #[test]
    fn each_has_head_is_sample_is_method_at_most_before_surface() {
        let data_out = main_into_page_surface_sample_is("<p>x</p>", PdfLayout::default());
        assert!(data_out.starts_with("<style data-nota-print-page>"));
    }

    #[test]
    fn render_boundary_data_return_delete_drop_validate_temp_directory() {
        let directory_2 = create_temp_directory().unwrap();
        let path_3 = directory_2.0.clone();
        std::fs::write(path_3.join("document.html"), "x").unwrap();
        assert!(path_3.is_dir());
        drop(directory_2);
        assert!(!path_3.exists(), "\u{4e34}\u{65f6} HTML \u{4e0e}\u{6d4f}\u{89c8}\u{5668} profile \u{90fd}\u{5fc5}\u{987b}\u{6e05}\u{6389}");
    }

    #[cfg(target_os = "linux")]
    #[test]
    fn linux_browser_candidates_include_absolute_install_paths() {
        let candidates = stream_panel_start_candidates();
        for expected in ["/opt/google/chrome/chrome", "/opt/microsoft/msedge/msedge"] {
            assert!(
                candidates.iter().any(|(program, _)| program == expected),
                "missing {expected}: {candidates:?}"
            );
        }
    }
}
