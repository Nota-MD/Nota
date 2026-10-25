/**
 * `src/editor/math-suggest.ts`（公式源码框的**命令候选弹窗**）的**可运行**测试集。
 *
 * # 跑法（不装任何包：`esbuild` 与 `node` 仓库里都现成）
 *
 * ```sh
 * cd <仓库>
 * npx esbuild tests/math-suggest.test.ts --bundle --platform=node --format=esm \
 *   --outfile=/tmp/nota-math-suggest-test/math-suggest.test.mjs
 * node /tmp/nota-math-suggest-test/math-suggest.test.mjs
 * ```
 *
 * 全过退出码 0；有不过的退出码 1，并把名字列出来。
 *
 * # 这份测试是为什么写的（2026-10-04）
 *
 * 用户点的第三条：**敲 `\` 弹命令候选、带渲染预览**。判据与表在
 * `math-commands.ts`（那一层测在 `tests/math-commands.test.ts`），这一份盯的是
 * **弹窗自己那一层**：什么时候开、什么时候收、方向键怎么走、回车与鼠标点了之后
 * 交出去的是什么。
 *
 * 喂的是 `tests/fake-dom.ts` 那颗假 DOM，所以：
 *
 * - **预览是注入的**（`画预览`）：假 DOM 里 `katex.render` 跑不动（它要真的量尺寸、
 *   建一堆 span），而这一层的判据不是"KaTeX 画得对不对"、是"挑中了哪一条"。
 *   注入的那支还会把画过的样本记下来——"同一条命令不重复画"那条就是这么量的。
 * - **键盘递的是键名字符串**（`按键("ArrowDown")`），不是事件对象：这一层不碰事件
 *   （`preventDefault` 归 `math-view.ts`），设计上就是这样的。
 *
 * ⚠️ 与 `math-view.ts` 的**接线**（面板里那一格、`input` 之后喂一次、按键先问弹窗）
 * 不在这份里，在 `tests/math-view.test.ts` 最后那一组——那边才建得出 NodeView。
 *
 * # ⚠️ 这份测试**证明不了**什么
 *
 * CSS 长什么样（弹窗摆在哪、盖住了谁、层高对不对）、KaTeX 画出来的预览像不像、
 * 真浏览器里的焦点与点击顺序——一律未验，是**目检**的事。
 */

import { setLanguage } from "@/i18n";
import { createCommandTable, pickCandidate, candidateLimit, type candidate } from "../src/editor/math-commands";
import { createCreateProposalBox, type CreateProposalBox } from "../src/editor/math-suggest";
import { fakeElement, installFakedocument } from "./fake-dom";

installFakedocument();
// ⚠️ 弹窗上那两句（`LaTeX commands` / `physics`）是**建的时候**取词的，所以语言要在
// 这之前定下来。定成中文是有意的：这样下面两条断言顺带验了 `src/i18n/zh-ui.ts`
// 里那两句译文真的挂上了（只断言英文原文的话，"忘了加译文"这种事看不见）。
setLanguage("zh-CN");

/* ── 一支极小的测试工装（与 `math-view.test.ts` 同一套长相）────────────── */

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

/** 比字符串数组。 */
function equalColumns(actual: readonly string[], expected: readonly string[], description: string): void {
  const a = JSON.stringify(actual);
  const b = JSON.stringify(expected);
  if (a !== b) throw new Error(`${description}：期望 ${b}，实际 ${a}`);
}

/* ── 建一个弹窗（预览注入成"把样本写进那一格"）────────────────────────── */

/** 画过的样本（按调用先后）。⚠️ 每个用例起手清一次。 */
let rendered: string[] = [];
/** 现在这个弹窗的 `收下后` 收到的东西（收到的次数就是数组长度）。 */
let receivePass: { source3: string; cursor: number }[] = [];
/** 报回来的"活动行 id"（`null` 也记）。 */
let activity: (string | null)[] = [];

function create(
  table2: readonly candidate[] = createCommandTable(false),
  inline = false,
  opts: { drawPreview?: (sample: string, target: HTMLElement) => void } = {},
): CreateProposalBox {
  rendered = [];
  receivePass = [];
  activity = [];
  return createCreateProposalBox({
    table2,
    inline,
    drawPreview: opts.drawPreview ?? ((sample, target) => {
      rendered.push(sample);
      target.textContent = sample;
    }),
    receiveBelowAfter: (result3) => receivePass.push(result3),
    reportActivity: (id) => activity.push(id),
  });
}

