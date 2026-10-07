/**
 * 源码模式的编辑器（CodeMirror 6）。
 *
 * 源码模式：**看 Markdown 原文**。所见即所得那半
 * （`create.ts` 的 Milkdown）把标记藏进装饰层，写坏了就没法看原文——
 * 这是源码模式要补上的缺口（`docs/07` backlog 第 5 项）。
 *
 * # 为什么是 CodeMirror，不是 `<textarea>`
 *
 * `<textarea>` 零依赖，也能编辑文本，但它给不了两样**这里必须要的东西**：
 *
 * 1. **语法高亮**。源码模式的全部价值就是"看清楚 Markdown 结构"，
 *    一整块同色的等宽字并不比记事本强。
 * 2. **撤销栈与文档模型的分离**。`<textarea>` 的撤销是浏览器给的、
 *    按"一整块替换"记的——本仓每次从后端 `setMarkdown` 都会把它的撤销栈
 *    冲掉，而源码模式**经常**要重新装载（分屏里预览更新时也会走这条）。
 *
 * ⚠️ 用户 2026-09-23 说过「不要模仿它的编辑手感」——那条针对的是当初参照的
 * 那款编辑器（它的编辑方式不适用于本仓），不是说 CodeMirror 不许用。这里用 CM 是因为
 * 它是"能编辑文本 + 有语法高亮 + 撤销栈可控"里最省事的一个，**不是**因为
 * 谁用了它。
 *
 * # ⚠️ 与 Milkdown 的**立场分工**（分屏模式的关键）
 *
 * 分屏里两个窗格同时显示同一份文档，但**只有源码那一侧是权威**：
 *
 * ```text
 * 用户按键 → CodeMirror 文档 → 去抖 → 后端 sync
 *                           └→ 去抖 → 预览窗格整篇替换（只读）
 * ```
 *
 * **反向不接**。理由不是省事，是**往返会改字**：Milkdown 把 Markdown 解析成
 * 文档树再序列化回来，结果未必逐字节相同（尾段、空行、标记写法都被规范化，
 * 这正是 BUG-12 那两个根因候选之一）。两个窗格若互推，用户的原文会被另一侧
 * "改写"，而且**每次互相推都可能再规范一遍**——文本会抖。让只读的那一侧
 * 单向接收，这个循环根本不存在。
 *
 * # 颜色一并不写死
 *
 * 高亮与主题**全部走 `theme.css` / 文档主题已有的那些变量**（`--doc-bg`、
 * `--doc-fg`、`--code-*`、`--font-mono`）。所以：换文档主题，源码模式跟着变；
 * 换界面明暗，它也跟得上。**这里不新增任何一个颜色常量**——新增了就等于
 * 又开了一条会漂移的口径。
 */

import { defaultKeymap, history, historyKeymap } from "@codemirror/commands";
import { markdown } from "@codemirror/lang-markdown";
import { HighlightStyle, syntaxHighlighting } from "@codemirror/language";
import {
  Compartment,
  EditorState,
  StateEffect,
  StateField,
  type Extension,
} from "@codemirror/state";
import {
  Decoration,
  EditorView,
  drawSelection,
  highlightActiveLine,
  keymap,
  placeholder,
} from "@codemirror/view";
// ⚠️ 别名从 `t` 改成了 `tags`（2026-09-26）：本文件要用界面国际化的 `t`，
// 两个同名就重复声明了。改的是名字，不是用法。
import { tags } from "@lezer/highlight";

