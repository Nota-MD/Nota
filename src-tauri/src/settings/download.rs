//! Download URL replacement rules.
//!
//! Each non-empty line uses `original prefix => replacement prefix`. Rules are
//! applied only after the caller's trust boundary accepts the original URL.
//! Rewritten URLs must remain HTTPS or loopback.

use serde::{Deserialize, Serialize};

use crate::error::{NotaError, Result};

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(default)]
pub struct Download {
    /// Newline-separated rules. Empty means no replacement.
    pub replacements: String,
}

impl Default for Download {
    fn default() -> Self {
        Self {
            replacements: String::new(),
        }
    }
}

/// Parse `old prefix => new prefix` rules.
pub fn parse_rules(text: &str) -> Result<Vec<(String, String)>> {
    let mut rules = Vec::new();
    for (index, raw) in text.lines().enumerate() {
        let line = raw.trim();
        if line.is_empty() || line.starts_with('#') {
            continue;
        }
        let Some((old, new)) = line.split_once("=>") else {
            return Err(NotaError::other(format!(
                "Download replacement rule {} is missing `=>`",
                index + 1
            )));
        };
        let old = old.trim();
        let new = new.trim();
        if old.is_empty() || new.is_empty() {
            return Err(NotaError::other(format!(
                "Download replacement rule {} has an empty prefix",
                index + 1
            )));
        }
        rules.push((old.to_owned(), new.to_owned()));
    }
    Ok(rules)
}

/// Apply rules in order. Each rule replaces only its first match.
pub fn rewrite_address(address: &str, replacements: &str) -> Result<String> {
    let mut output = address.to_owned();
    for (old, new) in parse_rules(replacements)? {
        if let Some(index) = output.find(&old) {
            output.replace_range(index..index + old.len(), &new);
        }
    }
    Ok(output)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn empty_rules_keep_the_address() {
        assert_eq!(
            rewrite_address("https://github.com/a", "").unwrap(),
            "https://github.com/a"
        );
    }

    #[test]
    fn rules_apply_in_order() {
        let rules = "github.com/ => gh-proxy.net/github.com/\nreleases/download/ => releases/download/";
        assert_eq!(
            rewrite_address("https://github.com/Nota-MD/Nota", rules).unwrap(),
            "https://gh-proxy.net/github.com/Nota-MD/Nota"
        );
    }

    #[test]
    fn invalid_rules_report_the_line() {
        let error = rewrite_address("https://github.com", "github.com").unwrap_err();
        assert!(error.to_string().contains("rule 1"));
    }

    #[test]
    fn comments_and_empty_lines_are_ignored() {
        assert_eq!(parse_rules("# proxy\n\n").unwrap().len(), 0);
    }
}
