# 01 · 运行时架构

> 最后同步：2026-09-22

本文讲**运行时**：进程怎么起来、状态放在哪、两条通道各有什么、插件在哪一层被装配。
逐文件的接口签名在 `docs/02-modules.md`，字段级的数据结构在 `docs/03-data-structures.md`。

---

## 这是什么

**Nota** 是一个 Tauri 2 的桌面 Markdown 编辑器，功能对标 Typora，带一套 **Lua 插件系统**。

设计上最要紧的一条判定是：**文本的真相在前端**（ProseMirror 文档树），后端持有一份
**300ms 去抖的镜像**。这条不是随手定的，理由与代价写在 `src-tauri/src/document/mod.rs`
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
结构编不过，而报错信息不会提"你需要 `send`"。

---

## 两个进程、两个运行时：边界画在哪

```
┌─ Rust 进程 ───────────────────────────────┐   ┌─ WebView 里的 JS 运行时 ──────────┐
│                                           │   │                                   │
│  Tauri 外壳 + #[tauri::command] 命令层     │   │  App.tsx（状态编排 + 布局）        │
│  AppState（四把锁）                        │   │  EditorPane（Milkdown 实例）       │
│  DocumentStore（文档镜像）                 │◄─►│  **ProseMirror 文档树 = 文本真相** │
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
  只会给你一个少了字段的对象，然后在某个 `.map` 上炸掉。

CSP **只写在 `src-tauri/tauri.conf.json`** 里，`index.html` 里不许再写一份
（两个策略会同时生效并互相冲突）。

---

## 启动顺序（`lib.rs::run()`）

顺序是**有讲究的**，`run()` 里每一步都注了为什么。整条链是：

```rust
tauri::Builder::default()
    .plugin(tauri_plugin_dialog::init())   // ① Tauri 自带的三个插件先装
    .plugin(tauri_plugin_fs::init())
    .plugin(tauri_plugin_opener::init())
    .setup(|app| { /* ② 载设置 → 建共享状态 → 发现并加载插件 → manage */ })
    .invoke_handler(tauri::generate_handler![ …21 个命令… ])   // ③
    .on_window_event(|window, event| { /* ④ 窗口销毁时 unload_all */ })
    .run(tauri::generate_context!())
    .expect("Nota 启动失败");                                  // ⑤
