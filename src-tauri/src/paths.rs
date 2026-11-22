use std::path::{Path, PathBuf};

use crate::error::{NotaError, Result};

pub const APP_DIR: &str = "nota";

pub fn config_dir() -> Result<PathBuf> {
    let base = dirs::config_dir().ok_or(NotaError::NoHomeDir)?;
    Ok(base.join(APP_DIR))
}

pub fn data_dir() -> Result<PathBuf> {
    let base = dirs::data_dir().ok_or(NotaError::NoHomeDir)?;
    Ok(base.join(APP_DIR))
}

pub fn cache_dir() -> Result<PathBuf> {
    let base = dirs::cache_dir().ok_or(NotaError::NoHomeDir)?;
    Ok(base.join(APP_DIR))
}

pub fn settings_file() -> Result<PathBuf> {
    Ok(config_dir()?.join("settings.toml"))
}

pub fn dev_bridge_file() -> Result<PathBuf> {
    Ok(config_dir()?.join("dev-bridge.toml"))
}

pub fn plugin_state_file() -> Result<PathBuf> {
    Ok(config_dir()?.join("plugins.toml"))
}

pub fn trusted_keys_file() -> Result<PathBuf> {
    Ok(config_dir()?.join("trusted-keys.toml"))
}

pub fn user_plugins_dir() -> Result<PathBuf> {
    Ok(data_dir()?.join("plugins"))
}

pub fn plugin_settings_dir() -> Result<PathBuf> {
    Ok(config_dir()?.join("plugin-settings"))
}

pub fn plugin_settings_file(plugin_id: &str) -> Result<PathBuf> {
    Ok(plugin_settings_dir()?.join(format!("{}.toml", safe_filename(plugin_id))))
}

pub fn image_upload_file() -> Result<PathBuf> {
    Ok(config_dir()?.join("image-upload.toml"))
}

pub fn table_widths_file() -> Result<PathBuf> {
    Ok(data_dir()?.join("table-widths.toml"))
}

pub fn session_file() -> Result<PathBuf> {
    Ok(data_dir()?.join("session.toml"))
}

/// A draft is an application safety copy, not a user document. Keeping it under

pub fn drafts_dir() -> Result<PathBuf> {
    Ok(data_dir()?.join("drafts"))
}

pub fn plugin_data_dir(plugin_id: &str) -> Result<PathBuf> {
    Ok(data_dir()?
        .join("plugin-data")
        .join(safe_filename(plugin_id)))
}