// 选区快照的**类型**（`docs/07` 第 14 项）。⚠️ 只借类型，实现在
// `caret-snapshot.ts`——那边的算法吃的是 ProseMirror 的 `EditorState`，
// 而这里手里是 CodeMirror 的文本，两边各算各的（见下面 `onSelection` 那条）。
import type { 选区快照 } from "@/editor/caret-snapshot";
// 撞车的默认键位（那份名单 2026-10-04 搬去 `editor/key-conflicts.ts` 了，
// 只为让**测试**读得到——BUG-58 就是漏了里面一条进来的，见那个文件头）。
import { 撞车键位 } from "@/editor/key-conflicts";
import type { CommandPayload, EditorCommand, 选区内容 } from "@/editor/create";
// 查找：这里只要**两个类型**（接口上的 `setFind` / `onFindStatus`）。
// 匹配的纯函数、状态、装饰都在别处：前者在 `find.ts`（一份匹配、两个适配器，
// 见它的文件头），后者在 `source-find.ts`。
import { type FindOptions, type FindStatus } from "@/editor/find";
// 查找的**机制**（状态 / 三条效果 / 装饰 / 两个小工具）。
// ⚠️ 2026-09-28 整块搬去 `source-find.ts` 的，因为本文件那天顶到了 1001 行、
// 撞上 `doc-sync-check.sh` 的 1000 行硬上限。名字与用法一字未改。
import {
  设查找效果,
  清查找效果,
  查找字段,
  查找装饰,
  查找状态,
  源码选中,
  走查找效果,
} from "@/editor/source-find";
// 命令落点（一条 `EditorCommand` → 一段文本改动）。⚠️ 2026-10-07 整块搬去
// `source-commands.ts` 的（本文件那天 1048 行，`docs/07` 第 89 项）：这边只剩
// 编辑器本身，那边只剩"命令怎么落到字符上"。两边都要改的时候**别两边都改**。
import { applyCommand } from "@/editor/source-commands";
// 写作模式（专注 / 打字机）。⚠️ 只借类型与两个 DOM 小工具，**装饰各写各的**
// ——源码里是平的行，没有"块的兄弟"可言（见 `writing-modes.ts` 顶上）。
import {
  专注类,
  亮行类,
  滚到正中,
  默认写作模式,
  type 写作模式,
} from "@/editor/writing-modes";
// 就地改动预览。⚠️ 算法与两种看法在 `review.ts` 里，这里只用它那一侧的
// 适配层（和上面那条写作模式同一个分工：**装饰各写各的**——源码里是平的行，
// 按行比；所见即所得那边按块比，见 `review-prose.ts`）。
import { 摘看法, 设看法, type 改动预览, type 预览看法 } from "@/editor/review";
// 就地改动预览那一侧的**装饰**（`Esc` 键位、只读舱的换挡都在那边）。
import { 预览扩展集, 预览效果 } from "@/editor/review-source";
// 界面文案。⚠️ 源码模式里有几处**写进文档的占位词**与一句空态提示，见下面用到的
// 那几行——正文本身当然不进翻译（那是用户的内容）。
import { t } from "@/i18n";

/** 源码编辑器的句柄。形状与 `EditorHandle` 对齐，`EditorPane` 才能两边通用。 */
export interface SourceHandle {
  /** 取当前文本。**同步**——存盘前那次强制同步靠它，不能是异步的。 */
  getMarkdown: () => string;
  /** 整篇替换。⚠️ 同样的文本**不碰**，否则会白冲一次撤销栈。 */
  setMarkdown: (markdown: string) => void;
  focus: () => void;
  /**
   * 焦点交给编辑区，**并把插入点放到文档开头**。
   *
   * ⚠️ 与 [`focus`] 分开的理由见 `EditorHandle.focusAtStart`（那边写得全）：
   * 那边是"每敲完一条命令都要回焦"的地方，不能顺手把光标拉回文首。
   * 源码这一侧光标本来就在 0（建实例时给的就是全文，`setMarkdown` 也显式
   * 把 `anchor` 设成 0），这一条只是为了**两条通路的形状一致**——
   * `EditorPane` 拿着 `EditorHandle | SourceHandle` 一个变量调，
   * 形状不齐就得在调用点写分支。
   */
  focusAtStart: () => void;
  /** 拨专注/打字机模式。**随时可拨，不重建实例**（见 `writing-modes.ts`）。 */
  setWritingModes: (模式: 写作模式) => void;
  /**
   * 摊开 / 收起**就地改动预览**。形状与理由同 `EditorHandle.setReview`
   * （那边写得全：按对象身份去重、看法只换 class）。
   */
  setReview: (预览: 改动预览 | null, 看法: 预览看法) => void;
  /** 跑一条编辑命令。**没有对应文本操作的返回 `false`**（见下）。 */
  runCommand: (name: EditorCommand, payload?: CommandPayload) => boolean;
  /**
   * 在光标处插一段（替换选区）。形状同 `EditorHandle.插入在光标处`
   * （`EditorPane` 才能两边通用）。
   *
   * ⚠️ 源码这一侧**直接就有**：CodeMirror 手里就是文本，`replaceSelection`
   * 一句话。⚠️ 而所见即所得那一侧要绕一圈的理由（为什么不能在 Rust 里
   * 按偏移拼字符串）**在那边**，见 `caret-snapshot.ts` 顶上那张表——
   * 这里必须存在，是因为插件的 `insert_at_cursor` 在源码模式下也得能用。
   */
  插入在光标处: (text: string) => boolean;
  /* 查找五条，形状与 `EditorHandle` 那五条**完全一致**（`EditorPane` 才能
   * 两边通用）。⚠️ 同那边的理由：它们不进 `EditorCommand` 那套白名单。 */
  setFind: (query: string, options: FindOptions) => void;
  findStep: (方向: 1 | -1) => void;
  clearFind: () => void;
  replaceCurrent: (text: string) => boolean;
  replaceAll: (text: string) => number;
  /** 当前选中的内容。形状同 `EditorHandle` 那条（`EditorPane` 才能两边通用）。 */
  选区: () => 选区内容 | null;
  /**
   * 跳到大纲里第 `index` 个标题。形状同 `EditorHandle` 那条
   * （`EditorPane` 才能两边通用），但**这里只用 `line`**。
   *
   * ⚠️ **源码模式用的是行号，所见即所得用的是序号**——两种编辑器手里是两套
   * 坐标，理由写在 `EditorHandle.跳到标题` 那段。这边拿到的是原文，
   * **行号是精确的**，序号反而不必用。
   */
  跳到标题: (目标: { line: number; index: number }) => void;
  destroy: () => void;
}

