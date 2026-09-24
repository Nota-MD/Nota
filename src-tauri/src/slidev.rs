//! Slidev 预览：替用户在本地起一个 Slidev 开发服务器，再把它那个 `localhost`
//! 开成一个**窗口**。
//!
//! # 为什么是"起服务器 + 开窗口"，而不是在应用里自己画幻灯片
//!
//! Slidev 是**前端工具链**：一个 Vite 开发服务器 + 一套主题/渲染器/布局。想在 Nota
//! 里复刻它，等于把 Slidev 重写一遍，而且永远追不上它的主题生态。用户 2026-09-23
//! 定的方案就是这条：**Nota 管生命周期与同步，画面由 Slidev 自己在窗口里渲染**。
//!
//! # 同步怎么发生的：**不靠我们推消息，靠它自己盯文件**
//!
//! Slidev 的入口是一份 Markdown。我们把它写在**文档所在目录**下的
//! `.nota-slidev-<id>.md`，前端每次 `sync` 就整份重写；Slidev 那边的 Vite
//! 文件监视器一看到变化就做 HMR，窗口自己就变了。所以"这里改了那边就变"
//! **不需要我们和它通信**——两边唯一的接口就是那个文件。
//!
//! ⚠️ 写进**文档所在目录**（而不是我们自己的数据目录）是有原因的：Slidev 把入口
//! 文件的父目录当项目根，`![](./img.png)` 这类相对路径都相对它解析。放到别处，
//! 一份带图的幻灯片会集体裂图。点开头的文件在文件管理器里默认不显示，停止预览时删掉。
//!
//! ⚠️ 文档**还没存过盘**（新建的）或那个目录写不进去时，退回数据目录
//! `~/.local/share/nota/slidev/`——代价就是上面那条相对路径不成立。
//!
//! # 实测过的四件事（2026-09-23，容器里跑的真 Slidev 53.0.0）
//!
//! 这四条都是**跑出来才知道**的，照着直觉写会踩：
//!
//! 1. **只绑 IPv6**：Slidev 起来之后 `ss -ltnp` 显示的是 `[::1]:4123`，
//!    `curl 127.0.0.1:4123` **不通**，`curl localhost:4123` 通。所以
//!    给窗口的 URL 用 `localhost`，探活要**两套栈都试**（见 `probe` 与 `pick_port`）。
//! 2. **它需要一个 Slidev 项目**：在一个空目录里起，会直接报
//!    `The theme "@slidev/theme-default" was not found and cannot prompt for
//!    installation`（非交互，问不了）然后退出。也就是说**门槛是"文档所在目录
//!    装过 Slidev 主题"**，不是"装了 node"就够了。这一条决定了下面对失败的处理：
//!    **把它自己的输出原样端给用户**，而不是我们编一句"启动失败"。
//! 3. **入口文件叫什么名字都行**，点开头的也行（实测 `.nota-slidev-1.md` 正常渲染、
//!    改动也能热更新）——所以不必去动用户那个 `slides.md`（重名会覆盖！）。
//! 4. **进程链是三层**：`sh` → `npm exec` → `node .../slidev`。这就是为什么
//!    收摊时杀的是**进程组**而不是那个 child（见 `kill_tree`）。
//!
//! # 生命周期
//!
//! ```text
//! install_probe（本机装没装）──> start ──> probe（前端轮询端口）──> 开窗口
//!   ▲                                                                │
//!   └────────────── stop（杀进程组 + 删入口 + 关窗口）◄────────────────┘
//! ```
//!
//! ⚠️ 最前面那步是 2026-09-24 加的：**没装就别起进程**。用户点「视图 → Slidev
//! 预览」先看到一个面板写着"装没装"，没装就给一条去官网的路。
//! 那个判定**不在这个文件里**——它拆到 `slidev_probe.rs` 去了（`slidev.rs` 当时
//! 1023 行、超了上限，见 `docs/09` §4）。这里只留两边共用的三样：命令行怎么取
//! （`command_from_env`）、怎么拆（`split_command`）、进程组怎么杀（`kill_group`）。
//!
//! ⚠️ **`start` 不等端口**。它只做"起进程"这一件事就返回，等不等由前端轮询决定。
//! 原因是 Tauri 的**同步命令跑在主线程上**，在里面 `sleep` 等 180 秒会把整个界面
//! 冻住；而异步命令里开窗口又牵扯主线程。拆成"起 + 轮询"两边都干净。
//!
//! ⚠️ 锁只有这一把，且**别把锁带到 `WebviewWindow::close()` 之后**：
//! 关窗口会触发 `Destroyed`，那个回调会回来调 `stop`，而它要的正是这把锁——
//! 同一个线程重入会直接卡死。命令层里那句 `close` 写在 `stop()` 返回之后，就是这个原因。

