use std::path::{Path, PathBuf};

pub const DESKTOP_FILE: &str = "nota-url-handler.desktop";

pub const SCHEME: &str = "nota";

pub fn desktop_surface_item_content(exe: &Path) -> String {
    format!(
        "[Desktop Entry]\n\
         Type=Application\n\
         Name=Nota\n\
         Comment=Open Markdown notes in Nota\n\
         Exec=\"{}\" %u\n\
         Terminal=false\n\
         NoDisplay=true\n\
         Categories=Utility;\n\
         MimeType=x-scheme-handler/{SCHEME};\n",
        exe.display()
    )
}

pub fn desktop_surface_item_path() -> crate::error::Result<PathBuf> {
    let data_directory_value = dirs::data_dir().ok_or(crate::error::NotaError::NoHomeDir)?;
    Ok(data_directory_value.join("applications").join(DESKTOP_FILE))
}

pub fn need_middle_write(existing_content: Option<&str>, new: &str) -> bool {
    match existing_content {
        Some(s) => s != new,
        None => true,
    }
}

pub fn close_link_args() -> Vec<String> {
    vec![
        "default".to_owned(),
        DESKTOP_FILE.to_owned(),
        format!("x-scheme-handler/{SCHEME}"),
    ]
}

pub fn main_side() {
    match main_side_inner_not() {
        Ok(()) => {}
        Err(e) => {
            crate::debug_log!("[nota] failed to register nota:// handler (startup continues): {e}")
        }
    }
}

fn main_side_inner_not() -> crate::error::Result<()> {
    use crate::error::NotaError;

    let exe = std::env::current_exe()
        .map_err(|e| NotaError::Other(format!("Could not determine the executable path: {e}")))?;
    let wanted_content = desktop_surface_item_content(&exe);
    let target_3 = desktop_surface_item_path()?;

    let existing_content = std::fs::read_to_string(&target_3).ok();
    if !need_middle_write(existing_content.as_deref(), &wanted_content) {
        return Ok(());
    }

    if let Some(service) = target_3.parent() {
        crate::paths::ensure_dir(service)?;
    }
    std::fs::write(&target_3, wanted_content).map_err(|e| NotaError::Write {
        path: target_3.clone(),
        source: e,
    })?;
    crate::debug_log!("[nota] wrote desktop entry {}", target_3.display());

    match crate::proc::background_command("xdg-mime")
        .args(close_link_args())
        .status()
    {
        Ok(state) if state.success() => {
            crate::debug_log!("[nota] associated nota:// with {DESKTOP_FILE}")
        }
        Ok(state) => crate::debug_log!(
            "[nota] xdg-mime exited with {:?}; association failed",
            state.code()
        ),
        Err(e) => crate::debug_log!(
            "[nota] could not start xdg-mime ({e}); desktop entry written without association"
        ),
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn desktop_surface_item_inner_change_has_that_record_check_all_at() {
        let text = desktop_surface_item_content(Path::new("/usr/bin/nota"));
        assert!(text.contains("MimeType=x-scheme-handler/nota;"), "\u{8ba4}\u{4e0d}\u{8ba4}\u{8fd9}\u{4e2a}\u{534f}\u{8bae}\u{5168}\u{9760}\u{8fd9}\u{4e00}\u{884c}");
        assert!(
            text.contains("Exec=\"/usr/bin/nota\" %u"),
            "\u{600e}\u{4e48}\u{8d77}\u{3001}\u{53c2}\u{6570}\u{653e}\u{54ea}\u{513f}"
        );
        assert!(
            text.starts_with("[Desktop Entry]\n"),
            "\u{7b2c}\u{4e00}\u{884c}\u{5fc5}\u{987b}\u{662f}\u{7ec4}\u{540d}"
        );
        assert!(text.contains("Type=Application"), "\u{5c11}\u{4e86}\u{5b83}\u{4e0d}\u{5c11}\u{684c}\u{9762}\u{73af}\u{5883}\u{76f4}\u{63a5}\u{4e0d}\u{8ba4}\u{8fd9}\u{4e2a}\u{6587}\u{4ef6}");
    }

    #[test]
    fn can_only_line_file_path_pending_empty_page_need_infer_start_incoming() {
        let text = desktop_surface_item_content(Path::new("/opt/my apps/nota"));
        assert!(text.contains("Exec=\"/opt/my apps/nota\" %u"));
    }

    #[test]
    fn args_expand_position_service_is_single_u() {
        let text = desktop_surface_item_content(Path::new("/usr/bin/nota"));
        assert!(text.contains(" %u\n"), "\u{5360}\u{4f4d}\u{7b26}\u{540e}\u{9762}\u{90a3}\u{4e00}\u{884c}\u{662f}\u{6211}\u{4eec}\u{81ea}\u{5df1}\u{7684}\u{6362}\u{884c}\u{ff0c}\u{7528}\u{6765}\u{9489}\u{4f4f}\u{5b83}\u{6ca1}\u{88ab}\u{5199}\u{6210}\u{522b}\u{7684}");
        assert!(!text.contains("%U"));
    }

    #[test]
    fn content_one_sample_old_not_middle_write() {
        let text = desktop_surface_item_content(Path::new("/usr/bin/nota"));
        assert!(!need_middle_write(Some(&text), &text));
        assert!(
            need_middle_write(None, &text),
            "\u{6ca1}\u{6709}\u{8fd9}\u{4e00}\u{4efd}\u{ff0c}\u{8981}\u{5199}"
        );
        assert!(
            need_middle_write(Some("[Desktop Entry]\nName=\u{522b}\u{7684}\n"), &text),
            "\u{522b}\u{4eba}\u{5360}\u{4e86}\u{8fd9}\u{4e2a}\u{540d}\u{5b57}\u{4e5f}\u{8981}\u{6539}\u{5199}\u{5b83}\u{ff08}\u{90a3}\u{662f}\u{6211}\u{4eec}\u{81ea}\u{5df1}\u{7684}\u{6587}\u{4ef6}\u{540d}\u{ff0c}\u{89c1}\u{6587}\u{4ef6}\u{5934}\u{ff09}"
        );
    }

    #[test]
    fn xdgmime_args_sequence_required_is_default_at_before() {
        let arguments_value = close_link_args();
        assert_eq!(arguments_value[0], "default");
        assert_eq!(arguments_value[1], DESKTOP_FILE);
        assert_eq!(arguments_value[2], "x-scheme-handler/nota");
    }

    #[test]
    fn write_one_name_and_cli_that_edit_say_ok_is_same_one() {
        assert_eq!(SCHEME, "nota");
        assert!(crate::cli::is_nota_link(&format!(
            "{SCHEME}://open?path=%2Ftmp%2Fa.md"
        )));
    }
}