export interface CreateSourceOptions {
  root: HTMLElement;
  initialMarkdown: string;
  /** 文本变化回调。**不去抖**，与 `createEditor` 同口径：去抖是调用方的事。 */
  onChange?: (markdown: string) => void;
  /**
   * **选区变了**的通报（`docs/07` 第 14 项）。形状与 `CreateOptions.onSelection`
   * 一致，但**那边给的是 ProseMirror 的 `EditorState`、这边是 CodeMirror 的文本**，
   * 所以两边各算各的，只保证交出去的 `选区快照` 是同一个形状。
   *
   * ⚠️ 源码这一侧的 `text` 是**原文**（含 `**` 那些标记），所见即所得那一侧是
   * 纯文本——⚠️ 这是两种编辑器本来就不同的地方，不是漏了转换。
   */
  onSelection?: (快照: 选区快照) => void;
  /** 建实例时两个写作开关的状态。**默认两个都关**。 */
  writingModes?: 写作模式;
  /**
   * 建实例时**已经开着**的那一份就地改动预览。理由同 `create.ts` 那条：
   * 换文档、切模式会重建编辑器，预览可能正开着，别把它吞掉。
   */
  review?: 改动预览 | null;
  /** 用户在正文里按 `Esc` 要退出预览时喊一声。理由同 `create.ts` 那条。 */
  onReviewEscape?: () => void;
  /** 只读（分屏里右侧预览若改用它，会走这条路；今天预览仍是 Milkdown）。 */
  readOnly?: boolean;
  /**
   * **严格模式**（`Settings.strict_markdown`，默认 `false`）。
   *
   * ⚠️ 源码模式**不改文本**——CodeMirror 手里就是原文，没有"解析"这一步
   * （见文件头那段"往返会改字"）。所以这个开关在这里只影响**一条命令**：
   * 「标题 N / 正文」在行首该清掉多长一段（`#你好` 在宽松模式里已经算标题了）。
   *
   * ⚠️ **高亮**不受它影响：`@codemirror/lang-markdown` 是 lezer 的 CommonMark
   * 实现，`#你好` 在源码模式里始终按"普通段落"上色。这是**已知差异**，
   * 记在 `docs/07` 里，别以为忘了接。
   */
  strict?: boolean;
  /**
   * 查找状态变化的通知（命中数、当前第一个）。不传就不挂那条字段——
   * 分屏右侧的只读预览（今天仍走 Milkdown）与这里无关。
   */
  onFindStatus?: (status: FindStatus) => void;
  /**
   * **这不是一份 Markdown**（`editor/file-kind.ts::认文件类型`）。
   *
   * ⚠️ 它**只关掉 Markdown 文法与那套配色**，别的什么都不动：撤销栈、查找、
   * 写作模式、命令、存盘那条路全是同一套（源码模式对一份 `.py` 的职责就是
   * "能编辑、能存盘、一个字节不改"，`docs/07` 第 86 项）。
   *
   * ⚠️ **关掉是刻意的，不是"忘了给别的语言加文法"**：本仓只装了
   * `@codemirror/lang-markdown` 一门（`package.json`），没有别的语言的
   * CodeMirror 文法，也不许为这件事加依赖。拿 Markdown 去染一份 Python 比
   * 不上色更糟——`# 注释` 会变成标题色、`*args` 会变成斜体，那是一幅**错的画**。
   */
  纯文本?: boolean;
}

/* ── 高亮 ────────────────────────────────────────────────────────────────
 *
 * ⚠️ **一律 `var(--…)`，不写字面色值。** CM 的 `HighlightStyle` 最终会生成
 * 形如 `.cm-content .tok-x { color: … }` 的规则，写在文档里就能被
 * `doc-theme.ts` 的限域逻辑一起管；而写死一个 `#0969da` 之后，用户换一套
 * 深色文档主题就会得到"深底深字"。 */
