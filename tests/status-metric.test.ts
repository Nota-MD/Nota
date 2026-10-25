/**
 * 「状态栏显示哪一个统计量」那条轴的**可运行**测试集：四处名字逐个对齐。
 * 2026-09-30 写，与 `src/ui/StatusBar.tsx` 那个小菜单同批落地。
 *
 * # 跑法
 *
 * ```sh
 * npx esbuild tests/status-metric.test.ts --bundle --platform=node --format=esm \
 *   --outfile=/tmp/nota-tests/status-metric.mjs
 * node /tmp/nota-tests/status-metric.mjs
 * ```
 *
 * 全过退出码 0；有不过的退出码 1，并把名字列出来。
 *
 * ⚠️ **要在仓库里跑**（不 `cd` 的话读不到源码）：这份测试读四个**源码文件**，
 * 路径是相对 `process.cwd()` 的（与 `sidebar-resize.test.ts` 同一套）。
 *
 * # 这份测试盯的是什么
 *
 * 这一条轴上的值有**四个名字**，分居四个文件、两种语言，而它们之间
 * **没有任何编译期或运行期的联系**：
 *
 * | 谁 | 在哪 | 写了什么 |
 * |---|---|---|
 * | Rust 枚举 | `settings/appearance.rs` | `Words` / `Characters` / `Lines` / `Minutes` ＋ `#[default]` |
 * | Rust 序列化 | 同上（`#[serde(rename_all = "snake_case")]`） | `"words"` / `"characters"` / … |
 * | 前端类型 | `bridge/types-settings.ts` | `"words" \| "characters" \| "lines" \| "minutes"` |
 * | 菜单顺序 | `ui/StatusBar.tsx` | 四项的排列（图里是分钟、行、词、字符） |
 * | 读回来的兜底 | `ui/useStatusBar.ts` | `?? "words"` |
 *
 * ⚠️ 对不上的**症状全是静默的**，一条都不会报错：
 *
 * 1. 名字拼错（`"characters"` 写成 `"character"`）→ 用户在菜单里选了它，
 *    落盘、重启、读回来时 `serde` 认不出那个值，**整份设置读不进来**
 *    （枚举那条路的代价，`StatusMetric` 的注释里写着为什么这里可以这样）；
 * 2. `菜单次序` 里少一项 → 那一项在菜单里**根本没有**，而其余三项都好用，
 *    用户只会以为"这个功能就是没有分钟"；
 * 3. 兜底那个 `"words"` 与 Rust 的 `#[default]` 不一致 → 启动那一瞬间
 *    （设置还没读回来）显示的是**另一个统计量**，随后自己跳一下。
 *
 * # ⚠️ 这份测试**证明不了**什么
 *
 * - **"鼠标移进去那两颗按钮真的会出现"**没验：那是 CSS `:hover` 的事，
 *   本仓没有 jsdom（`tests/fake-dom.ts` 只够 `math-view.test.ts` 用），
 *   要真浏览器 ＋ 真指针。判据写在 `styles/tabs-status.css` 里，有没有真的
 *   生效只能靠开窗目检。
 * - **"点一下菜单真的改了显示"**没验：那要真 React 渲染。链子两端各自有测试
 *   （这一份管名字，`settings/appearance.rs` 管存取），中间那一跳算未验。
 * - **"菜单长得跟图4 一样"**没验：宽度、间距、往上弹还是往下弹，全在 CSS 里。
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";

/* ── 一支极小的测试工装（与 `sidebar-resize.test.ts` 同一套长相）── */

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

function phaseSame(actual: readonly string[], expected: readonly string[], description: string): void {
  const a = [...actual].sort().join(",");
  const b = [...expected].sort().join(",");
  if (a !== b) {
    throw new Error(`${description}：期望 {${b}}，实际 {${a}}`);
  }
}

/* ── 四个源码文件 ─────────────────────────────────────────────────── */

const rustSource = readFileSync(
  join("src-tauri", "src", "settings", "appearance.rs"),
  "utf8",
);
const typeSource = readFileSync(join("src", "bridge", "types-settings.ts"), "utf8");
const stateBarSource = readFileSync(join("src", "ui", "StatusBar.tsx"), "utf8");
// ⚠️ 读的是 `useStatusBar.ts` 而**不是** `App.tsx`：那一格 2026-09-30 晚从
// App 搬到了这个 hook 里（`App.tsx` 那天越过了 1000 行硬线）。搬到别处时
// **这份测试要跟着改**，症状是它报"找不到 `appearance.status_metric ?? …`"
// ——那句红不是误报，是搬家的人忘了带它。
const wiringSource = readFileSync(join("src", "ui", "useStatusBar.ts"), "utf8");

