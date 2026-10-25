/** 表格对齐按钮只修改光标所在列，并同时覆盖表头与数据格。 */

import { Schema } from "@milkdown/kit/prose/model";
import type { Node as PMNode } from "@milkdown/kit/prose/model";
import { EditorState, TextSelection } from "@milkdown/kit/prose/state";
import { TableMap, tableNodes } from "@milkdown/kit/prose/tables";
import { readFileSync } from "node:fs";

import { currentColumnAlignmentTransaction } from "../src/editor/table-context";

let passed = 0;
let failure = 0;

function testCase(name3: string, body3: () => void): void {
  try {
    body3();
    passed += 1;
    console.log(`  ✔ ${name3}`);
  } catch (error) {
    failure += 1;
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

const paragraph2 = (text4: string): PMNode =>
  schema.nodes.paragraph.create(null, text4 ? schema.text(text4) : null);
const cell2 = (text4: string, alignment = "left"): PMNode =>
  schema.nodes.table_cell.create({ alignment }, paragraph2(text4));
const headCell = (text4: string, alignment = "left"): PMNode =>
  schema.nodes.table_header.create({ alignment }, paragraph2(text4));
const line3 = (...cells: PMNode[]): PMNode => schema.nodes.table_row.create(null, cells);
const headLine = (...cells: PMNode[]): PMNode =>
  schema.nodes.table_header_row.create(null, cells);
const table2 = (...rows: PMNode[]): PMNode => schema.nodes.table.create(null, rows);

function createState2(): EditorState {
  const table = table2(
    headLine(headCell("A"), headCell("B"), headCell("C")),
    line3(cell2("1"), cell2("2"), cell2("3")),
    line3(cell2("4"), cell2("5"), cell2("6")),
  );
  const doc = schema.nodes.doc.create(null, table);
  // 表格从位置 0 开始；tableStart 是 1。光标放进第二行第二格。
  const map = TableMap.get(table);
  const ordinalTwoLineOrdinalTwoCell = 1 + map.map[map.width + 1];
  return EditorState.create({
    schema,
    doc,
    selection: TextSelection.near(doc.resolve(ordinalTwoLineOrdinalTwoCell + 2)),
  });
}

console.log("\n【表格列对齐】");

testCase("第二列居中时，表头和三行数据只改第二列", () => {
  const state = createState2();
  const tr = currentColumnAlignmentTransaction(state, "center");
  assertValue(tr, "应产生一笔对齐事务");
  const table = state.apply(tr).doc.firstChild;
  assertValue(table?.type.name === "table", "结果仍应是表格");
  const align = (lineNumber: number): unknown[] =>
    Array.from(
      { length: table.child(lineNumber).childCount },
      (_, column) => table.child(lineNumber).child(column).attrs.alignment,
    );
  assertValue(
    JSON.stringify(align(0)) === JSON.stringify(["left", "center", "left"]),
    `表头对齐错误：${JSON.stringify(align(0))}`,
  );
  assertValue(
    JSON.stringify(align(1)) === JSON.stringify(["left", "center", "left"]),
    `第一数据行对齐错误：${JSON.stringify(align(1))}`,
  );
  assertValue(
    JSON.stringify(align(2)) === JSON.stringify(["left", "center", "left"]),
    `第二数据行对齐错误：${JSON.stringify(align(2))}`,
  );
});

testCase("当前列已是对齐值时不再派空事务", () => {
  const state = createState2();
  const tr = currentColumnAlignmentTransaction(state, "left");
  assertValue(tr === null, "没有变化时应返回 null");
});

testCase("表格单元格里的段落继承列对齐，不被主题的段落规则压回左侧", () => {
  const css = readFileSync("src/styles/editor-blocks.css", "utf8");
  assertValue(
    /:is\(th, td\)\s*>\s*p\s*\{[^}]*text-align:\s*inherit/s.test(css),
    "缺少单元格段落继承规则",
  );
});

if (failure > 0) {
  console.error(`\n${failure} 项失败`);
  process.exit(1);
}
console.log(`\n${passed} passed, 0 failed`);
