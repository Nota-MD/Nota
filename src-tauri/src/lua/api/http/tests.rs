//! `http.rs` 的单元测试。
//!
//! ⚠️ 2026-10-04 从 `http.rs` 里搬出来的：那一份加了流式之后要过 800 行
//!（`docs/09` §4 的软线），而测试本来就是最好搬的一块。

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
        Ok(落定::回包(回包 {
            code: 200,
            text: r#"{"choices":[{"message":{"content":"你好"}},{"message":{"content":"第二"}}],"ok":true}"#
                .to_owned(),
        })),
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
        Ok(落定::回包(回包 {
            code: 502,
            text: "<html>502 Bad Gateway</html>".to_owned(),
        })),
    )
    .unwrap();

    assert_eq!(t.get::<u16>("code").unwrap(), 502);
    assert!(
        matches!(t.get::<Value>("json").unwrap(), Value::Nil),
        "HTML 不该被当成 JSON 解析出什么来"
    );
    assert_eq!(t.get::<String>("text").unwrap(), "<html>502 Bad Gateway</html>");
}

/// ✅ **第 60 项那条根因的落点**（`docs/07`）：环境类失败是**一个值**，
/// 不是一次抛出。
///
/// ⚠️ 这条用例真正钉住的是"**别抛**"：写成 `Err(...)` 的话插件那边又得
/// 自己 `pcall` ＋ 掐栈，而掐漏一次就是"断网时整块面板糊满栈信息"
/// （BUG-20 见过的样子）。
#[test]
fn 环境类失败是结果表不抛错() {
    let lua = Lua::new();
    let t = 收口(&lua, Ok(落定::环境失败("请求失败：连接被拒".to_owned())))
        .expect("环境类失败**不许**变成 Lua 错误");

    assert_eq!(t.get::<bool>("ok").unwrap(), false);
    assert_eq!(t.get::<String>("error").unwrap(), "请求失败：连接被拒");
    // ⚠️ 失败那一侧**不给 `code`**：没有回应，哪来的状态码。
    // 给了的话插件会把 `nil` 当成"未知状态码"去判断，越判越乱。
    assert!(matches!(t.get::<Value>("code").unwrap(), Value::Nil));
    assert!(matches!(t.get::<Value>("text").unwrap(), Value::Nil));
}

/// 参数写错**照旧抛**——那两种错不该混成一种（`落定` 那张表）。
#[test]
fn 参数写错照旧抛() {
    let lua = Lua::new();
    let e = 收口(&lua, Err(NotaError::other("不支持 `TRACE` 方法")));
    assert!(e.is_err(), "作者写错了程序，栈信息要留给作者");
}

/// 成功那一侧**必须**带 `ok = true`：插件靠它分流，缺席的话
/// `if not r.ok` 会把 200 也当成失败。
#[test]
fn 拿到回应时_ok_是真的() {
    let lua = Lua::new();
    let t = 收口(
        &lua,
        Ok(落定::回包(回包 {
            code: 404,
            text: "not found".to_owned(),
        })),
    )
    .unwrap();

    // ⚠️ 4xx 也是"拿到了回应"：`ok` 判的是**请求走通了没有**，不是状态码好不好。
    assert_eq!(t.get::<bool>("ok").unwrap(), true);
    assert_eq!(t.get::<u16>("code").unwrap(), 404);
}

// ── 流式（`docs/07` 第 58 项）────────────────────────────────────────────────
//
// ⚠️ 这一组里**有一条真的开了一次 socket**（回环地址上的桩服务器）。理由：
// "边收边给"这件事的全部内容就是"块什么时候到"，而拿一个 `Vec<u8>` 假扮
// 读取器是**证不出这件事的**——那只能证明"我把给你的字节转交了"。桩服务器
// 一次写一小段、中间歇一下，读到的块数才是真的。

