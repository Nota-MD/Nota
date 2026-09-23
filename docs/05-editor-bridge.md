# 05 — 编辑器桥：Milkdown 装配、双向通道与大纲

> 最后同步：2026-09-22

本文讲**编辑区那一半**：为什么是 ProseMirror 系、`src/editor/create.ts` 到底装了什么、
React 与编辑器的边界画在哪、前端↔后端两条通道各自的方向与去抖、以及
`src/ui/outline.ts` 那份启发式的误差。

⚠️ 先读 `docs/03-data-structures.md` §真相在哪——本文的每一条通道都建立在
"**前端是文本的唯一真相、后端是 300ms 去抖的镜像**"之上。

---

## 1. 为什么是 ProseMirror 系（Milkdown）

**不是**"textarea + 高亮装饰"，因为 Typora 的语义是**文档树**，不是"带样式的文本缓冲"。

在文档树上这些都是一等节点，在文本缓冲上则要一层层拿文本偏移去近似，且每次编辑都可能
算错：

- 表格拖列宽；图片定尺寸；
- 嵌套列表的层级；
- 脚注引用；
- 任务项勾选。

Typora 能做到的那几样看起来"琐碎"的功能，**恰恰是文本缓冲方案最先崩的地方**。

选 Milkdown 作为文档树的具体形态，是因为它底下就是**裸 ProseMirror**：将来某个节点要
下沉到 PM 原语（自定义 schema、自定义 plugin），这条路是敞开的。`create.ts` 刻意不做
任何"只此一家"的封装——对外只给五个方法（§4）。

⚠️ 与 Folio 的对照：Folio 的编辑区是 WebKitGTK 6 里的 `contenteditable`（宿主才是真相）；
Nota 是 **WebKitGTK 4.1 里的 ProseMirror 文档树**（前端是真相）。两条结论不能互相照搬。

---

## 2. 装了哪些、刻意没装哪些

全部装配在 `src/editor/create.ts::createEditor()` 的 `Editor.make().use(…)` 链上。

### 2.1 装了的

