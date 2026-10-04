//! **MCP**（Model Context Protocol）服务器：让 AI 客户端够到**用户正开着的那个 Nota**。
//!
//! 协议本身很朴素：**stdio 上一行一条 JSON-RPC 2.0 消息**（`\n` 分隔、不是
//! `Content-Length` 那套——那是 LSP 的写法，MCP 的 stdio 传输是新分隔的），
//! 方法只有四个：`initialize` / `ping` / `tools/list` / `tools/call`。
//! 工具清单与它们的契约在 [`tools`] 里，宿主能力在 [`host`] 里。
//!
//! # 三种形态，一个命令
//!
//! 用户/AI 客户端那边只有一条命令：`nota --mcp`。它有三种下场：
//!
//! 1. **已经有一份 Nota 在跑** → 这一份进程**不开窗、不当主人**，只把自己
//!    变成一根管子：stdin ←→ `nota.sock` ←→ 那一份 Nota。AI 于是够到的是
//!    **用户此刻正在编辑的那份文档**。
//! 2. **一份 Nota 都没跑** → ⚠️ **这一份什么都不建**：往 stderr 说一句
//!    "Nota 没在跑，先把它打开"，然后非零退出。**不开窗**（2026-09-29 改，
//!    理由见下面「为什么形态 2 不开窗」那一节）。
//! 3. **别的进程连上来了**（形态 1 的那根管子）→ `single_instance.rs` 的接收
//!    线程认出暗号，把那条连接交给 [`服务流`]，在那个进程里服务 MCP。
//!
//! # 为什么形态 2 不开窗（2026-09-29，用户报"会不停新建窗口"）
//!
//! 原来的形态 2 是"照常启动一份 Nota"（开窗、抢单实例的位置、在同一个进程里
//! 服务 MCP）。它的理由是"这样 AI 至少连得上"——而**实际发生的是另一回事**：
//!
//! - MCP 客户端见自己的服务器进程没了就**会再起一个**（这是客户端的标准行为，
//!   不是哪一家的怪癖）——而 "`nota --mcp` 会变成一个新窗口" 意味着
//!   **每重启一次，用户桌上就多一个他没要过的 Nota 窗口**；
//! - 客户端退出／断线时我们**故意不关窗**（那本身是对的：用户正在编辑的
//!   东西不该被 AI 客户端带走），于是那些窗口会**留下来**；
//! - 两头一凑就是一个"打地鼠"：关掉一个、客户端再起一个、又冒一个。
//!   用户的原话就是这一句：「现在会不停新建窗口」。
//!
//! ⚠️ 所以口径改成：**`--mcp` 永远不开窗**。没有 Nota 在跑就没有可服务的
//! 文档（形态 1 那一段的理由已经说了：无头的那份手里一份文档都没有），
//! 这时候唯一的诚实答案就是"先打开 Nota"——把这句话**说出来**，
//! 比替用户开一个空编辑器强。要看文档就先自己启动 Nota，再让客户端连上来。
//!
//! ⚠️ **形态 1 才是这条功能的意义所在**。最省事的做法是让 `nota --mcp` 总是
//! 自己起一份"无头 Nota"——但那份 Nota 手里**一份文档都没有**：用户正在写的
//! 东西在另一个进程里，AI 看到的会是一个空编辑器。那不是一个能用的功能，
//! 只是"跑起来了"。所以这里宁可多一层转接。
//!
//! ⚠️ 代价如实记一笔：**转接靠的是同一台机器上的 socket**（`$XDG_RUNTIME_DIR`），
//! 所以 MCP **只服务本机的 AI 客户端**。这不是省事，是那条 socket 本来就有的
//! 范围。要跨机器得走 HTTP ＋ 认证，那是另一次决定（见 [`tools`] 顶上"不做的事"）。
//!
//! # 不记会话状态
//!
//! 除了"协商出来的版本号"（协商完就不再用它做任何判断），这个服务器**不记
//! 任何跨行的状态**：没有"必须先 initialize 才能 tools/list"这种规矩，也不
//! 跟踪 initialized 通知。少一份状态就少一处"两次调用之间行为不一样"的坑，
//! 而客户端（Claude Code / Desktop / 各种 SDK）都是按规矩先 initialize 的。
//!
//! # 读一行、答一行
//!
//! 单线程、严格按收到的顺序答。⚠️ **没有并发**：多个请求同时进来要排队。
//! 这是故意的——工具会去动用户的文档，而"两个写同时落在一份文档上谁赢"
//! 是个没有答案的问题；排队至少是确定的。真嫌慢再说（要动也得先想清楚
//! 那个问题，而不是先把并发加上去）。

pub mod host;
pub mod tools;

