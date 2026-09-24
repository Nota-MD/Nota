# AGENTS.md — Nota 开发入口（AI 智能体与人类必读）

> 本文件是**唯一入口**。任何 AI 智能体或人类在修改本仓库前，必须先读本文件，
> 再按需阅读 `docs/` 下的对应文档。目标是：**不读源码也能开始开发**。

---

## 0. 硬性规则（不可跳过）

1. **先读文档，再改代码。** 至少阅读：
   - `docs/01-architecture.md`（整体架构）
   - `docs/02-modules.md`（要改的模块）
   - `docs/07-feature-status.md`（当前哪些能用、哪些是空壳、有哪些已知缺陷）
   - 需要新增 UI/功能时，读 `docs/08-development-guide.md`。
2. **改完代码必须同步文档。** 这不是建议，是完成定义（Definition of Done）的一部分。
   映射关系见 `docs/09-doc-sync-policy.md`。提交前运行 `tools/doc-sync-check.sh` 自检。
3. **不要假设某个按钮能用。** 先查 `docs/07-feature-status.md` 与 `docs/04-ui-map.md`。
4. **不要凭猜测写接口。** 公开函数签名以 `docs/02-modules.md` 为准；
   若文档与代码不一致，**以代码为准并立即修正文档**。
5. **提交 GitHub 之前，不必兼容老文件 / 老插件 / 老接口**（沿用 Folio 同一条口径）。
   改清单格式、改 Lua API、改设置项的键——**直接改**，同一批把插件、前端、用例、
   文档一起改到新形状即可。
   **触发条件（这条会到期）**：只在**首次提交到 GitHub 之前**成立。一旦对外发布
   它就作废，从那以后老文档要能开、老插件要能加载。
   ⚠️ **它不豁免"同一批必须全改干净"**：留着半新半旧两套形状比"不兼容"更糟。
6. **任何 `.rs` / `.ts` / `.tsx` / `.lua` / `.css` / `.sh` 文件不得超过 1000 行**，
   超了就地拆分（口径见 `docs/08-development-guide.md` §1.1）。`tools/doc-sync-check.sh`
   会检查，**到 900 行就报 WARN**——那条 WARN 是提醒你**现在就规划怎么拆**，
   不是"还能再写 100 行"（`src/App.tsx` 就是这么从 1118 行拆回来的）。

---

## 1. 项目是什么

**Nota** 是一个 **Tauri 2** 桌面 Markdown 编辑器，**功能对标 Typora**
（逐项对照矩阵在 `docs/10-typora-parity.md`），带 **Lua 插件系统**、**AI 助手插件**
与 **Git 版本控制插件**。

- 后端：Rust（`src-tauri/`），Tauri 2
- 前端：React 19 + TypeScript + Vite，编辑器内核是 **Milkdown 7**（ProseMirror + remark）
- 插件：**Lua 5.4**（mlua，`vendored`），每个插件一个**独立的 Lua 状态**
- 应用 ID：`io.github.nota.Nota`
- 版本：`0.1.0`（`src-tauri/Cargo.toml` 与 `package.json` 两处）
- 代码注释与文档使用中文；界面字符串目前直接写中文（**尚未接 i18n**，见 `docs/07`）

**名字**：Nota 是意大利语「笔记」，与工作区里的 Folio（对开本）/ Fascia（幻灯片）/
Forma（表格）同一家族。项目结构参照 Folio。

### 与 Folio 的关键差别（别照搬那边的结论）

| 维度 | Folio | Nota |
|---|---|---|
| 界面层 | GTK4 + libadwaita（原生控件） | **WebView 里的 HTML/CSS**（`src/ui/*.tsx`） |
| 编辑区 | WebKitGTK 6 里的 `contenteditable` | **WebKitGTK 4.1 里的 ProseMirror 文档树** |
| 插件 | 进程内 C ABI（`.so`），**无沙箱** | **Lua 状态隔离 + 能力白名单**（宿主 API 按能力装配） |
| 文档模型 | HTML（`.htd` / `.htdp`），格式表由插件认领 | **Markdown 纯文本**，无格式表 |
| 构建 | Meson + Ninja | Cargo + npm/Vite |

⚠️ **最要紧的一条**：Folio 的 `FoWindow` **不是 GObject**、`use-markup` 默认 TRUE 这类
坑在 Nota 里**都不存在**（没有 GTK 控件树）。反过来 Nota 有自己的坑，见 §4b。

---

## 2. 代码地图（一句话）

### 后端 `src-tauri/src/`