```

### ② `setup()` 里的三步

| 步 | 做什么 | 为什么是这个位置 |
|---|---|---|
| ① 载设置 | `Settings::load()` | 插件可能要读设置，得先有 |
| ② 建共享状态 + 加载插件 | 三个 `Arc<Mutex<_>>` → 拼 `HostContext` → `PluginHost::discover(resource_dir, &base)` | 插件的 `nota.ui.*` 要发事件给前端，那需要 `AppHandle`——所以**必须在 Tauri 起来之后** |
| ③ 托管 | `app.manage(AppState { documents, settings, workspace, plugins: Mutex::new(plugins) })` | 命令层与 `unload_all` 都从托管状态里取句柄，必须最后做 |

三者的顺序在代码里就是字面的先后；`documents` 的 `Arc` 同时被 `AppState` 和
`HostContext` 拿着——**是同一个 `Arc`，不是两份拷贝**（插件闭包要长期持有它，
生命周期比任何一次命令调用都长，所以要 `Arc`）。

⚠️ `lib.rs` 里是**手写 `AppState { … }` 字面量**，没有调 `state.rs` 的
`AppState::new()`。那个构造函数今天没人调用（详见 `docs/02-modules.md`）。
两者字段一致，所以不构成 bug，但改 `AppState` 字段时别只看其中一个。

### 每一步失败会怎样

| 环节 | 失败时的行为 |
|---|---|
| 读设置 | **不阻止启动**。`eprintln!` 一行 + 用 `Settings::default()`。一份坏掉的 `settings.toml` 不该让人连界面都进不去——用户至少要能打开应用改回来 |
| 设置文件不存在 | **不算错误**。`load_from` 里 `ErrorKind::NotFound` 直接给默认值（首次启动就是这种情况） |
| 探资源目录 | `app.path().resource_dir().ok()` → `None`。只是少扫一个插件目录，不报错 |
| 单个插件加载失败 | `LuaPlugin::load` **不返回 `Err`**：留下一条 `Failed(原因)`，界面上照常列出并标红。理由很实在——插件是用户自己装的第三方代码，让一个写错的 Lua 脚本变成"应用打不开"，用户连去禁用它的界面都进不去 |
| 清单都读不了的插件 | 只在 `discover()` 里 `eprintln!` 一行，**界面上看不见**（连 `id` 都不知道，没地方挂）⚠️ |
| 事件通道撞名 | 后到的那个插件被判 `Failed(原因)`，原因里写明是谁占了通道（见下面"插件分层"） |
| 窗口销毁时 `unload_all` | 单个插件的 `on_unload` 出错只 `eprintln!`，不向上抛——卸载流程不该被一个插件的残骸卡住 |
| `.run(...)` 本身 | `.expect("Nota 启动失败")`，这是唯一会让进程直接死掉的地方 |

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

也就是说：这条不变量今天**成立得很轻松**，它真正的价值是拦住将来的改动——比如"存盘时要读设置"
（`nota_doc_save` 持 `documents`，若顺手去锁 `settings` 就正好顺着这个方向，安全；
但若反过来在 `nota_settings_set` 里顺手去锁 `documents`，就成环了）。
state.rs 里给的原始理由（"存盘流程要读设置"）是这条规则要保护的方向，不是今天某一行代码。

三条附带的约定：

1. **拿多把锁之前先想清楚自己站在哪一层。**
2. **不要跨 `.await` 持锁。** 宿主今天所有命令都是同步 `fn`（没有 `async fn`），所以
   这条暂时无从违反；它是给将来的异步命令留的。
3. ⚠️ **插件命令执行期间 `plugins` 锁一直被持有**（`nota_plugin_call` 全程握着它）。
   所以插件命令里**不能**再触发一次需要 `plugins` 锁的路径——那会自锁。
   今天 Lua 侧拿不到 `invoke`，走不到这条，但加新 Lua API 时要记住这个前提。

### 为什么 `documents` 是 `Arc<Mutex<_>>` 而不是 `Mutex<_>`

因为插件的 Lua 闭包需要**长期持有**它（闭包活多久，句柄就得活多久），所以必须是 `Arc`。
`workspace` 同理。`plugins` 只在宿主自己的调用栈里用，不需要共享所有权，就是普通 `Mutex`。

---

## 两条通道

跨进程只有两条路。命名上刻意做得**一眼能分清**：命令一律 `nota_` 前缀，事件一律
`nota:` 前缀（插件发的事件是 `plugin:` 前缀）。

### 通道 A：前端 → 后端（`invoke` 命令）

注册表在 `lib.rs` 的 `.invoke_handler(tauri::generate_handler![…])`，**一共 24 个**。
所有调用的唯一出口是 `src/bridge/ipc.ts`——组件里不许直接 `invoke()`。

⚠️ **这个数是数出来的**（`sed -n '/generate_handler/,/])/p' src-tauri/src/lib.rs | grep -c nota_`），
改过注册表就重数一遍。它已经错过一次：BUG-13 那批加了 `nota_plugin_panels` /
`nota_plugin_menus` 两条、本批又加了 `nota_doc_settle`，而表里一直写着 21
——**加命令时最容易漏的就是这个总数和它上面那个分组小标题**。

**文档（11 个）**

| 命令 | 签名要点 |
|---|---|
| `nota_doc_new` | `() -> DocId`，新建空文档并设为活动 |
| `nota_doc_open` | `(path: String) -> DocId`，**已打开就复用**那一份 |
| `nota_doc_sync` | `(id, text) -> u64`，前端推文本，返回新 `revision` |
| `nota_doc_settle` | `(id, text) -> u64`，**装载流程的最后一步**：把编辑器那边的文本认领成「干净文本」，**顺带清掉 `dirty`**。⚠️ 与 `sync` 只差这一条，**别当 `sync` 的别名用**；调用点只有 `EditorPane` 一处，且**必须在 `handle.focus()` 之后**。存在的理由是 BUG-12 |
| `nota_doc_save` | `(id, path: Option<String>) -> String`，给了 `path` 就是「另存为」，返回最终落盘路径 |
| `nota_doc_close` | `(id)`，**不做未保存询问**（那是前端的事） |
| `nota_doc_set_active` | `(id)`，切活动文档 |
| `nota_doc_get` | `(id) -> Document` |
| `nota_doc_list` | `() -> Vec<Document>` |
| `nota_doc_reload` | `(id) -> Document`，从磁盘重读 |
| `nota_doc_has_unsaved` | `() -> bool`，退出前前端拿它决定要不要弹框 |

**工作区（4 个）**

| 命令 | 签名要点 |
|---|---|
| `nota_workspace_open` | `(path: String) -> String`，**规范化后的绝对路径**（这是 `nota.fs`/`nota.git` 的围栏） |
| `nota_workspace_close` | `()`，只清围栏，**不关文档** |
| `nota_workspace_get` | `() -> Option<String>` |
| `nota_workspace_tree` | `(sub_path: Option<String>, depth: Option<u32>) -> Vec<TreeNode>`，按展开状态分段请求，不做整棵树一次拉完 |

**设置（2 个）**

| 命令 | 签名要点 |
|---|---|
| `nota_settings_get` | `() -> Settings` |
| `nota_settings_set` | `(settings: Settings)`，**整份替换**并落盘，落盘失败回滚内存 |

**插件（6 个）**

| 命令 | 签名要点 |
|---|---|
| `nota_plugins_list` | `() -> Vec<PluginInfo>`（含加载失败的，界面上要标红） |
| `nota_plugin_set_enabled` | `(id: String, enabled: bool)` |
| `nota_plugin_call` | `(plugin: String, command: String, args: Option<Value>) -> Value`，载荷是 JSON |
| `nota_plugin_find_command` | `(command: String) -> Option<String>`，某个命令是哪个插件注册的 |
| `nota_plugin_panels` | `() -> Vec<PanelInfo>`，**拉**面板清单（BUG-13 之后改走这里，不再发事件） |
| `nota_plugin_menus` | `() -> Vec<MenuInfo>`，**拉**菜单清单，同上 |

**握手（1 个）**

| 命令 | 签名要点 |
|---|---|
| `nota_frontend_ready` | `(app: AppHandle) -> Result<(), String>`，**今天是有意的无操作**，见下一节 |

⚠️ `nota_plugin_call` 的 `plugin` **必须**是注册者自己的 id（从 `nota_plugin_menus`
**命令**拉回来的那份清单里带过来），**不许凭命令名去猜是哪个插件的**——
两个插件重名时猜错就是静默跑到别人家里。
（⚠️ 原文这里写的是「从 `nota_plugin_menus` **事件**里带过来」——那是 BUG-13 之前的
口径，那两条事件已经删了。改成命令之后**语义反而更顺**：清单本来就是"按需拉"。）

⚠️ 前端侧还有一批命令**在 `ipc.ts` 里声明了但今天没有任何调用者**：
`api.doc.get` / `reload` / `hasUnsaved`、`api.workspace.close`、
`api.settings.set`、`api.plugin.setEnabled` / `call` / `findCommand` / `menus`。
见本文"前端那一侧的装配"里的遗留项。

⚠️ **这个名单会烂，看之前先数一遍**（`grep -rn "api\." src --include=*.tsx`）。
本批就抓出两处过期：`api.doc.setActive` **已经有人调了**（BUG-6 修完之后
`App.tsx` 里那个只依赖 `activeId` 的 effect），`api.plugin.panels` 也是
（BUG-13 那批接上的）。**"声明了没人调"这个判断和"某某不存在"一样，
是要靠 grep 复核的否定命题**——别照着上一版抄。
⚠️ 名单里 `api.plugin.menus` 的"没人调"**是暂时的、不是漏**：菜单栏还没做
（`docs/07` backlog 第 40 项），拉回来的清单眼下没处可放。

### 通道 B：后端 → 前端（Tauri 事件）

**一共 3 个事件名**，其中 2 个是宿主的固定名字（前端 `events` 表里有常量），
1 个是插件自定义的通道。

| 事件名 | 谁发 | 载荷 | 前端今天收不收 |
|---|---|---|---|
| `nota:notify` | `lua/api/ui.rs`（`nota.ui.notify`） | `{plugin, message, level}`，`level ∈ info/warn/error/success` | ✅ 订阅了 → `toast()` |
| `nota:document-changed` | `lua/api/document.rs`（`nota.document.set_text` / `append_text`） | `{id, text, origin: "plugin"}` | ✅ 订阅了 → `editorRef.setMarkdown` |
| `plugin:<channel_id>:<name>` | `lua/api/mod.rs`（`nota.event.emit`） | 插件自定（Lua 值 → JSON） | ❌ 名字由插件决定，前端只能事后 `listen`；今天没人订 ⚠️ |

⚠️ **曾经还有 `nota:plugin-panel` / `nota:plugin-menu` 两条，已经删掉**（BUG-13）。
它们是**声明（状态）**，走事件必漏——注册在插件加载时、订阅在挂载之后。
现在改走 registry 被**拉**（`nota_plugin_panels` / `nota_plugin_menus`），
见下面第 3 条。**判据：声明是状态 → 拉；发生是事件 → 推。**

关于上表要说明的三件事：

1. **`nota:document-changed` 今天的唯一发送者是插件那条路。** 注释里写"与宿主自己的
   `nota:document-changed` 一致"是一条**约定**（前端不必区分是谁改的），宿主自己发这条
   事件的路径今天还没有。前端那边只认 `origin === "plugin"` 且 id 等于当前活动文档的分支，
   所以在宿主自己开始发之前，这个缺口不会造成重复覆盖。
2. **`plugin:<channel_id>:<name>` 里的 `<name>` 是插件给的原文，不做归一化。**
   只有插件的 id 那一节过 `channel_id()`。`name` 里若带 `.`，`emit` 会当场报错
   （`only alphanumeric, '-', '/', ':', '_' permitted`）。内置插件用的是 `git:status`、
   `ai:preview` 这种带冒号的名字，冒号在允许集合里，所以没问题。
3. ⚠️ **插件 UI 的接收端已经接线（2026-09-22，BUG-13），但它走的是「拉」不是「推」。**
   `register_panel` / `register_menu` 不再 `emit`，改为写进插件的 Lua registry
   （`nota_panels` / `nota_menus`），前端挂载后调 `nota_plugin_panels` /
   `nota_plugin_menus` **拉**一次。原来那两条事件名（`nota:plugin-panel` /
   `nota:plugin-menu`）与 `ipc.ts` 里对应的 `PluginPanelPayload` / `PluginMenuPayload`
   **一并删掉了**——留着就是下一次踩的坑。
   ⚠️ `api.plugin.call` **仍然没有调用者**（菜单栏还没做，`docs/07` 第 40 项）。
   ⚠️ 面板**内容**仍然空着（要等声明式 DSL，`docs/07` 第 15 项），界面上如实写着
   「面板内容尚未接入。」。

### `nota_frontend_ready`：**有意的无操作**

```rust
#[tauri::command]
fn nota_frontend_ready(app: tauri::AppHandle) -> Result<(), String> {
    let _ = app;
    Ok(())
}
```

它今天**什么都不做**，这**不是漏写**。它存在的理由原先是回答一场比赛：
插件在 `setup()` 里加载（`on_load` 里注册菜单/面板），而那一刻 WebView 连
`listen()` 都还没注册——**事件发出去没人收，而且不报错**（Tauri 的 `emit`
对没有监听者的频道是静默成功的）。

⚠️ **但"从此把注册改成推、再记账重放"那个方案是错的，不是没做完**（BUG-13）。
它会让面板清单有**两个真相源**——前端的事件账本、插件自己的注册表——
重放漏一次、或前端不是幂等的，两边就静默分叉，**和它想治的那个病一模一样**。
判据就藏在原文里：一个需要靠"幂等"来兜底的设计，通常意味着状态被存了两份。

**真正对的是「声明是状态 → 拉；发生是事件 → 推」**（本仓 `nota_commands`
早就在用的那套）。所以：

- 面板与菜单**根本不发事件**，写进 Lua registry，前端挂载后调命令拉一次——
  赛跑不存在，也就不需要重放（见上一节第 3 条）；
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
  ├─ 永远可用：version / api_version / plugin_id / log / command / event
  ├─ document.read | document.write  → nota.document
  ├─ fs.read | fs.write             → nota.fs
  ├─ process.git                    → nota.git
  ├─ ui.notify | ui.panel | ui.menu → nota.ui
  ├─ network.http                   → nota.http = not_implemented(...)   ⚠️ 空壳，但会明说没实现
  └─ settings.own                   → nota.settings = not_implemented(...) ⚠️ 同上
```

