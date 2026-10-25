//! 构建脚本。
//!
//! 除了那一行 `tauri_build::build()`（Tauri 的惯例，别删），这里还**采一份编译期
//! 信息**、写成一个 Rust 文件丢进 `OUT_DIR`，给「关于 → 故障排除」那一页读
//! （`src/diagnostics.rs` 里 `include!` 进去）。
//!
//! # 为什么要在编译期采，而不是运行时现问
//!
//! 那一页要回答的是"**这个二进制**是什么时候、在哪台机器上、用什么工具链编出来的"。
//! 运行时的机器**不是**编译时的机器——用户拿到的是一个编译好的包，问他"你的 rustc
//! 是什么版本"是问错了对象。工具链与依赖版本只有编译期知道。
//!
//! # 三条纪律
//!
//! ① **一条信息取不到不算错误，写空串。** 打包环境里可能没有 `node` / `npm`，
//!    而"缺一行"远好过"构建失败"。
//! ② **不许联网、不许新增依赖。** 这里只用 `std`（`Command` / `fs` / `SystemTime`）。
//! ③ **时间戳只给 Unix 秒**，不在这里做日期格式化——那件事交给前端按用户的语言和
//!    时区做（`new Date(秒 * 1000).toLocaleString()`），在这儿写死一个格式就等于
//!    把时区钉在编译机器上。

use std::process::Command;
use std::time::{SystemTime, UNIX_EPOCH};

/// 跑一条命令、取它 stdout 的第一行。取不到（没装 / 非零退出 / 不是 UTF-8）就给空串。
///
/// ⚠️ **不设超时**：这几条都是 `--version` 那种立刻返回的，加超时得自己起线程等，
/// 而构建脚本卡住的代价是"整个构建卡住"，不是"一页信息少一行"。真卡住了，`Ctrl+C`
/// 看得见是谁。
fn 取版本(程序: &str, 参数: &[&str]) -> String {
    let 输出 = match Command::new(程序).args(参数).output() {
        Ok(o) if o.status.success() => o,
        _ => return String::new(),
    };
    String::from_utf8_lossy(&输出.stdout)
        .lines()
        .next()
        .unwrap_or("")
        .trim()
        .to_string()
}

/// 从 `Cargo.lock` 里抠出某个包**这次实际锁住的**版本号。
///
/// `Cargo.lock` 的格式是若干段 `[[package]]` ＋ `name = "…"` ＋ `version = "…"`，
/// 没有嵌套，所以按行扫就够了——**不引 TOML 解析器**（那要新增依赖，见纪律 ②）。
///
/// ⚠️ 找不到就返回空串：依赖换了名字、或者锁文件格式变了，都只是少一行。
fn 锁文件版本(锁文件: &str, 包名: &str) -> String {
    let 想要的名字 = format!("name = \"{包名}\"");
    let mut 上一行是它 = false;
    for 行 in 锁文件.lines() {
        let 行 = 行.trim();
        if 行 == 想要的名字 {
            上一行是它 = true;
            continue;
        }
        if 上一行是它 {
            if let Some(版本) = 行.strip_prefix("version = ") {
                return 版本.trim().trim_matches('"').to_string();
            }
            上一行是它 = false;
        }
    }
    String::new()
}

/// 把一个字符串写成 Rust 字面量。**必须转义**：生成的是 `.rs` 源码，
/// 里面的值来自外部程序，一个引号就能让整份文件编译不过。
fn 字面量(原: &str) -> String {
    let mut 结果 = String::with_capacity(原.len() + 2);
    结果.push('"');
    for 字 in 原.chars() {
        match 字 {
            '"' => 结果.push_str("\\\""),
            '\\' => 结果.push_str("\\\\"),
            '\n' => 结果.push_str("\\n"),
            '\r' => 结果.push_str("\\r"),
            '\t' => 结果.push_str("\\t"),
            控制 if (控制 as u32) < 0x20 => {
                结果.push_str(&format!("\\u{{{:x}}}", 控制 as u32))
            }
            别的 => 结果.push(别的),
        }
    }
    结果.push('"');
    结果
}

