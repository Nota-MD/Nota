# 01 · 运行时架构

> 最后同步：2026-10-17

本文讲**运行时**：进程怎么起来、状态放在哪、两条通道各有什么、插件在哪一层被装配。
逐文件的接口签名在 `docs/02-modules.md`，字段级的数据结构在 `docs/03-data-structures.md`。

---

## 这是什么

**Nota** 是一个 Tauri 2 的桌面 Markdown 编辑器，所见即所得，带一套 **Lua 插件系统**。

设计上最要紧的一条判定是：**文本的真相在前端**（ProseMirror 文档树），后端持有一份
**300ms 去抖的镜像**。这条不是随意定的，理由与代价写在 `src-tauri/src/document/mod.rs`
的文件头——改任何"后端改文本"的路径之前先读那一段。

### 技术栈

| 层 | 用什么 |
|---|---|
| 后端 | Rust 2021（`rust-version = 1.85`），Tauri 2，crate `nota_lib` |
| 前端 | React 19 + TypeScript 5.9，Vite 7，`@/` 别名指 `src/` |
| 编辑器内核 | Milkdown 7（底层是裸 ProseMirror + remark） |
| 插件运行时 | Lua 5.4（mlua 0.12，`vendored` + `send`），**一个插件一个 `Lua` 状态** |
| 外壳 | WebKitGTK 4.1（`webkit2gtk-4.1`）里的一个 WebView |

⚠️ `mlua` 的 `send` feature **不是可选的**：`Lua` 要放进 Tauri 的托管状态，不加它整个
结构编不过，而报错信息不会提示需要加 `send`。

---

## 两个进程、两个运行时：边界画在哪

```
┌─ Rust 进程 ───────────────────────────────┐   ┌─ WebView 里的 JS 运行时 ──────────┐
│                                           │   │                                   │
│  Tauri 外壳 + #[tauri::command] 命令层     │   │  App.tsx（状态编排 + 布局）        │
│  AppState（四把锁）                        │   │  EditorPane（Milkdown/CodeMirror）│
│  DocumentStore（文档镜像）                 │◄─►│  **编辑器里的文本 = 真相**（注¹）  │
│  Settings（设置）                          │   │  Sidebar / StatusBar / Toasts      │
│  PluginHost → LuaPlugin → Lua 状态         │   │                                   │
│  磁盘、`git` 子进程                        │   │                                   │
└───────────────────────────────────────────┘   └───────────────────────────────────┘
        ▲                                                        ▲
        └───────────── 只有两条通道：invoke / event ─────────────┘
```

边界清楚的一面：

- **磁盘、设置文件、工作区、`git` 子进程只在 Rust 侧**。WebView 拿不到文件句柄，
  只能通过命令去要。CSP 里 `default-src 'self'`、`connect-src 'self' ipc:` 把网络也掐了。
- **DOM 只在 WebView 侧**。Rust 侧不持有任何控件树（对比 Folio：那边是 GTK 原生控件，
  宿主与 JS 都要操作同一棵树，所以 Folio 挑了宿主做真相。Nota 没有这个问题，也就
  没有理由把真相搬去后端）。

边界需要小心的一面：

- **唯一一份"会短暂不一致"的数据是文档文本**。前端改了 → 300ms 后才推给后端。
  所有"要读文档"的动作（存盘、插件读文档、导出）都**必须先强制同步一次**。
- **`invoke` 的载荷是 JSON**，不是共享内存。Rust 的结构体与 `src/bridge/ipc.ts` 里的
  interface 是**两份手抄的定义**，改一边必须同批改另一边——不一致时 `invoke` 不报错，
  只会返回一个少了字段的对象，然后在某个 `.map` 上抛错。

CSP **只写在 `src-tauri/tauri.conf.json`** 里，`index.html` 里不许再写一份
（两个策略会同时生效并互相冲突）。现在的策略是：

```
default-src 'self'; img-src 'self' asset: http://asset.localhost data: blob: https: http:;
style-src 'self' 'unsafe-inline'; font-src 'self' data:; script-src 'self';
worker-src 'self' blob:; connect-src 'self' ipc: http://ipc.localhost
```

两处**不是随手写的**，改之前先看这里：

- **`asset:` / `http://asset.localhost`**（在 `img-src` 里）配套的是
  `capabilities` 里的 `assetProtocol` 开关——⚠️ **它只服务图片**。
  主题里的字体**走的是 `data:`**，不走 asset，理由是实测出来的：
  wry 注册 `asset:` 时只登记了 `register_uri_scheme_as_secure`、
  **没登记** `register_uri_scheme_as_cors_enabled`，而 `@font-face` 发的是
  CORS 模式的请求，结果是 `document.fonts.load()` 抛 `NetworkError`、字体静默退回
  系统字体。判据与实测过程记在 `src-tauri/src/themes.rs` 顶上。
  ⚠️ 所以**为了"统一"把 `font-src` 加回 `asset:` 是错的**——那一条无效。
- **`style-src` 里的 `'unsafe-inline'`** 是文档主题的**前提**：主题 CSS 是运行时
  注入 `<style id="nota-doc-theme">` 的（`styles/doc-theme.ts`），没有它主题一律不生效。
- **`img-src` 的 `https:` / `http:`** 服务于 GitHub Markdown 徽章和远程图片。
  它只放行图片，不放行脚本、iframe 或通用网络请求；文档第一次打开时，远程图片
  仍可能向图片服务器暴露访问时间与 IP。

---

## 启动顺序（`lib.rs::run()`）

这条顺序**有理由**，`run()` 里每一步都注了为什么。整条链是：

```rust
tauri::Builder::default()
    .plugin(tauri_plugin_dialog::init())   // ① Tauri 自带的三个插件先装
    .plugin(tauri_plugin_fs::init())
    .plugin(tauri_plugin_opener::init())
    .setup(|app| { /* ② 载设置 → 建共享状态 → 发现并加载插件 → manage */ })
    .invoke_handler(tauri::generate_handler![ …45 项… ])          // ③
    .on_window_event(|window, event| { /* ④ 焦点与销毁都按 label 分派（main / 警报窗） */ })
    .run(tauri::generate_context!())
    .expect("Nota 启动失败");                                  // ⑤
```

⚠️ **`.setup()` 之前还有几步，都不在上面那张图里**。`lib.rs::配置_webkit_渲染器()`
（2026-10-18 改）默认**保留 WebKitGTK 的 DMA-BUF/GPU 路径**。2026-09-24 曾因
WebKit 随机退出而默认设 `WEBKIT_DISABLE_DMABUF_RENDERER=1`，但实机使用证明这会把
滚动和代码块打字压到 15–30Hz。现在只有显式 `NOTA_SAFE_RENDERING=1` 才进入旧兼容回退；
用户自己给 `WEBKIT_DISABLE_DMABUF_RENDERER` 任何值时仍完全听用户的。容器目检那套配方
（`docs/06` §5）仍可**另外**开 `WEBKIT_DISABLE_COMPOSITING_MODE`，两者不是一回事。

### ⓿ `Builder::build()` 之前那三步（单实例 / `--mcp` / `--new-window`）

上面那张图从 `tauri::Builder::default()` 开始，而这三步都排在它**前面**。
它们判的是同一件事——**这一份进程到底要不要开窗**——所以必须在任何东西建起来之前
判完（`lib.rs:107-172` 三段注释就是它们的理由，下面只讲结构上的四件事）。

