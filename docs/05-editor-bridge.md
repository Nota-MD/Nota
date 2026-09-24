# 05 — 编辑器桥：Milkdown 装配、双向通道与大纲

> 最后同步：2026-09-24

本文讲**编辑区那一半**：为什么是 ProseMirror 系、`src/editor/create.ts` 到底装了什么、
**三种编辑模式**（所见即所得 / 源码 / 分屏，见 §3.1 与 §2.5）、React 与编辑器的边界画在哪、
前端↔后端两条通道各自的方向与去抖、以及 `src/ui/outline.ts` 那份启发式的误差。

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
| `./instant-render`（**本仓**） | `instantRender` | 光标所在块的 Markdown 标记（`##`/`>`/`-`/围栏）淡化画在块左边。**这是本仓最早一个自己写的 ProseMirror 插件**（2026-09-24 起同族又多了 `find` 与 `writing-modes`，见下） |
| `./task-list`（**本仓**） | `taskList` | 任务项的复选框：画方框 + 点它勾上 + **回车切出来的新项不继承勾**。⚠️ **不改 schema**——DOM 钩子（`data-checked`）是 `preset-gfm` 本来就给的 |
| `./code-block`（**本仓**） | `codeBlockView` | 代码块右下角那一条（语言选择器 / 复制 / 折叠）。⚠️ 走 `$view`（NodeView），**全仓唯一一处**——它要加的是真的会交互的元素，`Decoration` 那种只读装饰做不到 |
| `./find`（**本仓**） | `查找插件` | **查找/替换**的高亮与选中（`docs/07` 第 4 项）。⚠️ **只读观察者**：命中走 `Decoration.inline`、命令走事务元，**从不改文档** |
| `./writing-modes`（**本仓**） | `写作模式插件` | **专注模式**（压暗兄弟块）+ **打字机模式**（把光标那行滚到正中）。同上只读：装饰 + 元，不进撤销栈 |
| `./lax-heading`（**本仓**） | `宽松标题显示` | **只在宽松模式挂**（严格时连挂都不挂，`.use(strict ? [] : […])`）：把 `#标题` **按标题排版**而**不改一个字**。见 §2.1c |
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
| 只改**显示**、不加元素 | `Decoration`（`instant-render.ts` / `find.ts` / `writing-modes.ts`） | 加角标、背景、浮层、高亮、压暗——只要不指望它接事件 |
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

### 2.1c ⚠️ 「什么算标题」：**一处判据、两种模式、一个字节都不改**

严格模式（`Settings.strict_markdown`，默认 `false` = 宽松）改的不是"解析器怎么解析"，
而是**四处判据里的哪一套**：

| 判据在哪 | 宽松（默认） | 严格 |
|---|---|---|
| `editor/atx.ts`（**唯一判据**，正则在这里） | `#标题` 算标题 | 井号后必须有空格才算 |
| `editor/lax-heading.ts`（显示层装饰） | **挂**：给段落套一层 `h1`~`h6` 的 DOM | 不挂 |
| `editor/source.ts`（源码高亮） | 同宽松口径 | 同严格口径 |
| `ui/outline.ts`（大纲） | 同宽松口径 | 同严格口径 |
| `src-tauri/src/document/mod.rs::strip_atx`（标签页标题） | 同宽松口径 | 同严格口径 |

⚠️ **前四个调用点都得往 `atx.ts` 问，第五个是 Rust 侧的同构实现**——两边的判据
必须一起改，只改一边的症状是"正文里是标题、标签页却显示「未命名」"。

⚠️⚠️ **宽松模式一个字节都不改**（用户 2026-09-24 定的死规矩，原话
「如果关闭，存盘不要自动修复」）。落地方式是**结构性的**：`#你好` 在文档树里
**就是个普通段落**（所以序列化必然把它原样吐回来），标题的样子来自
`Decoration.node` + `nodeName` 的**显示层装饰**。⚠️ 想在这里加"顺手补个空格让
解析器认它"的念头，先读 `lax-heading.ts` 的文件头——第一版就是那么做的，
被否了（那一版存盘存下去的是补过空格那份）。

⚠️ **序列化那半还有一处补丁**：`lax-heading.ts::不转义行首井号` 包了 remark 的
`text` 处理器，把 `\#标签` 里那个**多余的反斜杠**去掉——不加这一步，存盘会把
`#标签` 写成 `\#标签`，那也是"用户没打过的字"。**两种模式都装**，
规律才是一句话「Nota 不会往你写的井号上加反斜杠」。边界、为什么收得紧、
以及一处已知的残留改字，见 `docs/02` 那一节与 `docs/03` §5.5。

⚠️ **改 `strict` 等于换挂哪些插件**——所以它在 `ui/EditorPane.tsx` 那个挂载 effect
的依赖里，切模式是**把编辑器整个重建**（手里那份还挂着旧模式的插件，改不动）。

⚠️ **后端那半有两个入口，都得在**：开机时 `lib.rs` 把 `settings.strict_markdown`
从**构造参数**传进文档仓（`DocumentStore::new(strict)`，忘就编译不过——2026-09-24
之前那一步是漏的，见 `docs/02` 的 `state.rs` 一节）；用户在界面上拨开关时由
`nota_settings_set` 调 `set_strict_markdown()` **当场重算已打开文档的标题**。
⚠️ 两边漏一个的症状都是「正文按一种口径、标签页按另一种」，**不报错**。

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
| 任意 Markdown→HTML 库 | 导出时把正文转成 HTML 用的 | **导出走编辑器自己那条路**（建一个只读实例、摘它渲染出来的 DOM，见 §4.5）。再装一个库就等于第二套渲染实现，两边迟早长得不一样 |
| Pandoc | 转 Word / ODT / LaTeX / Epub / PDF | 它是**外部可执行文件**、还要用户自己装。`docs/10` §3 里那几项因此仍是 `⬜`，这不是"忘了做" |

