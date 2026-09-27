//! 开发服务器：**宿主替插件起一个本机进程，再把它的地址交给界面**。
//!
//! 这一层是 2026-09-25 从 `slidev.rs` 里提出来的。提出来的判据不是"行数"，是
//! **归属**：Slidev 从那天起是一个**拓展**（`plugins/slidev/main.lua`），
//! 而"挑一个空闲端口、把入口文件写在文档旁边、起进程、杀掉整棵进程树、
//! 探它通没通"这几件事**任何"预览当前文档"的拓展都要用**——它们属于宿主，
//! 不属于某一个拓展。留在宿主的就是这些**机制**；"用哪条命令、命令怎么拼、
//! 装没装、界面长什么样"全在插件那一侧。
//!
//! # ⚠️ 能力放行的是"清单里那一条命令"，不是"任意命令"
//!
//! 这是这一层最要紧的一条，和 `process.git` 是同一条判据（见 `lua/api/git.rs`）：
//! 程序名与参数模板写在 `plugin.toml` 的 `[devserver]` 段里，随插件一起安装、
//! 一起过签名校验；**Lua 那边交不出第二个程序名来**——`nota.devserver.start`
//! 不收 `cmd` 参数。所以 `process.devserver` 这个能力的意思是
//! 「允许起**你清单里声明的那一条**命令」，而不是「允许起进程」。
//!
//! ⚠️ 反过来说，一份**签过名的恶意插件**可以把那条命令写成任意东西。
//! 这道门挡的是"插件偷偷起别的进程"，不是"插件干了坏事"——后者归安装那一步的
//! 信任判定管（`docs/12`）。别把这一层当成沙箱。
//!
//! # 一次会话的生命周期
//!
//! ```text
//! probe（装没装，不联网、不起服务器）
//!   └─> start：挑端口 → 写入口 → 起进程 → **等到端口通**（默认 180 秒）
//!         ├─> status / log（界面问）
//!         ├─> refresh（文档变了，重写入口；宿主自己调，不用插件盯）
//!         └─> stop：杀进程组 + 删入口文件
//! ```
//!
//! ⚠️ **`start` 会阻塞到端口通**，这和它的前身（`slidev.rs`）**故意相反**。
//! 前身不等，是因为它被一条 Tauri **同步**命令直接调着——同步命令跑在主线程上，
//! 在那儿等 180 秒就是冻界面，所以等待被推到前端轮询。
//! 现在这条路径改成由**插件的命令**发起（`nota_plugin_call`），那条命今本来就跑在
//! `spawn_blocking` 的线程池上（见 `commands/plugin.rs` 文件头），等得起。
//! 换来的好处很实在：**前端不再需要"每 500ms 探一次"那条轮询**，
//! 也就没有了"轮询还在飞、用户已经把预览关了"那一类竞态。
//!
//! ⚠️ **一个插件最多一场会话**（`HashMap` 的键就是插件 id）：同一个插件的第二次
//! `start` 会先把上一场收掉。不同插件各起各的，互不干扰。

use std::collections::HashMap;
use std::io::{BufRead, BufReader};
use std::net::{Ipv4Addr, Ipv6Addr, SocketAddr, TcpListener, TcpStream, ToSocketAddrs};
use std::path::{Path, PathBuf};
use std::process::{Child, Command, Stdio};
use std::sync::{Arc, Mutex};
use std::time::{Duration, Instant};

use serde::Serialize;

use crate::document::DocId;
use crate::error::{NotaError, Result};
use crate::paths;
use crate::plugin::manifest::DevServerSpec;
use crate::proc::split_command;

// ⚠️ **探测那一半不在这个文件里**：`probe.rs`（问"现在能不能跑"，不起会话、
// 不留状态），2026-09-26 因为这里破了一千行分出去的。
// 名字从这里转发一道，是因为调它的地方（`lua/api/devserver.rs`）一向写的是
// `crate::devserver::probe(…)` 和 `crate::devserver::Probe`——为了搬家去改那些
// `use` 属于白改（`mod probe` 在类型名字空间、`pub use` 的那个函数在值名字
// 空间，同名不冲突）。
mod probe;
pub use probe::{probe, Probe, ProbeState};