### 三条贯穿这个层次的设计判断

1. **按能力装表，不装空壳。** 没申请 `document.read`，`nota.document` 就是 `nil`——
   不是"存在但调用时报错"。理由：前者让插件作者**在开发期**就发现问题，后者写完才炸；
   也让"权限"变成一道结构上的墙，而不是一句运行时的客气话。
   两个例外：`nota.http` / `nota.settings` 因为能力**已经声明了但功能还没做**，
   装的是"会明说没实现"的表——为的是让插件作者拿到一句"尚未实现（docs/07 第 12 项）"，
   而不是 `attempt to index a nil value`（后者会让人白查半天"是不是我能力没申请对"）。
   ⚠️ **顺带一个坑（曾经的缺陷，2026-09-22 已修，见 `docs/07` BUG-8）**：
   `nota.ui` 这张表**本身**也有判据——表**里面**三个方法各自判一次
   （`ui.rs` 第 22 / 43 / 81 行，分别对应 `ui.notify` / `ui.panel` / `ui.menu`），
   表**外面**还要再判一次"表装不装"。**两层是相乘的**：
   只申请 `ui.panel` 的插件表是有的、`register_panel` 有、但 `register_menu` 是 `nil`。
   而这个外层判据当初**漏了 `ui.menu`**，于是只申请 `ui.menu` 的插件拿到的
   `nota.ui` 是 **`nil`**，调 `register_menu` 直接 `attempt to index a nil value`
   ——`ui.menu` 这条能力**形同虚设**。两个内置插件都申请了 `ui.panel`，所以一直没暴露。

   **修法没有停在"补上漏的那一项"**，而是**让两层由同一个数组产生**：`lua/api/mod.rs` 里
   ```rust
   const UI能力: [Capability; 3] = [UiNotify, UiPanel, UiMenu];
   fn 装_ui吗(manifest: &Manifest) -> bool { UI能力.iter().any(|c| manifest.has(*c)) }
   ```
   再加一条用 `include_str!("ui.rs")` **数判据个数**的用例——谁往 `ui.rs` 加了第四个
   `ui.*` 判据而忘了往数组里加，用例就红。**这才是这个坑真正的收获：两层判据必须同源，
   否则"每层单看都对"而路是断的。**

   📌 **这一段踩过一次坑，记在这儿**：2026-09-22 核对时我只 `grep` 到 `api/mod.rs:83`
   那一行 `set(...)`，**没看上一行的 `if`**，就断定"无条件调用、文档在编"，
   把原本**正确**的说法改成了错的，还把错误结论转告给了另一个写文档的代理。
   教训：**判断"没有条件"之前必须看上下几行，`grep -n` 的单行输出会骗人。**