这三个是 Typora 对标矩阵里最显眼的几项：`docs/10` §3 的「斜杠菜单」一行就是 `⬜` +
一句"`create.ts` 里**刻意没装** `@milkdown/plugin-slash`"。逐项状态以 `docs/10`
的矩阵为准，排期看 `docs/07` §3（**第 3 项**"插入菜单"与它最接近）。

⚠️ 别把"没装"理解成"没影响"：**富文本工具栏**（粗体/斜体按钮）不是编辑器插件，
它是外壳的一部分，目前也还没有。

### 2.5 源码模式装的（CodeMirror 6）

上面那一整套是**所见即所得**那一半的装配。源码模式（`src/editor/source.ts`）
用的是另一家：**CodeMirror 6**——它天生就是"文本缓冲 + 高亮"，而源码模式要的
恰恰是"**别动我的原文**"，所以这里不需要也不该有解析/序列化往返。

| 来源 | 名字 | 干什么 |
|---|---|---|
| `@codemirror/state` | `EditorState` | 状态容器。⚠️ `EditorState.readOnly.of(readOnly)` 走这里 |
| `@codemirror/view` | `EditorView` / `keymap` / `drawSelection` / `placeholder` | 视图。⚠️ `EditorView.editable.of(!readOnly)` 是**另一件事**——它管 DOM 能不能改，`readOnly` 管事务能不能派发，两个都要给 |
| `@codemirror/commands` | `defaultKeymap` / `historyKeymap` / `history()` | 键位表与撤销栈。**这是源码模式唯一能用的历史**（和 Milkdown 的不通） |
| `@codemirror/lang-markdown` | `markdown()` | 按 CommonMark 语法切 token（喂给高亮） |
| `@codemirror/language` | `syntaxHighlighting` | 把 token 映射成样式（`notaHighlight`） |
| `@lezer/highlight` | `tags` | `notaHighlight` 里认的那些 tag |

**两条自制件，都只用 CSS 变量**（`notaHighlight` / `notaTheme`）：颜色一律
`var(--accent)` / `var(--doc-fg)` / `var(--font-mono)` 这种，**不写死色值**。
理由是那条老规矩——**文档主题要能改编辑区里的一切**，而写死的色值主题改不动。
⚠️ 唯一的例外是 `t.processingInstruction` / `t.contentSeparator` 这类"标记本身"
的灰度，用 `var(--fg-faint)`。

**命令怎么跑：** `applyCommand()` 把 `EditorCommand` 白名单里的**全部 33 个值**
实现成**文本操作**（加粗 = 在选区两侧插 `**`；引用 = 给每行加 `> `；表格 = 插一张
空表……）。这不是"顺手多做了一点"——**故意做全是为了不产生第二张会漂移的表**：
只要有一个模式不支持某条命令，就得维护一份"哪个模式支持哪些命令"的清单，
而那种表必然在下次加命令时忘掉一半。做全了，那张表就不需要存在。

⚠️ 两处刻意的**不对称**，别当 bug：

- **加前缀时跳过空行，清前缀时不跳**（`setLinePrefix`）。给一片含空行的选区
  加 `> ` 会让空行变成 `> `，那种"看起来什么都没变但存盘多了一堆 `> `"的结果
  比少做一点更难解释；而清的时候必须连空行一起扫，否则残留下半截。
- **`setMarkdown()` 在文本相同时直接返回**。否则每次推预览都会派一笔事务、
  把撤销栈冲掉——用户在外面按 Ctrl+Z 会发现"撤销没了"而不是"撤销了一步"。

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
| effect 的依赖数组是 `[doc.id, mode, strict]`，**刻意不含 `doc.text`** | `doc.text` 是**初始值**，不是要跟随的状态（跟随它会每次同步都重建编辑器）；`mode` 变 = 换编辑器（§3.1）；`strict` 变 = 解析口径变了，手里这份还是按旧口径解析的（§2.1c）。⚠️ **两个写作开关刻意不在里面**——它们走 `setWritingModes`，拨开关不重建实例（§4.4） |
| `disposed` 标志 + `handle.destroy()` | React 19 StrictMode 下 effect 会跑两遍：第一遍的实例如果已经建好了，这一遍就得拆掉，**不然页面上会有两个 ProseMirror** |
| 卸载时清掉待执行的去抖定时器 | 不然组件没了还会 `api.doc.sync` 一次 |
| 卸载时**再从活着的实例读一次文本**存进 `latestRef` | 去抖窗口里那最后一截（打完字不到 300ms 就切模式/换文档）只在编辑器里，丢掉它 = 用户亲眼看着刚打的字消失 |

`handle.focus()` 在建好之后立刻调一次；`ready` 为假时显示「正在准备编辑器…」。

⚠️ 这一整套（React 不碰编辑区 DOM）**存在的理由就是保护 IME 组合态**。
中文输入的 IME 组合态**已由用户实测通过**（2026-09-23，`docs/07` BUG-5），
⚠️ 但那条判据是**用户在真机上打的**——本仓的无头目检流程**验不了它**
（裸 Xvfb 没有输入法，`xdotool` 喂不进多字节，见 `docs/06` §5）。
所以**改这里的任何东西之后，中文输入要请人再打一遍**，别拿"没看见报错"当通过。

