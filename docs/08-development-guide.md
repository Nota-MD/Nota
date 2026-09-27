# 08 · 开发指南：怎么加一样东西

> 最后同步：2026-09-22
>
> 本文不是"代码长什么样"（那是 `docs/02-modules.md`），而是**"要加一样东西，
> 该动哪几个文件"**。每一条都是**清单式**的：照着一行一行走完即可。
>
> 结构：先讲两条通则（§1），再按"加什么"分五节。**加东西之前先读 `docs/07`**——
> 要加的那样东西可能已经在 backlog 里排着号了，还可能带着已经想清楚的前提。

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

⚠️ 两边**有差异是刻意的**：脚本多扫 `.css` 与 `.sh`，是额外多拦一类；
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

⚠️ 拆分时**不要连 `NotaError` 的语义一起拆散**——错误走统一类型（`error.rs`），
拆出去的文件照样 `use crate::error::Result`，不要各自造错误类型。

#### 当前值（改完核对一次）

**没有超限文件，但已经有六份进了软上限 WARN 区**（2026-09-26 现数的，
`find … | xargs wc -l | sort -rn | head`）：

| 文件 | 行数 | 备注 |
|---|---|---|
| `plugins/git/main.lua` | **999** | ⚠️ **离硬线 1 行**，动它之前先拆 |
| `plugins/ai/main.lua` | 997 | 同上 |
| `src/App.tsx` | 992 | 2026-09-26 「插入图片」那批涨上来的（**只涨不缩**），再动它要先想清楚搬哪块 |
| `src/bridge/types.ts` | **985** | 2026-09-26 「主题色」那批涨的（`AppearanceSettings` 加一格），⚠️ 再涨就碰硬线 |
| `src/editor/source.ts` | 936 | |
| `src/styles/app.css` | 905 | |

⚠️ **这一节的数字以前是手抄的，一抄就烂**（2026-09-23 一次核对抓出 13 处过期行号、
本节自己也长期停在 "app.css 827 / App.tsx 396"，而那时 App.tsx 已经 900+）。
所以**别信这里的数**，要动之前现数一遍：`bash tools/doc-sync-check.sh` ① 报的就是现值。

### 1.2 改完必须同批改文档（这是完成定义的一部分）

**不是建议。** 改完代码没改文档 = **没做完**。哪几份必须动，看
`docs/09-doc-sync-policy.md` §2 那张映射表；提交前跑：

```sh
bash tools/doc-sync-check.sh
```

它查**八件事**（行数上限、文档新鲜度、引用存在性、backlog 编号存在性、源文件是否登记、
界面无衬线、内置界面风格 id 三份一致、样式表可解析）——**逐条判据以 `docs/09` §3 为准**，
这里不抄一份，免得两处漂。
⚠️ 它是**启发式**的，抓不到语义写错——见 `docs/09` §5。⚠️ **反过来说也一样**：
它是启发式，所以"全绿"不等于"对"。⑧ 那条就是买来的教训——`theme.css` 拆四份那天
①~⑦ 全绿，而应用**整个样式表没生效**（注释缺个起始符，PostCSS 拒收整份文件）。
**样式表拆完／改完要真的开一次窗**，见 `docs/06` §5.26。

另外两条与"加东西"直接相关的纪律：

1. **公开函数签名以 `docs/02-modules.md` 为准**；发现文档与代码不一致，
   **以代码为准并立即修正文档**（`AGENTS.md` §0.4）。
2. **安全边界不要写在 `HostContext` 里面。** 它要一个真的 `AppHandle`，构造不出来，
   写进去的部分**永远测不了**。要写边界就写成纯函数再单测——
   `fs.rs` 的 `resolve_in()`、`git.rs` 的 `挑工作目录()` 都是这么做的（`AGENTS.md` §4）。

### 1.3 文风：说明文，不是随笔

**这条管所有会被读到的中文**：界面上显示的字、代码注释、`docs/`、`AGENTS.md`。
三类读者——用这个软件的人、以后改这块代码的人、审这份仓库的人——读的是同一种语气。

**目标**：说明文。陈述事实、给理由、举具体的例子。允许有详略，不允许有腔调。
（用户 2026-09-25 定的口径：「改成不失趣味的说明学术语气」——**不是**压成干巴巴的
一句话，是把腔调去掉、把内容留下。）

**五类要删的写法**（逐条对照，这五类覆盖绝大多数情况）：

| 类别 | 例 |
|---|---|
| 比喻、俏皮话 | 「八竿子打不着」「白费工夫」「别让用户找不到路」 |
| 第二人称、对读者下命令 | 「你会以为」「别合并」「请注意」 |
| 第一人称、自称 | 「我们只做两档」「本仓绝不做」 |
| 情绪词、感叹 | 「恰恰」「偏偏」「好在」「可惜」 |
| 拿别的软件当参照系 | 「与某编辑器不等价」「某编辑器默认是…」 |

第五类单独说：**Nota 的行为由它自己的取舍决定，不由"另一个软件怎么做"定义。**
要说明差异时，直接讲 Nota 怎么做、为什么这么做，不引对方。
本仓从 2026-09-25 起不再有对标性质的文档与注释（`docs/10` 已中性化改写）。

