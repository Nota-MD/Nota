/**
 * `src/styles/doc-typography.ts`（「文档主题」页里那四个可调项）的**可运行**测试集。
 *
 * # 跑法（不装任何包：`esbuild` 与 `node` 仓库里都现成）
 *
 * ```sh
 * cd <仓库>
 * npx esbuild tests/doc-typography.test.ts --bundle --platform=node --format=esm \
 *   --outfile=/tmp/nota-doc-type-test/doc-type.test.mjs
 * node /tmp/nota-doc-type-test/doc-type.test.mjs
 * ```
 *
 * 全过退出码 0；有不过的退出码 1，并把名字列出来。
 *
 * # 这份测试是为什么写的（2026-09-27）
 *
 * `docs/10-feature-matrix.md` §4 那两格（「行距 / 段距调整」「字体与字号（文档级）」）
 * 的实现是"文档主题给一套默认，用户逐项盖掉"。这一路上**唯一一处"看着差不多、
 * 其实会错"的判断**是那三个数与 `editor.css` 里兜底值的对应关系：
 *
 * - Rust 侧 `Document::default()` 是 `line_height: 175` / `paragraph_gap: 85` /
 *   `font_size: 102`；
 * - CSS 侧是 `var(--doc-line-height, 1.75)` / `var(--doc-para-gap, 0.85em)` /
 *   `var(--doc-font-size, 1.02em)`。
 *
 * 两处都是"默认值"，而它们**都没有编译期约束**：改了一处忘了另一处，症状是
 * **用户一打开那个开关、正文就跳一下**（175 与 1.9 差得肉眼可见），而开关上
 * 什么都没写。所以第二组直接**读那两个文件**，不抄一份表——与
 * `tests/accent.test.ts` 第 2 组读 `color.css` 是同一个理由。
 *
 * # 这份测试测什么、不测什么
 *
 * - 测：默认全关时不写任何变量、打开时写成什么形状、夹范围、字体三档。
 * - **不测**：`EditorPane` 到底有没有把这几个变量写到 `.editor-pane` 上、
 *   以及**它在不在正确的层**（写 `<html>` 上会被文档主题盖掉，那正是这一页
 *   最容易犯的错）。⚠️ 那是纯函数测试够不着的盲区，判据只有一条：
 *   **选一套文档主题 + 打开行距开关 + 看正文变没变**（`docs/06` §5 那套截图配方）。
 */

import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { 正文排版变量, 字号范围, 段距范围, 行距范围 } from "../src/styles/doc-typography";
import type { DocumentSettings } from "../src/bridge/types";

/* ── 一支极小的测试工装（与 `accent.test.ts` / `atom-space.test.ts` 同一套长相）── */

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

function 断言(条件: unknown, 说明: string): void {
  if (!条件) throw new Error(说明);
}

function 等(实际: unknown, 期望: unknown, 说明: string): void {
  if (实际 !== 期望) {
    throw new Error(`${说明}：期望 ${JSON.stringify(期望)}，实际 ${JSON.stringify(实际)}`);
  }
}

/* ── 两份"别处"的默认值，现读现用 ───────────────────────────────────── */

const 仓库 = process.cwd();

/** 一份"四项全关"的设置。 */
function 全关(): DocumentSettings {
  return {
    custom_line_height: false,
    line_height: 175,
    custom_paragraph_gap: false,
    paragraph_gap: 85,
    custom_font: false,
    font: "sans",
    custom_font_size: false,
    font_size: 102,
  };
}

/** 从 CSS 里抠出 `var(--名字, 兜底)` 的那个兜底值。抠不到就抛（那说明这条规则没了）。 */
function css兜底(变量: string): string {
  const css = readFileSync(resolve(仓库, "src/styles/editor.css"), "utf8");
  // ⚠️ 用**正则找那一处**而不是把整份 CSS 解析一遍：这里要的就是那三个已知的
  // 兜底值，解析器只会多一层会坏的机器。
  const m = new RegExp(`var\\(\\s*${变量}\\s*,\\s*([^)]+?)\\s*\\)`).exec(css);
  if (!m?.[1]) throw new Error(`editor.css 里找不到 var(${变量}, …) 的兜底值`);
  return m[1];
}

/** 从 Rust 那份默认值里抠出某个字段的字面量。 */
function rust默认值(字段: string): number {
  const 源码 = readFileSync(resolve(仓库, "src-tauri/src/settings/document.rs"), "utf8");
  const m = new RegExp(`\\b${字段}:\\s*(\\d+)`).exec(源码);
  if (!m?.[1]) throw new Error(`settings/document.rs 里找不到 ${字段} 的默认值`);
  return Number(m[1]);
}

/* ── 第 1 组：默认全关 = 一个变量都不写 ─────────────────────────────── */

组("默认（四项全关）");

测("四项全关时返回空对象——让文档主题说话", () => {
  等(Object.keys(正文排版变量(全关())).length, 0, "关着就不该写变量");
});

测("设置还没读回来（undefined）时也什么都不写", () => {
  // ⚠️ 不是"按默认值写一遍"：启动那一小会儿写下去的排版，是真设置到达之前
  // 用户没选过的东西。
  等(Object.keys(正文排版变量(undefined)).length, 0, "不知道就别写");
});

/* ── 第 2 组：默认值与别处的默认值**必须一致**（这一组是这份测试的重点）── */

组("默认值不许分叉");