/** 弹窗里那一行行的元素。 */
function rows(box2: CreateProposalBox): fakeElement[] {
  return (box2.element as fakeElement).childNodes;
}

/** 某一行的名字那一格。 */
function lineName(line3: fakeElement): string {
  return line3.childNodes.find((c) => c.classList.contains("nota-math-suggest-name"))?.textContent ?? "";
}

/* ══ 一、开与合 ════════════════════════════════════════════════════════ */

group("一、开与合（该弹的弹、不该弹的一条都不露）");

testCase("建出来是**关着**的：`hidden` 为真、列表是空的", () => {
  const box2 = create();
  equal(box2.element.hidden, true, "起手就藏着");
  equal(box2.isOpen(), false, "开着()");
  equal(rows(box2).length, 0, "一条都不许有");
});

testCase("根元素的那几样：类名、`role=listbox`、无障碍名字", () => {
  const box2 = create();
  equal(box2.element.className, "nota-math-suggest", "类名");
  equal(box2.element.getAttribute("role"), "listbox", "role");
  equal(box2.element.getAttribute("aria-label"), "LaTeX 命令", "无障碍名字（走 i18n）");
  // ⚠️ 弹窗不是正文，不许被当成可编辑内容（同 `math-view.ts` 那几格）。
  equal(box2.element.contentEditable, "false", "contentEditable");
});

testCase("喂一个 `\\fr`：开了，而且第一条就是 `\\frac`", () => {
  const box2 = create();
  box2.feed("\\fr", 3);
  equal(box2.isOpen(), true, "开着()");
  equal(box2.element.hidden, false, "hidden");
  equal(rows(box2).length, pickCandidate(createCommandTable(false), "fr").length, "条数（与判据一致）");
  equal(lineName(rows(box2)[0] as fakeElement), "\\frac", "第一条");
});

testCase("⚠️ 光标不在命令里（没有当场）→ 关着，一条都不画", () => {
  const box2 = create();
  box2.feed("\\fr", 3);
  box2.feed("x + 1", 5);
  equal(box2.isOpen(), false, "开着()");
  equal(rows(box2).length, 0, "列表也清空");
});

testCase("有当场但一条候选都挑不出来（`\\zz`）→ 关着", () => {
  const box2 = create();
  box2.feed("\\zz", 3);
  equal(box2.isOpen(), false, "开着()");
});

testCase("接着敲字母：列表收窄，选中退回第一条", () => {
  const box2 = create();
  box2.feed("\\f", 2);
  const width = rows(box2).length;
  box2.keypress("ArrowDown");
  equal(box2.selectionOrder(), 1, "先挪到第二条");
  box2.feed("\\fr", 3);
  assertion(rows(box2).length < width, "该收窄");
  equal(box2.selectionOrder(), 0, "列表变了，选中退回第一条");
});

testCase("⚠️ 列表**没变**时不重画（接着敲不许刷一下屏）", () => {
  const box2 = create();
  // ⚠️ `\fr` 与 `\fra` 挑出来的是**同一批**（这一族只有 `\frac`），
  //    所以第二次喂进来的列表一样——那一行元素必须还是原来那颗。
  box2.feed("\\fr", 3);
  const headOnce = rows(box2)[0];
  equal(lineName(headOnce as fakeElement), "\\frac", "先确认这条词挑到的确实是 `\\frac`");
  box2.feed("\\fra", 4);
  assertion(rows(box2)[0] === headOnce, "列表没变就不该重建（元素该还是原来那颗）");
});

testCase("收起来之后列表也清空（下次开是新的）", () => {
  const box2 = create();
  box2.feed("\\fr", 3);
  box2.close4();
  equal(rows(box2).length, 0, "清空");
  equal(box2.element.hidden, true, "hidden");
});

/* ══ 二、键盘 ══════════════════════════════════════════════════════════ */

group("二、键盘（方向键走、回车收、Esc 只收弹窗）");

