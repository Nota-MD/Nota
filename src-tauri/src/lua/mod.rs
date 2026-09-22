//! Lua 插件运行时。
//!
//! # 一插件一状态
//!
//! **每个插件拿到一个独立的 `Lua`**，不是所有插件共享一个。带来三件事：
//!
//! 1. **隔离**：一个插件把脚本写崩（栈溢出、死循环、抛错），`pcall` 之外的东西
//!    影响不到别的插件，也影响不到宿主；
//! 2. **能力放行是天然的**：`nota.document` 这张表**只在插件申请了
//!    `document.read`/`document.write` 时才存在**——不是"存在但调用时报错"。
//!    没申请 `process.git` 的插件，`nota.git` 那格就是 `nil`，写不出来也绕不过去。
//! 3. **卸载 = 丢掉这个 `Lua`**，不用做引用计数、不用管谁还拿着回调。
//!
//! # 沙箱
//!
//! 两道闸，缺一不可：
//!
//! - **第一道（本文件 `硬化的_lua()`）**：**显式**只开 `coroutine` / `table` /
//!   `string` / `utf8` / `math`，再把 `io` / `os` / `package` / `require` /
//!   `loadfile` / `dofile` / `debug` 逐个置 `nil`。
//! - **第二道（`api/mod.rs`）**：所有对外能力都**只**通过 `nota.*` 表提供，
//!   且逐项按清单里声明的 capability 决定装不装。
//!
//! 换句话说：脚本能做的事 = 清单申请到的事，没有旁路。
//!
//! ## ⚠️ 第一道闸曾经是假的（BUG-10，2026-09-22 修）
//!
//! 这里原本写的是「`Lua::new()` 只加载安全标准库子集，`io`/`os`/`debug`/
//! `package`/`require` **全都不存在**」。**那是错的。**
//!
//! mlua 源码（0.12.1，`src/stdlib.rs`）：
//!
//! ```text
//! pub const ALL_SAFE: StdLib = StdLib((1 << 30) - 1);   // 第 0–29 位全含
//! pub const IO:       StdLib = StdLib(1 << 2);          // ← 在里面
//! pub const OS:       StdLib = StdLib(1 << 3);          // ← 在里面
//! pub const PACKAGE:  StdLib = StdLib(1 << 8);          // ← 在里面
//! pub const DEBUG:    StdLib = StdLib(1 << 31);         // 只有它被排除
//! ```
//!
//! `Lua::new()` 就是 `new_with(StdLib::ALL_SAFE, …)`，而它的"safe"**指的是
//! "不能加载 C 模块"**（`new_with` 里只做了 `mark_safe()` + `disable_c_modules()`），
//! **不是"没有 io/os"**。实测（与本项目同 feature）：
//! `os.execute("touch /tmp/x")` 真的建出了文件，`io.open("/etc/hostname")` 真的读到了
//! 内容，`require` 唯一的失败原因是 `can't load C modules in safe mode`。
//!
//! 后果很实：一个**只申请 `ui.notify`** 的插件可以 `os.execute("rm -rf ~")` 绕过全部
//! 能力围栏——**围栏是装饰**。所以现在不再依赖 `Lua::new()` 的默认值，而是自己列白名单。
//!
//! **教训（比这个 bug 值钱）**：**别把一个库的 `safe` 字面当作安全承诺**。
//! "safe" 是它自己定义的口径，写在源码里，只能自己去读。
//!
//! # 插件入口约定
//!
//! 入口脚本（清单里的 `entry`，默认 `main.lua`）按模块写：
//!
//! ```lua
//! local M = {}
//!
//! function M.on_load(nota)
//!   nota.command.register("git.status", function() … end)
//! end
//!
//! function M.on_unload()
//!   -- 可选；不写就是没活要干
//! end
//!
//! return M
//! ```
//!
//! `on_load` / `on_unload` 都是可选的。整个 chunk 用 `pcall` 包着跑——
//! **插件炸了不能带走宿主**（这条与 Folio 的 C 插件相反：那边同进程无沙箱，
//! 插件的段错误就是宿主的段错误）。

pub mod api;

use std::path::Path;
use std::sync::{Arc, Mutex};