| 来源 | 名字 | 干什么 |
|---|---|---|
| `@milkdown/kit/core` | `rootCtx` / `defaultValueCtx` / `editorViewCtx` / `serializerCtx` / `parserCtx` | 只用到 ctx 键，用来在 `.config()` 里设挂载点与初始文本，以及在句柄里取序列化器/解析器 |
| `@milkdown/kit/preset/commonmark` | `commonmark` | CommonMark 的节点与标记（标题、列表、引用、代码块……） |
| `@milkdown/kit/preset/gfm` | `gfm` | GFM 扩展：表格、删除线、任务项、自动链接 |
| `@milkdown/kit/plugin/history` | `history` | **撤销栈**。`App.tsx` 没有绑 Ctrl+Z，撤销完全由它自己的键盘处理负责 |
| `@milkdown/kit/plugin/listener` | `listener` + `listenerCtx` | 文档变化回调的挂点（§5.1） |
| `@milkdown/kit/plugin/cursor` | `cursor` | **拖放指示线 + gap 光标**（`dropCursorConfig` / `gap-cursor`），不是"光标样式" |
| `@milkdown/kit/plugin/clipboard` | `clipboard` | 剪贴板的序列化/反序列化 |
| `@milkdown/kit/plugin/indent` | `indent` | 列表里按 Tab/空格缩进的快捷键（`indentConfig` 可配 `type` / `size`，**没配**，走默认） |
| `@milkdown/kit/plugin/trailing` | `trailing` | 文末按 `trailingConfig.shouldAppend` 补一个节点（默认段落），保证末尾能落光标 |
| `./instant-render`（**本仓**） | `instantRender` | 光标所在块的 Markdown 标记（`##`/`>`/`-`/围栏）淡化画在块左边。**这是本仓唯一一个自己写的 ProseMirror 插件** |
| `./task-list`（**本仓**） | `taskList` | 任务项的复选框：画方框 + 点它勾上 + **回车切出来的新项不继承勾**。⚠️ **不改 schema**——DOM 钩子（`data-checked`）是 `preset-gfm` 本来就给的 |
| `./code-block`（**本仓**） | `codeBlockView` | 代码块右下角那一条（语言选择器 / 复制 / 折叠）。⚠️ 走 `$view`（NodeView），**全仓唯一一处**——它要加的是真的会交互的元素，`Decoration` 那种只读装饰做不到 |
| `@milkdown/kit/utils` | `replaceAll` | `setMarkdown` 用的整篇替换（§6） |
| `@milkdown/plugin-prism` | `prism` | 代码块高亮 |
| `@milkdown/plugin-math` | `math` | 数学公式（KaTeX） |
| `@milkdown/plugin-diagram` | `diagram` | ```mermaid 代码块 → 图 |

⚠️ 除 listener 那条回调外，**这些插件一个都没有做配置覆盖**（`.config()` 里只设
`rootCtx` / `defaultValueCtx` / `listenerCtx`）。所以它们的行为完全由上游版本决定，
升级 Milkdown 时这一屏是最可能变的。

⚠️ **`instantRender` 是把东西"只改显示、不改文档"地画到编辑区上的例子。**它走 ProseMirror 的 `Decoration`——**这是硬约束不是选择**：
直接 `appendChild` 的东西会被 ProseMirror 重绘时冲掉。将来任何"想给某个节点加个角标/
背景/浮层"的需求都走同一条路。⚠️ 而且**只用 `Decoration.node`，不要用 `Decoration.widget`**
（块边界上的 widget 落点不可控，踩过，见 `docs/02` 那一节与 `docs/07` §4）。

### 2.1b 两条自制路径，判据只有一条

| 路径 | 机制 | 什么时候用 |
|---|---|---|
| 只改**显示**、不加元素 | `Decoration`（`instant-render.ts`） | 加角标、背景、浮层——只要不指望它接事件 |
| **这个节点由我来画** | `$view` NodeView（`code-block.ts`） | 要加 **`<select>` / `<button>` 这类真的会交互的元素**时。widget 是只读装饰，点它、让它持有焦点、让它开下拉都不是它的职责 |

⚠️ **NodeView 的三条契约**（`code-block.ts` 里全用上了，缺一条就出怪现象）：

- `dom` / `contentDOM`：`contentDOM` 是**ProseMirror 只许动这一块**的那个子节点，
  其余部分（那条按钮栏）归我们。
- `stopEvent`：事件一进来就拦下（点、按键、滚轮）。没有它，PM 会把"点在 `<select>` 上"
  当成"用户点了编辑区"去挪光标。
- `ignoreMutation`：已经发生的 DOM 变更要不要告诉 PM。⚠️ **少了它，"复制"按钮把文字改成
  「已复制」这件事会被 PM 当成"用户在编辑区里改了东西"**，于是它去重解析，**光标当场飞走**。
  这两条是**两件事**，别合并。

⚠️ 还有一条类型上的坑：`$view` 收的是 `$Node | $Mark`，而 `codeBlockSchema` 是
`$NodeSchema`（"schema 定义 + 那个 node"的合成体）——**要传 `codeBlockSchema.node`**，
传它自己过不了 `tsc`。

### 2.2 四个必须知道的三方包事实

1. **`@milkdown/kit` 的 `exports` 里没有 `plugin/prism`、`plugin/math`、`plugin/diagram`**，
   这三个必须从各自的包进（`@milkdown/plugin-prism` 等），不能写成 `@milkdown/kit/plugin/prism`。
2. **三个包都必须显式写进 `package.json`**——它们**都是直接依赖**。
   漏了就是一句 `Cannot find module`。
   ⚠️ 本行曾写成"`plugin-math` 与 `plugin-diagram` 是 kit 的间接依赖，所以能在 `node_modules`
   里被找到"，那是错的：`@milkdown/kit` 的 `dependencies` 里只有 **block / clipboard /
   cursor / diff / history / indent / listener / slash / streaming / tooltip / trailing /
   upload** 这 12 个 `plugin-*`，**prism、math、diagram 一个都不在其中**。
   它们之所以在 `node_modules` 里，是因为 `package.json` **各自显式列了**（第 19–21 行），
   不是因为被谁捎带进来的——别把"结果看起来一样"当成"原因一样"。
3. **版本不同步是现状**：`@milkdown/kit` 与 `plugin-prism` 是 `^7.22.1`，
   而 `plugin-math` 是 `^7.5.9`、`plugin-diagram` 是 `^7.7.0`。这不是笔误——
   那两个包的发版节奏跟 kit 不一样。
4. **`refractor` 也属于"必须显式列"那一类**（2026-09-22 加）：`plugin-prism` 的高亮引擎是
   `refractor`，而 `create.ts` 现在直接 `import "refractor/all"` 去补语言表（理由见 §2.3），
   所以它从"别人的传递依赖"变成了本项目**直接使用**的包，`package.json` 里必须有一行。
   **判据就一条**：只要 `src/` 里出现一句 `import "x"`，`x` 就该在 `package.json` 里——
   哪怕它本来就躺在 `node_modules` 里。**"能跑"和"依赖写对了"是两件事**，前者会骗人，
   因为间接依赖哪天被上游换掉，报错的是你的代码。

✅ **KaTeX 的 CSS 引上了**（2026-09-22 修）：`src/main.tsx` 里现在有一行
`import "katex/dist/katex.min.css"`。

⚠️ **这一行之前是漏的**，而漏了的表现极具迷惑性，值得记一笔：
`plugin-math` 的 `toDOM` 里**真的调了 `katex.render()`**，所以 HTML 出得来、也不报错，
只是那棵树**没有排版**——分数线画不出来、上下标一样大、积分号退化成普通字母。
看上去完全像"公式功能没做"，实际是"样式没引"。
**KaTeX 的排版（分数线定位、`\sqrt` 的钩子、符号字体）全在那份 CSS 里，不在它生成的 HTML 里。**
一句话：**渲染了 ≠ 显示对**。

⚠️ **`diagram` 的代价是包体**：`@milkdown/plugin-diagram` 静态 `import mermaid`，
而 mermaid 自己按图类型动态 import，所以 `dist/assets/` 会散出几十个分块
（`flowchart-elk-definition-*.js`、`sequenceDiagram-*.js`、`mindmap-definition-*.js`、
`ganttDiagram-*.js`、`c4Diagram-*.js`…… 实测 44 个文件、合计约 4.2 MB）。
这些分块都是同源的，`tauri.conf.json` 的 CSP（`script-src 'self'`）放得过。
代价是首屏偏重，`docs/07` **第 27 项**（前端代码拆分）记的就是它。

### 2.3 ⚠️ `refractor` 的语言表：36 种，不是全部

`prism` 的高亮引擎是 `refractor`（Prism 的 hast 封装）。它**只加 class、不给颜色**——
每个词拿到的是 `token keyword` 这类 class，配色得宿主自己写
（`app.css` 里那 11 组选择器，颜色变量在 `theme.css` 的 `--code-*`）。
**少了配色就是"有 class 没颜色"**：整块代码一个色，看着像语法高亮没接。

⚠️ 语言表这里是**第二个坑**：`@milkdown/plugin-prism` 内部写的是
`import { refractor } from "refractor"`，而 `refractor` 这个入口指向 **`lib/common.js`**——
里面只 `register()` 了 **36 种**（c / cpp / csharp / java / python / js / ts / rust /
go / bash / sql / yaml / json / php / ruby / swift / kotlin / lua / perl / r / html /
css / scss / sass / less / ini / makefile / diff / markdown / objectivec / arduino /
basic / vbnet / regex / clike / markup-templating）。

`lib/all.js` 才是全量那份（**297 种**）。`create.ts` 里那句副作用 import 就是干这个的：

```ts
import "refractor/all";
```

**为什么这样能生效**：两边是**同一个单例**（都从 `refractor/lib/core.js` 取那一个
`refractor`），而且 `plugin-prism` 读语言表是**惰性**的——
`getBlockDecorations(node, pos, refractor, languages = refractor.listLanguages())`
里那是**默认参数**，调用时才求值。所以只要这行 import 在 `Editor.make()` 之前跑完就行。

实测：`import "refractor/all"` 之后 `listLanguages()` 从 4 涨到 **400**——
297 种语言**加上别名**（`ts`→`typescript`、`sh`→`bash` 这类各算一个名字）。

**代价是包体**：`index-*.js` 从 1373 kB 涨到 1881 kB（gzip 419 → 604 kB）。
这是**有意换的**：桌面应用没有下载时间这一说，而"我要的语言不在列表里"是
插件作者和用户都会撞上的问题。真嫌大时再改成按需 import，
但那时要自己维护依赖顺序（比如 `php` 必须排在 `markup-templating` 之后，
`cilkc` 必须在 `c` 之后）。

⚠️ `refractor` 里**没有 `vue`**（`registered("vue")` 返回 `false`）——
Prism 的 vue 语言在另一个包里，**别以为全量注册就什么都有了**。

---

### 2.4 **刻意没装**的（和装了的一样重要）

| 没装的 | 它是什么 | 为什么现在不装 |
|---|---|---|
| `slash` | 斜杠菜单（`/` 唤起命令面板） | **交互糖**。先装它们会让我们在**还没确定自己的交互口径时**就被它们的默认行为绑住 |
| `block` | 块手柄（左侧六点、拖动整块） | 同上 |
| `tooltip` | 悬浮工具提示（链接预览等） | 同上 |

这三个是 Typora 对标矩阵里最显眼的几项：`docs/10` §3 的「斜杠菜单」一行就是 `⬜` +
一句"`create.ts` 里**刻意没装** `@milkdown/plugin-slash`"。逐项状态以 `docs/10`
的矩阵为准，排期看 `docs/07` §3（**第 3 项**"插入菜单"与它最接近）。

⚠️ 别把"没装"理解成"没影响"：**富文本工具栏**（粗体/斜体按钮）不是编辑器插件，
它是外壳的一部分，目前也还没有。

---

## 3. React 与编辑器的边界

规则只有一条：**React 不管编辑器内部的 DOM**。

Milkdown（ProseMirror）自己拥有那块 `contenteditable`；React 只负责"什么时候挂上去、
什么时候拆掉"。想让 React 去 diff 编辑区的内容，两边会互相覆盖——这类 bug 表现为
**"打着字光标突然跳走"**，而且极难复现。

落地方式（`src/ui/EditorPane.tsx`）：

| 做法 | 为什么 |
|---|---|
| 一个**从不重新渲染的空 `div.editor-mount`** 当挂载点 | React 只往里放属性（`--content-width`），不放子节点 |
| 内容变化一律走 `setMarkdown()` 这条**命令式**通道 | 不经过 React 的状态流 |
| `App.tsx` 给 `EditorPane` 带 `key={activeDoc.id}` | **换文档 = 整个组件重挂**，省得写"把 A 文档的撤销栈换成 B 的" |
| effect 的依赖数组是 `[doc.id]`，**刻意不含 `doc.text`** | `doc.text` 是**初始值**，不是要跟随的状态（跟随它会每次同步都重建编辑器） |
| `disposed` 标志 + `handle.destroy()` | React 19 StrictMode 下 effect 会跑两遍：第一遍的实例如果已经建好了，这一遍就得拆掉，**不然页面上会有两个 ProseMirror** |
| 卸载时清掉待执行的去抖定时器 | 不然组件没了还会 `api.doc.sync` 一次 |

`handle.focus()` 在建好之后立刻调一次；`ready` 为假时显示「正在准备编辑器…」。

⚠️ 这一整套（React 不碰编辑区 DOM）**存在的理由就是保护 IME 组合态**，而
**中文输入的 IME 组合态本身还没有实测过**（`docs/07` BUG-5 / backlog 第 24 项）。
改这里的任何东西之前，先照 `docs/06` §5 的无头目检流程把中文输入验一遍。

---

## 4. `EditorHandle`：对外只有五个方法

```ts
export interface EditorHandle {
  getMarkdown: () => string;
  setMarkdown: (markdown: string) => void;
  focus: () => void;
  runCommand: (name: EditorCommand) => void;   // 2026-09-23 加的
  destroy: () => void;
}
```

| 方法 | 语义 | 实现 | 实际调用点 |
|---|---|---|---|
| `getMarkdown()` | **取当前 markdown 文本**（序列化 `view.state.doc`，走 `serializerCtx`） | `editor.action(...)` | `App.tsx::saveDoc()`（存盘前**强制同步一次**，§5.1 对策②）、`copyAsMarkdown()` |
| `setMarkdown(md)` | **整篇替换**，底层是 `editor.action(replaceAll(md))` | 同步执行 | `App.tsx` 收到 `nota:document-changed` 且 `origin === "plugin"`、以及 `reloadDoc()` 命中活动文档时。⚠️ `create.ts` 的注释说它还用于"打开文件"——**那条路走的是重挂组件**（`key={doc.id}`），并没有调它 |
| `focus()` | 把焦点交给编辑区 | `editorViewCtx.focus()` | `EditorPane` 挂载完成后 |
| `runCommand(name)` | 跑一条编辑命令 | 见 §4.1 | 菜单栏（`menuHandlers`）与快捷键（Ctrl+1..6 / Ctrl+0） |
| `destroy()` | **销毁**。组件卸载时**必须**调，否则 ProseMirror 的 DOM 监听会留着 | `editor.destroy()` | `EditorPane` 的清理函数、以及 StrictMode 那一遍 |

⚠️ **别的模块不要直接去摸 `editorViewCtx` 里的 state**（`create.ts` 文件头的原话）。
要加功能就加第六个方法，别把命令式通道开成两道。

### 4.1 `EditorCommand`：一张**白名单**联合类型

```ts
export type EditorCommand =
  | "undo" | "redo"
  | "bold" | "italic" | "inlineCode" | "strike"
  | "h1" | "h2" | "h3" | "h4" | "h5" | "h6"
  | "text" | "quote" | "ul" | "ol" | "codeBlock" | "hr" | "table";
