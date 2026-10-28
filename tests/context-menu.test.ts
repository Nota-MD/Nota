/**
 * 右键菜单那两份的**可运行**判据：条目表里那些 id 到底对得上对不上。
 *
 * # 它是为谁写的（2026-10-04，用户报「右键弹的是英文原生菜单，有点割裂」）
 *
 * 原生那份是 WebKitGTK 自己画的、受进程 locale 控制，改不动，只能整个拦掉
 * 重画（`ui/context-menu.ts` 文件头）。重画的这份菜单有个**它独有的、沉默的**
 * 坏法：
 *
 * ⚠️ **id 写错一个字符不会报错**。命令是按 id 认的（`App.tsx` 的
 * `menuHandlers`），查不到就是"这条没实现"——菜单里那一条**永远灰着**。
 * 而"菜单里少了一条能点的"这件事，肉眼扫一遍几乎看不出来：那一格长得和
 * 旁边一样，只是颜色浅一点，而且没人会去数"这一排本该有几颗"。
 *
 * 所以这份测试干两件事：
 *
 * 1. **逐条对账**：`context-menu.ts` 里写到的每一个 id 都能在 `MENUS` 里查到
 *    （组二）。这条管"打错字 / 引用了不存在的条目"。
 * 2. **逐条对账处理器**：右键菜单里**点得动**的每一条，`useCommandTable.ts`
 *    里都得有它的处理器（组三）；输入框那一档的实现住在 `ContextMenu.tsx`
 *    自己身上，所以那一档对着那份文件查（组四）。这两条管"加了一条菜单、
 *    忘了实现"——那正是"永远灰着"的来源。
 *
 * # 跑法（不装任何包）
 *
 * ```sh
 * cd <仓库>
 * npx esbuild tests/context-menu.test.ts --bundle --platform=node --format=esm \
 *   --alias:@=./src --outfile=/tmp/nota-测试/context-menu.mjs
 * node /tmp/nota-测试/context-menu.mjs
 * ```
 *
 * ⚠️ `--alias:@=./src` 不能省（`@/ui/commands`、`@/ui/context-menu` 都从 `@/…` 进）。
 * ⚠️ **不需要** `--loader:.svg=text`：这条链上一个 svg 都没有——这也是为什么
 * 这份测试**不 import** `ContextMenu.tsx`（那个文件一路引到 `ui/Icon.tsx`，
 * 里面有 `import.meta.glob`，node 里跑不了）。所以组四**读源码文本**，不 import。
 *
 * # ⚠️ 这份测试**证明不了**什么
 *
 * - **"菜单画出来是什么样"没验**：位置、行距、图标亮不亮、键盘走不走得通
 *   ——全是真 React ＋ 真窗口的事（本仓没有 jsdom）。这里读的是**表和源码文本**。
 *   真开窗的判据在 `docs/06` §5。
 * - **`execCommand` 在输入框上到底能不能用没验**：那是 WebKit 的行为，
 *   只有真窗口里按一下才知道，记在 `docs/06` 那一节。
 * - 组三/组四扫的是**文本里有没有这个词**，不是"那个处理器写对了"。
 *   写错了不报错——但"压根没写"能当场红，那才是它要挡的。
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";

import { isMenuItem, MENUS, getItem } from "@/ui/commands";
import {
  inlineBelowValueCell,
  determineDropPoint,
  cutPasteIcon,
  blockIcon,
  inputBoxItem,
  wholeLineDisabled,
  disabledForLocation,
  allTableIds,
  inlineIcon,
  combineWriteAddWordDictionary,
  combineWriteIgnoreOmit,
  combineWriteReplaceReplacePrefix,
  combineWriteLine,
  buildRows,
  type line3,
} from "@/ui/context-menu";
import { popupSelfSelfAtRoll } from "@/ui/popup-scroll";

/* ── 一支极小的测试工装（与 `bar-close.test.ts` 同一套长相）── */

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

