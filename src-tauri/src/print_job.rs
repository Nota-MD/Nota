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
const YU_LAN_SHANG_XIAN: usize = 40;

#[cfg(target_os = "linux")]
const YU_LAN_FEN_BIAN_LV: &str = "72";

#[cfg(target_os = "linux")]
fn gong_zuo_directory() -> Result<PathBuf> {
    let root_2 = crate::paths::cache_dir()?.join("print");
    crate::paths::ensure_dir(&root_2)?;

    qing_jiu_de(&root_2);
    let ming = format!(
        "{}",
        std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .map(|d| d.as_millis())
            .unwrap_or(0)
    );
    let directory_2 = root_2.join(ming);
    crate::paths::ensure_dir(&directory_2)?;
    Ok(directory_2)
}

#[cfg(target_os = "linux")]
fn qing_jiu_de(root_2: &Path) {
    let Ok(read_2) = std::fs::read_dir(root_2) else {
        return;
    };
    for tiao in read_2.flatten() {
        let ming = tiao.file_name();
        let ming = ming.to_string_lossy();
        if ming.chars().all(|c| c.is_ascii_digit()) {
            let _ = std::fs::remove_dir_all(tiao.path());
        }
    }
}

fn zhi_zhang_chi_cun(name_2: &str) -> (f64, f64) {
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
            cups_available: result_3.fu_wu_available,
            problem: result_3.wen_ti,
            printers: result_3
                .print_ji
                .into_iter()
                .map(|p| PrinterInfo {
                    name: p.ming,
                    description: p.miao_shu,
                    is_default: p.shi_default,
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

pub fn zhun_bei(
    app: &AppHandle,
    html: &str,
    base_dir: Option<&Path>,
    layout_2: LayoutRequest,
) -> Result<PrintPreview> {
    #[cfg(target_os = "linux")]
    {
        let (kuan, gao) = zhi_zhang_chi_cun(&layout_2.paper);
        let directory_2 = gong_zuo_directory()?;
        let pdf = directory_2.join("print.pdf");
        let engine = crate::pdf_render::render_2(
            app,
            html,
            base_dir,
            &pdf,
            crate::pdf_print::PdfLayout {
                kuan_hao_mi: kuan,
                gao_hao_mi: gao,
                heng_xiang: layout_2.landscape,
                bian_ju_hao_mi: layout_2.margin_mm,
            },
        )?;

        let ye_shu = shu_ye(&pdf)?;
        let (pages, truncated) = chu_suo_lve_tu(&pdf, &directory_2, ye_shu)?;

        Ok(PrintPreview {
            pdf: pdf.to_string_lossy().to_string(),
            engine,
            page_count: ye_shu,
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
    let (kuan, gao) = zhi_zhang_chi_cun(&layout_2.paper);
    crate::pdf_print::print_html_dialog_with(
        app,
        html,
        base_dir,
        crate::pdf_print::PdfLayout {
            kuan_hao_mi: kuan,
            gao_hao_mi: gao,
            heng_xiang: layout_2.landscape,
            bian_ju_hao_mi: layout_2.margin_mm,
        },
    )
}

#[cfg(target_os = "linux")]
fn shu_ye(pdf: &Path) -> Result<usize> {
    let can_2 = vec![pdf.to_string_lossy().to_string()];
    match run_capture("pdfinfo", &can_2, RunOpts::timeout(Duration::from_secs(10))) {
        Ran::Done {
            ok: true, stdout, ..
        } => stdout
            .lines()
            .find_map(|xing| xing.strip_prefix("Pages:"))
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
fn chu_suo_lve_tu(pdf: &Path, directory_2: &Path, ye_shu: usize) -> Result<(Vec<String>, bool)> {
    let yao_chu = ye_shu.min(YU_LAN_SHANG_XIAN);
    let qian_zhui = directory_2.join("page");
    let can_2 = vec![
        "-png".to_string(),
        "-r".to_string(),
        YU_LAN_FEN_BIAN_LV.to_string(),
        "-f".to_string(),
        "1".to_string(),
        "-l".to_string(),
        yao_chu.max(1).to_string(),
        pdf.to_string_lossy().to_string(),
        qian_zhui.to_string_lossy().to_string(),
    ];
    match run_capture(
        "pdftoppm",
        &can_2,
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
        .filter_map(|tiao| {
            let lu = tiao.path();
            let ming = lu.file_name()?.to_string_lossy().to_string();
            let shu_zi = ming.strip_prefix("page-")?.strip_suffix(".png")?;
            Some((shu_zi.parse::<usize>().ok()?, lu))
        })
        .collect();
    file_3.sort_by_key(|(n, _)| *n);

    let engine_2 = base64::engine::general_purpose::STANDARD;
    let mut chu = Vec::with_capacity(file_3.len());
    for (_, lu) in file_3 {
        let zi_jie = std::fs::read(&lu)
            .map_err(|e| NotaError::other(format!("Could not read the preview image: {e}")))?;
        chu.push(format!("data:image/png;base64,{}", engine_2.encode(zi_jie)));
    }

    if chu.is_empty() && ye_shu > 0 {
        return Err(NotaError::other(
            "pdftoppm completed without producing any preview images",
        ));
    }
    Ok((chu, ye_shu > yao_chu))
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
    fn zhi_zhang_name_ren_de_ji_ge_chang_yong_de() {
        assert_eq!(zhi_zhang_chi_cun("A4"), (210.0, 297.0));
        assert_eq!(zhi_zhang_chi_cun(" a5 "), (148.0, 210.0));
        assert_eq!(zhi_zhang_chi_cun("Letter"), (215.9, 279.4));

        assert_eq!(zhi_zhang_chi_cun("babylon"), (210.0, 297.0));
    }

    #[test]
    fn qing_jiu_de_zhi_peng_chun_shu_zi_directory() {
        let root_2 = std::env::temp_dir().join(format!("nota-print-test-{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&root_2);
        std::fs::create_dir_all(root_2.join("1712345678")).unwrap();
        std::fs::create_dir_all(root_2.join("\u{522b}\u{52a8}\u{6211}")).unwrap();
        qing_jiu_de(&root_2);
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