/// 一个只会说一句话的桩服务器：收一条请求，回一段 `响应头` ＋ 按顺序慢慢吐
/// 出的 `块们`。返回它的地址（形如 `http://127.0.0.1:PORT/`）与那条线程的把手。
///
/// ⚠️ 写完**先把请求读完再关**（`shutdown(Write)` 之后读到 EOF）：不读干净就
/// 关，内核会给对面发一个 RST，而 ureq 那边看到的可能不是"我读完了"，是
/// "连接被重置"——那会让这条用例变得看运气。
fn 桩服务器(响应头: String, 块们: Vec<Vec<u8>>) -> (String, std::thread::JoinHandle<()>) {
    use std::io::{Read as _, Write as _};
    let 监听 = std::net::TcpListener::bind("127.0.0.1:0").expect("绑不上回环端口");
    let 地址 = 监听.local_addr().unwrap();
    let 把手 = std::thread::spawn(move || {
        let (mut 连, _) = 监听.accept().expect("没人连上来");
        // 把请求读干净（到 EOF 为止）。⚠️ 不能只读到 `\r\n\r\n` 就停：请求体
        // 还在缓冲区里，带着没读完的字节关连接同样会发 RST。
        let mut 倒掉 = [0u8; 4096];
        let _ = 连.read(&mut 倒掉);
        连.write_all(响应头.as_bytes()).unwrap();
        连.flush().unwrap();
        for 块 in 块们 {
            连.write_all(&块).unwrap();
            连.flush().unwrap();
            std::thread::sleep(Duration::from_millis(20));
        }
        let _ = 连.shutdown(std::net::Shutdown::Write);
        // 对面把剩下的请求发完就散伙。
        while let Ok(n) = 连.read(&mut 倒掉) {
            if n == 0 {
                break;
            }
        }
    });
    (format!("http://{地址}/v1/chat/completions"), 把手)
}

/// 造一个"分块吐出来的" HTTP 响应（用 `content-length`，不用 chunked——
/// ⚠️ 两者都合法，但 `content-length` 让"服务端就是慢慢写的"这件事更直白：
/// 响应体是**一整份**，只是路上被 TCP 分成了几段）。
///
/// ⚠️ 切出来的块是 **`Vec<u8>` 不是 `String`**：按字节切就一定会切出"半个
/// 汉字"，而那种字节**根本没有合法的 `String` 表示**——写成 `String` 的话只能
/// 过一遍 `from_utf8_lossy`，那一步会把半个汉字就地换成 `U+FFFD`，
/// **损坏发生在桩这一侧、根本到不了线路上**，于是"宿主不切半个汉字"这件事
/// 永远验不到（第一版就是这么写的，三条用例一起红，而红的是测试夹具）。
fn 分块响应(体: &str) -> (String, Vec<Vec<u8>>) {
    let 头 = format!(
        "HTTP/1.1 200 OK\r\ncontent-type: text/event-stream\r\ncontent-length: {}\r\n\r\n",
        体.len()
    );
    // 按 8 个字节一段切开——汉字 3 字节，所以**一定会切出半个汉字**。
    let 块们 = 体.as_bytes().chunks(8).map(|c| c.to_vec()).collect();
    (头, 块们)
}

/// 把一个 Lua 回调接成"把每一块塞进这个 Vec"。
fn 收集块() -> (std::sync::Arc<std::sync::Mutex<Vec<String>>>, Lua, mlua::Function) {
    use std::sync::{Arc, Mutex};
    let lua = Lua::new();
    let 筐 = Arc::new(Mutex::new(Vec::new()));
    let 筐2 = 筐.clone();
    let f = lua
        .create_function(move |_, 块: String| {
            筐2.lock().unwrap().push(块);
            Ok(())
        })
        .unwrap();
    (筐, lua, f)
}

