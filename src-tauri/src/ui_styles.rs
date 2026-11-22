use serde::Serialize;

use crate::error::{NotaError, Result};
use crate::paths;

use crate::themes::{check_id, check_size, css_scope_root, resolve_user_css, scan_user_css_ids};

const MAX_CSS_BYTES: u64 = 2 * 1024 * 1024;

pub const BUILTIN_IDS: &[&str] = &["adwaita"];

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
pub struct UiStyleInfo {
    pub id: String,

    pub builtin: bool,
}

pub fn discover() -> Vec<UiStyleInfo> {
    let user = user_ids();

    let mut out: Vec<UiStyleInfo> = BUILTIN_IDS
        .iter()
        .map(|id| UiStyleInfo {
            id: (*id).to_owned(),
            builtin: !user.iter().any(|u| u == id),
        })
        .collect();

    let mut extra: Vec<&String> = user
        .iter()
        .filter(|id| !BUILTIN_IDS.contains(&id.as_str()))
        .collect();
    extra.sort();
    for id in extra {
        out.push(UiStyleInfo {
            id: id.clone(),
            builtin: false,
        });
    }

    out
}

pub fn css_of(id: &str) -> Result<String> {
    check_id(id)?;

    let root = paths::user_ui_styles_dir()?;
    let path = resolve_user_css(&root, id).ok_or_else(|| {
        NotaError::other(format!(
            "UI style {id} was not found; it may have been deleted or the id case is incorrect"
        ))
    })?;
    check_size(&path, MAX_CSS_BYTES)?;
    let css = std::fs::read_to_string(&path).map_err(|source| NotaError::Read {
        path: path.clone(),
        source,
    })?;
    Ok(crate::theme_assets::inline(
        &css,
        &path,
        &css_scope_root(&root, &path),
    ))
}

fn user_ids() -> Vec<String> {
    let Ok(dir) = paths::user_ui_styles_dir() else {
        return Vec::new();
    };
    scan_user_css_ids(&dir)
}

pub fn user_styles_dir() -> Result<String> {
    let dir = paths::user_ui_styles_dir()?;
    paths::ensure_dir(&dir)?;
    paths::path_to_string(&dir)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn builtin_ids_are_unique_and_nonempty() {
        let mut ids: Vec<&str> = BUILTIN_IDS.to_vec();
        let n = ids.len();
        ids.sort();
        ids.dedup();
        assert_eq!(ids.len(), n, "BUILTIN_IDS contains duplicates");
        for id in BUILTIN_IDS {
            assert!(check_id(id).is_ok(), "invalid built-in id: {id}");
        }
        assert_eq!(BUILTIN_IDS[0], "adwaita");
    }

    #[test]
    fn builtin_ids_are_explicitly_pinned() {
        assert_eq!(BUILTIN_IDS, &["adwaita"]);
    }

    #[test]
    fn ui_style_ids_use_the_same_contract_as_document_themes() {
        for bad in [
            "",
            "..",
            "../../etc/passwd",
            "a/b",
            "a\\b",
            "\u{6211}\u{7684}\u{98ce}\u{683c}",
            ".hidden",
        ] {
            assert!(check_id(bad).is_err(), "invalid id was accepted: {bad}");
        }
        for good in ["my-style", "my_style_2", "A1"] {
            assert!(check_id(good).is_ok(), "valid id was rejected: {good}");
        }
    }

    #[test]
    fn all_builtin_styles_remain_discoverable() {
        let list = discover();
        for id in BUILTIN_IDS {
            assert!(
                list.iter().any(|s| &s.id == id),
                "built-in style {id} is missing from discovery"
            );
        }
    }

    #[test]
    fn missing_style_returns_an_error() {
        let err = css_of("no-such-style-xyz").unwrap_err();
        assert!(err.to_string().contains("was not found"), "actual: {err}");
    }

    #[test]
    fn path_traversal_ids_are_rejected_before_css_lookup() {
        let err = css_of("../../etc/passwd").unwrap_err();
        assert!(err.to_string().contains("Invalid"), "actual: {err}");
    }
}
