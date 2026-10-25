/**
 * `src/ui/heatmap.ts`（长期记录的热力图）的**可运行**测试集。
 *
 * # 跑法（与 `tests/chart-ticks.test.ts` 同一套：不装任何包，`esbuild` ＋ `node`）
 *
 * ```sh
 * cd <仓库>
 * npx esbuild tests/heatmap.test.ts --bundle --platform=node --format=esm \
 *   --alias:@=./src \
 *   --outfile=/tmp/nota-热力图测试/heatmap.test.mjs
 * node /tmp/nota-热力图测试/heatmap.test.mjs
 * ```
 *
 * ⚠️ **`--alias:@=./src`**：2026-09-27 起这份模块要问一句"界面在说哪种语言"
 * （月份标签），那句话在 `src/i18n`，而它内部用的是 `@/…` 这种路径（Vite 的别名）。
 * ⚠️ 这份**不读文件**，所以在哪儿跑都行。
 *
 * # 挡的是什么
 *
 * 1. **格子错位**——每一格是哪一天全靠算出来的，而错的图**看着完全正常**：
 *    只是"9 月 3 号写了 1200 字"被画到了 9 月 2 号那一格上。热力图上没有数字，
 *    所以这类错误没有任何肉眼可见的症状。
 * 2. **最后一列画出了"未来"**——今天才周三，后面四格却是 0 字。那不是"没写"，
 *    那是**还没到**，两者画成一样的颜色就是在编数据。
 * 3. **时区陷阱**——`new Date("2026-09-27")` 按 **UTC** 解析，在东八区会退到
 *    前一天早上八点，整张图偏一格，而且**只在部分时区偏**（开发机上可能看不出来）。
 * 4. **插件给的坏记录把整块图带崩**（`days` 不是字符串、日期写成 `2026-9-7`、
 *    值是负数、同一天两行）。
 * 5. **月份标签没跟着语言走**——英文界面下发出「9月」，而这张图是要发出去的。
 */

import { setLanguage } from "../src/i18n";
import { computeHeatmap, readHotForceRecordRecord } from "../src/ui/heatmap";

/* ── 极小的测试工装（与 `chart-ticks.test.ts` 同一套）── */

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

/** 把一张图压成 `日期=值` 的一串，方便一眼比对。 */
function expand(image: ReturnType<typeof computeHeatmap>): string {
  const output2: string[] = [];
  for (const column of image.column) for (const cell2 of column.cell2) output2.push(`${cell2.date}=${cell2.value2}`);
  return output2.join(" ");
}

/* ── 读记录 ───────────────────────────────────────────────────────────── */

group("读热力记录（宿主定的那个字符串）");

testCase("正常的一串：空格分开，日期在前、值在后", () => {
  const r = readHotForceRecordRecord("2026-09-27:1284 2026-09-26:0 2026-09-25:120");
  equal(r.length, 3, "三条");
  equal(r[0].date, "2026-09-27", "第一天");
  equal(r[0].value2, 1284, "第一天那个数");
});

testCase("坏项丢掉，好的照收（不因为一行坏的就整块不画）", () => {
  const r = readHotForceRecordRecord("2026-09-27:1284 乱写 2026-9-7:10 2026-09-25:-3 2026-09-24:7:x");
  equal(r.length, 1, "只剩一条好的");
  equal(r[0].date, "2026-09-27", "留下的正是那条");
});

testCase("⚠️ 同一天两行：后写的赢（记账那侧本来就不该重复）", () => {
  const r = readHotForceRecordRecord("2026-09-27:10 2026-09-27:20");
  equal(r.length, 1, "合成一条");
  equal(r[0].value2, 20, "后写的那个");
});

testCase("不是字符串就没有记录（插件没写 days / 写成了数组）", () => {
  equal(readHotForceRecordRecord(undefined).length, 0, "undefined");
  equal(readHotForceRecordRecord([{ d: "2026-09-27", v: 1 }]).length, 0, "数组也不算");
});

testCase("值取整（0.9 字是写不出来的，那只能是算错了）", () => {
  equal(readHotForceRecordRecord("2026-09-27:12.9")[0].value2, 12, "往下取整");
});

/* ── 铺格子 ───────────────────────────────────────────────────────────── */

group("算热力：格子摆在哪");

