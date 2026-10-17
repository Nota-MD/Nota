//! 主题 CSS 里的相对资源：在交给 WebView 之前转成 data URI。
//!
//! 用户主题可以自由写：
//!
//! ```css
//! [data-ui-style="my-style"] {
//!   --icon-folio-close-symbolic: url("./assets/close.svg");
//! }
//! @font-face {
//!   font-family: "My Theme";
//!   src: url("../shared/fonts/theme.ttf");
//! }
//! ```
//!
//! 路径**相对 CSS 文件本身**解析，不要求资源放进同名文件夹。允许在主题根目录
//! 内用 `../` 共享一组素材，但不允许逃出 `ui-styles/` 或 `themes/` 根目录。
//!
//! ⚠️ 必须转成 data URI：主题是作为 `<style>` 文本注入的，相对 URL 会按应用页面
//! 的地址解析，而不是按 CSS 文件所在目录解析；`asset:` 在 WebKitGTK 上对字体
//! 等 CORS 资源又不可靠。转换放在宿主侧，主题文件本身仍是普通、可读的 CSS。
//!
//! ⚠️ **失败单条跳过，不拖垮整份主题**：文件不存在、路径越界、后缀不认识时保留
//! 原始 `url()`，WebKit 最终只是那一条不生效。主题里一枚图标没拷全，不该让整份
//! 外观退回默认。单文件 8 MiB、整份 CSS 合计 24 MiB；超限同样跳过。

use std::path::{Path, PathBuf};
use base64::Engine as _;

const MAX_ASSET_BYTES: u64 = 8 * 1024 * 1024;
const MAX_TOTAL_BYTES: u64 = 24 * 1024 * 1024;

/// 把 CSS 中以 `url(...)` 写出的相对资源内联成 data URI。
///
/// `css_path` 决定相对路径的基准；`scope_root` 是允许读取的根目录。
pub fn inline(css: &str, css_path: &Path, scope_root: &Path) -> String {
    let Ok(root) = std::fs::canonicalize(scope_root) else {
        return css.to_owned();
    };
    let Some(base) = css_path.parent() else {
        return css.to_owned();
    };
    let lower = css.to_ascii_lowercase();
    let mut out = String::with_capacity(css.len());
    let mut cursor = 0usize;
    let mut total = 0u64;

    while let Some(rel) = lower[cursor..].find("url(") {
        let start = cursor + rel;
        let Some((raw, end)) = url_argument(css, start + 4) else {
            break;
        };
        out.push_str(&css[cursor..start]);
        let replacement = resolve(&raw, base, &root, &mut total)
            .map(|data| format!("url(\"{data}\")"))
            .unwrap_or_else(|| css[start..end].to_owned());
        out.push_str(&replacement);
        cursor = end;
    }
    out.push_str(&css[cursor..]);
    out
}

/// 返回 `url(` 之后到对应 `)` 之间的原始值，以及整个 token 的结束位置。
fn url_argument(css: &str, mut at: usize) -> Option<(String, usize)> {
    let bytes = css.as_bytes();
    while at < bytes.len() && bytes[at].is_ascii_whitespace() {
        at += 1;
    }
    if at >= bytes.len() {
        return None;
    }

    let quote = match bytes[at] {
        b'"' | b'\'' => {
            let quote = bytes[at];
            at += 1;
            Some(quote)
        }
        _ => None,
    };
    let value_start = at;
    if let Some(quote) = quote {
        while at < bytes.len() && bytes[at] != quote {
            at += 1;
        }
        if at >= bytes.len() {
            return None;
        }
        let value = css[value_start..at].to_owned();
        at += 1;
        while at < bytes.len() && bytes[at].is_ascii_whitespace() {
            at += 1;
        }
        if bytes.get(at) != Some(&b')') {
            return None;
        }
        Some((value, at + 1))
    } else {
        while at < bytes.len() && bytes[at] != b')' {
            at += 1;
        }
        if at >= bytes.len() {
            return None;
        }
        Some((css[value_start..at].trim().to_owned(), at + 1))
    }
}

