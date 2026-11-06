/**
 * Caret operations over editable inline delimiter atoms.
 *
 * Typedown keeps the complete Markdown source as the authority and treats
 * delimiters as ordinary source characters. This module applies that rule to
 * Nota's ProseMirror projection without depending on the main hint plugin.
 */

import {
  PluginKey,
  TextSelection,
  type EditorState,
  type Transaction,
} from "@milkdown/kit/prose/state";
import {
  Fragment,
  type MarkType,
  type Node as PMNode,
  type NodeType,
} from "@milkdown/kit/prose/model";
import {
  findActiveMarkRange,
  markHintLiteral,
  normalizeInlineBlock,
  noticeTable,
  rewriteInlineBlock,
  serializeInlineBlock,
} from "./mark-hint-source";
import {
  adjacentSyntaxTarget,
  exactTextSelection,
  textblockDepthFrom,
} from "./inline-caret";

export interface MarkHintState {
  suppressedAt: number | null;
}

export const markHintKey = new PluginKey<MarkHintState>("nota-mark-hint");

/** Insert ordinary source text without atomizing adjacent delimiters. */
export function insertPlainInlineText(
  state: EditorState,
  from: number,
  to2: number,
  text4: string,
): Transaction {
  const tr = state.tr.setStoredMarks([]);
  tr.insertText(text4, from, to2);
  tr.setMeta(markHintLiteral, true);
  return tr;
}

/** Characters that Typedown's Markdown syntax pairing handles. */
export const inlinePairCharacters = "*_$`~";

/**
 * Mirrors Typedown's Markdown-syntax pair gate.
 *
 * A delimiter stays literal after an ASCII letter/digit or a backslash. This
 * preserves ordinary prose such as `2*3`, while allowing formatting at the
 * start of a line, after whitespace/punctuation and after CJK text.
 */
export function shouldStartInlinePair(
  sourceBeforeCaret: string,
  character: string,
  inVerbatim = false,
): boolean {
  if (inVerbatim || !inlinePairCharacters.includes(character)) return false;
  const previous = sourceBeforeCaret.at(-1) ?? "";
  return previous !== "\\" && !/[a-z0-9]/i.test(previous);
}

/**
 * Whether an already paired closer should be stepped over instead of adding
 * another source character. This follows Typedown's duplicate-delimiter
 * branch, including its narrower rule for backticks and emphasis characters.
 */
export function shouldStepOverInlinePair(
  source: string,
  caret: number,
  character: string,
): boolean {
  if (source[caret] !== character) return false;
  if (character === "$") return true;
  const leading = source[caret - 2];
  return (
    "*_`~".includes(character) &&
    leading !== undefined &&
    "_*~".includes(leading)
  );
}

/**
 * Delete an empty delimiter pair as one user-visible unit.
 *
 * Typedown's bracket table includes these five Markdown characters. It
 * deliberately has no backtick entry, so a matched code-span pair keeps the
 * same ordinary Backspace behavior as the reference implementation.
 */
export function emptyInlinePairEdit(
  source: string,
  caret: number,
  direction: "backward" | "forward",
): { from: number; to2: number; caret: number } | null {
  const from = direction === "backward" ? caret - 1 : caret;
  const character = source[from];
  if (
    character === undefined ||
    !"*_$~".includes(character) ||
    source[from + 1] !== character
  ) {
    return null;
  }
  return {
    from,
    to2: from + 2,
    caret: from,
  };
}

/**
 * Navigate through revealed delimiter atoms in source order.
 *
 * WebKit does not reliably move a collapsed DOM caret across an inline atom
 * whose wrapper uses `display: contents`. Only immediate atom boundaries and
 * line edges are handled here; ordinary text movement stays native.
 */
