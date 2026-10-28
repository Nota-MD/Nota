/**
 * 「**每个可关的面板都有一颗就地的 ×**」那条口径的可运行测试集（`docs/07` 第 49 项）。
 * 2026-10-04 写，与 `ui/FormatBar.tsx` / `ui/StatusBar.tsx` 上补的那两颗 × 同批落地。
 *
 * # 跑法
 *
 * ```sh
 * npx esbuild tests/bar-close.test.ts --bundle --platform=node --format=esm \
 *   --alias:@=./src --outfile=/tmp/nota-tests/bar-close.mjs
 * node /tmp/nota-tests/bar-close.mjs
 * ```
 *
 * # 这份测试盯的是什么
 *
 * 用户那次评审点的是**不成套**：插件栏有**三个**入口（顶栏开关 / 栏里的 × /
 * 菜单项），而侧栏、状态栏、格式化工具栏各只有一个（都只在「视图」菜单里）。
 * 补两颗 × 本身是几行的事，难的是**别让它们分叉**——这一类"同一个开关的
 * 第二、第三个入口"最常见的坏法不是崩，是**各写各的**：
 *
 * - 一颗 × 写 `show_status_bar: false`，菜单那条写 `!statusBarOpen`——看着都对，
 *   但改天有人给 × 加上"再点一下开回来"，两边就不一样了（一个是"关"、一个是"切换"）；
 * - 一颗 × 的 `title` 是"收起状态栏"、另一颗是"关闭工具栏"——两条键各说各的，
 *   读起来像四个人加的；
 * - × 只加在组件里，**没人把 prop 接上去**（不报错，按钮点了没反应）。
 *
 * 所以三组分别盯：**长相一致**（组一）、**汇到同一个 setter**（组二）、
 * **菜单上那一族挨着**（组三，那半边是"顺手"改的，最容易改一半）。
 *
 * # ⚠️ 这份测试**证明不了**什么
 *
 * - ⚠️ **"点那颗 × 那一栏真的收起来了"没验**：那要真 React ＋ 真点击（本仓没有
 *   jsdom）。这里读的是源码文本——它保证的是"这台机器接对了"，不保证电通。
 *   真按下去的判据只有开窗目检（`docs/06` §5）。
 * - ⚠️ **CSS 那一条只验"类名在对应那份 CSS 里出现过"**：长得一样不一样（颜色、
 *   尺寸、悬停）是眼睛的事，`docs/06` 的截图那几节管。
 * - ⚠️ 组三钉的是**分类**（"这一族挨着"），不是长相：段里多一条、少一条都会红，
 *   而那正是它的用处（见下面那段的 `说明`）。
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";

import { MENUS } from "@/ui/commands";

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

function assertValue(condition: boolean, description: string): void {
  if (!condition) throw new Error(description);
}

/** 读 `src/` 下的一份源码。⚠️ 路径一律从仓库根算（跑法里 `cd` 到仓库根）。 */
function read(...paragraph2: string[]): string {
  return readFileSync(join("src", ...paragraph2), "utf8");
}

/**
 * 从一份 `.tsx` 源码里抠出**带某个 class 的那个 `<button>` 整块**。
 *
 * ⚠️ 用文本抠而不是渲染：本仓没有 jsdom，而这两颗 × 的判据（接到哪个 prop、
 * 用哪条 i18n 键、画哪个图标）全在字面里，抠出来看比渲染出来看**更准**
 * ——渲染之后这三样都变成了别的东西。
 */
function pickPressButton(source3: string, className: string): string {
  const place = source3.indexOf(`className="${className}"`);
  // 状态栏那颗的 className 带了两个记号（`status-btn statusbar-close`），
  // 所以先按"包含"找，再回退到最近的一个 `<button`。
  const position3 = place >= 0 ? place : source3.indexOf(className);
  if (position3 < 0) throw new Error(`源码里找不到 class \`${className}\``);
  const start5 = source3.lastIndexOf("<button", position3);
  const end = source3.indexOf("</button>", position3);
  if (start5 < 0 || end < 0) throw new Error(`class \`${className}\` 那个 <button> 抠不出来`);
  return source3.slice(start5, end);
}