/// 回调里的每一块都必须是**合法 UTF-8**、而且拼起来要**逐字等于**响应体。
///
/// ⚠️ 这条钉的是 `切出完整段`：桩服务器按 8 字节切，而中文一个字 3 字节，
/// 所以"不切半个汉字"这件事在这里一定会被撞上（不是理论上会）。
#[test]
fn 流式的每一块都不切半个汉字() {
    let 体 = "data: {\"choices\":[{\"delta\":{\"content\":\"你好，世界\"}}]}\n\n\
              data: {\"choices\":[{\"delta\":{\"content\":\"再见\"}}]}\n\n\
              data: [DONE]\n\n";
    let (头, 块们) = 分块响应(体);
    let (地址, 把手) = 桩服务器(头, 块们);

    let (筐, lua, f) = 收集块();
    let spec = lua.create_table().unwrap();
    spec.set("url", 地址).unwrap();
    spec.set("method", "POST").unwrap();

    let 落 = 流式(&lua, &spec, &f).unwrap();
    let (包, 块数, 中断) = match 落 {
        super::落定::流完 { 包, 块数, 中断 } => (包, 块数, 中断),
        _ => panic!("该是流完"),
    };
    把手.join().unwrap();

    assert_eq!(包.code, 200);
    assert!(!中断);
    assert_eq!(包.text, 体, "攒起来的全文要**逐字**等于响应体");
    let 块们 = 筐.lock().unwrap();
    assert_eq!(块们.concat(), 体, "交给回调的那些块拼起来也要逐字等于响应体");
    assert!(
        块数 >= 3,
        "桩分了 {} 段慢写，拿到 {块数} 块——太少说明是憋完才给的",
        体.len() / 8
    );
    // 每条都合法 UTF-8 这件事由 `String` 本身保证；这里再钉一下"没有替换字符"，
    // 因为把半个汉字硬塞进 `String` 的唯一后果就是它。
    for (i, 块) in 块们.iter().enumerate() {
        assert!(!块.contains('\u{FFFD}'), "第 {i} 块里有替换字符：{块:?}");
    }
}

/// 回调返回 `false` ⇒ **当场收工**，后面那几块一个都不许再交。
///
/// ⚠️ 这是"用户关掉面板 / 切走对话时怎么收尾"那条（`docs/07` 第 58 项）。
/// 没有它，一条在飞的请求只能等它自己说完——而模型可能还要喷半分钟。
#[test]
fn 回调返回_false_就当场收工() {
    let 体 = "第一块\n第二块\n第三块\n第四块\n第五块\n第六块\n第七块\n第八块\n";
    let (头, 块们) = 分块响应(体);
    let (地址, 把手) = 桩服务器(头, 块们);

    let lua = Lua::new();
    let 收到 = lua
        .create_function(|_, _块: String| Ok(false))
        .unwrap();
    let spec = lua.create_table().unwrap();
    spec.set("url", 地址).unwrap();
    spec.set("method", "POST").unwrap();

    let 落 = 流式(&lua, &spec, &收到).unwrap();
    let (包, 块数, 中断) = match 落 {
        super::落定::流完 { 包, 块数, 中断 } => (包, 块数, 中断),
        _ => panic!("该是流完"),
    };

    assert!(中断, "回调说了停，`aborted` 必须是 true");
    assert_eq!(块数, 1, "喊停之后一块都不许再交");
    assert_eq!(包.text, &体[..包.text.len()], "攒下来的全文只能是喊停前收到的那点");
    assert!(包.text.len() < 体.len(), "喊停得够早，全文不该是完整那份");
    // ⚠️ **不 join 那条线程**：它还在往里写（写完才发现对面不读了），
    // 拿 join 等它等于把这条用例变成看服务器脸色。进程退出时它自己会散。
    drop(把手);
}

