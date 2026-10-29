//! 实验性更新检查与安装。
//!
//! 清单地址是固定的。前端不能传入任意 URL，安装包也只能来自
//! `github.com/Nota-MD/Nota/releases/download/`。下载完成后先验 SHA-256，
//! 然后按当前安装类型调用对应的替换流程。

use std::collections::BTreeMap;
use std::fs;
use std::path::{Path, PathBuf};
use std::process::{Command, Stdio};
use std::time::Duration;

use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};

use crate::error::{NotaError, Result};
use crate::remote;

const MANIFEST_URL: &str =
    "https://github.com/Nota-MD/Nota/releases/latest/download/latest.json";
const RELEASE_PREFIX: &str = "https://github.com/Nota-MD/Nota/releases/download/";
const MANIFEST_LIMIT: u64 = 1024 * 1024;
const PACKAGE_LIMIT: u64 = 256 * 1024 * 1024;
const MANIFEST_TIMEOUT: Duration = Duration::from_secs(30);
const PACKAGE_TIMEOUT: Duration = Duration::from_secs(600);

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "kebab-case")]
pub enum 安装类型 {
    Dev,
    Deb,
    Rpm,
    AppImage,
    Exe,
    #[serde(rename = "exeinstall")]
    ExeInstall,
}

impl 安装类型 {
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
struct 清单 {
    schema: u32,
    version: String,
    release_url: String,
    notes: String,
    packages: BTreeMap<String, 安装包>,
}

#[derive(Debug, Clone, Deserialize)]
struct 安装包 {
    url: String,
    sha256: String,
    file: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct 更新状态 {
    pub current_version: String,
    pub latest_version: String,
    pub package_kind: 安装类型,
    pub available: bool,
    pub can_install: bool,
    pub release_url: String,
    pub notes: String,
    pub asset_name: Option<String>,
    pub install_command: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct 安装结果 {
    pub message: String,
    pub restart_required: bool,
}

/// 更新包下载阶段的进度。前端订阅事件后画进度条，避免长时间只有一个
/// “下载并安装”按钮而看起来像卡死。
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct 下载进度 {
    pub phase: String,
    pub downloaded: u64,
    pub total: Option<u64>,
}

pub fn 当前安装类型() -> 安装类型 {
    if let Ok(值) = std::env::var("NOTA_PACKAGE_KIND") {
        if let Some(类型) = match 值.to_ascii_lowercase().as_str() {
            "deb" => Some(安装类型::Deb),
            "rpm" => Some(安装类型::Rpm),
            "appimage" => Some(安装类型::AppImage),
            "exe" => Some(安装类型::Exe),
            "exeinstall" => Some(安装类型::ExeInstall),
            "dev" => Some(安装类型::Dev),
            _ => None,
        } {
            return 类型;
        }
    }
    cfg!(debug_assertions)
        .then_some(安装类型::Dev)
        .or_else(|| {
            std::env::var_os("APPIMAGE")
                .filter(|值| !值.is_empty())
                .map(|_| 安装类型::AppImage)
        })
        .unwrap_or_else(平台安装类型)
}

fn 平台安装类型() -> 安装类型 {
    #[cfg(target_os = "windows")]
    {
        if let Ok(exe) = std::env::current_exe() {
            if exe.parent().is_some_and(|目录| 目录.join("nota-portable.marker").is_file()) {
                return 安装类型::Exe;
            }
            if exe.to_string_lossy().contains(&format!("target{}", std::path::MAIN_SEPARATOR)) {
                return 安装类型::Dev;
            }
        }
        安装类型::ExeInstall
    }
    #[cfg(target_os = "linux")]
    {
        if let Ok(exe) = std::env::current_exe() {
            if exe
                .to_string_lossy()
                .contains(&format!("target{}", std::path::MAIN_SEPARATOR))
            {
                return 安装类型::Dev;
            }
        }
        if 命令成功("dpkg-query", &["-W", "nota"]) {
            return 安装类型::Deb;
        }
        if 命令成功("rpm", &["-q", "nota"]) {
            return 安装类型::Rpm;
        }
        let 发行版 = fs::read_to_string("/etc/os-release")
            .unwrap_or_default()
            .to_ascii_lowercase();
        if 发行版.contains("debian") || 发行版.contains("ubuntu") {
            安装类型::Deb
        } else if 发行版.contains("fedora")
            || 发行版.contains("rhel")
            || 发行版.contains("centos")
            || 发行版.contains("suse")
        {
            安装类型::Rpm
        } else {
            安装类型::Dev
        }
    }
    #[cfg(not(any(target_os = "windows", target_os = "linux")))]
    {
        安装类型::Dev
    }
}

#[cfg(target_os = "linux")]
fn 命令成功(程序: &str, 参数: &[&str]) -> bool {
    Command::new(程序)
        .args(参数)
        .stdout(Stdio::null())
        .stderr(Stdio::null())
        .status()
        .is_ok_and(|状态| 状态.success())
}

pub fn 检查(替换规则: &str) -> Result<更新状态> {
    let 清单 = 取清单(替换规则)?;
    验证清单(&清单)?;
    let 类型 = 当前安装类型();
    let 包 = 选包(&清单, 类型);
    let 当前 = env!("CARGO_PKG_VERSION");
    let 有新版 = 版本大于(&清单.version, 当前);
    let 资产名 = 包.map(|p| p.file.clone());
    let 可安装 = 有新版 && 类型.can_install() && 资产名.is_some();
    Ok(更新状态 {
        current_version: 当前.to_string(),
        latest_version: 清单.version,
        package_kind: 类型,
        available: 有新版,
        can_install: 可安装,
        release_url: 合法页面(&清单.release_url),
        notes: 清单.notes,
        asset_name: 资产名,
        install_command: 安装命令说明(类型),
    })
}

pub fn 安装(
    替换规则: &str,
    进度: impl FnMut(下载进度),
    cancelled: impl Fn() -> bool,
) -> Result<安装结果> {
    if cancelled() {
        return Err(NotaError::other("更新下载已取消"));
    }
    let 清单 = 取清单(替换规则)?;
    if cancelled() {
        return Err(NotaError::other("更新下载已取消"));
    }
    验证清单(&清单)?;
    let 类型 = 当前安装类型();
    if 类型 == 安装类型::Dev {
        return Err(NotaError::other(format!(
            "开发构建不自动覆盖：{MAIN_DEV_UPDATE_COMMAND}"
        )));
    }
    if !版本大于(&清单.version, env!("CARGO_PKG_VERSION")) {
        return Err(NotaError::other("当前已经是最新版本"));
    }
    let 包 = 选包(&清单, 类型)
        .ok_or_else(|| NotaError::other(format!("更新清单没有 {} 安装包", 类型.id())))?;
    if !合法下载地址(&包.url) {
        return Err(NotaError::other("更新包地址不属于 Nota 官方 Release"));
    }
    执行(类型, 包, 替换规则, 进度, cancelled)
}

fn 验证清单(清单: &清单) -> Result<()> {
    if 清单.schema != 1 {
        return Err(NotaError::other(format!(
            "更新清单版本 {} 不受支持",
            清单.schema
        )));
    }
    if !版本格式合法(&清单.version) {
        return Err(NotaError::other("更新清单里的版本号无效"));
    }
    Ok(())
}

fn 版本格式合法(版本: &str) -> bool {
    let 版本 = 版本.trim_start_matches('v');
    !版本.is_empty()
        && 版本
            .chars()
            .all(|c| c.is_ascii_alphanumeric() || matches!(c, '.' | '-' | '+'))
}

fn 取清单(替换规则: &str) -> Result<清单> {
    let 字节 = 取网络(MANIFEST_URL, 替换规则, MANIFEST_LIMIT, MANIFEST_TIMEOUT)?;
    serde_json::from_slice(&字节)
        .map_err(|e| NotaError::other(format!("更新清单解析失败：{e}")))
}

fn 取网络(地址: &str, 替换规则: &str, 上限: u64, 超时: Duration) -> Result<Vec<u8>> {
    remote::取(地址, 替换规则, 上限, 超时)
}

fn 选包<'a>(清单: &'a 清单, 类型: 安装类型) -> Option<&'a 安装包> {
    清单.packages.get(类型.id()).or_else(|| {
        let 架构 = std::env::consts::ARCH;
        清单
            .packages
            .get(&format!("{}-{架构}", 类型.id()))
    })
}

fn 执行<F>(
    类型: 安装类型,
    包: &安装包,
    替换规则: &str,
    mut 进度: impl FnMut(下载进度),
    cancelled: F,
) -> Result<安装结果>
where
    F: Fn() -> bool,
{
    let 文件 = 下载到临时(包, 替换规则, &mut 进度, &cancelled)?;
    if cancelled() {
        let _ = fs::remove_file(&文件);
        return Err(NotaError::other("更新下载已取消"));
    }
    进度(下载进度 {
        phase: "installing".to_string(),
        downloaded: fs::metadata(&文件).map(|m| m.len()).unwrap_or(0),
        total: fs::metadata(&文件).ok().map(|m| m.len()),
    });
    match 类型 {
        安装类型::Deb => {
            安排_deb_安装(&文件)?;
            Ok(安装结果 {
                message: "更新已准备。Nota 退出后将安装并重新启动。".to_string(),
                restart_required: true,
            })
        }
        安装类型::Rpm => {
            安排_rpm_安装(&文件)?;
            Ok(安装结果 {
                message: "更新已准备。Nota 退出后将安装并重新启动。".to_string(),
                restart_required: true,
            })
        }
        安装类型::AppImage => {
            替换_app_image(&文件)?;
            Ok(安装结果 {
                message: "更新已下载。退出 Nota 后会自动替换并重新启动。".to_string(),
                restart_required: true,
            })
        }
        安装类型::ExeInstall => {
            启动_windows_安装器(&文件)?;
            Ok(安装结果 {
                message: "更新已准备。Nota 退出后将以静默覆盖模式安装并重新启动。".to_string(),
                restart_required: true,
            })
        }
        安装类型::Exe => {
            替换_windows_便携版(&文件)?;
            Ok(安装结果 {
                message: "便携版更新已下载。退出 Nota 后会自动替换并重新启动。".to_string(),
                restart_required: true,
            })
        }
        安装类型::Dev => unreachable!("开发构建在下载前已经返回"),
    }
}

const MAIN_DEV_UPDATE_COMMAND: &str =
    "git pull --ff-only && npm ci && npm run build && cd src-tauri && cargo build --release";

fn 下载到临时<F>(
    包: &安装包,
    替换规则: &str,
    进度: &mut impl FnMut(下载进度),
    cancelled: &F,
) -> Result<PathBuf>
where
    F: Fn() -> bool,
{
    if !合法下载地址(&包.url) {
        return Err(NotaError::other("更新包地址不属于 Nota 官方 Release"));
    }
    let mut 上次报告 = 0_u64;
    let 字节 = remote::取_带进度_可取消(
        &包.url,
        替换规则,
        PACKAGE_LIMIT,
        PACKAGE_TIMEOUT,
        || cancelled(),
        |下载, 总长| {
            if 值得报告进度(下载, 上次报告, 总长) {
                上次报告 = 下载;
                进度(下载进度 {
                    phase: "downloading".to_string(),
                    downloaded: 下载,
                    total: 总长,
                });
            }
        },
    )?;
    let 摘要 = format!("{:x}", Sha256::digest(&字节));
    if 摘要 != 包.sha256.to_ascii_lowercase() {
        return Err(NotaError::other(format!(
            "更新包校验失败：期望 {}，实际 {摘要}",
            包.sha256
        )));
    }
    let 目录 = std::env::temp_dir().join("nota-update");
    fs::create_dir_all(&目录)
        .map_err(|e| NotaError::other(format!("更新临时目录建不出来：{e}")))?;
    let 文件 = 目录.join(安全文件名(&包.file));
    fs::write(&文件, 字节)
        .map_err(|e| NotaError::other(format!("更新包写不进去：{e}")))?;
    Ok(文件)
}

/// 下载进度节流：有总长度时每跨 1%，不知道总长度时每 512 KiB 报一次。
fn 值得报告进度(现在: u64, 上次: u64, 总长: Option<u64>) -> bool {
    if 现在 == 0 || 上次 == 0 {
        return true;
    }
    match 总长.filter(|总| *总 > 0) {
        Some(总) => 现在.saturating_mul(100) / 总 != 上次.saturating_mul(100) / 总,
        None => 现在.saturating_sub(上次) >= 512 * 1024,
    }
}

fn 安全文件名(名: &str) -> String {
    let 名 = Path::new(名)
        .file_name()
        .and_then(|n| n.to_str())
        .unwrap_or("nota-update.pkg");
    名.chars()
        .map(|c| if c.is_ascii_alphanumeric() || ".-_".contains(c) { c } else { '_' })
        .collect()
}

#[cfg(target_os = "linux")]
fn 安排_deb_安装(文件: &Path) -> Result<()> {
    安排_linux_包安装("pkexec apt-get install -y \"$2\"", 文件)
}

#[cfg(not(target_os = "linux"))]
fn 安排_deb_安装(_文件: &Path) -> Result<()> {
    Err(NotaError::other("Debian 安装包只能在 Linux 上安装"))
}

#[cfg(target_os = "linux")]
fn 安排_rpm_安装(文件: &Path) -> Result<()> {
    let 安装 = "if command -v dnf >/dev/null 2>&1; then \
                pkexec dnf install -y \"$2\"; \
                elif command -v zypper >/dev/null 2>&1; then \
                pkexec zypper --non-interactive install \"$2\"; \
                else pkexec rpm -Uvh --replacepkgs \"$2\"; fi";
    安排_linux_包安装(安装, 文件)
}

#[cfg(not(target_os = "linux"))]
fn 安排_rpm_安装(_文件: &Path) -> Result<()> {
    Err(NotaError::other("RPM 安装包只能在 Linux 上安装"))
}

/// 让包管理器与重启进程离开当前 Nota 的生命周期：先等这个进程退出，
/// 再授权安装，成功后原路径重新启动。这样安装器不会覆盖正在执行的二进制，
/// 也不会出现“界面提示更新完成、内存里其实还是旧版”的情况。
#[cfg(target_os = "linux")]
fn 安排_linux_包安装(安装动作: &str, 文件: &Path) -> Result<()> {
    let exe = std::env::current_exe()
        .map_err(|e| NotaError::other(format!("读不到当前可执行文件：{e}")))?;
    let 脚本 = format!(
        "while kill -0 \"$1\" 2>/dev/null; do sleep 1; done; \
         {安装动作} >>\"$4\" 2>&1 && \
         nohup \"$3\" >>\"$4\" 2>&1 &"
    );
    let 日志 = std::env::temp_dir().join("nota-update-install.log");
    Command::new("sh")
        .args(["-c", &脚本, "nota-update"])
        .arg(std::process::id().to_string())
        .arg(文件)
        .arg(exe)
        .arg(日志)
        .stdin(Stdio::null())
        .stdout(Stdio::null())
        .stderr(Stdio::null())
        .spawn()
        .map(|_| ())
        .map_err(|e| NotaError::other(format!("更新安装进程起不来：{e}")))
}

fn 替换_app_image(新文件: &Path) -> Result<()> {
    let 当前 = std::env::var_os("APPIMAGE")
        .map(PathBuf::from)
        .ok_or_else(|| NotaError::other("没有 APPIMAGE 路径，无法替换当前 AppImage"))?;
    let 脚本 = "while kill -0 \"$1\" 2>/dev/null; do sleep 1; done; \
                mv -f \"$3\" \"$2\" && chmod +x \"$2\" && \
                nohup \"$2\" >/tmp/nota-update-restart.log 2>&1 &";
    let mut 命令 = Command::new("sh");
    命令
        .args(["-c", 脚本, "nota-update"])
        .arg(std::process::id().to_string())
        .arg(&当前)
        .arg(新文件)
        .stdout(Stdio::null())
        .stderr(Stdio::null());
    crate::proc::spawn_retrying(&mut 命令)
        .map(|_| ())
        .map_err(|e| NotaError::other(format!("AppImage 替换进程起不来：{e}")))
}

#[cfg(target_os = "windows")]
fn 启动_windows_安装器(文件: &Path) -> Result<()> {
    启动_power_shell_文件替换(文件, false)
}

#[cfg(not(target_os = "windows"))]
fn 启动_windows_安装器(_文件: &Path) -> Result<()> {
    Err(NotaError::other("Windows 安装器只能在 Windows 上运行"))
}

#[cfg(target_os = "windows")]
fn 替换_windows_便携版(文件: &Path) -> Result<()> {
    启动_power_shell_文件替换(文件, true)
}

#[cfg(not(target_os = "windows"))]
fn 替换_windows_便携版(_文件: &Path) -> Result<()> {
    Err(NotaError::other("Windows 便携版更新只能在 Windows 上运行"))
}

#[cfg(target_os = "windows")]
fn 启动_power_shell_文件替换(文件: &Path, 便携版: bool) -> Result<()> {
    let exe = std::env::current_exe()
        .map_err(|e| NotaError::other(format!("读不到当前 exe：{e}")))?;
    let 目录 = exe
        .parent()
        .ok_or_else(|| NotaError::other("当前 exe 没有父目录"))?;
    let 脚本路径 = std::env::temp_dir().join("nota-apply-update.ps1");
    let 脚本 = if 便携版 {
        format!(
            "$p={}; Wait-Process -Id $p -ErrorAction SilentlyContinue; \
             $t=Join-Path $env:TEMP 'nota-update-extract'; Remove-Item $t -Recurse -Force -ErrorAction SilentlyContinue; \
             Expand-Archive -LiteralPath '{}' -DestinationPath $t -Force; \
             Copy-Item -Path (Join-Path $t 'Nota\\*') -Destination '{}' -Recurse -Force; \
             Start-Process -FilePath '{}'",
            std::process::id(),
            ps(文件),
            ps(目录),
            ps(&exe),
        )
    } else {
        format!(
            "$p={}; Wait-Process -Id $p -ErrorAction SilentlyContinue; \
             Start-Process -FilePath '{}' -ArgumentList '/S','/UPDATE','/R' -Wait",
            std::process::id(),
            ps(文件),
        )
    };
    fs::write(&脚本路径, 脚本)
        .map_err(|e| NotaError::other(format!("更新脚本写不出来：{e}")))?;
    let mut 命令 = Command::new("powershell");
    命令
        .args(["-NoProfile", "-WindowStyle", "Hidden", "-ExecutionPolicy", "Bypass", "-File"])
        .arg(脚本路径)
        .stdout(Stdio::null())
        .stderr(Stdio::null());
    crate::proc::spawn_retrying(&mut 命令)
        .map(|_| ())
        .map_err(|e| NotaError::other(format!("Windows 更新脚本起不来：{e}")))
}

#[cfg(target_os = "windows")]
fn ps(路径: &Path) -> String {
    路径.to_string_lossy().replace('\'', "''")
}

fn 安装命令说明(类型: 安装类型) -> String {
    match 类型 {
        安装类型::Deb => "pkexec apt-get install -y <下载的 .deb>".to_string(),
        安装类型::Rpm => "pkexec dnf install -y <下载的 .rpm>".to_string(),
        安装类型::AppImage => "退出后替换当前 AppImage 并重新启动".to_string(),
        安装类型::Exe => "退出后替换便携版启动器并重新启动".to_string(),
        安装类型::ExeInstall => "运行 NSIS 安装程序 /S 覆盖安装".to_string(),
        安装类型::Dev => MAIN_DEV_UPDATE_COMMAND.to_string(),
    }
}

fn 合法下载地址(地址: &str) -> bool {
    地址.starts_with(RELEASE_PREFIX)
}

fn 合法页面(地址: &str) -> String {
    if 地址.starts_with("https://github.com/Nota-MD/Nota/") {
        地址.to_string()
    } else {
        "https://github.com/Nota-MD/Nota/releases".to_string()
    }
}

/// 轻量版本比较：`0.8.0-beta` > `0.7.0-beta`，`0.7.0-beta.1` > `0.7.0-beta`。
pub fn 版本大于(左: &str, 右: &str) -> bool {
    let (左主, 左预) = 拆版本(左);
    let (右主, 右预) = 拆版本(右);
    if 左主 != 右主 {
        return 左主 > 右主;
    }
    match (左预.is_empty(), 右预.is_empty()) {
        (true, true) => false,
        (true, false) => true,
        (false, true) => false,
        (false, false) => 预发布大于(&左预, &右预),
    }
}

fn 拆版本(版本: &str) -> ([u64; 3], Vec<String>) {
    let 版本 = 版本.trim_start_matches('v');
    let (主, 预) = 版本.split_once('-').unwrap_or((版本, ""));
    let mut 数 = [0; 3];
    for (i, 段) in 主.split('.').take(3).enumerate() {
        数[i] = 段.parse().unwrap_or(0);
    }
    (数, 预.split('.').filter(|s| !s.is_empty()).map(str::to_string).collect())
}

fn 预发布大于(左: &[String], 右: &[String]) -> bool {
    for (a, b) in 左.iter().zip(右) {
        let (na, nb) = (a.parse::<u64>().ok(), b.parse::<u64>().ok());
        let 比较 = match (na, nb) {
            (Some(a), Some(b)) => a.cmp(&b),
            (Some(_), None) => std::cmp::Ordering::Less,
            (None, Some(_)) => std::cmp::Ordering::Greater,
            (None, None) => a.cmp(b),
        };
        if 比较 != std::cmp::Ordering::Equal {
            return 比较 == std::cmp::Ordering::Greater;
        }
    }
    左.len() > 右.len()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn 版本比较_能识别正式与预发布() {
        assert!(版本大于("0.8.0-beta", "0.7.0-beta"));
        assert!(版本大于("0.7.0-beta.1", "0.7.0-beta"));
        assert!(版本大于("0.7.0", "0.7.0-beta.9"));
        assert!(!版本大于("0.7.0-beta", "0.7.0-beta"));
        assert!(!版本大于("0.6.9", "0.7.0-beta"));
    }

    #[test]
    fn 只接受_nota_官方_release_下载地址() {
        assert!(合法下载地址(
            "https://github.com/Nota-MD/Nota/releases/download/v0.7.0-beta/a.deb"
        ));
        assert!(!合法下载地址("https://example.com/a.deb"));
        assert!(!合法下载地址("https://github.com/other/Nota/releases/download/x/a"));
    }

    #[test]
    fn 包名会被清洗成单段文件名() {
        assert_eq!(安全文件名("../../evil.deb"), "evil.deb");
        assert_eq!(安全文件名("a b?.AppImage"), "a_b_.AppImage");
    }

    #[test]
    fn 下载进度按百分比或半兆节流() {
        assert!(值得报告进度(1, 0, Some(100)));
        assert!(!值得报告进度(1, 1, Some(100)));
        assert!(值得报告进度(2, 1, Some(100)));
        assert!(!值得报告进度(600_000, 100_000, None));
        assert!(值得报告进度(512 * 1024 + 100_000, 100_000, None));
    }

    #[test]
    fn exeinstall_清单键没有连字符() {
        let json = serde_json::to_string(&安装类型::ExeInstall).unwrap();
        assert_eq!(json, "\"exeinstall\"");
    }

    #[test]
    fn 发布清单可解析且资产地址都在官方_release() {
        let path = Path::new(env!("CARGO_MANIFEST_DIR")).join("../update/latest.json");
        let text = fs::read_to_string(path).unwrap();
        let manifest: 清单 = serde_json::from_str(&text).unwrap();
        验证清单(&manifest).unwrap();
        for (kind, package) in &manifest.packages {
            assert!(
                合法下载地址(&package.url),
                "{kind} 的地址不在官方 Release：{}",
                package.url
            );
            assert!(!package.sha256.is_empty(), "{kind} 缺少 SHA-256");
            assert!(!package.file.is_empty(), "{kind} 缺少文件名");
        }
    }

    #[test]
    fn 已请求取消时不访问更新清单() {
        let result = 安装("", |_| {}, || true);
        assert!(result.unwrap_err().to_string().contains("取消"));
    }
}
