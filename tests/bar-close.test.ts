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
 * - 一颗 × 的 `title` 是"隐藏状态栏"、另一颗是"关闭工具栏"——四条键各说各的，
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

function 真(条件: boolean, 说明: string): void {
  if (!条件) throw new Error(说明);
}

/** 读 `src/` 下的一份源码。⚠️ 路径一律从仓库根算（跑法里 `cd` 到仓库根）。 */
function 读(...段: string[]): string {
  return readFileSync(join("src", ...段), "utf8");
}

/**
 * 从一份 `.tsx` 源码里抠出**带某个 class 的那个 `<button>` 整块**。
 *
 * ⚠️ 用文本抠而不是渲染：本仓没有 jsdom，而这两颗 × 的判据（接到哪个 prop、
 * 用哪条 i18n 键、画哪个图标）全在字面里，抠出来看比渲染出来看**更准**
 * ——渲染之后这三样都变成了别的东西。
 */
function 抠按钮(源: string, class名: string): string {
  const 处 = 源.indexOf(`className="${class名}"`);
  // 状态栏那颗的 className 带了两个记号（`status-btn statusbar-close`），
  // 所以先按"包含"找，再回退到最近的一个 `<button`。
  const 位 = 处 >= 0 ? 处 : 源.indexOf(class名);
  if (位 < 0) throw new Error(`源码里找不到 class \`${class名}\``);
  const 起 = 源.lastIndexOf("<button", 位);
  const 末 = 源.indexOf("</button>", 位);
  if (起 < 0 || 末 < 0) throw new Error(`class \`${class名}\` 那个 <button> 抠不出来`);
  return 源.slice(起, 末);
}

/** 一份源码里**带 `close` 的 className 有几个**（组一用它验"恰好一颗"）。 */
function 叉的颗数(源: string): number {
  return (源.match(/className="[^"]*\bclose\b[^"]*"/g) ?? []).length;
}

/* ── 一、四颗 × 都在，而且长得一样 ─────────────────────────────────── */

组("一、四颗 ×：各栏恰好一颗，长相一致");

/** 四颗 × 的现场：`[读源码用的路径, className, 组一那颗在的 CSS]`。 */
const 四栏 = [
  { 名: "侧栏", 文件: ["ui", "Sidebar.tsx"], class名: "sidebar-close", css: ["styles", "sidebar.css"] },
  { 名: "插件栏", 文件: ["ui", "PluginDock.tsx"], class名: "dock-close", css: ["styles", "dock.css"] },
  { 名: "格式化工具栏", 文件: ["ui", "FormatBar.tsx"], class名: "format-bar-close", css: ["styles", "bars.css"] },
  { 名: "状态栏", 文件: ["ui", "StatusBar.tsx"], class名: "statusbar-close", css: ["styles", "tabs-status.css"] },
] as const;

const 源表 = new Map(四栏.map((栏) => [栏.class名, 读(...栏.文件)]));

测("每一栏里带 `close` 的 className 都**恰好一个**", () => {
  // ⚠️ 反过来的坏法：一颗 × 上同时挂着 `.sidebar-close` 和一个装饰用的 class，
  // 两颗按钮长得一样而只有一颗钉在右端。这里要的是"这一栏只有一个关的入口"。
  for (const 栏 of 四栏) {
    等(叉的颗数(源表.get(栏.class名)!), 1, `${栏.名}里带 close 的 className 个数`);
  }
});

测("四颗 × 画的是**同一个图标**（`folio-close-symbolic`）", () => {
  for (const 栏 of 四栏) {
    const 块 = 抠按钮(源表.get(栏.class名)!, 栏.class名);
    真(
      块.includes('name="folio-close-symbolic"'),
      `${栏.名}那颗 × 的图标不是 folio-close-symbolic：\n${块}`,
    );
  }
});

测("⚠️ 每颗的 `title` 与 `aria-label` 是**同一个键**", () => {
  // 读屏念的和鼠标悬停弹的必须是同一句话——两处分开写的话，改一处忘一处，
  // 症状是"看得见的人关得掉、看不见的人关不掉"（而且没人会报这个 bug）。
  for (const 栏 of 四栏) {
    const 块 = 抠按钮(源表.get(栏.class名)!, 栏.class名);
    const 提示 = /title=\{t\("([^"]+)"\)\}/.exec(块);
    const 念出 = /aria-label=\{t\("([^"]+)"\)\}/.exec(块);
    if (!提示 || !念出) throw new Error(`${栏.名}那颗 × 缺 title 或 aria-label：\n${块}`);
    等(念出[1], 提示[1], `${栏.名}那颗 × 的 aria-label 与 title`);
  }
});