**四类要保留的**（一并删掉是另一种错）：

- **`⚠️` 开头的警告**——它标的是「这里会出事」，是结构，不是装饰。
- **具体例子和数字**——`$5 和 $6` 会被当成一个公式、代码块默认缩进 4、
  阅读速度 382 是中文常见取值。这些是「趣味」的来源，不是口语。
- **取舍的理由**——为什么默认关、为什么两个设置不合并、为什么那颗按钮是灰的。
- **反例和边界**——「一个拨了不生效的开关，比没有这个开关更糟」。

**两例**（前 = 实际存在的旧文本，后 = 改后）：

界面说明：

> **前**：三个档位都不会回头去改文档里已经存在的字……「输入时转换」改的是你**正在打的那几个字符**（像输入法的自动更正）。「打开一个老文件、保存时偷偷把里面的 `--` 全换掉」这件事本仓绝不做。
>
> **后**：三个档位都不修改文档中已有的字符，区别只在何时转换……「输入时转换」只作用于正在输入的字符，效果等同于输入法的自动更正。打开旧文件并在保存时改写其中全部 `--` 的行为不在实现范围内。

代码注释：

> **前**：⚠️ 气泡是**绝对定位**的，而内容区是 `overflow-y: auto`——超出内容区的那部分会被**裁掉**。所以它长哪边是**分情况**的……往左长**会被裁掉小半个字**（2026-09-24 目检抓到，气泡左边几个字缺了一角）。
>
> **后**：⚠️ 气泡绝对定位，内容区 `overflow-y: auto` 会裁掉越界部分，因此展开方向分两种情况……在左栏右端向左展开会越出内容区边界，首字被裁（2026-09-24 目检发现）。

**怎么查**（启发式，抓不到语义，见 `docs/09` §5）：

```sh
grep -rnE '我们|咱们|本仓|你会|请在|记住|八竿子|白费|恰恰|偏偏|好在|可惜|其实|说白了' \
  src src-tauri/src docs AGENTS.md
```

第五类没有对应的机械 grep——它落在具体的句子而不是某个词上，只能逐句读。

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
| **锁顺序 `plugins → documents → settings`，不许反向** | `state.rs:3-14`。拿多把锁之前先确定自己处在哪一层。**不要跨 `.await` 持锁** |

**② 在 `src-tauri/src/lib.rs` 的 `generate_handler![…]` 里加一行**
（那个宏的参数表就是全部命令的注册表，在 `run()` 里、`.on_menu_event` 之前）：

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
只会得到一个少了字段的对象，然后在某个 `.map` 上抛错（`ipc.ts:16-17`）。

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

⚠️ **动手之前先定性：这件事是「发生」还是「状态」？**
这张表里**只该有「发生类」事件**。声明类（有哪些面板、有哪些菜单项）走的是
`api.plugin.panels()` / `menus()` **拉**，写成事件就会触发 BUG-13——
注册发生在插件加载时（启动阶段），订阅发生在挂载之后，**直连必然漏掉，且没有任何痕迹**
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

⚠️ **退订函数必须收、必须在清理里调。** 理由是：热重载几轮之后同一个事件会有
好几个监听者，一次通知弹好几遍（`ipc.ts:150-151`）。而且这个 effect 里有一条
**已知的漏**——`applyTheme` 的退订函数就被丢掉了（`App.tsx:135` 只调不接返回值），
登记为 `docs/07` BUG-7。**照这个 effect 的写法抄；BUG-7 那样的是反例。**

**③ 加 payload 类型。** `ipc.ts` 里已有 `NotifyPayload` / `DocumentChangedPayload`
两个，新事件照形状加一个。（原先的 `PluginPanelPayload` / `PluginMenuPayload`
**已随 BUG-13 一起删掉**——那两条是声明类，不该走事件。）

### ⚠️ 时序坑：早发的事件没人收

插件在 `setup()` 里就被加载，那一刻**前端还没起来**，`listen()` 都还没注册，
而 Tauri 的 `emit` 对没有监听者的频道是**静默成功**的。现象是"插件菜单时有时无"
（取决于插件加载与前端启动的赛跑），日志里却一点痕迹都没有。

⚠️ **治它的办法不是"记账 + 重放"。** 那个方案写进过两处文档、后来被推翻
（BUG-13）：它会让面板清单有**两个真相源**（前端的事件账本、插件自己的注册表），
重放漏一次或前端不是幂等的就静默分叉——**与它要解决的问题属于同一类**。

**正解是分类**：`nota.ui.*` 里**声明类**的（`register_panel` / `register_menu`）
**根本不发事件**，写进插件的 Lua registry，前端挂载后调 `nota_plugin_panels` /
`nota_plugin_menus` **拉**一次；**发生类**的（`notify`、插件自己的
`plugin:<id>:<name>`）才推。**推的那一类，启动早期发出去的确实会丢**。

`nota_frontend_ready` 因此**保留但缩小用途**：它是"WebView 从这一刻起能收事件了"。
前端那一枪已经按"要发"写了（`App.tsx:93`），**不要把它删掉**——
将来要补"先攒着、这一枪之后补发"，前端那半就落在这里（`lib.rs` 的
`nota_frontend_ready`、`docs/07` 第 16 项，编号保留、状态**已作废**）。

