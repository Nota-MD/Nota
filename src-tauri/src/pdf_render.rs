//! 把打印用的 HTML 变成 PDF，**不要求系统里有打印机**。
//!
//! 优先使用系统已安装的 Chromium 系无头浏览器（Chrome / Chromium / Edge），
//! 再尝试 WeasyPrint / wkhtmltopdf；这些都没有时才落到 Linux 的 WebKitGTK
//! 打印后端。浏览器只接收临时 HTML 与目标 PDF 路径，不打开可见窗口。

use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicU64, Ordering};
use std::time::Duration;

use crate::error::{NotaError, Result};
use crate::proc::{run_capture, split_command, Ran, RunOpts};
use crate::pdf_print::版面;

static 临时序号: AtomicU64 = AtomicU64::new(0);

/// 一次 PDF 渲染的临时目录。离开作用域时连浏览器 profile 一起删掉。
struct 临时目录(PathBuf);

impl Drop for 临时目录 {
    fn drop(&mut self) {
        let _ = std::fs::remove_dir_all(&self.0);
    }
}

fn 新建临时目录() -> Result<临时目录> {
    let unique = 临时序号.fetch_add(1, Ordering::Relaxed);
    let stamp = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_millis())
        .unwrap_or(0);
    let root = std::env::temp_dir().join(format!(
        "nota-print-{}-{stamp}-{unique}",
        std::process::id()
    ));
    std::fs::create_dir_all(&root)
        .map_err(|e| NotaError::other(format!("创建 PDF 临时目录失败：{e}")))?;
    Ok(临时目录(root))
}

fn 页面样式(版面: 版面) -> String {
    let (宽, 高) = if 版面.横向 {
        (版面.高毫米, 版面.宽毫米)
    } else {
        (版面.宽毫米, 版面.高毫米)
    };
    let 边距 = 版面.边距毫米;
    format!(
        "<style data-nota-print-page>\
         @page {{ size: {宽}mm {高}mm; margin: {边距}mm; }}\
         html {{ -webkit-print-color-adjust: exact; print-color-adjust: exact; }}\
         </style>"
    )
}

fn 注入页面样式(html: &str, 版面: 版面) -> String {
    let 样式 = 页面样式(版面);
    if let Some(index) = html.to_ascii_lowercase().rfind("</head>") {
        let mut out = String::with_capacity(html.len() + 样式.len());
        out.push_str(&html[..index]);
        out.push_str(&样式);
        out.push_str(&html[index..]);
        out
    } else {
        format!("{样式}{html}")
    }
}

fn 注入基准(html: String, base_dir: Option<&Path>) -> String {
    let Some(dir) = base_dir else {
        return html;
    };
    let Ok(base) = tauri::Url::from_directory_path(dir) else {
        return html;
    };
    let tag = format!("<base href=\"{}\">", base.as_str());
    if let Some(index) = html.to_ascii_lowercase().rfind("</head>") {
        let mut out = String::with_capacity(html.len() + tag.len());
        out.push_str(&html[..index]);
        out.push_str(&tag);
        out.push_str(&html[index..]);
        out
    } else {
        format!("{tag}{html}")
    }
}

fn 浏览器候选() -> Vec<(String, Vec<String>)> {
    if let Ok(custom) = std::env::var("NOTA_BROWSER_CMD") {
        if let Some((program, prefix)) = split_command(&custom) {
            return vec![(program, prefix)];
        }
    }
    let mut names: Vec<String> = if cfg!(target_os = "windows") {
        ["msedge", "microsoft-edge", "chrome", "chromium"]
            .iter()
            .map(|s| (*s).to_string())
            .collect()
    } else if cfg!(target_os = "macos") {
        [
            "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
            "/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge",
            "google-chrome",
            "chromium",
        ]
        .iter()
        .map(|s| (*s).to_string())
        .collect()
    } else {
        [
            "google-chrome",
            "google-chrome-stable",
            "chromium",
            "chromium-browser",
            "microsoft-edge",
        ]
        .iter()
        .map(|s| (*s).to_string())
        .collect()
    };
    if cfg!(target_os = "windows") {
        for key in ["ProgramFiles(x86)", "ProgramFiles", "LocalAppData"] {
            let Ok(root) = std::env::var(key) else { continue };
            names.push(format!(
                "{root}\\Microsoft\\Edge\\Application\\msedge.exe"
            ));
            names.push(format!(
                "{root}\\Google\\Chrome\\Application\\chrome.exe"
            ));
        }
    }
    names.into_iter().map(|name| (name, Vec::new())).collect()
}

fn run_checked(program: &str, args: &[String], timeout: Duration) -> std::result::Result<(), String> {
    match run_capture(program, args, RunOpts::timeout(timeout)) {
        Ran::NoProgram => Err(format!("没有找到 {program}")),
        Ran::Timeout => Err(format!("{program} 超时")),
        Ran::Failed(error) => Err(error),
        Ran::Done { ok: true, .. } => Ok(()),
        Ran::Done { ok: false, stderr, stdout, .. } => {
            let detail = if stderr.trim().is_empty() {
                stdout.trim()
            } else {
                stderr.trim()
            };
            Err(if detail.is_empty() {
                format!("{program} 退出码不是 0")
            } else {
                format!("{program}：{detail}")
            })
        }
    }
}