测("⚠️ 四条 i18n 键在中文表里都译了、而且**同一个句式**", () => {
  // 三条里两条写「收起…」一条写「隐藏…」的话，四颗按钮读起来像四个人加的。
  // ⚠️ 只能验"开头两个字一样"，验不出"这句话好不好听"——那是眼睛的事。
  const 中文表 = 读("i18n", "zh-ui.ts");
  const 键: string[] = [];
  for (const 栏 of 四栏) {
    const 块 = 抠按钮(源表.get(栏.class名)!, 栏.class名);
    const m = /title=\{t\("([^"]+)"\)\}/.exec(块);
    真(!!m, `${栏.名}那颗 × 的 title 抠不出来`);
    键.push(m![1]);
    const 译文 = new RegExp(`"${m![1].replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}":\\s*"([^"]+)"`).exec(中文表);
    真(!!译文, `中文表里没有 \`${m![1]}\` 的译文（界面上会显示英文原文）`);
    真(
      译文![1].startsWith("收起"),
      `\`${m![1]}\` 的译文是「${译文![1]}」，不是「收起…」——四颗 × 必须同句式`,
    );
  }
  等(new Set(键).size, 4, "四条键互不相同（四栏各一条，不能共用）");
});

测("四个 class 在各自那份 CSS 里都有规则", () => {
  for (const 栏 of 四栏) {
    真(
      读(...栏.css).includes(`.${栏.class名}`),
      `${栏.css.join("/")} 里没有 .${栏.class名} —— 那说明这颗 × 是裸的 <button>` +
        `（浏览器默认样式会让它和另外三颗长得完全不一样）`,
    );
  }
});

/* ── 二、每条入口汇到**同一个 setter** ─────────────────────────────── */

组("二、菜单那条与 × 那颗走的是同一个 setter");

const 格式栏源 = 源表.get("format-bar-close")!;
const 状态栏源 = 源表.get("statusbar-close")!;
const 接线源 = 读("ui", "EditorArea.tsx");
const 栏开关源 = 读("ui", "useChromeVisibility.ts");
const 命令表源 = 读("ui", "useCommandTable.ts");
const 状态栏钩子源 = 读("ui", "useStatusBar.ts");
const App源 = 读("App.tsx");

测("格式化工具栏：× → `onHide`（不走 `onCommand`）", () => {
  // ⚠️ 这条是**故意不接 `onCommand`** 的：那颗 × 不是一条编辑命令
  //（`commands.ts` 里没有"收起格式化工具栏"这一项），走命令表的话要点名一个
  // 不存在的 id。所以它直接调 prop。
  const 块 = 抠按钮(格式栏源, "format-bar-close");
  真(块.includes("onClick={onHide}"), `那颗 × 没接 onHide：\n${块}`);
  真(!块.includes("onCommand"), `那颗 × 接了 onCommand —— 它不是一条编辑命令：\n${块}`);
});

测("格式化工具栏：`onHide` 一路接到 `收起工具栏`（三处都对得上）", () => {
  // 链条：`FormatBar` 的 `onHide` → `EditorArea` 的 `收起格式化栏` → `App` 把它
  // 接成 `useChromeVisibility` 的 `收起工具栏` → 那一头写 `setChrome`。
  // ⚠️ 断在哪一环的症状都是**同一个**：按钮在、点了没反应（不报错）。
  真(
    接线源.includes("onHide={收起格式化栏}"),
    "`EditorArea.tsx` 没把 `收起格式化栏` 接到 `<FormatBar onHide=…>` 上",
  );
  真(
    接线源.includes("收起格式化栏: () => void;"),
    "`EditorArea.tsx` 的 `编辑区接线` 接口里没有 `收起格式化栏` 这一格",
  );
  真(
    接线源.includes("收起格式化栏"),
    "`EditorArea.tsx` 没有解出 `收起格式化栏`",
  );
  真(
    App源.includes("收起格式化栏: 收起工具栏"),
    "`App.tsx` 那个接线的字面量里没有 `收起格式化栏: 收起工具栏`（`EditorArea.tsx` 收到的是 undefined）",
  );
  真(
    App源.includes("收起工具栏") && App源.includes("useChromeVisibility"),
    "`App.tsx` 没有从 `useChromeVisibility` 里取 `收起工具栏`",
  );
});

测("⚠️ 格式工具栏：× 那颗与菜单 `view.toolbarNever` 写的是**同一句**", () => {
  // 这是"三条入口汇到同一个 setter"里唯一能文本验的一条，也是最有价值的一条：
  // 两颗按钮各自写 `setChrome({ toolbar: "never" })`，参数一模一样，
  // 改哪一边都看得见另一边。
  真(
    栏开关源.includes('收起工具栏 = useCallback(() => setChrome({ toolbar: "never" })'),
    "`useChromeVisibility.ts` 里 `收起工具栏` 不再是 `setChrome({ toolbar: \"never\" })`",
  );
  真(
    命令表源.includes('"view.toolbarNever": () => setChrome({ toolbar: "never" })'),
    '`useCommandTable.ts` 里 `view.toolbarNever` 不再是 `setChrome({ toolbar: "never" })`' +
      "——两个入口从这一刻起不再走同一个 setter 了",
  );
});

