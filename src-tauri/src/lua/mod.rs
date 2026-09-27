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
    /// **宿主此刻在说哪种语言**（`crate::lang::有效语言` 算出来的那个）。
    ///
    /// ⚠️ 它是**启动时算一次、之后不再变**的一个值，不是"设置里那一格的镜像"：
    /// 用户在设置里改了语言要重启才生效（`settings/general.rs` 的 `language`
    /// 字段注释里写了为什么），而插件在启动时就按这个值读好了自己的文案表。
    /// 所以别在运行中去改它——那会造出"外壳说中文、插件说英文"的中间态。
    pub 应用语言: String,
}

/// `require` 的模块缓存 / 在途标记（registry 两个名字）。
///
/// ⚠️ 存 registry **不存 globals**：插件可以合法地把全局 `require` 甚至 `nota`
/// 覆盖掉（`run_entry` 里那句注释写着同一件事），而缓存被插件改坏的症状是
/// "同一个模块被求值两次"——那种 bug 只在模块里存了状态时才露头，最难查。
const 注册_模块缓存: &str = "nota_require_cache";
const 注册_在途: &str = "nota_require_loading";

/// 给插件装一个**只在本插件目录里找文件**的 `require`（2026-09-27）。
///
/// 用户原话：「你要更新一下插件系统允许多文件。」在那之前一个插件**只有一个
/// `.lua` 文件**（清单里的 `entry`），于是四个内置插件里有三个长到 997~999 行、
/// 顶着本仓 1000 行的硬线，其中写作统计那个（当时还叫 `heartbeat`）是**一个字都加不进去**了——
/// 它就是 2026-09-27 第一个拆成多文件的（`plugins/stats/ticks.lua`）。
///
/// # 它替换掉了什么
///
/// `硬化的_lua()` 会把真正的 `package` / `loadfile` / `dofile` 全部置 `nil`
/// （理由在那段注释里：`require` 在 safe mode 下唯一的失败原因是
/// `can't load C modules`，而 `loadfile` 是**读任意文件并执行**）。
/// 这里补回来的这个 `require`：
///
/// | 与真 `require` 的差别 | 为什么 |
/// |---|---|
/// | **只认 `.lua`**，不认 `.so` | 本仓的插件**永远不许**到 C 扩展：那是绕过整个沙箱的一条路 |
/// | **只在本插件目录内** | 走 `fs::resolve_in`，与 `nota.fs.*` 同一把尺（绝对路径拒、`..` 算掉、软链逃逸拒） |
/// | **没有 `package.path`** | 搜索路径是死的（就那两种写法），插件改不了 |
/// | 循环 require **报错**而不是栈溢出 | 真 Lua 会在栈上撞死；这里给一句能读的话 |
///
/// # 写法（插件作者看到的那一面）
///
/// ```lua
/// local 曲线 = require("chart")        -- <插件目录>/chart.lua
/// local 色   = require("ui.palette")   -- <插件目录>/ui/palette.lua
/// local 表   = require("子目录")        -- <插件目录>/子目录/init.lua 也行
/// ```
///
/// ⚠️ **模块名必须是 ASCII**（与 Lua 标识符同一条理由，见 `docs/11`）：名字里
/// 出现中文会让 `require` 的报错信息本身变成乱码，而报错正是它的用处。
fn 装require(lua: &Lua, 根: &Path) -> Result<()> {
    lua.set_named_registry_value(注册_模块缓存, lua.create_table().map_err(mlua_err)?)
        .map_err(mlua_err)?;
    lua.set_named_registry_value(注册_在途, lua.create_table().map_err(mlua_err)?)
        .map_err(mlua_err)?;

    let 根 = 根.to_path_buf();
    let f = lua
        .create_function(move |lua, 名: String| {
            let 名 = 名.trim().to_string();
            // ① 名字先过一遍：本仓的插件名与路径都在 ASCII 里，一个非 ASCII 的
            //    模块名只可能是写错了（而且报错信息会跟着花掉）。
            if 名.is_empty()
                || !名.chars().all(|c| c.is_ascii_alphanumeric() || "_.-/".contains(c))
                || 名.starts_with('/')
                || 名.contains("..")
            {
                return Err(mlua::Error::RuntimeError(format!(
                    "require 的模块名 `{名}` 不合法（只许 ASCII 字母数字与 `_ . - /`，不许 `..`）"
                )));
            }

            let 缓存: Table = lua.named_registry_value(注册_模块缓存)?;
            let 在途: Table = lua.named_registry_value(注册_在途)?;
            // ② 已经求过值就直接给（与真 `require` 一样：一个模块只跑一次）。
            let 旧: mlua::Value = 缓存.get(名.as_str())?;
            if !旧.is_nil() {
                return Ok(旧);
            }
            // ③ 正在求值又要一次 ⇒ 循环。真 Lua 在这里会顺着栈撞死，报错只有
            //    `stack overflow`，看不出是谁要谁；这一句能直接读出来。
            if 在途.get::<bool>(名.as_str()).unwrap_or(false) {
                return Err(mlua::Error::RuntimeError(format!(
                    "require 转圈了：`{名}` 在求值过程中又 require 了自己（循环依赖）"
                )));
            }

            let 相对 = 名.replace('.', "/");
            // ④ 两种写法：`<名>.lua` 与 `<名>/init.lua`。与 Lua 的惯例一致，
            //    这样"一个模块一个目录"也能用。
            let mut 末尾错误 = String::new();
            for 候选 in [format!("{相对}.lua"), format!("{相对}/init.lua")] {
                // ⚠️ 逐条过 `resolve_in`：它管的正是"这个相对路径有没有跑出根目录"
                //    （绝对路径、`..` 弹穿栈底、软链指向外面，三样都拒）。
                let path = match crate::lua::api::fs::resolve_in(&根, &候选) {
                    Ok(p) => p,
                    Err(e) => {
                        末尾错误 = e.to_string();
                        continue;
                    }
                };
                if !path.is_file() {
                    continue;
                }
                let code = std::fs::read_to_string(&path).map_err(|source| {
                    mlua::Error::RuntimeError(format!("读不了 `{}`：{source}", path.display()))
                })?;

                在途.set(名.as_str(), true)?;
                // ⚠️ chunk 名用**真实路径**：报错里带上它才知道是哪个文件，
                //    同 `run_entry` 那条注释。
                let 结果 = lua
                    .load(&code)
                    .set_name(path.to_string_lossy().as_ref())
                    .eval::<mlua::Value>();
                // ⑤ 不管成没成都要把在途标记摘掉：失败之后这个模块还是**可以被
                //    再 require 一次**的（热重载、或者调用方 pcall 之后重试）。
                在途.set(名.as_str(), mlua::Value::Nil)?;
                let 值 = 结果?;

                // ⑥ 与真 `require` 一样：模块什么都不返回就当 `true`——
                //    否则第二次 require 拿到 `nil`（`nil` 在这里等于"没缓存"），
                //    同一个文件会被反复求值。
                let 存 = if 值.is_nil() {
                    mlua::Value::Boolean(true)
                } else {
                    值.clone()
                };
                缓存.set(名.as_str(), 存)?;
                return Ok(值);
            }

            Err(mlua::Error::RuntimeError(format!(
                "找不到模块 `{名}`：在拓展目录里试过 `{相对}.lua` 与 `{相对}/init.lua`\
                 （只在本拓展自己的目录里找，不许跳到外面）。{末尾错误}"
            )))
        })
        .map_err(mlua_err)?;

    // ⚠️ 覆盖掉 `nil` 的那个位置。**不是**"补上一个可选的东西"：插件里
    //    `require("x")` 从今天起要么拿到模块、要么拿到一句能读的报错。
    lua.globals().set("require", f).map_err(mlua_err)
}

