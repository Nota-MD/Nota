//! 「本机装没装 Slidev」——`slidev.rs` 那个面板背后的探测。
//!
//! 从 `slidev.rs` 拆出来的（拆的时候那边 1023 行、上限 1000，见 `docs/09` §4）。
//! 拆的判据是**职责**：`slidev.rs` 管"起一个预览会话"（挑端口、写入口、起进程、
//! 收摊），这里管"**现在这一下能不能起**"——只在点菜单那一刻跑一次，不起服务器、
//! 不碰会话状态。两边共用的只有"命令怎么拆"和"进程组怎么杀"两件小事，
//! 都从 `slidev.rs` 借（`pub(crate)`）。
//!
//! ⚠️ 这个判断**不许联网**，也不许变重：用户点的只是一下菜单。
//! 全套理由见下面 `probe_install` 上面那段。

use std::path::{Path, PathBuf};
use std::process::{Command, Stdio};
use std::time::Duration;

use serde::Serialize;

use crate::paths;
use crate::slidev::{command_from_env, kill_group, split_command, ENV_CMD};

// ── 探测：这台机器上现在能不能跑 Slidev ────────────────────────────────────
//
// 用户 2026-09-24 定的流程：点「Slidev 预览」**先出一个面板**，上面写着装没装；
// 没装就给一条去官网安装指南的路，装好了才开那个预览窗。
//
// ⚠️ 探测**不许联网**。它要回答的是"现在这一下能不能跑起来"，不是"npm 上有没有
// 这个包"——后者一定会去下载几百 MB，而用户只是点了一下菜单。做法是给 npm 上
// `--offline`（cache mode = only-if-cached）：装过就命中（实测 1.3 秒），没装过
// 0.26 秒回一句 ENOTCACHED。两条路都不碰网络。
//
// ⚠️ 问的是**和真正启动同一条命令**（同一个 `NOTA_SLIDEV_CMD`/默认值、同一个工作
// 目录），只是把入口文件换成 `--version`。另起一套判断逻辑迟早会和 `spawn_with`
// 说的不一样，那时面板就会替一条根本跑不起来的命令打包票。
//
// ⚠️ 这不是"异步命令会冻界面"那个问题（`NOTA_SLIDEV_CMD` 挂住时最多等 20 秒，
// 见 `CHECK_TIMEOUT`），所以命令层把它交给 `spawn_blocking`，见
// `commands/slidev.rs`。

/// 拿它问版本号。`--version` 是所有正经 CLI 都认的一句。
const VERSION_FLAG: &str = "--version";

/// 探测最多等多久。**只用来防自定义命令挂住**：正常 `npx` 一两秒就回，
/// 但不能让面板永远转下去。
const CHECK_TIMEOUT: Duration = Duration::from_secs(20);

/// `detail` 留末尾几行、每行截多长。面板上有它一席之地，但不该把它撑爆。
const DETAIL_LINES: usize = 8;
const DETAIL_COL: usize = 200;

/// 探测的结论。前端**只拿它决定按钮怎么摆**，话全在 `message` 里。
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "kebab-case")]
pub enum ProbeState {
    /// 现在这一下能跑起来。
    Ready,
    /// 差东西（差什么写在 `message` 里）：给一条去官网的路。
    Missing,
    /// 探测自己没问出结果（自定义命令超时之类）。**不等于没装**——
    /// 这种情况前端该给的是"仍然打开预览"，而不是"去装一个"。
    Unknown,
}

/// 给面板的一份探测报告。
#[derive(Debug, Clone, Serialize)]
pub struct SlidevProbe {
    pub state: ProbeState,
    /// 我们问的是哪条命令，原样给用户看。
    pub command: String,
    /// `--version` 吐出来的那行（拿到了才有）。
    pub version: Option<String>,
    /// 一句话结论。
    ///
    /// ⚠️ **中文写在这一侧**：判定依据（ENOTCACHED、有没有主题、存没存过盘）
    /// 全在这儿，翻成枚举让前端去拼句子，只会把同一件事写成两份、并且迟早
    /// 对不上。前端拿 `state` 决定按钮，拿这句话当正文。
    pub message: String,
    /// 支撑结论的原文：命令自己的输出、或"我们查的是哪个目录"。
    pub detail: String,
    /// 拿哪个目录当 Slidev 的项目根。`None` = 文档还没存过盘。
    pub project_dir: Option<String>,
}

