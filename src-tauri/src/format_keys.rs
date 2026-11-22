pub const EVENT: &str = "nota:format-key";

#[cfg(target_os = "linux")]
const WINDOW: &str = "main";

#[cfg(target_os = "linux")]
fn identify_key(key_value: u32) -> Option<&'static str> {
    match key_value {
        0x0062 | 0x0042 => Some("bold"),
        0x0069 | 0x0049 => Some("italic"),
        _ => None,
    }
}

#[cfg(target_os = "linux")]
pub fn install(webview: &tauri::Webview) -> Result<(), String> {
    use std::sync::atomic::{AtomicBool, Ordering};

    use gtk::prelude::*;
    use tauri::{Emitter, EventTarget};

    static INSTALLED: AtomicBool = AtomicBool::new(false);

    if webview.label() != WINDOW {
        return Ok(());
    }
    if INSTALLED.load(Ordering::SeqCst) {
        return Ok(());
    }

    let gtk_window = webview
        .window()
        .gtk_window()
        .map_err(|e| format!("Could not access the GTK window: {e}"))?;

    let controller = gtk::EventControllerKey::new(&gtk_window);

    controller.set_propagation_phase(gtk::PropagationPhase::Capture);

    let emitter = webview.clone();
    controller.connect_key_pressed(move |_, key_value, _, modifiers| {
        use gtk::gdk::ModifierType;

        if !modifiers.contains(ModifierType::CONTROL_MASK) {
            return false;
        }

        if modifiers.intersects(
            ModifierType::SHIFT_MASK | ModifierType::MOD1_MASK | ModifierType::SUPER_MASK,
        ) {
            return false;
        }
        let Some(name) = identify_key(key_value) else {
            return false;
        };

        let _ = emitter.emit_to(EventTarget::labeled(WINDOW), EVENT, name);

        true
    });

    INSTALLED.store(true, Ordering::SeqCst);
    Ok(())
}

#[cfg(not(target_os = "linux"))]
pub fn install(_webview: &tauri::Webview) -> Result<(), String> {
    Ok(())
}