use mlua::{Lua, Table};

use crate::document::DocumentStore;
use crate::error::{NotaError, Result};
use crate::plugin::manifest::Manifest;
use crate::settings::Settings;

/// 装进 `nota.*` 各闭包里的共享上下文。
///
/// ⚠️ **锁序不变量**：拿锁的顺序只能是
/// `plugins → documents → settings`，**不许反向**。
/// 反向会死锁：Lua 回调里取 documents 的同时另一个命令正取着 documents 等 settings。
/// 这条写在 `docs/03-data-structures.md` §锁序。
#[derive(Clone)]
pub struct HostContext {
    /// 发事件给前端的把手。
    pub app: tauri::AppHandle,
    pub documents: Arc<Mutex<DocumentStore>>,
    pub settings: Arc<Mutex<Settings>>,
    /// 当前工作区根目录。插件的 `fs.*` 相对它解析、也被它限死在里头。
    pub workspace: Arc<Mutex<Option<std::path::PathBuf>>>,
    /// 这个插件的 id，出错信息里带上，好定位是谁炸的。
    pub plugin_id: String,
}

/// 插件能用的标准库：**只有这五个**。
///
/// 刻意**不含** `io`（读写任意文件）、`os`（起进程、拿环境变量）、
/// `package`（`require`、`loadlib`）、`debug`（`sethook` 之后什么都能干）。
/// 需要文件/进程/网络，走 `nota.fs.*` / `nota.git.*` / `nota.http.*`——
/// 那些是**按清单声明的能力**放行的，才是能力围栏。
///
/// 写成函数而不是 `const`：`StdLib` 的 `BitOr` 不是 `const fn`（源码里是普通的
/// `impl BitOr for StdLib`），`const X: StdLib = A | B;` 编不过。
/// 顺带的好处是用例能直接 `assert!(插件标准库().contains(…))` 去钉它。
fn 插件标准库() -> mlua::StdLib {
    mlua::StdLib::COROUTINE
        | mlua::StdLib::TABLE
        | mlua::StdLib::STRING
        | mlua::StdLib::UTF8
        | mlua::StdLib::MATH
}

/// 这些全局**必须不存在**，不管 `new_with` 开没开对应的库。
///
/// ⚠️ `loadfile` / `dofile` 属于 **base** 库，而 base 库 mlua 是**无条件加载**的
/// （`print` / `pcall` / `setmetatable` 都在里面，没法通过 `StdLib` 关掉），
/// 所以光靠 `插件标准库` 关不掉它们——**必须显式置 `nil`**。
///
/// 这份名单同时是"不许回来"的清单：就算哪天 mlua 把 `ALL_SAFE` 的定义改了，
/// 或者有人手滑把 `Lua::new()` 写了回来，下面的用例也会红。
const 必须为空的全局: [&str; 7] = [
    "io",       // 读写任意文件：io.open("/etc/shadow")
    "os",       // os.execute("rm -rf ~")、os.getenv("TOKEN")
    "package",  // package.path / loadlib
    "require",  // 配合 package 加载任意模块
    "dofile",   // base 库给的，直接执行任意文件
    "loadfile", // base 库给的，读任意文件并编译
    "debug",    // sethook / getupvalue：拿到 C 函数就能为所欲为
];

/// 造一个**真正**收紧了标准库的 `Lua`。
///
/// **所有插件的 `Lua` 都必须从这里来，不许直接写 `Lua::new()`**——
/// 原因见本文件顶上「第一道闸曾经是假的」那一段（BUG-10）。
fn 硬化的_lua() -> Result<Lua> {
    硬化的_lua_或错().map_err(NotaError::other)
}

/// `硬化的_lua()` 的原始版本。单独剥出来是为了让用例能直接拿到 `mlua::Error`，
/// 也为了让 `Result` 的类型在下面置 `nil` 时不必反复标注。
fn 硬化的_lua_或错() -> std::result::Result<Lua, String> {
    let lua = Lua::new_with(插件标准库(), mlua::LuaOptions::default())
        .map_err(|e| format!("创建 Lua 状态失败：{e}"))?;

    // 列表之外的一律抹掉。base 库那几个关不掉的，就靠这一步。
    let globals = lua.globals();
    for name in 必须为空的全局 {
        globals
            .set(name, mlua::Value::Nil)
            .map_err(|e| format!("抹掉全局 `{name}` 失败：{e}"))?;
    }

    Ok(lua)
}

