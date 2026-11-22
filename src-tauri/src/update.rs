use std::collections::BTreeMap;
use std::fs;
use std::path::{Path, PathBuf};
use std::process::Stdio;
use std::time::Duration;

use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};

use crate::error::{NotaError, Result};
use crate::remote;

const MANIFEST_URL: &str = "https://github.com/Nota-MD/Nota/releases/latest/download/latest.json";
const RELEASE_PREFIX: &str = "https://github.com/Nota-MD/Nota/releases/download/";
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
        if let Some(lei_xing) = match value_2.to_ascii_lowercase().as_str() {
            "deb" => Some(InstallKind::Deb),
            "rpm" => Some(InstallKind::Rpm),
            "appimage" => Some(InstallKind::AppImage),
            "exe" => Some(InstallKind::Exe),
            "exeinstall" => Some(InstallKind::ExeInstall),
            "dev" => Some(InstallKind::Dev),
            _ => None,
        } {
            return lei_xing;
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
            if exe
                .parent()
                .is_some_and(|directory_2| directory_2.join("nota-portable.marker").is_file())
            {
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
        if ming_ling_cheng_gong("dpkg-query", &["-W", "nota"]) {
            return InstallKind::Deb;
        }
        if ming_ling_cheng_gong("rpm", &["-q", "nota"]) {
            return InstallKind::Rpm;
        }
        let emit_xing_ban = fs::read_to_string("/etc/os-release")
            .unwrap_or_default()
            .to_ascii_lowercase();
        if emit_xing_ban.contains("debian") || emit_xing_ban.contains("ubuntu") {
            InstallKind::Deb
        } else if emit_xing_ban.contains("fedora")
            || emit_xing_ban.contains("rhel")
            || emit_xing_ban.contains("centos")
            || emit_xing_ban.contains("suse")
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
fn ming_ling_cheng_gong(program_2: &str, args_2: &[&str]) -> bool {
    crate::proc::background_command(program_2)
        .args(args_2)
        .stdout(Stdio::null())
        .stderr(Stdio::null())
        .status()
        .is_ok_and(|status_2| status_2.success())
}

pub fn check(replacements: &str) -> Result<UpdateStatus> {
    let manifest_2 = qu_manifest(replacements)?;
    yan_zheng_manifest(&manifest_2)?;
    let lei_xing = current_install_kind();
    let bao = xuan_bao(&manifest_2, lei_xing);
    let current_2 = env!("CARGO_PKG_VERSION");
    let you_xin_ban = version_greater(&manifest_2.version, current_2);
    let zi_chan_ming = bao.map(|p| p.file.clone());
    let ke_an_install = you_xin_ban && lei_xing.can_install() && zi_chan_ming.is_some();
    Ok(UpdateStatus {
        current_version: current_2.to_string(),
        latest_version: manifest_2.version,
        package_kind: lei_xing,
        available: you_xin_ban,
        can_install: ke_an_install,
        release_url: he_fa_ye_mian(&manifest_2.release_url),
        notes: manifest_2.notes,
        asset_name: zi_chan_ming,
        install_command: an_install_ming_ling_shuo_ming(lei_xing),
    })
}

pub fn install(
    replacements: &str,
    jin_du: impl FnMut(DownloadProgress),
    cancelled: impl Fn() -> bool,
) -> Result<InstallResult> {
    if cancelled() {
        return Err(NotaError::other("Update download was cancelled"));
    }
    let manifest_2 = qu_manifest(replacements)?;
    if cancelled() {
        return Err(NotaError::other("Update download was cancelled"));
    }
    yan_zheng_manifest(&manifest_2)?;
    let lei_xing = current_install_kind();
    if lei_xing == InstallKind::Dev {
        return Err(NotaError::other(format!(
            "Development builds do not install updates automatically. Run: {MAIN_DEV_UPDATE_COMMAND}"
        )));
    }
    if !version_greater(&manifest_2.version, env!("CARGO_PKG_VERSION")) {
        return Err(NotaError::other("Nota is already up to date"));
    }
    let bao = xuan_bao(&manifest_2, lei_xing).ok_or_else(|| {
        NotaError::other(format!(
            "The update manifest has no package for {}",
            lei_xing.id()
        ))
    })?;
    if !he_fa_download_address(&bao.url) {
        return Err(NotaError::other(
            "The update package is not hosted on the official Nota release",
        ));
    }
    zhi_xing(lei_xing, bao, replacements, jin_du, cancelled)
}

fn yan_zheng_manifest(manifest_2: &UpdateManifest) -> Result<()> {
    if manifest_2.schema != 1 {
        return Err(NotaError::other(format!(
            "Unsupported update manifest version: {}",
            manifest_2.schema
        )));
    }
    if !ban_ben_ge_shi_he_fa(&manifest_2.version) {
        return Err(NotaError::other(
            "The update manifest contains an invalid version",
        ));
    }
    Ok(())
}

fn ban_ben_ge_shi_he_fa(ban_ben: &str) -> bool {
    let ban_ben = ban_ben.trim_start_matches('v');
    !ban_ben.is_empty()
        && ban_ben
            .chars()
            .all(|c| c.is_ascii_alphanumeric() || matches!(c, '.' | '-' | '+'))
}

fn qu_manifest(replacements: &str) -> Result<UpdateManifest> {
    let zi_jie = qu_network(MANIFEST_URL, replacements, MANIFEST_LIMIT, MANIFEST_TIMEOUT)?;
    serde_json::from_slice(&zi_jie)
        .map_err(|e| NotaError::other(format!("Could not parse the update manifest: {e}")))
}

fn qu_network(
    address_2: &str,
    replacements: &str,
    shang_xian: u64,
    chao_shi: Duration,
) -> Result<Vec<u8>> {
    remote::fetch(address_2, replacements, shang_xian, chao_shi)
}

fn xuan_bao<'a>(manifest_2: &'a UpdateManifest, lei_xing: InstallKind) -> Option<&'a ReleaseAsset> {
    manifest_2.packages.get(lei_xing.id()).or_else(|| {
        let jia_gou = std::env::consts::ARCH;
        manifest_2
            .packages
            .get(&format!("{}-{jia_gou}", lei_xing.id()))
    })
}

