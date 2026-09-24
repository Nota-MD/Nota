# 09 · 文档同步政策与代码→文档映射表（强制）

> 最后同步：2026-09-23
>
> **本文是硬的。** `AGENTS.md` §0.2 说"改完代码必须同步文档"，
> 那份"必须"具体指什么、要动哪几份，就是本文这张表。
>
> 自检：`tools/doc-sync-check.sh`（提交前跑，退出码非零就是没过）。

---

## 1. 政策

**改了代码没改对应文档 = 没做完。** 不是"下次一起补"。

三条前提：

1. **以代码为准。** 文档与代码打架时，先改文档，不要为了迁就文档去改代码
   （除非代码确实是错的——那就先改代码，再改文档，同一批）。
2. **同一批。** 代码与文档在**同一次改动**里完成，不要留"待补"的文档欠账。
3. **改的是结论，不是措辞。** 表里的映射告诉你**哪几份文档的结论被这次改动推翻了**，
   而不是"去这几份文件里随便改两个字"。

**什么算"改了代码"**：任何落在本文 §2 表左边一列的改动。包括改一个函数的返回形状、
改一个设置项的键名、加一条命令、加一个前端文件。

**什么时候不用跑**：只改注释、只改 markdown 文档、只改 `.gitignore`。
除此之外都要跑。

---

## 2. 代码 → 文档映射表

这张表同时是 `tools/doc-sync-check.sh` 的 `PAIRS` 来源。**加文件必须同时加一行**
（脚本会检测"有源文件、表里没它"）。

### 2.1 后端

| 源 | 必须同批更新 | 为什么 |
|---|---|---|
| `src-tauri/src/main.rs` | `06` | 入口只有一个函数，变了说明启动方式变了 |
| `src-tauri/src/lib.rs` | `01` `02` `04` `05` | 启动顺序、命令注册表、窗口事件——四份都记了。⚠️ `nota_frontend_ready` 的**用途**（不是「重放插件 UI 注册」，是「WebView 从这一刻起能收事件」）在 `02` 与 `05` 都有，改它要动两处 |
| `src-tauri/src/error.rs` | `02` `03` | 枚举变体与 Display 文案是对外行为 |
| `src-tauri/src/paths.rs` | `02` `03` | XDG 落盘位置是用户可见的事实 |
| `src-tauri/src/state.rs` | `01` `03` | `AppState` 的字段与**锁序不变量**写在这两份里 |
| `src-tauri/src/settings.rs` | `03` `04` `10` | 设置项一改，UI 文档与外观轴矩阵都要跟着动 |
| `src-tauri/src/document/mod.rs` | `03` `05` | 文档模型 + "前端是唯一真相"那条口径 |
| `src-tauri/src/commands/mod.rs` | `02` | 只有 `pub mod` 声明，加了子模块就加一行 |
| `src-tauri/src/commands/document.rs` | `02` `04` `10` | 命令签名 + 界面入口 + 对标矩阵 |
| `src-tauri/src/commands/workspace.rs` | `02` `04` | 树节点形状是前端契约 |
| `src-tauri/src/commands/settings.rs` | `02` `04` | |
| `src-tauri/src/commands/plugin.rs` | `02` `04` | 加/改命令要同批改 `02` 的命令表与 `04` 的控件表 |
| `src-tauri/src/commands/theme.rs` | `02` `04` `10` | 主题的列/取 CSS/拿目录三个命令。⚠️ **入参是 id 不是路径**——前端根本没有"让后端读任意文件"的能力，见 `themes.rs::check_id` |
| `src-tauri/src/commands/menu.rs` | `02` `04` | 只有 `nota_native_menu_apply` 一条。⚠️ 返回值是**"挂上了没有"**，前端据此决定藏不藏自绘菜单栏——**不要**改成按平台判断（那样 macOS 上建失败会两道菜单都没了） |
| `src-tauri/src/slidev.rs` | `02` `06` `07` | 预览服务器的**生命周期**：挑端口（⚠️ Slidev 只绑 **`[::1]`**，探活要走双栈）、写入口文件（⚠️ 写在**文档自己的目录**里，`![](./img.png)` 才解析得对）、杀**进程组**（三层：`sh` → `npm exec` → `node`）、调试口子 `NOTA_SLIDEV_CMD`，以及四条实测结论。⚠️ 2026-09-24 起**「装没装」那半拆去了 `slidev_probe.rs`**（当时这边 1023 行，见 §4）；两边共用 `command_from_env` / `split_command` / `kill_group`（`pub(crate)`，改它们要连带看探测那边） |
| `src-tauri/src/slidev_probe.rs` | `02` `06` `07` | **「本机装没装 Slidev」**（2026-09-24 从 `slidev.rs` 拆出）：跑的是 `start` 会跑的**同一条命令**（`NOTA_SLIDEV_CMD` 或默认值）、**同一个 cwd**，末尾加 `--version`，npm 上 `npm_config_offline=true`。⚠️ **不许联网、不许变重**（用户只点了一下菜单）：缓存命中 1.3 秒、没命中 0.26 秒；自定义命令挂住时 20 秒收手（`process_group` + `recv_timeout` + `kill -TERM -<组>`）。⚠️ 判据是**两条**同时成立——CLI 离线拿得到 **且** 文档目录**向上**找得到 `node_modules/@slidev/theme-*`（`@slidev/cli` 不自带主题） |
| `src-tauri/src/commands/slidev.rs` | `01` `02` `04` | 八条短命令（`start`/`probeInstall`/`probe`/`log`/`status`/`openWindow`/`sync`/`stop`）。⚠️ `probeInstall` 是**异步命令**（探测要起进程、最长 20 秒），走 `spawn_blocking`；它**不改任何状态**，只回答「现在这一下能不能起」——起进程是 `start` 的事。⚠️ **故意「碎」**：`start` 不等端口——同步命令跑在主线程上，等就是冻界面，等待交给前端轮询 `probe`。⚠️ `stop` 里 `slidev::stop` 必须**先于** `close_window`（关窗口会同步回调 `Destroyed`，那里**也要**那把锁）。⚠️ 预览窗口的 label `slidev` 三处必须一致（这里 / `lib.rs` 的 `Destroyed` 分支 / 前端） |
| `src-tauri/src/native_menu.rs` | `01` `02` `04` | macOS 的原生菜单。⚠️ **这里没有菜单定义**，树由前端推来；`cfg!` 而非 `#[cfg]` 是有意的（让它在 Linux 上也参与类型检查）。⚠️ **灰掉的项不发快捷键**——macOS 连禁用项的键位一起匹配，灰着的 ⌘C 会把复制粘贴吃掉 |
| `src-tauri/src/themes.rs` | `02` `03` `08` | 文档主题的发现与读盘。⛔ **不兼容也不内置 Typora 主题**（版权，用户 2026-09-23 定的）。⚠️ `check_id` 是安全边界，那条"id 只放行 ASCII 字母数字与 `-` `_`"的规矩改这里要连带改 `03` 与 `08` |
| `src-tauri/src/commands/export.rs` | `01` `02` `04` `10` | 导出与打印的 **IO 那半**（2026-09-24）：`nota_export_write`（写一段文本到指定路径）＋ `nota_export_print`（写成 HTML → 交给系统默认程序）。⚠️ **这一层不认识 Markdown 也不认识 HTML**——生成在前端（`editor/export.ts`），搬过来就是把渲染引擎实现两遍。⚠️ 打印落点跟**文档自己的目录**（相对路径的图片才解析得对），固定名 `.nota-print.html`、点号开头默认隐藏；⚠️ 打印**不是** `window.print()`（WebKitGTK 上点不出来、也不是同步返回），如实把"交给系统、在那边按 Ctrl+P"两步都告诉用户 |
| `src-tauri/src/plugin/mod.rs` | `01` `02` `11` | 宿主的发现/加载/派发/卸载流程。⚠️「声明是状态 → 拉」的判据写在 `panels()` 的文档注释里，`05` §5.3 与 `07` BUG-13 引它，**三处要一起改** |
| `src-tauri/src/plugin/manifest.rs` | `03` `11` `12` | 清单格式与**能力表**是插件的对外契约 |
| `src-tauri/src/lua/mod.rs` | `01` `12` | 一插件一状态、沙箱边界画在哪 |
| `src-tauri/src/lua/api/mod.rs` | `12` `13` | 能力→子表的装配规则 |
| `src-tauri/src/lua/api/document.rs` | `13` `05` | |
| `src-tauri/src/lua/api/fs.rs` | `13` | 工作区内的路径裁决是安全边界 |
| `src-tauri/src/lua/api/git.rs` | `13` `11` | ⚠️ 两类失败的区分（调用错误 vs 环境不具备）写在 `13` |
| `src-tauri/src/lua/api/ui.rs` | `13` `04` `02` `05` `11` | ⚠️ 2026-09-22 起**不再是「三个方法都发事件」**：`notify` 推事件，`register_panel`/`register_menu` 写 registry 供宿主拉。改这里要连带读侧（`plugin/mod.rs`）与 `11` 的插件作者文档。⚠️ 2026-09-24 起 `register_panel` 多了 `render`（面板 DSL 的入口，形状定义在前端 `ui/panel-nodes.ts`）、`register_menu` 多了 `prompt` |
| `src-tauri/src/lua/api/http.rs` | `13` `12` `02` `06` | **`nota.http`**（2026-09-24 落地，backlog 第 12 项）：ureq 3.4.0 + rustls，**阻塞**所以整条命令走 `spawn_blocking`。⚠️ 四条对外口径改任一条都要同步文档：`https` 随便 / `http` **只放行回环**（`检查地址`，按**主机名**判）、**4xx/5xx 不是错误**（`http_status_as_error(false)`）、返回 `{code, text}` 且**能解析时另给 `json`**（`json_to_lua`，数组下标**从 1 起**）、`timeout_ms` 默认 30s/上限 180s（超了截断不报错）。⚠️ `写了_content_type` 那条防的是**重复 content-type 头**（`Request::builder().header()` 是追加） |
| `src-tauri/src/lua/api/settings.rs` | `13` `12` `07` | **`nota.settings`**（2026-09-24 落地，backlog 第 13 项）：一个插件一个**明文** TOML，`~/.config/nota/plugin-settings/<id>.toml`，文件 0600 / 目录 0700。⚠️ **明文是决定不是欠账**，理由在 `12` §4.5，**别顺手"修"成加密**。⚠️ 键名只认 ASCII 字母数字下划线且不含点、`set(k, nil)` 是删除、每次 `set` 立刻落盘 |

