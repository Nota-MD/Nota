import { $prose } from "@milkdown/kit/utils";
import type { Slice } from "@milkdown/kit/prose/model";
import { Plugin, PluginKey, TextSelection } from "@milkdown/kit/prose/state";
import type { EditorState, Transaction } from "@milkdown/kit/prose/state";
import type { EditorView } from "@milkdown/kit/prose/view";

import type { punctuationSettings } from "./smart-punctuation";
import { explicitLinkAtClosingParenthesis } from "./url-link";

/** Opening characters paired by the basic Typora-style policy. */
export const bracketPairs: Readonly<Record<string, string>> = {
  "(": ")",
  "[": "]",
  "{": "}",
  '"': '"',
  "'": "'",
  "（": "）",
  "【": "】",
  "「": "」",
  "『": "』",
  "《": "》",
  "〈": "〉",
  "“": "”",
  "‘": "’",
};

const wordCharacter = /^[\p{L}\p{N}_]$/u;
const inlineNode = "\uFFFC";
const urlBefore = /(?:^|\s)(?:[a-z][\w+.-]*:\/\/|www\.)\S*$/iu;

interface PairRecord {
  open: number;
  close: number;
  opener: string;
  closer: string;
}

interface WrappedComposition {
  from: number;
  content: Slice;
  sizeAfter: number;
}

/** Wait until ProseMirror has read the committed IME text back into state. */
export const bracketCompositionDelayMs = 50;

function isCodeContext(state: EditorState, position: number): boolean {
  const resolved = state.doc.resolve(position);
  for (let depth = resolved.depth; depth > 0; depth -= 1) {
    const node = resolved.node(depth);
    if (node.type.spec.code || node.type.name === "math_inline") return true;
  }
  return resolved.marks().some(
    (mark) => mark.type.spec.code || mark.type.name === "link",
  );
}

function characterBefore(state: EditorState, position: number): string {
  const node = state.doc.resolve(position).nodeBefore;
  if (!node || node.type.name === "hardbreak") return "";
  return node.isText ? node.text!.slice(-1) : inlineNode;
}

function characterAfter(state: EditorState, position: number): string {
  const node = state.doc.resolve(position).nodeAfter;
  if (!node || node.type.name === "hardbreak") return "";
  return node.isText ? node.text!.charAt(0) : inlineNode;
}

function textBefore(state: EditorState, position: number): string {
  const resolved = state.doc.resolve(position);
  return resolved.parent.textBetween(
    0,
    resolved.parentOffset,
    undefined,
    inlineNode,
  );
}

function quotePair(
  character: string,
  before: string,
  punctuation: punctuationSettings,
): { open: string; close: string } | null {
  if (character !== '"' && character !== "'") return null;
  if (character === "'" && wordCharacter.test(before)) return null;
  if (punctuation.mode2 !== "input" || !punctuation.referenceNumber) {
    return { open: character, close: character };
  }
  const shape =
    character === '"'
      ? punctuation.doubleReferenceNumber
      : punctuation.singleReferenceNumber;
  if (shape === "straight") return { open: character, close: character };
  return character === '"'
    ? { open: "“", close: "”" }
    : { open: "‘", close: "’" };
}

function pairForInput(
  state: EditorState,
  from: number,
  character: string,
  punctuation: punctuationSettings,
): { open: string; close: string } | null {
  const before = characterBefore(state, from);
  if (character === '"' || character === "'") {
    return quotePair(character, before, punctuation);
  }
  const close = bracketPairs[character];
  return close ? { open: character, close } : null;
}

function shouldPairAt(
  state: EditorState,
  from: number,
): boolean {
  if (isCodeContext(state, from)) return false;
  if (characterBefore(state, from) === "\\") return false;
  const after = characterAfter(state, from);
  if (after === inlineNode || wordCharacter.test(after)) return false;
  if (urlBefore.test(textBefore(state, from))) return false;
  return true;
}

function trackedPairAtClose(
  state: EditorState,
  position: number,
): PairRecord | undefined {
  return pairStateKey.getState(state)?.find((pair) => pair.close === position);
}

function withPair(transaction: Transaction, pair: PairRecord): Transaction {
  return transaction.setMeta(pairStateKey, pair);
}

function wrapComposition(
  transaction: Transaction,
  from: number,
  opener: string,
  closer: string,
  content: Slice,
): Transaction {
  transaction.replace(from, from, content);
  const end = from + content.size;
  transaction.insertText(closer, end);
  transaction.insertText(opener, from);
  transaction.setSelection(
    TextSelection.create(
      transaction.doc,
      from + opener.length,
      end + opener.length,
    ),
  );
  return withPair(transaction, {
    open: from,
    close: end + opener.length,
    opener,
    closer,
  });
}

