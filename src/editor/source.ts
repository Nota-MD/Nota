/**
 * 源码模式的编辑器（CodeMirror 6）。
 *
 * 对标 Typora 的 Source Code Mode：**看 Markdown 原文**。所见即所得那半
 * （`create.ts` 的 Milkdown）把标记藏进装饰层，写坏了就没法看原文——
 * 这是 Typora 用户会立刻发现的一个缺口（`docs/07` backlog 第 5 项）。
 *
 * # 为什么是 CodeMirror，不是 `<textarea>`
 *
 * `<textarea>` 零依赖，也能编辑文本，但它给不了两样**这里必须要的东西**：
 *
 * 1. **语法高亮**。源码模式的全部价值就是"看清楚 Markdown 结构"，
 *    一整块同色的等宽字并不比记事本强。
 * 2. **撤销栈与文档模型的分离**。`<textarea>` 的撤销是浏览器给的、
 *    按"一整块替换"记的——我们每次从后端 `setMarkdown` 都会把它的撤销栈
 *    冲掉，而源码模式恰恰**经常**要重新装载（分屏里预览更新时也会走这条）。
 *
 * ⚠️ 用户 2026-09-23 说过「不要模仿它的编辑手感」——那说的是**对标对象
 * VMark**（它的编辑手感很差），不是说不许用 CodeMirror。这里用 CM 是因为
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

import {
  defaultKeymap,
  history,
  historyKeymap,
  redo,
  undo,
} from "@codemirror/commands";
import { markdown } from "@codemirror/lang-markdown";
import { HighlightStyle, syntaxHighlighting } from "@codemirror/language";
import { EditorState, StateEffect, StateField, type Extension } from "@codemirror/state";
import { Decoration, EditorView, drawSelection, keymap, placeholder } from "@codemirror/view";
import { tags as t } from "@lezer/highlight";

import { atxPrefixRe } from "@/editor/atx";
import type { CommandPayload, EditorCommand } from "@/editor/create";
// 查找：**匹配逻辑不在这里**，只借它那个纯函数（见 `find.ts` 文件头：
// 一份匹配、两个适配器）。源码模式的偏移量就是文档偏移，所以这里不用
// 再走一遍文档树。
import {
  在文本里找匹配,
  默认查找选项,
  type FindOptions,
  type FindStatus,
  type 文本命中,
} from "@/editor/find";
// 写作模式（专注 / 打字机）。⚠️ 只借类型与两个 DOM 小工具，**装饰各写各的**
// ——源码里是平的行，没有"块的兄弟"可言（见 `writing-modes.ts` 顶上）。
import {
  专注类,
  亮行类,
  滚到正中,
  默认写作模式,
  type 写作模式,
} from "@/editor/writing-modes";

/** 源码编辑器的句柄。形状与 `EditorHandle` 对齐，`EditorPane` 才能两边通用。 */
export interface SourceHandle {
  /** 取当前文本。**同步**——存盘前那次强制同步靠它，不能是异步的。 */
  getMarkdown: () => string;
  /** 整篇替换。⚠️ 同样的文本**不碰**，否则会白冲一次撤销栈。 */
  setMarkdown: (markdown: string) => void;
  focus: () => void;
  /** 拨专注/打字机模式。**随时可拨，不重建实例**（见 `writing-modes.ts`）。 */
  setWritingModes: (模式: 写作模式) => void;
  /** 跑一条编辑命令。**没有对应文本操作的返回 `false`**（见下）。 */
  runCommand: (name: EditorCommand, payload?: CommandPayload) => boolean;
  /* 查找五条，形状与 `EditorHandle` 那五条**完全一致**（`EditorPane` 才能
   * 两边通用）。⚠️ 同那边的理由：它们不进 `EditorCommand` 那套白名单。 */
  setFind: (query: string, options: FindOptions) => void;
  findStep: (方向: 1 | -1) => void;
  clearFind: () => void;
  replaceCurrent: (text: string) => boolean;
  replaceAll: (text: string) => number;
  destroy: () => void;
}

