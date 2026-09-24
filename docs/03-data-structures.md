# 03 — 数据结构、常量与两条真相口径

> 最后同步：2026-09-22

这份文件是下面这些东西的**唯一权威**：`AppState` 的锁序、文档模型（`Document` /
`DocId` / `DocumentStore`）、`Settings` 与三条外观轴、插件清单
（`Capability` / `PluginMeta` / `Manifest`）与 `NOTA_PLUGIN_API_VERSION`，
以及散落在两端的常量。

代码里多处注释直接指向本文件的某一节（`state.rs` → §锁序、
`document/mod.rs` → §真相在哪、`workspace.rs` → 后缀表），**改口径先改这里**。

---

## 1. 真相在哪

这两条是全仓最要紧的口径，写错任何一条都会得到"编辑器里看到的和存盘的不是一份东西"
这类最难查的 bug。`src/editor/create.ts` 的文件头与 `src/ui/EditorPane.tsx` 的去抖
那段都引用回本节。

### 1.1 前端是文本的唯一真相，后端是 300ms 去抖的镜像

```text
ProseMirror（WebView 里）＝ 真相
        │  改动后去抖 300ms
        ▼
Document::text（Rust 里）＝ 镜像，存盘写的是它
```

**为什么不像 Folio 那样把真相放后端**：Folio 的编辑区是一个 WebKit 视图 + C 宿主，
两边都要操作同一棵树，所以它挑宿主做真相、JS 只做渲染。Nota 反过来——撤销栈、
选区、IME 组合态**全在 ProseMirror 里**，把真相搬回 Rust 等于把这些状态复制一份
并保证同步，得不偿失。

**代价**：镜像可能短暂滞后（最多一个去抖周期）。**对策有两条**：

| # | 对策 | 落在哪 |
|---|---|---|
| ① | 前端改动后**去抖 300ms** 推一次，不是每击键一次 | `src/ui/EditorPane.tsx` 的 `SYNC_DEBOUNCE_MS` |
| ② | 任何"要读文档"的动作（存盘、插件读文档）**先强制同步一次** | `App.tsx` 的 `saveDoc()` 在 `api.doc.save` 之前调 `api.doc.sync` |

⚠️ **不要在前端直接改后端镜像之外的东西**：写文件、写设置都要走对应的命令，
否则镜像与实际落盘会分叉。

### 1.2 任何"后端改文本"的路径都必须发事件通知前端

编辑器不会自己知道后端把文本换了。所以**每一条后端改文本的路径，写完都要发
`nota:document-changed`**，前端收到才整篇替换编辑器内容。

目前唯一的实现路径是插件的 `nota.document.set_text` / `append_text`
（`src-tauri/src/lua/api/document.rs` 的 `emit_changed()`）：

```text
Lua 插件改文本
  → DocumentStore::sync()（改镜像、revision += 1、dirty = true）
  → 先 drop 掉 documents 锁
  → app.emit("nota:document-changed", { id, text, origin: "plugin" })
  → App.tsx 订阅处：origin === "plugin" 且 id === activeId 时才 setMarkdown(text)
  → ProseMirror replaceAll → 又一次 markdownUpdated → 去抖后再 sync 回后端
```

最后那一步**不会来回抖**：回推的是同一份文本，`DocumentStore::sync` 见内容没变
会直接返回旧 `revision`，不再发第二条事件（见 §4 的 `sync` 语义）。

⚠️ **事件里的 `id` 与当前活动文档不同时，前端直接丢弃**，不排队、不缓存（见 §11 第 2 条）。

⚠️ 前端**不去比 `revision`**，收到就覆盖。理由（代码注释原文的意思）：能走到这条
分支就说明改动不是本编辑器发起的，自己发起的那次不会绕一圈回来。

---

## 2. 锁序

`AppState` 是四个共享句柄，锁顺序**只能从左往右**：

```text
plugins  →  documents  →  settings
```

`workspace` 不在这个链条上（它单独一把，见 §3）。

### 2.1 为什么是这个顺序

不是随手排的，是照着**会交叉的调用**定的：

| 路径 | 持有什么 → 再取什么 | 今天真的会交叉吗 |
|---|---|---|
| `nota_plugin_call` | 持 `plugins` → 插件命令的 Lua 闭包里取 `documents`（`nota.document.*`）、可能取 `workspace` | ✅ **会**（这是唯一的真实交叉） |
| 窗口销毁时的 `unload_all()` | 持 `plugins` → 插件的 `on_unload` 可能取 `documents` / `workspace` | ✅ 会（同一个方向） |
| 存盘（`nota_doc_save`：持 `documents`）→ 读设置 | `documents` → `settings` | ❌ **今天没有**（`nota_doc_save` 全程只锁 `documents` 一把） |

也就是说：**反方向今天一次都没有**——没有任何路径先持 `documents` 再去锁 `plugins`。
这条不变量今天成立得很轻松，它真正的价值是**拦住将来的改动**：`state.rs` 里
"存盘流程要读设置"那句说的是这条规则**要保护的方向**，不是今天某一行的实际行为。

只要所有路径都朝同一个方向走就**不会成环**。反向取锁的后果是死锁，而且是最难查的
那种——**平时不触发，只在两个命令碰巧同时跑时才卡住**。

⚠️ **两条附带的约定**（逐命令的持有情况见 `docs/01` §共享状态与锁顺序）：

1. **插件命令执行期间 `plugins` 锁一直被持有**（`nota_plugin_call` 全程握着它）。
   所以插件命令路径里**不能**再触发一次需要 `plugins` 锁的动作——那是自锁。
   今天 Lua 侧拿不到 `invoke`，走不到这条；加新 Lua API 时要记住这个前提。
2. **不要跨 `.await` 持锁**（`AGENTS.md` 的硬规矩）。宿主今天所有命令都是同步
   `fn`（没有 `async fn`），所以这条暂时无从违反；它是给将来的异步命令留的。

### 2.2 为什么要 `Arc<Mutex<_>>`

`documents` / `settings` / `workspace` 是 `Arc<Mutex<_>>`，`plugins` 只是
`Mutex<_>`。差别在**生命周期**：

