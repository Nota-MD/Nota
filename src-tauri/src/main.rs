//

#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

#[cfg(all(feature = "diagnostic-console", target_os = "windows"))]
fn start_diagnostic_console() {
    use std::io::Write as _;

    let internal_window = std::env::args_os().any(|arg| {
        arg.to_str().is_some_and(|argument| {
            argument.starts_with("--nota-window=")
                || matches!(
                    argument,
                    "--settings-window" | "--debug-log-window" | "--new-window" | "--about-window"
                )
        })
    });
    if internal_window {
        return;
    }

    let Ok(path) = nota_lib::log::log_path().ok_or(()) else {
        return;
    };
    if let Some(parent) = path.parent() {
        let _ = std::fs::create_dir_all(parent);
    }
    if !path.exists() {
        if let Ok(mut file) = std::fs::OpenOptions::new()
            .create(true)
            .append(true)
            .open(&path)
        {
            let _ = writeln!(file, "Nota diagnostic console log");
        }
    }

    let quoted = path.to_string_lossy().replace('\'', "''");
    let script = format!(
        "$Host.UI.RawUI.WindowTitle='Nota Diagnostics'; \
         Write-Host 'Nota diagnostic log (live)'; \
         Get-Content -LiteralPath '{quoted}' -Wait"
    );
    let _ = std::process::Command::new("powershell.exe")
        .args([
            "-NoLogo",
            "-NoExit",
            "-ExecutionPolicy",
            "Bypass",
            "-Command",
            &script,
        ])
        .spawn();
}

fn main() {
    #[cfg(feature = "diagnostic-console")]
    {
        nota_lib::log::set_debug_mode(true);
        nota_lib::log::record("[nota] diagnostic console build starting".to_owned());
    }
    #[cfg(all(feature = "diagnostic-console", target_os = "windows"))]
    start_diagnostic_console();
    nota_lib::run()
}