/// `mlua::Error` → 本仓的 `NotaError`。装 `require` 那几步只可能出这类错。
fn mlua_err(e: mlua::Error) -> NotaError {
    NotaError::other(format!("装拓展模块系统失败：{e}"))
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
    /// 这个插件这次在用的文案表（协商结果 + 表本身）。
    ///
    /// ⚠️ 加载时就定下来，**停用/重新启用会重算一遍**——重算的结果和上次一样
    /// （应用语言没变），但"重启用 = 重跑 on_load"这条口径要求它跟着重来。
    pub 语言: crate::lua::api::i18n::语言包,
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
        // 文案表在**建沙箱之前**就定下来：它只读插件自己目录里的文件，跟脚本
        // 跑不跑得起来无关。⚠️ 但 `state = Failed` 的插件也带着这份表——界面上
        // 那一行的名字要靠它（`PluginInfo.name` 会被表里的保留键 `name` 盖掉）。
        let 语言 = crate::lua::api::i18n::装(&manifest, &ctx.应用语言);
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
                    语言,
                    state: PluginState::Failed(format!("{e}（沙箱建不起来，拓展未加载）")),
                    has_unload: false,
                }
            }
        };

        if let Err(e) = Self::install(&lua, &manifest, &ctx, &语言) {
            return Self {
                manifest,
                lua,
                语言,
                state: PluginState::Failed(e.to_string()),
                has_unload: false,
            };
        }

        let entry = manifest.entry_path();
        match Self::run_entry(&lua, &entry) {
            Ok(has_unload) => Self {
                manifest,
                lua,
                语言,
                state: PluginState::Loaded,
                has_unload,
            },
            Err(e) => Self {
                manifest,
                lua,
                语言,
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
    pub fn rejected(manifest: Manifest, reason: String, 应用语言: &str) -> Self {
        let 语言 = crate::lua::api::i18n::装(&manifest, 应用语言);
        Self {
            manifest,
            lua: 硬化的_lua().unwrap_or_else(|_| Lua::new()),
            语言,
            state: PluginState::Failed(reason),
            has_unload: false,
        }
    }

    /// 一个**被用户停用**的插件：清单读得懂，但**一行插件代码都不跑**。
    ///
    /// ⚠️ 与 [`Self::rejected`] 的差别在状态：那条是红的（出错了），这条是灰的
    /// （用户自己关的）——界面上一个标红一个标灰，混了就成了"关掉它像出了故障"。
    ///
    /// ⚠️ 这与"留着 Lua 状态、只是不派发命令"那条老做法**正相反**（2026-09-25 改）：
    /// 停用就该和"没装"一样干净——不留计时器、不留后台线程、不留已注册的命令、
    /// 不留一块等着被 `nota.ui.refresh` 点着跑的脚本。理由见
    /// [`crate::plugin::PluginHost::set_enabled`]：用户要的是"关了它就当它不存在"。
    pub fn disabled(manifest: Manifest, 应用语言: &str) -> Self {
        let 语言 = crate::lua::api::i18n::装(&manifest, 应用语言);
        Self {
            manifest,
            lua: 硬化的_lua().unwrap_or_else(|_| Lua::new()),
            语言,
            state: PluginState::Disabled,
            has_unload: false,
        }
    }

    fn install(
        lua: &Lua,
        manifest: &Manifest,
        ctx: &HostContext,
        语言: &crate::lua::api::i18n::语言包,
    ) -> Result<()> {
        let nota = api::build(lua, manifest, ctx, 语言)?;
        lua.globals()
            .set("nota", nota)
            .map_err(|e| NotaError::Lua {
                plugin: manifest.meta.id.clone(),
                message: e.to_string(),
            })?;
        装require(lua, &manifest.dir)
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
            // ⚠️ 它的去处于是只剩调试闸门——卸载出错的插件在界面上就是"没反应"，
            // 用户不会知道该做什么。想看就 `NOTA_DEBUG=1`（见 `crate::log`）。
            if let Err(e) = f.call::<()>(()) {
                crate::日志!("[nota] 拓展 {} 的 on_unload 出错：{e}", self.manifest.meta.id);
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
                "拓展 {} 没有注册命令 `{name}`",
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
                "`{name}` 不该在拓展的 Lua 里存在。它一旦存在，能力围栏就能被绕过去——\
                 一个只申请 `ui.notify` 的拓展可以 `os.execute(\"rm -rf ~\")` \
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
    fn mlua_的_default_safe_含_io_和_os() {
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

    /// ⚠️ **内置插件至少得能被 Lua 编译过去。**
    ///
    /// 为什么值得单独钉一条：`plugins/` 里的 Lua **只有应用启动那一刻才会被
    /// 编译**，单元测试从来没碰过它们。所以那里写错一个字母，代价是"用户一开
    /// 应用发现插件没了"，而我在提交前看不到任何红。
    ///
    /// ⚠️ **变量名不能写中文**：Lua 的标识符只认 `[A-Za-z_][A-Za-z0-9_]*`
    ///（`lislalpha` 用的是 C 的 `isalpha`，而 `local 键 = 1` 里的 UTF-8 字节在
    /// 任何 locale 下都不算字母），所以那是**语法错误**，整份插件加载失败。
    /// 注释和字符串里的中文不受影响——只有**名字**不行。
    ///
    /// 这条用例就是替 Lua 把这句话说清楚：它自己报的是
    /// `'<name>' expected near '<\233>'`，看到那句很难想到"是我用了中文变量名"。
    #[test]
    fn 内置插件都能被_lua_编译() {
        let lua = 硬化的_lua().expect("沙箱该建得起来");
        let mut 编译过几个 = 0;

        for dir in crate::paths::builtin_plugins_dirs(None) {
            let Ok(条目们) = std::fs::read_dir(&dir) else {
                continue;
            };
            for 条目 in 条目们.flatten() {
                let 清单路径 = 条目.path().join("plugin.toml");
                if !清单路径.is_file() {
                    continue;
                }

                let m = crate::plugin::manifest::Manifest::load(&清单路径)
                    .unwrap_or_else(|e| panic!("`{}` 读不出来：{e}", 清单路径.display()));
                let 入口 = m.dir.join(&m.meta.entry);
                let code = std::fs::read_to_string(&入口)
                    .unwrap_or_else(|e| panic!("`{}` 读不出来：{e}", 入口.display()));

                // `into_function()` = **只编译不执行**。这里要的正是这一层：
                // 语法错在这里现形，而 `on_load` 那类要宿主环境的东西不掺进来。
                lua.load(&code)
                    .set_name(入口.to_string_lossy().as_ref())
                    .into_function()
                    .unwrap_or_else(|e| panic!("`{}` 编译不过：{e}", 入口.display()));

                编译过几个 += 1;
            }
        }

        assert!(
            编译过几个 >= 2,
            "一个内置拓展都没扫到（扫到 {编译过几个} 个）——`plugins/` 是挪走了，\
             还是 `builtin_plugins_dirs` 改了？测试要跟着改，别把这条删了"
        );
    }

    /// 某份内置插件的入口源码。找不到给 `None`（各机器上 `plugins/` 的份数不一样）。
    fn 内置插件源码(id: &str) -> Option<String> {
        for dir in crate::paths::builtin_plugins_dirs(None) {
            let 入口 = dir.join(id).join("main.lua");
            if let Ok(s) = std::fs::read_to_string(&入口) {
                return Some(s);
            }
        }
        None
    }

    /// `plugins/slidev/main.lua` 里那段**纯字符串活**：从文档正文里读出 frontmatter
    /// 的 `theme:`，再翻成"要去问哪个包"。
    ///
    /// ⚠️ 为什么只有这一份插件值得这么一个测试：这两件事是**纯函数**（不碰宿主、
    /// 不碰网络），而判错的代价两头都脏——
    ///   · **多问**一个不存在的包 ⇒ 面板说「主题没装」，把一次本来能跑的预览挡在门外；
    ///   · **少问**一个真缺的包 ⇒ 回到用户 2026-09-26 撞的那件事：面板说能跑、
    ///     进程两秒后退出来（`The theme "@slidev/theme-default" was not found`）。
    ///
    /// ⚠️ **挂钩是"把源码末尾那句 `return M` 换掉"**。看着糙，但比别的路都干净：
    /// 那两个函数是 `local function`，而插件没有 `require`（沙箱里没有 `package`），
    /// 也不该为了测试把它们挂到 `M` 上——`M` 是插件的**对外面**，多一个键就要多
    /// 一条 ABI 说明。换掉 `return` 之后整段照样要能**跑通**：那份文件的模块级语句
    /// 不许碰 `nota`（文件头「`local T` 在 `on_load` 里重新绑一次」就是为此），
    /// 所以直接 `eval` 是安全的。
    #[test]
    fn slidev_认得文档要的是哪个主题包() {
        let lua = 硬化的_lua().expect("沙箱该建得起来");
        let 源 = 内置插件源码("slidev").expect("内置拓展里该有一份 slidev/main.lua");

        let 尾 = "return M";
        let 剪掉 = 源.trim_end();
        assert!(
            剪掉.ends_with(尾),
            "`slidev/main.lua` 的结尾不再是 `{尾}` 了——这条测试的挂钩要跟着改"
        );
        let 代码 = format!(
            "{}\nreturn {{ theme_from_text = theme_from_text, theme_package = theme_package, \
             describe_probe = describe_probe }}\n",
            &剪掉[..剪掉.len() - 尾.len()]
        );
        let 表: mlua::Table = lua
            .load(&代码)
            .set_name("slidev/main.lua（测试挂钩）")
            .eval()
            .expect("整段该跑得起来：模块级语句不许碰 `nota`");
        let 读: mlua::Function = 表.get("theme_from_text").expect("读函数");
        let 翻: mlua::Function = 表.get("theme_package").expect("翻函数");

        // 一、正文里那行 `theme:` 读不读得出来。
        // ⚠️ 每一条都是**实测过的写法或真的踩过的坑**，不是凑数：
        let 用例: [(&str, &str, Option<&str>); 10] = [
            // 最常见的写法。
            ("---\ntheme: seriph\n---\n# 一页\n", "普通", Some("seriph")),
            // Windows 上存过的文件（CRLF）。
            ("---\r\ntheme: seriph\r\n---\r\n", "CRLF", Some("seriph")),
            // YAML 允许引号。
            ("---\ntheme: \"seriph\"\n---\n", "带引号", Some("seriph")),
            // 行尾注释是 YAML 的正常写法，不能把它当名字的一部分。
            ("---\ntheme: seriph # 备选：default\n---\n", "行尾注释", Some("seriph")),
            // 有些编辑器存盘带 BOM，带上之后第一行就不是 `---` 了。
            ("\u{feff}---\ntheme: seriph\n---\n", "带 BOM", Some("seriph")),
            // 正文里的 `---` 是**分隔线**，不是 frontmatter：不能拿它当结论。
            ("# 一页\n\n---\n\ntheme: seriph\n", "分隔线不在开头", None),
            // 没有收尾的 `---`：宁可少问一句，也不猜。
            ("---\ntheme: seriph\n", "没有收尾", None),
            // 有这个段，但里面没写主题 ⇒ 就是"没写"（要默认主题）。
            ("---\ntitle: 一页\n---\n", "没写 theme", None),
            // `theme:` 后面空着是 YAML 的嵌套地图，不是名字。
            ("---\ntheme:\n---\n", "值是空的", None),
            ("", "空文档", None),
        ];
        for (正文, 名字, 期望) in 用例 {
            let 得到 = 读.call::<Option<String>>(正文.to_owned()).unwrap();
            assert_eq!(
                得到.as_deref(),
                期望,
                "「{名字}」那份正文读出来的主题不对：{得到:?}（正文：{正文:?}）"
            );
        }

        // 二、主题名 → 要去问的那个**包名**。`nil` = 不用问。
        // 规则照 `@slidev/cli` 的 `resolver`（2026-09-26 从本机那份读出来的）。
        let 翻用例: [(&str, Option<&str>); 5] = [
            // 官方主题：`<名>` → `@slidev/theme-<名>`。
            ("seriph", Some("@slidev/theme-seriph")),
            // ⚠️ `none` 是 Slidev 自己的特例（`name === "none"` 就直接返回"不要主题"）：
            // 这条要是不认，一份写着 `theme: none` 的文档会被问一个根本不存在的包。
            ("none", None),
            // 带 `/` 的是**路径**（`./我的主题`、`/abs`、`@org/x`），不是包名。
            ("./我的主题", None),
            ("@org/我的主题", None),
            ("/tmp/主题", None),
        ];
        for (名字, 期望) in 翻用例 {
            let 得到 = 翻.call::<Option<String>>(名字.to_owned()).unwrap();
            assert_eq!(得到.as_deref(), 期望, "`theme: {名字}` 该问的包不对");
        }
        // 没写 `theme:` ⇒ Slidev 要的是默认主题包。
        // ⚠️ 参数是 `nil`（不是空串）：`theme_from_text` 给的正是 `nil`。
        let 默认 = 翻.call::<Option<String>>(mlua::Value::Nil).unwrap();
        assert_eq!(默认.as_deref(), Some("@slidev/theme-default"), "没写主题时该问默认包");

        // 三、给宿主那条 `need` 的口径：**相对路径**，前面拼上 `node_modules/`
        //     （宿主那边 `合法的相对路径` 会把绝对路径和 `..` 一律挡掉 —— 见
        //     `devserver/probe.rs`，所以这里拼错一个字符就永远问不出结果）。
        assert!(
            源.contains(r#"{ need = "node_modules/" .. pkg, pkg = pkg, theme_name = theme_name }"#),
            "`required_theme` 拼 `need` 的那一行变了——宿主收的是相对路径，改法要看 \
             `devserver/probe.rs`；`theme_name` 是下面第 四 段那两支的判据，一起带出去"
        );

        // 四、`describe_probe` 的 `notheme` 那两支：**文档到底写没写 `theme:`**
        //     决定说的是哪句话。
        //
        // ⚠️ 为什么这条值得测：那两句话的**出路不一样**。写了的人手上已经有那一行，
        // 改一个词就行；没写的人**连那行都没有**——2026-09-26 用户那份文档就是
        // 后一种（装了 `theme-seriph` 却一个字没写主题），而当时面板给的话是
        // 「把文档开头那行 `theme:` 改成一个装过的」：**照着做不出来**，因为他
        // 的文档里根本没有那一行。判据是 `want.theme_name`，两边都得钉住。
        let 说: mlua::Function = 表.get("describe_probe").expect("翻译函数");

        // 造一份"宿主给的探测报告"。`need` 是**三档**（没问 `nil` / 有 / 没有）。
        let 探报 = |state: &str, root: Option<&str>, marker: bool, need: Option<bool>| {
            let t = lua.create_table()?;
            t.set("state", state)?;
            t.set("version", "53.0.0")?;
            t.set("command", "npx @slidev/cli")?;
            t.set("detail", "")?;
            t.set("marker_found", marker)?;
            if let Some(r) = root {
                t.set("root", r)?;
            }
            if let Some(n) = need {
                t.set("need_found", n)?;
            }
            Ok::<mlua::Table, mlua::Error>(t)
        };
        // 造一份"这份文档要什么"（`required_theme` 那张表）。
        let 要的 = |theme_name: Option<&str>, pkg: &str| {
            let t = lua.create_table()?;
            t.set("need", format!("node_modules/{pkg}"))?;
            t.set("pkg", pkg)?;
            if let Some(n) = theme_name {
                t.set("theme_name", n)?;
            }
            Ok::<mlua::Table, mlua::Error>(t)
        };
        let 翻 = |p: mlua::Table, w: mlua::Table| -> mlua::Table {
            说.call((p, w)).expect("`describe_probe` 不该抛错")
        };

        // ① 文档**没写**主题（`theme_name` 缺位）⇒ 说的是"没写主题"那句，
        //    而且出路得是**照着做得到**的：加三行 frontmatter、或者装那个包。
        //
        // ⚠️ 断言只能钉**模板里字面有的**东西：`T` 在这个挂钩里是模块级那个恒等函数
        // （`local T = function(s) return s end`），**不格式化**——真正填 `%s` 的是
        // `on_load` 里重新绑过的那一份（它要 `nota`，这里没有）。所以"点名了哪个包"
        // 那件事在这里验不了，只验**两支说的话不一样、而且各自是照着做得出来的**。
        let d = 翻(
            探报("ready", Some("/tmp/甲"), true, Some(false)).unwrap(),
            要的(None, "@slidev/theme-default").unwrap(),
        );
        assert_eq!(d.get::<String>("state").unwrap(), "notheme", "缺那个包该报 notheme");
        let 没写的话: String = d.get("message").unwrap();
        let 没写的细: String = d.get("detail").unwrap();
        assert!(没写的话.contains("没写主题"), "没写 `theme:` 的文档该说「没写主题」：{没写的话}");
        assert!(没写的细.contains("theme: none"), "该给「加三行 frontmatter」这条照着做得到的路：{没写的细}");
        assert!(没写的细.contains("npm i"), "装包那条路也得在：{没写的细}");

        // ② 文档**写了**（`theme: seriph`，那个包没装）⇒ 老那句：改一个词就行。
        let d = 翻(
            探报("ready", Some("/tmp/甲"), true, Some(false)).unwrap(),
            要的(Some("seriph"), "@slidev/theme-seriph").unwrap(),
        );
        assert_eq!(d.get::<String>("state").unwrap(), "notheme");
        let 写了的话: String = d.get("message").unwrap();
        let 写了_细: String = d.get("detail").unwrap();
        assert!(!写了的话.contains("没写主题"), "写了 `theme:` 的文档不许说「没写主题」：{写了的话}");
        // 这一支才该讲"Slidev 按 `@slidev/theme-<名>`、`slidev-theme-<名>` 的顺序找"。
        assert!(写了_细.contains("slidev-theme-"), "写了主题的那支该讲解析顺序：{写了_细}");
        assert!(!没写的细.contains("slidev-theme-"), "没写主题的那支讲解析顺序是废话：{没写的细}");

        // ③ 那个包**装着了** ⇒ 不许报 `notheme`：多问一句会把一次本来能跑的预览
        //    挡在门外（这一支是这条测试存在的另一半理由）。
        let d = 翻(
            探报("ready", Some("/tmp/甲"), true, Some(true)).unwrap(),
            要的(None, "@slidev/theme-default").unwrap(),
        );
        assert_eq!(d.get::<String>("state").unwrap(), "ready");

        // ④ **没问过**（`need_found` 缺位）⇒ 也不许报：那是"不知道"，不是"没有"。
        //    （宿主那边"没问"给的是 `nil`，不是 `false` —— `devserver/probe.rs`。）
        let d = 翻(
            探报("ready", Some("/tmp/甲"), true, None).unwrap(),
            要的(None, "@slidev/theme-default").unwrap(),
        );
        assert_eq!(d.get::<String>("state").unwrap(), "ready");
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
                "`拓展标准库()` 里不该含 `{name}`——它正是要挡的东西（BUG-10）"
            );
        }
        // 反过来：这几个是插件该有的，别哪天顺手删了。
        for (name, flag) in [
            ("coroutine", mlua::StdLib::COROUTINE),
            ("table", mlua::StdLib::TABLE),
            ("string", mlua::StdLib::STRING),
            ("math", mlua::StdLib::MATH),
        ] {
            assert!(libs.contains(flag), "`{name}` 该留着，拓展日常要用");
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

/// 插件多文件（`require`）那一组用例，2026-09-27 搬去了 `require_tests.rs`。
#[cfg(test)]
mod require_tests;
