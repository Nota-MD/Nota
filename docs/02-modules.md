# 02 · 逐文件接口参考

> 最后同步：2026-09-26

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
| `lib.rs` | 建 Tauri、`setup()` 里按顺序启动、**77 条**命令的注册表（`commands::*` 75 ＋ 本文件 2，⚠️ **2026-09-27 晚第十遍重数**（在第九遍的 65 之上，多出的 12 条＝本批 2 ＋ 别的会话 10）；第九遍那次的说明见下：**2026-09-27 第九遍重数**——此前这里手抄的「64 = 62 + 2」**自己加不起来**（09-26 那次只抬了总数没重数分项），根因是五整组命令（focus 6 / table_width 3 / diff 1 / watch 1 / ui_style 3）从没进过 `docs/01` 的分组表；复算配方与教训见 `docs/01` §通道 A）、窗口销毁时卸载插件（⚠️ **按窗口 label 分派**，见下——警报窗那一个 ARM 走的是"当作我回来了"）、`RunEvent::Exit` 里收掉插件起的开发服务器 |
| `lang.rs` | **「什么算一种合法语言」的唯一权威**（2026-09-25）：`支持的语言`（顺序就是设置里选择框的顺序）/ `语言名`（各语言的自称）/ **`插件兜底 = "en"`**（对插件作者的要求）与 **`应用兜底 = "en"`**（应用自己的落点）——⚠️ 两个常量 2026-09-26 拆开，**今天同值但是两个概念** / `自动 = "auto"` / `规范`（`zh_CN.UTF-8` → `zh-CN`）/ `匹配`（先精确、再**只往粗的**匹配：应用 `zh-CN` 能匹配插件的 `zh`，**反过来不行**）/ `读语言文件` / `有效语言(设置那一格, 系统语言)`。⚠️ **宿主与插件的语言协商都问它**——`lua/api/i18n.rs` 不自己写一套 |
| `cli.rs` | 命令行参数：`首个要打开的文件()`——把 `nota 笔记.md` / 文件管理器"用 Nota 打开"的那个路径挑出来。⚠️ **纯函数，不判存在性也不读文件**（挑出来交给前端那条开文档的路照常报错）；⚠️ 只认第一个非选项参数 |
| `error.rs` | `NotaError`，中文 Display，自定义 `Serialize` 过 IPC |
| `paths.rs` | XDG 目录、插件目录、**主题目录**的**唯一**算法所在地 |
| `state.rs` | `AppState` 四个句柄 ＋ `settings_problem`（只读）＋ `app_lang`（**开机算一次，之后不变**）+ 锁序不变量。⚠️ `DevServerState` 与 `plugin::ReviewState` **故意不在这里**（见 `docs/01` §② 第 ⑤ 步） |
| `settings/mod.rs` | `Settings` 与三条互相独立的外观轴，kebab-case 落盘；解析不了的原文件先备份成 `.bak`。⚠️ 2026-09-24 由单文件 `settings.rs` 拆成模块目录：`mod.rs` 留枚举与结构体本体，另**十个**文件按**界面上的页**各装一张表（`files` / `editor` / `image` / `markdown` / `export` / `appearance` / `focus` / `general` / **`document`** / **`keys`**），逐文件见下 |
| `themes.rs` | **文档主题**的发现与读盘：`DocThemeInfo` / `discover()` / `css_of()` / `user_themes_dir()` / 围栏 `check_id()`。⛔ **不兼容也不内置外部编辑器的主题**（版权，用户 2026-09-23 定的）。⚠️ 入参是 **id 不是路径**。⚠️ 2026-09-26 起 `check_id` / `check_size` 是 `pub(crate)`——`ui_styles.rs` **复用**它们而**不是各写一份**（同一道安全边界两份实现，漂的是哪一份没人看得出来） |
| `ui_styles.rs` | **界面风格**的发现与读盘（2026-09-26 新增），与 `themes.rs` **并行**：`UiStyleInfo { id, builtin }` / `discover()` / `css_of()` / `user_styles_dir()` / `BUILTIN_IDS`。⚠️ **与文档主题最大的差别是"不限域"**（界面风格要改的就是整个外壳），差别表写在文件头上，⛔ 别把两条机制合成一条。⚠️ 内置那八档**没有文件**，`css_of` 只认用户丢进 `~/.config/nota/ui-styles/` 的 |
| `focus/mod.rs` | **强制专注的账本**（2026-09-26，657 行）：`阶段`（`专注` / `走神 { 起于 }` / `警报`，`名字()` 给前端分叉用）、`会话`、跨边界的 `快照`、`FocusState`，以及那个**一秒一拍的裸线程**（`起`）。⚠️ **它不是插件，是核心功能**（用户原话「注意啊，这不是插件。这是核心功能」）——它要窗口焦点、要开置顶窗、要出声，三样都在插件沙箱之外。三条不变量在文件头：**宽限期内不欠账** / **警报中账本冻结** / **冷却要攒回复活线**（`复活线最小` 10s ～ `复活线最大` 60s）。⚠️ `FocusState` **单独 `manage`、不进 `AppState`**（同 `Heartbeat` / `DevServerState` / `ReviewState` / `ProbeCache`），账本自己一把锁。⚠️ 发事件与开窗都在**放开锁之后**（锁序）。13 条用例 |
| `focus/alarm.rs` | **警报窗与那一声响**（2026-09-26，191 行）：`窗_LABEL = "focus-alarm"`（`lib.rs` 两处分派靠它）、`EVENT_BEEP`、`响` / `开窗` / `关窗` / **`对账`** / `系统提示音`。⚠️ 为什么必须是**另一个真窗口**（置顶 ＋ 全屏 ＋ 抢焦点）而不是主窗里盖一层红布：警报响时用户**已经切走了**，主窗在他背后。⚠️ **开与关都认 `阶段` 一个真相源**——计时线程每一拍 `对账` 一次；`关窗` 别在 `确认` 里再调一次。⚠️ `对账` 是 **BUG-41** 的修法：这一段设计原先只写在文件头里、计时线程里从没实现过，所以**改这里先去 `super::起` 数一眼调用点，别只读注释** |
| `proc.rs` | **跑外部程序的那一层**（2026-09-25 从 `slidev.rs` 抽出来，判据是**依赖方向**——pandoc 导出要用同样三件，不该让 `pandoc.rs` → `slidev.rs`）：`split_command`（⚠️ **只按空白分词**、不认引号）· `command_or_default` · `kill_group` · `spawn_retrying`（⚠️ `ETXTBSY` 等一下再试，见本文件里那一节）· `run_capture(program, args, RunOpts)`（自成进程组、可选喂 stdin、带超时，超时**杀整个进程组**）· `Ran` 四档 |
| `diagnostics.rs` | **「关于 → 故障排除」要的两组信息**（2026-10-04 新增）：**编译信息**（`version` / `build_time` / `build_host` / `build_platform` / `target` / `profile` / `rustc` / `cargo` / `node` / `npm` / `tauri` / `webkit_crate` / `gtk_crate` / `mlua`）＋ **本机信息**（`os_pretty` / `kernel` / `arch` / `gtk_runtime` / `webkit_runtime`）。⚠️ **两组是两个不同机器的事实**（打包那台 vs 用户手上这台），混起来是这一页最容易犯的错。⚠️ **编译期那一半不在这儿采**：`build.rs` 写好 `OUT_DIR/build_info.rs`、这里 `include!`（理由见那个文件的文件头）。⚠️ **取不到就写空串**，前端画「—」——绝不能因为缺一条整页空白。⚠️ 字段名 snake_case 直接过 JSON（本仓惯例） |
| `commands/diagnostics.rs` | `nota_diagnostics` 一条（2026-10-04）。⚠️ **异步 ＋ `spawn_blocking`**（采集要起 `uname` 子进程，同步命令跑在主线程上会把界面冻住，同 `nota_pandoc_probe`）。⚠️ `Err` 只有一种情形：那个阻塞任务自己 panic 了 |
| `file_move.rs` | **重命名 / 移动的唯一实现**（2026-09-27，`docs/10` §1 那格，418 行）：只有 `移动(从, 到)` 一个入口。⚠️ **三条硬口径**：**绝不覆盖**（目标在了就报错，一个字节都不动；**坏链接也算"在了"**）、**跨设备要能走**（`rename` 失败就退化成"临时文件 → 复制 → 改名 → 删源"）、**失败不留半个东西**（临时文件落在目标那一层目录里，复制失败就地删掉）。⚠️ 跨设备的判据是 `ErrorKind::CrossesDevices`，**不写裸错误码 18**——Windows 的同类错误是 17，而两边的 kind 是同一个。⚠️ 删源那一步失败时**明说"两份都在"**，不假装成功（那是用户自己收拾得掉的局面）。⚠️ **三条不做**：不猜文件名（重名报错，不自动加 `-1`）、不挪目录、不服软链接（`symlink_metadata` 判，跟着链接走会挪错东西）。12 条用例，其中"真跨设备"那条**在本机真跑过**（`/tmp` 与 `/dev/shm` 是两个设备） |
| `document/mod.rs` | `DocId` / `Document` / `DocumentStore`（＋ `选区快照`）。⚠️ **2026-10-04 第 14 项那一批**：`Document` 多一个 `选区` 字段（`#[serde(skip)]`，**界面状态不是文档内容**）与 `DocumentStore::记选区`；⚠️ **标题那一族（`derive_title` 一族）同批拆去了 `document/title.rs`**（本文件当时过了 800 行），`mod.rs` 里留一行 `pub use` 保住老路径。⚠️ **2026-09-27 加了 `移到(id, 目标)`**（重命名 / 移动走它）：顺序是**先挪盘上的文件、成功了再改路径与标题**——反过来的话挪失败会留下一份"账上已经改了名、文件还在老地方"的记录。⚠️ 它**只动** `path`/`title`/`revision`，`text`/`clean_text`/`dirty` 一个都不碰（改个名不该让未保存的改动消失） |
| `document/title.rs` | **标题从哪来**（2026-10-04 从 `document/mod.rs` 拆出，114 行）：`derive_title` ＋ 三个私有辅助（`front_matter_title` / `first_heading` / `strip_atx`）。⚠️ **纯文本进、标题出**——不认识 `DocId`、不取锁、不碰磁盘，这就是它能被拆出来的那条缝。⚠️ `front_matter_title` / `strip_atx` 与前端 `src/editor/atx.ts` **同构，两边要一起改** |
| `image.rs` | **插入图片的算式**（2026-09-26 为 backlog 第 62 项写的，唯一一份）：地址规则 / 落点与文件名 / 计划与落地。⚠️ **本文件只放类型与 `pub use`，实现分在四个子文件里**（那天它自己长到 1232 行、顶破 1000 行硬线）：`image/address.rs`（110 行，`是网络地址` / `规则适用` / `相对路径` / `加点点斜杠` / `转义地址`）· `image/target.rs`（178 行，`目标目录` / `定名` / `从地址猜名字`）· `image/plan.rs`（254 行，`算计划` / `落地` / `取网络字节`——**全仓唯一一处"往网络要字节"的地方**）· `image/tests.rs`（575 行）。⚠️ **拆分对调用方零改动**：`pub use` 把 `crate::image::放置` 一族路径原样保住，`commands/image.rs` 那边一行没改 |
| `upload/` | **「把一张图送到用户自己填的那台服务器上」的唯一一份实现**（2026-09-26 第二批）：`upload.rs`（707 行，算式与设置——拼多部件体 / 解析请求头 / 从响应按点路径取地址 / `nota-auto-upload` 前件 / 文件 0600 建）· `upload/net.rs`（181 行，**唯一碰网络的地方**）· `upload/tests.rs`（747 行，28 条用例）。⚠️ **不并进 `image.rs`**：那边最远只到磁盘，这边要**把用户的字节送出这台机器**。⚠️ **不预设任何服务商**（测试里钉着这件事）；**配置在 `~/.config/nota/image-upload.toml`，0600**，不许并进 0644 的 `settings.toml` |
| `commands/mod.rs` | 只是**十五**个子模块的声明（2026-09-26 现数：`diff` / `document` / `export` / **`focus`** / `image` / `image_upload` / `menu` / `pandoc` / `plugin` / `settings` / `table_width` / `theme` / `ui_style` / `watch` / `workspace`）+ 命令层的分工说明（无函数）。⚠️ 这一格此前写着"十"，那是个**只数了最近几批新加进来的**的旧账——**数是数出来的，不是推出来的** |
| `commands/image.rs` | `nota_image_place` 一条，**异步**（可能要下载网络图片、写磁盘，走 `spawn_blocking`；`docs/06` §3.1 那条"任何碰磁盘/网络的命令都不许跑在主线程上"）。⚠️ **规则与文档位置一律由宿主从 `Settings` 与 `DocumentStore` 现取，不信前端传进来的那份**——前端只给"哪份文档 / 图片来源 / 替代文字"，否则前端就成了第二份判据 |
| `commands/image_upload.rs` | 「上传图片」那三条（`nota_image_upload_get` / `_set` / `_one`），**都是异步 ＋ `spawn_blocking`**（读盘、联网最长 60 秒）。⚠️ **手动与自动两条路共用同一次上传**，但方向相反：手动**先传、失败才落盘**，自动**先落盘、失败就保留本地地址**。⚠️ **三道闸缺一不可**（`enabled` / `auto` / 文档 YAML 里的 `nota-auto-upload`） |
| `commands/document.rs` | `nota_doc_*` **十五个**命令（⚠️ **2026-10-04 现数**（第 14 项那一批）：十四 → **十五**，新增 `nota_doc_cursor`，编辑器把**选区**报上来——⚠️ 它**什么都不改**（不碰 `text` / `revision` / `dirty`，见 `docs/03` §4.2）。⚠️ 上一次第十遍是十二 → 十四（`nota_doc_rename` / `nota_doc_move`），第九遍把"十一"改成"十二"（多出的是 `nota_doc_disk_text`，给外部改动提示条的「查看修改」用）——⚠️ ⚠️ `AGENTS.md` §2 那格当时停在"十二"，**两处对不上有一阵子了**，这一批各现数一遍才对齐）。⚠️ **这一层收的是"名字一段"或"目录一条"，不是整条路径**——前端手里的 `path` 是有损的（非 UTF-8 目录名会变成 `?`），详见下面 `nota_doc_rename` 那一节 |
| `commands/workspace.rs` | `nota_workspace_*` 四个命令 + `TreeNode` + 文件树遍历。⚠️ 2026-09-28 起 `tree` 多收一个 `TreeOptions`（排序 / 过滤 / 隐藏文件），并把 `show_hidden` / `tree_filter` 那两个死开关接上了线 |
| `commands/settings.rs` | `nota_settings_get/set/reset` ＋ `nota_settings_problem` ＋ `nota_settings_open_dir`（2026-09-25 由 `nota_settings_dir` 改名：**「打开」这一步也在宿主**，见 `docs/07` BUG-27）＋ `nota_app_lang`（2026-09-25 加：**前端 i18n 的唯一真相源**，返回 `AppLang { setting, effective, available }`——设置里那一格可能是 `auto`，前端要知道**实际生效**的是哪个；而 `available` **由宿主给**，前端不许自己列一份语言清单，那样多一门语言就要改两处） |
| `commands/theme.rs` | `nota_doc_themes` / `nota_doc_theme_css` / `nota_doc_themes_open_dir`（2026-09-25 由 `nota_doc_themes_dir` 改名，同 BUG-27） |
| `commands/ui_style.rs` | `nota_ui_styles` / `nota_ui_style_css` / `nota_ui_styles_open_dir`（2026-09-26 新增）——**界面风格**那三条，与 `commands/theme.rs` 一一对应、同一套口径（id 不是路径；"打开"在宿主做；目录用到时才建） |
| `commands/plugin.rs` | `nota_plugins_list` / `set_enabled` / `call` / `find_command` / `panels` / `panel_content` / **`review`** / **`review_close`** / `menus` / `install` / `uninstall` / `trust` / `trust_list` —— **13 条**（2026-09-25 多了装卸信任那四条；随后又多了 `review` 两条：**编辑区里摊着的那块面板**）。⚠️ **异步的是这五条**：`set_enabled` / `install` / `uninstall` / `call` / `panel_content`（都要跑 Lua 或解包，走 `spawn_blocking`）；⚠️ `review` / `review_close` 拿的是 `ReviewState`，**不碰 `plugins` 锁**——理由见 `docs/01` §第四条链路 |
| `commands/export.rs` | 导出与打印的**落盘那一步**（**四条**：`nota_export_write` 写文本、`nota_export_write_bytes` 写**二进制**——前端先 base64、宿主解码再落盘，分享卡存 PNG 走它、`nota_export_print` 写到 `.nota-print.html` 再交给系统默认程序、`nota_export_reveal` 在文件管理器里定位）。⚠️ 本题**不生成 HTML**——HTML 由前端生成（`editor/export.ts`），这一层只管 IO 与落点 |
| `commands/pandoc.rs` | `nota_pandoc_probe` / `nota_pandoc_export` 两条，**都异步**（探测起进程、导出最长 180 秒，走 `spawn_blocking`）。⚠️ PDF **两条路**：pandoc 不通且 `pdf_print::available()` 时改走自带那套，返回值 `route` 说明走的哪条 |
| `commands/focus.rs` | 强制专注那**六条**（2026-09-26，95 行）：`nota_focus_get` / `_start` / `_stop` / `_ack` / `_beep` / `_close_alarm`。⚠️ **无判据层**：只转给 `focus::*`、再 `广播`一份，规则一条都不在这儿（判据全在 `focus/mod.rs`）。⚠️ 在 **`FocusState` 与 `AppState` 两份**托管状态上操作（设置在后者）。⚠️ `close_alarm` 是给调试和退出用的，**前端一个调用点都没有**——前端明说了不自己关窗，收窗靠 `alarm::对账` |
| `format_keys.rs` | **捕获相位的键盘控制器**（2026-09-28 新建，**210 行**）：**只在 Linux 装上**，在 `Builder::on_page_load` 里挂 `EventControllerKey`，命中 `Ctrl+B` / `Ctrl+I` 就发一条 `nota:format-key` 给前端（走和 keydown **一模一样**的那份判据——「加粗」是套 mark 还是别的写法，那份知识在前端）。⚠️⚠️ **2026-09-29 实测：这一层在真程序里一次都没拦到过键，与没装等价**（`NOTA_DEBUG=1` 下 4 次 `Ctrl+B` ＋ 1 次 `Ctrl+I`，日志里只有「已装上」、**0 条「拦到」**）。**BUG-49 / BUG-53 的真凶与真修法都在前端**：`Mod-b` / `Mod-i` 被绑了**两次**（上游 `strongKeymap` / `emphasisKeymap` ＋ 本仓菜单表的 `fmt.bold` / `fmt.italic`），两条命令都是 **toggle、跑两遍正好抵消**，看起来就是「按了没反应」；修法是 `ui/useMenus.ts` 那条 `window` 监听第一句加 `if (e.defaultPrevented) return;`（ProseMirror 的监听挂在 contenteditable 上、比 `window` 早）。⚠️ 当年那句「WebKitGTK 在派发给 DOM 之前就把这两颗键吃掉了」被两条实测推翻（最小复现里网页侧收得到 `key=b ctrl=true`；真程序里那个 `window` 监听也收得到）。⚠️ 这一层**目前留着**，**「删还是留」是待拍板项**（删它要连着动 `lib.rs` 的 `on_page_load`、前端那条 `nota:format-key` 监听、`ipc.ts` 的频道名和几份文档）。⚠️ 留在纸面上的两条仍然成立：**只在 Linux 装**（macOS / Windows 上这两颗键本来就到得了 DOM，装了会和 `ui/useMenus.ts` 那条 keydown 撞成执行两遍）、**挂点是 `on_page_load` 不是 `setup`**（那个钩子每加载一轮页面跑一次，所以里面有一道 `AtomicBool` 幂等闸）。⚠️ `gtk` 那个 crate 得显式开 `features = ["v3_24"]`。整篇论证在文件头、账在 `docs/07` 的 BUG-49 / BUG-53 |
| `pdf_print.rs` | **Nota 自带的 PDF 排版**（= 用 WebKit 静默印一份 HTML），**只有 Linux 有**；pandoc 那条路不通时兜底。⚠️ WebKitGTK 2.52 **没有导出 PDF 的 API**，只能走打印系统 |
| `pandoc.rs` | **借系统里那个 pandoc 导出七种格式**（PDF / Word / RTF / EPUB / LaTeX / ODF / OPML，2026-09-25）。⚠️ **不自带、不下载、不替用户装**，只探测（形状照抄 `slidev_probe.rs`）；⚠️ **不存路径**，每次现探；⚠️ 正文走 **stdin**、`cwd` 与 `--resource-path` 都指向文档目录；调试口子 `NOTA_PANDOC_CMD` |
| `pandoc_format.rs` | 上面那七种格式的**词汇表**（2026-09-25 从 `pandoc.rs` 拆出，那边当时 985 行）：`Format` 及其 `from_id` / `to` / `id` / `extension` / `名字` · `ALL` · `FormatInfo` · `格式表()`。⚠️ **全仓只有这一份**——菜单 id、`pandoc --to=` 的名字、存盘后缀三处对不上就是「对话框说存 `.tex`、文件却是 `.latex`」 |
| `devserver.rs` | **开发服务器：宿主替插件起一个本机进程，再把地址交给界面**（2026-09-25 从 `slidev.rs` 提出来，判据是**归属**不是行数）：挑空闲端口 · 写入口文件 · 起进程（自成进程组）· 探端口通没通 · 杀整棵进程树 · 日志环（最后 30 行）· `填_frame`（把地址填进面板的 `frame` 块）。⚠️ **一条命令都不注册**——发起那条路是插件的命令（`nota_plugin_call`）。⚠️ **能力放行的是清单里 `[devserver]` 声明的那一条命令**，不是"任意命令"（与 `process.git` 同一条判据）。⚠️ **一个插件最多一场会话**（`HashMap` 的键是插件 id）。⚠️ `start` **阻塞**（默认 180 秒等端口），这和它的前身**故意相反**：前身被同步命令调着，在那儿等就是冻界面。⚠️ 退出时 `RunEvent::Exit` → `stop_all()` 兜底（不收就是漏：子进程不在 Tauri 管理范围内，主进程一退它们接着跑）。⚠️ 2026-09-26 破 1000 行，**探测那一半拆去了 `devserver/probe.rs`**（「问」与「跑」是两件事）|
| `devserver/probe.rs` | **探测那一半**（2026-09-26 从 `devserver.rs` 拆出）：跑一次 `<命令> --version` 看装没装 · 项目根（及各层父目录）里有没有 `project_marker` · `need` 那条"这份文档还缺什么"（§下面「探测缓存」一节、`docs/13` §13.3b）。⚠️ **纯函数，不留状态、不起服务器**，和那一半的会话状态/`Drop`/日志环分得干干净净 |
| `proc.rs`（补充） | ⚠️ 2026-09-25 之前 `proc.rs` 是"从 `slidev.rs` 抽出来"的，现在那句话要改成"**从 `devserver.rs` 的前身抽出来**"——`slidev.rs` 已经不在了，但这一层的归属没变 |
| `heartbeat.rs` | **面板心跳**（2026-09-26，105 行）：声明了 `live = true` 的面板（`register_panel{ live = true }`），宿主**每秒**发一条 `EVENT_PANEL_DIRTY` 叫前端重拉——"实时"的全部机制就是这个。⚠️ **不给 Lua 加 timer** 是刻意的：那会把"插件被叫起来跑"换成"插件自己能醒来"，锁 / 线程 / 抛错 / 停用四条全要重定（`docs/12` §4.7a）。⚠️ 心跳**不是内容通道**（把这条事件整个丢掉，面板打开时显示的东西照样是对的）；⚠️ 只叫 `live` 的那几页（全叫的话 git 那种面板每秒起一个子进程）；⚠️ `plugins` 锁**只在取名单那一刻握一下**，绝不带进 `sleep`；⚠️ 裸 `std::thread`，退出靠 `Heartbeat::stop()`（`RunEvent::Exit`），最多晚一拍 |
| `plugin/mod.rs` | `PluginHost`：发现 → 加载 → 派发 → 停用/卸载的**入口**。装卸与签名那一段拆去了 `plugin/install.rs`（2026-09-25），`PluginInfo` / `PluginPanel` / `PluginMenuItem` 那批形状拆去了 `plugin/types.rs`（2026-09-29） |
| `plugin/install.rs` | 装卸一条龙：`装` / `装_检查完再搬` / `装_记账并加载` / `卸` / `信` / `信任表`；纯函数 `把包写进` / `搬进落点`（先把旧的挪开让位、失败要回滚）|
| `plugin/package.rs` | `.nota-plugin` 包（就是个 zip）：解包、算摘要、验 `[signature]`、给三种结论。**不打包也不签名**（作者侧在 `tools/pack-plugin.py` 里）；**只有「签名验不过」是硬拒**，没签名的照装 |
| `plugin/trust.rs` | **信任的签名公钥表**（TOFU，2026-09-29 从 `package.rs` 拆出）：`信任的钥匙` / `信任库`（`有没有` / `列` / `记下` / `记下不落盘`）/ `今天()` / `年月日`。⚠️ **签名的"是谁"全由这张表回答**，包里自带公钥——见下面单独一节 |
| `plugin/installed.rs` | 两个记账文件：`plugins.toml`（启用与否）与 `trusted-keys.toml`（TOFU 信任表）|
| `plugin/export.rs` | **把一个已装插件打回成 `.nota-plugin` 包**（2026-09-27，323 行）：`PluginHost::导出` / `导出默认名`。⚠️ 与 `package.rs` 那句"包是只读的"**不冲突**——那条管**造包**（作者侧、要私钥），这条管**把磁盘上已有的那份原样收拢**、一个字节都不签。⚠️ 包里**没有**插件设置与插件数据（它们本来就不在插件目录里，见 `paths.rs`）|
| `plugin/types.rs` | **插件对外声明的形状**（2026-09-29 从 `mod.rs` 拆出）：`PluginInfo` / `信任记录` / `PluginPanel` / `PluginMenuItem` / `PluginPrompt` / `ReviewKind` / `ReviewAction` / `ReviewState`。⚠️ `REG_*` / `EVENT_*` 留在 `mod.rs` |
| `plugin/manifest.rs` | `Capability` / `PluginMeta` / `Manifest` / `channel_id()`。⚠️ `SettingDecl` 那一段 2026-10-04 拆去了 `plugin/settings_decl.rs`（这里留 `pub use`，老路径照旧） |
| `plugin/settings_decl.rs` | **`[[settings]]` 那一格：插件声明、宿主画**（2026-10-04 从 `manifest.rs` 拆出，391 行）：`SettingDecl`（`key` / `kind` / `label` / `help` / `min` / `max` / `default` / `step` / `unit`）/ `check_settings()`（五条硬规矩）/ `夹紧()` ＋ `小数位()`。⚠️ 现在只有 `range` 一种控件；⚠️ 写了 `[[settings]]` **必须**同时申请 `settings.own`（反方向不报，AI 那种插件是正常的）。口径与"加一种控件要动哪几处"在 [docs/11](11-writing-a-plugin.md) §2.5 |
| `lua/mod.rs` | `HostContext` / `LuaPlugin` / `PluginState`；一插件一个 `Lua` |
| `lua/api/mod.rs` | `nota` 表的构造：按能力装表 |
| `lua/api/document.rs` | `nota.document` |
| `lua/api/fs.rs` | `nota.fs` + 纯函数 `resolve_in()`（工作区围栏） |
| `lua/api/git.rs` | `nota.git`，子进程跑 `git` |
| `lua/api/ui.rs` | `nota.ui`，**七个成员**：`notify`（推事件）/ `open_url`（**只认 `https://`**，唯一一个"让用户跳出 Nota"的口子）/ `register_panel`（含 `wide`）/ `register_menu` / `refresh` / `review` / **`stream`**（2026-10-04 加，第 58 项——后五个都在 `ui.panel` 之下）。⚠️ 面板/菜单**存** registry 供宿主拉；⚠️⚠️ **`stream` 是唯一的例外**：它**推内容**（事件 `nota:plugin-stream`），因为跑着的时候宿主握着锁、`refresh` 那条拉的路回不来（[docs/13](13-lua-api.md) §8.6） |
| `lua/api/diff.rs` | `nota.diff`：**改动块**的解析与应用（纯函数，不需要能力）。⚠️ 只解析与应用，**不碰文档**——写进去的是插件的事 |
| `lua/api/http.rs` | `nota.http`，**四个成员**：`request` / `get` / `post` / **`stream`**（2026-10-04 加）。⚠️ 阻塞（跑在 `spawn_blocking` 上）；`stream` 读一块交一块，**攒够一个完整 UTF-8 才交给 Lua**（`切出完整段`）。⚠️ 「连不上／超时／读断了」折成结果表 `{ok = false, error}` **返回**，只有「作者写错了」才抛（第 60 项） |
| `lua/api/json.rs` | `nota.json.decode`（2026-10-04 加）：**不需要任何能力**的纯解码表。⚠️ 成功给一个值、失败给 `nil, "原因"`（**不抛**）——「这段文本不是合法 JSON」是**环境**，插件该接得住。⚠️ **只解不编**：要发 JSON 走「`body` 写一张表、宿主当 JSON 发」那条路 |
| `lua/api/unified_diff.rs` | `nota.diff.parse_unified`（2026-09-25）：把 `git diff` / `diff -u` 的**标准格式**解析成同一套 `{path, added, deleted, lines}`。⚠️ 三条规矩写在文件头：只有 `diff --git` 之后的 `---`/`---` 才算（**光跑 `diff -u` 得到空**）、**不认上下文行**、路径依赖 `-c core.quotePath=false`。⚠️ 与 `diff.rs` 分开是因为**输入格式完全不同**（那边是插件自己和模型定的 `nota-diff` 围栏） |
| `lua/api/i18n.rs` | `nota.i18n`（2026-09-25）：`{app_lang, lang, ok, text(s)}`。**不要能力**——路径由宿主用**插件自己的目录**拼（`lang/<tag>.toml`），插件只交**键**；**键就是作者写下的那句原文**，取不到返回 `nil`。⚠️ **协商在加载时就做完**（`i18n::装`，在 `on_load` 之前），所以改语言要重启。⚠️ **`ok` 只看清单、不看文件**：声明了 `zh-CN` 却没放文件照样 `ok = true`（缺文件只退回原文、不把话说过头）。⚠️ `langs` 缺 `en` 是**拒载**，判据在 `plugin/manifest.rs` |
| `mcp/tools.rs` | 五个工具 `nota_info` / `nota_documents` / `nota_read` / `nota_write` / `nota_open`（2026-09-27，492 行）。判据只有一条：**这件事不经 MCP 做不到或很别扭**——AI 客户端自己就能读盘写盘，它做不到的是够到 **Nota 里正开着的那一份**。⚠️ 三个"想做但这一版没做"的（细粒度编辑那一类）如实写在它文件头 |
| `mcp/host.rs` | MCP 要用到的那几件**宿主能力**收成一个 `宿主` trait（2026-09-27，212 行）。⚠️ 抽 trait **不是为了"将来接别的宿主"（那是猜），是为了测得到**：真实现要 `AppHandle`、单测里建不出来。⚠️ 于是有条纪律：**工具里不许出现第二条"直接问应用"的路**，想让工具多做一件事就给它加一个 trait 方法，绕过 trait 直接摸 `AppState` 会变成"单测跑得到、真机上没人跑过"那半边绿 |
| `mcp/mod.rs` | **MCP 服务器**（2026-09-27，725 行）：stdio 上一行一条 JSON-RPC 2.0，四个方法 `initialize` / `ping` / `tools/list` / `tools/call`。⚠️ **三种下场一个命令**（`nota --mcp`，2026-09-29 改口径）：已经有 Nota 在跑 → 这一份只当管子（够到**用户正开着的那一份**）；一份都没跑 → **说一句"请先打开 Nota"、退出码 2**（⚠️ 原来这里是"自己开窗并服务 MCP"，那正是用户报的「不停新建窗口」，见 BUG-55）；别的进程连上来 → `single_instance.rs` 认出暗号（`MCP暗号`）交给 `服务流`。⚠️ 所以 `--mcp` 今天**不建窗也不抢单实例的位置**|

**前端 `src/`**

| 文件 | 一句话 |
|---|---|
| `main.tsx` | React 入口 |
| `App.tsx` | 外壳与状态编排。⚠️ `TopBar` / `TabBar` 2026-09-23 搬去了同名文件，本文件只剩 `App` 一个组件；⚠️ 2026-09-24 又搬走了**六块**（菜单判据与两个对话框的状态 → `ui/useMenus.ts` / `ui/useDialogs.ts`；导出打印、文档主题、命令转交 → `ui/useExport.ts` / `ui/useDocTheme.ts` / `ui/useEditorCommands.ts`；**插件三份清单 ＋ 跑命令 → `ui/usePlugins.ts`**），1118 → 916 → 918 → 926 → 941 → 960（2026-09-25：用户体验评估那一轮把状态栏 / 格式化工具栏的可见性搬去了 `ui/useChromeVisibility.ts`，同批加回一段"为什么不再是内存 state"的说明；搬之前是 934。当晚**命令行文件**那一轮把 `openPath` 挪到了"启动"effect 的上面、并在启动时开一次命令行给的文件）→ **892 行**（2026-09-25：**沉浸模式**那一轮又搬走三块——文档四件套 → `ui/useDocuments.ts`，剪贴板四件 → `ui/useClipboard.ts`，专注/全屏与 Esc 退出 → `ui/useImmersive.ts`，另有提示条宿主 → `ui/useToasts.ts`）→ **892 行**（2026-09-25 **导出那批**：菜单里多出「导出为」那七项，`App.tsx` 接上 `pandocGate` 浮层——没搬东西，只是接线）→ **899 行** → **926 行**（2026-09-25 **外观接线那一批**：把 `appearance` 里 6 个"存了值没人读"的字段接到行为上，其中界面主题与缩放两处搬进了 `ui/useAppearance.ts`；⚠️ 那一批**先涨到 934**，搬完才回到 926——**搬完要重数**，`wc -l`）。⚠️ **"搬了"≠"变小了"**：头两次搬完反而还在 916 行，因为同批又加进了格式工具栏与查找条的接线；所以**每次搬完要重数**（`wc -l`）→ **989 行**（2026-09-26 **插入图片那批**：接上 `ui/useImageInsert.ts`（对话框 / 粘贴 / 拖入三条路）与 `ui/ImageDialog.tsx` 的挂载——**这一批是涨不是缩**，⚠️ 已经进了软上限 WARN 区（≥900），下一批动它之前要先想清楚搬哪块）→ **975 行**（2026-09-27／09-28 那几批：侧栏「文档列表」那一页、语言翻转、菜单栏开关——**这几批都是净缩**，缩的是被删掉的那一页与它那一族菜单项／props）→ **932 行**（2026-09-28：⚠️ **这一批当时它 998 行，离硬线只剩 2**——加的是「关于」框重做与 `*` 自配对，只加不拆就会顶破，所以拆的是**两整档职责**：「关于」那一摊全进 `ui/AboutDialog.tsx`（`ui/useAbout.ts` **整份删掉**，状态并进 `ui/useDialogs.ts`）、强制专注那一整档（73 行）进 `ui/useFocusSession.ts`。⚠️ **又一次「搬完要重数」**：998 是 WARN 不是 FAIL，所以「反正还没 FAIL 就再加几行」这个念头是错的，见 `docs/09` §4） |
| `bridge/ipc.ts` | 调用后端的唯一出口 ＋ 事件名表（**只放"发生类"**）。⚠️ **类型定义 2026-09-26 搬去了 `bridge/types.ts`**（那天本文件 1035 行、顶破硬线），头部那行 `export * from "./types"` 让 16 个类型名照旧能从 `@/bridge/ipc` 引到，**调用点一处没改**。⚠️ 两个文件的分工是**"有没有副作用"**：`ipc.ts` 摸 `invoke` 与 `listen`，`types.ts` **一个 import 都没有**（纯形状） |
| `bridge/types.ts` | **所有跨边界的形状**（2026-09-26 从 `ipc.ts` 拆出）：文档 / 设置 / 插件 / 导出 / 图像。⚠️ **纯类型文件**——不 import `@tauri-apps/api`、不写运行时值，所以谁都能引它而不背上副作用。⚠️ **2026-09-27 又拆了一次**（本文件 1009 行、① 行数闸 FAIL）：事件载荷那四个去了 `payloads.ts`，拆完 **967 行** |
| `bridge/payloads.ts` | **事件载荷的形状**（2026-09-27 从 `types.ts` 拆出，69 行）：`NotifyPayload` / `PanelDirtyPayload` / `DocumentChangedPayload` / `FileChangedPayload`。⚠️ **拆的线**＝"命令的返回类型"（上面那份）vs"推过来的事件"（这份）——`events.*` 是**发生了一件事**，不是回答 |
| `editor/create.ts` | Milkdown 封装（**所见即所得**），对外只有 `EditorHandle`。⚠️ `readOnly` 选项是给分屏预览用的 |
| `editor/source.ts` | **源码模式**的编辑器：CodeMirror 6，对外只有 `SourceHandle`（十六条与 `EditorHandle` 同名同义，所以 `EditorPane` 两边通用）。⚠️ 它不是"高亮版 textarea"，也**不做任何规范化**。⚠️ 建编辑器时要**摘掉与界面快捷键撞车的 CodeMirror 默认键位**（`撞车键位`，2026-09-25；⚠️ **2026-10-04 那份名单搬去了 `editor/key-conflicts.ts`**，因为 BUG-58 正是"名单漏了一条"——搬出来才能被测试读到） |
| `editor/key-conflicts.ts` | **CodeMirror 默认键位里与本应用撞车的那几条**（101 行，2026-10-04 从 `source.ts` 拆出）：`撞车键位`（摘掉：`Mod-/` `Mod-i` `Shift-Mod-k` `Mod-z` `Mod-y` **`Mod-u`**）＋ `故意不摘`（`Alt-ArrowUp` / `Alt-ArrowDown`，应用侧那两条 handler 还没写）。⭐ **拆出来的理由是 BUG-58**：原来的名单只有人眼在看，漏了一条 `Mod-u`（CM 的 `undoSelection`，还带 `preventDefault` ⇒ 应用被放行 ⇒ **什么都不发生**，症状与"功能没做"一模一样，躲了四个月）。⚠️ 它**纯**（不 import CM、不 import DOM），所以 `tests/key-conflicts.test.ts`（**21 条**）能反过来拿 CM 自己那张表查这份名单。判据与两类症状（"两边都跑" / "被放行"）在文件头与 `docs/06` §5.43 ⑩、§5.47 |
| `editor/source-mark.ts` | **源码模式里"行内标记能不能摘掉"那个纯字符串判据**（2026-09-30 新建，BUG-57）：选中的文字已经带着同一对定界符（`**甲**`）时给出"摘掉"的改动与选区，否则给 `null`。⚠️ **它是纯函数、不 import CodeMirror**（所以 `tests/source-mark.test.ts` 能直接测）；`source.ts` 的 `切换行内标记` 只负责把结果派下去。⚠️ 返回值**有三种**（`null` / `"不动"` / `"摘"`），合并哪两个都会改坏用户正文——理由在它文件头 |
| `editor/caret-snapshot.ts` | **编辑器报给宿主的选区快照**（2026-10-04 新建，138 行，第 14 项）：`选区快照` 类型 ＋ 那支只读观察者插件（`选区快照插件(onSelection)`）。⚠️ **文件头那张量测表就是本文件存在的理由**：Markdown 字符偏移在块边界上**不存在**（列表项开头插字会多出 `- `、段落之间插字会多出空行），所以宿主拿不到"能拼字符串"的坐标系——插件能拿到的只有**选中的那段字**。⚠️ 插件自己**按快照去重**：PM 每敲一颗字都派事务，不去重就是每敲一颗字跨一次 IPC。⚠️ 类型**只借不给**：`bridge/ipc.ts` 是 `import type` 从这儿借的（搬进 `bridge/types.ts` 会让"桥"变成选区的定义者） |
| `editor/command-state.ts` | **光标状态**的只读观察者插件（`CommandState`）：在不在表格里、有没有选区、当前块是什么。⚠️ 喂给工具栏高亮与菜单的第二条判据。⚠️ **2026-09-27 起多一个 `hasHeadings`**：本表**唯一一处看整篇文档**的判据（话虽如此，只扫**顶层**，视野与 `extractOutline` 同一片），给「内容目录」那颗菜单项判亮不亮——判在命令里的话菜单会亮着、点下去没反应 |
| `editor/insert.ts` | 几条**非命令式**的编辑动作：`转成任务列表` / `清除格式` / `表格删行删列删表` / `插公式块`（2026-09-26 加）/ **`插目录`（2026-09-27 加）**。⚠️ `插目录` 走的是 `算目录块`（`editor/toc.ts`）＋ `找目录段`（本文件私有，只走**顶层**节点）：已有标记就**原地替换中段**，没有就插在光标那一层块之后——⚠️ **两份内容一模一样时返回 `null`（不派事务）**，否则每次点菜单都会往撤销栈里塞一步空操作。⚠️ 前三条用 `prosemirror-tables` 的**裸函数**、`插公式块` 自己建 `math_block` 节点并摆选区——**都不是 `callCommand` 打发得了的**，理由在那个文件头上。⚠️ 这一格原来写的是"插链接 / 插图片的节点构造"，那是**陈旧的**（2026-09-26 改对）：链接与图片 2026-09-24 起走 `callCommand(toggleLinkCommand / insertImageCommand)` |
| `editor/table-input.ts` | **表格的打字建表**（415 行）：敲出「表头行 ＋ 分隔行」当场变成真表格。⚠️ 上游 `@milkdown/preset-gfm` 那条输入规则**只认 `\|3x2\|` 这种速记**，标准 Markdown 表格语法一个都不认（敲出来是两行普通文字，`docs/07` 第 55 项 ①）——表格节点与存盘一直是好的，**缺的只有这条输入法**。⚠️ 判据照 `micromark` 的 GFM 表格扩展写，**与打开文件时用的是同一把尺子** |
| `editor/find.ts` | **查找/替换**：纯匹配函数 `在文本里找匹配` + ProseMirror 适配器 + 装饰插件。⚠️ **只读观察者**，高亮不进文档、不进撤销栈 |
| `editor/scroll-into-view.ts` | **把正文位置滚进视野**（2026-09-25，`07` 第 48 项）：`滚动到位置`（顶到视野顶部）/ `滚动到可见`（只求看得见）/ `找滚动容器`（**全仓唯一一份**，2026-09-25 从 `writing-modes.ts` 合并过来）。⚠️ **不用 `tr.scrollIntoView()`**——PM 读的是浏览器选区，点侧栏/查找条那一刻选区不在编辑器里，它会静默不滚（第一次点不动、第二次才动）。理由写在文件头 |
| `editor/writing-modes.ts` | **专注模式 + 打字机模式**：装饰（压暗兄弟块 / 当前行）+ 就近滚动。⚠️ 同上只读；两个开关**随时可拨，不重建实例**。⚠️ **2026-09-25 起专注模式只有一半在这里**——另一半是"把外壳收起来"（菜单栏/侧栏/插件栏/标签栏/状态栏），在 `ui/useImmersive.ts` 与 `styles/app.css` 的「沉浸模式」一节，两边合起来才是用户按 `F8` 看到的东西 |
| `editor/instant-render.ts` | 「光标所在块的 Markdown 标记淡化显示」那个 ProseMirror 插件 |
| `editor/mark-hint.ts` | **行内标记的提示**（245 行，2026-09-26）：光标落进**加粗**／*斜体* 时，把那两个 `**` / `*`**半透明画在那段文字左右两边**。⚠️ 与 `instant-render.ts` 的分工是**块级 vs 行内**：块级标记画在左边 56px 装订线里，行内没有装订线可用，所以是**另一份插件、另一条 CSS 规则**（`.nota-markhint`，在 `styles/marks.css`）。⚠️ 纯显示（`Decoration.inline` ＋ `::before`/`::after`），**不动 schema、一个字节都不写回**——用户要的是"看得见"，不是"能编辑 `**` 这个符号"（后者是 `docs/07` backlog 第 37 项）。⚠️ mark id 是 `emphasis` **不是** `em`（写错**不报错、只是不显示**）。⚠️ 只挂可编辑实例。用例 18 条在 `tests/mark-hint.test.ts` |
| `editor/atx.ts` | **「什么算标题」的唯一判据**（宽松/严格两套正则 ＋ `atxPrefix()` 这个给文本用的入口）。⚠️ 所有调用点都往这儿问（大纲、源码模式、标签页标题、正文装饰、回车成块），**别处不许自己数井号**（前缀长度是现算的）。📌 **2026-09-30 起正文那两处也走它**——宽松档 `#你好` 因此和 `# 你好` 并成一条路，见 `docs/05` §4.9c |
| `editor/heading-on-enter.ts` | **标题"回车才成块"**（2026-09-26，照 Typora）：上游 `wrapInHeadingInputRule` 是「敲下 `#` 后那个空格」的瞬间整段变 `heading`、`#` 被吃进语法；这里**按引用滤掉它**，改成回车那一下才转，`#` 从此**一直留在文档里**（由 `instant-render.ts` 画回装订线）。⚠️ 还管"行头退格把标题拆回段落"。📌 **2026-09-30 起还管正文那条标题装饰**（`算装饰条目()` / `建装饰集()`：**两档一律只加粗**，`#你好` 与 `# 你好` 走同一条路；井号后面那段文字挂 `.nota-heading-pending`，字号等到回车成块才跳）。⚠️ 判"写完了没有"靠的是**节点类型**（还是段落 ＝ 没写完），**不看光标在哪儿**——09-29 那版"正在写的那一段先不放大"当天就被用户推翻了（`docs/05` §4.9c）。⚠️ 全篇扫描走一套缓存（不缓存的话每按一次方向键要全篇走一遍） |
| `editor/export.ts` | **HTML 导出**：另起一个屏外只读 Milkdown 实例**摘它渲染出来的 DOM**（不是再写一遍序列化——那样宽松标题的显示、任务框都会在导出里丢掉），加外壳 + 限域主题 CSS。⚠️ **2026-09-27 起多两段**：① 摘掉 `data-type="html-block"` 里那对**目录标记**（`is 目录标记`）——`innerHTML` 会把标记里的 `<` 转义成 `&lt;`，留着的话导出文件里会出现**看得见的** `<!-- nota:toc -->`；② 给 `h1..h6` 补 `id`（用 `editor/toc.ts` 的 `锚点()`，与目录里那些 `#锚点` **同一份判据**），否则导出的目录点了不跳。⚠️ 用 `?inline` 复用编辑器自己那三份 CSS（`theme/base.css` ＋ `editor.css` ＋ `katex.min.css`），不是第二套样式表。⚠️ 摘零件**分两半**（2026-09-27）：装饰按 `nota-` 前缀洗掉，**容器要逐个登记**进 `整块删掉`——漏了就会跟着导出走。⚠️ 2026-09-25 起 `导出选项.title` 那段注释把 **「导出」与「另存为」的分界**写死了：导出产出的是一份**别的文件**，当前文档一个字节都不动 |
| `editor/lax-heading.ts` | 宽松模式认的 `#标题` 在**序列化层**的处理：**不给井号加反斜杠**（不加的话 `#你好` 存盘会变成 `\#你好`，那就是"自动修复"）。⚠️ **2026-09-26 显示那半边被删过一次**（用户原话「应该作为标识符的 `#` 不要变换位置和大小」），📌 **2026-09-29 用户改口要它按标题排**，装饰于是回来了——**但搬进了 `heading-on-enter.ts`**；📌 **2026-09-30 那份长相又被推翻一次**（用户要的是"和 `# 你好` 一样，回车才成块"，"按该级字号排"当天删掉，见 `docs/05` §4.9c）。⚠️ **本文件只剩 `不转义行首井号` 一个导出**（`create.ts` 引它进序列化扩展，`tests/math-view.test.ts` 第七组盖它）。⚠️ 文件本身**不能删**，删了 `#你好` 存盘就会被加上反斜杠 |
| `editor/task-list.ts` | 任务项复选框：`- [x]` 画方框、点它勾上、回车切出来的新项**不继承勾** |
| `editor/code-block.ts` | 代码块的 NodeView（语言选择器 / 复制 / 折叠）。⚠️ **第一个 `$view`**（第二个是 `editor/diagram-view.ts`，2026-09-26）。⚠️ 2026-10-04 起 `refractor/all`（507 kB）是**异步加载**（本模块顶层发起 `import()`，第 27 项）：首屏只留 common 62 种语言，全量表到了清下拉缓存；那个“冷启动第一帧遇长尾语言块先显示纯文本”的时序窗口写在加载块上。⚠️ 语言选择器的**外观**＝`appearance: none` ＋ 自画箭头（`editor.css` 的 `.nota-code-lang-wrap`），少一条在深色下就是**纯白的原生框** |
| `editor/diagram-view.ts` | **图表块的 NodeView**（726 行，2026-09-26）：默认**看图**、点一下才切成源码输入框，源码写回 `attrs.value`（`diagram` 是 `atom`，**没有 contentDOM 可给**，所以只能 NodeView 自己摆控件）。⚠️ 上游 `@milkdown/plugin-diagram` 的 `toDOM` 只有一句 `dom.textContent = code`——**全包没有一处**调 `mermaid.render`，所以"画成图"从来是留给宿主的。⚠️ 它是本仓**第二个 `$view`**（第一个是 `code-block.ts`）。⚠️ **2026-10-04（第 27 项）**：那个上游包**整个退役**——schema 换成 `editor/diagram-node.ts`（`图表规格`），“要的是 `$NodeSchema` 上的 `.node`”那句注释还在；mermaid 改**动态 import**（全仓唯一 import 点在本文件的 `渲染` 里），首屏拆出 `mermaid.core-*.js` |
| `editor/lang-picker.ts` | **代码块语言选择器**（341 行）：**自绘的下拉**，不是原生 `<select>`——HTML 规定 `<option>` 只能是纯文字，`<img>` / `background-image` 塞进去都不渲染，所以「连弹层里也要图标」这条要求**只能自己画**。⚠️ 代价是原生白送的键盘上下 / 打字跳转 / Escape / 点外关都得自己补，**并且 NodeView 销毁时必须把弹层摘掉**（挂在 `document.body` 上，不摘就一次留一个孤儿）。⚠️ 400 项**每次打开现建**，不常驻。⚠️ **2026-10-04 加了一道让路守卫**：`全局按键` 挂在 **`document` 的捕获阶段**，比右键菜单那一层（React，冒泡阶段）**先**收到键，于是 `Enter` 被它先收下（还顺手卸载了输入框）、`Esc` 把两层浮层一起关掉——现在开头一句 `if (document.querySelector("[data-context-menu]")) return;` 整个让开（实测帧与后果见 `docs/06` §5.54） |
| `editor/lang-icon.ts` | **`languageIcon(lang)` 的唯一入口**（271 行）：「先问真图、问不到回落徽章」这件事收在这一个函数里。⚠️ 徽章＝圆角小方块 ＋ 字母缩写 ＋ 该语言的代表色，**400 个语言 id 人人都有**（兜底是主路径不是边角：任何图标集都盖不全）；真图在 `lang-icons-real.ts` |
| `editor/lang-icons-real.ts` | **真图那一半**（276 行，2026-09-26）：93 颗彩色 logo，**逐字节**从 vscode-icons tag `v12.19.0` 搬来（MIT，`THIRD-PARTY.md` §6），抓取与核对在 `tools/fetch-lang-icons.sh`（`--verify` 拿 `SHA256SUMS` 对账）。⚠️ **那批 `.svg` 一个字节都不许改**（连"顺手调颜色"也不行），能一眼核对的前提就是这个。⚠️ 本文件少一个语言**不是错**——400 个 id 里绝大多数一辈子不会有人贴 |
| `editor/smart-punctuation.ts` | **智能标点**（2026-09-27）：`--` → `–` / `---` → `—` / `...` → `…` / `"` → `“ ”`，三档 `off` / `render` / `input`（默认 `input`）。⚠️ 它是 `MarkdownSettings` 里那六个字段**从 2026-09-24 起就没有过的消费者**（同"存了值没人读"那一类账）。⚠️ `render` 档**一个字节都不写**：`.nota-smart-hide`（原文压成 0 宽）＋ 一颗 widget 画替身。⚠️⚠️ **改之前先读 `是横线骨架行`**——没有它，敲 `---` 时第二颗减号就被换掉、分割线再也出不来。⚠️ **导出那条路不许传它**，分屏预览**要**传。判据 `tests/smart-punctuation.test.ts` **32** 条 |
| `editor/auto-correct.ts` | **自动更正**（2026-09-27）：一张固定的英文错拼表（四十来条）＋ 一条输入规则（只在词尾空格那一下动手）。⭐ 入表判据一条：**小写形式在英文里不是一个词**（所以 `cant`/`wont`/`wether`/`lets`/`its` 全不收）。⚠️ 不做语法检查、不做句首大写、不碰中文。判据 `tests/auto-correct.test.ts` **20** 条 |
| `editor/headings.ts` | **大纲抽取**（2026-09-27 新建，约 100 行）：`extractOutline` ＋ `OutlineItem` 从 `ui/outline.ts` **整段搬来**。⚠️ 理由是**依赖方向**——`src/editor/` 从不 import `@/ui/`，而「内容目录」（`editor/toc.ts`）与侧栏「大纲」页要同一份判据。两个消费者：`ui/Sidebar.tsx` / `editor/toc.ts`。⚠️ **2026-10-04（第 63 项）**：开头那段 front matter 的跳过改用 `editor/front-matter.ts` 的 `前置块行数()`——**判据只剩一份**（严的那份），“大纲藏的”与“编辑器藏的”不会再对不上；⚠️ 同批（第 32 项）把文件头那段“为什么不吃去抖镜像”的理据**改成了实情**：吃，这是取舍 |
| `editor/toc.ts` | **内容目录（TOC）的纯文本那半**（2026-09-27 新建，约 200 行）：`生成目录` / `锚点` / `算目录块` / `找目录` / `替换目录` / `是目录标记`。⚠️ 形状是**一段普通 markdown 列表**、两头用注释标记（`<!-- nota:toc -->` / `<!-- /nota:toc -->`）夹住——不是粒子节点，不必动 schema，源码模式里也看得见。⚠️ **它是快照**（再点一次 = 原地更新，不是实时跟随；理由在文件头）。⚠️ 编辑区里点链接**不跳**，导出的 HTML 里能跳 |
| `editor/emoji.ts` | **Emoji 短代码 ＋ 补全面板**（2026-09-27，约 924 行）：**503 条**短代码（十一个分类）＋ 一条输入规则（`:smile: ` ＋ 空格 → 😄）＋ 一颗挂 `document.body` 上的候选面板。⚠️ **一个开关管两件事**（`settings.editor.emoji_autocomplete`）——替换与面板都是"编辑器在用户的 emoji 输入上插手"，拆开只会让人"关掉一个还弹另一个"。⚠️ `输入规则正则` 是**导出常量**，测试拿同一条去核表里每一条短代码（防"面板选得到、永远敲不出来"的死行；量词 `{1,}`，因为表里有 `:x:` / `:v:`）。⚠️ **面板只画不改**（文档树一个字节都不动），坐标现算；鼠标 `mousedown` ＋ `preventDefault()`，键盘 `handleKeyDown`。⚠️ **`apply` 里先读 `tr.getMeta(emoji补全键)`**：上下键只改高亮、没改文档（不读 meta 就会被前缀重置回 0，症状"按 ↓ 没反应"）。⚠️ **只读实例不挂面板**。判据 `tests/emoji.test.ts` **32** 条 |

| `editor/image-attrs.ts` | **图片装载兜底**（2026-09-24，P0）：上游 preset 少写 `\|null`，不带 title 的图**装载时被整节点丢掉**（打开含图文档 → 存盘 → 图没了）。一个 `$remark` 插件，在 mdast 上把 `null` 抹成 `""`。⚠️ **只读实例也要挂**（导出、分屏预览） |
| `editor/math-macros.ts` | **physics 宏包的表**（2026-09-24）：108 条宏 + 每条一个可渲染样例，做成 KaTeX 的 `macros`；外加 `PHYSICS_EQUIVALENTS` 对照表（宏写法 vs 手写等价 TeX）。⚠️ 官方没有 physics，`katex-physics`（2019）**刻意没引**（无 LICENSE），表由 Nota 自己写。**能写与写不出来的逐条在 `docs/10` §11.1** |
| `editor/math-view.ts` | **公式能就地改 ＋ `$` / `$$` 半透明**（2026-09-26）：上游那两个节点是 `atom`、**一个视图都没有**，所以敲进去的字会被 `toMarkdown` 静默丢掉（源码在两处：`math_inline` 在**内容**里、`math_block` 在 **`attrs.value`** 里——写错哪一边不报错、只丢字；⚠️ 2026-09-27 起 `math_inline` **有** `attrs` 了，但那只是为了记「用了几个 `$`」，**源码仍在内容里**，见 `editor/math-delim.ts`）。⚠️ **不改上游 schema**；只读实例画上游 `toDOM` 那棵树。⚠️ 用例 **51** 条在 `tests/math-view.test.ts`（跑法见 `docs/06` §6.3）；2026-09-26 起那个文件也盖 `insert.ts` 的 `插公式块`；⚠️ 原第七组盖的是 `lax-heading.ts` 的**显示层**装饰，那天显示层删掉后**整组换成了 `不转义行首井号`**（38 → 41）；⚠️ **2026-10-04 加的第八组**（41 → 51）量的是**命令补全弹窗的接线**——那格弹窗挂进 `面板` 里、只读实例不挂、行内那档用 `span`、回车收下之后面板**留着**、Esc 第一下只收弹窗、点一条候选走同一个口子、`aria-activedescendant` 写在源码框上、**丢焦点只收弹窗（面板归选区管）**——最后一那条是**有意**把"弹窗归焦点、面板归选区"这条分界钉住 |
| `editor/math-input.ts` | **公式的打字规则**（288 行，2026-09-26；⚠️ **2026-09-27 起"敲的就是存的"**——两条规则各多带一个 `dollars` 参数，`$$x$$` 存盘还是 `$$x$$`，机制在 `math-delim.ts`，用例 **28** 条）：`$$x$$` 与 `$x$` 各一条，敲完当场变一颗 `math_inline`。⚠️ **上游那条 `mathInlineInputRule` 被按引用滤掉了**（`create.ts`，和标题的 `wrapInHeadingInputRule` 同一个手法）：它的正则认不出 `$$…$$`，用户敲到 `A$$bb$` 那一下尾巴就够匹配、当场变出「文本 `A$` ＋ 公式 `bb`」——**"行内 `$$…$$` 打不出来"的根因在这儿，跟解析器无关**（解析器本来就认）。⚠️ `$…$` 那条只剩**一道**守卫：前面紧挨着**还是 `$`** 就让开（⚠️ 2026-10-04 加过第二道"值紧挨着空白的不算公式"、**当天就整条撤回了**——它把 `$ \LaTeX $` 这种常见写法也判成了普通文字，用户拍板；两句判据都记在 `docs/05` §4.17 ⑦）。⚠️ **2026-10-04 同批还摘掉了上游的 `mathBlockInputRule`**（`/^\$\$\s$/`：「`$$` ＋**一颗空格**」就凭空建一块**空**公式），换成 `公式块回车`（`$prose` ＋ `handleKeyDown`，四条守卫）——上游那条自己的注释写着 "press **enter**"、实现却跟注释不符。用例在 `tests/math-input.test.ts`（**28** 条，第三、四组是这两件） |
| `editor/math-commands.ts` | **LaTeX 命令候选的那张表与四个纯函数**（435 行，2026-10-04，用户要的「加 LaTeX 命令补全」的**纯逻辑那一半**）：`建命令表(有physics)`／`找当场(源, 光标)`（从光标往前扫字母、前面**奇数颗**反斜杠才算命令头——`\\` 是换行不是命令头）／`挑候选(表, 词, 上限)`（**只做前缀匹配，不做模糊**）／`套用(...)`（光标落进第一个 `{}`）。⚠️ 手写一列 ＋ physics 那 216 条**从 KaTeX 的 `PHYSICS_MACROS` 推**（参数个数取 `#n` 的最大下标）；⚠️ **`\div` 两处同名**（手写表是除号、KaTeX physics 是散度），开 physics 时**后者顶掉前者**，代价是看不到「÷」那条提示。⚠️ `候选上限` **故意等于 `常用名` 的条数**（小了就有 `常用` 条目被静默截掉——写这一批时真踩过）。⚠️ **弹窗高度只认这一个数**：CSS 那边原来是按估算配了一条像素 `max-height`，目检量出只装得下九条，已删（BUG-63）。⚠️ **样本必须"单独立得住"**：留空串吃的是"跟名字一样"那条兜底，而 `\right` 离了配对的 `\left` 标不出来——KaTeX 把红字报错画进那一格（BUG-64），它的样本已改成 `\left. x \right)`。用例 **35** 条在 `tests/math-commands.test.ts` |
| `editor/math-suggest.ts` | **命令候选弹窗那一棵 DOM 树**（379 行，2026-10-04）：建元素、跟输入换内容、↑↓ 选、回车/Tab 收、点一条也收、Escape 只收弹窗。⚠️ **挂在公式自己的 NodeView 那棵树里**（绝对定位），不像 `lang-picker.ts` 那样挂 `document.body`——白拿主题变量、不必算屏幕坐标，而且**假 DOM 跑得动**（`tests/fake-dom.ts` 没有 `body`/`window`/`getComputedStyle`）。⚠️ 这一层**不碰文档**：算出来的新源码经 `收下后` 交回 `math-view.ts`，**键盘与鼠标走同一个口子**（早先键盘那一路漏喊了 `收下后`，症状是"按回车没反应"——测试当场抓到的，见 `docs/07` BUG-60）。⚠️ 行内那档用 `span` 建（整棵 NodeView 活在一个 `<span>` 里，`div` 是非法嵌套）。用例 **27** 条在 `tests/math-suggest.test.ts` |
| `editor/math-delim.ts` | **行内公式用几个 `$`，存盘照原样写回去**（419 行，2026-09-27；**2026-10-04 加第四格**，用户拍「保留 `$$`」）：`$$x$$` 存盘**还是 `$$x$$`**。⭐ **三处缺一不可、缺哪一处都静默失效**（不报错、屏幕上看不出变化）：解析那趟一个 `$remark` 插件照**源码偏移**数出开头几个 `$` → `math_inline` 规格**多一个 `dollars` 属性**（默认 1）＋ 两个 `runner` 搬它 → 序列化按这个数**选一条上游现成的处理器**。⚠️⚠️ **别拿 `mathInlineSchema.extendSchema` 改规格**（`plugin-math@7.5.9` 自带一份 `@milkdown/utils@7.5.9`，那份 `extendSchema` 会把节点**挪到 `nodesCtx` 末尾**，而它改的和顶层那份是**同一个 `nodesCtx`**），这里用顶层 `$nodeSchema` 重建。⚠️ 打字那条路**不走第一步**（`math-input.ts` 当场盖章），粘贴/拖拽落到默认 1（有意）。⚠️ **2026-10-04 的第四格 `不转义美元`**（BUG-59）：上游把**正文里每一颗 `$`** 都转义（`价格 100$ 起` ⇒ `价格 100\$ 起`），这一层放回来——判据是"这一段的 `$` 全在这一颗文本节点里"，见 §4.17 ⑥ 与文件头。用例 **47** 条在 `tests/math-delim.test.ts`。⚠️ **2026-10-04 还有过第五格 `收严公式`（"值紧挨着空格的 `$…$` 还原成正文"）——加了当天就整条撤回了**：它把 `$ \LaTeX $` 这种常见写法也判成普通文字，用户当场拍「整条撤回」。那 131 行已删干净，`create.ts` 那条链从四条回到三条，行为**回到上游默认（任何 `$…$` 都是公式）**；代价（所见即所得里存盘会把值两端的空格 trim 掉）与经过记在 `docs/05` §4.17 ⑦。⚠️ 它当初**顺带治好过** backlog 第 54 项那个例子（`价格 $100 和 $200 元`），撤回之后**那一项退回未修**；⚠️ **2026-10-04 晚第 54 项已另行修好**（`editor/math-currency.ts`，在**解析那一侧**，与这一格无关） |
| `editor/math-currency.ts` | **`$` 当钱写的时候不算公式**（283 行，2026-10-04，`docs/07` 第 54 项）：`价格 $100 和 $200 元` 原来会在屏幕上凭空冒出一块公式（**存盘字节原样**，只是看着不对）。⭐ **它包的是分词器，不是 mdast 那一层**——mdast 那层只有"上游已经配好的那一对"，算不出"配错了该退到哪里"，硬凑的典型后果是把 `50，公式 ` 吃进公式里；包在 tokenizer 上**退回正文 = 把这一对否掉**，剩下交给 micromark 自己重扫。⚠️ **口径不是 backlog 上原先记的那句**「`$` 后紧跟数字就不认」——那句话单独用会误伤真公式（`$2+2$ 和 $x$` ⇒ 第一颗被拒之后**它右边那颗顶上当开定界符**，`2+2$ 和 ` 整段成了公式），现在是**门槛 ＋ Pandoc 第 2、3 条**（门槛：开头只有一颗 `$` 且右边紧跟数字；过门之后要「闭的右边是数字」或「闭的左边是空白」）。⚠️ **`$ \LaTeX $` 连门都进不来 ⇒ 照旧渲染**（§4.17 ⑦ 那条撤回的口径一个字节没被碰）。⚠️ **挂法三件事少一件就静默失效**：从 `this.data("micromarkExtensions")` **现场取**上游那条 `mathText`（不自己 import `micromark-extension-math` 造一条）／包一层（影子里 **O(1)** 记下开头几颗 `$`、第一颗非 `$`、最后两颗）／把上游那条**按名字停掉**（`disable: {null: ["mathText"]}`，⚠️ 代价是我们自己那条不能叫这个名字，所以包装那份的 `name` 要去掉）。⚠️ **必须排在 `remark-math` 后面**（排在前面表里还没有上游那条，白挂）。⚠️ **已知差别两条**（用户拍板「写进已知差别、不要开关」）：改变已存文档的解析结果；`$100 和 200$ 元` 认不出来、**照旧是公式**。用例 **23** 条在 `tests/math-currency.test.ts` |
| `editor/inline-marks.ts` | **高亮 / 上标 / 下标 / 下划线**四种行内标记的整套（901 行，2026-09-27）：四颗 `$markSchema` ＋ `$remark` 解析标注 ＋ 各自的 `toMarkdown` ＋ 输入规则 ＋ 存盘那侧的 `handlers.text`。⚠️ 这四种在现代 markdown 里**都没有原生语法**（`==高亮==` 是扩展，另三个是 HTML 标签），所以**四层缺一层都静默失败**。⚠️ `标记规格` 里 **`标签`（PM mark 名／`CommandState` 的键）与 `html标签`（编辑区真正渲染的元素名）是两个东西**——原来一位两用会让编辑区渲染出 `<highlight>` 这种自造元素、并丢掉 `<sup>`/`<sub>` 自带排版（2026-09-27 拆开）。⚠️ 开关只有三个（`highlight`/`superscript`/`subscript`，来自 `MarkdownSettings`），**下划线没有开关**（有意）。判据 `tests/inline-marks.test.ts` **37** 条 |
| `editor/html-block.ts` | **块级裸 HTML 与 HTML 注释**（240 行，2026-09-27）：独占一行的 `<div>x</div>` / `<!-- 注 -->` 给一颗 `group:"block"` 的原子节点。⭐ **修的是真缺陷：整篇文档打不开**——`remark-parse` 把独占一行的 HTML 产成 root 的直属孩子，而 preset 的 `htmlSchema` 是行内节点（`preset-commonmark/lib/index.js:1510`）、`doc.content` 是 `"block+"`（`:414`）。**文件以一行裸 HTML 开头**就够了。⚠️ 行内的一个字节都不动（判据是"父节点在 `块级容器`（四种，穷举）里"）；⚠️ 编辑区**显示成源码**、不是渲染后的 HTML（真渲染要先重写 HTML 解析器，且编辑区是活文档、渲染等于让 `<script>` 跑起来）；**导出与打印不受影响**。判据 `tests/html-block.test.ts` **14** 条 |
| `editor/footnote.ts` | **脚注**（约 190 行，2026-09-27）：`脚注事务(state)` —— 一笔事务里插 `[^N]` 的引用、在文末补 `[^N]: ` 的定义、把光标落进定义里。⚠️ **节点与解析/序列化都是 `preset-gfm` 给的**，这一格缺的从来只是「从零插一条」；⚠️ 编号取「**最小未用正整数**」（删过之后补洞，不留洞），**源码模式引的是同一个函数**；⚠️ 两条 `null` 出口：没挂 gfm、光标在代码块里。判据 `tests/footnote.test.ts` **30** 条 |
| `editor/atom-space.ts` | **原子后面那颗空格**（2026-09-26，约 230 行）：WebKit 在**不可编辑的行内元素**（行内公式、图片、硬换行）后面插空格时会改用 **U+00A0 不换行空格**（怕被折叠），于是那颗 NBSP **成了文档里的字符**——不换行、看不见、用户没敲过。这里在**序列化**那一趟把它换回普通空格：包一层 **`handlers.text`**（`mdast-util-to-markdown` 的公开扩展点，`create.ts` 的 `.config()` 里与 `不转义行首井号` **套在同一份处理器上**）。⚠️⚠️ **前两版都是错的，都别重排**：① 拦在编辑器里（`handleTextInput`）会让那颗空格在**紧跟着的下一次编辑**里丢掉——单测全绿、真窗口丢字符；② 挂 `$remark` 插件是个**静默空操作**——unified 的 `stringify()` **不跑转换器**，而 Milkdown 的序列化器走的正是它。⚠️ 判据：**文本节点开头那颗 NBSP ＋ 前一个兄弟是行内原子**（`inlineMath` / `image` / **`break`**——⚠️ 硬换行是 `break` 不是 `html`），别处一律不动。⚠️ 代价：**编辑器里那颗字符仍然是 NBSP**（`Ctrl+F` 搜不到、复制带 NBSP），这是换来「空格不丢」付的钱。⚠️ **不是这次改动引入的**，是行内公式一直有的老毛病。用例 **19** 条在 `tests/atom-space.test.ts` |
| `editor/table-tab.ts` | **表格里的 `Tab` / `Shift+Tab`**（2026-10-04 新建，**264 行**，`docs/07` 第 55 项 ②③）：⚠️ 上游 `preset-gfm` 的 `tableKeymap` **已经绑了这两颗键**，本文件接的是上游那条命令**撂挑子**的两种现场——**最后一格 `Tab`**（旧行为是键落到 `indent` 手里、往格子里塞两颗**会写进文件**的空格 ⇒ 现在加一行、光标进新行第一格）与**第一格 `Shift+Tab`**（旧行为是键落到浏览器手里、**焦点静默飞出编辑器**，接着打的字落到别处 ⇒ 现在吃掉这颗键）。⚠️ **加行不用上游 `addRow`**（按 `tableRole` 找节点，而独立的表头行与 `table_row` 抢同一个 `"row"` 槽位、靠后者赢，真落到表头行上拼出来的是 schema 不合法的文档）——走 `行格类型`「先认名字、认不到才退回角色表」。⚠️⚠️ **"认键"得看 `keyCode`**：GTK/X11 把 `Shift+Tab` 送成 `ISO_Left_Tab`（`event.key` 是 `"Unidentified"`、`code` 也是空的，只有 `keyCode` 还是 `9`），只比 `event.key === "Tab"` 的那一版**单测 55 条全绿、到真窗口却是坏的**（`docs/06` §5.48 六个判官）。⚠️ 表格之外一律放行；**不改上游 `tableKeymap`**、**不碰源码模式**。⚠️ **58 条**在 `tests/table-tab.test.ts` |
| `editor/table-pipe.ts` | **行首那颗多余的反斜杠**（2026-09-27 新建，**276 行**）：`| 1 | 2 | 3 |` 这样一行正文，切一次模式回来就被加上一颗 `\`。⚠️ 那颗来自上游 `mdast-util-gfm-table` 的 unsafe 表（序列化器一行一行地写，看不见下一行是不是分隔行，只好一律转义）。⚠️ **判据 2026-10-04 换过**：老判据问"这一段会不会跨行"（两行同段时永远不成立 ⇒ 病复发），新判据问"**下一行长什么样**"——只有"下一行像分隔行"才把转义留下；`tableCell` 里一律不动。⚠️ 用户那句「表格出不来」的后半截**不在这一层**（那颗转义会被分词器吃掉、表照样成形），这一层修的是"文件里多出一颗用户没打过的字符"。⚠️ **39 条**在 `tests/table-pipe.test.ts` |
| `editor/text-handlers.ts` | **序列化时那一串套着的文本处理器**（2026-09-27 从 `create.ts` 拆出，75 行）：`文本处理器链(原文)` 把**七层**套起来——行首竖线 / **正文里的 `$`**（2026-10-04 加）/ 孤立波浪号 / **行首那两种不认识的语法**（2026-10-04 加，见下一行）/ 行首等号 / 原子后的空格 / 行首井号。⚠️ 拆的直接原因是加层之后 `create.ts` 到 1011 行、破了 1000 行硬线，但真正的理由是**这几层的理由、顺序的讲究、以及"只能挂 `handlers.text`、挂 `$remark` 是静默空操作"本来就是同一条知识**。⚠️ 测试里**必须自己把 `defaultHandlers.text` 传进来**——不传等于连上游的转义一起省了 |
| `editor/syntax-escape.ts` | **行首 `[TOC]` / `[!NOTE]` 这类语法别被加反斜杠**（2026-10-04 新建，约 70 行，`docs/07` 第 56 项那一族的收尾）：上游 unsafe 表里有一条 `{character: '[', inConstruct: 'phrasing'}`——**文本节点里每一颗 `[` 都转义**（"它可能起一个链接"），于是 Typora 的 `[TOC]` 存成 `\[TOC]`、GitHub 的提示块存成 `> \[!NOTE]`，**用户没打过那颗反斜杠**（与 `\#标签`、`\==重点==` 同一个病）。⭐ **判据的立足点是"解析期就配过对了"**：文档里只要有 `[TOC]: http://…`，正文里的 `[TOC]` 打开时**就是一条链接**（`link` 节点），压根走不到文本处理器——所以"能看见这个文本节点"本身就证明了没有与之配对的定义。⚠️ **只认行首**（`(^|\n)`；这两种本来就是块首语法）**且只认名字在册的**（`TOC`/`toc` ＋ 五种 `[!TYPE]`），**不做「凡是 `[` 都不转义」那种大赦**（那会把真链接、脚注引用与用户自己的转义一起放过）。⚠️ 代价：用户**特意**写的 `\[TOC]` 会变回 `[TOC]`（那颗反斜杠本来就多余，与 `\==重点==` 那条同性质，知情接受）。判据 `tests/syntax-escape.test.ts` **13 条** |
| `styles/applyTheme.ts` | 把**三条界面外观轴**写到 `<html>`。⚠️ **落点分两种，别记混**：`ui_style` / `ui_mode` 走 **`data-*`**（离散量，CSS 里按属性分块），`appearance.accent` 走**内联 `--accent` / `--accent-fg`**（连续量，1600 万色做不成选择器格子）——内联优先级高过那 16 格，所以一行覆盖全场；⚠️ **换档要 `removeProperty` 摘掉**，只写不摘会让上一档的残留一直盖着。⚠️ **文档主题不在这里，它连 DOM 属性都没有** |
| `styles/accent.ts` | **「主题色」的纯逻辑**（2026-09-26，约 140 行）：`parseAccent`（认 `#rgb` / `#rrggbb`，`#` 可省、大小写随便；认不出返回 `null`）、`相对亮度`（WCAG 线性化 sRGB，权重 0.2126/0.7152/0.0722）、`对比度`、`accentFg`、`accentVars`。⚠️ **`accentFg` 是「够不够亮」的阈值判定（0.25），不是「挑对比度大的那个」**——后者会跟出厂配色表里的 **15 对里 7 对** 打架，连 Adwaita 那对旗舰 `#3584e4` 都在内；0.25 是从出厂值的两个极端（`#e95420` L=0.238 / `#208fe9` L=0.258）**反读出来**的。推导与那条「白字最低 3.65:1、低于 WCAG AA 正文线」的代价写在 `docs/03` §5.2b。⚠️ **它不认识的值一律当「跟随风格」**——不报错、落盘也不清洗（和 `ui_style` 同一个口径）。用例 **14** 条在 `tests/accent.test.ts` |
| `styles/theme.css` | 两条界面轴的变量表（**8 风格 × 2 明暗 = 16 格**；`yaru-blue` 与 `yaru` 共用形状段）。⚠️ **只管外壳**；`--find-hit` / `--find-current` 是 2026-09-24 为查找高亮加的。⛔ `--font-ui` 不许有衬线、`--font-doc`（可以是衬线）只有正文能引——用户 2026-09-24：「绝对不要用衬线字体做UI字体」，机器判据在 `tools/doc-sync-check.sh` ⑥。⚠️⚠️ **2026-09-26 起这份文件本身只剩 51 行 `@import`**：它当时 1117 行、顶破 1000 行硬线，于是**就地按职责拆成四份**放在 `styles/theme/` 下。**名字没换**（`main.tsx` import 的还是它），所以全仓三十来处「见 `theme.css` 的某个变量」的注释都还成立；⚠️ **四份的加载顺序不能调**，理由在它自己的文件头 |
| `styles/theme/base.css` | 拆出来的第 ① 份（244 行）：`:root` 的**风格无关**量（字号、三套字体栈、栏宽、`--toolbar-height`、时长/缓动、`--z-popup`）＋ `:root, [data-ui-mode="light"]` ＋ `[data-ui-mode="dark"]`。⚠️ 新加的三族控件量也在这里，值是**逐字节等于**改动前的写死值（`--btn-bg` 三态 + `--btn-border`、`--switch-w/h/knob/travel/on/off/knob-bg`、`--material-bg/blur/saturate`）——所以另外七套风格的观感**一格都没动**。⚠️ `--switch-travel` 是**算出来的不是挑出来的**（公式写在那一行上面） |
| `styles/theme/shape.css` | 拆出来的第 ② 份（250 行）：轴一，**八档风格的形状**——圆角三档、`--control-height`、`--spacing`、`--toolbar-height`、`--toolbar-shadow`、`--btn-font-weight`、开关四值、`--material-blur` / `--material-saturate`、`--press-scale`，以及换字体栈的三档。⚠️ **必须排在 `base.css` 之后**：两处的选择器权重都是 (0,1,0)，靠"后来居上"决胜，调换顺序会让**所有风格的圆角与控件高静默失效** |
| `styles/theme/color.css` | 拆出来的第 ③ 份（485 行）：轴一 × 轴二，**16 段**两属性颜色块（8 风格 × 明暗），一格不缺。⚠️ `--btn-*` / `--switch-*` / `--material-bg` / `--shadow` 都在这 16 段里给值；每个暗色块还必须给 `--doc-bg` / `--doc-fg`（不给的话正文那一块会跟外壳裂出一道色缝） |
| `styles/theme/extras.css` | 拆出来的第 ④ 份（158 行）：**变量表达不了的那几件事**，全文唯一带组件选择器的一份——材质那一段 `@supports (backdrop-filter…)`、macOS 菜单蓝底与按下缩放、菜单进场动画、标题字距、`prefers-reduced-motion`、`prefers-reduced-transparency`。⚠️ **必须最后加载**（它要盖住的正是前三份定下来的值）。⚠️ 材质与"减少透明"两张名单 2026-09-26 从「只有 macos」扩到**四个材质风格**（macos / plasma / windows / windows10）；**Yaru 与 Yaru Blue 故意不在名单里**——它们那两份稿子写明"不透明、不做模糊" |
| `styles/icons.css` | 搬来的图标（`src/assets/icons/`，96 个，来路见 `THIRD-PARTY.md` §5）怎么画：`.icon` 用 `mask-image` 取形状、`background-color: currentColor` 上色（所以 SVG 里写死的 `fill` 不参与渲染）、`.icon-missing` 画虚线框、`.btn-with-icon` 补图标与文字之间的 `gap` |
| `styles/app.css` | **外壳骨架**（225 行）：全局 reset、窗口骨架、沉浸模式、工具条、按钮原语。⚠️ 2026-09-29 按功能拆成五份（骨架 / 菜单栏 / 两条 / 主页 / 提示条），**它必须是第一个加载的**（reset 是别人的底子） |
| `styles/menubar.css` | **菜单栏**与弹层（194 行，2026-09-29 从 `app.css` 拆出） |
| `styles/tabs-status.css` | **标签栏与状态栏**（**231 行**，2026-09-29 拆出）。⚠️ `.tab-menu-anchor` 在这里，尺寸必须是 0。📌 **2026-09-30 下栏照 Typora 重做**：这两条**挂进了 `.app-main`**（原来排在 `.app-body` 外面、横跨整个窗口宽，正好占了侧栏底下那一段——用户要的「注意下方变化」就是「侧栏通到窗口底」）；同批删掉 `.status-mode` / `.status-strict` / `.status-dirty` 三条规则，加了 `.status-btn`（两颗 20×20 的开关，`[data-on]` 用**文字色**点亮而非底色——底色被悬停占了）与 `.status-count`。⚠️ **同日晚又加了四组**：`.status-aux`（`opacity: 0`，由 `.statusbar:hover` 与 `.statusbar:focus-within` 打开——用 `opacity` 而不是 `display:none` 是为了键盘也走得到）、`.status-count-group`（`gap: 2px`，比 `.status-right` 的 12px 小得多：这三样是一件事）、`.status-menu-anchor`（同 `.tab-menu-anchor` 的零高度 `fixed` 锚，**唯一不同是往上弹**）与 `@keyframes menu-popup-in-up`。⚠️ **2026-10-04 加了 `.statusbar-close`**（第 49 项那颗 ×）：**只覆盖颜色两项**（`--fg-faint` / 悬停 `--fg`），尺寸与悬停底色全走 `.status-btn`——**四栏那四颗 × 同一套长相**。见 `ui/StatusBar.tsx` |
| `styles/home.css` | **主页**与「最近打开」（170 行，2026-09-29 拆出） |
| `styles/toast.css` | **提示条**（165 行，2026-09-29 拆出）。⚠️ `z-index: 80`：菜单之上、确认框之下 |
| `styles/sidebar.css` | **左侧栏**（**337 行**）：栏本身 + 文件树 + 大纲。2026-09-24 按 1000 行规矩从 `app.css` 拆出（折叠三角进去之后超了）。⚠️ 拆的线是「**栏里的那两棵树**」：文件树与大纲的折叠（转三角、缩进、按祖孙链隐藏）是同一套写法；右侧插件栏**不在这里**。📌 **2026-09-30 加了三块**：`.sidebar` 上那行 `position: relative`（右缘把手 `SidebarResizer.tsx` 的定位基准）＋ `.sidebar-resizer`（**命中区 6px、线只有 2px**；悬停/拖动才显形；`z-index` 要压过文件树的行，不然「看着有、点不着」）＋ `body.resizing-col`（整窗口 `col-resize` ＋ 禁选中）。📌 **2026-09-30 深夜再加第四块：开合那 160ms 的小动画**——`.sidebar` 上 `overflow: hidden` ＋ `transition: width 160ms ease, border-right-width 160ms ease`，新类 `.sidebar-collapsed { width: 0; border-right-width: 0 }`，`.sidebar-head, .sidebar-body` 补 `min-width: var(--sidebar-width)`，`body.resizing-col .sidebar { transition: none }`（**拖动那一路不许有阻尼**）＋ 一段 `@media (prefers-reduced-motion: reduce)`。⚠️ **只动 `width`、不动 `transform`**：这一栏在 flex 行里，`translateX` 滑出去编辑区不跟着变宽，中间会留一条空白 |
| `styles/overlay.css` | **浮层那一族**（313 行，2026-09-27 按 1000 行规矩从 `app.css` 拆出——加了 Emoji 选择框之后那份 1040 行）：确认框 / 输入框 / 插图框 / Emoji 选择框 / Emoji 补全面板。⚠️ **四个框必须待在同一个文件里**（共用遮罩与层叠顺序，"两个框一起冒出来时谁盖谁"要有唯一答案）。⚠️ **必须在 `app.css` 之后加载**：`.emoji-cat` 要盖掉 `.btn` 的内边距，靠"后来居上" |
| `styles/bars.css` | **两条横条**（格式工具栏 + 查找条）的样式，2026-09-24 按 1000 行规矩从 `app.css` 拆出（那时 `app.css` 880 多行，正在往 931 涨）。⚠️ 拆它们是因为它们**贴着编辑区、跟着编辑模式走**，而 `app.css` 里那些是外壳骨架。⚠️ **2026-10-04 加了 `.format-bar-close`**（第 49 项那颗 ×）：`position: sticky; right: 0` ＋ 不透明底色（粘住的元素要盖住从它底下滚过去的按钮） |
| `styles/editor.css` | 正文编辑区的壳与版式（346 行）。⚠️ 排版是**用 token 写的**——文档主题改 token 就能换掉，不用抢选择器权重。⚠️ 2026-09-29 拆成三份（外壳 / 行内 / 块级） |
| `styles/editor-inline.css` | 行内那一层（226 行，2026-09-29 拆出）：高亮、上标、下标、下划线、裸 HTML、脚注、智能标点仅显示 |
| `styles/editor-blocks.css` | 块级那一层（416 行，2026-09-29 拆出）：代码块、任务列表、表格与拖列宽、分隔线与引用 |
| `styles/marks.css` | **「标记半透明地画回来」那一族**（2026-09-26）：`.nota-srcmark`（`instant-render.ts`，块级标记，画在左边 56px 装订线里）＋ `.nota-markhint`（`mark-hint.ts`，行内 `**`/`*`，靠 `::before`/`::after` 画在字与字之间）＋ `.nota-heading-pending`（`heading-on-enter.ts`，"回车才成块"那段等待期的样子）。⚠️ **三块都在这一份里是有意的**：它们外观同源、永远要一起改（半透明程度、颜色、字重）；分散在 `editor.css` 与别处时，改一处忘一处就是"块级淡了行内没淡"。⚠️ 用它的是**三份插件**，不是 `instant-render.ts` 一个人的。⚠️ **必须在 `editor.css` 之后加载**（`main.tsx:33`）：`editor.css` 里有 `pre` / `li` 那些通用规则，标记这几条要盖住它们（同权重靠顺序） |
| `styles/doc-theme.ts` | **文档主题的限域注入器**：用 `CSSStyleSheet` 解析后把每条选择器收到 `.editor-pane` 之下。⚠️ `:root`/`html`/`body` 是**改写**成 `.editor-pane` 而不是加前缀——**这一步就是「文档主题碰不到外壳」的全部保证** |
| `styles/share.css` | **分享图那一块面板的皮**（61 行，2026-09-27）：`.panel-share` / `.panel-share-img` / `.panel-share-actions` / `.panel-share-note`。⚠️ **另开一份是因为 `dock.css` 当时 961 行、贴着 1000 行硬线**。⚠️ 卡片自己的配色**不在这里**——那张 SVG 塞在 `<img>` 里、继承不到任何 CSS 变量。⚠️ 要在 `dock.css` 之后加载（借那边的 `.panel-btn`） |
| `styles/heatmap.css` | **热力图那一块的皮**（83 行，2026-09-27）。⚠️ **另开一份是因为 `dock.css` 当时 971 行、顶着硬线**（同 `share.css` / `marks.css` 那两次拆）。⚠️ **列宽是弹性的**（`flex: 1`）：面板那一栏能从 260px 拖宽，写死像素的话拖宽之后整块图缩在左上角。⚠️ 格子深浅走 **`color-mix` 兑透明**、不写死五个颜色（兑透明才不会被底色的深浅两套吃掉） |
| `styles/ui-style.ts` | **用户导入的界面风格的注入器**（2026-09-26 新增）：塞进固定的 `<style id="nota-user-ui-style">`、**追加到 `<head>` 末尾**。⚠️⚠️ **故意什么都不改写**——`doc-theme.ts` 那边必须限域，这边正好相反（界面风格要改的就是整个外壳）；于是"同名覆盖内置"的**全部实现就是文档顺序**（后者胜出），一条冲突检测代码都不用写。⚠️ 没有解析也就没有校验 |
| `ui/useUiStyles.ts` | 用户导入的界面风格的**清单 / 注入 / 打开目录**（2026-09-26 新增，按 `useDocTheme` 的先例单独一个 hook：要问后端、是异步的）。⚠️ 判据是**"这一档有没有文件"**而不是"是不是内置八档之一"——用户放一个 `adwaita.css` 就是覆盖内置，那时 `data-ui-style` 仍是 `adwaita` 但那份 CSS 得取回来。⚠️ 清单是**状态不是事件**：运行期间丢文件不触发，要重开应用。⚠️ 取失败安静退回内置那套，但**必须真的把注入的那份撤掉** |
| `styles/themes/*.css` | 内置**三套**文档主题——`minimal`（极简）/ `adwaita`（Adwaita）/ `latex`（LaTeX）。⚠️ **2026-09-26 从六套换成这三套**（用户：「删掉所有默认主题」），旧 id（`paper`/`blueprint`/`mist`/`print`/`ink`/`pine`）在老机器上会**悬空**。⚠️ 按**普通文档 CSS** 写、**不带作用域前缀**，靠 `doc-theme.ts` 统一挂；每套必须自带一套 `--code-*` |
| `styles/diagram.css` | **图表块**（` ```mermaid `）的样式：源码框、渲染区、说明卡。⚠️ 渲染出来那张 `<svg>` 的宽度上限**主要不在 CSS 里**（`diagram-view.ts` 按 `viewBox` 自然宽取 `min(100%, 自然宽)`；只写 `max-width: 100%` 会让小图被容器宽度等比放大） |
| `styles/math.css` | **公式那棵树**（2026-09-26）：面板 / 半透明分隔符 / 源码框 / 渲染区三种 `data-state` / 说明卡。⚠️ 开合走**根上那两个类**（`.nota-math-editing` / `.nota-math-readonly`），别在 `.nota-math-panel` 上另写 `display: none`。⚠️ KaTeX 自己那份 `katex.min.css` 只管 `.katex` 那棵树 |
| `styles/settings.css` | 偏好设置框的**壳与版式**：框体 + 左栏那十一个分页 + 右栏「标签在左、控件在右」的行（479 行）。2026-09-23 从 `app.css` 拆出，同日晚些改成 VMark 那套版式；**2026-09-29 又按功能拆成三份** |
| `styles/settings-controls.css` | 设置框里的**控件原语**（297 行，2026-09-29 从 `settings.css` 拆出）：下拉、开关、滑块、单选、输入框、按钮排、明暗缩略图 |
| `styles/settings-widgets.css` | 设置框里的三块**专用小件**（234 行，2026-09-29 从 `settings.css` 拆出）：`?` 气泡、快捷键那一页 |
| `styles/dock.css` | **右侧插件栏的骨架**（256 行，2026-09-24 从 `app.css` 拆出，2026-09-29 又按功能拆成四份）：栏头、页签、栏内分区、面板容器、`frame` 块；左侧栏另在 `sidebar.css` |
| `styles/panel.css` | **面板内容块**（327 行，2026-09-29 从 `dock.css` 拆出）：`ui/PanelBody.tsx` 画的那一套（标题、字段表、列表、对话三块、语气色、错误块）——⚠️ 插件给的 JSON 的落点 |
| `styles/panel-data.css` | **面板里的数据块**（419 行，2026-09-29 从 `dock.css` 拆出；2026-10-04 加了记录卡那一族）：提交树（`kind = "graph"`）、曲线刻度（`kind = "chart"`）与**记录卡**（`kind = "cards"`） |
| `styles/plugin-list.css` | **已装插件清单**（176 行，2026-09-29 从 `dock.css` 拆出）：`.plugin-*` ＋ 已信任的签名者（`.trust-*`）。⚠️ 偏好设置「拓展」页穿同一套类名 |
| `styles/gate.css` | **「装没装」那类闸门面板**的样式（`.gate-panel` / `.gate-status` / `.gate-mark` / `.gate-facts` / `.gate-side`，2026-09-25 由 `slidev.css` 改名——用它的是**两个**面板了：pandoc 那个与插件里的预览那一个）。⚠️ **必须在 `app.css` 之后加载**：`.gate-panel` 要盖掉 `.confirm-dialog` 的 440px 宽度（同权重靠顺序） |
| `styles/diff.css` | **改动块**的样式（`nota-diff` 围栏与 `kind = "diff"` 那一块共用）：**删除＝红底＋删除线，插入＝绿底＋下划线**（用户 2026-09-25 定的原话）。⚠️ 颜色走 CSS 变量，两套主题各给一份 |
| `styles/review.css` | **编辑区里摊着的那块面板**（`.app-main[data-review]` 那一套）：正文**让位**（不是卸载）、预览区宽度、标题栏那两颗按钮 |
| `ui/TopBar.tsx` | 顶栏：品牌字 + 菜单栏 + 最右的「插件」开关。⚠️ **纯展示、零状态**（2026-09-23 从 `App.tsx` 拆出，当时那支文件 921 行）。`hideMenuBar` 的真假由**后端返回值**决定，不是平台 |
| `ui/TabBar.tsx` | 标签栏：脏标记 + 关闭按钮。⚠️ **纯展示、零状态**，也**不管"关之前要不要存盘"**——`confirmReq` 在 `App.tsx` 手上。⚠️ 2026-10-04 起 ←→/Home/End **挪焦点不切换**（`ui/useTablistKeys.ts`，第 50 项；切一次要重挂编辑器） |
| `ui/MenuBar.tsx` | 菜单栏（**七栏 ＋ 插件一栏**，见 `ui/pluginMenus.ts`）。⚠️ **只管「哪一栏开着」**，条目表在 `ui/commands.ts`，灰不灰由 `App.tsx` 的 `menuHandlers` 决定；弹层与子菜单在 `ui/MenuPopup.tsx`。⚠️ 「开着」还分**谁开的**（点开的 / 划过切过来的），两个文件各有一个 `点开的` ref——BUG-17 |
| `ui/MenuPopup.tsx` | 一栏的弹层 + 它飞出来的子菜单。⚠️ 子菜单必须 **portal 到 `body` + `position: fixed`**（父弹层要能滚，`overflow-y: auto` 会把 `overflow-x` 也算成 `auto`，飞出右边缘的子菜单会被裁成一条竖线）。⚠️ 2026-09-30 多了可选 `heading`（顶上那行小标题，**不是条目**、不占漫游序号），状态栏那个菜单用它 |
| `ui/context-menu.ts` | **右键菜单的纯表与纯判据**（2026-10-04 新建，270 行）：`判落点`（四档：编辑器/输入框/外壳/不弹）＋ 三份 id 数组（`剪贴图标`/`行内图标`/`块图标`）＋ `给行(位置, 开发模式)`（把 id 变成可画的行）＋ `整行灰` / `行内下一格`（**不绕回**）/ `表里全部id`。⚠️ **它不 import React**——这是它值得单独存在的理由（`tests/context-menu.test.ts` 直接 import 它，不碰 DOM）。⚠️ 四档的**先后**不是随手排的：`不弹` 在最前（标签栏自己认领了）、`输入框` 必须在 `编辑器` 前（公式源码框/图表源码框/代码块语言框都是 `.editor-pane` 里的 `input`）。⚠️ **2026-10-04 开窗口检补进 `这一档的灰(位置, 灰)`**：**输入框那一档一个都不灰**——那六条不走命令表，套菜单栏的 `disabledCommands` 会把"有实现、点得动"的 `edit.select` 画成灰的（灰名单的判据与两种后果写在那个函数的文档注释里） |
| `ui/ContextMenu.tsx` | **右键菜单那一层**（2026-10-04 新建，710 行）：上半 `ContextMenu`（**一个** window **捕获相位**的 `contextmenu` 监听：分流、`preventDefault`、派发 `menuHandlers[id]?.()`），下半 `ContextMenuPanel`（画那一份）。⚠️ 它是个**组件不是 hook**——一开始想写成 `useContextMenu()` 让 `App.tsx` 连 JSX 都不用加，错了：hook 返回的元素不会自己进树。⚠️ 「不弹」那一档**不许** `preventDefault`（TabBar 在冒泡阶段拥有它，捕获相位先跑，拦了就把它饿死）。⚠️ 关掉靠 `mousedown`（不是 `click`）＋ `resize`/`scroll`（`capture: true`），且必须跳过 `[data-context-menu]`（子菜单 portal 到 `body`，不跳过就会把自己点关）。⛔ 外观复用的是菜单栏那一套（`.menu-sub` / `.format-btn` / `roving` / `SubMenu`），**没有第二套浮层**。⚠️ **2026-10-04 开窗口检修的四处**：① `开着` 多一个 `落点` 字段（不能靠"现场非空"推——输入框档没有现场）；② 渲染时按落点挑灰名单（`context-menu.ts::这一档的灰`）；③ `还焦` **改成返回布尔**——焦点没还回去时 `execCommand("selectAll")` 会选中**整篇正文**，所以 `undo`/`redo`/`select`/剪切/粘贴五处调用点都先问这一句；④ 收起时按 `isConnected` 守卫着把焦点还给**右键前那个元素**（`.context-menu` 的 `z-index` 与图标行焦点圈两处在 `styles/menubar.css`） |
| `ui/useMenuTable.ts` | **菜单表 ＋ 运行时合成的「最近文件」那一层**（56 行，2026-10-04 从 `App.tsx` 搬出——那次是**为了腾行数**，`App.tsx` 当时 998 行顶着 1000 硬线）。⚠️ 它必须 `useMemo`：菜单表的**身份**是要交给原生菜单栏的，每帧重建就等于每帧往系统菜单推一遍。⚠️ `keys.overrides` 这一层**只叠在这一处**——它是全应用唯一一份对外发出去的菜单表，叠在这里，菜单显示 / 按键分发 / macOS 系统菜单 / 设置里那张快捷键表**一起**跟着变 |
| `ui/commands.ts` | 菜单的**条目表**（逐条整理自用户 2026-09-22 提供的截图）+ **快捷键的唯一真源**（`accel` 字段）。⚠️ 里面**故意没有** `implemented` 标志位。⚠️ **"唯一真源"这条 2026-09-27 之后要加一个限定**：用户改过的那几条存在 `settings.toml` 的 `[keys.overrides]` 里（差量），**有效键位 ＝ 这份表叠上那份差量**——叠的地方在 `App.tsx`（`菜单`），别在别处再叠一遍。⚠️ 「视图」那一栏**分两段**（2026-09-27 用户点名要的那条线：线上面"外壳上画出什么"、线下面"正文那一块怎么呈现"）；**2026-10-04（第 49 项）把 `view.statusBar` 与 `view.menuBar` 从下面那段挪了上来**（它们原来夹在「打字机模式」与「全屏」中间）。⚠️ 往这一栏加条目之前先想清楚它属于哪一组，`tests/bar-close.test.ts` 组三把这一段钉住了 |
| `ui/accel.ts` | 快捷键的解析/显示/派发：`parseAccel` · `accelSig` · `eventAccel` · `formatAccel` · `buildAccelIndex` · `isOutsideEditor`，⚠️ 2026-09-27 又加了 **`accelToText`**（录制出来的那一下 → **写回设置**的文本）。⚠️ 判 `e.code` 不判 `e.key`，理由见文件头。⚠️ **`accelToText` 和 `formatAccel` 是两件事，别合并**：后者在 macOS 上要出 `⇧⌘S`（那是**给人看**的），前者要出**哪台机器都读得回来**的 `Ctrl+Shift+S`（它是**存进 `settings.toml`** 的——存成 `⇧⌘S`，换到 Linux 上 `parseAccel` 认不出，这条快捷键会**静默失效**）。⚠️ 三种情况返回 `null`（调用方当"这一下不算数、继续等"）：光按修饰键；空格与加号（`parseAccel` 的词法里没有它们的写法）；**不带修饰键的单个可见字符**——⚠️ 这一条**不能**写成"必须带修饰键"，全仓默认键位里有 `F8`/`F9`/`F11` 三条不带修饰的，那样写会把它们判死 |
| `ui/nativeMenu.ts` | 把同一份 `MENUS` 翻译成后端要的原生菜单树（macOS 兜底）。⚠️ **不碰 `muda` 的语法**——那是纯 Rust 那边的事 |
| `ui/settings/SettingsDialog.tsx` | 偏好设置的**壳**：左栏（搜索 + 十一页 + 「完成」）+ 右栏内容。⚠️ 搜索是**就地过滤**（十页叠着渲染，每行自己筛），不是跳转。左栏十页的顺序在 `ORDER`，图标在 `SECTIONS`，名字在组件体里的 `页名` 表（三处都在同一个文件里，加一页漏了 `ORDER` 的症状是"这一页点不到"，不报错） |
| `ui/settings/primitives.tsx` | 偏好设置的原语：`SettingRow` · `SettingsGroup` · `Select` · `Toggle` · `Radio` · `TextInput` · `NumberInput` · `Range` · `ActionButton` · `HelpDot` · `Value` · `Note` · `SearchField` · `QueryProvider` / `useQuery` / `hits()`。⚠️ 过滤只有一处判据：`SettingRow`（与 `Note`）拿 `query` 调 `hits()`，比不中返回 `null` 不进 DOM，没有第二份索引；⚠️ 图标自 2026-09-24 起全部来自 `ui/Icon.tsx`，原先这里手写的那几枚已删 |
| `ui/settings/panes/` | **十一页**内容，一页一个文件（2026-09-24 从单文件 `panes.tsx` 拆出）：⚠️ 2026-09-27 现数：多出「**拓展**」一页（`ExtensionsPane.tsx`，见下），所以「十页」那句要改成十一页（`docs/09` §2.2 同批改了）。列出的十个是：`FilesPane` · `EditorPane` · `ImagePane` · `MarkdownPane` · `ExportPane` · `AppearancePane` · `DocThemePane` · `ShortcutsPane` · **`FocusPane`** · `GeneralPane`。⚠️ `FocusPane`（强制专注）是**核心功能的设置页，不是插件的**（用户 2026-09-26 原话「注意啊，这不是插件。这是核心功能」），顺序上插在「快捷键」之后（2026-09-27 又多了「拓展」一页，排在它后面）——通用那页是收尾的"别的都归不到一起"，而这一页是一整块有自己的账本的**有状态**功能，塞进收尾里不对。⚠️ 这一页**不显示会话状态**（余额、已响几次），那是每秒都在变的内存态，出口是状态栏那一格 `ui/FocusMeter.tsx`；设置页显示它会让整页每秒重画。`props.ts` 是十页共用的入参 `PaneProps` 与 `paneWriter`（`PageKey` 是手写的七张分页表名，不是 `keyof Settings`——理由见文件头）。⚠️ `STYLES` 表在 `AppearancePane.tsx`，写成 `Record<UiStyle, …>`，加风格时**编译期**就漏不掉。⚠️ 「保存 & 恢复」那一组下面那条**如实告知**的 `stg-note` 在 `FilesPane.tsx`：2026-09-25 起它**只标着「恢复未保存的草稿」与「清除历史文件记录」两条**（自动保存本身那天接的线，见 `docs/07` 第 20 项）——**别整段删、也别照抄成"三档全没接"**。⚠️ 那条 `Note` 必须留在**组内容区里**：`.stg-note` 落在组里才跨两栏对齐，摆到组外会变成整页宽、贴着最左边，看着像下一组的标题 |
| `ui/settings/panes/ExtensionsPane.tsx` | **「拓展」那一页**（2026-09-27 新建，275 行）：装 / 导出 / 卸载三件事一条行。⚠️ 与右侧「插件」栏的分工是**诊断 vs 管理**，两边共用 `usePlugins` 的同一份数据与动作（不然就是两份真相源）。⚠️ 三件事里只有**导出**是新做的，宿主那半在 `plugin/export.rs` |
| `ui/settings/panes/ShortcutsPane.tsx` | 快捷键一览，**2026-09-27 起可以在这一页改**（用户点名要的）。⚠️ 条目**从 `menus` 读出来**（`App.tsx` 那份、**已经叠过用户的覆盖**；`walkMenuItems` 深度优先 + `formatAccel`），不是抄一份静态表——**别改成 import 常量 `MENUS`**，那是出厂键位，用户改过之后它就不对了，而"这个键位现在是什么"正是这一页唯一要回答的问题。⚠️ **四条口径**：① 改的是**差量**（`keys.overrides`），整张表的真相源仍是 `ui/commands.ts`；② 冲突**拦在录制那一刻**（`buildAccelIndex` 那套"先到先得 ＋ 控制台警告"对写死的表够用，对这里不行——用户按下键被静默归了别人，他会以为改成功了，**界面在骗他**）；代价是**两条命令不能交换键位**（想换得先清一条），这是有意取舍；③ 列的**全部可绑定的命令**，不只是已经有键位的（否则没法给一条本来没键位的加键位），没键位的显示「未设置」；子菜单父项与合成条目（主题、最近文件）仍排除；④ 这一页**不标**哪条实现了哪条没实现，那个判据在 `App.tsx` 的 `menuHandlers` 上 |
| `ui/EditorPane.tsx` | 编辑区：按 `mode` 摆一到两个窗格（所见即所得 / 源码 / 分屏），管两类编辑器的挂载与去抖同步。⚠️ **分屏是单向的**：源码 → 预览，预览只读且从不回写。⚠️ 「正在准备编辑器…」2026-09-26 包上了 `t(...)`（此前是英文界面下少有的硬编码中文，由 `tools/i18n-check.sh` 第 ④ 栏报出来） |
| `ui/Sidebar.tsx` | 左侧栏两页（文件树 / 大纲）。⚠️ 开合与当前页都是 `App.tsx` 给的**受控**状态；**折叠状态**（哪个目录、哪个标题）反过来住在自己家里。2026-09-24 补了右上角的 × 与空态那颗「打开文件夹…」。⚠️ 2026-09-27 起「大纲」页的 `extractOutline` **从 `@/editor/headings` 取**（不是 `@/ui/outline`）——依赖方向没变，只是那一半搬了家。📌 **2026-09-30**：末尾多了那颗拖动把手（`ui/SidebarResizer.tsx`）＋ 一格 `onResize`（**只接「拖完了、就这个数」**，拖动过程不走它）。📌 **2026-09-30 深夜**：新增 `折叠?: boolean` 这个 prop——**不卸载、只加 `.sidebar-collapsed` 类**（原来 `App.tsx` 里是 `{sidebarOpen && <Sidebar/>}`，元素整个不在树上，没得动画），折叠时同时上 `inert`，免得 Tab 焦点与读屏跑进一条看不见的栏 |
| `ui/PluginDock.tsx` | 右侧插件栏（⚠️ 2026-10-04 起页签有 ←→/Home/End，`useTablistKeys`，第 50 项）：**页签式，一次只画一页**（2026-09-24 用户要求「一个拓展独占一页，两个不能同时开」）＋「插件」页的清单与"没有落脚处"。⚠️ **只拉活动页**——没显示的那几页连 `render` 都不跑（代价：切过去时现拉一次，慢接口会闪一下「正在读取…」）。⚠️ 面板**内容**不在它手里，内容由 `ui/PanelBody.tsx` 现拉现画 |
| `ui/pluginText.ts` | **插件在界面上那几句人话**（2026-09-27 新建，136 行）：来源 / 签名 / 语言 / 能力名 / 位置名。⚠️ 起因是同一句「自装 · 已验证」要在**两个界面**上出现（右侧插件栏 ＋ 设置里的「拓展」页），谁抄第二份，往后就是"改一处、另一处不动"，而那种不一致**不报错**。⚠️ **只有文案**（没有 JSX、没有状态、不碰 `api`）；⚠️ **全是函数不是模块级常量表**——模块级求值时 `t` 还没订阅，且 `tools/i18n-check.sh` 只数为字面量写出来的 `t(…)` |
| `ui/PanelBody.tsx` | **一张插件面板的身体**（2026-09-24）：拉 `nota_plugin_panel_content` → 交给 `panel-nodes.ts` 认形状 → 按白名单画。⚠️ 拉是**每次打开都拉**，不是缓存；`nota:plugin-panel` 那条事件只是"去重拉"的信号。⚠️ 2026-09-24 起多了三种块：`message`（一问一答，保留换行）/ `diff`（增删对照，**只画**）/ `input`（**面板里唯一的输入控件**，发出去＝调 `submit` 命令、参数 `{ [arg] = 输入 }`，跟按钮零区别） |
| `ui/panel-nodes.ts` | **面板 DSL 的形状判据**（2026-09-24）：`normalise` 把后端给的 JSON 认成**十六种**节点（`heading`/`text`/`fields`/`list`/`buttons`/`empty`/`separator` ＋ `message`/`diff`/`input`/`frame` ＋ `graph` ＋ `chart`/`heatmap`/`share`/`cards`），认不出的如实变成 `unknown`。⚠️ **形状校验只在这里**——Rust 侧只管"是 JSON、有上限"，不管形状。⚠️ `消息上限 = 20000` 与宿主那个 `面板文本上限` 是同一个数，改要一起改。⚠️ 形状的判据是那几份**能脱离 React 跑**的测试（记录卡那份是 `tests/panel-cards.test.ts` **37 条**、热力图那份是 `tests/heatmap.test.ts` **20 条**），其余多半只由 `tsc` ＋ 开窗看着 |
| `ui/pluginMenus.ts` | **把插件菜单项并进菜单表**（2026-09-24，backlog 第 42 项）：合成 id `__plugin:<plugin>:<command>`，插件那一列插在 `help` 之前。⚠️ **先到先得**的快捷键索引 ⇒ 内置永远赢（`docs/13` §8.3） |
| `ui/plugin-prompt.ts` | **「点之前先问一句」的统一入口**（2026-09-24）：菜单项的 `prompt` 与面板按钮的 `prompt` 两条路都汇进 `问参数`。⚠️ 取消 ⇒ **命令根本不调**（不是调一个空参数） |
| `ui/usePlugins.ts` | **插件那三份状态与四条命令**（2026-09-24 从 `App.tsx` 搬出）：清单 / 面板清单 / 菜单项 + 刷新。⚠️ 与 `ui/useMenus.ts` 同类——都是"从 `App.tsx` 搬走的接线层"。⚠️ `menus` 那个 `useMemo` 的依赖里有**语言**（2026-09-26 加） |
| `ui/FormatBar.tsx` | 格式工具栏（2026-09-24，`docs/07` 第 2 项）：一排按钮，**高亮读 `commandState`、点击走 `runCommand`**。⚠️ **没有自己的状态**——数据全从外面来。2026-09-24 起 9 颗按钮画图标（Folio 那套），另外 6 颗仍是文字字形（`H1`/`引`/`任`…，那套里没有对应的图）。⚠️ 悬停提示那张 15 个名字的 `TITLES` 表 2026-09-26 **从模块级搬进了组件体**并逐条 `t(...)`（留在模块级时英文界面下提示仍是中文）。⚠️ **2026-10-04 右端补了一颗 ×**（第 49 项）：`.format-bar-close`，`title`/`aria-label` 都是「收起格式工具栏」，回调是本组件的 `onHide` prop——⚠️ **它是这一排按钮里唯一不走 `runCommand` 的**（不是编辑命令，白名单里没有它），落点是 `ui/useChromeVisibility.ts` 的 `收起工具栏`＝`setChrome({ toolbar: "never" })`，**与菜单 `view.toolbarNever` 一个字不差**（`tests/bar-close.test.ts` 组二钉着）。⚠️ 它在 `.format-bar` **里面** ＋ `position: sticky`（那一条 `overflow-x: auto`，跟着滚就白加了） |
| `ui/Icon.tsx` | **界面图标**（2026-09-24）：`src/assets/icons/` 里那 96 个 Folio 图标（BSD-2，`THIRD-PARTY.md` §5）当**遮罩**用——`?url` 只把网址带进 JS，形状由 CSS 取、颜色由 `currentColor` 给。⚠️ 名字表手写 + 加载时核对文件在不在（写错一个字母，类型不报，界面上只是少一颗图标）；⚠️ `nota-` 前缀那几枚是**自画的**（`quote` / `task` / `keys` / `markdown` / `doc-theme` / `force-focus` / **`sidebar-toggle` / `sidebar-collapse` / `spellcheck` / `unfold-more`**），不受"搬来的文件不许改"约束；⚠️ 左栏那颗显式 `size={20}`（框里带字母的那两枚在 16 格下读不出来）。挑法与理由见 `docs/04` §2.9。📌 **2026-09-30 新画的四枚**都在下栏：侧栏开关的**两个状态**（关着＝空心圆圈、开着＝左向折角）＋ 悬停才出现的那两颗（`spellcheck` 的 `A✓`、`unfold-more` 的上下双箭头）。Folio 那 96 枚里**没有折角/箭头**这一类，最接近的 `folio-format-indent-less-symbolic` 是"减少缩进"，拿它当"收起侧栏"是把两件事画成一张脸 |
| `ui/FindBar.tsx` | 查找与替换条（2026-09-24，`docs/07` 第 4 项）。⚠️ 它是**显示端 + 输入端**，不是查找的实现：命中数一律是编辑器报上来的 |
| `ui/ConfirmDialog.tsx` | 自绘确认框（替掉 `window.confirm`）。**受控**：开与答案都由 `ui/useDialogs.ts` 给。⚠️ 2026-10-04 起**焦点夹在框里**（`ui/useModalTrap.ts`，第 50 项）——Tab/Shift+Tab 首尾互跳、`focusin` 兜底；Enter 走默认那条仍在本文件 |
| `ui/PromptDialog.tsx` | 自绘单行输入框（2026-09-24，替掉 `window.prompt`——它在 WebKitGTK 上**默认被关掉且静默返回 `null`**）。⚠️ 挂载即聚焦。⚠️ 2026-10-04 起焦点陷阱走 `ui/useModalTrap.ts`（第 50 项），它的 Esc **组字期间不接**（`isComposing`/229）——"Esc 绑输入框不绑 window"那条老口径原样成立，新增的那条 Esc 补的是"焦点在按钮上时"那个洞 |
| `ui/useMenus.ts` | **菜单与快捷键的接线**（2026-09-24 从 `App.tsx` 搬出）：三条判据 → `disabledCommands` / `menuChecks` / `usingNativeMenu`。⚠️ **2026-09-29（BUG-53）多接了一条判据：编辑器自己已经处理过的不再接手**——那条 `window` keydown 监听的第一句是 `if (e.defaultPrevented) return;`（ProseMirror 只要有一条 `handleKeyDown` 返回 `true` 就会 `preventDefault()`，而它的监听挂在 contenteditable 上、比 `window` 早）。少了这一句，`Mod-b` / `Mod-i` 会被上下两处各跑一遍，而两条命令都是 toggle、正好抵消 = 「按了没反应」。⚠️ 推原生菜单那个 effect 的依赖里有**语言**（`use语言()`，2026-09-26 加） |
| `ui/useDialogs.ts` | **两个自绘对话框的"谁在等答案"**（2026-09-24 从 `App.tsx` 搬出）：两个 `useState` + 两个 resolve ref |
| `ui/useExport.ts` | **导出与打印的接线**（2026-09-24 从 `App.tsx` 搬出）：取正文 → 取主题 → 生成 HTML → 问落点/交给系统 → 报结果。⚠️ 正文**必须从编辑器拿**（`doc.text` 是 300ms 去抖后的镜像）；主题取不到**不算失败**。⚠️ 2026-09-25 起多了**借 pandoc 那七种**（`导出为(id)` + `pandocGate`）：**先探测再决定**，`ready` 直接进保存对话框、`missing`/`unknown` 才出面板；⚠️ 默认落点三档，且**与「另存为」不是一回事**（那个换的是这份文档自己的路径） |
| `ui/useDocTheme.ts` | **文档主题的应用/切换/打开目录**（2026-09-24 从 `App.tsx` 搬出）。⚠️ 与界面主题的 `applyTheme` **分开**：那条是同步写属性，这条要取回来 + 限域，节奏不一样。⚠️ 2026-09-25 起多一层**槽**（`useDocThemeSlot`）：`appearance.dark_theme_separate` 打开后深色下生效的是 `dark_document_theme` 那份，于是「读哪份」与「写哪份」必须同源；两个纯函数导出给设置页显示用。⚠️ 2026-10-04（第 41 项）：`主题接线` 多一格 `重扫`，「打开主题文件夹…」**成功回来之后**调它（`App.tsx` 接 `api.theme.list().then(setThemes)`）——清单重扫后取 CSS 那个 effect 会跟着重跑（`themes` 本来就在依赖里）；**不做轮询** |
| `ui/useAppearance.ts` | **「外观」几条轴的接线**（2026-09-25 新增，从 `App.tsx` 搬出）：界面风格/明暗/主题色一起落进 `<html>`（`applyTheme` 的退订要交出去，BUG-7）＋ 缩放落到 webview（转 `ui/useZoom.ts`）。⚠️ **2026-09-27 起它有返回值**：`useZoom` 交给它的**缩放那三档的动作**（放大/缩小/实际大小），原样转给 `App.tsx` → `ui/useCommandTable.ts` → 菜单与快捷键。⚠️ 转出去的是**同一个对象**、不再拼一层，因为它的身份是稳的（`useMemo` 过）——这正是剪贴板那四件必须拆开、这只不必的区别 |⚠️ 几条轴落点不同却同属一页，合在一处是为了"改外观页时知道代码在哪"。⚠️ `[appearance]` 那半张表（`accent` 就在里面）与文档主题**都不在这里** |
| `ui/useZoom.ts` | **界面缩放 ＋ 界面字号 ＋ Ctrl+滚轮 ＋ 键盘那三档**（2026-09-25 新增；**2026-09-26 加了第二档**；**2026-09-27 加了「视图 → 放大/缩小/实际大小」**，现 347 行）：⚠️ 那三档与滚轮**共用同一个 `应用缩放(值)`**（夹紧 → `setZoom` → 攒 400ms 落盘），但**不看** `ctrl_wheel_zoom`、**不跟** `ctrl_wheel_target` 走（那两格管的是滚轮）；⚠️ 「实际大小」是 `Ctrl+Shift+0` 而**不是** `Ctrl+0`——后者是本仓的「正文」，撞车是 `tools/menu-harness` 的 `#accel` 场抓到的。接上 `[appearance].zoom`（`webview.setZoom()`）、顶层 `ui_font_size`（内联 `--ui-font-size`），以及 `ctrl_wheel_zoom` ＋ `ctrl_wheel_target` **两格**。⚠️ 那两格是**两个问题**：前者管「生不生效」、后者管「动的是哪一个数」（`font_size` 默认 ／ `zoom`）。⚠️ 拨字号那一档会顺手打开顶层 `custom_font_size`，不然滚起来像坏的。⚠️ 走 `webview.setZoom()` 而不是 CSS（`100vh` 撑满，CSS 放大后底边被切）；⚠️ Ctrl+滚轮自己写（这套 WebKitGTK 不响应），**立刻改、攒 400ms 落盘**，累加按"已落到 webview 上的值"算。⚠️ 上下限与设置页那个 `NumberInput` **必须一致** |
| `ui/useUiMode.ts` | **"现在到底是浅色还是深色"的唯一判据**（2026-09-25 新增）：`ui_mode` 三档解析成两值 + 订阅 `matchMedia`（只有 `auto` 那档挂监听）。⚠️ 三个问的人共用（外观缩略图 / 文档主题那页 / `useDocTheme`），别各写一份 |
| `ui/useChromeVisibility.ts` | **状态栏 / 格式化工具栏 / 菜单栏的显隐**（2026-09-25 从 `App.tsx` 搬出，**菜单栏是 2026-09-28 加的第三条**——用户点名「也要允许用户隐藏上栏，也就是"文件"、"编辑"啥的」）。⚠️ 菜单栏这一条比另外两条多一件事：**藏下去的那一刻发一条 6 秒的提示**（`Alt+M` ＋ 设置页两条路），因为菜单栏自己是"哪儿能改回来"的唯一指示牌——它一藏，界面上再没有一行字写着它还能开回来。⚠️ 判据是**跳变**（`true → false`）不是"现在是隐藏的"：设置异步读进来，后者每次启动都会弹一遍。⚠️ 值**不是 state 而是 `settings.appearance` 的派生值**——这两条原来各有一份内存 state，而设置页那两个同名开关没有任何读取者，于是"菜单里关掉重启就回来、设置里关掉什么都不发生"（`docs/07` §2）。⚠️ 写的时候要把 `appearance` **整张表**一起写回，只给一个字段会把表里其它字段抹成默认。⚠️ 工具栏是**三档**（`ToolbarMode` = 始终显示 / 悬停显示 / 始终不显示，默认**始终不显示**），悬停那一档靠一条 **8px** 的感应带接住鼠标（`顶部触发带`，常量在本文件里）——⚠️ 别把它和沉浸模式那条 **6px** 的 `--zen-peek` 混起来：**两条带子不是一个东西**（一条在主区顶端唤工具栏，一条在窗口顶端唤菜单栏），数字也故意不同。细节见 `docs/04` §5。⚠️ **2026-10-04 多了一个出口 `收起工具栏`**（第 49 项）：工具栏右端那颗 × 走它，写的是 `setChrome({ toolbar: "never" })`——**与菜单 `view.toolbarNever` 同一个 setter、同一个参数**。放这儿而不是在 `FormatBar` 里现写箭头，因为"工具栏的显隐"这个状态的主人就是这一份 |
| `ui/useEditorCommands.ts` | **把一条菜单命令送进编辑器**（2026-09-24 从 `App.tsx` 搬出，76 行）：`run` 直接转交，「插入链接」先问地址。⚠️ 转交时**必须看返回值**——`false` 说的是"这个模式下没实现"，不看就是"点了没反应"。⚠️ 「插入图像」**2026-09-26 起不在这里了**（搬去 `ui/useImageInsert.ts`）：那条路要的是宿主的结果（写没写盘、写哪了），还要挂粘贴与拖入两条全局监听，不只是"问一句话再转交" |
| `ui/useImageInsert.ts` | **插入图片的接线**（2026-09-26 新增，216 行，backlog 第 62 项第一批）：`插入图像()` 开对话框，另外两条路是**粘贴**（`document` 上的捕获期 `paste`，且只在编辑区里有焦点时接手——否则连地址栏粘贴都会被抢）与**拖入**（Tauri 的 `onDragDropEvent`，因为 `dragDropEnabled: true` 时 HTML5 的 `drop` **拿不到文件**）。三条路共用同一个 `落一张`。⚠️ 判据与算式的唯一一份在宿主（`commands/image.rs`），这里只负责"什么时候问、问完送给谁" |
| `ui/ImageDialog.tsx` | **「插入图片」那个对话框**（2026-09-26 新增；⚠️ 2026-10-04 起来源两个页签有 ←→ 方向键，`useTablistKeys`，第 50 项）：两页——**本地文件**（路径 ＋「浏览…」）与**网络地址**（URL ＋ 说明它要下载到本地）——外加替代文字一栏。⚠️ 它**只管参数形状**，不管放哪、也不管拷不拷：那些由宿主的 `nota_image_place` 按用户设置决定 |
| `ui/EmojiDialog.tsx` | **「插入 Emoji」那个挑选框**（2026-09-27 新增；⚠️ 2026-10-04 起分类页签有 ←→/Home/End，第 50 项）：搜索框 ＋ 11 个分类按钮 ＋ 网格，回车选第一条。⚠️ **搜索做子串 `includes`，与补全面板的"只做前缀匹配"故意不一致**（面板是边打边筛，这个框是"我知道我要找什么"；理由写在文件头）。⚠️ 它**只回一个字符**（`askEmoji()` 不带请求参数）、**不碰文档**：插到哪儿由 `App.tsx` 的 `插入Emoji` 交给 `run("insertText", …)`。⚠️ 11 个分类名走 `分类文案(一类)` 的 `switch` 写成**字面量 `t("表情")`**：`tools/i18n-check.sh` 只认字面量，写 `t(变量)` 会让这 11 条英文被算成"废键"（FAIL） |
| `ui/AppDialogs.tsx` | **浮层那一族的总装**（2026-09-27 新增，约 70 行）：pandoc 面板 ＋ 确认框 / 输入框 / 插图框 / Emoji 选择框。⚠️ **只为 1000 行那条硬线**从 `App.tsx` 搬出（加了 Emoji 后那份 1024 行），搬的是"浮在正文之上、跟哪份文档无关的一层"。⚠️ 它只收**一个 `对话框` 对象**（`ui/useDialogs.ts` 那套 promise 式问答），不摊成十来个 props——漏一个就有一个框**永远关不掉**，且不报错。⚠️ **这里的顺序就是层叠顺序**（后画的盖住先画的） |
| `ui/LicenseDialog.tsx` | **许可证全文那张框**（2026-10-04 新增）：「关于 → 法律信息」里点那个超链接打开它。⭐ **全文不抄第二份**：走 Vite 的 `?raw` 把**仓库根目录那份 `LICENSE`** 读成字符串（`ui/nota-mark.ts` 读 `nota.svg` 同款手法），改了 `LICENSE` 这个框跟着变、一行代码都不用动。⚠️ **开在进程内**（不交系统浏览器、也不新开 OS 窗口）：前者要走 `opener:allow-open-url`、后者要 `core:window:allow-create` 一类能力，这条路两样都不碰。⚠️ 壳（`.confirm-backdrop` / `.confirm-dialog`）与别的框**共用**，只加 `.lic-*`（`src/styles/overlay.css`）。⚠️ 它**盖在关于框上面**（两层 z-index 都是 200，靠 DOM 顺序分前后），`Esc` 的归属由 `ui/AboutDialog.tsx` 那条 effect 让路 |
| `ui/AboutDialog.tsx` | **「帮助 → 关于 Nota」那张框**（2026-09-28 新增，取代 `ui/useAbout.ts`——那一份**已删**）：按 GNOME 的关于窗重做（大图标 ＋ 名字 ＋ 作者 ＋ 版本药丸，底下**首页 ＋ 四个子页**＋ 两行外链）。⚠️ **2026-10-04 改过一次**：故障排除从"权限清单"改成**编译信息 ＋ 本机信息两张表**（`nota_diagnostics`）；权限搬到**新开的「权限列表」页**、改成两列表格（权限说明 ｜ 备注）；法律信息里的许可证名成了**超链接**（开 `ui/LicenseDialog.tsx`）；⚠️ **「什么没申请」那七条 ＋ 鸣谢底下那句 THIRD-PARTY.md 的指引都删了**——用户这一轮的总口径是**全删**（"删掉各种菜单下面大段大段的无用ai味描述"），要加回来加在这里。⚠️ **它从前是一个 `ConfirmDialog`**，当年那笔账的最后一句是「真到要**分节跳转 / 可折叠 / 带图标**的那天再拆」——**那天到了**。⚠️ **开关不在这份里**（`关于开着` / `开关于` / `关关于` 三格在 `ui/useDialogs.ts`，与另外四个框**不同路**：它不问任何事，是一份看完就关的报告）；⚠️ 两张表（致谢 / 权限）**在渲染里现建**，不是模块级常量（模块级求值时语言还没定）；⚠️ **取不到版本照样要弹**（「关于」正是用户来查版本的地方）；⚠️ 助记键走 HTML `accesskey`，**在 WebKitGTK 上认不认没开窗验过**（`docs/07` 的账） |
| `ui/useFocusSession.ts` | **强制专注那一整档**（2026-09-28 新增，从 `App.tsx` 搬出，**130 行**）：把四个 hook（`useForceFocus` / `useFocusAlarmSound` / `useFocusIntro` / `useFocusTrace`）收成**一个出口**，`App.tsx` 那边只剩一句解构。⚠️ **搬它的理由就是 1000 行那条硬线**（当时 `App.tsx` 998 行），不是「这几个 hook 长得像」——四个各管各的，只有「都是强制专注这一档」这一条把它们圈在一起 |
| `ui/share-card.ts` | **分享卡那张 1080×1350 的 SVG**（458 行，2026-09-27）：写作统计把它自己的数据画成一张能发出去的图，**同一个函数**再光栅化成 PNG 存盘/进剪贴板（"预览里看到的那张就是存下去的那张"）。⚠️ **插件只给字段、宿主说版式**。⭐ 四条口径：横轴刻度插件给、**纵轴刻度自己推**；**少于两个点不画曲线、恰好一个点照样画两条轴**（点需要框，要避免画出一条假的"匀速"直线）；标识**从 `src-tauri/icons/nota.svg` 读进来再嵌**；`安全文件名()` **先只留路径最后一段再消毒**（顺序反了会写到一个隐藏文件 `.png` 上）。⚠️ 与 `ui/chart-ticks.ts` 是**两份代码**。用例 **46** 条在 `tests/share-card.test.ts` |
| `ui/nota-mark.ts` | **把标识嵌进别人的 SVG**（99 行，2026-09-27）：`src-tauri/icons/nota.svg` 走 Vite `?raw` 读成字符串 → 去 XML 声明/注释/外壳 → 拼成一段能塞进分享图的 `<svg x= y= …>`。⚠️ **改图标只需改那一份 `.svg`**。⚠️ 同一张图上有**两个**图标，每个实例的 id 都带前缀（同名 id 浏览器只认第一个）；⚠️ 外面套 `<clipPath>` 裁到图标自己的圆角底衬上——不裁的话深色卡片上会是一个**白色方块** |
| `ui/chart-ticks.ts` | **图上的刻度**（118 行，2026-09-27）：`读刻度` ＋ `推纵刻度` ＋ `格式化数`。⚠️ **两条轴分工不同**——纵轴只有数据知道上下界（`points` 自己归一化），横轴只有插件知道（序号对应哪一刻）。⚠️ 位置是 **0~1 的比例**不是像素。⚠️ 面板那边只能是 **HTML 覆盖层**、不能是 SVG `<text>`（`preserveAspectRatio="none"` 会把文字一起拉变形）。⚠️ `share-card.ts` 只从这里 import `格式化数` 与类型，**纵刻度的推法各写各的**。用例 **12** 条在 `tests/chart-ticks.test.ts`（钉着"`格式化数(109.5)` 曾经写成 `11`"那条**差十倍**的回归） |
| `ui/heatmap.ts` | **长期记录的热力图**（256 行，2026-09-27）：Contribution Graph 那种一格一天的小方格（用户「类似 Contribution Graph 那样的热力图，记录长期数据。仅记录打字数」）。⚠️ **只算格子的位置，不画**（同 `chart-ticks.ts` 的分工：插件说数据、这里说版式、`PanelBody.tsx` 画），所以"哪一格是哪一天"能脱离 React 单独测。⚠️ 三条口径：**一列 = 一周、从周一起** · **最后一列到 `止` 那天为止、下面留空**（把未来几天画成"0 字"是编数据） · **缺的那些天当 0 不当"没有"**。⚠️ 它**不认识"今天"**（右端由插件给的 `止` 定）。⚠️ 月份标签走 `Intl`、**不写死「月」**。用例 **20** 条在 `tests/heatmap.test.ts` |
| `ui/Home.tsx` | 没有文档时那一屏 |
| `ui/StatusBar.tsx` | **下栏**（**412 行**；2026-09-30 照 Typora 重做，同日晚又按五张参考图补了悬停那半）：**左手两颗开关**（侧栏开合 ／ 源码-所见即所得）＋ **右手那一格统计量 ＋ 它两侧悬停才出现的两颗按钮**（`A✓` 拼写检查、`⌄` 字数统计菜单）＋ 强制专注余额那一格（只在跑着时出现）。⚠️ 原来那几格（文件路径、`● 已修改`、模式名、`严格`、字符数、行数、约几分钟）用户答「其余全删」——**数一个没少**，只是各自有落点（`● 已修改` 进了窗口标题、四个数进了那个小菜单）。⚠️ 四颗按钮**都不自己存状态**（`sidebarOpen` / `settings.view_mode` / `appearance.status_metric` / `editor.spellcheck`），只画形状、把点击原样交回去。⚠️ **图3 那个语言列表故意没做**（WebKitGTK 没有枚举词典的接口），那个菜单只有两项。⚠️ **2026-10-04 最右端补了第五颗：那颗 ×**（`.status-btn.statusbar-close`，第 49 项）——`onHide` prop，落点是 `useStatusBar` 递进来的 `设界面`（＝ `App.tsx` 那个 `setChrome`），**只关不开**（写 `!` 的话，× 不在屏幕上的那种状态下点它会**把栏打开**）。⚠️ 它**不跟**悬停才出现的那两颗（`.status-aux`），也**不省**在没文档的时候（它说的是"这一栏画不画"）。⚠️ 位置必须**在 `.status-right` 里面**（`space-between` ＋ 第三个孩子会把字数挤到中间） |
| `ui/useStatusBar.ts` | **状态栏那一堆 props 的接线**（**108 行**，2026-09-30 晚从 `App.tsx` 搬出——那次 `App.tsx` 1003 行越了 1000 行硬线）：四格值分别读 `settings.appearance.status_metric` / `settings.editor.spellcheck` / `settings.view_mode` / `sidebarOpen`，写回各给一条回调。⚠️ **它一个 `useState` 都没有**（"不要第三个真相"在这一层的落法）。⚠️ 两条 patch 都先把那张表铺开（`updateSettings` 只做顶层浅合并）。⚠️ 返回类型是 `ComponentProps<typeof StatusBar>`，**不手抄**。⚠️ **2026-10-04 多收一格 `设界面`**（第 49 项那颗 ×）：`App.tsx` 交给它的**就是那个 `setChrome`**，所以 × 与菜单「视图 → 状态栏」写的是同一格。⚠️ **故意让调用方把 setter 递进来、不在这儿铺一遍 `appearance`**——铺了就是同一个设置的第二条写路 |
| `ui/SidebarResizer.tsx` | **侧栏右缘那条可以拖的把手**（**111 行**，2026-09-30 新建）：`侧栏宽默认` 240 ／ `侧栏宽最小` 180 ／ `侧栏宽最大` 480 ＋ 纯函数 `夹侧栏宽` ＋ 组件 `SidebarResizer({ onCommit })`。⚠️ 拖动期间直接写 `<html>` 上那条 `--sidebar-width`、**松手才落盘**（`ui/useZoom.ts` 立的先例）；⚠️ 组件渲染在 `.sidebar` **里面**（量 `parentElement` 的左缘）。⚠️ **只做这一条边**——右侧插件栏的宽度还是死的（用户点名的只有侧栏） |
| `ui/view-modes.ts` | **三种编辑模式的名字**（2026-09-24，**38 行**）。⚠️ **2026-09-30 删掉了短名那一列**：原来是一长一短（`short` 给状态栏、`full` 给菜单与设置），状态栏改成一颗 `</>` 图标之后短名没有读者了；`zh-ui.ts` 里 `"Source"` / `"Split"` 两条中文随之删除（留着就是废键，`i18n-check` ③ 会 FAIL）。⚠️ **只是名字，没有切换逻辑**——切换在 `App.tsx` / `ui/commands.ts` |
| `ui/Toasts.tsx` | 提示条（42 行，**纯展示 + 点叉关掉**；什么时候消失由 `ui/useToasts.ts` 定）。⚠️ **一行样式都没有**——外观全在 `styles/toast.css`（2026-09-29 从 `app.css` 拆出来的那一节）（那一节的表格见 `docs/04` §2.6） |
| `ui/useToasts.ts` | **提示条的宿主**（47 行，2026-09-25 从 `App.tsx` 搬出，本文件当时 958 行）：`toasts` 数组 ＋ `toast(msg, level?, ttlMs?)` ＋ `dismiss`。⚠️ 文案照旧由调用方给，这里只管"什么时候消失"——那条规则有两条反直觉的分支：`error` 留 8 秒（其他 3.2 秒）、**`ttlMs === 0` 是不自动消失**（给"描述状态、不是描述刚做的那件事"的提示用，比如开机读设置失败） |
| `ui/ErrorBoundary.tsx` | 渲染错误兜底 + 全局错误钩子 |
| `ui/outline.ts` | 字数的纯函数（`countText` / `Counts` / `isCjk`）。⚠️ 2026-09-27 起**大纲那一半搬去了 `editor/headings.ts`**（依赖方向，见那一行）；文件名没改——"outline" 仍与侧栏那一页对得上 |
| `ui/ReviewPane.tsx` | **编辑区里摊着的那块插件面板**（2026-09-25，`nota.ui.review` 的前端那一半）：从宿主 `ReviewState` 拉"哪一页"，再从插件清单查名字、从面板清单查那一页，然后**复用 `PanelBody` 画**。⚠️ 它**只画**，开合归宿主状态；⚠️ 标题与那句「此插件不支持您的语言」的合成都在这儿（要查两张表），所以 `App.tsx` 只把两份清单递进来 |
| `i18n/index.ts` | **前端 i18n**（2026-09-25）：`t(原文, …参数)` / `语言()` / `定语言()` / `useT()` / **`use语言()`**。⚠️ **键就是原文**（与插件那套同一门语言），所以没翻译的字符串取到的是它自己；⚠️ **2026-09-28 起"原文"是英语**（用户定的方向：英语才是主语言、中文是翻译包），译文在 `i18n/zh*.ts`，`en*.ts` 那四份删了；⚠️ 模块级**兜底是 `en`**（与宿主 `lang.rs::应用兜底` 同值，两条注释互相指回）——语言还没拉回来之前界面不能空着，而英语是原文所以这个落点**永远完整**；⚠️ 组件**必须**调 `useT()`，模块级那个 `t` **不会**触发重渲染；⚠️ **不是画字、而是把语言当依赖**（推原生菜单、重算 memo）要用 `use语言()`；⚠️ `{0}` / `{1}` 是占位符 |
| `i18n/zh.ts` | 中文表的**总入口**（**四份表**，2026-09-26 拆的、2026-09-28 翻转时改名）：这个文件只剩文件头 ＋ 汇总导出 `中文表 = { ...界面表, ...设置表, ...运行表 }`；真条目在 `i18n/zh-ui.ts`（界面骨架）· `i18n/zh-settings.ts`（设置十页）· `i18n/zh-runtime.ts`（钩子与运行时报错）。⚠️ 覆盖范围**2026-09-26 起是整个界面**（此前只有插件那一圈）。⚠️ 条数**现跑 `bash tools/i18n-check.sh` 看**，别照抄文档里的数——它随代码自己动 |
| `ui/PandocPanel.tsx` | pandoc **没探通**时那个面板（2026-09-25，照着当时那块 `SlidevPanel.tsx` 写、**共用同一套 CSS 类**——⚠️ 那个文件 2026-09-25 已随 Slidev 拆成插件一起删除，见 `docs/04` §2.6c）。⚠️ 只在 `missing` / `unknown` 时出现；⚠️ 必须说清 **PDF 有第二条路**（没装 pandoc 但 `fallback_pdf` 为真时主按钮是「用 Nota 自己排版导出」而不是「去官网」）；⚠️ 其余情况**永远再留一条「仍然试一次」** |
| `ui/useImmersive.ts` | **沉浸模式（专注 / 全屏）**（2026-09-25 从 `App.tsx` 搬出，184 行）。⚠️ 两个模式**合成同一个属性** `data-zen`（`display:none` 收起外壳、组件不卸载，所以侧栏页 / 插件页 / 标签都还在）；⚠️ 全屏**读窗口、不记账**（`isFullscreen()` ＋ `onResized` 镜像回来）；⚠️ `有浮层` 要**逐个列出来**，不在调用处先合成一个布尔——不然加第五个浮层时改的是 `App.tsx`。样式在 `styles/app.css`「沉浸模式」一节，两半合起来见 `docs/04` §2.10 |
| `ui/useFocusDim.ts` | **专注模式压多暗那一档落到 `<html>` 上**（2026-10-04 新增，第 45 项，照 VMark 窗口版补的）：读 `appearance.focus_mode_dim` 三档（`standard` / `strong` / `stronger`）写 `data-focus-dim`，CSS 按属性选 `--focus-dim`；**默认那一档不落属性**（DOM 才干净），`settings === null` 走 `默认档 = "standard"`。⚠️ 手法同 `ui/useCodeBlockPrefs.ts`（`data-*` 上 `<html>`，不重建编辑器）。⚠️ `默认档` 必须与 Rust `FocusDim::Standard`（那个 `#[default]`）**同名**，不一致的症状是"启动第一帧按一个值画、读回来自己跳一下"。⚠️ 两条压暗选择器共读一个变量，`tests/focus-dim.test.ts` 把五个名字钉在一起 |
| `ui/useWindowTitle.ts` | **窗口标题**（2026-09-25 新增，61 行，第 51 项）：`useWindowTitle(标题, 脏, 带文件名 = true)` 把`{标题}{ •} — Nota` 写进原生窗口标题。⚠️ **不是 `document.title`**——那传不出 WebView。⚠️ 拼接那一步是**纯函数 `窗口标题()`**，为的是单独验（`setTitle` 的结果在截图上读不出格式，只能靠这一层）。⚠️ 失败**静默**，口径同 `useImmersive` 里那条 `同步全屏`：不是用户发起的动作，报错也无从补救。⚠️ **2026-10-04（第 45 项）多了第三个形参**：`appearance.show_filename_in_titlebar = false` 时整句就是应用名——**那个 `•` 脏标志也跟着看不见了**（它拼在标题里），未保存的另一处落点是标签页那颗点（`ui/TabBar.tsx`），已记在那个字段上。
| `ui/useDocuments.ts` | **文档的生命周期**（2026-09-25 从 `App.tsx` 搬出，385 行）：新建 / 打开 / 保存 / 另存 / 关闭 / 重载 / **切页**。⚠️ `saveDoc` **返回布尔**——"存成功了吗"是调用方（关闭流程）的判据，不能靠回头读状态。⚠️ **切页一律走 `切换文档`**，「切换文件时自动保存」在那儿（必须在 `setActiveId` **之前**存，顺序反了会把两份文档的正文互换）；⚠️ **`openPath` 的身份是承重的**，`App.tsx` 的启动 effect 挂着它，所以 `saveDoc` / `切换文档` 读文档列表**必须走 `docsRef`**（理由见文件头第 4 条与 `docs/07` §4） |
| `ui/useAppEvents.ts` | 应用级的两条 effect（2026-09-26 从 `App.tsx` 搬出，168 行）：**宿主推来的事件** ＋ **活动文档变了要告诉后端**。⚠️ 不并进 `ui/usePlugins.ts`：那个管的是插件三样（清单/面板/菜单项），这两条与插件无关。⚠️ **2026-10-04（第 14 项）起多一条 `nota:document-edit`**：那是**「请你替我改」的意图**（宿主改不动），落成 `editorRef.插入在光标处(p.text)`；⚠️ **不认识的 `op` 一律丢掉**——绝不能拿 `p.text` 当插入用 |
| `ui/useAutosave.ts` | **自动保存的定时那一半**（2026-09-25，98 行）：`autosave_seconds`（停笔 N 秒）到点判该不该写盘。⚠️ **它只管"该不该存"，不管"怎么存"**——真写盘交给传进来的 `saveDoc`，所以自动存与 `Ctrl+S` 是同一条路。⚠️ 三条**有意留的口子**：没存过盘的文档不存、不脏不存、失败后不重试到疯。⚠️ 活动信号是 `EditorPane` 每次内容变化报一次，**不许**改成轮询 `getMarkdown()`（那是每秒把整篇复制一遍） |
| `ui/useClipboard.ts` | **剪贴板四件**（2026-09-25 从 `App.tsx` 搬出，164 行）：复制 / 剪切 / 粘贴 ＋ **复制为 Markdown**。⚠️ 前三个读**选区**，第四个取**整篇源码**（`getMarkdown()`）——它跟另外三个不是一类，文件头有说明 |
| `ui/useForceFocus.ts` | **强制专注的接线**（2026-09-26，126 行）：订阅 `nota:focus-state` ＋ `get` / `start` / `stop` / `ack` 四条命令；另导出 `说时长(毫秒)`（`mm:ss` / `h:mm:ss`，`Math.max(0, …)`）。⚠️ 状态有**两档空**：`null`（还没拉回来）与 `running: false`（拉回来了但没在跑）——界面别把两者合成一个"没在跑" |
| `ui/FocusMeter.tsx` | **状态栏那一格余额**（2026-09-26，75 行，**只读**）：只在 `state?.running` 时渲染（没在跑就**整格不在**，不是显一个 `0:00`）；三档阶段各有颜色与 `title` 说明。⚠️ 它每秒重画，这也是**设置页不许显示会话状态**的理由（同一个值两处显示 ＝ 两处每秒重画） |
| `ui/FocusAlarmWindow.tsx` | **警报窗那一棵树**（2026-09-26，94 行，`index.html#focus-alarm` 的根）：整块红屏 ＋ 大白字 ＋ `I'm Back`。⚠️ **它不自己 `close()`**——"这个窗等着宿主来关"，收窗在 `focus/alarm.rs::对账`；⚠️ Esc 与按钮走同一条 `ack`；⚠️ 按钮按过就锁成「这就回去…」（防连点，也防"按下去了但其实没生效"那种错觉） |
| `ui/useFocusAlarmSound.ts` | **警报声（主路径）**（2026-09-26，165 行）：Web Audio 合成——方波（谐波最丰富，听起来"尖"）× 880 / 1245 Hz 来回跳，每 0.22 秒一跳、共 11 跳 ≈ 2.4 秒，⚠️ **不是一声"哔"**而是一段"停不下来"的东西；音量封顶 0.28（再大在笔记本内置喇叭上会削波，听着像坏掉而不是更响）。⚠️ WebKit 的自动播放策略会把没有用户手势的 `AudioContext` 摁住，所以开始专注那一下先 `预热音频()`；万一还是播不出来就转宿主兜底。⚠️ **只在主窗挂**（那条 emit 发给所有窗口，警报窗也挂就是同一段响两遍） |
| `ui/useFocusIntro.ts` | **首次说明**（2026-09-26，111 行）：判据是 `settings.focus.introduced`（**要落盘**——只在内存里的话每次重启都拦一次，用户很快就学会闭眼点掉，那正好把这次说明的意义抵消掉）。⚠️ **取消 ＝ 不开始**，不是"关掉一个提示"（点确定/点取消都会开始的功能，等于没问）。⚠️ 同一份话在 `FocusPane.tsx` 末尾还有一个 `Note`，**改一处要改两处** |
| `ui/focus-summary.ts` | **一轮专注的读数与那张卡**（2026-09-27 新增，265 行）：`记一笔` / `抽稀` / `造总结` / `专注率` / `说时刻` / `文件时刻` / `横刻度` / `造分享卡`。⚠️ **宿主一行没改、这是有意的**——计时线程每秒广播的那份快照里已经有这一轮的全部账目（`elapsed_ms` / `focused_ms` / `away_total_ms` / `alarms` / `balance_ms`），真正缺的只有一条曲线。⚠️ 三条判据：**采样上限 900（＝15 分钟）之后把间隔翻倍、相邻两点取余额大的那个**（保峰；代价是"扣到底"可能记成"还没到底"，所以卡片上另有**警报次数**当判据）· **专注率的分母是「专注＋离开」**（警报冻住那段账本不动，算进去等于因为"警报响了"而拉低专注率，而警报恰恰是他**回来过**的证据）· **分母为 0 时返回 `null` 而不是 0%**（画破折号；画 0% 是假话）。⚠️ 卡片右上的时刻走 `t()` 一条格式串（`{0}年{1}月{2}日 {3}`），不按语言写 `if`。⚠️ `subtitle` 是字面量 `"Focus Session"`、**不过 `t()`**（同写作统计那张卡）。用例 **34** 条在 `tests/focus-summary.test.ts`（跑它要 `--alias:@=./src`） |
| `ui/useFocusTrace.ts` | **这一轮的轨迹 ＋ 结束时交总结**（2026-09-27 新增）：把每秒那一个快照攒成一条余额曲线，`running` 从 true 掉到 false 那一下造出 `总结` 交给上层。⭐ **为什么必须在前端攒**：宿主 `nota_focus_stop` 会把账本清成空快照（`focus::停下` → `快照::空()`），所以"这一轮到底怎么样"只能在结束**之前**就留着。⚠️ 三条坑写在文件头：曲线存 `useRef`（每秒 `setState` 白跑，而且 `setState` 进依赖会**转成死循环**——`记一笔` 对同一秒返回的是新数组）· `在跑` 那个 ref 是**挂载时那一发空快照**的补丁（否则一进来就被判成"刚结束"）· `收起` 之后 `结算` 要清干净。⚠️ 它**不认识卡片**，只交一份 `总结` |
| `ui/FocusSummaryDialog.tsx` | **一轮结束后那份报告**（2026-09-27 新增）：左边五格（本轮时长 / 专注 / 离开 / 警报 / 专注占比）、右边分享卡预览、底下三颗按钮（保存分享图 / 复制分享图 / 知道了）。⚠️ **它不是 `useDialogs` 那一族**：那四个框都是"问一句、等一个答案"（`askXxx` 返回 Promise），而这个框**不问任何事**——它是一份看完点掉的报告，硬塞进那个 Promise 形状就得凭空造一个谁也不读的返回值。所以由 `App.tsx` 直接持有（`useFocusTrace` 给的 `结算`），不走 `askXxx`。⚠️ 外壳借 `.confirm-*`，但 `role` 是 **`dialog` 而不是 `alertdialog`**（后者是"打断你、必须回答"，这一份是用户自己按了"停止专注"之后的回执）。⚠️ **只接 Esc、不接 Enter**；⚠️ **`App.tsx` 里它必须排在 `useImmersive` 之前**（`有浮层` 要数进 `专注总结`，否则框开着按 Esc 会连沉浸模式一起退掉） |
| `ui/ShareCard.tsx` | **分享图那一块的唯一实现**（2026-09-27 新增，从 `ui/PanelBody.tsx` 抽出来）：`useShareCard`（存盘／剪贴板两条出路）＋ `ShareCardPreview`（那张 `<img>`）＋ `ShareCardBlock`（面板那一版，类名仍是 `.panel-share*`）。⚠️ 抽出来的原因只有一个：**强制专注的总结框要共用同一份"存／复制"**，而那个框不是面板、够不着 `PanelBody.tsx` 里的私有组件。⚠️ 两条理由从原处原样搬来：**结果留在原地而不是 toast** · **剪贴板尽力而为、能力先问后做**。⚠️ `useCardPalette` 用 `MutationObserver` 盯 `data-ui-mode`，主题一换那张图跟着换色 |
| `styles/focus.css` | 强制专注的样式**三块**（2026-09-26 两块，2026-09-27 加第三块）：**状态栏那一格**（`.status-focus*`，借 `app.css` 里状态栏那套，所以必须在它之后）＋ **警报窗那一整棵树**（`.alarm-*`，画在另一个窗口里，那边没有主窗外壳、也没有人和它争优先级）＋ **结束后的总结框**（`.focus-summary*`）。⚠️ 颜色一律走 `theme.css` 的变量，**只有警报窗那一块例外**（红屏是"出事了"，不该跟着风格走）。⚠️ 走神用 `--warn`（黄）而不是 `--danger`（红）：黄是"正在往那边走"，红是"已经出事了"——两档同色就看不出"我还有救"和"已经响了"的分别。⚠️ **BUG-44**：`.alarm-card` 原来写 `max-width: 22ch`，而 `ch` 量的是**卡片自己的**字号（继承 `body` 的 15px），标题却是 `clamp(2.5rem, 9vw, 7rem)`——再扣掉卡片自己那条 `padding: 0 5vw`，留给字的只剩几十像素，标题一行一个字竖排、按钮被挤出视口；现在跟着 `--alarm-title-size` 走（`calc(… * 9)`），**宽度与标题字号同一个出处** |

`src-tauri/build.rs` 只有 `fn main() { tauri_build::build() }`，是 Tauri 的标准构建脚本
（生成 `gen/schemas/*` 那些权限 schema），没有本项目自己的逻辑，下文不再单列。

**测试现状**

| 有 `#[cfg(test)]` 的文件 | 测试数 |
|---|---|
| **`upload/tests.rs`** | 28 |
| **`image/tests.rs`** | 26 |
| `lua/api/ui/tests.rs` | 23 |
| `lua/api/git.rs` | 19 |
| `session.rs` | 19 |
| `document/mod.rs` | 20 |
| `pandoc.rs` | 18 |
| `lua/api/diff.rs` | 16 |
| **`cli.rs`** | 16 |
| **`diff.rs`** | 15 |
| `plugin/package.rs` | 14 |
| **`focus/mod.rs`** | 13 |
| `cli.rs` | 12 |
| `file_move.rs` | 12 |
| `lua/api/unified_diff.rs` | 12 |
| `settings/appearance.rs` | 12 |
| `devserver.rs` | 10 |
| **`settings/focus.rs`** | 10 |
| `settings/mod.rs` | 10 |
| **`table_width.rs`** | 10 |
| `lua/api/http/tests.rs` | 17 |
| `proc.rs` | 9 |
| `lang.rs` | 8 |
| `lua/api/devserver.rs` | 8 |
| `lua/tests.rs` | 7 |
| `lua/api/json.rs` | 4 |
| `lua/require_tests.rs` | 8 |
| `plugin/installed.rs` | 8 |
| `commands/export.rs` | 7 |
| `lua/api/settings.rs` | 7 |
| `lua/api/document.rs` | 6 |
| `lua/api/i18n.rs` | 6 |
| `lua/mod.rs` | 6 |
| `native_menu.rs` | 6 |
| `plugin/manifest.rs` | 6 |
| `settings/document.rs` | 6 |
| `settings/editor.rs` | 7 |
| `single_instance.rs` | 6 |
| `themes.rs` | 6 |
| `ui_styles.rs` | 6 |
| `url_scheme.rs` | 6 |
| `devserver/probe.rs` | 5 |
| `lua/api/data.rs` | 5 |
| `lua/api/fs.rs` | 5 |
| **`settings/keys.rs`** | 5 |
| `settings/markdown.rs` | 5 |
| `commands/image.rs` | 4 |
| `commands/pandoc.rs` | 4 |
| `commands/workspace.rs` | 4 |
| `lua/api/mod.rs` | 4 |
| `lua/api/time.rs` | 4 |
| `plugin/install.rs` | 4 |
| `settings/files.rs` | 4 |
| `settings/image.rs` | 4 |
| **`watch.rs`** | 4 |
| `commands/path_kind.rs` | 3 |
| `paths.rs` | 3 |
| `settings/general.rs` | 3 |
| `error.rs` | 2 |
| **`focus/alarm.rs`** | 2 |
| `settings/export.rs` | 2 |
| `pandoc_format.rs` | 1 |
合计 **505 个 Rust 单元测试**（⚠️ **这是 2026-09-27 深夜的快照，已经旧了**：2026-09-29 现数是 **559** 条、**2026-10-04 现数是 583 条** / **62** 个文件——本批只动了 `settings/editor.rs` 一处（6 → 7），其余差额是同时段别的会话提上来的。要报数就照上面那条 `grep` 现取，别抄这一行）（2026-09-27 深夜**现数**：`grep -r '#\[test\]' src-tauri/src --include=*.rs | wc -l` ＝ **505**，带用例的文件 **59** 个；`cargo test --lib` 同一刻跑，报 **505 passed; 0 failed**）。
⚠️ **2026-10-04 又动过一次**（这几行都是第 58 项那一批的）：`lua/api/http.rs` 的用例**搬进了新文件 `lua/api/http/tests.rs`** 并长到 **17** 条（多出来的是 `stream` 那条路的：分块不劈汉字、结果表的形状）· **新文件 `lua/api/json.rs` 4 条**（`nota.json.decode`）· `lua/api/ui/tests.rs` 20 → **23**（`nota.ui.stream` 的尾巴截断三条）。⚠️ 同批**删掉了 `| lua/api/ui.rs | 20 |` 那一行**——它是一份重复：那 20 条 2026-09-29 就搬进 `ui/tests.rs` 了，当时补了新行却没删旧行。
⚠️ **这张逐文件表 2026-09-27 深夜按现数整表重生成过一次**（490 → 501），**两半这次是一致的**——上一版留下的"表 490 ／ 总数 492、多的 2 条没去认领"那处差额**就此结清**：那 2 条是同时段别的会话提上来的，重生成时已经含在里面，**不必再去追是哪两个文件**。
⚠️ **同一批晚些时候又加了 4 条**（501 → **505**，`cli.rs` 12 → **16**）：「标签页右键 → 在新窗口中打开」那一条链给 `cli.rs` 补的四条用例——新窗口选项认得出来（位置不拘）／程序自己的路径不算选项（**零号参数不算**）／普通启动不是新窗口（`--new-windowish` 不算，要**整串**相等）／新窗口选项不妨碍挑出要打开的文件。⚠️ **带用例的文件数没变**（还是 59，加的是已有文件里的用例）。
⚠️ **这一批（启动三档 ＋ 快捷键改键位 ＋ 标签页右键）合计贡献 13 条，全在表里标粗**：`settings/keys.rs` **新增 5** · `cli.rs` 12 → **16** · `session.rs` 16 → **19**（工作区那一笔的三条：记得住也读得回 ／ 老侧车没有它也能读 ／ 空的工作区当没有）· `settings/files.rs` 3 → **4**（`folder` 旧值还能读成第三档）。
⚠️ **加行时按条数降序排**，插进去之后要重看一遍位置。
⚠️ 本表**只认 `#[cfg(test)]` 里的 `#[test]`**，所以 `src-tauri/tests/` 那种集成测试**不在数里**（本仓到现在一条都没有，见本节末）。

⚠️ **这个数一天里涨了三次，三次不都是同一批活**：397 → 411（2026-09-27 白天，心电图分享图那批）→ 422（其中**只有 3 条是「段首缩进」那批加的**，`settings/editor.rs` 3 → 6）→ **428**（**6 条是「英文按词统计」那批加的**，`lua/api/document.rs` 0 → 6）。⚠️ **422 → 428 这一步里，`document.rs` 的 6 条是我加的，而「带用例的文件」从 49 涨到 51 → 另有一处来自同时段别的会话**——本仓同一目录可能多个会话在改，**这条数一律以仓库现数（`grep`/`cargo`）为准**，别照抄任何一处文档上的数。

⚠️ **这张表 2026-09-27 又补过一次**（397 → 411 这 **14** 条，全部来自心电图分享图那一批 ＋ 同批的 Ctrl+滚轮）：**两个新文件** `lua/api/time.rs`（4）与 `lua/api/data.rs`（5），另加 `settings/appearance.rs` 9 → **12**（Ctrl+滚轮改什么那三档）、`commands/export.rs` 5 → **7**（base64 两条）。⚠️ 加行时**排序是按条数降序**，插进去之后要重看一遍位置。

⚠️ **上面这张逐文件表当天已经重排过一次**（2026-09-26 晚）：317 → 397 这 **80** 条里，
只有 **4** 条是「主题色」这一批的（`settings/appearance.rs` 5 → **9**），
其余 76 条来自同一天**别的批次**——其中五个是**新文件**：
`diff.rs`（15）、`focus/mod.rs`（13）、`settings/focus.rs`（10）、`table_width.rs`（8）、
`watch.rs`（4）；另有 `lua/api/git.rs` 6 → **19**、`lua/api/ui.rs` 18 → **20**、
`lua/api/diff.rs` 13 → **16**、`lua/api/unified_diff.rs` 10 → **12** 等。
⚠️ **那些批次的来龙去脉在它们自己那批的记录里，本节只负责"现值"**——所以这里不再往下
续那条 `→` 叙事链：它每加一批就要重写一次，而**真正会烂的是逐文件的数**，不是总数。
要动之前现数一遍（`tools/doc-sync-check.sh` 不查这一节，`docs/06` §6 有现成的命令）。

其余 Rust 文件没有测试。

⚠️ **前端另有一批，与上面这个数不是一套**（本仓没有测试框架，跑法是 `esbuild` ＋ `node`，
见 `docs/06` §6.3）：`tests/` 下 **五十份、共 1252 条**（📌 **2026-10-04 现数**：一份一份跑出来的，50 份 0 失败——那份 `for` 里的**四十六份 1098 条** ＋ 另带开关的四份 **154 条**；本批新加 `front-matter` **32 条**（`docs/07` 第 64 项，⭐ 它当场抓到一个老 off-by-one）、`focus-dim` **15 条**（第 45 项那条轴的五个名字对账）与 `window-title` **8 条**（`窗口标题` 那个纯函数 ＋ `应用名` 与 `tauri.conf.json` 的 `title` 逐字相同）；⚠️ 上一版是四十七份、1197 条（📌 **2026-10-04 深夜现数**：一份一份跑出来的，47 份 0 失败——那份 `for` 里的**四十三份 1043 条** ＋ 另带开关的四份 **154 条**；本批新加 `caret-snapshot` **10 条**（`docs/07` 第 14 项）；⚠️ 上一版是四十六份、1187 条，再上一版是四十五份、1174 条——那份 `for` 里的**四十二份 1033 条** ＋ 另带开关的四份 **154 条**；本批新加 `math-currency` **23 条**（`docs/07` 第 54 项）、`list-indent` **16 条**（第 47 项）与 `syntax-escape` **13 条**（第 56 项那一族的收尾）；⚠️ 上一版是四十三份、1135 条，再上一版是四十二份、1122 条）：
`table-tab.test.ts` **58** · `auto-pair.test.ts` **57** · `keymap.test.ts` **54** · `math-delim.test.ts` **51** ·
`math-view.test.ts` **51** · `slash.test.ts` **49** · `share-card.test.ts` **46** ·
`table-input.test.ts` **39** · `table-pipe.test.ts` **39** · `inline-marks.test.ts` **37** ·
`smart-punctuation.test.ts` **36** · `focus-summary.test.ts` **34** · `math-commands.test.ts` **35** ·
`emoji.test.ts` **32** · `front-matter.test.ts` **32** · `lang-guess.test.ts` **31** · `footnote.test.ts` **30** ·
`url-link.test.ts` **29** · `math-input.test.ts` **28** · `source-mark.test.ts` **28** ·
`toc.test.ts` **27** · `math-suggest.test.ts` **27** · `paste-clean.test.ts` **25** ·
`math-currency.test.ts` **23** · `syntax-escape.test.ts` **13** ·
`key-conflicts.test.ts` **21** ·
`heatmap.test.ts` **20** · `auto-correct.test.ts` **20** · `atom-space.test.ts` **19** ·
`heading-on-enter.test.ts` **19** · `accent.test.ts` **18** · `mark-hint.test.ts` **18** ·
`instant-render.test.ts` **17** · `list-indent.test.ts` **16** · `file-kind.test.ts` **14** · `lang-icons.test.ts` **14** ·
`html-block.test.ts` **14** · `focus-dim.test.ts` **15** · `bar-close.test.ts` **13** · `chart-ticks.test.ts` **12** · `sidebar-resize.test.ts` **12** ·
`video-view.test.ts` **12** · `doc-typography.test.ts` **11** · `status-metric.test.ts` **10** ·
`modal-trap.test.ts` **9** · `tree-options.test.ts` **9** · `empty-doc-save.test.ts` **8** · `window-title.test.ts` **8** ·
`tablist-keys.test.ts` **6**。
⚠️ 跑法两档：`share-card.test.ts` 要 `--loader:.svg=text`（它 import 了 `.svg`），
`share-card.test.ts` / `heatmap.test.ts` / `focus-summary.test.ts` / `keymap.test.ts`
要 `--alias:@=./src`（都走 `@/…` 路径），其余 **四十六份**两条都不要——**别照着一份的命令去跑另一份**。
📌 **本节这一格 2026-09-27 现数时发现它落后了两批**：原写"十八份、共 418 条"，
而那时 `slash.test.ts`（49 条）已经存在、只是没进这份清单（418 ＋ 49 ＝ 467，
正是 `docs/06` §6.3 当时的数）。**同一个数在两份文档里差 49**——那一批一并补齐并改成
**二十份 501 条**（＋ `focus-summary.test.ts` 34）。⚠️ 这就是"加一份要跟着改四处"
那条规矩为什么会漏：**`docs/02` 是第五处之外的地方，三道闸一条都不扫它**。
📌 **同一天深夜又现数一次，发现又漏了两份**（501 → 566，共 ＋65）：
`keymap.test.ts`（**54 条**，「快捷键」那一页的键位解析/冲突/序列化）与
`doc-typography.test.ts`（**11 条**，段落排版判据）。⚠️ 这 ＋65 里
**只有 54 条是这一批新写的**（`keymap`）；`doc-typography` 那 11 条是**旧账**——
它和 `chart-ticks.test.ts`、`instant-render.test.ts` 一样属于
**"写好之后从没进过任何名册"**的第三例，而且**当时连 `docs/06` §6.3 那个 `for`
循环都没进**，所以"每天跑一遍"从来没跑到过它。
📌 **2026-09-27 晚再补一份**（566 → 574）：`empty-doc-save.test.ts`（**8 条**，空文档存盘必须 0 字节，见 `docs/06` §5.31 ④）。⚠️ 这一份是**给一条已有判据配的测试**，不是新功能——它挡的那条路（"保镖"占位符的值漏进文件）此前一直是 7 字节，而且是**开窗时从状态栏那个字符数**上看出来的。
📌 **2026-09-27 夜（BUG-48 那一条，`inline-marks` 21 → 37，574 → 590，**份数不变**）**：新增的 16 条全在 `tests/inline-marks.test.ts` 一份里，**没有新文件**，所以 `for` 循环与本文的份数都不用动——这也说明"加测试要改四处"那条规矩里，**"哪四处"是看有没有新文件**：只往里加用例时，要改的是条数（`docs/06` §6.3 那张表、本节的表、`AGENTS.md` 那一行、`docs/09` §2 那一行）。⚠️ 同批修掉一条**假绿**：那份测试的 `unified()` 链从来没 `.use(remarkGfm)`，而产品链有，于是三条"`~下~` 不许被改写成 `~~下~~`"的断言测的不是产品那条路（详见 `docs/06` §6.3 末条 📌）。
📌 **2026-09-27 深夜再补一份**（590 → 633，**份数 23 → 24**）：`table-input.test.ts`（**39 条**，BUG-51）——手打表格那一行在这边的判据下算不算表格行（拆单元格 ／ 判分隔行 ／ 判两行）＋ **NBSP 回归**（WebKit 在**行末**把空格存成 U+00A0，判据与输入规则都得把它当空白）＋ 那道「匹配盖住整段」的闸（`prosemirror-inputrules` 拿「文档文字 ＋ 刚敲进去那颗字符」拼匹配串，逐字比会在 NBSP↔竖线上翻车）＋ 输入规则那条正则。⚠️ 同批把 `smart-punctuation` 从 **32** 补到 **36**（横线骨架那道守卫的 4 条）。⚠️ 这一份是**新文件**，所以四处名册 ＋ `for` 循环都要动（`docs/06` §6.3 末条 📌 记着那「五处」）。
📌 **2026-09-29（BUG-53 ＋ BUG-54 那一批，`auto-pair` 43 → 50，**份数不变**）**：新增的 7 条全在 `tests/auto-pair.test.ts` 一份里（第十一组「收尾落标记」），**没有新文件**，所以 `for` 循环与本文的份数都不用动。⚠️ **本节的绝对总数（657）已经旧了**——2026-09-27 之后又涨过几轮（MCP、表格那两处等），下一次现数时**以仓库为准**。⚠️ 同批前端那一遍**在容器里**（Node v22.23.1）有两份各挂 1 条（`heatmap` 20 挂 1、`share-card` 46 挂 1），挂的都是**月份标签**（期望 `8月` 得到 `Aug`）——根因是那份 Node 的 small-icu 里没有中文月份名。⚠️ **宿主上（Node v24.18.0）同一遍是全过的**，而两边 `icu_small` 都是 `true`，所以这一条要连 Node 版本一起看（两处实测的表在 `docs/06` §5.37）。与本批无关。
⚠️ 教训仍旧是同一条：**加一份测试要跟着改四处**（`docs/06` §6.3 的名册与 `for` 循环、
`AGENTS.md`、`docs/09`、本节），**闸门一处都扫不到**，只能靠人记。
📌 **2026-09-30（`heading-on-enter.test.ts` 16 条，**新文件**，份数 32 → 33，总数 820 → 836）**：
第 90 项「输入时先不放大」那一批——测 `editor/heading-on-enter.ts` 的 `算装饰条目()`
（全篇扫描：每行的 `段起`/`起`/`止`、待成块还是宽松、级数）与 `建装饰集()`
（正在写的那一段把宽松那条按住、严格那条照旧套）。⚠️ **本节这一格又落后了两批才被发现**——
上面那个"657 / 二十五份"是 2026-09-27 的数，此后 MCP、表格两处、`auto-pair` 那一批都涨过，
**真要数请跑一遍 `docs/06` §6.3 那个 `for`**（本轮当场跑的结果就是 33 份 836 条）。
⚠️ 这一批**又验证了一次那条规矩的漏法**：本节的绝对总数是**第五处之外**的东西，
三道闸一条都不扫它。
📌 **2026-09-30 同一天第二批（`heading-on-enter.test.ts` 16 → 19 条，**份数不变**，总数 836 → 839）**：
用户那句「**类似 `# 你好`。就是不回车只是显示加粗，回车变成标题。**」把宽松那条**并进了
同一条路**——`待装饰` 瘦成 `{起, 止}`、`建装饰集(doc, 条目)` 去掉了"正在写的段"参数
（`docs/05` §4.9c）。这一份测试跟着重写成三组：**扫哪些区间**（含 `#   标题` 多空格的、
以及"已经是标题块的不再进装饰"）／**严格档不许认 `#你好`**／**所有条目一视同仁**。
⚠️ 上一版测的"正在写的那一段先不放大"那三行判据**整个没了**，别照旧稿抄。
📌 **2026-09-30 同一天晚些（`sidebar-resize.test.ts` 12 条，**新文件**，份数 33 → 34，总数 836 → 855）**：
下栏照 Typora 重做那一批——测 `ui/SidebarResizer.tsx` 的 `夹侧栏宽()`
（夹宽度那七条：区间内原样／两个边界算合法／太窄／太宽／取整／`NaN` 退回默认／夹两次幂等），
外加**第一组四条是读源码对账的**：`theme/base.css` 的 `--sidebar-width`、
TS 的 `侧栏宽默认`、`appearance.rs` 的 `Default` **三处必须同值**（分居三个文件三种语言，
谁改一个另两处都不会吭声）。⚠️ 同一次现数还**补上了一笔旧账**：`auto-pair` **43 → 50**
（2026-09-29 BUG-54 那一批加的 7 条，那批只动了那一个文件、**没重跑名册**）。
⚠️ **拖动本身这一份一条都没验**（要真 React ＋ 真指针事件，本仓没有 jsdom），
跑法与目检清单在 `docs/06` §5.40。
📌 **2026-09-30 深夜（BUG-57，`source-mark.test.ts` 28 条，**新文件**，份数 35 → 36，总数 875 → 903）**：
「行内标记是开关，不是只会包」那一批（见本表 `editor/source-mark.ts` 那两行）——
测 `试摘定界符()`：八族各拨一遍（**判据是"拨完那段文字长什么样"**，把改动套回原文再比）、
嵌套／歧义一律「不动」（`***甲***`、`~~甲~~` 里套下标、`**粗体**` 里选中 `*粗体*`）、
边界（空选区／只有半边／跨行／**拨两下回到原样**），外加一组**读 `src/editor/source.ts`
的源码文本对账**（数 `切换行内标记(view,` 出现 8 次、链接那一行仍在 `wrapSelection` 上）。
⚠️ 因为最后那一组要读文件，这一份**必须在仓库根目录跑**（`cwd` 一换它就红，那不是误报）。
⚠️ **它证明不了**「按一下 `Ctrl+B` 真的会走到 `切换行内标记`」（没有 jsdom、没有真按键链）——
那半截是**开窗量的**，十条账见 `docs/06` §5.43。
⚠️ 同批 `src/editor/source.ts` **935 → 976 行**（离 1000 硬线只剩 24），
往它里面加东西之前**先看 `docs/09` §4 那条拆缝**。
⚠️ **2026-10-04 它 976 → 938 行**：那次拆的正是上面那条缝——`撞车键位` 那一大段
（含文件头那半篇"为什么"）搬去了 `editor/key-conflicts.ts`（101 行）。

📌 **2026-10-04（BUG-52 判据重写 ＋ 新 BUG-59；`table-pipe.test.ts` 24 → 39、`math-delim.test.ts` 23 → 43，份数不变）**：
用户同一天第二次报「还是会自动插入斜杠」，抓到**两颗**互不相干的反斜杠：① 行首竖线那颗的判据
原来问"这一段会不会跨行"，而他那两行（`| 1 | 2 | 3 |` ＋ 硬换行 ＋ `$ 你好 $`）**在同一段里**，
于是永远答不成立——改成问"**下一行长什么样**"（三档：像／一定不是／说不准）；② 上游
`mdast-util-math` 给**正文里每一颗 `$`** 都加了反斜杠（`价格 100$ 起` ⇒ `价格 100\$ 起`），
新增 `不转义美元` 挂在 `text-handlers.ts` 那条链的第二层。⚠️ 两处**都没有新文件**，
所以份数不变；⚠️ 同批**推翻了自己一个假设**（"GFM 表格必从段落第一行起"——实测
`甲` ＋ 表头行 ＋ 分隔行 ⇒ 段落 ＋ 表格，测试第四组钉着），所以新判据里没有"位次"这一项。
📌 **2026-09-30 深夜（BUG-54 二次结清，`auto-pair` 50 → 57，份数不变）**：新增的 7 条
（第十二组「收尾的三个触发时机」）同样全在 `tests/auto-pair.test.ts` 一份里，**没有新文件**。
⚠️ 这一批的教训值得记在这一节：**修法写了、覆盖面没写**——首修（09-29）只改了「跳过」那一支，
而那一支**要求有一颗真按键落在闭星号上**，`*` 是自配对的、闭星号是我方插的字符、永远没有按键
走到那儿，于是"补完直接打正文"这条最常见的路**压根没被覆盖**，而三份文档都读起来像"已经好了"。
⚠️ 同批还抓出**测试装置自己的一条 bug**：`造视图` 里那个偏移量原来写着 `Math.max(1, …)`，空段落
里只有一个位置，硬抬到 2 就跑到段落外面去——**此前没有一条用例用过空段落，所以它一直潜伏着**。
📌 **2026-09-27（`table-pipe.test.ts` 24 条，633 → 657，份数 24 → 25）**：行首那颗多余的 `\|`（用户报「切换到所见即所得模式再切换回来会自动添加「\」，表格出不来」）——判据是 `段落会跨行`（这一段能不能占两行以上）＋ `tableCell` 直接放行，⚠️ 这一份里有一条**对照**用例是承重的：**不挂这一层就复现出病**（不然"修好了"只是"测试没跑到"）。⚠️ 同批 Rust **505 → 547**（其中 `mcp/mod.rs` 18 ＋ `mcp/tools.rs` 13 ＋ `plugin/export.rs` 5），而**四道闸一条都不跑 `cargo test`**——这一批正好在 `lang.rs` 上踩到（把界面词「拓展」连着**标识符**一起改了，`cargo test --lib` 编不过、四道闸全绿），详见 `docs/06` §6.3 末条 📌 ④。
⚠️ `accent.test.ts` 有个**别处没有的做法**：
它 `readFileSync` 去读 `src/styles/theme/color.css`，把出厂那 15 对强调色的**前景色断言成**
`accentFg()` 算出来的那个——所以换风格批次时它会当场响（2026-09-26 正是它逮住了第一版规则的
7 处不合）。⚠️ 它们**不建 Editor、不开窗、不碰真 DOM**，盖住的只有纯逻辑：
React 组件、编辑器生命周期、CSS 一条都没有。**加一份要跟着改四处**（`docs/06` §6.3 那一段列着），
⚠️ 还有**闸门管不着的第五处**：`docs/06` §6.3 那个跑测试的 `for` 循环里的名字是穷举的。
⚠️ `tests/fixtures/` 仍是空的，Rust 集成测试**一条都没有**。

✅ **"grep 数 = cargo 数"这条自 2026-09-25 起重新成立**：
`grep -r '#\[test\]' src-tauri/src --include=*.rs | wc -l` ＝ **505**，
`cargo test --lib` 也报 **505 passed; 0 failed**（2026-09-27 深夜现数，两半都是本批当场跑的——
`grep` 在宿主、`cargo` 在 `tauri-dev` 容器；⚠️ 这一句此前手抄过 09-26 的 397、09-27 的 428，
每一次"同一个小节里两个数对峙"都是加完用例忘了改这儿——**这一节的两半要么一起改、要么都别写**）。
它是 2026-09-25 白天**假过一次**的——当时
`plugin/package.rs`（11 条）与 `plugin/installed.rs`（8 条）写好了却**没有在 `plugin/mod.rs`
里声明 `mod`**，于是 grep 数得到而 cargo 跑不到，两个数差 18。那一批"插件装卸/签名"
把 `mod package; mod installed; mod install;` 补齐、`install.rs` 也从 `mod.rs` 里拆了出来，
差额归零。**以后再出现差额，先去看 `plugin/mod.rs` 的 `mod` 声明齐不齐**——
那正是当初的病灶，也还可能是下次的。
⚠️ **两个数都要现数**（`grep … | wc -l` / `cargo test --lib`），别拿上表的合计去减——
这一天里两边都动过，凭差额推出来的数会有两个来源的误差叠在一起。
⚠️ **删文件时最容易漏的就是这张表**：这一轮删掉 `slidev.rs` / `slidev_probe.rs` 时，
它们那两行在上面挂了半天——**删源文件的人不会自动想起文档里还有一张按文件列数的表**。

⚠️ **总数只在 `docs/06` 记数**（那里写着一份"这 N 条到底钉住了什么"的说明）。
本表列**逐文件**明细，是为了回答"改这个文件时哪几条会红"。
⚠️ **本表落后过真值五次**（最近两次：2026-09-25 `settings.rs` 一行拆成 `settings/` 八行后没跟上，
2026-09-24 晚新增 `lua/api/diff.rs` 后也没跟上——两次都已补）：
一次漏掉两个文件、总数停在 32（漏了 `lua/api/mod.rs`
与 `lua/mod.rs`，而 `docs/06` 已经写到 40）；2026-09-23 又停在 45；
**2026-09-24 重数时又发现三处**——`native_menu.rs` 那 6 条**整行没有**（上一批说"补齐了"，
只补了 `docs/06` 那边）、`settings.rs` 写 3 实 4、`themes.rs` 写 7 实 6
（少的那条随"停止扫描外部编辑器主题目录"一起删了，表没跟着改）。
**两张表都是手抄的，这就是它们会分叉的原因。** 每次都是按 `cargo test --lib` 报的
总数重排的——**测试数变动后，本表与 `docs/06` 都要重跑一次计数。**

⚠️ **下面每个小节标题里的「N 行」同样是手抄的**，2026-09-23 一次核对发现 13 处是旧数
（最多的 `lua/mod.rs` 差 209 行——它当年 255 行，现在 464）。这些数字不可信，
要真值就跑这一条（只打印对不上的）：

📌 **2026-09-26 上传那批收工时又跑了一遍，一次**16 处**全对不上**（最大的是
`bridge/ipc.ts`：写着 968、实际 432——它是那天**拆成两份**的（`ipc.ts` ＋ `bridge/types.ts`），
拆完只改了正文、没回来改这个小标题）。当时写的是「**这 16 处已一次性对齐**，所以现在这一批是准的」——⚠️⚠️ **那句话在 2026-09-26 当日又被证伪了**：把上面那条命令原样再跑一遍，跳出来的是 **55 处**（对齐了本节标题 5385 那一串里的 3 个之后是 54）。它和 BUG-41 是同一个病：**把"打算核对"记成了"核对过了"**（见 `docs/07` §4 那一行）。所以这里的规矩只有一条：**这个数每次都要真跑，别信上一句结论。**
⚠️ 但那一天里 `src/editor/create.ts`（这次也在那 16 处里，702 → 785）与
`src/editor/math-view.ts`（**没有小节标题，所以这条命令查不到它**）**都还在被另一批写**，
下次核对前先看这两个文件的 mtime。

📌 **2026-09-26 LaTeX 那批收笔后已复核**：`create.ts` 因为接了两处线（`.use(mathView)`
与那条 import）收在 **794** 行，小标题已改；`math-view.ts` 收在 **770** 行（同一天的开窗复核又给它加了 23 行：渲染区那条 `mousedown` 与解释它的注释，见 `docs/07` §2 BUG-37），它**仍然
没有小标题**——所以上面那条命令**查不到它**，要它的数就 `wc -l`。⚠️ 另外 **AGENTS.md
§2 与 `docs/09` §2 的登记行现在补上了**（此前只有 §5.1 那张说明表里提过它，而 ⑤ 用的是
子串匹配，于是「写下警告」这件事本身让警告消失了——那条边界记在 `docs/09` §5.1）。

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

## `src-tauri/src/lib.rs`（359 行）

建 Tauri 应用、按顺序启动、注册全部命令、挂窗口事件。模块头把**启动顺序为什么是这个顺序**
写在最上面（`docs/01-architecture.md` 把它展开讲了一遍）。

### 模块声明

```rust
pub mod cli;            pub mod pandoc;
pub mod commands;       pub mod pandoc_format;
pub mod devserver;      pub mod paths;
pub mod document;       pub mod pdf_print;
pub mod error;          pub mod plugin;
pub mod lang;           pub mod proc;
pub mod log;            pub mod settings;
pub mod lua;            pub mod state;
pub mod native_menu;    pub mod themes;
```

**18 个 `pub mod`**（上面按字母排成两栏，`lib.rs:18-35` 是原本的顺序）。
⚠️ 2026-09-25 这一轮**减二加二**：`slidev` / `slidev_probe` 两个声明删掉
（`devserver` 是它们的继承者），新增 `devserver` / `lang`。

### `pub fn run()`

无参数、无返回（`-> ()`）。里面 `tauri::Builder::default()` 链式装配：

1. `.plugin(tauri_plugin_dialog::init())`、`tauri_plugin_fs::init()`、`tauri_plugin_opener::init()`
2. `.setup(|app| { … })`：
   - `Settings::load()` → 失败则 `日志!("[nota] 读设置失败，本次用默认值：{e}")` +
     `Settings::default()`，并把**压成一行**的那句话塞进 `AppState::settings_problem`
     （为什么压行：`toml` 的报错是六行带 ASCII 箭头的，原样进提示条就是"界面坏了"）。
     ⚠️ **`日志!` 不是那条提示**：提示条是给用户的，`日志!`（`log.rs`，默认不打）是
     给开发者的；两个渠道别互相顶替
   - 建 `documents` / `settings_arc` / `workspace` 三个 `Arc<Mutex<_>>`
   - **算界面语言**（2026-09-25 加，`lib.rs:140-152`）：把设置里那一格
     （可能是 `auto`）与系统语言一起交给 `lang::有效语言()`，得到 `应用语言`。
     ⚠️ **一次算清、之后不再变**——插件在加载时按它挑好了文案表，运行中再变
     就会出现"外壳中文、插件英文"那种中间态
   - `let resource_dir = app.path().resource_dir().ok();`
   - 建 `base: HostContext`，其中 `plugin_id: String::new()` 是**占位**，
     `discover()` 里每个插件会换成自己的 id（`HostContext { plugin_id, ..base.clone() }`）；
     `应用语言` 也在这里塞进去
   - `let plugins = PluginHost::discover(resource_dir, &base);` 然后
     `日志!("[nota] 载入 {} 个插件", plugins.count());`（⚠️ 默认不打，`NOTA_DEBUG=1` 才出）
   - `app.manage(AppState { documents, settings, workspace, plugins: Mutex::new(plugins),
     settings_problem: 启动时的问题, app_lang: 应用语言 })`
     （⚠️ 后面两个字段是 2026-09-25 加的；`app_lang` 与上面算的是**同一个值**）
   - 另托管两份**不属于 `AppState`** 的状态：`devserver::DevServerState` 与
     `plugin::ReviewState`。⚠️ 两者都不在那条锁序上，理由见 `docs/01` §② 第 ⑤ 步
   - `Ok(())`
3. `.invoke_handler(tauri::generate_handler![ …77 项… ])`，前 75 项是 `commands::*` 里的命令
   （document 14 / workspace 4 / settings 6 / theme 3 / plugin 13 / menu 1 /
   export 4 / pandoc 2 / image 1 / image_upload 3 / focus 6 / table_width 3 /
   watch 1 / diff 1 / ui_style 3 / session 6 / path_kind 1 / webview 2 / window 1），最后两项是本文件里的 `nota_frontend_ready` 与 `nota_startup_file`。
   ⚠️ **2026-09-27 晚第十遍重数**（**当场跑配方数的**，不是照上一版加二）：
   77 = 75 + 2。相对第九遍那次的 65，多出来的 12 条里**只有 2 条是本批的**
   （`nota_doc_rename` / `nota_doc_move`），另外 **10 条是别的会话在这之间落的**
   （session 6 / path_kind 1 / webview 2 / window 1）——重数顺带把它们数进来了，
   别读成"重命名顺带做的"。
   ⚠️ **这个数数错过八次**（第三、四、五次都是"分组小标题"没跟上；
   第七次是**减掉一整组**——`nota_slidev_*` 八条随文件一起删了；
   **2026-09-27 第八次最阴**：不是少加一条，是**五整组（focus 6 / table_width 3 /
   diff 1 / watch 1 / ui_style 3）从没进过 `docs/01` 那张分组表**，
   于是"总数"和"分组表"各自都对、合起来差 16），数法见
   `docs/01-architecture.md`「通道 A」。⚠️ 上面这个分组小计是**手抄**的，
   加之前先按那一节印的配方重数一遍
4. `.on_menu_event(|app, event| …)`（**2026-09-23 加**）：把 `event.id().0`
   经 `emit("nota:native-menu", …)` 发回前端。⚠️ 这里**不执行任何命令**——
   在 Rust 里再写一遍"哪个 id 干什么"就又成了两个真相源，而且大部分命令
   本来就得前端执行（改 React 状态、动编辑器），这边根本没有入口
5. `.on_window_event(|window, event| …)`：`WindowEvent::Destroyed` 时**按 `window.label()` 分派**
   （2026-09-23 加预览窗口时才需要分派，在那之前是「任何窗口销毁都卸载全部插件」）：
   - `"main"` → `window.try_state::<AppState>()` → `state.plugins.lock()` → `host.unload_all()`。
     给插件一次 `on_unload`，让它们有机会落盘自己的状态；
   - `"slidev"` → **故意什么都不做**（2026-09-25 改）。⚠️ 这里原来是
     `slidev::stop()` ＋ `emit("nota:slidev-stopped")`，预览搬进插件栏、
     **独立窗口也一起删掉**（2026-09-25 同日之后）。
     ⚠️ **`_ => {}` 这个通配分支今天一次都跑不到**（全仓只剩 `main` 一个窗口），
     **但整个 `match` 不能简化掉**：`"main"` 那个 arm 是"关窗时卸插件"的**唯一**
     一处，**不分派 label 的话"叉掉别的东西 = 插件全没"**（2026-09-23 真踩过）。
     分支留着，只是空的。
6. `.build(...)` + `.run(|app, event| …)`：`RunEvent::Exit` 时
   `DevServerState::stop_all()`（2026-09-25 加）。⚠️ **这是兜底**——平时收摊走插件
   自己的 `stop`，但用户开着预览直接关应用时，那些 `Command` 起的子进程**不在
   Tauri 的管理范围内、会自己接着跑**。⚠️ 只认 `Exit`（清理阶段，一定跑得到），
   **不认 `ExitRequested`**——后者可以被"要不要保存"那种对话框取消掉。

失败行为逐项见 `docs/01-architecture.md` 的"每一步失败会怎样"表。要点是：
**只有第 6 步会让进程直接死掉**，其余每一步都是"记一笔然后继续"。

⚠️ 第 2 步里 `AppState` 是**手写字面量**（`state.rs` 那个结构体**没有构造函数**，2026-09-24 把没人调用的 `AppState::new` 删了——见 `state.rs` 那一节）。
⚠️ 同一行里 `DocumentStore::new(settings.strict_markdown)` 那个**参数不能漏**：标签页标题是文档仓自己算的。

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

### `#[tauri::command] fn nota_startup_file() -> Result<Option<String>, NotaError>`

```rust
#[tauri::command]
fn nota_startup_file() -> Result<Option<String>, error::NotaError> {
    let path = match cli::首个要打开的文件(std::env::args_os()) {
        Some(p) => p,
        None => return Ok(None),
    };
    Ok(Some(crate::paths::path_to_string(&path)?))
}
```

2026-09-25 加。**宿主只把参数挑出来转告前端，不自己打开**（`docs/01` 有那条
分栏说明）——打开文档那条路在前端只有一份（`App.tsx::openPath`，连"读不出来
弹提示条"都在那里），宿主再写一份就是第二个真相源，而且 `setup` 里出错
**没有出路**：只能进终端，双击文件的用户一个字的反馈都看不到。

⚠️ **2026-09-25 当天又改了一次**：文件名不是合法 UTF-8 时**返回 `Err`，
不再静默给 `None`**。原来那一支只往 stderr 记一行然后不打开——界面上
"双击了没反应"，而那一行后来还归了调试闸门，等于彻底静默。**也不能往回传
lossy 串**：那会拼出一个不一样的路径，然后弹"路径不存在"（文件明明在）。
所以如实报错（`NotaError::NonUtf8Path`），由前端弹一条提示条；
⚠️ 前端那一枪**自带 `catch`**（`App.tsx` 启动那段），因为它在 `Promise.all` 里，
一个打不开的文件不该把设置 / 主题 / 文档列表一起掀掉。

⚠️ **它不读 `AppState`**（所以没有 `state: State<…>` 参数）：参数表在进程
整个生命周期里不变，直接在调用点读 `std::env::args_os()` 就行，不必在 `setup`
里存一份。

### 测试

无（挑参数的规则在 `cli.rs`，那边有 16 条）。

---

## `src-tauri/src/cli.rs`（368 行）

命令行参数。今天认两件事：**头一个不像选项的参数就是"要打开的文件"**，以及
**有没有 `--new-window`**（2026-09-27 晚加的，见本节末）。
`nota 笔记.md`、文件管理器的"用 Nota 打开"、把文件拖到图标上，三条路最后
都是同一个 argv。⚠️ 2026-09-25 之前这里**什么都不认**：双击一个 `.md`
（关联到 Nota）会开出一个空白编辑器，用户以为文件丢了。

### `pub fn 首个要打开的文件(args: impl IntoIterator<Item = OsString>) -> Option<PathBuf>`

```rust
pub fn 首个要打开的文件(args: impl IntoIterator<Item = OsString>) -> Option<PathBuf> {
    args.into_iter()
        .skip(1)                                   // 零号参数是程序自己
        .find(|a| {
            let s = a.to_string_lossy();
            !s.is_empty() && !s.starts_with('-')   // 选项 / 空串都不算路径
        })
        .map(PathBuf::from)
}
```

⚠️ **不判存在性、不读文件**。判了就等于把失败吞在这一层：用户双击一个被删掉的
文件，界面上什么都不会发生，他只会得出"Nota 打不开文件"。这里只回答"哪个参数算
路径"，读不读得出来由打开文档那条既有的路照常报（弹提示条）。
⚠️ 以 `-` 开头的当选项跳过，今天**一个选项都没有**，这条纯属防御：启动器
（桌面环境、IDE、`cargo run -- …`）塞进来的 `--foo` 不该被当成一个叫 "--foo"
的文件去打开，然后弹一句"路径不存在"。
⚠️ 只认**第一个**：多路径该"各开一个标签"还是"只认头一个"没人定过，先不做；
真要做时改这一个函数，调用方不用动。
⚠️ 因此它是**纯函数**（没有 IO、没有 Tauri 类型），才测得了——4 条用例钉的是
"跳过程序自己""选项跳过但后面那个还算数""不判存在性"。

### `pub const 新窗口选项: &str` ＋ `pub fn 要开新窗口(args) -> bool`（2026-09-27 晚）

「标签页右键 → 在新窗口中打开」那一半：`commands/window.rs` 起新进程时**用这个常量
拼命令**，`lib.rs` **用同一个常量**判"这一份进程整关跳过单实例"。所以那个串
**只许在常量这一处写**——两处各写一份字面量，改一处忘一处，症状是"新窗口起得来、
但第二份被第一份吃掉了"。

```rust
pub fn 要开新窗口(args: impl IntoIterator<Item = OsString>) -> bool {
    args.into_iter()
        .skip(1)                                    // 零号参数是程序自己
        .any(|a| a.as_os_str() == OsStr::new(新窗口选项))
}
```

⚠️ **判据是 `OsStr` 整串相等**，比较的是 `as_os_str()`。**不是** `to_string_lossy()`
之后的 `contains`——后者会把 `--new-windowish` 也认成新窗口，而且"这个参数能不能被
有损转换"本身就不该当判据（与 `single_instance.rs` 里路径按原始字节传同一条口径）。
⚠️ **`.any` 不是 `.find`**：这个选项**位置不拘**（真拼出来的命令是 `--new-window <路径>`，
但用户手敲 `nota --new-window`、或以后再加别的选项，都不该要求它排第几）。
⚠️ **零号参数不算**：程序自己的路径理论上可能就叫 `--new-window`（少见但合法），
与 `首个要打开的文件` 同一条规矩。
⚠️ 它与 `首个要打开的文件` **不打架**（`--new-window` 以 `-` 开头，挑文件那条会跳过它），
有用例专门钉这一条。

### 测试（16）

| 用例 | 钉的是什么 |
|---|---|
| `只有程序自己时没有要打开的文件` | 零号参数不能被当成文件 |
| `第一个非选项参数就是要打开的文件` | 正常那条路 |
| `选项被跳过而它后面那个路径仍然算数` | 见到选项不放弃，继续往后找 |
| `不判存在性也不读文件` | 不存在的路径照样返回（报错是前端的事）；空串不算 |
| `新窗口那个选项认得出来` | **位置不拘**：头一个、末一个、夹在中间都算 |
| `程序自己的路径不算选项` | **零号参数不算** |
| `普通启动不是新窗口` | `--new-windowish` 不算，要**整串**相等 |
| `新窗口选项不妨碍挑出要打开的文件` | 与 `首个要打开的文件` 不打架 |

（其余 8 条是 2026-09-27 白天 `nota://` 那批留下的，全在 `nota://` 的解析上：百分号
解码／`nota:` 与 `nota://` 同解／协议名不分大小写／`+` 不当空格／`path` 那一段之外的
参数不影响／解不出来一律 `None`／坏链接不静默丢掉／从参数表里挑出来时已经是路径。）

---

## `src-tauri/src/error.rs`（130 行）

统一的错误类型。约定（与 Folio 的 GError 口径一致）：**每一个跨 IPC 边界返回的错误都要能读懂**。
前端拿到的不是 `Err(Os { code: 2 })`，而是"打开 /path/x.md 失败：文件不存在"。
所以 `NotaError` 的 Display 一律写成人话，命令层直接把它转成 String 返回。

### `pub type Result<T> = std::result::Result<T, NotaError>;`

全仓的 `Result` 指的是这个。⚠️ 在 `lua/api/*.rs` 里会同时出现
`NotaResult`（`crate::error::Result` 的别名导入）与 `mlua::Result`，读的时候看清是哪个。

### `pub enum NotaError`

| 变体 | Display 模板 | 什么时候出 |
|---|---|---|
| `Read { path, source }` | `读文件失败 {path}：{人话(source)}` | 读文件/目录失败 |
| `Write { path, source }` | `写文件失败 {path}：{人话(source)}` | 写文件、建目录、删文件失败 |
| `NonUtf8Path(PathBuf)` | `路径不是合法的 UTF-8：{0}` | `paths::path_to_string` 转换失败 |
| `NoHomeDir` | `找不到用户目录（$HOME / $XDG_CONFIG_HOME 都没探到）` | `dirs::*_dir()` 返回 `None` |
| `Config(String)` | `配置读写失败：{0}` | 设置解析/序列化失败 |
| `Manifest { file, reason }` | `插件清单有误（{file}）：{reason}` | 清单字段校验不过 |
| `PluginApiMismatch { id, wanted, have }` | `插件 {id} 需要 API 版本 {wanted}，宿主是 {have}` | `api` 号不精确相等 |
| `Lua { plugin, message }` | `Lua 出错（插件 {plugin}）：{message}` | Lua 侧报错 |
| `NoActiveDocument` | `没有活动文档` | 需要活动文档但没有 |
| `Other(String)` | `{0}` | 兜底，直接当消息用 |

### `fn 人话(e: &std::io::Error) -> String`（私有）

`Read` / `Write` 里那个 `{source}` **不直接显示**：先过这一道，按 `io::ErrorKind`
翻成中文——`NotFound` → 「路径不存在」、`PermissionDenied` → 「没有权限」、
`InvalidData` → 「内容不是合法的 UTF-8 文本」、`IsADirectory` → 「那是一个文件夹，不是文件」、
`AlreadyExists` → 「同名文件已经存在」、`StorageFull` → 「磁盘空间不够」。

⚠️ **没见过的 kind 原样透出**（`_ => e.to_string()`）。那句英文虽然夹生，
但它说的是**到底哪儿不对**；一律换成"读文件失败"等于把排查线索丢掉。

⚠️ 起因（2026-09-25）：打开一个非 UTF-8 的文件，界面上弹的是
「读文件失败 x.md：stream did not contain valid UTF-8」——中英夹生，
而 `docs/08` §1.3 的口径是界面文案一律中文。用户看见它的第一反应是
"这功能是不是没做完"，不是"这文件不是文本"。

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
不必认识错误的内部结构。

⚠️ 注意这意味着**前端拿不到错误的种类**，只有一个字符串。要按错误种类分支（比如"文件已被
外部删除"另走一条路）就得改成结构化序列化——在那之前，前端不应依赖字符串匹配。

### 测试

无。

---

## `src-tauri/src/log.rs`（68 行）

**调试输出的总闸门**（2026-09-25 加，用户要求「不要设置默认日志显式输出。
默认不输出，除非开启调试模式」）。

两个东西，没有别的：

```rust
pub fn 开着() -> bool;              // NOTA_DEBUG 只读一次，OnceLock 缓存
macro_rules! 日志 { … }             // 只在开着时 eprintln!
```

⚠️ **后端所有往 stderr 写的地方都走 `日志!`**（`lib.rs` 的启动三步、
`native_menu.rs`、`plugin/mod.rs`、`lua/mod.rs`、`lua/api/mod.rs` 的
`nota.log.*`、`lua/api/settings.rs`）。**再加输出时也走它**，
裸写 `eprintln!` 会把"默认静默"这条规矩一点点漏掉——全仓 grep
`eprintln!` 时除了本文件应当一个都搜不到。

为什么单开一个模块而不是每个调用点各写一个 `if`：闸门**只在一处**读环境变量、
**只读一次**，将来要加级别、要改成写文件、要加时间戳，只动这一个文件；
也不会出现"三处记得判、一处忘了判"。⚠️ 关着时**参数不求值**（`eprintln!`
没执行，格式化和 `Display` 就不发生），所以开着 `if` 的代价只有一次缓存读。

认得的写法 `1` / `true` / `yes` / `on`（不分大小写），其余（`0`、空串、没设）
一律当**关**。说明书在 `docs/06` §3.1（哪几行、什么时候看）与 §3.4（变量表）。

⚠️ **用户看得见的东西不走这里**：设置读坏了是启动 toast（`state.rs::settings_problem`）、
命令失败是 `NotaError`、插件加载失败是侧栏那行红字。判据是一句话——
**用户看了也不知道该做什么的，才收进闸门。**
⚠️ **前端的 `console.*` 也不走这里**：它压根不进终端（Tauri 不转发 WebView
的控制台），要看只能开 devtools，而那个动作本身就等于调试模式。

---

## `src-tauri/src/paths.rs`（258 行）

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

⚠️ `user_themes_dir()` **只算路径不建目录**——`nota_doc_themes_open_dir` 命令那侧才 `ensure_dir`。
理由：首次启动就凭空造一个空目录，用户会以为里面该有什么东西。

⚠️ **它是当前唯一的主题目录**。2026-09-23 之前这里还有个 `theme_dirs()`（三条来源，
含外部编辑器的两个主题目录），那版整个删了，理由见上面那一节。

⚠️ `pub fn cache_dir() -> Result<PathBuf>`（`$XDG_CACHE_HOME/nota`）**定义了但没有调用者**——
今天没有任何东西往缓存目录写。留着是因为它是这套布局里少不得的一格，不是漏接的线。

### ~~`pub fn theme_dirs()`~~（**2026-09-23 整个删了**）

**曾经**是主题发现的三条来源（Nota 自己的 + 外部编辑器的两个主题目录），**同时**是
`themes.rs::check_scope()` 那道围栏的依据。

用户 2026-09-23 定下「不要内置外部编辑器的主题，会侵权」「外部编辑器的主题先不用兼容」之后，
**这个函数连同 `check_scope()` 一起删了**——扫描外部编辑器主题目录这件事本身就不做了。

现在只扫**一个**目录：`user_themes_dir()` = `~/.config/nota/themes`（**按 XDG 算**，
不写死 `~/.config`）。围栏也跟着换了一种做法，见 `themes.rs::check_id`。
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

## `src-tauri/src/state.rs`（69 行）

应用全局状态。文件头就是**锁序不变量**的正文（`plugins → documents → settings`），
理由与今天实际会交叉的路径见 `docs/01-architecture.md` 的"共享状态与锁顺序"。

### `pub struct AppState`

| 字段 | 类型 | 说明 |
|---|---|---|
| `documents` | `Arc<Mutex<DocumentStore>>` | 与 `HostContext.documents` 是**同一个 `Arc`** |
| `settings` | `Arc<Mutex<Settings>>` | 同上 |
| `workspace` | `Arc<Mutex<Option<PathBuf>>>` | `None` = 没开文件夹（"单文件模式"）。**不参与锁序** |
| `plugins` | `Mutex<PluginHost>` | 锁在**最外层**（最先取） |
| `settings_problem` | `Option<String>` | 开机读设置时出的问题，读成功是 `None`。**只写一次、此后只读，所以不是 `Mutex`** |
| `app_lang` | `String` | **界面语言**（2026-09-25 加）。开机算一次、此后只读，所以也不是 `Mutex`。⚠️ 与 `settings/general.rs` 里那一格**不是一回事**：那一格可能是 `auto`，这里是算完的**结果**（`lib.rs:140-152` 算，`lang::有效语言` 是判据）。⚠️ 插件的文案表在加载时就按它挑好了——**改语言要重启** |

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

## `src-tauri/src/settings/`（模块目录，十一个文件）

用户设置。**2026-09-24 从单文件 `settings.rs`（当时 298 行）拆成目录**——一次性加进来
三十多个设置项，全塞进一个文件会超过 1000 行的上限，所以按**界面上的页**拆，一页一个文件。
三个枚举、`Settings` 结构体本体、`load` / `save` 与那十个老字段都留在 `mod.rs`；
拆出去的**十**个文件各装一张表（见下表，其中 `document.rs` 装的是「文档主题」那一页、
`keys.rs` 装的是「快捷键」那一页里**用户改过的那几条**）：

| 文件 | 行数 | `#[test]` | 装什么 |
|---|---|---|---|
| `mod.rs` | 585 | 10 | 三条外观轴、`UiStyle`（**八个变体**，2026-09-26 加了 `Windows10`） / `UiMode` / `ViewMode`、`Settings` 本体、`load` / `load_from` / `save` / `save_to` |
| `markdown.rs` | 534 | 5 | `[markdown]` 表：语法偏好 / 扩展语法 / 智能标点 / 代码块 / 公式 / 空格与换行（六组，十页里组数最多的一页） |
| `files.rs` | 225 | 4 | `[files]` 表：启动选项 / 大纲折叠 / 默认扩展名 / 切换文件时自动保存 / 最近记录 / 拖放行为 / 文件树过滤。⚠️ **`startup` 三档 2026-09-27 才真的生效**（在此之前没有任何一处读它，而前端无条件恢复一切——见 `StartupAction` 那一段）：`new-file`（默认，开一张白纸）/ `last-file`（恢复标签）/ `last-session`（标签 ＋ 上次那个文件夹）。⚠️ **第三档的枚举名改过**：原先叫 `Folder`，落盘字面量是 `"folder"`，现在叫 `LastSession`，落盘是 `"last-session"`——**`#[serde(alias = "folder")]` 那条别名不能删**，删了老设置文件整份读不出来，用户看到的是"偏好全没了" |
| `editor.rs` | 208 | 7 | `[editor]` 表：缩进 / **智能符号补全** / Emoji 补全 / 显示当前块源码 / 复制行为 / 换行符 / 拼写检查 / 打字机模式**/ 段首缩进**。⚠️ **2026-09-28 把「自动配对」那一格改成了「智能符号补全」**（`smart_symbols`，默认开）：它**取代了 `match_brackets` / `match_markdown` 两条死开关**——那两条存了值、从来没有任何代码读过，拨了等于没拨；老设置文件里留着那两行不报错（`#[serde(default)]` 忽略未知键），另有一条用例专门钉住这件事。⚠️ **两条"缩进"不是一个字段**（`default_indent` 往文件里插空格、`paragraph_indent` 只改 `text-indent`），而且**默认值都是 2**——所以有一条用例专门把两个数设成不一样的值再落盘，防着"写串了看不出来" |
| `appearance.rs` | 329 | 12 | `[appearance]` 表：自定义字号 / 缩放 / **Ctrl+滚轮（两格）** / 状态栏 / 字数统计 / 工具栏 / 深色独立主题。⚠️ 工具栏那一项是**三个词**（`ToolbarMode`），`appearance.rs` 里有一条测试专门钉「这是三个词」，另有一条钉「老设置文件里那个布尔被忽略而不是报错」；⚠️ 滚轮那两格也各有钉：**默认是字号**（不是照名字猜的"缩放"）、两档落盘是 `font_size` / `zoom`、老设置文件里没有目标那一格也读得进来。⚠️ **行数 329 是 2026-09-27 数的**（上一版写着 167，是旧数）；逐格说明见 `docs/03` §5.6b |
| **`document.rs`** | 222 | 6 | **`[document]` 表**：正文的行距 / 段距 / 字体 / 字号（**2026-09-27 新增**，界面上的那一页叫「文档主题」）。⚠️ **表名和页名差一点是有意的**：顶层那个老字段 `document_theme` 管"用**哪一套**主题"，这张表管"那套主题给的默认值里**哪几项我不听它的**"——叫 `[doc_theme]` 会让人以为是同一个东西的两种写法。⚠️ **这四项不是第四条外观轴**（一个像素都不出编辑区），它们是**文档主题的覆盖值**；四项**都写成「开关 ＋ 值」两个字段**，因为默认必须是"跟随主题"——三套内置主题行距分别是 1.9 / 1.75 / 1.68，写死一个数就等于把主题之间的差别抹平了（同 `[editor]` 的段首缩进、`[appearance]` 的字号，别另发明一种姿势）。⚠️ `docs/02` 这张表此前**一直没有它这一行**（文件 2026-09-27 就有了），与 `keys.rs` 是同一种漏 |
| `image.rs` | 190 | 4 | `[image]` 表：**插图动作（五档 `InsertImageAction`）** / `custom_dir`（「复制到指定路径」那条） / 适用范围（`apply_to_local` / `apply_to_remote`） / 图片语法偏好（`prefer_relative` / `add_dot_slash` / `escape_url`）。⚠️ 2026-09-26 之前是 2 条用例、`insert_action` 只有两档；那一批把动作补到五档并**把三个"存得下、不生效"的字段接上了行为**（`docs/07` 第 62 项）。⚠️ **仍然没有「上传服务」那一组，而且这一条现在是对的**：上传的设置（含令牌）**故意不在这张表里**，它在 `~/.config/nota/image-upload.toml`（0600），所以本文件末尾那条用例 `图片设置里不许出现上传与密钥` 盯的是「别把带令牌的那一组搬进 0644 的 `settings.toml`」——2026-09-26 第二批改的口径，见 `docs/10` §11.2 第二类 |
| `export.rs` | 74 | 2 | `[export]` 表：默认导出文件夹 / 导出后打开所在目录（这一页只有两条）。⚠️ **没有「Pandoc 路径」那一格**，理由 2026-09-25 换过一次口径：不是「不做 Pandoc」（七种格式现在真借它转），而是**不存路径**——存下来的会过期（换机器、改 PATH、重装），每次现探 |
| **`focus.rs`** | **250** | **10** | **`[focus]` 表**：强制专注的六个旋钮——`total_minutes`（总时长 ＝ 余额上限）/ `alarm_minutes`（起始余额）/ `gain_per_minute` / `drain_per_minute` / `grace_seconds` / `sound`，另加 `introduced`（首次说明弹过没有，**要落盘**）。⚠️ 余额在内存里是**整数毫秒**（浮点每秒累加会漂），设置里是分钟；`上限毫秒()` / `起始毫秒()`（起点夹到上限）/ `赚(拍毫秒)` / `赔(拍毫秒)` 就是那一层的换算。⚠️ 有一条用例专门钉「这里没有任何东西能去看别的程序」——用户要的「依据在开什么应用而判断」**不做**，那是读别人的窗口 |
| **`keys.rs`** | 114 | 5 | **`[keys.overrides]` 表**（**2026-09-27 新增**，界面上的那一页是「快捷键」）：命令 id → 键位串，**只放用户动过的那些**。⚠️ **只存差量不存整张表**有两个理由：加了新命令时老用户的快照里没有它（缺的那条静默地没有快捷键）、改一个默认键位时所有用户被钉在旧值上。⚠️ 值是**空串**的含义是"这条命令**不要**快捷键"，与"表里没有这个 id"（＝回到默认）**必须能分开**，否则用户改不回默认。⚠️ **不清洗、不校验**（认不得的 id、认不出的键位串原样存原样取）：判据在前端（`ui/commands.ts`），在这儿重写一遍迟早两边不一致。⚠️ 用 `BTreeMap` 不用 `HashMap`，为的是**存盘字节稳定**（用户拿去 diff 不会满屏乱跳） |
| `general.rs` | 92 | 3 | `[general]` 表：只有 `debug_mode` 一项（其余如实标"不做"） |
| 合计 | **2794** | **67** | — |

⚠️ **上表的行数与用例数 2026-09-27 深夜按现数整表刷新过一次**（`wc -l` ＋ `grep -c '#\[test\]'`，
合计 **2794 行 / 67 条**）：上一版写着 2150 / 48，而 `mod.rs`（578 → 585）、`markdown.rs`（461 → 534）、
`files.rs`（182 → 225）、`editor.rs`（175 → 179）都在这一天里被**别的批次**改过；
⚠️ 更要紧的是**上一版整张表漏了两个文件**——`document.rs` 与 `keys.rs`
（前者 2026-09-27 早就有了，只是一直没进这份表；后者是本批新增）。
**"文件在目录里"和"文件在这张表里"是两件事**，这一节没有闸门扫（同本节前面
"漏了两份前端测试"那两笔，是同一类错）。

⚠️ **老的那十个顶层字段一个都没挪**（`ui_style` / `ui_mode` / `document_theme` / `view_mode` /
`ui_font_size` / `content_width` / `confirm_unsaved` / `autosave_seconds` / `strict_markdown` /
`enable_physics`）。搬进对应的表看起来更整齐，但**搬家会让老设置文件里的值静默丢回默认**：
用户开了 physics、升级之后公式全变成红字报错，而他的 `settings.toml` 一个字都没变。
所以 `strict_markdown` 与 `enable_physics` 界面上画在 Markdown 那一页，字段却还在顶层
（`mod.rs` 文件头写着这条取舍，`mod.rs` 的测试 `老设置文件里没有那七张表时全是默认值` 钉着它）。
⚠️ 新字段一律进 `[页名]` 表，而**表必须声明在标量之后**——TOML 要求"标量在前、表在后"，
挪到前面 `save()` 会在写盘那一刻报 `values must be emitted before tables`
（有测试 `标量写在表前面否则_toml_会拒收` 当守门员）。

文件头（`mod.rs` 顶上那段）讲的是三条**互相独立**的外观轴（用户 2026-09-22 明确要求，不许合并成一条）：

1. `ui_style` —— **界面风格**，一整套设计语言（八种具体风格见下），
   换的不只是颜色，还包括控件形状、圆角、间距、动效、字体栈。⚠️ 它**不是**"主题"的同义词。
2. `ui_mode` —— 明暗。`auto` 时跟随系统（Linux 走 XDG desktop portal 的 `color-scheme`）。
   这条轴在**任何**风格下都成立。
3. `appearance.accent` —— **主题色**（2026-09-26 加），**强调色一处**。
   ⚠️ 它的落点与前两条**同源但不同形状**：不写 `data-*`，改的是 `<html>` 上的**内联**
   `--accent` / `--accent-fg`（1600 万种取值做不成选择器格子）。空串 = 跟随风格。
4. `document_theme` —— **文档主题**，只管正文那一块。
   纯 CSS，用户往 `~/.config/nota/themes/` 里丢一份 `<id>.css` 就能覆盖同名的内置主题，
   **不动应用外壳一分**。

⚠️ **前三条是"界面轴"，第四条不是**（用户 2026-09-23 划的线，原话「这是文档风格，
不是界面风格，不应该影响到UI主题」；2026-09-26 又划了第二次：「这个主题只包含一个 UI
的设计样式……而不包含主题颜色」——那条线划在**风格与颜色之间**，于是有了第 3 条）。
前三条都落在 `<html>` 上（两条属性 + 两个内联变量）、由 `styles/theme.css` 消费；
第四条是注进 `<head>` 的一份 `<style>`、只对 `.editor-pane` 之下生效——**连 DOM 属性都没有**。
切换界面也不全在一处（第 1–3 条在偏好设置的「外观」页，第四条在菜单栏「主题」）。
落地形态见 `docs/04-ui-map.md` §3；`docs/04` §3.3 有完整的分工表。

### `pub const BUILTIN_IDS`（`ui_styles.rs`）——`ui_style` **不是枚举**

⚠️⚠️ **2026-09-26 起 `Settings::ui_style` 是一个 `String`，原来的 `UiStyle` 枚举
已经删除**。用户原话：「本来主题应该就是拆成多个文件的。加一个就是允许用户导入」——
所以取值是**开放的**，枚举写不下。理由、好处与风险完整地写在
`settings/mod.rs::DEFAULT_UI_STYLE` 那一段（默认值 `"auto"`）。

内置那**八**档的 id 表在 `ui_styles.rs`，是**三份抄本里的权威那一份**
（另两份：`theme/shape.css` 的选择器、`AppearancePane.tsx` 的 `STYLE_ORDER`；
`tools/doc-sync-check.sh` ⑦ 查三份是否一致）：

```rust
pub const BUILTIN_IDS: &[&str] = &[
    "auto",      // 跟随当前桌面环境，探不到就用 Adwaita
    "adwaita",   // GNOME 原生：中等圆角、紧凑。探不出桌面时的兜底
    "ghub",      // GitHub：冷灰蓝边框、无阴影、蓝色强调
    "plasma",    // KDE Plasma（Breeze）：方正偏圆、蓝色强调
    "macos",     // macOS：大圆角、控件偏矮、层次靠阴影
    "windows",   // Windows 11：小圆角、直角感、蓝色强调
    "windows10", // Windows 10 原生（Acrylic）：**比 Win11 更方**——窗口直角、材质是亚克力不是 Mica
    "yaru",      // Ubuntu Yaru：大圆角、控件更高、橙色强调
    "yaru-blue", // Yaru 的**蓝色强调色**档，形状与 Yaru 完全一样，只有 --accent 不同
];
```

`"auto"` 是"跟随当前桌面环境"，运行期由前端 `styles/applyTheme.ts::resolveStyle()`
解析成某一种具体风格（探不到就落到 `adwaita`），所以真正要写的样式是
**八种风格 × 2 种明暗 = 16 格**；`ghub`、`yaru-blue` **和 `windows10`** 只能手动选中，
`auto` 探测的结果里没有它们。

⚠️ **`windows10` 与 `windows` 是并存的两代，不是替换关系**。两条理由：
①用户 2026-09-26 给的是两份稿子，而且**专门写明"不是 Mica"**——Win10 是直角、
亚克力，Win11 是小圆角、Mica，长相确实不一样；②`auto` **永远探不到 `windows10`**，
因为 Win10 和 Win11 的 UA 里都是 `Windows NT 10.0`，`detectStyle()` 里
`windows` 只有一个去处。所以它是**纯手选档**，`auto` 在 Windows 上仍然落到
`windows`（Win11）。这条限制写在 `docs/04` §3.1 与 `styles/applyTheme.ts` 的注释里。

⚠️ **换成 `String` 之后，"拼错的 id"不再有任何拦截**：`resolveStyle` 原样返回，
`<html>` 上就写着一个没有对应 CSS 的 `data-ui-style`，外壳落到 `:root` 默认样式。
这是**故意选的**（用户没选过的东西不许替他改），代价由「外观」页承担——它把清单里
没有的那个 id 补成一条 `（找不到「…」）` 选项，让"生效的是这个东西、而它找不到"看得见。
理由与 `document_theme` 那条同源，写在 `DEFAULT_UI_STYLE` 那一段。

⚠️ **`yaru-blue` 与 `yaru` 共用一套形状**（`theme/shape.css` 里形状段是两个选择器并列的），
加第三档变体时照这个写法，不必把圆角复制一遍。
⚠️ 加新风格有**两条路**：①**用户导入**——往 `~/.config/nota/ui-styles/<id>.css` 里丢
一份文件，**不用改任何源码**（这是给用户的路，格式与规则见 `docs/08`）；
②**做成内置**——那要改**五处**：`ui_styles.rs::BUILTIN_IDS`、
`src/styles/theme/shape.css` 里的形状段、`src/styles/theme/color.css` 里
**两种模式各一段**的颜色块、`src/styles/applyTheme.ts` 的探测表（只在想让 `auto`
落到它上面时才要）、`docs/04` 的外观一节。五处缺一不可（完整清单见 `docs/08`）。
⚠️ 新风格**一般不用**往 `theme/extras.css` 再加一段组件选择器（那些段是材质与动效，理由见 `docs/04` §3.2）——先问一句「这件事变量能不能表达」。

### `pub enum UiMode`（同在 `settings/mod.rs`）

```rust
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "kebab-case")]
pub enum UiMode { Auto, Light, Dark }
```

`impl Default for UiMode` → `UiMode::Auto`。

### `pub enum ViewMode`（同在 `settings/mod.rs`）

```rust
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "kebab-case")]
pub enum ViewMode { Wysiwyg, Source, Split }
```

`impl Default for ViewMode` → `ViewMode::Wysiwyg`。

⚠️ **它不是外观轴。** 四条外观轴（`ui_style` / `ui_mode` / `appearance.accent` /
`document_theme`）管"长什么样"，这条管"**怎么编辑**"——编辑区里摆几个窗格、谁的话算数。
两者之间没有任何耦合，`view_mode` 不该写进 `theme.css` 那种地方。

⚠️ 加值时同时要改四处：本枚举、`src/bridge/ipc.ts` 的 `ViewMode`、
`src/ui/commands.ts` 的「视图」栏、`docs/04-ui-map.md`。
**默认值必须和前端 `App.tsx` 的兜底值一致**（两处都写 `wysiwyg`），
否则老设置文件（里面根本没有这一项）打开会进错模式——见下面那条测试的注释。

### `pub struct Settings`（同在 `settings/mod.rs`）

下面只列那**十个顶层老字段**（拆目录时一个都没挪，理由见本节开头）。结构体后半段还有
七张按页分的表 `files` / `editor` / `image` / `markdown` / `export` / `appearance` / `general`，
**表必须声明在这些标量之后**，逐张表见上表与各文件的文件头：

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
    pub strict_markdown: bool,   // 严格模式，默认 false
    pub enable_physics: bool,    // physics 宏包，默认 false
    // …以下七张表（Files / Editor / Image / Markdown / Export / Appearance / General）
}
```

| 字段 | 默认值 | 含义 |
|---|---|---|
| `ui_style` | `Auto` | 界面风格轴 |
| `ui_mode` | `Auto` | 明暗轴 |
| `document_theme` | `""` | 主题 **id**（不是显示名），对应 `themes/<id>.css`。⚠️ 存 id 不存名称：显示名是中文、随时可能改，改了不该让用户的设置失效。**空串表示"无主题"**，即 `editor.css` 那套中性样式 |
| `view_mode` | `Wysiwyg` | **编辑模式**：所见即所得 / 源码 / 分屏。⚠️ 不是外观轴 |
| `ui_font_size` | `15` | 界面字号（px）。**文档字号是文档主题的事，不在这里** |
| `content_width` | `760` | 内容区宽度上限（px） |
| `confirm_unsaved` | `true` | 关窗口时若有未保存改动是否询问 |
| `autosave_seconds` | `0` | 自动保存间隔（秒）。**0 表示关闭自动保存** |
| `strict_markdown` | `false` | **严格模式**：按 CommonMark 严格要求 Markdown。今天只管一件事——ATX 标题的井号后面必须有空格。⚠️ 宽松时 `#标题` 只是"按标题显示"，正文与存盘的字节一个都不动 |
| `enable_physics` | `false` | **数学公式里的 physics 宏包**（`\qty` / `\dv` / `\braket`…）。⚠️ KaTeX 官方没有 physics，这一档不是"装载一个宏包"，而是一套自写的宏定义（`src/editor/math-macros.ts`）。默认关的理由：physics 会**重定义 `\div` / `\Re` / `\Im`**，一开就改了用户文档里既有公式的意思 |

⚠️ 三条与落盘有关的性质：
- 枚举是 `kebab-case`：存的是 `ui_style = "macos"`，**不是** `"Macos"`。存法即接口。
- 结构体上的 `#[serde(default)]` 让**缺字段的文件也能读**（缺的用容器默认值补），
  但**没有 `deny_unknown_fields`**——键名拼错（`ui_styel`）会被**静默忽略**，
  加载后是默认值，看起来像"设置没存住"。改键名时要同批改前端。
- ⚠️ `autosave_seconds` / `confirm_unsaved` 今天的用法：`confirm_unsaved` 被
  `ui/useDocuments.ts::closeDoc` 读了；`autosave_seconds` 2026-09-25 起被
  `ui/useAutosave.ts` 读（停笔 N 秒那一档，写盘仍走 `saveDoc`）。

### 读写（都在 `mod.rs`）

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

### 测试（10，全在 `mod.rs`）

另外七个文件自带 25 条（`markdown.rs` / `appearance.rs` 各 5、`image.rs` **4**、
`files.rs` / `editor.rs` / `general.rs` 各 3、`export.rs` 2），合计 **35 条**（2026-09-25
工具栏改三档时 `appearance.rs` 从 3 条涨到 5 条；2026-09-26 插图那批 `image.rs` 从 2 条涨到 4 条）。
那些用例盯的是各张表**自己**的
默认值与落盘形状（`mod.rs` 那几条往返测试覆盖不到表内部），以及三类"这一项**不许出现**"：
`image.rs` 不许有上传与密钥（⚠️ **2026-09-26 第二批改了这条的名字与它测的东西**：原来叫 `没有上传服务这一项`，那时上传确实没做；现在上传做了、设置在另一个文件里，所以它盯的是「**带令牌的那一组不许出现在 `settings.toml` 里**」。⚠️ 改的时候别只改名字、把它测的东西改回去）、`export.rs` 不许有 Pandoc（⚠️ 守的是**不存路径**这条，2026-09-25 改的口径，理由见 `settings/export.rs` 文件头）、`general.rs` 不许有遥测与服务器。
改哪张表就看那个文件末尾的 `mod tests`。

| 测试名 | 钉住什么 |
|---|---|
| `默认设置能往返序列化` | `save_to` → `load_from` 后 `ui_style`/`ui_mode` 保持，且**没显式设过的字段**（`content_width`）回到默认 760 |
| `文件不存在时回默认而不是报错` | `load_from` 对一个不存在的路径返回 `Ok`，`ui_style == Auto` |
| `枚举落盘用_kebab_风格` | 序列化出来的文本里有 `ui_style = "macos"`（不是 `"Macos"`）。注释：**存法即接口** |
| `physics_默认是关的且能往返` | 默认值是 `false`，置 `true` 后能落盘、能读回。⚠️ 盯的是默认值：开着的话 `\div` 会被换成散度算子，用户文档里既有公式的意思就变了 |
| `编辑模式也走_kebab_而且默认是所见即所得` | 三件事：`ViewMode::default() == Wysiwyg`；落盘文本里有 `view_mode = "split"`；**没写这一项的老设置文件**（`toml::from_str("ui_style = \"macos\"\n")`）读出 `Wysiwyg`。⚠️ 专盯"改了不会编译错、只会静默变行为"的那类——默认值错了的症状是"老用户升级后打开文件发现进了源码模式" |
| `七页设置能整份往返` | 七张表各挑一项改成**非默认**值再存读一遍，逐项比对。只改一个字段的测试会漏掉"某张表压根没被序列化"这种错 |
| `标量写在表前面否则_toml_会拒收` | ⚠️ 结构体**字段顺序的守门员**：TOML 要求标量在前、表在后，把某张表挪到 `ui_style` 前面会让 `save()` 在**写盘那一刻**报 `values must be emitted before tables`，而 `load()` 照样能读——一个只在保存路径上炸的缺陷，所以让它在测试里炸 |
| `老设置文件里没有那七张表时全是默认值` | ⚠️ **整个拆分里最重要的一条**：2026-09-24 之前落盘的设置只有那十个顶层键，新版本读它时十条必须**原样认出来**，七张新表一律取默认（`strict_markdown` / `enable_physics` 被静默关掉就是这条要挡的事），而不是"解析失败 → 回默认 → 用户的偏好没了" |

---

## `src-tauri/src/document/mod.rs`（780 行）

文档模型与文档仓库，本仓最核心的一份文件。

### 文件头的"为什么"要点

- **编辑器在前端（ProseMirror/Milkdown），前端是文本的真相。** 本模块持有一份
  **镜像**（`Document::text`），由前端在改动后推过来（`nota_doc_sync`），存盘则直接把镜像写盘。
- 为什么不像 Folio 那样把真相放后端：Folio 的编辑区是一个 WebKit 视图 + C 宿主，两边都要
  操作同一棵树，所以它挑了宿主做真相、JS 只是渲染。Nota 反过来——编辑器的撤销栈、选区、
  IME 组合态全在 ProseMirror 里，把真相搬回 Rust 等于把这些状态复制一份并保证同步，得不偿失。
- **代价与对策**：镜像可能短暂滞后。对策两条——① 前端改动后**去抖 300ms** 推一次；
  ② 任何"要读文档"的动作（存盘、插件读文档、导出）**先强制同步一次**。

写操作是**整篇替换**语义（`sync` 收的是全文）。

📌 **2026-10-04（第 14 项）**：精细的读写口子开了两条，但**都不是"给插件一个偏移量"**——
量测证明 Markdown 字符偏移在块边界上不存在（`docs/05` §5.2b 那张表）：

- **读**：编辑器把**用户选中的那段字**报上来（`nota_doc_cursor` → `Document::选区`），
  插件问 `nota.document.get_selection()`；
- **写**：插件交一句**意图**（`nota.document.insert_at_cursor`）→ 宿主发
  `nota:document-edit` → **编辑器落一笔真事务**。宿主**不碰镜像**——它拼不出正确结果。

⚠️ 标题那一族（`derive_title` / `front_matter_title` / `first_heading` / `strip_atx`）
**2026-10-04 拆去了 `src-tauri/src/document/title.rs`**（本文件当时过了 800 行）。
`mod.rs` 里留了一行 `pub use title::derive_title;`，所以 `crate::document::derive_title`
这个路径没变。拆的判据是**那里有一条缝**：那一族是纯文本进、标题出，不认识 `DocId`、
不取锁、不碰磁盘。

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
| `untitled_index` | `u64` | 这份文档的"未命名"序号。⚠️ `#[serde(skip)]`，**建的时候定死**——序号不能现算，正文标题会随打字出现又消失，现算会让好几份文档都叫「未命名 0」（BUG-9） |
| `clean_text` | `String` | 拿来跟 `text` 比出 `dirty` 的"干净那份"。⚠️ `#[serde(skip)]`。**`dirty` 不是"发生过 sync"**：编辑器装载一份文件时会规范化（尾段/空行/标记写法），那是编辑器改的不是用户改的（BUG-12） |
| `选区` | `Option<选区快照>` | **编辑器报上来的选区**（2026-10-04 加，第 14 项）。⚠️ `#[serde(skip)]`，**不是文档内容**：不进 `dirty`、不进 `revision`、不落盘。⚠️ 里面存的**不是偏移量**，是**选中的那段字**（理由见上） |

### `impl Document`

| 签名 | 行为 |
|---|---|
| `pub fn is_untitled(&self) -> bool` | `self.path.is_none()`。⚠️ **定义了但没有调用者** |
| `pub fn path_string(&self) -> Option<String>` | 路径的字符串形式。⚠️ 这里用的是 `p.to_str()` 而**不是** `paths::path_to_string`，所以非 UTF-8 路径会静默变成 `None`（而不是像 `path_to_string` 那样报错），调用方拿到的效果是"这份文档没有路径" |

### `derive_title()` —— ⚠️ **2026-10-04 起住在 `document/title.rs`**

`pub use title::derive_title;` 让这个路径照旧成立，函数本体一字未改。
**它的说明、那三个私有辅助（`front_matter_title` / `first_heading` / `strip_atx`）
与"什么算标题"的判据全部搬去了 `src-tauri/src/document/title.rs` 那一节**——
本文件比原先短了，那条缝是这么开的。
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
| `记选区` | `pub fn 记选区(&mut self, id: DocId, 选区: 选区快照) -> Result<()>` | **只写 `doc.选区` 一个字段**（2026-10-04 加，第 14 项）。⚠️ **不碰 `text` / `revision` / `dirty` / 磁盘**——选区是界面状态不是文档内容。找不到 `id` → `NoActiveDocument`（⚠️ 消息是"没有活动文档"，而真实原因是"这份文档已经关了"，同 `reload` 那条） |

### 测试（20）

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
| `挪过之后路径与标题跟着换而改动不动` | `移到()` 只动 `path` / `title` / `revision`——改个名不该让未保存的改动消失 |
| `挪失败时文档还指着老路径` | 盘上那一步失败时，账上**一个字都不改**（先挪盘、成功了再改账） |
| `没存过盘的文档挪不了` | `path` 是 `None` 时 `移到()` 报错 |
| `未命名序号不会被打字抹掉` | BUG-9 的回归锁：打字让标题出现又消失，序号仍是建的时候那个 |
| `装载时的规范化不算用户改动` | BUG-12 的回归锁：`settle` 写进 `clean_text`，之后的 `sync` 才不会把编辑器的规范化误判成用户改动 |
| `未命名文档空的不脏` | 新建的文档 `dirty` 为假 |
| `记选区不碰版本也不碰脏标记` | **2026-10-04 加（第 14 项）**：`选区` 初始是 `None`；写进去之后 `revision` / `dirty` / `text` 一个都不变；空选区能覆盖非空选区；不认识的 `DocId` 报错 |
| `选中原子时文本为空但选区不空` | 钉住 `empty` 这个字段为什么非有不可（选中一个图片/公式时 `text` 是空串、`选区` 不是空的），以及**手写的 `Default` 给的是 `empty: true`**——派生出来的那份读作"选着一段空的字"，会骗人 |

⚠️ 测试用的是固定名字的临时目录（`temp_dir()/nota-docstore-*`），**开头先 `remove_dir_all`**。
所以同一个 crate 的这些测试不能并发跑同一份，但名字各不相同，互不干扰。

---

## `src-tauri/src/document/title.rs`（114 行）

**标题从哪来**（2026-10-04 从 `document/mod.rs` 拆出，第 14 项那一批）。

拆的依据是**这里有一条缝**：整个文件只做一件事——**纯文本进、标题出**。
它不认识 `DocId`、不碰 `DocumentStore`、不取锁、不碰磁盘，所以谁都能调它，
测试也不必先造一个仓库出来。拆的触发是 `mod.rs` 过了 800 行（`docs/09` §4）。
⚠️ 搬过来**一个字都没改**。

### `pub fn derive_title(text: &str, path: Option<&Path>, untitled_index: u64, strict: bool) -> String`

从正文里猜标题，顺序：

1. YAML front matter 里的 `title:`
2. 第一个 ATX 标题（`# ` ~ `###### `）
3. 文件名的 stem
4. `format!("未命名 {untitled_index}")`

⚠️ 最后一个参数 `strict` 是**严格模式**（`Settings::strict_markdown`）：它只影响第 2 条
认哪些行——严格时井号后面**必须**有空格，宽松（默认）时 `#标题` 也算。

### 三个私有辅助

| 私有函数 | 行为 |
|---|---|
| `fn front_matter_title(text: &str) -> Option<String>` | front matter 必须**在文件最开头**、首行是 `---`，到下一个 `---` 或 `...` 结束（与 Jekyll 的 front matter 约定一致）。`title:` 后的值 `trim` 掉两侧的 `"` 或 `'`；空值当没找到，**继续往下扫**（不会因为一个空的 `title:` 就放弃） |
| `fn first_heading(text: &str, strict: bool) -> Option<String>` | 第一个 ATX 标题。跳过围栏代码块（` ``` ` / `~~~` 切换 `in_fence`）里的 `#`——那多半是 shell 注释 |
| `fn strip_atx(line: &str, strict: bool) -> Option<&str>` | 是 ATX 标题就返回文本（去掉 `#` 与可选的收尾 `#`）。⚠️ **严格与宽松只差一句**：`#foo` 严格模式不认、宽松模式认（宽松是**默认**）。⚠️ 它**只读不写**：认成标题也**正文一个字不改**，存盘存回 `#foo`。注意它取的是**行首**的 `#` 数，`1..=6` 之外返回 `None` |

⚠️ **`front_matter_title` / `strip_atx` 这两份判据与前端同构**（`src/editor/atx.ts`
是前端那一份）：**两边要一起改**——判据分家的后果是"标签页上的名字"与"编辑器里看到的
标题"对不上。⚠️ 前端还有一份**同构的宽松标题显示**（`src/editor/lax-heading.ts`）。

---

## `src-tauri/src/commands/mod.rs`（28 行）

只有**十九个** `pub mod` 声明（`diff` / `document` / `export` / `focus` / `image` /
`image_upload` / `menu` / `pandoc` / `path_kind` / `plugin` / `session` / `settings` /
`table_width` / `theme` / `ui_style` / `watch` / `webview` / `window` / `workspace`；
⚠️ **2026-09-27 晚第十遍现数**，此前写"八个"而实际早就是十五个——同一天早些时候另一处
已经改成"十五"，这里漏了；⚠️ **这一格和上面那条「命令总数」是两笔账**：这里数的是
**模块个数**，别拿它去和 75 条命令对照），加一段分工说明：**这一层的职责只有三件**
——取锁、调下层、把错误转成人话。**业务逻辑不许写在这里**，命令函数应当短到能一眼看完。
命名约定：命令一律 `nota_` 前缀（它不是装饰，它让前端代码里一眼分得清哪些是跨进程调用）。

无函数、无测试。

---

## `src-tauri/src/commands/document.rs`（360 行）

`nota_doc_*` **十五个**命令（⚠️ **2026-10-04 现数**：十四 → 十五，新增 `nota_doc_cursor`
——编辑器把**选区**报上来。⚠️ 它**什么都不改**：不碰 `text` / `revision` / `dirty`，
只把"用户现在选着哪段字"记进 `Document::选区`（`docs/03` §4.2）。上一次第十遍是
十二 → 十四（`nota_doc_rename` / `nota_doc_move`），第九遍把"十一"改成"十二"，
多出来的是 `nota_doc_disk_text`，给外部改动提示条的「查看修改」用。本节的标题行数也同批对齐
（143 → 212 → 337 → **360**，那两条改名/移动加上它们的助手与用例是 212 → 337 那一段；
14 那一批只多了一条 `nota_doc_cursor`）。**每个都是"锁 `documents` → 调 `DocumentStore` → 返回"**，
没有一个函数超过 10 行（⚠️ 例外是那两条改名/移动的：它们各自还带一段"把三笔账跟过去"
的后半段，见下）。
⚠️ 其中 `nota_doc_sync` / `nota_doc_settle` 在**放掉 `documents` 锁之后**还要
调一次 `devserver::refresh`（把正盯着这份文档的预览入口重写一遍）——
两把锁**不重叠**，所以没有破锁序（`docs/01` §②）。

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
| `pub fn nota_doc_rename(state: State<'_, AppState>, id: DocId, name: String) -> Result<String>` | **重命名**（2026-09-27，`docs/10` §1「文件重命名 / 移动」）：把这份文档挪到**同一个目录**下的另一个名字，返回新的落盘路径。⚠️ **收的是"名字那一段"，不是整条路径**——理由见下面那一节 |
| `pub fn nota_doc_move(state: State<'_, AppState>, id: DocId, dir: String) -> Result<String>` | **移动**：挪到另一个目录里，**文件名不变**（名字那一段由宿主从自己那份路径上取）。返回新路径 |
| `pub fn nota_doc_has_unsaved(state: State<'_, AppState>) -> Result<bool>` | 退出前前端拿它决定要不要弹框。⚠️ **前端今天没有调用者** |

### 重命名 / 移动：为什么收"名字"和"目录"，不收整条路径

两条命令的形状是被一个**具体的坏结果**逼出来的（不是风格问题）：

- 前端手里的 `doc.path` 是**有损**的（`paths::path_to_string()`，非 UTF-8 目录名会变成
  `?`）。假如接口收整条新路径，前端就得用"有损的目录 + 新名字"拼一条出来——
  `/home/u/笔记/x.md` 那样的目录名会被拼成 `?` 开头的**另一个目录**，于是
  "重命名"变成"把文件挪到一个新造的目录里"，而用户看到的提示还是"已重命名"。
  所以**路径的其余部分一律由宿主从自己记着的那一份拼**。
- 名字里带 `/` 就是"挪到别处"，那件事有 `nota_doc_move`（走目录选择框）。
  挡在 `干净的文件名()` 里（拒空、拒 `/'`\\'、拒 `.`/`..`，**不查扩展名**：
  打开是按内容判的，仓库里没有一条"Nota 只认 `.md`"的规矩）。

两条命令共用一段后半截 `挪过去()`，它按这个次序做三件事：
**① 先挪盘上的文件**（`DocumentStore::移到`，挪失败什么都不改，`path`/`revision` 一动不动）；
**② 改文档记着的路径**（改路径**只动** `path`/`title`/`revision`，绝不碰 `text`/`clean_text`/`dirty`
——文档仓的脏判据是 `dirty = text != clean_text`，清掉它就是"用户没保存的改动凭空消失"）；
**③ 把三笔账跟过去**。三笔账各自的处置不一样，这里是最容易改错的一处：

| 账 | 谁搬 | 失败时 |
|---|---|---|
| **「最近文件」与它的滚动位置** | `session::改最近(老, 新)` | **不 `?`**，只记日志 |
| **表格列宽** | `table_width::改路径(老, 新)` | **不 `?`**，只记日志 |
| **外部改动监视基准** | **不在这儿搬**——前端刷完列表会**重报一遍**现在开着哪些文档，那一次按新路径去盘上读基准 | —— |

⚠️ 前两笔为什么不 `?`：它们失败只是"列表里少一条 / 列宽回到自动"，不该让一次
**已经成功的改名**看起来失败了——那种失败会诱使用户再点一次，而第二次会报
"名字已经在了"（文件真的已经挪过去了）。
⚠️ **监视那笔故意不动**是最反直觉的一条：这份文档可能带着**还没保存的改动**，
在这里手动 `记下` 等于把内存里那份当基准，下一次外部改动检查拿磁盘上的旧内容去比，
于是**报一条假的"文件被别的程序改了"**（`watch.rs` 的口径见 `docs/01`）。

真正的移动实现（含跨设备回退、绝不覆盖）在 `src-tauri/src/file_move.rs`，本节上面那张
逐文件表里有它那一行。

### 测试

⚠️ `commands/document.rs` 本身仍然**没有测试**（命令层薄得只剩转发），但那两条新命令
依赖的三处**都有**：`file_move.rs` 12 条、`document/mod.rs` 新增 3 条、`session.rs` 新增 2 条
（见各自一节）。

---

## `src-tauri/src/commands/workspace.rs`（640 行）

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
| `pub fn nota_workspace_tree(state: State<'_, AppState>, sub_path: Option<String>, depth: Option<u32>, opts: Option<TreeOptions>) -> Result<Vec<TreeNode>>` | 见下 |

`nota_workspace_tree` 的流程：

1. 没开工作区 → `Err(other("没有打开工作区"))`
2. **子路径同样要过一遍围栏**——`sub_path` 从前端来，不能假定是干净的。
   有 `sub_path` 就调 `crate::lua::api::fs::resolve_in(&root, &sub)`（**复用插件沙箱那套裁决**）；
   没有就用 `root` 本身
3. 不是目录 → `Err(other("{base} 不是文件夹"))`
4. `base.strip_prefix(&root)` 得到相对路径（`unwrap_or_default()`，即 base 就在根时是空路径）
5. 取口径：`口径解析(opts, &设.files)`——**三格逐格回落**（给了 `opts` 的那一格听 `opts`，
   没给的听 `[files]` 表）。⚠️ 取完就放锁，读目录那一段**不持设置锁**（下面可能递归几层、
   碰几千个文件；没必要把任何一把锁攥在磁盘 IO 上面）
6. `read_dir_sorted(&base, &base_rel, depth.unwrap_or(1), 口径)`

### `pub struct TreeOptions`（2026-09-28 加）

```rust
#[derive(Debug, Clone, Default, Deserialize)]
#[serde(default, rename_all = "camelCase")]
pub struct TreeOptions {
    pub sort: Option<TreeSort>,
    pub filter: Option<FileFilter>,
    pub show_hidden: Option<bool>,
}
```

⚠️ **为什么口径要从前端递进来，而不是让宿主自己去读设置**：设置页那一路是"先改内存、
再写盘"（`ui/settings/panes/props.tsx::paneWriter`），时序上后端可能还拿着旧值——用户
在下拉里换成"按修改时间"，紧接着那一次请求如果读的是后端手里的旧设置，树就**不换**。
这种"拨了没反应、过一会儿自己好了"是最难报的一类 bug。前端把当前口径**跟着请求一起
递过来**就没有这个时间差（`src/ui/tree-options.ts` 顶上写了同一段）。

⚠️ **字段是 camelCase**（`showHidden`）：Tauri 只把**命令自己的**参数名从 camelCase 换算
成 snake_case，**结构体里面的字段名 serde 原样用**。写成 `show_hidden` 的话前端发
`showHidden` 会被当成未知字段忽略，症状正是"显示隐藏文件这个开关拨了没用"。

⚠️ **[`TreeOptions`] 与 [`树口径`] 是两个类型**，这是刻意的：前者是"线上来的、可以缺格"
的形状，后者是"干活用的、一定齐全"的形状。合成一个的话 `read_dir_sorted` 里每处判断都要
写一次 `unwrap_or`，漏掉一处的症状是那一路**静默用错档**。

### `fn 口径解析(opts: Option<TreeOptions>, 设: &Files) -> 树口径`（私有，纯函数）

逐格回落：`opts.as_ref().and_then(|o| o.sort).unwrap_or(设.tree_sort)`，另外两格同理。
⚠️ **不碰状态、不碰磁盘**，所以测试能直接喂它（`口径逐格回落` 那条）。

`depth` 是递归层数上限，前端按侧栏展开状态分段请求（先 1 层，展开某个目录时再要那一支）。
**不做整棵树一次拉完**——大仓库（几万个文件）那样会卡住界面。
⚠️ 前端每次**都只请求 `depth = 1`**（2026-09-24 起才算真的用上）：目录节点**可以展开**
（`ui/Sidebar.tsx` 的 `FileTree.toggle`），展开时对**那个子目录**再发一次 `depth = 1`，
把结果缓存在 `Sidebar` 本地的 `kids` 里（不回写 App 那棵树）。所以 `depth > 1` 那条
递归分支**仍然没有调用者**（`sub_path` 那条路是硬要走通的路，不是递归），
它的测试是唯一的使用者。

### `fn read_dir_sorted(dir: &Path, rel: &Path, depth: u32, 口径: 树口径) -> Result<Vec<TreeNode>>`（私有）

读一层目录，排好序，按 `depth` 决定要不要递归下去，按 `口径` 决定列什么、怎么排。

⚠️ **2026-09-28 之前这里有两条规则是写死的**（点开头的永远跳过、文件只列 markdown），
而设置页上那两个开关（「显示隐藏文件」「显示哪些文件」）从 2026-09-24 就摆在那儿——
**拨了等于没拨**。同一批接上了线，这是"还债"不是新功能。

| 规则 | 细节 |
|---|---|
| 读不了就**报错** | `std::fs::read_dir(dir).map_err(...)?`——见下面那段（原先是吞成空数组） |
| 点开头 | 默认跳过；`口径.show_hidden` 拨开才列。⚠️ `.git`、`node_modules` **永远跳过**（见下） |
| `node_modules` | 与点开头那句**分开写**。合起来写成 `name.starts_with('.') || name == "node_modules"` 就变成"拨开隐藏文件之后 node_modules 也冒出来了" |
| 跳过符号链接 | `meta.file_type().is_symlink()` → **不跟**（跟了可能绕出工作区，也可能成环把内存吃光）。用的是 `DirEntry::metadata()`，它**不**跟随符号链接，所以这个判断是准的。⚠️ 副作用：一个**指向工作区内部的**符号链接 .md 文件也不会被列出 |
| 取不到元数据 | `continue` |
| 目录 | `TreeNode { is_dir: true, children: depth > 1 ? Some(read_dir_sorted(...)) : None }`。**永远列**（过滤档只管文件） |
| 文件 | `口径.filter == All` 时全列；`Supported`（默认）时只列 markdown（`is_markdown(&name)`），`children: None` |
| 排序 | **目录在前、文件在后**（`dirs.into_iter().chain(files)`，三档都一样），各自排。🔹 `name` 档：不区分大小写、大小写相同时再用原名兜底（混排大小写时 `README.md` 与 `apple.md` 区分大小写的结果看着是乱的）。🔹 `modified` / `created` 档：**新的在前**（`b.时刻.cmp(&a.时刻)`），时刻比不出来时按名字兜底 |
| `path` 的拼法 | `child_rel` 的每个 component 用 `/` 手工 `join`，所以是 `子目录/a.md` 这种跨平台稳定的相对路径 |

**⚠️ 为什么 `.git` 与 `node_modules` 是"永远跳过"而不是跟着 `show_hidden` 走**：

用户拨开隐藏文件是冲着 `.github` / `.env` / `.obsidian` 去的，而 `.git` 里是几千个
哈希名（`.git/objects/ab/cdef…`）——露出来就等于这个开关**废了**：拨一次看到满屏
`objects/`，从此再也不碰它。`node_modules` 同理，而且它**不是隐藏目录**，
点开头那句挡不住它（`Show all` 那一档会把它整个摊开）——设置页那句帮助文案
（`FilesPane.tsx`：「一个 node_modules 就能把树填满」）指的就是它，文案既然这么写了，
代码里就得真跳。

**⚠️ 时间档里"目录排的是它自己的时间"**，不是"里面最新的那一份"：后者要递归下去，
展开一层就等于把整棵子树读一遍。「创建时间」给不出来时**退回修改时间**
（`meta.created().ok().or_else(|| meta.modified().ok())`）——ext4 要有 statx 才有 btime。
退回而不是"排到最后"：排到最后的表现是"这批文件不参与排序"，看起来像排序坏了。

**⚠️ 时刻只在这一层用**：它**不跟着 `TreeNode` 发给前端**。前端拿不到时刻，也就排不了
序——排序逻辑只有这一份（与 `find.ts` 那条"匹配逻辑只有一份"同一条规矩）。

### `fn is_markdown(name: &str) -> bool`（私有）

### 为什么返回 `Result`（2026-09-25 改的）

⚠️ **返回 `Result` 是 2026-09-25 改的**，原来返回 `Vec<TreeNode>` 并且把
`read_dir` 的错吞成空数组（`let Ok(entries) = … else { return Vec::new() }`）。
后果是**"这个文件夹没有权限"和"这个文件夹是空的"在界面上长得一模一样**
——展开之后一片空白。前端其实早就备好了那条路（`Sidebar.tsx` 里
`loadDir(...).catch(e => setErrors(...))`），**是后端从来不 reject，那条 catch 一次没跑到过**。

⚠️ 只有**被请求的那一层**抛（`nota_workspace_tree` 里直接 `?`）；递归下去的子目录
仍然吞（调用处 `unwrap_or_default()`）——一个子目录读不动，不该让整棵已经读得出来的树
跟着失败，而前端本来就是一层层按需要，轮到它自己那层时会照常报。

---

后缀表：`.md` / `.markdown` / `.mdown` / `.mkd` / `.mdx` / `.txt`，**先 `to_lowercase()`**
所以大小写都认。与 `docs/03` 里认领的后缀表**必须一致**。

### ⚠️ 这是**真值源**，前端那张是它的副本（2026-09-28 收拢）

这张单子从前**在四个地方各写一遍**（本函数、打开对话框的筛选、`ui/useFileDrop.ts` 的
`是_markdown`、以及它旁边那张更宽的 `文本后缀`），而且**已经不一致**——`.txt` 在本函数
与对话框那侧算 Markdown、在拖放那侧**不算**，症状是"同一份 `.txt` 从菜单打开是一回事、
拖进来是另一回事"。

现在前端只剩一份（`src/editor/file-kind.ts` 的 `MARKDOWN后缀`），**它认这个函数为真值源**：
`tests/file-kind.test.ts` 第一组直接**读本文件的源码**把两张单子逐个对。⚠️ 这种错
**两边的编译器都不吭声**，所以只能靠一条会读源码的测试盯着；改这张表就要同批改那边
（反之亦然）。⚠️ 保存对话框那一条窄口径（只有 `md` / `markdown`）**不在这次收拢里**，
它回答的是另一个问题（"存成什么"），见 `docs/01-architecture.md` 的前端遗留项。

### 测试（9）

| 测试名 | 钉住什么 |
|---|---|
| `认领的_markdown_后缀` | `a.md`、`A.MD`（大小写）、`b.markdown` 认；`c.rs`、`d.pd` 不认。⚠️ 注意 `d.pd` 这条是在测"`.pd` 不在表里"——它同时说明这个实现是纯后缀匹配，没有更细的判断 |
| `文件树只列_markdown_并且目录在前` | 造 `zeta/`、`.git/`、`a.md`、`b.png`，断言结果是 `["zeta", "a.md"]`——目录在前、只留 md、跳过点开头 |
| `depth_为_1_时不给子节点` | `depth = 1` 时目录的 `children` 是 `None`；`depth = 2` 时子节点 1 个 |
| `目录读不动时报错而不是给空数组` | 喂一个**不存在**的目录，必须是 `Err`、且消息含"读文件失败"。⚠️ 用不存在的目录而不是 `chmod 000`：后者在 root 下跑测试时权限位拦不住，那条用例会时灵时不灵 |
| `口径逐格回落` | 纯函数那三条：什么都不给照设置、只给一格时另外两格照设置、**显式 `false` 与"没给"是两回事**（`Option<bool>` 存在的意义就在这一格） |
| `按修改时间排时新的在前` | 文件名取 `a-老` / `b-新`，让**字母序与时间序正好相反**——两种排法给的答案对着来，这条才证明得了东西。⚠️ 时间差用"写一份、`sleep(20ms)`、再写一份"造，不碰 `File::set_modified`（那个要 Rust 1.75，且各家文件系统精度不一） |
| `时间档里目录仍在文件前面` | 目录比文件**旧**、按时间排本该在后面，但它必须在前面——树是靠缩进读的，目录跑到文件后面去，用户会以为那一层没有子目录 |
| `显示隐藏文件但_git_与_node_modules_永不出现` | 造 `.env` / `.github/` / `.git/` / `node_modules/`：默认档一个都不列；**只拨隐藏、过滤仍是 `Supported`** 时 `.env` 仍不列（两个开关各自独立）；两个都开时 `.env` 与 `.github` 露面，而 `.git` 与 `node_modules` **永远不在** |
| `过滤档_all_时列出非_markdown_文件` | 同一份目录跑两种档位再比：`Supported` 只给 `a.md`，`All` 给 `a.md` ＋ `b.png`。⚠️ 写成两句各自断言的话，"两档给出同一个结果"（＝根本没接线）照样能过 |

---

## `src-tauri/src/commands/settings.rs`（163 行）

| 签名 | 行为 / 失败 |
|---|---|
| `pub fn nota_settings_get(state: State<'_, AppState>) -> Result<Settings>` | 返回**克隆**。不会失败 |
| `pub fn nota_settings_set(state: State<'_, AppState>, settings: Settings) -> Result<()>` | 整份替换并落盘；落盘失败**回滚内存** |
| `pub fn nota_settings_problem(state: State<'_, AppState>) -> Option<String>` | 开机读设置时出的问题，读成功是 `null`。⚠️ 它**没有"清掉"的命令**：描述的是开机那一刻的事实，改好文件重启一次就不出现了 |
| `pub fn nota_app_lang(state: State<'_, AppState>) -> AppLang` | **界面语言**（2026-09-25 加）。返回 `{setting, effective, available}`，见下。不会失败 |
| `pub fn nota_settings_open_dir(app: tauri::AppHandle) -> Result<String>` | 在系统文件管理器里打开设置目录（`paths::config_dir()`，一般 `~/.config/nota`），返回打开的是哪个路径。⚠️ **「打开」这一步为什么在宿主**：前端拿路径去调 `plugin-opener` 的 `openPath` 要过 Tauri 的 ACL，而那条权限得配 path scope（scope 按 `$APPCONFIG` 展开，与本仓 `paths.rs` 的 XDG 口径不一定同一个目录）——BUG-27。同文件里那句注释是完整版，`commands/theme.rs` 那条只写了个指回这里的指针 |
| `pub fn nota_settings_reset(state: State<'_, AppState>) -> Result<Settings>` | 恢复默认并落盘，返回新的那一份。⚠️ 和 `set` **共用同一个写入口 `落盘`**（见下） |

### ⚠️ `nota_app_lang` 那三个字段各有各的用处

| 字段 | 给谁用 | 是什么 |
|---|---|---|
| `setting` | **设置页** | 设置里那一格的**原样值**，可能是 `auto`。⚠️ 不能拿 `effective` 去显示——用户选的「自动」会变成「中文」，看起来像设置被改了 |
| `effective` | 界面上的一切判断 | **启动时算的那一个**（`AppState::app_lang`），不是现算的。⚠️ 用户改了设置还没重启的那段时间里，插件用的仍是旧文案，这里就必须说旧的 |
| `available` | 设置页那个下拉 | `{tag, label}` 列表（`lang::支持的语言` 与 `lang::语言名` 配对）。⚠️ **由宿主给**——前端自己列一份的话，多一门语言要改两处，而漏改的那处**不会报错**（下拉里少一项而已）。⚠️ 不含「自动」，那条由界面自己加 |

### ⚠️ `set` 与 `reset` 必须共用 `落盘`

`落盘(state, next)` 干三件事，顺序是**承重**的：

1. `{ 锁 settings → 克隆 previous → 覆盖 → save() }`——**先落盘，失败就把内存改回去**，
   否则会出现"界面上是新的、重开又变回去"这种最难解释的状态。
   ⚠️ 那对花括号不是装饰：`documents` 在锁序里**排在 `settings` 前面**
   （`plugins → documents → settings`），所以第 2 步必须**等这把锁放掉之后**再跑。
2. `documents.lock().set_strict_markdown(strict)`——「严格模式」改了要**立刻重算
   已打开文档的标题**（标题是从正文猜的，两种模式对"这行算不算标题"看法不同）。
   不重算的话，用户改完设置盯着标签页看，会以为设置没生效。
3. 返回。

⚠️ **各写一遍就会漏掉第 2 步那段锁序**，而漏掉一半就是死锁——所以文件头把
"两处都必须走这里"写成了硬规矩。

文件头解释了为什么走**整份替换**而不是逐项 patch：设置项还少，patch 语义（"没给的字段不动"
还是"没给的字段恢复默认"）会变成一个新的、没有必要的理解负担。等设置项多到前端改一项要
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

⛔ **文件头写着三件事，改之前必读**：三条外观轴的分工表、「不兼容也不内置外部编辑器的主题」的版权红线、
以及 `check_id` 那道安全边界。

### `pub struct DocThemeInfo`

⚠️ 字段与 `src/bridge/ipc.ts` 的 `DocThemeInfo` **手抄两份**，改一边必须同批改另一边。
只有三个字段：`id`（键）、`name`（**显示名，可以是中文**）、`builtin`（是不是内置那三套）。

⚠️ **`id` 和 `name` 是两码事**：`id` 是文件名去掉 `.css`，受 `check_id` 的形状约束，
**只能是 ASCII 字母数字与 `-` `_`**；`name` 是给人看的。内置那三套两者不同
（`minimal` ↔ 极简、`adwaita` ↔ Adwaita、`latex` ↔ LaTeX）；用户自己丢的文件两者相同。
文件头里有中文文件名的取舍说明。

### `pub fn discover() -> Vec<DocThemeInfo>`

**内置三套按 `BUILTIN` 表的顺序排在最前**（用 `include_str!` 编进二进制，所以新装的机器上
主题菜单不是空的，而且**一份第三方 CSS 都不带**），后面接用户目录里多出来的，按 id 排序。

⚠️ 用户文件与内置**同名时不是删掉内置再追加**——是**就地翻掉 `builtin` 标记**。
这样那一条还留在菜单原来的位置上，不会因为"改了一下极简"就跳到列表末尾。

⚠️ **目录不存在不是错**（`user_ids()` 里 `read_dir` 失败一律当空表），`*.css` 之外的后缀一律不看。

### `pub fn css_of(id: &str) -> Result<String>`

先 `check_id`，再「用户文件存在就用它，否则查 `BUILTIN`」，**两边都没有就报错**。
⚠️ **报错而不是给空串**：给空串的话界面会安静地变成"没样式的裸 HTML"，
用户不会知道是自己把文件删了。有一条用例专门钉这个。

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
| `内置主题不碰界面变量` | ⚠️⚠️ **本仓库最重要的一条主题用例**。逐份扫内置 CSS，不许出现 `--ui-font-size` / `--font-ui` / `--sidebar-width` / `--dock-width` / `--toolbar-height` / `--statusbar-height` / `--zen-peek` / `--shadow` / `--nota-bridge`。**它就是「文档主题碰不到外壳」这条线的机器判据**——没有它，往主题里加一条界面变量不会被任何检查发现 |
| `内置主题都带自己的一套代码高亮` | 每份都要有 `--code-*`。⚠️ 代码块底色是主题挑的，缺了会"深底配深字" |
| `拒绝形状不对的_id` | `check_id` 挡住 `../x`、`a/b`、空串、超长、中文 |
| `取一份不存在的主题要报错而不是给空串` | ⚠️ 静默降级成裸 HTML 是这里最坏的结果 |
| `目录不存在时清单只剩内置的` | ⚠️ 没装过任何主题的机器就是这种情况，**不是错** |

---

## `src-tauri/src/commands/theme.rs`（50 行）

三条命令，对应界面上三个动作。**都是薄壳**，逻辑全在 `themes.rs`。

| 签名 | 行为 / 失败 |
|---|---|
| `pub fn nota_doc_themes() -> Vec<DocThemeInfo>` | `themes::discover()`。⚠️ **返回 `Vec` 不是 `Result`**——扫不到主题不是错 |
| `pub fn nota_doc_theme_css(id: String) -> Result<String>` | `themes::css_of(&id)`。返回**文本**不是渲染结果，限域在前端做。⚠️ **入参是 id 不是路径** |
| `pub fn nota_doc_themes_open_dir(app) -> Result<String>` | `themes::user_themes_dir()` **建好**，再用 `app.opener().open_path(...)` 交给系统文件管理器打开，返回打开的是哪个路径（前端拿它去报错/显示）。⚠️ **「打开」这一步为什么在宿主而不是前端**：前端那条路（`@tauri-apps/plugin-opener` 的 `openPath`）要过 Tauri 的 ACL，补权限还得配 path scope，而 scope 按 `$APPCONFIG` 展开、与本仓 `paths.rs` 的 XDG 口径不一定同一个目录——2026-09-25 的 BUG-27 就是这个 |

无测试（逻辑都在 `themes.rs`，测试也在那边）。

---

## `src-tauri/src/commands/plugin.rs`（247 行）

| 签名 | 行为 / 失败 |
|---|---|
| `pub fn nota_plugins_list(state: State<'_, AppState>) -> Result<Vec<PluginInfo>>` | `host.list_info()`。**含加载失败的**，界面上要标红 |
| `pub async fn nota_plugin_set_enabled(app: tauri::AppHandle, id: String, enabled: bool) -> Result<()>` | 透传 `PluginHost::set_enabled`。没有这个插件 → `other("没有这个插件：{id}")`。⚠️ **2026-09-25 起是异步命令**（`spawn_blocking`）：启用要**当场跑一遍 `on_load`**，那个可能起子进程、可能要几秒，跑在主线程上就是冻界面 |
| `pub async fn nota_plugin_call(app: tauri::AppHandle, plugin: String, command: String, args: Option<serde_json::Value>) -> Result<serde_json::Value>` | 见下。⚠️ **2026-09-25 起是异步命令**（`spawn_blocking`）：Lua 会起 `git` 子进程、发 HTTP，跑在主线程上就是冻界面 |
| `pub async fn nota_plugin_panel_content(app: tauri::AppHandle, plugin: String, id: String) -> Result<serde_json::Value>` | 一个面板**此刻**的内容（现调插件的 `render`）。⚠️ 与 `panels`（清单，启动时拉一次）**不是一回事**。⚠️ 同样异步。⚠️ 返回前过一遍 `填_frame`，而且那一步必须在 **plugins 锁放掉之后**做（它要读 devserver 那把锁） |
| `pub fn nota_plugin_review(review: State<'_, ReviewState>) -> Result<Option<PluginReview>>` | 编辑区里此刻摊着哪个插件的哪个面板。⚠️ **属"声明/状态"**，所以前端挂载后主动拉一次，事件只是"变了，再拉一次"。⚠️ 只回 `{plugin, panel}`，**不回标题**（标题前端手里就有，为它多取一次 `plugins` 锁不值） |
| `pub fn nota_plugin_review_close(app: tauri::AppHandle, plugin: String) -> Result<()>` | 收起编辑区那一块。⚠️ 「回到正文」走的是**这条命令、不绕道插件**——插件可能已经卡住、或者根本没提供"关掉"的命令 |
| `pub fn nota_plugin_find_command(state: State<'_, AppState>, command: String) -> Result<Option<String>>` | `host.find_command_owner(&command).map(str::to_owned)` |
| `pub fn nota_plugin_panels(state: State<'_, AppState>) -> Result<Vec<PluginPanel>>` | `host.panels()`。**前端挂载后主动拉一次**，不能改成等事件（BUG-13） |
| `pub async fn nota_plugin_install(app: tauri::AppHandle, path: String) -> Result<String>` | 装一个包，返回它的 id。⚠️ `path` 由**前端**用文件对话框问出来（`@tauri-apps/plugin-dialog`），宿主不自己弹框——那是界面的事，而且宿主弹框在无头测试里没法验。⚠️ 异步：装完**当场加载**（跑 `on_load`）。⚠️ 只收 `path` **一个**参数：`trust` 是**装完之后**的另一个动作（`nota_plugin_trust`）|
| `pub async fn nota_plugin_uninstall(app: tauri::AppHandle, id: String) -> Result<()>` | 卸掉：磁盘删、内存拿掉、账本忘掉。⚠️ 异步，而且是**不可逆**的（目录真的没了），前端必须先问一句 |
| `pub fn nota_plugin_trust(state: State<'_, AppState>, id: String) -> Result<()>` | 信任这个插件的签名者（TOFU ＋ 显式信任），透传 `PluginHost::信` |
| `pub fn nota_plugin_trust_list(state: State<'_, AppState>) -> Result<Vec<信任记录>>` | 信任库里现在有哪几把钥匙。界面「已信任的签名者」那一块用它 |
| `pub fn nota_plugin_menus(state: State<'_, AppState>) -> Result<Vec<PluginMenuItem>>` | `host.menus()`。📌 **2026-09-24 起有调用者了**（backlog 第 42 项）：条目挂在原生菜单栏的「插件」那一栏下 |

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
- ⚠️ **`call` 现在真是异步的**，所以 `nota_plugin_call` 的返回值外面套了一层
  `spawn_blocking(...).await`——那层还多一种失败：阻塞线程池自己挂了
  （`"插件命令的执行线程挂了：{e}"`）。⚠️ **搬出去之后锁的语义没变**：
  仍旧是"跑这个插件的代码时一直握着 `plugins` 锁"，所以锁序不变量照旧成立。
- 调用者现状（2026-09-25 复核）：`panels` / `menus` / `call` / `panelContent` /
  `review` / `reviewClose` **都有调用者**；只有 `findCommand` 是**声明了没人调**
  （它是为"两个插件重名"那条对账准备的，不是主路径）。

无测试。

---

## `src-tauri/src/commands/menu.rs`（24 行）

一个命令，把前端推来的原生菜单树交给 `native_menu::apply()`。

### `nota_native_menu_apply(app, nodes: Vec<NativeMenuNode>) -> Result<bool, String>`

返回 `bool` 而不是 `()`：**前端要靠这个返回值决定要不要隐藏自绘菜单栏**。
`ok == false` 表示"没挂上"（非 macOS，或者 Tauri 那边报错），
前端就继续用自绘的那套——**而不是变成"一个菜单都没有"**。

---

## `src-tauri/src/commands/window.rs`（77 行）

**窗口自身的控制**两条（2026-09-27；开发者工具那条在前，晚些时候加了第二条）。
⚠️ 这两条**不是我们划在一起的**：Tauri 的权限给两套命名空间（`core:window:*` 与
`core:webview:*`，见 `capabilities/default.json`），开发者工具那条走 webview。
⚠️ 「窗口置顶」**不在这里**——前端直接 `getCurrentWindow().setAlwaysOnTop()` 就够了，
而菜单上那个勾的判据必须是"从窗口读回来的"（同全屏，见 `ui/useImmersive.ts`）。

### `nota_window_open_new(path: String) -> Result<()>`

「在新窗口中打开」——**再起一份进程**，不是 `WebviewWindowBuilder`。

```rust
std::process::Command::new(&程序)
    .arg(crate::cli::新窗口选项)     // ⚠️ 常量，不是字面量
    .arg(&path)
    .spawn()
```

⚠️ **为什么是另一个进程**：同进程的两个窗口**共用 `AppState`**（文档表同一张、
插件注册表同一份），那不是用户要的"新窗口"。代价写在 `lib.rs` 那一处——这一份
**不持有 socket**，收不到 `nota:second-instance`（第三次普通启动仍然转交给第一份）；
用户明说了「不用考虑拖回来的情况」，所以这个代价付得起。
⚠️ **不 `wait()`**：等它退出等于把界面挂住。
⚠️ **空路径在这里也判一次**（`NotaError::other`）——界面上那一条已经灰了，但命令是
对外开着的一条路，别指望调用方都守规矩。
⚠️ 程序自己那条路径用 `std::env::current_exe()` 取，**不缓存、也不从设置里读**：
新窗口必须与当前这一份是同一个可执行文件。

### 测试

无（这条命令起进程、碰 `current_exe()`，不是纯函数）。挑参数那一半的规则在
`cli.rs`，那边有 16 条；**常量必须是同一个串**这件事靠"两处都引同一个常量"保证，
用例钉不住。

---

## `src-tauri/src/commands/export.rs`（266 行）

导出与打印的**落盘那一步**。四个命令，都是薄的：

| 命令 | 干什么 |
|---|---|
| `nota_export_write(path, content) -> Result<String>` | 把前端生成好的 HTML 写到用户选的路径，返回**真实写出去的路径** |
| `nota_export_write_bytes(path, base64) -> Result<String>` | **二进制**那一路。前端只有字符串能过 IPC，所以先 base64；这里解码再写。分享卡「保存为图片」存 PNG 走它。⚠️ **先解码再开文件**：base64 坏了要报错**并且不留半个文件**（有测试盯着这一条） |
| `nota_export_print(app, doc_path, title, content) -> Result<String>` | 写到落点，再 `opener` 交给系统默认程序。返回那个落点 |
| `nota_export_reveal(path) -> Result<()>` | 在文件管理器里**定位**（不是打开）那个文件——导出设置那条「导出后打开所在目录」用 |

⚠️ 本节 2026-09-27 第九遍重数时从"两个"改成"四个"：`nota_export_write_bytes` 从
上线起就没进过任何一张表（`docs/01` 的分组表当时也写着 3 个），标题行数同批
从 204 对齐到 266（新增的两条各带测试）。

### ⚠️ 为什么 HTML 不在这里生成

生成要跑一遍 Markdown → DOM。后端要做，就只能另写一个序列化器，或者拉起一个
无头 webview——两条都是**第二套渲染路径**，和屏幕上那份迟早不一样。所以这里
只收字符串、只落盘。

### `fn 打印落点(doc_path: Option<&str>, title: &str) -> PathBuf`（私有）

| 情况 | 落点 |
|---|---|
| 有文档路径 | **文档自己那个目录**下的 `.nota-print.html` |
| 没有（未保存的新文档） | `<系统临时目录>/nota-print-<洗干净的标题>.html` |

⚠️ **落在文档目录是有意的取舍**：正文里 `![](./img.png)` 是相对路径，
换个目录图片就全丢了。代价是会在用户目录里留下一个点开头的隐藏文件——和 Slidev 的
`.nota-slidev-<id>.md` 是同一类取舍：**名字带点、不污染目录列表**。

### `fn 清文件名(title: &str) -> String`（私有）

把 `/ \ : * ? " < > |` 换成 `-`。⚠️ **洗成空串、或者只剩横杠时给「未命名」**：
不这样的话 `title = "/"` 会造出一个叫 `-`（或 `nota-print-.html`）的文件——一个
既有隐藏属性、名字里又没有任何信息的东西。

### 测试（7）

覆盖：落点跟文档目录走 / 没文档路径就落临时目录 / 标题里的分隔符被换掉（不会
拼出子目录）/ 洗成空串或只剩横杠不留下无信息文件 / **写出去的字节与给进来的一模一样**
（最后一条是打印之外那一类"只要透明"的接口该有的底线）＋ 2026-09-27 补的两条
（**正常 base64 存进去的字节与原文一致** ／ **坏掉的 base64 报错且不留下半个文件**，
对应 `nota_export_write_bytes`）。

---

## `src-tauri/src/proc.rs`（409 行）

**起外部进程那几件小事**：怎么拆一条命令行、怎么按进程组收尸、怎么带超时地跑一次。
2026-09-25 从 `slidev.rs` 拆出来，判据是**依赖方向**——pandoc 导出要用同样这三件，
而让 `pandoc.rs` 去 `use crate::slidev::…` 会把两个互不相干的功能长期绑在一起
（读代码的人还会以为"导出要先把 Slidev 装上"）。

⚠️ 这里**只许放最通用的一层**：不许出现 Slidev / Pandoc / 导出任何一个的专属概念。
一出现就说明它该待在调用方那边。

### 公开接口（全是 `pub(crate)`）

| 函数 | 签名 | 说明 |
|---|---|---|
| `split_command` | `(cmd: &str) -> Option<(String, Vec<String>)>` | 把一行命令拆成程序名 + 参数。⚠️ **只按空白分词、不认引号**——它服务的对象是调试旋钮（`NOTA_SLIDEV_CMD` / `NOTA_PANDOC_CMD` 那类），够用；真有带空格的路径，自己写个包一层的脚本。⚠️ **探测与真正起进程走的就是这一个拆法**：两边不同，面板就会替一条根本跑不起来的命令打包票 |
| `command_or_default` | `(key: &str, default: &str) -> String` | 现在该用哪条命令：环境变量（调试旋钮）优先，其次默认值 |
| `kill_group` | `(pid: u32)` | 给**整个进程组**发 TERM。Unix 是 `kill -TERM -<pid>`（负号 = 组），Windows 是 `taskkill /T /F /PID`。⚠️ 只发信号**不收尸**——`wait` 归起了这个进程的那一侧 |
| `spawn_retrying` | `(&mut Command) -> io::Result<Child>` | 起进程，**碰上 `ETXTBSY` 就等一小下再试**（5 + 20 + 60 毫秒，第四次失败就认）。⚠️ 两个 `spawn` 的地方都走它（`run_capture` 与 `slidev.rs::spawn_with`），见下面那一节 |
| `run_capture` | `(program, args, opts: RunOpts) -> Ran` | 跑一次：自成进程组、带超时、可喂标准输入、输出全收 |

### `RunOpts`（builder）

`RunOpts::timeout(Duration)` 起手，另有 `.cwd(…)` / `.env(k, v)` / `.stdin(text)`。
⚠️ **超时必须给**：`Child::wait` 没有时限，而任何外部程序都可能挂住——挂住的后果
是界面上那个面板一直转。

### `Ran` 四档

| 档 | 含义 |
|---|---|
| `Done { ok, stdout, stderr }` | 起来了、也退出了。`ok` = 退出码是 0。⚠️ **`ok == true` 不等于"全都做成了"**——pandoc 找不到图片时照样退 0，见 `pandoc.rs::成功时的警告` |
| `NoProgram` | **连程序都找不到**（PATH 里没有它）。⚠️ **单独一档是有意的**：「没装」和「跑砸了」判据不同——前者该引用户去装，后者该把程序自己的输出端出来 |
| `Timeout` | 等超时了。**已经杀了整个进程组**，但收尸归起进程那一侧 |
| `Failed(String)` | 起来了但没跑成（`spawn` 报了别的错，或读输出失败） |

### ⚠️ `ETXTBSY` 要重试：`spawn_retrying` 是哪来的

2026-09-25 查"测试随机报 `Text file busy (os error 26)`"查出来的（并行跑十几回里
坏一两回、`--test-threads=1` 永远绿）。**机制不是测试写错了**：

> `fork` 会把整个 fd 表复制一份给孩子，而 close-on-exec 要等**那个孩子自己 `exec`
> 的那一刻**才生效——在那之前，它手里攥着我们早先写脚本时那个可写 fd 的副本。
> 于是"写脚本 → `close` → `chmod` → `spawn`"这条路上，只要**另一条线程**在我们
> `write` 的那一刻恰好 `fork` 了一次，那个孩子就能让我们的 `execve` 吃 `ETXTBSY`
> （`execve` 的 `deny_write_access` 判的是"这个 inode 有没有人开着写"），
> 而那个孩子的 `exec` 排在前面还是后面全看调度器。

复现是拿 Python 做的（四条线程各跑 150 轮 `write`+`chmod`+`fork`+`exec`）：不重试
时 600 轮里错 13~34 轮，**先写成 `s.tmp` 再 `rename` 进去也没用**——`rename` 换的是
名字、不是 inode，攥着旧 fd 的孩子照样拦。所以这里**不是**在掩错误：`ETXTBSY`
本来就是暂时状态（另一头可能是编辑器正在存那个包装脚本、包管理器正在装它），
等一下就好；真错误（权限不对、格式不对、目录不存在）报的是别的 errno，
**一次都不会重试**。

判据在 `proc.rs::文件正被别人写着时等一下再起`：自己拿着可写 fd 不放、另一条线程
过一会儿放掉——把那个随机状态做成确定的。把重试那行短路掉，它就如实报
`Failed("… Text file busy (os error 26)")`（验过）。

### 两处实现细节

- **喂标准输入另起一个线程**：正文可能有几 MB，而"边写边等"在管道满时会和子进程
  互相卡住——两个线程各干各的，绕开整类死锁。
- **测试里的假命令必须是真脚本文件**：`split_command` 会把 `sh -c '…'` 和 `printf`
  拆坏（它只按空白分词），拿它们当夹具会得到一条永远跑不起来的命令。

### 测试（9）

拆命令按空白分词 · 杀的是**整个进程组**（不是那个 child） · 环境变量优先于默认值 ·
跑到程序自己的输出 · **找不到程序是单独一档** · 挂住的命令会超时而不是一直等 ·
标准输入喂得进去 · 退出码非零时把输出留下来 · **文件正被别人写着时等一下再起**。

---

## `src-tauri/src/pandoc_format.rs`（170 行）

**借 pandoc 转的那七种格式的词汇表**。2026-09-25 从 `pandoc.rs` 拆出来（那边当时
985 行、贴着 1000 的硬上限）。拆的判据是**"谁知道什么"**：这一份是"格式的名字与后缀"，
不认识进程、路径、设置里的任何一个字——探测与导出两边都要用它，所以它谁也不属于。

### 公开接口

| 项 | 说明 |
|---|---|
| `pub(crate) enum Format` | 七档：`Pdf` / `Docx` / `Rtf` / `Epub` / `Latex` / `Odt` / `Opml` |
| `Format::from_id(&str) -> Option<Format>` | 前端传来的 id（`pdf` / `docx` / …）→ 枚举。⚠️ 认不出返回 `None`，**命令层要吭声**（静默会表现成"点了没反应"） |
| `Format::to(self) -> &'static str` | 给 `pandoc --to=` 的名字。⚠️ `odt` 这一档是 `opendocument`，**和 id 不一样** |
| `Format::id` / `extension` / `名字` | 菜单 id / 存盘后缀 / 中文名（面板与对话框显示用） |
| `pub(crate) const ALL: [Format; 7]` | 七种，**顺序就是界面上的顺序** |
| `pub struct FormatInfo` | 交给前端的形状：`{ id, name, extension }`（拼保存对话框的过滤器与默认名） |
| `pub(crate) fn 格式表() -> Vec<FormatInfo>` | 上面那张表的构造 |

### ⚠️ 为什么单开一个文件：三处名字必须同源

菜单 id（前端 `导出为(id)` 传的）、`pandoc --to=` 的名字、存盘后缀是**三个不同的
字符串**，而在 `pandoc.rs` 里它们原本散在探测和导出两处。对不上的症状是
**「对话框说存 `.tex`、文件却是 `.latex`」**，一处都不报错——所以收进一份表，改就一起改。

### 测试（1）

七种格式的名字与后缀对得上（这条是"表内部自洽"的底线，不是覆盖率的追求）。

---

## `src-tauri/src/pandoc.rs`（612 行）

**借系统里那个 pandoc 导出七种格式**（PDF / Word / RTF / EPUB / LaTeX / ODF / OPML，
2026-09-25）。文件头讲了为什么是"借"而不是"带"。

⚠️ **探测那一半 2026-09-29 拆去了 `pandoc_probe.rs`**（那一份当时 836 行，见下面单独一节）：
「这台机器现在能不能用」／「真的去转换一份文档」是两件事，连失败通道都不一样。
本文件里 `pub(crate) use super::pandoc_probe::{…}` 把那些名字**原样转出**，
所以 `crate::pandoc::{ProbeState, probe, find_engine}` 这类老路径一个字没改。

### ⚠️ 三条对外口径（改任一条都要同步文档）

1. **不自带、不下载、不替用户装**。做成这样的是"探测系统里已经有的"——用户的原话是
   「你可以让他自己寻找系统的pandoc，别人也是这么做的」。`docs/10` §11.2 那条
   「不做 Pandoc」因此是**窄的**：管的是内嵌/下载/代装。
2. **不存路径**。存下来的会过期（换机器、改 PATH、重装、用户手改配置），探一次只要
   几十毫秒，所以每次现探。设置里那条 `没有_pandoc_这一项` 守的就是这条。
3. **探测形状照抄 `slidev_probe.rs`**：`Ready` / `Missing` / `Unknown` 三档
   （kebab-case 过 IPC），**判定那句话由后端写**（中文，前端一个字都不重写）。

### 公开接口

| 项 | 说明 |
|---|---|
| `pub enum Route` | `Pandoc` / `Nota`——这次走的是哪条路，**前端必须说出来** |
| `pub struct PandocExport` | `{ path, route, note }`。`note` 是给用户看的中文（提示条纯文本，不许有 `**强调**`） |
| `pub(crate) fn export_to(kind, markdown, target, doc_dir) -> Result<String>` | 导一次，`Ok` 里是**成功那一路的警告文本**（可能空串） |

### ⚠️ 四条实现口径

- **正文走标准输入**（`export_with` 里 `opts.stdin`）：不落中间文件，也就不往用户
  目录里塞东西。
- **`cwd` 与 `--resource-path` 都指向文档目录**：正文里 `![](./img.png)` 是相对路径，
  换个目录图片就全丢了——和打印、Slidev 那两处是同一条理由。
- **PDF 才传 `--pdf-engine`，而且只在真找到时才传**：没找到**不等于**出不了 PDF
  （pandoc 有默认引擎），传一个不存在的引擎才会把它弄死。
- **给子进程补语言环境**（2026-09-25 修，见下）。

### ⚠️ 补语言环境：一个静默丢图片的坑

`补语言环境()` 只在**当前语言环境不是 UTF-8** 时给子进程补 `LC_ALL=C.UTF-8`
（优先级 `LC_ALL` > `LC_CTYPE` > `LANG`；用户的 `zh_CN.UTF-8` 一律不动）。
成因是 pandoc 是 Haskell 写的、GHC 的文件系统编码跟着 locale 走：在 `POSIX`/`C` 下
**打不开非 ASCII 文件名的资源**，报一句 `WARNING`、**退出码还是 0**、把图片换成
替换文字。三条合起来才要命，所以连"退出码 0"这条判据都不够用。

### ⚠️ 成功那一路上也要扫 `WARNING`

`成功时的警告(stderr)` 把带 `WARNING` 的行挑出来（最多 3 条，超了加一句
「另有 N 条同类的没列出来」），塞进成功时的提示条。理由就是上面那条：
**图片没找到时 pandoc 是成功返回的**。

### 测试（11）

参数构造（`build_args`：标准输入之外的输入路径、`--pdf-engine` 只给 PDF 且只在找到时给、
前缀命令的参数排在前面）· 语言环境（`认得出哪些语言环境是_utf8`）· 警告（只挑 `WARNING`
行、有条数上限、**成功但报了警告也要带出来**）· 导出（正文从标准输入喂进去 / 相对路径的
图片按文档目录找 / 退出码零但没生成文件**也算失败** / 失败时把 pandoc 自己的报错端出来 /
没装时导出的报错说的是没装）。⚠️ 那些跑真进程的用例都 `#[cfg(unix)]`。
⚠️ **探测与找引擎那 7 条跟着代码去了 `pandoc_probe.rs`**（它们留在原地也能跑——那两组的
假 `pandoc` 是本文件造的——但"测什么跟着什么走"更好找）。

---

---

## `src-tauri/src/pandoc_probe.rs`（277 行）

**「这台机器现在能不能用」那一半**（2026-09-29 从 `pandoc.rs` 拆出，那一份当时 836 行）：
跑一次 `--version` 看装没装、在 PATH 里找排版引擎、把结论说成人话。

拆的线不是按行数对半砍：探测那半边**不碰文档**（唯一的输入是一条命令名），导出那半边
**不判断装没装**（它把探测结论当既成事实）。

⚠️ **探测结论不存盘**，每次现探（实测毫秒级）——所以本文件里没有缓存，也不该加。
`pandoc.rs` 文件头那条"存的是探测结论，不是路径"说的是**设置项**那一侧，别混。

### 公开接口

| `pub enum ProbeState` | `Ready` / `Missing` / `Unknown`。⚠️ `Unknown` 是"问了但说不准"（命令挂住、认不出版本旗子），**不是** `Missing` 的别名 |
| `pub struct PandocProbe` | `{ state, command, version?, message, detail, pdf_engine?, fallback_pdf, formats }`。⚠️ `pdf_engine` 为 `None` **不是**"不能出 PDF"的宣判（引擎可能在非 PATH 的目录、或配在 pandoc 自己的 defaults 里），它只影响面板上那句话；`fallback_pdf` 是问 `pdf_print::available()` 要来的，**不在这里再写一遍平台名** |
| `pub fn probe() -> PandocProbe` | 跑一次探测。⚠️ **不联网、不起服务器**，10 秒收手（`CHECK_TIMEOUT`） |
| `pub(crate) fn find_engine() -> Option<String>` | 在 PATH 里按偏好顺序（`ENGINES`，`xelatex` 优先）找一个排版引擎 |

⚠️ 这几个名字在 `pandoc.rs` 里**原样转出**，所以对 `commands/pandoc.rs` 而言路径没变。

### `fn 装好了那句(out) -> String`（私有）

探测报告里那句中文结论。⚠️ 别和 `commands/pandoc.rs` 的 `一句话()` 混起来：那个是
**摘要一条报错**用的，这个是**描述一个状态**用的。

### 测试（7）

引擎按偏好顺序找而不是碰到谁算谁 · 空 `PATH` 里什么都没有 · 三种探测结论
（问到版本就是能用 / 挂住或认不出版本旗子都判"不确实" / 没装时报的是没装而不是别的 /
空命令不崩）。⚠️ 跑真进程的用例都 `#[cfg(unix)]`。⚠️ 用例的**位置**和代码的**归属**是两回事：
这 7 条现在写的仍是 `pandoc.rs` 里那套假 `pandoc` 助手（`temp_dir` / `假命令`），
所以它们**留在 `pandoc.rs` 的 `mod tests` 里**，没有跟着搬。

## `src-tauri/src/pdf_print.rs`（288 行）

**用 WebKit 自己把一份 HTML 静默印成 PDF**——PDF 导出的**兜底**，**只有 Linux 有**。
用户 2026-09-25 定的口径是「两条都留、pandoc 优先」，并且**每次都要说清这次走哪条**。

### 为什么是"印"不是"导"

WebKitGTK 2.52 **没有导出 PDF 的 API**（实测：`webkit2gtk` 那个 crate 里没有
`print_to_pdf`，`.so` 里也没有任何 PDF 符号）。唯一走得通的是**打印系统**：给一份
`PrintSettings` 指向"输出到文件"，再让 `WebKitPrintOperation` 跑一遍。

### 公开接口

| 项 | 说明 |
|---|---|
| `pub(crate) const PRINT_TIMEOUT` | 120 秒。⚠️ 超时**取消不了**那次印刷（WebKit 没给取消的口子），只能把窗口收掉、把结论报成失败——所以要留得宽 |
| `pub(crate) fn available() -> bool` | 这台系统上有没有兜底。⚠️ 就是 `cfg!(target_os = "linux")`，**不是"试试看"** |
| `pub fn print_html_to_pdf(app, html, doc_dir, target) -> Result<()>` | 印一份到 `target`。非 Linux 上这一条只有"没有"（返回错误），**如实说**，不假装能导 |

### ⚠️ 实测过的三件事（2026-09-25）

1. **必须同时设 `printer`（`Print to File`）和 `output-uri`**。只设后者，WebKit 会去起
   系统打印命令，报 `Failed to execute child process "lpr"`——"输出到文件"在 GTK 那边
   是**一台假打印机**，不是 URI 的一个属性。
   另注：这两个是 **`settings.set(key, value)` 的键名**（`KEY_URI` / `KEY_FORMAT`），
   由 `libprintbackend-file.so` 读，**不是 C API 函数**。见本文件尾那条链接期教训。
2. **`Gtk.OffscreenWindow` 不行**：WebKit 起不来 GL
   （`GDK is not able to create a GL context`）。要的是"`realize()` 过但**从没 `show()`**
   的普通窗口"——它照样算有屏幕可画，用户眼前又不会闪一下。
3. **`WebKitPrintOperation` 不是 `Gtk.PrintOperation` 的子类**，所以
   `set_export_filename` 那条路不通（那是另一套 API 上的方法）。

### ⚠️ 两个必须记住的坑

- **对象得活到信号来**。印刷是异步的：对象在 `finished` / `failed` 之前被回收，轻则没
  结果、重则崩。所以有一个"印刷中"的登记处（`印刷中`），它**必须**是 `thread_local`
  ——GObject 不是 `Send`，放进 `static Mutex` 连编译都过不去。
- **不许在自己的信号回调里把父窗口放掉**（那等于在释放正在使用的对象）。收工一律经
  `glib::idle_add_local_once` 推到下一轮主循环再做。

### ⚠️ 链接期才炸的那条教训（写在 `KEY_URI` 那格注释上）

照名字猜着写的 `gtk_print_settings_set_output_uri(…)` **编译期全过、链接期才炸**
（`undefined reference`）——libgtk-3 根本没导出那个符号。**可迁移的一句**：判"某个 C
函数在不在"，不能只看绑定的 `.rs` 里有没有声明，要 `nm -D --defined-only
/usr/lib64/libgtk-3.so | grep gtk_print_settings_set_output` 去查；而且**这类错
`cargo test --lib` 照过不误**（库目标不链接那个二进制），只有 `cargo build` 才炸。

---

## `src-tauri/src/commands/pandoc.rs`（231 行）

「借系统里那个 pandoc 导出」的两条命令。⚠️ 这一层**只有接线**：取参数、把工作丢进
阻塞池、把结论包成人话。真探测在 `pandoc.rs`、真印刷在 `pdf_print.rs`——那两边才有单测。

```text
nota_pandoc_probe ──> 面板（装没装）──> nota_pandoc_export ──> 落点由前端选
                                             └── PDF 那一路：pandoc 不通就自己印
```

### 两条命令

| 命令 | 签名 |
|---|---|
| `nota_pandoc_probe` | `async fn () -> Result<PandocProbe>`——`spawn_blocking(pandoc::probe)` |
| `nota_pandoc_export` | `async fn (app, format, markdown, target, doc_path, html) -> Result<PandocExport>` |

⚠️ **两条都异步**：探测要起进程问版本、导出最长 180 秒。Tauri 的同步命令跑在**主线程**
上——在那儿等就是把界面冻住（同 `commands/slidev.rs` 的 `probe_install`）。

⚠️ **`target` 不给兜底**：这里不替用户决定文件名。保存对话框是用户亲手选的，换一个落点
写出去就是把文件丢在他不知道的地方。

### PDF 那一路（用户口径：两条都留、pandoc 优先）

pandoc 失败、格式是 PDF、且 `pdf_print::available()` 时，改用自带那套印一份。返回值
`route` 说明这次走的哪条、`note` 把它说给用户听。⚠️ 前端没带 HTML（`html = None`）时
**如实说**"没带兜底要用的 HTML，所以没法改走自带那条路"，不退回含糊话。

### `fn 一句话(e: &NotaError) -> String`（私有）

把一条报错压成提示条上的一句。⚠️ **跳过以 `:` / `：` 结尾的标题行**——本仓的报错是
「结论行 + 换行 + 病因」那个形状，只取第一行会得到**「pandoc 没能生成 PDF：」**这种
半句空的提示语（2026-09-25 开窗点出来的）。**可迁移的判据**：提示条上出现"冒号后面是
空的"，就是这一类 bug。

### 测试（4）

文档目录只认存过盘的文档 · 摘要只取第一行且不会太长 · 空报错也给得出人话 ·
**摘要跳过只有结论那一行**。

---

## `src-tauri/src/devserver.rs`（733 行）

**开发服务器：宿主替插件起一个本机进程，再把地址交给界面**（2026-09-25 从 `slidev.rs`
提出来，判据是**归属**不是行数——细节见文件头与 `docs/01` §Slidev 预览）。
`slidev.rs` / `slidev_probe.rs` / `commands/slidev.rs` **三个文件都不在了**，
它们那八条命令也整组删掉：起服务器那条路现在是**插件的命令**（`nota_plugin_call`）。

⚠️ **2026-09-26 破了 1000 行，探测那一半拆去了 `devserver/probe.rs`**（当时 1039 行：
`need` 那批用例顶上来的）。拆的判据是**职责**——「问这台机器能不能跑」和「起一场会话」
本来就是两件事：前者是纯函数、不留状态，后者有会话状态、有 `Drop`、有日志环。
`probe` / `Probe` / `ProbeState` 在 `devserver.rs` 里 `pub use` 转发了一道，
所以 `crate::devserver::probe(…)` 这条路径**对外没变**。

### 公开接口

| 名字 | 签名 | 说明 |
|---|---|---|
| `DevServerState` | `pub struct DevServerState(pub Mutex<HashMap<String, Server>>)` | Tauri 的托管状态。⚠️ **键是插件 id**（一个插件最多一场会话），⚠️ **不放进 `AppState`**——那四个句柄的锁序不变量是给文档/插件用的，这里是一堆子进程 |
| `stop_all` | `(&self)` | 退出时兜底（`RunEvent::Exit`）。⚠️ 不收就是漏：子进程不在 Tauri 管理范围内 |
| `Server` | 一场会话 | ⚠️ **`Drop` 里收摊**——"忘了调 stop"也不会留下孤儿进程与点文件 |
| `Info` | `{ port, url, entry, doc }` | 交给界面（和插件）的快照。⚠️ `url` 里的主机名是**探出来的**，不是写死的（见下） |
| `start` | `(state, plugin: &str, spec: &DevServerSpec, root: Option<&Path>, doc, text) -> Result<Info>` | 挑端口 → 写入口 → 起进程 → **等端口通**（超时 `START_TIMEOUT` = 180 秒）。⚠️ **它阻塞**，与它的前身**故意相反**（前身被同步命令调着，等就是冻界面；现在这条路在 `spawn_blocking` 上） |
| `refresh` | `(state, doc: DocId, text: &str)` | 文档变了：把所有**正盯着这份文档**的会话入口重写一遍。⚠️ 由 `nota_doc_sync` / `nota_doc_settle` 在**放掉 `documents` 锁之后**调（只碰 devserver 那把锁，不往回拿 documents，不破锁序）。⚠️ 入口**还是写在原来的位置**，即使后来"另存为"到别处 |
| `probe`（在 `devserver/probe.rs`，这里转发） | `(spec: &DevServerSpec, root: Option<&Path>, need: Option<&str>) -> Probe` | 探"这台机器现在能不能跑这个插件声明的服务器"。**不联网、不起服务器**。⚠️ 这是**机制那一半**：它**每次都真探**（最多 20 秒），不做缓存——「面板渲染等不起一次 `npx`」那条路是 `lua/api/devserver.rs` 的 `ProbeCache` 在管的（`docs/12`），缓存**故意不放在这里**（语义是"给面板用的一条不阻塞的路"）。⚠️ `need`（2026-09-26 加的第三个参数）是"**这份文档还缺什么**"，见下 |
| `stop` | `(state, plugin: &str)` | 杀进程组 + 删入口文件。**没在跑就是空操作**（重复调用无害） |
| `status` | `(state, plugin: &str) -> Option<Info>` | 当前会话（每次重算 `alive`——`try_wait` 是瞬时的） |
| `log_tail` | `(state, plugin: &str) -> String` | 进程输出最后 30 行。**启动失败时端给用户看**——真正的病因（缺主题、端口被占、node 太老）就在里面 |
| `ProbeState` | `Ready` \| `Missing` \| `Unknown` | 探测的结论。⚠️ `Unknown` **不等于没装**（自定义命令挂住之类） |
| `Probe` | `{ state, command, version, detail, root, marker_found, need_found }` | ⚠️ **里面没有一句人话**——话由插件写。判据：宿主手里的是一堆**事实**，"这算什么情况、该怎么跟用户说"是**插件**知道的。⚠️ `need_found` 是**三档**（`None` = 没问 / `Some(false)` = 问了没有 / `Some(true)` = 有），别当布尔用 |
| `填_frame` | 把探出来的地址填进面板的 `frame` 块 | ⚠️ **插件在 `frame` 里写 url 也没用**：地址只由这里填，而且只会填**这个插件自己**这场会话的地址 |

### ⚠️ 能力放行的是"清单里那一条命令"

程序名与参数模板写在 `plugin.toml` 的 `[devserver]` 段里，随插件一起安装、
一起过签名校验；**Lua 那边交不出第二个程序名来**（`nota.devserver.start` 不收 `cmd`）。
反过来说：一份**签过名的恶意插件**可以把那条命令写成任意东西——这道门挡的是
"插件偷偷起别的进程"，**不是**"插件干了坏事"（后者归安装那一步的信任判定管）。
**别把这一层当沙箱。**

### ⚠️ 三个容易写错的地方

- **主机名必须探、不能写死**（2026-09-25 实测坐实）：服务器绑哪个栈不由我们决定——
  Slidev（Vite）只绑 `[::1]`，写 `127.0.0.1` 的框**永远连不上**；反过来有的工具只绑 v4。
  所以 `挑一个真能连上的回环地址` 是单独一步。
- **`pick_port` 两套栈都要试**：绑 `[::1]:0` 问内核要一个，放开，再确认 v4 上也是空的。
  只试一套会挑中一个用不了的口。
- **`kill_tree` 杀的是整个进程组**：实测进程链是 `sh` → `npm exec` → `node …`，
  `Child` 拿到的是最上面那层；只杀它会留下 node **继续占着端口**——
  下次预览就变成"起得来但连不上旧的那个"，最难查的一种。
  起进程时 `process_group(0)`，给整个组发信号（组号是组长 pid，用负数表示）。

### `need`：宿主只回答"有没有"，不解释那是什么（2026-09-26）

⚠️ 起因是用户实测的一场**假绿**：面板说"能跑"、进程两秒后自己退出来
（`The theme "@slidev/theme-default" was not found`）。`project_marker`
（`node_modules/@slidev/theme-`）只回答了"这是不是一个 Slidev 项目"——
装的是 `theme-seriph`、文档要的是 `theme-default`，照样起不来。

`probe` 因此多收一个 `need: Option<&str>`（相对路径），多还一格 `need_found`。
三条口径：

- **往上找**：根**和它的每一层父目录**都看（Node 解析 `node_modules` 就是从当前目录
  一层层往上的，实测那场主题就装在文档的父目录里）。与 `marker_installed` 同一把尺子。
- **只回答"在不在"**：宿主不知道也不想"这是主题"。⚠️ 传进来的非法路径（绝对路径、
  `..`、反斜杠、空段）**一律不回答**（保持 `None` = 没问）——那等于把"探一探这台机器上
  有什么"这条路打开，而它一个正当用途都没有。判据：`合法的相对路径`。
- **为什么不让插件自己找**：`nota.fs` 是**工作区根**底下的、且**不收绝对路径**
  （`lua/api/fs.rs`），插件沿不了文档的父目录往上走。文档的绝对路径只在宿主手里。

### 测试（10 条 + `probe.rs` 5 条）

挑端口（两套栈都得空）· 入口名是点文件 · 未存盘退回插件数据目录 · 入口名跟着文档走
（不互相覆盖）· 同步是**整份替换**不是追加 · 没在跑时同步是空操作 · 日志环只留最后几行 ·
杀的是进程组不是那个壳 · 收摊之后进程真没了 · 文档变了只刷盯着它的那一场。
`devserver/probe.rs` 那 5 条：标记目录要往上找 · 额外要找的东西也往上找（"文档在 `~`、
主题在 `~/node_modules`"那个形状）· 相对路径的判据 · 命令不存在时报的是人话 ·
不合法的要找的东西不算问过。
⚠️ 探测的用例是**真起进程**（`printf` 当假 CLI、`sleep` 当挂住的自定义命令），
没有 mock——探测的全部风险就在"真程序在真系统上怎么反应"。
⚠️ 原来 `slidev_probe.rs` 那 10 条里，凡是**只对 Slidev 成立**的（npm 的 `--yes`、
`@slidev/theme-*`）都随插件搬走了（判据现在是清单里的 `project_marker`
＋ 每次调用带上来的 `need`），留在宿主的只剩**通用的**那几条。

---

## `src-tauri/src/lang.rs`（356 行）

**「什么算一种合法语言」的唯一权威**（2026-09-25）。宿主与插件的语言协商**都问它**——
`lua/api/i18n.rs` 不自己写一套，`settings/general.rs` 那一格选择框也不自己列一份。

| 名字 | 是什么 |
|---|---|
| `支持的语言` | 眼下支持哪几种（`["zh-CN", "en"]`）。⚠️ **顺序就是设置里那个选择框的顺序** |
| `语言名` | 各语言的**自称**（`中文（简体）` / `English`）——选择框里显示的是这个，不是 `zh-CN` |
| `插件兜底` | `"en"`。**对插件作者的要求**：应用语言不在插件的 `langs` 里时插件用哪一种。⚠️ 插件的 `langs` **必须**含它，否则整份清单**拒载**（`plugin/manifest.rs`）。⚠️ 这个值**不能改**（用户 2026-09-25 点名要英语） |
| `应用兜底` | `"en"`。**应用自己**的落点：`settings.toml` 跟系统走而系统语言认不出来、或写了个应用没有的语言时，界面落到这儿。⚠️ 与 `插件兜底` **是两个概念**（2026-09-26 拆开）——今天同值只是因为同一个理由（英语是插件与 Markdown 生态的通用语），不是一个常量被两处引用。⚠️ 2026-09-26 它跟着"前端那张表覆盖到哪儿"走（那天上午取 `zh-CN`、下午表铺齐才翻回 `en`）；⚠️ **2026-09-28 语言翻转之后那层依赖没有了**——英语成了**原文**，"英语界面完整"由构造保证，这个值不再有条件 |
| `自动` | `"auto"`。设置里那一格的默认值：**跟系统语言** |
| `规范` | 把 `zh_CN.UTF-8` 这类归一成 `zh-CN`（去编码后缀、下划线换连字符、大小写归一） |
| `匹配` | 先精确，再**只往粗的**匹配：应用 `zh-CN` 能匹配插件的 `zh`，**反过来不行** |
| `读语言文件` | 读插件目录下的 `lang/<tag>.toml` |
| `有效语言` | `(设置里那一格, 系统语言) -> String`——`auto` 就取系统语言，取不到就用 **`应用兜底`**（⚠️ 不是 `插件兜底`：这两个常量拆开的意义正在这里，选错了就是把插件那条规矩套到应用头上） |

⚠️ **判据一句话**：应用语言在插件的 `langs` 清单里就用那个语言，不在就用英语，
并在界面上给这个插件挂一句「此插件不支持您的语言」。
⚠️ **反直觉的推论**：插件**必须**含 `en`，而应用语言眼下就两种（`zh-CN` / `en`）——
所以**应用语言是 `en` 时那句话不可能出现**。它的英文译文目前是**取不到的死文案**，
留着是为了第三种语言进来的那天（细节见 `docs/11` §2.4）。
⚠️ **改语言要重启**：语言在 `lib.rs` 里算一次、插件的文案表在 `on_load` 时读。

---

## `src-tauri/src/lua/api/i18n.rs`（335 行）

`nota.i18n` 这张表（2026-09-25）。**不要能力**——路径由宿主用**插件自己的目录**拼
（`lang/<tag>.toml`），插件只交**键**。所以插件**永远拿不到"去哪读文件"这个口子**，
与 `[devserver]` 的 `entry` 是同一条纪律。

| Lua 侧 | 是什么 |
|---|---|
| `app_lang` | 应用现在的语言 |
| `lang` | 按协商结果给插件用的语言。⚠️ **没声明 `langs` 时是 `nil`** |
| `ok` | 应用语言是否在 `langs` 里（**只看清单、不看文件**，见下） |
| `text(s)` | 查表；查不到返回 `nil`（标准写法 `nota.i18n.text(s) or s`） |

**三条容易反着理解的规矩**：

1. **键就是作者自己写下的那句原文**（不是 `plugin.git.refresh` 这种键名）。
   推论：译文表**只需要写要翻译的那些键**，作者母语那份几乎是空的；
   而读完 `main.lua` 就等于读完了文案表。
2. **`ok` 是"清单里有这个语言吗"，不是"`lang/` 下有这个文件吗"。**
   声明了 `zh-CN` 却没放文件，`ok` **照样是 `true`**——缺文件只让 `text()` 一路
   返回 `nil`（退回原文），**不会**把 `ok` 翻成 `false`。理由：`ok` 是"要不要跟用户
   说那句话"的开关，而"没做过这门语言"与"做过但文件坏了"是两件事，后者该进日志
   （只在调试模式下打），不该在界面上把话说过头。
3. **语言表里的保留键 `name`** 覆盖清单里那个名字（**只覆盖显示名，改不了 id**）。

⚠️ **协商在加载时就做完**（`i18n::装`，在 `on_load` 之前）——所以插件在 `on_load`
里就能用 `nota.i18n.text`，也就不可能在运行中换语言。

---

## `src-tauri/src/lua/api/unified_diff.rs`（417 行）

`nota.diff.parse_unified`（2026-09-25）：把 **`git diff` / `diff -u` 的标准格式**
解析成与 `nota.diff.parse` 同一套 `{path, added, deleted, lines}`，
好让插件把"git 工作区的改动"直接画成面板里那块 diff。

| 名字 | 说明 |
|---|---|
| `parse_unified(text)` | 唯一入口。认 `--git a/x b/x` 头的标准 diff |

⚠️ **三条规矩**（写在文件头，**都是"看着像 bug，其实是判据"**）：

1. **只有 `diff --git` 之后的 `---` / `+++` 才算文件头。**
   光跑 `diff -u 甲 乙` 得到的是**空**——那条路今天不支持，不是坏了。
2. **不认上下文行**（只画增删；上下文行进不了结果）。
3. **路径依赖 `-c core.quotePath=false`**（否则中文路径会被 git 转义成八进制）。

⚠️ 与 `lua/api/diff.rs` **分开**的理由是**输入格式完全不同**：那边是插件自己和模型
约定的 `nota-diff` 围栏，这边是 git 的标准输出。同一个 `{path, added, deleted, lines}`
是**输出**的形状，两边共用；解析器不共用。

---

## `src-tauri/src/lua/api/devserver.rs`（705 行）

`nota.devserver`（2026-09-25，需 `process.devserver`）：
`probe{}` / `probe{root=}` / `probe{force=true}` / `start{doc=}` / `status()` /
`open_in_browser()` / `log()` / `stop()`。

| Lua 侧 | 说明 |
|---|---|
| `probe{}` / `probe{root=, need=}` | 拿**已经探过的结论**，**不等**。有就回，没有就回一张 `state = "checking"` 并在后台开一条（探完宿主发 `nota:plugin-panel` 叫前端重拉那一页）。**不改任何状态**——所以它是**一次问话**，不是"预览的某个阶段"。⚠️ `need`（2026-09-26 补）多问一件事："这条相对路径在项目根或它的任一层父目录里有没有"，回报在 `need_found`（**三档**：没问 `nil` / 有 `true` / 没有 `false`）——`docs/13` §13.3b |
| `probe{force=true}` | **当场探**（最多 20 秒）。用在"用户刚点了一下"的场合（`start` 与「重新检测」）：那一刻给的结论必须是**此刻的**。⚠️ 面板的 `render` 里**只能用不等那一路**，见下 |
| `ProbeCache` | **这一节最要紧的一样东西**，见下 |
| `start{doc=}` | 起会话并**等到端口通**。⚠️ **阻塞**（最长 180 秒），**不许在 `on_load` 里调** |
| `status()` / `log()` | 查会话 / 取日志尾 |
| `open_in_browser()` | **不收参数**——能打开的只有**这个插件自己这场会话**的地址。⚠️ 这不是 `nota.ui.open_url`（那条只放行 `https`，而且 URL 由插件给）：全屏演示、演讲者视图（双屏）只有真浏览器有，这条路是给它们的 |
| `stop()` | 收摊 |

⚠️ **它不收 `cmd`**：程序名与参数模板来自清单的 `[devserver]` 段（见 `devserver.rs` 那一节）。
⚠️ **宿主只会把 `frame` 块的地址填成这个插件自己这场会话的地址**——
插件在 `frame` 里写 url 也没用。

### 探测缓存：**面板渲染等不起一次 `npx`**

⚠️ **这一节是 2026-09-26 修 `docs/07` BUG-36 时加的**，起因值得记：探测原先是在**面板的
`render` 里同步跑的**，于是第一次打开那个插件页签**画不出任何东西**——正常 1.3 秒、
最坏 20 秒（`recv_timeout`），而且那 20 秒里 **`plugins` 锁被持有**，别的插件命令一起排队。

| 名字 | 说明 |
|---|---|
| `ProbeCache(Mutex<HashMap<String, Slot>>)` | Tauri 的托管状态（`lib.rs` 里 `app.manage(...)`），**键是插件 id** |
| `Slot { root, need, result }` | 上一次的结论，以及**它是拿哪个目录、哪件东西探出来的**。⚠️ `root` **或** `need` 对不上就整条丢掉、重探——用户在两个项目之间切、或者换成另一份要别的主题包的文档，结论都不能串 |
| `Peek`（`Ready` / `Running` / `Go`） | 一次问话的三种回答：有结论 / 正在探（回 `checking`）/ 没人探过，开一条 |
| `探或不探()` | `probe{}` 走的那条路。**只在没人探过时**才 `std::thread::spawn` 开一条 |
| `收下()` | 后台那条探完调它落结论，然后 `app.emit(EVENT_PANEL_DIRTY, {plugin, id: null})`——`id` 为 null 是"这个插件的**每块**面板都脏了" |

⚠️ **缓存的键是（插件 id ＋ 项目根 ＋ `need`）**：⚠️ `need` 进了键（2026-09-26），
因为同一台机器上"这一份文档缺不缺东西"是**逐份文档**都不一样的——不带着它，
换一份文档会读到上一份的结论。
⚠️ **缓存不设过期时间**：Lua 沙箱里**没有 `os`**，插件拿不到钟；宿主这边有钟，但给它加
过期时间会**多出一种界面状态**（"结论过期了但我还没重探"），不值。顶掉旧结论的是
**用户动作**：换项目根或换 `need`（对不上）、`force = true`。
⚠️ **它必须是另外一把锁**：后台线程 `收下` 结论时**不能去等 `plugins` 锁**——面板的
`render` 就跑在那把锁里面，等它就是死锁，"不阻塞"也白做了。
⚠️ **`checking` 那张表只带 `state` / `command` / `root`**，**故意不给**
`version` / `detail` / `marker_found` / `need_found`：还没看过的事不许提前摆在事实表里
（`检查中表` 函数）。
Lua 那一侧的完整语义（四档 `state`、`need` 与 `need_found`）在 `docs/13` §13.3a / §13.3b，
插件侧的写法在 `docs/12`。

---

## `src-tauri/src/native_menu.rs`（494 行）

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
| 认不出的写法 | `None` | **返回 `None` 而不是瞎猜**，并 `日志!` 记一笔（默认不打，见 `log.rs`） |

⚠️ **灰掉的项一律不带快捷键**（`leaf_accel()` 对禁用项返回 `None`）。
这不是为了省事：**AppKit 连禁用的项也参与快捷键匹配**——灰着的 `⌘C` 会截走系统复制，
灰着的 `⌥↑/⌥↓` 会截走段落导航。

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

## `src-tauri/src/plugin/mod.rs`（575 行）

插件宿主：**发现 → 加载 → 派发**；装卸/停用/信任那一段 2026-09-25 拆去了
`plugin/install.rs`（见下面单独一节），**给前端看的那些形状** 2026-09-29 拆去了
`plugin/types.rs`（也见下面单独一节），本文件留**入口与 `PluginHost` 自己**。

### 文件头的"为什么"要点

1. **去重按 `id` 不按目录名。** 目录名是文件系统的事，用户可以任意改；`id` 是清单里声明的、
   插件之间互相引用的名字。用目录名去重会出现"改个文件夹名就多出一份插件"这种事。
2. **一个插件坏掉不能拖垮启动。** `LuaPlugin::load` **不返回 `Err`**，坏掉的插件留下一条
   `Failed(原因)` 记录，界面上照常列出并标红。理由：插件是用户自己装的第三方代码，
   让一个写错的 Lua 脚本变成"应用打不开"，用户连去禁用它的界面都进不去。

### `pub struct PluginHost`

```rust
pub struct PluginHost {
    plugins: Vec<LuaPlugin>,
    installed: Installed,
    base: HostContext,
}
```

`installed` 是**落盘**的本地账本（`$XDG_CONFIG_HOME/nota/plugins.toml`）：哪些插件开着、
当初装进来时验签验出了什么。⚠️ 早先这里是个内存里的 `HashSet<String>`，重启就丢，
用户看到的是"我明明关过它，怎么又开了"。

`base` 是加载插件要的那份 `HostContext`（**去掉 `plugin_id` 那一栏**）。存下来是为了
**运行期**还能加载：用户点「启用」或者从文件装一个插件时 `discover()` 早跑完了，
没有第二个地方拿得到 `AppHandle` 这些东西。

⚠️ **停用 ＝ 真卸载**（2026-09-25 改的口径）。宿主的做法是把那个插件换成
`LuaPlugin::disabled(清单)`——**一行 Lua 都不跑**、没有 Lua 状态。所以 `PluginHost`
里**没有**一个 `disabled` 集合了：判据在 `Installed::is_enabled` 里（它管着
"没记过时按构建档"那条默认值：调试档开、发布档关）。代价说在当面：**重新启用会
重跑一遍 `on_load`**，插件必须自己写成幂等的（`docs/11` §1.6.7）。

| 方法 | 签名 | 行为 / 失败 |
|---|---|---|
| `discover` | `pub fn discover(resource_dir: Option<PathBuf>, base: &HostContext) -> Self` | 见下。⚠️ 先读 `plugins.toml`，**被停用的插件连 Lua 都不建**（走 `LuaPlugin::disabled`）——"关了它就当它不存在"必须从这一刻算，等到派发命令时才拦的话 `on_load` 早跑过了 |
| `list_info` | `pub fn list_info(&self) -> Vec<PluginInfo>` | 逐个插件造快照。判定顺序：**先看用户停用没有**（`is_enabled` 为假 ⇒ `"disabled"`），再看 `state`（`Loaded` → `"loaded"`、`Disabled` → `"disabled"`、`Failed(e)` → `("failed", Some(e))`）。⚠️ 停用**先于**加载状态判：它是用户的显式动作，说"已停用"比说"加载失败"更接近用户看到的事实。另外三项 `origin` / `signature` / `key_id` 从 `installed` 那本账和目录落点算 |
| `get` | `pub fn get(&self, id: &str) -> Option<&LuaPlugin>` | 按 id 找 |
| `is_enabled` | `pub fn is_enabled(&self, id: &str) -> bool` | 问 `installed`（**已落盘**）。⚠️ **返回 `true` 不等于"能用"**——加载失败的插件也是 `true`。它是"用户想不想要它"，不是"它跑不跑得起来" |
| `set_enabled` | `pub fn set_enabled(&mut self, id: &str, enabled: bool) -> Result<()>` | 没有这个插件 → `Err(other("没有这个插件：{id}"))`。**两个方向都落盘，而且都是真的装卸**：启用先记账再 `LuaPlugin::load`（⚠️ 只在**当前没有 Lua 状态**时才真 load，已在跑的不白跑第二遍 `on_load`）；停用先记账、给一次 `unload()`（所以有 `on_unload`），再换成 `LuaPlugin::disabled` |
| `call_command` | `pub fn call_command(&self, plugin_id: &str, command: &str, args: mlua::Value) -> Result<mlua::Value>` | 先过 `可调用的` 那三道闸（见下），过了交给 `LuaPlugin::call_command` |
| `find_command_owner` | `pub fn find_command_owner(&self, command: &str) -> Option<&str>` | 在**正在生效**的插件里找**第一个**注册了该命令的。实现是读 registry 的 `nota_commands` 表再 `contains_key`。⚠️ 取不到 registry 时 `unwrap_or(false)` 当"没有"——所以加载失败的插件不会误报 |
| `panels` | `pub fn panels(&self) -> Vec<PluginPanel>` | 所有生效插件声明的面板。逐个调 `读面板(&p.lua, id)` 再摊平。**这是 BUG-13 的修法**：前端挂载后**拉**它，不是等事件推 |
| `menus` | `pub fn menus(&self) -> Vec<PluginMenuItem>` | 同上，菜单项。📌 **2026-09-24 起前端真的用上了**（backlog 第 42 项）：插件那一列插在 `help` 之前，命令 id 是合成出来的 `__plugin:<plugin>:<command>` |
| `panel_content` | `pub fn panel_content(&self, plugin_id: &str, panel_id: &str) -> Result<serde_json::Value>` | **现调**那个面板的 `render`，拿到它**此刻**的内容。⚠️ 它**会跑插件的 Lua**，所以调用方必须放到阻塞线程上（`commands/plugin.rs` 那条 `spawn_blocking`）——`render` 里常常要起 git 子进程，跑在主线程上就是**冻界面** |
| `count` | `pub fn count(&self) -> usize` | 插件**条目**数（含失败、含停用的），`lib.rs` 启动日志用它 |
| `unload_all` | `pub fn unload_all(&mut self) -> ()` | 逐个 `LuaPlugin::unload()`。窗口销毁时调。⚠️ 停用的那些是 `Disabled` 状态、没有 Lua，`unload()` 对它们是空操作 |
| `位置` | `fn 位置(&self, id: &str) -> Option<usize>` | 插件在 `plugins` 里的下标。`set_enabled` 要原地换掉一个插件，所以要有它 |
| `上下文` | `fn 上下文(&self, id: &str) -> HostContext` | `base` 加上这个插件的 id。**运行期加载**（启用 / 装新插件）要用 |
| `频道被占` | `fn 频道被占(&self, id: &str) -> Option<String>` | 这个 id 想要的事件频道被别的插件占了吗，占着的那个是谁。判据与 `discover` 里那段一样（`manifest::channel_id`）。⚠️ 抽出来是因为**安装时还要再判一次**——先装的那个先占，后装的那个要拒，不然两个插件往同一个频道发事件，前端分不清是谁发的（"多发一条事件"是最难查的症状）|

**私有辅助（不在 `impl` 里，是模块级自由函数）：**

| 函数 | 签名 | 说明 |
|---|---|---|
| `生效的` | `fn 生效的(&self) -> impl Iterator<Item = &LuaPlugin>` | **加载成功 且 用户没禁用**。命令、面板、菜单三处**共用同一条判据**——各自写一遍的话，改一处忘一处就会出现"禁用了还列在面板里"这种半生效状态 |
| `读面板` | `pub(crate) fn 读面板(lua: &Lua, plugin_id: &str) -> Vec<PluginPanel>` | 从 registry 的 `nota_panels` 读。⚠️ 收 `&Lua` 而不是 `&LuaPlugin`，**是为了能被用例钉住**：BUG-13 的病灶正是写的一侧和读的一侧对不上，而 `LuaPlugin` 要先 `load`（要真的 `AppHandle`）才拿得到 |
| `读菜单` | `pub(crate) fn 读菜单(lua: &Lua, plugin_id: &str) -> Vec<PluginMenuItem>` | 同上。⚠️ 菜单项里的 `prompt` **只在这里收形状**（menu 那一条是个原表，过不了 `PluginPrompt` 的 `Serialize`），面板按钮的那一份在前端收——**两份字段名必须一样**，见 `PluginPrompt` |
| `读提示` | `fn 读提示(t: &mlua::Table) -> Option<PluginPrompt>` | ⚠️ **`arg` 缺了或为空 ⇒ 返回 `None`，整条 `prompt` 当没写**——问了也送不出去，不如不问。`label` 空 → `"请输入"`；`placeholder` / `hint` 空 → `""`；`secret` 缺 → `false` |
| `声明的` | `fn 声明的(lua: &Lua, reg: &str) -> Vec<mlua::Table>` | 读某个 registry 名下的数组。**没这个键就静默返回空表**——插件没申请能力、或 `on_load` 半路失败，都不是异常 |
| `可调用的` | `fn 可调用的(&self, plugin_id: &str) -> Result<&LuaPlugin>` | **存在 / 没被禁用 / 加载成功** 三道闸，**派发命令与取面板内容共用**。⚠️ 抽出来正是为了不"两处相乘"：各写一遍的话，改一处忘一处就会出现"禁用了还能拉面板"这种半生效状态。⚠️ **用户禁用先于加载状态判**——禁用是用户的显式动作，说"已被禁用"比说"加载失败"更接近用户看到的事实 |
| `REG_PANELS` / `REG_MENUS` / `EVENT_PANEL_DIRTY` / `EVENT_REVIEW` | `REG_PANELS = "nota_panels"`、`REG_MENUS = "nota_menus"`、`EVENT_PANEL_DIRTY = "nota:plugin-panel"`、`EVENT_REVIEW = "nota:plugin-review"` | **各只此一处定义**。写的一侧（`lua/api/ui.rs`）和读的一侧必须说同一个字符串，拆成两处字面量就是又造一对"两处相乘"。⚠️ 两条 `EVENT_*` 都是**事件**（"变了"这个动作），各三处说同一个字符串：发射侧 `ui.rs`（`刷新表` / `预览表`）、`ipc.ts::events`（`pluginPanel` / `pluginReview`）、订阅侧（`ui/PluginDock.tsx` / `ui/usePlugins.ts` 加 `ui/ReviewPane.tsx`） |

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

errors 逐条 日志!("[nota] 插件清单读不了：{e}")（默认不打）
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

无。（装卸/签名那一摊的用例跟着代码走，见下面 `plugin/install.rs`。）

---


## `src-tauri/src/plugin/types.rs`（277 行）

**插件对外声明的形状**（2026-09-29 从 `plugin/mod.rs` 拆出，那一份当时 819 行）：
`PluginInfo` / `信任记录` / `PluginPanel` / `PluginMenuItem` / `PluginPrompt` /
`ReviewKind` / `ReviewAction` / `ReviewState`。

拆家的线是「**这是说给别人的形状，还是宿主自己的动作**」——本文件全是前者：
字段名要**穿过 IPC**（那一串 `serde` 属性就是为这来的），或者要在别处被**照着
字面量比对**。

⚠️ 所以改这里的字段名**不是**改一个 Rust 结构那么大：前端（`bridge/types.ts`、
`ui/panel-nodes.ts`、`ui/plugin-prompt.ts`）与插件作者写的 Lua 都按这些名字说话，
改一次要**两处同批**，不然症状是"界面上那一栏永远是空的"且不报错。

⚠️ `mod.rs` 里 `pub use types::*;` 把这一份**原样转出**，所以
`crate::plugin::PluginInfo` 这类老路径一个字没变——拆家不动门牌。

⚠️ `REG_PANELS` / `REG_MENUS` / `EVENT_PANEL_DIRTY` / `EVENT_REVIEW` 那几条**常量
留在了 `mod.rs`**，没跟着过来：它们也是"两处要说同一个字符串"，但那是**宿主两边**
的事（写的一侧 `lua/api/ui.rs`、读的一侧 `mod.rs`），与"给前端看的形状"不同路。

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
    pub origin: String,             // "builtin" / "user"
    pub signature: Option<String>,  // "verified" / "unknown" / "unsigned" / None
    pub key_id: Option<String>,
    pub removable: bool,
    pub langs: Vec<String>,         // 声明了哪些界面语言（空 = 不参与协商）
    pub lang: Option<String>,       // 此刻在用哪一份文案表（None = 没声明 langs）
    pub lang_ok: bool,              // 协商命中了没有
}
```

**给前端看的只读快照，不含 `Lua`**（这是它能 `Serialize` 的原因，也是它必须存在的原因——
`Lua` 没法序列化，也没法安全地跨线程借出去）。

| 字段 | 来源 / 取值 |
|---|---|
| `state` | `"loaded"` / `"failed"` / `"disabled"` |
| `error` | `state == "failed"` 时的原因，其余为 `None` |
| `dir` | `p.manifest.dir.display().to_string()`（绝对路径，纯展示用） |
| `origin` | `removable` 是 `true` 就 `"user"`，否则 `"builtin"`。⚠️ 判据是**目录落点**（在 `paths::user_plugins_dir()` 下），不是"哪个先扫到"——`discover` 里用户目录先扫，那是**去重顺序**，不是来源 |
| `signature` / `key_id` | 来自 `Installed` 那本账（`plugins.toml`）。⚠️ `None` 有两种意思：**内置插件**（没装过，没这笔账）和**早于这套机制**的老记录。两者在界面上都表现为"没标" |
| `removable` | ＝ `origin == "user"`。前端据此显示/隐藏「卸载」——内置插件卸不掉（`卸` 会拒）|
| `langs` / `lang` / `lang_ok` | 语言协商的三格（2026-09-25 加），来自 `LuaPlugin::语言`。见下 |

⚠️ `state` 是 `String` 不是枚举。前端 `ipc.ts` 那边写成联合类型
`"loaded" | "failed" | "disabled"`，两边的字面量必须一致——加一个状态要改两处。

### ⚠️ 语言那三格：判据只看 `langs` 与 `lang_ok`

| 格 | 含义 | 界面拿它干什么 |
|---|---|---|
| `langs` | 清单里声明的语言（空 = **不参与协商**） | 空的时候**不显示**「此插件不支持您的语言」——那是老插件，它只说自己写死的那一种 |
| `lang` | 此刻在用哪一份表（`lang/<tag>.toml` 的 tag）；`None` = 没声明 `langs` | 设置页/诊断看 |
| `lang_ok` | 协商命中了没有 | `langs` 非空且这里是 `false` ⇒ 显示那句提示 |

⚠️ **别在前端按 `lang` 再猜一遍**——"声明了 `zh-CN` 但少了那个文件"这种事只有宿主知道
（`lang_ok` **不看文件在不在**，见 `lua/api/i18n.rs`）。
⚠️ `LuaPlugin::load` / `rejected` / `disabled` 三条路**都要把 `语言` 带上**
（后两条不跑插件代码，但快照里要有值——界面上那一行的名字靠它）。

### `pub struct ReviewState(pub Mutex<HashMap<String, String>>)`

**编辑区里摊着的那一格**（2026-09-25 加）。`set(plugin, Some(panel))` 摊开、
`set(plugin, None)` 收起来、`get(plugin)` 问某个插件、`current()` 问现在摊着的是谁。

⚠️ **它不进 `PluginHost`，理由和 `DevServerState` 一样但更硬**：`nota.ui.review` 是在
**插件调用中间**跑的，那时 `plugins` 那把锁正被抱着（`commands/plugin.rs::nota_plugin_call`）
——写进 `PluginHost` 就是**自己等自己，当场死锁**。
所以它单独 `manage`（`lib.rs`），而"回到正文"那条命令（`nota_plugin_review_close`）
因此**不需要 `plugins` 锁**：插件卡着的时候用户也退得出来。

⚠️ **编辑区只有一格**：摊开新的就把表清空再插（`current()` 才不用在两张脸之间挑一个，
`HashMap` 没有顺序，挑出来的会**随机**变）。而"收起来"**只收自己那一格**——
不然插件 A 关自己的预览会把 B 的关掉。

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

⚠️⚠️ **`PluginPrompt` 有两份实现，字段名必须一样**：菜单项那一份在**`mod.rs`**
（`读提示`，因为 registry 里存的是一张原表，过不了 `Serialize`；**结构本身在本文件**）；面板按钮那一份在
**前端**（`ui/panel-nodes.ts::提示`）——面板内容走 `剥成_json`，那边只保证"是 JSON、
有上限"，**不认形状**。两条路最后都汇进 `ui/plugin-prompt.ts::问参数`，
所以字段名或默认值不一致的话，**同一个 `prompt` 写在菜单里和写在面板上会是两种表现**。


## `src-tauri/src/plugin/install.rs`（419 行）

**装 / 卸 / 停用 / 信任**四件事的实现（2026-09-25 从 `mod.rs` 拆出）。

### 为什么单独一个文件

`mod.rs` 装的是「**装着什么、怎么发现、怎么派发**」——运行时的常态；这一份装的是
「**插件从哪来、怎么没的**」——用户偶尔点一下的动作，而它比常态那半复杂得多
（解包、验签、临时目录、`rename`、回滚、记账）。两块合起来快 950 行，贴着
`docs/09` §4 那条 900 的线，所以顺着这条缝切开。

⚠️ **这些仍然是 `PluginHost` 的方法**（`impl` 写在子模块里是允许的：私有的字段与方法
对子模块可见），不是另起一个类型——装卸要改的正是宿主的那几张表，隔一个类型反而
得把它们对外开放。

⚠️ 那三条自由函数（`在用户目录里` / `把包写进` / `搬进落点`）剥在外面是为了
**能被用例钉住**：它们一个字节的宿主状态都不碰，而 `搬进落点` 那段回滚是全流程里
最容易错、又最难靠手点验出来的一段（4 条用例里有 3 条钉它）。

### 方法

| 方法 | 签名 | 行为 / 失败 |
|---|---|---|
| `装` | `pub fn 装(&mut self, 来源: &Path) -> Result<String>` | 装一个 `.nota-plugin`（或直接给目录）。返回它的 id。顺序见下 |
| `装_检查完再搬` | `fn 装_检查完再搬(...) -> Result<...>` | 把"会失败的检查"和"动磁盘"分开的那一刀 |
| `装_记账并加载` | `fn 装_记账并加载(...) -> Result<...>` | 搬完了：`installed.记来路` ＋ `set_enabled(true)`，再从最终目录读一遍清单去 `LuaPlugin::load` |
| `卸` | `pub fn 卸(&mut self, id: &str) -> Result<()>` | `unload()` → `remove_dir_all` → 从 `plugins` 里删掉 → `installed.忘掉(id)`。⚠️ **不是 `user_plugins_dir()` 底下的东西一律拒**——内置插件卸不掉，界面靠 `PluginInfo::removable` 决定给不给那颗按钮 |
| `信` | `pub fn 信(&mut self, id: &str) -> Result<()>` | 把这个插件签名者的指纹写进信任表（TOFU）。**只在装完之后**能调——装的那一刻不去猜用户信不信 |
| `信任表` | `pub fn 信任表(&self) -> Vec<信任记录>` | 给界面列"已信任的签名者"。`nota_plugin_trust_list` 用它 |

### 自由函数

| 函数 | 签名 | 说明 |
|---|---|---|
| `在用户目录里` | `pub(super) fn 在用户目录里(dir: &Path) -> bool` | `origin` / `removable` 的唯一判据，`卸` 也用它把关 |
| `把包写进` | `fn 把包写进(包: &package::包, 目标: &Path) -> Result<()>` | 把解好的包写到一个目录里（会**补出中间的目录**）。写在临时目录，失败不脏落点 |
| `搬进落点` | `fn 搬进落点(临时: &Path, 落点: &Path) -> Result<()>` | 就位那一下：旧的先 `rename` 成 `.旧-<pid>`、新的 `rename` 进来、删旧的；中途失败**把旧的挪回去**。⚠️ 这是"失败的升级不该把用户原来那个插件也弄没"那句话的**全部实现** |

### `装` 为什么是这个顺序

**先把所有会失败的检查做完，再动磁盘。** 每一步都可能失败（包坏了、签名对不上、id 撞了、
目录不可写），要是边查边写，一次失败的安装就会留下一个半拉子的插件目录——而用户看到的
只是"装失败了"，下次启动却会多出一个报错的插件。所以一律**先解到临时目录、检查全过之后
再搬过去**（搬是一次 `rename`，同一个文件系统内是原子的）。

判据的顺序：读包 → 清单（id 决定落点，也决定要不要拒）→ 通道撞名（`频道被占`）→
验签 → 写临时 → 搬进落点 → 记账 → 加载。

⚠️ **签名是"验完记账"，不是"没信任就不给装"。** 硬拒只有一条：**有签名但验不过**。
未知签名者照样装得进来，只是行上多一颗「信任」。用户与作者视角的说明在 `docs/11` §1.6，
改这里的流程要连带改那一节。

⚠️ **插件自己的设置文件**（`plugin-settings/<id>.toml`，AI 插件的 API 密钥就在那里）
**不动**：那是用户的东西，不是插件的一部分。升级完密钥照旧好使。

### 测试

4 条：`搬进落点会换掉旧的`、`搬进落点对全新安装也成立`、`搬不动的时候把旧的原样留下`、
`写包会补出中间的目录`。⚠️ **全是 `搬进落点` / `把包写进` 的**——`装` 本身要 `AppHandle`
（`LuaPlugin::load` 不出 `Err` 但要有宿主上下文），端到端那一段靠手点 + 隔离 XDG 验。

## `src-tauri/src/plugin/package.rs`（727 行）

`.nota-plugin` 这条**格式**的实现：**解包、算摘要、验签名**。⚠️ 信任库那一段 2026-09-29 拆去了
`plugin/trust.rs`（见下面单独一节）。
包本身就是一个 zip（见 `docs/11` §1.6 给作者看的那一面）。

⚠️ **它只拆不装、也从不打包签名。** 打包与签名是**作者侧**的事，在
`tools/pack-plugin.py` 里（要 `openssl`）；宿主这边一个签名的动作都没有——
**私钥从来不上这台机器**。

### 类型

| 类型 | 说明 |
|---|---|
| `包文件` | 一个成员：路径 ＋ 内容。⚠️ 路径还要过 `路径合法吗` |
| `包签名` | `nota-signature.toml` 里那一段：算法 / `key_id` / 公钥 / 签名 / `signed_at` |
| `包` | 解好的一个包：成员表 ＋ 可选的签名块 |

### 方法

| 方法 | 签名 | 行为 / 失败 |
|---|---|---|
| `从zip` | `pub fn 从zip(bytes: &[u8]) -> Result<Self>` | 解一个 zip。**上限四条**：总量 32 MiB、单文件 16 MiB、条目 2048、名字 512 字节——防 zip 炸弹 |
| `从目录` | `pub fn 从目录(root: &Path) -> Result<Self>` | 开发态的目录插件走这条（没有签名块） |
| `从文件们` | `fn 从文件们(…) -> Result<Self>` | ⚠️ **在这里把 `nota-signature.toml` 摘掉**——摘要算的是「除签名块以外」的东西，它自己不能参与（否则是自指），也因此**签名块永远不会落进安装目录** |
| `摘要` | `pub fn 摘要(&self) -> [u8; 32]` | 条目**按路径排序** → 每条拼 `路径 UTF-8 ＋ 0x00 ＋ sha256(内容)` → 整体 sha256。⚠️ **这套规则有两份独立实现**（这里是 Rust，作者侧是 Python），改一边必须两边一起改，判据见 `docs/06` §5.16 |
| `找` | `pub fn 找(&self, 路径: &str) -> Option<&[u8]>` | 按路径取一个成员 |
| `验签` | `pub fn 验签(&self, 信任库: &信任库) -> Result<Signature>` | 三种结论见下。⚠️ **`Err` 只有一种情形**：「有签名但验不过」 |
| `公钥base64` | `pub fn 公钥base64(&self) -> String` | 给「信任」那颗按钮用（装完之后原包不在手里了） |

### 自由函数

| 函数 | 签名 | 说明 |
|---|---|---|
| `读一个包` | `pub fn 读一个包(path: &Path) -> Result<包>` | `.nota-plugin` / `.zip` 走解包，目录走 `从目录` |
| `像包文件` | `pub fn 像包文件(path: &Path) -> bool` | 后缀判据（`.nota-plugin` / `.zip`） |
| `路径合法吗` | `pub fn 路径合法吗(名: &str) -> Result<String>` | 拒绝对路径、`..`、盘符那种**跳得出目标目录**的成员名。⚠️ 有用例（`包里的路径跳不出目标目录`） |
| `拼落点` | `pub fn 拼落点(目标: &Path, 路径: &str) -> PathBuf` | 成员名 → 落点路径（先过 `路径合法吗`） |
| `今天` | `pub fn 今天() -> String` | 信任表那栏 `added_at` 用。**只用 `std`**（`SystemTime` ＋ `年月日`），不引 `chrono`、不碰 `unsafe`。⚠️ **算的是 UTC 的今天**，理由与代价写在那段注释上 |
| `年月日` | `fn 年月日(天: i64) -> (i64, u32, u32)` | 「1970-01-01 起的天数」 → 公历年月日（Howard Hinnant 那套 `civil_from_days`）。⚠️ 用 `div_euclid` / `rem_euclid`，**负的天数（1970 年以前）也算得对**——那种日期我们永远不会真去算，所以只能靠用例钉 |

### 三种结论：`verified` / `unknown` / `unsigned`

| 结论 | 什么时候 | 宿主怎么处理 |
|---|---|---|
| `Verified` | 签名验得过，**而且**那把公钥的指纹在信任库里 | 照装，行上标「已验证」 |
| `Unknown` | 签名验得过，**但**指纹不在信任库里 | **照装**，行上标「未知签名者」，给一颗「信任」 |
| `Unsigned` | 包里没有签名块 | **照装**，行上标「未签名」。⚠️ **没有「信任」按钮**（没有东西可信） |

⚠️ **唯一的硬拒是「有签名但验不过」**（`Err`）。这条反复被误读成「没信任就不给装」，
两台口径都写在 `docs/11` §1.6 与 `docs/10` 那一格上。

⚠️ **包里那份 `key_id` 只是给人看的**：验签时拿公钥**重算一遍指纹再和它比**，
对不上就拒——否则改一个 `key_id` 就能冒充别人已经信任的那把钥匙。
（用例：`改_key_id_冒充信任的钥匙要拒`。）

### 测试

14 条：解包 / 摘要（顺序无关、签名块不自指）/ 三种结论各一条 / 改一个字节就拒 /
改 `key_id` 冒充要拒 / 路径跳不出目标目录 / 上限 / 信任库读写与坏文件当空表 /
日期换算与 `今天` 的形状。⚠️ **这一批之前，这个文件的用例从来没有被编译过**
（`plugin/mod.rs` 里少 `mod package;`），见 §6 上面那段。

---

## `src-tauri/src/plugin/trust.rs`（182 行）

信任的签名公钥表（TOFU）：**哪些作者是被信过的**（2026-09-29 从 `plugin/package.rs` 拆出，
那一份当时 875 行）。落盘在 `$XDG_CONFIG_HOME/nota/trusted-keys.toml`。

拆的线是「**包本身（解包、算摘要、验签）／信谁**」：前者是对**字节**做的算术，
后者是**用户的一次表态**——它有 `save()`、有日期、有给界面看的清单，跟 zip 一点
关系都没有。

⚠️ `package.rs` 里 `pub use trust::*;` 转出去，所以 `package::信任库::load()` 这类
老路径一个字没变（`plugin/install.rs` 与 `plugin/export.rs` 都按那个路径调）。

### 形状与落盘

`信任的钥匙` / `信任库` 的形状、`[keys.<指纹>]` 的落盘样子、为什么存的是**公钥**而不是
指纹本身、以及「**不得**加一档『信任任何签名』」的理由，全部写在 `docs/03` §7.6②。
本文件只记一句：`记下` 会顺手填 `added_at`（`今天()`），而**用例走的是同一份文件里拆出来的
`记下不落盘`**——`save()` 写的是**用户真的**那份信任表，用例不能碰（用例仍留在
`package.rs` 的 `mod tests` 里，2026-09-29 拆家时没跟着搬：它们测的是"验签认不认这把钥匙"，
入口是 `包::验签`）。

---

## `src-tauri/src/plugin/installed.rs`（344 行）

**安装账本**：`$XDG_CONFIG_HOME/nota/plugins.toml`。回答的问题是
「**这台机器上**哪些插件开着、当初装进来时验签验出了什么」。

⚠️ 与信任库（`plugin/trust.rs`，`trusted-keys.toml`）是**两件事**，别混：
那份回答「谁签的算数」，这份回答「我这儿装了什么、开着没有」。
两张表的形状与生命周期一并写在 `docs/03` §7.6。

### 类型

| 类型 | 说明 |
|---|---|
| `Signature` | `Verified` / `Unknown` / `Unsigned`，带 `说明()`（给界面用的那句中文） |
| `PluginRecord` | 一个插件那笔账：`enabled` ＋ `signature: Option<Signature>` ＋ `key_id: Option<String>` ＋ `public_key: Option<String>` |
| `来路` | 装的那一刻验签验出的三样，`记来路` 一次写进去 |
| `Installed` | `map: BTreeMap<id, PluginRecord>` ＋ 一个 `没记过: bool`（＝「没记过时开不开」） |

### 方法

| 方法 | 签名 | 行为 / 失败 |
|---|---|---|
| `没记过时开不开` | `pub fn 没记过时开不开() -> bool` | ⚠️ `cfg!(debug_assertions)`：**调试档 = 开，发布档 = 关**。所以**删掉这个文件 = 恢复出厂**，这是刻意的（`docs/11` §1.6） |
| `从文本` / `从文本_按当前档` | `pub fn 从文本(text: &str, 没记过: bool) -> Self` | ⚠️ 读不了就当没记过（降级到按构建档的默认值）——**坏文件不该让应用打不开** |
| `load` / `save` | `pub fn load() -> Self` / `pub fn save(&self) -> Result<()>` | 落盘。⚠️ **用例要验 `save()` 的必须换根**（`XDG_CONFIG_HOME`）：它写的是用户**真的**那份 |
| `is_enabled` / `record` / `记过没有` | … | 三个只读查询。⚠️ `record` 返回 `Option<&PluginRecord>`——**`None`（没记过）与 `signature: None`（老记录里没这一栏）是两回事**，后者**不等于** `Unsigned` |
| `取或建` | `fn 取或建(&mut self, id: &str) -> &mut PluginRecord` | 内部用。⚠️ 新建出来的记录**不带**签名结论（`signature: None`），不是「没签名」 |
| `set_enabled` | `pub fn set_enabled(&mut self, id: &str, on: bool) -> Result<()>` | 停用/启用落盘 |
| `记来路` | `pub fn 记来路(&mut self, id: &str, 来路: 来路) -> Result<()>` | 装完记账：结论 ＋ 指纹 ＋ 公钥**一起写**，不分成三次落盘 |
| `忘掉` | `pub fn 忘掉(&mut self, id: &str) -> Result<()>` | 卸掉时调。⚠️ **连「开关过」那笔账一起忘**——留着的话，下次再装同一个 id 会莫名沿用上一次的开关 |
| `公钥指纹` | `pub fn 公钥指纹(public_key: &[u8; 32]) -> String` | `sha256(公钥)` 前 8 字节的十六进制，16 字符 |

### 测试

8 条：两档默认值各一条、记过的按记的来、指纹只由公钥决定、写了能读回来（形状是给人看的）、
没签名的包来路三栏全空、忘掉是连开关一起忘。

---

## `src-tauri/src/plugin/manifest.rs`（674 行）

插件清单（`plugin.toml`）的解析与校验。文件头带着一份完整的清单样例与各栏的含义。

### `pub const NOTA_PLUGIN_API_VERSION: u32 = 2;`

宿主 API 版本，**当前是 2**。清单里的 `api` 与它**精确匹配**，不是 `>=`——
与 Folio 的 `FO_PLUGIN_API_VERSION` 同一条理由：宿主与内置插件永远同批构建，
`>=` 只会让"插件作者以为存在一个他没见过的新版本"这种事发生。号一变，内置插件同批改号，
没有迁移动作。

**什么时候该动号**（判据写在常量上方）：

| 改动 | 动号吗 |
|---|---|
| 给 Lua 侧的 `nota.*` 表**增加**成员 | **不动**（老插件照样跑） |
| **改名**某个 `nota.*` 成员，或**改变它的语义** | **动**（老插件会静默拿到别的东西） |
| 增删 `capabilities` 里的取值，并让它影响放行 | **动** |

⚠️ **1 → 2 就是第三条**（2026-09-25）：加了 `process.devserver` 与 `ui.open_url`
两个取值。它们**不影响老插件**（老插件申请不到、也不会去申请），但按上面那条判据
**还是动了号**——理由和"不用 `>=`"是同一条：**号是一个整体承诺**，
分成"有时严格有时宽松"之后，作者就得记住哪些改动会动号、哪些不会，
而记错的表现是**插件在别人的机器上静默换了行为**。**当时那两个**内置插件同批改成 2（⚠️ `slidev` 2026-09-25 才拆出来，它生下来就是 2；`stats`（加进来时叫 `heartbeat`，2026-09-26），同批就是 2）。

### `pub enum Capability`

```rust
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum Capability {
    #[serde(rename = "document.read")]    DocumentRead,
    #[serde(rename = "document.write")]   DocumentWrite,
    #[serde(rename = "fs.read")]          FsRead,
    #[serde(rename = "fs.write")]         FsWrite,
    #[serde(rename = "process.git")]      ProcessGit,
    #[serde(rename = "process.devserver")] ProcessDevServer,
    #[serde(rename = "network.http")]     NetworkHttp,
    #[serde(rename = "ui.notify")]        UiNotify,
    #[serde(rename = "ui.open_url")]      UiOpenUrl,
    #[serde(rename = "ui.panel")]         UiPanel,
    #[serde(rename = "ui.menu")]          UiMenu,
    #[serde(rename = "settings.own")]     SettingsOwn,
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
| `ProcessDevServer` | `process.devserver` | 起清单 `[devserver]` 段里**声明的那一条**开发服务器命令，并把它嵌进面板。⚠️ **与 `process.git` 同一条判据**：放行的是"那一条命令"，不是"任意命令"。没有 `[devserver]` 段就什么都起不来（`nota.devserver` 整张表是 `nil`） |
| `NetworkHttp` | `network.http` | 发 HTTP 请求。装了才给 `nota.http`（`request` / `get` / `post` / **`stream`**），实现见 `lua/api/http.rs`（[docs/13](13-lua-api.md) §9、流式在 §9.1） |
| `UiNotify` | `ui.notify` | 弹通知 |
| `UiOpenUrl` | `ui.open_url` | 把用户的**系统浏览器**打开到某个 `https://` 地址。⚠️ **只认 `https`**：这是唯一一个"插件能让用户跳出 Nota"的口子，放开 `http`/`file`/自定义 scheme 就等于给了一条把用户送去别处的路。插件要说的话仍旧该在 `nota.ui.notify` 里说，这条只用于"去官网看文档" |
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
    #[serde(default)] pub langs: Vec<String>,
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
| `langs` | 否 | `[]`（2026-09-25 加）。**不写 = 不参与语言协商**——那个插件只说自己写死的那一种语言，界面不给它显示「此插件不支持您的语言」。⚠️ **写了就必须含 `en`**，否则整份清单**拒载** |

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
    pub devserver: Option<DevServerSpec>,
}
```

| 字段 | 含义 |
|---|---|
| `meta` | 原样的 `[plugin]` 段 |
| `dir` | 插件根目录（`plugin.toml` 所在处） |
| `capabilities` | **解析并去重后**的能力枚举（清单里的原始字符串仍在 `meta.capabilities` 里） |
| `devserver` | `[devserver]` 段（2026-09-25 加）。`None` = 这个插件不起开发服务器 |

| 方法 | 签名 | 行为 / 失败 |
|---|---|---|
| `entry_path` | `pub fn entry_path(&self) -> PathBuf` | `self.dir.join(&self.meta.entry)`。不做存在性检查（`run_entry` 里查） |
| `load` | `pub fn load(path: &Path) -> Result<Self>` | 读文件（失败 → `Read{path, source}`）→ `toml::from_str`（失败 → `Manifest{file, reason}`）→ 取父目录（没有 → `Manifest{file, reason: "plugin.toml 没有父目录"}`）→ `from_meta` |
| `from_meta`（私有） | `fn from_meta(meta, devserver, dir, file) -> Result<Self>` | **六步**校验，见下 |
| `has` | `pub fn has(&self, cap: Capability) -> bool` | `self.capabilities.contains(&cap)` |

`from_meta` 的六步（顺序就是代码里的顺序）：

| # | 规则 | 违反时 |
|---|---|---|
| 1 | `id` 不能为空 | `Manifest{reason: "id 不能为空"}` |
| 2 | `id` 只能用小写字母、数字、`.`、`-`、`_` | `Manifest{reason: "id `{}` 只能用小写字母、数字、`.`、`-`、`_`"}`。注意**不接受大写**，也不接受非 ASCII |
| 3 | `api` 必须等于 `NOTA_PLUGIN_API_VERSION` | `PluginApiMismatch{id, wanted, have}` |
| 4 | `entry` 不许含 `..`、不许是绝对路径 | `Manifest{reason: "entry `{}` 必须是插件目录内的相对路径"}`。清单是插件自带的，`entry = "../../../etc/passwd"` 这种必须挡在门口 |
| 5 | `capabilities` 逐条解析**并去重** | 不认识的那条 → `Manifest{reason}`（错误文本来自 `Capability::parse`） |
| 6 | `langs` 非空时**必须含 `en`** | `Manifest{reason: "`langs` 里没有 `en`（现在写的是 {:?}）——英语是必须有的兜底…"}` |

⚠️ 第 4 条用的是 `contains("..")` 而不是路径分段判断，所以一个**文件名里**含 `..` 的
合法脚本（`a..b.lua`）会被误拒。这是"宁可严一点"的取舍，不是漏洞。

⚠️ 第 6 条**报错而不是"补一个 `en` 上去"**：补的话，作者永远不知道自己漏了兜底语言，
而用户会在某个语言下看到一片 `nil`（`nota.i18n.text` 取不到就是 `nil`）。契约坏掉要当场说。
⚠️ 但**声明了某个语言而 `lang/<那个语言>.toml` 不在，不报错、也不改 `ok`**——
那份表空着，`text("…") or "…"` 就退回作者写下的原文。界面上那句
「此插件不支持您的语言」**只由清单里有没有这门语言决定**（用户原话就是"在列表内则直接使用"）。
要收走的是**契约层面**的谎（声明里没有 `en`），不是还没写完的活。

### `[devserver]` 段与 `check_devserver`

`DevServerSpec` 的七个字段（`cmd` / `cmd_env` / `args` / `entry` / `probe_args` /
`probe_env` / `project_marker`）逐条含义见 `docs/11` §2。这里只说校验：

⚠️ **两条校验都是"越界"，不是"写错了"**：

| 情形 | 为什么是越界 |
|---|---|
| `entry` 带路径成分 | 宿主会把它拼进"文档同目录"，`../` 或绝对路径就是**让插件往任意位置写文件**。⚠️ 判据是「**有没有路径成分**」而不是「有没有 `..` 子串」：`/etc/passwd`、`a/b.md`、`a\b.md` 三种都要挡，而 `..x.md` 这种正经文件名**不该被误伤**——比 `meta.entry` 那条更准（那条是 `contains("..")`） |
| 申请了 `process.devserver` 却没有 `[devserver]` 段 | **能力空转**。加载时报出来，别等用户点了按钮才发现什么都起不来 |
| 写了 `[devserver]` 却没申请 `process.devserver` | **反向空转**。那份声明永远不会被读，留着只会让下一个读清单的人以为它生效 |

⚠️ `cmd` 不能为空（`"[devserver] cmd 不能为空"`）也是在这一步挡的。
`DevServerSpec` 自己有三个方法：`command()`（调试旋钮 `cmd_env` 优先）、
`entry_name(doc)`（把 `{doc}` 换成 id，**收 `u64` 而不是 `DocId`**——清单这一层
不该认识"文档"是什么）、`probe_args()`（默认 `["--version"]`）。

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
但混放时会让人困惑——一个目录要么是插件本身，要么是插件集合，不能两样都是。

### 测试（5）

| 测试名 | 钉住什么 |
|---|---|
| `好清单能解析出能力` | `api = 1` 的清单解析成功；`entry` 缺省时是 `"main.lua"`；`has(ProcessGit)` 为真、`has(NetworkHttp)` 为假 |
| `通道名里的点要换成连字符` | `nota.git` → `nota-git`、`nota.ai` → `nota-ai`；`_` 要**保留**（`a_b-c` 不变）；并对 `nota.git` / `a.b.c` / `x/y` / `带中文的` 逐个断言归一化结果只含合法字符 |
| `api_版本不符要拒载` | `api = 99` 得到 `PluginApiMismatch { wanted: 99, have: 1 }` |
| `entry_不许逃出插件目录` | `entry = "../../evil.lua"` 加载失败 |
| `不认识的能力要报错而不是静默忽略` | `capabilities = ["fs.everything"]` 报错，且错误消息里含 `fs.everything` |

---

## `src-tauri/src/lua/mod.rs`（557 行）

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
（含一条 `mlua_的_default_safe_含_io_和_os`，专门记录这个事实）。

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
    pub 应用语言: String,
}
```

| 字段 | 说明 |
|---|---|
| `app` | 发事件给前端的把手 |
| `documents` / `settings` / `workspace` | 与 `AppState` 里**同一批 `Arc`** |
| `plugin_id` | 这个插件的 id，出错信息里带上，好定位是谁炸的。⚠️ `lib.rs` 建 `base` 时是**空串**，`PluginHost::discover` 里每个插件换成自己的 |
| `应用语言` | 宿主此刻在说哪种语言（2026-09-25 加）。⚠️ 它是**启动时算一次、之后不再变**的一个值，不是"设置里那一格的镜像"——用户在设置里改了语言要重启才生效，而插件在启动时就按这个值读好了自己的文案表。所以**别在运行中去改它**，那会造出"外壳说中文、插件说英文"的中间态 |

`Clone` 是必需的（每个闭包要 `ctx.clone()` 或 `..base.clone()`）。
⚠️ 文件头再次写了锁序不变量：拿锁顺序只能是 `plugins → documents → settings`。

⚠️ **`HostContext` 要真的 `AppHandle`，构造不出来**——所以**安全边界不能写在它里面**
（写进去就没法单元测试）。`fs.rs` 的 `resolve_in()` 与 `git.rs` 的 `挑工作目录()` 都是
为了这个才被剥成纯函数的。

### `pub struct LuaPlugin`

```rust
pub struct LuaPlugin {
    pub manifest: Manifest,
    pub lua: Lua,
    pub state: PluginState,
    pub 语言: crate::lua::api::i18n::语言包,
    has_unload: bool,
}
```

| 字段 | 说明 |
|---|---|
| `manifest` | 清单 |
| `lua` | 这个插件独占的 Lua 状态。`commands/plugin.rs` 直接访问它做 JSON↔Lua 转换 |
| `state` | 见下 |
| `语言` | 这个插件这次在用的文案表（协商结果 ＋ 表本身，2026-09-25 加）。⚠️ **加载时就定下来**，停用/重新启用会**重算一遍**——结果和上次一样（应用语言没变），但"重启用 = 重跑 `on_load`"这条口径要求它跟着重来 |
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
| `Disabled` | ✅ **2026-09-25 起真的会被构造**：停用＝真卸载，宿主把插件换成 `LuaPlugin::disabled(清单)`（**没有 Lua 状态**），`list_info` 就报 `Disabled`；启动时读到 `plugins.toml` 里标着停用的那些也走这条。⚠️ 所以停用再启用会**重跑一遍 `on_load`**，插件必须写成幂等的（`docs/11` §1.6.7）|

### `LuaPlugin::load`

```rust
pub fn load(manifest: Manifest, ctx: HostContext) -> Self
```

建 Lua 状态、按能力装 `nota.*`、跑入口脚本。流程：

0. `i18n::装(&manifest, &ctx.应用语言)` —— **在建沙箱之前**就定下文案表（2026-09-25 加）。
   它只读插件自己目录里的文件，跟脚本跑不跑得起来无关。⚠️ **`state = Failed` 的插件
   也带着这份表**——界面上那一行的名字要靠它（`PluginInfo.name` 会被表里的保留键
   `name` 盖掉）
1. `硬化的_lua()` —— ⚠️ **不要写回 `Lua::new()`**（BUG-10）。它建 `new_with(插件标准库())`
   并把列表之外的全局抹成 `nil`（`base` 库那几个关不掉的靠这一步）。失败 → 死状态 +
   `Failed("{e}（沙箱建不起来，插件未加载）")`
2. `Self::install(&lua, &manifest, &ctx, &语言)` —— 失败 → `{ state: Failed(e.to_string()), has_unload: false }`
3. `Self::run_entry(&lua, &manifest.entry_path())` —— 失败 → 同上
4. 成功 → `{ state: Loaded, has_unload }`

**失败不返回 `Err`**，而是返回一个 `state = Failed` 的实例——一个插件坏掉不该让整个
启动流程挂掉，界面上照常列出它并标红。

⚠️ 上面那几处 `Failed` 分支里**每一处都要把 `语言` 带上**——它是 `LuaPlugin` 的字段，
漏了就编译不过（这是故意的：`PluginInfo.name` 靠它）。

### `LuaPlugin::rejected`

```rust
pub fn rejected(manifest: Manifest, reason: String) -> Self
```

一个**根本没打算加载**的插件：清单读得懂，但它与已经在场的某个插件抢同一个事件通道
（见 `PluginHost::discover` 的撞名一节）。与 `load` 失败的区别只在"连 Lua 状态都不用建"
——对界面来说两者一样，都是一行标红的插件加一句原因。所以这里也走 `Failed`，不另造状态。

### `fn install(lua, manifest, ctx, 语言) -> Result<()>`（私有）

`api::build(lua, manifest, ctx, 语言)?` 造出 `nota` 表，然后 `lua.globals().set("nota", nota)`。
失败包成 `NotaError::Lua { plugin: manifest.meta.id.clone(), message }`。

⚠️ 第四个参数 `语言` 是 2026-09-25 加的：`nota.i18n` 这张表要在装 `nota` 的时候就带上
**协商好的**文案表。⚠️ 它**不从 `ctx` 里拿**——`ctx` 里那个 `应用语言` 是"宿主在说哪种语言"，
而 `语言包` 是"这个插件这次用哪份表"，中间隔着一层协商（见 `lua/api/i18n.rs`）。

⚠️ `rejected` 与 `disabled` 的签名也各多了一个 `应用语言: &str`（同样是 2026-09-25）：
这两条路**不跑任何插件代码**，但 `LuaPlugin` 那个 `语言` 字段还是要有值
（界面上那一行的名字靠它），所以协商在调用点自己做一遍。
⚠️ 它们建的是一个**死状态** `Lua`（`硬化的_lua().unwrap_or_else(|_| Lua::new())`）——
`state` 是 `Failed`/`Disabled`，宿主不会往里跑任何插件代码，所以兜底路径无妨。

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
  （纯声明式插件），但写错时不会有任何提示。

### `LuaPlugin::unload`

```rust
pub fn unload(&self)
```

卸载前调 `on_unload`（有才调），然后本对象被丢弃、Lua 状态一起没。
`has_unload` 为假直接返回；从 registry 取 `nota_module` 取不到或不是表也直接返回。

⚠️ **卸载时的报错只记不抛**：`日志!("[nota] 插件 {} 的 on_unload 出错：{e}", id)`（`log.rs`，默认不打；`NOTA_DEBUG=1` 才出）——
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

**本文件里一条都没有**，两组用例都在同级的文件里（都是 `mod X;` 挂上来的）：

| 文件 | 条数 | 测什么 |
|---|---|---|
| `lua/tests.rs` | 7 | 沙箱（BUG-10 的回归）· 内置插件能不能被编译（每个插件目录下每一份 `.lua`）· 多文件插件的 `require` 链真的跑得通 · 能力白名单 |
| `lua/require_tests.rs` | 8 | 插件多文件（`require`，2026-09-27 搬出） |

⚠️ 搬出去的理由两次都是行数（`mod.rs` 先后撞过 1000 与 800 那两条线），
内容一个字没改——两处文件头都写着这句话。

---

## `src-tauri/src/lua/api/mod.rs`（445 行）

注入给插件的 `nota.*` 表。

### 文件头的"为什么"要点

**一条硬规矩：按能力装表，不装空壳。** 插件没申请 `document.read`，`nota.document`
就是 `nil`。**不能**给它装一张调用时才报"没权限"的表——那既让插件作者在开发期发现不了
问题（写完才炸），也让"权限"停留在运行时的一句提示，而不是一道结构上的墙。

唯一的例外是本文件里那几个**永远可用**的东西（`log` / `command` / `event` / `diff` /
`i18n` / `version` / `plugin_id`）：它们不碰文档也不碰磁盘，是插件跟自己、跟宿主说话用的，
或者（`diff` / `i18n`）是**纯的**——前者一段文本进一段文本出，后者只读插件自己目录里的
`lang/<tag>.toml`（理由见 `lua/api/i18n.rs` 顶上那段）。

### `pub fn lua_err(e: NotaError) -> mlua::Error`

```rust
pub fn lua_err(e: NotaError) -> mlua::Error
```

把 `NotaError` 转成 Lua 错误（`mlua::Error::RuntimeError(e.to_string())`）。
统一从这一处走，报错信息里一定带得出人话。`document.rs` / `fs.rs` / `git.rs` 的闭包里
凡是"要返回 `mlua::Result` 但拿到的是 `NotaError`"的地方都过它。

### `pub fn build(lua, manifest, ctx, 语言: &i18n::语言包) -> Result<Table, NotaError>`

组装整张 `nota` 表。⚠️ 第四个参数是 2026-09-25 加的（`nota.i18n` 要带协商好的文案表）。
装了什么、按什么条件装：

| `nota.` 下的名字 | 装的条件 | 内容 |
|---|---|---|
| `version` | **永远** | `env!("CARGO_PKG_VERSION")`，即宿主的版本（今天 `0.1.0`） |
| `api_version` | **永远** | `NOTA_PLUGIN_API_VERSION`，即 `2` |
| `plugin_id` | **永远** | `manifest.meta.id` 原样（带点的那种） |
| `log` | **永远** | `{ info, warn, error }` 三个函数，各自 `日志!` 到宿主 stderr。⚠️ **整族默认不输出**（2026-09-25，同一道调试闸门）：插件别拿它当用户提示，要说话走 `nota.ui.notify` |
| `command` | **永远** | `{ register(name, f) }` |
| `event` | **永远** | `{ emit(name, payload) }` |
| `i18n` | **永远**（2026-09-25 加） | `{ app_lang, lang, ok, text(key) }`。⚠️ **不要能力**——路径由宿主用插件自己的目录拼，插件只交键。见 `i18n.rs` |
| `document` | `document.read` **或** `document.write` | 见 `document.rs` |
| `fs` | `fs.read` **或** `fs.write` | 见 `fs.rs` |
| `git` | `process.git` | 见 `git.rs` |
| `devserver` | `process.devserver` **且**清单里有 `[devserver]` 段 | 见 `devserver.rs`。⚠️ 两个条件缺一个都装不出来——那段能力放行的就是段里那条命令 |
| `ui` | `ui.notify` **或** `ui.panel` **或** `ui.menu` **或** `ui.open_url` | 见 `ui.rs` |
| `http` | `network.http` | 见 `http.rs`（`get`/`post`/`request`） |
| `settings` | `settings.own` | 见 `settings.rs`（`get`/`set`/`all`） |

⚠️ `nota.diff` 那一格里**两个函数**来自两个文件：`parse` 在 `diff.rs`、
`parse_unified` 在 `unified_diff.rs`（2026-09-25 加）。它们**共用输出的形状**、
**不共用解析器**——输入格式根本不同（一个是插件与模型约定的围栏，一个是 `git diff`
的标准输出）。

📌 **更正（2026-09-22）**：本行曾写"`ui.menu` 单独存在不会装 `nota.ui`"——那在
当时是**真的**（判据漏了 `ui.menu`，见 `docs/07` BUG-8），但**已修**。现在三条能力
**任一条**都能装出 `nota.ui`。修法不是补一个 `||`，而是让两层判据**同源**：

```rust
const UI能力: [Capability; 4] = [
    Capability::UiNotify,
    Capability::UiPanel,
    Capability::UiMenu,
    Capability::UiOpenUrl,   // 2026-09-25 加：第四个 ui.*
];
fn 装_ui吗(manifest: &Manifest) -> bool { UI能力.iter().any(|c| manifest.has(*c)) }
```

⚠️ 这个坑的形态：**两层判据相乘**——表**内**每个方法判一次"装不装这个函数"，
表**外**判一次"装不装表本身"。每一层单独看都对，任一层漏一项那条能力就是死的。
有用例钉着（含一条数 `ui.rs` 里判据个数的，见 `docs/06` §6.1）。
📌 **数组是"数出来的"，不是"想出来的"**：`api_version` 从 1 涨到 2 那一轮加了
`ui.open_url`，`ui.rs` 里于是有**四处** `manifest.has(Capability::Ui…)`，
数组就必须是 4——那条用例（`ui_能力清单要和_ui_rs_对得上`）会先炸。

⚠️ `nota.command` 与 `nota.event` 与能力无关——**一个零能力的插件也能注册命令、
发事件**。这是刻意的（它们是插件跟宿主说话的基本手段，不碰敏感资源），
但"没有能力"不等于"插件什么都不能做"。

📌 **更正（2026-09-24）**：`nota.http` 与 `nota.settings` 这两张表**曾经是空壳**——
装的是 `not_implemented(...)`，调用一律返回一句"尚未实现（见 docs/07 第 N 项）"。
那种如实报错当时有用（总比 `attempt to index a nil value` 强，后者会让人以为是自己
能力没申请对，去排查很久），但空壳解决不了能力缺口：AI 插件因此只能预览、**存不住密钥**。
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
传个表或字符串会得到 Lua 自己的类型错误，而不是宿主给出的消息。

### `fn event_table(lua: &Lua, ctx: &HostContext) -> Result<Table, NotaError>`（私有）

`nota.event` —— **插件 → 前端**这一个方向（`emit`）。

**本轮只做这一个方向。** 前端 → 插件那一侧由命令承担（`nota.command.register`
就是那条路）——两条路各管一头，互不重叠。

- 事件名统一加 `plugin:` 前缀：`format!("plugin:{plugin_id}:{name}")`，
  前端一眼看得出是从插件来的，也不会跟宿主自己的事件名撞
- `plugin_id` 那一节**过 `channel_id()`**（归一化掉点号），`name` 那一节**原样保留**
- 载荷过 `lua_to_json()`，`app.emit(&channel, json)`；失败 →
  `RuntimeError("发事件 {channel} 失败：{e}")`
- ⚠️ 没有监听者时 `emit` **静默成功**——插件发了一条没人收的事件，日志里一点痕迹都没有

### `fn 装_ui吗(manifest: &Manifest) -> bool`（私有）

`ui.notify` / `ui.panel` / `ui.menu` / `ui.open_url` **任一条**就算数（`const UI能力`）。
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
   未定义区间（Lua 的边界行为），不应依赖它。

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

## `src-tauri/src/lua/api/document.rs`（394 行）

`nota.document` —— 读写当前文档。

### 文件头的"为什么"要点

- 读的方法要 `document.read`，写的要 `document.write`；两者各自装表，
  只申请了读的插件拿到的 `nota.document` 上**没有** `set_text` 这一格。
- **写完之后发生了什么**：`set_text` / `append_text` 改的是后端镜像，
  **前端编辑器不会自己知道**。所以每次写完都往 `nota:document-changed` 发一条事件，
  前端收到就把编辑器内容换掉、光标落到合理位置。
- ⚠️ 写操作**默认是整篇替换**语义（`set_text` / `append_text` 收的是全文）。
  📌 **2026-10-04（第 14 项）多了一条"改一处"的路**：`insert_at_cursor`——
  但它是**意图**、不是整篇替换（见下）。
- ⚠️ **这里故意不给偏移量**（没有 `get_offset` / `insert_at(pos, text)` 这类东西）。
  量测证明 Markdown 字符偏移在块边界上**不存在**：在列表项开头插字会多出 `- `、
  在段落之间插字会多出空行，拿偏移做字符串拼接**必然**与编辑器的真实结果对不上。
  量测表与结论在 `docs/05` §5.2b、`src/editor/caret-snapshot.ts` 文件头。

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
| `get_selection` | `() -> table \| nil` | **用户现在选中的那段字**（2026-10-04 加，第 14 项）：`{text, empty}`。⚠️ **返回 `nil` 有三种意思**（统一都是"我不知道"）：没有活动文档 / 编辑器从没报过 / 文档刚开还没落定。⚠️ **`text` 是空串不等于没选中**——选中一个原子（图片、公式）时 `text` 是空的而 `empty` 为假，所以**要用 `empty` 判**，别用 `text == ""`。⚠️ 读到的是**去抖 250ms 的那一份**（`ui/EditorPane.tsx::CURSOR_DEBOUNCE_MS`） |
| `stats` | `() -> table` | 一份"现在多大、多久了"的快照（2026-09-26 加，给「写作统计」）：`chars`（**码点数**）／`words`（**字/词数**，2026-09-27 加）／`lines`／`revision`／`path`／`clock_ms`。⚠️ `clock_ms` 是**单调钟**（自启动起算的毫秒，`OnceLock` 里唯一一份起点）、**不是墙钟**——沙箱里没有 `os`，这是插件唯一拿得到的时间。⚠️ `words` 的规则（中文一字算 1 ＋ 连续英文/数字算 1 个词）在 `fn 词数` 的文档注释里；两者为什么并存见 `docs/13` §5.1a |

⚠️ 前五个方法读的都是**后端的"活动文档"**，而前端切标签时**不通知后端**
（见 `docs/01-architecture.md` 的前端遗留项）。所以插件拿到的很可能不是用户正在看的那份。

⚠️ `get_text` 读到的是**300ms 去抖的镜像**，可能比编辑器里少最后几次击键。
插件要做"基于当前内容"的判断时得知道这一点（`docs/03` 的"真相在哪"）。

**`can_write`（`document.write`）时：**

| 方法 | 签名 | 行为 |
|---|---|---|
| `set_text` | `(text: string) -> ()` | 整篇替换活动文档的文本 |
| `append_text` | `(tail: string) -> ()` | 读当前镜像，`push_str(&tail)`，再整篇写回 |
| `insert_at_cursor` | `(text: string) -> boolean` | **在用户的光标处插一段**（替换选区；2026-10-04 加，第 14 项）。⚠️ **与上面两条不是一回事**：上面两条改的是**宿主镜像**、之后发 `nota:document-changed` 让前端整篇换掉；这一条**宿主一个字节都不改**，它只发一条 `nota:document-edit`**请编辑器自己落一笔真事务**——撤销栈、光标、滚动位置、表格列宽全跟着走。⚠️ **返回值只代表"意图派出去了"**：没有活动文档、或 `text` 是空串时返回 `false`（⚠️ **空串不派**——派一笔空事务进用户的撤销栈，他按 Ctrl+Z 会觉得"什么都没撤掉"）。⚠️ **这条事件允许被丢掉**：编辑器没挂、用户已经切走那份文档，就作废（`docs/03` §9.2） |

`set_text` / `append_text` 的实现是同三步：

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
**前端不必区分**是插件改的还是别处改的——两种情况都表示"后端这份与前端不一致，需要重新取"。

⚠️ 两个细节：
- **返回值的 `Err` 被 `let _ =` 丢掉了**。发不出去（理论上只有事件名非法才会）时静默失败，
  插件的 `set_text` 依然返回成功。前端表现为"这一改没出现在编辑器里"。
  （`ui.rs` 里同样的事是 `map_err(...)?` 抛出去的，两处口径不一致。）
- `origin` 固定是 `"plugin"`，**宿主自己发这条事件的路径今天还没有**
  （见 `docs/01-architecture.md`）。

### `fn emit_edit(app: &tauri::AppHandle, id: crate::document::DocId, text: &str)`（私有）

```rust
fn emit_edit(app: &tauri::AppHandle, id: crate::document::DocId, text: &str) {
    use tauri::Emitter;
    let _ = app.emit(
        crate::document::EVENT_EDIT,          // "nota:document-edit"
        serde_json::json!({ "id": id.0, "op": "insert-at-cursor", "text": text }),
    );
}
```

⚠️ **它与上面的 `emit_changed` 是两个方向的东西，别合并**：

| | `nota:document-changed` | `nota:document-edit` |
|---|---|---|
| 它是什么 | 一个**状态**——「正文**已经**换了」 | 一条**意图**——「**请你**替我改」 |
| 谁改的正文 | **宿主**（镜像已经改了） | **编辑器**（宿主改不动） |
| 前端收到做什么 | 整篇 `setMarkdown(text)` | 落**一笔真事务**（`插入在光标处`） |
| 丢掉的下场 | ⚠️ **永久分叉**——两边的正文从此不一样 | ⚠️ **没事**——用户那一秒正好切走了，这次插入作废而已 |

⚠️ `op` 这个字段是**给将来的**：今天只有 `insert-at-cursor` 一种，前端
**不认识的 `op` 必须一律丢掉**，绝不能拿 `text` 当插入用（`ui/useAppEvents.ts` 里那一行）。

### 测试

无（本文件的 6 条用例全是纯函数 `词数` 的，API 层要真 `AppHandle`，单测里建不出来——
同 `lua/api/ui.rs` 那条口径）。

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

## `src-tauri/src/lua/api/git.rs`（321 行）

`nota.git` —— 给插件用的 git 能力。

### 文件头的"为什么"要点

**为什么是子进程而不是 libgit2**（与 Folio 的 `fo-git-run.c` 同一个判断）：

- **尊重用户的环境**。凭据助手、`~/.gitconfig`、`includeIf`、hook、`core.autocrlf`、
  签名密钥——libgit2 对这些要么不支持要么各有一套，用户配好的东西会**静默失效**。
- **不用背链接的包袱**。libgit2 是 C 库，交叉编译、静态链接、发行版版本差异全是持续成本，
  而 Nota 并不需要"不用装 git 也能用"。
- **行为与用户敲命令行一致**。出问题时用户能在终端里原样复现，这是三者里最重的一条。

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
`挑工作目录`）。跟着改的时候不应改成英文。

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
的能力表，`process.git` 不能扩成 `process.any`。

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

## `src-tauri/src/lua/api/ui.rs`（594 行）

`nota.ui` —— 插件往外壳里放东西。

### 文件头的"为什么"要点

插件能放四样：**通知**、**面板**、**菜单项**、**一个网址**。它们分**两类**，
⚠️ **这是本节最要紧的一条**：

| | 是什么 | 怎么走 |
|---|---|---|
| 通知 | 一件**此刻发生**的事 | **推**：`app.emit("nota:notify")` |
| 面板 / 菜单项 | 一份**启动时声明、之后一直成立**的状态 | **拉**：写进 registry，宿主按需读 |
| 打开网址 | 用户点了一下 | 直接交给系统浏览器（不经界面，所以没有"推/拉"这回事） |
| ⚠️⚠️ **一段正在生成的字**（`stream`，2026-10-04 加） | **临时**，看一眼就扔 | **推**（`nota:plugin-stream`）——**唯一一条推内容的**口子，理由见下 |

⚠️⚠️ **为什么面板和菜单不能推（BUG-13）**：`register_panel` / `register_menu` 是在
**插件加载时**跑的（`setup()` 阶段），前端那时还没挂载、`listen()` 还没注册。
推出去**没人收，而且不报错**——Tauri 对没有监听者的频道 emit 是**静默成功**的。
症状是"界面看着好好的，只是永远空着"。
修法**不是**"发两遍"或"起来后重放"，而是**根本不要发**。
完整理由（含"重放方案为什么是错的"）见 `plugin/mod.rs::panels` 与 `docs/07` BUG-13。

⚠️⚠️ **`stream` 为什么破例（`docs/07` 第 58 项）**：它不是"状态"，是**正在生成的那段字**——
用户要看着它一行一行往外冒。走**拉**那条路在物理上不通：这条命令跑着的时候宿主
**一直握着 `plugins` 锁**（`commands/plugin.rs::nota_plugin_call` 从进函数锁到出函数），
而 `nota_plugin_panel_content` 要的是**同一把锁**——所以这中间前端喊"重拉"**根本回不来**。
⚠️ 于是只能反过来推。它是**唯一**破例的，而且**只许送临时显示数据**（宿主只留最后 8000 字），
真内容仍然走 `render`。完整推演在 `lua/api/ui.rs::实时表` 顶上与 [docs/13](13-lua-api.md) §8.6。

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

⚠️ 七个方法**各自按自己的能力单独装**，互不牵连：

| 方法 | 装的条件 | 签名 | 去向 |
|---|---|---|---|
| `notify` | `ui.notify` | `(msg: string, level: string?) -> ()` | 事件 `nota:notify`（**推**） |
| `register_panel` | `ui.panel` | `(spec: table) -> ()` | registry `nota_panels`（**拉**） |
| `refresh` | `ui.panel` | `(id: string?) -> ()` | 事件 `nota:plugin-panel`（**推**，只是"去重拉"的提示） |
| `stream` | `ui.panel` | `(text: string) -> ()` | 事件 `nota:plugin-stream`（**推**，⚠️ **带着内容**——见上面那段破例说明） |
| `review` | `ui.panel` | `(id: string?) -> ()` | 写 `ReviewState` ＋ 事件 `nota:plugin-review`（**推**，见下） |
| `register_menu` | `ui.menu` | `(spec: table) -> ()` | registry `nota_menus`（**拉**） |
| `open_url` | `ui.open_url` | `(url: string) -> ()` | 系统浏览器（**不经界面**） |

⚠️ `refresh` / `review` / `stream` 与 `register_panel` **同一条能力**（`ui.panel`）管着——
它们是"面板这件事"的四个头（声明 / 内容变了 / 摊到编辑区 / 正在生成的字），
拆成四条能力只会让人申请一条忘了另一条。不传 `id` 表示"我这个插件的所有面板都该重拉（/ 收起来）"。
⚠️ `stream` **不收 `id`**：那段临时的字只画在**当前打开的那一页**上（`PluginDock` 里那个
`实时表` 是按插件 id 存的，没开着的页也不会因此重画）。

**`review(id)`**（2026-09-25 加）是「把**已经在册的这个面板**摊到编辑区里」——
`id` 给 `nil` 就是收起来。⚠️ **它不注册新东西**：不在册的 `id` **当场报错**
（`"插件 {plugin_id} 没有声明面板 `{panel}`，摊不到编辑区"`）。这样"摊出来的那块"
和前端的插件栏读的是**同一份 registry**，不会出现"栏里有、编辑区里是另一套"。

⚠️⚠️ **状态写在前、事件发在后**，顺序不能反：前端收到事件时会去拉当前那一格，
先发后写会让它拉到旧的——那正是 BUG-13 的形状（"界面看着好好的，只是内容晚一拍"）。

**`open_url(url)`**（2026-09-25 加）把页面**交给系统默认浏览器**。
⚠️ **只放行 `https`**，边界是**协议**不是域名：`open_url` 的风险不在"用户看到什么"，
而在"用户点开之后那个程序会去干什么"——`file://` 能开本机任意路径、
`mailto:`/自注册 scheme 能拉起别的程序、`javascript:` 之类在某些处理程序里直接执行。
只放 `https` 就一次把这些全关掉。**连 `http` 都不放**：这个能力是给"跳去某个正经页面"用的
（文档站、编辑器主页），而那些今天都是 `https`。
⚠️ **本机开发服务器的地址（`http://localhost:…`）故意不放行**：那种地址该走面板里的
`frame` 块（宿主自己填、看得见、关得掉），而不是把用户踢到浏览器里去。
真要给，那是另一条能力、另一个决定（已记进 `docs/07` 待决清单）。

两个 `register_*` 各自剥成了**不含 `ctx` 的纯函数**（`面板表` / `菜单表`），
理由与 `api/mod.rs::装_ui吗` 同一条：`build()` 要真的 `AppHandle`，用例里构造不出来，
而"**注册进去的东西读得回来吗**"正是 BUG-13 的病灶。剥出来之后用例能拿
`Lua::new()` 把**写的一侧和读的一侧一起**走一遍（见下面的测试表）。

`nota.ui` 这一**整张表**由 `api/mod.rs` 按 `装_ui吗()` 决定装不装——即
**`ui.notify` / `ui.panel` / `ui.menu` / `ui.open_url` 任一条**（`const UI能力` 数组），
而表内每个方法**再各自判一次**——所以申请了 `ui.panel` 但没申请 `ui.menu` 的插件
拿到的 `nota.ui` 上有 `register_panel` 而没有 `register_menu`。**两层判定都要看。**
⚠️ 这个数组是 2026-09-25 从 3 涨到 4 的（加 `ui.open_url`）；`api/mod.rs` 里有一条
**数 `ui.rs` 里 `manifest.has(Capability::Ui…)` 个数**的用例钉着两处一致。

**`notify`** 的载荷 `{plugin, message, level}`，`level` 过 `normalise_level()`。
⚠️ `plugin` 字段用的是**原始 id**（`nota.git`），不是通道名——与 `nota.event.emit`
的通道名不同，两者不可混同。

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
⚠️ 另外两条事件名**不是**硬编码的：`nota:plugin-panel` 是
`plugin/mod.rs::EVENT_PANEL_DIRTY`、`nota:plugin-review` 是 `plugin/mod.rs::EVENT_REVIEW`
——发射侧（本文件）和收侧（`ipc.ts` 的 `events.pluginPanel` / `events.pluginReview`
**加 `ui/PluginDock.tsx` / `ui/ReviewPane.tsx` 的订阅**）都引它。
**三处说同一个字符串**，所以只定义一次。

### registry 与事件名只定义一处

`REG_PANELS` / `REG_MENUS` / `EVENT_PANEL_DIRTY` / `EVENT_REVIEW` 四个 `pub const`
在 `plugin/mod.rs` 里，**写的一侧（本文件）和读的一侧（`plugin/mod.rs::读面板`/`读菜单`、
前端事件订阅）都引它**。
⚠️ 两边各写一遍字面量等于又造一对"两处相乘"，症状是界面永远空着且不报错（BUG-13）。

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
| 文本长度 | `面板文本上限` = **20000** 字符 | 一个插件把一整个文件塞进 `text`。截断从尾巴上截、留一个 `…`，⚠️ **按字符不按字节**（否则汉字会被劈成半个）。⚠️ **这个数 2026-09-24 从 4000 抬上来的**：一条 `message` 块就是模型的一整段回答，4000 字在长回答上会**静默截断**，用户会以为模型就写了这么多。前端那条兜底（`panel-nodes.ts::消息上限`）跟着调成同一个数 |
| 一层里的项数 | `面板节点上限` = 200 | 一次渲染出几千行，前端卡死。**不是为了防恶意输入，是为了防误操作** |
| 嵌套层数 | `面板层数上限` = 6 | 自引用/超深表把栈打穿。超了那一层是 `null`，**不是报错** |
| 值类型 | 只留 nil/bool/number/string/table | 函数、userdata 过不了 JSON，一律变 `null`（**不是**变成一句假字符串） |

⚠️ **表格当数组还是字典，判据是"有没有连续整数键"**——与 `api/mod.rs::lua_to_json`
同口径（`raw_len() > 0` 就是数组）。两处必须同口径，否则同一个 Lua 表在事件里
是一种形状、在面板里是另一种形状，而插件作者只会看见"有时候不生效"。

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

认不出的一律当 `info`——**插件的笔误不应变成一次报错**，那会让人为了一个无关紧要的通知
层级去读栈。

### 测试（20）

⚠️ **用例 2026-09-29 搬去了子模块 `lua/api/ui/tests.rs`**（只搬行数，没搬内容）——
`ui.rs` 当时 867 行，过了 `docs/09` §4 那条 800。⚠️ 它是**子模块**而不是同级文件，
因为这一组要用到 `normalise_level` / `截断` / 面板那三个上限这些**私有项**；
改成同级就得把它们放宽成 `pub(crate)`。理由写在那边文件头。


| 测试名 | 钉住什么 |
|---|---|
| `通知层级归一化` | `None` → `info`、`warn`/`warning` → `warn`、`error` → `error`、**其它值** → `info` |
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
| `两个字段的_prompt_读得回来` | `secondArg` / `secondLabel` / `secondPlaceholder` 三个也跟着回来（2026-09-26 加第二个字段时补的，⚠️ **这一行 2026-09-29 才补进文档**） |
| `第二个字段只给一半等于没给` | 只给键名 / 只给标签两个方向都试：缺键名那条整段当没有（同 `没有_arg_的_prompt_当没写` 的判据） |

⚠️ **单条能力单测**（每个方法的"装不装"）在 `api/mod.rs` 那边，两张表里不必各测一遍。

⚠️ **前四条故意让写的一侧和读的一侧都参与**——只测一头永远测不出 BUG-13 那一类。

---

## `src-tauri/src/lua/api/http.rs`（595 行 ＋ 用例 `lua/api/http/tests.rs` 486 行）

`nota.http` —— 让插件发 HTTP 请求。**2026-09-24 落地**（`docs/07` 第 12 项；
在那之前这张表是 `not_implemented` 空壳）。面向插件作者的用法见
[docs/13](13-lua-api.md) §9，这一节讲**宿主这侧为什么要这么写**。

### 文件头的"为什么"要点

- **这块是"外网"的口子，也是这台机器上唯一一条主动往外连的通道。** 插件写的地址
  就是它连的地址，所以**地址本身要过一道闸**（`检查地址`）。
- **没有 `ctx`**：`build(lua)` 只收 `Lua`，不碰文档也不碰设置。⚠️ 这是**刻意**的——
  一个能发 HTTP 的插件同时还能读全文，等于给这条口子加一个没必要的放大器。
- **阻塞**：底下是 `ureq`（同步）。所以调用它的宿主命令在
  `tauri::async_runtime::spawn_blocking` 里跑，**不占住主线程**；
  但**插件命令是串行的**（全程持 `plugins` 锁，见 `commands/plugin.rs`），
  一个慢请求会挡住别的插件的命令。

### 四个上限（都是"防止插件拖垮宿主"）

| 常量 | 值 | 挡的是 |
|---|---|---|
| `默认超时` | 30 s | 不传 `timeout_ms` |
| `最长超时` | 180 s | ⚠️ **超了截到上限，不报错**——插件写 `timeout_ms = 600000` 的意图是"这请求可能很慢"，不是"我要一个非法值"。**没上限的话一个插件写个 1 小时，就有一个后台线程被占住一小时**，界面上表现为"这个插件点了没反应" |
| `响应上限` | 2 MiB | ⚠️ 超了**报错**（不是截断）——半个 JSON 一定解析失败，而"解析失败"这条错会把病因指错地方 |
| `请求上限` | 1 MiB | 插件自己拼的请求体（多半是拼错了） |
| `最大重定向` | 5 | 重定向环 |

方法是个**封闭集合**（`允许的方法`）：`GET` / `POST` / `PUT` / `PATCH` / `DELETE` / `HEAD`，
**认不出就报错**（不是拒绝，是"这个方法我不认识"）。

### ⚠️ 2026-10-04 加的那条路：`stream`（`docs/07` 第 58 项）与第 60 项

两件事**同一天**落在同一个文件里，而且它们是**分开的**：

| 改了什么 | 在哪 | 为什么 |
|---|---|---|
| **`stream(spec, on_chunk)`** | 新的 sink 那条路 | 第 58 项要"边生成边显示"。⚠️ **`切出完整段` 是这一块的关键**：`ureq` 交上来的 `read()` 是**字节**，一刀下去很可能切在一个汉字的中间；攒够一个完整 UTF-8 才往 Lua 交，所以**插件那一侧的最小单位是一个字符**（`lua/api/http/tests.rs::流式的每一块都不切半个汉字` 钉的就是它）。⚠️ **回调返回 `false` 才算中断**，而且**只有真中断过**结果表上才有 `aborted`——`[DONE]` 之后服务器自己关连接，那不是中断 |
| **`落定`（结果表）** | 所有调用名共用的收尾 | 第 60 项：**环境类**失败（连不上／超时／读断了）折成 `{ ok = false, error = "…" }` **返回**；⚠️ **"作者写错了"那一类照旧抛**（地址少了协议头、方法不认识）。这与 `nota.git` 那条「两个失败通道」是同一口径（`docs/13` §0.2） |
| **`nota.json`** | 新文件 `lua/api/json.rs` | 顺带产物：解 SSE 里那一小段 JSON 用的表。宿主本来就在做这件事（`json_to_lua`），没必要让每个插件再手写一个解码器（`docs/13` §17） |

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
而不是一个"JSON 解析失败"——后者会把病因指到错的地方，**而且掩盖了"服务器回了一句话"这个事实**。
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
| `响应是_json就拆好放进去` | ⚠️ 这条用例同时钉住**下标从 1 起**：写成 0 起的话数组第一个元素会静默丢掉（`#t` 也对不上），而插件那边看到的是"模型没给出回答" |
| `不是_json就没有_json这个键` | HTML 错误页 / 空体：**没有 `json` 这个键**，`text` 照旧 |

⚠️ 这几条**都不真连网**——测的是"入参怎么校验、出参怎么折"，不是"网通不通"。
真连网的那一半只能靠 GUI 跑（`docs/10` §10 第 3 项）。

---

## `src-tauri/src/lua/api/settings.rs`（377 行）

`nota.settings` —— 插件存自己那点配置。**2026-09-24 落地**（`docs/07` 第 13 项）。
面向插件作者的用法见 [docs/13](13-lua-api.md) §10；「**为什么不加密**」那件事
在 [docs/12](12-plugin-runtime.md) §4.5，**这里不再重说**。

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

## `src-tauri/src/focus/mod.rs`（657 行）

**强制专注的账本**（2026-09-26）。⚠️ **这是一个核心功能，不是插件**——用户原话
「注意啊，这不是插件。这是核心功能」，理由在文件头：它要**窗口焦点**、要**开一个置顶窗**、
要**出声**，三样都在插件沙箱之外（`docs/12` §4.7a 那条"插件没有 timer、收不到宿主事件"
同样管着它，但那不是因为它是插件，而是因为它必须自己数时间）。

### 文件头的"为什么"要点

1. **模型是账户余额，不是定时器**（用户 2026-09-26 定的口径）：专注往里存、走神从里扣、
   扣光就响。用户推翻了先前"每隔 N 分钟必响"的方案，理由是那种定时器有个明显的洞——
   「每隔 19 分钟切回来 3 秒」就能把整套东西骗过去。
2. **余额在内存里是整数毫秒**，设置里是分钟。⚠️ 一秒一拍、一秒累加一个 `f32` 的浮点误差会
   一直攒着，最后表现成"余额显示 0:00 了但就是不响"（或反过来）——所以**进账出账都按毫秒整数算**。
3. **三条不变量**（这个功能的全部正确性都在这里，用例逐条钉着）：
   | 不变量 | 说的是什么 | 少了它会怎样 |
   |---|---|---|
   | **宽限期内不欠账** | 失焦的头 `grace_seconds` 秒**一秒都不扣**，第 `grace+1` 秒才开始 | 切出去查个词就挨一刀，罚得太密等于没罚 |
   | **警报中账本冻结** | 阶段是 `警报` 时**不奖也不罚** | 警报窗自己抢焦点 ⇒ 主窗"失焦" ⇒ 再扣 ⇒ 又响，一路塌下去 |
   | **冷却要攒回复活线** | 响过一次之后要过 `复活线`（10s ～ 60s）才允许再响 | 点掉警报立刻又响，用户永远点不完 |

### `pub enum 阶段` 与 `名字()`

`专注` / `走神 { 起于: Instant }` / `警报` 三档，`Copy`（每拍要按值传出去）。
`名字()` 给的是 `"focusing"` / `"away"` / `"alarm"`——⚠️ **那是给前端分叉用的字符串，
不是界面上的文案**；界面文案由前端自己 i18n。⚠️ **它是唯一的真相源**：`装快照` 里那一格
走 `名字()`，别在别处再拿字符串比一次。

### `pub struct 快照`（跨边界那一份）

| 字段 | 是什么 |
|---|---|
| `running` | 有没有在跑。⚠️ 与"`state` 是 `null`"**不是一回事**，前端两个都要用 |
| `balance_ms` | 余额（毫秒，可为 0） |
| `cap_ms` | 上限（`total_minutes` × 60000） |
| `phase` | `名字()` 那三档之一 |
| `away_ms` | **这一轮**失焦持续了多久 |
| `grace_ms` | 宽限期（给前端算"还有多久开始扣"） |
| `elapsed_ms` / `focused_ms` / `away_total_ms` | 会话计时与两个累计量 |
| `alarms` | 这一轮响过几次 |

### 公开接口

| 函数 | 干什么 |
|---|---|
| `pub fn 开始(状态, 设置) -> 快照` | 开局。⚠️ **重复开始不重置余额**（用例钉着）——不然连点两下就白刷一管额度 |
| `pub fn 停下(状态) -> 快照` | 收摊，快照回空的 |
| `pub fn 现在(状态) -> 快照` | 只读一份，不动账本 |
| `pub fn 窗口焦点(状态, 有焦点: bool)` | 主窗的 `Focused` 事件喂给它。⚠️ 得焦会把 `走神` 改回 `专注`；⚠️ **`警报` 中失焦不改阶段**（那条不变量） |
| `pub fn 确认(状态) -> 快照` | 「我回来了」：阶段回 `专注`、余额清零、**带上冷却**、快照重算 |
| `pub fn 起(app)` | 起那个**一秒一拍的裸线程**（`std::thread`，不是 `tokio::time`——这个仓里没有一处 tokio 定时器） |

### ⚠️ 三个必须记住的坑

1. **事件与开窗都在放开锁之后**。一拍里的顺序是：拿锁算这一拍 → 放锁 → `emit(EVENT_FOCUS)`
   → `如果响了 alarm::响` → **`alarm::对账(阶段)`**。持锁去跑前端代码是锁序问题。
2. ⚠️⚠️ **警报窗的 `Focused` 绝不能算作"用户回来了"**。那一枪由 `lib.rs` 分派，判据钉死在
   `window.label() == "main"` 上：警报窗抢到焦点也会发一条 `Focused(true)`，一起算进去的话
   "该罚的变成该奖的"，警报会在下一拍自己解掉，**整个功能当场失效**。
3. **开窗/关窗没有边沿可等**，所以每一拍按阶段**对账**一次（`alarm::对账`）——见 `BUG-41`。

### 测试（13）

| 测试名 | 钉住什么 |
|---|---|
| `一直专注会攒到上限就停` | 封顶，不能先攒两小时 |
| `一直走神到归零才响一次` | 响的时机 |
| `宽限期内不扣钱` | 不变量 ① |
| `走神超过宽限才开始扣` | 不变量 ① 的下半句（第 `grace+1` 秒才扣） |
| `切回来一下刷不出额度` | 那条"每 19 分钟切回来 3 秒"的洞 |
| `警报中账本冻结` | 不变量 ② |
| `冷却要攒回复活线才解除` | 不变量 ③ |
| `确认之后余额归零且带冷却` | `确认` 的三件事一起 |
| `没在跑的时候一切都是空的` | `running: false` 那一档 |
| `重复开始不会重置余额` | 连点两下不许刷额度 |
| `停下之后快照是空的` | 同上 |
| `得焦会把走神改回专注` | `窗口焦点` |
| `警报中失焦不会改阶段` | ⚠️ 不变量 ② 的入口那一侧——`lib.rs` 那条 label 判据的**对照组** |

⚠️ 全是**不用起窗口**的纯账本用例（注入 `Instant` 走拍），所以这个功能"算得对不对"
是能天天跑的；"弹不弹得出来"只有开窗知道（`docs/06` §5.28）。

---

## `src-tauri/src/focus/alarm.rs`（191 行）

**警报窗与那一声响**（2026-09-26）。文件头三件事，一条比一条要紧。

### 为什么必须是**另一个真窗口**

用户要的是「红色大型弹窗**顶置**」，而触发警报时用户**已经切到别的应用去了**——
主窗在那些窗口**后面**。盖在主窗里的红布再大再红，他在别的应用上什么都看不见，
只会听见声音却找不到是谁在叫。所以那是一个真的系统级窗口：
`decorations(false)` ＋ `always_on_top(true)` ＋ `fullscreen(true)` ＋ `focused(true)`，
标题 `Back to writing`，前端入口按 `index.html#focus-alarm` 分叉（`src/main.tsx`）。

⚠️ **不给关闭按钮、不给最小化**：留一个"稍后再说"就等于留一个后门。

### 开与关都认 `阶段` 一个真相源

计时线程每一拍调一次 **`对账`**：阶段是 `警报` 而窗没开就开，不是而窗开着就关。
所以**没有第二条"什么时候关窗"的逻辑**——`确认` 只管改阶段，窗在下一拍自己消失。
⚠️ 代价是最多慢一拍（1 秒）；好处是"谁负责关窗"只有一处。
⚠️ **`关窗` 别在 `确认` 里再调一次**：那样"谁负责关窗"就有两处，漏一处就是"点了按钮窗还在"。

### 两种关法都要算数

1. 窗里那颗「我回来了」→ 前端调 `nota_focus_ack`；
2. ⚠️ **Alt+F4 / 窗口管理器直接关掉** → `lib.rs` 的 `Destroyed` 分派里也调一次 `确认`。
   少了第 2 条会出现最难受的一种故障：窗被关掉了、阶段还停在 `alarm`，下一拍**又开一个**
   ——用户按几次 Alt+F4 就冒出几个窗。

### 公开接口

| 项 | 是什么 |
|---|---|
| `pub const 窗_LABEL` | `"focus-alarm"`。⚠️ `lib.rs` 两处分派靠它 |
| `pub const EVENT_BEEP` | `"nota:focus-beep"`，前端收到就出声（**音色归前端**） |
| `pub fn 响(app, 设置)` | 出声（`设置.sound` 才发那一枪）＋ 开窗。⚠️ 跑在**计时线程**里，所以里面不许有会阻塞的事 |
| `pub fn 开窗(app)` | 已经在就**只再顶一次**（用户可能又切走了，"窗在但被压着"和"窗不在"对他一样）。开不出来时**只记日志 ＋ 退回系统提示音**——不弹 toast（能弹 toast 的主窗正在用户背后，等于没弹） |
| `pub fn 关窗(app)` | 没有就什么都不做。⚠️ 平时由 `对账` 调 |
| `pub fn 对账(app, 阶段)` | **BUG-41 的修法**：把"文件头里写着的设计"真的接进计时线程 |
| `pub fn 系统提示音()` | 兜底音：`canberra-gtk-play -i alarm-clock-elapsed` → `dialog-warning` → `aplay …/Front_Center.wav`，三个都起不来就只记日志。⚠️ **它不自己合成音**（那要先写 WAV 再找播放器），音色好不好听不是兜底该操心的事 |

⚠️ 参数收的是 `阶段` 枚举而不是 `&str`：在 `对账` 里再拿 `"alarm"` 比一次就是**第二个真相源**。

---

## `src-tauri/src/heartbeat.rs`（105 行）

**面板心跳**（2026-09-26）：让声明了 `live` 的面板**跟着时间自己动**。

用户 2026-09-26 要的「写作统计」是一件**实时**的东西，而在这之前面板内容只有三个刷新时机：
切过去、插件喊 `nota.ui.refresh`、点了面板上的按钮。⚠️ 三条都是"**发生了什么事**"，
没有一条是"**时间过去了**"——而"实时"要的正是那一条。

### ⚠️ 为什么心跳在宿主，不在插件

**不给 Lua 加 timer** 是刻意的，不是少写一行：加了它不是"多一个函数"，是**换一种插件模型**。
今天所有插件代码都是"被叫一次、跑一遍、返回"，每次执行都发生在**宿主的某次调用里**——
于是锁归谁、线程归谁、抛错往哪儿报、插件被停用时那段代码还在不在，四条全有明确的主人。
让插件自己醒来，这四条要一条一条重新回答，而这个仓里没有任何一条现成的答案
（顺带一提：`docs/12` §6 那张"没实现"的表上，"没有 CPU 上限 / 没有超时看门狗"还挂着——
一个能自己醒来的死循环比一个被叫起来的死循环难收得多）。

所以走**另一条**路：插件仍然是被动的，只在 `register_panel{ live = true }` 里告诉宿主
"我这一页要跟着动"，拍子由宿主来打。

### 四条口径（都在文件头）

| 口径 | 理由 |
|---|---|
| **一拍 1 秒**（`const 拍子`） | 一秒一跳看着才像"实时"，再快人眼也读不出差别。⚠️ 它**同时**是插件 `render` 的重跑频率上界，所以这个数还兼着"插件每秒最多被跑几遍"的预算 |
| **只叫 `live` 的那几页** | 全叫的话，git 那种在 `render` 里跑 `git status` 的面板会**每秒起一个子进程**，而它一点都不需要实时 |
| **不是内容通道** | 只发"该重拉了"（同 `nota.ui.refresh`），内容仍旧前端去拉、`render` 现跑。⚠️ 判据：把这条事件整个丢掉，面板打开时显示的东西照样是对的 |
| **面板没显示时也照发** | 宿主不知道用户正开在哪一页（那是前端的账），多发的前端自己丢。要省掉它就得让宿主知道"现在哪一页开着"——那是把界面状态在宿主抄一份，正是"两个真相源" |

⚠️ **`plugins` 锁只在取名单那一刻握一下**：下面那个块一结束锁就放了，绝不带进 `sleep`
（它一秒才回来）。⚠️ 取名单读的是 registry（`plugin/mod.rs::跟着动的面板`），**不跑插件代码**，
所以不存在"心跳把某个慢插件的 `render` 拖进来"这回事。
⚠️ 线程是**裸的 `std::thread`**；`Heartbeat` **不进 `AppState`**（同 `DevServerState` /
`ReviewState` / `ProbeCache`）；退出靠 `Heartbeat::stop()`（`RunEvent::Exit`），最多晚一拍。

---

## `src-tauri/src/commands/focus.rs`（95 行）

强制专注那六条命令。⚠️ **这一层没有判据**——只把请求转给 `focus::*`，再把结果 `广播`一份，
规则一条都不在这儿（这一点与别的 `commands/*` 一致）。

| 命令 | 干什么 |
|---|---|
| `nota_focus_get` | 读一份快照 |
| `nota_focus_start` | 开始（读 `AppState` 里的设置交给 `focus::开始`） |
| `nota_focus_stop` | 停 |
| `nota_focus_ack` | 「我回来了」 |
| `nota_focus_beep` | 前端播不出声时转宿主兜底（`alarm::系统提示音`） |
| `nota_focus_close_alarm` | 收警报窗。⚠️ **前端一个调用点都没有**——给调试和退出用的 |

⚠️ 它在 **`FocusState` 与 `AppState` 两份**托管状态上操作：账本在前者，设置在后者。
⚠️ 命令返回的那一份快照**不是**界面该信的：余额每秒都在变，以 `nota:focus-state` 事件为准
（`src/bridge/ipc.ts` 里那段注释写着这条）。

---

# 前端

前端的类型定义集中在 `src/bridge/ipc.ts`，组件文件只 import 类型。
⚠️ 所有 interface 与 Rust 侧的结构体是**两份手抄的定义**，字段名一一对应
（Rust 侧 snake_case，前端也是 snake_case —— **没有做驼峰转换**，
`ui_font_size` / `confirm_unsaved` / `content_width` 这些字段名在前端也是下划线）。

---

## `src-tauri/src/lua/api/diff.rs`（497 行）

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
| 2 | `-` 那几行要与文档里**连续的一段逐字一致** | 模型常会改标点、补空格。宁可报"没找到"，也不拿近似的文字去猜 |
| 3 | **没有 `-` 行＝追加到文末** | 没有落点时不猜位置 |

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

## `src-tauri/src/lua/api/time.rs`（211 行）

`nota.time` —— 墙钟，**带本地日期**（2026-09-27 新增，4 条用例，**不需要能力**）。

### 它解决的是"插件算不出来"

沙箱里没有 `os`、没有 `date`（`lua/mod.rs::硬化的_lua()` 的白名单），插件手上唯一
另一个时间是 `document.stats().clock_ms`——那是**单调钟**（从应用启动算起的毫秒）。
做差是对的，但**回答不了"现在是哪一天"**：它从 0 开始、没有时区、没有纪元，
跨零点时照样一格一格往上走。而写作统计要按天分桶（`docs/07` 第 65 项）。

### 接口：只有 `now()` 一个入口，一次给一整套

| 字段 | 是什么 | 干什么用 |
|---|---|---|
| `now_ms` | Unix 毫秒（墙钟） | 给记录盖时间戳、算"距今多久" |
| `day_start_ms` | **本地**今天 0 点的 Unix 毫秒 | 判断某条记录算不算"今天" |
| `ymd` | `"2026-09-27"` | 按天分桶的**键**（字符串直接比，不用再解析） |
| `y` `mo` `d` `hh` `mi` `ss` | 本地年月日时分秒 | 拼给人看的日期（⚠️ **不补前导零**） |
| `wday` | 星期几，**0 = 周一** | 同上 |
| `tz_offset_min` | 本地相对 UTC 的分钟数（东八区 = 480） | 排查"日期怎么不对" |

⚠️ **为什么不分几个函数**：跨零点时插件会从第一个拿到"昨天"、第二个拿到"今天"，
两套值自相矛盾，而错在哪一半完全看不出来。字段名与契约在 `docs/13` §16.1。

### ⚠️ 必须是**本地**日期，不能像 `plugin/package.rs::今天()` 那样用 UTC

那边只在信任表上记一笔 `added_at`（**验签不读、界面不显示**），差一天无所谓。
**这里完全不同**：这个日期会被画进**分享图**、用户会把它发出去——"今天是 9 月 26 日"
错一天，是**分享给别人之后**才被指出来那种错。所以这一处值当引 chrono。

### 用例（4 条）与它们的口径

日期按本地算而不是按 UTC（同一天 16:00Z 在八区已是次日、在西五区还是当天）/
距零点毫秒数是本地时分秒算出来的 / 装出来的表自洽且**星期从周一起算** /
`now()` 真能调且报的是此刻。
⚠️ 最后一条**只钉不变量**（距本地零点在 `[0, 24h)`、`ymd` 与那三个数字拼得上），
不钉具体值——钉死了就是把用例绑在这台机器的时区上。`本地零点毫秒` 抽成泛型
正是为了能用 `FixedOffset` 写断言。

⚠️ 夏令时那两条分支（回拨取早的那个、前拨跳 0 点时退化成"从此刻开始"）**没有用例**：
它们要用 `Local` 那一侧才摆得出来，而拿 `Local` 写断言等于在测试里复述实现。

---

## `src-tauri/src/lua/api/data.rs`（370 行）

`nota.data` —— 插件**自己那份数据**的读写（2026-09-27 新增，5 条用例，需 `data.own`）。

### 落点

```text
$XDG_DATA_HOME/nota/plugin-data/<插件 id>/     # 本机 = ~/.local/share/nota/plugin-data/nota.stats/
```

⚠️ `<插件 id>` 要过 `paths::安全文件名`（非 ASCII 一律换成 `_`），所以 id 里就算
混进 `/` 也带不出路径。⚠️ **放 `data` 不放 `config`**：`config` 里是**用户该能拿
编辑器直接改的东西**，这里是插件自己写、插件自己读的账。删掉这个目录的后果只是
**那个插件的记忆没了**，文档正文一个字节都不受影响——判据在 `paths::plugin_data_dir`。

### 四个函数

`dir`（那座目录的路径，插件自己算不出来——沙箱里没有 `os.getenv` 也没有 `dirs`）/
`read(name)` → 文本 或 `nil` / `write(name, text)` → `true` / `remove(name)` → `true`。

### ⚠️ 为什么另开一张表，不用现成的那两张

| 现成的 | 为什么不行 |
|---|---|
| `nota.fs` | 它**围在工作区里**（`resolve_in`：canonicalize 之后必须在当前工作区根下，没有工作区就直接拒）。插件的账不该写进用户的文档目录；而且没有工作区时它整个不能用 |
| `nota.settings` | 那是**设置**：能存的类型故意很小（文本、数字、布尔，**没有表、没有数组**）。一条写作记录天然是**一串**记录，拿设置文件当数据库用就把它变成了一个没有 schema 的 blob |

### 三条硬边界

1. **名字只认 ASCII 字母数字与 `.` `-` `_`**、长度 ≤ 64、不许是 `.` / `..`、
   **不支持子目录**。⚠️ 与 `settings.rs::键合法吗` **故意不一样**：这里多放了 `.`
   （数据文件是**文件**，`day-2026-09-27.txt` 很正常），而设置键不许带点是因为
   TOML 拿它当嵌套表的语法。
2. **写是原子的**：先写 `<名字>.tmp`、fsync、再 rename。⚠️ 顺序不能反——反了掉电时
   会出现"名字已经指向新文件、而内容还在页缓存里"的空文件。⚠️ `.tmp` 后缀是
   **宿主加的**，所以插件不可能拿它去覆盖别人。权限 0600 / 目录 0700。
3. **一次读写 1 MiB 封顶**（**防呆**不是防恶意：插件本来就能每秒调一次）。⚠️ 超限
   **报错且一个字节都不落**——检查写在 `ensure_dir` 之前，所以"被挡住时连目录都不建"。

### ⚠️ 三个"看起来该报错、其实不报"的地方

| 情况 | 结果 | 为什么 |
|---|---|---|
| `read` 的文件不存在 | `nil` | "还没记过、从零开始"是**正常状态**。⚠️ 但**读不出来**（权限、不是 UTF-8、超上限）**要报错**：两种情况的含义正相反（"账坏了、该让用户知道" vs "还没记过"），合并成一种就会**把坏账当成新的一天** |
| `remove` 的文件不存在 | `true` | 同 `settings.set(k, nil)`：语义是"**保证它不在了**" |
| 目录还不存在 | 建 | `write` 会先 `ensure_dir`。⚠️ 只有 `write` 会建——`read` / `remove` 不建 |

### 用例（5 条）

`名字合法吗` 那条是**安全用例不是格式用例**（名字来自插件，拿它拼路径就是一条
任意路径读写入口），`../x` / `a/b` / `a\b` / `/etc/passwd` / 中文名逐个钉住；
另四条：写了能读回来删了就没有了（含"不留 `.tmp` 残留"）/ 太大就不写
（**走真表**，不是直接调纯函数——光钉 `大小合法吗` 的话，"检查在 `ensure_dir` 之前"
这条保证就没人看着）/ 在 Lua 里走一遍读写删 / 坏名字进不了文件系统。
⚠️ `装()` 拆出来是**给用例用的**：`build()` 算的是用户**真的**数据目录。

---

## `src/main.tsx`（73 行）

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

## `src/App.tsx`（963 行）

⚠️ **2026-09-27 晚这一批往里加了两条接线**（都不是新组件，是"把设置里那个值递进去"）：
① **键位覆盖的叠加**——`ui/commands.ts::应用键位覆盖` 把 `settings.keys.overrides`
（差量表，见 `docs/03` §5.6f）叠到菜单表上，**叠加发生在这里**（出厂键位仍是 `commands.ts`
的 `MENUS`）；② **启动档**——`ui/useStartup.ts` 读 `files.startup`，把它当入参递给
`ui/useSession.ts::接上会话`（见 `docs/03` §5.6e）。⚠️ 两处的落点不一样：**键位覆盖**在
本文件里读一次、`useMemo` 叠上去（依赖里带着 `settings?.keys?.overrides`）；**启动档**
由 `ui/useStartup.ts` 自己读——它那一枪本来就要拉设置（六枪走同一个 `Promise.all`）。
**别在子组件里再读一遍设置文件**。

应用外壳：状态编排 + 布局。文件头写明这一层只做三件事——**取数据、派事件、拼布局**；
编辑器的活全在 `ui/EditorPane.tsx`，文件树的活在 `ui/Sidebar.tsx`，本文件不承担这两类。

`export default function App()`，无 props。

⚠️ **2026-09-24 沿职责搬走了五块**（从 1118 行起，一路顶着 §0.4 那条 1000 行硬线）：
菜单的三条判据 + 快捷键分发 + 原生菜单那两条 effect → `ui/useMenus.ts`；
两个对话框的"谁在等答案" → `ui/useDialogs.ts`；
导出与打印 → `ui/useExport.ts`；
文档主题的应用/切换/打开目录 → `ui/useDocTheme.ts`；
"把一条菜单命令送进编辑器" → `ui/useEditorCommands.ts`。
五块都是**和外壳布局无关**的东西，搬走之后这个文件回到"骨架 + 各功能模块的接线员"这个位置。

⚠️ **2026-09-25 又搬走六块**（搬之前 998 行，离硬上限只剩两行）：外壳两条显隐 →
`ui/useChromeVisibility.ts`；提示条 → `ui/useToasts.ts`；文档五件 → `ui/useDocuments.ts`；
剪贴板四件 → `ui/useClipboard.ts`；专注/全屏与 Esc 退出 → `ui/useImmersive.ts`。
它们和上面那五块一样，判据都是**和外壳骨架无关**——**这就是该不该搬的那把尺子**。

⚠️ **"搬了五块"不等于"变小了"**：头两次搬完它反而还在 916 行——同一批里又
往它加了格式工具栏与查找条的接线，搬走的和加进去的正好抵掉。**"拆了"和"变小了"不是
同一件事**，看行数要重数，不能推。

⚠️ **`.app-main` 那一层三个格位的 `key` 必须互不相同**（2026-09-25，BUG-33）。
查找条的 key 是 `` `find-${activeDoc.id}` ``、编辑区是 `activeDoc.id`——**故意加了前缀**：
两处原来都写 `activeDoc.id`，而同层还有一个经常为 `false` 的格位（格式化工具栏），
React 按位置对不上就退到"按键值查"那条路，而那张表是 Map、**撞键就覆盖**——
被覆盖的旧 fiber 既不复用也不删，**DOM 节点永远留在 `.app-main` 里**
（症状：关掉的查找条还在屏幕上，再按 `Ctrl+H` 又摞一条）。整条机理与判据见
`docs/04` §2.2a 与 `docs/07` §2 BUG-33。📌 **往里加第四个格位时，键值要接着错开。**

### 十四个 state + 四个 ref（`grep` 数出来的，2026-09-25 重数）

⚠️ **数这两个数不能 `grep -c 'useState('`**——类型参数插在中间（`useState<Document[]>([])`），
那个模式只命中少数几行，数出来会偏小。要数的是 `= useState<` 与 `= useRef<` 开头的行。

📌 **2026-09-24 起 `plugins` / `panels` 两个 state 不在这里了**，连同插件菜单项与
"跑一条插件命令"一起搬进了 `ui/usePlugins.ts`（本文件只解构出
`plugins` / `panels` / `menus` / `handlers` / `调` 五个名字用）。

📌 **2026-09-25 又少了两个**：`toasts` 搬进 `ui/useToasts.ts`（提示条什么时候消失
那条规则有两处反直觉的分支，见那个文件）。⚠️ 同一批里 `statusBarOpen` /
`formatBarOpen` **不是搬走，是取消了**——它们改从 `settings.appearance` 派生
（`ui/useChromeVisibility.ts`），因为"菜单里关掉重启又回来、设置里关掉什么都不发生"
的病根就是这两份内存 state。

下面这份表是**重数过、并对过代码的**（⚠️ 2026-09-25 数这一遍时发现
`dockOpen` / `sidebarOpen` 两个默认值在表里还写着 `true`，而代码 2026-09-24
就改成 `false` 了——那正是用户那句「默认打开应用不要展开两个菜单」）。

| 名字 | 类型 | 说明 |
|---|---|---|
| `docs` | `useState<Document[]>([])` | 标签栏、状态栏的数据源 |
| `activeId` | `useState<DocId \| null>(null)` | 决定渲染 `EditorPane` 还是 `Home` |
| `settings` | `useState<Settings \| null>(null)` | `null` = 还没拉到 |
| `workspace` | `useState<string \| null>(null)` | 规范化后的绝对路径 |
| `tree` | `useState<TreeNode[]>([])` | 只有一层（`depth = 1`） |
| `themes` | `useState<DocThemeInfo[]>([])` | 扫到的**文档主题**，喂给菜单栏「主题」那一栏。**启动时拉一次** |
| `settingsOpen` | `useState(false)` | 偏好设置框开不开。入口是菜单「文件 → 偏好设置」（`file.preferences`） |
| `dockOpen` | `useState(false)` | 右侧插件栏。⚠️ **默认关**（用户 2026-09-24 定的口径） |
| `sidebarOpen` | `useState(false)` | 左侧栏。⚠️ **默认关**，同上。⚠️ **三个入口调同一个 setter**：菜单「视图 → 显示/隐藏侧边栏」（`Ctrl+Shift+L`）、栏内右上角那颗 ×（`Sidebar.onClose`）、菜单打勾。**不是三份状态** |
| `sidebarTab` | `useState<SidebarTab>("tree")` | 左栏当前哪一页 |
| ~~`focusMode`~~ | — | **2026-09-25 搬去了 `ui/useImmersive.ts`**（和全屏合成同一个"沉浸"概念，见那个文件）。⚠️ 它**仍然不进 `settings`**：和 `dockOpen` 同类，是"看的时候的状态" |
| `typewriter` | `useState(false)` | **打字机模式**。同上（这条**没有**跟着专注模式一起搬——它只有编辑区那一半，见 `editor/writing-modes.ts`） |
| `findOpen` | `useState(false)` | 查找条开不开（`docs/07` 第 4 项） |
| `findStatus` | `useState<FindStatus>(空查找状态)` | **编辑器报上来的**命中情况，App 不自己算 |
| `commandState` | `useState<CommandState \| null>(null)` | **编辑器报上来的**光标状态。⚠️ 源码模式与没有文档时是 `null`（"读不出来"），不是一份空状态 |

四个 ref（⚠️ `MenuBar.tsx` 内部另有自己的 `barRef`，不算这里的）：

| 名字 | 说明 |
|---|---|
| `editorRef` | `useRef<EditorPaneHandle>(null)`，App 伸手进编辑器的唯一通道 |
| `activeIdRef` | `useRef<DocId \| null>(null)`，让**只跑一次**的事件订阅 effect 也能读到最新的活动文档 |
| `mainRef` | `useRef<HTMLElement \| null>(null)`，`<main class="app-main">`。⚠️ **2026-09-25 加的**，只为量它的顶端在哪——格式工具栏悬停那一档的触发带按它算（`ui/useChromeVisibility.ts`） |
| `formatBarRef` | `useRef<HTMLDivElement \| null>(null)`，`FormatBar` 的根元素。⚠️ 同上：判定"指针还在工具栏上吗"要它的**真实下沿**，那个位置随查找条开没开、界面风格、缩放而变，按常量算一份就是同一个数字存两处 |

⚠️ **`sidebarTab` 与 `dockOpen` 是受控的**：状态在 `App.tsx`，
`Sidebar` / `StatusBar` 自己不持有。这正是**菜单栏能切它们**的原因——
菜单在 `App.tsx` 里渲染，够不着子组件的局部状态（`Sidebar` 的 `tab` 2026-09-23 就是
为这件事从 `useState` 改过来的）。⚠️ `typewriter` 看起来像"子组件的局部状态"，实际不是：
它**在菜单里有一条可勾项**，所以必须由外壳持有（`focusMode` 同理，只是它 2026-09-25
搬进了 `ui/useImmersive.ts`——**"必须由外壳持有"不等于"必须住在 `App.tsx` 里**）。
⚠️ 反过来，格式工具栏与状态栏那两条**已经不住在这里**了（2026-09-25）：
它们也在菜单里有可勾项，但真值改成了 `settings.appearance` 的派生值——
"勾选状态"跟着设置文件走，不再是一份会跟设置页打架的内存副本。

⚠️ **`PluginDock` 是个例外**：`plugins` / `panels` 受控，但**面板内容**由它自己持
（`useState<Record<string, 面板状态>>` ＋ 一个请求序号 ref）。
内容是"这一刻从插件拉回来的东西"，没有第二个人要用，也就不该往上面抬。
**面板内容不应照着"受控"那条也搬进 `App.tsx`。**

### `askConfirm()` / `answerConfirm()` / `askPrompt()`：两个自绘对话框怎么用

⚠️ **2026-09-24 起这对状态与它那两个 ref 都不在本文件里**，在 `ui/useDialogs.ts`
（`docs/04` §2.6b/§2.6d）。本文件只解构出 `confirmReq` / `askConfirm` / `answerConfirm` /
`promptReq` / `askPrompt` / `answerPrompt` 六个名字用。

`askConfirm({title, message, confirmLabel?, danger?, hideCancel?}) -> Promise<boolean>`：
把几样状态一起塞进 `confirmReq`，同时**把 Promise 的 resolve 存进 `confirmResolve`**；
`answerConfirm(ok)` 取出 resolve、清空 ref、`setConfirmReq(null)` 并兑现它。
`askPrompt(...) -> Promise<{value, second} | null>` 同理。

⚠️ 两个 resolve 都是**单个 ref 不是队列**——一次只可能有一个框。
⚠️ 确认框取代的是原生 `window.confirm`（`docs/07` 第 29 项，已修）：后者**阻塞 WebView**，
会把中文输入法的组合态打断，和 `Toasts.tsx` 明确避开 `alert` 是同一条理由。
⚠️ 输入框取代的是 `window.prompt`——它在 **WebKitGTK 上默认被关掉，调用静默返回 `null`**。

### `useCallback` 工具

| 签名 | 行为 |
|---|---|
| `openPath(path) -> Promise<void>` | `api.doc.open` → `refreshDocs` → `setActiveId`，失败 `toast(String(e), "error")`。**对话框 / 文件树 / 拖放 / 命令行四条路都走它**。⚠️ 2026-09-25 挪到了"启动"那个 effect 的**上面**（那里要开命令行给的文件），挪回去就是 `Cannot access 'openPath' before initialization` |
| `refreshDocs() -> Promise<Document[]>` | `api.doc.list()` → `setDocs(list)` → **返回 list**（`closeDoc` 要靠返回值取新活动标签） |
| `refreshTree() -> Promise<void>` | 没有 `workspace` 就 `setTree([])` 并返回；否则 `api.workspace.tree(undefined, 1)`，失败 `toast(String(e), "error")` |

⚠️ `toast` / `dismiss` **不在这张表里**：2026-09-25 搬去了 `src/ui/useToasts.ts`
（TTL 与"`ttlMs === 0` 永不自动消失"两条都在那边，逐条见 `docs/04`）。

### 五个 `useEffect`（另附两段已搬走的）

**① 启动**（依赖 `[refreshDocs, toast, openPath]`）

```text
Promise.all([api.settings.get(), api.workspace.get(), api.theme.list(),
             api.settings.problem(), api.startupFile()])
  → setSettings / setWorkspace / setThemes
  → 有设置问题就 toast(`设置读不出来了，这次按默认值启动。${…}`, "error", 0)
  → await refreshDocs()
  → 有命令行文件就 await openPath(那个文件)
失败 → toast(`启动时读取状态失败：${e}`, "error")

然后（无论上面成功与否）：
  await api.frontendReady()   // 失败只 console.warn，不影响使用
```

⚠️ 插件那三样（`plugin.list()` / `panels()` / `menus()`）**不在这里**了，
搬去了 `ui/usePlugins.ts`（2026-09-24）——它们在那边有自己的一整套拉取与派生。
⚠️ `api.settings.problem()` 与 `api.startupFile()` 是 2026-09-25 加的两条，
**都不是可选的**：不报设置问题，用户看到的就是一份"自己变回默认"的设置
（而且下一次改动能把原文件覆盖掉）；不接命令行文件，双击 `.md` 开出来的是白板。
⚠️ 命令行文件走 `openPath`（**不是**在这里另写一份打开逻辑）：那条路上已经有
"选中标签 / 刷列表 / 出错弹提示条"三件事。这也是 `openPath` 必须定义在**这个
effect 上面**的原因——详情见 `docs/09` 的 `App.tsx` 一行。

用一个 `alive` 标志挡住卸载后的 setState；`return` 里把 `alive` 置假。
⚠️ `alive` 只挡了 `Promise.all` 之后的那一段——`refreshDocs()` 的 `setDocs` 在 `alive`
检查之后调用，所以安全；但 `api.frontendReady()` 没有 `alive` 检查（它不改 state，无害）。

⚠️ **主题只在这里拉一次**（`api.theme.list()`）。所以用户点「打开主题文件夹…」丢进去一份
新主题之后**菜单里不会出现**，得重启——欠账记在 `docs/07` 第 41 项。
⚠️ 拉回来的是 `DocThemeInfo[]`，**全是文档主题，一条界面主题都没有**。
界面那几条轴（风格、明暗、主题色）的入口在 `ui/settings/`，不在菜单里。

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
- ⚠️ **这里只订了 2 个事件**（`notify` 与 `documentChanged`），而 `bridge/ipc.ts` 的
  `events` 表里**有 5 条**——另外三条各有自己的订阅点：`pluginPanel` 在
  `ui/PluginDock.tsx`（`ui/ReviewPane.tsx` 另订了一次，但只认自己那一格）、
  `pluginReview` 在 `ui/usePlugins.ts`、`nativeMenu` 在 `ui/useMenus.ts`，
  **不是漏了**。⚠️ 数这个数只能对源码：
  `emit(` 那一侧与 `events` 表那一侧，**以"真的发了的那个"为准**（`docs/11` §7）。
  ⚠️ 这里不加 `listen` 去等插件的 UI 注册——那类东西
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
**查得到**，走 Nota 自己的 `runCommand`，见 `docs/04` §4）。
**不能改成"有修饰键就吞"**——那会把系统剪贴板做坏。

⚠️ **④ 意味着"灰 = 快捷键也失效"**。这不是缺陷而是唯一说得通的口径，
理由见 `docs/04` §4。

⚠️ **不判焦点是不行的**（③）：设置面板里的输入框按 `Ctrl+N` 不该新建文档。
但 `isOutsideEditor` 必须放过**编辑器内部**的 `contenteditable`——
ProseMirror 那棵树也是 `contenteditable`，不放过的话编辑器里一个快捷键都用不了。

### 菜单栏那几张派生表

⚠️ **2026-09-24 起派生表多数在 `ui/useMenus.ts` 里**；⚠️ **2026-09-26 起 `menuHandlers`
那张也搬走了**，现在住在 `ui/useCommandTable.ts`（`App.tsx` 那边只剩一个
`const menuHandlers = useCommandTable({…})` 的调用点——**"有没有实现"的真源已经不在
`App.tsx` 里了**，改的时候别去那边找）。见那两节。

| 表 | 怎么算出来 | 用途 |
|---|---|---|
| `menuHandlers` | **手写**的 `Record<string, () => void>`（现在在 `ui/useCommandTable.ts`），键就是 `commands.ts` 里的条目 id | 点菜单项的落点。**没有键 = 这一项没实现** |
| `disabledCommands` | 遍历 `MENUS`（含子菜单），三条判据任一成立就进集合：没实现 / `needsDoc && activeId === null` / `光标条件` 不满足 | 喂给 `MenuBar` 的 `disabled`、原生菜单的 `enabled`、快捷键那步 ④ |
| `menuChecks` | 手写的 `Record<string, boolean>`：`view.toggleSidebar` / `view.outline` / `view.fileTree` / `view.toggleDock` / **`view.toolbarAlways` / `view.toolbarHover` / `view.toolbarNever`**（2026-09-25 起替换掉原来那一条 `view.formatBar`，因为工具栏从"一个布尔"变成三档）/ `view.statusBar` / `view.modeWysiwyg` / `view.modeSource` / `view.modeSplit` / `view.slidev` / `view.focusMode` / `view.typewriter` / `view.fullscreen` | 喂给 `MenuBar` 的 `checks`，画那个 `✓` |
| `accelIndex` | `buildAccelIndex(MENUS)`（`ui/accel.ts`），**从 `accel` 字段推** | 快捷键派发。同一份 `MENUS` 也喂给 `buildNativeTree`（`ui/nativeMenu.ts`）推原生菜单 |

⚠️ **2026-09-24 新加了三个键**：`file.exportHtmlPlain` / `file.exportHtmlStyled` /
`file.print`（落点都是 `ui/useExport.ts`）。同栏里 PDF / Word / ODT / LaTeX / Epub /
图片**故意还是灰的**——`commands.ts` 里有条目、`menuHandlers` 里没有键，于是
`disabledCommands` 把它们收走。**不是漏了，是这一批没做**。
⚠️ 打印那一条**不是"在应用里打印"**：它是"导出含样式的那份 + 交给系统默认程序"，
所以提示里要把两步都说清楚，否则用户会以为点完就出纸。

⚠️ **`menuHandlers` 是"这一项能不能兑现"的唯一判据**（见 `ui/commands.ts` 顶上那段）。
往里加一个键，菜单里对应那项就亮了——**这是有意的单点**，别处不应再写一份标志位。
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

⚠️ **2026-09-25：这张表里的大半已经不落在 `App.tsx` 了**——文档五件（`openPath` /
`newDoc` / `saveDoc` / `reloadDoc` / `closeDoc`，另加 `openViaDialog` / `openFolder`）
和剪贴板四件搬去了 `ui/useDocuments.ts` / `ui/useClipboard.ts`，全屏搬去了
`ui/useImmersive.ts`。表里保留它们是因为**行为描述仍然有效**，只是落点变了
（那一行会标明）。`updateSettings` / `showAbout` 仍在 `App.tsx`。

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
| `copyAsMarkdown` | `() => Promise<void>` | `editorRef.getMarkdown()` → `navigator.clipboard.writeText()`。**2026-09-25 搬去了 `ui/useClipboard.ts`**（那里叫 `复制为Markdown`） |
| `toggleFullscreen` | `() => Promise<void>` | **2026-09-25 搬去了 `ui/useImmersive.ts`**（那里叫 `切换全屏`）。⚠️ 实现也变了：现在是 `setFullscreen(!(await isFullscreen()))` **再同步回来**，不是本地记账 |
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
        {/* ⚠️ 2026-09-30 起**底部那一条画在这里**（标签栏 ＋ 状态栏）：
            不是 `<div className="app">` 的直接子项，而是经 `接线.底部` 交给
            `EditorArea` 落到 `.app-main` 里——这样侧栏与右侧插件栏才通到窗口底
            （用户照 Typora 点的名：「注意下方变化」）。见 `ui/EditorArea.tsx`。 */}
        <TabBar … /> ／ <StatusBar … />
      </main>
      {dockOpen && (
        <PluginDock plugins panels onClose={() => setDockOpen(false)} />
      )}
    </div>
    <Toasts items={toasts} onDismiss={…} />
    {confirmReq && <ConfirmDialog … onAnswer={answerConfirm} />}
  </div>
</ErrorBoundary>
```

`activeDoc = docs.find(d => d.id === activeId) ?? null`。
⚠️ `EditorPane` 带 `key={activeDoc.id}` —— **换文档就是整组件重挂**，
省去"把 A 文档的撤销栈换成 B 的"这类工作。

⚠️ **`TabBar` 是「无条件渲染」的那一个例外**：`Sidebar` 外面套了 `sidebarOpen`、
`StatusBar` 外面套了 `statusBarOpen`、`PluginDock` 外面套了 `dockOpen`——
菜单栏本身**没有开关**（也没有"藏起菜单栏"这一项），标签栏则只看有没有文档。
📌 **2026-09-30**：`TabBar` 与 `StatusBar` **从这一层搬进了 `.app-main`**
（见上面那段注释里的理由）——它们**仍然由 `App.tsx` 建**（`docs` / `activeId` /
`专注状态` / `sidebarOpen` 全在 App 手里），只是落位交给了 `EditorArea` 的那个槽位。

### 两个子组件（2026-09-23 起在各自文件里，不在本文件）

| 组件 | props | 行为 |
|---|---|---|
| `TopBar` | `{disabled, checks, themes, currentTheme, onCommand, onTheme, onOpenThemesDir, dockOpen, onToggleDock}` | `<header className="toolbar">`：品牌名「Nota」+ `<MenuBar>` + 右侧的插件栏开关按钮 |
| `TabBar` | `{docs: Document[], activeId, onSelect, onClose}` | `role="tablist"`。每个标签是一个 `role="tab"` 的 div，内含两个 button：标签名（点击 `onSelect`）与 `×`（点击 `onClose`）。`d.dirty` 时渲染 `<span className="tab-dot" title="有未保存的改动" />` |
| `EditorPane` / `Home` / `MenuBar` / `TopBar` / `TabBar` / … | — | 在别的文件里 |

⚠️⚠️ **四个工具条按钮（新建/打开/打开文件夹/保存）2026-09-23 撤掉了**——
它们各是「文件」菜单里的一项，留着就是同一件事的两个入口。
快捷键一个没少（Ctrl+N/O/S…），「文件」菜单里也都还在，所以撤掉的是那个**重复的**入口，
不是能力。

⚠️ `TabBar` 里 `aria-selected` 挂在 div 上、但点击处理在两个内部的 button 上——
键盘导航（左右方向键切标签）今天没有。

---

## `src/ui/TopBar.tsx`（74 行）· `src/ui/TabBar.tsx`（74 行）

2026-09-23 从 `App.tsx` 拆出来的两支**纯展示**组件——拆的理由就一条：
`App.tsx` 当时 921 行、贴着 1000 行上限，而这两块的 props 全是显式的，
搬走零风险。（那一轮之后 `App.tsx` 又连着搬了七块出去，见它的表行——
**搬是常态，不是一次性的**。）

| 文件 | props | 渲染什么 |
|---|---|---|
| `ui/TopBar.tsx` | `disabled` · `checks` · `themes` · `currentTheme` · `onCommand` · `onTheme` · `onOpenThemesDir` · `dockOpen` · `onToggleDock` · `hideMenuBar` | `<header className="toolbar">`：菜单栏（`hideMenuBar` 为真时**不渲染**）+ 最右那个「插件」按钮 |
| `ui/TabBar.tsx` | `docs` · `activeId` · `onSelect` · `onClose` | `role="tablist"`，每个标签是两个 button（标签名 / ×），`d.dirty` 时多一个小圆点 |

⚠️ 两支都**不持有任何 state**，也**不 import 任何 `api.*`**——这是"拆得干净"的判据：
**只画不决策的组件，可以搬走**。

⚠️ 拆完之后 `App.tsx` 的组件树**一行没变**（`<TopBar …/>` / `<TabBar …/>` 还是那两个调用点），
所以 `docs/04` §1 那棵树照旧成立——只是括号里的「(App.tsx 内联)」换成了文件名。

---

## `src/bridge/ipc.ts`（813 行）

IPC 桥：**前端唯一允许直接 `invoke` 的地方**。理由不是洁癖：命令名是字符串，散在组件里
改一次要全仓搜；集中在这里还能同时把返回值的形状标出来（`invoke` 本身是 `any`，
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
| `UiStyle` | `"auto" \| "adwaita" \| "ghub" \| "macos" \| "plasma" \| "windows" \| "yaru" \| "yaru-blue"` | `settings::UiStyle`（定义在 `settings/mod.rs`）。⚠️ **八个**，与 `ui/settings/panes/AppearancePane.tsx` 的 `STYLES` 表一一对应（那张表写成 `Record<UiStyle, …>`，所以加值时漏不掉） |
| `UiMode` | `"auto" \| "light" \| "dark"` | `settings::UiMode` |
| `ViewMode` | `"wysiwyg" \| "source" \| "split"` | `settings::ViewMode`。⚠️ **不是外观轴**，见 `docs/05` §3.1 |
| `Settings` | `{ui_style, ui_mode, document_theme, view_mode, ui_font_size, content_width, confirm_unsaved, autosave_seconds, strict_markdown, enable_physics, files, editor, image, markdown, export, appearance, general}` | `settings::Settings`。⚠️ **十个顶层老字段 + 七张分页表**（表名与 Rust 侧逐字相同）。⚠️ 这里写错一个字母**不会编译不过**，只会在运行时拿到 `undefined`，而它传回 Rust 会被 serde 当成"这一项没给"、落回默认值——症状是"改了一下，看着像没生效" |
| `PluginInfo` | `{id, name, version, description, authors, license, capabilities, entry, dir, state: "loaded"\|"failed"\|"disabled", error: string\|null, origin: "builtin"\|"user", signature: "verified"\|"unknown"\|"unsigned"\|null, key_id: string\|null, removable: boolean, langs: string[], lang: string\|null, lang_ok: boolean}` | `plugin::PluginInfo`。⚠️ `signature` 的 `null` 有两种意思（**内置插件** / 早于这套机制的老记录），界面上都表现为「没标」；`removable` ＝ `origin == "user"`，前端据此决定给不给「卸载」那颗按钮。⚠️ `langs` / `lang` / `lang_ok` 是语言那三格（2026-09-25），判据见 `plugin/mod.rs` 那一节 |
| `AppLang` | `{setting, effective, available: {tag, label}[]}` | `commands/settings.rs::AppLang`。⚠️ 三个字段各有各的用处：`setting` 是设置页那一格的**原值**（可能是 `auto`）、`effective` 是**启动时算好的**（界面判断全用它）、`available` **由宿主给**（前端不许自己列一份语言表） |
| `PluginReview` | `{plugin, panel}` | `plugin::PluginReview`（`nota_plugin_review` 的返回）。⚠️ **不回标题**——标题前端手里就有（插件名与面板标题两张清单都在它那儿） |
| `NotifyPayload` | `{plugin, message, level: "info"\|"warn"\|"error"\|"success"}` | `nota:notify` 的载荷 |
| `DocumentChangedPayload` | `{id: DocId, text: string, origin?: string}` | `nota:document-changed` 的载荷 |
| `PluginPanel` | `{plugin, id, title, icon: string\|null, location: string}` | `nota_plugin_panels` 的返回（**命令，不是事件**）。⚠️ `location` **不收窄成联合类型**——不认识的据点会被 `PluginDock` 放进「没有落脚处」那组，收窄了反而要把不认识的丢掉 |
| `PluginMenuItem` | `{plugin, label, command, menu, accelerator: string\|null, prompt: PluginPrompt\|null}` | `nota_plugin_menus` 的返回（同上） |
| `PluginPrompt` | `{arg, label, placeholder, hint, secret: boolean}` | `plugin/mod.rs::PluginPrompt`。⚠️ **只有一个 `arg`**：要问两样东西目前做不到（真需要时再加，先造一个没人用的通用表单结构没有意义）。⚠️ `secret` **遮的只是屏幕**，值本身明文落盘 |
| `PanelDirtyPayload` | `{plugin, id: string\|null}` | `nota:plugin-panel` 的载荷。⚠️ `id` 为 `null` = **那个插件的所有面板**都该重拉。⚠️ 事件里**一个字节的内容都没有** |
| `DocThemeInfo` | `{id, name, builtin}` | `themes::DocThemeInfo`。⚠️ **`id` 是键、`name` 是显示名**，两者可以不同（内置那三套就是）；`id` 只会是 ASCII 字母数字与 `-` `_`。`builtin` 为真表示"内置那三套之一（且没被用户覆盖）" |

⚠️ **四个事件载荷（`NotifyPayload` / `PanelDirtyPayload` / `DocumentChangedPayload` /
`FileChangedPayload`）2026-09-27 起住在 `bridge/payloads.ts`**（上表保留它们是为了
"一条命令挨着它对应的类型"这份可读性）：那一段和命令的返回类型是两回事——命令是
"我问一句、宿主答一句"，事件是"此刻发生了一件事"，`types.ts` 顶破 1000 行时缝就
画在那儿。⚠️ 从 `@/bridge/ipc` 或 `@/bridge/types` 引它们**照旧成立**（两处都有
`export *`），调用点一处没改。

⚠️ 改 Rust 侧字段时**必须同批改这里**。两边不一致时 `invoke` 不会报错，只会得到一个
少了字段的对象，然后在某个 `.map` 上炸掉。

⚠️ `Document.path` 在 TS 这边**没有注释**（`TreeNode.path` 有）。真正的要点是：
Rust 侧它是 `Option<PathBuf>`，所以前端一定可能拿到 `null`——**未存盘的新文档就是
`null`**，用之前先判。`TreeNode.children` 同理（`null` 表示"没有子节点/这一层不展开"）。

### `export const api`

一个对象，**七组**方法（`doc` / `workspace` / `settings` / `theme` / `plugin` / `export` / `pandoc`
＋ `nativeMenu` / `appLang` 两个单独的）＋ 两个握手。
**全部返回 `Promise`**（`invoke` 的返回值）。

| 组 | 方法 | 对应命令 | 参数映射 |
|---|---|---|---|
| `doc` | `create()` | `nota_doc_new` | 无 |
| | `open(path)` | `nota_doc_open` | `{path}` |
| | `sync(id, text)` | `nota_doc_sync` | `{id, text}`，返回新 revision |
| | `settle(id, text)` | `nota_doc_settle` | `{id, text}`。⚠️ **只在装载流程里用一次**，它不是 `sync` 的别名 |
| | `cursor(id, 快照)` | `nota_doc_cursor` | `{id, text: 快照.text, empty: 快照.empty}`（2026-10-04 加，第 14 项）。⚠️ **它是旁路**：宿主那份只是镜像的一份快照，推丢了不影响正文，下一笔事务会补上（调用点是 `ui/EditorPane.tsx::记快照`，250ms 去抖） |
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
| | `openDir()` | `nota_doc_themes_open_dir` | 给「打开主题文件夹…」用。⚠️ 后端**会把目录建出来**再打开 |
| `export` | `write(path, content)` | `nota_export_write` | `{path, content}`，返回**真实写出去的路径**。⚠️ 调用者是 `ui/useExport.ts` |
| | `print(docPath, title, content)` | `nota_export_print` | `{docPath, title, content}`，返回落点。⚠️ `docPath` 允许 `null`（新文档还没存过）——那时落点变成系统临时目录 |
| | `reveal(path)` | `nota_export_reveal` | 在文件管理器里**定位**（选中）一个文件。⚠️ **是定位不是打开**——打开会把 PDF 塞进某个看图程序，而用户此刻多半是想把它拖走 |
| `plugin` | `list()` | `nota_plugins_list` | |
| | `setEnabled(id, enabled)` | `nota_plugin_set_enabled` | 📌 **2026-09-25 起有调用者了**（`ui/usePlugins.ts::动作`，插件行上的开关）。⚠️ 调完之后**必须重拉** `list` / `panels` / `menus`——停用是真卸载，那家的面板与菜单该一起消失 |
| | `call(plugin, command, args?)` | `nota_plugin_call` | `{plugin, command, args: args ?? null}`。📌 **2026-09-24 起有调用者了**：`ui/usePlugins.ts::调`（面板按钮与插件菜单项两条路都走它） |
| | `findCommand(command)` | `nota_plugin_find_command` | ⚠️ 没有调用者 |
| | `panels()` | `nota_plugin_panels` | 启动时拉一次（与 `list()` 同一个 `Promise.all`）。⚠️ 不能改成等事件，见 BUG-13 |
| | `panelContent(plugin, id)` | `nota_plugin_panel_content` | ⚠️ **返回类型是 `unknown[]`，这是刻意的**：宿主只保证"是 JSON、有上限"，**不保证形状**——标成 `PanelNode[]` 等于对宿主许下一个它没打算兑现的承诺（插件写错一个 `kind`，类型系统一声不吭）。形状由 `ui/panel-nodes.ts::normalise` 一处校验并补齐 |
| | `menus()` | `nota_plugin_menus` | 📌 **2026-09-24 起有调用者了**（`ui/usePlugins.ts`，与 `list()` / `panels()` 同一个 `Promise.all`） |
| | `review()` | `nota_plugin_review` | 📌 **2026-09-25 起**：编辑区里此刻摊着哪一块，没有就是 `null`（`PluginReview \| null`）。启动时拉一次，并订阅 `nota:plugin-review` 重拉（`ui/usePlugins.ts`） |
| | `reviewClose(plugin)` | `nota_plugin_review_close` | 📌 **2026-09-25 起**：收起来、切回正文。⚠️ **不经过插件**——插件正卡在慢调用里（宿主还抱着 `plugins` 锁）时用户也得退得出来。⚠️ 传的是**当前摊着的那个插件**（`review().plugin`），只收它自己那一格 |
| | `install(path)` | `nota_plugin_install` | 返回装好的 id；`path` 由 `@tauri-apps/plugin-dialog` 的 `open` 问出来。⚠️ **没有 `trust` 参数**——信任是装完之后另一个动作（`trust`），装的那一刻不去猜用户信不信 |
| | `uninstall(id)` | `nota_plugin_uninstall` | ⚠️ **不可逆**，调用方必须先问一句 |
| | `trust(id)` | `nota_plugin_trust` | TOFU ＋ 显式信任：把这个插件签名者的指纹写进 `trusted-keys.toml` |
| | `trustList()` | `nota_plugin_trust_list` | 返回 `信任记录[]`。与 `list()` 同一个 `Promise.all`（`ui/usePlugins.ts::重拉` 一次拉四样）|
| `pandoc` | `probe()` | `nota_pandoc_probe` | 本机装没装。⚠️ **它要起一个进程问版本**（毫秒级，但仍是进程），别在渲染里调 |
| | `export(args)` | `nota_pandoc_export` | `{format, markdown, target, docPath, html}`。⚠️ `docPath` 的**父目录**是 `![](./img.png)` 的基准；⚠️ `html` 只有 PDF 用得上（pandoc 那条路不通时后端拿它走 WebKit 打印），返回值里的 `route` 说明这次走了哪条 |
| （顶层） | `appLang()` | `nota_app_lang` | **启动时拉一次**，拿到就 `定语言(effective)`。⚠️ `effective` 是**启动时算好的那个**，不是现算的——用户改了设置还没重启的那段时间里插件用的仍是旧文案，这里就必须说旧的 |
| `nativeMenu` | `apply(nodes)` | `nota_native_menu_apply` | 返回**"挂上了没有"**，前端据此决定藏不藏自绘菜单栏。⚠️ **不要**改成"按平台判断"（见 `commands/menu.rs` 那段） |
| （顶层） | `frontendReady()` | `nota_frontend_ready` | 启动时调一次 |
| | `startupFile()` | `nota_startup_file` | 启动时调一次：`string \| null`。⚠️ 宿主**只转告路径**，打开走 `App.tsx::openPath`（理由见 `lib.rs` 那一节）；⚠️ 返回 `null` 只有两种情况：没带参数、带的是选项——⚠️ **文件名不是合法 UTF-8 不再是 `null`，是 reject**（2026-09-25，BUG-34），调用方自带 `catch`，见上面 `lib.rs` 那一节 |

⚠️ **参数名是"按名字对上号"的，写错就是静默收到 `None`**，不会报错。
今天全仓唯一一处两边写法不同的就是这个 `tree`：

| | 名字 |
|---|---|
| Rust 形参（`commands/workspace.rs`） | `sub_path` |
| 前端传的键（本文件） | `subPath` |

这条路径**实测是通的**（工作区文件树在 `docs/07` 的"已经真的能用"里），
也就是说 Tauri 2 做了 `camelCase → snake_case` 的换算。但这依赖框架的换算规则，
而且**换算规则只在那一处被用到**——新加命令参数时把两边写成**一模一样**（都用
`snake_case`）再验证一次；这不是可以照抄的写法。

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
  documentEdit: "nota:document-edit",      // 2026-10-04 加，第 14 项
  // …⚠️ 这一段是**摘要、不是全文**：本文件里那个对象已经长到十几条
  //（每条都带一段"这是什么、谁发的、能不能丢"的注释），
  // 逐条的账在 `docs/03` §9.2；改这里时**以文件本身为准**
} as const;
```

⚠️ 这几个字符串与 Rust 侧硬编码的事件名**是两份手抄的常量**，编译器不会对账。

⚠️ **`documentEdit` 是这一族里唯一的例外**：别的事件说的都是"**发生**了一件事"，
它说的是一条**意图**（「请你替我改」）。分界与两条路的对照表在 `docs/05` §5.2b。

⚠️⚠️ **这里只该有"此刻发生了一件事"的事件。** 曾经还有 `pluginPanel` / `pluginMenu`
两条，前后端连类型都写好了，却**一个订阅者都没有**——插件在 `setup()` 里注册、
前端挂载后才 `listen()`，时序上必漏，而且 Tauri 对没有监听者的频道 emit 是**静默成功**的，
日志里连痕迹都没有（BUG-13）。现在面板与菜单改走 `api.plugin.panels()` / `menus()` **拉**，
两条事件名与两个 `Payload` 类型**已删除**——留着就是下一次踩的坑。

---

## `src/editor/create.ts`（885 行）

编辑器内核：Milkdown（ProseMirror + remark）的封装。

⚠️ **2026-09-28：命令白名单那一串整块搬去了 `src/editor/command-table.ts`**——
搬的原因只有行数一个（本文件当时 **1010** 行、越过硬线），`COMMANDS` 表与派发口
一起走了，这里只剩 `跑一条命令` 那层薄壳（两个用家仍然走同一个入口）。
⚠️ 同批本文件也**不再直接引 `insert.ts` / `footnote.ts`**（消费者跟着表一起搬走了）。

### 文件头的"为什么"要点

- **为什么是 ProseMirror 系而不是「textarea + 高亮装饰」**：Nota 的模型是**文档树**，
  不是"带样式的文本缓冲"。表格拖列宽、图片定尺寸、嵌套列表的层级、脚注引用、
  任务项勾选——这些在文档树上都是**一等的节点**，在文本缓冲上则要一层层拿文本偏移去近似，
  且每次编辑都可能算错。
- Milkdown 底下就是裸 ProseMirror。将来某个节点要下沉到 PM 原语（自定义 schema、
  自定义 plugin），这条路是敞开的——本文件不做任何绑死在这一层的封装。
- **真相在哪**：前端是文本的真相。本模块提供 `getMarkdown()` / `setMarkdown()` 两个口子，
  别的模块**不要**直接去摸 `editorViewCtx` 里的 state。

### `export interface EditorHandle`

**对外十六条**（2026-10-04 现数）。⚠️ **逐条的表在 `docs/05` §4**——那张表有
每一条的实现、调用点与坑；这里只列名字，免得同一份东西写两遍、然后漂成两份。

```ts
export interface EditorHandle {
  getMarkdown: () => string;  setMarkdown: (markdown: string) => void;
  focus: () => void;          focusAtStart: () => void;
  runCommand: (name: EditorCommand, payload?: CommandPayload) => boolean;
  destroy: () => void;

  setFind: (query: string, options: FindOptions) => void;
  findStep: (方向: 1 | -1) => void;   clearFind: () => void;
  replaceCurrent: (text: string) => boolean;  replaceAll: (text: string) => number;

  setWritingModes: (模式: 写作模式) => void;
  setReview: (预览: 改动预览 | null, 看法: 预览看法) => void;
  跳到标题: (目标: { line: number; index: number }) => void;
  选区: () => 选区内容 | null;
  插入在光标处: (text: string) => boolean;   // 2026-10-04 加，第 14 项
}
```

⚠️ 这个块的条数是**数出来的**（`grep -c` 那份接口体）：2026-09-23 那版是五条，
此后四批各加过东西（查找五条 / 写作模式 / `focusAtStart` / `setReview` /
`跳到标题` / `选区` / `插入在光标处`），**这一格此前一直停在"五个方法"**——
数错的表现不是编译错，是"照文档写少了一条"。
⚠️ 类型本体住在 `src/editor/create-types.ts`（纯类型文件），`create.ts` 只是
`export type *` 转发，所以 `@/editor/create` 这个老路径照旧。

⚠️ `setMarkdown` 是 `replaceAll`，**不保证失败会报错**：一个语法坏掉的 markdown 不会
报错，remark 会按它的理解尽力解析，结果是"一段看起来对但不完全对的内容"。
所以进编辑器的文本要先过 `parseMarkdown()`（见下）。

⚠️ 源码模式那份句柄叫 `SourceHandle`（`editor/source.ts`），**十六个方法同名同义**，
所以 `EditorPane` 里一个 `handleRef` 能装两种实例。差别只有两处（`runCommand`
返回 `boolean`、`getMarkdown` 真同步），见 `src/editor/source.ts` 那一节。

### `export interface CreateOptions`

字段比这里列的多（**十六格**，2026-10-04 现数）：这里只点四格常用的，
其余（`strict` / `physics` / `inlineMarks` / `标点` / `自动更正` / `emoji` /
`智能符号` / `review` / `tableWidths` / 三个 `on*` 回调 …）**逐格的来历与
"改它要不要重建实例"都在 `src/editor/create-types.ts` 的 `CreateOptions` 上**——
那一份是权威，别在这儿抄第二份。

```ts
export interface CreateOptions {
  root: HTMLElement;
  initialMarkdown: string;
  onChange?: (markdown: string) => void;
  readOnly?: boolean;             // ← 分屏右侧那个预览窗格
  onSelection?: (快照: 选区快照) => void;  // 2026-10-04 加，第 14 项（不传就不挂那条插件）
  // …其余见 create-types.ts
}
```

`onChange` 的注释说明它**已经在 Milkdown 的 `updated` 钩子里**——调用方拿到后仍要做去抖。
⚠️ **几个 `on*` 回调是"不传就不挂那条插件"**（`onCommandState` / `onFindStatus` /
`onSelection` / `onTableResize` / `onReviewEscape`）：只读那一侧没有光标、没有选区、
改不了文档，挂了也是白算。

⚠️ **`readOnly` 要两件事同时成立才算只读**，缺一件就是"看着只读、实际在改文档"：
`editorViewOptionsCtx` 里 `editable: () => !readOnly`（管 DOM 能不能编辑），
以及 listener 里 `if (readOnly) return`（**只读实例一律不报变化**）。
第 2 条不能省：预览的文本是别人推给它的，它报变化会让调用方以为"用户改了文档"，
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
**给用户自己写的主题留的钩子**——外部主题里大量使用 `#write h1` 这种写法，
留着这个 id，那些选择器被限域之后仍然命中；删掉的话它们会静默失效。
⚠️ **这个 id 不能删。** 见 `create.ts` 里那段注释。

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
`Cannot find module`。原句的结论对但理由不成立（只有 prism 被点名要显式写），不能照抄。

⚠️ **没有** `block`（块手柄）、没有 `tooltip`——这些是交互糖，排在后面的轮次里。
先装它们会在 Nota 还没确定交互口径时就被它们的默认行为绑住。

📌 **更正（2026-09-27）**：本行原来把 `slash`（斜杠菜单）也列在"没有"里，**那句已经
过期**——斜杠菜单 2026-09-27 做了（`docs/07` 第 79 项），装在这一串的末尾
（`.use(readOnly ? [] : 斜杠菜单(...))`）。⚠️ 但装的是**本仓自己写的那一份**
（`editor/slash.ts`），**不是**上面那张表里的 `@milkdown/kit/plugin/slash`：
后者要拖 `@floating-ui/dom` ＋ `lodash-es` 两条依赖链。理由写在
`src/editor/slash.ts` 与 `src/editor/create.ts` 的文件头。
⚠️ 那张上游依赖表里出现的 `slash` 指的是 `@milkdown/kit` 自带的
`plugin-slash`，**与本节这一条不是一回事**，别把两处混起来读。

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

## `src/editor/caret-snapshot.ts`（138 行）

**编辑器报给宿主的那份选区**（2026-10-04 新建，`docs/07` 第 14 项）。两件东西：
`选区快照` 类型 ＋ 一支只读观察者插件（`选区快照插件(onSelection)`，挂在
`createEditor({onSelection})` 上）。

### ⚠️ 这个文件为什么存在：文件头那张量测表

原计划是给插件一个**位置查询**（"光标在第几个字符"）。2026-10-04 量了一遍，
结论是**那个坐标系不存在**——用真的 ProseMirror schema ＋ 真的 milkdown 序列化器
跑的四组：

| 光标在哪 | 在 markdown 的偏移处拼一段字 | 结果 |
|---|---|---|
| 行内 | 直接插 | ✅ 对（**这正是当初以为整条路都走得通的原因**） |
| 块与块之间 | 直接插 | ❌ 少一个段落——真实的插入会多出一个空行 |
| 列表项开头 | 直接插 | ❌ 少一个 `- ` 标记 |
| 引用块里 | 直接插 | ❌ 两段被粘成了一句 |

根因一句话：**在块边界插字会改变 markdown 的结构**（多一个 `- `、一个 `> `、
一个空行），字符串拼接复现不出来。那四组作为**永久用例**钉在
`tests/caret-snapshot.test.ts` 的第三组里（跑法见 `docs/06` §6.3）。

所以给插件的只有**选中的那段字**；真要改正文，走**意图**（`insert_at_cursor` →
`nota:document-edit` → 编辑器落一笔真事务）。

### `export interface 选区快照`

```ts
export interface 选区快照 {
  text: string;
  empty: boolean;
}
```

⚠️ **`empty` 不能省**：选中一个原子节点（图片、公式）时 `text` 是空串，而选区
**不是**空的。靠 `text === ""` 判断会把这两件事混成一件。
⚠️ Rust 侧那份同名字段（`document::选区快照`）的 `Default` 是**手写**的
（`{text: "", empty: true}`）：派生出来的那份读作"选着一段空的字"，会骗人。
⚠️ `text` 是**纯文本**（标记不在里面）；跨段选区用 `\n` 连（**不是静默粘成一行**）。

### 那支插件

只读观察者（`Plugin`），**不派事务、不进撤销栈**。两条要点：

- **它自己按快照去重**：ProseMirror 每敲一颗字都会派一次事务，不去重的话
  这里就是"每敲一颗字跨一次 IPC"。传出去的已经是**去重之后**的那些次。
- **挂载时报一次初值**（否则"刚打开文档、还没敲过字"时宿主永远不知道选区在哪）。

### 测试

`tests/caret-snapshot.test.ts`，**10 条**，三组：读快照（5）／只报变了的（1）／
上面那张量测表（4）。跑法见 `docs/06` §6.3 的 `for` 清单。

---

## `src/editor/command-table.ts`（186 行）

**命令白名单的实体**：`EditorCommand` 的每一项落到哪个 Milkdown 命令上。

⚠️ **2026-09-28 从 `create.ts` 整段搬来**——搬的原因只有行数一个（那边到 **1010** 行、
越过 1000 行硬上限），内容一个字节没改；同 2026-09-26 `create-types.ts` 那一次（1036 行）。
⚠️ 挑中它是因为它**没有线头**：谁都不认识它、它也不认识谁（只吃一个 `editor` 与一个
payload），搬走之后 `create.ts` 那边只剩一个 `跑命令` 的调用点。
⚠️ 这是**同一份文件的第二次**（第三次是 `text-handlers.ts`）：`create.ts` 是本仓最容易
再撞线的那个文件，见 `docs/09` §4 那一列。

### 里面有什么

| 名字 | 是什么 |
|---|---|
| `COMMANDS` | `Record<EditorCommand, (editor, payload?) => void>` 那张表：键是**编辑器命令**名（`bold` / `ul` / `tableRowBelow`…），值是"怎么把它派给 Milkdown"。⚠️ **`h1`~`h6` 不在表里**——它们共用 `wrapInHeadingCommand`、只是层数不同，先由下面那个分支摘出去 |
| `跑命令(editor, name, payload?)` | 派发口。⚠️ **只管命令、不管焦点**——焦点那件事留在 `create.ts`：两个用家（菜单栏 / 斜杠菜单）的焦点处境正好相反，见 `docs/05` §3 |
| `HeadingCommand` / `BlockCommand` / `HEADING_RE` / `isHeading` | 上面那个分支要用的类型与判据。`isHeading` 写成**类型谓词**而不是 `as`：写成 `as` 的话，"表里漏了一项"这种错误也会被一起放过去 |

⚠️ 表里存的是 `$Command` 的**回调**而不是 `$Command` 本身：Milkdown 的 `callCommand`
要的是 `slice.key`，而 `$Command<T>` 是个带 `run`/`key` 的插件对象、不是 `CmdKey`。
包成"吃一个 editor"的闭包之后，调用点也不必再碰 Milkdown 的类型。

⚠️ **加一条新命令要改两处**：`create-types.ts` 的 `EditorCommand`（类型）与这里的表
（实现）——少改前者的症状是"命令根本传不进来"，少改后者的症状是**编译错**
（`Record` 缺键，反而好办）。⚠️ 斜杠菜单那张表（`editor/slash.ts`）的 id 与这里的键
**同名**，加命令时它也要看一眼（那一侧由类型兜着：`斜杠项.id` 是 `EditorCommand`）。

⚠️ **别把这张表和 `ui/commands.ts` 弄混**：那是**界面命令**（菜单 / 快捷键那一层，
id 形如 `format.bold`），两张表的桥在 `ui/useCommandTable.ts`，口径写在 `docs/05`。

⚠️ **它仍然不是"唯一认识命令的地方"**：那几条做不到一行一条的实现（任务列表 /
清除格式 / 表格增删 / 公式块 / 目录 / 脚注）在 `insert.ts` 与 `footnote.ts` 里，
这里只是**唯一的调用点**——「别处不许自己摸 `editorViewCtx` 派事务」那条纪律说的是
调用点，而调用点 2026-09-28 从 `create.ts` 挪到了这里。

## `src/editor/instant-render.ts`（154 行）

「光标所在块的 Markdown 标记**半透明显示**」那个 ProseMirror 插件。

用户 2026-09-22 提的要求，原话「只输入了两个 ## 则只半透明哦，不是消失」——
Milkdown 默认是**标记一敲完就吃掉**，那两个井号随之消失；需求的行为是
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
**位置在块边界上的 widget，落点不由 Nota 决定**（ProseMirror 要处理"这个位置在哪个
DOM 节点里"的映射，而块首那种位置是有歧义的）。

换成 `Decoration.node`（给块本身挂 class + 属性，标记交给 CSS 的 `::before`）之后
没有第二个元素、也就没有位置歧义。完整诊断过程记在 `docs/07` §4。

### ⚠️ 为什么只有块级

块级标记**本来就该在文档外面**（光标本来就不能单独钻进 `##` 中间）。
行内标记（`**`、反引号）是另一回事——那个必须让符号**真的存在于文档里**，
要改 schema。见 `docs/07` 第 39 项。

⚠️ 装饰在**每次 state 变化**时重算（含光标移动），故意**不做缓存**：缓存要自己判断
"这次变化影响不影响结果"，判错的代价是标记不跟着光标走——而"跟着光标走"正是这个
功能唯一要做对的事。

---

## `src/editor/atx.ts`（94 行）

**「什么算标题」这件事的唯一判据。** 两种模式的正则都在这里，别处一律往这儿问。

| 名字 | 是什么 |
|---|---|
| `atxPrefix(文本, strict)` | **给一段文本用的那个函数**：算标题就返回 `{ 层数, 长度 }`（`层数` 是 `1..6`，`长度` 是**行首前缀占几个字符**），不算就返回 `null`。⚠️ `长度` 是**现算出来的**（`m[0].length - m[2].length`），**别处一律不许自己数井号**——`#   标题`（井号后三个空格）的正文范围是从第 4 个字符起，数井号就错了 |
| `atxTextRe(strict)` | 把一行拆成「井号 + 内容」的正则：严格是 `^(#{1,6})\s+(.*)$`（井号后必须有空格），宽松是 `^(#{1,6})\s*(.*)$` |
| `atxPrefixRe(strict)` | 行首前缀那段（用来剥掉井号取标题文字）：严格 `^#{1,6} +`，宽松 `^#{1,6} ?` |

⚠️ **三个调用点，都得从这儿进**：

| 调用点 | 用途 |
|---|---|
| `editor/heading-on-enter.ts` | **正文那条装饰**（2026-09-30 起归它）：扫全篇段落，按 `atxPrefix` 的 `层数`/`长度` 算每一行的装饰范围与类名，宽松那条还要按"是不是正在写这一段"决定要不要**暂缓放大**（见 `docs/05` §4.9c） |
| `editor/headings.ts` | 大纲、字数、标签页标题那一侧认不认这一行是标题（走 `atxTextRe`） |
| `editor/source.ts` | 源码模式的标题高亮（走 `atxPrefixRe`） |

⚠️ **还有一份同构的实现在 Rust 侧**：`src-tauri/src/document/title.rs::strip_atx()`——
标签页标题是**后端**按当前口径从正文算出来的（`first_heading`），不是前端传上去的。
两边判据必须一起改：只改一边的症状是"正文里是标题、标签页却显示「未命名」"（或反过来）。

⚠️ **宽松那条的判据收在 `atx.ts::atxTextRe(false)`**：井号后**空白可有可无**
（`\s*`），所以 `#你好` 与 `# 你好` 它都认。⚠️ 其中只有**井号后没空白**那一种
（`#你好`）是"CommonMark 永远当不成 ATX 标题"的写法，而宽松**一个字节都不改**
这条正是靠它成立的——解析器怎么看它都只是一段普通文本（见下一节）；
`# 你好` 那种本来就无损，两档下都是真标题。

---

## `src/editor/lax-heading.ts`（90 行）

⚠️ **这个文件现在只剩一半**：宽松模式（默认，`Settings.strict_markdown = false`）
认 `#你好` 是标题，而**不改用户写的一个字节**——这半边现在只管**序列化**：

| 导出 | 层次 | 干什么 |
|---|---|---|
| `不转义行首井号(原文)` | 序列化 | 包一层 remark 的 `text` 处理器，把 `\#标签` 里那个**多余的反斜杠**去掉 |

### ⚠️ 显示那半边搬走了，搬家之后又被推翻过一次

原来这里还有 `宽松标题显示(只读)`（给段落挂 `Decoration.node` + `nodeName: "h1"`）。
用户 2026-09-26 连着报两次、最后一句是「**应该作为标识符的 `#` 不要变换位置和大小**」，
于是那天**显示层整个取消**：`#你好` 跟普通正文长得一模一样。

📌 **2026-09-29 用户改口**：他要宽松那条**也按标题排**，只是**输入的那一下先不放大**
（原话见 `docs/07` §3 第 90 项）。正文那条装饰**又回来了**——但**没有回到这个文件**，
而是搬进了 `editor/heading-on-enter.ts`（`宽松标题类名` / `待成块类名` 两个类名、
`算装饰条目()` / `建装饰集()` 两个函数）。

📌 **2026-09-30 那份长相又被推翻一次，这次才是定下来的形态**：用户要的是
「**类似 `# 你好`。就是不回车只是显示加粗，回车变成标题。**」——于是 `#你好` 和
`# 你好` **并成一条路**：输入期一律**只加粗**（`.nota-heading-pending`），回车才成块、
字号才跳。09-29 那套"按该级字号排"（`宽松标题类名` ＋ `data-lax-level` ＋ `marks.css`
里那六条按级取字号的规则）**当天整个删掉**，判据与代价见 `docs/05` §4.9c。

⚠️ 搬家的理由没变（**长相换了，这条理由没换**）：两条分支**共用一份扫描、一份判据**
（`atx.ts::atxPrefix`），分散在两个文件里迟早对不上。⚠️ `instant-render.ts` 画装订线
标记**是另一份实现**、不从这儿进，别把两处当成同一份。

⚠️ 装饰从头到尾是 `Decoration.inline`（行内，作用在**正文那段文字**上，井号本身不套），
不是当年那个 `Decoration.node`（整段包一层 `<h1>`）——用户那句"`#` 不要变换位置和大小"
就是冲着后者来的，换回 node 那版会当场复发。

⚠️ **文件名留着**：它管的仍然是"宽松模式认得的那种行首井号"，改名要连带动
`tools/doc-sync-check.sh` 那份映射，而这一半的内容没变，不值得。

### ⚠️ 为什么不是"解析前先把文本补成 `# 你好`"

第一版就是这么干的，被用户否了：**所见即所得那一侧是整篇重新序列化**的，
文本一旦被补过，存盘存下去的就是带空格那份——用户写的字被改了。
现在的分工是**结构性**的：从"段落"到"文件"那条路上没有任何一步会改字。

⚠️ 这条规矩的原话是「**如果关闭，存盘不要自动修复。**」（2026-09-24），
它现在是这个文件头上的第一条不变量。想在这里加"补个空格"这类动作之前，先读文件头。

⚠️ 同一条规矩也是**宽松那条没有"回车成标题"**的原因：`heading-on-enter.ts` 的
`回车成标题` 只认 `/^(#{1,6}) /`（井号 **＋ 一个空格**），`#你好` 递进去会被拒——
真转了就得往里插一个空格，那就等于替用户改字。所以宽松那条的"回车后放大"
是**靠光标离开生效**的副作用，见 `docs/05` §4.9c。

### ⚠️ 为什么是 `Decoration.node` + `nodeName`

- 文档树里是段落 ⇒ 存盘必然存回原文；
- DOM 上要**真是一个 `h1`** ⇒ 文档主题里写的是 `h1 { font-size: … }`
  （`src/styles/themes/*.css`），换成真标签，**内置三套和用户自己写的主题**
  才一视同仁地生效。反过来"加个 class、让每套主题各补一条同款规则"要逐个补漏。

⚠️ `nodeName` 是**包一层**不是替换标签（`prosemirror-view` 的 `computeOuterDeco` 行为）。
包一层在这里正好：主题里写着 `p { margin: 0 }`，不会叠出双份外边距。

### ⚠️ 为什么这个装饰能缓存，`instant-render.ts` 那个不能

同一节上面写着"装饰故意不做缓存"，**那是另一个插件的结论**，判据不同：

| 插件 | 装饰取决于 | 缓存 |
|---|---|---|
| `instant-render.ts` | 文档 **+ 光标位置** | ❌ 不缓存（判"这次变化影响不影响结果"会判错） |
| `lax-heading.ts` | 文档 **+ 光标在哪一段** | ✅ 按"`state.doc` 还是不是同一个对象"**＋"跳过位置"**缓存——光标在同一段里左右移动不必全篇重走 |

文档一改对象就换了，缓存自然失效；光标换一段则"跳过位置"变了，缓存同样失效，
**不需要自己判断"这次变化影响不影响结果"**。

⚠️ 2026-09-26 之前这一格写的是"**只有文档**"，缓存键也只有 `doc`。加了
"跳过光标所在段"之后**缓存键必须跟着带上跳过位置**——不带的话症状很隐蔽：
光标一走开，那一段**不会**变回标题的样子（老集合原样返回），而"打字时不变大"
这一半照样是对的。`tests/math-view.test.ts` 第七组里那条"同一个插件实例、同一篇
文档、光标换一段"就是钉这个的。

### 第二半：`不转义行首井号`

`#标签` 在文档树里是段落，而 markdown 序列化器有个保守习惯：段落里**行首**的 `#`
一律转义成 `\#`（`mdast-util-to-markdown` 的 unsafe 表里那条
`{atBreak: true, character: '#'}`）。于是存盘会写出用户没打过的反斜杠——那也是"自动修复"。

⚠️ 那条转义**只在"井号后面有空白"时才有用**，而那种写法 Nota 一个字都不碰，
所以规则可以收得很紧（`/(^|\n)\\(#{1,6})(?=[^\s#])/g`：**必须**是 `#{1,6}` 后面紧跟
非空白非井号），也所以**两种模式都改**——用户看到的规律才是一句话
「**Nota 不会往你写的井号上加反斜杠**」。

⚠️ **已知的一处残留改字**：用户**手打**的 `\#标签` 会丢掉那个反斜杠。
转义井号和裸井号在文档树里是同一个东西（都是文本 `#标签`），要区分只能依赖原文本。
差别只在字节上，两边的解析结果与显示完全一样——记在 `docs/03` §5.5。

---

## `src/styles/accent.ts`（约 140 行）

**「主题色」的全部判断，一个纯模块，没有 DOM。** 2026-09-26 加，起因是用户那句
「这个主题只包含一个 UI 的设计样式……而不包含主题颜色，这样用户可以根据自己的喜好
来定制」——把强调色从「风格」里剥出来单独做成一条轴。

| 导出 | 签名 | 干什么 |
|---|---|---|
| `白` / `近黑` | `"#ffffff"` / `"#10131a"` | 压强调色的两个前景色。⚠️ 近黑是**外壳的近黑**（和 `color.css` 里那个同一个值），不是纯黑 |
| `parseAccent` | `(raw: string) => string \| null` | 认 `#rgb` / `#rrggbb`、`#` 可省、大小写随便、前后空白先 trim；短式**逐位翻倍**（CSS 的规矩）。认不出返回 `null` |
| `相对亮度` | `(hex: string) => number` | **WCAG 的相对亮度**：sRGB 先线性化（分段 0.03928 / 2.4 那条），再加权 0.2126/0.7152/0.0722 |
| `对比度` | `(a: number, b: number) => number` | 两个**亮度**之间的比值（不是两个颜色） |
| `accentFg` | `(accent: string) => string` | `相对亮度 < 0.25` → 白，否则近黑 |
| `accentVars` | `(raw: string) => Record<string, string> \| null` | 一次给出 `--accent` 与 `--accent-fg` 两个变量；`null` = 这一轴没设（空串或认不出），调用方负责**摘掉**旧的 |

### ⚠️ 0.25 这条线是**反读**出来的，不是拍的

第一版写的是"**挑对比度大的那个**"（看着最合理），结果跟出厂配色表对不上：
`color.css` 那 15 对里有 **7 对**会翻——包括 Adwaita 的旗舰 `#3584e4`（出厂给白字，
3.77:1；按最大对比度该给近黑，4.93:1）。

现在的判据是**亮度阈值**，0.25 落在出厂值的两个极端之间：
白字那一侧最亮的是 `#e95420`（L=**0.238**），近黑那一侧最暗的是 `#208fe9`（L=**0.258**）。
**两个数之间随便取一个都行，取 0.25 是因为它好记**——这一条写在代码注释里，
免得后人以为它是算出来的。

⚠️ **代价要说实话**：这条线允许白字低到 **3.65:1**（`#0a84ff`），**低于 WCAG AA 的
4.5:1**（正文），但**高于 AA 对大字与 UI 组件的 3:1**。这不是新引入的问题——
出厂那 15 对本来就在这条线上；0.25 只是"不跟出厂打架"换来的。

### 它不认识的值怎么办

**当作"跟随风格"**：不报错、不弹窗、**落盘时也不清洗**。和 `ui_style` 同一个口径——
用户手改 `settings.toml` 打错一个字，不该让整份设置读不出来（那条规矩的出处见
`settings/mod.rs::DEFAULT_UI_STYLE`）。界面上另给一行红字告诉他"这个值我认不出"
（`AppearancePane.tsx` 的 `.stg-warn`），**但那行字只在设置页里**。

⚠️ **`--accent-fg` 故意不存**：它是算出来的。存了就会出现"改了强调色、前景色还是旧的"
这种**在设置界面里看不出来**的坏搭配。

⚠️ 用例 **14** 条在 `tests/accent.test.ts`（跑法 `docs/06` §6.3）。⚠️ 它有一个别处
没有的做法：**`readFileSync` 去读 `src/styles/theme/color.css`**，把出厂那 15 对的
前景色断言成 `accentFg()` 的结果——所以它是一份**跟出厂配色表绑着的**测试，
改风格批次时会当场响。⚠️ 它的盲区也写在文件头：**它测不了 `applyTheme` 有没有真把
变量写上去、也测不了设置页有没有接上**，那两件事只有开窗看（`docs/06` §5.27）。

---

## `src/styles/applyTheme.ts`（约 130 行）

把设置里的**三条界面外观轴**落到 DOM 上：

```html
<html data-ui-style="macos" data-ui-mode="dark" style="--accent:#e95420; --accent-fg:#ffffff">
```

| 轴 | 落点 | 管什么 |
|---|---|---|
| 界面风格 | `data-ui-style` | 一整套设计语言：控件形状、圆角、间距、动效、字体栈 |
| 明暗 | `data-ui-mode` | 亮/暗。**任何风格下都成立** |
| 主题色 | **内联 `--accent` / `--accent-fg`** | 强调色一处。⚠️ **不写属性**，见下 |

前两条轴的组织方式是 `[data-ui-style="x"]` 定形状、`[data-ui-mode="y"]` 定颜色，
**两者相乘**。把颜色也塞进 style 里，它就没法配暗色了。

⚠️ **第三条轴为什么走内联、不走属性**（2026-09-26 加）：属性是**离散**的——一格一格
写选择器，适合"八档风格 × 两态"这种数得清的；强调色有 **1600 万**种取值，
做不成格子。内联的自定义属性**优先级高于任何选择器**，所以 `theme/color.css`
那 16 段里的 `--accent` 一行都不用改：**用户选了就覆盖它，没选就让它露出来**。
⚠️ 于是「跟随风格」= **把内联值摘掉**（`removeProperty`），不是"写一个当前的值"——
写值就把这一项钉死了，换风格时它不会跟着变。口径与推导见 `docs/03` §5.2b。

⚠️ **第四条轴（文档主题）不在这里，而且没有 DOM 属性。** 2026-09-23 之前它也在这张表上
（`data-doc-theme`），那正是"换个文档主题、整个应用跟着变色"的来源。现在它是一份
注进 `<head>` 的 `<style id="nota-doc-theme">`，只对 `.editor-pane` 之下生效——
见 `styles/doc-theme.ts`。**它不能再加回 `<html>` 上。**

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

把解析后的几条轴写进 `<html>`，**返回一个退订函数**。

内部的 `paint()` 做五件事：

1. `root.dataset.uiStyle = resolveStyle(settings.ui_style)`
2. `root.dataset.uiMode = resolveMode(settings.ui_mode)`
3. `document_theme` 非空 → `root.dataset.docTheme = settings.document_theme`；
   **空串 → `delete root.dataset.docTheme`**（空串代表"用内置默认主题"，
   把属性去掉、让默认样式接手）
4. `--ui-font-size`：**只有「字体大小」那组拨到"自定义"时才写内联**
   （`appearance.custom_font_size`）；拨回"自动"要 `removeProperty` 摘掉，
   让 `:root` 的默认接手
5. `--accent` / `--accent-fg`：`accentVars(settings.appearance.accent)` 非空就逐个
   `setProperty`，**返回 `null`（空串或认不出）就把这两个属性一起摘掉**——
   第 5 条与第 4 条是同一个形状：**"没设"和"设成默认值"必须能区分**

`paint()` 立刻调一次。然后：

- `ui_mode === "auto"` 且 `window.matchMedia` 存在 → 挂 `mq.addEventListener("change", paint)`，
  返回 `() => mq.removeEventListener("change", paint)`
- 否则返回一个 **no-op** `() => {}`

⚠️ 调用方（`App.tsx`）**曾经丢掉了这个返回值**（BUG-7），所以 auto 模式下每次 `settings`
变化都会多挂一个监听器且从不移除。**2026-09-22 已修**：现在写的是
`if (settings) return applyTheme(settings);`，退订函数被正确地交了出去。

⚠️ `--ui-font-size` 与 `--accent` 用的是 `style.setProperty`（内联样式），前两条轴用
`dataset`（属性）—— 两者在 CSS 里的优先级不同，写新样式时要意识到这两处的来源是内联的。
⚠️ 内联的代价：**改完必须能把它们摘掉**，只写不摘 = "上一档的残留永远赢"。

⚠️ `matchMedia` 全部用了可选链（`window.matchMedia?.`），因为非浏览器环境（测试、
SSR）下它可能不存在。

---

## `src/styles/doc-theme.ts`（231 行）

**「文档主题碰不到外壳」这条线的全部实现。** 把一份**按普通文档 CSS 写**的主题
（内置三套在 `src/styles/themes/*.css`，用户自己写的也一样）改造成**只作用于正文**
的样式。

### 为什么不能直接把主题 CSS 塞进 `<style>`

一份文档主题里写的是 `h1 { font-size: 2.2em }`、`body { color: … }`、`a { color: … }`，
**全都没有前缀**——否则主题就没法写。原样注入的后果是应用外壳的标题、链接、
按钮一起被改，侧栏和菜单栏也会一起被改坏。所以要先**把它们关进 `.editor-pane` 里**。

⚠️ **`scopeDocThemeCss` 有两个调用点**：屏幕上的 `applyDocTheme`（注入 `<style>`），
以及**导出**（`editor/export.ts` 把限域后的文本嵌进导出文件）。导出那一份**同样必须限域**——
不限域的后果和界面上一样（主题里那句 `body { … }` 会落到导出文件的页面上）。

⚠️ **这份改造是机械的**，不靠写主题时自觉。主题文件里写漏了也漏不到外壳上去——
这是下面那条"`check_id` 是安全边界"之外**第二条**边界，管的是"样式不越界"而不是"文件不越界"。

⚠️ **上一版（已删）这里的做法不一样，不能按旧版理解。** 上一版兼容外部编辑器主题，
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
⚠️ 理由：正则切 CSS 是常见的出错来源（注释里的花括号、`content: "}"`、嵌套 `@media`）。
浏览器自己的解析器是最准的那个，而且免费。
⚠️ 解析失败（语法坏到浏览器都不认）时**返回空串而不是抛**——换主题失败不该带崩编辑器。

### 六条限域规则（顺序不能换）

| # | 情况 | 怎么办 |
|---|---|---|
| 1 | 已经含 `.editor-pane` | **原样放过**。再套一层会变成 `.editor-pane .editor-pane h1`，永远命不中（**这是最容易犯的错**） |
| 2 | `:root` / `html` / `body` **单独出现** | **改写成** `.editor-pane`（**不是加前缀**）——它们指的就是"正文那棵树的根" |
| 3 | 前导 `html` / `body` 链（`html body` / `body > p`） | 整条前缀**摘掉**，剩下的照第 4 条办 |
| 4 | 其余一切 | 加 `.editor-pane ` 前缀，**包括 Nota 根本没有的那些选择器**（外部编辑器的侧栏、源码视图之类）。给它们加前缀等于让它们安全地失效：不报错、不起作用、也不污染外壳 |
| 5 | `@media` / `@supports` | **下钻**——里面的选择器同样要收拢 |
| 6 | `@font-face` / `@keyframes` / `@page` | **原样放过**（内容不是选择器，套上前缀会当场失效）。`@import` / `@charset` 与不认识的 at 规则**丢掉** |

⚠️ **规则 2 是这次修 bug 的关键：不能为了让某个主题"能改外壳"而把它改回去。**
上一版把 `:root` 的变量**提升到全局**供外壳消费，这一版把它**改写到编辑区**，变量再也出不去。

⚠️ `splitTop()` 按**顶层**逗号切选择器——`:is(a, b) h1` 里那个逗号不是分隔符。
引号与 `()`/`[]` 的深度都要照顾到。

### `export function applyDocTheme(css: string | null): void`

传 `null` = **撤掉主题**。

⚠️ **`null` 是"删掉那个 `<style>` 元素"，不是"注入一段空 CSS"**——所以回到的是
**Nota 自己的样式**（`editor.css` 那份），不是"没有样式的裸 HTML"。这个区别很要紧：
`editor.css` 里的排版是按 token 写的，token 有默认值，删掉主题照样是一份能读的文档。

⚠️ 用**一个固定的 `<style id="nota-doc-theme">`** 做替换，而不是每次 append 一个新的：
后者在用户来回切主题时会原地堆出一串 `<style>`，而且旧的那份仍然生效，
最终无法判断当前是哪套主题。

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

⚠️ 按**外部编辑器自己的 DOM** 写的选择器（它的侧栏 / 源码视图 / 标题栏 / 目录 /
数学块 / 图片块）在 Nota 里会变成
**永远不会命中的死规则**——不报错，也不起作用。**这不是 bug 是边界**：
Nota 的 DOM 契约与外部编辑器不同，不应假装相同。

无测试（前端没有测试运行器）。⚠️ **2026-09-26 起前端有一份手工跑的测试**（`tests/math-view.test.ts`，跑法见 `docs/06` §6.3），**但它盖的是 `math-view.ts` 的纯逻辑，与本条无关**——限域仍然没有机器判据。⚠️ **但限域本身在 Rust 那侧有一条回归测试兜底**：
`themes.rs::内置主题不碰界面变量` 逐份扫内置 CSS，不许出现界面变量名——
确保"在主题里加一条界面变量"这种改动会被测试抓住。**限域逻辑（`scopeDocThemeCss`）
本身仍然没有机器判据**，只能靠人看版式。

---

## `src/ui/MenuBar.tsx`（222 行）

菜单栏。**界面布局这块工作量最大的就是它。**

在这之前 Nota 只有一条工具条 + 四个按钮（新建/打开/打开文件夹/保存），
而这个缺口不小：要补的「段落」一栏就有二十来项（`docs/07` 第 40 项记的就是它，已结清）。

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
`null` = 全关）+ 一个 `barRef` + 一个 ref `点开的`（现在开着的那栏是**点开的**还是划过/方向键切过来的）。

⚠️ 那个 ref 是 **BUG-17** 的修法，见下面「点已经开着的那一栏」那条。

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
- 点已经开着的那一栏 = 收起（桌面惯例）——⚠️ **但只有「点开的」才收**（BUG-17）：
  菜单开着时划过另一栏会把它切过来，那一刻它已经开着了，而用户这一下的本意是
  「打开这一栏」。不区分的话，从别的栏点过来的人**第一下把菜单整个关掉**，得点两下。
  判据在 `点开的` 那个 ref 上：划过 / 方向键切 → 记 `null`（点击算确认），点开 → 记 id
  （再点才收）。子菜单里是同一个毛病、同一个修法（见 `MenuPopup.tsx` 那一节）。

### 「主题」那一栏是**动态**的

`MENUS` 里 `theme` 那一项只写了 `dynamic: "themes"`、`items: []`——
内容由 `themeEntries()` 现算：一条「无主题（内置）」+ 每个主题一条 + 末尾一条
「打开主题文件夹…」。⚠️ 这两条**不在 `commands.ts` 里**，因为它们只属于这一栏。

主题条目的 id 是合成的：`__theme-none` 与 `__theme:<id>`（前缀常量 `THEME_PREFIX`），
`pick()` 按前缀分流到 `onTheme`，其余走 `onCommand`。

显示名用 `t.name`（**内置那三套是中文/专名**：极简 / Adwaita / LaTeX），
被用户覆盖过的那几条（`builtin === false` 但 id 与内置同名）后面跟一个「（已自定义）」。

⚠️ **这一栏装的全是文档主题，一条界面主题都没有**，也没有落点能改外壳。
界面那几条轴（风格、明暗、主题色）的入口在 `ui/settings/`。
用户 2026-09-23 明确要求两者分开，**不能为了"方便"把它们并回来**。

---

## `src/ui/commands.ts`（436 行）

菜单栏的**骨架**：菜单怎么排、每一项叫什么、有没有快捷键。
逐条整理自用户 2026-09-22 提供的 6 张界面截图。

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
⚠️ **两类消费者用的不是同一份**：

| 消费者 | 用的是哪一份 |
|---|---|
| `ui/MenuBar.tsx`（画出来的菜单栏）、`ui/nativeMenu.ts`（原生菜单）、`ui/accel.ts::buildAccelIndex`（快捷键派发） | **拼过的**（`usePlugins().menus`）。漏掉哪一处，插件那一栏就只在那一个消费者看得见 |
| `src/ui/settings/panes/ShortcutsPane.tsx` | ⚠️ **仍然是常量 `MENUS`**——所以**插件的快捷键不出现在「快捷键」那一页**。这不是漏改，是没做：那一页的分组**在模块级算一次**（`const GROUPS`），要带上插件项就得改成受控的。今天唯一的后果是"插件快捷键查不到"，**没记进 backlog 是因为它还没被人抱怨过**——真要改时不是加一个 import 就够 |

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

**三个消费者，一个源**。所以"菜单上显示 `Ctrl+P`"和"按 `Ctrl+P`"不会再出现
不一致——这正是重做的目的。代价是**写错 `accel` 会静默换键**（显示的那个键
失效、另一个键开始干这件事），为此 `buildAccelIndex` 在构建时对
**重复键位**和**muda 认不出的写法**都 `console.warn`。

⚠️ `accel` 里的 `Ctrl` 在 macOS 上是 **⌘**（`formatAccel` 出 `⇧⌘S`，
`native_menu.rs` 翻成 `CmdOrCtrl+`）。muda 的 `CTRL` 在 macOS 上是**真的
Control 键**，直接用会让用户按 ⌘ 没反应。

### 为什么界面串一律中文

中英混杂是一个具体的坑：外部编辑器的菜单就是这样（"帮助"整栏除最后三行外全是英文），
用户 2026-09-22 明确要求过不要这样。
规矩：**菜单项、按钮、提示语一律中文**；`Markdown` / `LaTeX` / `Pandoc`
这种**专有名词**照写原文（它们是名字不是词）。

⚠️ 「帮助」那一栏**只留了「关于 Nota」一条**：「What's New / Quick Start /
Markdown Reference…」这类外链一条都没有——Nota 离线优先，
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

## `src/ui/MenuPopup.tsx`（402 行）

一栏的弹层 + 它飞出来的子菜单。从 `MenuBar.tsx` 拆出来的：**菜单栏负责
"哪一栏开着"，这里负责"开着的那一栏里有什么、怎么走"**，
两者共用的只有 `disabled` / `checks` 两张表。

### ⚠️ 只支持**一层**子菜单

这是刻意的取舍。VMark 那边最深也就是一层——两层以上在桌面软件里
几乎见不到，因为鼠标要走的对角线越来越长、越容易半路误触。内部 `SubMenu`
**自己不认 `submenu` 字段**，所以第二层会静默变成一个点不动的项。
真要加两层的话，前提是想清楚那一组是否该拆成两个平面菜单。

### ⚠️ 子菜单为什么走 portal ＋ `position: fixed`

两个坑，都踩过：

1. **父弹层要能滚**（菜单太长时 `overflow-y: auto`），而 **CSS 里一个轴设成
   `auto`，另一个轴的 `visible` 会被算成 `auto`**——子菜单一飞出右边缘就被裁掉，
   症状是只剩一条几像素的竖条。
2. `fixed` 到视口上才不受滚动容器裁剪，但那样坐标就得**自己量**（`subAnchor`
   那段）。portal 到 `body` 是为了同时躲开弹层那条 `transform` 动画——
   动画期间它会变成 `fixed` 后代的**包含块**，又把人拽回裁剪里。

⚠️ **DOM 顺序反了不要紧，`z-index` 也不该靠它**——portal 出去之后弹层和
主弹层是兄弟关系。

### ⚠️ 父项有两条打开路径，而它们会撞在一起（BUG-17）

带子菜单的父项**划过就展开**（`onMouseEnter`）、**点一下也是展开**（`onClick`）。
麻烦在于鼠标点下去之前一定先划过——所以"点"那一刻看到的永远是"它已经开着"。
早先按"开着就收起"（从键盘那套 `onActivate` 切换语义抄来的）处理，于是第一下点击
**把刚划开的那个收掉了**：弹层闪一下、什么都没发生，得点第二下。

修法是记下「这个子菜单是谁开的」（`点开的` 那个 ref）：**只有点开的才被点击收起**，
划过开的，那一击算**确认**（并记成点开的，所以再点一下才关）。键盘那条路
（`Enter` / `→`）不做这个区分——不存在"划过"这个前因。

⚠️ 判据是**两帧像素**（`docs/06` §5.18）：划过后拍一帧、单击一次再拍一帧，
修前差 **43068.9 px**（子菜单整块消失）、修后 **87.3 px**（只剩光标闪烁那一档）。
⚠️ 可迁移的一条：**"状态是开的"和"这个状态是用户点出来的"不是一回事**，
凡是"划过/点"两条路都能设置同一个状态的地方，都要问一句"那点的第一下呢"。

### 可选的 `heading`（2026-09-30）

`heading?: string` 在弹层顶上画一行小标题（`.menu-heading`），状态栏那个
「字数统计」菜单用它标出"这是哪个菜单"（用户参考图4 里顶上那一行）。

⚠️ **它收的是键，不是翻好的字**（在这个组件里 `t()` 一下）——与下面 `items` 里
那些 `label` 不同：那些是**已经翻好**的字符串。理由是调用方（`StatusBar.tsx`）
手上本来就有 `useT`，而这里统一翻可以少一层"谁来翻"的分岔。

⚠️ **它不是条目**：不收进漫游那个数组、不占序号、不参与 `aria-activedescendant`。
当成条目的话，上下键会在顶上多停一格、读屏会把一个纯标题念成可选项。

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

## `src/ui/nativeMenu.ts`（96 行）

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

## `src/i18n/index.ts`（149 行）· `zh.ts`（31 行）· `zh-ui.ts`（459 行）· `zh-settings.ts`（454 行）· `zh-runtime.ts`（132 行）

前端这一侧的界面语言（2026-09-25）。**一个模块级小 store ＋ 一份中文翻译表，不加任何依赖**——
没有 `i18next`、没有 `react-intl`：今天只有两种语言、一个 `t()`，引一个框架进来
换来的是"下次改要读框架文档"。
⚠️ 那张表 **2026-09-26 拆成了四份**（理由与分工见下面「表拆成四份」那一节）。

### ⚠️⚠️ 2026-09-28：主语言从中文翻成了英语

用户那天定了方向——**英语才是主语言，中文是翻译包**（插件清单 2026-09-27 就已经
这么办了，这一下把应用自己也拉齐）。所以：**键就是英文原文**，译文进
`src/i18n/zh-*.ts`；`en*.ts` 那四份**删掉了**。翻转的来龙去脉（含为什么要翻）写在
`src/i18n/index.ts` 的文件头，改这一块之前先读那一段。

### 规矩只有一条：**键就是原文，缺键就用原文**

```ts
t("Plugins")   // 中文表里有 → "插件"；没有 → "Plugins"（原样）
```

推论三条：**英语没有表**（英语是原文，维护一份"英语翻译英语"的文件没人会更新它）、
只有要翻译的那些才进中文表、加一句界面文字**不用先登记 key**。
⚠️ 代价是**改了英文原文 ＝ 改了一个键**，那条中文会**悄悄失效**（退回英文、不报错）。
这与插件那边（`lua/api/i18n.rs`）是**同一条规矩**——两处同一套，用户/作者只需要记一次。
⚠️ 翻转的好处是**英语界面永远完整**：任何一句还没翻的都还是英语，不会露出半句中文；
而中文是翻译包，缺哪条补哪条，缺了退回英语照样读得懂。反过来的话（原文中文、英语要翻），
一条没翻的漏网就会让英语界面上冒出一句中文。

| 导出 | 说明 |
|---|---|
| `t(原文, ...参数)` | 查表；查不到返回原文（所以英语界面不依赖任何表）。`{0}` / `{1}` 是**参数占位符**（唯一一处插值） |
| `useT()` | 组件里用的那一个，返回同一个 `t`。⚠️ 它**订阅**了语言变化（`useSyncExternalStore`），宿主报来语言之后这一块会重画 |
| `use语言()` | **订阅"当前语言"本身**（也是 `useSyncExternalStore`），返回值就是那门语言。⚠️ 与 `useT()` 的分工是**用途**不是场合：**要画字**用 `useT`（它顺手把订阅做了）；**不是画字、而是把语言当依赖**（推原生菜单、重算某个 `memo`）才用它——拿 `useT()` 去干后者会多一个没人看的 `t` 变量，被 `noUnusedLocals` 拦下 |
| `定语言(语言)` | 宿主报了语言之后调这一下。**只该由 `App.tsx` 启动那一段调** |
| `语言()` | 此刻在说哪种语言（给非组件的地方用） |

⚠️ **`use语言()` 今天推不出变化，但那不构成"那就别订阅了"的理由**：语言是"重启才变"的
（见下），可写死一个不动的依赖，等哪天热切语言真做了，症状是**原生菜单栏还是旧语言**
——而那种地方没人会想到去查依赖数组。

### ⚠️ 为什么是模块级 store，不是 React context

因为**非组件的地方也要用**：`PluginDock.tsx::来源说明`、`ReviewPane.tsx::预览标题`
都是纯函数，它们拿不到 context。一个模块级的"当前语言" ＋ `useSyncExternalStore`
订阅，两头都能用。

⚠️ 组件里请写 `const t = useT();`（局部名盖住模块那个 `t`），**别直接调模块级的 `t(...)`**
就算了——那样首帧画的是兜底语言，而**没有任何东西会通知它重画**。
首帧与宿主答话之间只差几毫秒，但那几毫秒里画出来的字是错的。

⚠️ `兜底 = "en"`（前端 index.ts 里那个常量）与宿主 `lang.rs::应用兜底` 是**同一个值**，
这是刻意的：它就是"还没问到宿主之前先按哪种语言画"那个落点，而宿主的
`应用兜底` 是"认不出系统语区时界面落到哪儿"——**同一个落点的两处表述**，
所以两处必须同值（两处注释互相指回对方，**改一处要看另一处**）。
它 2026-09-26 从 `zh-CN` 翻成了 `en`，理由两条：

1. **"英语界面是完整的"**——⚠️ 这一条**在 2026-09-28 翻转之后由构造保证**：
   英语成了**原文**，任何一句还没翻的都还是英语，不存在"英语表漏了一条"这种状态。
   翻转之前这条要靠人量（当时 `bash tools/i18n-check.sh` 量到 732 对 732、0 欠账），
   现在**不必再量**，这个值于是是稳的；
2. **它是"未命中"的落点**：基准是英文，那么落点也该是英文——落到中文等于
   **替用户假定他读中文**，而"系统语区认不出来"恰好说明不了这件事。

⚠️ 它**不是"默认语言"**：中文语区的用户照旧拿到中文界面（宿主按系统语区算，
`zh-CN` 在支持列表里）。这里是兜底，只在**认不出来**时才用上。
⚠️ 注意它与 `插件兜底`（也是 `en`）**不是同一个概念**，只是今天恰好同值，
理由在 `lang.rs` 那一节。

### 表拆成四份（2026-09-26 拆的，2026-09-28 翻转时跟着换了名）

拆的**唯一理由是 `tools/doc-sync-check.sh` ① 那条 1000 行硬上限**——
拆之前那一个文件已经 **985 行**。四份各管一片，`zh.ts` 只做汇总：

| 文件 | 管哪一片 | 导出 |
|---|---|---|
| `i18n/zh.ts`（31 行） | **文件头 ＋ 汇总**。那套"键就是原文"的规矩、语体口径都在这儿；末尾 `export const 中文表 = { ...界面表, ...设置表, ...运行表 }`——`index.ts` 只认 `中文表` 这一个名字 | `中文表` |
| `i18n/zh-ui.ts`（459 行） | **界面骨架**：菜单栏、插件栏、编辑区预览、`src/editor/` 那一层、界面上那些小件 | `界面表` |
| `i18n/zh-settings.ts`（454 行） | **偏好设置那十一页**（`ui/settings/panes/`）。⚠️ 这一片九成是**说明句**（`help=` 那一栏、`Note` 那一段），正常断句、末尾不加句号；提示条 / 报错 / 空态反过来，一律完整句子、**加句号** | `设置表` |
| `i18n/zh-runtime.ts`（132 行） | `ui/use*.ts` 那些**钩子**与它们弹出来的消息、报错、状态栏提示 | `运行表` |

⚠️ **新的条目就近加进对应那一份，不要往回堆进 `zh.ts`**。
⚠️ 四个文件**都不许超过 1000 行**，任一份到 900 行就该想怎么再拆。
⚠️ `tools/i18n-check.sh` 扫 `src/i18n/zh*.ts`：判据是**取每个文件第一个 `= {`
之后的内容当表体**——所以这四份里**不许**再出现第二个 `export const 中文表`
（它按这个标记切），文件头里也**不要**写 `= {`（连注释里举例也不行）。
⚠️ 条目按**界面上的位置**分组（菜单 / 插件栏 / 设置 / 钩子…），每组上面一句注释说清
"这一段出现在哪儿"。⚠️ 表里**只放中文与英文写法不一样**的键——`Markdown` /
`PDF…` 这种两边一样的不要抄一遍（那正是"缺键就用原文"这条规矩的用处）。

### 覆盖范围：2026-09-26 起是**整个界面**

起点只有插件那一面（插件栏、面板内容块、编辑区预览、插件菜单），2026-09-26 那天
**铺到了整个界面**：菜单栏、设置十一页、状态栏、侧边栏、对话框、工具条都在里面。
进度就是 `bash tools/i18n-check.sh` 那一行数（**现跑现看，别照抄**——它随代码自己动）。
它会把两类都列出来：**还没翻译**（中文界面上显示的是英语原文，算欠账不算错）与
**废键**（表里有、代码里找不到 ⇒ 那条中文**没有生效**，FAIL）。
⚠️ 所以此前文档里"覆盖面只有插件那一面""应用其余部分仍是硬编码中文""欠账记在 `docs/07`"
那几句话**现在都不成立**了。⚠️ 但 `docs/07` §4 里那一大段「没翻译的有多少」的账
（前端 1966 处 / 宿主 1489 处那些数）**是 2026-09-26 上午的状态，还没有跟着改**——
它记的是"当时量到的事实"，要结清得由那一份自己更新，本文件只把结论对齐到今天的代码。
⚠️ 用户规格里「此插件不支持您的语言」那条分支 2026-09-26 在无头窗口里点过
（用一枚临时探针插件验的）。

⚠️ **改语言要重启**：`t` 用的那个语言是宿主**启动时算好的有效语言**
（`AppState::app_lang`，经 `nota_app_lang` 报给前端），不是"设置里那一格的现值"。
理由与插件那边同一条：插件在启动时就按那个语言读好了自己的文案表，
前端跟着一起换才不会出现"界面英文、插件中文"的中间态。

---

## `src/ui/ReviewPane.tsx`（240 行）

**编辑区里摊着的那一块插件面板**（2026-09-25）——用户在正文的位置上看插件给的东西
（AI 的改动预览、git 的 diff）。用户原话：「要求允许直接在 Markdown 编辑区域进行预览」。

### 为什么要有它

在这之前，改动只能摊在**右侧那一栏里**（260px 宽）。diff 这种内容是
**左右对照着看**的东西：一行的原文和改后文放在 260px 里会折成一团，
而用户真正要判断的"这一改对不对"恰恰要靠看见整段上下文。所以它得占正文那一块地方。

### 它是"面板"，不是"另一种窗口"

里面画的还是 `ui/PanelBody.tsx`——和右侧栏同一种内容块（同样的 `kind`、同样的
`panel-*` 类）。所以插件那边**一行新 API 都不用**：照旧 `register_panel` 声明一块面板，
只是多喊一声 `nota.ui.review(id)` 把它摊到编辑区来。
⚠️ **文案也只有一份**：这里不重新解释一遍"什么叫 del、什么叫 add"——那是
`panel-nodes.ts` 的事。

| 职责 | 怎么做 |
|---|---|
| 标题 | `插件名 · 面板标题`（函数 `预览标题`）。⚠️ 名字**查表得来**，插件能决定的只有自己那个面板 id。**查不到就退到 id**——不要因为查不到就整块不画，那会让"预览摊着、标题栏空白"看起来像界面坏了 |
| 订阅 | `events.pluginPanel`，而且**只为自己的 `(plugin, id)` 重拉**（`id = null` 表示"这个插件的都算变了"）——同一个插件别的面板变了不该让这一块闪 |
| 竞态 | 一个请求序号 ref，晚到的响应直接丢掉（同 `PluginDock` 那一套） |
| 忙碌 | `finally` 里清位 ＋ 顺手再拉一次——⚠️ 卡在忙态上会让按钮**永远灰着** |
| 错误 | **如实画出来**，不退化成空框：`render` 抛错正是插件作者最需要看到的那条信息 |
| 「回到正文」 | 调 `onClose`（= `api.plugin.reviewClose`），**不绕道插件** |

### ⚠️ 谁决定"现在摊着哪一块"：宿主，不是这里

状态归 `plugin::ReviewState`（`App.tsx` 那边按它切主区），这个组件是**纯展示**。
⚠️ 不让组件自己 `useState` 一个"我开着"的理由：那样一刷新界面就没了，
而"AI 提了改动、我正在看预览"这件事不该被一次热重载抹掉（与 BUG-13 同一条教训）。
⚠️ 也正因为状态在宿主，"回到正文"这条命令**不需要 `plugins` 锁**——
插件命卡着的时候用户也能退出来。

⚠️ **它的"拉"故意没和 `PluginDock` 共用**：那边按面板键**存一张表**（页签来回切而不闪白），
这里**只摊一块**、关了就没。取舍写在文件头：**第三个调用者出现时再抽**，两个不抽。

⚠️ 语言对不上时（`langs` 非空 ＋ `lang_ok` 为假）在标题下面挂一句
「此插件不支持您的语言」，内容照常画。⚠️ 判据与插件栏那一份**同一条**，
**不在前端按 `lang` 再猜一遍**（见 `lua/api/i18n.rs`）。
⚠️ 但**应用语言是 `en` 时这句不可能出现**（插件的 `langs` 必须含 `en`，
而今天应用语言只有 `zh-CN` / `en` 两种）——那句英文译文目前是**取不到的死文案**，
留着是为了第三种语言进来的那天，见 `docs/11` §2.4。

---

## `src/ui/PandocPanel.tsx`（203 行）

「文件 → 导出 → PDF / Word / …」点下去、**pandoc 没探通**时先看见的那个面板
（2026-09-25）。和插件里那个「装没装」的闸门面板是同一个形状、**共用同一套 CSS 类**
（`styles/gate.css`——⚠️ 那张表原来是 `slidev.css`，2026-09-25 改名：用它的是**两个**面板了，
文件头写着为什么）。

### 它认识的东西很少

一份 `PandocProbe`（后端给的报告）＋ 一种格式（`PandocFormatInfo`）＋ 四个回调。
**判定的话全在 `message` 里，中文，后端写的**；这里只按 `state` 决定按钮怎么摆，
**一个字都不重写**。

| 状态 | 符号 | 主按钮 |
|---|---|---|
| 检测中（`probe === null`，只在「重新检测」时） | 转圈 | 「检测中…」（**禁用**） |
| `ready` | 绿 ✓ | 「开始导出 ⟨格式名⟩」。⚠️ 理论上到不了这儿（前端探通了**不开面板**），但真到了也得有条路 |
| `missing` ＋ **有自带 PDF**（PDF 且 `fallback_pdf`） | 橘 `!` | **「用 Nota 自己排版导出」** |
| 其余 `missing` | 橘 `!` | 「去官网看安装指南」 |
| `unknown` | 灰 `?` | 「仍然试一次」 |

左边那组永远是「重新检测」；**主按钮不是 `onExport` 时**再补一颗「仍然试一次」
（`留一条路`——同一件事不放两颗按钮）。

### ⚠️ 三个不显然的地方

- **面板只在 `missing` / `unknown` 出现**：探通了**不弹面板**（那种情形面板上只有一个
  「开始导出」，白点一下），直接进保存对话框。判据在 `ui/useExport.ts`。
- **它必须说清 PDF 有第二条路**：PDF 是七种里唯一有兜底的，用户手上有能出 PDF 的工具，
  面板不该把它藏起来——所以那种情况主按钮是「用 Nota 自己排版导出」，不是「去官网」。
- **不用 `window.confirm`/`alert`**：它们会阻塞 WebView、把中文输入法的组合态打断
  （同 `ConfirmDialog`）。壳借确认框那套（`.confirm-backdrop` + `.confirm-dialog`），
  点遮罩 = 关掉；键盘 Esc 关、回车走主按钮，**监听绑在 `window` 捕获阶段**（焦点可能
  还没落进来）；焦点那个 effect 的依赖里带 `primary.label`——换结论时主按钮是**另一颗
  按钮**，焦点得跟着换。

### 显示出来的事实

`<dl>` 里三行：**命令** · **版本**（拿到了才画） · **排版引擎**（只在点的是 PDF 时画）。
⚠️ 引擎那一行的措辞是「**没在 PATH 里找到**」，不是「没有」——引擎可能在 PATH 之外，
那不构成"出不了 PDF"的宣判。`probe.detail`（命令自己的输出，比如 `command not found`）
原样用 `<pre>` 端出来，**不改写**：它比任何转述都准。

---

## `src/ui/EditorPane.tsx`（935 行）

编辑区：把编辑器实例接进 React 生命周期，并按**模式**摆一到两个窗格。
架构与三条模式口径写在 `docs/05-editor-bridge.md` §3 / §3.1，这里只讲落地细节。

### 文件头的"为什么"要点

⚠️ **React 不该管编辑器内部的 DOM**。Milkdown（ProseMirror）自己拥有那块 contenteditable，
React 只负责"什么时候挂上去、什么时候拆掉"。想让 React 去 diff 编辑区的内容，
两边会互相覆盖——这类 bug 表现为"打着字光标突然跳走"，而且极难复现。
所以这里用一个**从不重新渲染的空 div** 当挂载点，内容变化一律走 `setMarkdown()`
这条命令式通道。

挂载点在 App 里带 `key={doc.id}`：换文档时整个组件重挂，省去"把 A 文档的撤销栈换成
B 的"这类工作——重挂就是最干净的换法。**换模式也走同一个 effect 重挂**（依赖数组是
`[doc.id, mode]`），理由同：两家的撤销栈不是一回事，硬接只会得到一个"撤销跳到
另一个编辑器历史里"的结果。

### `export interface EditorPaneHandle`

```ts
export interface EditorPaneHandle {
  getMarkdown: () => string | undefined;
  setMarkdown: (markdown: string) => void;
  runCommand: (name: EditorCommand, payload?: CommandPayload) => boolean;

  /* 查找五条 */
  setFind/findStep/clearFind/replaceCurrent/replaceAll

  跳到标题: (目标: { line: number; index: number }) => void;
  选区: () => 选区内容 | null;
  插入在光标处: (text: string) => boolean;   // 2026-10-04 加，第 14 项
  focus: () => void;
}
```

**十二条**（2026-10-04 现数——⚠️ 这一格此前写着三条，早过期了）。⚠️ `EditorHandle` /
`SourceHandle` 是**十六条**：差的四条（`focusAtStart` / `setWritingModes` /
`setReview` / `destroy`）是**接线与生命周期**的事，由本组件自己在对的时机调、不外发。
⚠️ **转发是"原样转发给当前那个 handle，没有就什么都不做"**，少一条的症状是
"切到源码模式后查找条整个失灵"——`tsc` 会拦住，不会漏到运行时。

⚠️ `getMarkdown` 返回 `string | undefined`：编辑器还没建好时是 `undefined`。
⚠️ `插入在光标处` 的返回值与 `runCommand` 同一套契约：**"这一侧有没有实现"**，
编辑器还没建好或那份是只读实例时给 `false`，不抛错（`nota:document-edit` 允许作废）。
⚠️ `选区` 读的是**编辑器自己的选区**，空选区给 `null`。
⚠️ `getMarkdown` 返回 `string | undefined`：编辑器还没建好时是 `undefined`。
调用方（`ui/useDocuments.ts::saveDoc`）必须处理这个 `undefined`（它就是靠这个判"还没准备好"）。
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
| `CURSOR_DEBOUNCE_MS` | `250` | **后端（`api.doc.cursor`），报的是选区快照**（2026-10-04 加，第 14 项）。⚠️ 它推的是**旁路**（推丢了只影响插件读到的选区，不影响正文），所以去抖可以比 `SYNC_DEBOUNCE_MS` 短；⚠️ 两支插件那边还有一层**签名去重**（`empty\|text` 没变就不报），两层加起来才是"不每敲一颗字跨一次 IPC" |

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
  {!ready && <div className="editor-loading">{t("正在准备编辑器…")}</div>}
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
⚠️ 「正在准备编辑器…」那句 2026-09-26 包上了 `t(...)`（组件里 `const t = useT()`，
在文件上方订阅）。此前它是**硬编码中文**——英文界面上这一句照旧是中文，而那种句子
**不会**出现在 `tools/i18n-check.sh` 的「还没翻译」里（那条判据要求代码里先有 `t("…")`），
只会由第 ④ 栏「硬编码中文泄漏」报出来。

⚠️ `EditorPane` 里**没有调用 `api.doc.setActive`**——切标签时后端不知道。
见 `docs/01-architecture.md` 的前端遗留项。

---

## `src/editor/source.ts`（938 行）

**源码模式**的编辑器：CodeMirror 6 的封装。
⚠️ 它与 `editor/create.ts` 是**并列**的两条路，不是"谁包了谁"——两者只共用
`EditorCommand` 那个联合类型。

### ⚠️ 键位表要摘掉与界面快捷键撞车的那几条（`editor/key-conflicts.ts`，2026-09-25，BUG-26 / BUG-58）

**CodeMirror 的默认键位和本应用的快捷键会同时触发**，因为两边各收各的：
本应用的快捷键是在 `window` 上收 `keydown`（`ui/useMenus.ts`，冒泡阶段），
而 CM 处理完自己那张表只调 `preventDefault()`、**不 `stopPropagation()`**
（`@codemirror/view` 的 `runHandlers` 只认键位自带的 `stopPropagation` 标志，
默认那两张表一条都没设）。

⚠️ **2026-10-04 起这份名单不在这个文件里了**，搬去了 `editor/key-conflicts.ts`
（理由见 BUG-58：名单原来只有人眼在看，于是漏了一条，见下表最后一行）。
建编辑器时那句过滤没变：`[...defaultKeymap, ...historyKeymap].filter((b) => !撞车键位.has(b.key ?? ""))`。

实测到五条（前四条 2026-09-25 在无头 X 上逐条复现过；**最后一条是 BUG-58**），
⚠️ **它们是两类病，查法相反**：

| 按键 | CM 干的 | 应用干的 | 用户看到 | 属于哪一类 |
|---|---|---|---|---|
| `Ctrl+/` | `toggleComment` | 切源码模式（空操作） | 光标那行**被套上一对 `<!-- -->`** | 两边都跑 |
| `Ctrl+I` | `selectParentSyntax` | 斜体 | 选区**先被抢走**，斜体加在别处 | 两边都跑 |
| `Ctrl+Shift+K` | `deleteLine` | 插入代码块 | **那一行被删掉**，换成一个空代码块 | 两边都跑 |
| `Ctrl+Z` / `Ctrl+Y` | `undo` / `redo` | 撤销 / 重做 | 一次按键**退两步** | 两边都跑 |
| `Ctrl+U` | `undoSelection` | 下划线 | **什么都不发生**（BUG-58） | **应用被放行** |

⚠️ **"两边都跑"看结果就能查**（多了一对 `<!-- -->`、退了两步）；**"被放行"只能看
`e.defaultPrevented`**——`Ctrl+U` 那条带 `preventDefault: true`，`ui/useMenus.ts` 里
那句 `if (e.defaultPrevented) return;`（BUG-49 的正主）于是把整颗键放行，
而 `undoSelection` 在没有选区历史时是空操作 ⇒ 屏幕上"什么都没发生"，
**与"这个功能没做"长得一模一样**。2026-10-04 是在窗口里打了一句探针把它打进
`document.title` 才量出来的（`docs/06` §5.43 ⑩ ＋ §5.47）。

⚠️ **`Alt+↑` / `Alt+↓` 故意没摘**（`故意不摘` 那份名单）：CM 的 `moveLineUp` /
`moveLineDown` 看起来和菜单里「上移该行 `Alt+↑`」撞了，但**应用侧那两条还没实现**
（`App.tsx` 里没有 handler，菜单上一直是灰的）——摘了就是把唯一能用的那份拿掉。
📌 谁把 `edit.moveLineUp` / `edit.moveLineDown` 接上了，**必须回来把它们加进
`撞车键位`**，否则那两条会一次移两行。⚠️ 单独列一份 `故意不摘`（而不是干脆不管）
是因为下面那台机器判据要求"每一处撞车都在某一份名单里"。

📌 **判据（加 accel 时顺手做一次）**：拿 `ui/commands.ts` 的 `accel` 那一列去对
`@codemirror/commands` 的 `defaultKeymap` + `historyKeymap`（含它拼进来的
`standardKeymap`），把 `Mod` 读成 `Ctrl` 再比。撞了就加进 `撞车键位`。
⚠️ 这一条**现在有机器看着了**：`tests/key-conflicts.test.ts`（**21 条**）就是照这句
话写的——新加一条菜单快捷键、或者升一次 `@codemirror/*` 撞出新的一条，它都会红。

### 文件头的"为什么"要点

⚠️ **不是「不要模仿 VMark 的手感」的反例**。用户说的那句针对的是 **VMark**
（它的编辑手感很差），不是"不许用 CodeMirror"。选 CM 的理由是它是"能编辑文本 +
有语法高亮 + 撤销栈可控"里最省事的一个。

⚠️ **不用 `<textarea>`**，它给不了两样这里必须要的东西：
**语法高亮**（源码模式的全部价值就是"看清 Markdown 结构"）、以及
**撤销栈与文档模型的分离**（`<textarea>` 的撤销是浏览器按"整块替换"记的，
每次 `setMarkdown` 都会冲掉它）。

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

⚠️ **"做全"是设计决定，不是额外多做的一点**。只要有一个模式不支持某条命令，就得维护一份
"哪个模式支持哪些命令"的清单，而那种表必然在下次加命令时忘掉一半——做全了，
那张表就不需要存在。认不出的字符串返回 `false`（`switch` 的 default 分支）。

三个内部小工具（都不导出）：

| 工具 | 干什么 |
|---|---|
| `selectedLines()` | 取选区覆盖的行区间。⚠️ 有一堆"选区在行中间/空文档"的边界，收在一处 |
| `setLinePrefix(view, family, prefix \| null)` | 按行加/去前缀，家族表是 `LINE_PREFIXES`（`heading` / `quote` / `bullet` / `ordered`，各自一条正则） |
| `wrapSelection(view, before, after, placeholder)` | 行内**包一层**（没选东西就插占位词）。⚠️ 今天只剩**链接**一条命令走它 |
| `切换行内标记(view, before, after, placeholder)` | 行内标记的**开关**（BUG-57）：已经带着这一对就摘掉，否则包一层。八族（加粗 / 斜体 / 删除线 / 行内代码 / 高亮 / 上标 / 下标 / 下划线）走它，判据在 `editor/source-mark.ts` |
| `清除行内标记(view)` · `insertBlock(view, text)` | 「清除样式」（**文本级**的近似，认不出来的一律原样留着） / 插入一段块（`$0` 标光标位置） |

### ⚠️ 行内标记是**开关**，不是"只会包"（BUG-57，2026-09-30）

用户 2026-09-30 报的，原话：

> 现在选中已经加粗的文本，再按 Ctrl+B，会再加两个 `*`。应该是去掉。
> 类似的，Ctrl+I、U，排查代码。此问题仅源码或分栏模式有。

所见即所得那边没这个毛病（那里按的是**文档树**，`command-state.ts` 读得出"当前
选区是不是粗体"）；源码模式手里只有字符，判据只能落在定界符上。那份判据是**纯
字符串**的，2026-09-30 分去了 `editor/source-mark.ts`（见下一节）——这里只说三件
容易被改坏的事：

- ⚠️ **返回三种结果，不是两种**：`null`（没带标记 ⇒ 包一层）、`{结果:"不动"}`
  （**嵌套**：`***甲***` 里选中 `甲`，文本层分不清该摘哪一对 ⇒ **一颗字都不动**）、
  `{结果:"摘"}`。`"不动"` 与 `null` 合并，用户会看到 `***甲***` 变成 `*****甲*****`。
- ⚠️ **选区也在纯函数里算**（摘外面那对时两端各左移一个定界符那么长）。算错的
  症状是"按一下，光标跳到别处"，`tsc` 一个字都不会说。
- ⚠️ **分栏模式与源码模式是同一条路**（左窗格就是 `createSourceEditor`），改这
  一处两边一起变。**链接不走开关**（右定界符里带地址 `](地址)`，"再插一次链接"
  算不算开关要单独拍板），它仍旧走 `wrapSelection`。

判据 `tests/source-mark.test.ts` **28 条**（八族各拨一遍 / 嵌套一律不动 / 边界与
"拨两下回到原样" / 读 `source.ts` 源码钉住接线），跑法与"这份测试证明不了什么"
在它文件头。

⚠️ **两处刻意的不对称**（不是 bug）：

- **加前缀跳过空行，清前缀不跳**。给含空行的选区加 `> ` 会让空行变成 `> `——
  "看起来什么都没变、存盘却多了一堆 `> `"比少做一点更难解释；清的时候必须连空行
  一起扫，否则残留下半截。
- **`setMarkdown` 文本相同时直接返回**。否则每次推预览都会派一笔事务、把撤销栈冲掉。

---

## `src/editor/source-mark.ts`（159 行）

**源码模式里"行内标记能不能摘掉"那一个判断**——纯字符串函数，**不 import
CodeMirror**（2026-09-30 新建，BUG-57）。

```ts
试摘定界符(文, from, to, before, after): { 结果:"摘"; 改动; 选区 } | { 结果:"不动" } | null
```

它回答的是"用户选中的这段文字，是不是已经带着 `before`/`after` 这一对定界符"，
三种结果各有各的出路（为什么不能少一种，见上一节那三条 ⚠️）。两个形态都认：

| 形态 | 例子 | 怎么认 |
|---|---|---|
| 定界符在选区**外面** | `**\|甲\|**` | 双击选词的默认结果（星号不进选区），先从这一段判 |
| 定界符在选区**里面** | `\|**甲**\|` | 用户把星号一起框进来了，是拖选的结果 |

⚠️ **"嵌套"一律不动**：`***甲***` 那三颗星分不清该摘哪一对，而"包一层"会得到
`*****甲*****`——**分不清就不动**，比猜一个强。代价如实记着：`***甲***` 里选中
`甲` 按 `Ctrl+B` **取消不掉加粗**（要摘得手动删两颗星）。

⚠️ **它为什么单独一个文件**：判据是纯字符串的事，与视图无关；分出来
`tests/source-mark.test.ts` 才能直接测——那几条嵌套边界靠开窗手敲试不全，而它们
恰恰最容易改坏。⚠️ 同批 `source.ts` 只多了一个把结果派下去的 `切换行内标记`。

---

## `src/ui/Sidebar.tsx`（572 行）

左侧栏：**文件树 / 大纲** 两页。`SidebarTab` 就两个值（`"tree"` / `"outline"`），
菜单里那两条（`Ctrl+Shift+3` 文件树 / `Ctrl+Shift+1` 大纲）与这里是同一套。

⚠️ **这一栏的页数改过两次，两次都要知道**：

| 什么时候 | 变成什么 | 为什么 |
|---|---|---|
| 2026-09-22 | 三页 → 两页（第三页「插件」搬到右边，`ui/PluginDock.tsx`） | 这一栏只管**文档导航**，工具面板不跟它挤 |
| 2026-09-27 | 两页 → 三页（补上「文档列表」＝最近打开过的文件，`docs/07` 第 76 项） | 菜单里写着这一项、却是灰的（"键位有、页面没有"） |
| **2026-09-28** | 三页 → **两页**（删掉「文档列表」） | **用户看图点名**：「**<文档列表>这一栏可以删了**」 |

⚠️ 2026-09-28 删的**只是那一页，不是那份列表**：最近打开过的文件仍然在
**「文件」菜单的子菜单**和**主页那一块**上（`ui/recentMenu.ts`、`ui/Home.tsx`），
数据仍由 `ui/useSession.ts` 读宿主侧车。也就是说那一页本来就是同一份数据的
**第三个入口**，删掉它没有任何东西失去落脚点。同批删掉的还有菜单里的
「视图 → 文档列表」与它那个键位 `Ctrl+Shift+2`（**从此空着**）、以及只服务那一页的
一组样式（`.sidebar-list` / `.sidebar-item*`，`src/styles/sidebar.css`）。

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
| `loadDir` | `(path: string) => Promise<TreeNode[]>` | 展开子目录时按需取那一层。⚠️ 它已经带着当前口径（`ui/tree-options.ts`），这一层不用管 |
| `口径键` | `string` | 当前口径的字符串指纹，**只用来判断"已经取回来的那几层过期了没有"**（见下面 `FileTree` 那段） |
| `onClose` | `() => void` | 收起这一栏。**只收不切**（点 × 却把它点开，那种手感无法接受） |
| `onOpenFolder` | `() => void` | 空态那颗按钮，接的是 `App.openFolder`——**和「文件 → 打开文件夹…」同一个回调**，不是另开一条通路 |
| `折叠` | `boolean` | 收起态（2026-09-30 深夜加）。**不卸载**——这一栏在 flex 行里，"宽度从 240 走到 0"那一帧要有元素才画得出来，所以只加 `.sidebar-collapsed` 类、把宽度交给 CSS 那 160ms，同时上 `inert`。⚠️ 它与 `onClose` 是**同一个开关的两面**：`App.tsx` 传的是 `折叠={!sidebarOpen}` |

⚠️ **`plugins` 这个 prop 2026-09-22 拿掉了**——插件那一页搬去了右边的 `PluginDock`。

内部只有 `const outline = useMemo(() => extractOutline(docText, strict), [docText, strict])`。

渲染结构：`<aside className="sidebar">` → `div.sidebar-head`（一个 `role="tablist"` 的
nav + 两个 `TabButton` + 那颗 ×）+ `<div className="sidebar-body">`（按 `tab` 二选一）。
⚠️ **2026-09-30 深夜起，`折叠` 为真时那个 `className` 是 `"sidebar sidebar-collapsed"`**
（`inert` 也一起上）——看着只多了一个类，实质是这一栏**从此一直挂在树上**，
`App.tsx` 那边不再条件渲染（见 `docs/06` §5.44 的帧序列）。

⚠️ **`tab` 2026-09-23 从组件内 `useState` 改成受控**。理由是「视图 → 大纲 / 文件树」
那两个菜单项要能切它，而**菜单栏在 `App.tsx` 里，够不着这里的局部状态**。
改受控之后 Ctrl+Shift+1（大纲）/ Ctrl+Shift+3（文件树）才有落点——⚠️ 那两条快捷键
此前是**死代码**，成因是 `e.key` 与 `e.code` 混用（见 `docs/07` §4 2026-09-23 那条）。

### 私有子组件

| 组件 | props | 行为 |
|---|---|---|
| `TabButton` | `{id, current, onSelect, label}` | `role="tab"` 的 button，`aria-selected` 与 `className` 按 `current === id` 定 |
| `Outline` | `{items: OutlineItem[]}` | 大纲整页（见下）。空时显示"这份文档还没有标题。" |
| `FileTree` | `{nodes, workspace, onOpenFile, loadDir, 口径键}` | 空时显示"这个文件夹里没有 Markdown 文件。"，否则 `<ul className="tree">` + 每项一个 `TreeRow` |
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
- ⚠️ **口径一变，已经取回来的那几层就过期了**（2026-09-28 加）：换排序 / 换过滤 /
  拨开隐藏文件之后，缓存里那份顺序与内容都是按**旧口径**取的。不清的话界面上会出现
  "顶层已经按新规则排了，展开的目录还是旧顺序"——同一棵树里两种排法，看起来像排序坏了。
  落地是一个盯 `口径键` 的 effect：**清掉 `kids` 与 `errors`，再对 `open` 里的每条路径
  重取一次**。
  - ⚠️ **不能只重取"已经在 `kids` 里"的那些**：过滤档从 `supported` 换成 `all` 时，
    新露出来的那些**目录**本来就没有缓存，而无缓存的目录是**不展开**的（`TreeRow` 只在
    `kids[path]` 有值时才往下画）——于是"展开着的目录一个都没重取，新目录一个都不出现"。
  - ⚠️ **清缓存但不收回 `open`**：用户的展开状态与排序偏好无关，为了换个排序把树收回去，
    等于每次改设置都要重新展开一遍。
  - ⚠️ effect 的依赖数组里只有 `口径键`，**没有 `props.loadDir`**：`props` 每次渲染都是
    新对象，而 `loadDir` 的身份也会跟着设置刷新而变——放进去的后果是**每一次设置写入**
    （比如改个字号）之后都跑一遍，把已经展开的十几层目录重新读一次。要读最新那份就用
    `loadDirRef`（那个 `取一层` 的 `useCallback` 只建一次）。
- **目录**画 `<button className="tree-dir-btn">`（三角 `tree-twisty` + 名字，
  `aria-expanded`），展开时递归渲染一层 `<ul className="tree">`；
  **文件**画 `<button className="tree-file-btn">`。
- ⚠️ 绝对路径**只拼一次、只在一处**（`FileTree.openFile` = `${workspace}/${rel}`）。
  早先是每个行组件自己拼，于是"谁拼路径"散在渲染树里，展开子目录时很容易漏掉——
  子节点存的也是**相对工作区**的路径，不是相对父目录。前端不用 `path.join`、
  也不做规范化，靠后端保证的 `/` 分隔相对路径；这是"两份路径规则"的地方
  （后端 `Path::join`，前端字符串相加）。

---

## `src/ui/PluginDock.tsx`（625 行）

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
（这两处都挂了 `eslint-disable exhaustive-deps`，这不是可以随手删的噪声。）

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
📌 **2026-09-25 起有开关了**：每行一个启用/停用，外加「从文件装…」「卸载」「信任」。
⚠️ 开关一动**必须重拉 `list` / `panels` / `menus` 三样**——`PluginHost::生效的()` 是按
"加载成功且用户没停用"筛的，停用（真卸载）之后那家的面板与菜单该一起消失。
⚠️ 「卸载」**不可逆**，所以先问一句；「信任」只对 `unknown` 的显示。

---

## `src/ui/PanelBody.tsx`（849 行）

一串 `PanelNode` → 一串 DOM。**面板内容的渲染层。**

### ⚠️ 这里没有一条路能把字符串变成 HTML

每一块都是**具名 JSX**：文本走 `{text}`（React 自己转义），属性只有 `className` /
`title` / `disabled` 这类**Nota 自己写的字面量**。插件给的字符串**只**出现在子节点位置。

⚠️ 所以"插件往面板里塞一段 `<script>`"这件事**在结构上做不到**，
而不是"在某个环节过滤了它"。真发生过的教训（Folio 那边的 `use-markup` 默认开）
说明：靠"记得转义"不可行，**要让"忘了转义"这件事没有落点**。
⚠️ 这里**没有**（也永远不该有）`dangerouslySetInnerHTML`。

### 两条"不静默"的规矩

| 场合 | 怎么办 |
|---|---|
| `kind` 认不出 | 画一句「不认识这种内容块（kind = …）」**给插件作者看**。静默丢掉的话，他看到的是"我的面板少了一块"，然后去怀疑是宿主没实现还是自己拼错了字段名，而界面上一点线索都没有 |
| 按钮没写 `command` | **画成灰的**，不消失。它摆在那儿本身就是给插件作者看的信号（"我这里少写了一根线"），`title` 里写着原因 |

### 两个细节

- ⚠️ **`key` 用下标是对的**：这一串**没有任何身份**——插件每次渲染给的都是
  一份全新的列表（`render` 每次重跑）。用内容当 key 反而会在两行文字恰好相同时撞车，
  而用下标最坏也只是重挂一次 DOM。**"index as key"在这里不是坏味道。**
- `busy !== null` 时**所有**按钮一起灰（防连点）；`b.label || b.command`——
  只写了命令名没写标签时，拿命令名顶上。

### 2026-09-24 多出来的三种块（`message` / `diff` / `input`）

| `kind` | 画成 | 关键细节 |
|---|---|---|
| `message` | 一条一问一答 | `from = "user"` 靠左、`"ai"` 靠右（**认不出的 `from` 当 `ai`**）；文本 `white-space: pre-wrap` + `overflow-wrap: anywhere`（长词硬折行） |
| `diff` | 一块增删对照 | `op = "del"` 红底 `-`、`"add"` 绿底 `+`（**其它 `op` 当 `add`**）。是 `<pre>`：行首空格**保留**；每行用**悬挂缩进**（`text-indent: -12px`）让折行后的第二行对齐到内容、不顶到 `-` 号 |
| `input` | 输入框 ＋ 发送键 | ⚠️ `arg` / `submit` **缺一个整块就不画**（跟 `prompt` 同一条规矩：问了也送不出去）。`multiline` → `textarea`（回车换行、**Ctrl/Cmd+Enter 发送**），否则单行（回车发送）。**发出去＝调 `submit` 命令、参数 `{ [arg] = 输入 }`**——跟按钮零区别 |

### 2026-09-25 多出来的 `frame`

一块 `<iframe class="panel-frame">`，地址是宿主填的（见 `panel-nodes.ts:
本机地址` 那一节的三条闸）。没地址 / 地址不对 / 不 alive 时**不画框**，
改画一句人话——⚠️ **两种"没有画面"分开说**：地址本身不合法（「预览的地址不对，
嵌不进来。」）与 服务器没在跑（「预览没有在跑。「停止」之后再点一次「预览」试试。」）。
口径与 `ui.rs::面板内容` 那三条报错一致：**都不一样，而且都不退化成空白**。

⚠️ **`input` 的草稿是在结果回来之前清掉的**（`set草稿("")` 在 `void onSubmit(值)`
之前）。看上去反直觉，理由是：那条输入**马上会变成插件的一条消息**，而插件
`nota.ui.refresh` 之后整块面板会重拉、这块输入框会重新挂载。等着结果回来再清的话，
用户看到的是"我按了发送，字还在框里，是不是没发出去"。
⚠️ 代价如实说：**重拉时正在敲的草稿会没**（面板是"每次拉都是新的"的，见下）。

### 文案走 `useT()`

本文件里所有界面字（"不认识这种内容块"、"插件预览"、那两句 frame 的说明…）
都过 `t()`，而且用的是 **`useT()`**——这样宿主报来语言之后这一块会重画。
⚠️ `PanelInput` 是**另一个组件**，它自己又调了一次 `useT()`：hook 不能在两个组件之间
借用（文件头有这一句）。

`prompt` 那一步（以及"取消就什么都不做"这条规矩）**不在这里**，
在 `ui/plugin-prompt.ts`，与插件菜单项那条路共用同一份实现。

---

## `src/ui/panel-nodes.ts`（908 行）

**面板内容的形状判据**：宿主发来的那份 JSON 在这里被收成 `PanelNode[]`。

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

### 十六种 `kind` 与它们的字段

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
| `input` | `arg`, `submit`, `submit_label`, `placeholder`, `hint`, `multiline` | 2026-09-24。⚠️ 与 `提示()` 不同：**缺 `arg` / `submit` 时块还在**（画一个禁用的框），因为"少写了一根线"要比"整块消失"好查 |
| `heatmap` | `title`, `unit`, `days`, `to`, `weeks` | 2026-09-27。一格一天的热力图（写作统计的长期那本账）。⚠️ `days` 是**一个字符串**（宿主那个 200 的上限逼的）；格子位置在 `ui/heatmap.ts` 算、这里只画 |
| `frame` | `url`, `alive`, `height` | 2026-09-25。**嵌一块本机开发服务器的画面**（全屏演示/演讲者视图用不了，那些只有真浏览器有）。⚠️ 见下 |
| `graph` | `items[{art, text, bond, pick}]` | 2026-09-26。一棵**提交树**（git 插件）。⚠️ **唯一一种"一行的两头各是一颗可点的东西"**；`art` / `text` 是**字符串**（由 React 转义，不是 HTML） |
| `chart` | `value`, `unit`, `label`, `caption`, `points`, `xTicks`, `yTicks` | 2026-09-26（`xTicks` / `yTicks` 是 **2026-09-27** 加的）。**一块会动的数字与曲线**（写作统计）。⚠️ `value` 是**字符串**不是数（怎么格式化是插件的事）；`value = ""` ＝ 这一格没数（画破折号，不是画 0）；`points` 是**纯数字数组**不是坐标对；**少于两个点不画曲线**；最大值＝最小值时摆中线。⚠️ **横刻度只有插件标得出来**（一个点对应哪一刻是插件定的），**纵刻度通常不用写**——不写时前端按 `points` 的极值推三档（`ui/chart-ticks.ts`），只有"纵轴不是数据本身"的图才写 |
| `cards` | `title`, `items[{icon, value, unit, caption, points}]`, `total[{label, value, unit}]` | 2026-10-04。**一串记录卡**（写作统计）——版式出自用户给的两张运动手表「运动记录」截图：一条记录一个圆角框（圆图标 ＋ 大数 ＋ 小字），框底下那行是**汇总**。⚠️ `icon` 只认 `round` / `today` / `long` / `doc` / `record`，**认不出的画成秒表**；`value` / `unit` / `caption` 与 `chart` 同规矩（`value` 是**字符串**，空串＝破折号）；`points` 是**纯数字数组**（同 `chart`），画成 36px 高的**窄曲线**、**没有刻度**，少于两个点不画。⚠️ `total` **不是各条之和**（区间互相包着），`title` 空串时**不画小标题**但汇总照画（那是空记录屏上唯一的数） |
| `share` | `title`, `subtitle`, `date`, `label`, `value`, `unit`, `points`, `xTicks`, `stats[{k,v,small}]`, `foot`, `file` | 2026-09-27。**一张分享卡**（写作统计）。⚠️ 插件**只给字段**，一个像素都不画——画的是 `ui/share-card.ts`（1080×1350 SVG），**同一个函数**再光栅化成 PNG 存盘/进剪贴板（"画出来的是哪张、存下去的就是哪张"）。⚠️ `value` 空 → 破折号；`date` / `foot` 空 → 那两处不画（拿不到时间来源时就是这个样子）。⚠️ `stats` **最多三格**（版式就是三格，多的丢掉）；`file` 只是**建议名**，渲染层还要消毒一遍。⚠️ **两条轴都有刻度，但来源不同**：横轴的 `xTicks` **插件给**（只有插件知道序号对应哪一刻），纵轴**宿主自己推**（`share-card.ts` 里那份 `纵刻度()`，和面板那份 `chart-ticks.ts::推纵刻度()` 是**两份**、别指望改一处两边都对）——卡片那条曲线被幂函数压过（`pow(比, 0.42)`），所以刻度落在非线性的位置上、但每一条标的是**真值**（像对数轴）。⚠️ 它与 `chart` 是**两份代码**（面板跟着界面缩放，卡片固定尺寸），不是同一个东西的两处调用 |
| `unknown` | `raw` | 认不出的 |

#### ⚠️ `frame` 是本仓唯一一处"把外部内容嵌进 DOM"

所以口子开在这儿、**也只开到这么大**：

- `url` **只能是宿主填的**。插件在自己的 `render` 里写 `url` **没用**——宿主会把它抹掉，
  再按"这个插件自己那场会话"填（`lua/api/devserver.rs::填_frame`）。
- 这里**再判一次**不是为了防插件，而是因为这份 JSON 也可能来自别处（手改过的数据、
  测试、以后别的前端入口）：只认 `http://localhost:…` / `http://127.0.0.1:…`，
  别的当"没有地址"。
- `src-tauri/tauri.conf.json` 的 CSP 里 `frame-src` **只列了这两个前缀**，
  别的地址**浏览器那头也不认**——两道闸，不是一道。
- `height` 有夹取范围（120–2000），`alive` 由宿主给。

**`tone`** = `normal` / `muted` / `success` / `warn` / `danger`，
⚠️ **外加三个别名**：`info` → `normal`、`error` → `danger`、`warning` → `warn`。
收别名是因为宿主的通知层级用的是 `info`/`error`/`warning`（`ui.rs::normalise_level`），
插件作者很容易照抄过来——**一个 `tone = "info"` 变成静默的 `normal` 是查不出来的**。

**`style`** 只认 `primary` / `danger`，其余一律 `normal`。
**`disabled`** 只认严格的 `true`。

⚠️ 本文件还各设了一道上限，**和宿主那三道同量级，但各自把关**
（宿主那道防"插件写坏"，这一道防"数据被动过"）：

| 常量 | 值 | 与宿主的关系 |
|---|---|---|
| `每块上限` | 200 | 对应 `ui.rs::面板节点上限` |
| `文本上限` | **4000** | 对应 `ui.rs::面板文本上限`（**20000**）——⚠️ 这一道是**兜底**，宿主已经截过一刀 |
| `消息上限` | 20000 | `message` 块专用，**与宿主对齐**：一条消息就是一段完整回答，4000 字会从中间劈掉 |

⚠️ **文案走 i18n**：本文件里的界面字（"不认识这种内容块"那类）都过 `t()`——
所以它 `import { t } from "@/i18n"`。⚠️ 用模块级的 `t`（不是 `useT()`）是**刻意**的：
这里全是纯函数，拿不到 context（见 `i18n/index.ts` 文件头那段）。

---

## `src/ui/share-card.ts`（458 行）

**分享卡那张 1080×1350 的 SVG**（2026-09-27 新增）。写作统计把它自己的数据交给
宿主，宿主画出这张能发出去的图（`docs/07` 第 65 项第三轮）。

### 分工：插件说**什么**，宿主说**怎么显示**

插件那块 `kind = "share"` 里只有字段（标题、大字、三格指标、点、横刻度、建议文件名），
**一个像素都不给**；版式、配色、标识全在这里。理由同 `PanelChart`：怎么格式化、
怎么排版是渲染层的事，写进插件就意味着每个插件都要重抄一遍品牌规范。

### ⭐ 四条口径（改之前先看这里）

| # | 口径 | 为什么 |
|---|---|---|
| 1 | **横轴刻度由插件给，纵轴刻度自己推** | 曲线上一个点对应哪一刻只有插件知道（心电图一秒一点、git 一次提交一点）。⚠️ 纵轴被 `pow(比, 0.42)` 压过，所以刻度落在**非线性**的位置上、但每一条标的是**真值**——像对数轴，不是骗人的刻度 |
| 2 | **0 个点连轴都不画；恰好 1 个点照样画两条轴** | 点需要框才看得出是"一个点"。要避免的是**画出一条假的"匀速"直线**（把 0 个点连起来）；1 个点不会连出线来 |
| 3 | **标识是从 `src-tauri/icons/nota.svg` 读进来再嵌的**（见下一节） | 外链 SVG 进不了 canvas（`toBlob` 会抛），而且图标改了分享图不跟着变 |
| 4 | **`安全文件名()` 先只留路径最后一段，再消毒** | 顺序反了会写到一个隐藏文件上（`.png`）：`""` 与 `"..."` 都消毒成了空串 |

### ⚠️ 版式是**移植**，不是重新设计

出处是用户看过的设计稿：`plugins/stats/design/分享图-深色.html` / `分享图-浅色.html`
（1080×1350，连那条 `pow(v/MAX, 0.42)` 的曲线也在那份 HTML 里）。那些坐标都是照
那份 CSS 量的——**改版式请连着设计稿一起改**。

⚠️ **两处是设计稿上根本没有的**（用户 2026-09-27 点名要的）：**横轴刻度**与**纵轴刻度**。
为了放纵刻度，图区左边让出 60px、曲线高度从 340 收到 320（下面那排横轴标签要地方）。
⚠️ 设计稿页脚那句「Nota · 专心写作」**没上**：
一句话只能有一种语言，而插件给的 `foot`（「这一轮，你写下了 1284 个字」）是会翻译的。
⚠️ 还有一处**不算差异、是照设计稿改回来的**：设计稿在 CSS 里给副标题加了
`text-transform:uppercase`，而 SVG 不认那个属性——所以转大写必须由**渲染这层**做
（见下）。

⚠️ **强调色 2026-09-27 起跟随用户自己的主题色**（用户当天两句话：「分享卡颜色强调是跟随
自己的主题」＋「可以稍微调整一下，视觉上美观就可以」）。链路是
`当前卡色()` → `styles/accent.ts::界面强调色()`（读 `--accent` 的计算值）→
`卡片主色(强调色, 深底)`：**只挪亮度**（HSL 的 `L`），色相与饱和度一律不动——
把一个橙调暗是必要的，把它调成另一个色相就是"没跟随"了；下限 `0.20` / 上限 `0.28`
两个数是**照着设计稿那两个值定的**（深 `0.246` / 浅 `0.145`，一个都不用动）。
⚠️ **设计稿那两个常量还在**（深 `#4f82fb`、浅 `#2f63d8`），但角色变了：它们是
**`--accent` 读不到时的落点**（纯 `vite` 开着看页面之类）。⚠️ 它们**不是同一个值**，
2026-09-27 目检前这里两套都写成了浅色那个，深色卡的大数字与曲线比设计稿暗一档；
`tests/share-card.test.ts` 有一组专钉这件事。⚠️ 「跟主题色」这条**替补掉了**原先那条
"待用户拍板的边界"（`docs/10` §11.2）。

⚠️ **副标题是在渲染这里转大写的**（`卡.subtitle.toUpperCase()`）：设计稿那句副标题靠
CSS 的 `text-transform:uppercase`，而 SVG 的 `<text>` **不吃** `text-transform`
（SVG 1.1 没这个属性），照原样送就少了那一档。插件继续送人能读的 `Writing Stats`——
将来真翻译成中文时，转大写是个空操作。

### 尺寸与坐标（改版式时的唯一一张底稿）

页 1080×1350；图左 140 / 图右 1000 / 图上 551 / 图下 871 / 图内边 8 /
页脚线 1226 / 页边 80。纵刻度标签**右对齐**在 `图左 − 16`、基线 `+7`；
横刻度在 `图下 + 34`，横锚按位置取 `start` / `middle` / `end`。

⚠️ `纵位置` 会**四舍五入到 1 位小数**：不圆的话 SVG 里会出现
`y="642.7829142074893"` 这种坐标（白占字节），而且同一处的线与标签可能差半像素。
⚠️ `曲线段` 那条 `y1` **不再 `.toFixed(1)`**（值已经在 `纵位置` 里圆过）。

### 配色：**底色**跟界面的明暗，**强调色**跟用户的主题色

它是一张 `<img src="data:image/svg+xml,…">`，**继承不到任何 CSS 变量**，
所以深浅两套底色是这里的常量，由 `当前卡色()` 读 `<html data-ui-mode>` 决定用哪套
（`PanelBody.tsx` 拿一个 `MutationObserver` 盯着那个属性，理论上开着面板切明暗也会跟着换）。
⚠️ 是 `当前卡色()` 不是 `useCardPalette()`——**有过那么一个名字，后来并进这一个函数了**，
文档里出现过旧名，以代码为准。
⚠️ **两条轴本来是三件事里的两件，别混**：① **明暗**决定**整套底色**用哪一半（设计稿就是
深浅各一份）；② **强调色**（大数字与曲线）2026-09-27 起**跟用户自己选的那条轴走**
（`styles/accent.ts::卡片主色`，只挪亮度），见上面那一节；③ 那两份常量本身
（`#4f82fb` / `#2f63d8`）**只在 `--accent` 读不到时兜底**。

### 与光栅化是**同一个函数**

预览里那张、存盘那份 PNG、进剪贴板那份，全都是这一个 `分享图SVG(spec, 色)` 的输出
（图 → `<img>` → canvas → `toBlob` → `toDataURL` / `btoa` → IPC）。
"看到的就是存下去的"这条**靠结构保证**，不靠人检查两处画得一样。

---

## `src/ui/nota-mark.ts`（99 行）

**把 Nota 的标识嵌进别人的 SVG**（2026-09-27 新增）。

### 为什么是"读进来再嵌"，不是"照着再画一遍"

图标的手写源只有一份（`src-tauri/icons/nota.svg`）。分享图上要用它，就得让它进到
**同一张 SVG** 里——`<img src="…">` 那条路有两个坑：**外链的 SVG 进不了 canvas**
（画上去会把 canvas 弄脏、`toBlob` 直接抛），就算不脏，图标是另一份文件、
将来改了分享图不会跟着变。所以走 Vite 的 `?raw` **当字符串读进来**：去掉 XML
声明、注释、外层标签，再拼成 `<svg x= y= width= height= viewBox=…>` 片段。
**改图标只需改那一份 `.svg`**。

### ⚠️ 同一张图上两个实例，id 必须带前缀

图标里那三个渐变（`tile` / `sheet` / `fold`）是**按 id 引用**的，而一张分享图上要放
**两个**图标（顶上一个、页脚一个）。同名的 id 在同一份文档里浏览器**只认第一个**
——两个图标恰好长得一样，所以表现上看不出来，但那是运气不是设计。

⚠️ 只改 id 与 `url(#…)`，别的字节不动：几何、颜色、渐变方向都不该由这个文件说了算。
⚠️ 坐标系是 **1254×1254**（照原图像素量的），不是常见的 1024——别"顺手改成整数"。

### ⚠️ 那个裁剪框

图标自己画了"圆角底衬 ＋ 四周留白"（底衬只占画布 74%）。直接嵌进深色卡片上会是
一个**白色方块**——留白那圈是白的。所以外面套一个 `<clipPath>`，裁剪框**就取底衬
那个圆角矩形**。

⚠️ 底衬那几个数是**抄的一份**（`rect x=167 y=155 width=920 height=948 rx=250`）。
这是有意的取舍：图标改了几何，这里的裁剪框就会错位——而错位的表现是"图标缺一个角"，
一眼看得出来，不会静默。

---

## `src/ui/chart-ticks.ts`（118 行）

**图上的刻度**：横纵各摆哪几档、每档写什么字（2026-09-27 新增，用户：
「另外横纵坐标的刻度要标，现在是没有的」）。在那之前，那块曲线只有一条线和一层
填色——**能看出"起伏"，但读不出"多快"**：峰值是 12 还是 120，图上一模一样。

### ⚠️ 两条轴的分工不一样，这是刻意的

| 轴 | 谁说了算 | 为什么 |
|---|---|---|
| **纵**（值） | **这里推**（取这一段的极大/中/极小） | 曲线的纵轴就是 `points` 自己归一化的，上下界**只有数据知道**，插件再报一遍只会多一处能对不上的地方 |
| **横**（时间） | **插件给**（`x_ticks`） | 横轴是**序号**，而序号对应哪一刻只有插件知道（心电图一点是一秒、git 的图一点是一次提交） |

⚠️ 所以「横轴没刻度」在插件没写 `x_ticks` 时是**正常状态**，不是坏掉：硬画一排
0、1、2 只会让人以为那是有意义的数。

### ⚠️ 分享卡上的刻度是**仪器的标尺**（2026-09-27，用户点名）

用户原话：「那个刻度我想做成像是仪表标尺那样」＋「如果是全天的话，那就一个小时为一个
单位的横坐标标尺」＋「到小时就用稍微大一点的字体标出来是几小时」。三句话落成三个字段：

| 字段 | 谁给的 | 这里怎么画 |
|---|---|---|
| `x_ticks` | 插件 | 主刻度：一根竖线 ＋ 一行字（位置是 `at`，0~1） |
| `x_ticks[i].大单位` | 插件 | **只认 `=== true`**：这一档的字号从 24 涨到 30（颜色不变，仍然是弱色）。⚠️ 其余任何值（`1`、`"true"`）都当没给——**少一个大字比多一个大字好排查** |
| `x_minor` | 插件 | 两档主刻度之间再切几小格（**只有线、没有字**）：`Math.floor` 后夹在 0~10 |

⚠️ **"大单位"为什么不让插件给字号**：字号是版式，版式在这里（卡片 1080×1350 是定死的）；
插件连"这张卡上有几档"都只知道个上限。它报**语义**（"这一档是个整点"），这里决定**多大**
——和"宿主不认识 Markdown"是同一条分工。

⚠️ `x_minor` 是"密度"不是"数"：没有小格时，两档之间是一片空白，读不出这两档离得多近
（一档是 5 分钟还是 50 分钟，图上一样）。一格代表多少**只有插件知道**，所以格数是插件给的；
线多长、多粗是这里的（`曲线段` 里那截 `细格`）。

⚠️ **分享卡那一版的上限与图表那一版不一样**：`读刻度(raw, 上限)` 默认 8 档（面板上的
`chart` 块用默认值），分享卡传 **13**——卡片宽得多，8 档会显得空。两处共用同一个函数，
所以那个上限是参数，不是常量。

### 位置用 **0~1 的比例**，不用像素

面板宽度会变（260px 一栏 / `wide` 面板 / review 摊进编辑区），画布也跟着缩放
（`preserveAspectRatio="none"`）。用比例摆刻度，渲染层再乘以实际宽高，缩放不用改
这里一个数。⚠️ 面板那边**不能用 SVG `<text>`**：那个 `preserveAspectRatio` 会把文字
一起拉变形，所以刻度只能是**叠在上面的 HTML 覆盖层**——这条是面板特有的约束。

### 三条容错（都是"坏项丢掉、不报错"）

坏项丢掉**但不补齐**（补一档等于替插件编一个位置，比少一档更难发现）·
`at` 夹在 0~1（越界的刻度看不见，而"没写"比"写了个越界数"好排查）·
最多 **8** 档、每档最多 **12** 字（防"插件把一整句话塞进刻度里"）。

### ⚠️ `格式化数` 有一条**差十倍**的旧账（改它之前先看这一段）

「按量级定小数位、末尾的零去掉」这条规则里，去尾零那一步**只对小数部分成立**：
三位数以上不留小数（`toFixed(0)`）时，那条正则 `\.?0+$` 去掉的是**整数末尾的零**——
`(109.5).toFixed(0)` 是 `"110"`，去尾零就成了 `"11"`。👉 **症状不是"字难看"，是刻度上
的数差十倍**：一条标着 11 的线其实在 110，而图还是那张图、**没有人会去怀疑刻度**。
2026-09-27 开窗看分享图纵轴时发现（那一段的数据正好是"峰值 200、谷值 19"⇒ 中线 109.5），
现在 `tests/chart-ticks.test.ts` 有一组四条专钉它（109.5 / 100.04 / 1000.2 / 负号那一侧）。
⚠️ 它是**默认参数**上的一个坑：`推纵刻度` 与卡片的 `纵刻度` **都走这一个函数**，
所以这个函数错了，面板与卡片会**同时**错、错法一模一样。

### 与 `share-card.ts` 的关系：**共用两个函数，不共用推法**

`share-card.ts` 从这里 import `格式化数` 与 `刻度` 类型（"一个数写成刻度上那几个字"
的规则只该有一份），但**纵刻度的推法两边各写各的**——卡片的曲线被 `pow(比, 0.42)`
压过，刻度落在非线性的位置上，`推纵刻度` 那套等距的档位在卡片上不成立。

⚠️ 两边的**降级形状一样**：极大＝极小时**只给一档**（`推纵刻度` 摆在中线、卡片摆在
`纵位置` 上，见下）。给两档相同的数字会让人以为上下差着点什么。

⚠️ **只有一个点的那一档不在正中间，这是算出来的、不是摆歪了**：卡片那边 `跨 = 大 − 小 = 0`
时 `比` 取 `0.5`，再过一次 `pow(0.5, 0.42) ≈ 0.747`，于是点与那一档标签一起落在图区
**从上往下 74.7%** 的位置（1080×1350 的卡上是 y ≈ 636）。2026-09-27 开窗量过（§5.32）：
点和标签**重合**，也就是"刻度和数据是同一个映射"，这一点是对的；**只是这一个点看着
有点靠下**。⚠️ 一个点本来就没有"该多高"的判据（`跨 = 0`），要不要特判成中线
**是个审美决定**，记在 `docs/07` 第 65 项等拍板，别默默改。

---

## `src/ui/heatmap.ts`（256 行）

**长期记录的热力图**（2026-09-27 新增）。用户原话：「加一个功能，类似 Contribution
Graph 那样的热力图，记录长期数据。仅记录打字数」——所以是**一格一天**的小方格，
横着排周、竖着排星期几，格子的深浅表示那天敲了多少字。

### ⚠️ 它**只算格子的位置，不画**

和 `ui/chart-ticks.ts` 是同一条分工：**插件说数据、这里说版式、`PanelBody.tsx` 画**。
热力图上没有数字也没有坐标，格子错一格**没有任何肉眼可见的症状**——把 9 月 3 号的
1200 字画到 9 月 2 号那一格上，图还是那张图，只是**读出来的每一天都是错的**。
把"哪一格是哪一天"从 React 里摘出来，正是为了这件事能单独跑测试
（`tests/heatmap.test.ts` 20 条，⚠️ 那份要 `--alias:@=./src`，因为它要问"界面在说
哪种语言"）。

### 三条口径

| 口径 | 为什么 |
|---|---|
| **一列 = 一周，从周一起** | Contribution Graph 的形状就是这么来的；从周日或周一起**每周的错位都不一样**，用户按周看自己的习惯时会对不上 |
| **最后一列到"止"那天为止，下面留空** | 今天才周三，后面四格还没到——把它们画成"0 字"是**替用户编数据**（"没写"和"还没到"是两回事） |
| **缺的那些天当 0，不当"没有"** | 热力图回答的是"最近勤不勤"，**空白格正是答案的一半**（连着两周没动笔，图上就该是一片浅色） |

⚠️ 它**不认识"今天"**：右端由插件给的 `止` 定（同"插件说数据"那条分工，测试也就不必
跟系统时钟赛跑）。⚠️ 列数夹在 **8~53**（太少看不出习惯、太多一屏塞不下）。
⚠️ 记录走**一个字符串**（宿主那条 `面板节点上限` = 200，插件**不能一天发一项**，
格式与解析都在 `读热力记录`）。⚠️ 月份标签（`9月` / `Sep`）走 `Intl`、语言取全局那
一份——**不写死「月」**，这张图是要发出去的。

---

## `src/styles/heatmap.css`（83 行）

**热力图那一块的皮**（2026-09-27 新增）。⚠️ **另开一份是因为 `dock.css` 当时 971 行、
顶着 1000 行硬线**（同 `share.css` / `marks.css` 那两次拆的理由）。

⚠️ **列宽是弹性的**（`flex: 1`）：面板那一栏能从 260px 拖到 `wide`，写死像素的话
拖宽之后整块图缩在左上角。⚠️ **格子深浅走 `color-mix` 兑透明、不写死五个颜色**——
同 `dock.css` 的 `.pg-row.is-picked` 那条：兑透明才不会被"底色深浅"两套吃掉
（界面有 8 风格 × 2 明暗）。

---

## `src/styles/share.css`（61 行）

**分享图那一块面板的皮**（2026-09-27 新增）：`.panel-share` / `.panel-share-img` /
`.panel-share-actions` / `.panel-share-note`。⚠️ **另开一份是因为 `dock.css` 当时
961 行、贴着硬线**（同 `marks.css` 那次拆）。

⚠️ **卡片自己的配色不在这里**——那张 SVG 塞在 `<img>` 里，**继承不到任何 CSS 变量**，
配色由 `PanelBody` 的 `useCardPalette()` 读 `<html data-ui-mode>` 决定（用户要求
「分享卡跟随主题色」）。⚠️ 它要在 `dock.css` **之后**加载（借那边的 `.panel-btn`）。

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
里有没有它的 id"（没有就灰）。静默丢掉的话，插件作者看到的是"注册的菜单项不见了"，
而界面上没有任何线索。

### id 是**合成**的，走 `resolvePick` 那条老路

| 前缀 | 用在哪 |
|---|---|
| `__plugin:` | 认得的（`menu === "plugins"`），`__plugin:<插件 id>:<命令名>` |
| `__plugin-unplaced:` | 无处安放的：`__plugin-unplaced:<插件>:<menu>:<命令>` |

⚠️ 两个前缀**故意不一样**：同一个插件的同一条命令，若同时以两种 `menu` 值声明
（合法的——去重看的是标签），用同一个 id 就是 React 的重复 key，
也是 `disabledCommands` 那张集合里两条冲突。加上这一截就永远不会撞。

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
这件事里有一条**容易写错、错了还不报错**的规矩——**用户取消时不执行任何动作**，
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
| `null` | **用户取消了，调用方不执行任何动作** |

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

## `src/ui/usePlugins.ts`（450 行）

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
| `信任` | 信任库里那几把钥匙。⚠️ **必须给用户看得见**：信任按**指纹**判，而指纹只有"对着作者公布的那一份核一遍"才有意义 |
| `menus` | `MENUS` ＋ 插件那一栏。⚠️ 身份**稳定**（`useMemo`），下游牵着"每渲染重推一次原生菜单"那条 effect。⚠️ 依赖是 `[菜单项们, 语]`——**语言也在里面**（2026-09-26 加）：插件那一栏后缀「想挂到别的栏」那句话是**在这儿翻好的**，语言换了不重算就还是旧语言。同一条理由见 `useMenus.ts` 推原生菜单那个 effect |
| `handlers` | 插件菜单项 → 实现，键是合成的 id。**直接并进 `App.tsx` 的 `menuHandlers`**，于是"灰不灰"的判据对插件项和普通项是**同一条** |
| `调` | 跑一条插件命令 |
| `动作` | 「插件」页上那几颗按钮（装 / 卸 / 启停 / 信任 ＋ `忙`）。⚠️ **动作在这里实现、在 `PluginDock` 里画**——那一栏是纯展示组件，装/卸要弹文件框、要问确认、要弹 toast，都不该塞进它 |
| `review` / `收预览` | 编辑区里**此刻**摊着哪一块（2026-09-25 加），以及收起它。⚠️ `review` 是**拉**来的（挂载后拉一次 ＋ `events.pluginReview` 到了再拉一次），`App.tsx` 据此决定主区画正文还是画预览 |

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

文件头：布局分两区：左边是标识 + 三个大动作，右边一列是插件状态。
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

## `src/ui/StatusBar.tsx`（412 行）

状态栏。**2026-09-30 照 Typora 整个重做过**（用户原话「修改下栏逻辑。这是 Typora。
其中左边圆圈是显示/隐藏侧边栏；第二个是切换代码/所见即所得模式。右边一个极简的
统计 token 的显示区」；同日晚用户又拿着五张图说「再修改一下底栏的逻辑」）。

- **左手**：两枚开关——侧栏开合（关着＝空心圆圈 `nota-sidebar-toggle-symbolic`、
  开着＝左向折角 `nota-sidebar-collapse-symbolic`）与源码 ↔ 所见即所得（`</>`，
  源码模式时点亮）。⚠️ 源码那颗在**分屏**下不亮（它的语义是"是不是源码"），点它从分屏进源码。
- **右手**：**一个数** —— 那一格平时只显示一个统计量（图1 是 `0 词`），
  **指针进到这条栏里**才在它两侧补上两颗按钮（图2：`A✓  0 词  ⌄`）：
  `A✓` 开「选择拼写检查语言」菜单，`⌄` 开「字数统计」菜单（图4 四项各带当前值，
  点一项就把那一格换成它）。悬停只显形、不画另一种样子，判据在 `styles/tabs-status.css`
  的 `.status-aux` 上。
- 强制专注余额那一格（`ui/FocusMeter.tsx`，**只在跑着时出现**）。

⚠️ **删掉的显示**（用户答「其余全删」）：文件路径、`● 已修改`、模式名、`严格`、
字符数、行数、「约几分钟」——**数一个没少**，只是各自有落点：`● 已修改` 进了窗口标题
（`ui/useWindowTitle.ts`）、路径本来就在标签页和标题里各有一份、那四个数全在
「字数统计」菜单里。

⚠️ **它自己不存任何状态**（文件头那段"不要第三个真相"）：侧栏开合住在 `App.tsx` 的
`sidebarOpen`、模式住在 `settings.view_mode`、显示哪一个统计量住在
`appearance.status_metric`、拼写开关住在 `editor.spellcheck`，这里只画形状、
把点击原样交出去。读写的接线全在 `ui/useStatusBar.ts`（它在 `App.tsx` 里调用一次，
`{...状态栏接线}` 铺进来）。

### props

| prop | 类型 | 用途 |
|---|---|---|
| `doc` | `Document \| null` | `null` → 只渲染两颗按钮 ＋ 强制专注那一格（**BUG-45**，见下），**不画统计量那一组** |
| `mode` | `ViewMode` | 当前编辑模式（决定源码那颗亮不亮） |
| `sidebarOpen` | `boolean` | 决定侧栏那颗画空心圆还是折角 |
| `focus` | `FocusState \| null` | 强制专注的余额。⚠️ **不在这里订阅**——订阅是 `App.tsx` 那一层做的（菜单项也要它），在这里再订一次就是同一个事件两个听众 |
| `readingSpeed` | `number` | 「约几分钟」那个除数（`appearance.reading_speed`），与设置页同一格 |
| `metric` | `StatusMetric` | **那一格平时显示哪一个统计量**（`appearance.status_metric`） |
| `spellcheck` | `boolean \| null` | 拼写检查开关的当前值。`null` = 设置还没读回来，菜单里两项都灰 |
| `onPickMetric` / `onSetSpellcheck` / `onToggleSidebar` / `onToggleSource` | 回调 | 四个开关的写回，**实现全在 `ui/useStatusBar.ts`** |

### 那两份文案

`const counts = useMemo(() => countText(doc?.text ?? ""), [doc?.text])` 给出四个数，
`四个: Record<StatusMetric, string>` 把它们**翻好**存起来（四项的文案键是
`{0} words` / `{0} characters` / `{0} lines` / `{0} minutes`，`菜单次序` 是
`["minutes", "lines", "words", "characters"]`，即图4 的排列）。

⚠️⚠️ **为什么是"翻好存起来"而不是"存键、用时再翻"**：`tools/i18n-check.sh` 扫的是
代码里的**字符串字面量**。把四个键收进一张表、用的时候 `t(表[m], 数)`，那四条就
**从检查器眼里消失了**——中文表里对应那四行会被判成废键、整个闸门 FAIL。**实测踩过一次**。
`tests/status-metric.test.ts` 第三组有一条专门钉这件事。

### `doc === null` 那一支

⚠️ **也要画 `focus`**（**BUG-45**，2026-09-27 修）：原来那一支直接 `return` 了一个
只有「就绪」的栏，于是**主页开着强制专注时余额一个字都看不见**——而 `ui/FocusMeter.tsx`
头上写着「看不到余额这个功能就不成立」，菜单里那条又**任何时候都能点**。判据是
「**这一格说的是"应用在替你记什么账"，不是"这份文档有多少字"**」：所以它跟着
`focus.running` 出现，**不跟着 `doc` 消失**。两颗按钮也照画（侧栏开关在主页上有用）。
「就绪」两个字 2026-09-30 删了。

### 那个小菜单

`MenuPopup`（见上）复用，锚点是自己搭的零高度 `.status-menu-anchor`（`styles/tabs-status.css`）。
⚠️ **它是往上弹的**：这条栏贴着窗口底边，照菜单栏那套往下弹就是弹到窗口外面去——
锚点量的是**底栏顶边**，`.menu-popup` 那条 `bottom: calc(100% + 5px)` 出来才是"这一栏的上面"。

⚠️ **「选择拼写检查语言」菜单里只有两项**（`自动检测语言` ＝ 开 / `不使用拼写检查` ＝ 关）：
用户图3 是一个很长的语言列表，**那一份故意没做**——WebKitGTK 没有"枚举已安装词典"的
接口（`commands/webview.rs` 只暴露开/关），摆一串点不动的语言名就是画饼。
⚠️ 这个缺口与"要不要自己带一个拼写引擎"那条轴是同一件事，还在等用户拍板。

⚠️ 字数取自 `doc.text`，也就是**后端镜像**（300ms 滞后）。快速打字时状态栏的数字会比
屏幕上少一点点。

---

## `src/ui/useStatusBar.ts`（108 行）

**状态栏那一堆 props 的接线**（2026-09-30 晚从 `App.tsx` 搬出）。那次不是因为"看着不顺眼"：
加完那两颗按钮之后 `App.tsx` **1003 行**，越过了 `tools/doc-sync-check.sh` 那条 1000 行硬线；
而这一块**正好是一个完整的职责**——它回答的全是同一个问题：
**"界面上这几个开关，各自读写设置里的哪一格"**。

⚠️ **它一个 `useState` 都没有**。返回的每一项都是从上头的 `settings` / `viewMode` /
`sidebarOpen` 现算的——这正是 `StatusBar.tsx` 那条"不要第三个真相"在这一层的落法。
⚠️ 哪天有人在这里加一个 `useState` 来"记住上次选的是哪个"，那条规矩就破了：症状是
"菜单里选了，勾也动了，重开又变回去"（或者反过来，界面上是新的、设置文件里是旧的）。

⚠️ 两条写回 patch 都**先把那张表铺开**：`updateSettings` 只做**顶层**浅合并，
`{ appearance: { status_metric } }` 会把 `appearance` 里另外十几格一起抹掉
（同一个坑 `ui/useChromeVisibility.ts` 里也标着）。两条里各判一次空而**不是用 `!` 断言**：
设置没读回来的那一瞬间点一下，断言的症状是当场炸。

⚠️ 返回值的类型是 `ComponentProps<typeof StatusBar>`——**不是手抄一份 props 类型**。
手抄的那份迟早与组件分家，而分家的症状是 `tsc` 在这边**不报错**（多一个少一个它都
看不出来，两边各自自洽），只在运行时表现为某个开关点了没反应。写成"从组件取"之后，
给 `StatusBar` 加一个必填 prop，**这里当场就红**。

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

⚠️ 这条早期版本写的是"与 `App.tsx::closeDoc` 里的 `window.confirm` 口径不一致"——**那一句两句都过期**：`closeDoc` 早已搬去 `ui/useDocuments.ts`，而且用的是**自绘**三选框（阻塞式原生框会打断输入法组合态，`docs/04` 记了理由）。

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

## `src/ui/settings/`（两个文件 + `panes/` 目录）

**偏好设置。这是界面那三条轴（风格 / 明暗 / 主题色）唯一的切换入口**——⚠️ **主题色
也在这一页**（「外观」页，2026-09-26），别以为它跟文档主题一样在菜单里；
**文档主题那一条轴在菜单栏「主题」里**（见 `MenuBar.tsx`），不在这页的编辑范围内。

| 文件 | 管什么 |
|---|---|
| `SettingsDialog.tsx` | 壳：遮罩 + 左栏（搜索 / 十一页 / 「完成」）+ 右栏 + `Esc` 与点遮罩关闭。十一页的顺序在 `ORDER`，图标在 `SECTIONS`，名字在 `页名` |
| `primitives.tsx` | 行、组、各个控件、搜索上下文（`QueryProvider` / `useQuery` / `hits()`）。⚠️ 图标不在这里——2026-09-24 起全部来自 `ui/Icon.tsx` |
| `panes/` | 十一页内容，一页一个文件（2026-09-24 从单文件 `panes.tsx` 拆出）：`FilesPane` / `EditorPane` / `ImagePane` / `MarkdownPane` / `ExportPane` / `AppearancePane` / `DocThemePane` / `ShortcutsPane` / `GeneralPane` / `FocusPane`；另加 `ImageUploadGroup.tsx`（**不是一页**，是「图像」页里的一组）与 `props.ts`（十页共用的 `PaneProps` 与 `paneWriter`）。⚠️ `EditorPane.tsx`（设置那一页）里的 `VIEW_MODES` / `LINE_ENDINGS` 两张表 2026-09-26 **从模块级搬进了组件体**并逐条 `t(...)`——留在模块级时英文界面下那几个下拉项还是中文（模块级求值时语言还没定，而且没有东西会通知它重画）；`LF（\n）` / `CRLF（\r\n）` 这两个标签因此也成了**键** |
| `panes/ShortcutsPane.tsx` | 快捷键一览（只读） |

### 版式：照 VMark 的偏好面板抄

用户 2026-09-23 的要求：「你将那个偏好列表搞得和 Vmark 一样的布局」。
参考源码在旁边 `../vmark-ref/src/pages/settings/`（ISC，见 `docs/10` §11.3）。
**抄的是结构**——左栏分节清单 + 右栏「左标签右控件」的行，不是像素：

```text
┌──────────────┬────────────────────────────────────┐
│ [搜索设置…]  │  外观                              │
│ ▸ 文件       │  界面风格            [下拉 ▾]      │
│   编辑器     │  明暗               [浅][深]       │
│   图像       │  跟随系统偏好          ( ●—)       │
│   Markdown   │                                    │
│   导出       │  界面              ──●────  15px    │
│   外观       │                                    │
│   文档主题   │                                    │
│   快捷键     │                                    │
│   通用       │                                    │
│ [ 完成 ]     │                                    │
└──────────────┴────────────────────────────────────┘
```

| 节 | 行 | 落进哪个设置 |
|---|---|---|
| **文件** | 启动选项 / 大纲 / 扩展名 / 切换文件时自动保存 / 最近记录 / 拖放 / 文件树过滤 | `[files]` 表，逐项见 `settings/files.rs` 文件头 |
| | 自动保存（下拉：关闭 / 30 秒 / 1 分钟 / 5 分钟） | `autosave_seconds`。⚠️ 值是**秒**；2026-09-24 从「编辑器」页挪到这一页。⚠️ 2026-09-25 起真的生效（`ui/useAutosave.ts`）——**同一天「切换文件时自动保存」也跟着生效了**（`ui/useDocuments.ts` 的 `切换文档`），它落在 `[files]` 表里，所以列在上一行 |
| | 关闭前先问我（开关） | `confirm_unsaved`。同上，也是从「编辑器」页挪过来的 |
| **外观** | 界面风格（下拉，`STYLES` 表，选中的那套带一句中文说明） | `ui_style`。⚠️ 与 `settings/mod.rs` 的 `UiStyle` **一一对应** |
| | 明暗（两张**缩略图**：浅色 / 深色） | `ui_mode` |
| | 跟随系统偏好（开关） | `ui_mode = "auto"` |
| | 界面字号（滑杆 12–20px + 读数） | `ui_font_size`。⚠️ **文档字号不在这里**，那是文档主题的事 |
| | 自定义字号 / 缩放 / **Ctrl+滚轮（生不生效 ＋ 动哪一个数）** / 状态栏 / **菜单栏** / 字数统计 / 工具栏 / 深色独立主题 | `[appearance]` 表，逐项见 `settings/appearance.rs` 文件头与 `docs/03` §5.6b。⚠️ **工具栏那一项是三档下拉**（始终显示 / 鼠标悬停时显示 / 始终不显示），**默认始终不显示**；`show_status_bar` / `show_menu_bar` 与它都真的接上了（`ui/useChromeVisibility.ts`）。⚠️ **菜单栏那一格 2026-09-28 加**，默认**显示**（与工具栏相反，理由见 `docs/03` §5.6b 那一行），它比另外两条多一条"藏下去时发提示"的动作 |
| **文档主题** | 当前主题（只读）、打开主题文件夹… | ⚠️ **换主题不在这里**，见下 |
| **编辑器** | 编辑模式（下拉） | `view_mode`。和「视图」菜单那三条是同一个开关 |
| | 正文宽度（滑杆 480–1200px） | `content_width` |
| | 缩进 / **段首缩进** / 配对 / 换行符 / 拼写检查 / 打字机模式 | `[editor]` 表。⚠️ 换行符那两个选项的标签（`LF（\n）` / `CRLF（\r\n）`）2026-09-26 起是**键**——`LINE_ENDINGS` 那张表从模块级搬进了组件体。⚠️ **段首缩进那一组是两格**（开关 ＋ 宽度 1~8 字符），关着时宽度那格是灰的；⚠️ 它与上面「默认缩进」**不是一回事**（那条往文件里插空格、这条只改 `text-indent`），见 `docs/03` §5.6c |
| **图像 / Markdown / 导出 / 通用** | 各自的分组与字段 | `[image]` / `[markdown]` / `[export]` / `[general]` 四张表 |
| **快捷键** | 只读一览，按菜单分组 | — |

⚠️ 上表只列**落到顶层老字段**的那几组控件，加上各页表的名字；十一页各自的完整版式
（每一组的标题、每一条的说明）在 `docs/04-ui-map.md` §3.5 与各 `settings/<页>.rs` 的文件头。

### ⚠️ 明暗那两张缩略图是**真 token**，不是画上去的颜色

每张缩略图自带 `data-ui-style` / `data-ui-mode` 两个属性，而 `theme.css` 里那两段是
**裸属性选择器**，于是它取到的是**真正的那一套变量**（连该风格的识别色都对）。
写死色值的话，换风格时缩略图就成了唯一没跟着变的地方——而那正是用户拿来做判断的东西。
判据来自 `ui/useUiMode.ts`（明暗，**订阅过系统明暗**）＋ `applyTheme.ts` 的
`resolveStyle()`（风格），**和真实外观同一套**（自己再写一遍 `matchMedia` 的话，
「跟随系统」那一格会和真实外观不一致）。⚠️ 2026-09-25 起这一页不再自带 `matchMedia`
订阅；给这一页用的 `resolveAppearance()` 同批删掉（没人调了）。

### ⚠️ 搜索是就地过滤，不是另建索引

查询非空时**十一页全部叠着渲染**，每一行自己拿标签+说明去比，比不中的**返回 `null` 不进 DOM**；
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
⚠️ 不能改成 `appearance: none`——那是 Blink 的写法，WebKit 下**不生效**
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

## `src/ui/outline.ts`（158 行）

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

口径：

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

## `src/editor/insert.ts`（217 行）

「插进去 / 改结构」这一族里**不能用 `callCommand` 打发**的那几条：任务列表、
清除格式、表格三删、公式块。⚠️ **入口只有一个**——本文件不许被界面层直接调用
（"别处不许直接摸 `editorViewCtx` 派事务"那条纪律说的是**调用点**）。
⚠️ **那个调用点 2026-09-28 从 `create.ts` 挪到了 `command-table.ts`**（命令白名单
整块搬过去，见上面那一节）；本文件本身一个字节没改。

为什么这四条单开一个文件、不塞进那张表：`command-table.ts` 的 `COMMANDS` 是"一行一条的
**映射**"，读起来是一张清单；这四条要么要先看光标在哪、要么要在**一笔事务里改两处**、
要么（公式块）得自己建节点并摆好选区。混进去，读的人就得在"清单"和"算法"之间来回切。

⚠️ **这一格原来写的是"插链接 / 插图片的节点构造"——那是陈旧的**（2026-09-26 改对）：
链接与图片 2026-09-24 起走 `callCommand(toggleLinkCommand / insertImageCommand)`，
地址由 `ui/PromptDialog.tsx` 问，都不在这里。

## `src/editor/scroll-into-view.ts`（116 行）

把正文里的一个位置滚进视野（`docs/07` 第 48 项：点大纲跳过去）。三个导出：

| 导出 | 口径 | 谁用 |
|---|---|---|
| `滚动到位置(view, pos)` | 那一块**顶到视野顶部**（留 8px 空隙） | 点大纲跳标题（`create.ts::跳到标题`） |
| `滚动到可见(view, from, to)` | **只在该看见而看不见时才滚**，滚到刚好看见为止 | 查找的命中（`find.ts::选中`） |
| `找滚动容器(el)` | 从元素往上找第一层"真能滚"的祖先 | 上面两个 + 打字机模式（`writing-modes.ts`） |

⚠️ **为什么不用 ProseMirror 自带的 `tr.scrollIntoView()`** —— 这是本文件存在的
唯一理由，也踩过一次：`EditorView.scrollToSelection()` 不是拿事务里的位置去算坐标，
而是先读**浏览器当前选区**（`domSelectionRange().focusNode`），那个节点不在编辑器里
就整段跳过。而点侧栏按钮那一刻浏览器焦点在按钮上，`selectionToDOM()` 开头的
`editorOwnsSelection()` 为假直接早退——**同一个动作第一次不灵、第二次才灵**，
正是这个机理（实况见 `docs/06` §5.20）。这里改成不看选区、直接找 DOM 元素
再自己滚，于是与焦点在谁手上无关。

⚠️ **也不用 `元素.scrollIntoView()`**：那个会一路往上滚**所有**可滚祖先，包括
整个 WebView 的文档。Nota 的菜单栏和标签栏是 `position: static`，会被一起推出窗口。

⚠️ **只有所见即所得这一侧需要它**。源码模式（`source.ts`）用的是 CodeMirror 自己的
滚动，那套按行高算、不读浏览器选区，天生没这个毛病；那边只是把落点从"贴底边"
改成"顶部"以对齐手感。

⚠️ `找滚动容器` 的 **1px 容差**（`scrollHeight > clientHeight + 1`）不是笔误：
亚像素溢出算不出滚动量，当成"能滚"会让调用方白滚一趟。

## `src/editor/find.ts`（373 行）

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

⚠️ **2026-09-25 起命中要自己滚**（`选中` 里调 `滚动到可见`）：事务上原本挂的
`scrollIntoView()` 在这条路上同样不生效——点查找那一刻焦点在查找条的**输入框**里，
机理与点大纲那次一模一样（见上一节）。表现是命中明明选了、视图却一动不动，
**长文档上等于看不见结果**。那一侧用的是"只要能看见就够"，不顶到顶部——
查找是连续动作，每敲一个字都重设一次查询，顶到最上面正文会跟着每个字乱跳。

## `src/editor/writing-modes.ts`（180 行）

专注模式 + 打字机模式（`docs/07` 第 6 项）。两个开关**都是"看的时候的状态"**，
不进设置、不落盘（同 `FormatBar`）。

⚠️ **2026-09-25 起专注模式只有一半在这里**：本文件管**编辑区里的那半**（压暗兄弟块、
就近滚动），"把外壳收起来"那半（菜单栏 / 侧栏 / 插件栏 / 标签栏 / 状态栏）在
`ui/useImmersive.ts` 与 `styles/app.css` 的「沉浸模式」一节。两半合起来才是用户按 `F8`
看到的东西——只看这一个文件会以为专注模式什么都没变。全貌见 `docs/04` §2.10。

- `算压暗(state)`：从光标那层往上，**每一层把同层的块级兄弟压暗**。
  ⚠️ 另一种写法（"所有块压暗、当前块加亮 class"）**嵌套就错了**——`opacity`
  不会因为子元素又亮回来而恢复，父块 0.32、里面的当前块最多也只能 0.32。
- `滚到正中(容器, 上, 下)`：**两个编辑器共用**。
  ⚠️ 容器**不写死选择器**：所见即所得那边滚的是 React 那个空 div，源码那边是
  CodeMirror 自己的 `scrollDOM`。写死一个，另一种模式就会静默不滚。
  ⚠️ **`找滚动容器` 2026-09-25 搬去了 `scroll-into-view.ts`**（那份滚动逻辑要用
  同一份判据，而两份已经开始漂）——本文件从那儿 import，**别在本地再写一份**。
- `写作模式插件(初始)`：`$prose` 插件，state 走 `写作模式元` 这个事务元。
- `设写作模式(view, 模式)`：拨开关走它，**不重建实例**——重建会丢撤销栈和光标，
  而这两个开关正是"写到一半才想去拨"的东西。

⚠️ **源码模式那边的装饰只有一颗**（`Decoration.line`）：CodeMirror 里内容是
**平的行**，没有块级父子，所以那边改成"根节点挂 `nota-focus`、当前行挂
`nota-focus-on`"，压暗交给 CSS 的 `:not()`——装饰数**不随文档长度增长**。

## `src/ui/FormatBar.tsx`（252 行）

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

### ⚠️ 悬停提示那张名字表（`TITLES`，15 个名字）2026-09-26 搬进了组件体

⚠️ 此前它留在**模块级**，于是英文界面下**整条格式化工具栏的悬停提示仍是中文**——
模块级那次求值时语言还没定，而且求值完**没有任何东西会通知它重画**（同
`i18n/index.ts::useT` 顶上那条）。搬进组件体之后每次渲染都重算、逐条 `t(...)`。

⚠️ **名字由调用方先翻好再传进 `提示()`**（`t(TITLES[b.cmd] ?? b.label)`）：
`提示` 是模块级的纯函数，拿不到也订阅不上语言。它自己只管**括号**——
中文界面上是全角 `（Ctrl+B）`、英文界面上是半角 ` (Ctrl+B)`。
⚠️ 那是**排版**不是文案，所以**不走表**（表里没有"半个括号"这种东西）。

⚠️ `role="toolbar"` 那行的 `aria-label` 同批改成 `t("格式化")`——它此前是硬编码中文，
正是 `tools/i18n-check.sh` 第 ④ 栏从"只打印"改成计入 FAIL 时清掉的两条真漏网之一
（另一条是 `ui/EditorPane.tsx` 的 `t("正在准备编辑器…")`）。

## `src/ui/FindBar.tsx`（211 行）

查找与替换条（`docs/07` 第 4 项）。⚠️ **它是显示端 + 输入端，不是查找的实现**：
命中数一律是编辑器报上来的 `status`，本地算一份的话两边迟早算出不一样的数。
详见 `docs/05` §4.3。

⚠️ 三条要点：

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
这一条不是为了"加密"，是为了防止旁人从屏幕上读到 key。**界面上不能说它"安全"。**

⚠️ 带 `secret` 时 `autoComplete="off"` **是必须的**：WebView 的密码管理器会跳出来问
"要不要记住"，而这里填的是 **API key**，不是登录密码——那个弹窗一出现，
用户就得先弄明白"这算不算我的账号密码"。

⚠️ **焦点全选**（`focus()` + `select()`）在插件那条路上同样是关键：Ctrl+K 编已有链接时
直接打字就替换了。**`select()` 不能删。**

⚠️ `Enter` / `Esc` 收在**输入框自己**身上，**不绑 `window`**（与 `ConfirmDialog` 不同）：
输入框里按 `Esc` **应该是**"把输入法候选框收掉"，绑到 `window` 上抢 `keydown`
会把那一下吃掉——中文用户按 Esc 想取消选字，结果整个框没了。

⚠️ **主字段为空 = 当作取消**（`value.trim() === "" → null`），不是"发一个空串"。
一个 `[文字]()` 在正文里看不出坏、点上去没反应；而"改主意了、把框清空再点确定"
是个很自然的取消姿势。**插件那条路靠的正是这一条**——它同时挡住了
"git 收到一条空提交信息"和"AI 拿空串当提问发到网上"。

## `src/ui/useMenus.ts`（465 行）

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
| 有没有处理函数 | 这个功能做了没有 | **`ui/useCommandTable.ts`** 那张表（2026-09-26 从 `App.tsx` 搬出；`App.tsx` 那边只剩一个调用点，⚠️ `docs/04` §4.1 数"能按的"那段脚本曾因为没跟这一步而整表算错） |
| `needsDoc` | 现在有没有一份文档可作用 | `activeId` |
| `光标条件` | 光标这一刻在不在合适的位置 | `commandState` |

⚠️ **"能不能点"的真相源只有一处**，而它派生出三个消费者：自绘菜单的 `disabled`、
原生菜单的 `enabled`、键盘的"这条键位接不接"。各写一份的症状是
**"菜单灰着、快捷键却照跑"**——不报错、不崩，只让用户觉得这个应用一会儿一个脾气。

⚠️ **`光标条件` 表里没有的 id 一律不受状态约束**（默认可用）。写成"默认不可用"
的话，每加一条命令都得记得来这儿登记，漏了就是一个永远灰着的菜单项。
⚠️ **2026-09-27 加的 `para.toc` 是个例外**：它的判据 `hasHeadings` 看的是**整篇文档**
而不是光标位置（表里其余条件都是"光标这一刻"）。放在这里而不是放进命令里，
理由还是那一条——**判在命令里的话菜单会亮着、点下去没反应**。

⚠️ **`menuChecks` 的依赖是一串布尔，不是一个对象**：对象字面量每次渲染都是新身份，
拿它当 `useMemo` 的依赖会让那两个原生菜单的 effect **每渲染一次都重推一遍菜单**
（一次 IPC + 一次重建原生菜单）。

### ⚠️ 推原生菜单那个 effect 的依赖里有**语言**（2026-09-26 结清的一笔）

那个 effect 的依赖是 `[menus, disabledCommands, menuChecks, themes, documentTheme, 语]`
——最后那个 `语` 来自 **`use语言()`**（不是 `useT()`：这里**不画字**、只是把语言当依赖，
拿 `useT()` 会多一个没人看的 `t`、被 `noUnusedLocals` 拦下）。

⚠️ 这笔账原来**记在 `ui/nativeMenu.ts` 文件头**：菜单树由这边推给 Rust，推过去的那一份里
名字**已经翻好**，语言换了不重推，macOS 上就是**整条原生菜单栏还是旧语言**
（那是用户报过的 BUG-38 的翻版）。同一条理由见 `ui/usePlugins.ts::menus` 那个 `useMemo`。
⚠️ **今天语言还要重启才生效，所以这条依赖此刻推不出变化**——但那不构成"那就别订阅了"
的理由：写死一个不动的依赖，等哪天热切语言真做了，症状就是上面那一条，
而那种地方没人会想到去查依赖数组。

### ⚠️ 那条 `window` keydown 监听的**两个方向**（2026-09-29，BUG-53 结清的一笔）

监听本身是"菜单加速键在前端的兜底"，今天它两头都设了闸：

- **接了就 `preventDefault`**（老规矩）：不挡的话 WebKitGTK 自带那条整页缩放会跟着一起动
  （见 `docs/04` 视图那一节）。
- ⚠️ **编辑器自己已经处理过的不再接手**（2026-09-29 加，判据是**第一句**
  `if (e.defaultPrevented) return;`）：ProseMirror 只要有一条 `handleKeyDown` 返回 `true`
  就会 `preventDefault()`，而它的监听挂在 contenteditable 节点上、**比 `window` 早**。

少了第二句的症状就是 **BUG-53**：`Mod-b` / `Mod-i` 被上下两处各跑一遍，而
上游 `strongKeymap` / `emphasisKeymap` 与本仓菜单表的 `fmt.bold` / `fmt.italic`
**都是 toggle**，跑两遍正好抵消——**按下去什么都不发生**，而且**只在所见即所得模式下发生**
（源码模式那边是 CodeMirror、压根不跑 Milkdown 插件，同一颗键一直好使）。
⚠️ `Ctrl+U` 当年看着"是好的"纯属巧合：WebKit 自己的 `execCommand` 插的是 `<u>`，
ProseMirror 恰好认它；`<b>` / `<i>` 它不认，所以 `B` / `I` 两颗坏、`U` 那颗不坏。

⚠️ 这条判据**不覆盖**宿主那条死链路：`nota:format-key` 那个事件今天一次都没响过
（`docs/07` BUG-49），所以今天所有格式化键位都是**这一条监听**在管。

## `src/ui/useDialogs.ts`（197 行）

两个自绘对话框的"谁在等答案"：`{ confirmReq, askConfirm, answerConfirm,
promptReq, askPrompt, answerPrompt }`。

⚠️ **每个框后面是单个 ref，不是队列**：今天所有调用点都是用户动作直接触发的，
不存在并发；真要并发弹两个，后来者会把前一个的 Promise 永远挂着——那时再改成队列。

⚠️ 它**不知道谁在问**（关文档、退出、填链接地址）——这正是它能被搬出去的原因：
它只是一对"问一句、等回答"的 Promise 拼接器。

---

## `src/editor/export.ts`（333 行）

**把 Markdown 变成一份完整的 HTML 文件**（`docs/07` 第 1 项能当场做完的那一半）。

### 怎么渲染：同一条路，不另找库

⚠️ **不是**再找一个 Markdown 库：那样"屏幕上什么样"和"导出什么样"就成了两套实现，
各自都"对"，漂移了也不会被发现。这里走的是**编辑器自己那条路**——起一个**屏外只读**
的 Milkdown 实例，解析 + 渲染，再把那块 DOM 摘下来。

⚠️ 摘的是**渲染后的 DOM**，不是文档树。文档树那条路（`DOMSerializer`）更干净，
但会丢掉两样用户看得见的东西：① 宽松模式下 `#标签` 显示成标题（那是
`Decoration.node` 的 `nodeName`，**装饰不在文档树里**）；② 任务项的方框、代码块的容器结构。
导出对不上屏幕，用户只会觉得"导出的东西坏了"。

| 导出项 | 里面有什么 | 用在哪 |
|---|---|---|
| HTML（不含样式） | 只有语义标签，**一条 CSS 都没有**，连 class 都不带 | 贴进别的系统再加工 |
| HTML（含样式） | 嵌**三份** `?inline`（**同一份字节**）：`theme/base.css`（变量层）＋ `editor.css`（正文）＋ `katex.min.css`（公式），再叠**限域后的**文档主题 | 直接打开看、打印、发给人 |

⚠️ **那三份的名单是 2026-09-27 定下来的**，判据是"摘干净之后它的规则还命中吗"：
编辑区在界面上拿的 CSS 有十来份，但 `code-block.css` / `math.css` / `marks.css` /
`diagram.css` 的规则**全部挂在 `.nota-*` 上**，而 `.nota-*` 正是要摘掉的零件。
⚠️ 少带各自的症状（都是"看着不对但不报错"）：缺 `theme/base.css` → 每条 `var(--x)`
都未定义，**代码块没底色、token 没配色、任务项的方框整个消失**；缺
`katex.min.css` → KaTeX 那棵给读屏器用的 MathML 树少了 `clip`，**公式画两遍**。
⚠️ 文档主题压在这三份**之后**（与界面上一致：`applyDocTheme` 往 `<head>` 末尾追加）。

⚠️ 「含样式」那份外面**必须照着编辑区的 DOM 摆 class**（`.editor-pane` >
`.editor-mount` > `.milkdown` > `.ProseMirror`）。这不是巧合，是那份 CSS 的作用域要求
——摆错了的症状是"CSS 在、但哪条都没命中"。

### `async function 摘正文(markdown): Promise<string>`（私有）

建离屏实例 → **等异步渲染落定** → 在**还挂着的 DOM 上**摘零件 → `pm.innerHTML` →
`handle.destroy()`。

⚠️ **摘零件分两半，一条前缀规则兜不住全部**（**2026-09-27 用户的一份 PDF 撞出来的**）：

| 摘什么 | 判据 |
|---|---|
| **装饰**（挂在正文元素上的类名） | **`nota-` 开头的一律不算内容**（`nota类前缀`）。收成一条规则是为了耐腐蚀：将来再加一个 `nota-xxx` 装饰时自动生效，不必回来登记 |
| 属性 | `data-srcmark` / `contenteditable` / `spellcheck` / `translate`——全是"编辑时才成立"的 |
| **容器**（自己就是一个元素的零件） | **`整块删掉` 名单**，逐个登记：`.nota-code-gutter`（行号） / `.nota-code-bar` / `.nota-code-lang-wrap`（语言选择器） / `.nota-math-panel` / `.nota-math-preview` / `.nota-diagram-bar` / `.nota-diagram-source` / `.nota-diagram-note-btn` |

⚠️ **两半的分界**：容器**摘掉类名之后元素还杵在原地**。原来名单里只有
`.nota-code-bar` 一条，于是"复制 / 折叠"没漏、同一条路子上另外两件（行号、语言
选择器）漏了——**漏的从来不是"忘了登记某一个"，是以为前缀规则会兜住**。新加一个
`nota-xxx` 时先问一句**它是不是元素**。⚠️ 只登记**住在编辑区里的**那些：
`.nota-lang-popup` 挂在 `document.body` 上，写在这儿是死规则。

⚠️ **摘之前先 `await 等异步渲染(pm)`**：图表是 mermaid 走一条串行队列画的，
不等的话导出的是一张**"正在渲染图表…"的说明卡**（屏幕上那块图是好好的，用户只会
觉得导出坏了）。判据用图块自己的 `data-state="loading"`（不是"有没有 `<svg>`"），
有 5 秒上限——超时就交说明卡，不能为一张图把导出卡死。

⚠️ **在 DOM 上摘，不是把 HTML 拼出来再用正则洗**：正则会被正文里恰好出现
`contenteditable` 这几个字这类意外绊倒，而遍历 DOM 只认真正的元素和真正的属性。
⚠️ 离屏节点用 `left: -99999px` + `visibility: hidden`，**不是 `display: none`**：
ProseMirror 建实例时要量 DOM（行高、`coordsAtPos`），`display: none` 下量出来全是 0。
⚠️ 它还被**钉成浅色**（根上写 `data-ui-mode="light"`）：这个离屏节点挂在应用自己的
文档里，深色界面下 `diagram-view.ts::读明暗` 会读到深色的 `--doc-bg`，于是
**白纸上画出一张深色图**。钉浅色 = 让它和导出文件（没有 `data-ui-mode` → 落 `:root`
= 浅色）用同一套变量。
⚠️ `root.remove()` 放在 `finally` 里：中途抛错也必须收走，否则每导出一次就在页面上
留一个看不见的、DOM 监听还活着的编辑器。

### `export async function 导出HTML(markdown, opts): Promise<string>`

`opts: 导出选项 = { styled, themeCss?, title }`。

⚠️ 这里原来有一个 `strict`（`Settings.strict_markdown`），**2026-09-26 删掉了**：
导出走的是同一条渲染路径，而那条路现在两种模式一模一样（宽松标题那条显示层装饰
删掉之后，`#你好` 在屏幕上和导出里**都是普通段落**）。留一个不起作用的开关在这里，
只会让人以为导出与屏幕上可能不一致。

⚠️ 主题 CSS 进来时是**原始文本**（`api.theme.css` 的返回值），**在这里限域**——
调用点（`ui/useExport.ts`）不做这件事，只有一个地方做才不会漏。

### `export function 默认导出名(title, ext): string`

**只换后缀**（`md` / `markdown` / `mdx` / `mdown` / `mkd` / `txt` → 新后缀），保留原文件名
——用户认得自己那份文档叫什么。洗空了给「未命名」。

### ⚠️ `导出选项.title` 那段注释：导出**不等于**另存为

用户 2026-09-25 点出来的一条口径，现在写死在这份文件的 `导出选项.title` 上：

| | 另存为 | 导出 |
|---|---|---|
| 产出 | **还是同一份文档**，只是换了路径 | 一份**别的文件**（HTML / PDF / Word…） |
| 当前文档 | 路径、脏标记、标签页、最近文件**全都跟着变** | **一个字节都不动** |
| 落点 | 只能以 `doc.path` 为准 | 默认落点只能「猜」（`ui/useExport.ts::默认落点` 三档） |

所以这里的 `title` 只是「默认文件名从哪来」的一个来源，**导出不会回写任何文档状态**。

---

## `src/ui/useExport.ts`（357 行）

**导出与打印的接线**：取正文 → 取主题 → 生成 HTML → 问落点 / 交给系统 → 报结果。

⚠️ **正文必须从编辑器拿**（`getMarkdown()`），**不是 `doc.text`**：后者是 300ms 去抖之后
的镜像（backlog 第 32 项），用户刚敲的字不在里面。"屏幕上和导出里不一致"是最容易被
当成"导出坏了"的那种 bug。

⚠️ **主题取不到不算失败**（`取主题CSS` 吃掉异常、返回 `undefined`）：settings 里记着一个
id、而那份 `.css` 被删了是很平常的事，为它中断一次导出不值。只在控制台留一句。

⚠️ **两档导出故意合成一条路**（一个 `styled` 布尔）：分成两个函数的话，
"另一种也一起改一下"迟早会漏一次。

⚠️ **打印不是"在应用里打印"**：它 = 导出含样式的那份 + 交给系统默认程序打开，
提示里**两步都要说**（`已用系统默认程序打开，在那边按 Ctrl+P 打印（文件在 …）`）。
假装在应用里完成才是撒谎；理由写在 `commands/export.rs` 文件头。
⚠️ `print` 的落点由**后端按 `doc.path` 的父目录**决定——正文里 `![](./img.png)` 是相对路径，
换个目录图片就全没了。

### 借 pandoc 那七种（2026-09-25 加）

出口多了 `导出为(format)` 与一对 `pandocGate` / `pandocGateActions`
（`gateActions` 这个名字是「装没装」那类面板的老口径，`App.tsx` 那边是 `{...gateActions}` 摊开）。
流程是**先探测再决定**：`ready` → 直接进保存对话框（**不弹面板**，`useExport.ts:导出为`）；
`missing` / `unknown` → `setPandocGate(...)` 出 `ui/PandocPanel.tsx`。

⚠️ **PDF 那次导出总是先把带样式的 HTML 备好**交给后端（`format.id === "pdf"` 时）：
pandoc 通不通要到后端才知道，而兜底那条（`pdf_print.rs`）要这份 HTML。不备的话，
"装了 pandoc 但没有排版引擎"这种情况就只剩一句报错，而它本来有救。
⚠️ `导出为` 里认不出的格式 id **要吭声**（`toast('不认识的导出格式：…', 'error')`）：
静默会表现成"点了没反应"。

### `默认落点(name, docPath)`：三档，**且与「另存为」不是一回事**

| 档 | 什么时候 |
|---|---|
| 1 | 设置里的 `default_folder` 非空 → 用它（用户显式说过的，最大） |
| 2 | 否则文档**已存过盘** → 用它自己那一层目录（导出到文档旁边） |
| 3 | 都没 → 只有一个文件名，交给对话框用它自己记着的目录 |

⚠️ **「导出」与「另存为」的落点是两回事**（用户 2026-09-25 点出来的）：另存为换的是
*这份文档自己*的路径，所以它必然以 `doc.path` 为准；导出产出的是一份**别的文件**，
落点只能算"猜一个用户多半想要的地方"——所以设置能盖过它，而另存为那边没有这种设置。
两者各自是什么，写死在 `editor/export.ts::导出选项.title` 那段注释里。
⚠️ **第 2 档是开窗量出来的**：不给的话对话框落在**进程的当前目录**里（实测是
`src-tauri/`）——那是"从哪儿启动的"，不是"用户在编辑什么"。

---

## `src/ui/useDocTheme.ts`（172 行）

文档主题的三件事：**应用**（`useEffect`）、**切换**（`pickTheme`）、**打开主题文件夹**
（`openThemesDir`）。

⚠️ **从 `App.tsx` 搬出来的不只是行数**：这三件事共用同一个前提——**文档主题只作用于
编辑区**。摆在一起，那条约束才有一个看得见的落点。

⚠️ **与界面主题的 `applyTheme` 分开是有意的**：界面主题是**纯写属性**（同步改 `data-*`），
文档主题要**取回来 + 限域**才能注入，是异步的。节奏不一样就不塞进同一个 effect——
塞在一起的话，改一次界面主题会连带重取一次文档主题的 CSS。

⚠️ **`alive` 标志必须有**：快速连点两套主题时，先发出去的 IPC 可能后回来，
不挡住就会用**旧的那份** CSS 覆盖新的——而且看起来像"点错了"。

⚠️ 提示里用**显示名**（中文），存进设置的是 **id**。混了就变成"提示里说换成「极简」、
设置里存着一个 `minimal`"。

---

## `src/ui/useEditorCommands.ts`（76 行）

**把一条菜单命令送进编辑器**：`run(c, payload?)` 直接转交；「插入链接」「插入图像」
先问出参数再一起交过去。

⚠️ **转交时必须看返回值**：`runCommand` 的返回值与"改了没有"无关——`false` 说的是
**这条命令在当前的编辑模式下没有对应的实现**（源码模式下表格那十条、以及没填地址的
链接/图片）。不看返回值，用户看到的是"点了没反应"，而原因（这个模式做不到）看不出来。

⚠️ 「插入链接」在**已经是一条链接**时再点一次，语义是**去掉链接**（命令本身是 toggle）。
再次点击不会弹框改地址——**这一点如实记在 `docs/07` 里，不算未做完**。

---

## `src/ui/useChromeVisibility.ts`（225 行）

**状态栏、格式工具栏与菜单栏的"看得见 / 看不见"**（2026-09-25 从 `App.tsx` 搬出；**菜单栏 2026-09-28 加**，225 行）。

⚠️ **这个文件是"同一件事有两个同名开关"那个 bug 的修法**：两条原来各有一份内存
`useState`，而设置里那两个开关（`appearance.show_status_bar` / `show_toolbar`）**一个
读取者都没有**。"菜单里关掉重启就回来、设置里关掉什么都不发生"——两个都算界面在撒谎。
现在值**只有一个来源**（`settings.appearance`），而且**是派生值不是 state**：再存一份
state 就又多一个"要和设置对齐"的内存值，而"对齐"永远会被某条路径漏掉。

⚠️ **工具栏是"一个布尔 → 三档"**（用户 2026-09-25 点名要的）。三档 `always` / `hover` /
`never`（`ToolbarMode`），默认 `never`。中间那一档是这里**唯一的内存状态**：`peek`
——"鼠标现在在上面吗"。它不落盘，因为它只是一个"此刻"；**哪一档永远由设置说了算**。

⚠️ 悬停那一档的判据分两行，第二行不能省：「工具栏没画着 → 认主区顶端往下 8px 的窄带」
「工具栏画着 → 指针在它**下沿以上**都算」。只认工具栏矩形的话，查找条开着时鼠标从触发带
往工具栏走，**半路穿过查找条就会被判成离开**，工具栏在鼠标到达前先收掉，于是永远点不到。
触发带压在**主区**最顶上而不是窗口顶端——去点菜单时不需要顺带弹出一条工具栏。

⚠️ 悬停档**会把正文挤下去**（在文档流里，不是浮层）。这是有意取舍：浮层要盖住正文第一行，
"看的时候挡住内容"比"内容跳一下"更糟；何况默认那一档根本不会跳。

⚠️ 写的时候要把 `appearance` **整张表**一起写回——`updateSettings` 只做顶层浅合并，
只给一个字段会把这张表里其它字段全抹成默认。

⚠️ **菜单栏那一条（2026-09-28）与上面两条有一处本质不同，改之前先读这段**：状态栏和格式
工具栏是**冗余**的——藏了它们，那些数、那些命令在别处都还拿得到；而**菜单栏是命令的总入口**
（最近打开、导出、拓展管理只在它里面），**而且它就是"哪儿能改回来"的唯一指示牌**。所以这里
有一处别处没有的动作：`menuBarOpen` 从显示变成隐藏的那一刻，发一条会自己走掉的提示
（「按 `Alt+M`，或到设置 → 外观 → 显示菜单栏开回来」），6 秒——照 `ui/useImmersive.ts`
进沉浸时那条的先例（同一个问题、同一种做法）。

⚠️ **判据是跳变，不是"现在是不是隐藏的"**：设置是异步读进来的，第一帧 `settings` 还是
`null`（那时 `menuBarOpen` 只是默认的 `true`），读到落盘的 `false` 会被误认成一次"用户刚藏了
它"，于是每次启动都弹一遍。两道闸挡着：`settings` 还没到就直接返回、第一次真正看到值时也不报。

⚠️ **那条提示不挂在菜单项的处理函数里**（`ui/useCommandTable.ts` 的 `view.menuBar` 只有一行
取反），挂在这儿盯设置字段的跳变——于是**三条路（菜单项 / `Alt+M` / 外观页那个开关）都会发**。
挂处理函数的话，从设置页关掉就没有提示了，而那条路恰恰更需要知道 `Alt+M`。

⚠️ 键位 `Alt+M` **不是可有可无的**：`view.menuBar` 是这张菜单里唯一"藏起来之后自己也点不到"
的条目（它就在被藏的那一条上），没有键位就只能绕设置页（`Ctrl+,`）回来。

---

## `src/ui/tree-options.ts`（76 行）

**文件树的口径**：排序档 / 过滤档 / 隐藏文件三格（2026-09-28 新建，用户原话
「**文件树排序（名/创建/修改）**」）。

```ts
export interface 树口径 { sort: TreeSort; filter: FileFilter; showHidden: boolean }
export const 缺省口径: 树口径;                    // 设置还没到时用
export function 读口径(settings: Settings | null): 树口径;
export function 口径键(口径: 树口径): string;      // 给依赖数组用的字符串指纹
```

都是**纯函数**（只读 `settings.files` 里那三格），所以 `tests/tree-options.test.ts`
能直接喂它。

### 为什么要单独一个文件

这三格有**三个使用点**：`App.tsx`（换工作区要重取整棵树）、`ui/useDocuments.ts`
（`loadDir` 展开子目录、`openFolder` 开文件夹）、`ui/Sidebar.tsx`（口径变了要让
已经展开的那几层重取）。四处各写一遍"哪一格叫什么、缺省是什么"的话，迟早会有一个
入口跟别的不一样——而那种错**用户得点两下才看得出来**（"在文件树里点开是好的，
展开子目录顺序又变了"）。

### ⚠️ 口径是"随请求带"的，不是"让宿主自己读设置"

这是这个文件存在的**真正理由**。设成设置项的那一刻宿主当然读得到，但那一路是
**先改内存、再落盘**（`ui/settings/panes/props.tsx::paneWriter`），而写盘是异步的：
用户在下拉里换成"按修改时间"，紧接着发出的那一次 `tree` 请求完全可能赶在设置到达
宿主**之前**——那时宿主手里的还是旧档，树**不换**，要等下一次别的原因刷新才换。
这种"拨了没反应、过一会儿自己好了"是最难报的一类 bug。

前端把当前口径**跟着请求一起递过去**（`api.workspace.tree(subPath, depth, opts)`），
就没有这个时间差。这也是宿主那边 `TreeOptions` 存在的唯一理由。

⚠️ **逐格回落**：只填自己关心的那一格是允许的（宿主那边一格一格回落到 `[files]` 表，
见 `commands/workspace.rs::口径解析`）。

### ⚠️ `口径键` 不是装饰

`读口径` 每次返回**新对象**，所以它的身份每次渲染都变——直接拿它当 `useEffect` /
`useCallback` 的依赖，等于"每次渲染都重取一遍已经展开的目录"（展开十几个目录之后，
每次敲字都在重取）。`口径键` 把它压成一个**值比较**的字符串（`"name|supported|false"`），
三格没变就是同一个键。⚠️ 所以 `refreshTree` / `loadDir` / `openFolder` 的依赖数组里
放的**都是那个指纹**，不是 `settings`、也不是口径对象。

### ⚠️ `缺省口径` 必须与宿主的默认值逐格一致

启动那几百毫秒里 `settings` 还是 `null`，走的是这一份。不一致的表现是**树先按一种
规则排、眨一下眼又按另一种重排**。所以 `tests/tree-options.test.ts` 第三组直接读
`src-tauri/src/settings/files.rs`，把那两个枚举的**档位名与默认档**逐个对一遍
（连 `rename_all = "kebab-case"` 有没有都查——少了它，线上取值会变成
`"TreeSort.Name"`，而 `Option<TreeSort>` 那三格反序列化失败会让**整个文件树打不开**，
症状与"排序"这个动作看不出关系）。

---

## `src/editor/file-kind.ts`（约 145 行）

**这一份文件是什么类型、该用哪种模式打开**（2026-09-28 新建，用户原话
「**按文件名认类型（schema-aware）**」…「**大文件自动降级源码模式**」）。

```ts
export const MARKDOWN后缀: readonly string[];   // 六种，全仓唯一一份
export const 大文件阈值 = 1_000_000;             // UTF-16 码元
export function 后缀(路径: string): string;
export function 是Markdown后缀(路径: string): boolean;
export function 认文件类型(路径: string): "markdown" | "text";
export function 是大文件(字符数: number): boolean;
export function 降级缘由(路径: string | null, 字符数: number): "text" | "large" | null;
export function 实际模式(偏好: ViewMode, 缘由: 降级缘由 | null): ViewMode;
```

**纯函数、一个 React 都不碰**，所以 `tests/file-kind.test.ts` 能直接喂它（14 条）。

### 它解决的那个具体问题

编辑器内核是 **Markdown 的**（Milkdown 那棵树认 CommonMark），而**任何 UTF-8 文件都能
打开**（对话框筛选跳得出去、拖得进来、`nota x.py` 也行）。于是拖一个 `foo.py` 进来，
它被当成一份 Markdown 解析：行首 `# 注释` 变一级标题、`*args` 变斜体、下划线标签变
`<u>`。**存回去字节还是对的**（本仓的往返很小心），但**屏幕上那幅画是错的**。

⚠️ **这不是"猜"，是"看一眼名字"**：后缀说了它是 `.py`，就没有理由拿 CommonMark 去读
它。真正猜不出来的那一半（内容像不像代码）在 `editor/lang-guess.ts`，两件事别混。

### ⚠️ 两张表**故意不一样**，别合并

| 表 | 回答 | 谁在用 |
|---|---|---|
| `MARKDOWN后缀`（本文件） | **哪一族后缀算 Markdown** | 本文件、`ui/useDocuments.ts` 的对话框筛选、`ui/useFileDrop.ts` 的分类 |
| `文本后缀`（`ui/useFileDrop.ts`） | **能不能当文本打开**（`.json` `.toml` `.py` …） | 拖放那条路 |

合并了就成了"**Nota 只打得开 Markdown**"，而那是 `docs/10` §11.2 明确**不做**的格式转换。
⚠️ 真值源是 `commands/workspace.rs::is_markdown`（宿主那边决定文件树列什么），
`tests/file-kind.test.ts` 第一组去读那份 Rust 源码逐个对。

### ⚠️ `后缀()` 挡住"点开头就是整个名字"

按"最后一个点"取后缀的话，`.bashrc` 会取成 `bashrc`、`.gitignore` 取成 `gitignore`。
不报错，只是让"这份文件是什么类型"多出一堆不存在的类型。判据是 `点 <= 0` 一律给空串。

### ⚠️ 大文件阈值**是一个判断，不是量出来的转折点**

`1_000_000` 这个数单独摆在常量上、写明理由：ProseMirror 那棵树与它的 DOM 是**整篇**建的
（不是按视口），10 万字符已有可感迟滞，100 万字符是"敲一个字等半秒"；而 100 万码元
≈ 1 MB 的 UTF-8 中文，放到写作场景里比《战争与和平》还长。⚠️ **宁可压高不压低**：
压低了正常长文会突然掉进源码模式（用户觉得"编辑器退化了"，但能自己切回来），压高了
超大文件卡死（用户觉得"编辑器坏了"，切不回来）。

### ⚠️ 两条缘由**分开返回**，不合成一个布尔

提示条要说清是**哪件事**让它换了模式。合成一个的话，拖一篇 3 MB 的 `.md` 进来，用户
看到的是一句"这不是 Markdown"——**而它明明是**。优先级是"先看名字，再看大小"：
不是 Markdown 就报 `text`，哪怕它同时巨大（顺序反了会把用户引去"想办法把它改小"）。

### ⚠️ `路径` 可以是 `null`

那是"**还没存盘的新文档**"（`Document.path` 就是 `string | null`）。它按 Markdown 算
——Nota 新建出来的东西**就是**一篇 Markdown，名字还没起而已；但**大小那一条照判**：
从剪贴板粘一篇 200 万字符的东西进来，它一样会把编辑器拖垮，跟有没有名字没关系。
⚠️ 写成 `认文件类型(路径)` 会**崩**（`null.split` 报错），而崩的位置是 `App.tsx` 的
渲染里——整块界面白屏，跟"文件名"这件事看不出关系。

### ⚠️ `实际模式`：降级压过用户的设置，而且三档都压

`split` 右侧那半是一份**只读的 Milkdown**，大文件在那上面一样卡；非 Markdown 的文件
在那上面一样被解析错。所以降级之后一律 `source`，不是"把 split 的右半关掉"。
⚠️ 合成本函数时**只管规则**——"用户手动切一次模式就解除降级"那一步在调用方
（`App.tsx` 的 `updateSettings`，理由见下一节）。

---

## `src/ui/useFileKindMode.ts`（约 195 行）

**这一份该用哪种模式打开**（2026-09-28 新建）：把上一节那两条纯规则接到 React 上。

```ts
export function useFileKind(输入): { 模式: ViewMode; 解除降级(id: DocId | null): void }
```

它只干两件在纯函数里干不了的事，**判据一条都不在这里**：

### ⚠️ 一、每份只判一次

判据里有一条是**文档有多长**，而长度是**会变的**——用户在正文里敲字，一篇 99 万字符的
稿子几分钟后就过线了。要是跟着变，症状是**写着写着编辑器自己换成源码模式**：光标跳到
另一个组件里、撤销栈换了一份、刚才那半句话还在不在都两说。用户对这件事的解释不会是
"我的文件太大了"，而是"**Nota 又出毛病了**"。

所以判的是**"打开这一份的那一刻"**；关掉再打开会重判一次——那不是"同一个时刻"，而且
用户已经用"关掉再打开"这个动作表达过一次"重来一遍"了。

⚠️ `判过`（判过的）与 `降级表`（**只装降级了的**）**不是一回事**：结论是"不用管"的那些
只在前者里。收尸与判**写在同一个 effect 里**是有意的：两件事读的是同一份"现在还开着
哪些"，拆成两个 effect 会让"关掉一份"被处理两次，而它们谁先跑不保证。

### ⚠️ 二、提示条只在它成为前台那一份时弹一次

一次拖进来五个文件时只有前台那一份看得见，为另外四份各弹一条等于刷屏；而用户切过去的
时候正好是他需要知道"这为什么是源码模式"的时候。

### ⚠️ 三、用户手动切模式 = 解除这一份的降级

降级**压过**用户的设置，所以必须有这条出口，否则用户会遇到：菜单里「所见即所得」上带着
✓、我点「所见即所得」、**它纹丝不动**。那是把用户锁在外面——比"打开时选错了模式"糟得多。

出口是 `解除降级`：`App.tsx` 的 `updateSettings` 收到 `view_mode` 那一次调用它，把这一份
的降级**删掉**。删掉之后 `判过` 里还记着它，所以**不会再被判回来**——这正是"用户说了算"
的形状。⚠️ 解除是**按份**的，不是全局关掉这条功能：用户手动切过 A 那份之后，再拖一份
`.py` 进来照样降级。

### ⚠️ 四、"这一份是不是 Markdown"**不从这里出去**

那是**文件的属性**（`认文件类型`），由用它的地方（`ui/EditorArea.tsx`）按 `activeDoc.path`
现算。从这里出去的话，"用户手动解除降级之后它还算不算 Markdown"就成了第二个答案——而
源码模式下一份 `.py` 该不该染 Markdown 色，跟"这次打开时降没降级"根本不是一回事。

### ⚠️ 那个 `?? "wysiwyg"` 的兜底必须与三处一致

`App.tsx` / `ui/useDocuments.ts` / Rust 侧 `ViewMode::default()`。不一致的话，启动那
几百毫秒里会算出另一种模式，用户看到的是"打开先闪一下另一种样子"。

---

## `src/ui/useAppEvents.ts`（168 行）

应用级的两条 effect（2026-09-26 从 `App.tsx` 搬出）：**宿主推来的事件** ＋
**活动文档变了要告诉后端**。⚠️ 不并进 `ui/usePlugins.ts`：那个管的是插件三样
（清单 / 面板 / 菜单项），这两条与插件无关。

### 订阅了哪些频道

| 频道 | 收到之后做什么 |
|---|---|
| `nota:notify` | `onToast(message, level)` |
| `nota:document-changed` | 若 `id` 是当前这份，整篇 `editorRef.setMarkdown(text)` |
| `nota:document-edit` | **2026-10-04 加（第 14 项）**：见下 |
| `nota:second-instance` | 抬窗 ＋ `openPath`（第二个进程递过来的路径） |

### ⚠️ `nota:document-edit` 这一段的两条判据

```ts
if (p.id !== activeIdRef.current) return;     // ① 不是当前这份 → 丢掉
if (p.op !== "insert-at-cursor") return;      // ② 不认识的 op → 丢掉
editorRef.current?.插入在光标处(p.text);
```

- **① 先判文档**：用户已经切走了，这条意图作废（它说的是"**当前这份**的光标处"）。
- **② 再判 `op`**：⚠️⚠️ **不认识的 `op` 一律丢掉，绝不能拿 `p.text` 当插入用**。
  将来宿主多发一种 `op`（而这份界面还没跟上）时，"照插不误"就是把一段文本塞到
  用户光标上——而它与这条 `op` 的语义可能毫无关系。
- **没有别的兜底**：这条事件**允许被丢掉**（编辑器没挂、刚切走），丢了就是这次
  插入不作废、也没人报错——与 `nota:document-changed` 那条"丢了就永久分叉"
  正好相反。对照表在 `docs/05` §5.2b。

⚠️ `activeIdRef` 是 ref 不是 state：这两个 effect 只订阅一次，回调里读 state 会
永远读到挂载那一刻的值（理由写在文件头）。

---

## `src/ui/useDocuments.ts`（632 行）

**文档的生命周期**：打开 / 新建 / 存盘 / 关闭 / 从磁盘重载 / 切页与自动保存
（2026-09-25 从 `App.tsx` 搬出；搬之前 `App.tsx` 已经 998 行，离硬上限只剩两行。
"切页与自动保存"是同一天晚些加进来的）。

⚠️ 搬走的**是一整块职责而不是几行**：这五件事回答的是同一个问题——**磁盘上那份文件和
用户手里这份之间怎么互相覆盖**。存盘、丢弃、重载都在这条线上，摆在一起才看得出先后与
各自的围栏。

⚠️ **`saveDoc` 返回布尔**（"存成功了吗"）。`false` 是"**什么都没写**"——「保存并关闭」
不看这个返回值照关，就是把用户的文件换成旧的。⚠️ 关闭流程里那张三选一（保存并关闭 /
丢弃并关闭 / 取消）的两条文案由本文件给出（`extraLabel: "保存并关闭"` /
`confirmLabel: "丢弃并关闭"`）。

⚠️ **`openPath` 必须待在本文件 `useDocuments` 的返回对象上**，而它的使用方（`App.tsx`
的启动 effect）在下面——`useCallback` 的依赖数组在渲染时求值，顺序错了就是
`Cannot access 'openPath' before initialization` → **白屏**。这条在 `App.tsx` 里待了
一整天，搬过来时原样带着。

⚠️ **`openPath` 的身份也是承重的，而且这一条被踩过**（2026-09-25 晚）：启动 effect 的
依赖数组里挂着 `openPath`，"命令行文件只在启动时开一次"正是靠它**身份不变**实现的。
而 `refreshDocs()` 每次都 `setDocs(新数组)`——所以本文件里任何**闭包捕获 `docs`** 的
函数，身份都会跟着刷新，抖动一旦传到 `openPath` 上，effect 就会**反复重跑、把那份文件
反复重新打开**。落地做法是 `docsRef`：`saveDoc` / `切换文档` 从 ref 读列表，
**依赖数组里不放 `docs`**。现场症状（"新建文档后活动标签跳回原文件"）与那次
A/B 量到的 CPU 数在 `docs/07` §4。

⚠️ 步骤与失败口径（存盘前**强制**从编辑器同步一次、取消对话框**不算错误**、两张对话框的
后缀表都含 `mdx`）见下面 App.tsx 那张表——那些描述仍然有效，只是现在的落点在这个文件里。

⚠️ **2026-09-28 起 `loadDir` / `openFolder` 取树时带上当前口径**（`ui/tree-options.ts`），
而依赖数组里放的是那个**字符串指纹**、不是 `settings`——与上面 `所见即所得` 同一条理由
（`settings` 每次刷新设置都换新对象，`loadDir` 的身份会跟着抖）。

---

## `src/ui/useAutosave.ts`（98 行）

**自动保存的定时那一半**（2026-09-25）：`autosave_seconds` 到点判该不该写盘。
⚠️ **它只管"该不该存"，不管"怎么存"**——写盘走传进来的 `saveDoc`
（`useDocuments` 那条，和 `Ctrl+S` 同一条路）；这里另写一份写盘逻辑的话，两条路
迟早分叉，而分叉的那条不会有任何东西报错。

⚠️ 判据是**停笔 N 秒**（"每 N 秒存一次"会在连打十分钟时写二十次盘）。三条**有意留的
口子**：没存过盘的文档不存（要弹「保存为」，半夜弹文件对话框比不存更糟）、不脏不存
（⚠️ 代价如实记：`dirty` 是后端给的、每 300 ms 才刷新，所以"打完最后一个字立刻切走"
那一下可能判不出来，此时改动仍在编辑器里、切页也会同步，只是**盘上那份还是旧的**）、
失败后不重试到疯（失败也算"刚活动过"，下一次尝试至少 N 秒之后）。

⚠️ **依赖数组里只有 `seconds`**：接线对象是每次渲染新建的，直接进依赖等于每帧重建定时器，
所以走 ref 读（同 `EditorPane` 里那几条回调）。⚠️ 调用方必须把返回值（"记一次活动"）
接到编辑器的内容变化那一路（`EditorPane` 的 `onActivity`），**不许**改成轮询
`editorRef.getMarkdown()` 比一比——那是把整篇文档每秒复制一遍来找"变没变"。

---

## `src/ui/useClipboard.ts`（164 行）

**剪贴板四件**（2026-09-25 从 `App.tsx` 搬出）：复制 / 剪切 / 粘贴 ＋ **复制为 Markdown**。

⚠️ **第四件跟另外三件不是一类**：前三个读**选区**（走 `editorRef` 的选区命令），
「复制为 Markdown」取的是**整篇源码**（`getMarkdown()`）——它不看光标在哪。文件头为此
单独写了一节，免得后来者以为漏了一个"复制选区为 Markdown"。

⚠️ `getMarkdown()` 返回 `undefined` 时**静默 return**（编辑器还没挂上），不 toast——
那不是一个用户做错的事。

---

## `src/ui/useImmersive.ts`（184 行）

**沉浸模式：专注 ＋ 全屏**（2026-09-25 从 `App.tsx` 搬出）。两个模式合成**同一个属性**
`data-zen`，外壳只认这一个属性。

⚠️ **收起是 `display:none` 而不是卸载**：侧栏那一页、插件栏那一页、打开着的标签都还在。
卸载的话退出沉浸之后"我刚才在看的那一页"要重新拉一次，慢接口会闪。

⚠️ **全屏读窗口、不记账**：状态的真相在操作系统那里，本文件只把它**镜像**回来
（挂载时 `isFullscreen()` 一次 ＋ `onResized` 订阅）。本地记一个布尔的症状是
"用户按 `F11` 或窗口管理器自己全屏了，菜单里的 ✓ 还是错的"。

⚠️ **`有浮层` 要在调用处逐个列出来**（`settingsOpen || confirmReq !== null || …`），
不能只传一个合成好的布尔——那是把四个互相无关的状态在调用处先捏成一个，
将来加第五个浮层时改的就是 `App.tsx` 而不是这里。**有浮层时 Esc 归浮层用**
（退出沉浸让位），否则 Esc 退出沉浸。

⚠️ **进沉浸时 toast 一次**（`ttlMs = 6000`，默认 3.2 秒太短——那句话要读一遍），
把出路写明：专注 / 全屏 / 两者同时各有一套文案。⚠️ 只在**进入**时弹，退出不弹——
收掉的菜单栏正是界面上唯一写着出路的地方，弹的时机是"出路刚消失"那一刻。
⚠️ 文案承诺的是「鼠标移到窗口最上面可唤回菜单栏」，**不是"再点一下就退出"**：
那条 6px 窄带只是把顶栏滑回来，真的要出去还得点菜单（或按 `Esc`）。

⚠️ **F8 / F11 在本机没法用合成按键验**（Xvfb 的 keymap 里没有 F 键映射），
所以走的是菜单与 Ctrl+Shift+L 那条（同一批 handler）。这个限制记在 `docs/06`。

样式那一半在 `styles/app.css` 的「沉浸模式」一节（`--zen-peek` 那个 6px 感应带、
悬停判在**祖先** `.zen-top` 上而不是工具栏上，免得抖）；两半怎么合起来见 `docs/04` §2.10。

---

## `src/ui/useToasts.ts`（47 行）

**提示条的宿主**（2026-09-25 从 `App.tsx` 搬出，本文件当时 958 行）：`toasts` 数组 ＋
`toast(msg, level?, ttlMs?)` ＋ `dismiss`。

⚠️ 文案照旧由调用方给，这里只管"什么时候消失"。那条规则有两条反直觉的分支：
`error` 留 8 秒（其他 3.2 秒）、**`ttlMs === 0` 是不自动消失**——给"描述状态、不是描述
刚做的那件事"的提示用（比如开机读设置失败）。

⚠️ **样式一行都不在这里**：外观全在 `styles/app.css` 的「提示条」一节（表格见 `docs/04` §2.6），
`ui/Toasts.tsx` 只画。这也是提示条不再往 `app.css` 里堆组件选择器的原因。

---

## `src/ui/useForceFocus.ts`（126 行）

**强制专注的接线**（2026-09-26）：订阅 `nota:focus-state` ＋ `get` / `start` / `stop` / `ack`
四条命令，另导出纯函数 `说时长(毫秒)`（`mm:ss` / `h:mm:ss`，`Math.max(0, …)`——**负数也显示 0:00**，
余额是可能被扣成负的吗不该有，但显示层不该信上游）。

⚠️ **状态有两档"空"**：`null`（还没拉回来）与 `running: false`（拉回来了但没在跑）。
把它们合成一个"没在跑"，界面就会在启动那一瞬间画出一格 `0:00` 的余额——`FocusMeter`
只在 `running` 时渲染，正是为了这个。

---

## `src/ui/FocusMeter.tsx`（75 行）

**状态栏那一格余额**，只读。⚠️ **没在跑时整格不在**（不是显示 `0:00`）；三档阶段各有颜色与
`title` 说明。⚠️ 它**每秒重画**——这也是设置页一个字都不显示会话状态的理由（同一个值两处显示
＝ 两处每秒重画），见 `ui/settings/panes/FocusPane.tsx` 文件头。

---

## `src/ui/FocusAlarmWindow.tsx`（94 行）

**警报窗那一棵树**（`index.html#focus-alarm` 的根，见 `src/main.tsx` 的分叉）：
整块红屏 ＋ 大白字 ＋ `I'm Back`。

⚠️ **它不自己 `close()`**：文件头写着"这个窗**等着宿主来关**，这里什么都不做，尤其**不要**
自己 `close()`"。收窗在 `focus/alarm.rs::对账`——**两边都在等对方**正是 BUG-41 的形状，
所以这一段注释与那边的实现要一起读。
⚠️ Esc 与按钮走**同一条** `ack`；⚠️ 按钮按过就锁成「这就回去…」（防连点，也防"按下去了
但其实没生效"那种错觉）。

---

## `src/ui/useFocusAlarmSound.ts`（165 行）

**警报声**，前端合成，这是**主路径**（宿主那条 `系统提示音` 是兜底，不是主方案）。

- **为什么在前端**：宿主出声要先合成 WAV、写磁盘、再找播放器，三件事都要处理平台差异；
  Web Audio 这边几行就写完，音色还能当场调。用户要的是"尖锐"，这是**耳朵说了算**的事。
- **音色**：一个方波（谐波最丰富，听起来"尖"）× 在 880 / 1245 Hz 之间来回跳，
  每 0.22 秒一跳、共 11 跳 ≈ 2.4 秒——欧洲那种楼宇警报器的节奏，⚠️ **不是一声"哔"**。
  音量封顶 **0.28**：再大在笔记本内置喇叭上会**削波**，听起来是破音而不是更响。
- ⚠️ **WebKit 可能摁住没有用户手势的 `AudioContext`**：所以开始专注那一下先调 `预热音频()`
  （那是个真手势）；万一还是播不出来，`响警报` 返回 `false`，调用方转去叫 `nota_focus_beep`。
- ⚠️ **只在主窗挂**：那条 `emit` 是发给所有窗口的，警报窗也挂就是同一段警报响两遍。
- ⚠️ **本机（无声卡的 Xvfb）验不了"有没有声音"**——验到的只是"这条路跑到了、没抛异常"。

---

## `src/ui/useFocusIntro.ts`（111 行）

**「强制专注」的首次说明**（2026-09-26）。用户点名要的，原话在文件头：
要明确告诉用户这可能会用到什么系统权限、保证不窃取数据，并且说明"你随时能绕开它，
但那样也就失去了意义"。

⚠️ **它不是礼貌，是必要条件**：这个模式会弹一个**置顶、全屏、抢焦点**的窗压在你正在用的
任何程序上面。不事先讲明白就弹，那是恶意软件的行为；讲了再弹，那是用户自己签的字——
差别全在这个弹窗上。
⚠️ **判据是 `settings.focus.introduced`，要落盘**：只在内存里的话每次重启都拦一次，
用户很快就学会闭眼点掉。⚠️ **取消 ＝ 不开始**（不是"关掉一个提示"）。
⚠️ 同一份话在 `FocusPane.tsx` 末尾还有一个 `Note`（"事后还能查"的那一份），**改一处要改两处**。

---

## `src/ui/settings/panes/FocusPane.tsx`（180 行）

偏好设置第九页「强制专注」（**顺序的唯一真相源是 `SettingsDialog.tsx` 的 `ORDER`**：文件 / 编辑器 / 图像 / Markdown / 导出 / 外观 / 文档主题 / 快捷键 / **强制专注** / **拓展** / 通用）。⚠️ **核心功能的设置页，不是插件的**。五个组：账户 / 权重 /
宽限 / 警报 ＋ 末尾那块 `Note`。

⚠️ **这一页最容易写错的是文案**：「专注总时长」不是"这一轮要坐多久"，是**账户的上限**；
「警报时长」不是"每隔多久响一次"，是**开局给多少**。把它们说成计时器，就等于把这个功能的
设计讲反了——所以每一条的 `description` 都不是装饰。

⚠️ **「这些应用里不算摸鱼」那一格是灰着的，而且它不是"还没做完"，是"决定不做"**：
用户 2026-09-26 明确砍掉了它（「宽限名单不用开了。把这个功能删掉吧，干脆」），字段已经从
`settings/focus.rs` 里删干净了。留着而不是藏起来，是**告诉用户"你找不到这条路不是因为你
没找到"**。⚠️ 它与 `ExportPane::选择…` / `FilesPane::恢复草稿` 那几格的**区别在 `title`**：
那三格写「尚未实现」（会做的），这一格写「决定不做」（不做的）——写成一样的，用户会一直等它。

---

## `src/styles/focus.css`（171 行 → 2026-09-27 加第三块）

强制专注的样式**三块**：**状态栏那一格**（`.status-focus*`，借 `app.css` 状态栏那套，
所以它必须在 `app.css` 之后）＋ **警报窗那一整棵树**（`.alarm-*`，画在**另一个窗口**里，
那边没有主窗的外壳，也没有人和它争优先级）＋ **结束后的总结框**（`.focus-summary*`，
2026-09-27 加，必须在 `overlay.css` 之后）。

⚠️ 颜色一律走 `theme.css` 的变量，**只有警报窗那一块例外**——红屏是"出事了"，
不该跟着用户的界面风格走。
⚠️ 走神中那一格用 `--warn`（黄）而不是 `--danger`（红）：黄是"正在往那边走"，红是"已经出事了"。
两档同色的话，用户看不出"我还有救"和"已经响了"的分别。
⚠️ **总结框那一族用两个类**（`.confirm-dialog.focus-summary`）而不是靠 import 顺序：
`gate.css` 那种写法把正确性押在 `main.tsx` 上，失效时不报错。
⚠️ **BUG-44**（2026-09-27 修）：`.alarm-card` 的 `max-width` 原来是 `22ch`，而 `ch` 量的
是**卡片自己的**字号（继承 `body` 的 15px），标题却是 `clamp(2.5rem, 9vw, 7rem)`——
800 宽的屏上标题 72px、卡片只有 160px 出头，再扣掉它自己那条 `padding: 0 5vw`
（`border-box` 之下是从 `max-width` 里扣的），留给字的只剩几十像素：**标题一行一个字
竖着排、按钮被挤出视口**。现在跟着 `--alarm-title-size` 走（`calc(… * 9)`），
**卡片宽度与标题字号同一个出处**，两端屏都不用再猜。

---

## `src/ui/focus-summary.ts`（265 行）

**一轮专注的读数与那张卡**（2026-09-27 新增，用户点名：「做一下专注模式结束后的总结功能
就是将这一次专注模式的情况显示出来，并且像心电图那样也支持导出」）。

⚠️ **宿主一行没改、这是有意的**：计时线程每秒广播的那份快照里已经有这一轮的**全部账目**
（`elapsed_ms` / `focused_ms` / `away_total_ms` / `alarms` / `balance_ms`），
真正缺的只有**一条曲线**——而那条曲线就是"每秒那一个余额"攒出来的。

三条判据（每条都有一个"写错了也不报错"的症状）：

| 判据 | 错的症状 |
|---|---|
| **采样上限 900（＝15 分钟）之后把间隔翻倍，相邻两点取余额大的那个** | 取平均/取后一个会把"扣空／攒满"两个尖角**磨圆**——而这条曲线要传达的正是那两个尖角。代价是"扣到底"可能被记成"还没到底"，所以卡片上另有**警报次数**当判据 |
| **专注率的分母是「专注 ＋ 离开」** | 把**警报冻住**那段算进分母，等于因为"警报响了"而拉低专注率——而警报恰恰是他**回来过**的证据 |
| **分母为 0 时返回 `null` 而不是 `0%`** | 画 `0%` 是在说他一次都没专注过，那是假话；卡片那一格画破折号 |

⚠️ 卡片右上的时刻走 `t()` 的**一条格式串**（`{0}年{1}月{2}日 {3}`），不按语言写 `if`
（同写作统计那张卡的手法）；时分**在这里补好零**再传进去。⚠️ `subtitle` 是字面量
`"Focus Session"`、**不过 `t()`**（英文小字，同 `plugins/stats/main.lua`）。
用例 **34** 条在 `tests/focus-summary.test.ts`（⚠️ 跑它要 `--alias:@=./src`）。

---

## `src/ui/useFocusTrace.ts`

**这一轮的轨迹 ＋ 结束时交总结**（2026-09-27 新增）。把每秒那一个快照攒成一条余额曲线，
`running` 从 true 掉到 false 那一下造出 `总结` 交给上层。

⭐ **为什么必须在前端攒**：宿主 `nota_focus_stop` 会把账本**清成空快照**
（`focus::停下` → `快照::空()`），所以"这一轮到底怎么样"只能在结束**之前**就留着。

⚠️ 三条坑写在文件头：**曲线存 `useRef`**（每秒 `setState` 白跑，而且 `setState` 进依赖会
**转成死循环**——`记一笔` 对同一秒返回的是新数组）· **`在跑` 那个 ref 是"挂载时那一发
空快照"的补丁**（少了它，一进来就被判成"刚结束"，总结当场弹出来）· **`收起` 之后 `结算`
要清干净**。⚠️ 它**不认识卡片**，只交一份 `总结`。

---

## `src/ui/FocusSummaryDialog.tsx`

**一轮结束后那份报告**（2026-09-27 新增）：左边五格（本轮时长 / 专注 / 离开 / 警报 /
专注占比）、右边分享卡预览、底下三颗按钮（保存分享图 / 复制分享图 / 知道了）。

⚠️ **它不是 `useDialogs` 那一族**：那四个框（确认／输入／图像／Emoji）都是"问一句、
等一个答案"（`askXxx` 返回 Promise、`answerXxx` 兑现），而这个框**不问任何事**——
它是一份看完点掉的报告，硬塞进那个 Promise 形状就得凭空造一个谁也不读的返回值。
所以它由 `App.tsx` 直接持有（`useFocusTrace` 给的 `结算`），**不走 `askXxx`**。
⚠️ 外壳借 `.confirm-*`，但 `role` 是 **`dialog` 而不是 `alertdialog`**：后者是"打断你、
必须回答"，而这一份是用户自己按了"停止专注"之后的**回执**。
⚠️ **只接 `Esc`、不接 `Enter`**（Enter 交给按钮自己：焦点在「知道了」上是关掉、
在「保存分享图」上是存图）。⚠️ **`App.tsx` 里它必须排在 `useImmersive` 之前**——
`有浮层` 要数进 `专注总结`，否则框开着按 `Esc` 会连沉浸模式一起退掉。

---

## `src/ui/ShareCard.tsx`

**分享图那一块的唯一实现**（2026-09-27 从 `ui/PanelBody.tsx` 抽出来）。

⚠️ **抽出来的原因只有一个**：强制专注的总结框要共用同一份"存／复制"，而那个框
**不是面板**、够不着 `PanelBody.tsx` 里的私有组件。抽完之后 `.panel-share*` 那几个类名
一个没改（仍在 `share.css` 里）。
⚠️ 两条理由从原处原样搬来：**结果留在原地而不是 toast**（用户正盯着那张图看，
toast 会自己消失）· **剪贴板尽力而为、能力先问后做**。
⚠️ `useCardPalette` 用的是 `MutationObserver`（盯 `data-ui-mode`）——主题一换，
那张图跟着换色。

---

## `src-tauri/src/mcp/mod.rs`（725 行）

**MCP 服务器：让 AI 客户端够到用户正开着的那个 Nota**（2026-09-27 新增）。

协议**朴素得刻意**：stdio 上一行一条 JSON-RPC 2.0（`\n` 分隔，**不是** LSP 那套
`Content-Length`），方法只有四个：`initialize` / `ping` / `tools/list` / `tools/call`。
工具清单在 `mcp/tools.rs`，宿主能力在 `mcp/host.rs`。

⚠️ **三种下场，一个命令**（`nota --mcp`，判据在 `cli.rs::要开_mcp`）。
⚠️ **2026-09-29 改了口径**：`--mcp` **永远不开窗**（原来"一份都没跑就自己当那份
Nota"的做法就是用户报的「不停新建窗口」，编号 **BUG-55**，`docs/07` §2）：

| 场景 | 这一份进程做什么 |
|---|---|
| **已经有 Nota 在跑** | **不开窗、不当主人**，只把自己变成一根管子（stdin ←→ `nota.sock` ←→ 那一份），跑完 `exit(0)` |
| 一份都没跑（连不上） | ❌ **不建窗、不抢单实例的位置**：`stderr` 一句"请先打开 Nota"，**退出码 2** |
| 会话中途断了 | 同上，**退出码 3** |
| 别的进程连上来 | `single_instance.rs` 的接收线程认出暗号（`MCP暗号`，`\0nota-mcp\n`）交给 `服务流`，**在跑着的那一份**里服务 MCP |

⚠️ **第一条才是这条功能的意义**：让 `--mcp` 总去起一份"无头 Nota"最省事，
但那份手里**一份文档都没有**——用户正在写的东西在另一个进程里，AI 看到的是一个空编辑器。
⚠️ 代价如实记：**转接失败时不再有"替你开一份"这回事**，因为那正是那个 bug 的形状
（MCP 客户端见服务器没了会再起一个，而客户端退出时我们**故意不关窗**，于是"打地鼠"）。
⚠️ `接上()` 的返回是枚举 `结局`（`会话跑完` / `没人听` / `会话断了`）而**不是 `Result`**：
老写法里 `Err` 分不清后两者，调用方把两者都读成"那就自己开一份吧"。⚠️ 同批删掉了
`mcp::起`（在进程里服务 stdin/stdout 那一半）与 `setup` ⑨ 那一格：它今天走不到。

⚠️ 前端对应的那一格：`DocumentChangedPayload.origin` 多了 `"mcp"`
（`ui/useAppEvents.ts` 把 AI 改的文档整篇换掉）。

---

## `src-tauri/src/mcp/host.rs`（212 行）

MCP 要用到的那几件**宿主能力**，收成一个 `宿主` trait（2026-09-27）。

⚠️ **抽 trait 不是为了"将来还能接别的宿主"（那是猜），是为了测得到**：
真实现要 `AppHandle`，而它在单测里建不出来（要真的 `App` / 事件循环）。
有了这层，`mcp/tools.rs` 那一整套工具能拿一份**假宿主**跑通。

⚠️ 于是有一条纪律：**工具里不许出现第二条"直接问应用"的路**——想让某个工具多做一件事，
就给它加一个 trait 方法；绕过 trait 直接摸 `AppState` 的写法会变成
"单测跑得到、真机上没人跑过"那种半边绿。

⚠️ 真实现每一件都落在**已经有别的东西在用**的那条路上：读文档 = `DocumentStore`
（写作统计插件读的也是它）、写文档 = `sync()` ＋ `nota:document-changed`
（与 Lua 插件 `document.write` 一个字都不差）。

---

## `src-tauri/src/mcp/tools.rs`（492 行）

MCP 的**工具清单**：`nota_info` / `nota_documents` / `nota_read` / `nota_write` / `nota_open` 五个
（2026-09-27 新增）。

判据只有一条：**这件事在不经 MCP 的时候做不到或很别扭**——AI 客户端自己就能读盘写盘，
它做不到的是够到 **Nota 里正开着的那一份**（可能还没存盘、可能刚被改了一半、可能连路径都还没有）。

⚠️ 三个"想做但这一版没做"的（细粒度编辑那一类）如实写在它文件头，不是"想过了决定不做"。
用例 31 条（`mod.rs` 18 ＋ 本文件 13）。

---

## `src-tauri/src/plugin/export.rs`（323 行）

**把一个已经装着的插件打回成一个 `.nota-plugin` 包**（2026-09-27）：`PluginHost::导出` / `导出默认名`。

起因是用户那句「完全没有拓展管理面板。做一个。可以**导入，导出和卸载**拓展」——
装（`plugin/install.rs`）与卸本来就在，缺的是导出。

⚠️ 与 `package.rs` 那句「包是只读的」**不冲突**：那条管**造包**（作者侧 `tools/pack-plugin.py`，
要拿私钥签名，私钥绝不能进宿主），这条管**把用户磁盘上已经躺着的那份原样收拢**，一个字节都不签。

⚠️ 两条用处：内置插件（`origin == "builtin"`）**卸不掉**，导出是把它拷出来改一改的唯一一条路；
自己装的插件想备份／发给别人也走它。

⚠️ **导出的包里没有用户的东西**——插件设置（`plugin-settings/<id>.toml`，AI 的密钥就在那儿）与
插件数据（`plugin-data/<id>/`）**本来就不在插件目录里**（`paths.rs` 三个目录分开），
所以不是靠一份排除名单做到的。改这个流程时别把这条性质弄丢。

---

## `src/editor/video-view.ts`（193 行）

**图片语法里的地址指向视频时，画成播放器**（2026-09-28 新建，用户原话
「…**图片语法指向 `.mp4` 当视频**…都是简单的小功能」）。

```ts
export const 视频后缀: readonly string[];        // mp4 / m4v / webm / ogv
export function 是视频地址(地址: string): boolean;
export const 视频视图 = $view(imageSchema.node, …);  // 一个 NodeView
```

### 它解决的那个具体问题

`![](a.mp4)` 今天渲染成 `<img src="a.mp4">`，浏览器画不出图，产物是一颗**破图标**
＋ `alt` 那行字。**而 Markdown 源码是对的**——这个写法在别的编辑器里完全合法。
坏的是屏幕，不是文件；所以这一份只改屏幕。

### 判据只有一条：地址的后缀

不看文件在不在、不看它多大、不嗅开头那几个字节。理由两条：① 编辑器里那个地址
**可能根本不是本地路径**（`https://…`、`data:`、相对路径），"它存不存在"在这个
位置没有可靠的答案；② 按后缀认类型这件事本仓已经有一处（`editor/file-kind.ts`），
所以这里**复用**它的 `后缀()`，不自己再写一遍"取最后那个点后面的东西"。

⚠️ **先 `split(/[?#]/, 1)` 切掉查询串与片段**再取后缀——`a.mp4?t=3` 与
`a.mp4#t=3`（后者是 Media Fragments，浏览器自己认）都是常见写法，不切的话后缀
会读成 `mp4?t=3`，判据当场失效，症状是"**带时间戳的那种链接画不成播放器**"，
看着像视频支持时灵时不灵。

⚠️ 那张单子**故意短**：`.mov` / `.mkv` / `.avi` 的**编码不保证** WebKitGTK 播得动
（H.265、ProRes、各种音轨），认了之后的产物是**一块黑框**——比破图标更糟，
破图至少还写着 `alt`。理由写在那个常量上，别顺手放宽。

### ⚠️ 只改屏幕，不改源码

走的是 NodeView（`$view(imageSchema.node, …)`），**不是**换节点类型。换类型要把
**解析与序列化**一起接过来（同一个 `![](…)` 得能读能写），而那是 preset 的
`imageSchema` 在管、`editor/image-attrs.ts` 又在上面补过属性。NodeView 只接手
"画成什么"，源码一个字节都不动、**存盘那条路完全没碰**，所以"打开再存字节不变"
那条不变量与这一项无关。

- **图片那一支**返回的是**裸 `<img>`**，属性与 preset 的 `toDOM` **逐条对齐**
  （`src` / `alt` / `title`，空串照写）——少写一个的症状是"加了视频支持之后某张图的
  `title` 没了"，与视频八竿子打不着。
- **视频那一支**包一层 `<span class="nota-video">`：选中高亮与 `draggable` 是挂在
  节点视图**根**上的，让它们落在盒子上，就别去动视频自己那身原生控件。
- `update` 在**类别变了**（图 ↔ 视频）时 `return false`，让 ProseMirror 重建——不写
  这一条的话，用户把 `![](a.mp4)` 改成 `![](a.png)` 之后屏幕上**还是一块播放器**。

### 三种实例都生效，但导出那条路要另写一条 CSS

`editor/create.ts` 是**唯一建实例的地方**，所以可编辑 / 分屏预览 / 导出用的离屏
实例三种都拿到这个视图。⚠️ 但 `editor/export.ts` 摘的是**渲染后的 `innerHTML`**，
而它那一步会**把 `nota-` 开头的类名全摘掉**——于是 `src/styles/video.css` 里那条
选择器在导出的 HTML 里一个字都匹配不上。尺寸约束只能靠**元素选择器**，也就是
三份文档主题里那一句 `video`（导出会按当前主题把那份 CSS 嵌进去）。
漏一份的症状是"某几套主题导出之后视频顶宽"，截图分享时才发现；
`tests/video-view.test.ts` 第三组盯着这三处接线（`create.ts` 的 `.use()` /
`main.tsx` 的 import / 三份主题里那条 `video`）。

### ⚠️ 三件没验的事

本仓的编辑器测试**没有 DOM**（无 jsdom、无头环境里也没有 WebKit 窗口），所以
**点播放按钮播不播、拖进度条会不会被当成拖整颗节点、全屏之后什么形状**这三件
只能开窗目检，账在 `docs/07` 第 87 项与 §4。⚠️ 万一"点了没反应"，一行就能换
（给那个视图加 `stopEvent: () => true`），代价是**点一下不再选中这个节点**；
默认不加是为了跟图片一致——图片点一下就是选中，视频没有理由是另一回事。

## `src/editor/text-handlers.ts`（75 行）

**序列化时那一串套着的文本处理器**（2026-09-27 从 `create.ts` 拆出）：
`文本处理器链(原文)` 把**六层**套起来——行首竖线 / **正文里的 `$`** / 孤立波浪号 / 行首等号 /
原子后的空格 / 行首井号。⚠️ **第二层是 2026-10-04 加的**（`math-delim.ts` 的 `不转义美元`，
见 `docs/07` BUG-59）。

⚠️ 拆出来不全是因为行数（那块 `.config()` 把 `create.ts` 顶到 1011 行、破了 `docs/09` §4 那条硬线），
而是**这几层的理由、顺序的讲究、以及"只能挂 `handlers.text`、挂 `$remark` 插件是静默空操作"
本来就是同一条知识**，散在 `.config()` 里反而更难看懂。

⚠️ 顺序可以换（六条判据不相交），但换完要重跑 `tests/table-pipe.test.ts`、
`tests/math-delim.test.ts` 与 `tests/atom-space.test.ts`——"看起来不相交"与"真的不相交"是两件事。

⚠️ 最内层靠 `prev.handlers?.text`（生产路径上它一直在），**测试里必须自己把
`defaultHandlers.text` 传进来**：不传等于连上游的转义一起省了，真表格里会写出坏字节。

---

## `src/editor/table-pipe.ts`（276 行）

**行首那颗多余的反斜杠**（2026-09-27 新建）：`| 1 | 2 | 3 |` 这样一行**正文**，
在所见即所得与源码模式之间切一次回来就被加上一颗 `\`（用户原话：
「切换到所见即所得模式再切换回来会自动添加「\」，表格出不来」）。

⚠️ 那颗反斜杠**不是本仓写的**，是 `mdast-util-gfm-table` 的 unsafe 表
（`{atBreak: true, character: '|', after: '[\t :-]'}`）——序列化器**一行一行地写**，
写到这一行时看不见下一行是不是分隔行，只好一律转义。

⚠️ **判据 2026-10-04 换过一次**：第一版是"这一段物理上只能占一行才放回"（文本节点的值里
没有 `\n`、**且**兄弟里没有 `break`），用户把两行放进**同一段**（`| 1 | 2 | 3 |` ＋ 硬换行 ＋
`$ 你好 $`）之后两条**都**不成立，于是病照旧——**能不能拼成表只跟下一行长什么样有关，
与这一段跨不跨行无关**。新判据：**只有"下一行像表格的分隔行"时才把转义留下，其余一律放回**
（三档：像 / 一定不是 / 说不准（留））；`state.stack` 里有 `tableCell` 时一律不动
（格子里那颗竖线是分界线）。⚠️ "下一行像不像"要比**它写在文件里的原样**，预先抹掉那颗 `\`
会把"两颗都被转义的伤文件"放成一张首格被拼成 `| 1` 的残表。

⚠️ **用户那句话的后半截不在这颗反斜杠上**：它会被分词器当转义吃掉，表照样成形
（同名测试第四组最后一条钉着实测）——这一层修的是"**文件里多出一颗用户没打过的字符**"。
后半截「表格出不来」的病根是 **BUG-51**（敲收尾竖线那条输入规则静默退场），**已结清**。
用例 **39** 条在 `tests/table-pipe.test.ts`。

---

## `src/ui/pluginText.ts`（136 行）

**插件在界面上那几句人话**（2026-09-27 新建）：它从哪儿来、签没签、语言对不对得上、
能力叫什么、面板摆在哪儿。

⚠️ 起因是同一句「自装 · 已验证」要在**两个界面**上出现（右侧插件栏 ＋ 设置里的「拓展」页）：
谁抄第二份，往后就是"改一处、另一处不动"，而那种不一致**不报错**——
两个界面各说各的，用户只会觉得自己看错了。

⚠️ **只有文案**：没有 JSX、没有状态、不碰 `api`，摆成什么样归两个界面自己。
⚠️ **全是函数，不是模块级常量表**：模块级求值时 `t` 还是没订阅的那个版本；
另外 `tools/i18n-check.sh` 数的是源码里**字面写出来**的 `t("…")`，写成 `t(表[id])` 会被判成废键 → 闸门 FAIL。

---

## `src/ui/settings/panes/ExtensionsPane.tsx`（275 行）

**「拓展」那一页**（2026-09-27 新建；设置里的第**十**页，排在「强制专注」与「通用」之间）。
用户原话：「完全没有拓展管理面板。做一个。可以导入，导出和卸载拓展」。

⚠️ 与右侧「插件」栏的分工是**诊断 vs 管理**：那一栏是出问题时第一眼看的地方
（栏宽 260px、插件一多就得滚着读），这一页把装 / 导出 / 卸载三件事摆在一条行上、
宽度够、能对着读完再决定。

⚠️ 两边用的是**同一份数据、同一批动作**（`usePlugins` 的 `plugins` 与 `动作`），
所以不会出现"这一栏说装好了、那一页还没有"这种两份真相源。

⚠️ 三件事里**只有导出是这一轮新做的**（装与卸早就在、右侧栏一直在用），
宿主那半在 `plugin/export.rs`；文案在 `ui/pluginText.ts`。

---

## 这一轮删掉的三个前端文件（2026-09-25）

| 曾经是 | 现在归谁 |
|---|---|
| `src/ui/useSlidev.ts`（312 行） | **插件**（`plugins/slidev/main.lua`）：会话编排、探测、轮询都是插件的事。宿主只剩机制（`src-tauri/src/devserver.rs`），前端只剩**面板**（插件栏里那一页，由插件自己 `register_panel` 声明） |
| `src/ui/SlidevPanel.tsx`（164 行） | 同一个「装没装」形状的面板现在由**插件自己**出（`kind = "buttons"` ＋ `kind = "text"`），宿主那一侧只留 `PandocPanel.tsx` 一个调用方 |
| `src/ui/SlidevPreview.tsx`（106 行） | 面板 DSL 里的 **`kind = "frame"`**：插件声明一块 frame，地址由宿主填（只能指向**这个插件自己**那场 devserver 会话） |

⚠️ **这一轮的判据是「归属」不是「行数」**：这三样东西从头到尾只有 Slidev 一个用户，
它们进宿主就等于替一个插件写实现。搬走之后**宿主一行 Slidev 的字样都没有**，
而下一个想做预览的插件（比如把导出的 HTML 拿浏览器看）走的是同一条路。
完整理由与取舍见 `docs/01-architecture.md` 的「Slidev 预览」那一节。

---

## 相关文档

| 要查什么 | 去哪 |
|---|---|
| 启动顺序、锁序、两条通道、插件分层 | `docs/01-architecture.md` |
| 字段级的数据结构、常量、两条真相口径 | `docs/03-data-structures.md` |
| 编辑器装配与去抖/整篇替换语义 | `docs/05-editor-bridge.md` |
| 已知缺陷与 backlog（编号） | `docs/07-feature-status.md` |
| 能力表与怎么写插件 | `docs/11-writing-a-plugin.md`、`docs/13-lua-api.md` |
