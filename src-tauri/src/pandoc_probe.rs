//! 「系统里那个 pandoc」的**探测那一半**：装没装、能不能出 PDF。
//!
//! # 为什么单独一份（2026-09-29）
//!
//! 原来这一半在 `pandoc.rs` 里（那一份当时 836 行）。拆的线是
//! 「**问这台机器现在能不能用／真的去转换一份文档**」：
//!
//! | 文件 | 管什么 |
//! |---|---|
//! | **本文件** `pandoc_probe.rs` | 跑一次 `--version` 看装没装、在 PATH 里找排版引擎、把结论说成人话 |
//! | `pandoc.rs` | 导出那七种格式：拼参数、喂标准输入、收报错 |
//!
//! ⚠️ 这条线不是按行数切的一半：探测那半边**不碰文档**（唯一的输入是一条命令名），
//! 导出那半边**不判断装没装**（它把探测结论当既成事实）。两边的失败通道都不一样
//! ——探测答的是"能不能用"，导出答的是"这一次成了没有"。
//!
//! ⚠️ `pandoc.rs` 里把本文件的名字**原样转出**（`pub(crate) use super::pandoc_probe::…`），
//! 所以 `crate::pandoc::{ProbeState, probe, find_engine}` 这类老路径一个字不用改
//! ——`commands/pandoc.rs` 走的就是它们。
//!
//! ⚠️ **探测结论不存盘**（`pandoc.rs` 文件头那条"存的是探测结论，不是路径"讲的是
//! 设置项那一侧）：每次现探，实测毫秒级。所以本文件里没有缓存、也不该加。

use std::ffi::OsString;
use std::path::{Path, PathBuf};
use std::time::Duration;

use serde::Serialize;

use crate::proc::{command_or_default, run_capture, split_command, Ran, RunOpts};
// ⚠️ 这两份在 `pandoc.rs` 里（**留在那边**）：`Format` / `FormatInfo` / `格式表`
// 是七种格式的词汇表（真正那份在 `pandoc_format.rs`），`ENV_CMD` / `DEFAULT_CMD`
// 是命令名——探测与导出都要用，所以它们的主场是那一半，这里借过来。
use super::pandoc::{DEFAULT_CMD, ENV_CMD};
use crate::pandoc_format::{FormatInfo, 格式表};

/// 问版本用的旗子。`--version` 是 pandoc 的稳定接口（第一行 `pandoc 3.x`）。
pub(crate) const VERSION_FLAG: &str = "--version";

/// 探测的超时。留得短——pandoc 是本机的一个可执行文件，
/// 不像 `npx` 那类可能去碰网络。
pub(crate) const CHECK_TIMEOUT: Duration = Duration::from_secs(10);

/// 报错时留几行、每行截多长。⚠️ 探测和导出共用这一口径：两边都是同一段裁剪
///（`tail_of` / `first_line`），改这里两边一起变。
pub(crate) const DETAIL_LINES: usize = 8;
pub(crate) const DETAIL_COL: usize = 200;

/// PDF 排版引擎的候选，**顺序即偏好**。
///
/// ⚠️ `xelatex` 排第一不是随手写的：中文文档只有 XeLaTeX / LuaLaTeX / tectonic
/// 走得顺（pdflatex 那套要用 CJK 宏包绕，字体还常缺）。探测到哪个就把它显式
/// 传给 pandoc（`--pdf-engine`）——pandoc 自己的默认是 `pdflatex`，一台只装了
/// xelatex 的机器不加这个参数就会**报"没有 pdflatex"**。
pub(crate) const ENGINES: &[&str] = &[
    "xelatex",
    "lualatex",
    "tectonic",
    "typst",
    "pdflatex",
    "latexmk",
    "wkhtmltopdf",
    "weasyprint",
    "prince",
    "context",
    "pdfroff",
];

// ── 探测 ──────────────────────────────────────────────────────────────────

/// 「装没装」的三种结论。⚠️ 这是**前后端之间的约定**：kebab-case 序列化，
/// 前端按这三档决定"直接导还是先出面板"。改这里的字面（或加减一档）前端会跟着坏，
/// 而那不会在编译期报出来。
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "kebab-case")]
pub enum ProbeState {
    /// 问到了版本 —— 能用。
    Ready,
    /// PATH 里没有这条命令。
    Missing,
    /// 起来了但没问出版本（超时、自定义命令不认 `--version`…）。
    /// ⚠️ 这一档**不判"没装"**：不确实的结论就说"不确实"。
    Unknown,
}