```

⚠️ **不是"随便什么命令名都能传"**。任意的命令名字符串从菜单传进来，等于把一个 `any`
形状的入口开给界面层——写错了不报错、只是没反应。列成联合类型，**写错就是编译错**。

⚠️ `h1`~`h6` 走**同一族**命令（`wrapInHeadingCommand` 带层数参数），在 `runCommand`
里拆开，所以这里列六个而不是一个 `heading` 加参数。

⚠️ **命令不认识时静默无操作**（返回 `false`）。界面那边本来就该保证只派发白名单里的值，
真走到 `default` 分支是代码写错了，而"按一下没反应"比"抛个异常打断编辑"更不打扰人。

⚠️ 全仓**唯一**一处 `$view`（代码块 NodeView）不在这个通道上——它自己处理 DOM 事件。
另外**行内标记**（`**`、反引号）也不在这里，那是 `docs/07` 第 39 项要动 schema 的活。

### 4.2 正文区挂的是 `id="write"`

```ts
ctx.update(editorViewOptionsCtx, (prev) => ({
  ...prev,
  attributes: { ...(typeof prev.attributes === "function" ? {} : prev.attributes), id: "write" },
}));
```

**这一步是主题兼容的支点**：改造 Typora 主题 CSS 时，所有裸元素规则（`h1`、`body`、`a`…）
都被收拢到 `#write` 之下（见 `styles/typora-theme.ts`）。**没有这个 id，主题一条都命不中；
反过来正因为有它，主题的规则才只作用于正文、碰不到外壳。**