/** 一份菜单里**点得动**的那些 id：图标行的每一颗 ＋ 普通条目；子菜单父项不进去。 */
function pointObtainActionOf(rows: readonly line3[]): string[] {
  const receive: string[] = [];
  for (const r of rows) {
    if (r.kind === "icons") receive.push(...r.ids);
    else if (r.kind === "item") {
      if (r.spec.submenu) {
        for (const e of r.spec.submenu) if (isMenuItem(e)) receive.push(e.id);
      } else receive.push(r.spec.id);
    }
  }
  return receive;
}

/** 一份菜单里那些**只展开子菜单、自己不执行**的父项 id。 */
function pointNotActionOf(rows: readonly line3[] = buildRows("编辑器", true)): string[] {
  return rows
    .filter((r) => r.kind === "item" && Boolean(r.spec.submenu))
    .map((r) => (r as Extract<line3, { kind: "item" }>).spec.id);
}

/* ── 组一：判落点 ───────────────────────────────────────────────────────── */

group("判落点 · 四档与两条顺序");

testCase("什么都不沾 → 外壳", () => {
  equal(determineDropPoint({ alreadyIsRecognizeLead: false, isInputBox: false, atEditorInside: false }), "外壳", "普通处");
});

testCase("编辑区里 → 编辑器", () => {
  equal(determineDropPoint({ alreadyIsRecognizeLead: false, isInputBox: false, atEditorInside: true }), "编辑器", "正文");
});

testCase("⚠️ 输入框**优先于**编辑器（公式源码框就在编辑区里）", () => {
  // 这条顺序是反直觉的、也是必须的：编辑区里真的有输入框（公式源码框、
  // 图表源码框、代码块的语言框，见 `ui/accel.ts` 那条 2026-09-26 的教训）。
  // 顺序反过来的话，在公式源码框里右键会拿到整份 markdown 菜单，而那些命令
  // 打的是**文档**、不是那个框——用户会以为"在框里加粗"没反应。
  equal(determineDropPoint({ alreadyIsRecognizeLead: false, isInputBox: true, atEditorInside: true }), "输入框", "框里");
});

testCase("⚠️ 已被认领 → 不弹（而且这一档不许 preventDefault）", () => {
  // 标签栏自己有一份菜单（`ui/TabBar.tsx`），本仓这一个挂在 window 的**捕获**
  // 阶段、会**先**跑。这一档要是也按"外壳"处理，右键一个标签就什么都不弹，
  // 标签上那份菜单（连同"在新窗口中打开"）从此消失，而且不报错。
  equal(
    determineDropPoint({ alreadyIsRecognizeLead: true, isInputBox: false, atEditorInside: true }),
    "不弹",
    "标签栏认领过的那一下，在编辑区里也一样",
  );
  equal(
    determineDropPoint({ alreadyIsRecognizeLead: true, isInputBox: true, atEditorInside: false }),
    "不弹",
    "认领优先于输入框",
  );
});

/* ── 组二：id 逐条对账 ─────────────────────────────────────────────────── */

group("id 对账 · 表里写到的每一条都得在 MENUS 里");

testCase("**借来的**每一个 id 都能查到（打错一个字符就是那条永远灰着）", () => {
  // 右键菜单独有的是三个组合父项，以及表格子菜单里只在右键提供的六个动作。
  // 它们由 `useCommandTable.ts` 直接接线，不进入菜单栏的 `MENUS`。
  const contextOnlyAction = new Set([
    "para.tableMoveRowUp",
    "para.tableMoveRowDown",
    "para.tableMoveColLeft",
    "para.tableMoveColRight",
    "para.tableCopy",
    "para.tableFormat",
  ]);
  const occupyPosition = new Set([
    ...pointNotActionOf().filter((id) => !getItem(id)),
    ...contextOnlyAction,
  ]);
  const all = allTableIds();
  assertValue(all.length > 0, "一条都没扫到——`给行` 或 `表里全部id` 八成坏了，先查那个");
  const checkNotToOf = all.filter((id) => !occupyPosition.has(id) && !getItem(id));
  assertValue(
    checkNotToOf.length === 0,
    `这些 id 在 \`MENUS\` 里查不到（菜单里那一条会永远灰着）：${checkNotToOf.join("、")}`,
  );
});

