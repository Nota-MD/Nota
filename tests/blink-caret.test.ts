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

import {
  caretHeightInLine,
  caretTopInLine,
  flashSparkCursor,
  inlineMathBoundary,
  isNoShowCursor,
  usableCaretCoordinate,
} from "../src/editor/blink-caret";

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
    math_inline: { group: "inline", inline: true, content: "text*", atom: true, marks: "" },
    notaLinkSource: {
      group: "inline",
      inline: true,
      content: "text*",
      code: true,
      marks: "",
    },
    notaSyntax: { group: "inline", inline: true, atom: true, selectable: false, marks: "" },
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

testCase("标题光标跟随标题字号，正文保持原行高", () => {
  equal(caretHeightInLine("heading", 48, 18), 48, "标题光标没有跟随标题文字高度");
  equal(caretHeightInLine("paragraph", 30, 18), 30, "正文光标被错误缩短");
  equal(caretHeightInLine("heading", 12, 18), 12, "小行盒不应被继续压缩");
});

testCase("图片等超高行内原子的边界光标只画一行", () => {
  equal(caretHeightInLine("paragraph", 720, 18), 22, "图片高度被误当成光标高度");
  equal(caretTopInLine(720, 22, 180, 18), 180, "超高原子前光标没有贴着顶部");
  equal(caretTopInLine(30, 30, 180, 18), 180, "普通正文光标顶部发生偏移");
});

testCase("正文与行内标记交界时光标回退到正文侧坐标", () => {
  equal(
    usableCaretCoordinate([
      { left: 100, top: 20, bottom: 20 },
      { left: 98, top: 18, bottom: 42 },
    ])?.left,
    98,
    "零高度标记坐标没有触发向前回退",
  );
  equal(
    usableCaretCoordinate([null, { left: 10, top: 0, bottom: 18 }])?.bottom,
    18,
    "有效坐标被丢掉",
  );
  equal(usableCaretCoordinate([null, undefined]), null, "没有有效坐标时不该猜");
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

testCase("行内语法标记之间的光标仍由正文层显示", () => {
  const marker = schema.nodes.notaSyntax.create();
  const state = makeEditorState(
    document(schema.nodes.paragraph.create(null, [schema.text("Typora"), marker, marker])),
    8,
  );
  equal(isNoShowCursor(state), true, "`Typora|**` 边界仍把光标藏掉");
});

testCase("链接源码节点仍由正文层显示光标", () => {
  const source = schema.nodes.notaLinkSource.create(
    null,
    schema.text("[github](https://github.com)"),
  );
  const state = makeEditorState(
    document(schema.nodes.paragraph.create(null, [source])),
    3,
  );
  equal(isNoShowCursor(state), true, "链接源码节点把正文光标藏掉了");
});

testCase("公式边界光标使用公式节点坐标，而不是主题行盒坐标", () => {
  const formula = schema.nodes.math_inline.create(null, schema.text("LaTeX"));
  const paragraph2 = schema.nodes.paragraph.create(
    null,
    [schema.text("ABC"), formula],
  );
  const doc = document(paragraph2);
  const after3 = 1 + paragraph2.content.size;
  const after = EditorState.create({
    doc,
    selection: TextSelection.create(doc, after3),
  });
  equal(
    JSON.stringify(inlineMathBoundary(after)),
    JSON.stringify({ position: after3 - formula.nodeSize, side: "after" }),
    "闭 `$` 右侧没有识别公式边界",
  );
  const before3 = after3 - formula.nodeSize;
  const before = EditorState.create({
    doc,
    selection: TextSelection.create(doc, before3),
  });
  equal(
    JSON.stringify(inlineMathBoundary(before)),
    JSON.stringify({ position: before3, side: "before" }),
    "开 `$` 左侧没有识别公式边界",
  );
});

testCase("插件使用 view 覆盖层，不注册 ProseMirror 装饰", () => {
  const plugin = flashSparkCursor();
  assertValue(typeof plugin.spec.view === "function", "插件没有 view");
  equal(plugin.spec.props?.decorations, undefined, "不能再注册会阻断输入的装饰");
});

console.log("\n【光标样式】");

const css = readFileSync(`${process.cwd()}/src/styles/editor.css`, "utf8");
const assemble = readFileSync(`${process.cwd()}/src/editor/assemble.ts`, "utf8");
const blinkSource = readFileSync(`${process.cwd()}/src/editor/blink-caret.ts`, "utf8");

testCase("原生光标隐藏，装饰光标随主题强调色闪烁", () => {
  assertValue(css.includes("caret-color: transparent"), "原生光标没有隐藏");
  assertValue(css.includes("background: var(--accent)"), "光标没有跟随主题强调色");
  assertValue(css.includes(".nota-blink-caret-dim"), "缺少低功耗闪烁状态");
  assertValue(blinkSource.includes("setInterval"), "缺少低频闪烁定时器");
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

testCase("IME 组合态交还原生光标并暂停覆盖层闪烁", () => {
  assertValue(
    blinkSource.includes('const imeComposingClass = "nota-ime-composing"'),
    "缺少 IME 组合态标记",
  );
  assertValue(
    blinkSource.includes('addEventListener("compositionstart", beginComposition)'),
    "compositionstart 没有交还原生光标",
  );
  assertValue(
    blinkSource.includes('addEventListener("compositionupdate", beginComposition)'),
    "compositionupdate 没有保持 IME 光标状态",
  );
  assertValue(
    blinkSource.includes('addEventListener("compositionend", endComposition)'),
    "compositionend 没有恢复覆盖层光标",
  );
  assertValue(
    blinkSource.includes("view.dom.classList.contains(imeComposingClass)"),
    "组合态后续刷新仍可能把覆盖层光标画回来",
  );
  assertValue(
    blinkSource.includes("view.composing && attempts < 5"),
    "compositionend 没有等待 ProseMirror 收回最终上屏文本",
  );
  assertValue(
    css.includes(".ProseMirror.nota-ime-composing *") &&
      css.includes("caret-color: var(--accent) !important"),
    "IME 组合态没有恢复可移动的原生光标",
  );
});

testCase("内部输入框自己画光标时隐藏正文覆盖层", () => {
  assertValue(
    blinkSource.includes("export function innerEditorOwnsCaret"),
    "没有识别内部编辑器的焦点",
  );
  assertValue(
    blinkSource.includes(
      'active.matches("input, textarea, .cm-content, .nota-keyboard-link-source")',
    ),
    "输入框与 CodeMirror 不在内部光标判据里",
  );
  assertValue(
    blinkSource.includes("innerEditorOwnsCaret(active, view.dom)"),
    "绘制正文光标前没有检查内部编辑器焦点",
  );
  assertValue(
    blinkSource.includes("nota-inline-math-input-focused"),
    "公式源码框聚焦时没有显式隐藏正文覆盖光标",
  );
});

testCase("减少动态效果时保持静态可见", () => {
  const reduced = css.slice(css.indexOf("@media (prefers-reduced-motion: reduce)"));
  assertValue(reduced.includes("opacity: 1"), "未保持光标常亮");
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
