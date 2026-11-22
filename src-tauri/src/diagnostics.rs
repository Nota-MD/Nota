use std::time::Duration;

use crate::proc::{run_capture, Ran, RunOpts};

mod build_info {
    include!(concat!(env!("OUT_DIR"), "/build_info.rs"));
}

#[cfg(not(target_os = "windows"))]
fn first_line(program: &str, args: &[&str]) -> String {
    let args: Vec<String> = args.iter().map(|s| s.to_string()).collect();
    match run_capture(
        program,
        &args,
        RunOpts::timeout(Duration::from_secs(2))
            .env("LC_ALL", "C")
            .env("LANG", "C"),
    ) {
        Ran::Done {
            ok: true, stdout, ..
        } => stdout.lines().next().unwrap_or("").trim().to_string(),
        _ => String::new(),
    }
}

#[cfg(target_os = "linux")]
fn distribution() -> String {
    let contents = match std::fs::read_to_string("/etc/os-release") {
        Ok(contents) => contents,
        Err(_) => return String::new(),
    };
    linux_distribution(&contents)
}

#[cfg(target_os = "macos")]
fn distribution() -> String {
    let version = first_line("sw_vers", &["-productVersion"]);
    if version.is_empty() {
        "macOS".into()
    } else {
        format!("macOS {version}")
    }
}

#[cfg(target_os = "windows")]
fn distribution() -> String {
    windows_distribution(&first_nonempty_line("cmd", &["/C", "ver"]))
}

#[cfg(not(target_os = "windows"))]
fn kernel_version() -> String {
    first_line("uname", &["-r"])
}

#[cfg(target_os = "windows")]
fn kernel_version() -> String {
    let raw = first_nonempty_line("cmd", &["/C", "ver"]);
    windows_kernel(&raw)
}

#[cfg(target_os = "windows")]
fn first_nonempty_line(program: &str, args: &[&str]) -> String {
    let args: Vec<String> = args.iter().map(|s| s.to_string()).collect();
    match run_capture(
        program,
        &args,
        RunOpts::timeout(Duration::from_secs(2))
            .env("LC_ALL", "C")
            .env("LANG", "C"),
    ) {
        Ran::Done {
            ok: true, stdout, ..
        } => stdout
            .lines()
            .map(str::trim)
            .find(|line| !line.is_empty())
            .unwrap_or("")
            .to_string(),
        _ => String::new(),
    }
}

#[cfg(target_os = "linux")]
fn linux_distribution(contents: &str) -> String {
    let mut name = "";
    let mut version = "";
    for line in contents.lines() {
        let value = |prefix: &str| {
            line.strip_prefix(prefix)
                .map(|value| value.trim().trim_matches('"'))
        };
        if let Some(value) = value("NAME=") {
            name = value;
        } else if let Some(value) = value("VERSION_ID=") {
            version = value;
        }
    }
    match (name.is_empty(), version.is_empty()) {
        (false, false) => format!("{name} {version}"),
        (false, true) => name.to_string(),
        _ => "Linux".to_string(),
    }
}

#[cfg(any(target_os = "windows", test))]
fn version_token(text: &str) -> String {
    text.split(|c: char| c.is_whitespace() || matches!(c, '[' | ']' | '(' | ')'))
        .find(|part| part.chars().next().is_some_and(|c| c.is_ascii_digit()) && part.contains('.'))
        .unwrap_or("")
        .trim_matches(|c: char| !c.is_ascii_digit() && c != '.')
        .to_string()
}

#[cfg(any(target_os = "windows", test))]
fn windows_distribution(raw: &str) -> String {
    let version = version_token(raw);
    if version.is_empty() {
        "Windows".into()
    } else {
        format!("Windows {version}")
    }
}

#[cfg(any(target_os = "windows", test))]
fn windows_kernel(raw: &str) -> String {
    version_token(raw)
}

#[cfg(target_os = "linux")]
fn gtk_runtime_version() -> String {
    format!(
        "{}.{}.{}",
        gtk::major_version(),
        gtk::minor_version(),
        gtk::micro_version()
    )
}

#[cfg(not(target_os = "linux"))]
fn gtk_runtime_version() -> String {
    String::new()
}

