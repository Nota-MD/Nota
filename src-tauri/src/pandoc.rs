//! 「系统里那个 pandoc」——**探测装没装 + 借它导出**格式表里的十种格式。
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

// ⚠️ `PathBuf` 2026-10-10 起**不再是"只有用例要的"**（`临时CSS` 那个结构体拿着
// 一份路径，正文代码就要它），所以下面 `#[cfg(test)]` 那一段里原来单独引的
// 一句跟着删掉了——留着会报"unused import"（用例那边 `use super::*` 拿得到）。
use std::path::{Path, PathBuf};
use std::time::Duration;

use serde::Serialize;

use crate::error::{NotaError, Result};
// ⚠️ `split_command` 2026-10-10 起归 `pandoc_probe::解析` 用（命令名怎么落成一条
// 能跑的命令，那一处是唯一的出口）——这一半不再直接分词。
use crate::proc::{command_or_default, run_capture, Ran, RunOpts};

// ⚠️ 格式词汇表搬去了 `pandoc_format.rs`（那边有为什么拆的说明）。
// **在这里接回原名**：`crate::pandoc::Format` 这类写法（`commands/pandoc.rs`、
// 本文件的探测与导出）一个字都不用改。
pub(crate) use crate::pandoc_format::Format;

/// 可从外部文档导入 Markdown 的格式。
///
/// 这张表只负责“菜单 id / pandoc 输入格式 / 文件后缀 / 显示名”的对应关系。
/// 文件选择、打开新文档与提示条由前端负责；本模块只跑一次无状态的格式转换。
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub(crate) enum ImportFormat {
    Docx,
    Rtf,
    Latex,
    Epub,
    Odt,
}

impl ImportFormat {
    pub(crate) fn from_id(id: &str) -> Option<Self> {
        Some(match id {
            "docx" => Self::Docx,
            "rtf" => Self::Rtf,
            "latex" => Self::Latex,
            "epub" => Self::Epub,
            "odt" => Self::Odt,
            _ => return None,
        })
    }

    fn from(self) -> &'static str {
        match self {
            Self::Docx => "docx",
            Self::Rtf => "rtf",
            Self::Latex => "latex",
            Self::Epub => "epub",
            Self::Odt => "odt",
        }
    }

    fn id(self) -> &'static str {
        match self {
            Self::Docx => "docx",
            Self::Rtf => "rtf",
            Self::Latex => "latex",
            Self::Epub => "epub",
            Self::Odt => "odt",
        }
    }

    fn extensions(self) -> &'static [&'static str] {
        match self {
            Self::Docx => &["docx"],
            Self::Rtf => &["rtf"],
            Self::Latex => &["tex", "latex"],
            Self::Epub => &["epub"],
            Self::Odt => &["odt"],
        }
    }

    fn name(self) -> &'static str {
        match self {
            Self::Docx => "Word",
            Self::Rtf => "RTF",
            Self::Latex => "LaTeX",
            Self::Epub => "EPUB",
            Self::Odt => "OpenDocument",
        }
    }
}

const IMPORT_ALL: [ImportFormat; 5] = [
    ImportFormat::Docx,
    ImportFormat::Rtf,
    ImportFormat::Latex,
    ImportFormat::Epub,
    ImportFormat::Odt,
];

/// 前端打开文件对话框时需要的格式表。
#[derive(Debug, Clone, Serialize)]
pub struct ImportFormatInfo {
    pub id: String,
    pub name: String,
    pub extensions: Vec<String>,
}

pub(crate) fn import_formats() -> Vec<ImportFormatInfo> {
    IMPORT_ALL
        .iter()
        .map(|format| ImportFormatInfo {
            id: format.id().to_string(),
            name: format.name().to_string(),
            extensions: format.extensions().iter().map(|ext| (*ext).to_string()).collect(),
        })
        .collect()
}

/// 一次导入转换的结果。
#[derive(Debug, Clone, Serialize)]
pub struct PandocImport {
    pub markdown: String,
    /// pandoc 成功退出时仍可能报告的警告，例如资源未找到。
    pub warnings: String,
}

// ⚠️ 探测那一半搬去了 `pandoc_probe.rs`（那边有为什么拆的说明）。
// **在这里接回原名**：`crate::pandoc::{ProbeState, probe, find_engine}` 这类写法
//（`commands/pandoc.rs` 走的就是它们）一个字都不用改。
pub(crate) use super::pandoc_probe::{find_engine, probe, tail_of, PandocProbe, DETAIL_COL};
// ⚠️ `解析` 是**探测与导出共用的那一处**（"到底跑哪一份 pandoc"）：两边各判一次
// 的症状是"面板上说找到了、真导出又报没找到"。2026-10-10 加的。
pub(crate) use super::pandoc_probe::解析;