export function moveInlineCaret(
  state: EditorState,
  syntaxType: NodeType,
  key: "ArrowLeft" | "ArrowRight" | "Home" | "End",
): Transaction | null {
  if (!state.selection.empty) return null;
  const { $from } = state.selection;
  const nearInlineAtom =
    $from.parent.type.spec.atom === true ||
    $from.nodeBefore?.type.spec.atom === true ||
    $from.nodeAfter?.type.spec.atom === true;
  const depth = textblockDepthFrom($from);
  const block = $from.node(depth);
  if (!block.isTextblock || block.type.spec.code) return null;

  let target: number | null = null;
  let exitsInlineMark = false;
  if (key === "Home") {
    target = $from.start(depth);
  } else if (key === "End") {
    target = $from.end(depth);
  } else {
    const marks = state.schema.marks as Record<string, MarkType | undefined>;
    for (const { name3 } of noticeTable) {
      const type = marks[name3];
      if (!type) continue;
      const active = findActiveMarkRange(
        state.doc,
        state.selection.from,
        type,
        syntaxType,
      );
      if (!active) continue;
      if (
        key === "ArrowLeft" &&
        active.rightMarker &&
        state.selection.from === active.rightMarker.to2
      ) {
        target = active.rightMarker.to2 - 1;
        break;
      }
      if (
        key === "ArrowLeft" &&
        active.leftMarker &&
        state.selection.from > active.leftMarker.from &&
        state.selection.from <= active.leftMarker.to2
      ) {
        target = state.selection.from - 1;
        exitsInlineMark = target <= active.leftMarker.from;
        break;
      }
      if (
        key === "ArrowLeft" &&
        !active.leftMarker &&
        state.selection.from === active.from
      ) {
        target = active.from;
        exitsInlineMark = true;
        break;
      }
      if (key === "ArrowRight" && state.selection.from === active.to2) break;
    }
    target ??= adjacentSyntaxTarget(
      $from,
      syntaxType,
      key === "ArrowLeft" ? "left" : "right",
    );
  }
  if (target === null) return null;
  if (target === state.selection.from) {
    if (exitsInlineMark || (key === "Home" && !nearInlineAtom)) {
      const tr = state.tr;
      tr.setMeta(markHintKey, state.selection.from);
      tr.setStoredMarks([]);
      return tr;
    }
    if (key === "ArrowRight") {
      const tr = state.tr;
      tr.setMeta(markHintKey, state.selection.from);
      tr.setStoredMarks([]);
      return tr;
    }
    return null;
  }
  const tr = state.tr.setSelection(exactTextSelection(state, target));
  if (exitsInlineMark || (key === "Home" && !nearInlineAtom)) {
    tr.setStoredMarks([]);
  }
  return tr.scrollIntoView();
}

/**
 * Delete one editable delimiter character from the canonical source.
 *
 * Content-boundary Backspace deliberately returns `null`: Typedown first
 * removes the character the caret is actually behind and exposes the marker
 * on a later keypress instead of deleting a whole delimiter pair at once.
 */
export function backspaceInlineDelimiter(
  state: EditorState,
  syntaxType: NodeType,
  _escapeType?: NodeType,
): Transaction | null {
  if (!state.selection.empty) return null;
  const { $from } = state.selection;
  const depth = textblockDepthFrom($from);
  const parent = $from.node(depth);
  if (!parent.isTextblock || parent.type.spec.code) return null;
  const marks = state.schema.marks as Record<string, MarkType | undefined>;
  const snapshot = serializeInlineBlock(parent, syntaxType, marks);
  if (!snapshot) return null;

  for (const spec of noticeTable) {
    const type = marks[spec.name3];
    if (!type) continue;
    const active = findActiveMarkRange(
      state.doc,
      state.selection.from,
      type,
      syntaxType,
    );
    if (!active) continue;

    let markerStart: number | null = null;
    let markerText = "";
    let offset = 0;
    if (
      active.leftMarker &&
      state.selection.from > active.leftMarker.from &&
      state.selection.from <= active.leftMarker.to2
    ) {
      const contentStart = snapshot.at.get(active.from - $from.start(depth));
      if (contentStart === undefined) continue;
      markerStart = contentStart - active.leftMarker.text4.length;
      markerText = active.leftMarker.text4;
      offset = state.selection.from - active.leftMarker.from;
    } else if (
      active.rightMarker &&
      state.selection.from > active.rightMarker.from &&
      state.selection.from <= active.rightMarker.to2
    ) {
      const contentEnd = snapshot.at.get(active.to2 - $from.start(depth));
      if (contentEnd === undefined) continue;
      markerStart = contentEnd;
      markerText = active.rightMarker.text4;
      offset = state.selection.from - active.rightMarker.from;
    }
    if (markerStart === null || offset <= 0) continue;
    if (
      markerText &&
      snapshot.source.slice(markerStart, markerStart + markerText.length) !==
        markerText
    ) {
      continue;
    }
    const sourceIndex = markerStart + offset - 1;
    if (sourceIndex < 0 || sourceIndex >= snapshot.source.length) continue;
    return rewriteInlineBlock(state, syntaxType, {
      from: sourceIndex,
      to2: Math.min(markerStart + markerText.length, sourceIndex + 1),
      insert: "",
    });
  }
  return null;
}

/** Remove an empty auto-paired delimiter before native Backspace handling. */
export function backspaceEmptyInlinePair(
  state: EditorState,
  syntaxType: NodeType,
): Transaction | null {
  return deleteEmptyInlinePair(state, syntaxType, "backward");
}

/** Remove an empty auto-paired delimiter before native Delete handling. */
export function deleteEmptyInlinePairForward(
  state: EditorState,
  syntaxType: NodeType,
): Transaction | null {
  return deleteEmptyInlinePair(state, syntaxType, "forward");
}