| 文件 | 职责 |
|---|---|
| `main.rs` | 进程入口，只是 `nota_lib::run()` 的一层壳 |
| `lib.rs` | `run()`：建 Tauri、装 dialog/fs/opener 插件、`setup()` 里**按顺序**做三件事（载设置 → 建共享状态 → 发现并加载插件）→ `manage(AppState)`；全部 `nota_*` 命令的注册表；`on_window_event` 在窗口销毁时 `unload_all()` |
| `error.rs` | `NotaError` 枚举，**中文 Display 消息**，自定义 `Serialize` 以便过 Tauri IPC |
| `paths.rs` | XDG 目录（`~/.config/nota`、`~/.local/share/nota`）、`settings_file()`、`user_plugins_dir()`、`builtin_plugins_dirs()`（debug 构建额外返回仓库的 `plugins/`）、`user_themes_dir()`（⚠️ **只有这一个主题目录**，Typora 那两处已按版权要求停止扫描） |
| `state.rs` | `AppState`：四个共享句柄。**锁顺序不变量写在文件头**（`plugins → documents → settings`） |
| `settings.rs` | `Settings` 与三条**互相独立**的外观轴（`ui_style` / `ui_mode` / `document_theme`），kebab-case 落盘 |
| `document/mod.rs` | `DocId` / `Document` / `DocumentStore`；`derive_title()`（front matter → 一级标题 → 文件名）；**「前端是文本的唯一真相、后端持有 300ms 镜像」这条口径写在文件头**。⚠️ `untitled_index`（未命名序号，建时定死）与 `clean_text`（比脏标记的那一份）不许省 |
| `commands/mod.rs` | 命令模块的表；只有 `pub mod` 声明，没有逻辑 |
| `commands/document.rs` | `nota_doc_*` 十一个命令。⚠️ `settle` 是唯一一个**不当作编辑**的写入口（装载后的规范化认领），它有测试盯着，别合并进 `sync`） |
| `commands/workspace.rs` | `nota_workspace_*` 四个命令 + `TreeNode`（**相对路径、`/` 分隔**） |
| `commands/settings.rs` | `nota_settings_get/set`（整份替换；保存失败则回滚内存） |
| `commands/plugin.rs` | `nota_plugins_list` / `nota_plugin_set_enabled` / `nota_plugin_call` / `nota_plugin_find_command` |
| `commands/menu.rs` | `nota_native_menu_apply` 一条，转给 `native_menu.rs`。⚠️ 返回值是**"挂上了没有"**，前端据此决定藏不藏自绘菜单栏——不要改成按平台判断 |
| `slidev.rs` | Slidev 预览服务器的生命周期：**挑端口 → 写入口文件 → 起进程（自成进程组）→ 探活 → 收摊**。⚠️ 入口写在**文档所在目录**（Slidev 拿它的父目录当项目根，相对图片才解析得对），未存盘才退回数据目录；⚠️ 杀的是**整个进程组**；⚠️ 四条实测结论（只绑 `[::1]`、必须有可解析的主题、点文件入口可用且热更新会触发、`--no-open` 而非 `--open false`）都在文件头。调试口子 `NOTA_SLIDEV_CMD` |
| `slidev_probe.rs` | 「本机装没装 Slidev」（2026-09-24 从 `slidev.rs` 拆出）：跑 `start` 会跑的那条**同一条命令**、**同一个 cwd**，末尾加 `--version`，npm 上 `npm_config_offline=true`（⚠️ **不许联网、不许变重**：缓存命中 1.3 秒、没命中 0.26 秒；挂住时 20 秒连**进程组**一起杀）。⚠️ 判据两条同时成立：CLI 离线拿得到 **且** 文档目录**向上**找得到 `node_modules/@slidev/theme-*`（`@slidev/cli` 不自带主题） |
| `commands/slidev.rs` | `nota_slidev_*` 八条：`start` / `probe_install` / `probe` / `log` / `status` / `open_window` / `sync` / `stop`。⚠️ `probe_install` 是唯一**异步**的一条（探测要起进程、最长 20 秒，走 `spawn_blocking`），且**不改任何状态**。⚠️ 全是**短命令**：`start` 起来就返回，端口通没通由前端 500ms 一次 `probe`（后端同步命令跑在主线程，在后端等 = 冻界面）。⚠️ `stop` 里先 `slidev::stop` 再 `close_window`，顺序反了会因**同线程重入同一把锁**卡死 |
| `themes.rs` | **文档主题**：内置六套（`src/styles/themes/*.css`，`include_str!` 编进二进制）＋ 用户放进 `~/.config/nota/themes/` 的（**同名覆盖内置**）。⚠️ `check_id` 是安全边界：id 只放行 ASCII 字母数字与 `-` `_`，因为路径是拿它拼的。⛔ **不兼容也不内置 Typora 主题**（版权） |
| `commands/theme.rs` | `nota_doc_themes` / `nota_doc_theme_css` / `nota_doc_themes_dir` 三条。⚠️ 入参是 **id 不是路径**——路径由后端自己拼，前端没有"读任意文件"的能力 |
| `commands/export.rs` | 导出与打印的 **IO 那半**（2026-09-24）：`nota_export_write`（写一段文本到指定路径）与 `nota_export_print`（写成 HTML → 交给系统默认程序）。⚠️ **这一层不认识 Markdown 也不认识 HTML**，生成在前端（`editor/export.ts`）——搬过来就是把渲染引擎实现两遍。⚠️ 打印落点跟**文档自己的目录**（相对路径的图片才解析得对），固定名 `.nota-print.html`、点号开头默认隐藏；⚠️ 打印**不是** `window.print()`，理由在文件头 |
| `plugin/mod.rs` | `PluginHost`：**发现 → 加载 → 派发 → 卸载**；`PluginInfo` 是给前端的只读快照 |
| `plugin/manifest.rs` | `Capability` 枚举、`PluginMeta`、`Manifest`、`NOTA_PLUGIN_API_VERSION`、**`channel_id()`**（事件通道名归一化） |
| `lua/mod.rs` | `HostContext` / `LuaPlugin` / `PluginState`；一个插件一个 `Lua` |
| `lua/api/mod.rs` | `nota` 表的构造：**按清单声明的能力决定装哪些子表**；辅助函数 `lua_err` / `lua_to_json`。⚠️ **本文件里没有"装了但不能用"的表**——曾经为 `http`/`settings` 装过假表，2026-09-24 两张都落地后那个 `not_implemented()` 已删，`nil` 只意味着"没申请" |
| `lua/api/document.rs` | `nota.document`：读（`get_text` 等）/ 写（`set_text` / `append_text`，写完发事件通知前端） |
| `lua/api/fs.rs` | `nota.fs`：读写文件，**限死在当前工作区内**；裁决逻辑是纯函数 `resolve_in()` |
| `lua/api/git.rs` | `nota.git`：**子进程**跑 `git`，不是 libgit2；拒绝会重定向目标目录的参数 |
| `lua/api/http.rs` | `nota.http`（2026-09-24）：`request` / `get` / `post`。⚠️ 是**同步**的（ureq），所以整条命令走 `spawn_blocking`——插件那一侧本来就是一条阻塞的 Lua 调用。**两道围栏**：`https://` 随便、`http://` **只放行回环**（本机大模型服务），⚠️ 按**主机名**判（`127.0.0.1.evil.com` 不是本机）；`4xx/5xx` **不是错误**（关掉了 `http_status_as_error`），响应体回 `{code, text}`、能解析时另给 `json`（数组下标**从 1 起**，Lua 没有 JSON 库）。理由与两条坑（`host` 解析、重复 `content-type`）在文件头，见 `docs/13` §9 |
| `lua/api/settings.rs` | `nota.settings`（2026-09-24）：`get` / `set` / `all`，**一个插件一个明文 TOML**（`~/.config/nota/plugin-settings/<安全文件名(id)>.toml`，文件 0600 / 目录 0700）。⚠️ 键名只认 ASCII 且**不含点**（`a.b` 在 TOML 里是嵌套表）；`set(k, nil)` 是**删掉**。⚠️ **明文是决定不是欠账**（不做系统密钥环的理由在 `docs/12` §4.5），所以**界面上不许说它"安全"** |
| `lua/api/ui.rs` | `nota.ui`：`notify` / `register_panel` / `register_menu`。⚠️ 2026-09-22 起**不再是三个都发事件**：`notify` 推事件（发生），后两个写 registry 供宿主**拉**（声明）。判据见 `docs/07` BUG-13。⚠️ 2026-09-24 起面板**有内容**了：`register_panel` 收的 `render` 每次拉都**现跑**，由 `面板内容()` 剥成 JSON 交给前端（`面板文本上限` **20000** 字——2026-09-24 从 4000 抬上来的，理由见 `docs/13` §8.5 / `面板节点上限` 200 项 / `面板层数上限` 6 层）。⚠️ 同日起面板 DSL 有**十种** `kind`（多了 `message` / `diff` / `input`——对话框要的三块，见 `docs/13` §8.5） |
| `lua/api/diff.rs` | `nota.diff`（2026-09-24）：**改动块**的解析与应用——`parse`（拆出正文 / 改动 / 坏行数）与 `apply`（逐字找到 `-` 那几行、就地替换）。⚠️ **纯函数、不需要任何能力**；⚠️ **不碰文档**（写进去的是插件的事，所以那条确认永远在插件那侧）；⚠️ **失败＝什么都没做**（不给半截结果）；⚠️ 契约改一处要改三处（本文件 ＋ `plugins/ai/main.lua` 的 `SYSTEM_PROMPT` ＋ `docs/13` §11） |
| `native_menu.rs` | **macOS 的原生菜单**（自绘菜单在那边的兜底）。⚠️ **这里没有菜单定义**——树由前端推来（`ui/nativeMenu.ts`），这里只管建；点了只把 id 用 `nota:native-menu` 发回前端去执行。判定用 `cfg!` 不用 `#[cfg]`，于是它在 Linux 上也参与类型检查 |