### 2.2 前端

| 源 | 必须同批更新 | 为什么 |
|---|---|---|
| `src/main.tsx` | `06` | |
| `src/App.tsx` | `02` `04` | 全局状态都在 `04`。⚠️ 快捷键**不在这里另写一张表**了（2026-09-23 起由 `ui/accel.ts` 从 `commands.ts` 派生），改键位不该动这个文件。⚠️ 2026-09-24 又搬走**五块**（1016 → 864 行）：菜单判据与快捷键分发在 `ui/useMenus.ts`、两个对话框的答案状态在 `ui/useDialogs.ts`、导出与打印在 `ui/useExport.ts`、文档主题三件事在 `ui/useDocTheme.ts`、"把命令送进编辑器"在 `ui/useEditorCommands.ts`——**改"灰不灰/勾没勾"、改导出、改主题切换都不该再动这个文件**。⚠️ 拆的是职责不是行数：那一批同时往里加了工具栏与查找条的接线，一次不减反增，别把行数当验收口径 |
| `src/bridge/ipc.ts` | `02` `05` `04` | **事件名字表**改了两份都得改。⚠️ 表中**只该有「发生类」事件**——声明类走 `api.plugin.panels()`/`menus()` 拉（BUG-13） |
| `src/editor/create.ts` | `05` | Milkdown 装配（所见即所得） |
| `src/editor/source.ts` | `05` `04` `10` | 源码模式（CodeMirror 6）。⚠️ **分屏是单向的**那条口径在 `05` §3.1，别把它挪到别处 |
| `src/editor/instant-render.ts` | `05` `04` `10` | 即时渲染的块级标记。⚠️ **`Decoration.node` 而不是 widget** 这条是踩出来的，理由写在它自己的文件头与 `07` §4。⚠️ 任务项**不给短横**那条例外也在这里 |
| `src/editor/task-list.ts` | `05` `04` `10` | 任务项复选框：靠 `mousedown` 判命中装订线 + `setNodeMarkup` 翻 `checked`。⚠️ **不改 schema、不改 `toDOM`**——DOM 钩子 `data-checked` 是 `preset-gfm` 本来就给的（`07` 第 36 项的旧写法说它没给，那是错的，见 `07` §4） |
| `src/editor/atx.ts` | `05` `03` `10` | **「什么算标题」的唯一判据**（宽松/严格两套正则 + `宽松标题层数`）。⚠️ 三个调用点都往这儿问，别各自写正则；Rust 侧同构实现在 `document/mod.rs::strip_atx`，两边判据要一起改 |
| `src/editor/lax-heading.ts` | `05` `03` `07` | 宽松模式的两半：显示层装饰（`Decoration.node` + `nodeName`）＋ 序列化层的 `不转义行首井号`。⚠️⚠️ **宽松模式一个字节都不改**这条不变量在这里，改之前先读它文件头 |
| `src/editor/code-block.ts` | `05` `04` `10` | 代码块 NodeView：语言选择器 / 复制 / 折叠。⚠️ 本仓库**唯一**一处 `$view`；**语言高亮不归它管**，归 `plugin-prism` 读 `attrs.language` |
| `src/editor/command-state.ts` | `05` `04` | **光标状态的只读观察者**（2026-09-24）：`CommandState` 的形状（`bold/italic/strike/inlineCode/block/inTable/hasSelection`）是工具栏高亮与菜单灰项的第二条判据的契约。⚠️ 它**从不派事务**，只在签名变化时回调；⚠️ "当前是哪种列表"靠 `list_item` 的父节点与 `attrs.checked` 判，理由在文件头 |
| `src/editor/insert.ts` | `05` | 几条**非命令式**的编辑动作：`转成任务列表` / `清除格式` / `表格删行删列删表`。⚠️ 用 `prosemirror-tables` 的**裸函数**（`deleteRow(state, dispatch)`），不是 gfm 的 `deleteSelectedCellsCommand`——后者要 `CellSelection`，而菜单进来时只有普通光标 |
| `src/editor/find.ts` | `05` `04` | **一份匹配逻辑，两个编辑器用**（2026-09-24）：纯函数 `在文本里找匹配` + ProseMirror 那侧的装饰插件（源码侧的适配器在 `source.ts`）。⚠️ 三件事写在文件头，改之前先读：① 逐**文本节点**匹配而不是把全文拼起来（拼起来会造出跨块命中）；② 零宽命中一律丢（否则 `全部替换` 原地打转）；③ 高亮**只是装饰**，不进文档、不进撤销栈 |
| `src/editor/writing-modes.ts` | `05` `04` | **专注 / 打字机**（2026-09-24）：PM 插件 + 两个编辑器共用的 DOM 小工具（`找滚动容器` / `滚到正中`）。⚠️ 专注模式压暗的是**同层兄弟**（另一种"除了我都压"的写法在嵌套下必错，`opacity` 不会因为子元素又亮回来而恢复）；⚠️ 源码那一侧的压暗靠 CSS 的 `:not()`，只发当前行**一颗**装饰（见 `source.ts`） |
| `src/editor/image-attrs.ts` | `05` `04` | **图片装载兜底**（2026-09-24）：上游 `preset-commonmark` 少写 `\|null`，不带 title 的图**装载时被整节点丢掉**（存盘丢图）。挂 `$remark` 插件在 mdast 上抹 `null`。⚠️ `create.ts` 里 `.use(补全图片属性)` 不许删；只读实例也要走这条路。文件头有实测记录 |
| `src/editor/math-macros.ts` | `05` `10` `04` | **数学宏表**（2026-09-24）：physics 的 108 条宏 + 每条的样例 + `PHYSICS_EQUIVALENTS` 对照表，交给 `create.ts` 的 `katexOptionsCtx`。⚠️ KaTeX 官方无 physics、`katex-physics`（2019、无 LICENSE 文件）**刻意没引**，这是我们自己写的表。⚠️ 三条硬约束（参数带花括号 / **KaTeX 的宏完全不支持可选参**——上一版这条写错了 / 星号不吃）与默认关的理由（重定义 `\div` `\Re` `\Im`）在文件头；**做不到的写法**逐条在 `10` §12.1。⚠️ 改表要连带改 `10` §12 与试验台的 `#math` 场景（它把每条真渲染一遍，**并且比对照表**） |
| `src/editor/export.ts` | `05` `10` | **导出 HTML**（2026-09-24）。⚠️ 走**同一条渲染路径**：起一个只读 Milkdown 实例、摘它渲染出来的 DOM——`DOMSerializer` 那条路会丢掉宽松模式下的标题显示与任务项方框，导出对不上屏幕。⚠️ 摘完按**类名前缀 `nota-`** 把编辑时的零件洗掉（一条规则，将来加零件自动生效），不是拿正则洗字符串。⚠️「含样式」复用编辑器自己那份 `editor.css`（动态 `?inline`），不是另写一份——另写就是第二个真相源 |
| `src/ui/useExport.ts` | `02` `04` `10` | 导出与打印的编排（2026-09-24 从 `App.tsx` 搬出）。⚠️ 正文**从编辑器拿，不是从 `doc.text`**（后者是 300ms 去抖后的镜像）；⚠️ 主题取不到**不算失败**（退回"不带主题"继续导）；⚠️ 两档导出**合成一条路只差一个布尔** |
| `src/ui/useDocTheme.ts` | `02` `04` `10` | 文档主题的应用 / 切换 / 打开主题文件夹（2026-09-24 从 `App.tsx` 搬出）。⚠️ 与 `applyTheme`（界面主题）**分家**：界面主题纯写属性、文档主题要取回来 + 限域、是异步的。⚠️ 取 CSS 那条有 `alive` 标志（连点两套主题时先发的可能后回来）。⚠️「只作用于编辑区」那道保证的落点是 `styles/doc-theme.ts`，这里只是调用方 |
| `src/ui/useEditorCommands.ts` | `02` `04` `05` | 「把一条菜单命令送进编辑器」（2026-09-24 从 `App.tsx` 搬出）：`run` 转交 ＋「插入链接/图像」先问参数。⚠️ 转交时**必须看 `runCommand` 的返回值**，不看它用户只会看到"点了没反应"。⚠️ 传的是 `editorRef` **本体**（身份稳定）不是 `.current` |
| `src/ui/EditorPane.tsx` | `05` | "那个 div 从不被 React 重渲染"是硬约束。⚠️ 2026-09-24 起句柄上还有**查找五条**与 `focus`；`onCommandState` / `onFindStatus` / 两个写作开关**都走 ref 读**（不重建实例），只有 `doc.id` / `mode` / `strict` 才重挂 |
| `src/ui/TopBar.tsx` | `04` `02` | 顶栏（纯展示；2026-09-23 从 `App.tsx` 拆出）。⚠️ `hideMenuBar` 的真假来自**后端返回值**，别按平台判 |
| `src/ui/TabBar.tsx` | `04` `02` | 标签栏（纯展示）。⚠️ "关之前要不要存盘"**不在这里**——`confirmReq` 在 `App.tsx` |
| `src/ui/MenuBar.tsx` | `04` `10` | 菜单栏骨架（`07` 第 40 项）。⚠️ 条目表在 `ui/commands.ts`，这里只管**"哪一栏开着"**；栏里的内容与键盘导航在下面两个文件里。新增菜单项要同时看 `10` 的对标矩阵 |
| `src/ui/MenuPopup.tsx` | `04` | 一层弹层 + 飞出层。⚠️ 子菜单 **portal 到 `body` ＋ `position: fixed`** 那条（父弹层 `overflow-y:auto` 会裁掉它）与"只支持一层子菜单"都写在文件头 |
| `src/ui/useMenuRovingFocus.ts` | `04` | 漫游 tabindex。⚠️ 吃掉的键**必须 `stopPropagation`**（子菜单套在父弹层里，不拦住父层会把同一个键再处理一遍）；`focusItem` vs `setFocusedIndex` 的差别也在这里 |
| `src/ui/useSlidev.ts` | `02` `04` `10` | Slidev 预览的**全部编排**（2026-09-23 从 `App.tsx` 搬出，那时它贴着 1000 行）：起进程 → 轮询到端口通 → 开窗口 → 正文一变就重写入口文件。⚠️ 2026-09-24 起**前面多一道闸**：点菜单先 `check(docId)` 出「装没装」面板（`gate` 状态 + `gateActions`），装好了才 `start`；`GUIDE_URL`（`https://sli.dev/guide/`）与**它怎么核出来的**（页面表 `hashmap.json`，SPA 的状态码核不出来）都写在这里。⚠️ **不落盘**（这个会话不进 `settings`，同 `dockOpen`）；⚠️ 每次开关都 `run.current += 1`，**在途的轮询靠它作废**——否则「等端口时又点了一次菜单」会在停掉之后凭空开出一个没人关得掉的窗口；⚠️ 开窗失败**只退回系统浏览器**，不判整场失败 |
| `src/ui/SlidevPanel.tsx` | `04` `02` | 「装没装」那个面板（2026-09-24）。⚠️ **它认识的东西很少**：一份 `SlidevProbe` ＋ 四个回调，**一个字都不自己编**——判定的话全在后端写的 `message` 里，它只按 `state` 决定按钮怎么摆。⚠️ 它**不是一堵墙**：`missing` 时主按钮是「去官网看安装指南」，旁边仍留「仍然打开预览」（探测是**有根据的猜测**，主题可能装在更上面的某层）。⚠️ 不用 `window.confirm`/`alert`（会阻塞 WebView、打断输入法组合态），同 `ConfirmDialog` |
| `src/styles/slidev.css` | `04` | Slidev 面板的样式（`.slidev-panel` / `.slidev-status` / `.slidev-mark` / `.slidev-facts` / `.slidev-side`）。2026-09-24 按「900 行就该想怎么拆」从 `app.css` 拆出（那时 985 行）。⚠️ **必须在 `app.css` 之后加载**——`.slidev-panel` 要盖掉 `.confirm-dialog` 那个 440px 宽度（同权重靠顺序）；断掉的 import **编译不报错**，改完要 `npx vite build` 确认 |
| `src/ui/nativeMenu.ts` | `04` | 菜单树 → `NativeMenuNode[]`。⚠️ **只做形状转换，不重算"该不该灰"**——那是 `App.tsx` 的 `disabledCommands`。`checked` 的 `undefined` 与 `false` **不是一回事**（普通项 vs 可勾未勾） |
| `src/ui/accel.ts` | `04` `05` | **快捷键的唯一真相源**。⚠️ 判键名**优先 `e.code`**（Shift 之下 `e.key` 是上档字符，`Ctrl+Shift+1` 曾经因此永远不成立，见 `07` §4）；`Ctrl` 在 macOS 上指 ⌘。界面上的键位文字由 `formatAccel` 出，改它要连带改 `04` §4 那张表 |
| `src/ui/commands.ts` | `04` `05` | **菜单项 → 动作**的唯一映射表，也是**快捷键表**（`ui/accel.ts` 反过来查它）。⚠️ 它调 `EditorHandle` 上的方法而不是直接碰 Milkdown，见 `05`。⚠️ 「主题」那栏的条目与勾是**合成**的（`themeEntries`/`themeChecks`/`resolvePick`），自绘与原生两边共用 |
| `src/ui/Sidebar.tsx` | `04` | 侧栏两页：文件（工作区树）/ 大纲，两棵树都能折（`07` §4 2026-09-24）。⚠️ 2026-09-24 补了右上角**收起那颗 ×**（`.sidebar-close`，照右侧插件栏那颗做）与空工作区里的**「打开文件夹…」**——但**开合只有 `App.tsx` 的 `sidebarOpen` 一份**，× 只是同一个 setter 的第二个入口；⚠️ × 放在 `role="tablist"` **外面**（塞进去读屏会把它念成一个页签） |
| `src/ui/PluginDock.tsx` | `04` `10` `02` | 右侧插件栏：面板 + 清单三组。⚠️ 2026-09-24 起面板**真的有内容**了（第 15 项落地）：「面板内容尚未接入」那句空态已经删掉，别再照着旧文档去找它 |
| `src/ui/PanelBody.tsx` | `04` `11` | **面板内容块的渲染层**（2026-09-24）：七种 `kind` 各画成什么。⚠️ 面板按钮的 `prompt` 在这里走 `plugin-prompt.ts::问参数`。⚠️ 这里**永远不许**出现 `dangerouslySetInnerHTML`——"字符串变不成 HTML"是这条路的全部保证 |
| `src/ui/panel-nodes.ts` | `11` `13` | **面板 DSL 的真相源**（2026-09-24）：`normalise()` 把宿主发来的一坨 JSON 收成 `PanelNode[]`。⚠️ **形状校验只在这一层**（宿主只管"是 JSON + 大小上限"，它连 `kind` 有几种都不知道）；⚠️ 认不出的 `kind` **如实显示**、字段类型不对**退回默认值**、插件塞的别的键**一概不往 DOM 上带** |
| `src/ui/pluginMenus.ts` | `04` `13` | **插件菜单项 → 菜单栏「插件」栏**（2026-09-24，第 42 项）：id 是合成的 `__plugin:<插件>:<命令>`，走既有的 `resolvePick` → `menuHandlers` 老路。⚠️ `menu` 写别的值**不静默丢掉**（灰掉 + 后缀写明想挂哪栏）；⚠️ 返回值每次都是新数组，调用方**必须** `useMemo`（下游牵着原生菜单重建） |
| `src/ui/plugin-prompt.ts` | `04` `13` | **"点之前先问一句"的唯一实现**（2026-09-24）：`问参数()` 把 `prompt` 弹成宿主的输入框、把答案并进 `args[arg]`。⚠️ 面板按钮与菜单项**共用**它——"取消就什么都不发生"这条只在它里面写一次 |
| `src/ui/usePlugins.ts` | `02` `04` | 插件这份状态的编排（2026-09-24 从 `App.tsx` 搬出）：拉插件/面板/菜单 + 处理函数表 + 出错提示。⚠️ 菜单栏拿到的是 `带插件栏(MENUS, 菜单项们)` 的结果，**不是常量 `MENUS`** |
| `src/styles/dock.css` | `04` | **右侧插件栏**（2026-09-24 按 1000 行规矩从 `app.css` 拆出，那时 1043 行）：栏本身 + 面板内容块 + 插件清单。⚠️ **必须在 `app.css` 之后加载**——它借了那边的 `.btn` / `.btn-primary` / `.btn-danger`（同权重靠顺序）；⚠️ 不许有任何一条规则把插件给的**字符串**变成视觉 |
| `src/ui/ConfirmDialog.tsx` | `04` `02` | 自绘确认框，替掉 `window.confirm`（`07` 第 29 项）。⚠️ 它是**受控组件**：`open` 与答案都从 `App.tsx` 走，自己不持有状态 |
| `src/ui/Home.tsx` | `04` `10` | 主页那一屏也在对标矩阵里 |
| `src/ui/StatusBar.tsx` | `04` | 未保存 + 字数四项 + **模式名**（恒显）与**「严格」徽标**（2026-09-24，只在开着时）。⚠️ 后两个是**只读指示**，点一下切模式会变成第三个切换入口 |
| `src/ui/Toasts.tsx` | `04` | |
| `src/ui/ErrorBoundary.tsx` | `04` | |
| `src/ui/FormatBar.tsx` | `04` `05` | 格式化工具栏（`07` 第 2 项，2026-09-24）。⚠️ 它**只是一个入口**：每颗按钮把一条 `EditorCommand` 交给 `EditorPaneHandle.runCommand`，命令的实现只在 `editor/create.ts` / `editor/source.ts` 里——两边各写一份的症状是"菜单里加粗了、工具栏里没有"。⚠️ 快捷键提示**从 `MENUS` 派生**（不手写 `Ctrl+B`）；⚠️ 用 `onMouseDown` 的 `preventDefault` 保住编辑区选区；⚠️ 源码模式下一颗都不亮（那份状态是 `null`，不是"都没按"）。2026-09-24 起**图标与文字字形混排**（图标那几颗另给 `aria-label`，因为 `.icon` 是 `aria-hidden`） |
| `src/ui/Icon.tsx` | `02` `04` | 界面图标（2026-09-24）：把 `src/assets/icons/` 那 96 个 Folio 图标当遮罩用（`?url` + `import.meta.glob`），颜色由 `currentColor` 给，文件里写死的 `fill` 不参与渲染。⚠️ 名字表手写 + 加载时核对文件存在（`import.meta.glob` 的键是 `string`，写错不报类型错，界面只是少一颗图标）；⚠️ 只搬动作图标，不搬 Folio 的应用图标；⚠️ 搬来的文件一个字节都不许改 |
| `src/ui/FindBar.tsx` | `04` `05` | 查找与替换条（`07` 第 4 项，2026-09-24）。⚠️ 它是**显示端 + 输入端**：命中数一律是编辑器报上来的 `status`，本地再算一份迟早两边不一样。⚠️ Esc 收在条子自己身上并带 `isComposing` 判据（中文用户按 Esc 是收候选框）；⚠️ 按钮一律 `onMouseDown` 拦默认行为（否则点完开关焦点就跑了，"替换"连点第二下会落空） |
| `src/ui/PromptDialog.tsx` | `04` `02` | 自绘单行输入框，替掉 `window.prompt`（**WebKitGTK 上默认关掉、静默返回 null**）。⚠️ 与 `ConfirmDialog` 同一个形状（受控、由 `App.tsx` 兑现 Promise），按钮顺序/Esc/点遮罩三条行为与它保持一致 |
| `src/ui/useMenus.ts` | `04` `02` | **菜单与快捷键的接线**（2026-09-24 从 `App.tsx` 搬出）：三条判据（有没有处理函数 / `needsDoc` / `光标条件`）→ 灰项 + 勾 + 键位分发 + 原生菜单推送，**一个出口喂三个消费者**。⚠️ `workspace` 那些开关是**按值**传进来的（对象字面量每次渲染都是新身份，拿它当依赖会让原生菜单每渲染重推一次） |
| `src/ui/useDialogs.ts` | `04` `02` | 两个自绘对话框"谁在等答案"的 Promise 拼接（2026-09-24 从 `App.tsx` 搬出）。⚠️ **一次只可能有一个**（每个框后面是单个 ref，不是队列） |
| `src/ui/settings/SettingsDialog.tsx` | `04` | 偏好设置那个框的**壳**：左栏（搜索 + 五节 + 「完成」）+ 右栏。⚠️ 搜索是就地过滤，靠 `QueryProvider` 把查询喂给每一行 |
| `src/ui/settings/primitives.tsx` | `04` | 偏好设置的原语（行 / 组 / 下拉 / 开关 / 滑杆 / 搜索框 / 图标）。⚠️ 加控件时「能不能被 `<label htmlFor>` 指」要在 `LABELABLE_TAGS` 那处判 |
| `src/ui/settings/panes.tsx` | `04` | 偏好设置的三节内容。⚠️ **改了立刻生效、没有「确定/取消」**（理由在它文件头）；`STYLES` 是轴一**唯一**的选项表，加值要同时改 `settings.rs` 的 `UiStyle` |
| `src/ui/settings/ShortcutsPane.tsx` | `04` | 快捷键一览。⚠️ 条目**从 `MENUS` 读**，别抄成静态表——那就是第二份真相源 |
| `src/ui/outline.ts` | `05` | ⚠️ 是**启发式正则**不是 AST，已知误差记在 `05` |
| `src/ui/view-modes.ts` | `04` | 三种编辑模式的**显示名**（`short` 给状态栏、`full` 给下拉）与出厂顺序，`StatusBar` 与 `settings/panes.tsx` 共用一份。⚠️ 只是名字表，**不含切换逻辑**——切换走 `App.tsx` 的 `updateSettings({ view_mode })` |
| `src/styles/doc-theme.ts` | `04` `05` `08` | **文档主题的限域注入器**：用 `CSSStyleSheet` 解析后把每条选择器收到 `.editor-pane` 之下（`:root`/`html`/`body` **改写成** `.editor-pane`，不是加前缀）。⚠️ **这一步就是"文档主题碰不到外壳"的全部保证**，六条规则写在它顶上；新增 at 规则的处理要连带改 `04` §3.3 |
| `src/styles/themes/` 下这六份：`paper.css` · `blueprint.css` · `mist.css` · `print.css` · `ink.css` · `pine.css`（完整键：`src/styles/themes/paper.css` / `src/styles/themes/blueprint.css` / `src/styles/themes/mist.css` / `src/styles/themes/print.css` / `src/styles/themes/ink.css` / `src/styles/themes/pine.css`） | `04` | 内置六套文档主题。⚠️ 按**普通文档 CSS** 写、**不带任何作用域前缀**，靠 `doc-theme.ts` 统一挂；每套必须自带 `--code-*`（有测试盯着）。加一套要同时改 `themes.rs` 的 `BUILTIN` 表和 `tools/doc-sync-check.sh` 的 `PAIRS` |
| `src/styles/theme.css` | `04` `08` | 界面那两条轴的变量表（风格 × 明暗）。⚠️ **只管外壳**，一个文档主题的变量都不在这里；`[data-ui-style="x"][data-ui-mode="y"]` 那种双属性块是给强调色用的（7 风格 × 2 模式 = 14 格都要有；`yaru` 与 `yaru-blue` 共用形状那一段）。⚠️ 2026-09-24 加了 `--find-hit` / `--find-current`（查找命中的底色）——**单独两个变量而不是复用 `--accent`**：高亮要盖在**正文**上，两者在暗色下的合适值差得很远。⛔ `--font-ui` 不许出现衬线（用户 2026-09-24：「绝对不要用衬线字体做UI字体」；`tools/doc-sync-check.sh` ⑥ 会查）；`--font-doc` 可以是衬线，但**只有 `.editor-pane` 下的正文能引**。⚠️ 同一天按「默认风格轻快一点」调过浅/深两套的底色、边框与强调色，并把 Adwaita（`auto` 在 GNOME 上落到的那一档）的圆角/间距/控件高各放松一格，原值写在注释里 |
| `src/styles/icons.css` | `04` | 搬来的那套图标（`src/assets/icons/`，96 个，来路见 `THIRD-PARTY.md` §5）怎么画：`.icon` 是 **`mask-image` + `background-color: currentColor`**（`-webkit-` 前缀两条都留：真窗口是 WebKitGTK、试验台是 Chrome）、`.icon-missing` 画虚线框、`.btn-with-icon` 给图标与文字之间那道 `gap`。⚠️ 与前后几份样式没有重叠选择器，加载顺序不影响结果 |
| `src/styles/applyTheme.ts` | `04` | 轴 → `<html>` 属性的写入口 |
| `src/styles/app.css` | `04` | 外壳：工具条 → 菜单栏（`.menubar` / `.menu-popup`）→ 窗口骨架 → 主页，加确认框。⚠️ **不含正文编辑区**（`editor.css`），也**不含左侧栏**（`sidebar.css`） |
| `src/styles/sidebar.css` | `04` | **左侧栏**（2026-09-24）：栏本身 + 文件树 + 大纲，含折叠三角（`.tree-twisty` / `.outline-twisty`）与折叠时的行数角标。⚠️ 拆出来是因为加了折叠之后 `app.css` 顶破 1000 行；拆的线是「栏里的那两棵树」，右侧插件栏不在这里 |
| `src/styles/settings.css` | `04` | 偏好设置框的样式（`.settings-*` 壳 + `.stg-*` 原语）。⚠️ **在 `app.css` 之后加载**，遮罩 `.confirm-backdrop` 的底子还在那边；框体**不再复用** `.confirm-dialog`（那套是给 320–440px 窄框写的）。2026-09-23 按 1000 行规矩从 `app.css` 拆出 |
| `src/styles/editor.css` | `04` | 正文编辑区：编辑区外壳、块标记、代码块、任务列表、**写作模式**（`.nota-dim` / `.cm-editor.nota-focus`）。2026-09-22 按 1000 行规矩从 `app.css` 拆出，那条线怎么划见它自己的文件头 |
| `src/styles/bars.css` | `04` | **编辑区上方那几条横条**（2026-09-24）：格式化工具栏 + 查找替换条 + **两个编辑器共用的命中高亮**（`.nota-find-hit` / `.nota-find-current`）。⚠️ 单独一份而不是塞进 `app.css`：那几条贴着编辑区、跟着 `mode` 走，外壳那套不跟 |

