/** 行内代码工具栏：空选区也要真的切换待输入标记。 */

import { Schema } from "@milkdown/kit/prose/model";
import { EditorState, NodeSelection, TextSelection } from "@milkdown/kit/prose/state";

import { splitReplaceInlineCode, toggleMarkAtSelection } from "../src/editor/command-table";

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

function equal(actual: unknown, expected: unknown, description: string): void {
  if (actual !== expected) {
    throw new Error(`${description}：期望 ${String(expected)}，实际 ${String(actual)}`);
  }
}

const schema = new Schema({
  nodes: {
    doc: { content: "block+" },
    paragraph: { group: "block", content: "inline*" },
    text: { group: "inline" },
    atom: { inline: true, group: "inline", atom: true },
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

testCase("空选区点击粗体会打开下一次输入的 strong 标记", () => {
  const doc = schema.nodes.doc.create(null, schema.nodes.paragraph.create(null, schema.text("x")));
  let state = EditorState.create({
    schema,
    doc,
    selection: TextSelection.create(doc, 2),
  });
  assertValue(
    toggleMarkAtSelection(state, "strong", (tr) => {
      state = state.apply(tr);
    }),
    "空选区应接受粗体命令",
  );
  assertValue(has(state, "strong"), "storedMarks 应带 strong");
});

testCase("再次点击粗体会关闭待输入标记", () => {
  const doc = schema.nodes.doc.create(null, schema.nodes.paragraph.create(null, schema.text("x")));
  let state = EditorState.create({
    schema,
    doc,
    selection: TextSelection.create(doc, 2),
  });
  toggleMarkAtSelection(state, "strong", (tr) => {
    state = state.apply(tr);
  });
  toggleMarkAtSelection(state, "strong", (tr) => {
    state = state.apply(tr);
  });
  assertValue(!has(state, "strong"), "storedMarks 不应再带 strong");
});

testCase("原子节点被整块选中时，粗体会落到旁边下一次输入", () => {
  const doc = schema.nodes.doc.create(
    null,
    schema.nodes.paragraph.create(null, [schema.nodes.atom.create(), schema.text("x")]),
  );
  let state = EditorState.create({
    schema,
    doc,
    selection: NodeSelection.create(doc, 1),
  });
  assertValue(
    toggleMarkAtSelection(state, "strong", (tr) => {
      state = state.apply(tr);
    }),
    "原子选区也应接受粗体命令",
  );
  assertValue(state.selection instanceof TextSelection, "选区应改成可输入的文本光标");
  assertValue(has(state, "strong"), "storedMarks 应带 strong");
});

testCase("跨段粗体只改文字标记，不增加空块", () => {
  const doc = schema.nodes.doc.create(null, [
    schema.nodes.paragraph.create(null, schema.text("Version 0.0")),
    schema.nodes.paragraph.create(null, schema.text("Nota 是自由软件。")),
    schema.nodes.paragraph.create(null, schema.text("这是用户须知。")),
  ]);
  const beforeBlocks = doc.childCount;
  let state = EditorState.create({
    schema,
    doc,
    selection: TextSelection.create(doc, 1, doc.content.size - 1),
  });
  assertValue(
    toggleMarkAtSelection(state, "strong", (tr) => {
      state = state.apply(tr);
    }),
    "跨段选区应接受粗体",
  );
  equal(state.doc.childCount, beforeBlocks, "粗体命令改变了块数量");
  const paragraphs: Array<{ text: string; strong: boolean }> = [];
  state.doc.forEach((node) => {
    paragraphs.push({
      text: node.textContent,
      strong:
        node.firstChild?.marks.some((mark) => mark.type.name === "strong") ??
        false,
    });
  });
  equal(JSON.stringify(paragraphs), JSON.stringify([
    { text: "Version 0.0", strong: true },
    { text: "Nota 是自由软件。", strong: true },
    { text: "这是用户须知。", strong: true },
  ]), "跨段粗体没有覆盖每一段");
});

if (fail > 0) {
  console.error(`\n${fail} 项失败`);
  process.exitCode = 1;
} else {
  console.log(`\n${pass} passed, 0 failed`);
}