testCase("三份子菜单父项里只有右键独有组合不在 MENUS 中", () => {
  // ⚠️ 父项有四条，但**只有三条**是右键菜单独有的：
  // `edit.copyAs`（「复制为…」）**本来就在 MENUS 里**——编辑菜单里也有它。
  // 那一条必须继续查得到，否则"复制为"在**菜单栏**里也会消失。
  const parents = pointNotActionOf();
  const aloneOccupyOf = parents.filter((id) => !getItem(id));
  equal(aloneOccupyOf.join("、"), "ctx.paragraph、ctx.table、ctx.insert", "右键菜单独有的父项");
  // 借来的那个父项照旧必须查得到，而且它得真有子菜单。
  assertValue(Boolean(getItem("edit.copyAs")), "`edit.copyAs` 在 MENUS 里查不到了——编辑菜单会少一条");
  const toChild = getItem("edit.copyAs")?.submenu ?? [];
  assertValue(toChild.filter(isMenuItem).length >= 3, "「复制为…」的子菜单里应该至少有 Markdown/纯文本/HTML 三条");
  // 子菜单里**借来的**那些照旧必须查得到（同上，打错就是永远灰着）。
  const tablePrivateHas = new Set([
    "para.tableMoveRowUp",
    "para.tableMoveRowDown",
    "para.tableMoveColLeft",
    "para.tableMoveColRight",
    "para.tableCopy",
    "para.tableFormat",
  ]);
  for (const child3 of pointObtainActionOf(buildRows("编辑器", true)).filter((id) => !tablePrivateHas.has(id))) {
    assertValue(Boolean(getItem(child3)), `子菜单里的 \`${child3}\` 在 MENUS 里查不到`);
  }
});

testCase("图标行那三排不许出现空排", () => {
  for (const [name3, arrange] of [
    ["剪贴板", cutPasteIcon],
    ["行内", inlineIcon],
    ["块级", blockIcon],
  ] as const) {
    assertValue(arrange.length > 0, `${name3}那一排是空的`);
    for (const id of arrange) assertValue(Boolean(getItem(id)), `${name3}那一排的 \`${id}\` 查不到`);
  }
});

testCase("⚠️ 行内 / 块级那两排**没有** `fmt.clear` 那种会清掉整段格式的东西", () => {
  // 有意钉一下：这一排是"点一下加个标记"，塞一颗"把标记全清掉"进去，
  // 手指一滑就把整段格式清了，而这个菜单里**没有撤销按钮**。
  const arrange = [...inlineIcon, ...blockIcon];
  assertValue(!arrange.includes("fmt.clear"), "清格式混进右键菜单那两排图标里了");
});

/* ── 组三：编辑器那一档，点得动的都得有处理器 ─────────────────────────── */

group("处理器对账 · 编辑器那一档");

testCase("点得动的每一条，`useCommandTable.ts` 里都有 `\"id\":` ", () => {
  const source3 = read("ui", "useCommandTable.ts");
  const missing = pointObtainActionOf(buildRows("编辑器", true)).filter((id) => !source3.includes(`"${id}":`));
  // ⚠️ `edit.copyAs` 不在这份判据里：它带子菜单，按回车是"展开"不是"执行"
  // （`点得动的` 收的是它**子项**）。`ctx.paragraph` / `ctx.insert` 同理。
  assertValue(
    missing.length === 0,
    `右键菜单里点得动、但命令表里没有处理器（那一条会永远灰着）：${missing.join("、")}`,
  );
});