use std::io::{BufRead, BufReader};
use std::net::{Ipv4Addr, Ipv6Addr, SocketAddr, TcpListener, TcpStream, ToSocketAddrs};
use std::path::{Path, PathBuf};
use std::process::{Child, Command, Stdio};
use std::sync::{Arc, Mutex};
use std::time::Duration;

use serde::Serialize;

use crate::document::DocId;
use crate::error::{NotaError, Result};
use crate::paths;

/// 默认启动命令。⚠️ 用**包名**而不是 `slidev`：npm 上那个叫 `slidev` 的包是个
/// 转发壳，认包名不会有"装到别的东西"这种意外。用户项目里装了 Slidev 时，
/// `npx` 会优先用**项目自己那份**，只有没装才会去下。
///
/// ⚠️ 2026-09-24 起**不带 `--yes`**。带它的时候 `npx` 遇到没装过的包会**自己
/// 下载几百 MB**，用户点一下菜单就得干等，而且下完了还可能因为缺主题照样起不来。
/// 现在的顺序是先探测（`probe_install`）、没装就引到官网，所以"自动装"这件事不再需要了；
/// 留着它反而会把"没装"这个结论悄悄变成一个漫长的等待。
pub(crate) const DEFAULT_CMD: &str = "npx @slidev/cli";

/// 换掉启动命令的调试旋钮（空格分词）。见 `docs/06` §3.4。
pub(crate) const ENV_CMD: &str = "NOTA_SLIDEV_CMD";

/// 日志环里留多少行。够看出"主题没装""端口被占"这类事。
const LOG_TAIL: usize = 30;

/// 端口的探活超时。**必须短**：这是前端每 500ms 调一次的路径。
const PROBE_TIMEOUT: Duration = Duration::from_millis(300);

// ── 和 `slidev_probe.rs` 共用的三样 ────────────────────────────────────────
//
// ⚠️ 探测**必须问和这里同一条命令**：面板打的包票，得是 `spawn` 真正会起的那条。
// 所以取命令（`command_from_env`）和拆命令（`split_command`）都只有这一份实现。

/// 现在该用哪条启动命令：调试旋钮优先，其次默认值。
pub(crate) fn command_from_env() -> String {
    std::env::var(ENV_CMD).unwrap_or_else(|_| DEFAULT_CMD.to_string())
}

/// 把"一行命令"拆成程序名 + 参数。
///
/// ⚠️ 只按空白分词，不认引号——这是个调试旋钮，够用；真有带空格的路径，
/// 自己写个包一层的脚本。⚠️ `spawn_with` 和探测**走的就是这一个拆法**。
pub(crate) fn split_command(cmd: &str) -> Option<(String, Vec<String>)> {
    let mut parts = cmd.split_whitespace();
    let program = parts.next()?;
    Some((program.to_string(), parts.map(str::to_string).collect()))
}

/// 给**整个进程组**发 TERM（负号 = 发给组；组号就是组长的 pid）。
///
/// 两处用它：收摊时杀那棵 `sh → npm exec → node` 的树（见 `kill_tree`），
/// 以及探测超时（自定义命令挂住时）。收尸各归各管。
pub(crate) fn kill_group(pid: u32) {
    let _ = Command::new(kill_program())
        .args(kill_args(pid))
        .stdout(Stdio::null())
        .stderr(Stdio::null())
        .status();
}

/// 起一个预览会话。`entry_dir` 拿不到（文档没存过盘）时退回数据目录。
pub struct SlidevState(pub Mutex<Option<Server>>);

impl SlidevState {
    pub fn new() -> Self {
        Self(Mutex::new(None))
    }
}

impl Default for SlidevState {
    fn default() -> Self {
        Self::new()
    }
}

