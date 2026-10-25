//! 独立调试日志查看：不启动 Tauri，只把当前日志复制为 `.log` 并交给系统查看器。

use std::path::{Path, PathBuf};

use chrono::Local;

use crate::error::{NotaError, Result};

pub fn 生成并打开() -> Result<PathBuf> {
    let source = crate::log::日志路径()
        .ok_or_else(|| NotaError::other("找不到 Nota 数据目录"))?;
    let text = 读取快照(&source);
    let target = std::env::temp_dir().join(format!(
        "nota-debug-{}.log",
        Local::now().format("%Y%m%d-%H%M%S")
    ));
    写文件(&target, &text)?;
    open::that(&target).map_err(|e| {
        NotaError::other(format!(
            "调试日志已写入 {}，但无法打开系统查看器：{e}",
            target.display()
        ))
    })?;
    Ok(target)
}

fn 读取快照(path: &Path) -> String {
    match std::fs::read_to_string(path) {
        Ok(text) if !text.trim().is_empty() => text,
        Ok(_) => 未启用文本(),
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => 未启用文本(),
        Err(e) => format!(
            "Nota debug log\n\nCould not read {}: {e}\n",
            path.display()
        ),
    }
}

fn 未启用文本() -> String {
    "Nota debug log\n\nNo debug log entries are available.\nTurn on developer mode and reproduce the issue, then open this log again.\n".to_string()
}

fn 写文件(path: &Path, text: &str) -> Result<()> {
    std::fs::write(path, text).map_err(|source| NotaError::Write {
        path: path.to_path_buf(),
        source,
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn 缺失日志给明确空态() {
        let dir = std::env::temp_dir().join(format!("nota-log-test-{}", std::process::id()));
        std::fs::create_dir_all(&dir).unwrap();
        let path = dir.join("missing.log");
        let text = 读取快照(&path);
        let _ = std::fs::remove_dir_all(dir);
        assert!(text.contains("No debug log entries"));
    }

    #[test]
    fn 快照原样保留日志内容() {
        let dir = std::env::temp_dir().join(format!("nota-log-test-read-{}", std::process::id()));
        std::fs::create_dir_all(&dir).unwrap();
        let path = dir.join("debug.log");
        std::fs::write(&path, "Nota debug log\n[nota] hello\n").unwrap();
        let text = 读取快照(&path);
        let _ = std::fs::remove_dir_all(dir);
        assert_eq!(text, "Nota debug log\n[nota] hello\n");
    }
}
