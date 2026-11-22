import { readFileSync } from "node:fs";

import { inlineDifference } from "@/editor/review";

let passed = 0;
let failed = 0;

function testCase(name: string, body: () => void): void {
  try {
    body();
    passed += 1;
    console.log(`  PASS ${name}`);
  } catch (error) {
    failed += 1;
    console.log(`  FAIL ${name}`);
    console.log(`       ${error instanceof Error ? error.message : String(error)}`);
  }
}

function assert(value: unknown, message: string): asserts value {
  if (!value) throw new Error(message);
}

function equal(actual: unknown, expected: unknown, message: string): void {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw new Error(`${message}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
  }
}

console.log("\n[Inline rendered diff]");

testCase("an insertion stays inside the changed paragraph", () => {
  equal(
    inlineDifference("Nota is free.", "Nota is truly free."),
    [
      { kind: "same", from: 0, to: 8 },
      { kind: "insert", at: 8, from: 8, to: 14, text: "truly " },
      { kind: "same", from: 8, to: 13 },
    ],
    "insertion diff",
  );
});

testCase("CJK replacement keeps the unchanged characters", () => {
  equal(
    inlineDifference("甲乙丙", "甲丁丙"),
    [
      { kind: "same", from: 0, to: 1 },
      { kind: "delete", from: 1, to: 2 },
      { kind: "insert", at: 2, from: 1, to: 2, text: "丁" },
      { kind: "same", from: 2, to: 3 },
    ],
    "CJK diff",
  );
});

testCase("surrogate pairs are compared as complete characters", () => {
  equal(
    inlineDifference("A😀B", "A😁B"),
    [
      { kind: "same", from: 0, to: 1 },
      { kind: "delete", from: 1, to: 3 },
      { kind: "insert", at: 3, from: 1, to: 3, text: "😁" },
      { kind: "same", from: 3, to: 4 },
    ],
    "emoji diff",
  );
});

testCase("identical text has no inline operations", () => {
  equal(inlineDifference("same", "same"), [], "identical text");
});

testCase("large unrelated paragraphs fall back instead of allocating a huge table", () => {
  equal(
    inlineDifference("a ".repeat(2500), "b ".repeat(2500)),
    null,
    "large fallback",
  );
});

testCase("the ProseMirror layer emits inline decorations and widgets", () => {
  const prose = readFileSync("src/editor/review-prose.ts", "utf8");
  const css = readFileSync("src/styles/review.css", "utf8");
  assert(prose.includes("appendInlineChange"), "inline adapter is missing");
  assert(prose.includes("textMarkSequence"), "mark-compatible fallback guard is missing");
  assert(prose.includes("Decoration.inline"), "deleted text is not decorated inline");
  assert(prose.includes("inlineIncreaseClass"), "inserted text widget is missing");
  assert(prose.includes("serializeNode(node.type.schema.text"), "inserted marks are flattened");
  assert(prose.includes('block.node.type.name === "math_block"'), "math blocks fall back to source text");
  assert(css.includes(".nota-review-inline-add"), "inline insert styling is missing");
});

console.log(`\nInline rendered diff: ${passed} passed, ${failed} failed`);
if (failed > 0) process.exitCode = 1;