testCase("ArrowDown / ArrowUp 动选中；到头就停（不绕回）", () => {
  const box2 = create();
  // ⚠️ 得挑一个**至少两条**的词：`\fr` 只挑得到 `\frac`，方向键动不了。
  box2.feed("\\i", 2);
  equal(box2.selectionOrder(), 0, "起手第一条");
  box2.keypress("ArrowDown");
  equal(box2.selectionOrder(), 1, "往下一条");
  box2.keypress("ArrowUp");
  box2.keypress("ArrowUp");
  equal(box2.selectionOrder(), 0, "顶上再往上还是 0（不绕到末尾）");

  const end = rows(box2).length - 1;
  for (let i = 0; i < end + 3; i++) box2.keypress("ArrowDown");
  equal(box2.selectionOrder(), end, "底上再往下还是最后一条");
});

testCase("选中那一条身上有 `nota-math-suggest-on`，别的没有", () => {
  const box2 = create();
  box2.feed("\\i", 2);
  // ⚠️ 每动一次都要**重新取一遍**行：`重画列表` 是整列重建
  //    （`replaceChildren` 之后手里那颗是旧的、已经摘下来的元素）。
  const before2 = rows(box2);
  assertion(before2.length >= 2, "这个词得挑出不止一条");
  assertion((before2[0] as fakeElement).classList.contains("nota-math-suggest-on"), "第一条是选中态");
  box2.keypress("ArrowDown");
  const after = rows(box2);
  assertion(!(after[0] as fakeElement).classList.contains("nota-math-suggest-on"), "第一条不再是");
  assertion((after[1] as fakeElement).classList.contains("nota-math-suggest-on"), "第二条是");
});

testCase("回车 = 收下：`吃了`、交出去的是替换后的源码、弹窗自己收起来", () => {
  const box2 = create();
  box2.feed("x=\\fr", 5);
  const result3 = box2.keypress("Enter");
  equal(result3.consume, true, "吃掉这个键（不然行内公式那边会当成「退出编辑」）");
  equal(receivePass.length, 1, "只交一次");
  equal(receivePass[0]?.source3, "x=\\frac{}{}", "替换后的源码");
  // x0 =1 \2 f3 r4 a5 c6 {7 }8 → 光标在 8（第一个 `{}` 里面）
  equal(receivePass[0]?.cursor, 8, "光标落进第一个 `{}`");
  equal(box2.isOpen(), false, "收下之后弹窗自己收起来");
  // ⚠️ 返回值里**不带**来源：收下这件事只有 `收下后` 一个出口（键盘与鼠标
  //    共用），`math-view.ts` 那边因此只有一份"写进源码框"的代码。
  equal(Object.keys(result3).sort().join(","), "consume", "`按键结果` 里就只有「吃没吃」");
});

testCase("Tab 与回车同一条路", () => {
  const box2 = create();
  box2.feed("\\fr", 3);
  const result3 = box2.keypress("Tab");
  equal(result3.consume, true, "吃了");
  equal(receivePass.length, 1, "交了一次");
  equal(receivePass[0]?.source3, "\\frac{}{}", "源码（与键盘那条路一样，走 `收下后`）");
});

testCase("方向键之后回车收的是**选中那一条**", () => {
  const box2 = create();
  // ⚠️ 得挑一个**至少两条**的词：`\fr` 只挑得到 `\frac`，那条路上方向键动不了。
  box2.feed("\\i", 2);
  assertion(rows(box2).length >= 2, "这个词该挑出不止一条");
  box2.keypress("ArrowDown");
  const thinkWant = lineName(rows(box2)[1] as fakeElement);
  const item4 = createCommandTable(false).find((c) => c.command === thinkWant);
  box2.keypress("Enter");
  equal(receivePass[0]?.source3, item4?.insert, `收的是第二条 ${thinkWant} 的插入体`);
});

testCase("⚠️ Esc 只收弹窗、`吃了`（不拦的话会一路走到「退出编辑」）", () => {
  const box2 = create();
  box2.feed("\\fr", 3);
  const result3 = box2.keypress("Escape");
  equal(result3.consume, true, "吃了");
  equal(box2.isOpen(), false, "弹窗收了");
  equal(receivePass.length, 0, "没有收下任何一条");
});

