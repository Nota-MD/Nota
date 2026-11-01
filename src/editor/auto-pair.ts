import { $prose } from "@milkdown/kit/utils";
import { Plugin, PluginKey, TextSelection } from "@milkdown/kit/prose/state";
import type { EditorState, Transaction } from "@milkdown/kit/prose/state";
import type { EditorView } from "@milkdown/kit/prose/view";

/** Opening characters paired by the basic Typora-style policy. */
export const bracketPairs: Readonly<Record<string, string>> = {
  "(": ")",
  "[": "]",
  "{": "}",
  "（": "）",
  "【": "】",
  "「": "」",
  "『": "』",
  "《": "》",
  "〈": "〉",
};

const closingBrackets: Readonly<Record<string, string>> = Object.fromEntries(
  Object.entries(bracketPairs).map(([open, close]) => [close, open]),
);

function isCodeContext(state: EditorState, position: number): boolean {
  const resolved = state.doc.resolve(position);
  for (let depth = resolved.depth; depth > 0; depth -= 1) {
    if (resolved.node(depth).type.spec.code) return true;
  }
  return resolved.marks().some((mark) => mark.type.spec.code);
}

function textAround(state: EditorState, from: number): { before: string; after: string } {
  const $from = state.doc.resolve(from);
  const before =
    $from.parentOffset > 0
      ? $from.parent.textBetween(Math.max(0, $from.parentOffset - 1), $from.parentOffset, "", "")
      : "";
  const after =
    $from.parentOffset < $from.parent.content.size
      ? $from.parent.textBetween($from.parentOffset, $from.parentOffset + 1, "", "")
      : "";
  return { before, after };
}

/** Build the transaction for a pair inserted or skipped at the current input. */
export function pairedInputTransaction(
  state: EditorState,
  from: number,
  to: number,
  character: string,
): Transaction | null {
  if (character.length !== 1 || isCodeContext(state, from) || isCodeContext(state, to)) return null;
  const $from = state.doc.resolve(from);
  const $to = state.doc.resolve(to);
  if (!$from.parent.inlineContent || !$from.sameParent($to)) return null;

  const { before, after } = textAround(state, from);
  if (before === "\\") return null;

  const close = bracketPairs[character];
  if (close) {
    if (from !== to) {
      const transaction = state.tr.insertText(close, to, to);
      transaction.insertText(character, from, from);
      transaction.setSelection(TextSelection.create(transaction.doc, from + 1, to + 1));
      return transaction.scrollIntoView();
    }
    const transaction = state.tr.insertText(character + close, from, to);
    transaction.setSelection(TextSelection.create(transaction.doc, from + 1));
    return transaction.scrollIntoView();
  }

  if (closingBrackets[character] && after === character) {
    return state.tr.setSelection(TextSelection.create(state.doc, from + 1)).scrollIntoView();
  }
  return null;
}

/** Delete both halves when Backspace is pressed inside an empty pair. */
export function deleteEmptyPairTransaction(state: EditorState): Transaction | null {
  const { selection } = state;
  if (!selection.empty || !selection.$from.parent.inlineContent) return null;
  const { before, after } = textAround(state, selection.from);
  if (!before || bracketPairs[before] !== after) return null;
  return state.tr.delete(selection.from - 1, selection.from + 1).scrollIntoView();
}

/** Move across an adjacent bracket without editing the document. */
export function skipPairBoundaryTransaction(
  state: EditorState,
  direction: 1 | -1,
): Transaction | null {
  const { selection } = state;
  if (!selection.empty || !selection.$from.parent.inlineContent) return null;
  const { before, after } = textAround(state, selection.from);
  const crossing =
    direction === 1 ? closingBrackets[after] !== undefined : bracketPairs[before] !== undefined;
  if (!crossing) return null;
  return state.tr
    .setSelection(TextSelection.create(state.doc, selection.from + direction))
    .scrollIntoView();
}

export const autoPairKey = new PluginKey("nota-auto-pair");

/** Basic bracket pairing for ordinary text blocks. */
export const autoPair = (enabled = true) =>
  $prose(() =>
    new Plugin({
      key: autoPairKey,
      props: {
        handleTextInput: (view: EditorView, from, to, text) => {
          if (!enabled || view.composing) return false;
          const transaction = pairedInputTransaction(view.state, from, to, text);
          if (!transaction) return false;
          view.dispatch(transaction);
          return true;
        },
        handleKeyDown: (view, event) => {
          if (!enabled || view.composing || event.ctrlKey || event.metaKey || event.altKey) return false;
          if (event.key === "Backspace" && !event.shiftKey) {
            const transaction = deleteEmptyPairTransaction(view.state);
            if (!transaction) return false;
            event.preventDefault();
            view.dispatch(transaction);
            return true;
          }
          if (event.key === "Tab") {
            const transaction = skipPairBoundaryTransaction(view.state, event.shiftKey ? -1 : 1);
            if (!transaction) return false;
            event.preventDefault();
            view.dispatch(transaction);
            return true;
          }
          return false;
        },
      },
    }),
  );
