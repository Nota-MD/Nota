/**
 * 行内标记的提示：光标落在任一行内标记里时，把该标记的真实左右源码符号
 * 画在那段文字的左右两边。
 *
 * 用户 2026-09-26 的原话：「我认为如果光标在黑体/斜体内容内，可否半透明显示*？」
 *
 * # 和 `instant-render.ts` 的分工
 *
 * `instant-render.ts` 管**块级**标记（`#` / `>` / `-` / ` ``` `）：那些标记画在
 * 块的**左边那条 56px 装订线**里，不占正文宽度。本文件管**行内**标记——
 * 它没有装订线可用，标记只能画在字与字之间，所以是**另一份**插件、**另一条**
 * CSS 规则（`.nota-markhint`，在 `src/styles/marks.css` 里紧挨着 `.nota-srcmark`）。
 *
 * ⚠️ `instant-render.ts` 的文件头里写着"行内标记是另一回事，必须让符号真的
 * 存在于文档里（要改 schema）"——那句话说的是**第五版之前**的思路：那是要
 * 让 `**` 变成可点、可退格、可把光标停进去的真字符（`docs/07` backlog 第 37 项）。
 * 用户要的是"看得见的实体符号"，不是"把定界符变成可编辑的结构字符"。
 * 所以这里走的是**纯显示**（左右各一颗 `Decoration.widget`），
 * 不动 schema、不动文档，一个字节都不写回。
 *
 * # 左右符号都是**真实文本节点**（2026-10-23，2026-10-24 扩展到全部行内标记）
 *
 * 两颗各是一个带文字内容的 `<span>`，由 `Decoration.widget` 放进编辑器 DOM。
 * 左侧 `side:-1` 放在标记起点之前，光标落在它右边；右侧同样 `side:-1` 放在
 * 标记终点之前，光标落在它右边。这样既保留 BUG-65 定下的光标手感，又不让
 * 符号成为粗体／斜体文字的伪元素。
 *
 * ⚠️ **不能再用 `Decoration.inline` + `::before` 画左符号**（2026-10-23，用户
 * 看截图报「这两个星号不是实体。事实上它们应该是半透明的实体」）：伪元素挂在
 * 被加粗／倾斜的文本上，会继承宿主的字形与字重；视觉上仍是正文的一部分。
 * widget 自带真实文字，并通过 `marks: []` 明确不套任何行内 mark。
 *
 * ⚠️ 中途试过、**被推翻**的一条：把"光标贴段尾"那一格整个不画（`扫一段` 收紧）。
 * 那是"躲开问题"不是解决——Typora 那里是**照常显示**的。别再走回去。
 *
 * ⚠️ **widget 只插 DOM、不进文档**：它没有文档位置，一个字节都不写回，
 * 与 `instant-render.ts` 那个"插 `<span>` 被当成正文"的坑**不是一回事**——
 * 那边错在把元素插进了文本节点流里当正文，这边是 ProseMirror 认得的装饰。
 *
 * # 长相：widget 内的真实文字
 *
 * 符号直接写进 `textContent`。字体与字号跟随正文，默认颜色与正文相同、
 * 完全不透明，是清楚的实体字符。主题可以通过 `--mark-hint-fg` 与
 * `--mark-hint-opacity` 调整语法提示的强弱。每个符号字符各是一颗 widget，
 * `**` / `</u>` 不再被当成一个不可分的文字块。
 *
 * ⚠️ **代价讲清楚**：这两个符号是**占宽度**的（它们是文档流里的真实 `<span>`，
 * 不是绝对定位的浮标）。所以光标进出加粗段时，那一行会横向动
 * 两个字符的宽度。选它是因为用户反复拿 Typora 当参照（那边就是把 `**` 原样
 * 显示出来），而"看得见自己写的是 `**` 还是 `_`"正是他要的信息。
 * 想改成不占位的浮标（`position: absolute` + `right: 100%`，像 `.nota-srcmark`
 * 那样）的话，只改 CSS 那一条就够——**这个文件一行都不用动**。
 * 没这么做是因为行内没有装订线，绝对定位的符号会**压在前一个字上面**。
 *
 * # 只对**可编辑**实例装（`create.ts` 里那句 `readOnly ? [] : [...]`）
 *
 * 这是编辑时的提示，不是文档的一部分。只读实例有两个：应用里的分屏预览、
 * 导出 HTML 用的那个离屏实例。前者装上了会在预览里多出 `**`，后者会把它
 * 带进导出文件。
 *
 * ⚠️ 所以**压根不给只读实例装**（`create.ts` 那句 `readOnly ? [] : [markHint]`）
 * ——这也是为什么 `editor/export.ts` 的 `摘掉的属性` 里**没有** `.nota-markhint`：
 * 那个清单是给"装上了、但导出时要洗掉"的东西用的（`data-srcmark` 就是，
 * `instantRender` 是恒挂的）。本文件没挂上去，就没有第二个地方要记。
 * 将来真改成恒挂，**先在那边登记 `提示属性`**，否则环星号会跟着进导出文件。
 */

