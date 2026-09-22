# 02 · 逐文件接口参考

> 最后同步：2026-09-22

**公开函数的签名以本文为准，本文与代码不一致时以代码为准并立即改本文。**
本文只讲"这个函数做什么、参数什么意思、失败会怎样"，不讲为什么这样设计——
那是 `docs/01-architecture.md` 和 `docs/03-data-structures.md` 的事。

⚠️ 标记的三类东西：已知缺陷、刻意留着的空壳、容易踩的坑。

---

## 目录

**Rust 后端 `src-tauri/src/`**

| 文件 | 一句话 |
|---|---|
| `main.rs` | 进程入口，`nota_lib::run()` 的一层壳 |
| `lib.rs` | 建 Tauri、`setup()` 里按顺序启动、21 个命令的注册表、窗口销毁时卸载插件 |
| `error.rs` | `NotaError`，中文 Display，自定义 `Serialize` 过 IPC |
| `paths.rs` | XDG 目录与插件目录的**唯一**算法所在地 |
| `state.rs` | `AppState` 四个句柄 + 锁序不变量 |
| `settings.rs` | `Settings` 与三条互相独立的外观轴，kebab-case 落盘 |
| `document/mod.rs` | `DocId` / `Document` / `DocumentStore` / `derive_title()` |
| `commands/mod.rs` | 只是四个子模块的声明 + 命令层的分工说明（无函数） |
| `commands/document.rs` | `nota_doc_*` 十个命令 |
| `commands/workspace.rs` | `nota_workspace_*` 四个命令 + `TreeNode` + 文件树遍历 |
| `commands/settings.rs` | `nota_settings_get/set` |
| `commands/plugin.rs` | `nota_plugins_list` / `set_enabled` / `call` / `find_command` / `panels` / `menus` |
| `plugin/mod.rs` | `PluginHost`：发现 → 加载 → 派发 → 卸载；`PluginInfo` / `PluginPanel` / `PluginMenuItem` 快照 |
| `plugin/manifest.rs` | `Capability` / `PluginMeta` / `Manifest` / `channel_id()` |
| `lua/mod.rs` | `HostContext` / `LuaPlugin` / `PluginState`；一插件一个 `Lua` |
| `lua/api/mod.rs` | `nota` 表的构造：按能力装表 |
| `lua/api/document.rs` | `nota.document` |
| `lua/api/fs.rs` | `nota.fs` + 纯函数 `resolve_in()`（工作区围栏） |
| `lua/api/git.rs` | `nota.git`，子进程跑 `git` |
| `lua/api/ui.rs` | `nota.ui`：通知**推**事件，面板/菜单**存** registry 供宿主拉 |

**前端 `src/`**

| 文件 | 一句话 |
|---|---|
| `main.tsx` | React 入口 |
| `App.tsx` | 外壳与全部状态 |
| `bridge/ipc.ts` | 调用后端的唯一出口 + 事件名表（**只放"发生类"**）+ 类型定义 |
| `editor/create.ts` | Milkdown 封装，对外只有 `EditorHandle` |
| `editor/instant-render.ts` | 「光标所在块的 Markdown 标记淡化显示」那个 ProseMirror 插件 |
| `styles/applyTheme.ts` | 把三条外观轴写到 `<html>` |
| `ui/EditorPane.tsx` | 编辑器挂载点与去抖同步 |
| `ui/Sidebar.tsx` | 左侧栏两页（文件树 / 大纲） |
| `ui/PluginDock.tsx` | 右侧插件栏：插件声明的面板 + 已装插件清单 |
| `ui/Home.tsx` | 没有文档时那一屏 |
| `ui/StatusBar.tsx` | 未保存状态 + 字数四项 |
| `ui/Toasts.tsx` | 提示条 |
| `ui/ErrorBoundary.tsx` | 渲染错误兜底 + 全局错误钩子 |
| `ui/outline.ts` | 大纲与字数的纯函数 |

`src-tauri/build.rs` 只有 `fn main() { tauri_build::build() }`，是 Tauri 的标准构建脚本
（生成 `gen/schemas/*` 那些权限 schema），没有本项目自己的逻辑，下文不再单列。

**测试现状**

| 有 `#[cfg(test)]` 的文件 | 测试数 |
|---|---|
| `document/mod.rs` | 9 |
| `lua/api/git.rs` | 6 |
| `lua/api/ui.rs` | 6 |
| `plugin/manifest.rs` | 5 |
| `lua/api/fs.rs` | 5 |
| `lua/api/mod.rs` | 4 |
| `lua/mod.rs` | 4 |
| `settings.rs` | 3 |
| `commands/workspace.rs` | 3 |

合计 **45 个 Rust 单元测试**。其余 Rust 文件没有测试；前端**没有任何测试**
（`package.json` 里没有测试运行器，跑的是 `tsc --noEmit` + `vite build`）。
`tests/` 目录下只有一个空的 `fixtures/`，还没有 Rust 集成测试。

⚠️ **总数只在 `docs/06` 记数**（那里写着一份"这 N 条到底钉住了什么"的说明）。
本表列**逐文件**明细，是为了回答"改这个文件时哪几条会红"。
⚠️ **本表曾经漏掉两个文件、总数停在 32**（漏了 `lua/api/mod.rs` 与 `lua/mod.rs`，
而 `docs/06` 已经写到 40）——**两张表都是手抄的，这就是它们会分叉的原因**。
2026-09-22 按 `grep -c '#\[test\]'` 实测重排了一遍；**下次改完测试记得两边都跑一次数**。

---

# 后端

## `src-tauri/src/main.rs`（12 行）

可执行入口。**刻意什么都不做**，只把控制权交给 `nota_lib::run()`——Tauri 2 的标准形状。
逻辑全在 lib 里，好处是将来要加第二个二进制（比如 `nota --convert` 这类命令行转换器）时
直接 `use nota_lib` 即可，不用把代码搬来搬去。

```rust
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() {
    nota_lib::run()
}
```

`cfg_attr` 那一行是 Windows release 构建下不弹多余控制台窗口用的。

无公开函数、无测试。

---

## `src-tauri/src/lib.rs`（130 行）

建 Tauri 应用、按顺序启动、注册全部命令、挂窗口事件。模块头把**启动顺序为什么是这个顺序**
写在最上面（`docs/01-architecture.md` 把它展开讲了一遍）。

### 模块声明

```rust
pub mod commands;
pub mod document;
pub mod error;
pub mod lua;
pub mod paths;
pub mod plugin;
pub mod settings;
pub mod state;
```

### `pub fn run()`

无参数、无返回（`-> ()`）。里面 `tauri::Builder::default()` 链式装配：

1. `.plugin(tauri_plugin_dialog::init())`、`tauri_plugin_fs::init()`、`tauri_plugin_opener::init()`
2. `.setup(|app| { … })`：
   - `Settings::load()` → 失败则 `eprintln!("[nota] 读设置失败，本次用默认值：{e}")` + `Settings::default()`
   - 建 `documents` / `settings_arc` / `workspace` 三个 `Arc<Mutex<_>>`
   - `let resource_dir = app.path().resource_dir().ok();`
   - 建 `base: HostContext`，其中 `plugin_id: String::new()` 是**占位**，
     `discover()` 里每个插件会换成自己的 id（`HostContext { plugin_id, ..base.clone() }`）
   - `let plugins = PluginHost::discover(resource_dir, &base);` 然后
     `eprintln!("[nota] 载入 {} 个插件", plugins.count());`
   - `app.manage(AppState { documents, settings, workspace, plugins: Mutex::new(plugins) })`
   - `Ok(())`
3. `.invoke_handler(tauri::generate_handler![ …21 项… ])`，前 20 项是 `commands::*` 里的命令，
   最后一项是本文件里的 `nota_frontend_ready`
4. `.on_window_event(|window, event| …)`：`WindowEvent::Destroyed` 时
   `window.try_state::<AppState>()` → `state.plugins.lock()` → `host.unload_all()`。
   给插件一次 `on_unload`，让它们有机会落盘自己的状态
5. `.run(tauri::generate_context!()).expect("Nota 启动失败")`

失败行为逐项见 `docs/01-architecture.md` 的"每一步失败会怎样"表。要点是：
**只有第 5 步会让进程直接死掉**，其余每一步都是"记一笔然后继续"。

⚠️ 第 2 步里 `AppState` 是**手写字面量**，没走 `state.rs::AppState::new()`。
两者字段一致，但改字段时别只看其中一个。

### `#[tauri::command] fn nota_frontend_ready(app: tauri::AppHandle) -> Result<(), String>`

```rust
#[tauri::command]
fn nota_frontend_ready(app: tauri::AppHandle) -> Result<(), String> {
    let _ = app;
    Ok(())
}
```

⚠️ **有意的无操作**——它**永远返回 `Ok(())`，什么都不做**。它现在的用途缩小成
**"WebView 从这一刻起能收事件了"**：启动早期推的事件必然丢，将来要补
"先攒着、这一枪之后补发"就落在这里。
⚠️ **不要再把它当"重放插件 UI 注册"的钩子**——那个设计**是错的，不是没做完**
（BUG-13）：面板/菜单已改走 registry **拉**，赛跑不存在，也就不需要重放。
完整理由见 `docs/01-architecture.md` 的同名一节与 `docs/07` 第 16 项（**已作废**）。

注意它是**私有**函数（没有 `pub`），只有 `generate_handler!` 能看见它——
不需要从别的模块调。

### 测试

无。

---

## `src-tauri/src/error.rs`（69 行）

统一的错误类型。约定（与 Folio 的 GError 口径一致）：**每一个跨 IPC 边界返回的错误都要能读懂**。
前端拿到的不是 `Err(Os { code: 2 })`，而是"打开 /path/x.md 失败：文件不存在"。
所以 `NotaError` 的 Display 一律写成人话，命令层直接把它转成 String 返回。

### `pub type Result<T> = std::result::Result<T, NotaError>;`

全仓的 `Result` 指的是这个。⚠️ 在 `lua/api/*.rs` 里会同时出现
`NotaResult`（`crate::error::Result` 的别名导入）与 `mlua::Result`，读的时候看清是哪个。

### `pub enum NotaError`

| 变体 | Display 模板 | 什么时候出 |
|---|---|---|
| `Read { path, source }` | `读文件失败 {path}：{source}` | 读文件/目录失败 |
| `Write { path, source }` | `写文件失败 {path}：{source}` | 写文件、建目录、删文件失败 |
| `NonUtf8Path(PathBuf)` | `路径不是合法的 UTF-8：{0}` | `paths::path_to_string` 转换失败 |
| `NoHomeDir` | `找不到用户目录（$HOME / $XDG_CONFIG_HOME 都没探到）` | `dirs::*_dir()` 返回 `None` |
| `Config(String)` | `配置读写失败：{0}` | 设置解析/序列化失败 |
| `Manifest { file, reason }` | `插件清单有误（{file}）：{reason}` | 清单字段校验不过 |
| `PluginApiMismatch { id, wanted, have }` | `插件 {id} 需要 API 版本 {wanted}，宿主是 {have}` | `api` 号不精确相等 |
| `Lua { plugin, message }` | `Lua 出错（插件 {plugin}）：{message}` | Lua 侧报错 |
| `NoActiveDocument` | `没有活动文档` | 需要活动文档但没有 |
| `Other(String)` | `{0}` | 兜底，直接当消息用 |

### `impl NotaError`

```rust
pub fn other(msg: impl Into<String>) -> Self
```

把任意错误压成一句能直接给用户看的话。**这是最常用的构造入口**。

### `impl serde::Serialize for NotaError`

```rust
fn serialize<S: serde::Serializer>(&self, s: S) -> std::result::Result<S::Ok, S::Error>
```

序列化成**一句字符串**（`s.serialize_str(&self.to_string())`）。Tauri 的命令返回值要求错误类型
可序列化，转成 String 是最省事也最可读的做法：前端只需要 `catch (e) => toast(String(e))`，
不用认识我们的错误结构。

⚠️ 注意这意味着**前端拿不到错误的种类**，只有一个字符串。要按错误种类分支（比如"文件已被
外部删除"另走一条路）就得改成结构化序列化——那一天到来之前别在前端做字符串匹配。

### 测试

无。

---

## `src-tauri/src/paths.rs`（79 行）

目录布局。**所有路径只在这里算**，别处一律调这里取——散落的 `dirs::config_dir()`
是将来"换存法"时最先烂掉的地方。

### `pub const APP_DIR: &str = "nota";`

XDG 目录下的子目录名。

### 目录函数

| 签名 | 返回 | 失败 |
|---|---|---|
| `pub fn config_dir() -> Result<PathBuf>` | `$XDG_CONFIG_HOME/nota`（一般 `~/.config/nota`） | `dirs::config_dir()` 为 `None` → `NoHomeDir` |
| `pub fn data_dir() -> Result<PathBuf>` | `$XDG_DATA_HOME/nota`（一般 `~/.local/share/nota`） | 同上 |
| `pub fn settings_file() -> Result<PathBuf>` | `config_dir()?.join("settings.toml")` | 透传 `config_dir` 的错 |
| `pub fn user_plugins_dir() -> Result<PathBuf>` | `data_dir()?.join("plugins")`，用户自装插件目录，也是插件状态的落点 | 透传 `data_dir` 的错 |

⚠️ `pub fn cache_dir() -> Result<PathBuf>`（`$XDG_CACHE_HOME/nota`）**定义了但没有调用者**——
今天没有任何东西往缓存目录写。留着是因为它是这套布局里少不得的一格，不是漏接的线。

### `pub fn builtin_plugins_dirs(resource_dir: Option<&Path>) -> Vec<PathBuf>`

内置插件目录，可能**两个都返回**：

1. `resource_dir.map(|res| res.join("plugins"))` —— 打包后的落点（`resource_dir` 为 `None` 时跳过）
2. `cfg!(debug_assertions)` 为真时，额外返回 `CARGO_MANIFEST_DIR`（= `src-tauri/`）的
   **上一级** + `plugins/`，也就是仓库根的 `plugins/`。开发时改完 Lua 存盘即生效，不用重编

两个都存在时 `PluginHost::discover` 两个都扫，**用户自装的同名插件覆盖内置的**。

### `pub fn path_to_string(path: &Path) -> Result<String>`

把路径转成 `String`，**非 UTF-8 时报错而不是丢字符**（`NonUtf8Path`）。
Unix 路径允许任意字节，但文档模型、Lua、JSON 全都按 UTF-8 走。

### `pub fn ensure_dir(path: &Path) -> Result<()>`

`std::fs::create_dir_all`，失败包成 `NotaError::Write`。
调用点有三处：`DocumentStore::save`、`Settings::save_to`、`nota.fs.write`。

### 测试

无。

---

## `src-tauri/src/state.rs`（47 行）

应用全局状态。文件头就是**锁序不变量**的正文（`plugins → documents → settings`），
理由与今天实际会交叉的路径见 `docs/01-architecture.md` 的"共享状态与锁顺序"。

### `pub struct AppState`

| 字段 | 类型 | 说明 |
|---|---|---|
| `documents` | `Arc<Mutex<DocumentStore>>` | 与 `HostContext.documents` 是**同一个 `Arc`** |
| `settings` | `Arc<Mutex<Settings>>` | 同上 |
| `workspace` | `Arc<Mutex<Option<PathBuf>>>` | `None` = 没开文件夹（Typora 的"单文件模式"）。**不参与锁序** |
| `plugins` | `Mutex<PluginHost>` | 锁在**最外层**（最先取） |

为什么 `documents`/`settings`/`workspace` 是 `Arc<Mutex<_>>` 而 `plugins` 只是 `Mutex<_>`：
插件的 Lua 闭包需要**长期持有**它们（生命周期比任何一次命令调用都长），所以得是 `Arc`；
`plugins` 只在宿主自己的调用栈里用，不需要共享所有权。

### `pub fn new(settings: Settings, plugins: PluginHost) -> Self`

构造一个 `AppState`：内部自己 `Arc::new(Mutex::new(DocumentStore::new()))`、
`Arc::new(Mutex::new(settings))`、`Arc::new(Mutex::new(None))`、`Mutex::new(plugins)`。

⚠️ **今天没有任何调用者。** `lib.rs` 是手写 `AppState { … }` 字面量建的。
两者字段一致，所以不构成 bug，但改 `AppState` 字段时**必须两处都改**——
只改这里会编译不过（好事），只改 `lib.rs` 则会留下一个悄悄过期的构造函数。

### 测试

无。

---

## `src-tauri/src/settings.rs`（167 行）

用户设置。文件头讲的是三条**互相独立**的外观轴（用户 2026-09-22 明确要求，别混成一条）：

1. `ui_style` —— **界面风格**，一整套设计语言（macOS / Yaru / Adwaita / Windows），
   换的不只是颜色，还包括控件形状、圆角、间距、动效、字体栈。⚠️ 它**不是**"主题"的同义词。
2. `ui_mode` —— 明暗。`auto` 时跟随系统（Linux 走 XDG desktop portal 的 `color-scheme`）。
   这条轴在**任何**风格下都成立。
3. `document_theme` —— **文档主题**，只管正文那一块（Typora 的 Themes 菜单）。
   纯 CSS，用户可以在主题目录里放 `.user.css` 覆盖，不动应用外壳一分。

落地形态见 `docs/04-ui-map.md` §外观；实现（切换界面）排在后面轮次。

### `pub enum UiStyle`

```rust
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "kebab-case")]
pub enum UiStyle {
    Auto,      // 跟随当前桌面环境，探不到就用 Adwaita
    Adwaita,
    Macos,
    Yaru,
    Windows,
}
```

`impl Default for UiStyle` → `UiStyle::Auto`。

⚠️ 加新风格时**同时**要改三处：本枚举、前端 `styles/` 下的风格表、`docs/04` 的外观一节。
另注意文件头注释里提到的路径是 `frontend/src/styles/styles/`，与仓库实际的
`src/styles/` 不一致——以仓库实际路径为准。

### `pub enum UiMode`

```rust
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "kebab-case")]
pub enum UiMode { Auto, Light, Dark }
```

`impl Default for UiMode` → `UiMode::Auto`。

### `pub struct Settings`

```rust
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(default)]
pub struct Settings {
    pub ui_style: UiStyle,
    pub ui_mode: UiMode,
    pub document_theme: String,
    pub ui_font_size: u32,
    pub content_width: u32,
    pub confirm_unsaved: bool,
    pub autosave_seconds: u32,
}
```

| 字段 | 默认值 | 含义 |
|---|---|---|
| `ui_style` | `Auto` | 界面风格轴 |
| `ui_mode` | `Auto` | 明暗轴 |
| `document_theme` | `""` | 主题名，对应 `themes/<name>.css`。**空串表示用内置默认** |
| `ui_font_size` | `15` | 界面字号（px）。**文档字号是文档主题的事，不在这里** |
| `content_width` | `760` | 内容区宽度上限（px），Typora 的"正文宽度" |
| `confirm_unsaved` | `true` | 关窗口时若有未保存改动是否询问 |
| `autosave_seconds` | `0` | 自动保存间隔（秒）。**0 表示关闭自动保存** |

⚠️ 两条与落盘有关的性质：
- 枚举是 `kebab-case`：存的是 `ui_style = "macos"`，**不是** `"Macos"`。存法即接口。
- 结构体上的 `#[serde(default)]` 让**缺字段的文件也能读**（缺的用容器默认值补），
  但**没有 `deny_unknown_fields`**——键名拼错（`ui_styel`）会被**静默忽略**，
  加载后是默认值，看起来像"设置没存住"。改键名时记得同批改前端。
- ⚠️ `autosave_seconds` / `confirm_unsaved` 今天的用法：`confirm_unsaved` 被
  `App.tsx::closeDoc` 读了；`autosave_seconds` **只落盘，没有任何自动保存逻辑**。

### 读写

```rust
pub fn load() -> Result<Self>
pub fn load_from(path: &Path) -> Result<Self>
pub fn save(&self) -> Result<()>
pub fn save_to(&self, path: &Path) -> Result<()>
```

| 函数 | 行为 |
|---|---|
| `load()` | 取 `paths::settings_file()` 再交给 `load_from` |
| `load_from(path)` | 文件**不存在**（`ErrorKind::NotFound`）→ `Ok(Self::default())`，**不算错误**（首次启动就是这种情况）。存在但解析不了 → `Err(Config("解析 {path} 失败：{e}"))`——静默回默认会让人以为设置被吞了。读不了的其它 IO 错 → `Err(Read{…})` |
| `save()` | 取 `paths::settings_file()` 再交给 `save_to` |
| `save_to(path)` | 先 `ensure_dir(parent)`，`toml::to_string_pretty`（失败 → `Config("序列化设置失败：{e}")`），再 `std::fs::write`（失败 → `Write{…}`） |

`load_from` / `save_to` 收 `&Path` 是为了能测——`load` / `save` 那层才碰 XDG。

### 测试（3）

| 测试名 | 钉住什么 |
|---|---|
| `默认设置能往返序列化` | `save_to` → `load_from` 后 `ui_style`/`ui_mode` 保持，且**没显式设过的字段**（`content_width`）回到默认 760 |
| `文件不存在时回默认而不是报错` | `load_from` 对一个不存在的路径返回 `Ok`，`ui_style == Auto` |
| `枚举落盘用_kebab_风格` | 序列化出来的文本里有 `ui_style = "macos"`（不是 `"Macos"`）。注释：**存法即接口** |

