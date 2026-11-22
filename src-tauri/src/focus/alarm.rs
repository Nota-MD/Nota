use tauri::{Emitter, Manager};

use crate::settings::Focus;

pub const ALARM_LABEL: &str = "focus-alarm";

pub const EVENT_BEEP: &str = "nota:focus-beep";

pub fn sound_alarm(app: &tauri::AppHandle, settings: &Focus) {
    if settings.sound {
        let _ = app.emit(EVENT_BEEP, ());
    }
    open_window(app);
}

pub fn alarm_title(language: &str) -> &'static str {
    if crate::lang::primary_language(language) == "zh" {
        "Return to writing now"
    } else {
        "Back to writing"
    }
}

pub fn open_window(app: &tauri::AppHandle) {
    if let Some(window) = app.get_webview_window(ALARM_LABEL) {
        let _ = window.set_focus();
        return;
    }

    let result = tauri::WebviewWindowBuilder::new(
        app,
        ALARM_LABEL,
        tauri::WebviewUrl::App("focus-alarm.html".into()),
    )
    .title(alarm_title(&app.state::<crate::state::AppState>().app_lang))
    .decorations(false)
    .always_on_top(true)
    .fullscreen(true)
    .resizable(false)
    .focused(true)
    .build();

    match result {
        Ok(window) => {
            let _ = window.set_focus();
        }
        Err(e) => {
            crate::debug_log!("[nota] focus alarm window failed ({e}); using system beep");
            system_beep();
        }
    }
}

pub fn close_window(app: &tauri::AppHandle) {
    if let Some(window) = app.get_webview_window(ALARM_LABEL) {
        let _ = window.close();
    }
}

pub(super) fn reconcile(app: &tauri::AppHandle, phase: super::FocusStage) {
    let is_open = app.get_webview_window(ALARM_LABEL).is_some();
    if matches!(phase, super::FocusStage::Alarm) {
        if !is_open {
            open_window(app);
        }
    } else if is_open {
        close_window(app);
    }
}

pub fn system_beep() {
    const CANDIDATES: &[&[&str]] = &[
        &["canberra-gtk-play", "-i", "alarm-clock-elapsed"],
        &["canberra-gtk-play", "-i", "dialog-warning"],
        &["aplay", "-q", "/usr/share/sounds/alsa/Front_Center.wav"],
    ];

    for command in CANDIDATES {
        let Some((program, args)) = command.split_first() else {
            continue;
        };
        let started = crate::proc::background_command(program)
            .args(args)
            .stdin(std::process::Stdio::null())
            .stdout(std::process::Stdio::null())
            .stderr(std::process::Stdio::null())
            .spawn();
        if started.is_ok() {
            return;
        }
    }

    crate::debug_log!("[nota] focus alarm: all system beep candidates failed");
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn title_has_chinese_and_english_forms() {
        assert_eq!(alarm_title("zh-CN"), "Return to writing now");
        assert_eq!(alarm_title("en"), "Back to writing");
    }

    #[test]
    fn title_uses_the_primary_language() {
        assert_eq!(alarm_title("zh-TW"), alarm_title("zh-CN"));

        assert_eq!(alarm_title("fr"), "Back to writing");
        assert_eq!(alarm_title(""), "Back to writing");
    }
}