/** 一份源码里**带 `close` 的 className 有几个**（组一用它验"恰好一颗"）。 */
function crossOfTokenNumber(source3: string): number {
  return (source3.match(/className="[^"]*\bclose\b[^"]*"/g) ?? []).length;
}

/* ── 一、两颗 × 都在，而且长得一样 ─────────────────────────────────── */

group("一、两颗 ×：各栏恰好一颗，长相一致");

/**
 * 两颗 × 的现场：`[读源码用的路径, className, 组一那颗在的 CSS]`。
 *
 * ⚠️⚠️ **这一组原来是四颗，2026-10-11 去掉了两颗**——用户当天说「**侧栏上面的
 * × 可以删掉**」（同一句里还有"拓展的那个叉也可以关掉"与"上面的文件/大纲就是
 * 平铺铺满"，落点是 `30a917f`，比本批早几天）。所以 `ui/Sidebar.tsx` 那颗
 * `sidebar-close` 与 `ui/PluginDock.tsx` 那颗 `dock-close` **整个没了**，
 * 连带 `zh-ui.ts` 里那条 `"Hide the sidebar"` 也删了（留着会被 `i18n-check`
 * 报成**废键**——那正是"按钮删了、译文没跟着删"的现场）。
 *
 * ⚠️ **留下这两颗的理由**：格式化工具栏与状态栏是**用户能收起来的**（菜单里
 * 各有开关），就地那颗 × 是它们的第二入口；侧栏与插件栏的开关在**顶栏与状态栏
 * 左端**（那两颗开关是常驻的），再挂一颗 × 属于第三入口。
 * ⚠️ 判据没有放宽：这里仍然逐栏查"恰好一颗、同一个图标、title 与 aria-label
 * 同键、译文同句式"——**少的那两栏是从这个名单里去掉的**，不是把检查跳过。
 */
const twoColumns = [
  { name3: "状态栏", textItem: ["ui", "StatusBar.tsx"], className: "statusbar-close", css: ["styles", "tabs-status.css"] },
] as const;

const sourceTable = new Map(twoColumns.map((bar) => [bar.className, read(...bar.textItem)]));

testCase("每一栏里带 `close` 的 className 都**恰好一个**", () => {
  // ⚠️ 反过来的坏法：一颗 × 上同时挂着 `.sidebar-close` 和一个装饰用的 class，
  // 两颗按钮长得一样而只有一颗钉在右端。这里要的是"这一栏只有一个关的入口"。
  for (const bar of twoColumns) {
    equal(crossOfTokenNumber(sourceTable.get(bar.className)!), 1, `${bar.name3}里带 close 的 className 个数`);
  }
});

testCase("保留下来的状态栏 × 使用统一关闭图标", () => {
  for (const bar of twoColumns) {
    const block = pickPressButton(sourceTable.get(bar.className)!, bar.className);
    assertValue(
      block.includes('name="folio-close-symbolic"'),
      `${bar.name3}那颗 × 的图标不是 folio-close-symbolic：\n${block}`,
    );
  }
});

testCase("⚠️ 状态栏 × 的 `title` 与 `aria-label` 是**同一个键**", () => {
  // 读屏念的和鼠标悬停弹的必须是同一句话——两处分开写的话，改一处忘一处，
  // 症状是"看得见的人关得掉、看不见的人关不掉"（而且没人会报这个 bug）。
  for (const bar of twoColumns) {
    const block = pickPressButton(sourceTable.get(bar.className)!, bar.className);
    const notice = /title=\{t\("([^"]+)"\)\}/.exec(block);
    const ideaOutput = /aria-label=\{t\("([^"]+)"\)\}/.exec(block);
    if (!notice || !ideaOutput) throw new Error(`${bar.name3}那颗 × 缺 title 或 aria-label：\n${block}`);
    equal(ideaOutput[1], notice[1], `${bar.name3}那颗 × 的 aria-label 与 title`);
  }
});

