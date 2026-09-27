# 05 — 编辑器桥：Milkdown 装配、双向通道与大纲

> 最后同步：2026-09-26

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
| `./code-block`（**本仓**） | `codeBlockView` | 代码块那两处挂件：块**内部**右下角的「复制 / 折叠」，加**块下边框之外**右侧的语言下拉。⚠️ 走 `$view`（NodeView），**全仓第一个**（2026-09-26 起同族的还有 `diagram-view.ts`）——它要加的是真的会交互的元素，`Decoration` 那种只读装饰做不到。⚠️ 两个挂件在 DOM 里是 `pre` 的两个**兄弟子节点**（`.nota-code-bar` 与 `.nota-code-lang-wrap`），都不进 contentDOM；`stopEvent` / `ignoreMutation` 用一条 `inChrome` 把**两个都包住**（2026-09-25 语言框从 bar 里搬出去之后，只判 bar 会把点下拉当成"点了编辑区"）。⚠️ 那颗控件**外面套了一层 `span`**（`.nota-code-lang-wrap`）——它是箭头与弹层的**锚**，箭头画在包裹层上而不是控件自己身上。<br>⚠️ **控件 2026-09-25 从 `<select>` 换成了 `<button>`**，因为原生弹层里放不下图标（`<option>` 只能装纯文字）；下拉弹层改由 `editor/lang-picker.ts` **自绘**，挂在 `document.body` 上、**不在编辑器 DOM 里**，所以 PM 的 `stopEvent` / `ignoreMutation` 看不到它，`inChrome` 不必再扩。⚠️ 换来的两条义务：① `destroy()` 里必须 `销毁()`（没人替它收弹层）；② 送给它的"当前语言"要读**活的节点引用**，不能闭包 `initialNode`——否则闭合框会倒退回旧语言（2026-09-25 实测）。图标那半在 `editor/lang-icon.ts` |
| `./find`（**本仓**） | `查找插件` | **查找/替换**的高亮与选中（`docs/07` 第 4 项）。⚠️ **只读观察者**：命中走 `Decoration.inline`、命令走事务元，**从不改文档** |
| `./writing-modes`（**本仓**） | `写作模式插件` | **专注模式**（压暗兄弟块）+ **打字机模式**（把光标那行滚到正中）。同上只读：装饰 + 元，不进撤销栈。⚠️ **专注的外壳那一半不在编辑器里**（菜单栏/侧栏/插件栏/标签栏/状态栏那五条由 `ui/useImmersive.ts` ＋ `app.css` 收），见 §4.4 |
| `./lax-heading`（**本仓**） | `不转义行首井号` | **序列化那一半**（两种模式都挂）：不往用户写的行首井号上加反斜杠。⚠️ **2026-09-26 显示层那一半（`宽松标题显示`）删掉了**——非严格模式下 `#你好` 就是普通正文，字号、行距、位置一个都不变（用户连着报两次，最后一句是「应该作为标识符的 `#` 不要变换位置和大小」）。见 §2.1c |
| `@milkdown/kit/utils` | `replaceAll` | `setMarkdown` 用的整篇替换（§6） |
| `@milkdown/plugin-prism` | `prism` | 代码块高亮 |
| `@milkdown/plugin-math` | `math` | 数学公式（KaTeX）：节点是 `math_inline` / `math_block`。⚠️ **这个包一个 NodeView 都没有**（`toDOM` 只把源码交给 `katex.render` 画出来），而且两个节点的**源码不在同一个地方**——`math_inline` 在**节点的内容**里、`math_block` 在 **`attrs.value`** 里。⚠️ **不改它的结果就是「敲进去的字静默丢掉」**（屏幕上写着、`toMarkdown` 交出去是空）。补视图的是本仓的 `./math-view`（§4.6b） |
| `@milkdown/plugin-diagram` | `diagram` | ```mermaid 代码块 → `diagram` 节点（它的输入规则 `/^```mermaid$/` **是打完那几个字母当场成块**的）。⚠️ 这个包**自己不画图**——`toDOM` 只有一句 `dom.textContent = code`，一处 `mermaid.render` 都没有；画的那一半是本仓的 `./diagram-view`（§4.10） |
| `./heading-on-enter`（**本仓**） | `标题回车成块` | **标题"回车才成块"** ＋ 输入期给 `# ` 后面那段加粗。见 §4.9 |
| `./table-input`（**本仓**） | `表格输入规则` / `表格输入` | 敲表头行 ＋ 分隔行 → 回车吃成一张真表格（此前只能用菜单插）。⚠️ 它和 `heading-on-enter` 都要处理"回车"，所以两边的守卫里各有一条绕开对方的地盘 |
| `./diagram-view`（**本仓**） | `diagramView` | 图表块的 NodeView：把源码画成图，并且还能改源码。⚠️ **第二个 `$view`**（第一个是 `code-block.ts`） |
| `./math-view`（**本仓**） | `mathView` ＋ `公式当前` | 公式那两个节点的视图：点一下就地改（半透明 `$` / `$$` 标出输入位置）。⚠️ **第三个 `$view`**，而且是**唯一一个 `.use()` 收数组的**（两条线：`公式当前` 管"当前是哪一块"、`mathView` 管怎么画）。见 §4.6b |
| `./math-input`（**本仓**） | `公式输入` | **行内公式的打字规则**（`:use()` 收数组，两条）：敲 `$$x$$` 或 `$x$` 当场变成一颗 `math_inline`。⚠️ 换掉了 `@milkdown/plugin-math` 那条 `mathInlineInputRule`——它**认不出 `$$…$$`**，用户敲到 `A$$bb$` 那一下尾巴就够匹配了，等他补最后一个 `$` 已经是另一段文字；所以 `create.ts` 把上游那条**按引用 `.filter()` 掉**（与标题那一条同一个手法）。见 §4.6c |
| `./math-delim`（**本仓**） | `标美元数` ＋ `行内公式规格` ＋（`create.ts` 的 `.config()` 里那条）`inlineMath` 处理器 | **行内公式用几个 `$`，存盘照原样写回去**（2026-09-27）：敲几个存几个（用户拍的决定，见 §4.6c 那条 ⚠️⚠️）。⚠️ **三处缺一不可、缺哪一处都静默失效**：解析那趟一个 `$remark` 标注插件（照**源码偏移**数开头几个 `$` → mdast 的 `data`）、`math_inline` 规格**多一个 `dollars` 属性**＋两个 `runner` 搬它、序列化按这个数**选上游现成的那条处理器**（`mathToMarkdown({singleDollarTextMath:false})`）。⚠️ ⛔ **别拿 `mathInlineSchema.extendSchema` 去改那份规格**——`@milkdown/plugin-math@7.5.9` 自己嵌了一份 `@milkdown/utils@7.5.9`，那份 `extendSchema` 会把节点**挪到 `nodesCtx` 末尾**（顶层那份才是就地替换），所以这里用的是顶层 `$nodeSchema`。⚠️ 代价：`math_inline` 从此**有** `attrs` 了。判据在 `tests/math-delim.test.ts`（`tests/math-input.test.ts` 里也有三组） |
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
| **这个节点由我来画** | `$view` NodeView（`code-block.ts`、`diagram-view.ts`、`math-view.ts`） | 要加 **`<select>` / `<button>` 这类真的会交互的元素**时。widget 是只读装饰，点它、让它持有焦点、让它开下拉都不是它的职责 |

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
| `src-tauri/src/document/mod.rs::strip_atx`（标签页标题） | 同宽松口径 | 同严格口径 |

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
   而 `plugin-math` 是 `^7.5.9`、`plugin-diagram` 是 `^7.7.0`。这不是笔误——
   那两个包的发版节奏跟 kit 不一样。