### 前端 `src/`

| 文件 | 职责 |
|---|---|
| `main.tsx` | React 入口 |
| `App.tsx` | 外壳与全部状态：文档表、活动文档、设置、工作区、插件、toast、侧栏/插件栏/状态栏/格式栏开关、**专注/打字机两个写作开关**、查找条的开与命中状态、光标状态、主题表。⚠️ **`menuHandlers` 是"菜单项能不能点"的唯一真相**——灰不灰由它推出来，不另设标志位，**三条入口（自绘菜单 / 快捷键 / 原生菜单）都汇到它**。⚠️ 2026-09-24 沿职责拆走五块（1016 → **864 行**，五块都各自有完整理由可写）：菜单判据与快捷键分发 → `ui/useMenus.ts`、两个对话框的状态 → `ui/useDialogs.ts`、导出与打印 → `ui/useExport.ts`、文档主题三件事 → `ui/useDocTheme.ts`、「把命令送进编辑器」→ `ui/useEditorCommands.ts`。⚠️ **拆的是职责不是行数**：那一批同时往里加了工具栏与查找条的接线，不减反增过一次——别把"降到多少行"当验收口径 |
| `bridge/ipc.ts` | **调用后端的唯一出口**。`api.doc.*` / `api.workspace.*` / `api.settings.*` / `api.plugin.*` / `api.theme.*`、`on<T>()`、`events` 名字表 |
| `editor/create.ts` | Milkdown 封装（**所见即所得**）。对外只有 `EditorHandle` **十一条**：老的五个（`getMarkdown` / `setMarkdown` / `focus` / `runCommand` / `destroy`）＋ **查找五条** ＋ `setWritingModes`。⚠️ `runCommand` **返回"这条通路上有没有实现"**（所见即所得恒 `true`，源码模式表格那十条给 `false`），调用方据此提示用户。⚠️ 插件清单里**没有什么**和有什么一样重要，理由在函数注释里。⚠️ `readOnly` 只给分屏预览用，要**两件事同时成立**才算只读 |
| `editor/source.ts` | **源码模式**（CodeMirror 6），对外只有 `SourceHandle`——十一条与 `EditorHandle` 同名同义（`EditorPane` 两边通用）。⚠️ **不做任何规范化**，所以源码模式**不 `settle`** |
| `editor/command-state.ts` | **光标状态的只读观察者**（`CommandState`）。喂给两处：格式工具栏的高亮、菜单的第二条判据（表格那十条要 `inTable`）。⚠️ 报的是**签名串比对**之后的差异，直接回调等于每次光标动一下都重渲染 |
| `editor/insert.ts` | 插链接 / 插图片的**节点构造**。⚠️ 它**不问地址**——弹框那半在 `ui/PromptDialog.tsx`，两者刻意分开 |
| `editor/find.ts` | **查找与替换**。纯匹配函数 `在文本里找匹配` 是**唯一一份**语义（两种编辑模式都调它）＋ ProseMirror 适配器 ＋ 装饰插件。⚠️ 高亮是**装饰**（不进文档、不进撤销栈），替换才是文档改动 |
| `editor/writing-modes.ts` | **专注模式 + 打字机模式**。专注：从光标那层往上**把同层兄弟压暗**（⚠️ 不是"所有块压暗、当前块加亮"——`opacity` 不会因为子元素亮回来而恢复，那样嵌套就错了）。打字机：把光标那行滚到**容器正中**。⚠️ 容器**不写死选择器**（两种编辑器的滚动元素不是同一个），偏差 <1px 不动 |
| `editor/export.ts` | **导出 HTML**。⚠️ 走**同一条渲染路径**——起一个只读 Milkdown 实例、摘它渲染出来的 DOM（`DOMSerializer` 那条路会丢掉宽松模式下的标题显示与任务项方框，导出对不上屏幕）。⚠️ 摘完全**按类名前缀 `nota-`** 把编辑时的零件洗掉（代码块工具条、块标记）——一条规则，将来加零件自动生效。⚠️「含样式」复用**编辑器自己那份 `editor.css`**（动态 `?inline`，单独一个 5 kB chunk），不是另写一份 |
| `editor/instant-render.ts` | 光标所在块的 Markdown 标记（`##`、`>`、`-`）浅灰画在块左边。⚠️ 用 **`Decoration.node` 不是 widget**，理由在文件头 |
| `editor/atx.ts` | **「什么算标题」的唯一判据**——宽松/严格两种口径的正则、以及"这段文本算几级标题"都只在这里。⚠️ 三个调用点（`lax-heading.ts` / `source.ts` / `outline.ts`）都得往这儿问，别各自再写一份；Rust 侧那份同构实现在 `document/mod.rs::strip_atx` |
| `editor/lax-heading.ts` | 宽松模式的两半：① `宽松标题显示`（`Decoration.node` + `nodeName`，把 `#标题` **按标题排版**）② `不转义行首井号`（序列化时不往你写的井号上加反斜杠）。⚠️⚠️ **宽松模式一个字节都不改**（用户 2026-09-24 定的死规矩），理由在文件头 |
| `editor/task-list.ts` | 任务项复选框：画方框 + 点它勾上。⚠️ **不改 schema**——`data-checked` 是 `preset-gfm` 本来就给的 |
| `editor/code-block.ts` | 代码块 NodeView：语言选择器 / 复制 / 折叠。**全仓唯一一处 `$view`** |
| `editor/image-attrs.ts` | **图片装载兜底**（2026-09-24，P0 数据丢失的补丁）：上游 preset 少写了一个 `\|null`，于是**不带 title 的图片在装载时被整节点丢掉**（打开含图文档 → 存盘 → 图从文件里消失）。这里挂一个 `$remark` 插件，在 mdast 上把 `null` 抹成 `""`。⚠️ **`editor/create.ts` 里的 `.use(补全图片属性)` 不许删**；⚠️ 只读实例（分屏预览、导出）同样要走 `createEditor` 才带上它。根因与实测记录在文件头，`docs/05` §4.8 |
| `editor/math-macros.ts` | **数学宏表**（2026-09-24）：physics 那一套 `\qty`/`\dv`/`\braket`… 共 **108 条** + 每条一份可渲染样例，交给 `create.ts` 的 `katexOptionsCtx`。⚠️ KaTeX **官方没有 physics**，`katex-physics`（2019、无 LICENSE）**刻意没引**，所以这张表是我们自己写的。⚠️ 三条硬约束（参数要带花括号 / **KaTeX 的宏完全不支持可选参** / 星号不吃）与"默认关"的理由（会重定义 `\div` `\Re` `\Im`）都在文件头；**做不到的写法逐条列在 `docs/10` §12.1**。⚠️⚠️ 2026-09-24 修过一轮静默画错（`\dv` / `\dd` 那一族），**判据不能只是"能不能渲染"**——还有一张 `PHYSICS_EQUIVALENTS` 对照表 |
| `ui/EditorPane.tsx` | 编辑器挂载点，**按 `mode` 分派**三种模式（`wysiwyg` → Milkdown / `source` → CodeMirror / `split` → 左源码 + 右只读预览）。**那个 div 从不被 React 重新渲染**（Milkdown 拥有那棵 DOM）。⚠️ 它把十一条句柄**原样转发**给当前那个 handle——少一条就是"切到源码模式后查找条整个失灵"。⚠️ 切模式是**换实例**，不是复用——两家的撤销栈不通用。⚠️ effect 依赖是 `[doc.id, mode, strict, physics]`，**两个写作开关刻意不在里面**（走 `setWritingModes`，拨开关不重建实例） |
| `ui/FormatBar.tsx` | 格式工具栏（2026-09-24）：一排按钮，高亮读 `commandState`、点击走 `runCommand`。⚠️ **没有自己的状态**；⚠️ 快捷键提示**从菜单表派生**，不手写第二份；⚠️ 每颗按钮 `onMouseDown` 拦默认行为（不拦的话按钮会先把选区抢走，命令跑在一个已经塌掉的光标上）。**图标与文字字形混排**：Folio 那套里没有 H1/引用/任务列表的图标，那几颗就留文字（`H1`、`引`、`任`），理由写在 `按钮.icon` 那段注释里 |
| `ui/Icon.tsx` | **界面图标**（2026-09-24）：把 `src/assets/icons/` 里那 96 个 Folio 图标（BSD-2，来路见 `THIRD-PARTY.md` §5）当**遮罩**用——`?url` 只把网址带进 JS，形状由 `mask-image` 取，颜色由 `.icon` 的 `currentColor` 给，所以文件里写死的 `fill="#2e3436"` 不参与渲染。⚠️ 名字表**手写**（`import.meta.glob` 的键是 `string`，写错一个字母类型不报），加载时**逐个核对文件在不在**，缺了就 `console.error` + 画虚线框。⚠️ 调用处写错名字是**编译期**红。只搬"动作"图标，**不搬 Folio 的应用图标** |
| `ui/FindBar.tsx` | 查找与替换条（2026-09-24）。⚠️ 它是**显示端 + 输入端**，命中数一律是编辑器报上来的。⚠️ Esc 收在**条子自己身上**且带 `isComposing` 判据；查询上报走 **ref 读**（`onQuery` 每次渲染都是新身份，进依赖会让光标乱跳） |
| `ui/PromptDialog.tsx` | 自绘单行输入框（2026-09-24），替掉 `window.prompt`——**它在 WebKitGTK 上默认被关掉、调用静默返回 `null`** |
| `ui/useMenus.ts` | **菜单与快捷键的接线**（2026-09-24 从 `App.tsx` 搬出）：三条判据（有没有处理函数 / `needsDoc` / `光标条件`）→ `disabledCommands` / `menuChecks` / `usingNativeMenu`。⚠️ **"能不能点"只有这一处真相源**，它派生出自绘菜单、原生菜单、键盘三个消费者——各写一份的症状是**"菜单灰着、快捷键却照跑"** |
| `ui/useDialogs.ts` | 两个自绘对话框的"谁在等答案"（2026-09-24 从 `App.tsx` 搬出）。⚠️ 每个框后面是**单个 ref 不是队列**：今天所有调用点都是用户动作直接触发的，不存在并发 |
| `ui/useEditorCommands.ts` | 「把一条菜单命令送进编辑器」（2026-09-24 从 `App.tsx` 搬出）：`run` 转交 ＋「插入链接」「插入图像」先问参数再转交。⚠️ 转交时**必须看 `runCommand` 的返回值**——`false` 说的是"这个编辑模式下没有这个实现"，不看它用户就只会看到"点了没反应" |
| `ui/useDocTheme.ts` | 文档主题的**应用 / 切换 / 打开主题文件夹**（2026-09-24 从 `App.tsx` 搬出）。⚠️ 和 `applyTheme`（界面主题）**分家**：界面主题是纯写属性，文档主题要**取回来 + 限域**才能注入，是异步的，节奏不同不塞一个 effect。⚠️ `themeId` 进依赖、`themes` 也进（清单重扫后要能重取）；取不到 CSS **安静退回无主题**，不弹错 |
| `ui/useExport.ts` | 导出与打印的编排（2026-09-24 从 `App.tsx` 搬出）。⚠️ 正文**从编辑器拿，不是从 `doc.text`**（后者是 300ms 去抖后的镜像，屏幕上和导出里会不一致）；⚠️ 打印**不是在应用里打印**——写成 HTML 交给系统默认程序，如实把两步都说给用户听 |
| `ui/TopBar.tsx` | 顶栏（品牌字 + 菜单栏 + 「插件」开关）。**纯展示、零状态**。⚠️ `hideMenuBar` 的真假来自**后端返回值**（只有后端说"原生菜单真挂上了"才隐藏自绘那条），**不是按平台判** |
| `ui/TabBar.tsx` | 标签栏（脏点 + ×）。**纯展示、零状态**，也**不管"关之前要不要存盘"**——`confirmReq` 在 `App.tsx` 手上。⚠️ 键盘切标签今天**没有** |
| `ui/MenuBar.tsx` | 顶部菜单栏（文件/编辑/段落/格式/视图/主题/帮助）。**只管"哪一栏开着"**，栏里的内容与键盘导航在 `useMenuRovingFocus.ts` / `MenuPopup.tsx`。⚠️ 关闭用 **`mousedown` 不是 `click`**，主题那一栏是**动态**的（条目来自 `nota_doc_themes`）。⛔ 这一栏**只装文档主题**，界面风格/明暗在偏好设置里 |
| `ui/MenuPopup.tsx` | 一层弹层 + 它飞出的子菜单。⚠️ 子菜单走 **portal 到 `body` ＋ `position: fixed`**（父弹层的 `overflow-y:auto` 会把它裁掉），坐标自己量、夹回视口。**只支持一层子菜单** |
| `ui/useMenuRovingFocus.ts` | 菜单的方向键导航（漫游 tabindex）。⚠️ 吃掉的键**必须 `stopPropagation`**——子菜单套在父弹层里，不拦住父层会把同一个键再处理一遍。`focusItem` 与 `setFocusedIndex` 的差别写在文件头（值没变时 effect 不跑） |
| `ui/useSlidev.ts` | Slidev 预览的全部编排（2026-09-23 从 `App.tsx` 搬出）：**先过一道「装没装」的闸**（`gate` + `gateActions`）→ 起进程 → 轮询 `probe` 到端口通 → 开窗口，之后正文一改就重写入口文件，剩下的热更新归 Slidev。⚠️ 会话状态**只在内存里**（菜单勾选跟着它走）；⚠️ 用 `run.current` 计数让在途轮询作废；⚠️ 开窗失败退回系统浏览器。⚠️ `GUIDE_URL` 与**它怎么核出来的**（查页面表，SPA 的状态码核不出来）都写在这里 |
| `ui/SlidevPanel.tsx` | 「装没装」那个面板。⚠️ 只认一份 `SlidevProbe` ＋ 四个回调，**判定的话全在后端写的 `message` 里**，它只按 `state` 摆按钮；⚠️ **不是一堵墙**——`missing` 时旁边仍留「仍然打开预览」（探测是有根据的猜测）；⚠️ 不用 `window.confirm`/`alert` |