### 2.3 插件与工程

| 源 | 必须同批更新 | 为什么 |
|---|---|---|
| `plugins/*/plugin.toml` | `11` | 清单逐栏说明在 `11` |
| `plugins/*/main.lua` | `11` `13` | 内置插件是"活样例"，API 用法要与 `13` 对得上 |
| `src-tauri/Cargo.toml` / `package.json` | `06` `THIRD-PARTY.md` | 依赖与版本。⚠️ 加/删依赖就要同步第三方清单（它记了每个直接依赖的**许可证**） |
| `src-tauri/tauri.conf.json` | `01` `06` | ⚠️ CSP 只在这儿写，见 `AGENTS.md` §4b |
| `vite.config.ts` / `tsconfig.json` | `06` | ⚠️ `@/` 别名两处必须一致 |
| `index.html` | `06` | |
| `.github/workflows/release.yml` | `06` | 六格打包矩阵。⚠️ 平台/架构/`--bundles` 为什么是这么分的，`06` §2.4 有一整节，两边要一起改 |
| `tools/*` | `06` `09`（工具自己改规则时） | |

### 2.4 任何改动都可能连带的两份

| 文档 | 什么时候必须动 |
|---|---|
| `docs/07-feature-status.md` | 某项功能从空壳变成能用（或反过来）、修掉一个 BUG、backlog 顺序变了 |
| `docs/10-typora-parity.md` | Typora 对标矩阵里任何一格的状态变了。⚠️ **改状态就同时改 §1 的计数** |

