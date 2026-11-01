/**
 * 行内语法节点、序列化与整段源码重建。
 *
 * 主插件只保留光标判断和事务编排；这一份负责“Markdown 源码 ↔ 可见标记”
 * 的无视图转换，便于独立验证，也避免单个文件越过行数硬线。
 */

import { $nodeSchema } from "@milkdown/kit/utils";
import { TextSelection, type EditorState, type Transaction } from "@milkdown/kit/prose/state";
import {
  Fragment,
  type MarkType,
  type Node as PMNode,
  type NodeType,
} from "@milkdown/kit/prose/model";
import { Decoration, DecorationSet } from "@milkdown/kit/prose/view";
import type { MilkdownPlugin } from "@milkdown/kit/ctx";
import { markTable } from "./inline-marks";
import { inlineSyntaxDecorations } from "./plain-syntax";
import {
  inlineTextSegments,
  parseInlineDelimiters,
  type InlineMarkName,
} from "./inline-delimiter";

/** 真实语法字符节点上的 class。CSS 见 `src/styles/marks.css`。 */
export const noticeClass = "nota-syntax-marker";

/**
 * 提示哪几种标记、各画什么左右符号。**就这一张表**；本仓自造的高亮 / 上下标 /
 * 下划线从 `inline-marks.ts` 的标记表取源码符号，避免第二份真相源。
 *
 * ⚠️ `名` 是 **schema 里那个 mark 的 id**，不是中文、不是节点名、也**不是
 * Markdown 语法里的名字**。取不到就跳过那一行（`state.schema.marks[名]` 为
 * `undefined`），所以写错名字的症状是"**那一种标记的提示不出现**"，不报错。
 * 2026-09-26 就栽在这儿：斜体那一行写的是 `"em"`，而
 * `@milkdown/preset-commonmark` 里那个 mark 的 id 是 **`"emphasis"`**
 * （见 `node_modules/@milkdown/preset-commonmark` 里 `$markSchema("emphasis", …)`；
 * 本仓 `src/editor/command-state.ts` 早就在用 `有("emphasis")`）。
 * 于是"加粗的 `**` 出来了、斜体的 `*` 怎么都不出来"，悄悄错了一版。
 * 现在有两道防线：`tests/mark-hint.test.ts` 拿**真 preset** 的 id 对一遍，
 * 运行期取不到会 `console.warn`（见 `算提示`）。
 *
 * ⚠️ 每行的左右符号要与 serializer 一致：加粗/斜体为 `**`/`*`，行内代码为
 * 反引号，删除线 `~~`，高亮 `==`，上下标 `^`/`~`，下划线 `<u>`/`</u>`。
 * 左右分开声明，不能假设两边相同。
 *
 * 📌 导出只给 `tests/mark-hint.test.ts` 用（它拿真 preset 的 id 对这张表）。
 */
export const noticeTable: readonly { name3: string; left: string; right: string }[] = [
  { name3: "strong", left: "**", right: "**" },
  { name3: "emphasis", left: "*", right: "*" },
  { name3: "inlineCode", left: "`", right: "`" },
  { name3: "strike_through", left: "~~", right: "~~" },
  ...markTable.map((spec) => ({
    name3: spec.label,
    left: spec.left,
    right: spec.right,
  })),
];

export interface SyntaxNodeAttribute {
  syntax: string;
  side: "left" | "right";
  symbol: string;
}

/**
 * 临时语法字符节点。
 *
 * 每个星号是一颗独立行内原子节点：它有真实文档位置，光标可以停在任意两颗
 * 星号之间，但它自己**不能承载输入文字**。这一点必须用 atom；带内容的行内
 * 节点会把外层边界的输入吸进星号节点，导致“在右星号后面打字”反而钻进标记。
 * `toMarkdown.runner` 不 `addNode`，所以它不会被重复写回文件。
 */