import { $prose } from "@milkdown/kit/utils";
import {
  Plugin,
  TextSelection,
  type EditorState,
  type Transaction,
} from "@milkdown/kit/prose/state";
import {
  Fragment,
  Mark,
  type MarkType,
  type Node as PMNode,
  type NodeType,
} from "@milkdown/kit/prose/model";
import type { EditorView } from "@milkdown/kit/prose/view";
import {
  findActiveMarkRange,
  inlineSyntaxAndEscapeDecorations,
  inlineSyntaxNodeSpec,
  markHintLiteral,
  normalizeInlineBlock,
  noticeClass,
  noticeTable,
  type SyntaxMarkerRange,
  type SyntaxNodeAttribute,
} from "./mark-hint-source";
import { inlineEscapeSpec } from "./inline-escape";
import {
  backspaceEmptyInlinePair,
  backspaceInlineDelimiter,
  deleteEmptyInlinePairForward,
  deleteInlineDelimiter,
  inputInlineDelimiter,
  insertPlainInlineText,
  markHintKey,
  moveInlineCaret,
  type MarkHintState,
} from "./inline-edit";

export {
  findActiveMarkRange,
  inlineSyntaxNodePlugins,
  inlineSyntaxNodeSpec,
  noticeClass,
  noticeTable,
} from "./mark-hint-source";
export {
  backspaceEmptyInlinePair,
  backspaceInlineDelimiter,
  deleteEmptyInlinePairForward,
  deleteInlineDelimiter,
  inputInlineDelimiter,
  insertPlainInlineText,
  markHintKey,
  moveInlineCaret,
} from "./inline-edit";