/**
 * Apply the pairing that ordinary text input would have done after an IME
 * commits its text. ProseMirror deliberately bypasses `handleTextInput`
 * during composition, so this reconciliation must happen after
 * `compositionend` instead of mutating the document under the preedit.
 */
export function compositionPairTransaction(
  state: EditorState,
  committed: string,
  wrapped?: WrappedComposition,
  pairs = pairStateKey.getState(state) ?? [],
): Transaction | null {
  const { selection } = state;
  if (!selection.empty || !committed) return null;
  const typed = Array.from(committed).at(-1);
  if (!typed) return null;

  const caret = selection.from;
  const open = caret - typed.length;
  const typedBefore = characterBefore(state, caret) === typed;
  const tracked = pairs.find((pair) => pair.close === caret);
  if (
    tracked?.closer === typed &&
    characterAfter(state, caret) === typed &&
    (typedBefore || tracked.opener === "")
  ) {
    const transaction = state.tr.delete(caret, caret + typed.length);
    transaction.setSelection(TextSelection.create(transaction.doc, caret));
    return transaction.scrollIntoView();
  }
  if (!typedBefore) return null;

  const closer = bracketPairs[typed];
  if (!closer) return null;
  if (pairs.some((pair) => pair.open === open)) return null;

  if (
    wrapped &&
    committed === typed &&
    wrapped.from === open &&
    state.doc.content.size === wrapped.sizeAfter
  ) {
    return wrapComposition(state.tr.delete(open, caret), open, typed, closer, wrapped.content)
      .scrollIntoView();
  }
  if (isCodeContext(state, open)) return null;
  if (characterBefore(state, open) === "\\") return null;
  const after = characterAfter(state, caret);
  if (after === inlineNode || wordCharacter.test(after)) return null;
  if (urlBefore.test(textBefore(state, open))) return null;

  const transaction = state.tr.insertText(closer, caret);
  transaction.setSelection(TextSelection.create(transaction.doc, caret));
  return withPair(transaction.scrollIntoView(), {
    open,
    close: caret,
    opener: typed,
    closer,
  });
}

/** Create the pair transaction used by ordinary text input. */
export function pairedInputTransaction(
  state: EditorState,
  from: number,
  to: number,
  character: string,
  punctuation: punctuationSettings,
): Transaction | null {
  if (character.length !== 1 || isCodeContext(state, from) || isCodeContext(state, to)) {
    return null;
  }
  const $from = state.doc.resolve(from);
  const $to = state.doc.resolve(to);
  if (!$from.parent.inlineContent || !$from.sameParent($to)) return null;

  const pair = pairForInput(state, from, character, punctuation);
  if (!pair) return null;
  if (from === to) {
    if (!shouldPairAt(state, from)) return null;
    const transaction = state.tr.insertText(pair.open + pair.close, from, to);
    transaction.setSelection(TextSelection.create(transaction.doc, from + pair.open.length));
    return withPair(transaction.scrollIntoView(), {
      open: from,
      close: from + pair.open.length,
      opener: pair.open,
      closer: pair.close,
    });
  }

  const transaction = state.tr.insertText(pair.close, to, to);
  transaction.insertText(pair.open, from, from);
  transaction.setSelection(
    TextSelection.create(transaction.doc, from + pair.open.length, to + pair.open.length),
  );
  return withPair(transaction.scrollIntoView(), {
    open: from,
    close: to + pair.open.length,
    opener: pair.open,
    closer: pair.close,
  });
}

/** Delete both halves when Backspace is pressed inside an auto-created pair. */
export function deleteEmptyPairTransaction(
  state: EditorState,
  pairs = pairStateKey.getState(state) ?? [],
): Transaction | null {
  const { selection } = state;
  if (!selection.empty) return null;
  const pair = pairs.find(
    (item) => item.open === selection.from - 1 && item.close === selection.from,
  );
  if (!pair) return null;
  if (
    characterAfter(state, pair.open) !== pair.opener ||
    characterAfter(state, pair.close) !== pair.closer
  ) {
    return null;
  }
  return state.tr.delete(pair.open, pair.close + pair.closer.length).scrollIntoView();
}

/** Move across a pair inserted by this plugin without editing the document. */
export function skipPairBoundaryTransaction(
  state: EditorState,
  direction: 1 | -1,
  pairs = pairStateKey.getState(state) ?? [],
): Transaction | null {
  const { selection } = state;
  if (!selection.empty) return null;
  const pair =
    direction === 1
      ? pairs.find((item) => item.close === selection.from)
      : pairs.find((item) => item.open === selection.from - 1);
  if (!pair) return null;
  return state.tr
    .setSelection(
      TextSelection.create(
        state.doc,
        selection.from + direction * pair.closer.length,
      ),
    )
    .scrollIntoView();
}

