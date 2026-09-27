//! `image` 这一块的用例（2026-09-26 从 `image.rs` 拆出来）。
//!
//! 它们**按功能分组**，不按子模块分组：多数用例走的是"算计划 + 落地"这一整条
//! 路（那正是调用方走的路），硬按文件切开反而会测不到接口之间那一段。
//!
//! ⚠️ 这里只直接调了一条私有函数（`从地址猜名字`），它为此是 `pub(super)`。
//! 其余一律走公开接口——**用例能碰到私有实现的时候，重构就开始被用例绑住**。

use std::path::{Path, PathBuf};

use crate::error::{NotaError, Result};

use super::target::从地址猜名字;
use super::*;
use crate::settings::image::InsertImageAction as A;

fn 默认规则() -> 规则 {
    规则 {
        action: A::None,
        apply_to_local: true,
        apply_to_remote: false,
        custom_dir: String::new(),
        prefer_relative: false,
        add_dot_slash: false,
        escape_url: false,
    }
}

fn 文档目录() -> PathBuf {
    PathBuf::from("/home/u/文档")
}

/// 只要文件名那一段（比较路径时不必写出整个临时目录）。
fn 文件名(p: &Path) -> String {
    p.file_name().unwrap().to_string_lossy().to_string()
}

// ── 地址形态 ──────────────────────────────────────────────────────────

#[test]
fn 网络地址只认_http_和_https() {
    assert!(是网络地址("https://a/b.png"));
    assert!(是网络地址("HTTP://A/B.PNG"));
    assert!(是网络地址("  http://a/b  "));
    // ⚠️ 下面这些都不是：`data:` 没有"原处"可言，`//a/b` 是协议相对地址
    // （缺协议就没法下载），本地路径当然也不是。
    assert!(!是网络地址("data:image/png;base64,AAAA"));
    assert!(!是网络地址("//cdn.example.com/a.png"));
    assert!(!是网络地址("./img/a.png"));
    assert!(!是网络地址("/home/u/a.png"));
}

#[test]
fn 转义不碰中文但会收拾空格() {
    assert_eq!(转义地址("图 片.png", false), "图%20片.png");
    assert_eq!(转义地址("a\"b.png", false), "a%22b.png");
    assert_eq!(转义地址("a<b>c.png", false), "a%3Cb%3Ec.png");
    assert_eq!(转义地址("带`反引号`.png", false), "带%60反引号%60.png");
    // 中文、日文、emoji 一律原样：转成 %E4%B8%AD 之后文档里的地址没法看。
    assert_eq!(转义地址("笔记-①🍎.png", false), "笔记-①🍎.png");
}

#[test]
fn 已经编码过的地址不会再被转一遍() {
    // ⚠️⚠️ 这条是本文件最容易写错的一处：把 `%20` 里的 `%` 再转一次会得到
    // `%2520`，也就是**把一条好地址改坏**。用户贴进来的地址多半是已经
    // 编码好的，所以这个错会天天发生。
    assert_eq!(转义地址("a%20b.png", false), "a%20b.png");
    assert_eq!(转义地址("a%2Fb.png", false), "a%2Fb.png");
    // 落单的 `%`（不是编码）要转——它在 Markdown 里是个裸的百分号。
    assert_eq!(转义地址("100%.png", false), "100%25.png");
    assert_eq!(转义地址("100%zz.png", false), "100%25zz.png");
    // 网络地址整段不碰 `%`：不猜它编没编过。
    assert_eq!(转义地址("https://a/100%.png", true), "https://a/100%.png");
}

#[test]
fn 网络地址里的问号井号是定界符不能转() {
    // `?v=2` 是查询串、`#p3` 是锚点，转掉之后服务器多半还会 200（有的会 404），
    // 症状是"图片有时候显示有时候不显示"——最难查的那种。
    let u = "https://a/b.png?v=2#p3";
    assert_eq!(转义地址(u, true), u);
    // 本地文件名里的 `?` `#` 是普通字符，照转：它们在 Markdown 里会截断地址。
    assert_eq!(转义地址("图?片.png", false), "图%3F片.png");
    assert_eq!(转义地址("图#1.png", false), "图%231.png");
}