- 插件的 Lua 闭包要**长期持有**这几个句柄（比任何一次命令调用都长），所以得是 `Arc`；
- `AppState` 与 `HostContext` 拿的是**同一个 `Arc`**，不是两份拷贝——
  `lib.rs` 的 `setup()` 里先建 `Arc`，`HostContext` 克隆一份，再 `manage(AppState)`；
- `plugins` 在最外层，没有比它活得更久的人拿它，所以裸 `Mutex<_>` 就够。

⚠️ "不要跨 `.await` 持锁"（§2.1 第 2 条）的样板在 `lua/api/document.rs` 的写操作里：
**改完镜像先 `drop(store)`，再 `emit`**——`emit` 要序列化并投递给 WebView，
把它放在临界区里就是把锁的持有时间拉长到"另一个进程收不收得到"这件事上。

⚠️ 违反锁序不会被编译器或测试拦住，**只能靠人和这一节**。拿多把锁之前先想清楚
自己站在哪一层。

---

## 3. `AppState` 的四个句柄

定义在 `src-tauri/src/state.rs`：

| 字段 | 类型 | 管什么 |
|---|---|---|
| `documents` | `Arc<Mutex<DocumentStore>>` | 打开的全部文档与镜像文本 |
| `settings` | `Arc<Mutex<Settings>>` | 用户设置（内存里那一份） |
| `workspace` | `Arc<Mutex<Option<PathBuf>>>` | 当前工作区根目录。`None` = 没开文件夹（Typora 的"单文件模式"） |
| `plugins` | `Mutex<PluginHost>` | 插件宿主。锁在最外层 |

⚠️ **这个结构体没有构造函数**：`lib.rs` 在 `setup()` 里手写 `AppState { … }` 字面量
（2026-09-24 删掉了那个没人调用的 `AppState::new`——它当时是全仓唯一一处把开机时的
`strict_markdown` 传给文档仓的地方，而它没人调用 ⇒ 设置开机时到不了文档仓）。
`documents` 与 `workspace` 在那儿建成空的（`DocumentStore::new(settings.strict_markdown)` / `None`），
设置与插件宿主则必须先建好才能传进来（插件加载要用 `HostContext`）。
⚠️ 那个 `strict_markdown` 参数**不是可有可无**：标签页标题是文档仓自己算的，
漏了就是"设置里写着严格、名字按宽松算"——不报错，`docs/02` 的 `state.rs` 一节记了这件事。

⚠️ `workspace` **不只是 UI 状态**：它同时是 `nota.fs` 与 `nota.git` 的**围栏**——
插件能碰的文件范围、能跑 git 的目录都由它决定。所以设置工作区走的是**规范化后的
绝对路径**（`nota_workspace_open` 里 `canonicalize()`），不是用户点进来的那个串。

---

## 4. `DocId` / `Document` / `DocumentStore`

定义在 `src-tauri/src/document/mod.rs`。

### 4.1 `DocId`

```rust
pub struct DocId(pub u64);
```

进程内唯一、单调递增、**不重用**。序列化后就是一个 JSON 数字，前端类型是
`export type DocId = number;`（`src/bridge/ipc.ts`）。

### 4.2 `Document` 的字段与不变量

| 字段 | 类型 | 语义 |
|---|---|---|
| `id` | `DocId` | 见上 |
| `path` | `Option<PathBuf>` | 还没存过盘的新文档是 `None`（`is_untitled()` 的判据） |
| `title` | `String` | 派生而来，见 §4.4 |
| `text` | `String` | **镜像**（§1.1）。存盘写的就是它 |
| `dirty` | `bool` | **相对「上次认领的干净文本」**有无改动——**不是「发生过 sync」**。置 `true` 的只有 `sync`（内容真的变了时）；置 `false` 的是 `save` / `reload` / **`settle`**。不落盘、不持久化。⚠️ 判据是 `doc.text != doc.clean_text` 算出来的，不是打标记打出来的 |
| `clean_text` | `String` | **跟 `text` 比出 `dirty` 的那一份**"干净文本"。`open` / `reload` / `save` / `settle` 四处把它刷成当时的 `text`。⚠️ `#[serde(skip)]`：它是内存里的比对基准，不该出现在发给前端的 `Document` 快照里。加这个字段是为了 BUG-12——只靠 `dirty: bool` 一张标记，装载流程里编辑器那次"规范化"一到就洗不掉了 |
| `untitled_index` | `u64` | 这份未命名文档的**序号**，建的时候从 `untitled_count` 定死，之后一律用它。⚠️ `#[serde(skip)]`。加它是为了 BUG-9：原来四个调用点都传字面量 `0`，于是一叠未命名文档全叫「未命名 0」 |
| `revision` | `u64` | 版本号。**每次 `sync`（仅当内容真的变了）/ `save` / `reload` 递增**；新建与打开时是 `0` |

`revision` 的用途是给**插件与前端**判断"我手里这份是不是旧的"——
`nota.document.get_revision()` 读的就是它。

⚠️ 两条容易记错的语义：

- **`sync` 传进来的文本与镜像相同时，`revision` 不动、`dirty` 也不动**，
  直接返回当前值。这是 §1.2 那条回推链不来回抖的原因。
- **`save` 无论内容是否变过都 `revision += 1`**（存盘本身就是一次新的落点），
  同时 `dirty = false`、`title` 重新派生（另存为会改文件名 → 标题可能跟着变）。
- **`reload` 也 `revision += 1`**，并清 `dirty`。
- **`settle(id, text)` 与 `sync` 的差别只有一条：它同时清 `dirty`。**
  ⚠️ 它是**唯一一个"不当作编辑"的写入口**，用途只有装载流程的最后一步
  （见 §1.2 与 `commands/document.rs`）。⚠️ 实现里**有一处 `if` 不能改成早退**：
  编辑器那次规范化很可能**已经先走 `sync` 把文本推上来了**，走到 `settle` 时
  `text == doc.text` 已经成立、可脏标记还立着——早退就等于这一步白做。
  这条有回归用例钉着（`装载时的规范化不算用户改动`，第一版就是被它逮住的）。

### 4.3 `DocumentStore`