/// 日志环里留多少行。够看出"主题没装""端口被占"这类事了。
const LOG_TAIL: usize = 30;

/// 探活的超时。**必须短**：这是同一个线程里连着试几个地址用的。
const PROBE_TIMEOUT: Duration = Duration::from_millis(300);

/// 等端口通的默认上限。第一次要下几百 MB 的前端工具链，慢是正常的。
pub const START_TIMEOUT: Duration = Duration::from_secs(180);

// ── 托管状态 ──────────────────────────────────────────────────────────────

/// 每个插件一场会话。键是插件 id。
pub struct DevServerState(pub Mutex<HashMap<String, Server>>);

impl DevServerState {
    pub fn new() -> Self {
        Self(Mutex::new(HashMap::new()))
    }

    /// 应用退出前把所有会话收掉。
    ///
    /// ⚠️ **不收就是漏**：这些是 `Command` 起的子进程，不在 Tauri 的管理范围内，
    /// 主进程一退**它自己接着跑**（2026-09-25 实测：SIGTERM 掉 Nota 之后
    /// Slidev 还占着端口，得手动 kill）。
    pub fn stop_all(&self) {
        let mut map = self.0.lock().unwrap();
        map.clear(); // `Server::drop` 负责杀
    }
}

impl Default for DevServerState {
    fn default() -> Self {
        Self::new()
    }
}

/// 起好了的服务器。**`Drop` 里收摊**——"忘了调 stop"也不会留下孤儿进程与点文件。
pub struct Server {
    child: Child,
    info: Info,
    /// 进程输出（stdout+stderr 混在一起）的最后 `LOG_TAIL` 行。
    log: Arc<Mutex<Vec<String>>>,
    /// 这场会话盯着哪份文档。`None` = 插件没说是哪份（那就没人会来刷它）。
    doc: Option<DocId>,
}

impl Drop for Server {
    fn drop(&mut self) {
        kill_tree(&mut self.child);
        // 入口是宿主自己造的影子文件，收摊时就该消失。
        // ⚠️ 进程被 SIGKILL 掉（应用崩溃）时这里跑不到，会留一个点文件在用户的目录里——
        // 下次 start 会原地覆盖它，所以最多只是"多一个看不见的小文件"。
        if let Some(entry) = &self.info.entry {
            let _ = std::fs::remove_file(entry);
        }
    }
}

/// 交给界面（和插件）的会话信息。
#[derive(Debug, Clone, Serialize)]
pub struct Info {
    pub plugin: String,
    pub port: u16,
    /// 插件把这个串拿去嵌 iframe。**不是写死的 `localhost`**——见
    /// [`reachable_url`]：这个地址是启动时**探出来真能连上的那一个**。
    pub url: String,
    /// 写出来的影子入口文件（绝对路径）。没有入口文件时是 `None`。
    pub entry: Option<String>,
    /// 进程还在不在（`try_wait`）。**不是**"端口通不通"——探端口要 300ms，
    /// 面板每拉一次都做不起。
    pub alive: bool,
}

// ── start ─────────────────────────────────────────────────────────────────

