/**
 * 正文插入光标的覆盖层与闪烁样式。
 *
 * 这里用真实的 ProseMirror schema 与 EditorState 验证哪些选区应显示光标，
 * 并核对实现没有重新使用会阻断 WebKitGTK 输入的 Widget 装饰。
 */

import { Schema } from "@milkdown/kit/prose/model";
import type { Node as PMNode } from "@milkdown/kit/prose/model";
import { EditorState, TextSelection } from "@milkdown/kit/prose/state";
import { readFileSync } from "node:fs";

import { isNoShowCursor, flashSparkCursor } from "../src/editor/blink-caret";

let pass = 0;
let fail = 0;

function testCase(name: string, body: () => void): void {
  try {
    body();
    pass += 1;
    console.log(`  ✔ ${name}`);
  } catch (error) {
    fail += 1;
    console.log(`  ✘ ${name}`);
    console.log(`      ${error instanceof Error ? error.message : String(error)}`);
  }
}

function assertValue(value: unknown, message: string): asserts value {
  if (!value) throw new Error(message);
}

function equal(actual: unknown, expected: unknown, message: string): void {
  if (actual !== expected) {
    throw new Error(`${message}：期望 ${String(expected)}，实际 ${String(actual)}`);
  }
}

const schema = new Schema({
  nodes: {
    doc: { content: "block+" },
    paragraph: { group: "block", content: "inline*" },
    heading: { group: "block", content: "inline*", attrs: { level: { default: 1 } } },
    code_block: { group: "block", content: "text*", code: true, marks: "" },
    math_block: { group: "block", content: "text*", atom: true, marks: "" },
    text: { group: "inline" },
  },
});

function document(...blocks: PMNode[]): PMNode {
  return schema.nodes.doc.create(null, blocks);
}

function paragraph2(text3: string): PMNode {
  return schema.nodes.paragraph.create(null, text3 ? schema.text(text3) : null);
}

function makeEditorState(doc: PMNode, selection = 1): EditorState {
  return EditorState.create({
    schema,
    doc,
    selection: TextSelection.create(doc, selection),
    plugins: [flashSparkCursor()],
  });
}

console.log("\n【正文闪烁光标】");

testCase("普通段落里的空选区产生一颗光标", () => {
  const editorState = makeEditorState(document(paragraph2("正文")));
  equal(isNoShowCursor(editorState), true, "普通段落应该显示光标");
});

testCase("标题里的空选区同样产生光标", () => {
  const heading = schema.nodes.heading.create({ level: 1 }, schema.text("标题"));
  const editorState = makeEditorState(document(heading), 2);
  equal(isNoShowCursor(editorState), true, "标题应该显示光标");
});

testCase("选中文字时不额外画一条光标", () => {
  const doc = document(paragraph2("选中我"));
  const editorState = makeEditorState(doc);
  const selected = editorState.apply(
    editorState.tr.setSelection(TextSelection.create(doc, 1, 4)),
  );
  equal(isNoShowCursor(selected), false, "选中文字时不显示折叠光标");
});

testCase("代码块与公式块交给内部编辑器画光标", () => {
  const code = makeEditorState(document(schema.nodes.code_block.create(null, schema.text("x"))));
  const math = makeEditorState(document(schema.nodes.math_block.create(null, schema.text("x"))));
  equal(isNoShowCursor(code), false, "代码块不应显示正文光标");
  equal(isNoShowCursor(math), false, "公式块不应显示正文光标");
});

testCase("插件使用 view 覆盖层，不注册 ProseMirror 装饰", () => {
  const plugin = flashSparkCursor();
  assertValue(typeof plugin.spec.view === "function", "插件没有 view");
  equal(plugin.spec.props?.decorations, undefined, "不能再注册会阻断输入的装饰");
});

console.log("\n【光标样式】");

const css = readFileSync(`${process.cwd()}/src/styles/editor.css`, "utf8");
const assemble = readFileSync(`${process.cwd()}/src/editor/assemble.ts`, "utf8");

testCase("原生光标隐藏，装饰光标随主题强调色闪烁", () => {
  assertValue(css.includes("caret-color: transparent"), "原生光标没有隐藏");
  assertValue(css.includes("background: var(--accent)"), "光标没有跟随主题强调色");
  assertValue(css.includes("animation: nota-caret-blink 1.06s"), "缺少闪烁动画");
  assertValue(css.includes("@keyframes nota-caret-blink"), "缺少动画关键帧");
});

testCase("覆盖层不进入正文 DOM，并由焦点和选区控制", () => {
  const source = readFileSync(`${process.cwd()}/src/editor/blink-caret.ts`, "utf8");
  assertValue(css.includes("position: fixed"), "覆盖层没有固定定位");
  assertValue(css.includes("display: none"), "覆盖层没有默认隐藏");
  assertValue(source.includes("view.hasFocus()"), "没有检查编辑区焦点");
  assertValue(source.includes("view.dom.parentElement"), "覆盖层没有挂到正文 DOM 之外");
  assertValue(!source.includes("Decoration.widget("), "仍在使用 ProseMirror 装饰");
  assertValue(!source.includes("decorations("), "仍注册了 ProseMirror 装饰");
});

testCase("减少动态效果时保持静态可见", () => {
  const reduced = css.slice(css.indexOf("@media (prefers-reduced-motion: reduce)"));
  assertValue(reduced.includes("animation: none"), "未关闭动画");
  assertValue(reduced.includes("opacity: 1"), "静态光标不可见");
});

testCase("可编辑实例才挂闪烁光标插件", () => {
  assertValue(
    assemble.includes(".use(readOnly ? [] : [$prose(() => flashSparkCursor())])"),
    "插件未接入",
  );
});

console.log(`\n通过 ${pass} 条，失败 ${fail} 条`);
if (fail > 0) process.exitCode = 1;