> ⚠️ 这两份是**最容易漏**的——它们不在"改了哪个文件"的映射里，
> 因为它们记的是**行为**而不是**代码位置**。改完代码问自己一句：
> "用户现在能多做什么？" 能答出来的话，`07` 和 `10` 就要动。

---

## 3. `tools/doc-sync-check.sh` 查什么

脚本是**启发式**的，抓的是"**结构性**的漂移"，抓不到语义写错。
它有问题要能出声，但不能跑到让人想把它关掉——所以只报它真的确定的事。

| 检查 | 判据 | 失败时 |
|---|---|---|
| **① 行数上限** | `.rs` / `.ts` / `.tsx` / `.lua` / `.css` / `.sh` 不得 ≥ 1000 行 | 报错，指出文件与行数，要求就地拆分 |
| **② 文档新鲜度** | §2 表里每个源文件，若其 mtime **晚于**它映射的任一文档 → 可疑 | 警告，列出"哪个源改了、哪份文档没跟" |
| **③ 文档引用存在性** | 代码与 `AGENTS.md` 里 `docs/NN-*.md` 的引用，文件必须存在 | 报错，指出谁引用了不存在的文档 |
| **④ backlog 编号存在性** | 代码里 `docs/07` 第 N 项的引用，编号必须在 `07` §3 表里存在 | 报错 |
| **⑤ 源文件已被登记** | `src-tauri/src/**/*.rs` 与 `src/**/*.{ts,tsx,css}` 每个文件都要出现在 `AGENTS.md` §2 或本文 §2 里 | 警告，提示加一行 |
| **⑥ 界面无衬线** | `src/styles/*.css`（**不含 `themes/` 那个子目录**）与 `index.html` 的每一行，出现 `serif` 而不带 `sans-` → 失败（**注释行**与**定义 `--font-doc` 的整条声明**豁免）；另有**一条间接判据**：`--font-doc` 只许出现在 `theme.css` / `editor.css` / `themes/`（**注释里提到不算**） | 报错，指出文件与行号 |