/// 一个已经跑起来（或加载失败）的插件。
pub struct LuaPlugin {
    pub manifest: Manifest,
    pub lua: Lua,
    pub state: PluginState,
    /// `on_unload` 存在时存这里，卸载时调。
    ///
    /// 存的是 registry 里的引用（`Lua` 生命周期的事），不是 `Function` 本体——
    /// mlua 的 `Function` 带着 `'lua` 生命周期，不好塞进结构体。
    has_unload: bool,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum PluginState {
    /// 加载并跑通了 `on_load`。
    Loaded,
    /// 加载失败。带着原因，界面上要显示——静默吞掉会让人以为插件没装。
    Failed(String),
    /// 用户禁用了。
    Disabled,
}

impl LuaPlugin {
    /// 加载一个插件：建 Lua 状态、按能力装 `nota.*`、跑入口脚本。
    ///
    /// **失败不返回 `Err`**，而是返回一个 `state = Failed` 的实例——
    /// 一个插件坏掉不该让整个启动流程挂掉，界面上照常列出它并标红。
    pub fn load(manifest: Manifest, ctx: HostContext) -> Self {
        // ⚠️ 从这里拿 `Lua`，**不要**写回 `Lua::new()`（BUG-10）。
        let lua = match 硬化的_lua() {
            Ok(lua) => lua,
            // 实际上到不了：`插件标准库` 里不含 `DEBUG`/`FFI`，而 `new_with` 只在那两种
            // 情况下报错。真到了，说明 mlua 的接口变了——那时也**不能**让插件在
            // 一个没收紧的 `Lua` 里跑，所以这里给一个死状态、明说原因。
            Err(e) => {
                return Self {
                    manifest,
                    lua: Lua::new(),
                    state: PluginState::Failed(format!("{e}（沙箱建不起来，插件未加载）")),
                    has_unload: false,
                }
            }
        };

        if let Err(e) = Self::install(&lua, &manifest, &ctx) {
            return Self {
                manifest,
                lua,
                state: PluginState::Failed(e.to_string()),
                has_unload: false,
            };
        }

        let entry = manifest.entry_path();
        match Self::run_entry(&lua, &entry) {
            Ok(has_unload) => Self {
                manifest,
                lua,
                state: PluginState::Loaded,
                has_unload,
            },
            Err(e) => Self {
                manifest,
                lua,
                state: PluginState::Failed(e.to_string()),
                has_unload: false,
            },
        }
    }

    /// 一个**根本没打算加载**的插件：清单读得懂，但它与已经在场的某个插件
    /// 抢同一个事件通道（见 `plugin::PluginHost::discover` 的撞名一节）。
    ///
    /// 与 `load` 失败的区别只在"连 Lua 状态都不用建"——对界面来说两者一样，
    /// 都是一行标红的插件加一句原因。所以这里也走 `Failed`，不另造状态。
    ///
    /// ⚠️ 这里那个 `Lua` 是**死状态**：`state` 是 `Failed`，宿主不会往里跑任何插件代码
    /// （`run_entry` 只在 `load` 里调）。所以用 `硬化的_lua()` 失败时的兜底路径也无妨。
    pub fn rejected(manifest: Manifest, reason: String) -> Self {
        Self {
            manifest,
            lua: 硬化的_lua().unwrap_or_else(|_| Lua::new()),
            state: PluginState::Failed(reason),
            has_unload: false,
        }
    }

    fn install(lua: &Lua, manifest: &Manifest, ctx: &HostContext) -> Result<()> {
        let nota = api::build(lua, manifest, ctx)?;
        lua.globals()
            .set("nota", nota)
            .map_err(|e| NotaError::Lua {
                plugin: manifest.meta.id.clone(),
                message: e.to_string(),
            })
    }

