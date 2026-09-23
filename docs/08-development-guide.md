# 08 · 开发指南：怎么加一样东西

> 最后同步：2026-09-22
>
> 本文不是"代码长什么样"（那是 `docs/02-modules.md`），而是**"我要加一样东西，
> 该动哪几个文件"**。每一条都是**清单式**的：照着一行一行走完，就完了。
>
> 结构：先讲两条通则（§1），再按"加什么"分五节。**加东西之前先读 `docs/07`**——
> 你要加的那样东西可能已经在 backlog 里排着号了，还可能带着已经想清楚的前提。

---

## 1. 两条通则（先读这节，它们管所有改动）

### 1.1 单文件行数上限：1000 行

**任何 `.rs` / `.ts` / `.tsx` / `.lua` 文件不得超过 1000 行。** 超了就**就地拆分**——
不是"以后有空再拆"，也不是"加个例外"。口径与 `AGENTS.md` §0.6 一致。

#### 检查范围

| | 范围 |
|---|---|
| **规则本身覆盖的后缀** | `.rs` / `.ts` / `.tsx` / `.lua`（`AGENTS.md` §0.6） |
| **规则要看的目录** | `src-tauri/src/**`（后端）、`src/**`（前端）、`plugins/**`（插件） |
| **脚本另外扫到的** | `tools/**`，而且后缀多了 **`.css` / `.sh`**（`tools/doc-sync-check.sh:117-119`） |

⚠️ 两边**有差异是刻意的**：脚本多扫 `.css` 与 `.sh`，是"顺手拦一道"；
而 `.css` 这一类**没有逻辑可拆**，真到了 1000 行是**按职责分文件**，
不是切一半（`docs/09` §4 对 `src/styles/app.css` 专门写了口径）。

#### 什么时候动手

| 行数 | 怎么办 |
|---|---|
| < 900 | 不用管 |
| **≥ 900** | **该想下一步怎么拆了**——不要等到 1000 才想（脚本这时会 WARN） |
| ≥ 1000 | 脚本 FAIL，**必须就地拆** |

#### 超了怎么拆

**沿职责拆，不要沿行数对半砍。** 对半砍的结果是两个各自 500 行、
但谁也说不出自己管什么的文件。判据：**拆出来的新文件能不能用一句话说清它负责什么**
（就像 `AGENTS.md` §2 那张"代码地图"里每一行那样）。说不清就是拆错了。

已经拆过的地方可以当范例：

| 拆法 | 例子 |
|---|---|
| **按"命令域"拆** | `commands/` 下 `document.rs` / `workspace.rs` / `settings.rs` / `plugin.rs`——每个文件对应一类命令 |
| **按"能力"拆** | `lua/api/` 下 `document.rs` / `fs.rs` / `git.rs` / `ui.rs`——每个文件就是 `nota.*` 的一张子表 |
| **把纯逻辑从依赖 Tauri 的壳里搬出来** | `document/mod.rs` 里的 `derive_title()`、`fs.rs` 里的 `resolve_in()`——搬出来才**测得了**，见 §1.2 |

⚠️ 拆分时**别把 `NotaError` 的语义也拆散**——错误走统一类型（`error.rs`），
拆出去的文件照样 `use crate::error::Result`，不要各自造错误类型。

#### 当前值（不用你操心，但改完顺手看一眼）

**没有超限文件。** 当前最大值：`src/styles/app.css` 786 行、
`src/App.tsx` 396 行、后端最大 `src-tauri/src/document/mod.rs` 390 行。
（与 `docs/09` §4 记的是同一组数——那两处一起改。）

### 1.2 改完必须同批改文档（这是完成定义的一部分）

**不是建议。** 改完代码没改文档 = **没做完**。哪几份必须动，看
`docs/09-doc-sync-policy.md` §2 那张映射表；提交前跑：

```sh
bash tools/doc-sync-check.sh
```

它查五件事（行数上限、文档新鲜度、引用存在性、backlog 编号存在性、源文件是否登记）。
⚠️ 它是**启发式**的，抓不到语义写错——见 `docs/09` §5。