export const inlineSyntaxNodeSpec = $nodeSchema("notaSyntax", () => ({
  inline: true,
  group: "inline",
  atom: true,
  marks: "",
  selectable: false,
  attrs: {
    syntax: { default: "" },
    side: { default: "left" },
    symbol: { default: "*" },
  },
  parseDOM: [
    {
      tag: `span.${noticeClass}`,
      getAttrs: (dom: HTMLElement | string) => ({
        syntax: typeof dom === "string" ? dom : (dom.dataset.syntax ?? ""),
        side: typeof dom === "string" ? "left" : (dom.dataset.side ?? "left"),
        symbol: typeof dom === "string" ? "*" : dom.textContent ?? "*",
      }),
    },
  ],
  toDOM: (node: PMNode) => {
    const attrs = node.attrs as SyntaxNodeAttribute;
    return [
      "span",
      {
        class: noticeClass,
        "data-syntax": attrs.syntax,
        "data-side": attrs.side,
      },
      attrs.symbol,
    ];
  },
  parseMarkdown: {
    match: () => false,
    runner: () => {},
  },
  toMarkdown: {
    match: (node: PMNode) => node.type.name === "notaSyntax",
    runner: () => {},
  },
}));

/** `$nodeSchema` 的两元组必须整份摊平，同其他 schema。 */
export const inlineSyntaxNodePlugins = inlineSyntaxNodeSpec.flat() as unknown as MilkdownPlugin[];

interface InlineSourceSegment {
  text: string;
  marks: readonly InlineMarkName[];
}

interface InlineSourceSnapshot {
  source: string;
  /** Document offset relative to the block start → visible source offset. */
  at: Map<number, number>;
  segments: readonly InlineSourceSegment[];
}

function noticeName(name: string): InlineMarkName {
  return name as InlineMarkName;
}

function supportedInlineMarks(
  marks: Record<string, MarkType | undefined>,
): Set<InlineMarkName> {
  return new Set(
    noticeTable
      .filter((spec) => marks[spec.name3])
      .map((spec) => noticeName(spec.name3)),
  );
}

export function inlineSyntaxAndEscapeDecorations(
  state: EditorState,
  escapeType?: NodeType,
): DecorationSet {
  const base = inlineSyntaxDecorations(state);
  if (!escapeType) return base;

  const active: Decoration[] = [];
  state.doc.descendants((node, position2) => {
    if (node.type !== escapeType) return true;
    const caret = state.selection.from;
    if (caret >= position2 - 1 && caret <= position2 + node.nodeSize + 1) {
      active.push(
        Decoration.node(position2, position2 + node.nodeSize, {
          class: "nota-escape-active",
        }),
      );
    }
    return false;
  });
  return active.length ? base.add(state.doc, active) : base;
}

function markNamesOn(
  node: PMNode,
  marks: Record<string, MarkType | undefined>,
): InlineMarkName[] | null {
  const allowed = new Set(noticeTable.map((spec) => spec.name3));
  if (node.marks.some((mark) => !allowed.has(mark.type.name))) return null;
  return noticeTable
    .filter((spec) => marks[spec.name3]?.isInSet(node.marks))
    .map((spec) => noticeName(spec.name3));
}

function sameMarks(a: readonly InlineMarkName[], b: readonly InlineMarkName[]): boolean {
  return a.length === b.length && a.every((mark, index) => mark === b[index]);
}

function pushSegment(
  segments: InlineSourceSegment[],
  text4: string,
  marks: readonly InlineMarkName[],
): void {
  if (!text4) return;
  const previous = segments.at(-1);
  if (previous && sameMarks(previous.marks, marks)) {
    segments[segments.length - 1] = {
      text: previous.text + text4,
      marks,
    };
  } else {
    segments.push({ text: text4, marks });
  }
}

/**
 * Rebuild the exact delimiter-bearing source represented by one paragraph.
 *
 * Syntax nodes are presentation artifacts and are deliberately ignored here.
 * The semantic marks serialize back to their canonical delimiters, while any
 * literal punctuation that survived an edit remains ordinary text.
 */
