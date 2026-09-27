/**
 * 菜单试验台 —— **临时文件，不是产品代码。**
 *
 * 存在的理由：菜单重做之后要**看见**它长什么样，而 Nota 本体是个 Tauri 应用，
 * 在没装窗口管理器的容器里 xdotool 送不进按键（`docs/07` 记过这条）。
 * 这个试验台把**真实的** `MenuBar` 挂在一个普通网页里，用系统 Chrome 无头截图，
 * 于是"弹层什么间距""子菜单飞出对不对""焦点在哪一项"都能看见。
 *
 * ⚠️ 它 import 的是 `src/ui/MenuBar` **本体**，不是复制品——复制品会漂移，
 * 截出来的图就不再说明产品长什么样了。
 *
 * 用法见 `tools/menu-harness/README.md`。
 */

import { StrictMode, useEffect, useState } from "react";
import katex from "katex";
import { createRoot } from "react-dom/client";

import "@/styles/theme.css";
import "@/styles/app.css";
import { MenuBar } from "@/ui/MenuBar";
// front matter 那条场景（`#frontmatter`）：**真**编辑器＋**真**那两个纯函数。
import { createEditor } from "@/editor/create";
import { 拆前置块, 拼回前置块 } from "@/editor/front-matter";
import { Sidebar, type SidebarTab } from "@/ui/Sidebar";
import { accelSig, buildAccelIndex, eventAccel, formatAccel, parseAccel } from "@/ui/accel";
import { MENUS, walkMenuItems, type MenuEntry } from "@/ui/commands";
import { buildNativeTree } from "@/ui/nativeMenu";
import {
  PHYSICS_EQUIVALENTS,
  PHYSICS_MACROS,
  PHYSICS_SAMPLES,
  katexOptionsFor,
} from "@/editor/math-macros";

// 一栏里**故意**一半亮一半灰：灰的那些就是"当前做不到"的能力，
// 截图要看的就是这两者**一眼能分开**。
const IMPLEMENTED = new Set([
  "file.new",
  "file.open",
  "file.openFolder",
  "file.save",
  "file.saveAs",
  "file.close",
  "file.preferences",
  "edit.undo",
  "edit.redo",
  "edit.copyAsMarkdown",
  "para.h1",
  "para.h2",
  "para.h3",
  "para.text",
  "para.table",
  "para.codeBlock",
  "para.quote",
  "para.ol",
  "para.ul",
  "para.hr",
  "fmt.bold",
  "fmt.italic",
  "fmt.code",
  "fmt.strike",
  "view.toggleSidebar",
  "view.outline",
  "view.fileTree",
  "view.toggleDock",
  "view.statusBar",
  "view.fullscreen",
  "help.about",
  // ⚠️ 子菜单**至少要有一个子项是"已实现"**，否则按 `App.tsx` 那条规则
  // （子项全灰 → 父项灰）整条飞出都是灰的、键盘**走不进去**。
  // 第一次跑试验台就栽在这儿：夹具里一个导出格式都没实现，于是
  // 「导出」被跳过，脚本卡在"一路 ↓ 找导出"上，日志里看着像遍历坏了。
  "file.exportPdf",
  "file.exportHtmlPlain",
  "para.tableRowBelow",
  "para.tableDelRow",
]);

/** 把 `commands.ts` 整棵树走一遍，算出该灰的 id。**和 App.tsx 同一套判据。** */
function computeDisabled(hasDoc: boolean): Set<string> {
  const out = new Set<string>();

  // ⚠️ 这里**故意把 App.tsx 那段逻辑重抄了一遍**，而不是引它：
  // 引不动——那段在组件体里，闭在 `menuHandlers` 上。抄一遍的代价是
  // 两边可能漂移，所以下面断言"父项灰不灰只由子项决定"这条规则两边一致。
  const off = (item: { id: string; submenu?: MenuEntry[]; needsDoc?: boolean }): boolean => {
    if (item.submenu) return item.submenu.every((c) => c === "sep" || off(c));
    return !IMPLEMENTED.has(item.id) || (!!item.needsDoc && !hasDoc);
  };

  walkMenuItems(MENUS, (item) => {
    if (off(item)) out.add(item.id);
  });
  return out;
}

// ⚠️ 这里是**模仿**后端返回的清单，不调真后端。2026-09-26 内置那批换过
// （六套 → 三套），这里也要跟着换：条目数变了，下面两条断言里的数是**跟着
// 这个数组算出来的**（4 条主题 + 无主题 + 打开主题文件夹 = 6 条真条目）。
const THEMES = [
  { id: "minimal", name: "极简", builtin: true },
  { id: "adwaita", name: "Adwaita", builtin: true },
  { id: "latex", name: "LaTeX", builtin: true },
  { id: "mine", name: "我改的极简", builtin: false },
];

const CHECKS: Record<string, boolean> = {
  "view.toggleSidebar": true,
  "view.outline": true,
  "view.toggleDock": true,
  "view.statusBar": true,
};

