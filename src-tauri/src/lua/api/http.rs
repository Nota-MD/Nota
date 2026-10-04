//! `nota.http` —— 插件发 HTTP 请求（`docs/07` 第 12 项）。
//!
//! 走 [`ureq`]（阻塞式，rustls 提供 TLS）。选它而不是 `reqwest` 的理由写在
//! `Cargo.toml` 那条依赖的注释里：这个项目要的是一个**同步**客户端
//! （插件那边就是同步的 Lua），而 reqwest 的价值在异步那半边。
//!
//! # ⚠️ 阻塞，所以**必须**跑在阻塞线程上
//!
//! 这里所有函数**都会把当前线程堵住**，直到请求完成或超时。调用它们的是
//! 插件的 Lua，而 Lua 由 `commands/plugin.rs::nota_plugin_call` 在
//! `spawn_blocking` 里跑——**那一步不是优化，是前提**。哪天有人把它改回同步命令，
//! 一个慢请求就会冻住整个界面（窗口不重绘、按钮不响应）。
//!
//! # 网络口子开多大（每一条都是**收**，不是放）
//!
//! | 规矩 | 为什么 |
//! |---|---|
//! | **只允许 `https://`** | 明文请求会把 API key 和文档内容一起发在裸链路上 |
//! | 例外：`http://` **只放行回环地址** | 本机跑的大模型服务（Ollama / LM Studio）没有 TLS，而流量根本不出这台机器 |
//! | 方法只有 GET/POST/PUT/PATCH/DELETE/HEAD | 插件不需要 CONNECT/TRACE，而它们各有各的怪 |
//! | 默认超时 30 秒，上限 180 秒 | 不让一个卡住的服务器拖着后台线程不放 |
//! | 响应体上限 2 MiB | 一个坏掉的服务器不该能把内存吃光 |
//! | 请求体上限 1 MiB | 同上，方向反过来 |
//! | 最多 5 次重定向，跨域**不带**认证头 | ureq 的默认就是 `Never`（实测 `config.rs:876`），这里只是把它钉住 |
//!
//! # 流式：`nota.http.stream`（2026-10-04 加，`docs/07` 第 58 项）
//!
//! `request` / `get` / `post` 是**一次性**的：函数返回时整份响应体已经在手里了。
//! `stream` 不同——它**边收边把每一块交给 Lua 回调**，所以 AI 那类"几秒钟里
//! 一个字一个字往外吐"的接口才能边出边显示。三件事在这里定死：
//!
//! | 问题 | 答案 | 为什么 |
//! |---|---|---|
//! | 一块有多大、切在哪儿 | **不保证**。可能是 3 个字节，也可能是一整行 | 底下是 TCP，`read` 返回多少由内核说了算。**任何"一块就是一行 / 一块就是一个 JSON"的假定都是错的**——拼行的活儿归调用方（`docs/13` §9.3 那段 SSE 例子） |
//! | 切不切多字节字符 | **不切**。每块都是合法 UTF-8 | 切一半汉字出去，前端拿到的是"�"；块边界是**宿主**能控制的一件事，那就控制住（`切出完整段`） |
//! | 回调返回值有什么用 | 返回 `false` = **别读了**，当场收工 | 这是**唯一的**取消手段。用户关掉面板、切走对话时插件靠它把一条在飞的请求掐掉（`docs/07` 第 58 项那条"中断怎么办"的落点） |
//!
//! ⚠️ **回调里不许做慢事**：它在读 socket 的那个线程上跑，回调不返回就没人读
//! 数据，服务端那边的窗口会满。插件里该干的只有"往累加器里追加 ＋ 偶尔喊一声
//! `nota.ui.refresh()`"。
//!
//! # 不做的一件事（说清楚，免得被当成漏了）
//!
//! - **不做上传/下载文件**。请求体只能是文本或一张表（当 JSON 发）。

use std::time::Duration;

use mlua::{Lua, Table, Value};

use super::{lua_err, lua_to_json, mlua_to_nota};
use crate::error::{NotaError, Result as NotaResult};

/// 不传 `timeout_ms` 时的超时。
const 默认超时: Duration = Duration::from_secs(30);

