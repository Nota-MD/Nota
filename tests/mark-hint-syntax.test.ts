import { Schema } from "@milkdown/kit/prose/model";
import type { MarkType } from "@milkdown/kit/prose/model";
import { EditorState, TextSelection } from "@milkdown/kit/prose/state";
import { readFileSync } from "node:fs";

import {
  findActiveMarkRange,
  noticeClass,
  noticeTable,
  normalizeInlineBlock,
  serializeInlineBlock,
} from "../src/editor/mark-hint-source";
import {
  deleteInlineDelimiter,
  inputInlineDelimiter,
  listSyntaxMarkers,
  moveInlineCaret,
} from "../src/editor/mark-hint";
import { plainSyntaxRanges, syntaxTextClass } from "../src/editor/plain-syntax";

let passed = 0;
let failed = 0;

function testCase(name: string, body: () => void): void {
  try {
    body();
    passed++;
    console.log(`  ✔ ${name}`);
  } catch (error) {
    failed++;
    console.log(`  ✘ ${name}`);
    console.log(`      ${error instanceof Error ? error.message : String(error)}`);
  }
}

function assertion(value: unknown, message: string): asserts value {
  if (!value) throw new Error(message);
}

function equal(actual: unknown, expected: unknown, message: string): void {
  if (actual !== expected) throw new Error(`${message}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
}

function read(path: string): string {
  return readFileSync(path, "utf8");
}

const schema = new Schema({
  nodes: {
    text: { group: "inline" },
    paragraph: { group: "block", content: "inline*" },
    notaSyntax: {
      inline: true,
      group: "inline",
      atom: true,
      marks: "",
      attrs: {
        syntax: { default: "" },
        side: { default: "left" },
        symbol: { default: "*" },
      },
    },
    doc: { content: "block+" },
  },
  marks: {
    strong: {},
    emphasis: {},
    inlineCode: {},
    strike_through: {},
    highlight: {},
    superscript: {},
    subscript: {},
    underline: {},
    kbd: {},
  },
});

const strong = schema.marks.strong as MarkType;
const syntax = schema.nodes.notaSyntax!;

function stateWithStrong(text: string, caret = 1): EditorState {
  const doc = schema.node("doc", null, [
    schema.node("paragraph", null, [schema.text(text, [strong.create()])]),
  ]);
  return EditorState.create({
    schema,
    doc,
    selection: TextSelection.create(doc, caret),
  });
}

console.log("\n【行内标记：Typora 式语义层】");

testCase("所有 Markdown 行内格式共享一张稳定的定界符表", () => {
  const symbols = noticeTable.map((item) => `${item.name3}:${item.left}:${item.right}`);
  for (const expected of [
    "strong:**:**",
    "emphasis:*:*",
    "inlineCode:`:`",
    "strike_through:~~:~~",
  ]) {
    assertion(symbols.includes(expected), `missing ${expected}`);
  }
});

testCase("未完成标点保持普通文本，不变成文档节点", () => {
  equal(JSON.stringify(plainSyntaxRanges("**1")), JSON.stringify([{ from: 0, to2: 2 }]), "bold opener");
  equal(
    JSON.stringify(plainSyntaxRanges("x==1==")),
    JSON.stringify([{ from: 1, to2: 3 }, { from: 4, to2: 6 }]),
    "highlight delimiters",
  );
  equal(syntaxTextClass, "nota-syntax-text", "punctuation class");
});

testCase("反斜杠转义不参与后续语法配对", () => {
  equal(JSON.stringify(plainSyntaxRanges("\\*")), JSON.stringify([]), "escaped star");
  equal(
    JSON.stringify(plainSyntaxRanges("\\\\*")),
    JSON.stringify([{ from: 2, to2: 3 }]),
    "literal backslash before star",
  );
});

testCase("活动粗体只由正文 mark 判定，不依赖星号节点", () => {
  const state = stateWithStrong("first", 2);
  const active = findActiveMarkRange(state.doc, state.selection.from, strong, syntax);
  assertion(active, "strong range was not found");
  equal(active.from, 1, "content start");
  equal(active.to2, 6, "content end");
  equal(active.leftMarker, null, "delimiter must not exist in document");
  equal(active.rightMarker, null, "delimiter must not exist in document");
});

testCase("活动标记生成左右两组字符级可见定界符", () => {
  const doc = schema.node("doc", null, [
    schema.node("paragraph", null, [schema.text("**first**")]),
  ]);
  const state = EditorState.create({
    schema,
    doc,
    selection: TextSelection.create(doc, 2),
  });
  const tr = normalizeInlineBlock(state, syntax);
  assertion(tr, "complete bold source was not normalized");
  const next = state.apply(tr);
  const markers = listSyntaxMarkers(next.doc, syntax);
  equal(markers.length, 2, "expected one opening and one closing marker group");
  equal(markers[0]?.text4, "**", "opening marker is not two editable positions");
  equal(markers[1]?.text4, "**", "closing marker is not two editable positions");
});

testCase("视觉定界符是可选不可编辑的字符级 meta 层", () => {
  const source = read("src/editor/mark-hint-source.ts");
  assertion(
    source.includes("class: `${noticeClass} nota-syntax-hidden`"),
    "marker class missing",
  );
  assertion(source.includes("inline: true"), "marker is not inline");
  assertion(source.includes("atom: true"), "marker lacks a character-sized atom boundary");
  assertion(source.includes("selectable: false"), "marker incorrectly becomes a whole-node selection");
  assertion(source.includes("tr.insert(item.position2, Fragment.fromArray(nodes))"), "character markers are not inserted");
});

testCase("标记 CSS 不产生独立行盒或上下跳动", () => {
  const css = read("src/styles/marks.css");
  const block = /\.nota-syntax-marker\s*\{([\s\S]*?)\}/.exec(css)?.[1] ?? "";
  assertion(block.includes("display: contents !important;"), "marker creates a separate line box");
  assertion(block.includes("line-height: inherit !important;"), "marker line-height differs");
  assertion(block.includes("vertical-align: baseline !important;"), "marker baseline differs");
  assertion(block.includes("font: inherit !important;"), "marker font metrics differ");
  assertion(block.includes("font-size: 1.08em !important;"), "marker glyph is too small");
  assertion(block.includes(`.${noticeClass}`) || css.includes(`.${noticeClass}`), "notice class missing");
});

testCase("编辑器在 stock 行内输入规则之前接收定界符", () => {
  const assemble = read("src/editor/assemble.ts");
  const literal = assemble.indexOf(
    ".use(readOnly ? [] : [literalInlineInput(autoPair)])",
  );
  const commonmark = assemble.indexOf(".use(\n      commonmark.filter(");
  assertion(literal >= 0, "literal delimiter plugin is not installed");
  assertion(commonmark > literal, "stock commonmark input rules still run first");
  for (const rule of [
    "emphasisStarInputRule",
    "emphasisUnderscoreInputRule",
    "inlineCodeInputRule",
    "strongInputRule",
  ]) {
    assertion(assemble.includes(`plugin !== ${rule}`), `${rule} is not filtered`);
  }
});

testCase("从左闭合组外侧逐键经过两颗星再回到正文末端", () => {
  const marker = (side: "left" | "right") =>
    syntax.create({ syntax: "strong", side, symbol: "*" });
  const doc = schema.node("doc", null, [
    schema.node("paragraph", null, [
      marker("left"),
      marker("left"),
      schema.text("the", [strong.create()]),
      marker("right"),
      marker("right"),
    ]),
  ]);
  let state = EditorState.create({
    schema,
    doc,
    selection: TextSelection.create(doc, 8),
  });
  const first = moveInlineCaret(state, syntax, "ArrowLeft");
  assertion(first, "first Left produced no transaction");
  state = state.apply(first);
  equal(state.selection.from, 7, "first Left should stop between closing stars");
  const second = moveInlineCaret(state, syntax, "ArrowLeft");
  assertion(second, "second Left produced no transaction");
  state = state.apply(second);
  equal(state.selection.from, 6, "second Left should stop before the closing group");
  const third = moveInlineCaret(state, syntax, "ArrowLeft");
  equal(third, null, "third Left should be left to native text navigation");
});

testCase("从左开启组内侧逐键经过两颗星再到段首", () => {
  const marker = (side: "left" | "right") =>
    syntax.create({ syntax: "strong", side, symbol: "*" });
  const doc = schema.node("doc", null, [
    schema.node("paragraph", null, [
      marker("left"),
      marker("left"),
      schema.text("the", [strong.create()]),
      marker("right"),
      marker("right"),
    ]),
  ]);
  let state = EditorState.create({
    schema,
    doc,
    selection: TextSelection.create(doc, 3),
  });
  const first = moveInlineCaret(state, syntax, "ArrowLeft");
  assertion(first, "first Left produced no transaction");
  state = state.apply(first);
  equal(state.selection.from, 2, "first Left should stop between opening stars");
  const second = moveInlineCaret(state, syntax, "ArrowLeft");
  assertion(second, "second Left produced no transaction");
  state = state.apply(second);
  equal(state.selection.from, 1, "second Left should stop before the opening group");
  equal(
    moveInlineCaret(state, syntax, "ArrowLeft"),
    null,
    "Left at paragraph start should be left to native block navigation",
  );
});

testCase("Delete 在左定界符内按源码字符删除并保留剩余源码", () => {
  const source = schema.node("doc", null, [
    schema.node("paragraph", null, [schema.text("**the**")]),
  ]);
  const initial = EditorState.create({
    schema,
    doc: source,
    selection: TextSelection.create(source, 1),
  });
  const normalized = normalizeInlineBlock(initial, syntax);
  assertion(normalized, "complete bold source was not normalized");
  const normalizedState = initial.apply(normalized);
  const state = normalizedState.apply(
    normalizedState.tr.setSelection(TextSelection.create(normalizedState.doc, 1)),
  );
  const paragraph = state.doc.firstChild;
  assertion(paragraph, "normalized paragraph is missing");
  const before = serializeInlineBlock(paragraph, syntax, schema.marks);
  assertion(before, "normalized source could not be serialized");
  equal(before.source, "**the**", "normalization changed the visible source");

  const tr = deleteInlineDelimiter(state, syntax);
  assertion(tr, "Delete at the opening delimiter produced no transaction");
  const next = state.apply(tr);
  const nextParagraph = next.doc.firstChild;
  assertion(nextParagraph, "paragraph disappeared after Delete");
  const after = serializeInlineBlock(nextParagraph, syntax, schema.marks);
  assertion(after, "literal source could not be serialized");
  equal(after.source, "*the**", "Delete did not remove exactly one opening star");
  equal(next.selection.from, 2, "Delete did not leave the caret after the remaining star");
});

testCase("反斜杠在两个闭合星之间按当前源码位置插入", () => {
  const source = schema.node("doc", null, [
    schema.node("paragraph", null, [schema.text("**Typora**")]),
  ]);
  const initial = EditorState.create({
    schema,
    doc: source,
    selection: TextSelection.create(source, 1),
  });
  const normalized = normalizeInlineBlock(initial, syntax);
  assertion(normalized, "complete bold source was not normalized");
  const withMarkers = initial.apply(normalized);
  const right = listSyntaxMarkers(withMarkers.doc, syntax).find(
    (marker) => marker.side === "right",
  );
  assertion(right, "closing marker group is missing");
  const between = withMarkers.apply(
    withMarkers.tr.setSelection(
      TextSelection.create(withMarkers.doc, right.to2 - 1),
    ),
  );
  const tr = inputInlineDelimiter(
    between,
    syntax,
    between.selection.from,
    between.selection.to,
    "\\",
    undefined,
    true,
  );
  assertion(tr, "typing a backslash between closing stars produced no transaction");
  const next = between.apply(tr);
  const nextParagraph = next.doc.firstChild;
  assertion(nextParagraph, "paragraph disappeared after backslash input");
  const after = serializeInlineBlock(nextParagraph, syntax, schema.marks);
  assertion(after, "source could not be serialized after backslash input");
  equal(
    after.source,
    "**Typora*\\*",
    "backslash moved outside the closing delimiter group",
  );
});

console.log(`\n通过 ${passed} 条，失败 ${failed} 条`);
if (failed > 0) process.exitCode = 1;