fn resolve(raw: &str, base: &Path, root: &Path, total: &mut u64) -> Option<String> {
    let value = raw.trim();
    if value.is_empty()
        || value.contains("var(")
        || value.bytes().any(|b| b == b'\0' || b == b'\\')
    {
        return None;
    }
    let lower = value.to_ascii_lowercase();
    if lower.starts_with("data:")
        || lower.starts_with("http:")
        || lower.starts_with("https:")
        || lower.starts_with("blob:")
        || lower.starts_with("asset:")
        || lower.starts_with("file:")
        || lower.starts_with("//")
        || lower.starts_with('#')
    {
        return None;
    }

    // 查询串与片段不影响磁盘路径，但要留在 data URI 后面。
    let suffix_at = value.find(['?', '#']).unwrap_or(value.len());
    let path_part = &value[..suffix_at];
    let suffix = &value[suffix_at..];
    let rel = Path::new(path_part);
    if rel.is_absolute() {
        return None;
    }
    let full = canonical(&base.join(rel))?;
    if !full.starts_with(root) {
        return None;
    }
    let meta = std::fs::metadata(&full).ok()?;
    if !meta.is_file() || meta.len() == 0 || meta.len() > MAX_ASSET_BYTES {
        return None;
    }
    *total = total.checked_add(meta.len())?;
    if *total > MAX_TOTAL_BYTES {
        return None;
    }
    let mime = mime(&full)?;
    let bytes = std::fs::read(full).ok()?;
    let data = base64::engine::general_purpose::STANDARD.encode(bytes);
    Some(format!("data:{mime};base64,{data}{suffix}"))
}

fn canonical(path: &Path) -> Option<PathBuf> {
    std::fs::canonicalize(path).ok()
}

fn mime(path: &Path) -> Option<&'static str> {
    let ext = path.extension()?.to_str()?.to_ascii_lowercase();
    match ext.as_str() {
        "svg" => Some("image/svg+xml"),
        "png" => Some("image/png"),
        "jpg" | "jpeg" => Some("image/jpeg"),
        "gif" => Some("image/gif"),
        "webp" => Some("image/webp"),
        "avif" => Some("image/avif"),
        "woff2" => Some("font/woff2"),
        "woff" => Some("font/woff"),
        "ttf" => Some("font/ttf"),
        "otf" => Some("font/otf"),
        _ => None,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn temp_dir(名: &str) -> PathBuf {
        let stamp = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap()
            .as_nanos();
        std::env::temp_dir().join(format!("nota-theme-assets-{名}-{}-{stamp}", std::process::id()))
    }

    #[test]
    fn 相对图标和字体按_css_文件目录内联() {
        let root = temp_dir("inside");
        let assets = root.join("shared").join("assets");
        std::fs::create_dir_all(&assets).unwrap();
        std::fs::write(assets.join("close.svg"), "<svg/>").unwrap();
        std::fs::write(assets.join("theme.ttf"), [0, 1, 2, 3]).unwrap();
        let css_path = root.join("styles").join("my.css");
        std::fs::create_dir_all(css_path.parent().unwrap()).unwrap();

        let css = r#"
[data-ui-style="my"] { --icon-folio-close-symbolic: url("../shared/assets/close.svg"); }
@font-face { src: url(../shared/assets/theme.ttf); }
"#;
        let got = inline(css, &css_path, &root);
        assert!(got.contains("--icon-folio-close-symbolic: url(\"data:image/svg+xml;base64,"));
        assert!(got.contains("url(\"data:font/ttf;base64,"));
        std::fs::remove_dir_all(root).unwrap();
    }

    #[test]
    fn 越界与外部地址原样保留() {
        let root = temp_dir("outside");
        let parent = root.parent().unwrap().to_path_buf();
        std::fs::create_dir_all(&root).unwrap();
        std::fs::write(parent.join("secret.svg"), "<svg/>").unwrap();
        let css = r#"a{background:url("../secret.svg")}b{background:url("https://x/y.png")}c{background:url("data:image/png;base64,AA")}"#;
        let got = inline(css, &root.join("my.css"), &root);
        assert_eq!(got, css);
        std::fs::remove_file(parent.join("secret.svg")).unwrap();
        std::fs::remove_dir_all(root).unwrap();
    }
}