export interface CreateSourceOptions {
  root: HTMLElement;
  initialMarkdown: string;
  /** 文本变化回调。**不去抖**，与 `createEditor` 同口径：去抖是调用方的事。 */
  onChange?: (markdown: string) => void;
  /** 建实例时两个写作开关的状态。**默认两个都关**。 */
  writingModes?: 写作模式;
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
   * 查找状态变化的通知（命中数、当前第几个）。不传就不挂那条字段——
   * 分屏右侧的只读预览（今天仍走 Milkdown）与这里无关。
   */
  onFindStatus?: (status: FindStatus) => void;
}

/* ── 高亮 ────────────────────────────────────────────────────────────────
 *
 * ⚠️ **一律 `var(--…)`，不写字面色值。** CM 的 `HighlightStyle` 最终会生成
 * 形如 `.cm-content .tok-x { color: … }` 的规则，写在文档里就能被
 * `doc-theme.ts` 的限域逻辑一起管；而写死一个 `#0969da` 之后，用户换一套
 * 深色文档主题就会得到"深底深字"。 */
const notaHighlight = HighlightStyle.define([
  { tag: t.heading, color: "var(--accent)", fontWeight: "600" },
  { tag: t.strong, fontWeight: "700" },
  { tag: t.emphasis, fontStyle: "italic" },
  { tag: t.strikethrough, textDecoration: "line-through" },
  { tag: t.link, color: "var(--accent)", textDecoration: "underline" },
  { tag: t.url, color: "var(--code-string)" },
  { tag: t.quote, color: "var(--fg-muted)" },
  { tag: t.list, color: "var(--accent)" },
  { tag: t.monospace, color: "var(--code-string)" },
  { tag: t.comment, color: "var(--code-comment)", fontStyle: "italic" },
  { tag: t.keyword, color: "var(--code-keyword)" },
  { tag: t.string, color: "var(--code-string)" },
  { tag: t.number, color: "var(--code-number)" },
  { tag: t.function(t.variableName), color: "var(--code-function)" },
  { tag: t.typeName, color: "var(--code-tag)" },
  { tag: t.attributeName, color: "var(--code-attr)" },
  // ⚠️ 标记符（`#`、`**`、`>` 这些）**要能看见**，而且要比正文弱。
  // 源码模式的全部意义就是让它们可见——把它们也涂成正文色就白做了。
  { tag: t.processingInstruction, color: "var(--fg-faint)" },
  { tag: t.contentSeparator, color: "var(--fg-faint)" },
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
  "&.cm-focused .cm-selectionBackground, .cm-selectionBackground, ::selection": {
    backgroundColor: "var(--bg-active)",
  },
  ".cm-activeLine": { backgroundColor: "var(--bg-subtle)" },
  ".cm-gutters": {
    backgroundColor: "transparent",
    color: "var(--fg-faint)",
    border: "none",
  },
  ".cm-placeholder": { color: "var(--fg-faint)" },
});

/* ── 文本操作 ────────────────────────────────────────────────────────────
 *
 * ⚠️ 全部走 `view.dispatch({ changes })`，**不直接改 DOM**。
 * CM 的文档是它自己的数据结构，绕过去写 DOM 会被下一次重绘冲掉——
 * 和 ProseMirror 那边同一条纪律。 */

/**
 * 行首可以"独占"的标记族。切换时先清掉同族旧标记，再写新的。
 *
 * ⚠️ **标题那一族不在这里**：它的正则随「严格模式」变（宽松模式里 `#你好`
 * 也已经算标题），所以由 `atx.ts` 的 `atxPrefixRe(strict)` 现算。表里只剩
 * 与模式无关的四族。
 */
const LINE_PREFIXES: Record<string, RegExp> = {
  // 引用：允许嵌套，所以 `> > ` 也算
  quote: /^(?:> ?)+/,
  // 无序列表：`- ` / `* ` / `+ `
  bullet: /^[-*+] +/,
  // 有序列表：`1. ` / `12) `
  ordered: /^\d+[.)] +/,
  // 任务项。⚠️ 两条可选写法**在一条正则里按长短排**：`- [x] 文字` 同时匹配
  // "任务"和"无序"，短的先试就会把 `[x]` 留下，转出来是个内容为 `[x] 文字`
  // 的普通列表项。正则的 `|` 从左往右试，所以长的写在左边就够了。
  task: /^(?:[-*+] +\[[ xX]\] +|[-*+] +)/,
};