---

## `src-tauri/src/document/mod.rs`（390 行）

文档模型与文档仓库，本仓最核心的一份文件。

### 文件头的"为什么"要点

- **编辑器在前端（ProseMirror/Milkdown），前端是文本的真相。** 本模块持有一份
  **镜像**（`Document::text`），由前端在改动后推过来（`nota_doc_sync`），存盘则直接把镜像写盘。
- 为什么不像 Folio 那样把真相放后端：Folio 的编辑区是一个 WebKit 视图 + C 宿主，两边都要
  操作同一棵树，所以它挑了宿主做真相、JS 只是渲染。Nota 反过来——编辑器的撤销栈、选区、
  IME 组合态全在 ProseMirror 里，把真相搬回 Rust 等于把这些状态复制一份并保证同步，得不偿失。
- **代价与对策**：镜像可能短暂滞后。对策两条——① 前端改动后**去抖 300ms** 推一次；
  ② 任何"要读文档"的动作（存盘、插件读文档、导出）**先强制同步一次**。

写操作是**整篇替换**语义（`sync` 收的是全文）。精细的选区/位置 API 排在后面轮次。

### `pub struct DocId(pub u64)`

```rust
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, PartialOrd, Ord, Serialize, Deserialize)]
pub struct DocId(pub u64);
```

文档句柄。进程内唯一、单调递增，**不重用**（`alloc_id()` 只加不减，`close` 也不回退计数器）。
元组字段是 `pub`，所以 `id.0` 到处都在用。序列化成裸数字，前端 `type DocId = number`。

### `pub struct Document`

| 字段 | 类型 | 含义 |
|---|---|---|
| `id` | `DocId` | |
| `path` | `Option<PathBuf>` | **还没存过盘的新文档是 `None`** |
| `title` | `String` | 标题，取自 `derive_title()`；新文档是"未命名 N" |
| `text` | `String` | 文本镜像 |
| `dirty` | `bool` | 相对上次落盘有无改动 |
| `revision` | `u64` | 每次 `sync` / `save` 递增。插件与前端靠它判断"我拿到的是不是旧的" |

### `impl Document`

| 签名 | 行为 |
|---|---|
| `pub fn is_untitled(&self) -> bool` | `self.path.is_none()`。⚠️ **定义了但没有调用者** |
| `pub fn path_string(&self) -> Option<String>` | 路径的字符串形式。⚠️ 这里用的是 `p.to_str()` 而**不是** `paths::path_to_string`，所以非 UTF-8 路径会静默变成 `None`（而不是像 `path_to_string` 那样报错），调用方拿到的效果是"这份文档没有路径" |

### `derive_title()`

```rust
pub fn derive_title(text: &str, path: Option<&Path>, untitled_index: u64) -> String
```

从正文里猜标题，顺序（对齐 Typora 的窗口标题行为）：

1. YAML front matter 里的 `title:`
2. 第一个 ATX 标题（`# ` ~ `###### `）
3. 文件名的 stem
4. `format!("未命名 {untitled_index}")`

内部的三个私有辅助：

| 私有函数 | 行为 |
|---|---|
| `fn front_matter_title(text: &str) -> Option<String>` | front matter 必须**在文件最开头**、首行是 `---`，到下一个 `---` 或 `...` 结束（与 Typora / Jekyll 一致）。`title:` 后的值 `trim` 掉两侧的 `"` 或 `'`；空值当没找到，**继续往下扫**（不会因为一个空的 `title:` 就放弃） |
| `fn first_heading(text: &str) -> Option<String>` | 第一个 ATX 标题。跳过围栏代码块（` ``` ` / `~~~` 切换 `in_fence`）里的 `#`——那多半是 shell 注释 |
| `fn strip_atx(line: &str) -> Option<&str>` | 是 ATX 标题就返回文本（去掉 `#` 与可选的收尾 `#`）。`#foo` **不是**标题（`#` 后必须有空格），`#` 单独一行也不算（文本为空）。注意它取的是**行首**的 `#` 数，`1..=6` 之外返回 `None` |

⚠️ **已知缺陷：`untitled_index` 在写路径上传的是 `0`。**
`sync()` / `reload()` / `save()` / `open()` 调 `derive_title` 时第三个参数都写死 `0`
（只有 `create_untitled` 用的是真计数器）。后果：一份**未存过盘**的文档，只要正文里
既没有 front matter `title:` 也没有 `#` 标题，`sync` 就会把它的标题从「未命名 1」
改成「未命名 0」，标签栏上能看见。测试没覆盖到（`同步相同内容不动_revision` 只断言
`revision` 与 `dirty`）。要修的话，`DocumentStore::sync` 得把
`derive_title(&doc.text, doc.path.as_deref(), <该文档本来的 untitled 序号>)` 里的序号
存进 `Document`。

### `pub struct DocumentStore`

```rust
#[derive(Debug, Default)]
pub struct DocumentStore {
    docs: Vec<Document>,
    active: Option<DocId>,
    next_id: u64,
    untitled_count: u64,
}
```

打开的文档集合。字段全私有，只能通过下面的方法动。`new()` 就是 `Self::default()`。

| 方法 | 签名 | 行为 / 失败 |
|---|---|---|
| `new` | `pub fn new() -> Self` | 空仓库 |
| `alloc_id`（私有） | `fn alloc_id(&mut self) -> DocId` | `next_id += 1` 后返回。**不重用** |
| `create_untitled` | `pub fn create_untitled(&mut self) -> DocId` | `untitled_count += 1`，建一份 `path: None`、`text: ""`、标题 `未命名 {n}`、`dirty: false`、`revision: 0` 的文档，**push 进列表并设为活动** |
| `open` | `pub fn open(&mut self, path: &Path) -> Result<DocId>` | 若已有**同一路径**的文档，**复用那一份**（把活动切过去，不改内容、不重读盘）。否则 `read_to_string`（失败 → `Read{path, source}`），标题走 `derive_title(&text, Some(path), 0)`，`dirty: false`、`revision: 0` |
| `reload` | `pub fn reload(&mut self, id: DocId) -> Result<()>` | 从磁盘重读，重置 `title` / `text` / `dirty = false`，`revision += 1`。⚠️ **文档没有路径时报的是 `NoActiveDocument`（"没有活动文档"），消息不准**——真实原因是"这份文档还没存过盘"。找不到 `id` 同样报 `NoActiveDocument` |
| `sync` | `pub fn sync(&mut self, id: DocId, text: String) -> Result<u64>` | 前端推来的新文本。**内容相同就直接返回当前 `revision`，不递增**（插件靠 revision 判新旧，无改动时递增会让插件以为有新东西）。不同则写 `text`、`dirty = true`、`revision += 1`，并重算 `title`。找不到 `id` → `NoActiveDocument` |
| `save` | `pub fn save(&mut self, id: DocId, path_override: Option<PathBuf>) -> Result<PathBuf>` | 落盘，返回最终路径。给了 `path_override` 就是「另存为」（**先改 `doc.path` 再写**，所以写失败时路径也已经改了 ⚠️）。没给且 `doc.path` 是 `None` → `Err(other("这份文档还没有路径，请用「另存为」"))`。写前 `ensure_dir(parent)`，写失败 → `Write{path}`。成功后 `dirty = false`、重算 `title`、`revision += 1` |
| `close` | `pub fn close(&mut self, id: DocId) -> ()` | 从列表里删掉。若关的是活动文档，活动切到**列表里最后一份**（没有就 `None`）⚠️ 这里**不看 `dirty`**，也没问用户——那是前端的事 |
| `get` | `pub fn get(&self, id: DocId) -> Option<&Document>` | 按 id 找 |
| `get_mut` | `pub fn get_mut(&mut self, id: DocId) -> Option<&mut Document>` | 同上，可变 |
| `active` | `pub fn active(&self) -> Option<&Document>` | 活动文档（`active` 指向的 `DocId` 若已被删则是 `None`） |
| `active_id` | `pub fn active_id(&self) -> Option<DocId>` | 活动文档的 id。**插件那侧全靠它** |
| `set_active` | `pub fn set_active(&mut self, id: DocId) -> Result<()>` | id 不存在 → `Err(other(format!("没有这份文档：{id:?}")))`。⚠️ 注意消息里是 `{id:?}`（Debug，会打出 `DocId(3)`），而 `commands::document.rs` 里同样的意思写的是 `{}` + `id.0`（打出 `3`）。两处不一致，是消息层面的小瑕疵 |
| `list` | `pub fn list(&self) -> &[Document]` | 全部文档，**按创建/打开顺序**（`Vec` 的顺序 = 标签栏顺序） |
| `has_unsaved` | `pub fn has_unsaved(&self) -> bool` | 任一份 `dirty` 就 `true` |

### 测试（9）

| 测试名 | 钉住什么 |
|---|---|
| `标题优先取_front_matter` | front matter 的 `title:` 压过正文里的 `#` 标题 |
| `没有_front_matter_时取第一个标题` | 取第一个 ATX 标题，且**收尾的 `##` 要去掉**（`## 小节标题 ##` → `小节标题`） |
| `代码块里的井号不算标题` | 围栏代码块里的 `# 这是注释不是标题` 不算，取的是块外的 `# 真标题` |
| `井号后没空格不是标题` | `#标签 不是标题` → 回退到 `未命名 7` |
| `取不到就回退到文件名或未命名` | 有路径时取 stem（`/tmp/我的文档.md` → `我的文档`），没路径时 `未命名 3` |
| `同步相同内容不动_revision` | `sync` 同内容返回原 `revision`；不同内容 `+1` 且 `dirty` 为真 |
| `同一路径只打开一份` | 同路径 `open` 两次拿到同一个 `DocId`，列表长度 1 |
| `存盘后_dirty_归零且另外存能改路径` | 另存为后 `has_unsaved()` 为假、盘上内容等于镜像、`doc.path` 变成新路径 |
| `没路径又没另存要报错` | `save(id, None)` 对未存盘文档返回 `Err` |

⚠️ 测试用的是固定名字的临时目录（`temp_dir()/nota-docstore-*`），**开头先 `remove_dir_all`**。
所以同一个 crate 的这些测试不能并发跑同一份，但名字各不相同，互不干扰。

---

## `src-tauri/src/commands/mod.rs`（13 行）

只有四个 `pub mod` 声明，加一段分工说明：**这一层的职责只有三件**——取锁、调下层、
把错误转成人话。**业务逻辑不许写在这里**，命令函数应当短到能一眼看完。
命名约定：命令一律 `nota_` 前缀（它不是装饰，它让前端代码里一眼分得清哪些是跨进程调用）。

无函数、无测试。

---

## `src-tauri/src/commands/document.rs`（92 行）

`nota_doc_*` 十个命令。**每个都是"锁 `documents` → 调 `DocumentStore` → 返回"**，
没有一个函数超过 10 行。

| 签名 | 行为 / 失败 |
|---|---|
| `pub fn nota_doc_new(state: State<'_, AppState>) -> Result<DocId>` | `documents.lock()` → `create_untitled()`。不会失败 |
| `pub fn nota_doc_open(state: State<'_, AppState>, path: String) -> Result<DocId>` | `docs.open(&PathBuf::from(path))`。**已打开就复用**（不重复开标签）并把活动标签切过去。路径不存在/读不了 → `Read{…}` |
| `pub fn nota_doc_sync(state: State<'_, AppState>, id: DocId, text: String) -> Result<u64>` | 前端推文本，返回新 `revision`。前端**去抖 300ms** 调一次，存盘/插件读文档前会强制再调一次 |
| `pub fn nota_doc_save(state: State<'_, AppState>, id: DocId, path: Option<String>) -> Result<String>` | `path` 给了就是「另存为」。返回最终落盘路径的字符串（过 `paths::path_to_string`，非 UTF-8 路径会在这里报错）。未存盘又没给 `path` → `other("这份文档还没有路径，请用「另存为」")` |
| `pub fn nota_doc_close(state: State<'_, AppState>, id: DocId) -> Result<()>` | **不做未保存询问**——那是前端的事（它才知道用户点了什么）。永远 `Ok` |
| `pub fn nota_doc_set_active(state: State<'_, AppState>, id: DocId) -> Result<()>` | 透传 `DocumentStore::set_active` 的错 |
| `pub fn nota_doc_get(state: State<'_, AppState>, id: DocId) -> Result<Document>` | 返回**克隆**。找不到 → `other(format!("没有这份文档：{}", id.0))` |
| `pub fn nota_doc_list(state: State<'_, AppState>) -> Result<Vec<Document>>` | `docs.list().to_vec()`，**整份克隆**。⚠️ 每份文档的**全文**都在里面，文档大或标签多时这条命令的载荷会很大；前端每次 `refreshDocs()` 都拉一次全量 |
| `pub fn nota_doc_reload(state: State<'_, AppState>, id: DocId) -> Result<Document>` | `reload(id)?` 之后再 `get(id)` 克隆返回。⚠️ 文档没路径时 `reload` 报的是 `NoActiveDocument`（消息不准，见 `document/mod.rs`） |
| `pub fn nota_doc_has_unsaved(state: State<'_, AppState>) -> Result<bool>` | 退出前前端拿它决定要不要弹框。⚠️ **前端今天没有调用者** |

### 测试

无。

---

## `src-tauri/src/commands/workspace.rs`（217 行）

工作区（打开的文件夹）相关命令。文件头讲了一条不显然的性质：**工作区不只是 UI 状态，
它同时是 `nota.fs` 与 `nota.git` 的围栏**——插件能碰的文件范围、能跑 git 的目录都由它决定。
所以设工作区这个动作走的是**规范化后的绝对路径**，不是用户点进来的那个可能带 `..` 的串。

### `pub struct TreeNode`

```rust
#[derive(Debug, Clone, Serialize)]
pub struct TreeNode {
    pub name: String,
    pub path: String,
    pub is_dir: bool,
    pub children: Option<Vec<TreeNode>>,
}
```

| 字段 | 含义 |
|---|---|
| `name` | 显示名（文件名） |
| `path` | **相对工作区根**的路径，用 `/` 分隔。用相对路径而不是绝对路径：前端把整棵树递来递去时不必背着机器信息，插件也能直接拿它去 `nota.fs.read`（那个 API 只收相对路径） |
| `is_dir` | 是否目录 |
| `children` | **目录才有**；文件是 `None`；目录在 `depth` 用完时也是 `None` |

### 命令

| 签名 | 行为 / 失败 |
|---|---|
| `pub fn nota_workspace_open(state: State<'_, AppState>, path: String) -> Result<String>` | `PathBuf::from(path).canonicalize()`（失败 → `Read{path, source}`）→ 不是目录则 `Err(other("{path} 不是文件夹"))` → 写进 `state.workspace` → 返回规范化后的绝对路径字符串 |
| `pub fn nota_workspace_close(state: State<'_, AppState>) -> Result<()>` | 置 `None`。**只清围栏，不关文档**——用户开着的标签照旧。永远 `Ok` |
| `pub fn nota_workspace_get(state: State<'_, AppState>) -> Result<Option<String>>` | 有就返回字符串（`path_to_string`，非 UTF-8 会报错），没有就 `Ok(None)` |
| `pub fn nota_workspace_tree(state: State<'_, AppState>, sub_path: Option<String>, depth: Option<u32>) -> Result<Vec<TreeNode>>` | 见下 |

`nota_workspace_tree` 的流程：

1. 没开工作区 → `Err(other("没有打开工作区"))`
2. **子路径同样要过一遍围栏**——`sub_path` 从前端来，不能假定是干净的。
   有 `sub_path` 就调 `crate::lua::api::fs::resolve_in(&root, &sub)`（**复用插件沙箱那套裁决**）；
   没有就用 `root` 本身
3. 不是目录 → `Err(other("{base} 不是文件夹"))`
4. `base.strip_prefix(&root)` 得到相对路径（`unwrap_or_default()`，即 base 就在根时是空路径）
5. `read_dir_sorted(&base, &base_rel, depth.unwrap_or(1))`

`depth` 是递归层数上限，前端按侧栏展开状态分段请求（先 1 层，展开某个目录时再要那一支）。
**不做整棵树一次拉完**——大仓库（几万个文件）那样会卡住界面。
⚠️ 前端今天**只请求 `depth = 1`，而且目录节点不可展开**（`Sidebar` 里目录只渲染一个
`<span>`）。所以 `depth > 1` 那条递归分支**今天没有调用者**，它的测试是唯一的使用者。

### `fn read_dir_sorted(dir: &Path, rel: &Path, depth: u32) -> Vec<TreeNode>`（私有）

读一层目录，排好序，按 `depth` 决定要不要递归下去。

| 规则 | 细节 |
|---|---|
| 读不了就返回空 | `let Ok(entries) = std::fs::read_dir(dir) else { return Vec::new(); }` —— **不报错**，界面上表现为"这是个空目录" |
| 跳过点开头 | `name.starts_with('.')` → `.git`、`.obsidian` 这类元数据不列 |
| 跳过 `node_modules` | 硬编码的名字 |
| 跳过符号链接 | `meta.file_type().is_symlink()` → **不跟**（跟了可能绕出工作区，也可能成环把内存吃光）。用的是 `DirEntry::metadata()`，它**不**跟随符号链接，所以这个判断是准的。⚠️ 副作用：一个**指向工作区内部的**符号链接 .md 文件也不会被列出 |
| 取不到元数据 | `continue` |
| 目录 | `TreeNode { is_dir: true, children: depth > 1 ? Some(read_dir_sorted(...)) : None }` |
| 文件 | **只列 markdown**（`is_markdown(&name)`），`children: None`。要列全部文件的那天再放宽 |
| 排序 | **目录在前、文件在后**，各自按名字排。比较用**不区分大小写**、大小写相同时再用原名兜底——混排大小写时（`README.md` 与 `apple.md`）区分大小写的结果看着是乱的 |
| `path` 的拼法 | `child_rel` 的每个 component 用 `/` 手工 `join`，所以是 `子目录/a.md` 这种跨平台稳定的相对路径 |

### `fn is_markdown(name: &str) -> bool`（私有）

后缀表：`.md` / `.markdown` / `.mdown` / `.mkd` / `.mdx` / `.txt`，**先 `to_lowercase()`**
所以大小写都认。与 `docs/03` 里认领的后缀表**必须一致**。

⚠️ 与前端的两处不一致：`App.tsx::openViaDialog` 的对话框过滤器**没有 `mdx`**；
保存对话框只有 `md` / `markdown`。见 `docs/01-architecture.md` 的前端遗留项。

### 测试（3）

| 测试名 | 钉住什么 |
|---|---|
| `认领的_markdown_后缀` | `a.md`、`A.MD`（大小写）、`b.markdown` 认；`c.rs`、`d.pd` 不认。⚠️ 注意 `d.pd` 这条是在测"`.pd` 不在表里"——它顺带说明了这个实现是纯后缀匹配，没有更细的判断 |
| `文件树只列_markdown_并且目录在前` | 造 `zeta/`、`.git/`、`a.md`、`b.png`，断言结果是 `["zeta", "a.md"]`——目录在前、只留 md、跳过点开头 |
| `depth_为_1_时不给子节点` | `depth = 1` 时目录的 `children` 是 `None`；`depth = 2` 时子节点 1 个 |

---

## `src-tauri/src/commands/settings.rs`（33 行）

| 签名 | 行为 / 失败 |
|---|---|
| `pub fn nota_settings_get(state: State<'_, AppState>) -> Result<Settings>` | 返回**克隆**。不会失败 |
| `pub fn nota_settings_set(state: State<'_, AppState>, settings: Settings) -> Result<()>` | 整份替换并落盘；落盘失败**回滚内存** |

`nota_settings_set` 的顺序值得记：锁 `settings` → 克隆出 `previous` → 覆盖 →
`current.save()`。**先落盘，落盘失败就把内存里的改回去**——否则会出现"界面上是新的、
重开又变回去"这种最难解释的状态。注意 `save()` 是在**持着 `settings` 锁**的情况下调的
（`save_to` 不碰别的锁，所以安全）。

文件头解释了为什么走**整份替换**而不是逐项 patch：设置项还少，patch 语义（"没给的字段不动"
还是"没给的字段恢复默认"）会变成一个新的、没人想要的理解负担。等设置项多到前端改一项要
传一大坨时再改成分项，那时也有真实的理由了。

⚠️ **前端今天没有调用者**（`api.settings.set` 在 `ipc.ts` 里定义了但没人调）。
所以设置今天只能改文件，改完要重启才生效（除了 `applyTheme` 那条路，它读的是启动时拉的
`settings`）。

无测试。

---

## `src-tauri/src/commands/plugin.rs`（96 行）

