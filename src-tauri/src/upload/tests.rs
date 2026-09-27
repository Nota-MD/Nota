//! `upload` 这一块的用例。
//!
//! # ⚠️ 两条不许碰的东西
//!
//! 1. **`~/.config/nota/` 一个字节都不许碰。** 那里有用户真实的
//!    `image-upload.toml`（如果他配过的话）、`settings.toml` 和
//!    `plugin-settings/nota.ai.toml`——**里面是明文密钥**。所以这里一律走
//!    `读文件` / `写文件`（收一个具体路径），**绝不调 `读()` / `写()`**
//!    ——那两个会自己算出 `~/.config/nota/…` 来。⚠️ 一个忘了改的用例会把
//!    用户配好的 token 覆盖成默认值，而且它不会报错。
//! 2. **临时目录带进程号**。这个仓里别的用例用过写死的名字
//!    （`nota-settings-test-mode`），2026-09-26 撞过一次：早先某次以 root
//!    跑出来的目录留在 `/tmp` 里，之后 uid 1000 的 `cargo test` 全红
//!    ——报的还是"没有权限"这种与代码无关的话。这里带上进程号，多个
//!    会话同时跑也不会互相踩。

use std::io::{Read, Write};
use std::net::TcpListener;
use std::path::PathBuf;
use std::sync::mpsc::Receiver;
use std::time::Duration;

use super::net::传什么;
use super::*;

/// 一个本次进程独占的临时目录。
fn 临时目录(名: &str) -> PathBuf {
    let d = std::env::temp_dir().join(format!("nota-upload-test-{}-{名}", std::process::id()));
    let _ = std::fs::remove_dir_all(&d);
    std::fs::create_dir_all(&d).unwrap();
    d
}

/// 一份"配好了"的设置。用例想要别的样子就在它上面改一两项。
fn 配好了(地址: &str) -> 上传设置 {
    上传设置 {
        enabled: true,
        url: 地址.to_string(),
        ..Default::default()
    }
}

/* ── 默认值：什么都不做，也不预设任何服务商 ────────────────────────────── */

/// ⚠️ 这条盯的是**默认值是"什么都不传"**。默认值错了的症状：装完 Nota、
/// 用户还没配过任何东西，插一张图就往外发了。
#[test]
fn 默认是关的而且什么都没填() {
    let s = 上传设置::default();
    assert!(!s.enabled, "总开关默认必须是关的");
    assert!(!s.auto, "自动上传默认必须是关的");
    assert!(!s.可用(), "没配的设置在界面上应当被当成「不能上传」");
    assert_eq!(s.method, 上传方法::Post);
    assert_eq!(s.field, "file");
    assert_eq!(s.url_path, "data.url");
    assert_eq!(s.headers, "");
    assert_eq!(s.url, "");
    assert_eq!(s.remote_field, "", "留空 = 网络图片不上传，这是默认选择");

    // 写出去的那份 TOML 里，两个开关也是 false（用户手打开文件看到的第一眼）。
    let 文本 = toml::to_string_pretty(&s).unwrap();
    assert!(文本.contains("enabled = false"), "实际是：\n{文本}");
    assert!(文本.contains("auto = false"), "实际是：\n{文本}");
}

/// ⚠️ **不预设任何服务商**：这一条挡的是"顺手给某家写一个默认地址/默认字段名"。
///
/// 判据是**序列化出来的东西**（用户读到的那一份）里不许出现任何一家的名字，
/// 而且地址/请求头是空的——只要有人填了一个默认值，这里就红。
#[test]
fn 不预设任何服务商() {
    let 文本 = toml::to_string_pretty(&上传设置::default()).unwrap();
    let 小写 = 文本.to_lowercase();
    for 家 in [
        "smms", "picgo", "imgur", "qiniu", "aliyun", "upyun", "github", "jsdelivr",
    ] {
        assert!(
            !小写.contains(家),
            "上传设置里出现了服务商「{家}」——这一块不许有预设，全是用户填的：\n{文本}"
        );
    }
    // 地址与请求头必须是空的：有默认值就等于"装完就指向某处"。
    assert_eq!(上传设置::default().url, "");
    assert_eq!(上传设置::default().headers, "");
}

/* ── 读 / 写 ────────────────────────────────────────────────────────────── */

