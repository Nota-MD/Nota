/**
 * `src/ui/useModalTrap.ts` 焦点陷阱**纯逻辑**（`陷阱落点`）的可运行测试集。
 * 2026-10-04 写，与那个文件同批落地（`docs/07` backlog 第 50 项）。
 *
 * # 跑法（不装任何包）
 *
 * ```sh
 * npx esbuild tests/modal-trap.test.ts --bundle --platform=node --format=esm \
 *   --outfile=/tmp/nota-测试/modal-trap.mjs
 * node /tmp/nota-测试/modal-trap.mjs
 * ```
 *
 * # 这份测试盯的是什么
 *
 * 两道闸里**纯的那一半**（Tab 首尾互跳怎么算）。判定的边界情形正是最容易
 * 写错的地方——与 `useMenuRovingFocus.ts` 把 `findNextEnabled` 拎出来是
 * 同一个理由：
 *
 * - 面板里**一个格子都没有**：按了等于没按（拦下但不挪）；
 * - 焦点**在面板外**（`null`、容器自己、页面里别的东西）：一律拉回
 *   第一格（Tab）／最后一格（Shift+Tab）——这是"焦点先跑出去再被拽回"
 *   那条路的入口，不接住它键盘用户就没法走动；
 * - 首尾**两个方向都夹住**：只拦一个方向，另一个照样漏（第 50 项的原话）；
 * - 焦点在中间：**自然移动**——不拦。拦了就得自己实现一遍整条漫游。
 *
 * # ⚠️ 这份测试**证明不了**什么
 *
 * - **钩子真的挂上监听、真的 focus 了那个格子**没验：那要真 DOM ＋ 真
 *   事件循环（本仓没有 jsdom，`可聚焦` 的 `offsetParent` 过滤也没有）。
 *   接线本身由 `npx tsc --noEmit` 与开窗目检兜着（`docs/06` §5 的本批那格）。
 * - **`可聚焦` 的过滤规则**（藏起来的格子不算）没验：那是 DOM 查询的活。
 * - **真浏览器里 Tab 的默认行为**（焦点挪到下一个可聚焦元素）没验——
 *   这里验的是"该不该拦、拦下后送到哪儿"。
 */

/* ── 最小工装（与 `toc.test.ts` 同一套，本仓没有测试框架）──────────────── */

let passed = 0;
let failure = 0;
const failureList: string[] = [];
let currentGroup = "";

function group(name3: string): void {
  currentGroup = name3;
  console.log(`\n── ${name3} ${"─".repeat(Math.max(0, 56 - name3.length))}`);
}

function testCase(name: string, body3: () => void): void {
  try {
    body3();
    passed++;
    console.log(`  ✔ ${name}`);
  } catch (e) {
    failure++;
    failureList.push(`${currentGroup} / ${name}`);
    console.log(`  ✘ ${name}`);
    console.log(`      ${e instanceof Error ? e.message : String(e)}`);
  }
}

function equal(actual: unknown, expected: unknown, description: string): void {
  const a = JSON.stringify(actual);
  const b = JSON.stringify(expected);
  if (a !== b) throw new Error(`${description}：期望 ${b}，实际 ${a}`);
}

function assertValue(value2: boolean, description: string): void {
  if (!value2) throw new Error(description);
}

/** 假格子：`陷阱落点` 只比较身份、读不出别的，一个普通对象就够了。 */
function cell2(i: number): HTMLElement {
  return { id: `格${i}` } as unknown as HTMLElement;
}

/* ── 被测 ─────────────────────────────────────────────────────────────── */

import { pitTrapDropPoint } from "../src/ui/useModalTrap";

/* ── 一、没有格子 ─────────────────────────────────────────────────────── */

group("一、面板里一个格子都没有");

testCase("Tab 与 Shift+Tab 都是「原地不动」", () => {
  equal(pitTrapDropPoint([], null, false).action, "原地不动", "正向");
  equal(pitTrapDropPoint([], null, true).action, "原地不动", "反向");
});

/* ── 二、焦点在面板外 ─────────────────────────────────────────────────── */

group("二、焦点在面板外（含容器自己）");

testCase("焦点为 null：Tab 拉回第一格、Shift+Tab 拉回最后一格", () => {
  const cell = [cell2(0), cell2(1), cell2(2)];
  const determineFixed = pitTrapDropPoint(cell, null, false);
  equal(determineFixed.action, "送到", "送回面板");
  assertValue(determineFixed.action === "送到" && determineFixed.target === cell[0], "正向送第一格");
  const reverseDetermineFixed = pitTrapDropPoint(cell, null, true);
  assertValue(reverseDetermineFixed.action === "送到" && reverseDetermineFixed.target === cell[2], "反向送最后一格");
});

testCase("焦点是面板容器自己（tabIndex=-1 那颗）：按「从外面进来」算", () => {
  const container = cell2(9);
  const cell = [cell2(0), cell2(1)];
  assertValue(pitTrapDropPoint(cell, container, false).action === "送到", "容器不在格子里");
});

testCase("焦点在页面里别的东西上：拉回", () => {
  const cell = [cell2(0), cell2(1)];
  const externalSurface = cell2(7);
  assertValue(pitTrapDropPoint(cell, externalSurface, false).action === "送到", "正向外人送回");
  assertValue(pitTrapDropPoint(cell, externalSurface, true).action === "送到", "反向外人送回");
});

/* ── 三、首尾互跳 ─────────────────────────────────────────────────────── */

group("三、首尾互跳（两个方向都夹住）");

testCase("第一格 Shift+Tab → 最后一格", () => {
  const cell = [cell2(0), cell2(1), cell2(2)];
  const determineFixed = pitTrapDropPoint(cell, cell[0]!, true);
  equal(determineFixed.action, "送到", "绕到尾部");
  assertValue(determineFixed.action === "送到" && determineFixed.target === cell[2]!, "目标就是最后一格");
});

testCase("最后一格 Tab → 第一格", () => {
  const cell = [cell2(0), cell2(1), cell2(2)];
  const determineFixed = pitTrapDropPoint(cell, cell[2]!, false);
  equal(determineFixed.action, "送到", "绕回头部");
  assertValue(determineFixed.action === "送到" && determineFixed.target === cell[0]!, "目标就是第一格");
});

testCase("只有一颗格子：两个方向都送回它自己", () => {
  const cell = [cell2(0)];
  assertValue(pitTrapDropPoint(cell, cell[0]!, false).action === "送到", "正向");
  assertValue(pitTrapDropPoint(cell, cell[0]!, true).action === "送到", "反向");
});

/* ── 四、格子中间 ─────────────────────────────────────────────────────── */

group("四、格子中间：自然移动（不拦）");

testCase("中间的格子往两个方向都让浏览器自己挪", () => {
  const cell = [cell2(0), cell2(1), cell2(2)];
  equal(pitTrapDropPoint(cell, cell[1]!, false).action, "自然移动", "正向");
  equal(pitTrapDropPoint(cell, cell[1]!, true).action, "自然移动", "反向");
});

testCase("第一格按 Tab（还有下一格）也是自然移动", () => {
  const cell = [cell2(0), cell2(1)];
  equal(pitTrapDropPoint(cell, cell[0]!, false).action, "自然移动", "首格正向不该绕");
});

/* ── 收尾 ─────────────────────────────────────────────────────────────── */

console.log(`\n${"═".repeat(56)}`);
console.log(`通过 ${passed}，失败 ${failure}`);
if (failure > 0) {
  console.log(`失败清单：\n  ${failureList.join("\n  ")}`);
  process.exit(1);
}
