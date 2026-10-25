/** `| 1 | 2 |` 回车直接成表。 */

import { Schema } from "@milkdown/kit/prose/model";
import { EditorState, TextSelection } from "@milkdown/kit/prose/state";
import { tableNodes } from "@milkdown/kit/prose/tables";

import { isSingleLineTable, trySingleLineTable } from "../src/editor/table-input";

let pass = 0;
let fail = 0;

function testCase(name3: string, body3: () => void): void {
  try {
    body3();
    pass += 1;
    console.log(`  ✔ ${name3}`);
  } catch (error) {
    fail += 1;
    console.log(`  ✘ ${name3}`);
    console.log(`      ${error instanceof Error ? error.message : String(error)}`);
  }
}

function assertValue(value2: unknown, description: string): asserts value2 {
  if (!value2) throw new Error(description);
}

const spec = tableNodes({
  tableGroup: "block",
  cellContent: "paragraph",
  cellAttributes: { alignment: { default: "left" } },
});
const schema = new Schema({
  nodes: {
    doc: { content: "block+" },
    paragraph: { group: "block", content: "inline*" },
    text: { group: "inline" },
    table: { ...spec.table, content: "table_header_row table_row+" },
    table_row: { ...spec.table_row, content: "(table_cell)*" },
    table_header_row: { ...spec.table_row, content: "(table_header)*" },
    table_cell: spec.table_cell,
    table_header: spec.table_header,
  } as never,
  marks: {},
});

console.log("\n【单行表格回车】");

testCase("至少两列的 pipe 行才算单行表格", () => {
  assertValue(isSingleLineTable("| 1 | 2 |")?.length === 2, "两列应命中");
  assertValue(isSingleLineTable("| 1 |") === null, "单列不应命中");
  assertValue(isSingleLineTable("| --- | --- |") === null, "分隔行不应当成表头");
});

testCase("转换为两列表头加一行空数据格，光标落在数据格", () => {
  const text = schema.text("| 1 | 2 |");
  const p = schema.nodes.paragraph.create(null, text);
  const doc = schema.nodes.doc.create(null, p);
  const state = EditorState.create({
    schema,
    doc,
    selection: TextSelection.create(doc, p.nodeSize - 1),
  });
  const tr = trySingleLineTable(state, state.selection.$from);
  assertValue(tr !== null, "事务应产生");
  const after = state.apply(tr);
  const table = after.doc.firstChild;
  assertValue(table?.type.name === "table", "第一块应是表格");
  assertValue(table.childCount === 2, "应有一行表头加一行数据");
  assertValue(table.firstChild?.childCount === 2, "表头应有两格");
  assertValue(table.lastChild?.childCount === 2, "数据行应有两格");
  assertValue(table.firstChild?.textContent === "12", "表头文字应保留");
  const $sel = after.selection.$from;
  let inDataRow = false;
  for (let d = 1; d <= $sel.depth; d += 1) {
    if ($sel.node(d).type.name === "table_row") inDataRow = true;
  }
  assertValue(inDataRow, "光标应在数据行");
});

if (fail > 0) {
  console.error(`\n${fail} 项失败`);
  process.exitCode = 1;
} else {
  console.log(`\n${pass} passed, 0 failed`);
}
