use std::collections::BTreeMap;
use std::fs;
use std::path::{Path, PathBuf};
use std::process::Stdio;
use std::time::Duration;

use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};

use crate::error::{NotaError, Result};
use crate::remote;

const MANIFEST_LIMIT: u64 = 1024 * 1024;
const PACKAGE_LIMIT: u64 = 256 * 1024 * 1024;
const MANIFEST_TIMEOUT: Duration = Duration::from_secs(30);
const PACKAGE_TIMEOUT: Duration = Duration::from_secs(600);

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "kebab-case")]
pub enum InstallKind {
    Dev,
    Deb,
    Rpm,
    AppImage,
    Exe,
    #[serde(rename = "exeinstall")]
    ExeInstall,
}

impl InstallKind {
    pub fn id(self) -> &'static str {
        match self {
            Self::Dev => "dev",
            Self::Deb => "deb",
            Self::Rpm => "rpm",
            Self::AppImage => "appimage",
            Self::Exe => "exe",
            Self::ExeInstall => "exeinstall",
        }
    }

    fn can_install(self) -> bool {
        self != Self::Dev
    }
}

#[derive(Debug, Clone, Deserialize)]
struct UpdateManifest {
    schema: u32,
    version: String,
    release_url: String,
    notes: String,
    packages: BTreeMap<String, ReleaseAsset>,
}

