//! **应用内打印**：先静默印成 PDF，再拿 PDF 出预览，最后把 PDF 投给打印机。
//! （2026-10-17 新建，用户拍板的那条路：原话「**你让它做成PDF然后再预览，
//! 这样问题就基本解决了**」。）
//!
//! # 为什么是"PDF 中转"而不是自己画预览
//!
//! WebKit 的分页在它自己肚子里，`WebKitPrintOperation` **不暴露**
//! `paginate` / `draw-page`（`webkit2gtk` 2.0.2 的绑定里只有 `print` /
//! `run_dialog` 与三个 settings 存取器）。所以想要"真分页"只有一条干净路：
//! 让 WebKit 按目标纸张印一份 PDF，再把**同一份 PDF** 光栅化成预览图。
//! 预览里看到的就是打印机将要收到的东西——不是一份"另画的、可能说谎的"预览。
//!
//! # 三段，各自失败要说人话
//!
//! | 段 | 靠什么 | 没有它时 |
//! |---|---|---|
//! | 出 PDF | `pdf_print.rs`（WebKit 的打印后端，Linux 独有） | 直说"这台系统上没有" |
//! | 数页 / 出图 | `pdfinfo` / `pdftoppm`（poppler 工具） | 直说"装 poppler-utils"，**别假装预览为空** |
//! | 列打印机 / 投递 | `cups.rs` 直连 CUPS Unix socket 说 IPP | 不依赖 `lpstat` / `lp` |
//!
//! ⚠️ PDF 分页与预览仍借系统 poppler；CUPS 那一半不再调用外部客户端。
//!
//! # 临时目录
//!
//! 落到 `cache_dir()/print/<时间戳>/`：PDF 与逐页 PNG 都在那儿，**下次打印时
//! 顺手清掉旧的**（`清旧的`）。不放进用户文档目录：那是我们的中间产物，不是
//! 用户要的文件。

use std::path::{Path, PathBuf};
use std::time::Duration;

use base64::Engine as _;
use serde::{Deserialize, Serialize};
use tauri::AppHandle;

use crate::error::{NotaError, Result};
use crate::proc::{run_capture, Ran, RunOpts};

/// 一台打印机（由 CUPS 的 IPP 属性整理出来）。
#[derive(Debug, Clone, Serialize)]
pub struct 打印机信息 {
    pub name: String,
    /// 状态与 CUPS 的 `printer-info`，例如 `idle · Epson L3150`。
    /// ⚠️ 原样给出去，不翻译："打印机在报什么错"比一句通用的"不可用"有用得多。
    pub description: String,
    pub is_default: bool,
}

/// 打印环境：服务是否可达、列表查询的错误与打印机清单。
#[derive(Debug, Clone, Serialize)]
pub struct 打印环境 {
    pub cups_available: bool,
    /// CUPS 在，但这次 IPP 查询失败时的原因；成功与“服务不存在”都是 `None`。
    pub problem: Option<String>,
    pub printers: Vec<打印机信息>,
}

/// 打印框里那三项版面设置。
#[derive(Debug, Clone, Deserialize)]
pub struct 版面请求 {
    /// `a4` / `a5` / `b5` / `letter` / `legal`（认不出的按 A4 办）。
    pub paper: String,
    pub landscape: bool,
    pub margin_mm: f64,
}

#[derive(Debug, Serialize)]
pub struct 打印预览 {
    /// 那份 PDF 的路径（投递那一步用它）。
    pub pdf: String,
    pub page_count: usize,
    /// 逐页缩略图，`data:image/png;base64,…`。
    pub pages: Vec<String>,
    /// 页数超过 [`预览上限`] 时为真——⚠️ 界面要**说出来**（"只预览前 N 页"），
    /// 不然用户以为文档只有 N 页。
    pub truncated: bool,
}

/// 预览最多出多少页。⚠️ 一页 72dpi 的 PNG 百来 KB，base64 之后再涨三成；
/// 一百页的文档要传几十 MB 过 IPC，那不是预览、那是搬家。
const 预览上限: usize = 40;

/// 预览分辨率（dpi）。72 够看清分页与排版，再高只是白花时间。
const 预览分辨率: &str = "72";

/// 一份临时工作目录（打印一次一个）。
fn 工作目录() -> Result<PathBuf> {
    let 根 = crate::paths::cache_dir()?.join("print");
    crate::paths::ensure_dir(&根)?;
    // ⚠️ 顺手清旧的：里面每一份都是上一次打印的中间产物，留着只占地方。
    清旧的(&根);
    let 名 = format!(
        "{}",
        std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .map(|d| d.as_millis())
            .unwrap_or(0)
    );
    let 目录 = 根.join(名);
    crate::paths::ensure_dir(&目录)?;
    Ok(目录)
}