测("CSS 兜底值就是 Rust 默认值（同一个数，两个写法）", () => {
  // 行距：Rust 175 ↔ CSS 1.75
  等(css兜底("--doc-line-height"), "1.75", "CSS 里行距的兜底值");
  等(rust默认值("line_height"), 175, "Rust 里行距的默认值");
  等(rust默认值("line_height") / 100, 1.75, "两处要指同一个数");

  // 段距：Rust 85 ↔ CSS 0.85em
  等(css兜底("--doc-para-gap"), "0.85em", "CSS 里段距的兜底值");
  等(rust默认值("paragraph_gap"), 85, "Rust 里段距的默认值");
  等(rust默认值("paragraph_gap") / 100, 0.85, "两处要指同一个数");

  // 字号：Rust 102 ↔ CSS 1.02em
  等(css兜底("--doc-font-size"), "1.02em", "CSS 里字号的兜底值");
  等(rust默认值("font_size"), 102, "Rust 里字号的默认值");
  等(rust默认值("font_size") / 100, 1.02, "两处要指同一个数");
});

测("把默认值原样打开，算出来的值**与 CSS 兜底值逐字相同**", () => {
  // ⚠️ 这一条比上面那一条更狠：上面比的是"数"，这条比的是**算出来的字符串**。
  // `175 / 100` 在 JS 里是 `1.75`，但换成 `1.7` / `1.7500000000000002` 这种
  // 写法一样能过上面那条（前者是四舍五入的错、后者是浮点尾巴），
  // 而它们都会让"打开开关"这个动作在视觉上出问题（前者真的会变矮）。
  const 出 = 正文排版变量({
    ...全关(),
    custom_line_height: true,
    custom_paragraph_gap: true,
    custom_font_size: true,
  });
  等(出["--doc-line-height"], "1.75", "行距");
  等(出["--doc-para-gap"], "0.85em", "段距");
  等(出["--doc-font-size"], "1.02em", "字号");
});

/* ── 第 3 组：每一项各写各的变量，关着的那项不写 ───────────────────── */

组("四项各写各的");

测("只开行距时，只有 `--doc-line-height` 出现", () => {
  const 出 = 正文排版变量({ ...全关(), custom_line_height: true, line_height: 200 });
  等(Object.keys(出).length, 1, "只该有一个变量");
  等(出["--doc-line-height"], "2", "200 → 2");
});

测("四项全开时四个变量都在，且不串门", () => {
  const 出 = 正文排版变量({
    custom_line_height: true,
    line_height: 160,
    custom_paragraph_gap: true,
    paragraph_gap: 120,
    custom_font: true,
    font: "serif",
    custom_font_size: true,
    font_size: 115,
  });
  等(出["--doc-line-height"], "1.6", "行距");
  等(出["--doc-para-gap"], "1.2em", "段距");
  等(出["--doc-font-size"], "1.15em", "字号");
  断言((出["--font-doc"] ?? "").includes("serif"), `字体该是衬线栈，实际 ${出["--font-doc"]}`);
});

测("三档字体各自成栈，且**每档都带通用族兜底**", () => {
  for (const [档, 兜底] of [
    ["sans", "sans-serif"],
    ["serif", "serif"],
    ["mono", "monospace"],
  ] as const) {
    const 出 = 正文排版变量({ ...全关(), custom_font: true, font: 档 });
    const 栈 = 出["--font-doc"] ?? "";
    断言(栈.length > 0, `${档} 该有一个栈`);
    // ⚠️ 兜底那一段是**必须**的：前面那些具名字体在这台机器上多半不存在，
    // 没有兜底就落到浏览器的默认字体上——不报错，只是看着不对。
    const 认 = 档 === "mono" ? 栈.includes("--font-mono") : 栈.endsWith(兜底);
    断言(认, `${档} 这一档没有兜底：${栈}`);
  }
});

测("等宽那一档交给外壳的代码字体（不抄一份字体栈过来）", () => {
  // ⚠️ 抄一份过来的话，哪天 `--font-mono` 换了，正文和代码块就各走各的。
  等(正文排版变量({ ...全关(), custom_font: true, font: "mono" })["--font-doc"], "var(--font-mono)", "等宽");
});

/* ── 第 4 组：越界的值不许把正文推坏 ───────────────────────────────── */

组("夹范围");

测("手改 settings.toml 写出来的越界值会被夹回去", () => {
  const 出 = 正文排版变量({
    custom_line_height: true,
    line_height: 9999,
    custom_paragraph_gap: true,
    paragraph_gap: 9999,
    custom_font: false,
    font: "sans",
    custom_font_size: true,
    font_size: 9999,
  });
  等(出["--doc-line-height"], String(行距范围.max / 100), "行距夹到上限");
  等(出["--doc-para-gap"], `${段距范围.max / 100}em`, "段距夹到上限");
  等(出["--doc-font-size"], `${字号范围.max / 100}em`, "字号夹到上限");
});

测("段距 0 是**正当取值**，不许被当成「没设」", () => {
  // ⚠️ 这一条盯的是"拿 0 当哨兵"那种改法：段距 0（段落挨着）与"跟随主题"
  // 是两件事，撞在同一个数上就会让选紧凑排版的人得到主题的间距。
  const 出 = 正文排版变量({ ...全关(), custom_paragraph_gap: true, paragraph_gap: 0 });
  等(出["--doc-para-gap"], "0em", "0 就该是 0");
});

测("负数/小数会被夹回去（`-5` → 下限，`102.6` → 103）", () => {
  等(正文排版变量({ ...全关(), custom_line_height: true, line_height: -5 })["--doc-line-height"], String(行距范围.min / 100), "负数夹到下限");
  等(正文排版变量({ ...全关(), custom_font_size: true, font_size: 102.6 })["--doc-font-size"], "1.03em", "小数四舍五入");
});

/* ── 收尾 ──────────────────────────────────────────────────────────── */

console.log(`\n通过 ${过}，失败 ${败}`);
if (败 > 0) {
  console.log("失败的是：");
  for (const n of 败的) console.log(`  - ${n}`);
  process.exit(1);
}