testCase("⚠️ 左右方向键：收弹窗、**不吃**（光标那一下得留给输入框）", () => {
  const box2 = create();
  box2.feed("\\fr", 3);
  const result3 = box2.keypress("ArrowLeft");
  equal(result3.consume, false, "不吃");
  equal(box2.isOpen(), false, "但收起来（否则列表是按旧光标算的）");

  box2.feed("\\fr", 3);
  equal(box2.keypress("ArrowRight").consume, false, "右也一样");
  equal(box2.isOpen(), false, "右也收");
});

testCase("普通字母不吃（要留给输入框，字进去了再喂一次）", () => {
  const box2 = create();
  box2.feed("\\fr", 3);
  equal(box2.keypress("a").consume, false, "字母");
  equal(box2.keypress("Backspace").consume, false, "退格");
  equal(box2.isOpen(), true, "这两个键不该把弹窗关掉");
});

testCase("⚠️ 关着的时候一个键都不吃（包括 Esc 与回车）", () => {
  const box2 = create();
  equal(box2.keypress("Escape").consume, false, "Esc");
  equal(box2.keypress("Enter").consume, false, "回车");
  equal(box2.keypress("ArrowDown").consume, false, "下");
});

/* ══ 三、鼠标 ══════════════════════════════════════════════════════════ */

group("三、鼠标（点一条就收下它）");

testCase("点第 N 行收下第 N 条（哪怕它不是当前选中那条）", () => {
  const box2 = create();
  box2.feed("\\i", 2);
  const line3 = rows(box2);
  assertion(line3.length >= 2, "至少两条才量得出来");
  const thinkWant = lineName(line3[1] as fakeElement);
  equal(box2.selectionOrder(), 0, "起手选的是第一条（点的那条并不是它）");

  const event = (line3[1] as fakeElement).dispatch("mousedown");
  equal(event.defaultPrevented, true, "必须 preventDefault（不然焦点会被浏览器拿走）");
  equal(receivePass.length, 1, "交了一次");
  assertion(receivePass[0]?.source3.startsWith(thinkWant), `收的是第二条 ${thinkWant}，实际 ${receivePass[0]?.source3}`);
  equal(box2.isOpen(), false, "点完收起来");
});

testCase("点一条也走同一个出口（收下后拿到的是替换后的源码）", () => {
  const box2 = create();
  box2.feed("\\sq", 3);
  const line3 = rows(box2);
  equal(lineName(line3[0] as fakeElement), "\\sqrt", "第一条");
  (line3[0] as fakeElement).dispatch("mousedown");
  equal(receivePass[0]?.source3, "\\sqrt{}", "源码");
  equal(receivePass[0]?.cursor, "\\sqrt{".length, "光标在洞里");
});

/* ══ 四、无障碍那几笔 ══════════════════════════════════════════════════ */

group("四、无障碍（读屏器要知道现在指着哪一条）");

testCase("每一行：`role=option`、有 id、`aria-selected` 跟着选中走", () => {
  const box2 = create();
  box2.feed("\\i", 2);
  const line3 = rows(box2);
  assertion(line3.length >= 2, "至少两条才量得出「跟着选中走」");
  for (const [ordinal, value] of line3.entries()) {
    equal(value.getAttribute("role"), "option", `第 ${ordinal} 行的 role`);
    equal(value.getAttribute("id"), `nota-math-suggest-item-${ordinal}`, `第 ${ordinal} 行的 id`);
  }
  equal(line3[0]?.getAttribute("aria-selected"), "true", "第一条选中");
  equal(line3[1]?.getAttribute("aria-selected"), "false", "第二条没选中");
  box2.keypress("ArrowDown");
  // ⚠️ 重新取一遍（`重画列表` 整列重建，手里那几颗是旧的）。
  const after = rows(box2);
  equal(after[0]?.getAttribute("aria-selected"), "false", "动过之后第一条不再是");
  equal(after[1]?.getAttribute("aria-selected"), "true", "第二条是");
});

testCase("⚠️ `报活动` 报的是「该写到源码框上的那个 id」，收起来时报 `null`", () => {
  const box2 = create();
  box2.feed("\\i", 2);
  equalColumns(activity, ["nota-math-suggest-item-0"], "开了就报第一条");
  box2.keypress("ArrowDown");
  equalColumns(activity, ["nota-math-suggest-item-0", "nota-math-suggest-item-1"], "挪了再报一次");
  box2.close4();
  equalColumns(activity, ["nota-math-suggest-item-0", "nota-math-suggest-item-1", null], "关了报 null");
});