/// 探测本机能不能跑 Slidev。**不联网、不起服务器**（理由见本节顶上那段）。
///
/// ⚠️ 名字带 `_install` 是为了和 `slidev.rs` 里那个 `probe`（探端口通没通）分开：
/// 两个 `probe` 同名会让调用点看起来像在问同一件事，而它们一个问"装没装"、
/// 一个问"起来了没"。（这个划分也解释了为什么它俩不在一起：一个只在点菜单那
/// 一刻跑、不问会话状态；另一个是"会话起来之后"的事。）
pub fn probe_install(project_dir: Option<&Path>) -> SlidevProbe {
    probe_with(&command_from_env(), project_dir)
}

/// `probe_install` 的本体。命令从参数进来（不是直接读环境变量）是为了能单测——
/// 环境变量是进程级的，测试并行跑时互相踩。和 `spawn`/`spawn_with` 同一个理由。
fn probe_with(command: &str, project_dir: Option<&Path>) -> SlidevProbe {
    let mut out = SlidevProbe {
        state: ProbeState::Unknown,
        command: command.to_string(),
        version: None,
        message: String::new(),
        detail: String::new(),
        project_dir: project_dir.map(|p| p.display().to_string()),
    };

    let Some((program, mut args)) = split_command(command) else {
        out.message = format!("{ENV_CMD} 是空的，没有命令可跑。");
        return out;
    };
    args.push(VERSION_FLAG.to_string());

    let cwd = probe_cwd(project_dir);
    match run_version(&program, &args, cwd.as_deref(), CHECK_TIMEOUT) {
        Check::Ok(version) => finish_ok(&mut out, version, project_dir),
        Check::NoProgram => {
            out.state = ProbeState::Missing;
            out.message = format!("没找到 `{program}`。Slidev 是个前端工具，得先装 Node.js。");
        }
        Check::Timeout => {
            // ⚠️ **不判"没装"**：自定义的命令可能压根不认 `--version`，也可能就是
            // 不打算退出（比如有人把它写成了 `npm run dev`）。这种情况该让用户
            // 自己决定要不要试，而不是替他断言。
            out.state = ProbeState::Unknown;
            out.message = format!(
                "等 `{}` 回话超过 {} 秒，探测放弃了。",
                command,
                CHECK_TIMEOUT.as_secs()
            );
            out.detail = "这不代表没装。自定义的启动命令可能不认 --version，或者本来就一直在跑不退出。"
                .to_string();
        }
        Check::Failed(text) => {
            out.state = ProbeState::Missing;
            out.message = format!("离线跑不通 `{command}`，这台机器上应该还没装 Slidev。");
            out.detail = text;
        }
    }
    out
}

/// `--version` 通了之后**再看项目根**：命令在 ≠ 跑得起来。
///
/// 实测（2026-09-24，Slidev 53.0.0）：就算 CLI 已经从 npm 缓存里拿得到，在一个空
/// 目录里起它照样立刻退出，原话是
/// `The theme "@slidev/theme-default" was not found and cannot prompt for installation`。
/// 也就是说**门槛是"文档所在目录装过主题"**，不是"装了 node"就够了。
/// 这一条要是不单独说出来，用户就会在预览窗那边撞上同一句话——那时候更难懂。
fn finish_ok(out: &mut SlidevProbe, version: Option<String>, project_dir: Option<&Path>) {
    out.version = version;
    let ver = out
        .version
        .as_ref()
        .map(|v| format!(" {v}"))
        .unwrap_or_default();

    let Some(dir) = project_dir else {
        out.state = ProbeState::Missing;
        out.message = format!("Slidev{ver} 是装了的，但这份文档还没存过盘。");
        out.detail =
            "Slidev 拿入口文件所在的目录当项目根（`![](./图.png)` 这类相对路径也指望它），\
             新建的文档还没有目录可用。先存一下盘再试。"
                .to_string();
        return;
    };

    if !theme_installed(dir) {
        out.state = ProbeState::Missing;
        out.message = format!(
            "Slidev{ver} 是装了的，但 `{}` 还不是一个 Slidev 项目。",
            dir.display()
        );
        out.detail = "那个目录里没有 `node_modules/@slidev/theme-*`。Slidev 连默认主题都得\
                      从项目里找，找不到就直接退出——官方指南里那条 `npm init slidev@latest` \
                      就是在建这样一个项目。"
            .to_string();
        return;
    }

    out.state = ProbeState::Ready;
    out.message = format!("已检测到 Slidev{ver}，可以打开预览。");
}