| `ui/nativeMenu.ts` | 把菜单树＋当前状态转成 `NativeMenuNode[]` 推给 Rust。⚠️ **只做形状转换，不重算"该不该灰"**——那是 `App.tsx` 的 `disabledCommands` 说了算 |
| `ui/accel.ts` | **快捷键的唯一真相源**：解析 `commands.ts` 里的 `accel` 文本，反过来驱动按键分发。⚠️ 判键名**优先 `e.code`**（Shift 之下 `e.key` 是上档字符，`Ctrl+Shift+1` 曾经因此永远不成立）；`Ctrl` 在 macOS 上指 ⌘（显示成 `⇧⌘S`） |
| `ui/settings/` | **偏好设置**（文件 → 偏好设置… / `Ctrl+,`），四个文件：`SettingsDialog.tsx`（左栏分节 + 搜索的壳）· `primitives.tsx`（行/组/控件）· `panes.tsx`（外观 / 文档主题 / 编辑器）· `ShortcutsPane.tsx`（快捷键一览，从 `MENUS` 读出来）。版式照 VMark 的偏好面板（用户 2026-09-23 要求，参考源码在仓库外 `../vmark-ref`）。⚠️ **改动即时生效，没有「确定」也没有「取消」**，理由写在文件头 |
| `ui/commands.ts` | 菜单的**静态骨架**：一栏一项抄自 `docs/10` §11.1。⚠️ 这里**没有** `disabled` 标志位——灰不灰由 App 的 `menuHandlers` 推。`accel` 是**唯一真相源**（`ui/accel.ts` 反过来查它）。「主题」那栏的条目与勾是合成的（`themeEntries` / `themeChecks` / `resolvePick`），自绘与原生两边共用 |
| `ui/Sidebar.tsx` | 侧栏两页：文件（工作区树）/ 大纲。⚠️ `tab` 是**受控**属性（菜单栏也要能切它）。⚠️ 2026-09-24 补了右上角那颗 **×（收起本栏）**与空工作区里的**「打开文件夹…」**——两处都是"别让用户找不到路"，但**开合状态仍只有 `App.tsx` 的 `sidebarOpen` 一份**（× 只是第二个入口） |
| `ui/PluginDock.tsx` | 右侧插件栏：**页签式，一次只画一页**（2026-09-24 用户要求「一个拓展独占一页，两个不能同时开」；叠着画时两块内容抢同一个滚动条，而面板会自己长高）＋「插件」页的清单与"没有落脚处"。⚠️ **只拉活动页**（非活动页连 `render` 都不跑；切过去时现拉一次）。**为什么在右边**写在文件头。⚠️ 面板内容**是拉的**（`api.plugin.panel(id)`），`nota:plugin-panel` 那条事件只是**失效信号、不带内容**——判据是"丢掉那条事件，打开面板仍然对"（`docs/07` BUG-13）。⚠️ 每个面板有自己的 `序号` ref，两个 effect 的依赖是**拼好的键串**不是那个数组 |
| `ui/PanelBody.tsx` | **面板节点的渲染**（2026-09-24）：**十种** `kind` 各一段 JSX（`heading` / `text` / `fields` / `list` / `buttons` / `empty` / `separator` ＋ `message` / `diff` / `input`——后三种是对话框要的：一问一答、增删对照、输入框。⚠️ `input` 是**面板里唯一的输入控件**，发出去＝调 `submit` 命令、参数 `{ [arg] = 输入 }`，跟按钮零区别）。⚠️ **没有 `dangerouslySetInnerHTML`**，字符串永远只是文本；没有 `command` 的按钮**画成灰的并写明原因**，不是静默不画 |
| `ui/panel-nodes.ts` | **面板内容的形状校验**（2026-09-24）。⚠️ 这里是**唯一**一处判"形状对不对"——宿主那边只管"是 JSON ＋ 大小上限"。三条规矩：认不出的 `kind` 如实显示、字段类型不对给默认值、**只有这里定义过的字段能到 DOM** |
| `ui/pluginMenus.ts` | 把插件声明的菜单项合成**一栏「插件」**（2026-09-24），插在「帮助」前面。⚠️ 走的是老路：id 是合成的 `__plugin:<插件>:<命令>`，`resolvePick` / `menuHandlers` / 加速键索引**一行都没为插件改**；`menu` 写别的值的条目**不静默丢掉**，照样摆出来、写明"想挂到哪一栏"、且是灰的 |
| `ui/plugin-prompt.ts` | 「点之前先问一句」（2026-09-24）：把菜单项/面板按钮上的 `prompt` 规格交给 `ui/PromptDialog.tsx`，答完把用户输入并进 `args` 再跑命令。⚠️ 返回的是 `{args} \| null`——**"用户取消"和"没有参数"必须分得开**，取消就**不调**命令 |
| `ui/usePlugins.ts` | 插件那三样（清单 / 面板 / 菜单项）**一起拉** ＋ 跑一条插件命令（2026-09-24 从 `App.tsx` 搬出）。⚠️ 三者是一个 `Promise.all`：分开拉会让菜单栏短暂少一栏。⚠️ 命令失败**弹 toast 不抛**（用户点了按钮，不该只看到控制台红字） |
| `ui/ConfirmDialog.tsx` | 自绘确认框，替掉 `window.confirm`（**它阻塞 WebView、会打断输入法组合态**）。⚠️ **受控**：开与答案都由 `ui/useDialogs.ts` 给 |
| `ui/Home.tsx` | 没有文档时那一屏 |
| `ui/StatusBar.tsx` | 未保存状态、字数**四项**（词/字符/行/分钟），加 2026-09-24 补的**模式名**（恒显）与**「严格」徽标**（只在开着时）。⚠️ 两个都是**只读指示、不是开关**——点一下切模式看着顺，但那会变成第三个切换入口 |
| `ui/Toasts.tsx` | 提示条 |
| `ui/ErrorBoundary.tsx` | 兜住前端渲染错误 |
| `ui/outline.ts` | 大纲与字数的**纯函数**（启发式正则，跳过 front matter 与围栏代码块） |
| `ui/view-modes.ts` | 三种编辑模式的**显示名**（一长一短两列）与出厂顺序，`StatusBar` 与偏好设置共用一份。⚠️ 只是名字，**不含任何切换逻辑** |
| `styles/theme.css` | **界面主题**的 CSS 变量（含 `--find-hit` / `--find-current`：查找高亮要盖在**正文**上，和 `--accent` 在暗色下的合适值差得很远，所以单独两个）。**二维相乘 = 7 风格 × 2 模式**：`[data-ui-mode]` 只给颜色、`[data-ui-style]` 只给形状，确有识别色的风格（GitHub / Plasma / Yaru…）写成**两属性**选择器放在最后。⛔ **文档主题一个变量都不许经这里中转**。⛔ `--font-ui` **不许出现衬线**（用户 2026-09-24：「绝对不要用衬线字体做UI字体」；`tools/doc-sync-check.sh` 的 ⑥ 查这个），`--font-doc` 可以是衬线但**只有正文能引**。⚠️ **2026-09-24 按「默认风格轻快一点」调过**：底色/次底色各浅一档、`--border` 0.11→0.08、`--accent` 换亮一档，**Adwaita（`ui_style=auto` 在 GNOME 上落到的那一档）的圆角/间距/控件高也各放松一格**——理由与"原值是多少"都写在那两段注释里 |
| `styles/icons.css` | 那一套搬来的图标怎么画：`.icon`（`mask-image` + `background-color: currentColor`，**`-webkit-` 前缀两条都要留**——真窗口是 WebKitGTK、试验台是 Chrome）、`.icon-missing`（名字对不上文件时画虚线框，别让它"空着像设计如此"）、`.btn-with-icon`（图标 + 文字的 `gap`）。⚠️ 与前后几份样式**没有重叠选择器**，加载顺序不影响结果 |
| `styles/applyTheme.ts` | 把 `ui_style` / `ui_mode` 两条轴写到 `<html>` 的属性上 + 探测表（KDE→plasma、Ubuntu→yaru…） |
| `styles/doc-theme.ts` | **文档主题的限域与注入**。用户主题会写 `h1 {…}` 这种裸选择器，注入前把**每条选择器挂到 `.editor-pane` 之下**（`:root`/`html`/`body` **改写**成锚点，不是加前缀）。⚠️ **这是"文档主题碰不到界面"的唯一保证**，机械执行，不靠写主题时自觉 |
| `styles/themes/*.css` | **内置六套文档主题**（素纸/蓝图/晨雾/报刊/墨色/松林）。按**普通文档 CSS** 写、**不带作用域前缀**（由 `doc-theme.ts` 统一挂）；一套主题 = `:root` 里改 token（纸面、代码块底、圆角、代码高亮）＋ 写 editor.css 没覆盖过的排版（标题/链接/引用/表格/分隔线） |
| `styles/app.css` | **外壳**：窗口骨架 → 主页，加菜单栏与确认框。⚠️ **不含左侧栏**（栏本身/文件树/大纲，在 `sidebar.css`） |
| `styles/sidebar.css` | **左侧栏**：栏本身 + 文件树 + 大纲。2026-09-24 从 `app.css` 拆出（加上折叠三角后顶破 1000 行）：拆的线是「**栏里的那两棵树**」，折叠三角/缩进/按层级隐藏两处是同一套写法。⚠️ **必须在 `app.css` 之后加载** |
| `styles/bars.css` | **编辑区上方那两条横条**（格式化工具栏 + 查找替换条）。2026-09-24 从 `app.css` 拆出（那时 880 多行）：那几条贴着编辑区、跟着 `mode` 走，外壳骨架那套不跟。⚠️ **必须在 `app.css` 之后加载** |
| `styles/slidev.css` | Slidev「装没装」面板的样式。⚠️ **必须在 `app.css` 之后加载**（`.slidev-panel` 要盖掉 `.confirm-dialog` 的 440px 宽度，同权重靠顺序）；2026-09-24 从 `app.css` 拆出（那时 985 行） |
| `styles/dock.css` | **右侧插件栏**（2026-09-24 按 1000 行规矩从 `app.css` 拆出，那时 1043 行）：栏本身 + 面板内容块 + 插件清单。⚠️ **必须在 `app.css` 之后加载**——它借了那边的 `.btn` / `.btn-primary` / `.btn-danger`（同权重靠顺序）。⚠️ 里面**不许有任何一条规则把插件给的字符串变成视觉**（插件的内容全是文本节点） |
| `styles/settings.css` | 偏好设置那个框的样式（`.settings-*` 壳 + `.stg-*` 原语，自成一体的覆盖层，复用 `app.css` 的遮罩底子）。⚠️ 加载顺序在 `app.css` **之后**；框体**不复用** `.confirm-dialog` |
| `styles/editor.css` | **正文编辑区**：编辑区外壳、块标记、代码块、任务列表。⚠️ 2026-09-22 因撞 1000 行上限从 `app.css` 按职责拆出；加载顺序必须是 `theme → app → settings → editor` |