#[test]
fn 相对路径会往上退() {
    // 同一个目录里：只是一条文件名。
    assert_eq!(
        相对路径(Path::new("/a/b"), Path::new("/a/b/c.png")).unwrap(),
        "c.png"
    );
    // 子目录。
    assert_eq!(
        相对路径(Path::new("/a/b"), Path::new("/a/b/img/c.png")).unwrap(),
        "img/c.png"
    );
    // 退一级（`$(filename).assets` 那种跨目录的场合）。
    assert_eq!(
        相对路径(Path::new("/a/b"), Path::new("/a/c.png")).unwrap(),
        "../c.png"
    );
    // 退三级（`/a/b/c` 要退回根，再往下走 `x/y.png`）。
    assert_eq!(
        相对路径(Path::new("/a/b/c"), Path::new("/x/y.png")).unwrap(),
        "../../../x/y.png"
    );
    // ⚠️ 分隔符一律 `/`：Windows 的反斜杠在 Markdown 里是转义符。
    assert!(!相对路径(Path::new("/a/b"), Path::new("/a/b/c.png"))
        .unwrap()
        .contains('\\'));
}

#[test]
fn 相对路径算不了就给空() {
    // 有一边不是绝对路径就算不了——宁可不换算，也不能猜。
    assert!(相对路径(Path::new("a/b"), Path::new("/a/b/c.png")).is_none());
    assert!(相对路径(Path::new("/a/b"), Path::new("c.png")).is_none());
}

#[test]
fn 要读的路径按文档目录定() {
    let 目录 = 文档目录(); // /home/u/文档
    // 绝对路径原样——用户写全了就是他说的那个文件。
    assert_eq!(
        定本地文件(Path::new("/tmp/图.png"), Some(&目录)),
        PathBuf::from("/tmp/图.png")
    );
    // 相对路径拿文档目录当基准：这正是"用户写的是相对路径"的那个含义。
    // ⚠️ 不能拿这条路径直接去 `std::fs::read`（进程的工作目录是另一回事）。
    assert_eq!(
        定本地文件(Path::new("图.png"), Some(&目录)),
        PathBuf::from("/home/u/文档/图.png")
    );
    assert_eq!(
        定本地文件(Path::new("img/图.png"), Some(&目录)),
        PathBuf::from("/home/u/文档/img/图.png")
    );
    // ⚠️ 文档还没存盘（没有目录）时**原样返回**：读不到时那句报错里带的就是
    // 用户自己写的那个路径，他认得。换成拼接出来的东西反而找不着北。
    assert_eq!(
        定本地文件(Path::new("图.png"), None),
        PathBuf::from("图.png")
    );
}

#[test]
fn 点点斜杠只加在没点开头的前面() {
    assert_eq!(加点点斜杠("assets/a.png"), "./assets/a.png");
    assert_eq!(加点点斜杠("a.png"), "./a.png");
    // 已经是 `.` / `..` 开头的原样——`./../a.png` 没人这么写。
    assert_eq!(加点点斜杠("./a.png"), "./a.png");
    assert_eq!(加点点斜杠("../a.png"), "../a.png");
}

// ── 目标目录 ──────────────────────────────────────────────────────────

#[test]
fn 五个动作各自的落点() {
    let 目录 = Some(文档目录());
    let d = 目录.as_deref();
    assert_eq!(目标目录(A::None, d, Some("笔记"), "").unwrap(), None);
    assert_eq!(
        目标目录(A::CopyToCurrentDir, d, Some("笔记"), "").unwrap(),
        Some(PathBuf::from("/home/u/文档"))
    );
    assert_eq!(
        目标目录(A::CopyToAssets, d, Some("笔记"), "").unwrap(),
        Some(PathBuf::from("/home/u/文档/assets"))
    );
    // `$(filename)` 取的是**文档名**（不带扩展名）。
    assert_eq!(
        目标目录(A::CopyToDocAssets, d, Some("笔记"), "").unwrap(),
        Some(PathBuf::from("/home/u/文档/笔记.assets"))
    );
}

