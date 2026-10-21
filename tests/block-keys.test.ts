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
  取消全部引用,
  在引用最开头,
  在空表格开头,
  删除空表格,
} from "../src/editor/block-keys";

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

const 表格规格 = tableNodes({
  tableGroup: "block",
  cellContent: "paragraph",
  cellAttributes: { alignment: { default: "left" } },
});
const 表头行规格 = { ...表格规格.table_row, content: "(table_header)*" };
const schema = new Schema({
  nodes: {
    doc: { content: "block+" },
    paragraph: { group: "block", content: "inline*" },
    blockquote: { group: "block", content: "block+", defining: true },
    text: { group: "inline" },
    table: { ...表格规格.table, content: "table_header_row table_row+" },
    table_row: { ...表格规格.table_row, content: "(table_cell)*" },
    table_header_row: 表头行规格,
    table_cell: 表格规格.table_cell,
    table_header: 表格规格.table_header,
  } as never,
  marks: {},
});

const 段 = (text = ""): PMNode =>
  schema.nodes.paragraph.create(null, text ? schema.text(text) : null);
const 引用 = (...blocks: PMNode[]): PMNode => schema.nodes.blockquote.create(null, blocks);
const 表头格 = (text = ""): PMNode =>
  schema.nodes.table_header.create(null, 段(text));
const 格 = (text = ""): PMNode => schema.nodes.table_cell.create(null, 段(text));
const 行 = (...cells: PMNode[]): PMNode => schema.nodes.table_row.create(null, cells);
const 表 = (): PMNode =>
  schema.nodes.table.create(null, [
    schema.nodes.table_header_row.create(null, [表头格(), 表头格()]),
    行(格(), 格()),
  ]);
const 文档 = (...blocks: PMNode[]): PMNode => schema.nodes.doc.create(null, blocks);

function 状态At(doc: PMNode, pos: number): EditorState {
  return EditorState.create({
    schema,
    doc,
    selection: TextSelection.near(doc.resolve(pos)),
  });
}

function 事务应用到(state: EditorState, 命令: typeof 取消全部引用): EditorState {
  let current = state;
  const accepted = 命令(state, (tr) => {
    current = current.apply(tr);
  });
  真(accepted, "命令应当接受这一下");
  return current;
}

function 有引用节点(node: PMNode): boolean {
  let found = false;
  node.descendants((child) => {
    if (child.type.name === "blockquote") found = true;
  });
  return found;
}

console.log("\n【块容器开场键】");

测("嵌套引用最开头可一次退出全部引用", () => {
  const doc = 文档(引用(引用(段("正文"))));
  const state = 状态At(doc, 3);
  真(在引用最开头(state), "应识别为引用最开头");
  const after = 事务应用到(state, 取消全部引用);
  真(!有引用节点(after.doc), "引用层应全部消失");
  真(after.doc.textContent === "正文", "正文应原样保留");
});

测("引用中间或非开头不消费空格", () => {
  const doc = 文档(引用(段("前文")));
  const state = EditorState.create({
    schema,
    doc,
    selection: TextSelection.create(doc, 4),
  });
  真(!在引用最开头(state), "非绝对开头不应命中");
  真(!取消全部引用(state, () => {}), "命令应放行");
});

测("空表格开头退格删除整张表", () => {
  const doc = 文档(表());
  const state = 状态At(doc, 3);
  真(在空表格开头(state), "应识别为空表格开头");
  let after = state;
  const accepted = 删除空表格(state, (tr) => {
    after = state.apply(tr);
  });
  真(accepted, "删除表格命令应接受");
  真(!after.doc.firstChild || after.doc.firstChild.type.name !== "table", "表格应删除");
});

测("有文字的表格不被退格整表删除", () => {
  const doc = 文档(
    schema.nodes.table.create(null, [
      schema.nodes.table_header_row.create(null, [表头格("甲"), 表头格()]),
      行(格(), 格()),
    ]),
  );
  const state = 状态At(doc, 3);
  真(!在空表格开头(state), "有文字时不应命中");
});

if (败 > 0) {
  console.error(`\n${败} 项失败`);
  process.exitCode = 1;
} else {
  console.log(`\n${过} passed, 0 failed`);
}