另外两条与"加东西"直接相关的纪律：

1. **公开函数签名以 `docs/02-modules.md` 为准**；发现文档与代码不一致，
   **以代码为准并立即修正文档**（`AGENTS.md` §0.4）。
2. **别把安全边界写在 `HostContext` 里面。** 它要一个真的 `AppHandle`，构造不出来，
   写进去的部分**永远测不了**。要写边界就写成纯函数再单测——
   `fs.rs` 的 `resolve_in()`、`git.rs` 的 `挑工作目录()` 都是这么做的（`AGENTS.md` §4）。

---

## 2. 新增一个后端命令

**三步，一步都不能少。** 下面用已有的 `nota_doc_has_unsaved` 当完整样例走一遍
（它三步都在，是最短的活样板）。

### 第 1 步 · Rust 侧：写命令函数 + 注册

**① 在对应域的 `src-tauri/src/commands/<域>.rs` 里加一个函数。** 需要新开域文件时，
先在 `commands/mod.rs` 里加一行 `pub mod <域>;`（那个文件**只有** `pub mod` 声明，
`docs/09` §2.1 也是这么说的）。

```rust
// src-tauri/src/commands/document.rs:88 —— 完整样例
/// 有没有未保存的改动。退出前前端拿它决定要不要弹框。
#[tauri::command]
pub fn nota_doc_has_unsaved(state: State<'_, AppState>) -> Result<bool> {
    let docs = state.documents.lock().unwrap();
    ...
}
```

⚠️ **命令层的职责只有三件**：取锁、调下层、把错误转成人话
（`commands/mod.rs:3-5`）。**业务逻辑不许写在这里**——命令函数应当短到一眼看完。

三条硬约束：

| 约束 | 为什么 |
|---|---|
| **命名一律 `nota_` 前缀** | `commands/mod.rs:7`：让前端代码里一眼分得清哪些是跨进程调用、哪些是本地函数 |
| **错误返回 `Result<T, NotaError>`** | `NotaError` 自定义了 `Serialize`，转成 String 过 IPC（`error.rs:65-69`）。前端只要 `catch (e) => toast(String(e))` |
| **锁顺序 `plugins → documents → settings`，不许反向** | `state.rs:3-14`。拿多把锁之前先想清楚自己站在哪一层。**不要跨 `.await` 持锁** |

**② 在 `src-tauri/src/lib.rs` 的 `generate_handler![…]` 里加一行**
（`lib.rs:72-94`，那个宏的参数表就是全部命令的注册表）：

```rust
commands::document::nota_doc_has_unsaved,   // lib.rs:82
```

### 第 2 步 · 桥接侧：`src/bridge/ipc.ts` 加一个方法

**`ipc.ts` 是前端唯一允许直接 `invoke` 的地方**（`AGENTS.md` §4）。
在 `api` 对象的对应分组里加一行（`ipc.ts:66-114`）：

```ts
hasUnsaved: () => invoke<boolean>("nota_doc_has_unsaved"),   // ipc.ts:79
```

⚠️ **返回值的类型标出来。** `invoke` 本身是 `any`，不标等于把类型安全丢在边界上
（`ipc.ts:5-7`）。命令返回自定义结构体时，**同批**在 `ipc.ts` 顶部加 `interface`
——改了 Rust 侧字段却忘了这里，`invoke` **不会报错**，
只会给你一个少了字段的对象，然后在某个 `.map` 上炸掉（`ipc.ts:16-17`）。

### 第 3 步 · 调用侧：组件里用 `api.*`

```ts
const dirty = await api.doc.hasUnsaved();
```

**不要在组件里直接 `invoke("nota_doc_has_unsaved")`**——命令名是字符串，
散在组件里改一次要全仓搜。

### 收尾：同批改文档

按 `docs/09` §2.1 的映射：`commands/*.rs` → **`docs/02`**（接口参考）+
**`docs/04`**（界面入口与当前状态）。新命令**接上了界面**的话，
`docs/07` 与 `docs/10` 也要动（`docs/09` §2.4）。

---

## 3. 新增一个前端事件

