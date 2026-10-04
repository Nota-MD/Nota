//! **标题从哪来**——从正文和路径猜一个显示名。
//!
//! 2026-10-04 从 `document/mod.rs` 拆出来（那一份过了 800 行，见 `docs/09` §4）。
//! 拆的依据是**这里有一条缝**：整个文件只做一件事——**纯文本进、标题出**。
//! 它不认识 `DocId`、不碰 `DocumentStore`、不取锁、不碰磁盘，所以谁都能调它，
//! 测试也不必先造一个仓库出来。
//!
//! ⚠️ 搬过来**一个字都没改**，只是换了家。原先对外的名字照旧：
//! `mod.rs` 里有一行 `pub use title::derive_title;`，所以
//! `crate::document::derive_title` 这个路径**没变**。
//!
//! ⚠️ 里面那两份"什么算标题"的判据（`front_matter_title` / `strip_atx`）
//! **与前端同构**：`src/editor/atx.ts` 是前端那一份。**两边要一起改**——
//! 判据分家的后果是"标签页上的名字"与"编辑器里看到的标题"对不上。

use std::path::Path;

/// 从正文里猜标题。
///
/// 取值顺序：
/// 1. YAML front matter 里的 `title:`；
/// 2. 第一个 ATX 标题（`# ` ~ `###### `）；
/// 3. 文件名的 stem；
/// 4. "未命名 N"。
///
/// `strict` = 严格模式（`Settings::strict_markdown`）：它只影响第 2 条认哪些行
/// ——严格时井号后面**必须**有空格，宽松（默认）时 `#标题` 也算。见 `strip_atx`。
pub fn derive_title(
    text: &str,
    path: Option<&Path>,
    untitled_index: u64,
    strict: bool,
) -> String {
    if let Some(t) = front_matter_title(text) {
        return t;
    }
    if let Some(h) = first_heading(text, strict) {
        return h;
    }
    if let Some(p) = path {
        if let Some(stem) = p.file_stem().and_then(|s| s.to_str()) {
            if !stem.is_empty() {
                return stem.to_owned();
            }
        }
    }
    format!("未命名 {untitled_index}")
}

/// 取 YAML front matter 里的 `title:`。front matter 必须**在文件最开头**，
/// 首行是 `---`，到下一个 `---` 或 `...` 结束（与 Jekyll 一致）。
fn front_matter_title(text: &str) -> Option<String> {
    let mut lines = text.lines();
    if lines.next()?.trim_end() != "---" {
        return None;
    }
    for line in lines {
        let trimmed = line.trim_end();
        if trimmed == "---" || trimmed == "..." {
            return None; // front matter 结束，里面没有 title
        }
        if let Some(rest) = trimmed.strip_prefix("title:") {
            let value = rest.trim().trim_matches(|c| c == '"' || c == '\'');
            if !value.is_empty() {
                return Some(value.to_owned());
            }
        }
    }
    None
}

/// 第一个 ATX 标题的文本。跳过围栏代码块里的 `#`（那多半是 shell 注释）。
fn first_heading(text: &str, strict: bool) -> Option<String> {
    let mut in_fence = false;
    for line in text.lines() {
        let trimmed = line.trim_start();
        if trimmed.starts_with("```") || trimmed.starts_with("~~~") {
            in_fence = !in_fence;
            continue;
        }
        if in_fence {
            continue;
        }
        if let Some(rest) = strip_atx(trimmed, strict) {
            if !rest.is_empty() {
                return Some(rest.to_owned());
            }
        }
    }
    None
}

/// 若这一行是 ATX 标题，返回标题文本（去掉 `#` 与可选的收尾 `#`）。
///
/// ⚠️ **严格与宽松只差一句**：井号后面没空格时（`#foo`），严格模式不认，
/// 宽松模式认。宽松是**默认**：`#foo` 这种写法在文档里很常见，
/// 关着才不会把它们降级成普通段落。⚠️ 前端有一份**同构**的判据
/// （`src/editor/atx.ts`），两边一起改。
///
/// ⚠️ 这里**只读不写**：宽松模式把 `#foo` 认成标题，但**正文一个字都不改**
/// ——前端那边也只是按标题排版（`src/editor/lax-heading.ts`），存盘存回
/// `#foo`（用户 2026-09-24 定的：「如果关闭，存盘不要自动修复」）。
fn strip_atx(line: &str, strict: bool) -> Option<&str> {
    let hashes = line.chars().take_while(|c| *c == '#').count();
    if !(1..=6).contains(&hashes) {
        return None;
    }
    let rest = &line[hashes..];
    // `# foo` 两模式都算标题；`#foo` 只在宽松模式算。
    if strict && !rest.starts_with(' ') && !rest.is_empty() {
        return None;
    }
    Some(rest.trim().trim_end_matches('#').trim())
}