export function scanOneParagraph(
  doc: PMNode,
  position2: number,
  type: MarkType,
): { from: number; to2: number } | null {
  const position = doc.resolve(position2);
  const parent = position.parent;
  // 光标不落在能装文字的那一层（比如嵌在图片/公式这类原子节点里）就没得扫。
  if (!parent.inlineContent) return null;

  /** 每个行内孩子从哪个位置起、带不带这个标记。 */
  const children2: { from: number; withValue: boolean }[] = [];
  let length = 0;
  for (let i = 0; i < parent.childCount; i++) {
    const child2 = parent.child(i);
    const width = child2.isText === true ? ((child2.text as string).length) : child2.nodeSize;
    // ⚠️ `MarkType.isInSet` 的类型是 `Mark | undefined`（**不是** `boolean`），
    //    所以这里判"带不带"要比 `undefined`，不能写 `&&`/`=== true`——
    //    写成后者过不了 `tsc --noEmit`（`Mark | undefined` 与 `boolean` 没有交集）。
    //    行内原子（公式 / 图片）的 `marks` 是空集，问出来就是 `undefined`，
    //    所以**不用**再单独判 `isText`。
    children2.push({ from: length, withValue: type.isInSet(child2.marks) !== undefined });
    length += width;
  }
  if (length <= 0) return null;

  /** 第 `j` 个位置（`0 <= j < 长`）带不带这个标记。 */
  const withValue = (j: number): boolean => {
    for (let i = children2.length - 1; i >= 0; i--) {
      const child2 = children2[i];
      if (child2 && j >= child2.from) return child2.withValue;
    }
    return false;
  };

  const blockFirst = position.start();
  const cursor = Math.min(Math.max(position2 - blockFirst, 0), length);
  // 光标落在这一段里（第 `光标` 个位置带标记），或者**紧贴在段尾**
  // （刚打完 `**粗**`，光标停在最后一个字后面，那时它后面已经没有带标记的字了）。
  //
  // ⚠️⚠️ **后一支 2026-10-05 一度被去掉过，当天就收回来了**（BUG-65）：
  //   当时想的是"光标在标记外面就不画"（连注释都写成了"光标的位置在撒谎"）。
  //   用户拿 **Typora 的两张图**当场推翻了它——**Typora 是照常显示的**：
  //   光标能停在右符号的**左边**（`*你好|*`）、也能停在**右边**（`*你好*|`），
  //   两种位置符号都在。躲开不画不是它的做法。
  //
  //   真正要修的是**画的位置**：右符号改走 `Decoration.widget(…, {side:-1})`
  //   之后，段尾那一格光标画在右符号**右边**，于是"看得见"与"光标不撒谎"
  //   两件事同时成立。**别再退回"不画"那一版。**
  if (!((cursor < length && withValue(cursor)) || (cursor > 0 && withValue(cursor - 1)))) return null;

  let from = cursor;
  let to2 = cursor;
  while (from > 0 && withValue(from - 1)) from--;
  while (to2 < length && withValue(to2)) to2++;
  return { from: blockFirst + from, to2: blockFirst + to2 };
}

/**
 * 提示表里那些名字，有哪些在**当前这颗 schema** 里找不到。
 *
 * ⚠️ 这是"名字写错就悄悄不显示"那道防线的**运行期**一半（另一半是
 * `tests/mark-hint.test.ts` 拿真 preset 的 id 对表）。只报一次：这个函数
 * 每次光标动都会跑，逐次 `console.warn` 会把控制台刷爆（而且 `NOTA_DEBUG`
 * 那套日志本来就只在调试时看）。
 */
let reportPassMissingName = false;

function checkMissingName(marks: Record<string, MarkType | undefined>): void {
  if (reportPassMissingName) return;
  const missing2 = noticeTable.filter(({ name3 }) => !marks[name3]).map(({ name3 }) => name3);
  if (!missing2.length) return;
  reportPassMissingName = true;
  console.warn(
    `[nota] 行内标记提示：schema 里没有这几个 mark，对应的提示不会出现：${missing2.join("、")}` +
      `（提示表在 src/editor/mark-hint.ts）。斜体那个 mark 的 id 是 \`emphasis\`，不是 \`em\`。`,
  );
}

/**
 * 建一颗标记 widget 元素。
 *
 * ⚠️ 这个函数**只在真渲染那一刻**才被调（`Decoration.widget` 收的是构造函数），
 * 所以 `tests/mark-hint.test.ts` 在 node 里 import 本模块、跑 `扫一段` 时
 * **不会**碰到 `document`——这是"纯位置算术能在无 DOM 环境里测"的前提，
 * 别图省事把 `document.createElement` 挪到模块顶层。
 */
export function splitMarkCharacter(symbolNumber: string): string[] {
  return Array.from(symbolNumber);
}


/** Internal transaction flag: run the post-composition inline normalization. */
export const markHintRefresh = "nota-mark-hint-refresh";

/**
 * Where an IME composition started relative to the revealed delimiters.
 *
 * WebKit can normalize a DOM caret just outside an atom to the inside edge of
 * the adjacent marked text. We remember only the outer-boundary case; a
 * composition deliberately started inside highlighted or bold text is left
 * alone.
 */
