/** `| 1 | 2 |` 回车直接成表。 */

import { Schema } from "@milkdown/kit/prose/model";
import { EditorState, TextSelection } from "@milkdown/kit/prose/state";
import { tableNodes } from "@milkdown/kit/prose/tables";

import { 判单行表格, 试单行表格 } from "../src/editor/table-input";

let 过 = 0;
let 败 = 0;

function 测(名: string, 体: () => void): void {
  try {
    体();
    过 += 1;
    console.log(`  ✔ ${名}`);
  } catch (error) {
    败 += 1;
    console.log(`  ✘ ${名}`);
    console.log(`      ${error instanceof Error ? error.message : String(error)}`);
  }
}

function 真(值: unknown, 说明: string): asserts 值 {
  if (!值) throw new Error(说明);
}

const 规格 = tableNodes({
  tableGroup: "block",
  cellContent: "paragraph",
  cellAttributes: { alignment: { default: "left" } },
});
const schema = new Schema({
  nodes: {
    doc: { content: "block+" },
    paragraph: { group: "block", content: "inline*" },
    text: { group: "inline" },
    table: { ...规格.table, content: "table_header_row table_row+" },
    table_row: { ...规格.table_row, content: "(table_cell)*" },
    table_header_row: { ...规格.table_row, content: "(table_header)*" },
    table_cell: 规格.table_cell,
    table_header: 规格.table_header,
  } as never,
  marks: {},
});

console.log("\n【单行表格回车】");

测("至少两列的 pipe 行才算单行表格", () => {
  真(判单行表格("| 1 | 2 |")?.length === 2, "两列应命中");
  真(判单行表格("| 1 |") === null, "单列不应命中");
  真(判单行表格("| --- | --- |") === null, "分隔行不应当成表头");
});

测("转换为两列表头加一行空数据格，光标落在数据格", () => {
  const text = schema.text("| 1 | 2 |");
  const p = schema.nodes.paragraph.create(null, text);
  const doc = schema.nodes.doc.create(null, p);
  const state = EditorState.create({
    schema,
    doc,
    selection: TextSelection.create(doc, p.nodeSize - 1),
  });
  const tr = 试单行表格(state, state.selection.$from);
  真(tr !== null, "事务应产生");
  const after = state.apply(tr);
  const table = after.doc.firstChild;
  真(table?.type.name === "table", "第一块应是表格");
  真(table.childCount === 2, "应有一行表头加一行数据");
  真(table.firstChild?.childCount === 2, "表头应有两格");
  真(table.lastChild?.childCount === 2, "数据行应有两格");
  真(table.firstChild?.textContent === "12", "表头文字应保留");
  const $sel = after.selection.$from;
  let inDataRow = false;
  for (let d = 1; d <= $sel.depth; d += 1) {
    if ($sel.node(d).type.name === "table_row") inDataRow = true;
  }
  真(inDataRow, "光标应在数据行");
});

if (败 > 0) {
  console.error(`\n${败} 项失败`);
  process.exitCode = 1;
} else {
  console.log(`\n${过} passed, 0 failed`);
}