**② 用 mtime 而不是 git**。⚠️ **这条理由在 2026-09-24 当天过期了**：本仓库**现在
是 git 仓库**（被初始化过、已有提交，`git status` 正常）。原先写的是"当前不是 git 仓库，
`git status` 会失败"——那句话当时是真的，现在不是。
⚠️ **但脚本暂时不改**：mtime 与 git 的差别是**"碰过" vs "改过"**——
`git diff` 能认出"改完又还原"这种假警报，mtime 认不出；代价是它**要求先提交**，
而本仓库有九十多个未提交改动，此刻换成 `git diff` 只会把每一条都报成可疑。
**真要换，得先约定"每批做完就提交"**（`AGENTS.md` §0.5 那条"推 GitHub 之前不必兼容
老东西"是另一个议题，不冲突）。
mtime 是近似：拉取代码、`touch`、检出旧版本都会让它误报。
⚠️ **误报不要靠改脚本消掉**——要么真的去更新文档，要么在下面的 §5 记一笔。

### ④ 为什么值得单独查

代码里有二十多处注释在写"见 `docs/07` 第 N 项"。**backlog 是有编号的、编号是永久的**，
所以插一项、删一项、重排一次，都会让散落各处的注释指向错误的地方——
而这类错误**不会让任何东西编不过**，只会让人按图索骥找到一段不相干的说明。
脚本查的是"编号存在"，不查"编号指的是不是同一件事"（那只能靠人）。