/// 插件能要求的最大超时。**有上限**——没上限的话一个插件写个 1 小时超时，
/// 就会有一个后台线程被占住一小时（界面上表现为"这个插件点了没反应"）。
const 最长超时: Duration = Duration::from_secs(180);

/// 响应体最多读这么多字节。超了**报错**（不是截断）——半个 JSON 解析一定失败，
/// 而"解析失败"这条错会把病因指错地方。
const 响应上限: u64 = 2 * 1024 * 1024;

/// 插件自己拼的请求体上限。
const 请求上限: usize = 1024 * 1024;

/// 最多跟几次重定向。
const 最大重定向: u32 = 5;

/// 允许的方法。**封闭集合**，认不出就报错。
const 允许的方法: [&str; 6] = ["GET", "POST", "PUT", "PATCH", "DELETE", "HEAD"];

/// 一次请求的落定结果。
struct 回包 {
    code: u16,
    text: String,
}

/// 一次请求的落定：**要么拿到回应，要么"环境不让你发"**。
///
/// # 为什么要分这两半（`docs/07` 第 60 项）
///
/// 从前这里只有 `回包`，而"连不上 / 超时 / 读断了"是**抛 Lua 错误**出去的。
/// 于是每个插件都得自己 `pcall` ＋ 自己把 mlua 裹上来的 `stack traceback:`
/// 掐掉（`plugins/ai/util.lua::clean_error` 就是干这个的）——一件**每个插件
/// 都要重写一遍**的事，而且写漏了症状很难看：一次断网能把整块面板糊满。
///
/// 现在分成两条路，**界线不是"轻重"而是"这是谁的错"**：
///
/// | 走哪儿 | 什么情况 | 为什么 |
/// |---|---|---|
/// | `Err(…)`（照旧抛） | 地址不合法、方法不认识、头的值类型不对、体太大、超时值非法 | **插件作者写错了程序**。这种错该带着栈冒出来，而且它不会在用户手上发生——把栈洗掉反而让作者查不出问题 |
/// | `落定::环境失败`（返回结果表） | 连不上、DNS 不通、TLS 失败、超时、连接中途断 | **环境不给力**。用户会正常遇到，插件能做的只有"把这句话显示出来"，所以它必须是**一个值**而不是一次抛出 |
///
/// ⚠️ 4xx/5xx **两条都不走**——那是 `回包`（`http_status_as_error(false)`），
/// 因为服务器的报错正文就在响应体里，插件得读得到。
enum 落定 {
    回包(回包),
    /// 流式收完了（`nota.http.stream`）：除了那份回包，还有"一共交出去几块"
    /// 和"是不是被回调喊停的"。
    ///
    /// ⚠️ `块数` 是**证据**不是状态：一个不认 `stream` 的服务器会把整份 JSON
    /// 一次吐完 ⇒ 这里多半是 1。插件那边的判据不该是它（见 `docs/13` §9.3：
    /// 按"有没有 `data:` 行"判是不是真流式），它留在返回值里是为了让人能一眼
    /// 看出"这次到底流没流"以及给单元测试一个抓手。
    流完 {
        包: 回包,
        块数: usize,
        中断: bool,
    },
    /// 环境类失败。⚠️ 里面这句话是**给人看的中文**，插件直接显示即可。
    环境失败(String),
}

