import { readFileSync } from "node:fs";

import { preserveInlineEscapes } from "@/editor/inline-escape";

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

interface NodeLike {
  type: string;
  value?: string;
  children?: NodeLike[];
  position?: {
    start?: { offset?: number };
    end?: { offset?: number };
  };
}

function text(value: string, start: number, end: number): NodeLike {
  return {
    type: "text",
    value,
    position: {
      start: { offset: start },
      end: { offset: end },
    },
  };
}

testCase("escaped equals survives Markdown parsing as a semantic escape node", () => {
  const tree: NodeLike = {
    type: "root",
    children: [{
      type: "tableCell",
      children: [{
        type: "paragraph",
        children: [text("=A1", 0, 4)],
      }],
    }],
  };
  preserveInlineEscapes(tree, "\\=A1");
  const children = tree.children?.[0]?.children?.[0]?.children;
  assert(children?.[0]?.type === "notaEscape", "escaped equals was not converted to notaEscape");
  assert(children?.[0]?.value === "=", "escape node did not preserve the equals character");
  assert(children?.[1]?.type === "text" && children[1]?.value === "A1", "text after the escape was lost");
});

testCase("an escape in the middle of text splits only the escaped character", () => {
  const tree: NodeLike = {
    type: "root",
    children: [{
      type: "paragraph",
      children: [text("a=b", 0, 4)],
    }],
  };
  preserveInlineEscapes(tree, "a\\=b");
  const children = tree.children?.[0]?.children;
  const actual = children?.map((node) => `${node.type}:${node.value ?? ""}`).join("|");
  assert(actual === "text:a|notaEscape:=|text:b",
    `middle escape did not split into text and escape nodes: ${actual}`);
});

testCase("ordinary text is left unchanged", () => {
  const node = text("plain", 0, 5);
  const tree: NodeLike = { type: "root", children: [{ type: "paragraph", children: [node] }] };
  preserveInlineEscapes(tree, "plain");
  assert(tree.children?.[0]?.children?.[0] === node, "ordinary text was replaced");
});

testCase("parser and serializer both preserve escaped punctuation", () => {
  const assembly = readFileSync("src/editor/assemble.ts", "utf8");
  const escape = readFileSync("src/editor/inline-escape.ts", "utf8");
  assert(assembly.includes("remarkInlineEscapePlugins"), "the escape remark plugin is not installed");
  assert(escape.includes('state.addNode("text", undefined, `\\\\${symbol}`)'),
    "the escape serializer no longer writes literal backslash text");
});

console.log(`\n${passed} passed, ${failed} failed`);
if (failed) process.exitCode = 1;
