import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import remarkGfm from "remark-gfm";
import remarkParse from "remark-parse";
import remarkStringify from "remark-stringify";
import { unified } from "unified";

import { splitFrontMatter } from "../src/editor/front-matter";

type MarkdownNode = {
  type: string;
  value?: string;
  children?: MarkdownNode[];
};

const fixtureDirectory = join(process.cwd(), "tests", "fixtures", "cathedral-bazaar");
const fixturePath = join(fixtureDirectory, "the-cathedral-and-the-bazaar.md");
const markdown = readFileSync(fixturePath, "utf8");
const notice = readFileSync(join(fixtureDirectory, "NOTICE.md"), "utf8");

let pass = 0;
let fail = 0;

function testCase(name: string, body: () => void): void {
  try {
    body();
    pass++;
    console.log(`  PASS ${name}`);
  } catch (error) {
    fail++;
    console.log(`  FAIL ${name}`);
    console.log(`       ${error instanceof Error ? error.message : String(error)}`);
  }
}

function assertValue(value: unknown, message: string): asserts value {
  if (!value) throw new Error(message);
}

function countNodes(node: MarkdownNode, type: string): number {
  return (node.type === type ? 1 : 0) + (node.children ?? []).reduce(
    (total, child) => total + countNodes(child, type),
    0,
  );
}

function textOf(node: MarkdownNode): string {
  if (node.value !== undefined) return node.value;
  return (node.children ?? []).map(textOf).join("");
}

const split = splitFrontMatter(markdown);
const body = split.body2;
const parser = unified().use(remarkParse).use(remarkGfm);
const roundtrip = unified()
  .use(remarkParse)
  .use(remarkGfm)
  .use(remarkStringify, { bullet: "-", rule: "-" });
const tree = parser.parse(body) as MarkdownNode;

console.log("\n[The Cathedral and the Bazaar fixture]");

testCase("fixture provenance and redistribution terms are recorded", () => {
  assertValue(notice.includes("Eric Steven Raymond"), "missing author");
  assertValue(notice.includes("version 3.0"), "missing document version");
  assertValue(notice.includes("Open Publication License, version 2.0"), "missing license");
  assertValue(notice.includes("cathedral-bazaar.xml"), "missing canonical source");
  assertValue(notice.includes("title, author, version, copyright, license, and abstract"), "missing preserved metadata note");
});

testCase("fixture is the complete official article", () => {
  const digest = createHash("sha256").update(markdown).digest("hex");
  assertValue(
    digest === "4b43988daf8f32d4b3685cc9b45704ac6938dd65ce3a8c7e2806fa13c6f8fa5b",
    `fixture changed unexpectedly: ${digest}`,
  );
  assertValue(split.frontMatter !== null, "missing preserved metadata front matter");
  assertValue(body.startsWith("# The Cathedral and the Bazaar\n"), "missing title");
  assertValue(body.includes("> **Abstract**"), "missing original abstract");
  assertValue(countNodes(tree, "heading") === 16, "article must contain 16 top-level sections");
  assertValue(countNodes(tree, "paragraph") === 290, "article body is truncated");
  assertValue(countNodes(tree, "blockquote") === 23, "article quotations are missing");
  assertValue(countNodes(tree, "link") >= 20, "article links are missing");
});

testCase("the source formatting survives the DocBook conversion", () => {
  const headings = tree.children
    ?.filter((node) => node.type === "heading")
    .map(textOf);
  const expectedHeadings = [
    "The Cathedral and the Bazaar",
    "The Mail Must Get Through",
    "The Importance of Having Users",
    "Release Early, Release Often",
    "How Many Eyeballs Tame Complexity",
    "When Is a Rose Not a Rose?",
    "Popclient becomes Fetchmail",
    "Fetchmail Grows Up",
    "A Few More Lessons from Fetchmail",
    "Necessary Preconditions for the Bazaar Style",
    "The Social Context of Open-Source Software",
    "On Management and the Maginot Line",
    "Epilog: Netscape Embraces the Bazaar",
    "Notes",
    "Bibliography",
    "Acknowledgements",
  ];
  assertValue(
    JSON.stringify(headings) === JSON.stringify(expectedHeadings),
    "heading structure or title text changed",
  );
  assertValue(countNodes(tree, "emphasis") === 54, "emphasis formatting changed");
  assertValue(countNodes(tree, "link") === 37, "link formatting changed");
  assertValue(countNodes(tree, "strong") === 1, "abstract title formatting changed");
  assertValue(countNodes(tree, "blockquote") === 23, "quotation formatting changed");
  assertValue(countNodes(tree, "list") === 3, "list structure changed");
  assertValue(countNodes(tree, "listItem") === 13, "list item structure changed");
  assertValue(countNodes(tree, "inlineCode") === 2, "inline code formatting changed");
  assertValue(countNodes(tree, "html") === 20, "original inline HTML changed");
});

testCase("the bazaar easter egg is present in the rendered source", () => {
  const easterEgg = "Given enough eyeballs, all bugs are shallow.";
  assertValue(markdown.includes(easterEgg), "the hidden Linus's Law sentence is missing");
  assertValue(
    markdown.includes(
      "Every good work of software starts by scratching a developer's personal itch.",
    ),
    "the first lesson is missing",
  );
});

testCase("the full article survives a GFM parse and serialization pass", () => {
  const output = roundtrip.processSync(body).toString();
  const reparsed = parser.parse(output) as MarkdownNode;
  assertValue(countNodes(reparsed, "heading") === 16, "roundtrip lost headings");
  assertValue(
    countNodes(reparsed, "paragraph") === countNodes(tree, "paragraph"),
    "roundtrip changed the paragraph count",
  );
  assertValue(output.length >= body.length * 0.98, "roundtrip lost substantial content");
  assertValue(output.includes("Given enough eyeballs, all bugs are shallow."), "roundtrip lost easter egg");
});

console.log(`\nPassed ${pass}, failed ${fail}`);
if (fail > 0) process.exitCode = 1;
