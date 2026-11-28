


















































































































































import { $prose, $shortcut } from "@milkdown/kit/utils";
import { Plugin, PluginKey } from "@milkdown/kit/prose/state";
import type { EditorState, Transaction } from "@milkdown/kit/prose/state";
import { TextSelection } from "@milkdown/kit/prose/state";
import { Decoration, DecorationSet } from "@milkdown/kit/prose/view";
import type { EditorView } from "@milkdown/kit/prose/view";
import type { Command } from "@milkdown/kit/prose/state";
import type { Node as PMNode } from "@milkdown/kit/prose/model";

import { atxPrefix } from "@/editor/atx";


export const pendingBecomeBlockClassName = "nota-heading-pending";

export const pendingBecomeBlockPrefixClassName = "nota-heading-prefix";

interface PendingHeadingState {
  doc: PMNode;
  items: PendingDecoration[];
}

const pendingHeadingKey = new PluginKey<PendingHeadingState>(
  "nota-heading-on-enter",
);
















function returnCarBecomeMarkTitle(view: EditorView, strict: boolean): boolean {
  if (!view.editable) return false;

  const { state } = view;
  const { $from, empty } = state.selection;
  if (!empty) return false;

  const paragraph2 = $from.parent;
  if (paragraph2.type.name !== "paragraph") return false;

  for (let d = $from.depth - 1; d > 0; d--) {
    const name3 = $from.node(d).type.name;
    if (name3 === "table_cell" || name3 === "table_header") return false;
  }





  const head2 = atxPrefix(paragraph2.textContent, strict);
  if (head2 === null) return false;


  if ($from.parentOffset !== paragraph2.content.size) return false;

  const markTitleType = state.schema.nodes.heading;
  if (!markTitleType) return false;

  const layer = head2.layerNumber;
  const prefixLength = head2.lengthDegree;
  const start5 = $from.before($from.depth);



  const newValueBlock = markTitleType.create({ level: layer }, paragraph2.content.cut(prefixLength));

  const tr = state.tr.replaceWith(start5, start5 + paragraph2.nodeSize, newValueBlock);






  const emptyParagraph = state.schema.nodes.paragraph?.createAndFill();
  if (emptyParagraph) {
    const position3 = start5 + newValueBlock.nodeSize;
    tr.insert(position3, emptyParagraph);

    tr.setSelection(TextSelection.near(tr.doc.resolve(position3 + 1)));
  } else {


    tr.setSelection(TextSelection.near(tr.doc.resolve(start5 + newValueBlock.nodeSize - 1)));
  }

  tr.scrollIntoView();
  view.dispatch(tr);
  return true;
}














export type PendingDecoration = {
  blockStart2: number;
  blockEnd: number;
  layerNumber: number;
  prefixStart: number;
  prefixEnd: number;
  start5: number;
  end2: number;
};











export function computeDecorationsItem(
  doc: PMNode,
  strict: boolean,
  from = 0,
  to = doc.content.size,
): PendingDecoration[] {
  const item: PendingDecoration[] = [];
  const start = Math.max(0, Math.min(doc.content.size, from));
  const end = Math.max(start, Math.min(doc.content.size, to));

  doc.nodesBetween(start, end, (node, pos, parent) => {



    //



    if (node.type.name !== "paragraph") return false;
    const parentName = parent?.type.name;
    if (parentName === "table_cell" || parentName === "table_header") {
      return false;
    }
    const first = node.firstChild;
    if (!first || !first.isText || !first.text) return false;

    const head2 = atxPrefix(first.text, strict);
    if (head2 === null) return false;

    const bodyStart2 = pos + 1 + head2.lengthDegree;
    const bodyEnd = pos + 1 + node.content.size;

    if (bodyEnd <= bodyStart2) return true;

    item.push({
      blockStart2: pos,
      blockEnd: pos + node.nodeSize,
      layerNumber: head2.layerNumber,
      prefixStart: pos + 1,
      prefixEnd: bodyStart2,
      start5: bodyStart2,
      end2: bodyEnd,
    });
    return false;
  });

  return item;
}

/**
 * While the caret is anywhere inside a pending heading paragraph, keep the
 * source form and emphasize the title text. Once the caret leaves, render the
 * paragraph with heading typography and hide the prefix.
 */