#[test]
fn 写下去的值读得回来() {
    let 路径 = 临时目录("roundtrip").join("image-upload.toml");
    let 原 = 上传设置 {
        enabled: true,
        auto: true,
        url: "https://图床.example.com/api/upload".to_string(),
        method: 上传方法::Put,
        field: "smfile".to_string(),
        // ⚠️ 这里的"token"是**编出来的**，不是任何真密钥。用例里不许出现真的。
        headers: "Authorization: Bearer 假token-0123456789\nX-Api-Key: 假key".to_string(),
        url_path: "data.links.url".to_string(),
        remote_field: "url".to_string(),
    };
    写文件(&路径, &原).unwrap();

    assert_eq!(读文件(&路径), 原, "写下去再读回来必须一模一样");

    // 文件头是注释，**不能影响读回来**；而且它得在头一行（用户打开就看到）。
    let 文本 = std::fs::read_to_string(&路径).unwrap();
    assert!(文本.starts_with("# 这个文件是"), "文件头没了：\n{文本}");
    assert!(文本.contains("0600"), "文件头要说明权限的来由");
}

#[test]
fn 读不出来当没配而不是报错() {
    let 目录 = 临时目录("broken");
    // ① 文件不在
    assert_eq!(
        读文件(&目录.join("不在.toml")),
        上传设置::default(),
        "文件不在该回默认值（＝什么都不传）"
    );
    // ② 语法错（用户手改坏了）
    let 坏 = 目录.join("坏.toml");
    std::fs::write(&坏, "这不是 = = toml").unwrap();
    assert_eq!(
        读文件(&坏),
        上传设置::default(),
        "一份手改坏的设置该表现为「回到默认」，而不是让应用起不来"
    );
    // ③ 缺项：老文件里没有新加的字段时补默认（`#[serde(default)]`）
    let 少项 = 目录.join("少.toml");
    std::fs::write(&少项, "enabled = true\nurl = \"https://a/b\"\n").unwrap();
    let 回 = 读文件(&少项);
    assert!(回.enabled);
    assert_eq!(回.field, "file", "缺的项要补默认值");
    assert_eq!(回.url_path, "data.url");
}

/// ⚠️ 文件里会有明文 token，权限必须是 0600。
#[test]
#[cfg(unix)]
fn 设置文件是_0600() {
    use std::os::unix::fs::PermissionsExt;
    let 路径 = 临时目录("mode").join("image-upload.toml");
    写文件(&路径, &上传设置::default()).unwrap();
    let 模式 = std::fs::metadata(&路径).unwrap().permissions().mode() & 0o777;
    assert_eq!(模式, 0o600, "上传设置文件权限成了 {模式:o}，里面会有 token");

    // 覆盖写也还是 0600（`truncate(true)` 不改 mode，这条钉住它）。
    写文件(&路径, &配好了("https://a/b")).unwrap();
    let 模式 = std::fs::metadata(&路径).unwrap().permissions().mode() & 0o777;
    assert_eq!(模式, 0o600, "第二次写之后权限变成了 {模式:o}");
}

/* ── 请求头那一栏 ──────────────────────────────────────────────────────── */

#[test]
fn 请求头一行一条() {
    let 头 = 解析请求头(
        "# 这一行是注释\n\
         \n\
         Authorization: Bearer a:b:c\n\
         X-Api-Key:   有空格的值  \n",
    )
    .unwrap();
    assert_eq!(
        头,
        vec![
            // ⚠️ 值里可以有冒号（按**第一个**冒号切）：Bearer 里的冒号很常见，
            // 按最后一个切会把 `Bearer a:b` 切成 `Bearer a` + `b`。
            ("Authorization".to_string(), "Bearer a:b:c".to_string()),
            ("X-Api-Key".to_string(), "有空格的值".to_string()),
        ]
    );
}

#[test]
fn 写坏的请求头要说清楚是第几行() {
    let e = 解析请求头("Authorization: ok\n这不是一行头\n").unwrap_err();
    let 话 = e.to_string();
    assert!(话.contains("第 2 行"), "要说清是第几行：{话}");
    // 冒号前空着、冒号后空着，都要挡下来（空值的头会让请求本身变形）。
    assert!(解析请求头(": v\n").is_err());
    assert!(解析请求头("A:\n").is_err());
}