---

## 4. 新增一个设置项

### 第 1 步 · `src-tauri/src/settings/<页>.rs`：加字段 + 给默认值

设置项**按界面上的页分文件**（2026-09-24 拆的，一页一个文件，名字一一对应）。
加字段之前先回答"这一项画在偏好设置的哪一页"，然后进那个文件——
不属于任何一页的东西（比如快捷键表）就不该是一个设置字段。

| 界面上的页 | 文件 |
|---|---|
| 文件 | `settings/files.rs` |
| 编辑器 | `settings/editor.rs` |
| 图像 | `settings/image.rs` |
| Markdown | `settings/markdown.rs` |
| 导出 | `settings/export.rs` |
| 外观 | `settings/appearance.rs` |
| 通用 | `settings/general.rs` |
| 文档主题 / 快捷键 | **没有文件**：前者写顶层的老字段 `document_theme`，后者是 `src/ui/commands.ts` 里的键位表——两个都不是标量开关 |

⚠️ **顶层那批老字段一个都不搬。** `settings/mod.rs` 的 `Settings` 里还留着
`ui_style` / `ui_mode` / `document_theme` / `autosave_seconds` 这批 2026-09-24
之前就有的字段，它们**留在顶层**：搬进 `[页名]` 表会让老设置文件里的值
**静默丢回默认**——用户开着某一项，升级之后设置被重置，而他的 `settings.toml`
一个字都没变。**新字段才进 `[页名]` 表**，界面照旧把老字段画在对应的那一页里。

拿「文件」页的「切换文件时自动保存」走一遍：它在 `settings/files.rs`，
所以字段进 `struct Files`、默认值进 `impl Default for Files`。

```rust
pub struct Files {
    ...
    pub autosave_on_switch: bool,
}

impl Default for Files {
    fn default() -> Self {
        Self { ..., autosave_on_switch: false }
    }
}
```

`Files` 与 `Settings` 都带 `#[serde(default)]`，所以**新字段能读老文件**
（`[files]` 表缺这一项时取默认值）——这是有意留的向后兼容。但
`Default::default()` 里**必须补上新字段**，否则编译期就报缺字段。
这三条（默认值 / 落盘名 / 老文件补默认值）在 `settings/` 各文件末尾的测试里
都有对照，加字段时照抄一份。

⚠️ **存法即接口。** 字段名是 **snake_case 直接落盘**（`ui_font_size`、
`content_width`），而**枚举值**是 kebab-case（`ui_style = "macos"`，
由枚举上的 `#[serde(rename_all = "kebab-case")]` 决定）。
改名这个字段就是改用户的配置文件格式——**每次改动都要权衡代价**。

⚠️ **落盘形状分两种，改完打开 `~/.config/nota/settings.toml` 看一眼**：
新字段在 `[页名]` 表里，老字段在顶层。实样在 `settings/mod.rs` 文件头。

### 第 2 步 · 前端拿到它：`ipc.ts` 的 `Settings` 接口

`src/bridge/ipc.ts` 的 `interface Settings` 是一份**与 Rust 侧一一对应**的接口，
**同批加字段**（域字段也一样：它们挂在接口里的 `files` / `editor` … 那几项下，
形状跟 Rust 那边的表结构走）。

⚠️ 两边不一致时 `invoke` 不会报错，只会得到一个少了字段的对象
（`ipc.ts` 顶上那段注释写的就是这件事）。

### 第 3 步 · 让它真的有用：`applyTheme` / `theme.css`

**只有影响外观的设置项才走这一步。** 影响外观的写法是"设置项 → `<html>` 上的属性
→ CSS 变量"，落到 `src/styles/applyTheme.ts`：

```ts
// applyTheme() 里的 paint()，两条轴 + 一条变量都在这儿落
root.dataset.uiMode = resolveMode(settings.ui_mode);
root.style.setProperty("--ui-font-size", `${settings.ui_font_size}px`);
```

⚠️ **落点有两种，先挑一个**（挑错的代价见 `docs/03` §5.2b）：

| 你的设置项是 | 落在 | 例子 |
|---|---|---|
| **离散的**（几档之一） | `root.dataset.<某个>`，CSS 里按 `[data-…]` 分块 | `ui_style` → 16 格；`ui_mode` → `[data-ui-mode]` |
| **连续的**（算不完的取值） | `root.style.setProperty("--x", …)` **内联** | 「主题色」`--accent` / `--accent-fg`（1600 万种颜色，没法做成选择器格子）、`--ui-font-size` |

⚠️ **内联的优先级高于任何选择器**——这是它的威力（一行覆盖 16 格），也是它的陷阱：
**换档时记得 `removeProperty` 把它摘掉**，只写不摘 = 上一档的残留永远盖着新的
（`applyTheme` 里 `accentVars()` 返回 `null` 那条 `else` 分支就是干这个的）。⚠️ 内联的
值**不能靠 `getComputedStyle` 反查自己写没写**——CSS 变量在 `[data-ui-mode]` 那一段
会被重新声明（重新声明就切断了继承），要读预览色得在元素上显式重写一遍，
`AppearancePane.tsx` 的 `ModeSwatch` 就是这么做的。