export function serializeInlineBlock(
  parent: PMNode,
  syntaxType: NodeType,
  marks: Record<string, MarkType | undefined>,
): InlineSourceSnapshot | null {
  let source = "";
  let previous: InlineMarkName[] = [];
  let documentOffset = 0;
  const at = new Map<number, number>();
  const segments: InlineSourceSegment[] = [];

  const emit = (side: "left" | "right", names: readonly InlineMarkName[]): void => {
    for (const name of names) {
      const spec = noticeTable.find((item) => item.name3 === name);
      if (spec) source += side === "left" ? spec.left : spec.right;
    }
  };

  at.set(0, 0);
  for (let i = 0; i < parent.childCount; i++) {
    const child = parent.child(i);
    if (child.type === syntaxType) {
      at.set(documentOffset, source.length);
      documentOffset += child.nodeSize;
      at.set(documentOffset, source.length);
      continue;
    }
    if (!child.isText) return null;
    const current = markNamesOn(child, marks);
    if (current === null) return null;

    const closing = previous.filter((mark) => !current.includes(mark)).reverse();
    const opening = current.filter((mark) => !previous.includes(mark));
    emit("right", closing);
    emit("left", opening);
    previous = current;

    const text4 = child.text ?? "";
    const sourceStart = source.length;
    for (let offset = 0; offset <= text4.length; offset++) {
      at.set(documentOffset + offset, sourceStart + offset);
    }
    source += text4;
    pushSegment(segments, text4, current);
    documentOffset += child.nodeSize;
  }
  emit("right", previous.slice().reverse());
  return { source, at, segments };
}

function sameSegments(
  left: readonly InlineSourceSegment[],
  right: readonly InlineSourceSegment[],
): boolean {
  return (
    left.length === right.length &&
    left.every(
      (segment, index) =>
        segment.text === right[index]?.text &&
        sameMarks(segment.marks, right[index]?.marks ?? []),
    )
  );
}

function inlineNodes(
  schema: EditorState["schema"],
  segments: readonly InlineSourceSegment[],
  parsed: ReturnType<typeof parseInlineDelimiters>,
  escapeType?: NodeType,
): PMNode[] {
  const nodes: PMNode[] = [];
  let offset = 0;
  for (const segment of segments) {
    const marks = segment.marks
      .map((name) => schema.marks[name])
      .filter((mark): mark is MarkType => mark !== undefined)
      .map((mark) => mark.create());
    let local = 0;
    while (local < segment.text.length) {
      const escape = parsed.escapes.find((item) => item.at === offset + local);
      if (escape && escapeType) {
        nodes.push(escapeType.create({ symbol: escape.symbol }, null, marks));
        local++;
        continue;
      }
      const nextEscape = escapeType
        ? parsed.escapes.find(
            (item) =>
              item.at > offset + local &&
              item.at < offset + segment.text.length,
          )
        : undefined;
      const end = nextEscape
        ? nextEscape.at - offset
        : segment.text.length;
      nodes.push(schema.text(segment.text.slice(local, end), marks));
      local = end;
    }
    offset += segment.text.length;
  }
  return nodes;
}

/**
 * Immediately reveal the delimiters around the caret after a full paragraph
 * reparse. ProseMirror does not guarantee another append pass for a transaction
 * returned by `appendTransaction`, so the first visible frame must already
 * contain the marker atoms.
 */
