/**
 * 右侧插件栏那条把手**能被测的那一半**（`ui/DockResizer.tsx::夹右栏宽`）。
 *
 * ⚠️ 拖动本身要开窗（指针捕获、量右缘、写 CSS 变量），无头测不了——但**夹边界**
 * 是纯函数，而它恰好是"拖坏了找不到回来"的唯一防线：拖成 0 宽等于把这一栏弄丢，
 * 而丢的方式是**看不见**。所以这一条必须钉住。
 */
import { clampRightBarWidth, rightBarWidthMostLarge, rightBarWidthMostSmall, rightBarWidthDefault } from "@/ui/DockResizer";

let pass = 0;
let fail = 0;
function equal(actual: unknown, expected: unknown, description: string): void {
  if (actual !== expected) throw new Error(`${description}：期望 ${String(expected)}，实际 ${String(actual)}`);
}
function testCase(name: string, body3: () => void): void {
  try { body3(); pass++; console.log(`  ✔ ${name}`); }
  catch (e) { fail++; console.log(`  ✘ ${name}\n      ${e instanceof Error ? e.message : String(e)}`); }
}

testCase("区间内的原样通过，并且取整", () => {
  equal(clampRightBarWidth(300), 300, "整数");
  equal(clampRightBarWidth(300.4), 300, "向下取整");
  equal(clampRightBarWidth(300.6), 301, "向上取整");
});
testCase("比最小还小就夹到最小、比最大还大就夹到最大", () => {
  equal(clampRightBarWidth(1), rightBarWidthMostSmall, "过小");
  equal(clampRightBarWidth(-999), rightBarWidthMostSmall, "负数");
  equal(clampRightBarWidth(99999), rightBarWidthMostLarge, "过大");
});
testCase("不是数就退回出厂值", () => {
  for (const strange of [NaN, Infinity, -Infinity]) equal(clampRightBarWidth(strange), rightBarWidthDefault, String(strange));
});
testCase("出厂值与另外两处必须同值", () => {
  equal(rightBarWidthDefault, 260, "默认宽");
  if (!(rightBarWidthMostSmall < rightBarWidthDefault && rightBarWidthDefault < rightBarWidthMostLarge)) throw new Error("区间方向反了");
});

console.log(`通过 ${pass} 条，失败 ${fail} 条`);
if (fail) process.exitCode = 1;