| 字段 | 类型 | 说明 |
|---|---|---|
| `docs` | `Vec<Document>` | 打开的全部文档 |
| `active` | `Option<DocId>` | 活动文档 |
| `next_id` | `u64` | `alloc_id()` 用它自增发号 |
| `untitled_count` | `u64` | 只用来生成"未命名 N" |
| `strict_markdown` | `bool` | **严格模式的镜像**（默认 `false` = 宽松）。建仓时由 `new(strict_markdown)` 定下，之后只有 `nota_settings_set` 改它。⚠️ 它影响的是**标题怎么猜**（`derive_title`），所以两处都得跟：建仓参数 + 改设置时的重算 |

方法表：

| 方法 | 行为 |
|---|---|
| `new(strict_markdown)` | 建空仓，**建仓时就把标题口径定下来**。⚠️ 参数忘不掉（编译错），这正是它存在的理由——2026-09-24 之前那句 `set_strict_markdown` 挂在一个没人调用的构造函数上，于是开机时设置到不了文档仓 |
| `set_strict_markdown(strict)` | 跟上开关，**并立刻重算所有已打开文档的标题**（值没变则早退）。⚠️ 只有命令层调它 |
| `create_untitled()` | 建一份空文档，把当时的 `untitled_count` **抄进 `untitled_index`**，`untitled_count += 1`，**设为活动** |
| `open(path)` | 已在集合里则**复用那一份**（不重复开标签）并设为活动；否则读盘、派生标题 |
| `reload(id)` | 从磁盘重读，`dirty = false`，`revision += 1`。没有路径时报 `NoActiveDocument` |
| `sync(id, text)` | 内容没变 → 原样返回；变了 → 换文本、`dirty = true`、`revision += 1`、重派生标题 |
| `settle(id, text)` | **装载收尾**：换文本（变了才 `revision += 1`）、刷 `clean_text`、`dirty = false`。⚠️ **不早退**，理由见上面那一段 |
| `save(id, path_override)` | `path_override` 就是「另存为」。没有路径又没给 override → 报"这份文档还没有路径，请用「另存为」"。落盘后清 `dirty`、重派生标题、`revision += 1` |
| `close(id)` | 从 `docs` 里移掉；**若关的是活动文档，活动切到 `docs` 里的最后一份**（没有就 `None`） |
| `get` / `get_mut` / `active` / `active_id` / `list` | 读 |
| `set_active(id)` | 文档不存在时报错 |
| `has_unsaved()` | 任意一份 `dirty` 就为真（`nota_doc_has_unsaved` 用它） |

⚠️ `close` 只是把记录移掉，**不做未保存询问**——那是前端的事（它才知道用户点了什么）。
`App.tsx::closeDoc` 里用 `settings.confirm_unsaved` + `window.confirm` 兜这一层。

### 4.4 `derive_title()` 的顺序

对齐 Typora 的窗口标题行为，**从上往下第一个命中的胜出**：

1. YAML front matter 里的 `title:`；
2. 第一个 ATX 标题（`# ` ~ `###### `）；
3. 文件名的 stem；
4. `"未命名 N"`。

两条细则（都有单元测试）：

- front matter 必须**在文件最开头**（`lines.next()` 是 `---`），到下一个 `---` 或 `...`
  结束，与 Typora / Jekyll 一致；里面没有 `title:` 就返回 `None`（**不**继续找）。
- 扫 ATX 标题时**跳过围栏代码块**（``` 或 ~~~）——那里的 `#` 多半是 shell 注释。
- `#标签` **不是**标题，`# 标签` 才是（`rest.starts_with(' ') || rest.is_empty()`）。

---

## 5. `Settings` 与三条外观轴

定义在 `src-tauri/src/settings.rs`，落盘在 `$XDG_CONFIG_HOME/nota/settings.toml`
（一般 `~/.config/nota/settings.toml`，路径由 `paths::settings_file()` 算）。

### 5.1 全部字段与默认值

```rust
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(default)]
pub struct Settings { … }
```

| 字段 | 类型 | 默认值 | 说明 |
|---|---|---|---|
| `ui_style` | `UiStyle` | `UiStyle::Auto` | **轴一**：界面风格（设计语言） |
| `ui_mode` | `UiMode` | `UiMode::Auto` | **轴二**：明暗 |
| `document_theme` | `String` | `""` | **轴三**：文档主题的 **id**（**就是 `.css` 的文件名去掉后缀**，如 `paper`）；**空串 = 无主题**。⚠️ 它是**键不是显示名**——内置六套的显示名是中文（`paper` ↔ 素纸），两者的对应关系在 `themes.rs` 的 `BUILTIN` 表里。⚠️ **只在 `~/.config/nota/themes/` 里扫**（见 §9.4），所以换机器、或者文件被删了，就可能"这个主题没了" |
| `view_mode` | `ViewMode` | `ViewMode::Wysiwyg` | ⚠️ **不是第四条外观轴**（见 §5.2 末段）：`Wysiwyg` / `Source` / `Split`，决定编辑区摆几个窗格、谁的话算数 |
| `ui_font_size` | `u32` | `15` | 界面字号（px）。**文档字号是文档主题的事，不在这里** |
| `content_width` | `u32` | `760` | 内容区宽度上限（px）。Typora 的"正文宽度" |
| `confirm_unsaved` | `bool` | `true` | 关闭有未保存改动的文档时是否询问 |
| `autosave_seconds` | `u32` | `0` | 自动保存间隔（秒）。**0 = 关闭自动保存**。⚠️ **目前是个死设置**：字段能存能读，**全仓没有任何消费者**（见 §7 第 4 条与 `docs/07` 第 20 项）。2026-09-24 起**界面上如实标了**——偏好设置那一行下面挂着一句「目前还没接上」；**接线之后把 UI 那处和本文档这两处标注一起删** |
| `strict_markdown` | `bool` | `false` | **严格模式**（`docs/10` §11.3 那一页）。`false` = 宽松，`#标题`（井号后没空格）**也算标题**——只是**显示上**算，正文树里它是普通段落，存盘存回原文（见 §5.5）。⚠️ 它不是外观轴，改它=**换挂哪些插件**，前端那边等于把编辑器重建 |
| `enable_physics` | `bool` | `false` | **数学公式里的 physics 宏包**（`docs/10` §12）。⚠️ 数学渲染走 KaTeX，而 **KaTeX 官方没有 physics**——所以它**不是"装载一个扩展"**，而是把 `src/editor/math-macros.ts` 里那套**我们自己写的宏定义**交给 KaTeX（`macros` 选项）。开着时 `\qty` / `\dv` / `\braket` / `\comm` 这些命令才有定义，并且会**重定义 `\div`、`\Re`、`\Im`**（physics 原版就那么干，所以默认关）。⚠️ 它不是外观轴，改它 = **换一份 KaTeX 选项**，前端那边等于把编辑器重建（已渲染的节点不会自己回头重画） |

