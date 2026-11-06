import { Schema } from "@milkdown/kit/prose/model";
import { EditorState, TextSelection } from "@milkdown/kit/prose/state";

import {
  compositionPairTransaction,
  pairedInputTransaction,
} from "../src/editor/auto-pair";
import { DefaultPunctuationSettings } from "../src/editor/smart-punctuation";

const schema = new Schema({
  nodes: {
    doc: { content: "block+" },
    paragraph: { content: "inline*", group: "block" },
    text: { group: "inline" },
    code_block: { content: "text*", marks: "", group: "block", code: true },
  },
  marks: {
    code: { code: true },
    link: { attrs: { href: {} }, inclusive: false },
  },
});

let passed = 0;
let failed = 0;

function assert(condition: unknown, message: string): void {
  if (!condition) throw new Error(message);
}

function assertEqual(actual: unknown, expected: unknown, message: string): void {
  if (actual !== expected) {
    throw new Error(`${message}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
  }
}

function testCase(name: string, run: () => void): void {
  try {
    run();
    passed += 1;
    console.log(`  ✔ ${name}`);
  } catch (error) {
    failed += 1;
    console.error(`  ✘ ${name}`);
    console.error(`    ${error instanceof Error ? error.message : String(error)}`);
  }
}

function stateAt(text: string, from: number, to = from): EditorState {
  const paragraph = schema.nodes.paragraph.create(null, text ? schema.text(text) : null);
  const doc = schema.nodes.doc.create(null, paragraph);
  return EditorState.create({
    schema,
    doc,
    selection: TextSelection.create(doc, from, to),
  });
}

console.log("\n[Basic auto pair]");

testCase("empty selection inserts a bracket pair", () => {
  const state = stateAt("", 1);
  const transaction = pairedInputTransaction(state, 1, 1, "(", DefaultPunctuationSettings);
  assert(transaction, "pair transaction missing");
  const next = state.apply(transaction);
  assertEqual(next.doc.textContent, "()", "pair text");
  assertEqual(next.selection.from, 2, "caret between the pair");
});

testCase("raw closing bracket is not treated as an inserted pair", () => {
  const state = stateAt("()", 2);
  assertEqual(
    pairedInputTransaction(state, 2, 2, ")", DefaultPunctuationSettings),
    null,
    "a closer without pair state must remain ordinary input",
  );
});

testCase("opening before an existing word stays literal", () => {
  const state = stateAt("word", 1);
  assertEqual(
    pairedInputTransaction(state, 1, 1, "(", DefaultPunctuationSettings),
    null,
    "a bracket before text must not be inserted as a wrapper",
  );
});

testCase("selection is wrapped without replacing its content", () => {
  const state = stateAt("word", 1, 5);
  const transaction = pairedInputTransaction(state, 1, 5, "(", DefaultPunctuationSettings);
  assert(transaction, "selection wrap transaction missing");
  const next = state.apply(transaction);
  assertEqual(next.doc.textContent, "(word)", "wrapped text");
  assertEqual(next.doc.textBetween(next.selection.from, next.selection.to), "word", "selection");
});

testCase("smart quote input creates one curly pair", () => {
  const state = stateAt("", 1);
  const transaction = pairedInputTransaction(state, 1, 1, '"', DefaultPunctuationSettings);
  assert(transaction, "quote pair transaction missing");
  assertEqual(state.apply(transaction).doc.textContent, "“”", "curly quote pair");
});

testCase("apostrophe after a word is left to smart punctuation", () => {
  const state = stateAt("don", 4);
  assertEqual(
    pairedInputTransaction(state, 4, 4, "'", DefaultPunctuationSettings),
    null,
    "apostrophe must not create a quote pair after a word",
  );
});

testCase("URL text is excluded from bracket pairing", () => {
  const state = stateAt("https://example.com/a", 22);
  assertEqual(
    pairedInputTransaction(state, 22, 22, "(", DefaultPunctuationSettings),
    null,
    "a URL path must stay literal",
  );
});

testCase("inline code is excluded from pairing", () => {
  const paragraph = schema.nodes.paragraph.create(
    null,
    schema.text("code", [schema.marks.code.create()]),
  );
  const doc = schema.nodes.doc.create(null, paragraph);
  const state = EditorState.create({
    schema,
    doc,
    selection: TextSelection.create(doc, 3),
  });
  assertEqual(
    pairedInputTransaction(state, 3, 3, "(", DefaultPunctuationSettings),
    null,
    "inline code must stay literal",
  );
});

console.log("\n[IME composition]");

testCase("a bracket committed by an input method gets its partner", () => {
  const composed = stateAt("（", 2);
  const transaction = compositionPairTransaction(composed, "（");
  assert(transaction, "composition pair transaction missing");
  const next = composed.apply(transaction!);
  assertEqual(next.doc.textContent, "（）", "committed bracket pair");
  assertEqual(next.selection.from, 2, "caret between committed pair");
});

testCase("the partner follows the last bracket in a longer commit", () => {
  const state = stateAt("书名《", 4);
  const transaction = compositionPairTransaction(state, "书名《");
  assert(transaction, "composition pair transaction missing");
  assertEqual(state.apply(transaction!).doc.textContent, "书名《》", "last committed opener");
});

testCase("a committed closer steps over the existing partner", () => {
  const composedOpener = stateAt("（", 2);
  const opened = composedOpener.apply(
    compositionPairTransaction(composedOpener, "（")!,
  );
  const typedCloser = opened.apply(
    opened.tr.insertText("）", opened.selection.from),
  );
  const transaction = compositionPairTransaction(typedCloser, "）", undefined, [
    { open: 1, close: 3, opener: "（", closer: "）" },
  ]);
  assert(transaction, "closer cleanup transaction missing");
  const next = typedCloser.apply(transaction!);
  assertEqual(next.doc.textContent, "（）", "only the original closer remains");
  assertEqual(next.selection.from, 3, "caret after the pair");
});

testCase("committed brackets before a word stay literal", () => {
  const state = stateAt("（文字", 2);
  assertEqual(
    compositionPairTransaction(state, "（"),
    null,
    "a committed opener before text must not pair",
  );
});

testCase("a composition over a selection wraps the original text", () => {
  const original = stateAt("看这本书吧", 2, 5);
  const wrapped = {
    from: 2,
    content: original.doc.slice(2, 5),
    sizeAfter: original.doc.content.size - 3 + 1,
  };
  const composed = original.apply(original.tr.insertText("《", 2, 5));
  const transaction = compositionPairTransaction(composed, "《", wrapped);
  assert(transaction, "wrapped composition transaction missing");
  const next = composed.apply(transaction!);
  assertEqual(next.doc.textContent, "看《这本书》吧", "committed text wrapped");
  assertEqual(next.doc.textBetween(next.selection.from, next.selection.to), "这本书", "wrapped selection");
});

console.log(`\nAuto pair: ${passed} passed, ${failed} failed`);
if (failed > 0) process.exitCode = 1;