### 3.1 三种编辑模式

用户 2026-09-23 拍的顺序是「先重做菜单，**然后三种编辑模式**，然后 slidev 插件」。
模式的取值落在 `settings.view_mode`（`ViewMode`，`docs/03` §设置），
编辑区按它摆一到两个窗格：

| `view_mode` | 左 | 右 | 谁的话算数 | 编辑器 |
|---|---|---|---|---|
| `wysiwyg`（默认） | 所见即所得 | — | Milkdown | `createEditor()` |
| `source` | Markdown 原文 | — | CodeMirror | `createSourceEditor()` |
| `split` | 原文（可编辑） | 预览（**只读**） | **CodeMirror** | 左边同上 + 右边 `createEditor({readOnly: true})` |

三条口径，改之前先读懂：

① **切模式 = 换实例，不是复用。** ProseMirror 的撤销栈与 CodeMirror 的完全不是
一回事，硬接只会得到一个"撤销会跳到另一个编辑器的历史里"的怪物。所以模式一变，
`EditorPane` 的 effect 重跑、旧实例 `destroy()`、新实例拿 `latestRef` 里的文本重建。
代价是**撤销栈跨模式会清空**——这是有意的，宁可清空也不要错乱。

② **分屏单向：源码 → 预览，预览从不回写。** 理由是往返会改字——Milkdown 把
Markdown 解析成文档树再序列化回来未必逐字节相同（尾段、空行、标记写法都会被
规范化，BUG-12 的根因候选之一）。互推的话用户的原文会被另一侧"改写"，而且每推
一次都可能再规范一遍。所以预览窗格是**只读**的，这既是产品选择也是正确性要求：
**界面上不假装那边能改**。落地保证有两处，缺一不可——

- `createEditor({readOnly: true})`：ProseMirror 的 `editable: () => false`
  （管的是"能不能编辑"），并且 `create.ts` 的 listener 对只读实例**一律不报变化**；
- 预览那个窗格**不接 `onChange`、不 `settle`、不 `focus`**，它就是显示端。

⚠️ **"往返会改字"这件事，2026-09-24 起有一处例外要记住**：宽松模式不再靠
"解析前改文本"来认标题，所以 `#标题` 这类写法**存盘逐字节不变**（`docs/03` §5.5）。
剩下会改字的仍是那些本来就有的规范化（尾段、空行、标记写法）。⚠️ 反过来说，
**只有一处已知的反向改字**：用户手打的 `\#标签` 会丢掉反斜杠（同上）。

③ **去抖有两个，不是一个。** 推给后端仍是 `SYNC_DEBOUNCE_MS = 300`（§5.1）；
推给**右边的预览**是 `PREVIEW_DEBOUNCE_MS = 150`——它是本地的、不跨 IPC，
没必要跟后端一样慢，而 150ms 已经足够把"每个字符都重解析一遍整篇文档"挡掉。

⚠️ **源码模式不 `settle`。** `settle` 的语义是"接受编辑器的规范化结果"，
而 CodeMirror **不做任何规范化**——它手里就是原文。所以 `EditorPane` 里那一步
判的是 `mode === "wysiwyg"`。源码模式下这不是"跳过了一个可能有益的步骤"，
而是"这一步根本没有意义"。

⚠️ **焦点在右边的预览里时，快捷键仍然算编辑器的。** 判据是
`accel.ts::isOutsideEditor()` 里的 `el.closest(".editor-pane")`——两个窗格都在
`.editor-pane` 底下，所以"在编辑区里"这件事对它们一样成立，命令照旧发到左边那个
**权威**编辑器的光标处。这和"点菜单按钮时焦点在按钮上、命令仍然生效"是同一条口径
（`create.ts::runCommand` 跑完会 `focus()` 把焦点交回去）。

---

## 4. `EditorHandle`：对外十一条

```ts
export interface EditorHandle {
  getMarkdown: () => string;
  setMarkdown: (markdown: string) => void;
  focus: () => void;
  runCommand: (name: EditorCommand, payload?: CommandPayload) => boolean;  // 2026-09-23 加；2026-09-24 开始返回布尔
  destroy: () => void;

  /* 查找五条（2026-09-24 加，`docs/07` 第 4 项）。两种模式都有。 */
  setFind: (query: string, options: FindOptions) => void;
  findStep: (方向: 1 | -1) => void;
  clearFind: () => void;
  replaceCurrent: (text: string) => boolean;
  replaceAll: (text: string) => number;

  /* 写作模式（2026-09-24 加，`docs/07` 第 6 项）。⚠️ 是"改"，不重建实例。 */
  setWritingModes: (模式: 写作模式) => void;
 }
```

⚠️ **`runCommand` 的返回值是"这条命令在这条通路上有没有实现"**，不是"运行成功了没有"：
所见即所得那边 `switch` 走到底，恒 `true`；源码那边表格那十条与"没填地址的链接/图片"
给 `false`。调用方（`App.tsx`）据此决定要不要提示用户，**别让按钮按下去毫无反应**。
理由见 §4.1。