#[cfg(target_os = "linux")]
fn webkit_runtime_version() -> String {
    unsafe {
        format!(
            "{}.{}.{}",
            webkit2gtk::ffi::webkit_get_major_version(),
            webkit2gtk::ffi::webkit_get_minor_version(),
            webkit2gtk::ffi::webkit_get_micro_version()
        )
    }
}

#[cfg(not(target_os = "linux"))]
fn webkit_runtime_version() -> String {
    String::new()
}

#[derive(Debug, Clone, serde::Serialize)]
pub struct Diagnostics {
    pub version: String,

    pub build_time: u64,
    pub build_host: String,
    pub build_platform: String,
    pub target: String,
    pub profile: String,
    pub rustc: String,
    pub cargo: String,
    pub node: String,
    pub npm: String,
    pub tauri: String,
    pub webkit_crate: String,
    pub gtk_crate: String,
    pub mlua: String,

    pub os_pretty: String,
    pub kernel: String,
    pub arch: String,
    pub gtk_runtime: String,
    pub webkit_runtime: String,
}

pub fn collect() -> Diagnostics {
    Diagnostics {
        version: env!("CARGO_PKG_VERSION").to_string(),
        build_time: build_info::BUILD_TIME,
        build_host: build_info::BUILD_HOST.to_string(),
        build_platform: build_info::BUILD_PLATFORM.to_string(),
        target: build_info::TARGET_TRIPLE.to_string(),
        profile: build_info::BUILD_PROFILE.to_string(),
        rustc: build_info::RUSTC.to_string(),
        cargo: build_info::CARGO.to_string(),
        node: build_info::NODE.to_string(),
        npm: build_info::NPM.to_string(),
        tauri: build_info::TAURI_VERSION.to_string(),
        webkit_crate: build_info::WEBKIT_CRATE_VERSION.to_string(),
        gtk_crate: build_info::GTK_CRATE_VERSION.to_string(),
        mlua: build_info::MLUA_VERSION.to_string(),
        os_pretty: distribution(),
        kernel: kernel_version(),
        arch: std::env::consts::ARCH.to_string(),
        gtk_runtime: gtk_runtime_version(),
        webkit_runtime: webkit_runtime_version(),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn collects_nonempty_required_fields() {
        let report = collect();

        assert!(
            !report.version.is_empty(),
            "package version must not be empty"
        );
        assert!(!report.target.is_empty(), "target triple must not be empty");

        #[cfg(target_os = "linux")]
        {
            assert_ne!(
                report.gtk_runtime, "0.0.0",
                "GTK runtime version must not be 0.0.0"
            );
            assert_ne!(
                report.webkit_runtime, "0.0.0",
                "WebKitGTK runtime version must not be 0.0.0"
            );
        }

        #[cfg(not(target_os = "linux"))]
        {
            assert!(report.gtk_runtime.is_empty());
            assert!(report.webkit_runtime.is_empty());
        }
    }

    #[test]
    fn unavailable_values_are_empty_instead_of_panicking() {
        assert_eq!(first_line("nota-command-that-does-not-exist", &[]), "");
    }

    #[test]
    fn build_time_is_a_plausible_unix_timestamp() {
        assert!(collect().build_time > 1_577_836_800);
    }

    #[test]
    fn linux_distribution_uses_stable_english_components() {
        let text = "NAME=\"Fedora Linux\"\nVERSION_ID=44\nPRETTY_NAME=\"\u{672c}\u{5730}\u{5316}\u{540d}\u{79f0}\"\n";
        assert_eq!(linux_distribution(text), "Fedora Linux 44");
    }

    #[test]
    fn localized_windows_version_normalizes_to_english_name_and_version() {
        let text = "Microsoft Windows [\u{7248}\u{672c} 10.0.26100.3915]";
        assert_eq!(windows_distribution(text), "Windows 10.0.26100.3915");
        assert_eq!(windows_kernel(text), "10.0.26100.3915");
    }

    #[test]
    fn unparsable_windows_output_does_not_leak_localized_text() {
        assert_eq!(
            windows_distribution("Microsoft Windows [\u{7248}\u{672c} \u{672a}\u{77e5}]"),
            "Windows"
        );
        assert_eq!(
            windows_kernel("Microsoft Windows [\u{7248}\u{672c} \u{672a}\u{77e5}]"),
            ""
        );
    }
}
