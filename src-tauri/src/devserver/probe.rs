//! 探测：**这台机器上现在能不能跑**这个插件声明的服务器。
//!
//! 这一半 2026-09-26 从 `devserver.rs` 里分出来的。分出来的判据是**职责**，不是
//! 行数：那个文件原来管两件事——「问」和「跑」。
//!
//! | 这一份（`probe.rs`） | 那一份（`devserver.rs`） |
//! |---|---|
//! | 跑一次 `<命令> --version`、看项目根里有没有标记目录 | 挑端口、写入口、起进程、等端口通、杀进程树 |
//! | **不起服务器、不占端口、不留状态**（纯函数，进出都是数据） | 有会话状态（`DevServerState`）、有 `Drop`、有日志环 |
//! | 一次 `npx`（实测 1.3 秒，最坏 20 秒） | 一次启动最多 180 秒 |
//!
//! ⚠️ **里面没有一句人话**——话由插件写。宿主手里的是一堆**事实**（命令通没通、
//! 版本号多少、项目根里有没有那个目录），而"这算什么情况、该怎么跟用户说"是
//! **插件**知道的。写成宿主这边的中文句子，换个插件就不成立，而且改口径要改
//! 两个仓库里的两份东西（`plugins/slidev/main.lua::describe_probe` 是消费这一
//! 份结论的地方）。
//!
//! ⚠️ 能力口径：这里跑的是**清单里那一条命令**（`plugin.toml` 的 `[devserver]
//! cmd`），不是"任意命令"——见 `devserver.rs` 文件头那段。

use std::path::{Path, PathBuf};
use std::time::Duration;

use serde::Serialize;

use crate::plugin::manifest::DevServerSpec;
use crate::proc::{run_capture, split_command, Ran, RunOpts};

/// 探"装没装"最多等多久。**只用来防自定义命令挂住**：正常一两秒就回。
const CHECK_TIMEOUT: Duration = Duration::from_secs(20);

/// `detail` 留末尾几行、每行截多长。
const DETAIL_LINES: usize = 8;
const DETAIL_COL: usize = 200;

/// 探测的结论。**只有三个**，因为这是宿主能如实回答的全部。
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "kebab-case")]
pub enum ProbeState {
    /// 现在这一下能跑起来。
    Ready,
    /// 差东西（差什么让插件去说）。
    Missing,
    /// 探测自己没问出结果（自定义命令超时之类）。**不等于没装**。
    Unknown,
}

/// 一份探测报告。⚠️ **里面没有一句人话**——话由插件写。
///
/// 判据：宿主手里的是一堆**事实**（命令通没通、版本号多少、项目根里有没有那个
/// 标记目录），而"这算什么情况、该怎么跟用户说"是**插件**知道的。写成宿主这边的
/// 中文句子，换个插件就不成立，而且改口径要改两个仓库里的两份东西。
#[derive(Debug, Clone, Serialize)]
pub struct Probe {
    pub state: ProbeState,
    /// 探测用的是哪条命令，原样给用户看。
    pub command: String,
    /// `--version` 之类吐出来的那行（拿到了才有）。
    pub version: Option<String>,
    /// 支撑结论的原文：命令自己的输出。
    pub detail: String,
    /// 拿哪个目录当项目根。`null` = 文档还没存过盘、也没给根。
    pub root: Option<String>,
    /// 项目根（或它的任一层父目录）里有没有 `project_marker`。
    /// 清单没写 `project_marker` 时恒为 `true`——"不看"和"没有"必须分开。
    pub marker_found: bool,
    /// 调用方说要找的那个东西（`probe(need = …)`）在项目根**或它的任一层
    /// 父目录**里有没有。`None` = **没问**（插件没提这件事，或者给的路径不合法）。
    ///
    /// ⚠️ 与 `marker_found` 同一把尺子，但多一档：`false` 是"问了、没有"，
    /// `None` 是"没问"。给 `None` 的场合硬填 `false` 就变成宿主替插件下了结论。
    pub need_found: Option<bool>,
}