function addActiveMarkersToTransaction(
  tr: Transaction,
  syntaxType: NodeType,
): void {
  const marks = tr.doc.type.schema.marks as Record<string, MarkType | undefined>;
  const inserts: Array<{
    position2: number;
    syntax: string;
    side: "left" | "right";
    text4: string;
  }> = [];
  for (const { name3 } of noticeTable) {
    const type = marks[name3];
    if (!type) continue;
    const active = findActiveMarkRange(
      tr.doc,
      tr.selection.from,
      type,
      syntaxType,
    );
    if (!active) continue;
    if (!active.leftMarker) {
      inserts.push({
        position2: active.from,
        syntax: name3,
        side: "left",
        text4: active.left,
      });
    }
    if (!active.rightMarker) {
      inserts.push({
        position2: active.to2,
        syntax: name3,
        side: "right",
        text4: active.right,
      });
    }
  }
  if (!inserts.length) return;
  const caretBefore = tr.selection.from;
  let caretShift = 0;
  for (const item of inserts.sort((a, b) => b.position2 - a.position2)) {
    if (item.position2 <= caretBefore) caretShift += item.text4.length;
    const nodes = Array.from(item.text4).map((symbol) =>
      syntaxType.create({ syntax: item.syntax, side: item.side, symbol }),
    );
    tr.insert(item.position2, Fragment.fromArray(nodes));
  }
  const caret = caretBefore + caretShift;
  tr.setSelection(TextSelection.near(tr.doc.resolve(caret), 1));
}

export interface InlineRewrite {
  /** Offsets in the canonical visible source, not ProseMirror document positions. */
  from: number;
  to2: number;
  insert: string;
}

export function rewriteInlineBlock(
  state: EditorState,
  syntaxType: NodeType,
  edit: InlineRewrite,
  escapeType?: NodeType,
): Transaction | null {
  const { $from } = state.selection;
  let depth = $from.depth;
  while (depth > 0 && !$from.node(depth).isTextblock) depth--;
  const parent = $from.node(depth);
  if (!parent.isTextblock || parent.type.spec.code) return null;

  const marks = state.schema.marks as Record<string, MarkType | undefined>;
  const parentStart = $from.start(depth);
  const snapshot = serializeInlineBlock(parent, syntaxType, marks);
  if (!snapshot) return null;
  const enabled = supportedInlineMarks(marks);

  const start5 = edit.from;
  const end = edit.to2;
  if (start5 === undefined || end === undefined || start5 > end) return null;
  const nextSource =
    snapshot.source.slice(0, start5) +
    edit.insert +
    snapshot.source.slice(end);
  const next = parseInlineDelimiters(nextSource, enabled);
  const nodes = inlineNodes(
    state.schema,
    inlineTextSegments(next, enabled),
    next,
    escapeType,
  );
  const tr = state.tr.replaceWith(
    parentStart,
    parentStart + parent.content.size,
    Fragment.fromArray(nodes),
  );
  const caretSource = Math.max(0, start5 + edit.insert.length);
  const caret = parentStart + (next.sourceToText[caretSource] ?? next.text.length);
  tr.setSelection(TextSelection.create(tr.doc, Math.max(0, Math.min(tr.doc.content.size, caret))));
  return tr;
}

/**
 * Re-parse the current paragraph whenever its meaningful text/mark projection
 * changed. This is the semantic half of the renderer; `appendTransaction`
 * separately adds the visible delimiter nodes for the active mark.
 */
export function normalizeInlineBlock(
  state: EditorState,
  syntaxType: NodeType,
  escapeType?: NodeType,
): Transaction | null {
  const { $from } = state.selection;
  let depth = $from.depth;
  while (depth > 0 && !$from.node(depth).isTextblock) depth--;
  const parent = $from.node(depth);
  if (!parent.isTextblock || parent.type.spec.code) return null;
  const parentStart = $from.start(depth);
  const marks = state.schema.marks as Record<string, MarkType | undefined>;
  const enabled = supportedInlineMarks(marks);
  const snapshot = serializeInlineBlock(parent, syntaxType, marks);
  if (!snapshot) return null;
  const parsed = parseInlineDelimiters(snapshot.source, enabled);
  const segments = inlineTextSegments(parsed, enabled);
  if (sameSegments(snapshot.segments, segments)) return null;

  const cursorSource = snapshot.at.get(state.selection.from - parentStart) ?? snapshot.source.length;
  const nodes = inlineNodes(state.schema, segments, parsed, escapeType);
  const tr = state.tr.replaceWith(
    parentStart,
    parentStart + parent.content.size,
    Fragment.fromArray(nodes),
  );
  const caret =
    parentStart + (parsed.sourceToText[cursorSource] ?? parsed.text.length);
  tr.setSelection(TextSelection.create(tr.doc, Math.max(0, Math.min(tr.doc.content.size, caret))));
  addActiveMarkersToTransaction(tr, syntaxType);
  return tr;
}