4. **`refractor` 也属于"必须显式列"那一类**（2026-09-22 加）：`plugin-prism` 的高亮引擎是
   `refractor`，而 `create.ts` 现在直接 `import "refractor/all"` 去补语言表（理由见 §2.3），
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

**两条自制件，都只用 CSS 变量**（`notaHighlight` / `notaTheme`）：颜色一律
`var(--accent)` / `var(--doc-fg)` / `var(--font-mono)` 这种，**不写死色值**。
理由是那条老规矩——**文档主题要能改编辑区里的一切**，而写死的色值主题改不动。
⚠️ 唯一的例外是 `t.processingInstruction` / `t.contentSeparator` 这类"标记本身"
的灰度，用 `var(--fg-faint)`。

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
所以**改这里的任何东西之后，中文输入要请人再打一遍**，不能拿"没看见报错"当通过。

### 3.1 三种编辑模式

用户 2026-09-23 定的顺序是「先重做菜单，**然后三种编辑模式**，然后 slidev 插件」。
⚠️ 那三件**都已结清**（第三件 2026-09-25 搬成了插件，见 `docs/04` §2.8）。
模式的取值落在 `settings.view_mode`（`ViewMode`，`docs/03` §设置），
编辑区按它摆一到两个窗格：

| `view_mode` | 左 | 右 | 谁的话算数 | 编辑器 |
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
给 `false`。调用方（`App.tsx`）据此决定要不要提示用户，**按钮按下去不能毫无反应**。
理由见 §4.1。