function deleteEmptyInlinePair(
  state: EditorState,
  syntaxType: NodeType,
  direction: "backward" | "forward",
): Transaction | null {
  if (!state.selection.empty) return null;
  const { $from } = state.selection;
  const depth = textblockDepthFrom($from);
  const parent = $from.node(depth);
  if (!parent.isTextblock || parent.type.spec.code) return null;
  const marks = state.schema.marks as Record<string, MarkType | undefined>;
  const snapshot = serializeInlineBlock(parent, syntaxType, marks);
  if (!snapshot) return null;
  for (const { name3 } of noticeTable) {
    const type = marks[name3];
    if (!type) continue;
    const active = findActiveMarkRange(
      state.doc,
      state.selection.from,
      type,
      syntaxType,
    );
    for (const marker of [active?.leftMarker, active?.rightMarker]) {
      if (
        marker &&
        state.selection.from >= marker.from &&
        state.selection.from <= marker.to2
      ) {
        return null;
      }
    }
  }
  const caret = snapshot.at.get(state.selection.from - $from.start(depth));
  if (caret === undefined) return null;
  const edit = emptyInlinePairEdit(snapshot.source, caret, direction);
  if (!edit) return null;
  return rewriteInlineBlock(state, syntaxType, { ...edit, insert: "" });
}

export function deleteInlineDelimiter(
  state: EditorState,
  syntaxType: NodeType,
): Transaction | null {
  if (!state.selection.empty) return null;
  const { $from } = state.selection;
  const depth = textblockDepthFrom($from);
  const parent = $from.node(depth);
  if (!parent.isTextblock || parent.type.spec.code) return null;
  const marks = state.schema.marks as Record<string, MarkType | undefined>;
  const snapshot = serializeInlineBlock(parent, syntaxType, marks);
  if (!snapshot) return null;

  for (const { name3 } of noticeTable) {
    const type = marks[name3];
    if (!type) continue;
    const active = findActiveMarkRange(
      state.doc,
      state.selection.from,
      type,
      syntaxType,
    );
    const leftMarker = active?.leftMarker;
    if (
      active &&
      leftMarker &&
      state.selection.from >= leftMarker.from &&
      state.selection.from < leftMarker.to2
    ) {
      const contentStart = snapshot.at.get(active.from - $from.start(depth));
      if (contentStart === undefined) continue;
      const sourceIndex =
        contentStart -
        leftMarker.text4.length +
        state.selection.from -
        leftMarker.from;
      if (
        snapshot.source.slice(
          contentStart - leftMarker.text4.length,
          contentStart,
        ) !== leftMarker.text4
      ) {
        continue;
      }
      return rewriteInlineBlock(state, syntaxType, {
        from: sourceIndex,
        to2: sourceIndex + 1,
        insert: "",
      });
    }
    const marker = active?.rightMarker;
    if (
      !active ||
      !marker ||
      state.selection.from < active.to2 ||
      state.selection.from > marker.to2
    ) {
      continue;
    }
    const contentEnd = snapshot.at.get(active.to2 - $from.start(depth));
    if (contentEnd === undefined || contentEnd >= snapshot.source.length) continue;
    const sourceIndex = Math.min(
      contentEnd + state.selection.from - active.to2,
      contentEnd + marker.text4.length - 1,
    );
    if (
      snapshot.source.slice(contentEnd, contentEnd + marker.text4.length) !==
      marker.text4
    ) {
      continue;
    }
    return rewriteInlineBlock(state, syntaxType, {
      from: sourceIndex,
      to2: sourceIndex + 1,
      insert: "",
    });
  }
  return null;
}

/**
 * Insert text through the canonical inline source.
 *
 * `autoPair` is the Typedown input-controller mode. Complete Markdown input
 * is tokenized synchronously by `rewriteInlineBlock`; incomplete delimiters
 * remain ordinary text.
 */