两条纪律：

| 纪律 | 为什么 |
|---|---|
| **`applyTheme` 返回退订函数，调用方必须接** | `ui_mode = "auto"` 要跟着系统变，`applyTheme` 里挂了 `matchMedia` 监听（`(prefers-color-scheme: dark)` 那一段）。不接返回值 = 监听器累积，就是 BUG-7 |
| **形状进 `[data-ui-style]`、颜色进 `[data-ui-mode]`，两者相乘** | `theme.css` 文件头那段。把颜色写进 style 段就毁掉了那个风格的暗色版本 |
| ⚠️ **文档主题的变量不许塞进 `theme.css`** | `--find-hit` / `--find-current`（2026-09-24 为查找高亮加的）是**外壳**的变量，**不是**文档主题的——高亮要盖在正文上，两者在暗色下的合适值差得很远，所以单独两个变量而不是复用 `--accent` |
| ⚠️ **"布局常量"不归这一套管** | `theme.css` 里还有一组**不跟任何设置项走**的尺寸常量（`--sidebar-width` / `--dock-width` / `--toolbar-height` / `--statusbar-height`）。它们**不随风格变、不该被 `applyTheme` 碰**，写死在 `:root`。加它们的记录在 `docs/04` §3.1b，**不在这里** |
| ⚠️ **`--font-ui` 不许出现衬线** | 用户 2026-09-24 的原话：「绝对不要用衬线字体做UI字体。」`tools/doc-sync-check.sh` 的第 ⑥ 项在查这个（含绕道 `var(--font-doc)` 那条）。中文那几项**必须是黑体**。⚠️ 唯一的例外是 `--font-doc` 本身——它是**文档**正文字体，可以是衬线，但只许 `editor.css` 的正文引它 |
| ⚠️ **改"默认那一格"要先确认改的是谁** | `ui_style = auto` 在本机落到 **adwaita**（`guessDesktop()` 恒返回空串），所以"默认长相 = adwaita + 跟随系统"。2026-09-24 的「轻快一点」改的就是这一格（浅色三条 + 深色四条 + adwaita 形状五条），**没有新加风格**——加风格的话已经存着 `auto` 的人看不到变化。逐条旧值→新值在 `docs/04` §3.2b，`theme.css` 原地也留着原值 |

### 第 4 步 · 每处都写到了吗：三处文档 + 一个命令口径

| 要改的 | 改什么 |
|---|---|
| `docs/03-data-structures.md` | `Settings` 的字段表 |
| `docs/04-ui-map.md` | 设置项在界面上怎么呈现（✅ 设置对话框 2026-09-23 已做，外观那一格在 §3.4） |
| `docs/10-feature-matrix.md` | 如果这一项对应矩阵里的某一格，状态格与 §1 的计数一起改 |

（映射依据：`docs/09` §2.1 的 `settings/ → 03,04,10`。）

⚠️ **保存走"整份替换"**：`nota_settings_set` 收的是**整份 `Settings`**
（实现在 `commands/settings.rs`），不是 patch。所以前端改一项时必须把**完整对象**传回去，
只传改动的字段会把其余字段恢复默认。落盘失败时后端会把内存回滚，
免得出现"界面上是新的、重开又变回去"这种最难解释的状态。

---

## 5. 新增一个外观风格

⚠️ 先分清四件事（这四条轴是**互相独立**的，用户明确要求过，口径写在
`settings/mod.rs` 文件头，数据结构一节见 `docs/03` §5.2 / §5.2b）：

| 轴 | 字段 | 管什么 |
|---|---|---|
| **界面风格** | `ui_style` | **一整套设计语言**：控件形状、圆角、间距、动效、字体栈。**不是"主题"的同义词** |
| **明暗** | `ui_mode` | 亮/暗。**任何风格下都成立** |
| **主题色** | `appearance.accent` | **强调色一处**（2026-09-26 加）。空串 = 跟随当前风格自带的出厂色 |
| **文档主题** | `document_theme` | 只管正文那一块，不动外壳一分 |

⚠️ **前三条轴的分工是「形状归风格、颜色归用户」**（用户 2026-09-26 的原话：
「这个主题只包含一个 UI 的设计样式，比如说圆角的半径，而不包含主题颜色，这样用户
可以根据自己的喜好来定制」）。落到写代码上就一句：**一档风格要有自己的默认配色
（出厂值），但它只是个默认值，用户随时能覆盖**——`--accent` 由「主题色」那条轴
以内联变量覆盖，比你那 16 格选择器优先级高，所以**加风格时不用为它做任何事**。

### ⚠️ 先问一句：这一档要不要**做成内置**？

**2026-09-26 起用户自己能加风格**——往 `~/.config/nota/ui-styles/` 丢一个
`<id>.css` 就多出一档（同名则覆盖内置），**一行源码都不用改**。所以：

| 你想要的是 | 走哪条路 |
|---|---|
| 自己换一套配色/圆角试试看的 | **导入档**（下面「§A」）。写完存盘、重启应用即可 |
| 要随应用发给所有人、要在"外观"页里有个正经中文名 | **内置档**（第 1–4 步） |