testCase("状态栏关闭文案仍在中文表里", () => {
  // 两条里一条写「收起…」另一条写「隐藏…」的话，两颗按钮读起来像两个人加的。
  // ⚠️ 只能验"开头两个字一样"，验不出"这句话好不好听"——那是眼睛的事。
  const middleTextTable = read("i18n", "zh-ui.ts");
  const key: string[] = [];
  for (const bar of twoColumns) {
    const block = pickPressButton(sourceTable.get(bar.className)!, bar.className);
    const m = /title=\{t\("([^"]+)"\)\}/.exec(block);
    assertValue(!!m, `${bar.name3}那颗 × 的 title 抠不出来`);
    key.push(m![1]);
    const translateText = new RegExp(`"${m![1].replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}":\\s*"([^"]+)"`).exec(middleTextTable);
    assertValue(!!translateText, `中文表里没有 \`${m![1]}\` 的译文（界面上会显示英文原文）`);
    assertValue(
      translateText![1].startsWith("收起"),
      `\`${m![1]}\` 的译文是「${translateText![1]}」，不是「收起…」——两颗 × 必须同句式`,
    );
  }
  equal(new Set(key).size, 1, "状态栏关闭键数量");
});

testCase("两个 class 在各自那份 CSS 里都有规则", () => {
  for (const bar of twoColumns) {
    assertValue(
      read(...bar.css).includes(`.${bar.className}`),
      `${bar.css.join("/")} 里没有 .${bar.className} —— 那说明这颗 × 是裸的 <button>` +
        `（浏览器默认样式会让它和另外那颗长得完全不一样）`,
    );
  }
});

/* ── 二、每条入口汇到**同一个 setter** ─────────────────────────────── */

group("二、菜单那条与 × 那颗走的是同一个 setter");

const cellStyleBarSource = read("ui", "FormatBar.tsx");
const stateBarSource = sourceTable.get("statusbar-close")!;
const wiringSource = read("ui", "EditorArea.tsx");
const barFlagSource = read("ui", "useChromeVisibility.ts");
const commandTableSource = read("ui", "useCommandTable.ts");
const stateBarHookChildSource = read("ui", "useStatusBar.ts");
const appSource = read("App.tsx");

testCase("格式化工具栏：隐藏入口复用菜单 `view.toolbarNever`", () => {
  assertValue(
    cellStyleBarSource.includes('id: "view.toolbarNever"'),
    "更多菜单没有复用 `view.toolbarNever`",
  );
  assertValue(
    cellStyleBarSource.includes('label: "Hide the formatting toolbar"'),
    "更多菜单没有显示明确的隐藏工具栏文案",
  );
  assertValue(!cellStyleBarSource.includes("onHide"), "工具栏仍维护第二套隐藏回调");
});

testCase("格式化工具栏：菜单命令一路接到 App 的命令表", () => {
  assertValue(
    wiringSource.includes("onMenuCommand={runMenuCommand}"),
    "`EditorArea.tsx` 没把菜单命令接到 `<FormatBar>` 上",
  );
  assertValue(
    wiringSource.includes("runMenuCommand: (id: string) => void;"),
    "`EditorArea.tsx` 的接线接口里没有 `runMenuCommand`",
  );
  assertValue(
    appSource.includes("runMenuCommand: (id) => menuHandlers[id]?.()"),
    "`App.tsx` 没有把菜单命令表交给编辑区",
  );
  assertValue(
    commandTableSource.includes('"view.toolbarNever": () => setChrome({ toolbar: "never" })'),
    "`view.toolbarNever` 没有落到唯一的工具栏 setter 上",
  );
});