/// `时间到` 之外的两条：`chunks` 与 `aborted` **怎么出现在结果表里**。
#[test]
fn 流式的结果表只在真中断时才有_aborted() {
    let lua = Lua::new();

    let 收完 = 收口(
        &lua,
        Ok(落定::流完 {
            包: 回包 { code: 200, text: "abc".to_owned() },
            块数: 3,
            中断: false,
        }),
    )
    .unwrap();
    assert_eq!(收完.get::<bool>("ok").unwrap(), true);
    assert_eq!(收完.get::<usize>("chunks").unwrap(), 3);
    assert!(
        matches!(收完.get::<Value>("aborted").unwrap(), Value::Nil),
        "没中断就不该有 `aborted` 这个键——`if r.aborted` 会把 false 也当没中断，\
         但 `if r.aborted ~= nil` 会把 false 当中断"
    );

    let 中场 = 收口(
        &lua,
        Ok(落定::流完 {
            包: 回包 { code: 200, text: "ab".to_owned() },
            块数: 2,
            中断: true,
        }),
    )
    .unwrap();
    assert_eq!(中场.get::<bool>("aborted").unwrap(), true);
    assert_eq!(中场.get::<usize>("chunks").unwrap(), 2);

    // 一次性那两条路**没有** `chunks`：那是流式专有的说法，多给一个键
    // 只会让插件去猜"我这边的 0 是什么意思"。
    let 一次 = 收口(
        &lua,
        Ok(落定::回包(回包 { code: 200, text: "x".to_owned() })),
    )
    .unwrap();
    assert!(matches!(一次.get::<Value>("chunks").unwrap(), Value::Nil));
}

/// `切出完整段` 的三种落定，逐条钉（上面那条端到端用例只撞得到第一种）。
#[test]
fn 切出完整段的三条路() {
    // ① 整段合法 ⇒ 全交出去，缓冲清空。
    let mut b = "你好".as_bytes().to_vec();
    assert_eq!(切出完整段(&mut b).unwrap(), "你好");
    assert!(b.is_empty());
    assert!(切出完整段(&mut b).is_none(), "空缓冲给 None");

    // ② 尾巴是**没读完的**多字节字符 ⇒ 好的交出去，尾巴留着。
    //    "好" 是三字节，这里只给前两个。
    let mut b = Vec::new();
    b.extend_from_slice("ab".as_bytes());
    b.extend_from_slice(&"好".as_bytes()[..2]);
    assert_eq!(切出完整段(&mut b).unwrap(), "ab");
    assert_eq!(b.len(), 2, "剩下的那半个字要留在缓冲里等下一块");
    assert!(
        切出完整段(&mut b).is_none(),
        "只有半个字时什么都不交——等，不是取巧"
    );

    // 补上最后那个字节，这一块就出来了。
    b.push("好".as_bytes()[2]);
    assert_eq!(切出完整段(&mut b).unwrap(), "好");

    // ③ 中间是真的坏字节 ⇒ 换成 U+FFFD，**继续往后走**（不然会卡住整条流）。
    //    ⚠️ 一个坏字节换一个 `U+FFFD`（与 `String::from_utf8_lossy` 同一条口径），
    //    所以这里**切几刀是不确定的**——用例只认"一路切到空"拼出来的那一串。
    let mut b = vec![b'a', 0xFF, 0xFE, b'b'];
    let mut 全部 = String::new();
    while let Some(s) = 切出完整段(&mut b) {
        全部.push_str(&s);
    }
    assert_eq!(全部, "a\u{FFFD}\u{FFFD}b");
    assert!(b.is_empty(), "坏字节也要往前走，不许卡在缓冲里");
}

/// `stream` 装上了，而且**第二个参数是必填的**——少给一个就报错，
/// 不许默默退化成一次性请求（退化了用户看到的还是"憋完才出现"）。
#[test]
fn 装上了_stream_而且回调是必填的() {
    let lua = Lua::new();
    let http = build(&lua).unwrap();
    assert!(
        matches!(http.get::<Value>("stream").unwrap(), Value::Function(_)),
        "`nota.http.stream` 该在表里"
    );

    // 只给规格表 ⇒ 参数个数不对，抛。
    let 规格 = lua.create_table().unwrap();
    规格.set("url", "http://127.0.0.1:1/x").unwrap();
    let f = http.get::<mlua::Function>("stream").unwrap();
    assert!(f.call::<Value>(规格).is_err(), "少一个回调参数该报错");
}
