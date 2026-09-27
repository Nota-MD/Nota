//! **单实例**（`docs/10-feature-matrix.md` §9 那一格，2026-09-27）。
//!
//! 开第二次的时候**不再起第二个进程**：把"要打开什么"转交给已经在跑的那一份，
//! 自己退出。用户看到的是"窗口跳起来、文件开好了"，而不是两个 Nota。
//!
//! # 为什么是 Unix socket，不是锁文件
//!
//! 锁文件（`flock` / 一个 `pid` 文件）两种都要额外对付同一件事：**上一个进程
//! 被 `SIGKILL` 掉之后留下的那个文件**。锁文件得再写一段"这个 pid 还活着吗"
//! 的判断，而那段判断本身就有竞态（pid 会被回收）。
//!
//! socket 没有这个问题：`connect()` **真的去问了一句"有人在这个地址上听吗"**。
//! 没有 → `ECONNREFUSED` → 那个文件是上一次留下的，删掉自己绑。
//! "文件在不在"与"有没有人在听"是两件事——**这是本模块唯一的技术点**。
//!
//! ⚠️ **socket 文件放 `$XDG_RUNTIME_DIR`**（一般是 `/run/user/1000`，登录时
//! 建、注销时由系统删），拿不到才退回 `data_dir()`。放运行目录的理由是它
//! **天然是"这一次登录"的范围**：换用户、重启桌面都不会撞上别人的。
//!
//! # 转交的是什么
//!
//! **一个路径的原始字节**（`OsStr` 的字节），写完就 `shutdown`。
//! ⚠️ 不走 JSON / 不走 `String`：Linux 上的路径**可以不是合法 UTF-8**，
//! 一旦编成字符串就得先 `lossy`，而 lossy 出来的是**另一个路径**——
//! 接收方会去打开一个不存在的文件，症状是"转交过去的文件打不开，本机自己开
//! 却是好的"。写字节、读字节，两边都走 `OsString`，不经过字符串。
//!
//! ⚠️ 空帧是**正当的**：第二次启动没带文件（用户只是又点了一次图标），
//! 那也该把窗口抬起来——这正是绝大多数人点第二次图标时想要的。
//!
//! # 不做的事
//!
//! - **不解析参数**：挑"要打开哪个"是 `cli.rs` 的活，两边都调它，规则只有一份。
//! - **不判文件在不在**：同 `cli.rs` 顶上那段——失败要由**打开文档那条路**去说
//!   （弹提示条），在这里判就等于把失败吞掉。
//! - **不防恶意本地用户**：socket 在 `0700` 的运行目录里，同机的别的用户进不来。
//!   能进来的只有同一个用户自己的进程，而那已经可以随便读用户的文件了，
//!   再加一层认证是**假装**有条安全边界。⚠️ 但仍然**限长**（见 `最大帧`）：
//!   那不是防谁，是防一个写坏的调用方把接收线程的缓冲撑爆。

use std::ffi::{OsStr, OsString};
use std::io::{Read, Write};
use std::path::PathBuf;

use crate::error::{NotaError, Result};

/// 一帧最多这么多个字节。⚠️ 见文件头最后一段：这是**防手滑**不是防攻击。
const 最大帧: u64 = 64 * 1024;

/// socket 的文件名。⚠️ 只有这一处定义——`抢占` 与 `收摊` 都用它。
const 文件名: &str = "nota.sock";

/// `抢占` 的结论。
pub enum 决定 {
    /// 我是第一个：拿着这个监听器，等第二次启动来敲门。
    第一个(监听器),
    /// 已经有一份在跑，参数**已经转交给它了**。调用方应该直接退出。
    已转交,
}

