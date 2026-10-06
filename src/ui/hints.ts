/**
 * 功能提示（"新手友好"那一套）的**注册表**。
 *
 * 用户 2026-10-06 点名：「整理一下这个软件里面所涉及到的所有的提示，看看哪些是可以
 * 加入"不再显示"的」，并补了一条质量要求：「**提示要确定**——如果说出现了那些情况
 * 才显示提示」。
 *
 * 所以这里不是一堆散落的 if，而是**一张表**：每条提示有 id、有**触发形态**、
 * 有**一句话写死的触发条件**、有出厂默认。展示、静音、设置页那三处**都读这一张表**
 * ——各写一份的下场是"设置里关了、屏幕上还在弹"。
 *
 * # 三条判定规则（`该显示吗` 就是照这三条写的）
 *
 * 1. **上下文成立**（每条各写各的，见 `条件`）；
 * 2. **没被静音**（`hints.<id>` 不是 `false`——⚠️ **「不再显示」勾选框与设置页那个
 *    开关写的是同一个值**，两处各存一份必然对不上）；
 * 3. **当场型**只要条件在就出现；**首次型**显示过一次就记下来、不再出现。
 *
 * # 两种触发形态
 *
 * | 形态 | 什么时候出现 | 例子 |
 * |---|---|---|
 * | **当场** | 条件成立就出现，条件一消失就收起 | 链接、代码块、表格 |
 * | **首次** | 一辈子只来一次（除非去设置里重新打开） | 斜杠菜单、标题回车、自动保存 |
 *
 * # ⚠️ 哪些东西**不进**这张表（有意排除，不是漏了）
 *
 * - **一切报错 / 失败提示**（剪贴板被拒、上传失败、导入失败…）——项目里有一条硬口径
 *   「**报错不是文案**」：它报告"刚才那件事没成"，能静音就成了静默失败；
 * - **外部改动条**（`ui/ExternalChangeBar.tsx`）——它一旦消失，"文件被别的程序改了"
 *   这件事就漏过去了（理由写在那个文件头）；
 * - **强制专注的红屏**（`ui/FocusAlarmWindow.tsx`）——那是状态，不是提示。
 *
 * # ⚠️ 文案写成**函数**
 *
 * `文案: () => t("…")`，不是 `文案: t("…")`。模块级求值会把译文**锁死在加载那一刻
 * 的语言**上（BUG-38 就是这么来的：语言还没定，`T()` 拿到的是原文，之后没人再动它）。
 * 顺带一个好处：`t("…")` 那几个**字面量**留在源码里，`tools/i18n-check.sh` 数得到它们。
 */

import { t } from "@/i18n";

/** 提示的触发形态。 */
export type 提示类型 = "当场" | "首次";

export interface 提示声明 {
  /** 永久 id。⚠️ 它同时是落盘的键（`hints.<id>`），**改了等于把用户的静音设置弄丢**。 */
  readonly id: string;
  readonly 类型: 提示类型;
  /**
   * **什么时候出现**——一句话写死的判据。
   *
   * ⚠️ 实现必须照着这一句写。写得比它宽（比如"光标在附近"）就是"到处乱弹"，
   * 写得比它窄就是"该出现时不出现"——两种都是用户 2026-10-06 要求避开的。
   */
  readonly 条件: string;
  /** 出厂默认开不开。 */
  readonly 默认: boolean;
  /** 正文。⚠️ 见文件头「文案写成函数」那一段，别改成模块级求值。 */
  readonly 文案: () => string;
}

/**
 * **这一张表就是全部提示**。加一条 = 在这里添一项（＋在用到它的地方调 `useHint`）。
 *
 * ⚠️ 加之前先回答三个问题：① 它属于"当场"还是"首次"？② **精确条件**是什么
 * （写成 `条件` 那一栏）？③ 它**是不是报错**——是报错就别放进来（见文件头）。
 */
export const 提示表: readonly 提示声明[] = [
  {
    id: "linkCtrlClick",
    类型: "当场",
    条件: "折叠光标落在某个 link 的区间内，且这个链接的源码不在编辑态",
    默认: true,
    文案: () => t("Hold Ctrl and click to open the link."),
  },
  {
    id: "codeBlockExit",
    类型: "当场",
    条件: "光标所在的那一行是代码块里最后一个空行，且代码块里已经有内容",
    默认: true,
    文案: () => t("To leave a code block, press Enter twice or click somewhere else."),
  },
  {
    id: "tableTabLastRow",
    类型: "当场",
    条件: "光标在表格最后一行的单元格里（这时 Tab 会加出一行）",
    默认: true,
    文案: () => t("Tab moves to the next cell — on the last row it adds a new one."),
  },
  {
    id: "tableShiftTabFirstRow",
    类型: "当场",
    条件: "光标在表格第一行的单元格里（这时 Shift+Tab 挪不出去）",
    默认: true,
    文案: () => t("Shift+Tab goes back to the previous cell."),
  },
  {
    id: "slashMenu",
    类型: "首次",
    条件: "用户第二次新建文档、且光标停在一个空段落上时（第一次不弹——那时他还在看界面）",
    默认: true,
    文案: () => t("Type / at the start of an empty line to insert tables, math, emoji and more."),
  },
  {
    id: "headingEnter",
    类型: "首次",
    条件: "第一次打出 “# ” 之后、还没按回车的那一刻",
    默认: true,
    文案: () => t("Press Enter to turn this into a heading."),
  },
  {
    id: "autosave",
    类型: "首次",
    条件: "第一次因为切换文件而自动存盘之后",
    默认: true,
    文案: () => t("Switching files saved this one automatically. You can turn auto save off in Settings."),
  },
  {
    id: "findKey",
    类型: "首次",
    条件: "第一次在正文里按 Ctrl+F 之后",
    默认: true,
    文案: () => t("Ctrl+F finds text, Ctrl+H also replaces it."),
  },
  {
    id: "exportPdf",
    类型: "首次",
    条件: "第一次点「文件 → 导出 → PDF…」时",
    默认: true,
    文案: () => t("PDF is produced by your system's Pandoc — Nota does not bundle one."),
  },
];

/** 表里所有 id（给设置页与测试用）。 */
export function 提示id们(): string[] {
  return 提示表.map((条) => 条.id);
}

/** 按 id 找一条。找不到返回 `undefined`（⚠️ 调用方要按"没有这条"处理，别抛）。 */
export function 找提示(id: string): 提示声明 | undefined {
  return 提示表.find((条) => 条.id === id);
}

/**
 * **该不该显示这一条**——文件头那三条规则的唯一实现。
 *
 * 纯函数：不读 DOM、不读设置、不碰 React，三个入参由调用方给。
 * 这样它能在 node 里直接测（`tests/hints.test.ts`），而"设置里关了还在弹"
 * 这类 bug 也有一条能按住的地方。
 */
export function 该显示吗(参数: {
  id: string;
  /** 已经静音的（`hints.<id> === false`）。 */
  静音: ReadonlySet<string>;
  /** 已经显示过的（只对"首次"型有意义）。 */
  看过: ReadonlySet<string>;
  /** 这一条自己的上下文条件此刻成不成立。 */
  上下文成立: boolean;
}): boolean {
  const 条 = 找提示(参数.id);
  if (!条) return false;
  if (!参数.上下文成立) return false;
  if (参数.静音.has(参数.id)) return false;
  if (条.类型 === "首次" && 参数.看过.has(参数.id)) return false;
  return true;
}