/**
 * 从 `appearance.rs` 里抠出 `pub enum StatusMetric { … }` 那一段的**变体名**
 * （Rust 侧的大驼峰写法，如 `Characters`）。
 *
 * ⚠️ 三条要防的：①**注释里的中文**（那个枚举头上有一大段，里面出现了
 * `Words` 这种词）；②`#[default]` 那一行不是变体；③下一格那个枚举
 * （`ToolbarMode` 在它**前面**，而 `StatusMetric` 之后紧跟的是
 * `Appearance` 结构体）不能被吃进来。
 */
function rustChangeBody(): string[] {
  const m = /pub enum StatusMetric\s*\{([\s\S]*?)\n\}/.exec(rustSource);
  if (!m) throw new Error("`appearance.rs` 里找不到 `pub enum StatusMetric { … }`");
  const name3: string[] = [];
  for (const line3 of m[1].split("\n")) {
    // 去掉行尾注释（注释里写过 `Words` 这种词，留着会被当成变体）。
    const clean = line3.split("//")[0].trim();
    const v = /^([A-Z][A-Za-z0-9]*)\s*,?$/.exec(clean);
    if (v) name3.push(v[1]);
  }
  return name3;
}

/** 大驼峰 → snake_case（`Characters` → `characters`）。 */
function belowDrawLine(name3: string): string {
  return name3.replace(/([a-z0-9])([A-Z])/g, "$1_$2").toLowerCase();
}

/** 从 `types-settings.ts` 里抠出 `export type StatusMetric = "…" | …;` 的字面量。 */
function tSCharacterSurfaceMeasure(): string[] {
  const m = /export type StatusMetric =([^;]+);/.exec(typeSource);
  if (!m) throw new Error("`types-settings.ts` 里找不到 `export type StatusMetric = …;`");
  return [...m[1].matchAll(/"([a-z_]+)"/g)].map((x) => x[1]);
}

/** 从 `StatusBar.tsx` 里抠出 `菜单次序: StatusMetric[] = [ … ]` 的四个字面量。 */
function menuOrder(): string[] {
  const m = /const menuOrder: StatusMetric\[\] = \[([^\]]+)\]/.exec(stateBarSource);
  if (!m) throw new Error("`StatusBar.tsx` 里找不到 `const menuOrder: StatusMetric[] = […]`");
  return [...m[1].matchAll(/"([a-z_]+)"/g)].map((x) => x[1]);
}

/* ── 一、名字的两头 ─────────────────────────────────────────────────── */

group("一、Rust 枚举与前端类型逐字对齐");

testCase("`StatusMetric` 的四个变体与 TS 那四个字面量同集合", () => {
  // ⚠️ 这一条是**承重的**：对不上的症状是"菜单里选了没反应"或者"整份设置
  // 读不进来"，两种都不报错、不在控制台留痕（见文件头）。
  phaseSame(
    rustChangeBody().map(belowDrawLine),
    tSCharacterSurfaceMeasure(),
    "Rust `StatusMetric` 的变体（转 snake_case 后）与 TS 的字面量",
  );
});

testCase("`StatusMetric` 上有 `#[serde(rename_all = \"snake_case\")]`", () => {
  // ⚠️ 没有这一条的话，序列化出来是 `"Words"`（大驼峰），而前端读写的是
  // `"words"`——**落盘的值前端认不出**，表现是"选完重启又弹回默认"，
  // 而设置文件里明明躺着 `status_metric = "Words"`。
  const paragraph2 = /#\[serde\(rename_all = "snake_case"\)\]\s*pub enum StatusMetric/.test(rustSource);
  equal(paragraph2, true, "`StatusMetric` 头上的 `rename_all`");
});

testCase("`Appearance` 上有 `#[serde(default)]`", () => {
  // 加字段才不会把老设置文件读崩（结构体级那个 `#[serde(default)]`）。
  equal(
    /#\[serde\(default[^)]*\)\]\s*pub struct Appearance/.test(rustSource),
    true,
    "`Appearance` 头上的 `#[serde(default)]`",
  );
});

testCase("`Appearance` 里那一格叫 `status_metric`（前后端同名字段）", () => {
  // 字段名是 JSON 的键，两边必须逐字相同。
  equal(
    /pub status_metric:\s*StatusMetric\s*,/.test(rustSource),
    true,
    "Rust 侧的字段声明",
  );
  equal(
    /^\s*status_metric: StatusMetric;/m.test(typeSource),
    true,
    "TS 侧的字段声明",
  );
});