testCase("子菜单父项**不该**有处理器（有的话说明有人把它接成能点的了）", () => {
  const source3 = read("ui", "useCommandTable.ts");
  assertValue(!source3.includes(`"edit.copyAs":`), "`edit.copyAs` 被接上了处理器——它只该展开子菜单");
});

/* ── 组四：输入框那一档，实现住在 `ContextMenu.tsx` 自己身上 ───────────── */

group("处理器对账 · 输入框那一档");

testCase("这一档的每一条都在 `ContextMenu.tsx::落到输入框` 的 switch 里", () => {
  const source3 = read("ui", "ContextMenu.tsx");
  const missing = buildRows("输入框", true)
    .filter((r): r is Extract<line3, { kind: "item" }> => r.kind === "item")
    .map((r) => r.spec.id)
    .filter((id) => !source3.includes(`case "${id}":`));
  assertValue(
    missing.length === 0,
    `输入框那一档里点不动的条目（switch 里没有 branch）：${missing.join("、")}`,
  );
});

testCase("⚠️ `edit.select` **不在**命令表里——它只该由输入框那一档自己实现", () => {
  // 这一条是**故意的**，不是欠账：编辑区里的"全选"由 ProseMirror 自己那条路
  // 走（菜单里没有这一条），而输入框里没有 ProseMirror，只能自己 execCommand。
  // 哪天有人把 `edit.select` 接到了命令表上，这一条会红——那时请先想清楚
  // "编辑器里点全选"该是什么行为，别顺手接。
  const source3 = read("ui", "useCommandTable.ts");
  assertValue(!source3.includes(`"edit.select":`), "`edit.select` 被接到命令表上了，见这条测试的注释");
  assertValue(inputBoxItem.includes("edit.select"), "输入框那一档里那条「全选」不见了");
});

/* ── 组五：这一档拿哪份灰名单 ───────────────────────────────────────────── */

group("这一档的灰 · 输入框那边不套菜单栏那份");

testCase("⚠️ 输入框那一档**一个都不灰**", () => {
  // 这一条是 2026-10-04 开窗口检抓出来的缺陷的对账：上面那条测试钉着
  // `edit.select` **按设计**不进命令表，而 `ui/useMenus.ts` 的灰名单第一条判据
  // 正是"命令表里有没有这一条"——两份账一叠，输入框里那条**有实现**的
  // 「全选」就被画成灰的（画面见 `docs/06` §5.54）。修法是这一档不套那份名单。
  //
  // ⚠️ 这里传的是**满灰**：就算命令表那六条一条都不能用（没文档、全没实现），
  // 输入框里也照样点得动——它们的实现住在 `ContextMenu.tsx::落到输入框`，
  // 和命令表没有一分钱关系。
  const fullyDisabled = new Set(inputBoxItem.filter((id) => id !== "sep"));
  equal(disabledForLocation("输入框", fullyDisabled).size, 0, "输入框那一档套了菜单栏的灰名单");
});

testCase("其余三档**原样透传**（编辑器那一档的灰名单还是同一份）", () => {
  const disabled2 = new Set(["para.tableDel"]);
  for (const level of ["编辑器", "外壳", "不弹"] as const) {
    assertValue(disabledForLocation(level, disabled2) === disabled2, `\`${level}\` 那一档把灰名单换掉了——它该原样用那份`);
  }
});

testCase("输入框那一档的六条**都**在 `落到输入框` 的 switch 里（和上一条是一对）", () => {
  // "一个都不灰"能成立的前提是**那六条真有实现**——那一条由组四钉着。
  // 这里只把"六条"这个数钉死：哪天有人往 `输入框条目` 里加一条忘了写实现，
  // 组四会红；可要是那天有人顺手把组四放宽了，这一条至少还拦得住"少了一条"。
  const assertValueItem = inputBoxItem.filter((id) => id !== "sep");
  equal(assertValueItem.length, 6, "输入框那一档的条目数");
});

