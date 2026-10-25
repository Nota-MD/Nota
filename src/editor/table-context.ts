/**
 * 表格浮动工具栏和右键「表格」子菜单用到的结构操作。
 *
 * 列宽拖动已经移除；这里的 resize 是“改变整张表的行列数”，不是拖列边界。
 */

import { editorViewCtx, parserCtx, serializerCtx, type Editor } from "@milkdown/kit/core";
import { Fragment, type Node as PMNode, type NodeType } from "@milkdown/kit/prose/model";
import { TextSelection } from "@milkdown/kit/prose/state";
import {
  findTable,
  moveTableColumn,
  moveTableRow,
  selectedRect,
} from "@milkdown/kit/prose/tables";
import type { EditorState, Transaction } from "@milkdown/kit/prose/state";

function rows(table2: PMNode): PMNode[] {
  const output2: PMNode[] = [];
  table2.forEach((line3) => output2.push(line3));
  return output2;
}

function emptyCell(type: NodeType, modelBoard: PMNode | null): PMNode {
  const align = modelBoard?.attrs.alignment;
  const attrs = align === undefined ? null : { alignment: align };
  return type.createAndFill(attrs) ?? type.create(attrs);
}

function configureWholeLine(line3: PMNode, columnCount: number, modelBoard: PMNode | null): PMNode {
  const cells: PMNode[] = [];
  line3.forEach((cell2, _Offset, belowMark) => {
    if (belowMark >= columnCount) return;
    cells.push(cell2);
  });
  const cellType =
    line3.firstChild?.type ??
    modelBoard?.firstChild?.type ??
    null;
  if (!cellType) return line3;
  while (cells.length < columnCount) cells.push(emptyCell(cellType, modelBoard?.firstChild ?? null));
  return line3.type.create(line3.attrs, Fragment.from(cells));
}

/** 把光标所在表格调整为目标列数 / 行数（行数包含表头行）。 */
export function resizeCurrentTable(editor: Editor, columnCount: number, rowCount: number): void {
  editor.action((ctx) => {
    const view = ctx.get(editorViewCtx);
    const { state } = view;
    const found = findTable(state.selection.$from);
    if (!found) return;
    const column = Math.max(1, Math.min(12, Math.round(columnCount)));
    const line3 = Math.max(2, Math.min(30, Math.round(rowCount)));
    const originalRows = rows(found.node);
    const headLine = originalRows[0];
    if (!headLine) return;
    const cell2 = headLine.firstChild;
    if (!cell2) return;

    const newLines: PMNode[] = [];
    for (let r = 0; r < line3; r += 1) {
      const original = originalRows[r];
      if (original) {
        newLines.push(configureWholeLine(original, column, headLine));
        continue;
      }
      const rowType = state.schema.nodes.table_row;
      if (!rowType) return;
      const cellType = state.schema.nodes.table_cell ?? cell2.type;
      const cells: PMNode[] = [];
      for (let c = 0; c < column; c += 1) cells.push(emptyCell(cellType, cell2));
      newLines.push(rowType.create(null, Fragment.from(cells)));
    }

    const newValueTable = found.node.type.create(found.node.attrs, Fragment.from(newLines));
    const tr = state.tr.replaceWith(found.pos, found.pos + found.node.nodeSize, newValueTable);
    tr.setSelection(TextSelection.near(tr.doc.resolve(found.pos + 4)));
    view.dispatch(tr.scrollIntoView());
  });
}

export type tableColumnAlignment = "left" | "center" | "right";

/**
 * 只改光标所在列的对齐。列对齐是 GFM 分隔行上的逐列属性，不是整张表的属性；
 * 因此一次事务只更新 `TableMap` 中当前列覆盖到的格子，其他列保持不变。
 */
