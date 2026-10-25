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
//! | `pandoc.rs` | 按格式表导出：拼参数、喂标准输入、收报错 |
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
// 是格式表词汇（真正那份在 `pandoc_format.rs`），`ENV_CMD` / `DEFAULT_CMD`
// 是命令名——探测与导出都要用，所以它们的主场是那一半，这里借过来。
use super::pandoc::{import_formats, DEFAULT_CMD, ENV_CMD, ImportFormatInfo};
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

// ── 「到底跑哪一份 pandoc」────────────────────────────────────────────────

/// 一条**现在真能跑**的 pandoc：程序、要补的环境、以及这条是怎么找到的。
///
/// ⚠️ 探测与导出**必须用同一个答案**（`解析` 就是那个唯一的入口）：两边各判一次
/// 的症状是"面板上说找到了，真导出又报没找到"——那种自相矛盾最难查。
#[derive(Debug, Clone, PartialEq, Eq)]
pub(crate) struct 落点 {
    /// 交给 `Command::new` 的那个字符串。PATH 里找得到时**就是命令名本身**
    /// （一个字都不改，正常机器上行为与从前完全一样）；找不到时才是绝对路径。
    pub program: String,
    /// 用户那串命令里的额外参数（`NOTA_PANDOC_CMD="pandoc --sandbox"` 那种）。
    pub args: Vec<String>,
    /// 要替这个子进程补的环境变量。普通机器上**永远是空的**。
    pub env: Vec<(String, String)>,
    /// 人话：这条是从哪儿找到的（`PATH` / `~/.local/bin` / 宿主挂进来的 `/run/host`）。
    pub 来源: String,
}

/// 从设置里那串命令解析出一条**现在真能跑**的 pandoc。
///
/// 返回 `None` = 命令串本身是空的（用户把 `NOTA_PANDOC_CMD` 设成了空白）。
///
/// # 为什么要"找"，而不是照着命令名直接起进程（2026-10-10）
///
/// `Command::new("pandoc")` 只认**这个进程自己的 PATH**。而 PATH 在两种很常见的
/// 机器上**指不到用户以为的那个地方**，症状都是"明明装了却报没装"：
///
/// 1. **macOS 上从 Dock / Finder 起 GUI**：GUI 进程的 PATH 是 launchd 那一份，
///    `/opt/homebrew/bin` 根本不在里面（用户开个终端 `which pandoc` 却有）；
/// 2. **在开发容器里跑**：宿主装的那份挂在 `/run/host` 底下——2026-10-10 这台机器
///    正是这一种（宿主 `/usr/bin/pandoc` 是 3.11，`tauri-dev` 里一个都没有）。
///
/// ⚠️ 两种都不是"用户没装"，所以回一句"去装 pandoc"是**指错方向**。
///
/// # 顺序（前面的赢）
///
/// ① 命令里**写死了路径** → 一个字不改（用户自己知道在哪，找不到就该看见真报错）；
/// ② `PATH` 里就有 → 也一个字不改（绝大多数机器走这条，**行为与从前完全一致**）；
/// ③ PATH 没有 → 去 [`候选目录`] 那几个知名位置找，头一个能执行的赢；
/// ④ 还是没有 → 把原来那条命令**原样**交出去，让 `spawn` 报它自己那句"没找到"
///    （我们不替它编一句，那会把真实的 `No such file or directory` 盖掉）。
pub(crate) fn 解析(command: &str) -> Option<落点> {
    let (程序, args) = split_command(command)?;

    // ① 写死了路径（`/opt/pandoc/bin/pandoc`、`./pandoc`、Windows 上 `C:\…`）。
    if 程序.contains('/') || 程序.contains(std::path::MAIN_SEPARATOR) {
        return Some(落点 {
            program: 程序,
            args,
            env: Vec::new(),
            来源: "命令里写死的路径".to_string(),
        });
    }

    // ② PATH（正常机器）。
    if 在_path里(&程序) {
        return Some(落点 {
            program: 程序,
            args,
            env: Vec::new(),
            来源: "PATH".to_string(),
        });
    }

    // ③ 几个知名位置。⚠️ 找到的是**绝对路径**，而且可能带一组环境垫片
    //（`/run/host` 那一条要，见 [`宿主垫片`]）。
    for 候选 in 候选目录() {
        let 全 = 候选.dir.join(&程序);
        if 可执行文件(&全) {
            return Some(落点 {
                program: 全.display().to_string(),
                args,
                env: 候选.env,
                来源: 候选.来源,
            });
        }
    }

    // ④ 都没有：原样交出去。
    Some(落点 {
        program: 程序,
        args,
        env: Vec::new(),
        来源: "PATH".to_string(),
    })
}

/// `PATH` 里能不能找到这个名字。
///
/// ⚠️ `pub(crate)` 是给用例用的（"PATH 里有时一个字不改"那条要靠它判前提）。
pub(crate) fn 在_path里(名字: &str) -> bool {
    match std::env::var_os("PATH") {
        Some(path) => find_in_path(&[名字], &path).is_some(),
        None => false,
    }
}

