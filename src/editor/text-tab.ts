import { Plugin } from "@milkdown/kit/prose/state";
import {
  TextSelection,
  type EditorState,
  type Transaction,
} from "@milkdown/kit/prose/state";
import { $prose } from "@milkdown/kit/utils";

function indentation(width: number): string {
  return "\u00A0".repeat(Math.max(1, Math.min(8, width)));
}

function inList(state: EditorState): boolean {
  const { $from } = state.selection;
  for (let depth = $from.depth; depth > 0; depth--) {
    const name = $from.node(depth).type.name;
    if (name === "list_item" || name === "listItem") return true;
  }
  return false;
}

function lineStart(state: EditorState, position: number): number {
  const $position = state.doc.resolve(position);
  for (let depth = $position.depth; depth > 0; depth--) {
    if ($position.node(depth).isTextblock) return $position.start(depth);
  }
  return position;
}

function removeIndent(tr: Transaction, documentStart: number, width: number): void {
  const prefix = tr.doc.textBetween(documentStart, Math.min(documentStart + width, tr.doc.content.size));
  const removable = prefix.match(/^[\u00A0 \t]*/)?.[0] ?? "";
  if (removable) tr.delete(documentStart, documentStart + removable.length);
}

/**
 * Tab in ordinary text edits the text block itself. Milkdown's default indent
 * plugin inserts at `selection.to`; on an empty trailing paragraph that lands
 * after the paragraph and can move the user's next character to the wrong
 * block. Lists and tables keep their structural Tab behavior.
 */
export function applyTextTab(
  state: EditorState,
  dispatch: ((transaction: Transaction) => void) | undefined,
  reverse: boolean,
  width: number,
): boolean {
  if (!dispatch || inList(state)) return false;
  const { from, to } = state.selection;

  const tr = state.tr;
  if (from === to) {
    const start = lineStart(state, from);
    if (reverse) removeIndent(tr, start, width);
    else {
      const spaces = indentation(width);
      tr.insertText(spaces, from);
      tr.setSelection(TextSelection.create(tr.doc, from + spaces.length));
    }
  } else {
    const starts: number[] = [];
    state.doc.nodesBetween(from, to, (node, position) => {
      if (node.isTextblock) starts.push(position + 1);
      return !node.isTextblock;
    });
    if (!starts.length) return false;
    for (const start of starts.reverse()) {
      if (reverse) removeIndent(tr, start, width);
      else tr.insertText(indentation(width), start);
    }
  }
  dispatch(tr.scrollIntoView());
  return true;
}

export function textTab(width: number) {
  return $prose(
    () =>
      new Plugin({
        props: {
          handleKeyDown(view, event) {
            if (!view.editable) return false;
            if (event.isComposing || event.keyCode === 229) return false;
            if (event.ctrlKey || event.altKey || event.metaKey) return false;
            if (event.key !== "Tab" && event.keyCode !== 9) return false;
            const selection = view.state.selection;
            const handled = applyTextTab(
              view.state,
              (tr) => view.dispatch(tr),
              event.shiftKey,
              width,
            );
            if (handled && selection.empty && !event.shiftKey) {
              requestAnimationFrame(() => {
                if (view.isDestroyed || view.state.selection.from !== selection.from + indentation(width).length) {
                  return;
                }
                const caret = view.domAtPos(selection.from + indentation(width).length);
                const caretElement =
                  caret.node.nodeType === Node.ELEMENT_NODE
                    ? (caret.node as Element)
                    : caret.node.parentElement;
                const textNode =
                  caret.node.nodeType === Node.TEXT_NODE
                    ? (caret.node as Text)
                    : (Array.from(caretElement?.childNodes ?? []).find(
                        (node) => node.nodeType === Node.TEXT_NODE,
                      ) as Text | undefined) ?? null;
                const domSelection = window.getSelection();
                if (textNode) {
                  domSelection?.setBaseAndExtent(
                    textNode,
                    textNode.length,
                    textNode,
                    textNode.length,
                  );
                } else {
                  domSelection?.setBaseAndExtent(caret.node, caret.offset, caret.node, caret.offset);
                }
                view.focus();
              });
            }
            return handled;
          },
        },
      }),
  );
}