/** 等着某个元素出现（React 渲染是异步的，不能直接查）。 */
function waitFor<T extends Element>(sel: string, timeout = 3000): Promise<T> {
  return new Promise((resolve, reject) => {
    const t0 = Date.now();
    const tick = () => {
      const el = document.querySelector<T>(sel);
      if (el) return resolve(el);
      if (Date.now() - t0 > timeout) return reject(new Error(`等不到 ${sel}`));
      setTimeout(tick, 20);
    };
    tick();
  });
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * 按标签找菜单项按钮。
 *
 * ⚠️ 返回的是 `HTMLButtonElement`（`.menu-item` 在 `MenuPopup.tsx` 里就是
 * `<button>`）——不是什么"顺手写的类型"：下面那一句 `exportBtn.disabled`
 * 读的就是 **button 自己的 `disabled`**（灰掉的项要真的按不动，见那边的注释）。
 * 写成 `HTMLElement` 的话 `.disabled` 是 `undefined`，`!undefined` 恒真——
 * 那条断言会**永远报"能用"**，一条永远绿的断言比没有还坏。
 */
function byLabel(label: string, within: ParentNode = document): HTMLButtonElement | null {
  for (const el of within.querySelectorAll<HTMLButtonElement>(".menu-item")) {
    if (el.querySelector(".menu-label")?.textContent === label) return el;
  }
  return null;
}

/**
 * 某一项的名字。**只取 `.menu-label`**，不是整按钮的 `textContent`。
 *
 * ⚠️ 这是个踩过的坑：整按钮的文本是「导出▸」——带了末尾那个箭头（还有快捷键）。
 * 拿它跟 `"导出"` 比永远不相等，于是"一路 ↓ 直到停在导出上"那个循环
 * 会跑满次数然后继续往下按，**把右方向键喂给了一个没有子菜单的项**，
 * 菜单就切到下一栏去了。日志里"按 → 之后有子菜单 = false"就是这么来的——
 * 当时差点当成产品 bug 去查。
 */
function labelOf(el: Element | null): string {
  // ⚠️ **只认菜单项本身**。之前这里对任何元素都退化成"在它后代里找第一个
  // `.menu-label`"，于是焦点掉到 `<body>` 时，它会顺着整篇文档找出**第一项**
  // 报回来——日志上写的是「新建」，看着像"焦点正常回到了第一项"，
  // 实际上焦点已经没了。一个报错的观测工具比没有观测更难查。
  if (!el?.classList.contains("menu-item")) return el ? `<${el.tagName}>` : "(无)";
  return el.querySelector(".menu-label")?.textContent?.trim() ?? "";
}

/**
 * 数学宏表那一场：**把每个 macros 条目都真渲染一遍**。
 *
 * ⚠️ 这是这片代码唯一的实测手段——宏表是抄语义写的，写错不会报编译错，
 * 只会在用户打出来的时候炸（或者更糟：渲染成别的意思）。所以判据是
 * "**每个命令都过一遍 `katex.renderToString`**"，样例表少一条就报出来。
 */
function mathScenario(log: string[]) {
  const 宏 = Object.keys(PHYSICS_MACROS);
  const 缺样例 = 宏.filter((k) => !(k in PHYSICS_SAMPLES));
  log.push(`宏表条目 = ${宏.length}，样例表 = ${Object.keys(PHYSICS_SAMPLES).length}`);
  log.push(`缺样例的宏 = ${缺样例.length ? 缺样例.join(" ") : "无"}`);

  const 试 = (src: string, on: boolean): { ok: boolean; html: string } => {
    try {
      const html = katex.renderToString(src, {
        ...katexOptionsFor(on),
        throwOnError: true, // 试验台里要"错就炸"，这样失败才看得见
      });
      return { ok: true, html };
    } catch {
      return { ok: false, html: "" };
    }
  };

  // ① 开着 physics：每一条都必须能渲染
  const 失败: string[] = [];
  for (const [cmd, src] of Object.entries(PHYSICS_SAMPLES)) {
    if (!试(src, true).ok) 失败.push(cmd);
  }
  log.push(`开着 physics 渲染失败的 = ${失败.length ? 失败.join(" ") : "无"}`);

  // ② 关着 physics：这些命令**应当**是未定义的（说明这一档确实在起作用，
  //    而不是"反正 KaTeX 本来就认"）
  const 本来就认 = Object.entries(PHYSICS_SAMPLES)
    .filter(([, src]) => 试(src, false).ok)
    .map(([cmd]) => cmd);
  log.push(`关着 physics 也能渲染的（= 不靠这套宏） = ${本来就认.join(" ") || "无"}`);

  // ③ \braket 的**参数量**被 Nota 改成两参了（KaTeX 内置是一参、竖线写在里面）。
  //    这一条盯的是"这件事是知道的、不是踩出来的"：一参那个写法在开着 physics
  //    时应当失败、关着时应当能过——两个方向的证据都要。
  log.push(
    `\\braket{a|b}（KaTeX 一参写法）关着 = ${试("\\braket{a|b}", false).ok ? "能渲染" : "⚠️ 不能"}，` +
      `开着 = ${试("\\braket{a|b}", true).ok ? "⚠️ 也能（覆盖没生效？）" : "失败（一参写法换 \\Braket{a|b}）"}`
  );
  log.push(
    `\\Braket{a|b}（Nota 没覆盖的那个名字）开着 = ${试("\\Braket{a|b}", true).ok ? "能渲染" : "⚠️ 不能"}`
  );

  // ③ 重定义：\div / \Re / \Im 两档下必须**画得不一样**（physics 原版就重定义它们）
  for (const src of ["\\div", "\\Re", "\\Im"]) {
    const 关 = 试(src, false);
    const 开 = 试(src, true);
    log.push(
      `${src} 重定义 = ${关.ok && 开.ok && 关.html !== 开.html ? "是" : "⚠️ 没有差别"}`,
    );
  }

  // ④ 化学式：`\ce` / `\pu` 来自 KaTeX **官方**的 mhchem 扩展（`math-macros.ts`
  //    顶上那行副作用导入）。⚠️ 它不跟着 physics 开关走：mhchem 是 KaTeX 自带的
  //    扩展，不是本仓手写的宏，所以任何档位下都可用。
  log.push(`\\ce{H2O} = ${试("\\ce{H2O}", false).ok ? "能渲染" : "⚠️ 不能"}，\\pu{123 kJ} = ${试("\\pu{123 kJ}", false).ok ? "能渲染" : "⚠️ 不能"}`);

  // ⑤ **对照渲染**（2026-09-24 补，见 `PHYSICS_EQUIVALENTS` 的注释）。
  //    ⚠️ 上面 ① 只问"能不能渲染"，而"能渲染、画错了"这一类**它永远抓不到**——
  //    `\dv{f}{x}` 曾经在这里混了整整一轮（画成 `]dxfdfx`、不报错、不红字）。
  //    这里的判据是"**可见文本**和手写等价写法一样"。
  //    ⚠️ 比可见文本、不比整段 HTML：`\frac` 的 DOM 里有些不定的东西，比不得。
  const 可见文本 = (html: string): string => {
    const 去掉注解 = html.replace(/<annotation[\s\S]*?<\/annotation>/g, "");
    return 去掉注解
      .replace(/<[^>]*>/g, "")
      .replace(/[​\s]/g, "")
      .trim();
  };
  const 画错了: string[] = [];
  for (const [宏写法, 手写] of Object.entries(PHYSICS_EQUIVALENTS)) {
    const a = 试(宏写法, true);
    const b = 试(手写, true);
    if (!a.ok || !b.ok || 可见文本(a.html) !== 可见文本(b.html)) {
      画错了.push(`${宏写法}→${a.ok ? `"${可见文本(a.html)}"` : "渲染失败"}≠"${可见文本(b.html)}"`);
    }
  }
  log.push(`对照渲染不一致的 = ${画错了.length ? "⚠️ " + 画错了.join("  ") : "无（共 " + Object.keys(PHYSICS_EQUIVALENTS).length + " 条）"}`);

  // ⑥ 坏公式不该把渲染带炸：KaTeX 的默认是 throwOnError=true，而
  //    `@milkdown/plugin-math` 传的是一份空选项。这一条**故意用正式那份选项**
  //    （不覆盖 throwOnError），盯的就是"Nota 有没有把它盖成 false"——
  //    没盖的话，用户打到一半的 `$x^{` 会在 toDOM 里抛出去。
  try {
    const html = katex.renderToString("x^{", katexOptionsFor(false));
    log.push(
      `坏公式（x^{）在正式选项下 = ${
        html.includes("katex-error") ? "渲染成错误提示，不抛" : "⚠️ 没认出它是错的"
      }`,
    );
  } catch (e) {
    log.push(`坏公式（x^{）在正式选项下 = ⚠️ 抛错了：${e}`);
  }
}

function press(el: Element, key: string) {
  el.dispatchEvent(new KeyboardEvent("keydown", { key, bubbles: true, cancelable: true }));
}

/** 把当前状态写进一个固定的浮层，截图里就能一起看见。 */
function report(lines: string[]) {
  const box = document.createElement("pre");
  box.id = "harness-report";
  box.style.cssText =
    "position:fixed;right:8px;bottom:8px;margin:0;padding:8px 10px;font:12px/1.6 monospace;" +
    "background:#111;color:#0f0;border-radius:6px;z-index:9999;white-space:pre";
  box.textContent = lines.join("\n");
  document.body.appendChild(box);
}

/**
 * `#frontmatter`：开头那段 YAML front matter「进→出」。
 *
 * 分两截，缺一不可：
 *
 * ① 两个纯函数（`editor/front-matter.ts`）：判据对不对、切下来的字节保不保真、
 *    几种边界归哪一支；
 * ② **真 `createEditor` 进→出**——这一截才是这条链的判据。理由是本仓记过的
 *    教训（`docs/07` 第 56 项）：同一份样本，裸探针和真实例会给出**不一样的
 *    结论**，只有后者算数。
 *
 * 为什么要验这件事：`---` 在 CommonMark 里是**分割线**，编辑器不认识 front
 * matter，2026-09-26 实测「打开再存盘」会把它改写成正文（静默的数据损毁，
 * 详情见 `front-matter.ts` 文件头）。这条场景就是把那个病钉住。
 */
async function frontmatterScenario(log: string[]): Promise<void> {
  const 样本 = "---\ntheme: seriph\nlayout: cover\n---\n\n# 标题\n\n正文\n";
  // ⚠️ 前置块**含围栏后面那些空行**（见 `front-matter.ts` 的 `拆分结果`）：
  // 那几行不在这一侧留住，编辑器会把正文开头那个空行顺手删掉。
  const 前置 = "---\ntheme: seriph\nlayout: cover\n---\n\n";
  const 检查: [string, boolean][] = [];
  const 加 = (名: string, 好: boolean) => 检查.push([名, 好]);

  // ── ① 纯函数 ─────────────────────────────────────────────────────────
  const 拆 = 拆前置块(样本);
  加("切出了前置块（含后面那个空行）", 拆.前置块 === 前置);
  加("正文开头不是空行", 拆.正文 === "# 标题\n\n正文\n");
  加("拼回逐字节相同", 拼回前置块(拆.前置块, 拆.正文) === 样本);
  // 围栏后面连几个空行也照留
  const 多空行 = "---\ntheme: x\n---\n\n\n\n甲\n";
  加("连着几个空行也留住", 拆前置块(多空行).前置块 === "---\ntheme: x\n---\n\n\n\n");
  // 只有 front matter、后面什么都没有
  加("只有 front matter 的文档", 拆前置块("---\ntheme: x\n---\n").正文 === "");

  // CRLF / 行尾空格 / `...` 收尾：原文切片，所以一个字都不该动
  const crlf = "---\r\ntheme: x\r\n---\r\n\r\n甲\r\n";
  const 拆crlf = 拆前置块(crlf);
  加("CRLF 也认，且拼回原样", 拼回前置块(拆crlf.前置块, 拆crlf.正文) === crlf);
  const 点收 = 拆前置块("---\ntheme: x\n...\n甲\n");
  加("`...` 也能收尾", 点收.前置块 === "---\ntheme: x\n...\n");
  加("收尾行后没换行也认", 拆前置块("---\ntheme: x\n---").前置块 === "---\ntheme: x\n---");

  // 不认的那几支：`---` 首先是分割线，拿不准就**原样还回去**
  加("没有闭栏 → 不认", 拆前置块("---\n甲\n").前置块 === null);
  加("空块 → 不认", 拆前置块("---\n---\n").前置块 === null);
  加("首行不是第一行 → 不认", 拆前置块("\n---\ntheme: x\n---\n").前置块 === null);
  加("没有 `---` 的普通文档 → 不认", 拆前置块("# 甲\n\n乙\n").前置块 === null);
  加(
    "列表型 YAML → 不认（已知边界）",
    拆前置块("---\n- 甲\n- 乙\n---\n正文\n").前置块 === null,
  );
  // ⚠️ 这一条**钉的是一个已知的误伤**，不是"对"：头尾都是分割线、中间那几行
  // 又**恰好全都**长成 `键: 值` 时，会被当成 front matter（所见即所得里那几行
  // 看不见，源码模式里照旧）。判松的代价是"每开一次盘毁一段文档"，两害相权
  // 取了这个。真改了判据，这条会红——那就连 `front-matter.ts` 文件头那段
  // 边界说明一起改。
  //
  // ⚠️ 样本里**中间那几行必须行行像映射**：留一行普通散文（`甲`）就不认了，
  // 那样这条断言验的是"不认"、跟上面那几条重复，一条永远绿的断言等于没写。
  const 散文 = "---\n\n时间: 昨天\n地点: 家里\n\n---\n";
  加(
    "全是 `键: 值` 的散文被误认（已知边界）",
    拆前置块(散文).前置块 === "---\n\n时间: 昨天\n地点: 家里\n\n---\n",
  );

  // ── ② 真编辑器进→出 ─────────────────────────────────────────────────
  const 台 = document.createElement("div");
  台.setAttribute(
    "style",
    "position:fixed;left:-99999px;top:0;width:800px;visibility:hidden;pointer-events:none",
  );
  document.body.appendChild(台);
  try {
    const 编辑器 = await createEditor({ root: 台, initialMarkdown: 样本 });
    const 出去 = 编辑器.getMarkdown();
    log.push(`出去 = ${JSON.stringify(出去)}`);
    加("出去仍然以前置块开头（逐字节）", 出去.startsWith(前置));
    加("正文里再没有 theme: 那一行", !出去.slice(前置.length).includes("theme:"));
    // ⚠️ **逐字节相同**（含围栏后面那个空行）。这条曾经是红的——空行被正文
    // 那一路规范化掉了，是"把空行也算进前置块"才补齐的（见 `拆分结果`）。
    // 正文**自己**的规范化（尾段、标记写法那些）是另一件事，归 `docs/07`
    // 第 56 项，这条样本恰好没碰到。
    加("进→出逐字节相同", 出去 === 样本);
    // 幂等：把结果再喂回去（这条路正是"切模式/换文档/插件改文档"走的
    // `setMarkdown`），出来还得一样——不然每存一次盘就换一个样。
    编辑器.setMarkdown(出去);
    加("再进一次出来还是同一串（幂等）", 编辑器.getMarkdown() === 出去);
    编辑器.destroy();
  } finally {
    台.remove();
  }

  // 只读那一份（分屏预览 / 导出）：front matter **不该画出来**
  const 预览台 = document.createElement("div");
  预览台.setAttribute("style", "position:fixed;left:-99999px;top:0;width:800px");
  document.body.appendChild(预览台);
  try {
    const 只读 = await createEditor({ root: 预览台, initialMarkdown: 样本, readOnly: true });
    const 画出来的 = 预览台.querySelector(".ProseMirror")?.textContent ?? "";
    加("只读实例里没有 theme 那几个字", !画出来的.includes("theme"));
    加("正文照画", 画出来的.includes("标题"));
    只读.destroy();
  } finally {
    预览台.remove();
  }

  let 不符 = 0;
  for (const [名, 好] of 检查) {
    if (!好) 不符++;
    log.push(`${好 ? "✓" : "✗"} ${名}`);
  }
  log.push(不符 ? `${不符} 条不符` : `front matter ${检查.length} 条全对`);
}

/**
 * 场景。用 `location.hash` 选——Chrome 无头截不同状态只需要换 URL。
 */
async function scenario(hash: string, log: string[]): Promise<void> {
  if (hash === "frontmatter") {
    await frontmatterScenario(log);
    return;
  }

  if (hash === "accel") {
    accelScenario(log);
    return;
  }

  if (hash === "native") {
    nativeScenario(log);
    return;
  }

  if (hash === "sidebar") {
    // ⚠️ `#sidebar-empty` 走这一支、**只验这一件事**：工作区夹具被换成了
    // `null`，文件树那些断言在这条路上没有意义（它们是另一支的事）。
    if (location.hash.includes("empty")) {
      // 大纲来自正文、与工作区无关，所以默认那一页是有内容的——要看空态
      // 得先切到「文件」页。这一句顺带也验了"页签切得动"。
      const treeTab = [...document.querySelectorAll<HTMLElement>(".sidebar-tab")].find(
        (b) => b.textContent === "文件",
      );
      treeTab?.click();
      await waitFor(".sidebar-empty .btn");
      log.push(
        `空态那句话 = ${document.querySelector(".sidebar-empty-lead")?.textContent?.trim() ?? "(没有)"}`,
      );
      const openBtn = document.querySelector<HTMLElement>(".sidebar-empty .btn");
      log.push(`空态那颗按钮 = ${openBtn?.textContent ?? "(没有)"}`);
      openBtn?.click();
      await sleep(60);
      log.push(`点它的回调次数 = ${打开文件夹次数}`);
      return;
    }

    await waitFor(".outline-row");
    const titles = () =>
      [...document.querySelectorAll(".outline-item")].map((e) => e.textContent).join(" / ");

    log.push(`大纲初始 = ${titles()}`);
    log.push(`有子标题的行带三角 = ${document.querySelectorAll(".outline-twisty:not(.outline-twisty-leaf)").length}`);
    log.push(`没子标题的行留占位 = ${document.querySelectorAll(".outline-twisty-leaf").length}`);

    // 折第一个（「一」）——它带着三个子标题
    (document.querySelector(".outline-twisty") as HTMLElement).click();
    await sleep(60);
    log.push(`折「一」之后 = ${titles()}`);
    log.push(`三角转了 = ${document.querySelector(".outline-twisty")?.getAttribute("data-folded")}`);
    log.push(`右侧条数 = ${document.querySelector(".outline-folded-count")?.textContent ?? "(没有)"}`);

    // 再折「二」（此刻它在可见列表里排第 2）
    const twisties = document.querySelectorAll<HTMLElement>(".outline-twisty:not(.outline-twisty-leaf)");
    twisties[twisties.length - 1]?.click();
    await sleep(60);
    log.push(`再折「二」之后 = ${titles()}`);

    // 展开「一」：**「二」那一棵必须还是折着的**（祖先链那条判据）
    (document.querySelector(".outline-twisty") as HTMLElement).click();
    await sleep(60);
    log.push(`展开「一」之后 = ${titles()}`);

    // 大纲点一下（`onJumpOutline`）。⚠️ 点的是**第二行**、不是第一行：
    // 第一行的 `index` 恰好是 0，写成"没反应也算对"就分辨不出来了。
    const 大纲行 = [...document.querySelectorAll<HTMLElement>(".outline-item")];
    大纲行[1]?.click();
    await sleep(60);
    log.push(
      `点第 2 行大纲 → 回调 ${跳大纲.length} 次，给的是 ${跳大纲.length ? JSON.stringify(跳大纲[跳大纲.length - 1]) : "(没有)"}`,
    );

    // 文件树：先切到「文件」页（页签是**真组件**的，所以这条也顺带验了）
    const treeTab = [...document.querySelectorAll<HTMLElement>(".sidebar-tab")].find(
      (b) => b.textContent === "文件",
    );
    treeTab?.click();
    await waitFor(".tree-dir-btn");
    log.push(`切到「文件」页 = ${document.querySelectorAll(".tree-dir-btn, .tree-file-btn").length} 行`);
    (document.querySelector(".tree-dir-btn") as HTMLElement).click();
    await sleep(120);
    log.push(`展开目录后行数 = ${document.querySelectorAll(".tree-dir-btn, .tree-file-btn").length}`);
    log.push(`目录的三角转了 = ${document.querySelector(".tree-twisty")?.getAttribute("data-open")}`);

    // ── 右上角那颗「收起」×（2026-09-24 加的）──────────────────────────
    const closeBtn = document.querySelector<HTMLElement>(".sidebar-close");
    log.push(`收起那颗 × 在不在 = ${!!closeBtn}`);
    log.push(`× 的提示 = ${closeBtn?.getAttribute("title") ?? "(没有)"}`);
    // ⚠️ tablist 的子元素按规矩只能是 tab。× 塞进去读屏会把它念成一个页签。
    log.push(`× 没被塞进 tablist = ${!document.querySelector('[role="tablist"] .sidebar-close')}`);
    // ⚠️ **量几何**，不是查存在：页签文字把 `.sidebar-tabs` 撑宽时 × 会被挤出
    // 可视区，而那种情况下查询照样查得到、`click()` 照样点得动——只有框能看出来。
    const closeBox = closeBtn?.getBoundingClientRect();
    const headBox = document.querySelector(".sidebar-head")?.getBoundingClientRect();
    log.push(
      `× 还在栏内（右边缘 ${closeBox?.right.toFixed(1) ?? "?"} ≤ ${headBox?.right.toFixed(1) ?? "?"}）= ${!!closeBox && !!headBox && closeBox.right <= headBox.right + 0.5}`,
    );
    closeBtn?.click();
    await sleep(60);
    // ⚠️ 试验台里挂的是 Sidebar **本体**，App 不在，所以点了 × 栏子不会消失——
    // 这里能验的、也只该验的是"回调发出去了"。真正的卸载是 `App.tsx` 的事。
    log.push(`点 × 之后回调次数 = ${侧栏关闭次数}`);
    return;
  }

  if (hash === "math") {
    mathScenario(log);
    return;
  }

  if (hash === "theme") {
    (document.querySelector('[data-menu="theme"]') as HTMLElement).click();
    await waitFor(".menu-popup");
    log.push(`主题弹层条目数 = ${document.querySelectorAll(".menu-popup .menu-item").length}`);
    log.push(`选中项 = "${labelOf(document.activeElement)}"`);
    press(document.activeElement ?? document.body, "End");
    await sleep(60);
    log.push(`按 End 之后 = "${labelOf(document.activeElement)}"`);
    return;
  }

  // 默认场景：开「文件」，划到「导出」，再验方向键
  (document.querySelector('[data-menu="file"]') as HTMLElement).click();
  await waitFor(".menu-popup");
  log.push(`文件弹层条目数 = ${document.querySelectorAll(".menu-popup > .menu-item-root > .menu-item").length}`);
  log.push(`开时焦点 = "${labelOf(document.activeElement)}"`);

  if (hash === "dark") return;

  press(document.activeElement ?? document.body, "ArrowDown");

  await sleep(60);
  log.push(`↓ 之后 = "${labelOf(document.activeElement)}"`);

  const exportBtn = byLabel("导出");
  if (!exportBtn) {
    log.push("⚠️ 找不到「导出」");
    return;
  }
  // 键盘路径：一路 ↓ 到「导出」再按 →。**走键盘不走鼠标**是有意的——
  // `onMouseEnter` 是 React 从 `mouseover` 合成出来的，脚本里派一个原生
  // `mouseenter` **不会**触发它（踩过），而方向键这条路是"按下去就得走通"的
  // 主路径，更值得盯。
  log.push(`文档有焦点吗 = ${document.hasFocus()}，activeElement = <${document.activeElement?.tagName}>`);
  log.push(`开时焦点名 = 「${labelOf(document.activeElement)}」`);

  const seen: string[] = [];
  let guard = 0;
  while (labelOf(document.activeElement) !== "导出" && guard++ < 40) {
    seen.push(labelOf(document.activeElement));
    press(document.activeElement ?? document.body, "ArrowDown");
    await sleep(15);
  }
  log.push(`走 ${guard} 步停在「${labelOf(document.activeElement)}」`);
  log.push(`沿途前 6 个 = ${JSON.stringify(seen.slice(0, 6))}`);

  if (hash === "subopen" || hash === "submenu") {
    press(document.activeElement ?? document.body, "ArrowRight");
    await waitFor(".menu-sub");
    if (hash === "subopen") {
      // 停在这儿，让截图里**留着**飞出的那一层
      const sub = document.querySelector(".menu-sub");
      log.push(`→ 之后子菜单条目数 = ${sub?.querySelectorAll(".menu-item").length}`);
      log.push(`子菜单里焦点 = "${labelOf(document.activeElement)}"`);
      return;
    }
    const sub = document.querySelector(".menu-sub");
    log.push(`→ 之后子菜单条目数 = ${sub?.querySelectorAll(".menu-item").length}`);
    log.push(`子菜单里焦点 = "${labelOf(document.activeElement)}"`);
    press(document.activeElement ?? document.body, "ArrowDown");
    await sleep(60);
    log.push(`子菜单里 ↓ = "${labelOf(document.activeElement)}"`);
    press(document.activeElement ?? document.body, "ArrowLeft");
    await sleep(80);
    log.push(`子菜单里 ← 之后：子菜单还在不在 = ${!!document.querySelector(".menu-sub")}`);
    log.push(`焦点回到 = "${labelOf(document.activeElement)}"`);
    return;
  }

  log.push(`「导出」能用吗 = ${!exportBtn.disabled}`);
}

/**
 * 键位表 `ui/accel.ts` 的核对表。
 *
 * 为什么值得单独一个场景：**按键失效是不报错的**——按下去什么都不发生，
 * 和"这个功能还没做"长得一模一样。而这个仓库已经栽过两次，两次都是静默的：
 * `Ctrl+Shift+1/3` 判的是 `e.key`，而 Shift 之下 `e.key` 是上档字符
 * （`"!"` / `"#"`），于是那两条**永远不成立**；`Ctrl+,` 则干脆没写进任何分支。
 *
 * 所以下面每一条都是"**按下去必须得出这个 id**"。表格里 `key` 那一栏
 * 故意照着真实浏览器给的值填（Shift+1 就是 `"!"`），不是照着本仓的规范键名填。
 */
type AccelCase = [string, KeyboardEventInit, string | null, boolean?];

const ACCEL_CASES: AccelCase[] = [
  // ── 现在就该通的 ──────────────────────────────────────────────────
  ["Ctrl+S", { code: "KeyS", key: "s", ctrlKey: true }, "file.save"],
  ["Ctrl+Shift+S", { code: "KeyS", key: "S", ctrlKey: true, shiftKey: true }, "file.saveAs"],
  ["Ctrl+N", { code: "KeyN", key: "n", ctrlKey: true }, "file.new"],
  ["Ctrl+O", { code: "KeyO", key: "o", ctrlKey: true }, "file.open"],
  ["Ctrl+W", { code: "KeyW", key: "w", ctrlKey: true }, "file.close"],
  ["Ctrl+Shift+C", { code: "KeyC", key: "C", ctrlKey: true, shiftKey: true }, "edit.copyAsMarkdown"],
  ["Ctrl+Shift+L", { code: "KeyL", key: "L", ctrlKey: true, shiftKey: true }, "view.toggleSidebar"],
  // ⚠️⚠️ 这两条是**回归测试**：`key` 填的是 Shift 之下的上档字符，
  // 跟真浏览器一模一样。判 `e.key` 的写法在这里算不出来——那正是当初
  // 那两条死代码的成因。它们必须靠 `e.code` 才算得对。
  ["Ctrl+Shift+1（key 是上档字符 !）", { code: "Digit1", key: "!", ctrlKey: true, shiftKey: true }, "view.outline"],
  ["Ctrl+Shift+3（key 是上档字符 #）", { code: "Digit3", key: "#", ctrlKey: true, shiftKey: true }, "view.fileTree"],
  ["Ctrl+1", { code: "Digit1", key: "1", ctrlKey: true }, "para.h1"],
  ["Ctrl+6", { code: "Digit6", key: "6", ctrlKey: true }, "para.h6"],
  ["Ctrl+0", { code: "Digit0", key: "0", ctrlKey: true }, "para.text"],
  // ⚠️ 这一条以前**根本没人接**：菜单上写着 Ctrl+,，按下去没反应。
  ["Ctrl+,（以前没人接）", { code: "Comma", key: ",", ctrlKey: true }, "file.preferences"],
  ["F11", { code: "F11", key: "F11" }, "view.fullscreen"],
  // ⚠️ 这两条是 2026-09-24 补的。原因是**容器里按不出来**：`xdotool` 送 F8/F9
  // 到 WebKit 那一头不响（[nota] 无窗口管理器那件事的同一个根，见
  // `docs/06` §5.10），于是"专注/打字机到底有没有接上键"在本体上问不出来。
  // 这张表是**唯一**能问的地方——而且它问的是同一份 `MENUS` 和同一个
  // `eventAccel`，本体走的就是这条路。
  ["F8（专注模式）", { code: "F8", key: "F8" }, "view.focusMode"],
  ["F9（打字机模式）", { code: "F9", key: "F9" }, "view.typewriter"],
  ["Ctrl+B", { code: "KeyB", key: "b", ctrlKey: true }, "fmt.bold"],
  ["Ctrl+Y", { code: "KeyY", key: "y", ctrlKey: true }, "edit.redo"],
  ["Alt+Shift+5（key 是 %）", { code: "Digit5", key: "%", altKey: true, shiftKey: true }, "fmt.strike"],
  // ── 三种编辑模式（2026-09-23 加的）────────────────────────────────
  // ⚠️ 这三条是**新键族**，此前一条断言都没有：`Alt+数字` 与 `Ctrl+/`。
  // 之所以要现在补上，是因为"键族不统一"这件事本身就是风险——
  // `Ctrl+/` 用的是标点（走 `Slash`），`Alt+1/2` 用的是数字，
  // 而数字那半边正是栽过一次的地方（`Digit` 漏映射时 `e.key` 恰好兜住）。
  ["Alt+1（所见即所得）", { code: "Digit1", key: "1", altKey: true }, "view.modeWysiwyg"],
  ["Ctrl+/（源码模式）", { code: "Slash", key: "/", ctrlKey: true }, "view.modeSource"],
  ["Alt+2（分屏预览）", { code: "Digit2", key: "2", altKey: true }, "view.modeSplit"],
  // ⚠️ 这条是"**不再**被抢走"的证明：Ctrl+Shift+N 归「新建窗口」。
  // 以前那条手链里的 `key === "n"` 不看 Shift，会把它当成「新建」。
  ["Ctrl+Shift+N 归新建窗口", { code: "KeyN", key: "N", ctrlKey: true, shiftKey: true }, "file.newWindow"],
  // ── 缩放那三档（2026-09-27，「视图 → 放大 / 缩小 / 实际大小」）────────
  // ⚠️ `Ctrl+=` 那一条：`code` 是 `Equal`、`key` 是 `"="`。这也是"为什么不认
  // `Ctrl+Shift+=`"的现场——Shift 之下 `key` 变成 `"+"`、`shiftKey` 为真，
  // 算出来是**另一个签名**，`accelSig` 把它们当两个键位（那是有意的）。
  ["Ctrl+=（放大）", { code: "Equal", key: "=", ctrlKey: true }, "view.zoomIn"],
  ["Ctrl+-（缩小）", { code: "Minus", key: "-", ctrlKey: true }, "view.zoomOut"],
  // ⚠️⚠️ **这一条是撞车留下的回归测试**：复位缩放本来要排 `Ctrl+0`（浏览器
  // 里的惯例键），而 `Ctrl+0` 在本仓是「正文」（见上面那条）。这张表第一次
  // 跑就报了撞车，于是复位改成 `Ctrl+Shift+0`。谁要把它挪回去，这里会红。
  // ⚠️ `key` 填 `")"` 是**真浏览器给的值**（Shift+0 的上档字符）——这条同时
  // 也在验"判键位靠 `e.code` 不靠 `e.key`"。
  ["Ctrl+Shift+0（实际大小）", { code: "Digit0", key: ")", ctrlKey: true, shiftKey: true }, "view.zoomReset"],

  // ── 不该接的（放行给 ProseMirror / 系统）───────────────────────────
  ["Ctrl+Alt+1（ProseMirror 的标题键）", { code: "Digit1", key: "1", ctrlKey: true, altKey: true }, null],
  ["Ctrl+Shift+5（没绑过）", { code: "Digit5", key: "%", ctrlKey: true, shiftKey: true }, null],
  ["Ctrl+Shift+Z（ProseMirror 的重做）", { code: "KeyZ", key: "Z", ctrlKey: true, shiftKey: true }, null],
  ["光一个字母 s", { code: "KeyS", key: "s" }, null],
  ["光一个 F12", { code: "F12", key: "F12" }, null],

  // ── macOS：标签里的 Ctrl 指的是 ⌘ ────────────────────────────────
  ["mac ⌘S", { code: "KeyS", key: "s", metaKey: true }, "file.save", true],
  ["mac 光按 Control+S 不接", { code: "KeyS", key: "s", ctrlKey: true }, null, true],
  ["mac ⌘⇧S", { code: "KeyS", key: "S", metaKey: true, shiftKey: true }, "file.saveAs", true],
  // ⚠️ `Ctrl+/` 在 macOS 上要变成 ⌘/（muda 那条"Ctrl 一律翻 CmdOrCtrl"的同一回事）。
  // `Alt+1/2` 在 macOS 上是 ⌥1/⌥2，⌥ 不参与这次翻译，所以只验显示。
  ["mac ⌘/", { code: "Slash", key: "/", metaKey: true }, "view.modeSource", true],
];

/** 显示文本的核对表。macOS 上要换成符号写法。 */
const FORMAT_CASES: Array<[string, boolean, string]> = [
  ["Ctrl+Shift+S", false, "Ctrl+Shift+S"],
  ["Ctrl+Shift+S", true, "⇧⌘S"],
  ["Ctrl+,", true, "⌘,"],
  ["Alt+↑", true, "⌥↑"],
  ["F11", true, "F11"],
  ["Ctrl+1", true, "⌘1"],
  ["Ctrl+\\", true, "⌘\\"],
  ["Ctrl+Shift+`", true, "⇧⌘`"],
  ["Alt+2", true, "⌥2"],
];

function accelScenario(log: string[]): void {
  // 撞车和认不出来都会 `console.warn`，这里先接住——**构建这张表本身就得是干净的**。
  const warnings: string[] = [];
  const realWarn = console.warn;
  console.warn = (...args: unknown[]) => warnings.push(args.join(" "));
  const index = buildAccelIndex(MENUS);
  console.warn = realWarn;

  log.push(`键位表条目数 = ${index.size}`);
  log.push(warnings.length ? `构建时警告 ${warnings.length} 条：${warnings.join(" / ")}` : "构建时没有警告");

  let bad = 0;
  for (const [name, init, want, mac] of ACCEL_CASES) {
    const ev = new KeyboardEvent("keydown", init);
    const sig = accelSig(eventAccel(ev, mac ?? false));
    const got = index.get(sig) ?? null;
    if (got !== want) {
      bad++;
      // 带上**算出来的键位**：只有"不符"两个字的话，接下来只能靠猜
      // 是解析错了、还是事件压根没带上 `code`。
      log.push(`✗ ${name}：期望 ${want ?? "(不接)"}，实得 ${got ?? "(不接)"}（算出的键位 ${sig}）`);
    }
  }
  log.push(bad ? `键位表 ${bad} 条不符（共 ${ACCEL_CASES.length}）` : `键位表 ${ACCEL_CASES.length} 条全对`);

  let badFmt = 0;
  for (const [text, mac, want] of FORMAT_CASES) {
    const got = formatAccel(text, mac);
    if (got !== want) {
      badFmt++;
      log.push(`✗ 显示 ${text}（mac=${mac}）：期望 "${want}"，实得 "${got}"`);
    }
  }
  log.push(
    badFmt ? `显示 ${badFmt} 条不符（共 ${FORMAT_CASES.length}）` : `显示 ${FORMAT_CASES.length} 条全对`,
  );

  // 写错的键位**必须**被喊出来，不能静默失效——这是这个模块存在的理由本身。
  log.push(`乱写的 "Ctrl+Foo+S" 解析 = ${parseAccel("Ctrl+Foo+S") === null ? "null（会警告）" : "有结果 ✗"}`);
}

/**
 * 推给原生菜单（macOS）的那棵树长什么样。
 *
 * 这一层在 Linux 上**跑不到**——`native_menu::apply` 在非 macOS 直接返回
 * `Ok(false)`。所以形状对不对，只能在这里、在**推出去之前**验。
 */
function nativeScenario(log: string[]): void {
  const disabled = computeDisabled(true);
  const tree = buildNativeTree(MENUS, disabled, CHECKS, THEMES, "minimal");

  const find = (nodes: typeof tree, id: string): (typeof tree)[number] | undefined => {
    for (const n of nodes) {
      if (n.id === id) return n;
      const hit = n.submenu ? find(n.submenu, id) : undefined;
      if (hit) return hit;
    }
    return undefined;
  };

  const checks: Array<[string, boolean]> = [
    ["顶层栏数 = 8", tree.length === MENUS.length],
    // 「主题」那栏的内容是**合成**的，静态表里是空的——这里最容易推出去一个空菜单。
    // ⚠️ 8 = 6 条真条目 + 2 条分隔线。**两个数分开断言**：
    // 只说"6"的话，分隔线被吃掉（菜单挤成一坨）也在数里看不出来。
    // ⚠️ 这两个数是跟着上面 `THEMES` 的条数算的（4 条主题 ＋ 无主题 ＋
    // 「打开主题文件夹…」），**加一条 mock 主题就要同时改这里**。
    ["主题栏条目数 = 8（含 2 条分隔线）", (find(tree, "theme")?.submenu?.length ?? -1) === 8],
    [
      "主题栏真条目 = 6",
      (find(tree, "theme")?.submenu ?? []).filter((n) => n.sep !== true).length === 6,
    ],
    ["主题栏里有分隔线", (find(tree, "theme")?.submenu ?? []).some((n) => n.sep === true)],
    // ⚠️ 当前主题必须**勾上**（这就是 `currentTheme` 那个 prop 以前没人用的毛病）。
    ["极简被勾上", find(tree, "__theme:minimal")?.checked === true],
    ["LaTeX 没被勾", find(tree, "__theme:latex")?.checked === false],
    ["无主题没被勾", find(tree, "__theme-none")?.checked === false],
    // ⚠️⚠️ 这两条是**同一件事的两面**：普通项必须是 `undefined`（不画勾），
    // 可勾项必须是真布尔（画一个空位）。判错的效果是整栏缩进不齐。
    ["普通项 checked = undefined", find(tree, "file.save")?.checked === undefined],
    ["可勾项 checked 是真布尔", typeof find(tree, "view.toggleSidebar")?.checked === "boolean"],
    ["侧边栏勾着", find(tree, "view.toggleSidebar")?.checked === true],
    // 灰/亮如实传下去（Rust 那边据此决定建不建、带不带快捷键）。
    ["已实现的项是亮的", find(tree, "file.save")?.enabled === true],
    ["没实现的项是灰的", find(tree, "file.quickOpen")?.enabled === false],
    ["键位原样带过去（不在这边转）", find(tree, "file.saveAs")?.accel === "Ctrl+Shift+S"],
    ["箭头键位带的是字形", find(tree, "edit.moveLineUp")?.accel === "Alt+↑"],
    // 带子菜单的项**自己不执行命令**，所以不该有 enabled / accel。
    ["父项不带 enabled", find(tree, "file.export")?.enabled === undefined],
    ["父项不带 accel", find(tree, "file.export")?.accel === undefined],
    ["子菜单里的项也在", find(tree, "file.exportPdf") !== undefined],
  ];

  let bad = 0;
  for (const [name, ok] of checks) {
    if (!ok) bad++;
    log.push(`${ok ? "✓" : "✗"} ${name}`);
  }
  log.push(bad ? `${bad} 条不符` : `推给原生菜单的树 ${checks.length} 条全对`);
}

/**
 * 侧栏右上角那颗 × 被点过几次。
 *
 * ⚠️ 放在模块层而不是 `Harness` 里：`scenario()` 与它是两个函数，
 * 计数器进 state 就得再往 `scenario` 传一个读数回调，而这里要的只是
 * "点了一下有没有反应"。见 `#sidebar` 场景末尾那段。
 */
let 侧栏关闭次数 = 0;

/** 「打开文件夹…」那颗按钮被点过几次（`#sidebar-empty` 场景）。 */
let 打开文件夹次数 = 0;

/** 大纲上点过的目标（`#sidebar`）。只记不用：见 `onJumpOutline` 那儿。 */
const 跳大纲: { line: number; index: number }[] = [];

function Harness() {
  const [disabled] = useState(() => computeDisabled(true));
  /** 侧栏夹具只在 `#sidebar` 场景里挂——试验台平时不放它。 */
  const [sidebarScene] = useState(() => location.hash.replace(/^#/, "").split("-")[0] === "sidebar");
  /**
   * `#sidebar-empty`：把工作区夹具换成"还没打开"。
   *
   * ⚠️ 判据是 hash **含** `empty` 而不是等于某个串：外观那两段也在 hash 里
   *（`#sidebar-empty-ghub-dark`），写死等于会把这几种组合全漏掉。
   */
  const [sidebarEmpty] = useState(() =>
    location.hash.replace(/^#/, "").split("-").includes("empty"),
  );
  /** 夹具那一栏的页签。默认「大纲」：脚本前半段验的就是它。 */
  const [sidebarTab, setSidebarTab] = useState<SidebarTab>("outline");

  useEffect(() => {
    void (async () => {
      // 轴一 / 轴二由 hash 选：`#dark`、`#ghub-dark` 这样。
      // 只认这两种写法是有意的——试验台不打算复刻整套 14 格，
      // 它要回答的是"弹层在另一条轴上还看不看得见"。
      // `#<场景>`、`#<场景>-<风格>-<明暗>`，比如 `#submenu-ghub-dark`。
      // 场景单独取第一段：`scenario()` 按它分支，外观那两段它不关心。
      const raw = location.hash.replace(/^#/, "");
      // ⚠️ `= ""` 不能省：`noUncheckedIndexedAccess` 下下标取出来是
      // `string | undefined`，而 `scenario()` 要一个 `string`。
      // 空 hash（直接打开页面）本来就该走默认那一支，给空串正好。
      const [scene = "", style, mode] = raw.split("-");
      if (mode === "light" || mode === "dark") document.documentElement.dataset.uiMode = mode;
      if (style) document.documentElement.dataset.uiStyle = style;

      // ⚠️ 异常**必须**也报出来。不接的话脚本一挂，报告框整个不出现，
      // 截出来的图看起来就像"只开了一个菜单"，完全看不出是脚本死了——
      // 上一次就是这么盯着截图猜了半天。
      // ⚠️ 异常是**追加**到日志尾巴上，不是替换。替换过一次，结果
      // "循到哪一步才出的事"全丢了，只剩下最后一句报错，比不接还难查。
      let log: string[] = [];
      try {
        await scenario(scene, log);
      } catch (err) {
        log.push(`💥 脚本抛异常：${err instanceof Error ? err.message : String(err)}`);
        const open = document.querySelector(".menu-title-open")?.textContent;
        log.push(`当时开着的是「${open ?? "(全关)"}」`);
        log.push(`弹层还在不在 = ${!!document.querySelector(".menu-popup")}`);
      }
      log.push(`外观 = ${document.documentElement.dataset.uiStyle}/${document.documentElement.dataset.uiMode}`);
      report(log);
      // 给无头截图一个稳定的落点
      document.title = "ready";
    })();
  }, []);

  return (
    <StrictMode>
      <div style={{ height: 38, display: "flex", alignItems: "center", padding: "0 8px", background: "var(--bg-subtle)" }}>
        <MenuBar
          // ⚠️ `menus` 是 2026-09-24 起**必填**的 prop（插件的菜单项是运行时
          // 才知道的，见 `MenuBar` 的 `Props`）。这里补上静态表那份——少了
          // 它 `props.menus.map` 当场抛，整页白屏。
          //
          // ⚠️ 这一格漏了整整两天没被发现，原因是**试验台不在
          // `npm run typecheck` 的范围内**（`tsconfig.include` 只有 `src`）：
          // `vite build` 不做类型检查，`MenuBar` 多一个必填 prop 它照建不误，
          // 只有真打开页面才白屏。改产品组件（`MenuBar` / `Sidebar`）的 props
          // 时，**顺手 `npx tsc --noEmit -p tools/menu-harness` 一下**（那份
          // 配置让整个 tools/ 也进检查）。
          menus={MENUS}
          disabled={disabled}
          checks={CHECKS}
          themes={THEMES}
          currentTheme="minimal"
          onCommand={(id) => console.log("command", id)}
          onTheme={(id) => console.log("theme", id)}
          onOpenThemesDir={() => console.log("themes-dir")}
        />
      </div>
      <div style={{ padding: 24, color: "var(--fg-muted)" }}>（试验台页面，不是产品界面）</div>

      {sidebarScene && (
        // ⚠️ 挂的是 `src/ui/Sidebar.tsx` **本体**。夹具（正文、树、取子目录）
        // 写在下面那三个常量里——试验台要能**造**出"折起来之后长什么样"，
        // 而真实工作区和真实文档在这儿拿不到。
        <div style={{ width: 240, height: 420, border: "1px solid var(--border)" }}>
          <Sidebar
            workspace={sidebarEmpty ? null : "/tmp/夹具"}
            tree={TREE_FIXTURE}
            // ⚠️ 第三页「文档列表」那三样（2026-09-27 补的夹具）：侧栏加了这
            // 三个 props 之后，这一场一直缺着，工装闸也就一直红着——它不是
            // 产品代码的问题，是**夹具没跟上**。夹具给两条，够验"列得出、点得动"。
            最近={RECENT_FIXTURE}
            onOpenRecent={(p) => console.log("recent-open", p)}
            onForgetRecent={(p) => console.log("recent-forget", p)}
            docText={DOC_FIXTURE}
            strict={false}
            tab={sidebarTab}
            onTab={setSidebarTab}
            onOpenFile={(p) => console.log("open", p)}
            // ⚠️ 大纲点一下要跳正文（`docs/07` 第 48 项）。这一场只把目标
            // 记下来：真正"跳到第几个标题"由编辑器那一侧验，试验台这边
            // 没有编辑器，验不了"跳没跳过去"。
            onJumpOutline={(t) => {
              跳大纲.push(t);
              console.log("jump-outline", t);
            }}
            loadDir={loadDirFixture}
            // ⚠️ 数一下回调次数，不在这儿真把栏子撤掉：试验台要验的是
            // "× 点得动、回调发得出去"，卸载归 `App.tsx` 管。
            onClose={() => {
              侧栏关闭次数++;
            }}
            onOpenFolder={() => {
              打开文件夹次数++;
            }}
          />
        </div>
      )}
    </StrictMode>
  );
}

/** 侧栏夹具用的正文：三级层级 + 两个根标题，够验"折一层、再折一层"。 */
const DOC_FIXTURE = ["# 一", "## 一甲", "### 一甲子", "## 一乙", "# 二", "## 二甲"].join("\n");

/**
 * 夹具「最近打开过」：两条。
 *
 * ⚠️ 两条**故意分居两个目录**（一条在夹具工作区里、一条在别处）：这一页要
 * 说明的正是"它跟工作区无关"——合成一条的话，看缩略图的人会以为这一页是
 * 文件树的一部分。
 */
const RECENT_FIXTURE = ["/tmp/夹具/读我.md", "/home/别人/随手一记.md"];

/** 夹具树：一个目录（带一层子节点）+ 一个文件。 */
const TREE_FIXTURE = [
  { name: "笔记", path: "笔记", is_dir: true, children: null },
  { name: "读我.md", path: "读我.md", is_dir: false, children: null },
];

/**
 * 夹具的取子目录：**返回一个迟到的 Promise**，模拟真实 IPC。
 * ⚠️ 迟到是故意的——"点开目录到子节点出现"之间那个空档正是要看的，
 * 立刻返回会把"先展开再取"这条设计掩盖过去。
 */
const loadDirFixture = async (sub: string) => {
  await sleep(80);
  return [
    { name: `${sub}/子目录`, path: `${sub}/子目录`, is_dir: true, children: null },
    { name: "子文档.md", path: `${sub}/子文档.md`, is_dir: false, children: null },
  ];
};

createRoot(document.getElementById("root")!).render(<Harness />);