/// 给面板的一份探测报告。
#[derive(Debug, Clone, Serialize)]
pub struct PandocProbe {
    pub state: ProbeState,
    /// 探测用的是哪条命令，原样给用户看。
    pub command: String,
    /// `--version` 吐出来的第一行（拿到了才有），比如 `pandoc 3.1.11`。
    pub version: Option<String>,
    /// 一句话结论。**中文写在这一侧**：措辞要用到命令名、装法这些细节，
    /// 那是只有这一层才知道的东西。
    pub message: String,
    /// 支撑结论的原文：命令自己的输出。
    pub detail: String,
    /// PATH 里找到的第一个 PDF 排版引擎。`None` = 没找到。
    ///
    /// ⚠️ 这**不是**"不能出 PDF"的宣判：引擎可能在非 PATH 的目录、可能配在
    /// pandoc 自己的 defaults 文件里。所以它只影响面板上的那句话（提醒一句），
    /// 不挡着你去试。
    pub pdf_engine: Option<String>,
    /// Nota 自带那套 PDF 兜底在这台机器上在不在（Linux 才有）。
    /// ⚠️ 问 `pdf_print` 而不是在这儿再写一遍平台名：两处各写一份，
    /// 迟早会出现"面板说有兜底、真导时那句'没有'"。
    pub fallback_pdf: bool,
    /// 七种格式的 id / 中文名 / 后缀。前端拿它拼保存对话框的过滤器与默认文件名。
    pub formats: Vec<FormatInfo>,
}

/// 探测本机有没有能用的 pandoc。**不联网、不下载**。
pub fn probe() -> PandocProbe {
    probe_with(&command_or_default(ENV_CMD, DEFAULT_CMD))
}

/// `probe` 的本体。命令从参数进来是为了能单测（环境变量是进程级的，
/// 测试并行跑时互相踩）。
pub(crate) fn probe_with(command: &str) -> PandocProbe {
    let mut out = PandocProbe {
        state: ProbeState::Unknown,
        command: command.to_string(),
        version: None,
        message: String::new(),
        detail: String::new(),
        pdf_engine: find_engine(),
        fallback_pdf: crate::pdf_print::available(),
        formats: 格式表(),
    };

    let Some((program, mut args)) = split_command(command) else {
        out.message = format!("{ENV_CMD} 是空的，没有命令可跑。");
        return out;
    };
    args.push(VERSION_FLAG.to_string());

    // ⚠️ `NO_COLOR`：有些工具会给输出加颜色，那些转义码进到面板里就是乱码。
    let opts = RunOpts::timeout(CHECK_TIMEOUT).env("NO_COLOR", "1");
    match run_capture(&program, &args, opts) {
        Ran::Done { ok: true, stdout, .. } => {
            out.state = ProbeState::Ready;
            out.version = first_line(&stdout);
            out.message = 装好了那句(&out);
        }
        Ran::Done {
            ok: false,
            stdout,
            stderr,
        } => {
            // 起来了、但 `--version` 没跑成 —— 命令认不出这个旗子（自定义命令
            // 常这样）。**不判"没装"**：它可能只是个不认 `--version` 的壳。
            out.state = ProbeState::Unknown;
            out.detail = if stderr.trim().is_empty() {
                tail_of(&stdout)
            } else {
                tail_of(&stderr)
            };
            out.message = format!(
                "`{program}` 起来了，但没问出版本号。可以照常试——真出问题会把它的报错端给你。"
            );
        }
        Ran::NoProgram => {
            out.state = ProbeState::Missing;
            out.message = format!(
                "没找到 `{program}`。七种文档格式（PDF / Word / RTF / EPUB / LaTeX / \
                 OpenDocument / OPML）都由它来转，装好之后这一项就能用。"
            );
            out.detail = "装法见 pandoc 官网（pandoc.org/installing.html）：\n\
                          Debian/Ubuntu: sudo apt install pandoc\n\
                          Fedora:        sudo dnf install pandoc\n\
                          macOS:         brew install pandoc"
                .to_string();
        }
        Ran::Timeout => {
            out.state = ProbeState::Unknown;
            out.message = format!("`{program} --version` 等了 {} 秒没回来。", CHECK_TIMEOUT.as_secs());
        }
        Ran::Failed(msg) => {
            out.state = ProbeState::Unknown;
            out.message = msg;
        }
    }
    out
}

