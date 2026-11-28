use tauri::Manager;

#[cfg(not(any(target_os = "linux", target_os = "windows")))]
use crate::error::Result;
#[cfg(any(target_os = "linux", target_os = "windows"))]
use crate::error::{NotaError, Result};

pub fn configure(
    app: &tauri::AppHandle,
    developer_mode: bool,
    allow_shortcuts: bool,
) -> Result<()> {
    let Some(window) = app.get_webview_window("main") else {
        return Ok(());
    };

    #[cfg(not(target_os = "windows"))]
    let _ = allow_shortcuts;

    #[cfg(target_os = "windows")]
    window
        .with_webview(move |webview| unsafe {
            use webview2_com::Microsoft::Web::WebView2::Win32::ICoreWebView2Settings3;
            use windows_core::Interface as _;

            let controller = webview.controller();
            let core = match controller.CoreWebView2() {
                Ok(core) => core,
                Err(error) => {
                    crate::debug_log!("[nota] WebView2 core unavailable: {error}");
                    return;
                }
            };
            let settings = match core.Settings() {
                Ok(settings) => settings,
                Err(error) => {
                    crate::debug_log!("[nota] WebView2 settings unavailable: {error}");
                    return;
                }
            };
            let _ = settings.SetAreDevToolsEnabled(developer_mode);
            if let Ok(settings3) = settings.cast::<ICoreWebView2Settings3>() {
                let _ = settings3
                    .SetAreBrowserAcceleratorKeysEnabled(developer_mode && allow_shortcuts);
            }
        })
        .map_err(|error| {
            NotaError::other(format!("Could not configure WebView security: {error}"))
        })?;

    #[cfg(target_os = "linux")]
    window
        .with_webview(move |webview| {
            use webkit2gtk::{SettingsExt as _, WebViewExt as _};

            if let Some(settings) = webview.inner().settings() {
                settings.set_enable_developer_extras(developer_mode);
            }
        })
        .map_err(|error| {
            NotaError::other(format!("Could not configure WebKit security: {error}"))
        })?;

    #[cfg(not(any(target_os = "linux", target_os = "windows")))]
    let _ = (developer_mode, window);

    Ok(())
}