#[test]
fn 没存盘的文档做不了复制动作() {
    // ⚠️ 这条盯的是"猜一个目录"：没存盘的文档没有"它旁边"这回事，
    // 猜出来的（当前工作目录、主目录）会在用户下次存盘时变成一个
    // 谁也想不到的地方多出一堆图片。
    for a in [A::CopyToCurrentDir, A::CopyToAssets, A::CopyToDocAssets] {
        let e = 目标目录(a, None, None, "").unwrap_err();
        assert!(
            e.to_string().contains("还没存过盘"),
            "报错要说清是「文档没存盘」：{e}"
        );
    }
    // 「指定路径」分两种：**绝对**路径不依赖文档在哪，没存盘也能用；
    // 相对路径要靠文档目录，没存盘就报错（同一个理由）。
    assert_eq!(
        目标目录(A::CopyToCustom, None, None, "/tmp/图").unwrap(),
        Some(PathBuf::from("/tmp/图"))
    );
    let e = 目标目录(A::CopyToCustom, None, None, "../图").unwrap_err();
    assert!(e.to_string().contains("还没存过盘"), "实际是：{e}");
}

#[test]
fn 指定路径空着就报错不猜() {
    let e = 目标目录(A::CopyToCustom, Some(&文档目录()), Some("笔记"), "").unwrap_err();
    assert!(e.to_string().contains("还没填"), "实际是：{e}");
}

#[test]
fn 指定路径相对时按文档目录算() {
    // ⚠️ 不按进程的工作目录算：那是应用自己的启动目录，跟用户看着的
    // 那个文件夹没有关系，写出来会莫名其妙。
    assert_eq!(
        目标目录(A::CopyToCustom, Some(&文档目录()), Some("笔记"), "../图").unwrap(),
        Some(PathBuf::from("/home/u/文档/../图"))
    );
    assert_eq!(
        目标目录(A::CopyToCustom, Some(&文档目录()), Some("笔记"), "/data/图").unwrap(),
        Some(PathBuf::from("/data/图"))
    );
}

// ── 定名 ──────────────────────────────────────────────────────────────

#[test]
fn 同内容不重复写() {
    let 目录 = std::env::temp_dir().join("nota-image-定名");
    let _ = std::fs::remove_dir_all(&目录);
    std::fs::create_dir_all(&目录).unwrap();

    let (第一, 要写) = 定名(&目录, "a.png", Some("内容".as_bytes()));
    assert!(要写);
    std::fs::write(&第一, "内容".as_bytes()).unwrap();

    // 同一份内容再来一次 → 还是那个路径，而且**不用写**。
    let (第二, 要写) = 定名(&目录, "a.png", Some("内容".as_bytes()));
    assert_eq!(第二, 第一);
    assert!(!要写, "同内容不该再写一遍");

    // 内容不同 → 换一个名字，不覆盖用户已经有的那份。
    let (第三, 要写) = 定名(&目录, "a.png", Some("别的".as_bytes()));
    assert_eq!(文件名(&第三), "a-1.png");
    assert!(要写);

    let _ = std::fs::remove_dir_all(&目录);
}

#[test]
fn 名字里的路径与怪字符会被剔掉() {
    let 目录 = std::env::temp_dir().join("nota-image-名字");
    // ⚠️ 只定名不写盘，所以目录不存在也没关系——`定名` 不建目录。
    let (p, _) = 定名(&目录, "../../etc/passwd", None);
    assert_eq!(文件名(&p), "passwd");
    let (p, _) = 定名(&目录, "a<b>c:d.png", None);
    assert_eq!(文件名(&p), "abc d.png".replace(' ', ""));
    // 全被剔光的（只有点和斜杠）→ 退回一个能用的名字。
    let (p, _) = 定名(&目录, "/...", None);
    assert_eq!(文件名(&p), "image.png");
}

