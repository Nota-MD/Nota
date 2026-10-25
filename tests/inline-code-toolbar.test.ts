/** 行内代码工具栏：空选区也要真的切换待输入标记。 */

import { Schema } from "@milkdown/kit/prose/model";
import { EditorState, TextSelection } from "@milkdown/kit/prose/state";

import { splitReplaceInlineCode } from "../src/editor/command-table";

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

const schema = new Schema({
  nodes: {
    doc: { content: "block+" },
    paragraph: { group: "block", content: "inline*" },
    text: { group: "inline" },
  },
  marks: {
    strong: {},
    inlineCode: { code: true, excludes: "_" },
  },
});

function has(state: EditorState, name3: string): boolean {
  return (state.storedMarks ?? []).some((m) => m.type.name === name3);
}

console.log("\n【行内代码工具栏】");

testCase("空选区点击会打开下一次输入的行内代码标记", () => {
  const doc = schema.nodes.doc.create(null, schema.nodes.paragraph.create(null, schema.text("x")));
  const state = EditorState.create({
    schema,
    doc,
    selection: TextSelection.create(doc, 2),
  });
  let next = state;
  const accepted = splitReplaceInlineCode(state, (tr) => {
    next = state.apply(tr);
  });
  assertValue(accepted, "空选区应被接受");
  assertValue(has(next, "inlineCode"), "storedMarks 应带 inlineCode");
});

testCase("再点一次会关闭待输入标记", () => {
  const doc = schema.nodes.doc.create(null, schema.nodes.paragraph.create(null, schema.text("x")));
  let state = EditorState.create({
    schema,
    doc,
    selection: TextSelection.create(doc, 2),
  });
  splitReplaceInlineCode(state, (tr) => {
    state = state.apply(tr);
  });
  splitReplaceInlineCode(state, (tr) => {
    state = state.apply(tr);
  });
  assertValue(!has(state, "inlineCode"), "storedMarks 不应再带 inlineCode");
});

testCase("有选区时给文字挂上行内代码标记", () => {
  const doc = schema.nodes.doc.create(null, schema.nodes.paragraph.create(null, schema.text("abc")));
  let state = EditorState.create({
    schema,
    doc,
    selection: TextSelection.create(doc, 1, 4),
  });
  splitReplaceInlineCode(state, (tr) => {
    state = state.apply(tr);
  });
  let marked = false;
  state.doc.descendants((node) => {
    if (node.isText && node.marks.some((m) => m.type.name === "inlineCode")) marked = true;
  });
  assertValue(marked, "选中的文字应带 inlineCode");
});

if (fail > 0) {
  console.error(`\n${fail} 项失败`);
  process.exitCode = 1;
} else {
  console.log(`\n${pass} passed, 0 failed`);
}