`#[serde(default)]` 在**结构体上**，所以老配置文件缺哪个字段就用哪个字段的默认值；
`load_from` 只在**文件存在但解析不了**时报错（静默回默认会让人以为设置被吞了），
文件不存在**不算错误**——首次启动就是这种情况。

### 5.2 为什么是三条轴而不是一条

⚠️ 用户 2026-09-22 明确要求，别混成一条。三条**互相独立**：

⚠️ 用户 2026-09-23 又说了一句更狠的：「这是文档风格，不是界面风格，不应该影响到UI主题」。
所以下面这张表要分成**两半**看——**前两条是"界面轴"（同一类东西），第三条不是**：

| 轴 | 设置字段 | DOM 属性 | 管什么 |
|---|---|---|---|
| 界面风格 | `ui_style` | `data-ui-style` | **一整套设计语言**（Adwaita / GitHub / macOS / Plasma / Windows / Yaru，共 6 套）：换的不只是颜色，还包括控件形状、圆角、间距、动效、字体栈。⚠️ 它**不是**"主题"的同义词 |
| 明暗 | `ui_mode` | `data-ui-mode` | 亮/暗。`auto` 时跟随系统。**这条轴在任何风格下都成立** |
| 文档主题 | `document_theme` | **（没有）** | **只管正文那一块**。纯 CSS，**只扫我们自己的主题目录**，**不动应用外壳一分** |

⚠️⚠️ **第三条轴没有 DOM 属性，这一点是刻意的，别加回去。** 它是一份注进 `<head>` 的
`<style id="nota-doc-theme">`，选择器被机械地收到 `.editor-pane` 之下
（见 `styles/doc-theme.ts`）。2026-09-23 之前它挂在 `<html data-doc-theme>` 上，
主题里的 `:root` 变量会被**提升到全局**、由 `theme.css` 末尾那排
`var(--nota-bridge-X, default)` 桥给外壳——**那正是"换个文档主题、整个应用跟着变色"的来源**，
用户的原话是「现在深色浅色都有，很混乱」。桥和提升都拆了。

⚠️ 两条界面轴的 DOM 属性在 `<html>` 上，文档主题的作用域在 `.editor-pane` 上——
**两棵不同的树**，一个变量都不共用。这条线有回归测试兜底
（`themes.rs::内置主题不碰界面变量`）。

把"形状"和"颜色"合成一条的后果很具体：想做"macOS 风格 + 暗色"时发现颜色写死在
风格里了，于是只能再加一套 `macos-dark`——轴数就从 3 变成了排列组合。所以 CSS 的
组织方式是**二维相乘**（见 `docs/04-ui-map.md` §3）。

⚠️ **`view_mode` 不是第四条轴**（2026-09-23 加的）。它管的是"**怎么编辑**"
（编辑区摆一个窗格还是两个、哪一侧可写），而那三条管的是"**长什么样**"。
两者之间没有任何耦合：任何模式 × 任何外观都成立。⚠️ 别把它写进 `theme.css`
那种地方，也别把它算进下面这张"轴"表。

| 取值 | 编辑区 | 谁的话算数 |
|---|---|---|
| `Wysiwyg`（默认） | 所见即所得（Milkdown） | Milkdown |
| `Source` | Markdown 原文（CodeMirror） | CodeMirror |
| `Split` | 左原文（可编辑） + 右预览（**只读**） | CodeMirror |

（三条口径与"为什么分屏只朝一个方向"见 `docs/05` §3.1。）

`UiStyle` 的取值（**七个**）：`Auto`（跟随当前桌面环境，探不到就用 Adwaita）、
`Adwaita`、`Ghub`、`Macos`、`Plasma`、`Windows`、`Yaru`。
`UiMode` 的取值：`Auto`、`Light`、`Dark`。
`ViewMode` 的取值：`Wysiwyg`、`Source`、`Split`。

### 5.3 "存法即接口"：kebab-case 落盘

三个枚举都带 `#[serde(rename_all = "kebab-case")]`，所以文件里写的是：

```toml
ui_style = "macos"
ui_mode = "dark"
view_mode = "split"
```

而**不是** `"Macos"` / `"Dark"` / `"Split"`。这条不是审美问题：

- 这串字符串**就是接口**——用户手改 `settings.toml` 时要能猜到怎么写；
- 前端的类型也是同一批串：
  `export type UiStyle = "auto" | "adwaita" | "ghub" | "macos" | "plasma" | "windows" | "yaru";`
  `export type UiMode = "auto" | "light" | "dark";`
  `export type ViewMode = "wysiwyg" | "source" | "split";`
  （`src/bridge/ipc.ts`），改一处就要改另一处。

加一条新轴上的新值时，**三处缺一不可**：`settings.rs` 的枚举、`src/styles/theme.css`
（以及 `applyTheme.ts` 需要的解析分支）、`docs/04-ui-map.md` 的外观一节。
⚠️ `view_mode` 加值时是**另一组三处**：`settings.rs`、`src/bridge/ipc.ts`、
`src/ui/commands.ts` 的「视图」栏（外加 `docs/04`）。

⚠️ **默认值也要三处一致**：Rust 的 `impl Default`、前端 `App.tsx` 里的兜底
（`settings?.view_mode ?? "wysiwyg"`）、以及那条用例
（`编辑模式也走_kebab_而且默认是所见即所得`）。默认值错了的症状是"老用户升级后
打开文件发现进了别的模式"——而他的设置文件里根本没有这一项。

### 5.4 读写口径