⚠️ 走 `editorViewOptionsCtx` 而**不是**建完之后去改 DOM：ProseMirror 重建 view 时
只会重放这里的属性，手动改的那一下会丢。
⚠️ `attributes` 的类型允许是**函数**形式，这里只可能是对象形式，所以先归一化再展开。

---

## 5. 双向通道

### 5.1 前端 → 后端（`nota_doc_sync`，去抖 300ms）

```text
用户打字
  → ProseMirror 事务
  → listenerCtx.markdownUpdated((_ctx, markdown, prev) => { if (markdown !== prev) onChange?.(markdown) })
  → EditorPane 的 onChange：清掉上一个定时器，重设 300ms
  → （300ms 没人再打字）api.doc.sync(doc.id, markdown)
  → DocumentStore::sync：内容没变 → 原样返回；变了 → 换文本 / dirty = true / revision += 1
  → 再 await onDocsChanged()（= App.refreshDocs() → api.doc.list()）
  → 标签上的小圆点、状态栏、大纲跟着更新
```

三个设计点：

| 点 | 口径 |
|---|---|
| 去抖放在**调用方**（`EditorPane`），不在 `create.ts` 里 | 代码注释的原话：**"多快算太快"取决于拿这个回调干什么**——存草稿 / 推给后端 / 更新字数，三种节奏不一样。`create.ts` 只保证"变了就叫我"（还用 `markdown !== prev` 挡掉空转） |
| 去抖间隔是 `SYNC_DEBOUNCE_MS = 300`（`EditorPane.tsx`） | 见 `docs/03` §9.1 |
| 脏标记**由后端算** | 只有后端知道跟磁盘上那份一不一样；所以同步完要 `refreshDocs()` 把 `dirty` 取回来 |

