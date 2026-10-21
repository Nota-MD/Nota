/** 行内代码工具栏：空选区也要真的切换待输入标记。 */

import { Schema } from "@milkdown/kit/prose/model";
import { EditorState, TextSelection } from "@milkdown/kit/prose/state";

import { 切换行内代码 } from "../src/editor/command-table";

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

function 有(状态: EditorState, 名: string): boolean {
  return (状态.storedMarks ?? []).some((m) => m.type.name === 名);
}

console.log("\n【行内代码工具栏】");

测("空选区点击会打开下一次输入的行内代码标记", () => {
  const doc = schema.nodes.doc.create(null, schema.nodes.paragraph.create(null, schema.text("x")));
  const state = EditorState.create({
    schema,
    doc,
    selection: TextSelection.create(doc, 2),
  });
  let next = state;
  const accepted = 切换行内代码(state, (tr) => {
    next = state.apply(tr);
  });
  真(accepted, "空选区应被接受");
  真(有(next, "inlineCode"), "storedMarks 应带 inlineCode");
});

测("再点一次会关闭待输入标记", () => {
  const doc = schema.nodes.doc.create(null, schema.nodes.paragraph.create(null, schema.text("x")));
  let state = EditorState.create({
    schema,
    doc,
    selection: TextSelection.create(doc, 2),
  });
  切换行内代码(state, (tr) => {
    state = state.apply(tr);
  });
  切换行内代码(state, (tr) => {
    state = state.apply(tr);
  });
  真(!有(state, "inlineCode"), "storedMarks 不应再带 inlineCode");
});

测("有选区时给文字挂上行内代码标记", () => {
  const doc = schema.nodes.doc.create(null, schema.nodes.paragraph.create(null, schema.text("abc")));
  let state = EditorState.create({
    schema,
    doc,
    selection: TextSelection.create(doc, 1, 4),
  });
  切换行内代码(state, (tr) => {
    state = state.apply(tr);
  });
  let marked = false;
  state.doc.descendants((node) => {
    if (node.isText && node.marks.some((m) => m.type.name === "inlineCode")) marked = true;
  });
  真(marked, "选中的文字应带 inlineCode");
});

if (败 > 0) {
  console.error(`\n${败} 项失败`);
  process.exitCode = 1;
} else {
  console.log(`\n${过} passed, 0 failed`);
}
