/**
 * 编辑器内核那几份**对外类型**（`create.ts` 的公共形状）。
 *
 * ⚠️ **2026-09-26 从 `create.ts` 整段搬出来的**，搬的原因只有行数一个
 * （那一份当时 1036 行、越过 1000 行硬上限）。**内容一个字节没改**，
 * 只是把"这些类型要用到谁"补成了文件头的 import。
 *
 * ⚠️ 它们**全都仍然从 `@/editor/create` 出去**（那边有 `export type { … } from`
 * 那一段转发），所以全仓几十处 `import type { EditorHandle } from "@/editor/create"`
 * 一处都不用改。**加新类型时也要走那条转发**，否则会出现"同一个类型有两个
 * 住处"，而症状是"改了一处、另一处还是老样子"。
 *
 * ⚠️ 这个文件里**不许出现任何运行时代码**：它被 `ui/` 下十几个文件按类型引入，
 * 掺进一个 `const` 就会把它们和整个编辑器内核（Milkdown + refractor 那 400 个
 * 语言）捆在一起，那是一次打包体积上的倒退。
 */

import type { SelectionSnapshot } from "./caret-snapshot";
import type { CommandState } from "./command-state";
import type { FindOptions, FindStatus } from "./find";
import type { InlineExtensionFlags } from "./inline-marks";
import type { punctuationSettings } from "./smart-punctuation";
import type { changePreview, previewMode } from "./review";
import type { WritingMode } from "./writing-modes";


/**
 * 菜单栏能派发的编辑命令。
 *
 * ⚠️ 这是一张**白名单**，不是"随便什么命令名都能传"。任意的命令名字符串
 * 从菜单传进来，等于把一个 `any` 形状的入口开给界面层——写错了不报错、
 * 只是没反应。列成联合类型，写错就是编译错。
 *
 * `h1`~`h6` 走同一族命令（`wrapInHeadingCommand` 带层数参数），
 * 在 `runCommand` 里拆开，所以这里列六个而不是一个 `heading` 加参数。
 */
export type EditorCommand =
  | "undo"
  | "redo"
  | "bold"
  | "italic"
  | "inlineCode"
  | "strike"
  | "highlight"
  | "superscript"
  | "subscript"
  | "underline"
  | "kbd"
  | "comment"
  | "h1"
  | "h2"
  | "h3"
  | "h4"
  | "h5"
  | "h6"
  | "text"
  | "quote"
  | "ul"
  | "ol"
  | "task"
  | "codeBlock"
  | "hr"
  | "mathBlock"
  | "toc"
  | "footnote"
  | "alertNote"
  | "alertTip"
  | "alertImportant"
  | "alertWarning"
  | "alertCaution"
  | "table"
  | "link"
  | "image"
  | "clearFormat"
  | "tableRowAbove"
  | "tableRowBelow"
  | "tableColLeft"
  | "tableColRight"
  | "tableDelRow"
  | "tableDelCol"
  | "tableDel"
  | "tableAlignLeft"
  | "tableAlignCenter"
  | "tableAlignRight"
  | "tableResize"
  | "tableMoveRowUp"
  | "tableMoveRowDown"
  | "tableMoveColLeft"
  | "tableMoveColRight"
  | "tableCopy"
  | "tableFormat"
  | "tableRowHeaders"
  | "insertText"
  /**
   * **写一条链接 / 去掉一条链接**（2026-10-07）。
   *
   * ⚠️ 与新开的这两个**不是一条命令**：`link` 那条是上游的 toggle 语义
   * （`toggleMark`，只给选区挂标记、**一个字符都不插**），而用户点「插入链接」
   * 期待的是**正文里当场出现那几个字**（`docs/07` 第 96 / 102 项）。
   * 两条混在一起的话，"空光标点一下到底该出什么"就说不清了。
   * 落点与判据全在 `editor/link-edit.ts`。
   */
  | "linkSet"
  | "linkRemove"
  /**
   * **选择这一族**（2026-10-07）：选当前行 / 选当前词 / 选当前句 / 选词并删。
   *
   * ⚠️ 四条一起进这里，是因为它们**共用同一套判据**（`select.ts` 第一组那几
   * 个纯函数），菜单上也是同一个子菜单的四行。拆开列而不是一条带参数的，理由
   * 与 `h1`~`h6` 那条一样：命令名自己说明要干什么，写错就是编译错。
   * ⚠️ 源码模式那边**调的是同一套判据**（`source-commands.ts`），别在那里
   * 另写一份"哪个字算词"——见 `select.ts` 文件头。
   */
  | "selectLine"
  | "selectWord"
  | "selectSentence"
  | "deleteWord"
  /**
   * **上移 / 下移光标所在的块**（`Alt+↑` / `Alt+↓`，2026-10-07）。
   *
   * ⚠️ 名字沿用了菜单里那两条的既有 id（`edit.moveLineUp` / `edit.moveLineDown`，
   * 早就摆在那儿但一直是灰的），这里对应的是它们真正干活的那一段——
   * 搬什么、表格里为什么不搬、到边为什么不动，都写在 `move-block.ts` 文件头。
   */
  | "moveLineUp"
  | "moveLineDown"
  /**
   * **开头那段 front matter**（`docs/07` 第 64 项，2026-10-04）。
   *
   * ⚠️ 它是这张白名单里**唯一一条改的不是文档树**的命令：那一段在编辑器
   * 眼里根本不存在（见 `front-matter.ts` 文件头），所以它**不进撤销栈**、
   * 也不在 `command-table.ts` 那张表里（那张表只吃 `(editor, payload)`，
   * 手里没有那段文本）。它在这里，是因为"菜单点出来的一条编辑动作"只有
   * 这一个入口（`ui/useCommandTable.ts` → `run`），另开一条通道就是两个真相。
   * 实现落在 `create.ts::跑一条命令` 与 `source.ts` 的那个 `switch` 里。
   */
  | "frontMatter";

