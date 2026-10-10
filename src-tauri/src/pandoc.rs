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

use std::path::Path;
use std::time::Duration;

use serde::Serialize;

use crate::error::{NotaError, Result};
// ⚠️ `split_command` 2026-10-10 起归 `pandoc_probe::解析` 用（命令名怎么落成一条
// 能跑的命令，那一处是唯一的出口）——这一半不再直接分词。
use crate::proc::{command_or_default, run_capture, Ran, RunOpts};

// ⚠️ 七种格式的词汇表搬去了 `pandoc_format.rs`（那边有为什么拆的说明）。
// **在这里接回原名**：`crate::pandoc::Format` 这类写法（`commands/pandoc.rs`、
// 本文件的探测与导出）一个字都不用改。
pub(crate) use crate::pandoc_format::Format;

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
#[cfg(test)]
use std::path::PathBuf;

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
    // ⚠️ 与探测**同一条**判断（`pandoc_probe::解析`）：PATH 里没有时它可能落到
    // 绝对路径上，并捎回一组要给子进程补的环境（容器里跑宿主那一份的情形）。
    let Some(落) = 解析(command) else {
        return Err(NotaError::other(format!("{ENV_CMD} 是空的，没有命令可跑")));
    };
    let program = 落.program;
    let args = build_args(&落.args, format, target, doc_dir, engine);

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

    // ── 「到底跑哪一份 pandoc」（2026-10-10 加）────────────────────────────

    #[test]
    fn 解析_写死的路径与_path_里的名字都一个字不改() {
        // ① 用户自己写了路径：`解析` 不许替他换成别的（他知道东西在哪）。
        let 写死 = 解析("/opt/pandoc/bin/pandoc").expect("命令不是空的");
        assert_eq!(写死.program, "/opt/pandoc/bin/pandoc");
        assert!(写死.env.is_empty(), "普通路径不该给任何环境垫片");

        // ② PATH 里就有：**交出去的还是那个名字本身**，不是绝对路径。
        //    ⚠️ 这一条是"正常机器上行为与从前完全一样"的判据——落成绝对路径
        //    之后报错里会出现一条用户没写过的路径，那是不必要的惊吓。
        #[cfg(unix)]
        {
            let 在path = 解析("sh").expect("命令不是空的");
            assert_eq!(在path.program, "sh");
            assert_eq!(在path.来源, "PATH");
        }
    }

    #[test]
    fn 解析_空命令给_none_找不到的原样交回去() {
        assert!(解析("   ").is_none(), "空命令该给 None");

        // ③ 哪儿都没有：**原样交回去**（让 spawn 报它自己那句 No such file），
        //    而不是我们替它编一句——那句话比任何转述都准。
        let 没有 = 解析("nota-绝对没有这个命令").expect("命令不是空的");
        assert_eq!(没有.program, "nota-绝对没有这个命令");
        assert!(没有.env.is_empty());
    }

    #[test]
    fn 解析_参数跟着命令一起搬过去() {
        // `NOTA_PANDOC_CMD="/没有这个/pandoc --sandbox"`：参数一个不能丢。
        let 落 = 解析("/没有这个/pandoc --sandbox").expect("命令不是空的");
        assert_eq!(落.args, vec!["--sandbox".to_string()]);
    }

    #[test]
    fn 宿主垫片里永远有_path_那条() {
        // ⚠️ `PATH` 那一条**不看环境给不给**：找到了宿主那份 pandoc 之后，它自己
        // 还得去找宿主的排版引擎（`--pdf-engine=xelatex` 那一路）。
        let 垫 = 宿主垫片();
        let path = 垫.iter().find(|(k, _)| k == "PATH").expect("必须有 PATH");
        assert!(path.1.contains("/run/host/usr/bin"), "{}", path.1);
    }

    #[test]
    fn 只有真挂着宿主根时才列宿主那几个目录() {
        // ⚠️ 这条盯的是"候选目录不许无条件假设 `/run/host` 在"：普通机器上多了
        // 两条永远落空的规则不算错，但那说明写的人以为大家都在容器里跑。
        let 有 = 候选目录()
            .iter()
            .any(|c| c.dir.starts_with("/run/host"));
        let 该有 = Path::new("/run/host/usr/bin").is_dir()
            || Path::new("/run/host/usr/local/bin").is_dir();
        assert_eq!(有, 该有);
    }

    /// ⚠️ 这条**只在"容器里跑、宿主装了 pandoc、而容器自己没装"的机器上真跑**
    /// （2026-10-10 用户那台机器正是这样，也是这一条改动的由来）。别的机器上
    /// 它安静地让开——写成"无条件断言"就会在普通机器上红。
    #[test]
    fn 容器里能落到宿主那一份_pandoc_上() {
        let 宿主 = Path::new("/run/host/usr/bin/pandoc");
        if !可执行文件(宿主) || 在_path里("pandoc") {
            return;
        }
        let 落 = 解析("pandoc").expect("命令不是空的");
        assert_eq!(落.program, 宿主.display().to_string());
        assert!(
            落.env.iter().any(|(k, _)| k == "LD_LIBRARY_PATH"),
            "宿主那份要补动态库路径（liblua5.4）"
        );
        assert!(
            落.env.iter().any(|(k, _)| k == "pandoc_datadir"),
            "宿主那份的数据目录是编进二进制的，得靠这个变量指过去"
        );
    }
}