### 插件与工具

| 路径 | 职责 |
|---|---|
| `plugins/git/` | **内置 Git 插件**（`plugin.toml` + `main.lua`）：状态解析、diff、提交。是"一个插件到底怎么写"的活样例。⚠️ 2026-09-24 起它的改动列表**在右栏面板里现拉**（`render` → `nota.git.status()`），**没走事件订阅**——改动列表是状态不是发生（`docs/07` 第 17 项） |
| `plugins/ai/` | **内置 AI 助手插件**：**多对话对话框** + 提示词模板 + 真的发请求。⚠️ 2026-09-24 起每一轮回答是**两段**：先一段普通文本（画成对话里的一条消息），最末尾再附一个 `` ```nota-diff `` 改动块——改动**先画成一块 diff、用户点「应用改动」才写进文档**（契约见 `docs/13` §11，解析与应用是宿主的 `nota.diff`）。密钥走 `nota.settings`（**明文**，见 `docs/12` §4.5），端点只放行 `https` 与本机回环。⚠️ **对话只在内存里**、**没有流式**、一条消息显示上限 15000 字——三条都登记在 `docs/07` |
| `src-tauri/icons/nota.svg` | **图标的手写矢量母版**（用户设计的蓝色 `N` + 光标条 + 折角纸）。其余图标文件全由它派生，**别再手改那些 PNG**——改这个 SVG 再走 `docs/06` §2.4 那两步。⚠️ 2026-09-23 换过两版，**逐条差异记在它自己的文件头里**，改之前先读那段 |
| `tools/gen-squircle.py` | 生成 `nota.svg` 里那块浅灰底衬（**超椭圆**，不是圆角矩形）的路径数据。⚠️ 那条 `d` 是采样出来的，改大小**只能重新生成**。默认参数跑出来的和**第一版**里那条**逐字符一致**（验过）。⚠️ **现在没有调用点了**：第二版底衬换成了普通圆角矩形 `rx=250`。留着是因为原图那块底衬确实是超椭圆的形状，要更贴原图还得靠它 |
| `tools/doc-sync-check.sh` | 文档同步与行数上限的启发式检查（见 `docs/09`） |
| `.github/workflows/release.yml` | 六个平台的打包矩阵（Windows x64/arm64 的 exe、macOS 双架构 dmg、Linux 双架构 deb/rpm/AppImage）。**每个平台只能在自己的系统上打**，理由在文件头 |
| `THIRD-PARTY.md` | **第三方组件与许可证清单**。加/删依赖要同批改它（`docs/09` §2.3） |

---

## 3. 快速开始（构建与运行）

**开发机是 Fedora，宿主没有工具链**（`gcc` / `cargo` / `node` 全无），构建走
toolbox 容器 `tauri-dev`。宿主的 `sudo` 要密码，但 `podman exec -u 0` 免密。

```sh
# 一次性：装工具链（容器里跑，-u 0 免密，别用 sudo）
podman exec -u 0 tauri-dev dnf install -y gcc gcc-c++ make pkgconf-pkg-config \
    webkit2gtk4.1-devel openssl-devel libappindicator-gtk3-devel librsvg2-devel \
    nodejs npm git
