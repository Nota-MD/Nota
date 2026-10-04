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

import { 定语言 } from "@/i18n";
import { 建命令表, 挑候选, 候选上限, type 候选 } from "../src/editor/math-commands";
import { 建建议框, type 建议框 } from "../src/editor/math-suggest";
import { 假元素, 装假document } from "./fake-dom";

装假document();
// ⚠️ 弹窗上那两句（`LaTeX commands` / `physics`）是**建的时候**取词的，所以语言要在
// 这之前定下来。定成中文是有意的：这样下面两条断言顺带验了 `src/i18n/zh-ui.ts`
// 里那两句译文真的挂上了（只断言英文原文的话，"忘了加译文"这种事看不见）。
定语言("zh-CN");

/* ── 一支极小的测试工装（与 `math-view.test.ts` 同一套长相）────────────── */

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

/** 比字符串数组。 */
function 等列(实际: readonly string[], 期望: readonly string[], 说明: string): void {
  const a = JSON.stringify(实际);
  const b = JSON.stringify(期望);
  if (a !== b) throw new Error(`${说明}：期望 ${b}，实际 ${a}`);
}

/* ── 建一个弹窗（预览注入成"把样本写进那一格"）────────────────────────── */

/** 画过的样本（按调用先后）。⚠️ 每个用例起手清一次。 */
let 画过: string[] = [];
/** 现在这个弹窗的 `收下后` 收到的东西（收到的次数就是数组长度）。 */
let 收过: { 源: string; 光标: number }[] = [];
/** 报回来的"活动行 id"（`null` 也记）。 */
let 活动: (string | null)[] = [];

function 建(
  表: readonly 候选[] = 建命令表(false),
  行内 = false,
  opts: { 画预览?: (样本: string, 目标: HTMLElement) => void } = {},
): 建议框 {
  画过 = [];
  收过 = [];
  活动 = [];
  return 建建议框({
    表,
    行内,
    画预览: opts.画预览 ?? ((样本, 目标) => {
      画过.push(样本);
      目标.textContent = 样本;
    }),
    收下后: (果) => 收过.push(果),
    报活动: (id) => 活动.push(id),
  });
}

/** 弹窗里那一行行的元素。 */
function 行们(框: 建议框): 假元素[] {
  return (框.元素 as 假元素).childNodes;
}

/** 某一行的名字那一格。 */
function 行名(行: 假元素): string {
  return 行.childNodes.find((c) => c.classList.contains("nota-math-suggest-name"))?.textContent ?? "";
}

/* ══ 一、开与合 ════════════════════════════════════════════════════════ */

组("一、开与合（该弹的弹、不该弹的一条都不露）");

测("建出来是**关着**的：`hidden` 为真、列表是空的", () => {
  const 框 = 建();
  等(框.元素.hidden, true, "起手就藏着");
  等(框.开着(), false, "开着()");
  等(行们(框).length, 0, "一条都不许有");
});

测("根元素的那几样：类名、`role=listbox`、无障碍名字", () => {
  const 框 = 建();
  等(框.元素.className, "nota-math-suggest", "类名");
  等(框.元素.getAttribute("role"), "listbox", "role");
  等(框.元素.getAttribute("aria-label"), "LaTeX 命令", "无障碍名字（走 i18n）");
  // ⚠️ 弹窗不是正文，不许被当成可编辑内容（同 `math-view.ts` 那几格）。
  等(框.元素.contentEditable, "false", "contentEditable");
});

测("喂一个 `\\fr`：开了，而且第一条就是 `\\frac`", () => {
  const 框 = 建();
  框.喂("\\fr", 3);
  等(框.开着(), true, "开着()");
  等(框.元素.hidden, false, "hidden");
  等(行们(框).length, 挑候选(建命令表(false), "fr").length, "条数（与判据一致）");
  等(行名(行们(框)[0] as 假元素), "\\frac", "第一条");
});

测("⚠️ 光标不在命令里（没有当场）→ 关着，一条都不画", () => {
  const 框 = 建();
  框.喂("\\fr", 3);
  框.喂("x + 1", 5);
  等(框.开着(), false, "开着()");
  等(行们(框).length, 0, "列表也清空");
});

测("有当场但一条候选都挑不出来（`\\zz`）→ 关着", () => {
  const 框 = 建();
  框.喂("\\zz", 3);
  等(框.开着(), false, "开着()");
});

