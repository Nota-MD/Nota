import { Schema } from "@milkdown/kit/prose/model";
import { EditorState, TextSelection } from "@milkdown/kit/prose/state";
import { readFileSync } from "node:fs";

import { createLiveTocDecorations } from "../src/editor/live-toc";

let pass = 0;
let fail = 0;

function testCase(name: string, body: () => void): void {
  try {
    body();
    pass++;
    console.log(`  ok ${name}`);
  } catch (error) {
    fail++;
    console.log(`  failed ${name}`);
    console.log(`      ${error instanceof Error ? error.message : String(error)}`);
  }
}

function assert(value: unknown, message: string): asserts value {
  if (!value) throw new Error(message);
}

const schema = new Schema({
  nodes: {
    doc: { content: "block+" },
    paragraph: { group: "block", content: "inline*" },
    heading: {
      group: "block",
      content: "inline*",
      attrs: { level: { default: 1 } },
    },
    text: { group: "inline" },
  },
});

function paragraph(text: string) {
  return schema.nodes.paragraph.create(null, text ? schema.text(text) : undefined);
}

function heading(level: number, text: string) {
  return schema.nodes.heading.create({ level }, text ? schema.text(text) : undefined);
}

function stateWithToc(cursor = 1): EditorState {
  const doc = schema.node("doc", null, [
    heading(1, "Intro"),
    paragraph("[TOC]"),
    heading(2, "Details"),
  ]);
  return EditorState.create({ doc, selection: TextSelection.create(doc, cursor) });
}

console.log("\n[live TOC]");

testCase("renders a standalone [TOC] paragraph from document headings", () => {
  const state = stateWithToc();
  const decorations = createLiveTocDecorations(state).find();
  assert(
    decorations.some((item) => item.type.attrs?.class === "nota-live-toc-slot"),
    "TOC slot decoration missing",
  );
  assert(
    decorations.some((item) => String(item.type.spec.key ?? "").includes("1:0:Intro")),
    "TOC widget key does not include headings",
  );
});

testCase("keeps the rendered TOC visible when the caret starts in its paragraph", () => {
  const probe = stateWithToc();
  const tocFrom = probe.doc.child(0).nodeSize;
  const state = stateWithToc(tocFrom + 2);
  const decorations = createLiveTocDecorations(state).find();
  assert(
    decorations.some((item) => item.type.attrs?.class === "nota-live-toc-slot"),
    "TOC disappeared when the caret entered its paragraph",
  );
});

testCase("does not decorate [TOC] when the document has no headings", () => {
  const doc = schema.node("doc", null, [paragraph("[TOC]"), paragraph("Body")]);
  const state = EditorState.create({ doc, selection: TextSelection.create(doc, 1) });
  assert(createLiveTocDecorations(state).find().length === 0, "TOC rendered without headings");
});

testCase("does not collect document headings when no [TOC] paragraph exists", () => {
  const source = readFileSync("src/editor/live-toc.ts", "utf8");
  const slotScan = source.indexOf("doc.forEach");
  const headingScan = source.indexOf("collectHeadings(doc)");
  assert(slotScan >= 0 && headingScan > slotScan, "heading scan runs before the TOC slot check");
});

console.log(`\nPassed ${pass}; failed ${fail}`);
if (fail > 0) process.exitCode = 1;
