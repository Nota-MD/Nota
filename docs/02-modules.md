# 02 · 逐文件接口参考

> 最后同步：2026-09-23

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
| `lib.rs` | 建 Tauri、`setup()` 里按顺序启动、**37 条**命令的注册表、窗口销毁时卸载插件（⚠️ 按窗口 label 分派，见下） |
| `error.rs` | `NotaError`，中文 Display，自定义 `Serialize` 过 IPC |
| `paths.rs` | XDG 目录、插件目录、**主题目录**的**唯一**算法所在地 |
| `state.rs` | `AppState` 四个句柄 + 锁序不变量 |
| `settings.rs` | `Settings` 与三条互相独立的外观轴，kebab-case 落盘 |
| `themes.rs` | **文档主题**的发现与读盘：`DocThemeInfo` / `discover()` / `css_of()` / `user_themes_dir()` / 围栏 `check_id()`。⛔ **不兼容也不内置 Typora 主题**（版权，用户 2026-09-23 定的）。⚠️ 入参是 **id 不是路径** |
| `document/mod.rs` | `DocId` / `Document` / `DocumentStore` / `derive_title()` |
| `commands/mod.rs` | 只是**八**个子模块的声明 + 命令层的分工说明（无函数） |
| `commands/document.rs` | `nota_doc_*` 十个命令 |
| `commands/workspace.rs` | `nota_workspace_*` 四个命令 + `TreeNode` + 文件树遍历 |
| `commands/settings.rs` | `nota_settings_get/set` |
| `commands/theme.rs` | `nota_doc_themes` / `nota_doc_theme_css` / `nota_doc_themes_dir` |
| `commands/plugin.rs` | `nota_plugins_list` / `set_enabled` / `call` / `find_command` / `panels` / `menus` |
| `commands/export.rs` | 导出与打印的**落盘那一步**：`nota_export_write` 写字节、`nota_export_print` 写到 `.nota-print.html` 再交给系统默认程序。⚠️ 本题**不生成 HTML**——HTML 由前端生成（`editor/export.ts`），这一层只管 IO 与落点 |
| `commands/slidev.rs` | `nota_slidev_*` 八条：**探测装没装** / 起预览服务器 / 探活 / 日志 / 查状态 / 开窗口 / 同步正文 / 收摊。⚠️ 除 `probe_install` 外全是**短命令**（`start` 不等端口，等待在前端）；`probe_install` 最长 20 秒，所以它是**异步**命令、走 `spawn_blocking` |
| `slidev.rs` | Slidev 预览服务器的**生命周期**：挑端口 · 写入口文件 · 起进程（自成进程组）· 探活 · 收摊。⚠️ 四条实测结论写在文件头。「装没装」那半 2026-09-24 拆去了 `slidev_probe.rs`（当时这边 1023 行） |
| `slidev_probe.rs` | **「本机装没装 Slidev」**（2026-09-24 从 `slidev.rs` 拆出）：跑 `start` 会跑的**同一条命令**、**同一个 cwd**，末尾加 `--version`，npm 上 `npm_config_offline=true`。⚠️ **不许联网**（缓存命中 1.3 秒 / 没命中 0.26 秒），挂住时 20 秒连**进程组**一起杀 |
| `plugin/mod.rs` | `PluginHost`：发现 → 加载 → 派发 → 卸载；`PluginInfo` / `PluginPanel` / `PluginMenuItem` 快照 |
| `plugin/manifest.rs` | `Capability` / `PluginMeta` / `Manifest` / `channel_id()` |
| `lua/mod.rs` | `HostContext` / `LuaPlugin` / `PluginState`；一插件一个 `Lua` |
| `lua/api/mod.rs` | `nota` 表的构造：按能力装表 |
| `lua/api/document.rs` | `nota.document` |
| `lua/api/fs.rs` | `nota.fs` + 纯函数 `resolve_in()`（工作区围栏） |
| `lua/api/git.rs` | `nota.git`，子进程跑 `git` |
| `lua/api/ui.rs` | `nota.ui`：通知**推**事件，面板/菜单**存** registry 供宿主拉 |
| `lua/api/diff.rs` | `nota.diff`：**改动块**的解析与应用（纯函数，不需要能力）。⚠️ 只解析与应用，**不碰文档**——写进去的是插件的事 |

**前端 `src/`**

| 文件 | 一句话 |
|---|---|
| `main.tsx` | React 入口 |
| `App.tsx` | 外壳与状态编排。⚠️ `TopBar` / `TabBar` 2026-09-23 搬去了同名文件，本文件只剩 `App` 一个组件；⚠️ 2026-09-24 又搬走了**六块**（菜单判据与两个对话框的状态 → `ui/useMenus.ts` / `ui/useDialogs.ts`；导出打印、文档主题、命令转交 → `ui/useExport.ts` / `ui/useDocTheme.ts` / `ui/useEditorCommands.ts`；**插件三份清单 ＋ 跑命令 → `ui/usePlugins.ts`**），1118 → 916 → 918 → **926 行**（最后一次只多了 8 行：插件栏那两个默认值从 `true` 改成 `false`，各配一段"为什么改"的注释，见 `docs/04` §1）。⚠️ **"搬了"≠"变小了"**：头两次搬完反而还在 916 行，因为同批又加进了格式工具栏与查找条的接线 |
| `bridge/ipc.ts` | 调用后端的唯一出口 + 事件名表（**只放"发生类"**）+ 类型定义 |
| `editor/create.ts` | Milkdown 封装（**所见即所得**），对外只有 `EditorHandle`。⚠️ `readOnly` 选项是给分屏预览用的 |
| `editor/source.ts` | **源码模式**的编辑器：CodeMirror 6，对外只有 `SourceHandle`（十条与 `EditorHandle` 同名同义，所以 `EditorPane` 两边通用）。⚠️ 它不是"高亮版 textarea"，也**不做任何规范化** |
| `editor/command-state.ts` | **光标状态**的只读观察者插件（`CommandState`）：在不在表格里、有没有选区、当前块是什么。⚠️ 喂给工具栏高亮与菜单的第二条判据 |
| `editor/insert.ts` | 插链接 / 插图片的**节点构造**（`fmt.link` / `fmt.image` 的落点）。⚠️ 与"问地址"的对话框分开——那是 `ui/` 的事 |
| `editor/find.ts` | **查找/替换**：纯匹配函数 `在文本里找匹配` + ProseMirror 适配器 + 装饰插件。⚠️ **只读观察者**，高亮不进文档、不进撤销栈 |
| `editor/writing-modes.ts` | **专注模式 + 打字机模式**：装饰（压暗兄弟块 / 当前行）+ 就近滚动。⚠️ 同上只读；两个开关**随时可拨，不重建实例** |
| `editor/instant-render.ts` | 「光标所在块的 Markdown 标记淡化显示」那个 ProseMirror 插件 |
| `editor/atx.ts` | **「什么算标题」的唯一判据**（宽松/严格两套正则）。⚠️ 三个调用点都往这儿问 |
| `editor/export.ts` | **HTML 导出**：另起一个屏外只读 Milkdown 实例**摘它渲染出来的 DOM**（不是再写一遍序列化——那样宽松标题的显示、任务框都会在导出里丢掉），加外壳 + 限域主题 CSS。⚠️ 用 `?inline` 复用**编辑器自己那份** `editor.css`，不是第二套样式表 |
| `editor/lax-heading.ts` | 宽松模式：把 `#标题` 按标题**排版**而不改字（显示层装饰 + 序列化层那条"别加反斜杠"） |
| `editor/task-list.ts` | 任务项复选框：`- [x]` 画方框、点它勾上、回车切出来的新项**不继承勾** |
| `editor/code-block.ts` | 代码块的 NodeView（语言选择器 / 复制 / 折叠）。**全仓唯一一处 `$view`** |
| `editor/image-attrs.ts` | **图片装载兜底**（2026-09-24，P0）：上游 preset 少写 `\|null`，不带 title 的图**装载时被整节点丢掉**（打开含图文档 → 存盘 → 图没了）。一个 `$remark` 插件，在 mdast 上把 `null` 抹成 `""`。⚠️ **只读实例也要挂**（导出、分屏预览） |
| `editor/math-macros.ts` | **physics 宏包的表**（2026-09-24）：108 条宏 + 每条一个可渲染样例，做成 KaTeX 的 `macros`；外加 `PHYSICS_EQUIVALENTS` 对照表（宏写法 vs 手写等价 TeX）。⚠️ 官方没有 physics，`katex-physics`（2019）**刻意没引**（无 LICENSE），表是我们自己写的。**能写与写不出来的逐条在 `docs/10` §12.1** |
| `styles/applyTheme.ts` | 把**两条界面轴**写到 `<html>`（`data-ui-style` / `data-ui-mode`）。⚠️ **文档主题不在这里，它连 DOM 属性都没有** |
| `styles/theme.css` | 两条界面轴的变量表（7 风格 × 2 明暗；`yaru-blue` 与 `yaru` 共用形状段）。⚠️ **只管外壳**；`--find-hit` / `--find-current` 是 2026-09-24 为查找高亮加的。⛔ `--font-ui` 不许有衬线、`--font-doc`（可以是衬线）只有正文能引——用户 2026-09-24：「绝对不要用衬线字体做UI字体」，机器判据在 `tools/doc-sync-check.sh` ⑥ |
| `styles/icons.css` | 搬来的图标（`src/assets/icons/`，96 个，来路见 `THIRD-PARTY.md` §5）怎么画：`.icon` 用 `mask-image` 取形状、`background-color: currentColor` 上色（所以 SVG 里写死的 `fill` 不参与渲染）、`.icon-missing` 画虚线框、`.btn-with-icon` 补图标与文字之间的 `gap` |
| `styles/sidebar.css` | **左侧栏**：栏本身 + 文件树 + 大纲。2026-09-24 按 1000 行规矩从 `app.css` 拆出（折叠三角进去之后超了）。⚠️ 拆的线是「**栏里的那两棵树**」：文件树与大纲的折叠（转三角、缩进、按祖孙链隐藏）是同一套写法；右侧插件栏**不在这里** |
| `styles/bars.css` | **两条横条**（格式工具栏 + 查找条）的样式，2026-09-24 按 1000 行规矩从 `app.css` 拆出（那时 `app.css` 880 多行，正在往 931 涨）。⚠️ 拆它们是因为它们**贴着编辑区、跟着编辑模式走**，而 `app.css` 里那些是外壳骨架 |
| `styles/editor.css` | 正文编辑区。⚠️ 排版是**用 token 写的**——文档主题改 token 就能换掉，不用抢选择器权重 |
| `styles/doc-theme.ts` | **文档主题的限域注入器**：用 `CSSStyleSheet` 解析后把每条选择器收到 `.editor-pane` 之下。⚠️ `:root`/`html`/`body` 是**改写**成 `.editor-pane` 而不是加前缀——**这一步就是「文档主题碰不到外壳」的全部保证** |
| `styles/themes/*.css` | 内置六套文档主题（素纸/蓝图/晨雾/报刊/墨色/松林）。⚠️ 按**普通文档 CSS** 写、**不带作用域前缀**，靠 `doc-theme.ts` 统一挂；每套必须自带一套 `--code-*` |
| `styles/settings.css` | 偏好设置框的样式：左栏分节 + 右栏「标签在左、控件在右」的行。2026-09-23 按 1000 行规矩从 `app.css` 拆出，同日晚些改成 VMark 那套版式 |
| `styles/dock.css` | **右侧插件栏 + 插件面板内容块**的样式（2026-09-24 按 1000 行规矩从 `app.css` 拆出）。⚠️ 拆的线是「**插件那一竖条**」：栏、卡片、面板内容节点（`.panel-*`）与它们的状态色都在这里；左侧栏在 `sidebar.css`，别混 |
| `styles/slidev.css` | Slidev 面板的样式（`.slidev-panel` / `.slidev-status` / `.slidev-mark` / `.slidev-facts` / `.slidev-side`）。2026-09-24 按「900 行就该想怎么拆」从 `app.css` 拆出（那时 985 行）。⚠️ **必须在 `app.css` 之后加载**：`.slidev-panel` 要盖掉 `.confirm-dialog` 的 440px 宽度（同权重靠顺序） |
| `ui/TopBar.tsx` | 顶栏：品牌字 + 菜单栏 + 最右的「插件」开关。⚠️ **纯展示、零状态**（2026-09-23 从 `App.tsx` 拆出，当时那支文件 921 行）。`hideMenuBar` 的真假由**后端返回值**决定，不是平台 |
| `ui/TabBar.tsx` | 标签栏：脏标记 + 关闭按钮。⚠️ **纯展示、零状态**，也**不管"关之前要不要存盘"**——`confirmReq` 在 `App.tsx` 手上 |
| `ui/MenuBar.tsx` | 菜单栏（**七栏 ＋ 插件一栏**，见 `ui/pluginMenus.ts`）。⚠️ **只管「哪一栏开着」**，条目表在 `ui/commands.ts`，灰不灰由 `App.tsx` 的 `menuHandlers` 决定；弹层与子菜单在 `ui/MenuPopup.tsx` |
| `ui/MenuPopup.tsx` | 一栏的弹层 + 它飞出来的子菜单。⚠️ 子菜单必须 **portal 到 `body` + `position: fixed`**（父弹层要能滚，`overflow-y: auto` 会把 `overflow-x` 也算成 `auto`，飞出右边缘的子菜单会被裁成一条竖线） |
| `ui/commands.ts` | 菜单的**条目表**（逐条抄自 Typora）+ **快捷键的唯一真源**（`accel` 字段）。⚠️ 里面**故意没有** `implemented` 标志位 |
| `ui/accel.ts` | 快捷键的解析/显示/派发：`parseAccel` · `accelSig` · `eventAccel` · `formatAccel` · `buildAccelIndex` · `isOutsideEditor`。⚠️ 判 `e.code` 不判 `e.key`，理由见文件头 |
| `ui/nativeMenu.ts` | 把同一份 `MENUS` 翻译成后端要的原生菜单树（macOS 兜底）。⚠️ **不碰 `muda` 的语法**——那是纯 Rust 那边的事 |
| `ui/settings/SettingsDialog.tsx` | 偏好设置的**壳**：左栏（搜索 + 五节 + 「完成」）+ 右栏内容。⚠️ 搜索是**就地过滤**（五节叠着渲染，每行自己筛），不是跳转 |
| `ui/settings/primitives.tsx` | 偏好设置的原语：`SettingRow` · `SettingsGroup` · `Select` · `Toggle` · `Range` · `SearchField` · `Icon`。⚠️ 搜索靠它们各自 `hits()` 比对，没有第二份索引 |
| `ui/settings/panes.tsx` | 四节内容：外观（**界面风格 × 明暗** + 界面字号）、文档主题（只读）、编辑器、Markdown。⚠️ `STYLES` 写成 `Record<UiStyle, …>`，加风格时**编译期**就漏不掉。⚠️ 「自动保存」那节有一条**如实告知**的 `stg-note`（那个开关还没接线，见 `docs/07` 第 20 项）——接好之后**连同注释一起删掉** |
| `ui/settings/ShortcutsPane.tsx` | 快捷键一览（只读）。⚠️ 条目**从 `MENUS` 读出来**（`walkMenuItems` 深度优先 + `formatAccel`），不是抄一份静态表 |
| `ui/EditorPane.tsx` | 编辑区：按 `mode` 摆一到两个窗格（所见即所得 / 源码 / 分屏），管两类编辑器的挂载与去抖同步。⚠️ **分屏是单向的**：源码 → 预览，预览只读且从不回写 |
| `ui/Sidebar.tsx` | 左侧栏两页（文件树 / 大纲）。⚠️ 开合与当前页都是 `App.tsx` 给的**受控**状态；**折叠状态**（哪个目录、哪个标题）反过来住在自己家里。2026-09-24 补了右上角的 × 与空态那颗「打开文件夹…」 |
| `ui/PluginDock.tsx` | 右侧插件栏：**页签式，一次只画一页**（2026-09-24 用户要求「一个拓展独占一页，两个不能同时开」）＋「插件」页的清单与"没有落脚处"。⚠️ **只拉活动页**——没显示的那几页连 `render` 都不跑（代价：切过去时现拉一次，慢接口会闪一下「正在读取…」）。⚠️ 面板**内容**不在它手里，内容由 `ui/PanelBody.tsx` 现拉现画 |
| `ui/PanelBody.tsx` | **一张插件面板的身体**（2026-09-24）：拉 `nota_plugin_panel_content` → 交给 `panel-nodes.ts` 认形状 → 按白名单画。⚠️ 拉是**每次打开都拉**，不是缓存；`nota:plugin-panel` 那条事件只是"去重拉"的信号。⚠️ 2026-09-24 起多了三种块：`message`（一问一答，保留换行）/ `diff`（增删对照，**只画**）/ `input`（**面板里唯一的输入控件**，发出去＝调 `submit` 命令、参数 `{ [arg] = 输入 }`，跟按钮零区别） |
| `ui/panel-nodes.ts` | **面板 DSL 的形状判据**（2026-09-24）：`normalise` 把后端给的 JSON 认成**十种**节点（`heading`/`text`/`fields`/`list`/`buttons`/`empty`/`separator` ＋ `message`/`diff`/`input`），认不出的如实变成 `unknown`。⚠️ **形状校验只在这里**——Rust 侧只管"是 JSON、有上限"，不管形状。⚠️ `消息上限 = 20000` 与宿主那个 `面板文本上限` 是同一个数，改要一起改 |
| `ui/pluginMenus.ts` | **把插件菜单项并进菜单表**（2026-09-24，backlog 第 42 项）：合成 id `__plugin:<plugin>:<command>`，插件那一列插在 `help` 之前。⚠️ **先到先得**的快捷键索引 ⇒ 内置永远赢（`docs/13` §8.3） |
| `ui/plugin-prompt.ts` | **「点之前先问一句」的统一入口**（2026-09-24）：菜单项的 `prompt` 与面板按钮的 `prompt` 两条路都汇进 `问参数`。⚠️ 取消 ⇒ **命令根本不调**（不是调一个空参数） |
| `ui/usePlugins.ts` | **插件那三份状态与四条命令**（2026-09-24 从 `App.tsx` 搬出）：清单 / 面板清单 / 菜单项 + 刷新。⚠️ 与 `ui/useMenus.ts` 同类——都是"从 `App.tsx` 搬走的接线层" |
| `ui/FormatBar.tsx` | 格式工具栏（2026-09-24，`docs/07` 第 2 项）：一排按钮，**高亮读 `commandState`、点击走 `runCommand`**。⚠️ **没有自己的状态**——数据全从外面来。2026-09-24 起 9 颗按钮画图标（Folio 那套），另外 6 颗仍是文字字形（`H1`/`引`/`任`…，那套里没有对应的图） |
| `ui/Icon.tsx` | **界面图标**（2026-09-24）：`src/assets/icons/` 里那 96 个 Folio 图标（BSD-2，`THIRD-PARTY.md` §5）当**遮罩**用——`?url` 只把网址带进 JS，形状由 CSS 取、颜色由 `currentColor` 给。⚠️ 名字表手写 + 加载时核对文件在不在（写错一个字母，类型不报，界面上只是少一颗图标） |
| `ui/FindBar.tsx` | 查找与替换条（2026-09-24，`docs/07` 第 4 项）。⚠️ 它是**显示端 + 输入端**，不是查找的实现：命中数一律是编辑器报上来的 |
| `ui/ConfirmDialog.tsx` | 自绘确认框（替掉 `window.confirm`）。**受控**：开与答案都由 `ui/useDialogs.ts` 给 |
| `ui/PromptDialog.tsx` | 自绘单行输入框（2026-09-24，替掉 `window.prompt`——它在 WebKitGTK 上**默认被关掉且静默返回 `null`**）。⚠️ 挂载即聚焦 |
| `ui/useMenus.ts` | **菜单与快捷键的接线**（2026-09-24 从 `App.tsx` 搬出）：三条判据 → `disabledCommands` / `menuChecks` / `usingNativeMenu` |
| `ui/useDialogs.ts` | **两个自绘对话框的"谁在等答案"**（2026-09-24 从 `App.tsx` 搬出）：两个 `useState` + 两个 resolve ref |
| `ui/useExport.ts` | **导出与打印的接线**（2026-09-24 从 `App.tsx` 搬出）：取正文 → 取主题 → 生成 HTML → 问落点/交给系统 → 报结果。⚠️ 正文**必须从编辑器拿**（`doc.text` 是 300ms 去抖后的镜像）；主题取不到**不算失败** |
| `ui/useDocTheme.ts` | **文档主题的应用/切换/打开目录**（2026-09-24 从 `App.tsx` 搬出）。⚠️ 与界面主题的 `applyTheme` **分家**：那条是同步写属性，这条要取回来 + 限域，节奏不一样 |
| `ui/useEditorCommands.ts` | **把一条菜单命令送进编辑器**（2026-09-24 从 `App.tsx` 搬出）：`run` 直接转交，「插入链接」「插入图像」先问参数。⚠️ 转交时**必须看返回值**——`false` 说的是"这个模式下没实现"，不看就是"点了没反应" |
| `ui/Home.tsx` | 没有文档时那一屏 |
| `ui/StatusBar.tsx` | 未保存状态 + 字数四项 + 右侧两个**只读**小标（编辑模式 / 严格模式开着） |
| `ui/view-modes.ts` | **三种编辑模式的名字**（2026-09-24）：每个模式一长一短（状态栏用 `short`、菜单与设置用 `full`）。⚠️ **只是名字，没有切换逻辑**——切换在 `App.tsx` / `ui/commands.ts` |
| `ui/Toasts.tsx` | 提示条 |
| `ui/ErrorBoundary.tsx` | 渲染错误兜底 + 全局错误钩子 |
| `ui/outline.ts` | 大纲与字数的纯函数 |
| `ui/useSlidev.ts` | Slidev 预览的**全部编排**（2026-09-23 从 `App.tsx` 搬出）：**先过一道「装没装」的闸** → 起进程 → 轮询到端口通 → 开窗口 → 正文一变就重写入口文件。⚠️ 会话状态**只在内存里**；⚠️ `GUIDE_URL` 与它怎么核出来的都写在这里 |
| `ui/SlidevPanel.tsx` | 「装没装」那个面板（2026-09-24）：一份 `SlidevProbe` + 四个回调，**判定的话全在后端写的 `message` 里**。⚠️ 它**不是一堵墙**——`missing` 时旁边仍留「仍然打开预览」 |

`src-tauri/build.rs` 只有 `fn main() { tauri_build::build() }`，是 Tauri 的标准构建脚本
（生成 `gen/schemas/*` 那些权限 schema），没有本项目自己的逻辑，下文不再单列。

**测试现状**

| 有 `#[cfg(test)]` 的文件 | 测试数 |
|---|---|
| `lua/api/ui.rs` | 18 |
| `document/mod.rs` | 15 |
| `lua/api/diff.rs` | 13 |
| `slidev_probe.rs` | 10 |
| `slidev.rs` | 10 |
| `lua/api/http.rs` | 9 |
| `lua/api/settings.rs` | 7 |
| `lua/api/git.rs` | 6 |
| `native_menu.rs` | 6 |
| `themes.rs` | 6 |
| `plugin/manifest.rs` | 5 |
| `lua/api/fs.rs` | 5 |
| `lua/mod.rs` | 5 |
| `settings.rs` | 5 |
| `commands/export.rs` | 5 |
| `lua/api/mod.rs` | 4 |
| `commands/workspace.rs` | 3 |
| `paths.rs` | 2 |

合计 **134 个 Rust 单元测试**（2026-09-24 晚实测：`grep -r '#\[test\]' src-tauri/src --include=*.rs | wc -l` 数出来 134，
`cargo test` 报的也是 134；比上一版多的 13 条全在 `lua/api/diff.rs`）。其余 Rust 文件没有测试；前端**没有任何测试**
（`package.json` 里没有测试运行器，跑的是 `tsc --noEmit` + `vite build`）。
`tests/` 目录下只有一个空的 `fixtures/`，还没有 Rust 集成测试。

⚠️ **总数只在 `docs/06` 记数**（那里写着一份"这 N 条到底钉住了什么"的说明）。
本表列**逐文件**明细，是为了回答"改这个文件时哪几条会红"。
⚠️ **本表落后过真值三次**（另加 2026-09-24 晚这一次：新增 `lua/api/diff.rs` 后这张表没跟上，
现已补）：一次漏掉两个文件、总数停在 32（漏了 `lua/api/mod.rs`
与 `lua/mod.rs`，而 `docs/06` 已经写到 40）；2026-09-23 又停在 45；
**2026-09-24 重数时又发现三处**——`native_menu.rs` 那 6 条**整行没有**（上一批说"补齐了"，
其实只补了 `docs/06` 那边）、`settings.rs` 写 3 实 4、`themes.rs` 写 7 实 6
（少的那条随"停止扫描 Typora 主题目录"一起删了，表没跟着改）。
**两张表都是手抄的，这就是它们会分叉的原因。** 每次都是按
`grep -r '#\[test\]' src-tauri/src --include=*.rs | wc -l` 重排的——
**改完测试记得两边都跑一次数**，别只改一边。

⚠️ **下面每个小节标题里的「N 行」同样是手抄的**，2026-09-23 一次核对发现 13 处是旧数
（最多的 `lua/mod.rs` 差 209 行——它当年 255 行，现在 464）。别信这些数字，
要真值就跑这一条（只打印对不上的）：

```sh
node -e 'const fs=require("fs");const t=fs.readFileSync("docs/02-modules.md","utf8");for(const m of t.matchAll(/^## `([^`]+)`（(\d+) 行）/gm)){const n=fs.readFileSync(m[1],"utf8").split("\n").length-1;if(+m[2]!==n)console.log(m[1],m[2],"->",n)}'
```

它和结构无关，只是给"这文件多大"一个量级感——**正因为无关，才最容易烂在这儿**。

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

## `src-tauri/src/lib.rs`（245 行）

建 Tauri 应用、按顺序启动、注册全部命令、挂窗口事件。模块头把**启动顺序为什么是这个顺序**
写在最上面（`docs/01-architecture.md` 把它展开讲了一遍）。

### 模块声明

```rust
pub mod commands;
pub mod document;
pub mod error;
pub mod lua;
pub mod native_menu;
pub mod paths;
pub mod plugin;
pub mod settings;
pub mod slidev;
pub mod slidev_probe;
pub mod state;
pub mod themes;
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
3. `.invoke_handler(tauri::generate_handler![ …38 项… ])`，前 37 项是 `commands::*` 里的命令
   （document 11 / workspace 4 / settings 2 / theme 4 / plugin 6 / slidev 8 / menu 1 /
   **export 2**），最后一项是本文件里的 `nota_frontend_ready`
4. `.on_menu_event(|app, event| …)`（**2026-09-23 加**）：把 `event.id().0`
   经 `emit("nota:native-menu", …)` 发回前端。⚠️ 这里**不执行任何命令**——
   在 Rust 里再写一遍"哪个 id 干什么"就又成了两个真相源，而且大部分命令
   本来就得前端执行（改 React 状态、动编辑器），这边根本没有入口
5. `.on_window_event(|window, event| …)`：`WindowEvent::Destroyed` 时**按 `window.label()` 分派**
   （2026-09-23 加预览窗口时才需要分派，在那之前是「任何窗口销毁都卸载全部插件」）：
   - `"main"` → `window.try_state::<AppState>()` → `state.plugins.lock()` → `host.unload_all()`。
     给插件一次 `on_unload`，让它们有机会落盘自己的状态；
   - `"slidev"` → `window.try_state::<SlidevState>()` → `slidev::stop()`，再 `emit("nota:slidev-stopped")`。
     ⚠️ 前端那个监听只负责**把菜单的勾去掉**，状态由 `useSlidev` 自己维护
   - 别的 label → 什么也不做

   ⚠️ 这一条是**读代码时发现的**：预览窗口一加进来，原先那种写法会在用户
   叉掉预览窗时**把所有插件卸掉**。改动很小，但漏了就是静默的。
6. `.run(tauri::generate_context!()).expect("Nota 启动失败")`

失败行为逐项见 `docs/01-architecture.md` 的"每一步失败会怎样"表。要点是：
**只有第 6 步会让进程直接死掉**，其余每一步都是"记一笔然后继续"。

⚠️ 第 2 步里 `AppState` 是**手写字面量**（`state.rs` 那个结构体**没有构造函数**，2026-09-24 把没人调用的 `AppState::new` 删了——见 `state.rs` 那一节）。
⚠️ 同一行里 `DocumentStore::new(settings.strict_markdown)` 那个**参数别漏**：标签页标题是文档仓自己算的。

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

## `src-tauri/src/paths.rs`（186 行）

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
| `pub fn user_themes_dir() -> Result<PathBuf>` | `config_dir()?.join("themes")`（一般 `~/.config/nota/themes`） | 透传 `config_dir` 的错 |

⚠️ `user_themes_dir()` **只算路径不建目录**——`nota_doc_themes_dir` 命令那侧才 `ensure_dir`。
理由：首次启动就凭空造一个空目录，用户会以为里面该有什么东西。

⚠️ **它是当前唯一的主题目录**。2026-09-23 之前这里还有个 `theme_dirs()`（三条来源，
含 Typora 自己的两个主题目录），那版整个删了，理由见上面那一节。

⚠️ `pub fn cache_dir() -> Result<PathBuf>`（`$XDG_CACHE_HOME/nota`）**定义了但没有调用者**——
今天没有任何东西往缓存目录写。留着是因为它是这套布局里少不得的一格，不是漏接的线。

### ~~`pub fn theme_dirs()`~~（**2026-09-23 整个删了**）

**曾经**是主题发现的三条来源（我们自己的 + Typora 的 + Typora flatpak 的），**同时**是
`themes.rs::check_scope()` 那道围栏的依据。

用户 2026-09-23 说「请不要内置typora主题。会侵权。」「typora主题先不用兼容。」之后，
**这个函数连同 `check_scope()` 一起删了**——扫别人的主题目录这件事本身就不做了。

现在只扫**一个**目录：`user_themes_dir()` = `~/.config/nota/themes`（**按 XDG 算**，
别写死 `~/.config`）。围栏也跟着换了一种做法，见 `themes.rs::check_id`。
（`builtin_plugins_dirs()` 那条围栏是另一套，两者都从 `paths.rs` 出去，但服务的对象不同。）

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

## `src-tauri/src/state.rs`（46 行）

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

### ⚠️ 「两个构造函数」那个隐患**真的发生了**，所以删掉了一个（2026-09-24）

这里曾经有一个 `pub fn new(settings: Settings, plugins: PluginHost) -> Self`，
**而它没有任何调用者**（`lib.rs` 一直是手写 `AppState { … }` 字面量）。当时的判断是
"两者字段一致，不构成 bug，只是改字段时要两处都改"——**字段那一半是对的，
而遗漏的不止字段**：