/* ── 组六：行内翻格 ────────────────────────────────────────────────────── */

group("行内下一格 · 一排图标里 ←→ 怎么走");

const allEnabled = (n: number) => Array.from({ length: n }, () => ({ disabled: false }));

testCase("能走的就往前走一格", () => {
  equal(inlineBelowValueCell(allEnabled(4), 0, 1), 1, "第一颗按 →");
  equal(inlineBelowValueCell(allEnabled(4), 2, 1), 3, "第三颗按 →");
  equal(inlineBelowValueCell(allEnabled(4), 3, -1), 2, "最后一颗按 ←");
});

testCase("灰的跳过去", () => {
  const arrange = [{ disabled: false }, { disabled: true }, { disabled: true }, { disabled: false }];
  equal(inlineBelowValueCell(arrange, 0, 1), 3, "中间两颗灰的，→ 该直接落到第四颗");
  equal(inlineBelowValueCell(arrange, 3, -1), 0, "反过来也一样");
});

testCase("⚠️ **到头就停住，不许绕回**（和上下键那个 `findNextEnabled` 有意不同）", () => {
  // 一排图标里按 → 从最后一颗跳回第一颗，看着像"卡了一下又跳回去"；
  // 而上下键在一列里从头绕到尾，用户认得出那是"回到开头"。
  equal(inlineBelowValueCell(allEnabled(4), 3, 1), 3, "最后一颗再按 → 应该停在原地");
  equal(inlineBelowValueCell(allEnabled(4), 0, -1), 0, "第一颗再按 ← 应该停在原地");
});

testCase("整排全灰时返回当前（调用方据此不重画焦点）", () => {
  const arrange = Array.from({ length: 3 }, () => ({ disabled: true }));
  equal(inlineBelowValueCell(arrange, 0, 1), 0, "全灰 → 停住");
});

/* ── 组七：整行灰 ──────────────────────────────────────────────────────── */

group("整行灰 · 一排一栏是「整条全灰」才算灰");

const paragraphItem = getItem("para.h1")!;
const iconLine: line3 = { kind: "icons", key: "k", ids: ["fmt.bold", "fmt.italic"] };
const separatorLine: line3 = { kind: "sep", key: "s" };
const commonThroughItem: line3 = { kind: "item", key: "i", spec: paragraphItem };

testCase("图标行：一颗能用就不灰", () => {
  assertValue(!wholeLineDisabled(iconLine, new Set(["fmt.bold"])), "只剩一颗能用，整排不该灰");
  assertValue(wholeLineDisabled(iconLine, new Set(["fmt.bold", "fmt.italic"])), "两颗都灰 → 整排灰");
});

testCase("普通条目：看它自己在不在灰名单里", () => {
  assertValue(!wholeLineDisabled(commonThroughItem, new Set()), "空名单 → 不灰");
  assertValue(wholeLineDisabled(commonThroughItem, new Set(["para.h1"])), "名单里有 → 灰");
});

testCase("分隔线恒灰（它本来就不是落点）", () => {
  assertValue(wholeLineDisabled(separatorLine, new Set()), "分隔线该恒为灰");
});

testCase("带子菜单的父项：**子项全灰才算灰**", () => {
  const copyAs = getItem("edit.copyAs")!;
  assertValue(Boolean(copyAs.submenu), "`edit.copyAs` 已经不是子菜单父项了？");
  const parent: line3 = { kind: "item", key: "p", spec: copyAs };
  assertValue(!wholeLineDisabled(parent, new Set()), "一条都没灰 → 父项不灰");
  const child3 = (copyAs.submenu ?? []).filter(isMenuItem).map((c) => c.id);
  assertValue(child3.length > 0, "`edit.copyAs` 的子菜单空了");
  // 灰掉**除最后一条**之外的全部：还剩一条能用。
  const differenceOneItem = new Set(child3.slice(0, -1));
  assertValue(!wholeLineDisabled(parent, differenceOneItem), "还剩一条能用，父项不该灰");
  // ⚠️ 这一条正是"复制为"那一栏曾经差点出的事：`edit.copyAsPlain` /
  // `edit.copyAsHtml` 当时没有处理器，父项**一直是灰的**，看着像坏了。
  assertValue(wholeLineDisabled(parent, new Set(child3)), "子项全灰 → 父项该灰");
});

