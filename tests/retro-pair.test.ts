import { Schema } from "@milkdown/kit/prose/model";
import { EditorState, TextSelection } from "@milkdown/kit/prose/state";

import { normalizeInlineBlock } from "../src/editor/mark-hint-source";

let pass = 0;
let fail = 0;

function testCase(name: string, body: () => void): void {
  try {
    body();
    pass++;
    console.log(`  ✔ ${name}`);
  } catch (error) {
    fail++;
    console.log(`  ✘ ${name}`);
    console.log(`      ${error instanceof Error ? error.message : String(error)}`);
  }
}

function equal(actual: unknown, expected: unknown, message: string): void {
  if (actual !== expected) throw new Error(`${message}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
}

function assertValue(value: unknown, message: string): asserts value {
  if (!value) throw new Error(message);
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
    strike_through: {},
    inlineCode: {},
    highlight: {},
    superscript: {},
    subscript: {},
    underline: {},
    kbd: {},
  },
});

const syntax = schema.nodes.notaSyntax!;

function stateFor(source: string): EditorState {
  const doc = schema.node("doc", null, [
    schema.node("paragraph", null, [schema.text(source)]),
  ]);
  return EditorState.create({
    schema,
    doc,
    selection: TextSelection.create(doc, source.length + 1),
  });
}

function normalize(source: string): EditorState | null {
  const state = stateFor(source);
  const tr = normalizeInlineBlock(state, syntax);
  return tr ? state.apply(tr) : null;
}

function hasMark(state: EditorState, mark: string): boolean {
  let found = false;
  state.doc.descendants((node) => {
    if (node.isText && node.marks.some((item) => item.type.name === mark)) {
      found = true;
      return false;
    }
    return true;
  });
  return found;
}

console.log("\n[Retroactive mark pairing]");

testCase("a complete emphasis pair is promoted with character-level markers", () => {
  const state = normalize("*18*");
  assertValue(state, "emphasis pair was not promoted");
  equal(state.doc.firstChild?.textContent, "18", "visible text");
  assertValue(hasMark(state, "emphasis"), "emphasis mark missing");
  let atoms = 0;
  state.doc.descendants((node) => {
    if (node.type === syntax) atoms++;
  });
  equal(atoms, 2, "expected one opening and one closing marker character");
});

testCase("strong, strike and highlight use the same delayed promotion path", () => {
  const cases = [
    { source: "**18**", mark: "strong" },
    { source: "~~18~~", mark: "strike_through" },
    { source: "==18==", mark: "highlight" },
  ];
  for (const item of cases) {
    const state = normalize(item.source);
    assertValue(state, `${item.mark} pair was not promoted`);
    equal(state.doc.firstChild?.textContent, "18", `${item.mark} visible text`);
    assertValue(hasMark(state, item.mark), `${item.mark} mark missing`);
  }
});

testCase("an escaped opening delimiter stays literal", () => {
  const state = normalize("\\*18*");
  if (!state) return;
  assertValue(!hasMark(state, "emphasis"), "escaped opener was promoted");
});

console.log(`\nPassed ${pass}; failed ${fail}`);
if (fail > 0) process.exitCode = 1;