/* ══ 五、预览那一格 ════════════════════════════════════════════════════ */

group("五、预览（画什么、画几次、画不出来怎么办）");

testCase("每一行的预览格里是**那一条的样本**", () => {
  const box2 = create();
  box2.feed("\\sq", 3);
  const line3 = rows(box2)[0] as fakeElement;
  const cell2 = line3.childNodes.find((c) => c.classList.contains("nota-math-suggest-sample"));
  assertion(cell2, "有预览格");
  equal(cell2?.textContent, "\\sqrt{x}", "画的是样本，不是命令名");
});

testCase("⚠️ 同一条命令来回出现**只画一次**（每敲一个键把十条重画一遍是浪费）", () => {
  const box2 = create();
  box2.feed("\\f", 2);
  box2.feed("\\fr", 3);
  box2.feed("\\fra", 4);
  const count = rendered.filter((sample) => sample === "\\frac{a}{b}").length;
  equal(count, 1, `\\frac 的预览只该画一次，实际 ${count} 次`);
});

testCase("⚠️ 预览画不出来**不许**把输入打断（抛出去就吞掉，那一条照样在列表里）", () => {
  const box2 = create(createCommandTable(false), false, {
    drawPreview: () => {
      throw new Error("画不出来");
    },
  });
  box2.feed("\\fr", 3);
  equal(box2.isOpen(), true, "弹窗照常开着");
  equal(lineName(rows(box2)[0] as fakeElement), "\\frac", "那一条照样在");
  const cell2 = (rows(box2)[0] as fakeElement).childNodes.find((c) =>
    c.classList.contains("nota-math-suggest-sample"),
  );
  equal(cell2?.textContent, "", "预览格是空的");
});

/* ══ 六、两档表与两种元素 ══════════════════════════════════════════════ */

group("六、physics 那档的角标、行内公式那棵树的元素名");

testCase("physics 那族的候选上有那个小角标，手写的没有", () => {
  const box2 = create(createCommandTable(true));
  box2.feed("\\dv", 3);
  const line3 = rows(box2)[0] as fakeElement;
  equal(lineName(line3), "\\dv", "挑到 `\\dv`");
  const corner = line3.childNodes.find((c) => c.classList.contains("nota-math-suggest-tag"));
  assertion(corner, "有角标");
  equal(corner?.textContent, "物理", "角标上的字（走 i18n）");

  const handWrite = create();
  handWrite.feed("\\fr", 3);
  equal(
    (rows(handWrite)[0] as fakeElement).childNodes.filter((c) =>
      c.classList.contains("nota-math-suggest-tag"),
    ).length,
    0,
    "手写那条不该有角标",
  );
});

testCase("⚠️ `行内` 那一档：整棵树用 `span`（行内公式活在一个 `<span>` 里，`div` 是非法嵌套）", () => {
  const box2 = create(createCommandTable(false), true);
  equal(box2.element.tagName, "SPAN", "根");
  box2.feed("\\fr", 3);
  const line3 = rows(box2)[0] as fakeElement;
  equal(line3.tagName, "SPAN", "行");
  for (const child2 of line3.childNodes) equal(child2.tagName, "SPAN", `行里的 ${child2.className}`);

  const block = create();
  equal(block.element.tagName, "DIV", "块那档的根是 div");
});

testCase("⚠️ 上限与表的关系：弹出来的条数永远不超过 `候选上限`", () => {
  const table2 = createCommandTable(true);
  const box2 = create(table2);
  for (const word of ["", "a", "s", "d", "v"]) {
    box2.feed(`\\${word}`, word.length + 1);
    const shouldHas = pickCandidate(table2, word).length;
    assertion(shouldHas <= candidateLimit, `词 ${word} 按判据就有 ${shouldHas} 条，超了上限`);
    equal(rows(box2).length, shouldHas, `词 ${word} 弹出来的条数该与判据一致`);
  }
});

/* ── 收尾 ─────────────────────────────────────────────────────────────── */

console.log(`\n${"─".repeat(64)}`);
console.log(`通过 ${pass} 条，失败 ${fail} 条`);
if (fail) {
  console.log(`失败的：\n  - ${failed.join("\n  - ")}`);
  process.exitCode = 1;
}