**强制同步点**（`docs/03` §1.1 对策②）：`App.tsx::saveDoc()` 在 `api.doc.save` 之前
先 `editorRef.current?.getMarkdown()` 再 `api.doc.sync(id, text)`——因为镜像可能还差
最后几次击键（用户按下 Ctrl+S 时那个 300ms 定时器通常还没到点）。

**装载方向的收尾点**（`docs/03` §4.2）：`EditorPane` 在 `handle.focus()` **之后**调一次
`api.doc.settle(id, text)`，把编辑器给出的文本认领成"当前的干净文本"。
⚠️ **顺序是硬约束**：`focus()` 自己会派发一笔事务，那一笔就可能改文本，
所以必须在它之后取。这一步是为了 BUG-12（打开文件就显示「已修改」）。

⚠️ 去抖定时器在组件卸载时会被清掉：**关掉标签前的最后 300ms 若没有落点，这段文本
不会进镜像**。走 `closeDoc` 前并没有补一次强制同步（`saveDoc` 有）。所以"打字 → 立刻
Ctrl+W 确认关闭"这条路里，最后几次击键不进后端。

### 5.2 后端 → 前端（`nota:document-changed`）

| 项 | 值 |
|---|---|
| 事件名 | `nota:document-changed`（`events.documentChanged`，`src/bridge/ipc.ts`） |
| payload | `{ id: DocId, text: string, origin?: string }`（`DocumentChangedPayload`） |
| 谁发 | 只有 `lua/api/document.rs::emit_changed()`：插件的 `nota.document.set_text` / `append_text` 写完镜像之后 |
| 谁收 | `App.tsx` 的事件订阅 effect |
| 收到之后 | `p.origin === "plugin" && p.id === activeId` → `editorRef.current?.setMarkdown(p.text)` |

