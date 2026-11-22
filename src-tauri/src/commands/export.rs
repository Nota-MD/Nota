use std::path::{Path, PathBuf};

use base64::Engine;
use tauri::AppHandle;
use tauri_plugin_opener::OpenerExt;

use crate::error::{NotaError, Result};
use crate::paths::path_to_string;

const PRINT_FILE: &str = ".nota-print.html";

const PRINT_FILE_TMP: &str = "nota-print";

#[tauri::command]
pub fn nota_export_write(path: String, content: String) -> Result<String> {
    let target = PathBuf::from(&path);
    std::fs::write(&target, content.as_bytes()).map_err(|source| NotaError::Write {
        path: target.clone(),
        source,
    })?;
    path_to_string(&target)
}

#[tauri::command]
pub fn nota_export_write_bytes(path: String, base64: String) -> Result<String> {
    let bytes = base64::engine::general_purpose::STANDARD
        .decode(base64.as_bytes())
        .map_err(|error| NotaError::other(format!("Invalid base64 data: {error}")))?;

    let target = PathBuf::from(&path);
    std::fs::write(&target, &bytes).map_err(|source| NotaError::Write {
        path: target.clone(),
        source,
    })?;
    path_to_string(&target)
}

#[tauri::command]
pub fn nota_export_print(
    app: AppHandle,
    doc_path: Option<String>,
    title: String,
    content: String,
) -> Result<String> {
    let target = print_target(doc_path.as_deref(), &title);
    std::fs::write(&target, content.as_bytes()).map_err(|source| NotaError::Write {
        path: target.clone(),
        source,
    })?;

    let shown = path_to_string(&target)?;
    if hand_to_system_print(&shown) {
        return Ok(shown);
    }
    app.opener()
        .open_path(shown.clone(), None::<&str>)
        .map_err(|error| {
            NotaError::other(format!(
                "The print file was written to {shown}, but the system could not open it: {error}. Open it manually to print."
            ))
        })?;

    Ok(shown)
}

#[cfg(target_os = "windows")]
fn hand_to_system_print(path_3: &str) -> bool {
    use std::ffi::c_void;
    use windows_sys::Win32::UI::Shell::ShellExecuteW;
    use windows_sys::Win32::UI::WindowsAndMessaging::SW_SHOWNORMAL;

    fn width(s: &str) -> Vec<u16> {
        s.encode_utf16().chain(std::iter::once(0)).collect()
    }
    let dynamic_word = width("print");
    let file_3 = width(path_3);

    let result_3 = unsafe {
        ShellExecuteW(
            std::ptr::null_mut::<c_void>() as _,
            dynamic_word.as_ptr(),
            file_3.as_ptr(),
            std::ptr::null(),
            std::ptr::null(),
            SW_SHOWNORMAL,
        )
    };
    result_3 as isize > 32
}

#[cfg(not(target_os = "windows"))]
fn hand_to_system_print(_path_2: &str) -> bool {
    false
}

#[tauri::command]
pub fn nota_export_reveal(app: AppHandle, path: String) -> Result<String> {
    let target = PathBuf::from(&path);
    let shown = path_to_string(&target)?;
    app.opener().reveal_item_in_dir(&target).map_err(|error| {
        NotaError::other(format!(
            "Could not reveal {shown} in the file manager: {error}"
        ))
    })?;
    Ok(shown)
}

fn print_target(doc_path: Option<&str>, title: &str) -> PathBuf {
    if let Some(dir) = doc_path.and_then(|p| Path::new(p).parent()) {
        if !dir.as_os_str().is_empty() {
            return dir.join(PRINT_FILE);
        }
    }
    std::env::temp_dir().join(format!("{PRINT_FILE_TMP}-{}.html", request_filename(title)))
}

fn request_filename(title: &str) -> String {
    let cleaned: String = title
        .trim()
        .chars()
        .map(|c| match c {
            '/' | '\\' | ':' | '*' | '?' | '"' | '<' | '>' | '|' => '-',
            _ => c,
        })
        .collect();

    if cleaned.is_empty() || cleaned.chars().all(|c| c == '-') {
        "Untitled".to_string()
    } else {
        cleaned
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn print_target_uses_the_document_directory() {
        let p = print_target(Some("/home/u/docs/\u{7b14}\u{8bb0}.md"), "\u{7b14}\u{8bb0}");
        assert_eq!(p, PathBuf::from("/home/u/docs").join(PRINT_FILE));
    }

    #[test]
    fn missing_document_path_uses_the_system_temp_directory() {
        let p = print_target(None, "\u{65b0}\u{5efa}\u{6587}\u{6863}");
        assert_eq!(p.parent(), Some(std::env::temp_dir().as_path()));

        assert!(p
            .to_string_lossy()
            .contains("\u{65b0}\u{5efa}\u{6587}\u{6863}"));
    }

    #[test]
    fn title_separators_are_replaced_instead_of_escaping_the_directory() {
        let p = print_target(None, "a/b:c");
        let name = p.file_name().unwrap().to_string_lossy().to_string();
        assert!(!name.contains('/'), "{name}");
        assert!(name.contains("a-b-c"), "{name}");
    }

    #[test]
    fn empty_or_slash_only_titles_leave_no_untracked_or_hidden_file() {
        for source in ["", "   ", "///"] {
            let p = print_target(None, source);
            let name = p.file_name().unwrap().to_string_lossy().to_string();
            assert!(
                name.contains("Untitled"),
                "\u{300c}{source}\u{300d}\u{2192} {name}"
            );
        }
    }

    #[test]
    fn written_bytes_match_input() {
        let dir = std::env::temp_dir().join("nota-export-test");
        std::fs::create_dir_all(&dir).unwrap();
        let target = dir.join("out.html");

        let body = "<p>\u{4f60}\u{597d} \u{1f389}</p>\n";
        nota_export_write(target.to_string_lossy().to_string(), body.to_string()).unwrap();
        let back = std::fs::read_to_string(&target).unwrap();
        assert_eq!(back, body);
        let _ = std::fs::remove_dir_all(&dir);
    }

    #[test]
    fn base64_write_out_incoming_character_boundary_and_encoding_before_one_suffix_one_sample() {
        let dir = std::env::temp_dir().join("nota-export-bytes-test");
        std::fs::create_dir_all(&dir).unwrap();
        let target = dir.join("out.png");

        let source = [
            0x89u8, b'P', b'N', b'G', 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0xff, 0x80,
        ];
        let encoding_2 = base64::engine::general_purpose::STANDARD.encode(source);
        nota_export_write_bytes(target.to_string_lossy().to_string(), encoding_2).unwrap();
        assert_eq!(std::fs::read(&target).unwrap(), source);

        let _ = std::fs::remove_dir_all(&dir);
    }

    #[test]
    fn broken_drop_base64_package_error_two_cut_not_stream_lower_half_file() {
        let dir = std::env::temp_dir().join("nota-export-bad-b64-test");
        std::fs::create_dir_all(&dir).unwrap();
        let target = dir.join("out.png");

        let r = nota_export_write_bytes(target.to_string_lossy().to_string(), "!!!!".into());
        assert!(r.is_err(), "{r:?}");

        assert!(!target.exists(), "\u{89e3}\u{4e0d}\u{5f00}\u{7684}\u{65f6}\u{5019}\u{4e0d}\u{8be5}\u{5199}\u{51fa}\u{6587}\u{4ef6}");
        let _ = std::fs::remove_dir_all(&dir);
    }
}