/// 探测命令跑在哪个目录。
///
/// ⚠️ 要和 `choose_entry` 挑目录的口径一致：文档存过盘就用它的目录，
/// 没存过盘就用数据目录那份退路。`npx` 会优先用**项目自己那份** CLI，
/// 所以"在哪儿问"决定了问到的是哪一份。
///
/// 目录不存在时返回 `None`（= 不指定，继承本进程的）——**不能给一个不存在的
/// 目录**：`spawn` 会因为 ENOENT 失败，那会被上面的 `NotFound` 分支误报成
/// "没装 Node"。
fn probe_cwd(project_dir: Option<&Path>) -> Option<PathBuf> {
    let dir = match project_dir {
        Some(d) => d.to_path_buf(),
        None => paths::data_dir().ok()?.join("slidev"),
    };
    dir.is_dir().then_some(dir)
}

/// 项目根里（**或它的任何一层父目录里**）有没有装主题。
///
/// **任意一个 `@slidev/theme-*` 都算**：默认那个是 `@slidev/theme-default`
/// （官方脚手架 `npm init slidev@latest` 就是把它装进项目里的），但 frontmatter
/// 里写了 `theme: xxx` 的人用的是别的。具体缺哪一个由 Slidev 自己报，它的原话
/// 比我们编的准。
///
/// ⚠️ **必须往上找**：Node 解析 `node_modules` 就是从当前目录一层层往上的，
/// Slidev 找主题走的是同一条路（入口文件的父目录是项目根，根之上还有各层）。
/// 只看入口那一层的话，放在某个 Slidev 项目子目录里的文档（`~/笔记/项目/a.md`）
/// 会被误判成"不是 Slidev 项目"——而它跑得好好的。**拦错一次，这个面板
/// 在用户眼里就不可信了**，比少拦几次严重得多。
fn theme_installed(dir: &Path) -> bool {
    dir.ancestors().any(|d| {
        let Ok(entries) = std::fs::read_dir(d.join("node_modules").join("@slidev")) else {
            return false;
        };
        entries
            .flatten()
            .any(|e| e.file_name().to_string_lossy().starts_with("theme-"))
    })
}

/// 一次版本探测的结果。
#[derive(Debug)]
enum Check {
    /// 退出码是 0。里面是它报的版本号（末尾那行，可能没有）。
    Ok(Option<String>),
    /// 连程序都找不到（`NotFound`）——最典型的就是没装 Node。
    NoProgram,
    /// 起来了但没成事。里面是它自己的输出。
    Failed(String),
    Timeout,
}

