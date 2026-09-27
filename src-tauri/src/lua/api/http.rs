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
//! # 不做的两件事（说清楚，免得被当成漏了）
//!
//! - **不做流式**。AI 生成时边出边显示体验好得多，但那要一路改到界面层
//!   （前端订阅事件、逐块追加）。`docs/07` 单独记着这一项。
//! - **不做上传/下载文件**。插件的 `body` 只能是文本或一张表（当 JSON 发）。

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

    Ok(t)
}

/// 把 `发一次` 的结果折成 Lua 表（或者把错误折成 Lua 错误）。
///
/// `get` / `post` / `request` 三条路都从这里出去，所以**返回值的形状只有一处定义**。
///
/// 三个字段：`code`（HTTP 状态码）、`text`（原样的响应体）、`json`（**能解析时**
/// 才有的、拆好的表）。
///
/// ⚠️ `json` **解析不了就不给这个键**，不当错误。响应是 HTML 错误页、是纯文本、
/// 是空体的场合多得很（4xx 的正文常常就是一整页 HTML），那时插件该看到的是
/// `text` 里那段话，而不是一个"JSON 解析失败"——后者会把病因指到错的地方，
/// 而且掩盖了"服务器确实回了话"这一事实。
///
/// 有了它，插件读 OpenAI 那种 `choices[1].message.content` 才不用自己写
/// JSON 解析器（Lua 里没有，用模式匹配去抠字符串会在 `\n` 这种转义上出错）。
fn 收口(lua: &Lua, r: NotaResult<回包>) -> mlua::Result<Table> {
    let 包 = r.map_err(lua_err)?;
    let out = lua.create_table()?;
    out.set("code", 包.code)?;
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

/// 发一次请求。**这是唯一真正碰网络的地方。**
fn 发一次(lua: &Lua, spec: &Table) -> NotaResult<回包> {
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

    let 时限 = 超时(spec)?;

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

    let 配置 = ureq::Agent::config_builder()
        // 4xx/5xx **不是**错误：API 的报错正文（配额用完了、key 不对）
        // 就在响应体里，插件要读得到那段话才能告诉用户出了什么事。
        .http_status_as_error(false)
        .max_redirects(最大重定向)
        .timeout_global(Some(时限))
        .user_agent(format!("Nota/{}", env!("CARGO_PKG_VERSION")))
        .build();

    let 请求 = req
        .body(body)
        .map_err(|e| NotaError::other(format!("拼请求失败：{e}")))?;

    let mut resp = ureq::Agent::new_with_config(配置)
        .run(请求)
        .map_err(|e| NotaError::other(format!("请求失败：{e}")))?;

    let code = resp.status().as_u16();
    let text = resp
        .body_mut()
        .with_config()
        .limit(响应上限)
        .read_to_string()
        .map_err(|e| {
            NotaError::other(format!(
                "读响应失败（响应体上限 {响应上限} 字节，超了也算失败）：{e}"
            ))
        })?;

    Ok(回包 { code, text })
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
mod tests {
    use super::*;

    /// ⚠️ **这条是这一整个模块里最该在的一条。**
    ///
    /// 明文 http 会把插件的 API key 和文档内容一起发在裸链路上。
    /// 唯一的例外是本机回环——那是给 Ollama / LM Studio 这类
    /// 跑在自己机器上的大模型服务留的口子，流量根本不出这台机器。
    #[test]
    fn 只放行_https_和回环的_http() {
        for ok in [
            "https://api.anthropic.com/v1/messages",
            "https://example.com",
            "http://127.0.0.1:11434/api/chat",
            "http://localhost:1234/v1/chat/completions",
            "http://[::1]:8080/x",
            "http://LOCALHOST:1/x",
        ] {
            assert!(检查地址(ok).is_ok(), "`{ok}` 该放行，却被挡了");
        }

        for bad in [
            "http://api.anthropic.com/v1/messages", // 明文发密钥
            "http://192.168.1.10:8080/",            // 局域网，不是回环
            "http://0.0.0.0:8080/",                 // 0.0.0.0 不是回环
            "ftp://example.com/x",
            "file:///etc/passwd",
            "api.anthropic.com", // 没协议头
        ] {
            assert!(检查地址(bad).is_err(), "`{bad}` 该被挡，却放行了");
        }
    }

    #[test]
    fn 取主机要能拆出端口和_userinfo() {
        assert_eq!(取主机("example.com/a/b?c#d"), "example.com");
        assert_eq!(取主机("example.com:8443/a"), "example.com");
        assert_eq!(取主机("user:pw@example.com/a"), "example.com");
        assert_eq!(取主机("[::1]:8080/x"), "::1");
        assert_eq!(取主机("Example.COM"), "example.com");
        // ⚠️ 这条是安全用例：`127.0.0.1@evil.com` 的主机是 `evil.com`，
        // 不是 `127.0.0.1`。判反了就是一个"看着像回环、实际指向外网"的口子。
        assert_eq!(取主机("127.0.0.1@evil.com/x"), "evil.com");
    }

    #[test]
    fn 主机名骗不过回环判定() {
        // `127.0.0.1.evil.com` 与 `localhost.evil.com` 都不是本机。
        for host in ["127.0.0.1.evil.com", "localhost.evil.com", "notlocalhost"] {
            assert!(!是回环(host), "`{host}` 被当成了回环");
        }
        assert!(是回环("127.0.0.1"));
        assert!(是回环("localhost"));
        assert!(是回环("::1"));
    }

    #[test]
    fn 方法只有那六个() {
        assert!(允许的方法.contains(&"GET"));
        assert!(允许的方法.contains(&"POST"));
        assert!(!允许的方法.contains(&"CONNECT"));
        assert!(!允许的方法.contains(&"TRACE"));
    }

    /// 超时要截到上限，不是报错——插件写一个很大的数，意思是"可能很慢"。
    #[test]
    fn 超时截到上限() {
        let lua = Lua::new();
        let t = lua.create_table().unwrap();
        assert_eq!(超时(&t).unwrap(), 默认超时);

        t.set("timeout_ms", 5_000u64).unwrap();
        assert_eq!(超时(&t).unwrap(), Duration::from_secs(5));

        t.set("timeout_ms", 600_000u64).unwrap();
        assert_eq!(超时(&t).unwrap(), 最长超时, "超长的超时该被截到上限");

        t.set("timeout_ms", 0u64).unwrap();
        assert!(超时(&t).is_err(), "0 是没意义的超时，该报错");
    }

    /// `get("url")` 与 `get{url=…}` 两种写法都该归一化。
    #[test]
    fn 两种写法都归一化() {
        let lua = Lua::new();

        let t = 归一化(&lua, Value::String(lua.create_string("https://x/").unwrap()), "GET").unwrap();
        assert_eq!(t.get::<String>("url").unwrap(), "https://x/");
        assert_eq!(t.get::<String>("method").unwrap(), "GET");

        // ⚠️ 传 `spec.clone()` 而不是 `spec`：归一化是**就地改**那张表，
        // 所以放进去的那一份和外面这一份是同一个东西（这也正是它该有的行为）。
        let spec = lua.create_table().unwrap();
        spec.set("url", "https://y/").unwrap();
        归一化(&lua, Value::Table(spec.clone()), "POST").unwrap();
        assert_eq!(spec.get::<String>("method").unwrap(), "POST");

        // 插件自己写的 method 不被覆盖。
        let spec2 = lua.create_table().unwrap();
        spec2.set("url", "https://z/").unwrap();
        spec2.set("method", "PUT").unwrap();
        let t = 归一化(&lua, Value::Table(spec2), "POST").unwrap();
        assert_eq!(t.get::<String>("method").unwrap(), "PUT");

        // 认不出的类型要报错，别静默当 GET 发出去。
        assert!(归一化(&lua, Value::Integer(1), "GET").is_err());
    }

    /// 插件自己写了 content-type 就得认出来——不然表体那一下会补出
    /// **第二个** content-type 头（`Request::builder().header()` 是追加）。
    #[test]
    fn 认得插件自己写的_content_type() {
        let lua = Lua::new();

        let 空 = lua.create_table().unwrap();
        assert!(!写了_content_type(&空));

        // 只有别的头时不算。
        let 别的 = lua.create_table().unwrap();
        别的.set("authorization", "Bearer sk-x").unwrap();
        assert!(!写了_content_type(&别的));

        // 大小写不同也是同一个头（HTTP 头名不区分大小写）。
        let 大写 = lua.create_table().unwrap();
        大写.set("Content-Type", "application/json; charset=utf-8").unwrap();
        assert!(写了_content_type(&大写));

        let 小写 = lua.create_table().unwrap();
        小写.set("content-type", "text/plain").unwrap();
        assert!(写了_content_type(&小写));
    }

    /// 响应是 JSON 就顺手拆好——AI 插件读 `choices[1].message.content` 靠它。
    ///
    /// ⚠️ 下标从 **1** 起那条要在这里钉住：写成 0 起的话数组第一个元素会
    /// 静默丢掉（`#t` 也对不上），而插件那边看到的是"模型没给出回答"。
    #[test]
    fn 响应是_json就拆好放进去() {
        let lua = Lua::new();
        let t = 收口(
            &lua,
            Ok(回包 {
                code: 200,
                text: r#"{"choices":[{"message":{"content":"你好"}},{"message":{"content":"第二"}}],"ok":true}"#
                    .to_owned(),
            }),
        )
        .unwrap();

        assert_eq!(t.get::<u16>("code").unwrap(), 200);
        let json = t.get::<Table>("json").unwrap();
        assert_eq!(json.get::<bool>("ok").unwrap(), true);
        let choices = json.get::<Table>("choices").unwrap();
        assert_eq!(choices.raw_len(), 2, "两个元素都该在，一个都不能少");
        assert_eq!(
            choices
                .get::<Table>(1)
                .unwrap()
                .get::<Table>("message")
                .unwrap()
                .get::<String>("content")
                .unwrap(),
            "你好"
        );
    }

    /// 不是 JSON（HTML 错误页、空体）时**没有 `json` 这个键**，`text` 照旧。
    /// 这条是"别把解析失败当错误"那条注释的落点。
    #[test]
    fn 不是_json就没有_json这个键() {
        let lua = Lua::new();
        let t = 收口(
            &lua,
            Ok(回包 {
                code: 502,
                text: "<html>502 Bad Gateway</html>".to_owned(),
            }),
        )
        .unwrap();

        assert_eq!(t.get::<u16>("code").unwrap(), 502);
        assert!(
            matches!(t.get::<Value>("json").unwrap(), Value::Nil),
            "HTML 不该被当成 JSON 解析出什么来"
        );
        assert_eq!(t.get::<String>("text").unwrap(), "<html>502 Bad Gateway</html>");
    }
}
