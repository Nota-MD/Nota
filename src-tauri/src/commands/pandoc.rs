use std::path::{Path, PathBuf};

use tauri::AppHandle;

use crate::error::{NotaError, Result};
use crate::pandoc::{self, Format, ImportFormat, PandocExport, PandocImport, PandocProbe, Route};
use crate::pdf_render;

#[tauri::command]
pub async fn nota_pandoc_probe() -> Result<PandocProbe> {
    tauri::async_runtime::spawn_blocking(pandoc::probe)
        .await
        .map_err(|error| {
            NotaError::other(format!(
                "Could not check whether Pandoc is installed: {error}"
            ))
        })
}

#[tauri::command]
pub async fn nota_pandoc_import(format: String, source: String) -> Result<PandocImport> {
    let kind = ImportFormat::from_id(&format)
        .ok_or_else(|| NotaError::other(format!("Unsupported import format: {format}")))?;
    let path = PathBuf::from(source);
    tauri::async_runtime::spawn_blocking(move || pandoc::import_to(kind, &path))
        .await
        .map_err(|error| NotaError::other(format!("Could not start the import task: {error}")))?
}

#[tauri::command]
pub async fn nota_pandoc_export(
    app: AppHandle,
    format: String,
    markdown: String,
    target: String,
    doc_path: Option<String>,
    html: Option<String>,
    theme_css: Option<String>,
    pandoc_args: Option<String>,
) -> Result<PandocExport> {
    let kind = Format::from_id(&format)
        .ok_or_else(|| NotaError::other(format!("Unsupported export format: {format}")))?;
    let target = PathBuf::from(&target);
    let doc_dir = document_directory(doc_path.as_deref());

    let extras = pandoc::PandocExtras {
        theme_css: theme_css.unwrap_or_default(),
        pandoc_args: pandoc_args.unwrap_or_default(),
    };

    let target_3 = target.clone();
    let directory_2 = doc_dir.clone();
    let body_2 = markdown.clone();
    let result_3 = tauri::async_runtime::spawn_blocking(move || {
        pandoc::export_to(kind, &body_2, &target_3, directory_2.as_deref(), &extras)
    })
    .await
    .map_err(|error| NotaError::other(format!("Could not start the export task: {error}")))?;

    match result_3 {
        Ok(warning) => Ok(PandocExport {
            path: target.display().to_string(),
            route: Route::Pandoc,
            note: pandoc_na_ju(kind, &warning),
        }),

        Err(e) if kind == Format::Pdf => {
            let Some(html) = html else {
                return Err(NotaError::other(format!(
                    "Pandoc could not generate a PDF: {}. This request did not include the HTML needed for Nota's built-in layout path.",
                    message_2(&e)
                )));
            };
            let engine = pdf_render::render_2(
                &app,
                &html,
                doc_dir.as_deref(),
                &target,
                crate::pdf_print::PdfLayout::default(),
            )?;
            Ok(PandocExport {
                path: target.display().to_string(),
                route: Route::Nota,



                note: format!(
                    "This PDF used Nota's built-in layout because Pandoc failed ({}). Engine: {}. Install Pandoc and a layout engine such as XeLaTeX or Tectonic for tables of contents and finer pagination.",
                    message_2(&e),
                    engine
                ),
            })
        }
        Err(e) => Err(e),
    }
}

fn pandoc_na_ju(kind: Format, warning: &str) -> String {
    let mut s = format!(
        "{} was converted by the system Pandoc.",
        kind.display_name()
    );
    if kind == Format::Pdf {
        if let Some(engine) = pandoc::find_engine() {
            s.push_str(&format!(" Layout engine: `{engine}`."));
        }
    }
    if !warning.is_empty() {
        s.push_str(&format!(
            "\nPandoc reported warnings; some content may be missing:\n{warning}"
        ));
    }
    s
}

fn document_directory(doc_path: Option<&str>) -> Option<PathBuf> {
    let dir = Path::new(doc_path?).parent()?;
    if dir.as_os_str().is_empty() {
        return None;
    }
    Some(dir.to_path_buf())
}

fn message_2(e: &NotaError) -> String {
    let text = e.to_string();
    let mut xing = text.lines().map(str::trim).filter(|l| !l.is_empty());
    let first_line_2 = xing.next().unwrap_or("");

    let line = if ends_with_colon(first_line_2) {
        xing.find(|l| !ends_with_colon(l)).unwrap_or(first_line_2)
    } else {
        first_line_2
    };
    let duan_2: String = line.chars().take(120).collect();
    if duan_2.is_empty() {
        "Unknown error".to_string()
    } else {
        duan_2
    }
}

fn ends_with_colon(s: &str) -> bool {
    s.ends_with('\u{ff1a}') || s.ends_with(':')
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn document_directory_zhi_ren_cun_guo_pan_de_document() {
        assert_eq!(
            document_directory(Some("/home/u/\u{6587}\u{6863}/\u{7b14}\u{8bb0}.md")),
            Some(PathBuf::from("/home/u/\u{6587}\u{6863}"))
        );

        assert_eq!(document_directory(None), None);

        assert_eq!(document_directory(Some("\u{7b14}\u{8bb0}.md")), None);
    }

    #[test]
    fn summary_zhi_qu_di_yi_xing_qie_bu_hui_tai_zhang() {
        let e = NotaError::other("\u{7b2c}\u{4e00}\u{884c}\u{662f}\u{91cd}\u{70b9}\n\u{7b2c}\u{4e8c}\u{884c}\u{662f}\u{7ec6}\u{8282}");
        assert_eq!(
            message_2(&e),
            "\u{7b2c}\u{4e00}\u{884c}\u{662f}\u{91cd}\u{70b9}"
        );

        let zhang = NotaError::other(format!(
            "{}\n\u{540e}\u{9762}\u{8fd8}\u{6709}",
            "\u{554a}".repeat(300)
        ));
        let s = message_2(&zhang);
        assert_eq!(s.chars().count(), 120);
        assert!(!s.contains('\n'));
    }

    #[test]
    fn empty_error_has_message() {
        assert_eq!(message_2(&NotaError::other("\n  \n")), "Unknown error");
    }

    #[test]
    fn summary_tiao_guo_zhi_you_jie_lun_na_yi_xing() {
        let e = NotaError::other("pandoc \u{6ca1}\u{80fd}\u{751f}\u{6210}PDF\u{ff1a}\npdflatex not found. Please select \u{2026}");
        assert_eq!(message_2(&e), "pdflatex not found. Please select \u{2026}");

        let e = NotaError::other("something failed:\nthe real reason");
        assert_eq!(message_2(&e), "the real reason");

        let e = NotaError::other(
            "\u{53ea}\u{6709}\u{7ed3}\u{8bba}\u{ff1a}\n\u{8fd8}\u{662f}\u{7ed3}\u{8bba}\u{ff1a}",
        );
        assert_eq!(message_2(&e), "\u{53ea}\u{6709}\u{7ed3}\u{8bba}\u{ff1a}");
    }
}
