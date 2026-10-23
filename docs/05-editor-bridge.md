# 05 — 编辑器桥：Milkdown 装配、双向通道与大纲

> 最后同步：2026-10-23

本文讲**编辑区那一半**：为什么是 ProseMirror 系、`src/editor/create.ts` 到底装了什么、
**三种编辑模式**（所见即所得 / 源码 / 分屏，见 §3.1 与 §2.5）、React 与编辑器的边界画在哪、
前端↔后端两条通道各自的方向与去抖、以及 `src/ui/outline.ts` 那份启发式的误差。

⚠️ 先读 `docs/03-data-structures.md` §真相在哪——本文的每一条通道都建立在
"**前端是文本的唯一真相、后端是 300ms 去抖的镜像**"之上。

---

## 1. 为什么是 ProseMirror 系（Milkdown）

**不是**"textarea + 高亮装饰"——编辑区的语义是**文档树**，不是"带样式的文本缓冲"。

在文档树上这些都是一等节点，在文本缓冲上则要一层层拿文本偏移去近似，且每次编辑都可能
算错：

- 表格拖列宽；图片定尺寸；
- 嵌套列表的层级；
- 脚注引用；
- 任务项勾选。

那几样看起来"琐碎"的功能，**正是文本缓冲方案最先失效的地方**。

选 Milkdown 作为文档树的具体形态，是因为它底下就是**裸 ProseMirror**：将来某个节点要
下沉到 PM 原语（自定义 schema、自定义 plugin），这条路是敞开的。`create.ts` 刻意不做
任何项目自有的封装——对外只给五个方法（§4）。

⚠️ 与 Folio 的对照：Folio 的编辑区是 WebKitGTK 6 里的 `contenteditable`（宿主才是真相）；
Nota 是 **WebKitGTK 4.1 里的 ProseMirror 文档树**（前端是真相）。两条结论不能互相照搬。

---

## 2. 装了哪些、刻意没装哪些

全部装配在 `src/editor/create.ts::createEditor()` 的 `Editor.make().use(…)` 链上。
⚠️ **2026-10-07 起那条链搬去了 `src/editor/assemble.ts`**（第 89 项；`create.ts` **1006 → 502 行**）：
对外的名字仍是 `createEditor`，但「一次性把一切装上去」那一段（`.config()` ＋ 整个 `.use()` 链、
ctx 初值、序列化器、输入规则、NodeView）现在在 `assemble.ts::装配()` 里，收**一个参数对象**。
⚠️ **顺序就是语义**（`$inputRule` 先中者赢、schema 登记与解析转换器的先后、`handlePaste` 按插件顺序问）——
搬的时候一字未改，改顺序之前先把那一条注释读完。本节的表与下面的行号**仍按同一条链读**，只是落点换了文件。

⚠️ **2026-10-07 同日**：`source.ts` **1048 → 637 行**——「一条命令落到文本上」那一块搬去了
`src/editor/source-commands.ts`（对外只有 `applyCommand` 一个名字；**它一句都不 import `source.ts`**，
反过来才是依赖，不然是环）。

### 2.1 装了的

| 来源 | 名字 | 干什么 |
|---|---|---|
| `@milkdown/kit/core` | `rootCtx` / `defaultValueCtx` / `editorViewCtx` / `serializerCtx` / `parserCtx` | 只用到 ctx 键，用来在 `.config()` 里设挂载点与初始文本，以及在句柄里取序列化器/解析器 |
| `@milkdown/kit/preset/commonmark` | `commonmark` | CommonMark 的节点与标记（标题、列表、引用、代码块……）。⚠️ 2026-09-26 起**不是整包挂上去的**：`commonmark` 是个**扁平数组**（`lib/index.js` 那句 `[schema, inputRules, markInputRules, commands, keymap, plugins].flat()`），所以 `create.ts` 里用 `.filter()` **摘掉了单条 `wrapInHeadingInputRule`**（"打 `# ` 那一下立刻变标题"），理由见 §4.9 |
| `@milkdown/kit/preset/gfm` | `gfm` | GFM 扩展：表格、删除线、任务项、自动链接 |
| `@milkdown/kit/plugin/history` | `history` | **撤销栈**。`App.tsx` 没有绑 Ctrl+Z，撤销完全由它自己的键盘处理负责 |
| `@milkdown/kit/plugin/listener` | `listener` + `listenerCtx` | 文档变化回调的挂点（§5.1） |
| `@milkdown/kit/plugin/cursor` | `cursor` | **拖放指示线 + gap 光标**（`dropCursorConfig` / `gap-cursor`），不是"光标样式" |
| `@milkdown/kit/plugin/clipboard` | `clipboard` | 剪贴板的序列化/反序列化 |
| `@milkdown/kit/plugin/indent` | `indent` | 列表里按 Tab/空格缩进的快捷键（`indentConfig` 可配 `type` / `size`，**没配**，走默认） |
| `@milkdown/kit/plugin/trailing` | `trailing` | 文末按 `trailingConfig.shouldAppend` 补一个节点（默认段落），保证末尾能落光标 |
| `./instant-render`（**本仓**） | `instantRender` | 光标所在块的 Markdown 标记（`##`/`>`/`-`/围栏）淡化画在块左边。**这是本仓最早一个自己写的 ProseMirror 插件**（2026-09-24 起同族又多了 `find` 与 `writing-modes`，见下） |
| `./task-list`（**本仓**） | `taskList` | 任务项的复选框：画方框 + 点它勾上 + **回车切出来的新项不继承勾**。⚠️ **不改 schema**——DOM 钩子（`data-checked`）是 `preset-gfm` 本来就给的 |
| `./code-block`（**本仓**） | `codeBlockView` | 代码块那两处挂件：块**内部**右下角的「复制 / 折叠」，加**块下边框之外**右侧的语言下拉。⚠️ 走 `$view`（NodeView），**全仓第一个**（2026-09-26 起同族的还有 `diagram-view.ts`）——它要加的是真的会交互的元素，`Decoration` 那种只读装饰做不到。⚠️ 两个挂件在 DOM 里是 `pre` 的两个**兄弟子节点**（`.nota-code-bar` 与 `.nota-code-lang-wrap`），都不进 contentDOM；`stopEvent` / `ignoreMutation` 用一条 `inChrome` 把**两个都包住**（2026-09-25 语言框从 bar 里搬出去之后，只判 bar 会把点下拉当成"点了编辑区"）。⚠️ 那颗控件**外面套了一层 `span`**（`.nota-code-lang-wrap`）——它是箭头与弹层的**锚**，箭头画在包裹层上而不是控件自己身上。<br>⚠️ **控件 2026-09-25 从 `<select>` 换成了 `<button>`**，因为原生弹层里放不下图标（`<option>` 只能装纯文字）；下拉弹层改由 `editor/lang-picker.ts` **自绘**，挂在 `document.body` 上、**不在编辑器 DOM 里**，所以 PM 的 `stopEvent` / `ignoreMutation` 看不到它，`inChrome` 不必再扩。⚠️ 换来的两条义务：① `destroy()` 里必须 `销毁()`（没人替它收弹层）；② 送给它的"当前语言"要读**活的节点引用**，不能闭包 `initialNode`——否则闭合框会倒退回旧语言（2026-09-25 实测）。图标那半在 `editor/lang-icon.ts`。<br>📌 **2026-10-06（第 101 项）：这一格多了一层——代码块里那段文本现在由 CodeMirror 编辑**（`editor/code-block-cm.ts`）。所以 `stopEvent` / `ignoreMutation` 的判据从"三个挂件"放宽成**整个 `pre` 子树**（`inChrome` 不再够用），并且多了一条 `setSelection` 把键盘进来的光标交给 CM；`destroy()` 还要连 CM 一起销毁。全貌见 **§4.24** |
| `./find`（**本仓**） | `查找插件` | **查找/替换**的高亮与选中（`docs/07` 第 4 项）。⚠️ **只读观察者**：命中走 `Decoration.inline`、命令走事务元，**从不改文档** |
| `./overtype`（**本仓**） | `覆写插件` | **覆写模式**（2026-10-16 加，朋友清单第 12 条「INSERT 键无法使用」）：`Insert` 切开关、开着时敲一个字顶掉右边那一个。⚠️ **开关住在插件 state 里**（`PluginKey<boolean>`）、**不进文档、不进撤销栈**——所以它跟 `command-state.ts::签名` 是一对（见 §4.27）。⚠️ 只在可编辑实例上挂 |
| `./writing-modes`（**本仓**） | `写作模式插件` | **专注模式**（压暗兄弟块）+ **打字机模式**（把光标那行滚到正中）。同上只读：装饰 + 元，不进撤销栈。⚠️ **专注的外壳那一半不在编辑器里**（菜单栏/侧栏/插件栏/标签栏/状态栏那五条由 `ui/useImmersive.ts` ＋ `app.css` 收），见 §4.4 |
| `./lax-heading`（**本仓**） | `不转义行首井号` | **序列化那一半**（两种模式都挂）：不往用户写的行首井号上加反斜杠。⚠️ **2026-09-26 显示层那一半（`宽松标题显示`）删掉了**——非严格模式下 `#你好` 就是普通正文，字号、行距、位置一个都不变（用户连着报两次，最后一句是「应该作为标识符的 `#` 不要变换位置和大小」）。见 §2.1c |
| `@milkdown/kit/utils` | `replaceAll` | `setMarkdown` 用的整篇替换（§6） |
| `@milkdown/plugin-prism` | `prism` | 代码块高亮 |
| `@milkdown/plugin-math` | `math` | 数学公式（KaTeX）：节点是 `math_inline` / `math_block`。⚠️ **这个包一个 NodeView 都没有**（`toDOM` 只把源码交给 `katex.render` 画出来），而且两个节点的**源码不在同一个地方**——`math_inline` 在**节点的内容**里、`math_block` 在 **`attrs.value`** 里。⚠️ **不改它的结果就是「敲进去的字静默丢掉」**（屏幕上写着、`toMarkdown` 交出去是空）。补视图的是本仓的 `./math-view`（§4.6b） |
| `@milkdown/plugin-diagram` | `diagram` | ```mermaid 代码块 → `diagram` 节点（它的输入规则 `/^```mermaid$/` **是打完那几个字母当场成块**的）。⚠️ 这个包**自己不画图**——`toDOM` 只有一句 `dom.textContent = code`，一处 `mermaid.render` 都没有；画的那一半是本仓的 `./diagram-view`（§4.10） |
| `./heading-on-enter`（**本仓**） | `标题回车成块` | **标题"回车才成块"** ＋ 输入期给井号后面那段文字加粗；2026-09-30 起**宽松档（`#你好`）与严格档走完全同一条路**——没按回车只加粗，按了回车才成块。见 §4.9 与 §4.9c |
| `./table-input`（**本仓**） | `表格输入规则` / `表格输入` | 敲表头行 ＋ 分隔行 → 回车吃成一张真表格（此前只能用菜单插）。⚠️ 它和 `heading-on-enter` 都要处理"回车"，所以两边的守卫里各有一条绕开对方的地盘 |
| `./table-tab`（**本仓**） | `表格Tab` | **表格里的 `Tab` / `Shift+Tab`**（2026-10-04，`docs/07` 第 55 项 ②③）：⚠️ 上游 `preset-gfm` 的 `tableKeymap` **已经绑了这两颗键**，这一条只接它**撂挑子**的两种现场——**最后一格 `Tab`**（在下面加一行、光标进新行第一格）与**第一格 `Shift+Tab`**（**吃掉这颗键**：不吃的话焦点会静默飞出编辑器，接着打的字落到别处）。⚠️ 表格之外一律放行（`Tab` 照旧缩进）。⚠️ 排在 `配对处理` **后面**、`indent` **前面**——见 §4.21 |
| `./diagram-view`（**本仓**） | `diagramView` | 图表块的 NodeView：把源码画成图，并且还能改源码。⚠️ **第二个 `$view`**（第一个是 `code-block.ts`） |
| `./math-view`（**本仓**） | `mathView` ＋ `公式当前` | 公式那两个节点的视图：点一下就地改（半透明 `$` / `$$` 标出输入位置）。⚠️ **第三个 `$view`**，而且是**唯一一个 `.use()` 收数组的**（两条线：`公式当前` 管"当前是哪一块"、`mathView` 管怎么画）。见 §4.6b |
| `./video-view`（**本仓**） | `视频视图` | **图片语法里的地址指向视频时画成播放器**（2026-09-28）：`![](a.mp4)` 不再是一颗破图标。⚠️ **第四个 `$view`**（前三个是 `code-block.ts` / `diagram-view.ts` / `math-view.ts`），判据只看**地址后缀**且复用 `editor/file-kind.ts` 的 `后缀()`。⚠️ 它**不改 schema**：源码与存盘那条路一个字节没动。⚠️ 尺寸那条 CSS 在**文档主题**里也有一份（导出会摘掉 `nota-` 类名），见 §4.8c |
| `./math-input`（**本仓**） | `公式输入`（两条输入规则）＋ `公式块回车`（一个 `$prose` 按键钩子） | **公式的打字规则**（`:use()` 收数组，两条）：敲 `$$x$$` 或 `$x$` 当场变成一颗 `math_inline`。⚠️ 换掉了 `@milkdown/plugin-math` 那条 `mathInlineInputRule`——它**认不出 `$$…$$`**，用户敲到 `A$$bb$` 那一下尾巴就够匹配了，等他补最后一个 `$` 已经是另一段文字；所以 `create.ts` 把上游那条**按引用 `.filter()` 掉**（与标题那一条同一个手法）。⚠️ **2026-10-04 又摘掉第二条**：上游 `mathBlockInputRule`（`/^\$\$\s$/`）是「`$$` ＋**一颗空格**」就当场建出一块**空的**公式块——它自己的注释写的是 "press **enter**"，实现跟注释不符（用户拿 Typora 截图点的就是这条）。现在「建块」退回**回车**（`公式块回车`，判据在 §4.6c）。见 §4.6c |
| `./math-delim`（**本仓**） | `标美元数` ＋ `行内公式规格` ＋（`create.ts` 的 `.config()` 里那条）`inlineMath` 处理器 ＋（**2026-10-04 起**）`不转义美元`（套在 `handlers.text` 上） | **行内公式用几个 `$`，存盘照原样写回去**（2026-09-27）：敲几个存几个（用户拍的决定，见 §4.6c 那条 ⚠️⚠️）。⚠️ **三处缺一不可、缺哪一处都静默失效**：解析那趟一个 `$remark` 标注插件（照**源码偏移**数开头几个 `$` → mdast 的 `data`）、`math_inline` 规格**多一个 `dollars` 属性**＋两个 `runner` 搬它、序列化按这个数**选上游现成的那条处理器**（`mathToMarkdown({singleDollarTextMath:false})`）。⚠️ ⛔ **别拿 `mathInlineSchema.extendSchema` 去改那份规格**——`@milkdown/plugin-math@7.5.9` 自己嵌了一份 `@milkdown/utils@7.5.9`，那份 `extendSchema` 会把节点**挪到 `nodesCtx` 末尾**（顶层那份才是就地替换），所以这里用的是顶层 `$nodeSchema`。⚠️ 代价：`math_inline` 从此**有** `attrs` 了。⚠️ **2026-10-04 加的第四格**：上游给**正文里每一颗 `$`** 都加了一颗反斜杠（`价格 100$ 起` ⇒ `价格 100\$ 起`），`不转义美元` 把它放回来——判据与代价见 §4.17 ⑥。⚠️ **2026-10-04 加的第五格 `收严公式`：当天加了、当天撤回**（用户拍板）。那一条的判据是「**值紧挨着空格的 `$…$` 不是公式**」（照 Typora），判据函数叫 `值挨着空白`，解析与打字两侧共用它。撤回的经过与代价见 §4.17 ⑦——行为**回到上游默认**：**任何 `$…$` 都是公式**。判据在 `tests/math-delim.test.ts`（**47 条**，第九组记的就是"撤回之后照旧算公式"；`tests/math-input.test.ts` 里也有一组同口径的） |
| `./math-commands`（**本仓**） | 无（不是插件，是**一张表和三个纯函数**） | **LaTeX 命令的候选表与判据**（2026-10-04，用户第三条要求「加 LaTeX 命令补全」）：`建命令表(有physics)` 交出候选／`找当场(源, 光标)` 认出光标正踩着的那半个命令（含"前面几颗反斜杠"的奇偶判据）／`挑候选(表, 词, 上限)` **只做大小写不敏感的前缀匹配**（不做模糊匹配）／`套用(源, 光标, 当场, 条)` 交出"源码框该换成什么"。⚠️ 表是**手写的**（`\frac` 那一列 ＋ 10 条 `常用`），physics 那 216 条**从 KaTeX 的宏表推**（参数个数取 `#n` 的**最大下标**）。⚠️ **`\div` 在两处同名**（手写表的除号 vs KaTeX physics 的散度），有 physics 时**后者顶掉前者**——这是"少一条提示"的有意代价，见 §4.6d |
| `./math-suggest`（**本仓**） | 无（不是插件，是**弹窗那一棵 DOM 树**） | **命令候选弹窗**（2026-10-04）：建元素、跟着输入换内容、↑↓ 选、回车/Tab 收、点一条也收、Escape 只收弹窗。⚠️ **挂在公式自己的 NodeView 那棵树里**、绝对定位——不像 `lang-picker.ts` 那样挂 `document.body`（理由见 §4.6d：白拿主题变量、不必算屏幕坐标、**假 DOM 跑得动**）。⚠️ 这一层**不碰文档**：算出来的新源码通过 `收下后` 交回 `math-view.ts`，写回仍然只有那一个口子 |
| `./mark-hint`（**本仓**） | `markHint` | **行内标记的提示**：光标落在加粗/斜体里时，把那两个 `**` / `*` 半透明画在那段文字左右。⚠️ `Decoration.inline` ＋ `::before`/`::after`，**不插 widget**、不动 schema、一个字节都不写回。⚠️ **只给可编辑实例挂**（`readOnly ? [] : [markHint]`）——挂到只读实例上，分屏预览会多出 `**`、导出文件会被带进去。见 §4.11 |
| `./atom-space`（**本仓**） | `原子后的空格`（**包一层 `handlers.text`，不是 `.use()` 的那一串**） | 敲在**行内原子节点**（公式、图片、硬换行）后面的空格按回普通空格——WebKit 在那儿会插 **U+00A0**。⚠️ 挂在 `create.ts` 的 `.config()` 里、与 `不转义行首井号` **套在同一份 `handlers.text` 上**。⚠️ **不能拦在编辑器里**（那颗空格会丢），**也不能挂 `$remark`**（转换器一次都不会被调用），两版失败见 §4.11 |

⚠️ 除 listener 那条回调外，**这些插件一个都没有做配置覆盖**（`.config()` 里只设
`rootCtx` / `defaultValueCtx` / `listenerCtx`）。所以它们的行为完全由上游版本决定，
升级 Milkdown 时这一屏是最可能变的。

⚠️ **`instantRender` 是把东西"只改显示、不改文档"地画到编辑区上的例子。**它走 ProseMirror 的 `Decoration`——**这是硬约束不是选择**：
直接 `appendChild` 的东西会被 ProseMirror 重绘时冲掉。将来任何"想给某个节点加个角标/
背景/浮层"的需求都走同一条路。⚠️ 而且**只用 `Decoration.node`，不能用 `Decoration.widget`**
（块边界上的 widget 落点不可控，出过问题，见 `docs/02` 那一节与 `docs/07` §4）。

### 2.1b 两条自制路径，判据只有一条

| 路径 | 机制 | 什么时候用 |
|---|---|---|
| 只改**显示**、不加元素 | `Decoration`（`instant-render.ts` / `find.ts` / `writing-modes.ts`） | 加角标、背景、浮层、高亮、压暗——只要不指望它接事件 |
| **这个节点由我来画** | `$view` NodeView（`code-block.ts`、`diagram-view.ts`、`math-view.ts`、`video-view.ts`） | 要加 **`<select>` / `<button>` 这类真的会交互的元素**时。widget 是只读装饰，点它、让它持有焦点、让它开下拉都不是它的职责 |

⚠️ **NodeView 的三条契约**（`code-block.ts` 里全用上了，缺一条就出怪现象）：

- `dom` / `contentDOM`：`contentDOM` 是**ProseMirror 只许动这一块**的那个子节点，
  其余部分（那条按钮栏）由这个 NodeView 自己管。
- `stopEvent`：事件一进来就拦下（点、按键、滚轮）。没有它，PM 会把"点在 `<select>` 上"
  当成"用户点了编辑区"去挪光标。
- `ignoreMutation`：已经发生的 DOM 变更要不要告诉 PM。⚠️ **少了它，"复制"按钮把文字改成
  「已复制」这件事会被 PM 当成"用户在编辑区里改了东西"**，于是它去重解析，**光标当场飞走**。
  这两条是**两件事**，不能合并。

⚠️ 还有一条类型上的坑：`$view` 收的是 `$Node | $Mark`，而 `codeBlockSchema` 是
`$NodeSchema`（"schema 定义 + 那个 node"的合成体）——**要传 `codeBlockSchema.node`**，
传它自己过不了 `tsc`。

### 2.1c ⚠️ 「什么算标题」：**一处判据、两种模式、一个字节都不改**

严格模式（`Settings.strict_markdown`，默认 `false` = 宽松）改的不是"解析器怎么解析"，
而是**四处判据里的哪一套**：

| 判据在哪 | 宽松（默认） | 严格 |
|---|---|---|
| `editor/atx.ts`（**唯一判据**，正则在这里） | `#标题` 算标题 | 井号后必须有空格才算 |
| `editor/lax-heading.ts`（序列化：不转义行首井号） | 两种模式**都装**（同一条规律：Nota 不往用户写的井号上加反斜杠） | 同左 |
| ~~`editor/lax-heading.ts`（显示层装饰）~~ | ❌ **2026-09-26 删掉了**：原来给段落套一层 `h1`~`h6` 的 DOM 让 `#标签` 按标题排版，用户连着报两次（第二次带截图，`# 你好` 与 `#你好` 两行同字号），最后一句是「应该作为标识符的 `#` 不要变换位置和大小」——于是**非严格模式下 `#你好` 就是普通正文，字号、行距、位置一个都不变**。⚠️ **取消的只有长相**："认不认宽松井号"这件事照旧（`atx.ts` / 源码模式 / 大纲 / 后端 `strip_atx` 四处都按宽松口径走） | — |
| `editor/source.ts`（源码高亮） | 同宽松口径 | 同严格口径 |
| `ui/outline.ts`（大纲） | 同宽松口径 | 同严格口径 |
| `src-tauri/src/document/title.rs::strip_atx`（标签页标题） | 同宽松口径 | 同严格口径 |

⚠️ **前四个调用点都得往 `atx.ts` 问，第五个是 Rust 侧的同构实现**——两边的判据
必须一起改，只改一边的症状是"正文里是标题、标签页却显示「未命名」"。

⚠️⚠️ **宽松模式一个字节都不改**（用户 2026-09-24 定的死规矩，原话
「如果关闭，存盘不要自动修复」）。落地方式是**结构性的**：`#你好` 在文档树里
**就是个普通段落**（所以序列化必然把它原样吐回来）。⚠️ 2026-09-26 之前，
标题的样子来自 `Decoration.node` + `nodeName` 的**显示层装饰**；那一层已按
用户要求删掉（见上表），但"字节不变"这条**反而更硬了**——现在连显示层都
不碰文档树。⚠️ 想在这里加"补个空格让解析器认它"的念头，先读
`lax-heading.ts` 的文件头——第一版就是那么做的，被否了（那一版存盘存下去的是
补过空格那份）。

⚠️ **序列化那半还有一处补丁**：`lax-heading.ts::不转义行首井号` 包了 remark 的
`text` 处理器，把 `\#标签` 里那个**多余的反斜杠**去掉——不加这一步，存盘会把
`#标签` 写成 `\#标签`，那也是"用户没打过的字"。**两种模式都装**，
规律才是一句话「Nota 不会往用户写的井号上加反斜杠」。边界、为什么收得紧、
以及一处已知的残留改字，见 `docs/02` 那一节与 `docs/03` §5.5。

⚠️ **改 `strict` 等于换挂哪些插件**——所以它在 `ui/EditorPane.tsx` 那个挂载 effect
的依赖里，切模式是**把编辑器整个重建**（手里那份还挂着旧模式的插件，改不动）。

⚠️ **后端那半有两个入口，都得在**：开机时 `lib.rs` 把 `settings.strict_markdown`
从**构造参数**传进文档仓（`DocumentStore::new(strict)`，忘就编译不过——2026-09-24
之前那一步是漏的，见 `docs/02` 的 `state.rs` 一节）；用户在界面上拨开关时由
`nota_settings_set` 调 `set_strict_markdown()` **当场重算已打开文档的标题**。
⚠️ 两边漏一个的症状都是「正文按一种口径、标签页按另一种」，**不报错**。

### 2.1d ⚠️ 严格模式的**第二条差异**：量下来「这条行为已经在」（第 47 项，2026-10-04）

严格模式那份口径（Typora 论坛那句"严格模式与宽松模式有两条差别"）列的是**两条**：
① 井号后必须有空格（= §2.1c，**已做**）；② **列表内的缩进对齐更严格**。
第 47 项就是 ②，在 backlog 上挂了很久，挂的理由是"动手前得先定判据"。

⚠️ **2026-10-04 量完了，结论是这条没有可改的东西**（判据 `tests/list-indent.test.ts`，**16 条**，
真 `remark-parse` ＋ `remark-gfm` ＋ 真两台状态机）：

| 问题 | 量到的 |
|---|---|
| `10. aaa` 后面接 2 格 `1. ccc` | **不是子列表**（那一行成了同级项，编号被顺排成 `11. ccc`） |
| 接 4 格 | 是子列表（4 = `10. ` 的内容首列） |
| `- aaa` 后面接 2 格 `- bbb` | 是子列表（内容首列是 2）；接 1 格不算 |
| 序列化缩几格 | `1.` / `10.` / `100.` ⇒ **3 / 4 / 5** 格（标记宽 2 / 3 / 4） |

**所以那两条猜的判据路都够不着它**：

- 改 schema 里 `list_item` 的 content 表达式：**够不着**——它的 content 是
  `paragraph block*`，**里面没有"缩到第几格"这个量**；`1. aaa` 接 2 格与接 3 格
  **解析出的是同一棵树**（那个缩进在树里根本不存在）。
- 在 `Enter` 上挂一条命令：**同样够不着**，理由一样，而且这只管打字。

缩进是 **`mdast-util-to-markdown` 在序列化那一刻**按"标记宽度 ＋ 1"算出来的，
本仓一行代码没参与。**"只在严格模式下生效"做不到、也不该做**：宽松那一档要"不生效"，
就得**故意放宽解析**（缩进不到内容列也算进列表），那是新造一个和 CommonMark 不一样的
解析器；而严格那一档的行为**已经无条件成立**，加开关不会多出任何一个字节的行为。

⚠️ **一处比 Typora 严格档宽松的地方如实记**：`1. aaa` 后面接 2 格 `bbb`，Typora 严格档
说"不在同一列表里"，Nota 把它当**同一段落的续行**（CommonMark 的懒续行）。要在这里变严
就得判死懒续行——**改的是解析结果，而且字节照样会变**（那一行仍会对齐到 3 / 4 格），
**只有代价没有收益，不修**。

⚠️ **顺带量出来三条"打开再存，字节变了"**，已记进 §4.7 / `docs/07` 第 56 项第 ⑤ 条
（`1.` 加 2 格续行 ⇒ 3 格；`10.` 加 2 格 ⇒ 4 格；`10.` 后面 2 格的 `1. ccc` ⇒ 顺排成 `11.`）。

⚠️ **同批新开第 92 项**：设置页上「默认缩进」与「对齐缩进」两格**没有任何消费者**
（字段、默认值、界面、类型都在，`src/` 与 `src-tauri/` 里没有一处读它们），
而「对齐缩进」的说明文字说的**正是本项要的那条行为**。

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
   不是因为被谁捎带进来的——"结果看起来一样"不等于"原因一样"。
3. **版本不同步是现状**：`@milkdown/kit` 与 `plugin-prism` 是 `^7.22.1`，
   而 `plugin-math` 是 `^7.5.9`。这不是笔误——那几个包的发版节奏跟 kit 不一样。
   ⚠️ `plugin-diagram`（`^7.7.0`）**2026-10-04 退役**（第 27 项）：它只做"围栏→节点/schema/输入规则/命令"
   那四件不含 mermaid 的小活，却在模块顶把 mermaid 静态打进首屏；那四件搬进本仓
   `src/editor/diagram-node.ts`（判据逐行照抄上游），`package.json` 里那一行删掉了。
4. **`refractor` 也属于"必须显式列"那一类**（2026-09-22 加）：`plugin-prism` 的高亮引擎是
   `refractor`，而本仓要自己补语言表（理由与 2026-10-04 改成**异步加载**的经过见 §2.3），
   所以它从"别人的传递依赖"变成了本项目**直接使用**的包，`package.json` 里必须有一行。
   **判据就一条**：只要 `src/` 里出现一句 `import "x"`，`x` 就该在 `package.json` 里——
   哪怕它本来就躺在 `node_modules` 里。**"能跑"和"依赖写对了"是两件事**，前者会误导：
   间接依赖哪天被上游换掉，报错的是引用了它的代码。

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

`lib/all.js` 才是全量那份（**297 种**）。

⚠️ **2026-10-04 起补全量的方式是异步的**（第 27 项）：原先是 `create.ts` 里一句
副作用 import `import "refractor/all"`，它把 507 kB 静态压进主包；现在改到
`code-block.ts` 顶层的 **`import("refractor/all")`**——模块一进来就发起请求、
不阻塞首屏，到了之后清掉语言下拉那份缓存。全量表没到之前，高亮与下拉用的是
common 那 62 种（比老文案写的 36 多，`refractor` 上游涨过）。

**为什么晚注册也能生效**：两边是**同一个单例**（都从 `refractor/lib/core.js` 取那一个
`refractor`），而且 `plugin-prism` 读语言表是**惰性**的——
`getBlockDecorations(node, pos, refractor, languages = refractor.listLanguages())`
里那是**默认参数**，每次重算都要现取。

⚠️ **一条如实记着的时序**：长尾语言（不在 common 里）的代码块，在"冷启动第一帧
还没到"时可能先显示为纯文本——prism 的装饰只在 `docChanged` 时重算；编辑那个块、
或改任意代码块，整篇重算就发生了。判据与来路写在 `code-block.ts` 的加载块上。

实测：`import "refractor/all"` 之后 `listLanguages()` 从 4 涨到 **400**——
297 种语言**加上别名**（`ts`→`typescript`、`sh`→`bash` 这类各算一个名字）。

**代价是包体**：`index-*.js` 从 1373 kB 涨到 1881 kB（gzip 419 → 604 kB）。
这是**有意换的**：桌面应用没有下载时间这一说，而"我要的语言不在列表里"是
插件作者和用户都会撞上的问题。真要缩小时再改成按需 import，
但那时要自己维护依赖顺序（比如 `php` 必须排在 `markup-templating` 之后，
`cilkc` 必须在 `c` 之后）。

⚠️ `refractor` 里**没有 `vue`**（`registered("vue")` 返回 `false`）——
Prism 的 vue 语言在另一个包里，**全量注册不等于什么都有**。

---

### 2.4 **刻意没装**的（和装了的一样重要）

| 没装的 | 它是什么 | 为什么现在不装 |
|---|---|---|
| `slash` | 斜杠菜单（`/` 唤起命令面板） | **交互层面的便利**。先装它们会在**交互口径还没定下来时**就被它们的默认行为绑住 |
| `block` | 块手柄（左侧六点、拖动整块） | 同上 |
| `tooltip` | 悬浮工具提示（链接预览等） | 同上 |
| 任意 Markdown→HTML 库 | 导出时把正文转成 HTML 用的 | **导出走编辑器自己那条路**（建一个只读实例、摘它渲染出来的 DOM，见 §4.5）。再装一个库就等于第二套渲染实现，两边迟早长得不一样 |
| Pandoc | 转 Word / ODT / LaTeX / Epub / PDF | ⚠️ **2026-09-25 改口径（原文是「不装它，那几项因此仍是 `⬜`」）**：作为**库**仍然不装（没有 `pandoc` 这个 crate 可装，它本来就是外部程序），但**系统里已经有的那个会用**——探测 → 借它转那七种（`src-tauri/src/pandoc.rs`）。判据是用户那句「你可以让他自己寻找系统的 pandoc，别人也是这么做的」：**不内嵌、不下载、不替用户装**，也不存它的路径（`docs/10` §11.2 那条窄口径） |

这三个在 `docs/10` §3 的矩阵里最显眼：那一节的「斜杠菜单」一行就是 `⬜` +
一句"`create.ts` 里**刻意没装** `@milkdown/plugin-slash`"。逐项状态以 `docs/10`
的矩阵为准，排期看 `docs/07` §3（**第 3 项**"插入菜单"与它最接近）。

⚠️ "没装"不等于"没影响"：**富文本工具栏**（粗体/斜体按钮）不是编辑器插件，
它是外壳的一部分，目前也还没有。

### 2.5 源码模式装的（CodeMirror 6）

上面那一整套是**所见即所得**那一半的装配。源码模式（`src/editor/source.ts`）
用的是另一家：**CodeMirror 6**——它本身就是"文本缓冲 + 高亮"，而源码模式要的
正是"**不动原文**"，所以这里不需要也不该有解析/序列化往返。

| 来源 | 名字 | 干什么 |
|---|---|---|
| `@codemirror/state` | `EditorState` | 状态容器。⚠️ `EditorState.readOnly.of(readOnly)` 走这里 |
| `@codemirror/view` | `EditorView` / `keymap` / `drawSelection` / `placeholder` | 视图。⚠️ `EditorView.editable.of(!readOnly)` 是**另一件事**——它管 DOM 能不能改，`readOnly` 管事务能不能派发，两个都要给 |
| `@codemirror/commands` | `defaultKeymap` / `historyKeymap` / `history()` | 键位表与撤销栈。**这是源码模式唯一能用的历史**（和 Milkdown 的不通）。⚠️ **这两张表要先摘掉与界面快捷键撞车的几条**（`source.ts` 的 `撞车键位`，BUG-26）——CM 只 `preventDefault`、不 `stopPropagation`，不摘就是**同一次按键两边都执行**，实测出四条"按键动了不该动的东西"（最阴的一条：源码模式里 `Ctrl+/` 会把光标那行**套上 `<!-- -->`**）。判据与四条对照表见 `docs/02` §`src/editor/source.ts`；`Alt+↑` / `Alt+↓` **故意没摘**（应用侧那两条还没实现），接上时要回去补 |
| `@codemirror/lang-markdown` | `markdown()` | 按 CommonMark 语法切 token（喂给高亮） |
| `@codemirror/language` | `syntaxHighlighting` | 把 token 映射成样式（`notaHighlight`） |
| `@lezer/highlight` | `tags` | `notaHighlight` 里认的那些 tag |

**⚠️ 上面那两行（`markdown()` 与 `syntaxHighlighting(notaHighlight)`）是成对挂、也可以成对不挂的**
（2026-09-28，`docs/07` 第 86 项）：`CreateSourceOptions` 里那个 `纯文本` 为真时
**两样都不挂**——它由 `ui/EditorArea.tsx` 按 `activeDoc.path` 现算（判据在
`editor/file-kind.ts`：后缀不属于 Markdown 那一族）。⚠️ **要挂一起挂**：只挂配色而
不挂文法的话，`notaHighlight` 里那些 tag 一个都不会命中，结果是"看起来生效了、
其实什么都没变"，下次有人来查会白花时间。⚠️ **关掉是刻意的**：本仓只装了
`@codemirror/lang-markdown` **一门**文法（无网，不许为新功能加依赖），而拿
CommonMark 去染一份 Python **比不上色更糟**——`# 注释` 会变成标题色、`*args`
会变成斜体，那是一幅**错的画**。用户点的「按文件名推高亮语言」因此**没做成**，
如实记在第 86 项 ⑥。

**两条自制件，都只用 CSS 变量**（`notaHighlight` / `notaTheme`）：颜色一律
`var(--accent)` / `var(--doc-fg)` / `var(--font-mono)` 这种，**不写死色值**。
理由是那条老规矩——**文档主题要能改编辑区里的一切**，而写死的色值主题改不动。
⚠️ 唯一的例外是 `t.processingInstruction` / `t.contentSeparator` 这类"标记本身"
的灰度，用 `var(--fg-faint)`。

⚠️ 源码模式的标题 token **只染色，不设字重**。此前那里硬编码 `600`，会让源码
视图里的标题看起来比文档主题真正渲染的标题更粗；现在字重仍归文档主题。所见即
所得的 `h1…h6` 也在 `editor.css` 用零权重规则退回继承，并关闭
`font-synthesis`，避免浏览器在主题未声明粗体时自行伪造。

**命令怎么跑：** `applyCommand()` 把 `EditorCommand` 白名单里的**全部 35 个值**
实现成**文本操作**（加粗 = 在选区两侧插 `**`；引用 = 给每行加 `> `；表格 = 插一张
空表……）。这不是额外多做的部分——**故意做全是为了不产生第二张会漂移的表**：
只要有一个模式不支持某条命令，就得维护一份"哪个模式支持哪些命令"的清单，
而那种表必然在下次加命令时忘掉一半。做全了，那张表就不需要存在。

⚠️ 两处刻意的**不对称**，不是 bug：

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
| 一个**从不重新渲染的空 `div.editor-mount`** 当挂载点 | React 只往里放属性（`--content-width`，⚠️ **2026-10-09 起只在开了「限制正文宽度」时才放**，不放子节点） |
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
所以**改这里的任何东西之后，中文输入要请人再打一遍**，不能拿"没看见报错"当通过。

### 3.1 三种编辑模式

用户 2026-09-23 定的顺序是「先重做菜单，**然后三种编辑模式**，然后 slidev 插件」。
⚠️ 那三件**都已结清**（第三件 2026-09-25 搬成了插件，见 `docs/04` §2.8）。
模式的取值是前端那一个 `ViewMode`（`docs/03` §5.2 末段），
编辑区按它摆一到两个窗格：