export function currentColumnAlignmentTransaction(
  state: EditorState,
  alignment: tableColumnAlignment,
): Transaction | null {
  if (!findTable(state.selection.$from)) return null;
  const rectangleShape = selectedRect(state);
  const tr = state.tr;
  const column = rectangleShape.left;
  for (let line3 = 0; line3 < rectangleShape.map.height; line3 += 1) {
    const phaseCorrect = rectangleShape.map.map[line3 * rectangleShape.map.width + column];
    if (phaseCorrect === undefined) continue;
    const position2 = rectangleShape.tableStart + phaseCorrect;
    const cell2 = state.doc.nodeAt(position2);
    if (!cell2 || cell2.attrs.alignment === alignment) continue;
    tr.setNodeMarkup(position2, undefined, { ...cell2.attrs, alignment });
  }
  return tr.docChanged ? tr : null;
}

/** 对齐光标所在的整列；表头与数据格一起更新。 */
export function alignCurrentTableColumn(editor: Editor, alignment: tableColumnAlignment): void {
  editor.action((ctx) => {
    const view = ctx.get(editorViewCtx);
    const tr = currentColumnAlignmentTransaction(view.state, alignment);
    if (tr) view.dispatch(tr.scrollIntoView());
  });
}

/** 上移 / 下移当前行；表头行不参与移动。 */
export function moveCurrentTableRow(editor: Editor, direction: -1 | 1): void {
  editor.action((ctx) => {
    const view = ctx.get(editorViewCtx);
    if (!view.state.selection.$from.parent.inlineContent) return;
    const table2 = selectedRect(view.state);
    if (table2.top === 0) return;
    const from = table2.top;
    const to2 = Math.max(1, Math.min(table2.map.height - 1, from + direction));
    if (from === to2) return;
    moveTableRow({ from: from, to: to2, select: false })(
      view.state,
      (tr) => view.dispatch(tr.scrollIntoView()),
    );
  });
}

/** 左移 / 右移当前列。 */
export function moveCurrentTableColumn(editor: Editor, direction: -1 | 1): void {
  editor.action((ctx) => {
    const view = ctx.get(editorViewCtx);
    if (!view.state.selection.$from.parent.inlineContent) return;
    const table2 = selectedRect(view.state);
    const from = table2.left;
    const to2 = Math.max(0, Math.min(table2.map.width - 1, from + direction));
    if (from === to2) return;
    moveTableColumn({ from: from, to: to2, select: false })(
      view.state,
      (tr) => view.dispatch(tr.scrollIntoView()),
    );
  });
}

/** 把当前表格按 Markdown 序列化后的规范列宽重排一次。 */
export function formatCurrentTable(editor: Editor): void {
  editor.action((ctx) => {
    const view = ctx.get(editorViewCtx);
    const found = findTable(view.state.selection.$from);
    if (!found) return;
    const serialize = ctx.get(serializerCtx);
    const parse = ctx.get(parserCtx);
    let newValueTable: PMNode | null = null;
    parse(serialize(found.node)).descendants((node) => {
      if (!newValueTable && node.type.name === "table") {
        newValueTable = node;
        return false;
      }
      return true;
    });
    if (!newValueTable) return;
    view.dispatch(
      view.state.tr
        .replaceWith(found.pos, found.pos + found.node.nodeSize, newValueTable)
        .scrollIntoView(),
    );
  });
}

/** 复制当前表格；同时提供 HTML 与纯文本，与常见表格软件的剪贴板一致。 */
export function duplicateCurrentTable(editor: Editor): void {
  editor.action((ctx) => {
    const view = ctx.get(editorViewCtx);
    const found = findTable(view.state.selection.$from);
    if (!found) return;
    const box = document.createElement("div");
    const table2 = document.createElement("table");
    found.node.forEach((line3) => {
      const tr = document.createElement("tr");
      line3.forEach((cell2) => {
        const td = document.createElement(cell2.type.name === "table_header" ? "th" : "td");
        td.textContent = cell2.textContent;
        tr.append(td);
      });
      table2.append(tr);
    });
    box.append(table2);
    const html = box.innerHTML;
    const text = table2.innerText;
    if (navigator.clipboard?.write && typeof ClipboardItem !== "undefined") {
      void navigator.clipboard
        .write([
          new ClipboardItem({
            "text/html": new Blob([html], { type: "text/html" }),
            "text/plain": new Blob([text], { type: "text/plain" }),
          }),
        ])
        .catch(() => navigator.clipboard?.writeText(text));
    } else {
      void navigator.clipboard?.writeText(text);
    }
  });
}