#[test]
fn 从地址猜名字取末段或摘要() {
    assert_eq!(
        从地址猜名字("https://a/b/c.png"),
        "c.png",
        "正常地址取末段"
    );
    // 查询串不算名字的一部分。
    assert_eq!(从地址猜名字("https://a/c.png?x=1"), "c.png");
    // 末段没有后缀（图床常见）→ 补一个 .png，否则双击打不开。
    let 名 = 从地址猜名字("https://a/img/12345");
    assert!(名.starts_with("image-") && 名.ends_with(".png"), "实际是：{名}");
}

// ── 算计划（纯函数，五个动作 × 三个来源） ──────────────────────────────

#[test]
fn 默认设置下什么都不动() {
    // ⚠️ 这条是最重要的一条：**出厂设置不许碰用户的磁盘**。
    let r = 默认规则();
    let p = 算计划(
        &来源::本地文件(PathBuf::from("/home/u/图片/截屏.png")),
        &r,
        Some(&文档目录()),
        Some("笔记"),
    )
    .unwrap();
    assert_eq!(
        p,
        计划::不动 {
            地址: "/home/u/图片/截屏.png".to_string()
        }
    );
    // 用户自己写的相对路径**原样保留**，不许换算成绝对路径。
    let p = 算计划(
        &来源::本地文件(PathBuf::from("./img/a.png")),
        &r,
        Some(&文档目录()),
        Some("笔记"),
    )
    .unwrap();
    assert_eq!(
        p,
        计划::不动 {
            地址: "./img/a.png".to_string()
        }
    );
}

#[test]
fn 优先相对路径只朝一个方向动() {
    let mut r = 默认规则();
    r.prefer_relative = true;
    // 绝对 → 相对（这是这一项唯一的用处）。
    let p = 算计划(
        &来源::本地文件(PathBuf::from("/home/u/文档/图/a.png")),
        &r,
        Some(&文档目录()),
        Some("笔记"),
    )
    .unwrap();
    assert_eq!(
        p,
        计划::不动 {
            地址: "图/a.png".to_string()
        }
    );
    // 本来就是相对的 → 原样（反方向不动）。
    let p = 算计划(
        &来源::本地文件(PathBuf::from("../图/a.png")),
        &r,
        Some(&文档目录()),
        Some("笔记"),
    )
    .unwrap();
    assert_eq!(
        p,
        计划::不动 {
            地址: "../图/a.png".to_string()
        }
    );
    // `./` 前缀只加在相对路径上。
    r.add_dot_slash = true;
    let p = 算计划(
        &来源::本地文件(PathBuf::from("/home/u/文档/图/a.png")),
        &r,
        Some(&文档目录()),
        Some("笔记"),
    )
    .unwrap();
    assert_eq!(
        p,
        计划::不动 {
            地址: "./图/a.png".to_string()
        }
    );
}

#[test]
fn 复制到_assets_的计划() {
    let mut r = 默认规则();
    r.action = A::CopyToAssets;
    let p = 算计划(
        &来源::本地文件(PathBuf::from("/home/u/图片/截屏.png")),
        &r,
        Some(&文档目录()),
        Some("笔记"),
    )
    .unwrap();
    assert_eq!(
        p,
        计划::复制 {
            从: PathBuf::from("/home/u/图片/截屏.png"),
            到: PathBuf::from("/home/u/文档/assets"),
        }
    );
}

#[test]
fn 开关关掉就不动手() {
    let mut r = 默认规则();
    r.action = A::CopyToAssets;

    // 本地那张的开关关掉 → 不动。
    r.apply_to_local = false;
    let p = 算计划(
        &来源::本地文件(PathBuf::from("/home/u/图片/截屏.png")),
        &r,
        Some(&文档目录()),
        Some("笔记"),
    )
    .unwrap();
    assert!(matches!(p, 计划::不动 { .. }));

    // ⚠️ 网络那张的开关**默认就是关的**（联网动作要用户显式同意）。
    r.apply_to_local = true;
    let p = 算计划(
        &来源::网络地址("https://a/b.png".to_string()),
        &r,
        Some(&文档目录()),
        Some("笔记"),
    )
    .unwrap();
    assert_eq!(
        p,
        计划::不动 {
            地址: "https://a/b.png".to_string()
        }
    );

    // 打开之后「复制到 assets」对网络图片的含义是**下载下来**。
    r.apply_to_remote = true;
    let p = 算计划(
        &来源::网络地址("https://a/b.png".to_string()),
        &r,
        Some(&文档目录()),
        Some("笔记"),
    )
    .unwrap();
    assert_eq!(
        p,
        计划::下载 {
            地址: "https://a/b.png".to_string(),
            到: PathBuf::from("/home/u/文档/assets"),
        }
    );
}

