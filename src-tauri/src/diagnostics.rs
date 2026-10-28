//! 「关于 → 故障排除」那一页要的两组信息：**编译信息**与**本机信息**。
//!
//! # 为什么这两组要分开
//!
//! 它们回答的是**两个不同的机器**上的问题，而报告一个缺陷时最常被搞混的就是这一点：
//!
//! | 组 | 说的是 | 谁的事实 |
//! |---|---|---|
//! | 编译信息 | 这个二进制是**什么时候、在哪台机器上、用什么工具链**编出来的 | **打包的那台机器**（可能早就没了） |
//! | 本机信息 | 现在**跑着它的这台机器**是什么系统、什么内核、什么 GTK / WebKitGTK | 用户手上这台 |
//!
//! 「你的 rustc 是什么版本」这种问题问的是**第一组**：用户手里的包不是他编的，
//! 他这台机器上有没有 rustc 跟这个包能不能跑毫不相干。反过来，WebKitGTK 渲染出问题
//! 要问的是**第二组**——那是运行时装上的那个库。两组都不许少。
//!
//! # 编译期那一半从哪来
//!
//! `build.rs` 在编译时采好、写进 `OUT_DIR/build_info.rs`，这里 `include!` 进来。
//! 为什么不在这儿现问：见那个文件的文件头。
//!
//! # 一条口径：**取不到就写空串，前端画成「—」**
//!
//! 这一页的存在理由是"出事时能一次问清楚"，所以它自己**绝不能因为取不到某一条而
//! 整页空白**。每条都是尽力而为：`node` 没装就是没装，`/etc/os-release` 不是每个
//! 系统都有（Linux 之外没有）。空串交给前端统一画成「—」，前端不需要知道哪条可能缺。

use std::time::Duration;

use crate::proc::{run_capture, Ran, RunOpts};

/// `build.rs` 生成的那些常量。⚠️ 这个文件在 `OUT_DIR` 里，**不在仓库里**。
mod 编译期 {
    include!(concat!(env!("OUT_DIR"), "/build_info.rs"));
}

/// 问一条外部命令要一行版本。超时 2 秒——`uname -r` 一类的，卡住就说明有问题。
///
/// ⚠️ **失败一律给空串**，不向上报错：这一页少一行是可以接受的，"整页打不开"不是。
///
/// ⚠️ `#[cfg(not(target_os = "windows"))]`：Windows 上这一格整族走的是
/// [`问一行非空`]（`cmd /C ver` 那个输出**带前导空行**，`lines().next()` 拿到的是
/// 空的那一行），于是这一个在那边没有任何调用点——不加这个 `cfg` 就是一条
/// dead_code 警告（2026-10-16 交叉编 Windows 时当场看到的）。
#[cfg(not(target_os = "windows"))]
fn 问一行(程序: &str, 参数: &[&str]) -> String {
    let 参数: Vec<String> = 参数.iter().map(|s| s.to_string()).collect();
    match run_capture(
        程序,
        &参数,
        RunOpts::timeout(Duration::from_secs(2))
            .env("LC_ALL", "C")
            .env("LANG", "C"),
    ) {
        Ran::Done { ok: true, stdout, .. } => stdout.lines().next().unwrap_or("").trim().to_string(),
        _ => String::new(),
    }
}

/// 这台机器跑的是什么系统，**给人看的一句话**。
///
/// | 平台 | 从哪儿来 | 长什么样 |
/// |---|---|---|
/// | Linux | `/etc/os-release` 的 `PRETTY_NAME` | `Fedora Linux 44` |
/// | macOS | `sw_vers -productName` ＋ `-productVersion` | `macOS 14.5` |
/// | Windows | `cmd /C ver` | `Microsoft Windows [Version 10.0.22631.4169]` |
///
/// ⚠️⚠️ **2026-10-16 之前只有 Linux 那一支**（原来这个函数直接读 `/etc/os-release`），
/// 于是 Windows 上「本机信息」那一整段全是「—」（朋友实测报回来的：
/// 「"本机信息"Windows上面无法显示」）。macOS 同理——那里也没有那个文件。
///
/// ⚠️ **Linux 那一支不引 shell**：就是读一个文本文件、找一行、把两头的引号去掉。
/// 用 `sh -c` 去做这件事等于为了省十行代码给自己开一个执行任意字符串的口子。
/// Windows / macOS 那两支**必须**起一个进程（没有等价的可读文件），所以走
/// `问一行`（2 秒超时、失败给空串，同这个文件顶上那条口径）。
#[cfg(target_os = "linux")]
fn 发行版() -> String {
    let 内容 = match std::fs::read_to_string("/etc/os-release") {
        Ok(它) => 它,
        Err(_) => return String::new(),
    };
    linux_发行版(&内容)
}

