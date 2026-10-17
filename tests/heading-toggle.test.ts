/**
 * H1/H2/H3 工具栏按钮的**开关判据**。
 *
 * 用户 2026-10-17 原话：「已经按了再按一下可以让它取消标记」。这里钉住
 * “当前块已经是同一级标题”这一半；真正的命令派发在 `editor/command-table.ts`：
 * 同层标题走 `turnIntoTextCommand`，不同层仍走 `wrapInHeadingCommand`。
 */

import { Schema } from "@milkdown/kit/prose/model";
import { EditorState, TextSelection } from "@milkdown/kit/prose/state";

import { 同层标题 } from "../src/editor/command-table";

let 过 = 0;
let 败 = 0;

function 测(名称: string, 体: () => void): void {
  try {
    体();
    过++;
    console.log(`  ✔ ${名称}`);
  } catch (e) {
    败++;
    console.log(`  ✘ ${名称}`);
    console.log(`      ${e instanceof Error ? e.message : String(e)}`);
  }
}

function 等(实际: unknown, 期望: unknown, 说明: string): void {
  if (实际 !== 期望) {
    throw new Error(`${说明}：期望 ${JSON.stringify(期望)}，实际 ${JSON.stringify(实际)}`);
  }
}

const schema = new Schema({
  nodes: {
    doc: { content: "block+" },
    paragraph: { content: "inline*", group: "block", toDOM: () => ["p", 0] },
    heading: {
      content: "inline*",
      group: "block",
      defining: true,
      attrs: { level: { default: 1 } },
      toDOM: () => ["h1", 0],
    },
    text: { group: "inline" },
  },
});

function 状态(块: "paragraph" | "heading", 级 = 1): EditorState {
  const 文 = schema.text("标题");
  const 节 =
    块 === "heading"
      ? schema.nodes.heading!.create({ level: 级 }, 文)
      : schema.nodes.paragraph!.create(null, 文);
  const doc = schema.nodes.doc!.create(null, 节);
  return EditorState.create({
    schema,
    doc,
    selection: TextSelection.create(doc, 2),
  });
}

console.log("\n【标题按钮：同层再按一次退回正文】");

测("H1 块上点 H1 ⇒ 判为同层", () => {
  等(同层标题(状态("heading", 1), 1), true, "H1");
});

测("H2 块上点 H2 ⇒ 判为同层", () => {
  等(同层标题(状态("heading", 2), 2), true, "H2");
});

测("H2 块上点 H1 ⇒ 不同层，仍改成 H1", () => {
  等(同层标题(状态("heading", 2), 1), false, "H2 → H1");
});

测("正文里点 H1 ⇒ 不同层，正常升为标题", () => {
  等(同层标题(状态("paragraph"), 1), false, "正文 → H1");
});

测("层数缺失/越界不会误判成同层", () => {
  等(同层标题(状态("heading", 7), 7), true, "当前层恰好相等仍按值比较");
  等(同层标题(状态("heading", 7), 1), false, "正常 H1 与越界层不相等");
});

console.log(`\n通过 ${过} 条，失败 ${败} 条`);
if (败 > 0) process.exitCode = 1;
