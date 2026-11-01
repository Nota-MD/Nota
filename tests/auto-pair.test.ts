import { Schema } from "@milkdown/kit/prose/model";
import { EditorState, TextSelection } from "@milkdown/kit/prose/state";

import { pairedInputTransaction } from "../src/editor/auto-pair";
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

console.log(`\nAuto pair: ${passed} passed, ${failed} failed`);
if (failed > 0) process.exitCode = 1;