那个构造函数里有一句 `documents.set_strict_markdown(settings.strict_markdown)`，
是全仓**唯一**一处把开机时的标题口径传给文档仓的地方；因为它没人调用，
**设置文件里写着 `strict_markdown = true`，开机的标签页却按宽松算**——
不报错、不崩，只是标题的名字不对（`#标签` 被当成了标题），而且**只有真去比对
正文和标签页才看得出来**。字段一致不代表**行为**一致。

⚠️ 处置不是"把 `lib.rs` 改成调它"，而是**删掉它**：口径现在从
`DocumentStore::new(strict_markdown)` 的**参数**进去，忘就编译不过。
`lib.rs` 那一步的注释、`DocumentStore::new` 的文档、以及回归测试
`建仓时就把标题口径定下来` 是这条的三道锁。

📌 **可迁移的一条**：两个构造同一个东西的入口，**迟早会分叉**——
而且分叉出来的多半不是字段，是**初始化顺序 / 副作用**那类不写在同一行的东西。
发现"有个没人调用的构造函数"时，正确处置通常是**删掉它**，不是"记得两处都改"。

### 测试

无。

---

## `src-tauri/src/settings.rs`（298 行）

用户设置。文件头讲的是三条**互相独立**的外观轴（用户 2026-09-22 明确要求，别混成一条）：

1. `ui_style` —— **界面风格**，一整套设计语言（macOS / Yaru / Adwaita / Windows），
   换的不只是颜色，还包括控件形状、圆角、间距、动效、字体栈。⚠️ 它**不是**"主题"的同义词。
2. `ui_mode` —— 明暗。`auto` 时跟随系统（Linux 走 XDG desktop portal 的 `color-scheme`）。
   这条轴在**任何**风格下都成立。
3. `document_theme` —— **文档主题**，只管正文那一块。
   纯 CSS，用户往 `~/.config/nota/themes/` 里丢一份 `<id>.css` 就能覆盖同名的内置主题，
   **不动应用外壳一分**。

⚠️ **前两条是"界面轴"，第三条不是**（用户 2026-09-23 划的线，原话「这是文档风格，
不是界面风格，不应该影响到UI主题」）。前两条在 `<html>` 上是 `data-ui-*` 属性、
由 `styles/theme.css` 消费；第三条是注进 `<head>` 的一份 `<style>`、只对 `.editor-pane`
之下生效——**连 DOM 属性都没有**。三者的切换界面也不在一处（前两条在偏好设置，
第三条在菜单栏「主题」）。落地形态见 `docs/04-ui-map.md` §3；`docs/04` §3.3 有完整的分工表。

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

### `pub enum ViewMode`

```rust
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "kebab-case")]
pub enum ViewMode { Wysiwyg, Source, Split }
```

`impl Default for ViewMode` → `ViewMode::Wysiwyg`。

⚠️ **它不是第四条外观轴。** 三条外观轴（`ui_style` / `ui_mode` / `document_theme`）
管"长什么样"，这条管"**怎么编辑**"——编辑区里摆几个窗格、谁的话算数。
两者之间没有任何耦合，别把 `view_mode` 写进 `theme.css` 那种地方。

⚠️ 加值时同时要改四处：本枚举、`src/bridge/ipc.ts` 的 `ViewMode`、
`src/ui/commands.ts` 的「视图」栏、`docs/04-ui-map.md`。
**默认值必须和前端 `App.tsx` 的兜底值一致**（两处都写 `wysiwyg`），
否则老设置文件（里面根本没有这一项）打开会进错模式——见下面那条测试的注释。

### `pub struct Settings`

```rust
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(default)]
pub struct Settings {
    pub ui_style: UiStyle,
    pub ui_mode: UiMode,
    pub document_theme: String,
    pub view_mode: ViewMode,
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
| `view_mode` | `Wysiwyg` | **编辑模式**：所见即所得 / 源码 / 分屏。⚠️ 不是外观轴 |
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
| `编辑模式也走_kebab_而且默认是所见即所得` | 三件事：`ViewMode::default() == Wysiwyg`；落盘文本里有 `view_mode = "split"`；**没写这一项的老设置文件**（`toml::from_str("ui_style = \"macos\"\n")`）读出 `Wysiwyg`。⚠️ 专盯"改了不会编译错、只会静默变行为"的那类——默认值错了的症状是"老用户升级后打开文件发现进了源码模式" |

---

## `src-tauri/src/document/mod.rs`（639 行）

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
    /// 严格模式（`Settings::strict_markdown` 的镜像）。
    strict_markdown: bool,
}
```

打开的文档集合。字段全私有，只能通过下面的方法动。
⚠️ `new()` 收**一个参数**（标题口径），不是 `Self::default()` 的别名——理由见下表。

| 方法 | 签名 | 行为 / 失败 |
|---|---|---|
| `new` | `pub fn new(strict_markdown: bool) -> Self` | 空仓库，**建仓时就把标题口径定下来**。⚠️ 它是参数而不是「建完再调一次 `set_strict_markdown`」，因为后者忘得掉、忘了不报错（2026-09-24 修的就是这个：会传它的那个构造函数没人调用，见 `state.rs` 顶上那段）。不关心口径的测试显式写 `LAX` |
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
| `set_strict_markdown` | `pub fn set_strict_markdown(&mut self, strict: bool)` | 跟上开关，**并立刻重算所有已打开文档的标题**（标题是从正文猜的，两种口径看法不同）。值没变就早退。⚠️ 之后只有 `commands::settings::nota_settings_set` 调它 |
| `has_unsaved` | `pub fn has_unsaved(&self) -> bool` | 任一份 `dirty` 就 `true` |

### 测试（10）

| 测试名 | 钉住什么 |
|---|---|
| `标题优先取_front_matter` | front matter 的 `title:` 压过正文里的 `#` 标题 |
| `没有_front_matter_时取第一个标题` | 取第一个 ATX 标题，且**收尾的 `##` 要去掉**（`## 小节标题 ##` → `小节标题`） |
| `代码块里的井号不算标题` | 围栏代码块里的 `# 这是注释不是标题` 不算，取的是块外的 `# 真标题` |
| `井号后没空格严格模式不算标题` | ⚠️ 一条**按两种口径各断一次**：严格下 `#标签` → 回退到 `未命名 7`，宽松（默认）下它是标题。同一段文本、两个结论 |
| `井号后有空格两种模式都算标题` | 两条口径的**交点**：`# 你好` 在两边都是标题 |
| `建仓时就把标题口径定下来` | ⚠️ **2026-09-24 那个真缺陷的回归锁**：`DocumentStore::new(STRICT)` 建出来的仓里 `#标签` 不是标题，`new(LAX)` 建出来的是。它钉的是**构造函数那个参数真的起作用**——「开机时设置到不了文档仓」正是从这里漏过去的 |
| `切换严格模式会重算标题` | 改了开关要**当场**重算已打开文档的标题（标签页上的名字不能等下次 `sync`） |
| `取不到就回退到文件名或未命名` | 有路径时取 stem（`/tmp/我的文档.md` → `我的文档`），没路径时 `未命名 3` |
| `同步相同内容不动_revision` | `sync` 同内容返回原 `revision`；不同内容 `+1` 且 `dirty` 为真 |
| `同一路径只打开一份` | 同路径 `open` 两次拿到同一个 `DocId`，列表长度 1 |
| `存盘后_dirty_归零且另外存能改路径` | 另存为后 `has_unsaved()` 为假、盘上内容等于镜像、`doc.path` 变成新路径 |
| `没路径又没另存要报错` | `save(id, None)` 对未存盘文档返回 `Err` |

⚠️ 测试用的是固定名字的临时目录（`temp_dir()/nota-docstore-*`），**开头先 `remove_dir_all`**。
所以同一个 crate 的这些测试不能并发跑同一份，但名字各不相同，互不干扰。

---

## `src-tauri/src/commands/mod.rs`（17 行）

只有八个 `pub mod` 声明（document / export / menu / plugin / settings / slidev / theme /
workspace），加一段分工说明：**这一层的职责只有三件**——取锁、调下层、
把错误转成人话。**业务逻辑不许写在这里**，命令函数应当短到能一眼看完。
命名约定：命令一律 `nota_` 前缀（它不是装饰，它让前端代码里一眼分得清哪些是跨进程调用）。

无函数、无测试。

---

## `src-tauri/src/commands/document.rs`（103 行）

`nota_doc_*` 十个命令。**每个都是"锁 `documents` → 调 `DocumentStore` → 返回"**，
没有一个函数超过 10 行。

| 签名 | 行为 / 失败 |
|---|---|
| `pub fn nota_doc_new(state: State<'_, AppState>) -> Result<DocId>` | `documents.lock()` → `create_untitled()`。不会失败 |
| `pub fn nota_doc_open(state: State<'_, AppState>, path: String) -> Result<DocId>` | `docs.open(&PathBuf::from(path))`。**已打开就复用**（不重复开标签）并把活动标签切过去。路径不存在/读不了 → `Read{…}` |
| `pub fn nota_doc_sync(state: State<'_, AppState>, id: DocId, text: String) -> Result<u64>` | 前端推文本，返回新 `revision`。前端**去抖 300ms** 调一次，存盘/插件读文档前会强制再调一次 |
| `pub fn nota_doc_settle(state: State<'_, AppState>, id: DocId, text: String) -> Result<u64>` | **装载流程的最后一步**：编辑器把 `setMarkdown` 之后的文本原样交回来认领——「这份文本就是当前的干净文本」。⚠️ 与 `sync` 的差别只有一条：**它同时清掉 `dirty`**。存在的理由是 BUG-12（打开文件就显示已修改）。⚠️ 调用点只有 `EditorPane` 一处，而且**必须在 `handle.focus()` 之后**——`focus()` 自己会派发一笔事务，那一笔就可能改文本 |
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
⚠️ 前端每次**都只请求 `depth = 1`**（2026-09-24 起才算真的用上）：目录节点**可以展开**
（`ui/Sidebar.tsx` 的 `FileTree.toggle`），展开时对**那个子目录**再发一次 `depth = 1`，
把结果缓存在 `Sidebar` 本地的 `kids` 里（不回写 App 那棵树）。所以 `depth > 1` 那条
递归分支**仍然没有调用者**（`sub_path` 那条路是硬要走通的路，不是递归），
它的测试是唯一的使用者。

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

## `src-tauri/src/commands/settings.rs`（46 行）

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

## `src-tauri/src/themes.rs`（349 行）

**文档主题的后端那一半**：发现有哪些主题、把某个主题的 CSS 读出来。
⚠️ **限域（把选择器收到 `.editor-pane` 之下）不在后端**，在前端 `src/styles/doc-theme.ts`——
后端只负责"把文本交出去"。这条分工的理由写在那个文件顶上：改造要用**浏览器的 CSS 解析器**，
而后端没有。

⛔ **文件头写着三件事，改之前必读**：三条外观轴的分工表、「不兼容也不内置 Typora 主题」的版权红线、
以及 `check_id` 那道安全边界。

### `pub struct DocThemeInfo`

⚠️ 字段与 `src/bridge/ipc.ts` 的 `DocThemeInfo` **手抄两份**，改一边必须同批改另一边。
只有三个字段：`id`（键）、`name`（**显示名，可以是中文**）、`builtin`（是不是内置那六套）。

⚠️ **`id` 和 `name` 是两码事**：`id` 是文件名去掉 `.css`，受 `check_id` 的形状约束，
**只能是 ASCII 字母数字与 `-` `_`**；`name` 是给人看的。内置那六套两者不同
（`paper` ↔ 素纸）；用户自己丢的文件两者相同。文件头里有中文文件名的取舍说明。

### `pub fn discover() -> Vec<DocThemeInfo>`

**内置六套按 `BUILTIN` 表的顺序排在最前**（用 `include_str!` 编进二进制，所以新装的机器上
主题菜单不是空的，而且**一份第三方 CSS 都不带**），后面接用户目录里多出来的，按 id 排序。

⚠️ 用户文件与内置**同名时不是删掉内置再追加**——是**就地翻掉 `builtin` 标记**。
这样那一条还留在菜单原来的位置上，不会因为"我改了一下素纸"就跳到列表末尾。

⚠️ **目录不存在不是错**（`user_ids()` 里 `read_dir` 失败一律当空表），`*.css` 之外的后缀一律不看。

### `pub fn css_of(id: &str) -> Result<String>`

先 `check_id`，再「用户文件存在就用它，否则查 `BUILTIN`」，**两边都没有就报错**。
⚠️ **报错而不是给空串**：给空串的话界面会安静地变成"没样式的裸 HTML"，
用户根本不知道是自己把文件删了。有一条用例专门钉这个。

⚠️ 读用户文件前要过 `check_size`，上限 `MAX_CSS_BYTES` = **2 MiB**。挡的是"往主题目录里
丢了个大文件，读进来把内存吃光"——这份文本要整个过一遍 IPC。

### `fn check_id(id: &str) -> Result<()>`（私有）

**这是文档主题唯一的围栏。** 只放行 **ASCII 字母数字与 `-` `_`**（长度 1..=64），
因为路径是拿它拼出来的（`<主题目录>/<id>.css`）。

⚠️ **白名单而不是黑名单**："过滤掉 `..`"那种写法要考虑分隔符、编码、大小写各种花样，
白名单是"不在表里的一个都不放行"，**结构上更难绕过**。
⚠️ 代价是**中文文件名用不了**，这是有意的取舍——显示名在文件里写着，文件名只是个键。
⚠️ 这个做法比上一版的"传路径 + 目录前缀检查"**更强**：那版没有漏洞，但这一版
前端**根本没有**"让后端读任意文件"的能力，是结构上不可能出错。

### `pub fn user_themes_dir() -> Result<String>`

转发 `paths::user_themes_dir()` 再 `ensure_dir`——「打开主题文件夹」这个动作要求目录真的存在。
**返回 `String` 而不是 `PathBuf`**：它的唯一去处是要交给前端/opener 的。

### 测试（6）

| 用例 | 钉住什么 |
|---|---|
| `内置主题的_id_与文件名一一对应` | ⚠️ `BUILTIN` 表里的 `id` 真能在 `src/styles/themes/` 下找到同名文件 |
| `内置主题不碰界面变量` | ⚠️⚠️ **本仓库最重要的一条主题用例**。逐份扫内置 CSS，不许出现 `--ui-font-size` / `--font-ui` / `--sidebar-width` / `--dock-width` / `--toolbar-height` / `--statusbar-height` / `--shadow` / `--nota-bridge`。**它就是「文档主题碰不到外壳」这条线的机器判据**——没有它，哪天有人图省事在主题里加一条界面变量，谁都不会发现 |
| `内置主题都带自己的一套代码高亮` | 每份都要有 `--code-*`。⚠️ 代码块底色是主题挑的，缺了会"深底配深字" |
| `拒绝形状不对的_id` | `check_id` 挡住 `../x`、`a/b`、空串、超长、中文 |
| `取一份不存在的主题要报错而不是给空串` | ⚠️ 静默降级成裸 HTML 是这里最坏的结果 |
| `目录不存在时清单只剩内置的` | ⚠️ 没装过任何主题的机器就是这种情况，**不是错** |

---

## `src-tauri/src/commands/theme.rs`（36 行）

三条命令，对应界面上三个动作。**都是薄壳**，逻辑全在 `themes.rs`。

| 签名 | 行为 / 失败 |
|---|---|
| `pub fn nota_doc_themes() -> Vec<DocThemeInfo>` | `themes::discover()`。⚠️ **返回 `Vec` 不是 `Result`**——扫不到主题不是错 |
| `pub fn nota_doc_theme_css(id: String) -> Result<String>` | `themes::css_of(&id)`。返回**文本**不是渲染结果，限域在前端做。⚠️ **入参是 id 不是路径** |
| `pub fn nota_doc_themes_dir() -> Result<String>` | `themes::user_themes_dir()`，**建好**再返回，给「打开主题文件夹」用。⚠️ 返回 `String` 是因为要给前端/opener 插件 |

无测试（逻辑都在 `themes.rs`，测试也在那边）。

---

## `src-tauri/src/commands/plugin.rs`（133 行）

| 签名 | 行为 / 失败 |
|---|---|
| `pub fn nota_plugins_list(state: State<'_, AppState>) -> Result<Vec<PluginInfo>>` | `host.list_info()`。**含加载失败的**，界面上要标红 |
| `pub fn nota_plugin_set_enabled(state: State<'_, AppState>, id: String, enabled: bool) -> Result<()>` | 透传 `PluginHost::set_enabled`。没有这个插件 → `other("没有这个插件：{id}")` |
| `pub fn nota_plugin_call(state: State<'_, AppState>, plugin: String, command: String, args: Option<serde_json::Value>) -> Result<serde_json::Value>` | 见下 |
| `pub fn nota_plugin_find_command(state: State<'_, AppState>, command: String) -> Result<Option<String>>` | `host.find_command_owner(&command).map(str::to_owned)` |
| `pub fn nota_plugin_panels(state: State<'_, AppState>) -> Result<Vec<PluginPanel>>` | `host.panels()`。**前端挂载后主动拉一次**，别改成等事件（BUG-13） |
| `pub fn nota_plugin_menus(state: State<'_, AppState>) -> Result<Vec<PluginMenuItem>>` | `host.menus()`。⚠️ **今天仍然没有调用者**——菜单栏有了（backlog 第 40 项已结），但还没把它拉来的条目挂进去（第 42 项） |

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
  从 `api.plugin.menus()` **拉**回来的那份清单里带过来（BUG-13 之前是从
  `nota:plugin-menu` 事件里拿的，那条事件已经删了）。**不要让前端凭命令名去猜是哪个插件的**——
  两个插件重名时猜错就是静默跑到别人家里。`nota_plugin_find_command` 就是为这条对账准备的。
- 前端**只有 `panels` 有调用者**（`App.tsx` 启动时拉一次）；`call` / `findCommand` /
  `menus` 今天都只是声明——`call` 与 `menus` 都卡在**同一根线**上：菜单栏还没把插件的
  菜单项挂进去（`docs/07` 第 42 项）。

无测试。

---

## `src-tauri/src/commands/menu.rs`（24 行）

一个命令，把前端推来的原生菜单树交给 `native_menu::apply()`。

### `nota_native_menu_apply(app, nodes: Vec<NativeMenuNode>) -> Result<bool, String>`

返回 `bool` 而不是 `()`：**前端要靠这个返回值决定要不要隐藏自绘菜单栏**。
`ok == false` 表示"没挂上"（非 macOS，或者 Tauri 那边报错），
前端就继续用自绘的那套——**而不是变成"一个菜单都没有"**。

---

## `src-tauri/src/commands/export.rs`（184 行）

导出与打印的**落盘那一步**。两个命令，都是薄的：

| 命令 | 干什么 |
|---|---|
| `nota_export_write(path, content) -> Result<String>` | 把前端生成好的 HTML 写到用户选的路径，返回**真实写出去的路径** |
| `nota_export_print(app, doc_path, title, content) -> Result<String>` | 写到落点，再 `opener` 交给系统默认程序。返回那个落点 |

### ⚠️ 为什么 HTML 不在这里生成

生成要跑一遍 Markdown → DOM。后端要做，就只能另写一个序列化器，或者拉起一个
无头 webview——两条都是**第二套渲染路径**，和屏幕上那份迟早不一样。所以这里
只收字符串、只落盘。

### `fn 打印落点(doc_path: Option<&str>, title: &str) -> PathBuf`（私有）

| 情况 | 落点 |
|---|---|
| 有文档路径 | **文档自己那个目录**下的 `.nota-print.html` |
| 没有（未保存的新文档） | `<系统临时目录>/nota-print-<洗干净的标题>.html` |

⚠️ **落在文档目录是有意的，不是图省事**：正文里 `![](./img.png)` 是相对路径，
换个目录图片就全丢了。代价是会在用户目录里留下一个点开头的隐藏文件——和 Slidev 的
`.nota-slidev-<id>.md` 是同一类取舍：**名字带点、不污染目录列表**。

### `fn 清文件名(title: &str) -> String`（私有）

把 `/ \ : * ? " < > |` 换成 `-`。⚠️ **洗成空串、或者只剩横杠时给「未命名」**：
不这样的话 `title = "/"` 会造出一个叫 `-`（或 `nota-print-.html`）的文件——一个
既有隐藏属性、名字里又没有任何信息的东西。

### 测试（5）

覆盖：落点跟文档目录走 / 没文档路径就落临时目录 / 标题里的分隔符被换掉（不会
拼出子目录）/ 洗成空串或只剩横杠不留下无信息文件 / **写出去的字节与给进来的一模一样**。
最后一条是打印之外那一类"只要透明"的接口该有的底线。

---

## `src-tauri/src/slidev.rs`（638 行）

Slidev 预览服务器的**生命周期**。文件头讲了四件事：为什么是「起服务器 + 开窗口」而不是自己画幻灯片、
同步为什么不靠消息而靠 Slidev 自己盯文件、**四条实测结论**（2026-09-23 跑真 Slidev 53.0.0 跑出来的）、
以及锁只有一把、且不能带过 `close()` 那条规矩。
⚠️ 2026-09-24 起**「装没装」那半不在这个文件里了**（`slidev_probe.rs`）；两边共用的只有
`command_from_env()` / `split_command()` / `kill_group()` 三件小事（`pub(crate)`）。

### 公开接口

| 函数 | 签名 | 说明 |
|---|---|---|
| `SlidevState` | `pub struct SlidevState(pub Mutex<Option<Server>>)` | Tauri 的托管状态。⚠️ **不放进 `AppState`**——那四个句柄的锁序不变量是给文档/插件用的，这个是子进程 |
| `SlidevInfo` | `{ port: u16, url: String, entry: String, doc_id: DocId }` | 给前端的快照。⚠️ `url` 是 `http://localhost:{port}/`（**不是** `127.0.0.1`，见下） |
| `start` | `(state, entry_dir: Option<PathBuf>, doc_id, markdown: &str) -> Result<SlidevInfo>` | 挑端口 → 写入口 → 起进程。**不等端口** |
| `sync` | `(state, markdown: &str) -> Result<()>` | 整份重写入口文件。⚠️ **没在跑时是空操作 `Ok(())`**，不是错误——前端不需要先查状态 |
| `probe` | `(state) -> bool` | 端口通了没有。⚠️ 带 **300ms** 超时，前端每 500ms 调一次，所以它必须快 |
| `log_tail` | `(state) -> String` | 进程输出最后 30 行。**启动失败时前端整段端给用户**——缺主题、端口被占这类病因只有 Slidev 自己说得准 |
| `stop` | `(state)` | 杀进程组 + 删入口 + 清状态。⚠️ 先 `take()` 再**在锁外** drop（`Drop` 里要杀进程，不该占着锁） |
| `status` | `(state) -> Option<SlidevInfo>` | 当前会话。前端热重载后靠它把界面状态接回来 |

### 内部

| 函数 | 做什么 |
|---|---|
| `pick_port()` | 绑 `[::1]:0` 问内核要一个，放开，再确认 v4 上也是空的（⚠️ 两套栈都要试，因为 Slidev 只绑 v6 而别的工具可能只占 v4） |
| `probe_addrs(port)` | 探活地址表：`localhost` 解析结果 + 显式 `::1` + `127.0.0.1` |
| `choose_entry(dir, doc_id, markdown)` | 入口路径。**文档目录优先**，写不进去（未存盘 / 只读目录）退回 `~/.local/share/nota/slidev/` |
| `entry_name(doc_id)` | `.nota-slidev-<id>.md`。⚠️ 点开头：文件管理器默认不显示，也不容易和用户的 `slides.md` 撞名 |
| `spawn_with(cmd, entry, port)` | 真正起进程的那段（可测）。`--port` `--no-open`、`BROWSER=none`、`NO_COLOR=1`、`process_group(0)`、两根管道都抽干。⚠️ 命令串经 `split_command` 拆，命令本身来自 `command_from_env()`（`NOTA_SLIDEV_CMD` 或 `DEFAULT_CMD`） |
| `kill_tree(child)` | 杀**整个进程组**。⚠️ 进程链是三层（`sh` → `npm exec` → `node`），只杀 child 会留下 node 继续占着端口 |

### ⚠️ 两个容易写错的地方

- **`--no-open` 不是 `--open false`**：后者那个 `false` 是个**非空字符串**，会被 Slidev 当成"要打开的路径"。
- **只绑 `[::1]`**：`ss -ltnp` 显示 `[::1]:4123`，`curl 127.0.0.1:4123` 不通、`curl localhost:4123` 通。给窗口的 URL 因此写 `localhost`（`127.0.0.1` 在某些机器上会连不上）。

### 测试（10 条）

挑端口（两套栈都得空）· 入口名是点文件 · 未存盘退回数据目录 · 入口名跟着文档走（不互相覆盖）·
同步是**整份替换**不是追加 · 没在跑时同步是空操作 · 日志环只留最后几行 ·
杀的是进程组不是那个壳 · 收摊之后进程真没了 · 命令不存在时报人话。
⚠️ 最后那条**探测那半**的用例留在这儿（它验的是 `start` 这条路）；
探测自己的 10 条在 `slidev_probe.rs`。

---

## `src-tauri/src/slidev_probe.rs`（461 行）

**「本机装没装 Slidev」**——点「视图 → Slidev 预览」之后那个面板背后的一次探测。
2026-09-24 从 `slidev.rs` 拆出来（那时那边 1023 行、超了 1000，见 `docs/09` §4）。
拆的判据是**职责**：`slidev.rs` 管「起一个预览会话」，这里管「**现在这一下能不能起**」——
只在点菜单那一刻跑一次，不起服务器、不碰会话状态。

### 它回答的是什么，以及为什么不能换个便宜的问法

要回答的是**「现在这一下能不能跑起来」**，不是「npm 上有没有这个包」。
后者一定会下几百 MB，而用户只是点了一下菜单。所以做法是**跑 `start` 会跑的那条同一条命令**
（`NOTA_SLIDEV_CMD` 或 `DEFAULT_CMD`）、**同一个 cwd**（文档所在目录），末尾加 `--version`，
并给 npm 上 `npm_config_offline=true`（cache mode = `only-if-cached`）。
⚠️ **两条路都不碰网络**，实测：缓存命中 **1.296 秒** → 吐 `53.0.0`；没命中 **0.256 秒** → `npm error code ENOTCACHED`。

⚠️ **判据是两条同时成立**（这是 2026-09-24 踩出来的第二道闸）：CLI 离线拿得到 **且**
文档目录**向上逐层**找得到 `node_modules/@slidev/theme-*`。
因为 `@slidev/cli` **不依赖** `@slidev/theme-default`（官方脚手架模板才依赖），
空目录里起它**立刻退出**：`The theme "@slidev/theme-default" was not found…`。
向上找是必须的——Node 解析 `node_modules` 就是这么走的。

### 接口

| 名字 | 签名 | 说明 |
|---|---|---|
| `SlidevProbe` | `{ state, command, version, message, detail, project_dir }` | 给面板的报告。⚠️ **判定的话全在 `message`（中文，后端写的）**，前端只按 `state` 摆按钮 |
| `ProbeState` | `Ready` \| `Missing` \| `Unknown` | `serde(rename_all = "kebab-case")`。⚠️ `Unknown` **不等于没装**（自定义命令挂住之类），文案要说清 |
| `probe_install` | `(Option<&Path>) -> SlidevProbe` | 唯一入口，**纯函数式**：不改任何状态、不起服务器 |
| `theme_installed` | `(dir: &Path) -> bool` | 向上逐层找 `node_modules/@slidev/theme-*` |
| `run_version` | `(program, args, cwd, timeout) -> Check` | 起进程 + 限时。⚠️ 不用 `wait_timeout`：`process_group(0)` 起、拿 `pid`、`recv_timeout(20s)`，超了 `kill_group(pid)` **杀整个组**（自定义命令可能是 `npm run dev` 那种壳） |
| `last_line` / `tail_of` | `(&str) -> Option<String>` / `String` | 取输出的最后一行 / 末尾 8 行（每行截到 200 列）。多了面板撑爆，少了看不出病因 |

### 测试（10 条）

默认命令不再自动装包（⚠️ `--yes` 一旦回来，"没装"就变成一次几百 MB 的下载）· 拆命令按空白分词 ·
主题装没装看的是项目里的 `node_modules` · 主题在**上一层**父目录里也一样算 ·
没装 node 时探测点名 node · 命令能报版本但文档没存盘时仍然拦住 ·
命令和主题都在才说可以打开 · 光有命令没有主题也拦住且说清缺什么 ·
自定义命令挂住时**超时**而不是一直等 · 报错时留的是**末尾几行**而不是整篇。

⚠️ 这些是**真起进程**（`printf` 当假 CLI、`sleep` 当挂住的自定义命令），没有 mock——
探测的全部风险就在"真程序在真系统上怎么反应"。

---

## `src-tauri/src/commands/slidev.rs`（192 行）

八条命令，**只有接线**：取锁、问文档目录、开/关窗口。真正的活在 `slidev.rs` 与 `slidev_probe.rs` 里。
⚠️ 命令层要真跑就得起一个 Tauri 应用实例，测不出什么——所以这里**故意没有测试**，
而那十条有意义的都在 `slidev.rs`。

| 命令 | 签名 | 说明 |
|---|---|---|
| `nota_slidev_start` | `(SlidevState, AppState, doc_id: DocId, markdown: String) -> Result<SlidevInfo>` | 先从 `documents` 里问出文档的父目录（只对**已存盘**的文档有值），再交给 `slidev::start` |
| `nota_slidev_probe_install` | `(AppHandle, DocId) -> Result<SlidevProbe>` | ⚠️ **唯一异步的一条**：探测要起进程、最长 20 秒，所以走 `tauri::async_runtime::spawn_blocking`（在主线程上等就是冻界面，同 `start` 那条口径）。**不改任何状态** |
| `nota_slidev_probe` | `(SlidevState) -> bool` | 端口通了没有。直接转发 |
| `nota_slidev_log` | `(SlidevState) -> String` | 直接转发 |
| `nota_slidev_status` | `(SlidevState) -> Option<SlidevInfo>` | 直接转发 |
| `nota_slidev_open_window` | `(AppHandle, SlidevState) -> Result<()>` | 开预览窗（已开则 `set_focus`）。⚠️ 窗口**开在 Rust 这边**是因为位置要读主窗口几何，而且"窗口和服务器同生共死"就不必跨进程传 |
| `nota_slidev_sync` | `(SlidevState, markdown: String) -> Result<()>` | 直接转发 |
| `nota_slidev_stop` | `(AppHandle, SlidevState) -> Result<()>` | `slidev::stop` **然后** `close_window`。⚠️ **顺序不能反**：关窗口会同步触发 `Destroyed`，那个回调**也要**这把锁，反了就是同线程重入 |

### ⚠️ 两个常量必须和三处对齐

`WINDOW = "slidev"`：这个 label 出现在**三个地方**——这里、`lib.rs` 里
`Destroyed` 分支认的字符串、前端的口头约定。改成别的**不会报错**，只会让
"关预览窗 → 收服务器"那条链静默断掉（服务器留着，菜单还勾着）。