#[test]
fn 剪贴板必须落盘() {
    let r = 默认规则(); // 动作是「无特殊操作」
    let p = 算计划(
        &来源::剪贴板 {
            字节: b"PNG".to_vec(),
            后缀: "png".to_string(),
        },
        &r,
        Some(&文档目录()),
        Some("笔记"),
    )
    .unwrap();
    // ⚠️ 剪贴板的图**没有"原处"可指**，所以哪怕设置是「无特殊操作」也得落盘，
    // 退回 `assets`。名字是内容的摘要——同一张图永远同一个名字。
    match p {
        计划::写盘 { 到, 名字, .. } => {
            assert_eq!(到, PathBuf::from("/home/u/文档/assets"));
            assert!(名字.starts_with("image-") && 名字.ends_with(".png"), "{名字}");
            assert_eq!(名字.len(), "image-".len() + 8 + ".png".len());
        }
        other => panic!("应该是写盘：{other:?}"),
    }
}

#[test]
fn 剪贴板的后缀认不出就退回_png() {
    let r = 默认规则();
    let p = 算计划(
        &来源::剪贴板 {
            字节: b"X".to_vec(),
            后缀: "exe".to_string(),
        },
        &r,
        Some(&文档目录()),
        Some("笔记"),
    )
    .unwrap();
    match p {
        计划::写盘 { 名字, .. } => assert!(名字.ends_with(".png"), "{名字}"),
        other => panic!("应该是写盘：{other:?}"),
    }
}

// ── 落地（真的读写了磁盘） ────────────────────────────────────────────

/// 造一个干净的临时目录。返回（文档路径，目录）。
fn 造个文档(名: &str) -> (PathBuf, PathBuf) {
    let 根 = std::env::temp_dir().join(format!("nota-image-落地-{名}"));
    let _ = std::fs::remove_dir_all(&根);
    std::fs::create_dir_all(&根).unwrap();
    let 文档 = 根.join("笔记.md");
    std::fs::write(&文档, "# 笔记\n").unwrap();
    (文档, 根)
}

#[test]
fn 复制之后写的是相对路径() {
    let (_, 根) = 造个文档("复制");
    let 原图 = 根.join("截屏.png");
    std::fs::write(&原图, b"PNG-1").unwrap();

    let mut r = 默认规则();
    r.action = A::CopyToAssets;
    let 结果 = 放置(&来源::本地文件(原图.clone()), &r, Some(&根), Some("笔记")).unwrap();

    // ⚠️ 自己复制出来的那一份**一律相对路径**——整件事的意义就在于
    // "副本跟文档一起走"，写成绝对路径等于白复制（见文件头）。
    assert_eq!(结果.src, "assets/截屏.png");
    assert_eq!(结果.做了, 做了::复制);
    assert_eq!(文件名(Path::new(结果.落到.as_deref().unwrap())), "截屏.png");
    assert_eq!(std::fs::read(根.join("assets/截屏.png")).unwrap(), b"PNG-1");
    // 原图**还在**（是复制不是搬走）。
    assert!(原图.exists());

    // 再复制一次同一张 → 复用，不再写一份。
    let 再次 = 放置(&来源::本地文件(原图), &r, Some(&根), Some("笔记")).unwrap();
    assert_eq!(再次.做了, 做了::已有);
    assert_eq!(再次.src, "assets/截屏.png");

    let _ = std::fs::remove_dir_all(&根);
}