/// 删掉上一次留下的工作目录。⚠️ **只删我们自己建的那种纯数字目录**，
/// 别去动那个目录里可能存在的别的文件。
fn 清旧的(根: &Path) {
    let Ok(读) = std::fs::read_dir(根) else {
        return;
    };
    for 条 in 读.flatten() {
        let 名 = 条.file_name();
        let 名 = 名.to_string_lossy();
        if 名.chars().all(|c| c.is_ascii_digit()) {
            let _ = std::fs::remove_dir_all(条.path());
        }
    }
}

/// 纸张名字 → (宽, 高) 毫米。认不出的按 A4。
fn 纸张尺寸(名字: &str) -> (f64, f64) {
    match 名字.trim().to_ascii_lowercase().as_str() {
        "a5" => (148.0, 210.0),
        "b5" => (176.0, 250.0),
        "letter" => (215.9, 279.4),
        "legal" => (215.9, 355.6),
        _ => (210.0, 297.0),
    }
}

/// 列出这台机器上的打印机。
///
/// 直接走 `cups.rs` 的 IPP 查询；**不执行 `lpstat`**。服务不在、IPP 查询失败
/// 与真的没有配置打印机是三种不同事实，不能让一个空数组同时代表它们。
pub fn 列打印机() -> 打印环境 {
    #[cfg(target_os = "linux")]
    {
        let 结果 = crate::cups::列打印机();
        打印环境 {
            cups_available: 结果.服务可用,
            problem: 结果.问题,
            printers: 结果
                .打印机
                .into_iter()
                .map(|p| 打印机信息 {
                    name: p.名,
                    description: p.描述,
                    is_default: p.是默认,
                })
                .collect(),
        }
    }
    #[cfg(not(target_os = "linux"))]
    {
        打印环境 {
            cups_available: false,
            problem: None,
            printers: Vec::new(),
        }
    }
}

/// 出 PDF ＋ 出逐页缩略图。
///
/// ⚠️ **先出 PDF 再出图**：预览与真正投递的那份必须是**同一份字节**，
/// 那样"预览里看到 3 页、打出来也是 3 页"才是判据而不是巧合。
pub fn 准备(
    app: &AppHandle,
    html: &str,
    base_dir: Option<&Path>,
    版面: 版面请求,
) -> Result<打印预览> {
    let (宽, 高) = 纸张尺寸(&版面.paper);
    let 目录 = 工作目录()?;
    let pdf = 目录.join("print.pdf");

    #[cfg(target_os = "linux")]
    crate::pdf_print::print_html_to_pdf_with(
        app,
        html,
        base_dir,
        &pdf,
        crate::pdf_print::版面 {
            宽毫米: 宽,
            高毫米: 高,
            横向: 版面.landscape,
            边距毫米: 版面.margin_mm,
        },
    )?;
    #[cfg(not(target_os = "linux"))]
    {
        let _ = (app, html, base_dir, &pdf);
        return Err(NotaError::other(
            "应用内打印目前只在 Linux 上有（它靠的是 WebKitGTK 的打印后端）。\
             这台系统上请用「文件 → 导出 → PDF」，再用系统自己的打印对话框。",
        ));
    }

    let 页数 = 数页(&pdf)?;
    let (pages, truncated) = 出缩略图(&pdf, &目录, 页数)?;

    Ok(打印预览 {
        pdf: pdf.to_string_lossy().to_string(),
        page_count: 页数,
        pages,
        truncated,
    })
}

/// 直接打开系统的打印对话框（不要求应用内先有打印机列表）。
pub fn 系统打印(
    app: &AppHandle,
    html: &str,
    base_dir: Option<&Path>,
    版面: 版面请求,
) -> Result<()> {
    let (宽, 高) = 纸张尺寸(&版面.paper);
    crate::pdf_print::print_html_dialog_with(
        app,
        html,
        base_dir,
        crate::pdf_print::版面 {
            宽毫米: 宽,
            高毫米: 高,
            横向:版面.landscape,
            边距毫米:版面.margin_mm,
        },
    )
}

/// 用 `pdfinfo` 数页。⚠️ 拿不到就报错，**不猜**——猜错的后果是预览少几页、
/// 而用户以为那就是全部。
fn 数页(pdf: &Path) -> Result<usize> {
    let 参 = vec![pdf.to_string_lossy().to_string()];
    match run_capture("pdfinfo", &参, RunOpts::timeout(Duration::from_secs(10))) {
        Ran::Done { ok: true, stdout, .. } => stdout
            .lines()
            .find_map(|行| 行.strip_prefix("Pages:"))
            .and_then(|n| n.trim().parse::<usize>().ok())
            .ok_or_else(|| NotaError::other("pdfinfo 没报出页数（这份 PDF 可能坏了）")),
        Ran::NoProgram => Err(NotaError::other(
            "这台机器上没有 pdfinfo（poppler-utils）。应用内打印要靠它数页与出预览。",
        )),
        Ran::Timeout => Err(NotaError::other("pdfinfo 超过 10 秒没回话")),
        Ran::Done { ok: false, stderr, .. } => Err(NotaError::other(format!(
            "pdfinfo 读不了这份 PDF：{}",
            stderr.trim()
        ))),
        Ran::Failed(e) => Err(NotaError::other(format!("起 pdfinfo 失败：{e}"))),
    }
}