#[test]
fn 自己算的头不许用户写() {
    // 这三个头写错了，请求会以另一种方式坏掉，而现场离"你在设置里多写了一行"
    // 很远——所以当场报错，不静默丢掉。
    for 禁 in ["Content-Length: 12", "Host: 别处.example", "Transfer-Encoding: chunked"] {
        let s = 上传设置 {
            headers: 禁.to_string(),
            ..配好了("https://a/b")
        };
        let 话 = 校验(&s, false).unwrap_err().to_string();
        assert!(话.contains("不许写"), "「{禁}」该被挡下，实际是：{话}");
    }
    // ⚠️ `content-type` **不在**禁令里：它是有正当用途的（PUT 那一路）。
    let s = 上传设置 {
        headers: "Content-Type: application/octet-stream".to_string(),
        ..配好了("https://a/b")
    };
    assert!(校验(&s, false).is_ok(), "content-type 是用户能自己定的");
}

/// ⚠️ 头的值必须是 ASCII。这一条是**实测撞出来的**：写用例时把 token 写成
/// 「假token」，ureq 直接回了一句英文
/// `protocol: authorization header is not a string`——用户看到那句话，
/// 想不到问题在自己填的那一栏里。
#[test]
fn 请求头的值不许是中文() {
    let s = 上传设置 {
        headers: "Authorization: Bearer 假token".to_string(),
        ..配好了("https://a/b")
    };
    let 话 = 校验(&s, false).unwrap_err().to_string();
    assert!(话.contains("ASCII") && 话.contains("Authorization"), "实际是：{话}");

    // 名字不合法（有空格）也要在 Nota 这一层挡住，别让 http crate 去报英文。
    let s = 上传设置 {
        headers: "X Api Key: v".to_string(),
        ..配好了("https://a/b")
    };
    assert!(校验(&s, false).unwrap_err().to_string().contains("合法的请求头名字"));

    // 正常的（Bearer + Base64 那种 token）要放行。
    let s = 上传设置 {
        headers: "Authorization: Bearer sk-abc.DEF_123-xyz\nX-Api-Key: aGVsbG8=".to_string(),
        ..配好了("https://a/b")
    };
    assert!(校验(&s, false).is_ok());
}

/* ── 校验 ──────────────────────────────────────────────────────────────── */

#[test]
fn 没配好时每一条都有一句人话() {
    let 空 = 上传设置::default();
    assert!(校验(&空, false).unwrap_err().to_string().contains("没打开"));

    let 没地址 = 上传设置 {
        enabled: true,
        ..Default::default()
    };
    assert!(校验(&没地址, false).unwrap_err().to_string().contains("没填地址"));

    let 不是网址 = 配好了("/home/我/图.png");
    let 话 = 校验(&不是网址, false).unwrap_err().to_string();
    assert!(话.contains("http/https"), "实际是：{话}");
}

#[test]
fn 网络图片加_put_是明确报错() {
    let s = 上传设置 {
        method: 上传方法::Put,
        remote_field: "url".to_string(),
        ..配好了("https://a/b")
    };
    let 话 = 校验(&s, true).unwrap_err().to_string();
    assert!(话.contains("POST"), "要告诉用户怎么办，而不只是说不行：{话}");
    // 本地图片走 PUT 没问题。
    assert!(校验(&s, false).is_ok());
}

#[test]
fn 网络图片字段空着就不传() {
    // 这不是"没配好"，是一个正当的选择——但**要说出来**，不能假装成功。
    let s = 配好了("https://a/b");
    let 话 = 校验(&s, true).unwrap_err().to_string();
    assert!(话.contains("没有被上传"), "实际是：{话}");
}

#[test]
fn post_必须有字段名() {
    let s = 上传设置 {
        field: "  ".to_string(),
        ..配好了("https://a/b")
    };
    assert!(校验(&s, false).unwrap_err().to_string().contains("字段名"));
    // PUT 不用字段名（体就是那段字节）。
    let s = 上传设置 {
        method: 上传方法::Put,
        field: String::new(),
        ..配好了("https://a/b")
    };
    assert!(校验(&s, false).is_ok());
}

#[test]
fn 太长的项存不进去() {
    let s = 上传设置 {
        url: "x".repeat(2049),
        ..Default::default()
    };
    let 话 = 形状行吗(&s).unwrap_err().to_string();
    assert!(话.contains("服务地址"), "要说是哪一项：{话}");
    assert!(形状行吗(&上传设置::default()).is_ok());
}