| 方法 | 语义 | 实现 | 实际调用点 |
|---|---|---|---|
| `getMarkdown()` | **取当前 markdown 文本**（序列化 `view.state.doc`，走 `serializerCtx`） | `editor.action(...)` | `App.tsx::saveDoc()`（存盘前**强制同步一次**，§5.1 对策②）、`copyAsMarkdown()` |
| `setMarkdown(md)` | **整篇替换**，底层是 `editor.action(replaceAll(md))` | 同步执行 | `App.tsx` 收到 `nota:document-changed` 且 `origin === "plugin"`、以及 `reloadDoc()` 命中活动文档时。⚠️ `create.ts` 的注释说它还用于"打开文件"——**那条路走的是重挂组件**（`key={doc.id}`），并没有调它 |
| `focus()` | 把焦点交给编辑区 | `editorViewCtx.focus()` | `EditorPane` 挂载完成后 |
| `runCommand(name)` | 跑一条编辑命令 | 见 §4.1 | **三条入口都汇到 `menuHandlers`**：自绘菜单点选、快捷键命中（查表）、原生菜单事件（`nota:native-menu` → `resolvePick` → `menuHandlers`）。`Ctrl+1..6` / `Ctrl+0` 走的就是这里 |
| `runCommand` 的返回值 | **这条命令在这条通路上有没有实现**（见 §4.1） | 所见即所得恒 `true`；源码模式表格那十条与没填地址的链接/图片给 `false` | `App.tsx` 的 `menuHandlers`——拿到 `false` 就 toast 一句，别让按钮按下去毫无反应 |
| `setWritingModes(模式)` | **拨专注/打字机**。走事务元，**不重建实例、不进撤销栈** | `editor.action(设写作模式)` | `EditorPane` 那个 `[focusMode, typewriter]` 的 effect（§4.4）。⚠️ 建实例那一刻还没有 handle，所以那一刻是空跑——由 `createEditor({writingModes})` 的**初始值**兜住 |
| `setFind(query, options)` | 设查询与三个开关。**空串 = 关掉高亮**（不动光标） | 见 §4.3 | `App.tsx::找` ← `ui/FindBar.tsx` 的 `onQuery` |
| `findStep(方向)` | 跳下一个（`1`）/上一个（`-1`） | 同上 | `FindBar` 的 Enter / Shift+Enter / ↑ / ↓ |
| `clearFind()` | 清掉查找状态与全部高亮 | 同上 | `App.tsx::关查找`（关条子时） |
| `replaceCurrent(text)` | 替换当前命中。**没停在任何命中上时返回 `false`** | 同上 | `FindBar` 的「替换」；`App.tsx` 拿到 `false` 就 toast |
| `replaceAll(text)` | 全部替换，**返回换了几个** | 同上 | `FindBar` 的「全部替换」；`App.tsx` 据此报「替换了 N 处」 |
| `destroy()` | **销毁**。组件卸载时**必须**调，否则 ProseMirror 的 DOM 监听会留着 | `editor.destroy()` | `EditorPane` 的清理函数、以及 StrictMode 那一遍 |

⚠️ **别的模块不要直接去摸 `editorViewCtx` 里的 state**（`create.ts` 文件头的原话）。
要加功能就再加一条，别把命令式通道开成两道。

⚠️ **源码模式那个句柄（`SourceHandle`，`editor/source.ts`）是照着这张表对齐的**：
十一条同名同义，所以 `EditorPane` 里一个 `handleRef` 能装两种实例，`App.tsx`
那边完全不需要知道当前是哪种模式。

⚠️ **对齐是"必须对齐"而不是"顺手对齐"**：`EditorPane` 的 `EditorPaneHandle`
把十一条**原样转发**给当前那个 handle（见 `ui/EditorPane.tsx`），少一条就是
"切到源码模式后查找条整个失灵"这种毛病——而且 `tsc` 会拦住，不会漏到运行时。

⚠️ 两个 handle 类型上的差别只有一处是刻意的：`getMarkdown()` 在源码那边是
**真·同步取值**（它本来就是读一个字符串）。⚠️ **存盘前那次强制同步靠它**，
不能是 Promise。

⚠️ **`CreateOptions.readOnly`**（`create.ts`）是给分屏右侧预览用的，两件事必须
同时成立才算只读，缺一件就是个"看着只读、其实在偷偷改文档"的怪物：

1. `editorViewOptionsCtx` 里 `editable: () => !readOnly`——管 DOM 能不能编辑；
2. listener 里 `if (readOnly) return`——**只读实例一律不报变化**。

第 2 条尤其别省：预览的文本是**别人推给它的**，它报变化会让调用方以为"用户改了
文档"，进而把预览的规范化结果当成正文回写——那正是 §3.1 里说的往返改字。

⚠️ 用 `editable` 而**不是**别的什么"禁用"：禁用会让内容变灰、还会吞掉选择与复制，
而预览窗格恰恰要能选中、复制。

### 4.1 `EditorCommand`：一张**白名单**联合类型

```ts
export type EditorCommand =
  | "undo" | "redo"
  | "bold" | "italic" | "inlineCode" | "strike"
  | "h1" | "h2" | "h3" | "h4" | "h5" | "h6"
  | "text" | "quote" | "ul" | "ol" | "task" | "codeBlock" | "hr" | "table"
  | "link" | "image" | "clearFormat"                       // 2026-09-24 加
  | "tableRowAbove" | "tableRowBelow" | "tableColLeft" | "tableColRight"
  | "tableDelRow" | "tableDelCol" | "tableDel"
  | "tableAlignLeft" | "tableAlignCenter" | "tableAlignRight";   // 同上，表格十条
```

⚠️ **一共 33 条**（2026-09-24 从 19 条涨到 33 条）。**查找/替换那五条刻意不在里面**
（它们在 `EditorHandle` 上，见 §4.3）——那个联合类型是**编辑动作**的白名单，
作用在文档上、会进撤销栈；而查找是**视图层状态**（高亮是装饰）。
混进来的话，"查找下一个"会出现在遍历命令表的代码里，而它根本不是那一类东西。

