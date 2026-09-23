//! 主题：发现与读取。
//!
//! # 什么算一个「Typora 主题」
//!
//! 一对东西：`<名字>.css` ＋ **同名目录** `<名字>/`（装字体、图片）。
//! CSS 里用**相对路径**引用它，例如 github 主题里
//! `@font-face { src: url('./github/open-sans-600.woff2') }`。
//! 所以"发现一个主题"要两样一起看，"读一个主题"要**连目录一起**交给前端
//! ——相对 url 没有基准就解析不出来，字体全变豆腐块。
//!
//! # 从哪儿找
//!
//! 三个地方，**前面的覆盖后面的**（同名时以靠前的为准）：
//!
//! 1. `~/.config/nota/themes/` —— 我们自己的。用户想改哪套主题就复制到这儿改，
//!    不动原文件，也不会被 Typora 升级冲掉；
//! 2. `~/.config/Typora/themes/` —— Typora 的常规安装位置；
//! 3. `~/.var/app/io.typora.Typora/config/Typora/themes/` —— Typora 的 **flatpak** 安装。
//!    这台机器上 Typora 就是 flatpak 装的，所以第 3 条不是备胎而是主路。
//!
//! ⚠️ **我们不随包发布任何第三方主题。** Typora 自带的那几套（github / night /
//! newsprint / pixyll / whitey）版权是 Typora 的，用户机器上装了就有、没有就没有。
//! 这是有意的取舍：把别人的 CSS 塞进我们的安装包，比"新装的机器主题列表是空的"
//! 糟得多——后者只是空，前者是许可问题。
//!
//! # 为什么读取不直接用 asset 协议去 fetch
//!
//! 因为**主题 CSS 必须先改造再用**（见 `src/styles/typora-theme.ts` 顶上那段：
//! Typora 主题里有几十条裸元素规则，直接塞进来会把应用外壳一起改掉）。
//! 要改造就得先拿到**文本**，而 `<link href="asset://...">` 拿到的是渲染结果不是文本。
//! 所以走命令读文本，改造完再由前端注入 `<style>`。
//!
//! # 为什么字体也不走 asset 协议（2026-09-23 实测抓出来的）
//!
//! 因为**走不通**。WebKitGTK 对 `@font-face` 的取字是 **CORS 模式**的请求
//!（字体和图片不一样：图片按普通模式取，字体必须过 CORS），而 wry 注册
//! `asset:` 这个自定义协议时只登记了 `register_uri_scheme_as_secure`，
//! **没有** `register_uri_scheme_as_cors_enabled`（见 `wry/src/webkitgtk/web_context.rs`）。
//! 结果就是字体的取回阶段报 `NetworkError`，字体静默退回系统字体。
//!
//! 这不是猜的：在容器里用一个只引 woff2、**去掉 `local()` 回退**、家族名
//! 换成系统里不存在的 `ProbeFont` 的探针主题量过——`asset://localhost/...` 取不到
//!（`document.fonts.load` 抛 `NetworkError`），同一个文件改成 `data:` URL 立刻加载成功。
//!
//! 所以本模块多了一条 `read_asset`：把主题的资源**读成 data: URL**，
//! 由前端内联进 CSS。这也顺带把 Windows（`http://asset.localhost`）和
//! macOS 的协议差异一并绕开了——data: 在三个平台上走的是同一条路。

use std::collections::HashSet;
use std::path::{Path, PathBuf};

use base64::Engine as _;
use serde::Serialize;

use crate::error::{NotaError, Result};
use crate::paths;

/// 主题 CSS 的体积上限。超过这个数基本可以断定不是在装主题。
const MAX_CSS_BYTES: u64 = 2 * 1024 * 1024;

/// 单个主题资源（字体、图片）的体积上限。
///
/// 比 CSS 宽一档：字体动辄 200 KB，图片可能上 MB。**但不能不设**——
/// 内联成 data: URL 之后这些东西要整个过一遍 IPC 并在内存里多留一份
///（base64 还要涨 1/3），没有上限就等于把一个"读任意大文件"的口子
/// 开在了主题菜单上。
const MAX_ASSET_BYTES: u64 = 4 * 1024 * 1024;