测("⚠️ 状态栏那颗 × **只关不开**（菜单那条才是切换）", () => {
  // 这条钉的是两边的**语义差异**，而它是有意的：
  // - 菜单项是一颗开关（勾着/没勾着），点一下取反；
  // - 栏上那颗 × 是"把这一栏收起来"这一个动作，写死 `false`。写 `!` 的话，
  //   某个状态不巧是 false 时点它会**把栏打开**——而那颗 × 当时根本不在屏幕上。
  const 块 = 抠按钮(状态栏源, "statusbar-close");
  真(块.includes("onClick={onHide}"), `状态栏那颗 × 没接 onHide：\n${块}`);
  真(
    状态栏钩子源.includes("onHide: () => 设界面({ show_status_bar: false })"),
    "`useStatusBar.ts` 里 `onHide` 不再是 `设界面({ show_status_bar: false })`",
  );
  真(
    !/onHide:\s*\(\)\s*=>\s*设界面\(\{\s*show_status_bar:\s*!/.test(状态栏钩子源),
    "`onHide` 里写成了 `!…` —— × 变成了切换（见这条测试上面那段注释）",
  );
});

测("状态栏：那条链子也是接满的（`设界面` 就是 `setChrome`）", () => {
  // 链条：`StatusBar` 的 `onHide` → `useStatusBar` 的 `设界面` → `App` 传的
  // `setChrome`（与菜单 `view.statusBar` 同一个）。
  //
  // ⚠️ `useStatusBar` 这一格**故意不自己铺一遍 appearance 的展开**
  //（`{...appearance, show_status_bar: false}` 那种写法）：铺了就是同一个
  // 设置的第二条写路，早晚和 `setChrome` 分叉。所以它收一个 `设界面`。
  真(
    状态栏钩子源.includes("设界面: (patch: Partial<Settings[\"appearance\"]>) => void"),
    "`useStatusBar.ts` 的入参里没有 `设界面`（那一格被删了？）",
  );
  真(
    App源.includes("设界面: setChrome"),
    "`App.tsx` 没把 `setChrome` 当作 `设界面` 交给 `useStatusBar` ——" +
      "那颗 × 会走一个不是菜单那个的 setter",
  );
  真(
    命令表源.includes('"view.statusBar": () => setChrome({ show_status_bar: !statusBarOpen })'),
    "`useCommandTable.ts` 里 `view.statusBar` 那一条变了（它和 × 应该落在同一个 `setChrome` 上）",
  );
});

/* ── 三、菜单上那一族挨着 ───────────────────────────────────────────── */

组("三、⚠️ 视图菜单里「外壳上画出什么」那一族挨着");

/**
 * 把一条菜单按 `"sep"` 切成若干段，每段是那一段里的 item id（子菜单只算父项）。
 */
function 切段(items: readonly unknown[]): string[][] {
  const 段: string[][] = [[]];
  for (const e of items) {
    if (e === "sep") {
      段.push([]);
      continue;
    }
    段[段.length - 1].push((e as { id: string }).id);
  }
  return 段;
}

const 视图菜单 = MENUS.find((m) => m.id === "view");
真(!!视图菜单, "`MENUS` 里没有 id 为 `view` 的菜单");
const 视图段 = 切段(视图菜单!.items);

测("⚠️ 那一族是**连着的一段**（`view.toolbar` / `statusBar` / `menuBar` 与插件栏之间没有线）", () => {
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
  const 含状态栏 = 视图段.find((s) => s.includes("view.statusBar"));
  真(!!含状态栏, "`view.statusBar` 在视图菜单里一条都没有了？");
  等(
    JSON.stringify(含状态栏),
    JSON.stringify(["view.toggleDock", "view.toolbar", "view.statusBar", "view.menuBar"]),
    "「外壳上画出什么」那一段的内容",
  );
});

测("⚠️ 两种写作模式**不在**这一段里（那一刀还在）", () => {
  // 挪动最容易出的错是"连分隔线一起搬走"，那样上面那段会一路吞到缩放去。
  const 含状态栏 = 视图段.find((s) => s.includes("view.statusBar"))!;
  for (const id of ["view.focusMode", "view.typewriter", "view.readOnly", "view.modeWysiwyg"]) {
    真(
      !含状态栏.includes(id),
      `\`${id}\` 落在了「外壳上画出什么」那一段里 —— 它是"正文那一块怎么呈现"，` +
        "与那一族之间必须还隔着那条分隔线",
    );
  }
});

测("侧栏那一族仍在自己那一段里（没被这次挪动带下来）", () => {
  // ⚠️ 侧栏（`view.toggleSidebar`）与「大纲/文件树/搜索」同段，在插件栏那条线**上面**
  // ——那段自己有一条既有的线（`commands.ts` 里那条注释写着"上面那一段具体从哪算起
  // 是开窗量出来的"）。这次只动了 `statusBar` / `menuBar` 两条，这里钉一下没连带动。
  const 含侧栏 = 视图段.find((s) => s.includes("view.toggleSidebar"))!;
  真(!含侧栏.includes("view.toggleDock"), "侧栏与插件栏之间的那条线不见了");
  真(!含侧栏.includes("view.statusBar"), "状态栏跑到侧栏那一段里去了（它属于插件栏那一族）");
});

/* ── 收尾 ───────────────────────────────────────────────────────────── */

console.log(`\n${过} 过 / ${败} 败`);
if (败) {
  console.log(`败的：${败的.join("、")}`);
  process.exitCode = 1;
}