    /// 跑入口脚本，返回它是否导出了 `on_unload`。
    fn run_entry(lua: &Lua, entry: &Path) -> Result<bool> {
        if !entry.is_file() {
            return Err(NotaError::other(format!(
                "入口脚本不存在：{}",
                entry.display()
            )));
        }

        let code = std::fs::read_to_string(entry).map_err(|source| NotaError::Read {
            path: entry.to_path_buf(),
            source,
        })?;

        // 入口脚本的 chunk 名用真实路径——Lua 报错信息里会带上它，
        // 没有它的话报错只有行号，不知道是哪个文件。
        let chunk = lua
            .load(&code)
            .set_name(entry.to_string_lossy().as_ref());

        let module: mlua::Value = chunk.eval().map_err(|e| NotaError::Lua {
            plugin: entry.display().to_string(),
            message: e.to_string(),
        })?;

        // 模块导出了 on_load 就叫一下。签名 (nota) —— 把表也当参数递一份，
        // 这样脚本可以 `local M = {}; function M.on_load(nota) end` 不依赖全局。
        let mut has_unload = false;
        if let mlua::Value::Table(t) = module {
            has_unload = matches!(t.get::<mlua::Value>("on_unload"), Ok(mlua::Value::Function(_)));

            // 模块表存进 registry：`unload()` 靠这个名字把 on_unload 找回来。
            // 不用 globals 是因为插件可以合法地把全局 `nota` 覆盖掉。
            lua.set_named_registry_value("nota_module", t.clone())
                .map_err(|e| NotaError::Lua {
                    plugin: entry.display().to_string(),
                    message: e.to_string(),
                })?;

            if let Ok(mlua::Value::Function(f)) = t.get::<mlua::Value>("on_load") {
                let nota: Table = lua.globals().get("nota").map_err(|e| NotaError::Lua {
                    plugin: entry.display().to_string(),
                    message: e.to_string(),
                })?;
                f.call::<()>(nota).map_err(|e| NotaError::Lua {
                    plugin: entry.display().to_string(),
                    message: e.to_string(),
                })?;
            }
        }

        Ok(has_unload)
    }

    /// 卸载前调 `on_unload`（有才调），然后本对象被丢弃、Lua 状态一起没。
    pub fn unload(&self) {
        if !self.has_unload {
            return;
        }
        let Ok(mlua::Value::Table(t)) = self.lua.named_registry_value::<mlua::Value>("nota_module")
        else {
            return;
        };
        if let Ok(mlua::Value::Function(f)) = t.get::<mlua::Value>("on_unload") {
            // 卸载时的报错只记不抛：卸载流程不该被一个插件的残骸卡住。
            if let Err(e) = f.call::<()>(()) {
                eprintln!("[nota] 插件 {} 的 on_unload 出错：{e}", self.manifest.meta.id);
            }
        }
    }

    pub fn is_loaded(&self) -> bool {
        self.state == PluginState::Loaded
    }

