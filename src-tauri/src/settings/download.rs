//! 更新下载的地址替换规则。
//!
//! 这是给网络环境受限的用户准备的轻量代理：每行一条
//! `原地址前缀 => 替换后的地址前缀`。规则只在上游地址已通过官方围栏后应用，
//! 替换结果仍必须是 HTTPS 或本机回环地址。

use serde::{Deserialize, Serialize};

use crate::error::{NotaError, Result};

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(default)]
pub struct Download {
    /// 多行规则。空串 = 不替换。
    pub replacements: String,
}

impl Default for Download {
    fn default() -> Self {
        Self {
            replacements: String::new(),
        }
    }
}

/// 解析 `旧前缀 => 新前缀`。空行和以 `#` 开头的注释行跳过。
pub fn 解析规则(text: &str) -> Result<Vec<(String, String)>> {
    let mut rules = Vec::new();
    for (index, raw) in text.lines().enumerate() {
        let line = raw.trim();
        if line.is_empty() || line.starts_with('#') {
            continue;
        }
        let Some((old, new)) = line.split_once("=>") else {
            return Err(NotaError::other(format!(
                "下载替换规则第 {} 行缺少 `=>`",
                index + 1
            )));
        };
        let old = old.trim();
        let new = new.trim();
        if old.is_empty() || new.is_empty() {
            return Err(NotaError::other(format!(
                "下载替换规则第 {} 行的前后缀不能为空",
                index + 1
            )));
        }
        rules.push((old.to_owned(), new.to_owned()));
    }
    Ok(rules)
}

/// 按顺序应用替换规则。每条规则只替换第一次出现的位置。
pub fn 改写地址(address: &str, replacements: &str) -> Result<String> {
    let mut out = address.to_owned();
    for (old, new) in 解析规则(replacements)? {
        if let Some(index) = out.find(&old) {
            out.replace_range(index..index + old.len(), &new);
        }
    }
    Ok(out)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn 空规则原样返回() {
        assert_eq!(
            改写地址("https://github.com/a", "").unwrap(),
            "https://github.com/a"
        );
    }

    #[test]
    fn 按顺序替换前缀() {
        let rules = "github.com/ => gh-proxy.net/github.com/\nreleases/download/ => releases/download/";
        assert_eq!(
            改写地址("https://github.com/Nota-MD/Nota", rules).unwrap(),
            "https://gh-proxy.net/github.com/Nota-MD/Nota"
        );
    }

    #[test]
    fn 坏规则要说第几行() {
        let err = 改写地址("https://github.com", "github.com").unwrap_err();
        assert!(err.to_string().contains("第 1 行"));
    }

    #[test]
    fn 注释和空行跳过() {
        assert_eq!(解析规则("# 代理\n\n").unwrap().len(), 0);
    }
}