export interface InlineCompositionAnchor {
  name: string;
  side: "before" | "after";
  markerFrom: number;
  markerTo: number;
}

/** Snapshot an IME caret that starts just outside an active inline mark. */
export function inlineCompositionAnchor(
  state: EditorState,
  syntaxType: NodeType,
): InlineCompositionAnchor | null {
  if (!state.selection.empty) return null;
  const position2 = state.selection.from;
  const marks = state.schema.marks as Record<string, MarkType | undefined>;
  for (const { name3 } of noticeTable) {
    const type = marks[name3];
    if (!type) continue;
    const active = findActiveMarkRange(state.doc, position2, type, syntaxType);
    if (!active) continue;
    if (active.leftMarker && position2 === active.leftMarker.from) {
      return {
        name: name3,
        side: "before",
        markerFrom: active.leftMarker.from,
        markerTo: active.leftMarker.to2,
      };
    }
    if (active.rightMarker && position2 === active.rightMarker.to2) {
      return {
        name: name3,
        side: "after",
        markerFrom: active.rightMarker.from,
        markerTo: active.rightMarker.to2,
      };
    }
  }
  return null;
}

/**
 * Keep the native DOM caret on the outside of the revealed delimiter atom.
 * This is a DOM-selection-only operation, so it does not dispatch a
 * transaction or abort the IME preedit.
 */
export function pinCompositionOutsideMarker(
  view: EditorView,
  anchor: InlineCompositionAnchor,
): void {
  const markerPosition =
    anchor.side === "after" ? anchor.markerTo - 1 : anchor.markerFrom;
  const marker = view.nodeDOM(markerPosition);
  if (!(marker instanceof Element) || !marker.parentNode) return;
  const index = Array.prototype.indexOf.call(
    marker.parentNode.childNodes,
    marker,
  );
  if (index < 0) return;
  const root = view.root as {
    getSelection?: () => globalThis.Selection | null;
  };
  const selection = root.getSelection ? root.getSelection() : null;
  if (!selection) return;
  try {
    selection.collapse(
      marker.parentNode,
      anchor.side === "after" ? index + 1 : index,
    );
  } catch {
    // The state-level relocation after compositionend is the fallback.
  }
}

/**
 * Undo WebKit's misattribution when a composition started outside a mark but
 * its committed text was inserted at the adjacent inner edge. The snapshot is
 * deliberately narrow: text and marks must match exactly, otherwise we leave
 * the composition alone rather than move a user's words by guesswork.
 */
export function relocateComposedText(
  state: EditorState,
  anchor: InlineCompositionAnchor,
  committed: string,
  syntaxType: NodeType,
): Transaction | null {
  if (!committed || !state.selection.empty) return null;
  const type = (state.schema.marks as Record<string, MarkType | undefined>)[
    anchor.name
  ];
  if (!type) return null;
  const caret = state.selection.from;
  const active = findActiveMarkRange(state.doc, caret, type, syntaxType);
  if (!active) return null;

  if (anchor.side === "after") {
    if (!active.rightMarker || caret > active.to2) return null;
    const from = caret - committed.length;
    if (from < active.from) return null;
    if (state.doc.textBetween(from, caret, "\uFFFC", "\uFFFC") !== committed) {
      return null;
    }
    const tr = state.tr.delete(from, caret);
    const insertAt = tr.mapping.map(active.rightMarker.to2, 1);
    tr.setStoredMarks([]);
    tr.insertText(committed, insertAt, insertAt);
    tr.setSelection(TextSelection.create(tr.doc, insertAt + committed.length));
    return tr;
  }

  if (!active.leftMarker || caret > active.to2) return null;
  if (state.doc.textBetween(active.from, caret, "\uFFFC", "\uFFFC") !== committed) {
    return null;
  }
  const insertAt = active.leftMarker.from;
  const tr = state.tr.delete(active.from, caret);
  tr.setStoredMarks([]);
  tr.insertText(committed, insertAt, insertAt);
  tr.setSelection(TextSelection.create(tr.doc, insertAt + committed.length));
  return tr;
}