/// 起一场会话并**等到端口通**（超时 [`START_TIMEOUT`]）。
///
/// `root` 是"项目根"：入口文件写进它、进程在它里面跑。`None`（文档没存过盘）
/// 时退回插件自己的数据目录，代价是相对图片会裂——那也比如实报错强。
///
/// 入口文件写的就是**当前正文，逐字**；而且**记住是哪份文档**：以后它每变一次，
/// 宿主都重写一遍（见 [`refresh`]），插件不用自己盯着。
pub fn start(
    state: &DevServerState,
    plugin: &str,
    spec: &DevServerSpec,
    root: Option<PathBuf>,
    doc: Option<DocId>,
    text: &str,
) -> Result<Info> {
    // 先收掉上一场：一个插件同时只该有一个服务器，不然端口、入口文件、
    // 窗口三者会互相说谎。
    stop(state, plugin);

    let port = pick_port()?;
    let entry = write_entry(spec, plugin, root.as_deref(), doc, text)?;
    let (child, log) = spawn(spec, entry.as_deref(), port)?;

    let info = Info {
        plugin: plugin.to_owned(),
        port,
        // 先填一个占位地址；端口通了之后会被换成探出来的那个（见下面）。
        url: format!("http://127.0.0.1:{port}/"),
        entry: entry.as_ref().map(|p| p.to_string_lossy().into_owned()),
        alive: true,
    };
    // ⚠️ 这里**不写"已启动"**。2026-09-26 之前这一句是 `挂上去之前` 打的，于是
    // 一次"进程两秒就退了"的失败在日志里长这样：先一句「已启动，端口 32791」，
    // 再一句「服务器进程自己退出了」——用户看到的是一对自相矛盾的话（实测就是
    // 拿着这两行来问的）。端口通没通那一刻才知道，所以那句挪到 `Wait::Ready`
    // 之后（见下面），这里只交代"入口写在哪"。
    if let Some(p) = &entry {
        push_log(&log, format!("[nota] 入口文件 {}", p.display()));
    }
    // 端口通了之后要往这个环里再写一句，而 `log` 马上就被搬进 `Server` 了。
    let log2 = log.clone();

    {
        let mut map = state.0.lock().unwrap();
        map.insert(
            plugin.to_owned(),
            Server {
                child,
                info: info.clone(),
                log,
                doc,
            },
        );
    }
    // ⚠️ 锁**在这里就放掉了**，下面等端口的这段时间里 `stop()` 能从别的线程进来
    // （用户点了「停止预览」）。放不掉的话，那一下会一直卡到超时。
    let wait = START_TIMEOUT;

    match wait_ready(state, plugin, port, wait) {
        Wait::Ready => {
            // ⚠️ 这才是"起来了"该出现的位置：端口真的通了。失败时**一个字都不写**，
            // 免得再出现上面那种"已启动"＋"自己退出了"的对话。
            push_log(&log2, format!("[nota] 端口 {port} 通了"));
        }
        why => {
            // 出事了：把这场的日志**取出来再收摊**，不然收完就没人知道为什么了。
            let tail = log_tail(state, plugin);
            stop(state, plugin);
            return Err(NotaError::other(match why {
                // ⚠️ "自己退了"和"等到超时"**必须分开说**（2026-09-25 实测踩到）：
                // Slidev 因为主题找不到，两秒就退了，而前身这里一律写
                // "服务器起来了但 180 秒都没通端口"——用户会去查一个不存在的超时。
                Wait::Died => format!("服务器进程自己退出了，没等到端口通。它最后的输出：\n{tail}"),
                Wait::Gone => "服务器在启动过程中被停掉了。".to_owned(),
                // `Ready` 在上面那条分支里，到不了这儿。
                Wait::Ready | Wait::Timeout => format!(
                    "服务器起来了但 {} 秒都没通端口。它最后的输出：\n{tail}",
                    wait.as_secs()
                ),
            }));
        }
    }
    // ⚠️ **端口通了 ≠ 写死的那个地址能用**（2026-09-25 实测踩到）：把地址换成
    // 探出来真能连上的那一个再交出去。少了这一步，面板里那块 iframe 就是一片
    // 空白，而日志里一个错都没有——最难查的那种。
    if let Some(server) = state.0.lock().unwrap().get_mut(plugin) {
        server.info.url = reachable_url(port);
    }
    // 等待期间用户可能已经把它停了（或它自己死了）——那时**不该报成功**。
    match status(state, plugin) {
        Some(i) => Ok(i),
        None => Err(NotaError::other("服务器在启动过程中被停掉了")),
    }
}