use std::io::{BufRead, BufReader, BufWriter, Write};

use serde_json::{json, Value};

use host::宿主;

/// 本服务器能说的协议版本，**新的在前**。
///
/// ⚠️ 客户端要哪个就给哪个（只要在这个表里），它要一个我们不认识的，
/// 就回 [`默认协议版本`]——这是 MCP 明文规定的：
/// 「服务端支持客户端要的版本就回同一个，否则回自己支持的一个」。
pub const 协议版本们: &[&str] = &["2025-06-18", "2025-03-26", "2024-11-05"];

/// 不认识客户端要的版本时回哪一个。⚠️ 只有这一处定义，
/// 有一条用例钉着它必须是 [`协议版本们`] 的头一个。
pub const 默认协议版本: &str = "2025-06-18";

/// `initialize` 里那段给模型看的**用法说明**（`instructions` 字段）。
///
/// ⚠️ 写在这里而不是让用户自己配 system prompt：这段话是"这个工具怎么用才
/// 不闯祸"的说明书，跟着代码走才不会过期——尤其是"读到的是窗口里此刻的
/// 内容，不是盘上那份"这一条，猜错的模型会去做一件看起来对、其实错的事。
const 说明书: &str = "\
Nota 是一个 Markdown 编辑器。你连上的是**用户此刻正开着的那一份**，它手里的文档与磁盘上的文件\
不是一回事：用户可能刚打了一半、还没存盘，也可能这份文档压根还没有路径（「未命名 N」）。\n\
\n\
- 要看内容：先 `nota_documents` 看清现在开着哪几份，再 `nota_read` 读全文。不写 id 就是当前活动的那一份。\n\
- 要改内容：**先读完再整篇写回**（`nota_write` 替换的是整篇，不是某一处）。改动会立刻出现在\
用户的窗口里，用户可以用 Ctrl+Z 撤销——所以直接改就好，不必先问。\n\
- `nota_write` 的 text 是完整的 Markdown 原文，**不要带代码围栏**，也不要只给出改动的片段。\n\
- 只想知道对面是什么状态就用 `nota_info`；只读不写的那几个工具不会动用户的文档。";

/// `处理一行` 的内部结论：**这条要不要回、回什么**。
enum 应回 {
    /// 回一条 `result`。
    一条(Value),
    /// 回一条 `error`（码、话）。
    错(i64, String),
    /// 不回（通知、或者不必答的那些）。
    不回,
}

/// 处理**一行**（一条消息）。返回要写回去的那一行（不含 `\n`），`None` = 不必回。
///
/// ⚠️ 这是纯函数：不碰 stdin/stdout，也不碰时钟和盘。协议那一半全靠它，
/// 于是一整套用例可以拿字符串进、字符串出（见下面 `tests`）。
pub fn 处理一行(行: &str, 宿主: &dyn 宿主) -> Option<String> {
    let 值: Value = match serde_json::from_str(行) {
        Ok(v) => v,
        // ⚠️ `id` 在这里只能是 `null`：连消息都没解析出来，没有 id 可回
        // （JSON-RPC 对这个情形就是这么规定的）。
        Err(e) => {
            return Some(装错误(
                &Value::Null,
                -32700,
                &format!("这一行不是合法 JSON：{e}"),
            ))
        }
    };

    // 「有没有 id」决定这是一次调用还是一条通知。⚠️ 判据是**键在不在**，
    // 不是"值是不是空"：JSON-RPC 2.0 对通知的定义是"**没有 id 成员**的请求"，
    // 所以 `{"id": null}` **是请求**、要回（客户端里真有人这么发 ping，
    // 而当通知处理的表现是"它永远等不到回音"）。
    let 要回 = 值.get("id").is_some();
    let id = 值.get("id").cloned().unwrap_or(Value::Null);

    let 方法 = 值.get("method").and_then(|m| m.as_str()).unwrap_or("");
    if 方法.is_empty() {
        return if 要回 {
            Some(装错误(&id, -32600, "这一行里没有 method，不算一次请求"))
        } else {
            None
        };
    }

    let 要答 = match 方法 {
        "initialize" => 应回::一条(初始化(宿主, 值.get("params"))),
        // ⚠️ 客户端说"我准备好了"。**整个仓库只认这一条通知**，而它要做的
        // 事就是没有事——我们不等它、也不回它（回了反而是协议错误）。
        "notifications/initialized" => 应回::不回,
        "ping" => 应回::一条(json!({})),
        "tools/list" => 应回::一条(tools::清单()),
        "tools/call" => 调工具(宿主, 值.get("params")),
        _ => 应回::错(
            -32601,
            format!("不认识的方法：{方法}（这里只有 initialize / ping / tools/list / tools/call）"),
        ),
    };

    // 通知**一律不回**——包括"方法不认识"那条：客户端既然不需要答复，
    // 一个错误对象只会让它以为服务器在说别的事。
    if !要回 {
        return None;
    }
    match 要答 {
        应回::一条(v) => Some(装结果(&id, v)),
        应回::错(码, 话) => Some(装错误(&id, 码, &话)),
        应回::不回 => None,
    }
}

