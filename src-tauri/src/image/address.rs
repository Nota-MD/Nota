use std::path::{Component, Path, PathBuf};

pub fn is_network_address(s: &str) -> bool {
    let s = s.trim();
    let small_write = s.to_ascii_lowercase();
    small_write.starts_with("http://") || small_write.starts_with("https://")
}

pub fn encode_markdown_address(value: &str, is_network: bool) -> String {
    let mut out = String::with_capacity(value.len());
    let characters: Vec<char> = value.chars().collect();
    for (index, character) in characters.iter().enumerate() {
        let should_encode = match character {
            ' ' | '"' | '<' | '>' | '`' => true,

            '?' | '#' => !is_network,
            '%' => !is_network && !has_hex_escape_tail(&characters, index),
            _ => false,
        };
        if should_encode {
            let mut buf = [0u8; 4];
            for b in character.encode_utf8(&mut buf).as_bytes() {
                out.push_str(&format!("%{b:02X}"));
            }
        } else {
            out.push(*character);
        }
    }
    out
}

fn has_hex_escape_tail(characters: &[char], index: usize) -> bool {
    characters
        .get(index + 1)
        .zip(characters.get(index + 2))
        .is_some_and(|(first, second)| first.is_ascii_hexdigit() && second.is_ascii_hexdigit())
}

pub fn relative_path(base_directory: &Path, target: &Path) -> Option<String> {
    if !base_directory.is_absolute() || !target.is_absolute() {
        return None;
    }
    let base_components: Vec<Component> = base_directory.components().collect();
    let target_components: Vec<Component> = target.components().collect();
    let mut shared = 0;
    while shared < base_components.len()
        && shared < target_components.len()
        && base_components[shared] == target_components[shared]
    {
        shared += 1;
    }

    let parent_steps = base_components[shared..]
        .iter()
        .filter(|component| matches!(component, Component::Normal(_)))
        .count();
    let mut segments: Vec<String> = vec!["..".to_string(); parent_steps];
    for component in &target_components[shared..] {
        if let Component::Normal(segment) = component {
            segments.push(segment.to_string_lossy().to_string());
        }
    }
    if segments.is_empty() {
        return Some(".".to_string());
    }
    Some(segments.join("/"))
}

pub fn prefix_relative_path(relative: &str) -> String {
    if relative.starts_with('.') {
        relative.to_string()
    } else {
        format!("./{relative}")
    }
}

pub fn resolve_local_file(provided: &Path, document_directory: Option<&Path>) -> PathBuf {
    if provided.is_absolute() {
        return provided.to_path_buf();
    }
    match document_directory {
        Some(directory_2) => directory_2.join(provided),
        None => provided.to_path_buf(),
    }
}

pub fn rule_applies(is_network: bool, apply_to_local: bool, apply_to_remote: bool) -> bool {
    if is_network {
        apply_to_remote
    } else {
        apply_to_local
    }
}
