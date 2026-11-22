use std::sync::mpsc;
use std::time::Duration;

use serde::Serialize;
use tauri::Manager;

use crate::error::{NotaError, Result};

const MAIN_WINDOW: &str = "main";

const WAIT_RETURN_RENDER: Duration = Duration::from_millis(800);

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
pub struct SpellState {
    pub on: bool,

    pub languages: Vec<String>,
}

enum SpellChange {
    ReadOnly,

    Enabled(bool),

    Languages(Vec<String>),

    HardScroll,
}

#[tauri::command]
pub async fn nota_webview_spellcheck_get(app: tauri::AppHandle) -> Result<SpellState> {
    ask_main_thread(app, SpellChange::ReadOnly).await
}

#[tauri::command]
pub async fn nota_webview_spellcheck_set(app: tauri::AppHandle, on: bool) -> Result<bool> {
    Ok(ask_main_thread(app, SpellChange::Enabled(on)).await?.on)
}

#[tauri::command]
pub async fn nota_webview_spellcheck_languages_set(
    app: tauri::AppHandle,
    languages: Vec<String>,
) -> Result<Vec<String>> {
    Ok(ask_main_thread(app, SpellChange::Languages(languages))
        .await?
        .languages)
}

async fn ask_main_thread(app: tauri::AppHandle, changes: SpellChange) -> Result<SpellState> {
    let window_2 = app
        .get_webview_window(MAIN_WINDOW)
        .ok_or_else(|| NotaError::other(format!("Window `{MAIN_WINDOW}` not found")))?;

    let (emit_2, receive_3) = mpsc::channel::<Option<SpellState>>();
    window_2
        .with_webview(move |w| {
            let _ = emit_2.send(read_once(&w, changes));
        })
        .map_err(|error| {
            NotaError::other(format!("Could not access the window webview: {error}"))
        })?;

    match receive_3.recv_timeout(WAIT_RETURN_RENDER) {
        Ok(Some(v)) => Ok(v),

        Ok(None) => Err(NotaError::other(
            "Spell checking can only be changed on Linux with WebKitGTK",
        )),
        Err(_) => Err(NotaError::other(
            "Timed out waiting for the webview; spell checking was not changed",
        )),
    }
}

#[cfg(target_os = "linux")]
fn read_once(w: &tauri::webview::PlatformWebview, changes: SpellChange) -> Option<SpellState> {
    use webkit2gtk::{WebContextExt as _, WebViewExt as _};

    let upper = w.inner().context()?;
    match changes {
        SpellChange::ReadOnly => {}
        SpellChange::Enabled(start) => upper.set_spell_checking_enabled(start),
        SpellChange::HardScroll => {
            use webkit2gtk::SettingsExt as _;
            if let Some(settings_2) = w.inner().settings() {
                settings_2.set_enable_smooth_scrolling(false);
            }
        }
        SpellChange::Languages(language_2) => {
            let borrow: Vec<&str> = language_2.iter().map(String::as_str).collect();
            upper.set_spell_checking_languages(&borrow);
        }
    }

    Some(SpellState {
        on: upper.is_spell_checking_enabled(),

        languages: upper
            .spell_checking_languages()
            .iter()
            .map(|l| l.to_string())
            .collect(),
    })
}

#[cfg(not(target_os = "linux"))]
fn read_once(_w: &tauri::webview::PlatformWebview, changes: SpellChange) -> Option<SpellState> {
    match changes {
        SpellChange::ReadOnly => {}
        SpellChange::Enabled(start) => {
            let _ = start;
        }
        SpellChange::Languages(language_2) => {
            let _ = language_2;
        }
        SpellChange::HardScroll => {}
    }
    None
}

#[tauri::command]
pub async fn nota_webview_scroll_hard(app: tauri::AppHandle) -> Result<()> {
    let _ = ask_main_thread(app, SpellChange::HardScroll).await?;
    Ok(())
}

#[tauri::command]
pub async fn nota_webview_notify_ime_cursor(
    app: tauri::AppHandle,
    x: i32,
    y: i32,
    width: i32,
    height: i32,
) -> Result<()> {
    let window = app
        .get_webview_window(MAIN_WINDOW)
        .ok_or_else(|| NotaError::other(format!("Window `{MAIN_WINDOW}` not found")))?;

    #[cfg(target_os = "linux")]
    {
        use webkit2gtk::{InputMethodContextExt as _, WebViewExt as _};

        window
            .with_webview(move |webview| {
                if let Some(context) = webview.inner().input_method_context() {
                    context.notify_cursor_area(x, y, width, height);
                }
            })
            .map_err(|error| {
                NotaError::other(format!("Could not position the IME caret: {error}"))
            })?;
    }

    #[cfg(not(target_os = "linux"))]
    {
        let _ = (window, x, y, width, height);
    }

    Ok(())
}
