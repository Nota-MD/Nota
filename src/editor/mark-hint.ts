


































































import { $prose } from "@milkdown/kit/utils";
import {
  Plugin,
  TextSelection,
  type EditorState,
  type Transaction,
} from "@milkdown/kit/prose/state";
import {
  Fragment,
  Mark,
  type MarkType,
  type Node as PMNode,
  type NodeType,
} from "@milkdown/kit/prose/model";
import type { EditorView } from "@milkdown/kit/prose/view";
import {
  findActiveMarkRange,
  inlineSyntaxAndEscapeDecorations,
  inlineSyntaxNodeSpec,
  markHintLiteral,
  normalizeInlineBlock,
  noticeClass,
  noticeTable,
  type SyntaxMarkerRange,
  type SyntaxNodeAttribute,
} from "./mark-hint-source";
import { inlineEscapeSpec } from "./inline-escape";
import {
  backspaceEmptyInlinePair,
  backspaceInlineDelimiter,
  deleteEmptyInlinePairForward,
  deleteInlineDelimiter,
  inputInlineDelimiter,
  insertPlainInlineText,
  markHintKey,
  moveInlineCaret,
  type MarkHintState,
} from "./inline-edit";

export {
  findActiveMarkRange,
  inlineSyntaxNodePlugins,
  inlineSyntaxNodeSpec,
  noticeClass,
  noticeTable,
} from "./mark-hint-source";
export {
  backspaceEmptyInlinePair,
  backspaceInlineDelimiter,
  deleteEmptyInlinePairForward,
  deleteInlineDelimiter,
  inputInlineDelimiter,
  insertPlainInlineText,
  markHintKey,
  moveInlineCaret,
} from "./inline-edit";

export function scanOneParagraph(
  doc: PMNode,
  position2: number,
  type: MarkType,
): { from: number; to2: number } | null {
  const position = doc.resolve(position2);
  const parent = position.parent;

  if (!parent.inlineContent) return null;


  const children2: { from: number; withValue: boolean }[] = [];
  let length = 0;
  for (let i = 0; i < parent.childCount; i++) {
    const child2 = parent.child(i);
    const width = child2.isText === true ? ((child2.text as string).length) : child2.nodeSize;





    children2.push({ from: length, withValue: type.isInSet(child2.marks) !== undefined });
    length += width;
  }
  if (length <= 0) return null;


  const withValue = (j: number): boolean => {
    for (let i = children2.length - 1; i >= 0; i--) {
      const child2 = children2[i];
      if (child2 && j >= child2.from) return child2.withValue;
    }
    return false;
  };

  const blockFirst = position.start();
  const cursor = Math.min(Math.max(position2 - blockFirst, 0), length);












  if (!((cursor < length && withValue(cursor)) || (cursor > 0 && withValue(cursor - 1)))) return null;

  let from = cursor;
  let to2 = cursor;
  while (from > 0 && withValue(from - 1)) from--;
  while (to2 < length && withValue(to2)) to2++;
  return { from: blockFirst + from, to2: blockFirst + to2 };
}









let reportPassMissingName = false;

function checkMissingName(marks: Record<string, MarkType | undefined>): void {
  if (reportPassMissingName) return;
  const missing2 = noticeTable.filter(({ name3 }) => !marks[name3]).map(({ name3 }) => name3);
  if (!missing2.length) return;
  reportPassMissingName = true;
  console.warn(
    `[nota] Inline mark hints are unavailable because these marks are missing: ${missing2.join(", ")}. ` +
      "Hint table: src/editor/mark-hint.ts. The italic mark id is `emphasis`, not `em`.",
  );
}









export function splitMarkCharacter(symbolNumber: string): string[] {
  return Array.from(symbolNumber);
}



export const markHintRefresh = "nota-mark-hint-refresh";









export interface InlineCompositionAnchor {
  name: string;
  side: "before" | "after";
  markerFrom: number;
  markerTo: number;
}


