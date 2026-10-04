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

/// `lua/mod.rs` 那一组用例（沙箱 / 内置插件编译 / 能力白名单），
/// 2026-09-29 搬去了 `tests.rs`（只搬行数，没搬内容）。
#[cfg(test)]
mod tests;

/// 插件多文件（`require`）那一组用例，2026-09-27 搬去了 `require_tests.rs`。
#[cfg(test)]
mod require_tests;