/// `initialize` 的应答。
fn 初始化(宿主: &dyn 宿主, 参: Option<&Value>) -> Value {
    let 客户端要的 = 参
        .and_then(|p| p.get("protocolVersion"))
        .and_then(|v| v.as_str());
    json!({
        "protocolVersion": 谈版本(客户端要的),
        // ⚠️ `tools` 是我们**唯一**的能力。`listChanged: false` 是实话：
        // 工具名册是编译进二进制的常量，运行中不会变（也就没有"发一条
        // 通知告诉客户端名册变了"这回事）。
        "capabilities": { "tools": { "listChanged": false } },
        "serverInfo": { "name": "Nota", "version": 宿主.应用版本() },
        "instructions": 说明书,
    })
}

/// 协商协议版本：客户端要的能说就说它要的，否则给 [`默认协议版本`]。
pub fn 谈版本(客户端要的: Option<&str>) -> &'static str {
    match 客户端要的 {
        Some(要) => 协议版本们
            .iter()
            .copied()
            .find(|认识| *认识 == 要)
            .unwrap_or(默认协议版本),
        None => 默认协议版本,
    }
}

/// `tools/call`。
///
/// ⚠️ 两条错误通道分开（MCP 自己的规定，`tools.rs` 顶上那段也记着）：
/// **叫不出名字的工具**是协议错误（`-32602`，客户端拿错了名册）；
/// **工具跑了但没成**是 `isError: true` 的正常结果，由 [`tools::跑一个`] 装好。
fn 调工具(宿主: &dyn 宿主, 参: Option<&Value>) -> 应回 {
    let 参 = 参.cloned().unwrap_or(Value::Null);
    let 名 = 参.get("name").and_then(|v| v.as_str()).unwrap_or("");
    if 名.is_empty() {
        return 应回::错(-32602, "tools/call 少了 name".to_string());
    }
    // ⚠️ `arguments` 缺省当 `{}`：不带参数的工具（`nota_info`）很多客户端
    // 就干脆不写这个字段，那不是错。
    let 实参 = 参.get("arguments").cloned().unwrap_or_else(|| json!({}));
    match tools::跑一个(名, &实参, 宿主) {
        Ok(值) => 应回::一条(值),
        Err(为什么) => 应回::错(-32602, 为什么),
    }
}

fn 装结果(id: &Value, 结果: Value) -> String {
    json!({ "jsonrpc": "2.0", "id": id, "result": 结果 }).to_string()
}

fn 装错误(id: &Value, 码: i64, 话: &str) -> String {
    json!({ "jsonrpc": "2.0", "id": id, "error": { "code": 码, "message": 话 } }).to_string()
}

/// 服务一个**已经连上的流**：一行一行读，一行一行答，读到 EOF 为止。
///
/// ⚠️ 读和写分成两个参数（而不是一个 `T: Read + Write`）：形态 3 那边拿到的是
/// 一条 `UnixStream`，收发各要一个句柄（`try_clone`），分成两个参数最省事，
/// 也顺手让用例能拿一个 `Cursor` 进来当输入、一个 `Vec<u8>` 当输出。
pub fn 服务<R: BufRead, W: Write>(读: R, 写: &mut W, 宿主: &dyn 宿主) -> std::io::Result<()> {
    for 行 in 读.lines() {
        let 行 = 行?;
        // ⚠️ 空行**忽略**：有些客户端（和不少手写的测试脚本）会在末尾补一个
        // 换行。当成"一条空消息"的话它会换来一个 -32700，看着像出错了。
        if 行.trim().is_empty() {
            continue;
        }
        if let Some(回) = 处理一行(&行, 宿主) {
            写.write_all(回.as_bytes())?;
            写.write_all(b"\n")?;
            // ⚠️ **每一条都要刷**。stdout 接到管子（MCP 客户端）上时是**块缓冲**的，
            // 不刷的表现是"AI 那边一直转圈，直到攒够 4KB 才一下子全收到"。
            // 这条不是性能取舍，是"能不能用"。
            写.flush()?;
        }
    }
    Ok(())
}