2. **一个插件坏掉不能拖垮启动。** 见前面"每一步失败会怎样"表里那两行。

3. **沙箱两道闸。** 第一道是**本仓自己列的**标准库白名单（`lua/mod.rs` 的
   `硬化的_lua()`）：只开 `coroutine`/`table`/`string`/`utf8`/`math`，再把
   `io`/`os`/`package`/`require`/`loadfile`/`dofile`/`debug` 逐个置 `nil`。
   第二道是 `lua/api/` 里的：所有对外能力**只**通过 `nota.*` 提供，
   且逐项按清单声明的 capability 决定装不装。
   换句话说——**脚本能做的事 = 清单申请到的事，没有旁路**。
   细节与"为什么是 Lua"见 `docs/12-plugin-runtime.md`。

   ⚠️⚠️ **这一段原先写的是"第一道是 mlua 给的：`Lua::new()` 只加载安全标准库子集，
   `io`/`os`/`debug`/`package`/`require` 全都不存在"——那是假的（BUG-10，已修）。**
   mlua 的 `ALL_SAFE = StdLib((1 << 30) - 1)` 把第 0–29 位全含在内，
   而 `IO` 是第 2 位、`OS` 是第 3 位、`PACKAGE` 是第 8 位——**都在里面**，
   只有第 31 位的 `DEBUG` 被排除。它的 "safe" 指的是**不能加载 C 模块**。
   实测：`os.execute("touch /tmp/x")` 真建出文件、`io.open("/etc/hostname")` 真读到内容。
   所以**围栏曾经是装饰**——只申请 `ui.notify` 的插件照样能 `os.execute("rm -rf ~")`。
   **教训：别把库的 `safe` 字面当安全承诺，那是它自己定义的口径，只能自己去读源码。**

