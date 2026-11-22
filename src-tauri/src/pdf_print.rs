use std::path::Path;

#[cfg(target_os = "linux")]
use std::time::Duration;

use tauri::AppHandle;

use crate::error::{NotaError, Result};

#[cfg(target_os = "linux")]
pub(crate) const PRINT_TIMEOUT: Duration = Duration::from_secs(120);

pub(crate) fn available() -> bool {
    cfg!(target_os = "linux")
}

#[derive(Debug, Clone, Copy)]
pub struct PdfLayout {
    pub width_number_mi: f64,
    pub height_number_mi: f64,

    pub horizontal_item: bool,

    pub edit_sentence_number_mi: f64,
}

impl Default for PdfLayout {
    fn default() -> Self {
        Self {
            width_number_mi: 210.0,
            height_number_mi: 297.0,
            horizontal_item: false,
            edit_sentence_number_mi: 12.0,
        }
    }
}

#[cfg(target_os = "linux")]
pub fn print_html_to_pdf(
    app: &AppHandle,
    html: &str,
    base_dir: Option<&Path>,
    target: &Path,
) -> Result<()> {
    linux::infer_refresh(app, html, base_dir, target, PdfLayout::default())
}

#[cfg(target_os = "linux")]
pub fn print_html_to_pdf_with(
    app: &AppHandle,
    html: &str,
    base_dir: Option<&Path>,
    target: &Path,
    layout_2: PdfLayout,
) -> Result<()> {
    linux::infer_refresh(app, html, base_dir, target, layout_2)
}

#[cfg(target_os = "linux")]
pub fn print_html_dialog_with(
    app: &AppHandle,
    html: &str,
    base_dir: Option<&Path>,
    layout_2: PdfLayout,
) -> Result<()> {
    let stamp = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|value| value.as_millis())
        .unwrap_or(0);
    let pdf = std::env::temp_dir().join(format!(
        "nota-portal-print-{}-{stamp}.pdf",
        std::process::id()
    ));
    if crate::pdf_render::render_2(app, html, base_dir, &pdf, layout_2).is_err() {
        linux::infer_refresh(app, html, base_dir, &pdf, layout_2)?;
    }
    if crate::gtk4_dialogs::print_pdf(&pdf).is_ok() {
        let _ = std::fs::remove_file(&pdf);
        return Ok(());
    }
    let portal = linux::portal_print(&pdf);
    let _ = std::fs::remove_file(&pdf);
    portal
}

#[cfg(target_os = "linux")]
mod linux {
    use super::*;
    use std::cell::RefCell;
    use std::os::fd::AsFd;
    use std::sync::mpsc::{self, RecvTimeoutError, Sender};

    use gtk::glib;
    use gtk::prelude::*;

    use webkit2gtk::{PrintOperationExt as _, WebViewExt as _};

    pub(super) fn portal_print(pdf: &Path) -> Result<()> {
        use ashpd::desktop::print::{PageSetup, PrintProxy};

        let file = std::fs::File::open(pdf)
            .map_err(|e| NotaError::other(format!("Could not open the PDF for printing: {e}")))?;
        tauri::async_runtime::block_on(async {
            let proxy = PrintProxy::new().await.map_err(|e| {
                NotaError::other(format!("The system print portal is unavailable: {e}"))
            })?;
            let prepared = proxy
                .prepare_print(
                    None,
                    "Nota",
                    Default::default(),
                    PageSetup::default().display_name("Nota"),
                    None,
                    true,
                )
                .await
                .map_err(|e| {
                    NotaError::other(format!("Could not open the system print dialog: {e}"))
                })?
                .response()
                .map_err(|e| {
                    NotaError::other(format!("The system print dialog returned no result: {e}"))
                })?;
            proxy
                .print(None, "Nota", &file.as_fd(), Some(prepared.token), true)
                .await
                .map_err(|e| {
                    NotaError::other(format!("Could not submit the system print job: {e}"))
                })?;
            Ok(())
        })
    }

    const PRINTER: &str = "Print to File";

    const FORMAT: &str = "pdf";

    const KEY_URI: &str = "output-uri";
    const KEY_FORMAT: &str = "output-file-format";

    thread_local! {
        static INFER_REFRESH_MIDDLE: RefCell<Option<RenderSession>> = const { RefCell::new(None) };
    }

    struct RenderSession {
        window: gtk::Window,

        op: Option<webkit2gtk::PrintOperation>,
    }

    impl Drop for RenderSession {
        fn drop(&mut self) {
            self.window.close();
        }
    }

    fn receive_work() {
        INFER_REFRESH_MIDDLE.with(|c| {
            let _ = c.borrow_mut().take();
        });
    }