| 签名 | 行为 / 失败 |
|---|---|
| `pub fn nota_plugins_list(state: State<'_, AppState>) -> Result<Vec<PluginInfo>>` | `host.list_info()`。**含加载失败的**，界面上要标红 |
| `pub fn nota_plugin_set_enabled(state: State<'_, AppState>, id: String, enabled: bool) -> Result<()>` | 透传 `PluginHost::set_enabled`。没有这个插件 → `other("没有这个插件：{id}")` |
| `pub fn nota_plugin_call(state: State<'_, AppState>, plugin: String, command: String, args: Option<serde_json::Value>) -> Result<serde_json::Value>` | 见下 |
| `pub fn nota_plugin_find_command(state: State<'_, AppState>, command: String) -> Result<Option<String>>` | `host.find_command_owner(&command).map(str::to_owned)` |
| `pub fn nota_plugin_panels(state: State<'_, AppState>) -> Result<Vec<PluginPanel>>` | `host.panels()`。**前端挂载后主动拉一次**，别改成等事件（BUG-13） |
| `pub fn nota_plugin_menus(state: State<'_, AppState>) -> Result<Vec<PluginMenuItem>>` | `host.menus()`。⚠️ **今天没有调用者**——还没有菜单栏（backlog 第 40 项） |

### `nota_plugin_call` 的四步

1. `plugins.lock()`，`host.get(&plugin)` —— 没有 → `other("没有这个插件：{plugin}")`
2. **JSON → Lua 值**：`plugin.lua.to_value(&v)`。⚠️ 这一步**必须**在插件自己的 `Lua` 状态上做，
   因为 mlua 的 `to_value` 需要那个状态的分配器。`args` 是 `None` 时用 `mlua::Value::Nil`。
   转换失败 → `other("参数转 Lua 失败：{e}")`
3. `host.call_command(&plugin.manifest.meta.id, &command, lua_args)?` —— 派发
4. **Lua 值 → JSON**：`plugin.lua.from_value::<serde_json::Value>(result)`。
   失败 → `other("返回值转 JSON 失败：{e}")`

⚠️ 三条要注意的：

- **全程持着 `plugins` 锁**（第 1 步到第 4 步之间不释放）。所以插件命令执行期间，
  任何别的线程都拿不到 `plugins` 锁。这正好是"锁序 `plugins → documents → settings`"
  成立的机制，但也意味着**插件命令里不能再触发一次需要 `plugins` 锁的路径**（会自锁）。
- 参数与返回值**直接走 JSON 而不是自定义类型**：命令的入参出参由插件自己决定，
  宿主不该、也不可能为它们定形。JSON 是这条边界上唯一不需要两边都改的公共语言。
- ⚠️ 前端调这个命令时**必须**走 `nota_plugin_call(owner, name, args)` 的形式，`owner`
  从 `nota:plugin-menu` 事件里带过来。**不要让前端凭命令名去猜是哪个插件的**——
  两个插件重名时猜错就是静默跑到别人家里。`nota_plugin_find_command` 就是为这条对账准备的。
- 前端**只有 `panels` 有调用者**（`App.tsx` 启动时拉一次）；`call` / `findCommand` /
  `menus` 今天都只是声明——`call` 要等菜单栏或面板里的按钮，`menus` 要等菜单栏本身。

无测试。

---

## `src-tauri/src/plugin/mod.rs`（356 行）

插件宿主：**发现 → 加载 → 派发 → 卸载**。

### 文件头的"为什么"要点

1. **去重按 `id` 不按目录名。** 目录名是文件系统的事，用户可以随便改；`id` 是清单里声明的、
   插件之间互相引用的名字。用目录名去重会出现"改个文件夹名就多出一份插件"这种事。
2. **一个插件坏掉不能拖垮启动。** `LuaPlugin::load` **不返回 `Err`**，坏掉的插件留下一条
   `Failed(原因)` 记录，界面上照常列出并标红。理由：插件是用户自己装的第三方代码，
   让一个写错的 Lua 脚本变成"应用打不开"，用户连去禁用它的界面都进不去。

### `pub struct PluginInfo`

```rust
#[derive(Debug, Clone, Serialize)]
pub struct PluginInfo {
    pub id: String,
    pub name: String,
    pub version: String,
    pub description: String,
    pub authors: Vec<String>,
    pub license: String,
    pub capabilities: Vec<String>,
    pub entry: String,
    pub dir: String,
    pub state: String,
    pub error: Option<String>,
}
```

**给前端看的只读快照，不含 `Lua`**（这是它能 `Serialize` 的原因，也是它必须存在的原因——
`Lua` 没法序列化，也没法安全地跨线程借出去）。

| 字段 | 来源 / 取值 |
|---|---|
| `state` | `"loaded"` / `"failed"` / `"disabled"` |
| `error` | `state == "failed"` 时的原因，其余为 `None` |
| `dir` | `p.manifest.dir.display().to_string()`（绝对路径，纯展示用） |

⚠️ `state` 是 `String` 不是枚举。前端 `ipc.ts` 那边写成联合类型
`"loaded" | "failed" | "disabled"`，两边的字面量必须一致——加一个状态要改两处。

### `pub struct PluginHost`

```rust
pub struct PluginHost {
    plugins: Vec<LuaPlugin>,
    disabled: HashSet<String>,
}
```

`disabled` 是被用户禁用的插件 id。**禁用不卸载**——只是不派发命令给它，这样重新启用时
不用重跑一遍 `on_load`（有些插件的 `on_load` 有副作用）。

| 方法 | 签名 | 行为 / 失败 |
|---|---|---|
| `discover` | `pub fn discover(resource_dir: Option<PathBuf>, base: &HostContext) -> Self` | 见下 |
| `list_info` | `pub fn list_info(&self) -> Vec<PluginInfo>` | 逐个插件造快照。判定顺序：**先看 `disabled` 集合**（`(_, true) => "disabled"`），再看 `state`（`Loaded` → `"loaded"`、`Disabled` → `"disabled"`、`Failed(e)` → `("failed", Some(e))`） |
| `get` | `pub fn get(&self, id: &str) -> Option<&LuaPlugin>` | 按 id 找 |
| `is_enabled` | `pub fn is_enabled(&self, id: &str) -> bool` | `!self.disabled.contains(id)`。⚠️ **不在 `disabled` 里不等于"能用"**——加载失败的插件也返回 `true` |
| `set_enabled` | `pub fn set_enabled(&mut self, id: &str, enabled: bool) -> Result<()>` | 没有这个插件 → `Err(other("没有这个插件：{id}"))`。启用 = 从 `disabled` 移除，禁用 = 插入 |
| `call_command` | `pub fn call_command(&self, plugin_id: &str, command: &str, args: mlua::Value) -> Result<mlua::Value>` | 没有插件 → `Err(other)`；在 `disabled` 里 → `Err(other("插件 {plugin_id} 已被禁用"))`；`Loaded` → 交给 `LuaPlugin::call_command`；`Failed(e)` → `Err(other("插件 {plugin_id} 加载失败，无法执行命令：{e}"))`；`Disabled` → `Err(other("插件 {plugin_id} 已被禁用"))` |
| `find_command_owner` | `pub fn find_command_owner(&self, command: &str) -> Option<&str>` | 在**正在生效**的插件里找**第一个**注册了该命令的。实现是读 registry 的 `nota_commands` 表再 `contains_key`。⚠️ 取不到 registry 时 `unwrap_or(false)` 当"没有"——所以加载失败的插件不会误报 |
| `panels` | `pub fn panels(&self) -> Vec<PluginPanel>` | 所有生效插件声明的面板。逐个调 `读面板(&p.lua, id)` 再摊平。**这是 BUG-13 的修法**：前端挂载后**拉**它，不是等事件推 |
| `menus` | `pub fn menus(&self) -> Vec<PluginMenuItem>` | 同上，菜单项。⚠️ 还没有菜单栏来消费（backlog 第 40 项） |
| `count` | `pub fn count(&self) -> usize` | 插件**条目**数（含失败的），`lib.rs` 启动日志用它 |
| `unload_all` | `pub fn unload_all(&mut self) -> ()` | 逐个 `LuaPlugin::unload()`。窗口销毁时调 |

**私有辅助（不在 `impl` 里，是模块级自由函数）：**

| 函数 | 签名 | 说明 |
|---|---|---|
| `生效的` | `fn 生效的(&self) -> impl Iterator<Item = &LuaPlugin>` | **加载成功 且 用户没禁用**。命令、面板、菜单三处**共用同一条判据**——各自写一遍的话，改一处忘一处就会出现"禁用了还列在面板里"这种半生效状态 |
| `读面板` | `pub(crate) fn 读面板(lua: &Lua, plugin_id: &str) -> Vec<PluginPanel>` | 从 registry 的 `nota_panels` 读。⚠️ 收 `&Lua` 而不是 `&LuaPlugin`，**是为了能被用例钉住**：BUG-13 的病灶正是写的一侧和读的一侧对不上，而 `LuaPlugin` 要先 `load`（要真的 `AppHandle`）才拿得到 |
| `读菜单` | `pub(crate) fn 读菜单(lua: &Lua, plugin_id: &str) -> Vec<PluginMenuItem>` | 同上 |
| `声明的` | `fn 声明的(lua: &Lua, reg: &str) -> Vec<mlua::Table>` | 读某个 registry 名下的数组。**没这个键就静默返回空表**——插件没申请能力、或 `on_load` 半路失败，都不是异常 |
| `REG_PANELS` / `REG_MENUS` | `pub const REG_PANELS: &str = "nota_panels"` | registry 名，**只此一处定义**。写的一侧（`lua/api/ui.rs`）和读的一侧必须说同一个字符串，拆成两处字面量就是又造一对"两处相乘" |

⚠️ `find_command_owner` 的注释说明了它只做第一个匹配：真出现两个插件抢同一个命令名时再说——
与其现在造一套优先级规则没人用，不如等真有需求时按那时的实际情况定。

⚠️ **`panels()` / `menus()` 为什么是"拉"而不是"推"**，见 `lua/api/ui.rs` 文件头与
`docs/07` BUG-13。一句话：注册发生在**插件加载时**（启动阶段），前端订阅在**挂载之后**，
推必漏且漏得安静。

### `discover()` 的完整流程

```
seen: HashSet<String>              // 已占用的插件 id
channels: HashMap<String, String>  // 事件通道名 → 占了它的插件 id
roots = [user_plugins_dir()] ++ builtin_plugins_dirs(resource_dir)

for root in roots:                          // 用户目录**先扫** → "用户覆盖内置"是顺序的自然结果
  if !root.is_dir(): continue
  for manifest_path in find_manifests(&root):
    Manifest::load() 失败 → errors.push，continue      // 连 id 都不知道，只能单独记一笔
    if !seen.insert(id): continue                      // 同名插件，前面那个（用户的）优先
    channel = channel_id(id)
    if channels.insert(channel, id) 返回了前任 holder:
        → LuaPlugin::rejected(manifest, "事件通道 `plugin:{channel}:…` 已被 `{holder}` 占用：…")
        → continue
    否则 → LuaPlugin::load(manifest, HostContext { plugin_id: id, ..base.clone() })

errors 逐条 eprintln!("[nota] 插件清单读不了：{e}")
plugins.sort_by(id)                                   // 稳定顺序让界面上列表不跳
```

四点要留意：

- `user_plugins_dir().unwrap_or_default()` —— 取不到用户目录时得到**空 `PathBuf`**，
  `is_dir()` 为假就被跳过，不报错。
- **通道撞名**这一关的判据是"归一化后的通道名相同"。`nota.git` 与 `nota-git` 两个**都合法**
  的 id 会占同一个通道，撞了事件就分不清是谁发的（"多发一条事件"这种最难查的症状），
  所以直接拒掉后到的那个，并把话说在当面。因为用户目录先扫，所以赢的是用户那个。
- 因为先扫用户目录，**用户的插件能顶掉内置插件**（同名 id 时内置那份根本不加载）。
- ⚠️ 清单都读不了的插件**只在 stderr 出现**，界面上看不见（没有 id 就挂不到列表里）。

### `LuaPlugin::rejected`

见 `lua/mod.rs`。

### 测试

无。

---

## `src-tauri/src/plugin/manifest.rs`（386 行）

插件清单（`plugin.toml`）的解析与校验。文件头带着一份完整的清单样例与各栏的含义。

### `pub const NOTA_PLUGIN_API_VERSION: u32 = 1;`

宿主 API 版本，**当前是 1**。清单里的 `api` 与它**精确匹配**，不是 `>=`——
与 Folio 的 `FO_PLUGIN_API_VERSION` 同一条理由：宿主与内置插件永远同批构建，
`>=` 只会让"插件作者以为存在一个他没见过的新版本"这种事发生。号一变，内置插件同批改号，
没有迁移动作。

**什么时候该动号**（判据写在常量上方）：

| 改动 | 动号吗 |
|---|---|
| 给 Lua 侧的 `nota.*` 表**增加**成员 | **不动**（老插件照样跑） |
| **改名**某个 `nota.*` 成员，或**改变它的语义** | **动**（老插件会静默拿到别的东西） |
| 增删 `capabilities` 里的取值，并让它影响放行 | **动** |

### `pub enum Capability`

```rust
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum Capability {
    #[serde(rename = "document.read")]  DocumentRead,
    #[serde(rename = "document.write")] DocumentWrite,
    #[serde(rename = "fs.read")]        FsRead,
    #[serde(rename = "fs.write")]       FsWrite,
    #[serde(rename = "process.git")]    ProcessGit,
    #[serde(rename = "network.http")]   NetworkHttp,
    #[serde(rename = "ui.notify")]      UiNotify,
    #[serde(rename = "ui.panel")]       UiPanel,
    #[serde(rename = "ui.menu")]        UiMenu,
    #[serde(rename = "settings.own")]   SettingsOwn,
}
```

⚠️ 注意 `rename_all = "snake_case"` 是**误导**的——每个变体都写了显式的
`#[serde(rename = "…")]`，实际名字是带点的 `document.read` 这种。增删变体时跟着写 rename。

| 变体 | 清单里的写法 | 含义 / 今天的状态 |
|---|---|---|
| `DocumentRead` | `document.read` | 读当前文档的文本、路径、标题、revision、dirty |
| `DocumentWrite` | `document.write` | 改当前文档（替换全文 / 追加） |
| `FsRead` | `fs.read` | 读工作区内的文件 |
| `FsWrite` | `fs.write` | 写/删工作区内的文件 |
| `ProcessGit` | `process.git` | 起 `git` 子进程。**只放行 git 这一个命令**，不是通用 subprocess |
| `NetworkHttp` | `network.http` | 发 HTTP 请求。⚠️ **宿主侧尚未实现**，装出来的是"会明说没实现"的表 |
| `UiNotify` | `ui.notify` | 弹通知 |
| `UiPanel` | `ui.panel` | 注册侧栏面板 |
| `UiMenu` | `ui.menu` | 往菜单里加条目。⚠️ **单独申请它不会装 `nota.ui`**，见 `lua/api/mod.rs` |
| `SettingsOwn` | `settings.own` | 读写插件自己的设置段。⚠️ **宿主侧尚未实现** |

### `Capability::parse`

```rust
pub fn parse(s: &str) -> Result<Self>
```

从清单里的字符串解析。**未知能力报错而不是忽略**——悄悄忽略会变成"插件作者以为申请到了、
实际没有"的静默降级。错误消息是
`other("不认识的能力 `{other}`（见 docs/11 的能力表）")`。

### `pub struct PluginMeta`

```rust
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PluginMeta {
    pub id: String,
    pub name: String,
    #[serde(default = "default_version")] pub version: String,
    pub api: u32,
    #[serde(default = "default_entry")]   pub entry: String,
    #[serde(default)] pub description: String,
    #[serde(default)] pub authors: Vec<String>,
    #[serde(default)] pub license: String,
    #[serde(default)] pub capabilities: Vec<String>,
}
```

| 字段 | 必填 | 默认 |
|---|---|---|
| `id` | **是** | — |
| `name` | **是** | — |
| `api` | **是** | — |
| `version` | 否 | `"0.0.0"` |
| `entry` | 否 | `"main.lua"` |
| `description` / `license` | 否 | `""` |
| `authors` | 否 | `[]` |
| `capabilities` | 否 | `[]`。**空 = 纯声明式插件**（只贡献菜单/面板，不碰文档与磁盘） |

⚠️ `capabilities` 是 `Vec<String>` 而不是 `Vec<Capability>`：因为要能在解析时报出
"清单里有哪一条不认识"，所以**先在 `from_meta` 里逐条 `Capability::parse`**，
解析结果另存在 `Manifest.capabilities` 里。

### `pub struct Manifest`

```rust
#[derive(Debug, Clone)]
pub struct Manifest {
    pub meta: PluginMeta,
    pub dir: PathBuf,
    pub capabilities: Vec<Capability>,
}
```

| 字段 | 含义 |
|---|---|
| `meta` | 原样的 `[plugin]` 段 |
| `dir` | 插件根目录（`plugin.toml` 所在处） |
| `capabilities` | **解析并去重后**的能力枚举（清单里的原始字符串仍在 `meta.capabilities` 里） |

| 方法 | 签名 | 行为 / 失败 |
|---|---|---|
| `entry_path` | `pub fn entry_path(&self) -> PathBuf` | `self.dir.join(&self.meta.entry)`。不做存在性检查（`run_entry` 里查） |
| `load` | `pub fn load(path: &Path) -> Result<Self>` | 读文件（失败 → `Read{path, source}`）→ `toml::from_str`（失败 → `Manifest{file, reason}`）→ 取父目录（没有 → `Manifest{file, reason: "plugin.toml 没有父目录"}`）→ `from_meta` |
| `from_meta`（私有） | `fn from_meta(meta: PluginMeta, dir: PathBuf, file: &Path) -> Result<Self>` | 四条校验，见下 |
| `has` | `pub fn has(&self, cap: Capability) -> bool` | `self.capabilities.contains(&cap)` |

`from_meta` 的四条校验：

| # | 规则 | 违反时 |
|---|---|---|
| 1 | `id` 不能为空 | `Manifest{reason: "id 不能为空"}` |
| 2 | `id` 只能用小写字母、数字、`.`、`-`、`_` | `Manifest{reason: "id `{}` 只能用小写字母、数字、`.`、`-`、`_`"}`。注意**不接受大写**，也不接受非 ASCII |
| 3 | `api` 必须等于 `NOTA_PLUGIN_API_VERSION` | `PluginApiMismatch{id, wanted, have}` |
| 4 | `entry` 不许含 `..`、不许是绝对路径 | `Manifest{reason: "entry `{}` 必须是插件目录内的相对路径"}`。清单是插件自带的，`entry = "../../../etc/passwd"` 这种必须挡在门口 |

另外 `capabilities` 在这一步逐条解析、**顺带去重**（同一个能力写两遍只留一份）。

⚠️ 第 4 条用的是 `contains("..")` 而不是路径分段判断，所以一个**文件名里**含 `..` 的
合法脚本（`a..b.lua`）会被误拒。这是"宁可严一点"的取舍，不是漏洞。

### `pub fn channel_id(id: &str) -> String`

插件 id 在**事件通道名**里的写法。把不在 `[A-Za-z0-9_-]` 里的字符**一律换成 `-`**。
返回的串由 `[a-z0-9_-]` 组成，插进 `plugin:<id>:<名字>` 里一定合法。

为什么需要它：清单里的 id 允许 `.`（`nota.git`、`nota.ai` 就是这么写的，反域名风格），
而 **Tauri 的事件名只允许字母数字与 `-` `/` `:` `_`**——一个点就让 `emit` 直接报错。
踩到它的样子是：插件加载"成功"，但一 `emit` 就抛
`only alphanumeric, '-', '/', ':', '_' permitted for event names`，
而且**只在这个插件第一次发事件时才炸**，静态看代码完全看不出来。

⚠️ 归一化的后果：`.` / `_` 与 `-` 在通道名里是同一个字符，所以 `nota.git` 与 `nota-git`
会撞成同一个通道。两种写法都是合法 id，撞了事件就分不清是谁发的，所以
`PluginHost::discover()` 会把后一个判为加载失败，而不是让它们悄悄混在一起。

### `pub fn find_manifests(root: &Path) -> Vec<PathBuf>`

在「插件目录」里找一个插件的清单文件。认两种形状，方便开发时少写一层：

| 形状 | 行为 |
|---|---|
| `<root>/plugin.toml` 存在 | **直接返回它，不再往下扫** |
| 否则 | 遍历 `root` 的每个子目录，收下其中**存在** `plugin.toml` 的那些，最后 `sort()` |

⚠️ 第一条的"直接返回"意味着：如果 `<root>/plugin.toml` 存在，`<root>/*/plugin.toml`
**全部被忽略**。这是刻意的（"这个目录本身就是一个插件"优先于"这个目录是一堆插件"），
但混放时会让人困惑——一个目录要么是插件本身，要么是插件集合，别两样都是。

### 测试（5）

| 测试名 | 钉住什么 |
|---|---|
| `好清单能解析出能力` | `api = 1` 的清单解析成功；`entry` 缺省时是 `"main.lua"`；`has(ProcessGit)` 为真、`has(NetworkHttp)` 为假 |
| `通道名里的点要换成连字符` | `nota.git` → `nota-git`、`nota.ai` → `nota-ai`；`_` 要**保留**（`a_b-c` 不变）；并对 `nota.git` / `a.b.c` / `x/y` / `带中文的` 逐个断言归一化结果只含合法字符 |
| `api_版本不符要拒载` | `api = 99` 得到 `PluginApiMismatch { wanted: 99, have: 1 }` |
| `entry_不许逃出插件目录` | `entry = "../../evil.lua"` 加载失败 |
| `不认识的能力要报错而不是静默忽略` | `capabilities = ["fs.everything"]` 报错，且错误消息里含 `fs.everything` |

