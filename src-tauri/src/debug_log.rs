use std::path::{Path, PathBuf};

use chrono::Local;

use crate::error::{NotaError, Result};

pub fn create_and_open() -> Result<PathBuf> {
    let source = crate::log::log_path()
        .ok_or_else(|| NotaError::other("Could not find the Nota data directory"))?;
    let text = read_snapshot(&source);
    let target = std::env::temp_dir().join(format!(
        "nota-debug-{}.log",
        Local::now().format("%Y%m%d-%H%M%S")
    ));
    write_file(&target, &text)?;
    open::that(&target).map_err(|e| {
        NotaError::other(format!(
            "The debug log was written to {}, but the system viewer could not open it: {e}",
            target.display()
        ))
    })?;
    Ok(target)
}

fn read_snapshot(path: &Path) -> String {
    match std::fs::read_to_string(path) {
        Ok(text) if !text.trim().is_empty() => text,
        Ok(_) => disabled_text(),
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => disabled_text(),
        Err(e) => format!("Nota debug log\n\nCould not read {}: {e}\n", path.display()),
    }
}

fn disabled_text() -> String {
    "Nota debug log\n\nNo debug log entries are available.\nTurn on developer mode and reproduce the issue, then open this log again.\n".to_string()
}

fn write_file(path: &Path, text: &str) -> Result<()> {
    std::fs::write(path, text).map_err(|source| NotaError::Write {
        path: path.to_path_buf(),
        source,
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn missing_log_returns_an_explicit_empty_state() {
        let dir = std::env::temp_dir().join(format!("nota-log-test-{}", std::process::id()));
        std::fs::create_dir_all(&dir).unwrap();
        let path = dir.join("missing.log");
        let text = read_snapshot(&path);
        let _ = std::fs::remove_dir_all(dir);
        assert!(text.contains("No debug log entries"));
    }

    #[test]
    fn snapshot_preserves_log_content() {
        let dir = std::env::temp_dir().join(format!("nota-log-test-read-{}", std::process::id()));
        std::fs::create_dir_all(&dir).unwrap();
        let path = dir.join("debug.log");
        std::fs::write(&path, "Nota debug log\n[nota] hello\n").unwrap();
        let text = read_snapshot(&path);
        let _ = std::fs::remove_dir_all(dir);
        assert_eq!(text, "Nota debug log\n[nota] hello\n");
    }
}