/* ── 二、默认值与兜底值 ─────────────────────────────────────────────── */

group("二、默认值：Rust 的 `#[default]` 与接线里的兜底同值");

/**
 * Rust 里标着 `#[default]` 的那个变体（转 snake_case）。
 *
 * ⚠️ 那个属性写在**变体头上那一行**，所以要回头看上一行——直接找
 * `#[default]` 后面的第一个变体名是错的（它下面隔着一行注释）。
 */
function rustDefault(): string {
  const m = /pub enum StatusMetric\s*\{([\s\S]*?)\n\}/.exec(rustSource);
  if (!m) throw new Error("`appearance.rs` 里找不到 `pub enum StatusMetric { … }`");
  const rows = m[1].split("\n");
  for (let i = 0; i < rows.length; i++) {
    if (!rows[i].includes("#[default]")) continue;
    for (let j = i + 1; j < rows.length; j++) {
      const clean = rows[j].split("//")[0].trim();
      const v = /^([A-Z][A-Za-z0-9]*)\s*,?$/.exec(clean);
      if (v) return belowDrawLine(v[1]);
    }
  }
  throw new Error("`StatusMetric` 里没有任何变体标着 `#[default]`");
}

/** 界的兜底值：`ui/useStatusBar.ts` 里读那一格时写的那个。 */
function appFallback(): string {
  const m = /appearance\.status_metric \?\? "([a-z_]+)"/.exec(wiringSource);
  if (!m) throw new Error("`ui/useStatusBar.ts` 里找不到 `appearance.status_metric ?? \"…\"`");
  return m[1];
}

testCase("Rust 的默认项与 `useStatusBar` 的兜底项是同一个", () => {
  // ⚠️ 这两个值管的是两个时刻的同一件事：设置**读回来之前**那一瞬间显示哪一个。
  // 不一致的症状是"启动时先显示字符数、几十毫秒后跳成词数"——不报错，
  // 只在慢机器上看得见，而看见了也不会有人当成 bug。
  equal(appFallback(), rustDefault(), "useStatusBar 的兜底与 Rust 的默认");
});

testCase("默认项是 `words`", () => {
  // 用户给的参考图里平时显示的就是「N 词」（`StatusMetric::Words` 那段）。
  // ⚠️ 这条是**意图**的钉，不是推导出来的——改默认值的人该看见它红。
  equal(rustDefault(), "words", "默认统计量");
});

/* ── 三、菜单里四项齐全 ─────────────────────────────────────────────── */

group("三、菜单里四项一个不少");

testCase("`菜单次序` 覆盖全部四项", () => {
  // ⚠️ 少一项的症状是那一项**在菜单里根本没有**，而其余三项照常好用——
  // 用户只会以为"这个功能就是没有分钟"。多一项则永远没有对应的勾。
  phaseSame(menuOrder(), tSCharacterSurfaceMeasure(), "菜单里的四项");
});

testCase("四项在菜单里不重复", () => {
  const item2 = menuOrder();
  equal(new Set(item2).size, item2.length, "去重之后的项数");
});

testCase("菜单四项的 i18n 键都在代码里以字面量出现", () => {
  // ⚠️⚠️ 这一条拦的是一种**已经发生过**的坏法：把四个键收进一张表、
  // 用的时候 `t(表[m], 数)`。那样 `tools/i18n-check.sh`（它扫的是代码里的
  // 字符串字面量）再也看不见这四条，于是中文表里那四行会被判成"废键"、
  // 整个闸门 FAIL。实测踩过一次。
  for (const name3 of ["words", "characters", "lines", "minutes"]) {
    const sentence = `t("{0} ${name3}"`;
    if (!stateBarSource.includes(sentence)) {
      throw new Error(`\`StatusBar.tsx\` 里找不到字面量 ${sentence}…）——键别收进表里`);
    }
  }
});

testCase("那一格与菜单用的是同一份文案表", () => {
  // 同一件事不要两处各写一份。`四个` 既是菜单标签的来源，也是那一格的来源。
  if (!/\{\s*fourItem\[metric\]\s*\}/.test(stateBarSource)) {
    throw new Error("`StatusBar.tsx` 里那一格没在用 `fourItem[metric]`——两处文案又分家了？");
  }
});

/* ── 收尾 ───────────────────────────────────────────────────────────── */

console.log(`\n${pass} 通过 / ${fail} 失败`);
if (fail > 0) {
  console.log(`失败的是：\n  · ${failed.join("\n  · ")}`);
  process.exit(1);
}
