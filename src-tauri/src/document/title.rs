//!

//!

//!

use std::path::Path;

///

///

pub fn derive_title(text: &str, path: Option<&Path>, untitled_index: u64, strict: bool) -> String {
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
    format!("Untitled {untitled_index}")
}

fn front_matter_title(text: &str) -> Option<String> {
    let mut lines = text.lines();
    if lines.next()?.trim_end() != "---" {
        return None;
    }
    for line in lines {
        let trimmed = line.trim_end();
        if trimmed == "---" || trimmed == "..." {
            return None;
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

///

///

fn strip_atx(line: &str, strict: bool) -> Option<&str> {
    let hashes = line.chars().take_while(|c| *c == '#').count();
    if !(1..=6).contains(&hashes) {
        return None;
    }
    let rest = &line[hashes..];

    if strict && !rest.starts_with(' ') && !rest.is_empty() {
        return None;
    }
    Some(rest.trim().trim_end_matches('#').trim())
}
