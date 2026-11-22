use std::sync::atomic::{AtomicBool, Ordering};

use tauri::{Emitter, Manager};

use crate::update::{self, DownloadProgress, InstallResult, UpdateStatus};

pub const EVENT_UPDATE_PROGRESS: &str = "nota:update-progress";

static CHECKING: AtomicBool = AtomicBool::new(false);
static INSTALLING: AtomicBool = AtomicBool::new(false);
static CANCEL_DOWNLOAD: AtomicBool = AtomicBool::new(false);

struct SingleFlight<'a>(&'a AtomicBool);

impl<'a> SingleFlight<'a> {
    fn acquire(flag: &'a AtomicBool, busy_message: &str) -> crate::error::Result<Self> {
        flag.compare_exchange(false, true, Ordering::AcqRel, Ordering::Acquire)
            .map_err(|_| crate::error::NotaError::other(busy_message.to_string()))?;
        Ok(Self(flag))
    }
}

impl Drop for SingleFlight<'_> {
    fn drop(&mut self) {
        self.0.store(false, Ordering::Release);
    }
}

#[tauri::command]
pub async fn nota_update_check(app: tauri::AppHandle) -> crate::error::Result<UpdateStatus> {
    let _flight = SingleFlight::acquire(&CHECKING, "An update check is already running")?;
    let replacements = download_rules(&app);
    tauri::async_runtime::spawn_blocking(move || update::check(&replacements))
        .await
        .map_err(|e| crate::error::NotaError::other(format!("Update check worker failed: {e}")))?
}

#[tauri::command]
pub async fn nota_update_install(app: tauri::AppHandle) -> crate::error::Result<InstallResult> {
    let _flight = SingleFlight::acquire(
        &INSTALLING,
        "An update is already downloading or installing",
    )?;
    CANCEL_DOWNLOAD.store(false, Ordering::Release);
    let replacements = download_rules(&app);
    let emitter = app.clone();
    let result = tauri::async_runtime::spawn_blocking(move || {
        update::install(
            &replacements,
            |progress: DownloadProgress| {
                let _ = emitter.emit(EVENT_UPDATE_PROGRESS, progress);
            },
            || CANCEL_DOWNLOAD.load(Ordering::Acquire),
        )
    })
    .await
    .map_err(|e| crate::error::NotaError::other(format!("Update install worker failed: {e}")))?;
    CANCEL_DOWNLOAD.store(false, Ordering::Release);
    result
}

#[tauri::command]
pub fn nota_update_cancel() {
    CANCEL_DOWNLOAD.store(true, Ordering::Release);
}

fn download_rules(app: &tauri::AppHandle) -> String {
    let state = app.state::<crate::state::AppState>();
    state
        .settings
        .lock()
        .map(|s| s.download.replacements.clone())
        .unwrap_or_default()
}
