import { readFileSync } from "node:fs";
import remarkParse from "remark-parse";
import remarkStringify from "remark-stringify";
import { unified } from "unified";

import {
  DefaultMarkdownSyntaxStyle,
  markdownStringifyOptions,
  resolveMarkdownSyntaxStyle,
  type MarkdownSyntaxStyle,
} from "../src/editor/markdown-syntax-style";

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

function equal<T>(actual: T, expected: T, message: string): void {
  if (actual !== expected) {
    throw new Error(`${message}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
  }
}

function serialize(source: string, style: MarkdownSyntaxStyle): string {
  return unified()
    .use(remarkParse)
    .use(remarkStringify, markdownStringifyOptions(style))
    .processSync(source)
    .toString();
}

console.log("\n[Markdown syntax style]");

testCase("document syntax wins over fallback preferences", () => {
  const source = [
    "Setext heading",
    "==============",
    "",
    "+ one",
    "+ two",
    "",
    "1) first",
    "2) second",
    "",
  ].join("\n");
  const style = resolveMarkdownSyntaxStyle(source, {
    heading: "atx",
    bullet: "dash",
    ordered: "dot",
  });
  equal(style.heading, "setext", "heading style");
  equal(style.bullet, "plus", "bullet marker");
  equal(style.ordered, "paren", "ordered marker");
  equal(serialize(source, style), source, "source round trip");
});

testCase("fallback preferences apply when a document has no matching syntax", () => {
  const preferred: MarkdownSyntaxStyle = {
    heading: "setext",
    bullet: "star",
    ordered: "paren",
  };
  equal(
    resolveMarkdownSyntaxStyle("Plain paragraph\n", preferred).heading,
    "setext",
    "heading fallback",
  );
  equal(
    resolveMarkdownSyntaxStyle("Plain paragraph\n", preferred).bullet,
    "star",
    "bullet fallback",
  );
  equal(
    resolveMarkdownSyntaxStyle("Plain paragraph\n", preferred).ordered,
    "paren",
    "ordered fallback",
  );
});

testCase("fenced code and indented code do not affect document style", () => {
  const source = [
    "```markdown",
    "# Not a heading",
    "+ not a list",
    "1) not an ordered list",
    "```",
    "",
    "    # Also not a heading",
    "    + Also not a list",
  ].join("\n");
  const style = resolveMarkdownSyntaxStyle(source);
  equal(style.heading, DefaultMarkdownSyntaxStyle.heading, "fenced heading leaked");
  equal(style.bullet, DefaultMarkdownSyntaxStyle.bullet, "fenced bullet leaked");
  equal(style.ordered, DefaultMarkdownSyntaxStyle.ordered, "fenced ordered marker leaked");
});

testCase("mixed styles use the dominant form and resolve ties by first use", () => {
  const dominant = resolveMarkdownSyntaxStyle([
    "* first",
    "- second",
    "* third",
    "",
  ].join("\n"));
  equal(dominant.bullet, "star", "dominant bullet");

  const tied = resolveMarkdownSyntaxStyle([
    "- first",
    "* second",
    "",
  ].join("\n"));
  equal(tied.bullet, "dash", "tie should keep the first marker");
});

testCase("editor creation and settings pass the syntax style through", () => {
  const assemble = readFileSync("src/editor/assemble.ts", "utf8");
  const create = readFileSync("src/editor/create.ts", "utf8");
  const settings = readFileSync("src/ui/useEditorSettings.ts", "utf8");
  const pane = readFileSync("src/ui/EditorPane.tsx", "utf8");
  const editors = readFileSync("src/ui/pane-editors.ts", "utf8");
  equal(
    assemble.includes("resolveMarkdownSyntaxStyle(") &&
      assemble.includes("...markdownStringifyOptions(stringifyStyle)"),
    true,
    "serializer does not use the resolved style",
  );
  equal(
    create.includes("markdownSyntaxStyle") &&
      settings.includes("markdown?.heading_style") &&
      settings.includes("markdown?.bullet_mark") &&
      settings.includes("markdown?.ordered_mark") &&
      pane.includes("markdownSyntaxStyle,") &&
      editors.includes("markdownSyntaxStyle,"),
    true,
    "syntax preferences are not wired from settings to editor creation",
  );
});

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) process.exitCode = 1;