// ⚠️ 这里原来有一个 `pub fn 起(app: tauri::AppHandle)`：把**这一份进程自己的**
// stdin/stdout 当 MCP 流服务（那正是形态 2 的另一半）。2026-09-29 **它跟着
// 形态 2 一起删掉了**——`--mcp` 今天只转接、接不上就退出（见模块头
// 「为什么形态 2 不开窗」），再没有任何一条路能走到它。
//
// ⚠️ 别"留着以后有用"：一个永远跑不到的分支会让读的人以为还存在一种
// "进程里直接服务 MCP"的形态，而那种形态**正是那个不停开窗的 bug**。
// 要看旧写法：`git log -p -- src-tauri/src/mcp/mod.rs`，搜 `fn 起`。

/// 服务一条**从 socket 上来的**会话（形态 3：别的进程连上来要求转接）。
///
/// ⚠️ 由 `single_instance.rs` 的接收线程调——那一条连接里的暗号已经读掉了，
/// 这里从暗号**之后**接着读。所以那个读法必须是"原样读 8 个字节"，
/// **不许用 `BufReader`**（它会多吞一块缓冲，吞掉的就是这里的前几行）。
pub fn 服务流(流: std::os::unix::net::UnixStream, app: tauri::AppHandle) {
    let 宿主 = host::应用宿主::新(app);
    let 写的那头 = match 流.try_clone() {
        Ok(另) => 另,
        Err(e) => {
            crate::日志!("[nota] MCP：拿不到 socket 的写句柄：{e}");
            return;
        }
    };
    let 读 = BufReader::new(流);
    let mut 写 = BufWriter::new(写的那头);
    match 服务(读, &mut 写, &宿主) {
        Ok(()) => crate::日志!("[nota] MCP：一条会话结束了"),
        Err(e) => crate::日志!("[nota] MCP：一条会话断了：{e}"),
    }
    let _ = 写.flush();
}

/// `--mcp` 那条路上，[`接上`] 的结论。⚠️ **三种都得让这一份进程退出**，
/// 一种都不许"继续往下走"（那就是 2026-09-29 修掉的那个不停开窗，见模块头）。
#[derive(Debug)]
pub enum 结局 {
    /// 连上了，一场会话从头跑到了尾（对面正常收场）。退出码 0。
    会话跑完,
    /// 连上了，但会话**中途断了**。退出码 3，原因带在里头供 stderr 打一行。
    会话断了(std::io::Error),
    /// **连不上**——一份 Nota 都没在跑。退出码 2。
    ///
    /// ⚠️ 这一条**不是错误**，是"现在没得连"：MCP 客户端会在用户下次打开
    /// Nota 之后自己重连（也可能不会，那不归我们管）。所以文案说的是
    /// **该做什么**（先把 Nota 打开），不是"出错了"。
    没人听,
}

/// 连上**已经在跑的那一份 Nota**，把自己变成一根管子（形态 1）。
///
/// ⚠️ 返回值里**没有"失败"这一档**：三种下场都是确定的处置（见 [`结局`]），
/// 调用方拿到的是一句处置结论，不是一个 `Result`——写成 `Result` 的历史版本
/// 就是那个 bug 的温床（`Err` 分不清"没人听"和"会话断了"，于是两者都被
/// 当成"那就自己开一份吧"）。
pub fn 接上() -> 结局 {
    // ⚠️ socket 的位置都算不出来（拿不到运行目录、也退不回 data_dir）时，
    // 结论和"没人听"一样：够不到任何一份 Nota。
    let Ok(路径) = crate::single_instance::socket路径() else {
        return 结局::没人听;
    };
    接上_到(&路径)
}

/// [`接上`] 的本体：路径从外面传进来，**测试才碰得到自己的那一个 socket**
/// （同 `single_instance.rs` 顶上那条并发纪律：不能碰用户真的那个）。
fn 接上_到(路径: &std::path::Path) -> 结局 {
    // ⚠️ `connect` 失败 = **没人在听**（`ECONNREFUSED` / 文件早没了），
    // 这是这一整条路上最常见的一种，也是唯一该说"先打开 Nota"的那一种。
    let Ok(mut 流) = std::os::unix::net::UnixStream::connect(路径) else {
        return 结局::没人听;
    };
    // ⚠️ 先递暗号，再开始抄字节——对面靠这 8 个字节区分"要打开一个文件"
    // 和"这是一场 MCP 会话"（见 `single_instance::MCP暗号`）。
    //
    // ⚠️ 暗号递不出去**不算"没人听"**：连接已经建立了，对面此刻正在消失
    // （那一边刚好退出）。这一档要是退化成"自己开一份"，就又是那个不停开窗。
    if let Err(e) = 流
        .write_all(crate::single_instance::MCP暗号)
        .and_then(|()| 流.flush())
    {
        return 结局::会话断了(e);
    }
    match 代理(流) {
        Ok(()) => 结局::会话跑完,
        Err(e) => 结局::会话断了(e),
    }
}