| 顺序 | 什么时候走 | 做什么 | 为什么在这个位置 |
|---|---|---|---|
| ⓿''' `--mcp` | AI 客户端（Claude Desktop / Cursor 那一类）用 `nota --mcp` 把 Nota 当**子进程**拉起来 | `mcp::接上()` → `结局`：**已经有一份 Nota 在跑** → 把自己的 stdio 接到那一份的 socket 上，跑完 `exit(0)`（这一份什么都没建）；**一份都没跑** → `stderr` 说一句"请先打开 Nota"、**退出码 2**；**会话中途断了** → **退出码 3**。⚠️ **三条路都在这里退出**（2026-09-29 改，见下） | ⚠️ 排在单实例**前面**：要先问"能不能转接"才知道这一份要不要当主人。⚠️ 它今天**既不建窗也不抢单实例的位置**（三条路全退出），所以"禁不禁用单实例"对它已经没有意义 |
| ⓿' `--new-window` | 用户点了标签页右键的「在新窗口中打开」（`commands/window.rs` `spawn` 一份自己，带上路径与这个选项） | **整关跳过单实例**：这一份既不 `connect` 也不 `bind` | 单实例的语义是"第二份把参数转交给第一份、自己退出"，与"用户主动要再开一个窗口"正好相反。⚠️ 跳过的是**抢**不是**收**：`nota.sock` 仍归第一份，第三次普通启动照旧转交给**第一份**（不是最近开的这一份）。⚠️ 代价如实记：这一份**不持有 socket**，收不到 `nota:second-instance`——"把标签页送回原来那个窗口"做不了（用户说了不用考虑） |
| ⓿ 单实例 | 每一次普通启动 | `single_instance::抢占(要打开的那个文件)` → `第一个(听)` 留着接收线程 / `已转交` 直接 `exit(0)` / `Err` **照常单开**（单实例是便利，不是前提） | ⚠️ **必须早于 `Builder::build()`**：晚了会先闪出一个空窗口再退出——用户看到的是"Nota 闪了一下就没了"，比没有单实例还糟。⚠️ 转交那条走 `std::process::exit` 而不是从 `run()` 里返回：这里什么都还没起，**没有清理可做**，不想让人误以为可以在这儿做清理。⚠️ 挑"要打开哪个"只走 `cli.rs` 那一份规则——挑出来的东西还要转交给已经在跑的那一份，那边也调同一个函数（第二个真相源会让两边看法不一致） |

⚠️ **三条判定都落在 `lib.rs`，不往 `single_instance.rs` 里搬**：那个文件的语义是
「第二份转交给第一份」，"用户主动要再开一个窗口"不在它的职责里——`docs/09` §2
那一行专门记了这条，别把例外搬进去。
⚠️ `--mcp` 那条转接**失败就是失败，不许"那就自己开一份"**（2026-09-29 改）：
老口径是"转接失败照常启动"，代价是 **MCP 客户端每重启一次它的服务器进程，
用户桌上就多一个他没要过的 Nota 窗口**（客户端见服务器没了会再起一个，
而我们**故意不关窗**），用户报的原话就是「现在会不停新建窗口」——
账在 `mcp` 模块头「为什么形态 2 不开窗」，编号 **BUG-55**（`docs/07` §2）。
⚠️ 用户本来就得有一份 Nota 才有意义（形态 ① 的全部价值是够到**用户此刻正编辑
的那一份**），所以"请先打开 Nota"是这句话的正确回答，不是错误。
⚠️ 连带**删掉**了 `setup` ⑨ 那一格（`mcp::起`）：`--mcp` 今天走不到 `setup`，
留着一个永远为假的分支会让人以为还存在"在进程里直接服务 MCP"那种形态。


### ② `setup()` 里的几步

| 步 | 做什么 | 为什么是这个位置 |
|---|---|---|
| ① 载设置 | `Settings::load()` | 插件可能要读设置，得先有 |
| ② 算**界面语言** | `lang::有效语言(设置里那一格, lang::系统语言())` → `应用语言`（`lib.rs:140-152`） | ⚠️ **一次算清、之后不再变**：插件在加载时按这个语言挑好了自己的文案表，运行中再变就会出现"外壳中文、插件英文"那种中间态。所以改语言要**重启**（见 §界面语言） |
| ③ 建共享状态 + 加载插件 | 三个 `Arc<Mutex<_>>` → 拼 `HostContext`（带上 `应用语言`）→ `PluginHost::discover(resource_dir, &base)` | 插件的 `nota.ui.*` 要发事件给前端，那需要 `AppHandle`——所以**必须在 Tauri 起来之后** |
| ④ 托管 | `app.manage(AppState { documents, settings, workspace, plugins, settings_problem, app_lang })` | 命令层与 `unload_all` 都从托管状态里取句柄，必须最后做。⚠️ `AppState` 是**手写字面量**——它**没有构造函数**（2026-09-24 删了那个没人调用的 `AppState::new`，理由见 `docs/02`）。⚠️ `app_lang` 与插件加载时用的是**同一个值**（③ 算的那个），不是各算一遍 |
| ⑤ 另外**五个**托管状态 | `DevServerState`（开发服务器）＋ `ReviewState`（编辑区里摊着的那块面板）＋ `ProbeCache`（探测结论的缓存）＋ **`Heartbeat`**（面板心跳，2026-09-26 加）＋ **`FocusState`**（强制专注的账本，2026-09-26 加） | ⚠️ **它们都不进 `AppState`**：五个都不在「plugins → documents → settings」那条锁序上，谁也不该拿它们去排进那条队伍。`ReviewState` 尤其明确——**拿它不需要 `plugins` 锁**，因为插件正跑着（宿主握着那把锁）的时候「回到正文」那颗按钮还得能按。⚠️ `ProbeCache` 同理，而且**它必须是另外一把锁**：面板的 `render` 跑在 `plugins` 锁里面，探测的收尾（后台线程 `收下` 结论）**不能去等那把锁**——不然"不阻塞"就白做了（`docs/12`）。⚠️ `Heartbeat` 与 `FocusState` 同理——`Heartbeat` **一秒握一下 `plugins` 锁、读完就放**，`FocusState` 的账本自己一把锁（每拍读一次设置，也是「读了就放开、再动自己的账本」），两条都没排进那条序 |
| ⑥ 起两个**后台线程** | `heartbeat::起()`（面板心跳，每秒一拍）＋ `focus::起()`（强制专注的账本，每秒一拍） | ⚠️ **两个都是裸 `std::thread`，不是 `tokio::time`**（这个仓里没有一处 tokio 定时器）。⚠️ **起线程这一步只做一次**，没有「重启」这一说；心跳退出靠 `Heartbeat::stop()`（`RunEvent::Exit`，最多晚一拍），账本线程自己检查托管状态还在不在。⚠️ **强制专注不是插件**——用户原话「注意啊，这不是插件。这是核心功能」，它要窗口焦点、要开置顶窗、要出声，三样都在插件沙箱之外 |
| ⑦ 单实例的**接收**那一半 | `app.manage(single_instance::落点::default())` ＋ 抢到位置时 `single_instance::起(app.handle().clone(), 听)` | ⚠️ **位置很要紧**：上面那一堆 `manage` / `起` 都已经注册完，接收线程第一条连接就是奔着"打开一份文档"来的，而它 emit 的那条事件收的是**前端**——所以这里只要把托管状态（退出时删 socket 要用的路径）先挂上。⚠️ 抢位置那一步在上面 ⓿，**这一格是"收"那一半** |
| ⑧ 把 `nota://` 接到本程序上 | `url_scheme::注册()` | **解析**那一半在 `cli.rs`；⚠️ 失败**不拦启动**（注册不上就是"点链接打不开"），而且它**只在需要时才动盘**（幂等，见文件头）——所以正常启动是**不碰**用户桌面配置的 |
| ⑨ ~~MCP 服务器~~ | ⚠️ **2026-09-29 删掉了**（原来这里是 `cli::要开_mcp(...)` 为真才 `mcp::起(...)`） | 它服务的是"这一份进程自己就是那个 Nota"那种形态，而那种形态的代价是**用户报的「不停新建窗口」（BUG-55）**：`--mcp` 今天在 ⓿''' 那一步三条路**全都退出**，走不到 `setup`。⚠️ 留一个永远为假的分支会让人以为还存在"在进程里直接服务 MCP"那种形态。⚠️ 想让 MCP 重新在进程里服务，要改的是 ⓿''' 那一段的口径，**两处必须一起改** |

顺序在代码里就是字面的先后；`documents` 的 `Arc` 同时被 `AppState` 和
`HostContext` 拿着——**是同一个 `Arc`，不是两份拷贝**（插件闭包要长期持有它，
生命周期比任何一次命令调用都长，所以要 `Arc`）。

⚠️ `lib.rs` 里是**手写 `AppState { … }` 字面量**：`state.rs` 那个结构体**没有构造函数**
（2026-09-24 删掉了没人调用的 `AppState::new`。它当时是全仓唯一一处把开机时的
`strict_markdown` 传给文档仓的地方，而它没人调用 ⇒ **设置开机时到不了文档仓**，
标签页标题会按错的口径算。详见 `docs/02-modules.md` 的 `state.rs` 那一节）。

⚠️ 第 ② 步里 `DocumentStore::new(settings.strict_markdown)` 那个**参数不能漏**：
标签页标题是文档仓**自己**从正文算的（`derive_title`），严格与宽松对
「这一行算不算标题」看法不同。

### 每一步失败会怎样

| 环节 | 失败时的行为 |
|---|---|
| 读设置 | **不阻止启动**。用 `Settings::default()` 继续跑，并把这件事**送上界面**（启动 toast，BUG-23；`state.rs::settings_problem`），同时往调试输出记一笔（`log.rs` 的 `日志!`，默认不打）。一份坏掉的 `settings.toml` 不该让人连界面都进不去——用户至少要能打开应用改回来 |
| 设置文件不存在 | **不算错误**。`load_from` 里 `ErrorKind::NotFound` 直接给默认值（首次启动就是这种情况） |
| 探资源目录 | `app.path().resource_dir().ok()` → `None`。只是少扫一个插件目录，不报错 |
| 单个插件加载失败 | `LuaPlugin::load` **不返回 `Err`**：留下一条 `Failed(原因)`，界面上照常列出并标红。理由很实在——插件是用户自己装的第三方代码，让一个写错的 Lua 脚本变成"应用打不开"，用户连去禁用它的界面都进不去 |
| 清单都读不了的插件 | 只在 `discover()` 里记一笔（`log.rs`，默认不打，要 `NOTA_DEBUG=1`），**界面上看不见**（连 `id` 都不知道，没地方挂）⚠️ |
| 事件通道撞名 | 后到的那个插件被判 `Failed(原因)`，原因里写明是谁占了通道（见下面"插件分层"） |
| 窗口销毁时 `unload_all` | ⚠️ **只对 `main` 那个窗口**（`window.label()` 分派，2026-09-23 起）。单个插件的 `on_unload` 出错**只记不抛**（`log.rs`，默认不打），不向上抛——卸载流程不该被一个坏掉的插件挡住 |
| `.run(...)` 本身 | `.expect("Nota 启动失败")`，这是唯一会让进程直接死掉的地方 |
| `--mcp` 接不上 / 会话断了 | ⚠️ **2026-09-29 改：不许"那就自己开一份"**（那正是 BUG-55 的不停开窗）。接不上 → `stderr` 一句"请先打开 Nota"＋退出码 **2**；会话中途断了 → 退出码 **3**。两条都**不建窗、不抢单实例的位置** |
| 单实例起不来 | **照常单开、不拦启动**。拿不到运行目录、socket 文件建不出来，都不该让人用不了 Nota |
| `nota://` 注册不上 | **不拦启动**：只是"点链接打不开" |
| MCP 服务器 | **不拦启动、也不影响宿主那一侧**：`mcp::起` 是一条后台线程，stdin/stdout 断了只记一句日志（`log.rs`，默认不打）；工具跑了但没成，是结果里一个 `isError: true`（`tools.rs` 装好的），不是 panic |

---

## Slidev 预览（2026-09-25 起：一个插件，宿主只剩机制）

⚠️ **这条功能整个搬进了插件**（`plugins/slidev/`）。用户原话：
「几个不是所有人能用到的功能放到拓展里面，然后如果删了拓展的话，那这项功能将完全全不复存在」。
于是 `slidev.rs` / `slidev_probe.rs` / `commands/slidev.rs` / `ui/useSlidev.ts` /
`ui/SlidevPreview.tsx` / `ui/SlidevPanel.tsx` **全部删掉**，分成两半：

| 留在宿主（机制） | 搬进插件（这一项功能本身） |
|---|---|
| `devserver.rs`：挑空闲端口、把入口写在文档旁边、起进程、杀整棵进程树、探端口通没通、`frame` 块的地址由宿主填 | `plugins/slidev/main.lua`：用哪条命令（清单 `[devserver]`）、装没装的判据、面板长什么样、「停止预览」「在浏览器里打开」这两颗按钮、文案表 |

分界的判据不是行数是**归属**：「预览当前文档」这件事**任何插件都可能要做**，
那几件机制就该在宿主；而"跑的是 Slidev"这件事只属于这一个插件。
完整论证在 `devserver.rs` 文件头，这里只讲**结构上的五件事**：

> 📌 本节换过两次名字：2026-09-25 之前叫「第二个窗口（Slidev 预览）」，
> 那天改成「插件栏一页；独立窗口是次要路径」，**同一天又变成现在这个**——
> 因为独立窗口那条路也一起删了（见 ①）。`lib.rs` 那段注释里的
> 「见 `docs/01` §第二个窗口」指的是这里。

**① 全仓现在只剩一个窗口，就是 `main`。**
以前预览会另开一个 960×720 的窗（`nota_slidev_open_window`），
现在**没有第二个窗口了**：预览是插件面板里一块 `kind = "frame"`（`iframe`），
想全屏就 `nota.devserver.open_in_browser` **交给用户的真浏览器**
（全屏演示、演讲者视图（双屏）只有真浏览器有，`plugins/slidev/main.lua:265` 那段注释就是这句话）。
⚠️ 这一条有个**副产品**：`src-tauri` 里已经不剩任何 `WebviewWindow` 调用，
`nota_slidev_open_window` 这个命令也随文件一起没了。

**② `WindowEvent::Destroyed` 仍然必须按 `window.label()` 分派。**
那个回调原先是「窗口销毁 → `unload_all()`」，而 `unload_all` 卸的是**全部插件**。
窗口一多，这个写法就变成「**关掉预览窗 = 把插件全卸了**」——
而且**没有任何提示**（卸载只记日志），是那种"看起来只是插件面板空了"的静默失效。
⚠️ **2026-09-26 起多了第二个窗口**：焦点警报窗（`focus-alarm`）也在这儿分派，它那一支
**当作「我回来了」**（调一次 `focus::确认`）——少了它会出现最难受的一种故障：窗被 Alt+F4 关掉了、
阶段还停在 `alarm`，下一拍**又开一个**，按几次就冒出几个窗。
⚠️ 所以今天 `_ => {}` 那一支仍然是「别的窗口，什么都不做」，而那个 `match` **真的有了第二个会跑的分支**。
⚠️ **不能因为「看着多余」就简化掉**：`main` 那一支是「关窗时卸插件」的**唯一**一处，
理由写在 `lib.rs` 那段注释里。

⚠️ **同一处的 `Focused` 事件方向相反、判据也不同**（2026-09-26 加）：它**只认 `label == "main"`**
（不是「不是 main 就跳过」，而是「只有 main 才算数」）。⚠️ 警报窗自己也会发 `Focused(true)`，
一起算进去的话，「警报窗抢到焦点」会被记成「用户回来专注了」——**该罚的变成该奖的**，
警报还会在下一拍自己解掉，整个功能当场失效。两段判据方向相反，**故意写在同一个 `match` 之外，各判各的**。

**③ `DevServerState` 不进 `AppState`。**
`AppState` 那四个句柄的锁序不变量（见下一节）是给文档与插件用的，而这里是一堆子进程。
它单独 `manage`，锁也只有一把（`HashMap<插件 id, 会话>`——**一个插件最多一场会话**，
而且它的键是**插件 id 而不是文档 id**：同一个插件的第二次 `start` 先把上一场收掉）。

**④ 点菜单先问一句「装没装」，问完才起进程。**
这是插件自己的流程（`plugins/slidev/main.lua` 的 `probe` → `start`），
不再有宿主那半的 `ui/SlidevPanel.tsx`：探测**不改任何状态**（不碰 `DevServerState`），
所以它是**一次问话**，不是"预览的某个阶段"——这就是为什么它没被塞进会话状态里。
⚠️ 探测与启动**都跑在插件命令那条路**上（`nota_plugin_call`），而那条路本来就在
`spawn_blocking` 线程池上（`commands/plugin.rs` 文件头），所以 `start` **可以阻塞**
（最长 180 秒，等端口通）——**这和它的前身故意相反**：前身被一条 Tauri 同步命令调着，
在那儿等就是冻界面，所以等待被推到前端轮询。⚠️ 换来的是**前端不再需要"每 500ms 探一次"**，
也就没有了"轮询还在飞、用户已经把预览关了"那一类竞态。
⚠️ 端口通了之后插件自己 `nota.ui.review("preview")` 把这一页摊到编辑区
（那一页 `wide = true`：幻灯片是横向的，260px 的右栏里嵌一块等于看缩略图）。

**⑤ 退出时 `RunEvent::Exit` 里 `stop_all()` 兜底。**
那些服务器是 `Command` 起的子进程，**不在 Tauri 的管理范围内**，主进程一退
**它们自己接着跑**（2026-09-25 实测：SIGTERM 掉 Nota 之后 Slidev 还占着端口，得手动 kill）。
平时收摊走插件自己的 `stop`（用户点「停止预览」），但这一条必须有——
否则用户开着预览直接关应用，留下的是一个没人知道、也关不掉的服务器。
⚠️ **只认 `Exit`**（清理阶段，一定跑得到），**不认 `ExitRequested`**——后者可以被
"要不要保存"那种对话框取消掉。

⚠️ **预览里跑的是 Slidev 的页面，不是 Nota 的前端**——`frame` 里是另一个源，
够不着 Nota 的 JS 上下文（两者之间也没有任何直接通道）。
唯一的接口是**磁盘上的入口文件**：`devserver.rs` 挑位置并整份重写它
（有文档目录就写在文档旁边、否则退回数据目录，文件名带 `doc_id`，
点开头所以文件管理器默认不显示），Slidev 自己的 Vite 热更新再把它读走。
⚠️ **用户自己的 `slides.md` 与保存设置一个字节都不动**。

> 📌 能力那半（`process.devserver` 放行的是清单里写死的那一条命令，不是"任意命令"）
> 记在 `docs/11` §3.2 与 `docs/13` §13。

---

## 界面语言（i18n）在结构上是哪几块

2026-09-25 接的，前端与插件两条线**各走各的**，共用一个"什么算一种合法语言"的裁决：

| 块 | 在哪 | 谁参与 |
|---|---|---|
| **裁决**：支持哪几种、怎么归一（`zh_CN.UTF-8` → `zh-CN`）、怎么匹配 | `src-tauri/src/lang.rs` | 唯一权威，两边都问它 |
| **宿主自己的文案** | 前端 `src/i18n/index.ts` 的键表（中文表 `src/i18n/zh*.ts` **四份**：`zh.ts` 只剩文件头 ＋ 汇总导出，条目在 `zh-ui.ts` / `zh-settings.ts` / `zh-runtime.ts`）。⚠️ **2026-09-28 起键就是英文原文**（用户定的方向：英语才是主语言、中文是翻译包），英语没有表 | 界面上的字符串；组件**必须**调 `useT()`（模块级那个 `t` 不触发重渲染）；**不是画字、而是把语言当依赖**（推原生菜单、重算某个 memo）用 `use语言()`——`useT()` 会多一个没人看的 `t`，被 `noUnusedLocals` 拦下 |
| **插件的文案** | 插件目录下 `lang/<tag>.toml` | 插件用 `nota.i18n.text("原文")` 取；**键就是原文**，取不到就退回原文 |

⚠️ **覆盖面：整个界面**（2026-09-26 起）。此前只有插件那一面（插件栏、面板内容块、
编辑区预览），那天菜单栏、设置十页、状态栏、侧边栏、对话框、工具条都进了表；
账由 `tools/i18n-check.sh` 数（**现跑现看**，那个数随代码自己动）。
📌 2026-09-28 **主语言翻了**：键从中文原文换成英文原文，英语界面因此**永远完整**，
中文成了翻译包（`src/i18n/zh*.ts`）。
⚠️ 同一天那道闸还加了一条硬判据：`.tsx` 里**没包 `t(...)`** 的中文字面量
（JSX 文本节点、`title` / `aria-label` 这类文案属性）**也计入 FAIL**，此前只打印
（判据只扫 `.tsx`，且是**故意从宽**的启发式——宁可漏，不可误报）。

⚠️ **判据一句话：应用语言在插件的 `langs` 清单里就用那个语言，不在就用英语**，
并在界面上给这个插件挂一句「此插件不支持您的语言」。
⚠️ 那句提示**只在"插件的清单里没有应用语言"时出现**，而插件**必须**含 `en`——
所以应用语言是 `en` 时它**不可能出现**（细节与那个反直觉的推论见 `docs/11` §2.4）。
⚠️ **改语言要重启**：应用语言在 `lib.rs` 里算一次，插件的文案表在 `on_load` 时读。
前端能即时跟上（跟着 `nota_app_lang` 走），插件那半不行。

⚠️ **两个兜底，别再合并（2026-09-26 拆开的）。** `lang.rs` 里有两个常量，名字像、
用途完全不同：**`插件兜底` = `en`**（应用语言不在插件的 `langs` 里时，插件用哪一种语言
——这是**对插件作者的要求**）与 **`应用兜底` = `en`**（应用**自己**的落点：
`settings.toml` 跟系统走而系统语言认不出来、或者写了个应用没有的语言时，界面落到这儿）。
拆开之前两者共用一个 `兜底 = "en"`，于是中文用户会看到**英文外壳配中文插件文案**
（用户 2026-09-26 报的「界面中英混杂」就是这个）。前端 `src/i18n/index.ts` 的兜底写的是
`应用兜底` 那个值，**跟宿主一致**。

⚠️ **同值不等于合并**：两个概念、两个常量，没有谁引用谁（用例名就如实写着
`两个兜底是两个概念_今天恰好同值`）。`应用兜底` 2026-09-26 那天是**有条件**才等于
`en` 的——上午它还是 `zh-CN`（那时英文表只覆盖插件那一面，落到 `en` 会把界面切成
两半），下午表铺到整个界面（732 / 732、0 欠账）之后才按常量注释里写下的条件翻回来。
📌 2026-09-28 语言翻转（英语成了**原文**）之后**那层条件没有了**：英语界面的完整性
由构造保证，这个值于是是稳的。两次改动的经过与理由写在
`lang.rs` 那条常量的文档注释里。两个兜底**都**必须出现在 `支持的语言` 里，有用例钉着。

---

## 共享状态与锁顺序

`AppState`（`src-tauri/src/state.rs`）就四个句柄：

| 字段 | 类型 | 锁在最外层？ |
|---|---|---|
| `plugins` | `Mutex<PluginHost>` | **是**（最先取） |
| `documents` | `Arc<Mutex<DocumentStore>>` | 否 |
| `settings` | `Arc<Mutex<Settings>>` | 否 |
| `workspace` | `Arc<Mutex<Option<PathBuf>>>` | 否（不参与锁序） |

### 不变量

```text
plugins  →  documents  →  settings
```

**只能从左往右取锁，不许反向。** 违反它的后果是死锁，而且是最难查的那种——平时不触发，
只在两个命令碰巧同时跑时才卡住。

为什么是这个方向、以及今天实际会交叉的地方：

| 路径 | 持有什么 → 再取什么 |
|---|---|
| `nota_plugin_call` | 持 `plugins` → Lua 闭包内取 `documents`（`nota.document.*`）、可能取 `settings`/`workspace` |
| 窗口销毁的 `unload_all` | 持 `plugins` → 插件的 `on_unload` 可能取 `documents`/`settings` |
| **反方向** | **今天一次都没有**（没有哪条路径先持 `documents` 再去取 `plugins`） |

也就是说：这条不变量今天**没有被违反**，它真正的价值是拦住将来的改动——比如"存盘时要读设置"
（`nota_doc_save` 持 `documents`，若再去锁 `settings` 就正好顺着这个方向，安全；
但若反过来在 `nota_settings_set` 里再去锁 `documents`，就成环了）。
state.rs 里给的原始理由（"存盘流程要读设置"）是这条规则要保护的方向，不是今天某一行代码。

三条附带的约定：

1. **取多把锁之前要清楚这条路径站在哪一层。**
2. **不许跨 `.await` 持锁。** 宿主今天所有命令都是同步 `fn`（没有 `async fn`），所以
   这条暂时无从违反；它是给将来的异步命令留的。
3. ⚠️ **插件命令执行期间 `plugins` 锁一直被持有**（`nota_plugin_call` 全程握着它）。
   所以插件命令里**不能**再触发一次需要 `plugins` 锁的路径——那会自锁。
   今天 Lua 侧拿不到 `invoke`，走不到这条，但加新 Lua API 时这个前提仍然成立。

### 为什么 `documents` 是 `Arc<Mutex<_>>` 而不是 `Mutex<_>`

因为插件的 Lua 闭包需要**长期持有**它（闭包活多久，句柄就得活多久），所以必须是 `Arc`。
`workspace` 同理。`plugins` 只在宿主自己的调用栈里用，不需要共享所有权，就是普通 `Mutex`。

---

## 两条通道

跨进程只有两条路。命名上刻意做得**一眼能分清**：命令一律 `nota_` 前缀，事件一律
`nota:` 前缀（插件发的事件是 `plugin:` 前缀）。

### 通道 A：前端 → 后端（`invoke` 命令）

注册表在 `lib.rs` 的 `.invoke_handler(tauri::generate_handler![…])`，**一共 95 项**：
`commands::*` 下的 **85 条** ＋ **`spell::*` 那 8 条** ＋ `lib.rs` 自己那两条
（前端就绪握手 `nota_frontend_ready`、启动参数 `nota_startup_file`）。
⚠️ **第十四遍（2026-10-16，退出前那一问那一批时重数的）**：真值 **95 = 85 ＋ 8 ＋ 2**，
唯一动的是**窗口那一组 2 → 3**（新增 `nota_quit`：前端确认过之后**真的退出**，
见 `docs/02` 的 `commands/window.rs` 一节）。⚠️ 数的配方与上一遍一样
（`grep -oE 'commands::[a-z_]*::' src-tauri/src/lib.rs | wc -l`，**先去注释**）。
⚠️ **第十三遍（2026-10-11，拼写检查换引擎那一批时重数的）**：真值 **94 = 84 ＋ 8 ＋ 2**，
按模块是 文档 15 ＋ 工作区 4 ＋ 设置 6 ＋ 主题 3 ＋ **插件 17** ＋ 导出 4 ＋
借 pandoc 导出 2 ＋ 原生菜单 1 ＋ 插入图片 1 ＋ 上传图片 3 ＋ 焦点 6 ＋ 表格宽度 3 ＋
差异 1 ＋ 外部改动 1 ＋ 界面风格 3 ＋ 会话 6 ＋ 路径判型 1 ＋ **webview 4** ＋ 窗口 2 ＋
诊断 1 ＋ **拼写 8**。
⚠️ **这一遍加了 7 条**（拼写那一组从 2 条变 8 条：新增 `nota_spell_dictionaries` /
`nota_spell_dict_dir` / `nota_spell_dict_reveal` / `nota_spell_dict_import` /
`nota_spell_word_add` / `nota_spell_word_ignore` 六条，加上原先就有的
`nota_spell_check` / `nota_spell_suggest` 两条）。
⚠️⚠️ **这一遍还纠了两处旧账**（都属于"重数才发现的"）：① 上一遍那张分组表里
**根本没列「拼写」这一组**（那两条既不在 `commands::*` 里、也不在任何一个已有的组里，
于是"分项加起来少 2"这件事没人看得出来）——今天第一次把它列成一组；
② 上一遍写的 `webview 3` **已经过期**：`nota_webview_scroll_hard`（触摸板那条，2026-10-11
上午落的）把它变成了 **4**，而那一遍之后再没有人重数过。
⚠️ **参考对照**：上一遍（2026-10-10，做拼写检查语言那一批时）真值是 **85 = 83 ＋ 2**。
**另外 6 条是别的会话在这之间落的**（插件 13 → 17、文档 14 → 15、多出一组诊断 1），
本批只是重数时把它们数进来了——**别把这 6 条读成"拼写检查那批做的"**。
⚠️ **数的历史（每一遍都是有人重数才发现的）**：2026-09-26 加完**强制专注那六条**
（`nota_focus_*`）之后有人重数过一次，数出的是 **64**——⚠️ **那个 64 本身也是错的**
（只抬了总数、没重数分项，于是同一个句子里还并排放着「62 项分项 + 2 = 64」这种加不起来的
算式），第九遍才数出当时的真值 **65**；**第十遍是 2026-09-27 晚**，真值 **77**，
**同一天又加了 1 条**（`nota_window_open_new`，「在新窗口中打开」），真值 **78**。
⚠️ 数的时候模式要写 `commands::[a-z_]*::`——**少一个下划线就会漏掉 `image_upload` / `table_width` /
`ui_style` 三个模块**（我自己就漏过一次，53 对 62）。⚠️ 数之前**先去注释**：`generate_handler!`
里有一条被注释掉的示例，不去注释会多切出假条目。
⚠️ **第十一遍（2026-09-27 晚些时候）：78 项 = `commands::*` 76 ＋ `lib.rs` 2**，按模块是
文档 14 ＋ 工作区 4 ＋ 设置 6 ＋ 主题 3 ＋ 插件 13 ＋ 导出 4 ＋ 借 pandoc 导出 2 ＋
原生菜单 1 ＋ 插入图片 1 ＋ 上传图片 3 ＋ **焦点（强制专注）6** ＋ **表格宽度 3** ＋
**差异 1** ＋ **外部改动 1** ＋ **界面风格 3** ＋ **会话 6** ＋ **路径判型 1** ＋
**webview 2** ＋ **窗口 2**。
⚠️ **窗口那一组从 1 变 2 是同一天晚些时候加的**：`nota_window_open_new`（「在新窗口中打开」，
逐条说明在 `docs/02` 的 `commands/window.rs` 一节）。
⚠️ 从 65 到 78 这 **13 条不是同一批进来的**，要分开读：**2 条是本批**（「重命名 / 移动」的
`nota_doc_rename` / `nota_doc_move`，见 `docs/02` 的 `commands/document.rs` 一节）、
**1 条是同一天晚些时候的**（`nota_window_open_new`）；另外
**10 条是别的会话在这之间落的**（会话 6 / 路径判型 1 / webview 2 / 窗口 1），本批只是
**重数时把它们数进来了**——别把这 10 条读成"重命名顺带做的"。
⚠️⚠️ **后面那五组（粗体的）在下面没有逐条表**——它们是在这一节之外长出来的
（`focus/*` 是 2026-09-26 的核心功能，`table_width` / `watch` / `diff` 是 2026-09-27 的），
**逐条签名说明现在只在 `docs/02` 里**（`commands/focus.rs`、`commands/table_width.rs`、
`commands/watch.rs`、`commands/diff.rs`、`commands/ui_style.rs` 各一节）。
这里只把**命令名**列出来，好让任何人一眼能对着 `sed` 的输出去核：

| 组 | 条数 | 命令 |
|---|---|---|
| 焦点（强制专注） | 6 | `nota_focus_get` · `nota_focus_start` · `nota_focus_stop` · `nota_focus_ack` · `nota_focus_beep` · `nota_focus_close_alarm` |
| 表格宽度 | 3 | `nota_table_widths_get` · `nota_table_widths_set` · `nota_table_widths_forget` |
| 界面风格 | 3 | `nota_ui_styles` · `nota_ui_style_css` · `nota_ui_styles_open_dir` |
| 差异 | 1 | `nota_diff_texts` |
| 外部改动 | 1 | `nota_watch_sync` |

⚠️⚠️ **教训（这一节最该记的一条）**：上面那张分组表当时**只有十组、和 47**，
而总数写着 64——**两个数各自都不荒谬，合起来差 16，看上去完全正常**。
错的不是"少加了一条"，是**整组整组地没进来**（这五组一条都没写过）。
⚠️ 而第九遍同时逮到两处**同类**的小账：上面「文档」那组写着 11 个（真值 12，
漏的是 `nota_doc_disk_text`）、「导出」那组写着 3 个（真值 4，漏的是
`nota_export_write_bytes`）——**这两条都在注册表里、都在前端 `ipc.ts` 里被调用着，
只是没进过这张表**。所以判据是：**改完注册表，拿 `sed` 那条配方和这张表逐行对**，
别只看总数。补齐后的账是：**本节十组（和 49）＋ 上表五组（14）＋ `lib.rs` 2 = 65**。
⚠️ **到第十遍（2026-09-27 晚）这个"补齐"又不够了**：上面那张表仍是**十五组**，而注册表现在
是**二十组**——新进来的几组（会话 6 / 路径判型 1 / webview 3 / 窗口 2 / 诊断 1）**这一节里一条都没写**，
逐条说明只在 `docs/02`。所以本节当前的分组表是 **49 / 92**（和模块命令总数 92 差着 43；
⚠️ 这里拿 92 比而不是 94：`lib.rs` 自己那两条**从来不在那张表里**，这不是欠账），
**顶上那句话（"分组表只是全集的一部分"）依然成立并且差距更大了**。补齐这四组要单开一批
（那是另外几个会话的改动），本批只把**总数与分项重数并写明**。

所有调用的唯一出口是 `src/bridge/ipc.ts`——组件里不许直接 `invoke()`。

⚠️ **这个数是数出来的**，改过注册表就要重数一遍：

```sh
sed -n '/generate_handler/,/])/p' src-tauri/src/lib.rs |
  grep -o 'commands::[a-z_]*::nota_[a-z_]*' | sort | uniq -c   # 分组小计
sed -n '/generate_handler/,/])/p' src-tauri/src/lib.rs |
  sed 's,//.*,,' | tr ',' '\n' | grep -o 'nota_[a-z_]*' | wc -l   # 总数
```

⚠️ **下面那条要先去注释再按逗号切**（2026-09-27 第九遍修正）：注册表里那些
`// …` 注释**也会提到命令名**（比如 `// 所以 \`nota_ui_style_css\` 只对导入的 id 有效`），
所以旧版那条 `grep -c nota_` **会多算一行**（第九遍那次数出来 66，当时的真值 65）。
⚠️ 第十遍（2026-09-27 晚，真值 77）**复算过这一条**：两条配方给的是同一个数，
所以这两个数现在是可信的——**但它们仍然只是"照着一张手抄的表在核"**，
分组那一半能不能对上，取决于那张表本身补没补。
数分组小计的那条不受影响（它要求整行形如 `commands::x::nota_y`，注释行不匹配）。

⚠️ **它已经错过三次**：BUG-13 那批加了 `nota_plugin_panels` / `nota_plugin_menus`
两条、之后又加了 `nota_doc_settle`，而表里一直写着 28（那两次和
2026-09-24 加导出那两条时，本节连 **slidev 八条、原生菜单一条**都整组漏着没写）。
2026-09-25 数第三遍时，**设置那一组还写着 2 个，实际是 5 个**——
`nota_settings_dir`（现名 `nota_settings_open_dir`）/ `nota_settings_reset` 加进来的时候没人回来改这一节，
而它们各自在 `docs/02`、`docs/04` 里都有完整一行（**同一个事实写在三处，
只有一处被更新**）。这就是为什么下面那个配方要紧。
**加命令时最容易漏的就是这个总数和它上面那个分组小标题。**

⚠️ 2026-09-25 **第四遍**（加 `nota_startup_file`）：上一轮改的只是下面那半句，
**顶上那句"一共 38 项"原地留着**——数第二遍的人改了错的、漏了更错的。
所以：**总数有两处**（这句的总数、分组小标题的和），两处都要重数。

⚠️ 2026-09-25 **第五遍**（加「借 pandoc 导出」那一组两条、以及先前加的
`nota_export_reveal`）：这一遍**三处**都错了——总数写着 43、导出那一组的
小标题写着 2 个（实际三条）、`commands/mod.rs` 的"八个子模块"也少一个。
教训同上一遍：**加一组命令要改的地方不止一个**，而这次错的是「分组小标题」
那一层——总数对了也没用，它和下面各组分标题的和对不上，照样看得出来。

⚠️ 2026-09-25 **第六遍**（插件那组从 7 条变成 **11 条**：`nota_plugin_install` /
`nota_plugin_uninstall` / `nota_plugin_trust` / `nota_plugin_trust_list`）：
这一遍按上面那个配方重数了一遍全集，**50 项 = 上面九组之和（48）＋ `lib.rs` 两条**，
并把分组小标题改成「插件（11 个）」。数字是自己数出来的，不是推的。

⚠️ 2026-09-25 **第七遍**（本轮，**今天这一版**）：改动是"一减两加"——
**减**掉整组 `nota_slidev_*`（8 条，Slidev 搬进插件）、**加** `nota_app_lang`（设置组 5 → 6）
与 `nota_plugin_review` / `nota_plugin_review_close`（插件组 11 → 13）。
按配方重数：**45 项 = 上面八组之和（43）＋ `lib.rs` 两条**，
分组变成了**八组**（本节从十组减到八组）：
文档 11 ＋ 工作区 4 ＋ 设置 6 ＋ 主题 3 ＋ 插件 13 ＋ 导出 3 ＋ 借 pandoc 导出 2 ＋ 原生菜单 1 = 43。
⚠️ **这一遍最容易再错的地方是"组数"**——减掉一整组之后，上面那些"九组之和"
的旧句子会原地留着，而它们现在已经没有主语了。

⚠️ 2026-09-26 **第八遍**（本轮，**今天这一版**）：改动是"一组加、一组长"——
**加**「上传图片」整组三条（`nota_image_upload_get` / `_set` / `_one`，见 `docs/07`
第 62 项第二批）、**长**「插入图片」那组先前的 1 条（`nota_image_place`，同一天第一批）。
按配方重数：**49 项 = 上面十组之和（47）＋ `lib.rs` 两条**：
文档 11 ＋ 工作区 4 ＋ 设置 6 ＋ 主题 3 ＋ 插件 13 ＋ 导出 3 ＋ 借 pandoc 导出 2 ＋
原生菜单 1 ＋ 插入图片 1 ＋ 上传图片 3 = 47。
⚠️ 这一遍的教训与上一遍互补：**"一组加"要动的地方还是那句话——总数两处、组数一处**；
数出来的 47 与下面十个分组小标题的和必须对得上（`sed` 那条配方会直接把分组小计列出来）。

⚠️ 2026-09-27 **第九遍**（**本轮**）：不是"加了一条"，是**发现上下文两半自己打起来了**——
本节顶上写着 **64**（那是 09-26 有人重数过的），而这条叙事线还停在第八遍的 **49**，
两个数在同一个小节里对峙；重数才知道两个都不对：真值是 **65 项 = `commands::*` 63 ＋ `lib.rs` 2**。
根因不是谁少加了一条，是**整组整组地没进来**——上面那张分组表只有十组（和 47），
而 `nota_focus_*`（6）／`table_width`（3）／`diff`（1）／`watch`（1）／`ui_style`（3）
**五组一条都没写**（它们各有各的来时：focus 是 09-26 的核心功能，其余是 09-27 的），
于是顶上那个"总数"和它下面的分组表**各自都对、合起来差 16**，
而这种错**看上去完全正常**（没有哪个数是明显荒谬的）。
📌 处置：总数两处改成真值，并把"本节的分组表只是全集的一部分"写在总数旁边；
那五组的逐条说明**暂时只有 `docs/02`**（各自一节），本节要补齐它们得单开一批。

**文档（12 个）**

| 命令 | 签名要点 |
|---|---|
| `nota_doc_new` | `() -> DocId`，新建空文档并设为活动 |
| `nota_doc_open` | `(path: String) -> DocId`，**已打开就复用**那一份 |
| `nota_doc_sync` | `(id, text) -> u64`，前端推文本，返回新 `revision` |
| `nota_doc_settle` | `(id, text) -> u64`，**装载流程的最后一步**：把编辑器那边的文本认领成「干净文本」，**并清掉 `dirty`**。⚠️ 与 `sync` 只差这一条，**不是 `sync` 的别名**；调用点只有 `EditorPane` 一处，且**必须在 `handle.focus()` 之后**。存在的理由是 BUG-12 |
| `nota_doc_save` | `(id, path: Option<String>) -> String`，给了 `path` 就是「另存为」，返回最终落盘路径 |
| `nota_doc_close` | `(id)`，**不做未保存询问**（那是前端的事） |
| `nota_doc_set_active` | `(id)`，切活动文档 |
| `nota_doc_get` | `(id) -> Document` |
| `nota_doc_list` | `() -> Vec<Document>` |
| `nota_doc_reload` | `(id) -> Document`，从磁盘重读 |
| `nota_doc_has_unsaved` | `() -> bool`，退出前前端拿它决定要不要弹框 |
| `nota_doc_disk_text` | `(id) -> String`，读**磁盘上**那一份的文本，**一个字节的状态都不改**。给外部改动提示条的「查看修改」用（要和编辑器手里那份做 diff）。⚠️ **不能拿宿主镜像顶替**——镜像有 300 ms 去抖，而且它本来就是"编辑器里那份"、正是要比的另一边；`nota_doc_reload` 也不行（它会把内存里那份换掉，那是「重新载入」那颗按钮干的事） |

**工作区（4 个）**

| 命令 | 签名要点 |
|---|---|
| `nota_workspace_open` | `(path: String) -> String`，**规范化后的绝对路径**（这是 `nota.fs`/`nota.git` 的围栏） |
| `nota_workspace_close` | `()`，只清围栏，**不关文档** |
| `nota_workspace_get` | `() -> Option<String>` |
| `nota_workspace_tree` | `(sub_path: Option<String>, depth: Option<u32>) -> Vec<TreeNode>`，按展开状态分段请求，不做整棵树一次拉完 |

**设置（6 个）**

| 命令 | 签名要点 |
|---|---|
| `nota_settings_get` | `() -> Settings` |
| `nota_settings_set` | `(settings: Settings)`，**整份替换**并落盘，落盘失败回滚内存 |
| `nota_settings_open_dir` | `(app) -> String`，设置文件所在目录（一般是 `~/.config/nota`）。⚠️ 路径由后端现取，前端不许自己拼；⚠️ **「打开」这一步也在宿主**（调 `plugin-opener`，见 `docs/07` BUG-27），前端只负责说话——2026-09-25 由 `nota_settings_dir` 改名而来 |
| `nota_settings_reset` | `() -> Settings`，恢复出厂默认，**返回新的那一份**（前端照着重画，别再 `get` 一次） |
| `nota_settings_problem` | `() -> Option<String>`，开机读设置时出的问题，读成功是 `null`。⚠️ 2026-09-25 加：解析不了 `settings.toml` 时宿主一直只往 stderr 写一行就退回默认值，用户看到的是"我的设置自己变回默认了"；现在这句话会到界面上（启动时一条**不自动消失**的提示），原文件同时备份成 `.bak` |
| `nota_app_lang` | `() -> String`，**应用当前的语言**（`zh-CN` / `en`）。⚠️ 2026-09-25 加，前端 i18n 的唯一真相源：`src/i18n/index.ts` 启动时拉一次，之后自己存着（`定语言()`）。⚠️ 它是**只读**的——改语言走 `nota_settings_set`（`settings.language`），改完**要重启**才全域生效（见 `docs/01` §界面语言） |

**主题（3 个）**

| 命令 | 签名要点 |
|---|---|
| `nota_doc_themes` | `() -> Vec<DocThemeInfo>`，内置**三套**（`minimal` / `adwaita` / `latex`，编进二进制；⚠️ 2026-09-26 从六套换成三套，见 `docs/10` §7）＋ 用户目录里多出来的；**用户目录空的也算正常** |
| `nota_doc_theme_css` | `(id) -> String`，一份主题 CSS 的**文本**。⚠️ 返回文本而不是渲染结果——限域（把选择器收到 `.editor-pane` 之下）在**前端**做，见 `05` |
| `nota_doc_themes_open_dir` | `(app) -> String`，**建好**（不存在就建）用户主题目录并在系统文件管理器里打开它，给「打开主题文件夹」用。⚠️ 2026-09-25 由 `nota_doc_themes_dir` 改名而来（原来只返回路径、由前端去开，那条路撞 Tauri 的 ACL，见 `docs/07` BUG-27） |

⚠️⚠️ **入参是 id 不是路径**（`nota_doc_theme_css(id)`），所以前端**根本没有**
"让后端读任意文件"的能力。上一版是传路径 + 一道目录前缀检查（`check_scope` 拿
`paths::theme_dirs()` 逐个 `starts_with` 比对）——那一版没有漏洞，但这一版是
**结构上不可能出错**：`themes.rs::check_id` 只放行 ASCII 字母数字与 `-` `_`，
路径由后端自己拼。
⛔ 同时**不兼容也不内置外部编辑器的主题**（版权，用户 2026-09-23 定的），
所以那两个主题目录连同 `theme_dirs()` 一起删了。

**插件（13 个）**

| 命令 | 签名要点 |
|---|---|
| `nota_plugins_list` | `() -> Vec<PluginInfo>`（含加载失败的，界面上要标红）。⚠️ 2026-09-25 起每行还带 `origin` / `signature` / `key_id` / `removable`，见 `docs/11` §1.6 |
| `nota_plugin_set_enabled` | `(id: String, enabled: bool)`，**异步**（真装卸要跑 Lua 的 `on_unload` / `on_load`，走 `spawn_blocking`）。⚠️ **停用 = 真卸载**，见 `docs/11` §1.6.7 |
| `nota_plugin_call` | `(plugin: String, command: String, args: Option<Value>) -> Value`，载荷是 JSON |
| `nota_plugin_find_command` | `(command: String) -> Option<String>`，某个命令是哪个插件注册的 |
| `nota_plugin_panels` | `() -> Vec<PanelInfo>`，**拉**面板清单（BUG-13 之后改走这里，不再发事件） |
| `nota_plugin_panel_content` | `(plugin, id) -> Value`，**现算**某个面板的内容（不是开机就备好的），走 `spawn_blocking` |
| `nota_plugin_review` | `(plugin, id) -> Value`，把某个面板**摊到编辑区**（`nota.ui.review(id)` 的宿主那半） |
| `nota_plugin_review_close` | `()`，收起编辑区里那块面板。⚠️ **面板自己负责收起**（用户点「完成」→ 插件调 `nota.ui.review(nil)`）：宿主不知道那些按钮是什么意思（`docs/13` §8.6） |
| `nota_plugin_menus` | `() -> Vec<MenuInfo>`，**拉**菜单清单，同上 |
| `nota_plugin_install` | `(path: String) -> String`，装一个 `.nota-plugin` / `.zip` / 目录，返回插件 id。**异步**（要解包、验签、落盘）。⚠️ 没有"信不信任"这个入参：未知签名者也装得进来（`docs/11` §1.6.5） |
| `nota_plugin_uninstall` | `(id: String)`，**只对用户目录下的插件有效**（内置的报错让你用「停用」）。**异步**、**不可逆** |
| `nota_plugin_trust` | `(id: String)`，把该插件签名者的公钥记进信任库（TOFU）。⚠️ 要的是**记下来的公钥**，所以只对"装的时候记过来路"的插件有效 |
| `nota_plugin_trust_list` | `() -> Vec<信任记录>`，信任库里那几把钥匙（指纹 + 名字）。给人核对用 |

**导出（4 个）**

| 命令 | 签名要点 |
|---|---|
| `nota_export_write` | `(path: String, content: String) -> String`，把前端生成好的 HTML 落盘，返回**真实写出去的路径** |
| `nota_export_write_bytes` | `(path: String, base64: String) -> String`，**二进制**那一路（前端只有字符串可以过 IPC，所以先 base64）。分享卡「保存为图片」存 PNG 走它。⚠️ base64 解不开就报错**并且不留下半个文件**（先解码再写盘） |
| `nota_export_print` | `(app, doc_path: Option<String>, title: String, content: String) -> String`，写到落点再交给系统默认程序。⚠️ **HTML 由前端生成**（`editor/export.ts`），后端只做 IO——生成放后端就要有第二套渲染实现，见 `05` §4.5 |
| `nota_export_reveal` | `(path: String)`，在文件管理器里**定位**它（不是打开它）——导出设置那条「导出后打开所在目录」用。⚠️ 与「另存为」无关：导出产出的是一份别的文件，当前文档一个字节都不动 |

**插入图片（1 个）**（2026-09-26 加，`docs/07` 第 62 项第一批）

| 命令 | 签名要点 |
|---|---|
| `nota_image_place` | `(id: DocId, src: ImageSourceArg, alt: Option<String>) -> ImagePlaced`，**异步 ＋ `spawn_blocking`**（要读盘、写盘，网络地址那条最长下载 30 秒）。⚠️ `src` 是**三种形状之一**：`path`（本地文件）/ `url`（网络地址）/ `base64`（剪贴板里的图，**必须落盘**）。⚠️ 前端只交"图上哪儿来 / 给哪份文档 / 替代文字叫什么"，**放哪、拷不拷、写绝对还是相对路径全部由宿主按 `Settings` 现算**——前端再算一份就是第二个判据，而它拿不到权威的文档路径（未存盘的文档它手上还是"上次的路径"）。⚠️ 返回 `ImagePlaced { markdown, savedTo, did, action }`，字段名**写死英文**，与 `bridge/types.ts` 的 `ImagePlaced` 一一对应 |

**上传图片（3 个）**（2026-09-26 加，`docs/07` 第 62 项第二批）

| 命令 | 签名要点 |
|---|---|
| `nota_image_upload_get` | `() -> { settings, willAutoUpload }`，给设置页读那一组。⚠️ **不进 `AppState`、每次都从盘上读**：它很小（八个字段），而且是用户会拿编辑器手改的文件（`~/.config/nota/image-upload.toml`，**0600**），缓存了就会出现"我改了文件怎么不生效"。⚠️ `willAutoUpload` 是算出来的**事实**（这台机器上到底会不会自动传），不是把 `auto` 那个开关回读一遍——开关开着但没有服务器，界面上要能看出来 |
| `nota_image_upload_set` | `(v: 上传设置)`，**整份替换**并落盘。⚠️ 与 `settings.toml` 分开的那一份，不只因为权限：这一份装的是用户的令牌（`Authorization: Bearer …`）。⚠️ 三条闸（`enabled` / `auto` / 文档 front matter 里的 `nota-auto-upload`）**缺一不可**，见 `commands/image_upload.rs` 文件头 |
| `nota_image_upload_one` | `(id: DocId, src: ImageSourceArg, alt: Option<String>) -> ImagePlaced`，**手动那一次上传**（对话框里勾了「上传」）。⚠️ **异步 ＋ `spawn_blocking`**（要读盘、要联网，最长 60 秒）。⚠️ 与自动那条路共用同一次「传这张」：**手动是"先传、失败才落盘"，自动是"先落盘、失败就保留本地地址"**——方向不同，结果一样（文档里总有一条能用的地址） |

**借 pandoc 导出（2 个）**（2026-09-25 加）

| 命令 | 签名要点 |
|---|---|
| `nota_pandoc_probe` | `() -> PandocProbe`。⚠️ **异步 + `spawn_blocking`**：要起一个进程问版本，而同步命令跑在主线程上——在那儿等就是冻界面 |
| `nota_pandoc_export` | `(app, format: String, markdown: String, target: String, doc_path: Option<String>, html: Option<String>) -> PandocExport`，**最长 180 秒**，同样走 `spawn_blocking`。⚠️ 七种格式（PDF / Word / RTF / EPUB / LaTeX / ODF / OPML）**借系统里那个 pandoc** 转——Nota 不自带也不下载它（见 `docs/10` §11.2 那条窄口径）；⚠️ **存盘落点由前端选**，这里不兜底文件名；⚠️ PDF **两条路**（pandoc 优先，不通就退到 Nota 自带那套 WebKit 打印），返回值的 `route` 说明这次走的哪条 |

> 📌 **那八条 `nota_slidev_*` 已经整组删掉**（2026-09-25）。Slidev 搬进插件之后，
> 起服务器那条路是插件的命令（`nota_plugin_call`），宿主这边只剩 `devserver.rs`
> 提供机制、**一条命令都不注册**。所以本节从十组变成**八组**；2026-09-26 插入图片
> 与上传图片各加一组，现在是**十组**（和 49 条命令）。
> ⚠️ 这个"十组"指**本节下面有逐条表的那些**；全集是**十九组 75 条**
> （2026-09-27 晚第十遍重数；第九遍那会儿是十五组 63 条）。
> 另外**九组**里，五组见上面那张命令名表（第九遍才发现它们一条都没进过本节），
> 剩下四组（会话 6 / 路径判型 1 / webview 2 / 窗口 1）**连那张表也还没进**——
> 逐条说明只在 `docs/02`。

**原生菜单（1 个）**

| 命令 | 签名要点 |
|---|---|
| `nota_native_menu_apply` | `(app, nodes: Vec<MenuNode>) -> Result<bool, String>`。返回 `bool` 而不是 `()`：**前端要靠它决定要不要隐藏自绘菜单栏**，`false` = 没挂上（非 macOS 或 Tauri 报错），那就继续用自绘的那套 |

**启动与握手（2 个）**

`lib.rs` 自己的两条，不在 `commands::*` 下——它们各自只依赖一个模块级的纯函数，
够不上单独开一组命令文件。

| 命令 | 签名要点 |
|---|---|
| `nota_frontend_ready` | `(app: AppHandle) -> Result<(), String>`，**今天是有意的无操作**，见下一节 |
| `nota_startup_file` | `() -> Option<String>`，启动时命令行里那个文件（`nota 笔记.md` / 文件管理器的"用 Nota 打开"）。⚠️ **宿主只转告路径、不自己打开**：打开动作在前端只有一份（`App.tsx::openPath`，连"读不出来弹提示条"都在那里），宿主再写一份就是第二个真相源，而且 `setup` 里出错只能进终端。⚠️ 挑参数的规则在 `cli.rs`（不判存在性、不读文件） |

⚠️ `nota_plugin_call` 的 `plugin` **必须**是注册者自己的 id（从 `nota_plugin_menus`
**命令**拉回来的那份清单里带过来），**不许凭命令名去猜是哪个插件的**——
两个插件重名时猜错，就是静默调用了另一个插件的命令。
（⚠️ 原文这里写的是「从 `nota_plugin_menus` **事件**里带过来」——那是 BUG-13 之前的
口径，那两条事件已经删了。改成命令之后**语义反而更顺**：清单本来就是"按需拉"。）

⚠️ 前端侧还有一批命令**在 `ipc.ts` 里声明了但今天没有任何调用者**：
`api.doc.get` / `hasUnsaved`、`api.workspace.close`、
`api.plugin.setEnabled` / `findCommand`。
见本文"前端那一侧的装配"里的遗留项。
（⚠️ 这份名单 2026-09-25 重数过一遍：原来还列着 `reload` / `settings.set` / `call` / `menus`
四条，**它们都已经有调用者了**——名单上次更新之后有人接上了线，没人回来删。
判据是 `grep -rn 'api\.<组>\.<名>(' src/ --include=*.ts --include=*.tsx | grep -v ipc.ts`。）

⚠️ **这个名单会过期，用之前先数一遍**（`grep -rn "api\." src --include=*.tsx`）。
本批就抓出两处过期：`api.doc.setActive` **已经有人调了**（BUG-6 修完之后
`App.tsx` 里那个只依赖 `activeId` 的 effect），`api.plugin.panels` 也是
（BUG-13 那批接上的）。
⚠️ **2026-09-24 又加了一组已经有人调的**：`api.export.write` / `api.export.print`
（调用点都在 `ui/useExport.ts`），**它们不该出现在上面那份名单里**。**"声明了没人调"这个判断和"某某不存在"一样，
是要靠 grep 复核的否定命题**——照上一版抄就是错的。
⚠️ 名单里 `api.plugin.menus` 的"没人调"**是暂时的、不是漏**：菜单栏还没做
（`docs/07` backlog 第 40 项），拉回来的清单眼下没处可放。

### 通道 B：后端 → 前端（Tauri 事件）

**一共 10 个宿主事件名 + 1 条插件自定义的通道**（前端 `events` 表在
`src/bridge/ipc.ts:654-772`，十个都在里面有常量）。

⚠️ **2026-09-28 重数过一次，此前这里写的是「5 个」。** 那五个就是下面这张表的前五行；
中间陆续补进来的**五条**（`focus-state` / `focus-beep` / `file-changed` /
`second-instance` / `format-key`）**一条都没登记进这张「总表」**。
⚠️ 三个真相源（`ipc.ts` 的 `events` 表、各文件里的 `EVENT_*` 常量、前端各自的 `on(...)`）
一直是对的，**只有这张表停在原地**——**「一共 N 个」这种数要么现数、要么别写**，
这句话本仓说过很多遍，这次又栽在同一个坑里。

| 事件名 | 谁发 | 载荷 | 前端今天收不收 |
|---|---|---|---|
| `nota:notify` | `lua/api/ui.rs:68`（`nota.ui.notify`） | `{plugin, message, level}`，`level ∈ info/warn/error/success` | ✅ 订阅了 → `toast()` |
| `nota:document-changed` | `lua/api/document.rs:126`（`nota.document.set_text` / `append_text`） | `{id, text, origin: "plugin"}` | ✅ 订阅了 → `editorRef.setMarkdown` |
| `nota:document-edit` | `lua/api/document.rs`（`nota.document.insert_at_cursor`，第 14 项，2026-10-04） | `{id, op: "insert-at-cursor", text}`——⚠️ **是一条「意图」，不是「发生」**：宿主**改不动**，请编辑器落一笔真事务 | ✅ 订阅了 → `ui/useAppEvents.ts` → `editorRef.插入在光标处`（⚠️ **允许丢掉**：编辑器没挂、或已切走那份文档就作废） |
| `nota:plugin-panel` | `lua/api/ui.rs:249`（`nota.ui.refresh`） | **空**——"这个面板的内容变了，去重拉" | ✅ 订阅了 → `pluginPanelContent(…)` |
| `nota:plugin-review` | `lua/api/ui.rs:300`（`nota.ui.review`）＋ `commands/plugin.rs:209` ＋ `plugin/mod.rs:456` | **空**——"编辑区摊的那一块换了" | ✅ 订阅了 → `api.plugin.review()` |
| `nota:native-menu` | `lib.rs:243`（Tauri 的菜单回调） | 命令 **id** 字符串 | ✅ 订阅了 → 查 `menuHandlers` |
| `nota:focus-state` | `focus/mod.rs:422`（那一拍的循环）＋ `commands/focus.rs:27`（`get` / `start` / `stop` 各先回一份） | `FocusState` 快照 | ✅ 订阅了 → `ui/useForceFocus.ts`（状态栏那一格） |
| `nota:focus-beep` | `focus/alarm.rs:51` | **空**——「该响了」（**音色归前端**） | ✅ 订阅了 → `ui/useFocusAlarmSound.ts` |
| `nota:file-changed` | `watch.rs:275`（发现那一半） | `{id, path, hash}`——**磁盘上那份文件被别的程序改了** | ✅ 订阅了 → `ui/useExternalChanges.ts` |
| `nota:second-instance` | `single_instance.rs:307`（第二个进程递过来的那一路）＋ `mcp/host.rs:204`（复用同一名字） | 「抬窗」 / 「打开某个路径」 / 报错三种（见 `bridge/payloads.ts`） | ✅ 订阅了 → `ui/useAppEvents.ts` |
| `nota:format-key` | `format_keys.rs:175`——⚠️ **GTK 捕获相位那一层，不是命令也不是 Lua**（2026-09-28，**BUG-49**） | 命令名（`bold` / `italic`） | ✅ 订阅了 → `ui/useMenus.ts`（走**和 `keydown` 一模一样**的判据）。⚠️⚠️ **2026-09-29 实测：这条事件在真程序里一次都没响过**（生产者在真程序里从不触发），前端那条订阅是**备用**，见下面第 3 条 |
| `plugin:<channel_id>:<name>` | `lua/api/mod.rs:217`（`nota.event.emit`） | 插件自定（Lua 值 → JSON） | ❌ 名字由插件决定，前端只能事后 `listen`；今天没人订 ⚠️ |

⚠️ **曾经还有 `nota:plugin-menu` 与 `nota:slidev-stopped` 两条，都删掉了。**
前者是**声明（状态）**，走事件必漏——注册在插件加载时、订阅在挂载之后，
现在改走 registry 被**拉**（`nota_plugin_panels` / `nota_plugin_menus`，BUG-13）；
后者是预览不再单开窗口之后**没有生产者了**（2026-09-25，见上面 §Slidev 预览）。
**判据：声明是状态 → 拉；发生是事件 → 推。** 而 `plugin-panel` / `plugin-review`
推的是**"此刻变了"这个动作**（载荷是空的，收到就去重拉），所以它们不违反这条判据。

关于上表要说明的四件事：

1. **`nota:document-changed` 今天的唯一发送者是插件那条路。** 注释里写"与宿主自己的
   `nota:document-changed` 一致"是一条**约定**（前端不必区分是谁改的），宿主自己发这条
   事件的路径今天还没有。前端那边只认 `origin === "plugin"` 且 id 等于当前活动文档的分支，
   所以在宿主自己开始发之前，这个缺口不会造成重复覆盖。
2. **`plugin:<channel_id>:<name>` 里的 `<name>` 是插件给的原文，不做归一化。**
   只有插件的 id 那一节过 `channel_id()`。`name` 里若带 `.`，`emit` 会当场报错
   （`only alphanumeric, '-', '/', ':', '_' permitted`）。内置插件用的是 `git:status`、
   `ai:preview` 这种带冒号的名字，冒号在允许集合里，所以没问题。
3. ⚠️ **`nota:format-key` 是这张表里唯一一条「生产者既不是命令、也不是 Lua」的事件**
   （2026-09-28，BUG-49）：它由 `src-tauri/src/format_keys.rs` 那个 **GTK 捕获相位**的
   键盘控制器发出——**设计时**的理由是「WebKitGTK 在把按键派发给 DOM **之前**就把 `Ctrl+B` /
   `Ctrl+I` 当成自己的编辑命令吃掉了，DOM 那一层收不到，菜单加速键也在**冒泡末端**查、
   同样收不到；捕获相位的 `GtkEventControllerKey` 一定早于 WebView，所以只有它能发这条」。
   ⚠️⚠️ **2026-09-29 实测：那个理由不成立，这条事件一次都没响过**——`NOTA_DEBUG=1` 下
   4 次 `Ctrl+B` ＋ 1 次 `Ctrl+I`，日志里只有「已装上」、**0 条「拦到」**。把它推翻的两条实测是：
   ① 最小复现里网页侧的 JS 收得到 `key=b ctrl=true`；② 真程序里那个 `window` 监听也收得到。
   **BUG-49 / BUG-53 的真凶在别处**：`Mod-b` / `Mod-i` 被绑了**两次**（上游 `strongKeymap` /
   `emphasisKeymap` ＋ 菜单表的 `fmt.bold` / `fmt.italic`），两条命令都是 **toggle、跑两遍正好
   抵消**，看起来就是「按了没反应」；修法是 `ui/useMenus.ts` 那条 `window` 监听第一句加
   `if (e.defaultPrevented) return;`（ProseMirror 的监听挂在 contenteditable 上、比 `window` 早）。
   ⚠️ 因此这一行**今天描述的是一条死链路**：生产者在真程序里从不触发，前端那条订阅只是**备用**。
   `format_keys.rs` 那一层**目前留着**，**「删还是留」是待拍板项**（删它要连着动 `lib.rs` 的
   `on_page_load`、前端那条 `nota:format-key` 监听、`ipc.ts` 的频道名和几份文档；
   账在 `docs/07` 的 BUG-49）。
   ⚠️ **它凭什么还是"事件"**——判据依旧是那句「**发生是事件 → 推**」：设计意图里发生的是
   「用户按下了 `Ctrl+B`」**这个动作**，不是一个可拉的状态（没有任何一本账记着「现在按没按」）。
   这条判据今天仍然对，只是**没有生产者**。
   ⚠️ 载荷**就是一个字符串**，`bridge/payloads.ts` 里**没有**它的类型壳，别再给人加一层。
   ⚠️ **只在 Linux 上装**：macOS / Windows 上这两颗键本来就到得了 DOM，
   装了会和那条 `keydown` 撞成执行两遍。文件头现在写着两面：**设计的那套论证 ＋ 实测把它推翻的经过**。
4. ⚠️ **插件 UI 的接收端已经接线（2026-09-22，BUG-13），但它走的是「拉」不是「推」。**
   `register_panel` / `register_menu` 不再 `emit`，改为写进插件的 Lua registry
   （`nota_panels` / `nota_menus`），前端挂载后调 `nota_plugin_panels` /
   `nota_plugin_menus` **拉**一次。原来那两条事件名与 `ipc.ts` 里对应的
   `PluginPanelPayload` / `PluginMenuPayload` **一并删掉了**——留着只会让同一个错误重演。
   ⚠️ **那两条名字后来被"动作"事件复用了**：`nota:plugin-panel` 现在是
   `nota.ui.refresh` 的频道，`nota:plugin-review` 是 `nota.ui.review` 的。
   这不是把删掉的东西又装回来——**当年错的是"用事件送声明"，不是这个名字**：
   今天这两条推的是**"去重拉"这个动作**（载荷是空的），收到就去拉，丢了也不影响正确性。
   📌 本项的三条尾巴（`api.plugin.call` 没有调用者、面板内容空着）**都已在
   2026-09-24 结清**：菜单栏做了（`docs/07` 第 40/42 项）、面板 DSL 落地（第 15 项，
   十六种 `kind`，见 `docs/13` §8.5）。

### `nota_frontend_ready`：**有意的无操作**

```rust
#[tauri::command]
fn nota_frontend_ready(app: tauri::AppHandle) -> Result<(), String> {
    let _ = app;
    Ok(())
}
```

它今天**什么都不做**，这**不是漏写**。它存在的理由原先是解决一个竞态：
插件在 `setup()` 里加载（`on_load` 里注册菜单/面板），而那一刻 WebView 连
`listen()` 都还没注册——**事件发出去没人收，而且不报错**（Tauri 的 `emit`
对没有监听者的频道是静默成功的）。

⚠️ **但"从此把注册改成推、再记账重放"那个方案是错的，不是没做完**（BUG-13）。
它会让面板清单有**两个真相源**——前端的事件账本、插件自己的注册表——
重放漏一次、或前端不是幂等的，两边就静默分叉，**和它要解决的问题一模一样**。
判据就藏在原文里：一个需要靠"幂等"来兜底的设计，通常意味着状态被存了两份。

**真正对的是「声明是状态 → 拉；发生是事件 → 推」**（本仓 `nota_commands`
早就在用的那套）。所以：

- 面板与菜单**根本不发事件**，写进 Lua registry，前端挂载后调命令拉一次——
  那个竞态不存在，也就不需要重放（见上一节第 3 条）；
- 这个命令**保留**，但用途缩小成"**WebView 从这一刻起能收事件了**"
  （`api.frontendReady()`，失败只 `console.warn`）。它还回答一个真问题——
  启动早期推的事件必然丢，将来要补"先攒着、这一枪之后补发"就落在这里。

设计被推翻的完整记录见 `docs/07-feature-status.md` BUG-13 与第 16 项
（编号保留，状态是**已作废**）。

---

## 插件子系统的分层

三层，每层只做一件事。看代码时按这个顺序读：

```
PluginHost                      plugin/mod.rs
  ├─ discover(resource_dir, &HostContext) -> Self   扫目录、按 id 去重、查通道撞名
  ├─ plugins: Vec<LuaPlugin> + disabled: HashSet<String>
  └─ call_command(&self, plugin_id, command, args) -> Result<mlua::Value>   派发
            │
            ▼
LuaPlugin                       lua/mod.rs               一个插件一个 Lua 状态
  ├─ load(manifest, ctx)        install() → api::build() → 跑 entry chunk → on_load(nota)
  ├─ state: Loaded | Failed(String) | Disabled
  ├─ rejected(manifest, reason) 连 Lua 都不用建（通道撞名那条）
  ├─ unload(&self)              调 on_unload，然后对象被丢弃、Lua 状态一起没
  └─ call_command(&self, name, args)   从 registry 的 nota_commands 取函数调
            │
            ▼
lua/api::build(lua, manifest, ctx)  -> Result<Table, NotaError>   lua/api/mod.rs
  ├─ 永远可用：version / api_version / plugin_id / log / command / event / diff / i18n
  │              （diff 是 2026-09-24 加的**纯函数**表：一段文本进、一段文本出，
  │                不碰文档不碰磁盘，见 lua/api/diff.rs 与 `docs/13` §11；
  │                i18n 是 2026-09-25 加的**只读**表：宿主用插件自己的目录拼出
  │                `lang/<tag>.toml`，插件只交**键**，见 `lua/api/i18n.rs` 与 §界面语言）
  ├─ document.read | document.write  → nota.document
  ├─ fs.read | fs.write             → nota.fs
  ├─ process.git                    → nota.git
  ├─ process.devserver              → nota.devserver （宿主替插件起清单里那**一条**命令，
  │                                                  见 devserver.rs 文件头，2026-09-25 加）
  ├─ ui.notify|ui.open_url|ui.panel|ui.menu → nota.ui
  ├─ network.http                   → nota.http      （ureq，阻塞，走 spawn_blocking）
  └─ settings.own                   → nota.settings  （一个插件一份明文 TOML）
```

### 三条贯穿这个层次的设计判断

1. **按能力装表，不装空壳。** 没申请 `document.read`，`nota.document` 就是 `nil`——
   不是"存在但调用时报错"。理由：前者让插件作者**在开发期**就发现问题，后者写完才报错；
   也让"权限"落在结构上，而不是运行时才拦一句。

   📌 **历史（已结清）**：`nota.http` / `nota.settings` 曾经是唯一的例外——
   能力声明了、功能还没做，于是装一张"会明说没实现"的表，为的是让插件作者拿到
   一句"尚未实现（docs/07 第 12 项）"而不是 `attempt to index a nil value`。
   **2026-09-24 两张表都落地了**（`lua/api/http.rs` / `lua/api/settings.rs`，
   见 `docs/07` 第 12/13 项），所以现在**没有例外**：`nil` 就是"没申请或没实现"，
   两种情况的区别由能力清单本身回答。`装_ui吗()` 下面那种"假表"路径一并删掉了。
   ⚠️ **还有一处坑（曾经的缺陷，2026-09-22 已修，见 `docs/07` BUG-8）**：
   `nota.ui` 这张表**本身**也有判据——表**里面**每个方法各自判一次
   （今天四处：`ui.rs:62` `UiNotify`、`:83` `UiPanel`、`:96` `UiMenu`、`:109` `UiOpenUrl`），
   表**外面**还要再判一次"表装不装"。**两层是相乘的**：
   只申请 `ui.panel` 的插件表是有的、`register_panel` 有、但 `register_menu` 是 `nil`。
   而这个外层判据当初**漏了 `ui.menu`**，于是只申请 `ui.menu` 的插件拿到的
   `nota.ui` 是 **`nil`**，调 `register_menu` 直接 `attempt to index a nil value`
   ——`ui.menu` 这条能力**形同虚设**。两个内置插件都申请了 `ui.panel`，所以一直没暴露。

   **修法没有停在"补上漏的那一项"**，而是**让两层由同一个数组产生**：`lua/api/mod.rs:336` 里
   ```rust
   const UI能力: [Capability; 4] = [UiNotify, UiPanel, UiMenu, UiOpenUrl];
   fn 装_ui吗(manifest: &Manifest) -> bool { UI能力.iter().any(|c| manifest.has(*c)) }
   ```
   ⚠️ 当时是 3 项，2026-09-25 加 `ui.open_url` 时变成 **4 项**——
   **正是这条用例逼着一起改的**（只往 `ui.rs` 加判据、忘了往数组里加，它就红）。
   再加一条用 `include_str!("ui.rs")` **数判据个数**的用例——谁往 `ui.rs` 加了第四个
   `ui.*` 判据而忘了往数组里加，用例就红。**这才是这个坑真正的收获：两层判据必须同源，
   否则"每层单看都对"而合起来仍然失效。**

   📌 **这一段踩过一次坑，记在这儿**：2026-09-22 核对时只 `grep` 到 `api/mod.rs:83`
   那一行 `set(...)`，**没看上一行的 `if`**，就断定"无条件调用、文档在编"，
   把原本**正确**的说法改成了错的，还把错误结论转告给了另一个写文档的代理。
   教训：**判断"没有条件"之前必须看上下几行，`grep -n` 的单行输出会误导判断。**

2. **一个插件坏掉不能拖垮启动。** 见前面"每一步失败会怎样"表里那两行。

3. **沙箱两道闸。** 第一道是**本仓自己列的**标准库白名单（`lua/mod.rs` 的
   `硬化的_lua()`）：只开 `coroutine`/`table`/`string`/`utf8`/`math`，再把
   `io`/`os`/`package`/`require`/`loadfile`/`dofile`/`debug` 逐个置 `nil`。
   第二道是 `lua/api/` 里的：所有对外能力**只**通过 `nota.*` 提供，
   且逐项按清单声明的 capability 决定装不装。
   换句话说——**脚本能做的事 = 清单申请到的事，没有旁路**。
   细节与"为什么是 Lua"见 `docs/12-plugin-runtime.md`。

   ⚠️ **`require` 是这条的一个例外，2026-09-27 起**：`装require()` 补回了一个
   **只在本插件目录里找 `.lua`** 的 `require`（插件多文件要用）。它没有把
   `package` 带回来——`.so`、`package.path`、任意文件读取三样仍然一样都不可达
   （`docs/12` §5.9 有逐条对照）。所以那句话该读成"**`nota.*` 是唯一的对外
   通道**"，而不是"`require` 这个词在插件里不存在"。

   ⚠️⚠️ **这一段原先写的是"第一道是 mlua 给的：`Lua::new()` 只加载安全标准库子集，
   `io`/`os`/`debug`/`package`/`require` 全都不存在"——那是假的（BUG-10，已修）。**
   mlua 的 `ALL_SAFE = StdLib((1 << 30) - 1)` 把第 0–29 位全含在内，
   而 `IO` 是第 2 位、`OS` 是第 3 位、`PACKAGE` 是第 8 位——**都在里面**，
   只有第 31 位的 `DEBUG` 被排除。它的 "safe" 指的是**不能加载 C 模块**。
   实测：`os.execute("touch /tmp/x")` 真建出文件、`io.open("/etc/hostname")` 真读到内容。
   所以**那道围栏曾经形同虚设**——只申请 `ui.notify` 的插件照样能 `os.execute("rm -rf ~")`。
   **教训：库的 `safe` 字面不是安全承诺，那是它自己定义的口径，只能读源码确认。**

### 发现与去重的两条口径

- **扫两类目录**：`paths::user_plugins_dir()`（用户自装）+ `paths::builtin_plugins_dirs()`。
  用户目录**先扫**，先到的进 `seen`，后到的同名插件被跳过——"用户覆盖内置"是循环顺序的
  自然结果，不用额外判。
- **按清单里的 `id` 去重，不按目录名。** 目录名是文件系统的事，用户可以随便改；
  `id` 是清单里声明的、插件之间互相引用的名字。用目录名去重会出现"改个文件夹名就多出
  一份插件"这种事。debug 构建下 `builtin_plugins_dirs` 额外返回几档开发态目录（2026-10-09 起第一顺位是**同级插件仓库** `Nota-plugins/plugins`，见 `docs/11` §1.1），
  所以改完 Lua 存盘即生效，不用重编。
- ⚠️ **当前安装包不含插件**：`tauri.conf.json` 的 `bundle.resources = {}`，
  四个官方插件从独立仓库单独发布并在用户目录安装。开发态仍从同级
  `Nota-plugins/plugins` 加载；不要把“开发态能发现四个插件”误读成“发布包随附四个插件”。

### 通道名归一化（`plugin::manifest::channel_id()`）

**Tauri 的事件名只允许字母数字与 `-` `/` `:` `_`，点号不合法。** 而清单里的 `id`
允许点（`nota.git`、`nota.ai` 就是这么写的）。所以拼事件通道名**必须**过
`channel_id()`——它把不在允许集合里的字符一律换成 `-`。

漏掉它的表现：插件加载"成功"，但第一次 `emit` 才抛错，**静态看代码完全看不出来**。

代价是 `.` 和 `_` 与 `-` 在通道名里成了同一个字符，于是 `nota.git` 与 `nota-git`
会撞成同一个通道。两种写法都是合法 id，撞了事件就分不清是谁发的，所以
`PluginHost::discover()` 把**后一个判为加载失败**并写明原因，而不是让它们悄悄混在一起。

---

## 前端那一侧的装配

### `main.tsx` → `App.tsx`

`main.tsx` 只做四件事：`installErrorHooks()`（把全局错误与未捕获的 Promise 拒绝挂上，
打包后没有 devtools，这类错误不挂就是彻底静默）、找 `#root`（找不到直接 `throw`）、
`createRoot` + `StrictMode` 渲染 `<App />`、以及 `import` 两份 CSS
（`styles/theme.css`、`styles/app.css`）。

`App.tsx` 是**外壳与全部状态**。它只做三件事——**取数据、派事件、拼布局**；
编辑器的活全在 `ui/EditorPane.tsx`，文件树的活在 `ui/Sidebar.tsx`。

⚠️ 注¹：2026-09-23 起"真相"**不再恒指 ProseMirror 文档树**。`EditorPane` 按
`viewMode` 分派三种模式——`wysiwyg` 装 Milkdown（ProseMirror 树是真相）、
`source` / `split` 装 CodeMirror（**它的 `Text` 是真相**，`split` 右边那份 Milkdown
只是只读投影）。所以那条不变的规矩要改写成：**同一时刻只有一份权威文本**，
它由 `mode` 决定；分屏里**永远只往右流**，预览不回写（理由见 `05` §3.1）。
⚠️ 那个值 2026-10-07 起来自 `ui/useFileKindMode.ts`（**会话内状态、不落盘**，
默认每次启动都是 `wysiwyg`），不再是 `settings.view_mode`——理由见 `03` §5.2 末段。

### `App.tsx` 持有的 state

| state | 类型 | 谁在用 |
|---|---|---|
| `docs` | `Document[]` | 标签栏、状态栏、`activeDoc` 的推算 |
| `activeId` | `DocId \| null` | 决定渲染 `EditorPane` 还是 `Home` |
| `settings` | `Settings \| null` | 外观两条界面轴 + `document_theme`（文档主题 id）、`content_width` ＋ `limit_text_width`（正文宽度那一对，2026-10-09 起**开关默认关**＝正文列铺满）、`confirm_unsaved`……⚠️ **编辑模式不在这里**（2026-10-07 起是会话内状态，住在 `ui/useFileKindMode.ts`，见 `03` §5.2 末段） |
| `workspace` | `string \| null` | 侧栏文件树、`refreshTree` 的开关 |
| `tree` | `TreeNode[]` | 侧栏文件树 |
| `plugins` / `panels` | `PluginInfo[]` / `PluginPanel[]` | 右侧插件栏的「插件」页签（清单）、`Home` 的插件状态列。⚠️ **当前是哪一页签、每页拉到什么内容**都不在这里——都在 `PluginDock` 内部（内容每页一份、还有请求序号），见 `docs/04` §状态 |
| `themes` | `DocThemeInfo[]` | 菜单栏「主题」那一栏（**全是文档主题**）。**启动时拉一次** |
| `settingsOpen` | `boolean` | 偏好设置框开不开（`ui/SettingsDialog.tsx`）。入口是菜单「文件 → 偏好设置」 |
| `toasts` | `Toast[]` | `Toasts` 组件 |
| `dockOpen` / `sidebarOpen` / `sidebarTab` / `statusBarOpen` | `bool` / `bool` / `SidebarTab` / `bool` | 界面三块的开合，以及左栏当前是哪一页 |
| `confirmReq` | `{…} \| null` | 自绘确认框的受控状态（`ui/ConfirmDialog.tsx`），配一个 `confirmResolve` ref 存 Promise 的 resolve |

⚠️ **有几个"看着像 state、其实不在 `App.tsx`"的东西**，它们各有一条理由：

| 名字 | 归谁 | 为什么不是这里的 `useState` |
|---|---|---|
| 编辑区里摊着的插件面板（`预览` / `收预览`） | 宿主 `plugin::ReviewState`（`ui/usePlugins.ts` 转一手） | 刷新一次界面／热重载一次，"我正在看 AI 提的那份改动"不该就这么没了 |
| 界面语言 | `src/i18n/index.ts` 的模块级状态（组件用 `useT()` 订阅） | 语言是**全局**的，不是某个组件的属性；`useSyncExternalStore` 让每个用它的组件各自重画，不必从顶上往下传 |
| 插件栏当前是哪一页、每页拉到什么内容 | `PluginDock` 内部 | 没有第二个人要用（同上） |

外加一个 `editorRef: Ref<EditorPaneHandle>`——它是 App 进入编辑器内部**唯一**的通道：
`getMarkdown()`（存盘前强制同步用）、`setMarkdown()`（插件改了文档时用），
外加 `ui/commands.ts` 里那些菜单/快捷键动作转发过去的**编辑器命令**（见 `05`）。

⚠️ `sidebarOpen` / `sidebarTab` / `statusBarOpen` / `dockOpen` 是**受控的**：
状态全在 `App.tsx`，`Sidebar` / `PluginDock` / `StatusBar` 自己不持有。
⚠️ 例外是 `PluginDock` 里**页签选中了哪一页**与每页的内容——那是"这一刻从插件拉回来的
东西"，没有第二个人要用，所以不往上抬（2026-09-24 页签化时定的；面板内容本来就这样）。
所以菜单栏（在 `App.tsx` 里渲染）能直接改它们——这是"快捷键能开某个侧栏页"
（Ctrl+Shift+1 大纲、Ctrl+Shift+3 文件树）能实现的原因。

### 几个 effect 各自干什么

| effect | 依赖 | 干什么 |
|---|---|---|
| ~~启动~~ | — | ⚠️ **这一条 2026-09-26 搬去了 `ui/useStartup.ts`**（当时 `App.tsx` 1049 行），不在下面这张表里了：`Promise.all` 拉 settings / workspace / plugins / panels / themes / **`nota_settings_problem`** / **启动文件** / **`nota_app_lang`** → `refreshDocs()` → 调一次 `api.frontendReady()`（失败只 `console.warn`）。用 `alive` 标志挡住卸载后的 setState。⚠️ 后三枪**各自自带 `catch`**：它们坏掉不该把整个启动掀翻（设置问题那条退了就是少一个提示，语言那条退了就按兜底语言画）。⚠️ **`定语言(界面语言.effective)` 必须在 `setSettings` 之前**——定了之后 `i18n` 会通知订阅者重画，而那一批订阅者这一帧还没挂上。⚠️ **2026-09-27 起它还要读设置里的「启动时」那一档**并递给 `接上会话`（三档），那一档在 2026-09-27 之前是**摆设** |
| 事件订阅 | `[toast, refreshDocs]` | 订 `nota:notify`（→ toast）与 `nota:document-changed`（→ 活动文档且 `origin === "plugin"` 时整篇覆盖编辑器；**改的不是当前那份**就退而 `refreshDocs()`，否则用户切回去时会拿旧文本重建、把插件的改动覆盖掉）。返回时逐个退订。⚠️ 依赖里**没有 `activeId`**——它在回调里读 `activeIdRef`，所以这个 effect 只跑一次。⚠️ `nota:plugin-panel` / `nota:plugin-review` 那两条**不在这里订**——它们归 `usePlugins` / `PluginDock`（谁用谁订） |
| 活动文档上报 | `[activeId, toast]` | 写 `activeIdRef` 并 `api.doc.setActive(id)`，让后端的"活动文档"跟上用户真正在看的那个标签（BUG-6） |
| 外观 | `[settings]` | `settings` 有值就 `applyTheme(settings)` |
| 文档主题 | `[settings?.document_theme, themes]` | 找到同名主题就 `applyDocTheme()`，空名/找不到就撤掉样式 |
| 重取文件树 | `[refreshTree]` | 而 `refreshTree` 依赖 `workspace`，所以工作区一变就重取 |
| 快捷键 | `[accelIndex, menuHandlers, disabledCommands]` | `window` 上听 `keydown`，**查表派发**（不再逐个判键）：键位签名 → 命令 id → `menuHandlers[id]`。表由 `ui/accel.ts::buildAccelIndex(菜单)` 推出来，而 `菜单` 是 `App.tsx` 里 `应用键位覆盖(注入最近文件(全部菜单, 最近), settings?.keys?.overrides ?? {})` 那一份——**出厂键位在 `commands.ts` 的 `accel` 字段，用户改过的那些在 `settings.keys.overrides`**。完整口径见 `04` §4 |
| 原生菜单 | `[disabledCommands, menuChecks, themes, settings?.document_theme]` | `api.nativeMenu.apply(buildNativeTree(...))` 推一份给 macOS（返回 `false` 就继续用自绘的）；另一个 effect 订 `nota:native-menu`，收到 id 走 `resolvePick` 分流。见 `04` §2.1c |

### 主链路（前三条 ＋ 下面第四条）

```text
打字
  Milkdown listenerCtx.markdownUpdated
  → EditorPane.onChange
  → 300ms 去抖（SYNC_DEBOUNCE_MS）
  → api.doc.sync(id, text)          → DocumentStore::sync：写镜像、置 dirty、revision+1
  → onDocsChanged() = refreshDocs() → setDocs → 标签上的脏点、状态栏字数跟着动

存盘（Ctrl+S）
  saveDoc(id, shift)
  → 需要时弹保存对话框（未存过盘或强制另存）
  → editorRef.getMarkdown()          ← ⚠️ 关键：**存盘前强制同步**，因为镜像可能还差最后几次击键
  → api.doc.sync(id, text)
  → api.doc.save(id, target)         → 写盘、dirty 归零、revision+1
  → refreshDocs() + toast(已保存到 …)

插件改文档（**整篇替换**）
  Lua nota.document.set_text / append_text
  → DocumentStore::sync（改的是后端镜像）
  → 发 nota:document-changed {origin:"plugin"}
  → ui/useAppEvents.ts → editorRef.setMarkdown(text)   ← 前端编辑器这才知道
```

第三条链是"前端是真相"这条口径的**代价**：插件改了后端镜像，前端不会自己知道，
所以每次写完都必须发事件。漏发的表现是"编辑器里看到的和存盘的不是一份东西"。

### 第三条半链路：插件请编辑器**替你改一笔**（`nota:document-edit`，第 14 项，2026-10-04）

上面那条"整篇替换"的代价是**撤销栈断掉、光标跳走、表格列宽之类的排版状态全丢**，
所以"在光标处插一句"不该用它。第二条第 14 项开的路**方向反过来**——
宿主**不改镜像**，只把意图递回去：

```text
插件改文档（**只改一处**）
  Lua nota.document.insert_at_cursor(text)      ← 一个字节的镜像都不动
  → 发 nota:document-edit {id, op:"insert-at-cursor", text}
  → ui/useAppEvents.ts → editorRef.插入在光标处(text)
  → editor.create.ts 里落一笔**真 ProseMirror 事务**（view.dispatch(tr.insertText(...))）
  → 正文变了 → 走上面那条 300ms 去抖 sync 回来 → revision 这时才动
```

⚠️ 为什么不由宿主自己拼字符串改镜像——**量过，做不到**：Markdown 字符偏移这个
坐标系在块边界上不存在（列表项开头插字会多出 `- `、两段之间插字会多出空行），
表在 `docs/05` §5.2b，量测钉在 `tests/caret-snapshot.test.ts` 第三组。
⚠️ 所以插件**拿不到光标偏移量**（`get_selection()` 给的是**选中的那段字**）。
⚠️ 这条意图**允许被丢掉**（编辑器没挂着、用户已经切走文档）——它不是"发生"，
是"一次请求"，跟表里其余每一条的规矩都不一样。

### 第四条链路：插件把一块面板摊到编辑区（`nota.ui.review`，2026-09-24 加）

```text
插件（AI 插件提了一份改动，用户想看）
  Lua nota.ui.review("preview")
  → 宿主 plugin::ReviewState 记下"哪一页"（单格）＋ 发 nota:plugin-review（空载荷）
  → App.tsx 的 usePlugins 收到 → api.plugin.review() 拉一次
  → App.tsx 给 .app-main 挂 data-review="true" + <ReviewPane>
  → CSS（styles/review.css）让正文**让位**，不是"二选一渲染"

用户点「回到正文」
  → 前端 api.plugin.reviewClose()（⚠️ 不走插件，见下）
  → ReviewState 清空 + 同一条事件 → ReviewPane 卸载、data-review 撤掉
```

⚠️ **正文那一块不能卸载**（只是被 `data-review` 推开）：它装着 Milkdown，
卸载就是"用户看了一会儿改动，回来时编辑器重建、光标和滚动位置都没了"。
⚠️ **收起来这件事有两颗按钮、两个方向**：用户点「回到正文」走**前端**那条命令
（`nota_plugin_review_close`），而插件自己收起走 `nota.ui.review(nil)`——
**两条都得有**：插件知道"用户点了完成"是什么意思，宿主不知道。
⚠️ `ReviewState` **特意不放在 `AppState` 里**：拿它不需要 `plugins` 锁，
否则插件正跑着（宿主握着那把锁）的时候，那颗「回到正文」的按钮会按不动。

### 前端的遗留项（都是已知的，不是意外）

| 位置 | 现象 | 原因 |
|---|---|---|
| `applyTheme` 的 `detectStyle()` | `guessDesktop()` 恒返回空串，所以 `ui_style = auto` **永远落到 Adwaita** | WebKitGTK 不把桌面环境告诉 JS；等接上 XDG portal 的 `color-scheme` 再换 |
| ~~打开对话框的后缀~~（**2026-09-28 已修**） | `openViaDialog` 的过滤器从前手抄一份 `md/markdown/mdown/mkd/txt`（**没有 `mdx`**），而后端 `is_markdown()` 认 `.mdx` | ⚠️ **这一条留着当记录，不要照它去改代码**：后缀单子 2026-09-28 收成了唯一一份（`editor/file-kind.ts` 的 `MARKDOWN后缀`），`open` 对话框直接展开它，`tests/file-kind.test.ts` 第一组读 Rust 源码盯着两边一致。⚠️ `save` 那张**仍然窄**（`md`/`markdown`/`mdx`），且是**有意的**——它回答的是「新文件写成什么」，不是「哪些归我读」 |
| 主题清单不重扫 | 往主题目录里丢一份新 `.css`，**菜单里不会出现** | 清单只在启动时拉一次（`docs/07` 第 41 项）。⚠️ 改成轮询是错的——主题是"用户偶尔动一次"的东西 |
| 点正文下方空白不聚焦 | 空文档里 ProseMirror 只有一行高，点到下面那片内边距上**编辑器不聚焦**，接着打字什么都不会发生 | `.editor-mount .milkdown` 的 `padding: 48px 56px 120px` 是拖到 `.milkdown` 上的，而可编辑区在它内层。要修得把命中区域撑到整片，见 BUG-15 |

---

## 相关文档

| 要查什么 | 去哪 |
|---|---|
| 每个文件、每个公开函数的签名与行为 | `docs/02-modules.md` |
| `AppState` / `Document` / `Settings` / `Manifest` 的字段与常量 | `docs/03-data-structures.md` |
| 哪个按钮现在能用、哪个是空壳 | `docs/04-ui-map.md`、`docs/07-feature-status.md` |
| 编辑器怎么装配、去抖与整篇替换语义 | `docs/05-editor-bridge.md` |
| 怎么加一个插件、能力表 | `docs/11-writing-a-plugin.md`、`docs/12-plugin-runtime.md`、`docs/13-lua-api.md` |