/// PATH 之外还去哪些目录找（**顺序即偏好**）。
///
/// ⚠️ 这一串**不是"猜"**：每一条都是某种真实安装方式的固定落点——brew
///（`/opt/homebrew/bin` 与 `/usr/local/bin`）、`cargo install --root` 或用户自己
/// 编的（`~/.local/bin`、`~/.cabal/bin`）、snap，以及 pandoc 官方那个 tarball
///（解到哪儿都有可能，只能覆盖最常见的 `/opt/pandoc`）。
pub(crate) fn 候选目录() -> Vec<候选> {
    let mut 出 = Vec::new();
    if let Some(家) = dirs::home_dir() {
        出.push(候选::普通(家.join(".local/bin"), "~/.local/bin"));
        出.push(候选::普通(家.join(".cabal/bin"), "~/.cabal/bin"));
    }
    出.push(候选::普通(PathBuf::from("/usr/local/bin"), "/usr/local/bin"));
    出.push(候选::普通(PathBuf::from("/opt/homebrew/bin"), "/opt/homebrew/bin"));
    出.push(候选::普通(PathBuf::from("/opt/pandoc"), "/opt/pandoc"));
    出.push(候选::普通(PathBuf::from("/snap/bin"), "/snap/bin"));

    // ⚠️ **容器里够得着宿主那一份**：distrobox / podman 把宿主根挂在 `/run/host`。
    // 挂点不存在时这两条自然落空——普通机器上白判一次 `is_dir`，代价是零。
    for 目录 in ["/run/host/usr/local/bin", "/run/host/usr/bin"] {
        let dir = PathBuf::from(目录);
        if dir.is_dir() {
            出.push(候选 {
                dir,
                来源: format!("宿主挂进来的 {目录}"),
                env: 宿主垫片(),
            });
        }
    }
    出
}

/// [`候选目录`] 里的一条。
pub(crate) struct 候选 {
    /// 目录本身。
    pub(crate) dir: PathBuf,
    /// 人话的来源（面板/日志上用的那一句）。
    pub(crate) 来源: String,
    /// 跑这个目录里的东西时要补的环境（见 [`宿主垫片`]）。
    pub(crate) env: Vec<(String, String)>,
}

impl 候选 {
    /// 一条普通目录：不补任何环境。
    fn 普通(dir: PathBuf, 来源: &str) -> Self {
        Self {
            dir,
            来源: 来源.to_string(),
            env: Vec::new(),
        }
    }
}

/// 跑**宿主那一份**可执行文件时要补的环境。
///
/// 三样各有各的用处（2026-10-10 在 `tauri-dev` 里拿 `/run/host/usr/bin/pandoc`
/// 一条条试出来的）：
///
/// | 补什么 | 不补的症状 |
/// |---|---|
/// | `LD_LIBRARY_PATH` = 宿主的库目录 | `error while loading shared libraries: liblua5.4.so.0`（容器里没这个库） |
/// | `PATH` = 宿主的可执行目录 ＋ 原来的 PATH | pandoc 自己找不到宿主装的排版引擎（`--pdf-engine=xelatex` 那一路） |
/// | `pandoc_datadir` = 宿主的 `/usr/share/pandoc` | `Could not find data file '/usr/share/pandoc/data/templates/default.openxml'`——宿主那份的**数据目录是编进二进制**的，容器里那个路径不存在 |
///
/// ⚠️ 最后那条**不认 `--data-dir`**（试过，还是报同一个错）：docx 那几个模板走的是
/// "系统数据目录"那条硬路径，而 Cabal 生成的 `getDataDir` 认的正是 `pandoc_datadir`
/// 这个环境变量。这一条是**实测**出来的，别照直觉改。
pub(crate) fn 宿主垫片() -> Vec<(String, String)> {
    let mut 出 = Vec::new();

    let 库 = 宿主库目录();
    if !库.is_empty() {
        出.push(("LD_LIBRARY_PATH".to_string(), 库.join(":")));
    }

    let 路 = "/run/host/usr/local/bin:/run/host/usr/bin:/run/host/bin";
    let 原 = std::env::var("PATH").unwrap_or_default();
    出.push((
        "PATH".to_string(),
        if 原.is_empty() {
            路.to_string()
        } else {
            format!("{路}:{原}")
        },
    ));

    if Path::new("/run/host/usr/share/pandoc").is_dir() {
        出.push((
            "pandoc_datadir".to_string(),
            "/run/host/usr/share/pandoc".to_string(),
        ));
    }
    出
}

