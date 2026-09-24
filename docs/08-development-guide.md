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
不是切一半（`docs/09` §4 对 `src/styles/app.css` 专门写了口径；
`sidebar.css` / `bars.css` / `editor.css` 都是照那条口径拆出来的）。

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

**没有超限文件。** 当前最大值：`src/styles/app.css` 827 行、
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
| **形状进 `[data-ui-style]`、颜色进 `[data-ui-mode]`，两者相乘** | `theme.css:1-30`（文件头那段）。把颜色写进 style 段就毁掉了那个风格的暗色版本 |
| ⚠️ **文档主题的变量不许塞进 `theme.css`** | `--find-hit` / `--find-current`（2026-09-24 为查找高亮加的）是**外壳**的变量，**不是**文档主题的——高亮要盖在正文上，两者在暗色下的合适值差得很远，所以单独两个变量而不是复用 `--accent` |
| ⚠️ **别把"布局常量"塞进这一套** | `theme.css` 里还有一组**不跟任何设置项走**的尺寸常量（`--sidebar-width` / `--dock-width` / `--toolbar-height` / `--statusbar-height`）。它们**不随风格变、不该被 `applyTheme` 碰**，写死在 `:root`。加它们的记录在 `docs/04` §3.1b，**不在这里** |
| ⚠️ **`--font-ui` 不许出现衬线** | 用户 2026-09-24 的原话：「绝对不要用衬线字体做UI字体。」`tools/doc-sync-check.sh` 的第 ⑥ 项在查这个（含绕道 `var(--font-doc)` 那条）。中文那几项**必须是黑体**。⚠️ 唯一的例外是 `--font-doc` 本身——它是**文档**正文字体，可以是衬线，但只许 `editor.css` 的正文引它 |
| ⚠️ **改"默认那一格"要先想清楚改的是谁** | `ui_style = auto` 在本机落到 **adwaita**（`guessDesktop()` 恒返回空串），所以"默认长相 = adwaita + 跟随系统"。2026-09-24 的「轻快一点」改的就是这一格（浅色三条 + 深色四条 + adwaita 形状五条），**没有新加风格**——加风格的话已经存着 `auto` 的人看不到变化。逐条旧值→新值在 `docs/04` §3.2b，`theme.css` 原地也留着原值 |

### 第 5 步 · 每处都写到了吗：三处文档 + 一个命令口径

| 要改的 | 改什么 |
|---|---|
| `docs/03-data-structures.md` | `Settings` 的字段表 |
| `docs/04-ui-map.md` | 设置项在界面上怎么呈现（✅ 设置对话框 2026-09-23 已做，外观那一格在 §3.4） |
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

**加一个新风格**（比如再加一个 `gnome` / `elementary`）要动**四处**：

### 第 1 步 · `src-tauri/src/settings.rs` 的 `UiStyle` 枚举

```rust
#[serde(rename_all = "kebab-case")]
pub enum UiStyle { Auto, Adwaita, Ghub, Macos, Plasma, Windows, Yaru }  // settings.rs:35-48
```

加一个变体。⚠️ 这个枚举是**落盘格式**的一部分（`ui_style = "yaru"`），
变体名换成 kebab-case 就是用户配置文件里的值。