/// **MCP 会话的暗号**（2026-09-27 加，见 `crate::mcp`）。
///
/// 一条连接只要头 8 个字节是它，那它就不是"来转交一个路径"，而是**一场 MCP
/// 会话**：`nota --mcp` 那一份进程把 AI 客户端的 stdin/stdout 接到这条 socket
/// 上，由**已经在跑的这一份 Nota** 在自己的进程里服务它。
///
/// ⚠️ 为什么是「一个 NUL ＋ 明文」：这条 socket 上的帧原本是**路径的原始字节**，
/// 而 Linux 的路径里**不可能有 NUL**（内核明令禁止），所以拿 NUL 打头是天然
/// 撞不上的——一个叫 `nota-mcp` 的文件也撞不上，因为前面那个 NUL 根本进不了
/// 文件名。后面写成明文，是为了翻日志/抓包时能一眼认出它是什么。
///
/// ⚠️ **长度也算协议的一部分**：对面（`mcp::接上`）发的是这一串的字节，
/// 接收侧（`收下`）读的也是 `MCP暗号.len()` 个字节。改长度两边一起改，
/// 这一处定义就是那个"一起"。
pub const MCP暗号: &[u8] = b"\0nota-mcp\n";

/// [`监听器::收下`] 收到的那一条是什么。
pub enum 收到 {
    /// 老含义：要打开的东西。`None` = 空帧（"没带什么，把窗口抬起来就行"）。
    要打开(Option<OsString>),
    /// 一场 MCP 会话。⚠️ 这条连接的**读位置已经在暗号之后**了，直接交给
    /// `crate::mcp::服务流`（它从那儿接着读）。
    会话(std::os::unix::net::UnixStream),
}

/// 从连接上读**最多** [`MCP暗号`] 那么多个字节（读不满就是读不满，见到 EOF 就停）。
///
/// ⚠️ 一个字节都不许多读：多读的那些属于 MCP 那一路要用的流。这也是这里
/// 不用 `BufReader`/`read_to_end` 的唯一理由。
fn 读头(连接: &std::os::unix::net::UnixStream) -> std::io::Result<Vec<u8>> {
    let mut 头 = vec![0u8; MCP暗号.len()];
    let mut 已读 = 0;
    // ⚠️ 这一行不是多余的：`Read` 是给 `&UnixStream` 实现的那个（`impl Read for
    // &UnixStream`），它的 `read` 要 `&mut self`——而这里的 `self` 是**这个引用
    // 本身**，所以得有一个 `mut` 的绑定，不能直接对 `&UnixStream` 调。
    let mut 源 = 连接;
    while 已读 < 头.len() {
        match 源.read(&mut 头[已读..]) {
            Ok(0) => break,
            Ok(多少) => 已读 += 多少,
            Err(e) if e.kind() == std::io::ErrorKind::Interrupted => {}
            Err(e) => return Err(e),
        }
    }
    头.truncate(已读);
    Ok(头)
}

/// 监听器 + 它落在盘上的那个路径（退出时要删）。
pub struct 监听器 {
    socket: std::os::unix::net::UnixListener,
    路径: PathBuf,
}

impl 监听器 {
    /// socket 文件在盘上的位置。⚠️ 退出时删它，见 [`收摊`]。
    pub fn 路径(&self) -> &std::path::Path {
        &self.路径
    }

