






























import { editorViewCtx, parserCtx, serializerCtx } from "@milkdown/kit/core";
import type { Editor } from "@milkdown/kit/core";
import type { Node as PMNode } from "@milkdown/kit/prose/model";
import { NodeSelection, TextSelection } from "@milkdown/kit/prose/state";
import type { EditorState, Transaction } from "@milkdown/kit/prose/state";
import { deleteColumn, deleteRow, deleteTable } from "@milkdown/kit/prose/tables";

import { blockHtmlNodeName } from "./html-block";
import { tocEndMarker, tocStartMarker, computeItemRecordBlock } from "./toc";









function ancestorFirstDarkDegree($pos: { depth: number; node: (d: number) => { type: { name: string } } }, name: string): number {
  for (let d = $pos.depth; d > 0; d--) {
    if ($pos.node(d).type.name === name) return d;
  }
  return -1;
}























export function convertBecomeTaskTaskColumnTable(editor: Editor): void {
  editor.action((ctx) => {
    const view = ctx.get(editorViewCtx);
    const { state } = view;
    const { $from } = state.selection;


    const itemDepth = ancestorFirstDarkDegree($from, "list_item");
    if (itemDepth > 0) {
      const item = $from.node(itemDepth);
      view.dispatch(
        state.tr.setNodeMarkup($from.before(itemDepth), undefined, {
          ...item.attrs,

          checked: item.attrs.checked == null ? false : null,
        }),
      );
      return;
    }






    const blockDepth = 1;
    const block = $from.node(blockDepth);
    const bulletListType = state.schema.nodes.bullet_list;
    const listItemType = state.schema.nodes.list_item;
    if (!block || !bulletListType || !listItemType) return;

    const before = $from.before(blockDepth);
    const after = $from.after(blockDepth);
    const item = listItemType.create({ checked: false }, block);
    const list = bulletListType.create(null, item);

    const tr = state.tr.replaceWith(before, after, list);


    tr.setSelection(TextSelection.near(tr.doc.resolve(tr.mapping.map($from.pos))));
    view.dispatch(tr.scrollIntoView());
  });
}








export function clearRemoveCellStyle(editor: Editor): void {
  editor.action((ctx) => {
    const view = ctx.get(editorViewCtx);
    const { state } = view;
    const { from, to, empty } = state.selection;
    if (empty) return;
    view.dispatch(state.tr.removeMark(from, to).scrollIntoView());
  });
}













export function deleteTableRow(editor: Editor): void {
  editor.action((ctx) => {
    const view = ctx.get(editorViewCtx);
    deleteRow(view.state, (tr) => view.dispatch(tr));
  });
}

export function deleteTableColumn(editor: Editor): void {
  editor.action((ctx) => {
    const view = ctx.get(editorViewCtx);
    deleteColumn(view.state, (tr) => view.dispatch(tr));
  });
}

export function deleteWholeTable(editor: Editor): void {
  editor.action((ctx) => {
    const view = ctx.get(editorViewCtx);
    deleteTable(view.state, (tr) => view.dispatch(tr));
  });
}







export function toggleTableRowHeaders(editor: Editor): void {
  editor.action((ctx) => {
    const view = ctx.get(editorViewCtx);
    const { state } = view;
    const { $from } = state.selection;
    const tableDepth = ancestorFirstDarkDegree($from, "table");
    if (tableDepth < 1) return;
    const paragraph = state.schema.nodes.paragraph;
    if (!paragraph) return;
    const before = $from.before(tableDepth);
    const after = $from.after(tableDepth);
    const marker = (value: string) =>
      paragraph.create(null, state.schema.text(value));
    const startText = "{% rowheaders %}";
    const endText = "{% endrowheaders %}";
    const nodeBefore = state.doc.resolve(before).nodeBefore;
    const nodeAfter = state.doc.resolve(after).nodeAfter;
    const hasStart =
      nodeBefore?.type.name === "paragraph" &&
      nodeBefore.textContent.trim() === startText;
    const hasEnd =
      nodeAfter?.type.name === "paragraph" &&
      nodeAfter.textContent.trim() === endText;

    const tr = state.tr;
    if (hasStart && hasEnd) {
      tr.delete(after, after + nodeAfter!.nodeSize);
      tr.delete(before - nodeBefore!.nodeSize, before);
    } else {
      tr.insert(after, marker(endText));
      tr.insert(before, marker(startText));
    }
    tr.setSelection(
      TextSelection.near(tr.doc.resolve(tr.mapping.map($from.pos))),
    );
    view.dispatch(tr.scrollIntoView());
    view.focus();
  });
}