// ⚠️ 下面这几样**只有本文件的用例在用**：`mod tests` 里那句 `use super::*;`
// 靠这些转出才看得见它们（`探测` / `找引擎` 两组用例仍留在这里——它们虽然测的是
// 那边的东西，用的却是本文件造的假 `pandoc`，两半分家不如让它们留在原地）。
// 加 `cfg(test)` 是免得 `cargo check`（不带 `--tests`）报一串"没用过的 import"。
#[cfg(test)]
pub(crate) use super::pandoc_probe::{
    find_in_path, probe_with, 宿主垫片, 在_path里, 可执行文件, 候选目录, ENGINES, ProbeState,
};
#[cfg(test)]
use std::ffi::OsString;

/// 默认命令。⚠️ 就是 PATH 里那个 `pandoc`，**不带任何路径**：写死路径等于把
/// "用户装在哪"当常量，而这是全篇最不该假设的一件事。
pub(crate) const DEFAULT_CMD: &str = "pandoc";

/// 换掉命令的调试旋钮（空格分词，就是 `NOTA_*_CMD` 那一类）。见 `docs/06` §3.4。
pub(crate) const ENV_CMD: &str = "NOTA_PANDOC_CMD";


/// 导出的超时。⚠️ 比探测宽得多：PDF 那一路要跑 LaTeX，大文档 + 首次加载字体
/// 几十秒是正常的；而它**不在主线程上**（见 `commands/pandoc.rs`），等得起。
const EXPORT_TIMEOUT: Duration = Duration::from_secs(180);



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
    捎带: &捎带的东西,
) -> Result<String> {
    let command = command_or_default(ENV_CMD, DEFAULT_CMD);
    let engine = find_engine();
    export_with(
        &command,
        format,
        markdown,
        target,
        doc_dir,
        engine.as_deref(),
        捎带,
    )
}

/// 用 pandoc 把一份外部文档转换为 Nota 可编辑的 Markdown。
///
/// 输入路径交给 pandoc 自己读取，因此文档内的相对资源仍以原文件目录为基准。
/// 输出走标准输出，不替用户创建额外的中间文件。
pub(crate) fn import_to(format: ImportFormat, source: &Path) -> Result<PandocImport> {
    let command = command_or_default(ENV_CMD, DEFAULT_CMD);
    import_with(&command, format, source)
}

fn import_with(command: &str, format: ImportFormat, source: &Path) -> Result<PandocImport> {
    let Some(落) = 解析(command) else {
        return Err(NotaError::other(format!("{ENV_CMD} 是空的，没有命令可跑")));
    };
    let args = build_import_args(&落.args, format, source);
    let mut opts = RunOpts::timeout(EXPORT_TIMEOUT).env("NO_COLOR", "1");
    for (k, v) in &落.env {
        opts = opts.env(k, v);
    }
    if let Some(dir) = source.parent() {
        opts = opts.cwd(dir);
    }
    if let Some((k, v)) = 补语言环境() {
        opts = opts.env(k, v);
    }

    let 命令全称 = format!("{} {}", 落.program, args.join(" "));
    match run_capture(&落.program, &args, opts) {
        Ran::Done {
            ok: true,
            stdout,
            stderr,
        } => Ok(PandocImport {
            markdown: stdout,
            warnings: 成功时的警告(&stderr),
        }),
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
                "pandoc 没能把{}转换成 Markdown：\n{病因}",
                format.name()
            )))
        }
        Ran::NoProgram => Err(NotaError::other(format!(
            "没找到 `{}`（`{ENV_CMD}` 可以换一条命令）",
            落.program
        ))),
        Ran::Timeout => Err(NotaError::other(format!(
            "pandoc 转换超过 {} 秒，已经停止。命令是：{命令全称}",
            EXPORT_TIMEOUT.as_secs()
        ))),
        Ran::Failed(msg) => Err(NotaError::other(msg)),
    }
}

fn build_import_args(prefix: &[String], format: ImportFormat, source: &Path) -> Vec<String> {
    let mut args = prefix.to_vec();
    args.push(format!("--from={}", format.from()));
    args.push("--to=markdown".to_string());
    args.push("--wrap=none".to_string());
    args.push("--markdown-headings=atx".to_string());
    args.push(source.display().to_string());
    args
}