export function inlineCompositionAnchor(
  state: EditorState,
  syntaxType: NodeType,
): InlineCompositionAnchor | null {
  if (!state.selection.empty) return null;
  const position2 = state.selection.from;
  const marks = state.schema.marks as Record<string, MarkType | undefined>;
  for (const { name3 } of noticeTable) {
    const type = marks[name3];
    if (!type) continue;
    const active = findActiveMarkRange(state.doc, position2, type, syntaxType);
    if (!active) continue;
    if (active.leftMarker && position2 === active.leftMarker.from) {
      return {
        name: name3,
        side: "before",
        markerFrom: active.leftMarker.from,
        markerTo: active.leftMarker.to2,
      };
    }
    if (active.rightMarker && position2 === active.rightMarker.to2) {
      return {
        name: name3,
        side: "after",
        markerFrom: active.rightMarker.from,
        markerTo: active.rightMarker.to2,
      };
    }
  }
  return null;
}






export function pinCompositionOutsideMarker(
  view: EditorView,
  anchor: InlineCompositionAnchor,
): void {
  const markerPosition =
    anchor.side === "after" ? anchor.markerTo - 1 : anchor.markerFrom;
  const marker = view.nodeDOM(markerPosition);
  if (!(marker instanceof Element) || !marker.parentNode) return;
  const index = Array.prototype.indexOf.call(
    marker.parentNode.childNodes,
    marker,
  );
  if (index < 0) return;
  const root = view.root as {
    getSelection?: () => globalThis.Selection | null;
  };
  const selection = root.getSelection ? root.getSelection() : null;
  if (!selection) return;
  try {
    selection.collapse(
      marker.parentNode,
      anchor.side === "after" ? index + 1 : index,
    );
  } catch {

  }
}







export function relocateComposedText(
  state: EditorState,
  anchor: InlineCompositionAnchor,
  committed: string,
  syntaxType: NodeType,
): Transaction | null {
  if (!committed || !state.selection.empty) return null;
  const type = (state.schema.marks as Record<string, MarkType | undefined>)[
    anchor.name
  ];
  if (!type) return null;
  const caret = state.selection.from;
  const active = findActiveMarkRange(state.doc, caret, type, syntaxType);
  if (!active) return null;

  if (anchor.side === "after") {
    if (!active.rightMarker || caret > active.to2) return null;
    const from = caret - committed.length;
    if (from < active.from) return null;
    if (state.doc.textBetween(from, caret, "\uFFFC", "\uFFFC") !== committed) {
      return null;
    }
    const tr = state.tr.delete(from, caret);
    const insertAt = tr.mapping.map(active.rightMarker.to2, 1);
    tr.setStoredMarks([]);
    tr.insertText(committed, insertAt, insertAt);
    tr.setSelection(TextSelection.create(tr.doc, insertAt + committed.length));
    return tr;
  }

  if (!active.leftMarker || caret > active.to2) return null;
  if (state.doc.textBetween(active.from, caret, "\uFFFC", "\uFFFC") !== committed) {
    return null;
  }
  const insertAt = active.leftMarker.from;
  const tr = state.tr.delete(active.from, caret);
  tr.setStoredMarks([]);
  tr.insertText(committed, insertAt, insertAt);
  tr.setSelection(TextSelection.create(tr.doc, insertAt + committed.length));
  return tr;
}


export function listSyntaxMarkers(doc: PMNode, syntaxType: NodeType): SyntaxMarkerRange[] {
  const single: SyntaxMarkerRange[] = [];
  doc.descendants((node, position2) => {
    if (node.type !== syntaxType) return true;
    const attrs = node.attrs as Partial<SyntaxNodeAttribute>;
    single.push({
      from: position2,
      to2: position2 + node.nodeSize,
      text4: typeof attrs.symbol === "string" ? attrs.symbol : "*",
      syntax: typeof attrs.syntax === "string" ? attrs.syntax : "",
      side: attrs.side === "right" ? "right" : "left",
    });
    return false;
  });
  const output2: SyntaxMarkerRange[] = [];
  for (const marker of single) {
    const last = output2.at(-1);
    if (
      last &&
      last.to2 === marker.from &&
      last.syntax === marker.syntax &&
      last.side === marker.side
    ) {
      last.to2 = marker.to2;
      last.text4 += marker.text4;
    } else {
      output2.push({ ...marker });
    }
  }
  return output2;
}