⚠️ **2026-10-07 起它不再是设置项**：原来落在 `settings.view_mode`，现在那条字段
已退休（模式改成**会话内状态、不落盘**，每次启动一律 `wysiwyg`）。值是同一批，
"谁的话算数"那几条口径一个字没变——变的只是它**住在哪**（`ui/useFileKindMode.ts`
的 `useState`）与**能不能跨会话记住**（不能）。

| 模式 | 左 | 右 | 谁的话算数 | 编辑器 |
|---|---|---|---|---|
| `wysiwyg`（默认） | 所见即所得 | — | Milkdown | `createEditor()` |
| `source` | Markdown 原文 | — | CodeMirror | `createSourceEditor()` |
| `split` | 原文（可编辑） | 预览（**只读**） | **CodeMirror** | 左边同上 + 右边 `createEditor({readOnly: true})` |

三条口径，改之前先读懂：

① **切模式 = 换实例，不是复用。** ProseMirror 的撤销栈与 CodeMirror 的完全不是
一回事，硬接只会让"撤销跳到另一个编辑器的历史里"。所以模式一变，
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

⚠️ **"往返会改字"这件事，2026-09-24 起有一处例外**：宽松模式不再靠
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

## 4. `EditorHandle`：对外十六条

```ts
export interface EditorHandle {
  getMarkdown: () => string;
  setMarkdown: (markdown: string) => void;
  focus: () => void;
  /* 焦点交回、**并把插入点放到文首**（2026-09-26 加）。⚠️ 与 `focus` 分开是必须的。 */
  focusAtStart: () => void;
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

  /* 就地改动预览（`nota.ui.review_diff`）。⚠️ 按对象身份去重，看法只换 class。 */
  setReview: (预览: 改动预览 | null, 看法: 预览看法) => void;

  /* 大纲跳转（`docs/07` 第 48 项）。⚠️ 两个坐标都要给：源码用 `line`、所见即所得用 `index`。 */
  跳到标题: (目标: { line: number; index: number }) => void;

  /* 当前选中的内容（`ui/useClipboard.ts` 要它）。⚠️ 空选区给 `null`，不是一对空串。 */
  选区: () => 选区内容 | null;

  /* 替插件在光标处落一笔（2026-10-04 加，`docs/07` 第 14 项）。⚠️ 只读实例返 `false`。 */
  插入在光标处: (text: string) => boolean;
 }
```

⚠️ **`runCommand` 的返回值是"这条命令在这条通路上有没有实现"**，不是"运行成功了没有"：
所见即所得那边 `switch` 走到底，恒 `true`；源码那边表格那十条与"没填地址的链接/图片"
给 `false`。调用方（`App.tsx`）据此决定要不要提示用户，**按钮按下去不能毫无反应**。
理由见 §4.1。

| 方法 | 语义 | 实现 | 实际调用点 |
|---|---|---|---|
| `getMarkdown()` | **取当前 markdown 文本**（序列化 `view.state.doc`，走 `serializerCtx`） | `editor.action(...)` | `ui/useDocuments.ts::saveDoc()`（存盘前**强制同步一次**，§5.1 对策②；**自动保存也走它**）、`ui/useClipboard.ts` 的「复制为 Markdown」 |
| `setMarkdown(md)` | **整篇替换**，底层是 `editor.action(replaceAll(md))` | 同步执行 | `App.tsx` 收到 `nota:document-changed` 且 `origin === "plugin"`、以及 `reloadDoc()` 命中活动文档时。⚠️ `create.ts` 的注释说它还用于"打开文件"——**那条路走的是重挂组件**（`key={doc.id}`），并没有调它 |
| `focus()` | 把焦点交给编辑区 | `editorViewCtx.focus()` | `EditorPane` 挂载完成后 |
| `focusAtStart()` | 交出焦点**并把插入点放到文首**。⚠️ 只给"刚打开/刚切到这篇文档"那一次用 | 显式设选区 ＋ `scrollIntoView` | `EditorPane` 装载完调一次。⚠️ 与 `focus` 合并的话，每跑一条菜单命令都会跳回文首——用户 2026-09-26 报的「默认光标位置是会变的」就是这两条机制分家的结果 |
| `runCommand(name)` | 跑一条编辑命令 | 见 §4.1 | **三条入口都汇到 `menuHandlers`**：自绘菜单点选、快捷键命中（查表）、原生菜单事件（`nota:native-menu` → `resolvePick` → `menuHandlers`）。`Ctrl+1..6` / `Ctrl+0` 走的就是这里 |
| `runCommand` 的返回值 | **这条命令在这条通路上有没有实现**（见 §4.1） | 所见即所得恒 `true`；源码模式表格那十条与没填地址的链接/图片给 `false` | `App.tsx` 的 `menuHandlers`——拿到 `false` 就 toast 一句，按钮按下去不能毫无反应 |
| `setReview(预览, 看法)` | **摊开/收起就地改动预览**（`null` 收起）。⚠️ 按**对象身份**去重：只有 `预览` 换了才重算装饰，看法变了只换 class | `editor.action(设预览)` | `EditorPane` 那两条 effect（`plugin.review_diff` / 看法） |
| `跳到标题({line, index})` | 跳到第 `index` 个标题（源码侧用 `line`）。⚠️ 落点是**文本光标不是 NodeSelection**——选整块的话，跳过去打的第一个字会把标题吃掉 | 见 `create-types.ts` 那段长注释 | 侧栏大纲点一下（`ui/Sidebar.tsx` → `App.tsx`） |
| `选区()` | 取当前选中的内容（`{text, html}`）。⚠️ 读的是**编辑器 state 里的选区**、不是 `window.getSelection()`；⚠️ 空选区返回 `null` | `state.selection` ＋ `serializeForClipboard` | `ui/useClipboard.ts` 的「复制」「剪切」 |
| `setWritingModes(模式)` | **拨专注/打字机**。走事务元，**不重建实例、不进撤销栈** | `editor.action(设写作模式)` | `EditorPane` 那个 `[focusMode, typewriter]` 的 effect（§4.4）。⚠️ 建实例那一刻还没有 handle，所以那一刻是空跑——由 `createEditor({writingModes})` 的**初始值**兜住 |
| `setFind(query, options)` | 设查询与三个开关。**空串 = 关掉高亮**（不动光标） | 见 §4.3 | `App.tsx::找` ← `ui/FindBar.tsx` 的 `onQuery` |
| `findStep(方向)` | 跳下一个（`1`）/上一个（`-1`） | 同上 | `FindBar` 的 Enter / Shift+Enter / ↑ / ↓ |
| `clearFind()` | 清掉查找状态与全部高亮 | 同上 | `App.tsx::关查找`（关条子时） |
| `replaceCurrent(text)` | 替换当前命中。**没停在任何命中上时返回 `false`** | 同上 | `FindBar` 的「替换」；`App.tsx` 拿到 `false` 就 toast |
| `replaceAll(text)` | 全部替换，**返回换了几个** | 同上 | `FindBar` 的「全部替换」；`App.tsx` 据此报「替换了 N 处」 |
| `destroy()` | **销毁**。组件卸载时**必须**调，否则 ProseMirror 的 DOM 监听会留着 | `editor.destroy()` | `EditorPane` 的清理函数、以及 StrictMode 那一遍 |
| `插入在光标处(text)` | **替插件在光标处落一笔真 ProseMirror 事务**（`tr.insertText(text, from, to)`）。⚠️ **不抢焦点**——请求来自插件、不是用户。⚠️ **返回值不是「成没成」**：`true` 只代表「事务派出去了」；⚠️ **只读实例返 `false`**（分屏预览/导出用的那一份不许被插件改） | `editor.action(…)` ＋ `view.dispatch` | `ui/useAppEvents.ts` ← `nota:document-edit`（§5.2b）。⚠️ 源码模式那边是同一条路子的 CodeMirror 版（`view.dispatch({changes})`） |

⚠️ **别的模块不能直接去摸 `editorViewCtx` 里的 state**（`create.ts` 文件头的原话）。
加功能的方式是再加一条，而不是把命令式通道开成两道。

⚠️ **源码模式那个句柄（`SourceHandle`，`editor/source.ts`）是照着这张表对齐的**：
十六条同名同义，所以 `EditorPane` 里一个 `handleRef` 能装两种实例，`App.tsx`
那边完全不需要知道当前是哪种模式。

⚠️ **对齐是硬要求，不是顺手为之**：`EditorPane` 的 `EditorPaneHandle`
把十二条**原样转发**给当前那个 handle（见 `ui/EditorPane.tsx`），少一条就是
"切到源码模式后查找条整个失灵"这种现象——而且 `tsc` 会拦住，不会漏到运行时。
⚠️ **转发的是十二条、上面那张表是十六条**：差的那四条（`focusAtStart` /
`setWritingModes` / `setReview` / `destroy`）是**接线与生命周期**的事，
由 `EditorPane` 自己在对的时机调，不往外发（菜单与快捷键不该够得着它们）。

⚠️ 两个 handle 类型上的差别只有一处是刻意的：`getMarkdown()` 在源码那边是
**真·同步取值**（它本来就是读一个字符串）。⚠️ **存盘前那次强制同步靠它**，
不能是 Promise。

⚠️ **`CreateOptions.readOnly`**（`create.ts`）是给分屏右侧预览用的，两件事必须
同时成立才算只读，缺一件就成了"看着只读、实际在改文档"的状态：

1. `editorViewOptionsCtx` 里 `editable: () => !readOnly`——管 DOM 能不能编辑；
2. listener 里 `if (readOnly) return`——**只读实例一律不报变化**。

第 2 条尤其不能省：预览的文本是**别人推给它的**，它报变化会让调用方以为"用户改了
文档"，进而把预览的规范化结果当成正文回写——那正是 §3.1 里说的往返改字。

⚠️ 用 `editable` 而**不是**别的什么"禁用"：禁用会让内容变灰、还会吞掉选择与复制，
而预览窗格正是要能选中、复制。

### 4.1 `EditorCommand`：一张**白名单**联合类型

```ts
export type EditorCommand =
  | "undo" | "redo"
  | "bold" | "italic" | "inlineCode" | "strike"
  | "h1" | "h2" | "h3" | "h4" | "h5" | "h6"
  | "text" | "quote" | "ul" | "ol" | "task" | "codeBlock" | "hr"
  | "mathBlock"                                            // 2026-09-26 加（`docs/07` 第 52 项）
  | "toc"                                                   // 2026-09-27 加：内容目录（`editor/toc.ts`）
  | "table"
  | "link" | "image" | "clearFormat"                       // 2026-09-24 加
  | "tableRowAbove" | "tableRowBelow" | "tableColLeft" | "tableColRight"
  | "tableDelRow" | "tableDelCol" | "tableDel"
  | "tableAlignLeft" | "tableAlignCenter" | "tableAlignRight";   // 同上，表格十条
```

⚠️ **一共 35 条**（2026-09-24 从 19 条涨到 33 条，2026-09-26 第 52 项加了 `mathBlock`，
**2026-09-27 加了 `toc`**）。**查找/替换那五条刻意不在里面**
（它们在 `EditorHandle` 上，见 §4.3）——那个联合类型是**编辑动作**的白名单，
作用在文档上、会进撤销栈；而查找是**视图层状态**（高亮是装饰）。
混进来的话，"查找下一个"会出现在遍历命令表的代码里，而它根本不是那一类东西。

⚠️ **不是"随便什么命令名都能传"**。任意的命令名字符串从菜单传进来，等于把一个 `any`
形状的入口开给界面层——写错了不报错、只是没反应。列成联合类型，**写错就是编译错**。

⚠️ `h1`~`h6` 走**同一族**命令（`wrapInHeadingCommand` 带层数参数），在派发口
（`command-table.ts::跑命令`）里拆开，所以这里列六个而不是一个 `heading` 加参数。
📌 **2026-10-17 起它们是开关**：当前块已经是 H1 时再点 H1（或 `Ctrl+1`）会走
`turnIntoTextCommand` 退回正文；H2 上点 H1 仍然改成 H1，不会错误地退回正文。
源码模式同一判据：选区每行都已经是同一串 `#… ` 时再点同一级会清掉标题前缀。
判据 `tests/heading-toggle.test.ts` **5 条**。

⚠️⚠️ **2026-09-28：命令白名单（`COMMANDS` 表）整块从 `create.ts` 搬去了
`src/editor/command-table.ts`**——搬的原因只有行数一个（那边到 **1010** 行、越过
1000 行硬上限），**内容一个字节没改**。本文件里凡是说"某张表/某条命令在
`create.ts`"的地方，现在指的都是那个新文件；⚠️ **`create.ts` 那边只剩一层薄壳**
（`跑一条命令` → `跑命令(editor, name, payload)`），两个用家（菜单栏那条
`runCommand` 与斜杠菜单）仍然走同一个入口，所以上面说的"焦点交回正文"那件事
**位置没变**——它本来就在 `create.ts` 的 `runCommand` 里，不在表里。

⚠️ **命令不认识时静默无操作**（返回 `false`）。界面那边本来就该保证只派发白名单里的值，
真走到 `default` 分支是代码写错了，而"按一下没反应"比"抛个异常打断编辑"更不打扰人。
⚠️ 但**"这条通路没有实现"要如实报 `false`**——这两件事不是一回事：
前者是"命令名不合法"，后者是"命令是合法的，源码模式的文本框里做不出来"。
后者必须让用户看见一句提示（见 §4 那张表的注）。

⚠️ **`$view`（NodeView）都不在这个通道上**——它们自己处理 DOM 事件（现在有四个：
代码块、图表、公式、视频，清单在 §2.1b 那张表里；⚠️ 这一句原来写的是"全仓**唯一**一处"，
2026-09-28 改对）。
另外**行内标记**（`**`、反引号）也不在这里，那是 `docs/07` 第 39 项要动 schema 的事。

⚠️ **菜单栏里已经有不属于这张表的项了**：`ui/commands.ts` 是「菜单项 → 动作」的**全表**，
而其中只有一部分会落到 `EditorCommand` 上。判据是**那件事是不是在改编辑器里的东西**——
⚠️ 2026-09-25 起这些"不属于"的项里**多了一整类：插件自己声明的菜单项**
（`ui/pluginMenus.ts` 合成的 `__plugin:<插件>:<命令>`，落在「插件」那一栏）。
它们更和编辑器无关——插件可能连正文都不看。
**"菜单项越来越多"不是把这类命令收进 `EditorCommand` 的理由**：把它们塞进这张白名单
只会让"这条命令到底改不改文档"变得说不清。同理 `file.*` / `theme.*` / `view.toggleSidebar` 那一批也都不在这儿。

⚠️ **原来这里举的例子是 `view.slidev`（Slidev 预览），那条命令 2026-09-25 删了**——
预览整个搬进了插件，它的菜单项现在就走上面那条路（**插件仓库** `Nota-plugins` 里 `plugins/slidev/main.lua` 的
`register_menu`，见 `docs/04` §2.8 与 §2.2b）。

#### 4.1b `CommandPayload`：命令的**可选参数**

```ts
export type CommandPayload = {
  level?: number;        // h1..h6：标题层数
  href?: string;         // link：地址
  src?: string;          // image：图片地址
  strict?: boolean;      // toc：照哪套规矩扫标题（2026-09-27 加）
};
```

⚠️ 前三样是"**要插什么**"，`strict` 是"**照哪套规矩扫**"——它不是一类东西，
放在同一个类型里只因为它们都从菜单那一侧传进来。⚠️ **编辑器实例自己不知道这个设置**：
`createEditor` 的选项里 2026-09-26 已经删掉了 `strict`（解析口径改写挂在哪些插件上，
见 §2.1c），所以 `toc` 这一条只能由调用方把 `settings.strict_markdown` 递进来；
**缺省 `false` = 宽松**。⚠️ 判据在 `ui/useCommandTable.ts`（`严格模式` 那一路参数）。

⚠️ **工具栏那几颗按钮 2026-09-24 起带上了图标**（`ui/Icon.tsx`）。那是**长相**，
与这条通道无关：每颗按钮照样只把一条 `EditorCommand` 交给 `runCommand`，
白名单不加、不改。哪些是图标、哪些还是字形（`H1` `引` `任`）、无障碍名字怎么派生，
都写在 `docs/04` §2.9——**"按钮长什么样"不属于本节**。

⚠️ **2026-10-04 起这一排里有一个例外**：右端那颗「收起工具栏」的 ×
（`docs/07` 第 49 项）**不走 `runCommand`**——它不是一条编辑命令，`EditorCommand`
那条白名单里没有它，走命令表就得凭空造一个 id。它直接调 `FormatBar` 自己的
`onHide` prop，落到 `ui/useChromeVisibility.ts` 的 `收起工具栏`
（＝ 菜单「视图 → 格式化工具栏 → 始终不显示」写的那一句 `setChrome`）。
⚠️ 所以"工具栏上的按钮都汇到 `menuHandlers`"这句话**从这一天起要打个括号**：
这一排按钮里数它一个不汇。别的按钮别跟着它走——**凡是动得了文档的，一律还得
走命令表**（那边才有"焦点交给谁""源码模式下这条做不做得到"这套判断）。

⚠️ **行内标记那八条（加粗/斜体/删除线/行内代码/高亮/上标/下标/下划线）在两种
模式下都是「开关」，但判据是两套**（2026-09-30，BUG-57）。所见即所得那边按
**文档树**（`toggleMark`，`command-state.ts` 读得出"当前选区是不是粗体"）；
源码/分栏那边手里只有字符，判据落在**定界符**上——`source.ts` 的
`切换行内标记` 问 `editor/source-mark.ts`「选中的文字是不是已经带着这一对」，
**是就摘掉**、不是才包一层（认不出的嵌套一律**一颗字都不动**）。
「同一条命令、同一个手势」在两种模式下看到的结果一样，靠的是这两处各自的判据，
**没有一份共用实现**——改一边要记得另一边也在回答同一个问题。
⚠️ **链接不在这八族里**：它的右定界符带着地址（`](地址)`），"再插一次链接算不算
开关"要单独拍板，今天仍旧走 `wrapSelection`（只包不摘）。


### 4.2 正文区挂的是 `id="write"`

```ts
ctx.update(editorViewOptionsCtx, (prev) => ({
  ...prev,
  attributes: { ...(typeof prev.attributes === "function" ? {} : prev.attributes), id: "write" },
}));
```

**这个 id 是给文档主题留的支点**：主题 CSS 里的裸元素规则（`h1`、`body`、`a`…）
会被收拢到正文那棵树上（见 `styles/doc-theme.ts`）。

⚠️ **收拢的目标已经换过一次了。** 上一版为兼容外部编辑器主题时，挂的是**这个 `#write`**
（照抄自那种主题给正文区的 id）；2026-09-23 那一版作废之后，改用的是
**`.editor-pane`**——它是 Nota 自己的编辑区外壳，连左右留白一起盖住，比 `#write` 更宽一圈。
**`#write` 这个属性留着没删**（它无害，而且是「曾经照着外部编辑器的 DOM 契约做」的记号），
但**限域逻辑不再看它**，也不能拿它去当选择器锚点。

⚠️ 走 `editorViewOptionsCtx` 而**不是**建完之后去改 DOM：ProseMirror 重建 view 时
只会重放这里的属性，手动改的那一下会丢。
⚠️ `attributes` 的类型允许是**函数**形式，这里只可能是对象形式，所以先归一化再展开。

### 4.3 查找与替换：**一套匹配逻辑、两个适配器**（`editor/find.ts`） ⚠️ **2026-10-06（第 95／105 项）**：① `Ctrl+F` **新绑**（`edit.find`，只开 Find 那一行）、`Ctrl+H` 才带替换行（`useFindBar` 的 `替换行` ＋ `FindBar` 的 `显示替换`）；② 正则开着时**「全词」灰掉且值不参与**（`\b` 做的是同一件事）；③ 查找条的样子按用户那句「不美观」调过：**开关加了静止态**（原来是纯文字、看不出能点也看不出哪颗开着）、**聚焦圈从纯强调色改成淡版**（用 `box-shadow` 不用 border——border 一粗旁边那排开关会跟着挪）、两行间距 3→6px。⚠️ **卡片化（不铺满整行）那一半还没做**：牵动 `review.css` 的两条让位规则与窄窗口那一档，要开窗迭代。

`docs/07` 第 4 项。查找在**两种模式里都要能用**，而两边的编辑器和数据结构完全不同
（ProseMirror 有文档树、CodeMirror 手里只有一段文本），所以拆法只有一种是对的：

| 层 | 在哪 | 干什么 |
|---|---|---|
| 匹配（**唯一一份**） | `find.ts::在文本里找匹配`（纯函数，输入 `text` / `query` / `FindOptions`，吐区间数组） | 大小写、全词、正则、**通配符**四条开关的**全部**语义 |
| 适配 A（所见即所得） | `find.ts::算匹配`：`doc.descendants` 逐文本节点调上面那个 | 把文档树的节点偏移换算成文档绝对位置 |
| 适配 B（源码） | `source.ts` 的 CM 状态字段：对整篇文本调上面那个 | CodeMirror 的偏移**本来就是文档偏移**，不用换算 |

⚠️ **"唯一一份"是这条设计的全部要点**。各写一份的话，症状是"同一个词在两种模式里
命中数不一样"——正则那一档尤其容易分叉，而用户在界面上**没有任何办法判断哪边对**。

⚠️ **偏移那一格有判据了**（2026-10-06 深夜，`tests/find.test.ts` **53 条**，BUG-67 那笔账；第十七组那 5 条是 2026-10-16 加的通配符）：
`算匹配` 吐出来的区间，判据写成 `doc.textBetween(命中.start, 命中.end)` **必须正好等于
用户查的那串字**——⚠️ **不许**只写"命中几个"：那个 off-by-one（`pos + 1 + m.start` 多算
一格）只动"命中压在哪个格子上"，命中数是绿的，只有开窗才看得见（`ABCD` 查 `D` 那颗 D
上一点颜色都没有）。⚠️ 这条规矩对**图里那三个格子**都成立，而它只在适配 A 上有判据；
适配 B（源码那一侧）的区间是 `source-find.ts` 的事，那份测试没覆盖。

⚠️ **命中数是编辑器报上来的，查找条自己不数**（`FindBar.tsx` 文件头的原话）。
`FindStatus` 三个字段（`query` / `total` / `current`）走 `onFindStatus` 回调，
经 `EditorPane` 的 ref 读交给 `App.tsx`。查找条只负责画，不自己数。

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

### 4.3b 滚动：**不许用 `element.scrollIntoView()`**（`editor/scroll-into-view.ts`，2026-09-25）

第 48 项（大纲跳转）那一批撞出来的。**这个文件是"把某个位置滚进视野"的唯一一份实现**，
三种模式共用；`writing-modes.ts` 那个 `找滚动容器` 也住在这里（两份判据已经开始漂，合了）。

| 导出 | 给谁用 | 行为 |
|---|---|---|
| `滚动到位置(view, pos)` | 大纲跳转（`跳到标题`） | 把那个位置的 DOM 元素滚到**视野顶部**（留 8px 间隙） |
| `滚动到可见(view, from, to)` | 查找的命中（`find.ts::选中`） | **只在该看见而看不见时才滚**（上边被切就对齐上边，下边被切就对齐下边） |
| `找滚动容器(el)` | 上面两个 ＋ 打字机模式 | 从元素往上找**第一层真能滚**的祖先；找不到给 `null`（整页在滚） |

⚠️⚠️ **根因：`EditorView.scrollToSelection()` 不认事务里的位置。** 它先读
**浏览器当前选区**（`domSelectionRange().focusNode`），那个节点**不在编辑器里就整段跳过**；
而 `selectionToDOM()` 开头还有一道 `editorOwnsSelection(view)`，焦点不在编辑器里时直接早退。
于是"点侧栏按钮 / 点查找条的输入框"这两种情况下，**该滚的一个都没滚**——
症状是"点一下不动、点第二次才滚"（第二次之所以灵，是因为上一次的 `view.focus()`
已经把 DOM 选区放回正文了）。📌 **同一条根因压着两处**：大纲跳转与查找命中。

⚠️ **两种编辑模式的对齐口径不一样，是刻意的**：

- 大纲跳转用**顶部对齐**（`y: "start"` 那一档的手感，和 VSCode / Typora 一致）；
  源码那边的 `EditorView.scrollIntoView(pos, { y: "start", yMargin: 8 })` 同理
  （⚠️ 事务上那个 `scrollIntoView: true` 只保证"能看见"，往下跳时标题会落在**底边**）。
- 查找命中用**最小滚动**（`滚动到可见`）：查找是连续动作，每敲一个字都重设一次查询，
  顶部对齐会让正文跟着每个字乱跳。

⚠️ **容器不写死选择器**（`找滚动容器`）：所见即所得那边滚的是 React 那个空 div
（`.editor-mount`），源码那边滚的是 CodeMirror 自己的 `scrollDOM`。写死一个，
另一种模式就**静默不滚**——而"不滚"看起来跟"没做这个功能"一模一样。
⚠️ 判据两条都要：`overflow-y` 是 `auto`/`scroll`（否则写 `scrollTop` 白写），
**而且**内容确实超出了（`scrollHeight > clientHeight + 1`）；那个 `+ 1` 是**容差**
不是笔误——亚像素的溢出算不出滚动量，当成"能滚"会让调用方白滚一趟。
⚠️ 源码模式那一侧**从来没坏过**（CodeMirror 自己按行高滚，不读浏览器选区）。

📌 跑法、坐标与判据（两帧像素的 AE 值）在 `docs/06` §5.20；界面那一侧的接线
（大纲那一行从 `span` 改成 `<button>`）在 `docs/04` §2.2a。

### 4.4 写作模式：专注与打字机（`editor/writing-modes.ts`）

`docs/07` 第 6 项。两条都是**视图层的写作辅助**：不改文档、不进撤销栈、不影响存盘的字节。
⚠️ 这句话说的是**压暗与滚动这两件事**——外壳那一半不在本文件的范围里，见下。

⚠️ **2026-09-25 起"专注"有两个半边，本节只讲编辑器里那一半**：

| 半边 | 是什么 | 在哪 |
|---|---|---|
| **正文这一半** | 专注＝压暗非当前段落；打字机＝把光标那行滚到正中（本节剩下的全部内容） | `editor/writing-modes.ts` |
| **外壳这一半** | 菜单栏 / 侧栏 / 插件栏 / 标签栏 / 状态栏**一起收起来** | `ui/useImmersive.ts` ＋ `styles/app.css` 的「沉浸模式」一节（`.app[data-zen]` 一个属性驱动） |

**两者合起来才是用户按 `F8` 看到的东西**；而 `F11`（全屏）与专注**共用同一套外壳规则**，
区别只有"动不动窗口、压不压暗正文"（那张对照表与三条退出路——`F8` / `F11` / `Esc` /
鼠标顶到窗口最上面那条 6px 的窄带——都在 `docs/04` §2.10）。
⚠️ **外壳那一半不在本文件的范围里**：这一半对"外壳还在不在"一无所知
（`writing-modes.ts` 的文件头也是这么写的）——两侧的判据各写在各处，别去猜对面。

**专注模式压暗的是兄弟块，不是"除光标所在块以外的所有块"**：

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

- 容器**不写死选择器**（`找滚动容器`，**2026-09-25 起住在 `scroll-into-view.ts`**：
  那份滚动逻辑要用同一份判据，两份已经开始漂了）：所见即所得那边滚的是 React 那个空 div
  （`.editor-mount`），源码那边滚的是 CodeMirror 自己的 `scrollDOM`。
  写死一个，另一种模式就会静默不滚——而"不滚"看起来跟"没做这个功能"一样。
- ⚠️ **只在光标动了或者文档变了的那一次滚**（`view.update` 里判的条件）。
  每次事务都滚的话，改个窗口大小、点一下鼠标都会把正文拽走，比不滚更烦。
- ⚠️ 偏差小于 1px 就不动：滚动本身触发重排，抖来抖去会让打字有明显迟滞感。

⚠️ **拨开关不重建实例**（`setWritingModes` 走事务元）：重建会丢撤销栈和光标，
而这两个开关正是"写到一半才想去拨"的东西。

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

⚠️ 摘之前要在**还挂着的 DOM 上**把编辑时的零件清掉。⚠️ **这件事要分两半做，
一条规则兜不住全部**（**2026-09-27 被用户的一份 PDF 撞出来**）：

- **装饰**——挂在正文元素上的类名（`nota-dim` / `nota-find-hit` / `nota-review-add`…）：
  **摘掉类名就干净了**，一条 `^nota-` 前缀规则足够，将来加装饰自动生效。
- **容器**——自己就是一个元素的零件（行号 `.nota-code-gutter`、语言选择器
  `.nota-code-lang-wrap`、图表的按钮条与源码框、公式的源码面板与悬浮预览）：
  **摘掉类名之后元素还杵在原地**，必须逐个登记进 `整块删掉` 那份名单。⚠️ 那次
  漏进去的就是它们：用户看到的是一份**带着行号和右上角语言按钮（连带里面那张
  几十 KB 的 base64 语言图标）的 PDF**。原来名单里只有 `.nota-code-bar` 一条，
  所以"复制 / 折叠"没漏、同一条路子上另外两件漏了——**漏的从来不是"忘了登记
  某一个"，是以为前缀规则会兜住**。
- 判据：新加一个 `nota-xxx` 时先问一句**它是不是元素**，是就登记到名单里。

⚠️ 还有**第三件事：导出前要等异步渲染落定**。图表是 mermaid 画的、走一条串行
队列，不等的话导出的是一张**"正在渲染图表…"的说明卡**（屏幕上那块图是好好的，
用户只会觉得导出坏了）。`等异步渲染` 按图块自己那个 `data-state="loading"`
轮询、有 5 秒上限——超时就交说明卡，不能为一张图把导出卡死。

⚠️ 那个离屏挂载点用 `visibility: hidden` **不是 `display: none`**：ProseMirror
建实例时要量 DOM（行高、`coordsAtPos`），`display: none` 下量出来全是 0。
⚠️ 它还被**钉成浅色**（根上写 `data-ui-mode="light"`，`theme/base.css` 里那条
选择器匹配任何带这个属性的元素）：这个离屏节点挂在应用自己的文档里，深色界面下
`diagram-view.ts::读明暗` 会从它身上读到深色的 `--doc-bg`，于是**白纸上画出一张
深色图**。钉浅色就是让它和导出文件（没有 `data-ui-mode` → 落 `:root` = 浅色）
用同一套变量。

⚠️ **两种导出**：不含样式那份**连 class 都不带**（贴进别的系统再加工）；
含样式那份嵌正文实际使用的样式层：变量、外壳、行内层、块级层、图表与
KaTeX 公式，再叠**限域后的**文档主题。外面那几层 class（`.editor-pane` >
`.editor-mount` > `.milkdown` > `.ProseMirror`）**必须照着编辑区的 DOM 摆**，
否则 CSS 在、却哪条都不命中。

⚠️ **块级层不能漏**。2026-10-21 用户看到的“代码框散成一行行灰底”就是缺了
`editor-blocks.css`：主题里的 `code` 行内样式直接落到 `<pre><code>` 上。
流程图生成物保留 `.nota-diagram*` 白名单类名，从而继续获得框线与居中；
`marks.css` 等其余编辑期零件仍不导出。KaTeX 字体在导出时转成 data URL，
离开 Nota 的 origin 后公式仍使用正确字体。
⚠️ 少带那三份各自的症状（都是"看着不对但不报错"）：缺 `theme/base.css` →
文件里每一条 `var(--x)` 都是未定义，**代码块没有底色、token 没有配色、任务项的
方框整个消失**；缺 `katex.min.css` → KaTeX 的两棵树（好看的 `katex-html` 与
给读屏器用的 MathML `katex-mathml`）少了那句 `clip`，**公式在页面上画两遍**。
⚠️ 文档主题压在这三份**之后**（与界面上一致：`applyDocTheme` 是往 `<head>` 末尾
追加 `<style>`，而主题那几条选择器与 `editor.css` 权重相同，谁在后面谁赢）。
⚠️ 那个"不含 `data-ui-mode` ⇒ 浅色"是**有意的**：三套文档主题全是浅色、打印也是
白纸。代价是**深色界面下导出 ≠ 屏幕**，这条待用户拍板（`docs/07` 第 69 项）。

⚠️ **打印不是 `window.print()`**：WebKitGTK 的打印对话框在容器里点不出来、
而且它不是同步返回。Nota 的做法是"导出含样式的那份 + 交给系统默认程序打开"，
由用户在那边的界面里按 `Ctrl+P`——提示里**两步都说**，不假装在应用里完成了。
落点由后端按文档目录决定（`commands/export.rs`），因为正文里的 `![](./img.png)`
是相对路径。

⚠️ **那七种格式不在这条路上**（2026-09-25 加）：PDF / Word / RTF / EPUB / LaTeX /
OpenOffice / OPML 是**交给系统里那个 pandoc** 转的（`ui/useExport.ts` → `nota_pandoc_export`
→ `src-tauri/src/pandoc.rs`）。两点和上面那条口径连着：① **正文仍然是前端现取的**
（`getMarkdown()`），后端只收字符串、走 pandoc 的**标准输入**，不落中间文件；
② **PDF 有两条路**（pandoc 优先，不通就退到 Nota 自带那套 WebKit 打印），所以 PDF 那次
前端**总是先把带样式的 HTML 备好**——兜底要用，不备的话"装了 pandoc 但没装排版引擎"
就只剩一句报错。⚠️ 返回值里的 `route` 说明这次走的哪条，**必须转述给用户**。

⚠️ **PNG 那条路单独有一扇门**（2026-09-27，分享图）：`ipc.ts::writeBytes` →
宿主 `nota_export_write_bytes(path, base64)`（`commands/export.rs`）。它与上面两条
**不是一回事**：那份 PNG 是**面板自己现画的一张 SVG 光栅化出来的**，**不经过编辑器那条渲染路径**，
所以它跟 `nota_export_write`（导出 HTML）只是"都往磁盘写一个文件"这一层相像。
⚠️ **多出一个 base64 是因为 IPC 那条路是 JSON**：`write` 收的是 `String`，二进制直接走它
要么在前端把字节拼成字符串（**遇到高位字节会被 UTF-8 编码成两个字节，写出去的文件就废了**），
要么传一个几十万长的数字数组（比 base64 还长三倍）。base64 只长 33%，两端都有现成的编解码器。
⚠️ 只认**标准** base64（`+` `/` `=`），不认 URL 安全那种（前端用的是 `btoa`）。
⚠️ **解不开就报错、不落任何文件**（`decode` 在 `fs::write` 之前）——磁盘上留一个半截 PNG
比什么都不留更糟：用户看到"文件在"会以为导出成功了。那三条判据在 `commands/export.rs`
的 `base64_写出来的字节与编码前一模一样`（特意掺了 `\x89` / `\xff` 这些**高位字节**）
与 `坏掉的base64报错而且不留下半个文件` 里。

⚠️ **「导出」不等于「另存为」**（用户 2026-09-25 点的）：导出产出的是一份**别的文件**，
当前文档一个字节都不动（`title` 只是"默认文件名从哪来"）；另存为换的是*这份文档自己*
的路径。所以导出能有一个"猜用户想要哪儿"的默认落点（设置 → 文档目录 → 交给对话框），
另存为没有——它只能以 `doc.path` 为准。

### 4.6 数学公式：physics 宏包怎么进 KaTeX（`editor/math-macros.ts`，2026-09-24）

一句话链路：**设置里那个开关 → `EditorPane` 的 `physics` 属性 → `createEditor` 的
`options.physics` → `ctx.set(katexOptionsCtx.key, katexOptionsFor(physics))` → KaTeX 查表**。

⚠️ **三个"改了不会报错但会静默失效"的点**：

1. **`ctx.set` 的第一个参数是 `katexOptionsCtx.key`，不是 `katexOptionsCtx`**。
   后者是个**插件对象**（`$Ctx` = 插件 + `key`），传错的症状是宏表根本没进去、
   而 `\qty` 渲染成一串红字——这一条**正好被 TypeScript 挡住**（类型不匹配编译不过），
   所以它现在只能靠读代码看懂，`key` 不是可以删掉的"冗余"。
2. **`physics` 必须进 `EditorPane` 那个 effect 的依赖**（和 `strict` 同理）：
   它换的是**交给 KaTeX 的那份宏表**，而 KaTeX 是**渲染那一刻**查表的。
   不进依赖的话，用户拨了开关得先切一次文档才生效——那种"设置像没生效"的现象
   最难被当成 bug 报上来。
3. **源码那一侧没有 `physics`，而且不该有**：CodeMirror 只显示 Markdown 原文，
   一个字都不渲染（`CreateSourceOptions` 里没有这一项，传了编译不过）。
   ⚠️ **分屏右侧那个只读预览要有**——它也走 `createEditor`，两边解析口径不一致的话
   分屏左右会各显示一个样。

⚠️ **宏表是 Nota 自己写的，不是"装了个扩展"**：KaTeX 官方没有 physics，
`katex-physics`（2019）**刻意没引**（无 LICENSE 文件）。表里 **108 条**，
每条配一个可渲染样例。**支持的族与做不到的写法逐条列在 `docs/10` §11.1**——
加宏之前先读那张"做不到"的表，里面那三条根因（参数要带花括号、可选参只能用
`\renewcommand`、星号不被吃掉）决定了哪些写法根本写不出来。

⚠️ **`\ce` / `\pu` 与这个开关无关**：它们来自 KaTeX 自带的 `contrib/mhchem`，
文件顶上那句 side-effect import 就是干这个的（**不能删**）。

⚠️ **验法**：`tools/menu-harness` 的 `#math` 场景把每条宏真渲染一遍，
包括"关着时哪些还能渲染""`\braket` 两个方向的元数变化""`\div`/`\Re`/`\Im`
确实被重定义""坏公式渲染成错误而不抛"。**加一条宏必须同时加一条样例**。

### 4.6b 公式两个节点：**不改 schema，只补一个视图**（`editor/math-view.ts`，2026-09-26）

用户报的两句：「**我 Latex 输入之后直接消失了**」＋「应该是可以输入，但是两个 `$$` 还是
半透明显示指示输入位置」。**前半句不成立、后半句成立**：上游从来没让公式"可输入"过，
而且**比"不能输入"更糟**——敲进去的字会被静默丢掉：

1. 敲 `$` `$` ＋空格 → 上游 `mathBlockInputRule`（判据就是 `/^\$\$\s$/`）建出一个
   `math_block`，`attrs.value` 用的是**默认值 `""`**、内容也是空的；