### 发现与去重的两条口径

- **扫两类目录**：`paths::user_plugins_dir()`（用户自装）+ `paths::builtin_plugins_dirs()`。
  用户目录**先扫**，先到的进 `seen`，后到的同名插件被跳过——"用户覆盖内置"是循环顺序的
  自然结果，不用额外判。
- **按清单里的 `id` 去重，不按目录名。** 目录名是文件系统的事，用户可以随便改；
  `id` 是清单里声明的、插件之间互相引用的名字。用目录名去重会出现"改个文件夹名就多出
  一份插件"这种事。debug 构建下 `builtin_plugins_dirs` 额外返回仓库根的 `plugins/`，
  所以改完 Lua 存盘即生效，不用重编。

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

### `App.tsx` 持有的 state

| state | 类型 | 谁在用 |
|---|---|---|
| `docs` | `Document[]` | 标签栏、状态栏、`activeDoc` 的推算 |
| `activeId` | `DocId \| null` | 决定渲染 `EditorPane` 还是 `Home` |
| `settings` | `Settings \| null` | 主题、`content_width`、`confirm_unsaved` |
| `workspace` | `string \| null` | 侧栏文件树、`refreshTree` 的开关 |
| `tree` | `TreeNode[]` | 侧栏文件树 |
| `plugins` | `PluginInfo[]` | 侧栏「插件」页、`Home` 的插件状态列 |
| `toasts` | `Toast[]` | `Toasts` 组件 |