export function createDecorationCollection(
  doc: PMNode,
  item: readonly PendingDecoration[],
  cursor = -1,
): DecorationSet {
  const decos = item.flatMap((item4) => {
    const inside = cursor >= item4.blockStart2 + 1 && cursor <= item4.blockEnd - 1;
    const correctAtEditEdit = cursor < 0 || inside;
    const decoration: Decoration[] = [
      Decoration.inline(item4.prefixStart, item4.prefixEnd, { class: pendingBecomeBlockPrefixClassName }),
    ];
    if (correctAtEditEdit) {
      decoration.push(Decoration.inline(item4.start5, item4.end2, { class: pendingBecomeBlockClassName }));
    } else {
      decoration.push(
        Decoration.node(item4.blockStart2, item4.blockEnd, {
          class: "nota-heading-rendered-block",
          "data-heading-level": String(item4.layerNumber),
        }),
      );
    }
    return decoration;
  });
  return decos.length ? DecorationSet.create(doc, decos) : DecorationSet.empty;
}

























export const lineFirstBackCell =
  (strict: boolean): Command =>
  (state, dispatch, view) => {
    if (!view?.editable) return false;

    const { $from, empty } = state.selection;
    if (!empty) return false;

    const block = $from.parent;
    if (block.type.name === "heading") {
      if ($from.parentOffset !== 0) return false;
      const paragraphType2 = state.schema.nodes.paragraph;
      if (!paragraphType2) return false;
      if (!dispatch) return true;
      dispatch(state.tr.setNodeMarkup($from.before($from.depth), paragraphType2));
      return true;
    }

    if (block.type.name !== "paragraph") return false;
    const text = block.textContent;
    if (
      /^#{1,6}[ \u00a0]+$/.test(text) &&
      $from.parentOffset === text.length
    ) {
      if (!dispatch) return true;
      const start5 = $from.start($from.depth);
      const space = start5 + text.length - 1;
      const tr = state.tr.delete(space, space + 1);
      tr.setSelection(TextSelection.create(tr.doc, space));
      dispatch(tr);
      return true;
    }
    const prefix2 = atxPrefix(block.textContent, strict);
    if (!prefix2 || $from.parentOffset !== prefix2.lengthDegree) return false;

    if (!dispatch) return true;
    const start5 = $from.start($from.depth);
    const tr = state.tr.delete(start5, start5 + prefix2.lengthDegree);
    tr.setSelection(TextSelection.create(tr.doc, start5));
    dispatch(tr.scrollIntoView());
    return true;
  };













export const markTitleLineFirstBackCell = (strict: boolean) => $shortcut(() => ({
  Backspace: { key: "Backspace", onRun: () => lineFirstBackCell(strict), priority: 60 },
  Delete: { key: "Delete", onRun: () => lineFirstBackCell(strict), priority: 60 },
}));
