⚠️ 两条路的**取舍**：内置档写的是 `theme/shape.css` + `theme/color.css` 那两份
（轴一 / 轴二分开，所以它自动获得 16 格里的两格，且**与 `ui_mode` 正交**）；
导入档是用户自己写一份**完整的** CSS，**不限域**，可以干出内置档干不了的事
（改某个具体组件的长相），代价是那份文件得自己同时管好明暗两态、也没人替他测。

## §A · 导入档：用户自己加一档

```text
~/.config/nota/ui-styles/<id>.css      ← id 就是文件名去掉 .css，也是下拉里的取值
```

文件格式（**必须**按 id 起头写选择器，因为注入时**一个字节都不改写**）：

```css
/* ~/.config/nota/ui-styles/my-style.css —— 重启应用后「外观」页多出一档 my-style */
[data-ui-style="my-style"] {
  --radius: 6px;
  --radius-sm: 4px;
  --control-height: 30px;
  --toolbar-height: 36px;
}
[data-ui-style="my-style"][data-ui-mode="light"] { --bg: #ffffff; --fg: #111111; --accent: #0b6bcb; }
[data-ui-style="my-style"][data-ui-mode="dark"]  { --bg: #141414; --fg: #eeeeee; --accent: #4aa3ff; }
```

⚠️ **规矩只有三条**，全在 `styles/ui-style.ts` 的文件头：
①选择器从 `[data-ui-style="<你的 id>"]` 起头（**不限域是有意的**——界面风格要改的
就是整个外壳，套一层 `.editor-pane` 前缀等于整份文件都不生效，而且**不报错**）；
②**明暗两态都要写**（`data-ui-mode` 那一段），只写一段的话另一态会落回 `:root` 默认；
③**同名的内置档会被覆盖**（`adwaita.css` 就是覆盖内置 adwaita）——实现方式仅仅是
文档顺序：注入的 `<style>` 追加在 `<head>` 末尾，同权重时后者胜。

⚠️ **语法错一条，WebKit 自己丢掉那一条，**我们不做二次报错**（没有解析也就没有校验）。

### ⚠️ 契约：导入的样式**只管形状**，颜色交给那两条轴

2026-09-26 用户把它定成了「这个主题只包含一个 UI 的设计样式……而不包含主题颜色」。
所以写导入档时请按这条分工：

| 该写进 `<id>.css` 的 | 不该写、交给别人的 |
|---|---|
| 圆角（`--radius*`）、间距、控件与工具栏高度、描边宽度、动效时长曲线、字体栈 | **强调色**——用户随时会用「主题色」那条轴把它顶掉，你写的那个值在那之后**一点都不剩**；要改基本配色请走「明暗」 |

⚠️ **这不是限制，是"写了会不会生效"的区别**：`--accent` 由 `applyTheme` 内联写在
`<html>` 上（`style="--accent:#e95420"`），**内联 > 选择器**，所以用户一旦选了自定义
主题色，导入档里那句 `--accent` 就永远赢不了——**而且不会有任何提示**。
`--accent-fg`（压在强调色上的前景色）同理，它连存都不存，是按对比度当场算的。

## §B · 内置档

**加一个内置风格**（比如再加一个 `gnome` / `elementary`）要动**四处**（第 1–3 步是代码、第 4 步是文档），**另外还有两处机械同步**（`ipc.ts` 的联合类型、界面上的风格表——漏了都不会安静地错：一处编译期报错、一处只是用户点不到）：

### 第 1 步 · `src-tauri/src/ui_styles.rs` 的 `BUILTIN_IDS`

⚠️⚠️ **2026-09-26 起没有 `UiStyle` 枚举了**：`ui_style` 是 `String`（用户能导入档，
取值开放），内置那几档的 id 列在 `ui_styles.rs::BUILTIN_IDS` 里，是**三份抄本里的
权威那一份**（另两份：`theme/shape.css` 的选择器、`AppearancePane.tsx` 的 `STYLE_ORDER`；
`tools/doc-sync-check.sh` ⑦ 查三份一致）。

```rust
pub const BUILTIN_IDS: &[&str] = &[
    "auto", "adwaita", "ghub", "plasma", "macos",
    "windows", "windows10", "yaru", "yaru-blue",
];
```

加一项。⚠️ 这个字符串是**落盘格式**的一部分（`ui_style = "yaru"`），kebab-case。

⚠️ 清单现在共 **9 项**，数的时候把 `auto` 和风格分开：`auto` 是"跟随系统"，
由 `applyTheme.ts` 的探测表落成下面某一个（不是一个风格本身）；要在明暗两态下
各自成立的风格是**八个**（`theme.css` 那句「8 风格 × 2 模式 = 16 格」数的是这八个）
——等一下，`auto` + 八个风格是九项，而 16 格数的是**八个**风格，两处数的不是同一件事，
别按 9 × 2 去算格子。
`yaru-blue` 与 `yaru` **共用一套形状**，只换强调色。

