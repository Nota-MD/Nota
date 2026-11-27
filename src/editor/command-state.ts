





























import { Plugin } from "@milkdown/kit/prose/state";
import type { EditorState } from "@milkdown/kit/prose/state";
import { $prose } from "@milkdown/kit/utils";
import { CellSelection } from "@milkdown/kit/prose/tables";

import { coverWriteOpen } from "./overtype";






export type BlockKind =
  | "text"
  | "h1"
  | "h2"
  | "h3"
  | "h4"
  | "h5"
  | "h6"
  | "quote"
  | "ul"
  | "ol"
  | "task"
  | "codeBlock";

export interface CommandState {

  bold: boolean;
  italic: boolean;
  strike: boolean;
  inlineCode: boolean;








  highlight: boolean;
  superscript: boolean;
  subscript: boolean;

  underline: boolean;

  block: BlockKind;








  overtype: boolean;







  inTable: boolean;
  tableCell: { row: number; column: number } | null;

  hasSelection: boolean;











  hasHeadings: boolean;
}


export const emptyState: CommandState = {
  overtype: false,
  bold: false,
  italic: false,
  strike: false,
  inlineCode: false,
  highlight: false,
  superscript: false,
  subscript: false,
  underline: false,
  block: "text",
  inTable: false,
  tableCell: null,
  hasSelection: false,
  hasHeadings: false,
};


function readBlock(state: EditorState): { block: BlockKind; inTable: boolean } {
  const { $from } = state.selection;
  let block: BlockKind = "text";
  let inTable = false;
  let fixedPass = false;





  for (let d = $from.depth; d > 0; d--) {
    const node = $from.node(d);
    const name = node.type.name;


    if (name === "table_cell" || name === "table_header") inTable = true;

    if (fixedPass) continue;
    switch (name) {
      case "code_block":
        block = "codeBlock";
        fixedPass = true;
        break;
      case "blockquote":
        block = "quote";
        fixedPass = true;
        break;
      case "heading":


        block = (node.attrs.level >= 1 && node.attrs.level <= 6
          ? `h${node.attrs.level}`
          : "text") as BlockKind;
        fixedPass = true;
        break;
      case "list_item": {


        const parent = d > 1 ? $from.node(d - 1).type.name : "";

        block =
          node.attrs.checked != null ? "task" : parent === "ordered_list" ? "ol" : "ul";
        fixedPass = true;
        break;
      }
      default:
        break;
    }
  }

  return { block, inTable };
}


function readTableCell(
  state: EditorState,
): { row: number; column: number } | null {
  const { $from } = state.selection;
  for (let depth = $from.depth; depth >= 2; depth--) {
    const node = $from.node(depth);
    if (node.type.name !== "table_cell" && node.type.name !== "table_header") {
      continue;
    }
    return {
      row: $from.index(depth - 2),
      column: $from.index(depth - 1),
    };
  }
  return null;
}

export const tableActiveCellChangedEvent = "nota-table-active-cell-changed";

export function readState(state: EditorState): CommandState {
  const { $from, empty } = state.selection;



  const marks = state.storedMarks ?? (empty ? [] : $from.marks());
  const has = (name: string) => marks.some((m) => m.type.name === name);
  const { block, inTable } = readBlock(state);



  let hasHeadings = false;
  state.doc.forEach((node) => {
    if (node.type.name === "heading") hasHeadings = true;
  });

  return {
    overtype: coverWriteOpen(state),
    bold: has("strong"),
    italic: has("emphasis"),
    strike: has("strike_through"),
    inlineCode: has("inlineCode"),
    highlight: has("highlight"),
    superscript: has("superscript"),
    subscript: has("subscript"),
    underline: has("underline"),
    block,
    inTable,
    tableCell: inTable ? readTableCell(state) : null,
    hasSelection: !empty,
    hasHeadings,
  };
}







function keyName(s: CommandState): string {




  return `${s.overtype ? 1 : 0}${s.bold ? 1 : 0}${s.italic ? 1 : 0}${s.strike ? 1 : 0}${s.inlineCode ? 1 : 0}` +
    `${s.highlight ? 1 : 0}${s.superscript ? 1 : 0}${s.subscript ? 1 : 0}${s.underline ? 1 : 0}` +
    `|${s.block}|${s.inTable ? 1 : 0}${s.hasSelection ? 1 : 0}${s.hasHeadings ? 1 : 0}` +
    `|${s.tableCell?.row ?? -1}:${s.tableCell?.column ?? -1}`;
}







export function cursorStatePlugin(onChange: (state: CommandState) => void) {
  return $prose(() => {
    let aboveCount = "";
    const report = (state: EditorState) => {
      const now = readState(state);
      const sig = keyName(now);
      if (sig === aboveCount) return;
      aboveCount = sig;
      window.dispatchEvent(
        new CustomEvent(tableActiveCellChangedEvent, {
          detail: {
            cell: now.tableCell,
            range: state.selection instanceof CellSelection,
            empty: state.selection.empty,
          },
        }),
      );
      onChange(now);
    };
    return new Plugin({
      view: (view) => {



        report(view.state);
        return {
          update: (view) => {
            report(view.state);


            return false;
          },
        };
      },
    });
  });
}
