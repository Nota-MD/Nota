/**
 * 块容器开场键的应用测试：
 * - 引用最开头按空格或退格拆掉全部引用层；
 * - 空表格开头按退格删除整张表。
 */

import { Schema } from "@milkdown/kit/prose/model";
import type { Node as PMNode } from "@milkdown/kit/prose/model";
import { EditorState, TextSelection } from "@milkdown/kit/prose/state";
import { addListNodes } from "@milkdown/kit/prose/schema-list";
import { tableNodes } from "@milkdown/kit/prose/tables";
import { readFileSync } from "node:fs";

import {
  getClearAllReferenceUse,
  atReferenceUseMostOpenHead,
  atEmptyTableCellOpenHead,
  deleteEmptyTable,
  exitEmptyListItem,
} from "../src/editor/block-keys";
import { VIM_ALLOW_STRUCTURE_META } from "../src/editor/plugin-vim-ops";

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

const listSchema = new Schema({
  nodes: addListNodes(schema.spec.nodes, "paragraph block*", "block"),
  marks: {},
});

function emptyListItemDocument(): PMNode {
  const item = (text: string) =>
    listSchema.nodes.list_item.create(null, listSchema.nodes.paragraph.create(null, text ? listSchema.text(text) : null));
  return listSchema.nodes.doc.create(
    null,
    listSchema.nodes.bullet_list.create(null, [item("第一项"), item("")]),
  );
}

function firstEmptyParagraphPosition(doc: PMNode): number {
  let found = -1;
  doc.descendants((node, pos) => {
    if (found >= 0) return false;
    if (node.type.name === "paragraph" && node.content.size === 0) found = pos + 1;
    return found < 0;
  });
  return found;
}

function stateAt(doc: PMNode, pos: number): EditorState {
  return EditorState.create({
    schema,
    doc,
    selection: TextSelection.near(doc.resolve(pos)),
  });
}

function transactionShouldUseTo(state: EditorState, command: typeof getClearAllReferenceUse): EditorState {
  let current = state;
  let structurallyAllowed = false;
  const accepted = command(state, (tr) => {
    structurallyAllowed = tr.getMeta(VIM_ALLOW_STRUCTURE_META) === true;
    current = current.apply(tr);
  });
  assertValue(accepted, "命令应当接受这一下");
  assertValue(structurallyAllowed, "结构事务必须带 Vim 普通模式放行标记");
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

testCase("引用最开头按退格同样拆掉全部引用层", () => {
  const doc = document(referenceUse(referenceUse(paragraph2("正文"))));
  const state = stateAt(doc, 3);
  const after = transactionShouldUseTo(state, getClearAllReferenceUse);
  assertValue(!hasReferenceUseNode(after.doc), "退格命令应拆掉引用层");
  assertValue(after.doc.textContent === "正文", "正文应原样保留");
  const keys = readFileSync("src/editor/block-keys.ts", "utf8");
  assertValue(
    keys.includes("if (atReferenceUseMostOpenHead(view.state))") &&
      keys.includes("getClearAllReferenceUse(view.state"),
    "Backspace 分支没有接到取消引用命令",
  );
  const assembly = readFileSync("src/editor/assemble.ts", "utf8");
  const blockKeys = assembly.indexOf("[blockContainerKeypress]");
  const vimInput = assembly.indexOf("vimInputPlugin(parameter.vimInput.config");
  assertValue(
    blockKeys >= 0 && vimInput >= 0 && blockKeys < vimInput,
    "块键插件必须排在 Vim 输入适配器之前，否则 Backspace 会被 Vim 吃掉",
  );
  assertValue(
    readFileSync("src/editor/plugin-vim-input.ts", "utf8").includes(
      "atReferenceUseMostOpenHead(view.state)",
    ),
    "Vim 适配器没有在引用框开头让出 Backspace",
  );
  assertValue(
    readFileSync("src/editor/plugin-vim-input.ts", "utf8").includes(
      "tr.getMeta(VIM_ALLOW_STRUCTURE_META)",
    ),
    "Vim 事务过滤器没有放行块结构编辑",
  );
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

testCase("Backspace on a later empty quote line exits every quote layer", () => {
  const doc = document(referenceUse(paragraph2("前文"), paragraph2()));
  const pos = firstEmptyParagraphPosition(doc);
  const state = stateAt(doc, pos);
  assertValue(atReferenceUseMostOpenHead(state), "empty line should be an exit point");
  const after = transactionShouldUseTo(state, getClearAllReferenceUse);
  assertValue(after.doc.childCount === 2, "empty line should become a paragraph outside the quote");
  assertValue(after.doc.child(0).type.name === "blockquote", "existing quote content should remain");
  assertValue(after.doc.child(0).textContent === "前文", "existing quote text should remain");
  assertValue(after.doc.child(1).type.name === "paragraph", "caret should land outside the quote");
});

testCase("Backspace on an empty-only quote removes the quote", () => {
  const doc = document(referenceUse(paragraph2()));
  const pos = firstEmptyParagraphPosition(doc);
  const after = transactionShouldUseTo(stateAt(doc, pos), getClearAllReferenceUse);
  assertValue(!hasReferenceUseNode(after.doc), "empty quote should disappear");
  assertValue(after.doc.firstChild?.type.name === "paragraph", "a paragraph should remain");
});

testCase("Enter on an empty list item leaves the list", () => {
  const doc = emptyListItemDocument();
  const pos = firstEmptyParagraphPosition(doc);
  const state = EditorState.create({
    schema: listSchema,
    doc,
    selection: TextSelection.near(doc.resolve(pos)),
  });
  let after = state;
  const accepted = exitEmptyListItem(state, (tr) => {
    after = state.apply(tr);
  });
  assertValue(accepted, "empty list item should accept Enter");
  let listCount = 0;
  after.doc.descendants((node) => {
    if (node.type.name === "bullet_list") listCount++;
  });
  assertValue(listCount === 0 || after.doc.childCount > 1, "empty item should leave its list level");
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