/// 探"这台机器现在能不能跑这个插件声明的服务器"。
///
/// **不联网、不起服务器**：它要回答的是"现在这一下能不能跑起来"，
/// 不是"网上有没有这个包"——后者一定会去下载几百 MB，而用户只是点了一下菜单。
///
/// `need` 是**插件**额外要问的一件事：`"这份文档还需要什么"`，写成相对路径
/// （Slidev 那份是 `node_modules/@slidev/theme-default`，因为文档开头没写
/// `theme:` 时它要的就是那个包）。宿主只回答"有没有"，**不解释那是干什么用的**——
/// 「这是主题」这件事是插件知道的（见 `devserver.rs` 文件头那段"命令与话术归插件"）。
///
/// ⚠️ 为什么不让清单写死：同一个项目里两份文档可能要**不同的**主题包
/// （`theme: seriph` 的文档和没写主题的文档要的不是同一个东西），
/// 而清单是**每个插件一份**、不看文档内容。所以它是入参，不是配置。
///
/// ⚠️ 为什么不让插件自己找：`nota.fs` 是**工作区根**底下的、还**不收绝对路径**
/// （`lua/api/fs.rs` 的 `resolve_in`），所以插件没法沿文档的父目录往上走。
/// "往上找"这件事只有宿主做得到——它手里有文档的绝对路径。
pub fn probe(spec: &DevServerSpec, root: Option<&Path>, need: Option<&str>) -> Probe {
    let command = spec.command();
    let mut out = Probe {
        state: ProbeState::Unknown,
        command: command.clone(),
        version: None,
        detail: String::new(),
        root: root.map(|p| p.display().to_string()),
        marker_found: true,
        need_found: None,
    };

    let Some((program, mut args)) = split_command(&command) else {
        out.detail = format!("`{}` 是空的，没有命令可跑。", spec.cmd_env.as_deref().unwrap_or("启动命令"));
        return out;
    };
    args.extend(spec.probe_args());

    let cwd = existing_dir(root);
    match run_version(spec, &program, &args, cwd.as_deref()) {
        Check::Ok(version) => {
            out.version = version;
            out.state = ProbeState::Ready;
        }
        Check::NoProgram => {
            out.state = ProbeState::Missing;
            out.detail = format!("没找到 `{program}`。");
        }
        Check::Timeout => {
            // ⚠️ **不判"没装"**：自定义的命令可能压根不认 `--version`，也可能就是
            // 不打算退出（比如有人把它写成了 `npm run dev`）。这种情况该让用户
            // 自己决定要不要试，而不是替他断言。
            out.state = ProbeState::Unknown;
            out.detail = format!(
                "等 `{command}` 回话超过 {} 秒，探测放弃了。这不代表没装。",
                CHECK_TIMEOUT.as_secs()
            );
        }
        Check::Failed(text) => {
            out.state = ProbeState::Missing;
            out.detail = text;
        }
    }

    // ⚠️ 命令通 ≠ 跑得起来：项目根里得真有个像样的项目。判据由清单给
    // （`project_marker`），宿主只回答"有没有"。实测（2026-09-24，Slidev 53.0.0）：
    // 在一个空目录里起它照样立刻退出，报的是"主题找不到"。
    //
    // ⚠️ 这一条是**粗**的（"有没有以 `node_modules/@slidev/theme-` 开头的目录"），
    // 它只够回答"这是不是一个 Slidev 项目"。**装的是不是文档要的那一个包**，
    // 得靠下面那个 `need`：2026-09-26 实测，装的是 `theme-seriph`、文档要的是
    // `theme-default`，这一条判"能跑"，然后进程两秒后退出来。
    if let Some(marker) = &spec.project_marker {
        out.marker_found = root.is_some_and(|dir| marker_installed(dir, marker));
    }

    // 插件额外要问的那个东西（"这份文档还缺什么"）。
    // ⚠️ 路径不合法时**保持 `None`**（= 没问），不编一个 `false` 出来：
    // 那会让插件对着一个它没要过的东西说"没找到"。判据见 `合法的相对路径`。
    if let Some(rel) = need {
        if 合法的相对路径(rel) {
            out.need_found = Some(root.is_some_and(|dir| 有这层(dir, rel)));
        }
    }

    out
}