/** 选区覆盖到的每一行的起止位置（含边界行）。 */
function selectedLines(
  view: EditorView,
): Array<{ from: number; to: number }> {
  const { from, to } = view.state.selection.main;
  const out: Array<{ from: number; to: number }> = [];
  const doc = view.state.doc;
  let line = doc.lineAt(from);
  const last = doc.lineAt(to);
  for (;;) {
    out.push({ from: line.from, to: line.to });
    if (line.number >= last.number) break;
    line = doc.line(line.number + 1);
  }
  return out;
}

/** 把每一行的行首标记换成 `prefix`（`prefix` 为 `null` 表示只清不写）。 */
function setLinePrefix(
  view: EditorView,
  family: string,
  prefix: string | null,
  strict: boolean,
): void {
  // 标题那一族现算（见 `LINE_PREFIXES` 的注释）。
  const re = family === "heading" ? atxPrefixRe(strict) : LINE_PREFIXES[family];
  if (!re) return;
  const changes: Array<{ from: number; to: number; insert: string }> = [];
  for (const line of selectedLines(view)) {
    const text = view.state.doc.sliceString(line.from, line.to);
    const hit = re.exec(text);
    const stripped = hit ? text.slice(hit[0].length) : text;
    const want = prefix === null ? stripped : prefix + stripped;
    if (want === text) continue;
    // ⚠️ 空行不写标记：给一个空行加 `# ` 会凭空造出一个标题。
    // 但**清标记**要照做（否则"转成正文"在空标题行上不生效）。
    if (prefix !== null && stripped.trim() === "") continue;
    changes.push({ from: line.from, to: line.to, insert: want });
  }
  if (changes.length === 0) return;
  view.dispatch({ changes });
}

/** 把选区包进 `before`/`after`；没选东西就插一个占位词并选中它。 */
function wrapSelection(
  view: EditorView,
  before: string,
  after: string,
  placeholderText: string,
): void {
  const { from, to } = view.state.selection.main;
  const picked = view.state.sliceDoc(from, to);
  const body = picked || placeholderText;
  view.dispatch({
    changes: { from, to, insert: `${before}${body}${after}` },
    // 选中正文那段，用户可以直接接着改。空选区时就是选中占位词。
    selection: { anchor: from + before.length, head: from + before.length + body.length },
  });
}

/**
 * 把选区里的**行内标记**去掉，文字一个字不动（对应「格式 → 清除样式」）。
 *
 * ⚠️ 这是个**文本级**的近似，不是文档树级的操作（源码模式本来就没有文档树）。
 * 它只认几种最常见的写法，认不出来的一律**原样留着**——宁可少清一点，
 * 也不要把用户正文里的 `*` 或 `_` 当成标记吃掉。
 *
 * ⚠️ 正则里的 `[\s\S]` 而不是 `.`：选区里**可能跨行**，而 `.` 默认不匹配
 * 换行；用 `.` 的话跨行的粗体会整段漏掉。
 */