`MAIN = "main"`：取自 `tauri.conf.json` 的 `app.windows[0].label`。

### 三个私有函数

- `entry_dir(app, doc_id) -> Option<PathBuf>`：从 `documents` 里问出文档的父目录（只对**已存盘**的文档有值）。
  ⚠️ **`start` 和 `probe_install` 必须走同一份**——两边各自去问的话，探测说的"目录"和真起进程用的目录
  就可能不是同一个，那这个面板还不如不做。


- `open_window(app, url)`：已有窗口就 `set_focus` 不开第二个（多开会出现"两个窗口跟着同一份文件变"的怪相）。
- `right_of_main(app) -> (f64, f64)`：贴主窗口右边，留 8 像素。⚠️ **单位是逻辑像素**——`position()` 吃逻辑值，而 `outer_position()` / `outer_size()` 给的是物理值，中间必须过一遍 `scale_factor`，否则 2 倍屏上窗口跑到两倍远。问不到几何时返回 `(0, 0)` 而**不报错**：窗口出现在哪儿是小事，因为定位失败就让整场预览起不来才是大事。

---

## `src-tauri/src/native_menu.rs`（492 行）

**原生菜单（macOS 兜底）。** 用户 2026-09-23 拍板「两套都要：自绘为主，
加原生菜单兜底」。形状与自绘菜单同源（同一份 `MENUS`），见 `docs/04` §2.1c。

### ⚠️ 用 `cfg!` 不用 `#[cfg]`

```rust
if !cfg!(target_os = "macos") { return Ok(false); }
```

这样**这份代码在 Linux 开发机上也照样过类型检查**。写成 `#[cfg(target_os)]`
的话，macOS 专属的代码在开发机上从来没被编译过，等到打包那天一次性爆一堆错。

### ⚠️ 加速器转换是最容易出错的一环

| 输入（`commands.ts`） | 输出（muda） | 为什么 |
|---|---|---|
| `Ctrl+S` | `CmdOrCtrl+S` | muda 的 `CTRL` 在 macOS 上是**真的 Control 键**，用户按的是 ⌘ |
| `Alt+↑` | `Alt+Up` | 箭头**只认 Code 名**（`UP`/`ARROWUP`），**不认 `↑` 这个字形**；`native_key()` 负责把字形折成名字 |
| `Ctrl+Shift+1`…`9` | `CmdOrCtrl+Shift+1` | 数字收字面量，也收 `Digit1` |
| 认不出的写法 | `None` | **返回 `None` 而不是瞎猜**，并 `eprintln!` 记一笔 |

⚠️ **灰掉的项一律不带快捷键**（`leaf_accel()` 对禁用项返回 `None`）。
这不是省事：**AppKit 连禁用的项也参与快捷键匹配**——灰着的 `⌘C` 会把系统复制
吃掉，灰着的 `⌥↑/⌥↓` 会把段落导航吃掉。

### macOS 上多一个应用菜单

`build()` 在最前面插一个 app 子菜单（关于 / 服务 / 隐藏 / 隐藏其他 / 显示全部 /
退出）——那是 macOS 的规矩，缺了它「关于」和「退出」就没有落脚处。
**只在 macOS 插**，别的平台插了会多出一栏莫名其妙的东西。

### 测试（6 个）

| 测试 | 盯什么 |
|---|---|
| `全部键位都转得出来` | 50 对**手抄**的 `accel → muda 串`，一条都不许漏。⚠️ 抄的源是 `grep -c "accel:" src/ui/commands.ts`（2026-09-23 三种编辑模式让这个数从 48 变 50） |
| `手抄的表和_commands_ts_一样多` | 上面那张表与 `commands.ts` 的条数一致——**加了菜单项忘了补测试会在这里响** |
| `ctrl_转成_cmdorctrl_而不是真的_control` | 上面那条 macOS 陷阱 |
| `拿不准的一律不放行` | 认不出的写法必须返回 `None` |
| `灰掉的项不带快捷键` | AppKit 那条陷阱 |
| `分隔线不看别的字段` | `"sep"` 只出分隔线 |

⚠️ 断言 `!"CmdOrCtrl+S".contains("Ctrl+")` 这种**是错的**——`"CmdOrCtrl+S"`
里**真的有** `Ctrl+` 这个子串。测试里为这条留了注释。

---

## `src-tauri/src/plugin/mod.rs`（434 行）

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

### `pub struct PluginPanel` / `PluginMenuItem` / `PluginPrompt`

三个都是**给前端看的只读快照**（`Serialize`），字段名与 `ipc.ts` 那边一一对应，
⚠️ **两份手抄的定义**。

```rust
pub struct PluginPanel {
    pub plugin: String, pub id: String, pub title: String,
    pub icon: Option<String>,
    /// `right`（默认）/ `left`。认不出的值前端当地址用，宿主不拦。
    pub location: String,
}

pub struct PluginMenuItem {
    pub plugin: String, pub label: String,
    /// 点下去要调的**命令名**，前端拿去配 `nota_plugin_call(plugin, command)`
    pub command: String,
    pub menu: String,                        // plugins / file / format …
    pub accelerator: Option<String>,
    pub prompt: Option<PluginPrompt>,        // None = 直接跑
}

pub struct PluginPrompt {
    pub arg: String,                         // 填的值放进 args 的哪个键
    pub label: String, pub placeholder: String, pub hint: String,
    pub secret: bool,                        // 画成密码框；⚠️ 只遮屏幕
}
```

⚠️ `PluginPanel` 里**没有 `render`**——`render` 是函数，只活在 registry 里。
清单回答"有哪些面板"，内容回答"这个面板现在长什么样"，**两个问题两条路**
（[docs/12](12-plugin-runtime.md) §4.6）。

⚠️⚠️ **`PluginPrompt` 有两份实现，字段名必须一样**：菜单项那一份在**本文件**
（`读提示`，因为 registry 里存的是一张原表，过不了 `Serialize`）；面板按钮那一份在
**前端**（`ui/panel-nodes.ts::提示`）——面板内容走 `剥成_json`，那边只保证"是 JSON、
有上限"，**不认形状**。两条路最后都汇进 `ui/plugin-prompt.ts::问参数`，
所以字段名或默认值不一致的话，**同一个 `prompt` 写在菜单里和写在面板上会是两种表现**。

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
| `menus` | `pub fn menus(&self) -> Vec<PluginMenuItem>` | 同上，菜单项。📌 **2026-09-24 起前端真的用上了**（backlog 第 42 项）：插件那一列插在 `help` 之前，命令 id 是合成出来的 `__plugin:<plugin>:<command>` |
| `panel_content` | `pub fn panel_content(&self, plugin_id: &str, panel_id: &str) -> Result<serde_json::Value>` | **现调**那个面板的 `render`，拿到它**此刻**的内容。⚠️ 它**会跑插件的 Lua**，所以调用方必须放到阻塞线程上（`commands/plugin.rs` 那条 `spawn_blocking`）——`render` 里常常要起 git 子进程，跑在主线程上就是**冻界面** |
| `count` | `pub fn count(&self) -> usize` | 插件**条目**数（含失败的），`lib.rs` 启动日志用它 |
| `unload_all` | `pub fn unload_all(&mut self) -> ()` | 逐个 `LuaPlugin::unload()`。窗口销毁时调 |

**私有辅助（不在 `impl` 里，是模块级自由函数）：**

| 函数 | 签名 | 说明 |
|---|---|---|
| `生效的` | `fn 生效的(&self) -> impl Iterator<Item = &LuaPlugin>` | **加载成功 且 用户没禁用**。命令、面板、菜单三处**共用同一条判据**——各自写一遍的话，改一处忘一处就会出现"禁用了还列在面板里"这种半生效状态 |
| `读面板` | `pub(crate) fn 读面板(lua: &Lua, plugin_id: &str) -> Vec<PluginPanel>` | 从 registry 的 `nota_panels` 读。⚠️ 收 `&Lua` 而不是 `&LuaPlugin`，**是为了能被用例钉住**：BUG-13 的病灶正是写的一侧和读的一侧对不上，而 `LuaPlugin` 要先 `load`（要真的 `AppHandle`）才拿得到 |
| `读菜单` | `pub(crate) fn 读菜单(lua: &Lua, plugin_id: &str) -> Vec<PluginMenuItem>` | 同上。⚠️ 菜单项里的 `prompt` **只在这里收形状**（menu 那一条是个原表，过不了 `PluginPrompt` 的 `Serialize`），面板按钮的那一份在前端收——**两份字段名必须一样**，见 `PluginPrompt` |
| `读提示` | `fn 读提示(t: &mlua::Table) -> Option<PluginPrompt>` | ⚠️ **`arg` 缺了或为空 ⇒ 返回 `None`，整条 `prompt` 当没写**——问了也送不出去，不如不问。`label` 空 → `"请输入"`；`placeholder` / `hint` 空 → `""`；`secret` 缺 → `false` |
| `声明的` | `fn 声明的(lua: &Lua, reg: &str) -> Vec<mlua::Table>` | 读某个 registry 名下的数组。**没这个键就静默返回空表**——插件没申请能力、或 `on_load` 半路失败，都不是异常 |
| `可调用的` | `fn 可调用的(&self, plugin_id: &str) -> Result<&LuaPlugin>` | **存在 / 没被禁用 / 加载成功** 三道闸，**派发命令与取面板内容共用**。⚠️ 抽出来正是为了不"两处相乘"：各写一遍的话，改一处忘一处就会出现"禁用了还能拉面板"这种半生效状态。⚠️ **用户禁用先于加载状态判**——禁用是用户的显式动作，说"已被禁用"比说"加载失败"更接近用户看到的事实 |
| `REG_PANELS` / `REG_MENUS` / `EVENT_PANEL_DIRTY` | `pub const REG_PANELS: &str = "nota_panels"`；`EVENT_PANEL_DIRTY = "nota:plugin-panel"` | **只此一处定义**。写的一侧（`lua/api/ui.rs`）和读的一侧必须说同一个字符串，拆成两处字面量就是又造一对"两处相乘"。⚠️ `EVENT_PANEL_DIRTY` 是**事件**（"变了"这个动作），三处说同一个字符串：发射侧 `ui.rs::刷新表`、`ipc.ts::events.pluginPanel`、`ui/PluginDock.tsx` 的订阅 |

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

## `src-tauri/src/plugin/manifest.rs`（393 行）

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
| `NetworkHttp` | `network.http` | 发 HTTP 请求。装了才给 `nota.http`，实现见 `lua/api/http.rs`（[docs/13](13-lua-api.md) §9） |
| `UiNotify` | `ui.notify` | 弹通知 |
| `UiPanel` | `ui.panel` | 注册侧栏面板 |
| `UiMenu` | `ui.menu` | 往菜单里加条目。⚠️ **单独申请它不会装 `nota.ui`**，见 `lua/api/mod.rs` |
| `SettingsOwn` | `settings.own` | 读写插件自己的设置段。装了才给 `nota.settings`，实现见 `lua/api/settings.rs`（[docs/13](13-lua-api.md) §10） |

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

## `src-tauri/src/lua/mod.rs`（516 行）

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

## `src-tauri/src/lua/api/mod.rs`（400 行）

注入给插件的 `nota.*` 表。

### 文件头的"为什么"要点

**一条硬规矩：按能力装表，不装空壳。** 插件没申请 `document.read`，`nota.document`
就是 `nil`。**不要**给它装一张调用时才报"你没权限"的表——那既让插件作者在开发期发现不了
问题（写完才炸），也让"权限"变成一句运行时的客气话而不是一道结构上的墙。

唯一的例外是本文件里那几个**永远可用**的东西（`log` / `command` / `event` / `diff` /
`version` / `plugin_id`）：它们不碰文档也不碰磁盘，是插件跟自己、跟宿主说话用的；
`diff` 是另一类**纯函数**（一段文本进、一段文本出，见 `lua/api/diff.rs` 那一节）。

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
| `http` | `network.http` | 见 `http.rs`（`get`/`post`/`request`） |
| `settings` | `settings.own` | 见 `settings.rs`（`get`/`set`/`all`） |

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

📌 **更正（2026-09-24）**：`nota.http` 与 `nota.settings` 这两张表**曾经是空壳**——
装的是 `not_implemented(...)`，调用一律返回一句"尚未实现（见 docs/07 第 N 项）"。
那份诚实当时有用（总比 `attempt to index a nil value` 强，后者会让人以为是自己
能力没申请对，白查半天），但空壳终究是空壳：AI 插件因此只能预览、**存不住密钥**。
本轮（`docs/07` 第 12、13 项）两样都真做出来了，`not_implemented` 这个函数
**已经从代码里删除**（`api/mod.rs` 只剩这条历史注释）。

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

### `fn 装_ui吗(manifest: &Manifest) -> bool`（私有）

`ui.notify` / `ui.panel` / `ui.menu` 任一条就算数（`const UI能力`）。
⚠️ 单独拎出来的理由是 **BUG-8**：`build()` 要真的 `AppHandle`，用例里构造不出来，
而这条判断是纯的、又正是最该被用例钉住的那一条。详见 `lua/api/ui.rs` 那一节。

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

⚠️ **与 `ui.rs::剥成_json` 的关系**：两处是**两份实现**（一个发事件、一个喂面板），
在 `Table` 判定上必须同口径（都看 `raw_len()`），但在"过不了 JSON 的值怎么办"上
**故意不同**——这里变成一句 `Debug` 字符串（事件是调试用的，看得见东西比看得见 `null` 强），
面板那边变成 `null`（面板是给人看的界面，一句 `Function(0x…)` 没有意义）。
**改动其中一处时要记得另一处的存在。**

### 测试（4）

| 测试名 | 钉住什么 |
|---|---|
| `每一条_ui_能力都能单独装出_nota_ui` | **BUG-8 的回归用例**：`UI能力` 数组里**每一条**单独拿去问 `装_ui吗`，都得是真 |
| `没申请_ui_能力就不装_nota_ui` | 按能力装表、不装空壳 |
| `ui_能力清单要和_ui_rs_对得上` | ⚠️ **数出来的**：`include_str!("ui.rs")` 里 `Capability::Ui…` 的出现次数要和 `UI能力` 数组的长度一致。漏了 `||` 一处、或者加了一条能力忘进数组，都是这条测试先炸 |
| `能力的_serde_名字与_parse_说同一套话` | 清单里的写法（`network.http`）与 `Capability::parse` 认的是同一套名字——两份定义会漂 |

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

## `src-tauri/src/lua/api/ui.rs`（710 行）

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

📌 **更正（2026-09-24）**：这一段曾写"面板**内容**仍由插件自己推事件填
（`nota.event.emit`），纯 Lua 声明式的面板 DSL 排在后面轮次（`docs/07` 第 15 项）
——在那之前面板框里是空的"。**第 15 项已经落地**，而落地的形态**不是**"推内容"：

`register_panel` 多收一个 `render` 函数，它返回一串**内容块**；前端按白名单渲染
（见下面的「面板内容」一节与 [docs/13](13-lua-api.md) §8.5）。**内容也是拉，不是推**——
理由是"现在有哪些改动"这件事本身就是**状态**，不是"发生的事"，和面板清单同理。
插件只在**自己知道内容变了**的时候喊一声 `nota.ui.refresh(id)`，
而那一声**只是提示**：丢了也不影响正确性（插件刷新时面板可能还没打开，事件没人收，
但用户打开面板时一定会拉一次）。**判据**：把 `nota.ui.refresh` 那一条事件整个删掉，
打开面板仍然该看到正确内容。做不到就是内容被当成事件在传了。

⚠️ 插件仍然写不出 HTML、写不出脚本：认不出的 `kind` 前端如实显示"不认识"，
**不**退化成 `dangerouslySetInnerHTML`。

### `pub fn build(lua: &Lua, manifest: &Manifest, ctx: &HostContext) -> NotaResult<Table>`

⚠️ 三个方法**各自按自己的能力单独装**，互不牵连：

| 方法 | 装的条件 | 签名 | 去向 |
|---|---|---|---|
| `notify` | `ui.notify` | `(msg: string, level: string?) -> ()` | 事件 `nota:notify`（**推**） |
| `register_panel` | `ui.panel` | `(spec: table) -> ()` | registry `nota_panels`（**拉**） |
| `refresh` | `ui.panel` | `(id: string?) -> ()` | 事件 `nota:plugin-panel`（**推**，只是"去重拉"的提示） |
| `register_menu` | `ui.menu` | `(spec: table) -> ()` | registry `nota_menus`（**拉**） |

⚠️ `refresh` 与 `register_panel` **同一条能力**（`ui.panel`）管着——它俩是"面板这件事"
的两头（声明 / 内容变了），拆成两条能力只会让人申请一条忘了另一条。不传 `id`
表示"我这个插件的所有面板都该重拉"。

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
| `render` | 否 | `nil` | **函数**，返回内容块数组。⚠️ 只在 registry 里活着，**不进 `PluginPanel` 那份快照**——前端拿到的清单里没有它，也不需要 |

⚠️ `render` 写了个**不是函数**的东西（表、字符串）**当场报错**
（`"插件 {id} 的面板 `{panel}`：`render` 必须是一个函数"`）。拖到用户打开面板才报的话，
报错的地方（前端一次渲染失败）离病因（`render` 写成了表）已经很远了。

⚠️ 声明了面板却**没给** `render` **不算错**——一个插件可以只声明面板占个位。
宿主这边如实说"没有提供 `render`，所以没有内容可显示"（`面板内容` 的报错），
前端显示一句解释，不是一片空白。

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
| `accelerator` | 否 | `nil` | 载荷里是 `null`。⚠️ 撞车判据是**先到先得**，插件那一列排在 `help` 之前 ⇒ **内置快捷键永远赢**，见 `docs/13` §8.3 |
| `prompt` | 否 | `nil` | 「点之前先问一句」的声明，见下 |

⚠️ `register_menu` **不校验 `command` 真的注册过**。写错了要到用户点下去才发现
（错误是"插件 X 没有注册命令 `y`"）。有 `nota_plugin_find_command` 可以事后对账。

⚠️ 重名（同一个插件里两条菜单同 `label`）也**报错**——同一个菜单里两条同名项，
用户分不出该点哪个。

**`prompt` 子表的字段**（`plugin/mod.rs::PluginPrompt`，读的一侧是 `读提示`）：

| 字段 | 必填 | 默认 | 说明 |
|---|---|---|---|
| `arg` | **是** | — | 用户填的值放进 `args` 的哪个键。**缺了整条 `prompt` 当没写**（问了也送不出去） |
| `label` | 否 | `command` 的值 | 对话框上那句话 |
| `placeholder` | 否 | `""` | |
| `hint` | 否 | `""` | 输入框下面那行小字 |
| `secret` | 否 | `false` | 输入框画成密码框。⚠️ 遮的只是**屏幕**，值本身原样存进插件设置文件（**明文**，见 `docs/12` §4.5） |

⚠️⚠️ **同一个 `prompt` 有两份实现，字段名必须一样**：菜单项这一份在**本文件**
（registry 里存的是一张原表，由 `读提示` 收形状），面板按钮那一份在**前端**
（`ui/panel-nodes.ts::提示`）——因为面板内容走的是 `剥成_json`，那边只保证
"是 JSON、有上限"，不认形状。两条路最后都汇进 `ui/plugin-prompt.ts::问参数`，
所以字段名或默认值不一致的话，**同一个 `prompt` 写在菜单里和写在面板上会是两种表现**。

⚠️ **`notify` 那条事件名是硬编码的字符串**，与前端 `ipc.ts` 的 `events` 表是两份手抄的常量。
（面板**清单**与菜单**已经不走事件了**，所以这一对常量今天只剩 `notify` 一处要同步。）
改一边必须改另一边，而且**编译器不会告诉你**。
⚠️ 面板那条 `refresh` 走的事件名（`nota:plugin-panel`）**不是**硬编码的，
它是 `plugin/mod.rs::EVENT_PANEL_DIRTY`——发射侧（本文件）和收侧（`ipc.ts` 的
`events.pluginPanel` **加 `ui/PluginDock.tsx` 的订阅**）都引它。**三处说同一个字符串**，
所以只定义一次。

### registry 的名字只定义一处

`REG_PANELS` / `REG_MENUS` / `EVENT_PANEL_DIRTY` 三个 `pub const` 在 `plugin/mod.rs` 里，
**写的一侧（本文件）和读的一侧（`plugin/mod.rs::读面板`/`读菜单`、前端事件订阅）都引它**。
⚠️ 别在两边各写一遍字面量——那就是又造一对"两处相乘"，症状是界面永远空着且不报错（BUG-13）。

### 面板内容的剥法：`面板内容` 与 `剥成_json`

```rust
pub(crate) fn 面板内容(lua: &Lua, plugin_id: &str, panel_id: &str) -> NotaResult<serde_json::Value>
fn 剥成_json(v: &mlua::Value, 层: usize) -> serde_json::Value  // 私有，递归
```

从 registry 找到那个面板 → **现调**它的 `render` → 把返回值剥成 JSON。
⏱️ **每次读都重新跑一遍 `render`**，不做缓存。做成"注册时跑一次存起来"的话，
界面上会一直显示应用刚启动那一刻的改动，而且**看着像是对的**（有用例钉着）。

三道闸，**每一条都是上限，不是格式转换**：

| 限制 | 值 | 挡的是 |
|---|---|---|
| 文本长度 | `面板文本上限` = **20000** 字符 | 一个插件把一整个文件塞进 `text`。截断从尾巴上截、留一个 `…`，⚠️ **按字符不按字节**，别把汉字劈成半个。⚠️ **这个数 2026-09-24 从 4000 抬上来的**：一条 `message` 块就是模型的一整段回答，4000 字在长回答上会**静默截断**，用户会以为模型就写了这么多。前端那条兜底（`panel-nodes.ts::消息上限`）跟着调成同一个数 |
| 一层里的项数 | `面板节点上限` = 200 | 一次渲染出几千行，前端卡死。**不是为了防坏人，是为了防手滑** |
| 嵌套层数 | `面板层数上限` = 6 | 自引用/超深表把栈打穿。超了那一层是 `null`，**不是报错** |
| 值类型 | 只留 nil/bool/number/string/table | 函数、userdata 过不了 JSON，一律变 `null`（**不是**变成一句假字符串） |

⚠️ **表格当数组还是字典，判据是"有没有连续整数键"**——与 `api/mod.rs::lua_to_json`
同口径（`raw_len() > 0` 就是数组）。两处必须同口径，否则同一个 Lua 表在事件里
是一种形状、在面板里是另一种形状，而插件作者只会看见"有时候不灵"。

三种报错各说各的病因，**都不退化成空内容**：

| 场合 | 报的错 |
|---|---|
| 插件根本没申请 `ui.panel` | `插件 {id} 没有申请 `ui.panel` 能力` |
| 没声明过这个面板 | `插件 {id} 没有声明面板 `{panel}``（**不是给个空数组**——空数组会被读成"这个面板现在没内容"） |
| 声明了但没有 `render` | `插件 {id} 的面板 `{panel}` 没有提供 `render`，所以没有内容可显示` |
| `render` 跑起来抛错 | `NotaError::Lua { plugin, message: "面板 `{panel}` 渲染失败：{e}" }` ——**带插件 id**，前端能说清是谁的错 |

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

### 测试（18）

| 测试名 | 钉住什么 |
|---|---|
| `通知层级归一化` | `None` → `info`、`warn`/`warning` → `warn`、`error` → `error`、**随便写的** → `info` |
| `注册的面板读得回来` | **BUG-13 的回归用例**：走完整来回（`register_panel` 写 registry → `plugin::读面板` 读出来），并钉住不写 `location` 时默认是 `right` |
| `面板不写_title_就拿_id_顶上` | 默认值 |
| `面板重名要报错` | 报错文案含「重复注册面板」，且报错后**不留半条**（读回来还是一个） |
| `没声明过就读回空表` | 没申请能力的插件：两个读函数都返回空表，**不是报错**——报错会让"装了但不带 UI 的插件"看起来像坏了 |
| `注册的菜单项读得回来` | 同面板那条，外加不写 `menu` 时默认 `plugins` |
| `菜单项的_prompt_读得回来` | `prompt` 的五个字段收得进来 |
| `没有_arg_的_prompt_当没写` | ⚠️ 缺 `arg` **整条当没有**（问出来的答案无处可送），不是"给个空的 arg" |
| `面板渲染出来的内容读得回来` | 内容块真的走完了「Lua 源码 → 注册 → 现跑 `render` → JSON」这一整条路。⚠️ 用例里的 `render` 是**用真的 Lua 源码拼出来的**（`lua.load(...)`），不是在 Rust 里 `create_function` 手搭——手搭就绕过了"插件作者写的是源码"这一步 |
| `每次读都重新跑一遍_render` | 内容**不是快照**：连读三次得到"第 1/2/3 次" |
| `渲染抛错时报的是插件自己的错` | 文案里同时有插件那句 `磁盘满了` 和 `渲染失败`（说清是**哪一步**出的错） |
| `没有_render_的面板如实说没有` | 见上表最后一条 |
| `没有的面板要报出来而不是给空` | 见上表 |
| `render_不是函数当场就报` | 注册时就报，不拖到打开面板 |
| `超长文本截断且不劈开汉字` | 截断后长度正好是上限 +1（那个 `…`），且**每个字符都还是 `汉`**——按字节截会把汉字劈成半个 |
| `过不了_json_的值变成_null` | 函数 → `null`，且同一个表里的别的字段不受影响 |
| `自引用的表不会打穿栈` | `t.me = t` 这种能停下来 |
| `一层的项数有上限` | 超出 `面板节点上限` 的项被砍掉，不是全部渲染出去 |

⚠️ **单条能力单测**（每个方法的"装不装"）在 `api/mod.rs` 那边，别在两张表里各测一遍。

⚠️ **前四条故意让写的一侧和读的一侧都参与**——只测一头永远测不出 BUG-13 那一类。

---

## `src-tauri/src/lua/api/http.rs`（540 行）

`nota.http` —— 让插件发 HTTP 请求。**2026-09-24 落地**（`docs/07` 第 12 项；
在那之前这张表是 `not_implemented` 空壳）。面向插件作者的用法见
[docs/13](13-lua-api.md) §9，这一节讲**宿主这侧为什么要这么写**。

### 文件头的"为什么"要点

- **这块是"外网"的口子，也是这台机器上唯一一条主动往外连的通道。** 插件写的地址
  就是它连的地址，所以**地址本身要过一道闸**（`检查地址`）。
- **没有 `ctx`**：`build(lua)` 只收 `Lua`，不碰文档也不碰设置。⚠️ 这是**刻意**的——
  一个能发 HTTP 的插件顺手能读全文，等于给这条口子加一个没必要的放大器。
- **阻塞**：底下是 `ureq`（同步）。所以调用它的宿主命令在
  `tauri::async_runtime::spawn_blocking` 里跑，**不占住主线程**；
  但**插件命令是串行的**（全程持 `plugins` 锁，见 `commands/plugin.rs`），
  一个慢请求会挡住别的插件的命令。

### 四个上限（都是"别让插件把宿主拖死"）

| 常量 | 值 | 挡的是 |
|---|---|---|
| `默认超时` | 30 s | 不传 `timeout_ms` |
| `最长超时` | 180 s | ⚠️ **超了截到上限，不报错**——插件写 `timeout_ms = 600000` 的意图是"这请求可能很慢"，不是"我要一个非法值"。**没上限的话一个插件写个 1 小时，就有一个后台线程被占住一小时**，界面上表现为"这个插件点了没反应" |
| `响应上限` | 2 MiB | ⚠️ 超了**报错**（不是截断）——半个 JSON 一定解析失败，而"解析失败"这条错会把病因指错地方 |
| `请求上限` | 1 MiB | 插件自己拼的请求体（多半是拼错了） |
| `最大重定向` | 5 | 重定向环 |

方法是个**封闭集合**（`允许的方法`）：`GET` / `POST` / `PUT` / `PATCH` / `DELETE` / `HEAD`，
**认不出就报错**（不是拒绝，是"这个方法我不认识"）。

### `fn 检查地址(url: &str) -> NotaResult<()>`（私有）

只放行 **https**，以及**回环地址上的 http**。判据是**主机名**，不是字符串前缀
（`取主机` 从 `主机[:端口]/路径?查询#片段` 里取主机名：小写、去端口、去 userinfo）：

| 放行的 http 主机 | 不放行 |
|---|---|
| `localhost` / `127.0.0.1` / `::1` | 其余一律要 https |

⚠️ **只认这三个**，因为"回环"是个很容易写得比看上去更宽的东西：`127.0.0.2` 也是回环、
`[::ffff:127.0.0.1]` 也是回环、`localhost.` 还是回环。**宽在安全判据上不是优点。**
本地服务（Ollama 那类）想被插件连上，用这三个之一就够。

### `fn 写了_content_type(headers: &Table) -> bool`（私有）

⚠️ **存在的理由是一个修过的 bug。** 表体（`body = {…}`）会被自动补一个
`content-type: application/json`，而 `Request::builder().header()` 是**追加**
不是覆盖——插件自己写过的话，补的那一下就成了**第二个 content-type 头**。
重复头各服务器处理不一致（有的直接 400，有的只认第一个，而插件写的那个
**排在后面**），所以补之前必须真的问一句，而不是在注释里许愿。
头名**不区分大小写**（HTTP 的规定）。有用例钉着（`认得插件自己写的_content_type`）。

### `fn 收口(lua: &Lua, r: NotaResult<回包>) -> mlua::Result<Table>`（私有）

`get` / `post` / `request` 三条路**都从这一处出去**，所以**返回值的形状只有一处定义**：

| 键 | 什么时候有 |
|---|---|
| `code` | 永远。HTTP 状态码 |
| `text` | 永远。原样的响应体 |
| `json` | **只有能解析时**才有这个键 |

⚠️ `json` 解析不了**不当错误**。响应是 HTML 错误页、是纯文本、是空体的场合多得很
（4xx 的正文常常就是一整页 HTML），那时插件该看到的是 `text` 里那段话，
而不是一个"JSON 解析失败"——后者会把病因指到错的地方，**而且掩盖了"服务器其实回了一句话"**。
有了 `json`，插件读 OpenAI 那种 `choices[1].message.content` 才不用自己写 JSON 解析器
（Lua 里没有；用模式匹配去抠字符串会在 `\n` 这种转义上出错）。

⚠️ **4xx / 5xx 不是错误**：`http_status_as_error(false)`，状态码原样进 `code`，
正文原样进 `text`。理由同上——错误页里那句话往往正是用户需要看到的。

### 测试（9）

