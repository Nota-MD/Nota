import { readFileSync } from "node:fs";

import {
  parsePanelInline,
  parsePanelMarkdown,
  type PanelInline,
} from "../src/ui/panel-markdown";

let passed = 0;
let failed = 0;

function testCase(name: string, body: () => void): void {
  try {
    body();
    passed++;
    console.log(`  PASS ${name}`);
  } catch (error) {
    failed++;
    console.log(`  FAIL ${name}`);
    console.log(`       ${error instanceof Error ? error.message : String(error)}`);
  }
}

function assert(value: unknown, message: string): asserts value {
  if (!value) throw new Error(message);
}

console.log("\n[Panel Markdown]");

testCase("parses headings, emphasis, links, code and quotes", () => {
  const blocks = parsePanelMarkdown(
    [
      "## Answer",
      "",
      "Use **bold**, *italic*, ~~old~~, `code` and [site](https://example.com).",
      "",
      "> quoted",
      "",
      "```ts",
      "const x = 1;",
      "```",
    ].join("\n"),
  );
  assert(blocks[0]?.type === "heading" && blocks[0].level === 2, "heading missing");
  assert(blocks.some((block) => block.type === "paragraph"), "paragraph missing");
  assert(blocks.some((block) => block.type === "quote"), "quote missing");
  assert(
    blocks.some((block) => block.type === "code" && block.language === "ts" && block.text === "const x = 1;"),
    "fenced code missing",
  );
  const paragraph = blocks.find((block) => block.type === "paragraph");
  assert(paragraph?.type === "paragraph", "paragraph missing");
  const kinds = new Set<PanelInline["type"]>();
  const collect = (nodes: readonly PanelInline[]) => {
    for (const node of nodes) {
      kinds.add(node.type);
      if ("children" in node) collect(node.children);
    }
  };
  collect(paragraph.children);
  assert(kinds.has("strong") && kinds.has("emphasis") && kinds.has("strike"), "inline marks missing");
  assert(kinds.has("code") && kinds.has("link"), "inline code or link missing");
});

testCase("parses lists and GFM tables", () => {
  const blocks = parsePanelMarkdown(
    [
      "1. first",
      "2. second",
      "",
      "| Name | Value |",
      "| --- | --- |",
      "| A | 1 |",
    ].join("\n"),
  );
  assert(blocks[0]?.type === "list" && blocks[0].ordered, "ordered list missing");
  assert(blocks[1]?.type === "table", "table missing");
  assert(blocks[1].header.join("|") === "Name|Value", "table header mismatch");
  assert(blocks[1].rows[0]?.join("|") === "A|1", "table row mismatch");
});

testCase("keeps unsafe links as text instead of creating active URLs", () => {
  const nodes = parsePanelInline("[bad](javascript:alert(1)) [good](https://example.com)");
  assert(!nodes.some((node) => node.type === "link" && node.href.startsWith("javascript:")), "unsafe URL accepted");
  assert(nodes.some((node) => node.type === "link" && node.href === "https://example.com"), "safe URL missing");
});

testCase("raw HTML remains literal text", () => {
  const blocks = parsePanelMarkdown("<script>alert(1)</script>");
  assert(blocks[0]?.type === "paragraph", "HTML paragraph missing");
  const text = blocks[0].children.map((node) => ("text" in node ? node.text : "")).join("");
  assert(text === "<script>alert(1)</script>", "raw HTML was interpreted");
});

testCase("AI messages route through the Markdown renderer", () => {
  const source = readFileSync("src/ui/PanelBody.tsx", "utf8");
  assert(source.includes('import { PanelMarkdown } from "@/ui/panel-markdown";'), "renderer import missing");
  assert(
    /node\.from === "ai"[\s\S]*?<PanelMarkdown text=\{node\.text\}/.test(source),
    "AI messages still render as plain text",
  );
});

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) process.exitCode = 1;