/// 起好了的服务器。**`Drop` 里收摊**——这样"忘了调 stop"也不会留下孤儿进程与点文件。
pub struct Server {
    child: Child,
    info: SlidevInfo,
    /// 进程输出（stdout+stderr 混在一起）的最后 `LOG_TAIL` 行。
    log: Arc<Mutex<Vec<String>>>,
}

impl Drop for Server {
    fn drop(&mut self) {
        kill_tree(&mut self.child);
        // 入口是我们自己造的影子文件，收摊时就该消失。
        // ⚠️ 进程被 SIGKILL 掉（应用崩溃）时这里跑不到，会留一个点文件在用户的目录里——
        // 下次 start 会原地覆盖它，所以最多只是"多一个看不见的小文件"。
        let _ = std::fs::remove_file(&self.info.entry);
    }
}

/// 给前端的会话信息。
#[derive(Debug, Clone, Serialize)]
pub struct SlidevInfo {
    pub port: u16,
    /// ⚠️ **`localhost` 不是 `127.0.0.1`**：实测 Slidev 只绑 `[::1]`。
    pub url: String,
    /// 我们写出来的那份影子入口（绝对路径）。
    pub entry: String,
    /// 预览跟着哪份文档走。前端靠它决定"切文档了要不要继续同步"。
    pub doc_id: DocId,
}

impl SlidevInfo {
    fn new(port: u16, entry: &Path, doc_id: DocId) -> Self {
        Self {
            port,
            url: format!("http://localhost:{port}/"),
            entry: entry.to_string_lossy().into_owned(),
            doc_id,
        }
    }
}

// ── 对外四件事：start / sync / probe / stop ────────────────────────────────

/// 起服务器。**不等待、不探活**（理由见文件头）。
///
/// 已经在跑的话**先收掉再起**：一个会话同时只该有一个服务器，不然端口、入口文件、
/// 窗口三者会互相说谎。
pub fn start(
    state: &SlidevState,
    entry_dir: Option<PathBuf>,
    doc_id: DocId,
    markdown: &str,
) -> Result<SlidevInfo> {
    stop(state);

    let port = pick_port()?;
    let entry = choose_entry(entry_dir.as_deref(), doc_id, markdown)?;
    let (child, log) = spawn(&entry, port)?;

    let info = SlidevInfo::new(port, &entry, doc_id);
    push_log(&log, format!("[nota] {} 已启动，端口 {port}", info.entry));

    *state.0.lock().unwrap() = Some(Server {
        child,
        info: info.clone(),
        log,
    });
    Ok(info)
}

/// 把入口文件整份重写。**Slidev 那边靠文件变化做 HMR**，我们只负责把文件写对。
pub fn sync(state: &SlidevState, markdown: &str) -> Result<()> {
    let guard = state.0.lock().unwrap();
    let Some(server) = guard.as_ref() else {
        // 没在跑就是没在跑，**不报错**：前端的同步是"打字就发"的，
        // 而停止预览和最后一次打字之间天然会有一两次这种调用，报错只会刷屏。
        return Ok(());
    };
    write_entry(Path::new(&server.info.entry), markdown)
}

/// 端口通了没有。前端拿它轮询"起来了没"。
pub fn probe(state: &SlidevState) -> bool {
    let guard = state.0.lock().unwrap();
    guard.as_ref().is_some_and(|s| port_open(s.info.port))
}

/// 进程输出的最后几行。启动超时/失败时端给用户看——**那里面通常写着真正的原因**
/// （缺主题、端口被占、node 版本太老）。
pub fn log_tail(state: &SlidevState) -> String {
    let guard = state.0.lock().unwrap();
    match guard.as_ref() {
        Some(s) => s.log.lock().unwrap().join("\n"),
        None => String::new(),
    }
}

/// 收摊：杀进程组 + 删入口文件。（锁在这里取、放，调用方别把 `Server` 借出去。）
pub fn stop(state: &SlidevState) {
    // 先把它从状态里**取出来**，`Drop` 在 `guard` 释放后跑到——不然删文件、等子进程
    // 收尸这些慢活都攥着锁，前端的 `probe` 会跟着一起卡。
    let taken = state.0.lock().unwrap().take();
    drop(taken);
}

/// 当前会话（没有就是 `None`）。前端热重载后靠它把界面状态接回来。
pub fn status(state: &SlidevState) -> Option<SlidevInfo> {
    state.0.lock().unwrap().as_ref().map(|s| s.info.clone())
}