/**
 * 从 `位置` 往两边扫，找出**连续带这个标记**的那一整段。扫不到返回 `null`。
 *
 * ⚠️ 边界只看**所在的文本块**（`$位.start()` / `$位.end()`）：mark 本来就
 * 不跨块，但 `doc.resolve()` 在块外面也能问出东西来——不夹这个边界的话，
 * 段落末尾的加粗会把下一段的字符也扫进来（两段的 mark 恰好相同时看不出来，
 * 隔着别的块时就是一根跨越块边界的高亮）。
 *
 * ⚠️⚠️ **不要拿 `doc.resolve(p).marks()` 当"第 p 个字符的标记"用。**
 * 它答的是"**在 p 这个位置打字会拿到什么 mark**"，也就是**左边那个字符**的
 * mark，而且在节点边界上还会给出 `undefined`。2026-09-26 的第一版就是这么
 * 写的，无头目检里量出来的症状是**两端的标记都画在全段右移一格的地方**：
 * 加粗的 `一二三四五` 显示成了 `一**二三四五***`（左边那个 `**` 落在第二个
 * 字前面，右边那个落到了段外）。原因是 `marks()` 取的是左邻居：
 *
 * - 在"加粗段的**起点**"那一处问，左边是没加粗的字 → 答"没有" → 左边界
 *   只肯退到 `起点 + 1`（**晚一格**）；
 * - 在"加粗段的**终点**"那一处问，左边是加粗的字 → 答"有" → 右边界
 *   一直走出去（**远一格**）。
 *
 * 所以下面**自己数**：把这一块的行内孩子挨个摊平成一串位置区间，直接问
 * "第 j 个位置落在哪个孩子里、那个孩子带不带这个标记"。行内原子（行内公式、
 * 图片、软换行）各占**一个**位置、一律算"不带标记"——它们本来就不能带 mark。
 *
 * 这段是**线性**的（每个位置都要从后往前扫一遍孩子表），但 n 是"这一块里
 * 行内孩子的个数"，一段文字最多几十个，而且只在光标所在的那一块上跑。
 */

export interface SyntaxMarkerRange {
  from: number;
  to2: number;
  text4: string;
  syntax: string;
  side: "left" | "right";
}

export interface ActiveMarkRange {
  name: string;
  left: string;
  right: string;
  from: number;
  to2: number;
  leftMarker: SyntaxMarkerRange | null;
  rightMarker: SyntaxMarkerRange | null;
}

/**
 * 找光标当前所在、且与光标相邻的那一段同一行内标记。
 *
 * 与旧的 `scanOneParagraph` 不同，这里的文档允许已经存在真实语法字符。
 * 光标停在 `**|粗体**`、`**粗体|**`、`**粗体**|` 三个位置时都算命中；
 * 只有再向外走进普通正文时，语法字符才会收起。
 */
