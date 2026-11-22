

import type { Node as PMNode } from "@milkdown/kit/prose/model";
import type { EditorState, Transaction } from "@milkdown/kit/prose/state";
import { NodeSelection, Plugin, PluginKey } from "@milkdown/kit/prose/state";
import { Decoration, DecorationSet } from "@milkdown/kit/prose/view";
import { $prose } from "@milkdown/kit/utils";

export const inlineName = "math_inline";
export const blockName = "math_block";
const currentClass = "nota-math-current";
const currentMark = "math current";

export function recognizeNode(node: PMNode): "inline" | "block" | null {
  if (node.type.name === inlineName) return "inline";
  if (node.type.name === blockName) return "block";
  return null;
}

function createCurrentDecoration(position2: number, rulerInch: number): Decoration {
  return Decoration.node(position2, position2 + rulerInch, { class: currentClass }, { [currentMark]: true });
}

/** A formula is selected either as a node or through an adjacent text caret. */
export function computeDecorations(
  state: EditorState,
  suppressedAt: number | null = null,
): DecorationSet {
  const select = state.selection;
  if (select instanceof NodeSelection) {
    if (recognizeNode(select.node) === null) return DecorationSet.empty;
    return DecorationSet.create(state.doc, [createCurrentDecoration(select.from, select.node.nodeSize)]);
  }
  void suppressedAt;
  if (!select.empty || !select.$from.parent.inlineContent) {
    return DecorationSet.empty;
  }
  const before2 = select.$from.nodeBefore;
  const after2 = select.$from.nodeAfter;
  const position2 =
    before2?.type.name === inlineName
      ? select.from - before2.nodeSize
      : after2?.type.name === inlineName
        ? select.from
        : null;
  if (position2 === null) return DecorationSet.empty;
  return DecorationSet.create(state.doc, [
    createCurrentDecoration(position2, state.doc.nodeAt(position2)?.nodeSize ?? 1),
  ]);
}


export function returnPositionSelection(state: EditorState): Transaction | null {
  const select = state.selection;
  if (select instanceof NodeSelection) return null;
  const fromValue = select.$from;
  for (let d = fromValue.depth; d > 0; d--) {
    const node = fromValue.node(d);
    if (node.type.name !== blockName) continue;
    const position2 = fromValue.before(d);
    if (select.from <= position2 || select.to >= position2 + node.nodeSize) return null;
    return state.tr.setSelection(NodeSelection.create(state.doc, position2));
  }
  return null;
}

interface CommonStyleCurrentState {
  suppressedAt: number | null;
  pendingFocusAt: number | null;
}

export const commonStyleCurrentKey = new PluginKey<CommonStyleCurrentState>("nota-math-current-state");
export const inlineMathFocusRequest = "nota-inline-math-focus-request";
export const inlineMathFocusConsumed = "nota-inline-math-focus-consumed";

export function pendingInlineMathFocus(state: EditorState): number | null {
  return commonStyleCurrentKey.getState(state)?.pendingFocusAt ?? null;
}

function currentStateOf(state: EditorState): CommonStyleCurrentState {
  return commonStyleCurrentKey.getState(state) ?? { suppressedAt: null, pendingFocusAt: null };
}

export const commonStyleCurrent = $prose(
  () =>
    new Plugin({
      key: commonStyleCurrentKey,
      state: {
        init: (): CommonStyleCurrentState => ({ suppressedAt: null, pendingFocusAt: null }),
        apply: (tr, value) => {
          const own = tr.getMeta(commonStyleCurrentKey) as number | null | undefined;
          const focusAt = tr.getMeta(inlineMathFocusRequest) as number | undefined;
          const consumed = tr.getMeta(inlineMathFocusConsumed) === true;
          if (own !== undefined || focusAt !== undefined || consumed) {
            return {
              suppressedAt: own !== undefined ? own : value.suppressedAt,
              pendingFocusAt: consumed ? null : focusAt ?? value.pendingFocusAt,
            };
          }
          if (tr.docChanged) return { suppressedAt: null, pendingFocusAt: value.pendingFocusAt };
          if (tr.selectionSet) {
            const samePoint =
              value.suppressedAt !== null && tr.selection.from === value.suppressedAt;
            return samePoint ? value : { ...value, suppressedAt: null };
          }
          return value;
        },
      },
      props: {
        decorations: (state) => computeDecorations(state, currentStateOf(state).suppressedAt),
      },
      appendTransaction: (_transactions, _oldState, newState) => returnPositionSelection(newState),
    }),
);

export function readDecoration(decorations: readonly Decoration[]): boolean {
  return decorations.some((d) => d.spec?.[currentMark] === true);
}