⚠️ **不是"随便什么命令名都能传"**。任意的命令名字符串从菜单传进来，等于把一个 `any`
形状的入口开给界面层——写错了不报错、只是没反应。列成联合类型，**写错就是编译错**。

⚠️ `h1`~`h6` 走**同一族**命令（`wrapInHeadingCommand` 带层数参数），在 `runCommand`
里拆开，所以这里列六个而不是一个 `heading` 加参数。

⚠️ **命令不认识时静默无操作**（返回 `false`）。界面那边本来就该保证只派发白名单里的值，
真走到 `default` 分支是代码写错了，而"按一下没反应"比"抛个异常打断编辑"更不打扰人。
⚠️ 但**"这条通路没有实现"要如实报 `false`**——这两件事不是一回事：
前者是"命令名不合法"，后者是"命令是合法的，源码模式的文本框里做不出来"。
后者必须让用户看见一句提示（见 §4 那张表的注）。

⚠️ 全仓**唯一**一处 `$view`（代码块 NodeView）不在这个通道上——它自己处理 DOM 事件。
另外**行内标记**（`**`、反引号）也不在这里，那是 `docs/07` 第 39 项要动 schema 的活。

⚠️ **菜单栏里已经有不属于这张表的项了**：`ui/commands.ts` 是「菜单项 → 动作」的**全表**，
而其中只有一部分会落到 `EditorCommand` 上。判据是**那件事是不是在改编辑器里的东西**——
例如 2026-09-23 加的 `view.slidev`（开 Slidev 预览窗）**不在** `EditorCommand` 里，
它的处理函数在 `ui/useSlidev.ts`：它开的是一个**另一个 OS 窗口**、动的是**磁盘上的入口文件**，
跟 ProseMirror 的 state 一点关系都没有。
⚠️ 2026-09-24 起这条命令**前面还多一步**：先弹「装没装」的面板（`ui/SlidevPanel.tsx`，
探测走 `api.slidev.probeInstall`）——那一步更和编辑器无关（它连正文都不看），
**不要**因为"菜单项越来越多"就把这类命令收进 `EditorCommand`。硬塞进这张白名单只会让"这条命令到底改不改文档"
变得说不清。同理 `file.*` / `theme.*` / `view.toggleSidebar` 那一批也都不在这儿。

⚠️ **工具栏那几颗按钮 2026-09-24 起带上了图标**（`ui/Icon.tsx`）。那是**长相**，
与这条通道无关：每颗按钮照样只把一条 `EditorCommand` 交给 `runCommand`，
白名单不加、不改。哪些是图标、哪些还是字形（`H1` `引` `任`）、无障碍名字怎么派生，
都写在 `docs/04` §2.9——**别把"按钮长什么样"写进这里**。


### 4.2 正文区挂的是 `id="write"`

```ts
ctx.update(editorViewOptionsCtx, (prev) => ({
  ...prev,
  attributes: { ...(typeof prev.attributes === "function" ? {} : prev.attributes), id: "write" },
}));
```

**这个 id 是给文档主题留的支点**：主题 CSS 里的裸元素规则（`h1`、`body`、`a`…）
会被收拢到正文那棵树上（见 `styles/doc-theme.ts`）。

⚠️ **收拢的目标已经换过一次了。** 上一版兼容 Typora 主题时用的是**这个 `#write`**
（Typora 给正文区的 id，我们照抄挂上去）；2026-09-23 那一版作废之后，改用的是
**`.editor-pane`**——它是我们自己的编辑区外壳，连左右留白一起盖住，比 `#write` 更宽一圈。
**`#write` 这个属性留着没删**（它无害，而且是「我们曾经照着 Typora 的 DOM 契约做」的记号），
但**限域逻辑不再看它**，别顺手拿它去当选择器锚点。

⚠️ 走 `editorViewOptionsCtx` 而**不是**建完之后去改 DOM：ProseMirror 重建 view 时
只会重放这里的属性，手动改的那一下会丢。
⚠️ `attributes` 的类型允许是**函数**形式，这里只可能是对象形式，所以先归一化再展开。

### 4.3 查找与替换：**一套匹配逻辑、两个适配器**（`editor/find.ts`）

`docs/07` 第 4 项。查找在**两种模式里都要能用**，而两边的编辑器和数据结构完全不同
（ProseMirror 有文档树、CodeMirror 手里只有一段文本），所以拆法只有一种是对的：

| 层 | 在哪 | 干什么 |
|---|---|---|
| 匹配（**唯一一份**） | `find.ts::在文本里找匹配`（纯函数，输入 `text` / `query` / `FindOptions`，吐区间数组） | 大小写、全词、正则三条开关的**全部**语义 |
| 适配 A（所见即所得） | `find.ts::算匹配`：`doc.descendants` 逐文本节点调上面那个 | 把文档树的节点偏移换算成文档绝对位置 |
| 适配 B（源码） | `source.ts` 的 CM 状态字段：对整篇文本调上面那个 | CodeMirror 的偏移**本来就是文档偏移**，不用换算 |

⚠️ **"唯一一份"是这条设计的全部要点**。各写一份的话，症状是"同一个词在两种模式里
命中数不一样"——正则那一档尤其容易分叉，而用户在界面上**没有任何办法判断哪边对**。

⚠️ **命中数是编辑器报上来的，查找条自己不数**（`FindBar.tsx` 文件头的原话）。
`FindStatus` 三个字段（`query` / `total` / `current`）走 `onFindStatus` 回调，
经 `EditorPane` 的 ref 读交给 `App.tsx`。查找条只画不猜。