**事件是两头的**：Rust 侧 `emit`、前端 `listen`。两边**都要改**，否则事件发出去
没人收，而且 ⚠️ **Tauri 对没有监听者的频道是静默成功的**——日志里一点痕迹都没有。

### 第 1 步 · `emit` 侧（Rust）

```rust
use tauri::Emitter;
app.emit("nota:notify", serde_json::json!({
    "plugin": plugin_id,
    "message": msg,
    "level": normalise_level(level.as_deref()),
}))?;                                   // src-tauri/src/lua/api/ui.rs:28-37
```

两条规矩：

| 规矩 | 依据 |
|---|---|
| **宿主事件用 `nota:` 前缀，插件事件用 `plugin:` 前缀** | 一眼看得出是谁发的，也不会撞。`plugin:` 那一侧在 `lua/api/mod.rs:156-158`；`nota:` 那一侧是宿主自己发的，只剩两处：`lua/api/ui.rs:42`（`nota:notify`）与 `lua/api/document.rs:127`（`nota:document-changed`）。⚠️ 曾经还有 `nota:plugin-panel` / `nota:plugin-menu`，随 BUG-13 删掉了——**声明类不进事件** |
| ⚠️ **事件名只允许字母数字与 `-` `/` `:` `_`，点号不合法** | Tauri 的硬限制。插件 id 允许点（`nota.git`），所以**必须过 `manifest::channel_id()`** 归一化——漏了的表现是"插件加载成功、第一次 `emit` 才抛 `only alphanumeric, '-', '/', ':', '_' permitted`"（`AGENTS.md` §4b、`docs/07` BUG-3） |

### 第 2 步 · `listen` 侧（前端）

**① 在 `src/bridge/ipc.ts` 的 `events` 名字表里加名字**（`ipc.ts:199-202`）：

```ts
export const events = {
  notify: "nota:notify",
  documentChanged: "nota:document-changed",
} as const;
```

⚠️ **动手之前先问一句：这件事是「发生」还是「状态」？**
这张表里**只该有「发生类」事件**。声明类（有哪些面板、有哪些菜单项）走的是
`api.plugin.panels()` / `menus()` **拉**，写成事件就会踩 BUG-13——
注册发生在插件加载时（启动阶段），订阅发生在挂载之后，**直连必漏，且漏得安静**
（Tauri 的 `emit` 对没有监听者的频道是静默成功的，日志里连痕迹都没有）。
判据与完整推理见 `docs/05` §5.3 与 `docs/07` BUG-13。

⚠️ 插件频道（`plugin:<归一化 id>:<名字>`：Git 插件的 `git:status` 等）
**不在表里，也没有任何人在听**——那些数据发出去就被丢掉了。
补上它属于 backlog **第 17 项**（那是**发生类**数据，通道是对的，缺的只是订阅端）。

**② 在 `App.tsx` 的事件订阅 effect 里订上**（`App.tsx:105-131`）：

```ts
const subs = await Promise.all([
  on<NotifyPayload>(events.notify, (p) => toast(p.message, p.level)),
  ...
]);
if (alive) unlisteners.push(...subs);
else subs.forEach((u) => u());
return () => { alive = false; unlisteners.forEach((u) => u()); };
```

⚠️ **退订函数必须收、必须在清理里调。** 不是洁癖：热重载几轮之后同一个事件会有
好几个监听者，一次通知弹好几遍（`ipc.ts:150-151`）。而且这个 effect 里有一条
**已知的漏**——`applyTheme` 的退订函数就被丢掉了（`App.tsx:135` 只调不接返回值），
登记为 `docs/07` BUG-7。**照这个 effect 的写法抄，别照 BUG-7 那样抄。**

**③ 加 payload 类型。** `ipc.ts` 里已有 `NotifyPayload` / `DocumentChangedPayload`
两个，新事件照形状加一个。（原先的 `PluginPanelPayload` / `PluginMenuPayload`
**已随 BUG-13 一起删掉**——那两条是声明类，不该走事件。）

### ⚠️ 时序坑：早发的事件没人收