| 方法 | 语义 | 实现 | 实际调用点 |
|---|---|---|---|
| `getMarkdown()` | **取当前 markdown 文本**（序列化 `view.state.doc`，走 `serializerCtx`） | `editor.action(...)` | `ui/useDocuments.ts::saveDoc()`（存盘前**强制同步一次**，§5.1 对策②；**自动保存也走它**）、`ui/useClipboard.ts` 的「复制为 Markdown」 |
| `setMarkdown(md)` | **整篇替换**，底层是 `editor.action(replaceAll(md))` | 同步执行 | `App.tsx` 收到 `nota:document-changed` 且 `origin === "plugin"`、以及 `reloadDoc()` 命中活动文档时。⚠️ `create.ts` 的注释说它还用于"打开文件"——**那条路走的是重挂组件**（`key={doc.id}`），并没有调它 |
| `focus()` | 把焦点交给编辑区 | `editorViewCtx.focus()` | `EditorPane` 挂载完成后 |
| `runCommand(name)` | 跑一条编辑命令 | 见 §4.1 | **三条入口都汇到 `menuHandlers`**：自绘菜单点选、快捷键命中（查表）、原生菜单事件（`nota:native-menu` → `resolvePick` → `menuHandlers`）。`Ctrl+1..6` / `Ctrl+0` 走的就是这里 |
| `runCommand` 的返回值 | **这条命令在这条通路上有没有实现**（见 §4.1） | 所见即所得恒 `true`；源码模式表格那十条与没填地址的链接/图片给 `false` | `App.tsx` 的 `menuHandlers`——拿到 `false` 就 toast 一句，按钮按下去不能毫无反应 |
| `setWritingModes(模式)` | **拨专注/打字机**。走事务元，**不重建实例、不进撤销栈** | `editor.action(设写作模式)` | `EditorPane` 那个 `[focusMode, typewriter]` 的 effect（§4.4）。⚠️ 建实例那一刻还没有 handle，所以那一刻是空跑——由 `createEditor({writingModes})` 的**初始值**兜住 |
| `setFind(query, options)` | 设查询与三个开关。**空串 = 关掉高亮**（不动光标） | 见 §4.3 | `App.tsx::找` ← `ui/FindBar.tsx` 的 `onQuery` |
| `findStep(方向)` | 跳下一个（`1`）/上一个（`-1`） | 同上 | `FindBar` 的 Enter / Shift+Enter / ↑ / ↓ |
| `clearFind()` | 清掉查找状态与全部高亮 | 同上 | `App.tsx::关查找`（关条子时） |
| `replaceCurrent(text)` | 替换当前命中。**没停在任何命中上时返回 `false`** | 同上 | `FindBar` 的「替换」；`App.tsx` 拿到 `false` 就 toast |
| `replaceAll(text)` | 全部替换，**返回换了几个** | 同上 | `FindBar` 的「全部替换」；`App.tsx` 据此报「替换了 N 处」 |
| `destroy()` | **销毁**。组件卸载时**必须**调，否则 ProseMirror 的 DOM 监听会留着 | `editor.destroy()` | `EditorPane` 的清理函数、以及 StrictMode 那一遍 |