    /// 收下一条连接。**阻塞**，由调用方丢进线程里。
    ///
    /// 返回 `None` 表示这条连接读不出来（读失败）。⚠️ 一条连接出问题
    /// **不能让循环退出**：写坏了的调用方顶多让它这一次白跑，不能因此把
    /// "以后再也收不到转交"这种事留给用户。
    pub fn 收下(&self) -> Option<收到> {
        let (连接, _) = self.socket.accept().ok()?;
        // ⚠️ 先读头 8 个字节判是不是暗号。**这一步不许用 `BufReader`**：
        // 它会多吞一块缓冲，而 MCP 那一路要把这条流**从暗号之后**原样交出去
        // （`crate::mcp::服务流`），被吞掉的就是客户端发来的头几行。
        let 头 = 读头(&连接).ok()?;
        if 头 == MCP暗号 {
            return Some(收到::会话(连接));
        }
        let mut 缓冲 = 头;
        // ⚠️ `take(最大帧)`：不设上限的话，一个连上就不停写的进程能把内存吃光
        // （我们自己不会那么干，但"我们自己不会"从来不是一条防线）。
        // ⚠️ 这个上限只管路径这一路：MCP 那一路上面就先分流走了，它是一场
        // **会话**，本来就没有"一帧"这回事。
        连接.take(最大帧).read_to_end(&mut 缓冲).ok()?;
        if 缓冲.is_empty() {
            // 空帧 = "没带东西，把窗口抬起来就行"。用 `None` 表达，
            // 让调用方自己决定"没有文件"该怎么办（它知道还有别的事要做）。
            return Some(收到::要打开(None));
        }
        Some(收到::要打开(Some(
            std::os::unix::ffi::OsStringExt::from_vec(缓冲),
        )))
    }
}

/// socket 的落点。
///
/// ⚠️ 拿不到运行目录（比如某些容器里没设 `XDG_RUNTIME_DIR`）时退回 `data_dir()`：
/// 那份目录别处一直在用、一定建得出来，代价是退出时留下的 socket 文件
/// 会被下一次启动的 `ECONNREFUSED` 那条路清掉——不会越攒越多。
pub fn socket路径() -> Result<PathBuf> {
    let 底 = match dirs::runtime_dir() {
        Some(d) => d,
        None => crate::paths::data_dir()?,
    };
    Ok(底.join(文件名))
}

/// 抢占那一个位置，顺手把参数转交出去。**进程启动时调一次**，早于 Tauri 起来。
///
/// ⚠️ 必须早于建窗：晚了的话第二个进程会先**闪出一个空窗口**再退出，
/// 用户看到的是"Nota 闪了一下然后就没了"，比没有单实例还糟。
///
/// ⚠️ **转交失败不报错，直接当自己是第一个**：那种情形只有一种——另一份
/// Nota 正好在这一瞬间退出了（我们问"有人听吗"时它还在）。那不是异常，
/// 是竞态；这时候老老实实自己起来当主人，比报一个用户看不懂的错强。
pub fn 抢占(要打开的: Option<&OsStr>) -> Result<决定> {
    let 路径 = socket路径()?;
    if let Some(父) = 路径.parent() {
        crate::paths::ensure_dir(父)?;
    }

    if 转交(&路径, 要打开的).is_ok() {
        return Ok(决定::已转交);
    }

    // 没人在听（或者刚转交失败）。⚠️ 这里**可能**有一个上一次留下的文件、
    // 也可能根本没有——不判它存在不存在，直接删：`remove_file` 报"没有这个文件"
    // 是正常情况，不是错误。
    let _ = std::fs::remove_file(&路径);

    let socket = std::os::unix::net::UnixListener::bind(&路径).map_err(|e| {
        NotaError::Other(format!("单实例：绑不上 {}：{e}", 路径.display()))
    })?;
    Ok(决定::第一个(监听器 { socket, 路径 }))
}

/// 把"要打开什么"转交给已经在跑的那一份。
///
/// ⚠️ 空帧也要发（`文件` 为 `None` 时）：**连上本身就是"我来了"这句话**，
/// 对面收到之后会把窗口抬起来。不发的话第二次点图标什么都不会发生。
fn 转交(路径: &std::path::Path, 文件: Option<&OsStr>) -> std::io::Result<()> {
    let mut 流 = std::os::unix::net::UnixStream::connect(路径)?;
    if let Some(f) = 文件 {
        流.write_all(std::os::unix::ffi::OsStrExt::as_bytes(f))?;
    }
    // ⚠️ 必须 `shutdown`：对面是 `read_to_end`，它要看到 **EOF** 才算这一帧完。
    // 只靠 `drop` 通常也会关，但关得晚，而对面那一头正阻塞在读上。
    let _ = 流.shutdown(std::net::Shutdown::Write);
    Ok(())
}