三处刻意的设计：

1. **事件名与宿主的通道名一致**，`origin` 才区分来源——前端不必为"谁改的"写两套分支，
   反正都是"后端这份跟你的不一致了，来拿"。
2. **发事件前先 `drop(store)`**（先放掉 `documents` 锁再 `emit`）。这是"不要跨
   `.await`/回调持锁"那条规矩的样板（`docs/03` §2.2）。
3. **前端不比较 `revision`，直接覆盖**。能走到这条分支就说明改动不是本编辑器发起的
   （自己发起的那次不会绕一圈回来）。

⚠️ 回推不会抖出第二条事件：`setMarkdown` → `replaceAll` → `markdownUpdated` → 去抖
300ms 后又 `sync` 一次同一份文本，而 `DocumentStore::sync` 见文本相同**直接返回旧
`revision`**，不发事件（`docs/03` §4.2）。

⚠️ **`id` 与 `activeId` 不同时前端直接丢弃**，不排队、不缓存，也不触发 `refreshDocs()`。
两个后果（`docs/03` §11 第 2 条）：插件改了后台文档时界面完全无感；之后切回那份文档时
`EditorPane` 用 `App` 里过时的 `doc.text` 建编辑器，下一次去抖同步会把旧文本推回后端、
**覆盖掉插件的改动**。

### 5.3 插件的界面：**通知推、声明拉**（2026-09-22 起）

⚠️ **这一节的原版把三样东西归成了一类，那是错的。** 原版说 `nota.ui` 的
`notify` / `register_panel` / `register_menu` **都**走"发事件给前端"，
并记了一句"两条事件没有监听者"（= BUG-13）。修的时候才看清它们根本不同类：

| | 是什么 | 怎么走 | 走哪条通道 |
|---|---|---|---|
| `nota.ui.notify` | 一件**此刻发生**的事 | **推** | 事件 `nota:notify` → `App.tsx` → toast ✅ |
| `nota.ui.register_panel` | 一份**启动时声明、之后一直成立**的状态 | **拉** | registry `nota_panels` → `nota_plugin_panels` ✅ |
| `nota.ui.register_menu` | 同上 | **拉** | registry `nota_menus` → `nota_plugin_menus` ⚠️ 拉回来了但**还没塞进菜单栏**——菜单栏本体 2026-09-23 已建，缺的是最后一根线（`docs/07` 第 42 项） |
| 插件自己的 `nota.event.emit(x, …)` | 多半是**数据**（Git 的改动列表之类） | **推** | `plugin:<id>:x` ⚠️ 前端没有订阅插件频道，见 `docs/07` 第 17 项 |

**判据一句话：声明是状态 → 拉；发生是事件 → 推。**

⚠️⚠️ **原来的两条为什么必错**（不是"忘了写订阅"）：`register_panel` / `register_menu`
在**插件加载时**跑（`setup()` 阶段），前端的 `listen()` 在**挂载之后**才注册——
时序上必漏；而且 Tauri 对没有监听者的频道 `emit` 是**静默成功**的，
日志里连痕迹都没有，界面看着好好的只是永远空着。
**成对取消的另一件事**：`nota_frontend_ready` 里原计划的"记账 + 重放"**已作废**——
重放会让面板清单有两个真相源，漏一次就静默分叉（详见 `docs/07` 第 16 项与 BUG-13）。
那个命令保留，但用途缩小成"WebView 从这一刻起能收事件了"。

