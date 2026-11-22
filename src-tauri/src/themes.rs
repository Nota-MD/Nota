use std::path::{Path, PathBuf};

use serde::Serialize;

use crate::error::{NotaError, Result};
use crate::paths;
use crate::theme_import::typora;

const MAX_CSS_BYTES: u64 = 8 * 1024 * 1024;

struct Builtin {
    id: &'static str,

    name: &'static str,

    css: &'static str,
}

const BUILTIN: &[Builtin] = &[
    Builtin {
        id: "adwaita",
        name: "Adwaita",
        css: include_str!("../../src/styles/themes/adwaita/theme.css"),
    },
    Builtin {
        id: "adwaita-dark",
        name: "Adwaita Dark",
        css: concat!(
            include_str!("../../src/styles/themes/adwaita/theme.css"),
            "\n",
            include_str!("../../src/styles/themes/adwaita/dark.css")
        ),
    },
];

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
pub struct DocThemeInfo {
    pub id: String,

    pub name: String,

    pub builtin: bool,
}

pub fn discover() -> Vec<DocThemeInfo> {
    let mut out: Vec<DocThemeInfo> = BUILTIN
        .iter()
        .map(|b| DocThemeInfo {
            id: b.id.to_owned(),
            name: b.name.to_owned(),
            builtin: true,
        })
        .collect();

    let mut seen: std::collections::HashSet<String> =
        out.iter().map(|theme| theme.id.clone()).collect();
    let mut extra = user_theme_infos();
    extra.sort_by(|left, right| left.id.cmp(&right.id));
    for theme in extra {
        if seen.insert(theme.id.clone()) {
            out.push(theme);
        }
    }

    out
}

pub(crate) fn is_builtin(id: &str) -> bool {
    BUILTIN.iter().any(|theme| theme.id == id)
}

pub fn css_of(id: &str) -> Result<String> {
    check_id(id)?;

    if let Some(builtin) = BUILTIN.iter().find(|b| b.id == id) {
        return Ok(builtin.css.to_owned());
    }

    let root = paths::user_themes_dir()?;
    let path = resolve_user_css(&root, id)
        .ok_or_else(|| NotaError::other(format!("No document theme named {id}")))?;
    if path.is_file() {
        check_size(&path, MAX_CSS_BYTES)?;
        return crate::theme_import::load_theme_css(&path);
    }

    Err(NotaError::other(format!("No document theme named {id}")))
}

pub(crate) fn resolve_user_css(root: &Path, id: &str) -> Option<PathBuf> {
    if check_id(id).is_err() {
        return None;
    }
    let package = root.join(id);
    for candidate in [package.join("theme.css"), package.join(format!("{id}.css"))] {
        if candidate.is_file() {
            return Some(candidate);
        }
    }
    let Ok(entries) = std::fs::read_dir(root) else {
        return None;
    };
    for entry in entries.flatten() {
        let package = entry.path();
        if !package.is_dir() {
            continue;
        }
        let Some(manifest) = typora::read_manifest(&package) else {
            continue;
        };
        let Some(theme) = manifest.themes.into_iter().find(|theme| theme.id == id) else {
            continue;
        };
        let Some(relative) = safe_relative_css(&theme.css) else {
            continue;
        };
        let path = package.join(relative);
        if path.is_file() {
            return Some(path);
        }
    }
    None
}

fn safe_relative_css(value: &str) -> Option<PathBuf> {
    let path = Path::new(value);
    if path.is_absolute()
        || value.contains('\0')
        || value.replace('\\', "/").split('/').any(|part| part == "..")
        || !value.to_ascii_lowercase().ends_with(".css")
    {
        return None;
    }
    Some(path.to_path_buf())
}

pub(crate) fn css_scope_root(root: &Path, css_path: &Path) -> PathBuf {
    let parent = css_path.parent().unwrap_or(root);
    if parent == root {
        root.to_path_buf()
    } else {
        parent.to_path_buf()
    }
}

pub(crate) fn check_id(id: &str) -> Result<()> {
    let ok = !id.is_empty()
        && id.len() <= 64
        && id
            .bytes()
            .all(|b| b.is_ascii_alphanumeric() || b == b'-' || b == b'_');
    if ok {
        Ok(())
    } else {
        Err(NotaError::other(format!("Invalid theme id: {id}")))
    }
}

pub(crate) fn scan_user_css_ids(dir: &Path) -> Vec<String> {
    let Ok(entries) = std::fs::read_dir(dir) else {
        return Vec::new();
    };
    let mut out = Vec::new();
    for entry in entries.flatten() {
        let Ok(ft) = entry.file_type() else { continue };
        if ft.is_symlink() {
            continue;
        }
        if ft.is_dir() {
            let Some(id) = entry.file_name().to_str().map(str::to_owned) else {
                continue;
            };
            if resolve_user_css(dir, &id).is_some() {
                out.push(id);
            }
            continue;
        }
    }
    out.sort();
    out.dedup();
    out
}

fn user_theme_infos() -> Vec<DocThemeInfo> {
    let Ok(root) = paths::user_themes_dir() else {
        return Vec::new();
    };
    let mut out = scan_user_css_ids(&root)
        .into_iter()
        .map(|id| DocThemeInfo {
            id: id.clone(),
            name: id,
            builtin: false,
        })
        .collect::<Vec<_>>();
    let Ok(entries) = std::fs::read_dir(&root) else {
        return out;
    };
    for entry in entries.flatten() {
        let package = entry.path();
        if !package.is_dir() {
            continue;
        }
        let Some(manifest) = typora::read_manifest(&package) else {
            continue;
        };
        for theme in manifest.themes {
            if check_id(&theme.id).is_err() {
                continue;
            }
            let Some(relative) = safe_relative_css(&theme.css) else {
                continue;
            };
            if !package.join(relative).is_file() {
                continue;
            }
            out.push(DocThemeInfo {
                id: theme.id,
                name: if theme.name.trim().is_empty() {
                    "Typora".to_owned()
                } else {
                    theme.name
                },
                builtin: false,
            });
        }
    }
    out
}

