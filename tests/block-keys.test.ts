/**
 * 块容器开场键的应用测试：
 * - 引用最开头按空格拆掉全部引用层；
 * - 空表格开头按退格删除整张表。
 */

import { Schema } from "@milkdown/kit/prose/model";
import type { Node as PMNode } from "@milkdown/kit/prose/model";
import { EditorState, TextSelection } from "@milkdown/kit/prose/state";
import { tableNodes } from "@milkdown/kit/prose/tables";

import {
  getClearAllReferenceUse,
  atReferenceUseMostOpenHead,
  atEmptyTableCellOpenHead,
  deleteEmptyTable,
} from "../src/editor/block-keys";

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

const tableSpec = tableNodes({
  tableGroup: "block",
  cellContent: "paragraph",
  cellAttributes: { alignment: { default: "left" } },
});
const headerRowSpec = { ...tableSpec.table_row, content: "(table_header)*" };
const schema = new Schema({
  nodes: {
    doc: { content: "block+" },
    paragraph: { group: "block", content: "inline*" },
    blockquote: { group: "block", content: "block+", defining: true },
    text: { group: "inline" },
    table: { ...tableSpec.table, content: "table_header_row table_row+" },
    table_row: { ...tableSpec.table_row, content: "(table_cell)*" },
    table_header_row: headerRowSpec,
    table_cell: tableSpec.table_cell,
    table_header: tableSpec.table_header,
  } as never,
  marks: {},
});

const paragraph2 = (text = ""): PMNode =>
  schema.nodes.paragraph.create(null, text ? schema.text(text) : null);
const referenceUse = (...blocks: PMNode[]): PMNode => schema.nodes.blockquote.create(null, blocks);
const headerCell = (text = ""): PMNode =>
  schema.nodes.table_header.create(null, paragraph2(text));
const cell2 = (text = ""): PMNode => schema.nodes.table_cell.create(null, paragraph2(text));
const line3 = (...cells: PMNode[]): PMNode => schema.nodes.table_row.create(null, cells);
const table2 = (): PMNode =>
  schema.nodes.table.create(null, [
    schema.nodes.table_header_row.create(null, [headerCell(), headerCell()]),
    line3(cell2(), cell2()),
  ]);
const document = (...blocks: PMNode[]): PMNode => schema.nodes.doc.create(null, blocks);

function stateAt(doc: PMNode, pos: number): EditorState {
  return EditorState.create({
    schema,
    doc,
    selection: TextSelection.near(doc.resolve(pos)),
  });
}

function transactionShouldUseTo(state: EditorState, command: typeof getClearAllReferenceUse): EditorState {
  let current = state;
  const accepted = command(state, (tr) => {
    current = current.apply(tr);
  });
  assertValue(accepted, "命令应当接受这一下");
  return current;
}

function hasReferenceUseNode(node: PMNode): boolean {
  let found = false;
  node.descendants((child) => {
    if (child.type.name === "blockquote") found = true;
  });
  return found;
}

console.log("\n【块容器开场键】");

testCase("嵌套引用最开头可一次退出全部引用", () => {
  const doc = document(referenceUse(referenceUse(paragraph2("正文"))));
  const state = stateAt(doc, 3);
  assertValue(atReferenceUseMostOpenHead(state), "应识别为引用最开头");
  const after = transactionShouldUseTo(state, getClearAllReferenceUse);
  assertValue(!hasReferenceUseNode(after.doc), "引用层应全部消失");
  assertValue(after.doc.textContent === "正文", "正文应原样保留");
});

testCase("引用中间或非开头不消费空格", () => {
  const doc = document(referenceUse(paragraph2("前文")));
  const state = EditorState.create({
    schema,
    doc,
    selection: TextSelection.create(doc, 4),
  });
  assertValue(!atReferenceUseMostOpenHead(state), "非绝对开头不应命中");
  assertValue(!getClearAllReferenceUse(state, () => {}), "命令应放行");
});

testCase("空表格开头退格删除整张表", () => {
  const doc = document(table2());
  const state = stateAt(doc, 3);
  assertValue(atEmptyTableCellOpenHead(state), "应识别为空表格开头");
  let after = state;
  const accepted = deleteEmptyTable(state, (tr) => {
    after = state.apply(tr);
  });
  assertValue(accepted, "删除表格命令应接受");
  assertValue(!after.doc.firstChild || after.doc.firstChild.type.name !== "table", "表格应删除");
});

testCase("有文字的表格不被退格整表删除", () => {
  const doc = document(
    schema.nodes.table.create(null, [
      schema.nodes.table_header_row.create(null, [headerCell("甲"), headerCell()]),
      line3(cell2(), cell2()),
    ]),
  );
  const state = stateAt(doc, 3);
  assertValue(!atEmptyTableCellOpenHead(state), "有文字时不应命中");
});

if (fail > 0) {
  console.error(`\n${fail} 项失败`);
  process.exitCode = 1;
} else {
  console.log(`\n${pass} passed, 0 failed`);
}