pub fn safe_filename(plugin_id: &str) -> String {
    let mut out = String::with_capacity(plugin_id.len());
    for c in plugin_id.chars() {
        if c.is_ascii_alphanumeric() || matches!(c, '.' | '-' | '_') {
            out.push(c);
        } else {
            out.push('_');
        }
    }

    if out.is_empty() || out.chars().all(|c| c == '.') {
        out.insert_str(0, "plugin-");
    }
    out
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn start_emit_platform_thread_see_replace_static_edit_two_at_see_same_record_plugin_store_store_at_see_old_target(
    ) {
        let character_source = Path::new("/\u{5047}\u{8d44}\u{6e90}\u{76ee}\u{5f55}");
        let main_store_store = Path::new(env!("CARGO_MANIFEST_DIR"))
            .parent()
            .expect("src-tauri \u{7684}\u{4e0a}\u{4e00}\u{7ea7}");
        let sibling_base = main_store_store
            .parent()
            .expect("\u{5de5}\u{4f5c}\u{533a}\u{90a3}\u{4e00}\u{7ea7}")
            .join("Nota-plugins")
            .join("plugins");
        let old_target = main_store_store.join("plugins");

        let mut directory_list = start_emit_platform_candidates(None, main_store_store);
        directory_list.push(character_source.join("plugins"));
        let i_sibling_base = directory_list
            .iter()
            .position(|p| p == &sibling_base)
            .expect(
                "\u{540c}\u{7ea7}\u{63d2}\u{4ef6}\u{4ed3}\u{5e93}\u{90a3}\u{4e00}\u{6863}\u{5728}",
            );
        let i_old = directory_list
            .iter()
            .position(|p| p == &old_target)
            .expect("\u{8001}\u{843d}\u{70b9}\u{90a3}\u{4e00}\u{6863}\u{5728}");
        assert!(i_sibling_base < i_old, "\u{540c}\u{7ea7}\u{63d2}\u{4ef6}\u{4ed3}\u{5e93}\u{5fc5}\u{987b}\u{6392}\u{5728}\u{8fd9}\u{4e2a}\u{4e4b}\u{524d}\u{ff1a}{directory_list:?}");
        assert_eq!(
            directory_list.last(),
            Some(&character_source.join("plugins")),
            "\u{8d44}\u{6e90}\u{5feb}\u{7167}\u{6c38}\u{8fdc}\u{57ab}\u{5e95}"
        );

        let candidates_2 = start_emit_platform_candidates(None, main_store_store);
        assert_eq!(candidates_2.first(), Some(&sibling_base), "\u{540c}\u{7ea7}\u{63d2}\u{4ef6}\u{4ed3}\u{5e93}\u{5fc5}\u{987b}\u{662f}\u{7b2c}\u{4e00}\u{4e2a}\u{ff1a}{candidates_2:?}");
        assert_eq!(
            candidates_2.last(),
            Some(&old_target),
            "\u{8001}\u{843d}\u{70b9}\u{57ab}\u{5e95}"
        );

        let candidates_2 = start_emit_platform_candidates(
            Some(PathBuf::from("/\u{522b}\u{5904}/plugins")),
            main_store_store,
        );
        assert_eq!(
            candidates_2,
            vec![PathBuf::from("/\u{522b}\u{5904}/plugins")],
            "\u{8bbe}\u{4e86}\u{5c31}\u{4e0d}\u{8bb8}\u{518d}\u{515c}\u{5e95}"
        );
    }

    #[test]
    fn plugin_id_inner_path_part_service_out_not_filename() {
        for id in [
            "nota/../../etc/passwd",
            "../../x",
            "a\\b",
            "a/b",
            "",
            ".",
            "..",
            "...",
            "\0",
        ] {
            let name = safe_filename(id);
            assert!(
                !name.contains('/') && !name.contains('\\'),
                "`{id}` \u{53d8}\u{6210} `{name}`\u{ff0c}\u{91cc}\u{9762}\u{8fd8}\u{6709}\u{8def}\u{5f84}\u{5206}\u{9694}\u{7b26}\u{2014}\u{2014}\u{90a3}\u{5c31}\u{80fd}\u{5199}\u{5230}\u{522b}\u{7684}\u{76ee}\u{5f55}\u{53bb}"
            );
            assert!(
                !name.is_empty(),
                "`{id}` \u{53d8}\u{6210}\u{4e86}\u{7a7a}\u{6587}\u{4ef6}\u{540d}"
            );
            assert!(
                !name.chars().all(|c| c == '.'),
                "`{id}` \u{53d8}\u{6210} `{name}`\u{ff0c}\u{8fd8}\u{662f}\u{4e2a}\u{7eaf}\u{70b9}\u{7684}\u{540d}\u{5b57}\u{ff08}`..` \u{6307}\u{5411}\u{4e0a}\u{7ea7}\u{76ee}\u{5f55}\u{ff09}"
            );
        }
    }

    #[test]
    fn validate_long_plugin_id_source_sample_package_stream() {
        assert_eq!(safe_filename("nota.ai"), "nota.ai");
        assert_eq!(safe_filename("nota_git-2"), "nota_git-2");
    }

    #[test]
    fn old_theme_package_service_only_to_new_directory_cut_not_service_change_one_has_content() {
        let root = std::env::temp_dir().join(format!(
            "nota-theme-migrate-{}-{}",
            std::process::id(),
            std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .unwrap()
                .as_nanos()
        ));
        let old = root.join("old");
        let current = root.join("current");
        std::fs::create_dir_all(old.join("cde/assets")).unwrap();
        std::fs::create_dir_all(current.join("cde")).unwrap();
        std::fs::write(old.join("cde/theme.css"), "new").unwrap();
        std::fs::write(old.join("cde/assets/font.ttf"), "font").unwrap();
        std::fs::write(current.join("cde/theme.css"), "keep").unwrap();
        std::fs::create_dir_all(old.join("latex")).unwrap();
        std::fs::write(old.join("latex/theme.css"), "latex").unwrap();

        migrate_theme_children(&old, &current, &[]).unwrap();

        assert_eq!(
            std::fs::read_to_string(current.join("cde/theme.css")).unwrap(),
            "keep",
            "\u{89c4}\u{8303}\u{76ee}\u{5f55}\u{5df2}\u{6709}\u{4e3b}\u{9898}\u{65f6}\u{4e0d}\u{80fd}\u{8986}\u{76d6}"
        );
        assert_eq!(
            std::fs::read_to_string(current.join("latex/theme.css")).unwrap(),
            "latex"
        );
        std::fs::remove_dir_all(root).unwrap();
    }
}

