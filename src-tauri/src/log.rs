//! 调试输出的总闸门。
//!
//! ⚠️ **默认一个字都不往外写。**（用户要求，2026-09-25）
//!
//! 宿主是给人用的桌面程序，不是命令行工具。双击图标进来的人根本看不到 stderr；
//! 从终端敲 `npm run tauri dev` 的人看得到，但「[nota] 载入 2 个插件」这种行
//! 只会让他以为哪里不对。所以这些行**不是错误提示，是给开发者看的**，
//! 一律收到这个闸门后面。
//!
//! 打开闸门：
//!
//! ```text
//! NOTA_DEBUG=1 npm run tauri dev
//! ```
//!
//! # 为什么要单开一个模块，而不是在每个调用点各写一个 `if`
//!
//! 闸门**只在一处**读环境变量，而且**只读一次**（`OnceLock`）。十来个调用点
//! 一律走 [`日志!`] 宏，于是：
//!
//! - 将来要加级别（`NOTA_DEBUG=info`）、要改成写文件、要加时间戳，只动这一个文件；
//! - 不会出现"三处记得判、一处忘了判"，于是默认又有输出。
//!
//! # 什么**不**走这里
//!
//! 用户看得见的东西一律不走：设置文件读坏了有启动 toast（`AppState::settings_problem`），
//! 命令失败有 `NotaError`。判据是一句话——**用户看了也不知道该做什么的，才收进闸门**。
//!
//! 前端的 `console.*` **也不走这里**：它压根不出现在终端里（Tauri 不转发 WebView
//! 的控制台），要看只能开 devtools，而"打开 devtools"这个动作本身就等于"调试模式"。

use std::io::Write;
use std::path::PathBuf;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Mutex;
use std::sync::OnceLock;

static 运行闸门: AtomicBool = AtomicBool::new(false);
static 本进程写过会话头: AtomicBool = AtomicBool::new(false);
static 写锁: Mutex<()> = Mutex::new(());

/// 调试闸门开着没有。
///
/// ⚠️ 环境变量**只在第一次调用时读**，之后一直走缓存：启动之后再 `set_var`
/// 不会生效。这是故意的——为它加一把锁不值得，而且"启动前设好"才是正常用法。
///
/// 认得的写法：`1` / `true` / `yes` / `on`（不分大小写，两头空白不算数）。
/// 其余一律当**关**——包括 `0`、空串、以及根本没设。
pub fn 开着() -> bool {
    static 环境闸门: OnceLock<bool> = OnceLock::new();
    *环境闸门.get_or_init(|| {
        std::env::var("NOTA_DEBUG").is_ok_and(|v| {
            matches!(
                v.trim().to_ascii_lowercase().as_str(),
                "1" | "true" | "yes" | "on"
            )
        })
    }) || 运行闸门.load(Ordering::Relaxed)
}

/// 由「调试模式」设置打开或关闭。环境变量设了 `NOTA_DEBUG` 时始终开着。
pub fn 设置调试模式(on: bool) {
    运行闸门.store(on, Ordering::Relaxed);
}

/// 当前调试日志文件。位置属于“看/排障时产生的状态”，放 `data` 不放 `config`。
pub fn 日志路径() -> Option<PathBuf> {
    crate::paths::data_dir().ok().map(|dir| dir.join("nota-debug.log"))
}

/// 一次增量读取的结果。`reset` 表示文件被新一轮调试会话截断，前端应清空旧内容。
pub struct 日志增量 {
    pub text: String,
    pub offset: u64,
    pub reset: bool,
}

/// 从字节偏移读取日志。与写日志共用同一把锁，不会读到写了一半的 UTF-8。
pub fn 读取增量(offset: u64) -> std::io::Result<日志增量> {
    let _guard = 写锁.lock().unwrap();
    let Some(path) = 日志路径() else {
        return Ok(日志增量 { text: String::new(), offset: 0, reset: true });
    };
    let bytes = match std::fs::read(&path) {
        Ok(bytes) => bytes,
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => {
            return Ok(日志增量 { text: String::new(), offset: 0, reset: true });
        }
        Err(e) => return Err(e),
    };
    let length = bytes.len() as u64;
    let reset = offset > length;
    let from = if reset { 0 } else { offset as usize };
    Ok(日志增量 {
        text: String::from_utf8_lossy(&bytes[from..]).into_owned(),
        offset: length,
        reset,
    })
}

/// 把一行同时写到 stderr 与持久日志。只由 [`日志!`] 在闸门开启后调用。
#[doc(hidden)]
pub fn 记录(message: String) {
    let line = format!(
        "[{}] {message}",
        chrono::Local::now().format("%Y-%m-%d %H:%M:%S%.3f")
    );
    eprintln!("{line}");
    let _guard = 写锁.lock().unwrap();
    let Some(path) = 日志路径() else {
        return;
    };
    if let Some(parent) = path.parent() {
        let _ = std::fs::create_dir_all(parent);
    }
    let first = !本进程写过会话头.swap(true, Ordering::Relaxed);
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

/// 只在调试闸门开着时才往 stderr 写一行。用法和 `eprintln!` 一模一样。
///
/// ```ignore
/// crate::日志!("[nota] 载入 {} 个插件", plugins.count());
/// ```
///
/// ⚠️ 关着的时候**参数根本不会被求值**：`eprintln!` 不执行，格式化和 `Display`
/// 就不发生。所以开着 `if` 的代价只有一次缓存读。
#[macro_export]
macro_rules! 日志 {
    ($($arg:tt)*) => {
        if $crate::log::开着() {
            $crate::log::记录(format!($($arg)*));
        }
    };
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn 运行期调试模式能打开共用闸门() {
        设置调试模式(true);
        assert!(开着());
        设置调试模式(false);
    }
}