/// 跑一次 `<命令> --version`，**离线**，且有超时。
fn run_version(program: &str, args: &[String], cwd: Option<&Path>, timeout: Duration) -> Check {
    let mut command = Command::new(program);
    command
        .args(args)
        .stdin(Stdio::null())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        // ⚠️ 这一行就是"不许联网"（见本节顶上那段）。用环境变量而不是给命令行
        // 加 `--offline`，是为了让自定义的 `NOTA_SLIDEV_CMD` 也能原样跑。
        .env("npm_config_offline", "true")
        .env("NO_COLOR", "1");
    if let Some(dir) = cwd {
        command.current_dir(dir);
    }

    // 自成进程组，超时才有得杀（和 `spawn_with` 同一条理由）。
    #[cfg(unix)]
    {
        use std::os::unix::process::CommandExt;
        command.process_group(0);
    }

    let child = match command.spawn() {
        Ok(c) => c,
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => return Check::NoProgram,
        Err(e) => return Check::Failed(format!("起 `{program}` 失败：{e}")),
    };

    // ⚠️ 等它**必须能超时**：`Child::wait` 没有时限，而自定义命令完全可能挂住。
    // 收尸交给那个线程（`wait_with_output` 结束时它自然收），杀进程交给 pid。
    let pid = child.id();
    let (tx, rx) = std::sync::mpsc::channel();
    std::thread::spawn(move || {
        let _ = tx.send(child.wait_with_output());
    });

    match rx.recv_timeout(timeout) {
        Ok(Ok(out)) => {
            let stdout = String::from_utf8_lossy(&out.stdout);
            let stderr = String::from_utf8_lossy(&out.stderr);
            if out.status.success() {
                Check::Ok(last_line(&stdout))
            } else if stderr.trim().is_empty() {
                Check::Failed(tail_of(&stdout))
            } else {
                Check::Failed(tail_of(&stderr))
            }
        }
        Ok(Err(e)) => Check::Failed(format!("读 `{program}` 的输出失败：{e}")),
        Err(_) => {
            // 杀**进程组**（探测时它也是自成组的）：只杀最上面那层的话，
            // 底下真正在跑的那个会留下来（自定义命令可能是 `npm run dev` 那种壳）。
            kill_group(pid);
            Check::Timeout
        }
    }
}