function syncInlineMarkers(
  state: EditorState,
  syntaxType: NodeType,
  allowSelection = false,
): Transaction | null {
  if (!state.selection.empty && !allowSelection) return null;
  const marks = state.schema.marks as Record<string, MarkType | undefined>;
  const activeMarks: Mark[] = [];
  const missingByKey = new Map<string, {
    position2: number;
    text4: string;
    syntax: string;
    side: "left" | "right";
  }>();
  const cursors = state.selection.empty
    ? [state.selection.from]
    : [
        state.selection.from,
        state.selection.to,
        state.selection.from + 1,
        state.selection.to - 1,
      ].filter(
        (position2) =>
          position2 >= 0 && position2 <= state.doc.content.size,
      );
  for (const { name3 } of noticeTable) {
    const type = marks[name3];
    if (!type) continue;
    for (const cursor of cursors) {
      const active = findActiveMarkRange(
        state.doc,
        cursor,
        type,
        syntaxType,
      );
      if (!active) continue;
      if (
        state.selection.empty &&
        state.selection.from >= active.from &&
        state.selection.from <= active.to2
      ) {
        activeMarks.push(type.create());
      }
      if (!active.leftMarker) {
        const item = {
          position2: active.from,
          text4: active.left,
          syntax: name3,
          side: "left" as const,
        };
        missingByKey.set(
          `${item.syntax}:${item.position2}:${item.side}`,
          item,
        );
      }
      if (!active.rightMarker) {
        const item = {
          position2: active.to2,
          text4: active.right,
          syntax: name3,
          side: "right" as const,
        };
        missingByKey.set(
          `${item.syntax}:${item.position2}:${item.side}`,
          item,
        );
      }
    }
  }
  const missing = Array.from(missingByKey.values());

  const uniqueActiveMarks = activeMarks.filter(
    (mark, index, all) => all.findIndex((other) => other.eq(mark)) === index,
  );
  const atomBefore = state.selection.$from.nodeBefore;
  const atomAfter = state.selection.$from.nodeAfter;
  const adjacentMarks =
    atomBefore && !atomBefore.isText && atomBefore.marks.length
      ? atomBefore.marks
      : atomAfter && !atomAfter.isText
        ? atomAfter.marks
        : [];
  const marksToStore =
    uniqueActiveMarks.length > 0 ? uniqueActiveMarks : adjacentMarks;
  const storedChanged = !Mark.sameSet(state.storedMarks ?? [], marksToStore);
  if (!missing.length && !storedChanged) return null;

  const selectionFrom = state.selection.from;
  const selectionTo = state.selection.to;
  let fromShift = 0;
  let toShift = 0;
  const tr = state.tr;
  for (const item of missing.sort((a, b) => b.position2 - a.position2)) {
    const mapped = tr.mapping.map(item.position2, 1);
    if (mapped < selectionFrom || (item.side === "left" && mapped === selectionFrom)) {
      fromShift += item.text4.length;
    }
    if (mapped < selectionTo) toShift += item.text4.length;
    const nodes = Array.from(item.text4).map((symbol) =>
      syntaxType.create({
        syntax: item.syntax,
        side: item.side,
        symbol,
      }),
    );
    tr.insert(mapped, Fragment.fromArray(nodes));
  }
  if (tr.docChanged) {
    const clampPosition = (position2: number): number =>
      Math.max(0, Math.min(tr.doc.content.size, position2));
    const from = TextSelection.near(
      tr.doc.resolve(clampPosition(selectionFrom + fromShift)),
      1,
    );
    const to = TextSelection.near(
      tr.doc.resolve(clampPosition(selectionTo + toShift)),
      -1,
    );
    tr.setSelection(
      TextSelection.create(
        tr.doc,
        Math.min(from.from, to.from),
        Math.max(from.from, to.from),
      ),
    );
    tr.setMeta("addToHistory", false);
  }
  if (storedChanged) tr.setStoredMarks(marksToStore);
  return tr.docChanged || storedChanged ? tr : null;
}