插件在 `setup()` 里就被加载，那一刻**前端还没起来**，`listen()` 都还没注册，
而 Tauri 的 `emit` 对没有监听者的频道是**静默成功**的。现象是"插件菜单时有时无"
（取决于插件加载与前端启动的赛跑），日志里却一点痕迹都没有。

⚠️ **治它的办法不是"记账 + 重放"。** 那个方案写进过两处文档、后来被推翻
（BUG-13）：它会让面板清单有**两个真相源**（前端的事件账本、插件自己的注册表），
重放漏一次或前端不是幂等的就静默分叉——**和它想治的那个病一模一样**。

**正解是分类**：`nota.ui.*` 里**声明类**的（`register_panel` / `register_menu`）
**根本不发事件**，写进插件的 Lua registry，前端挂载后调 `nota_plugin_panels` /
`nota_plugin_menus` **拉**一次；**发生类**的（`notify`、插件自己的
`plugin:<id>:<name>`）才推。**推的那一类，启动早期发出去的确实会丢**。

`nota_frontend_ready` 因此**保留但缩小用途**：它是"WebView 从这一刻起能收事件了"。
前端那一枪已经按"要发"写了（`App.tsx:93`），**别把它删了**——
将来要补"先攒着、这一枪之后补发"，前端那半就落在这里（`lib.rs:125-127`、
`docs/07` 第 16 项，编号保留、状态**已作废**）。

---

## 4. 新增一个设置项

### 第 1 步 · `src-tauri/src/settings.rs`：加字段 + 给默认值

`Settings` 上有 `#[serde(default)]`（`settings.rs:56`），所以**新字段能读老文件**
（缺的字段取默认值）——这是有意留的向后兼容。但 `Default::default()` 里**必须补上**
新字段，否则编译期就报缺字段。

```rust
pub struct Settings {
    pub ui_style: UiStyle,
    ...
    pub autosave_seconds: u32,       // settings.rs:69
}

impl Default for Settings {
    fn default() -> Self {
        Self { ..., autosave_seconds: 0 }    // settings.rs:81
    }
}
```

⚠️ **存法即接口。** 字段名是 **snake_case 直接落盘**（`ui_font_size`、
`content_width`），而**枚举值**是 kebab-case（`ui_style = "macos"`，
由枚举上的 `#[serde(rename_all = "kebab-case")]` 决定，`settings.rs:25`）。
改名这个字段就是改用户的配置文件格式——**每次改动都要想清楚值不值**。

### 第 2 步 · 前端拿到它：`ipc.ts` 的 `Settings` 接口

`src/bridge/ipc.ts:41-49` 有一份**与 Rust 侧一一对应**的接口，**同批加字段**。

⚠️ 两边不一致时 `invoke` 不会报错，只会给你一个少了字段的对象
（`ipc.ts:16-17`）。

### 第 3 步 · 让它真的有用：`applyTheme` / `theme.css`

**只有影响外观的设置项才走这一步。** 影响外观的写法是"设置项 → `<html>` 上的属性
→ CSS 变量"，落到 `src/styles/applyTheme.ts`：

```ts
root.dataset.uiMode = resolveMode(settings.ui_mode);          // applyTheme.ts:64
root.style.setProperty("--ui-font-size", `${settings.ui_font_size}px`);  // applyTheme.ts:71
```

两条纪律：

| 纪律 | 为什么 |
|---|---|
| **`applyTheme` 返回退订函数，调用方必须接** | `ui_mode = "auto"` 要跟着系统变，它挂了 `matchMedia` 监听（`applyTheme.ts:77-81`）。不接返回值 = 监听器累积，就是 BUG-7 |
| **形状进 `[data-ui-style]`、颜色进 `[data-ui-mode]`，两者相乘** | `theme.css:3-7`。把颜色写进 style 段就毁掉了那个风格的暗色版本 |
| ⚠️ **别把"布局常量"塞进这一套** | `theme.css` 里还有一组**不跟任何设置项走**的尺寸常量（`--sidebar-width` / `--dock-width` / `--toolbar-height` / `--statusbar-height`）。它们**不随风格变、不该被 `applyTheme` 碰**，写死在 `:root`。加它们的记录在 `docs/04` §3.1b，**不在这里** |