const notaHighlight = HighlightStyle.define([
  { tag: tags.heading, color: "var(--accent)", fontWeight: "600" },
  { tag: tags.strong, fontWeight: "700" },
  { tag: tags.emphasis, fontStyle: "italic" },
  { tag: tags.strikethrough, textDecoration: "line-through" },
  { tag: tags.link, color: "var(--accent)", textDecoration: "underline" },
  { tag: tags.url, color: "var(--code-string)" },
  { tag: tags.quote, color: "var(--fg-muted)" },
  { tag: tags.list, color: "var(--accent)" },
  { tag: tags.monospace, color: "var(--code-string)" },
  { tag: tags.comment, color: "var(--code-comment)", fontStyle: "italic" },
  { tag: tags.keyword, color: "var(--code-keyword)" },
  { tag: tags.string, color: "var(--code-string)" },
  { tag: tags.number, color: "var(--code-number)" },
  { tag: tags.function(tags.variableName), color: "var(--code-function)" },
  { tag: tags.typeName, color: "var(--code-tag)" },
  { tag: tags.attributeName, color: "var(--code-attr)" },
  // ⚠️ 标记符（`#`、`**`、`>` 这些）**要能看见**，而且要比正文弱。
  // 源码模式的全部意义就是让它们可见——把它们也涂成正文色就白做了。
  { tag: tags.processingInstruction, color: "var(--fg-faint)" },
  { tag: tags.contentSeparator, color: "var(--fg-faint)" },
]);

/**
 * 编辑器外观。⚠️ 这里管的是**源码模式那一块**的盒模型与字体，
 * 颜色走变量（见上）。行高与字号故意与正文那侧**不一样**：
 * 源码是"代码"，紧凑一点更好扫。 */
const notaTheme = EditorView.theme({
  "&": {
    height: "100%",
    backgroundColor: "var(--doc-bg)",
    color: "var(--doc-fg)",
    fontSize: "var(--ui-font-size, 15px)",
  },
  ".cm-scroller": {
    fontFamily: "var(--font-mono)",
    lineHeight: "1.65",
    overflow: "auto",
  },
  ".cm-content": {
    padding: "24px 28px 120px",
    caretColor: "var(--accent)",
  },
  "&.cm-focused": { outline: "none" },
  ".cm-cursor, .cm-dropCursor": { borderLeftColor: "var(--accent)" },
  // ⚠️⚠️ **第一条选择器要照 CM 自己那条写全**
  // (`&.cm-focused > .cm-scroller > .cm-selectionLayer .cm-selectionBackground`，
  // 2026-10-07 开检查器量出来的)：只写到 `.cm-selectionBackground` 权重压不过
  // CM 出厂的那条聚焦色，**聚焦时画出来是它的淡紫 `#d7d4f0`**，不是这里的
  // `--bg-active`；而失焦那条权重相等、主题后到，落的又是 `--bg-active`——
  // 于是同一个选区"聚焦紫、失焦灰"。写全之后两条都归这里的色。
  "&.cm-focused > .cm-scroller > .cm-selectionLayer .cm-selectionBackground, .cm-selectionBackground, ::selection": {
    backgroundColor: "var(--bg-active)",
  },
  // ⚠️ 这条规则**只有在 `highlightActiveLine()` 装进 `extensions` 之后才会命中**
  // ——`cm-activeLine` 那个类名是那个扩展挂上去的，不装就永远没有元素带它。
  // 2026-10-07 之前就是这个状态：规则写在主题里、扩展一直没装，于是"当前行"
  // 这一档**从来没有生效过**，而看代码的人只会以为"这主题就长这样"。
  //
  // ⚠️⚠️ **必须挂 `&.cm-focused`**（2026-10-07 开窗量出来的）：CM 的那个扩展
  // **不看焦点**，光标在哪一行就给哪一行上色。而"编辑器没聚焦"是常态——焦点在
  // 侧栏、在查找条、在别的文档上时，那一行还亮着，读起来是"这里就是当前行"，
  // 而**当前根本没有任何一行是当前的**。所以只在拿到焦点时才画。
  //
  // ⚠️⚠️ **上面那条 `transparent` 不是多余的，删了立刻出样子**：CM 自己带一条
  // 出厂样式 `.cm-activeLine { background: #cceeff44 }`（淡蓝 27%），它**同样
  // 不看焦点**。挂了 `&.cm-focused` 之后，**没聚焦时反而会落到那条出厂色上**
  // ——也就是"越改越花"。这条按 (0,2,0) 把它压掉，下面那条按 (0,3,0) 再压住它。
  // ⚠️ 代码块那边有一条一模一样的配对（`code-block-cm.ts` 的 `主题`），
  // 改这里时**两处一起改**，不然一个地方淡蓝、一个地方是自己的色。
  // ⚠️⚠️ **底色必须是半透明的，不许写回 `var(--bg-subtle)`**（2026-10-07 开检查器
  // 量出来的）：CM 把选择层压在**行背景底下**（`.cm-selectionLayer` 的 z-index 是
  // 负的，CM 按层序自己算的），行背景一旦不透明，**落在光标那一行上的选区就被整条
  // 盖掉**——而拖选的结果永远落在光标那一行，看着就是"源码模式里选不中字"
  // （选区其实在：`Ctrl+C` 拿得到、检查器里 `.cm-selectionBackground` 也量得到，
  // 只是看不见）。半透明之后三层次序才对：淡底 ＜ 选中带 ＜ 文字。
  // ⚠️ 配方与代码块那边（`code-block-cm.ts` 的 `主题`）**一字不差**，改一起改。
  "& .cm-activeLine": { backgroundColor: "transparent" },
  "&.cm-focused .cm-activeLine": {
    backgroundColor: "color-mix(in srgb, var(--fg) 5%, transparent)",
  },
  ".cm-gutters": {
    backgroundColor: "transparent",
    color: "var(--fg-faint)",
    border: "none",
  },
  ".cm-placeholder": { color: "var(--fg-faint)" },
});