export function findActiveMarkRange(
  doc: PMNode,
  position2: number,
  type: MarkType,
  syntaxType: NodeType,
): ActiveMarkRange | null {
  const at = doc.resolve(position2);
  let depth = at.depth;
  // 光标停在临时语法节点的文字里时，`$from.parent` 是 `notaSyntax` 自己；
  // 真正要找的带格式文本与相邻节点在上一层段落里。
  while (depth > 0 && at.node(depth).type === syntaxType) depth--;
  const parent = at.node(depth);
  if (!parent.inlineContent) return null;

  const rows: Array<{
    from: number;
    to2: number;
    marked: boolean;
    syntax: SyntaxNodeAttribute | null;
  }> = [];
  let offset = at.start(depth);
  for (let i = 0; i < parent.childCount; i++) {
    const child = parent.child(i);
    const syntax = child.type === syntaxType ? child : null;
    const attrs = syntax?.attrs as Partial<SyntaxNodeAttribute> | undefined;
    rows.push({
      from: offset,
      to2: offset + child.nodeSize,
      marked: child.isText && !syntax && type.isInSet(child.marks) !== undefined,
      syntax: syntax
        ? {
            syntax: typeof attrs?.syntax === "string" ? attrs.syntax : "",
            side: attrs?.side === "right" ? "right" : "left",
            symbol: typeof attrs?.symbol === "string" ? attrs.symbol : "*",
          }
        : null,
    });
    offset += child.nodeSize;
  }

  for (let i = 0; i < rows.length; i++) {
    if (!rows[i]!.marked) continue;
    const begin = i;
    let end = i;
    while (end + 1 < rows.length && rows[end + 1]!.marked) end++;

    const contentFrom = rows[begin]!.from;
    const contentTo = rows[end]!.to2;
    const markerGroup = (
      index: number,
      direction: -1 | 1,
      side: "left" | "right",
    ): SyntaxMarkerRange | null => {
      const first = rows[index];
      const spec = noticeTable.find((item) => item.name3 === type.name);
      const expected = spec
        ? Array.from(side === "left" ? spec.left : spec.right).length
        : 0;
      if (
        first?.syntax?.syntax !== type.name ||
        first.syntax.side !== side
      ) {
        return null;
      }
      let edge = index;
      while (
        rows[edge + direction]?.syntax?.syntax === type.name &&
        rows[edge + direction]?.syntax?.side === side &&
        Math.abs(edge - index) + 1 < expected
      ) {
        edge += direction;
      }
      const ordered =
        direction < 0
          ? rows.slice(edge, index + 1)
          : rows.slice(index, edge + 1);
      return {
        from: ordered[0]!.from,
        to2: ordered.at(-1)!.to2,
        text4: ordered.map((row) => row.syntax?.symbol ?? "*").join(""),
        syntax: type.name,
        side,
      };
    };
    const adjacentSyntaxMarker = (
      start5: number,
      direction: -1 | 1,
      side: "left" | "right",
    ): SyntaxMarkerRange | null => {
      for (
        let index = start5;
        rows[index]?.syntax?.side === side;
        index += direction
      ) {
        if (rows[index]?.syntax?.syntax === type.name) {
          return markerGroup(index, direction, side);
        }
      }
      return null;
    };
    const leftMarker =
      begin > 0 ? adjacentSyntaxMarker(begin - 1, -1, "left") : null;
    const rightMarker =
      end + 1 < rows.length
        ? adjacentSyntaxMarker(end + 1, 1, "right")
        : null;
    // Nested marks produce adjacent marker groups (`***1***`). At the outer
    // edge the cursor is still inside every nested mark, even if its own
    // two-star group closed one node earlier. Extend the hit area through the
    // adjacent marker cluster; otherwise selecting the outer edge removes the
    // emphasis markers first and turns a triple-star edit into a strong-only
    // edit before Backspace ever reaches the nested reducer.
    let leftBoundary = contentFrom;
    for (let row = begin - 1; row >= 0 && rows[row]?.syntax?.side === "left"; row--) {
      leftBoundary = rows[row]!.from;
    }
    let rightBoundary = contentTo;
    for (
      let row = end + 1;
      row < rows.length && rows[row]?.syntax?.side === "right";
      row++
    ) {
      rightBoundary = rows[row]!.to2;
    }
    if (position2 >= leftBoundary && position2 <= rightBoundary) {
      const spec = noticeTable.find((item) => item.name3 === type.name);
      if (!spec) return null;
      return {
        name: spec.name3,
        left: spec.left,
        right: spec.right,
        from: contentFrom,
        to2: contentTo,
        leftMarker,
        rightMarker,
      };
    }
    i = end;
  }
  return null;
}