/** 当前文档里的全部临时语法字符。 */
export function listSyntaxMarkers(doc: PMNode, syntaxType: NodeType): SyntaxMarkerRange[] {
  const single: SyntaxMarkerRange[] = [];
  doc.descendants((node, position2) => {
    if (node.type !== syntaxType) return true;
    const attrs = node.attrs as Partial<SyntaxNodeAttribute>;
    single.push({
      from: position2,
      to2: position2 + node.nodeSize,
      text4: typeof attrs.symbol === "string" ? attrs.symbol : "*",
      syntax: typeof attrs.syntax === "string" ? attrs.syntax : "",
      side: attrs.side === "right" ? "right" : "left",
    });
    return false;
  });
  const output2: SyntaxMarkerRange[] = [];
  for (const marker of single) {
    const last = output2.at(-1);
    if (
      last &&
      last.to2 === marker.from &&
      last.syntax === marker.syntax &&
      last.side === marker.side
    ) {
      last.to2 = marker.to2;
      last.text4 += marker.text4;
    } else {
      output2.push({ ...marker });
    }
  }
  return output2;
}

/**
 * Ensure the current mark has delimiter atoms at both edges.
 *
 * Inactive delimiter atoms stay in the document and are hidden by a node
 * decoration. Removing them collapses the two logical caret positions around
 * a closing group into one DOM boundary, which made Left from following text
 * jump straight into the bold content.
 */
function syncInlineMarkers(
  state: EditorState,
  syntaxType: NodeType,
  allowSelection = false,
): Transaction | null {
  if (!state.selection.empty && !allowSelection) return null;
  const marks = state.schema.marks as Record<string, MarkType | undefined>;
  const activeMarks: Mark[] = [];
  const missingByKey = new Map<string, {
    position2: number;
    text4: string;
    syntax: string;
    side: "left" | "right";
  }>();
  const cursors = state.selection.empty
    ? [state.selection.from]
    : [
        state.selection.from,
        state.selection.to,
        state.selection.from + 1,
        state.selection.to - 1,
      ].filter(
        (position2) =>
          position2 >= 0 && position2 <= state.doc.content.size,
      );
  for (const { name3 } of noticeTable) {
    const type = marks[name3];
    if (!type) continue;
    for (const cursor of cursors) {
      const active = findActiveMarkRange(
        state.doc,
        cursor,
        type,
        syntaxType,
      );
      if (!active) continue;
      if (
        state.selection.empty &&
        state.selection.from >= active.from &&
        state.selection.from <= active.to2
      ) {
        activeMarks.push(type.create());
      }
      if (!active.leftMarker) {
        const item = {
          position2: active.from,
          text4: active.left,
          syntax: name3,
          side: "left" as const,
        };
        missingByKey.set(
          `${item.syntax}:${item.position2}:${item.side}`,
          item,
        );
      }
      if (!active.rightMarker) {
        const item = {
          position2: active.to2,
          text4: active.right,
          syntax: name3,
          side: "right" as const,
        };
        missingByKey.set(
          `${item.syntax}:${item.position2}:${item.side}`,
          item,
        );
      }
    }
  }
  const missing = Array.from(missingByKey.values());

  const uniqueActiveMarks = activeMarks.filter(
    (mark, index, all) => all.findIndex((other) => other.eq(mark)) === index,
  );
  const atomBefore = state.selection.$from.nodeBefore;
  const atomAfter = state.selection.$from.nodeAfter;
  const adjacentMarks =
    atomBefore && !atomBefore.isText && atomBefore.marks.length
      ? atomBefore.marks
      : atomAfter && !atomAfter.isText
        ? atomAfter.marks
        : [];
  const marksToStore =
    uniqueActiveMarks.length > 0 ? uniqueActiveMarks : adjacentMarks;
  const storedChanged = !Mark.sameSet(state.storedMarks ?? [], marksToStore);
  if (!missing.length && !storedChanged) return null;

  const selectionFrom = state.selection.from;
  const selectionTo = state.selection.to;
  let fromShift = 0;
  let toShift = 0;
  const tr = state.tr;
  for (const item of missing.sort((a, b) => b.position2 - a.position2)) {
    const mapped = tr.mapping.map(item.position2, 1);
    if (mapped < selectionFrom || (item.side === "left" && mapped === selectionFrom)) {
      fromShift += item.text4.length;
    }
    if (mapped < selectionTo) toShift += item.text4.length;
    const nodes = Array.from(item.text4).map((symbol) =>
      syntaxType.create({
        syntax: item.syntax,
        side: item.side,
        symbol,
      }),
    );
    tr.insert(mapped, Fragment.fromArray(nodes));
  }
  if (tr.docChanged) {
    const clampPosition = (position2: number): number =>
      Math.max(0, Math.min(tr.doc.content.size, position2));
    const from = TextSelection.near(
      tr.doc.resolve(clampPosition(selectionFrom + fromShift)),
      1,
    );
    const to = TextSelection.near(
      tr.doc.resolve(clampPosition(selectionTo + toShift)),
      -1,
    );
    tr.setSelection(
      TextSelection.create(
        tr.doc,
        Math.min(from.from, to.from),
        Math.max(from.from, to.from),
      ),
    );
    tr.setMeta("addToHistory", false);
  }
  if (storedChanged) tr.setStoredMarks(marksToStore);
  return tr.docChanged || storedChanged ? tr : null;
}