pub fn user_themes_dir() -> Result<PathBuf> {
    Ok(config_dir()?.join("themes").join("document"))
}

pub fn user_ui_styles_dir() -> Result<PathBuf> {
    Ok(config_dir()?.join("themes").join("ui"))
}

pub fn ensure_theme_directories() -> Result<()> {
    ensure_dir(&user_themes_dir()?)?;
    ensure_dir(&user_ui_styles_dir()?)?;
    Ok(())
}

pub fn migrate_legacy_theme_directories() -> Result<()> {
    let config = config_dir()?;
    let themes = config.join("themes");
    let document = user_themes_dir()?;
    let ui = user_ui_styles_dir()?;
    let old_ui = config.join("ui-styles");

    migrate_theme_children(&themes, &document, &["document", "ui"])?;
    migrate_theme_children(&old_ui, &ui, &[])?;
    Ok(())
}

fn migrate_theme_children(from: &Path, to: &Path, skip: &[&str]) -> Result<()> {
    let entries = match std::fs::read_dir(from) {
        Ok(entries) => entries,
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => return Ok(()),
        Err(source) => {
            return Err(NotaError::Read {
                path: from.to_path_buf(),
                source,
            })
        }
    };
    for entry in entries.flatten() {
        let Ok(kind) = entry.file_type() else {
            continue;
        };
        if !kind.is_dir() || kind.is_symlink() {
            continue;
        }
        let name = entry.file_name();
        let Some(id) = name.to_str() else { continue };
        if skip.contains(&id) || crate::themes::check_id(id).is_err() {
            continue;
        }
        let source = entry.path();
        if !source.join("theme.css").is_file() && !source.join(format!("{id}.css")).is_file() {
            continue;
        }
        let target = to.join(id);
        if target.exists() {
            continue;
        }
        let staging = to.join(format!(".migrating-{id}-{}", std::process::id()));
        let _ = remove_tree(&staging);
        if copy_theme_tree(&source, &staging).is_ok() {
            let _ = std::fs::rename(&staging, &target);
        }
        let _ = remove_tree(&staging);
    }
    Ok(())
}

fn copy_theme_tree(from: &Path, to: &Path) -> std::io::Result<()> {
    std::fs::create_dir_all(to)?;
    for entry in std::fs::read_dir(from)? {
        let entry = entry?;
        let kind = entry.file_type()?;
        if kind.is_symlink() {
            continue;
        }
        let target = to.join(entry.file_name());
        if kind.is_dir() {
            copy_theme_tree(&entry.path(), &target)?;
        } else if kind.is_file() {
            std::fs::copy(entry.path(), target)?;
        }
    }
    Ok(())
}

fn remove_tree(path: &Path) -> std::io::Result<()> {
    match std::fs::remove_dir_all(path) {
        Ok(()) => Ok(()),
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => Ok(()),
        Err(error) => Err(error),
    }
}

fn start_emit_platform_candidates(env: Option<PathBuf>, main_store_store: &Path) -> Vec<PathBuf> {
    if let Some(e) = env {
        return vec![e];
    }
    let mut out = Vec::new();
    if let Some(workspace_2) = main_store_store.parent() {
        out.push(workspace_2.join("Nota-plugins").join("plugins"));
    }
    out.push(main_store_store.join("plugins"));
    out
}

pub fn builtin_plugins_dirs(resource_dir: Option<&Path>) -> Vec<PathBuf> {
    let mut out = Vec::new();

    if cfg!(debug_assertions) {
        if let Some(main_store_store) = Path::new(env!("CARGO_MANIFEST_DIR")).parent() {
            let env = std::env::var_os("NOTA_PLUGINS_DIR").map(PathBuf::from);
            out.extend(start_emit_platform_candidates(env, main_store_store));
        }
    }

    if let Some(res) = resource_dir {
        out.push(res.join("plugins"));
    }

    out
}

pub fn path_to_string(path: &Path) -> Result<String> {
    path.to_str()
        .map(str::to_owned)
        .ok_or_else(|| NotaError::NonUtf8Path(path.to_path_buf()))
}

pub fn ensure_dir(path: &Path) -> Result<()> {
    std::fs::create_dir_all(path).map_err(|source| NotaError::Write {
        path: path.to_path_buf(),
        source,
    })
}