```

日常三条命令（**一律以 uid 1000 跑，别用 root**，否则产物归 root）：

```sh
cd /home/lqy/项目/30_计算机/30-01_一些AI编程项目/Nota

# ① 只编译后端
podman exec -u 1000 -w "$PWD/src-tauri" tauri-dev cargo test

# ② 类型检查 + 前端构建
podman exec -u 1000 -w "$PWD" tauri-dev npx tsc --noEmit
podman exec -u 1000 -w "$PWD" tauri-dev npx vite build

# ③ 跑起来
podman exec -u 1000 -w "$PWD" tauri-dev npm run app      # = tauri dev（自己带 vite）
```

⚠️ **在容器外直接 `cargo build` 会失败**（没有 GTK/WebKit 开发头）。⚠️
**`cargo build` 出来的 debug 二进制定死在 `devUrl`（`localhost:5273`）**——
不带 vite dev server 直接跑它会看到 "Could not connect to localhost: Connection refused"。
想跑单文件二进制就先 `npx vite`，或 `npm run app` 让 tauri 自己起。

**无头目检（容器里没有真显示器时）**：见 `docs/06-build-run-test.md` §5，
Xvfb + ImageMagick 那一条是验证过可用的。

细节、调试旋钮与测试清单见 `docs/06-build-run-test.md`。

---

## 4. 编码约定

### Rust

- 每个 `.rs` 顶部有一段中文模块说明，讲**为什么**这样设计，而不是复述代码。
- 错误统一走 `NotaError`，消息是**中文**且**要说人话**——面向的是用户，不是开发者。
- **锁顺序**：`plugins → documents → settings`，**绝不能反向**（见 `docs/03` §锁序）。
  拿多把锁之前先想清楚自己站在哪一层。
- **不要跨 `.await` 持锁**。
- 需要单元测试时，**把纯逻辑从依赖 Tauri 的壳里剥出来**——
  `fs.rs` 的 `resolve_in()`、`git.rs` 的 `挑工作目录()` 都是这么做的。
  `HostContext` 要真的 `AppHandle`，构造不出来，所以**别把安全边界写在它里面**。

### TypeScript / React

- `@/` 别名指向 `src/`。**`vite.config.ts` 的 `resolve.alias` 与 `tsconfig.json` 的
  `paths` 两处必须一致**，改一处就得改另一处（不一致的表现是"tsc 过了、vite 挂了"）。
- 调后端**只走 `src/bridge/ipc.ts`**，别在组件里直接 `invoke()`。
- `tsconfig` 开了 `noUnusedLocals` / `noUnusedParameters` / `noUncheckedIndexedAccess`——
  下标访问要处理 `undefined`。

### Lua 插件

- **能力申请只写真的用到的**（见 `plugins/git/plugin.toml` 顶部的说明）。
- 插件里的**环境问题**（没开工作区、目录不是仓库）要能在**不抛错**的前提下表现——
  宿主侧已经把这类失败折成 `code ~= 0` 的结果表（见 `docs/13` §错误处理）。

---

## 4b. 平台事实与踩过的坑

- **Tauri 的事件名只允许字母数字与 `-` `/` `:` `_`**，**点号不合法**。
  而插件清单的 id 允许点（`nota.git`），所以**拼事件通道名必须过
  `plugin::manifest::channel_id()`**。漏了的表现是：插件加载"成功"，
  但第一次 `emit` 抛 `only alphanumeric, '-', '/', ':', '_' permitted`——
  静态看代码完全看不出来（BUG-3）。
- **`Lua` 要放进 Tauri 托管状态，mlua 必须开 `send` feature**。没有它这整个
  结构根本编不过，而报错信息不会提"你需要 `send`"。
- ⚠️⚠️ **插件的 `Lua` 只能从 `lua::硬化的_lua()` 拿，不许写 `Lua::new()`**。
  mlua 的 `Lua::new()` 号称"安全子集"，**它的 "safe" 只等于"不能加载 C 模块"**——
  `io` / `os` / `package` / `require` **全都在**（源码：`ALL_SAFE = (1 << 30) - 1`，
  只排除 bit31 的 `debug`）。用它的后果是**能力围栏变成装饰**：一个只申请
  `ui.notify` 的插件能 `os.execute("rm -rf ~")`、`io.open("/etc/shadow")`。
  这就是 **BUG-10**。⚠️ 另外**光列 `StdLib` 白名单也不够**：`loadfile` / `dofile`
  属于**无条件加载的 base 库**，掩码关不掉，必须显式置 `nil`——
  否则插件仍能读并执行磁盘上任意 `.lua`（实测过）。
  **别把库的 `safe` 字面当安全承诺**，那是它自己定义的口径，只能读源码。
- **前端是文本的唯一真相**，后端是 300ms 去抖的镜像。任何"后端改文本"的路径
  都必须**发事件通知前端**，否则编辑器里看到的和存盘的不是一份东西。
- **`replaceAll` 一个语法坏掉的 markdown 不会报错**，remark 会按它的理解尽力解析，
  结果是"一段看起来对但不完全对的内容"。所以进编辑器的文本要先过解析
  （`parseMarkdown()`，见 `docs/05`）。
- **`@milkdown/kit` 的 `exports` 里没有 `plugin/prism`、`plugin/math`、`plugin/diagram`**，
  这三个要从各自的包进，而且**三个都得显式写进 `package.json`**——它们是**直接依赖**，
  不是 kit 的间接依赖。kit 的 `dependencies` 里只有 block/clipboard/cursor/diff/history/
  indent/listener/slash/streaming/tooltip/trailing/upload 这 12 个 `plugin-*`，
  prism/math/diagram 都不在其中。
- **不要同时写 `index.html` 的 CSP meta 与 `tauri.conf.json` 的 `csp`**——
  两个策略会**同时生效并互相冲突**。CSP 只放在 `tauri.conf.json`。
- ⚠️ **`asset://` 在 WebKitGTK 上传不了字体**：wry 给自定义协议注册了
  `register_uri_scheme_as_secure`，**但没注册 `register_uri_scheme_as_cors_enabled`**；
  而 `@font-face` 的装载**永远走 CORS 模式**，于是字体请求直接被判 NetworkError
  ——**图片却能正常显示**（`<img>` 不走 CORS），所以只看图片会以为协议是通的。
  ⚠️ 这条今天**已经没有代码依赖它**（文档主题不再加载任何外部资源，我们自己的
  主题一套字体都不带），但它仍然是"要不要往 WebView 里塞字体"这个决定的前提，
  所以留着。连带一条：**CSP 的 `font-src` 里不要加 `asset:`**，加了也没用。
  经过见 `docs/07` §4；⚠️ 这条**不是** BUG-11（那是打包丢插件）。
