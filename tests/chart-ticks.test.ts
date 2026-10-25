/**
 * `src/ui/chart-ticks.ts`（图上的刻度）的**可运行**测试集。
 *
 * # 跑法（与 `tests/lang-icons.test.ts` 同一套：不装任何包，`esbuild` ＋ `node`）
 *
 * ```sh
 * cd <仓库>
 * npx esbuild tests/chart-ticks.test.ts --bundle --platform=node --format=esm \
 *   --outfile=/tmp/nota-chart-ticks-test/chart-ticks.test.mjs
 * node /tmp/nota-chart-ticks-test/chart-ticks.test.mjs
 * ```
 *
 * ⚠️ 这份**不读文件**，所以在哪儿跑都行（不像 `lang-icons` 那份要找仓库根）。
 *
 * # 挡的是什么
 *
 * 三件都是**看着不像坏**的坏：
 *
 * 1. **刻度上的数字是错的**——标着 100 的那条线不在它该在的位置。这是最坏的一种：
 *    图还是那张图，只是**读出来的数不对**，而没有人会去怀疑刻度。
 * 2. **插件给的坏刻度把整块图带崩**（`null`、`at` 是字符串、标签是一整句话）。
 * 3. **首末两档探出画布**（第一个标签左半边被切、最后一个右半边被切）。
 */

import { pushVerticalTick, readTick, formatNumber } from "../src/ui/chart-ticks";

/* ── 极小的测试工装（与 `mark-hint.test.ts` / `lang-icons.test.ts` 同一套）── */

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

function assertion(condition: unknown, description: string): void {
  if (!condition) throw new Error(description);
}

function equal(actual: unknown, expected: unknown, description: string): void {
  if (actual !== expected) {
    throw new Error(`${description}：期望 ${JSON.stringify(expected)}，实际 ${JSON.stringify(actual)}`);
  }
}

/* ── 用例 ─────────────────────────────────────────────────────────────── */

group("纵轴刻度由数据推出来");

testCase("三档：极大在顶（at=0）、极小在底（at=1）、中间那档在 0.5", () => {
  const tick = pushVerticalTick([10, 40, 90]);
  // ⚠️ 方向是**顶 = 极大**：`PanelBody.tsx` 里 `纵向()` 是 `(上限 - v)/跨度`，
  //    上下界反过来的话，刻度与曲线就是镜像的——而"镜像的图"单看仍然像张图。
  equal(tick.length, 3, "该有三档");
  equal(tick[0].at, 0, "极大值在顶");
  equal(tick[0].label, "90", "顶上是极大值");
  equal(tick[1].at, 0.5, "中间那档在中线");
  equal(tick[1].label, "50", "中线是上下界的平均");
  equal(tick[2].at, 1, "极小值在底");
  equal(tick[2].label, "10", "底下是极小值");
});

testCase("一直平着（极大 = 极小）只给一档、摆中线", () => {
  // 给三档的话上面和下面是同一个数，读起来像"上下差着什么"。
  const tick = pushVerticalTick([7, 7, 7]);
  equal(tick.length, 1, "只该有一档");
  equal(tick[0].at, 0.5, "摆在中线");
  equal(tick[0].label, "7", "写的就是那个值");
});

testCase("空数组没有刻度（不是给一排 0）", () => {
  equal(pushVerticalTick([]).length, 0, "没有点就没有纵轴刻度");
});

testCase("负值、小数都正常", () => {
  const tick = pushVerticalTick([-2.5, 1.5]);
  equal(tick[0].label, "1.5", "顶上是 1.5");
  equal(tick[2].label, "-2.5", "底下是 -2.5");
  // 中线是 (-2.5+1.5)/2 = -0.5。⚠️ 它**不是**数据里的点，是坐标轴上的位置——
  // 刻度线本来就该这么标（标成某个数据的值才是错的）。
  equal(tick[1].label, "-0.5", "中线是两头的平均");
});

testCase("⚠️ 中线上那档的数经得起十倍错（回归：109.5 曾经写成 11）", () => {
  // 极大 200、极小 19 → 中线 (200+19)/2 = 109.5。这一段**不是编的**：
  // 面板上任何一段"峰值 200、谷值 19"的曲线都会走到这一支。
  const tick = pushVerticalTick([19, 200]);
  equal(tick[1].label, "110", "中线写成 110");
});

group("插件给的横轴刻度");

testCase("正常的一份：按位置排好、夹在 0~1", () => {
  const tick = readTick([
    { at: 1, label: "现在" },
    { at: 1 / 3, label: "-2 分" },
    { at: 0, label: "-3 分" },
  ]);
  equal(tick.length, 3, "三档都在");
  equal(tick[0].label, "-3 分", "最左那档排在最前");
  equal(tick[2].label, "现在", "最右那档排在最后");

  // 越界的位置夹回来：跑到画布外面的刻度是看不见的，而"看不见"比"越界"难查。
  const exceedBoundary = readTick([
    { at: -3, label: "太左" },
    { at: 9, label: "太右" },
  ]);
  equal(exceedBoundary[0].at, 0, "负数夹到 0");
  equal(exceedBoundary[1].at, 1, "大于 1 夹到 1");
});