2. 空串进 `katex.render` 出来是一棵**空壳**——屏幕上那一块彻底空白，这就是"消失了"；
3. 这个节点是 `atom`（`content: "text*"`），可 ProseMirror **接受了一个落在它内容里的
   光标**（实测：敲完 `$$␣` 之后选区是 `TextSelection at 1`，且 `$from.parent.type.name`
   就是 `math_block`）；
4. 接着敲的字落进**节点的内容**，而 `toMarkdown` 读的是 **`attrs.value`**——
   **屏幕上写着 `E=mc^2`，存出去是空**（所见非所存）。

⚠️ **两条源码路径不一样，这是本文件最容易做错的一处**：
`math_inline` 的源码在**节点的内容**里（上游 `toMarkdown` 交的是 `a.textContent`，
它**连 `attrs` 都没有**），`math_block` 在 **`attrs.value`** 里。**写错哪一边的症状都不是
报错，是存盘丢字**——所以 `tests/math-view.test.ts` 第二组每一条都要拿**插件自己那份真
`toMarkdown.runner`** 复核"存出去到底是什么"。

⚠️ **这一批不改上游的 schema、也不加命令**（`@milkdown/plugin-math` 里
`updateMathBlock` / `updateInlineMath` 那种命令**不存在**——`docs/07` 第 53 项原来把它
列成一条候选路，照字面做不出来）。做法是给这两个节点补 NodeView：

⚠️ **唯一一条命令是 2026-09-26 补的，而且不在这个文件里**：`插公式块` 在
`src/editor/insert.ts`（`docs/07` 第 52 项——菜单里那条「公式块」原来是灰的）。
⚠️ 它**特意不用上游那条输入规则里的 `setBlockType`**：那条会把当前段落里的文字
留着当内容，而 `math_block` 存盘读的是 `attrs.value`——**写进文件就没了**。

- **「当前」只认整块选中**（`NodeSelection`），光标**紧挨着**公式不算——否则 `$x$` 一打完
  面板就弹。装饰由 `公式当前` 那条线出（真 `appendTransaction`，把落进内容的光标改成整块
  选中），画的是 `nota-math-current`。
- 编辑态下两根 `$` / `$$` 半透明（`.nota-math-delim`，走 `.nota-srcmark` 那张配方：
  `--fg-faint` ＋ 0.16s 淡入，**不再乘 `opacity`**），行内公式编辑时渲染区
  `display: none`（Typora 式：源码框替掉结果）。
- **只读实例（分屏右预览 / 导出）画的是上游 `toDOM` 那棵树**，所以那两处的输出与今天
  **逐字节相同**；只读时面板**建了也不挂**。
- 有意留下的三条取舍（都在文件头）：光标紧挨着不算当前、行内**不做**选区归位（做了会把
  "接着敲一个字"变成"整条被替换"）、空源码按退格 = **删掉整块**（给「敲错了 `$$␣`」一条
  退路）。⚠️ 代价：覆盖了 `selectNode` / `deselectNode` 之后，**这个节点不能再拖着搬家**了。

✅ **2026-09-26 在无头窗口里点过了**（上一批给自己留的那件验收；同批撞出 **BUG-37**）：
① **编辑态与半透明都对**——点一颗块级公式，源码框满行展开、**左右两端各一个半透明的 `$$`**、上方保留 KaTeX 渲染（用户要的"指示输入位置"就是这个）；
② **焦点没有被顶掉**——那条 `queueMicrotask` 排聚焦**在真浏览器里站住了**：点完直接敲字，字进的是源码框（不是正文）；
③ **所见即所存**——敲完 `Ctrl+S`，把文件读出来核字节：`E=mc^2` → `E=mc^27`，两端仍是 `$$`（行内那颗同样验过：`$x^2$` 改成 `$x^27$`，定界符没串）。
⚠️ **但编辑态下"再点一下自己那块渲染区"会出事**：浏览器把焦点交回正文，而选区还停在整块上，于是**下一个字符把整块公式替换掉**（实测：48 字符掉到 36，块没了；同一串动作把那个字符换成 `Ctrl+A` ＋ `Delete` 就是**整篇删空**）。这是 **BUG-37**，修法是给 `渲染` 补一条 `mousedown`（编辑态时 `preventDefault` ＋ 把焦点收回源码框，非编辑态放行让 ProseMirror 去选中整块），**已复验**。
⚠️ **仍未点过的**：只读实例（分屏右预览 / 导出）里的公式、LaTeX 文档主题下的观感、长公式的 KaTeX 排版。

### 4.6c 行内公式的**打字**规则（`editor/math-input.ts`，2026-09-26）

用户原话（`docs/07` backlog 第 53 项）：「`$$…$$` 不必独占一行」，例子是
`**牛顿-莱布尼茨公式**是这样的：$$\int_a^b f(x)dx=F(x)\big|_a^b$$ 也是可以的。`

**加载路径本来就通**（`remark-math` 认行内 `$$…$$`），不通的是**打字**那条路、
**根因在上游那条输入规则**：`@milkdown/plugin-math` 只导出 `mathInlineInputRule`
一条，正则 `/(?:\$)([^$]+)(?:\$)$/`——用户敲到 `A$$bb$` 这一下，尾巴上的 `$bb$`
就够匹配了，于是当场变出「文本 `A$` ＋ 公式 `bb`」；等他补上最后一个 `$`，
那已经是**另一段文字**。所以「行内 `$$…$$` 打不出来」**与解析器无关**。

| 敲什么 | 变成 | 与上游比 |
|---|---|---|
| `$$x$$` | `math_inline("x")` | **新加的** |
| `$x$` | `math_inline("x")` | 照旧，只多一道守卫 |
| `$$` ＋**回车** | 一块**空**的 `math_block`，源码框当场打开 | **换掉上游那条**（原来是「`$$` ＋空格」就建，见下那条 ⚠️⚠️） |

- **换掉上游那条的手法**：`create.ts` 里 `math.filter((p) => p !== mathInlineInputRule && p !== mathBlockInputRule)`
  ——**按引用**滤，与标题那条 `wrapInHeadingInputRule` 一模一样。⚠️ **它依赖上游的导出形状**，
  升级 milkdown 要重新确认这条 `filter` 还筛得中（`tests/math-input.test.ts` 第四组有一条
  "我们滤的那两条**真的在 `math` 里**"，上游改名/挪窝那里会红，不是静默失效）。
- **`$…$` 那条多一道守卫**：前面紧挨着**还是 `$`** 时返回 `null` 让开（`null` 在
  `prosemirror-inputrules` 里是"这条不接、试下一条"）；上游那条已经不在，所以让开就等于
  "这颗字符不触发任何规则"。等 `$$` 齐了由上一条接管。
- ⚠️ **守卫二**（2026-10-04 加，**当天撤回**）：那一条是"值紧挨着空格的不算公式"——
  `$ 你好 $` / `$你好 $` / `$ 你好$` 原样留在正文里、不转。判据是 `math-delim.ts` 的
  `值挨着空白`，解析与打字两侧共用。⚠️ **撤回的理由是用户当天下午在分屏预览里撞上的一件
  事**：它顺手把 `$ \LaTeX $` 这种**带空格的常见写法**也判成了普通文字（屏幕上就是不再
  渲染），于是当场拍了「**整条撤回**」。现在 `该变公式` **只有一道守卫**（前面紧挨着 `$`
  才让开），`值挨着空白` 这个函数**不存在了**。代价与经过见 §4.17 ⑦。
  ⚠️ 它当初**顺带修过** backlog 第 54 项那个例子（`价格 $100 和 $200 元`），撤回之后
  **那个例子照旧误判**——第 54 项因此**退回未修**；⚠️ **但只退回了一天**：2026-10-04 晚
  第 54 项**另行修好**，口径写在 `src/editor/math-currency.ts`（**门槛 ＋ Pandoc 第 2、3 条**，
  不是原先那句"`$` 紧跟数字就不认"——那句话单独用会误伤 `$2+2$ 和 $x$` 这类真公式），
  经过见 `docs/07` 第 54 项那一行与 §4.6e。⚠️ **与本条（守卫二）不是一回事**：
  这条是**输入规则那一侧**的、已被撤回且不会再回来；第 54 项那条在**解析那一侧**（分词器），
  两边各管各的。

⚠️⚠️ **块公式的触发键从「空格」退回「回车」（2026-10-04）**。上游 `mathBlockInputRule`
的正则是 `/^\$\$\s$/`——**一颗空格**就把整段变成一块**空的** `math_block`（屏幕上凭空多出
一块空白，用户上报的就是这个）。它自己的注释写的是「type `$$` and press **enter**」，
**实现跟注释不符**。现在那条被 `create.ts` 按引用滤掉，换成 `math-input.ts` 的
`公式块回车`（`$prose` ＋ `props.handleKeyDown`，与 `heading-on-enter.ts` 同一个手法；
⚠️ **不需要 `$shortcut` ＋ `priority`**——上游那条挂在**输入规则**上，`InputRule` 只吃
`textInput`，跟回车这条路撞不上）。四条守卫缺一条就是抢别人的活：

- **空选区**、**只在行尾**（`$$abc` 按回车是拆段，不是建块）、**表格格子里不干**
  （归 `table-input.ts`）、**只读实例不干**。光秃秃的回车才认（Shift/Ctrl/Alt ＋ Enter
  各有绑定、输入法组合中的那一下是"选词"）。
- 判据 `空块头 = /^\$\$\s*$/`：**尾上那颗空格仍然认**——老写法（`$$ ` ＋回车）是顺着
  肌肉记忆的，而且"`$$` 打头就算"在 Typora 里也是这个规矩（那条**已撤回的**守卫二管的是
  "值的两边有空格 ⇒ 不是公式"，这里根本没有值，两者本来就撞不上）。
- ⚠️ 建完块**必须设 `NodeSelection`**：`math-view.ts` 判"要不要开源码框"的**唯一判据**
  就是整块选中，设上之后 `公式当前` 那条装饰立刻挂、NodeView 当场 `focus()` 源码框——
  用户按下回车就能直接敲 LaTeX。（上游那版把光标留在内容里、绕一圈 `appendTransaction`
  才变成 `NodeSelection`；这里直接到位。）

### 4.6d 公式源码框里的**命令候选弹窗**（`editor/math-commands.ts` ＋ `editor/math-suggest.ts`，2026-10-04）

用户第三句要求：「**加 LaTeX 命令补全**」——在源码框里敲一个 `\`，弹出一列命令候选，
每条带**渲染出来的预览**（`\frac` 旁边直接画出分数线），回车/点击收进源码框。

**两份文件，切在"纯逻辑 / 画"这条线上**：

| 文件 | 管什么 | 判据 |
|---|---|---|
| `math-commands.ts`（**一张表 ＋ 四个纯函数**） | 表长什么样、光标踩在哪个命令上、筛哪几条、收下之后源码变成什么 | 可纯函数测（`tests/math-commands.test.ts`，35 条），**不碰 DOM** |
| `math-suggest.ts`（**一棵 DOM 树**） | 建元素、跟着输入换内容、↑↓ 怎么走、点一下怎么收 | 假 DOM 测（`tests/math-suggest.test.ts`，27 条），**不碰文档** |

接线那一小段在 `math-view.ts`（NodeView 那一层），判据在 `tests/math-view.test.ts` 第八组。

**① 表**：手写一列（`\frac` / `\sqrt` / `\sum` / `\int` … 各带说明与一小段能画出来的样本），
外加 10 条 `常用`（`常用名` 那张表定顺序）。**physics 那 216 条从 KaTeX 的 `PHYSICS_MACROS`
推**，不手抄：参数个数取展开式里 `#n` 的**最大下标**（`数参数`），于是 `插入` 是
`\命令` ＋ 对应个数的 `{}`。⚠️ **`\div` 在两处同名**——手写表里是除号、KaTeX physics 里是
散度（`macros` 覆盖内建，所以开着 physics 时它真的会变成散度）。**开 physics 时让后者顶掉前者**
（`建命令表` 里 filter 一遍），代价是**开着 physics 就看不到「÷」那条提示**——这是"两条
判据都对、但用户只该看见一条"的有意取舍，`tests/math-commands.test.ts` 里有一条专门钉它。

**② `找当场(源, 光标)`**：从光标往前扫 `[A-Za-z]`，要求这一串前面有**一颗** `\`——而且
数一下前面**连着几颗**反斜杠：**奇数才算命令头**（`\\` 是换行、不是命令头；`\\\` 是）。
⚠️ 用 `charAt` 而不是 `源[i]`：`noUncheckedIndexedAccess` 开着，下标取值是 `string | undefined`。

**③ `挑候选(表, 词, 上限)`**：词空 → 给 `常用`（按表的顺序）；否则**大小写不敏感的前缀匹配**，
按 `命令.length` 再 `localeCompare` 排序后截断。⚠️ **不做模糊匹配**：`frc` **不许**匹配
`\frac`（补全弹窗里"看起来差不多"比"少给几条"坏得多——选错了当场写进文档）。

**④ `套用(源, 光标, 当场, 条)`**：把 `[当场.起, 光标)` 换成 `条.插入`，光标落到**第一个**
`{}` 里面（`indexOf("{}") + 1`）——敲 `\fr` ＋回车得到 `\frac{}{}` 且光标在第一个洞，接着敲
分子、Tab 之后再敲分母，这是补全真正省事的那一下。

**⑤ `候选上限 = 10`**，**故意与 `常用名` 的条数相等**：上限比它小的话，`常用` 里排在后面的
几条会**静默地被截掉**（写这一批时真的踩了：上限本来是 8，`常用` 有 10 条）。
⚠️ **这个数只在代码里记一份**（2026-10-04 开窗目检改的，见 `docs/07` BUG-63）。当时
CSS 那边还配了一条 `max-height: 220px`，注释写的是"一条约 21px ⇒ 十条装得下"——
**真窗口里量出来一条是 24.7px**（一行 = 上下 padding 4 ＋ 预览那格的高度，而预览那格的
`font-size: 12px` 是**写死的 px**，与界面字号基本无关）⇒ 只装得下**九条**：第十条 `\theta`
切在框外，而选中移出视野时**列表不跟着滚**，按九下 ↓ 就选到一条看不见的候补上。那条像素
上限**已经删掉**，高度交给内容（`overflow-y: auto` 留着兜底）。📌 **同一个数记在两处就是**
这次踩的坑——行数上限有 `候选上限` 一处就够。

⚠️ **样本必须"单独立得住"**（同日目检抓到的 BUG-64）：一条候选的 `样本` 留空串时，吃的是
`手写候选` 那条"**空串就是跟名字一样**"的兜底。那条兜底只对 `\alpha` 这种**单独立得住**的
命令成立；`\right` 离了配对的 `\left` 在 KaTeX 里根本标不出来，而 `throwOnError: false`
**不抛异常**——它把出错的那段源码**画成红字**，于是弹窗里那一行是一句红报错。所以
`\right` 的样本写成了 `\left. x \right)`（`.` 是"没有左括号"），画出来正好是"一个自己找
大小的右括号"。⚠️ 记住这条边界：**`取预览` 里那个 `catch` 接不到这类错**。

**⑥ 弹窗挂在公式自己的那棵树里，不挂 `document.body`**。`lang-picker.ts`（代码块的语言
下拉）挂 body 是因为它要在被 ProseMirror 到处搬的树上定位、只能自己算屏幕坐标；这一格不必
——公式的 NodeView 本来就是一棵**自己的、不动的**树，挂进去白拿三样东西：主题变量
（`--nota-*` 在 `.editor-mount` 上，是后代就继承）、**不必算坐标**（父元素一动它跟着动）、
以及**假 DOM 跑得动**（`tests/fake-dom.ts` 没有 `document.body` / `window` /
`getComputedStyle`，挂 body 那条路在测试里一步都走不了）。⚠️ 代价一处：弹窗**只在自己那块
公式旁边**、不能盖住别的块——对"贴着输入框往下弹"这件事没影响。行内公式那棵 NodeView
整个活在一个 `<span>` 里，所以**行内那档弹窗也用 `span` 建**（绝对定位不占流，但把 `div`
塞进 `span` 是非法嵌套，而这一棵是要被 ProseMirror 的 DOM 观察器扫过去的）。

**⑦ 收下这一件事只有一个出口**。弹窗算出新源码之后**不碰文档**，通过 `收下后` 交回
`math-view.ts`（那边才有 `派发()`——写回节点的唯一入口）。⚠️ **键盘与鼠标走同一个口子**：
早先键盘那一路只把结果**返回**出去、没喊 `收下后`，症状是「**按回车没反应**」（测试里
`吃了` 是真、源码框却一个字没变）——写测试时当场抓到的，见 `docs/07` BUG-60。

**⑧ 按键怎么分**：Escape → **只收弹窗**（不吃键的话这一下会一路走到"退出编辑"，用户想关
提示结果整个面板收走了）；↑↓ → 移一格（到头就停、不绕回）；回车/Tab → 收下当前那条
（⚠️ 先判"这一下收得了吗"，收不了就把键放回去——那时回车该干它本来那件事）；←→/Home/End →
收起来但**不吃键**（这几下会让光标动、而光标动**不派发 `input`**，留着这一列就是按旧光标算
出来的）。焦点**从头到尾在源码框**，读屏器靠框上的 `aria-activedescendant` 知道指着第几条
（写那一笔在 `math-view.ts`，它才够得着那个 `<input>`）。

⚠️ **"弹窗归焦点、面板归选区"**：面板开不开看的是**装饰说当前**（`面板该开` =
`view.editable && (装饰当前 || 框里有焦点)`），弹窗开不开看的是**光标还在不在命令里**。
所以**丢了焦点弹窗收、面板故意还开着**——这条分界被 `tests/math-view.test.ts` 第八组
最后那条**有意**钉住（改坏了当场看得见）。

⚠️ **2026-10-04 开窗验过一半**（`:93` 无头窗口，量法与读数在 `docs/06` §5.45）：行内与块级
两种源码框里敲 `\` 都弹**且不顶出正文列**、回车收下（源码变 `\sqrt{}`、光标落在 `{}` 里）、
鼠标点一条同样收下、**焦点没被 ProseMirror 顶掉**（收完光标还在源码框里、面板仍在编辑态）、
敲字筛过之后选中回到第一条、十条常用**一条不缺**。⚠️ **还没在窗口里单独点过的四小件**：
`Tab` 那一颗、`Escape` **第一下只收弹窗**（目检那轮是一下把弹窗和面板一起收的，没分两步看）、
physics 开着时那个**小角标**、以及候选列贴到**正文右边界**时会不会顶出去（只看了左边贴公式
那一侧）。⚠️ 目检那轮顺手抓到 BUG-63（只装得下九条、选中的滚不出视野）与 BUG-64
（`\right` 那行红字），都同批修掉并在同一窗口里复验。
- **口径是"解析器怎么读，我就怎么转"**（`table-input.ts` 那条规矩）：转出来的东西，
  存盘再打开必须还是它。实测表（`remark-parse` 11 ＋ `remark-math` 6.0.0）逐行写在文件头，
  **两行有意留着的 ✘**（`$$a$b$$`、`A$$$ab$$`）、以及"输入规则只看光标前 500 字符
  （`MAX_MATCH`）、解析器看整行"这条差别也在那儿。⚠️ 那两行 ✘ 的代价只是**当场不转**，
  用户接着敲就是了——**不会吃字**。
- ⚠️⚠️ **存的，就是打的**（2026-09-27 起）：`$$x$$` 存盘还是 `$$x$$`。**这条原来是反的**
  ——2026-09-26 查出来的是"`$$x$$` 存盘变成 `$x$`"，因为 `math_inline` 的 `toMarkdown`
  交出去的只有 `inlineMath` 的 `value`，而 mdast 的 `inlineMath` **没有"用了几个 `$`"
  这个字段**，写回时的美元数是 `mdast-util-math` 按**值**现算的（默认 1 个，值里有孤立
  `$` 才加到 2）。**信息在解析那一步就丢了**，所以光改序列化器救不回来。
  用户 2026-09-27 拍了「**保留**」，于是另记一处、一路带过去：**三处**分别是一个 `$remark`
  标注插件（照源码偏移数出开头几个 `$` → mdast 的 `data`）、`math_inline` 的规格多一个
  `dollars` 属性 ＋ 两个 `runner` 搬它、以及一条按 `dollars` 选上游处理器的序列化 handler。
  ⚠️ 那三处**少一处就静默失效**（不报错、屏幕上一点变化都看不出来），所以**都在
  `editor/math-delim.ts`**，判据在 `tests/math-delim.test.ts`（`docs/06` §6.3）。
  ⚠️ 代价如实记：`math_inline` 从此**有** `attrs` 了（`dollars`，默认 1），所以
  `tests/math-view.test.ts` 里那条"连 `attrs` 都没有"量的是**上游那份**规格。
  ⚠️ 这条也**不是这个文件造成的**：不走输入规则、直接在文件里写 `$$x$$` 再打开再存盘，
  以前一样会变——现在两边的答案一致了。⚠️ 打字那条路**不走标注插件**（`math-input.ts`
  那两条规则当场就知道敲了几个 `$`，直接盖章），是**同一个属性的另一个来源**。

### 4.6e ⚠️ `$` 当钱写的时候不算公式（`editor/math-currency.ts`，2026-10-04，第 54 项）

用户报的是 `价格 $100 和 $200 元`——两颗 `$` 之间被读成一颗行内公式（值 `100 和 `），
屏幕上突然冒出一块公式。⚠️ **存盘字节是原样的**（不是 §4.7 那一族），**只是看着不对**。

⚠️ **口径不是 backlog 上原先记的那句**「`$` 后紧跟数字就不当开定界符」——**那句话单独用
会误伤真公式，伤得比原病更重**：

| 源码 | 只按"开定界符右边是数字"拒 | 后果 |
|---|---|---|
| `$2+2$ 和 $x$` | 第一颗 `$` 被拒 ⇒ **它右边那颗 `$` 顶上当开定界符** | `2+2$ 和 ` 整段成了公式 ✗✗ |
| `$0 < x < 1$` | 被拒 ⇒ 还原成正文 | 该渲染的不渲染 ✗ |
| `$\frac{a}{b}$` | 没事（右边是 `\`） | —— |

第一行那种是**把正文吃进公式里**，比"钱被看成公式"更难看。现在的口径是
**门槛 ＋ Pandoc 第 2、3 条**：

1. **门槛**：开头**只有一颗 `$`**（`$$…$$` 一律不算，钱不会那么写），且它右边**紧跟一颗数字**；
2. 过了门槛**再要**下面任一条成立，这一对才判成正文：闭定界符**右边紧跟数字**
   （`$100 和 $200` 的第二颗 `$` 后面正是 `2`）、或闭定界符**左边是空白**
   （`$50，公式 $x+y$ 里` 那一对）。

⚠️ **2 里那两条就是 Pandoc 的第 2、3 条，一个字没改**；差的是**只在门槛之内才拿它们判**
——所以 **`$ \LaTeX $` 连门都进不来**（右边是空格、不是数字），**照旧渲染**，
§4.17 那格撤回的口径**一个字节没被碰**。

⚠️ **已知差别两条，如实记（用户 2026-10-04 拍板「写进已知差别、不要开关」）**：
**它会改变已存文档的解析结果**（一份写着 `价格 $100 和 $200 元` 的文档，之前看着是公式、
现在看着是钱）；**认不出的形状照样是公式**（`$100 和 200$ 元`——收尾那颗 `$` 后面没有
数字、左边也不是空白，与 `$0 < x < 1$` 逐条都长一样，**这一层分不开，宁可不动**）。

⚠️ **为什么包在分词器上、不做 mdast 后处理**：mdast 那一层只有"上游已经配好的那一对"，
算不出"配错了以后该退到哪里"。`$100 降到 $50，公式 $x+y$` 里上游先配出 `$100 降到 $`，
把它改回正文之后 **`$50` 那颗 `$` 要重新当开定界符去配后面那颗**——mdast 那层没有"重新
分词"，硬凑的典型后果就是把 `50，公式 ` 吃进公式里。包在分词器上**退回正文 = 把这一对
否掉**，剩下全交给 micromark 自己重扫（它本来就会在下一颗 `$` 上再试一次），
结果与"从来就没有这条规则、只是这段源码恰好这么写"完全一致。

⚠️ **怎么挂上去（三件事，少一件就静默失效）**：① 从 `this.data("micromarkExtensions")`
里**现场取**上游那条 `mathText`（⚠️ 不自己 import `micromark-extension-math` 造一条——
那条构造的行为取决于 `remark-math` 拿到的选项，自己造就得抄选项，抄错了是静默的）；
② 包一层，`effects` 换成"转发 ＋ 记下吃掉的字符"的影子（**O(1)**：只记开头几颗 `$`、
第一颗非 `$`、最后两颗）；③ 把上游那条**按名字停掉**（`disable: {null: ["mathText"]}`）
——不停掉的话我们 `nok` 之后会在同一位置再问它一次，它来者不拒、又配成了公式。
⚠️ **代价是我们自己那条不能叫这个名字**（停用按名字查），所以包装那份的 `name` 要去掉。
⚠️ **必须排在 `remark-math` 后面**（`.use(math)` 在前）——排在前面表里还没有上游那条，
这个插件就白挂了；这条约束**测试量得到**（`tests/math-currency.test.ts` 最后那组直接读
`create.ts`）。

⚠️ **边界**：判成正文那一对**不会被写成 `\$`**（那是 `math-delim.ts` 第四格
`不转义美元` 管的，判据在这几个形状上成立，**靠它兜着**，不是这一层保证的）；
⚠️ **打字那条路不经过这里**（`math-input.ts` 的输入规则另算）；⚠️ **开窗目检没做**
（真窗口敲一遍 `Ctrl+S` 读字节）。判据 `tests/math-currency.test.ts` **23 条**（六组，
含一条"摘掉我们这一层就复现出病"的对照），真值表在 `src/editor/math-currency.ts` 文件头。

### 4.7 「打开再存，字节变了」这一族（2026-09-24 实测；2026-09-26 在真窗口里补齐）

用户定的死规矩是「**如果关闭，存盘不要自动修复**」（宽松档是默认）。这一档
**没有自己的代码**——它靠的是"序列化时不乱改"，而序列化在
`remark-stringify` 手里（`create.ts` 里 `remarkStringifyOptionsCtx` 那一段）。
2026-09-24 拿真实的 `createEditor` 进→出跑了一遍，**下面这些字节能被动**
（2026-09-26 补了最后两行，其中 `<br />` 那条追到了根）：

| 进去 | 出来 | 状态 |
|---|---|---|
| `- 甲` | `* 甲` | ✅ **已修**：`bullet: "-"` |
| `---` | `***` | ✅ **已修**：`rule: "-"` |
| `甲␠␠` 换行 | `甲\` 换行 | ⚠️ 遗留：两种都是合法硬换行，但字节确实动了 |
| `#   标题` | `# 标题` | ⚠️ 遗留：缩进被吃掉 |
| 表格空单元格 | `\| 1 \|   \|` | ✅ **2026-09-26 第二轮已修**：不再写 `<br />`（判据与落点见下两段）。⚠️ **列宽被重算**那条仍在 |
| `\| --- \| --- \|` 分隔行 | `\| ------ \| ------ \|` | ⚠️ 遗留：列宽按**该列最长的单元格**重算（不是固定 `-`） |
| 正文里**空段落**（段落之间多敲一次回车） | `甲\n\n乙`——**一个字节都不写** | ✅ **2026-09-26 第二轮已修**（同一个根因，见下两段）。⚠️ 代价：整篇都是空段落时（新建的空文档）仍然写一个 `<br />` |
| `==高亮==`、`[TOC]`、`文字[^1]`、`> [!NOTE]` | 各被加一个 `\` 转义 | ✅ **2026-10-04 全部结清**：`==高亮==` 由 `inline-marks.ts::不转义行首等号` 管、`[^1]` 是**脚注本来就认得**（不在这一族里）、`[TOC]` 与 `> [!NOTE]` 由**新加的第七层** `syntax-escape.ts::不转义已知语法` 管（⚠️ **只认行首 ＋ 只认名字在册的**：`TOC`/`toc` ＋ 五种 `[!TYPE]`；判据的立足点是「有 `[TOC]:` 定义时它解析期就成了链接、本层根本看不到」）。判据 `tests/syntax-escape.test.ts` **13 条** |
| `甲␠␠` 换行（两颗空格当硬换行） | `甲\`＋换行 | ⚠️ **仍然遗留，而且是「决定不改」**：两种写法在 CommonMark 里**都是合法硬换行**，而序列化器看不见源代码用的是哪种（`mdast` 的 `break` 节点不带这个信息，`mdast-util-to-markdown` 的 `State` 里也没有源码）。要保真只能按 `math-delim.ts` 的 `dollars` 那样**在解析那趟盖章 ＋ 给节点加一个属性**——为一个语义完全等价的差别动 schema，不划算。⚠️ 反过来把上游那条改成永远写两颗空格（自己写一条 `handlers.break`）是**把代价换个方向付**（`\` 写法的文件反而会变），所以**两条路都没走** |
| `#   标题`（井号后多几颗空格） | `# 标题` | ⚠️ **同样「决定不改」**：多出的空格被吃掉。要保住它得**重写上游那条 `handlers.heading`** 并自己记住「原来井号后面有几颗空格」（同样要解析期盖章 ＋ 给 `heading` 节点加属性，而 `heading` 是**真 PM 节点**，加属性比 `math_inline` 那次影响面大得多）。⚠️ 语义上一个字节都不差（`#   标题` 与 `# 标题` 都是同一级标题），所以记在这儿、不修 |
| 行内 `$$x$$` | `$$x$$`——**一字不差** | ✅ **2026-09-27 已修**（用户拍了「保留」）：mdast 的 `inlineMath` 没有"用了几个 `$`"这个字段，所以另记了一个 `dollars` 属性一路带过去（§4.6c，机制在 `editor/math-delim.ts`，判据在 `tests/math-delim.test.ts`）。⚠️ 2026-09-26 那一版这里写的是"`$$x$$` → `$x$`，待用户拍板" |
| 开头的 YAML front matter（`---` / `theme: seriph` / `---`） | `---` ＋ 空行 ＋ **`## theme: seriph`** | ✅ **2026-09-26 已修**：整段**不进编辑器**，在边界上原样留住（§4.12，BUG-39）。⚠️ 这一条比上面那些重一个量级——上面是"字节动了"，它是**把数据弄没了** |
| `1. 甲` ＋ 2 格缩进的续行 | `1. 甲` ＋ **3 格** | ⚠️ **2026-10-04 补记（第 ⑤ 条）**：对齐到内容首列（标记宽 2 ＋ 1） |
| `10. 甲` ＋ 2 格缩进的续行 | `10. 甲` ＋ **4 格** | ⚠️ 同上（标记宽 3 ＋ 1）。⚠️ 这两条**与严格模式无关**（那条路上 `strict` 根本没接进来） |
| `10. 甲` 换行 ＋ 2 格的 `1. 乙` | `10. 甲` 换行 ＋ **`11. 乙`**（那一行成了**同级项**、**编号被顺排**） | ⚠️ 同上：2 格不到 `10. ` 的内容首列 ⇒ 判成同级项而不是子列表（§2.1d）。⚠️ **它是上面这两条的同一族**：根都是"缩进没地方存，是序列化那一刻算出来的"，**不是 bug** |

⚠️ **"已修"不等于"这一族解决了"**：剩下那几条**各有各的来路**——`--` 转义那几条要自己写
序列化 handler，**都不是调一个选项的事**。`<br />` 那一条 **2026-09-26 第二轮已落地**
（决定与代价见下面三段）。**逐条记在 `docs/07` §4 第 56 项**，带复现步骤。

⚠️ **2026-09-26 查到 `<br />` 的根因了，而且它比"表格"大得多**：`@milkdown/preset-commonmark`
给 `paragraph` 写的那条序列化（`node_modules/@milkdown/preset-commonmark/lib/index.js:490`）：

```js
const lastNode = ctx.get(editorViewCtx).state?.doc.lastChild;
state.openNode("paragraph");
if ((!node.content || node.content.size === 0) && node !== lastNode && shouldPreserveEmptyLine(ctx))
  state.addNode("html", void 0, "<br />");
else serializeText(state, node);
```

`shouldPreserveEmptyLine(ctx)` 判的是 **ctx 里注册过 `remarkPreserveEmptyLinePlugin` 没有**
（同文件 497 行，commonmark preset 默认注册）。于是**任何一个"空的段落节点"**（只要它不是
文档的最后一个顶层节点）在存盘时都会变成一个 HTML 节点 `<br />`。表格空单元格
（PM 里是 `table_cell > paragraph(空)`）只是它的一种；**用户在段落之间多敲一次回车**
是另一种，而且常见得多。

⚠️ **这不是上游写错了**：`<br />` 与解析侧那条"把 `<br />` 认回空段落"是**有意的一对**
（`remark-preserve-empty-line`）——mdast 表达不了"两个连续空段落"，不留一个占位符，
用户敲的空行**存盘就没了**。所以它是一个**取舍**，光说"删掉那行"会把空行一起删掉。

⚠️ **本仓 2026-09-26 第二轮定了（用户点名：「enter 默认是真 enter 而非 `<br>`」）**：
给 `paragraph` 自己挂一条 `toMarkdown`，**空段落一个字节都不写**——正交的那两条候选是
"全关那个插件"（空行跟着没了）和"只对表格关"，本仓选的是**比"只对表格"更彻底的**那一版，
落点在 `editor/empty-paragraph.ts`（新文件，`.use()` 排在 `commonmark` 之后 ⇒ 同名盖掉上游那一版）。

理由是**一条实测出来的事实**：那个占位符**根本活不过一次重新打开**。`<br />` 单独占一行，
重新解析时是**顶层 html 块**（不是段落里的行内节点），而解析侧那个插件把顶层 html 节点
**直接摘掉**（`visitEmptyLine`）。2026-09-26 实测：

| 文件里的字节 | 解析出来 | 摘掉空行节点之后 |
|---|---|---|
| `甲\n\n<br />\n\n乙` | `paragraph, html, paragraph` | **`paragraph, paragraph`** |
| `甲\n\n\n\n乙` | `paragraph, paragraph` | `paragraph, paragraph` |

两条路的**结果一样**（空段落都没了），差别只在"存盘到重新打开之间，文件里那几个字节
长什么样"。既然如此，占位符换来的是**每次存盘都往用户文件里塞三个他没打过的字符**，
代价却是零收益——所以不写。换回来的是本仓一直想要的那条性质：**打开再存，字节不变**
（从前那条路是 `甲\n\n<br />\n\n乙` → 打开 → 存盘 → `甲\n\n乙`，第一次存盘写进去的
东西第二次存盘又自己没了）。

⚠️ **代价与边界，说在明处**（全是 2026-09-26 实测）：
- **用户敲出来的空段落，存盘再打开就没了**——这**不是本文件造成的**（上面那张表已经
  证明它今天也活不过一次重新打开），本文件只是让**文件里的字节**别再假装它留住了；
- ⚠️ **整篇都是空段落时会留一个占位**（新建的空文档、整篇只有一个空行的文件）——但那个占位**只活在序列化那一步**。⚠️ 2026-09-26 晚在全新 `dist` 下实测：它**不会**落到用户文件里（见下面那张表的最后一行，磁盘上是 0 字节）。原先这里写的"空文档存盘 = `<br />`"是错的。
  这**不是妥协，是必须**：空段落一个都不产出 ⇒ mdast 根节点的 `children` 是 `undefined`
  ⇒ 上游 `mdast-util-to-markdown` 的 root handler 第一行 `node.children.some(...)`
  **当场崩**。症状**不是报错，是空文档永远停在「正在准备编辑器…」**（`EditorPane` 那个
  `catch` 把它弹成一条 toast，几秒后自己消失，更难认）。所以 `doc` 那一层也挂了一条
  （`empty-paragraph.ts` 里的 `文档别导出空根`，判据是"顶层块**全部**是空段落"），
  整篇空的时候照旧留一个占位：**"跳过空段落"和"根节点不能空"是一对，拆开任何一个都会炸。**

⚠️ **判据不能是"跑一遍 `getMarkdown` 看不看得见"**——这一族的症状是
**字节**级别的一字之差，只有真的比字符串才看得见。
⚠️ **而且探针必须是端到端的那一条**：2026-09-26 拿**同一个表格样本**跑两条路，
结论**相反**——

| 跑法 | 空单元格 | 分隔行 |
|---|---|---|
| 裸 `remark-parse` → `remark-stringify`（**不经过 ProseMirror**） | `\| 1 \|   \|`（只多一个空格） | `\| - \| - \|` |
| 真窗口：打开文件 → `Ctrl+S`（真管线） | `\| 1 \| <br /> \|` | `\| ------ \| ------ \|` |

`<br />` **只在真管线里出现**（它由上面那条 PM 侧的 paragraph 序列化产生），所以裸
remark 探针**不能用来证明"没问题"**——它只够快速排掉纯 stringify 选项那一类
（`bullet` / `rule`）。⚠️ 真窗口那条是**幂等**的：连按三次 `Ctrl+S`，md5 不变。
**逐条记在 `docs/07` §4 第 56 项**。

⚠️ **改完之后又端到端跑了一遍**（2026-09-26 第二轮，判据仍然是字节，`docs/06` §5.30）：

| 场景 | 存盘后的字节 | 结论 |
|---|---|---|
| 正文里连敲两次回车（段落间两个空段落） | `甲\n\n乙\n` | ✅ 一个 `<br />` 都不写；再按两次 `Ctrl+S` md5 不变 |
| 空表格单元格 | `\| 1 \|   \|` | ✅ 不写 `<br />`；幂等 |
| 新建的空文档（0 字节或整篇只有一个空行） | **0 字节** | ✅ 一个字符都不写。⚠️ **原稿这里填的是猜的 `#  <br />`，2026-09-26 晚实测推翻了**：占位没到落盘 |
| 只留"跳过空段落"、摘掉"根节点不空" | 分屏右栏停在「正在准备编辑器…」 | ⚠️ **代价**（实测复现）：`mdast-util-to-markdown` 的 root handler 抛 `node.children.some`。**两条必须成对** |
| 打开一份文件 → 存盘 → 再打开 → 再存盘 | 字节不变 | ✅ 这就是这次要换的那条性质 |


