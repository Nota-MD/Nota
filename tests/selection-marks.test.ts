/**
 * 选中文字后输入 Markdown 标记：包住选区、保留选区，连续输入自然叠成强标记。
 */

import { Schema } from "@milkdown/kit/prose/model";
import type { Node as PMNode } from "@milkdown/kit/prose/model";
import {
  EditorState,
  TextSelection,
  type Transaction,
} from "@milkdown/kit/prose/state";
import type { EditorView } from "@milkdown/kit/prose/view";

import {
  createSelectionMarkPlugin,
  packageWrapSelectionTransaction,
  shouldPackageWrapSelection,
  selectionMark,
  selectionMarkFillAll,
  selectionMarkKey,
} from "../src/editor/selection-marks";

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
    if (error instanceof Error && error.stack) console.log(error.stack);
  }
}

function equal(actual: unknown, expected: unknown, description: string): void {
  if (actual !== expected) {
    throw new Error(`${description}：期望 ${JSON.stringify(expected)}，实际 ${JSON.stringify(actual)}`);
  }
}

function assertValue(value2: unknown, description: string): asserts value2 {
  if (!value2) throw new Error(description);
}

const schema = new Schema({
  nodes: {
    doc: { content: "block+" },
    paragraph: { group: "block", content: "inline*" },
    code_block: { group: "block", content: "text*", code: true },
    text: { group: "inline" },
  },
  marks: {
    inlineCode: { code: true },
  },
});

const paragraph2 = (text4: string): PMNode =>
  schema.nodes.paragraph.create(null, text4 ? schema.text(text4) : null);

function state(text4: string, from = 0, to2 = from): EditorState {
  const doc = schema.nodes.doc.create(null, paragraph2(text4));
  return EditorState.create({
    schema,
    doc,
    selection: TextSelection.create(doc, 1 + from, 1 + to2),
  });
}

console.log("\n【选区标记】");

testCase("标记表覆盖常用行内写法，未知字符不接管", () => {
  for (const character2 of ["*", "_", "~", "^", "=", "`"]) {
    equal(selectionMark(character2), character2 === "=" ? "==" : character2, `${character2} 该有包裹`);
  }
  equal(selectionMark("a"), null, "普通字符");
});

testCase("选中文字按 `*`：两侧各一颗，选区仍是原文", () => {
  const before2 = state("甲乙", 0, 2);
  const tr = packageWrapSelectionTransaction(before2, 1, 3, "*");
  assertValue(tr, "应当包裹");
  const after = before2.apply(tr);
  equal(after.doc.textContent, "*甲乙*", "文档");
  equal(after.selection.from, 2, "选区起点");
  equal(after.selection.to, 4, "选区终点");
});

testCase("连续按两次 `*`：第二次继续包住原选区，得到粗体", () => {
  const before2 = state("甲乙", 0, 2);
  const ordinalValueStroke = packageWrapSelectionTransaction(before2, 1, 3, "*");
  assertValue(ordinalValueStroke, "第一笔");
  const middle = before2.apply(ordinalValueStroke);
  const ordinalTwoStroke = packageWrapSelectionTransaction(middle, middle.selection.from, middle.selection.to, "*");
  assertValue(ordinalTwoStroke, "第二笔");
  const after = middle.apply(ordinalTwoStroke);
  equal(after.doc.textContent, "**甲乙**", "粗体标记");
});

testCase("`=` 第一次就包成高亮的双等号", () => {
  const before2 = state("重点", 0, 2);
  const tr = packageWrapSelectionTransaction(before2, 1, 3, "=");
  assertValue(tr, "应当包裹");
  equal(before2.apply(tr).doc.textContent, "==重点==", "双等号");
});

testCase("跨段选区、代码块和行内代码都放行给原编辑器", () => {
  const crossParagraphdoc = schema.nodes.doc.create(null, [paragraph2("甲"), paragraph2("乙")]);
  const crossParagraph = EditorState.create({
    schema,
    doc: crossParagraphdoc,
    selection: TextSelection.create(crossParagraphdoc, 2, 5),
  });
  equal(shouldPackageWrapSelection(crossParagraph, 2, 5, "*"), false, "跨段");

  const codeDocument = schema.nodes.doc.create(
    null,
    [schema.nodes.code_block.create(null, schema.text("甲乙"))],
  );
  const code = EditorState.create({
    schema,
    doc: codeDocument,
    selection: TextSelection.create(codeDocument, 1, 3),
  });
  equal(packageWrapSelectionTransaction(code, 1, 3, "*"), null, "代码块");

  const inlinedoc = schema.nodes.doc.create(
    null,
    schema.nodes.paragraph.create(null, schema.text("甲乙", [schema.marks.inlineCode.create()])),
  );
  const inline = EditorState.create({
    schema,
    doc: inlinedoc,
    selection: TextSelection.create(inlinedoc, 1, 3),
  });
  equal(packageWrapSelectionTransaction(inline, 1, 3, "*"), null, "行内代码");
});

testCase("插件入口真的把事务派进视图", () => {
  let before2 = state("甲乙", 0, 2);
  const plugin = createSelectionMarkPlugin();
  equal(plugin.spec.key, selectionMarkKey, "插件键");
  const view = {
    composing: false,
    get state() {
      return before2;
    },
    dispatch(tr: Transaction) {
      before2 = before2.apply(tr);
    },
  } as EditorView;
  const connect = plugin.props.handleTextInput?.(view, 1, 3, "*") ?? false;
  equal(connect, true, "应当接管");
  equal(before2.doc.textContent, "*甲乙*", "派发结果");
});

testCase("智能符号关闭时不安装", () => {
  const close4 = selectionMarkFillAll(false) as unknown[];
  equal(Array.isArray(close4) && close4.length === 0, true, "关闭");
  equal(Array.isArray(selectionMarkFillAll(true)), false, "开启");
});

if (fail > 0) {
  console.error(`\n${fail} 项失败`);
  process.exitCode = 1;
} else {
  console.log(`\n${pass} passed, 0 failed`);
}
