//! 「系统里那个 pandoc」——**探测装没装 + 借它导出**那七种格式。
//!
//! # 为什么不捆绑 pandoc（用户 2026-09-25 定的）
//!
//! 捆绑 pandoc 意味着：随应用带一份几十 MB 的可执行文件 + 一整套排版引擎
//! （PDF 那一路要 LaTeX，**几个 GB**），还得跟着上游升级、还得处理三平台各自的
//! 二进制。而 pandoc 在用户机器上**本来就常常有**（写作、学术、Markdown 圈子
//! 几乎是标配），别人也这么干——**探测系统里那个**。所以这一层做事的方式就一条：
//! 只回答"这台机器现在能不能用"，不自带、不下载。
//!
//! # 存的是"探测结论"，不是路径
//!
//! ⚠️ 设置里**没有**"pandoc 路径"这一项，而且不该有（`settings/export.rs` 里有
//! 一条测试盯着）。存下来的路径会过期：用户换了机器、重装了 pandoc、改了 PATH，
//! 那个格子还指着旧地方，于是"明明装了却报没装"。每次现探（实测毫秒级）永远
//! 是对的，代价只是每次多起一个进程——而那一下用户正等着导出，几十毫秒不算什么。
//! 真要固定一条命令，用 `NOTA_PANDOC_CMD`（调试旋钮）。
//!
//! # PDF 为什么是"两段"
//!
//! pandoc 自己**不产 PDF**：它把 Markdown 转成 LaTeX，再交给排版引擎
//! （`xelatex` / `tectonic` / …）出 PDF。所以"装了 pandoc"**不等于**"能出 PDF"，
//! 引擎是另一个要在 PATH 里找的东西（`find_engine`）。
//!
//! 于是 PDF 有一条**兜底**：pandoc 那条路走不通时，用 Nota 自己那套
//! （WebKit 静默打印，见 `commands/pdf_print.rs`）出 PDF，并且**如实说这次走的是
//! 哪条**——用户要能知道这份文件是谁排的版，否则两份"PDF 导出"结果不一样就成了
//! 玄学。非 PDF 的那六种没有兜底：它们全是 pandoc 独有的转换，Nota 自己不做。

use std::ffi::OsString;
use std::path::{Path, PathBuf};
use std::time::Duration;

use serde::Serialize;

use crate::error::{NotaError, Result};
use crate::proc::{command_or_default, run_capture, split_command, Ran, RunOpts};

// ⚠️ 七种格式的词汇表搬去了 `pandoc_format.rs`（那边有为什么拆的说明）。
// **在这里接回原名**：`crate::pandoc::Format` 这类写法（`commands/pandoc.rs`、
// 本文件的探测与导出）一个字都不用改。
pub(crate) use crate::pandoc_format::{Format, FormatInfo, 格式表};

/// 默认命令。⚠️ 就是 PATH 里那个 `pandoc`，**不带任何路径**：写死路径等于把
/// "用户装在哪"当常量，而这是全篇最不该假设的一件事。
pub(crate) const DEFAULT_CMD: &str = "pandoc";

/// 换掉命令的调试旋钮（空格分词，就是 `NOTA_*_CMD` 那一类）。见 `docs/06` §3.4。
pub(crate) const ENV_CMD: &str = "NOTA_PANDOC_CMD";

/// 问版本用的旗子。`--version` 是 pandoc 的稳定接口（第一行 `pandoc 3.x`）。
const VERSION_FLAG: &str = "--version";

/// 探测的超时。留得短——pandoc 是本机的一个可执行文件，
/// 不像 `npx` 那类可能去碰网络。
const CHECK_TIMEOUT: Duration = Duration::from_secs(10);

/// 导出的超时。⚠️ 比探测宽得多：PDF 那一路要跑 LaTeX，大文档 + 首次加载字体
/// 几十秒是正常的；而它**不在主线程上**（见 `commands/pandoc.rs`），等得起。
const EXPORT_TIMEOUT: Duration = Duration::from_secs(180);

/// 报错时留几行、每行截多长。⚠️ 探测和导出共用这一口径：两边都是同一段裁剪
///（`tail_of` / `first_line`），改这里两边一起变。
const DETAIL_LINES: usize = 8;
const DETAIL_COL: usize = 200;