- `nota_settings_get` 直接克隆内存里那一份。
- `nota_settings_set` 是**整份替换**并落盘：先改内存 → 落盘失败则**把内存改回去**
  再返回错误。否则会出现"界面上是新的、重开又变回去"这种最难解释的状态。
- 为什么是整份替换而不是逐项 patch：设置项还少，patch 语义（"没给的字段不动"还是
  "没给的字段恢复默认"）会变成一个新的、没人想要的理解负担。
- 启动时读失败**不回滚启动**：一份坏掉的 `settings.toml` 不该让人连界面都进不去，
  退回默认值 + 在控制台说明（`lib.rs::run`）。

⚠️ `nota_settings_set` **改了 `strict_markdown` 之后要顺手做两件事**（`commands/settings.rs`）：
调 `set_strict_markdown()` 把文档表里所有文档的**推导标题重算一遍**（标签页标题是后端
按当前口径从正文算的），并把 `settings` 锁**先放下**再动 `documents`——锁序是
`plugins → documents → settings`，反着拿会死锁。

### 5.5 ⚠️ 严格模式：关着的时候**一个字节都不改**

用户 2026-09-24 定的死规矩，原话「**注意应用中不应出现"同typora"这种。如果关闭，
存盘不要自动修复。**」两条都要读：

1. 应用里（用户看得见的字符串）**不许出现"对标 Typora"这类话**——那是给开发看的
   口径，写在 `docs/10` 里；
2. **宽松模式（默认）存盘不许改用户的字**。`#你好` 存下去还是 `#你好`：不许补成
   `# 你好`，也不许加上 `\#` 转义。

第 2 条的落地方式见 `docs/02` 的 `lax-heading.ts` 那一节：**文档树里它就是个段落**
（所以序列化必然原样吐回来），标题的样子来自**显示层的装饰**。⚠️ 这是一条
**结构性**的保证，不是"小心一点"——从这里到文件那条路上没有一步会改字。

**存盘字节是唯一判据**：改完要拿一份 `#标签` 的文件开窗，Ctrl+S，比对 md5
（两种模式都要比，见 `docs/06` §5）。⚠️ 只看"屏幕上显示对不对"证明不了这条——
第一版就是因为只看了显示，存盘时被序列化器加了个反斜杠，用户看到的是"我写的字被改了"。

**已知的一处残留改字**（登记在案，不打算修）：用户**手打**的 `\#标签`，
存盘会变成 `#标签`——反斜杠没了。原因是转义井号和裸井号在文档树里**是同一个东西**
（都是文本 `#标签`），要区分就只能记住源码（那要改 schema，是另一个量级的工程）。
⚠️ **差别只在字节上**：两者的解析结果、以及 Nota 里的显示**完全一样**。
它属于 `docs/05` §3.1「往返会改字」那一族，不是新的破口。

---

## 6. `Capability`：插件能申请什么

定义在 `src-tauri/src/plugin/manifest.rs`。清单里写的是**字符串**，解析成枚举；
**未知能力报错而不是忽略**——悄悄忽略会变成"插件作者以为申请到了、实际没有"的静默降级。

| 清单里写的串 | 枚举变体 | 意味着什么 |
|---|---|---|
| `document.read` | `DocumentRead` | 读当前文档：`nota.document.get_text / get_path / get_title / get_revision / is_dirty` |
| `document.write` | `DocumentWrite` | 改当前文档：`set_text` / `append_text`（**整篇替换语义**，写完发 `nota:document-changed`；精细选区见 `docs/07` 第 14 项） |
| `fs.read` | `FsRead` | 读**工作区内**的文件（界外一律拒） |
| `fs.write` | `FsWrite` | 写**工作区内**的文件 |
| `process.git` | `ProcessGit` | 起子进程跑 `git`。⚠️ **只放行 git 这一个命令**，不是通用 subprocess |
| `network.http` | `NetworkHttp` | 发 HTTP 请求。⚠️ **宿主侧尚未实现**：装的是"尚未实现"表，调用返回"网络请求尚未实现（见 docs/07 第 12 项）" |
| `ui.notify` | `UiNotify` | `nota.ui.notify` → 发 `nota:notify` 事件（⚠️ `nota.ui` 三条里**唯一推事件**的） |
| `ui.panel` | `UiPanel` | `nota.ui.register_panel` → **写 registry，不推事件**（BUG-13）。前端调 `nota_plugin_panels` 拉 |
| `ui.menu` | `UiMenu` | `nota.ui.register_menu` → 同上，落在 `nota_menus`，由 `nota_plugin_menus` 拉 |
| `settings.own` | `SettingsOwn` | 读写插件自己的设置段。⚠️ **宿主侧尚未实现**：同样是一张"尚未实现"表（docs/07 第 13 项） |

放行的形状是**"按能力装表，不装空壳"**（`lua/api/mod.rs` 的铁规矩）：

- 没申请 `document.read`/`document.write` → `nota.document` 整个是 `nil`；
- 只申请了读 → `nota.document` 上**没有** `set_text` 这一格，写不出来也绕不过去；
- 没申请 `process.git` → `nota.git` 是 `nil`。

**为什么不装"调用时才报没权限"的表**：那既让插件作者在开发期发现不了问题（写完才炸），
也让"权限"变成一句运行时的客气话，而不是一道结构上的墙。

永远可用、不需要任何能力的只有这几项（它们不碰文档也不碰磁盘，是插件跟自己、
跟宿主说话用的）：身份三项 `version` / `api_version` / `plugin_id`，以及四张表
`log` / `command` / `event` / `diff`（最后那张 2026-09-24 加的，是**纯函数**：
一段文本进、一段文本出，见 `docs/13` §11）。

⚠️ **能力申请只写真的用到的**。申请了不用的能力是在扩大攻击面而不换任何功能——
`plugins/git/plugin.toml` 连 `fs.write` 都没申请（它让 git 自己去改工作区），
`plugins/ai/plugin.toml` 的 `network.http` / `settings.own` 两条 2026-09-24 起都**已经实现**了，
申请它们是有用的（这条早先的记录说的"申请了但宿主还没实现"已经不成立）。

---

## 7. `PluginMeta` / `Manifest` 与校验规则

