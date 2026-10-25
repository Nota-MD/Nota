/** 模式切换时要优先恢复刚离开的滚动位置，而不是打开文档时的旧位置。 */

import { readFileSync } from "node:fs";
import { readElementRollActionCompareExample } from "../src/editor/scroll-into-view";

const source = readFileSync("src/ui/EditorPane.tsx", "utf8");
let passed = 0;
let failure = 0;

function testCase(name3: string, body3: () => void): void {
  try {
    body3();
    passed += 1;
    console.log(`  ✔ ${name3}`);
  } catch (error) {
    failure += 1;
    console.log(`  ✘ ${name3}`);
    console.log(`      ${error instanceof Error ? error.message : String(error)}`);
  }
}

function assertValue(value2: unknown, description: string): asserts value2 {
  if (!value2) throw new Error(description);
}

console.log("\n【模式切换滚动位置】");

testCase("旧实例销毁前记录当前滚动比例", () => {
  assertValue(
    source.includes("const splitReplaceBeforePosition = readRollActionCompareExample(mount)"),
    "清理阶段没有读当前滚动比例",
  );
  assertValue(
    source.includes("splitReplaceRollActionRef.current = splitReplaceBeforePosition"),
    "当前比例没有保存给下一次实例",
  );
});

testCase("新实例优先使用切换前比例，再回落到会话位置", () => {
  assertValue(
    source.includes("splitReplaceRollActionRef.current ?? initialStartRollActionRef.current"),
    "没有建立切换位置对会话位置的优先级",
  );
});

testCase("恢复计划只消费一次", () => {
  assertValue(
    source.includes("splitReplaceRollActionRef.current = null"),
    "切换位置没有在新实例接手后清空",
  );
});

testCase("滚动比例从事件目标直接读取，并在动画帧内合并", () => {
  assertValue(readElementRollActionCompareExample({ scrollHeight: 200, clientHeight: 100, scrollTop: 50 }) === 0.5, "比例计算错误");
  assertValue(readElementRollActionCompareExample({ scrollHeight: 100, clientHeight: 100, scrollTop: 0 }) === 0, "短文档应给 0");
  assertValue(source.includes("requestAnimationFrame"), "滚动记账没有按动画帧合并");
  assertValue(
    source.includes("readElementRollActionCompareExample(currentContainer)"),
    "滚动记账仍在重复反查滚动容器",
  );
});

if (failure > 0) process.exit(1);
console.log(`\n${passed} passed, 0 failed`);