/// 第二份进程把"要打开什么"转到第一份时，宿主发给前端的**事件名**。
///
/// ⚠️ 与 `nota:file-changed` / `nota:focus` 那几条同一族：**发生是事件 → 推**。
/// 这是唯一一种"宿主动作由别的进程触发"的事件，所以它必须走这条路——
/// 前端不可能来"拉"一件发生在它背后的事。
pub const 事件: &str = "nota:second-instance";

/// 托管状态：socket 文件在哪。**只为退出时删它**（`收摊` 要拿到路径，
/// 而监听器本体在那个接收线程手里）。
#[derive(Default)]
pub struct 落点(pub std::sync::Mutex<Option<PathBuf>>);

/// 转交给前端的载荷（形状与 `bridge/payloads.ts` 的 `SecondInstancePayload` 对齐）。
#[derive(Clone, Debug, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct 载荷 {
    /// 要打开的文件。`None` = **只是把窗口抬起来**（第二次点图标时最常见的那一种）。
    pub path: Option<String>,
    /// 路径解不出来时的原因。⚠️ **与 `path` 互斥**：两个都有值时前端只会认 `error`。
    pub error: Option<String>,
}

impl 载荷 {
    fn 抬窗() -> Self {
        Self {
            path: None,
            error: None,
        }
    }

    fn 打开(path: String) -> Self {
        Self {
            path: Some(path),
            error: None,
        }
    }

    fn 报错(error: String) -> Self {
        Self {
            path: None,
            error: Some(error),
        }
    }
}

/// 起接收线程：有人敲门就**把主窗抬起来**，带了路径就把它交给前端去开。
///
/// ⚠️ **抬窗这一步是本模块的一半价值**，别只当它是开文件的前置动作：
/// 用户点第二次图标时最常见的意图就是"我这窗口找不着了"。少了它，第二次
/// 启动的表现是"什么都没发生"——比两个窗口更难懂。
pub fn 起(app: tauri::AppHandle, 听: 监听器) {
    use tauri::{Emitter, Manager};

    if let Some(状态) = app.try_state::<落点>() {
        if let Ok(mut 槽) = 状态.0.lock() {
            *槽 = Some(听.路径().to_path_buf());
        }
    }

    std::thread::spawn(move || loop {
        let 带来的 = match 听.收下() {
            None => continue,
            // ── MCP 会话（2026-09-27 加，`crate::mcp`）────────────────────
            // ⚠️ **必须丢进自己的线程**：一场 MCP 会话会一直握着这条连接
            // （直到 AI 客户端把它关掉），在这个循环里就地服务的话，用户
            // 在那期间双击第二个文件就再也送不进来了。
            //
            // ⚠️ **也不抬窗**：AI 连上来不是用户要做的事，抢走他的焦点只会
            // 碍事（`mcp::host` 里 `请求打开` 是同一条口径）。
            //
            // ⚠️ **不判 socket 之外还有谁在跑**：能连到这条 socket 的只有
            // 同一个用户自己的进程，而那已经可以随便读他的文件了——再加一层
            // 认证只是**假装**有条边界（与文件头那段同一个口径）。
            Some(收到::会话(流)) => {
                let app = app.clone();
                std::thread::spawn(move || crate::mcp::服务流(流, app));
                continue;
            }
            Some(收到::要打开(带来的)) => 带来的,
        };

        // 抬窗：先取消最小化再抢焦点。⚠️ 顺序不能反——对最小化的窗口
        // `set_focus` 在多数窗口管理器上是不生效的。
        if let Some(窗) = app.get_webview_window("main") {
            let _ = 窗.unminimize();
            let _ = 窗.set_focus();
        }

        let 载荷 = match 带来的 {
            None => 载荷::抬窗(),
            Some(原) => match crate::paths::path_to_string(&PathBuf::from(原)) {
                Ok(p) => 载荷::打开(p),
                // ⚠️ 非 UTF-8 的路径**如实报错**，别静默吞掉——`cli.rs` 顶上那段
                // 记着同一个坑（`nota_startup_file` 曾经只往 stderr 记一行，
                // 表现是"用户双击一个文件，界面上什么都不发生"）。
                Err(e) => 载荷::报错(e.to_string()),
            },
        };
        let _ = app.emit(事件, 载荷);
    });
}