export function inputInlineDelimiter(
  state: EditorState,
  syntaxType: NodeType,
  _from: number,
  _to2: number,
  text4: string,
  escapeType?: NodeType,
  literal = false,
  autoPair = false,
): Transaction | null {
  const { $from } = state.selection;
  const depth = textblockDepthFrom($from);
  const parent = $from.node(depth);
  if (!parent.isTextblock || parent.type.spec.code) return null;
  const marks = state.schema.marks as Record<string, MarkType | undefined>;
  const snapshot = serializeInlineBlock(parent, syntaxType, marks);
  if (!snapshot) return null;

  const selectionFrom = state.selection.from;
  const selectionTo = state.selection.to;
  let sourceFrom = snapshot.at.get(selectionFrom - $from.start(depth));
  let sourceTo = snapshot.at.get(selectionTo - $from.start(depth));
  if (sourceFrom === undefined || sourceTo === undefined) return null;

  let closingLength = 0;
  let insideMarker = false;
  for (const { name3 } of noticeTable) {
    const type = marks[name3];
    if (!type) continue;
    const active = findActiveMarkRange(
      state.doc,
      selectionFrom,
      type,
      syntaxType,
    );
    const leftMarker = active?.leftMarker;
    if (
      leftMarker &&
      selectionFrom >= leftMarker.from &&
      selectionFrom < leftMarker.to2
    ) {
      const contentStart = snapshot.at.get(active.from - $from.start(depth));
      if (contentStart !== undefined) {
        sourceFrom =
          contentStart -
          leftMarker.text4.length +
          selectionFrom -
          leftMarker.from;
        insideMarker = true;
      }
    }
    const rightMarker = active?.rightMarker;
    if (
      rightMarker &&
      selectionFrom > rightMarker.from &&
      selectionFrom < rightMarker.to2
    ) {
      const contentEnd = snapshot.at.get(active.to2 - $from.start(depth));
      if (contentEnd !== undefined) {
        sourceFrom =
          contentEnd + selectionFrom - rightMarker.from;
        insideMarker = true;
      }
    }
    if (active?.rightMarker && selectionFrom === active.rightMarker.to2) {
      closingLength = Math.max(closingLength, active.rightMarker.text4.length);
    }
    if (!active?.rightMarker && active && selectionFrom === active.to2) {
      closingLength = Math.max(closingLength, active.right.length);
    }
  }
  if (!insideMarker) {
    sourceFrom = Math.min(snapshot.source.length, sourceFrom + closingLength);
  }
  if (selectionFrom === selectionTo) sourceTo = sourceFrom;

  let insert = text4;
  let caret = sourceFrom + text4.length;
  if (autoPair && selectionFrom === selectionTo && text4.length === 1) {
    const codeType = marks.inlineCode;
    const inVerbatim =
      codeType !== undefined &&
      findActiveMarkRange(
        state.doc,
        selectionFrom,
        codeType,
        syntaxType,
      ) !== null;
    if (shouldStepOverInlinePair(snapshot.source, sourceFrom, text4)) {
      return rewriteInlineBlock(state, syntaxType, {
        from: sourceFrom,
        to2: sourceFrom,
        insert: "",
        caret: sourceFrom + 1,
      }, escapeType);
    }
    if (
      shouldStartInlinePair(
        snapshot.source.slice(0, sourceFrom),
        text4,
        inVerbatim,
      )
    ) {
      insert = text4 + text4;
      caret = sourceFrom + 1;
    }
  }

  const edit = {
    from: sourceFrom,
    to2: sourceTo,
    insert,
    caret,
  };
  if (literal) {
    const nextSource =
      snapshot.source.slice(0, sourceFrom) +
      insert +
      snapshot.source.slice(sourceTo);
    const literalType = state.schema.nodes.notaLiteral;
    const nodes: PMNode[] = [];
    let text = "";
    const flush = (): void => {
      if (text) nodes.push(state.schema.text(text));
      text = "";
    };
    for (const symbol of Array.from(nextSource)) {
      if ("\\*_~`=^<>$".includes(symbol)) {
        flush();
        if (literalType) nodes.push(literalType.create({ symbol }));
        else text += symbol;
      } else {
        text += symbol;
      }
    }
    flush();
    const parentStart = $from.start(depth);
    const literalTr = state.tr.replaceWith(
      parentStart,
      parentStart + parent.content.size,
      Fragment.fromArray(nodes),
    );
    literalTr.setSelection(
      TextSelection.create(
        literalTr.doc,
        parentStart + caret,
      ),
    );
    literalTr.setMeta(markHintLiteral, true);
    return literalTr;
  }
  return rewriteInlineBlock(state, syntaxType, edit, escapeType);
}

/** Compatibility entry for callers that specifically target a right marker. */
export function backspaceAfterRightMarker(
  state: EditorState,
  syntaxType: NodeType,
): Transaction | null {
  return backspaceInlineDelimiter(state, syntaxType);
}

/** Compatibility entry for callers that specifically target a left marker. */
export function backspaceAtLeftMarker(
  state: EditorState,
  syntaxType: NodeType,
): Transaction | null {
  return backspaceInlineDelimiter(state, syntaxType);
}

/** Compatibility entry for inserting one delimiter character at the caret. */
export function restoreStrongAfterThirdStar(
  state: EditorState,
  syntaxType: NodeType,
): Transaction | null {
  if (!state.selection.empty) return null;
  return inputInlineDelimiter(
    state,
    syntaxType,
    state.selection.from,
    state.selection.to,
    "*",
  );
}

/** Promote a complete literal pair after any document change. */
export function promotePairedMark(
  state: EditorState,
  syntaxType: NodeType,
): Transaction | null {
  return normalizeInlineBlock(state, syntaxType);
}
