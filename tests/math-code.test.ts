/** `math` / `latex` / `tex` 围栏的语义与 Pandoc 转换。 */

import { 数学代码块转公式, 是数学代码语言 } from "../src/editor/math-code";

let 过 = 0;
let 败 = 0;

function 测(name: string, body: () => void): void {
  try {
    body();
    过 += 1;
    console.log(`  ✔ ${name}`);
  } catch (error) {
    败 += 1;
    console.log(`  ✘ ${name}`);
    console.log(`      ${error instanceof Error ? error.message : String(error)}`);
  }
}

function 真(value: unknown, message: string): asserts value {
  if (!value) throw new Error(message);
}

console.log("\n【数学围栏代码块】");

测("三种数学语言别名", () => {
  真(是数学代码语言("math"), "math");
  真(是数学代码语言("LaTeX"), "大小写");
  真(是数学代码语言(" tex "), "空白");
  真(!是数学代码语言("javascript"), "普通代码不能误判");
});

测("反引号围栏转成 Pandoc 公式", () => {
  const source = "前文\n\n```math\nE=mc^2\n```\n\n后文";
  const output = 数学代码块转公式(source);
  真(output.includes("$$\nE=mc^2\n$$"), "未生成公式块");
  真(output.includes("前文") && output.includes("后文"), "正文丢失");
  真(!output.includes("```math"), "围栏没有被移除");
});

测("波浪线围栏与多行公式", () => {
  const source = "~~~latex\n\\frac{a}{b}\n+ c\n~~~";
  真(数学代码块转公式(source) === "$$\n\\frac{a}{b}\n+ c\n$$", "多行转换不正确");
});

测("未闭合围栏保持原样，不吞掉后续正文", () => {
  const source = "```tex\nx^2\n\n后面仍然是正文";
  真(数学代码块转公式(source) === source, "未闭合围栏不应转换");
});

测("普通代码围栏不动", () => {
  const source = "```js\nconst x = 1;\n```";
  真(数学代码块转公式(source) === source, "普通代码块被误改");
});

console.log(`\n通过 ${过} 条，失败 ${败} 条`);
if (败 > 0) process.exitCode = 1;