    pub(super) fn infer_refresh(
        app: &AppHandle,
        html: &str,
        base_dir: Option<&Path>,
        target: &Path,
        layout_2: super::PdfLayout,
    ) -> Result<()> {
        let target_uri = convert_address(target)?;

        let base_uri = match base_dir {
            Some(dir) => {
                let mut uri = convert_address(dir)?;
                if !uri.ends_with('/') {
                    uri.push('/');
                }
                Some(uri)
            }
            None => None,
        };

        let (tx, rx) = mpsc::channel::<std::result::Result<(), String>>();
        let html = html.to_string();

        app.run_on_main_thread(move || {
            start_infer_refresh(&html, base_uri.as_deref(), &target_uri, layout_2, tx)
        })
        .map_err(|e| {
            NotaError::other(format!(
                "Could not hand the print job to the main thread: {e}"
            ))
        })?;

        match rx.recv_timeout(PRINT_TIMEOUT) {
            Ok(Ok(())) => Ok(()),
            Ok(Err(e)) => Err(NotaError::other(e)),
            Err(RecvTimeoutError::Timeout) => {
                let _ = app.run_on_main_thread(receive_work);
                Err(NotaError::other(format!(
                    "Printing this PDF exceeded {} seconds and was cancelled",
                    PRINT_TIMEOUT.as_secs()
                )))
            }
            Err(RecvTimeoutError::Disconnected) => Err(NotaError::other(
                "The print job stopped responding; the main thread may have exited",
            )),
        }
    }

    fn convert_address(path: &Path) -> Result<String> {
        glib::filename_to_uri(path, None)
            .map(|u| u.to_string())
            .map_err(|e| {
                NotaError::other(format!(
                    "Could not convert {} to a URL: {e}",
                    path.display()
                ))
            })
    }

    fn start_infer_refresh(
        html: &str,
        base_uri: Option<&str>,
        target_uri: &str,
        layout_2: super::PdfLayout,
        tx: Sender<std::result::Result<(), String>>,
    ) {
        let window = gtk::Window::new(gtk::WindowType::Toplevel);
        let webview = webkit2gtk::WebView::new();
        window.add(&webview);
        window.realize();

        INFER_REFRESH_MIDDLE.with(|c| {
            let _ = c.borrow_mut().replace(RenderSession {
                window: window.clone(),
                op: None,
            });
        });

        let settings = gtk::PrintSettings::new();
        settings.set_printer(PRINTER);

        settings.set(KEY_URI, Some(target_uri));
        settings.set(KEY_FORMAT, Some(FORMAT));

        let (width, height) = if layout_2.horizontal_item {
            (layout_2.height_number_mi, layout_2.width_number_mi)
        } else {
            (layout_2.width_number_mi, layout_2.height_number_mi)
        };
        let only_2 = gtk::PaperSize::new_custom("nota-print", "Nota", width, height, gtk::Unit::Mm);
        let page_surface = gtk::PageSetup::new();
        page_surface.set_paper_size(&only_2);
        page_surface.set_top_margin(layout_2.edit_sentence_number_mi, gtk::Unit::Mm);
        page_surface.set_bottom_margin(layout_2.edit_sentence_number_mi, gtk::Unit::Mm);
        page_surface.set_left_margin(layout_2.edit_sentence_number_mi, gtk::Unit::Mm);
        page_surface.set_right_margin(layout_2.edit_sentence_number_mi, gtk::Unit::Mm);

        webview.connect_load_changed(
            glib::clone!(@strong settings, @strong page_surface, @strong tx => move |view, event| {

                if event != webkit2gtk::LoadEvent::Finished {
                    return;
                }
                let op = webkit2gtk::PrintOperation::new(view);
                op.set_print_settings(&settings);


                op.set_page_setup(&page_surface);

                INFER_REFRESH_MIDDLE.with(|c| {
                    if let Some(s) = c.borrow_mut().as_mut() {
                        s.op = Some(op.clone());
                    }
                });

                let success_work = tx.clone();
                op.connect_finished(move |_| {


                    glib::idle_add_local_once(receive_work);
                    let _ = success_work.send(Ok(()));
                });
                let is_percent = tx.clone();
                op.connect_failed(move |_, err| {
                    glib::idle_add_local_once(receive_work);
                    let _ = is_percent.send(Err(format!("WebKit PDF printing failed: {err}")));
                });

                op.print();
            }),
        );

        webview.load_html(html, base_uri);
    }
}

#[cfg(not(target_os = "linux"))]
pub fn print_html_to_pdf(
    _app: &AppHandle,
    _html: &str,
    _base_dir: Option<&Path>,
    _target: &Path,
) -> Result<()> {
    Err(NotaError::other(
        "Nota's built-in PDF layout uses WebKitGTK and is only available on Linux. Install Pandoc and a layout engine to export PDF.",
    ))
}

#[cfg(not(target_os = "linux"))]
pub fn print_html_dialog_with(
    _app: &AppHandle,
    _html: &str,
    _base_dir: Option<&Path>,
    layout: PdfLayout,
) -> Result<()> {
    Err(NotaError::other(
        "The WebKitGTK system print dialog is unavailable on this platform; use the system application's print command.",
    ))
}