    /// 调这个插件注册的一个命令。
    pub fn call_command(&self, name: &str, args: mlua::Value) -> Result<mlua::Value> {
        let commands: Table = self
            .lua
            .named_registry_value("nota_commands")
            .map_err(|e| NotaError::Lua {
                plugin: self.manifest.meta.id.clone(),
                message: format!("取命令表失败：{e}"),
            })?;

        let f: mlua::Function = commands.get(name).map_err(|_| {
            NotaError::other(format!(
                "插件 {} 没有注册命令 `{name}`",
                self.manifest.meta.id
            ))
        })?;

        f.call::<mlua::Value>(args).map_err(|e| NotaError::Lua {
            plugin: self.manifest.meta.id.clone(),
            message: e.to_string(),
        })
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    /// ⚠️ **这条就是 BUG-10 的回归用例。**
    ///
    /// 从前这里是 `Lua::new()`，而它的 "safe" 只等于"不能加载 C 模块"——
    /// `io` / `os` / `package` / `require` 全都在。这条用例把"必须在"和
    /// "必须不在"两半都钉住：**谁把 `硬化的_lua()` 换回 `Lua::new()`，
    /// 下面第二个循环立刻红。**
    #[test]
    fn 沙箱里不该有的全局一个都不能有() {
        let lua = 硬化的_lua().expect("沙箱该建得起来");

        for name in 必须为空的全局 {
            let v: mlua::Value = lua.globals().get(name).unwrap();
            assert!(
                v.is_nil(),
                "`{name}` 不该在插件的 Lua 里存在。它一旦存在，能力围栏就能被绕过去——\
                 一个只申请 `ui.notify` 的插件可以 `os.execute(\"rm -rf ~\")` \
                 或 `io.open(\"/etc/shadow\")`（BUG-10）"
            );
        }
    }

    /// `Lua::new()` 的默认值到底有多宽——**这条是"事实记录"，不是"要求"**。
    ///
    /// 它的作用是：哪天 mlua 改了 `ALL_SAFE` 的定义，这条会红，
    /// 于是有人回来重读本文件顶上那段、重新判一次 "safe" 指的是什么。
    /// 断言的是**当前实测**：`io`/`os`/`package` 都在 `Lua::new()` 里。
    ///
    /// 如果这条真的红了（说明 mlua 收紧了默认值），**别急着删它**：
    /// 先确认收紧到什么程度，再决定 `硬化的_lua()` 还要不要保留那份显式抹除。
    #[test]
    fn mlua_的_default_safe_其实含_io_和_os() {
        let lua = Lua::new();
        for name in ["io", "os", "package", "require"] {
            let v: mlua::Value = lua.globals().get(name).unwrap();
            assert!(
                !v.is_nil(),
                "`Lua::new()` 里 `{name}` 竟然不存在了——mlua 的默认值变了！\
                 本文件顶上「第一道闸曾经是假的」那一段的前提没了，\
                 请重新判一次 `硬化的_lua()` 该怎么写，再改这条断言"
            );
        }
        // `debug` 是唯一真的被排除的那个（bit 31）。
        let dbg: mlua::Value = lua.globals().get("debug").unwrap();
        assert!(dbg.is_nil(), "`debug` 不该在 `Lua::new()` 里");
    }

    /// `插件标准库()` 本身不能含 `io`/`os`/`package`/`debug`。
    ///
    /// 前一条钉的是"结果"，这条钉的是"输入"——**两处都可能出错**：
    /// 白名单开宽了，或者白名单没问题但 base 库把 `loadfile` 捎了进来
    /// （后者由第一条用例的 `loadfile`/`dofile` 两项兜住）。
    #[test]
    fn 白名单里不许有_io_os_package_debug() {
        let libs = 插件标准库();
        for (name, flag) in [
            ("io", mlua::StdLib::IO),
            ("os", mlua::StdLib::OS),
            ("package", mlua::StdLib::PACKAGE),
            ("debug", mlua::StdLib::DEBUG),
        ] {
            assert!(
                !libs.contains(flag),
                "`插件标准库()` 里不该含 `{name}`——它正是要挡的东西（BUG-10）"
            );
        }
        // 反过来：这几个是插件该有的，别哪天顺手删了。
        for (name, flag) in [
            ("coroutine", mlua::StdLib::COROUTINE),
            ("table", mlua::StdLib::TABLE),
            ("string", mlua::StdLib::STRING),
            ("math", mlua::StdLib::MATH),
        ] {
            assert!(libs.contains(flag), "`{name}` 该留着，插件日常要用");
        }
    }

    /// 刀得真快：在硬化过的 `Lua` 里，`os.execute` 连索引都过不去。
    ///
    /// 前三条是"这个不存在"，这条是"所以这事做不成"——**端到端的那一下**。
    /// 光看 `globals().get("os").is_nil()` 是够的，但这条更贴插件作者的真实动作，
    /// 失败时的报错也更好懂。
    #[test]
    fn 插件跑不了_os_execute() {
        let lua = 硬化的_lua().expect("沙箱该建得起来");
        let err = lua
            .load(r#"os.execute("touch /tmp/nota-sandbox-should-never-exist")"#)
            .eval::<mlua::Value>()
            .unwrap_err();
        let msg = err.to_string();
        assert!(
            msg.contains("nil value") || msg.contains("os"),
            "该报「`os` 是 nil」，实际：{msg}"
        );
        assert!(
            !std::path::Path::new("/tmp/nota-sandbox-should-never-exist").exists(),
            "文件竟然建出来了——沙箱没挡住"
        );
    }
}
