use std::sync::atomic::{AtomicBool, Ordering};
use std::time::Duration;

use tauri::{Emitter, Manager};

use crate::state::AppState;

const BEAT_INTERVAL: Duration = Duration::from_millis(1000);

#[derive(Default)]
pub struct Heartbeat {
    stopped: AtomicBool,
}

impl Heartbeat {
    pub fn stop(&self) {
        self.stopped.store(true, Ordering::Relaxed);
    }
}

pub fn start(app: tauri::AppHandle) {
    std::thread::spawn(move || loop {
        std::thread::sleep(BEAT_INTERVAL);

        let Some(hb) = app.try_state::<Heartbeat>() else {
            return;
        };
        if hb.stopped.load(Ordering::Relaxed) {
            return;
        }

        let panels: Vec<(String, String)> = {
            let Some(state) = app.try_state::<AppState>() else {
                return;
            };
            let Ok(host) = state.plugins.lock() else {
                return;
            };
            host.live_panels()
        };

        for (plugin, id) in panels {
            let _ = app.emit(
                crate::plugin::EVENT_PANEL_DIRTY,
                serde_json::json!({ "plugin": plugin, "id": id }),
            );
        }
    });
}