### ⑥ 为什么值得单独查

用户 2026-09-24 的原话是「**绝对不要**用衬线字体做UI字体」——"绝对"这个词
是我们要求自己加机器判据的门槛：**能查的规矩才有资格叫硬规矩**。

这条查的是**两条路**，因为翻车的是第二条：
- **字面**：某条 `font-family` 里写了 `serif`（或写了宋体/Georgia 这类衬线族名）。
- **间接**：`font-family: var(--font-doc)` 这种引用——一个字面 `serif` 都不含。
  2026-09-24 就是这里漏的：工具栏上代表斜体那个字形引了 `--font-doc`，
  于是界面上的一个字母是**宋体**画的；而那时"界面不许衬线"还没人查。

脚本只认字面与这一条已知的间接引用，**别当类型系统用**：换个变量名中转
（`--font-x: var(--font-doc)`）它就看不见了。所以 §5 里那条"已知漏网"
才是这套东西的诚实底线。

⚠️ **这条检查自己栽过两次跟头**，两次都是**误报**（把正当的东西报成越界），
两次都改的是脚本而不是源码——记在这里，免得下次有人照着"消 WARN"的思路把源码改坏：

| 误报 | 为什么 | 怎么修的 |
|---|---|---|
| `theme.css` 里**定义 `--font-doc` 的那一行**被报成衬线 | 那条声明是**折成两行**的：`--font-doc: "Noto Serif CJK SC", …,` 与 `"Songti SC", serif;`。原先的豁免是"含 `--font-doc` 的行跳过"，可第二行上根本没有这四个字 | 改用 awk 从含 `--font-doc` 那行起、跳过**整条声明**（到以 `;` 收尾那行为止），并把输出拼回 `文件:行号:` 前缀 |
| `bars.css` 里那条 ⛔ 注释被报成"引了 `--font-doc`" | 间接判据是**按文件**报的（`grep -l`），而解释"这里为什么不能引 `--font-doc`"的说明文字里必然写着这个名字 | 间接判据也**跳过注释行**（`:[0-9]+:[ \t]*(/\*|\*)`），改成先 `grep -n` 过滤、再 `cut` 出文件名 |