// ── 端口 ──────────────────────────────────────────────────────────────────
// ── 端口 ──────────────────────────────────────────────────────────────────

/// 挑一个**两套栈都空着**的端口。
///
/// ⚠️ 不能只 bind 一次 `127.0.0.1:0` 就算数：Slidev 绑的是 `[::1]`（实测），
/// 而 v4 上空着的端口在 v6 上完全可能被占着。
fn pick_port() -> Result<u16> {
    for _ in 0..10 {
        let Ok(listener) = TcpListener::bind((Ipv6Addr::LOCALHOST, 0)) else {
            break;
        };
        let Ok(port) = listener.local_addr().map(|a| a.port()) else {
            break;
        };
        drop(listener);
        // 拿到之后**再验一遍 v4**。两步之间理论上有竞态，但那要两个进程在同一毫秒
        // 抢同一个端口才会撞上，撞上也就是"起的服务器绑不上"——Slidev 会报错退出，
        // 前端把它的输出端出来。为这点概率去加锁不值得。
        if TcpListener::bind((Ipv4Addr::LOCALHOST, port)).is_ok() {
            return Ok(port);
        }
    }
    Err(NotaError::other("挑不出一个空闲端口（IPv4/IPv6 两套都试过了）"))
}

/// 探活。**两套栈都试**——`localhost` 解析出哪个先用哪个，但环境里没有 v6 记录时
/// 只靠解析会漏掉 `[::1]` 那个真实监听，所以另外两个地址显式补上。
fn probe_addrs(port: u16) -> Vec<SocketAddr> {
    let mut out: Vec<SocketAddr> = Vec::new();
    if let Ok(addrs) = ("localhost", port).to_socket_addrs() {
        out.extend(addrs);
    }
    out.push(SocketAddr::from((Ipv6Addr::LOCALHOST, port)));
    out.push(SocketAddr::from((Ipv4Addr::LOCALHOST, port)));
    out.dedup();
    out
}

fn port_open(port: u16) -> bool {
    probe_addrs(port)
        .into_iter()
        .any(|addr| TcpStream::connect_timeout(&addr, PROBE_TIMEOUT).is_ok())
}

// ── 入口文件 ──────────────────────────────────────────────────────────────

/// 把入口写到哪、写进去。优先"文档同目录"，写不进去再退回数据目录。
fn choose_entry(entry_dir: Option<&Path>, doc_id: DocId, markdown: &str) -> Result<PathBuf> {
    if let Some(dir) = entry_dir {
        if dir.is_dir() {
            let candidate = dir.join(entry_name(doc_id));
            if write_entry(&candidate, markdown).is_ok() {
                return Ok(candidate);
            }
            // 写不进去（只读目录、权限不够）不是错误——退回数据目录照样能用，
            // 只是相对图片会裂。**所以这里不抛，往下走**。
        }
    }

    let fallback = paths::data_dir()?.join("slidev").join(entry_name(doc_id));
    if let Some(parent) = fallback.parent() {
        paths::ensure_dir(parent)?;
    }
    write_entry(&fallback, markdown)?;
    Ok(fallback)
}

/// 影子入口的文件名。
///
/// ⚠️ **点开头、带文档 id**：点开头让它不进用户的视野（也不进文件树的视野），
/// 带 id 让同一个目录里的两份文档可以各有一个入口（`slides.md` 这种名字
/// 会直接覆盖用户自己的文件，不能用）。
fn entry_name(doc_id: DocId) -> String {
    format!(".nota-slidev-{}.md", doc_id.0)
}

fn write_entry(path: &Path, markdown: &str) -> Result<()> {
    std::fs::write(path, markdown).map_err(|source| NotaError::Write {
        path: path.to_path_buf(),
        source,
    })
}

// ── 进程 ──────────────────────────────────────────────────────────────────

/// 起进程，并把它的输出抽到一个日志环里。
///
/// ⚠️ **必须有人读它的 stdout/stderr**：管道的缓冲区满了之后，写端会阻塞，
/// Slidev 就会**卡死在那儿**——现象是"服务器再也不响应了"，而且没有任何报错。
/// 所以下面那两行 `thread::spawn` 不是"顺手记日志"，是必需的。
fn spawn(entry: &Path, port: u16) -> Result<(Child, Arc<Mutex<Vec<String>>>)> {
    spawn_with(&command_from_env(), entry, port)
}