### 第 4 步 · 每处都写到了吗：三处文档 + 一个命令口径

| 要改的 | 改什么 |
|---|---|
| `docs/03-data-structures.md` | `Settings` 的字段表 |
| `docs/04-ui-map.md` | 设置项在界面上怎么呈现（**现在还没有设置对话框**，见 backlog 第 10 项） |
| `docs/10-typora-parity.md` | 如果这一项对应 Typora 的某个功能，状态格与 §1 的计数一起改 |

（映射依据：`docs/09` §2.1 的 `settings.rs → 03,04,10`。）

⚠️ **保存走"整份替换"**：`nota_settings_set` 收的是**整份 `Settings`**
（`commands/settings.rs:15-33`），不是 patch。所以前端改一项时必须把**完整对象**传回去，
只传改动的字段会把其余字段恢复默认。落盘失败时后端会把内存回滚，
免得出现"界面上是新的、重开又变回去"这种最难解释的状态。

---

## 5. 新增一个外观风格

⚠️ 先分清三件事（这三条轴是**互相独立**的，用户明确要求过，`settings.rs:1-13`）：

| 轴 | 字段 | 管什么 |
|---|---|---|
| **界面风格** | `ui_style` | **一整套设计语言**：控件形状、圆角、间距、动效、字体栈。**不是"主题"的同义词** |
| **明暗** | `ui_mode` | 亮/暗。**任何风格下都成立** |
| **文档主题** | `document_theme` | 只管正文那一块，不动外壳一分 |

**加一个新风格**（比如再加一个 `gnome` / `elementary`）要动**三处**：

### 第 1 步 · `src-tauri/src/settings.rs` 的 `UiStyle` 枚举

```rust
#[serde(rename_all = "kebab-case")]
pub enum UiStyle { Auto, Adwaita, Macos, Yaru, Windows }   // settings.rs:26-33
```

加一个变体。⚠️ 这个枚举是**落盘格式**的一部分（`ui_style = "yaru"`），
变体名换成 kebab-case 就是用户配置文件里的值。

### 第 2 步 · `src/styles/theme.css` 加一个风格块

```css
[data-ui-style="yaru"] {
  --radius-sm: 6px;
  --radius: 9px;
  --radius-lg: 14px;
  --control-height: 32px;
  --spacing: 9px;
  --toolbar-shadow: 0 1px 2px rgba(0, 0, 0, 0.14);
  --btn-font-weight: 500;
}                                        /* theme.css:109-117 */
```

⚠️ **只写形状，不写颜色。** 颜色一律由 `[data-ui-mode]` 那两段给
（`theme.css:37-78`）。把颜色写进 style 段，那个风格**就没法配暗色了**——
而"我要 macOS 风格 + 暗色"是必然会出现的需求（`theme.css:10-11`）。

唯一的例外写在 Yaru 那段注释里（`theme.css:106-108`）：**风格的识别性颜色**可以单独覆盖
`--accent`，但只换明度不换色相。加例外时**要在 CSS 里写明理由**，别默默破例。

### 第 3 步 · `docs/04-ui-map.md` 的外观一节

那里是三条轴的权威表（也是 `docs/09` §2.2 里 `theme.css → 04,08` 的落点）。

### ⚠️ 还有一处机械同步：`ipc.ts` 的联合类型

`src/bridge/ipc.ts:38` 手写了一份同形状的联合类型：

```ts
export type UiStyle = "auto" | "adwaita" | "macos" | "yaru" | "windows";
```

**不加这个，前端就构造不出带新值的 `Settings`**（TS 会报类型不匹配）。
它与 Rust 枚举**没有自动生成的关联**，只能靠人记得。

### 顺带：让 `auto` 能探到新风格

`auto` 的落点由 `detectStyle()` 决定（`applyTheme.ts:34-40`），
它现在从桌面环境名猜（KDE→adwaita、Ubuntu→yaru、其余→adwaita）。
⚠️ **`guessDesktop()` 目前恒返回空串**（`applyTheme.ts:43-47`），
所以 `auto` 实际上**永远落 Adwaita**。这让 XDG portal 的 `color-scheme`
接上之后才好使——那是 backlog 第 11 项的一部分。
**加新风格时不必顺手修这个**，但要知道"我加了风格，`auto` 探不到它"。