fn 外部渲染器(
    html: &str,
    base_dir: Option<&Path>,
    target: &Path,
    版面: 版面,
) -> Result<String> {
    target
        .parent()
        .ok_or_else(|| NotaError::other("PDF 目标没有父目录"))?;
    let 临时根 = 新建临时目录()?;
    let 目录 = &临时根.0;
    let 临时 = 目录.join("document.html");
    let 页面 = 注入基准(注入页面样式(html, 版面), base_dir);
    std::fs::write(&临时, 页面)
        .map_err(|e| NotaError::other(format!("写打印 HTML 失败：{e}")))?;
    let 文件地址 = tauri::Url::from_file_path(&临时)
        .map_err(|_| NotaError::other("打印 HTML 路径无法转成 file:// 地址"))?;
    let 目标文本 = target.to_string_lossy().to_string();
    let 文件文本 = 文件地址.as_str().to_string();

    let mut 错误 = Vec::new();
    for (浏览器, prefix) in 浏览器候选() {
        let profile: PathBuf = 目录.join(format!("chromium-{}", 浏览器.replace('.', "-")));
        let mut 参数 = prefix;
        参数.extend([
            "--headless=new".to_string(),
            "--disable-gpu".to_string(),
            "--disable-extensions".to_string(),
            "--no-first-run".to_string(),
            "--no-default-browser-check".to_string(),
            "--disable-dev-shm-usage".to_string(),
            format!("--user-data-dir={}", profile.to_string_lossy()),
            format!("--print-to-pdf={目标文本}"),
            "--print-to-pdf-no-header".to_string(),
            文件文本.clone(),
        ]);
        match run_checked(&浏览器, &参数, Duration::from_secs(60)) {
            Ok(()) if target.is_file() && std::fs::metadata(target).is_ok_and(|m| m.len() > 0) => {
                return Ok(浏览器);
            }
            Ok(()) => 错误.push(format!("{浏览器} 没有产出 PDF")),
            Err(e) => 错误.push(e),
        }
    }

    let weasy = vec![
        临时.to_string_lossy().to_string(),
        目标文本.clone(),
    ];
    match run_checked("weasyprint", &weasy, Duration::from_secs(60)) {
        Ok(()) if target.is_file() && std::fs::metadata(target).is_ok_and(|m| m.len() > 0) => {
            return Ok("weasyprint".to_string());
        }
        Ok(()) => 错误.push("weasyprint 没有产出 PDF".to_string()),
        Err(e) => 错误.push(e),
    }

    let wk = vec![
        "--enable-local-file-access".to_string(),
        临时.to_string_lossy().to_string(),
        目标文本,
    ];
    match run_checked("wkhtmltopdf", &wk, Duration::from_secs(60)) {
        Ok(()) if target.is_file() && std::fs::metadata(target).is_ok_and(|m| m.len() > 0) => {
            Ok("wkhtmltopdf".to_string())
        }
        Ok(()) => {
            错误.push("wkhtmltopdf 没有产出 PDF".to_string());
            Err(NotaError::other(错误.join("；")))
        }
        Err(e) => {
            错误.push(e);
            Err(NotaError::other(错误.join("；")))
        }
    }
}

/// 生成 PDF，返回实际使用的引擎名。
pub fn 渲染(
    app: &tauri::AppHandle,
    html: &str,
    base_dir: Option<&Path>,
    target: &Path,
    版面: 版面,
) -> Result<String> {
    match 外部渲染器(html, base_dir, target, 版面) {
        Ok(engine) => return Ok(engine),
        Err(external) => {
            #[cfg(target_os = "linux")]
            {
                match crate::pdf_print::print_html_to_pdf_with(app, html, base_dir, target, 版面) {
                    Ok(()) => return Ok("webkit2gtk".to_string()),
                    Err(webkit) => {
                        return Err(NotaError::other(format!(
                            "无法生成打印 PDF。Chromium/WeasyPrint/wkhtmltopdf：{external}；WebKitGTK：{webkit}"
                        )))
                    }
                }
            }
            #[cfg(not(target_os = "linux"))]
            {
                let _ = app;
                return Err(NotaError::other(format!(
                    "无法生成打印 PDF。请安装 Microsoft Edge / Google Chrome / Chromium：{external}"
                )));
            }
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn 页面样式写进_head_且横竖尺寸会交换() {
        let html = "<html><head><title>x</title></head><body>x</body></html>";
        let 输出 = 注入页面样式(
            html,
            版面 {
                宽毫米: 210.0,
                高毫米: 297.0,
                横向: true,
                边距毫米: 12.0,
            },
        );
        assert!(输出.contains("size: 297mm 210mm"));
        assert!(输出.contains("margin: 12mm"));
        assert!(输出.find(data_marker()).unwrap() < 输出.find("</head>").unwrap());
    }

    fn data_marker() -> &'static str {
        "data-nota-print-page"
    }

    #[test]
    fn 没有_head_时样式放在最前面() {
        let 输出 = 注入页面样式("<p>x</p>", 版面::default());
        assert!(输出.starts_with("<style data-nota-print-page>"));
    }

    #[test]
    fn 渲染结束会删掉整个临时目录() {
        let 目录 = 新建临时目录().unwrap();
        let 路径 = 目录.0.clone();
        std::fs::write(路径.join("document.html"), "x").unwrap();
        assert!(路径.is_dir());
        drop(目录);
        assert!(!路径.exists(), "临时 HTML 与浏览器 profile 都必须清掉");
    }
}