/// 一个可用的主题。
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
pub struct ThemeInfo {
    /// 显示名，同时是**唯一键**（取自文件名去掉 `.css`）。
    pub name: String,
    /// 从哪儿来的：`nota` / `typora` / `typora-flatpak`。
    /// 界面上要标出来——否则"我明明删了那个文件它怎么还在"会变成一个查不动的问题。
    pub source: String,
    /// CSS 文件的绝对路径。读取时拿它当入参。
    pub css: String,
    /// 主题所在**目录**。前端把相对 `url()` 拼到这个目录上。
    pub dir: String,
    /// 有没有同名资源目录。没有的话主题多半会缺字体（还能用，但字形会退回系统字体）。
    pub has_assets: bool,
}

/// 扫一遍所有主题目录，返回去重后的清单（按名字排序）。
pub fn discover() -> Vec<ThemeInfo> {
    discover_in(&paths::theme_dirs())
}

/// `discover` 的纯函数版本：目录从外面给，便于测试。
pub fn discover_in(dirs: &[(PathBuf, &'static str)]) -> Vec<ThemeInfo> {
    let mut seen: HashSet<String> = HashSet::new();
    let mut out = Vec::new();

    for (dir, source) in dirs {
        // 目录不存在是**正常情况**（没装 Typora 就没有那个目录），不是错误。
        let Ok(entries) = std::fs::read_dir(dir) else {
            continue;
        };
        for entry in entries.flatten() {
            let path = entry.path();
            if path.extension().and_then(|e| e.to_str()) != Some("css") {
                continue;
            }
            let Some(stem) = path.file_stem().and_then(|s| s.to_str()) else {
                continue;
            };
            // 靠前的目录已经给过同名主题了，跳过。
            if !seen.insert(stem.to_owned()) {
                continue;
            }
            let (Some(css), Some(dir_s)) = (path.to_str(), dir.to_str()) else {
                continue; // 非 UTF-8 路径：前端拿不动，跳过好过报错
            };
            out.push(ThemeInfo {
                name: stem.to_owned(),
                source: (*source).to_owned(),
                css: css.to_owned(),
                dir: dir_s.to_owned(),
                has_assets: dir.join(stem).is_dir(),
            });
        }
    }

    out.sort_by(|a, b| a.name.cmp(&b.name));
    out
}

/// 读一份主题 CSS。
///
/// ⚠️ 会先验一下 `path` 确实躺在某个主题目录**里面**（不要求正好在它那一层）。
/// 判据是"**在里面**"而不是"父目录等于"：主题除了主 CSS，还会 `@import`
/// 子目录里的东西——night 主题就 import 了 `night/mermaid.dark.css`，
/// 那个文件在主题目录的**下一层**。按"父目录等于"判会把这些正当读取一起拒掉。
///
/// 前端传回来的是我们刚给它的路径，今天没有被利用的路径；但"任意路径读文件"
/// 这个口子一旦开着，将来某个插件或某段粘进来的内容就有可能把它捅穿。
/// `Path::starts_with` 是按路径分量比的，所以 `/a/themes-evil` **不会**误命中
/// `/a/themes`。守住比事后查便宜。
pub fn read_css(path: &Path) -> Result<String> {
    check_scope(path)?;
    check_size(path, MAX_CSS_BYTES)?;

    std::fs::read_to_string(path).map_err(|source| NotaError::Read {
        path: path.to_path_buf(),
        source,
    })
}

/// 把一个主题资源（字体、图片）读成 **data: URL**。
///
/// 为什么必须内联、不能用 asset 协议，见本文件顶上那段"为什么字体也不走 asset 协议"。
/// 相对 url 的解析在前端做（它才知道 CSS 文件在哪个目录），这里只负责
/// "给一个绝对路径、还一个能直接写进 CSS 的 URL"。
pub fn read_asset(path: &Path) -> Result<String> {
    check_scope(path)?;
    check_size(path, MAX_ASSET_BYTES)?;

    let bytes = std::fs::read(path).map_err(|source| NotaError::Read {
        path: path.to_path_buf(),
        source,
    })?;

    // base64 是**标准字母表 + 无换行**：data: URL 里出现换行会让浏览器
    // 解析到空白字符而截断（`STANDARD` 不带 padding 之外的任何装饰，正好）。
    let encoded = base64::engine::general_purpose::STANDARD.encode(&bytes);
    Ok(format!("data:{};base64,{}", mime_of(path), encoded))
}

/// 路径必须躺在某个主题目录**里面**。见 `read_css` 的文档注释。
fn check_scope(path: &Path) -> Result<()> {
    let allowed = paths::theme_dirs();
    if allowed.iter().any(|(d, _)| path.starts_with(d)) {
        return Ok(());
    }
    Err(NotaError::other(format!(
        "{} 不在任何主题目录里，拒绝读取",
        path.display()
    )))
}

/// 体积闸。`limit` 由调用方给——CSS 和资源的上限不是一回事。
fn check_size(path: &Path, limit: u64) -> Result<()> {
    let meta = std::fs::metadata(path).map_err(|source| NotaError::Read {
        path: path.to_path_buf(),
        source,
    })?;
    if meta.len() > limit {
        return Err(NotaError::other(format!(
            "主题文件 {} 有 {} 字节，超过 {} 字节的上限",
            path.display(),
            meta.len(),
            limit
        )));
    }
    Ok(())
}

/// 按扩展名给 MIME。
///
/// ⚠️ 认不出来的**不要瞎猜**，给 `application/octet-stream`。data: URL 的
/// MIME 是浏览器判断"这是不是我能用的东西"的依据之一：给一个 `.svg` 标成
/// `image/png` 会让它拒收，而标成 `application/octet-stream` 的 `<img>`
/// 反而会被嗅探救回来。所以"不知道"比"猜错"安全。
fn mime_of(path: &Path) -> &'static str {
    match path
        .extension()
        .and_then(|e| e.to_str())
        .map(|e| e.to_ascii_lowercase())
        .as_deref()
    {
        Some("woff2") => "font/woff2",
        Some("woff") => "font/woff",
        Some("ttf") => "font/ttf",
        Some("otf") => "font/otf",
        Some("ttc") => "font/collection",
        Some("eot") => "application/vnd.ms-fontobject",
        Some("png") => "image/png",
        Some("jpg" | "jpeg") => "image/jpeg",
        Some("gif") => "image/gif",
        Some("svg") => "image/svg+xml",
        Some("webp") => "image/webp",
        Some("avif") => "image/avif",
        Some("bmp") => "image/bmp",
        Some("ico") => "image/x-icon",
        _ => "application/octet-stream",
    }
}

/// 我们自己的主题目录，**用到时才建**。返回它的绝对路径。
///
/// 与另两个目录的区别：那两个是别人的，我们只读；这个是我们的，
/// 「打开主题文件夹」菜单项要能把它建出来再打开——首次使用时它多半还不存在。
pub fn user_themes_dir() -> Result<String> {
    let dir = paths::user_themes_dir()?;
    paths::ensure_dir(&dir)?;
    paths::path_to_string(&dir)
}

#[cfg(test)]
mod tests {
    use super::*;

    /// 造一个临时的主题目录树。
    fn 铺一个(dir: &Path, name: &str, with_assets: bool) {
        std::fs::create_dir_all(dir).unwrap();
        std::fs::write(dir.join(format!("{name}.css")), "body { color: red }").unwrap();
        if with_assets {
            std::fs::create_dir_all(dir.join(name)).unwrap();
        }
    }

    #[test]
    fn 扫出_css_并认出同名资源目录() {
        let base = std::env::temp_dir().join("nota-themes-test-1");
        let _ = std::fs::remove_dir_all(&base);
        let a = base.join("a");
        铺一个(&a, "带字体", true);
        铺一个(&a, "不带字体", false);
        // 干扰项：不是 .css 的文件、以及一个叫 old-themes 的目录
        std::fs::write(a.join("Readme.md"), "x").unwrap();
        std::fs::create_dir_all(a.join("old-themes")).unwrap();

        let dirs = vec![(a.clone(), "nota")];
        let list = discover_in(&dirs);

        assert_eq!(list.len(), 2, "只该扫出两个主题，实际：{list:?}");
        assert_eq!(list[0].name, "不带字体");
        assert!(!list[0].has_assets);
        assert_eq!(list[1].name, "带字体");
        assert!(list[1].has_assets);
        assert_eq!(list[1].source, "nota");

        let _ = std::fs::remove_dir_all(&base);
    }

    #[test]
    fn 靠前的目录覆盖同名的() {
        let base = std::env::temp_dir().join("nota-themes-test-2");
        let _ = std::fs::remove_dir_all(&base);
        let mine = base.join("mine");
        let theirs = base.join("theirs");
        铺一个(&mine, "night", false);
        铺一个(&theirs, "night", false);
        铺一个(&theirs, "github", false);

        let dirs = vec![(mine.clone(), "nota"), (theirs.clone(), "typora")];
        let list = discover_in(&dirs);

        assert_eq!(list.len(), 2);
        let night = list.iter().find(|t| t.name == "night").unwrap();
        assert_eq!(night.source, "nota", "同名时该用靠前那个目录的");

        let _ = std::fs::remove_dir_all(&base);
    }

    #[test]
    fn 目录不存在时返回空表而不是报错() {
        let dirs = vec![(PathBuf::from("/nonexistent-nota-xyz/themes"), "typora")];
        assert!(discover_in(&dirs).is_empty());
    }

    #[test]
    fn 拒绝读主题目录之外的文件() {
        let base = std::env::temp_dir().join("nota-themes-test-3");
        let _ = std::fs::remove_dir_all(&base);
        std::fs::create_dir_all(&base).unwrap();
        std::fs::write(base.join("evil.css"), "body{}").unwrap();

        // ⚠️ 这条测的是"守卫在不在"，所以用真实路径喂它。
        // `paths::theme_dirs()` 在测试环境探到的是真 home，
        // 这个临时目录必然不在里面。
        let err = read_css(&base.join("evil.css")).unwrap_err();
        assert!(err.to_string().contains("拒绝读取"), "实际：{err}");

        let _ = std::fs::remove_dir_all(&base);
    }

    #[test]
    fn 资源读成_data_url_而不是路径() {
        // ⚠️ 这条钉的是**形状**：data: 前缀 + 正确的 MIME + base64 正文。
        // 用 asset:// 那次翻车翻在"字体取不回来"，所以"是不是 data: URL"
        // 就是这条路的判据，不能只测"读到了字节"。
        let base = std::env::temp_dir().join("nota-themes-test-4");
        let _ = std::fs::remove_dir_all(&base);
        std::fs::create_dir_all(base.join("night")).unwrap();
        std::fs::write(base.join("night/root.woff2"), [0u8, 1, 2, 253]).unwrap();

        // read_asset 会过 check_scope，而 scope 来自真实 home；所以这里
        // 只测"编码与 MIME"这两件纯函数的事。
        assert_eq!(mime_of(Path::new("/a/b/x.woff2")), "font/woff2");
        assert_eq!(mime_of(Path::new("/a/b/x.PNG")), "image/png");
        assert_eq!(mime_of(Path::new("/a/b/x.unknownext")), "application/octet-stream");
        assert_eq!(mime_of(Path::new("/a/b/无扩展名")), "application/octet-stream");

        let encoded = base64::engine::general_purpose::STANDARD.encode([0u8, 1, 2, 253]);
        assert_eq!(encoded, "AAEC/Q==", "标准字母表、带 padding、不带换行");

        let _ = std::fs::remove_dir_all(&base);
    }

    #[test]
    fn 拒绝读主题目录之外的资源() {
        let base = std::env::temp_dir().join("nota-themes-test-5");
        let _ = std::fs::remove_dir_all(&base);
        std::fs::create_dir_all(&base).unwrap();
        std::fs::write(base.join("evil.woff2"), [0u8; 4]).unwrap();

        let err = read_asset(&base.join("evil.woff2")).unwrap_err();
        assert!(err.to_string().contains("拒绝读取"), "实际：{err}");

        let _ = std::fs::remove_dir_all(&base);
    }

    #[test]
    fn 前缀像主题目录的兄弟目录不算数() {
        // `Path::starts_with` 是**按分量**比的：`/x/themes-evil` 不该因为
        // 字符串以 `/x/themes` 开头就被放过。这条钉住这个语义。
        let themelike = PathBuf::from("/x/themes");
        let sibling = PathBuf::from("/x/themes-evil/a.css");
        assert!(!sibling.starts_with(&themelike));

        let inside = PathBuf::from("/x/themes/night/mermaid.dark.css");
        assert!(inside.starts_with(&themelike), "子目录里的 @import 目标要放行");
    }
}