### 7.1 `PluginMeta`（清单的 `[plugin]` 段）

| 字段 | 类型 | 必填 | 默认 | 校验 |
|---|---|---|---|---|
| `id` | `String` | ✅ | — | 非空；**只能用小写字母、数字、`.`、`-`、`_`** |
| `name` | `String` | ✅ | — | 给人看的名字，不校验 |
| `version` | `String` | | `"0.0.0"` | 插件自己的版本，**不代表 ABI** |
| `api` | `u32` | ✅ | — | **精确匹配** `NOTA_PLUGIN_API_VERSION` |
| `entry` | `String` | | `"main.lua"` | 不许含 `..`，不许是绝对路径 |
| `description` | `String` | | `""` | |
| `authors` | `Vec<String>` | | `[]` | |
| `license` | `String` | | `""` | |
| `capabilities` | `Vec<String>` | | `[]` | 逐个过 `Capability::parse`；**空 = 纯声明式插件**（只贡献菜单/面板，不碰文档与磁盘） |

必填项缺失 = TOML 解析失败 → `NotaError::Manifest`。

### 7.2 `Manifest`：解析好、校验过的清单

| 字段 | 类型 | 说明 |
|---|---|---|
| `meta` | `PluginMeta` | 原样保留（前端 `PluginInfo.capabilities` 用的就是 `meta.capabilities` 这批**原始字符串**） |
| `dir` | `PathBuf` | 插件根目录（`plugin.toml` 所在处） |
| `capabilities` | `Vec<Capability>` | 解析并**去重**后的能力表 |

`entry_path()` = `dir.join(meta.entry)`；`has(cap)` 是唯一的查询口。

### 7.3 三条校验规则与它们挡的东西

| 规则 | 挡住的攻击/事故 |
|---|---|
| **id 字符集**：`[a-z0-9.\-_]`，非空 | 通道名与依赖引用要能拼得出来；大写/空格/中文在事件名里非法（见 §7.5） |
| **`api` 精确匹配** | 老插件在新宿主上静默拿到别的东西。见 §8 |
| **`entry` 不许逃出插件目录**：含 `..` 或绝对路径即拒 | 清单是**插件自带**的，`entry = "../../../etc/passwd"` 必须在门口挡住 |

⚠️ 这三条都在 `Manifest::from_meta()` 里、**加载期**执行；插件跑起来之后不再复核。

### 7.4 `find_manifests()`：认两种形状

- `<dir>/plugin.toml` —— 找到就**只认它**，不再往下扫；
- 否则扫 `<dir>/*/plugin.toml`（每个子目录一层），结果排序。

第二种是为了开发时少写一层目录。

### 7.5 `channel_id()`：id → 事件通道名

```rust
pub fn channel_id(id: &str) -> String
```

口径：**不在 `[A-Za-z0-9_-]` 里的字符一律换成 `-`**。

**为什么需要它**：Tauri 的**事件名只允许字母数字与 `-` `/` `:` `_`**，而清单里的 id
允许点（`nota.git` 这种反域名风格是主流写法）。漏了这一步的表现是：插件加载"成功"，
但**第一次 `emit` 才抛** `only alphanumeric, '-', '/', ':', '_' permitted for event
names`——静态看代码完全看不出来（`docs/07` BUG-3）。

事件的完整形状是 `plugin:<channel_id>:<名字>`：`plugins/git/main.lua` 里的
`nota.event.emit("git:status", …)` 从 `nota.git` 发出去，实际通道是
`plugin:nota-git:git:status`（名字里自带冒号是合法的——Tauri 允许 `:`）。

⚠️ **归一化有代价**：`.` 与 `-` 在通道名里是同一个字符，所以 `nota.git` 与 `nota-git`
这两个**都合法**的 id 会占同一个通道。撞了事件就分不清是谁发的，所以
`PluginHost::discover()` 直接**把后到的那个判为加载失败**（`LuaPlugin::rejected`），
把话说在当面，而不是让它们悄悄混在一起。

⚠️ **`_` 不在被替换的字符里**（`channel_id("a_b-c") == "a_b-c"`，`manifest.rs` 有用例钉着）。
`plugin/mod.rs` 的撞名注释与 `docs/07` 的 BUG-3 那一格都写成"`.`/`_`/其它 → `-`"，
**多算了 `_`**；以代码为准。

---

## 8. `NOTA_PLUGIN_API_VERSION`

```rust
pub const NOTA_PLUGIN_API_VERSION: u32 = 1;
```

**当前是 1**。它是清单里 `api` 字段要精确匹配的那个数。

### 什么时候该动号

| 改动 | 动不动号 | 为什么 |
|---|---|---|
| 给 `nota.*` 表**增加**成员 | **不动** | 老插件照样跑（它不会去调没见过的东西） |
| **改名**某个 `nota.*` 成员，或**改变它的语义** | **动** | 老插件会静默拿到别的东西 |
| 增删 `capabilities` 里的取值，并让它影响放行 | **动** | 放行面变了 |

⚠️ 这里**与 `AGENTS.md` §0.5 那条"提交 GitHub 之前不必兼容老接口"不冲突**：
`api` 之所以是精确匹配而不是 `>=`，是因为宿主与内置插件**永远同批构建**，
`>=` 只会让"插件作者以为存在一个他没见过的新版本"这种事发生。号一变，
内置插件同批改号，**没有迁移动作**。

---

## 9. 常量表

### 9.1 前端常量

| 常量 | 值 | 在哪 | 说明 |
|---|---|---|---|
| `SYNC_DEBOUNCE_MS` | `300` | `src/ui/EditorPane.tsx` | 前端→后端推文本的去抖间隔 |
| toast 存活时间（非 error） | `3200` ms | `src/App.tsx::toast` | 自动消失 |
| toast 存活时间（error） | `8000` ms | 同上 | 错误留久一点——用户多半要读完再决定怎么办 |
| 文件树请求深度 | `1` | `App.tsx::refreshTree` / `openFolder` | `api.workspace.tree(undefined, 1)`：**本轮只列一层** |
| `save` 对话框过滤器 | `md`, `markdown` | `App.tsx::saveDoc` | |
| `open` 对话框过滤器 | `md`, `markdown`, `mdown`, `mkd`, `txt` | `App.tsx::openViaDialog` | ⚠️ **没有 `mdx`**，见下 |