/* ── 写作模式（专注 / 打字机）─────────────────────────────────────────────
 *
 * ⚠️ 与所见即所得那一侧（`writing-modes.ts` 的 PM 插件）**只共享类型和两个
 * DOM 小工具**：那边的压暗是装饰算出来的，这边的压暗靠 CSS 的 `:not()`。
 * 理由（源码里是一行一行的，没有"块的兄弟"）写在 `writing-modes.ts` 顶上。
 */

const 写作模式效果 = StateEffect.define<写作模式>();

/**
 * 建一份**这个实例专属**的字段与装饰。
 *
 * ⚠️ 不能像查找那样写成模块级常量：初始值来自用户当前的模式开关
 * （切编辑模式会重建实例，那时开关可能已经是开着的），模块级常量就只能是
 * 一个所有实例共用的初值。函数式的写法让"建实例时开关是什么"如实生效。
 */
function 写作模式扩展(初始: 写作模式): { 字段: StateField<写作模式>; 扩展: Extension[] } {
  const 字段 = StateField.define<写作模式>({
    create: () => 初始,
    update(v, tr) {
      let 出 = v;
      for (const e of tr.effects) if (e.is(写作模式效果)) 出 = e.value;
      return 出;
    },
  });

  const 装饰 = EditorView.decorations.compute([字段], (state) => {
    const m = state.field(字段);
    if (!m.focus) return Decoration.none;
    // ⚠️ 只发**当前行**那一颗。其余行的压暗是 CSS 按根节点的 class 做的
    //（见 `writing-modes.ts` 里那两个常量）：给每一行都发一颗的话，
    // 装饰集的大小会随文档长度线性增长，而它每次事务都要重建一遍。
    const 行 = state.doc.lineAt(state.selection.main.head);
    return Decoration.set([Decoration.line({ class: 亮行类 }).range(行.from)]);
  });

  return { 字段, 扩展: [字段, 装饰] };
}

/* ⚠️ 就地改动预览（那一侧的装饰、`Esc` 键位、只读舱的用法）**不在这个文件里**
 * 了：2026-09-26 分到 `editor/review-source.ts`（这个文件当时一千行出头，
 * 见 `docs/09` §4 那一行）。这边只剩"接上它"：`setReview` 与建实例时那一份
 * 初值。**判据**：改动预览的代码只跟文档的**行**打交道，与源码模式其余部分
 * （查找、写作模式、发命令）之间没有共用状态，所以它能整块搬走。 */

/* ⚠️ `撞车键位` 那份名单 2026-10-04 搬去了 `editor/key-conflicts.ts`——
 * 理由只有一个：**让测试读得到**（BUG-58 就是漏了 `Mod-u` 那一条进来的，
 * 见那个文件头）。这一边只剩"用它"：建实例时把撞车的默认键位滤掉。 */