/* ── 从响应里取地址 ────────────────────────────────────────────────────── */

#[test]
fn 点路径能取到真实图床那种回话() {
    let 回 = r#"{"success":true,"code":"success","data":{"url":"https://cdn.example.com/a/图.png",
       "links":{"url":"https://cdn.example.com/a/图.png"},"id":42,
       "list":[{"url":"https://cdn.example.com/b.png"}]}}"#;
    let v: serde_json::Value = serde_json::from_str(回).unwrap();

    assert_eq!(
        点路径取值(&v, "data.url").unwrap(),
        "https://cdn.example.com/a/图.png"
    );
    assert_eq!(
        点路径取值(&v, "data.links.url").unwrap(),
        "https://cdn.example.com/a/图.png"
    );
    // 数字也能取出来（`{"id":42}` → "42"）。
    assert_eq!(点路径取值(&v, "data.id").unwrap(), "42");
    // ⚠️ 数组下标：`{"list":[{"url":…}]}` 这种回法在真实图床里很常见。
    assert_eq!(
        点路径取值(&v, "data.list.0.url").unwrap(),
        "https://cdn.example.com/b.png"
    );
    // 取不到就是取不到，不是空串。
    assert!(点路径取值(&v, "data.没有这个").is_none());
    assert!(点路径取值(&v, "data.url.deeper").is_none(), "在字符串上再往下走要当取不到");
    assert!(点路径取值(&v, "data.").is_none(), "空的一段当没写对");
    // `null` 是"这儿什么都没有"，不是字符串 "null"。
    let n: serde_json::Value = serde_json::from_str(r#"{"data":{"url":null}}"#).unwrap();
    assert!(点路径取值(&n, "data.url").is_none());
}