/// `spawn` 的本体。命令从参数进来（不是直接读环境变量）是为了能单测——
/// 环境变量是进程级的，测试并行跑时互相踩。
fn spawn_with(cmd: &str, entry: &Path, port: u16) -> Result<(Child, Arc<Mutex<Vec<String>>>)> {
    // ⚠️ 拆法和探测那边共用（`split_command`）：面板打包票的那条命令，
    // 必须就是这里真正起的这条。
    let (program, args) =
        split_command(cmd).ok_or_else(|| NotaError::other(format!("{ENV_CMD} 是空的")))?;

    let log: Arc<Mutex<Vec<String>>> = Arc::new(Mutex::new(Vec::new()));
    push_log(&log, format!("[nota] $ {cmd} {} --port {port} --no-open", entry.display()));

    let mut command = Command::new(&program);
    command
        .args(args)
        .arg(entry)
        .arg("--port")
        .arg(port.to_string())
        // 别让 Slidev 自己再开一个系统浏览器——窗口是我们开的。
        // ⚠️ 用 `--no-open` 而不是 `--open false`：后者的 `false` 是个**非空字符串**，
        // 会被当成"要打开的路径"，反而会去开。
        .arg("--no-open")
        // 入口在哪，项目根就在哪——Slidev 就是这么定的。
        .current_dir(entry.parent().unwrap_or(Path::new(".")))
        .stdin(Stdio::null())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        // 双保险：Slidev 用的 `open` 包未必认这个变量，但认了就不会多开一个浏览器。
        .env("BROWSER", "none")
        .env("NO_COLOR", "1");

    // ⚠️ 自成**进程组**，收摊时才有得杀（见 `kill_tree`）。
    #[cfg(unix)]
    {
        use std::os::unix::process::CommandExt;
        command.process_group(0);
    }

    let mut child = command.spawn().map_err(|e| {
        if e.kind() == std::io::ErrorKind::NotFound {
            NotaError::other(format!(
                "找不到 `{program}`，请先装 Node.js（Slidev 是个前端工具，得有 node/npx）"
            ))
        } else {
            NotaError::other(format!("起 Slidev 进程失败：{e}"))
        }
    })?;

    for pipe in [
        child.stdout.take().map(|p| Box::new(p) as Box<dyn std::io::Read + Send>),
        child.stderr.take().map(|p| Box::new(p) as Box<dyn std::io::Read + Send>),
    ]
    .into_iter()
    .flatten()
    {
        let log = log.clone();
        std::thread::spawn(move || {
            for line in BufReader::new(pipe).lines().map_while(std::result::Result::ok) {
                push_log(&log, line);
            }
        });
    }

    Ok((child, log))
}

/// 杀**整棵进程树**。
///
/// ⚠️ 只 `child.kill()` 是不够的：实测进程链是 `sh` → `npm exec` → `node .../slidev`，
/// 我们拿到的是最上面那层。杀了它，底下那个 node 会变成孤儿**继续占着端口**——
/// 下次预览就会"起得来但连不上旧的那个"，是最难查的一种。
///
/// 所以：起进程时让它自成进程组（`process_group(0)`），这里给**整个组**发信号。
/// 组号就是组长（我们那个 child）的 pid，用负数表示"发给整个组"。
fn kill_tree(child: &mut Child) {
    let pid = child.id();
    kill_group(pid);
    // 兜底 + 收尸：不 `wait` 会留下僵尸进程（它占的只是一个 pid 表项，
    // 但集成测试连着起几十次就会看得见）。
    let _ = child.kill();
    let _ = child.wait();
}

#[cfg(unix)]
fn kill_program() -> &'static str {
    "kill"
}

/// Unix：`kill -TERM -<pid>`（负号 = 整个进程组）。
#[cfg(unix)]
fn kill_args(pid: u32) -> Vec<String> {
    vec!["-TERM".to_string(), format!("-{pid}")]
}

#[cfg(windows)]
fn kill_program() -> &'static str {
    "taskkill"
}