/**
 * 命令可以带的参数。目前只有四条用得上（超链接的地址、图片的路径、要插的
 * 文本、严格模式那个开关）。
 *
 * ⚠️ 它**不是**一个"什么都能塞"的口袋：字段少、全是可选，是因为命令名本身
 * 已经说明了要干什么，参数只是那件事的原料。真出现下一种原料时再往这里加，
 * 别提前把 `Record<string, unknown>` 那类东西开出来——那种类型等于没有类型。
 *
 * ⚠️ `strict` 与前三样**不是一类**：那三条是"要插什么"（内容），它是"照哪套
 * 规矩扫"（判据）。它进这里而不是进编辑器选项，是因为它只影响**一条命令**，
 * 而按设置重建整个编辑器实例的代价远大于随命令带一个布尔。见它自己那段。
 */
export interface CommandPayload {
  /** 调整表格时的目标列数。 */
  columns?: number;
  /** 调整表格时的目标行数（包含表头行）。 */
  rows?: number;
  /** 超链接的目标地址。 */
  href?: string;
  /**
   * 链接的**显示名称**（`linkSet` 用；`href` 那一格的搭档）。
   *
   * ⚠️ 用户点「插入链接」时看到的就是这两个框：「链接显示名称」与「链接内容」。
   * 名称为空时**用地址顶上**——见 `link-edit.ts::链接落点`（空名字的链接在
   * 屏幕上是一条点不着也看不见的东西）。
   */
  label?: string;
  /** 图片地址（相对文档目录的路径，或 http(s)/data: 开头的地址）。 */
  src?: string;
  /** 图片的替代文字。 */
  alt?: string;
  /**
   * 要插到**当前选区**位置的文本（`insertText` 用）。
   *
   * 空串的语义是"删掉选区"——「剪切」靠它：先复制成功、再把选中的那段删掉。
   */
  text?: string;
  /**
   * **严格模式**（`Settings.strict_markdown`，「内容目录」用）。
   *
   * ⚠️ 这一格**不是**编辑器实例那一格（往下翻，`CreateOptions` 里另有一个
   * 同名的）：那一个喂给 `createEditor`，这一个喂给"扫这一篇的标题"的纯函数。
   * 两者都从 `Settings.strict_markdown` 来，但走的是两条路——`create.ts` 的
   * 选项 2026-09-26 删过、09-29 又加回来（经过见下面那一格），而这里从来没
   * 断过：扫标题的判据一直要它，宽松档下 `#标签`（井号后没空格）也算标题。
   * 侧栏「大纲」那一页拿的是设置里的真值，目录必须**同源**——不然同一个界面上
   * 会出现"大纲 7 条、目录 6 条"。
   *
   * 缺省 `false`（= 宽松，也是 `Settings` 的默认档）。
   */
  strict?: boolean;
  /**
   * 开头那段 front matter 的**新内文**（`frontMatter` 用，见那个命令）。
   *
   * 三种含义，缺一不可：
   * - **不给**（`undefined`）：**确保有一段**——本来没有就建一段空模板
   *   （`title: `），已经有的**一个字都不动**。菜单里那一条就是这个用法：
   *   它拿不到"这篇现在长什么样"，所以不能带内容来。这也是它**不可能**
   *   覆盖掉已有 front matter 的原因。
   * - **给字符串**：把内文换成这一份（围栏与后面那几行空行留着）。
   * - **`null` 或空白串**：**删掉这一段**。⚠️ 上面的编辑框**不会**送这个值
   *   ——清空一个输入框是很容易误触的动作，而这份文档是自动保存的。删掉
   *   那一步走界面上那颗明确的「删除」。
   */
  frontMatter?: string | null;
}

