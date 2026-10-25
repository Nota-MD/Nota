/** 围栏语言补全的纯逻辑：识别 ``` 后的查询并做前缀候选。 */

import {
  encloseBarLanguageQuery,
  encloseBarLanguageCandidate,
  encloseBarLanguageKeypress,
} from "../src/editor/fence-lang";

let pass = 0;
let fail = 0;

function equal(actual: unknown, expected: unknown, description: string): void {
  if (actual !== expected) {
    throw new Error(`${description}：期望 ${JSON.stringify(expected)}，实际 ${JSON.stringify(actual)}`);
  }
}

function testCase(name3: string, body3: () => void): void {
  try {
    body3();
    pass++;
    console.log(`  ✔ ${name3}`);
  } catch (e) {
    fail++;
    console.log(`  ✘ ${name3}\n      ${e instanceof Error ? e.message : String(e)}`);
  }
}

console.log("\n【围栏语言补全】");

testCase("只识别行首三反引号后的语言查询", () => {
  equal(encloseBarLanguageQuery("```"), "", "空查询");
  equal(encloseBarLanguageQuery("```mat"), "mat", "mat");
  equal(encloseBarLanguageQuery("```c++"), "c++", "带符号语言名");
  equal(encloseBarLanguageQuery("前文 ```mat"), null, "不在行首");
  equal(encloseBarLanguageQuery("```mat 后文"), null, "查询后还有正文");
});

testCase("mat 按前缀给出三行，排除包含匹配的长尾", () => {
  const candidate = encloseBarLanguageCandidate(
    "mat",
    ["math", "mathematica", "matlab", "mathml", "asmatmel", "latex"],
    (name3) => [name3],
  );
  equal(candidate.join(","), "math,mathematica,matlab", "候选与顺序");
});

testCase("别名命中仍返回代表语言，完全命中排最前", () => {
  const candidate = encloseBarLanguageCandidate(
    "tex",
    ["math", "textile", "latex"],
    (name3) =>
      name3 === "math" ? ["math", "latex", "tex"] : name3 === "latex" ? ["latex"] : [name3],
  );
  equal(candidate[0], "math", "tex 别名对应的代表语言排第一");
});

testCase("空查询不给候选，避免刚敲 ``` 就弹整张表", () => {
  equal(encloseBarLanguageCandidate("", ["math", "matlab"], (name3) => [name3]).length, 0, "空查询");
});

testCase("候选显示时 Enter / Tab / Space 提交，方向键选择，Escape 关闭", () => {
  equal(encloseBarLanguageKeypress("Enter", false, 13), "commit", "Enter");
  equal(encloseBarLanguageKeypress("Tab", false, 9), "commit", "Tab");
  equal(encloseBarLanguageKeypress(" ", false, 32), "commit", "Space");
  equal(encloseBarLanguageKeypress("ArrowDown", false, 40), "next", "向下");
  equal(encloseBarLanguageKeypress("ArrowUp", false, 38), "previous", "向上");
  equal(encloseBarLanguageKeypress("Escape", false, 27), "close", "Escape");
  equal(encloseBarLanguageKeypress("Unidentified", false, 13), "commit", "WebKit 丢失 key 时仍认 Enter");
});

testCase("输入法合成中的 Enter 留给输入法", () => {
  equal(encloseBarLanguageKeypress("Enter", true, 13), "composition", "isComposing");
  equal(encloseBarLanguageKeypress("Enter", false, 229), "composition", "旧 WebKit 的 229");
});

console.log(`\n通过 ${pass} 条，失败 ${fail} 条`);
if (fail > 0) process.exitCode = 1;
