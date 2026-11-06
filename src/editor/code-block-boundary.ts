/**
 * Move the ProseMirror caret out of a fenced code block.
 *
 * The CodeMirror instance owns the visible caret while a code block is being
 * edited. At either edge of the block an arrow key must produce a real caret
 * in the surrounding document; merely blurring CodeMirror would leave the
 * ProseMirror selection pointing back inside the block.
 *
 * A block may be the first or last node in its parent. In that case there is no
 * adjacent textblock for `TextSelection.near` to land on, so an empty paragraph
 * is inserted on the requested side. That keeps first/last code blocks
 * escapable instead of trapping the caret in CodeMirror.
 */

import type { Node as PMNode } from "@milkdown/kit/prose/model";
import type { EditorState } from "@milkdown/kit/prose/state";
import { TextSelection } from "@milkdown/kit/prose/state";
import type { Transaction } from "@milkdown/kit/prose/state";
import type { EditorView } from "@milkdown/kit/prose/view";

export type CodeBlockExitSide = "before" | "after";

/** Which outer navigation edge a source position belongs to. */
export function codeBlockSourceEdge(
  doc: { length: number },
  position: number,
): "head" | "tail" | "both" | null {
  const atHead = position <= 0;
  const atTail = position >= doc.length;
  if (atHead && atTail) return "both";
  if (atHead) return "head";
  if (atTail) return "tail";
  return null;
}

/** The same line-edge rule for the bootstrap textarea before CodeMirror loads. */
export function bootstrapCodeBlockExit(
  value: string,
  caret: number,
  key: string,
): CodeBlockExitSide | null {
  const atHead =
    caret === 0 &&
    (key === "ArrowLeft" || key === "ArrowUp");
  const atTail =
    caret === value.length &&
    (key === "ArrowRight" || key === "ArrowDown");
  if (atHead) return "before";
  if (atTail) return "after";
  return null;
}

/** Native textarea caret movement that never leaves the source control. */
export function moveBootstrapCodeBlockCaret(
  value: string,
  caret: number,
  key: string,
): number {
  if (key === "ArrowLeft") return Math.max(0, caret - 1);
  if (key === "ArrowRight") return Math.min(value.length, caret + 1);
  const lineStart = value.lastIndexOf("\n", Math.max(0, caret - 1)) + 1;
  const column = caret - lineStart;
  if (key === "ArrowUp") {
    if (lineStart === 0) return 0;
    const previousEnd = lineStart - 1;
    const previousStart = value.lastIndexOf("\n", Math.max(0, previousEnd - 1)) + 1;
    return Math.min(previousStart + column, previousEnd);
  }
  if (key === "ArrowDown") {
    const lineEnd = value.indexOf("\n", caret);
    if (lineEnd < 0) return value.length;
    const nextStart = lineEnd + 1;
    const nextEnd = value.indexOf("\n", nextStart);
    return Math.min(nextStart + column, nextEnd < 0 ? value.length : nextEnd);
  }
  return caret;
}

/**
 * Build the transaction that places the document caret before or after one
 * code block. Returns `null` only when the schema has no paragraph node and no
 * outside textblock exists.
 */
export function codeBlockExitTransaction(
  state: EditorState,
  position: number,
  node: PMNode,
  side: CodeBlockExitSide,
): Transaction | null {
  const blockEnd = position + node.nodeSize;
  const boundary = side === "before" ? position : blockEnd;
  const direction = side === "before" ? -1 : 1;
  const adjacent = TextSelection.near(state.doc.resolve(boundary), direction);
  const landsInsideBlock = adjacent.from >= position && adjacent.from <= blockEnd;

  if (!landsInsideBlock) {
    return state.tr.setSelection(adjacent);
  }

  const paragraph = state.schema.nodes.paragraph;
  if (!paragraph) return null;

  const transaction = state.tr.insert(boundary, paragraph.create());
  return transaction.setSelection(
    TextSelection.create(transaction.doc, boundary + 1),
  );
}

/** Bind one NodeView's head/tail exits to the CodeMirror option names. */
export function createCodeBlockExitNavigator(
  view: EditorView,
  getPos: () => number | undefined,
  nodeName: string,
): { leaveHeadCell: () => void; leaveTailCell: () => void } {
  const leave = (side: CodeBlockExitSide) => {
    const position = getPos();
    if (typeof position !== "number") return;
    const node = view.state.doc.nodeAt(position);
    if (!node || node.type.name !== nodeName) return;
    const transaction = codeBlockExitTransaction(view.state, position, node, side);
    if (!transaction) return;
    view.dispatch(transaction.scrollIntoView());
    view.focus();
  };
  return { leaveHeadCell: () => leave("before"), leaveTailCell: () => leave("after") };
}