/// 退出时把 socket 文件删掉。⚠️ 参数是**路径**不是监听器：退出那一刻监听器
/// 还在接收线程手里（那个线程是分离的），宿主这边只拿得到路径。
///
/// ⚠️ 删不掉也**不算错**（退出路径上不该因为一个删文件失败而报什么），
/// 而且真删不掉也有兜底：下一次启动会走到"连不上 → 删掉重绑"那条路清掉它。
pub fn 收摊(路径: &std::path::Path) {
    let _ = std::fs::remove_file(路径);
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::os::unix::ffi::{OsStrExt, OsStringExt};

    /// ⚠️ 用例**不能碰真的 `nota.sock`**：同一台机器上用户可能正开着一份 Nota
    /// （`docs/06` 那条并发纪律）。所以全部走临时目录里自己那一个。
    fn 临时路径(名: &str) -> PathBuf {
        let mut p = std::env::temp_dir();
        p.push(format!("nota-si-test-{}-{名}.sock", std::process::id()));
        let _ = std::fs::remove_file(&p);
        p
    }

    fn 绑(路径: &std::path::Path) -> 监听器 {
        let _ = std::fs::remove_file(路径);
        let socket = std::os::unix::net::UnixListener::bind(路径).expect("绑不上临时 socket");
        监听器 {
            socket,
            路径: 路径.to_path_buf(),
        }
    }

    fn 发(p: &std::path::Path, 字节: &[u8]) {
        let mut 流 = std::os::unix::net::UnixStream::connect(p).unwrap();
        流.write_all(字节).unwrap();
        let _ = 流.shutdown(std::net::Shutdown::Write);
    }

    /// 收一条**路径帧**。⚠️ 收到会话就当场失败：用到这个包装的用例都是
    /// 在测"转交一个路径"那一路，收到会话说明分流判错了。
    fn 收路径(听: &监听器) -> Option<OsString> {
        match 听.收下().expect("该收到一条连接") {
            收到::要打开(原) => 原,
            收到::会话(_) => panic!("这一条该是路径帧，不该被当成 MCP 会话"),
        }
    }

    /// 没有人在听的时候，`connect` **失败**——这正是"抢到第一个位置"的判据。
    #[test]
    fn 没人听的时候连不上() {
        let p = 临时路径("无人");
        assert!(std::os::unix::net::UnixStream::connect(&p).is_err());
    }

    /// 转过来了就收得到，**而且字节一个不差**。
    #[test]
    fn 转交过来的路径原样收得到() {
        let p = 临时路径("一轮");
        let 听 = 绑(&p);
        let 发的那头 = std::thread::spawn({
            let p = p.clone();
            move || 发(&p, b"/tmp/\xe7\xac\x94\xe8\xae\xb0.md")
        });
        let 收到 = 收路径(&听).expect("该收到一条");
        发的那头.join().unwrap();
        assert_eq!(收到.as_bytes(), b"/tmp/\xe7\xac\x94\xe8\xae\xb0.md");
        收摊(听.路径());
    }

    /// ⚠️ **空帧不算文件，但也不算错误**：第二次点图标就是这一帧，
    /// 调用方要照常把窗口抬起来。这是最容易被当成"读失败"的一条。
    #[test]
    fn 空帧是合法的一条但不算文件() {
        let p = 临时路径("空");
        let 听 = 绑(&p);
        发(&p, b"");
        assert!(收路径(&听).is_none());
        收摊(听.路径());
    }

    /// ⚠️ **暗号打头的连接当会话交出去，而且后面那些字节一个都不少**：
    /// 接收侧只许读走那 8 个字节（`读头`），多读一个，MCP 客户端发来的
    /// 头一行就丢了——那个症状是"AI 一连上就说协议错误"，很难查回来。
    #[test]
    fn 暗号打头的连接当会话交出去后面那些字节一个不少() {
        let p = 临时路径("会话");
        let 听 = 绑(&p);
        let mut 那头 = std::os::unix::net::UnixStream::connect(&p).unwrap();
        那头.write_all(MCP暗号).unwrap();
        那头.write_all(b"{\"jsonrpc\":\"2.0\"}\n").unwrap();
        那头.flush().unwrap();
        let 会话 = match 听.收下().expect("该收到一条") {
            收到::会话(流) => 流,
            收到::要打开(_) => panic!("暗号打头的连接该当会话"),
        };
        let mut 后面 = [0u8; 18];
        (&会话).read_exact(&mut 后面).unwrap();
        assert_eq!(&后面, b"{\"jsonrpc\":\"2.0\"}\n", "暗号之后那些字节得原样接着读");
        // ⚠️ 这一条**故意不 `shutdown`**：会话是长期的，发送方在会话期间
        // 一直开着；上面 `read_exact` 能返回就说明接收侧没把它当"读完即完"的帧。
        收摊(听.路径());
    }

    /// ⚠️ 一个**看起来像**暗号、只是少了那个 NUL 打头的帧，仍然是一条路径帧。
    /// 这条钉的是"判据是整串相等，不是前缀或模糊匹配"。
    #[test]
    fn 少了那个nul的照样当路径() {
        let p = 临时路径("假暗号");
        let 听 = 绑(&p);
        发(&p, b"nota-mcp\n");
        let 收到 = 收路径(&听).expect("该当路径收下");
        assert_eq!(收到.as_bytes(), b"nota-mcp\n");
        收摊(听.路径());
    }

    /// ⚠️ 非 UTF-8 的路径**不许被 lossy 掉**：真编成字符串再解回来，
    /// 就会去打开一个**别的**路径。这里逐字节比。
    #[test]
    fn 非utf8的路径逐字节收得到() {
        let p = 临时路径("字节");
        let 听 = 绑(&p);
        let 原 = OsString::from_vec(vec![b'/', b't', b'm', b'p', b'/', 0xff, 0xfe, b'.', b'm', b'd']);
        let 发的那头 = std::thread::spawn({
            let p = p.clone();
            let 原 = 原.clone();
            move || 发(&p, 原.as_bytes())
        });
        let 收到 = 收路径(&听).expect("该收到一条");
        发的那头.join().unwrap();
        assert_eq!(收到.as_bytes(), 原.as_bytes());
        assert!(
            收到.to_string_lossy().contains('\u{fffd}'),
            "这一条本来就该是非 UTF-8 的"
        );
        收摊(听.路径());
    }

    /// ⚠️ 一条坏连接**不能把循环弄死**：收完这一条，下一条照样收得到。
    #[test]
    fn 一条坏连接不影响下一条() {
        let p = 临时路径("坏后好");
        let 听 = 绑(&p);
        发(&p, b""); // 连上就关、什么都不写 = 空帧
        assert!(收路径(&听).is_none());
        发(&p, b""); // 循环还活着
        assert!(收路径(&听).is_none(), "收得下第二条，说明循环没死");
        收摊(听.路径());
    }

    /// ⚠️ 有人在听的时候**连得上**——"已有实例"的判据；`收摊` 之后又回到没人听。
    #[test]
    fn 有人在听就连得上收摊之后就回到没人听() {
        let p = 临时路径("有人");
        let 听 = 绑(&p);
        assert!(std::os::unix::net::UnixStream::connect(&p).is_ok());
        收摊(听.路径());
        assert!(
            std::os::unix::net::UnixStream::connect(&p).is_err(),
            "退出时删 socket 这一条不能忘"
        );
    }
}