/// 根**或它的任一层父目录**里有没有 `rel`。
///
/// 一直往上找的理由与 [`marker_installed`] 同一条：Node 解析 `node_modules`
/// 就是从当前目录一层层往上的，只看入口那一层会误判。
fn 有这层(root: &Path, rel: &str) -> bool {
    root.ancestors().any(|d| d.join(rel).exists())
}

/// `rel` 是不是一条"从自己往下走"的相对路径。
///
/// ⚠️ 这条**不是安全边界**（宿主只回答存在与否，读不到内容），是**判据边界**：
/// 插件塞进来 `../../etc/passwd` 或者 `/etc` 那样的东西时，我们要的是**不回答**，
/// 而不是回答一个"那里真有东西"。允许它等于把"探一探这台机器上有什么"这条路
/// 悄悄打开，而这条路的正当用途一个都没有。
fn 合法的相对路径(rel: &str) -> bool {
    !rel.is_empty()
        && !rel.contains('\\')
        && rel
            .split('/')
            .all(|段| !段.is_empty() && 段 != "." && 段 != "..")
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

/// 跑一次 `<命令> <probe_args>`（默认 `--version`），带清单里声明的环境变量、有超时。
fn run_version(spec: &DevServerSpec, program: &str, args: &[String], cwd: Option<&Path>) -> Check {
    let mut opts = RunOpts::timeout(CHECK_TIMEOUT).env("NO_COLOR", "1");
    if let Some(dir) = cwd {
        opts = opts.cwd(dir);
    }
    // 清单声明的探测环境（Slidev 那份是 npm 的"不许联网"）。
    for (k, v) in spec.probe_env.iter().flatten() {
        opts = opts.env(k, v);
    }

    match run_capture(program, args, opts) {
        Ran::Done { ok: true, stdout, .. } => Check::Ok(last_line(&stdout)),
        Ran::Done {
            ok: false,
            stdout,
            stderr,
        } => {
            // npm 的报错有时在 stdout 有时在 stderr，两处都看，优先 stderr。
            if stderr.trim().is_empty() {
                Check::Failed(tail_of(&stdout))
            } else {
                Check::Failed(tail_of(&stderr))
            }
        }
        // 超时那一路已经在 `run_capture` 里杀过整个进程组了。
        Ran::Timeout => Check::Timeout,
        Ran::NoProgram => Check::NoProgram,
        Ran::Failed(msg) => Check::Failed(msg),
    }
}

/// 项目根里（**或它的任何一层父目录里**）有没有以 `marker` 开头的目录。
///
/// **必须往上找**：Node 解析 `node_modules` 就是从当前目录一层层往上的，
/// 只看入口那一层的话，放在某个项目子目录里的文档会被误判成"不是项目"——
/// 而它跑得好好的。**拦错一次，这个面板在用户眼里就不可信了**。
fn marker_installed(dir: &Path, marker: &str) -> bool {
    // 标记写的是"目录里有什么"，形如 `node_modules/@slidev/theme-`：
    // 前几段是路径，最后一段是**前缀**。
    let (parent, prefix) = match marker.rsplit_once('/') {
        Some((p, name)) => (Some(p), name),
        None => (None, marker),
    };
    dir.ancestors().any(|d| {
        let base = match parent {
            Some(p) => d.join(p),
            None => d.to_path_buf(),
        };
        let Ok(entries) = std::fs::read_dir(&base) else {
            return false;
        };
        entries
            .flatten()
            .any(|e| e.file_name().to_string_lossy().starts_with(prefix))
    })
}

/// 只有目录真的存在才把它交出去。
///
/// ⚠️ **不能给一个不存在的目录**：`spawn` 会因为 ENOENT 失败，而那会被
/// `NotFound` 那一支误报成"没装那个程序"。
fn existing_dir(dir: Option<&Path>) -> Option<PathBuf> {
    dir.map(Path::to_path_buf).filter(|d| d.is_dir())
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

/// 末尾几行、每行截断。给面板一个"够用但不撑爆"的原文。
fn tail_of(text: &str) -> String {
    let lines: Vec<&str> = text.lines().filter(|l| !l.trim().is_empty()).collect();
    let start = lines.len().saturating_sub(DETAIL_LINES);
    lines[start..]
        .iter()
        .map(|l| l.chars().take(DETAIL_COL).collect::<String>())
        .collect::<Vec<_>>()
        .join("\n")
}

#[cfg(test)]
mod tests {
    use super::*;

    /// 一个自己的临时目录。与 `devserver.rs` 那份同形（那边不引 `tempfile`，
    /// 这边也跟着不引），**标签取的名字两边不许撞**——同一个进程里并行跑。
    fn temp_dir(tag: &str) -> PathBuf {
        let dir = std::env::temp_dir().join(format!("nota-probe-{tag}-{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&dir);
        std::fs::create_dir_all(&dir).expect("建临时目录");
        dir
    }

    /// 一份最小清单：命令是个**绝对不存在**的程序名，所以它只会走到"没装"那一路。
    fn spec() -> DevServerSpec {
        DevServerSpec {
            cmd: "npx @slidev/cli".to_owned(),
            cmd_env: Some("NOTA_测试_绝不存在的变量".to_owned()),
            args: vec![],
            entry: None,
            probe_args: None,
            probe_env: None,
            project_marker: None,
        }
    }

    #[test]
    fn 标记目录要往上找() {
        let dir = temp_dir("marker");
        let deep = dir.join("笔记").join("项目");
        std::fs::create_dir_all(deep.join("node_modules").join("@slidev").join("theme-default"))
            .unwrap();
        // 深两层的文档目录，也要认出来。
        assert!(marker_installed(&deep, "node_modules/@slidev/theme-"));
        // 前缀不对就不认（`theme-` 是前缀，`xx-theme-` 不该命中）。
        assert!(!marker_installed(&deep, "node_modules/@slidev/xx-"));
        let _ = std::fs::remove_dir_all(&dir);
    }

    #[test]
    fn 额外要找的东西也往上找() {
        // 用户 2026-09-26 实测那一场的形状：文档在 `~`，主题装在 `~/node_modules`。
        let dir = temp_dir("need");
        let 文档目录 = dir.join("笔记").join("演示");
        std::fs::create_dir_all(&文档目录).unwrap();
        let 主题 = dir.join("node_modules").join("@slidev").join("theme-seriph");
        std::fs::create_dir_all(&主题).unwrap();
        std::fs::write(主题.join("package.json"), "{}").unwrap();

        assert!(有这层(&文档目录, "node_modules/@slidev/theme-seriph/package.json"));
        // 没装的那个包就是不认——**这才是这次要修的那件事**：光看
        // `node_modules/@slidev/theme-`（有一个算一个）会把它判成"能跑"，
        // 然后进程两秒后退出来。
        assert!(!有这层(&文档目录, "node_modules/@slidev/theme-default/package.json"));
        let _ = std::fs::remove_dir_all(&dir);
    }

    #[test]
    fn 相对路径的判据() {
        // 认的：一层或多层、点开头的名字也算（`.nota-x` 那种）。
        assert!(合法的相对路径("node_modules/@slidev/theme-default"));
        assert!(合法的相对路径("node_modules/.bin/nota"));
        // 不认的：空、绝对路径、带 `..`、反斜杠、空段。
        for 坏 in ["", "/etc/passwd", "../../.ssh/id_ed25519", "a/../../b", "a\\b", "a//b"] {
            assert!(!合法的相对路径(坏), "`{坏}` 不该被判成合法的相对路径");
        }
    }

    #[test]
    fn 命令不存在时报的是人话() {
        let s = DevServerSpec {
            cmd: "nota-绝对没有这个命令".to_owned(),
            cmd_env: None,
            ..spec()
        };
        let p = probe(&s, None, None);
        assert_eq!(p.state, ProbeState::Missing);
        assert!(p.detail.contains("nota-绝对没有这个命令"), "要点名那个命令：{}", p.detail);
        // 命令都没通，就不该顺带回答"那个东西有没有"（那是另一件事）。
        assert_eq!(p.need_found, None, "没问过的东西不许有结论");
    }

    /// 路径不合法时**保持"没问"**，不编一个 `false` 出来。
    #[test]
    fn 不合法的要找的东西不算问过() {
        let s = spec();
        let p = probe(&s, Some(Path::new("/tmp")), Some("../../etc/passwd"));
        assert_eq!(p.need_found, None, "不合法 = 不回答，不是「没有」");
    }
}