⚠️ **加风格时顺手问一句"`auto` 探得到它吗"**。探得到的才往 `applyTheme.ts` 的探测表里加一行；
`ghub` / `yaru-blue` / `windows10` 就是**故意的探不到**（GitHub 没说自己是什么桌面、
Yaru 蓝要用户自己选、Win10 与 Win11 的 UA 是同一串 `Windows NT 10.0`）——它们只能手选。

⚠️ **换成 `String` 的代价**：拼错的 id 不再有任何编译期或运行期拦截，前端
`resolveStyle` **原样返回**（不退回默认档，与 `document_theme` 同一个口径），于是
外壳落到 `:root` 默认样式。「外观」页把清单里没有的那个 id 补成一条
`（找不到「…」）` 选项，让"生效的是这个东西、而它找不到"看得见。完整理由在
`settings/mod.rs::DEFAULT_UI_STYLE`。

⚠️ **本文件里的 CSS 引用一律写文件名 + 注释标题、不写行号**：往里面加一段，
后面所有行号都会整体挪。要对账就 `grep -n` 找那一段的注释标题。

⚠️⚠️ **2026-09-26：`theme.css` 拆成了四份**（它当时 1117 行、顶破 1000 行硬线）。
**名字没换**，`main.tsx` import 的还是 `styles/theme.css`，但它现在只剩 `@import`：

| 文件 | 里面是什么 | 加风格时动不动它 |
|---|---|---|
| `styles/theme/base.css` | `:root` 的**风格无关**量 + 明暗两段的公共部分 + 新加的三族控件量的**默认值** | ❌ 一般不动 |
| `styles/theme/shape.css` | 轴一：**八档风格的形状** | ✅ **第 2 步改这里** |
| `styles/theme/color.css` | 轴一 × 轴二：**16 段**颜色块（含 `--btn-*` / `--switch-*` / `--material-*`） | ✅ **第 3 步改这里**（浅深各一段） |
| `styles/theme/extras.css` | 变量表达不了的：材质 `@supports`、动画、`prefers-*` | ❌ 基本不动（理由见下） |

⚠️ **顺序不能调**：`base` 必须在 `shape` 前（两处选择器权重都是 (0,1,0)，靠后来居上决胜），
`extras` 必须最后。调换会让所有风格的圆角与控件高**静默失效**——不是报错，是看着不对劲。

### 第 2 步 · `src/styles/theme/shape.css` 加一个风格块

```css
[data-ui-style="yaru"],
[data-ui-style="yaru-blue"] {   /* 同一个语言的两个强调色档 = 并列两个选择器，形状只写一份 */
  --radius-sm: 4px;
  --radius: 4px;
  --radius-lg: 6px;
  --control-height: 32px;
  --toolbar-height: 40px;
  --toolbar-shadow: 0 1px 2px rgba(0, 0, 0, 0.14);
  --btn-font-weight: 500;
  --switch-w: 42px; --switch-h: 22px; --switch-knob: 18px; --switch-travel: 18px;
}
```

⚠️ **只写形状，不写颜色。** 颜色一律由 `[data-ui-mode]` 那两段给
（`:root`，以及它下面的浅色一段、深色一段）。把颜色写进 style 段，
那个风格**就没法配暗色了**——而"我要 macOS 风格 + 暗色"是必然会出现的需求
（`theme.css` 文件头就写着这条）。

⚠️ **开关那四个数是算出来的，别随手凑**：`行走 = 外壳宽 − 2×边框(各 1px) − 滑块直径 − 2×两端留白(各 2px)`，
公式与默认值一起写在 `base.css` 的 `--switch-travel` 上面。

**确有色识别性的风格**（GitHub 的冷灰蓝、Yaru 的橙）不在这两段里破例，
而是另起一段**两属性**选择器，写进 **`src/styles/theme/color.css`**（那里标着
「轴一 × 轴二：确有识别色的风格」的注释底下），**浅色深色各一段**：

```css
[data-ui-style="adwaita"][data-ui-mode="light"] { --accent: #3584e4; --accent-fg: #fff; }
[data-ui-style="adwaita"][data-ui-mode="dark"]  { --accent: #78aeed; --accent-fg: #10131a; }
```

⚠️ **两属性比单属性更具体，所以它稳定压过上面两段**，不用 `!important`。
⚠️ **强调色必须连 `--accent-fg`（它上面的字）一起给**——浅色强调色配白字会看不清。
加一段时**要在 CSS 里写明理由**，不默默破例。
⚠️ **`--accent` 必须过对比度**：和 `--accent-fg` 一起算，正文大小要 ≥ 4.5:1。
本条是硬要求，`docs/04` §3.2c 那张表里每一档都算过；**对不上就换一档色，别改 `--accent-fg` 凑**
（Adwaita 与 Yaru 那两处已知的例外在 `docs/04` §3.2c 里单列，是**明知故犯**，加上去要有理由）。

⚠️ **不要顺手往 `theme/extras.css` 末尾再加一段组件选择器。** 那里面只有材质与
几段动画/`prefers-*`（理由见 `docs/04` §3.2）：加风格的正确做法是给变量，不是给选择器——
先问「这个值换一个风格也说得通吗」。