⚠️ 第 17 项（Git 插件的数据没人消费）**不因此解决**，它的结论也不一样：
`plugin:<id>:<name>` 这条**数据**通道是正确的设计，缺的只是前端去订阅。
**别把这条一起"拉"掉。**

---

## 6. 整篇替换语义

**`set_text` / `append_text` 都是整篇替换**，精细的选区 / 位置 API **还没有**
（`docs/07` 第 14 项）。

| API | 实际做的事 |
|---|---|
| `nota.document.set_text(text)` | `store.sync(id, text)`——换掉整份镜像 |
| `nota.document.append_text(tail)` | 先读出当前全文，`push_str(&tail)`，**再整篇 `sync` 回去** |

所以插件想"在光标处插一段"目前只能**拿到全文自己拼**。前端侧的 `setMarkdown(md)` 同理
是 `replaceAll(md)`：没有差量合并，也没有额外的光标恢复代码（光标位置由 ProseMirror 对
这次替换事务的默认映射决定）。

⚠️ 这条限制是**刻意的次序**，不是忘了做：选区 API 的形状（UTF-16 偏移？PM 的
`pos`？锚点+头？）要先定，而定它的前提是先有真实的插件需求。定之前宁可让插件自己拼全文。

---

## 7. `parseMarkdown()` 那条口径

```ts
export function parseMarkdown(editor: Editor, markdown: string): unknown
```

它用 `parserCtx` 把 markdown 解析成 ProseMirror 文档，单独导出来是因为 `docs/03`
里那条口径：

> **任何进编辑器的文本都要先过一遍解析。**

**为什么**：`replaceAll` 一个**语法坏掉的 markdown 不会报错**。remark 会按它的理解
尽力解析，结果不是"报错"而是**"一段看起来对但不完全对的内容"**——那种错最难发现。

⚠️ **`parseMarkdown()` 目前没有任何调用点**（全仓只有它的定义）。也就是说这条口径
现在是**写了但没执行**的：所有进编辑器的文本都走裸 `replaceAll`。它的预期用途是
校验、或将来做"粘贴前预检"；接线之前，遇到"内容看起来对但不完全对"的现象，
这里是第一个该查的地方。

---

## 8. `ui/outline.ts`：大纲与字数

两种东西放一个文件，因为它们是同一类活：**从 markdown 文本里扫出给侧栏/状态栏用的
派生数据**。两个都是**纯函数**，没有副作用、没有 React 依赖。

### 8.1 `extractOutline(markdown)` —— 大纲

```ts
export interface OutlineItem {
  level: number;
  text: string;
  /** 在正文里的行号（0 起），将来做"点了跳过去"要用。 */
  line: number;
}
```

扫描规则（`split("\n")` 逐行，按顺序）：

1. **front matter**：`i === 0` 且该行 `trimEnd() === "---"` 才开始，到 `---` 或 `...`
   结束，整段跳过；