⚠️ **装饰，不是文档改动**：命中的底色走 `Decoration.inline`（`nota-find-hit` /
`nota-find-current`，底色是 `theme.css` 里的 `--find-hit` / `--find-current`）。
它们**不进文档、不进撤销栈**——所以 Ctrl+Z 撤的是用户真改过的字，不是高亮。
⚠️ 单独两个变量而不是复用 `--accent`：高亮要盖在**正文**上，两者在暗色下的
合适值差得很远。

⚠️ **替换是文档改动**（它真的写进文档、真进撤销栈），所以它走事务而不是装饰；
`replaceCurrent` 在"光标没停在任何命中上"时返回 `false`，`App.tsx` 据此提示
「光标没停在命中上，先按「下一个」」——**不是**静默什么都不做。

⚠️ 查找条右边那颗 ×（关掉查找）2026-09-24 起是图标（`folio-close-symbolic`），
不再是字符 `×`。**只换长相**：`aria-label` 原来就有（「关闭查找」），
点击走的那条路一个字没动。图标那一套见 `docs/04` §2.9。

### 4.4 写作模式：专注与打字机（`editor/writing-modes.ts`）

`docs/07` 第 6 项。两条都是**视图层的写作辅助**：不改文档、不进撤销栈、不影响存盘的字节。

**专注模式压暗的是兄弟，不是"除了我以外的所有块"**：

```text
从光标那一层往上走（$from.depth → 1）
  每一层：把同层的块级兄弟压暗（Decoration.node + class="nota-dim"）
  所在的那一条链一律不压
```

⚠️ 另一种写法（"所有顶层块压暗、当前那块加个亮 class"）**嵌套就错了**：
`opacity` 不会因为子元素又亮回来而恢复，父块被压到 0.32，里面的当前块最多也只能是 0.32。
按兄弟压暗则天然正确：**被压暗的块永远不包含光标**。
⚠️ 只压**块级**兄弟（`child.isText` / `isInline` 跳过）：段落里的文本节点之间
没有"兄弟块"可言，而 `Decoration.node` 的语义就是"给一个节点加属性"。

**打字机模式把光标那一行滚到容器正中**：

- 容器**不写死选择器**（`找滚动容器`）：所见即所得那边滚的是 React 那个空 div
  （`.editor-mount`），源码那边滚的是 CodeMirror 自己的 `scrollDOM`。
  写死一个，另一种模式就会静默不滚——而"不滚"看起来跟"没做这个功能"一样。
- ⚠️ **只在光标动了或者文档变了的那一次滚**（`view.update` 里判的条件）。
  每次事务都滚的话，改个窗口大小、点一下鼠标都会把正文拽走，比不滚更烦。
- ⚠️ 偏差小于 1px 就不动：滚动本身触发重排，抖来抖去会让打字有明显迟滞感。

⚠️ **拨开关不重建实例**（`setWritingModes` 走事务元）：重建会丢撤销栈和光标，
而这两个开关恰恰是"写到一半才想去拨"的东西。

⚠️ **源码模式那边的装饰只有一颗**。CodeMirror 里内容是**平的行**（`.cm-line`），
没有块级父子，所以那边改成"根节点挂 `nota-focus`、当前行挂 `nota-focus-on`"，
压暗交给 CSS 的 `:not()`——装饰数**不随文档长度增长**，这是刻意的。

---

### 4.5 导出与打印：**同一条渲染路径**（`editor/export.ts`）

导出 HTML 时**不另找 Markdown 库**，而是用 §4 里那个 `readOnly` 选项**再建一个
Milkdown 实例**：`createEditor({ root, initialMarkdown, strict, readOnly: true })`，
挂在**屏幕外**（`left: -99999px` + `visibility: hidden`），解析 + 渲染完把
`.ProseMirror` 的 `innerHTML` 摘下来，然后 `destroy()` + `root.remove()`。

⚠️ **这是"导出 = 所见"的唯一实现方式**。换一个 Markdown 库的话，"屏幕上什么样"
和"导出什么样"就是两套实现，各自都"对"——漂移了没有哪一边会报错。
更细的一条：摘的**必须是渲染后的 DOM**，不是文档树。文档树那条路
（`DOMSerializer`）会丢掉两样用户看得见的东西：宽松模式下 `#标签` 的标题外观
（那是 `Decoration.node` 的 `nodeName`，**装饰不在文档树里**），以及任务项的方框。

⚠️ 摘之前要在**还挂着的 DOM 上**把编辑时的零件清掉（类名 `nota-` 开头的、
`data-srcmark` / `contenteditable` 这类属性、`.nota-code-bar` 整块）——它们是
交互零件，在导出文件里既没有 CSS 也没有用处。**在 DOM 上清，不用正则洗 HTML**：
正则会被正文里恰好出现 `contenteditable` 这几个字这类意外绊倒。
⚠️ 那个离屏挂载点用 `visibility: hidden` **不是 `display: none`**：ProseMirror
建实例时要量 DOM（行高、`coordsAtPos`），`display: none` 下量出来全是 0。

⚠️ **两种导出**：不含样式那份**连 class 都不带**（贴进别的系统再加工）；
含样式那份嵌 `editor.css`（`?inline`，**和编辑器同一份字节**）＋**限域后的**
文档主题。外面那几层 class（`.editor-pane` > `.editor-mount` > `.milkdown` >
`.ProseMirror`）**必须照着编辑区的 DOM 摆**——那份 CSS 的作用域要求，摆错了
症状是"CSS 在、但哪条都没命中"。