---

## `src-tauri/src/lua/mod.rs`（255 行）

Lua 插件运行时。**一插件一状态。**

### 文件头的"为什么"要点

**每个插件拿到一个独立的 `Lua`**，不是所有插件共享一个。带来三件事：

1. **隔离**：一个插件把脚本写崩，`pcall` 之外的东西影响不到别的插件，也影响不到宿主；
2. **能力放行是天然的**：`nota.document` 这张表**只在插件申请了 `document.read`/
   `document.write` 时才存在**——不是"存在但调用时报错"。没申请 `process.git` 的插件，
   `nota.git` 那格就是 `nil`，写不出来也绕不过去；
3. **卸载 = 丢掉这个 `Lua`**，不用做引用计数、不用管谁还拿着回调。

**沙箱两道闸**：

- **第一道（本仓自己列的）**：`硬化的_lua()` 显式只开 `coroutine` / `table` / `string` /
  `utf8` / `math`（`fn 插件标准库()`），再把 `io`、`os`、`package`、`require`、
  `dofile`、`loadfile`、`debug` 逐个置 `nil`（`const 必须为空的全局`）。
  ⚠️ `loadfile`/`dofile` 属于 **base** 库，而 base 库 mlua **无条件加载**，
  光靠 `StdLib` 关不掉，**必须显式抹掉**。
- **第二道（`lua/api/`）**：所有对外能力都**只**通过 `nota.*` 表提供，且逐项按清单里
  声明的 capability 决定装不装。

⚠️⚠️ **这一段原先写的是"第一道（mlua 给的）：`Lua::new()` 只加载安全标准库子集，
`io`/`os`/`debug`/`package`/`require` 全都不存在"——那是假的（BUG-10，2026-09-22 已修）。**
mlua 的 `ALL_SAFE = StdLib((1 << 30) - 1)` 含第 0–29 位，`IO`=bit2、`OS`=bit3、
`PACKAGE`=bit8 全在里面，只排除 bit31 的 `DEBUG`；它的 "safe" 只等于**不能加载 C 模块**。
所以现在**不再依赖 `Lua::new()` 的默认值**，而是自己列白名单，并有用例钉住
（含一条 `mlua_的_default_safe_其实含_io_和_os`，专门记录这个事实）。

**插件入口约定**：入口脚本按模块写，`on_load(nota)` / `on_unload()` 都是**可选**的。
整个 chunk 用 `pcall` 语义包着跑——**插件炸了不能带走宿主**（这条与 Folio 的 C 插件相反：
那边同进程无沙箱，插件的段错误就是宿主的段错误）。

### `pub struct HostContext`

```rust
#[derive(Clone)]
pub struct HostContext {
    pub app: tauri::AppHandle,
    pub documents: Arc<Mutex<DocumentStore>>,
    pub settings: Arc<Mutex<Settings>>,
    pub workspace: Arc<Mutex<Option<std::path::PathBuf>>>,
    pub plugin_id: String,
}
```

| 字段 | 说明 |
|---|---|
| `app` | 发事件给前端的把手 |
| `documents` / `settings` / `workspace` | 与 `AppState` 里**同一批 `Arc`** |
| `plugin_id` | 这个插件的 id，出错信息里带上，好定位是谁炸的。⚠️ `lib.rs` 建 `base` 时是**空串**，`PluginHost::discover` 里每个插件换成自己的 |

`Clone` 是必需的（每个闭包要 `ctx.clone()` 或 `..base.clone()`）。
⚠️ 文件头再次写了锁序不变量：拿锁顺序只能是 `plugins → documents → settings`。

⚠️ **`HostContext` 要真的 `AppHandle`，构造不出来**——所以**别把安全边界写在它里面**
（写进去就没法单元测试）。`fs.rs` 的 `resolve_in()` 与 `git.rs` 的 `挑工作目录()` 都是
为了这个才被剥成纯函数的。

### `pub struct LuaPlugin`

```rust
pub struct LuaPlugin {
    pub manifest: Manifest,
    pub lua: Lua,
    pub state: PluginState,
    has_unload: bool,
}
```

| 字段 | 说明 |
|---|---|
| `manifest` | 清单 |
| `lua` | 这个插件独占的 Lua 状态。`commands/plugin.rs` 直接访问它做 JSON↔Lua 转换 |
| `state` | 见下 |
| `has_unload`（私有） | 入口脚本是否导出了 `on_unload`。**为什么不存 `Function` 本体**：mlua 的 `Function` 带着 `'lua` 生命周期，不好塞进结构体；所以只在 registry 里存模块表，靠 `has_unload` 这个布尔决定要不要去取 |

### `pub enum PluginState`

```rust
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum PluginState {
    Loaded,
    Failed(String),
    Disabled,
}
```

| 变体 | 含义 |
|---|---|
| `Loaded` | 加载并跑通了 `on_load` |
| `Failed(String)` | 加载失败，带原因。界面上要显示——静默吞掉会让人以为插件没装 |
| `Disabled` | ⚠️ **从未被构造过**。用户禁用走的是 `PluginHost::disabled: HashSet<String>`，与这个变体是两套。`plugin/mod.rs` 的 `list_info` / `call_command` 里的 `PluginState::Disabled` 分支是**死分支** |

### `LuaPlugin::load`

```rust
pub fn load(manifest: Manifest, ctx: HostContext) -> Self
```

建 Lua 状态、按能力装 `nota.*`、跑入口脚本。流程：

1. `Lua::new()`
2. `Self::install(&lua, &manifest, &ctx)` —— 失败 → `{ state: Failed(e.to_string()), has_unload: false }`
3. `Self::run_entry(&lua, &manifest.entry_path())` —— 失败 → 同上
4. 成功 → `{ state: Loaded, has_unload }`

**失败不返回 `Err`**，而是返回一个 `state = Failed` 的实例——一个插件坏掉不该让整个
启动流程挂掉，界面上照常列出它并标红。

### `LuaPlugin::rejected`

```rust
pub fn rejected(manifest: Manifest, reason: String) -> Self
```

一个**根本没打算加载**的插件：清单读得懂，但它与已经在场的某个插件抢同一个事件通道
（见 `PluginHost::discover` 的撞名一节）。与 `load` 失败的区别只在"连 Lua 状态都不用建"
——对界面来说两者一样，都是一行标红的插件加一句原因。所以这里也走 `Failed`，不另造状态。

### `fn install(lua: &Lua, manifest: &Manifest, ctx: &HostContext) -> Result<()>`（私有）

`api::build(lua, manifest, ctx)?` 造出 `nota` 表，然后 `lua.globals().set("nota", nota)`。
失败包成 `NotaError::Lua { plugin: manifest.meta.id.clone(), message }`。

### `fn run_entry(lua: &Lua, entry: &Path) -> Result<bool>`（私有）

跑入口脚本，返回它是否导出了 `on_unload`。

1. `entry.is_file()` 为假 → `Err(other("入口脚本不存在：{path}"))`
2. 读文件（`Read{…}`）
3. `lua.load(&code).set_name(entry.to_string_lossy().as_ref())` —— **chunk 名用真实路径**，
   因为 Lua 报错信息里会带上它，没有它的话报错只有行号，不知道是哪个文件
4. `chunk.eval()` 求值成模块值（失败 → `Lua` 错误，`plugin` 字段用的是**入口文件路径**）
5. 只有在模块值是 `Table` 时才继续：
   - `has_unload = ` 表里 `on_unload` 是函数
   - 模块表存进 registry 的 `nota_module`：`unload()` 靠这个名字把它找回来。
     **不用 globals** 是因为插件可以合法地把全局 `nota` 覆盖掉
   - 表里有 `on_load` 函数就 `f.call::<()>(nota)` —— 签名 `(nota)`，**把表也当参数递一份**，
     这样脚本可以 `local M = {}; function M.on_load(nota) end` 不依赖全局

⚠️ 两个静默的情况：
- 入口脚本 `return` 一个**非表**（比如忘了写 `return M`，chunk 求值成 `nil`）→
  不报错、不调 `on_load`，插件还是 `Loaded`。现象是"插件加载成功但什么都没做"。
- 表里没有 `on_load` → 同样是 `Loaded` 但没有任何行为。**两者都是合法用法**
  （纯声明式插件），但写错时也不会有人告诉你。

### `LuaPlugin::unload`

```rust
pub fn unload(&self)
```

卸载前调 `on_unload`（有才调），然后本对象被丢弃、Lua 状态一起没。
`has_unload` 为假直接返回；从 registry 取 `nota_module` 取不到或不是表也直接返回。

⚠️ **卸载时的报错只记不抛**：`eprintln!("[nota] 插件 {} 的 on_unload 出错：{e}", id)`——
卸载流程不该被一个插件的残骸卡住。这也意味着 `on_unload` 的失败在界面上看不见。

### `LuaPlugin::is_loaded`

```rust
pub fn is_loaded(&self) -> bool
```

`self.state == PluginState::Loaded`。`PluginHost::find_command_owner` 用它过滤。

### `LuaPlugin::call_command`

```rust
pub fn call_command(&self, name: &str, args: mlua::Value) -> Result<mlua::Value>
```

调这个插件注册的一个命令。

1. 从 registry 取 `nota_commands` 表 —— 取不到 → `NotaError::Lua { message: "取命令表失败：{e}" }`。
   ⚠️ 加载失败的插件从来没装过这张表（`install` 那一步就返回了），所以对它的
   `call_command` 一定在这一步失败——不过 `PluginHost::call_command` 会先按 `Failed`
   拦下，走不到这里
2. `commands.get(name)` —— 取不到 → `other("插件 {} 没有注册命令 `{name}`")`
3. `f.call::<mlua::Value>(args)` —— 失败 → `NotaError::Lua { plugin, message }`

注意参数与返回值都是 `mlua::Value`（`args` 一个、返回一个），**不是多值**——
插件命令的约定是"收一张表、回一个值"。

### 测试

无。

---

## `src-tauri/src/lua/api/mod.rs`（240 行）

注入给插件的 `nota.*` 表。

### 文件头的"为什么"要点

**一条硬规矩：按能力装表，不装空壳。** 插件没申请 `document.read`，`nota.document`
就是 `nil`。**不要**给它装一张调用时才报"你没权限"的表——那既让插件作者在开发期发现不了
问题（写完才炸），也让"权限"变成一句运行时的客气话而不是一道结构上的墙。

唯一的例外是本文件里那几个**永远可用**的东西（`log` / `command` / `event` / `version` /
`plugin_id`）：它们不碰文档也不碰磁盘，是插件跟自己、跟宿主说话用的。

### `pub fn lua_err(e: NotaError) -> mlua::Error`

```rust
pub fn lua_err(e: NotaError) -> mlua::Error
```

把 `NotaError` 转成 Lua 错误（`mlua::Error::RuntimeError(e.to_string())`）。
统一从这一处走，报错信息里一定带得出人话。`document.rs` / `fs.rs` / `git.rs` 的闭包里
凡是"要返回 `mlua::Result` 但拿到的是 `NotaError`"的地方都过它。

### `pub fn build(lua: &Lua, manifest: &Manifest, ctx: &HostContext) -> Result<Table, NotaError>`

组装整张 `nota` 表。装了什么、按什么条件装：

| `nota.` 下的名字 | 装的条件 | 内容 |
|---|---|---|
| `version` | **永远** | `env!("CARGO_PKG_VERSION")`，即宿主的版本（今天 `0.1.0`） |
| `api_version` | **永远** | `NOTA_PLUGIN_API_VERSION`，即 `1` |
| `plugin_id` | **永远** | `manifest.meta.id` 原样（带点的那种） |
| `log` | **永远** | `{ info, warn, error }` 三个函数，各自 `eprintln!` 到宿主 stderr |
| `command` | **永远** | `{ register(name, f) }` |
| `event` | **永远** | `{ emit(name, payload) }` |
| `document` | `document.read` **或** `document.write` | 见 `document.rs` |
| `fs` | `fs.read` **或** `fs.write` | 见 `fs.rs` |
| `git` | `process.git` | 见 `git.rs` |
| `ui` | `ui.notify` **或** `ui.panel` **或** `ui.menu` | 见 `ui.rs` |
| `http` | `network.http` | `not_implemented(lua, "网络请求", "docs/07 第 12 项")` ⚠️ |
| `settings` | `settings.own` | `not_implemented(lua, "插件设置", "docs/07 第 13 项")` ⚠️ |

📌 **更正（2026-09-22）**：本行曾写"`ui.menu` 单独存在不会装 `nota.ui`"——那在
当时是**真的**（判据漏了 `ui.menu`，见 `docs/07` BUG-8），但**已修**。现在三条能力
**任一条**都能装出 `nota.ui`。修法不是补一个 `||`，而是让两层判据**同源**：

```rust
const UI能力: [Capability; 3] = [Capability::UiNotify, Capability::UiPanel, Capability::UiMenu];
fn 装_ui吗(manifest: &Manifest) -> bool { UI能力.iter().any(|c| manifest.has(*c)) }
```

⚠️ 这个坑的形态值得记住：**两层判据相乘**——表**内**每个方法判一次"装不装这个函数"，
表**外**判一次"装不装表本身"。每一层单独看都对，任一层漏一项那条能力就是死的。
有用例钉着（含一条数 `ui.rs` 里判据个数的，见 `docs/06` §6.1）。

⚠️ `nota.command` 与 `nota.event` 与能力无关——**一个零能力的插件也能注册命令、
发事件**。这是刻意的（它们是插件跟宿主说话的基本手段，不碰敏感资源），
但要知道"没有能力"不等于"插件什么都不能做"。

`nota.http` / `nota.settings` 这份"诚实"是有用的：插件作者写 `nota.http.get(...)` 会立刻
拿到一句"尚未实现（docs/07 第 12 项）"，而不是 `attempt to index a nil value`——
后者会让人以为是自己的能力没申请对，白查半天。

### `fn command_table(lua: &Lua, plugin_id: &str) -> Result<Table, NotaError>`（私有）

`nota.command` —— 注册命令给宿主/前端调。

- 建一张空表存进 registry 的 `nota_commands`（`LuaPlugin::call_command` 与
  `PluginHost::find_command_owner` 都按这个名字取）
- `nota.command.register(name: string, f: function) -> ()`：
  - `name` 为空 → `RuntimeError("命令名不能为空")`
  - **同名覆盖要报错**：`RuntimeError("插件 {id} 重复注册命令 `{name}`")`。
    理由：多半是复制粘贴改漏了，静默覆盖会让作者对着"怎么点下去跑的是另一个函数"查到天亮
  - 否则 `commands.set(name, f)`

⚠️ `register` 的签名是 `(String, mlua::Function)`，**第二个参数必须是函数**——
传个表或字符串会得到 Lua 自己的类型错误，不是我们的消息。

### `fn event_table(lua: &Lua, ctx: &HostContext) -> Result<Table, NotaError>`（私有）

`nota.event` —— **插件 → 前端**这一个方向（`emit`）。

**本轮只做这一个方向。** 前端 → 插件那一侧由命令承担（`nota.command.register`
就是那条路）——两条路各管一头，别混。

- 事件名统一加 `plugin:` 前缀：`format!("plugin:{plugin_id}:{name}")`，
  前端一眼看得出是从插件来的，也不会跟宿主自己的事件名撞
- `plugin_id` 那一节**过 `channel_id()`**（归一化掉点号），`name` 那一节**原样保留**
- 载荷过 `lua_to_json()`，`app.emit(&channel, json)`；失败 →
  `RuntimeError("发事件 {channel} 失败：{e}")`
- ⚠️ 没有监听者时 `emit` **静默成功**——插件发了一条没人收的事件，日志里一点痕迹都没有

### `fn not_implemented(lua: &Lua, what: &str, where_: &str) -> Result<Table, NotaError>`（私有）

造一张"这个能力还没实现"的表。消息是 `format!("{what}尚未实现（见 {where_}）")`。

用 `__index` 元表兜住**任意**方法名：`nota.http.get` / `nota.http.post` 都能答上，
不用逐个列。**给的是线索不是哑弹**——带着文档条目号，插件作者能直接翻到 backlog 那一项。

⚠️ 因为用的是 `__index`，`nota.http` 上**任何**字段访问——包括读一个不存在的属性
（`nota.http.timeout`）——都返回同一个错误函数，而不是 `nil`。
用 `pairs` 遍历这张表会得到空表。

### `fn set(r: mlua::Result<()>, _lua: &Lua) -> Result<(), NotaError>`（私有）

`Table::set` 返回 `Result<()>`，串起来写会很难看。这个把 `mlua::Error` 转成 `NotaError`
好让 `?` 一路走到底。第二个参数 `_lua` 是没用到的占位。

### `pub fn mlua_to_nota(e: mlua::Error) -> NotaError`

```rust
pub fn mlua_to_nota(e: mlua::Error) -> NotaError
```

`NotaError::other(format!("Lua：{e}"))`。四个子模块都用它做 `.map_err(mlua_to_nota)?`。

### `fn value_to_text(v: &Value) -> String`（私有）

把 Lua 值渲染成人看的文本（给 `nota.log.*` 用）。`nil` / `bool` / `int` / `number` /
`string` 有各自的渲染，**其余一律 `format!("{other:?}")`**——所以打印一张表得到的是
Rust 的 Debug 表示（`Table(0x…)` 这种），不是内容。想打内容得自己 `tostring` 或者
序列化。

### `pub fn lua_to_json(lua: &Lua, v: Value) -> mlua::Result<serde_json::Value>`

```rust
pub fn lua_to_json(lua: &Lua, v: Value) -> mlua::Result<serde_json::Value>
```

Lua 值 → JSON，用于跨 IPC 发出去。

| Lua | JSON |
|---|---|
| `Nil` | `Null` |
| `Boolean` | `Bool` |
| `Integer` | `Number` |
| `Number` | `Number::from_f64(n)`，`from_f64` 失败（NaN/Inf）时**退回 `Null`** ⚠️ |
| `String` | `String` |
| `Table` | 见下 |
| 其它（函数、线程、userdata） | `String(format!("{other:?}"))` ⚠️ |

Table 的判定：**是数组还是字典？Lua 里只有 table，靠"有没有 1..n 连续整数键"判。**
用 `t.raw_len()`（不触发 `__len` 元方法）：

- `raw_len() > 0` → 按 `1..=len` 逐个 `raw_get` 成 `Array`
- 否则 → 遍历 `pairs`，**只收 `String` 键**，成 `Object`

⚠️ 三个坑：
1. **空表变成 `{}`（对象），不是 `[]`。** 插件发一个空数组会到前端变成空对象，
   前端 `Array.isArray` 判假。要发空数组得显式给一个占位或改用别的表示。
2. **`raw_len() > 0` 时哈希部分整个丢掉。** 一个既有 `[1]` 又有 `["a"]` 的表会**静默**
   只留下数组那半。
3. `raw_len` 只在序列**没有洞**时准。`{[1]="a", [3]="c"}` 的 `raw_len` 是 1 还是 3 是
   未定义区间（Lua 的边界行为），别依赖它。

### 测试

无。

---

## `src-tauri/src/lua/api/document.rs`（134 行）

`nota.document` —— 读写当前文档。

### 文件头的"为什么"要点

- 读的方法要 `document.read`，写的要 `document.write`；两者各自装表，
  只申请了读的插件拿到的 `nota.document` 上**没有** `set_text` 这一格。
- **写完之后发生了什么**：`set_text` / `append_text` 改的是后端镜像，
  **前端编辑器不会自己知道**。所以每次写完都往 `nota:document-changed` 发一条事件，
  前端收到就把编辑器内容换掉、光标落到合理位置。
- ⚠️ 写操作是**整篇替换**语义。插件想"在光标处插一段"目前只能拿到全文自己拼——
  精细的选区/位置 API 排在后面的轮次（`docs/07` 第 14 项）。

### `pub fn build(lua: &Lua, manifest: &Manifest, ctx: &HostContext) -> Result<Table, NotaError>`

⚠️ 注意这个签名与 `fs.rs` / `git.rs` / `ui.rs` 的**不一样**：它返回
`Result<Table, NotaError>`（不是 `NotaResult<Table>`），而且**没有** `NotaResult` 别名导入。
语义相同，写法不同。

### 装出来的方法

**`can_read`（`document.read`）时：**

| 方法 | 签名 | 行为 |
|---|---|---|
| `get_text` | `() -> string` | **活动文档**的全文镜像。**没有活动文档时返回空串**（不是 `nil`、不报错） |
| `get_path` | `() -> string \| nil` | 活动文档的路径；未存盘时 `nil`。经 `Document::path_string()`，所以非 UTF-8 路径也是 `nil` ⚠️ |
| `get_title` | `() -> string` | 活动文档的标题。没有活动文档时返回空串 |
| `get_revision` | `() -> integer` | 活动文档的 `revision`。没有活动文档时 `0` |
| `is_dirty` | `() -> boolean` | 活动文档的 `dirty`。没有活动文档时 `false` |

⚠️ 这五个方法读的都是**后端的"活动文档"**，而前端切标签时**不通知后端**
（见 `docs/01-architecture.md` 的前端遗留项）。所以插件拿到的很可能不是用户正在看的那份。

