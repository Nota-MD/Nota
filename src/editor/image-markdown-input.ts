import { $inputRule, $prose } from "@milkdown/kit/utils";
import { InputRule } from "@milkdown/kit/prose/inputrules";
import {
  Plugin,
  PluginKey,
  Selection,
} from "@milkdown/kit/prose/state";
import type { EditorState, Transaction } from "@milkdown/kit/prose/state";
import type { EditorView } from "@milkdown/kit/prose/view";

import { parseImageMarkdownSource } from "./video-view";

export const explicitImageMarkdownSyntax =
  /!\[((?:\\.|[^\]])*)\]\(\s*(\S+?)(?:\s+["']((?:\\.|[^"'])*)["'])?\s*\)$/;

function imageTransaction(
  state: EditorState,
  source: string,
  from: number,
  to: number,
): Transaction | null {
  const parsed = parseImageMarkdownSource(source);
  const image = state.schema.nodes.image;
  if (!parsed || !image) return null;
  const node = image.create(parsed);
  const transaction = state.tr.replaceWith(from, to, node);
  transaction.setSelection(
    Selection.near(transaction.doc.resolve(from + node.nodeSize), 1),
  );
  return transaction;
}

export function explicitImageAtClosingParenthesis(
  state: EditorState,
  position: number,
): Transaction | null {
  if (!state.selection.empty || state.selection.from !== position) return null;
  const resolved = state.doc.resolve(position);
  if (!resolved.parent.inlineContent || resolved.parent.type.spec.code) {
    return null;
  }
  if (resolved.parentOffset >= resolved.parent.content.size) return null;
  if (
    resolved.parent.textBetween(
      resolved.parentOffset,
      resolved.parentOffset + 1,
      "\n",
      "\uFFFC",
    ) !== ")"
  ) {
    return null;
  }
  const before = resolved.parent.textBetween(
    0,
    resolved.parentOffset,
    "\n",
    "\uFFFC",
  );
  const source = `${before})`;
  const match = explicitImageMarkdownSyntax.exec(source);
  if (!match) return null;
  const from = resolved.start() + before.length - match[0].length + 1;
  return imageTransaction(state, match[0], from, position + 1);
}

export function explicitImageAtTypedParenthesis(
  state: EditorState,
  position: number,
  typed: string,
): Transaction | null {
  if (typed !== ")" || !state.selection.empty || state.selection.from !== position) {
    return null;
  }
  const resolved = state.doc.resolve(position);
  if (!resolved.parent.inlineContent || resolved.parent.type.spec.code) {
    return null;
  }
  const before = resolved.parent.textBetween(
    0,
    resolved.parentOffset,
    "\n",
    "\uFFFC",
  );
  const source = `${before})`;
  const match = explicitImageMarkdownSyntax.exec(source);
  if (!match) return null;
  const from = resolved.start() + before.length - match[0].length + 1;
  return imageTransaction(state, match[0], from, position);
}

export function explicitImageInput() {
  return [
    $inputRule(() =>
      new InputRule(explicitImageMarkdownSyntax, (state, match, start, end) => {
        return imageTransaction(state, match[0] ?? "", start, end);
      }),
    ),
  ];
}

export function explicitImageTyping() {
  const key = new PluginKey("nota-explicit-image-typing");
  return $prose(
    () => {
      let view: EditorView | null = null;
      let timer: ReturnType<typeof setTimeout> | null = null;
      const cancel = () => {
        if (timer !== null) globalThis.clearTimeout(timer);
        timer = null;
      };
      const schedule = (state: EditorState) => {
        cancel();
        const position = state.selection.from;
        if (!explicitImageAtClosingParenthesis(state, position)) return;
        const expected = state.doc;
        timer = globalThis.setTimeout(() => {
          timer = null;
          if (!view || view.isDestroyed || view.composing) return;
          if (
            !view.state.doc.eq(expected) ||
            !view.state.selection.empty ||
            view.state.selection.from !== position
          ) {
            return;
          }
          const transaction = explicitImageAtClosingParenthesis(
            view.state,
            position,
          );
          if (transaction) view.dispatch(transaction.setMeta(key, true));
        }, 280);
      };
      return new Plugin({
        key,
        view(editorView) {
          view = editorView;
          return {
            destroy() {
              cancel();
              view = null;
            },
          };
        },
        props: {
          handleTextInput(editorView, from, to, text) {
            if (text !== ")" || editorView.composing) return false;
            if (!editorView.state.selection.empty || from !== to) return false;
            const transaction = explicitImageAtTypedParenthesis(
              editorView.state,
              from,
              text,
            );
            if (!transaction) return false;
            editorView.dispatch(transaction);
            return true;
          },
        },
        appendTransaction(transactions, _oldState, newState) {
          if (!transactions.some((transaction) => transaction.docChanged)) {
            return null;
          }
          if (transactions.some((transaction) => transaction.getMeta(key))) {
            return null;
          }
          if (
            transactions.some(
              (transaction) =>
                transaction.getMeta("composition") !== undefined,
            )
          ) {
            return null;
          }
          schedule(newState);
          return null;
        },
        handleKeyDown(editorView: EditorView, event: KeyboardEvent) {
          if (
            event.key !== ")" ||
            event.ctrlKey ||
            event.metaKey ||
            event.altKey ||
            editorView.composing
          ) {
            return false;
          }
          const { selection } = editorView.state;
          if (!selection.empty) return false;
          const transaction = explicitImageAtClosingParenthesis(
            editorView.state,
            selection.from,
          );
          if (!transaction) return false;
          editorView.dispatch(transaction);
          return true;
        },
      });
    },
  );
}