/// 输出的**最后一行**非空内容。`--version` 就吐一行，但 npm 可能在前面插几句
/// 警告，取最后一行最稳。
fn last_line(text: &str) -> Option<String> {
    text.lines()
        .map(str::trim)
        .filter(|l| !l.is_empty())
        .next_back()
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


// ── 测试 ──────────────────────────────────────────────────────────────────
//
// ⚠️ 是**真起进程**（`printf` 当假的 CLI、`sleep` 当挂住的自定义命令），
// 没有 mock：探测的全部风险就在"真程序在真系统上怎么反应"，mock 掉就白测了。
#[cfg(test)]
mod tests {
    use super::*;
    // `默认命令不再自动装包` 要盯着它——那条常量留在这个模块外面（`slidev.rs`）。
    use crate::slidev::DEFAULT_CMD;


    // ── 探测 ──────────────────────────────────────────────────────────────

    /// 一个自己的临时目录（和 `slidev.rs` 测试里那份同款：不引 `tempfile`，
    /// 只用几次，且要能自己删干净）。
    fn temp_dir(tag: &str) -> PathBuf {
        let dir = std::env::temp_dir().join(format!("nota-probe-test-{tag}-{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&dir);
        std::fs::create_dir_all(&dir).expect("建临时目录");
        dir
    }

    /// 造一个"看起来像 Slidev 项目"的目录（有主题），给探测的 Ready 那条用。
    #[cfg(unix)]
    fn project_dir(tag: &str) -> PathBuf {
        let dir = temp_dir(tag);
        let theme = dir.join("node_modules").join("@slidev").join("theme-default");
        std::fs::create_dir_all(&theme).expect("建主题目录");
        dir
    }

    #[test]
    fn 默认命令不再自动装包() {
        // ⚠️ `--yes` 一旦回来，"没装"就会变成一个几百 MB 的下载 + 一段漫长等待，
        // 而用户以为它已经装好了。见 `DEFAULT_CMD` 上面那条。
        assert!(
            !DEFAULT_CMD.contains("--yes"),
            "启动命令不许自动装包：{DEFAULT_CMD}"
        );
    }

    #[test]
    fn 拆命令按空白分词() {
        assert_eq!(
            split_command("npx @slidev/cli").unwrap(),
            ("npx".to_string(), vec!["@slidev/cli".to_string()])
        );
        // 空命令 = 没命令可跑，不是"跑一个空程序"。
        assert!(split_command("   ").is_none());
    }

    #[test]
    fn 主题装没装看的是项目里的_node_modules() {
        let dir = project_dir("theme");
        assert!(theme_installed(&dir), "有 @slidev/theme-default 就该算装了");
        let bare = temp_dir("theme-bare");
        assert!(!theme_installed(&bare), "空目录不该算");
        let _ = std::fs::remove_dir_all(&dir);
        let _ = std::fs::remove_dir_all(&bare);
    }

    #[test]
    fn 主题在上一层父目录里也一样算() {
        // Node 解析 node_modules 是一层层往上的，Slidev 找主题走同一条路。
        // 文档在项目的子目录里（`~/笔记/项目/稿子/a.md`）是最常见的放法。
        let root = project_dir("theme-up");
        let deep = root.join("稿子").join("第一章");
        std::fs::create_dir_all(&deep).expect("建子目录");
        assert!(
            theme_installed(&deep),
            "主题装在项目根上，子目录里的文档也该算"
        );
        let _ = std::fs::remove_dir_all(&root);
    }

    #[test]
    fn 没装_node_时探测点名_node() {
        let out = probe_with("nota-绝对没有这个命令", None);
        assert_eq!(out.state, ProbeState::Missing);
        assert!(out.message.contains("Node"), "要提示去装 Node：{}", out.message);
    }

    #[test]
    #[cfg(unix)]
    fn 命令能报版本但文档没存盘时仍然拦住() {
        // `printf` 认这个位置参数、会忽略后面的 `--version`，正好当个假的 CLI。
        let out = probe_with("printf 1.2.3", None);
        assert_eq!(out.state, ProbeState::Missing, "{}", out.message);
        assert_eq!(out.version.as_deref(), Some("1.2.3"));
        assert!(out.message.contains("存过盘"), "要说清是缺目录：{}", out.message);
    }

    #[test]
    #[cfg(unix)]
    fn 命令和主题都在才说可以打开() {
        let dir = project_dir("ready");
        let out = probe_with("printf 1.2.3", Some(&dir));
        assert_eq!(out.state, ProbeState::Ready, "{}", out.message);
        assert!(out.message.contains("1.2.3"), "要把版本号报出来：{}", out.message);
        assert_eq!(out.project_dir.as_deref(), Some(dir.to_str().unwrap()));
        let _ = std::fs::remove_dir_all(&dir);
    }

    #[test]
    #[cfg(unix)]
    fn 光有命令没有主题也拦住并且说清缺什么() {
        // 这正是 2026-09-24 实测到的那条：CLI 从 npm 缓存里拿得到，空目录里起
        // 照样立刻退出（缺 @slidev/theme-default）。
        let bare = temp_dir("no-theme");
        let out = probe_with("printf 1.2.3", Some(&bare));
        assert_eq!(out.state, ProbeState::Missing, "{}", out.message);
        assert!(out.message.contains("还不是一个 Slidev 项目"), "{}", out.message);
        let _ = std::fs::remove_dir_all(&bare);
    }

    #[test]
    #[cfg(unix)]
    fn 自定义命令挂住时超时而不是一直等() {
        // 用的是 `run_version` 而不是 `probe_with`：真的走一遍 20 秒太慢，
        // 而这里要验的就是"等不动了会自己收手"。
        let out = run_version(
            "sleep",
            &["30".to_string()],
            None,
            Duration::from_millis(300),
        );
        assert!(matches!(out, Check::Timeout), "应该是超时：{out:?}");
    }

    #[test]
    fn 报错时留的是末尾几行而不是整篇() {
        let long: String = (0..40).map(|i| format!("第 {i} 行\n")).collect();
        let tail = tail_of(&long);
        assert_eq!(tail.lines().count(), DETAIL_LINES);
        assert!(tail.ends_with("第 39 行"), "留下的是末尾：{tail}");
        // 空输出不留一堆空行（面板上那一块会白占地方）。
        assert_eq!(tail_of("\n\n  \n"), "");
        assert_eq!(last_line("警告\n53.0.0\n\n"), Some("53.0.0".to_string()));
        assert_eq!(last_line("   "), None);
    }
}