/// 装 `nota.http`。**只该在清单申请了 `network.http` 时调。**
///
/// ⚠️ 没有用 `ctx`：网络请求不碰文档、不碰设置，也就不该看得到它们。
/// 一个能发 HTTP 的插件顺手能读全文，等于给这条口子加了一个没必要的放大器。
pub fn build(lua: &Lua) -> NotaResult<Table> {
    let t = lua.create_table().map_err(mlua_to_nota)?;

    let request = lua
        .create_function(move |lua, spec: Table| 收口(lua, 发一次(lua, &spec)))
        .map_err(mlua_to_nota)?;
    t.set("request", request).map_err(mlua_to_nota)?;

    // `get` / `post` 是 `request` 的两件常用外衣：参数既可以是 url 字符串，
    // 也可以是一张表。**不给第三种写法**——插件作者想拼复杂的，用 `request`。
    for (名, 方法) in [("get", "GET"), ("post", "POST")] {
        let f = lua
            .create_function(move |lua, spec: Value| {
                let spec = 归一化(lua, spec, 方法)?;
                收口(lua, 发一次(lua, &spec))
            })
            .map_err(mlua_to_nota)?;
        t.set(名, f).map_err(mlua_to_nota)?;
    }

    // 流式（`docs/07` 第 58 项）。⚠️ **第二个参数是必填的**：没有回调就没有
    // "边收边给"这回事，那时该用 `request`——少一个参数时报一句"要两个参数"，
    // 比默默退化成一次性请求（用户看到的还是"憋完才出现"）清楚得多。
    let stream = lua
        .create_function(move |lua, (spec, 收到): (Table, mlua::Function)| {
            收口(lua, 流式(lua, &spec, &收到))
        })
        .map_err(mlua_to_nota)?;
    t.set("stream", stream).map_err(mlua_to_nota)?;

    Ok(t)
}

/// 把 `发一次` 的结果折成 Lua 表（或者把"作者写错了"折成 Lua 错误）。
///
/// `get` / `post` / `request` 三条路都从这里出去，所以**返回值的形状只有一处定义**。
///
/// # 返回值的形状（`docs/07` 第 58 / 60 项）
///
/// | 形状 | 什么时候 |
/// |---|---|
/// | `{ ok = true, code = 200, text = "…", json = {…} }` | 请求发出去了、也收到了回应（**4xx/5xx 也算收到**） |
/// | `{ ok = true, code = 200, text = "…", chunks = N, aborted = true }` | `stream` 收完了（`chunks` 交了 N 块；`aborted` **只在被回调喊停时**才有这个键） |
/// | `{ ok = false, error = "请求失败：…" }` | **环境类失败**：连不上、超时、读断了。⚠️ 这一种**不抛错** |
///
/// ⚠️ `ok` 是**必须**先看的那一个字段——`code` 只在 `ok = true` 时才存在。
/// 从前没有 `ok`，判"成功没有"靠的是 `pcall`，而那把"地址写错了"和"网断了"
/// 混成了一件事（见 `落定` 那段）。
///
/// 成功那一侧三个字段：`code`（HTTP 状态码）、`text`（原样的响应体）、
/// `json`（**能解析时**才有的、拆好的表）。
///
/// ⚠️ `json` **解析不了就不给这个键**，不当错误。响应是 HTML 错误页、是纯文本、
/// 是空体的场合多得很（4xx 的正文常常就是一整页 HTML），那时插件该看到的是
/// `text` 里那段话，而不是一个"JSON 解析失败"——后者会把病因指到错的地方，
/// 而且掩盖了"服务器确实回了话"这一事实。
///
/// 有了它，插件读 OpenAI 那种 `choices[1].message.content` 才不用自己写
/// JSON 解析器（Lua 里没有，用模式匹配去抠字符串会在 `\n` 这种转义上出错）。
fn 收口(lua: &Lua, r: NotaResult<落定>) -> mlua::Result<Table> {
    let out = lua.create_table()?;
    let (包, 流) = match r {
        // 参数写错了：**照旧抛**（理由见 `落定` 那张表）。栈信息留给作者。
        Err(e) => return Err(lua_err(e)),
        Ok(落定::环境失败(为什么)) => {
            out.set("ok", false)?;
            out.set("error", 为什么)?;
            return Ok(out);
        }
        Ok(落定::回包(包)) => (包, None),
        Ok(落定::流完 { 包, 块数, 中断 }) => (包, Some((块数, 中断))),
    };
    out.set("ok", true)?;
    out.set("code", 包.code)?;
    if let Some((块数, 中断)) = 流 {
        out.set("chunks", 块数)?;
        // ⚠️ `aborted` **只在真被喊停时才设**：写成 `false` 的话插件那边
        // `if r.aborted then` 与 `if r.aborted ~= nil then` 是两种意思，
        // 而"这个键在不在"本身就是要传的信息。
        if 中断 {
            out.set("aborted", true)?;
        }
    }
    if let Ok(v) = serde_json::from_str::<serde_json::Value>(&包.text) {
        out.set("json", super::json_to_lua(lua, &v)?)?;
    }
    out.set("text", 包.text)?;
    Ok(out)
}

