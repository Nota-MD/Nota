import { fromMarkdown } from "mdast-util-from-markdown";
import { mathFromMarkdown } from "mdast-util-math";
import { math } from "micromark-extension-math";
import { normalizeInlineDelimiterTree } from "../src/editor/inline-delimiter-tree";

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

function equal(actual: unknown, expected: unknown, label: string): void {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw new Error(`${label}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
  }
}

function inlineTree(source: string, withMath = false) {
  const tree = fromMarkdown(
    source,
    withMath
      ? { extensions: [math()], mdastExtensions: [mathFromMarkdown()] }
      : undefined,
  );
  normalizeInlineDelimiterTree(tree, source);
  return tree.children[0]?.children ?? [];
}

console.log("\n【行内分隔符 AST】");

testCase("完整解析路径使用外层强标记", () => {
  equal(
    inlineTree("**Tauri 2*. Approach **Typora** spiritually.").map((node) => ({
      type: node.type,
      value: "value" in node ? node.value : undefined,
      children: "children" in node ? node.children.map((child) => child.value) : undefined,
    })),
    [
      { type: "strong", value: undefined, children: ["Tauri 2*. Approach "] },
      { type: "text", value: "Typora** spiritually.", children: undefined },
    ],
    "outer strong tree",
  );
});

testCase("无效高亮不降级成其它格式", () => {
  equal(
    inlineTree("==1=").map((node) => node.type),
    ["text"],
    "literal paragraph",
  );
});

testCase("转义星号不参与后续配对", () => {
  equal(
    inlineTree("*\\*Typora**").map((node) => ({
      type: node.type,
      value: "value" in node ? node.value : undefined,
    })),
    [
      { type: "text", value: "*" },
      { type: "notaEscape", value: "*" },
      { type: "text", value: "Typora**" },
    ],
    "escaped literal",
  );
});

testCase("三星号保留粗斜体嵌套", () => {
  equal(
    inlineTree("***1***").map((node) => ({
      type: node.type,
      children: "children" in node ? node.children.map((child) => child.type) : undefined,
    })),
    [{ type: "strong", children: ["emphasis"] }],
    "nested strong/emphasis",
  );
});

testCase("加粗内部的公式不被原始字符串重建吃掉", () => {
  const tree = inlineTree("**a$x$b**", true);
  equal(
    tree.map((node) => ({
      type: node.type,
      children: node.type === "strong" && "children" in node
        ? node.children.map((child) => child.type)
        : undefined,
    })),
    [{ type: "strong", children: ["text", "inlineMath", "text"] }],
    "inline math inside strong",
  );
});

testCase("强调容器里的链接、行内代码和图片同样整段跳过", () => {
  for (const source of [
    "**a [链接](https://example.com) b**",
    "**a `code` b**",
    "**a ![图](image.png) b**",
  ]) {
    const tree = inlineTree(source);
    equal(tree.map((node) => node.type), ["strong"], `${source} must remain untouched`);
    const children = "children" in tree[0]! ? tree[0]!.children : [];
    equal(
      children.some((child) => child.type !== "text"),
      true,
      `${source} must keep its non-text descendant`,
    );
  }
});

console.log(`\n通过 ${pass} 条，失败 ${fail} 条`);
if (fail > 0) process.exitCode = 1;