pub(crate) fn check_size(path: &Path, limit: u64) -> Result<()> {
    let meta = std::fs::metadata(path).map_err(|source| NotaError::Read {
        path: path.to_path_buf(),
        source,
    })?;
    if meta.len() > limit {
        return Err(NotaError::other(format!(
            "Theme file {} is {} bytes, exceeding the {} byte limit",
            path.display(),
            meta.len(),
            limit
        )));
    }
    Ok(())
}

pub fn user_themes_dir() -> Result<String> {
    let dir: PathBuf = paths::user_themes_dir()?;
    paths::ensure_dir(&dir)?;
    paths::path_to_string(&dir)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn builtin_theme_ids_and_files_match() {
        let mut ids = Vec::new();
        for b in BUILTIN {
            assert!(check_id(b.id).is_ok(), "invalid built-in id: {}", b.id);
            assert!(!b.name.is_empty(), "{} has no display name", b.id);
            assert!(
                b.css.contains("--doc-bg"),
                "{} does not define --doc-bg and is probably not a document theme",
                b.id
            );
            ids.push(b.id);
        }
        let n = ids.len();
        ids.sort();
        ids.dedup();
        assert_eq!(ids.len(), n, "duplicate built-in id");
        assert_eq!(
            ids,
            vec!["adwaita", "adwaita-dark"],
            "the bundle should only include Adwaita"
        );
    }

    #[test]
    fn builtin_themes_do_not_touch_interface_variables() {
        const UI_ONLY: &[&str] = &[
            "--ui-font-size",
            "--font-ui",
            "--sidebar-width",
            "--dock-width",
            "--toolbar-height",
            "--statusbar-height",
            "--zen-peek",
            "--shadow",
        ];
        for b in BUILTIN {
            for bad in UI_ONLY {
                assert!(
                    !b.css.contains(bad),
                    "{} contains interface variable {bad}; document themes must not style the shell",
                    b.id
                );
            }
            assert!(
                !b.css.contains("--nota-bridge"),
                "{} still contains a bridge variable from the removed legacy path",
                b.id
            );
        }
    }

    #[test]
    fn builtin_themes_ship_their_own_code_highlighting() {
        for b in BUILTIN {
            for tok in [
                "--code-comment",
                "--code-keyword",
                "--code-string",
                "--code-number",
                "--code-function",
                "--code-attr",
                "--code-tag",
            ] {
                assert!(b.css.contains(tok), "{} is missing {tok}", b.id);
            }
        }
    }

    #[test]
    fn malformed_ids_are_rejected() {
        for bad in [
            "",
            "..",
            "../../etc/passwd",
            "a/b",
            "a\\b",
            "\u{7d20}\u{7eb8}",
            ".hidden",
        ] {
            assert!(check_id(bad).is_err(), "invalid id was accepted: {bad}");
        }
        for good in ["paper", "my-theme", "my_theme_2", "A1"] {
            assert!(check_id(good).is_ok(), "valid id was rejected: {good}");
        }
    }

    #[test]
    fn missing_theme_returns_an_error() {
        let err = css_of("no-such-theme-xyz").unwrap_err();
        assert!(
            err.to_string().contains("No document theme named"),
            "actual: {err}"
        );
    }

    #[test]
    fn missing_user_directory_leaves_only_builtin_themes() {
        let list = discover();
        let builtin_count = list.iter().filter(|t| t.builtin).count();
        assert!(builtin_count <= BUILTIN.len());
        for b in BUILTIN {
            assert!(
                list.iter().any(|t| t.id == b.id),
                "built-in theme {} disappeared from discovery",
                b.id
            );
        }
    }

    #[test]
    fn builtin_adwaita_is_read_only_and_cannot_be_overridden() {
        for id in ["adwaita", "adwaita-dark"] {
            let css = css_of(id).unwrap();
            assert!(
                css.contains("--doc-bg"),
                "{id} did not load its built-in CSS"
            );
        }
    }

    #[test]
    fn only_theme_packages_are_discovered() {
        let stamp = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap()
            .as_nanos();
        let root =
            std::env::temp_dir().join(format!("nota-theme-layout-{}-{stamp}", std::process::id()));
        std::fs::create_dir_all(root.join("dusk/assets")).unwrap();
        std::fs::write(root.join("legacy.css"), "--doc-bg: white;").unwrap();
        std::fs::write(root.join("dusk/theme.css"), "--doc-bg: black;").unwrap();
        std::fs::write(root.join("flat.css"), "--doc-bg: red;").unwrap();

        assert!(
            resolve_user_css(&root, "legacy").is_none(),
            "flat CSS is no longer supported"
        );
        assert!(
            resolve_user_css(&root, "flat").is_none(),
            "root CSS is no longer discovered"
        );
        let package = resolve_user_css(&root, "dusk").unwrap();
        assert_eq!(package, root.join("dusk/theme.css"));
        assert_eq!(css_scope_root(&root, &package), root.join("dusk"));
        assert_eq!(scan_user_css_ids(&root), vec!["dusk".to_owned()]);
        std::fs::remove_dir_all(root).unwrap();
    }
}
