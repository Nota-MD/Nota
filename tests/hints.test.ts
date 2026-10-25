/**
 * `src/ui/hints.ts` 那张**提示注册表**的判据。
 *
 * 跑法（不装任何包）：
 *
 * ```sh
 * cd <仓库>
 * npx esbuild tests/hints.test.ts --bundle --platform=node --format=esm \
 *   --outfile=/tmp/nota-hints/hints.test.mjs && node /tmp/nota-hints/hints.test.mjs
 * ```
 *
 * # 这份测试为什么存在
 *
 * 用户 2026-10-06 的要求有两半：① 提示要能"不再显示"；② **「提示要确定——如果说
 * 出现了那些情况才显示提示」**。第①半靠 `该显示吗` 那三条规则钉住；第②半靠
 * **"每一条都必须写清触发条件"**钉住——表里那条 `条件` 空了，这一份就红。
 *
 * ⚠️ 它**证明不了**：提示真的出现在对的时机、屏幕上长什么样、点了"不再显示"之后
 * 那个值有没有落盘。那些是接线与开窗目检的事。
 */

import { noticeTable, noticeidPlural, findNotice, shouldShow } from "../src/ui/hints";

/* ── 工装（与 `mark-hint.test.ts` 同一套长相）─────────────────────────── */

let pass = 0;
let fail = 0;
const failed: string[] = [];

function testCase(name: string, body3: () => void): void {
  try {
    body3();
    pass++;
    console.log(`  ✔ ${name}`);
  } catch (e) {
    fail++;
    failed.push(name);
    console.log(`  ✘ ${name}`);
    console.log(`      ${e instanceof Error ? e.message : String(e)}`);
  }
}

function group(name3: string): void {
  console.log(`\n【${name3}】`);
}

function equal(actual: unknown, expected: unknown, description: string): void {
  if (actual !== expected) {
    throw new Error(`${description}：期望 ${JSON.stringify(expected)}，实际 ${JSON.stringify(actual)}`);
  }
}

function assertValue(condition: unknown, description: string): void {
  if (!condition) throw new Error(description);
}

const without = new Set<string>();

/* ── 用例 ─────────────────────────────────────────────────────────────── */

group("一、这张表本身是自洽的");

testCase("id 不重复、不空", () => {
  const plural = noticeidPlural();
  equal(new Set(plural).size, plural.length, "有重复的 id（落盘的键会互相踩）");
  for (const id of plural) assertValue(id.trim().length > 0, "有空的 id");
});

testCase("⚠️ 每一条都写清了触发条件（用户那条「提示要确定」的机器判据）", () => {
  for (const item4 of noticeTable) {
    assertValue(item4.condition.trim().length >= 8, `${item4.id} 的触发条件太短/空着——写清楚"什么情况下才出现"`);
  }
});

testCase("类型只有那两种，默认值是布尔", () => {
  for (const item4 of noticeTable) {
    assertValue(item4.type === "当场" || item4.type === "首次", `${item4.id} 的类型不认得：${item4.type}`);
    equal(typeof item4.default, "boolean", `${item4.id} 的默认值`);
  }
});

testCase("每条的文案都取得到，而且非空（⚠️ 是函数，不是模块级求值）", () => {
  for (const item4 of noticeTable) {
    const character2 = item4.copy2();
    equal(typeof character2, "string", `${item4.id} 的文案`);
    assertValue(character2.trim().length > 0, `${item4.id} 的文案是空的`);
  }
});

group("二、`该显示吗` 那三条规则");

const WhenScene = noticeTable.find((item4) => item4.type === "当场");
const firstCount = noticeTable.find((item4) => item4.type === "首次");

testCase("上下文不成立 → 不显示（哪怕没静音、没看过）", () => {
  for (const item4 of noticeTable) {
    equal(shouldShow({ id: item4.id, staticSound: without, seePass2: without, contextMatches: false }), false, item4.id);
  }
});

testCase("静音了 → 不显示（⚠️ 这是「不再显示」唯一的落点）", () => {
  for (const item4 of noticeTable) {
    equal(
      shouldShow({ id: item4.id, staticSound: new Set([item4.id]), seePass2: without, contextMatches: true }),
      false,
      item4.id,
    );
  }
});

testCase("「首次」型看过一次就不再显示", () => {
  assertValue(firstCount, "表里至少得有一条「首次」型");
  equal(
    shouldShow({ id: firstCount!.id, staticSound: without, seePass2: new Set([firstCount!.id]), contextMatches: true }),
    false,
    firstCount!.id,
  );
  // 反过来：没看过的第一次要显示。
  equal(shouldShow({ id: firstCount!.id, staticSound: without, seePass2: without, contextMatches: true }), true, "第一次");
});

testCase("「当场」型不受「看过」影响（它靠上下文收起，不靠记账）", () => {
  assertValue(WhenScene, "表里至少得有一条「当场」型");
  equal(
    shouldShow({ id: WhenScene!.id, staticSound: without, seePass2: new Set([WhenScene!.id]), contextMatches: true }),
    true,
    WhenScene!.id,
  );
});

testCase("认不出的 id → 不显示（不许抛）", () => {
  equal(shouldShow({ id: "没有这条", staticSound: without, seePass2: without, contextMatches: true }), false, "假 id");
  equal(findNotice("没有这条"), undefined, "找提示要给 undefined");
});

group("三、口径：报错类不许混进来");

testCase("表里没有那条「剪贴板被拒」的报错（它是失败提示，不能静音）", () => {
  for (const item4 of noticeTable) {
    const character2 = item4.copy2();
    assertValue(
      !/clipboard|refused|could not|failed|not allowed/i.test(character2),
      `${item4.id} 看起来是报错文案——报错不进这张表（见文件头）`,
    );
  }
});

/* ── 汇总 ─────────────────────────────────────────────────────────────── */

console.log("\n" + "─".repeat(64));
console.log(`通过 ${pass} 条，失败 ${fail} 条`);
if (fail) {
  console.log("失败的：");
  for (const n of failed) console.log(`  - ${n}`);
  process.exit(1);
}
