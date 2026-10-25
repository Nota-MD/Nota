/**
 * `src/ui/panel-nodes.ts` 里**记录卡那一块**（`kind = "cards"`，2026-10-04 加）的
 * 可运行测试集。
 *
 * # 跑法（与 `tests/heatmap.test.ts` 同一套：不装任何包，`esbuild` ＋ `node`）
 *
 * ```sh
 * cd <仓库>
 * npx esbuild tests/panel-cards.test.ts --bundle --platform=node --format=esm \
 *   --alias:@=./src \
 *   --outfile=/tmp/nota-面板卡测试/panel-cards.test.mjs
 * node /tmp/nota-面板卡测试/panel-cards.test.mjs
 * ```
 *
 * ⚠️ **`--alias:@=./src`**：`panel-nodes.ts` 里的 `@/…` 是 Vite 的别名（它 import
 * `@/i18n` 与 `@/ui/chart-ticks`）。⚠️ 这份**不读文件**，在哪儿跑都行。
 *
 * # 挡的是什么
 *
 * 这一块是**写作统计那套版式的落点**（用户给的两张运动手表「运动记录」截图），
 * 而它的形状校验只在这一层。下面每一条都是"错了也看不出来"的那一类：
 *
 * 1. **认不出的图标画成什么**——插件的 `icon` 写错一个字母时，整条记录会**静默地
 *    少一颗图标**（而不是画成默认那颗）。五个名字是白名单，认不出的必须落到
 *    `record`（秒表）上。
 * 2. **`value` 走 `文本()`，不是"只收字符串"**：这里与全文件其余几十处**同一条**
 *    兜底——**数会被写成字**（`1240` → `"1240"`，`fields` / `chart` / `share` 都
 *    这样），而**表、数组、`null` 才丢成空串**（渲染层画破折号）。两者画出来是
 *    两个东西：`0` 是"有结论、就是没在打"，空串是"这一格没有数"——插件要表达
 *    后者的写法是**不发这个字段**，不是发一个数。
 *    ⚠️ 这一条以前我按"只收字符串"写，跑出来两条 FAIL——**是测试错了、不是代码错了**：
 *    要真的改成只收字符串，那是全文件的口径，得连 `fields` 一起改。
 * 3. **曲线那串点只留数字**——混进 `null` / 字符串 / `NaN` 时不能把整条线带歪
 *    （那一条线是按**这一串自己的极值**归一化的，一个 `NaN` 会让整条线消失）。
 * 4. **汇总那行 `null` 与"全是空串"不是一回事**：`total` 不是一个表 → `null`
 *    （不画那一行）；是表但字段全缺 → 三个空串（画出来是"破折号"那一条）。
 * 5. **上限**：条数与点数各自封顶，多的丢掉——插件发一万条时不能把面板拖垮。
 */

import { normalise } from "../src/ui/panel-nodes";

/* ── 极小的测试工装（与 `heatmap.test.ts` 同一套）── */

let pass = 0;
let fail = 0;
const failed: string[] = [];

function eq(actual: unknown, want: unknown, what: string): void {
  const a = JSON.stringify(actual);
  const b = JSON.stringify(want);
  if (a === b) {
    pass++;
  } else {
    fail++;
    failed.push(`${what}\n     想要 [${b}]\n     实得 [${a}]`);
  }
}

/** 把一份原始 JSON 收成节点，取第一块（就是 `kind` 那一块）。 */
function ordinalOneBlock(raw: unknown) {
  const out = normalise(raw);
  return out[0];
}

/** 一份最小的记录卡块。 */
function block(spec: Record<string, unknown>) {
  return ordinalOneBlock([{ kind: "cards", ...spec }]);
}

/* ── (1) 完整的五条 ─────────────────────────────────────────────── */

{
  const n = block({
    title: "Writing record",
    items: [
      { icon: "round", value: "13", unit: "words / min", caption: "本轮 · 1,050 字 · 50 秒", points: [20, 0, 20] },
      { icon: "today", value: "100", unit: "words", caption: "今天 · 2 轮", points: [] },
      { icon: "long", value: "161,565", unit: "words", caption: "最近 26 周 · 105 天有字" },
    ],
    total: { label: "Whole document", value: "1,284", unit: "words" },
  });
  eq(n?.kind, "cards", "kind 收得下来");
  eq((n as any).spec.title, "Writing record", "小标题");
  eq((n as any).spec.items.length, 3, "三条记录");
  eq((n as any).spec.items[0].icon, "round", "第一条的图标");
  eq((n as any).spec.items[0].points, [20, 0, 20], "曲线：**0 要留着**（那是「这一分钟没打」）");
  eq((n as any).spec.items[2].points, [], "没给点的那条是空数组，不是缺字段");
  eq((n as any).spec.items[2].caption, "最近 26 周 · 105 天有字", "第三条的小字（长句不改写）");
  eq((n as any).spec.total, { label: "Whole document", value: "1,284", unit: "words" }, "汇总那行");
}