fn zhi_xing<F>(
    lei_xing: InstallKind,
    bao: &ReleaseAsset,
    replacements: &str,
    mut jin_du: impl FnMut(DownloadProgress),
    cancelled: F,
) -> Result<InstallResult>
where
    F: Fn() -> bool,
{
    let file_3 = download_dao_temp(bao, replacements, &mut jin_du, &cancelled)?;
    if cancelled() {
        let _ = fs::remove_file(&file_3);
        return Err(NotaError::other("The update download was cancelled"));
    }
    jin_du(DownloadProgress {
        phase: "installing".to_string(),
        downloaded: fs::metadata(&file_3).map(|m| m.len()).unwrap_or(0),
        total: fs::metadata(&file_3).ok().map(|m| m.len()),
    });
    match lei_xing {
        InstallKind::Deb => {
            an_pai_deb_an_install(&file_3)?;
            Ok(InstallResult {
                message: "The update is ready. Nota will install it and restart after the current process exits.".to_string(),
                restart_required: true,
            })
        }
        InstallKind::Rpm => {
            an_pai_rpm_an_install(&file_3)?;
            Ok(InstallResult {
                message: "The update is ready. Nota will install it and restart after the current process exits.".to_string(),
                restart_required: true,
            })
        }
        InstallKind::AppImage => {
            ti_huan_app_image(&file_3)?;
            Ok(InstallResult {
                message: "The update has been downloaded. Nota will replace the current build and restart after exit.".to_string(),
                restart_required: true,
            })
        }
        InstallKind::ExeInstall => {
            qi_dong_windows_an_install_qi(&file_3)?;
            Ok(InstallResult {
                message:
                    "The installer has started. Nota will exit and restart after installation."
                        .to_string(),
                restart_required: true,
            })
        }
        InstallKind::Exe => {
            ti_huan_windows_bian_xie_ban(&file_3)?;
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

fn download_dao_temp<F>(
    bao: &ReleaseAsset,
    replacements: &str,
    jin_du: &mut impl FnMut(DownloadProgress),
    cancelled: &F,
) -> Result<PathBuf>
where
    F: Fn() -> bool,
{
    if !he_fa_download_address(&bao.url) {
        return Err(NotaError::other(
            "The update package is not hosted on the official Nota release",
        ));
    }
    let mut shang_ci_bao_gao = 0_u64;
    let zi_jie = remote::fetch_with_progress_cancellable(
        &bao.url,
        replacements,
        PACKAGE_LIMIT,
        PACKAGE_TIMEOUT,
        || cancelled(),
        |download_2, zong_zhang| {
            if value_de_bao_gao_jin_du(download_2, shang_ci_bao_gao, zong_zhang) {
                shang_ci_bao_gao = download_2;
                jin_du(DownloadProgress {
                    phase: "downloading".to_string(),
                    downloaded: download_2,
                    total: zong_zhang,
                });
            }
        },
    )?;
    let summary = format!("{:x}", Sha256::digest(&zi_jie));
    if summary != bao.sha256.to_ascii_lowercase() {
        return Err(NotaError::other(format!(
            "Update package verification failed: expected {}, received {summary}",
            bao.sha256
        )));
    }
    let directory_2 = std::env::temp_dir().join("nota-update");
    fs::create_dir_all(&directory_2).map_err(|e| {
        NotaError::other(format!(
            "Could not create the update temporary directory: {e}"
        ))
    })?;
    let file_3 = directory_2.join(an_fulldocument_jian_ming(&bao.file));
    fs::write(&file_3, zi_jie)
        .map_err(|e| NotaError::other(format!("Could not write the update package: {e}")))?;
    Ok(file_3)
}

fn value_de_bao_gao_jin_du(xian_zai: u64, shang_ci: u64, zong_zhang: Option<u64>) -> bool {
    if xian_zai == 0 || shang_ci == 0 {
        return true;
    }
    match zong_zhang.filter(|zong| *zong > 0) {
        Some(zong) => xian_zai.saturating_mul(100) / zong != shang_ci.saturating_mul(100) / zong,
        None => xian_zai.saturating_sub(shang_ci) >= 512 * 1024,
    }
}

fn an_fulldocument_jian_ming(ming: &str) -> String {
    let ming = Path::new(ming)
        .file_name()
        .and_then(|n| n.to_str())
        .unwrap_or("nota-update.pkg");
    ming.chars()
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
fn an_pai_deb_an_install(file_3: &Path) -> Result<()> {
    an_pai_linux_bao_an_install("pkexec apt-get install -y \"$2\"", file_3)
}

#[cfg(not(target_os = "linux"))]
fn an_pai_deb_an_install(file_2: &Path) -> Result<()> {
    Err(NotaError::other(
        "Debian packages can only be installed on Linux",
    ))
}

#[cfg(target_os = "linux")]
fn an_pai_rpm_an_install(file_3: &Path) -> Result<()> {
    let an_install = "if command -v dnf >/dev/null 2>&1; then \
                pkexec dnf install -y \"$2\"; \
                elif command -v zypper >/dev/null 2>&1; then \
                pkexec zypper --non-interactive install \"$2\"; \
                else pkexec rpm -Uvh --replacepkgs \"$2\"; fi";
    an_pai_linux_bao_an_install(an_install, file_3)
}

#[cfg(not(target_os = "linux"))]
fn an_pai_rpm_an_install(file_2: &Path) -> Result<()> {
    Err(NotaError::other(
        "RPM packages can only be installed on Linux",
    ))
}

#[cfg(target_os = "linux")]
fn an_pai_linux_bao_an_install(an_install_action: &str, file_3: &Path) -> Result<()> {
    let exe = std::env::current_exe()
        .map_err(|e| NotaError::other(format!("Could not locate the current executable: {e}")))?;
    let jiao_ben = format!(
        "while kill -0 \"$1\" 2>/dev/null; do sleep 1; done; \
         {an_install_action} >>\"$4\" 2>&1 && \
         nohup \"$3\" >>\"$4\" 2>&1 &"
    );
    let ri_zhi = std::env::temp_dir().join("nota-update-install.log");
    crate::proc::background_command("sh")
        .args(["-c", &jiao_ben, "nota-update"])
        .arg(std::process::id().to_string())
        .arg(file_3)
        .arg(exe)
        .arg(ri_zhi)
        .stdin(Stdio::null())
        .stdout(Stdio::null())
        .stderr(Stdio::null())
        .spawn()
        .map(|_| ())
        .map_err(|e| NotaError::other(format!("Could not start the update installer: {e}")))
}

fn ti_huan_app_image(xin_file: &Path) -> Result<()> {
    let current_2 = std::env::var_os("APPIMAGE")
        .map(PathBuf::from)
        .ok_or_else(|| {
            NotaError::other("APPIMAGE is not set, so the current AppImage cannot be replaced")
        })?;
    let jiao_ben = "while kill -0 \"$1\" 2>/dev/null; do sleep 1; done; \
                mv -f \"$3\" \"$2\" && chmod +x \"$2\" && \
                nohup \"$2\" >/tmp/nota-update-restart.log 2>&1 &";
    let mut ming_ling = crate::proc::background_command("sh");
    ming_ling
        .args(["-c", jiao_ben, "nota-update"])
        .arg(std::process::id().to_string())
        .arg(&current_2)
        .arg(xin_file)
        .stdout(Stdio::null())
        .stderr(Stdio::null());
    crate::proc::spawn_retrying(&mut ming_ling)
        .map(|_| ())
        .map_err(|e| {
            NotaError::other(format!(
                "Could not start the AppImage replacement process: {e}"
            ))
        })
}

#[cfg(target_os = "windows")]
fn qi_dong_windows_an_install_qi(file_3: &Path) -> Result<()> {
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
fn qi_dong_windows_an_install_qi(_file_2: &Path) -> Result<()> {
    Err(NotaError::other(
        "The Windows installer can only run on Windows",
    ))
}

#[cfg(target_os = "windows")]
fn ti_huan_windows_bian_xie_ban(file_3: &Path) -> Result<()> {
    qi_dong_power_shell_bian_xie_ban_ti_huan(file_3)
}

#[cfg(not(target_os = "windows"))]
fn ti_huan_windows_bian_xie_ban(_file_2: &Path) -> Result<()> {
    Err(NotaError::other(
        "The Windows portable update can only run on Windows",
    ))
}

#[cfg(target_os = "windows")]
fn qi_dong_power_shell_bian_xie_ban_ti_huan(file_3: &Path) -> Result<()> {
    let exe = std::env::current_exe()
        .map_err(|e| NotaError::other(format!("Could not locate the current executable: {e}")))?;
    let jiao_ben_path = std::env::temp_dir().join("nota-apply-update.ps1");
    let jiao_ben = format!(
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
    fs::write(&jiao_ben_path, jiao_ben)
        .map_err(|e| NotaError::other(format!("Could not write the update script: {e}")))?;
    let mut ming_ling = crate::proc::background_command("powershell");
    ming_ling
        .args([
            "-NoProfile",
            "-WindowStyle",
            "Hidden",
            "-ExecutionPolicy",
            "Bypass",
            "-File",
        ])
        .arg(jiao_ben_path)
        .stdout(Stdio::null())
        .stderr(Stdio::null());
    crate::proc::spawn_retrying(&mut ming_ling)
        .map(|_| ())
        .map_err(|e| NotaError::other(format!("Could not start the Windows update script: {e}")))
}

#[cfg(target_os = "windows")]
fn ps(path_3: &Path) -> String {
    path_3.to_string_lossy().replace('\'', "''")
}

fn an_install_ming_ling_shuo_ming(lei_xing: InstallKind) -> String {
    match lei_xing {
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

fn he_fa_download_address(address_2: &str) -> bool {
    address_2.starts_with(RELEASE_PREFIX)
}

fn he_fa_ye_mian(address_2: &str) -> String {
    if address_2.starts_with("https://github.com/Nota-MD/Nota/") {
        address_2.to_string()
    } else {
        "https://github.com/Nota-MD/Nota/releases".to_string()
    }
}

pub fn version_greater(zuo: &str, you: &str) -> bool {
    let (zuo_zhu, zuo_yu) = chai_ban_ben(zuo);
    let (you_zhu, you_yu) = chai_ban_ben(you);
    if zuo_zhu != you_zhu {
        return zuo_zhu > you_zhu;
    }
    match (zuo_yu.is_empty(), you_yu.is_empty()) {
        (true, true) => false,
        (true, false) => true,
        (false, true) => false,
        (false, false) => yu_emit_bu_da_yu(&zuo_yu, &you_yu),
    }
}

fn chai_ban_ben(ban_ben: &str) -> ([u64; 3], Vec<String>) {
    let ban_ben = ban_ben.trim_start_matches('v');
    let (zhu, yu_2) = ban_ben.split_once('-').unwrap_or((ban_ben, ""));
    let mut shu = [0; 3];
    for (i, duan) in zhu.split('.').take(3).enumerate() {
        shu[i] = duan.parse().unwrap_or(0);
    }
    (
        shu,
        yu_2.split('.')
            .filter(|s| !s.is_empty())
            .map(str::to_string)
            .collect(),
    )
}

fn yu_emit_bu_da_yu(zuo: &[String], you: &[String]) -> bool {
    for (a, b) in zuo.iter().zip(you) {
        let (na, nb) = (a.parse::<u64>().ok(), b.parse::<u64>().ok());
        let compare = match (na, nb) {
            (Some(a), Some(b)) => a.cmp(&b),
            (Some(_), None) => std::cmp::Ordering::Less,
            (None, Some(_)) => std::cmp::Ordering::Greater,
            (None, None) => a.cmp(b),
        };
        if compare != std::cmp::Ordering::Equal {
            return compare == std::cmp::Ordering::Greater;
        }
    }
    zuo.len() > you.len()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn ban_ben_compare_neng_shi_bie_zheng_shi_yu_yu_emit_bu() {
        assert!(version_greater("0.8.0-beta", "0.7.0-beta"));
        assert!(version_greater("0.7.0-beta.1", "0.7.0-beta"));
        assert!(version_greater("0.7.0", "0.7.0-beta.9"));
        assert!(!version_greater("0.7.0-beta", "0.7.0-beta"));
        assert!(!version_greater("0.6.9", "0.7.0-beta"));
    }

    #[test]
    fn zhi_jie_shou_nota_guan_fang_release_download_address() {
        assert!(he_fa_download_address(
            "https://github.com/Nota-MD/Nota/releases/download/v0.7.0-beta/a.deb"
        ));
        assert!(!he_fa_download_address("https://example.com/a.deb"));
        assert!(!he_fa_download_address(
            "https://github.com/other/Nota/releases/download/x/a"
        ));
    }

    #[test]
    fn bao_ming_hui_bei_qing_xi_cheng_dan_duan_filename() {
        assert_eq!(an_fulldocument_jian_ming("../../evil.deb"), "evil.deb");
        assert_eq!(an_fulldocument_jian_ming("a b?.AppImage"), "a_b_.AppImage");
    }

    #[test]
    fn download_progress_is_throttled_by_percent_or_half_megabyte() {
        assert!(value_de_bao_gao_jin_du(1, 0, Some(100)));
        assert!(!value_de_bao_gao_jin_du(1, 1, Some(100)));
        assert!(value_de_bao_gao_jin_du(2, 1, Some(100)));
        assert!(!value_de_bao_gao_jin_du(600_000, 100_000, None));
        assert!(value_de_bao_gao_jin_du(512 * 1024 + 100_000, 100_000, None));
    }

    #[test]
    fn exeinstall_manifest_jian_mei_you_lian_zi_fu() {
        let json = serde_json::to_string(&InstallKind::ExeInstall).unwrap();
        assert_eq!(json, "\"exeinstall\"");
    }

    #[test]
    fn emit_bu_manifest_ke_parse_qie_zi_chan_address_dou_zai_guan_fang_release() {
        let path = Path::new(env!("CARGO_MANIFEST_DIR")).join("../update/latest.json");
        let text = fs::read_to_string(path).unwrap();
        let manifest: UpdateManifest = serde_json::from_str(&text).unwrap();
        yan_zheng_manifest(&manifest).unwrap();
        for (kind, package) in &manifest.packages {
            assert!(
                he_fa_download_address(&package.url),
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