testCase("一周一列、周一在头一行：2026-09-27 是周日 → 它在这一列的最后一行", () => {
  // 2026-09-27 是周日（真查过日历）。止=那天、铺 8 列（下限），
  // 所以最后一列的周一 = 09-21，周日 = 09-27。
  const image = computeHeatmap([{ date: "2026-09-27", value2: 100 }], "2026-09-27", 8);
  equal(image.column.length, 8, "8 列");
  equal(image.column[7].cell2.length, 7, "最后一列是满的（周日就是末尾那格）");
  equal(image.column[7].cell2[6].date, "2026-09-27", "最后一行是周日");
  equal(image.column[7].cell2[0].date, "2026-09-21", "第一行是周一");
  equal(image.column[7].cell2[6].value2, 100, "那一格的值");
  equal(image.end2, "2026-09-27", "窗口右端");
});

testCase("⚠️ 今天才周三：最后一列只画到周三，后面四格**不画**（不是画成 0）", () => {
  const image = computeHeatmap([], "2026-09-23", 8); // 2026-09-23 是周三
  equal(image.column[7].cell2.length, 3, "周一到周三，三格");
  equal(image.column[7].cell2[2].date, "2026-09-23", "最后一格就是今天");
});

testCase("窗口是 8~53 列，认不出来用半年（26）", () => {
  equal(computeHeatmap([], "2026-09-27", 1).column.length, 8, "太少 → 抬到 8");
  equal(computeHeatmap([], "2026-09-27", 999).column.length, 53, "太多 → 压到 53");
  equal(computeHeatmap([], "2026-09-27", Number.NaN).column.length, 26, "NaN → 26");
  equal(computeHeatmap([], "2026-09-27", 0).column.length, 26, "0 也当没写 → 26");
});

testCase("跨月的窗口：起止两头都要对（8 列 = 56 天）", () => {
  const image = computeHeatmap([], "2026-09-27", 8);
  equal(image.start5, "2026-08-03", "8 列前那个周一"); // 09-21 往前 7*7 = 49 天 → 08-03
  equal(image.end2, "2026-09-27", "右端还是那一天");
});

testCase("除了最后一列，每列都是 7 格", () => {
  const image = computeHeatmap([], "2026-09-27", 12);
  for (let i = 0; i + 1 < image.column.length; i++) equal(image.column[i].cell2.length, 7, `第 ${i} 列`);
});

group("算热力：三个数（最大 / 总计 / 有字天数）");

testCase("只数**窗口里**的那些天（窗口外的记录不掺和）", () => {
  const image = computeHeatmap(
    [
      { date: "2026-09-27", value2: 100 },
      { date: "2026-09-26", value2: 50 },
      { date: "2020-01-01", value2: 9999 }, // 六年前，不在窗口里
    ],
    "2026-09-27",
    8,
  );
  equal(image.mostLarge, 100, "最大值只看窗口里");
  equal(image.totalCount, 150, "总计只看窗口里");
  equal(image.dayNumber, 2, "有字的两天");
});

testCase("没有记录时是一张空图（列是空的，渲染层不画）", () => {
  const image = computeHeatmap([], "", 26);
  equal(image.column.length, 0, "不画");
  equal(image.totalCount, 0, "总计 0");
});

testCase("⚠️ 止 认不出来时退到记录里最晚的那一天（不是退到「今天」——这里根本不认识今天）", () => {
  const image = computeHeatmap([{ date: "2026-03-05", value2: 7 }], "不是日期", 8);
  equal(image.end2, "2026-03-05", "用记录里最晚的那天");
  equal(image.totalCount, 7, "那一格在窗口里");
});

group("算热力：深浅四档");

testCase("相对这张图的最大值分档：1/4 一档", () => {
  const image = computeHeatmap(
    [
      { date: "2026-09-27", value2: 100 }, // 满档
      { date: "2026-09-26", value2: 75 }, // 3 档（0.75 ≤ 值/最大）
      { date: "2026-09-25", value2: 50 }, // 2 档
      { date: "2026-09-24", value2: 25 }, // 1 档
      { date: "2026-09-23", value2: 0 }, // 0 档（没写）
    ],
    "2026-09-27",
    8,
  );
  const find = (date: string) => image.column.flatMap((c) => c.cell2).find((g) => g.date === date)!;
  equal(find("2026-09-27").level, 4, "最大的一天是满档");
  equal(find("2026-09-26").level, 3, "四分之三");
  equal(find("2026-09-25").level, 2, "一半");
  equal(find("2026-09-24").level, 1, "四分之一");
  equal(find("2026-09-23").level, 0, "没写是 0 档");
});