/** 建一个源码编辑器。**同步返回**——CodeMirror 不需要异步初始化。 */
export function createSourceEditor(options: CreateSourceOptions): SourceHandle {
  const {
    root,
    initialMarkdown,
    onChange,
    onSelection,
    readOnly = false,
    strict = false,
    onFindStatus,
    纯文本 = false,
    writingModes = 默认写作模式,
    review = null,
    onReviewEscape,
  } = options;

  /** 上一次报出去的查找签名。**每个实例一份**（这个闭包在函数体里）。 */
  let 上次查找签名 = "";
  /**
   * 上一次报出去的选区快照的签名。
   *
   * ⚠️ 必须自己记：`updateListener` 每次按键、每次点鼠标都会走一遍，
   * 不去重就是"光标每动一下跨一次 IPC"。所见即所得那一侧的去重在
   * `caret-snapshot.ts` 的插件里（同一套写法，只是一边在插件里、一边在这里）。
   */
  let 上次快照签名 = "";
  /** 同上的写法：打字机模式要判"这次是不是刚打开的"。 */
  let 上次模式: 写作模式 = writingModes;
  const { 字段: 写作字段, 扩展: 写作扩展 } = 写作模式扩展(writingModes);
  /** 同上的写法：预览按**对象身份**去重（切看法不该重算装饰）。 */
  let 上次预览: 改动预览 | null = review ?? null;
  const { 扩展: 预览扩展 } = 预览扩展集(review ?? null, onReviewEscape);

  /**
   * 只读那两件单独住一间"舱"（`Compartment`）：改动预览期间要**临时**把
   * 正文锁成只读。
   *
   * ⚠️ 不能"再叠一份 `readOnly.of(true)`"上去：`readOnly` 与 `editable` 这两个
   * facet 的合并规则都是 `values[0]`（**先写的那个说了算**，`@codemirror/state`
   * 里就是 `combine: values => values.length ? values[0] : false`），叠一份
   * 谁赢全看它在数组里的位置——那是"改一处忘一处"的典型形状。整组换掉才准。
   */
  const 只读舱 = new Compartment();
  const 只读扩展 = (锁: boolean): Extension[] => [
    EditorState.readOnly.of(锁),
    EditorView.editable.of(!锁),
  ];

  const extensions: Extension[] = [
    history(),
    drawSelection(),
    // 当前行那一层淡底（配色在 `notaTheme` 里那条 `.cm-activeLine`）。
    // ⚠️ **排在最前**是有意的：它只加一条 `Decoration.line`，不碰键位、不碰
    // 文档，所以顺序上无争——但放在 `keymap` 后面会让人以为它和键位有关。
    highlightActiveLine(),
    // ⚠️ 非 Markdown 的文件**两样都不挂**：文法与它配套的那套配色是**一对**
    // ——只挂配色而不挂文法，`notaHighlight` 里那些 tag 一个都不会命中，
    // 结果是"看起来生效了、其实什么都没变"，下次有人来查会白花时间。
    ...(纯文本 ? [] : [markdown(), syntaxHighlighting(notaHighlight)]),
    notaTheme,
    // ⚠️ 那两个 `filter` 不是画蛇添足：CodeMirror 的默认键位会和本应用的
    // 快捷键**同时**触发（理由与逐条对照见上面 `撞车键位`），摘掉撞车的那些。
    keymap.of(
      [...defaultKeymap, ...historyKeymap].filter((b) => !撞车键位.has(b.key ?? "")),
    ),
    EditorView.updateListener.of((u) => {
      // 查找状态先报（`docChanged` 时它会重算，签名变了就要通知界面）。
      // ⚠️ 这一句必须在下面那个 `if (!u.docChanged) return` **之前**：
      // "走到下一个命中"只改选区、不改文档，放后面就永远报不出去，
      // 界面上的"第 3 / 7 个"会一直停着不动。
      const s = u.state.field(查找字段, false);
      if (onFindStatus && s) {
        const status = 查找状态(s);
        const sig = `${status.query}|${status.total}|${status.current}`;
        if (sig !== 上次查找签名) {
          上次查找签名 = sig;
          onFindStatus(status);
        }
      }

      // 写作模式（专注 / 打字机）。⚠️ 也在 `if (!u.docChanged) return` 之前：
      // 打字机模式跟的是**光标**，而"光标往下走一行"不改文档。
      const 模式 = u.state.field(写作字段);
      u.view.dom.classList.toggle(专注类, 模式.focus);
      // 「刚打开」也要滚一次：不然开关拨开了，当前行还停在屏幕边上，
      // 用户得先打个字才看得到效果——那看起来就像开关没生效。
      const 刚开 = 模式.typewriter && !上次模式.typewriter;
      if (模式.typewriter && (刚开 || u.selectionSet || u.docChanged)) {
        // ⚠️ CM 的 `coordsAtPos` 可能给 `null`（位置上没有可测的 DOM，
        // 比如刚删空的一行）。给它一个"这次不滚"，别让它把异常抛进事务里。
        const 位 = u.view.coordsAtPos(u.state.selection.main.head);
        if (位) 滚到正中(u.view.scrollDOM, 位.top, 位.bottom);
      }
      上次模式 = 模式;

      // 选区快照（`docs/07` 第 14 项）。⚠️ 也在 `if (!u.docChanged) return`
      // **之前**：光挪光标不改文档，而"用户选中了什么"正是要靠这一条报出去。
      // ⚠️ 本仓的 `选区快照` 是纯值比较，所以这里自己按签名去重——
      // CodeMirror 每次按键/每次点鼠标都会走一遍 `updateListener`。
      if (onSelection) {
        const { from, to } = u.state.selection.main;
        const text = from === to ? "" : u.state.sliceDoc(from, to);
        const sig = `${from === to ? 1 : 0}|${text}`;
        if (sig !== 上次快照签名) {
          上次快照签名 = sig;
          onSelection({ text, empty: from === to });
        }
      }

      if (!u.docChanged) return;
      // ⚠️ 不带 `userEvent` 的过滤：本文件里所有 `dispatch` 都是"用户意图"
      // （命令、粘贴、打字），没有"程序性回填"——整篇替换走 `setMarkdown`，
      // 那条**不派发**（见下）。
      onChange?.(u.state.doc.toString());
    }),
    // 只读那两件。⚠️ 走舱，理由见 `只读舱` 那段。
    只读舱.of(只读扩展(readOnly)),
  ];
  if (!readOnly) extensions.push(placeholder(t("Write your Markdown here…")));
  // ⚠️ 查找那一套**只在可编辑的那一份上挂**：只读预览窗格没有查找可言，
  // 挂了也只是白算一遍匹配（同 `create.ts` 那边"不传就不挂"的口径）。
  if (!readOnly && onFindStatus) extensions.push(查找字段, 查找装饰);
  // 写作模式**恒挂**（可编辑的那一份）：两个开关随时可能被拨，而插件清单
  // 一旦绑进 `EditorPane` 的依赖，拨一下开关就得把编辑器整个重建——
  // 那会丢掉撤销栈和光标，写在半句话中间时尤其难受。
  if (!readOnly) extensions.push(...写作扩展);
  // 预览**恒挂**（可编辑那一份）：随时可能被插件喊起来，同 `create.ts` 那条。
  // ⚠️ 只读实例不挂——那边既没有插件能喊它，也没有"接受改动"可言。
  if (!readOnly) extensions.push(...预览扩展);

  const view = new EditorView({
    state: EditorState.create({ doc: initialMarkdown, extensions }),
    parent: root,
  });

  return {
    getMarkdown: () => view.state.doc.toString(),

    setMarkdown: (md: string) => {
      // ⚠️ **相同文本必须早退。** 不去重的话，分屏里预览每次同步回来都会
      // 再派发一笔事务，撤销栈被一层层冲掉——用户按 Ctrl+Z 会发现"撤销
      // 什么都没发生"。
      if (md === view.state.doc.toString()) return;
      view.dispatch({
        changes: { from: 0, to: view.state.doc.length, insert: md },
        // 整篇替换后把光标放到开头，别让它停在原来的行号上（文本已经换了，
        // 那个行号可能指向一个完全不同的地方）。
        selection: { anchor: 0 },
        scrollIntoView: true,
      });
    },

    focus: () => view.focus(),
    focusAtStart: () => {
      view.dispatch({ selection: { anchor: 0 }, scrollIntoView: true });
      view.focus();
    },
    setReview: (预览: 改动预览 | null, 看法: 预览看法) => {
      // ⚠️ 只有**预览换了**才派事务（切看法是纯 CSS 的开关，不值得重算一遍
      // 行差异）。同 `create.ts` 那条。
      if (预览 !== 上次预览) {
        上次预览 = 预览;
        view.dispatch({
          effects: [
            预览效果.of(预览),
            // 预览期正文锁成只读。⚠️ `readOnly ||` 那个或不能少：只读的实例
            // 本来就不许改，收预览时别把它解锁了。
            只读舱.reconfigure(只读扩展(readOnly || 预览 !== null)),
          ],
        });
      }
      if (预览) 设看法(view.dom, 看法);
      else 摘看法(view.dom);
    },

    setWritingModes: (模式: 写作模式) => {
      view.dispatch({ effects: 写作模式效果.of(模式) });
      // ⚠️ 打开专注模式那一刻要**自己补一次 class**：`updateListener` 只在
      // 事务之后跑，而这里刚刚派了一笔——它会跑到，所以下面这句是给
      // "模式没变、只是重新设一遍"那种情况的兜底，代价可以忽略。
      view.dom.classList.toggle(专注类, 模式.focus);
      if (模式.typewriter) {
        const 位 = view.coordsAtPos(view.state.selection.main.head);
        if (位) 滚到正中(view.scrollDOM, 位.top, 位.bottom);
      }
    },
    runCommand: (name: EditorCommand, payload?: CommandPayload) =>
      applyCommand(view, name, strict, payload),

    // ⚠️ `replaceSelection`：选区非空时是**替换**，空选区是插入——与
    // `create.ts` 那一侧 `tr.insertText(text, from, to)` 同一个语义。
    // ⚠️ 这一侧没有 `readOnly` 那回事：`createSourceEditor` 只给可编辑的
    // 正文建（分屏右侧是所见即所得那一路的只读实例），所以恒 `true`。
    插入在光标处: (text: string) => {
      const { from, to } = view.state.selection.main;
      view.dispatch({ changes: { from, to, insert: text } });
      return true;
    },

    // ⚠️ `html` 给空串，**不是**"把 markdown 原文包一层 `<pre>`"：源码模式
    // 手里只有文本，硬凑一份 HTML 会让"复制"粘到别处时看起来像富文本，
    // 而那份 HTML 是我们编的、不是编辑器给的。空串 = 如实说明给不出，
    // 调用方（`ui/useClipboard.ts`）据此只写纯文本那一半。
    选区: () => {
      const { from, to } = view.state.selection.main;
      if (from === to) return null;
      return { text: view.state.sliceDoc(from, to), html: "" };
    },

    跳到标题: ({ line }) => {
      // ⚠️ CodeMirror 的行号是 **1 起**，大纲给的是 **0 起**；越界一律夹回
      // 合法范围而不是提前返回——差一行也要跳，比"点了没反应"强。
      const n = Math.min(Math.max(line + 1, 1), view.state.doc.lines);
      const t = view.state.doc.line(n);
      // ⚠️ 用 `EditorView.scrollIntoView` 这个 **effect** 并指定 `y: "start"`，
      // 不用事务上的 `scrollIntoView: true`：后者只保证"能看见"，往下跳时
      // 标题会落在视野**底边**（2026-09-25 实测）。所见即所得那一侧是把标题
      // 顶到视野**顶部**（见 `scroll-into-view.ts`），两边手感得是一个。
      // `yMargin` 与那边的 `顶部间隙` 取同一个数。
      view.dispatch({
        selection: { anchor: t.from },
        effects: EditorView.scrollIntoView(t.from, { y: "start", yMargin: 8 }),
      });
      // 焦点交给正文，口径同所见即所得那一侧：点了大纲就要接着写。
      view.focus();
    },

    /* ── 查找五条。读状态一律走 `view.state.field(查找字段)` ──────────── */

    setFind: (query: string, options: FindOptions) => {
      view.dispatch({ effects: 设查找效果.of({ query, options }) });
      // 设完立刻选中第一个命中（同 `find.ts` 里那条：只画高亮不移动光标的话，
      // 用户按「下一个」会从"第一个"跳到"第二个"，看起来跳过了开头那个）。
      const s = view.state.field(查找字段);
      if (s.index >= 0) 源码选中(view, s.matches[s.index]!);
    },

    findStep: (方向: 1 | -1) => {
      if (view.state.field(查找字段).matches.length === 0) return;
      view.dispatch({ effects: 走查找效果.of(方向) });
      const s = view.state.field(查找字段);
      if (s.index >= 0) 源码选中(view, s.matches[s.index]!);
    },

    clearFind: () => {
      view.dispatch({ effects: 清查找效果.of(null) });
    },

    replaceCurrent: (text: string) => {
      const s = view.state.field(查找字段);
      if (s.index < 0) return false;
      const m = s.matches[s.index]!;
      view.dispatch({ changes: { from: m.start, to: m.end, insert: text } });
      // 换完重读一次：命中表已经重算了，`index` 那一格现在指着**下一个**。
      const 后 = view.state.field(查找字段);
      if (后.index >= 0 && 后.matches[后.index]) 源码选中(view, 后.matches[后.index]!);
      return true;
    },

    replaceAll: (text: string) => {
      const s = view.state.field(查找字段);
      if (s.matches.length === 0) return 0;
      // ⚠️ **从后往前换**，理由同 `find.ts` 里那条：替换文本长度与原文不一定
      // 一样，从前往后换会把后面所有命中的位置推着走。CM 的 `changes` 数组
      // 里各段必须互不重叠且有序，从后往前正好满足。
      view.dispatch({
        changes: [...s.matches].reverse().map((m) => ({
          from: m.start,
          to: m.end,
          insert: text,
        })),
      });
      return s.matches.length;
    },

    destroy: () => view.destroy(),
  };
}