/// 把 `get(url)` / `post{url=…}` 这两种写法归一成一张规格表。
fn 归一化(lua: &Lua, spec: Value, 方法: &str) -> mlua::Result<Table> {
    match spec {
        Value::String(s) => {
            let t = lua.create_table()?;
            t.set("url", s)?;
            t.set("method", 方法)?;
            Ok(t)
        }
        Value::Table(t) => {
            // 只补默认值，**不覆盖**插件自己写的 `method`：
            // `nota.http.post{ method = "PUT", … }` 是合法的（少见但不必拦）。
            if t.get::<Option<String>>("method")?.is_none() {
                t.set("method", 方法)?;
            }
            Ok(t)
        }
        other => Err(mlua::Error::RuntimeError(format!(
            "nota.http.{}(…) 需要一个 url 字符串或一张规格表，收到的是{}",
            方法.to_lowercase(),
            类型名(&other)
        ))),
    }
}

/// 这张头表里有没有 `content-type`？
///
/// ⚠️ 存在的理由：表体（`body = {…}`）会被自动补一个
/// `content-type: application/json`，而 `Request::builder().header()` 是**追加**
/// 不是覆盖——插件自己写过的话，补的那一下就成了第二个 content-type 头。
/// 重复头各服务器处理不一致（有的直接 400，有的只认第一个，而插件写的那个
/// 排在后面），所以补之前必须真的问一句，而不是在注释里许愿。
///
/// 头名不区分大小写（HTTP 的规定）：`Content-Type` 和 `content-type` 是同一个头。
fn 写了_content_type(headers: &Table) -> bool {
    headers
        .pairs::<String, Value>()
        .flatten()
        .any(|(k, _)| k.eq_ignore_ascii_case("content-type"))
}

/// 把一张规格表拼成一个能发出去的请求。**读参数、查地址、拼头与体**都在这儿，
/// 一次性请求与流式请求共用这一份（两处各写一遍的话，"表体当 JSON 发"或者
/// "content-type 只补一次"这类规矩迟早有一边会漏）。
///
/// ⚠️ 这里**不设超时**：超时是 agent 上的东西（[`代理`] 管），请求本身没有。
fn 拼请求(lua: &Lua, spec: &Table) -> NotaResult<ureq::http::Request<Vec<u8>>> {
    let url: String = spec
        .get("url")
        .map_err(|_| NotaError::other("nota.http 需要 `url` 字段"))?;
    检查地址(&url)?;

    let 方法 = spec
        .get::<Option<String>>("method")
        .ok()
        .flatten()
        .unwrap_or_else(|| "GET".to_owned())
        .to_ascii_uppercase();
    if !允许的方法.contains(&方法.as_str()) {
        return Err(NotaError::other(format!(
            "不支持 `{方法}` 方法：只允许 {}",
            允许的方法.join(" / ")
        )));
    }

    let mut req = ureq::http::Request::builder()
        .method(方法.as_str())
        .uri(&url);

    // 头。**默认 UA 换成 Nota 自己的**：出问题时对方的日志里能看出是 Nota 发的，
    // 而 ureq 默认的 `ureq/3.x` 会让人以为这是某个爬虫。
    req = req.header("user-agent", format!("Nota/{}", env!("CARGO_PKG_VERSION")));

    let mut 是_json = false;
    let 头表 = spec.get::<Option<Table>>("headers").ok().flatten();
    let 自己写了_content_type = 头表.as_ref().is_some_and(写了_content_type);
    if let Some(headers) = 头表 {
        for pair in headers.pairs::<String, Value>() {
            let (k, v) = pair.map_err(mlua_to_nota)?;
            // 头的值只收字符串和数字：`{ authorization = token }` 里 token 是
            // 个字符串，没什么好说的；收到表就说明写法错了，早报早清楚。
            let vs = match v {
                Value::String(s) => s.to_string_lossy().to_string(),
                Value::Integer(i) => i.to_string(),
                Value::Number(n) => n.to_string(),
                Value::Boolean(b) => b.to_string(),
                Value::Nil => continue,
                other => {
                    return Err(NotaError::other(format!(
                        "请求头 `{k}` 的值是{}，只支持文本/数字/布尔",
                        类型名(&other)
                    )))
                }
            };
            req = req.header(k.as_str(), vs);
        }
    }

    // 体。表 = 当 JSON 发（插件里最常见的就是这一种）。
    let mut body: Vec<u8> = Vec::new();
    match spec.get::<Value>("body") {
        Err(_) | Ok(Value::Nil) => {}
        Ok(Value::String(s)) => body = s.as_bytes().to_vec(),
        Ok(Value::Table(t)) => {
            let json = lua_to_json(lua, Value::Table(t)).map_err(mlua_to_nota)?;
            body = serde_json::to_vec(&json)
                .map_err(|e| NotaError::other(format!("请求体转 JSON 失败：{e}")))?;
            是_json = true;
        }
        Ok(other) => {
            return Err(NotaError::other(format!(
                "请求体只支持文本或表（表会当 JSON 发），不支持{}",
                类型名(&other)
            )))
        }
    }
    if body.len() > 请求上限 {
        return Err(NotaError::other(format!(
            "请求体 {} 字节，超过上限 {请求上限} 字节",
            body.len()
        )));
    }
    if 是_json && !自己写了_content_type {
        // 只在插件**自己没写** content-type 时才补——它可能想发
        // `application/json; charset=utf-8` 这种更具体的。
        req = req.header("content-type", "application/json");
    }

    let 请求 = req
        .body(body)
        .map_err(|e| NotaError::other(format!("拼请求失败：{e}")))?;
    Ok(请求)
}

