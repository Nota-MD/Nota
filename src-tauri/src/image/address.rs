use std::path::{Component, Path, PathBuf};

pub fn is_network_address(s: &str) -> bool {
    let s = s.trim();
    let xiao_write = s.to_ascii_lowercase();
    xiao_write.starts_with("http://") || xiao_write.starts_with("https://")
}

pub fn zhuan_yi_address(s: &str, is_network_2: bool) -> String {
    let mut out = String::with_capacity(s.len());
    let zi_jie: Vec<char> = s.chars().collect();
    for (i, c) in zi_jie.iter().enumerate() {
        let yao_zhuan = match c {
            ' ' | '"' | '<' | '>' | '`' => true,

            '?' | '#' => !is_network_2,
            '%' => !is_network_2 && !hou_liang_wei_shi_shi_liu_jin_zhi(&zi_jie, i),
            _ => false,
        };
        if yao_zhuan {
            let mut buf = [0u8; 4];
            for b in c.encode_utf8(&mut buf).as_bytes() {
                out.push_str(&format!("%{b:02X}"));
            }
        } else {
            out.push(*c);
        }
    }
    out
}

fn hou_liang_wei_shi_shi_liu_jin_zhi(zi_jie: &[char], i: usize) -> bool {
    zi_jie
        .get(i + 1)
        .zip(zi_jie.get(i + 2))
        .is_some_and(|(a, b)| a.is_ascii_hexdigit() && b.is_ascii_hexdigit())
}

pub fn xiang_dui_path(ji_zhun_directory: &Path, target_2: &Path) -> Option<String> {
    if !ji_zhun_directory.is_absolute() || !target_2.is_absolute() {
        return None;
    }
    let a: Vec<Component> = ji_zhun_directory.components().collect();
    let b: Vec<Component> = target_2.components().collect();
    let mut i = 0;
    while i < a.len() && i < b.len() && a[i] == b[i] {
        i += 1;
    }

    let wang_shang = a[i..]
        .iter()
        .filter(|c| matches!(c, Component::Normal(_)))
        .count();
    let mut duan: Vec<String> = vec!["..".to_string(); wang_shang];
    for c in &b[i..] {
        if let Component::Normal(s) = c {
            duan.push(s.to_string_lossy().to_string());
        }
    }
    if duan.is_empty() {
        return Some(".".to_string());
    }
    Some(duan.join("/"))
}

pub fn jia_dian_dian_xie_gang(xiang_dui: &str) -> String {
    if xiang_dui.starts_with('.') {
        xiang_dui.to_string()
    } else {
        format!("./{xiang_dui}")
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

pub fn rule_shi_yong(is_network_2: bool, apply_to_local: bool, apply_to_remote: bool) -> bool {
    if is_network_2 {
        apply_to_remote
    } else {
        apply_to_local
    }
}