/**
 * 一段选中的内容：纯文本 + 富文本 HTML（源码模式给不出后者，见 `EditorHandle.选区`）。
 *
 * 两个字段都是**编辑器给的**，不是这边拼的：从菜单按下「复制」和按 Ctrl+C
 * 必须得到同一份内容，唯一的保证是两条路都问编辑器要同一份东西。
 */
export interface SelectionContent {
  text: string;
  /** 空串 = 这一侧给不出 HTML（源码模式手里只有文本）。 */
  html: string;
}

/** 编辑器句柄。调用方只通过这些方法跟编辑器打交道。 */
export interface EditorHandle {
  /** 取出当前 markdown 文本。 */
  getMarkdown: () => string;
  /** 整篇替换（用于：打开文件、插件改了文档、放弃修改重载）。 */
  setMarkdown: (markdown: string) => void;
  /** 把焦点交给编辑区。 */
  focus: () => void;
  /**
   * 焦点交给编辑区，**并把插入点放到文档开头**。只给"刚打开/刚切到这篇文档"
   * 那一次用（`ui/EditorPane.tsx` 装载完调一次）。
   *
   * ⚠️ **与 [`focus`] 分开是必须的**：`focus` 是"跑完一条命令之后把焦点还回来"，
   * 那时把光标挪到开头，等于每敲一次菜单命令都跳回文首。所以不能合并成一条。
   *
   * 来历（用户 2026-09-26）：「你的默认光标位置是会变的。我最开始进入的时候
   * 找不到光标」「默认开头光标位置也不要变」。查出来有两条机制，而"打开文档"
   * 这条路上**原本一行代码都没有**（既没设过选区，也没保证过可见）：
   *
   * ① ProseMirror 建 state 时的默认选区是 `Selection.atStart`，但 `trailing`
   *    插件会在**第一次事务**里往文末补一个空段落，而插入步骤会把选区用
   *    `selectionToInsertionEnd` 带到**插入内容的末尾**——于是"结尾是列表/引用/
   *    表格/代码块的文档，一进来光标在文末（在视口外），结尾是段落的文档就停在
   *    开头"，**全看最后一块是什么**。这就是"位置会变"。
   * ② `setMarkdown`（重新载入、插件改文档）走 `replaceAll`，同样落到文末。
   *
   * 两条都收口到这一个方法：**显式**设选区，并且 `scrollIntoView` 跟上，
   * 免得插入点确实在开头、却停在屏幕外。
   */
  focusAtStart: () => void;
  /** 拨专注/打字机模式。**随时可拨，不重建实例**（见 `writing-modes.ts`）。 */
  setWritingModes: (mode2: WritingMode) => void;