### 4.8 图片：一个上游疏漏导致**存盘丢图**（`editor/image-attrs.ts`，2026-09-24）

⚠️ **这条是 P0，症状是数据丢失**：打开一份带 `![图](a.png)` 的文档、存盘，
**图片从文件里消失**（不是画不出来，是字节里连 `![](...)` 都不剩）。
不带 title 的会丢、带 title 的不会——这条对照指向的正是根因。

根因在 `@milkdown/preset-commonmark`：image 节点三个属性都写成
`validate: "string"`，而它自己的解析器把 mdast 的 `title: null` 原样递进来，
校验不过 → 节点被解析器默默跳过。**同一个包里的 link 写的是
`validate: "string|null"`，所以只有图片有问题**——是上游少写了一个 `|null`。

补法：`image-attrs.ts` 挂一个 `$remark` 插件，在 **mdast → ProseMirror 之前**
把 image 上的 `null` 抹成 `""`。⚠️ 三个要点：

1. **必须在 `.create()` 之前挂**，建完实例再挂等于没挂（转换就发生在建实例时）。
2. **只读实例也要挂**——分屏预览和导出同样会把 markdown 变成文档，
   不挂的话**导出 HTML 里的图会少**（而正文里看着是好的，最难查）。
3. **不给"上游哪天修了"留坑**：真修了，这个插件变成一段不命中任何东西的多余代码，
   那时删掉即可（判据写在它自己的文件头上）。

⚠️ **`docs/10` 里"插入图片有了"那句话在 2026-09-24 之前是错的**：插入本身一直是好的，
**是"插进去 → 存盘 → 再打开"这条链会丢**。这正是 `docs/10` §10 第 3 条
「点过才算数」要防的那种"有代码、链子断了"。

### 4.8b 插图这条链怎么走（`ui/useImageInsert.ts`，2026-09-26）

上面那一节说的是"图片**已经在**文档里、别再丢"。这一节说的是"**怎么进去**"。

```text
① 对话框（格式 → 图像 / 工具栏 / 快捷键）  ui/ImageDialog.tsx
② 粘贴（Ctrl+V，剪贴板里是 image/*）        ui/useImageInsert.ts
③ 拖入（从文件管理器拖一个图片文件）        同上
        │  三条路合成同一个「哪张图」——{kind:"path"} / {kind:"url"} / {kind:"base64"}
        ▼
   ┌── ①而且勾了「插入后上传」？ ───────────┐
   │ 是 → api.image.uploadOne(…)        ← 2026-09-26 第二批加的**手动**那条路
   │       成功：src = 传回来的网址（磁盘上不留第二份）
   │       失败：**退回下面那条**，并把错误如实报一句
   └ 否 / 上传失败 → api.image.place(docId, source)  ← 宿主那边是唯一一份算式
        │  返回 {src, savedTo, did, action, upload?}
        ▼
run("image", { src, alt })             ← **不直接碰编辑器句柄**，见下
```

⚠️ **两条路方向相反、结果相同**（2026-09-26 第二批）：**手动**那条**只有对话框有**
（粘贴与拖入没有那个勾），它是**先传、失败才落盘**——用户此刻要的就是那条网址。
**自动**那条三条路都有（条件是这份文档的 front matter 写着 `nota-auto-upload`
**且**设置里开着自动上传），它在 `place` **之后**跑：传成功才把 `src` 换成网址
（提示里会补一句本地那份留在哪），失败就**保留本地地址并如实报错**。
方向不同、要的是同一件事：**文档里总有一条能用的地址**——上传失败绝不能把图弄丢。
⚠️ **自动那条永远只对本地来源发生**：网络地址不是这台机器上的文件，
自动去取它等于替用户访问一个第三方。手动勾选时那条路才走（服务器自己按地址去取）。
细节在 `commands/image_upload.rs` 与 `src-tauri/src/upload.rs` 的文件头。

⚠️ **插入这一步走 `run`（`EditorCommand` 白名单）而不是直接调 `EditorPaneHandle`**，
理由只有一个：**"这个模式下做不做得到"那个判据在 `run` 里**。源码模式插不了图，
`runCommand` 会返回 `false`，`run` 把它翻成一句「当前编辑模式下还没有这个操作」；
绕过 `run` 直接插，用户看到的是"点了没反应"。

⚠️ **提示语在前端拼，宿主只说事实**。宿主回的是 `did`（`kept` / `copied` /
`downloaded` / `written` / `existing`）与 `action`，`useImageInsert` 把它翻成
「图片已复制到 …」这类句子。**反之（宿主直接回一句写死的字）会让界面换语言时它说不出口**
——`docs/03` §10 那张表里的 `ImageDid` 就是为这条留的。

⚠️ **只有真的动了磁盘才提示**：`did === "kept"`（留在原处）不弹——那本来就是
用户选的「无特殊操作」，再弹一条是噪音。⚠️ **上传（无论手动还是自动）都不走 `did` 那一套**
（它没动磁盘）：说的是「图片已上传到 …」，来源是宿主回的 `upload`（`{kind:"ok", url}` /
`{kind:"failed", error}`）。⚠️ **自动那条两种情况都要说话**——它是"把用户的字节发出去"，
成功了不报等于悄悄发、失败了不报等于让人以为图丢了。⚠️ 但**剪贴板那条是唯一的例外**：
它没有"原处"可指，宿主会把 `none` 退回 `copy-to-assets`，于是
`action === "copy-to-assets" && did === "written"` 时**额外说一句**
「剪贴板里的图片必须先存到磁盘，已按「复制到 ./assets」处理」。
**这是全仓唯一一处"设置说的和做的不一样"**，不说出来用户会以为设置没生效。

⚠️ **粘贴挂在 `document` 的捕获阶段，而且必须 `preventDefault`**（见那个文件头）：
ProseMirror / CodeMirror 对"剪贴板里是图片"的处理是**把那坨二进制丢掉**；不拦住的话，
编辑器会当成"没有可插入内容"，而我们同时已经异步去落盘了——**两条路都在跑，谁先到看运气**。
⚠️ 只在粘贴目标是编辑区里时才接手（`在编辑区里`），其余一律放行。

⚠️ **拖入走 Tauri 的 `onDragDropEvent`，不是 HTML5 的 `drop`**：`tauri.conf.json` 里
`dragDropEnabled: true`（默认值），窗口拖放由 Tauri 在**系统层**接管，WebView 里那个
`drop` 事件**根本不带 `dataTransfer.files`**。⚠️ 拖入只认「编辑区有焦点」——这是
**有意的简化**：拖放事件不给"落在哪个元素上"（Tauri 只给屏幕坐标），按坐标猜插入位置
猜错的代价是图插到别的段落里，所以插入点就是**当前光标**。

⚠️ **一次拖好几个文件时只插第一个图片**：同时插一串，用户还得一个个删。

---

### 4.8c 「图片语法指向视频」是怎么接的（`editor/video-view.ts`，2026-09-28）

用户原话（点名的一串小功能里的一条）：「**图片语法指向 `.mp4` 当视频**」。

📌 **2026-10-17 同一条 NodeView 还接管了本地图片路径**：绝对路径、`file://`、
相对路径与 Windows 盘符先算成本机绝对路径，再由宿主 `nota_image_data_url`
读成 data URL 设置到屏幕上的 `<img>` / `<video>`。Markdown 的 `attrs.src`
一个字节不改。这样不再依赖 WebKitGTK asset 协议，中文目录、SVG 和 dev server
下都不会静默只剩 `alt`。相对路径的基准来自 `CreateOptions.文档路径`；没存过盘
的文档不猜。图片另有 `max-width:100%; height:auto`，不会按原始 1254px 撑破正文。

`![](a.mp4)` 今天渲染成 `<img src="a.mp4">`，浏览器画不出图，产物是一颗破图标
＋ `alt` 那行字——**而 Markdown 源码是对的**。所以这一条**只改屏幕**。

```text
`![](a.mp4)`  ──解析/序列化──▶  还是那个 image 节点（一个字节没动）
                     │
                     ▼  NodeView 只决定"画成什么"
      地址后缀命中 视频后缀 ？
        ├ 是 → <span class="nota-video"><video src controls preload="metadata">
        └ 否 → <img src alt title>   ← 与 preset 的 toDOM 逐条对齐
```

四条要紧的：

1. **判据只有后缀**，而且**复用** `editor/file-kind.ts` 的 `后缀()`。⚠️ 先
   `split(/[?#]/, 1)` 切掉查询串与片段——`a.mp4?t=3` / `a.mp4#t=3` 是常见写法，
   不切就会读成 `mp4?t=3`，症状是"带时间戳的链接画不成播放器"。
2. **`.mov` / `.mkv` / `.avi` 有意不认**：那些容器的编码不保证播得动，
   认了就是一块**黑框**（比破图标更糟——破图至少写着 `alt`）。
3. **不改 schema、不接解析与序列化**：走 `$view`，`![](…)` 的读写仍是上游那套，
   所以"打开再存字节不变"与这一条无关。
4. ⚠️ **导出那条路要靠文档主题里的 CSS**：`editor/export.ts` 摘的是渲染后的
   `innerHTML`，而它会把 `nota-` 开头的类名**全摘掉**——`src/styles/video.css`
   里那条选择器在导出的 HTML 里一个字都匹配不上。尺寸约束只能写成**元素选择器**，
   也就是 `themes/*.css` 里那一句 `video`（三份都要有，`tests/video-view.test.ts`
   第三组盯着）。

⚠️ 三件没验的事（点播放按钮、拖进度条、全屏）见 `docs/07` 第 87 项与 §4——
本仓的编辑器测试没有 DOM，只能开窗目检。

### 4.9 标题**回车才成块**（`editor/heading-on-enter.ts`，2026-09-26）

用户原话：「我又看了看 Typora 做法。人家是输入 `# 你好` 之后，只是加粗，按下回车才成为标题。
成为标题后，如果在行头直接退格，则直接删掉标题」——同一批里还有更早那句抱怨：
「输入一个 `#` 后按了一下空格 `#` 就自动变位置。手感很差。应该作为**标识符**的 `#` 不要变换位置和大小。」

**上游原来那条 `wrapInHeadingInputRule`**（`textblockTypeInputRule(/^(?<hashes>#+)\s$/, …)`）
在**刚敲下那个空格**的瞬间就把整段变成 `heading`，`#` 被吃进语法里、从此在文档里不存在。
那一下同时发生三件事：① 字号从正文跳到 h1（**变大了**）；② 那个 `#` 字符消失、同一时刻灰色标记
从左边 56px 的装订线里冒出来（**位置跑了**）；③ 行宽变了、光标跟着重排（**找不到光标了**）。
用户看到的正是"`#` 自己跑了，还变大了"。

**现在**：`# 你好` 在按下回车之前**一直是段落**（井号就是普通字符，位置字号都不变），
只是井号后面那段文字按**粗体**显示（`.nota-heading-pending`，装饰不进文档）；
回车 → 掐掉 `# ` 前缀、换成真标题、**并把下一段开出来**。

⚠️ **宽松那条（`#你好`，井号后没空格）2026-09-30 并进了同一条路**——没按回车时一样
只加粗，按下回车一样变成标题块。下面这几段讲的都是两档共用的，只有"认不认 `#你好`"
这一步分档（判据在 `atx.ts`）。见 §4.9c。

- ⚠️ **"并且把下一段开出来"是必须的**，不是顺手加的：第一版只换块类型、光标留在标题末尾，
  实测症状是敲 `# Hello` ＋ 回车再敲 `second line`，屏幕上出现 **`Hellosecond line`**——
  因为"回车"在这个编辑器里**到处**都是"换到下一段"（`baseKeymap` 的 `splitBlock`），
  只有这一处不换行，用户一定会撞上。Typora 那边回车也是两个动作一起做。
- ⚠️ **`# 你好` 这一步不动文件里的字节**：段落 `# 你好` 序列化出去就是 `# 你好`，而它
  本来就是 markdown 的一级标题——**按不按回车，存进文件的是同一串字节**。代价是一个
  **有意留着**的小出入：敲了 `# 你好` 直接存盘再打开，那一段会是**真标题**（解析器认的
  就是它）。⚠️ **宽松那条不是无损的**：`#你好` 成块后序列化出去是 `# 你好`（多一颗空格），
  见 §4.9c 那条"代价一处"。
- ⚠️ **行首退格是另一个方向的动作，见 §4.9b**。（这一格原先写着"降级这个文件一行都没写、
  别在这儿再写一份"——**那是 2026-09-26 第一轮的旧稿，当天第二轮就作废了**：上游那套是
  **逐级**降级（`###`→`##`→`#`→段落），用户点名不要它，所以本文件确实写了
  `标题行首退格` 把上游盖掉。别照旧稿读成"本文件不该碰退格"。）
- ⚠️ **只推迟标题，别的标记照旧敲完就变**：列表 `- `、引用 `> `、分割线 `---`、任务项 `[ ] `
  都没动——它们的标记画在同一个装订线里、块本身字号不变，没有"标记跑掉、变大"这回事；
  而"打 `- ` 立刻出圆点"是肌肉记忆。代价说在明处：**在标题里打 `#` 不再加级**（那条逻辑
  长在被摘掉的输入规则里），改级数走菜单或 `Mod-Alt-1..6`。
- 三道守卫（各自对应一种"抢了别人的活"）：**只在行尾**成块（行中间那一下回车是拆段）、
  **表格格子里不干**（归 `table-input.ts`）、**只读实例不干**。

- ⚠️ **同一批修掉的 BUG-42：回车成块之后整块往下跳 67px。** 症状只在**文档最上面那一个块**上出现：
  空文档里打 `# 你好`、按回车（这个文件把它换成真标题），整块当场往下掉。根因不在这个文件里，
  而在主题那侧——段落的 `margin-top` 只有"兄弟之间"这一条（`editor.css` 的
  `.editor-mount .ProseMirror > * + *`），而标题另有**文档主题**给的一条
  （`minimal` 2.4em / `adwaita` 2em / `latex` 2.6em，按 `h1` 自己的 1.9em 字号算 ≈ 73px）；
  成块之前它是 `<p>`、吃不到那一条，成块那一瞬间它就生效了——而这段文字**上面根本没有上一段**。
  修法是 `editor.css` 里一条**权重压过主题**的规则
  （`.editor-mount .ProseMirror > :is(h1, h2, h3, h4, h5, h6):first-child { margin-top: 0 }`，
  3 条对主题的 2 条）：主题管"标题长什么样"，不管"文档从哪儿开始"。
  ⚠️ 这是**唯一**一处 `editor.css` 故意压主题的地方，加第二处之前先想清楚边界的事（见 `docs/04` §3.3）。
  量出来的数、以及"中间那个标题没被误伤"的判据记在 `docs/07` §2 的 BUG-42 行。

### 4.9b 标题**行首退格直接变回段落**（`editor/heading-on-enter.ts`，2026-09-26 第二轮）

**用户原话**：「如果是任何有标题的文档，在任何标题前按退格**统一直接删除所有标题**，
而非从 `###` 变到 `##` 再 `#`。」

**上游那套是逐级降级**：`downgradeHeadingCommand` 绑在 `Backspace` / `Delete` 上，
`###` 按一次退成 `##`，再退成 `#`，再一次才变段落。用户点名不要它。

**落点**：同一个文件里的 `标题行首退格`，`$shortcut`，**`priority: 60`**——
靠优先级盖掉上游那条，而不是把上游从 `commonmark` 里 `.filter()` 掉。
⚠️ 两个键**都给**（`Backspace` 与 `Delete`）：上游也是这一对，只给一个的话
"同一个位置按另一个键还是逐级降级"，那是用户最难描述的一类不一致。

⚠️ **与"回车才成块"是一对相反方向的动作**，两件事挤在 `heading-on-enter.ts`
里是有意的（同一个语义的两端，分开放必然漂移）。改一个先看另一个。

⚠️ **它不依赖严格模式**：用户同批说过「另外我没开严格模式」，所以判据里
**不能**出现"先问一句这是不是合法标题"那种分支——标题块的判定走的是
**节点类型**（`state.schema.nodes.heading`），跟文本怎么认标题（那是
`atx.ts` 那张判据表，正文装饰那侧见 §4.9c）是两回事。⚠️ 也正是靠这一条，
2026-09-30 那批把宽松档并进"回车才成块"时**这个函数一个字都没改**。

### 4.9c 宽松那条**并进了同一条路**（`editor/heading-on-enter.ts`，2026-09-30）

用户 2026-09-29 晚报点名要「**输入时，先不放大，等用户回车后再放大**」，当天落地的却是
**另一条路**：宽松档 `#你好` 在那段文字上按**该级标题字号**排（`nota-lax-heading` ＋
`data-lax-level`），只在你"正在写这一段"的时候先不放大。

**2026-09-30 用户把要的长相说清楚了，那一条路整个删掉**：

> 不开启严格模式下如果没有空格出现如此问题。
> ……类似 `# 你好`。就是不回车只是显示加粗，回车变成标题。

**于是 `#你好` 和 `# 你好` 从这天起走完全同一条路**：

| 时刻 | 两档的长相（完全一样） |
|---|---|
| 输入中（还没按回车） | **只加粗**——井号后面那段文字挂 `.nota-heading-pending`，字号行高一个不动 |
| 按下回车 | **变成真标题块**，字号这时才跳（之后由 `h1`~`h6` 排） |
| 已经是标题块了 | 不再进装饰——**那正是这一版判"写完了没有"的方式** |

⚠️ **上一版判的是"光标还在不在正在写的那一段"，这一版判的是"是不是标题块"。**
差别全在**点走、切窗口、敲方向键**这三下上：老判据把它们统统当成"写完了"，那一段
当场跳成标题字号——而用户连着两次（09-26「输入时，先不放大」＋ 09-30「回车变成标题」）
点的都是同一件事：**"写完了"那一刻该由回车划，不该由光标划**。新判据里光标在哪儿
**完全不参与**，那三下什么都不发生。

⚠️ **严格档那侧一个像素都不动**：`atxPrefix(text, true)` 不认 `#你好`，所以严格档下
它既不进装饰、也不成块（回车走 `baseKeymap` 的普通换行）。

⚠️ **代价一处，如实记着**：宽松档下 `#你好` 按回车成块之后，序列化出去是 `# 你好`
——**多一颗空格**（标题节点固定是"井号 ＋ 空格 ＋ 正文"）。这**不违反**"宽松模式一个
字节都不改"：那条管的是**存盘时不许自动修复**（§4.9 最后一条），而这里改字的是
**用户自己按下的回车**，他要的就是"变成标题"。**不按回车，一个字节都不动。**

⚠️ **删掉的东西，别照旧稿搬回来**：`宽松标题类名`（`nota-lax-heading`）那个导出、
`marks.css` 里 `.nota-lax-heading[data-lax-level="1"…"6"]` 那一整组规则、`export.ts`
属性白名单里的 `data-lax-level`，以及插件里那个记"正在写哪一段"的 `state.apply`。
`待装饰` 类型跟着瘦成 `{起, 止}`，`建装饰集` 不再收"正在写的段"参数——
**插件里现在一点可变状态都没有了**（缓存那份条目数组除外）。

⚠️ 落点两处，改一个先看另一个：`算装饰条目`（只扫文档 → 条目数组，仍按 `state.doc`
缓存）与 `建装饰集`（一视同仁套同一个类名）。判据 **19 条**在
`tests/heading-on-enter.test.ts`——⚠️ **它证明不了回车那一下**：`回车成标题` 要一份真
`EditorView`（要 `editable`、要能 `dispatch`），测试里没有视图，"按了回车真的成块、
真的开出了下一段"是开窗目检的事。

### 4.10 图表块：上游**不画图**（`editor/diagram-view.ts`，2026-09-26）

⚠️ **2026-10-04（第 27 项）**：`@milkdown/plugin-diagram` **整个退役**——本节的
"上游只做三件"仍然是对当年的准确描述，但那三件（外加输入规则、命令）现在是
**本仓自己的** `editor/diagram-node.ts`（判据逐行照抄，`attrs.value`/`identity` 等形状一个没动）；
`package.json` 里那一行删掉了、`import mermaid` 也改成 `diagram-view.ts` 里的动态 import。

它当年只做三件：把 ` ```mermaid ` 围栏转成 `diagram` 节点、给 schema、
给 `toDOM`——而那个 `toDOM` **只有一句 `dom.textContent = code`**，全包**没有一处**调
`mermaid.render`。"把源码画成图"这件事它**从来没打算做**，是留给宿主的；本仓此前没写，
所以 ` ```mermaid ` 在编辑器里的表现是围栏被吃掉、源码退化成一坨正文。

- **为什么"平时看图，点一下才切成源码"**：`diagram` 是 `atom: true`、**没有 contentDOM 可给**
  （源码在 `attrs.value` 里），所以"改源码"只能是 NodeView 自己摆一个输入控件再写回属性。
  并排的版本在文档里太吵（一屏三个流程图 = 三块 textarea）；收起来的代价是**多一次点击**，
  于是出错卡里也放了一颗「编辑源码」。进源码模式后**图不会消失**（源码框在图上边），
  边改边看，语法错修好的一瞬间图就出来了。
- ⚠️ **文档里的真相永远是源码**：渲染只是显示，**渲染失败绝不回写文档**
  （`渲染` 那条路上一次 `dispatch` 都没有）。mermaid 抛错时**自己收尾**（`清除残留`）——
  它失败会把一张"红炸弹"错误图留在 `document.body` 上不收，块里改出的是**不吓人的说明卡**
  （中文说清是语法错 ＋ 附上 mermaid 的原文报错）。
- ⚠️ **宽度上限取 `viewBox` 的自然宽**（`min(100%, 自然宽)`）：写成 `100%` 会让**小图**
  被容器宽度等比放大（2026-09-26 实测）。
- ⚠️ **mermaid 是 `package.json` 里的显式依赖**：它装在嵌套位置，而 `plugin-diagram` 的
  `exports` 只声明了 `"."`——直接 import 那个嵌套路径 `tsc` 与 `vite` **都**报
  `Missing specifier`；相对路径能绕过 `exports` 但把"npm 怎么摆目录"写死进源码。代价是包体
  （mermaid 按图类型动态 import，`dist/assets/` 会散出几十个分块）。
- 缓存按 `identity`（plugin 给每个节点发的随机 id）＋ 明暗 ＋ **源码逐字相同**，**失败也缓存**；
  缓存是**模块级**的，故意的（只读预览格是另一个 Editor 实例，同一份源码在那儿会再画一次，
  同一 identity 命中同一条）。

### 4.10b 改动预览期间，**分屏右栏要跟着预览走**（`ui/EditorPane.tsx`，2026-09-26）

**用户报的现象**（截图）：AI 产生改动、点「在编辑器中查看」之后，左栏一红一绿，
**右栏却是一片空白，只剩一个孤零零的 `H2` 徽章**。

**根因**：右栏（分屏预览那个只读实例）的内容**只有 `onChange` 一个来源**
（`pushPreview`），而审阅期间文档被 `filterTransaction` 锁住 ⇒ **一个 `onChange` 都不会来**
⇒ 右栏永远停在上一次的内容上。那个"只剩一个标题徽章"的样子就是它装载时解到哪算哪，
不是另一条代码路径。

**改法**：加一条 effect，**审阅状态一变就把 `改动预览.text`（"应用之后该长什么样"）
推给预览实例**；`review` 变回 `null` 时推 `latestRef.current`（当前正文），
右栏自动回到原文。
⚠️ 依赖数组**只有 `[review]`**：把 `latestRef` 写进去会让每次输入都重推一遍——
预览实例是只读的、没有回显，但那样等于让右栏跟着**键盘**走，而它该跟着**审阅状态**走。

**实测**（2026-09-26，隔离 `XDG_CONFIG_HOME` ＋ `tools/stub-openai.py` 的 `STUB_MODE=replace`，
**没碰用户真实的密钥文件**）：点 Polish → 面板出改动块 → 点「View in editor」
→ **右栏显示出改动后的全文**；磁盘文件全程没变（`od -c` 复核过）。

⚠️ 这一条**早先"验过一次"是无效的**：那次跑的是 `dist/` 里的旧产物，
改的代码一个字都没进去。**原因与自检办法见 `docs/06` §5.30**——这一批被它坑了整轮。

### 4.11 光标处的两类提示 ＋ 原子后面那颗空格（2026-09-26）

三件"编辑器手感"的小事住得近，一起说：

**① 行内标记的提示（`editor/mark-hint.ts`）**——用户原话：「我认为如果光标在黑体/斜体内容内，
可否半透明显示*？」光标落进**加粗**／*斜体* 时，把那两个 `**` / `*` 半透明画在那段文字左右。

- ⚠️ **走 `Decoration.inline` ＋ `::before`/`::after` ＋ `content: attr(data-markhint)`**，
  **不插 widget**——那正是 `instant-render.ts` 试过的第一版，插进去的 `<span>` 会被 ProseMirror
  当成正文的一部分（"打出来的字跑到标记前面去"、光标进不去、退格删不掉）。**只改显示不改文档的
  事一律走 Decoration。**
- ⚠️ 这**不是**要让 `**` 变成可编辑的真字符（那是 `docs/07` 第 37 项）。用户要的是"看得见"，
  不是"能编辑这个符号"，所以不动 schema、一个字节都不写回。
- ⚠️ **代价讲清楚**：这两个符号是**占宽度**的（真真切切的 `::before`/`::after`），光标进出
  加粗段时那一行会横移两个字符宽。选它是因为用户反复拿 Typora 当参照（那边就是把 `**` 原样
  显示出来）。想改成不占位的浮标只改 `marks.css` 那一条，**这个文件一行都不用动**。
- ⚠️⚠️ **那张表里的名字是 schema 里 mark 的 id**，不是中文、不是节点名、**也不是 Markdown 语法
  里的名字**：斜体是 **`emphasis`**，**不是 `em`**。2026-09-26 就栽在这儿——症状是"加粗的
  `**` 出来了、斜体的 `*` 怎么都不出来"，**悄悄错了一版**。两道防线：`tests/mark-hint.test.ts`
  拿**真 preset** 的 id 对表 ＋ 运行期取不到 `console.warn`（只报一次，否则每次光标动都刷屏）。
- ⚠️ 符号**一律写星号**（不写 `_`/`__`）：本仓 serializer 对加粗/斜体一律输出 `**`/`*`。
  写了别的就是"屏幕上的和存出来的不一样"——那正是这一整个功能要消掉的东西。
- ⚠️ **只给可编辑实例装**（`create.ts` 那句 `readOnly ? [] : [markHint]`）：只读实例有两个
  （分屏预览、导出 HTML 的离屏实例），装上会在预览里多出 `**`、还会被带进导出文件。
  这也正是为什么 `editor/export.ts` 的 `摘掉的属性` 里**没有** `data-markhint`——没挂上去，
  就没有第二个地方要记。
- ⚠️ 只对**光标是一个点**时显示（框选一片时不显示，与 `instant-render.ts` 同一条判据）；
  一个 mark 一条装饰，所以 `***又粗又斜***` 拿到两条、并排画出来正好是 `***`。
- ⚠️⚠️ **两个符号的画法不一样**（2026-10-05，**BUG-65**）：**左**符号是 `::before`
  （挂在那段文字上——光标停在标记**起点**时落在它右边，本来就对）；**右**符号是
  **`Decoration.widget(段.到, …, { side: -1 })`**。⚠️ **为什么右符号不能用 `::after`**：
  `::after` 画在那段文字**里面**，光标停在标记**终点**时会被它挡在**左边**（`你好|*`），
  看着像"卡在斜体里出不去"（用户原话：「光标无法移动到右边 `*` 的右侧。因为这里 `*` 不是实体了」）。
  `side:-1` 的语义（`prosemirror-view` 的 `WidgetType.side` 原文）是"**画在光标左边、在那里插进去
  的内容落在 widget 后面**"，于是光标贴段尾时画出来是 `你好*|`。
  ⚠️ **口径是用户拿 Typora 的两张图定的**：图 1 `*你好*|`、图 2 `*你好|*`——**两颗符号都在**，
  光标能在两侧移动；光标走开才消失。⚠️ **功能侧与它一致**：在段尾打字落在斜体**外面**。
  ⚠️⚠️ **中途翻过一次车**：当天**先**做的是"段尾那一格整个不画"（`扫一段` 收紧、注释里写成
  "光标的位置在撒谎"），**当天就被那两张图推翻**——躲开不画不是 Typora 的做法。已回退，
  `扫一段` 的边界口径回到原样。⚠️ 判据 `tests/mark-hint.test.ts` **18 条**。

**② 原子后面那颗空格（`editor/atom-space.ts`）**——2026-09-26 目检发现：行内公式后面紧跟
一个空格，存盘时那个空格是 **U+00A0**（不换行空格，`cat -A` 里是 `M-BM- `），不是用户敲的空格；
同一份文件里"两边都是普通文字"的那一行是正常空格——**只发生在行内原子节点后面**。

- 根因是 **WebKit**：编辑引擎在**不可编辑的行内元素**（公式、图片这些 `contenteditable=false`
  的原子）后面插空格时会改用不换行空格——它怕这颗空格挨着非文本元素被折叠掉。代价是那颗 NBSP
  成了**文档里的字符**：不换行、看不见、用户没敲过。

⚠️⚠️ **修法换了三版，前两版都是错的**——这一段值得整段读完再动这个文件：

| 版本 | 做法 | 为什么不行 |
|---|---|---|
| 一 | ProseMirror 的 `handleTextInput` / `handleKeyDown` 拦下来 | **开窗实测里那颗空格会丢**：拦下来插的是普通空格，而浏览器在**紧跟着的下一次编辑**里会把它清掉（WebKit 当初改 NBSP 正是为了不让它被清）。单测全绿、真窗口丢字符 |
| 二 | `$remark("nota-atom-space", …)` 挂一个树转换器 | **静默空操作**：unified 的 `stringify()` **只调编译器、不跑转换器**（`unified/lib/index.js:995`），而 Milkdown 的序列化器走的正是 `remark.stringify(...)`（`@milkdown/transformer/lib/index.js:374`）。`tsc` 干净、单测全绿、开窗不报错，**一次都没执行过** |
| 三（现在） | 包一层 **`handlers.text`**（`mdast-util-to-markdown` 的公开扩展点，Milkdown 原样透传） | 只在**序列化**那一趟生效，编辑器里随 WebKit 去 |

- 第三版的判据收得很紧：**文本节点开头那颗 NBSP ＋ 前一个兄弟是行内原子**，两个缺一不可。
  别处的 NBSP 一律不动（用户粘进来的、自己写进公式源码里的都是他的内容）。
  ⚠️ 那张"行内原子"表里的名字是**序列化时 mdast 的节点名**，照上游 `toMarkdown` 抄的：
  `inlineMath` / `image` / **`break`**——⚠️ **硬换行是 `break`、不是 `html`**，写错不会报错，
  只会一直不生效。
- ⚠️ **代价（如实记着）**：**编辑器里那颗字符仍然是 NBSP**——`Ctrl+F` 搜 `A$bb$ B` 搜不到，
  复制出去也带 NBSP。这是**换来"空格不会丢"所付的钱**。
- ⚠️ **不是这次改动引入的**，是行内公式一直有的老毛病（`h1.md` 里那次目检的字节还在）。

**实测（2026-09-26，无头 `:98`，`od -c` 读落盘字节；动作与判据见 `docs/06` §5.22）**：

```text
装  handlers.text 的包装：  打 `A$bb$␣BCD` → 文件 `A$bb$ BCD`   （0x20）
摘掉那个包装（A/B 对照）：  同一次动作 → 文件 `A$bb$\302\240BCD`（C2 A0 = U+00A0）
```

⚠️ **那个对照必须做**：不做就分不清"是包装生效了"还是"这次 WebKit 没插 NBSP"。

### 4.12 开头那段 front matter：**不进编辑器**（`editor/front-matter.ts`，2026-09-26）

⚠️ **这一条是 §4.7 那一族里最重的一个成员：它会毁数据，而且毁得很安静。**
`---` 在 CommonMark 里叫**分割线**，所以一段 YAML front matter 进编辑器是"一条分割线
＋ 正文"，出来时**收尾那行 `---` 被吃掉、`theme: seriph` 被当成 setext 标题**：

```text
存盘前                     打开再存盘之后
---                        ---
theme: seriph     ⇒
---                        ## theme: seriph
```

用户一个字没敲，文件里的 front matter 就没了——而且**所见即所得里本来也看不出**
（它长得就像正文）。**根因与实测记录见 `docs/07` §4 BUG-39**。

⚠️ **2026-10-04（第 63 项）**：`front-matter.ts` **多导出一个 `前置块行数()`**——
`editor/headings.ts::extractOutline` 跳过开头 front matter 用的就是它（**判据只剩这一份**，
"大纲藏的"与"编辑器藏的"不会再对不上；BUG-32 现场与"`---` 没闭合"两处兜底都自然成立）。

**修法是"在边界上原样留住"**（`editor/front-matter.ts`，两个纯函数）：

| 口子 | 做什么 |
|---|---|
| 建实例（`defaultValueCtx`）/ `setMarkdown` | 把开头那段切下来存进闭包变量，**只把正文**喂给编辑器 |
| `getMarkdown` / `onChange` 报出去的 | 把切下来的那段**原样拼回**（调用方见到的始终是整篇） |

- ⚠️ **持的是原文切片**（含首尾两行围栏、连换行一起），不是重新拼行——CRLF、
  行尾空格、缩进写法一个字节都不动。**围栏后面那几行空行也算在里面**：那几行不在
  这一侧留住，编辑器会把正文开头的空行顺手删掉，于是"打开再存"又差一个字节。
- ⚠️ **判据保守**（`---` 首先是分割线）：首行必须是 `---`、后面找得到闭栏
  （`---` 或 `...`）、中间那几行**看起来像 YAML 映射**（`键: 值` / 注释 / 缩进续行）。
  拿不准就**原样还回去**（等于今天的行为）。已知的误伤写在 `front-matter.ts` 文件头。
- ⚠️ **只读实例也切**：分屏右侧预览与导出用的离屏实例同样只该画正文——front matter
  是元数据，不该出现在预览和导出的 HTML 里（从前它会画成一条分割线 ＋ 一个二级标题）。
- ⚠️ **源码模式（CodeMirror）不经过这里**：它手里就是原文，那几行照旧看得见、改得动。
- ⚠️ **所见即所得里看不见也改不了**，所以正文顶上挂了一条**说明条**
  （`.editor-frontmatter-note`，`ui/EditorPane.tsx`，只在这一侧画）。不说明白的话，
  用户会以为开头那几行丢了。
  📌 **2026-10-04（第 64 项）那条说明条换成了可编辑的横幅**（`.editor-frontmatter`，
  `ui/EditorPane.tsx`，仍是只在这一侧画）：标题 ＋ 一个「编辑 / 完成」按钮（开合那块
  `<textarea>`）＋ 一个**两下才认**的「删除」（第一下把按钮变成「确认删除」、4 秒不用
  自己撤销）。⚠️⚠️ **清空 ≠ 删除**：框里敲成空的**什么都不做**（把用户的 front matter
  抹掉是这一格唯一不能犯的错）。⚠️ **每敲一下就提交一次，不做去抖**——代价是每次
  按键一笔撤销，换来的是"绝不会有一笔改动没被记下"。
- ⚠️⚠️ **它走的是 `runCommand("frontMatter", …)`，不是 `markdownUpdated`**——
  `create.ts::写前置块` **直接调 `onChange`**。理由：`markdownUpdated` 只在
  `markdown !== prev` 时触发，而只改 front matter 的那次编辑**序列化出来的正文一个字
  没变**，那条监听器根本不会响——文档就永远不会被标脏，自动存盘会把这次改动**静静丢掉**。
  ⚠️ 于是 `frontMatter` 是 `EditorCommand` 白名单上**唯一的例外**（它改文档文本、
  不改文档树 ⇒ **不进出撤销栈**），理由写在那个联合类型的文档注释里，并在类型层用
  `表内命令 = Exclude<EditorCommand, "frontMatter">` 把它挡在菜单表外。
- ⚠️ **回声抑制**（`前置块基准Ref`）：横幅记着"文档现在的 front matter 是哪一份归一化
  的文本"，编辑器把同一份回灌过来时不再覆盖用户正在敲的那一格。
- ⚠️ **代价如实记着**：字数/行数统计**把 front matter 也算进去了**（它数的是整篇文本）。
  那条口径在 `ui/outline.ts` §8.2，**没有改**——几行元数据多算几个字，
  比"统计与文件对不上"轻。

**实测（2026-09-26，无头 `:98`，`od -c` 读落盘字节；动作见 `docs/06` §5.23）**：

```text
文档：---\ntheme: seriph\n---\n\n# 写了主题的一份\n\n正文一页\n
所见即所得 Ctrl+S → md5 09ca065a…（与存盘前**一字不差**）
切源码模式 → Ctrl+S → md5 同上；切回所见即所得 → Ctrl+S → md5 同上
Slidev 面板（改之前是「这份文档没写主题…」）：
  首行    已检测到 Slidev 53.0.0，可以打开预览。
  主题包  找到了 `@slidev/theme-seriph`
```

⚠️ 最后那两行是**这条链的验收判据**：Slidev 的主题就写在 front matter 里，
面板读不到 `theme:` 的根因就是这个（插件读的是后端镜像，而镜像里早就没有它了）。
⚠️ 修复前同一份文档存一次盘就变成 `---` ＋ 空行 ＋ `## theme: seriph`。
⚠️ **顺带一提**：面板首行那句是探测的 **`ready`** 那一格——`docs/07` §1 那张表里
原来写着「`ready` 那一格仍然没在界面上见过」，**这句话就此被推翻**（改动见那边与第 46 项）。
⚠️ 它只说明**探测**通过：点「开始预览」才真去起 `npx @slidev/cli`，**那一步没做**。

### 4.13 四种行内标记 ＋ 块级裸 HTML（`editor/inline-marks.ts` / `editor/html-block.ts`，2026-09-27）

这一节装的是 §3 那六格 ⬜（高亮 / 上标 / 下标 / 下划线 / HTML 标签 / 注释）。
**六格只拆成两个文件**，因为判据只有两类：

- **行内那四件**（`==高亮==` / `<sup>` / `<sub>` / `<u>`）：**markdown 里都没有
  原生语法**——`==…==` 是 GFM 之外的扩展，另三个干脆就是 HTML 标签。所以它们是
  **同一个问题的四个实例**，一份表 ＋ 一个循环就够（`inline-marks.ts` 的 `标记表`）。