⚠️ 两次的教训是同一条：**这条检查会读到自己**。以后往 `theme.css` / `bars.css`
里写"解释这条规矩"的注释时，记得脚本已经会跳过注释与 `--font-doc` 的声明——
但**新写法**（比如把字体栈拆成三行）仍可能再次绊倒它。改脚本前先在这里记一笔。

---

## 4. 1000 行规则

口径与 `AGENTS.md` §0.6 一致：**任何 `.rs` / `.ts` / `.tsx` / `.lua` 文件不得超过 1000 行。**

- 到了 **900 行**就该想下一步怎么拆，不要等到 1000。
- 拆分要**沿职责**拆，不要沿行数对半砍。
- `src/styles/app.css` **是例外的一类**：它是纯样式，没有逻辑可拆，
  那 800 多行里绝大部分是选择器。真要动它，按「外壳 / 侧栏 / 编辑区 / 状态栏」分文件
  ——**侧栏那一份、编辑区上方那两条已经这样拆出去了**（`sidebar.css` / `bars.css`，2026-09-24），
  前提是**同时改 `main.tsx` 的 import**（脚本查不到 import 是否断了，
  所以改完要 `npx vite build` 确认）。

**当前最大值**（2026-09-24 再数一次，那天往里加了状态栏两格与侧栏那颗 ×）：前端 `src/App.tsx` **888 行**、
`src/styles/app.css` 849 行（左侧栏拆去 `sidebar.css` 之后）、`src/editor/source.ts` 742 行、`src/editor/create.ts` 526 行、
`src/styles/editor.css` 463 行、`src/bridge/ipc.ts` 446 行、`src/ui/commands.ts` 415 行；
后端最大是 `src-tauri/src/document/mod.rs` **639 行**（`slidev.rs` 638、`native_menu.rs` 492、
`lua/mod.rs` 464、`slidev_probe.rs` 461）。
⚠️ **900 以上一条都没有**：`App.tsx` 888、`app.css` 849——**但这两条都在往 900 上走**，
下一次往里加东西之前先想好拆哪一块（`App.tsx` 能拆的是"外观那两条轴的接线"，`app.css` 按
「外壳 / 状态栏 / 主页」再分一份）。纯样式那份 2026-09-24
顶破 1000 行之后已经按上面那条例外拆过一次（`app.css` → `sidebar.css`）。
`App.tsx` 2026-09-24 **沿职责拆了五刀**（`ui/useMenus.ts` + `ui/useDialogs.ts` + `ui/useExport.ts`
+ `ui/useDocTheme.ts` + `ui/useEditorCommands.ts`），1016 → 864，**已经回到 900 以下**。
⚠️ 但那次拆的过程本身值得记：**先拆两刀仍是 916 行**，因为同批又往里加了工具栏与查找条的接线
——**"拆了"和"变小了"不是同一件事**，别把行数当拆分的目标。
**都在限内，没有欠账。**
 ⚠️ 这一行**每次拆完/长文件之后要重数**，不要凭印象递推——