/// 建一个这一趟用的 agent。**两类请求共用的第二份**：重定向次数、
/// "4xx/5xx 不是错误"、UA、超时——这些规矩只有一处定义。
fn 代理(spec: &Table) -> NotaResult<ureq::Agent> {
    let 时限 = 超时(spec)?;
    Ok(ureq::Agent::new_with_config(
        ureq::Agent::config_builder()
            // 4xx/5xx **不是**错误：API 的报错正文（配额用完了、key 不对）
            // 就在响应体里，插件要读得到那段话才能告诉用户出了什么事。
            .http_status_as_error(false)
            .max_redirects(最大重定向)
            .timeout_global(Some(时限))
            .user_agent(format!("Nota/{}", env!("CARGO_PKG_VERSION")))
            .build(),
    ))
}

/// 发一次请求。**这是唯一真正碰网络的地方。**
///
/// 返回值里那两层是**故意的**（见 `落定`）：外层 `Err` = 插件参数写错了，
/// 内层 `环境失败` = 网络不给力。折成 Lua 表的那一步在 [`收口`]。
fn 发一次(lua: &Lua, spec: &Table) -> NotaResult<落定> {
    let 请求 = 拼请求(lua, spec)?;

    // ⚠️ 从这里往下两条失败都是**环境类**（`落定::环境失败`）：连不上、超时、
    // 读断了。用户会正常遇到，所以它们必须是**一个能显示的值**，不是一次抛出。
    let mut resp = match 代理(spec)?.run(请求) {
        Ok(r) => r,
        Err(e) => return Ok(落定::环境失败(format!("请求失败：{e}"))),
    };

    let code = resp.status().as_u16();
    let text = match resp
        .body_mut()
        .with_config()
        .limit(响应上限)
        .read_to_string()
    {
        Ok(t) => t,
        Err(e) => {
            return Ok(落定::环境失败(format!(
                "读响应失败（响应体上限 {响应上限} 字节，超了也算失败）：{e}"
            )))
        }
    };

    Ok(落定::回包(回包 { code, text }))
}