/* ── 组八：给行 ────────────────────────────────────────────────────────── */

group("给行 · 三档各画出什么");

testCase("外壳 → 什么都不画（用户 2026-10-04 选的「只拦不弹」）", () => {
  equal(buildRows("外壳", true).length, 0, "外壳那一档");
  equal(buildRows("外壳", false).length, 0, "外壳那一档（正式构建）");
});

testCase("不弹 → 同样什么都不画（这一档由 TabBar 自己画）", () => {
  equal(buildRows("不弹", true).length, 0, "不弹那一档");
});

testCase("输入框 → 短菜单，且**不含**任何一行图标", () => {
  const rows = buildRows("输入框", true);
  assertValue(rows.length > 0, "输入框那一档是空的");
  assertValue(
    rows.every((r) => r.kind !== "icons"),
    "输入框那一档里出现了图标行——那一档是纯文字条目",
  );
  const assertValueItem = rows.filter((r) => r.kind === "item").length;
  equal(assertValueItem, inputBoxItem.filter((id) => id !== "sep").length, "条目条数");
});

testCase("编辑器 → 三排图标 ＋ 三个子菜单父项", () => {
  const rows = buildRows("编辑器", false);
  const arrange = rows.filter((r) => r.kind === "icons");
  equal(arrange.length, 3, "图标排数");
  assertValue(
    rows.some((r) => r.kind === "item" && r.spec.id === "ctx.paragraph"),
    "少了「段落」那一栏",
  );
 assertValue(rows.some((r) => r.kind === "item" && r.spec.id === "ctx.insert"), "少了「插入」那一栏");
  assertValue(rows.some((r) => r.kind === "item" && r.spec.id === "ctx.table"), "少了「表格」那一栏");
});

testCase("没有选中文本时隐藏「复制为」", () => {
  const rows = buildRows("编辑器", false, null, false, false);
  assertValue(
    !rows.some((r) => r.kind === "item" && r.spec.id === "edit.copyAs"),
    "没有选区仍显示「复制为」",
  );
});

testCase("⚠️ 开发者工具只在开发模式里出现", () => {
  const has = buildRows("编辑器", true).some((r) => r.kind === "item" && r.spec.id === "view.devtools");
  const without = buildRows("编辑器", false).some((r) => r.kind === "item" && r.spec.id === "view.devtools");
  assertValue(has, "开发模式下没有「开发者工具」——被拦掉的原生菜单里有 `Inspect Element`，得留个门");
  assertValue(!without, "正式构建里不该有「开发者工具」");
});

testCase("行的 key 不重复（重复了 React 只会让某一行认错身份，不报错）", () => {
  const key = buildRows("编辑器", true).map((r) => r.key);
  equal(new Set(key).size, key.length, "`给行` 出来的 key 有重复");
});

testCase("`MENUS` 本身没有被右键菜单改坏（借 id 不该往表里塞东西）", () => {
  const idCollection = new Set<string>();
  const receive = (entries: readonly (typeof MENUS)[number]["items"]) => {
    for (const e of entries) {
      if (e === "sep") continue;
      idCollection.add(e.id);
      if (e.submenu) receive(e.submenu);
    }
  };
  for (const m of MENUS) receive(m.items);
assertValue(!idCollection.has("ctx.paragraph"), "`ctx.paragraph` 混进 `MENUS` 了——它是右键菜单独有的");
  assertValue(!idCollection.has("ctx.insert"), "`ctx.insert` 混进 `MENUS` 了");
});

