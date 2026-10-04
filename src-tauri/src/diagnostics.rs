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
fn 问一行(程序: &str, 参数: &[&str]) -> String {
    let 参数: Vec<String> = 参数.iter().map(|s| s.to_string()).collect();
    match run_capture(程序, &参数, RunOpts::timeout(Duration::from_secs(2))) {
        Ran::Done { ok: true, stdout, .. } => stdout.lines().next().unwrap_or("").trim().to_string(),
        _ => String::new(),
    }
}

/// `/etc/os-release` 里的 `PRETTY_NAME`（就是"Fedora Linux 44"这种给人看的名字）。
///
/// ⚠️ **不引 shell**：就是读一个文本文件、找一行、把两头的引号去掉。用 `sh -c` 去做
/// 这件事等于为了省十行代码给自己开一个执行任意字符串的口子。
fn 发行版() -> String {
    let 内容 = match std::fs::read_to_string("/etc/os-release") {
        Ok(它) => 它,
        Err(_) => return String::new(),
    };
    for 行 in 内容.lines() {
        if let Some(值) = 行.strip_prefix("PRETTY_NAME=") {
            return 值.trim().trim_matches('"').to_string();
        }
    }
    String::new()
}

/// GTK 的**运行时**版本（`major.minor.micro`）。
///
/// 注意这是**链接进来的那个库**的版本，不是 `Cargo.lock` 里那个 crate 的版本——
/// 两者一般对得上，但对不上恰恰是最该看见的情况。
fn gtk_运行时() -> String {
    format!(
        "{}.{}.{}",
        gtk::major_version(),
        gtk::minor_version(),
        gtk::micro_version()
    )
}

/// WebKitGTK 的运行时版本。
///
/// ⚠️ `webkit2gtk` 这个 crate 没有给 `major_version()` 这类封装（gtk 那个有），
/// 只能走 `ffi`。是 `unsafe`，但这三个函数**没有参数、也不碰任何对象**，
/// 就是返回编译进去的常量，所以这里不存在真正的内存安全风险。
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
        kernel: 问一行("uname", &["-r"]),
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
        assert_ne!(报告.gtk_runtime, "0.0.0", "GTK 运行时版本不该是 0.0.0");
        assert_ne!(
            报告.webkit_runtime, "0.0.0",
            "WebKitGTK 运行时版本不该是 0.0.0"
        );
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
}