testCase("一天都没写（最大 = 0）时，有字的那天也画得出颜色（档 1，不是 0）", () => {
  // 走不到：最大 > 0 才会有非零值。这条钉的是"最大 <= 0 时除零不炸"。
  const image = computeHeatmap([{ date: "2026-09-27", value2: 0 }], "2026-09-27", 8);
  equal(image.mostLarge, 0, "最大是 0");
  equal(image.column.flatMap((c) => c.cell2).every((g) => g.level === 0), true, "全是 0 档");
});

group("算热力：月份标签（跟着界面语言走）");

testCase("同一个月只标一次，标在它出现的第一列上", () => {
  setLanguage("zh-CN");
  const image = computeHeatmap([], "2026-09-27", 8); // 08-03 ~ 09-27
  const label = image.column.map((c) => c.month);
  equal(label[0], "8月", "第一列标 8 月");
  equal(label.filter((m) => m === "8月").length, 1, "8 月只标一次");
  equal(label.includes("9月"), true, "9 月也标了");
  equal(label.filter((m) => m === "9月").length, 1, "9 月只标一次");
});

testCase("⚠️ 说英文时标的是 Sep（这张图要发出去，「9月」在英文界面上就是没翻译）", () => {
  setLanguage("en");
  const image = computeHeatmap([], "2026-09-27", 8);
  const label = image.column.map((c) => c.month);
  equal(label[0], "Aug", "第一列是 Aug");
  equal(label.includes("Sep"), true, "9 月那边是 Sep");
  equal(label.includes("9月"), false, "一个中文的月份都不该剩");
  // ⚠️ `short` 才有这个区分度：`narrow` 在英文里只剩一个字母（S 与 S 撞车）。
  equal(new Set(label.filter(Boolean)).size > 1, true, "两个月的标签是能分开的两个词");
  setLanguage("zh-CN");
});

/* ── 时区 ─────────────────────────────────────────────────────────────── */

group("⚠️ 时区：日期一律按**本地**算");

testCase("`2026-09-27` 就是本地那一天，不偏格（UTC 解析在东八区会退到前一天）", () => {
  const image = computeHeatmap([{ date: "2026-09-27", value2: 5 }], "2026-09-27", 8);
  equal(image.end2, "2026-09-27", "止没变");
  const thatCell = image.column.flatMap((c) => c.cell2).find((g) => g.value2 === 5);
  assertion(thatCell, "那一格得在图上");
  equal(thatCell!.date, "2026-09-27", "值落在它自己那一天");
});

testCase("跨夏令时的那几周照样一天一格（不是加 86400 秒）", () => {
  // 2026-11-01 是多数北美时区结束夏令时的那天。窗口横跨 10 月到 11 月，
  // 格子数必须**正好等于**窗口的自然天数——按"加 86400 秒"算的话，
  // 那一天不是 24 小时，会多出一格或者少一格。
  const image = computeHeatmap([], "2026-11-15", 8);
  const cellCount = image.column.reduce((n, c) => n + c.cell2.length, 0);
  const start5 = image.start5.split("-").map(Number);
  const end2 = image.end2.split("-").map(Number);
  const dayNumber =
    Math.round(
      (new Date(end2[0], end2[1] - 1, end2[2]).getTime() -
        new Date(start5[0], start5[1] - 1, start5[2]).getTime()) /
        86400000,
    ) + 1;
  equal(cellCount, dayNumber, "格子数 = 窗口的自然天数");
  // 而且跨过那一天的那两格，日期要连着（中间不跳号、不重复）。
  const before2 = image.column.flatMap((c) => c.cell2).find((g) => g.date === "2026-10-31");
  assertion(before2, "10-31 那格在图上");
  const after = image.column.flatMap((c) => c.cell2).find((g) => g.date === "2026-11-01");
  assertion(after, "11-01 那格也在（夏令时那天没被吃掉）");
});

testCase("溢出的日期当没有（`2026-02-30` 不存在）", () => {
  equal(readHotForceRecordRecord("2026-02-30:10").length, 0, "2 月没有 30 号");
  equal(readHotForceRecordRecord("2026-13-01:10").length, 0, "没有 13 月");
});

/* ── 收尾 ─────────────────────────────────────────────────────────────── */

console.log(`\n${"─".repeat(64)}`);
console.log(`通过 ${pass} 条，失败 ${fail} 条`);
if (fail) {
  console.log(`失败的：\n  - ${failed.join("\n  - ")}`);
  process.exitCode = 1;
}