export const markTitleReturnCarBecomeBlock = (strict: boolean) => $prose(() => {
  const normalizeInheritedHeadingMark = (
    transactions: readonly Transaction[],
    oldState: EditorState,
    newState: EditorState,
  ): Transaction | null => {
    if (!transactions.some((transaction) => transaction.docChanged)) return null;
    const selection = newState.selection;
    if (!selection.empty || !selection.$from.parent.inlineContent) return null;
    const current = selection.$from.parent;
    const headingType = newState.schema.nodes.heading;
    const paragraphType = newState.schema.nodes.paragraph;
    if (
      !current ||
      current.type.name !== "paragraph" ||
      !headingType ||
      !paragraphType
    ) {
      return null;
    }
    const previous = oldState.selection.$from.parent;
    const scaffoldHeading =
      previous.type.name === "paragraph" &&
      previous.textContent === "****"
        ? /^\*{2}(#{1,6})\*{2}$/.exec(current.textContent)
        : null;
    if (scaffoldHeading) {
      const start = selection.$from.before(selection.$from.depth);
      const prefix = scaffoldHeading[1] ?? "";
      const plain = paragraphType.create(
        null,
        prefix ? newState.schema.text(prefix) : null,
      );
      const tr = newState.tr
        .replaceWith(start, start + current.nodeSize, plain)
        .setStoredMarks([]);
      tr.setSelection(TextSelection.create(tr.doc, start + 1 + prefix.length));
      return tr;
    }
    const prefix = atxPrefix(current.textContent, strict);
    if (!prefix || current.textContent.length <= prefix.lengthDegree) {
      return null;
    }
    let prefixMarked = false;
    current.forEach((child, offset) => {
      if (
        child.marks.length > 0 &&
        offset < prefix.lengthDegree &&
        offset + child.nodeSize > 0
      ) {
        prefixMarked = true;
      }
    });
    if (!prefixMarked) return null;
    const start = selection.$from.before(selection.$from.depth);
    const body = current.textContent.slice(prefix.lengthDegree);
    const plain = paragraphType.create(
      null,
      body ? newState.schema.text(body) : null,
    );
    const tr = newState.tr
      .replaceWith(start, start + current.nodeSize, plain)
      .setStoredMarks([]);
    tr.setSelection(
      TextSelection.near(tr.doc.resolve(tr.mapping.map(newState.selection.from))),
    );
    return tr;
  };

  const convertPendingHeadingAfterSplit = (
    transactions: readonly Transaction[],
    oldState: EditorState,
    newState: EditorState,
  ): Transaction | null => {
    if (!transactions.some((transaction) => transaction.docChanged)) return null;
    const oldSelection = oldState.selection;
    if (!oldSelection.empty) return null;
    const oldBlock = oldSelection.$from.parent;
    if (
      oldBlock.type.name !== "paragraph" ||
      oldSelection.$from.parentOffset !== oldBlock.content.size
    ) {
      return null;
    }
    const heading = atxPrefix(oldBlock.textContent, strict);
    if (!heading) return null;
    const start = oldSelection.$from.before(oldSelection.$from.depth);
    const current = newState.doc.nodeAt(start);
    const headingType = newState.schema.nodes.heading;
    if (
      current?.type.name !== "paragraph" ||
      current.textContent !== oldBlock.textContent ||
      !headingType
    ) {
      return null;
    }

    const children: PMNode[] = [];
    current.forEach((child, offset) => {
      const skip = Math.max(0, heading.lengthDegree - offset);
      if (skip >= child.nodeSize) return;
      if (child.isText) {
        const text = child.text?.slice(skip) ?? "";
        if (!text) return;
        const marks =
          offset === 0 && child.text!.length > heading.lengthDegree
            ? []
            : child.marks;
        children.push(newState.schema.text(text, marks));
        return;
      }
      children.push(child);
    });
    const next = headingType.create(
      { level: heading.layerNumber },
      children.length > 0 ? children : null,
    );
    const tr = newState.tr
      .replaceWith(start, start + current.nodeSize, next)
      .setStoredMarks([]);
    tr.setSelection(
      TextSelection.near(
        tr.doc.resolve(
          Math.max(1, Math.min(tr.mapping.map(newState.selection.from), tr.doc.content.size)),
        ),
      ),
    );
    return tr;
  };

  const insertPendingHeadingText = (
    view: EditorView,
    from: number,
    to: number,
    text: string,
  ): boolean => {
    const paragraph = view.state.doc.resolve(from).parent;
    if (
      paragraph.type.name !== "paragraph" ||
      !/^#{1,6}[ \u00a0]*$/.test(paragraph.textContent) ||
      from !== view.state.selection.from ||
      to !== view.state.selection.to
    ) {
      return false;
    }

    const tr = view.state.tr.replaceWith(
      from,
      to,
      view.state.schema.text(text),
    );
    const caret = from + text.length;
    tr.setSelection(TextSelection.create(tr.doc, caret));
    tr.setStoredMarks([]);
    view.dispatch(tr.scrollIntoView());
    view.focus();
    const syncDomCaret = (): void => {
      if (view.isDestroyed || !view.state.selection.empty) return;
      const position = view.state.selection.from;
      const domCaret = view.domAtPos(position, -1);
      window.getSelection()?.setBaseAndExtent(
        domCaret.node,
        domCaret.offset,
        domCaret.node,
        domCaret.offset,
      );
    };
    syncDomCaret();
    requestAnimationFrame(syncDomCaret);
    return true;
  };

  const insertPlainHeadingMarker = (
    view: EditorView,
    from: number,
    to: number,
    text: string,
  ): boolean => {
    if (
      !/^#{1,6}$/.test(text) ||
      !view.state.selection.empty ||
      from !== view.state.selection.from ||
      to !== view.state.selection.to ||
      (view.state.storedMarks?.length ?? 0) === 0
    ) {
      return false;
    }
    const paragraph = view.state.doc.resolve(from).parent;
    if (paragraph.type.name !== "paragraph") {
      return false;
    }
    const emptyStrongScaffold = paragraph.textContent === "****";
    if (paragraph.content.size !== 0 && !emptyStrongScaffold) return false;
    if (emptyStrongScaffold) {
      const paragraphType = view.state.schema.nodes.paragraph;
      if (!paragraphType) return false;
      const blockStart = view.state.selection.$from.before(
        view.state.selection.$from.depth,
      );
      const next = paragraphType.create(null, view.state.schema.text(text));
      const tr = view.state.tr
        .replaceWith(blockStart, blockStart + paragraph.nodeSize, next)
        .setStoredMarks([]);
      tr.setSelection(TextSelection.create(tr.doc, blockStart + 1 + text.length));
      view.dispatch(tr);
      view.focus();
      return true;
    }
    const tr = view.state.tr
      .replaceWith(from, to, view.state.schema.text(text))
      .setStoredMarks([]);
    tr.setSelection(TextSelection.create(tr.doc, from + text.length));
    view.dispatch(tr);
    view.focus();
    return true;
  };

  return new Plugin({
    key: pendingHeadingKey,
    state: {
      init: (_config, state) => ({
        doc: state.doc,
        items: computeDecorationsItem(state.doc, strict),
      }),
      apply: (transaction, previous) => {
        if (!transaction.docChanged) return previous;
        if (transaction.steps.length !== 1) {
          return {
            doc: transaction.doc,
            items: computeDecorationsItem(transaction.doc, strict),
          };
        }
        const ranges: Array<{ oldStart: number; oldEnd: number; newStart: number; newEnd: number }> = [];
        transaction.steps[0]?.getMap().forEach((oldStart, oldEnd, newStart, newEnd) => {
          ranges.push({ oldStart, oldEnd, newStart, newEnd });
        });
        if (ranges.length === 0) {
          return {
            doc: transaction.doc,
            items: computeDecorationsItem(transaction.doc, strict),
          };
        }
        const retained = previous.items.filter(
          (item) =>
            !ranges.some(
              (range) =>
                item.blockEnd > range.oldStart &&
                item.blockStart2 < range.oldEnd,
            ),
        );
        const rescanned = ranges.flatMap((range) =>
          computeDecorationsItem(
            transaction.doc,
            strict,
            Math.max(0, range.newStart - 1),
            Math.min(transaction.doc.content.size, range.newEnd + 1),
          ),
        );
        const unique = new Map<number, PendingDecoration>();
        for (const item of [...retained, ...rescanned]) {
          unique.set(item.blockStart2, item);
        }
        return {
          doc: transaction.doc,
          items: [...unique.values()].sort((a, b) => a.blockStart2 - b.blockStart2),
        };
      },
    },
    view: (editorView) => {
      const commitBeforeDefaultEnter = (event: KeyboardEvent) => {
        if (
          event.key !== "Enter" ||
          event.shiftKey ||
          event.ctrlKey ||
          event.metaKey ||
          event.altKey ||
          event.isComposing ||
          editorView.composing
        ) {
          return;
        }
        if (returnCarBecomeMarkTitle(editorView, strict)) {
          event.preventDefault();
          event.stopPropagation();
        }
      };
      const normalizeBeforeDefaultInput = (rawEvent: Event) => {
        const event = rawEvent as InputEvent;
        if (
          editorView.composing ||
          event.isComposing ||
          event.inputType !== "insertText" ||
          !event.data ||
          event.data === " " ||
          event.data === "\u00a0" ||
          !editorView.state.selection.empty
        ) {
          return;
        }
        const position = editorView.state.selection.from;
        if (
          insertPlainHeadingMarker(
            editorView,
            position,
            position,
            event.data,
          )
        ) {
          event.preventDefault();
          event.stopPropagation();
          return;
        }
        if (
          insertPendingHeadingText(
            editorView,
            position,
            position,
            event.data,
          )
        ) {
          event.preventDefault();
          event.stopPropagation();
        }
      };
      editorView.dom.addEventListener("keydown", commitBeforeDefaultEnter, true);
      editorView.dom.addEventListener(
        "beforeinput",
        normalizeBeforeDefaultInput,
        true,
      );
      return {
        destroy() {
          editorView.dom.removeEventListener(
            "keydown",
            commitBeforeDefaultEnter,
            true,
          );
          editorView.dom.removeEventListener(
            "beforeinput",
            normalizeBeforeDefaultInput,
            true,
          );
        },
      };
    },
    appendTransaction: (transactions, oldState, newState) => {
      const normalizedHeading = normalizeInheritedHeadingMark(
        transactions,
        oldState,
        newState,
      );
      if (normalizedHeading) return normalizedHeading;
      const pendingSplit = convertPendingHeadingAfterSplit(
        transactions,
        oldState,
        newState,
      );
      if (pendingSplit) return pendingSplit;
      if (!transactions.some((transaction) => transaction.docChanged || transaction.selectionSet)) {
        return null;
      }
      const { $from, empty } = newState.selection;
      const block = $from.parent;
      const oldBlock = oldState.selection.$from.parent;
      if (
        empty &&
        oldBlock.type.name !== "heading" &&
        block.type.name === "heading" &&
        block.content.size === 0 &&
        (newState.storedMarks?.length ?? 0) > 0
      ) {
        return newState.tr.setStoredMarks([]);
      }
      if (
        empty &&
        block.type.name === "paragraph" &&
        /^#{1,6}[ \u00a0]*$/.test(block.textContent) &&
        (newState.storedMarks?.length ?? 0) > 0
      ) {
        return newState.tr.setStoredMarks([]);
      }
      return null;
    },
    props: {
      handleTextInput: (view, from, to, text) => {
        if (insertPlainHeadingMarker(view, from, to, text)) {
          return true;
        }
        if (
          view.composing ||
          from !== to ||
          !text ||
          text === " " ||
          text === "\u00a0"
        ) {
          return false;
        }
        return insertPendingHeadingText(view, from, to, text);
      },
      handleKeyDown: (view, event) => {
        const { $from, empty } = view.state.selection;
        if (
          empty &&
          $from.parent.type.name === "paragraph" &&
          /^#{1,6}[ \u00a0]*$/.test($from.parent.textContent) &&
          (view.state.storedMarks?.length ?? 0) > 0 &&
          !event.ctrlKey &&
          !event.metaKey &&
          !event.altKey
        ) {
          view.dispatch(view.state.tr.setStoredMarks([]));
        }

        if (event.key === "Backspace" && !event.shiftKey) {
          if (lineFirstBackCell(strict)(view.state, (tr) => view.dispatch(tr), view)) {
            event.preventDefault();
            return true;
          }
        }

        if (
          event.key !== "Enter" ||
          event.shiftKey ||
          event.ctrlKey ||
          event.metaKey ||
          event.altKey ||
          view.composing
        ) {
          return false;
        }
        return returnCarBecomeMarkTitle(view, strict);
      },
      handleDOMEvents: {
        beforeinput: (view, rawEvent) => {
          const event = rawEvent as InputEvent;
          if (
            view.composing ||
            event.isComposing ||
            event.inputType !== "insertText" ||
            !event.data ||
            event.data === " " ||
            event.data === "\u00a0" ||
            !view.state.selection.empty
          ) {
            return false;
          }
          if (
            insertPlainHeadingMarker(
              view,
              view.state.selection.from,
              view.state.selection.to,
              event.data,
            )
          ) {
            event.preventDefault();
            return true;
          }
          if (
            !insertPendingHeadingText(
              view,
              view.state.selection.from,
              view.state.selection.to,
              event.data,
            )
          ) {
            return false;
          }
          event.preventDefault();
          return true;
        },
        compositionstart: (view) => {
          const { $from, empty } = view.state.selection;
          if (
            empty &&
            $from.parent.type.name === "paragraph" &&
            /^#{1,6}[ \u00a0]*$/.test($from.parent.textContent) &&
            (view.state.storedMarks?.length ?? 0) > 0
          ) {
            view.dispatch(view.state.tr.setStoredMarks([]));
          }
          return false;
        },
      },

      decorations: (state) => {
        const pending = pendingHeadingKey.getState(state);
        if (!pending) return DecorationSet.empty;
        return createDecorationCollection(
          state.doc,
          pending.items,
          state.selection.from,
        );
      },
    },
  });
});
