use base64::Engine as _;
use std::path::{Path, PathBuf};

const MAX_ASSET_BYTES: u64 = 32 * 1024 * 1024;
const MAX_TOTAL_BYTES: u64 = 48 * 1024 * 1024;

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
    if value.is_empty() || value.contains("var(") || value.bytes().any(|b| b == b'\0' || b == b'\\')
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

    fn temp_dir(name: &str) -> PathBuf {
        let stamp = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap()
            .as_nanos();
        std::env::temp_dir().join(format!(
            "nota-theme-assets-{name}-{}-{stamp}",
            std::process::id()
        ))
    }

    #[test]
    fn inlines_relative_icons_and_fonts_from_the_css_directory() {
        let root = temp_dir("inside");
        let assets = root.join("shared").join("assets");
        std::fs::create_dir_all(&assets).unwrap();
        std::fs::write(assets.join("close.svg"), "<svg/>").unwrap();
        std::fs::write(assets.join("theme.ttf"), [0, 1, 2, 3]).unwrap();
        let css_path = root.join("styles").join("my.css");
        std::fs::create_dir_all(css_path.parent().unwrap()).unwrap();

        let css = r#"
[data-ui-style="my"] { --icon-nota-close-symbolic: url("../shared/assets/close.svg"); }
@font-face { src: url(../shared/assets/theme.ttf); }
"#;
        let got = inline(css, &css_path, &root);
        assert!(got.contains("--icon-nota-close-symbolic: url(\"data:image/svg+xml;base64,"));
        assert!(got.contains("url(\"data:font/ttf;base64,"));
        std::fs::remove_dir_all(root).unwrap();
    }

    #[test]
    fn preserves_escaping_and_external_urls() {
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

    #[test]
    fn large_local_fonts_are_inlined() {
        let root = temp_dir("large-font");
        std::fs::create_dir_all(root.join("fonts")).unwrap();
        let font = root.join("fonts").join("large.ttf");
        std::fs::File::create(&font)
            .unwrap()
            .set_len(9 * 1024 * 1024)
            .unwrap();
        let css_path = root.join("theme.css");
        let css = "@font-face { src: url(\"fonts/large.ttf\") format(\"truetype\"); }";
        let got = inline(css, &css_path, &root);
        assert!(got.contains("url(\"data:font/ttf;base64,"));
        std::fs::remove_dir_all(root).unwrap();
    }
}