⚠️ `get_text` 读到的是**300ms 去抖的镜像**，可能比编辑器里少最后几次击键。
插件要做"基于当前内容"的判断时得知道这一点（`docs/03` 的"真相在哪"）。

**`can_write`（`document.write`）时：**

| 方法 | 签名 | 行为 |
|---|---|---|
| `set_text` | `(text: string) -> ()` | 整篇替换活动文档的文本 |
| `append_text` | `(tail: string) -> ()` | 读当前镜像，`push_str(&tail)`，再整篇写回 |

两者的实现是同三步：

1. `docs.lock()`，取 `store.active_id()` —— 没有 → **抛 Lua 错误**（`NoActiveDocument`，
   "没有活动文档"）
2. `store.sync(id, text)` —— 失败也抛（`DocumentStore::sync` 只在找不到 id 时失败）
3. **显式 `drop(store)` 释放锁**，再 `emit_changed(&app, id, &text)`

⚠️ 第 3 步的 `drop(store)` 不能省：`emit_changed` 要发事件，虽然它自己不取文档锁，
但保持"发事件时手上不握锁"这条纪律能挡住将来把 `emit` 换成别的东西时的坑。

⚠️ `append_text` 在**一次锁持有期内**读改写，所以不会有中间态漏出去；但它读的是镜像，
不是前端编辑器里的实时内容——**用户刚敲但还没去抖推过来的字不在里面**。

### `fn emit_changed(app: &tauri::AppHandle, id: crate::document::DocId, text: &str)`（私有）

```rust
fn emit_changed(app: &tauri::AppHandle, id: crate::document::DocId, text: &str) {
    use tauri::Emitter;
    let _ = app.emit(
        "nota:document-changed",
        serde_json::json!({
            "id": id.0,
            "text": text,
            "origin": "plugin",
        }),
    );
}
```

把"文档被插件改了"告诉前端。事件名与宿主自己的 `nota:document-changed` 一致——
**前端不必区分**是插件改的还是别处改的，反正都是"后端这份跟你的不一致了，来拿"。

⚠️ 两个细节：
- **返回值的 `Err` 被 `let _ =` 丢掉了**。发不出去（理论上只有事件名非法才会）时静默失败，
  插件的 `set_text` 依然返回成功。前端表现为"这一改没出现在编辑器里"。
  （`ui.rs` 里同样的事是 `map_err(...)?` 抛出去的，两处口径不一致。）
- `origin` 固定是 `"plugin"`，**宿主自己发这条事件的路径今天还没有**
  （见 `docs/01-architecture.md`）。

### 测试

无。

---

## `src-tauri/src/lua/api/fs.rs`（233 行）

`nota.fs` —— 插件读写文件，**限死在当前工作区内**。本仓**唯一一处安全边界**。

### 文件头的"为什么"要点

- **围栏怎么立的**：每条路径先**规范化**（`canonicalize`，会把 `..` 和符号链接都解开），
  再要求它落在规范化后的工作区根之下。写一个新文件时文件还不存在，规范化不了，
  就规范化它的**父目录**再拼上文件名——否则 `fs.write("../../.bashrc", ...)` 正好从
  "文件不存在"这个缝里溜出去。
- 没开工作区（`workspace` 是 `None`）时**一律拒绝**，不是"那就放开"。
  放开会让"没开文件夹"变成一条绕过围栏的路。
- 裁决逻辑抽在 `resolve_in()` 里、**不依赖 Tauri**，所以它能真被单元测试覆盖
  ——这是本仓唯一一处安全边界，不能只靠"看着对"。

### `pub fn build(lua: &Lua, manifest: &Manifest, ctx: &HostContext) -> NotaResult<Table>`

**`can_read`（`fs.read`）时：**

| 方法 | 签名 | 行为 / 失败 |
|---|---|---|
| `read` | `(path: string) -> string` | 过围栏后 `read_to_string`。失败 → `Read{path: 绝对路径, source}`（Lua 错误） |
| `exists` | `(path: string) -> boolean` | 过围栏后 `full.exists()`。⚠️ **围栏在 `exists` 之前**——所以 `fs.exists("../x")` 是**报错**而不是 `false` |
| `list` | `(path: string) -> {string}` | 过围栏后 `read_dir`，取每项的**文件名**（不是路径），跳过非 UTF-8 的名字，然后 `sort()`。失败 → `Read{…}` |

**`can_write`（`fs.write`）时：**

| 方法 | 签名 | 行为 / 失败 |
|---|---|---|
| `write` | `(path: string, text: string) -> ()` | 过围栏 → `ensure_dir(parent)` → `fs::write`。失败 → `Write{path: 绝对路径, source}` |
| `remove` | `(path: string) -> ()` | 过围栏 → `fs::remove_file`。⚠️ 失败也用 `NotaError::Write{…}` 包装（语义上是"删除失败"，但错误种类是 `Write`，消息会写成"写文件失败 …"）。只能删文件，**不能删目录** |

⚠️ 三个参数用 `(String, String)` 元组的位置参数，不是表。插件写
`nota.fs.write("a.md", "内容")`，不是 `nota.fs.write{path=…, text=…}`。
参数类型不对时得到的是 mlua 自己的类型错误。

### `fn resolve(ctx: &HostContext, given: &str) -> mlua::Result<PathBuf>`（私有）

从共享状态里取工作区根，再交给 `resolve_in` 裁决。

- `workspace.lock()` 为 `None` → Lua 错误 `other("没有打开工作区，nota.fs 不可用")`
- `resolve_in(&root, given)` 的 `NotaError` 经 `lua_err` 转成 Lua 错误

⚠️ 每次调用都取一次 `workspace` 锁（`clone()` 出来就放）。
这符合"锁序里 workspace 不参与"的定位。

### `pub fn resolve_in(root: &Path, given: &str) -> NotaResult<PathBuf>`

**核心裁决**：把插件给的相对路径解析成工作区内的绝对路径，**并确认它没跑出去**。三步，缺一不可：

| # | 规则 | 失败消息 |
|---|---|---|
| 1 | **必须是相对路径**。允许了就等于允许写 `/etc` | `nota.fs 只接受工作区内的相对路径，收到绝对路径 `{given}`` |
| 2 | **`..` 在交给文件系统之前就按段算掉**（逐 component：`Normal` 压栈、`CurDir` 跳过、`ParentDir` 弹栈，**弹空栈就报错**）。只靠 `canonicalize` 挡不住"写新文件"那条路 | `路径 `{given}` 跑到工作区外面去了`；`RootDir`/`Prefix` → `路径 `{given}` 不是合法的工作区内相对路径` |
| 3 | 再比一次**规范化结果**，防符号链接。`full.exists()` 时规范化 `full`，否则退而规范化**父目录** | `路径 `{given}` 经符号链接指向了工作区外面` |

返回的是 `root.join(&normalized)`——**注意不是规范化后的路径**，是"规范化过
`..` 的相对路径拼上 root"。已经存在的路径上若有符号链接，返回值里仍然带着链接。

⚠️ 第 3 步的 `probe` 是 `Option`：`full.canonicalize().ok()` 或父目录规范化都可能失败
（权限、路径过长），失败时 `if let Some(probe)` **整段跳过**——也就是说**第 3 步在
探测不了时是放行的**。第 2 步挡住了 `..`，所以剩下的风险是"探测不了 + 路径里有符号链接"，
这个组合很窄，但它是"失败开放"而不是"失败关闭"，改这里时要意识到。

⚠️ 另一个已知边界：`real_root` 来自 `root.canonicalize().unwrap_or_else(|_| root.to_path_buf())`
——工作区根自己规范化失败时退回原样比。正常情况下 `nota_workspace_open` 存的**已经**是
规范化后的路径，所以这条路基本不会走到。

### 被谁复用

`resolve_in` 是 `pub` 的，除了 `fs.rs` 自己，**`commands/workspace.rs::nota_workspace_tree`
也调它**——前端传来的 `sub_path` 走同一套裁决。这是刻意的：围栏只有一套。

### 测试（5）

| 测试名 | 钉住什么 |
|---|---|
| `普通相对路径能过` | `子目录/a.md` → `root/子目录/a.md` |
| `点开头的清除掉但不越界` | `./子目录/./a.md` 归一成 `子目录/a.md` |
| `绝对路径直接拒` | `/etc/passwd` 报错 |
| `用点点爬出去要拒` | `../逃逸.md` 与 `子目录/../../逃逸.md` 都报错；但 `子目录/../里面.md` **合法**（在里面绕一圈没问题）。注释点明了这是围栏的正题：**写一个还不存在的文件，走不了 canonicalize 那条路** |
| `符号链接指向外面要拒` | 造一个指向工作区外的软链，`链接/偷.md` 报错。⚠️ 造不出软链（平台不支持）时**整个断言被跳过**，测试仍然通过 |

测试用 `临时工作区(tag)` 辅助函数，每个测试一个独立的 `temp_dir()/nota-fs-sandbox-{tag}`，
内部先 `remove_dir_all` 再建 `子目录/`，返回**规范化后**的 root（因为 `resolve_in`
的第三步依赖它）。

---

## `src-tauri/src/lua/api/git.rs`（309 行）

`nota.git` —— 给插件用的 git 能力。

### 文件头的"为什么"要点

**为什么是子进程而不是 libgit2**（与 Folio 的 `fo-git-run.c` 同一个判断）：

- **尊重用户的环境**。凭据助手、`~/.gitconfig`、`includeIf`、hook、`core.autocrlf`、
  签名密钥——libgit2 对这些要么不支持要么各有一套，用户配好的东西会**静默失效**。
- **不用背链接的包袱**。libgit2 是 C 库，交叉编译、静态链接、发行版版本差异全是持续成本，
  而我们并不需要"不用装 git 也能用"。
- **行为与用户敲命令行一致**。出问题时用户能在终端里原样复现，这比什么都值钱。

代价：没装 git 就不能用（报错里说清楚）、每个操作一次进程开销（人对 git 的操作频率下无所谓）。

**围栏三条**：

1. 能力叫 `process.git`，意思是**只能起 git 这一个进程**，不是通用 subprocess；
2. **工作目录锁死**在工作区根（没开工作区就退到活动文档所在目录）；
3. **拒绝会重定向目标目录的那几个参数**（`-C` / `--git-dir` / `--work-tree` / `--namespace`）。
   只锁 cwd 是不够的——`git -C /elsewhere` 一句话就把 cwd 绕过去了。

⚠️ **已知边界（不是漏洞，是记录）**：`git config --global` 这类会写用户全局配置的子命令
挡不住，因为参数层面分不清它跟合法的 `git config --get`。这个能力因此是"能对用户的机器做
git 能做的事"，装插件时该按这个尺度信任。

**两种失败要分开（踩过一次）**：

| 失败种类 | 表现 | 例子 |
|---|---|---|
| **调用错误** | **抛 Lua 错误** | 传了 `-C`、参数不是字符串 |
| **环境不具备** | **正常返回一张结果表** | 没开工作区也没活动文档、没装 git |

理由：调用错误是插件写错了，必须让作者看见，不能让它伪装成一次正常的 git 运行；
而"环境不具备"与 `git status` 在不存在的仓库里失败是同一类事，插件的处理方式也该是同一种。

踩到的正是第二条：`working_dir()` 曾经对"没有工作目录"直接 `Err`，而 git 插件的
`on_load` 结尾要刷一次状态——于是**"用户还没打开文件夹"变成了"这个插件加载失败"**，
侧栏里赫然一行「失败」，而插件本身一个字都没写错。见 `docs/07` BUG-2。

### `const 禁止的参数: &[&str]`

```rust
const 禁止的参数: &[&str] = &["-C", "--git-dir", "--work-tree", "--namespace"];
```

⚠️ 用中文标识符是本仓唯一的例外（`git.rs` 里三个：这个常量、`没有工作目录的结果`、
`挑工作目录`）。跟着改的时候别"顺手改成英文"。

### `pub fn build(lua: &Lua, ctx: &HostContext) -> NotaResult<Table>`

⚠️ 与其它三个子模块不同：`build` **不收 `manifest`**——因为 `nota.git` 整张表只在
`process.git` 被申请时才装，装的时候不需要再判什么。所以它没有"半张表"的问题。

**没有能力开关的两条通用方法：**

| 方法 | 签名 | 返回 |
|---|---|---|
| `run` | `(args: {string}) -> table` | `{code, stdout, stderr, ok}` |
| `status` | `() -> table` | `{code, raw, stderr}` —— 跑 `git status --porcelain=v1 -z -b` |
| `diff` | `(staged: boolean?) -> table` | `{code, text, stderr}` —— `git diff --no-color`，`staged` 为真时加 `--cached` |
| `repo_root` | `() -> string \| nil` | `git rev-parse --show-toplevel` 的输出（`trim` 过）。失败/不知道在哪跑 → `nil`（**不抛错**） |

逐个说：

- **`run(args)`**：`args` 是**字符串数组**（Lua 的序列部分）。`table_to_argv` 逐项检查，
  非字符串 → `RuntimeError("nota.git.run 的参数只能是字符串，收到 {}")`（`type_name()`）。
  然后取工作目录（环境不具备 → `没有工作目录的结果(lua, "stdout", msg)`），
  `run_git` → 造结果表。`ok` 字段是 `out.code == 0`。
- **`status()`**：`--porcelain=v1 -z -b` 是给程序读的稳定格式，不做颜色、不做分页。
  结果是 `raw`（**未解析的原始字节串**），解析成条目是插件自己的事——
  `plugins/git/main.lua` 就是这么干的。
  ⚠️ `status` 的结果表**没有 `ok` 字段**（只有 `code` / `raw` / `stderr`），
  与 `run` 不一致。用 `status` 的插件只能自己判 `code == 0`。
- **`diff(staged)`**：`staged` 省略或 `nil` 当 `false`。
  ⚠️ 同样**没有 `ok` 字段**。
- **`repo_root()`**：环境不具备时 `Ok(None)`（返回 `nil`），因为"不知道在哪儿跑"
  → "不知道仓库在哪"是对同一件事的两种说法；`git` 返回非 0 也是 `nil`。
  ⚠️ 这里能返回 `nil` 而不抛错，是因为它没用 `没有工作目录的结果`——
  也就是说**四条方法里三条在环境不具备时给一张码值非零的表、一条给 `nil`**，
  口径不齐但各有理由（`repo_root` 的返回值本身就是 `string|nil`）。

四条方法的一次调用过程都是：`working_dir(&ctx)` → `run_git(&cwd, &argv)` → `lua_err` 包装
（**这一层会把 `run_git` 的 `NotaError` 抛成 Lua 错误**）→ 造表。

### `fn 没有工作目录的结果(lua: &Lua, text_key: &str, msg: String) -> mlua::Result<Table>`（私有）

「不知道该在哪个目录跑 git」时给插件的那张结果表：

```lua
{ code = -1, [text_key] = "", stderr = msg, ok = false }
```

`text_key` 是这一支自己那个取文本的键名（`run` 是 `"stdout"`、`status` 是 `"raw"`、
`diff` 是 `"text"`）——**空串要给全**：插件拿到的表长得跟成功时一样，
少一个键会让 Lua 那边在 `..` 拼接时炸在 `attempt to concatenate a nil value` 上，
那才是把环境问题伪装成插件 bug 的做法。

### `struct GitOutput`（私有）

`{ code: i32, stdout: String, stderr: String }`。`code` 来自 `out.status.code()`，
**被信号杀掉时 `code()` 是 `None` → 记 `-1`**。

### `fn run_git<S: AsRef<str>>(cwd: &PathBuf, argv: &[S]) -> NotaResult<GitOutput>`（私有）

起一个 `git` 进程。**这是全仓唯一一处起子进程的地方**——加别的之前先读 `docs/11`
的能力表，别顺手把 `process.git` 变成 `process.any`。

泛型收参数是为了内部调用点写 `&["status"]`（`&[&str]`）、插件来的那条路给 `&[String]`，
两边都不用为了对齐类型多转一次。

三步：

1. **围栏检查**：逐个参数比对 `禁止的参数`。命中 → `other("nota.git 不接受 `{arg}`：它会把操作目标改到工作区之外")`；
   另外把每个参数 `split_once('=')`，**头部**命中也要拒（`--git-dir=/x` 这种等号写法）
2. `Command::new("git").args(...).current_dir(cwd)`
3. **三个环境变量**，不要让 git 弹交互式编辑器 / 分页器 / 凭据提示把界面卡死：
   `GIT_TERMINAL_PROMPT=0`、`GIT_PAGER=cat`、`GIT_EDITOR=true`

失败处理：`e.kind() == NotFound` → `other("找不到 `git` 命令，请先安装 git")`，
其余 → `other("起 git 进程失败：{e}")`。

输出用 `String::from_utf8_lossy` 解，**不是**严格 UTF-8（git 的输出可能是任意字节）。

⚠️ 围栏的两个边界：
- 它逐参数比对，所以**值**写成独立参数的形式（`git --git-dir /x` 是 `["--git-dir", "/x"]`）
  会被 `--git-dir` 那一条拦下。等号写法也拦。但 `-C` 的**短选项合并**（`-C/x`，无空格）
  不在检查里——`-C/x` 是一个参数、`split_once('=')` 也不命中，
  所以它会**过围栏**交给 git 执行。⚠️ 这是一条能绕过 cwd 锁定的写法，值得记一笔。
- 检查的是**精确相等**，所以 `--work-treefoo` 之类不命中——不过那也不是 git 的合法参数。

### `fn working_dir(ctx: &HostContext) -> Result<PathBuf, String>`（私有）

从共享状态里取两个候选目录，交给 `挑工作目录` 裁决：

- `ctx.workspace.lock()` 的当前值（`Option<PathBuf>`）
- `ctx.documents.lock().active()` → `.path` → `.parent()`（活动文档所在目录）

⚠️ **它在一次调用里先后锁了 `workspace` 和 `documents`**。`workspace` 不参与锁序，
所以这不构成违反；但 `documents` 这一把是在"已经持有 `plugins`"（走 `nota_plugin_call`
那条路时）的前提下取的，仍然顺着 `plugins → documents` 的方向。改这里的加锁顺序前
先回想 `docs/03` 的锁序表。

### `fn 挑工作目录(workspace: Option<PathBuf>, doc_dir: Option<PathBuf>) -> Result<PathBuf, String>`（私有）

工作目录的**纯裁决**：`workspace.or(doc_dir)`，两个都没有时
`Err("没有工作区、当前文档也没存过盘，不知道要在哪个目录跑 git")`。

与 `fs.rs` 的 `resolve_in()` 同一个理由抽成纯函数：这里是唯一说得出"插件为什么会拿到一张
失败的结果表"的地方，得有单元测试钉住它——**尤其是第三个分支**（两个都没有），
那条正是 BUG-2 的现场。

注意它返回的 `Err` 是 `String` 而不是 `NotaError`——因为调用方（`run`/`status`/`diff`）
要把它**折成一张结果表**而不是抛错，`String` 正好是 `stderr` 要的东西。

### `fn table_to_argv(args: &Table) -> mlua::Result<Vec<String>>`（私有）

Lua 数组 → `Vec<String>`。用 `sequence_values::<Value>()` 只走序列部分（键 `1..n`），
遇到非 `String` → `RuntimeError("nota.git.run 的参数只能是字符串，收到 {}")`。

**参数只收字符串**——收数字/表会让拼命令行的行为变得难预测，而这是安全边界所在，
宁可严一点。⚠️ 副作用：`git log -n 5` 要写成 `{"log", "-n", "5"}`（字符串 `"5"`），
写数字 `5` 会被拒。

⚠️ `sequence_values` 会在第一个 `nil` 处停下，所以数组中间有洞时后面的参数被静默丢掉。

### 测试（6）

| 测试名 | 钉住什么 |
|---|---|
| `重定向目标目录的参数要拒` | `["-C", "/tmp", "status"]` 被围栏拒掉（断言错误消息里含"不接受"，用辅助函数 `被围栏拒了`） |
| `等号写法的重定向同样要拒` | `--git-dir=/tmp/x` 与 `--work-tree=/tmp/x` 都拒 |
| `普通参数不该被围栏误伤` | `["status", "--porcelain=v1"]` **不**被围栏拒（git 自己可能失败，这没关系）。注释：围栏误伤的代价是插件莫名其妙用不了 |
| `开了工作区就用工作区` | `挑工作目录(Some("/工作区"), Some("/文稿"))` → `/工作区` |
| `没工作区就退到文档所在目录` | `挑工作目录(None, Some("/文稿"))` → `/文稿` |
| `两个都没有是环境不具备不是插件坏` | `挑工作目录(None, None)` 返回 `Err` 且消息含"不知道要在哪个目录跑 git"。注释写明它就是 BUG-2 的现场，且**必须是 `Err` 的字符串**（由调用方折成表）而不是"直接抛" |

⚠️ 前三条测试会**真的起 git 进程**（`run_git` 无条件 `Command::new("git")`）。
前两条在围栏那一步就返回了，不起进程；第三条会起。所以**这些测试要求容器/机器上有 `git`**，
没有的话第三条的 `!被围栏拒了` 断言**仍然会通过**（因为 `NotFound` 的错误消息里
没有"不接受"）——测试不会误报失败，但也不会真的验证什么。