/// 把 PDF 的前 [`预览上限`] 页渲成 PNG，再 base64 成 data URL。
fn 出缩略图(pdf: &Path, 目录: &Path, 页数: usize) -> Result<(Vec<String>, bool)> {
    let 要出 = 页数.min(预览上限);
    let 前缀 = 目录.join("page");
    let 参 = vec![
        "-png".to_string(),
        "-r".to_string(),
        预览分辨率.to_string(),
        "-f".to_string(),
        "1".to_string(),
        "-l".to_string(),
        要出.max(1).to_string(),
        pdf.to_string_lossy().to_string(),
        前缀.to_string_lossy().to_string(),
    ];
    match run_capture(
        "pdftoppm",
        &参,
        RunOpts::timeout(Duration::from_secs(120)),
    ) {
        Ran::Done { ok: true, .. } => {}
        Ran::NoProgram => {
            return Err(NotaError::other(
                "这台机器上没有 pdftoppm（poppler-utils）。应用内打印要靠它出预览图。",
            ))
        }
        Ran::Timeout => return Err(NotaError::other("pdftoppm 出预览超过 120 秒")),
        Ran::Done { ok: false, stderr, .. } => {
            return Err(NotaError::other(format!(
                "pdftoppm 出预览失败：{}",
                stderr.trim()
            )))
        }
        Ran::Failed(e) => return Err(NotaError::other(format!("起 pdftoppm 失败：{e}"))),
    }

    // ⚠️ 文件名是 `page-1.png` / `page-01.png`（pdftoppm 按总页数补零），
    // 所以**按数字排序**而不是按字符串——字符串排序会把 10 排到 2 前面。
    let mut 文件: Vec<(usize, PathBuf)> = std::fs::read_dir(目录)
        .map_err(|e| NotaError::other(format!("读预览目录失败：{e}")))?
        .flatten()
        .filter_map(|条| {
            let 路 = 条.path();
            let 名 = 路.file_name()?.to_string_lossy().to_string();
            let 数字 = 名.strip_prefix("page-")?.strip_suffix(".png")?;
            Some((数字.parse::<usize>().ok()?, 路))
        })
        .collect();
    文件.sort_by_key(|(n, _)| *n);

    let 引擎 = base64::engine::general_purpose::STANDARD;
    let mut 出 = Vec::with_capacity(文件.len());
    for (_, 路) in 文件 {
        let 字节 = std::fs::read(&路)
            .map_err(|e| NotaError::other(format!("读预览图失败：{e}")))?;
        出.push(format!("data:image/png;base64,{}", 引擎.encode(字节)));
    }
    // ⚠️ 一张都没出＝这一步没成，别让界面画一块空白预览当成"这文档是空的"。
    if 出.is_empty() && 页数 > 0 {
        return Err(NotaError::other(
            "pdftoppm 说它跑完了，但一页预览图都没留下",
        ));
    }
    Ok((出, 页数 > 要出))
}

/// 把那份 PDF 投给打印机。
///
/// 直连 CUPS Unix socket 的 `Print-Job`；不再依赖 `lp`。
pub fn 投递(pdf: &Path, printer: &str, copies: u32, ranges: Option<&str>) -> Result<String> {
    #[cfg(not(target_os = "linux"))]
    {
        let _ = (pdf, printer, copies, ranges);
        return Err(NotaError::other("应用内打印目前只在 Linux 上有"));
    }
    #[cfg(target_os = "linux")]
    {
        crate::cups::投递(pdf, printer, copies, ranges)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn 纸张名字认得几个常用的() {
        assert_eq!(纸张尺寸("A4"), (210.0, 297.0));
        assert_eq!(纸张尺寸(" a5 "), (148.0, 210.0));
        assert_eq!(纸张尺寸("Letter"), (215.9, 279.4));
        // ⚠️ 认不出的按 A4——**不是**报错：界面只给那几项，传进来一个怪名字
        // 说明前后端有一边漂了，但让打印失败太狠。
        assert_eq!(纸张尺寸("babylon"), (210.0, 297.0));
    }

    #[test]
    fn 清旧的只碰纯数字目录() {
        let 根 = std::env::temp_dir().join(format!("nota-print-test-{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&根);
        std::fs::create_dir_all(根.join("1712345678")).unwrap();
        std::fs::create_dir_all(根.join("别动我")).unwrap();
        清旧的(&根);
        assert!(!根.join("1712345678").exists(), "纯数字目录该被清掉");
        assert!(根.join("别动我").exists(), "别的名字不许碰");
        let _ = std::fs::remove_dir_all(&根);
    }
}