---

## 5b. 加一份文档主题（Typora 格式）

⚠️ **和 §5 完全不是一回事**：§5 加的是**我们自己写的**一套外观风格（要动 Rust 枚举、
CSS 变量、TS 联合类型三处）；这一节加的是**用户那边的一份 CSS 文件**——
**一行代码都不用改**。

### 放哪儿

三个目录，**按顺序**（靠前的盖掉同名的）：

| 目录 | 谁的 |
|---|---|
| `~/.config/nota/themes/` | **用户自己的**（菜单栏「主题 → 打开主题文件夹…」会建出来） |
| `~/.config/Typora/themes/` | Typora 装的 |
| `~/.var/app/io.typora.Typora/config/Typora/themes/` | Typora flatpak 的 |

### 长什么样（就是 Typora 的形状）

```
themes/
├── night.css
└── night/               # 同名目录：字体、图片
    ├── open-sans.woff2
    └── bg.png
```

`night.css` 里按 **相对** 路径引用：`url('./night/open-sans.woff2')`。
也支持 `@import`（最多 8 层，防环）。

⚠️ **`@include-when-export` 会被删掉**：那段是"导出时才生效"的规则，我们还没有导出，
留着它会污染正文，所以 `typora-theme.ts` 用一条正则把它整条去掉（`INCLUDE_WHEN_EXPORT_RE`）。
⚠️ 同理，**解析器不认识的 at 规则一律丢掉**（`@charset` 之类）——
只有 `@media`（下钻）、`@font-face` / `@keyframes` / `@supports` / `@page`（原样保留）
这几种是过的。

### 为什么不用改代码

`typora-theme.ts` 那四步（展开 `@import` → `url()` 换成 `data:` → 浏览器解析 →
收拢进 `#write`）是**通用的**，它不认识任何具体主题名。所以：
丢一个 `.css` 进去 → **重启 Nota** → 菜单栏「主题」里就有了。
⚠️ **必须重启**：主题清单只在启动时拉一次（`docs/07` 第 41 项）。

### 要验什么（这一步别人替不了）

| 看什么 | 怎么看 |
|---|---|
| 版式对不对 | 拿一份**有标题、列表、引用、代码块、表格**的文档过一遍 |
| 字体真的加载了 | ⚠️ **别拿 `github` 验**——它的第一条 `@font-face` 是 `local('Open Sans Regular')`，容器里装着 Open Sans，字体压根不会被请求。要验就用**去掉了 `local()` 的探针主题** |
| 外壳有没有被带歪 | 换完主题看侧栏/顶栏/标签栏——它们只该跟着**提升上来的那几个变量**变（`theme.css` 末尾那段桥接），不该散架 |

⚠️ **主题里给我们没有的 DOM 写的规则是死规则**（`#typora-sidebar`、`.md-toc`…），
不报错、不生效——那是**边界**不是 bug，别去"修"它。

---

## 6. 新增一个内置插件

完整规格在 `docs/11-writing-a-plugin.md`（目录形状、清单逐栏、能力表）与
`docs/13-lua-api.md`（能用的 `nota.*`）。这一节只说**要动哪几个地方**。

### 第 1 步 · 建目录：`plugins/<名字>/`

```
plugins/<名字>/
├── plugin.toml      # 清单，逐栏见 docs/11 §2
└── main.lua         # 入口，导出 M.on_load(nota) / M.on_unload()
```

⚠️ `find_manifests()` 认**两种形状**（`plugin/manifest.rs:266-286`）：
`<dir>/plugin.toml`，或 `<dir>/<id>/plugin.toml`。所以插件目录**正好一层**就是规则，
别多套一层。

**照 `plugins/git/` 抄**——它是活样例，`plugins/ai/` 是第二个
（后者还演示了怎么处理"宿主那半还没实现"）。

### 第 2 步 · 写清单：`plugin.toml`