---

## `src-tauri/src/lua/api/ui.rs`（288 行）

`nota.ui` —— 插件往外壳里放东西。

### 文件头的"为什么"要点

插件能放三样：**通知**、**面板**、**菜单项**。它们分**两类**，⚠️ **这是本节最要紧的一条**：

| | 是什么 | 怎么走 |
|---|---|---|
| 通知 | 一件**此刻发生**的事 | **推**：`app.emit("nota:notify")` |
| 面板 / 菜单项 | 一份**启动时声明、之后一直成立**的状态 | **拉**：写进 registry，宿主按需读 |

⚠️⚠️ **为什么面板和菜单不能推（BUG-13）**：`register_panel` / `register_menu` 是在
**插件加载时**跑的（`setup()` 阶段），前端那时还没挂载、`listen()` 还没注册。
推出去**没人收，而且不报错**——Tauri 对没有监听者的频道 emit 是**静默成功**的。
症状是"界面看着好好的，只是永远空着"。
修法**不是**"发两遍"或"起来后重放"，而是**根本不要发**。
完整理由（含"重放方案为什么是错的"）见 `plugin/mod.rs::panels` 与 `docs/07` BUG-13。

⚠️ 面板**内容**仍由插件自己推事件填（`nota.event.emit`），宿主不解析 HTML。
这样做在安全上是干净的（前端只渲染我们自己认识的组件），但插件作者得写点前端代码。
纯 Lua 声明式的面板 DSL 排在后面轮次（`docs/07` 第 15 项）——**在那之前面板框里是空的**。

### `pub fn build(lua: &Lua, manifest: &Manifest, ctx: &HostContext) -> NotaResult<Table>`

⚠️ 三个方法**各自按自己的能力单独装**，互不牵连：

| 方法 | 装的条件 | 签名 | 去向 |
|---|---|---|---|
| `notify` | `ui.notify` | `(msg: string, level: string?) -> ()` | 事件 `nota:notify`（**推**） |
| `register_panel` | `ui.panel` | `(spec: table) -> ()` | registry `nota_panels`（**拉**） |
| `register_menu` | `ui.menu` | `(spec: table) -> ()` | registry `nota_menus`（**拉**） |

两个 `register_*` 各自剥成了**不含 `ctx` 的纯函数**（`面板表` / `菜单表`），
理由与 `api/mod.rs::装_ui吗` 同一条：`build()` 要真的 `AppHandle`，用例里构造不出来，
而"**注册进去的东西读得回来吗**"正是 BUG-13 的病灶。剥出来之后用例能拿
`Lua::new()` 把**写的一侧和读的一侧一起**走一遍（见下面的测试表）。

`nota.ui` 这一**整张表**由 `api/mod.rs` 按 `装_ui吗()` 决定装不装——即
**`ui.notify` / `ui.panel` / `ui.menu` 任一条**（`const UI能力` 数组），
而表内每个方法**再各自判一次**——所以申请了 `ui.panel` 但没申请 `ui.menu` 的插件
拿到的 `nota.ui` 上有 `register_panel` 而没有 `register_menu`。**两层判定都要看。**

**`notify`** 的载荷 `{plugin, message, level}`，`level` 过 `normalise_level()`。
⚠️ `plugin` 字段用的是**原始 id**（`nota.git`），不是通道名——与 `nota.event.emit`
的通道名不同，别搞混。

**`register_panel`** 的 `spec` 字段：

| 字段 | 必填 | 默认 | 说明 |
|---|---|---|---|
| `id` | **是** | — | 缺 → `RuntimeError("register_panel 需要 `id` 字段")` |
| `title` | 否 | `id` 的值 | |
| `icon` | 否 | `nil` | 载荷里是 `null` |
| `location` | 否 | **`"right"`** | `right` = 右侧插件栏、`left` = 左侧栏。前端 `ipc.ts` 的类型是 `string`（不是联合）——宿主不拦认不出的值，前端按地址用 |

⚠️ 默认值 2026-09-22 从 `"sidebar"` 改成了 `"right"`：用户定了「插件的话我的想法是右侧边栏」，
而左侧栏那一页已经搬到右边。**改默认值的同时必须改两个内置插件**——
`plugins/git` 与 `plugins/ai` 都写着旧值，不改就会落进右栏的「没有落脚处」那一组（= BUG-14）。

⚠️ 重名（同一个插件里两个面板同 `id`）**报错**，不静默覆盖。理由同 `nota.command.register`：
多半是复制粘贴改漏了；面板这边还多一层——重名会让前端两张卡片抢同一个 React key。

**`register_menu`** 的 `spec` 字段：

| 字段 | 必填 | 默认 | 说明 |
|---|---|---|---|
| `label` | **是** | — | 缺 → `RuntimeError("register_menu 需要 `label` 字段")` |
| `command` | **是** | — | 缺 → `RuntimeError("register_menu 需要 `command` 字段")`。**必须**是插件自己注册过的命令名，前端点下去时按这个名回调宿主 |
| `menu` | 否 | `"plugins"` | 挂到哪个菜单 |
| `accelerator` | 否 | `nil` | 载荷里是 `null` |

⚠️ `register_menu` **不校验 `command` 真的注册过**。写错了要到用户点下去才发现
（错误是"插件 X 没有注册命令 `y`"）。有 `nota_plugin_find_command` 可以事后对账。

⚠️ 重名（同一个插件里两条菜单同 `label`）也**报错**——同一个菜单里两条同名项，
用户分不出该点哪个。

⚠️ **`notify` 那条事件名是硬编码的字符串**，与前端 `ipc.ts` 的 `events` 表是两份手抄的常量。
（面板与菜单**已经不走事件了**，所以这一对常量今天只剩 `notify` 一处要同步。）
改一边必须改另一边，而且**编译器不会告诉你**。

### registry 的名字只定义一处

`REG_PANELS` / `REG_MENUS` 两个 `pub const` 在 `plugin/mod.rs` 里，**写的一侧
（本文件）和读的一侧（`plugin/mod.rs::读面板`/`读菜单`）都引它**。
⚠️ 别在两边各写一遍字面量——那就是又造一对"两处相乘"，症状是界面永远空着且不报错（BUG-13）。

### `fn normalise_level(level: Option<&str>) -> &'static str`（私有）

| 输入 | 输出 |
|---|---|
| `None` | `"info"` |
| `Some("warn")` / `Some("warning")` | `"warn"` |
| `Some("error")` | `"error"` |
| `Some("success")` | `"success"` |
| 其它（包括拼错的） | `"info"` |

认不出的一律当 `info`——**别把插件的笔误变成一次报错**，那会让人为了一个无关紧要的通知
层级去读栈。

### 测试（1）

| 测试名 | 钉住什么 |
|---|---|
| `通知层级归一化` | `None` → `info`、`warn`/`warning` → `warn`、`error` → `error`、**随便写的** → `info` |
| `注册的面板读得回来` | **BUG-13 的回归用例**：走完整来回（`register_panel` 写 registry → `plugin::读面板` 读出来），并钉住不写 `location` 时默认是 `right` |
| `面板不写_title_就拿_id_顶上` | 默认值 |
| `面板重名要报错` | 报错文案含「重复注册面板」，且报错后**不留半条**（读回来还是一个） |
| `没声明过就读回空表` | 没申请能力的插件：两个读函数都返回空表，**不是报错**——报错会让"装了但不带 UI 的插件"看起来像坏了 |
| `注册的菜单项读得回来` | 同面板那条，外加不写 `menu` 时默认 `plugins` |

⚠️ **前四条故意让写的一侧和读的一侧都参与**——只测一头永远测不出 BUG-13 那一类。

---

# 前端

前端的类型定义集中在 `src/bridge/ipc.ts`，组件文件只 import 类型。
⚠️ 所有 interface 与 Rust 侧的结构体是**两份手抄的定义**，字段名一一对应
（Rust 侧 snake_case，前端也是 snake_case —— **没有做驼峰转换**，
`ui_font_size` / `confirm_unsaved` / `content_width` 这些字段名在前端也是下划线）。

---

## `src/main.tsx`（23 行）

React 入口，四件事：

1. `installErrorHooks()` —— 趁早装上（见 `ui/ErrorBoundary.tsx`）
2. `document.getElementById("root")`，找不到直接 `throw new Error("找不到 #root 挂载点；index.html 被改坏了？")`
3. `ReactDOM.createRoot(root).render(<React.StrictMode><App /></React.StrictMode>)`
4. `import "./styles/theme.css"` 与 `"./styles/app.css"`（顺序有意义：主题变量先，应用样式后）

⚠️ `React.StrictMode` 在开发模式下会**把 effect 跑两遍**。`EditorPane` 里那个
`disposed` 判断就是为它写的。

无导出函数（`main.tsx` 没有 export）。

---

## `src/App.tsx`（433 行）

应用外壳：状态编排 + 布局。文件头写明这一层只做三件事——**取数据、派事件、拼布局**；
编辑器的活全在 `ui/EditorPane.tsx`，文件树的活在 `ui/Sidebar.tsx`，别往这里堆。

`export default function App()`，无 props。

### 八个 state + 一个 ref

| 名字 | 类型 | 说明 |
|---|---|---|
| `docs` | `useState<Document[]>([])` | 标签栏、状态栏的数据源 |
| `activeId` | `useState<DocId \| null>(null)` | 决定渲染 `EditorPane` 还是 `Home` |
| `settings` | `useState<Settings \| null>(null)` | `null` = 还没拉到 |
| `workspace` | `useState<string \| null>(null)` | 规范化后的绝对路径 |
| `tree` | `useState<TreeNode[]>([])` | 只有一层（`depth = 1`） |
| `plugins` | `useState<PluginInfo[]>([])` | 插件**清单**（名称/版本/能力/报错） |
| `panels` | `useState<PluginPanel[]>([])` | 插件**声明**的面板。⚠️ 与 `plugins` 是两个来源：清单走 `plugin.list()`，面板走 `plugin.panels()`，**都是启动时一起拉的** |
| `toasts` | `useState<Toast[]>([])` | |
| `editorRef` | `useRef<EditorPaneHandle>(null)` | App 伸手进编辑器的唯一通道 |

### 三个 `useCallback` 工具

| 签名 | 行为 |
|---|---|
| `toast(message: string, level: Toast["level"] = "info") -> void` | 生成一个 `id`（`Math.random().toString(36).slice(2)`），追加到 `toasts`，并按 level 设 TTL：**error 8000ms、其余 3200ms**，到点自动过滤掉。注释：错误留久一点——用户多半要读完再决定怎么办 |
| `refreshDocs() -> Promise<Document[]>` | `api.doc.list()` → `setDocs(list)` → **返回 list**（`closeDoc` 要靠返回值取新活动标签） |
| `refreshTree() -> Promise<void>` | 没有 `workspace` 就 `setTree([])` 并返回；否则 `api.workspace.tree(undefined, 1)`，失败 `toast(String(e), "error")` |

### 五个 `useEffect`

**① 启动**（依赖 `[refreshDocs, toast]`）

```text
Promise.all([api.settings.get(), api.workspace.get(),
             api.plugin.list(), api.plugin.panels()])
  → setSettings / setWorkspace / setPlugins / setPanels
  → await refreshDocs()
失败 → toast(`启动时读取状态失败：${e}`, "error")

然后（无论上面成功与否）：
  await api.frontendReady()   // 失败只 console.warn，不影响使用
```

用一个 `alive` 标志挡住卸载后的 setState；`return` 里把 `alive` 置假。
⚠️ `alive` 只挡了 `Promise.all` 之后的那一段——`refreshDocs()` 的 `setDocs` 在 `alive`
检查之后调用，所以安全；但 `api.frontendReady()` 没有 `alive` 检查（它不改 state，无害）。

**② 事件订阅**（依赖 `[toast, activeId]`）

```text
await Promise.all([
  on<NotifyPayload>(events.notify, (p) => toast(p.message, p.level)),
  on<DocumentChangedPayload>(events.documentChanged, (p) => {
    if (p.origin === "plugin" && p.id === activeId) {
      editorRef.current?.setMarkdown(p.text);
    }
  }),
])
```

- 用 `alive` + `unlisteners` 数组处理"订阅还没完成就卸载了"：完成时若 `alive` 就把
  退订函数收进数组，否则**立刻逐个退订**
- `return` 里退订全部
- ⚠️ **只订了 2 个事件**，而这**是对的**：`events` 里现在也只有这两个（面板与菜单
  已改走"拉"，见 `bridge/ipc.ts`）。⚠️ 别往这里加 `listen` 去等插件的 UI 注册——那类东西
  在插件加载时就注册完了，比这个 effect 早（BUG-13）
- ⚠️ **不去比 revision，直接覆盖**：注释说"能走到这条分支就说明改动不是本编辑器发起的
  （自己发起的不会绕一圈回来）"。判据是 `origin === "plugin"` **且** id 等于当前活动文档
- ⚠️ 依赖里有 `activeId`，所以每次切标签都会整体退订再重订一次。
  重订期间到达的事件会被丢掉

**③ 主题**（依赖 `[settings]`）

```ts
if (settings) applyTheme(settings);
```

⚠️ **`applyTheme` 返回的退订函数被丢掉了**。`ui_mode = auto` 时每次 `settings` 变化都会
再挂一个 `matchMedia` 监听器，旧的不移除。`paint()` 幂等所以功能上不出错，但监听器会累积。

**④ 重取文件树**（依赖 `[refreshTree]`）

```ts
void refreshTree();
```

注释：`refreshTree` 已经依赖 `workspace`，这里不必再列一遍。

**⑤ 快捷键**（依赖 `[activeId, saveDoc, newDoc, openViaDialog, closeDoc]`）

在 `window` 上听 `keydown`：

| 键 | 条件 | 动作 |
|---|---|---|
| `mod = e.ctrlKey \|\| e.metaKey` | **没有 mod 直接 return** | — |
| Ctrl+S | `activeId !== null` | `e.preventDefault()` + `saveDoc(activeId, e.shiftKey)` —— **Ctrl+Shift+S 就是另存为**（`shiftKey` 传成 `forceDialog`） |
| Ctrl+N | — | `newDoc()` |
| Ctrl+O | — | `openViaDialog()` |
| Ctrl+W | `activeId !== null` | `closeDoc(activeId)` |

键名用 `e.key.toLowerCase()` 比，所以大小写不敏感。`return` 里移除监听。

⚠️ 没有 **Ctrl+Shift+1/2/3**（Typora 的侧栏切换）、没有 Ctrl+F、没有 Ctrl+Z 之类的
编辑器内快捷键（那些由 ProseMirror 自己处理，`history` 插件）。

### 五个业务函数（都是 `useCallback`）

| 函数 | 签名 | 行为 / 失败 |
|---|---|---|
| `openPath` | `(path: string) => Promise<void>` | `api.doc.open(path)` → `refreshDocs()` → `setActiveId(id)`。失败 → `toast(String(e), "error")` |
| `newDoc` | `() => Promise<void>` | `api.doc.create()` → `refreshDocs()` → `setActiveId(id)` |
| `saveDoc` | `(id: DocId, forceDialog = false) => Promise<void>` | 见下 |
| `openViaDialog` | `() => Promise<void>` | `openDialog({title:"打开", multiple:false, filters:[{name:"Markdown", extensions:["md","markdown","mdown","mkd","txt"]}]})`，返回字符串才 `openPath(picked)`。**取消不是错误** |
| `openFolder` | `() => Promise<void>` | `openDialog({title:"打开文件夹", directory:true})` → `api.workspace.open(picked)` → `setWorkspace(canonical)` → `api.workspace.tree(undefined, 1)` 直接 `setTree`（**没走 `refreshTree`**） |
| `closeDoc` | `(id: DocId) => Promise<void>` | 见下 |

**`saveDoc` 的流程**：

1. `docs.find(d => d.id === id)`，找不到**静默 return**
2. 若 `forceDialog || !doc.path`：弹 `saveDialog({title:"保存为", defaultPath: doc.path ?? `${doc.title}.md`, filters:[{name:"Markdown", extensions:["md","markdown"]}]})`；
   **用户取消（返回 falsy）→ 直接 return**，不报错
3. `const text = editorRef.current?.getMarkdown()` —— **存盘前强制同步一次**，
   因为镜像可能还差最后几次击键；`text !== undefined` 时 `await api.doc.sync(id, text)`
4. `api.doc.save(id, target)` → `refreshDocs()` → `toast(\`已保存到 ${written}\`, "success")`
5. 失败 → `toast(String(e), "error")`

⚠️ 前端**不自己同步内容再存盘**（Step 4 的 `save` 用的是后端镜像）——这正是 Step 3
存在的理由。漏掉 Step 3 的表现是"保存下来的比屏幕上少最后几个字"。

⚠️ `saveDoc` 依赖 `docs`，所以每次 `docs` 变化它的引用都变，进而让快捷键 effect 重挂
（依赖里有 `saveDoc`）。功能上没问题，是次数上的浪费。

**`closeDoc` 的流程**：

1. 找到 doc，若 `doc.dirty && settings?.confirm_unsaved`：
   **`window.confirm(\`「${doc.title}」有未保存的改动，仍然关闭吗？\`)`**，用户选否就 return
2. `api.doc.close(id)` → `refreshDocs()` → `setActiveId(list.length ? list[list.length - 1]!.id : null)`
   （⚠️ `list[list.length - 1]!` 那个非空断言是 `noUncheckedIndexedAccess` 逼出来的）
3. 失败 → toast

⚠️ 用的是**原生 `window.confirm`**（代码注释：本轮先用原生确认框，自己画一个对话框排在
界面那一轮）。它与 `ui/Toasts.tsx` 里"避开 `alert` 因为它阻塞 WebView、会打断输入法组合态"
的口径不一致——`confirm` 同样阻塞。

⚠️ 关文档**不通知后端活动文档的变化**（只 `setActiveId`），后端 `close` 里自己把活动
切到"列表最后一份"。前端是从 `refreshDocs` 的返回值里取 `list` 最后一份——两边**碰巧**
一致（都取最后一份），但这是两条独立的规则，改一边就会分叉。

### 组件树

```jsx
<ErrorBoundary>
  <div className="app">
    <Toolbar onNew onOpen onOpenFolder onSave hasActive dockOpen onToggleDock />
    <div className="app-body">
      <Sidebar workspace tree docText={activeDoc?.text ?? ""} onOpenFile={openPath} />
      <main className="app-main">
        {activeDoc ? <EditorPane ref={editorRef} key={activeDoc.id} doc={activeDoc}
                                 contentWidth={settings?.content_width ?? 760}
                                 onToast={toast} onDocsChanged={refreshDocs} />
                   : <Home plugins onNew onOpen onOpenFolder />}
      </main>
      {dockOpen && (
        <PluginDock plugins panels onClose={() => setDockOpen(false)} />
      )}
    </div>
    {docs.length > 0 && <TabBar docs activeId onSelect={setActiveId} onClose={closeDoc} />}
    <StatusBar doc={activeDoc} />
    <Toasts items={toasts} onDismiss={…} />
  </div>
</ErrorBoundary>
```

`activeDoc = docs.find(d => d.id === activeId) ?? null`。
⚠️ `EditorPane` 带 `key={activeDoc.id}` —— **换文档就是整组件重挂**，
省得去写"把 A 文档的撤销栈换成 B 的"这种活。

### 三个同文件内的子组件

| 组件 | props | 行为 |
|---|---|---|
| `Toolbar` | `{onNew, onOpen, onOpenFolder, onSave, hasActive}` | 品牌名 + 四个按钮：新建 / 打开 / 打开文件夹 / 保存。**保存**按钮在 `!hasActive` 时 `disabled` |
| `TabBar` | `{docs: Document[], activeId, onSelect, onClose}` | `role="tablist"`。每个标签是一个 `role="tab"` 的 div，内含两个 button：标签名（点击 `onSelect`）与 `×`（点击 `onClose`）。`d.dirty` 时渲染 `<span className="tab-dot" title="有未保存的改动" />` |
| `EditorPane` / `Home` / … | — | 在别的文件里 |

⚠️ `TabBar` 里 `aria-selected` 挂在 div 上、但点击处理在两个内部的 button 上——
键盘导航（左右方向键切标签）今天没有。

---

## `src/bridge/ipc.ts`（161 行）

IPC 桥：**前端唯一允许直接 `invoke` 的地方**。理由不是洁癖：命令名是字符串，散在组件里
改一次要全仓搜；集中在这里还能顺手把返回值的形状标出来（`invoke` 本身是 `any`，
等于把类型安全丢在边界上）。

命名对应关系：`api.doc.save` ↔ Rust 侧 `nota_doc_save` ↔ `commands::document::nota_doc_save`。
⚠️ 文件头自己举的例子写的是 `api.docSave`，**那个名字不存在**（真名是 `api.doc.save`）——
照它写会得到 `undefined is not a function`。以 `api` 里的实际键为准。

### 类型导出