  /**
   * 摊开 / 收起**就地改动预览**（`nota.ui.review_diff`，见 `review.ts` 文件头）。
   *
   * `null` 收起来。看法（"对比"/"改后"）一起传进来：它只换根节点上的一个
   * class，不重算装饰——所以两条看法之间的差别全在 CSS 里，切换是零成本的。
   *
   * ⚠️ **实现里按对象身份去重**：只有 `预览` 这个对象换了才真的派事务重算装饰。
   * 看法变了而预览没变时，只换 class。调用方（`ui/EditorPane.tsx`）不必自己
   * 记住"上一次传的是什么"——那种记账放在两个调用点上一定会漏一处。
   */
  setReview: (preview: changePreview | null, viewMode: previewMode) => void;

  /**
   * 跑一条编辑命令。菜单栏和快捷键都走这里，**不认识 ProseMirror**。
   *
   * ⚠️ **返回值是"这条命令在这条通路上有没有对应的实现"**，不是"改了没有"。
   * 所见即所得这一侧永远有（`command-table.ts` 那张 `COMMANDS` 是白名单、覆盖
   * 全部 `EditorCommand`），
   * 于是它恒为 `true`；**源码模式那一侧会真的返回 `false`**（CodeMirror 没有
   * 文档树，表格那几条就没有对应的文本操作）。调用方（`ui/EditorPane.tsx`）
   * 据此提示用户，而不是让按钮按下去毫无反应。
   */
  runCommand: (name: EditorCommand, payload?: CommandPayload) => boolean;

  /**
   * **在光标处插一段**（替换当前选区）。给插件的
   * `nota.document.insert_at_cursor` 用（`docs/07` 第 14 项）。
   *
   * ⚠️ **它落的是 ProseMirror 的一笔事务**，不是"换掉整篇文本"：
   * 撤销栈、光标、滚动位置、表格列宽全都跟着走，用户看得见也撤得回。
   * ⚠️ 之所以**不能**在宿主（Rust）那侧按字符偏移拼字符串，见
   * `caret-snapshot.ts` 顶上那张量测表——在块边界上那么拼会**把结构弄坏**
   * （两段粘成一段、列表项吃进正文）。
   *
   * ⚠️ **返回值是"这一侧有没有实现"**（同 `runCommand`）：只读实例
   * （分屏右侧预览、导出用的离屏实例）返回 `false`。
   */
  insertAtCursorPlace: (text: string) => boolean;

  /* ── 查找与替换（`editor/find.ts`）────────────────────────────────────
   *
   * ⚠️ **这几条不进 `EditorCommand`**。那个联合类型是**编辑动作**的白名单
   * （作用在文档上、会进撤销栈），而查找是**视图层的状态**（高亮是装饰，
   * 不进文档、不进撤销栈）。混在一起的话，"查找下一个"会出现在命令表的
   * 遍历里，而它根本不是那一类东西。
   */

  /** 设查询与三个开关。**空串 = 关掉查找的高亮**（不清光标）。 */
  setFind: (query: string, options: FindOptions) => void;
  /** 跳到下一个（`1`）或上一个（`-1`）命中。 */
  findStep: (direction: 1 | -1) => void;
  /** 清掉查找状态与全部高亮。关查找条时调。 */
  clearFind: () => void;
  /** 替换当前命中。**没停在任何命中上时返回 `false`**（调用方据此提示）。 */
  replaceCurrent: (text: string) => boolean;
  /** 全部替换，返回换了几个。 */
  replaceAll: (text: string) => number;

  /**
   * 跳到第 `index` 个标题（0 起，**按大纲里的顺序**），并把光标放到它的正文起始处。
   *
   * 侧栏大纲点一下就调它（`docs/07` §3 第 48 项）。
   *
   * ⚠️ 为什么**同时**收 `line` 与 `index` 两个坐标：两种编辑器能用的是不同的那一个。
   * 源码模式（CodeMirror）手里就是原文，**行号**精确；所见即所得这边是
   * ProseMirror 的**文档树**，树里根本没有"行"这个东西，只能用
   * "第几个标题"来数。`index` 在树里是可靠的（标题的**顺序**两边一致），
   * 而把行号换算成树位置得先序列化一遍、还得赌两边的解析完全一致——不值得。
   *
   * ⚠️ 落点用**文本选区（光标）不是 NodeSelection**：选中整个标题节点之后
   * 敲一个字会把标题整块替换掉，那种手感是"点一下跳过去，然后我打的第一
   * 个字把标题吃了"。光标放在标题内容起始处，打字只是插在标题文字前面。
   *
   * ⚠️ 找不到第 `index` 个标题时**什么都不做**（不抛错）：大纲是用正则扫的
   * 启发式（见 `ui/outline.ts` 文件头），而这里是真解析的结果，两者在
   * HTML 块、缩进代码块这些边角上会不一致。跳不过去就当没点过。
   */
  jumpToMarkTitle: (target: { line: number; index: number }) => void;

