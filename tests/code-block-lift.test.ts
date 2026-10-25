/**
 * 代码块开头 Backspace 的节点转换判据。
 *
 * 这里只管纯节点：非空代码块逐行变成正文段落，空代码块变成一个空段落，
 * 所有代码字符都保留。真正的按键链与光标落点在开窗测试里验。
 */

import { Schema } from "@milkdown/kit/prose/model";

import { liftCodeBlockToParagraphs } from "../src/editor/code-block-lift";

const schema = new Schema({
  nodes: {
    doc: { content: "block+" },
    paragraph: { group: "block", content: "inline*" },
    code_block: { group: "block", content: "text*", marks: "" },
    text: { group: "inline" },
  },
});

let pass = 0;
let fail = 0;

function testCase(name: string, body3: () => void): void {
  try {
    body3();
    pass++;
    console.log(`  ✔ ${name}`);
  } catch (error) {
    fail++;
    console.log(`  ✘ ${name}`);
    console.log(`      ${error instanceof Error ? error.message : String(error)}`);
  }
}

function equal(actual: unknown, expected: unknown, description: string): void {
  if (actual !== expected) {
    throw new Error(`${description}：期望 ${JSON.stringify(expected)}，实际 ${JSON.stringify(actual)}`);
  }
}

function codeBlock(text3: string) {
  return schema.nodes.code_block!.create(null, text3 ? schema.text(text3) : undefined);
}

console.log("\n【代码块拆回正文】");

testCase("非空代码块按行拆成段落，内容逐字保留", () => {
  const result2 = liftCodeBlockToParagraphs(codeBlock("fn main() {\n    println!(\"hi\");\n}"), schema);
  if (!result2) throw new Error("应当能拆");
  equal(result2.length, 3, "段落数");
  equal(result2.map((node) => node.type.name).join(","), "paragraph,paragraph,paragraph", "节点类型");
  equal(result2.map((node) => node.textContent).join("\n"), "fn main() {\n    println!(\"hi\");\n}", "内容");
});

testCase("空代码块变成一个空段落", () => {
  const result2 = liftCodeBlockToParagraphs(codeBlock(""), schema);
  if (!result2) throw new Error("应当能拆");
  equal(result2.length, 1, "段落数");
  equal(result2[0]?.content.size, 0, "空段落");
});

testCase("空白行保留，不把相邻代码行粘起来", () => {
  const result2 = liftCodeBlockToParagraphs(codeBlock("a\n\nb"), schema);
  if (!result2) throw new Error("应当能拆");
  equal(result2.map((node) => node.textContent).join("|"), "a||b", "段落内容");
});

testCase("不是代码块时不做转换", () => {
  equal(liftCodeBlockToParagraphs(schema.nodes.paragraph!.create(), schema), null, "普通段落");
});

console.log(`\n${"─".repeat(64)}`);
console.log(`通过 ${pass} 条，失败 ${fail} 条`);
if (fail) process.exitCode = 1;
