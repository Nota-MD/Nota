use std::ffi::{OsStr, OsString};
use std::path::PathBuf;

pub const NEW_WINDOW_FLAG: &str = "--new-window";

pub const DEBUG_LOG_FLAG: &str = "--debug-log";

pub const DEBUG_WINDOW_FLAG: &str = "--debug-log-window";

pub const SETTINGS_WINDOW_FLAG: &str = "--settings-window";

pub fn first_open_file(args: impl IntoIterator<Item = OsString>) -> Option<PathBuf> {
    args.into_iter()
        .skip(1)
        .find(|a| {
            let s = a.to_string_lossy();
            !s.is_empty() && !s.starts_with('-')
        })
        .map(|arg| parse_file_arg(&arg))
}

pub fn wants_new_window(args: impl IntoIterator<Item = OsString>) -> bool {
    args.into_iter()
        .skip(1)
        .any(|a| a.as_os_str() == OsStr::new(NEW_WINDOW_FLAG))
}

pub fn wants_debug_log(args: impl IntoIterator<Item = OsString>) -> bool {
    args.into_iter()
        .skip(1)
        .any(|arg| arg.as_os_str() == OsStr::new(DEBUG_LOG_FLAG))
}

pub fn wants_debug_window(args: impl IntoIterator<Item = OsString>) -> bool {
    args.into_iter()
        .skip(1)
        .any(|arg| arg.as_os_str() == OsStr::new(DEBUG_WINDOW_FLAG))
}

pub fn opens_settings_window(args: impl IntoIterator<Item = OsString>) -> bool {
    args.into_iter()
        .skip(1)
        .any(|arg| arg.as_os_str() == OsStr::new(SETTINGS_WINDOW_FLAG))
}

fn parse_file_arg(arg: &OsStr) -> PathBuf {
    if let Some(text) = arg.to_str() {
        if is_nota_link(text) {
            if let Some(path) = path_from_nota_link(text) {
                return path;
            }
        }
    }
    PathBuf::from(arg)
}

pub fn is_nota_link(value: &str) -> bool {
    let bytes = value.as_bytes();
    bytes.len() >= 7 && bytes[..7].eq_ignore_ascii_case(b"nota://")
}

/// nota://open?path=%2Fhome%2Fu%2F%E7%AC%94%E8%AE%B0.md

pub fn path_from_nota_link(link: &str) -> Option<PathBuf> {
    let remainder = &link[7..];
    let encoded_path = if remainder.starts_with('/') {
        remainder
    } else {
        let (action, query_and_rest) = match remainder.find(['/', '?']) {
            Some(index) => (&remainder[..index], &remainder[index..]),
            None => (remainder, ""),
        };
        if !action.eq_ignore_ascii_case("open") {
            return None;
        }

        let query = query_and_rest.strip_prefix('?')?;
        query
            .split('&')
            .find_map(|item| item.strip_prefix("path="))?
    };
    let decoded_path = percent_decode(encoded_path)?;
    if !decoded_path.starts_with(b"/") {
        return None;
    }
    path_from_bytes(decoded_path)
}

#[cfg(unix)]
fn path_from_bytes(bytes: Vec<u8>) -> Option<PathBuf> {
    let value: OsString = std::os::unix::ffi::OsStringExt::from_vec(bytes);
    Some(PathBuf::from(value))
}

#[cfg(not(unix))]
fn path_from_bytes(bytes: Vec<u8>) -> Option<PathBuf> {
    let value = String::from_utf8(bytes).ok()?;

    let value = match value.as_bytes() {
        [b'/', drive, b':', ..] if drive.is_ascii_alphabetic() => value[1..].to_string(),
        _ => value,
    };
    Some(PathBuf::from(value))
}

fn percent_decode(input: &str) -> Option<Vec<u8>> {
    let bytes = input.split('#').next()?.as_bytes();
    let mut output = Vec::with_capacity(bytes.len());
    let mut index = 0;
    while index < bytes.len() {
        if bytes[index] == b'%' {
            let high = hex_value(*bytes.get(index + 1)?)?;
            let low = hex_value(*bytes.get(index + 2)?)?;
            output.push(high * 16 + low);
            index += 3;
        } else {
            output.push(bytes[index]);
            index += 1;
        }
    }
    Some(output)
}