/// 流式发一次：**边收边把每一块交给 `收到`**（`docs/07` 第 58 项）。
///
/// 三件事的定义在文件头那张表里（块边界不保证、不切多字节字符、返回 `false`
/// 就是喊停）。这里只补两条实现上的：
///
/// 1. **回调抛错 = 整件事抛错**。错误是插件作者写的（回调里打了个 `nil`），
///    不是环境问题，所以它走 `Err` 那条路、带着栈上去（与 `落定` 那张表一致）。
/// 2. **全文照样攒着还给你**（`text` 字段）。⚠️ 攒的是**去掉无效字节之后的**
///    版本（`切出完整段` 会把坏字节换成 `U+FFFD`），不是原始字节——这两者
///    在正常响应里逐字相同，不一样的时候说明线路上本来就有坏字节。
fn 流式(lua: &Lua, spec: &Table, 收到: &mlua::Function) -> NotaResult<落定> {
    let 请求 = 拼请求(lua, spec)?;

    let mut resp = match 代理(spec)?.run(请求) {
        Ok(r) => r,
        Err(e) => return Ok(落定::环境失败(format!("请求失败：{e}"))),
    };

    let code = resp.status().as_u16();
    let mut 读 = resp.body_mut().with_config().limit(响应上限).reader();

    let mut 全文 = String::new();
    let mut 待续: Vec<u8> = Vec::new();
    let mut 块数 = 0usize;
    let mut 缓冲 = [0u8; 8192];

    loop {
        let n = match std::io::Read::read(&mut 读, &mut 缓冲) {
            Ok(0) => break,
            Ok(n) => n,
            Err(e) => {
                return Ok(落定::环境失败(format!(
                    "读响应失败（响应体上限 {响应上限} 字节，超了也算失败）：{e}"
                )))
            }
        };
        待续.extend_from_slice(&缓冲[..n]);

        while let Some(块) = 切出完整段(&mut 待续) {
            块数 += 1;
            全文.push_str(&块);
            // ⚠️ 只有**字面上的 `false`** 是喊停。`nil` / 数字 / 什么也不返回
            // 都继续——`return` 一个值出来是最容易顺手写下的"没什么要说"，
            // 把它当成取消的话，插件作者写个 `return true` 都会把流掐断。
            let 回话: Value = 收到.call(块).map_err(mlua_to_nota)?;
            if matches!(回话, Value::Boolean(false)) {
                return Ok(落定::流完 {
                    包: 回包 { code, text: 全文 },
                    块数,
                    中断: true,
                });
            }
        }
    }

    // 收尾：还剩几个字节就是"最后那个多字节字符被砍了一半"——线路上真断了。
    // 换成 `U+FFFD` 交出去，别让它在缓冲区里永远沉默（不交的话，用户看到的是
    // "少了几个字"，而没有任何地方报过错）。
    if !待续.is_empty() {
        let 尾 = String::from_utf8_lossy(&待续).into_owned();
        块数 += 1;
        全文.push_str(&尾);
        let 回话: Value = 收到.call(尾).map_err(mlua_to_nota)?;
        if matches!(回话, Value::Boolean(false)) {
            return Ok(落定::流完 {
                包: 回包 { code, text: 全文 },
                块数,
                中断: true,
            });
        }
    }

    Ok(落定::流完 {
        包: 回包 { code, text: 全文 },
        块数,
        中断: false,
    })
}

/// 从缓冲区里**切出一个合法的 UTF-8 片段**（能切多少切多少），剩下的留在里面。
/// 切不出东西时给 `None`。
///
/// ⚠️ **这是流式唯一一处"必须自己写"的活儿。** socket 的块边界是按字节来的，
/// 一个汉字（3 字节）被劈成两块是家常便饭；把半个汉字交给 Lua，前端拿到的是
/// 一个 `U+FFFD`，而且**那个字永远补不回来**（下一块的字节已经在 `待续` 里被
/// 当成新字符了）。
///
/// 三种落定：
///
/// | `from_utf8` 的结果 | 怎么办 |
/// |---|---|
/// | 整段合法 | 全交出去，缓冲清空 |
/// | 前面好、尾巴是**没读完的**多字节字符（`error_len() == None`） | 好的交出去，尾巴留着等下一块。⚠️ 好的部分是空的就什么也不交——**等**，不是取巧 |
/// | 中间有**真的坏字节**（`error_len()` 有值） | 好的交出去，坏的那几个换成 `U+FFFD` 一起交，**继续往后走**（不然这一块会卡住整个流） |
fn 切出完整段(buf: &mut Vec<u8>) -> Option<String> {
    if buf.is_empty() {
        return None;
    }
    match std::str::from_utf8(buf) {
        Ok(s) => {
            let out = s.to_owned();
            buf.clear();
            Some(out)
        }
        Err(e) => {
            let 好的 = e.valid_up_to();
            match e.error_len() {
                None => {
                    if 好的 == 0 {
                        return None;
                    }
                    let out = String::from_utf8_lossy(&buf[..好的]).into_owned();
                    buf.drain(..好的);
                    Some(out)
                }
                Some(坏) => {
                    let mut out = String::from_utf8_lossy(&buf[..好的]).into_owned();
                    out.push('\u{FFFD}');
                    buf.drain(..好的 + 坏);
                    Some(out)
                }
            }
        }
    }
}

