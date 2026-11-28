import { Schema } from "@milkdown/kit/prose/model";
import { EditorState } from "@milkdown/kit/prose/state";

import {
  headingIdsTouched,
  withHeadingIds,
} from "../src/editor/heading-id";

let passed = 0;
let failed = 0;

function testCase(name: string, run: () => void): void {
  try {
    run();
    passed += 1;
    console.log(`  PASS ${name}`);
  } catch (error) {
    failed += 1;
    console.log(`  FAIL ${name}`);
    console.log(`       ${error instanceof Error ? error.message : String(error)}`);
  }
}

function equal(actual: unknown, expected: unknown, message: string): void {
  if (actual !== expected) {
    throw new Error(`${message}: expected ${String(expected)}, got ${String(actual)}`);
  }
}

const schema = new Schema({
  nodes: {
    doc: { content: "block+" },
    heading: {
      content: "inline*",
      group: "block",
      attrs: {
        id: { default: "" },
        level: { default: 1 },
      },
    },
    paragraph: {
      content: "inline*",
      group: "block",
    },
    text: { group: "inline" },
  },
});

const idOf = (node: { textContent: string }): string =>
  node.textContent.toLowerCase().trim().replace(/\s+/g, "-");

function heading(text: string, level = 1) {
  return schema.nodes.heading!.create(
    { id: "", level },
    text ? schema.text(text) : undefined,
  );
}

function paragraph(text: string) {
  return schema.nodes.paragraph!.create(null, text ? schema.text(text) : undefined);
}

console.log("\n[Heading ids]");

testCase("adds deterministic ids without rebuilding unaffected blocks", () => {
  const unchanged = paragraph("keep");
  const doc = schema.nodes.doc!.create(null, [
    heading("First Section"),
    unchanged,
    heading("Second Section", 2),
  ]);
  const result = withHeadingIds(doc, idOf);
  equal(result.child(0).attrs.id, "first-section", "first id");
  equal(result.child(2).attrs.id, "second-section", "second id");
  equal(result.child(1), unchanged, "paragraph identity");
});

testCase("numbers duplicate headings in document order", () => {
  const doc = schema.nodes.doc!.create(null, [
    heading("Repeat"),
    heading("Repeat"),
    heading("Repeat"),
  ]);
  const result = withHeadingIds(doc, idOf);
  equal(result.child(0).attrs.id, "repeat", "first duplicate");
  equal(result.child(1).attrs.id, "repeat-#2", "second duplicate");
  equal(result.child(2).attrs.id, "repeat-#3", "third duplicate");
});

testCase("leaves empty headings without an id", () => {
  const doc = schema.nodes.doc!.create(null, [heading("")]);
  equal(withHeadingIds(doc, idOf).child(0).attrs.id, "", "empty id");
});

testCase("detects heading markup changes but ignores paragraph text", () => {
  const state = EditorState.create({
    schema,
    doc: schema.nodes.doc!.create(null, [heading("Title"), paragraph("body")]),
  });
  equal(
    headingIdsTouched(
      state.tr.setNodeMarkup(0, undefined, { id: "", level: 2 }),
    ),
    true,
    "heading markup",
  );
  const paragraphStart = state.doc.child(0).nodeSize;
  equal(
    headingIdsTouched(state.tr.insertText("x", paragraphStart + 1)),
    false,
    "paragraph text",
  );
});

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) process.exitCode = 1;