/* ── 组十：拼写那一段（2026-10-11）──────────────────────────────────────── */

group("拼写 · 错词上右键多出来的那一段");

const oneDocumentLineSearch = { createProposalPlural: ["hello", "halo"], addWordDictionary: "Add to dictionary", ignoreOmit: "Ignore" };

testCase("建议在前、两个动作在后，id 都带 `spell.` 前缀", () => {
  const rows = combineWriteLine(oneDocumentLineSearch);
  const combineWriteItem = rows.filter((r) => r.kind === "spell");
  equal(combineWriteItem.length, 4, "两条建议 ＋ 两个动作");
  const ids = combineWriteItem.map((r) => (r.kind === "spell" ? r.id : ""));
  equal(ids[0], `${combineWriteReplaceReplacePrefix}0`, "第一条建议的 id");
  equal(ids[1], `${combineWriteReplaceReplacePrefix}1`, "第二条建议的 id");
  equal(ids[2], combineWriteAddWordDictionary, "「加入词典」的 id");
  equal(ids[3], combineWriteIgnoreOmit, "「忽略」的 id");
  // ⚠️ 标签**原样**（不过 `t()`）：那是从词典里查出来的真词，不是文案。
  const labels = combineWriteItem.map((r) => (r.kind === "spell" ? r.label : ""));
  equal(labels[0], "hello", "建议的文字要原样");
  equal(labels[2], "Add to dictionary", "动作名是调用方翻好递进来的");
});

testCase("⚠️ 一条建议都没有时**不画那一格空行**，但两个动作照旧在", () => {
  const rows = combineWriteLine({ ...oneDocumentLineSearch, createProposalPlural: [] });
  const combineWriteItem = rows.filter((r) => r.kind === "spell");
  equal(combineWriteItem.length, 2, "只有两个动作");
  assertValue(
    rows[0]?.kind === "spell" && rows[0].id === combineWriteAddWordDictionary,
    "没有建议时第一条就该是「加入词典」（中间多一条分隔线会画成空一格）",
  );
});

testCase("给行 · 错词那一段挂在**最前面**（不比剪贴那排靠后）", () => {
  const rows = buildRows("编辑器", true, oneDocumentLineSearch);
  assertValue(rows[0]?.kind === "spell", "第一行不是拼写那一段");
  const iconRowIndex = rows.findIndex((r) => r.kind === "icons");
  const mostAfterCombineWriteBelowMark = rows.map((r) => r.kind).lastIndexOf("spell");
  assertValue(mostAfterCombineWriteBelowMark < iconRowIndex, "拼写那一段没有全部排在图标行前面");
});

testCase("给行 · 没落在错词上时一行都不多（默认参数那条路）", () => {
  const rows = buildRows("编辑器", true);
  assertValue(!rows.some((r) => r.kind === "spell"), "没给线索却画出了拼写那一格");
});

testCase("给行 · 输入框那一档不挂拼写（那里没有正文、也没有波浪线）", () => {
  // ⚠️ 编辑区里**真有输入框**（公式源码框、代码块的语言框），而它们里头的
  // 文字不属于正文——波浪线画不到那儿，"加入词典"更无从谈起。
  const rows = buildRows("输入框", true, oneDocumentLineSearch);
  assertValue(!rows.some((r) => r.kind === "spell"), "输入框那一档混进了拼写条目");
});

testCase("⚠️ 拼写那一段**永远不灰**（它不在 `灰名单` 里，照那份名单查会被当成灰的）", () => {
  const fullyDisabled = new Set(["spell.add", "spell.ignore", `${combineWriteReplaceReplacePrefix}0`]);
  // ⚠️ 只查**拼写条目**那几行：同一份里那两条分隔线是"恒灰"的
  //（`整行灰` 对 `sep` 一律给 `true`），拿它们来判会把一条永远成立的事
  // 报成缺陷。
  for (const r of combineWriteLine(oneDocumentLineSearch).filter((x) => x.kind === "spell")) {
    assertValue(!wholeLineDisabled(r, fullyDisabled), `拼写那一行被画成灰的了：${JSON.stringify(r)}`);
  }
});