- **块级裸 HTML 与注释**：**在 mdast 里是同一种东西**（`remark-parse` 对两者都产
  `html` 节点），区别只在正文里长什么样（`<!--` 开头就是注释，那是个纯函数
  `是注释`）。为它单开一颗节点要多一整套 parse / serialize / 规格，换不来任何东西。

#### ① 行内四件：**四层缺一层都是静默失败**

⚠️ 这一条是本节的**全部要点**。行内标记要穿过四层，**每一层都有一份独立的名单**：

```text
markdown ──remark-parse──▶ mdast ──$remark 转换器──▶ PM 文档树
   ▲                                                      │
   └──── remark-stringify 的 handlers ◀── toMarkdown ─────┘
```

- **解析那趟**：`remark-parse` 认不出 `==x==`，所以靠自己那颗 `$remark`
  （`行内标记解析`）**按源码切段**（`切文本`：拿正则扫出候选片段，再按开关过滤）。
- **mdast 那一趟**：本仓自造四个节点类型（`notaHighlight` / `notaSuperscript` /
  `notaSubscript` / `notaUnderline`），**只在"这一次解析与这一次序列化之间"活着**，
  不进文件、不进剪贴板。
- **PM 那一趟**：四颗 `$markSchema`，`parseDOM` / `toDOM` 认的是**真正的 HTML 标签**
  （`mark` / `sup` / `sub` / `u`）。
- **序列化那趟**：`remark-stringify` 只认 mdast 的类型名，所以四个节点各要一个
  `handlers` 条目把那段字符拼回去（`行内标记处理器`）。

⚠️⚠️ **`标记规格` 里 `标签` 与 `html标签` 是两个东西**（2026-09-27 拆开）：

| 字段 | 是什么 | 谁在用 |
|---|---|---|
| `标签` | **PM 的 mark 名** | `$markSchema` 的 id、`CommandState` / `FormatBar` 的键、`命令名表` |
| `html标签` | **编辑区真正渲染出来的元素名** | `parseDOM` / `toDOM` |

原来一位两用，后果有两层：① 编辑区里渲染出 `<highlight>` 这种**浏览器不认识**的
自造元素，CSS 只能按那个自造名写（`highlight { … }`，看着能跑、但语义是错的）；
② `<sup>` / `<sub>` **自带排版**（`font-size: .75em` ＋ `vertical-align`）本来白送，
一旦标签名换成自造的，那套排版就**一起丢了**。

⚠️ **下划线的输入规则与 `gfm` 那条删除线打架**：`gfm` 的删除线规则只要求
「第一个 `~` 前面不是 `\w`」，而 JS 的 `\w` **不含中文**——`张~2~` 会被它先抢成
删除线。所以本仓的输入规则**必须 `.use()` 在 `gfm` 前面**（输入规则是**按注册顺序
试、先中者赢**的）。⚠️⚠️ **但那只治得了"打字"那一半**——"打开/存盘"走的是 micromark
分词，同一个波浪号在那边会被抢第二次，见下面 ⑤（BUG-48）。

⚠️ **高亮存盘时要挡一次转义**：`remark-stringify` 会把行首的 `==` 写成 `\==`
（它怕是别的语法），所以 `不转义行首等号` 那个 `handlers.text` 包一层把它放回去。

⚠️ **代价如实记**：四种标记存盘写出去的是 **HTML 标签**（`<sup>` / `<sub>` / `<u>`）
或扩展语法（`==…==`）——**不是所有 markdown 渲染器都认**。这是"从没有到有"必然
要付的钱，换掉就等于这四格继续是 ⬜。

#### ② 块级裸 HTML：**修的是一个真缺陷：整篇文档打不开**

⚠️ 这一条不是"补个功能"，是"补个洞"：

```text
doc.content 是 "block+"                    ← preset-commonmark/lib/index.js:414
而独占一行的 HTML 在 mdast 里是 root 的直属孩子，preset 给它的 htmlSchema 却是
group:"inline", inline:true                ← 同文件 :1510
⇒ createAndFill 失败 ⇒ Cannot create node for doc ⇒ 整篇文档打不开
```

**触发门槛低到离谱**：一份文件**只要以一行裸 HTML 开头**（后面还有一大段正常正文
也一样）就够了。补法是在**块级位置**上给它一颗自己的节点（`group:"block"`，
`atom`，`defining`），转换器 `块HTML转换` 负责把那些位置上的 `html` 换类型。

⚠️ **行内那些一个字节都不动**——`甲<u>乙</u>丙` 里那两颗仍归 preset 的
`htmlSchema`，抢过来会让**一句话变成三个块**。判据是「父节点在 `块级容器` 里」，
那张表是**穷举**的四种（`root` / `blockquote` / `listItem` / `footnoteDefinition`），
**新出的容器类型会落到行内那一支**——那正是安全的方向。

⚠️ **编辑区里显示成源码**（灰底等宽），**不是渲染后的 HTML**。这是与 Typora 的
**已知差别**，两条理由：① 真渲染得先把「html ＋ text ＋ html」三颗合成一颗带内容的
节点，那是**重写一遍 HTML 解析器**；② 编辑区是**活文档**，渲染等于让用户写的
`<script>` / `onerror=` 跑起来。⚠️ **导出与打印不受影响**：那边吃的是**序列化后的
markdown**，原样的 `<div>` 交过去出来就是真的 HTML 元素——「写进文件的 HTML 是
有效的」这件事仍然成立，代价只落在编辑区的观感上。

#### ③ 判据在哪

| 文件 | 条数 | 盯什么 |
|---|---|---|
| `tests/inline-marks.test.ts` | **37** | `切文本` / `行内标记转换器` / 四颗规格的往返 / 叠加（BUG-48，两条路各一组）／半重叠与配对守卫（BUG-50，见 ⑥） |
| `tests/html-block.test.ts` | **14** | `是注释` / `块HTML转换` / 真 `unified()` ＋ 真 `ParserState`/`SerializerState` 的往返 |

✅ **2026-09-27 晚开窗点过了**——`docs/10` §3 那五格（高亮 / 上标·下标 / 下划线 /
HTML 标签 / 注释）**从 🟡 翻成 ✅**：判据是**落盘的 markdown 字节差**（高亮 `+4`、
下划线 `+7`、上标 `+2`、下标 `+2`，编辑区黄底 / 真下划线 / 升高 / 降低都画对了），
一份含独占行 `<div>` 与独占行注释的文档也正常打开、按"灰底等宽源码"显示
（截图 `B1-乙.md.png`）。⚠️⚠️ **但那两份测试当时是绿的，这两件事却都是坏的**——
根因见下面 ④，**这是"纯逻辑判据全绿 ≠ 能用"最干净的一个例子**。
⚠️ `html-block.test.ts` 的文件头里记着一条**踩过的工装坑**：
`doc` 的 `toMarkdown` **不许自己 `closeNode()`**（`root` 那一层归
`SerializerState.build()` 收），自己收一次会让每条往返都抛
`Stack over flow, cannot pop on an empty stack.`，而**产品代码一点毛病都没有**。

#### ④ ⚠️⚠️ 起窗才撞出来的两个注册陷阱（BUG-46 / BUG-47，2026-09-27 晚）

**这两条都是"测试全绿、类型干净、界面全哑"**，写在这里是因为**动这一带的人一定会
再踩一次**——修 bug 时加一行 `.use()`，很难看出少了什么。

**① `$markSchema` / `$nodeSchema` 返回的是元组，两半都要 `.use()`**（BUG-46）：

```ts
const 规格 = $markSchema(标签, schema)   // 类型上像"一个插件"，其实是 [schemaCtx, plugin]
```

⚠️ **前半截那个 ctx 元素自己也是一个 `MilkdownPlugin`**（`$Ctx<T, N> = MilkdownPlugin
& { key: SliceType<T, N> }`），而 `$markSchema` 内部要 `ctx.get(schemaCtx.key)(ctx)`——
**只有把它也 `.use()` 进去，那个 key 才注进 ctx 容器**。只 `.use()` 后半截的后果是
`editor.create()` 直接抛 `Context "highlight" not found, do you forget to inject it?`，
**编辑器整块起不来**（界面上「正在准备编辑器…」永远不停 ＋ 一条「编辑器启动失败」）。
上游是自己拍平的：`@milkdown/preset-commonmark/lib/index.js` 里 `[…].flat()`（约 :1597）。
⚠️ 所以 `editor/inline-marks.ts` 与 `editor/html-block.ts` 里那两处
`as unknown as MilkdownPlugin`（对元组拍平）**不能删**，理由写在各自文件头。
⚠️ **它为什么藏得住**：类型检查过得去；`tests/inline-marks.test.ts` 是直接
`一.ctx(ctx)` 调的，**绕过了 `.use()`**，所以那份 21 条一直全绿。

**② `$command` 返回的是单插件，注册发生在它自己的 body 里**（BUG-47）：

```ts
const 插件 = $command(key, cmd)   // plugin.key = cmdKey 与 create(cmdKey, cmd) 都在 body 里
```

⚠️ 只有 `.use()` 过，那两句才跑；没 `.use()` 就 `plugin.key === undefined`，命令**从没
注册进 `commandsCtx`**。于是点一下按钮 → `callCommand(undefined)` →
`CommandManager.call` → `container.get(undefined)` → **`undefined.id` 的 TypeError**——
而这声响落在 `editor.action` 里、**没有 try/catch**，所以**界面上什么都没有**。
⚠️ 修法是补一句 `.use(行内标记命令)`；⚠️ 它**不受设置里「行内扩展」那颗开关管**
（那颗管的是**解析**，这四条是**命令**，两件事）。
⚠️ **两个陷阱的判据都不是读代码**：起窗、点一下、看**文件字节变没变**。

#### ⑤ ⚠️ 起窗撞出来的第三件：`gfm` 把 `~x~` 抢成删除线（BUG-48，2026-09-27 当夜修掉）

⚠️ ④ 那两条说的是"注册少了会全哑"，这一条正好相反：注册一个不缺、三个陷阱都躲过、
**类型与测试全绿**，可**存进文件的字节还是不对**。教训一句话：**输入规则抢赢了 ≠ 全程都赢。**

**症状**（用户 2026-09-27 按一张组合矩阵量出来的）：点菜单里的下标、打 `H~2~O`，
**屏幕上完全正确**（`<sub>` 老实排着），可**存盘之后文件里是 `H~~2~~O`**——多了一个
波浪号；再把那份文件打开，它就成**删除线**了。⚠️ 只用一个标记的文档
（`普通 ==高亮== 普通`）往返正常，所以它极易被"我随手试了一下，没事"放过。

**根因**：`~x~`（本仓的下标）与 `~~x~~`（GFM 的删除线）抢**同一个字符**，而两条路
各有一个裁判：

| 走的哪条路 | 谁先看见 `~下~` | 为什么 |
|---|---|---|
| **打字** | 本仓的输入规则 | `.use()` 排在 `gfm` 前，**先中者赢** ✓ |
| **打开 / 存盘** | `gfm` 的删除线 | 那条路走 **micromark 分词**，而 `remark-gfm` 的 `singleTilde` **默认 true**（单个波浪号也算删除线） ✗ |

⚠️ 所以"输入规则必须排在 `gfm` 前面"那条只治得了打字那一半，**治不了解析那一半**。
修法两处，都在 `editor/inline-marks.ts`：

1. **解析侧关掉 `singleTilde`**（`GFM选项`）。⚠️ **不用换插件、不用重新注册**：
   `remarkGFMPlugin` 的选项存在它自己的 ctx 切片里（`$remark` 的实现），而
   `@milkdown/core/lib/index.js:139` 那行
   `reduce((acc, plug) => acc.use(plug.plugin, plug.options), remark)` 本来就是把选项
   当 `unified().use()` 的第二个参数用——`remark-gfm` 正是靠它把 `singleTilde` 交给
   micromark 的（读它的是 `micromark-extension-gfm-strikethrough/lib/syntax.js:20`）。
   于是 `create.ts` 的 `.config()` 里一句 `ctx.update(remarkGFMPlugin.options.key, …)`
   就够（`关掉单波浪号删除线`）。
2. **序列化侧去掉孤立的 `\~`**（`不转义孤立波浪号`）：正文里的波浪号从前**一律**
   被转义（`甲 ~ 乙` 存盘变 `甲 \~ 乙`，与 `\#标签` / `\==重点==` 同一族噪音）。
   ⚠️ 它**只去掉证明无害的那些**——成对的 `\~\~`、贴着下标定界符的、本身就是下标
   内容的，一律照旧留着：去掉它们会让波浪号与邻居**拼成一个标记**，重开时文字被吃掉
   或意思变了。判据（三条）写在那个函数上。

⚠️ 关掉之后本仓的语义与 Typora 对齐：**`~x~` = 下标，`~~x~~` = 删除线**，互不冲突
（`singleTilde:false` 只要求删除线必须成双，`~~x~~` 一个字都没变）。

⚠️⚠️ **测试那边真正的教训在工装，不在断言**：新增的第四组（那张矩阵的八种叠加）
起初**三条一直绿**——因为那份测试的 `unified()` 链**没装 `remark-gfm`**，而产品装了
（`create.ts` 的 `.use(gfm)`）。补上 `.use(remarkGfm, GFM选项)` 之后，`H~2~O` →
`H~~2~~O`、`甲 ~ 乙` → `甲 \~ 乙` 当场变红。⚠️ **测试工装与产品链路不一致 ⇒ 假绿**，
与 ④ 那两条是同一族（那边是少一句 `.use()`，这边是少一个插件）。⚠️ 所以那份测试里
`.use(remarkGfm, GFM选项)` 用的是**产品同款的那个常量**——两边各写一份字面量的话，
改了一边另一边不会跟着变，这份测试就又成了自说自话。

⚠️ **还留了一条已知边界**（如实钉着，不假装修好）：**内容本身就是定界符**的那种
（下标内容 `~` → `~~~`、高亮内容 `=` → `=====`、上标内容 `^` → `^^^`）**不往返**。
它是本节开头那第四条边界（"内容里不能再出现同一个符号"）的直接后果——本仓那颗正则
**不认识反斜杠转义**，所以这种写法压根表达不出来。用户打不出这种文档（输入规则与
`切文本` 都不会产出它），真实来源只有"手工改源码再打开"。要真修得让正则认识 `\`，
那是"自己写一台行内解析器"那个量级的事。

#### ⑥ ⚠️ 查 ⑤ 的时候顺手量出来的第四件：`<u>` 里夹一层标记就配不成对（BUG-50，当夜同批修掉）

⚠️ **这一条的阴处在于"字节那条判据照样绿"**：`<u>` 与 `</u>` 在 mdast 里是两颗
**行内 HTML 原子节点**，配对失败时它们**被原样保着**，所以"打开再存，字节不变"
一个字都不差——**丢的是编辑器里那一层**：本该是下划线的那一段，屏幕上显示的是
字面的 `<u>` 与 `</u>`，underline **mark 一颗都没有**。⚠️ 而**本仓自己就写得出
这种源文**（下划线＋高亮是合法组合，序列化那一侧吐的就是 `<u>下==高==下</u>`），
于是症状是"**自己写的文件自己读不回来**"。

**根因**：`并下划线()` 扫"夹在中间"的节点时，判据是 `是容器(一)`，而

```ts
function 是容器(节: MarkdownNode): 节 is 有孩子 {
  return Array.isArray((节 as 有孩子).children);
}
```

——**"有 `children`"想表达的是"块级"**（段落、标题、列表），可**行内节点也带
`children`**：本仓自造的 `notaHighlight` / `notaSuperscript` / `notaSubscript`，
以及上游的 `emphasis` / `strong` / `link`。碰到它们就 `break` ⇒ 整次配对放弃。
⚠️ 也就是说这条守卫**把"用户真的在写 HTML"和"下划线里套了一层标记"当成了同一件事**。

**修法**：判据换成一张穷举的**块级节点表**（`块级节点`），与 `html-block.ts` 的
`块级容器` 同一个方向——表里没有的就算行内、不当边界。⚠️ 表里**故意不列 `html`**：
行内 `<u>` / `<br>` 本身就是 `html` 类型，列进去会让 `<u>a<br>b</u>` 也配不成。
⚠️ **中间隔着真块级节点仍然不配**（那条行为一个字没变，用例还在）。

**复验**：开窗打开 `<u>下==高==下</u>` → 第一行是**真下划线**（`高` 带高亮底色）、
界面上没有字面标签；`Ctrl+S` 之后 51 字节、md5 存前存后一致。工装侧钉了三条：
半重叠的**标记集合**、`strong` 不算边界、真块级仍不配。

⚠️ **顺带量清楚的一件事（不是缺陷，是钉现状）**：真正的**半重叠**——高亮落在
`[0,2)`、上标落在 `[1,3)`，中间那个字两层都有——**markdown 语法表达不了**
（`==a^b^==^c^` 只能是"相邻两组"），所以序列化器必须自己拆开。实测它拆得对、
再开再存一字不差、**每一段的标记集合也与原来一致**。用户在窗口里很容易造出这个
形状（选 `ab` 点高亮、再选 `bc` 点粗体），所以三条都钉进了第五组。

### 4.14 智能标点 ＋ 自动更正（`editor/smart-punctuation.ts` / `editor/auto-correct.ts`，2026-09-27）

这一节装 `docs/10` §8 的两格 ⬜。两者放在一起讲，因为它们是**同一类东西**：
都改**用户正在打的那几个字符**，都不碰已有文本。⚠️ 但它们**改的层不一样**，
这也正是它们的差别所在：

| 文件 | 改的是 | 挂的是 | 设置 |
|---|---|---|---|
| `smart-punctuation.ts` | **字符的形状**（`--` 是短横还是两个减号） | 输入规则（`Input` 档）／显示装饰（`Render` 档） | 六个字段，**早就存在** |
| `auto-correct.ts` | **词的拼法**（`teh` 还是 `the`） | 输入规则 | 一个字段，**2026-09-27 新加** |

#### ① 智能标点：这一格是**还债**，不是从零写

⚠️⚠️ `settings/markdown.rs` 里 `smart_punctuation` / `smart_quotes` /
`smart_quotes_double` / `smart_quotes_single` / `smart_dashes` / `dash_style`
**六个字段连同界面上那一整组控件，2026-09-24 就摆着了，而全仓一个消费者都没有**。
拨到「输入时转换」、开关全开，打出来的 `--` **一个都不会变**。这跟 §11.2 那张
边界表里"存了值没人读"那一类是**同一笔账**（同 `autosave_seconds`、同 2026-09-25
修掉的那六个外观字段）。本文件就是来当消费者的。

三档（`Off` / `Render` / `Input`，默认 `Input`）的取舍**不是"温和 / 激进"**，
而是**动不动用户的字节**：

| 档 | 转换发生在 | 存盘写出什么 |
|---|---|---|
| `Off` | 不转换 | 原文 |
| `Render` | **渲染那一步**（编辑区的 DOM） | **原文**（`--` 还是 `--`） |
| `Input` | 敲下去那一下（`inputRules`） | 转换后的字符 |

⚠️ **三档都不会回头改已有的文本**：打开一份满是 `--` 的老文档、存盘，**一个字节
都不动**。这是"绝不改用户字节"那条铁律的落点，也是 `Render` 这一档存在的理由。

#### ② `Render` 是怎么做到"只显示不改字"的

**装饰 ＋ 隐藏原文，两半缺一不可**（`算装饰` 里那两行）：

```text
Decoration.inline(起, 止, {class: "nota-smart-hide"})   ← 把原文那两颗字符压成 0 宽
Decoration.widget(起, () => <span class="nota-smart-show">–</span>, {side: -1})
                                                         ← 紧挨着前面画出替身
```

| 少了哪一半 | 症状 |
|---|---|
| 只有 inline | 屏幕上看不出区别（原文还在，只是没宽度——选中复制出去仍是 `--`） |
| 只有 widget | 屏幕上变成 `--–` |

⚠️ **`font-size: 0` 而不是 `display: none`**：`display: none` 会让那一段完全不占位，
而 ProseMirror 的光标是按 DOM 文本节点走的——整段归零之后，光标停在原文中间时
屏幕上**找不到插入点**。`font-size: 0` 同样把宽度压成 0，但文本节点还在，
PM 的坐标换算不会错位。⚠️ 代价如实记：**原文那两颗字符的位置上仍然看不见光标**。

⚠️ **`contenteditable="false"` 与 `ProseMirror-widget` 那个类由 ProseMirror 自己加**
（`prosemirror-view` 的 `WidgetViewDesc` 里那三行），本仓不需要写——所以这里只管长相。

⚠️ **装饰不进文档、不进撤销栈**（与查找高亮、块标记淡化同一条口径）：拖一下窗口、
敲一个字它就重算一遍，而 `getMarkdown()` 出来的仍是用户写的那两个减号。

#### ③ ⚠️⚠️ 它会弄坏「分割线」——靠 `是横线骨架行` 救着

**这是本节最该被读到的一条**，也是这一族里唯一会**弄坏一条一直好用的老功能**
的地方：

```text
用户敲 `---` 走三次 handleTextInput：
  第 1 颗 → 前文 `-`     上游的分割线规则不中（要求正好三个），本文件的 `-{2}$` 也不中
  第 2 颗 → 前文 `--`    ⚠️ 本文件的 `-{2}$` 当场命中 ⇒ 变成 `–`
  第 3 颗 → 前文 `–-`    上游那条 /^(?:---|___\s|\*\*\*\s)$/ 再也认不出来
```

**症状是「敲 `---` 出不来分割线了」**（一条一直好用的老功能）。守卫生效的条件：
**这一行到光标为止只有空白与连字符时不转换**（那个行首状态正是"用户在做分割线"）。

⚠️ **`规则选项` 里的 `inCodeMark: false` 必须写**：`prosemirror-inputrules` 的默认值
是 **`true`**（`this.inCodeMark = options.inCodeMark !== false`），而那句守卫长这样
`if (!rule.inCodeMark && $from.marks().some(m => m.type.spec.code)) continue;`
——默认值让 `!rule.inCodeMark` 恒为假、**守卫整个不生效**，也就是说行内代码
（`` `--` ``）里照转不误。上游那种"必须占满整块"的规则靠形状躲开了，本文件这几条
只认光标前几个字符，躲不开。

⚠️ **`Input` 档的输入规则只剩横线三条**：`破折号 = false` 时
`---` / `--` / `...` 全部不挂。**引号从 2026-10-23 起不走输入规则**：它要在同一个
动作里知道选区、自动补出的另一边和右侧字符，统一由 `引号配对` 的
`handleTextInput` 接管；若仍保留输入规则，后者会先把引号落成单颗字符，配对插件
便拿不到原选区。

#### ③½ 引号配对：补另一边、越过闭符、包住选区

| 现场 | 结果 |
|---|---|
| 行首或空白 / 左括号后打双引号 | 一次放入 `“|”`，光标在中间 |
| 光标停在自动补出的 `”` 前再打双引号 | 不插字，光标跨过闭符 |
| 字母后的单引号（`don't`） | 只落 `’`，不补另一边 |
| 选中一段再打引号 | 两侧各放一颗并保留原文选区 |
| 直引号字形 | 开闭同字符，仍按前文和未闭合层数决定补、跨或单插 |

代码块 / 行内代码、反斜杠转义和组字期间都放行。`off` / `render` 档不安装
`引号配对`；`render` 仍只由装饰画替身，不改文档。
⚠️ “越过闭符”必须在“这里像开引号位置”之前判：光标夹在 `“|”` 中间时前一颗
本身就是 `“`，顺序反了会再补一组。

#### ④ 自动更正：这一格此前**连定义都没有**

⚠️ `docs/10` §8 里「自动更正」是**一行光秃秃的 ⬜**，全仓没有一处说它该是什么
（"智能标点"至少还有一整组字段和控件摆着）。三条口径是 2026-09-27 现定的，
记在 `settings/markdown.rs` 的 `auto_correct` 上：

1. **只认一张固定的表**（四十来条）。**不做语法检查、不做句首自动大写、不碰中文**
   ——前两样要带一整套词法（词性、句读、专名），猜错的代价远大于收益。
2. **只在敲下词尾空白那一下动手**（触发字符**只有空格与制表符**），也就是只改
   **刚打完的那一个词**。既不回头改已有文本，也不改还没定型的词（`teh` 打到 `te`
   时不能动手——用户可能想打的是 `tell`）。
3. **必须能撤销**：走 `inputRules`，`Ctrl+Z` 一步退回原文（`prosemirror-inputrules`
   把被替换掉的原文本记在插件状态里，连"改完立刻按退格"都能退回去）。
   **这是"猜错了"的代价上限：一次撤销，不是一次数据损毁。**

⭐ **入表判据只有一条，而且可检验：小写形式在英文里不是一个词。** 所以
`cant` / `wont` / `wether` / `lets` / `its` / `were` **一个都不收**——它们的"错"只是
"用户可能想打另一个词"，而它们本身就是合法的英文词（`wont` 是"习惯"、`wether`
是"阉羊"）。收进去的症状是**把对的改成错的**，而那是这份表唯一不能犯的错。
⚠️ 反过来，`dont` / `wich` / `teh` 这一族在任何语境下都不是词。

**大小写跟着原词走**（`改词`，纯函数）：

| 原词 | 结果 | 判据 |
|---|---|---|
| `teh` | `the` | 全小写 |
| `Teh` | `The` | 只有首字母大写 |
| `TEH` | `THE` | 全大写 |
| `tEh` | **不猜**（原样放过） | 混着写＝用户**故意**的（驼峰标识符、玩梗） |

⚠️ **触发字符只有空格与制表符**的代价如实记：`teh,` 后面直接跟逗号**不更正**，
得等用户敲空格。收益是"标点原样留在原地"不需要任何额外代码。

#### ⑤ ⚠️ 导出那条路**不许传智能标点**

`editor/export.ts` **自己另建一个只读实例**、直接取 `pm.innerHTML` 当导出结果。
把 `标点` 传进去就等于把 `–` 和那颗被压成 0 宽的 `--` 一起写进导出文件——
**"仅显示时转换"那一档的全部承诺（一个字节都不写）就从后门被破掉了**。
所以 `create-types.ts` 的 `标点` 那一格明写着这条。

⚠️ **分屏右侧那个只读预览要传**（`EditorPane` 传了）：它显示的是编辑区那一份的
样子，与 `inlineMarks` 同一条口径——两边不一样的话，`--` 在左边是 `–`、右边是
`--`，用户会以为分屏坏了。⚠️ 那一格 DOM **不拿去导出**，所以两条不矛盾。

#### ⑥ 判据在哪

| 文件 | 条数 | 盯什么 |
|---|---|---|
| `tests/smart-punctuation.test.ts` | **43** | 纯函数（含与 Rust `Default` 的**对账**）／ `扫标点` 的边界／ `装饰清单` 的**位置换算**／引号配对事务（补对、跨闭符、包选区、撒号、直引号）／装配条数 |
| `tests/auto-correct.test.ts` | **20** | **遍历整张表**（防死行）／ 大小写三档／ 入表判据／ `词尾正则` 的边界 |

⚠️⚠️ **两份都只到"纯逻辑"，一次窗都没开过**：真跑一次要 `Editor.make()` ＋ 真 DOM
（本仓没有 jsdom，也不许为这件事装包）。所以：

- ⚠️ **「敲 `--` 当场变 `–`」这条主路径没验**；
- ⚠️ **「敲 `---` 出不来分割线」那道守卫也没验**——而它是这一族里唯一会弄坏老功能
  的地方，**所以它是开窗目检的第一件事**（敲一次 `---`，再敲一次 `a--b`）；
- ⚠️ **「`Ctrl+Z` 能退回 `teh`」没验**；
- ⚠️ **两条都在行内代码里不该触发的行为没验**（`inCodeMark: false` 走的是真 view
  的分支）。

⚠️ **`EditorPane` 那边一律"六个字段任一变化就重建编辑器"**：曾经想过让字形与
破折号风格热更新（它们在处理器被调到那一刻才被读，看着能省一次重建），**放弃了**
——那就得让规则读一个可变的盒子、再加一个 `set标点`，而"省下一次重建"换来的是一类
**静默失效**（改了字形、活着的实例闭包里还是旧的），正是本仓最忌的"设置像没生效"。


### 4.15 Emoji：短代码 ＋ 补全面板（`editor/emoji.ts` / `ui/EmojiDialog.tsx`，2026-09-27）

这一节装 `docs/10` §3「Emoji」与 §8「Emoji 自动补全」两格。⚠️ 两格装的是**一件事
的两半**，而且**共用同一个设置**：

| 部件 | 什么时候动手 | 动的是什么 |
|---|---|---|
| `Emoji表` | —— | **数据**（503 条，十一个分类）。没有任何逻辑，改它不用读别的 |
| `emoji输入规则` | 敲下 `:smile: ` 的那个空格 | 把那七个字符换成 😄 |
| `补全插件` | 敲 `:sm` 的时候 | **只在屏幕上**画一块候选面板，**一个字节都不写** |
| `ui/EmojiDialog.tsx` | 菜单「格式 → 插入 Emoji…」 | 一个挑选框，选完把**一个字符**交给 `run("insertText", …)` |

#### ① ⚠️ 一个开关管两件事，是有意的

`settings.editor.emoji_autocomplete`（Rust 侧默认 `true`，界面上那一格 2026-09-24
就摆着了）**同时**管"短代码替换"与"补全面板"。拆成两个开关看着更"正交"，但两者
都是「编辑器在用户的 emoji 输入上插手」——拆开之后最常见的那个诉求（"别管我打字"）
会变成**关掉一个还弹另一个**。⚠️ 它是 `docs/10` §11.2 第一类账（存了值没人读）
里 `emoji_autocomplete` 那一笔的偿还。

⚠️ **改这个设置要重建编辑器**：`.use()` 链是建实例时定死的，所以 `emoji` 进了
`EditorPane` 那个 effect 的依赖数组（同 `strict` / `physics` / `行内扩展` / `标点` /
`自动更正` 那一排）。

#### ② ⚠️ 输入规则正则**导出成常量**，是为了防死行

```ts
export const 输入规则正则 = /:([a-zA-Z0-9_+-]{1,}):[ \t]$/;
```

表里每一条短代码都得**敲得出来**，否则就是"面板里选得到、手打永远不出来"的死行。
测试（`tests/emoji.test.ts`）拿**这一条常量**去核表里的每一条，而不是自己另写一份
正则——两份正则漂开的那天，测试会绿着、用户打不出来。

⚠️ 量词是 **`{1,}` 不是 `{2,}`**：表里有 `:x:` / `:v:` 这种单字母短代码（GitHub 那套
记法里它们是真的，`x` 是 ❌-ish 那个、`v` 是 ✔️）。写成 `{2,}` 的当场症状就是这两条
"面板里明明有"。

⚠️ 那颗尾随空白**留在原地**（`insertText(项.字符, 始, 终 - 1)`）：`终` 指向的是
空白之后，减 1 才是空白本身。

#### ③ ⚠️ 补全面板**只画不改**

候选面板出现的时机是"用户**可能**想打一个 emoji"——这时候他还没决定。面板若真往
文档里写点什么（比如先把 `:sm` 换成候选），**猜错了就是改用户的字节**，而且是用户
根本没确认过的那种改。所以：

- 面板走 `Plugin.view` ＋ `replaceChildren`，**全在屏幕那棵树上**，文档树一个字都不动；
- 位置每次 `coordsAtPos` 现算（不缓存——缓存的那一份在滚动/换行之后就是错的）；
- **鼠标**走 `mousedown` ＋ `preventDefault()`：不 `preventDefault` 的话 WebKit 会把
  焦点抢走，光标一丢，插入位置就不对了；
- **键盘**走 `handleKeyDown`（上下键移动高亮、回车/`Tab` 采用、`Escape` 关掉），
  ⚠️ `event.isComposing` 时**一律早退**——中文/日文输入法组字期间那些键不属于我们。

⚠️⚠️ **`apply` 里必须先读 `tr.getMeta(emoji补全键)`**：上下键那两条事务只改"高亮第
几条"、**没改文档**。跳过这一步直接按文档重算候选，会被"按前缀筛"重新置回第 0 条
——症状是**按 ↓ 没反应**（而按 ↑ 看着"能回去"）。这是本文件里最容易重犯的一处。

⚠️ **只读实例不挂面板**（`emoji补全(emoji && !readOnly)`）：分屏右栏那个预览里点
一下也会弹，纯噪声。**输入规则照挂**——只读时它是零成本死代码，摘它反而多一个分支。

⚠️ **导出那条路不受影响**：`editor/export.ts` 建的是 `readOnly: true` 的实例（面板
本来就不挂），而输入规则只在**打字**那一刻动手，导出是"建好之后摘 `innerHTML`"。
（对比 §4.14 ⑤：智能标点**必须**显式不传，因为它有一条 `render` 档会改渲染出来的
DOM——emoji 没有这一档，所以不需要那条禁令。）

#### ④ 「插入 Emoji」那个框：搜索做**子串**，与面板故意不一致

`ui/EmojiDialog.tsx` 的搜索是 `includes`（子串），补全面板是**只做前缀**。看着像
不一致，其实是两种场景：面板是"**边打边筛**"——前缀之外的词跳出来会让人怀疑自己
打错了；这个框是"**我知道我要找什么**"——要找 `heart` 就该看得见 `heart_eyes`。
理由写在两个文件的文件头，改之前先读。

⚠️ 那个框**只回一个字符**、**不碰文档**：`askEmoji()` 不带请求参数，插到哪儿由
`App.tsx` 的 `插入Emoji` 交给 `run("insertText", …)`——同「插入链接」那条路的口径。

⚠️ **11 个分类名走 `分类文案(一类)` 那个 `switch`**，把每个名字写成**字面量**
`t("表情")`：`tools/i18n-check.sh` 只认字面量 `t("…")`，写 `t(一类)` 会让这 11 条
英文被算成"废掉的键"（FAIL）。⚠️ 也**不能**把 `editor/emoji.ts` 加进检查器的
`文案表文件` 名单——那里的中文是**数据**（503 条表项的 `分类` 字段），进去会把它们
全算成键。

#### ⑤ 判据在哪

| 文件 | 条数 | 盯什么 |
|---|---|---|
| `tests/emoji.test.ts` | **32** | 表的账（无重名／小写合规／**每一条查得回自己**／11 个分类都有条目／规模 200–800／别名同分类）／ `查短代码` ／ `找Emoji`（**只前缀**、有上限、大小写）／ 带冒号 ／ `认前缀` 的 8 条边界 ／ `采用候选` ／ 装配条数 |

⚠️ **「敲 `:smile: ` 当场变 😄」这条主路径没验**（要真 `Editor.make()` ＋ 真 DOM）；
⚠️ **面板在真窗口里长什么样、点得到点不到也没验**。两者都列进开窗目检。


### 4.16 脚注：编号分配 ＋ 插入（`editor/footnote.ts`，2026-09-27）

#### ① 这一格「缺的从来不是节点」

`footnote_reference`（`group:"inline"` ＋ atom）与 `footnote_definition`（`group:"block"` ＋
`content:"block+"` ＋ `defining`）是 **`@milkdown/preset-gfm` 自带的**两颗规格
（`lib/index.js:688` 与 `:743`），解析靠 `remark-gfm`、序列化也归它，`create.ts` 里的
`.use(gfm)` 早就挂着。所以**打开一份带脚注的 `.md`，它画得出来、存回去还是脚注**
——这一格此前是 ⬜，缺的只有「从零插一条」这个动作。

#### ② 一笔事务里做三件事

`脚注事务(state)` 是**纯函数**（吃 `EditorState`、吐 `Transaction | null`，不碰 DOM），
`插脚注(editor)` 只是把它 dispatch 出去。三件事：

1. 用 `[^N]` 的**引用节点换掉当前选区**（`replaceSelectionWith`）；
2. 在**文档末尾**追加一条同编号的**定义**，里面放一个**空段落**；
3. 把光标落进那条定义的空段落里，并 `scrollIntoView`。

⚠️ 第 3 步**光标会跳到文末**，这是有意的：刚问出来的脚注，下一件事就是写它的说明。
⚠️ 第 2 步那个**空段落不能省**——`footnote_definition` 的 content 是 `block+`，
「没有内容的定义」是它表达不了的形状。

#### ③ ⚠️ 编号的规则是「最小未用正整数」，不是「最大加一」

两者只在**删过脚注**之后分道扬镳：文档里有 1、3 时，前者给 **2**、后者给 4。
选前者是因为用户删掉第 2 条之后那个号就是**空出来的**，补上它让编号连续；
「最大加一」会在编号里留一个洞，看着像漏了一条。
⚠️ 非数字标签（`[^note]`）**只占位、不参与计数**：它进 `Set` 所以撞不上，
但它不影响答案。编号实现只有一处（`下一个脚注标签`），**源码模式也引它**
（`source.ts` 的 `case "footnote"`）——两处各写一份的话，这种规则迟早漂开。

#### ④ ⚠️ 三条刻意的边界

1. **不重排编号**。markdown 里 `[^1]` 的 `1` 是**标识符**，不是序号——重排等于替用户改他写的字节。
2. **不跳转**。点角标不会滚到定义那儿（`editor.css` 里那句 `cursor: pointer` 只是留的位置）。
   做跳转要先有一套「哪个引用指向哪条定义」的索引，那正是这个文件**故意不做**的事。
3. **定义一律补在文末**。用户自己写在文档中间的 `[^1]: 说明` **一个字节不动**
   （markdown 允许定义出现在任意位置，`preset-gfm` 的解析与序列化都认）——
   只有**新插的那条**总落在最后。

⚠️ **连插两条会把第二条引用嵌进第一条的定义里**：第一次插完光标就在那条定义中，
「光标在哪儿就插哪儿」的直接后果。没有为它做特判——那种规则会在用户真想嵌一条引用时
帮倒忙，而且和所有别的插入命令口径不一致。想插在正文里，先把光标挪回正文。

#### ⑤ 一处实测出来的上游兜底（**把一条猜想证伪了**）

文件里真出现**空的** `[^1]:` 时，`mdast` 那侧的 `children` 是 `[]`，而 PM 那颗节点是
`content:"block+"`——推理上 `type.create` 该抛（那等于**整篇文档打不开**），
**实测 milkdown 拿空段落把形状补齐了、不抛**。代价是存回去会多**一个尾随空格**
（`[^1]: `），这一条钉在 `tests/footnote.test.ts` 里。