/// PDF 排版引擎的候选，**顺序即偏好**。
///
/// ⚠️ `xelatex` 排第一不是随手写的：中文文档只有 XeLaTeX / LuaLaTeX / tectonic
/// 走得顺（pdflatex 那套要用 CJK 宏包绕，字体还常缺）。探测到哪个就把它显式
/// 传给 pandoc（`--pdf-engine`）——pandoc 自己的默认是 `pdflatex`，一台只装了
/// xelatex 的机器不加这个参数就会**报"没有 pdflatex"**。
const ENGINES: &[&str] = &[
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
fn probe_with(command: &str) -> PandocProbe {
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
fn 装好了那句(out: &PandocProbe) -> String {
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
fn first_line(text: &str) -> Option<String> {
    text.lines()
        .map(str::trim)
        .find(|l| !l.is_empty())
        .map(|l| l.chars().take(DETAIL_COL).collect())
}

/// 输出末尾留几行。多了面板撑爆，少了看不出病因。
fn tail_of(text: &str) -> String {
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
fn find_in_path(names: &[&str], path: &OsString) -> Option<String> {
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

// ── 语言环境（⚠️ 一个会**静默**丢图的坑）────────────────────────────────────

/// 进程当前**说了算**的那个语言环境变量。优先级和 `setlocale` 一致：
/// `LC_ALL` > `LC_CTYPE` > `LANG`（第一个非空的赢）。
fn 有效语言环境() -> Option<String> {
    ["LC_ALL", "LC_CTYPE", "LANG"]
        .iter()
        .find_map(|k| std::env::var(k).ok().filter(|v| !v.is_empty()))
}

/// 是不是一个 UTF-8 的语言环境（`C.UTF-8` / `zh_CN.utf8` / `en_US.UTF-8` 都算）。
fn 是utf8(v: &str) -> bool {
    let v = v.to_ascii_lowercase();
    v.contains("utf-8") || v.contains("utf8")
}

/// pandoc 子进程要不要补一个语言环境。`None` = **别动它**。
///
/// # ⚠️ 为什么非补不可（2026-09-25 实测出来的）
///
/// pandoc 是 Haskell 写的，GHC 的文件名编解码**跟着语言环境走**。语言环境是
/// `POSIX` / `C` 时那个编码是 ASCII，于是**文件名里带非 ASCII 字符的资源一律打不开**：
///
/// ```text
/// $ LANG= LC_ALL= pandoc ... < 测试.md        # 正文里有 ![](./点.png)
/// [WARNING] Could not fetch resource 点.png: replacing image with description
/// 退出码 0
/// ```
///
/// 三条都要命：**退出码是 0**（本模块按成功上报）、**只是一句 WARNING**（在
/// `stderr` 里，成功那一路根本不看）、**图被换成替换文字**。用户拿到一份少了几张图的
/// docx，界面上从头到尾没说过一句话——这正是本仓最不想要的那种失败。
/// 换成 `LANG=C.UTF-8` 再跑，同一份文档三张图（含中文名那张）**全都进去了**。
///
/// # 为什么要判一下、而不是无脑设
///
/// 语言环境是用户的，不是我们的：`zh_CN.UTF-8` 下 pandoc 的报错就是中文，
/// 强行覆盖等于把用户自己选的东西换掉。所以**只在"它现在这个不是 UTF-8"时**补，
/// 补成 `C.UTF-8`（不偏袒任何语言，只把编码这条钉死）。
///
/// ⚠️ 万一某台机器上没有 `C.UTF-8`（glibc 2.35 以前要单独生成），`setlocale`
/// 会失败、退回 `C`——也就是**和现在一模一样**，不会更坏。
///
/// ⚠️ 这一条**只管导出**，不管探测：`--version` 不碰文件名，补了也是白补。
fn 补语言环境() -> Option<(&'static str, &'static str)> {
    match 有效语言环境() {
        Some(v) if 是utf8(&v) => None,
        _ => Some(("LC_ALL", "C.UTF-8")),
    }
}

// ── 导出 ──────────────────────────────────────────────────────────────────

/// 这一份文件是谁排的版。**必须如实回报**，理由见文件头。
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "kebab-case")]
pub enum Route {
    /// 借系统里那个 pandoc。
    Pandoc,
    /// Nota 自带那套（只有 PDF 有）。
    Nota,
}

/// 一次导出的结果。
#[derive(Debug, Clone, Serialize)]
pub struct PandocExport {
    /// 写出去的路径（前端拿它给用户看）。
    pub path: String,
    pub route: Route,
    /// 人话：这次走的哪条、为什么。成功时也要有——用户得知道结果是怎么来的。
    pub note: String,
}

/// 成功那一路也看一眼 `stderr`：pandoc 把**没做成的事**报成 `WARNING` 而不是失败。
///
/// ⚠️ 这一条是 2026-09-25 实测出来的（同一个坑的第二个出口）：一份带
/// `![](./点.png)` 的文档在某台机器上导出"成功"——**退出码 0、文件也在**，
/// 而图全被换成了替换文字，界面上从头到尾一句话都没说。静默地少几张图，
/// 比明说一句"这张图没找到"坏得多。
///
/// 只挑 `WARNING` 那几行，不把 `stderr` 整个端上去：成功的时候那一堆里
/// 多数是无关的杂音，而这段文字要进的是**一句提示语**。
fn 成功时的警告(stderr: &str) -> String {
    /// 最多报几条。⚠️ 有上限是因为提示条就那么宽——一份图全裂的文档能报出几十条，
    /// 挤在一起反而看不清是"哪一类"问题。
    const 最多: usize = 3;
    let mut 行: Vec<String> = stderr
        .lines()
        .map(str::trim)
        .filter(|l| l.contains("WARNING"))
        .map(|l| l.chars().take(DETAIL_COL).collect())
        .collect();
    let 还有 = 行.len().saturating_sub(最多);
    行.truncate(最多);
    let mut s = 行.join("\n");
    if 还有 > 0 {
        s.push_str(&format!("\n（另有 {还有} 条同类的没列出来）"));
    }
    s
}

/// 用 pandoc 把 Markdown 转成 `target`。
///
/// ⚠️ 正文**从标准输入喂**（而不是写成临时文件）：Markdown 可能有几 MB，
/// 而只要落成文件就得选落点——落在文档目录是往用户目录里写东西，
/// 落在临时目录又会让 `![](./img.png)` 集体裂图。走标准输入一个都不用选，
/// 相对路径改由 `--resource-path` + `cwd` 指明（见下）。
///
/// 返回的是**成功时 pandoc 报的警告**（可能为空）——见 `成功时的警告`。
pub(crate) fn export_to(
    format: Format,
    markdown: &str,
    target: &Path,
    doc_dir: Option<&Path>,
) -> Result<String> {
    let command = command_or_default(ENV_CMD, DEFAULT_CMD);
    let engine = find_engine();
    export_with(&command, format, markdown, target, doc_dir, engine.as_deref())
}

/// `export_to` 的本体：命令和引擎都从参数进来（能单测，也能让探测的结论复用）。
fn export_with(
    command: &str,
    format: Format,
    markdown: &str,
    target: &Path,
    doc_dir: Option<&Path>,
    engine: Option<&str>,
) -> Result<String> {
    let Some((program, args)) = split_command(command) else {
        return Err(NotaError::other(format!("{ENV_CMD} 是空的，没有命令可跑")));
    };
    let args = build_args(&args, format, target, doc_dir, engine);

    let mut opts = RunOpts::timeout(EXPORT_TIMEOUT)
        .stdin(markdown.to_string())
        .env("NO_COLOR", "1");
    // ⚠️ 语言环境不是 UTF-8 时要补一个，否则**中文名的图片会被静默丢掉**
    //（理由见 `补语言环境` 那段）。
    if let Some((k, v)) = 补语言环境() {
        opts = opts.env(k, v);
    }
    // ⚠️ `cwd` 和 `--resource-path` 是**两条独立的路**，都要给：前者决定
    // pandoc 相对谁找文件（正文里 `![](./img.png)` 的基准），后者是 pandoc
    // 专门给"输入不是文件"时补的资源搜索路径。
    if let Some(dir) = doc_dir {
        opts = opts.cwd(dir);
    }

    let 命令全称 = format!("{} {}", program, args.join(" "));
    match run_capture(&program, &args, opts) {
        Ran::Done {
            ok: true, stderr, ..
        } => {
            // ⚠️ 退出码是 0 也确认一下文件在不在：某些写坏了的情况下 pandoc
            // 会"成功"返回而没留下文件，那种时候告诉用户"导好了"是最坏的结果。
            if !target.is_file() {
                return Err(NotaError::other(format!(
                    "pandoc 说成功了，但 {} 没有生成。命令是：{命令全称}",
                    target.display()
                )));
            }
            // ⚠️ 成功不等于**全都做成了**：见 `成功时的警告`。
            Ok(成功时的警告(&stderr))
        }
        Ran::Done {
            ok: false,
            stdout,
            stderr,
        } => {
            let 病因 = if stderr.trim().is_empty() {
                tail_of(&stdout)
            } else {
                tail_of(&stderr)
            };
            Err(NotaError::other(format!(
                "pandoc 没能生成{}：\n{病因}",
                format.名字()
            )))
        }
        Ran::NoProgram => Err(NotaError::other(format!(
            "没找到 `{program}`（`{ENV_CMD}` 可以换一条命令）"
        ))),
        Ran::Timeout => Err(NotaError::other(format!(
            "pandoc 跑了 {} 秒还没结束，已经掐掉了。命令是：{命令全称}",
            EXPORT_TIMEOUT.as_secs()
        ))),
        Ran::Failed(msg) => Err(NotaError::other(msg)),
    }
}

/// 拼 pandoc 的命令行。**纯函数**——这是唯一一处"参数怎么给"的地方，
/// 单测直接盯着它，不必真跑 pandoc。
fn build_args(
    prefix: &[String],
    format: Format,
    target: &Path,
    doc_dir: Option<&Path>,
    engine: Option<&str>,
) -> Vec<String> {
    let mut args = prefix.to_vec();
    // ⚠️ `--from=markdown` 显式写出来：pandoc 的默认读入就是它，但默认值会随
    // 版本变，而这一条决定了 `$公式$`、脚注、管道表格认不认。选它而不是 `gfm`：
    // pandoc 方言是 gfm 的超集（表格、删除线都在，另有数学和脚注），
    // 而 `gfm` 读不了数学——一份带公式的文档转出来会变成一堆 `$`。
    args.push("--from=markdown".to_string());
    args.push(format!("--to={}", format.to()));
    // `-s`：要一份**完整文档**而不是片段（LaTeX 尤其明显，不加就只有一个正文块）。
    args.push("--standalone".to_string());
    if let Some(dir) = doc_dir {
        args.push(format!("--resource-path={}", dir.display()));
    }
    // ⚠️ 只在 PDF 这一路给：其它格式给了会被 pandoc 当成"忽略的参数"或直接报错。
    if format == Format::Pdf {
        if let Some(engine) = engine {
            args.push(format!("--pdf-engine={engine}"));
        }
    }
    args.push("-o".to_string());
    args.push(target.display().to_string());
    args
}

#[cfg(test)]
mod tests {
    use super::*;

    /// 一个自己的临时目录（带用例名和进程号，并行跑的用例各用各的）。
    fn temp_dir(tag: &str) -> PathBuf {
        let dir = std::env::temp_dir().join(format!("nota-pandoc-test-{tag}-{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&dir);
        std::fs::create_dir_all(&dir).expect("建临时目录");
        dir
    }

    /// 造一条假的 `pandoc`：**写成脚本文件**，不是拼一行命令。
    ///
    /// ⚠️ 试过"拼一行"（`printf 1.2.3` 当假 CLI、`sh -c '…'` 当假导出器），
    /// 两回都不行：`split_command` **按空白分词、不认引号**（见 `proc.rs`），
    /// 而 `printf` 会把第一个参数当格式串吃掉。脚本没有这些问题，也更像
    /// 用户真正会配的那种包装脚本。
    #[cfg(unix)]
    fn 假命令(tag: &str, 正文: &str) -> PathBuf {
        use std::os::unix::fs::PermissionsExt;
        let path = temp_dir(tag).join("假pandoc");
        std::fs::write(&path, format!("#!/bin/sh\n{正文}\n")).unwrap();
        // ⚠️ 必须带可执行位：不带的话 `spawn` 报的是 PermissionDenied，
        // 那会走成"起来了但失败"这一档，把要测的那条路整个绕过去。
        std::fs::set_permissions(&path, std::fs::Permissions::from_mode(0o755)).unwrap();
        path
    }

    // ── 命令行 ────────────────────────────────────────────────────────────

    #[test]
    fn 参数里有标准输入之外的输入路径信息() {
        let args = build_args(
            &[],
            Format::Docx,
            Path::new("/tmp/出.docx"),
            Some(Path::new("/home/u/文档")),
            None,
        );
        assert!(args.contains(&"--from=markdown".to_string()));
        assert!(args.contains(&"--to=docx".to_string()));
        assert!(args.contains(&"--standalone".to_string()));
        assert!(args.contains(&"--resource-path=/home/u/文档".to_string()));
        // 正文走标准输入，所以**不许**出现输入文件参数（出现了就会和 stdin 打架）。
        assert!(!args.iter().any(|a| a.ends_with(".md")), "{args:?}");
        assert_eq!(args.last().unwrap(), "/tmp/出.docx");
    }

    #[test]
    fn 排版引擎只给_pdf_而且只在找到时给() {
        let pdf = build_args(&[], Format::Pdf, Path::new("/tmp/a.pdf"), None, Some("xelatex"));
        assert!(pdf.contains(&"--pdf-engine=xelatex".to_string()), "{pdf:?}");

        // 没找到引擎就不给这个参数：pandoc 会用它自己的默认（pdflatex），
        // 由它去报"没有 pdflatex"——那句报错比我们编的准。
        let 没引擎 = build_args(&[], Format::Pdf, Path::new("/tmp/a.pdf"), None, None);
        assert!(!没引擎.iter().any(|a| a.starts_with("--pdf-engine")));

        // docx 就算探测到了引擎也不给。
        let docx = build_args(&[], Format::Docx, Path::new("/tmp/a.docx"), None, Some("xelatex"));
        assert!(!docx.iter().any(|a| a.starts_with("--pdf-engine")), "{docx:?}");
    }

    #[test]
    fn 前缀命令的参数排在前面() {
        // `NOTA_PANDOC_CMD="pandoc --sandbox"` 这类用法：用户给的参数不能被丢掉。
        let args = build_args(
            &["--sandbox".to_string()],
            Format::Odt,
            Path::new("/tmp/a.odt"),
            None,
            None,
        );
        assert_eq!(args[0], "--sandbox");
        assert_eq!(args[1], "--from=markdown");
    }

    // ── 探测 ──────────────────────────────────────────────────────────────

    #[test]
    fn 没装时报的是没装而不是别的() {
        let out = probe_with("nota-绝对没有这个命令");
        assert_eq!(out.state, ProbeState::Missing);
        assert!(out.message.contains("没找到"), "{}", out.message);
        // 面板上要能直接照着装——报错里必须有点能照做的东西。
        assert!(out.detail.contains("install pandoc"), "{}", out.detail);
        assert!(out.version.is_none());
    }

    #[test]
    #[cfg(unix)]
    fn 问到版本就是能用() {
        // ⚠️ 真起进程，不用 mock——探测的全部风险就在"真程序在真系统上怎么反应"。
        let 假 = 假命令("version", "echo pandoc 3.1.11");
        let out = probe_with(&假.display().to_string());
        assert_eq!(out.state, ProbeState::Ready, "{}", out.detail);
        assert_eq!(out.version.as_deref(), Some("pandoc 3.1.11"));
        assert!(out.message.contains("pandoc 3.1.11"), "{}", out.message);
    }

    #[test]
    #[cfg(unix)]
    fn 挂住的命令判不确实而不是判没装() {
        // ⚠️ 自定义命令挂住时**不许**说"没装"：用户明明装了一个，正是他自己
        // 配的那条命令有问题，说成"没找到"会把他引到完全错的方向去。
        let 假 = 假命令("hang", "sleep 30");
        let out = probe_with(&假.display().to_string());
        assert_eq!(out.state, ProbeState::Unknown);
        assert!(out.message.contains("没回来"), "{}", out.message);
    }

    #[test]
    #[cfg(unix)]
    fn 认不出版本旗子也算不确实() {
        // `false` 起来了、退出了、退出码非 0 —— 既不是"没装"也不是"能用"。
        let out = probe_with("false");
        assert_eq!(out.state, ProbeState::Unknown);
        assert!(out.message.contains("没问出版本号"), "{}", out.message);
    }

    #[test]
    fn 空命令不崩() {
        let out = probe_with("   ");
        assert_eq!(out.state, ProbeState::Unknown);
        assert!(out.message.contains(ENV_CMD), "{}", out.message);
    }

    // ── 找引擎 ────────────────────────────────────────────────────────────

    #[test]
    #[cfg(unix)]
    fn 引擎按偏好顺序找而不是碰到谁算谁() {
        use std::os::unix::fs::PermissionsExt;
        let dir = temp_dir("engine");
        // ⚠️ 故意让"偏好靠后"的那个先按字母序出现：如果实现是"遍历目录里有什么"
        // 而不是"按 ENGINES 的顺序找"，这里就会拿到 pdflatex。
        for name in ["pdflatex", "xelatex"] {
            let p = dir.join(name);
            std::fs::write(&p, b"#!/bin/sh\n").unwrap();
            std::fs::set_permissions(&p, std::fs::Permissions::from_mode(0o755)).unwrap();
        }
        let path = OsString::from(dir.display().to_string());
        assert_eq!(find_in_path(ENGINES, &path).as_deref(), Some("xelatex"));

        // 目录里有个**不可执行**的同名文件时不算数（PATH 里这种空壳文件真的有）。
        let 空壳 = temp_dir("engine-noexec");
        std::fs::write(空壳.join("xelatex"), b"").unwrap();
        let path = OsString::from(空壳.display().to_string());
        assert_eq!(find_in_path(ENGINES, &path), None);

        let _ = std::fs::remove_dir_all(&dir);
        let _ = std::fs::remove_dir_all(&空壳);
    }

    #[test]
    fn 空_path_里什么都没有() {
        assert_eq!(find_in_path(ENGINES, &OsString::from("")), None);
    }

    // ── 语言环境 ──────────────────────────────────────────────────────────

    #[test]
    fn 认得出哪些语言环境是_utf8() {
        assert!(是utf8("C.UTF-8"));
        assert!(是utf8("zh_CN.UTF-8"));
        // ⚠️ 大小写和不带横杠的写法都真的存在（`en_US.utf8` 是 Debian 那套）。
        assert!(是utf8("en_US.utf8"));
        assert!(!是utf8("C"));
        assert!(!是utf8("POSIX"));
        assert!(!是utf8("en_US.ISO-8859-1"));
    }

    // ── 导出 ──────────────────────────────────────────────────────────────

    #[test]
    fn 成功时只挑警告行而且有条数上限() {
        let 杂 = "一句杂音\n[WARNING] 第 1 条\n[WARNING] 第 2 条\n[WARNING] 第 3 条\n[WARNING] 第 4 条\n";
        let s = 成功时的警告(杂);
        assert!(s.contains("第 1 条"), "{s}");
        assert!(!s.contains("一句杂音"), "杂音不该进提示语：{s}");
        assert!(!s.contains("第 4 条"), "超过上限的不列：{s}");
        assert!(s.contains("另有 1 条"), "少了要如实说还差几条：{s}");
        // 一条都没有 = 空串，调用方拿它当"没话说"。
        assert_eq!(成功时的警告("啥也没有\n"), "");
    }

    #[test]
    #[cfg(unix)]
    fn 成功但报了警告也要带出来() {
        // ⚠️ 这条钉的是"退出码 0 也要看 stderr"：pandoc 把**没做成的事**报成
        // WARNING，不看的话就是静默丢图（见 `成功时的警告`）。
        let dir = temp_dir("warn");
        let target = dir.join("出.docx");
        let 假pandoc = 假命令(
            "warn-bin",
            &format!(
                "echo '[WARNING] Could not fetch resource 点.png' >&2; cat > {}",
                target.display()
            ),
        );
        let 警告 = export_with(
            &假pandoc.display().to_string(),
            Format::Docx,
            "正文",
            &target,
            None,
            None,
        )
        .expect("应该成功");
        assert!(警告.contains("点.png"), "{警告}");
        let _ = std::fs::remove_dir_all(&dir);
    }

    #[test]
    #[cfg(unix)]
    fn 导出把正文从标准输入喂进去() {
        // 假 pandoc 把标准输入原样写到落点（真实 pandoc 是拿 `-o` 那个参数，
        // 这里没必要跟着写一份参数解析）。这条钉的是"正文没落成临时文件"这条
        // 设计——见 `export_to` 的注释：落成文件就得在"写用户目录"和"图片裂图"
        // 之间二选一。
        let dir = temp_dir("stdin");
        let target = dir.join("out.md");
        let 假pandoc = 假命令("stdin-bin", &format!("cat > {}", target.display()));
        export_with(
            &假pandoc.display().to_string(),
            Format::Docx,
            "# 标题\n正文 🎉\n",
            &target,
            None,
            None,
        )
        .expect("应该成功");
        assert_eq!(
            std::fs::read_to_string(&target).unwrap(),
            "# 标题\n正文 🎉\n"
        );
        let _ = std::fs::remove_dir_all(&dir);
    }

    #[test]
    #[cfg(unix)]
    fn 相对路径的图片按文档目录找() {
        // ⚠️ 这条钉的是 `cwd` 那一手：`--resource-path` 是 pandoc 的接口，
        // 而 `cwd` 才是"正文里 `![](./img.png)` 相对谁"的答案。少了它，
        // 一份带图的文档导出来会集体裂图，而那种失败**不会报错**。
        let dir = temp_dir("cwd");
        let target = dir.join("out.md");
        // 假的 pandoc 报告自己"现在在哪个目录"——真实场景里它就是靠这个找图的。
        let 假pandoc = 假命令("cwd-bin", &format!("pwd > {}; cat > /dev/null", target.display()));
        export_with(
            &假pandoc.display().to_string(),
            Format::Docx,
            "![](./img.png)",
            &target,
            Some(&dir),
            None,
        )
        .expect("应该成功");
        let 报的目录 = std::fs::read_to_string(&target).unwrap();
        // macOS 的 /tmp 是指向 /private/tmp 的软链接，两边都认。
        assert!(
            报的目录.trim().ends_with(&dir.file_name().unwrap().to_string_lossy().to_string()),
            "跑在 {报的目录:?}，应该是 {dir:?}"
        );
        let _ = std::fs::remove_dir_all(&dir);
    }

    #[test]
    #[cfg(unix)]
    fn 退出码零但没生成文件也算失败() {
        // ⚠️ 这是最坏的一种"假成功"：告诉用户导好了，而磁盘上什么都没有。
        let dir = temp_dir("nofile");
        let target = dir.join("不存在.pdf");
        let err = export_with("true", Format::Pdf, "正文", &target, None, None).unwrap_err();
        assert!(err.to_string().contains("没有生成"), "{err}");
        let _ = std::fs::remove_dir_all(&dir);
    }

    #[test]
    #[cfg(unix)]
    fn 失败时把_pandoc_自己的报错端出来() {
        let dir = temp_dir("fail");
        let target = dir.join("出.docx");
        let 假pandoc = 假命令("fail-bin", "echo 第 3 行有个表格看不懂 >&2; exit 4");
        let err = export_with(
            &假pandoc.display().to_string(),
            Format::Docx,
            "正文",
            &target,
            None,
            None,
        )
        .unwrap_err();
        let msg = err.to_string();
        assert!(msg.contains("表格看不懂"), "{msg}");
        assert!(msg.contains("Word 文档"), "报错里要点名是哪一种格式：{msg}");
        let _ = std::fs::remove_dir_all(&dir);
    }

    #[test]
    fn 没装时导出报的是没装() {
        let dir = temp_dir("nomissing");
        let target = dir.join("出.docx");
        let err = export_with(
            "nota-绝对没有这个命令",
            Format::Docx,
            "正文",
            &target,
            None,
            None,
        )
        .unwrap_err();
        assert!(err.to_string().contains("没找到"), "{err}");
        let _ = std::fs::remove_dir_all(&dir);
    }
}