export function insertCommonStyleBlock(editor: Editor): void {
  editor.action((ctx) => {
    const view = ctx.get(editorViewCtx);


    //








    //


    view.focus();

    const { state } = view;
    const type = state.schema.nodes.math_block;


    if (!type) return;

    const { $from } = state.selection;




    const thenPosition =
      $from.depth === 1 && $from.parent.type.name === "paragraph" && $from.parent.content.size === 0;

    const tr = state.tr;


    const position2 = thenPosition ? $from.before(1) : $from.after(1);
    const commonStyle = type.create({ value: "" });
    if (thenPosition) tr.replaceWith($from.before(1), $from.after(1), commonStyle);
    else tr.insert(position2, commonStyle);

    tr.setSelection(NodeSelection.create(tr.doc, position2));
    view.dispatch(tr.scrollIntoView());
  });
}

















function findItemRecordParagraph(doc: PMNode): { start5: number; end2: number } | null {
  let start5 = -1;
  let end2 = -1;
  doc.forEach((node, offset) => {
    if (end2 !== -1 || node.type.name !== blockHtmlNodeName) return;
    const value2 = (node.attrs as { value?: unknown }).value;
    if (typeof value2 !== "string") return;
    const clean = value2.trim();
    if (clean === tocStartMarker && start5 === -1) start5 = offset + node.nodeSize;
    else if (clean === tocEndMarker && start5 !== -1) end2 = offset;
  });


  if (start5 === -1 || end2 === -1 || end2 < start5) return null;
  return { start5, end2 };
}





















export function tocTransaction(
  state: EditorState,
  serialize: (node: PMNode) => string,
  parse: (markdown: string) => PMNode,
  strict: boolean,
): Transaction | null {
  const block = computeItemRecordBlock(serialize(state.doc), strict);
  if (block === null) return null;
  if (!state.schema.nodes[blockHtmlNodeName]) return null;

  const newValuedoc = parse(block);
  const newNodes = newValuedoc.content.content;

  if (newNodes.length < 3) return null;
  const newValueMiddleParagraph = newValuedoc.content.cut(newNodes[0]!.nodeSize, newValuedoc.content.size - newNodes[newNodes.length - 1]!.nodeSize);

  const paragraph2 = findItemRecordParagraph(state.doc);
  const tr = state.tr;

  if (paragraph2) {


    if (state.doc.slice(paragraph2.start5, paragraph2.end2).content.eq(newValueMiddleParagraph)) return null;
    tr.replaceWith(paragraph2.start5, paragraph2.end2, newValueMiddleParagraph);
    return tr.scrollIntoView();
  }

  const { $from } = state.selection;
  const position2 = $from.depth >= 1 ? $from.after(1) : state.doc.content.size;
  tr.insert(position2, newValuedoc.content);
  return tr.scrollIntoView();
}











export function insertItemRecord(editor: Editor, strict: boolean): void {
  editor.action((ctx) => {
    const view = ctx.get(editorViewCtx);
    view.focus();
    const tr = tocTransaction(
      view.state,
      (n) => ctx.get(serializerCtx)(n),
      (md) => ctx.get(parserCtx)(md) as unknown as PMNode,
      strict,
    );
    if (!tr) return;
    view.dispatch(tr);
  });
}
