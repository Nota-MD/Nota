import type { ResolvedPos } from "@milkdown/kit/prose/model";
import type { NodeType } from "@milkdown/kit/prose/model";
import { TextSelection, type EditorState } from "@milkdown/kit/prose/state";

/**
 * Inline editor boundary helpers.
 *
 * ProseMirror's `TextSelection.near()` is intentionally permissive: around an
 * inline atom with `content: "text*"` it may put the caret inside that atom.
 * Input controls and source-marker widgets need the exact position before or
 * after the atom instead. Keeping that distinction here prevents each plugin
 * from inventing a different exit rule.
 */
export function exactTextSelection(state: EditorState, position: number): TextSelection {
  return TextSelection.create(state.doc, position);
}

export function textblockDepthFrom($from: ResolvedPos): number {
  let depth = $from.depth;
  while (depth > 0 && !$from.node(depth).isTextblock) depth--;
  return depth;
}

export function adjacentSyntaxTarget(
  $from: ResolvedPos,
  syntaxType: NodeType,
  direction: "left" | "right",
): number | null {
  const sibling = direction === "left" ? $from.nodeBefore : $from.nodeAfter;
  if (sibling?.type !== syntaxType) return null;
  return $from.pos + (direction === "left" ? -1 : 1);
}
