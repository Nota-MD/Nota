use tauri::Manager;

use crate::error::{NotaError, Result};
use crate::window_host::{self, WindowRole};

const MAIN_WINDOW: &str = "main";

#[cfg(target_os = "linux")]
pub(crate) fn focus_linux_webview(webview: &webkit2gtk::WebView) {
    use gtk::prelude::{Cast as _, GtkWindowExt as _, WidgetExt as _};

    if let Some(toplevel) = webview
        .toplevel()
        .and_then(|widget| widget.downcast::<gtk::Window>().ok())
    {
        toplevel.set_accept_focus(true);
        toplevel.deiconify();
        toplevel.present();
        if let Some(window) = toplevel.window() {
            window.raise();
            window.focus(gtk::current_event_time());
        }
    }
    webview.grab_focus();
}

#[tauri::command]
pub fn nota_window_show_main(app: tauri::AppHandle) -> Result<()> {
    let window = app
        .get_webview_window(MAIN_WINDOW)
        .ok_or_else(|| NotaError::other(format!("Window `{MAIN_WINDOW}` not found")))?;
    window.set_skip_taskbar(false).map_err(|error| {
        NotaError::other(format!("Could not reveal the taskbar entry: {error}"))
    })?;

    #[cfg(target_os = "windows")]
    window.hide().map_err(|error| {
        NotaError::other(format!("Could not hide the prewarmed window: {error}"))
    })?;
    window
        .center()
        .map_err(|error| NotaError::other(format!("Could not center the main window: {error}")))?;
    window
        .show()
        .map_err(|error| NotaError::other(format!("Could not show the main window: {error}")))?;
    window
        .set_focus()
        .map_err(|error| NotaError::other(format!("Could not focus the main window: {error}")))?;

    #[cfg(target_os = "linux")]
    window
        .with_webview(|webview| focus_linux_webview(&webview.inner()))
        .map_err(|error| {
            NotaError::other(format!("Could not focus the editor WebView: {error}"))
        })?;

    #[cfg(target_os = "linux")]
    {
        let app2 = app.clone();
        gtk::glib::timeout_add_local_once(std::time::Duration::from_millis(60), move || {
            let Some(window) = app2.get_webview_window(MAIN_WINDOW) else {
                return;
            };
            let _ = window.set_focus();
            let _ = window.with_webview(|webview| focus_linux_webview(&webview.inner()));
            let _ = window.eval("window.dispatchEvent(new Event('nota-window-shown'))");
        });
    }

    crate::debug_log!("[nota] editor ready; showing main window");
    Ok(())
}

#[tauri::command]
pub async fn nota_window_open_debug_log() -> Result<()> {
    window_host::launch(WindowRole::DebugLog, None)
        .await
        .map(|_| ())
}

#[tauri::command]
pub fn nota_window_open_devtools(app: tauri::AppHandle) -> Result<()> {
    let window = app
        .get_webview_window(MAIN_WINDOW)
        .ok_or_else(|| NotaError::other(format!("Window `{MAIN_WINDOW}` not found")))?;
    window.open_devtools();
    Ok(())
}

#[tauri::command]
pub async fn nota_window_open_new(path: Option<String>) -> Result<()> {
    let path = path
        .filter(|path| !path.trim().is_empty())
        .map(std::path::PathBuf::from);
    window_host::launch(WindowRole::Editor, path.as_deref())
        .await
        .map(|_| ())
}

#[tauri::command]
pub async fn nota_window_open_settings() -> Result<()> {
    window_host::launch(WindowRole::Settings, None)
        .await
        .map(|_| ())
}

#[tauri::command]
pub fn nota_window_prepare_settings(_app: tauri::AppHandle) -> Result<()> {
    Ok(())
}

#[tauri::command]
pub fn nota_window_hide_settings(app: tauri::AppHandle) -> Result<()> {
    if window_host::current_role() == Some(WindowRole::Settings) {
        app.exit(0);
    }
    Ok(())
}

#[tauri::command]
pub async fn nota_window_open_about() -> Result<()> {
    window_host::launch(WindowRole::About, None)
        .await
        .map(|_| ())
}

#[tauri::command]
pub fn nota_window_prepare_about(_app: tauri::AppHandle) -> Result<()> {
    Ok(())
}

#[tauri::command]
pub fn nota_window_hide_about(app: tauri::AppHandle) -> Result<()> {
    if window_host::current_role() == Some(WindowRole::About) {
        app.exit(0);
    }
    Ok(())
}

#[tauri::command]
pub fn nota_quit(app: tauri::AppHandle) {
    crate::debug_log!("[nota] quit confirmed by frontend");
    app.exit(0);
}