/// Windows：`taskkill /T /F /PID <pid>`。`/T` 就是"连子进程一起"。
#[cfg(windows)]
fn kill_args(pid: u32) -> Vec<String> {
    vec![
        "/T".to_string(),
        "/F".to_string(),
        "/PID".to_string(),
        pid.to_string(),
    ]
}

fn push_log(log: &Arc<Mutex<Vec<String>>>, line: String) {
    let mut v = log.lock().unwrap();
    if v.len() >= LOG_TAIL {
        v.remove(0);
    }
    v.push(line);
}

// ⚠️ 这里**故意没有** `wait_ready(port, timeout)` 这样的函数。等待发生在前端：
// 同步命令跑在主线程上，睡一秒就冻一秒界面（见文件头）。想在后端等，
// 就得把它写成异步命令，那又要把开窗口那步挪到别处去。

#[cfg(test)]
mod tests {
    use super::*;

    /// 一个自己的临时目录。不引 `tempfile`：这里只用这一次，且要能自己删干净。
    fn temp_dir(tag: &str) -> PathBuf {
        let dir = std::env::temp_dir().join(format!("nota-slidev-test-{tag}-{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&dir);
        std::fs::create_dir_all(&dir).expect("建临时目录");
        dir
    }

    /// ⚠️ 这条**要和机器上别的东西赛跑**，所以带重试（2026-09-24 实测的实情）：
    /// `--test-threads=1` 连跑 6 次全绿；4 线程时约 3/4 会红，红的是 v4 那一句。
    /// **机制没查清**：`ss -ltnp` 当时只报出测试自己刚绑上的那个 `[::1]`，而同一容器里
    /// 用 Python 验过 `[::1]:P` 与 `127.0.0.1:P` 互不影响（两种顺序都绑得上），
    /// 所以"看得见的那个占用者把它挡住了"讲不通——更像**看不见的 TIME_WAIT**
    /// （`ss -ltnp` 只列监听者，一个 TIME_WAIT 的本地端口照样会让 `bind` 报 EADDRINUSE）。
    /// ⚠️ 别把重试删掉："某一次两套栈都能绑"才是要钉的东西，而"某一次绑不上"
    /// 在这台机器上不是 `pick_port` 的错（连试 10 轮全失败才会红）。
    #[test]
    fn 挑出来的端口两套栈都能绑() {
        // 挑完之后立刻绑回来：这正是 `pick_port` 的承诺。
        let mut last = String::new();
        for _ in 0..10 {
            let port = pick_port().expect("应该挑得到");
            assert!(port > 0);
            // ⚠️ **两个 listener 要同时持有**（写成两句 `assert!` 反而测不出东西：
            // 第一句的值在语句结束时就析构了，端口等于立刻还回去）
            let v6 = TcpListener::bind((Ipv6Addr::LOCALHOST, port));
            let v4 = TcpListener::bind((Ipv4Addr::LOCALHOST, port));
            if v6.is_ok() && v4.is_ok() {
                return;
            }
            last = format!(
                "端口 {port}：v6={:?} v4={:?}",
                v6.as_ref().err(),
                v4.as_ref().err()
            );
        }
        panic!("连试 10 个端口都没能同时绑上 v6/v4——这已经不是赛跑了：{last}");
    }

    #[test]
    fn 入口写在文档同目录且点开头() {
        let dir = temp_dir("entry");
        let path = choose_entry(Some(&dir), DocId(7), "# 一页\n").expect("应该写得进去");
        assert_eq!(path.parent(), Some(dir.as_path()));
        assert_eq!(path.file_name().unwrap(), ".nota-slidev-7.md");
        assert_eq!(std::fs::read_to_string(&path).unwrap(), "# 一页\n");
        let _ = std::fs::remove_dir_all(&dir);
    }

    #[test]
    fn 文档目录写不进去时退回数据目录() {
        // 不存在的目录 = 写不进去。这时**不该报错**，而是换个地方落。
        let missing = std::env::temp_dir().join("nota-slidev-不存在-的目录");
        let path = choose_entry(Some(&missing), DocId(8), "# 退路\n").expect("退回数据目录也要成");
        assert!(
            path.starts_with(paths::data_dir().unwrap()),
            "应该落在数据目录下，实际 {}",
            path.display()
        );
        assert_eq!(std::fs::read_to_string(&path).unwrap(), "# 退路\n");
        let _ = std::fs::remove_file(&path);
    }

    #[test]
    fn 入口文件名跟着文档走_不会互相覆盖() {
        assert_ne!(entry_name(DocId(1)), entry_name(DocId(2)));
        assert!(entry_name(DocId(1)).starts_with('.'));
    }

    #[test]
    #[cfg(unix)]
    fn 同步是整份替换而不是追加() {
        let dir = temp_dir("sync");
        let state = SlidevState::new();
        // 手工塞一个"服务器"，只要入口路径对——`sync` 只碰那个文件。
        *state.0.lock().unwrap() = Some(Server {
            child: spawn_sleeper(),
            info: SlidevInfo::new(1, &dir.join(".nota-slidev-1.md"), DocId(1)),
            log: Arc::new(Mutex::new(Vec::new())),
        });

        sync(&state, "第一版").unwrap();
        sync(&state, "第二版").unwrap();
        assert_eq!(
            std::fs::read_to_string(dir.join(".nota-slidev-1.md")).unwrap(),
            "第二版",
            "重写必须整份替换——追加的话 Slidev 那边会越滚越长"
        );
        stop(&state);
        let _ = std::fs::remove_dir_all(&dir);
    }

    #[test]
    fn 没在跑时同步不报错() {
        let state = SlidevState::new();
        assert!(sync(&state, "随便").is_ok(), "没开预览时打字不该冒错");
        assert!(status(&state).is_none());
        assert!(!probe(&state));
        assert_eq!(log_tail(&state), "");
    }

    #[test]
    fn 日志环只留最后几行() {
        let log: Arc<Mutex<Vec<String>>> = Arc::new(Mutex::new(Vec::new()));
        for i in 0..(LOG_TAIL + 10) {
            push_log(&log, format!("第 {i} 行"));
        }
        let v = log.lock().unwrap();
        assert_eq!(v.len(), LOG_TAIL);
        assert_eq!(v.last().unwrap(), &format!("第 {} 行", LOG_TAIL + 9));
        assert_eq!(v.first().unwrap(), &format!("第 {} 行", 10));
    }

    #[test]
    fn 杀的是进程组而不是那个壳() {
        let args = kill_args(4321);
        #[cfg(unix)]
        {
            assert_eq!(args, vec!["-TERM".to_string(), "-4321".to_string()]);
            // 负号是关键：没有它，`npm exec` 那层死了、底下真正占端口的 node 还活着。
            assert!(args[1].starts_with('-'), "组号必须带负号");
            assert_eq!(kill_program(), "kill");
        }
        #[cfg(windows)]
        {
            assert_eq!(args, vec!["/T", "/F", "/PID", "4321"]);
        }
    }

    #[test]
    #[cfg(unix)]
    fn 收摊之后进程真没了() {
        let mut child = spawn_sleeper();
        let pid = child.id();
        kill_tree(&mut child);
        // 进程组收到 TERM 之后要一点点时间才消失，`wait` 已经等过了，这里再确认一次：
        // `kill -0` 探活，进程不在了它会返回非 0。
        let alive = Command::new("kill")
            .args(["-0", &pid.to_string()])
            .stdout(Stdio::null())
            .stderr(Stdio::null())
            .status()
            .map(|s| s.success())
            .unwrap_or(false);
        assert!(!alive, "进程组应该已经被杀掉了");
    }

    #[test]
    fn 命令不存在时报的是人话() {
        let entry = std::env::temp_dir().join("nota-slidev-不存在.md");
        let err = spawn_with("nota-绝对没有这个命令", &entry, 1).unwrap_err();
        let msg = err.to_string();
        assert!(msg.contains("nota-绝对没有这个命令"), "错误里要点名那个命令：{msg}");
        assert!(msg.contains("Node"), "并且要提示去装 Node：{msg}");
    }

/// 一个活够久的假进程，给"收摊"那几条测试用。
    /// 一个活够久的假进程，给"收摊"那几条测试用。
    #[cfg(unix)]
    fn spawn_sleeper() -> Child {
        use std::os::unix::process::CommandExt;
        let mut cmd = Command::new("sleep");
        cmd.arg("300").stdout(Stdio::null()).stderr(Stdio::null());
        cmd.process_group(0);
        cmd.spawn().expect("起 sleep")
    }
}