⚠️ **打印不是 `window.print()`**：WebKitGTK 的打印对话框在容器里点不出来、
而且它不是同步返回。我们的做法是"导出含样式的那份 + 交给系统默认程序打开"，
由用户在那边的界面里按 `Ctrl+P`——提示里**两步都说**，不假装在应用里完成了。
落点由后端按文档目录决定（`commands/export.rs`），因为正文里的 `![](./img.png)`
是相对路径。

### 4.6 数学公式：physics 宏包怎么进 KaTeX（`editor/math-macros.ts`，2026-09-24）

一句话链路：**设置里那个开关 → `EditorPane` 的 `physics` 属性 → `createEditor` 的
`options.physics` → `ctx.set(katexOptionsCtx.key, katexOptionsFor(physics))` → KaTeX 查表**。

⚠️ **三个"改了不会报错但会静默失效"的点**：

1. **`ctx.set` 的第一个参数是 `katexOptionsCtx.key`，不是 `katexOptionsCtx`**。
   后者是个**插件对象**（`$Ctx` = 插件 + `key`），传错的症状是宏表根本没进去、
   而 `\qty` 渲染成一串红字——这一条**正好被 TypeScript 挡住**（类型不匹配编译不过），
   所以它现在只能靠读代码看懂，别哪天把 `key` 删了"简化"一下。
2. **`physics` 必须进 `EditorPane` 那个 effect 的依赖**（和 `strict` 同理）：
   它换的是**交给 KaTeX 的那份宏表**，而 KaTeX 是**渲染那一刻**查表的。
   不进依赖的话，用户拨了开关得先切一次文档才生效——那种"设置像没生效"的毛病
   最难被当成 bug 报上来。
3. **源码那一侧没有 `physics`，而且不该有**：CodeMirror 只显示 Markdown 原文，
   一个字都不渲染（`CreateSourceOptions` 里没有这一项，传了编译不过）。
   ⚠️ **分屏右侧那个只读预览要有**——它也走 `createEditor`，两边解析口径不一致的话
   分屏左右会各显示一个样。

⚠️ **宏表是我们自己写的，不是"装了个扩展"**：KaTeX 官方没有 physics，
`katex-physics`（2019）**刻意没引**（无 LICENSE 文件）。表里 **108 条**，
每条配一个可渲染样例。**支持的族与做不到的写法逐条列在 `docs/10` §12.1**——
加宏之前先读那张"做不到"的表，里面那三条根因（参数要带花括号、可选参只能用
`\renewcommand`、星号不被吃掉）决定了哪些写法根本写不出来。

⚠️ **`\ce` / `\pu` 与这个开关无关**：它们来自 KaTeX 自带的 `contrib/mhchem`，
文件顶上那句 side-effect import 就是干这个的（**别删**）。

⚠️ **验法**：`tools/menu-harness` 的 `#math` 场景把每条宏真渲染一遍，
包括"关着时哪些还能渲染""`\braket` 两个方向的元数变化""`\div`/`\Re`/`\Im`
确实被重定义""坏公式渲染成错误而不抛"。**加一条宏必须同时加一条样例**。

### 4.7 「打开再存，字节变了」这一族（2026-09-24 实测，修了两条、记了三条）

用户定的死规矩是「**如果关闭，存盘不要自动修复**」（宽松档是默认）。这一档
**没有自己的代码**——它靠的是"序列化时别乱改"，而序列化在
`remark-stringify` 手里（`create.ts` 里 `remarkStringifyOptionsCtx` 那一段）。
2026-09-24 拿真实的 `createEditor` 进→出跑了一遍，**五种字节能被动**：