/// 取超时设置。默认 [`默认超时`]，超过 [`最长超时`] 就**截到上限**而不是报错——
/// 插件写 `timeout_ms = 600000` 的意图是"这个请求可能很慢"，不是"我要一个非法值"。
fn 超时(spec: &Table) -> NotaResult<Duration> {
    let ms = spec.get::<Option<u64>>("timeout_ms").ok().flatten();
    let Some(ms) = ms else {
        return Ok(默认超时);
    };
    if ms == 0 {
        return Err(NotaError::other("timeout_ms 不能是 0"));
    }
    Ok(Duration::from_millis(ms).min(最长超时))
}

/// 只放行 https，以及**回环地址上的** http。
fn 检查地址(url: &str) -> NotaResult<()> {
    let Some((scheme, rest)) = url.split_once("://") else {
        return Err(NotaError::other(format!(
            "地址 `{url}` 少了协议头：要写成 `https://…`（本机服务可以 `http://127.0.0.1:…`）"
        )));
    };

    match scheme.to_ascii_lowercase().as_str() {
        "https" => Ok(()),
        "http" => {
            let 主机 = 取主机(rest);
            if 是回环(&主机) {
                Ok(())
            } else {
                Err(NotaError::other(format!(
                    "拒绝向 `{主机}` 发明文请求：`http://` 只放行本机回环地址\
                     （127.0.0.1 / localhost / ::1，给本地大模型服务用），\
                     其余一律走 `https://`"
                )))
            }
        }
        other => Err(NotaError::other(format!(
            "不支持 `{other}://`：只有 https，以及回环地址上的 http"
        ))),
    }
}

/// 从 `主机[:端口]/路径?查询#片段` 里取出主机名（小写，去端口、去 userinfo）。
fn 取主机(rest: &str) -> String {
    // 先砍掉路径/查询/片段。
    let authority = rest.split(['/', '?', '#']).next().unwrap_or(rest);
    // 去掉 `user:pass@` —— **最后一个 `@` 之后**才是主机。
    let host = authority.rsplit('@').next().unwrap_or(authority);
    // IPv6 写成 `[::1]:8080`，方括号里的冒号不是端口分隔。
    if let Some(inside) = host.strip_prefix('[') {
        return inside.split(']').next().unwrap_or(inside).to_ascii_lowercase();
    }
    host.split(':').next().unwrap_or(host).to_ascii_lowercase()
}

/// 是不是本机回环。
///
/// ⚠️ **只认这三个**：`localhost` / `127.0.0.1` / `::1`。
/// 不收 `127.0.0.0/8` 里的别的地址、不收 `0.0.0.0`——后者在有些系统上
/// 会连到"所有网卡"上去，那不是回环。
fn 是回环(host: &str) -> bool {
    matches!(host, "localhost" | "127.0.0.1" | "::1")
}

fn 类型名(v: &Value) -> &'static str {
    match v {
        Value::Nil => "nil",
        Value::Boolean(_) => "布尔",
        Value::Integer(_) | Value::Number(_) => "数字",
        Value::String(_) => "文本",
        Value::Table(_) => "表",
        Value::Function(_) => "函数",
        Value::Thread(_) => "协程",
        Value::UserData(_) | Value::LightUserData(_) => "宿主对象",
        _ => "一个认不出的值",
    }
}

#[cfg(test)]
mod tests;