/// macOS：`macOS 14.5`（两个 `sw_vers` 字段拼起来）。
///
/// ⚠️ `sw_vers` **没有"一行给全部"的写法**（`-productVersion` 与 `-productName`
/// 是两个开关），所以这里问两次。两次都在 `问一行` 的超时里，取不到就是空串。
#[cfg(target_os = "macos")]
fn 发行版() -> String {
    let 版本 = 问一行("sw_vers", &["-productVersion"]);
    if 版本.is_empty() { "macOS".into() } else { format!("macOS {版本}") }
}

/// Windows：`cmd /C ver` 的那一行。
///
/// ⚠️ **不用 `wmic`**：它在 Windows 11 上已经被移除了（微软的弃用公告），
/// 而 `ver` 是 `cmd` 的内建命令、哪一版都在。得到的串长这样：
/// `Microsoft Windows [Version 10.0.22631.4169]`——那句话里既有"什么系统"
/// 也有内部版本号（[`内核版本`] 从同一个串里抠），够这一页用了。
///
/// ⚠️ `ver` 在 Windows 上带一个**前导空行**，而 `问一行` 取的是 `lines().next()`
/// ——那会拿到空串。所以这里用 `问一行非空`（见那个函数）。
#[cfg(target_os = "windows")]
fn 发行版() -> String {
    windows_发行版(&问一行非空("cmd", &["/C", "ver"]))
}

/// 内核 / 内部版本号。
///
/// | 平台 | 从哪儿来 |
/// |---|---|
/// | Linux / macOS | `uname -r`（`6.11.5-300.fc41.x86_64` / `23.6.0`） |
/// | Windows | 从 `cmd /C ver` 那行里抠出 `[Version 10.0.22631.4169]` 的中间那段 |
///
/// ⚠️ Windows 那一支**不是"没有内核所以留空"**：NT 的版本号就是这一格该说的东西
/// （同一个串里，`ver` 给的就是它），留空只会让那一行继续是「—」。
#[cfg(not(target_os = "windows"))]
fn 内核版本() -> String {
    问一行("uname", &["-r"])
}

#[cfg(target_os = "windows")]
fn 内核版本() -> String {
    let 原 = 问一行非空("cmd", &["/C", "ver"]);
    windows_内核(&原)
}

/// 同 [`问一行`]，但**跳过空行**取第一行有内容的前面那一段。
///
/// ⚠️ 2026-10-16 加，只为 Windows 的 `ver`：它的输出第一行是空的
/// （实测 `\r\nMicrosoft Windows [Version …]`），`问一行` 的 `lines().next()`
/// 拿到的是那个空行——症状是"函数起了、也问到了、还是空的"。
///
/// ⚠️ `#[cfg(target_os = "windows")]`：**只有 Windows 那两支用得上它**
/// （Linux 的 `uname -r` 与 macOS 的 `sw_vers` 都不带前导空行），
/// 不加这个 `cfg` 在别的平台上就是一条 dead_code 警告。
#[cfg(target_os = "windows")]
fn 问一行非空(程序: &str, 参数: &[&str]) -> String {
    let 参数: Vec<String> = 参数.iter().map(|s| s.to_string()).collect();
    match run_capture(
        程序,
        &参数,
        RunOpts::timeout(Duration::from_secs(2))
            .env("LC_ALL", "C")
            .env("LANG", "C"),
    ) {
        Ran::Done { ok: true, stdout, .. } => stdout
            .lines()
            .map(str::trim)
            .find(|行| !行.is_empty())
            .unwrap_or("")
            .to_string(),
        _ => String::new(),
    }
}