export function createMarkHintPlugin(
  syntaxType: NodeType,
  escapeType?: NodeType,
): Plugin {
  let compositionAnchor: InlineCompositionAnchor | null = null;
  let compositionTimer: number | null = null;
  const pinDomCaret = (view: EditorView, position2: number) => {
    const markerAt = (pos: number): Element | null => {
      const node = view.nodeDOM(pos);
      return node instanceof Element && node.classList.contains(noticeClass) ? node : null;
    };
    const before = position2 > 0 ? markerAt(position2 - 1) : null;
    const after = markerAt(position2);
    const marker = before ?? after;
    if (!marker?.parentNode) return;
    const index = Array.prototype.indexOf.call(marker.parentNode.childNodes, marker);
    if (index < 0) return;
    const selection = window.getSelection();
    const at = before ? index + 1 : index;
    selection?.setBaseAndExtent(marker.parentNode, at, marker.parentNode, at);
  };
  return new Plugin({
      key: markHintKey,
      view: () => {
        return {
          destroy() {
            if (compositionTimer !== null) {
              window.clearTimeout(compositionTimer);
              compositionTimer = null;
            }
          },
        };
      },
      props: {
        decorations: (state) =>
          inlineSyntaxAndEscapeDecorations(
            state,
            syntaxType,
            escapeType,
            markHintKey.getState(state)?.suppressedAt ?? null,
          ),
        handleKeyDown: (view, event) => {
          if (event.isComposing || view.composing) return false;
          if (
            event.key === "\\" &&
            !event.ctrlKey &&
            !event.metaKey &&
            !event.altKey
          ) {
            const syntaxType = view.state.schema.nodes.notaSyntax;
            const escapeType = view.state.schema.nodes.notaEscape;
            if (!syntaxType) return false;
            const tr = inputInlineDelimiter(
              view.state,
              syntaxType,
              view.state.selection.from,
              view.state.selection.to,
              "\\",
              escapeType,
              true,
            );
            if (tr) {
              event.preventDefault();
              view.dispatch(tr.scrollIntoView());
              return true;
            }
          }
          if (event.key === "Delete") {
            const tr =
              deleteEmptyInlinePairForward(view.state, syntaxType) ??
              deleteInlineDelimiter(view.state, syntaxType);
            if (tr) {
              event.preventDefault();
              view.dispatch(tr);
              return true;
            }
          }
          if (
            !event.shiftKey &&
            !event.ctrlKey &&
            !event.metaKey &&
            !event.altKey &&
            (event.key === "ArrowLeft" ||
              event.key === "ArrowRight" ||
              event.key === "Home" ||
              event.key === "End")
          ) {
            const tr = moveInlineCaret(view.state, syntaxType, event.key);
            if (tr) {
              view.dispatch(tr);
              if (event.key === "ArrowLeft" || event.key === "ArrowRight") {
                requestAnimationFrame(() => {
                  if (!view.isDestroyed) pinDomCaret(view, view.state.selection.from);
                });
              }
              return true;
            }
          }
          if (event.key !== "Backspace") return false;
          const literalBefore = view.state.selection.$from.nodeBefore;
          if (
            view.state.selection.empty &&
            literalBefore?.type.name === "notaLiteral" &&
            literalBefore.attrs.symbol === "\\"
          ) {
            event.preventDefault();
            const caret = view.state.selection.from;
            const tr = view.state.tr.delete(
              caret - literalBefore.nodeSize,
              caret,
            );
            tr.setSelection(
              TextSelection.create(
                tr.doc,
                caret - literalBefore.nodeSize,
              ),
            );
            view.dispatch(tr.scrollIntoView());
            return true;
          }
          const tr =
            backspaceEmptyInlinePair(view.state, syntaxType) ??
            backspaceInlineDelimiter(view.state, syntaxType, escapeType);
          if (!tr) return false;
          view.dispatch(tr);
          return true;
        },
        handleDOMEvents: {
          beforeinput: (view, rawEvent) => {
            const event = rawEvent as InputEvent;
            if (
              view.composing ||
              event.isComposing ||
              event.inputType !== "insertText" ||
              event.data !== "\\"
            ) {
              return false;
            }
            const syntaxType = view.state.schema.nodes.notaSyntax;
            const escapeType = view.state.schema.nodes.notaEscape;
            if (!syntaxType) return false;
            const tr = inputInlineDelimiter(
              view.state,
              syntaxType,
              view.state.selection.from,
              view.state.selection.to,
              event.data,
              escapeType,
              true,
            );
            if (!tr) return false;
            event.preventDefault();
            view.dispatch(tr.scrollIntoView());
            return true;
          },
          compositionstart: (view) => {
            compositionAnchor = inlineCompositionAnchor(view.state, syntaxType);
            // Do not move the DOM selection here. WebKitGTK anchors the IME
            // candidate window before dispatching compositionstart; changing
            // the selection inside this handler leaves the preedit detached.
            // The committed text is relocated outside the markers in
            // compositionend below.
            return false;
          },
          compositionend: (view, event) => {
            const anchor = compositionAnchor;
            const committed = event.data ?? "";
            compositionAnchor = null;
            if (compositionTimer !== null) {
              window.clearTimeout(compositionTimer);
            }
            const settle = (attempt = 0) => {
              compositionTimer = window.setTimeout(() => {
                compositionTimer = null;
                if (view.isDestroyed) return;


                if (view.composing && attempt < 5) {
                  settle(attempt + 1);
                  return;
                }
                const relocated = anchor
                  ? relocateComposedText(view.state, anchor, committed, syntaxType)
                  : null;
                const tr = relocated ?? view.state.tr;
                tr.setMeta(markHintRefresh, true);
                view.dispatch(tr.scrollIntoView());
              }, 40);
            };
            settle();
            return false;
          },
        },
      },
      state: {
        init: (): MarkHintState => ({ suppressedAt: null }),
        apply: (tr, value): MarkHintState => {
          const own = tr.getMeta(markHintKey) as number | null | undefined;
          if (own !== undefined) return { suppressedAt: own };
          if (tr.docChanged) return { suppressedAt: null };



          if (tr.selectionSet) {
            const samePoint =
              value.suppressedAt !== null && tr.selection.from === value.suppressedAt;
            return samePoint ? value : { suppressedAt: null };
          }
          return value;
        },
      },
      appendTransaction: (transactions, _oldState, newState) => {




        if (transactions.some((tr) => tr.getMeta("composition") != null)) {
          return null;
        }
        if (transactions.some((tr) => tr.getMeta(markHintLiteral) === true)) {
          return null;
        }
        const marks = newState.schema.marks as Record<string, MarkType | undefined>;
        checkMissingName(marks);

        if (
          transactions.some(
            (tr) => tr.docChanged || tr.getMeta(markHintRefresh) === true,
          )
        ) {
          const normalized = normalizeInlineBlock(newState, syntaxType, escapeType);
          if (normalized) return normalized;
        }
        const selectionMarkChanged = transactions.some((tr) =>
          tr.steps.some(
            (step) =>
              step.toJSON().stepType === "addMark" ||
              step.toJSON().stepType === "removeMark",
          ),
        );
        return syncInlineMarkers(
          newState,
          syntaxType,
          selectionMarkChanged,
        );
      },
  });
}