testCase("三个动作在 `ContextMenu.tsx::落到拼写` 里都有落点（id 打错就永远点不动）", () => {
  // 这一条与组四那条同一个理由：这几条的处理器**不在命令表里**（它们的 id 是
  // 现场造的），所以"有没有人实现"只能对着那一份源码查。
  const source3 = read("ui", "ContextMenu.tsx");
  // ⚠️ 源码里写的是**常量名**（`id === 拼写加词典`），不是那个字面量
  //（`"spell.add"` 住在 `context-menu.ts` 一处）。所以这里查的是"有没有
  // 人拿这两个常量比过"——那正是"加了一条菜单、忘了实现"的判据。
  assertValue(
    source3.includes("id === combineWriteAddWordDictionary"),
    "`combineWriteAddWordDictionary` 在拼写分支里没有落点",
  );
  assertValue(
    source3.includes("id === combineWriteIgnoreOmit"),
    "`combineWriteIgnoreOmit` 在拼写分支里没有落点",
  );
  assertValue(source3.includes("combineWriteReplaceReplacePrefix"), "没找到建议条目的 id");
});


/* ── 组十一：弹层自己在滚（2026-10-11 用户报的那个缺陷）──────────────────── */

group("弹层自己在滚 · 滚的是菜单自己时不关菜单");

/** 一个只会 `closest` 的假元素：命中哪个选择器由参数说了算。 */
function fakeElement(matchOfSelectChooseDevice: string[]): Element {
  return {
    closest: (sel: string) => (matchOfSelectChooseDevice.some((s) => sel.includes(s)) ? ({} as Element) : null),
  } as unknown as Element;
}

testCase("⚠️ 菜单内部那一长列语言在滚 → 放行（不许关菜单）", () => {
  // 用户原话：「列表无法下滑，一下滑就直接消失，焦点返回工作区」。
  // 那一列就在 `.menu-popup` 里（`.menu-body` 是它的滚动容器）。
  assertValue(popupSelfSelfAtRoll(fakeElement([".menu-popup"])), "菜单自己在滚却被判成'底下动了'");
});

testCase("子菜单（portal 到 body 的 `.menu-sub`）自己在滚 → 也放行", () => {
  assertValue(popupSelfSelfAtRoll(fakeElement([".menu-sub"])), "子菜单自己在滚");
});

testCase("右键菜单那一套浮层内部在滚 → 也放行", () => {
  assertValue(popupSelfSelfAtRoll(fakeElement(["[data-context-menu]"])), "右键菜单自己的浮层");
});

testCase("⚠️ 但**正文/侧栏**滚了还是要关（那是它该管的）", () => {
  assertValue(!popupSelfSelfAtRoll(fakeElement([])), "普通元素滚了不该放行");
  // ⚠️ 文档级滚动的事件目标是 `document`（**没有 `closest`**）——这里用一个
  // 只有 `document` 那个形状的假对象来钉，而不是直接引用 `document`：
  // 这份测试跑在 node 里（**没有 DOM**），`document` 是 undefined。
  assertValue(!popupSelfSelfAtRoll({ addEventListener: () => {} } as unknown as EventTarget), "没有 closest 的目标");
  assertValue(!popupSelfSelfAtRoll(null), "null 目标（合成事件）不该放行");
});

/* ── 收尾 ───────────────────────────────────────────────────────────── */

console.log(`\n${pass} 过 / ${fail} 败`);
if (fail) {
  console.log(`败的：${failed.join("、")}`);
  process.exitCode = 1;
}
