import { readFileSync } from "node:fs";

let pass = 0;
function test(name: string, body: () => void): void {
  try {
    body();
    pass++;
    console.log(`  ✔ ${name}`);
  } catch (e) {
    console.log(`  ✘ ${name}\n      ${e instanceof Error ? e.message : String(e)}`);
    process.exitCode = 1;
  }
}

const contributing = readFileSync("CONTRIBUTING.md", "utf8");
const pr = readFileSync(".github/pull_request_template.md", "utf8");
const agents = readFileSync("AGENTS.md", "utf8");

test("明确欢迎 AI 贡献", () => {
  if (!contributing.includes("明确支持使用 AI")) throw new Error("CONTRIBUTING 缺少明确欢迎");
  if (!agents.includes("明确支持 AI 贡献")) throw new Error("AGENTS 缺少硬规则");
});

test("提交者必须亲自完整测试", () => {
  if (!contributing.includes("提交者本人完整测试")) throw new Error("CONTRIBUTING 缺少本人测试");
  if (!pr.includes("提交者亲自测试")) throw new Error("PR 模板缺少亲自测试栏");
  if (!pr.includes("AI 说测试过")) throw new Error("PR 模板没有排除 AI 代测");
});

test("PR 模板要求 AI 范围与许可证责任", () => {
  if (!pr.includes("AI 使用声明")) throw new Error("缺少 AI 声明");
  if (!pr.includes("许可证")) throw new Error("缺少许可证确认");
});

console.log(`通过 ${pass} 条`);
