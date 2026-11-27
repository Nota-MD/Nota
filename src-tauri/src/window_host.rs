use std::ffi::OsString;
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicU64, Ordering};
use std::time::{Duration, Instant};

use crate::error::{NotaError, Result};

const PREFIX: &str = "--nota-window=";
const ROLE_ENV: &str = "NOTA_WINDOW_ROLE";
const READY_ENV: &str = "NOTA_WINDOW_READY_FILE";
const READY_TIMEOUT: Duration = Duration::from_secs(15);
static READY_SERIAL: AtomicU64 = AtomicU64::new(0);

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum WindowRole {
    Editor,
    Settings,
    About,
    DebugLog,
}

impl WindowRole {
    fn from_name(value: &str) -> Option<Self> {
        match value.trim().to_ascii_lowercase().as_str() {
            "editor" => Some(Self::Editor),
            "settings" => Some(Self::Settings),
            "about" => Some(Self::About),
            "debug-log" => Some(Self::DebugLog),
            _ => None,
        }
    }

    fn name(self) -> &'static str {
        match self {
            Self::Editor => "editor",
            Self::Settings => "settings",
            Self::About => "about",
            Self::DebugLog => "debug-log",
        }
    }

    pub fn argument(self) -> &'static str {
        match self {
            Self::Editor => "--nota-window=editor",
            Self::Settings => "--nota-window=settings",
            Self::About => "--nota-window=about",
            Self::DebugLog => "--nota-window=debug-log",
        }
    }

    pub fn page(self) -> &'static str {
        match self {
            Self::Editor => "index.html",
            Self::Settings => "settings.html",
            Self::About => "about.html",
            Self::DebugLog => "debug-log.html",
        }
    }

    pub fn title(self) -> String {
        let product = crate::distribution_profile::PRODUCT_NAME;
        match self {
            Self::Settings => format!("{product} Settings"),
            Self::About => format!("About {product}"),
            Self::DebugLog => format!("{product} Debug Log"),
            Self::Editor => product.to_owned(),
        }
    }

    pub fn size(self) -> (f64, f64) {
        match self {
            Self::Settings => (1080.0, 700.0),
            Self::About => (560.0, 720.0),
            Self::DebugLog => (920.0, 620.0),
            Self::Editor => (1100.0, 760.0),
        }
    }

    pub fn min_size(self) -> (f64, f64) {
        match self {
            Self::About => (420.0, 500.0),
            Self::Editor => (720.0, 520.0),
            Self::Settings | Self::DebugLog => (420.0, 320.0),
        }
    }

    pub fn utility(self) -> bool {
        self != Self::Editor
    }
}

pub fn requested_role(args: impl IntoIterator<Item = OsString>) -> Option<WindowRole> {
    let mut old_editor = false;
    let mut old_settings = false;
    let mut old_debug = false;
    let mut old_about = false;

    for argument in args.into_iter() {
        let Some(text) = argument.to_str() else {
            continue;
        };
        if let Some(role) = text.strip_prefix(PREFIX) {
            return WindowRole::from_name(role);
        }
        old_editor |= text == crate::cli::NEW_WINDOW_FLAG;
        old_settings |= text == crate::cli::SETTINGS_WINDOW_FLAG;
        old_debug |= text == crate::cli::DEBUG_WINDOW_FLAG;
        old_about |= text == "--about-window";
    }

    if old_settings {
        Some(WindowRole::Settings)
    } else if old_debug {
        Some(WindowRole::DebugLog)
    } else if old_about {
        Some(WindowRole::About)
    } else if old_editor {
        Some(WindowRole::Editor)
    } else {
        None
    }
}

pub fn current_role() -> Option<WindowRole> {
    std::env::var(ROLE_ENV)
        .ok()
        .and_then(|value| WindowRole::from_name(&value))
        .or_else(|| requested_role(std::env::args_os()))
}

pub async fn launch(role: WindowRole, path: Option<&Path>) -> Result<u32> {
    if role == WindowRole::Settings {
        if let Some(pid) = crate::settings_window_host::focus_existing() {
            crate::debug_log!("[nota] focused existing Settings window pid={pid}");
            return Ok(pid);
        }
    }
    let program = std::env::current_exe().map_err(|error| {
        NotaError::other(format!("Could not locate the Nota executable: {error}"))
    })?;
    let ready_path = ready_path();
    let _ = std::fs::remove_file(&ready_path);
    let mut command = crate::proc::background_command(&program);
    command
        .arg(role.argument())
        .env(ROLE_ENV, role.name())
        .env(READY_ENV, &ready_path);
    if let Some(path) = path {
        command.arg(path);
    }
    let mut child = command.spawn().map_err(|error| {
        NotaError::other(format!(
            "Could not launch {:?} window with {}: {error}",
            role,
            program.display()
        ))
    })?;
    let pid = child.id();

    tauri::async_runtime::spawn_blocking(move || {
        let started = Instant::now();
        loop {
            if ready_path.is_file() {
                let _ = std::fs::remove_file(&ready_path);
                return Ok(pid);
            }
            if let Ok(Some(status)) = child.try_wait() {
                return Err(NotaError::other(format!(
                    "{:?} window process exited before ready: {status}",
                    role
                )));
            }
            if started.elapsed() >= READY_TIMEOUT {
                let _ = child.kill();
                return Err(NotaError::other(format!(
                    "{:?} window did not become ready within {} seconds",
                    role,
                    READY_TIMEOUT.as_secs()
                )));
            }
            std::thread::sleep(Duration::from_millis(25));
        }
    })
    .await
    .map_err(|error| NotaError::other(format!("Window readiness worker failed: {error}")))?
}

pub fn signal_ready() {
    let Some(path) = std::env::var_os(READY_ENV).map(PathBuf::from) else {
        return;
    };
    if let Some(parent) = path.parent() {
        let _ = std::fs::create_dir_all(parent);
    }
    let _ = std::fs::write(path, format!("ready {}", std::process::id()));
}

fn ready_path() -> PathBuf {
    let serial = READY_SERIAL.fetch_add(1, Ordering::Relaxed);
    std::env::temp_dir().join(format!(
        "nota-window-ready-{}-{serial}.txt",
        std::process::id()
    ))
}

#[cfg(test)]
mod tests {
    use super::*;

    fn args(values: &[&str]) -> Vec<OsString> {
        values.iter().map(OsString::from).collect()
    }

    #[test]
    fn unified_roles_parse() {
        assert_eq!(
            requested_role(args(&["nota", "--nota-window=settings"])),
            Some(WindowRole::Settings)
        );
        assert_eq!(
            requested_role(args(&["nota", "--nota-window=about"])),
            Some(WindowRole::About)
        );
    }

    #[test]
    fn legacy_flags_keep_working() {
        assert_eq!(
            requested_role(args(&["nota", "--debug-log-window"])),
            Some(WindowRole::DebugLog)
        );
        assert_eq!(
            requested_role(args(&["nota", "--settings-window"])),
            Some(WindowRole::Settings)
        );
        assert_eq!(
            requested_role(args(&["nota", "--new-window"])),
            Some(WindowRole::Editor)
        );
    }

    #[test]
    fn unknown_role_is_rejected() {
        assert_eq!(
            requested_role(args(&["nota", "--nota-window=unknown"])),
            None
        );
        assert_eq!(requested_role(args(&["nota"])), None);
    }
}