/// 文档变了：把所有**正盯着这份文档**的会话的入口文件重写一遍。
///
/// 由 `nota_doc_sync` / `nota_doc_settle` 在**放掉 documents 锁之后**调
/// （锁序见 `state.rs` 顶上那段：`plugins → documents → settings`，
/// 而这里只碰 devserver 那把锁，不往回拿 documents，所以不破规矩）。
///
/// ⚠️ 入口文件**还是写在原来的位置**，即使这份文档后来"另存为"到了别处：
/// 会话的项目根是启动那一刻定下的，改它就意味着要把服务器重启一遍
/// （项目根变了，相对路径全变）。这件事交给用户按「停止」再「启动」——
/// 一次重启比一个"悄悄换了根、图片突然全裂"的行为好懂。
pub fn refresh(state: &DevServerState, doc: DocId, text: &str) {
    let map = state.0.lock().unwrap();
    for server in map.values() {
        if server.doc != Some(doc) {
            continue;
        }
        let Some(entry) = &server.info.entry else {
            continue;
        };
        // 写不进去（目录被删了、权限变了）**不抛**：这是后台顺手刷新，
        // 没有一个用户正等着的操作可以承载这个错误。用户会在预览里看到旧的画面，
        // 而下次「停止 + 启动」会把问题如实报出来。
        let _ = write_file(Path::new(entry), text);
    }
}

/// 轮询端口直到通、或超时、或那场会话已经不在了。
///
/// ⚠️ 每轮都查一次 `status`：进程已经退出（比如主题没装、端口被占）时
/// 不该把 180 秒耗完才告诉用户。
/// 等端口通的三种失败，**分开是为了让报出去的那句话说得准**（理由见 `start` 里那段）。
enum Wait {
    Ready,
    /// 进程自己退了（崩了、或者像 Slidev 那样"缺主题就直接退出"）。
    Died,
    /// 会话被拿掉了（用户点了「停止预览」）。
    Gone,
    /// 进程还活着，但端口一直没通。
    Timeout,
}

fn wait_ready(state: &DevServerState, plugin: &str, port: u16, wait: Duration) -> Wait {
    let deadline = Instant::now() + wait;
    loop {
        if port_open(port) {
            return Wait::Ready;
        }
        match status(state, plugin) {
            None => return Wait::Gone,
            Some(s) if !s.alive => return Wait::Died,
            Some(_) => {}
        }
        if Instant::now() >= deadline {
            return Wait::Timeout;
        }
        std::thread::sleep(Duration::from_millis(200));
    }
}

// ── 其余四件事 ────────────────────────────────────────────────────────────

/// 收摊：杀进程组 + 删入口文件。**没在跑就是空操作**（重复调用无害）。
pub fn stop(state: &DevServerState, plugin: &str) {
    // 先把它从状态里**取出来**，`Drop` 在 `guard` 释放后跑到——不然删文件、等子进程
    // 收尸这些慢活都攥着锁。
    let taken = state.0.lock().unwrap().remove(plugin);
    drop(taken);
}

/// 当前会话（每拉一次都重算 `alive`——`try_wait` 是瞬时的）。
pub fn status(state: &DevServerState, plugin: &str) -> Option<Info> {
    let mut map = state.0.lock().unwrap();
    let server = map.get_mut(plugin)?;
    server.info.alive = server.child.try_wait().ok().flatten().is_none();
    Some(server.info.clone())
}

/// 进程输出的最后几行。**启动失败时端给用户看**——真正的病因（缺主题、
/// 端口被占、node 版本太老）就在里面，比另写一句概括更准。
pub fn log_tail(state: &DevServerState, plugin: &str) -> String {
    let map = state.0.lock().unwrap();
    match map.get(plugin) {
        Some(s) => s.log.lock().unwrap().join("\n"),
        None => String::new(),
    }
}