  /**
   * 当前选中的内容（`ui/useClipboard.ts` 的「复制」「剪切」要它）。
   *
   * ⚠️ 读的是**编辑器自己的选区**（ProseMirror 的 `state.selection`），
   * **不是** `window.getSelection()`：菜单是从窗口顶部点下去的，那一刻 DOM
   * 焦点已经挪到按钮上，浏览器那边的选区可能被收掉、也可能只报出半截；
   * 而编辑器 state 里那份是数据，焦点走了它还在原处。
   *
   * ⚠️ **空选区返回 `null`**，不是一对空串：调用方要能区分"没选中东西"
   *（该提示用户）和"选中了一段恰好为空的内容"（不存在这种事）。
   */
  selection: () => SelectionContent | null;

  /** 销毁。组件卸载时**必须**调，否则 ProseMirror 的 DOM 监听会留着。 */
  destroy: () => void;
}

export interface CreateOptions {
  /** 挂载点。 */
  root: HTMLElement;
  /** 初始内容。 */
  initialMarkdown: string;
  /**
   * 当前文档的完整路径（没存过盘就是 `null`）。
   *
   * ⚠️ 只用于**把图片地址显示成 asset URL**，不写回文档：绝对路径直接转换，
   * 相对路径以它所在目录为基准；节点 `attrs.src` 和存盘字节保持原样。
   */
  documentPath?: string | null;
  /**
   * 文档变化回调。**已经在 Milkdown 的 `updated` 钩子里**——
   * 调用方拿到后仍要做去抖（见 `docs/03` §真相在哪）。
   */
  onChange?: (markdown: string) => void;
  /**
   * 只读（分屏模式右侧那个预览窗格用）。
   *
   * ⚠️ 只读时**必须同时不接 `onChange`**——见 `EditorPane.tsx` 里那段
   * "谁的话算数"，只读窗格改不了文本，报变化只会制造回声。
   */
  readOnly?: boolean;
  /**
   * **严格模式**（`Settings.strict_markdown`，默认 `false`）。
   *
   * ⚠️ **它 2026-09-26 删过一回、2026-09-29 又回来的**，两次都是因为"正文
   * 该不该把 `#你好` 画成标题"这一件事。经过是：那层装饰先被用户否掉
   *（`#你好` 不许变位置变大小），于是所见即所得这一侧两种模式变得完全一样、
   * 这个选项没了用；接着用户 2026-09-29 又报「严格模式关闭后 `#标题` 还是
   * 无法正常显示」——查下来是**大纲、源码模式、标签页标题三处都认宽松标题、
   * 只有正文不认**。现在正文也认了（井号后面那段文字按该级标题的字号/字重
   * 排，见 `heading-on-enter.ts`），于是这个选项又有了一个消费者。
   *
   * ⚠️ **只喂给 `标题回车成块` 那一处**（决定宽松那条加不加）。严格模式
   * 另外还管着三处，都在别处：源码模式（`source.ts` 的 `atxPrefixRe`）、
   * 大纲（`ui/outline.ts`）、标签页标题（后端 `strip_atx`）——判据仍是
   * 一处（`atx.ts::atxTextRe`）。⚠️ 本文件这一处与源码模式那处都是
   * **建实例时捕获**的，所以 `EditorPane` 那个 effect 必须把 `strict`
   * 留在依赖里（切模式时编辑器要重建）。
   */
  strict?: boolean;
  /**
   * **数学公式里的 physics 宏包**（`Settings.enable_physics`，默认 `false`）。
   *
   * ⚠️ KaTeX **官方没有 physics**，所以这一档不是"加载一个扩展"，而是把
   * `math-macros.ts` 里那套**本仓自己写的宏定义**塞进 `katexOptionsCtx`
   * （`@milkdown/plugin-math` 渲染时会 `ctx.get()` 它交给 `katex.render`）。
   *
   * ⚠️ 改这个值要**重建编辑器**：KaTeX 的宏是渲染那一刻查表的，
   * 已经画出来的公式不会自己回头重画。所以它进了 `EditorPane` 那个
   * effect 的依赖（`strict` 也在那份依赖里，理由见上面那条注释）。
   */
  physics?: boolean;
  /**
   * 三种行内扩展语法开不开：**高亮** `==x==`、**上标** `^x^`、**下标** `~x~`
   *（`Settings.markdown` 的那三项，`ui/pane-editors.ts` 传进来）。
   *
   * ⚠️ **下划线不在里面**：它没有开关，恒开（写法是裸 HTML `<u>x</u>`，
   * 与 Typora 一致）。口径与理由在 `inline-marks.ts` 文件头。
   *
   * ⚠️ 改它要**重建编辑器**：解析那一侧的转换器是在建实例时捕获开关的。
   * 所以它进了 `EditorPane` 那个 effect 的依赖（与 `strict` / `physics`
   * 同一条口径——"设置像没生效"的毛病最难被当成 bug 报上来）。
   *
   * ⚠️ 但**序列化那一侧恒开**：用户关掉高亮之后打开一份老文件、再存盘，
   * 已经是 highlight 标记的那一段必须原样存回去。三种组合里只有"解析开着
   * 而序列化器不在"会吞掉标记，所以恒开是唯一安全的取法——完整的推理
   * 在 `inline-marks.ts` 的 `行内扩展开关` 那一格。
   */
  inlineMarks?: InlineExtensionFlags;
  /**
   * **智能标点**（`Settings.markdown` 里那一组，`ui/EditorPane.tsx` 传进来）。
   *
   * ⚠️ **改它要重建编辑器**：`Input` 档挂在 `.use()` 链上的那几条输入规则是
   * 建实例那一刻注册的（`EditorPane` 用 `要重建` 判要不要重挂）。理由与
   * `inlineMarks` / `physics` 同一条。
   *
   * ⚠️⚠️ **导出那一条路不许传它**。`editor/export.ts` 自己另建一个只读实例、
   * 直接取 `pm.innerHTML` 当导出结果，而 `Render` 档的装饰会往 DOM 里插一颗
   * widget ＋ 把原文压成 0 宽——传进去就等于让"仅显示时转换"**从后门漏进
   * 导出文件**，而那一档的全部承诺就是"一个字节都不写"。⚠️ 分屏右侧那个
   * 只读预览**要传**：它显示的是编辑区那一份的样子，与 `inlineMarks`
   * 同一条口径（那份 DOM 不拿去导出）。
   */
  punctuation?: punctuationSettings;
  /**
   * **自动更正**（`Settings.markdown.auto_correct`，2026-09-27 新加的一格）。
   *
   * ⚠️ 改它要**重建编辑器**（同 `inlineMarks` 的理由：输入规则是建实例时
   * 注册的）。⚠️ **默认取 `true`**——与 Rust 那边 `Default` 一致，
   * `undefined` 时不等于"关"。
   */
  selfActionMoreCorrect?: boolean;
  /**
   * **Emoji**：短代码替换（`:smile:` 敲完当场变 😄）＋ 输入补全面板
   * （打 `:smi` 弹出候选，上下键选）。
   *
   * ⚠️ **一个开关管两件事**（`Settings.editor.emoji_autocomplete`）：两件事
   * 都是"编辑器在用户的 emoji 输入上插手"，分成两个开关只会让用户遇到
   * "关掉一个还弹另一个"。⚠️ 两件事都只动**正在敲的那几个字符**——已有文本
   * 一个字节不改（短代码表里没有 `:x:` 这种形状的普通文本，且替换只在
   * 敲下词尾空白那一下发生）。
   *
   * ⚠️ 改它要**重建编辑器**（同 `自动更正`：输入规则是建实例那一刻注册的，
   * 补全面板那条插件也是）。⚠️ **默认取 `true`**——与 Rust 那边的 `Default`
   * 一致（`emoji_autocomplete` 默认开），`undefined` 不等于"关"。
   */
  emoji?: boolean;
  /**
   * **智能符号补全**（`Settings.editor.smart_symbols`，用户 2026-09-28 点名要的
   * 那个开关，**默认开**）：打一颗开符号当场补上它那一半（`(` `{` `（【「『《〈`
   * 与 **`[`**）、打一颗 `*` 自配对、`Tab` 跳出右半边、光标夹在一对**空的**
   * 括号里按退格两颗一起删。
   *
   * ⚠️ **四件事一个开关**，因为它们互相咬着：`Tab` 要跨过的那颗闭括号正是
   * 补出来的那一颗，拆成四个开关只会让用户遇到"关掉一个，另一半还在动"。
   * ⚠️ 关掉是**整条插件不装**（`配对处理(开)` 返回 `[]`，同 `标点输入` 那条），
   * 不是"补得少一点"。
   *
   * ⚠️ 改它要**重建编辑器**（同 `自动更正`：`handleTextInput` 是建实例那一刻
   * 注册的）。⚠️ **默认取 `true`**——与 Rust 那边 `Default` 一致，
   * `undefined` 不等于"关"。
   *
   * ⚠️ 它 2026-09-28 **取代了 `match_brackets` / `match_markdown` 两条死开关**
   * （存了值、从来没有代码读过），改这一格时不必回头兼容那两个名字。
   */
  smartAbleSymbolNumber?: boolean;
  /**
   * 光标状态变化的通知（工具栏高亮、菜单里表格那十条的灰/亮）。
   *
   * ⚠️ **不传就不挂那条插件**。只读那一侧（分屏的预览窗格）不需要它，
   * 传了也只是白算——预览窗格没有光标可言。
   */
  onCommandState?: (state: CommandState) => void;
  /**
   * 查找状态变化的通知（命中数、当前第几个）。**同样不传就不挂那条插件。**
   */
  onFindStatus?: (status: FindStatus) => void;
  /**
   * **选区变了**的通知（`caret-snapshot.ts`，2026-10-04 加，`docs/07` 第 14 项）。
   *
   * ⚠️ **不传就不挂那条插件**（同上面两条）。只读那一侧不挂——预览窗格没有
   * 选区可言。
   *
   * ⚠️ 它**只报"真的变了"**（那支插件自己按快照去重）：ProseMirror 每敲一颗
   * 字都会派一次事务，不去重的话这里就是"每敲一颗字跨一次 IPC"。
   * 传进来的已经是**去重之后**的那些次。
   */
  onSelection?: (snapshot: SelectionSnapshot) => void;
  /**
   * 建实例时两个写作开关（专注 / 打字机）的状态。**默认两个都关**。
   *
   * ⚠️ 它**不进** `EditorPane` 那个 effect 的依赖：拨开关走
   * `setWritingModes`，**不重建实例**——重建会丢撤销栈和光标，而这两个
   * 开关是写到一半才会想去拨的。这里只是"切编辑模式时新实例的初值"。
   */
  writingModes?: WritingMode;
  /**
   * 建实例时**已经开着**的那一份就地改动预览（`setReview` 的初值）。
   *
   * ⚠️ 和 `writingModes` 同一条道理：换文档、切模式都会**重建**编辑器，而
   * 预览可能正开着。不走这个口子的话，那一次重建会把预览吞掉——用户看到的
   * 是"切一下模式，改动预览没了"。
   */
  review?: changePreview | null;
  /**
   * 用户在正文里按 `Esc` 要退出预览时喊一声。
   *
   * ⚠️ 这一层**不自己收预览**：退出要走"放弃改动"那条插件命令（插件得清掉
   * 自己手里那份补丁），而那一整条链子在 `App.tsx` 手里。这里只报"他按了"。
   */
  onReviewEscape?: () => void;
}