export const autoPairKey = new PluginKey<PairRecord[]>("nota-auto-pair");
const pairStateKey = autoPairKey;

/** Basic bracket and quote pairing for ordinary text blocks. */
export const autoPair = (
  enabled = true,
  punctuation: punctuationSettings,
) =>
  $prose(() => {
    let wrappedComposition: WrappedComposition | undefined;
    let compositionTimer: number | null = null;
    return new Plugin<PairRecord[]>({
      key: autoPairKey,
      state: {
        init: () => [],
        apply(transaction, pairs, _oldState, state) {
          if (!pairs.length && !transaction.getMeta(pairStateKey)) return pairs;
          const added = transaction.getMeta(pairStateKey) as PairRecord | undefined;
          const next: PairRecord[] = [];
          for (const pair of added ? [...pairs, added] : pairs) {
            const mapped =
              pair === added
                ? pair
                : {
                    ...pair,
                    open: transaction.mapping.mapResult(pair.open, -1).pos,
                    close: transaction.mapping.map(pair.close, 1),
                  };
            const { from, to } = state.selection;
            if (
              mapped.close > mapped.open &&
              from > mapped.open &&
              to <= mapped.close &&
              characterAfter(state, mapped.open) === mapped.opener &&
              characterAfter(state, mapped.close) === mapped.closer
            ) {
              next.push(mapped);
            }
          }
          return next;
        },
      },
      props: {
        handleTextInput: (view: EditorView, from, to, text) => {
          if (!enabled || view.composing) return false;
          const tracked = from === to ? trackedPairAtClose(view.state, from) : undefined;
          if (
            tracked &&
            (text === tracked.closer ||
              (tracked.closer === "”" && text === '"') ||
              (tracked.closer === "’" && text === "'"))
          ) {
            const explicitLink =
              text === ")"
                ? explicitLinkAtClosingParenthesis(view.state, from)
                : null;
            if (explicitLink) {
              view.dispatch(explicitLink);
              return true;
            }
            const transaction = skipPairBoundaryTransaction(view.state, 1);
            if (!transaction) return false;
            view.dispatch(transaction);
            return true;
          }
          const transaction = pairedInputTransaction(
            view.state,
            from,
            to,
            text,
            punctuation,
          );
          if (!transaction) return false;
          view.dispatch(transaction);
          return true;
        },
        handleKeyDown: (view, event) => {
          if (!enabled || view.composing || event.ctrlKey || event.metaKey || event.altKey) {
            return false;
          }
          if (event.key === "Backspace" && !event.shiftKey) {
            const transaction = deleteEmptyPairTransaction(view.state);
            if (!transaction) return false;
            event.preventDefault();
            view.dispatch(transaction);
            return true;
          }
          if (event.key === "Tab") {
            const transaction = skipPairBoundaryTransaction(
              view.state,
              event.shiftKey ? -1 : 1,
            );
            if (!transaction) return false;
            event.preventDefault();
            view.dispatch(transaction);
            return true;
          }
          return false;
        },
        handleDOMEvents: {
          compositionstart(view) {
            const { from, to, empty, $from, $to } = view.state.selection;
            wrappedComposition =
              enabled &&
              !empty &&
              view.state.selection instanceof TextSelection &&
              $from.sameParent($to) &&
              !isCodeContext(view.state, from)
                ? {
                    from,
                    content: view.state.doc.slice(from, to),
                    sizeAfter: view.state.doc.content.size - (to - from) + 1,
                  }
                : undefined;
            return false;
          },
          compositionend(view, event) {
            const committed = event.data ?? "";
            const wrapped = wrappedComposition;
            wrappedComposition = undefined;
            if (compositionTimer !== null) window.clearTimeout(compositionTimer);
            const settle = (attempt = 0) => {
              compositionTimer = window.setTimeout(() => {
                compositionTimer = null;
                if (view.isDestroyed || !enabled) return;
                if (view.composing && attempt < 5) {
                  settle(attempt + 1);
                  return;
                }
                const transaction = compositionPairTransaction(view.state, committed, wrapped);
                if (transaction) view.dispatch(transaction);
              }, bracketCompositionDelayMs);
            };
            settle();
            return false;
          },
        },
      },
      view() {
        return {
          destroy() {
            if (compositionTimer !== null) window.clearTimeout(compositionTimer);
          },
        };
      },
    });
  });