export const literalInlineInput = (autoPair: boolean) => $prose(
  () =>
    new Plugin({
      props: {
        handleTextInput: (view, from, to2, text4) => {
          if (
            view.composing ||
            text4.length !== 1 ||
            !"*_=~^`$\\".includes(text4) ||
            view.state.selection.$from.parent.type.spec.code
          ) {
            return false;
          }
          const syntaxType = view.state.schema.nodes.notaSyntax;
          const escapeType = view.state.schema.nodes.notaEscape;
          if (text4 === "\\") {



            if (syntaxType) {
              const tr = inputInlineDelimiter(
                view.state,
                syntaxType,
                from,
                to2,
                text4,
                escapeType,
                true,
              );
              if (tr) {
                view.dispatch(tr.scrollIntoView());
                return true;
              }
            }
            const tr = insertPlainInlineText(view.state, from, to2, text4);
            view.dispatch(tr.scrollIntoView());
            return true;
          }
          if (syntaxType) {
            const tr = inputInlineDelimiter(
              view.state,
              syntaxType,
              from,
              to2,
              text4,
              escapeType,
              false,
              autoPair,
            );
            if (tr) {
              view.dispatch(tr.scrollIntoView());
              return true;
            }
          }
          view.dispatch(view.state.tr.insertText(text4, from, to2).scrollIntoView());
          return true;
        },
      },
    }),
);

export const markHint = $prose((ctx) =>
  createMarkHintPlugin(inlineSyntaxNodeSpec.type(ctx), inlineEscapeSpec.type(ctx)),
);