/**
 * 插件本体。
 *
 * ⚠️ 装饰在**每次 state 变化**时重算（含光标移动），不做缓存——理由与
 * `instant-render.ts` 那条一字不差：缓存要自己判断"这次变化影响不影响结果"，
 * 判错的代价是提示不跟着光标走，而"跟着光标走"是这个功能唯一要做对的事。
 * 代价是 O(1)：只看光标那两处相邻位置。
 */
export function createMarkHintPlugin(
  syntaxType: NodeType,
  escapeType?: NodeType,
): Plugin {
  let compositionAnchor: InlineCompositionAnchor | null = null;
  let compositionTimer: number | null = null;
  const pinDomCaret = (view: EditorView, position2: number) => {
    const markerAt = (pos: number): Element | null => {
      const node = view.nodeDOM(pos);
      return node instanceof Element && node.classList.contains(noticeClass) ? node : null;
    };
    const before = position2 > 0 ? markerAt(position2 - 1) : null;
    const after = markerAt(position2);
    const marker = before ?? after;
    if (!marker?.parentNode) return;
    const index = Array.prototype.indexOf.call(marker.parentNode.childNodes, marker);
    if (index < 0) return;
    const selection = window.getSelection();
    const at = before ? index + 1 : index;
    selection?.setBaseAndExtent(marker.parentNode, at, marker.parentNode, at);
  };
  return new Plugin({
      key: markHintKey,
      view: () => {
        return {
          destroy() {
            if (compositionTimer !== null) {
              window.clearTimeout(compositionTimer);
              compositionTimer = null;
            }
          },
        };
      },
      props: {
        decorations: (state) =>
          inlineSyntaxAndEscapeDecorations(
            state,
            syntaxType,
            escapeType,
            markHintKey.getState(state)?.suppressedAt ?? null,
          ),
        handleKeyDown: (view, event) => {
          if (event.isComposing || view.composing) return false;
          if (
            event.key === "\\" &&
            !event.ctrlKey &&
            !event.metaKey &&
            !event.altKey
          ) {
            const syntaxType = view.state.schema.nodes.notaSyntax;
            const escapeType = view.state.schema.nodes.notaEscape;
            if (!syntaxType) return false;
            const tr = inputInlineDelimiter(
              view.state,
              syntaxType,
              view.state.selection.from,
              view.state.selection.to,
              "\\",
              escapeType,
              true,
            );
            if (tr) {
              event.preventDefault();
              view.dispatch(tr.scrollIntoView());
              return true;
            }
          }
          if (event.key === "Delete") {
            const tr =
              deleteEmptyInlinePairForward(view.state, syntaxType) ??
              deleteInlineDelimiter(view.state, syntaxType);
            if (tr) {
              event.preventDefault();
              view.dispatch(tr);
              return true;
            }
          }
          if (
            !event.shiftKey &&
            !event.ctrlKey &&
            !event.metaKey &&
            !event.altKey &&
            (event.key === "ArrowLeft" ||
              event.key === "ArrowRight" ||
              event.key === "Home" ||
              event.key === "End")
          ) {
            const tr = moveInlineCaret(view.state, syntaxType, event.key);
            if (tr) {
              view.dispatch(tr);
              if (event.key === "ArrowLeft" || event.key === "ArrowRight") {
                requestAnimationFrame(() => {
                  if (!view.isDestroyed) pinDomCaret(view, view.state.selection.from);
                });
              }
              return true;
            }
          }
          if (event.key !== "Backspace") return false;
          const literalBefore = view.state.selection.$from.nodeBefore;
          if (
            view.state.selection.empty &&
            literalBefore?.type.name === "notaLiteral" &&
            literalBefore.attrs.symbol === "\\"
          ) {
            event.preventDefault();
            const caret = view.state.selection.from;
            const tr = view.state.tr.delete(
              caret - literalBefore.nodeSize,
              caret,
            );
            tr.setSelection(
              TextSelection.create(
                tr.doc,
                caret - literalBefore.nodeSize,
              ),
            );
            view.dispatch(tr.scrollIntoView());
            return true;
          }
          const tr =
            backspaceEmptyInlinePair(view.state, syntaxType) ??
            backspaceInlineDelimiter(view.state, syntaxType, escapeType);
          if (!tr) return false;
          view.dispatch(tr);
          return true;
        },
        handleDOMEvents: {
          beforeinput: (view, rawEvent) => {
            const event = rawEvent as InputEvent;
            if (
              view.composing ||
              event.isComposing ||
              event.inputType !== "insertText" ||
              event.data !== "\\"
            ) {
              return false;
            }
            const syntaxType = view.state.schema.nodes.notaSyntax;
            const escapeType = view.state.schema.nodes.notaEscape;
            if (!syntaxType) return false;
            const tr = inputInlineDelimiter(
              view.state,
              syntaxType,
              view.state.selection.from,
              view.state.selection.to,
              event.data,
              escapeType,
              true,
            );
            if (!tr) return false;
            event.preventDefault();
            view.dispatch(tr.scrollIntoView());
            return true;
          },
          compositionstart: (view) => {
            compositionAnchor = inlineCompositionAnchor(view.state, syntaxType);
            if (compositionAnchor) {
              pinCompositionOutsideMarker(view, compositionAnchor);
            }
            return false;
          },
          compositionend: (view, event) => {
            const anchor = compositionAnchor;
            const committed = event.data ?? "";
            compositionAnchor = null;
            if (compositionTimer !== null) {
              window.clearTimeout(compositionTimer);
            }
            const settle = (attempt = 0) => {
              compositionTimer = window.setTimeout(() => {
                compositionTimer = null;
                if (view.isDestroyed) return;
                // ProseMirror reads the final DOM change just after
                // compositionend. Give that observer pass time to finish.
                if (view.composing && attempt < 5) {
                  settle(attempt + 1);
                  return;
                }
                const relocated = anchor
                  ? relocateComposedText(view.state, anchor, committed, syntaxType)
                  : null;
                const tr = relocated ?? view.state.tr;
                tr.setMeta(markHintRefresh, true);
                view.dispatch(tr.scrollIntoView());
              }, 40);
            };
            settle();
            return false;
          },
        },
      },
      state: {
        init: (): MarkHintState => ({ suppressedAt: null }),
        apply: (tr, value): MarkHintState => {
          const own = tr.getMeta(markHintKey) as number | null | undefined;
          if (own !== undefined) return { suppressedAt: own };
          if (tr.docChanged) return { suppressedAt: null };
          // 浏览器可能在 Backspace 后再派一笔“只同步选区”的事务。只要光标
          // 还停在刚才收起标记的位置，就继续保持抑制；否则这一笔会把
          // `appendTransaction` 放行，标记当场补回，形成退格前后来回循环。
          if (tr.selectionSet) {
            const samePoint =
              value.suppressedAt !== null && tr.selection.from === value.suppressedAt;
            return samePoint ? value : { suppressedAt: null };
          }
          return value;
        },
      },
      appendTransaction: (transactions, _oldState, newState) => {
        // ProseMirror tags every transaction produced while an IME owns the
        // editable DOM. Rewriting that textblock here mutates the DOM below the
        // active composition and is exactly how newly committed Chinese text
        // used to inherit the preceding highlight.
        if (transactions.some((tr) => tr.getMeta("composition") != null)) {
          return null;
        }
        if (transactions.some((tr) => tr.getMeta(markHintLiteral) === true)) {
          return null;
        }
        const marks = newState.schema.marks as Record<string, MarkType | undefined>;
        checkMissingName(marks);

        if (
          transactions.some(
            (tr) => tr.docChanged || tr.getMeta(markHintRefresh) === true,
          )
        ) {
          const normalized = normalizeInlineBlock(newState, syntaxType, escapeType);
          if (normalized) return normalized;
        }
        const selectionMarkChanged = transactions.some((tr) =>
          tr.steps.some(
            (step) =>
              step.toJSON().stepType === "addMark" ||
              step.toJSON().stepType === "removeMark",
          ),
        );
        return syncInlineMarkers(
          newState,
          syntaxType,
          selectionMarkChanged,
        );
      },
  });
}