### 9.2 宿主事件名表

`src/bridge/ipc.ts` 的 `events` 是**唯一**的名字来源，别处不许硬写字符串：

| 键 | 字符串 | 谁发 | 前端监听了吗 |
|---|---|---|---|
| `events.notify` | `nota:notify` | `nota.ui.notify`（`lua/api/ui.rs`） | ✅ `App.tsx` → toast |
| `events.documentChanged` | `nota:document-changed` | `nota.document.set_text` / `append_text` | ✅ `App.tsx` → `setMarkdown` |

⚠️ **表里只该有「发生类」事件**（2026-09-22）。曾经还有
`events.pluginPanel` / `events.pluginMenu` 两条，随 BUG-13 一并删掉了——
面板与菜单是**声明（状态）**，走 `api.plugin.panels()` / `menus()` **拉**。
判据与理由见 `docs/05` §5.3。

插件自定事件的通道是 `plugin:<channel_id>:<名字>`（§7.5），不入这张表；
⚠️ 那条通道**对「发生类」数据是正解**，只是前端还没有订阅端（`docs/07` 第 17 项）。

### 9.3 认领的 Markdown 后缀（`is_markdown()`）

`src-tauri/src/commands/workspace.rs`：

| 后缀 | 大小写 |
|---|---|
| `.md` | 不敏感（`name.to_lowercase()` 后比对） |
| `.markdown` | 同上 |
| `.mdown` | 同上 |
| `.mkd` | 同上 |
| `.mdx` | 同上 |
| `.txt` | 同上 |

⚠️ **前端对话框的过滤器与这张表不一致**：`open` 少一个 `mdx`，`save` 只给了
`md`/`markdown`。过滤项只是对话框的默认筛选，用户仍可手打别的后缀，所以不是硬伤，
但"文件树里看得到、对话框里选不到"会让人困惑。

⚠️ 文件树**只列 Markdown**（这是对标 Typora 的口径）。另外三类**整类跳过**：
点开头的名字（`.git` / `.obsidian` 这类元数据）、`node_modules`、以及**符号链接本身**
（跟了就可能绕出工作区，也可能成环把内存吃光）。排序是目录在前、文件在后，
各自按名字不区分大小写比较。

### 9.4 目录与文件落点

| 路径 | 内容 | 算法 |
|---|---|---|
| `$XDG_CONFIG_HOME/nota/settings.toml` | 用户设置 | `paths::settings_file()` |
| `$XDG_DATA_HOME/nota/plugins/` | 用户自装插件（**覆盖内置同名**） | `paths::user_plugins_dir()` |
| 资源目录的 `plugins/`，debug 构建额外加仓库根的 `plugins/` | 内置插件 | `paths::builtin_plugins_dirs()` |
| `$XDG_CONFIG_HOME/nota/themes/<id>.css` | **用户文档主题**（点「打开主题文件夹…」时才 `create_dir_all`）。⚠️ **同名覆盖内置**，想改哪套就复制出去改，升级不会冲掉 | `paths::user_themes_dir()` |
| `$XDG_CONFIG_HOME/nota/plugin-settings/<安全文件名(id)>.toml` | **插件自己的设置**（`nota.settings`）。一个插件一个文件，**明文**、文件 `0600`、目录 `0700`。⚠️ 文件名是**归一小过的**：插件 id 来自插件清单（也就是插件自带的一份文件），所以这里是一道**安全边界**——少了它 `nota.settings.set` 就是任意路径写入，见 `paths::安全文件名` 与 `docs/13` §10 | `paths::plugin_settings_file()` |

⚠️ **`安全文件名` 只钉三条结果**：不含路径分隔符、不是空名、不是纯点的名字
（`..` 指向上级目录）。⚠️ 它**不保证"里面没有 `..`"**——`nota/../../etc/passwd`
会被归一成 `nota_.._.._etc_passwd`，那两个点这时只是普通字符了。
判据的完整理由写在 `paths.rs` 那两条用例上（`docs/06` §6.1），
**改这个函数之前先读那两条**，别看着"还有 `..`"就以为漏了。

⚠️ **那条 `0600` 是"创建时就带上"的**（`OpenOptions::mode`），**不是"写完再 chmod"**——
后者中间有一个窗口，此刻任何进程都能读到刚写下去的明文密钥。目录的 `0700`
倒是"事后收"（`set_permissions`），而且**收不上就算了**（不算存盘失败）：
目录权限是加固，不是正确性。见 `settings.rs::写` / `收紧目录权限`。

⚠️ **主题目录只有这一个。** 2026-09-23 之前还有 `~/.config/typora/themes/` 与
`~/.var/app/io.typora.Typora/config/Typora/themes/`（Typora 自己装的主题，我们只读），
连同 `paths::theme_dirs()` 一起**删了**——用户说「请不要内置typora主题。会侵权。」
「typora主题先不用兼容。」，那版整个作废。

⚠️ **目录里一个文件都没有也算正常**（内置六套是 `include_str!` 编进二进制的，
菜单不是空的），`discover()` 返回的还是那六条，不是空表也不是报错。
⚠️ 只看 `.css` 后缀，别的后缀一律不看；文件名（也就是 id）的形状由
`themes.rs::check_id` 把关——**只放行 ASCII 字母数字与 `-` `_`**，因为路径是拿它拼的。

应用名常量：`pub const APP_DIR: &str = "nota";`

### 9.5 其他跨边界常量

| 项 | 值 | 在哪 |
|---|---|---|
| 应用 ID | `io.github.nota.Nota` | `src-tauri/tauri.conf.json` |
| 版本 | `0.1.0` | **三处**：`src-tauri/Cargo.toml`、`package.json`、`src-tauri/tauri.conf.json`（改版本号别漏第三处） |
| 窗口初始尺寸 | `1100 × 760`，最小 `560 × 400` | `tauri.conf.json` |
| CSP | 只写在 `tauri.conf.json` 的 `app.security.csp` | ⚠️ **不要**再往 `index.html` 加 CSP meta，两条策略会同时生效并互相冲突 |
| 正文宽度 CSS 变量 | `--content-width`（默认 `760px`） | `EditorPane` 内联 style → `app.css` 的 `.editor-mount .milkdown` |