### 第 2b 步 · 新加的三族控件量（`--btn-*` / `--switch-*` / `--material-*`）

2026-09-26 加进来的，为的是让各档风格能给出**各自的按钮底色/描边**与**开关尺寸**，
而不用去改那批被文件树、菜单、输入框共用的通用量。三族的**默认值写在 `base.css` 的 `:root`**，
且**逐字节等于**改动之前写死的表达式——所以没给值的风格**一格都不动**。

| 族 | 谁消费 | 不给值的后果 |
|---|---|---|
| `--btn-bg` / `--btn-bg-hover` / `--btn-bg-active` / `--btn-border` | `styles/app.css` 的 `.btn` | 落到默认（原来的样子）。⚠️ **Adwaita 给的是 `transparent`**——它那套稿子要求普通按钮扁平无底 |
| `--switch-w/h/knob/travel/on/off/knob-bg` | `styles/settings.css` 的 `.stg-switch` | 同上落到默认（36×14、行走 16px）。⚠️ 只有设置页用得上，**菜单里没有开关** |
| `--material-bg` / `--material-blur` / `--material-saturate` | `theme/extras.css` 的 `@supports` 块（只有四个材质风格在名单里） | 落到 `var(--bg-raised)`，也就是**不糊**——这是本机的实际观感，理由见 `docs/04` §3.2c |

⚠️⚠️ **`--material-bg` 的透明度不要照稿子写**。那六份稿子给的是 0.90–0.98，
但**本机的 WebKitGTK 静默忽略 `backdrop-filter`**（实测：0.55 时后面的字原样清晰可读），
所以全部抬到 **0.97**；稿子里的模糊半径照抄进 `--material-blur` 存着，
等哪天 blur 真生效了直接就能用。实测数据在 `docs/04` §3.2c。

### 第 3 步 · `src/styles/applyTheme.ts` 的探测表

`ui_style === "auto"` 时靠桌面环境变量猜（`XDG_CURRENT_DESKTOP` / `DESKTOP_SESSION`），
那张表就在 `applyTheme.ts` 的 `detectStyle()` 里（⚠️ 本节的引用**一律写函数名、
不写行号**，理由同上面的 CSS）。**新风格如果对应某个桌面，这里要加一行**；
两者都没有的风格（比如纯自定义的）不用加，它只能手动选。
⚠️ `detectStyle()` 的返回值类型是 `Exclude<UiStyle, "auto">`——往里加一行时**编译器不查**，
它是靠那个 `if/else` 链兜底返回 `adwaita` 的，所以**写了但写错的线索不会报错，只是永远不命中**。
`windows10` 现在就是**故意不在里面**的那一档（理由写在函数上面那段注释里）。

### 第 4 步 · `docs/04-ui-map.md` 的外观一节

那里是三条轴的权威表（也是 `docs/09` §2.2 里 `theme.css → 04,08` 的落点）。

### ⚠️ 还有一处机械同步：`ipc.ts` 的联合类型

`src/bridge/ipc.ts` 手写了一份同形状的联合类型：

```ts
export type UiStyle =
  | "auto" | "adwaita" | "ghub" | "macos"
  | "plasma" | "windows" | "yaru" | "yaru-blue";
```

**不加这个，前端就构造不出带新值的 `Settings`**（TS 会报类型不匹配）。
它与 Rust 枚举**没有自动生成的关联**，只能靠人记得。

**另一处机械同步（界面上得有得选）**：`src/ui/settings/panes/AppearancePane.tsx` 里的
`STYLES` 表——一个风格一条（中文 `label` / 一行 `hint`）。⚠️ 它旁边还有一条
`STYLE_ORDER`（`Record` 的键没有顺序，下拉的选项顺序来自它）。两处都要动：
`STYLES` 是 `Record<UiStyle, …>`，漏了是**编译期**报错；`STYLE_ORDER` 是普通数组，
漏了**不报错**，症状是新风格在 Rust 和 TS 里都存在、**用户却点不到它**。

### 顺带：让 `auto` 能探到新风格

`auto` 的落点由 `detectStyle()` 决定（`applyTheme.ts`），
它现在从桌面环境名猜：`kde`/`plasma` → `plasma`，`ubuntu`/`yaru` → `yaru`，
`windows` → `windows`，`mac`/`darwin` → `macos`，**其余一律 `adwaita`**。
⚠️ **`guessDesktop()` 目前恒返回空串**，所以 `auto` 实际上**只靠 userAgent**。
这让 XDG portal 的 `color-scheme` 接上之后才好使——那是 backlog 第 11 项的一部分。
**加新风格时不必顺带修这个**，但要知道"新加的风格，`auto` 探不到它"。

---

## 5b. 写一份文档主题（**只管正文**）

⚠️ **和 §5 完全不是一回事**：§5 加的是**界面风格**（要动 Rust 枚举、CSS 变量、
TS 联合类型三处）；这一节写的是**文档主题**——一份 CSS 文件，
**一行代码都不用改**（要把它变成内置的才要改 `themes.rs`，见本节末）。

⚠️ **先明确那条线**（用户 2026-09-23 原话「这是文档风格，不是界面风格，不应该影响到UI主题」）：