/// Ready 那一档的话：把版本和 PDF 引擎那件事一起说了。
///
/// ⚠️ 单独抽出来是因为这里**有分支**：装了 pandoc 但 PATH 里没有排版引擎时，
/// 六种非 PDF 格式照样能用，只有 PDF 会失败（或者退到 Nota 自带那条）。
/// 一句话把整块功能说成"能用"或"不能用"都是在骗人。
pub(crate) fn 装好了那句(out: &PandocProbe) -> String {
    let version = out.version.as_deref().unwrap_or("版本未知");
    let mut s = format!("找到 pandoc（{version}），七种格式可以导出。");
    if let Some(engine) = &out.pdf_engine {
        s.push_str(&format!("PDF 的排版引擎用 `{engine}`。"));
    } else if out.fallback_pdf {
        s.push_str(
            "PDF 要在 PATH 里找一个排版引擎（xelatex / tectonic 之类）才能由 pandoc 生成，\
             这台机器上没找到；PDF 会改用 Nota 自带的排版，其余六种不受影响。",
        );
    } else {
        s.push_str(
            "PDF 要在 PATH 里找一个排版引擎（xelatex / tectonic 之类）才能由 pandoc 生成，\
             这台机器上没找到，所以 PDF 这一项会失败；其余六种不受影响。",
        );
    }
    s
}

/// 输出的**第一行**非空内容。pandoc 的 `--version` 第一行是 `pandoc 3.1.11`。
pub(crate) fn first_line(text: &str) -> Option<String> {
    text.lines()
        .map(str::trim)
        .find(|l| !l.is_empty())
        .map(|l| l.chars().take(DETAIL_COL).collect())
}

/// 输出末尾留几行。多了面板撑爆，少了看不出病因。
pub(crate) fn tail_of(text: &str) -> String {
    let mut lines: Vec<&str> = text
        .lines()
        .map(str::trim)
        .filter(|l| !l.is_empty())
        .collect();
    if lines.len() > DETAIL_LINES {
        lines.drain(..lines.len() - DETAIL_LINES);
    }
    lines
        .iter()
        .map(|l| l.chars().take(DETAIL_COL).collect::<String>())
        .collect::<Vec<_>>()
        .join("\n")
}

// ── 找 PDF 排版引擎 ───────────────────────────────────────────────────────

/// 在 PATH 里找第一个排版引擎。
///
/// ⚠️ `pub(crate)` 是给命令层用的：导出成功后要告诉用户"这次排版引擎用的是谁"，
/// 而那句话在 `commands/pandoc.rs` 里拼（它是给人看的措辞，不归这一层管）。
pub(crate) fn find_engine() -> Option<String> {
    let path = std::env::var_os("PATH")?;
    find_in_path(ENGINES, &path)
}

/// `find_engine` 的本体：**PATH 从参数进来**，为的是能单测（造一个临时目录，
/// 里面放个假 `xelatex`，比去动真 PATH 靠谱）。
pub(crate) fn find_in_path(names: &[&str], path: &OsString) -> Option<String> {
    let dirs: Vec<PathBuf> = std::env::split_paths(path).collect();
    for name in names {
        for dir in &dirs {
            if dir.as_os_str().is_empty() {
                continue;
            }
            if 可执行文件(&dir.join(name)) {
                return Some((*name).to_string());
            }
        }
    }
    None
}

/// 这个路径上是不是一个**能执行**的文件。
#[cfg(unix)]
fn 可执行文件(path: &Path) -> bool {
    use std::os::unix::fs::PermissionsExt;
    std::fs::metadata(path)
        .map(|m| m.is_file() && m.permissions().mode() & 0o111 != 0)
        .unwrap_or(false)
}

/// Windows：认 `.exe`（PATH 里的可执行文件都带后缀）。
#[cfg(windows)]
fn 可执行文件(path: &Path) -> bool {
    path.is_file() && path.extension().is_some_and(|e| e.eq_ignore_ascii_case("exe"))
}