下面那段「同一节里写出两个数」就是凭印象写出来的。

⚠️ 本节的 `app.css` 行数**同一节里曾经写出两个数**（上面说 706、下面说 704），
实测 **704**。原因就是"上面的数是凭印象写的、下面那个是 `wc -l` 出来的"——
**同一个数要写两遍的地方，第二遍必须复制第一遍，不许重新估**。
（`tools/doc-sync-check.sh` 查的是"有没有超 1000"，**查不出这种自相矛盾**，
所以这种错只能靠人：写在两处的同一个数，改的时候要一起改。）

---

## 5. 已知的漏网（诚实登记）

启发式检查抓不到以下情况，**这些只能靠人**：

| 类别 | 例子 |
|---|---|
| **语义写错** | 文档说"失败返回 `Err`"，代码其实返回结果表——mtime 检查看不出来 |
| **状态填乐观** | 把"代码写了"填成 ✅。⚠️ 这是本项目**最危险**的一类，`docs/10` §10 专门写了判定标准 |
| **计数漂移** | `07` §3 或 `10` §1 的表格加了一行但总数没改。脚本不数行 |
| **跨文件不一致** | `vite.config.ts` 与 `tsconfig.json` 的 `@/` 别名不一致（表现是"tsc 过了、vite 挂了"） |
| **注释里的编号语义** | 见 §3 ④ 末尾 |
| **⚠️ 行号过期** | 文档写"`applyTheme.ts:73` 是 `dataset.uiMode`"，而那个文件后来加了 9 行——`73` 现在是 `};`。**这类错 2026-09-22 一次核对就抓出 8 处**（全在 `docs/08`，都是 `applyTheme.ts` / `theme.css` 的行号整体偏移）。**成因不是"忘了更新"，是"当时就是估的"** |
| **同一个数写在两处** | `docs/09` §4 自己就犯过：上面写 `app.css` 706 行、下面写 704（实测 704）。脚本查"有没有超 1000"，查不出自相矛盾 |
| **衬线字体绕过 ⑥** | ⑥ 只认字面 `serif` 与 `var(--font-doc)` 这两种写法。中间再套一层变量（`--font-x: var(--font-doc)`）或走 JS 内联 `style` 注入，它都看不见——**但后者更好挡**：`src/` 下的 `.ts/.tsx` 里写 `fontFamily` 是一眼能 grep 到的事，加断言前先 grep 一遍 |

发现漏网时**在 `docs/07` §4 的漂移登记表里记一笔**，别默默修掉——
"这一类是怎么漏的"比"这一处修好了"更值钱。

### 怎么少写几个过期的行号

**行号是最脆的一类引用**：改一行注释，后面全偏。三条口径：

1. **优先引符号名，不引行号。** 写"`硬化的_lua()` 里列的 `必须为空的全局`"比写
   "`lua/mod.rs:118`"强得多——符号改名会被编译器抓到，行号不会。
2. **非要写行号，就当场 `grep` 出来，不许凭印象。** 那次抓出的 8 处里，
   没有一处是"行号曾经对过、后来漂了"的判断依据——**它们从一开始就是估的**。
   `grep -n` 一行命令的事，估出来的数没有任何理由比它准。
3. **做了会让行号整体移动的改动（加注释、拆函数）时，顺手核一遍引用到该文件的行号。**
   `grep -rn '文件名:行号' docs/` 能一次列出来。

---

## 6. 提交前

```sh
cd /home/lqy/项目/30_计算机/30-01_一些AI编程项目/Nota
bash tools/doc-sync-check.sh          # 文档同步自检
podman exec -u 1000 -w "$PWD/src-tauri" tauri-dev cargo test
podman exec -u 1000 -w "$PWD" tauri-dev npx tsc --noEmit
podman exec -u 1000 -w "$PWD" tauri-dev npx vite build
```

四条都过才算做完。⚠️ 前三条过了**不代表性对**——见 §5。