测("接着敲字母：列表收窄，选中退回第一条", () => {
  const 框 = 建();
  框.喂("\\f", 2);
  const 宽 = 行们(框).length;
  框.按键("ArrowDown");
  等(框.选中序(), 1, "先挪到第二条");
  框.喂("\\fr", 3);
  断言(行们(框).length < 宽, "该收窄");
  等(框.选中序(), 0, "列表变了，选中退回第一条");
});

测("⚠️ 列表**没变**时不重画（接着敲不许刷一下屏）", () => {
  const 框 = 建();
  // ⚠️ `\fr` 与 `\fra` 挑出来的是**同一批**（这一族只有 `\frac`），
  //    所以第二次喂进来的列表一样——那一行元素必须还是原来那颗。
  框.喂("\\fr", 3);
  const 头一次 = 行们(框)[0];
  等(行名(头一次 as 假元素), "\\frac", "先确认这条词挑到的确实是 `\\frac`");
  框.喂("\\fra", 4);
  断言(行们(框)[0] === 头一次, "列表没变就不该重建（元素该还是原来那颗）");
});

测("收起来之后列表也清空（下次开是新的）", () => {
  const 框 = 建();
  框.喂("\\fr", 3);
  框.关();
  等(行们(框).length, 0, "清空");
  等(框.元素.hidden, true, "hidden");
});

/* ══ 二、键盘 ══════════════════════════════════════════════════════════ */

组("二、键盘（方向键走、回车收、Esc 只收弹窗）");

测("ArrowDown / ArrowUp 动选中；到头就停（不绕回）", () => {
  const 框 = 建();
  // ⚠️ 得挑一个**至少两条**的词：`\fr` 只挑得到 `\frac`，方向键动不了。
  框.喂("\\i", 2);
  等(框.选中序(), 0, "起手第一条");
  框.按键("ArrowDown");
  等(框.选中序(), 1, "往下一条");
  框.按键("ArrowUp");
  框.按键("ArrowUp");
  等(框.选中序(), 0, "顶上再往上还是 0（不绕到末尾）");

  const 末 = 行们(框).length - 1;
  for (let i = 0; i < 末 + 3; i++) 框.按键("ArrowDown");
  等(框.选中序(), 末, "底上再往下还是最后一条");
});

测("选中那一条身上有 `nota-math-suggest-on`，别的没有", () => {
  const 框 = 建();
  框.喂("\\i", 2);
  // ⚠️ 每动一次都要**重新取一遍**行：`重画列表` 是整列重建
  //    （`replaceChildren` 之后手里那颗是旧的、已经摘下来的元素）。
  const 前 = 行们(框);
  断言(前.length >= 2, "这个词得挑出不止一条");
  断言((前[0] as 假元素).classList.contains("nota-math-suggest-on"), "第一条是选中态");
  框.按键("ArrowDown");
  const 后 = 行们(框);
  断言(!(后[0] as 假元素).classList.contains("nota-math-suggest-on"), "第一条不再是");
  断言((后[1] as 假元素).classList.contains("nota-math-suggest-on"), "第二条是");
});

测("回车 = 收下：`吃了`、交出去的是替换后的源码、弹窗自己收起来", () => {
  const 框 = 建();
  框.喂("x=\\fr", 5);
  const 果 = 框.按键("Enter");
  等(果.吃了, true, "吃掉这个键（不然行内公式那边会当成「退出编辑」）");
  等(收过.length, 1, "只交一次");
  等(收过[0]?.源, "x=\\frac{}{}", "替换后的源码");
  // x0 =1 \2 f3 r4 a5 c6 {7 }8 → 光标在 8（第一个 `{}` 里面）
  等(收过[0]?.光标, 8, "光标落进第一个 `{}`");
  等(框.开着(), false, "收下之后弹窗自己收起来");
  // ⚠️ 返回值里**不带**来源：收下这件事只有 `收下后` 一个出口（键盘与鼠标
  //    共用），`math-view.ts` 那边因此只有一份"写进源码框"的代码。
  等(Object.keys(果).sort().join(","), "吃了", "`按键结果` 里就只有「吃没吃」");
});

测("Tab 与回车同一条路", () => {
  const 框 = 建();
  框.喂("\\fr", 3);
  const 果 = 框.按键("Tab");
  等(果.吃了, true, "吃了");
  等(收过.length, 1, "交了一次");
  等(收过[0]?.源, "\\frac{}{}", "源码（与键盘那条路一样，走 `收下后`）");
});