| 名字 | 形状 | 对应 Rust |
|---|---|---|
| `DocId` | `type DocId = number` | `DocId(u64)` |
| `Document` | `{id, path: string\|null, title, text, dirty, revision}` | `document::Document` |
| `TreeNode` | `{name, path, is_dir, children: TreeNode[]\|null}` | `commands::workspace::TreeNode` |
| `UiStyle` | `"auto" \| "adwaita" \| "macos" \| "yaru" \| "windows"` | `settings::UiStyle` |
| `UiMode` | `"auto" \| "light" \| "dark"` | `settings::UiMode` |
| `Settings` | `{ui_style, ui_mode, document_theme, ui_font_size, content_width, confirm_unsaved, autosave_seconds}` | `settings::Settings` |
| `PluginInfo` | `{id, name, version, description, authors, license, capabilities, entry, dir, state: "loaded"\|"failed"\|"disabled", error: string\|null}` | `plugin::PluginInfo` |
| `NotifyPayload` | `{plugin, message, level: "info"\|"warn"\|"error"\|"success"}` | `nota:notify` 的载荷 |
| `DocumentChangedPayload` | `{id: DocId, text: string, origin?: string}` | `nota:document-changed` 的载荷 |
| `PluginPanel` | `{plugin, id, title, icon: string\|null, location: string}` | `nota_plugin_panels` 的返回（**命令，不是事件**）。⚠️ `location` **不收窄成联合类型**——不认识的据点会被 `PluginDock` 放进「没有落脚处」那组，收窄了反而要把不认识的丢掉 |
| `PluginMenuItem` | `{plugin, label, command, menu, accelerator: string\|null}` | `nota_plugin_menus` 的返回（同上） |

⚠️ 改 Rust 侧字段时**必须同批改这里**。两边不一致时 `invoke` 不会报错，只会给你一个
少了字段的对象，然后在某个 `.map` 上炸掉。

⚠️ `Document.path` 在 TS 这边**没有注释**（`TreeNode.path` 有）。真正的要点是：
Rust 侧它是 `Option<PathBuf>`，所以前端一定可能拿到 `null`——**未存盘的新文档就是
`null`**，用之前先判。`TreeNode.children` 同理（`null` 表示"没有子节点/这一层不展开"）。

### `export const api`

一个对象，四组方法 + 一个握手。**全部返回 `Promise`**（`invoke` 的返回值）。

| 组 | 方法 | 对应命令 | 参数映射 |
|---|---|---|---|
| `doc` | `create()` | `nota_doc_new` | 无 |
| | `open(path)` | `nota_doc_open` | `{path}` |
| | `sync(id, text)` | `nota_doc_sync` | `{id, text}`，返回新 revision |
| | `save(id, path?)` | `nota_doc_save` | `{id, path: path ?? null}` —— ⚠️ **显式传 `null`** 而不是省略 |
| | `close(id)` | `nota_doc_close` | `{id}` |
| | `setActive(id)` | `nota_doc_set_active` | ⚠️ 组件里没有调用者 |
| | `get(id)` | `nota_doc_get` | ⚠️ 同上 |
| | `list()` | `nota_doc_list` | |
| | `reload(id)` | `nota_doc_reload` | ⚠️ 没有调用者 |
| | `hasUnsaved()` | `nota_doc_has_unsaved` | ⚠️ 没有调用者 |
| `workspace` | `open(path)` | `nota_workspace_open` | 返回**规范化后**的路径 |
| | `close()` | `nota_workspace_close` | ⚠️ 没有调用者 |
| | `get()` | `nota_workspace_get` | |
| | `tree(subPath?, depth?)` | `nota_workspace_tree` | `{subPath: subPath ?? null, depth: depth ?? 1}`，**默认 depth 是 1** |
| `settings` | `get()` | `nota_settings_get` | |
| | `set(settings)` | `nota_settings_set` | ⚠️ 没有调用者 |
| `plugin` | `list()` | `nota_plugins_list` | |
| | `setEnabled(id, enabled)` | `nota_plugin_set_enabled` | ⚠️ 没有调用者 |
| | `call(plugin, command, args?)` | `nota_plugin_call` | `{plugin, command, args: args ?? null}`。⚠️ 没有调用者 |
| | `findCommand(command)` | `nota_plugin_find_command` | ⚠️ 没有调用者 |
| | `panels()` | `nota_plugin_panels` | **`App.tsx` 启动时拉一次**（与 `list()` 同一个 `Promise.all`）。⚠️ 别改成等事件，见 BUG-13 |
| | `menus()` | `nota_plugin_menus` | ⚠️ 没有调用者——还没有菜单栏（backlog 第 40 项） |
| （顶层） | `frontendReady()` | `nota_frontend_ready` | 启动时调一次 |

⚠️ **参数名是"按名字对上号"的，写错就是静默收到 `None`**，不会报错。
今天全仓唯一一处两边写法不同的就是这个 `tree`：

| | 名字 |
|---|---|
| Rust 形参（`commands/workspace.rs`） | `sub_path` |
| 前端传的键（本文件） | `subPath` |

这条路径**实测是通的**（工作区文件树在 `docs/07` 的"已经真的能用"里），
也就是说 Tauri 2 做了 `camelCase → snake_case` 的换算。但这依赖框架的换算规则，
而且**换算规则只在那一处被用到**——新加命令参数时把两边写成**一模一样**（都用
`snake_case`）再验证一次，别把这个当成可以照抄的写法。

### `export function on<T>(event: string, handler: (payload: T) => void): Promise<UnlistenFn>`

```ts
export function on<T>(event: string, handler: (payload: T) => void): Promise<UnlistenFn> {
  return listen<T>(event, (e) => handler(e.payload));
}
```

订阅一个宿主事件，返回退订函数。**组件卸载时一定要调**——不然热重载几轮之后同一个事件
会有好几个监听者，一次通知弹好几遍。`UnlistenFn` 从 `@tauri-apps/api/event` re-export
（本文件没有显式 re-export，用它的人从原包 import 类型或直接 `() => void`）。

### `export const events`

```ts
export const events = {
  notify: "nota:notify",
  documentChanged: "nota:document-changed",
} as const;
```

⚠️ 这几个字符串与 Rust 侧硬编码的事件名**是两份手抄的常量**，编译器不会对账。

⚠️⚠️ **这里只该有"此刻发生了一件事"的事件。** 曾经还有 `pluginPanel` / `pluginMenu`
两条，前后端连类型都写好了，却**一个订阅者都没有**——插件在 `setup()` 里注册、
前端挂载后才 `listen()`，时序上必漏，而且 Tauri 对没有监听者的频道 emit 是**静默成功**的，
日志里连痕迹都没有（BUG-13）。现在面板与菜单改走 `api.plugin.panels()` / `menus()` **拉**，
两条事件名与两个 `Payload` 类型**已删除**——留着就是下一次踩的坑。

---

## `src/editor/create.ts`（164 行）

编辑器内核：Milkdown（ProseMirror + remark）的封装。

### 文件头的"为什么"要点

- **为什么是 ProseMirror 系而不是「textarea + 高亮装饰」**：Typora 的语义是**文档树**，
  不是"带样式的文本缓冲"。表格拖列宽、图片定尺寸、嵌套列表的层级、脚注引用、
  任务项勾选——这些在文档树上都是**一等的节点**，在文本缓冲上则要一层层拿文本偏移去近似，
  且每次编辑都可能算错。
- Milkdown 底下就是裸 ProseMirror。将来某个节点要下沉到 PM 原语（自定义 schema、
  自定义 plugin），这条路是敞开的——本文件不做任何"只此一家"的封装。
- **真相在哪**：前端是文本的真相。本模块提供 `getMarkdown()` / `setMarkdown()` 两个口子，
  别的模块**不要**直接去摸 `editorViewCtx` 里的 state。

### `export interface EditorHandle`

```ts
export interface EditorHandle {
  getMarkdown: () => string;
  setMarkdown: (markdown: string) => void;
  focus: () => void;
  destroy: () => void;
}
```

| 方法 | 行为 |
|---|---|
| `getMarkdown()` | 用 `serializerCtx` 把 `view.state.doc` 序列化成 markdown 字符串 |
| `setMarkdown(markdown)` | `editor.action(replaceAll(markdown))` —— **整篇替换**。用于打开文件、插件改了文档、放弃修改重载 |
| `focus()` | `ctx.get(editorViewCtx).focus()` |
| `destroy()` | `editor.destroy()`。⚠️ 组件卸载时**必须**调，否则 ProseMirror 的 DOM 监听会留着 |

⚠️ `setMarkdown` 是 `replaceAll`，**不保证失败会报错**：一个语法坏掉的 markdown 不会
报错，remark 会按它的理解尽力解析，结果是"一段看起来对但不完全对的内容"。
所以进编辑器的文本要先过 `parseMarkdown()`（见下）。

### `export interface CreateOptions`

```ts
export interface CreateOptions {
  root: HTMLElement;
  initialMarkdown: string;
  onChange?: (markdown: string) => void;
}
```

`onChange` 的注释说明它**已经在 Milkdown 的 `updated` 钩子里**——调用方拿到后仍要做去抖。

### `export async function createEditor(options: CreateOptions): Promise<EditorHandle>`

`Editor.make().config(...).use(...).create()`。

`config` 里做两件事：`ctx.set(rootCtx, root)`、`ctx.set(defaultValueCtx, initialMarkdown)`，
然后挂文档变化回调：

```ts
ctx.get(listenerCtx).markdownUpdated((_ctx, markdown, prev) => {
  if (markdown !== prev) onChange?.(markdown);
});
```

⚠️ **这里不做去抖**：去抖是调用方的事，因为"多快算太快"取决于它拿这个回调干什么
（存草稿 vs 推给后端 vs 更新字数，三种节奏不一样）。真正做去抖的是 `EditorPane.tsx`
（300ms）。

`use` 的插件清单（**有什么和没有什么一样重要**）：

| 插件 | 来源 | 作用 |
|---|---|---|
| `commonmark` | `@milkdown/kit/preset/commonmark` | CommonMark 语法 |
| `gfm` | `@milkdown/kit/preset/gfm` | 表格、删除线、任务列表等 |
| `history` | `@milkdown/kit/plugin/history` | 撤销栈 |
| `listener` | `@milkdown/kit/plugin/listener` | 提供 `listenerCtx.markdownUpdated` |
| `cursor` | `@milkdown/kit/plugin/cursor` | 光标样式 |
| `clipboard` | `@milkdown/kit/plugin/clipboard` | 剪贴板 |
| `indent` | `@milkdown/kit/plugin/indent` | 列表缩进 |
| `trailing` | `@milkdown/kit/plugin/trailing` | 尾部空段落 |
| `instantRender` | `./instant-render`（本仓） | 光标所在块的 Markdown 标记淡化显示，见下文那节 |
| `prism` | `@milkdown/plugin-prism` | 代码高亮。⚠️ **必须显式写进 `package.json`** |
| `math` | `@milkdown/plugin-math` | 数学公式（katex） |
| `diagram` | `@milkdown/plugin-diagram` | 图表 |

⚠️ 后三个**不在** `@milkdown/kit` 的 `exports` 转发表里，所以都要从各自的包进
（不能写成 `@milkdown/kit/plugin/prism`）。

📌 **更正（2026-09-22）**：本行曾写"`plugin-math` / `plugin-diagram` 是 kit 的间接依赖
（装着），`plugin-prism` **不是**"——**三个都不是**。`@milkdown/kit` 的 `dependencies`
里只有 block / clipboard / cursor / diff / history / indent / listener / slash /
streaming / tooltip / trailing / upload 这 12 个 `plugin-*`，prism、math、diagram
**一个都不在其中**。它们能在 `node_modules` 里被找到，是因为 `package.json` **各自显式
列了**（第 19–21 行）——**三个都得在 `package.json` 里显式写**，漏了就是一句
`Cannot find module`。原句"结论对、理由编"（只有 prism 被点名要显式写），别照抄。

⚠️ **没有** `slash`（斜杠菜单）、没有 `block`（块手柄）、没有 `tooltip`——这些是交互糖，
排在后面对标的轮次里。先装它们会让我们在还没确定自己交互口径时就被它们的默认行为绑住。

### `export function parseMarkdown(editor: Editor, markdown: string): unknown`

```ts
export function parseMarkdown(editor: Editor, markdown: string): unknown {
  return editor.action((ctx) => {
    const parser = ctx.get(parserCtx);
    return parser(markdown);
  });
}
```

把 markdown 文本解析成 ProseMirror 文档（用于校验、或将来做"粘贴前预检"）。
单独导出来是因为那条口径：**任何进编辑器的文本都要先过一遍解析**——直接 `replaceAll`
一个语法坏掉的串，remark 会按它的理解尽力解析，结果不是"报错"而是"一段看起来对但
不完全对的内容"，那种错最难发现。

⚠️ 返回类型是 `unknown`（真实的 PM `Node` 类型没有导出来），而且**它需要外界先持有
`Editor` 实例**——`EditorHandle` 里没有暴露 `editor`，所以调用方拿不到能传进来的 `editor`。
**这个函数今天没有任何调用者**，是给"粘贴前预检"预留的口子。

---

## `src/editor/instant-render.ts`（142 行）

「光标所在块的 Markdown 标记**半透明显示**」那个 ProseMirror 插件。

用户 2026-09-22 提的要求，原话「只输入了两个 ## 则只半透明哦，不是消失」——
Milkdown 默认是**标记一敲完就吃掉**，那两个井号从这个世界上消失；Typora 是
**标记一直都在、只是淡化**，光标离开才连宽度一起收掉。

### 导出

| 名字 | 是什么 |
|---|---|
| `instantRender` | `$prose(() => new Plugin({...}))`，挂进 `create.ts` 的 `use` 链 |
| `MARK_ATTR` | 标记文字走的属性名（`"data-srcmark"`）。**导出来是为了让 CSS 与它有单一出处**——`app.css` 那句 `content: attr(data-srcmark)` 取的就是它 |

内部的 `markerOf(node, parent, index)` 按节点类型给标记：标题 `#`×n、引用 `>`、
列表项 `-` 或 `1.`（**有序列表的序号是父节点和同级位置的信息，node 自己身上没有**，
所以要多传两个参数）、代码块 ` ``` ` + 语言名。返回 `null` 就是不显示（段落、表格等）。

### ⚠️ 为什么是 `Decoration.node` 而不是 `Decoration.widget`

**踩过。** 第一版用 widget 把标记的 `<span>` 插在块内部开头，结果标题、引用、
代码块都正常，**只有列表项错位**——光标在第 1 个列表项里，标记画到了**第 2 个**上。
**位置在块边界上的 widget，落点不由我们说了算**（ProseMirror 要处理"这个位置在哪个
DOM 节点里"的映射，而块首那种位置是有歧义的）。

换成 `Decoration.node`（给块本身挂 class + 属性，标记交给 CSS 的 `::before`）之后
没有第二个元素、也就没有位置歧义。完整诊断过程记在 `docs/07` §4。

### ⚠️ 为什么只有块级

块级标记**本来就该在文档外面**（Typora 里光标本就不能单独钻进 `##` 中间）。
行内标记（`**`、反引号）是另一回事——那个必须让符号**真的存在于文档里**，
要改 schema。见 `docs/07` 第 39 项。

⚠️ 装饰在**每次 state 变化**时重算（含光标移动），故意**不做缓存**：缓存要自己判断
"这次变化影响不影响结果"，判错的代价是标记不跟着光标走——而"跟着光标走"正是这个
功能唯一要做对的事。

---

## `src/styles/applyTheme.ts`（84 行）

把设置里的**三条外观轴**落到 DOM 上：

```text
<html data-ui-style="macos" data-ui-mode="dark" data-doc-theme="github">
```

| 轴 | 属性 | 管什么 |
|---|---|---|
| 界面风格 | `data-ui-style` | 一整套设计语言：控件形状、圆角、间距、动效、字体栈 |
| 明暗 | `data-ui-mode` | 亮/暗。**任何风格下都成立** |
| 文档主题 | `data-doc-theme` | 只管正文。不动外壳一分 |

所以 CSS 的组织方式是 `[data-ui-style="x"]` 定形状、`[data-ui-mode="y"]` 定颜色，
**两者相乘**。写新风格时不要图省事把颜色也塞进 style 里——那样它就没法配暗色了。

### 私有辅助

| 函数 | 行为 |
|---|---|
| `systemPrefersDark() -> boolean` | `window.matchMedia?.("(prefers-color-scheme: dark)").matches ?? false` |
| `detectStyle() -> Exclude<UiStyle, "auto">` | 探"自动"风格该落到哪个具体风格。把 `navigator.userAgent` 与 `guessDesktop()` 拼起来小写后判：含 `kde`/`plasma` → `adwaita`；含 `ubuntu` → `yaru`；**其余一律 `adwaita`**（它是 GNOME 的原生语言，也是 WebKitGTK 下最不出错的一档） |
| `guessDesktop() -> string` | ⚠️ **恒返回空串**（注释：WebKitGTK 不会把桌面环境告诉 JS，没有可靠的同步 API；等接上 XDG portal 的 `color-scheme` 后换掉）。所以 `detectStyle()` 实际上**永远返回 `adwaita`** |
| `resolveMode(mode) -> "light" \| "dark"` | `auto` → 跟 `systemPrefersDark()`；否则原样 |
| `resolveStyle(style) -> string` | `auto` → `detectStyle()`；否则原样 |

⚠️ `detectStyle` 里 `kde`/`plasma` 那一支返回的是 `adwaita` 而**不是**某个 KDE 风格
（枚举里本来也没有 KDE 档），所以那条分支与兜底分支效果相同。留着是为将来加
"Breeze" 之类的档位时有个位置。

### `export function applyTheme(settings: Settings): () => void`

把解析后的三条轴写进 `<html>`，**返回一个退订函数**。

内部的 `paint()` 做四件事：

1. `root.dataset.uiStyle = resolveStyle(settings.ui_style)`
2. `root.dataset.uiMode = resolveMode(settings.ui_mode)`
3. `document_theme` 非空 → `root.dataset.docTheme = settings.document_theme`；
   **空串 → `delete root.dataset.docTheme`**（空串代表"用内置默认主题"，
   把属性去掉、让默认样式接手）
4. `root.style.setProperty("--ui-font-size", \`${settings.ui_font_size}px\`)`

`paint()` 立刻调一次。然后：

- `ui_mode === "auto"` 且 `window.matchMedia` 存在 → 挂 `mq.addEventListener("change", paint)`，
  返回 `() => mq.removeEventListener("change", paint)`
- 否则返回一个 **no-op** `() => {}`

⚠️ 调用方（`App.tsx`）**丢掉了这个返回值**，所以 auto 模式下每次 `settings` 变化都会
多挂一个监听器且从不移除。

⚠️ `--ui-font-size` 用的是 `style.setProperty`（内联样式），而三条轴用 `dataset`
（属性）—— 两者在 CSS 里的优先级不同，写新样式时要意识到字号的来源是内联的。

⚠️ `matchMedia` 全部用了可选链（`window.matchMedia?.`），因为非浏览器环境（测试、
SSR）下它可能不存在。

---

## `src/ui/EditorPane.tsx`（121 行）

编辑区：把 Milkdown 实例接进 React 生命周期。

### 文件头的"为什么"要点

⚠️ **React 不该管编辑器内部的 DOM**。Milkdown（ProseMirror）自己拥有那块 contenteditable，
React 只负责"什么时候挂上去、什么时候拆掉"。想让 React 去 diff 编辑区的内容，
两边会互相覆盖——这类 bug 表现为"打着字光标突然跳走"，而且极难复现。
所以这里用一个**从不重新渲染的空 div** 当挂载点，内容变化一律走 `setMarkdown()`
这条命令式通道。

挂载点在 App 里带 `key={doc.id}`：换文档时整个组件重挂，省得去写"把 A 文档的撤销栈换成
B 的"这种活——重挂就是最干净的换法。

### `export interface EditorPaneHandle`

```ts
export interface EditorPaneHandle {
  getMarkdown: () => string | undefined;
  setMarkdown: (markdown: string) => void;
}
```

**只有两个方法**（比 `EditorHandle` 少了 `focus` / `destroy`——那两个是内部生命周期的事）。
⚠️ `getMarkdown` 返回 `string | undefined`：编辑器还没建好时是 `undefined`。
调用方（`App.tsx::saveDoc`）必须处理这个 `undefined`（它就是靠这个判"还没准备好"）。

### `interface Props`

```ts
interface Props {
  doc: Document;
  contentWidth: number;
  onToast: (message: string, level?: "info" | "warn" | "error" | "success") => void;
  onDocsChanged: () => Promise<unknown>;
  ref?: Ref<EditorPaneHandle>;
}
```

⚠️ `ref` 是**普通 prop**（React 19 的写法，不需要 `forwardRef`）。
`onDocsChanged` 的返回类型是 `Promise<unknown>`（宽松的写法，因为 `refreshDocs`
返回的是 `Promise<Document[]>`）。

### `const SYNC_DEBOUNCE_MS = 300;`

推给后端的去抖间隔。模块级常量，文件里唯一一个可调的数。

### `export function EditorPane({ doc, contentWidth, onToast, onDocsChanged, ref }: Props)`

四个 ref：`mountRef`（挂载 div）、`handleRef`（编辑器句柄）、`timerRef`（去抖定时器）、
`ready`（state，控制"正在准备编辑器…"那行字）。