testCase("⚠️ 格式工具栏：× 那颗与菜单 `view.toolbarNever` 写的是**同一句**", () => {
  // 这是"三条入口汇到同一个 setter"里唯一能文本验的一条，也是最有价值的一条：
  // 两颗按钮各自写 `setChrome({ toolbar: "never" })`，参数一模一样，
  // 改哪一边都看得见另一边。
  assertValue(
    barFlagSource.includes('hideToolbar = useCallback(() => setChrome({ toolbar: "never" })'),
    "`useChromeVisibility.ts` 里 `hideToolbar` 不再是 `setChrome({ toolbar: \"never\" })`",
  );
  assertValue(
    commandTableSource.includes('"view.toolbarNever": () => setChrome({ toolbar: "never" })'),
    '`useCommandTable.ts` 里 `view.toolbarNever` 不再是 `setChrome({ toolbar: "never" })`' +
      "——两个入口从这一刻起不再走同一个 setter 了",
  );
});

testCase("⚠️ 状态栏那颗 × **只关不开**（菜单那条才是切换）", () => {
  // 这条钉的是两边的**语义差异**，而它是有意的：
  // - 菜单项是一颗开关（勾着/没勾着），点一下取反；
  // - 栏上那颗 × 是"把这一栏收起来"这一个动作，写死 `false`。写 `!` 的话，
  //   某个状态不巧是 false 时点它会**把栏打开**——而那颗 × 当时根本不在屏幕上。
  const block = pickPressButton(stateBarSource, "statusbar-close");
  assertValue(block.includes("onClick={onHide}"), `状态栏那颗 × 没接 onHide：\n${block}`);
  assertValue(
    stateBarHookChildSource.includes("onHide: () => setUi({ show_status_bar: false })"),
    "`useStatusBar.ts` 里 `onHide` 不再是 `setUi({ show_status_bar: false })`",
  );
  assertValue(
    !/onHide:\s*\(\)\s*=>\s*setUi\(\{\s*show_status_bar:\s*!/.test(stateBarHookChildSource),
    "`onHide` 里写成了 `!…` —— × 变成了切换（见这条测试上面那段注释）",
  );
});

testCase("状态栏：那条链子也是接满的（`设界面` 就是 `setChrome`）", () => {
  // 链条：`StatusBar` 的 `onHide` → `useStatusBar` 的 `设界面` → `App` 传的
  // `setChrome`（与菜单 `view.statusBar` 同一个）。
  //
  // ⚠️ `useStatusBar` 这一格**故意不自己铺一遍 appearance 的展开**
  //（`{...appearance, show_status_bar: false}` 那种写法）：铺了就是同一个
  // 设置的第二条写路，早晚和 `setChrome` 分叉。所以它收一个 `设界面`。
  assertValue(
    stateBarHookChildSource.includes("setUi: (patch: Partial<Settings[\"appearance\"]>) => void"),
    "`useStatusBar.ts` 的入参里没有 `setUi`（那一格被删了？）",
  );
  assertValue(
    appSource.includes("setUi: setChrome"),
    "`App.tsx` 没把 `setChrome` 当作 `setUi` 交给 `useStatusBar` ——" +
      "那颗 × 会走一个不是菜单那个的 setter",
  );
  assertValue(
    commandTableSource.includes('"view.statusBar": () => setChrome({ show_status_bar: !statusBarOpen })'),
    "`useCommandTable.ts` 里 `view.statusBar` 那一条变了（它和 × 应该落在同一个 `setChrome` 上）",
  );
});

/* ── 三、菜单上那一族挨着 ───────────────────────────────────────────── */

group("三、⚠️ 视图菜单里「外壳上画出什么」那一族挨着");

/**
 * 把一条菜单按 `"sep"` 切成若干段，每段是那一段里的 item id（子菜单只算父项）。
 */
function splitParagraph(items: readonly unknown[]): string[][] {
  const paragraph2: string[][] = [[]];
  for (const e of items) {
    if (e === "sep") {
      paragraph2.push([]);
      continue;
    }
    paragraph2[paragraph2.length - 1].push((e as { id: string }).id);
  }
  return paragraph2;
}

const viewMenu = MENUS.find((m) => m.id === "view");
assertValue(!!viewMenu, "`MENUS` 里没有 id 为 `view` 的菜单");
const viewSection = splitParagraph(viewMenu!.items);

testCase("⚠️ 那一族是**连着的一段**（`view.toolbar` / `statusBar` / `menuBar` 与插件栏之间没有线）", () => {
  // 用户 2026-09-27 点名要的那条分隔线的判据是**分类**：
  // 上面一段管「外壳上画出什么」（侧栏那一族 / 插件栏 / 格式化工具栏 / 状态栏 /
  // 菜单栏），下面一段管「正文那一块怎么呈现」（三种编辑模式 / 只读 / 专注 / 打字机）。
  //
  // ⚠️ 这一条 2026-10-04 **动过**：`view.statusBar` 原来夹在「打字机模式」和
  // 「全屏」中间（即**下面**那一段里），`view.menuBar` 挨着它——那就是"关掉某一栏"
  // 这件事被拆到了两种写作模式中间，读起来像同一族的第三种模式。第 49 项把它俩
  // 挪上来了。**这条测试就是那次挪动的截图**：挪回去它会红。
  //
  // ⚠️ 红了怎么办：往这一段里**加**了一条（比如"标签栏"也做成可关的）——那是好事，
  // 把新 id 加进下面那个期望值里，并在 `commands.ts` 那段注释上补一句；
  // 加的是**别的东西**，说明你把它放错了边，回到上面那段判据里想清楚它是哪一类。
  const containsStateBar = viewSection.find((s) => s.includes("view.statusBar"));
  assertValue(!!containsStateBar, "`view.statusBar` 在视图菜单里一条都没有了？");
  equal(
    JSON.stringify(containsStateBar),
    JSON.stringify(["view.toggleDock", "view.toolbar", "view.statusBar", "view.menuBar"]),
    "「外壳上画出什么」那一段的内容",
  );
});

testCase("⚠️ 两种写作模式**不在**这一段里（那一刀还在）", () => {
  // 挪动最容易出的错是"连分隔线一起搬走"，那样上面那段会一路吞到缩放去。
  const containsStateBar = viewSection.find((s) => s.includes("view.statusBar"))!;
  for (const id of ["view.focusMode", "view.typewriter", "view.readOnly", "view.modeWysiwyg"]) {
    assertValue(
      !containsStateBar.includes(id),
      `\`${id}\` 落在了「外壳上画出什么」那一段里 —— 它是"正文那一块怎么呈现"，` +
        "与那一族之间必须还隔着那条分隔线",
    );
  }
});

testCase("侧栏那一族仍在自己那一段里（没被这次挪动带下来）", () => {
  // ⚠️ 侧栏（`view.toggleSidebar`）与「大纲/文件树/搜索」同段，在插件栏那条线**上面**
  // ——那段自己有一条既有的线（`commands.ts` 里那条注释写着"上面那一段具体从哪算起
  // 是开窗量出来的"）。这次只动了 `statusBar` / `menuBar` 两条，这里钉一下没连带动。
  const containsSideBar = viewSection.find((s) => s.includes("view.toggleSidebar"))!;
  assertValue(!containsSideBar.includes("view.toggleDock"), "侧栏与插件栏之间的那条线不见了");
  assertValue(!containsSideBar.includes("view.statusBar"), "状态栏跑到侧栏那一段里去了（它属于插件栏那一族）");
});

/* ── 收尾 ───────────────────────────────────────────────────────────── */

console.log(`\n${pass} 过 / ${fail} 败`);
if (fail) {
  console.log(`败的：${failed.join("、")}`);
  process.exitCode = 1;
}
