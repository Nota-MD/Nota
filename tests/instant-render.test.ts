/**
 * `editor/instant-render.ts::块标记` 的可运行测试集。
 *
 * 2026-10-25 起标题回车成块后不再在左侧显示 `H1`…`H6` 徽标：Typora 在那里
 * 只显示标题本身。其余块级标记继续回显。
 */

import { Schema } from "@milkdown/kit/prose/model";

import { blockMark } from "../src/editor/instant-render";

let pass = 0;
let fail = 0;
const failure: string[] = [];

function testCase(name: string, body3: () => void): void {
  try {
    body3();
    pass++;
    console.log(`  ✔ ${name}`);
  } catch (e) {
    fail++;
    failure.push(name);
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
    paragraph: { group: "block", content: "inline*" },
    heading: { group: "block", content: "inline*", attrs: { level: {} } },
    blockquote: { group: "block", content: "block+" },
    bullet_list: { group: "block", content: "list_item+" },
    ordered_list: {
      group: "block",
      content: "list_item+",
      attrs: { order: { default: 1 } },
    },
    list_item: { content: "paragraph block*", attrs: { checked: { default: null } } },
    code_block: { group: "block", content: "text*", marks: "" },
    text: { group: "inline" },
  },
});

function block(name3: string, attrs: Record<string, unknown> = {}) {
  return schema.nodes[name3]!.create(attrs as never);
}

console.log("\n【块级标记】");

testCase("标题块不再显示 H1–H6 徽标", () => {
  for (let level = 1; level <= 6; level++) {
    equal(blockMark(block("heading", { level }), null, 0), null, `H${level}`);
  }
});

testCase("引用、无序列表、有序列表和代码块仍回显各自标记", () => {
  equal(blockMark(block("blockquote"), null, 0), ">", "引用");
  equal(blockMark(block("list_item"), block("bullet_list"), 0), "-", "无序列表");
  equal(blockMark(block("list_item"), block("ordered_list", { order: 3 }), 2), "5.", "有序列表从 3 起、第三项");
  equal(blockMark(block("code_block"), null, 0), "```", "代码围栏");
});

testCase("任务项不额外叠短横，普通段落不显示标记", () => {
  equal(blockMark(block("list_item", { checked: false }), block("bullet_list"), 0), null, "任务项");
  equal(blockMark(block("paragraph"), null, 0), null, "段落");
});

console.log(`\n${"─".repeat(64)}`);
console.log(`通过 ${pass} 条，失败 ${fail} 条`);
if (fail) {
  console.log(`失败的：\n  - ${failure.join("\n  - ")}`);
  process.exitCode = 1;
}