// ── 入口文件 ──────────────────────────────────────────────────────────────

/// 把入口写到哪、写进去。
///
/// 优先**文档同目录**（不是 Nota 的数据目录）：服务器把入口文件的父目录当项目根，
/// `![](./img.png)` 这类相对路径都相对它解析。放到别处，一份带图的文档会集体裂图。
/// 写不进去（没存过盘、只读目录）再退回插件自己的数据目录。
fn write_entry(
    spec: &DevServerSpec,
    plugin: &str,
    root: Option<&Path>,
    doc: Option<DocId>,
    body: &str,
) -> Result<Option<PathBuf>> {
    let Some(name) = doc.and_then(|d| spec.entry_name(d.0)) else {
        // 没声明入口文件，或者插件没告诉宿主是哪份文档——两种情况都不写。
        // ⚠️ 不报错：一个不需要入口文件的服务器是合法的。
        return Ok(None);
    };

    if let Some(dir) = root {
        if dir.is_dir() {
            let candidate = dir.join(&name);
            if write_file(&candidate, body).is_ok() {
                return Ok(Some(candidate));
            }
            // 写不进去（只读目录、权限不够）不是错误——退回数据目录照样能用，
            // 只是相对图片会裂。**所以这里不抛，往下走**。
        }
    }

    let fallback = paths::data_dir()?.join("devserver").join(plugin).join(&name);
    if let Some(parent) = fallback.parent() {
        paths::ensure_dir(parent)?;
    }
    write_file(&fallback, body)?;
    Ok(Some(fallback))
}

fn write_file(path: &Path, body: &str) -> Result<()> {
    std::fs::write(path, body).map_err(|source| NotaError::Write {
        path: path.to_path_buf(),
        source,
    })
}

// ── 进程 ──────────────────────────────────────────────────────────────────

