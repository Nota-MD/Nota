/** 围栏语言补全的纯逻辑：识别 ``` 后的查询并做前缀候选。 */

import { 围栏语言查询, 围栏语言候选 } from "../src/editor/fence-lang";

let 过 = 0;
let 败 = 0;

function 等(实际: unknown, 期望: unknown, 说明: string): void {
  if (实际 !== 期望) {
    throw new Error(`${说明}：期望 ${JSON.stringify(期望)}，实际 ${JSON.stringify(实际)}`);
  }
}

function 测(名: string, 体: () => void): void {
  try {
    体();
    过++;
    console.log(`  ✔ ${名}`);
  } catch (e) {
    败++;
    console.log(`  ✘ ${名}\n      ${e instanceof Error ? e.message : String(e)}`);
  }
}

console.log("\n【围栏语言补全】");

测("只识别行首三反引号后的语言查询", () => {
  等(围栏语言查询("```"), "", "空查询");
  等(围栏语言查询("```mat"), "mat", "mat");
  等(围栏语言查询("```c++"), "c++", "带符号语言名");
  等(围栏语言查询("前文 ```mat"), null, "不在行首");
  等(围栏语言查询("```mat 后文"), null, "查询后还有正文");
});

测("mat 按前缀给出三行，排除包含匹配的长尾", () => {
  const 候选 = 围栏语言候选(
    "mat",
    ["math", "mathematica", "matlab", "mathml", "asmatmel", "latex"],
    (名) => [名],
  );
  等(候选.join(","), "math,mathematica,matlab", "候选与顺序");
});

测("别名命中仍返回代表语言，完全命中排最前", () => {
  const 候选 = 围栏语言候选(
    "tex",
    ["math", "textile", "latex"],
    (名) =>
      名 === "math" ? ["math", "latex", "tex"] : 名 === "latex" ? ["latex"] : [名],
  );
  等(候选[0], "math", "tex 别名对应的代表语言排第一");
});

测("空查询不给候选，避免刚敲 ``` 就弹整张表", () => {
  等(围栏语言候选("", ["math", "matlab"], (名) => [名]).length, 0, "空查询");
});

console.log(`\n通过 ${过} 条，失败 ${败} 条`);
if (败 > 0) process.exitCode = 1;
