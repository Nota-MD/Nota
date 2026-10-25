/** `math` / `latex` / `tex` 围栏的语义与 Pandoc 转换。 */

import { numberLearnCodeBlockConvertCommonStyle, isMathCodeLanguage } from "../src/editor/math-code";
import { readFileSync } from "node:fs";

let pass = 0;
let fail = 0;

function testCase(name: string, body: () => void): void {
  try {
    body();
    pass += 1;
    console.log(`  ✔ ${name}`);
  } catch (error) {
    fail += 1;
    console.log(`  ✘ ${name}`);
    console.log(`      ${error instanceof Error ? error.message : String(error)}`);
  }
}

function assertValue(value: unknown, message: string): asserts value {
  if (!value) throw new Error(message);
}

console.log("\n【数学围栏代码块】");

testCase("三种数学语言别名", () => {
  assertValue(isMathCodeLanguage("math"), "math");
  assertValue(isMathCodeLanguage("LaTeX"), "大小写");
  assertValue(isMathCodeLanguage(" tex "), "空白");
  assertValue(!isMathCodeLanguage("javascript"), "普通代码不能误判");
});

testCase("反引号围栏转成 Pandoc 公式", () => {
  const source = "前文\n\n```math\nE=mc^2\n```\n\n后文";
  const output = numberLearnCodeBlockConvertCommonStyle(source);
  assertValue(output.includes("$$\nE=mc^2\n$$"), "未生成公式块");
  assertValue(output.includes("前文") && output.includes("后文"), "正文丢失");
  assertValue(!output.includes("```math"), "围栏没有被移除");
});

testCase("波浪线围栏与多行公式", () => {
  const source = "~~~latex\n\\frac{a}{b}\n+ c\n~~~";
  assertValue(numberLearnCodeBlockConvertCommonStyle(source) === "$$\n\\frac{a}{b}\n+ c\n$$", "多行转换不正确");
});

testCase("未闭合围栏保持原样，不吞掉后续正文", () => {
  const source = "```tex\nx^2\n\n后面仍然是正文";
  assertValue(numberLearnCodeBlockConvertCommonStyle(source) === source, "未闭合围栏不应转换");
});

testCase("普通代码围栏不动", () => {
  const source = "```js\nconst x = 1;\n```";
  assertValue(numberLearnCodeBlockConvertCommonStyle(source) === source, "普通代码块被误改");
});

testCase("数学块只在选区落进本块时保持源码区展开", () => {
  const source = readFileSync(`${process.cwd()}/src/editor/code-block.ts`, "utf8");
  assertValue(source.includes("selection.from >= pos"), "没有检查选区起点");
  assertValue(source.includes("selection.to <= pos + node.nodeSize"), "没有检查选区终点");
  assertValue(!source.includes("wrap.contains(document.activeElement) || view.hasFocus()"), "仍在用全局编辑器焦点判断");
});

console.log(`\n通过 ${pass} 条，失败 ${fail} 条`);
if (fail > 0) process.exitCode = 1;