#### ⑥ 判据在哪

| 文件 | 条数 | 盯什么 |
|---|---|---|
| `tests/footnote.test.ts` | **30** | 编号分配（最小未用／补洞／非数字标签只占位）／ `扫源文标签` 与 `扫脚注标签` ／ 逐字节**往返**（含「定义排在引用前面」与空定义那一个尾随空格）／ `脚注事务` 的文档树与光标落点／ 两个 `null` 出口（代码块里、schema 缺节点） |

⚠️ **没开窗点过**——菜单点下去长什么样、角标与定义画出来对不对，都还没人看过；
⚠️ 源码模式那条纯文本路径**没有测试**（要真 CodeMirror ＋ 真 DOM），
它与所见即所得那边只共用编号分配。


### 4.17 行首那颗多余的反斜杠 ＋ 正文里的 `$`：序列化那串处理器（`editor/text-handlers.ts` / `editor/table-pipe.ts` / `editor/math-delim.ts`，2026-09-27；**2026-10-04 改判据、加第二层**）

**① 病是什么（BUG-52）**：一行普通的 `| 1 | 2 | 3 |` 正文，在所见即所得与源码模式之间
切一次回来，**行首就多出一颗 `\`**——用户一个字节都没打过，破了「存盘不要自动修复」那条
死规矩。⚠️ 它**稳定**：再切几次不会继续加，所以"切一次看一眼"这种走查很容易放过它
（那颗 `\` 在正文里几乎看不见——**所见即所得里 `\|` 与 `|` 长得一模一样**，这一条是
2026-10-04 那次"没修好"的根子：用户在屏幕上根本看不见病历，只能在源码模式里抓到）。

⚠️ **2026-10-04 用户又报了同一句「还是会自动插入斜杠」**，截图是这两行（**同一段**里）：

```
| 1 | 2 | 3 |
$ 你好 $
```

第一版判据（见下面 ④）要求"这一段物理上只能占一行"才放行，这两行靠 `Shift+Enter` 的
硬换行（或从别处拷进来的软换行）待在**同一段**里，于是两条判据**都**不成立——一个字都没动。
同批查出来**还有第二颗反斜杠**，来自别处（见 ⑥），两个一起修。

**② 不是本仓写的**：上游 `mdast-util-gfm-table` 的 unsafe 表里那条
`{atBreak: true, character: '|', after: '[\t :-]'}`。markdown 的表格是**两行**拼出来的
（表头行 ＋ 分隔行 `| --- | --- |`），而序列化器**一行一行地写**——写到表头行时它看不见
下一行是不是分隔行，只好"行首一颗竖线后面跟空白就一律转义"。⚠️ 转义在**真表格**里是对的
（表头行少一颗 `\` 就可能被切成两截），所以不能整条关掉，只能**按上下文放行**。

**③ 那串处理器现在有名字了**：套着的 `handlers.text` 从 `create.ts` 的 `.config()` 里
搬进 `editor/text-handlers.ts`（`文本处理器链()`），顺带把"几层是谁、为什么是这个顺序、
为什么不能挂 `$remark`"整段知识收在一个文件里（**它自己就是一整件事**，不是按行数拆的）。
⚠️ **2026-10-04 起是六层**，顺序**从外到内**：`不转义行首竖线`（`table-pipe.ts`）→
`不转义美元`（`math-delim.ts`，本批新增）→ `不转义孤立波浪号` → `不转义行首等号` →
`原子后的空格` → `不转义行首井号`。⚠️ 外面两层都要看"这一颗最终要落盘成什么"，所以排在
最外面；六条判据互不相交，顺序**可以**换，但换完要重跑 `tests/table-pipe.test.ts`、
`tests/math-delim.test.ts` 与 `tests/atom-space.test.ts`——"看起来不相交"与"真的不相交"
是两件事。

**④ 判据（`table-pipe.ts`，2026-10-04 收窄过的版本）**：**只有"这一行的下一行像分隔行"
时才把转义留下，其余一律放回去**。⚠️ 第一版问的是"这一段会不会跨行"（文本节点的值里
没有 `\n`、且兄弟里没有 `break` 才放行），那问法在"两行同段"时**永远答不成立**，于是病
照旧——**能不能拼成表只跟下一行长什么样有关，与这一段跨不跨行无关**。序列化器看不见
下一行，**我们看得见**（这一段自己的兄弟节点就在手里），所以直接问下一行本人。
三档结论：`像`（留）/ `一定不是`（放）/ `说不准`（留，`null`）。
⚠️ 两条**必须守住**：`state.stack` 里有 `tableCell` 时一律不动（格子里的 `|` 是分界线）；
**别把原文弄丢**——这几层在没有原文时按本仓惯例把节点原值交出去，那等于**连上游的转义
一起省了**，真表格里格子中的 `|` 不再转义、一行会被劈成三格。
⚠️ 还有一条 2026-10-04 试出来的：**"下一行像不像"要比它写在文件里的原样，一个字节都不
预先改写**。见过一份两颗竖线都被转义的伤文件（`\| 1 | 2 |` ＋ `\| --- | --- |`），要是
判之前先把下一行那颗 `\` 抹掉，第一行判成"像"、第二行判成"放"，结果是张首格被拼成
`| 1` 的残表；不预先改写就两颗一起放，重新打开是**一张完整的表**——那正是用户想要的。

**⑤ 判据在哪**：`tests/table-pipe.test.ts` **39 条**，其中一条**对照**用例是承重的——
**不挂这一层就复现出病**（不然"修好了"只是"测试没跑到"）。⚠️ 跑这几条必须把
`mdast-util-to-markdown` 的 `defaultHandlers.text` 传进来：生产路径上
`prev.handlers?.text` 一直在（不在的话前几层早就出事了），测试里没人替你传。

**⑥ 同批的第二颗反斜杠：正文里的 `$`**（`math-delim.ts` 的 `不转义美元`）。
上游 `mdast-util-math` 的 unsafe 表里那条是要把**行内每一颗 `$`** 都转义的
（`{character:'$', after: undefined, inConstruct:'phrasing'}`，`after: undefined` 就是
**不看后面是什么**），因为 `singleDollarTextMath` 默认 true——同一段行内内容里**任意两颗
`$` 之间都算公式**，而它一行一行地写、看不见另一颗在哪一行，只好全转义。于是
`价格 100$ 起` 存盘变成 `价格 100\$ 起`、`$ 你好 $` 变成 `\$ 你好 \$`——**与那颗竖线是
同一类病**（用户没打过，所见即所得里也看不出来）。判据是"**这一段的 `$` 全在这一颗文本
节点里**才动手"：① 直接父节点必须是 `paragraph`／`heading`／`tableCell`（夹在粗体、链接
里的一个字都不动——跨过行内节点的配对是真的）；② 父节点整棵子树里的 `$` 总数必须**恰好
等于**这一颗自己值里的 `$` 数（公式节点现拼的那两颗要按 `dollars` 补回来，不补就会把
"兄弟是公式"数成 0 颗）。⚠️ 两档结果都**稳定**：一对 `$` 放回来重新配成公式（用户打它
就是想写公式），一颗孤立的放回来还是文字（字节守恒）；**算不清的一律不动**（如
`公式 $x$ 和 100$`、`**甲 $ 乙**`，如实钉在测试里）。判据在 `tests/math-delim.test.ts`
（2026-10-04 新增第六、七、八组；那份测试现在共 **47 条**，第九组记的是下面 ⑦ 那件事）。

**⑦ 第五格 `收严公式`：当天加了、当天撤回**（同一天下午，用户拍板）。这一格**不在
这串处理器里**（它是解析那趟的一个 `$remark` 插件，排在 `标美元数` 前面），记在这里是
因为它与 ⑥ 挨着同一件事的**另一面**：那一条管"正文里的 `$` 别被转义"，这一条当初想让
"值两边带空格的 `$…$`"退回正文。

- **它当初为什么加**：用户拿 Typora 的截图点了三件（`docs/10` 那张 2026-10-04 的行），
  第一件就是"`$ 你好 $` 该算正文"。加了之后那三行确实退回正文了（`docs/06` §5.46 ①
  当场开窗读过，那一条当时是**过**）。
- **为什么当天撤回**：用户下午在**分屏预览**里发现它**顺手把 `$ \LaTeX $` 也判成了
  普通文字**——右边那一栏不再渲染，而这是他文档里天天写的写法。他的原话是一句
  「**突然正常输入也没法预览LaTeX了**」，看完四个选项之后拍的是「**整条撤回**」。
  ⚠️ **不是"判据写错了"**：上游 `remark-math` 认的本来就是"任意两个 `$` 之间"，我们
  加的那条**比上游严**，凡是比上游严的规则都要回答"被它多判下去的那些写法怎么办"，
  而 `$ \LaTeX $` 正是被多判下去的那一批里最常见的。
- **撤回了什么**：`math-delim.ts` 那一整格（`空白` / `值挨着空白` / `空格破了公式` /
  `收严公式插件` / `收严公式工厂` / `收严公式`，131 行）删干净；`create.ts` 里那条
  `.use(收严公式)` 删掉（那条链从四条回到三条，⚠️ **剩下那三条仍然必须紧挨着、顺序
  不能动**）；`math-input.ts::该变公式` 的第二个参数 `值` 拿掉，**只剩一道守卫**。
  ⚠️ **两侧一起撤**：只撤一边就成了"打字不转、打开又渲染"，那正是"同一把尺子"那条
  口径要防的事。
- ⚠️⚠️ **撤回是知情的，代价如实记**：`mdast-util-math` 解析时就把值两端的空白 **trim**
  掉了（`$ \LaTeX $` → 值 `\LaTeX`），序列化再按"值现算美元数"写回去，所以
  **所见即所得里存一次盘，`$ \LaTeX $` 会变成 `$\LaTeX$`——里外两颗空格没了**
  （分屏与源码模式存盘**逐字节不动**，因为那两条路不经过序列化）。⚠️ 想要"渲染 + 两颗
  空格都留着"，只有一条路：像 `dollars` 那样**另记一处"值两边有没有空格"**、序列化时
  补回去（同一条 `$remark` ＋ 同一个属性，改动面与 `dollars` 那次一样大）。用户这次
  **没要**，方案留在 `docs/07` §3。
- **第 54 项（`$100` 当货币）当时因此退回未修**：它当初是被第五格**顺带**治好的（那一对
  `$` 的值尾巴上带空格 ⇒ 退回正文）。⚠️ **2026-10-04 晚已另行修好，不靠这一格**：
  落点是**新文件 `src/editor/math-currency.ts`**（挂在 `remark-math` **后面**的一条
  `$remark`，包的是**分词器**上那条 `mathText`，与输入规则无关），口径是**门槛 ＋ Pandoc
  第 2、3 条**——⚠️ **不是**"`$` 紧跟数字就不认"，那句话单独用会把 `$2+2$ 和 $x$` 里的
  `2+2$ 和 ` 吃成公式。⚠️ **第五格撤回的口径一个字节没被碰**：`$ \LaTeX $` 右边是空格、
  连门槛都过不了，**照旧渲染**。细则见 §4.6e、`docs/07` 第 54 项那一行与那个文件头。

⚠️ 用户那句话是**三半**：前两半（多一颗 `\`、多一颗 `\$`）在**这一节**修；第三半
「表格出不来」是 **BUG-51**（敲收尾竖线那条输入规则静默退场），**不在这一层**——
那颗反斜杠会被分词器当转义吃掉，表照样成形（`tests/table-pipe.test.ts` 里钉着实测）。
⚠️ 用户 2026-10-04 那句话末尾还有个「**而且。**」，后面没有下文了，只能按几句症状去抓，
抓到的是上面这两颗。

### 4.18 裸 URL ＋ 粘贴网址（`editor/url-link.ts`，2026-09-28）

用户原话：「**裸 URL 自动识别成链接**」「粘贴 URL 到选中文字 → 自动包成链接」。
这一节装 `docs/10` 里那两格 ⬜。

#### ① 两路，一处判据

| 什么时候 | 怎么进 | 落到文档上的样子 |
|---|---|---|
| 打到**词尾**（空格 / 制表符） | 输入规则 `自动链接输入()` | 那段文字挂上 `link` 标记 |
| **粘**进来 | `editor/paste.ts` 调 `贴上网址事务` | 同上；**选区非空时是给选中那段挂标记**（文字一个字节不动） |

⚠️ **两路必须同答案**：判据只有 `正规化网址` 一个出口（同 `find.ts` /
`table-width.ts` 那条「匹配逻辑只有一份」）。分成两份的症状是「打出来是链接、
粘进来不是」，而用户没法理解为什么。

#### ② 口径（四条，都是取舍）

1. **只认有来头的写法**：`http(s)://` 与 `www.` 开头。
   ⚠️ **裸域名（`example.com`）一律不认**——这是**故意**的。认了的话
   `README.md` / `node.js` / `index.html` / `图.png` / `v1.2` 全变成链接，
   而「把用户写的普通文字改成一个链接」是这件事唯一不能犯的错
   （与 `auto-correct.ts` 的入表判据同一条道理）。GitHub 认裸域名，
   代价正是这几类误报。
2. **危险协议一个都不放**（`javascript:` / `vbscript:` / `data:` / `file:` /
   `blob:`）。⚠️ 上游 `linkSchema` **不校验 `href`**，而这里一个输入源是
   **剪贴板**——粘一段带 `javascript:` 的东西进来等于把可执行文本写成链接。
   ⚠️ 判据是「去掉全部空白与控制符之后的前缀」，不是字符串开头，
   否则 `java<TAB>script:` 会从闸底下钻过去（浏览器解析 `href` 时会吃掉那些字符，
   它**仍然是**一条 `javascript:`）。⚠️ `mailto:` / `tel:` **放行**——那是正当协议。
3. **只动「刚敲进去 / 刚粘进来」的那一串**：`Ctrl+Z` 一步退回纯文本。
   **已有文本一个字节不改。**
4. **尾标点留在链接外面**（`切尾标点`）：句读（`.,;:!?`）**一律切**；
   右括号 / 右引号（含中文那一族 `」』》〉`）**数着切**——`A_(b)` 那种配平的地址
   必须保住结尾那颗 `)`，而 `(https://a.com)` 那颗是外层括号的。

#### ③ `render` 那一侧不参与

输入规则挂在 `create.ts` 的 `.use()` 链上、**没有开关**（用户要的就是它一直在，
为它加一格控件只是多一个没人会拨的开关）。

#### ④ 已知边界

- ⚠️ **行尾那颗回车不触发**：输入规则只在「打字」那一下跑，回车不是打字。
  所以一行结尾的 URL（后面直接换段）要等下一个空格才成链接。Typora 在回车时也转，
  本仓没做——那要在 `Enter` 的 keymap 里插一手、再和段落切分抢同一颗按键。
- ⚠️ **行内代码与围栏代码块里不触发**（`规则选项` 的 `inCodeMark: false`）。
- ⚠️ **不做「输入时把已有文本重扫一遍」**（Nota 那条「存盘不要自动修复」的铁律）。

⚠️ **判据**：`tests/url-link.test.ts` **29 条**。⚠️ 它**证明不了**「打完一行网址敲空格，
屏幕上真变成链接」（要真 `Editor.make()` ＋ 真 DOM），也**没验** `贴上网址事务`
（要真 `EditorState`）——列进 `docs/07` 的开窗目检。

### 4.19 粘贴那一路：一个分发口 ＋ 两份判据（`editor/paste.ts` / `editor/paste-clean.ts` / `editor/lang-guess.ts`，2026-09-28）

用户原话：「粘贴 HTML/Word→转干净 Markdown」「粘贴 Markdown 源码→解析成富文本」
「**粘贴代码→认语言包成代码块**」。前两条**上游本来就有**（见下），这一节讲的是
为什么还要自己插一手、以及插在哪里。

#### ① ⚠️⚠️ 顺序：`粘贴处理()` 必须排在 `clipboard` **前面**

PM 按 `state.plugins` 的顺序问 `handlePaste`，**第一个返回 `true` 的赢**，
而 `@milkdown/plugin-clipboard` 只要剪贴板里 `text` / `html` 非空就 `return true`
——排在它后面等于**永不被调用**。这是这一整节最容易踩、也最难查的一颗雷
（症状是「功能没生效」，不报错）。

#### ② 四条判据（按序）

| # | 什么时候 | 做什么 |
|---|---|---|
| ① | 剪贴板里干干净净就是一条网址 | 交给 `url-link.ts` 的 `贴上网址事务`（§4.18） |
| ② | 有 HTML | `paste-clean.ts` 洗净，再让上游按 Markdown 解析 |
| ③ | 纯文本 ＋ `像代码` | 认语言，包成 `code_block`（**上限 50KB**） |
| ④ | 其余 | 原样交给上游 |

⚠️ **代码块里粘网址是纯文本**（与上游同一处口径）。⚠️ 第 ③ 条的 **50KB** 抄的是
VMark 的 `codePaste`（它的判据是行数 ≥ 2、≤ 50KB、打分 `confidence === "high"`）。

#### ③ 「粘 Markdown 源码 → 富文本」是**上游的**，别补坏

上游 `clipboard` 的 `parser(text)` **就是** Markdown 解析器，所以粘一段源码进来
天然是富文本。⚠️ `paste.ts` 在那一条分支上留了记号——后人看到「粘进来是富文本」
不要以为缺了什么再去自己接一套（那会和上游抢同一颗粘贴）。

#### ④ 洗 HTML：为什么不用 `DOMParser`

`paste-clean.ts` **自己扫标签**。理由：本仓没有 jsdom，用 `DOMParser` 就不是纯函数、
**测不了**（这一层的对错只有两种表现，而两种都不报错——洗过头是「两段并成一段」、
洗不干净是「存盘里多出一堆 `mso-*`」）。代价如实记：**畸形 HTML 处理不了**
（没闭合的标签、没加引号的属性值里带 `>`）。

三件事：

| 做什么 | 边界 |
|---|---|
| **整块删** | `script` / `style` / `head` / `title` / `iframe` … 连内容一起（留着内容等于把一段 JS 贴成正文） |
| **丢壳** | `span` / `font` / `section` / `body` … 只丢标签、留内容。⚠️ **`div` 刻意不丢**：ProseMirror 的 `blockTags` 里有它，靠它 `<div>甲</div><div>乙</div>` 才会被解析成**两段** |
| **样式换语义标签** | `font-weight` → `<strong>`、`font-style` → `<em>`、`text-decoration:underline` → `<u>`；`<b>` / `<i>` / `<strike>` 换成 `strong` / `em` / `s`（只留一套写法在文档里跑） |

⚠️ **栈上每一项记着「开标签输出过没有」**（2026-09-28 修的真 bug）：`丢壳` 与命名空间
（`<o:p>` / `<w:ProofErr>`）那两类**只丢标签、留内容**，它们的开标签一个字没写出去，
闭合标签也就一个字都不该写。加这一格之前 `<span>甲</span>` 洗出来是 `甲</span>`
——一对孤零零的闭合标签。

#### ⑤ ⚠️ `<pre>` 的 `data-language`：着色能不能活下来的唯一通道

`code_block` 的 `parseDOM` 读的是 `dom.dataset.language`，所以洗的时候必须给
`<pre>` 带上它。`找语言线索` 认这五种写法（都是真实网站用过的）：

| 出处 | 长什么样 |
|---|---|
| GitHub | `class="highlight highlight-source-js"` |
| StackOverflow / Highlight.js | `class="lang-python"` / `class="language-rust"` |
| 各家 Markdown 渲染器 | `class="language-ts"` |
| Prism | `class="language-css"` |
| 自定 | `data-language="go"` / `data-lang="go"` |

⚠️⚠️ **两张表**（2026-09-28 修的真 bug）：抓出来的那截**先**走 `lang-guess.ts` 的
`扩展名表`（`js` / `py` / `ts` 这些写法本身就是扩展名），**落空再**走本文件的
`语言名表`（`python` / `rust` / `javascript` 这些**语言长名**）。**只查前者的话一个都
落空**——因为长名压根不是扩展名（表里的键是 `py` / `rs`）——而脚本**一个字都不报**，
症状只是「粘进来的代码块没有语言」。⚠️ **顺序不能反**：长名表里 `sh` / `bat` 这些键
也兼着扩展名的身份，先查扩展名表才能保证 `.sh` 文件与 `class="lang-sh"` 同答案。
⚠️ 两张表的一致性由测试兜着（`语言名表` 里**每一个值**都必须在 `扩展名表` 里出现过
——这张表只能换名字，不能引进一个别处不认的语言 id）。

⚠️ 每个 `<pre>` **自己**的线索优先于全文第一个（一份 HTML 里几个代码块语言不同时，
只看「全文第一个」会串味）。

#### ⑥ 判据在哪

| 文件 | 条数 | 盯什么 |
|---|---|---|
| `tests/paste-clean.test.ts` | **25** | 垃圾扔掉／壳拆掉块留下／样式换语义／`data-language` 那五条／两张表的一致性／边界 |
| `tests/lang-guess.test.ts` | **31** | `像代码` 的三条否决／按扩展名 / 按内容 / 按文件名线索的优先级链／**表里每个 id 在 `refractor` 里真的存在** |

⚠️ **「粘一段 Word 的 HTML，编辑器里真是一段干净内容」没验**（要真 `EditorView`，
本仓没有 jsdom）。这里验的是**喂给 ProseMirror 的那串 HTML**，中间还隔着它自己的
解析器。列进 `docs/07` 的开窗目检。

### 4.20 自动配对 ＋ `Tab` 跳出右半边（`editor/auto-pair.ts`，2026-09-28）

用户原话：「Tab 跳出右半边」（说了两遍）。

#### ① 六种行为

| 用户做了什么 | 结果 |
|---|---|
| 打 `(`（正文里、前面不是反斜杠） | 变成 `()`，光标在中间 |
| 打了闭括号、右边正好也是同一颗，且左边确有未闭合开符号 | **不插**，跨过去（否则成 `())`） |
| 光标夹在一对**空**括号中间按退格 | 两颗一起删 |
| 选中一段再打 `(` | 把那段包起来 |
| `Tab` 且右边紧挨着闭括号 | 跨过那颗闭括号 |
| `Shift+Tab` 且左边紧挨着开括号 | 跨回左边 |
| 正文里打 `*`（见 §4.20b） | 变成 `*|*`；光标夹在一对空星号里再打一颗 → **升级**成 `**|**` |
| 正文里打 `[`（见 §4.20c） | 变成 `[]`；光标夹在一对**空**方括号里再打一颗 → **升级**成 `[[|]]` |
| 正文里打 `_` / `~` / 反引号 | 分别配对斜体 / 下标 / 行内代码；`_`、`~` 再打一颗升级为粗体 / 删除线 |
| 正文里连打两个 `=` | 第二次才展开为 `==\|==`，随后落成高亮 |
| 选中一段再打 `*` / `_` / `~` / `^` / 反引号 | 用一对标记包住选区；选区继续选中原文，再按一次可叠成双颗 |

#### ② ⚠️ 表里收哪些、不收哪些（这一节的重量都在这儿）

**收 `(` `{` `[` 与中文全角那一族**（`（）` `【】` `「」` `『』` `《》` `〈〉`）。
⚠️ `[` 是 **2026-09-28 由用户点名从"不收"挪进来的**，见 §4.20c。
剩下不收的每一个都有理由：

| 不收 | 为什么 |
|---|---|
| 直引号 `"` `'` | 归 `smart-punctuation.ts`——它按前一个字符决定弯成 `“` 还是 `”`。这里再补一颗 = 同一颗按键两套规则 |
| `#` `>` `|` 等块级 / 表格语法 | 没有可靠的行内闭合语义，交给各自的块级输入规则 |

⚠️ **2026-10-17 起，Markdown 行内标记不再按“字符白名单”硬塞进括号表**：`*`
`_` `~` 反引号与 `=` 走 `自配对表`，按现场决定补、升级、补齐还是跳过；收尾时直接
落成 `emphasis` / `strong` / `subscript` / `strike_through` / `inlineCode` /
`highlight` 标记。这样补出来的闭符号不是死字符，不会在存盘时被转义成反斜杠。
⚠️ 行内代码的 mark 不是右侧 inclusive 的，`appendTransaction` 会在光标贴着代码尾巴时
重新续 `storedMarks`；不续的话实机落盘是 ``x`c`ode``，只包住第一个字符。用户再敲
反引号时才由“到此为止”吞掉那颗键并结束代码。
⚠️ `=` 单颗没有 Markdown 语义，必须第二颗才展开；`*` 与反引号在段首不补，分别把
项目符号与围栏代码块留给上游。闭括号的“跳过”也改成必须先在前文里找到未闭合开符号，
零散右括号不会被静默吞掉。

#### ③ ⚠️ `Tab` 那一手必须排在 `indent` **前面**

`@milkdown/plugin-indent` 的 `$shortcut` 绑的就是 `Tab`（插两个空格）。而**它只在
右边紧挨着闭括号时返回 `true`，其余一律放行**——不然全文档的缩进就没了。
⚠️ PM 的 `handleKeyDown` 返回 `true` 时会 `preventDefault()`。
⚠️ `Tab` 到了 2026-10-04 有**第二个争夺者**：表格里那一支（§4.21，最后一格加行 /
第一格 `Shift+Tab` 吃掉）。三份判据都窄，所以顺序定成 **括号 → 表格 → 缩进**。

#### ④ 已知边界

- ⚠️ **组字期间（`view.composing`）不插手**——那是 IME 的活。
- ⚠️ **代码块 / 行内代码里不配也不跳**（那颗 `Tab` 留给缩进）。
- ⚠️ **前一字符是反斜杠**视为用户自己在转义，不配对。
- ⚠️ 不做 Smart Brackets（不把已有的 `)` 当成用户已经打过的闭括号）。

#### 4.20b ⚠️ Markdown 标记走自配对表（2026-09-28 起，2026-10-17 扩成一组）

用户原话：「写一个算法判断比如输入一个*自动补全另一个。**如果判断为是则就补全**」
——⚠️ 重量在**后半句**：不是无脑补，是**带着判断**补。

§4.20 ② 那张表里 Markdown 标记原本写着「不收」。用户这一句**推翻了它一半**，
所以现在是：**`*` `_` `~` 反引号与 `=` 收，但它们不进括号配对表，走 `自配对表`**。