⚠️ **别的模块不能直接去摸 `editorViewCtx` 里的 state**（`create.ts` 文件头的原话）。
加功能的方式是再加一条，而不是把命令式通道开成两道。

⚠️ **源码模式那个句柄（`SourceHandle`，`editor/source.ts`）是照着这张表对齐的**：
十一条同名同义，所以 `EditorPane` 里一个 `handleRef` 能装两种实例，`App.tsx`
那边完全不需要知道当前是哪种模式。

⚠️ **对齐是硬要求，不是顺手为之**：`EditorPane` 的 `EditorPaneHandle`
把十一条**原样转发**给当前那个 handle（见 `ui/EditorPane.tsx`），少一条就是
"切到源码模式后查找条整个失灵"这种现象——而且 `tsc` 会拦住，不会漏到运行时。

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

⚠️ `h1`~`h6` 走**同一族**命令（`wrapInHeadingCommand` 带层数参数），在 `runCommand`
里拆开，所以这里列六个而不是一个 `heading` 加参数。

⚠️ **命令不认识时静默无操作**（返回 `false`）。界面那边本来就该保证只派发白名单里的值，
真走到 `default` 分支是代码写错了，而"按一下没反应"比"抛个异常打断编辑"更不打扰人。
⚠️ 但**"这条通路没有实现"要如实报 `false`**——这两件事不是一回事：
前者是"命令名不合法"，后者是"命令是合法的，源码模式的文本框里做不出来"。
后者必须让用户看见一句提示（见 §4 那张表的注）。

⚠️ 全仓**唯一**一处 `$view`（代码块 NodeView）不在这个通道上——它自己处理 DOM 事件。
另外**行内标记**（`**`、反引号）也不在这里，那是 `docs/07` 第 39 项要动 schema 的事。

⚠️ **菜单栏里已经有不属于这张表的项了**：`ui/commands.ts` 是「菜单项 → 动作」的**全表**，
而其中只有一部分会落到 `EditorCommand` 上。判据是**那件事是不是在改编辑器里的东西**——
⚠️ 2026-09-25 起这些"不属于"的项里**多了一整类：插件自己声明的菜单项**
（`ui/pluginMenus.ts` 合成的 `__plugin:<插件>:<命令>`，落在「插件」那一栏）。
它们更和编辑器无关——插件可能连正文都不看。
**"菜单项越来越多"不是把这类命令收进 `EditorCommand` 的理由**：把它们塞进这张白名单
只会让"这条命令到底改不改文档"变得说不清。同理 `file.*` / `theme.*` / `view.toggleSidebar` 那一批也都不在这儿。

⚠️ **原来这里举的例子是 `view.slidev`（Slidev 预览），那条命令 2026-09-25 删了**——
预览整个搬进了插件，它的菜单项现在就走上面那条路（`plugins/slidev/main.lua` 的
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
含样式那份嵌**三份 CSS**（都是 `?inline`，**和编辑器同一份字节**）＋**限域后的**
文档主题：`theme/base.css`（变量那一层）＋ `editor.css`（正文）＋
`katex.min.css`（公式）。外面那几层 class（`.editor-pane` > `.editor-mount` >
`.milkdown` > `.ProseMirror`）**必须照着编辑区的 DOM 摆**——那份 CSS 的作用域要求，
摆错了症状是"CSS 在、但哪条都没命中"。

⚠️ **那三份的名单是 2026-09-27 定下来的，别随手加。** 编辑区在界面上拿到十来份
CSS，但 `code-block.css` / `math.css` / `marks.css` / `diagram.css` 的规则
**全部挂在 `.nota-*` 上**，而 `.nota-*` 正是上面要摘掉的东西——摘完之后它们一条
都不命中。判据：把注释剥掉，看还剩几条选择器不带 `nota-`。
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

- **换掉上游那条的手法**：`create.ts` 里 `math.filter((p) => p !== mathInlineInputRule)`
  ——**按引用**滤，与标题那条 `wrapInHeadingInputRule` 一模一样。⚠️ **它依赖上游的导出形状**，
  升级 milkdown 要重新确认这条 `filter` 还筛得中。