fn hex_value(byte: u8) -> Option<u8> {
    match byte {
        b'0'..=b'9' => Some(byte - b'0'),
        b'a'..=b'f' => Some(byte - b'a' + 10),
        b'A'..=b'F' => Some(byte - b'A' + 10),
        _ => None,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn args_3(v: &[&str]) -> Vec<OsString> {
        v.iter().map(OsString::from).collect()
    }

    #[test]
    fn executable_path_is_not_an_open_file() {
        assert_eq!(first_open_file(args_3(&["/usr/bin/nota"])), None);
        assert_eq!(first_open_file(Vec::new()), None);
    }

    #[test]
    fn first_non_flag_argument_is_the_open_file() {
        assert_eq!(
            first_open_file(args_3(&["/usr/bin/nota", "/tmp/\u{7b14}\u{8bb0}.md"])),
            Some(PathBuf::from("/tmp/\u{7b14}\u{8bb0}.md"))
        );
    }

    #[test]
    fn flags_are_skipped_before_the_open_file() {
        assert_eq!(
            first_open_file(args_3(&["nota", "--verbose", "-x", "a.md"])),
            Some(PathBuf::from("a.md"))
        );
        assert_eq!(first_open_file(args_3(&["nota", "--verbose"])), None);
    }

    #[test]
    fn nonexistent_paths_are_not_read_during_argument_parsing() {
        assert_eq!(
            first_open_file(args_3(&[
                "nota",
                "/\u{7edd}\u{5bf9}\u{4e0d}\u{5b58}\u{5728}/\u{7684}/\u{6587}\u{4ef6}.md"
            ])),
            Some(PathBuf::from(
                "/\u{7edd}\u{5bf9}\u{4e0d}\u{5b58}\u{5728}/\u{7684}/\u{6587}\u{4ef6}.md"
            ))
        );
        assert_eq!(first_open_file(args_3(&["nota", ""])), None);
    }

    #[test]
    fn link_decodes_percent_encoded_path() {
        assert_eq!(
            path_from_nota_link("nota://open?path=%2Fhome%2Fu%2F%E7%AC%94%E8%AE%B0.md"),
            Some(PathBuf::from("/home/u/\u{7b14}\u{8bb0}.md"))
        );
    }

    #[test]
    fn short_and_long_link_forms_have_the_same_result() {
        let long_form = path_from_nota_link("nota://open?path=%2Ftmp%2Fa.md");
        let short_form = path_from_nota_link("nota:///%2Ftmp%2Fa.md");
        assert_eq!(long_form, Some(PathBuf::from("/tmp/a.md")));
        assert_eq!(short_form, long_form);
    }

    #[test]
    fn nota_scheme_name_is_case_insensitive() {
        assert!(is_nota_link("NOTA://open?path=%2Ftmp%2Fa.md"));
        assert!(is_nota_link("NoTa:///%2Ftmp%2Fa.md"));
        assert!(
            !is_nota_link("nota:open?path=%2Ftmp%2Fa.md"),
            "missing // is not a link"
        );
        assert!(!is_nota_link("https://example.com"));
    }

    #[test]
    fn plus_signs_remain_literal() {
        assert_eq!(
            path_from_nota_link("nota://open?path=%2Ftmp%2Fa+b.md"),
            Some(PathBuf::from("/tmp/a+b.md"))
        );
    }

    #[test]
    fn unrelated_query_parameters_do_not_affect_path() {
        assert_eq!(
            path_from_nota_link("nota://open?other=1&path=%2Ftmp%2Fa.md&z=2"),
            Some(PathBuf::from("/tmp/a.md"))
        );
        assert_eq!(
            path_from_nota_link("nota://open?path=%2Ftmp%2Fa.md#frag"),
            Some(PathBuf::from("/tmp/a.md"))
        );
    }

    #[test]
    fn undecodable_links_return_none() {
        assert_eq!(path_from_nota_link("nota://open?path="), None, "empty path");
        assert_eq!(
            path_from_nota_link("nota://open?nope=1"),
            None,
            "missing path"
        );
        assert_eq!(
            path_from_nota_link("nota://run?path=%2Ftmp%2Fa.md"),
            None,
            "only open is recognized"
        );
        assert_eq!(
            path_from_nota_link("nota://open?path=%2"),
            None,
            "truncated percent escape"
        );
        assert_eq!(
            path_from_nota_link("nota://open?path=%zz"),
            None,
            "invalid hexadecimal escape"
        );
        assert_eq!(
            path_from_nota_link("nota://open?path=tmp%2Fa.md"),
            None,
            "relative paths are resolved by the browser"
        );
    }

    #[test]
    fn invalid_link_is_not_silently_dropped() {
        let item_to = first_open_file(args_3(&["nota", "nota://open?nope=1"]));
        assert_eq!(
            item_to,
            Some(PathBuf::from("nota://open?nope=1")),
            "keep the URL so it can be reported instead of silently ignoring it"
        );
    }

    #[test]
    fn valid_link_argument_is_already_a_path() {
        assert_eq!(
            first_open_file(args_3(&["nota", "nota://open?path=%2Ftmp%2Fb.md"])),
            Some(PathBuf::from("/tmp/b.md"))
        );
    }

    #[test]
    fn new_window_flag_is_recognized() {
        assert!(wants_new_window(args_3(&["nota", "--new-window"])));
        assert!(wants_new_window(args_3(&[
            "/usr/bin/nota",
            "--new-window",
            "/tmp/\u{7b14}\u{8bb0}.md"
        ])));
        assert!(
            wants_new_window(args_3(&[
                "/usr/bin/nota",
                "/tmp/\u{7b14}\u{8bb0}.md",
                "--new-window"
            ])),
            "the flag can follow a path"
        );
    }

    #[test]
    fn executable_path_is_not_a_flag() {
        assert!(!wants_new_window(args_3(&["--new-window"])));
        assert!(!wants_new_window(Vec::new()));
    }

    #[test]
    fn ordinary_startup_does_not_open_a_new_window() {
        assert!(!wants_new_window(args_3(&["nota"])));
        assert!(!wants_new_window(args_3(&[
            "nota",
            "/tmp/\u{7b14}\u{8bb0}.md"
        ])));
        assert!(
            !wants_new_window(args_3(&["nota", "--new-windowish", "/tmp/a.md"])),
            "a partial flag is not a match"
        );
    }

    #[test]
    fn new_window_flag_does_not_hide_the_open_file() {
        assert_eq!(
            first_open_file(args_3(&[
                "/usr/bin/nota",
                "--new-window",
                "/tmp/\u{7b14}\u{8bb0}.md"
            ])),
            Some(PathBuf::from("/tmp/\u{7b14}\u{8bb0}.md"))
        );
    }

    #[test]
    fn debug_log_flag_is_exact_and_ignores_the_executable() {
        assert!(wants_debug_log(args_3(&["nota", "--debug-log"])));
        assert!(!wants_debug_log(args_3(&["--debug-log"])));
        assert!(!wants_debug_log(args_3(&["nota", "--debug-log-extra"])));
    }

    #[test]
    fn debug_window_flag_is_distinct_from_snapshot_mode() {
        assert!(wants_debug_window(args_3(&["nota", "--debug-log-window"])));
        assert!(!wants_debug_log(args_3(&["nota", "--debug-log-window"])));
        assert!(!wants_debug_window(args_3(&["nota", "--debug-log"])));
    }

    #[test]
    fn standalone_settings_flag_is_distinct() {
        let args = |values: &[&str]| {
            values
                .iter()
                .map(|value| OsString::from(*value))
                .collect::<Vec<_>>()
        };
        assert!(opens_settings_window(args(&["nota", "--settings-window"])));
        assert!(!opens_settings_window(args(&["--settings-window"])));
        assert!(!opens_settings_window(args(&[
            "nota",
            "--debug-log-window"
        ])));
    }
}