⚠️ **本文件里的 `theme.css:NN` 全是软引用**（2026-09-24 刚重校过一次）。
往 `theme.css` 里加一段，后面所有行号都会挪——**要对账就跑一遍
`grep -n` 找那一段的注释标题**，别信这里的数字。

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
}                                        /* theme.css:212-220 */
```

⚠️ **只写形状，不写颜色。** 颜色一律由 `[data-ui-mode]` 那两段给
（`theme.css:65-145`：`:root` + 浅色一段、深色一段）。把颜色写进 style 段，
那个风格**就没法配暗色了**——而"我要 macOS 风格 + 暗色"是必然会出现的需求
（`theme.css:8-11` 那段文件头）。

**确有色识别性的风格**（GitHub 的冷灰蓝、Yaru 的橙）不在这两段里破例，
而是另起一段**两属性**选择器（`theme.css:222` 起，那段注释底下从 236 行开始）：

```css
[data-ui-style="adwaita"][data-ui-mode="light"] { --accent: #3584e4; --accent-fg: #fff; }
[data-ui-style="adwaita"][data-ui-mode="dark"]  { --accent: #78aeed; --accent-fg: #10131a; }
```

⚠️ **两属性比单属性更具体，所以它稳定压过上面两段**，不用 `!important`。
⚠️ **强调色必须连 `--accent-fg`（它上面的字）一起给**——浅色强调色配白字会看不清。
加一段时**要在 CSS 里写明理由**，别默默破例。

### 第 3 步 · `src/styles/applyTheme.ts` 的探测表

`ui_style === "auto"` 时靠桌面环境变量猜（`XDG_CURRENT_DESKTOP` / `DESKTOP_SESSION`），
那张表在 `applyTheme.ts:42-46`。**新风格如果对应某个桌面，这里要加一行**；
两者都没有的风格（比如纯自定义的）不用加，它只能手动选。

### 第 4 步 · `docs/04-ui-map.md` 的外观一节

那里是三条轴的权威表（也是 `docs/09` §2.2 里 `theme.css → 04,08` 的落点）。

### ⚠️ 还有一处机械同步：`ipc.ts` 的联合类型

`src/bridge/ipc.ts` 手写了一份同形状的联合类型：

```ts
export type UiStyle =
  | "auto" | "adwaita" | "ghub" | "macos" | "plasma" | "windows" | "yaru";
```

**不加这个，前端就构造不出带新值的 `Settings`**（TS 会报类型不匹配）。
它与 Rust 枚举**没有自动生成的关联**，只能靠人记得。

**第四处（界面上得有得选）**：`ui/SettingsDialog.tsx` 里的 `STYLES` 表——
一个风格一条（`value` / 中文 `label` / 一行 `hint`）。⚠️ 漏了这一处，
新风格在 Rust 和 TS 里都存在，**但用户点不到它**。

### 顺带：让 `auto` 能探到新风格

`auto` 的落点由 `detectStyle()` 决定（`applyTheme.ts`），
它现在从桌面环境名猜：`kde`/`plasma` → `plasma`，`ubuntu`/`yaru` → `yaru`，
`windows` → `windows`，`mac`/`darwin` → `macos`，**其余一律 `adwaita`**。
⚠️ **`guessDesktop()` 目前恒返回空串**，所以 `auto` 实际上**只靠 userAgent**。
这让 XDG portal 的 `color-scheme` 接上之后才好使——那是 backlog 第 11 项的一部分。
**加新风格时不必顺手修这个**，但要知道"我加了风格，`auto` 探不到它"。

---

## 5b. 写一份文档主题（**只管正文**）

⚠️ **和 §5 完全不是一回事**：§5 加的是**界面风格**（要动 Rust 枚举、CSS 变量、
TS 联合类型三处）；这一节写的是**文档主题**——一份 CSS 文件，
**一行代码都不用改**（要把它变成内置的才要改 `themes.rs`，见本节末）。

⚠️ **先记住那条线**（用户 2026-09-23 原话「这是文档风格，不是界面风格，不应该影响到UI主题」）：

| 你写的是 | 影响范围 | 改的是 |
|---|---|---|
| 界面风格（§5） | **整个应用** | `styles/theme.css` 的变量 |
| 文档主题（本节） | **只有编辑区** | `<编辑区>` 里的排版与配色 |

⛔ **不兼容也不内置 Typora 主题**（版权）。别去扫 `~/.config/Typora/themes/`，
也别把 Typora 自带的主题抄进来。

### 放哪儿

**只有一个目录**：`~/.config/nota/themes/`（**按 XDG 算**，`~/.config` 只是默认值）。
文件名就是主题的 **id**：`paper.css` → id `paper`。

⚠️ **id 的形状有硬约束**：只放行 ASCII 字母数字与 `-` `_`（长度 1–64），
因为后端是拿它拼路径的（`<主题目录>/<id>.css`）。**中文文件名用不了**——
这是有意的取舍，显示名写在文件里，文件名只是个键。
⚠️ 同名**覆盖内置**（想改素纸就复制一份出来改，升级不会冲掉）。
⚠️ 菜单栏「主题 → 打开主题文件夹…」会把目录建出来。
⚠️ **改了之后要重启**：主题清单只在启动时拉一次（`docs/07` 第 41 项）。

### 长什么样

**按普通文档 CSS 写，不要加任何作用域前缀**：

```css
:root {
  --doc-bg: #fbf7ef;
  --doc-fg: #33302b;
  --code-comment: #9a8f7a;
  /* … */
}
h1 { font-size: 1.9em; }
blockquote { border-left: 3px solid var(--border); }
```

⚠️ **`h1 { … }` 就是 `h1`**。收拢到编辑区那一步是**机械执行**的
（`styles/doc-theme.ts` 把每条选择器改写成 `.editor-pane h1`），
**不需要也不允许**你自己写 `.editor-pane`——已经带了锚点的选择器会被原样放过，
再套一层就是 `.editor-pane .editor-pane h1`，永远命不中。

⚠️ **`:root` / `html` / `body` 是被"改写"成 `.editor-pane` 的，不是加前缀**——
它们指的就是"正文那棵树的根"。所以往 `:root` 里放变量是对的写法。

### 一套主题由两部分组成

1. **在 `:root` 里改 token**：`--doc-bg` / `--doc-fg` / `--border` / `--bg-subtle` /
   `--radius` / `--code-*` / `--select-text-*` / `--font-doc` / `--doc-font-size` /
   `--doc-line-height`。
   ⚠️ 编辑区骨架的样式在 `editor.css` 里是**用 token 写的**，所以改 token 就能连
   代码块底、边框、圆角一起换，**不用去跟 `editor.css` 抢选择器权重**
   （抢不过：那边是 `.editor-mount .ProseMirror`，两条选择器）。
2. **写 `editor.css` 没有覆盖过的**那部分排版：标题、链接、引用、表格、分隔线、列表。

⚠️ **`--code-*` 必须自带一整套。** 代码块底色是你挑的，沿用界面那套会出现"深底配深字"。
⚠️ **`--select-text-*` 的 fallback 别省**（`var(--x, highlight)`）——
`background: var(--x)` 在 `--x` 不存在时整条声明失效、落到 `transparent`，
症状是**选中了看不见**。

### 参考现成的

内置那六套（`src/styles/themes/`：素纸 / 蓝图 / 晨雾 / 报刊 / 墨色 / 松林）
就是照这个约定写的，**抄一份改最省事**。每个文件头都指着 `paper.css` 说约定。

### 什么改不了（边界，不是 bug）

- **外壳**：侧栏、顶栏、标签栏，**一个变量都不共用**。写 `body { background: … }`
  只会改到编辑区，不会改到整个窗口——这是设计，不是失效。
- **按 Typora 自己的 DOM 写的选择器**（`#typora-sidebar` / `.megamenu` / `#top-titlebar` /
  `.md-toc`…）：我们没有那些元素，这些规则是**永远不会命中的死规则**。
  不报错，也不起作用。**别去"修"它。**

### 要验什么（这一步别人替不了）

| 看什么 | 怎么看 |
|---|---|
| 版式对不对 | 拿一份**有标题、列表、引用、代码块、表格**的文档过一遍 |
| 选中看得见吗 | 全选一段——**看不见文字说明 `--select-text-*` 那条 fallback 丢了** |
| 代码块对不对 | 深色主题尤其要看：底色是主题挑的，**字色和底色要能分开** |
| 外壳有没有被带歪 | 换完主题看侧栏/顶栏/标签栏——它们**一点都不该变**。变了就是越界，是 bug |

### 想把它变成**内置**的

三条一起改：

1. 把 `.css` 放进 `src/styles/themes/`；
2. 在 `themes.rs` 的 `BUILTIN` 表里加一行（`id` + 中文显示名 + `include_str!`）；
3. 确认它**不带界面变量**——`cargo test` 里那条 `内置主题不碰界面变量` 会替你查。

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