- **`$…$` 那条多一道守卫**：前面紧挨着**还是 `$`** 时返回 `null` 让开（`null` 在
  `prosemirror-inputrules` 里是"这条不接、试下一条"）；上游那条已经不在，所以让开就等于
  "这颗字符不触发任何规则"。等 `$$` 齐了由上一条接管。
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
| `==高亮==`、`[TOC]`、`文字[^1]`、`> [!NOTE]` | 各被加一个 `\` 转义 | ⚠️ 遗留：这些行内语法 Nota **不认识**，于是当普通文本转义 |
| 行内 `$$x$$` | `$$x$$`——**一字不差** | ✅ **2026-09-27 已修**（用户拍了「保留」）：mdast 的 `inlineMath` 没有"用了几个 `$`"这个字段，所以另记了一个 `dollars` 属性一路带过去（§4.6c，机制在 `editor/math-delim.ts`，判据在 `tests/math-delim.test.ts`）。⚠️ 2026-09-26 那一版这里写的是"`$$x$$` → `$x$`，待用户拍板" |
| 开头的 YAML front matter（`---` / `theme: seriph` / `---`） | `---` ＋ 空行 ＋ **`## theme: seriph`** | ✅ **2026-09-26 已修**：整段**不进编辑器**，在边界上原样留住（§4.12，BUG-39）。⚠️ 这一条比上面那些重一个量级——上面是"字节动了"，它是**把数据弄没了** |

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
「图片已复制到 …」这类句子。**反之（宿主直接回一句中文）会让界面换语言时它说不出口**
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

- ⚠️ **"并且把下一段开出来"是必须的**，不是顺手加的：第一版只换块类型、光标留在标题末尾，
  实测症状是敲 `# Hello` ＋ 回车再敲 `second line`，屏幕上出现 **`Hellosecond line`**——
  因为"回车"在这个编辑器里**到处**都是"换到下一段"（`baseKeymap` 的 `splitBlock`），
  只有这一处不换行，用户一定会撞上。Typora 那边回车也是两个动作一起做。
- ⚠️ **这一步不动文件里的字节**：段落 `# 你好` 序列化出去就是 `# 你好`，而它本来就是
  markdown 的一级标题——**按不按回车，存进文件的是同一串字节**。代价是一个**有意留着**的
  小出入：敲了 `# 你好` 直接存盘再打开，那一段会是**真标题**（解析器认的就是它）。
- ⚠️ **行首退格降级这个文件一行都没写**：上游 `headingKeymap` 的 `DowngradeHeading` 已经
  绑在 `Backspace`/`Delete` 上（一级标题行首退格 = 直接变回段落，正是用户点名要的那条）。
  **别在这儿再写一份**——同一个键两处各答一次，症状（"这一下没反应"）是全仓最难查的一类。
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
`lax-heading.ts` / `atx.ts` 显示层的事）是两回事。

### 4.10 图表块：上游**不画图**（`editor/diagram-view.ts`，2026-09-26）

`@milkdown/plugin-diagram` 只做三件：把 ` ```mermaid ` 围栏转成 `diagram` 节点、给 schema、
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

#### ③ ⚠️⚠️ 它会弄坏「分割线」——靠 `是行首的横线` 救着

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

⚠️ **`Input` 档只挂该挂的规则**：`off` 时 0 条；`破折号 = false` 时少掉
`---` / `--` / `...` 三条；`引号 = false` 时少掉 `"` / `'` 两条。**判据只留一处**
（处理器里不再重复判一遍），而条数本身进了测试。

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
| `tests/smart-punctuation.test.ts` | **32** | 三个纯函数（含与 Rust `Default` 的**对账**）／ `扫标点` 的边界／ `装饰清单` 的**位置换算**／装配条数 |
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
| 去抖间隔是 `SYNC_DEBOUNCE_MS = 300`（`EditorPane.tsx`） | 见 `docs/03` §9.1 |
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
| `nota_plugin_install` | `api.plugin.install(path)` | 装一个包。⚠️ `path` 由**前端**用文件对话框问出来，宿主不自己弹框 |
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
<StatusBar doc={activeDoc} />
```

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