- **菜单栏里的 Shift+数字快捷键判据是 `e.code === "Digit1"`，不是 `e.key`**。
  Shift 按住时 `e.key` 是 `"!"` 这类符号（Shift+1 给的是 `"!"`，不是 `"1"`），
  拿 `e.key` 比 `"1"` 的快捷键**永远不触发**，而且静态看代码完全看不出来。
- **Tauri 2 的 `bundle.category` 枚举里没有 `Office`**（那是 Tauri 1 的值）。
  写错不会在 `cargo build` 时报——⚠️ **编到最后一个打包步骤**才
  `failed to build bundler settings: invalid category`，前面几分钟全白等。用 `Productivity`。
- ⚠️⚠️ **`bundle.resources` 的键要写目录，不要写 glob**：`{"../plugins": "plugins"}`。
  三种写法里**只有这一种是对的**，另两种都会"看起来成了"——
  数组 `["../plugins/**/*"]` 会把 `..` 映射成 `_up_`；
  映射 + glob `{"../plugins/**/*": "plugins/"}` **能打对目录名但会把树拍平**
  （`tauri-utils` 里 glob+dest 那支只取 `file_name()`），两个内置插件互相盖掉一个。
  ⚠️ **开发期走的是仓库目录，所以这条只有真拆开一个包才看得见**——
  "跑起来没问题"完全证明不了它（BUG-11）。验法见 `docs/06` §2.4。