#[cfg(target_os = "linux")]
fn linux_发行版(内容: &str) -> String {
    let mut name = "";
    let mut version = "";
    for line in 内容.lines() {
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
        .find(|part| {
            part.chars().next().is_some_and(|c| c.is_ascii_digit()) && part.contains('.')
        })
        .unwrap_or("")
        .trim_matches(|c: char| !c.is_ascii_digit() && c != '.')
        .to_string()
}

#[cfg(any(target_os = "windows", test))]
fn windows_发行版(raw: &str) -> String {
    let version = version_token(raw);
    if version.is_empty() { "Windows".into() } else { format!("Windows {version}") }
}

#[cfg(any(target_os = "windows", test))]
fn windows_内核(raw: &str) -> String {
    version_token(raw)
}

/// GTK 的**运行时**版本（`major.minor.micro`）。
///
/// 注意这是**链接进来的那个库**的版本，不是 `Cargo.lock` 里那个 crate 的版本——
/// 两者一般对得上，但对不上恰恰是最该看见的情况。
///
/// ⚠️ **只有 Linux 编得进来**（2026-10-10）：`gtk` / `webkit2gtk` 两个 crate
/// 在 `Cargo.toml` 里就挂在 `[target.'cfg(target_os = "linux")'.dependencies]`
/// 底下——别的平台上这两个名字压根不存在，不加 `cfg` 就是编译期报错
/// （"cannot find module or crate `gtk`"）。别的平台给空串，
/// 同上面"采不到就是空串"那条口径。
#[cfg(target_os = "linux")]
fn gtk_运行时() -> String {
    format!(
        "{}.{}.{}",
        gtk::major_version(),
        gtk::minor_version(),
        gtk::micro_version()
    )
}

/// 别的平台：没有 GTK 这一层（见上面那条注释）。
#[cfg(not(target_os = "linux"))]
fn gtk_运行时() -> String {
    String::new()
}

/// WebKitGTK 的运行时版本。
///
/// ⚠️ `webkit2gtk` 这个 crate 没有给 `major_version()` 这类封装（gtk 那个有），
/// 只能走 `ffi`。是 `unsafe`，但这三个函数**没有参数、也不碰任何对象**，
/// 就是返回编译进去的常量，所以这里不存在真正的内存安全风险。
#[cfg(target_os = "linux")]
fn webkit_运行时() -> String {
    // SAFETY：见上——三个 getter 都是无参、无副作用的常量返回。
    unsafe {
        format!(
            "{}.{}.{}",
            webkit2gtk::ffi::webkit_get_major_version(),
            webkit2gtk::ffi::webkit_get_minor_version(),
            webkit2gtk::ffi::webkit_get_micro_version()
        )
    }
}

/// 别的平台：没有 WebKitGTK（见 `gtk_运行时` 那条注释）。
#[cfg(not(target_os = "linux"))]
fn webkit_运行时() -> String {
    String::new()
}

/// 送给界面的那一份报告。
///
/// ⚠️ **字段名一律 snake_case 直接过 JSON**（本仓的惯例，见 `src/bridge/types.ts`），
/// 不搞 camelCase 转换——两处名字不一样时的表现是"界面上一格永远空着"，
/// 而这种错编译器一句话都不会说。
///
/// ⚠️ **这里的值全是原始字符串，一个都不翻译。** 标签（"rustc" 前面的那个词）
/// 归前端：这一页要跟着界面语言走，而"翻译"这件事在 `src/i18n/` 那一侧，
/// 后端送一句英文过去、前端再猜该不该翻，是两套真相。
#[derive(Debug, Clone, serde::Serialize)]
pub struct 诊断 {
    // ── 编译信息 ──────────────────────────────────────────────────────────
    /// 包版本。⚠️ 与前端 `getVersion()` 同源（都是 `tauri.conf.json` 那个 `version`），
    /// 但**另留一条**：`getVersion()` 在开发构建里会失败，而这一页不该因此缺一格。
    pub version: String,
    /// 编译完成那一刻（Unix 秒）。前端按用户的语言与时区格式化。
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
    // ── 本机信息 ──────────────────────────────────────────────────────────
    pub os_pretty: String,
    pub kernel: String,
    pub arch: String,
    pub gtk_runtime: String,
    pub webkit_runtime: String,
}

/// 采一份报告。**永不失败**：每条取不到就是空串（见文件头那条口径）。
pub fn 收集() -> 诊断 {
    诊断 {
        version: env!("CARGO_PKG_VERSION").to_string(),
        build_time: 编译期::编译时刻,
        build_host: 编译期::编译主机.to_string(),
        build_platform: 编译期::编译平台.to_string(),
        target: 编译期::目标三元组.to_string(),
        profile: 编译期::构建档案.to_string(),
        rustc: 编译期::RUSTC.to_string(),
        cargo: 编译期::CARGO.to_string(),
        node: 编译期::NODE.to_string(),
        npm: 编译期::NPM.to_string(),
        tauri: 编译期::TAURI_版本.to_string(),
        webkit_crate: 编译期::WEBKIT_CRATE_版本.to_string(),
        gtk_crate: 编译期::GTK_CRATE_版本.to_string(),
        mlua: 编译期::MLUA_版本.to_string(),
        os_pretty: 发行版(),
        kernel: 内核版本(),
        arch: std::env::consts::ARCH.to_string(),
        gtk_runtime: gtk_运行时(),
        webkit_runtime: webkit_运行时(),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn 采得出来而且关键的几格不是空的() {
        let 报告 = 收集();
        // 这几条**一定**取得到：前两条是编译期常量、后两条来自链接进来的库。
        assert!(!报告.version.is_empty(), "包版本不该为空");
        assert!(!报告.target.is_empty(), "目标三元组不该为空");
        // ⚠️ **后两条只在 Linux 上成立**（2026-10-10）：GTK / WebKitGTK 那两个
        // crate 是 Linux 专属依赖，别的平台上这两格按"采不到就是空串"给空串。
        #[cfg(target_os = "linux")]
        {
        assert_ne!(报告.gtk_runtime, "0.0.0", "GTK 运行时版本不该是 0.0.0");
        assert_ne!(
            报告.webkit_runtime, "0.0.0",
            "WebKitGTK 运行时版本不该是 0.0.0"
        );
        }
        // 别的平台那两格是空的——**也钉一条**，免得哪天有人给它们塞一个假的
        // "0.0.0" 进去（那是"问到了但是零"，与"没问到"不是一回事）。
        #[cfg(not(target_os = "linux"))]
        {
            assert!(报告.gtk_runtime.is_empty());
            assert!(报告.webkit_runtime.is_empty());
        }
    }

    #[test]
    fn 采不到的东西是空串而不是炸掉() {
        // 直接验"问一行"那条兜底路径：程序不存在时给空串。
        assert_eq!(问一行("这个程序一定不存在-nota", &[]), "");
    }

    #[test]
    fn 编译时刻是个像样的秒数() {
        // 2020-01-01 之后的秒数。比这更早只可能是 build.rs 拿到了一个假时间。
        assert!(收集().build_time > 1_577_836_800);
    }

    #[test]
    fn linux_系统名固定英文组成() {
        let text = "NAME=\"Fedora Linux\"\nVERSION_ID=44\nPRETTY_NAME=\"本地化名称\"\n";
        assert_eq!(linux_发行版(text), "Fedora Linux 44");
    }

    #[test]
    fn windows_本地化ver仍归一化为英文系统名和版本() {
        let text = "Microsoft Windows [版本 10.0.26100.3915]";
        assert_eq!(windows_发行版(text), "Windows 10.0.26100.3915");
        assert_eq!(windows_内核(text), "10.0.26100.3915");
    }

    #[test]
    fn 无法解析的windows输出也不会泄漏本地化原文() {
        assert_eq!(windows_发行版("Microsoft Windows [版本 未知]"), "Windows");
        assert_eq!(windows_内核("Microsoft Windows [版本 未知]"), "");
    }
}