/// 双向抄字节：`stdin` → socket，socket → `stdout`。
///
/// ⚠️ **这一层不解析协议**（不 JSON、不拆行），就是 `io::copy` 抄字节。
/// 理由：解析再拼回去是一条"能在中间弄坏消息"的路，而这里根本不需要理解
/// 那些字节——它只是两根管子之间的一段。也正因为不解析，这一层没有可错的
/// 协议逻辑，测试面自然落到了 [`处理一行`] 上。
///
/// 收到 EOF 时**关掉自己这一半的写**（`shutdown(Write)`）：对面是 `read`
/// 到 EOF 为判断依据的，不关的话它会一直等着这条永不结束的连接。
pub fn 代理(流: std::os::unix::net::UnixStream) -> std::io::Result<()> {
    let 收的那头 = 流.try_clone()?;

    // ⚠️ 这一条**故意不 join**（2026-09-29 改）。它阻塞在 `stdin` 的 `read`
    // 上，而 `stdin` 那一头（AI 客户端）在"对面 Nota 已经没了"之后**可能一直
    // 开着**——join 就是把自己挂在那里等一个永远不会来的字节。
    //
    // ⚠️ 这是实测到的，不是推理：无头窗口上把宿主 `kill -9` 掉之后，代理
    // 进程**活着**、僵在 `join` 上，直到往它的 stdin 里写了点什么才醒过来。
    // 而调用方（`lib.rs`）拿到返回值就 `exit`，那时候这个线程跟着一起没，
    // **不需要等它**：它抄的是"发往一份已经不在的 Nota"的字节，抄到哪儿算哪儿。
    std::thread::spawn(move || {
        let mut 入 = std::io::stdin().lock();
        let mut 出 = 流;
        // ⚠️ 抄完**一定**要 shutdown：不加的话"AI 客户端关掉了"这件事
        // 永远传不到对面，那一场会话就挂在那里不退。
        let _ = std::io::copy(&mut 入, &mut 出);
        let _ = 出.shutdown(std::net::Shutdown::Write);
    });

    let mut 收 = 收的那头;
    let mut 标准出 = std::io::stdout();
    let 收到的 = std::io::copy(&mut 收, &mut 标准出).map(|_| ());
    let _ = 标准出.flush();
    // ⚠️ 返回"收"那一头的错：送那一头出问题（比如对面关了）在这里表现为
    // 收也结束，用户能看到的只有"会话断了"，不必分是谁先断的。
    收到的
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::mcp::host::{概览, 全文};
    use std::io::Cursor;
    use std::sync::Mutex;

    /// 一份最小的假宿主。⚠️ 只够协议那一半用（工具自己的契约在 `tools.rs`
    /// 里测，那边有一份记着"被调过什么"的假宿主）。
    struct 假 {
        正文: Mutex<String>,
    }

    impl 假 {
        fn 新() -> Self {
            Self {
                正文: Mutex::new("原来的正文".to_string()),
            }
        }
    }

    impl 宿主 for 假 {
        fn 应用版本(&self) -> String {
            "9.9.9-假".to_string()
        }
        fn 概览们(&self) -> Vec<概览> {
            vec![概览 {
                id: 1,
                title: "甲".to_string(),
                path: Some("/tmp/甲.md".to_string()),
                dirty: false,
                revision: 3,
                active: true,
            }]
        }
        fn 读(&self, _id: Option<u64>) -> Result<全文, String> {
            Ok(全文 {
                概览: self.概览们().remove(0),
                正文: self.正文.lock().unwrap().clone(),
            })
        }
        fn 写(&self, _id: Option<u64>, 正文: &str) -> Result<(u64, u64), String> {
            *self.正文.lock().unwrap() = 正文.to_string();
            Ok((1, 4))
        }
        fn 请求打开(&self, 路径: &str) -> Result<(), String> {
            // ⚠️ 这一条**故意留一个会失败的路径**：不这样的话"工具没成"那条
            // 用例测不到（假的宿主什么都说好，isError 永远是 false）。
            if 路径 == "/不存在" {
                return Err(format!("路径不存在：{路径}"));
            }
            Ok(())
        }
    }

    /// 把一行发进去，取回那一行（应当是合法 JSON）。没回就是 `None`。
    fn 一问一答(行: &str, 宿主: &dyn 宿主) -> Option<Value> {
        处理一行(行, 宿主).map(|回| serde_json::from_str(&回).expect("回的不是合法 JSON"))
    }

    #[test]
    fn 默认版本必须是表里最新的那一个() {
        assert_eq!(协议版本们[0], 默认协议版本, "改了表别忘了改默认值");
    }

    #[test]
    fn 版本协商认得就说认得的不认得就给默认的() {
        assert_eq!(谈版本(Some("2024-11-05")), "2024-11-05");
        assert_eq!(谈版本(Some("2025-03-26")), "2025-03-26");
        assert_eq!(谈版本(Some("1999-01-01")), 默认协议版本, "不认识的");
        assert_eq!(谈版本(None), 默认协议版本, "压根没提");
    }

    #[test]
    fn initialize_回版本能力与说明书() {
        let 这 = 假::新();
        let 回 = 一问一答(
            r#"{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2024-11-05","clientInfo":{"name":"x","version":"1"}}}"#,
            &这,
        )
        .unwrap();
        assert_eq!(回["jsonrpc"], "2.0");
        assert_eq!(回["id"], 1);
        assert_eq!(回["result"]["protocolVersion"], "2024-11-05", "它要哪个给哪个");
        assert_eq!(回["result"]["serverInfo"]["name"], "Nota");
        assert_eq!(回["result"]["serverInfo"]["version"], "9.9.9-假");
        assert_eq!(回["result"]["capabilities"]["tools"]["listChanged"], false);
        let 说明 = 回["result"]["instructions"].as_str().unwrap();
        assert!(说明.contains("nota_read"), "说明书里得点名那几个工具");
        assert!(说明.contains("Ctrl+Z"), "得说清改动能撤销");
    }

    #[test]
    fn initialize_不要版本也给一个() {
        let 这 = 假::新();
        let 回 = 一问一答(r#"{"jsonrpc":"2.0","id":1,"method":"initialize"}"#, &这).unwrap();
        assert_eq!(回["result"]["protocolVersion"], 默认协议版本);
    }

    #[test]
    fn ping_是空结果() {
        let 这 = 假::新();
        let 回 = 一问一答(r#"{"jsonrpc":"2.0","id":"abc","method":"ping"}"#, &这).unwrap();
        assert_eq!(回["result"], json!({}));
        assert_eq!(回["id"], "abc", "id 得原样回——字符串 id 也是合法的");
    }

    #[test]
    fn tools_list_给五个工具每个都带参数表() {
        let 这 = 假::新();
        let 回 = 一问一答(r#"{"jsonrpc":"2.0","id":1,"method":"tools/list"}"#, &这).unwrap();
        let 工具们 = 回["result"]["tools"].as_array().unwrap();
        assert_eq!(工具们.len(), 5);
        for t in 工具们 {
            assert!(t["name"].is_string());
            assert!(t["description"].is_string());
            assert_eq!(t["inputSchema"]["type"], "object");
        }
    }

    #[test]
    fn tools_call_跑得通() {
        let 这 = 假::新();
        let 回 = 一问一答(
            r#"{"jsonrpc":"2.0","id":2,"method":"tools/call","params":{"name":"nota_read","arguments":{}}}"#,
            &这,
        )
        .unwrap();
        assert_eq!(回["result"]["isError"], false);
        let 正文: Value = 回["result"]["content"][0]["text"]
            .as_str()
            .unwrap()
            .parse()
            .unwrap();
        assert_eq!(正文["text"], "原来的正文");
    }

    #[test]
    fn tools_call_不带参数也算数() {
        let 这 = 假::新();
        let 回 = 一问一答(
            r#"{"jsonrpc":"2.0","id":3,"method":"tools/call","params":{"name":"nota_info"}}"#,
            &这,
        )
        .unwrap();
        assert_eq!(回["result"]["isError"], false);
    }

    #[test]
    fn tools_call_工具没成是结果不是协议错误() {
        let 这 = 假::新();
        let 回 = 一问一答(
            r#"{"jsonrpc":"2.0","id":4,"method":"tools/call","params":{"name":"nota_open","arguments":{"path":"/不存在"}}}"#,
            &这,
        )
        .unwrap();
        assert_eq!(回["result"]["isError"], true, "工具没成走结果里那个标记");
        assert!(回.get("error").is_none(), "别升级成协议错误");
    }

    #[test]
    fn tools_call_叫不出名字是协议错误() {
        let 这 = 假::新();
        let 回 = 一问一答(
            r#"{"jsonrpc":"2.0","id":5,"method":"tools/call","params":{"name":"nota_没这个"}}"#,
            &这,
        )
        .unwrap();
        assert_eq!(回["error"]["code"], -32602);
        assert!(回.get("result").is_none());
    }

    #[test]
    fn tools_call_少了name也是协议错误() {
        let 这 = 假::新();
        let 回 = 一问一答(r#"{"jsonrpc":"2.0","id":6,"method":"tools/call"}"#, &这).unwrap();
        assert_eq!(回["error"]["code"], -32602);
    }

    #[test]
    fn 不认识的方法是_32601() {
        let 这 = 假::新();
        let 回 = 一问一答(r#"{"jsonrpc":"2.0","id":7,"method":"resources/list"}"#, &这).unwrap();
        assert_eq!(回["error"]["code"], -32601);
        assert!(回["error"]["message"].as_str().unwrap().contains("resources/list"));
    }

    #[test]
    fn 坏_json_是_32700_而id是空的() {
        let 这 = 假::新();
        let 回 = 一问一答("{这不是 JSON", &这).unwrap();
        assert_eq!(回["error"]["code"], -32700);
        assert_eq!(回["id"], Value::Null);
    }

    #[test]
    fn 没有method又不是通知也要说一声() {
        let 这 = 假::新();
        let 回 = 一问一答(r#"{"jsonrpc":"2.0","id":8}"#, &这).unwrap();
        assert_eq!(回["error"]["code"], -32600);
    }

    /// ⚠️ **通知不许回**：这是协议里最容易被写错的一条（回了的话某些客户端
    /// 会以为服务器在回答别的东西）。
    ///
    /// ⚠️ 而"什么算通知"的判据是**有没有 `id` 这个成员**，不是"id 是不是空"：
    /// `{"id": null}` **是请求**（JSON-RPC 说得死："通知 = 没有 id 成员的请求"），
    /// 当通知处理的表现是"那个客户端永远等不到回音"。
    #[test]
    fn 通知一律不回而id为null算请求() {
        let 这 = 假::新();
        assert!(处理一行(r#"{"jsonrpc":"2.0","method":"notifications/initialized"}"#, &这).is_none());
        assert!(处理一行(r#"{"jsonrpc":"2.0","method":"tools/list"}"#, &这).is_none());
        assert!(
            处理一行(r#"{"jsonrpc":"2.0","method":"完全没有这个方法"}"#, &这).is_none(),
            "不认识的通知也不回"
        );
        let 回 = 一问一答(r#"{"jsonrpc":"2.0","id":null,"method":"ping"}"#, &这)
            .expect("id 是 null 也是请求，得回");
        assert_eq!(回["id"], Value::Null, "回它的 id 也得是 null");
    }

    #[test]
    fn 服务_一行一条_空行忽略() {
        let 这 = 假::新();
        let 入 = "\n{\"jsonrpc\":\"2.0\",\"id\":1,\"method\":\"ping\"}\n\n{\"jsonrpc\":\"2.0\",\"method\":\"notifications/initialized\"}\n{\"jsonrpc\":\"2.0\",\"id\":2,\"method\":\"tools/list\"}\n";
        let mut 出 = Vec::new();
        服务(BufReader::new(Cursor::new(入)), &mut 出, &这).unwrap();
        let 行们: Vec<&str> = std::str::from_utf8(&出)
            .unwrap()
            .trim_end()
            .split('\n')
            .collect();
        assert_eq!(行们.len(), 2, "两个请求＋一条通知 → 两行回答：{行们:?}");
        for 行 in &行们 {
            let 值: Value = serde_json::from_str(行).expect("每一行都是完整的一条 JSON");
            assert_eq!(值["jsonrpc"], "2.0");
        }
        let 甲: Value = serde_json::from_str(行们[0]).unwrap();
        let 乙: Value = serde_json::from_str(行们[1]).unwrap();
        assert_eq!(甲["id"], 1);
        assert_eq!(乙["id"], 2);
    }

    /// ⚠️ 一行读出来不是合法 JSON 时**不能把整个服务停掉**：客户端发了条脏东西，
    /// 后面那些请求还得照跑（不然用户看到的是"AI 连上一会儿就没了"）。
    #[test]
    fn 服务_一行脏了后面接着跑() {
        let 这 = 假::新();
        let 入 = "这不是 JSON\n{\"jsonrpc\":\"2.0\",\"id\":2,\"method\":\"ping\"}\n";
        let mut 出 = Vec::new();
        服务(BufReader::new(Cursor::new(入)), &mut 出, &这).unwrap();
        let 文 = String::from_utf8(出).unwrap();
        let 行们: Vec<&str> = 文.trim_end().split('\n').collect();
        assert_eq!(行们.len(), 2);
        let 甲: Value = serde_json::from_str(行们[0]).unwrap();
        assert_eq!(甲["error"]["code"], -32700);
        let 乙: Value = serde_json::from_str(行们[1]).unwrap();
        assert_eq!(乙["id"], 2);
    }

    /// 一条完整的会话走一遍：initialize → initialized → tools/list → 读 → 写。
    #[test]
    fn 一整场会话() {
        let 这 = 假::新();
        let 入 = concat!(
            r#"{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2025-06-18"}}"#,
            "\n",
            r#"{"jsonrpc":"2.0","method":"notifications/initialized"}"#,
            "\n",
            r#"{"jsonrpc":"2.0","id":2,"method":"tools/list"}"#,
            "\n",
            r#"{"jsonrpc":"2.0","id":3,"method":"tools/call","params":{"name":"nota_read"}}"#,
            "\n",
            r#"{"jsonrpc":"2.0","id":4,"method":"tools/call","params":{"name":"nota_write","arguments":{"text":"改过的"}}}"#,
            "\n",
            r#"{"jsonrpc":"2.0","id":5,"method":"tools/call","params":{"name":"nota_read"}}"#,
            "\n",
        );
        let mut 出 = Vec::new();
        服务(BufReader::new(Cursor::new(入)), &mut 出, &这).unwrap();
        let 文 = String::from_utf8(出).unwrap();
        let 行们: Vec<Value> = 文
            .trim_end()
            .split('\n')
            .map(|l| serde_json::from_str(l).unwrap())
            .collect();
        assert_eq!(行们.len(), 5, "五条请求（通知不算）");

        let 取正文 = |v: &Value| -> String {
            let t = v["result"]["content"][0]["text"].as_str().unwrap();
            serde_json::from_str::<Value>(t).unwrap()["text"]
                .as_str()
                .unwrap()
                .to_string()
        };
        assert_eq!(取正文(&行们[2]), "原来的正文", "写之前");
        assert_eq!(行们[3]["result"]["isError"], false);
        assert_eq!(取正文(&行们[4]), "改过的", "写之后读回的是新的");
    }

    /// ⚠️ **用例不许碰用户真的那个 `nota.sock`**（同一台机器上他可能正开着一份
    /// Nota；`docs/06` 那条并发纪律）。所以全部走临时目录里自己那一个，
    /// 这也正是 [`接上_到`] 把路径做成参数的理由。
    fn 临时路径(名: &str) -> std::path::PathBuf {
        let mut p = std::env::temp_dir();
        p.push(format!("nota-mcp-test-{}-{名}.sock", std::process::id()));
        let _ = std::fs::remove_file(&p);
        p
    }

    /// **没有人在听**（连不上）就是 [`结局::没人听`]。
    ///
    /// ⚠️ 这一条钉的是 2026-09-29 那个"不停新建窗口"的**一半**：老代码在这
    /// 一档返回 `Err`，调用方把它读成"那就自己开一份吧"，于是开窗。今天这一档
    /// 必须是一个**明确的处置结论**，而不是一个交给调用方去猜的 `Result`。
    #[test]
    fn 连不上就是没人听() {
        let p = 临时路径("无人");
        assert!(
            std::os::unix::net::UnixStream::connect(&p).is_err(),
            "先确认这个路径上真的没人听"
        );
        assert!(matches!(接上_到(&p), 结局::没人听));
    }

    /// 连上了、对面收摊 → [`结局::会话跑完`]（**不是**"没人听"）。
    ///
    /// ⚠️ 这个用例会真的走到 [`代理`] 里，而它要读**本进程的 stdin**：
    /// 这里可以这么做，因为代理的"送"那一头 2026-09-29 起是**分离线程**
    /// （不 join），所以对面一收摊这个函数立刻返回，不会等 stdin 上永远不来的
    /// 字节。⚠️ 别把它改成 `join` 的版本——那样这个用例会挂住，
    /// 而那正是用户在真实进程里遇到的那个"僵住的代理"。
    #[test]
    fn 连上了对面收摊就是会话跑完() {
        let p = 临时路径("收摊");
        let 听 = std::os::unix::net::UnixListener::bind(&p).expect("绑不上临时 socket");
        let 那头 = std::thread::spawn(move || {
            let (mut 连接, _) = 听.accept().expect("该有人连上来");
            // ⚠️ 长度**取常量自己那一个**，别写死：这条暗号是两处共用的协议
            // （`single_instance::MCP暗号` 顶上那段写了"改长度两边一起改"），
            // 这里再写一个数字就是第三个真相源。
            let mut 暗号 = vec![0u8; crate::single_instance::MCP暗号.len()];
            std::io::Read::read_exact(&mut 连接, &mut 暗号).expect("该先收到暗号");
            assert_eq!(暗号, crate::single_instance::MCP暗号, "递过来的得是暗号");
            // 不写任何回包就关：对面那一场会话到头了。
        });
        assert!(matches!(接上_到(&p), 结局::会话跑完));
        那头.join().unwrap();
        let _ = std::fs::remove_file(&p);
    }
}