testCase("坏项丢掉、好项照画（不整块不画）", () => {
  const tick = readTick([
    { at: 0.5, label: "好" },
    null,
    "不是对象",
    { at: "左边", label: "at 不是数" },
    { at: Number.NaN, label: "NaN" },
    { at: Number.POSITIVE_INFINITY, label: "无穷" },
    { at: 0.2 },
    { at: 0.3, label: "   " },
    { at: 0.4, label: 42 },
  ]);
  equal(tick.length, 1, "只该剩下那一条好的");
  equal(tick[0].label, "好", "剩下的就是它");
});

testCase("非数组、缺字段一律当没有刻度", () => {
  for (const broken of [undefined, null, "x", 3, {}, [1, 2]]) {
    equal(readTick(broken).length, 0, `${JSON.stringify(broken)} 该当成没有刻度`);
  }
});

testCase("一档标签写成一整句话会被截短，档数也有上限", () => {
  const lengthSentence = readTick([{ at: 0.5, label: "这是".repeat(30) }]);
  assertion(lengthSentence[0].label.length <= 12, `标签该被截到 12 个字以内，实际 ${lengthSentence[0].label.length}`);

  const valueHeap = readTick(
    Array.from({ length: 30 }, (_, i) => ({ at: i / 29, label: `t${i}` })),
  );
  equal(valueHeap.length, 8, "最多认 8 档（再多就是一排糊字）");
});

testCase("⚠️ 大单位那个标记**只在恰好是 true** 时留下", () => {
  // 用户 2026-09-27：「时间应该以分钟为单位，而到小时就用稍微大一点的字体标出来
  // 是几小时」。插件标"这一档是大单位"，字号是多少由渲染层定——所以这里透传的
  // 是一个**真假值**，不是一个字号。
  const tick = readTick([
    { at: 0, label: "开始" },
    { at: 0.5, label: "1 小时", largeSinglePosition: true },
    { at: 1, label: "2 小时", largeSinglePosition: false },
  ]);
  equal(tick[1].largeSinglePosition, true, "标了大单位的那档");
  // ⚠️ `false` 与"没写"是同一件事。多留一个 `大单位: false` 的键，快照/目检里
  // 那串 JSON 会凭白长一截，而行为一模一样（与"按位置排"同一条理由）。
  equal("大单位" in tick[0]!, false, "没写这个字段的档不该多出键来");
  equal("大单位" in tick[2]!, false, "写了 false 的档也不该多出键来");
  // 不是 `true` 的杂值一律当没写（插件是 Lua，什么都送得出来）。
  for (const misc of [1, "true", {}, null]) {
    const value = readTick([{ at: 0.5, label: "x", largeSinglePosition: misc }]);
    equal("大单位" in value[0]!, false, `大单位 = ${JSON.stringify(misc)} 该当没写`);
  }
});

group("数字怎么写");

testCase("整数原样、小数按量级定小数位、末尾的零去掉", () => {
  equal(formatNumber(0), "0", "零");
  equal(formatNumber(-0), "0", "负零也写成零");
  equal(formatNumber(124), "124", "整数");
  equal(formatNumber(-12), "-12", "负整数");
  equal(formatNumber(12.34), "12.3", "两位数只要一位小数");
  equal(formatNumber(123.4), "123", "三位数不要小数");
  equal(formatNumber(1.25), "1.25", "个位数保留两位");
  equal(formatNumber(0.001), "0", "小到看不见就是 0（不是 0.00）");
  equal(formatNumber(Number.NaN), "", "NaN 写不出字");
});

testCase("⚠️ 百位以上不留小数时，**不许把整数末尾的零也去掉**（2026-09-27 修）", () => {
  // 这条曾经是坏的：`(109.5).toFixed(0)` 是 `"110"`，而那条"去尾零"的正则
  // （`\.?0+$`）在没有小数部分时去掉的正是**整数末尾的零** → `"11"`。
  // 后果不是"字写得难看"，是**刻度上的数差十倍**：一条标着 11 的线其实在 110，
  // 而图还是那张图，没有人会去怀疑刻度。
  equal(formatNumber(109.5), "110", "109.5 该写成 110");
  equal(formatNumber(100.04), "100", "100.04 该写成 100");
  equal(formatNumber(1000.2), "1000", "1000.2 该写成 1000");
  equal(formatNumber(-120.4), "-120", "负号那一侧同样");
});

/* ── 收尾 ─────────────────────────────────────────────────────────────── */

console.log(`\n${"─".repeat(64)}`);
console.log(`通过 ${pass} 条，失败 ${fail} 条`);
if (fail) {
  console.log(`失败的：\n  - ${failed.join("\n  - ")}`);
  process.exitCode = 1;
}