#[test]
fn 加点点斜杠与转义在复制那一支也生效() {
    let (_, 根) = 造个文档("斜杠");
    // 文件名里带空格，两个偏好都打开。
    let 原图 = 根.join("我的 图.png");
    std::fs::write(&原图, b"PNG").unwrap();

    let mut r = 默认规则();
    r.action = A::CopyToAssets;
    r.add_dot_slash = true;
    r.escape_url = true;
    let 结果 = 放置(&来源::本地文件(原图), &r, Some(&根), Some("笔记")).unwrap();
    assert_eq!(结果.src, "./assets/我的%20图.png");

    let _ = std::fs::remove_dir_all(&根);
}

#[test]
fn 下载走的是注进来的那个取网络() {
    let (_, 根) = 造个文档("下载");
    let mut r = 默认规则();
    r.action = A::CopyToAssets;
    r.apply_to_remote = true;

    let 图 = 来源::网络地址("https://cdn.example.com/img/a.png?x=1".to_string());
    let 计划 = 算计划(&图, &r, Some(&根), Some("笔记")).unwrap();
    let 好的 = |url: &str| -> Result<Vec<u8>> {
        assert_eq!(url, "https://cdn.example.com/img/a.png?x=1");
        Ok(b"PNG-DOWNLOADED".to_vec())
    };
    let 结果 = 落地(&计划, Some(&根), &r, &好的).unwrap();

    assert_eq!(结果.做了, 做了::下载);
    assert_eq!(结果.src, "assets/a.png");
    assert_eq!(
        std::fs::read(根.join("assets/a.png")).unwrap(),
        b"PNG-DOWNLOADED"
    );

    // 下载失败要把话说到（不能默默什么都不做）。
    let 坏的 = |_: &str| -> Result<Vec<u8>> { Err(NotaError::other("服务器回了 404")) };
    let 错 = 落地(&计划, Some(&根), &r, &坏的).unwrap_err();
    assert!(错.to_string().contains("404"), "实际是：{错}");

    let _ = std::fs::remove_dir_all(&根);
}

#[test]
fn 剪贴板落的盘与同内容复用() {
    let (_, 根) = 造个文档("剪贴板");
    let r = 默认规则();
    let 图 = 来源::剪贴板 {
        字节: b"PNG-CLIP".to_vec(),
        后缀: "png".to_string(),
    };
    let 计划 = 算计划(&图, &r, Some(&根), Some("笔记")).unwrap();
    let 不联网 = |_: &str| -> Result<Vec<u8>> { unreachable!("剪贴板不该联网") };
    let 一 = 落地(&计划, Some(&根), &r, &不联网).unwrap();
    let 二 = 落地(&计划, Some(&根), &r, &不联网).unwrap();
    assert_eq!(一.做了, 做了::写盘);
    assert_eq!(二.做了, 做了::已有, "同一张图连粘两次不该堆出两份文件");
    assert_eq!(一.src, 二.src);
    assert!(一.src.starts_with("assets/image-"));

    // assets 目录不存在也**要建出来**（复制到不存在的目录是常规用法）。
    assert!(根.join("assets").is_dir());

    let _ = std::fs::remove_dir_all(&根);
}

#[test]
fn 不落盘时一个字节都不写() {
    let (_, 根) = 造个文档("不动");
    let r = 默认规则();
    let 前: Vec<_> = std::fs::read_dir(&根).unwrap().collect();
    let 结果 = 放置(
        &来源::本地文件(根.join("不存在的图.png")),
        &r,
        Some(&根),
        Some("笔记"),
    )
    .unwrap();
    assert_eq!(结果.做了, 做了::留在原处);
    let 后: Vec<_> = std::fs::read_dir(&根).unwrap().collect();
    assert_eq!(前.len(), 后.len(), "「无特殊操作」不该动磁盘");
    // ⚠️ 而且**不该去读那个文件**：地址是用户给的，存不存在是渲染那一侧的事。
    // （读一下的话，插一张还没生成的图会报错——而那是完全正常的用法。）
    assert!(结果.落到.is_none());

    let _ = std::fs::remove_dir_all(&根);
}