/// 宿主那份动态库在哪儿（`/run/host/lib/x86_64-linux-gnu` 这种）。
///
/// ⚠️ **不写死架构名**（`x86_64-linux-gnu` 与 `aarch64-linux-gnu` 都得认）：多架构
/// 子目录按 `-linux-gnu` 这个尾巴去找，另外把 `lib64` 这种扁平目录也收上。
fn 宿主库目录() -> Vec<String> {
    let mut 出: Vec<String> = Vec::new();
    for 父 in ["/run/host/usr/lib", "/run/host/lib"] {
        let 父 = Path::new(父);
        if !父.is_dir() {
            continue;
        }
        出.push(父.display().to_string());
        if let Ok(条目) = std::fs::read_dir(父) {
            for 条 in 条目.flatten() {
                let p = 条.path();
                let 是多架构 = p
                    .file_name()
                    .map(|n| n.to_string_lossy().contains("-linux-gnu"))
                    .unwrap_or(false);
                if p.is_dir() && 是多架构 {
                    出.push(p.display().to_string());
                }
            }
        }
    }
    for 扁平 in ["/run/host/usr/lib64", "/run/host/lib64"] {
        if Path::new(扁平).is_dir() {
            出.push(扁平.to_string());
        }
    }
    出
}

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
    /// 全部格式的 id / 中文名 / 后缀。前端拿它拼保存对话框的过滤器与默认文件名。
    pub formats: Vec<FormatInfo>,
    /// 可导入的五种文档格式。前端拿它拼打开对话框的过滤器。
    pub import_formats: Vec<ImportFormatInfo>,
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
        import_formats: import_formats(),
    };

    // ⚠️ 命令名交给 [`解析`] 去落成"现在真能跑的那一条"（PATH → 知名目录 →
    // 容器里的宿主挂载）。**探测与导出共用这一个判断**，理由见那边的文件头。
    let Some(落) = 解析(command) else {
        out.message = format!("{ENV_CMD} 是空的，没有命令可跑。");
        return out;
    };
    // 面板上"命令"那一行说的是**真跑的那条**：外面找到的给绝对路径，
    // PATH 里那条仍然就是命令名本身。
    out.command = 落.program.clone();
    let program = 落.program;
    let mut args = 落.args;
    args.push(VERSION_FLAG.to_string());

    // ⚠️ `NO_COLOR`：有些工具会给输出加颜色，那些转义码进到面板里就是乱码。
    let mut opts = RunOpts::timeout(CHECK_TIMEOUT).env("NO_COLOR", "1");
    for (k, v) in &落.env {
        opts = opts.env(k, v);
    }
    match run_capture(&program, &args, opts) {
        Ran::Done { ok: true, stdout, .. } => {
            out.state = ProbeState::Ready;
            out.version = first_line(&stdout);
            out.message = 装好了那句(&out);
            // ⚠️ 不是 PATH 里那一条时**要说出来**（2026-10-10）：用户自己敲
            // `which pandoc` 得到的答案与这里不一样，不说清楚就成了"两个事实"。
            if 落.来源 != "PATH" {
                out.message
                    .push_str(&format!("（这一份不在 PATH 里，是从{}找到的。）", 落.来源));
            }
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
                "没找到 `{program}`。Pandoc 文档格式（PDF / Word / RTF / EPUB / LaTeX / \
                 OpenDocument / OPML / MediaWiki / reStructuredText / Textile）都由它来转，\
                 装好之后这一项就能用。"
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
    let mut s = format!("找到 pandoc（{version}），格式表里的导出器可以使用。");
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
    if let Some(path) = std::env::var_os("PATH") {
        if let Some(名) = find_in_path(ENGINES, &path) {
            return Some(名);
        }
    }
    // PATH 里没有（与 `解析` 的第 ③ 步同一种情形：macOS 上从 Dock 起 GUI、
    // 在容器里跑……）：去那几个知名目录再找一遍。
    //
    // ⚠️ 返回的仍然是**名字**，不是绝对路径：它要作为 `--pdf-engine=名字` 交给
    // pandoc，由 pandoc 在**它自己的** PATH 里去找。⚠️ 所以"引擎只在宿主那份里
    // 有"时还得靠 `宿主垫片` 给 pandoc 补 PATH——两处是一件事的两半，别只改一边。
    //
    // ⚠️ 循环顺序是**引擎优先**（与 `find_in_path` 一致）：偏好顺序是
    // `ENGINES` 那张表说了算，不是"哪个目录排在前面"。
    let 目录: Vec<PathBuf> = 候选目录().into_iter().map(|c| c.dir).collect();
    for name in ENGINES {
        for dir in &目录 {
            if 可执行文件(&dir.join(name)) {
                return Some((*name).to_string());
            }
        }
    }
    None
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
pub(crate) fn 可执行文件(path: &Path) -> bool {
    use std::os::unix::fs::PermissionsExt;
    std::fs::metadata(path)
        .map(|m| m.is_file() && m.permissions().mode() & 0o111 != 0)
        .unwrap_or(false)
}

/// Windows：认 `.exe`（PATH 里的可执行文件都带后缀）。
#[cfg(windows)]
pub(crate) fn 可执行文件(path: &Path) -> bool {
    path.is_file() && path.extension().is_some_and(|e| e.eq_ignore_ascii_case("exe"))
}
