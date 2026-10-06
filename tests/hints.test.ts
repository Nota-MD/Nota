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

import { 提示表, 提示id们, 找提示, 该显示吗 } from "../src/ui/hints";

/* ── 工装（与 `mark-hint.test.ts` 同一套长相）─────────────────────────── */

let 过 = 0;
let 败 = 0;
const 败的: string[] = [];

function 测(名称: string, 体: () => void): void {
  try {
    体();
    过++;
    console.log(`  ✔ ${名称}`);
  } catch (e) {
    败++;
    败的.push(名称);
    console.log(`  ✘ ${名称}`);
    console.log(`      ${e instanceof Error ? e.message : String(e)}`);
  }
}

function 组(名: string): void {
  console.log(`\n【${名}】`);
}

function 等(实际: unknown, 期望: unknown, 说明: string): void {
  if (实际 !== 期望) {
    throw new Error(`${说明}：期望 ${JSON.stringify(期望)}，实际 ${JSON.stringify(实际)}`);
  }
}

function 真(条件: unknown, 说明: string): void {
  if (!条件) throw new Error(说明);
}

const 无 = new Set<string>();

/* ── 用例 ─────────────────────────────────────────────────────────────── */

组("一、这张表本身是自洽的");

测("id 不重复、不空", () => {
  const 们 = 提示id们();
  等(new Set(们).size, 们.length, "有重复的 id（落盘的键会互相踩）");
  for (const id of 们) 真(id.trim().length > 0, "有空的 id");
});

测("⚠️ 每一条都写清了触发条件（用户那条「提示要确定」的机器判据）", () => {
  for (const 条 of 提示表) {
    真(条.条件.trim().length >= 8, `${条.id} 的触发条件太短/空着——写清楚"什么情况下才出现"`);
  }
});

测("类型只有那两种，默认值是布尔", () => {
  for (const 条 of 提示表) {
    真(条.类型 === "当场" || 条.类型 === "首次", `${条.id} 的类型不认得：${条.类型}`);
    等(typeof 条.默认, "boolean", `${条.id} 的默认值`);
  }
});

测("每条的文案都取得到，而且非空（⚠️ 是函数，不是模块级求值）", () => {
  for (const 条 of 提示表) {
    const 字 = 条.文案();
    等(typeof 字, "string", `${条.id} 的文案`);
    真(字.trim().length > 0, `${条.id} 的文案是空的`);
  }
});

组("二、`该显示吗` 那三条规则");

const 当场 = 提示表.find((条) => 条.类型 === "当场");
const 首次 = 提示表.find((条) => 条.类型 === "首次");

测("上下文不成立 → 不显示（哪怕没静音、没看过）", () => {
  for (const 条 of 提示表) {
    等(该显示吗({ id: 条.id, 静音: 无, 看过: 无, 上下文成立: false }), false, 条.id);
  }
});

测("静音了 → 不显示（⚠️ 这是「不再显示」唯一的落点）", () => {
  for (const 条 of 提示表) {
    等(
      该显示吗({ id: 条.id, 静音: new Set([条.id]), 看过: 无, 上下文成立: true }),
      false,
      条.id,
    );
  }
});

测("「首次」型看过一次就不再显示", () => {
  真(首次, "表里至少得有一条「首次」型");
  等(
    该显示吗({ id: 首次!.id, 静音: 无, 看过: new Set([首次!.id]), 上下文成立: true }),
    false,
    首次!.id,
  );
  // 反过来：没看过的第一次要显示。
  等(该显示吗({ id: 首次!.id, 静音: 无, 看过: 无, 上下文成立: true }), true, "第一次");
});

测("「当场」型不受「看过」影响（它靠上下文收起，不靠记账）", () => {
  真(当场, "表里至少得有一条「当场」型");
  等(
    该显示吗({ id: 当场!.id, 静音: 无, 看过: new Set([当场!.id]), 上下文成立: true }),
    true,
    当场!.id,
  );
});

测("认不出的 id → 不显示（不许抛）", () => {
  等(该显示吗({ id: "没有这条", 静音: 无, 看过: 无, 上下文成立: true }), false, "假 id");
  等(找提示("没有这条"), undefined, "找提示要给 undefined");
});

组("三、口径：报错类不许混进来");

测("表里没有那条「剪贴板被拒」的报错（它是失败提示，不能静音）", () => {
  for (const 条 of 提示表) {
    const 字 = 条.文案();
    真(
      !/clipboard|refused|could not|failed|not allowed/i.test(字),
      `${条.id} 看起来是报错文案——报错不进这张表（见文件头）`,
    );
  }
});

/* ── 汇总 ─────────────────────────────────────────────────────────────── */

console.log("\n" + "─".repeat(64));
console.log(`通过 ${过} 条，失败 ${败} 条`);
if (败) {
  console.log("失败的：");
  for (const n of 败的) console.log(`  - ${n}`);
  process.exit(1);
}