---

## 10. 跨语言形状对应（改一边必须改另一边）

`src/bridge/ipc.ts` 顶部的类型与 Rust 侧结构体是**手抄的对应关系**，
`invoke` 本身是 `any`。⚠️ 两边不一致时 `invoke` **不会报错**，只会给你一个少了字段的
对象，然后在某个 `.map` 上炸掉。

| Rust | TypeScript | 备注 |
|---|---|---|
| `document::DocId` | `export type DocId = number;` | 新类型序列化成裸数字 |
| `document::Document` | `export interface Document` | `path: Option<PathBuf>` → `path: string \| null` |
| `workspace::TreeNode` | `export interface TreeNode` | `path` 是**相对工作区根、`/` 分隔**；`children: Option<Vec<_>>` → `TreeNode[] \| null` |
| `settings::Settings` | `export interface Settings` | 枚举字段 → 字符串联合类型（§5.3） |
| `settings::UiStyle` / `UiMode` / `ViewMode` | `export type UiStyle` / `UiMode` / `ViewMode` | kebab-case 串。⚠️ `ViewMode` **不是外观轴**，见 §5.2 |
| `plugin::PluginInfo` | `export interface PluginInfo` | `state` 是 `"loaded" \| "failed" \| "disabled"` 字符串 |
| `plugin::PluginPanel` | `export interface PluginPanel` | 插件声明的面板（`nota_plugin_panels` 的返回）。`icon` 是 `Option<String>` → `string \| null`，`location` 是**普通字符串**不是联合类型——见下 |
| `plugin::PluginMenuItem` | `export interface PluginMenuItem` | 插件声明的菜单项（`nota_plugin_menus` 的返回）。`accelerator` 同上 |
| `error::NotaError` | `string` | 自定义 `Serialize`：**直接序列化成 Display 的中文那句话**，前端 `catch (e) => toast(String(e))` 就能用 |

前端还有两个 payload 类型（`NotifyPayload` / `DocumentChangedPayload`）与上面这些
**不是**一一对应——它们对应的是事件里 `serde_json::json!` 现拼的对象（`PluginInfo`
那个 `state` 字段也是同理：Rust 侧是 `String`，`ipc.ts` 收了窄成三个字面量）。
**改事件字段要同时在两边改**，而这类不一致**没有任何一层会报错**。

⚠️ 曾经还有 `PluginPanelPayload` / `PluginMenuPayload` 两个，随 BUG-13 删掉了。
**声明类的类型在 Rust 侧有对应结构体**（`plugin::PluginPanel` / `PluginMenuItem`，
`Serialize` 派生），两边一致由 serde 保证——这正是"改成拉"顺带修掉的一处隐患。

---

## 11. 已知缺陷与容易踩的坑

下面的编号只用于区分本表内的条目；**逐项状态与排期一律以 `docs/07-feature-status.md`
为准**（代码注释里出现的"docs/07 第 N 项 / BUG-N"用的是那份文档的编号，这里不重编）。

⚠️ **下面 6 条里有 5 条已经修掉了**（保留行、改写结论——编号在本表内有效，
但**跨文档引用一律用 `docs/07` 的 BUG-N / 第 N 项**）。⚠️ 这个数**要跟着条目一起改**：
早先它写的是 4，2026-09-23 第 5 条结清之后就变成 5 了——**数会骗人，逐行看**。

| # | 现象 | 原因 | 影响 |
|---|---|---|---|
| 1 | ~~活动文档的后端副本可能与前端不一致~~ **✅ 已修（BUG-6）** | 原先是 `api.doc.setActive` **从未被调用**。现在 `App.tsx` 有一段盯 `activeId` 的 effect 去喊它，`open` / `new` / `close` 几条路一起兜住 | 当时的影响：插件读的是**后端 active**，用户点了别的标签后插件可能读错文档。现在不会再分叉了 |
| 2 | ~~插件改了**非活动**文档时，改动会丢~~ **✅ 已修（backlog 第 33 项）** | 原先是 `nota:document-changed` 的处理器见 `p.id !== activeId` **直接丢弃**。现在非活动那份走 `refreshDocs()` 把 state 拉齐 | 当时的影响：下一次去抖 sync 会把旧文本推回后端、覆盖插件的改动 |
| 3 | ⬜ **`parseMarkdown()` 没有调用点** | `create.ts` 导出了它，但全仓没有模块用它（`grep` 过） | 目前所有进编辑器的文本都走裸 `replaceAll`，"语法坏掉的串"只能靠肉眼发现（见 `docs/05` §整篇替换） |
| 4 | ⬜ **`autosave_seconds` 是死设置** | 字段能存能读，**没有任何代码读它**（`grep autosave`：只有 `settings.rs` 的字段、`ipc.ts` 的类型、`panes.tsx` 的下拉与文案，**零消费者**） | 用户改了它不会有任何效果。接上它排在 `docs/07` 第 20 项。⚠️ **界面从 2026-09-24 起不再假装它能用**：偏好设置那一行下面挂了一句「目前还没接上」（`panes.tsx`）——**那条标注与该行表里那两条，接线时要一起删** |
| 5 | ~~三条外观轴都只有设置项与 CSS~~ **✅ 已结清（2026-09-23）** | 三条轴现在都有入口：`document_theme` 走菜单栏「主题」，`ui_style` / `ui_mode` 走偏好设置 → 外观（`docs/07` 第 10/11 项已做）。`api.settings.set` 的调用者是 `updateSettings` | 当时的影响：明暗与界面风格只能手改 `settings.toml` 再重启 |
| 6 | ~~`applyTheme()` 返回的退订函数被丢掉~~ **✅ 已修（BUG-7）** | 现在写的是 `if (settings) return applyTheme(settings);`——**退订函数交出去了** | 当时的影响：`ui_mode = "auto"` 时每次 `settings` 变化都会**再挂一个** `prefers-color-scheme` 监听器，旧监听器闭包里是旧设置。⚠️ 这条已经**不只是理论**了：主题切换会改 `settings`，所以那种情形现在已经会真发生 |