- ⚠️⚠️ **Rust 报一堆 `cannot find macro panic` / `cannot find trait Clone`，
  先去看有没有 `error[E0514]`——那是工具链在说话，不是代码。**
  本机 rustc 是 Fedora 打过补丁的 RPM（sysroot 在 `/usr`，**没有 rustup**），
  与 `static.rust-lang.org` 发的 `rust-std` 哈希对不上；`E0514` 把 `core` 判成
  "别的编译器编的"，于是**凡是从 `core` 来的东西全部找不到**，
  一个包能塌出几千个 E0425/E0405，**看着像整个仓库都写坏了**。
  判断 std 是不是本机编的：`rpm -qf <libstd 路径>`——**查不到包名的就是外来的**。
  ⚠️ Windows 交叉编译**要走 `x86_64-pc-windows-gnu`**（`rust-std-static-x86_64-pc-windows-gnu`
  是 Fedora 自带的），**`msvc` 在 Fedora 上没有 std 可装**。见 `docs/06` §2.4。

---

## 5. 当前状态速查（详见 `docs/07-feature-status.md`）

**已经真的能用**（2026-09-22 开窗实测过，不是"看着像"）：

- 应用能启动，窗口能开，插件能被发现并加载（两个内置插件都显示「已加载」）。
- 新建文档 → 打字 → `#` 标题渲染成一级标题、`**粗体**` 真的加粗 →
  标签页标题从一级标题推导出来 → 状态栏字数跟着动 → 脏标记亮起。
- 打开/保存/另存为、工作区（文件夹）与文件树、大纲、字数统计。

**仍然是空壳或没接线**（动手前先看 `docs/07` §3）：

- **插件自定义事件通道仍然没有订阅端**：前端只订了 `nota:notify` 与
  `nota:document-changed`，插件自定义通道（`plugin:<id>:<name>`）**没有任何订阅者**。
  ⚠️ 这条通道对**发生类**数据是正解，缺的只是订阅端——别把结论推广成"事件机制别用"。
  见 `07` 第 17 项。
  ⚠️ **它和"面板没内容""菜单没接线"是两回事**：那两件 2026-09-24 都做完了
  （第 15 / 42 项），而且都**没走事件**——声明类的东西是**拉**的（`docs/07` BUG-13）。
  所以"没有订阅端"不是缺陷，是这条通道今天的实际用途（只有别的插件在听）。
- **面板 DSL 只做到"够用"**（`07` 第 15 项已结清）：七种 `kind`。**不做富文本面板**，
  要表达力就加新 `kind`，别开口子。
- ⚠️ **`07` 第 16 项已作废**——原先打算的"记账 + 重放"是**错的修法**，不是没做完。
- **三条外观轴都接通了**（`07` 第 11 项已结清）：界面风格与明暗在**偏好设置 →
  外观**（7 风格 × 2 模式 = 14 格 CSS 与切换界面都在），文档主题在**菜单栏「主题」**
  （内置六套 ＋ 用户目录）。⚠️ 两者**互不影响**是硬约束，机制在 `styles/doc-theme.ts`。
- **`docs/10` 那张 Typora 对照矩阵里标 ⬜ 的一切**——斜杠菜单、富文本工具栏、
  导出、拼写检查……逐项状态以矩阵为准。

**缺陷**（`docs/07` §2，**编号是永久的**）：**已修 16 条（BUG-1…BUG-14 + BUG-5 + BUG-16）**，
**未修 1 条（BUG-15，点正文下方的空白不聚焦）**。
⚠️ BUG-5（中文 IME）是**用户实测结清的**，不是我们跑出来的——本仓的无头流程
喂不进多字节输入，这一条没有可复现的自检办法。
⚠️ **未修的 BUG 优先于 backlog 的新功能**。
动手前请读 `docs/07` §2 拿最新状态，别只看这一段——这段只记条数，
**哪条是什么得看那张表**。

---

## 6. 文档索引

| 文档 | 内容 |
|---|---|
| `docs/README.md` | 文档索引与推荐阅读顺序 |
| `docs/01-architecture.md` | 运行时架构、启动顺序、两进程边界、事件流、锁顺序 |
| `docs/02-modules.md` | 逐文件接口参考（每个公开函数的签名与行为） |
| `docs/03-data-structures.md` | `AppState` / `Document` / `Settings` / `Manifest` 字段、常量、**锁序**、两条真相口径 |
| `docs/04-ui-map.md` | 控件树 + 每个按钮的回调/当前状态/目标行为，**含三条外观轴** |
| `docs/05-editor-bridge.md` | Milkdown 装配、前端↔后端两条通道、去抖与整篇替换语义 |
| `docs/06-build-run-test.md` | 依赖、构建、运行、调试旋钮、**无头目检**、测试清单 |
| `docs/07-feature-status.md` | **功能矩阵 + 缺陷清单 + backlog（编号）** |
| `docs/08-development-guide.md` | 如何新增按钮/命令/事件/插件/设置项 |
| `docs/09-doc-sync-policy.md` | **文档同步政策与代码→文档映射表（强制）** |
| `docs/10-typora-parity.md` | **对标 Typora 的逐项对照矩阵**（"100% 对标"这件事的唯一权威） |
| `docs/11-writing-a-plugin.md` | 怎么写一个插件：目录形状、清单逐栏、**能力表**、生命周期、构建接线 |
| `docs/12-plugin-runtime.md` | 插件**运行时**：为什么是 Lua + 独立状态、沙箱边界画在哪 |
| `docs/13-lua-api.md` | **Lua API 参考**：`nota.*` 每个表每个函数 |
