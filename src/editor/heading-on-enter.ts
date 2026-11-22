


















































































































































import { $prose, $shortcut } from "@milkdown/kit/utils";
import { Plugin, PluginKey } from "@milkdown/kit/prose/state";
import { TextSelection } from "@milkdown/kit/prose/state";
import { Decoration, DecorationSet } from "@milkdown/kit/prose/view";
import type { EditorView } from "@milkdown/kit/prose/view";
import type { Command } from "@milkdown/kit/prose/state";
import type { Node as PMNode } from "@milkdown/kit/prose/model";

import { atxPrefix } from "@/editor/atx";


export const pendingBecomeBlockClassName = "nota-heading-pending";

export const pendingBecomeBlockPrefixClassName = "nota-heading-prefix";
















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











export function computeDecorationsItem(doc: PMNode, strict: boolean): PendingDecoration[] {
  const item: PendingDecoration[] = [];

  doc.descendants((node, pos) => {



    //



    if (node.type.name !== "paragraph") return true;
    const first = node.firstChild;
    if (!first || !first.isText || !first.text) return true;

    const head2 = atxPrefix(first.text, strict);
    if (head2 === null) return true;

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
    return true;
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
    const prefix2 = atxPrefix(block.textContent, strict);
    if (!prefix2 || $from.parentOffset !== prefix2.lengthDegree) return false;

    if (!dispatch) return true;
    const start5 = $from.start($from.depth);
    const tr = state.tr.delete(start5, start5 + prefix2.lengthDegree);
    tr.setSelection(TextSelection.create(tr.doc, start5));
    dispatch(tr.scrollIntoView());
    return true;
  };

function preparePlainHeadingPrefix(view: EditorView): boolean {
  if (!view.editable) return false;
  const { $from, empty } = view.state.selection;
  const paragraph2 = $from.parent;
  const after = $from.nodeAfter;
  if (
    !empty ||
    paragraph2.type.name !== "paragraph" ||
    (after !== null && after.type.name !== "notaSyntax") ||
    !/^#{1,6}$/.test(paragraph2.textContent)
  ) {
    return false;
  }
  const start5 = $from.before($from.depth);
  const plain = paragraph2.type.create(
    paragraph2.attrs,
    view.state.schema.text(`${paragraph2.textContent} `),
  );
  const tr = view.state.tr.replaceWith(
    start5,
    start5 + paragraph2.nodeSize,
    plain,
  );
  tr.setSelection(TextSelection.create(tr.doc, start5 + 3));
  tr.setStoredMarks([]);
  view.dispatch(tr.scrollIntoView());
  return true;
}













export const markTitleLineFirstBackCell = (strict: boolean) => $shortcut(() => ({
  Backspace: { key: "Backspace", onRun: () => lineFirstBackCell(strict), priority: 60 },
  Delete: { key: "Delete", onRun: () => lineFirstBackCell(strict), priority: 60 },
}));
















export const markTitleReturnCarBecomeBlock = (strict: boolean) => $prose(() => {
  let bufferSave: { doc: PMNode; item: PendingDecoration[] } | null = null;

  return new Plugin({
    key: new PluginKey("nota-heading-on-enter"),
    props: {
      handleTextInput: (view, from, to, text4) =>
        text4 === " " && from === to && preparePlainHeadingPrefix(view),
      handleKeyDown: (view, event) => {
        if (
          event.key === " " &&
          !event.shiftKey &&
          !event.ctrlKey &&
          !event.metaKey &&
          !event.altKey &&
          !view.composing
        ) {
          if (preparePlainHeadingPrefix(view)) {
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

      decorations: (state) => {
        if (!bufferSave || bufferSave.doc !== state.doc) {
          bufferSave = { doc: state.doc, item: computeDecorationsItem(state.doc, strict) };
        }
        return createDecorationCollection(
          state.doc,
          bufferSave.item,
          state.selection.from,
        );
      },
    },
  });
});
