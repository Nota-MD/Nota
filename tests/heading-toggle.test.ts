/**
 * H1/H2/H3 工具栏按钮的**开关判据**。
 *
 * 用户 2026-10-17 原话：「已经按了再按一下可以让它取消标记」。这里钉住
 * “当前块已经是同一级标题”这一半；真正的命令派发在 `editor/command-table.ts`：
 * 同层标题走 `turnIntoTextCommand`，不同层仍走 `wrapInHeadingCommand`。
 */

import { Schema } from "@milkdown/kit/prose/model";
import { EditorState, TextSelection } from "@milkdown/kit/prose/state";

import { sameLayerMarkTitle } from "../src/editor/command-table";

let pass = 0;
let fail = 0;

function testCase(name: string, body3: () => void): void {
  try {
    body3();
    pass++;
    console.log(`  ✔ ${name}`);
  } catch (e) {
    fail++;
    console.log(`  ✘ ${name}`);
    console.log(`      ${e instanceof Error ? e.message : String(e)}`);
  }
}

function equal(actual: unknown, expected: unknown, description: string): void {
  if (actual !== expected) {
    throw new Error(`${description}：期望 ${JSON.stringify(expected)}，实际 ${JSON.stringify(actual)}`);
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

function state(block: "paragraph" | "heading", level2 = 1): EditorState {
  const text4 = schema.text("标题");
  const section =
    block === "heading"
      ? schema.nodes.heading!.create({ level: level2 }, text4)
      : schema.nodes.paragraph!.create(null, text4);
  const doc = schema.nodes.doc!.create(null, section);
  return EditorState.create({
    schema,
    doc,
    selection: TextSelection.create(doc, 2),
  });
}

console.log("\n【标题按钮：同层再按一次退回正文】");

testCase("H1 块上点 H1 ⇒ 判为同层", () => {
  equal(sameLayerMarkTitle(state("heading", 1), 1), true, "H1");
});

testCase("H2 块上点 H2 ⇒ 判为同层", () => {
  equal(sameLayerMarkTitle(state("heading", 2), 2), true, "H2");
});

testCase("H2 块上点 H1 ⇒ 不同层，仍改成 H1", () => {
  equal(sameLayerMarkTitle(state("heading", 2), 1), false, "H2 → H1");
});

testCase("正文里点 H1 ⇒ 不同层，正常升为标题", () => {
  equal(sameLayerMarkTitle(state("paragraph"), 1), false, "正文 → H1");
});

testCase("层数缺失/越界不会误判成同层", () => {
  equal(sameLayerMarkTitle(state("heading", 7), 7), true, "当前层恰好相等仍按值比较");
  equal(sameLayerMarkTitle(state("heading", 7), 1), false, "正常 H1 与越界层不相等");
});

console.log(`\n通过 ${pass} 条，失败 ${fail} 条`);
if (fail > 0) process.exitCode = 1;
