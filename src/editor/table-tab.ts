
//!

//! |---|---|---|---|




//!

//!






//!









//!


//!

//!





//!

//!









//!



//!







//!

//!


//!

//!


//!

//!











import { $prose } from "@milkdown/kit/utils";
import type { Node as PMNode, NodeType, Schema } from "@milkdown/kit/prose/model";
import type { EditorState } from "@milkdown/kit/prose/state";
import type { Transaction } from "@milkdown/kit/prose/state";
import { Plugin, PluginKey, TextSelection } from "@milkdown/kit/prose/state";
import { goToNextCell, isInTable, selectedRect, tableNodeTypes } from "@milkdown/kit/prose/tables";

export const tableTabKey2 = new PluginKey("nota-table-tab");





export function newValueLineStart(tableContentStart: number, beforeSurfaceEachLineHeight: readonly number[]): number {
  let walk = tableContentStart;
  for (const height of beforeSurfaceEachLineHeight) walk += height;
  return walk;
}









export function firstCellDrop(tableContentStart: number, beforeSurfaceEachLineHeight: readonly number[]): number {
  return newValueLineStart(tableContentStart, beforeSurfaceEachLineHeight) + 2;
}












export function rowCellType(schema: Schema): { line3: NodeType; cell2: NodeType } {
  const cornerColor = tableNodeTypes(schema);
  return {
    line3: schema.nodes.table_row ?? cornerColor.row,
    cell2: schema.nodes.table_cell ?? cornerColor.cell,
  };
}



















export function handleTableTab(
  state: EditorState,
  dispatch: ((tr: Transaction) => void) | undefined,
  reverseToward: boolean,
): boolean {
  if (!isInTable(state)) return false;
  if (goToNextCell(reverseToward ? -1 : 1)(state, dispatch)) return true;

  if (reverseToward) return true;
  if (!dispatch) return true;
  const table2 = selectedRect(state);
  const beforeSurfaceEachLineHeight: number[] = [];
  for (let i = 0; i < table2.bottom; i++) beforeSurfaceEachLineHeight.push(table2.table.child(i).nodeSize);
  const { line3: rowType2, cell2: cellType2 } = rowCellType(state.schema);
  const newValueCell: PMNode[] = [];
  for (let i = 0; i < table2.map.width; i++) {
    const valueCell = cellType2.createAndFill();



    if (!valueCell) return true;
    newValueCell.push(valueCell);
  }
  const tr = state.tr.insert(
    newValueLineStart(table2.tableStart, beforeSurfaceEachLineHeight),
    rowType2.create(null, newValueCell),
  );


  tr.setSelection(TextSelection.near(tr.doc.resolve(firstCellDrop(table2.tableStart, beforeSurfaceEachLineHeight))));
  dispatch(tr.scrollIntoView());
  return true;
}





























export function tableTabKey(
  state: EditorState,
  dispatch: ((tr: Transaction) => void) | undefined,
  event: {
    key: string;
    keyCode: number;
    shiftKey: boolean;
    ctrlKey: boolean;
    altKey: boolean;
    metaKey: boolean;
  },
  composing: boolean,
): boolean {
  if (composing) return false;
  if (event.ctrlKey || event.altKey || event.metaKey) return false;


  if (event.key !== "Tab" && event.keyCode !== 9) return false;
  return handleTableTab(state, dispatch, event.shiftKey);
}





export function createTableTabPlugin(): Plugin {
  return new Plugin({
    key: tableTabKey2,
    props: {
      handleKeyDown: (view, event) =>
        tableTabKey(view.state, (tr) => view.dispatch(tr), event, view.composing),
    },
  });
}







export function tableTab() {
  return $prose(() => createTableTabPlugin());
}