⚠️ **能力只申请真的用到的**，每一条都要说得清用在哪一行
（`plugins/git/plugin.toml:1-7` 那段注释就是这么写的）。
申请了不用的能力是在扩大攻击面而不换任何功能。

逐栏说明、默认值、校验规则、写错会得到什么错误，全在 `docs/11` §2。

### 第 3 步 · 构建接线：✅ 已接好（BUG-11，2026-09-23 修并验过）

**开发态不用做任何事**：debug 构建会自动扫仓库根的 `plugins/`
（`paths.rs:53-60`，`cfg!(debug_assertions)` 那条分支），
所以放好目录、重启应用就能看到。

**打包态**现在也通了：`bundle.resources` 里有一条
`{"../plugins": "plugins"}`，bundler 会把整棵目录拷进资源目录的 `plugins/`
（`resource_dir.join("plugins")` 就是 `paths::builtin_plugins_dirs()` 打包后看的地方）。

⚠️⚠️ **这条之所以单列一段，是因为它踩了三版才写对**（详见 `docs/06` §2.4）。
要加**新的**资源目录时照抄这一条的形状，两条硬规矩：

1. **键写目录，别写 glob**。glob 那一支只取 `file_name()`，会把树拍平
   （两个插件的 `main.lua` 会互相盖掉）；数组形式则会把 `..` 变成 `_up_`。
2. **加完必须真拆一个包看**——`ar x <包>.deb && tar tf data.tar.gz`。
   开发期走的是仓库目录，**"跑起来没问题"完全证明不了这件事**。

⚠️ 这属于 `docs/09` §2.3 的 `src-tauri/tauri.conf.json → 01,06`，改完同批改文档。

### 第 4 步 · 怎么测它（不靠开窗）

从便宜到贵，四档：

| 档 | 怎么做 | 能测到哪一层 |
|---|---|---|
| **① 清单** | 照 `plugin/manifest.rs` 末尾那 5 条测试的形状，加一条单元测试调 `Manifest::load()` | 清单能不能解析、能力申请对不对、`api` 版本、`entry` 逃逸。**不起窗、不起 Lua** |
| **② 入口脚本的语法与纯逻辑** | 用一个 Lua 解释器把 `main.lua` 当模块跑（`dofile` 拿回模块表），再喂一张**假的 `nota` 表**调 `on_load` | Lua 侧的语法错误、命令名重复、`args` 解构。⚠️ **容器里默认没有 `lua`**（`ls /usr/bin/lua*` 为空，mlua 是 vendored 的），要 `dnf install -y lua` 装一个 |
| **③ 真加载** | **起 Xvfb**（`docs/06` §5），然后看侧栏「插件」页那一行是「已加载」还是标红 | 清单扫描、能力装配、`on_load` 真跑通、`nota.ui.register_*` 有没有抛。⚠️ Tauri 的窗口要 X 显示，**Xvfb 就够，不用真桌面** |
| **④ 命令真跑** | ③ 的基础上用 `xdotool` 点菜单（`docs/06` §5.4） | 端到端。⚠️ `xdotool type` 打不了中文，见 `docs/06` §5.4 |

**最要紧的一条判据在启动日志里**：`[nota] 载入 N 个插件`
（`lib.rs:60`）。N 没涨，说明**插件根本没被扫到**；
而如果清单解析失败，那行之外还会有 `[nota] 插件清单读不了：{路径}：{原因}`
（`plugin/mod.rs:118`）——⚠️ **这种插件不会出现在插件列表里**，只能在这行日志里找到。

### 第 5 步 · 同批改文档

| 要改的 | 为什么 |
|---|---|
| `docs/11-writing-a-plugin.md` | 新插件若是"该怎么写"的新范例（`docs/09` §2.3：`plugins/*/plugin.toml → 11`） |
| `docs/13-lua-api.md` | 新插件用到的 `nota.*` 若与文档对不上，是**文档错**，同批修（`plugins/*/main.lua → 11,13`） |
| `AGENTS.md` §2 | 「插件与工具」那张表加一行 |
| `docs/07` | 新插件让某项功能从空壳变成能用的话 |