2. **围栏代码块**：`trimStart()` 以 ``` 或 ~~~ 开头时翻转 `inFence`，块内全部跳过；
3. **ATX 标题**：对 `trimStart()` 后的行跑 `/^(#{1,6})\s+(.*)$/`，命中后
   `trim()` 并剥掉收尾的 `#+\s*$`，空文本跳过；
4. 记 `{ level: 井号个数, text, line: 原文行号 }`。

⚠️ 它是**启发式正则，不是真解析**。已知误差：

| 误差 | 表现 |
|---|---|
| **HTML 块**里的 `#` | `<pre>` / `<div>` 里的 `# 注释` 会被当成标题 |
| **缩进代码块**（四空格那种）里的 `#` | 同样会被当成标题（只认 ``` 与 ~~~） |
| **混合围栏** | ``` 与 ~~~ 只是共同翻转同一个 `inFence` 布尔量，`~~~` 里出现 ``` 会把它关掉 |
| **setext 标题** | `===` / `---` 下划线式标题完全不认 |
| **行内格式** | `# **粗体**` 的 `text` 是 `**粗体**`（原样，不剥标记） |
| **front matter 的位置** | 只在**第一行**是 `---` 时才认；前面多一个空行就不认了（这条与后端 `derive_title()` 的 `lines.next()` 口径一致） |
| `line` 字段 | 是原文行号，**包含被跳过的行**（用循环下标，不是新数组下标） |

**为什么不引完整 AST**：真解析要过 remark，而**为一个侧栏列表引入完整 AST 不划算**；
扫一遍是 O(行数)，几千行的文档也就微秒级。真出问题时再换 remark。

### 8.2 `countText(markdown)` —— 字数

```ts
export interface Counts {
  characters: number;
  words: number;
  lines: number;
  /** 预计阅读分钟数，至少 1。 */
  readingMinutes: number;
}
```

口径（对齐 Typora 的状态栏）：

| 项 | 口径 | 为什么 |
|---|---|---|
| `characters` | `[...markdown].length`，按**码点** | 用 `.length` 是 UTF-16 码元——一个 emoji 会被算成 2，一个字的中文倒是对的（1）。混排时两种算法的差会让人对不上数 |
| `words` | 先按**空白**切块；块内 **CJK 字符逐字算一个词**，非 CJK 用 `/[\p{L}\p{N}'’-]/u` 攒成一个词，遇标点收词 | 纯按空白切会把整段中文算成 1 个词（显然不对）；这是中英混排下最贴近直觉的口径 |
| `lines` | `markdown === "" ? 0 : markdown.split("\n").length` | 空文档是 0 行，不是 1 行 |
| `readingMinutes` | `max(1, round(words / 250))` | 200 词/分是英文常见估算，中文按字算 300 更接近；**不细分语种，取 250 折中，只当作粗略参考** |

`isCjk(cp)` 的覆盖区间（含全角标点所在的日文假名块）：`0x3040–0x30FF`（假名）、
`0x3400–0x4DBF`（扩展 A）、`0x4E00–0x9FFF`（基本汉字）、`0xF900–0xFAFF`（兼容汉字）、
`0xAC00–0xD7AF`（谚文）、`0x20000–0x2EBEF`（扩展 B~F）。

⚠️ 已知误差：词字符集里**包含连字符**，所以 `---` 这种纯符号串会被算成 **1 个词**；
而 `*`、`#`、`[` 这些不在集合里，按标点处理（只起到"收掉前面那个词"的作用）。
markdown 标记本身也会影响词数——`# 标题` 里 `标题` 算 1 词，`- 项目` 里 `项目` 算 1 词。

### 8.3 ⚠️ 接线的实际口径与文件头注释不一致

`outline.ts` 的文件头写的是：**"不用后端镜像，因为它去抖 300ms，大纲会一顿一顿；
前端手里就是最新的文本"**。但实际接线是：

```tsx
// App.tsx
<Sidebar docText={activeDoc?.text ?? ""} … />   // activeDoc 来自 docs（= api.doc.list()）
<StatusBar doc={activeDoc} />
```

`docs` 只在 `refreshDocs()` 时刷新，而 `refreshDocs()` 是**去抖同步之后**才被调的
（`EditorPane` 的 `onDocsChanged`）。所以：

- **大纲与字数实际上吃的是后端镜像**，打字时会慢一个去抖周期（约 300ms）——
  与注释想避免的现象**恰好是同一个**；
- 要做到注释里说的"实时"，得在 `EditorPane` 的 `onChange` 里把最新文本提到 `App`
  层（`useState` 或 callback）再传给 `Sidebar`/`StatusBar`；**目前没有这条线**。

（`outline.ts` 本身是纯函数，这个口径问题不在它里面。改之前想清楚：提状态会让每次
击键都触发一次 App 层渲染——那正是 `EditorPane` 刻意不让 React 管编辑区的原因，
所以要么只在"大纲页可见"时才提，要么用 ref + 订阅。）

---

## 9. 与本文相关的、容易踩的坑（汇总）

| # | 坑 | 落在哪 |
|---|---|---|
| 1 | 换文档靠 `key={doc.id}` 重挂——**别改成"按 id 换内容"**，撤销栈/选区会错位 | `App.tsx`、§3 |
| 2 | `create.ts` 里**不做去抖**，别把去抖挪进去 | §5.1 |
| 3 | 插件改文档的事件**必须**发，漏了就是"编辑器里看到的和存盘的不是一份东西" | `docs/03` §1.2 |
| 4 | `KaTeX` 的 CSS 没引 → 公式排版散 | §2.2 |
| 5 | `parseMarkdown()` 没有调用点 → `replaceAll` 坏语法是静默的 | §7 |
| 6 | 前端的 `EditorPane` 那把 `setMarkdown` 只覆盖**活动**文档，且不排队 | §5.2 |
| 7 | 大纲/字数吃的是镜像，不是实时文本（与 `outline.ts` 注释说的相反） | §8.3 |