#[derive(Debug, Clone, Deserialize)]
struct ReleaseAsset {
    url: String,
    sha256: String,
    file: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct UpdateStatus {
    pub current_version: String,
    pub latest_version: String,
    pub package_kind: InstallKind,
    pub available: bool,
    pub can_install: bool,
    pub release_url: String,
    pub notes: String,
    pub asset_name: Option<String>,
    pub install_command: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct InstallResult {
    pub message: String,
    pub restart_required: bool,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DownloadProgress {
    pub phase: String,
    pub downloaded: u64,
    pub total: Option<u64>,
}

pub fn current_install_kind() -> InstallKind {
    if let Ok(value_2) = std::env::var("NOTA_PACKAGE_KIND") {
        if let Some(kind_line) = match value_2.to_ascii_lowercase().as_str() {
            "deb" => Some(InstallKind::Deb),
            "rpm" => Some(InstallKind::Rpm),
            "appimage" => Some(InstallKind::AppImage),
            "exe" => Some(InstallKind::Exe),
            "exeinstall" => Some(InstallKind::ExeInstall),
            "dev" => Some(InstallKind::Dev),
            _ => None,
        } {
            return kind_line;
        }
    }
    cfg!(debug_assertions)
        .then_some(InstallKind::Dev)
        .or_else(|| {
            std::env::var_os("APPIMAGE")
                .filter(|value_2| !value_2.is_empty())
                .map(|_| InstallKind::AppImage)
        })
        .unwrap_or_else(platform_install_kind)
}

fn platform_install_kind() -> InstallKind {
    #[cfg(target_os = "windows")]
    {
        if let Ok(exe) = std::env::current_exe() {
            if exe.parent().is_some_and(|directory_2| {
                directory_2
                    .join(format!(
                        "{}-portable.marker",
                        crate::distribution_profile::BINARY_NAME
                    ))
                    .is_file()
            }) {
                return InstallKind::Exe;
            }
            if exe
                .to_string_lossy()
                .contains(&format!("target{}", std::path::MAIN_SEPARATOR))
            {
                return InstallKind::Dev;
            }
        }
        InstallKind::ExeInstall
    }
    #[cfg(target_os = "linux")]
    {
        if let Ok(exe) = std::env::current_exe() {
            if exe
                .to_string_lossy()
                .contains(&format!("target{}", std::path::MAIN_SEPARATOR))
            {
                return InstallKind::Dev;
            }
        }
        for package in [
            crate::distribution_profile::PACKAGE_NAME,
            crate::distribution_profile::BINARY_NAME,
        ] {
            if name_zero_success_work("dpkg-query", &["-W", package]) {
                return InstallKind::Deb;
            }
            if name_zero_success_work("rpm", &["-q", package]) {
                return InstallKind::Rpm;
            }
        }
        let emit_line_half = fs::read_to_string("/etc/os-release")
            .unwrap_or_default()
            .to_ascii_lowercase();
        if emit_line_half.contains("debian") || emit_line_half.contains("ubuntu") {
            InstallKind::Deb
        } else if emit_line_half.contains("fedora")
            || emit_line_half.contains("rhel")
            || emit_line_half.contains("centos")
            || emit_line_half.contains("suse")
        {
            InstallKind::Rpm
        } else {
            InstallKind::Dev
        }
    }
    #[cfg(not(any(target_os = "windows", target_os = "linux")))]
    {
        InstallKind::Dev
    }
}

#[cfg(target_os = "linux")]
fn name_zero_success_work(program_2: &str, args_2: &[&str]) -> bool {
    crate::proc::background_command(program_2)
        .args(args_2)
        .stdout(Stdio::null())
        .stderr(Stdio::null())
        .status()
        .is_ok_and(|status_2| status_2.success())
}

pub fn check(replacements: &str) -> Result<UpdateStatus> {
    let manifest_2 = get_manifest(replacements)?;
    validate_validate_manifest(&manifest_2)?;
    let kind_line = current_install_kind();
    let package = select_package(&manifest_2, kind_line);
    let current_2 = env!("CARGO_PKG_VERSION");
    let has_new_half = version_greater(&manifest_2.version, current_2);
    let character_produce_name = package.map(|p| p.file.clone());
    let can_by_install =
        has_new_half && kind_line.can_install() && character_produce_name.is_some();
    Ok(UpdateStatus {
        current_version: current_2.to_string(),
        latest_version: manifest_2.version,
        package_kind: kind_line,
        available: has_new_half,
        can_install: can_by_install,
        release_url: and_method_page_surface(&manifest_2.release_url),
        notes: manifest_2.notes,
        asset_name: character_produce_name,
        install_command: by_install_name_zero_say_name(kind_line),
    })
}

pub fn install(
    replacements: &str,
    enter_read: impl FnMut(DownloadProgress),
    cancelled: impl Fn() -> bool,
) -> Result<InstallResult> {
    if cancelled() {
        return Err(NotaError::other("Update download was cancelled"));
    }
    let manifest_2 = get_manifest(replacements)?;
    if cancelled() {
        return Err(NotaError::other("Update download was cancelled"));
    }
    validate_validate_manifest(&manifest_2)?;
    let kind_line = current_install_kind();
    if kind_line == InstallKind::Dev {
        return Err(NotaError::other(format!(
            "Development builds do not install updates automatically. Run: {MAIN_DEV_UPDATE_COMMAND}"
        )));
    }
    if !version_greater(&manifest_2.version, env!("CARGO_PKG_VERSION")) {
        return Err(NotaError::other("Nota is already up to date"));
    }
    let package = select_package(&manifest_2, kind_line).ok_or_else(|| {
        NotaError::other(format!(
            "The update manifest has no package for {}",
            kind_line.id()
        ))
    })?;
    if !and_method_download_address(&package.url) {
        return Err(NotaError::other(
            "The update package is not hosted on the official Nota release",
        ));
    }
    only_line(kind_line, package, replacements, enter_read, cancelled)
}

fn validate_validate_manifest(manifest_2: &UpdateManifest) -> Result<()> {
    if manifest_2.schema != 1 {
        return Err(NotaError::other(format!(
            "Unsupported update manifest version: {}",
            manifest_2.schema
        )));
    }
    if !half_current_is_and_method(&manifest_2.version) {
        return Err(NotaError::other(
            "The update manifest contains an invalid version",
        ));
    }
    Ok(())
}

fn half_current_is_and_method(half_current: &str) -> bool {
    let half_current = half_current.trim_start_matches('v');
    !half_current.is_empty()
        && half_current
            .chars()
            .all(|c| c.is_ascii_alphanumeric() || matches!(c, '.' | '-' | '+'))
}

fn get_manifest(replacements: &str) -> Result<UpdateManifest> {
    let manifest_url = crate::distribution_profile::UPDATE_MANIFEST_URL.ok_or_else(|| {
        NotaError::other("This Nota distribution does not provide an update manifest")
    })?;
    let bytes = get_network(manifest_url, replacements, MANIFEST_LIMIT, MANIFEST_TIMEOUT)?;
    serde_json::from_slice(&bytes)
        .map_err(|e| NotaError::other(format!("Could not parse the update manifest: {e}")))
}

fn get_network(
    address_2: &str,
    replacements: &str,
    upper_thread: u64,
    overflow_is: Duration,
) -> Result<Vec<u8>> {
    remote::fetch(address_2, replacements, upper_thread, overflow_is)
}

fn select_package<'a>(
    manifest_2: &'a UpdateManifest,
    kind_line: InstallKind,
) -> Option<&'a ReleaseAsset> {
    manifest_2.packages.get(kind_line.id()).or_else(|| {
        let add_construct = std::env::consts::ARCH;
        manifest_2
            .packages
            .get(&format!("{}-{add_construct}", kind_line.id()))
    })
}

fn only_line<F>(
    kind_line: InstallKind,
    package: &ReleaseAsset,
    replacements: &str,
    mut enter_read: impl FnMut(DownloadProgress),
    cancelled: F,
) -> Result<InstallResult>
where
    F: Fn() -> bool,
{
    let file_3 = download_to_temp(package, replacements, &mut enter_read, &cancelled)?;
    if cancelled() {
        let _ = fs::remove_file(&file_3);
        return Err(NotaError::other("The update download was cancelled"));
    }
    enter_read(DownloadProgress {
        phase: "installing".to_string(),
        downloaded: fs::metadata(&file_3).map(|m| m.len()).unwrap_or(0),
        total: fs::metadata(&file_3).ok().map(|m| m.len()),
    });
    match kind_line {
        InstallKind::Deb => {
            by_schedule_deb_by_install(&file_3)?;
            Ok(InstallResult {
                message: "The update is ready. Nota will install it and restart after the current process exits.".to_string(),
                restart_required: true,
            })
        }
        InstallKind::Rpm => {
            by_schedule_rpm_by_install(&file_3)?;
            Ok(InstallResult {
                message: "The update is ready. Nota will install it and restart after the current process exits.".to_string(),
                restart_required: true,
            })
        }
        InstallKind::AppImage => {
            question_replace_app_image(&file_3)?;
            Ok(InstallResult {
                message: "The update has been downloaded. Nota will replace the current build and restart after exit.".to_string(),
                restart_required: true,
            })
        }
        InstallKind::ExeInstall => {
            start_dynamic_windows_by_install_start(&file_3)?;
            Ok(InstallResult {
                message:
                    "The installer has started. Nota will exit and restart after installation."
                        .to_string(),
                restart_required: true,
            })
        }
        InstallKind::Exe => {
            question_replace_windows_edit_write_half(&file_3)?;
            Ok(InstallResult {
                message: "The portable update has been downloaded. Nota will replace the current build and restart after exit.".to_string(),
                restart_required: true,
            })
        }
        InstallKind::Dev => unreachable!("The development build stopped before downloading"),
    }
}

const MAIN_DEV_UPDATE_COMMAND: &str =
    "git pull --ff-only && npm ci && npm run build && cd src-tauri && cargo build --release";

fn download_to_temp<F>(
    package: &ReleaseAsset,
    replacements: &str,
    enter_read: &mut impl FnMut(DownloadProgress),
    cancelled: &F,
) -> Result<PathBuf>
where
    F: Fn() -> bool,
{
    if !and_method_download_address(&package.url) {
        return Err(NotaError::other(
            "The update package is not hosted on the official Nota release",
        ));
    }
    let mut upper_word_package_height = 0_u64;
    let bytes = remote::fetch_with_progress_cancellable(
        &package.url,
        replacements,
        PACKAGE_LIMIT,
        PACKAGE_TIMEOUT,
        || cancelled(),
        |download_2, total_length| {
            if value_package_height_enter_read(download_2, upper_word_package_height, total_length)
            {
                upper_word_package_height = download_2;
                enter_read(DownloadProgress {
                    phase: "downloading".to_string(),
                    downloaded: download_2,
                    total: total_length,
                });
            }
        },
    )?;
    let summary = format!("{:x}", Sha256::digest(&bytes));
    if summary != package.sha256.to_ascii_lowercase() {
        return Err(NotaError::other(format!(
            "Update package verification failed: expected {}, received {summary}",
            package.sha256
        )));
    }
    let directory_2 = std::env::temp_dir().join("nota-update");
    fs::create_dir_all(&directory_2).map_err(|e| {
        NotaError::other(format!(
            "Could not create the update temporary directory: {e}"
        ))
    })?;
    let file_3 = directory_2.join(safe_filename(&package.file));
    fs::write(&file_3, bytes)
        .map_err(|e| NotaError::other(format!("Could not write the update package: {e}")))?;
    Ok(file_3)
}

fn value_package_height_enter_read(now: u64, upper_word: u64, total_length: Option<u64>) -> bool {
    if now == 0 || upper_word == 0 {
        return true;
    }
    match total_length.filter(|total| *total > 0) {
        Some(total) => now.saturating_mul(100) / total != upper_word.saturating_mul(100) / total,
        None => now.saturating_sub(upper_word) >= 512 * 1024,
    }
}

fn safe_filename(name: &str) -> String {
    let name = Path::new(name)
        .file_name()
        .and_then(|n| n.to_str())
        .unwrap_or("nota-update.pkg");
    name.chars()
        .map(|c| {
            if c.is_ascii_alphanumeric() || ".-_".contains(c) {
                c
            } else {
                '_'
            }
        })
        .collect()
}

#[cfg(target_os = "linux")]
fn by_schedule_deb_by_install(file_3: &Path) -> Result<()> {
    by_schedule_linux_package_by_install("pkexec apt-get install -y \"$2\"", file_3)
}

#[cfg(not(target_os = "linux"))]
fn by_schedule_deb_by_install(file_2: &Path) -> Result<()> {
    Err(NotaError::other(
        "Debian packages can only be installed on Linux",
    ))
}

#[cfg(target_os = "linux")]
fn by_schedule_rpm_by_install(file_3: &Path) -> Result<()> {
    let an_install = "if command -v dnf >/dev/null 2>&1; then \
                pkexec dnf install -y \"$2\"; \
                elif command -v zypper >/dev/null 2>&1; then \
                pkexec zypper --non-interactive install \"$2\"; \
                else pkexec rpm -Uvh --replacepkgs \"$2\"; fi";
    by_schedule_linux_package_by_install(an_install, file_3)
}

#[cfg(not(target_os = "linux"))]
fn by_schedule_rpm_by_install(file_2: &Path) -> Result<()> {
    Err(NotaError::other(
        "RPM packages can only be installed on Linux",
    ))
}

#[cfg(target_os = "linux")]
fn by_schedule_linux_package_by_install(an_install_action: &str, file_3: &Path) -> Result<()> {
    let exe = std::env::current_exe()
        .map_err(|e| NotaError::other(format!("Could not locate the current executable: {e}")))?;
    let call_current = format!(
        "while kill -0 \"$1\" 2>/dev/null; do sleep 1; done; \
         {an_install_action} >>\"$4\" 2>&1 && \
         nohup \"$3\" >>\"$4\" 2>&1 &"
    );
    let date_only = std::env::temp_dir().join("nota-update-install.log");
    crate::proc::background_command("sh")
        .args(["-c", &call_current, "nota-update"])
        .arg(std::process::id().to_string())
        .arg(file_3)
        .arg(exe)
        .arg(date_only)
        .stdin(Stdio::null())
        .stdout(Stdio::null())
        .stderr(Stdio::null())
        .spawn()
        .map(|_| ())
        .map_err(|e| NotaError::other(format!("Could not start the update installer: {e}")))
}

fn question_replace_app_image(new_file: &Path) -> Result<()> {
    let current_2 = std::env::var_os("APPIMAGE")
        .map(PathBuf::from)
        .ok_or_else(|| {
            NotaError::other("APPIMAGE is not set, so the current AppImage cannot be replaced")
        })?;
    let call_current = "while kill -0 \"$1\" 2>/dev/null; do sleep 1; done; \
                mv -f \"$3\" \"$2\" && chmod +x \"$2\" && \
                nohup \"$2\" >/tmp/nota-update-restart.log 2>&1 &";
    let mut command = crate::proc::background_command("sh");
    command
        .args(["-c", call_current, "nota-update"])
        .arg(std::process::id().to_string())
        .arg(&current_2)
        .arg(new_file)
        .stdout(Stdio::null())
        .stderr(Stdio::null());
    crate::proc::spawn_retrying(&mut command)
        .map(|_| ())
        .map_err(|e| {
            NotaError::other(format!(
                "Could not start the AppImage replacement process: {e}"
            ))
        })
}

#[cfg(target_os = "windows")]
fn start_dynamic_windows_by_install_start(file_3: &Path) -> Result<()> {
    use std::ffi::c_void;
    use windows_sys::Win32::UI::Shell::ShellExecuteW;
    use windows_sys::Win32::UI::WindowsAndMessaging::SW_SHOW;

    fn wide(value: &std::ffi::OsStr) -> Vec<u16> {
        use std::os::windows::ffi::OsStrExt;

        value.encode_wide().chain(std::iter::once(0)).collect()
    }

    let verb = wide(std::ffi::OsStr::new("open"));
    let installer = wide(file_3.as_os_str());
    let parameters = wide(std::ffi::OsStr::new("/P /UPDATE /R"));
    let result = unsafe {
        ShellExecuteW(
            std::ptr::null_mut::<c_void>() as _,
            verb.as_ptr(),
            installer.as_ptr(),
            parameters.as_ptr(),
            std::ptr::null(),
            SW_SHOW,
        )
    };
    if result as isize <= 32 {
        return Err(NotaError::other(format!(
            "Could not start the Windows installer (ShellExecuteW returned {})",
            result as isize
        )));
    }
    Ok(())
}

#[cfg(not(target_os = "windows"))]
fn start_dynamic_windows_by_install_start(_file_2: &Path) -> Result<()> {
    Err(NotaError::other(
        "The Windows installer can only run on Windows",
    ))
}

#[cfg(target_os = "windows")]
fn question_replace_windows_edit_write_half(file_3: &Path) -> Result<()> {
    start_dynamic_power_shell_edit_write_half_question_replace(file_3)
}

#[cfg(not(target_os = "windows"))]
fn question_replace_windows_edit_write_half(_file_2: &Path) -> Result<()> {
    Err(NotaError::other(
        "The Windows portable update can only run on Windows",
    ))
}

#[cfg(target_os = "windows")]
fn start_dynamic_power_shell_edit_write_half_question_replace(file_3: &Path) -> Result<()> {
    let exe = std::env::current_exe()
        .map_err(|e| NotaError::other(format!("Could not locate the current executable: {e}")))?;
    let call_current_path = std::env::temp_dir().join("nota-apply-update.ps1");
    let call_current = format!(
        "$p={}; Wait-Process -Id $p -ErrorAction SilentlyContinue; \
         $s='{}'; $d='{}'; \
         if ($s -match '\\.zip$') {{ \
           $t=Join-Path $env:TEMP 'nota-update-extract'; \
           Remove-Item $t -Recurse -Force -ErrorAction SilentlyContinue; \
           Expand-Archive -LiteralPath $s -DestinationPath $t -Force; \
           $r=Get-ChildItem $t -Recurse -Filter 'nota.exe' | Select-Object -First 1; \
           if (-not $r) {{ throw 'portable ZIP does not contain nota.exe' }}; \
           Copy-Item -Path (Join-Path $r.DirectoryName '*') -Destination (Split-Path $d) -Recurse -Force; \
         }} else {{ Move-Item -LiteralPath $s -Destination $d -Force }}; \
         Start-Process -FilePath '{}'",
        std::process::id(),
        ps(file_3),
        ps(&exe),
        ps(&exe),
    );
    fs::write(&call_current_path, call_current)
        .map_err(|e| NotaError::other(format!("Could not write the update script: {e}")))?;
    let mut command = crate::proc::background_command("powershell");
    command
        .args([
            "-NoProfile",
            "-WindowStyle",
            "Hidden",
            "-ExecutionPolicy",
            "Bypass",
            "-File",
        ])
        .arg(call_current_path)
        .stdout(Stdio::null())
        .stderr(Stdio::null());
    crate::proc::spawn_retrying(&mut command)
        .map(|_| ())
        .map_err(|e| NotaError::other(format!("Could not start the Windows update script: {e}")))
}

#[cfg(target_os = "windows")]
fn ps(path_3: &Path) -> String {
    path_3.to_string_lossy().replace('\'', "''")
}

fn by_install_name_zero_say_name(kind_line: InstallKind) -> String {
    match kind_line {
        InstallKind::Deb => "pkexec apt-get install -y <downloaded .deb>".to_string(),
        InstallKind::Rpm => "pkexec dnf install -y <downloaded .rpm>".to_string(),
        InstallKind::AppImage => "Replace the current AppImage after exit and restart".to_string(),
        InstallKind::Exe => "Replace the portable launcher after exit and restart".to_string(),
        InstallKind::ExeInstall => {
            "Run the NSIS installer with /UPDATE to replace the build and restart".to_string()
        }
        InstallKind::Dev => MAIN_DEV_UPDATE_COMMAND.to_string(),
    }
}

fn and_method_download_address(address_2: &str) -> bool {
    crate::distribution_profile::UPDATE_RELEASE_PREFIX
        .is_some_and(|prefix| address_2.starts_with(prefix))
}

fn and_method_page_surface(address_2: &str) -> String {
    if crate::distribution_profile::UPDATE_RELEASE_PAGE
        .is_some_and(|page| address_2.starts_with(page))
    {
        address_2.to_string()
    } else {
        crate::distribution_profile::UPDATE_RELEASE_PAGE
            .unwrap_or("https://github.com/Nota-MD/Nota/releases")
            .to_string()
    }
}

pub fn version_greater(left: &str, has: &str) -> bool {
    let (left_main, left_and) = split_half_current(left);
    let (has_main, has_and) = split_half_current(has);
    if left_main != has_main {
        return left_main > has_main;
    }
    match (left_and.is_empty(), has_and.is_empty()) {
        (true, true) => false,
        (true, false) => true,
        (false, true) => false,
        (false, false) => and_emit_not_large_and(&left_and, &has_and),
    }
}

fn split_half_current(half_current: &str) -> ([u64; 3], Vec<String>) {
    let half_current = half_current.trim_start_matches('v');
    let (main, and_2) = half_current.split_once('-').unwrap_or((half_current, ""));
    let mut data = [0; 3];
    for (i, segment) in main.split('.').take(3).enumerate() {
        data[i] = segment.parse().unwrap_or(0);
    }
    (
        data,
        and_2
            .split('.')
            .filter(|s| !s.is_empty())
            .map(str::to_string)
            .collect(),
    )
}

fn and_emit_not_large_and(left: &[String], has: &[String]) -> bool {
    for (a, b) in left.iter().zip(has) {
        let (that, nb) = (a.parse::<u64>().ok(), b.parse::<u64>().ok());
        let compare = match (that, nb) {
            (Some(a), Some(b)) => a.cmp(&b),
            (Some(_), None) => std::cmp::Ordering::Less,
            (None, Some(_)) => std::cmp::Ordering::Greater,
            (None, None) => a.cmp(b),
        };
        if compare != std::cmp::Ordering::Equal {
            return compare == std::cmp::Ordering::Greater;
        }
    }
    left.len() > has.len()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn half_current_compare_can_is_other_validate_is_and_and_emit_not() {
        assert!(version_greater("0.8.0-beta", "0.7.0-beta"));
        assert!(version_greater("0.7.0-beta.1", "0.7.0-beta"));
        assert!(version_greater("0.7.0", "0.7.0-beta.9"));
        assert!(!version_greater("0.7.0-beta", "0.7.0-beta"));
        assert!(!version_greater("0.6.9", "0.7.0-beta"));
    }

    #[test]
    fn only_boundary_receive_nota_close_method_release_download_address() {
        assert!(and_method_download_address(
            "https://github.com/Nota-MD/Nota/releases/download/v0.7.0-beta/a.deb"
        ));
        assert!(!and_method_download_address("https://example.com/a.deb"));
        assert!(!and_method_download_address(
            "https://github.com/other/Nota/releases/download/x/a"
        ));
    }

    #[test]
    fn package_name_return_passive_request_system_success_single_segment_filename() {
        assert_eq!(safe_filename("../../evil.deb"), "evil.deb");
        assert_eq!(safe_filename("a b?.AppImage"), "a_b_.AppImage");
    }

    #[test]
    fn download_progress_is_throttled_by_percent_or_half_megabyte() {
        assert!(value_package_height_enter_read(1, 0, Some(100)));
        assert!(!value_package_height_enter_read(1, 1, Some(100)));
        assert!(value_package_height_enter_read(2, 1, Some(100)));
        assert!(!value_package_height_enter_read(600_000, 100_000, None));
        assert!(value_package_height_enter_read(
            512 * 1024 + 100_000,
            100_000,
            None
        ));
    }

    #[test]
    fn exeinstall_manifest_check_each_has_link_character_service() {
        let json = serde_json::to_string(&InstallKind::ExeInstall).unwrap();
        assert_eq!(json, "\"exeinstall\"");
    }

    #[test]
    fn emit_not_manifest_can_parse_cut_character_produce_address_all_at_close_method_release() {
        let path = Path::new(env!("CARGO_MANIFEST_DIR")).join("../update/latest.json");
        let text = fs::read_to_string(path).unwrap();
        let manifest: UpdateManifest = serde_json::from_str(&text).unwrap();
        validate_validate_manifest(&manifest).unwrap();
        for (kind, package) in &manifest.packages {
            assert!(
                and_method_download_address(&package.url),
                "{kind} \u{7684}\u{5730}\u{5740}\u{4e0d}\u{5728}\u{5b98}\u{65b9} Release\u{ff1a}{}",
                package.url
            );
            assert!(
                !package.sha256.is_empty(),
                "{kind} \u{7f3a}\u{5c11} SHA-256"
            );
            assert!(
                !package.file.is_empty(),
                "{kind} \u{7f3a}\u{5c11}\u{6587}\u{4ef6}\u{540d}"
            );
        }
    }

    #[test]
    fn cancellation_happens_before_network_access() {
        let result = install("", |_| {}, || true);
        assert!(result.unwrap_err().to_string().contains("cancelled"));
    }
}