**`useImperativeHandle(ref, () => ({ getMarkdown, setMarkdown }), [])`** ——
把 handle 暴露给 App，两个方法都是"转发给 `handleRef.current`，没有就什么都不做"。
依赖数组是空的（`handleRef` 是 ref，不需要进依赖）。

**主 effect（依赖 `[doc.id]`）**：

```text
mount = mountRef.current，没有就 return
handle = await createEditor({
  root: mount,
  initialMarkdown: doc.text,
  onChange: (markdown) => {
    清掉旧 timer；timerRef.current = setTimeout(async () => {
      timerRef.current = null;
      try { await api.doc.sync(doc.id, markdown); await onDocsChanged(); }
      catch (e) { onToast(`同步到后端失败：${e}`, "error"); }
    }, 300)
  },
})
if (disposed) { handle.destroy(); return; }   // StrictMode 双跑：第一遍的实例要拆掉
handleRef.current = handle; setReady(true); handle.focus();
catch → onToast(`编辑器启动失败：${e}`, "error")
```

`return`（清理函数）：`disposed = true`、清 timer、`handleRef.current = null`、
`handle?.destroy()`、`setReady(false)`。

⚠️ 四个要点：
- **`if (disposed) { handle.destroy(); return; }` 是 StrictMode 的补丁**。effect 跑两遍时
  第一遍的实例如果已经建好了，这一遍就得把它拆掉，不然页面上会有两个 ProseMirror
- **依赖刻意为 `[doc.id]`，不含 `doc.text`**：`doc.text` 是**初始值**，不是要跟随的状态。
  跟随它是另一回事（那会变成"每 300ms 重挂一次编辑器"）。有一条
  `// eslint-disable-next-line react-hooks/exhaustive-deps` 把这个意图写在代码里
- `setTimeout` 的回调**在组件卸载后仍可能触发**（清理函数清了 timer，所以不会；
  但 `finally` 里没有 `disposed` 检查——真跑到的话 `onDocsChanged` 会对已卸载的组件
  `setState`，React 18+ 不报错，只是白做一次请求）
- **去抖只在 `onChange` 里**。`getMarkdown()` 那条路（存盘前的强制同步）**不去抖**，
  直接调

**渲染**：

```jsx
<div className="editor-pane">
  {!ready && <div className="editor-loading">正在准备编辑器…</div>}
  <div ref={mountRef} className="editor-mount"
       style={{ ["--content-width" as string]: `${contentWidth}px` }} />
</div>
```

⚠️ `style` 里那个 `["--content-width" as string]` 的写法是为了让 TS 接受自定义 CSS 变量
（`CSSProperties` 不认 `--` 开头的键）。挂载 div 上**不渲染任何 children**——
"React 永不往里渲染"这条纪律就体现在这里。

⚠️ `EditorPane` 里**没有调用 `api.doc.setActive`**——切标签时后端不知道。
见 `docs/01-architecture.md` 的前端遗留项。

---

## `src/ui/Sidebar.tsx`（136 行）

左侧栏：**文件树 / 大纲** 两页。对标 Typora 的侧栏（它的快捷键是 Ctrl+Shift+1/2/3
切文件树/文档列表/大纲）。"文档列表"（最近打开的文档）排在后面。

⚠️ **原本这里是三页，第三页「插件」2026-09-22 搬到了右边**（`ui/PluginDock.tsx`）——
这一栏只管**文档导航**，工具面板不跟它挤。所以 `Tab` 也从三个值收成两个。

### `type Tab = "tree" | "outline";`（模块内，未导出）

### `export function Sidebar({ workspace, tree, docText, onOpenFile }: Props)`

props：

| prop | 类型 | 用途 |
|---|---|---|
| `workspace` | `string \| null` | `null` → 文件树页显示"还没打开文件夹" |
| `tree` | `TreeNode[]` | **只有一层**（App 只请求 `depth = 1`） |
| `docText` | `string` | 当前文档正文，用来抽大纲 |
| `onOpenFile` | `(path: string) => void` | 接的是 `App.openPath`，传的是**绝对路径** |

⚠️ **`plugins` 这个 prop 2026-09-22 拿掉了**——插件那一页搬去了右边的 `PluginDock`。

内部：`const [tab, setTab] = useState<Tab>("tree")`（默认文件树页）、
`const outline = useMemo(() => extractOutline(docText), [docText])`。

渲染结构：`<aside className="sidebar">` 里一个 `role="tablist"` 的 nav（两个 `TabButton`）
+ `<div className="sidebar-body">`（按 `tab` 二选一）。

⚠️ `tab` 是**组件内 state**，不持久化，也不受外部控制——所以没有"从外部切页"
这条路（Ctrl+Shift+1/2/3 也因此没做）。

### 私有子组件

| 组件 | props | 行为 |
|---|---|---|
| `TabButton` | `{id: Tab, current: Tab, onSelect, label}` | `role="tab"` 的 button，`aria-selected` 与 `className` 按 `current === id` 定 |
| `FileTree` | `{nodes: TreeNode[], workspace: string, onOpenFile}` | 空时显示"这个文件夹里没有 Markdown 文件。"，否则 `<ul className="tree">` + 每项一个 `TreeNodeRow` |
| `TreeNodeRow` | `{node, workspace, onOpenFile}` | 见下 |

**`TreeNodeRow`** —— 目录与文件两条完全不同的路：

- **目录**：`<li className="tree-dir"><span className="tree-dir-name">{node.name}</span></li>`
  ⚠️ 就是一行不可点的文字。注释写着"本轮只列一层；展开时按需再取"——
  也就是说**目录展开这件功能今天没有**，`nota_workspace_tree` 的 `depth > 1` 也没有调用者
- **文件**：`<button title={\`${workspace}/${node.path}\`} onClick={() => onOpenFile(\`${workspace}/${node.path}\`)}>`
  ⚠️ **前端自己拼绝对路径**（`workspace + "/" + node.path`），不用 `path.join`、
  也不做规范化。`node.path` 是后端保证的 `/` 分隔相对路径，所以拼出来能用；
  但这是一个"两份路径规则"的地方——后端用 `Path::join`，前端用字符串相加

---

## `src/ui/PluginDock.tsx`（121 行）

**右侧插件栏**。用户 2026-09-22 定的：「插件的话我的想法是右侧边栏。」

文件头记的是**为什么分左右**：左边那条是**文档导航**（文件树、大纲），写东西时一直在用，
得贴着正文；插件是**工具面**（Git 的暂存区、AI 的对话框），是"看着正文顺便操作"的东西。
两者的**使用节奏不同**，挤在一列里就要来回切页。

### `export function PluginDock({ plugins, panels, onClose }: Props)`

| prop | 类型 | 用途 |
|---|---|---|
| `plugins` | `PluginInfo[]` | 「已装插件」那一组的内容 |
| `panels` | `PluginPanel[]` | 插件**声明**的面板，`App.tsx` 启动时拉一次 |
| `onClose` | `() => void` | 接的是 `App.setDockOpen(false)` |

渲染结构：`<aside className="plugin-dock">` → `nav.dock-head`（标题「插件」+ `×`）
+ `div.dock-body`，里面**三组**（顺序就是这个顺序）：

| 组 | 选择器 | 内容 |
|---|---|---|
| 面板 | `section.dock-panels` → `article.panel` | `location === "right"` 的面板，每张一个标题栏 + 面板体 |
| 没有落脚处 | `section.dock-orphans` | `location` 不是 `right` 的面板，逐条列出并标出它声明的 `location` |
| 已装插件 | `h4.dock-subtitle` + `ul.plugins` | 原有的插件清单（名称/版本/能力/报错） |

⚠️ **面板体里今天是「面板内容尚未接入。」这一行字，不是假界面。**
面板**内容**机制还没有（要等 `docs/07` 第 15 项的声明式 DSL），所以如实写出来——
**做一个看着能用、点下去没反应的假面板，比空着更糟**。

⚠️ **「没有落脚处」那一组是刻意加的，不是凑数。** 它保证"插件声明了的东西不会
静默消失"。**它是当场就收回成本的**：接上面板后界面上立刻多出一组
（`AI` / `sidebar`），暴露出两个内置插件还在写旧的位置值——见 BUG-14。
`key` 用的是 `` `${p.plugin}/${p.id}` ``：面板 id **只在插件内部唯一**，
两个插件都叫 `main` 是合法的。

⚠️ **`li.plugin` 那一套渲染是 2026-09-22 从 `Sidebar.tsx` 的 `PluginList` 原样搬过来的**
（连同 CSS 类名 `plugin-head` / `plugin-id` / `plugin-caps`）——样式在 `app.css` 里没动。
⚠️ **没有启用/禁用开关**：`api.plugin.setEnabled` 有命令有桥接，但界面上依然没有入口。
⚠️ 开关一旦做出来，**禁用/启用之后要重拉 `panels()`**——`PluginHost::生效的()` 是按
"加载成功且没被禁用"筛的，禁用之后那家的面板该从清单里消失（`ipc.ts` 里也留了这句）。

---

## `src/ui/Home.tsx`（70 行）

主页（没有文档打开时显示的那一屏）。

文件头：布局参照 Typora 的空闲屏：左边是标识 + 三个大动作，右边一列是插件状态。
**不做"最近文件"列表**——那要先把最近文件的存取做出来（`docs/07` 第 9 项），
与其画一个空列表占位，不如先不画。

### `export function Home({ plugins, onNew, onOpen, onOpenFolder }: Props)`

props：`{plugins: PluginInfo[], onNew: () => void, onOpen: () => void, onOpenFolder: () => void}`。

内部只算一件事：`const failed = plugins.filter((p) => p.state === "failed")`。

渲染：

| 区域 | 内容 |
|---|---|
| `home-main` | `h1` 品牌名、`home-lead` 一句话、`home-actions` 三个按钮（新建文档 / 打开文件 / 打开文件夹），每个按钮带一行 hint（`Ctrl+N` / `Ctrl+O` / "把一整个目录当工作区"） |
| `home-side` | `h2` 「插件」+ 插件列表（名字 + 状态文字），或"没有发现插件。" |
| 底部条件块 | `failed.length > 0` 时显示"有 N 个插件没能加载，详情见右侧「插件」栏。"（⚠️ 2026-09-22 从「左侧…页」改成「右侧…栏」，因为插件那一页搬去 `PluginDock` 了） |

状态文字是**前端翻的**：`loaded → 已加载`、`disabled → 已禁用`、其余 → `失败`。
（`PluginDock` 的插件栏显示的是原始的 `p.state`，两处不一致但都是刻意的——
主页要给人看，侧栏是详情。）

注释点明了为什么要这块警告：**插件加载失败要显眼**。静默失败的表现是"这个插件装了怎么
没反应"，用户会去怀疑自己装错了，而不是来看这里。

---

## `src/ui/StatusBar.tsx`（38 行）

状态栏。对标 Typora 底栏：左侧文件信息，右侧字数统计。

### `export function StatusBar({ doc }: { doc: Document | null })`

`const counts = useMemo(() => countText(doc?.text ?? ""), [doc?.text])`。

- `doc === null` → 只渲染一行"就绪"
- 否则：左侧是**路径**（`title` 属性上也是路径，未保存时是"尚未保存"），`doc.dirty` 时
  追加 `<span className="status-dirty">● 已修改</span>`；右侧四项：
  `{counts.words} 词`、`{counts.characters} 字符`、`{counts.lines} 行`、
  `约 {counts.readingMinutes} 分钟`

⚠️ 前三个 span 各有 `title` 解释口径（"词数（中文按字计）"、"字符数（按码点计）"、
"按每分钟 250 词粗略估算"）——那是给用户的说明，与 `outline.ts` 里的口径必须一致。

⚠️ 字数取自 `doc.text`，也就是**后端镜像**（300ms 滞后）。快速打字时状态栏的数字会比
屏幕上少一点点。

---

## `src/ui/Toasts.tsx`（39 行）

右下角的临时提示。

文件头：**自己画而不是用 `window.alert`**——alert 会**阻塞整个 WebView**，
在编辑器里打字打到一半弹一个 alert，输入法组合态会被打断。

### `export interface Toast`

```ts
export interface Toast {
  id: string;
  message: string;
  level: "info" | "warn" | "error" | "success";
}
```

### `export function Toasts({ items, onDismiss }: Props)`

`Props = {items: Toast[], onDismiss: (id: string) => void}`。

`items.length === 0` 时返回 `null`（不渲染容器）。否则一个
`<div className="toasts" role="status" aria-live="polite">`，每项
`div.toast.toast-{level}`（消息 + 一个 `×` 按钮调 `onDismiss(t.id)`）。

⚠️ `role="status"` + `aria-live="polite"` 让读屏软件能播报——这是它自己画的另一个理由。

⚠️ 自动消失的定时器**在 `App.tsx` 的 `toast()` 里**（`window.setTimeout`），
不在本组件里。所以本组件是纯展示的，没有副作用、没有 state。

⚠️ 与 `App.tsx::closeDoc` 里的 `window.confirm` 口径不一致（那边为省事用了阻塞式原生框）。

---

## `src/ui/ErrorBoundary.tsx`（69 行）

全局错误兜底。做两件事：

1. React 渲染期抛错 → 显示一屏能读的错误，而不是白屏；
2. 未捕获的 Promise 拒绝 / 全局错误 → 打到控制台（打包后仍走 journal，
   用户可以 `journalctl` 捞到）。

### `class ErrorBoundary extends Component<Props, State>`

```ts
interface Props { children: ReactNode; }
interface State { error: Error | null; info: ErrorInfo | null; }
```

| 成员 | 行为 |
|---|---|
| `state` | 初值 `{ error: null, info: null }` |
| `static getDerivedStateFromError(error: Error): Partial<State>` | 返回 `{ error }`（这是 React 要求的静态方法，渲染期抛错时被调） |
| `componentDidCatch(error: Error, info: ErrorInfo)` | `console.error("[nota] 渲染出错：", error, info.componentStack)`，再 `setState({ info })` |
| `render()` | `error` 为 `null` → 直接渲染 children（**正常路径零开销**）。否则渲染一屏：`h1 界面出了点问题` + 一句说明（"你正在编辑的内容还在后端存着，没有丢。可以先把下面这段信息记下来，然后重启 Nota。"）+ `<pre>` 里的错误消息与组件栈 + 一个「试着继续」按钮（`setState({ error: null, info: null })`） |

⚠️ 那句"你正在编辑的内容还在后端存着，没有丢"是**基于镜像的去抖延迟说的**：
真崩溃时最近 300ms 内的击键**可能**还没推给后端。这是一句善意但不完全准确的安慰话，
改文案时要知道。

⚠️ 「试着继续」只清了 `error`，**不重建子树的状态**——如果错误是确定性的，
下一次渲染会再崩一次。

⚠️ 边界只兜**渲染期**的错误。事件处理函数里抛的、`await` 之后抛的都不会走到这里
（所以才有下面那个 `installErrorHooks`）。

### `export function installErrorHooks()`

```ts
export function installErrorHooks() {
  window.addEventListener("unhandledrejection", (e) => {
    console.error("[nota] 未处理的 Promise 拒绝：", e.reason);
  });
  window.addEventListener("error", (e) => {
    console.error("[nota] 全局错误：", e.error ?? e.message);
  });
}
```

`main.tsx` 启动时调一次。⚠️ **两个钩子都只 `console.error`，不给用户任何提示**——
打包后的应用没有 devtools，用户看不到，只能靠 `journalctl` 捞。
（`e.error ?? e.message` 的兜底是因为 `error` 事件里的 `error` 在跨域脚本等情况下可能是
`undefined`。）

---

## `src/ui/outline.ts`（128 行）

大纲与字数的**纯函数**。没有 React、没有副作用，是前端唯一适合做单元测试的文件
（⚠️ 但今天**没有测试**）。

### 文件头的"为什么"要点

**为什么在前端用正则扫，而不是问后端要**：后端也有 markdown（镜像），但**镜像是去抖的**
——打字时它会慢 300ms。大纲要跟着光标附近的标题实时跳，用那份数据会看到明显的一顿一顿。
前端手里就是最新的文本，扫一遍是 O(行数)，几千行的文档也就微秒级。

⚠️ 这是**启发式**，不是真解析。它认不出 HTML 块里的 `#`、也认不出缩进代码块
（四空格那种）里的 `#`。真解析要过 remark，而为一个侧栏列表引入完整 AST 不划算。

### `export interface OutlineItem`

```ts
export interface OutlineItem {
  level: number;
  text: string;
  line: number;
}
```

`line` 是**在正文里的行号（0 起）**，注释写着"将来做'点了跳过去'要用"——
⚠️ 也就是说**这个字段今天只被用作 React 的 key**（`key={`${h.line}-${i}`}`），
点击跳转没做。

### `export function extractOutline(markdown: string): OutlineItem[]`

逐行扫，两个状态标志：

| 规则 | 细节 |
|---|---|
| front matter | **只在 `i === 0` 且该行 `trimEnd() === "---"` 时**进入，到下一个 `---` 或 `...` 结束。整段 `continue`，里面的 `#` 不看 |
| 围栏代码块 | `trimStart()` 后以 ` ``` ` 或 `~~~` 开头就翻转 `inFence`，`continue`；`inFence` 为真时整行跳过 |
| ATX 标题 | 正则 `/^(#{1,6})\s+(.*)$/` 匹配 `trimStart()` 后的行 |
| 标题文本 | `m[2].trim().replace(/\s*#+\s*$/, "").trim()` —— 去掉**收尾的一串 `#`** |
| 空文本 | 文本为空就**不收**（`continue`） |
| 结果 | `{ level: m[1].length, text, line: i }` |

⚠️ 与后端 `document/mod.rs::first_heading` 是**两套独立的实现**，口径有细微差别：
- 后端的 `strip_atx` 对 `#` 单独一行返回**空串**（`rest.trim()`），前端会因为 `!text` 跳过
- 后端的围栏判断是 `line.trim_start()` 后看前缀，两处一致
- 前端的 `/^(#{1,6})\s+(.*)$/` 要求 `#` 后至少**一个空白**，与后端 `rest.starts_with(' ')`
  一致
- ⚠️ 但前端的 `\s+` 接受制表符与全角空格等，后端只认**半角空格**。所以
  `#\t标题` 在前端是大纲项、在后端不是标题。这是"两份实现"的典型代价

### `export interface Counts`

```ts
export interface Counts {
  characters: number;
  words: number;
  lines: number;
  readingMinutes: number;
}
```

### `function isCjk(cp: number): boolean`（私有）

粗略判一个码点算不算 CJK。包含的区间：日文假名 `0x3040-0x30ff`、扩展 A `0x3400-0x4dbf`、
基本汉字 `0x4e00-0x9fff`、兼容汉字 `0xf900-0xfaff`、谚文 `0xac00-0xd7af`、
扩展 B~F `0x20000-0x2ebef`。

⚠️ 注释说"含中日韩、全角标点"，但**区间里没有全角标点区**（`0xff00-0xffef` 不在其中）
——全角逗号句号会被算成"其它字符"（走标点分支）。注释与实现对不上。

⚠️ 码点是**单个**的，扩展 B~F 那些（`> 0xFFFF`）在 `for (const ch of run)` 里是一个
两码元的字符串，`ch.codePointAt(0)` 能正确取出码点，所以这个判断是准的。

### `export function countText(markdown: string): Counts`

口径（对齐 Typora 的状态栏）：

- **字符数**按**码点**算：`[...markdown].length`，不是 UTF-16 码元——否则一个 emoji 会被
  算成 2，一个字的中文倒是对的（1）。混排时两种算法的差会让人对不上数。
- **词数**：先 `markdown.split(/\s+/)` 切块，再逐字符扫每一块：
  - CJK 码点 → 先把攒着的 `latinBuf` 收成一个词，然后**自己算一个词**（逐字算一个词）
  - `/[\p{L}\p{N}'’-]/u` 命中（字母/数字/撇号/连字符）→ 攒进 `latinBuf`
  - 其它（标点）→ 把 `latinBuf` 收掉
  - 块尾再收一次
- **行数**：空串算 **0** 行；否则 `split("\n").length`
- **阅读分钟**：`Math.max(1, Math.round(words / 250))`。注释：200 词/分钟是英文的常见估算，
  中文按字算的话 300 更接近，这里不细分语种、取 250 作为折中，**只当作粗略参考**

⚠️ 三个要知道的：
- 字符数是**含 markdown 语法**的（`# 标题` 算 4 个字符、`**粗体**` 算 6 个）。
  没有"去标记后的字数"这条口径
- 行数按 `\n` 切，所以**末尾的换行会多算一行**（`"a\n"` → 2 行）
- 词数对纯中文的文档约等于字数（每个汉字一个词）——这正是注释里"中英混排下最贴近
  直觉的口径"的意思

---

## 相关文档

| 要查什么 | 去哪 |
|---|---|
| 启动顺序、锁序、两条通道、插件分层 | `docs/01-architecture.md` |
| 字段级的数据结构、常量、两条真相口径 | `docs/03-data-structures.md` |
| 编辑器装配与去抖/整篇替换语义 | `docs/05-editor-bridge.md` |
| 已知缺陷与 backlog（编号） | `docs/07-feature-status.md` |
| 能力表与怎么写插件 | `docs/11-writing-a-plugin.md`、`docs/13-lua-api.md` |