/// 这一趟除了正文，还要捎给 pandoc 的那两样（2026-10-10 加，`docs/07` 第 112 项）。
///
/// ⚠️ 两样都**由调用方给**（前端从设置与文档主题里取），本模块不自作主张去读
/// 设置文件：`pandoc.rs` 是"怎么跑那次转换"的一层，读设置是命令层的事
/// （`commands/pandoc.rs`）——那样这一层才能在单测里用假的输入跑起来。
#[derive(Debug, Clone, Default)]
pub(crate) struct 捎带的东西 {
    /// **文档主题的原始 CSS**（没限域过的那些字节）。空 = 不带。
    ///
    /// ⚠️ 只有**吃得下 CSS 的格式**才真给（[`能带_css`]）：别的格式给了它，
    /// pandoc 只会忽略（epub 之外还会打一句"这个参数没用"的警告）。
    pub theme_css: String,
    /// 用户在「设置 → 导出」里写的那串**额外参数**（空格分词、支持引号）。
    pub pandoc_args: String,
}

/// `export_to` 的本体：命令和引擎都从参数进来（能单测，也能让探测的结论复用）。
fn export_with(
    command: &str,
    format: Format,
    markdown: &str,
    target: &Path,
    doc_dir: Option<&Path>,
    engine: Option<&str>,
    捎带: &捎带的东西,
) -> Result<String> {
    // ⚠️ 与探测**同一条**判断（`pandoc_probe::解析`）：PATH 里没有时它可能落到
    // 绝对路径上，并捎回一组要给子进程补的环境（容器里跑宿主那一份的情形）。
    let Some(落) = 解析(command) else {
        return Err(NotaError::other(format!("{ENV_CMD} 是空的，没有命令可跑")));
    };
    let program = 落.program;
    // 用户那串额外参数：**引号没配对就当场报**，别把一句半截命令喂给 pandoc
    //（那种失败从 pandoc 的输出里读不出原因）。
    let 额外 = 分词(&捎带.pandoc_args)?;
    // 主题 CSS 落成一份临时文件：pandoc 的 `--css` 只接路径，不接内容。
    // ⚠️ 是个 RAII 的值：这一趟跑完（**包括中途报错**）它自己会把文件删掉。
    let css = 主题_css文件(&捎带.theme_css, format)?;
    let args = build_args(
        &落.args,
        format,
        target,
        doc_dir,
        engine,
        &额外,
        css.as_ref().map(|c| c.路径.as_path()),
    );

    let mut opts = RunOpts::timeout(EXPORT_TIMEOUT)
        .stdin(markdown.to_string())
        .env("NO_COLOR", "1");
    for (k, v) in &落.env {
        opts = opts.env(k, v);
    }
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

/// 这一趟能带 CSS 吗？**只有 EPUB**（2026-10-10）。
///
/// # ⚠️ 为什么只有它，以及"文档主题影响导出"这件事到底能走多远
///
/// 用户 2026-10-10 那句是「**我的文档主题没有影响到 Pandoc 的导出**」。文档主题
/// 是一份 CSS（`themes.rs` / `src/styles/themes/*.css`），而 pandoc 那七种格式里
/// **只有 HTML 那一族（html / epub）认 CSS**（`--css=`）：
///
/// | 格式 | 排版由谁定 | 我们的主题能到哪儿 |
/// |---|---|---|
/// | `epub` | pandoc 的 HTML 那一套 | ✅ `--css=`（本函数这一档） |
/// | `docx` | **Word 模板**（`--reference-doc=`） | ⛔ 到不了：docx 里没有 CSS 这个概念 |
/// | `latex` / `pdf` | LaTeX 排版（`-V` 变量、`-H` 头文件） | ⛔ 到不了：那是另一套语言 |
/// | `odt` / `rtf` / `opml` | 各自的模板 | ⛔ 到不了 |
///
/// ⚠️ **不假装能到**：给 docx 塞一句 `--css=` 只会让 pandoc 打一句"这个参数
/// 没用"的警告，用户拿到的还是一份没主题的 Word——那比"如实说"更坏。
/// 另外三种的出口是「设置 → 导出」里那格**额外参数**（`Export::pandoc_args`，
/// 用户自己写 `--reference-doc=我的模板.docx` 或 `-V mainfont=…`），
/// 这也是 Markra 那边（`pandocArgs`）对同一件事的办法——用户点名参考的那份。
///
/// ⚠️ PDF 还有**另一条**：pandoc 那条不通时会退到 Nota 自带那套
///（WebKit 打印，`pdf_print.rs`），而那一份 HTML **是带主题的**
///（`editor/export.ts` 的"含样式"那一档）。两条路的区别在导出提示条上如实说
///（`commands/pandoc.rs::pandoc_那句` / `route`）。
fn 能带_css(format: Format) -> bool {
    matches!(format, Format::Epub)
}

/// 一份写完就删的 CSS 文件（`Drop` 里删）。
///
/// ⚠️ 用 RAII 而不是"跑完再手动删"：中间那条路上有**四个 `return`**（没找到
/// pandoc / 超时 / 退出码非零 / 文件没生成），手写删除必然漏掉几条——而漏掉的
/// 表现是往系统的临时目录里一次一份地攒 CSS 文件（用户看不见，也没人清）。
struct 临时CSS {
    路径: PathBuf,
}

impl Drop for 临时CSS {
    fn drop(&mut self) {
        let _ = std::fs::remove_file(&self.路径);
    }
}

/// 把主题 CSS 写进一份临时文件。空串、或格式吃不下 CSS → `None`（不带）。
fn 主题_css文件(theme_css: &str, format: Format) -> Result<Option<临时CSS>> {
    if theme_css.trim().is_empty() || !能带_css(format) {
        return Ok(None);
    }
    // ⚠️ 名字带上进程号和纳秒时间戳：同一个应用里连着导两次（或者两份文档）
    // 不能撞在同一个文件名上——撞了的话第二次会把第一次那份删掉（RAII），
    // 而 pandoc 那边正好还在读它。
    let 唯一 = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.subsec_nanos())
        .unwrap_or(0);
    let 路径 = std::env::temp_dir().join(format!("nota-导出主题-{}-{唯一}.css", std::process::id()));
    std::fs::create_dir_all(std::env::temp_dir()).ok();
    std::fs::write(&路径, theme_css.as_bytes()).map_err(|source| NotaError::Write {
        path: 路径.clone(),
        source,
    })?;
    Ok(Some(临时CSS { 路径 }))
}