/* ── (2) 五个图标名与那个兜底 ────────────────────────────────────── */

{
  for (const name3 of ["round", "today", "long", "doc", "record"]) {
    eq((block({ items: [{ icon: name3 }] }) as any).spec.items[0].icon, name3, `图标 ${name3} 认得`);
  }
  eq((block({ items: [{ icon: "stopwatch" }] }) as any).spec.items[0].icon, "record", "认不出的图标落到秒表");
  eq((block({ items: [{ icon: 7 }] }) as any).spec.items[0].icon, "record", "图标是数也落到秒表");
  eq((block({ items: [{}] }) as any).spec.items[0].icon, "record", "没写 icon 也一样");
}

/* ── (3) 字段类型不对的兜底 ──────────────────────────────────────── */

{
  const n = block({
    title: 42,
    items: [{ icon: "round", value: 1240, unit: null, caption: ["x"], points: "1,2,3" }],
  }) as any;
  eq(n.spec.title, "42", "数是数、字是字？——这里**数会写成字**（`42` → `\"42\"`，同 `fields`）");
  eq(n.spec.items[0].value, "1240", "`1240`（数）→ `\"1240\"`，**不是空串**（全文件同一条 `文本()`）");
  eq(n.spec.items[0].unit, "", "`null` 才丢成空串（渲染层画破折号）");
  eq(n.spec.items[0].caption, "", "数组也一样丢成空串（**不会变成 `[object Object]`**）");
  eq(n.spec.items[0].points, [], "`points` 不是数组 → 空（认不出的一律不猜）");
}

/* ── (4) 曲线那串点：只留数字、留最后 200 个 ─────────────────────── */

{
  const dirty = [1, null, 2, "3", Number.NaN, Number.POSITIVE_INFINITY, 4, undefined];
  eq((block({ items: [{ points: dirty }] }) as any).spec.items[0].points, [1, 2, 4],
    "只留有限数字（null / 字符串 / NaN / Infinity 全丢，**且顺序不变**）");

  const many = Array.from({ length: 250 }, (_, i) => i);
  const receiveOf = (block({ items: [{ points: many }] }) as any).spec.items[0].points;
  eq(receiveOf.length, 200, "点数封顶 200（与 `chart` 同一个上限）");
  eq(receiveOf[0], 50, "**丢的是最老的**（留最后 200 个：起点是 50 不是 0）");
  eq(receiveOf[199], 249, "末尾那一个留着");
}

/* ── (5) 汇总那行：`null` 与"三个空串"是两件事 ──────────────────── */

{
  eq((block({ items: [{ icon: "round" }] }) as any).spec.total, null, "没给 total → null（不画那一行）");
  eq((block({ items: [{ icon: "round" }], total: "12345 字" }) as any).spec.total, null,
    "total 是个字符串 → 当没有，**不去猜它是不是一个数**");
  eq((block({ items: [{ icon: "round" }], total: {} }) as any).spec.total,
    { label: "", value: "", unit: "" },
    "total 是个空表 → 三个空串（那是「有结论、值不知道」，画破折号）");
  eq((block({ items: [], total: { label: "Whole document", value: "0", unit: "words" } }) as any).spec.total,
    { label: "Whole document", value: "0", unit: "words" },
    "⚠️ **一条记录都没有时，汇总照收**——idle 那一屏上它是唯一的数");
}

/* ── (6) 边界：坏数据不发火、条数封顶、别的 kind 不受影响 ────────── */

{
  const n = block({}) as any;
  eq(n.kind, "cards", "一个字段都不给也是一个 cards 块");
  eq(n.spec.items, [], "items 缺 → 空数组");
  eq(n.spec.total, null, "total 缺 → null");
  eq(n.spec.title, "", "title 缺 → 空串（渲染层据此不画小标题）");

  eq((block({ items: "三条" }) as any).spec.items, [], "items 不是数组 → 空数组（不是「一条空记录」）");

  const valueHeap = Array.from({ length: 300 }, () => ({ icon: "round", value: "1" }));
  eq((block({ items: valueHeap }) as any).spec.items.length, 200, "条数封顶 200（与宿主的「面板节点上限」同量级）");

  // ⚠️ 新块不能动到邻居：同一份里别的块照旧。
  const mixedOf = normalise([
    { kind: "fields", items: [{ label: "a", value: "1" }] },
    { kind: "cards", items: [{ icon: "round", value: "13" }] },
    { kind: "text", text: "只在面板开着的时候记录。" },
  ]);
  eq(mixedOf.map((x) => x.kind), ["fields", "cards", "text"], "三个块各是各的");
  eq((mixedOf[1] as any).spec.items[0].value, "13", "中间那块照旧收下来");
}

/* ── 收工 ───────────────────────────────────────────────────────── */

console.log(`\n面板记录卡（cards）：${pass} 条通过、${fail} 条失败`);
for (const m of failed) console.log("  FAIL " + m);
if (fail > 0) process.exit(1);