外加一个 `editorRef: Ref<EditorPaneHandle>`——它是 App 伸手进编辑器内部**唯一**的通道，
只有两个方法：`getMarkdown()`（存盘前强制同步用）和 `setMarkdown()`（插件改了文档时用）。

### 五个 effect 各自干什么

| effect | 依赖 | 干什么 |
|---|---|---|
| 启动 | `[refreshDocs, toast]` | `Promise.all` 拉 settings / workspace / plugins → `refreshDocs()` → 调一次 `api.frontendReady()`（失败只 `console.warn`）。用 `alive` 标志挡住卸载后的 setState |
| 事件订阅 | `[toast, activeId]` | 订 `nota:notify`（→ toast）与 `nota:document-changed`（→ 活动文档且 `origin === "plugin"` 时整篇覆盖编辑器）。返回时逐个退订 ⚠️ 见下面遗留项 |
| 主题 | `[settings]` | `settings` 有值就 `applyTheme(settings)` |
| 重取文件树 | `[refreshTree]` | 而 `refreshTree` 依赖 `workspace`，所以工作区一变就重取 |
| 快捷键 | `[activeId, saveDoc, newDoc, openViaDialog, closeDoc]` | `window` 上听 `keydown`：Ctrl+N 新建、Ctrl+O 打开、Ctrl+S 保存、Ctrl+Shift+S 另存为、Ctrl+W 关标签 |