测("方向键之后回车收的是**选中那一条**", () => {
  const 框 = 建();
  // ⚠️ 得挑一个**至少两条**的词：`\fr` 只挑得到 `\frac`，那条路上方向键动不了。
  框.喂("\\i", 2);
  断言(行们(框).length >= 2, "这个词该挑出不止一条");
  框.按键("ArrowDown");
  const 想要 = 行名(行们(框)[1] as 假元素);
  const 条 = 建命令表(false).find((c) => c.命令 === 想要);
  框.按键("Enter");
  等(收过[0]?.源, 条?.插入, `收的是第二条 ${想要} 的插入体`);
});

测("⚠️ Esc 只收弹窗、`吃了`（不拦的话会一路走到「退出编辑」）", () => {
  const 框 = 建();
  框.喂("\\fr", 3);
  const 果 = 框.按键("Escape");
  等(果.吃了, true, "吃了");
  等(框.开着(), false, "弹窗收了");
  等(收过.length, 0, "没有收下任何一条");
});

测("⚠️ 左右方向键：收弹窗、**不吃**（光标那一下得留给输入框）", () => {
  const 框 = 建();
  框.喂("\\fr", 3);
  const 果 = 框.按键("ArrowLeft");
  等(果.吃了, false, "不吃");
  等(框.开着(), false, "但收起来（否则列表是按旧光标算的）");

  框.喂("\\fr", 3);
  等(框.按键("ArrowRight").吃了, false, "右也一样");
  等(框.开着(), false, "右也收");
});

测("普通字母不吃（要留给输入框，字进去了再喂一次）", () => {
  const 框 = 建();
  框.喂("\\fr", 3);
  等(框.按键("a").吃了, false, "字母");
  等(框.按键("Backspace").吃了, false, "退格");
  等(框.开着(), true, "这两个键不该把弹窗关掉");
});

测("⚠️ 关着的时候一个键都不吃（包括 Esc 与回车）", () => {
  const 框 = 建();
  等(框.按键("Escape").吃了, false, "Esc");
  等(框.按键("Enter").吃了, false, "回车");
  等(框.按键("ArrowDown").吃了, false, "下");
});

/* ══ 三、鼠标 ══════════════════════════════════════════════════════════ */

组("三、鼠标（点一条就收下它）");

测("点第 N 行收下第 N 条（哪怕它不是当前选中那条）", () => {
  const 框 = 建();
  框.喂("\\i", 2);
  const 行 = 行们(框);
  断言(行.length >= 2, "至少两条才量得出来");
  const 想要 = 行名(行[1] as 假元素);
  等(框.选中序(), 0, "起手选的是第一条（点的那条并不是它）");

  const 事件 = (行[1] as 假元素).派发("mousedown");
  等(事件.defaultPrevented, true, "必须 preventDefault（不然焦点会被浏览器拿走）");
  等(收过.length, 1, "交了一次");
  断言(收过[0]?.源.startsWith(想要), `收的是第二条 ${想要}，实际 ${收过[0]?.源}`);
  等(框.开着(), false, "点完收起来");
});

测("点一条也走同一个出口（收下后拿到的是替换后的源码）", () => {
  const 框 = 建();
  框.喂("\\sq", 3);
  const 行 = 行们(框);
  等(行名(行[0] as 假元素), "\\sqrt", "第一条");
  (行[0] as 假元素).派发("mousedown");
  等(收过[0]?.源, "\\sqrt{}", "源码");
  等(收过[0]?.光标, "\\sqrt{".length, "光标在洞里");
});

/* ══ 四、无障碍那几笔 ══════════════════════════════════════════════════ */

组("四、无障碍（读屏器要知道现在指着哪一条）");

测("每一行：`role=option`、有 id、`aria-selected` 跟着选中走", () => {
  const 框 = 建();
  框.喂("\\i", 2);
  const 行 = 行们(框);
  断言(行.length >= 2, "至少两条才量得出「跟着选中走」");
  for (const [第, 一] of 行.entries()) {
    等(一.getAttribute("role"), "option", `第 ${第} 行的 role`);
    等(一.getAttribute("id"), `nota-math-suggest-item-${第}`, `第 ${第} 行的 id`);
  }
  等(行[0]?.getAttribute("aria-selected"), "true", "第一条选中");
  等(行[1]?.getAttribute("aria-selected"), "false", "第二条没选中");
  框.按键("ArrowDown");
  // ⚠️ 重新取一遍（`重画列表` 整列重建，手里那几颗是旧的）。
  const 后 = 行们(框);
  等(后[0]?.getAttribute("aria-selected"), "false", "动过之后第一条不再是");
  等(后[1]?.getAttribute("aria-selected"), "true", "第二条是");
});

