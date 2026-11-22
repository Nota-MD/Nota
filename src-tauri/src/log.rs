use std::io::Write;
use std::path::PathBuf;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Mutex;
use std::sync::OnceLock;

static RUNTIME_GATE: AtomicBool = AtomicBool::new(false);
static SESSION_HEADER_WRITTEN: AtomicBool = AtomicBool::new(false);
static WRITE_LOCK: Mutex<()> = Mutex::new(());

pub fn enabled() -> bool {
    static ENVIRONMENT_GATE: OnceLock<bool> = OnceLock::new();
    *ENVIRONMENT_GATE.get_or_init(|| {
        std::env::var("NOTA_DEBUG").is_ok_and(|v| {
            matches!(
                v.trim().to_ascii_lowercase().as_str(),
                "1" | "true" | "yes" | "on"
            )
        })
    }) || RUNTIME_GATE.load(Ordering::Relaxed)
}

pub fn set_debug_mode(on: bool) {
    RUNTIME_GATE.store(on, Ordering::Relaxed);
}

pub fn log_path() -> Option<PathBuf> {
    crate::paths::data_dir()
        .ok()
        .map(|dir| dir.join("nota-debug.log"))
}

pub struct LogChunk {
    pub text: String,
    pub offset: u64,
    pub reset: bool,
}

pub fn read_increment(offset: u64) -> std::io::Result<LogChunk> {
    let _guard = WRITE_LOCK.lock().unwrap();
    let Some(path) = log_path() else {
        return Ok(LogChunk {
            text: String::new(),
            offset: 0,
            reset: true,
        });
    };
    let bytes = match std::fs::read(&path) {
        Ok(bytes) => bytes,
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => {
            return Ok(LogChunk {
                text: String::new(),
                offset: 0,
                reset: true,
            });
        }
        Err(e) => return Err(e),
    };
    let length = bytes.len() as u64;
    let reset = offset > length;
    let from = if reset { 0 } else { offset as usize };
    Ok(LogChunk {
        text: String::from_utf8_lossy(&bytes[from..]).into_owned(),
        offset: length,
        reset,
    })
}

#[doc(hidden)]
pub fn record(message: String) {
    let line = format!(
        "[{}] {message}",
        chrono::Local::now().format("%Y-%m-%d %H:%M:%S%.3f")
    );
    eprintln!("{line}");
    let _guard = WRITE_LOCK.lock().unwrap();
    let Some(path) = log_path() else {
        return;
    };
    if let Some(parent) = path.parent() {
        let _ = std::fs::create_dir_all(parent);
    }
    let first = !SESSION_HEADER_WRITTEN.swap(true, Ordering::Relaxed);
    let too_large = std::fs::metadata(&path).is_ok_and(|meta| meta.len() > 8 * 1024 * 1024);
    let result = if first || too_large {
        let mut file = match std::fs::File::create(&path) {
            Ok(file) => file,
            Err(_) => return,
        };
        let _ = writeln!(
            file,
            "Nota debug log\nStarted: {}\nProcess: {}\n",
            chrono::Local::now().to_rfc3339(),
            std::process::id()
        );
        writeln!(file, "{line}")
    } else {
        std::fs::OpenOptions::new()
            .create(true)
            .append(true)
            .open(&path)
            .and_then(|mut file| writeln!(file, "{line}"))
    };
    let _ = result;
}

#[macro_export]
macro_rules! debug_log {
    ($($arg:tt)*) => {
        if $crate::log::enabled() {
            $crate::log::record(format!($($arg)*));
        }
    };
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn runtime_debug_mode_opens_the_shared_gate() {
        set_debug_mode(true);
        assert!(enabled());
        set_debug_mode(false);
    }
}