function 清除行内标记(view: EditorView): void {
  const { from, to } = view.state.selection.main;
  if (from === to) return;
  const 原 = view.state.sliceDoc(from, to);
  const 净 = 原
    // ⚠️ **图片必须排在链接前面**：`![替代文字](地址)` 里也含着一个
    // `[替代文字](地址)`，链接那条先跑的话会把它削成 `!替代文字`，
    // 多出一个叹号——而叹号再也回不去了。
    .replace(/!\[([\s\S]*?)\]\([^)\s]*\)/g, "$1")
    // 链接：`[文字](地址)` → `文字`。⚠️ 也排在最前面那一批——地址里的字符
    // （比如 `*`）先被后面的规则吃掉的话，这条就再也匹配不上了。
    .replace(/\[([\s\S]*?)\]\([^)\s]*\)/g, "$1")
    .replace(/\*\*([\s\S]+?)\*\*/g, "$1")
    .replace(/~~([\s\S]+?)~~/g, "$1")
    .replace(/`([^`]+)`/g, "$1")
    // 单星号/单下划线**放在最后**：上面几条都是成对的，先跑完它们，
    // 剩下的单星号才可能是斜体。顺序反了会把 `**x**` 拆成 `*x*` 再拆成 `x`
    // 是没错，但也会把 `***x***` 拆坏。
    .replace(/\*([^*\n]+?)\*/g, "$1")
    .replace(/(^|[\s(])_([^_\n]+?)_(?=[\s).,，。]|$)/g, "$1$2");
  if (净 === 原) return;
  view.dispatch({ changes: { from, to, insert: 净 } });
}

/** 在光标处插一段文字（图片用：它没有"包一层"这种形态）。 */
function insertAtCursor(view: EditorView, text: string): void {
  const { from, to } = view.state.selection.main;
  view.dispatch({
    changes: { from, to, insert: text },
    selection: { anchor: from + text.length },
  });
}

/** 在光标处另起一块，把光标放到内容位置。`$0` 是落点。 */
function insertBlock(view: EditorView, text: string): void {
  const { from, to } = view.state.selection.main;
  const at = view.state.doc.lineAt(from);
  // 光标不在行首时先补一个换行，免得插进半句话中间。
  const needsBreak = at.from !== from;
  const body = (needsBreak ? "\n" : "") + text;
  const offset = body.indexOf("$0");
  const insert = offset >= 0 ? body.replace("$0", "") : body;
  view.dispatch({
    changes: { from, to, insert },
    selection: { anchor: offset >= 0 ? from + offset : from + insert.length },
  });
}

/**
 * 把一条 `EditorCommand` 落到文本上。
 *
 * # 哪些能做、哪些不能
 *
 * **绝大多数能**——源码模式下每条命令都表达成一个纯文本操作（加粗就是包两个
 * 星号），所以这里**尽量做全**。若动不动就返回 `false`，`App.tsx` 就得为源码
 * 模式单独维护一张"哪些能用"的表，那又是一份会漂移的清单。
 *
 * ⚠️ **但表格那十条（插行/插列/删行/删列/删表/对齐）是真的做不到**，
 * 理由不是"懒得写"，是**语义对不上**：`**粗体**` 在文本上就是四个字符，
 * 而"删掉这一行"要先知道"哪一行、这一行有几个格子、表格从哪到哪"——
 * 那等于在文本模式里把 markdown 表格重新解析一遍，而解析出来之后
 * **改哪个字符**又取决于对齐写法（`| :--- |` 那一段也要跟着动）。
 * 半吊子的实现会**悄悄改坏用户的表格**，那比认输差得多。
 *
 * 所以返回 `false` 的含义是：**这条命令在这条通路上没有对应的文本操作**。
 * 调用方（`ui/EditorPane.tsx`）据此给用户一句提示，而不是让按钮按下去
 * 毫无反应。⚠️ 名字拼错（代码写错了）走的也是这一条，两者在返回值上
 * **不区分**——区分不了，也不必区分：对用户来说都是"这一下没生效"。
 */
function applyCommand(
  view: EditorView,
  name: EditorCommand,
  strict: boolean,
  payload?: CommandPayload,
): boolean {
  switch (name) {
    case "undo":
      undo(view);
      return true;
    case "redo":
      redo(view);
      return true;
    case "bold":
      wrapSelection(view, "**", "**", "粗体");
      return true;
    case "italic":
      wrapSelection(view, "*", "*", "斜体");
      return true;
    case "strike":
      wrapSelection(view, "~~", "~~", "删除线");
      return true;
    case "inlineCode":
      wrapSelection(view, "`", "`", "代码");
      return true;
    // 标题：`text` 是"正文段落"，也就是清掉标题标记。
    case "h1":
    case "h2":
    case "h3":
    case "h4":
    case "h5":
    case "h6": {
      const level = Number(name.slice(1));
      setLinePrefix(view, "heading", "#".repeat(level) + " ", strict);
      return true;
    }
    case "text":
      setLinePrefix(view, "heading", null, strict);
      return true;
    case "quote":
      setLinePrefix(view, "quote", "> ", strict);
      return true;
    case "ul":
      setLinePrefix(view, "bullet", "- ", strict);
      return true;
    case "ol":
      setLinePrefix(view, "ordered", "1. ", strict);
      return true;
    case "task":
      setLinePrefix(view, "task", "- [ ] ", strict);
      return true;
    case "hr":
      insertBlock(view, "\n---\n$0");
      return true;
    case "codeBlock":
      insertBlock(view, "\n```\n$0\n```\n");
      return true;
    case "table":
      // 与所见即所得那边插出来的表**同形**（三行三列，表头 + 两行正文，
      // 与 `create.ts` 里 `insertTableCommand` 的 `{ row: 3, col: 3 }` 对齐）。
      // 两边不一致的话，同一条菜单在两种模式下插出来的东西不一样——
      // 而用户多半不会想到"表格形状还跟模式有关"。
      insertBlock(view, "\n| 列 1 | 列 2 | 列 3 |\n| --- | --- | --- |\n| $0 |  |  |\n|  |  |  |\n");
      return true;
    // 链接与图片：地址**从外面进来**（界面先问用户，见 `ui/PromptDialog.tsx`）。
    // 真的没有地址时插一个空壳（`[文字]()`）没有意义，所以这里也认输返回
    // `false`——与下面那十条（表格）同一个出口。
    case "link": {
      if (!payload?.href) return false;
      wrapSelection(view, "[", `](${payload.href})`, "链接文字");
      return true;
    }
    case "image": {
      if (!payload?.src) return false;
      insertAtCursor(view, `![${payload.alt ?? ""}](${payload.src})`);
      return true;
    }
    case "clearFormat":
      清除行内标记(view);
      return true;
    // 表格那十条：见上面那段"语义对不上"。
    case "tableRowAbove":
    case "tableRowBelow":
    case "tableColLeft":
    case "tableColRight":
    case "tableDelRow":
    case "tableDelCol":
    case "tableDel":
    case "tableAlignLeft":
    case "tableAlignCenter":
    case "tableAlignRight":
      return false;
    default:
      return false;
  }
}

/* ── 查找 ────────────────────────────────────────────────────────────────
 *
 * ⚠️ **自己写的，因为 `@codemirror/search` 不在 `node_modules` 里**
 * （`package.json` 没列，而这台机器上没有网——见 `find.ts` 文件头）。
 *
 * 结构上刻意与 `find.ts` 那套**同形**：一份状态（查询 + 命中表 + 当前下标）、
 * 一组效果（设/走/清）、一层装饰（只改 class，不进文档）。两个编辑器长得像，
 * 读的人就不用为"同一个功能"记两套心智模型。
 *
 * ⚠️ 唯一的实质差别：这里的偏移量**就是文档偏移**（整篇就是一条字符串），
 * 不必像 ProseMirror 那边逐节点换算。匹配本身仍然调 `在文本里找匹配`。
 */

interface 源码查找状态 {
  query: string;
  options: FindOptions;
  matches: 文本命中[];
  index: number;
}

const 空查找: 源码查找状态 = { query: "", options: 默认查找选项, matches: [], index: -1 };

const 设查找效果 = StateEffect.define<{ query: string; options: FindOptions }>();
const 走查找效果 = StateEffect.define<1 | -1>();
const 清查找效果 = StateEffect.define<null>();

const 查找字段 = StateField.define<源码查找状态>({
  create: () => 空查找,
  update(value, tr) {
    if (tr.effects.some((e) => e.is(清查找效果))) return 空查找;

    const 设 = tr.effects.find((e) => e.is(设查找效果));
    const 走 = tr.effects.find((e) => e.is(走查找效果));

    const query = 设 ? 设.value.query : value.query;
    const options = 设 ? 设.value.options : value.options;
    const 要重算 = Boolean(设) || tr.docChanged;
    const matches = 要重算 ? 在文本里找匹配(tr.state.doc.toString(), query, options) : value.matches;

    let index = value.index;
    if (matches.length === 0) index = -1;
    else if (设) {
      const hit = matches.findIndex((m) => m.start >= tr.state.selection.main.from);
      index = hit === -1 ? 0 : hit;
    } else if (走) {
      const n = matches.length;
      index = 走.value > 0 ? (index + 1 + n) % n : (index - 1 + n) % n;
    } else if (要重算) {
      index = Math.min(Math.max(index, 0), matches.length - 1);
    }

    return { query, options, matches, index };
  },
});

/** 命中高亮的 class，与所见即所得那一侧**同名**（`find.ts` 里的常量）。 */
const 命中类 = "nota-find-hit";
const 当前类 = "nota-find-current";

const 查找装饰 = EditorView.decorations.compute([查找字段], (state) => {
  const s = state.field(查找字段);
  if (s.matches.length === 0) return Decoration.none;
  return Decoration.set(
    s.matches.map((m, i) =>
      Decoration.mark({
        class: i === s.index ? `${命中类} ${当前类}` : 命中类,
      }).range(m.start, m.end),
    ),
    // ⚠️ `sort: true`：`Decoration.set` 要求区间按位置排好，而命中表本身
    // 就是有序的——写出来是防着以后有人改匹配顺序，那时不排会**抛异常**
    //（不是画错，是直接崩）。
    true,
  );
});

/** 从状态算一份给界面看的东西。 */
function 查找状态(s: 源码查找状态): FindStatus {
  return { query: s.query, total: s.matches.length, current: s.index + 1 };
}

/** 把光标送到某个命中上，并滚动到可见。 */
function 源码选中(view: EditorView, m: 文本命中): void {
  view.dispatch({
    selection: { anchor: m.start, head: m.end },
    scrollIntoView: true,
  });
}

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

/** 建一个源码编辑器。**同步返回**——CodeMirror 不需要异步初始化。 */
export function createSourceEditor(options: CreateSourceOptions): SourceHandle {
  const {
    root,
    initialMarkdown,
    onChange,
    readOnly = false,
    strict = false,
    onFindStatus,
    writingModes = 默认写作模式,
  } = options;

  /** 上一次报出去的查找签名。**每个实例一份**（这个闭包在函数体里）。 */
  let 上次查找签名 = "";
  /** 同上的写法：打字机模式要判"这次是不是刚打开的"。 */
  let 上次模式: 写作模式 = writingModes;
  const { 字段: 写作字段, 扩展: 写作扩展 } = 写作模式扩展(writingModes);

  const extensions: Extension[] = [
    history(),
    drawSelection(),
    markdown(),
    syntaxHighlighting(notaHighlight),
    notaTheme,
    keymap.of([...defaultKeymap, ...historyKeymap]),
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

      if (!u.docChanged) return;
      // ⚠️ 不带 `userEvent` 的过滤：本文件里所有 `dispatch` 都是"用户意图"
      // （命令、粘贴、打字），没有"程序性回填"——整篇替换走 `setMarkdown`，
      // 那条**不派发**（见下）。
      onChange?.(u.state.doc.toString());
    }),
    EditorState.readOnly.of(readOnly),
    EditorView.editable.of(!readOnly),
  ];
  if (!readOnly) extensions.push(placeholder("在这里写 Markdown 原文…"));
  // ⚠️ 查找那一套**只在可编辑的那一份上挂**：只读预览窗格没有查找可言，
  // 挂了也只是白算一遍匹配（同 `create.ts` 那边"不传就不挂"的口径）。
  if (!readOnly && onFindStatus) extensions.push(查找字段, 查找装饰);
  // 写作模式**恒挂**（可编辑的那一份）：两个开关随时可能被拨，而插件清单
  // 一旦绑进 `EditorPane` 的依赖，拨一下开关就得把编辑器整个重建——
  // 那会丢掉撤销栈和光标，写在半句话中间时尤其难受。
  if (!readOnly) extensions.push(...写作扩展);

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