/**
 * Run every Markdown delimiter keystroke through the same source controller as
 * Typedown. The transaction either auto-pairs the opener, steps over a closer,
 * or inserts a literal delimiter. `autoPair=false` keeps the setting off while
 * still preventing stock input rules from promoting a construct prematurely.
 */
export const literalInlineInput = (autoPair: boolean) => $prose(
  () =>
    new Plugin({
      props: {
        handleTextInput: (view, from, to2, text4) => {
          if (
            view.composing ||
            text4.length !== 1 ||
            !"*_=~^`$\\".includes(text4) ||
            view.state.selection.$from.parent.type.spec.code
          ) {
            return false;
          }
          const syntaxType = view.state.schema.nodes.notaSyntax;
          const escapeType = view.state.schema.nodes.notaEscape;
          if (text4 === "\\") {
            // A backslash before a letter is ordinary text (`\LaTeX`), not a
            // Markdown escape. Keep it in the normal text node so surrounding
            // source characters remain visible to the math input rule.
            if (syntaxType) {
              const tr = inputInlineDelimiter(
                view.state,
                syntaxType,
                from,
                to2,
                text4,
                escapeType,
                true,
              );
              if (tr) {
                view.dispatch(tr.scrollIntoView());
                return true;
              }
            }
            const tr = insertPlainInlineText(view.state, from, to2, text4);
            view.dispatch(tr.scrollIntoView());
            return true;
          }
          if (syntaxType) {
            const tr = inputInlineDelimiter(
              view.state,
              syntaxType,
              from,
              to2,
              text4,
              escapeType,
              false,
              autoPair,
            );
            if (tr) {
              view.dispatch(tr.scrollIntoView());
              return true;
            }
          }
          view.dispatch(view.state.tr.insertText(text4, from, to2).scrollIntoView());
          return true;
        },
      },
    }),
);

export const markHint = $prose((ctx) =>
  createMarkHintPlugin(inlineSyntaxNodeSpec.type(ctx), inlineEscapeSpec.type(ctx)),
);