| 进去 | 出来 | 状态 |
|---|---|---|
| `- 甲` | `* 甲` | ✅ **已修**：`bullet: "-"` |
| `---` | `***` | ✅ **已修**：`rule: "-"` |
| `甲␠␠` 换行 | `甲\` 换行 | ⚠️ 遗留：两种都是合法硬换行，但字节确实动了 |
| `#   标题` | `# 标题` | ⚠️ 遗留：缩进被吃掉 |
| 表格空单元格 | **字面 `<br />`** | ⚠️ **遗留且最刺眼：这是往文件里加内容**（列宽也被重算） |
| `==高亮==`、`[TOC]`、`文字[^1]`、`> [!NOTE]` | 各被加一个 `\` 转义 | ⚠️ 遗留：Typora 的行内语法我们**不认识**，于是当普通文本转义 |

⚠️ **别把"已修"理解成"这一族解决了"**：剩下那四条要自己写序列化 handler
（`<br />` 那条尤其），不是调一个选项的事。**逐条记在 `docs/07` §4**，
带复现步骤。

⚠️ **判据不要写成"跑一遍 `getMarkdown` 看不看得见"**——这一族的症状是
**字节**级别的一字之差，只有真的比字符串才看得见。`docs/06` 里那份探针就是干这个的。

### 4.8 图片：一个上游疏漏导致**存盘丢图**（`editor/image-attrs.ts`，2026-09-24）

⚠️ **这条是 P0，症状是数据丢失**：打开一份带 `![图](a.png)` 的文档、存盘，
**图片从文件里消失**（不是画不出来，是字节里连 `![](...)` 都不剩）。
不带 title 的中招、带 title 的没事——这一条对照就是根因的指纹。

根因在 `@milkdown/preset-commonmark`：image 节点三个属性都写成
`validate: "string"`，而它自己的解析器把 mdast 的 `title: null` 原样递进来，
校验不过 → 节点被解析器默默跳过。**同一个包里的 link 写的是
`validate: "string|null"`，所以只有图片有病**——是上游少写了一个 `|null`。

补法：`image-attrs.ts` 挂一个 `$remark` 插件，在 **mdast → ProseMirror 之前**
把 image 上的 `null` 抹成 `""`。⚠️ 三个必须记住的点：

1. **必须在 `.create()` 之前挂**，建完实例再挂等于没挂（转换就发生在建实例时）。
2. **只读实例也要挂**——分屏预览和导出同样会把 markdown 变成文档，
   不挂的话**导出 HTML 里的图会少**（而正文里看着是好的，最难查）。
3. **不给"上游哪天修了"留坑**：真修了，这个插件变成一段不命中任何东西的多余代码，
   那时删掉即可（判据写在它自己的文件头上）。

⚠️ **`docs/10` 里"插入图片有了"那句话在 2026-09-24 之前是错的**：插入本身一直是好的，
**是"插进去 → 存盘 → 再打开"这条链会丢**。这正是 `docs/10` §10 第 3 条
「点过才算数」要防的那种"有代码、链子断了"。

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
⚠️ **只有所见即所得模式走这一步**（`mode === "wysiwyg"`）：`settle` 的语义是
"接受编辑器的规范化结果"，而 CodeMirror 不做任何规范化，原文进原文出——
源码模式下这一步没有意义，见 §3.1。

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
| `nota.ui.register_panel` | 一份**启动时声明、之后一直成立**的状态 | **拉** | registry `nota_panels` → `nota_plugin_panels` ✅（内容另走 `nota_plugin_panel_content`，见下） |
| `nota.ui.register_menu` | 同上 | **拉** | registry `nota_menus` → `nota_plugin_menus` ✅ **2026-09-24 起塞进菜单栏了**：前端合出一栏「插件」插在「帮助」前（`ui/pluginMenus.ts`），条目 id 是合成的 `__plugin:<插件>:<命令>`，走的是既有的 `menuHandlers` / `resolvePick` 那条老路（`docs/07` 第 42 项） |
| 插件自己的 `nota.event.emit(x, …)` | 多半是**数据**（Git 的改动列表之类） | **推** | `plugin:<id>:x` ⚠️ 前端仍然没有订阅插件频道，见 `docs/07` 第 17 项 |

⚠️ **面板内容为什么是第三条路**（2026-09-24 补）：面板**清单**是状态（拉一次就够），
但面板**内容**（`render` 的返回值）会变——git 的改动列表每次都得现问 git。
所以内容既不进 `panels()` 的快照，也不靠事件推：
`api.plugin.panelContent(plugin, id)` 是**去重拉**（`nota_plugin_panel_content`），
而 `nota:plugin-panel` 那条事件**只是失效信号、一个字节的内容都不带**
（频道名在 Rust 侧是 `plugin/mod.rs::EVENT_PANEL_DIRTY`，**两处必须字面一致**）。
判据：**把那条事件丢掉，打开面板仍然是对的内容。**

**判据一句话：声明是状态 → 拉；发生是事件 → 推。**

⚠️⚠️ **原来的两条为什么必错**（不是"忘了写订阅"）：`register_panel` / `register_menu`
在**插件加载时**跑（`setup()` 阶段），前端的 `listen()` 在**挂载之后**才注册——
时序上必漏；而且 Tauri 对没有监听者的频道 `emit` 是**静默成功**的，
日志里连痕迹都没有，界面看着好好的只是永远空着。
**成对取消的另一件事**：`nota_frontend_ready` 里原计划的"记账 + 重放"**已作废**——
重放会让面板清单有两个真相源，漏一次就静默分叉（详见 `docs/07` 第 16 项与 BUG-13）。
那个命令保留，但用途缩小成"WebView 从这一刻起能收事件了"。

⚠️ **第 17 项（Git 插件的数据没人消费）2026-09-24 结清了，但结法不是"去订阅"。**
当时记的前提是"要显示改动列表就得有一条订阅插件频道的前端通道"——**那个前提是错的**：
改动列表也是**状态**，所以它该被拉（`render` 里现调 `nota.git.status()`），
**一行订阅代码都不需要**。⚠️ 但 `plugin:<id>:<name>` 这条**数据**通道
**本身没有问题**，它对**发生类**数据仍是正解，缺的只是前端订阅——
**别因为第 17 项结了就把这条通道一起"拉"掉。**

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
3. **ATX 标题**：对 `trimStart()` 后的行跑 `atxPrefixRe(strict)` / `atxTextRe(strict)`
   （**判据在 `editor/atx.ts`**，见 §2.1c——宽松时 `#标题` 也算，严格时要 `# 标题`），
   命中后 `trim()` 并剥掉收尾的 `#+\s*$`，空文本跳过；
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
| 8 | 分屏的预览**只读、且从不回写**——别给它接 `onChange`，那是回声 | §3.1 |
| 9 | 只读实例要**两件事都做**（`editable: () => false` + listener 早退），少一件就是"看着只读、其实在改文档" | §4 |
| 10 | 源码模式**不 `settle`**（CodeMirror 不规范化），别"顺手补上" | §3.1、§5.1 |
| 11 | 切模式是**换实例**，撤销栈跨模式会清空——那是故意的 | §3.1 |
| 12 | 加前缀跳过空行、清前缀不跳；`setMarkdown` 文本相同时直接返回（否则冲撤销栈） | §2.5 |
| 13 | 导出**必须走编辑器自己那条渲染路径**，且摘的是**渲染后的 DOM**；摘之前要清掉 `nota-` 开头的交互零件 | §4.5 |
| 14 | 打印**不是** `window.print()`（容器里点不出来、也不同步）——是"导出 + 交给系统默认程序" | §4.5、`commands/export.rs` |