测("⚠️ `报活动` 报的是「该写到源码框上的那个 id」，收起来时报 `null`", () => {
  const 框 = 建();
  框.喂("\\i", 2);
  等列(活动, ["nota-math-suggest-item-0"], "开了就报第一条");
  框.按键("ArrowDown");
  等列(活动, ["nota-math-suggest-item-0", "nota-math-suggest-item-1"], "挪了再报一次");
  框.关();
  等列(活动, ["nota-math-suggest-item-0", "nota-math-suggest-item-1", null], "关了报 null");
});

/* ══ 五、预览那一格 ════════════════════════════════════════════════════ */

组("五、预览（画什么、画几次、画不出来怎么办）");

测("每一行的预览格里是**那一条的样本**", () => {
  const 框 = 建();
  框.喂("\\sq", 3);
  const 行 = 行们(框)[0] as 假元素;
  const 格 = 行.childNodes.find((c) => c.classList.contains("nota-math-suggest-sample"));
  断言(格, "有预览格");
  等(格?.textContent, "\\sqrt{x}", "画的是样本，不是命令名");
});

测("⚠️ 同一条命令来回出现**只画一次**（每敲一个键把十条重画一遍是浪费）", () => {
  const 框 = 建();
  框.喂("\\f", 2);
  框.喂("\\fr", 3);
  框.喂("\\fra", 4);
  const 次数 = 画过.filter((样本) => 样本 === "\\frac{a}{b}").length;
  等(次数, 1, `\\frac 的预览只该画一次，实际 ${次数} 次`);
});

测("⚠️ 预览画不出来**不许**把输入打断（抛出去就吞掉，那一条照样在列表里）", () => {
  const 框 = 建(建命令表(false), false, {
    画预览: () => {
      throw new Error("画不出来");
    },
  });
  框.喂("\\fr", 3);
  等(框.开着(), true, "弹窗照常开着");
  等(行名(行们(框)[0] as 假元素), "\\frac", "那一条照样在");
  const 格 = (行们(框)[0] as 假元素).childNodes.find((c) =>
    c.classList.contains("nota-math-suggest-sample"),
  );
  等(格?.textContent, "", "预览格是空的");
});

/* ══ 六、两档表与两种元素 ══════════════════════════════════════════════ */

组("六、physics 那档的角标、行内公式那棵树的元素名");

测("physics 那族的候选上有那个小角标，手写的没有", () => {
  const 框 = 建(建命令表(true));
  框.喂("\\dv", 3);
  const 行 = 行们(框)[0] as 假元素;
  等(行名(行), "\\dv", "挑到 `\\dv`");
  const 角 = 行.childNodes.find((c) => c.classList.contains("nota-math-suggest-tag"));
  断言(角, "有角标");
  等(角?.textContent, "物理", "角标上的字（走 i18n）");

  const 手写 = 建();
  手写.喂("\\fr", 3);
  等(
    (行们(手写)[0] as 假元素).childNodes.filter((c) =>
      c.classList.contains("nota-math-suggest-tag"),
    ).length,
    0,
    "手写那条不该有角标",
  );
});

测("⚠️ `行内` 那一档：整棵树用 `span`（行内公式活在一个 `<span>` 里，`div` 是非法嵌套）", () => {
  const 框 = 建(建命令表(false), true);
  等(框.元素.tagName, "SPAN", "根");
  框.喂("\\fr", 3);
  const 行 = 行们(框)[0] as 假元素;
  等(行.tagName, "SPAN", "行");
  for (const 孩 of 行.childNodes) 等(孩.tagName, "SPAN", `行里的 ${孩.className}`);

  const 块 = 建();
  等(块.元素.tagName, "DIV", "块那档的根是 div");
});

测("⚠️ 上限与表的关系：弹出来的条数永远不超过 `候选上限`", () => {
  const 表 = 建命令表(true);
  const 框 = 建(表);
  for (const 词 of ["", "a", "s", "d", "v"]) {
    框.喂(`\\${词}`, 词.length + 1);
    const 该有 = 挑候选(表, 词).length;
    断言(该有 <= 候选上限, `词 ${词} 按判据就有 ${该有} 条，超了上限`);
    等(行们(框).length, 该有, `词 ${词} 弹出来的条数该与判据一致`);
  }
});

/* ── 收尾 ─────────────────────────────────────────────────────────────── */

console.log(`\n${"─".repeat(64)}`);
console.log(`通过 ${过} 条，失败 ${败} 条`);
if (败) {
  console.log(`失败的：\n  - ${败的.join("\n  - ")}`);
  process.exitCode = 1;
}