/// 用户那串额外参数怎么分成一个一个参数。
///
/// ⚠️ 走 `shlex`（**认引号**），不是 `split_whitespace`：用户写
/// `--metadata title="我的 书"` 时，那个空格是标题的一部分；按空白切会把
/// `title="我的` 和 `书"` 当两个参数喂给 pandoc——**不报错**，只是标题变成
/// 半个。⚠️ 引号不配对时 `shlex` 给 `None`，那时**当场报**：那句报错比让 pandoc
/// 去消化一条半截命令强得多（后者回来的话要从它的输出里猜）。
pub(crate) fn 分词(参数: &str) -> Result<Vec<String>> {
    if 参数.trim().is_empty() {
        return Ok(Vec::new());
    }
    shlex::split(参数).ok_or_else(|| {
        NotaError::other("「设置 → 导出」里那串 pandoc 额外参数的引号没配对，先在设置里改好再导".to_string())
    })
}

/// 拼 pandoc 的命令行。**纯函数**——这是唯一一处"参数怎么给"的地方，
/// 单测直接盯着它，不必真跑 pandoc。
fn build_args(
    prefix: &[String],
    format: Format,
    target: &Path,
    doc_dir: Option<&Path>,
    engine: Option<&str>,
    额外: &[String],
    css: Option<&Path>,
) -> Vec<String> {
    let mut args = prefix.to_vec();
    // ⚠️ 用户那串**排在前面**：它写的是"额外"的东西，而我们下面那几行
    //（`--from` / `--to` / `-o`）是**这一趟的性质**，不该被一格设置顶掉
    //（理由写在 `settings/export.rs::pandoc_args` 那段）。
    args.extend(额外.iter().cloned());
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
    // 文档主题那一份 CSS。⚠️ 这里**再判一次格式**（`能带_css`）：调用方
    //（`主题_css文件`）本来就不会给吃不下 CSS 的格式落文件，但"参数怎么给"
    // 只有这一处，多这一道是让**这一处自己**就安全——将来谁绕开那条路直接
    // 递一个路径进来，也不会把一句"这个参数没用"的警告喂给 pandoc。
    if let Some(css) = css {
        if 能带_css(format) {
            args.push(format!("--css={}", css.display()));
        }
    }
    args.push("-o".to_string());
    args.push(target.display().to_string());
    args
}

#[cfg(test)]
mod tests;
