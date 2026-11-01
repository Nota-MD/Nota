import { Schema } from "@milkdown/kit/prose/model";
import { EditorState, TextSelection } from "@milkdown/kit/prose/state";

import {
  createMarkHintPlugin,
  listSyntaxMarkers,
  promotePairedMark,
} from "../src/editor/mark-hint";

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
  if (actual !== expected) throw new Error(`${message}: ${actual} !== ${expected}`);
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
    notaEscape: {
      inline: true,
      group: "inline",
      atom: true,
      attrs: {
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
const escape = schema.nodes.notaEscape!;

console.log("\n[Retroactive mark pairing]");

testCase("typing an opening delimiter before an existing closer promotes the pair", () => {
  const doc = schema.node("doc", null, [schema.node("paragraph", null, schema.text("18*"))]);
  let state = EditorState.create({
    schema,
    doc,
    selection: TextSelection.create(doc, 1),
    plugins: [createMarkHintPlugin(syntax)],
  });
  state = state.apply(state.tr.insertText("*", 1));
  equal(state.doc.firstChild?.textContent, "18", "visible source text changed");
  equal(listSyntaxMarkers(state.doc, syntax).length, 2, "syntax markers missing");
  let marked = false;
  state.doc.descendants((node) => {
    if (node.isText && node.text === "18" && node.marks.some((mark) => mark.type.name === "emphasis")) {
      marked = true;
      return false;
    }
    return true;
  });
  assertValue(marked, "emphasis mark missing");
});

testCase("the same recovery supports strong, strike and highlight", () => {
  const cases = [
    { before: "18**", inserted: "**", mark: "strong" },
    { before: "18~~", inserted: "~~", mark: "strike_through" },
    { before: "18==", inserted: "==", mark: "highlight" },
  ];
  for (const item of cases) {
    const doc = schema.node("doc", null, [schema.node("paragraph", null, schema.text(item.before))]);
    let state = EditorState.create({
      schema,
      doc,
      selection: TextSelection.create(doc, 1),
      plugins: [createMarkHintPlugin(syntax)],
    });
    state = state.apply(state.tr.insertText(item.inserted, 1));
    equal(state.doc.firstChild?.textContent, "18", `${item.mark} visible source`);
    equal(listSyntaxMarkers(state.doc, syntax).length, 2, `${item.mark} markers`);
    let marked = false;
    state.doc.descendants((node) => {
      if (node.isText && node.text === "18" && node.marks.some((mark) => mark.type.name === item.mark)) {
        marked = true;
        return false;
      }
      return true;
    });
    assertValue(marked, `${item.mark} mark missing`);
  }
});

testCase("an escaped opening delimiter is left literal", () => {
  const doc = schema.node("doc", null, [schema.node("paragraph", null, schema.text("\\18*"))]);
  let state = EditorState.create({
    schema,
    doc,
    selection: TextSelection.create(doc, 2),
    plugins: [createMarkHintPlugin(syntax, escape)],
  });
  state = state.apply(state.tr.insertText("*", 2));
  let escaped = false;
  let marked = false;
  state.doc.descendants((node) => {
    if (node.type === escape && node.attrs.symbol === "*") escaped = true;
    if (node.isText && node.marks.some((mark) => mark.type.name === "emphasis")) marked = true;
    return true;
  });
  assertValue(escaped, "escaped opener lost its escape node");
  assertValue(!marked, "escaped opener was promoted");
  assertValue(!promotePairedMark(state, syntax), "escaped pair was reported as promotable");
});

console.log(`\nPassed ${pass}; failed ${fail}`);
if (fail > 0) process.exitCode = 1;
