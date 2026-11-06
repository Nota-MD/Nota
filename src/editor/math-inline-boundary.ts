import type { EditorState } from "@milkdown/kit/prose/state";
import { NodeSelection, Plugin, TextSelection } from "@milkdown/kit/prose/state";
import type { EditorView } from "@milkdown/kit/prose/view";
import { $prose } from "@milkdown/kit/utils";
import { commonStyleCurrentKey } from "./math-current";

export function inlineMathBeforeCaret(state: EditorState): number | null {
  const selection = state.selection;
  if (!(selection instanceof TextSelection) || !selection.empty) return null;
  return selection.$from.nodeBefore?.type.name === "math_inline"
    ? selection.from - selection.$from.nodeBefore.nodeSize
    : null;
}

export function inlineMathAfterCaret(state: EditorState): number | null {
  if (!state.selection.empty) return null;
  const { $from } = state.selection;
  return $from.nodeAfter?.type.name === "math_inline"
    ? state.selection.from
    : null;
}

/** Replace a selected math atom with the text caret immediately after it. */
export function releaseInlineMathNodeSelection(
  view: EditorView,
  getPos: () => number | undefined,
): boolean {
  if (!(view.state.selection instanceof NodeSelection)) return false;
  const position = getPos();
  if (typeof position !== "number") return false;
  const node = view.state.doc.nodeAt(position);
  if (!node) return false;
  const after = position + node.nodeSize;
  const tr = view.state.tr.setSelection(TextSelection.create(view.state.doc, after));
  tr.setMeta(commonStyleCurrentKey, after);
  view.dispatch(tr);
  return true;
}

export function createInlineMathHitZones(): { before: HTMLElement; after: HTMLElement } {
  const create = (side: "before" | "after"): HTMLElement => {
    const element = document.createElement("span");
    element.className = `nota-math-hit nota-math-hit-${side}`;
    element.contentEditable = "false";
    return element;
  };
  return { before: create("before"), after: create("after") };
}

export function inlineMathHitCaret(
  target: EventTarget | null,
  before: HTMLElement,
  after: HTMLElement,
  length: number,
): number | null {
  if (target === before) return 0;
  if (target === after) return length;
  return null;
}

/** Left from the text boundary after inline math enters its source editor. */
export const inlineMathBoundaryEditing = $prose(
  () =>
    new Plugin({
      props: {
        handleKeyDown(view, event) {
          if (
            (event.key !== "ArrowLeft" && event.key !== "ArrowRight") ||
            event.shiftKey ||
            event.ctrlKey ||
            event.metaKey ||
            event.altKey
          ) {
            return false;
          }
          const enteringFromRight = event.key === "ArrowLeft";
          const position = enteringFromRight
            ? inlineMathBeforeCaret(view.state)
            : inlineMathAfterCaret(view.state);
          if (position === null) return false;
          const formula = view.nodeDOM(position);
          const source = formula instanceof Element
            ? formula.querySelector<HTMLInputElement>(".nota-math-source")
            : null;
          if (!source) return false;
          source.focus();
          const caret = enteringFromRight ? source.value.length : 0;
          source.setSelectionRange(caret, caret);
          return true;
        },
      },
    }),
);