| 测试名 | 钉住什么 |
|---|---|
| `只放行_https_和回环的_http` | ⚠️ **这个模块里最该在的一条**：明文 http 会把插件的 API key 和文档内容一起发在裸链路上；唯一的例外是本机回环（给 Ollama / LM Studio 那类留的口子，流量根本不出这台机器）。用例里连 `file:///etc/passwd` 这种也一起试 |
| `取主机要能拆出端口和_userinfo` | `主机[:端口]` 与 `user@主机` 都要拆对 |
| `主机名骗不过回环判定` | ⚠️ **安全判据不能靠字符串前缀**——`127.0.0.1.evil.com` 这类必须被拦下 |
| `方法只有那六个` | 封闭集合，认不出就报错 |
| `超时截到上限` | 写一个很大的数 → **截到 180 s**，不是报错（见上表） |
| `两种写法都归一化` | `get("url")` 与 `get{url=…}` 归一到同一张规格表 |
| `认得插件自己写的_content_type` | 空表 / 只写了 authorization / `Content-Type` / `content-type` 四种都要认出来 |
| `响应是_json就拆好放进去` | ⚠️ 顺手钉住**下标从 1 起**：写成 0 起的话数组第一个元素会静默丢掉（`#t` 也对不上），而插件那边看到的是"模型没给出回答" |
| `不是_json就没有_json这个键` | HTML 错误页 / 空体：**没有 `json` 这个键**，`text` 照旧 |

⚠️ 这几条**都不真连网**——测的是"入参怎么校验、出参怎么折"，不是"网通不通"。
真连网的那一半只能靠 GUI 跑（`docs/10` §10 第 3 项）。

---

## `src-tauri/src/lua/api/settings.rs`（377 行）

`nota.settings` —— 插件存自己那点配置。**2026-09-24 落地**（`docs/07` 第 13 项）。
面向插件作者的用法见 [docs/13](13-lua-api.md) §10；「**为什么不加密**」那件事
在 [docs/12](12-plugin-runtime.md) §4.5，**别在这里重说一遍**。

### 落点与权限

- 一份**明文 TOML**，路径 `~/.config/nota/plugin-settings/<安全文件名(id)>.toml`
- 目录 **0700**、文件 **0600**（`写` 里设；`收紧目录权限` 在非 unix 上是空实现）
- ⚠️ 目录权限**收不上就算了**——`收紧目录权限` 明确**不是一条能让存盘失败的错**。
  为了一个权限位把"存设置"变成"存不了"，是把次要的失败升级成了主要的失败
- 文件头有一行注释（`文件头` 常量），用户手改时先看到它，知道这是什么、权限为什么是这样

### 读：坏文件当空的用，不挡住插件

`fn 读(路径: &Path) -> BTreeMap<String, toml::Value>`：读不出来（文件不在 / 语法错）
→ **空表，不报错**。⚠️ 一份被用户手改坏的 TOML 应该表现为"设置回到默认值"，
而不是"这个插件坏了用不了"——与 `Settings::load` 在 `lib.rs` 里那条口径一致
（坏掉的配置不该让人连界面都进不去）。

⚠️ **但坏的读法有两种，不能混**：

| 坏法 | 结果 |
|---|---|
| 读失败（文件不在 / 语法错） | 空 |
| 读到了、但某个键的**类型不认识**（用户写了数组） | 那个键**照样留着**，只是返回给插件时变成一串文本（`toml转lua`）——**不是 `nil`** |

### 键的规矩：`fn 键合法吗(key: &str) -> mlua::Result<()>`（私有）

键必须是"**不含点的 ASCII 词**"。⚠️ 挡点号不是洁癖：TOML 里 `a.b = 1` 与
`a = { b = 1 }` 是**同一个东西**。允许键里带点的话，插件写 `set("a.b", 1)`，
读回来 `all()` 得到的是一个**嵌套表**，而 `get("a.b")` 又查不到——
一个**自己跟自己对不上**的设置文件。

### 值：只收三种标量

`fn 值转toml(v: &Value) -> mlua::Result<Option<toml::Value>>` —— `Ok(None)` 表示
**删掉这个键**（所以 `set(k, nil)` 是删除，不是存一个 nil）。只收 bool / number / string；
表、函数一律报错。反向的 `toml转lua` 遇到复合值给的是**文本**（见上表），不是 `nil`。

### `fn 锁坏了<E: Display>(e: E) -> mlua::Error`（私有）

`Mutex` 中毒了。**几乎到不了**（临界区里没有会 panic 的代码），但 `.unwrap()` 在这里是错的：
中毒之后那把锁里的数据可能是**半截的**，而"设置读不出来"该是一句人话，不是一次 panic。

### 测试（7）

| 测试名 | 钉住什么 |
|---|---|
| `写下去的值读得回来` | 走完整来回 |
| `文件头那段注释不影响读` | 头注释是能解析的 TOML 注释，不是把文件变成语法错 |
| `设置文件是_0600` | ⚠️ 权限位。**这条只在 unix 上有意义** |
| `坏文件当空的用而不是报错` | 见上：坏掉的设置不该让插件用不了 |
| `键里不许有点和怪字符` | 见上：带点的键会让 `all()` 与 `get()` 自相矛盾 |
| `只收三种标量` | 表 / 函数报错 |
| `手改出来的复合值读回来是文本不是_nil` | 见上"坏的读法有两种"——这条正是那个区分 |

⚠️ 用例都走 `临时目录()`（每个用例一个自己的目录），**没有一个碰真的 `~/.config`**。

---

# 前端

前端的类型定义集中在 `src/bridge/ipc.ts`，组件文件只 import 类型。
⚠️ 所有 interface 与 Rust 侧的结构体是**两份手抄的定义**，字段名一一对应
（Rust 侧 snake_case，前端也是 snake_case —— **没有做驼峰转换**，
`ui_font_size` / `confirm_unsaved` / `content_width` 这些字段名在前端也是下划线）。

---

## `src-tauri/src/lua/api/diff.rs`（487 行）

`nota.diff` —— **改动块**的解析与应用（2026-09-24 新增，13 条用例）。

### 它是干什么的

一段普通文本，**最末尾**附一个围栏包起来的块：

~~~text
我把第二句改短了。

```nota-diff
- 他慢慢地走了过来。
+ 他走过来。
```
~~~

`-` 开头的是**原文里要被换掉的那几行**，`+` 开头的是换上去的新话。
应用方式是**逐字找到那几行、就地替换**——不是"用新文本覆盖整篇"。

### ⚠️ 为什么它在宿主里，不在 AI 插件里

它跟 AI 插件一起长出来的（用户要求「AI 生成 diff，在末尾用特殊标注写」），
但**不是 AI 专有的**：任何"我建议你把文档改成这样"的插件都要同一样东西，
而界面上那块 `kind = "diff"` 的渲染**早就是宿主的**（`ui/panel-nodes.ts` 的白名单）。
一份格式两处实现迟早会漂，漂的症状是"明明一模一样的两行，它说没找到"。
另外它是一个**唯一会改坏用户文档**的地方，所以必须能被单元测试一条条按住——
核心的 `解析` / `应用` 是**普通 Rust 函数、不认识 Lua**，`build()` 只做包装。

⚠️ **它不碰文档**（不 import 任何 `document` 那侧的东西）：写进去的那一句永远在
**插件**手里，也就是说**永远要用户点一下确认**。

### 三条规矩（`docs/13` §11 与 AI 插件的 `SYSTEM_PROMPT` 里各有一份同样的表）

| # | 规矩 | 为什么 |
|---|---|---|
| 1 | **失败＝什么都没做**：要么给新全文，要么给一句原因，**不给半截结果** | "改了一半"比"没改"坏得多：用户按 Ctrl+Z 都不知道该退到哪一步 |
| 2 | `-` 那几行要与文档里**连续的一段逐字一致** | 模型爱顺手改标点、补空格。宁可报"没找到"，也不拿近似的文字去猜 |
| 3 | **没有 `-` 行＝追加到文末** | 没有落点就别猜位置 |

### 容错的地方（都是"认不出就当普通文本/忽略"，不报错）

- 收尾的 `` ``` `` **漏写也认**；围栏行**前后允许有空白**（`trim` 后整行相等才算）
- **空的改动块当没写**（模型偶尔画一个空块表示"不用改"）
- 围栏里既不 `-` 也不 `+` 的行**数出来（`坏行`）、不当改动**——面板要把这个数如实说出来
- 多处改动**按出现顺序应用**；第二处先从上一次的落点往后找，找不到**再从头找一遍**
  （模型把顺序写反了）
- **CRLF** 按行掐掉 `\r` 再匹配、join 时补回去；结尾那个换行有就保留

### 用例覆盖（13 条，`cargo test`）

基本替换 / 找不到就**整份拒绝**（不是跳过那处）/ `-` 行不连续要拒 /
纯插入（含空文档）/ 两处按序 / **两处顺序写反** / 坏行计数 / 没有围栏 /
**漏写收尾围栏** / 空改动块忽略 / **CRLF 保持** / 纯删除 / 删最后一行的空行。

⚠️ **这几条就是为什么它必须在 Rust 里**：输入是"模型现编的一段文字"，
线上撞见的形状（少个围栏、多一个 `\r`、顺序写反）用接口是试不完的。

---

## `src/main.tsx`（61 行）

React 入口，四件事：

1. `installErrorHooks()` —— 趁早装上（见 `ui/ErrorBoundary.tsx`）
2. `document.getElementById("root")`，找不到直接 `throw new Error("找不到 #root 挂载点；index.html 被改坏了？")`
3. `ReactDOM.createRoot(root).render(<React.StrictMode><App /></React.StrictMode>)`
4. `import "./styles/theme.css"` 与 `"./styles/app.css"`（顺序有意义：主题变量先，应用样式后）；
   接着 `"./styles/sidebar.css"`（左侧栏）与 `"./styles/bars.css"`（编辑区上方的横条）
   等，**一律排在 `app.css` 之后**——它们的选择器与 `app.css` 有重叠，靠顺序压过去

⚠️ `React.StrictMode` 在开发模式下会**把 effect 跑两遍**。`EditorPane` 里那个
`disposed` 判断就是为它写的。

无导出函数（`main.tsx` 没有 export）。

---

## `src/App.tsx`（926 行）

应用外壳：状态编排 + 布局。文件头写明这一层只做三件事——**取数据、派事件、拼布局**；
编辑器的活全在 `ui/EditorPane.tsx`，文件树的活在 `ui/Sidebar.tsx`，别往这里堆。

`export default function App()`，无 props。

⚠️ **2026-09-24 沿职责搬走了五块**（从 1118 行起，一路顶着 §0.4 那条 1000 行硬线）：
菜单的三条判据 + 快捷键分发 + 原生菜单那两条 effect → `ui/useMenus.ts`；
两个对话框的"谁在等答案" → `ui/useDialogs.ts`；
导出与打印 → `ui/useExport.ts`；
文档主题的应用/切换/打开目录 → `ui/useDocTheme.ts`；
"把一条菜单命令送进编辑器" → `ui/useEditorCommands.ts`。
五块都是**和外壳布局无关**的东西，搬走之后这个文件回到"骨架 + 各功能模块的接线员"这个位置。

⚠️ **别把"搬了五块"直接当成"变小了"**：头两次搬完它反而还在 916 行——同一批里又
往它加了格式工具栏与查找条的接线，搬走的和加进去的正好抵掉。**"拆了"和"变小了"不是
同一件事**，看行数要重数，不能推。

### 十八个 state + 两个 ref（`grep` 数出来的，2026-09-24 重数）

📌 **2026-09-24 起 `plugins` / `panels` 两个 state 不在这里了**，连同插件菜单项与
"跑一条插件命令"一起搬进了 `ui/usePlugins.ts`（本文件只解构出
`plugins` / `panels` / `menus` / `handlers` / `调` 五个名字用）。
下面这份表是**搬完之后重数的**。

| 名字 | 类型 | 说明 |
|---|---|---|
| `docs` | `useState<Document[]>([])` | 标签栏、状态栏的数据源 |
| `activeId` | `useState<DocId \| null>(null)` | 决定渲染 `EditorPane` 还是 `Home` |
| `settings` | `useState<Settings \| null>(null)` | `null` = 还没拉到 |
| `workspace` | `useState<string \| null>(null)` | 规范化后的绝对路径 |
| `tree` | `useState<TreeNode[]>([])` | 只有一层（`depth = 1`） |
| `themes` | `useState<DocThemeInfo[]>([])` | 扫到的**文档主题**，喂给菜单栏「主题」那一栏。**启动时拉一次** |
| `settingsOpen` | `useState(false)` | 偏好设置框开不开。入口是菜单「文件 → 偏好设置」（`file.preferences`） |
| `toasts` | `useState<Toast[]>([])` | |
| `dockOpen` | `useState(true)` | 右侧插件栏 |
| `sidebarOpen` | `useState(true)` | 左侧栏。⚠️ **三个入口调同一个 setter**：菜单「视图 → 显示/隐藏侧边栏」（`Ctrl+Shift+L`）、栏内右上角那颗 ×（`Sidebar.onClose`）、菜单打勾。**不是三份状态** |
| `sidebarTab` | `useState<SidebarTab>("tree")` | 左栏当前哪一页 |
| `statusBarOpen` | `useState(true)` | 状态栏 |
| `formatBarOpen` | `useState(true)` | 格式工具栏（2026-09-24 加，`docs/07` 第 2 项） |
| `focusMode` | `useState(false)` | **专注模式**。⚠️ **明确不进 `settings`**：和 `dockOpen` 同类，是"看的时候的状态" |
| `typewriter` | `useState(false)` | **打字机模式**。同上 |
| `findOpen` | `useState(false)` | 查找条开不开（`docs/07` 第 4 项） |
| `findStatus` | `useState<FindStatus>(空查找状态)` | **编辑器报上来的**命中情况，App 不自己算 |
| `commandState` | `useState<CommandState \| null>(null)` | **编辑器报上来的**光标状态。⚠️ 源码模式与没有文档时是 `null`（"读不出来"），不是一份空状态 |

两个 ref（⚠️ `MenuBar.tsx` 内部另有自己的 `barRef`，`ui/useSlidev.ts` 里两个，都不算这里的）：

| 名字 | 说明 |
|---|---|
| `editorRef` | `useRef<EditorPaneHandle>(null)`，App 伸手进编辑器的唯一通道 |
| `activeIdRef` | `useRef<DocId \| null>(null)`，让**只跑一次**的事件订阅 effect 也能读到最新的活动文档 |

⚠️ **后四个界面开关 + `sidebarTab` 都是受控的**：状态在 `App.tsx`，
`Sidebar` / `StatusBar` 自己不持有。这正是**菜单栏能切它们**的原因——
菜单在 `App.tsx` 里渲染，够不着子组件的局部状态（`Sidebar` 的 `tab` 2026-09-23 就是
为这件事从 `useState` 改过来的）。⚠️ `formatBarOpen` / `focusMode` / `typewriter`
看起来像"子组件的局部状态"，其实不是：它们**在菜单里各有一条可勾项**，所以必须住在这里。

⚠️ **`PluginDock` 是个例外**：`plugins` / `panels` 受控，但**面板内容**由它自己持
（`useState<Record<string, 面板状态>>` ＋ 一个请求序号 ref）。
内容是"这一刻从插件拉回来的东西"，没有第二个人要用，也就不该往上面抬。
**别照着"受控"那条把面板内容也搬进 `App.tsx`。**

### `askConfirm()` / `answerConfirm()` / `askPrompt()`：两个自绘对话框怎么用

⚠️ **2026-09-24 起这对状态与它那两个 ref 都不在本文件里**，在 `ui/useDialogs.ts`
（`docs/04` §2.6b/§2.6d）。本文件只解构出 `confirmReq` / `askConfirm` / `answerConfirm` /
`promptReq` / `askPrompt` / `answerPrompt` 六个名字用。

`askConfirm({title, message, confirmLabel?, danger?, hideCancel?}) -> Promise<boolean>`：
把一坨状态塞进 `confirmReq`，同时**把 Promise 的 resolve 存进 `confirmResolve`**；
`answerConfirm(ok)` 取出 resolve、清空 ref、`setConfirmReq(null)` 并兑现它。
`askPrompt(...) -> Promise<{value, second} | null>` 同理。

⚠️ 两个 resolve 都是**单个 ref 不是队列**——一次只可能有一个框。
⚠️ 确认框取代的是原生 `window.confirm`（`docs/07` 第 29 项，已修）：后者**阻塞 WebView**，
会把中文输入法的组合态打断，和 `Toasts.tsx` 明确避开 `alert` 是同一条理由。
⚠️ 输入框取代的是 `window.prompt`——它在 **WebKitGTK 上默认被关掉，调用静默返回 `null`**。

### 三个 `useCallback` 工具

| 签名 | 行为 |
|---|---|
| `toast(message: string, level: Toast["level"] = "info") -> void` | 生成一个 `id`（`Math.random().toString(36).slice(2)`），追加到 `toasts`，并按 level 设 TTL：**error 8000ms、其余 3200ms**，到点自动过滤掉。注释：错误留久一点——用户多半要读完再决定怎么办 |
| `refreshDocs() -> Promise<Document[]>` | `api.doc.list()` → `setDocs(list)` → **返回 list**（`closeDoc` 要靠返回值取新活动标签） |
| `refreshTree() -> Promise<void>` | 没有 `workspace` 就 `setTree([])` 并返回；否则 `api.workspace.tree(undefined, 1)`，失败 `toast(String(e), "error")` |

### 五个 `useEffect`（另附两段已搬走的）

**① 启动**（依赖 `[refreshDocs, toast]`）

```text
Promise.all([api.settings.get(), api.workspace.get(),
             api.plugin.list(), api.plugin.panels(), api.theme.list()])
  → setSettings / setWorkspace / setPlugins / setPanels / setThemes
  → await refreshDocs()
失败 → toast(`启动时读取状态失败：${e}`, "error")

然后（无论上面成功与否）：
  await api.frontendReady()   // 失败只 console.warn，不影响使用