| 用户做了什么 | 判断 | 结果 |
|---|---|---|
| 正文里打第一颗 `*` | `补一对` | `*\|*` |
| 光标正好夹在一对**空**星号里（`*\|*`）再打一颗 | `升级` | `**\|**`（那颗旧的左星号被换掉，不是并排插） |
| 右边有星号、左边不是（`*甲\|*`）再打一颗 | `跳过` | **落成真标记**：`甲` 变斜体（见 §4.20d） |
| 右边有**两颗**星号（`**甲\|**`）再打一颗 | `跳过` | **落成真标记**：`甲` 变粗体（见 §4.20d） |
| `_甲` / `__甲` | 与 `*` 同规则 | 斜体 / 粗体 |
| `~甲` / `~~甲` | 单颗下标、双颗删除线 | 落成 `subscript` / `strike_through` |
| `` `甲 `` | 补出闭反引号 | 落成 `inlineCode` |
| `==甲` | 第一颗原样插入，第二颗才展开 | 落成 `highlight` |
| 段首（`* 项目` 那种要打无序列表） | — | **不补**（补了就成了 `*\|* 项目`） |
| 段首反引号 | — | **不补**，留给围栏代码块 |
| 有选区（想在星号上「包起来」） | 交给 `selection-marks.ts` | **包住选区**，不覆盖原文；跨段和代码里放行 |
| 代码块 / 行内代码里，或者前一颗是反斜杠 | — | **不补**（同 §4.20 ④） |

⚠️ **为什么不并进 `配对表`**：并进去之后 `要跳过` / `要删成对` / `要跳` 那三条会**同时**匹配到 `*`，
而那三条规则从没说过「在一颗自配对字符上该怎样」（比如 `*|*` 按退格是删两颗还是删一颗？）。
单开一张表让「星号这件事」能在一处读完，也让上面那张表**是可执行的**。
⚠️ **已知边界**：**缩进过的列表仍拦不住**——`    * 项目`（前面有空格）时那颗 `*`
前面不是行首，判据只看紧挨着的那一颗字符，所以照样会补成 `    *|*项目`。
源码里的列表写作者请关掉「智能符号补全」。

#### 4.20c ⚠️ `[` 收进来了 ＋ **一个开关管整条插件**（2026-09-28 用户点名）

用户原话：「自动补全**`*`、`[`** 这种在设置中**搞一个选项**，**智能符号补全**。
**默认为开**。」⚠️ 这一句里有两件事：**收 `[`** 与**那个设置项**。

**① `[`：从"不收"改成"收"。** 上面 §4.20 ② 当年把它挡在门外，理由是
`[文字](地址)` 会被弄坏（`](` 那颗闭方括号落在地址前面怎么办？）——**那条理由今天
仍然成立**，是用户点名才收的。收进来靠三件事把风险压住：

| 压风险的 | 怎么压 |
|---|---|
| 打 `]` 时「跳过」 | 用户写链接是 `[` → 文字 → `]` → `(地址)`；那颗**亲手敲的** `]` 不插字、只跨过我们补的那一颗，链路仍是 `[文字](地址)` |
| **`[[` 升级** | 夹在一对**空的**方括号里再敲一颗 `[` ⇒ `[[\|]]`。⚠️ 没有这一条，第二次敲 `[` 会得到 `[[]`——**少一颗闭括号**（我们补的那颗 `]` 会被"跳过"吃掉），于是 Wiki 链接 `[[页面]]` **根本打不出来** |
| 一个开关 | 见下面 ②：真被咬到，用户不必等我们发版 |

⚠️ 与 `*` 那条**不同**：`[` 的闭是 `]`（开 ≠ 闭），所以它**进 `配对表`**，
四条键位判据（跳过 / 删成对 / `Tab` 跳）在它身上全都成立；只有"升级"那一下单列一张
`可升级表`。⚠️ 「打 `]` 跳过」这一条**没有在真窗口里逐键走过**（列在 `docs/07` §4）。

📌✅ **2026-09-29：那条 BUG-54 结清了**——真凶是「补出来的那一对星号压根没成为 mark」，
反斜杠是**序列化器对字面星号的正确处理**（见 §4.20d），修法在编辑器这一侧。
⚠️ 这一节的候选里**序列化侧那个分支被推翻**（"反斜杠是不是 bug"的答案是"不是"），
输入规则侧是对的、但修法不是改上游那条规则。⚠️ **当时那句"别照着用户看到的现象回改这一节"
是错的**——用户描述的现象（多一颗 `\`）与本节的设计（补出一对 `**`）之间的差别，
**恰恰就是缺陷本身**；差别的成因量出来才对，`docs/07` §2 那一行已结项。

**② 那个开关：`Settings.editor.smart_symbols`**（设置里叫「智能符号补全」，**默认开**）。
⚠️ 它是**整条插件**的开关——关掉时 `配对处理()` 返回 `[]`，也就是**这条插件不装**
（同 `smart-punctuation.ts` 的 `标点输入` 那个做法）。**不是"补得少一点"**：
四件事（补一对 / 跳过 / 空对退格 / `Tab` 跳出右半边）互相咬着，只关一半的话 `Tab`
会去跳一颗根本没被补出来的括号。⚠️ 改这一项要**重建编辑器**才生效
（与编辑器那一页其余选项同一个口径）。

⚠️ **它取代了 `match_brackets` / `match_markdown` 那两条死开关**（2026-09-28 删）：
那两条**存了值、从来没有任何代码读过**——界面上摆着两颗能拨的开关、拨了什么都不发生，
比没有那两颗更坏。它们本来就是一件事的两半（用户原话里 `*` 与 `[` 是并列举的两个例子）。
⚠️ 老 `settings.toml` 里那两行留着**也不报错**（`#[serde(default)]` 忽略不认识的键），
下次保存时自然消失；不必为它写兼容代码（老配置不兼容是这个项目的既定口径）。

#### 4.20d 收尾那一下要**落成真标记**（BUG-54；2026-09-29 首修，**2026-09-30 补齐触发时机**）

用户报的就是这一句：**智能补全的 `*` 会自动前加一颗反斜杠，于是这条补全「没有用」**
（原话「现在智能补全的\*啥的会自动前加斜杠所以没有用」）。账在 `docs/07` 的 BUG-54。

**病灶不在反斜杠上**：`补一对` 是把**字符**插进去（`*` ⇒ `*|*`），插完那颗闭星号落在
光标的**后面**——上游 `emphasisInputRule` 要的是「用户刚敲下的那一颗就是闭定界符」，
它**永远等不到**。于是这一对星号始终是**字面文字**，`mdast-util-to-markdown` 对字面星号
就**该**转义，盘上写出来自然是 `\*甲\*`。⚠️ **去掉那颗反斜杠等于改用户的数据**
（解析回来看见的就是另一份文档），`inline-marks.ts` 的「不转义孤立波浪号」那一段把这条
道理写透过：**宁可留着噪音，不许改数据**。所以修法只能在**编辑器这一侧**。

##### ⚠️⚠️ 首修为什么没修好（2026-09-30，用户第二次报同一件事）

用户原话：「**还是会自动插入斜杠。渲染仍未成功。**」，截图里 `*你好*` 是**正体**、
两颗星都在。首修只改了 `补标记` 的「跳过」那一支——**那一支要求有一颗真的按键落在
闭星号上**。可 `*` 是自配对的：闭星号是**我们插进去的字符**，永远不会有按键走到那里。
于是那一条**只在用户自己把第三颗星敲出来时才走得到**，而用户抱怨的恰恰是「不敲第三颗」
那条路：`x` → `*` → `你好`，屏幕上看着已经是 `x*你好*` 了，谁还会再敲一颗。

现在同一个 `收尾事务` 挂在**三个触发时机**上：

| # | 现场 | 谁叫的 |
|---|---|---|
| ① | `*甲` 后面**用户自己敲下**收尾那颗 `*`（右边没有星号） | `handleTextInput` 里"补一对"那一支，先问这一句 |
| ② | `*甲\|*` 里用户敲的星号落在**补出来的**闭定界符正前面 | `补标记` 的「跳过」那一支 |
| ③ | 打正文把夹着的那一对**打完**了（`*甲\|*` 里打进 `甲`） | `handleTextInput` 普通文字那一路的最后一句 |

① ② 传 `结束 = true`（用户敲下闭定界符 = "斜体到这儿结束"，接着打的字是平的），
③ 传 `结束 = false`（人在星号**中间**打字，那一对在他心里还开着，后面的字继续斜）。

⚠️ **另有一条兜底，因为拼音输入法压根不走 `handleTextInput`**：候选框上屏是一笔直接
插字的 `Transaction`。所以插件里另挂了 `appendTransaction`，对**每一笔**落定的事务重问
一遍 `收尾事务`（这一次传 `结束 = false`）。⚠️ 它只在这一对**已经进文档之后**才看得见
现场。⚠️⚠️ **它必须真挂在插件上才跑得到**——`appendTransaction` 是 `EditorState.apply`
按 `state.config.plugins` 挨个问的，光有函数不算数；首版测试的假视图建 `EditorState` 时
**没传 `plugins`**，于是"输入法那条路"在测试里**压根不会跑**，而"测过了"就成了假话。
现在两组共用的那个 `造视图` 显式注册了插件。

⚠️ **已有标记的尾巴上再敲 `*` ⇒ 一个字符都不加**（`尾巴带标记` ＋ `到此为止事务`）：
插一颗字面星号进去，盘上就会是 `*甲*\*`——**正是用户抱怨的"自动插入斜杠"**。
宁可吞掉这颗按键，也不亲手制造那份噪音。（`尾巴带标记` 只答"要不要继承标记"，
吞键是调用方那一句 `dispatch(到此为止事务(state))` 做的。）

**修法**：从光标往左找回开定界符（撞上同一颗字符、或 `textBetween` 取不到字符就停，
**回看上限 200 颗**），九道判据全过才落标记：

| # | 判据 | 不过会怎样 |
|---|---|---|
| 1 | 这颗字在**落标记表**里（`*` / `_` / `~` / 反引号 / `=` 各有单颗或双颗 mark） | `[` 那种没有 mark 可落的，照旧只是跳过 |
| 2 | 光标所在父节点是**行内**内容 | 在代码块之类的地方不该落 |
| 3 | 右边真有闭定界符 | 没有就不是收尾 |
| 4 | 内文非空、且**没扫满上限** | ⚠️ 扫满 200 颗 = 压根没找到开定界符，**不是**"找到了一对很长的" |
| 5 | 内文两头没有空白 | `* 甲 *` 那种不碰 |
| 6 | 左边那颗确实是本字 | 兜住"扫到一半停了"的现场 |
| 7 | 开定界符**前面**不是 `\` | 用户在转义（`\*甲*`），不碰 |
| 8 | 开闭**颗数相配**（一颗配 `emphasis`、两颗配 `strong`） | `*甲**` 这种残缺配不落 |
| 9 | schema 里真有那颗 mark | 防名字写错时静默无事 |

落法是一笔 `replaceWith`（`*甲*` ⇒ 带 mark 的文本节点），然后把光标放到**内文之后**、
并 `setStoredMarks([])`——⚠️ **最后这一句是必须的**：`insertText` 用的是
`storedMarks || $from.marks()`，而**空数组是真值**，所以只有显式清空才能让它不继承
刚落的那颗 mark（不清的话，收尾之后接着打的第一个字会跟着变斜体）。⚠️ 但它**只在
① ② 那两条路上做**——③ 是"人还在星号中间打字"，清了就把光标后的输入踢出斜体
（实测会退化成 `文(x) + 文(你)@emphasis + 文(好**)`），所以那一条传 `结束 = false`。

⚠️ **故意留着的一条边界**：**没闭合的一对仍然是字面文字**——只打了 `*甲`、中途把光标
点到别处，它照旧会被转义成 `\*甲`。这是「宁可留着噪音，不许改数据」那条原则的直接后果，
**不是漏修**。⚠️ 2026-09-30 起这条**只覆盖"打了一半"**：`x` → `*` → `甲` 已经算收尾
（补出来的闭星号就在光标右边），首修把这两件事混成一件，才有第二次报。

⚠️ **代价如实记着**：`2*3` 这种乘法写法，补全那一下会把它落成 `2*3*` ⇒ `3` 变斜体。
CommonMark 对 `2*3*` 本来就是这个答案，**不是判错了**；但打乘法的人想要的是字面星号。
真被咬到，关掉「智能符号补全」这条插件整个不装。

⚠️ **两个下标坐标系别混**（第一版就栽在这儿）：`textBetween` / `Fragment` 吃的是
**父节点的内容坐标**，而 `state.tr.replaceWith` 吃的是**文档位置**——两套差着 1
（位置 = 内容坐标 ＋ 块首 ＋ 1）。混用一次就是差一颗字符。

⚠️ **判据**：`tests/auto-pair.test.ts` **63 条**——两张表互为反表（防死行）、
该收的收了不该收的没收（上面那张表是可执行的）、四条判据的边界、装配，
＋ 第七组 5 条专测 `[`（`[` 配 `]` / 四条"不该补" / `]` 一侧的跳过与退格 /
只有升级那一种现场由它插手 / 可升级表里只有它 / `[|]` ⇒ `[[|]]`）、
＋ 第八组 10 条专测 Markdown 自配对（`*` / `_` / `~` / 反引号 / `=` 的补一对、
升级、段首例外与非法颗数），
＋ 第十组 2 条钉住开关（`配对处理(false)` 给空数组、不传参数 = 开）、
＋ **第十一组 7 条专测收尾落标记**（§4.20d：`x` ＋ `*abc*` ⇒ `emphasis` ／ 两颗星配
`strong` ／ 收尾之后接着打还是普通文字 ／ 内文两头空白不收 ／ 没有开定界符不收 ／
开闭颗数不配不收 ／ 开定界符前有 `\` 不收）、
＋ **第十二组 7 条专测"三个触发时机"**（2026-09-30 加：段首 `*你好*` 那颗**用户自己敲
的**收尾星 ⇒ `emphasis` ／ `x*你好` 第三颗**不敲** ⇒ 同上 ／ **输入法上屏**那条路
（不经过 `handleTextInput`，走 `appendTransaction` 兜底）⇒ 同上 ／ 三颗键全敲 ⇒ 第三颗
**被吃掉**不多出字面星号 ／ 已落成标记的尾巴上再敲 `*` ⇒ 一个字都不加 ／ `* 项目`
（星号后是空白）⇒ 不落标记 ／ `\*甲*` ⇒ 不落标记）。
＋ **2026-10-17 的 6 条扩展**：零散右括号不跳过、转义 / 已配平右括号不跳过、
自配对空对可整体退格、`Tab` 可跨过自配对闭符号，以及 `_` / `~` / 反引号 / `=`
四条真实 schema 落标记链路。
⚠️ **第十一、十二组那份是真插件、不是纯函数**：从 `配对处理(true)` 那个 `$prose` 工厂里
掏出 ProseMirror 插件再喂一个 `EditorState`（两组共用同一个 `造视图`，它**显式注册了
插件**——见上面 `appendTransaction` 那一段）。走这条路有两处**只能靠报错学**的：
① 工厂体里要 `ctx.update(prosePluginsCtx, …)`，所以**先得 `ctx.inject(prosePluginsCtx)`**
（少了它报 `Context "prosePlugins" not found`）；② `配对处理(true)` 返回的是**一个函数**
（`$prose` 本身），**不是数组**——`配对处理(false)` 才返回 `[]`。
⚠️ **第三处是 2026-09-30 踩的**：`造视图` 里那个偏移量**不能 `Math.max(1, …)`**——
空段落里只有一个位置（1），硬抬到 2 就跑到段落外面去（`TextSelection endpoint not
pointing into a node with inline content`）。空段落那条判据就栽在这。
⚠️ 它**证明不了**三件事：「打 `(` 屏幕上真出现 `()`」、「`Tab` 真的跨过去了、
而且没被 `indent` 抢走」、以及**收尾那一对的落盘字节**——前两件要真 DOM / 真键位，
列进 `docs/07` 的开窗目检；⚠️ **第三件 2026-09-29 已经开窗看过了**
（`docs/06` §5.37：切到源码模式，盘上是干净的 `x*abc*`、一颗反斜杠都没有）。


#### 4.20e 选中文字后的标记包裹（`editor/selection-marks.ts`，2026-10-23）

自动配对的另一半是“已经有选区”这条路：选中文字后直接按 Markdown 标记，用户要的
是把选区变成该标记，而不是用一颗字符覆盖掉整段。

| 按键 | 第一次 | 保持选区后再按一次 |
|---|---|---|
| `*` / `_` / `~` / `^` | 包一层：`*甲乙*` | 再包一层：`**甲乙**` / `__甲乙__` / `~~甲乙~~` |
| 反引号 | 包成行内代码 | 继续包第二层（通常不需要） |
| `=` | 直接包成 `==甲乙==` | 与其它标记一致地再包一层 |

包裹后**仍然选中原文**，不是把光标放到末尾；这样第二次按键才能自然叠成强标记。
实现只发一笔事务：先插右侧、再插左侧，最后把选区映射到新文档。跨段选区、
代码块和行内代码一律返回 `false`，继续走编辑器默认输入。插件排在
`配对处理` 前面，并在 `smart_symbols` 关闭时整条不安装。

判据 `tests/selection-marks.test.ts` **7 条**，覆盖两层叠加、高亮双等号、
插件入口、跨段与两类代码区域。⚠️ 它**证明不了**真窗口里的按键链和视觉反馈；
那半截要看统一开窗验收。


### 4.21 表格里的 `Enter` / `Tab` / `Shift+Tab`（`editor/table-tab.ts` / `editor/table-enter.ts`）

用户报的是 `docs/07` 第 55 项的 ②③ 两条：**表格最后一格**按 `Tab`，格子里被塞进两颗空格
（而且**会写进文件**）；**第一格**按 `Shift+Tab`，按了没反应，**接着打的字却落到别处**。

#### ① 四种现场

| 现场 | 敲 | 旧行为（病） | 新行为 |
|---|---|---|---|
| 中间那一格 | `Tab` | 走到下一格（**上游办的**） | 不变 |
| **最后一格** | `Tab` | 往**格子里**插两颗空格 ⇒ `\| 甲 \| 乙␣␣ \|` **写进文件** | 在下面**加一行**，光标进新行第一格 |
| 中间那一格 | `Shift+Tab` | 走到上一格（**上游办的**） | 不变 |
| **第一格** | `Shift+Tab` | **焦点静默飞出编辑器** | 什么都不做，但**把这颗键吃掉** |
| 中间那一格 | `Enter` | **直接退出表格**，光标到表后 | 走到下一格 |
| **最后一格** | `Enter` | **直接退出表格** | 加一行并落到新行第一格 |

#### ② ⚠️ 上游已经在管什么（这一节是重点，别重复实现）

`preset-gfm` 的 `tableKeymap`（走 `prosemirror-keymap`，排在本条**前面**）**已经绑了这两颗键**：
`NextCell` = `["Mod-]", "Tab"]`、`PrevCell` = `["Mod-[", "Shift-Tab"]`，`ExitTable` =
`["Mod-Enter", "Enter"]`——前两条各自只是转手调一次上游的 `goToNextCell(±1)`。
所以**"中间那一格"两个方向本来就有人办**，本文件一个字都不管。

📌 **2026-10-23 把裸 `Enter` 接回来了**：`table-enter.ts` 用 `$shortcut` 的
priority 110 压过上游 `ExitTable`，中间格复用 `goToNextCell`，末格复用
`表格Tab处理` 的加行逻辑；`Mod+Enter` 仍在 keymap 里负责退出，`Shift+Enter`
仍是软换行。这样 Tab 与 Enter 共用同一份行结构计算，不再出现“Enter 总是跳出表”
的割裂手感。

上游那两条命令各有一种现场会返回 `false` **撂挑子**——"最后一格再往右""第一格再往左"
（`TableMap.nextCell` 越界给 `null`）。键于是继续往后走，**病只出在这两种掉下来的现场**。

#### ③ ⚠️ 掉下来的键各自落到了谁手里

- **最后一格 `Tab`** → `@milkdown/plugin-indent`（`create.ts` 里的 `.use(indent)`）。
  它的实现就一句 `tr.insertText("  ", to)`：**不看选区在哪、也不看有没有选区**，
  只要有位置就往里塞两颗空格。⚠️ 所以 ② 不是"缩进写错了"，是**缩进本就不该管表格**。
- **第一格 `Shift+Tab`** → **没有任何人接**（`indent` 只绑 `Tab`）。键落到浏览器手里，
  而它给 `Shift+Tab` 的默认动作是「**把焦点移出编辑器**」。页面上看不出任何变化，
  人以为还在格子里——接着打的字却落到了别处。⚠️ **吃掉这颗键是有意的**：
  「没反应」比「静默换焦点」好得多。

#### ④ ⚠️ 加的那一行：为什么不用上游的 `addRow`

用 `goToNextCell(方向)` 走"上一格 / 下一格"（它认得 `TableMap`、也认得 `CellSelection`），
**只有"最后一格再加一行"那一支自己拼**：永远一条 `table_row` 装一排空 `table_cell`
（对齐不用管——`preset-gfm` 的 `keepTableAlignPlugin` 每次会把表头的 `alignment` 抄给每一格）。

⚠️ **不用 `addRow` 的主要理由**：它按**角色名**找节点（`tableNodeTypes()` 按 `tableRole` 索引），
而 `preset-gfm` 比上游多一条独立的表头行 `table_header_row`，那条是
`...originalSchema.table_row` 摊出来的 ⇒ **两个节点的 `tableRole` 都是 `"row"`**，
抢同一个槽位、**谁在 `schema.nodes` 里靠后谁赢**，而那个次序由 Milkdown 内部组合插件的
顺序决定、**本仓管不着**。真落到表头行上，拼出来的就是"一条表头行装着一排数据格"
——**schema 不合法的文档**。所以走 `表格Tab处理` 里的 `行格类型`：**先认名字**
（`table_row` / `table_cell`，与 `preset-gfm` 源码同名），**认不到才退回角色表**。

⚠️ 次要的一条也记着：`addRow` 的新格类型是**从"上面那一行"抄的**（`refRow = -1`）。
在"表头没有独立行"的上游形状里那是对的；`preset-gfm` 给表头单起了行之后，这条规则
**只剩一种抄法是对的**，而它并没有为此加判断。

⚠️ **一条如实记下的边界**：`addRow` 里还有半截是抄上一行的 `rowspan`（合并格），
而 GFM 表格压根表达不出合并格，那半截在本仓**永远走不到**。同理，"在表头行最后一格按
`Tab` 要加行"这件事在真 schema 下**也走不到**：`table` 的内容表达式是
`"table_header_row table_row+"`，表头行后面**必然还有数据行**，`goToNextCell` 总会先找到
下一格。所以那条"歧义"是个**潜在**的坑（靠的正是上面那个本仓管不着的次序），
不是今天就在冒烟的病。

#### ⑤ ⚠️⚠️ "认键"得看 `keyCode`（这个文件最贵的一课）

在 GTK/X11 上，**`Shift+Tab` 送到网页里的根本不是 `Tab`**：X 发的是另一个 keysym
**`ISO_Left_Tab`**（`0xFE20`），WebKit 给不出名字，于是 `event.key` 是 **`"Unidentified"`**
（`event.code` 一样是空的）。只有 `event.keyCode` 还是 `9`。
上游 `prosemirror-keymap` 认键正是**先查 `keyNames[event.keyCode]`**，所以它认得、能挪格子。

⚠️ **这一条是"单测全绿、到真窗口却是坏的"那个故事的出处**：只比 `event.key === "Tab"`
的那一版**单元测试 55 条全绿**，到真窗口里 `Shift+Tab` 会被放行给浏览器 ⇒ 焦点静默飞出，
**③ 那条病修了等于没修**（`docs/06` §5.48 记着抓它的六个判官：按完 `Shift+Tab` 再打一个
数字，看它落在不在那一格里、看盘上的字节动不动）。修法是**两道判据都留着**：
`event.key` 是"正规"判据（别的平台 / 别的输入栈给得出来），`keyCode === 9` 是 GTK/X11 上
`Shift+Tab` 唯一还认得的痕迹。

⚠️ `keyCode` 是过时的属性，这里用它是**照抄上游的判据**：本仓要跟 `prosemirror-keymap`
对同一颗键得出同一个结论，就不能另起一套。

#### ⑥ 位置（`create.ts` 里 `.use()` 的顺序）

**排在 `配对处理` 后面、`indent` 前面**。PM 按 `state.plugins` 顺序问 `handleKeyDown`，
第一个返回 `true` 的赢：

- 排在 `配对处理` **后面**：那边"跳出右半边"的判据最窄（光标右边正好是一颗**空的**闭括号），
  让它先问；表格这一条接住其余所有情形。
- 排在 `indent` **前面**：它正是这条键位争夺的病根（§4.21 ③），必须抢在它前面。

⚠️ **这是 `Tab` 这颗键的第二次争夺**（第一次是 §4.20 的括号那一手），所以三份判据都窄：
**括号 → 表格 → 缩进**。

#### ⑦ 判据与没验的

`tests/table-tab.test.ts` **67 条**（四道闸 / 四种现场 / 加行那一段拼出来的坐标与节点类型 /
三种输入形状的认键 / 2026-10-23 加的普通回车 9 条）。

⚠️ **它证明不了"`Shift+Tab` 在真平台上到底送不送得到这里"**——那正是它证不了的那一件
（在 Node 里 `event` 是假的）。那半截只能开窗，见 `docs/06` §5.48。
⚠️ **没测的**：`CellSelection`（拖选了多格再按 `Tab`）、**源码模式**（那边 `Tab` 没有任何人绑）、
以及 `Mod-]` / `Mod-[` / `Mod-Enter` 那三条上游快捷键（本文件没有改它们）。

⚠️ **不做的事**（文件头也写着）：不改上游 `tableKeymap` 的行为、不给 `CellSelection` 写特例、
不改 `indent` 的行为、第一格按 `Shift+Tab` **不退出表格**。


---

### 4.22 第 39 项（行内标记即时渲染）：**方案与风险**（2026-10-04，⚠️ **只写不做**）

⚠️ **这一节一行代码都没有。** 用户 2026-10-04 拍板：「本批不动，只写方案与风险」。
写的目的是把"真要做的时候会撞上什么"先钉在文档里——免得下一轮又从头推一遍。

#### 想做成什么

用户 2026-09-22 的原话（针对**块级**那半）是「只输入了两个 `##` 则只半透明哦，不是消失」。
行内那半（`docs/07` 第 39 项）要的是同一件事：`**粗体**` 里的那对 `**`，
光标进去时**淡化**、离开时**收掉**——而且 **`**` 要真的存在于文档里**。

#### 今天到哪儿了（事实，不是计划）

| 已有 | 管什么 | 那些标记在哪 |
|---|---|---|
| `editor/instant-render.ts`（154 行） | **块级**：`#` / `>` / `-` / 有序号 / 三个反引号 | 光标在当前块内时以灰色画在**左侧装订线**，离开连宽度一起收掉。⚠️ 是 `Decoration.widget`，**不在文档里** |
| `editor/mark-hint.ts`（297 行） | **行内提示**：光标落进加粗/斜体时，把 `**` / `*` 半透明画在那段文字左右两边 | ⚠️ `Decoration.inline` ＋ `::before`（左符号）＋ **`Decoration.widget`（右符号，`side:-1`）**，**一个字节都不写回**——2026-10-05 BUG-65 |

所以"出现/消失"这套**已经能演**。缺的是**用户能拿光标进到标记里、能删掉其中一半**——
那件事**加装饰永远做不到**，因为那段文本根本不存在。

#### 三条路（选哪条是这一项的核心决定）

- **A. 标记作为真的文本节点**（Milkup 的做法，用户点名可借鉴）：给标记挂一个
  `syntax_marker` 之类的标记位，装饰层按 `selection.head` 加/去一个隐藏类。
  ✅ 唯一能同时做到"看得见"与"能编辑"的路。
- **B. 继续走纯装饰**（把 `mark-hint.ts` 扩成"光标离开就隐藏"）：最省事，
  ⚠️ 但**永远拿不到"光标钻进 `**` 里改它"**——要的就是它，所以这条路是退让、不是答案。
- **C. 用假节点硬塞**：❌ 社区踩过的坑，症状写在 `docs/07` 第 39 项那一格里——
  **打出来的字跑到标记前面、光标进不去、退格删不掉**。别走这条。

#### 八条风险（每条都带一个能验的判据）

1. **存盘口径（最大的一条）**。标记进文档之后，序列化必须**只输出一次** `**`。
   今天 `strong` 由 remark 序列化器加那一对定界符；标记也成了文本的话，
   就会变成 `****粗体****`。→ 判据：本文件 §4.7 那一族用例（「打开再存，字节变了」）
   ＋ 每种行内标记各一条往返用例。⚠️ **不能只用裸 remark 探针**——§4.7 记着它会给出
   "没问题"的错结论，**必须端到端**。
2. **输入规则会打架**。今天敲 `**` 是输入规则当场把它变成 `strong`、`**` 被吃进语法
   （与 `#` 那条"回车才成块"完全同构）。标记变成真文本之后，同一件事就**有两个来源**，
   必须选一个当真相。可照 `editor/heading-on-enter.ts` 的先例：**留下那段文本、
   把输入规则按引用滤掉**。
3. **选区与剪贴板**。标记进了文档，选区位置就把它算进去。今天有两处直接吃选中文本：
   `editor/caret-snapshot.ts` 的 `text`（§5.2b，给插件的是**纯文本**）与
   `ui/useClipboard.ts` 的复制剪切（口径是"菜单与 `Ctrl+C` 必须得到同一份"）。
   → 判据：复制一段加粗文字，两条走法逐字节一致；`get_selection()` 给回的 `text`
   要么**一律带标记**、要么**一律不带**，不许看情况。
4. **它会把 BUG-56 卷进来**。`# **你好**` 的标记露进标签页标题，是"从 markdown 文本里
   剥标记"的毛病，与"标记要不要进文档"是两件事，但**改这里之前先把那条定了**——
   否则同一个现象会有两种表现，报上来分不清是哪条引起的。
5. **敲一半的状态也要能活**。只敲了开定界符的 `**甲` 是一个**合法的文档状态**：
   要能存盘、能重开、能撤销。→ 判据：敲 `**甲`、存盘、重开，盘上字节一个不差。
6. **IME**。合成期间 `**` 是普通按键、不进合成；但标记一旦成了文档内容，
   组合态的选区变化就会牵着淡化层动。→ 判据：中文输入法下敲 `**粗`，
   不得出现"标记忽隐忽现"（这类抖动只有开窗看合成过程才抓得住）。
7. **性能**。淡化层的重算范围要卡在**当前块**，不许整篇扫——`editor/writing-modes.ts`
   那条"不缓存的话每按一次方向键要全篇走一遍"是同一条教训。
8. **上游 schema**。⚠️ 本仓的既定口径是**不改上游 schema**：§4.6b 的公式就是这么做的
   （只补视图，不动 schema）。而这一项**恐怕非动不可**（标记要成为文档的一部分）。
   → 真要做的时候，先核一遍这条口径到底还成不成立，并把结论写进这一节。

#### 分期（真要做的时候，按这个顺序）

1. 前置（**已完成**）：`docs/07` 第 35 / 36 项那一格原写着"先做它们，攒 NodeView 经验"——
   那两项 2026-09-22 就 ✅ 了（`editor/code-block.ts` 是全仓唯一一处 `$view`）。
   ⚠️ 那一格的行文已过期，本批一并改掉。
2. **一个只读试点**：先挑**行内代码**（`` `甲` ``）一种。它的内容本来就是文本，
   标记与内容天然同层，风险最小；验证的就是上面第 1 条与第 5 条。
3. **全量**：把加粗/斜体/删除线/高亮/上下标一起接上，那时才需要碰第 2、3、4 条。


### 4.23 右键菜单执行的那几条命令，走的是**同一条 `EditorCommand` 路**（2026-10-04）

右键菜单（`docs/04` §2.1d）**不新开执行路径**：`ui/ContextMenu.tsx` 里那一句分发是
`命令表[id]?.()`，与 `App.tsx` 的 `onCommand` **逐字节相同**——命令表就是
`ui/useCommandTable.ts` 那张，落点还是 §4.1 那个 `EditorCommand` 白名单。

因此**编辑器那一档的每一条**都只是"另一个按钮"：加粗/斜体/行内代码/链接、
四颗段落图标、两份子菜单里的每一条，点下去的路径与格式工具栏、与菜单栏**完全一样**。
⚠️ 这也是 `ui/FormatBar.tsx` 那张 `按钮` 表**只许读 `icon` / `按钮亮着` / `字形类` / `提示`、
绝不读 `cmd`** 的原因：`cmd` 是 `onCommand` → `EditorCommand` 那条路，与命令表是**两条**，
混了就是"点了没反应"。

#### 两批新命令

| id | 落在哪 | 怎么实现的 |
|---|---|---|
| `edit.delete`（本批新增） | 编辑菜单 ＋ 右键菜单那一排的 🗑 | 命令表里一行：删选区就是 **`run("insertText", { text: "" })`** ＋ `needsDoc: true`。⚠️ 它**没有 `accel`**——这是有意的，理由写在那条命令的注释里 |
| `edit.copyAsPlain` / `edit.copyAsHtml` | 右键菜单「复制为…」子菜单（与 `edit.copyAsMarkdown` 并列，后者在 `MENUS` 里、编辑菜单也有） | **不上编辑器**：走 `ui/useClipboard.ts` 那条读写链（`docs/04` §2.1d 那一节），所以它们**没有** `EditorCommand` |

⚠️ **输入框那一档根本不过命令表**：撤销/重做/全选/剪切/复制/粘贴住在
`ui/ContextMenu.tsx::落到输入框` 里（判据与那条"先写剪贴板、成功了再删"的顺序见
`docs/04` §2.1d）。所以 `tests/context-menu.test.ts` 那一组"每个点得动的 id 都要有处理器"
**必须把那六条摘出去**——它们不是"忘了实现"，是**故意的另一条路**。

⚠️ **`edit.select`（全选）是唯一一条只在输入框那一档存在、不在编辑器菜单里出现的**：
编辑器里的全选走浏览器原生那套（`Ctrl+A`），右键菜单里给它一条反而是多余。
⚠️ **正因为它不在命令表里，2026-10-04 开窗口检时它被画成了灰的**（灰名单的判据是"命令表里
有没有这一条"）——修法是输入框那一档**一个都不灰**，见 `ui/context-menu.ts::这一档的灰`；
同一天还量到它**作用错对象会选中整篇正文**（焦点没还成时），所以那五条 `execCommand`
现在都先问一句 `还焦()` 成没成（`docs/04` §2.1d）。

### 4.24 代码块里那一段是 **CodeMirror 在编辑**（`editor/code-block-cm.ts`，2026-10-06 第 101 项）

📌 **2026-10-19：`codeBlock` 命令改成真正的切换。** 光标不在代码块时仍调用上游
`createCodeBlockCommand`；已经在代码块里时调用 `turnIntoTextCommand` 退回普通段落。
上游命令在“已经是代码块”时返回 `false`，旧按钮因此第二次点击没有任何可见反馈。

用户 2026-10-06 定的做法：「**引入开源项目：CodeMirror。解决代码框。**」
——在此之前代码块是纯 ProseMirror 的 `code_block`，`auto-pair.ts` 只能给它补
"配对"这一件，**缩进与 `Tab` 补不进去**（那两件要按行看上下文，是编辑器内核的事）。

**`pre` 里现在是两层 DOM 并排**（`editor/code-block.ts` 顶上那段结构图是权威）：

| 层 | 类名 | 谁在管 | 干什么 |
|---|---|---|---|
| 隐藏 | `.nota-code-text`（`<code>`） | ProseMirror | 就是 contentDOM。**文档树、撤销栈、存盘、查找读的是它**；零尺寸不是 `display: none`（PM 要按文本偏移往里映射位置，没有布局盒子的元素映射不了） |
| 可见 | `.cm-editor` | CodeMirror | 用户看着、打着字的那一层 |

⚠️ **为什么不让 CodeMirror 直接当 contentDOM**：CM 的 DOM 是"一行一个
`<div class="cm-line">`"，而 ProseMirror 按**文本偏移**往 contentDOM 里映射位置
（`domFromPos`、`Decoration`）。两套坐标对不上，`plugin-prism` 那种按偏移挂的
行内装饰会整片错位。

**同步是"一段一段推"，不是"整块换"**：CM 里按键 → `算最小改动` 算出真正变了的那一段
→ 一笔 PM 事务只替换那一段，同时把 PM 的选区挪到 CM 光标那一格。反方向（源码模式里改、
撤销、外部整篇替换）走 `update()`：把节点文本推进 CM。

⚠️ **防回声靠两把锁**（一边一把，名字都叫 `同步中`）：CM 那一把管"CM 收到的
改动是不是自己刚推回来的一笔"，PM 那一把管"PM 收到的改动是不是自己刚推出去的
一笔"。**少任何一把**，光标都会跳、撤销栈都会被拆碎。
⚠️ 推的是 `算最小改动` 抠出来的那一段——整块换的话，每敲一个字都记一笔"整块替换"，
撤销一下会把一整段一起吞掉。

⚠️ **撤销只有一套，归 ProseMirror**：CM 那一侧**刻意不装 `history()`**，
`Ctrl+Z` / `Ctrl+Shift+Z` 由 `code-block-cm.ts` 的键位转回 PM 的 `undo` / `redo`。
装两套的后果是"在代码块里改一个字 → 点到正文 → 按 `Ctrl+Z`"只撤销正文那一步，
而用户以为撤销的是刚才那次编辑。

⚠️ **`Ctrl+B` 这类编辑器级快捷键不再落到正文上**：CM 拿到焦点时
`document.activeElement` 是 `.cm-content`（一个**嵌套的编辑宿主**），而
ProseMirror 的 `hasFocus()` 判的是 `activeElement == view.dom` → 假 →
`selectionToDOM` **直接返回**，PM 不会去抢选区。同一件事的另一面是
`stopEvent` 判据放宽成**整个 `pre` 子树**（原来是"三个挂件"）：代码区里的
每一次按键都算"这个节点内部的事"，漏一条进去 PM 就会去重解析不属于它的 DOM。

⚠️ **着色仍然只有一个来源**：`refractor`。`分色()` 把它分词出来的叶子算成
`{从, 到, 类}`，类名**逐字沿用** `token xxx`（`editor-blocks.css` 那一段配色照旧管用），
再交给 CM 的 `Decoration.mark`。所以"换成 CM 之后变成两套高亮"这条没有发生
——`plugin-prism` 那半仍然在插件表里（别的节点还用它），只是代码块这一格
它的装饰画在零尺寸的 contentDOM 上、看不见。

⚠️ **自动换行那颗开关在代码块里要是活的**：`pre` 上那条
`html[data-code-wrap="off"] { white-space: pre }` **管不到 CM 内部**（`.cm-content`
有自己的 `white-space`），所以这是一个 `Compartment` ＋ 一个盯
`<html data-code-wrap>` 的 `MutationObserver`。只写 CSS 的话那颗开关就是死的
——"拨了不生效的开关"是本仓点名过的老毛病（`docs/09` §2 那一类账）。

⚠️⚠️ **最贵的一条坑在这里：代码块的 `pre` 必须自己写 `contentEditable = "false"`。**
它不给的话代码块会**整个哑掉**，而症状极具误导性：**能打字**（字符会进到代码块里），
但**光标不显示、`Backspace` 一动不动、`Tab` 插进去一个制表符、回车按在行首**。

机制：浏览器只允许**一个**编辑宿主是 `document.activeElement`，而 **WebKitGTK 在
嵌套 contenteditable 的情形下认的是外层那个**（`.ProseMirror`）；CodeMirror 的
焦点判据恰恰是 `activeElement == .cm-content`（`@codemirror/view` 的
`get hasFocus`）——于是它**永远认为自己没焦点**，键位表整条不执行。
而"能打字"这条假象最容易把人带偏：打字是浏览器直接写进 DOM 的，**不经过键位表**。

⚠️ `contenteditable="false"` 把这一段画成**非编辑孤岛**，里面的 `.cm-content` 于是
自成编辑宿主、拿得到 activeElement（显式 `true` 的后代在 `false` 的祖先里照样可编辑）。
📌 **量法**（这次就是这么定的案）：临时把 `EditorView.theme` 的 `"&.cm-focused"`
换成 `outline: 3px solid red`，开窗点一下代码块——**有红框 = CM 拿到了焦点**，
没有就是这条漏了。

判据：`tests/code-block-editing.test.ts` **21 条**，钉的是三个纯函数
（最小改动的字符边界、分色的区间能不能拼回原文、回车续行的三档光标落点）。
⚠️ **`Tab` 插几格是量过的（2026-10-07，第 101 项 ⑥）**：**4 个空格**，不是制表符、也不是 CM 出厂的 2 格。
那个数在 `code-block-cm.ts::缩进宽度` 一处定义（`indentUnit.of(…)` ＋ `indentWithTab`，`Tab` / `Shift+Tab` /
回车续行三条路都读它）。📌 当时的量法：开窗、在代码块里按一下 `Tab`、把原文抠出来看字节——
落成 `    z`（四个空格 ＋ 字符），而**不是** `^I`；把那一行 `sed -n l` 出来确认没有制表符。
⚠️ 写成 2 格或制表符都会**看着像对的**（缩进就是缩进），所以这一格按「量过」记，不按「应该是」记。

⚠️ **代码块里的「当前行」淡底（BUG-70，2026-10-07 修）**：`highlightActiveLine` 这条扩展此前**从来没装过**
（规则一直写在主题里，所以看着像「装过但不好用」）。装上时配了一条**只在聚焦时显色**的口径——
`& .cm-activeLine { background: transparent }` ＋ `&.cm-focused .cm-activeLine { … }`：不聚焦时那一行
不留色带（与源码模式同一套口径，见 `docs/07` BUG-70）。⚠️ 这一格的颜色用的是 `color-mix(… 5% …)`
而不是台账里那个 `--bg-subtle`——**代码块自己的底色就是 `--bg-subtle`**，照抄等于没画。
⚠️ **手感本身（配对、缩进、光标跳不跳）开窗目检才算数**，纯逻辑判据证明不了。

⚠️ **2026-10-07 傍晚（BUG-71）这两处的主题各补了一刀，两刀都与"选区画不出来"有关**（用户报的
是**源码模式与分屏预览**，代码块这一边是同批一起量的）：
① **源码模式那一档的当前行底色从 `--bg-subtle` 换成与这里同一条 `color-mix(… 5% …)`**——
不透明的行底色会把**落在光标那一行的选区**整条盖住（CM 的选择层 z-index 是负的、垫在行背景底下，
而拖选的终点永远在当前行，症状就是"源码模式里选不中字"）。⚠️ **这一档的颜色以后不许写回不透明色**。
② **两边选区规则的第一条选择器照 CM 自己那条写全**（`&.cm-focused > .cm-scroller > .cm-selectionLayer
.cm-selectionBackground`）：写短了权重压不过 CM 出厂的聚焦色 `#d7d4f0`，**聚焦时画的是它的淡紫、
失焦才轮到 `--bg-active`**（同一个选区两种颜色）。机制、两套明暗的取色判据与量法见 `docs/07` BUG-71
与 `docs/06` §5.58。

### 4.25 「选择」那一族 ＋ `Alt+↑/↓` ＋ 代码块整行剪贴板（2026-10-07）

这一批三件事都是从「另一份参照」的建议里挑出来做的（选择命令、上移/下移、纯文本粘贴、
代码块整行复制剪切），做之前**先查了本仓已有的实现**——所以"新增"的只是那几条命令与键位，
底下的判据（词/句怎么切、块怎么挪）都是为这一批现写的。

#### ① 「选择」那一族：**两种模式共用一个 `select.ts`**

四条命令：选当前行 / 选当前词 / 选当前句 / 选词并删（`Ctrl+L` / `Ctrl+D` / `Ctrl+E` /
`Ctrl+Shift+D`），实现与三层分法在 `docs/02` 的 `src/editor/select.ts` 那一节。

⚠️ **最要紧的一条是"两种模式选出来的东西必须一样"**：源码模式手里就是 Markdown 原文，
本可以直接用 CodeMirror 的 `wordAt`，但那样两种模式下的"一个词"就是**两套判据**
（CM 按 `\w` + 语言规则、`Intl.Segmenter` 按词典），用户迟早撞上"切一下模式，
同一个词选得不一样"——说不清是谁的错。所以源码那边调的是**同一对纯函数**
（`选词区间` / `选句区间`），不同的只有**范围**：源码模式限在**当前行**（源码的"行"
就是文件里的一行），所见即所得限在**当前文本块**。

⚠️ **"行"因此本来就不是同一个东西**：源码模式用的是 **CodeMirror 自己的 `selectLine`**，
**含末尾那个换行**；所见即所得是一段，**不含**。这不是疏漏，是如实：源码那边的"一行"
就是含换行的字节，删掉它行就没了。

⚠️ **两个最常撞上的落点**（都是"用户指着刚弄完的那一个，命令却去了下一个"）：
光标**贴着词尾**（`hello|`）→ 选**刚过去**那个词；光标**贴着句号**（`你好。|`）→
收**刚过去那一句**、连句号一起。判据写在这两个纯函数里（半开区间的尾巴那一格），
所见即所得与源码模式**一起**受益。

⚠️ **代码块是一个分岔**：PM 那一侧的四条命令认了 `spec.code` 就返回 `null`——代码块的
光标与选区住在里层那颗 CodeMirror 上（§4.24），PM 这边设一个"在代码块节点里"的选区
**屏幕上什么都不亮**（那颗实例拿着 DOM 焦点时 PM 的 `editorOwnsSelection()` 就是假，
`selectionToDOM` 直接返回，NodeView 的 `setSelection` 根本不会被叫到）。
⚠️ 但**块里不是"什么都不做"**：`Ctrl+L` / `Ctrl+D` / `Ctrl+Shift+D` 由那颗 CM
**自己接**（`code-block-cm.ts`，与 `select.ts` **共用同一对判据**——这是"两边选出来的
东西一样"那条口径的延伸）；⚠️ 只有 `Ctrl+E`（选句）**两头都不做**：代码里没有"句子"
这个概念，拿句读去扫代码只会切出半截标识符。⚠️ 于是有一条**如实记下的不一致**：
**菜单里点那四条在代码块里不动**（菜单走 PM 那条路），而键位好用——不是撒谎，
是"这一段文本的主人不是它"（`docs/07` 记着这笔账）。

⚠️ **行内原子要占一个字符**（图片、公式、硬换行）：`textBetween` 默认给它们空串，
而它们在文档里各占一个位置——不补 `leafText` 的话"段内偏移 → 文档位置"整体错位
（硬换行补 `"\n"`、其余补 `U+FFFC`）。

⚠️ **分词器随环境**：`Intl.Segmenter` 有就用（中文按词典切），没有就退回
`\p{L}\p{N}_` 那条正则（中文会**整段**连成一"词"）。正因如此，用例只钉 ASCII、
中文只钉"包含关系"——**别在用例里断言中文怎么切**，那是环境给的答案。

#### ② `Alt+↑` / `Alt+↓`：**必须自己接，否则 `joinUp` 会先吃**

⚠️⚠️ 这两颗键在本仓的处境与 `Ctrl+U`（BUG-58）**同族**：编辑器的合并键位表里
**已经有人**——ProseMirror 的 `baseKeymap` 把 `Alt-ArrowUp` / `Alt-ArrowDown`
绑给了 `joinUp` / `joinDown`（把光标所在段与相邻段**合并**），它会先跑并
`preventDefault()`，于是 `ui/useMenus.ts` 那条 `if (e.defaultPrevented) return`
（BUG-49 的正主）把整颗键**放行**。不接的话用户按 `Alt+↑` 看到的不是"没反应"，
而是**这一段和上一段被并成了一段**——比没反应难查十倍。

所以 `editor/move-block.ts` 用 `handleKeyDown` 自己接（props 顺序上天然排在合并键位表
**前面**，不必抢 priority），并且有**两条"认下但不动"**的分支：`event.defaultPrevented`
（块里那颗 CodeMirror 已经处理过）与**到边了/表格里**（算不出计划）——两处都返回 `true`
把键**吃掉**，放行的话 `joinUp` 就会接管。

⚠️ **表格里什么都不做**（没做行/列挪动，"整张表上移"才是最坏的）；⚠️ **到边就是不动**
（不绕回去、不报错）；⚠️ 视角落在**列表项**里时搬的是那**一个列表项**（找最深那层列表），
不是整个列表。⚠️ 只派**一笔**事务：分两笔的话 `Ctrl+Z` 只退掉半程。

#### ③ `Ctrl+Shift+V` 粘贴为纯文本：**与 `edit.paste` 同一条路**

本应用的粘贴**本来就只进纯文本**（Milkdown 的剪贴板插件没有定义 `clipboardParser`，
`editor/paste.ts` 那条分发也只在"文本"这一支上做事），所以这一条没有新的实现——
`ui/useCommandTable.ts` 里它与 `edit.paste` 落到**同一个函数**（`剪贴板.粘贴()`）。
留这一条是因为那颗键是肌肉记忆（Typora 的编辑菜单里就有）。

⚠️ **WebKitGTK 上会弹一句提示**（「系统不允许从菜单读剪贴板，请按 Ctrl+V 粘贴」）：
那是环境把 `navigator.clipboard.readText()` 关在权限后面（`ui/useClipboard.ts` 那条
已有的兜底），**写剪贴板那条路是通的**。这不是这一条没做——**在别的 WebKit 版本上
它可能直接就工作了**（`readText` 的权限行为由环境定）。

#### ④ 代码块里的**整行**复制/剪切 ＋ 一个 WebKitGTK 的怪癖

没有选区时，代码块里按 `Ctrl+C` / `Ctrl+X` 按**整行**来（含末尾换行），有选区时照常。
它挂在块里那颗 CM 上（`editor/code-block-cm.ts` 的 `整行剪贴`），**并记一下这一下
按的是哪颗键**。

⚠️⚠️ 为什么要"记按键"：**WebKitGTK 会把 `copy` / `cut` 事件各派发两遍**（`paste`
只有一遍，实测确认）。照单全收的后果是**往剪贴板写两次、`cut` 更会删两遍**。
`按键没办`（一个 `WeakSet<EditorView>`）＋ 一个"只记录、`return false`"的键位
（`记按键`）合起来把第二遍挡掉。

⚠️ 配套的是 `ui/useMenus.ts` 那条**放行口**（`剪贴板键`）：`edit.copy` / `edit.cut` /
`edit.paste` / `edit.pastePlain` 四颗键，目标是块里那颗 CM（`.nota-code-cm`）时
**不进全局那条路**——两边都跑就是又一份"剪两次"。⚠️ 认类名不认 `.cm-editor`：
源码模式也是 `.cm-editor`，按那个认会把源码模式一起放进来。

⚠️ **能验到什么程度**：代码块里的 `Ctrl+C` / `Ctrl+X` / `Ctrl+V` / `Ctrl+Z` / `Ctrl+D` /
`Ctrl+Shift+D` 都**开窗按过**（`docs/06` §5.55），整行剪贴的**剪贴板内容逐字节对过**。
⚠️ 没量到的：**鼠标右键菜单在代码块里的那几条**（那走另一条路），以及
**别的 WebKit 版本上 `copy`/`cut` 是不是也派发两遍**——`记按键` 那层是**按"会重复"设计的**，
重复了挡掉、不重复时第一遍照常落，两种环境下都对。

### 4.26 「链接」那个框：插入 / 编辑 / 去掉（`editor/link-edit.ts`，2026-10-07）

用户 2026-10-07 的原话：「超链接的逻辑更新一下：插入链接出现一个窗口："链接显示名称"
和"链接内容"。如果单击链接则也显示这个窗口。」（`docs/07` 第 96 ＋ 102 项。）

#### ① 为什么这不是"把 `askPrompt` 换个框"

上游那条 `toggleLinkCommand` 拆开是 **`toggleMark(linkSchema.type(ctx), payload)`**
——**一个字符都不插**：它只给选区挂标记，空选区时只设 `storedMarks`（下一个敲的字才带
链接）。所以"光标停在空处点「插入链接」，屏幕上什么都不会出现"是**必然**，而用户要的
是"正文里当场出现那几个字"。⇒ 要补的是**一条真实现**（`linkSet`），不是换个问法。

⚠️ 同时**不许弄丢**"已经是一条链接时再点一次 = 去掉链接"那条能力（今天由命令的 toggle
语义提供）：它现在走**同一张框里的「去掉链接」那颗按钮**（`linkRemove`）——**文字留着、
只摘标记**。

#### ② 三层，与 `select.ts` 同一套分法（判据要能单测）

| 层 | 吃什么 | 谁测 |
|---|---|---|
| `链接落点` / `源文链接区间` / `源文链接` / `摘源文链接` | **纯字符串** | `tests/link-edit.test.ts` |
| `链接区间` / `建链接事务` / `摘链接事务` | 一棵 **PM 文档**（＋ `EditorState`） | 同上（`Schema` 就够，**不需要 DOM**） |
| `装链接` / `摘链接` | 一个 `Editor` | 开窗目检（`docs/06` §5.59） |

⚠️ **两种模式共用第一组**：源码模式那边（`source-commands.ts` 的 `linkSet` / `linkRemove`
两个 `case`）调的是同一组纯函数——另写一份"哪一段算一条链接"迟早变成"切一下模式，
同一条链接改出来的东西不一样"。

#### ③ 那道地址闸（**与 `url-link.ts` 同一个答案**）

地址**为空**、或者过了 `危险协议`（`javascript:` / `vbscript:` / `data:` / `file:` /
`blob:`，判据是"去掉全部空白与控制符之后的前缀"）时：**不写成链接、落成纯文字**。
两条都是同一句话的两个方向——**用户填的字一个都不许丢，一条能执行的链接都不许进文档**。
⚠️ 这与自动识别那一路（`url-link.ts`：认不出来就原样留成文字）**是同一个答案**；
两边各判一次的话，"打出来不是链接、插进去是链接"就成了没人说得清的差别。
⚠️ 名称为空时**用地址顶上**（空名字的链接在屏幕上点不着也看不见）。

#### ④ 三个落点，两种模式一份判据

| 光标/选区 | 落点 |
|---|---|
| 光标处**已经是一条链接** | **整条换掉**（名称与地址都换成框里那两个） |
| 有选区 | 换掉选区那段（"选中一段字再按 `Ctrl+K`"是最常见的起手式） |
| 空光标 | 在光标处**插一条新的**（这就是第 102 项要的"直接给一个可编辑的占位"） |

⚠️ **连续的同地址兄弟节点要合成一条**：PM 的文本节点按"标记相同"归并，但同一条链接
被别的标记（比如一段加粗的链接）切开时会摊成两个节点——只看光标落的那一个，改一次
只改掉半截。⚠️ **代码块给 `null`**：那一段的光标与选区住在里层那颗 CodeMirror 上
（§4.24），PM 这边认出来的"链接"与屏幕上的光标对不上。

#### ⑤ 点一下链接（`ui/useLinkClick.ts`）

单击 → 弹**同一个框**（两个框里都是现值，`editing` 为真所以多一颗「去掉链接」）；
`Ctrl`（或 `⌘`）＋单击 → 交给系统浏览器（`openUrl`，**危险协议一个都不放行**）。
⚠️ **打不开要吭声**：`openUrl` 失败时给一条红提示（`ui/useLinkClick.ts`）——口径与
`ui/useExport.ts` 那颗「去官网」**同一条**（"点下去没反应会让人以为按钮坏了"），
而 `AboutDialog` 那种"打不开就算了"**不适用**：这里的链接是用户刚刚点的那一下。
⚠️ 这一条有实测背景：本机的开发容器里 `xdg-open` 曾经是坏的（静默退 127，见 `docs/06` §5.59），
那时这一下**屏幕上什么都不显示**。
⚠️ 那是一个真的 `<a href>`，所以**`preventDefault` 不能省**——不拦，WebView 自己就
导航走了。⚠️ **只读那一侧不接线**：分屏右侧预览是同一套 Milkdown 建的、也会画真的
`<a href>`，判据取 PM 自己那个属性（只读实例上 `contenteditable="false"`）——按窗格
类名判的话，"改动预览那种**临时**只读"会漏掉，而在一个改不动的地方弹出改得动的框
是最坏的一种"看起来能用"。

### 4.27 覆写模式：`Insert` 那颗键（`editor/overtype.ts`，2026-10-16）

**来路**：朋友那份清单第 12 条「INSERT 键无法使用」（`docs/06` §5.65）。那颗键此前
**什么都没绑**——按下去一个反应都没有。

#### ① 开关为什么住在插件 state 里

覆写是**编辑器的一种输入状态**，不是文档内容：它不该进 markdown、不该进撤销栈、也不该
跨文档留存（换一份文档、换一个编辑器实例，它就是"关着"）。所以它落在 `$prose` 插件的
`state` 上，键是 `PluginKey<boolean>("nota-overtype")`——`.use()` 的位置在 `assemble.ts`
里**必须排在 `history` 之前**：排后面的话，"敲一个字顶掉一个字"会被记成**两笔**历史
（先插后删），撤销一次只退一半。

#### ② 真实行为（判据在 `docs/06` §5.65）

- 光标在 `abc|def`，按 `Insert`（开），敲 `X` → 盘上 `abcXef`；
- 再按一次 `Insert`（关），敲 `Y` → `abcYXef`；
- **组字 / 多字上屏 / 光标已在行尾**一律照常**插入**——覆写只吃"一个普通字符"那一种。

#### ③ ⚠️ 它与 `command-state.ts` 的签名是一对（这一批踩过的坑）

`Insert` **不改文档**，只翻一个 meta ⇒ 从"文档变了"那条路看不见它。而状态栏那个 `OVR`
小标读的是 `CommandState.overtype`，那格状态是**靠签名串比对**发出来的——2026-10-16 第一版
加了字段、加了 `空状态`，**漏了 `签名()`**，症状是"插入键真的生效了、状态栏永远不显示"。
所以这份文件和 `command-state.ts` 是**同批改的两处**，理由也记在 `docs/09` §2.2 那一行。

### 4.28 HTML 代码块下面那块预览（`editor/code-preview.ts`，2026-10-16）

用户点名：「还有一个小修改：**如果代码框语言是html的话，在下面可以直接显示预览，
类似流程图那样**」——照的是图表块那一套（`diagram-view.ts`：源码在上、画出来的东西
在下）。

#### ① 结构性的一步：NodeView 的根**多套了一层**

代码块的 NodeView 原来 `dom` 就是那个 `<pre>`（`contentDOM` 是里面的 `<code>`）。
预览要**占文档流**（不是浮层），所以现在是：

```text
div.nota-code-wrap          ← 新套的一层，自己不画任何东西
  ├─ pre                    ← 原来那个（语言选择器 / 按钮条 / 行号都绝对定位挂在它上面）
  └─ div.nota-code-preview  ← 预览（只有语言是 HTML 时露脸，否则 hidden、一个像素不占）
       └─ iframe[ sandbox="allow-scripts" ]
```

⚠️ 为什么不能把预览**塞进 `pre` 里面**：`pre` 上有 `overflow: visible`（为围栏标记
留的）和一堆 `top: 100%` 的绝对定位挂件，改它的内边距会把语言框、按钮条的落点一起挪。
⚠️ 那一层 `div` 落地之后 `.ProseMirror > pre` 这类**直接子元素**选择器不再命中——
现网那几条全是后代选择器（`.ProseMirror pre`），核过、一条不受影响。
⚠️ 导出那一侧：`export.ts` 原来重建 `pre` 之后会留下一个**光秃秃的 `<div>`**
（类名被 `nota-` 前缀规则摘掉了），所以又补了一步把它拆掉。

#### ② 沙箱：`allow-scripts` 但**不给** `allow-same-origin`

预览里那段 HTML 多半带脚本（纯静态的反而少），所以脚本要让它跑；而不给
`allow-same-origin` 意味着它拿到的是**不透明来源**——碰不到 Nota 的 DOM、
`localStorage`，也调不到宿主注入的那几个口子。

⚠️⚠️ **这两个必须一起判**：`allow-scripts` ＋ `allow-same-origin` 同时给等于
**没有沙箱**——那个组合下 iframe 里的脚本能自己把 `sandbox` 属性摘掉，再重载一次
就"越狱"了。这是这条 API 上最经典的一个坑，写在这里免得下次有人"顺手补全"。

#### ③ 去抖 300ms：`srcdoc` 写一次＝换一份文档

写 `srcdoc` 不是"更新内容"，是**建一个新文档**：滚动位置、表单里填了一半的字、
`<video>` 的播放进度全没了。所以打字这一段攒 300ms 再写（`code-preview.ts` 里那条
`攒批毫秒`）。⚠️ **首帧立刻写**（不去抖）：块刚挂上来时不存在"用户还在打字"。
⚠️ 语言被改成别的（`html` → `python`）时**也要把待写撤掉**，否则 300ms 之后它会
偷偷再写一次——界面上看不出来，但那是"藏起来的东西还在干活"。

#### ④ 判据

`tests/code-preview.test.ts` **14 条**：认得出的三个（`html` / `htm` / `xhtml`）、
大小写与两端空白、以及**不该认的那些**（`htmlbars`、`htmlish`、`xml`、`vue`、
`markdown`、空串）——⚠️ 中间那一组的价值在于"写错的样子全都静默"（只认小写 ⇒
预览根本不出现；写成 `startsWith("html")` ⇒ `htmlbars` 也冒出一个空白框）。
**建 DOM 那一半测不了**（要真 `document`），所以沙箱属性、去抖、live 更新三条
都在开窗那一半量（`docs/06` §5.67）。

---

## 5. 双向通道

### 5.1 前端 → 后端（`nota_doc_sync`，去抖 300ms）

```text
用户打字
  → ProseMirror 事务
  → listenerCtx.markdownUpdated((_ctx, markdown, prev) => { if (markdown !== prev) onChange?.(markdown) })
  → EditorPane 的 onChange：① 先报一次 onActivity（那就是"用户还在打字"这一件事）
                            ② 再清掉上一个定时器、重设 300ms
  → （300ms 没人再打字）api.doc.sync(doc.id, markdown)
  → DocumentStore::sync：内容没变 → 原样返回；变了 → 换文本 / dirty = true / revision += 1
  → 再 await onDocsChanged()（= App.refreshDocs() → api.doc.list()）
  → 标签上的小圆点、状态栏、大纲跟着更新
```

三个设计点：

| 点 | 口径 |
|---|---|
| 去抖放在**调用方**（`EditorPane`），不在 `create.ts` 里 | 代码注释的原话：**"多快算太快"取决于拿这个回调干什么**——存草稿 / 推给后端 / 更新字数，三种节奏不一样。`create.ts` 只保证"变了就叫我"（还用 `markdown !== prev` 挡掉空转） |
| 去抖间隔是 `SYNC_DEBOUNCE_MS = 300`；大文件走 `LARGE_SYNC_DEBOUNCE_MS = 1000`（`EditorPane.tsx`） | 见 `docs/03` §9.1 |
| 脏标记**由后端算** | 只有后端知道跟磁盘上那份一不一样；所以同步完要 `refreshDocs()` 把 `dirty` 取回来 |
| `onActivity`（2026-09-25 加）是**同一个变化信号的第二个消费者** | 它只在 `onChange` 的**第一行**报一下"刚刚有人在打字"，给自动保存的停笔计时器用（`ui/useAutosave.ts`）。⚠️ 它**不额外挂监听、也不去读文档**——所以"自动保存"这件事对编辑区的代价是零；反过来，**不许**把它换成轮询 `getMarkdown()` 比一比，那是把整篇文档每秒复制一遍（`docs/02` 的 `useAutosave` 一节） |

**强制同步点**（`docs/03` §1.1 对策②）：`ui/useDocuments.ts::saveDoc()` 在 `api.doc.save`
之前先 `editorRef.current?.getMarkdown()` 再 `api.doc.sync(id, text)`——因为镜像可能还差
最后几次击键（用户按下 Ctrl+S 时那个 300ms 定时器通常还没到点）。
⚠️ **自动保存走的也必须是这一条**（它调的就是 `saveDoc`），否则"自动存"和"手动存"
写出来的字节会在去抖窗口那一截上分叉——而分叉不会有任何东西报错。

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
   两种情况都是"后端这份和前端不一致了，重取一份"。
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

### 5.2b 后端 → 前端（二）：`nota:document-edit` —— 「请你替我改一笔」（2026-10-04，`docs/07` 第 14 项）

⚠️ **这一条与 §5.2 那条方向相反，是本轮新开的第二条下行通道，别把两条混起来。**

| 项 | `nota:document-changed`（§5.2，老的那条） | `nota:document-edit`（本节，新的一条） |
|---|---|---|
| 说的是什么 | **「正文已经换了」**——一份**状态** | **「请你替我改」**——一条**意图** |
| 谁改的正文 | 宿主自己（`DocumentStore::sync` 改了镜像） | **编辑器**（前端落一笔真 ProseMirror 事务） |
| 前端收到之后 | 整篇 `setMarkdown(p.text)` | `editorRef.current?.插入在光标处(p.text)` |
| 丢掉的后果 | 不行——丢了就是两份文本**永久分叉** | **丢了就丢了**（宿主什么都没改过） |
| 失败的形状 | 必须重试 | **允许静默作废** |

**发这条事件的只有一个函数**：`lua/api/document.rs::emit_edit()`，由插件的
`nota.document.insert_at_cursor(text)` 调（要 `document.write` 权限）。payload 是
`{ id, op: "insert-at-cursor", text }`（`DocumentEditPayload`）。

⚠️ **前端不认识的 `op` 一律丢掉**，不许拿 `p.text` 当插入用。今天只有一种 `op`，
但加第二种（替换选区、包住选区）的那一天，老前端照插不误就等于把"替换整块"执行成
"在开头插一段"——**静默改错正文**，用户存盘之后才发现。

#### 为什么宿主不自己改镜像了事——这是量出来的，不是想出来的

宿主手里只有一段纯文本（`Document::text`）。"在光标处插一段"要落地成对 markdown 的
一次字符串拼接，而**那件事在块边界上做不到**：光标位置的 Markdown 字符偏移量
**根本不存在**——在列表项开头插字，markdown 会多出一个 `- `；在两段之间插字，
会多出一个空行。

⚠️ **这不是推理，是量过的**，量测钉在 `tests/caret-snapshot.test.ts` 第三组
（用**真** `Schema` ＋ **真** `ParserState`/`SerializerState` ＋ **真** `EditorState`，
全部来自 `@milkdown/kit`）：

| 光标在哪 | 在 PM 里真插一段的结果 | 按偏移拼接的结果 |
|---|---|---|
| 行内（`甲**粗**乙` 的 `粗` 后） | 一致 | **✔ 一致**（这正是当初以为整条路都能走通的原因） |
| 两块之间 | `…\n\nZZZ\n\n- 一…` | `…\n\nZZZ- 一…`（**少了一个段落**） |
| 列表项开头 | `- ZZZ\n- 一` | `- ZZZ一`（**少了一个 `- ` 标记**） |
| 引用块里换行 | `> ZZZ\n>\n> 引用` | `> ZZZ引用`（**两段被粘成一句**） |

⚠️ 所以第 14 项最终**没有**开口子给插件"偏移量"这种东西（对比一下：`get_selection()`
返的是 `{ text, empty }`——**选中的那段字**，不是 `{ from, to }`）。给了偏移量，
插件一定会拿它去拼字符串，然后拼出一份**跟编辑器真实结果不一样**的稿子。
想改正文的路只有一条：把意图交给编辑器，**别自己拼**。

⚠️ **量测是永久的那一半**：真序列化器的行为要是变了（比如以后换成别的
`remark-stringify` 配置），第三组会红。**红了要重新想这条设计，不是改断言**。

#### 读的那一半：`nota_doc_cursor` ＋ `Document::选区`

* 前端在 `EditorPane` 里挂 `onSelection`（所见即所得走 `$prose` 插件
  `选区快照插件`，源码模式走已有的 `updateListener`），**先按签名去重**
  （签名是 `empty|text`——光标只是移动、选中的字没变时不报）。
* 再过一层 **250ms 防抖**（`CURSOR_DEBOUNCE_MS`）。⚠️ 这是**必需的第二层**：
  去重只挡"选中的字没变"的情形，按住方向键扫一段文本时签名每帧都在变。
  上限因此是每秒四次 IPC，不是每次光标移动一次。
* 落到 `nota_doc_cursor(id, text, empty)` → `DocumentStore::记选区`。
* ⚠️ **选区是界面状态，不是文档内容**：它不碰 `revision`、不碰 `dirty`、不落盘，
  `Document::选区` 上是 `serde(skip)`。⚠️ 碰了 `revision`，插件会以为正文一直在变；
  碰了 `dirty`，用户光点两下光标就会看见"未保存"的星号。
* ⚠️ `empty` **不能靠 `text === ""` 推**：选中一张图片或一个公式时 `text` 是空的，
  但选区**不是**空的。这就是那个字段存在的唯一理由（`选区快照` 的 `Default` 也因此
  **手写**成 `empty: true`，不用派生那份说假话的 `{ text: "", empty: false }`）。
* ⚠️ **关窗/切模式时不做最后一次推送**（只 `clearTimeout`）：一次迟到的选区上报比
  "晚 250ms"更糟——它可能落在**另一份文档**头上。

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

⚠️ **2026-09-26 多了一档，但这条判据一个字都不用改**：面板可以声明 `live = true`
（宿主 `heartbeat.rs` 每秒补发一条**同一条** `nota:plugin-panel`），于是"实时"的东西也有了着落。
⚠️ 它**没有**破上面那条判据——心跳发的还是**失效信号**，一个字节的内容都不带，
面板打开时照样得自己去拉一次；**把心跳那条事件全丢掉，面板显示的东西仍然是对的**
（只是不再自己动）。⚠️ 代价是那一页的 `render` 每秒被重跑一次，见 `docs/12` §4.6。

**判据一句话：声明是状态 → 拉；发生是事件 → 推。**

⚠️⚠️ **2026-10-04 加了第四条通道，它是上面这条判据唯一的例外：`nota:plugin-stream`
（`plugin/mod.rs::EVENT_PANEL_STREAM`，`docs/07` 第 58 项）。**

| | 事实 |
|---|---|
| 谁发 | 插件调 `nota.ui.stream(text)`（`lua/api/ui.rs::实时表`）。**载荷 `{plugin, text}`——带着内容本身** |
| 干什么 | 「边生成边显示」：模型一个字一个字往外吐，**插件仓库**里 `plugins/ai/request.lua` 每 80 毫秒把**到此刻为止的全文**推一次；**空串 = 收工**（把那段临时的字撤掉） |
| 收在哪儿 | `ui/PluginDock.tsx` 里那张 `实时表`（`Record<插件 id, string>`），画在**该面板那一列内容的末尾** |
| 上限 | 宿主**只留最后 8000 个字符**（`实时上限`）。它是**临时的显示数据**，不是第二个"面板内容"口子 |

⚠️⚠️ **为什么它必须破例（这一条要记住的是"为什么"，不是"例外"）**：
这条命令跑着的时候宿主**一直握着 `plugins` 锁**（`commands/plugin.rs::nota_plugin_call`
从进函数锁到出函数），而 `nota_plugin_panel_content` 要的是**同一把锁**——
所以这中间前端喊"重拉"**根本回不来**，`refresh` 那条路在这条路上是**死路**：

```
nota_plugin_call          → 拿锁 ────────── 发请求、读回包 ────────── 放锁
nota_plugin_panel_content →                  等锁 ⏳（一直等到上面放锁）
```

📌 **判据仍然是上面那一句，只是要把它读完**：`stream` 送的不是"状态"，是
**一段用一次就扔的临时显示位**——它**不参与正确性**（丢掉它，面板上少的是"正在打的那几个字"，
收工时那次 `refresh` 会把真内容拿回来）。**所以"声明走拉、发生走推"没有被推翻，
是被划了一条边界**：内容里**只有这种"看一眼就扔"的**才许推。
完整推演在 `lua/api/ui.rs::实时表` 顶上与 [docs/13](13-lua-api.md) §8.6。

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
**不能因为第 17 项结了就把这条通道一起"拉"掉。**

#### 「现在摊着哪一块」为什么也走这条形状（2026-09-25 补）

`nota.ui.review(id)` 把插件的一块面板摊到**编辑区**去（见 `docs/04` §2.3b）。
它和上面的面板内容是**同一种**：状态归宿主、事件只当失效信号。

| | 事实 |
|---|---|
| 谁记着 | **宿主**（`plugin::ReviewState`，一张 `HashMap<插件 id, 面板 id>`，**同时只有一格**——`set` 先把整张表清掉）。⚠️ 它**故意不在 `AppState` 里**：`nota.ui.review` 是在**持有 `plugins` 锁的时候**跑的，塞进 `AppState` 就是自锁 |
| 事件 | `nota:plugin-review`（`plugin/mod.rs::EVENT_REVIEW`），**载荷是空的**——收到就 `api.plugin.review()` 重拉。⚠️ 写状态**在发事件之前**，否则前端可能拉到一个还没写进去的旧值 |
| 收起来 | `nota.ui.review(nil)` 或用户按「回到正文」→ `nota_plugin_review_close`。⚠️ **那条命令不经过插件**：插件正卡在一次慢调用里（宿主还抱着 `plugins` 锁）时，用户也得退得出来 |
| 为什么不让前端自己 `useState` | 一刷新界面就没了，而"AI 提了改动、我正在看"这件事不该被一次热重载抹掉——与 BUG-13 同一条教训 |

⚠️ **红绿两条是共用的**：`.diff-del`（红底＋删除线）/ `.diff-add`（绿底＋下划线）只有
`src/styles/diff.css` 一份，右栏那块 `kind = "diff"` 与编辑区里的预览**同时**用它。
同一次改动在两处长得不一样，用户会以为那是两种东西。⚠️ **两个装饰不是一种**：
只靠底色的话红绿色觉障碍的用户分不出哪边是哪边。⚠️ 底色是 `theme.css` 里的**实色变量**，
不是现 `color-mix` 兑的（兑出来那版在深色壳里浅到看不见）。

#### 装卸 / 停用 / 信任这四件：**都不是"推/拉"问题**（2026-09-25 补）

它们是用户点一下才发生的**动作**，所以一律是普通 `invoke` 命令，一条新事件都没有：

| 命令 | 前端 | 做什么 |
|---|---|---|
| `nota_plugin_install` | `api.plugin.install(path)` | 装一个包。⚠️ `path` 由**前端**用应用内文件选择器问出来，宿主不自己弹框 |
| `nota_plugin_uninstall` | `api.plugin.uninstall(id)` | 卸掉。⚠️ **不可逆**，调用方先问一句 |
| `nota_plugin_set_enabled` | `api.plugin.setEnabled(id, on)` | 开/关。⚠️ 停用＝**真卸载**（`on_unload` 会跑），所以动完**必须重拉** `list` / `panels` / `menus` |
| `nota_plugin_trust` / `nota_plugin_trust_list` | `api.plugin.trust(id)` / `trustList()` | TOFU 信任表 |

⚠️ **为什么不发事件让界面自己更新**：这三条改的是"有哪些插件、哪些在生效"，
按本节那条判据（**声明是状态 → 拉**）——它们属于**状态**那一类，
所以由调用方**重拉**，不是发一条"插件变了"的事件让所有人猜。
⚠️ 三条里 `install` / `uninstall` / `set_enabled` 都是**异步命令**（走
`spawn_blocking`）：装完会当场跑 `on_load`，那个可能起子进程、可能要几秒。

#### ⚠️ `bridge/types.ts` 里还有**不是通道**的一半：设置那几张形状（2026-09-27 补）

本文讲的是"正文怎么进出编辑器"，而 `src/bridge/types.ts` 里同时住着**整个 `Settings`
的形状**（含几条外观轴）与 `CtrlWheelTarget` 这类枚举。⚠️ **它们不走通道**：
前端拿它们只是把 `nota_settings_get` 那份 JSON **断言成类型**，改一边不改另一边
编译期一声不响、运行期也没人报错——`null` 会一路滑到某个 `.toFixed()` 上才炸。
所以那几格的口径**以 `docs/03` §5.1 / §5.6b 为准**，`types.ts` 这一侧只保证**名字与取值一致**：

| `types.ts` | Rust 侧 | 落盘写的字 | 谁说了算 |
|---|---|---|---|
| `CtrlWheelTarget = "font_size" \| "zoom"` | `settings/appearance.rs::CtrlWheelTarget`（`FontSize` 默认 ／ `Zoom`，`#[serde(rename_all = "snake_case")]`） | `ctrl_wheel_target = "font_size"` | `docs/03` §5.6b |

⚠️ 所以**加一条外观轴要改三处**：Rust 枚举／字段、`types.ts` 的对应类型、以及
设置页那颗控件（`ui/settings/panes/AppearancePane.tsx`）。三处里**只有 Rust 那处**
有编译期保护，另外两处靠这条表。

---

## 6. 整篇替换语义

**`set_text` / `append_text` 都是整篇替换**。区域级的编辑只有一条路
（`docs/07` 第 14 项，2026-10-04 加）——而且那条路**不是**"后端改一处"，是
**"请编辑器替你改一处"**（§5.2b）。

| API | 实际做的事 |
|---|---|
| `nota.document.set_text(text)` | `store.sync(id, text)`——换掉整份镜像 |
| `nota.document.append_text(tail)` | 先读出当前全文，`push_str(&tail)`，**再整篇 `sync` 回去** |
| `nota.document.insert_at_cursor(text)` | **一个字节的镜像都不改**——发一条 `nota:document-edit` 让编辑器落一笔真事务 |
| `nota.document.get_selection()` | 读 `Document::选区`（编辑器报上来的），返回 `{ text, empty }` 或 `nil` |

⚠️ 第 14 项当初要定的那个形状问题（UTF-16 偏移？PM 的 `pos`？锚点+头？）**答案是
"都不是"**：这三个都是**偏移量**，而偏移量在块边界上对不上（量测见 §5.2b）。
所以最后给出去的**不是坐标、是那段字本身**，改正文则走"意图"——把复杂度留在
唯一知道结构的那一侧（编辑器）。

⚠️ `insert_at_cursor` 因此有两条与另外两个写 API **不同**的性质：
返回 `true` 只代表"意图发出去了"（编辑器可能没挂、用户可能已经切走文档，那不是错误）、
**且它不碰 `revision`**（镜像没变，正文稍后由编辑器经 `nota_doc_sync` 推上来）。

⚠️ 前端侧的 `setMarkdown(md)` 照旧是 `replaceAll(md)`：没有差量合并，也没有额外的
光标恢复代码（光标位置由 ProseMirror 对这次替换事务的默认映射决定）。**整篇替换的
代价在那儿一点没减**——所以"在光标处插一句"不该用它（撤销栈断掉、光标跳走、
表格列宽之类的排版状态全丢），这正是 `insert_at_cursor` 存在的理由。

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

1. **front matter**：`i === 0` 且该行 `trimEnd() === "---"` 才开始，到下面三条**任一**
   满足为止：① 收尾的 `---` / `...`；② **空行**；③ **标题行**。
   ⚠️ ②③ 那两条命中的行要**按普通行继续往下走**（不能 `continue` 掉，否则 ③ 里那个
   标题正好被吃掉，又绕回本来的症状）。⚠️ 这三条是 2026-09-25 修 BUG-32 时补的，
   原来只有 ① ——**一条 `---` 之后跑到下一条 `---` 为止**，于是"文件头一条 `---`、
   正文里又有一条 `---`"这种文件，中间那一整段（含标题）都被当成 front matter 吞掉，
   **大纲整个空着**。真 YAML front matter 是一串连续的 `key: value`，**里面不会有空行**，
   所以"遇空行即结束"才是那条判据的正主；③ 兜的是"`---` 再也没闭合"的残缺文件
   （不该把整篇正文吃光）。⚠️ **后端那份是另一个形状**（`document/mod.rs::front_matter_title`
   只在这一段里找 `title:`，找不到就给 `None`、正文标题照认），所以那时**只有前端大纲是空的**
   ——"同一份文件后端算得出标题、前端大纲空着"就是这条的现场特征；
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
| **front matter 的范围** | 2026-09-25 起按"空行 / 标题行 / `---`"三条收尾（BUG-32，见上面第 1 条）。⚠️ 于是真 YAML 里**带空行**的写法（少见但合法）会被当成"front matter 结束了"——**取舍是故意的**：宁可少吞一点，也不要静默吞掉正文 |
| `line` 字段 | 是原文行号，**包含被跳过的行**（用循环下标，不是新数组下标） |

**为什么不引完整 AST**：真解析要过 remark，而**为一个侧栏列表引入完整 AST 不划算**；
扫一遍是 O(行数)，几千行的文档也就微秒级。真出问题时再换 remark。

### 8.2 `countText(markdown, readingSpeed)` —— 字数

```ts
export interface Counts {
  characters: number;
  words: number;
  lines: number;
  /** 预计阅读分钟数，至少 1。 */
  readingMinutes: number;
}
```

口径（状态栏）：

| 项 | 口径 | 为什么 |
|---|---|---|
| `characters` | `[...markdown].length`，按**码点** | 用 `.length` 是 UTF-16 码元——一个 emoji 会被算成 2，一个字的中文倒是对的（1）。混排时两种算法的差会让人对不上数 |
| `words` | 先按**空白**切块；块内 **CJK 字符逐字算一个词**，非 CJK 用 `/[\p{L}\p{N}'’-]/u` 攒成一个词，遇标点收词 | 纯按空白切会把整段中文算成 1 个词（显然不对）；这是中英混排下最贴近直觉的口径 |
| `lines` | `markdown === "" ? 0 : markdown.split("\n").length` | 空文档是 0 行，不是 1 行 |
| `readingMinutes` | `max(1, round(words / 阅读速度))`，**除数由第二个参数给**（`settings.appearance.reading_speed`，默认 382） | ⚠️ 这个除数**曾经是写死的 250**（"200 是英文、300 更贴中文，取折中"），而设置里那一项自己的说明写着"只用于把总字数换算成状态栏里的「约几分钟读完」"——它当时**没有任何读取者**（`docs/10` §11.2）。2026-09-25 接线后两边是同一个数；低于 1 一律按 382 算（手改设置文件写进 0 会得到「约 Infinity 分钟」） |

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
<StatusBar {...状态栏接线} />                    // 那一堆 props 由 ui/useStatusBar.ts 接
```

⚠️ **2026-09-30 晚起 `StatusBar` 的 props 从 `ui/useStatusBar.ts` 铺进来**
（不是在这一行现写的，`App.tsx` 那天顶到 1003 行、破了 1000 硬线），
但它拿到的 `doc` 仍是上面这个 `activeDoc`——**"吃的是后端镜像"这条判断一个字没变**。

`docs` 只在 `refreshDocs()` 时刷新，而 `refreshDocs()` 是**去抖同步之后**才被调的
（`EditorPane` 的 `onDocsChanged`）。所以：

- **大纲与字数实际上吃的是后端镜像**，打字时会慢一个去抖周期（约 300ms）——
  与注释想避免的现象**是同一个**；
- 要做到注释里说的"实时"，得在 `EditorPane` 的 `onChange` 里把最新文本提到 `App`
  层（`useState` 或 callback）再传给 `Sidebar`/`StatusBar`；**目前没有这条线**。

（`outline.ts` 本身是纯函数，这个口径问题不在它里面。这里有个取舍：提状态会让每次
击键都触发一次 App 层渲染——那正是 `EditorPane` 刻意不让 React 管编辑区的原因，
所以要么只在"大纲页可见"时才提，要么用 ref + 订阅。）

---

## 9. 与本文相关的、容易踩的坑（汇总）

| # | 坑 | 落在哪 |
|---|---|---|
| 1 | 换文档靠 `key={doc.id}` 重挂——**改成"按 id 换内容"会让撤销栈/选区错位** | `App.tsx`、§3 |
| 2 | `create.ts` 里**不做去抖**——去抖属于调用方 | §5.1 |
| 3 | 插件改文档的事件**必须**发，漏了就是"编辑器里看到的和存盘的不是一份东西" | `docs/03` §1.2 |
| 4 | `KaTeX` 的 CSS 没引 → 公式排版散 | §2.2 |
| 5 | `parseMarkdown()` 没有调用点 → `replaceAll` 坏语法是静默的 | §7 |
| 6 | 前端的 `EditorPane` 那把 `setMarkdown` 只覆盖**活动**文档，且不排队 | §5.2 |
| 7 | 大纲/字数吃的是镜像，不是实时文本（与 `outline.ts` 注释说的相反） | §8.3 |
| 8 | 分屏的预览**只读、且从不回写**——给它接 `onChange` 就是回声 | §3.1 |
| 9 | 只读实例要**两件事都做**（`editable: () => false` + listener 早退），少一件就是"看着只读、实际在改文档" | §4 |
| 10 | 源码模式**不 `settle`**（CodeMirror 不规范化），补上也没有意义 | §3.1、§5.1 |
| 11 | 切模式是**换实例**，撤销栈跨模式会清空——那是故意的 | §3.1 |
| 12 | 加前缀跳过空行、清前缀不跳；`setMarkdown` 文本相同时直接返回（否则冲撤销栈） | §2.5 |
| 13 | 导出**必须走编辑器自己那条渲染路径**，且摘的是**渲染后的 DOM**；摘之前要清掉 `nota-` 开头的交互零件 | §4.5 |
| 14 | 打印**不是** `window.print()`（容器里点不出来、也不同步）——是"导出 + 交给系统默认程序" | §4.5、`commands/export.rs` |
| 15 | 图片那条 P0：`title: null` 会让 image 节点**整个被跳过**（存盘丢图），插件必须在 `.create()` **之前**挂、且**只读实例也要挂** | §4.8 |
| 16 | 插图**落点由宿主算**，前端只交"图从哪来"；插入走 `run("image", …)` 而不是直接碰句柄——不然"源码模式插不了图"那句提示会丢 | §4.8b |
| 17 | 粘贴必须**捕获阶段 + `preventDefault`**（编辑器会把图片二进制丢掉，不拦就是两条路赛跑）；拖入走 Tauri 的 `onDragDropEvent`（HTML5 的 `drop` 在 `dragDropEnabled: true` 下**不带文件**） | §4.8b |
| 19 | 自己的粘贴处理器**必须 `.use()` 在 `clipboard` 前面**——PM 按插件顺序问 `handlePaste`，第一个返回 `true` 的赢，而上游那条**总会**返回 `true` | §4.19 |
| 20 | 语言线索有**两张表**：扩展名族查 `lang-guess.ts`，语言长名族（`lang-python`）查 `paste-clean.ts`——只查前者一个都落空，**且不报错** | §4.19、`docs/09` |
| 21 | **`Ctrl+B` / `Ctrl+I` 在 DOM 那一层永远收不到**——WebKitGTK 在把按键派发给 DOM **之前**就把它当成自己的编辑命令吃掉了（**菜单加速键也不行**：它是在**冒泡末端**查的，而事件从有焦点的 widget 开始传播，WebView 先吃掉就冒不上来）。唯一的活路是**捕获相位**的 `GtkEventControllerKey`（`src-tauri/src/format_keys.rs`，**只在 Linux 装**），由它发一条 `nota:format-key` 回来、走**和 `keydown` 一模一样**的那份判据。⚠️ 当年记的「GTK 那一层也拦不到」**只对了一半**；⚠️ 「按下去真加粗了」**没开窗验**，账在 `docs/07` §4 | §4.19（同一个「捕获阶段」的坑）、`docs/06` §5.34、**BUG-49**、`docs/01` 通道 B |
| 18 | 序列化那串**文本处理器是六层套着的**（顺序从外到内：行首竖线 / **正文里的 `$`** / 孤立波浪号 / 行首等号 / 原子后的空格 / 行首井号）——加一层去 `editor/text-handlers.ts` 挂（**不在 `create.ts`**），而且**只能挂 `handlers.text`**：挂 `$remark` 是**静默空操作**（`stringify()` 不跑转换器） | §4.17、§4.11 |
| 22 | **覆写模式（`Insert`）的开关不住在文档里**——它住在插件 state（`editor/overtype.ts`，`PluginKey<boolean>`）。所以"界面上要能看出它在开着"只能靠 `command-state.ts::签名` 把它带出去；漏了签名那一格，功能真生效、界面上一个字都不变 | §4.27 |