| 写的是什么 | 影响范围 | 改的是 |
|---|---|---|
| 界面风格（§5） | **整个应用** | `styles/theme.css` 的变量 |
| 文档主题（本节） | **只有编辑区** | `<编辑区>` 里的排版与配色 |

⛔ **不兼容也不内置外部编辑器的主题**（版权）。不要去扫描它们自己的主题目录
（`~/.config/<外部编辑器>/themes/` 这类），也不要把它们自带的主题抄进来。

### 放哪儿

**只有一个目录**：`~/.config/nota/themes/`（**按 XDG 算**，`~/.config` 只是默认值）。
文件名就是主题的 **id**：`minimal.css` → id `minimal`。

⚠️ **id 的形状有硬约束**：只放行 ASCII 字母数字与 `-` `_`（长度 1–64），
因为后端是拿它拼路径的（`<主题目录>/<id>.css`）。**中文文件名用不了**——
这是有意的取舍，显示名写在文件里，文件名只是个键。
⚠️ 同名**覆盖内置**（想改「极简」就复制一份 `minimal.css` 出来改，升级不会冲掉）。
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
**不需要也不允许**另写 `.editor-pane`——已经带了锚点的选择器会被原样放过，
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

⚠️ **`--code-*` 必须自带一整套。** 代码块底色是主题自己挑的，沿用界面那套会出现"深底配深字"。
⚠️ **`--select-text-*` 的 fallback 不能省**（`var(--x, highlight)`）——
`background: var(--x)` 在 `--x` 不存在时整条声明失效、落到 `transparent`，
症状是**选中了看不见**。

### 参考现成的

内置那三套（`src/styles/themes/`：极简 / Adwaita / LaTeX）
就是照这个约定写的，**抄一份改最省事**。每个文件头都指着 `minimal.css` 说约定。

⚠️ **2026-09-26 这批换过**：用户要求「删掉所有默认主题」，原来那六套
（素纸 / 蓝图 / 晨雾 / 报刊 / 墨色 / 松林）全删了。你自己的主题不受影响
（它们本来就在用户目录里），但**照旧名字抄内置**那条路没了——`paper.css`
不再存在，`settings.toml` 里存着 `paper` 的老配置会**悬空**（界面按"无主题"
显示，见 `docs/04` §3.2 那张表）。

### 什么改不了（边界，不是 bug）

- **外壳**：侧栏、顶栏、标签栏，**一个变量都不共用**。写 `body { background: … }`
  只会改到编辑区，不会改到整个窗口——这是设计，不是失效。
- **按别的编辑器的 DOM 写的选择器**（它自己侧栏、菜单栏的 id 与类名）：
  界面上没有那些元素，这些规则是**永远不会命中的死规则**。
  不报错，也不起作用。**不要去"修"它们。**

### 要验什么（这一步无法由代码代劳）

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
3. 确认它**不带界面变量**——`cargo test` 里那条 `内置主题不碰界面变量` 会检查这一点。

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
不多套一层。

**照 `plugins/git/` 抄**——它是活样例，`plugins/ai/` 是第二个
（后者还演示了怎么处理"宿主那半还没实现"）。
⚠️ **2026-09-26 又多了两个，按"从哪一份入门"排**：`plugins/stats/`（写作统计）是
**最小**的一个——只申请两条能力（`document.read` ＋ `ui.panel`）、不碰磁盘也不出网，
而且它是**面板心跳**（`live = true`）唯一的活样例；`plugins/slidev/` 演示"要一个外部工具的
插件怎么写"。⚠️ 四个插件的**能力清单各不相同**，别照抄一个就当模板。

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

⚠️⚠️ **这条之所以单列一段，是因为它改了三版才写对**（详见 `docs/06` §2.4）。
要加**新的**资源目录时照抄这一条的形状，两条硬规矩：

1. **键写目录，不写 glob**。glob 那一支只取 `file_name()`，会把树拍平
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

**最要紧的一条判据在启动日志里**：`[nota] 载入 N 个插件`。
N 没涨，说明**插件根本没被扫到**；
而如果清单解析失败，那行之外还会有 `[nota] 插件清单读不了：{原因}`
（`plugin/mod.rs` 的 `discover()`）——⚠️ **这种插件不会出现在插件列表里**，
只能在这行日志里找到。

⚠️ **这两行从 2026-09-25 起默认不打了**：后端输出归了调试闸门，
**要先 `NOTA_DEBUG=1` 启动**（`docs/06` §3.1）。不设就什么都看不到——
那不是"插件没问题"，是**日志没开**。这是本节最容易白花时间的一处。

### 第 5 步 · 同批改文档

| 要改的 | 为什么 |
|---|---|
| `docs/11-writing-a-plugin.md` | 新插件若是"该怎么写"的新范例（`docs/09` §2.3：`plugins/*/plugin.toml → 11`） |
| `docs/13-lua-api.md` | 新插件用到的 `nota.*` 若与文档对不上，是**文档错**，同批修（`plugins/*/main.lua → 11,13`） |
| `AGENTS.md` §2 | 「插件与工具」那张表加一行 |
| `docs/07` | 新插件让某项功能从空壳变成能用的话 |