#[test]
fn 从响应取地址认三种回法() {
    // ① 最常见的：JSON 里某一条路径
    assert_eq!(
        从响应取地址(r#"{"data":{"url":"https://a/x.png"}}"#, "data.url").unwrap(),
        "https://a/x.png"
    );
    // ② 路径留空 = 整个体本身就是那条地址（纯文本接口）。前后空白要去掉。
    assert_eq!(
        从响应取地址("  https://a/x.png\n", "").unwrap(),
        "https://a/x.png"
    );
    // ③ 路径留空、但体是一个 **JSON 字符串**（`"https://…"` 带引号）。
    // 这种接口真实存在，而它没有"路径"可填——所以空路径这一支要认得它。
    assert_eq!(
        从响应取地址(r#""https://a/x.png""#, "").unwrap(),
        "https://a/x.png"
    );
}

/// ⚠️ 这一条是**安全用例**：取出来的东西要真是一条地址，否则就是把服务器回的
/// 一段话写进用户的文档（或者一个 `javascript:` 之类的怪东西）。
#[test]
fn 取出来不是地址就不写进文档() {
    // JSON 里有那一格，但内容不是地址。
    let e = 从响应取地址(r#"{"data":{"url":"上传失败：token 无效"}}"#, "data.url");
    assert!(e.is_err(), "不该把一句错误话当地址写进文档");
    assert!(e.unwrap_err().to_string().contains("不是一条 http/https 地址"));

    // 整个体是纯文本且不是地址。
    assert!(从响应取地址("error: nope", "").is_err());
    // `javascript:` 那种也被挡下（是网络地址的判据只认 http/https）。
    assert!(从响应取地址("javascript:alert(1)", "").is_err());

    // 路径填了、但回的不是 JSON：报错要说清"你填了路径，所以按 JSON 读"。
    let 话 = 从响应取地址("<html>502</html>", "data.url")
        .unwrap_err()
        .to_string();
    assert!(话.contains("不是 JSON"), "实际是：{话}");

    // 路径填了、JSON 也对，就是没有那一格：把回话带上（用户要照着改路径）。
    let 话 = 从响应取地址(r#"{"result":{"img":"https://a/x.png"}}"#, "data.url")
        .unwrap_err()
        .to_string();
    assert!(话.contains("data.url") && 话.contains("result"), "实际是：{话}");
}

/// ⚠️ 错误话里的回话要**压成一行、限长**：服务器回一整页 HTML 时，
/// 原样塞进提示条就是"界面坏了"的样子。
#[test]
fn 报错里的回话要压行限长() {
    let 长 = format!("<html>\n{}\n</html>", "x".repeat(2000));
    let 话 = 从响应取地址(&长, "data.url").unwrap_err().to_string();
    assert!(!话.contains('\n'), "提示条里不该出现换行：{话}");
    assert!(话.chars().count() < 600, "回话要截断：{}", 话.chars().count());
}

/* ── front matter 里那个键 ─────────────────────────────────────────────── */

#[test]
fn 前件里的键只认写对的那几种写法() {
    let 有 = |v: &str| format!("---\ntitle: 笔记\n{自动上传键}: {v}\n---\n正文\n");
    for 值 in ["true", "TRUE", "Yes", "on", "\"true\"", "'true'"] {
        assert!(前件开着吗(&有(值)), "「{值}」该算开着");
    }
    for 值 in ["false", "no", "off", "1", "是", "", "maybe"] {
        assert!(!前件开着吗(&有(值)), "「{值}」不该算开着");
    }
}

#[test]
fn 前件的边界与标题那边一致() {
    // 必须在文件最开头：前面有空行 / 有正文，就不是 front matter。
    assert!(!前件开着吗(&format!("\n---\n{自动上传键}: true\n---\n")));
    assert!(!前件开着吗(&format!("正文\n---\n{自动上传键}: true\n---\n")));
    // 前件之外的那个键不算（正文里写一行同样的字）。
    assert!(!前件开着吗(&format!("---\ntitle: x\n---\n{自动上传键}: true\n")));
    // `...` 结尾是合法的 front matter 结束符（与 `front_matter_title` 一条口径）：
    // 键写在 `...` 之前就该生效。
    assert!(前件开着吗(&format!("---\n{自动上传键}: yes\n...\n")));
    // ⚠️ 缩进也算（YAML 的顶层键允许前面有空格）。这一条是**刻意放宽**的：
    // 判据窄一点会让"我把键对齐了一下"变成"上传不生效"，而那个症状是静默的。
    assert!(前件开着吗(&format!("---\n  {自动上传键}: true\n---\n")));
    // 前缀更长/更短的键都不算（`strip_prefix` 之后再要求一个冒号）。
    assert!(!前件开着吗("---\nnota-auto-upload-extra: true\n---\n"));
    assert!(!前件开着吗("---\nauto-upload: true\n---\n"));
    // 注释行不算：它是给人看的，不是开关。
    assert!(!前件开着吗(&format!("---\n# {自动上传键}: true\n---\n")));
}

/* ── 多部件体 ──────────────────────────────────────────────────────────── */

#[test]
fn 多部件体的字节排布是对的() {
    let 边界 = "----NotaBoundary测试";
    let 体 = 多部件体_文件(边界, "file", "图.png", "image/png", &[0x89, 0x50, 0x4e, 0x47]);
    let 文本 = String::from_utf8_lossy(&体).to_string();

    // ⚠️ 换行必须是 CRLF：用 `\n` 的话 PHP 那一系会把整个体当成一个字段。
    assert!(文本.starts_with(&format!("--{边界}\r\n")), "开头不对：{文本}");
    assert!(文本.ends_with(&format!("--{边界}--\r\n")), "结尾不对：{文本}");
    assert!(!文本.contains("\n\n"), "不许出现光秃秃的 LF 换行");
    assert!(文本.contains("Content-Disposition: form-data; name=\"file\""));
    assert!(文本.contains("Content-Type: image/png"));
    // ⚠️ 中文文件名要**两个都给**：`filename="…"`（老服务器）+ RFC 5987 的
    // `filename*=UTF-8''…`（新服务器）。只给后者的话，按 RFC 2616 读的服务器
    // 会拿到一个没有文件名的部件。
    assert!(文本.contains("filename=\"图.png\""), "实际是：{文本}");
    assert!(
        文本.contains("filename*=UTF-8''%E5%9B%BE.png"),
        "非 ASCII 文件名要给 RFC 5987 那一份：{文本}"
    );
    // 字节原样在体里（一个字节都不许动）。
    assert!(体.windows(4).any(|w| w == [0x89, 0x50, 0x4e, 0x47]));
    // 边界出现两次：一次开头、一次收尾（收尾那个后面多两个 `-`）。
    assert_eq!(文本.matches(&format!("--{边界}")).count(), 2, "实际是：{文本}");
}

#[test]
fn 文件名里的坏字符出不了那一行() {
    // 换行/引号进到 `name="…"` 里能让服务器读到一行伪头部。
    let 体 = 多部件体_文件("B", "f", "a\"b\r\nContent-Type: text/plain", "image/png", b"x");
    let 文本 = String::from_utf8_lossy(&体).to_string();
    assert!(!文本.contains("a\"b"), "引号要换掉：{文本}");
    assert!(!文本.contains("\r\nContent-Type: text/plain"), "换行要换掉：{文本}");
    // ⚠️ 判据是"**以它开头的行**只有一行"而不是"字符串里只出现一次"：
    // 名字里那几个字被转成下划线之后仍然是普通文本，会原样留在引号中间
    // （那是无害的），但**不能**变成一行真正的头。
    let 头行数 = 文本.lines().filter(|l| l.starts_with("Content-Type:")).count();
    assert_eq!(头行数, 1, "体里冒充出了一行头：{文本}");
}

#[test]
fn 内容类型按后缀猜() {
    assert_eq!(内容类型("a.png"), "image/png");
    assert_eq!(内容类型("a.JPG"), "image/jpeg");
    assert_eq!(内容类型("a.jpeg"), "image/jpeg");
    assert_eq!(内容类型("a.webp"), "image/webp");
    assert_eq!(内容类型("a.svg"), "image/svg+xml");
    assert_eq!(内容类型("a.avif"), "image/avif");
    assert_eq!(内容类型("a.不认得"), "application/octet-stream");
    assert_eq!(内容类型("没有后缀"), "application/octet-stream");
}

/* ── 真发一次（回环服务器）────────────────────────────────────────────── */

/// 一个只服务一次请求的最小 HTTP 服务器。
///
/// ⚠️ 绑 `127.0.0.1:0`（端口由内核给）：写死端口的话，两个 `cargo test`
/// 同时跑就会有一个 `AddrInUse` 而红——而那看起来像代码坏了。
/// 返回（基地址，收到的那份原始请求字节）。
fn 起个服务器(状态行: &'static str, 回话: &'static str) -> (String, Receiver<Vec<u8>>) {
    let 监听 = TcpListener::bind("127.0.0.1:0").expect("绑回环端口");
    let 地址 = format!("http://{}", 监听.local_addr().unwrap());
    let (发, 收) = std::sync::mpsc::channel();
    std::thread::spawn(move || {
        let Ok((mut 流, _)) = 监听.accept() else {
            return;
        };
        let _ = 流.set_read_timeout(Some(Duration::from_secs(10)));
        let 请求 = 读一个请求(&mut 流);
        let _ = 发.send(请求);
        let 回 = format!(
            "{状态行}\r\nContent-Type: application/json\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{回话}",
            回话.len()
        );
        let _ = 流.write_all(回.as_bytes());
        let _ = 流.flush();
    });
    (地址, 收)
}

/// 读一个完整的请求（头 + `Content-Length` 说的那么多体）。
fn 读一个请求(流: &mut std::net::TcpStream) -> Vec<u8> {
    let mut 全部 = Vec::new();
    let mut buf = [0u8; 8192];
    loop {
        let n = 流.read(&mut buf).unwrap_or(0);
        if n == 0 {
            break;
        }
        全部.extend_from_slice(&buf[..n]);
        if let Some(p) = 找双换行(&全部) {
            let 头 = String::from_utf8_lossy(&全部[..p]).to_string();
            let 长 = 头
                .lines()
                .find_map(|l| {
                    let (k, v) = l.split_once(':')?;
                    if k.eq_ignore_ascii_case("content-length") {
                        v.trim().parse::<usize>().ok()
                    } else {
                        None
                    }
                })
                .unwrap_or(0);
            if 全部.len() - (p + 4) >= 长 {
                break;
            }
        }
    }
    全部
}

fn 找双换行(bs: &[u8]) -> Option<usize> {
    bs.windows(4).position(|w| w == b"\r\n\r\n")
}

/// 请求头里某一项的值。
fn 头里(请求: &str, 名: &str) -> Option<String> {
    请求.lines().find_map(|l| {
        let (k, v) = l.split_once(':')?;
        if k.eq_ignore_ascii_case(名) {
            Some(v.trim().to_string())
        } else {
            None
        }
    })
}

/// POST 那条路的**真一次往返**：拼体 → 发 → 从响应里取地址。
///
/// 这一条是这次改动最值得留下的证据：它证明多部件体的字节排布、请求头的处理、
/// 点路径取地址三件事**接得上**（前面那些纯函数用例只证明各自对）。
#[test]
fn post_真发一次能拿回地址() {
    let (基地址, 收) = 起个服务器(
        "HTTP/1.1 200 OK",
        r#"{"success":true,"data":{"url":"https://cdn.example.com/图.png"}}"#,
    );
    // ⚠️ 请求头的值必须是 ASCII（HTTP 的规矩），所以这里的 token 是编的一段
    // ASCII：**不是任何真的密钥**。
    let s = 上传设置 {
        headers: "# 用户自己的头（用例里是编的）\nAuthorization: Bearer fake-token-0123456789"
            .to_string(),
        ..配好了(&基地址)
    };

    // 开头两个字节故意不是合法 UTF-8（PNG 的魔数）：体里的字节**一个都不许动**，
    // 而"动过一字节"在图片上的表现是"服务器收下了、打开是坏的"。
    let mut 图片: Vec<u8> = vec![0x89, 0x50];
    图片.extend_from_slice("假字节".as_bytes());

    let url = 传一次(
        &s,
        传什么::本地 {
            字节: 图片.clone(),
            文件名: "图.png".to_string(),
        },
    )
    .unwrap();
    assert_eq!(url, "https://cdn.example.com/图.png");

    let 原始 = 收.recv_timeout(Duration::from_secs(10)).expect("服务器没收到请求");
    let 头结束 = 找双换行(&原始).expect("请求没有头");
    let 头 = String::from_utf8_lossy(&原始[..头结束]).to_string();
    let 体 = &原始[头结束 + 4..];

    assert!(头.starts_with("POST "), "方法不对：{头}");
    assert_eq!(
        头里(&头, "authorization").as_deref(),
        Some("Bearer fake-token-0123456789"),
        "用户写的请求头要真的发出去（token 就在这儿）"
    );
    assert!(
        头里(&头, "user-agent").is_some_and(|v| v.starts_with("Nota/")),
        "要自报家门：{头}"
    );
    // ⚠️ 请求头**不许出现两次**：同名两行会让一部分服务器只认第一行，
    // 而"我明明配了 token"的现场离这里很远。
    assert_eq!(
        头.lines().filter(|l| l.to_lowercase().starts_with("authorization:")).count(),
        1
    );
    assert_eq!(
        头.lines().filter(|l| l.to_lowercase().starts_with("content-type:")).count(),
        1
    );

    let 内容类型 = 头里(&头, "content-type").expect("没有 content-type");
    assert!(内容类型.starts_with("multipart/form-data; boundary="), "实际是：{内容类型}");
    let 边界 = 内容类型.split("boundary=").nth(1).unwrap().to_string();

    let mut 期望 = Vec::new();
    期望.extend_from_slice(format!("--{边界}\r\n").as_bytes());
    期望.extend_from_slice(b"Content-Disposition: form-data; name=\"file\"; filename=\"");
    期望.extend_from_slice("图.png".as_bytes());
    期望.extend_from_slice(b"\"");
    // ⚠️ 中文文件名那一份也要给（`filename*=UTF-8''…`），与 `多部件体的字节排布`
    // 那一条同一条口径——这里再钉一次是因为这条走的是**真的线路**。
    期望.extend_from_slice(b"; filename*=UTF-8''%E5%9B%BE.png");
    期望.extend_from_slice(b"\r\nContent-Type: image/png\r\n\r\n");
    期望.extend_from_slice(&图片);
    期望.extend_from_slice(format!("\r\n--{边界}--\r\n").as_bytes());
    assert_eq!(
        体, 期望.as_slice(),
        "真的发出去的体不是那一条（实际收到：{}）",
        String::from_utf8_lossy(体)
    );
}

/// PUT 那条路：裸字节 + 用户自填的 `content-type` **优先**（没填才按后缀猜）。
#[test]
fn put_发的是裸字节而且用户的内容类型优先() {
    let (基地址, 收) = 起个服务器("HTTP/1.1 200 OK", "https://cdn.example.com/x.png");
    let s = 上传设置 {
        method: 上传方法::Put,
        // 路径留空 = 整个响应体就是地址
        url_path: String::new(),
        headers: "Content-Type: application/octet-stream".to_string(),
        ..配好了(&基地址)
    };
    let url = 传一次(
        &s,
        传什么::本地 {
            字节: vec![1, 2, 3, 4],
            文件名: "x.png".to_string(),
        },
    )
    .unwrap();
    assert_eq!(url, "https://cdn.example.com/x.png");

    let 原始 = 收.recv_timeout(Duration::from_secs(10)).unwrap();
    let 头结束 = 找双换行(&原始).unwrap();
    let 头 = String::from_utf8_lossy(&原始[..头结束]).to_string();
    let 体 = &原始[头结束 + 4..];
    assert!(头.starts_with("PUT "), "方法不对：{头}");
    assert_eq!(
        头里(&头, "content-type").as_deref(),
        Some("application/octet-stream"),
        "用户自填的 content-type 要优先（没填才按后缀猜）"
    );
    assert_eq!(体, &[1, 2, 3, 4], "PUT 发的是裸字节，不是 multipart");
}

/// 没填 `content-type` 时按后缀猜。
#[test]
fn put_没填内容类型就按后缀猜() {
    let (基地址, 收) = 起个服务器("HTTP/1.1 200 OK", "https://cdn.example.com/x.png");
    let s = 上传设置 {
        method: 上传方法::Put,
        url_path: String::new(),
        ..配好了(&基地址)
    };
    传一次(
        &s,
        传什么::本地 {
            字节: vec![1],
            文件名: "x.png".to_string(),
        },
    )
    .unwrap();
    let 原始 = 收.recv_timeout(Duration::from_secs(10)).unwrap();
    let 头 = String::from_utf8_lossy(&原始[..找双换行(&原始).unwrap()]).to_string();
    assert_eq!(头里(&头, "content-type").as_deref(), Some("image/png"));
}

/// 网络图片：**Nota 不下载它**，只把原地址当一个表单字段发出去。
#[test]
fn 网络图片发的是原地址而不是字节() {
    let (基地址, 收) = 起个服务器(
        "HTTP/1.1 200 OK",
        r#"{"data":{"url":"https://cdn.example.com/取回来的.png"}}"#,
    );
    let s = 上传设置 {
        remote_field: "source_url".to_string(),
        ..配好了(&基地址)
    };
    let url = 传一次(
        &s,
        传什么::网络 {
            原地址: "https://别人.example/a.png".to_string(),
        },
    )
    .unwrap();
    assert_eq!(url, "https://cdn.example.com/取回来的.png");

    let 原始 = 收.recv_timeout(Duration::from_secs(10)).unwrap();
    let 头结束 = 找双换行(&原始).unwrap();
    let 体 = String::from_utf8_lossy(&原始[头结束 + 4..]).to_string();
    assert!(
        体.contains("name=\"source_url\""),
        "字段名要按设置里的来：{体}"
    );
    assert!(
        体.contains("https://别人.example/a.png"),
        "原地址要原样发过去：{体}"
    );
    assert!(
        !体.contains("filename="),
        "网络图片那条路上**没有文件部件**（Nota 不下载它）：{体}"
    );
    // 头里也不能出现"Nota 先去取了一次"的痕迹——那条路根本不该有第二个请求。
    let 头 = String::from_utf8_lossy(&原始[..头结束]).to_string();
    assert_eq!(头.matches("POST ").count(), 1, "只发了一个请求：{头}");
}

/// 服务器拒绝时：错误里要有**状态码**与**它回的那句话**——那才是用户要看的线索。
#[test]
fn 服务器拒绝时把状态码和回话带上() {
    let (基地址, _收) = 起个服务器("HTTP/1.1 401 Unauthorized", r#"{"message":"token invalid"}"#);
    let 话 = 传一次(
        &配好了(&基地址),
        传什么::本地 {
            字节: vec![1, 2],
            文件名: "x.png".to_string(),
        },
    )
    .unwrap_err()
    .to_string();
    assert!(话.contains("401"), "要带状态码：{话}");
    assert!(话.contains("token invalid"), "要带服务器那句话：{话}");
    // ⚠️ 错误文案里**绝不能**出现请求头（那里面有用户的 token）。
    assert!(!话.contains("Authorization"), "错误话里不该回显请求头：{话}");
}