/// 起进程，并把它的输出抽到一个日志环里。
fn spawn(spec: &DevServerSpec, entry: Option<&Path>, port: u16) -> Result<(Child, Arc<Mutex<Vec<String>>>)> {
    let cmd = spec.command();
    // ⚠️ 拆法和探测那边共用（`split_command`）：面板打包票的那条命令，
    // 必须就是这里真正起的这条。
    let (program, mut args) =
        split_command(&cmd).ok_or_else(|| NotaError::other("启动命令是空的"))?;

    // 参数模板：`{port}` 与 `{entry}`。
    let entry_str = entry.map(|p| p.to_string_lossy().into_owned());
    args.extend(spec.args.iter().map(|a| {
        a.replace("{port}", &port.to_string())
            .replace("{entry}", entry_str.as_deref().unwrap_or(""))
    }));

    let log: Arc<Mutex<Vec<String>>> = Arc::new(Mutex::new(Vec::new()));
    // ⚠️ 打的是**真起的那条 argv**（`program` ＋ `args`），不是 `cmd` ＋ `args`：
    // `split_command` 把程序名也算进了 `args`，写成 `{cmd} {args}` 会在那一行里
    // 把命令名打印**两遍**（`$ npx @slidev/cli @slidev/cli …`）。2026-09-26 实测
    // 用户拿着这一行来问"为什么命令是重复的"——那一行是日志，不是它真跑的东西。
    push_log(&log, format!("[nota] $ {program} {}", args.join(" ")));

    // 项目根 = 入口文件的父目录；没有入口文件就不改工作目录（继承本进程的）。
    let cwd = entry.and_then(|p| p.parent().map(Path::to_path_buf));

    let mut command = Command::new(&program);
    command
        .args(&args)
        .stdin(Stdio::null())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        // 别让它自己再开一个系统浏览器——要看是我们开。
        // ⚠️ 值是 `none` 而不是 `false`：多数工具认的是"有个浏览器但叫 none"。
        .env("BROWSER", "none")
        .env("NO_COLOR", "1");
    if let Some(dir) = &cwd {
        command.current_dir(dir);
    }

    // ⚠️ 自成**进程组**，收摊时才有得杀（见 `kill_tree`）。
    #[cfg(unix)]
    {
        use std::os::unix::process::CommandExt;
        command.process_group(0);
    }

    // ⚠️ 走 `proc::spawn_retrying` 而不是 `command.spawn()`：`ETXTBSY` 那条
    // 暂时状态要有重试（原因见那个函数），这里和 `run_capture` 是同一个坑。
    let mut child = crate::proc::spawn_retrying(&mut command).map_err(|e| {
        if e.kind() == std::io::ErrorKind::NotFound {
            NotaError::other(format!("找不到 `{program}`，请先按它的文档把工具装上"))
        } else {
            NotaError::other(format!("起进程失败：{e}"))
        }
    })?;

    // ⚠️ **必须有人读它的 stdout/stderr**：管道的缓冲区满了之后，写端会阻塞，
    // 服务器就会**卡死在那儿**——现象是"再也不响应了"，而且没有任何报错。
    // 所以下面这两行 `thread::spawn` 不是"顺手记日志"，是必需的。
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
/// ⚠️ 只 `child.kill()` 是不够的：实测进程链是 `sh` → `npm exec` → `node ...`，
/// `Child` 拿到的是最上面那层。杀了它，底下那个会变成孤儿**继续占着端口**——
/// 下次预览就会"起得来但连不上旧的那个"，是最难查的一种。
///
/// 所以：起进程时让它自成进程组（`process_group(0)`），这里给**整个组**发信号。
/// 组号就是组长（那个 `Child`）的 pid，用负数表示"发给整个组"。
fn kill_tree(child: &mut Child) {
    let pid = child.id();
    crate::proc::kill_group(pid);
    // 兜底 + 收尸：不 `wait` 会留下僵尸进程。
    let _ = child.kill();
    let _ = child.wait();
}

fn push_log(log: &Arc<Mutex<Vec<String>>>, line: String) {
    let mut v = log.lock().unwrap();
    if v.len() >= LOG_TAIL {
        v.remove(0);
    }
    v.push(line);
}

// ── 端口 ──────────────────────────────────────────────────────────────────

/// 挑一个**两套栈都空着**的端口。
///
/// ⚠️ 不能只 bind 一次 `127.0.0.1:0` 就算数：实测不少前端工具绑的是 `[::1]`，
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
        // 抢同一个端口才会撞上，撞上也就是"起的服务器绑不上"——前端会把它的输出端出来。
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

/// 挑一个**真能连上**的回环地址，填进 [`Info::url`]。
///
/// ⚠️ 为什么要探，而不是写死一个（2026-09-25 实测坐实）：服务器绑哪个栈不由我们
/// 决定。实测 Slidev（Vite）只绑 `[::1]`，写 `127.0.0.1` 的框**永远连不上**；
/// 反过来有的工具只绑 v4。写死哪一边都有一半的服务器嵌不进预览。
///
/// 顺序是 **v4 先问、v4 不应再问 v6**：双栈都在听的服务器（大多数）因此还是拿到
/// `127.0.0.1`，和从前一样；只有真只绑 v6 的才换地址。
///
/// ⚠️ 换也**不能写 `[::1]` 这个字面量**：CSP 的 `frame-src` 在 WebKit 里认不出
/// 带方括号的 host-source（实测：同一条策略里 `http://localhost:*` 能放行、
/// `http://[::1]:*` 被拦，帧静默空白）。所以 v6-only 时写 `localhost`——
/// WebKit 的 HTTP 栈会两栈都试，实测能连上只听 `[::1]` 的服务器
/// （界面自己就是从 `localhost:5273` 加载的，而那个端口只绑 v6）。
fn reachable_url(port: u16) -> String {
    let v4 = SocketAddr::from((Ipv4Addr::LOCALHOST, port));
    let v6 = SocketAddr::from((Ipv6Addr::LOCALHOST, port));
    if TcpStream::connect_timeout(&v4, PROBE_TIMEOUT).is_ok() {
        return format!("http://127.0.0.1:{port}/");
    }
    if TcpStream::connect_timeout(&v6, PROBE_TIMEOUT).is_ok() {
        return format!("http://localhost:{port}/");
    }
    // 两边都不应：多半是刚被停掉、或者进程正在退。给个 v4 地址当门牌，
    // 让界面照常把 iframe 画出来（连不上时用户还能点「重新检测」）。
    format!("http://127.0.0.1:{port}/")
}

#[cfg(test)]
mod tests {
    use super::*;

    /// 一个自己的临时目录。不引 `tempfile`：这里只用这一次，且要能自己删干净。
    fn temp_dir(tag: &str) -> PathBuf {
        let dir = std::env::temp_dir().join(format!("nota-devserver-{tag}-{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&dir);
        std::fs::create_dir_all(&dir).expect("建临时目录");
        dir
    }

    /// 一份最小清单。测试用的命令一律是假的（不会真起服务器）。
    fn spec(entry: Option<&str>) -> DevServerSpec {
        DevServerSpec {
            cmd: "npx @slidev/cli".to_owned(),
            cmd_env: Some("NOTA_测试_绝不存在的变量".to_owned()),
            args: vec!["{entry}".to_owned(), "--port".to_owned(), "{port}".to_owned()],
            entry: entry.map(str::to_owned),
            probe_args: None,
            probe_env: None,
            project_marker: None,
        }
    }

    /// ⚠️ 这条**要和机器上别的东西赛跑**，所以带重试：`--test-threads=1` 时全绿，
    /// 并行时偶尔红（机制没查清，像 TIME_WAIT）。**别把重试删掉**——
    /// 连试 10 轮全失败才会红，那才是真的坏。
    #[test]
    fn 挑出来的端口两套栈都能绑() {
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
            last = format!("端口 {port}：v6={:?} v4={:?}", v6.as_ref().err(), v4.as_ref().err());
        }
        panic!("连试 10 个端口都没能同时绑上 v6/v4——这已经不是赛跑了：{last}");
    }

    #[test]
    fn 入口写在项目根里() {
        let dir = temp_dir("entry");
        let path = write_entry(&spec(Some(".nota-slidev-{doc}.md")), "nota.slidev", Some(&dir), Some(DocId(7)), "# 一页\n")
            .expect("应该写得进去")
            .expect("有入口");
        assert_eq!(path.parent(), Some(dir.as_path()));
        assert_eq!(path.file_name().unwrap(), ".nota-slidev-7.md");
        assert_eq!(std::fs::read_to_string(&path).unwrap(), "# 一页\n");
        let _ = std::fs::remove_dir_all(&dir);
    }

    #[test]
    fn 项目根写不进去时退回数据目录() {
        // 不存在的目录 = 写不进去。这时**不该报错**，而是换个地方落。
        let missing = std::env::temp_dir().join("nota-devserver-不存在-的目录");
        let path = write_entry(&spec(Some("入口-{doc}.md")), "nota.测试", Some(&missing), Some(DocId(8)), "# 退路\n")
            .expect("退回数据目录也要成")
            .expect("有入口");
        assert!(
            path.starts_with(paths::data_dir().unwrap()),
            "应该落在数据目录下，实际 {}",
            path.display()
        );
        assert_eq!(std::fs::read_to_string(&path).unwrap(), "# 退路\n");
        let _ = std::fs::remove_file(&path);
    }

    #[test]
    fn 没声明入口文件时不写文件() {
        let dir = temp_dir("no-entry");
        let out = write_entry(&spec(None), "nota.测试", Some(&dir), Some(DocId(1)), "正文").unwrap();
        assert!(out.is_none());
        assert_eq!(std::fs::read_dir(&dir).unwrap().count(), 0, "一个文件都不该写");
        let _ = std::fs::remove_dir_all(&dir);
    }

    #[test]
    fn 入口名字跟着文档走_不会互相覆盖() {
        let s = spec(Some(".nota-preview-{doc}.md"));
        assert_ne!(s.entry_name(1), s.entry_name(2));
        assert!(s.entry_name(1).unwrap().starts_with('.'));
    }

    #[test]
    fn 启动命令的环境变量旋钮优先() {
        // 这个变量在本测试进程里**不存在**，所以应当退回清单里那条。
        let s = spec(None);
        assert_eq!(s.command(), "npx @slidev/cli");
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
    fn 没在跑的时候问什么都是空的() {
        let state = DevServerState::new();
        assert!(status(&state, "nota.测试").is_none());
        assert_eq!(log_tail(&state, "nota.测试"), "");
        // 收摊对"本来就没开"是空操作。
        stop(&state, "nota.测试");
    }

    /// 文档变了要能把入口重写掉，而且**只重写盯着这份文档的那一场**。
    ///
    /// ⚠️ 这条不碰进程：`refresh` 只读 `info.entry` 和 `header` 两格，
    /// 所以手工造一个 `Server` 就够了（真起进程要 node，那样的用例在 CI 里
    /// 一定会红）。这也是为什么 `refresh` 不该顺手去查 `child`。
    #[test]
    fn 文档变了只刷盯着它的那一场() {
        let dir = temp_dir("refresh");
        let 入口 = dir.join("入口.md");
        std::fs::write(&入口, "旧").unwrap();

        let state = DevServerState::new();
        let mut cmd = Command::new("sleep");
        cmd.arg("300").stdout(Stdio::null()).stderr(Stdio::null());
        {
            use std::os::unix::process::CommandExt;
            cmd.process_group(0);
        }
        let child = cmd.spawn().expect("起 sleep");
        let info = Info {
            plugin: "nota.测试".to_owned(),
            port: 1,
            url: "http://localhost:1/".to_owned(),
            entry: Some(入口.display().to_string()),
            alive: true,
        };
        state.0.lock().unwrap().insert(
            "nota.测试".to_owned(),
            Server {
                child,
                info,
                log: Arc::new(Mutex::new(Vec::new())),
                doc: Some(DocId(7)),
            },
        );

        // 别的文档变了：一个字都不该动。
        refresh(&state, DocId(8), "别人的正文");
        assert_eq!(std::fs::read_to_string(&入口).unwrap(), "旧");

        // 这份文档变了：**逐字**重写。
        refresh(&state, DocId(7), "新正文");
        assert_eq!(std::fs::read_to_string(&入口).unwrap(), "新正文");

        // 收摊时 `Drop` 会把那个点文件删掉（这里是普通文件，同样删）。
        state.stop_all();
        assert!(!入口.exists(), "收摊该把入口文件删掉");
        let _ = std::fs::remove_dir_all(&dir);
    }

    #[test]
    #[cfg(unix)]
    fn 收摊之后进程真没了() {
        let mut cmd = Command::new("sleep");
        cmd.arg("300").stdout(Stdio::null()).stderr(Stdio::null());
        {
            use std::os::unix::process::CommandExt;
            cmd.process_group(0);
        }
        let mut child = cmd.spawn().expect("起 sleep");
        let pid = child.id();
        kill_tree(&mut child);
        // 进程组收到 TERM 之后要一点点时间才消失，`wait` 已经等过了，这里再确认一次。
        let alive = Command::new("kill")
            .args(["-0", &pid.to_string()])
            .stdout(Stdio::null())
            .stderr(Stdio::null())
            .status()
            .map(|s| s.success())
            .unwrap_or(false);
        assert!(!alive, "进程组应该已经被杀掉了");
    }
}