### 三条主链路

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

插件改文档
  Lua nota.document.set_text / append_text
  → DocumentStore::sync（改的是后端镜像）
  → 发 nota:document-changed {origin:"plugin"}
  → App.tsx 的事件 effect → editorRef.setMarkdown(text)   ← 前端编辑器这才知道
```

第三条链是"前端是真相"这条口径的**代价**：插件改了后端镜像，前端不会自己知道，
所以每次写完都必须发事件。漏发的表现是"编辑器里看到的和存盘的不是一份东西"。

### 前端的遗留项（都是已知的，不是意外）

| 位置 | 现象 | 原因 |
|---|---|---|
| `applyTheme` 的返回值 | `App.tsx` 里 `if (settings) applyTheme(settings);` —— **退订函数被丢掉了**。`ui_mode = auto` 时每次 `settings` 变化都会再挂一个 `matchMedia` 监听，旧的从不移除 | effect 没有 `return` 清理函数。功能上不致命（`paint()` 是幂等的），但监听器会累积 |
| 事件订阅 effect 依赖 `activeId` | `activeId` 一变就整体退订再重订。重订期间到达的事件会被丢掉 | 为了在回调里读到最新的 `activeId` 而把 `activeId` 写进依赖。要消掉得用 ref 存 `activeId` |
| 切标签 | `TabBar.onSelect` 只 `setActiveId(id)`，**从不调 `api.doc.setActive`** | 于是后端的"活动文档"只被 `new`/`open`/`close` 改过。插件调 `nota.document.get_text` 读到的**不是用户在看的那个标签**，而是最后一次新建/打开的那份 ⚠️ |
| `applyTheme` 的 `detectStyle()` | `guessDesktop()` 恒返回空串，所以 `ui_style = auto` **永远落到 Adwaita** | WebKitGTK 不把桌面环境告诉 JS；等接上 XDG portal 的 `color-scheme` 再换 |
| 三条外观轴 | 只有 CSS 与设置项，**没有切换界面**（`docs/07` 第 11 项） | 设置项存在，但没有 UI 去改；`Sidebar`/`Home` 里没有设置入口 |
| `window.confirm` | `closeDoc` 里关掉有未保存改动的文档时用的是**原生 `confirm`** | 代码里注明了"本轮先用原生确认框"。⚠️ 注意它与 `Toasts.tsx` 的口径不一致——那边明确避开 `alert` 是因为阻塞 WebView 会打断输入法组合态，`confirm` 同样阻塞。自己画的对话框排在界面那一轮 |
| 打开对话框的后缀 | `openViaDialog` 的过滤器是 `md/markdown/mdown/mkd/txt`，**没有 `mdx`**；而后端 `is_markdown()` 认 `.mdx` | 能打开（可以把 mdx 文件拖进来或从文件树点），只是对话框里筛不出来。这两张表该对齐 |

---

## 相关文档

| 要查什么 | 去哪 |
|---|---|
| 每个文件、每个公开函数的签名与行为 | `docs/02-modules.md` |
| `AppState` / `Document` / `Settings` / `Manifest` 的字段与常量 | `docs/03-data-structures.md` |
| 哪个按钮现在能用、哪个是空壳 | `docs/04-ui-map.md`、`docs/07-feature-status.md` |
| 编辑器怎么装配、去抖与整篇替换语义 | `docs/05-editor-bridge.md` |
| 怎么加一个插件、能力表 | `docs/11-writing-a-plugin.md`、`docs/12-plugin-runtime.md`、`docs/13-lua-api.md` |