fn main() {
    // ⚠️ `build.rs` 与 `Cargo.lock` 变了要重跑：前者是这段代码自己，后者管着那几行
    // 依赖版本号。
    println!("cargo:rerun-if-changed=build.rs");
    println!("cargo:rerun-if-changed=Cargo.lock");
    // ⚠️ **`src/` 整棵也要声明**，为的是那个"编译时间戳"。
    // `rerun-if-changed` 只在文件**真变了**的时候才重跑脚本——所以源码没动时它不跑，
    // 时间戳也不会自己往前走（不会每次 `cargo build` 都白重编一遍）；而源码一动、
    // 这次构建本来就要重编这个 crate，时间戳跟着走到"这一次"，正是它该有的意思。
    println!("cargo:rerun-if-changed=src");

    let 时刻 = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_secs())
        .unwrap_or(0);

    // 主机名：优先问 `hostname`，取不到再读 `/etc/hostname`。
    let mut 主机 = 取版本("hostname", &[]);
    if 主机.is_empty() {
        主机 = std::fs::read_to_string("/etc/hostname")
            .map(|s| s.trim().to_string())
            .unwrap_or_default();
    }

    // ⚠️ 这里说的是**编译机器**，不是运行机器。优先使用 Cargo 的 HOST
    // 三元组，避免 Windows runner 上的 MSYS `uname` 被误报成 Linux；
    // 非 Windows 再补内核信息，便于区分发行版构建机。
    let 主机三元组 = std::env::var("HOST").unwrap_or_default();
    let 平台 = if cfg!(windows) {
        let 版本 = 取版本("cmd", &["/C", "ver"]);
        match (版本.is_empty(), 主机三元组.is_empty()) {
            (true, true) => String::new(),
            (true, false) => 主机三元组,
            (false, true) => 版本,
            (false, false) => format!("{版本} [{主机三元组}]"),
        }
    } else {
        let uname = 取版本("uname", &["-srm"]);
        match (uname.is_empty(), 主机三元组.is_empty()) {
            (true, true) => String::new(),
            (true, false) => 主机三元组,
            (false, true) => uname,
            (false, false) => format!("{uname} [{主机三元组}]"),
        }
    };

    let 锁 = std::fs::read_to_string("Cargo.lock").unwrap_or_default();

    // ⚠️ `TARGET` / `PROFILE` 是 **cargo 在"跑构建脚本"时**塞进来的环境变量，
    // 不是编 `build.rs` 时的编译期常量——所以这里必须 `std::env::var`，
    // 用 `option_env!` 拿到的是空串（踩过：那一格在界面上一直空着）。
    let 目标 = std::env::var("TARGET").unwrap_or_default();
    let 档案 = std::env::var("PROFILE").unwrap_or_default();

    let 内容 = format!(
        "// ⚠️ 这个文件是 `build.rs` 生成的，**别改、也别提交**——每次真正重编会覆盖它。\n\
         // 读它的地方：`src/diagnostics.rs`（`include!` 进来，再经 `nota_diagnostics` 送给界面）。\n\
         \n\
         /// 编译完成的那一刻（Unix 秒）。格式化成日期是前端的事。\n\
         pub const 编译时刻: u64 = {时刻};\n\
         /// 编译这台机器的主机名。\n\
         pub const 编译主机: &str = {主机};\n\
         /// `uname -srm`：编译机器的内核与架构。\n\
         pub const 编译平台: &str = {平台};\n\
         /// 构建脚本眼里的目标三元组与构建档案。\n\
         pub const 目标三元组: &str = {目标};\n\
         pub const 构建档案: &str = {档案};\n\
         /// 四条工具链版本（`--version` 的第一行），取不到就是空串。\n\
         pub const RUSTC: &str = {rustc};\n\
         pub const CARGO: &str = {cargo};\n\
         pub const NODE: &str = {node};\n\
         pub const NPM: &str = {npm};\n\
         /// 编译时锁住的几个关键依赖版本（读自 `Cargo.lock`）。\n\
         pub const TAURI_版本: &str = {tauri};\n\
         pub const WEBKIT_CRATE_版本: &str = {webkit};\n\
         pub const GTK_CRATE_版本: &str = {gtk};\n\
         pub const MLUA_版本: &str = {mlua};\n",
        主机 = 字面量(&主机),
        平台 = 字面量(&平台),
        目标 = 字面量(&目标),
        档案 = 字面量(&档案),
        rustc = 字面量(&取版本("rustc", &["-V"])),
        cargo = 字面量(&取版本("cargo", &["-V"])),
        node = 字面量(&取版本("node", &["-v"])),
        npm = 字面量(&取版本("npm", &["-v"])),
        tauri = 字面量(&锁文件版本(&锁, "tauri")),
        webkit = 字面量(&锁文件版本(&锁, "webkit2gtk")),
        gtk = 字面量(&锁文件版本(&锁, "gtk")),
        mlua = 字面量(&锁文件版本(&锁, "mlua")),
    );

    let 出去 = std::path::Path::new(&std::env::var("OUT_DIR").expect("OUT_DIR 没给"))
        .join("build_info.rs");
    std::fs::write(&出去, 内容).expect("写 build_info.rs 失败");

    tauri_build::build()
}