```

用一个 `alive` 标志挡住卸载后的 setState；`return` 里把 `alive` 置假。
⚠️ `alive` 只挡了 `Promise.all` 之后的那一段——`refreshDocs()` 的 `setDocs` 在 `alive`
检查之后调用，所以安全；但 `api.frontendReady()` 没有 `alive` 检查（它不改 state，无害）。

⚠️ **主题只在这里拉一次**（`api.theme.list()`）。所以用户点「打开主题文件夹…」丢进去一份
新主题之后**菜单里不会出现**，得重启——欠账记在 `docs/07` 第 41 项。
⚠️ 拉回来的是 `DocThemeInfo[]`，**全是文档主题，一条界面主题都没有**。
界面那两条轴（风格、明暗）的入口在 `ui/settings/`，不在菜单里。

**② 事件订阅**（依赖 `[toast, refreshDocs]`）

```text
await Promise.all([
  on<NotifyPayload>(events.notify, (p) => toast(p.message, p.level)),
  on<DocumentChangedPayload>(events.documentChanged, (p) => {
    if (p.origin !== "plugin") return;              // 不是插件发的 → 早退
    if (p.id === activeIdRef.current) {
      editorRef.current?.setMarkdown(p.text);        // 命中活动文档 → 整篇覆盖
      return;
    }
    void refreshDocs();                              // 不是活动文档 → 让 state 跟上
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
  （自己发起的不会绕一圈回来）"。判据是 `origin === "plugin"`
- ⚠️ **依赖里没有 `activeId`**，回调读的是 `activeIdRef.current`。此前依赖里有 `activeId`，
  于是每次切标签都整体退订再重订一次，**重订期间到达的事件会被丢掉**
- ⚠️ **"不是活动文档"那条分支不能省**（backlog 第 33 项）：`setMarkdown` 只对当前挂载的
  编辑器生效，非活动文档无处可放；不 `refreshDocs()` 的话 React state 里还是旧文本，
  用户切回去时 `EditorPane` 用旧文本重建，下一次去抖 sync 就**把插件的改动覆盖掉了**

**③ 活动文档上报**（依赖 `[activeId, toast]`）

写 `activeIdRef.current = activeId`，并 `api.doc.setActive(activeId)`。

⚠️ 后端只记得"最后一次新建/打开的那份"。不在这里统一同步的话，用户点了标签 A 在看 A，
插件调 `nota.document.get_text()` 拿到的却是 B——AI 助手插件按这个路径写回就会**改错文档**
（BUG-6）。放在 effect 里而不是只补在 `TabBar.onSelect` 上，是为了把
`open` / `new` / `close` 那几条路径也一起兜住（多喊一次无害，后端幂等）。

**④ 外观**（依赖 `[settings]`）

```ts
if (settings) return applyTheme(settings);
```

⚠️ **必须把返回值交出去**（BUG-7）：`ui_mode = "auto"` 时它挂了一个 `matchMedia` 监听，
不接返回值就等于每次 `settings` 变化都再挂一个、旧的从不移除。
⚠️ `settings` 为 `null`（还没拉到）时**不能**把主题刷成默认值——那会让首屏闪一下再跳回来。

**⑤ 文档主题 —— ⚠️ 2026-09-24 起搬去了 `ui/useDocTheme.ts`**

搬走的那一份：

```text
id = settings?.document_theme
css = id ? await api.theme.css(id) : null
if (alive) applyDocTheme(css)
```

搬走之后**依赖数组变了**：`[themeId, themes]`（原来这里只有 id）。多出来的 `themes`
是**故意留的将来接口**——清单重扫之后要能重取一次 CSS（`docs/07` 第 41 项），今天清单
只在启动时拉、这条依赖暂时不会响。
搬走的理由不只是行数：这三件事（应用 / 切换 / 打开目录）共用同一个前提——**文档主题
只作用于编辑区**，摆在一起那条约束才有落点。那里的文件头把其余几条（拿 id 不拿路径、
与 ④ 分开的节奏、取不到 CSS 时安静退回）都写了，不在这里重复。

**⑥ 重取文件树**（依赖 `[refreshTree]`）

```ts
void refreshTree();
```

注释：`refreshTree` 已经依赖 `workspace`，这里不必再列一遍。

**⑦ 快捷键 —— ⚠️ 2026-09-24 起搬去了 `ui/useMenus.ts`**

**2026-09-23 起不再手写按键分支**，改成查表：

```ts
const accelIndex = useMemo(() => buildAccelIndex(MENUS), []);
useEffect(() => {
  const onKey = (e: KeyboardEvent) => {
    if (e.isComposing || e.keyCode === 229) return;          // ① 组字中，一个都不抢
    const id = accelIndex.get(accelSig(eventAccel(e)));      // ② 查表
    if (!id) return;                                         //    查不到 → 放行
    if (isOutsideEditor(e.target)) return;                   // ③ 焦点在输入框里
    if (disabledCommands.has(id)) return;                    // ④ 灰掉的项
    const handler = menuHandlers[id];
    if (!handler) return;                                    // ⑤ 没实现
    e.preventDefault();
    handler();
  };
  window.addEventListener("keydown", onKey);
  return () => window.removeEventListener("keydown", onKey);
}, [accelIndex, menuHandlers, disabledCommands]);
```

**表本身不在这里，在 `ui/commands.ts` 的 `accel` 字段里**——这里只是它的消费者。
完整的键位清单、以及哪几条能按哪几条按不动，写在 `docs/04` §4。

⚠️ **整段（含 `accelIndex` 那条 `useMemo` 与这个 effect）2026-09-24 搬去了
`ui/useMenus.ts`**——理由和 `menuHandlers` / `disabledCommands` / `menuChecks`
那几张派生表一样：**它们和外壳布局无关**，住在这里只会让本文件越来越长。
本文件现在只把 `menuHandlers` 当参数交给 `useMenus()`，拿回
`{ disabledCommands, menuChecks, usingNativeMenu }` 三个值。
⚠️ 判据本身一条没变，下面那四条注意事项仍然有效——只是**改它们要去
`ui/useMenus.ts` 改**。

⚠️ **②「查不到就放行」是必须的**：`Ctrl+C/V/X` 归系统（`Ctrl+B/I/Z` 现在
**查得到**，走我们自己的 `runCommand`，见 `docs/04` §4）。
**别改成"有修饰键就吞"**——那会把系统剪贴板做坏。

⚠️ **④ 意味着"灰 = 快捷键也失效"**。这不是缺陷而是唯一说得通的口径，
理由见 `docs/04` §4。

⚠️ **不判焦点是不行的**（③）：设置面板里的输入框按 `Ctrl+N` 不该新建文档。
但 `isOutsideEditor` 必须放过**编辑器内部**的 `contenteditable`——
ProseMirror 那棵树也是 `contenteditable`，不放过的话编辑器里一个快捷键都用不了。

### 菜单栏那几张派生表

⚠️ **2026-09-24 起这四张表全在 `ui/useMenus.ts` 里**（`menuHandlers` 那张仍在
本文件——它才是"有没有实现"的真源）。见那一节。

| 表 | 怎么算出来 | 用途 |
|---|---|---|
| `menuHandlers` | **手写**的 `Record<string, () => void>`，键就是 `commands.ts` 里的条目 id | 点菜单项的落点。**没有键 = 这一项没实现** |
| `disabledCommands` | 遍历 `MENUS`（含子菜单），三条判据任一成立就进集合：没实现 / `needsDoc && activeId === null` / `光标条件` 不满足 | 喂给 `MenuBar` 的 `disabled`、原生菜单的 `enabled`、快捷键那步 ④ |
| `menuChecks` | 手写的 `Record<string, boolean>`：`view.toggleSidebar` / `view.outline` / `view.fileTree` / `view.toggleDock` / `view.formatBar` / `view.statusBar` / `view.modeWysiwyg` / `view.modeSource` / `view.modeSplit` / `view.slidev` / `view.focusMode` / `view.typewriter` | 喂给 `MenuBar` 的 `checks`，画那个 `✓` |
| `accelIndex` | `buildAccelIndex(MENUS)`（`ui/accel.ts`），**从 `accel` 字段推** | 快捷键派发。同一份 `MENUS` 也喂给 `buildNativeTree`（`ui/nativeMenu.ts`）推原生菜单 |

⚠️ **2026-09-24 新加了三个键**：`file.exportHtmlPlain` / `file.exportHtmlStyled` /
`file.print`（落点都是 `ui/useExport.ts`）。同栏里 PDF / Word / ODT / LaTeX / Epub /
图片**故意还是灰的**——`commands.ts` 里有条目、`menuHandlers` 里没有键，于是
`disabledCommands` 把它们收走。**不是漏了，是这一批没做**。
⚠️ 打印那一条**不是"在应用里打印"**：它是"导出含样式的那份 + 交给系统默认程序"，
所以提示里得把两步都说清楚，别让用户以为点完就出纸了。

⚠️ **`menuHandlers` 是"这一项能不能兑现"的唯一判据**（见 `ui/commands.ts` 顶上那段）。
往里加一个键，菜单里对应那项就亮了——**这是有意的单点**，别在别处再写一份标志位。
⚠️ **它只是第一条判据**：第二条是 `ui/useMenus.ts` 的 `光标条件`（"光标这一刻在不在
合适的位置"，表格那十条要求 `inTable`），第三条是 `needsDoc`。⚠️ 三条都**只有一个
出口**（`disabledCommands`），派生出三个消费者——各写一份的症状是"菜单灰着、
快捷键却照跑"，不报错也不崩，只让用户觉得这个应用一会儿一个脾气。

⚠️ **编辑模式那三条是"三选一"，而且来源是设置不是 `useState`。**
`App.tsx` 里有 `const viewMode = settings?.view_mode ?? "wysiwyg";`，它同时喂给
三处——`menuChecks` 里那三个 `✓`、`<EditorPane mode={viewMode}>`、以及
`menuHandlers` 里写回 `updateSettings({ view_mode })`。**三处必须同源**：
各存一份的症状是"菜单里的 ✓ 在 A 上、编辑区却是 B"。
⚠️ 兜底值 `"wysiwyg"` 必须和 Rust 侧 `ViewMode::default()` 一致。
⚠️ 它们与别的 `view.*` 条目有个区别：**要落盘**。侧栏开合、状态栏那些是会话内的
临时开关，编辑模式是"下次打开还是这样"的偏好——所以走 `updateSettings`
（先改内存再写后端，失败会回滚），而不是 `setXxx`。

⚠️ **主题那栏的 `✓` 不在 `menuChecks` 里**，在 `MenuBar.tsx` 里由 `themeChecks()`
现算并在渲染时合并（条目的 id 来自后端，抄不进静态表）。见 `docs/04` §3.3。

### 业务函数（都是 `useCallback`）

| 函数 | 签名 | 行为 / 失败 |
|---|---|---|
| `openPath` | `(path: string) => Promise<void>` | `api.doc.open(path)` → `refreshDocs()` → `setActiveId(id)`。失败 → `toast(String(e), "error")` |
| `newDoc` | `() => Promise<void>` | `api.doc.create()` → `refreshDocs()` → `setActiveId(id)` |
| `saveDoc` | `(id: DocId, forceDialog = false) => Promise<void>` | 见下 |
| `reloadDoc` | `(id: DocId) => Promise<void>` | 有改动就先 `askConfirm`（「丢弃并重新加载」）；`api.doc.reload(id)` → **只有当它就是活动文档时**才 `setMarkdown(fresh.text)` → `refreshDocs()` |
| `openViaDialog` | `() => Promise<void>` | `openDialog({title:"打开", multiple:false, filters:[{name:"Markdown", extensions:["md","markdown","mdx","mdown","mkd","txt"]}]})`，返回字符串才 `openPath(picked)`。**取消不是错误** |
| `openFolder` | `() => Promise<void>` | `openDialog({title:"打开文件夹", directory:true})` → `api.workspace.open(picked)` → `setWorkspace(canonical)` → `api.workspace.tree(undefined, 1)` 直接 `setTree`（**没走 `refreshTree`**） |
| `closeDoc` | `(id: DocId) => Promise<void>` | 见下 |
| `updateSettings` | `(patch: Partial<Settings>) => Promise<void>` | **先改内存**（主题、字号要立刻见效果）→ `api.settings.set(next)`；失败**回滚成 `previous`** 并 toast。免得"界面上是新的、重开又变回去" |
| ~~`pickTheme`~~ | — | **2026-09-24 搬去了 `ui/useDocTheme.ts`**（连同它下面那条） |
| ~~`openThemesDir`~~ | — | 同上 |
| `copyAsMarkdown` | `() => Promise<void>` | `editorRef.getMarkdown()` → `navigator.clipboard.writeText()` |
| `toggleFullscreen` | `() => Promise<void>` | `getCurrentWindow()` → `setFullscreen(!await isFullscreen())` |
| `showAbout` | `() => Promise<void>` | `getVersion()`（**取不到也照样弹**，那正是用户来查版本的地方）→ `askConfirm`，`hideCancel: true` |

**`saveDoc` 的流程**：

1. `docs.find(d => d.id === id)`，找不到**静默 return**
2. 若 `forceDialog || !doc.path`：弹 `saveDialog({title:"保存为", defaultPath: doc.path ?? `${doc.title}.md`, filters:[{name:"Markdown", extensions:["md","markdown","mdx"]}]})`；
   **用户取消（返回 falsy）→ 直接 return**，不报错
3. `const text = editorRef.current?.getMarkdown()` —— **存盘前强制同步一次**，
   因为镜像可能还差最后几次击键；`text !== undefined` 时 `await api.doc.sync(id, text)`
4. `api.doc.save(id, target)` → `refreshDocs()` → `toast(\`已保存到 ${written}\`, "success")`
5. 失败 → `toast(String(e), "error")`

⚠️ 前端**不自己同步内容再存盘**（Step 4 的 `save` 用的是后端镜像）——这正是 Step 3
存在的理由。漏掉 Step 3 的表现是"保存下来的比屏幕上少最后几个字"。

⚠️ 两张对话框的**后缀表都含 `mdx`**（backlog 第 28 项已修），与后端 `is_markdown()` 对齐。

⚠️ `saveDoc` 依赖 `docs`，所以每次 `docs` 变化它的引用都变，进而让快捷键 effect 重挂
（依赖里有 `saveDoc`）。功能上没问题，是次数上的浪费。

**`closeDoc` 的流程**：

1. 找到 doc，若 `doc.dirty && settings?.confirm_unsaved`：
   **`askConfirm(\`「${doc.title}」还没存盘，关掉这份改动就没了。\`)`**（`danger: true`、
   确定键写「丢弃并关闭」），用户选否就 return
2. `api.doc.close(id)` → `refreshDocs()` → `setActiveId(list.length ? list[list.length - 1]!.id : null)`
   （⚠️ `list[list.length - 1]!` 那个非空断言是 `noUncheckedIndexedAccess` 逼出来的）
3. 失败 → toast

⚠️ **不再是原生 `window.confirm`**（`docs/07` 第 29 项已修）——`confirm` **阻塞 WebView**，
会打断中文输入法的组合态，和 `Toasts.tsx` 明确避开 `alert` 是同一条理由。

⚠️ 关文档**不通知后端活动文档的变化**（只 `setActiveId`），后端 `close` 里自己把活动
切到"列表最后一份"。前端是从 `refreshDocs` 的返回值里取 `list` 最后一份——两边**碰巧**
一致（都取最后一份），但这是两条独立的规则，改一边就会分叉。

### 组件树

```jsx
<ErrorBoundary>
  <div className="app">
    <TopBar disabled checks themes currentTheme onCommand onTheme onOpenThemesDir
            dockOpen onToggleDock />
    <div className="app-body">
      {sidebarOpen && (
        <Sidebar workspace tree docText={activeDoc?.text ?? ""}
                 strict={settings?.strict_markdown ?? false}
                 tab={sidebarTab} onTab={setSidebarTab} onOpenFile={openPath}
                 loadDir={loadDir}
                 onClose={() => setSidebarOpen(false)}
                 onOpenFolder={() => void openFolder()} />
      )}
      <main className="app-main">
        {activeDoc ? <EditorPane ref={editorRef} key={activeDoc.id} doc={activeDoc}
                                 mode={viewMode}
                                 strict={settings?.strict_markdown ?? false}
                                 physics={settings?.enable_physics ?? false}
                                 contentWidth={settings?.content_width ?? 760}
                                 onToast={toast} onDocsChanged={refreshDocs} />
                   : <Home plugins onNew onOpen onOpenFolder />}
      </main>
      {dockOpen && (
        <PluginDock plugins panels onClose={() => setDockOpen(false)} />
      )}
    </div>
    {docs.length > 0 && <TabBar docs activeId onSelect={setActiveId} onClose={closeDoc} />}
    {statusBarOpen && (
      <StatusBar doc={activeDoc} mode={viewMode}
                 strict={settings?.strict_markdown ?? false} />
    )}
    <Toasts items={toasts} onDismiss={…} />
    {confirmReq && <ConfirmDialog … onAnswer={answerConfirm} />}
  </div>
</ErrorBoundary>
```

`activeDoc = docs.find(d => d.id === activeId) ?? null`。
⚠️ `EditorPane` 带 `key={activeDoc.id}` —— **换文档就是整组件重挂**，
省得去写"把 A 文档的撤销栈换成 B 的"这种活。

⚠️ **`TopBar` / `TabBar` 是「无条件渲染」的两个例外**：`Sidebar` 外面套了 `sidebarOpen`、
`StatusBar` 外面套了 `statusBarOpen`、`PluginDock` 外面套了 `dockOpen`——
菜单栏本身**没有开关**（Typora 也没有"藏起菜单栏"这一项），标签栏则只看有没有文档。

### 两个子组件（2026-09-23 起在各自文件里，不在本文件）

| 组件 | props | 行为 |
|---|---|---|
| `TopBar` | `{disabled, checks, themes, currentTheme, onCommand, onTheme, onOpenThemesDir, dockOpen, onToggleDock}` | `<header className="toolbar">`：品牌名「Nota」+ `<MenuBar>` + 右侧的插件栏开关按钮 |
| `TabBar` | `{docs: Document[], activeId, onSelect, onClose}` | `role="tablist"`。每个标签是一个 `role="tab"` 的 div，内含两个 button：标签名（点击 `onSelect`）与 `×`（点击 `onClose`）。`d.dirty` 时渲染 `<span className="tab-dot" title="有未保存的改动" />` |
| `EditorPane` / `Home` / `MenuBar` / `TopBar` / `TabBar` / … | — | 在别的文件里 |

⚠️⚠️ **四个工具条按钮（新建/打开/打开文件夹/保存）2026-09-23 撤掉了**——
它们各是「文件」菜单里的一项，留着就是同一件事的两个入口，而 **Typora 顶栏上并没有
这一排按钮**。对标的是它的布局，不是"多留几个快捷方式"。
快捷键一个没少（Ctrl+N/O/S…），「文件」菜单里也都还在，所以撤掉的是那个**重复的**入口，
不是能力。

⚠️ `TabBar` 里 `aria-selected` 挂在 div 上、但点击处理在两个内部的 button 上——
键盘导航（左右方向键切标签）今天没有。

---

## `src/ui/TopBar.tsx`（74 行）· `src/ui/TabBar.tsx`（43 行）

2026-09-23 从 `App.tsx` 拆出来的两支**纯展示**组件——拆的理由就一条：
`App.tsx` 当时 921 行、贴着 1000 行上限，而这两块的 props 全是显式的，
搬走零风险。下一步（Slidev 右侧面板）还要往 `App.tsx` 加状态。

| 文件 | props | 渲染什么 |
|---|---|---|
| `ui/TopBar.tsx` | `disabled` · `checks` · `themes` · `currentTheme` · `onCommand` · `onTheme` · `onOpenThemesDir` · `dockOpen` · `onToggleDock` · `hideMenuBar` | `<header className="toolbar">`：菜单栏（`hideMenuBar` 为真时**不渲染**）+ 最右那个「插件」按钮 |
| `ui/TabBar.tsx` | `docs` · `activeId` · `onSelect` · `onClose` | `role="tablist"`，每个标签是两个 button（标签名 / ×），`d.dirty` 时多一个小圆点 |

⚠️ 两支都**不持有任何 state**，也**不 import 任何 `api.*`**——这是"拆得干净"的判据，
下次再想搬东西就照这条来：**只画不决策的，搬走**。

⚠️ 拆完之后 `App.tsx` 的组件树**一行没变**（`<TopBar …/>` / `<TabBar …/>` 还是那两个调用点），
所以 `docs/04` §1 那棵树照旧成立——只是括号里的「(App.tsx 内联)」换成了文件名。

---

## `src/bridge/ipc.ts`（529 行）

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
| `UiStyle` | `"auto" \| "adwaita" \| "ghub" \| "macos" \| "plasma" \| "windows" \| "yaru"` | `settings::UiStyle`。⚠️ **七个**，与 `ui/settings/panes.tsx` 的 `STYLES` 表一一对应（那张表写成 `Record<UiStyle, …>`，所以加值时漏不掉） |
| `UiMode` | `"auto" \| "light" \| "dark"` | `settings::UiMode` |
| `ViewMode` | `"wysiwyg" \| "source" \| "split"` | `settings::ViewMode`。⚠️ **不是外观轴**，见 `docs/05` §3.1 |
| `Settings` | `{ui_style, ui_mode, document_theme, view_mode, ui_font_size, content_width, confirm_unsaved, autosave_seconds}` | `settings::Settings` |
| `PluginInfo` | `{id, name, version, description, authors, license, capabilities, entry, dir, state: "loaded"\|"failed"\|"disabled", error: string\|null}` | `plugin::PluginInfo` |
| `NotifyPayload` | `{plugin, message, level: "info"\|"warn"\|"error"\|"success"}` | `nota:notify` 的载荷 |
| `DocumentChangedPayload` | `{id: DocId, text: string, origin?: string}` | `nota:document-changed` 的载荷 |
| `PluginPanel` | `{plugin, id, title, icon: string\|null, location: string}` | `nota_plugin_panels` 的返回（**命令，不是事件**）。⚠️ `location` **不收窄成联合类型**——不认识的据点会被 `PluginDock` 放进「没有落脚处」那组，收窄了反而要把不认识的丢掉 |
| `PluginMenuItem` | `{plugin, label, command, menu, accelerator: string\|null, prompt: PluginPrompt\|null}` | `nota_plugin_menus` 的返回（同上） |
| `PluginPrompt` | `{arg, label, placeholder, hint, secret: boolean}` | `plugin/mod.rs::PluginPrompt`。⚠️ **只有一个 `arg`**：要问两样东西目前做不到（真需要时再加，别先造一个通用表单结构没人用）。⚠️ `secret` **遮的只是屏幕**，值本身明文落盘 |
| `PanelDirtyPayload` | `{plugin, id: string\|null}` | `nota:plugin-panel` 的载荷。⚠️ `id` 为 `null` = **那个插件的所有面板**都该重拉。⚠️ 事件里**一个字节的内容都没有** |
| `DocThemeInfo` | `{id, name, builtin}` | `themes::DocThemeInfo`。⚠️ **`id` 是键、`name` 是显示名**，两者可以不同（内置那六套就是）；`id` 只会是 ASCII 字母数字与 `-` `_`。`builtin` 为真表示"内置那六套之一（且没被用户覆盖）" |

⚠️ 改 Rust 侧字段时**必须同批改这里**。两边不一致时 `invoke` 不会报错，只会给你一个
少了字段的对象，然后在某个 `.map` 上炸掉。

⚠️ `Document.path` 在 TS 这边**没有注释**（`TreeNode.path` 有）。真正的要点是：
Rust 侧它是 `Option<PathBuf>`，所以前端一定可能拿到 `null`——**未存盘的新文档就是
`null`**，用之前先判。`TreeNode.children` 同理（`null` 表示"没有子节点/这一层不展开"）。

### `export const api`

一个对象，**六组**方法（`doc` / `workspace` / `settings` / `theme` / `plugin` / `export`）+ 一个握手。
**全部返回 `Promise`**（`invoke` 的返回值）。

| 组 | 方法 | 对应命令 | 参数映射 |
|---|---|---|---|
| `doc` | `create()` | `nota_doc_new` | 无 |
| | `open(path)` | `nota_doc_open` | `{path}` |
| | `sync(id, text)` | `nota_doc_sync` | `{id, text}`，返回新 revision |
| | `settle(id, text)` | `nota_doc_settle` | `{id, text}`。⚠️ **只在装载流程里用一次**，别拿它当 `sync` 的别名 |
| | `save(id, path?)` | `nota_doc_save` | `{id, path: path ?? null}` —— ⚠️ **显式传 `null`** 而不是省略 |
| | `close(id)` | `nota_doc_close` | `{id}` |
| | `setActive(id)` | `nota_doc_set_active` | 由 `App.tsx` 里跟着 `activeId` 走的那个 effect 统一调（BUG-6） |
| | `get(id)` | `nota_doc_get` | ⚠️ 同上 |
| | `list()` | `nota_doc_list` | |
| | `reload(id)` | `nota_doc_reload` | `App.tsx::reloadDoc`（菜单「从磁盘重新加载」）。⚠️ **不是活动文档时不动编辑器**，只 `refreshDocs()` |
| | `hasUnsaved()` | `nota_doc_has_unsaved` | ⚠️ 没有调用者 |
| `workspace` | `open(path)` | `nota_workspace_open` | 返回**规范化后**的路径 |
| | `close()` | `nota_workspace_close` | ⚠️ 没有调用者 |
| | `get()` | `nota_workspace_get` | |
| | `tree(subPath?, depth?)` | `nota_workspace_tree` | `{subPath: subPath ?? null, depth: depth ?? 1}`，**默认 depth 是 1** |
| `settings` | `get()` | `nota_settings_get` | |
| | `set(settings)` | `nota_settings_set` | ⚠️ 调用者只有 `App.tsx` 的 `updateSettings`（**整份替换**，不是逐项 patch） |
| `theme` | `list()` | `nota_doc_themes` | **`App.tsx` 启动时拉一次**（同一个 `Promise.all`）。⚠️ 不重扫，见 `docs/07` 第 41 项 |
| | `css(id)` | `nota_doc_theme_css` | 返回**文本**。限域在前端做，见 `styles/doc-theme.ts`。⚠️ **入参是 id 不是路径** |
| | `dir()` | `nota_doc_themes_dir` | 给「打开主题文件夹…」用。⚠️ 后端**会把目录建出来**再返回 |
| `export` | `write(path, content)` | `nota_export_write` | `{path, content}`，返回**真实写出去的路径**。⚠️ 调用者是 `ui/useExport.ts` |
| | `print(docPath, title, content)` | `nota_export_print` | `{docPath, title, content}`，返回落点。⚠️ `docPath` 允许 `null`（新文档还没存过）——那时落点变成系统临时目录 |
| `plugin` | `list()` | `nota_plugins_list` | |
| | `setEnabled(id, enabled)` | `nota_plugin_set_enabled` | ⚠️ 没有调用者 |
| | `call(plugin, command, args?)` | `nota_plugin_call` | `{plugin, command, args: args ?? null}`。📌 **2026-09-24 起有调用者了**：`ui/usePlugins.ts::调`（面板按钮与插件菜单项两条路都走它） |
| | `findCommand(command)` | `nota_plugin_find_command` | ⚠️ 没有调用者 |
| | `panels()` | `nota_plugin_panels` | 启动时拉一次（与 `list()` 同一个 `Promise.all`）。⚠️ 别改成等事件，见 BUG-13 |
| | `panelContent(plugin, id)` | `nota_plugin_panel_content` | ⚠️ **返回类型是 `unknown[]`，这是刻意的**：宿主只保证"是 JSON、有上限"，**不保证形状**——标成 `PanelNode[]` 等于对宿主许下一个它没打算兑现的承诺（插件写错一个 `kind`，类型系统一声不吭）。形状由 `ui/panel-nodes.ts::normalise` 一处校验并补齐 |
| | `menus()` | `nota_plugin_menus` | 📌 **2026-09-24 起有调用者了**（`ui/usePlugins.ts`，与 `list()` / `panels()` 同一个 `Promise.all`） |
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

## `src/editor/create.ts`（575 行）

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
  runCommand: (name: EditorCommand) => void;
  destroy: () => void;
}
```

| 方法 | 行为 |
|---|---|
| `getMarkdown()` | 用 `serializerCtx` 把 `view.state.doc` 序列化成 markdown 字符串 |
| `setMarkdown(markdown)` | `editor.action(replaceAll(markdown))` —— **整篇替换**。用于打开文件、插件改了文档、放弃修改重载 |
| `focus()` | `ctx.get(editorViewCtx).focus()` |
| `runCommand(name)` | 按 `EditorCommand` 派命令（`h1`~`h6` 走 `wrapInHeadingCommand` 带层数，其余查 `COMMANDS` 表）。⚠️ **跑完必定 `focus()` 一次**——命令是从菜单按钮上点下去的，那一刻焦点在按钮上，不交回去用户会觉得"菜单点完就卡住了" |
| `destroy()` | `editor.destroy()`。⚠️ 组件卸载时**必须**调，否则 ProseMirror 的 DOM 监听会留着 |

⚠️ `setMarkdown` 是 `replaceAll`，**不保证失败会报错**：一个语法坏掉的 markdown 不会
报错，remark 会按它的理解尽力解析，结果是"一段看起来对但不完全对的内容"。
所以进编辑器的文本要先过 `parseMarkdown()`（见下）。

⚠️ 源码模式那份句柄叫 `SourceHandle`（`editor/source.ts`），**五个方法同名同义**，
所以 `EditorPane` 里一个 `handleRef` 能装两种实例。差别只有两处（`runCommand`
返回 `boolean`、`getMarkdown` 真同步），见 `src/editor/source.ts` 那一节。

### `export interface CreateOptions`

```ts
export interface CreateOptions {
  root: HTMLElement;
  initialMarkdown: string;
  onChange?: (markdown: string) => void;
  readOnly?: boolean;             // ← 分屏右侧那个预览窗格
}
```

`onChange` 的注释说明它**已经在 Milkdown 的 `updated` 钩子里**——调用方拿到后仍要做去抖。

⚠️ **`readOnly` 要两件事同时成立才算只读**，缺一件就是"看着只读、其实在偷偷改文档"：
`editorViewOptionsCtx` 里 `editable: () => !readOnly`（管 DOM 能不能编辑），
以及 listener 里 `if (readOnly) return`（**只读实例一律不报变化**）。
第 2 条别省：预览的文本是别人推给它的，它报变化会让调用方以为"用户改了文档"，
进而把预览的规范化结果当成正文回写。完整理由见 `docs/05` §3.1 / §4。

### `export async function createEditor(options: CreateOptions): Promise<EditorHandle>`

`Editor.make().config(...).use(...).create()`。

`config` 里做两件事：`ctx.set(rootCtx, root)`、`ctx.set(defaultValueCtx, initialMarkdown)`，
然后挂文档变化回调：

```ts
ctx.get(listenerCtx).markdownUpdated((_ctx, markdown, prev) => {
  if (readOnly) return;                     // ← 只读实例一律不报变化（分屏预览）
  if (markdown !== prev) onChange?.(markdown);
});
```

⚠️ **这里不做去抖**：去抖是调用方的事，因为"多快算太快"取决于它拿这个回调干什么
（存草稿 vs 推给后端 vs 更新字数，三种节奏不一样）。真正做去抖的是 `EditorPane.tsx`
（300ms）。

`config` 里还有一处 `editorViewOptionsCtx` 的更新，给正文区挂 `id="write"`，
并设 `editable: () => !readOnly`。**`#write` 已经不是限域机制了**（限域由
`styles/doc-theme.ts` 机械地收到 `.editor-pane` 之下完成），它现在是
**给用户自己写的主题留的钩子**——Typora 主题里大量使用 `#write h1` 这种写法，
留着这个 id，那些选择器被限域之后仍然命中；删掉的话它们会静默失效。
⚠️ **别顺手删。** 见 `create.ts` 里那段注释。

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

## `src/editor/instant-render.ts`（154 行）

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

## `src/editor/atx.ts`（84 行）

**「什么算标题」这件事的唯一判据。** 两种模式的正则都在这里，别处一律往这儿问。

| 名字 | 是什么 |
|---|---|
| `宽松标题层数(text)` | 这段文本算几级标题——`#标签` 返回 `1`，`# 标签` 也返回 `1`，普通正文返回 `0`。**宽松模式那个装饰只用这一个函数** |
| `atxTextRe(strict)` | 把一行拆成「井号 + 内容」的正则：严格是 `^(#{1,6})\s+(.*)$`（井号后必须有空格），宽松是 `^(#{1,6})\s*(.*)$` |
| `atxPrefixRe(strict)` | 行首前缀那段（用来剥掉井号取标题文字）：严格 `^#{1,6} +`，宽松 `^#{1,6} ?` |

⚠️ **三个调用点，都得从这儿进**：

| 调用点 | 用途 |
|---|---|
| `editor/lax-heading.ts` | 宽松模式下"这一段该不该按标题排版、排几级" |
| `editor/source.ts` | 源码模式的标题高亮 |
| `ui/outline.ts` | 大纲与字数 |

⚠️ **还有一份同构的实现在 Rust 侧**：`src-tauri/src/document/mod.rs::strip_atx()`——
标签页标题是**后端**按当前口径从正文算出来的（`first_heading`），不是前端传上去的。
两边判据必须一起改：只改一边的症状是"正文里是标题、标签页却显示「未命名」"（或反过来）。

⚠️ **`宽松标题层数` 的判据是 `#{1,6}` 后面紧跟一个非空白字符**，也就是"CommonMark
永远当不成 ATX 标题"的那种写法——宽松之所以能**一个字节都不改**，靠的就是
"解析器怎么看它都只是一段普通文本"（见下一节）。

---

## `src/editor/lax-heading.ts`（174 行）

宽松模式（默认，`Settings.strict_markdown = false`）认 `#你好` 是标题，而**不改用户写的一个字节**。
两件事各占一半，缺一条都会变成"自动修复"：

| 导出 | 层次 | 干什么 |
|---|---|---|
| `宽松标题显示` | 显示 | `$prose` 插件：给**段落**挂一个 `Decoration.node`，`nodeName` 是 `h1`~`h6`。文档树里它**还是段落**，只是 DOM 上被包了一层 `<h1 class="nota-lax-heading"><p>#你好</p></h1>` |
| `不转义行首井号(原文)` | 序列化 | 包一层 remark 的 `text` 处理器，把 `\#标签` 里那个**多余的反斜杠**去掉 |

### ⚠️ 为什么不是"解析前先把文本补成 `# 你好`"

第一版就是这么干的，被用户否了：**所见即所得那一侧是整篇重新序列化**的，
文本一旦被补过，存盘存下去的就是带空格那份——用户写的字被改了。
现在的分工是**结构性**的：从"段落"到"文件"那条路上没有任何一步会改字。

⚠️ 这条规矩的原话是「**如果关闭，存盘不要自动修复。**」（2026-09-24），
它现在是这个文件头上的第一条不变量。想在这里加"顺手补个空格"的念头，先读文件头。

### ⚠️ 为什么是 `Decoration.node` + `nodeName`

- 文档树里是段落 ⇒ 存盘必然存回原文；
- DOM 上要**真是一个 `h1`** ⇒ 文档主题里写的是 `h1 { font-size: … }`
  （`src/styles/themes/*.css`），换成真标签，**内置六套和用户自己写的主题**
  才一视同仁地生效。反过来"加个 class、让每套主题各补一条同款规则"要逐个补漏。

⚠️ `nodeName` 是**包一层**不是替换标签（`prosemirror-view` 的 `computeOuterDeco` 行为）。
包一层在这里正好：主题里写着 `p { margin: 0 }`，不会叠出双份外边距。

### ⚠️ 为什么这个装饰能缓存，`instant-render.ts` 那个不能

同一节上面写着"装饰故意不做缓存"，**那是另一个插件的结论**，判据不同：

| 插件 | 装饰取决于 | 缓存 |
|---|---|---|
| `instant-render.ts` | 文档 **+ 光标位置** | ❌ 不缓存（判"这次变化影响不影响结果"会判错） |
| `lax-heading.ts` | **只有文档** | ✅ 按"`state.doc` 还是不是同一个对象"缓存——纯光标移动不必全篇重走 |

文档一改对象就换了，缓存自然失效，**不需要自己判断"这次变化影响不影响结果"**。

### 第二半：`不转义行首井号`

`#标签` 在文档树里是段落，而 markdown 序列化器有个保守习惯：段落里**行首**的 `#`
一律转义成 `\#`（`mdast-util-to-markdown` 的 unsafe 表里那条
`{atBreak: true, character: '#'}`）。于是存盘会写出用户没打过的反斜杠——那也是"自动修复"。

⚠️ 那条转义**只在"井号后面有空白"时才有用**，而那种写法我们一个字都不碰，
所以规则可以收得很紧（`/(^|\n)\\(#{1,6})(?=[^\s#])/g`：**必须**是 `#{1,6}` 后面紧跟
非空白非井号），也所以**两种模式都改**——用户看到的规律才是一句话
「**Nota 不会往你写的井号上加反斜杠**」。

⚠️ **已知的一处残留改字**：用户**手打**的 `\#标签` 会丢掉那个反斜杠。
转义井号和裸井号在文档树里是同一个东西（都是文本 `#标签`），要区分只能记住源码。
差别只在字节上，两边的解析结果与显示完全一样——记在 `docs/03` §5.5。

---

## `src/styles/applyTheme.ts`（102 行）

把设置里的**两条界面轴**落到 DOM 上：

```text
<html data-ui-style="macos" data-ui-mode="dark">
```

| 轴 | 属性 | 管什么 |
|---|---|---|
| 界面风格 | `data-ui-style` | 一整套设计语言：控件形状、圆角、间距、动效、字体栈 |
| 明暗 | `data-ui-mode` | 亮/暗。**任何风格下都成立** |

所以 CSS 的组织方式是 `[data-ui-style="x"]` 定形状、`[data-ui-mode="y"]` 定颜色，
**两者相乘**。写新风格时不要图省事把颜色也塞进 style 里——那样它就没法配暗色了。

⚠️ **第三条轴（文档主题）不在这里，而且没有 DOM 属性。** 2026-09-23 之前它也在这张表上
（`data-doc-theme`），那正是"换个文档主题、整个应用跟着变色"的来源。现在它是一份
注进 `<head>` 的 `<style id="nota-doc-theme">`，只对 `.editor-pane` 之下生效——
见 `styles/doc-theme.ts`。**别把它加回 `<html>` 上。**

### 私有辅助

| 函数 | 行为 |
|---|---|
| `systemPrefersDark() -> boolean` | `window.matchMedia?.("(prefers-color-scheme: dark)").matches ?? false` |
| `detectStyle() -> Exclude<UiStyle, "auto">` | 探"自动"风格该落到哪个具体风格。把 `navigator.userAgent` 与 `guessDesktop()` 拼起来小写后判：含 `kde`/`plasma` → `plasma`；含 `ubuntu`/`yaru` → `yaru`；含 `windows` → `windows`；含 `mac`/`darwin` → `macos`；**其余一律 `adwaita`**（它是 GNOME 的原生语言，也是 WebKitGTK 下最不出错的一档） |
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

⚠️ 调用方（`App.tsx`）**曾经丢掉了这个返回值**（BUG-7），所以 auto 模式下每次 `settings`
变化都会多挂一个监听器且从不移除。**2026-09-22 已修**：现在写的是
`if (settings) return applyTheme(settings);`，退订函数被正确地交了出去。

⚠️ `--ui-font-size` 用的是 `style.setProperty`（内联样式），而三条轴用 `dataset`
（属性）—— 两者在 CSS 里的优先级不同，写新样式时要意识到字号的来源是内联的。

⚠️ `matchMedia` 全部用了可选链（`window.matchMedia?.`），因为非浏览器环境（测试、
SSR）下它可能不存在。

---

## `src/styles/doc-theme.ts`（231 行）

**「文档主题碰不到外壳」这条线的全部实现。** 把一份**按普通文档 CSS 写**的主题
（内置六套在 `src/styles/themes/*.css`，用户自己写的也一样）改造成**只作用于正文**
的样式。

### 为什么不能直接把主题 CSS 塞进 `<style>`

一份文档主题里写的是 `h1 { font-size: 2.2em }`、`body { color: … }`、`a { color: … }`，
**全都没有前缀**——不这么写就没人写得动主题。原样注入的后果是应用外壳的标题、链接、
按钮一起被改，侧栏和菜单栏当场散架。所以要先**把它们关进 `.editor-pane` 里**。

⚠️ **`scopeDocThemeCss` 有两个调用点**：屏幕上的 `applyDocTheme`（注入 `<style>`），
以及**导出**（`editor/export.ts` 把限域后的文本嵌进导出文件）。导出那一份**同样必须限域**——
不限域的后果和界面上一样（主题里那句 `body { … }` 会落到导出文件的页面上）。

⚠️ **这份改造是机械的**，不靠写主题时自觉。主题文件里写漏了也漏不到外壳上去——
这是下面那条"`check_id` 是安全边界"之外**第二条**边界，管的是"样式别越界"而不是"文件别越界"。

⚠️ **上一版（已删）这里的做法不一样，别再照着旧的想。** 上一版兼容 Typora 主题，
四步是：展开 `@import` → 把 `url()` 内联成 `data:` URL → 解析 → 收拢到 `#write`
**并把 `:root` 变量提升到全局**。最后那半句正是"换个文档主题、整个应用跟着变色"的来源
（`theme.css` 末尾有一排 `var(--nota-bridge-X, default)` 在消费它们）。
用户 2026-09-23 说「这是文档风格，不是界面风格，不应该影响到UI主题」，**桥和提升都拆了**。

### 管线

```text
loadDocTheme(id)  →  api.theme.css(id)  取回**文本**
                  →  scopeDocThemeCss()  解析 + 改写选择器
                  →  <style id="nota-doc-theme"> 追加进 <head>
```

### `export function scopeDocThemeCss(css: string): string`

用**浏览器的 `CSSStyleSheet`** 解析（`replaceSync`），**不用正则**。
⚠️ 理由：正则切 CSS 是经典翻车现场（注释里的花括号、`content: "}"`、嵌套 `@media`）。
浏览器自己的解析器是最准的那个，而且免费。
⚠️ 解析失败（语法坏到浏览器都不认）时**返回空串而不是抛**——换主题失败不该带崩编辑器。

### 六条限域规则（顺序不能换）

| # | 情况 | 怎么办 |
|---|---|---|
| 1 | 已经含 `.editor-pane` | **原样放过**。再套一层会变成 `.editor-pane .editor-pane h1`，永远命不中（**这是最容易犯的错**） |
| 2 | `:root` / `html` / `body` **单独出现** | **改写成** `.editor-pane`（**不是加前缀**）——它们指的就是"正文那棵树的根" |
| 3 | 前导 `html` / `body` 链（`html body` / `body > p`） | 整条前缀**摘掉**，剩下的照第 4 条办 |
| 4 | 其余一切 | 加 `.editor-pane ` 前缀，**包括我们根本没有的那些选择器**（`#typora-sidebar` 之类）。给它们加前缀等于让它们安全地失效：不报错、不起作用、也不污染外壳 |
| 5 | `@media` / `@supports` | **下钻**——里面的选择器同样要收拢 |
| 6 | `@font-face` / `@keyframes` / `@page` | **原样放过**（内容不是选择器，套上前缀会当场失效）。`@import` / `@charset` 与不认识的 at 规则**丢掉** |

⚠️ **规则 2 是这次修 bug 的关键，别为了让某个主题"能改外壳"把它改回去。**
上一版把 `:root` 的变量**提升到全局**供外壳消费，这一版把它**改写到编辑区**，变量再也出不去。

⚠️ `splitTop()` 按**顶层**逗号切选择器——`:is(a, b) h1` 里那个逗号不是分隔符。
引号与 `()`/`[]` 的深度都要照顾到。

### `export function applyDocTheme(css: string | null): void`

传 `null` = **撤掉主题**。

⚠️ **`null` 是"删掉那个 `<style>` 元素"，不是"注入一段空 CSS"**——所以回到的是
**我们自己的样式**（`editor.css` 那份），不是"没有样式的裸 HTML"。这个区别很要紧：
`editor.css` 里的排版是按 token 写的，token 有默认值，删掉主题照样是一份能读的文档。

⚠️ 用**一个固定的 `<style id="nota-doc-theme">`** 做替换，而不是每次 append 一个新的：
后者在用户来回切主题时会原地堆出一串 `<style>`，而且旧的那份仍然生效，
最后谁都说不清当前是哪套主题。

⚠️ 末尾还拼了一条 `::selection` 规则（`SELECTION_RULE`），用
`var(--select-text-bg-color, highlight)` / `var(--select-text-font-color, highlighttext)`
取色。**`highlight` / `highlighttext` 这两个 fallback 不能省**：
`background: var(--x)` 在 `--x` 不存在时整条声明失效、回落到 `unset`（也就是 `transparent`），
症状是**选中了看不见**。

### 边界：主题能改什么

主题由两部分组成，**也只有这两部分**：

1. 在 `:root` 里**改 token**（`--doc-bg` / `--doc-fg` / `--border` / `--bg-subtle` /
   `--radius` / `--code-*` / `--select-text-*` / `--font-doc` / `--doc-font-size` /
   `--doc-line-height`）。⚠️ 编辑区骨架的样式在 `editor.css` 里是**用 token 写的**，
   所以改 token 就能连代码块底、边框、圆角一起换，**不用去跟 `editor.css` 抢选择器权重**
   （抢不过：那边是 `.editor-mount .ProseMirror`，两条选择器）；
2. 写 `editor.css` **没有覆盖过**的那部分排版：标题、链接、引用、表格、分隔线、列表。

⚠️ 按**它自己的 DOM** 写的选择器（`#typora-sidebar` / `.megamenu` / `#top-titlebar` /
`#typora-source` / `.md-toc` / `.md-math` / `.md-image`）在我们这里会变成
**永远不会命中的死规则**——不报错，也不起作用。**这不是 bug 是边界**：
我们没有和 Typora 一样的 DOM 契约，就不该假装有。

无测试（前端没有测试运行器）。⚠️ **但限域本身在 Rust 那侧有一条回归测试兜底**：
`themes.rs::内置主题不碰界面变量` 逐份扫内置 CSS，不许出现界面变量名——
确保"哪天有人图省事在主题里加一条界面变量"会被测试抓住。**限域逻辑（`scopeDocThemeCss`）
本身仍然没有机器判据**，只能靠人看版式。

---

## `src/ui/MenuBar.tsx`（185 行）

菜单栏。**这是"模仿 Typora 界面布局"里最主要的一块。**

在这之前 Nota 只有一条工具条 + 四个按钮（新建/打开/打开文件夹/保存），
而 Typora 单是「段落」一栏就有二十来项（`docs/07` 第 40 项记的就是这个缺口，已结清）。

### `export function MenuBar(props: Props)`

| prop | 类型 | 用途 |
|---|---|---|
| `disabled` | `Set<string>` | 当前**用不了**的命令 id。没实现、或缺活动文档，都进这个集合 |
| `checks` | `Record<string, boolean>` | 可勾选项的当前状态 |
| `themes` | `DocThemeInfo[]` | 已经扫到的**文档主题** |
| `currentTheme` | `string` | 当前文档主题的 **id**。空串 = 无主题 |
| `onCommand` | `(id: string) => void` | 点了一个普通条目 |
| `onTheme` | `(id: string) => void` | 选了某个主题（空串 = 无主题）。⚠️ **传的是 id 不是显示名** |
| `onOpenThemesDir` | `() => void` | 点了「打开主题文件夹…」 |

内部只有一个 state：`const [open, setOpen] = useState<string | null>(null)`（哪一栏开着，
`null` = 全关）+ 一个 `barRef`。

### 灰掉的项不是省事，是**如实**

菜单里会出现一些灰条目（「查找和替换」「源代码模式」）。它们不是占位符，
也不是"以后会做"的许诺——它们是**当前确实做不到**的能力，摆在那里是为了**让缺口可见**。
判据是"`App.tsx` 里有没有这个 id 的处理函数"（见 `commands.ts` 顶上那段），
所以**灰的就一定是真没有**，不存在"忘了翻标志"。

### 交互按桌面惯例，不是按网页惯例

- 菜单开着时**鼠标划过另一栏就切过去**（`onMouseEnter` 里 `open && setOpen(...)`）——
  不用先点开再点另一栏；
- 点空白处关：⚠️ 用 **`mousedown` 不是 `click`**——`click` 要等鼠标抬起，期间菜单还开着，
  点到的东西会被菜单挡住，手感是"点了两下才关掉"；
- 按下 Esc 关，**且焦点回到那一栏的按钮上**——不然键盘用户在菜单关掉后就没有落点了，
  下一次 Tab 会从页面开头重新数；
- 点已经开着的那一栏 = 收起（桌面惯例）。

### 「主题」那一栏是**动态**的

`MENUS` 里 `theme` 那一项只写了 `dynamic: "themes"`、`items: []`——
内容由 `themeEntries()` 现算：一条「无主题（内置）」+ 每个主题一条 + 末尾一条
「打开主题文件夹…」。⚠️ 这两条**不在 `commands.ts` 里**，因为它们只属于这一栏。

主题条目的 id 是合成的：`__theme-none` 与 `__theme:<id>`（前缀常量 `THEME_PREFIX`），
`pick()` 按前缀分流到 `onTheme`，其余走 `onCommand`。

显示名用 `t.name`（**内置那六套是中文**：素纸/蓝图/晨雾/报刊/墨色/松林），
被用户覆盖过的那几条（`builtin === false` 但 id 与内置同名）后面跟一个「（已自定义）」。

⚠️ **这一栏装的全是文档主题，一条界面主题都没有**，也没有落点能改外壳。
界面那两条轴（风格、明暗）的入口在 `ui/settings/`。
用户 2026-09-23 明确要求两者分开，**别为了"方便"把它们并回来**。

---

## `src/ui/commands.ts`（415 行）

菜单栏的**骨架**：菜单怎么排、每一项叫什么、有没有快捷键。
逐条抄自 Typora 的菜单（用户 2026-09-22 截了 6 张图，抄录在 `docs/10` §11.1）。

### 类型

| 类型 | 说明 |
|---|---|
| `MenuItemSpec` | `{ id, label, accel?, needsDoc?, checkable?, danger? }` |
| `MenuEntry` | `MenuItemSpec \| "sep"` |
| `MenuSpec` | `{ id, label, items: MenuEntry[], dynamic?: "themes" }` |

`export const MENUS: MenuSpec[]` —— **七栏**：文件 / 编辑 / 段落 / 格式 / 视图 / 主题 / 帮助。

⚠️📌 **这一份是"内置的那七栏"，不是菜单栏最终的样子。** 插件声明的那一栏由
`ui/pluginMenus.ts::带插件栏(MENUS, 菜单项们)` **拼在「帮助」前面**，
拼的结果在 `ui/usePlugins.ts::menus`（`useMemo`）里。所以：
**要拿"菜单栏现在长什么样"请用 `usePlugins().menus`，不是 `MENUS`。**
⚠️ **消费者分两拨，别搞混**：

| 消费者 | 用的是哪一份 |
|---|---|
| `ui/MenuBar.tsx`（画出来的菜单栏）、`ui/nativeMenu.ts`（原生菜单）、`ui/accel.ts::buildAccelIndex`（快捷键派发） | **拼过的**（`usePlugins().menus`）。漏掉哪一处，插件那一栏就只在那一个消费者看得见 |
| `src/ui/settings/ShortcutsPane.tsx` | ⚠️ **仍然是常量 `MENUS`**——所以**插件的快捷键不出现在「快捷键」那一页**。这不是漏改，是没做：那一页的分组**在模块级算一次**（`const GROUPS`），要带上插件项就得改成受控的。今天唯一的后果是"插件快捷键查不到"，**没记进 backlog 是因为它还没被人抱怨过**——真要改时别只加一个 import |

⚠️ `ui/FormatBar.tsx` 也读常量 `MENUS`，但那是拿**内置命令的快捷键文本**
（格式工具栏的 tooltip），**跟插件无关**，不用改。

### ⚠️ 「能不能兑现」不是这里说了算

本文件**不写** `implemented: true/false` 这样的标志位。判据是
**`App.tsx` 里有没有这个 id 的处理函数**：有就亮，没有就灰。

这是**有意的**。手写的标志位一定会腐坏——加了实现忘了翻标志、或者翻了标志
实现早被删了，两种都不会报错，只会让界面撒谎。用"有没有处理函数"当判据，
它就不可能不一致：**界面永远不会声称一个它做不到的能力**。
派生表在 `App.tsx` 的 `menuHandlers` 上（`disabledCommands` 由它算出来）。

### ✅ `accel` 是**快捷键的唯一真源**（2026-09-23 起）

这条曾经是反的（「`accel` 只是显示，真绑定在 `App.tsx` 手写」），现在正过来了：

```text
commands.ts 的 accel ──> ui/accel.ts::buildAccelIndex ──> App.tsx 查表派发
                     └──> ui/nativeMenu.ts ──────────> 原生菜单（macOS）
                     └──> ui/MenuPopup.tsx::formatAccel ──> 菜单上显示的那几个字
```

**三个消费者，一个源**。所以"菜单上显示 `Ctrl+P`"和"按 `Ctrl+P`"再也不可能
各说各话——这正是重做的目的。代价是**写错 `accel` 会静默换键**（显示的那个键
不灵、另一个键开始干这件事），为此 `buildAccelIndex` 在构建时对
**重复键位**和**muda 认不出的写法**都 `console.warn`。

⚠️ `accel` 里的 `Ctrl` 在 macOS 上是 **⌘**（`formatAccel` 出 `⇧⌘S`，
`native_menu.rs` 翻成 `CmdOrCtrl+`）。muda 的 `CTRL` 在 macOS 上是**真的
Control 键**，直接用会让用户按 ⌘ 没反应。

### 为什么界面串一律中文

Typora 自己的菜单是**中英混杂**的（"帮助"整栏除最后三行外全是英文），
用户 2026-09-22 明确说过「注意不要像他一样中英混杂」。
规矩：**菜单项、按钮、提示语一律中文**；`Markdown` / `LaTeX` / `Pandoc`
这种**专有名词**照写原文（它们是名字不是词）。

⚠️ 「帮助」那一栏**只留了「关于 Nota」一条**：Typora 那里是
「What's New / Quick Start / Markdown Reference…」全是外链，我们离线优先，
外链既打不开也不该假装能打开。

### 菜单树里的三种形状

```ts
"sep"                          // 分隔线
{ id, label, accel?, … }       // 叶子项；有 accel 就会同时进快捷键索引
{ id, label, submenu: [...] }  // 父项；⚠️ **不带 enabled/accel**，只负责飞出来
```

⚠️ **父项不该有 `accel`**：它没有动作可绑，写了只会让快捷键索引里多一条
指向"打开一个子菜单"的伪命令。`native_menu.rs` 那边也照这个口径
（父项不带 `enabled`，因为枚举型的原生菜单项没有这个概念）。

---

## `src/ui/MenuPopup.tsx`（336 行）

一栏的弹层 + 它飞出来的子菜单。从 `MenuBar.tsx` 拆出来的：**菜单栏负责
"哪一栏开着"，这里负责"开着的那一栏里有什么、怎么走"**，
两者共用的只有 `disabled` / `checks` 两张表。

### ⚠️ 只支持**一层**子菜单

不是省事。VMark 那边最深也就是一层，Typora 也一样——两层以上在桌面软件里
几乎见不到，因为鼠标要走的对角线越来越长、越容易半路误触。内部 `SubMenu`
**自己不认 `submenu` 字段**，所以第二层会静默变成一个点不动的项。
真要加，先想清楚是不是该把那一组拆成两个平面菜单。

### ⚠️ 子菜单为什么走 portal ＋ `position: fixed`

两个坑，都踩过：

1. **父弹层要能滚**（菜单太长时 `overflow-y: auto`），而 **CSS 里一个轴设成
   `auto`，另一个轴的 `visible` 会被算成 `auto`**——子菜单一飞出右边缘就被裁掉，
   症状是只剩一条几像素的竖条。
2. `fixed` 到视口上才不受滚动容器裁剪，但那样坐标就得**自己量**（`subAnchor`
   那段）。portal 到 `body` 是为了顺带躲开弹层那条 `transform` 动画——
   动画期间它会变成 `fixed` 后代的**包含块**，又把人拽回裁剪里。

⚠️ **DOM 顺序反了不要紧，`z-index` 也不该靠它**——portal 出去之后弹层和
主弹层是兄弟关系。

### 方向键的归属

`←` `→` 的去向是这一层和外面**约定好**的，不靠事件冒泡
（主弹层里 `→` 展开子菜单、子菜单里 `→` 什么都不做、`←` 收起自己）。
⚠️ 子菜单的 `onKeyDown` **必须 `stopPropagation`**，否则同一个键会冒泡到
父弹层再被解释一遍——症状是按一下 `↓` 跳两格。

---

## `src/ui/accel.ts`（353 行）

**快捷键的解析、显示与派发。** 这是 "菜单上写着的键" 和 "按下去真的响的键"
合成一件事的那一环，见 §`commands.ts`。

### 导出

| 名字 | 干什么 |
|---|---|
| `parseAccel(text)` | `"Ctrl+Shift+S"` → `{ ctrl, shift, alt, key }`。⚠️ `split_key_and_modifiers` 式的 `rfind('+')`，所以 `Ctrl++` 这种要留意 |
| `accelSig(a)` | 规范化成签名串（`"ctrl+shift+s"`），**比较只认签名**，不认原始写法 |
| `eventAccel(e)` | 从 `KeyboardEvent` 反推签名。⚠️ **优先 `CODE_TO_KEY[e.code]`**，退回 `e.key.toLowerCase()` |
| `formatAccel(text, mac?)` | 显示用。macOS 上出 `⇧⌘S`，其余出 `Ctrl+Shift+S` |
| `buildAccelIndex(menus)` | 走遍 `MENUS`（含子菜单）建 `Map<签名, 命令 id>`，重复键位与认不出的写法都 `console.warn` |
| `isOutsideEditor(target)` | 焦点在 `input`/`textarea`/`select`/`contenteditable` **且不在 `.editor-pane` 里** |

### ⚠️ 为什么判 `e.code` 不判 `e.key`

按着 Shift 敲数字排，`e.key` 拿到的是**上档字符**（Shift+1 是 `"!"`），
所以 `Ctrl+Shift+1` 用 `e.key` **永远查不到**。这曾经是两条按了没反应的死代码，
而静态读代码完全看不出来。`CODE_TO_KEY` 把物理键位映射成不带修饰的名字。

⚠️ **这张表漏过一次，而且是静默的**：少了 `Digit1`…`Digit9` 之后代码退回
`e.key`，而**不带 Shift 时 `e.key` 恰好就是 `"1"`**——`Ctrl+1` 照样能用，
窟窿被盖住，只有 `Ctrl+Shift+1` 会露馅。现在由试验台的 `#accel` 场景
（30 条键位 + 9 条显示）盯着。

### ⚠️ `MOD_ALIASES` 把 ⌘ 折进 `ctrl` 那一维

`cmd` / `command` / `meta` / `super` / `win` 全算 `ctrl`。这是**跨平台口径**：
`commands.ts` 里写的 `Ctrl+S` 在 macOS 上就是 ⌘S，不是真的 Control。
显示与原生菜单转换都按这个口径走。

---

## `src/ui/nativeMenu.ts`（90 行）

把同一份 `MENUS` 翻译成**后端要的形状**（`NativeMenuNode[]`），
`api.nativeMenu.apply()` 送过去。**这里不碰 `muda` 的语法**——
加速器字符串怎么转是纯 Rust 那边的事（`src-tauri/src/native_menu.rs`）。

| 输入 | 输出 |
|---|---|
| `"sep"` | `{ sep: true }` |
| 有 `submenu` 的项 | `{ id, label, children }`，**不带 `enabled` / `accel`** |
| 叶子项 | `{ id, label, accel, enabled, checked }`，`checked` 只在 `checkable` 时才给 |
| `dynamic: "themes"` 那一栏 | 用 `themeEntries(themes)` 现算，勾选态由 `themeChecks` 给 |

⚠️ **主题那栏的 id 是合成的**（`__theme:<id>` / `__theme-none` / `__theme-dir`），
原生菜单事件回来之后要经 `resolvePick(id)` 分流——**不能让后端去认这些前缀**，
它只负责把 id 原样送回来。

---

## `src/ui/useSlidev.ts`（290 行）

Slidev 预览的全部编排。2026-09-23 从 `App.tsx` 搬出来（那时那边 992 行、贴着 1000 上限）。
搬的判据和 `TopBar`/`TabBar` 那次不同——那两支是「只画不决策」，这一支恰恰全是决策；
它搬走是因为**能整块独立存在**：只认「文档列表 + 现在编辑器里的正文」，不碰布局也不碰菜单表，
`App.tsx` 那边只剩三行接线。

```ts
useSlidev({ docs, toast, getMarkdown })
  -> { session, toggle, onStopped, gate, gateActions }
```

| 返回值 | 说明 |
|---|---|
| `session` | `SlidevSession \| null`。`null` = 没开（菜单不勾）。`phase` 有 `"starting"`（进程起了、端口还没通）与 `"on"`（能看了，开始同步）两档 |
| `toggle(activeId)` | 开着就关、关着就开。`activeId === null` 是空操作（菜单那边也已经灰了）。⚠️ **`starting` 也算开着**——那段时间进程已经在跑，让勾消失、用户再点一下就会起第二个服务器。⚠️ 2026-09-24 起**不直接 `start`**：先 `check(docId)` 出面板 |
| `onStopped()` | 后端报「预览停了」（用户叉了预览窗）→ 跟上，把勾去掉 |
| `gate` | `SlidevGate \| null`（`{ docId, probe }`）。`null` = 面板没开；`probe === null` = 还在检测 |
| `gateActions` | 面板上的四个动作：`onOpen`（收面板 + `start`）/ `onGuide`（`openUrl(GUIDE_URL)`）/ `onRecheck` / `onClose`。⚠️ 名字**照 `SlidevPanel` 的 props 取**，点开那个文件就能对上 |

一次预览是**四步**（2026-09-24 起前面多一道闸）：**问装没装 → 起进程 → 轮询到端口通 → 开窗口**。

```text
点菜单 ──> check(docId)：一个异步命令，最长 20 秒 ──> 面板（装/没装/说不准）
                                                      ├── missing → 去官网（系统浏览器），到此为止
                                                      └── ready / 用户硬闯 → start
start ──> 每 500ms probe 一次（最多 180 秒）──> openWindow ──> 每 1350ms（去抖）sync
   └── 超时：把 Slidev 自己的输出端给用户 + 收摊
```

⚠️ **探测和起进程是两个动作，不是一个**：探测失败**不改变任何状态**（`check` 只 `setGate`），
用户看完关掉面板就什么都不该发生。所以它是 `gate` 而不是 `session` 的一部分。

### ⚠️ `gate` 与 `gateRun`（和 `run` 同一套道理）

`gateRun.current` 也是每次开面板/重检都 +1，**晚到的报告不许把面板重新打开**：
用户可能在检测还没回来的时候就把面板关了，或者又点了一次菜单（那是另一次检测）。
⚠️ IPC 自己失败时**不报成 `missing`**，而是拼一份 `state: "unknown"` 的报告——
探测自己没跑起来 ≠ 没装，替用户断言「你没装」是不诚实的。

### ⚠️ `GUIDE_URL` 与它是怎么核出来的

`https://sli.dev/guide/`。⚠️ **核过的，不是凭印象写的**：`https://sli.dev/hashmap.json`
（VitePress 的页面表）里有 `guide_index.md`（Getting Started，正文就是 `npm init slidev@latest`），
**没有 `guide/install`**。⚠️ 而**看状态码核不出来**：那站是 SPA，随便什么路径都回 200 和同一个外壳
（实测乱编的路径也是 200、20438 字节、逐字节相同）。

⚠️ **中间那步不能挪到后端**：第一次跑要下几百 MB 的 Slidev，等几分钟都可能，
而后端的同步命令跑在主线程上——在后端等就是冻界面。等待由这里的循环承担
（`probe` 本身带 300ms 超时，所以最坏每轮 800ms，界面全程有响应）。

### ⚠️ 三个不显然的地方

- **`run.current` 那个计数器**：每次开始/停止都 +1，在途的轮询靠它判断「我这一轮还算数吗」。
  少了它，「等端口的时候又点了一次菜单」会在停掉之后凭空开出一个窗口，而且**没人关得掉**
  （那时 `session` 已经是 `null` 了）。
- **会话状态不落盘**：不进 `settings`，因为它和 `dockOpen` 同类——是「现在开着的东西」。
  下次开应用时那个子进程早就没了，把 `true` 记进设置只会让菜单勾着一个不存在的会话。
  真正的存活状态在 Rust 那边，前端靠 `api.slidev.status()` 在挂载时**拉**一次接回来
  （改前端代码存盘会只热重载前端，Rust 侧没重启）。
- **开窗失败不判整场失败**：退回系统浏览器（`openUrl`），预览照样能看。
  窗口开不出来多半是环境的事（没有窗口管理器、WebView 起不来），不该把「能看到幻灯片」一起带走。

---

## `src/ui/SlidevPanel.tsx`（164 行）

「视图 → Slidev 预览」点下去**先看见的那个面板**（2026-09-24）。

### 它认识的东西很少

一份 `SlidevProbe`（后端给的报告）＋ 四个回调。**判定的话全在 `message` 里，中文，后端写的**——
那边才知道为什么（离线拿不到包 / 目录里没主题 / 文档没存过盘）。这里只按 `state` 决定按钮怎么摆，
**一个字都不重写**。

| 状态 | 符号 | 主按钮 | 左边那组 |
|---|---|---|---|
| 检测中（`probe === null`） | 转圈 | 「检测中…」（**禁用**） | 「重新检测」（禁用） |
| `ready` | 绿 ✓ | 「打开预览」 | 「重新检测」 |
| `missing` | 橘 `!` | 「去官网看安装指南」 | 「重新检测」＋**「仍然打开预览」** |
| `unknown` | 灰 `?` | 「仍然打开预览」 | 「重新检测」 |

另有一块 `<dl>` 显示**命令**与**目录**（`probe.command !== ""` 时才画）——
用户拿着它俩能自己判断（比如「查的是另一个目录」）。

### ⚠️ 三个不显然的地方

- **它不是一堵墙**：`missing` 时主按钮是「去官网」，但旁边仍留「仍然打开预览」。
  探测是**有根据的猜测**，不是证明（主题可能装在更上面的某层，我们没料到），
  判定错了的时候用户得能自己走下去。
- **不用 `window.confirm`/`alert`**：它们会阻塞 WebView、把中文输入法的组合态打断（同 `ConfirmDialog`）。
  壳也是借确认框那套（`.confirm-backdrop` + `.confirm-dialog`），样式在 `styles/slidev.css`。
- **焦点与键盘**：结论出来后焦点给主按钮（回车即"开"），Esc 关掉。⚠️ 监听绑在 `window` 上
  （捕获阶段）而不是框里——焦点可能还没落进来。⚠️ 焦点那个 effect 的依赖里带 `primary.label`：
  `missing` 和 `ready` 的主按钮是**两颗不同的按钮**，换过去时焦点得跟着换。

---

## `src/ui/EditorPane.tsx`（399 行）

编辑区：把编辑器实例接进 React 生命周期，并按**模式**摆一到两个窗格。
架构与三条模式口径写在 `docs/05-editor-bridge.md` §3 / §3.1，这里只讲落地细节。

### 文件头的"为什么"要点

⚠️ **React 不该管编辑器内部的 DOM**。Milkdown（ProseMirror）自己拥有那块 contenteditable，
React 只负责"什么时候挂上去、什么时候拆掉"。想让 React 去 diff 编辑区的内容，
两边会互相覆盖——这类 bug 表现为"打着字光标突然跳走"，而且极难复现。
所以这里用一个**从不重新渲染的空 div** 当挂载点，内容变化一律走 `setMarkdown()`
这条命令式通道。

挂载点在 App 里带 `key={doc.id}`：换文档时整个组件重挂，省得去写"把 A 文档的撤销栈换成
B 的"这种活——重挂就是最干净的换法。**换模式也走同一个 effect 重挂**（依赖数组是
`[doc.id, mode]`），理由同：两家的撤销栈不是一回事，硬接只会得到一个"撤销会跳到
另一个编辑器历史里"的怪物。

### `export interface EditorPaneHandle`

```ts
export interface EditorPaneHandle {
  getMarkdown: () => string | undefined;
  setMarkdown: (markdown: string) => void;
  runCommand: (name: EditorCommand) => void;
}
```

比 `EditorHandle` 少了 `focus` / `destroy`——那两个是内部生命周期的事。
⚠️ `getMarkdown` 返回 `string | undefined`：编辑器还没建好时是 `undefined`。
调用方（`App.tsx::saveDoc`）必须处理这个 `undefined`（它就是靠这个判"还没准备好"）。
⚠️ `runCommand` 是 2026-09-23 加的：菜单栏与快捷键要能派命令，而它们够不着
`handleRef.current`（编辑器实例），只够得着这个 ref。

### `interface Props`

```ts
interface Props {
  doc: Document;
  mode: ViewMode;                    // ← 三种编辑模式，来自 settings.view_mode
  contentWidth: number;
  onToast: (message: string, level?: "info" | "warn" | "error" | "success") => void;
  onDocsChanged: () => Promise<unknown>;
  ref?: Ref<EditorPaneHandle>;
}
```

⚠️ `ref` 是**普通 prop**（React 19 的写法，不需要 `forwardRef`）。
`onDocsChanged` 的返回类型是 `Promise<unknown>`（宽松的写法，因为 `refreshDocs`
返回的是 `Promise<Document[]>`）。
⚠️ `mode` 由 `App.tsx` 从 `settings.view_mode` 取（兜底 `"wysiwyg"`），**和菜单里那三个
✓ 同源**——各存一份的症状是"菜单里的 ✓ 在 A 上、编辑区却是 B"。

### 两个去抖常量

| 常量 | 值 | 推给谁 |
|---|---|---|
| `SYNC_DEBOUNCE_MS` | `300` | 后端（`api.doc.sync`）。见 `docs/03` §9.1 |
| `PREVIEW_DEBOUNCE_MS` | `150` | **分屏右边那个预览窗格**。本地的、不跨 IPC，比 300 短——够挡住"每个字符都重解析整篇文档"就行 |

### `export function EditorPane({ doc, mode, contentWidth, onToast, onDocsChanged, ref }: Props)`

ref 有六项：`mountRef`（左窗格挂载 div）、`previewRef`（分屏时右窗格）、
`handleRef`（权威编辑器句柄，**两种类型都可能**：`EditorHandle | SourceHandle`）、
`previewHandleRef`（预览那份 Milkdown）、`timerRef` / `previewTimerRef`（两个去抖），
外加 `latestRef`（**最后一次知道的文本**）和 `ready`（state）。

**`latestRef` 是切模式时文本不丢的关键**，两条规则合起来才完整：

1. `onChange` 里更新它——但 `onChange` 本身被 300ms 去抖拖着，
   用户打完最后一个字**立刻**切模式，那一下还没进 `latestRef`；
2. 所以清理函数里**再从活着的实例同步读一次**（`handleRef.current?.getMarkdown()`）。

⚠️ 少了第 2 条，症状是"切模式丢掉最后几个字"——而且只在手快时复现。

**`useImperativeHandle`** 暴露三个方法给 App，都是"转发给 `handleRef.current`，
没有就什么都不做"。⚠️ `setMarkdown` 转发给**两个**句柄（权威那个 + 预览那个）：
插件改文档时整篇替换要两边一起换，只换一边会留下一个显示旧内容的预览。

**主 effect（依赖 `[doc.id, mode]`）的骨架**：

```text
mount = mountRef.current，没有就 return
initial = latestRef.current            // ⚠️ 不是 doc.text，见上
if (mode === "wysiwyg") handle = await createEditor({root, initial, onChange})
else                    handle = createSourceEditor({root, initial, onChange})
      // onChange 里：更新 latestRef → （split 时）pushPreview() → 300ms 后 sync
if (disposed) { handle.destroy(); return; }        // StrictMode 双跑：第一遍的实例要拆掉
handleRef.current = handle; setReady(true); handle.focus();
if (mode === "split" && previewRef.current)        // 右窗格：只读、不接 onChange、不 settle、不 focus
  preview = await createEditor({root: previewRef.current, initialMarkdown: initial, readOnly: true})
const settled = handle.getMarkdown(); latestRef.current = settled;
if (mode === "wysiwyg" && settled !== doc.text) await api.doc.settle(doc.id, settled);
catch → onToast(`编辑器启动失败：${e}`, "error")
```

⚠️ 六个要点：
- **`if (disposed) { handle.destroy(); return; }` 是 StrictMode 的补丁**。effect 跑两遍时
  第一遍的实例如果已经建好了，这一遍就得把它拆掉，不然页面上会有两个编辑器。
  预览那份有**同样的第二道**（`preview.destroy()` + 清 `previewHandleRef`）
- **依赖是 `[doc.id, mode]`，不含 `doc.text`**：`doc.text` 是**初始值**，不是要跟随的状态。
  跟随它是另一回事（那会变成"每 300ms 重挂一次编辑器"）。有一条
  `// eslint-disable-next-line react-hooks/exhaustive-deps` 把这个意图写在代码里
- **`settle` 只走所见即所得**（`mode === "wysiwyg" && settled !== doc.text`）。
  CodeMirror 不做规范化，源码模式下这一步没有意义。⚠️ 而且它**在 `focus()` 之后**——
  `focus()` 自己会派发一笔事务，要认领就认领最后一次事务之后的结果（BUG-12）
- **`createSourceEditor` 是同步的**（不像 `createEditor` 要 `await`）。它没有异步的
  装配过程，所以左边那个 `await` 的分支差异是这个原因，不是笔误
- `setTimeout` 的回调**在组件卸载后仍可能触发**（清理函数清了 timer，所以不会；
  但 `finally` 里没有 `disposed` 检查——真跑到的话 `onDocsChanged` 会对已卸载的组件
  `setState`，React 18+ 不报错，只是白做一次请求）
- **去抖只在 `onChange` 里**。`getMarkdown()` 那条路（存盘前的强制同步）**不去抖**，直接调

**渲染时的那个 `lastDocIdRef` 兜底**（写在渲染里、不是 effect 里）：

```ts
const lastDocIdRef = useRef(doc.id);
if (lastDocIdRef.current !== doc.id) { lastDocIdRef.current = doc.id; latestRef.current = doc.text; }
```

**真正管"换文档要换文本"的是 App 上那个 `key={doc.id}`**（整个组件重挂，连 `latestRef`
都是新的）。这几行是**兜底**：哪天有人把那个 key 去掉，症状会是"切到另一份文档、
里面是上一份的内容"，而且看起来像后端的锅。⚠️ 判断写在渲染里是为了**赶在上面那个
effect 之前**生效——放 effect 里就晚了。

**渲染**：

```jsx
<div className={`editor-pane editor-pane-${mode}`}>
  {!ready && <div className="editor-loading">正在准备编辑器…</div>}
  <div ref={mountRef} className="editor-mount"
       style={{ ["--content-width" as string]: `${contentWidth}px` }} />
  {mode === "split" && (
    <div ref={previewRef} className="editor-mount editor-preview" aria-readonly="true" />
  )}
</div>
```

⚠️ `style` 里那个 `["--content-width" as string]` 的写法是为了让 TS 接受自定义 CSS 变量
（`CSSProperties` 不认 `--` 开头的键）。挂载 div 上**不渲染任何 children**——
"React 永不往里渲染"这条纪律就体现在这里。
⚠️ 预览那块**不给 `--content-width`**：那一半本来就窄，再限宽会剩一条缝。
`aria-readonly` 是**如实告知**——它真的改不了。

⚠️ `EditorPane` 里**没有调用 `api.doc.setActive`**——切标签时后端不知道。
见 `docs/01-architecture.md` 的前端遗留项。

---

## `src/editor/source.ts`（742 行）

**源码模式**的编辑器：CodeMirror 6 的封装。对标 Typora 的 Source Code Mode。
⚠️ 它与 `editor/create.ts` 是**并列**的两条路，不是"谁包了谁"——两者只共用
`EditorCommand` 那个联合类型。

### 文件头的"为什么"要点

⚠️ **不是「不要模仿 VMark 的手感」的反例**。用户说的那句针对的是**对标对象 VMark**
（它的编辑手感很差），不是"不许用 CodeMirror"。选 CM 的理由是它是"能编辑文本 +
有语法高亮 + 撤销栈可控"里最省事的一个。

⚠️ **不用 `<textarea>`**，它给不了两样这里必须要的东西：
**语法高亮**（源码模式的全部价值就是"看清 Markdown 结构"）、以及
**撤销栈与文档模型的分离**（`<textarea>` 的撤销是浏览器按"整块替换"记的，
我们每次 `setMarkdown` 都会冲掉它）。

⚠️ **立场分工**：分屏里只有源码这一侧是权威，预览只读、从不回写。完整理由
（往返会改字、BUG-12）见 `docs/05-editor-bridge.md` §3.1。

### `export interface SourceHandle`

五个方法，**形状与 `EditorHandle` 对齐**，`EditorPane` 才能一个 `handleRef` 装两种实例：

| 方法 | 与 `EditorHandle` 的差别 |
|---|---|
| `getMarkdown()` | **同步**取值。⚠️ 存盘前那次强制同步靠它，不能是 Promise |
| `setMarkdown(md)` | ⚠️ **同样的文本不碰**——否则每次推预览都白冲一次撤销栈 |
| `focus()` | 同 |
| `runCommand(name)` | **返回 `boolean`**：认不出这条命令时返回 `false`（Milkdown 那边是 `void`，它没有这个信号） |
| `destroy()` | 同 |

### `export interface CreateSourceOptions`

```ts
{ root: HTMLElement; initialMarkdown: string; onChange?: (markdown: string) => void; readOnly?: boolean }
```

⚠️ `onChange` **不去抖**，与 `createEditor` 同口径：去抖是调用方的事。
`readOnly` 今天是**备而不用**的（分屏右侧那份预览仍是 Milkdown，因为预览要的是
"渲染结果"而不是"原文"）——留着它是因为"哪天预览改用 CM"是个合理的下一步。

### `notaHighlight` / `notaTheme`：**一个色值都不写死**

高亮与主题全部走已有变量（`--accent`、`--doc-fg`、`--doc-bg`、`--code-*`、
`--font-mono`、`--bg-active`……）。所以换文档主题、换界面明暗，源码模式都跟着变。
⚠️ **这里不新增任何一个颜色常量**——新增了就等于又开了一条会漂移的口径。
⚠️ 唯一的"灰色"用法是 `t.processingInstruction` / `t.contentSeparator` 走
`var(--fg-faint)`。

### 命令：`applyCommand()` 覆盖**全部 19 个** `EditorCommand`

全是**文本操作**：加粗 = 选区两侧插 `**`；引用 = 每行加 `> `；表格 = 插一张空表
（`| 列 1 | 列 2 |\n| --- | --- |\n| $0 |  |`，`$0` 是光标落点标记）……

⚠️ **"做全"是设计决定，不是顺手多做**。只要有一个模式不支持某条命令，就得维护一份
"哪个模式支持哪些命令"的清单，而那种表必然在下次加命令时忘掉一半——做全了，
那张表就不需要存在。认不出的字符串返回 `false`（`switch` 的 default 分支）。

三个内部小工具（都不导出）：

| 工具 | 干什么 |
|---|---|
| `selectedLines()` | 取选区覆盖的行区间。⚠️ 有一堆"选区在行中间/空文档"的边界，收在一处 |
| `setLinePrefix(view, family, prefix \| null)` | 按行加/去前缀，家族表是 `LINE_PREFIXES`（`heading` / `quote` / `bullet` / `ordered`，各自一条正则） |
| `wrapSelection(view, before, after, placeholder)` · `insertBlock(view, text)` | 行内包裹 / 插入一段块（`$0` 标光标位置） |

⚠️ **两处刻意的不对称**（别当 bug 修）：

- **加前缀跳过空行，清前缀不跳**。给含空行的选区加 `> ` 会让空行变成 `> `——
  "看起来什么都没变、存盘却多了一堆 `> `"比少做一点更难解释；清的时候必须连空行
  一起扫，否则残留下半截。
- **`setMarkdown` 文本相同时直接返回**。否则每次推预览都会派一笔事务、把撤销栈冲掉。

---

## `src/ui/Sidebar.tsx`（420 行）

左侧栏：**文件树 / 大纲** 两页。对标 Typora 的侧栏（它的快捷键是 Ctrl+Shift+1/2/3
切文件树/文档列表/大纲）。"文档列表"（最近打开的文档）排在后面。

⚠️ **原本这里是三页，第三页「插件」2026-09-22 搬到了右边**（`ui/PluginDock.tsx`）——
这一栏只管**文档导航**，工具面板不跟它挤。所以 `Tab` 也从三个值收成两个。

### 2026-09-24 这一轮的三件事

用户原话是两笔：「**侧边栏的标题应当可以折叠**」和「**那个侧边栏不能通过一个叉关掉**」。
两句话在这一栏里落了**三处**：

| 补的什么 | 在哪儿 | 折/关的是 |
|---|---|---|
| 折**目录** | 文件页 | 那一层子节点（按需向后端要，见下） |
| 折**标题** | 大纲页 | 它下面那些更深的标题（H1–H6 是扁平的，父子靠"下一个更深"推） |
| 右上角那颗 **×** | `.sidebar-head` 里 | 整条栏（`App.sidebarOpen`） |

⚠️ **两处的折叠状态都住在本地 `useState` 里，不进 `Settings`。** 它是"这一眼怎么看"，
不是"这个应用怎么配"；写进设置就要跟着落盘、跟着同步，而"上次折了哪几个标题"
几乎没有价值。

⚠️ **× 只是同一个开关的第二个入口，不是第二份状态。** 开合状态住在 `App.tsx` 的
`sidebarOpen`，菜单项 / `Ctrl+Shift+L` / 这颗 × 三条路调同一个 setter；在这里自己
`useState` 一份的症状是"用 × 关掉、菜单里那一项还勾着"。
它的值照抄右侧 `PluginDock` 的 `.dock-close`（同族的面板一颗有叉一颗没有，本身
就是个说不通的地方）。⚠️ 关掉之后**不留"怎么再打开"的提示**：菜单里那一项带着勾、
写着快捷键，它才是权威入口。

⚠️ **× 在 `role="tablist"` 外面**：tablist 的子元素按规矩只能是 tab，塞进去
读屏会把"关闭"念成一个页签。所以外面套了一条 `.sidebar-head`（`styles/sidebar.css`）。

### `export type SidebarTab = "tree" | "outline";`（**导出了**，`App.tsx` 要用）

### `export function Sidebar({ workspace, tree, docText, strict, tab, onTab, onOpenFile, loadDir, onClose, onOpenFolder }: Props)`

props：

| prop | 类型 | 用途 |
|---|---|---|
| `workspace` | `string \| null` | `null` → 文件树页显示空态（一句话 + 一颗「打开文件夹…」按钮） |
| `tree` | `TreeNode[]` | 打开工作区那一次的**一层**快照 |
| `docText` | `string` | 当前文档正文，用来抽大纲 |
| `strict` | `boolean` | `Settings.strict_markdown`。大纲是**从正文猜**的，`#你好` 算不算标题取决于它——不传就会"侧栏和正文各说各的" |
| `tab` | `SidebarTab` | 当前是哪一页。**由 App 持有** |
| `onTab` | `(t: SidebarTab) => void` | 切页 |
| `onOpenFile` | `(path: string) => void` | 接的是 `App.openPath`，传的是**绝对路径** |
| `loadDir` | `(path: string) => Promise<TreeNode[]>` | 展开子目录时按需取那一层 |
| `onClose` | `() => void` | 收起这一栏。**只收不切**（点 × 却把它点开，那种手感没人受得了） |
| `onOpenFolder` | `() => void` | 空态那颗按钮，接的是 `App.openFolder`——**和「文件 → 打开文件夹…」同一个回调**，不是另开一条通路 |

⚠️ **`plugins` 这个 prop 2026-09-22 拿掉了**——插件那一页搬去了右边的 `PluginDock`。

内部只有 `const outline = useMemo(() => extractOutline(docText, strict), [docText, strict])`。

渲染结构：`<aside className="sidebar">` → `div.sidebar-head`（一个 `role="tablist"` 的
nav + 两个 `TabButton` + 那颗 ×）+ `<div className="sidebar-body">`（按 `tab` 二选一）。

⚠️ **`tab` 2026-09-23 从组件内 `useState` 改成受控**。理由是「视图 → 大纲 / 文件树」
那两个菜单项要能切它，而**菜单栏在 `App.tsx` 里，够不着这里的局部状态**。
改受控之后 Ctrl+Shift+1（大纲）/ Ctrl+Shift+3（文件树）才有落点——⚠️ 那两条快捷键
此前是**死代码**，成因是 `e.key` 与 `e.code` 混用（见 `docs/07` §4 2026-09-23 那条）。

### 私有子组件

| 组件 | props | 行为 |
|---|---|---|
| `TabButton` | `{id, current, onSelect, label}` | `role="tab"` 的 button，`aria-selected` 与 `className` 按 `current === id` 定 |
| `Outline` | `{items: OutlineItem[]}` | 大纲整页（见下）。空时显示"这份文档还没有标题。" |
| `FileTree` | `{nodes, workspace, onOpenFile, loadDir}` | 空时显示"这个文件夹里没有 Markdown 文件。"，否则 `<ul className="tree">` + 每项一个 `TreeRow` |
| `TreeRow` | `{node, workspace, depth, open, kids, errors, onToggleDir, onOpenFile}` | 递归，见下 |

**`Outline`** —— 折的是**标题**：

- 折哪个标题用**行号**（`OutlineItem.line`）记。⚠️ 不用数组下标：正文一改索引会整体
  平移，"我明明折的是'三'，它把'四'折了"。行号只在**上面插了几行**时才失效。
- 一行看不看得见，要往上找**整条祖先链**（外层的折着、内层也被折过，展开外层就会
  连带把内层那棵也露出来）——只检查"最近的那一个祖先"是不够的。
- 有子标题的才画 `outline-twisty`（`aria-expanded`）；叶子留一个**同宽的空占位**
  （不留的话叶子与父标题的文字起点差 14px，扫一列标题时像缩进乱了）。
- 折起来时后面挂一个 `outline-folded-count`（那一节有多少个子标题）。
- ⚠️ 那颗标题**还不可点**（点了不跳转）——见 `docs/07` 第 48 项，`docs/04` §2.2 有标记。

**`FileTree` / `TreeRow`** —— 折的是**目录**：

- `kids`（相对路径 → 那一层节点）/ `open` / `errors` 三份本地 state。
  ⚠️ 取回来的子目录**不回写 App 那棵树**：`tree` 是"打开工作区那一次快照"，
  要合并就得在 App 里养一棵可变的树，而展开状态本来就是这一栏自己的事。
- ⚠️ **先展开再取**：目录是空的还是"正在取"在界面上没有区别，而等回来再展开会让
  点击有一拍延迟（本地目录看不出来，网络盘看得出来）。
- ⚠️ 读不了就**如实写在那一行下面**（`tree-error`），不要静默成"这个目录是空的"——
  那会让"权限不够"看起来像"文件夹里没东西"。
- **目录**画 `<button className="tree-dir-btn">`（三角 `tree-twisty` + 名字，
  `aria-expanded`），展开时递归渲染一层 `<ul className="tree">`；
  **文件**画 `<button className="tree-file-btn">`。
- ⚠️ 绝对路径**只拼一次、只在一处**（`FileTree.openFile` = `${workspace}/${rel}`）。
  早先是每个行组件自己拼，于是"谁拼路径"散在渲染树里，展开子目录时很容易漏掉——
  子节点存的也是**相对工作区**的路径，不是相对父目录。前端不用 `path.join`、
  也不做规范化，靠后端保证的 `/` 分隔相对路径；这是"两份路径规则"的地方
  （后端 `Path::join`，前端字符串相加）。

---

## `src/ui/PluginDock.tsx`（358 行）

**右侧插件栏**。用户 2026-09-22 定的：「插件的话我的想法是右侧边栏。」

文件头记的是**为什么分左右**：左边那条是**文档导航**（文件树、大纲），写东西时一直在用，
得贴着正文；插件是**工具面**（Git 的暂存区、AI 的对话框），是"看着正文顺便操作"的东西。
两者的**使用节奏不同**，挤在一列里就要来回切页。

⚠️ **在那一栏里面，一个插件独占一页**（2026-09-24 用户要求：「每一个拓展应该独占一个
窗口……两个拓展面板不能同时打开」）。改之前是**叠着画**（两块内容共用一个滚动条），
而**面板会自己长高**（AI 那页一轮问答就是好几屏）——叠起来的结果是两条内容互相
把对方挤没，用户想看的那个常常在屏幕外。**那不是"样式没调好"，是共用滚动条本身错。**
代价写在文件头：**看不到的那一页不刷新**（只拉当前页），切过去时现拉一次。

### `export function PluginDock({ plugins, panels, onClose }: Props)`

| prop | 类型 | 用途 |
|---|---|---|
| `plugins` | `PluginInfo[]` | 「已装插件」那一组的内容 |
| `panels` | `PluginPanel[]` | 插件**声明**的面板，`App.tsx` 启动时拉一次 |
| `onClose` | `() => void` | 接的是 `App.setDockOpen(false)` |
| `onCall` | `(plugin, command, args?) => Promise<void>` | 跑一条插件命令。错误由 `App.tsx` 那边 toast，**这一栏不管** |
| `askPrompt` | `(req: PromptRequest) => Promise<…\|null>` | 「点之前先问一句」的入口（面板按钮的 `prompt` 走它） |

渲染结构：`<aside className="plugin-dock">` → `nav.dock-head`（**活动页的标题** + `×`）
+ `nav.dock-tabs`（**一页签一个插件**，外加最右那个「插件」页签）
+ `div.dock-body`，里面**一次只画一页**：

| 页 | 选择器 | 内容 |
|---|---|---|
| 某个插件 | `section.dock-panels` → `article.panel`（`key` = `插件/面板 id`） | 那个面板的 `<PanelBody>`。`key` 用坐标是为了**换页时整棵子树换掉**——否则 `input` 块里的草稿会跟着页签跑到另一页去 |
| 「插件」 | `section.dock-orphans` + `h4.dock-subtitle` + `ul.plugins` | 「没有落脚处」的面板（`location` 不是 `right`，逐条标出它声明的位置）＋ 已装插件清单（名称/版本/能力/报错） |

⚠️ **页签永远都在**（哪怕只有一个面板）——它是"这里还有别的东西"的唯一线索，
藏起来的话用户会以为这一栏就叫这个名字。
⚠️ **自动选页的规矩**：面板清单是启动时异步拉的（第一次渲染时还是空的），
清单到了补选第一页，**除非用户自己点过页签**（他点了「插件」页就该留在那儿）；
当前页那个面板消失（插件被卸）也一样落到第一页。**页签不做持久化**，重开回第一页。

📌 **更正（2026-09-24）**：面板体里曾经是「面板内容尚未接入。」这一行字——
当时面板**内容**机制还没有（要等 `docs/07` 第 15 项）。现在那行字**已经换成了
真正的 `<PanelBody>`**（本轮）。那条"**做一个看着能用、点下去没反应的假面板，
比空着更糟**"的判断依然成立，只是现在不再是那个场合了。

### 本文件**自己有状态**（与 `TopBar` / `TabBar` 那条"纯展示"的印象不同）

`plugins` / `panels` 是受控的，但**内容**不是：`PluginDock` 自己拿着
`useState<Record<string, 面板状态>>`，每个面板一份，三态 `loading` / `ok` / `error`。
⚠️ **`loading` 只在第一次出现**——重拉时**保留旧内容**，否则每按一次「刷新」
面板就闪一下白。

⚠️ **还有一个 `序号` ref**（每个面板一个请求序号），**这不是过度设计**：
`nota.ui.refresh` 是会连着来的（提交完先刷状态、插件自己再刷一次），两个请求同时在飞时
**先发的后回来**就会把新内容盖成旧的——症状是"提交完列表还是旧的，再点一次刷新才对"，
**而且它只在慢的时候出现**。所以每次设状态前先对一下序号，过期的那次直接丢弃。

⚠️ 两个 effect 的依赖都是**拼出来的字符串** `键串`，不是 `右侧的` 那个数组：
数组每次渲染都是新身份，拿它当依赖会让 effect **每渲染一次都重拉一遍所有面板**。
（这两处都挂了 `eslint-disable exhaustive-deps`，别当成可以随手删的噪声。）

⚠️ **两个 effect 都只认活动页**：切页时拉当前页；`nota:plugin-panel` 到了先看
"是不是活动面板那一家的"，不是就丢。**没显示的那几页连 `render` 都不跑**——
这是那一栏"一次只画一页"的直接后果，不是漏写。

### 面板上按钮的 `busy`

`跑()` 先把这个面板标成 `busy: command`（那颗按钮因此灰着），跑完**在 `finally` 里**
重拉一次。⚠️ **`finally` 而不是"成功才刷"**：命令失败时那句错误提示常常也要改面板
（比如 git 报错后分支行要变），而且**卡在 busy 上会让所有按钮永远灰着**——
那个状态只能靠重开面板才能解开。

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

## `src/ui/PanelBody.tsx`（275 行）

一串 `PanelNode` → 一串 DOM。**面板内容的渲染层。**

### ⚠️ 这里没有一条路能把字符串变成 HTML

每一块都是**具名 JSX**：文本走 `{text}`（React 自己转义），属性只有 `className` /
`title` / `disabled` 这类**我们自己写的字面量**。插件给的字符串**只**出现在子节点位置。

⚠️ 所以"插件往面板里塞一段 `<script>`"这件事**在结构上做不到**，
而不是"我们在某处过滤了它"。真发生过的教训（Folio 那边的 `use-markup` 默认开）
说明：靠"记得转义"是不行的，**得让"忘了转义"这件事没有落点**。
⚠️ 这里**没有**（也永远不该有）`dangerouslySetInnerHTML`。

### 两条"别静默"的规矩

| 场合 | 怎么办 |
|---|---|
| `kind` 认不出 | 画一句「不认识这种内容块（kind = …）」**给插件作者看**。静默丢掉的话，他看到的是"我的面板少了一块"，然后去怀疑是宿主没实现还是自己拼错了字段名，而界面上一点线索都没有 |
| 按钮没写 `command` | **画成灰的**，不消失。它摆在那儿本身就是给插件作者看的信号（"我这里少写了一根线"），`title` 里写着原因 |

### 两个细节

- ⚠️ **`key` 用下标是对的**：这一串**没有任何身份**——插件每次渲染给的都是
  一份全新的列表（`render` 每次重跑）。用内容当 key 反而会在两行文字恰好相同时撞车，
  而用下标最坏也只是重挂一次 DOM。**别看到"index as key"就当坏味道改掉。**
- `busy !== null` 时**所有**按钮一起灰（防连点）；`b.label || b.command`——
  只写了命令名没写标签时，拿命令名顶上。

### 2026-09-24 多出来的三种块（`message` / `diff` / `input`）

| `kind` | 画成 | 关键细节 |
|---|---|---|
| `message` | 一条一问一答 | `from = "user"` 靠左、`"ai"` 靠右（**认不出的 `from` 当 `ai`**）；文本 `white-space: pre-wrap` + `overflow-wrap: anywhere`（长词硬折行） |
| `diff` | 一块增删对照 | `op = "del"` 红底 `-`、`"add"` 绿底 `+`（**其它 `op` 当 `add`**）。是 `<pre>`：行首空格**保留**；每行用**悬挂缩进**（`text-indent: -12px`）让折行后的第二行对齐到内容、不顶到 `-` 号 |
| `input` | 输入框 ＋ 发送键 | ⚠️ `arg` / `submit` **缺一个整块就不画**（跟 `prompt` 同一条规矩：问了也送不出去）。`multiline` → `textarea`（回车换行、**Ctrl/Cmd+Enter 发送**），否则单行（回车发送）。**发出去＝调 `submit` 命令、参数 `{ [arg] = 输入 }`**——跟按钮零区别 |

⚠️ **`input` 的草稿是在结果回来之前清掉的**（`set草稿("")` 在 `void onSubmit(值)`
之前）。看上去反直觉，理由是：那条输入**马上会变成插件的一条消息**，而插件
`nota.ui.refresh` 之后整块面板会重拉、这块输入框会重新挂载。等着结果回来再清的话，
用户看到的是"我按了发送，字还在框里，是不是没发出去"。
⚠️ 代价如实说：**重拉时正在敲的草稿会没**（面板是"每次拉都是新的"的，见下）。

`prompt` 那一步（以及"取消就什么都不做"这条规矩）**不在这里**，
在 `ui/plugin-prompt.ts`，与插件菜单项那条路共用同一份实现。

---

## `src/ui/panel-nodes.ts`（271 行）

**面板内容的形状判据**：宿主发来的那一坨 JSON 在这里被收成 `PanelNode[]`。

### ⚠️ 为什么校验在这一层，不在宿主

宿主（`lua/api/ui.rs::面板内容`）保证两件事：**是 JSON**、**有大小上限**。
它**不校验形状**，也不知道 `kind` 有哪些取值。这么分是刻意的：
**形状的真相源只能在渲染这一侧**——最终决定"这个 `kind` 画成什么"的代码就在这儿。
宿主也存一份枚举的话，两边就是又一对"改一处忘一处"，而症状是
**内容静默地不显示**（认不出的 kind 被宿主扔掉），比在这儿看得见地画一句
"不认识这种内容块"难查得多。

### 三条规矩

1. **认不出的 `kind` 如实显示**（`{kind: "unknown", raw}`），不静默丢掉，更不猜它是哪种
2. **字段类型不对就用默认值**（`text` 是数字 → 空串）。⚠️ 缺一个字段让整块消失是
   **最糟**的处理：用户看到的界面和插件作者以为的对不上
3. **只产出这里定义的字段**——插件塞的别的键一概**不往 DOM 上带**。这条是"不许注入"的落点

⚠️ 不认识的**顶层项**（不是表的）**丢掉**——它连 `kind` 都没有，没有任何可说的。
这一条与上面第 1 条**不矛盾**：有 `kind` 才有话可说。

### 十种 `kind` 与它们的字段

| `kind` | 字段 | 备注 |
|---|---|---|
| `heading` | `text` | |
| `text` | `text`, `tone` | |
| `fields` | `items[{label, value, tone}]` | 画成 `<dl>` |
| `list` | `items[{title, subtitle, badge, tone}]` | |
| `buttons` | `items[{label, command, args, prompt, style, disabled}]` | ⚠️ `args` **原样带着**：形状由插件和它自己的命令约定，宿主和这里都不解析 |
| `empty` | `text` | |
| `separator` | — | |
| `message` | `text`, `from` | 2026-09-24。⚠️ `from` 只认 `user` / `ai`，**认不出的当 `ai`**；文本上限走**另一个**更宽的数（`消息上限 = 20000`） |
| `diff` | `items[{op, text}]` | 2026-09-24。⚠️ `op` 只认 `del` / `add`，**其它当 `add`**。它**只是一块显示**——不认识 `nota-diff` 那份格式 |
| `input` | `arg`, `submit`, `submit_label`, `placeholder`, `hint`, `multiline` | 2026-09-24。⚠️ 与 `提示()` 不同：**缺 `arg` / `submit` 时块还在**（画一个禁用的框），因为"我这里少写了一根线"要比"整块消失"好查 |
| `unknown` | `raw` | 认不出的 |

**`tone`** = `normal` / `muted` / `success` / `warn` / `danger`，
⚠️ **外加三个别名**：`info` → `normal`、`error` → `danger`、`warning` → `warn`。
收别名是因为宿主的通知层级用的是 `info`/`error`/`warning`（`ui.rs::normalise_level`），
插件作者很容易顺手抄过来——**一个 `tone = "info"` 变成静默的 `normal` 是没人查得出来的**。

**`style`** 只认 `primary` / `danger`，其余一律 `normal`。
**`disabled`** 只认严格的 `true`。

⚠️ 本文件还各设了一道 `每块上限` = 200 与 `文本上限` = **20000**——
**和宿主的 `面板节点上限` / `面板文本上限` 同量级，但各自把关**：
宿主那道防的是"插件写坏"，这一道防的是"数据被动过"。

---

## `src/ui/pluginMenus.ts`（104 行）

**插件菜单 → 菜单栏里那一栏「插件」。**

### 为什么是**合成**一栏，不是往已有的几栏里插

`register_menu` 收一个 `menu` 字段（`file` / `format` / `plugins`…），
但**目前只有 `plugins` 是认的**。往「文件」里插两条第三方条目这件事，一旦做出来，
用户就分不清哪些项是 Nota 自己的、哪些是插件塞进来的——出问题时连"该去找谁"都不知道。
单独一栏把这件事摆明了。

⚠️ 写别的 `menu` 值的条目**不静默丢掉**：照样出现在这一栏里，标签后面写明
「（想挂到「X」栏，暂不支持）」，而且是**灰的**——判据是"`App.tsx` 的 `menuHandlers`
里有没有它的 id"（没有就灰）。静默丢掉的话，插件作者看到的是"我注册的菜单项不见了"，
而界面上没有任何线索。

### id 是**合成**的，走 `resolvePick` 那条老路

| 前缀 | 用在哪 |
|---|---|
| `__plugin:` | 认得的（`menu === "plugins"`），`__plugin:<插件 id>:<命令名>` |
| `__plugin-unplaced:` | 无处安放的：`__plugin-unplaced:<插件>:<menu>:<命令>` |

⚠️ 两个前缀**故意不一样**：同一个插件的同一条命令，若同时以两种 `menu` 值声明
（合法的——去重看的是标签），用同一个 id 就是 React 的重复 key，
也是 `disabledCommands` 那张集合里两条打架。加上这一截就永远不会撞。

⚠️ 认得的那些看着**像个命令 id，这也正是要点**：点下去之后走的是既有的那条链
（`resolvePick` → `menuHandlers[id]`），**没有为插件单开一条分支**。
少一条分支就少一处"插件项和普通项行为不一样"。

⚠️ 插件 id 里不会有 `:`（清单校验的允许集合是字母数字和 `.` `-` `_`），
所以"第一个冒号"就是插件 id 的结尾。但**这里不需要拆回来**——处理函数是闭包，
它自己知道是哪个插件。

### 两个导出

| 函数 | 行为 |
|---|---|
| `插件菜单栏(items)` | 合成那一栏。**一条插件菜单都没有时返回 `null`**——那时不该出现一栏空的「插件」。一条都没有"无处安放的"时**不摆分隔线**（一栏里只有一条分隔线看着像坏了） |
| `带插件栏(menus, items)` | 插在**「帮助」前面**——最后那一栏是"关于这个应用"，按惯例待在末尾。找不到「帮助」（`commands.ts` 里改了 id）就接在最后，**不静默丢掉**：一栏菜单凭空消失比位置不对难查得多 |

⚠️ 调用方**必须**把它包在 `useMemo` 里：返回值每次都是新数组，而它下游牵着三条
`useMemo`／`useEffect`（`ui/useMenus.ts` 顶上那张表），其中最后一条会
**每渲染重推一次原生菜单**（一次 IPC ＋ 一次重建）。这件事在
`usePlugins.ts::menus` 那里做的。

---

## `src/ui/plugin-prompt.ts`（71 行）

**「点了之后先问一句」的那一步。插件面板的按钮和插件的菜单项共用它。**

### 为什么值得单独一个文件

两条路都要做同一件事：拿插件声明的 `prompt` 去弹宿主的输入框，把用户填的值塞进 `args`。
这件事里有一条**容易写错、错了还不报错**的规矩——**用户取消时什么都别做**，
绝不能退化成"把空串当参数发出去"（git 会收到一条空提交信息；AI 那边会拿空串当提问发到网上）。

规矩写两遍就会漂：一边改了、另一边没改。所以收在这里一处，两条路都调它。
（与 `commands.ts::resolvePick`、`commands.ts::themeEntries` 处理同一类问题的办法一样：
**判据只有一处**。）

### `问参数(o)` 的返回形状

```ts
async function 问参数(o: 问参数入参): Promise<{ args: unknown } | null>
```

| 返回 | 意思 |
|---|---|
| `{ args }` | 可以发了 |
| `null` | **用户取消了，调用方什么都别做** |

⚠️ 包一层对象而不是直接返回 `args`：`args` 本身可以是 `undefined`
（"这条命令没有参数"是合法的），**不包的话"取消"和"没有参数"就分不开**。

⚠️ `prompt` 是 `null` 时**直接原样返回 `args`**，不弹框。

### 面板**没有自己的输入控件**

面板的内容是一份"只读的 JSON"（见 `ui/panel-nodes.ts`），里面没有任何控件状态。
要输入就借宿主的 `PromptDialog`（和「格式 → 超链接」用的是同一个），
于是"面板里能不能输入"这件事**不引入第二套实现**。

⚠️ 用户填的值与插件自己写的 `args` **合并，同名时用户填的赢**——他就是来改这个键的。
⚠️ `args` 不是对象（数组、字符串、`undefined`）时**当没有**，不硬往里塞：
那样得到的 `args` 形状是插件没约好的。

⚠️ 对话框标题默认取 `prompt.label`；按钮那一路传按钮上的字（「提交…」），
于是框里是"标题＝提交…、字段＝提交信息"；菜单那一路没有"按钮上的字"可传，
标题和字段就是同一句。

---

## `src/ui/usePlugins.ts`（143 行）

**插件在界面上的那一整块**：已装清单、声明的面板、声明的菜单项，
以及"跑一条插件命令"这件事本身。（2026-09-24 从 `App.tsx` 搬出，理由同
`useMenus.ts` / `useDialogs.ts` 那两次：这一块**和外壳骨架无关**。）

### ⚠️ 三条都靠**拉**，不是靠事件（BUG-13）

`list` / `panels` / `menus` 都是**状态**：注册发生在插件加载时（`setup()`），
早于前端挂载，等事件必漏且漏得安静。范式是**声明是状态 → 拉；发生是事件 → 推**。

⚠️ 面板的**内容**是个例外中的例外（它有"变了"的事件），但那件事由
`PluginDock.tsx` 自己管——**这一层只负责清单**。

⚠️ 三样**一起拉**（`Promise.all`）——它们回答的是同一个问题（"现在装了什么"），
分开三次只会让"读了插件清单但菜单还没到"这种中间态多出几种。
⚠️ 失败时**不该拦住别的**（设置、工作区、主题照常），但也**不能不响**：
界面上少了一整栏，用户得知道是为什么 ⇒ 一条 toast。

### 返回值

| 字段 | 用途 |
|---|---|
| `plugins` / `panels` | 交给 `Home` 与 `PluginDock` |
| `menus` | `MENUS` ＋ 插件那一栏。⚠️ 身份**稳定**（`useMemo`），下游牵着"每渲染重推一次原生菜单"那条 effect |
| `handlers` | 插件菜单项 → 实现，键是合成的 id。**直接并进 `App.tsx` 的 `menuHandlers`**，于是"灰不灰"的判据对插件项和普通项是**同一条** |
| `调` | 跑一条插件命令 |

⚠️ `handlers` **只给"认得的那一栏"建处理函数**——`menu` 写了别的值的条目没有实现，
于是按同一条判据自动变灰。这与 `ui/pluginMenus.ts` 里"照样摆出来"**必须一致**：
那儿摆出条目、这儿不接，缺一边就变成"看着能点、点了没反应"。

⚠️ `调` **把错误说给用户听，不再往外抛**：调用方（`PanelBody` 的 `void 点按钮(b)`、
菜单的 `() => void 调(...)`）都是"点了就跑"的场合，往外抛就是一个**没人接的 Promise**，
症状是控制台一行红字、**界面上什么都没有**。toast 里带插件 id 与命令名——
插件多了之后"哪一条没跑成"正是用户要看的。

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

## `src/ui/StatusBar.tsx`（86 行）

状态栏。对标 Typora 底栏：左侧文件信息，右侧字数统计。

### `export function StatusBar({ doc, mode, strict }: Props)`

`const counts = useMemo(() => countText(doc?.text ?? ""), [doc?.text])`。

| prop | 类型 | 用途 |
|---|---|---|
| `doc` | `Document \| null` | `null` → 只渲染一行"就绪" |
| `mode` | `ViewMode` | 当前编辑模式。名字从 `ui/view-modes.ts` 取（`VIEW_MODE_LABELS[mode].short`） |
| `strict` | `boolean` | `Settings.strict_markdown`。**开着才显示**那个「严格」小标 |

⚠️ **右侧末尾这两个小标是 2026-09-24 补的，而且是"只读的手电筒，不是开关"**——
点不动，作用是把"现在是哪个模式、严格开没开"从菜单里搬到看得见的地方。
两条规矩：**模式恒显**（它是"你现在在哪"，藏起来就会出现"我打的东西怎么不渲染"），
**严格只在开时显**（它是个少数派状态，恒显一个"不严格"是噪音）。

⚠️ 模式那两个字是 `short`、菜单与设置里是 `full`（`源码` / `源码模式`），
**两列出自同一份 `VIEW_MODE_LABELS`**——原来是两处各硬写一遍，迟早会对不上。

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

## `src/ui/Toasts.tsx`（42 行）

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

## `src/ui/settings/`（四个文件）

**偏好设置。这是界面那两条轴唯一的切换入口**（轴三在菜单栏「主题」里，见 `MenuBar.tsx`）。

| 文件 | 管什么 |
|---|---|
| `SettingsDialog.tsx` | 壳：遮罩 + 左栏（搜索 / 五节 / 「完成」）+ 右栏 + `Esc` 与点遮罩关闭 |
| `primitives.tsx` | 行、组、四个控件、搜索上下文、四枚图标 |
| `panes.tsx` | 外观 / 文档主题 / 编辑器 / Markdown 四节的内容（快捷键那节在隔壁文件） |
| `ShortcutsPane.tsx` | 快捷键一览（只读） |

### 版式：照 VMark 的偏好面板抄

用户 2026-09-23 的要求：「你将那个偏好列表搞得和 Vmark 一样的布局」。
参考源码在旁边 `../vmark-ref/src/pages/settings/`（ISC，见 `docs/10` §11.4）。
**抄的是结构**——左栏分节清单 + 右栏「左标签右控件」的行，不是像素：

```text
┌──────────────┬────────────────────────────────────┐
│ [搜索设置…]  │  主题                              │
│ ▸ 外观       │  界面风格            [下拉 ▾]      │
│   文档主题   │  明暗               [浅][深]       │
│   编辑器     │  跟随系统偏好          ( ●—)       │
│   快捷键     │                                    │
│ [ 完成 ]     │  界面              ──●────  15px    │
└──────────────┴────────────────────────────────────┘
```

| 节 | 行 | 落进哪个设置 |
|---|---|---|
| **外观** | 界面风格（下拉，`STYLES` 表，选中的那套带一句中文说明） | `ui_style`。⚠️ 与 `settings.rs` 的 `UiStyle` **一一对应** |
| | 明暗（两张**缩略图**：浅色 / 深色） | `ui_mode` |
| | 跟随系统偏好（开关） | `ui_mode = "auto"` |
| | 界面字号（滑杆 12–20px + 读数） | `ui_font_size`。⚠️ **文档字号不在这里**，那是文档主题的事 |
| **文档主题** | 当前主题（只读）、打开主题文件夹… | ⚠️ **换主题不在这里**，见下 |
| **编辑器** | 编辑模式（下拉） | `view_mode`。和「视图」菜单那三条是同一个开关 |
| | 正文宽度（滑杆 480–1200px） | `content_width` |
| | 自动保存（下拉：关闭 / 30 秒 / 1 分钟 / 5 分钟） | `autosave_seconds`。⚠️ 值是**秒** |
| | 关闭前先问我（开关） | `confirm_unsaved` |
| **快捷键** | 只读一览，按菜单分组 | — |

### ⚠️ 明暗那两张缩略图是**真 token**，不是画上去的颜色

每张缩略图自带 `data-ui-style` / `data-ui-mode` 两个属性，而 `theme.css` 里那两段是
**裸属性选择器**，于是它取到的是**真正的那一套变量**（连该风格的识别色都对）。
写死色值的话，换风格时缩略图就成了唯一没跟着变的地方——而那正是用户拿来做判断的东西。
判据来自 `applyTheme.ts` 新导出的 `resolveAppearance()`，**和真实外观同一套**
（自己再写一遍 `matchMedia` 的话，「跟随系统」那一格会和真实外观不一致）。

### ⚠️ 搜索是就地过滤，不是另建索引

查询非空时**五节全部叠着渲染**，每一行自己拿标签+说明去比，比不中的**返回 `null` 不进 DOM**；
某一组一行都没留下时，CSS 的 `.stg-group:not(:has(.stg-row))` 把整组也收掉。
索引方案（另写一份"查什么 → 在哪一节"的表）看着更"正经"，但那是**第二份真相源**：
加了控件忘了加索引，症状是"搜得到但点不过去"——不报错的那种。

⚠️ 代价：`SettingRow` **必须**包在 `QueryProvider` 里（`SettingsDialog.tsx` 负责）。
漏了不炸，只会让搜索框失灵。

⚠️ 一行能"被比"的字有**三档**：`label`、`description`（两样都画出来）、
以及 `searchText`——**只参与过滤、不画**。最后一档是给"每行挂一遍会变成噪音、
可用户真会搜"的字准备的：快捷键那一节的**菜单名**（组标题已经写着「文件」了）
和**原始 accel** 都在这一档。搜的是 `Ctrl+S` 那种原始写法而不是屏幕上那串——
macOS 上显示成 `⌘S`，照屏幕抄反而搜不到。

### ⚠️ 搜索框那颗「×」是自己画的

`<input type="search">` 在 WebKitGTK 下**自带**一颗清除按钮，但它**点了不派发
`input` 事件**——它会抹掉输入框的 DOM 值、也会让输入框失焦，而 React 那边的
`value` 一尘不染，下一次渲染又把旧字写回去。实测（Xvfb，2026-09-23）：点它 →
蓝框消失、字还在。所以 CSS 里把原生那颗 `display: none` 掉，
`SearchField` 自己画一颗并显式 `onChange("")`。
⚠️ 别改成 `appearance: none`——那是 Blink 的写法，WebKit 下**不生效**
（两种都试过，`display: none` 才管用）。

### ⚠️ `htmlFor` 只给可标注的控件

`SettingRow` 会把 `id` 塞给子控件，标签用 `<label htmlFor>` 指过去——**但只在那是个
可标注控件时**。指向 `<button>` 是两重错：`htmlFor` 悬空，而且**点标签文字会真的
触发那个动作**（「打开主题文件夹」这种一次性按钮上属于纯粹的惊吓）。
所以只有 `Toggle` / `Select` / `Range` 和 `input`/`select`/`textarea` 走 `<label>`，
其余（`<kbd>`、包一小组按钮的 `<div>`、按钮）退化成 `<span>` + `aria-labelledby`。

### 改了立刻生效，**没有「确定」也没有「取消」**

外观这种东西必须边看边调——弹一个框、点确定、发现不对、再弹一次，那是让人放弃调整的做法。
所以每次改动都直接落进 `App.tsx` 的 `updateSettings`（**先改内存再写盘**），
这个框只是个"面板"。唯一的按钮是「完成」，作用等于关掉。

⚠️ **不要**给它加「取消」。既然改动是即时生效的，一个「取消」要么是撒谎
（撤销不了已经写盘的东西），要么就得再做一套"暂存-回滚"，为了一行没有价值的按钮不值得。

⚠️ **文档主题那一栏故意只读**。放个下拉在这儿，它和菜单栏「主题」就变成**两个真相源**——
两边都能改同一份状态，用户在哪儿改的、为什么另一个地方没跟着变，都会变成查不动的问题。
所以这里只回答"现在是哪套"和"去哪儿换"。

### 关掉的三种方式

`Esc`（⚠️ `keydown` 用**捕获**阶段，`addEventListener(..., true)`）、点遮罩、点「完成」。
点遮罩用的是 **`mousedown` 不是 `click`**——与 `MenuBar` / `ConfirmDialog` 同源：
`click` 要等鼠标抬起，中间那段时间弹层还开着，看起来像"点了一下没关掉"。

⚠️ 面板自己要 `stopPropagation`，否则点框内部也会被遮罩那层收走。

### 快捷键那一节是**读出来的**

条目来自 `MENUS`（`walkMenuItems` 走**深度优先**，所以子菜单里的 `Ctrl+Shift+C`
一条都不会漏），键位过一遍 `formatAccel`——macOS 上显示 `⌘⇧C` 而不是 `Ctrl+Shift+C`。
抄一份静态表短期更省事，但那是第二份真相源：`commands.ts` 里改了键位这里不跟着变，
而"菜单上写着 A、这里写着 B"不会报错。⚠️ 只列**有快捷键**的条目，也**不标**
哪条实现了哪条没实现——那个判据在 `App.tsx` 的 `menuHandlers` 上。

---

## `src/ui/outline.ts`（134 行）

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

## `src/editor/command-state.ts`（205 行）

**光标状态的只读观察者**：一条 `$prose` 插件 + 一个 `CommandState` 接口，
把"光标此刻在哪儿"报给外壳。`docs/07` 第 2 项（工具栏）与"菜单第二条判据"
都靠它。

```ts
export interface CommandState {
  bold: boolean; italic: boolean; strike: boolean; inlineCode: boolean;  // 行内标记，可同时成立
  block: BlockKind;       // 所在块（text / h1…h6 / quote / ul / ol / codeBlock / table）
  inTable: boolean;       // 光标在表格里 → 表格那十条才亮
  hasSelection: boolean;  // 有选区 → 「清除样式」才亮
}
```

⚠️ **它是只读观察者**（和 `find.ts` / `writing-modes.ts` 同一族）：
`view.update` 恒返回 `false`，只通过 `onCommandState` 回调往外报。
说 `true` 会让 ProseMirror 白白重读一遍视图。

⚠️ **报的是"签名串"，比对之后才回调**：`CommandState` 每次事务都是新对象，
直接回调等于**每次光标动一下都让 React 重渲染一次**。所以算出状态后先拼一个
签名串，和上一次相同就直接返回。

⚠️ **源码模式与"还没有文档"报 `null`**，不是一份空状态——两者含义不同：
`null` 是"这条通路读不出来"，空状态是"读出来了，光标在普通段落上"。
`FormatBar` 对这两种情况的反应不一样（前者不画任何高亮）。理由写在
`ui/EditorPane.tsx` 的 props 注释里。

## `src/editor/insert.ts`（163 行）

`fmt.link` / `fmt.image` 的**节点构造**：给一个地址（和可选的替代文字），
在光标处插一个链接 / 一张图片。⚠️ **它不问地址**——"弹个框问一句"是
`ui/PromptDialog.tsx` 那半，两者刻意分开：这一半是纯的、可测的，那一半是界面。

⚠️ **链接是"有选区就套在选区上、没选区就插入文字"**；两种走向都在这里，
调用方不必分情况。

## `src/editor/find.ts`（364 行）

查找与替换的**全部逻辑**。分层如下（详见 `docs/05` §4.3）：

| 层 | 导出 | 说明 |
|---|---|---|
| 纯匹配 | `在文本里找匹配(text, query, opts)` | **唯一一份**匹配语义：大小写 / 全词 / 正则 |
| PM 适配 | `算匹配(doc, query, opts)` | `doc.descendants` 逐文本节点调上面那个，把节点偏移换成文档绝对位置 |
| 装饰 | `查找插件(onStatus)` | 命中走 `Decoration.inline`（`nota-find-hit` / `nota-find-current`） |
| 命令 | `设查询` / `走` / `清除` / `替换当前` / `全部替换` | 全部走**事务元**（`设置查询元` / `走动元` / `清除元`） |

⚠️ **装饰不是文档改动**：它们不进文档、不进撤销栈——Ctrl+Z 撤的是用户真改过的字，
不是高亮。⚠️ 但**替换是文档改动**（真写进文档、真进撤销栈），所以它派事务。

⚠️ **`在文本里找匹配` 是唯一真源**，源码模式也是调它——各写一份的症状是
"同一个词在两种模式里命中数不一样"，而用户在界面上**没有任何办法判断哪边对**。

## `src/editor/writing-modes.ts`（185 行）

专注模式 + 打字机模式（`docs/07` 第 6 项）。两个开关**都是"看的时候的状态"**，
不进设置、不落盘（同 `FormatBar`）。

- `算压暗(state)`：从光标那层往上，**每一层把同层的块级兄弟压暗**。
  ⚠️ 另一种写法（"所有块压暗、当前块加亮 class"）**嵌套就错了**——`opacity`
  不会因为子元素又亮回来而恢复，父块 0.32、里面的当前块最多也只能 0.32。
- `找滚动容器(el)` / `滚到正中(容器, 上, 下)`：**两个编辑器共用**。
  ⚠️ 容器**不写死选择器**：所见即所得那边滚的是 React 那个空 div，源码那边是
  CodeMirror 自己的 `scrollDOM`。写死一个，另一种模式就会静默不滚。
- `写作模式插件(初始)`：`$prose` 插件，state 走 `写作模式元` 这个事务元。
- `设写作模式(view, 模式)`：拨开关走它，**不重建实例**——重建会丢撤销栈和光标，
  而这两个开关恰恰是"写到一半才想去拨"的东西。

⚠️ **源码模式那边的装饰只有一颗**（`Decoration.line`）：CodeMirror 里内容是
**平的行**，没有块级父子，所以那边改成"根节点挂 `nota-focus`、当前行挂
`nota-focus-on`"，压暗交给 CSS 的 `:not()`——装饰数**不随文档长度增长**。

## `src/ui/FormatBar.tsx`（202 行）

格式工具栏（`docs/07` 第 2 项）：一排按钮，加粗/斜体/行内代码/删除线、
标题族、引用/列表/代码块/表格/分割线、链接/图片/清除样式。

⚠️ **它没有自己的状态**：高亮读 `commandState`（`data-on`），点击走
`onCommand(name)` → `App.tsx` → `runCommand`。**"亮着"不等于"能用"**——
亮的是"光标现在处在这个标记里"。

⚠️ **每个按钮都 `onMouseDown={(e) => e.preventDefault()}`**：不拦的话按钮会把
焦点从编辑区抢走，跑完命令焦点还在按钮上，用户接着打字是**白打**。

⚠️ **源码模式下整条不画高亮**（`commandState === null`）——那一侧没有文档树，
读不出"光标在什么标记里"。⚠️ 那十条表格命令在源码模式下按下去会 toast 一句
「当前编辑模式下还没有这个操作」（`runCommand` 返回 `false`），**不是静默无反应**。

## `src/ui/FindBar.tsx`（211 行）

查找与替换条（`docs/07` 第 4 项）。⚠️ **它是显示端 + 输入端，不是查找的实现**：
命中数一律是编辑器报上来的 `status`，本地算一份的话两边迟早算出不一样的数。
详见 `docs/05` §4.3。

⚠️ 三条要记住的：

- **Esc 收在条子自己身上**（不是 `window`），并且带 `isComposing` 判据——
  中文用户选字时按 Esc 是"取消候选"，抢过来会把整个条子关掉。
- **查询上报走 ref 读**，不进那个 effect 的依赖：`onQuery` 是 `App` 每次渲染
  新建的函数，进依赖就等于"每渲染一次重设一次查询"，而设查询会把光标搬到
  第一个命中上。
- ⚠️ **挂载时也报一次**（空串 = 清空高亮）：编辑器可能是刚建出来的（换文档、
  切模式），它手里没有任何查找状态。

⚠️ 它在 `App.tsx` 里带 `key={activeDoc.id}`：**换文档 = 换条子**（查询跟着清），
否则会出现"计数器显示 3 / 12、界面上一个高亮都没有"。

## `src/ui/PromptDialog.tsx`（164 行）

自绘的单行输入框，替掉 `window.prompt`。⚠️ **理由是硬的**：`window.prompt`
在 **WebKitGTK 上默认被关掉，调用静默返回 `null`**——「格式 → 超链接」点下去
什么都不发生，看起来就是那个菜单项坏了。

壳复用确认框那套（`.confirm-backdrop` + `.confirm-dialog.prompt-dialog`），
输入框**挂载即聚焦**，`Enter` = 确定、`Esc` = 取消。给了 `secondLabel` 才画第二个
字段（图片的「替代文字」）。**受控**：开、答案都在 `ui/useDialogs.ts`。

📌 **2026-09-24 起它也是插件面板/菜单项那条「先问一句」的框**
（`ui/plugin-prompt.ts::问参数` 走的就是它），多了一个 `secret?`：

| prop | 用途 |
|---|---|
| `secret` | 主输入框画成**密码框**（圆点）。给插件要 API key 的场合用 |
| `hint` | 输入框**下面**那行小字。插件 `prompt.hint` 落在这儿 |

⚠️ `secret` **遮的只是屏幕**：值本身照旧原样交出去、原样存进插件设置文件
（**明文**，见 `lua/api/settings.rs` 顶上那段与 [docs/12](12-plugin-runtime.md) §4.5）。
这一条不是为了"加密"，是为了别让人从肩膀上把 key 看走。**别在界面上说它"安全"。**

⚠️ 带 `secret` 时 `autoComplete="off"` **是必须的**：WebView 的密码管理器会跳出来问
"要不要记住"，而这里填的是 **API key**，不是登录密码——那个弹窗一出现，
用户就得先弄明白"这算不算我的账号密码"。

⚠️ **焦点全选**（`focus()` + `select()`）在插件那条路上同样是关键：Ctrl+K 编已有链接时
直接打字就替换了。**别把 `select()` 删了。**

⚠️ `Enter` / `Esc` 收在**输入框自己**身上，**不绑 `window`**（与 `ConfirmDialog` 不同）：
输入框里按 `Esc` **应该是**"把输入法候选框收掉"，绑到 `window` 上抢 `keydown`
会把那一下吃掉——中文用户按 Esc 想取消选字，结果整个框没了。

⚠️ **主字段为空 = 当作取消**（`value.trim() === "" → null`），不是"发一个空串"。
一个 `[文字]()` 在正文里看不出坏、点上去没反应；而"我改主意了、把框清空再点确定"
是个很自然的取消姿势。**插件那条路靠的正是这一条**——它同时挡住了
"git 收到一条空提交信息"和"AI 拿空串当提问发到网上"。

## `src/ui/useMenus.ts`（310 行）

**菜单与快捷键的接线**（2026-09-24 从 `App.tsx` 搬出，那边当时 1118 行）。
入参 `MenuWiring`，出参 `{ disabledCommands, menuChecks, usingNativeMenu }`。

⚠️📌 **`MenuWiring.menus` 必须是"拼过的那一份"**（`ui/usePlugins.ts::menus`，
即 `MENUS` ＋ 插件那一栏），**不是常量 `MENUS`**。原因与上面那条"真相源只有一处"
同型：这份 `menus` 派生出**三个**消费者——画出来的菜单栏、推给 Rust 的原生菜单、
快捷键索引（`accel.ts::buildAccelIndex`）。**任何一处漏用它去读常量 `MENUS`，
插件那一栏就会只在那一个消费者看得见**，症状是"菜单里有、`Alt` 键按不出来"。

⚠️ `buildAccelIndex` 的撞车判据是**先到先得**：插件那一栏拼在 `help` 之前、
也就是**所有内置栏之后**，所以**内置的快捷键永远赢**，撞车时 `console.warn`
一声（`docs/13` §8.3）。

三条判据、一个出口：

| 判据 | 回答的问题 | 来源 |
|---|---|---|
| 有没有处理函数 | 这个功能做了没有 | `App.tsx` 的 `menuHandlers` |
| `needsDoc` | 现在有没有一份文档可作用 | `activeId` |
| `光标条件` | 光标这一刻在不在合适的位置 | `commandState` |

⚠️ **"能不能点"的真相源只有一处**，而它派生出三个消费者：自绘菜单的 `disabled`、
原生菜单的 `enabled`、键盘的"这条键位接不接"。各写一份的症状是
**"菜单灰着、快捷键却照跑"**——不报错、不崩，只让用户觉得这个应用一会儿一个脾气。

⚠️ **`光标条件` 表里没有的 id 一律不受状态约束**（默认可用）。写成"默认不可用"
的话，每加一条命令都得记得来这儿登记，漏了就是一个永远灰着的菜单项。

⚠️ **`menuChecks` 的依赖是一串布尔，不是一个对象**：对象字面量每次渲染都是新身份，
拿它当 `useMemo` 的依赖会让那两个原生菜单的 effect **每渲染一次都重推一遍菜单**
（一次 IPC + 一次重建原生菜单）。

## `src/ui/useDialogs.ts`（106 行）

两个自绘对话框的"谁在等答案"：`{ confirmReq, askConfirm, answerConfirm,
promptReq, askPrompt, answerPrompt }`。

⚠️ **每个框后面是单个 ref，不是队列**：今天所有调用点都是用户动作直接触发的，
不存在并发；真要并发弹两个，后来者会把前一个的 Promise 永远挂着——那时再改成队列。

⚠️ 它**不知道谁在问**（关文档、退出、填链接地址）——这正是它能被搬出去的原因：
它只是一对"问一句、等回答"的 Promise 拼接器。

---

## `src/editor/export.ts`（186 行）

**把 Markdown 变成一份完整的 HTML 文件**（`docs/07` 第 1 项能当场做完的那一半）。

### 怎么渲染：同一条路，不另找库

⚠️ **不是**再找一个 Markdown 库：那样"屏幕上什么样"和"导出什么样"就成了两套实现，
各自都"对"，漂移了也没人会发现。这里走的是**编辑器自己那条路**——起一个**屏外只读**
的 Milkdown 实例，解析 + 渲染，再把那块 DOM 摘下来。

⚠️ 摘的是**渲染后的 DOM**，不是文档树。文档树那条路（`DOMSerializer`）更干净，
但会丢掉两样用户看得见的东西：① 宽松模式下 `#标签` 显示成标题（那是
`Decoration.node` 的 `nodeName`，**装饰不在文档树里**）；② 任务项的方框、代码块的容器结构。
导出对不上屏幕，用户只会觉得"导出的东西坏了"。

| 导出项 | 里面有什么 | 用在哪 |
|---|---|---|
| HTML（不含样式） | 只有语义标签，**一条 CSS 都没有**，连 class 都不带 | 贴进别的系统再加工 |
| HTML（含样式） | 嵌 `editor.css`（`?inline` = **同一份字节**）＋ 限域后的文档主题 | 直接打开看、打印、发给人 |

⚠️ 「含样式」那份外面**必须照着编辑区的 DOM 摆 class**（`.editor-pane` >
`.editor-mount` > `.milkdown` > `.ProseMirror`）。这不是巧合，是那份 CSS 的作用域要求
——摆错了的症状是"CSS 在、但哪条都没命中"。

### `async function 摘正文(markdown, strict): Promise<string>`（私有）

建离屏实例 → 在**还挂着的 DOM 上**摘零件 → `pm.innerHTML` → `handle.destroy()`。

| 摘什么 | 判据 |
|---|---|
| 类名 | **`nota-` 开头的一律不算内容**（`我们的类`）。收成一条规则是为了耐腐蚀：将来再加一个 `nota-xxx` 零件时自动生效，不必回来登记 |
| 属性 | `data-srcmark` / `contenteditable` / `spellcheck` / `translate`——全是"编辑时才成立"的 |
| 整块元素 | `.nota-code-bar`（代码块的语言选择器/复制按钮；它是容器，不是正文） |

⚠️ **在 DOM 上摘，不是把 HTML 拼出来再用正则洗**：正则会被正文里恰好出现
`contenteditable` 这几个字这类意外绊倒，而遍历 DOM 只认真正的元素和真正的属性。
⚠️ 离屏节点用 `left: -99999px` + `visibility: hidden`，**不是 `display: none`**：
ProseMirror 建实例时要量 DOM（行高、`coordsAtPos`），`display: none` 下量出来全是 0。
⚠️ `root.remove()` 放在 `finally` 里：中途抛错也必须收走，否则每导出一次就在页面上
留一个看不见的、DOM 监听还活着的编辑器。

### `export async function 导出HTML(markdown, opts): Promise<string>`

`opts: 导出选项 = { strict, styled, themeCss?, title }`。
`strict` **必须和屏幕上一致**，否则同一段 `#标签` 两边长得不一样。

⚠️ 主题 CSS 进来时是**原始文本**（`api.theme.css` 的返回值），**在这里限域**——
调用点（`ui/useExport.ts`）不做这件事，只有一个地方做才不会漏。

### `export function 默认导出名(title, ext): string`

**只换后缀**（`md` / `markdown` / `mdx` / `mdown` / `mkd` / `txt` → 新后缀），保留原文件名
——用户认得自己那份文档叫什么。洗空了给「未命名」。

---

## `src/ui/useExport.ts`（124 行）

**导出与打印的接线**：取正文 → 取主题 → 生成 HTML → 问落点 / 交给系统 → 报结果。

⚠️ **正文必须从编辑器拿**（`getMarkdown()`），**不是 `doc.text`**：后者是 300ms 去抖之后
的镜像（backlog 第 32 项），用户刚敲的字不在里面。"屏幕上和导出里不一致"是最容易被
当成"导出坏了"的那种 bug。

⚠️ **主题取不到不算失败**（`取主题CSS` 吃掉异常、返回 `undefined`）：settings 里记着一个
id、而那份 `.css` 被删了是很平常的事，为它中断一次导出不值。只在控制台留一句。

⚠️ **两档导出故意合成一条路**（一个 `styled` 布尔）：分成两个函数的话，
"另一种也顺手改一下"迟早会漏一次。

⚠️ **打印不是"在应用里打印"**：它 = 导出含样式的那份 + 交给系统默认程序打开，
提示里**两步都要说**（`已用系统默认程序打开，在那边按 Ctrl+P 打印（文件在 …）`）。
假装在应用里完成才是撒谎；理由写在 `commands/export.rs` 文件头。
⚠️ `print` 的落点由**后端按 `doc.path` 的父目录**决定——正文里 `![](./img.png)` 是相对路径，
换个目录图片就全没了。

---

## `src/ui/useDocTheme.ts`（99 行）

文档主题的三件事：**应用**（`useEffect`）、**切换**（`pickTheme`）、**打开主题文件夹**
（`openThemesDir`）。

⚠️ **从 `App.tsx` 搬出来的不只是行数**：这三件事共用同一个前提——**文档主题只作用于
编辑区**。摆在一起，那条约束才有一个看得见的落点。

⚠️ **与界面主题的 `applyTheme` 分家是有意的**：界面主题是**纯写属性**（同步改 `data-*`），
文档主题要**取回来 + 限域**才能注入，是异步的。节奏不一样就不塞进同一个 effect——
塞在一起的话，改一次界面主题会顺手重取一次文档主题的 CSS。

⚠️ **`alive` 标志必须有**：快速连点两套主题时，先发出去的 IPC 可能后回来，
不挡住就会用**旧的那份** CSS 覆盖新的——而且看起来像"点错了"。

⚠️ 提示里用**显示名**（中文），存进设置的是 **id**。混了就变成"提示里说换成「素纸」、
设置里存着一个 `paper`"。

---

## `src/ui/useEditorCommands.ts`（86 行）

**把一条菜单命令送进编辑器**：`run(c, payload?)` 直接转交；「插入链接」「插入图像」
先问出参数再一起交过去。

⚠️ **转交时必须看返回值**：`runCommand` 的返回值与"改了没有"无关——`false` 说的是
**这条命令在当前的编辑模式下没有对应的实现**（源码模式下表格那十条、以及没填地址的
链接/图片）。不看返回值，用户看到的是"点了没反应"，而原因（这个模式做不到）看不出来。

⚠️ 「插入链接」在**已经是一条链接**时再点一次，语义是**去掉链接**（命令本身是 toggle）。
Typora 那一下是"弹框改地址"，我们这一版不是——**如实记在 `docs/07` 里，别当成没做完**。

---

## 相关文档

| 要查什么 | 去哪 |
|---|---|
| 启动顺序、锁序、两条通道、插件分层 | `docs/01-architecture.md` |
| 字段级的数据结构、常量、两条真相口径 | `docs/03-data-structures.md` |
| 编辑器装配与去抖/整篇替换语义 | `docs/05-editor-bridge.md` |
| 已知缺陷与 backlog（编号） | `docs/07-feature-status.md` |
| 能力表与怎么写插件 | `docs/11-writing-a-plugin.md`、`docs/13-lua-api.md` |
