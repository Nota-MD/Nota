/**
 * **长期记录的热力图**（Contribution Graph 那种一格一天的小方格，2026-09-27 加，
 * 写作统计要的）。
 *
 * 用户原话：「加一个功能，类似 Contribution Graph 那样的热力图，记录长期数据。
 * 仅记录打字数。」——三句话定下三件事：**一格一天**（不是一小时、不是一次）、
 * **看得见长期**（默认铺半年，最多一年）、**只有打字数**（不比速度、不掺别的）。
 *
 * # 这一份只算格子的位置，不画
 *
 * 与 `ui/chart-ticks.ts` 同一条分工：**插件说数据、这里说版式、`PanelBody.tsx`
 * 画**。这样"哪一格是哪一天"可以脱离 React 单独测（`tests/heatmap.test.ts`），
 * 而 260px 宽的一栏里格子该多大、什么颜色是样式表的事（`styles/heatmap.css`）。
 *
 * # 三条口径
 *
 * | 事 | 怎么办 | 为什么 |
 * |---|---|---|
 * | 一列 = 一周 | **从周一起**，7 行 | 中文界面里的日历就是从周一起（周日打头是另一套习惯，选了就别改） |
 * | 最后那一列 | 到 `止` 那天为止，**下面留空** | 今天是周三就只画三格：把未来几天画成"0 字"是在编数据 |
 * | 缺的那些天 | 当 **0**，不是当"没有" | 热力图要回答的是"最近写得勤不勤"，空白格正是答案的一半 |
 *
 * ⚠️ **它不认识"今天"**：窗口的右端由插件给的 `止` 决定（写作统计给的是
 * `nota.time.now()` 那一天）。拿不到时间来源时插件根本不会发这一块，
 * 所以这里不需要处理"今天几号"——那是插件的事，而它在沙箱里只有一条时间来源。
 *
 * ⚠️ **上限两条，都在这里夹**：`面板节点上限`（200）逼得插件不能一天一项地发
 * （一年 365 天），所以记录走的是**一个字符串**（格式由宿主定，见
 * `读热力记录`）；而画多少列是插件说的（`weeks`），这里夹在 8~53。
 *
 * ⚠️ 月份那行标签（`9月` / `Sep`）走 `Intl`，**不写死「月」**：这张图既在面板上、
 * 也在分享图上，而分享图是要发出去的（英文界面下发出「9月」等于没翻译）。语言取
 * `i18n` 那一份全局真相——和 `ui/share-card.ts::当前卡色()` 读 `<html>` 同一个道理：
 * 那是全应用唯一的一份，不该从调用方一层层传进来。
 */

import { language } from "../i18n";

/** 一天的记录。 */
export interface HotForceRecordRecord {
  /** `2026-09-27`。 */
  date: string;
  /** 那一天写了多少字。**只有字**——用户点名「仅记录打字数」。 */
  value2: number;
}

/** 一格。 */
export interface HotForceCell {
  /** `2026-09-27`。渲染层拿它做悬停提示。 */
  date: string;
  value2: number;
  /** 颜色深浅，**0 = 没写**（`1`~`4` 由大到小）。 */
  level: 0 | 1 | 2 | 3 | 4;
}

/** 一列 = 一周。 */
export interface HotForceColumn {
  /** 这一列顶上那个月份（`9月`）。**空串 = 不标**（同一个月只标一次）。 */
  month: string;
  /** 从周一到周日，最多 7 格。最后一列可能不足 7 格。 */
  cell2: HotForceCell[];
}

/** 一张算好的热力图。 */
export interface HotForceImage {
  column: HotForceColumn[];
  /** 窗口里最大的一天（定每档的深浅）。 */
  mostLarge: number;
  /** 窗口里的总和（「这半年一共写了多少字」）。 */
  totalCount: number;
  /** 窗口里**有字**的天数（不是窗口长度——"写了 173 天"比"这半年"更有用）。 */
  dayNumber: number;
  /** 窗口的第一天 / 最后一天（`2026-04-06` / `2026-09-27`）。 */
  start5: string;
  end2: string;
}

/** 一年最多这些列。再多一年就摆不下了（53 周 = 371 天）。 */
const weekNumberLimit = 53;
/** 少于这个列数不成"长期"（8 周 = 两个月）。 */
const weekNumberBelowLimit = 8;
/** 插件没写 `weeks` 时铺多久：半年。 */
const defaultWeekCount = 26;
/** 最多认这么多天的记录（比一年略多，防手里的账本比窗口还长）。 */
const recordRecordLimit = 400;

/**
 * 读插件给的 `days` 字符串。
 *
 * **格式是宿主定的**（不是插件自由发挥）：`2026-09-27:1284 2026-09-26:0`，
 * 一对之间用空白隔开，日期是 `YYYY-MM-DD`，值是**非负整数**。
 *
 * ⚠️ **为什么不是数组**：宿主对**一层里的项数**有 200 的上限
 * （`lua/api/ui.rs::面板节点上限`，那是防"一次渲染几千行"的），而一年是 365 天。
 * 字符串这一条路走的是另一条上限（一个文本字段 20000 字），365 天大约 5 KB，
 * 宽裕。所以这个格式是**被上限逼出来的**，不是设计偏好——真要改成数组，
 * 得先把那一层的上限改了，而 200 那条线是别的块（`list` / `diff` / `graph`）
 * 一起在用的。
 *
 * ⚠️ **坏项丢掉、不报错**（同 `读刻度`）：一个日期写错不该让整张图消失。
 * ⚠️ 日期**要比对真日历**：`2026-02-30` 长得像日期、`2026-13-01` 也像，
 * 但都不存在——它们会往后溢出成 3 月 2 日 / 次年 1 月 1 日，在图上就是一格
 * 凭空多出来的字。所以这里走的是与铺格子同一个 `日号()`。
 * ⚠️ 同一天出现两次**后写的赢**：那是"账本里有重复行"的症状，而这里不是
 * 修账的地方（`plugins/stats/main.lua` 那边按天索引，本来就不会重复）。
 */
export function readHotForceRecordRecord(raw: unknown): HotForceRecordRecord[] {
  if (typeof raw !== "string") return [];
  const table2 = new Map<string, number>();
  for (const paragraph2 of raw.split(/\s+/)) {
    if (!paragraph2 || table2.size >= recordRecordLimit) continue;
    const split = paragraph2.indexOf(":");
    if (split <= 0) continue;
    const date = paragraph2.slice(0, split);
    if (!dateNumber(date)) continue;
    const value2 = Number(paragraph2.slice(split + 1));
    if (!Number.isFinite(value2) || value2 < 0) continue;
    table2.set(date, Math.floor(value2));
  }
  return [...table2].map(([date, value2]) => ({ date, value2 }));
}

/** `YYYY-MM-DD` 才算。 */
function isDatePeriod(s: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(s);
}

/**
 * `2026-09-27` → **本地时区**的那一天零点。
 *
 * ⚠️ 不能写 `new Date("2026-09-27")`：那一串会被当成 **UTC** 解析，在东八区
 * 变成前一天早上八点——整张图会整体偏一格，而且只在某些时区偏。所以自己拆。
 */
function dateNumber(date: string): Date | null {
  if (!isDatePeriod(date)) return null;
  const year = Number(date.slice(0, 4));
  const month = Number(date.slice(5, 7));
  const day = Number(date.slice(8, 10));
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;
  const d = new Date(year, month - 1, day);
  // 溢出的日期（`2026-02-30` → 3 月 2 日）不算那一天，当没有。
  if (d.getMonth() !== month - 1 || d.getDate() !== day) return null;
  return d;
}

/** 反过来：本地那一天 → `2026-09-27`。 */
function dateString(d: Date): string {
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${month}-${day}`;
}

/** 加减天数。⚠️ 走 `setDate`（会自己跨月跨年），不是"加 86400 秒"——夏令时那天不是 24 小时。 */
function move2(d: Date, day: number): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate() + day);
}

/** 周一 = 0，周日 = 6。 */
function starPeriodHowMany(d: Date): number {
  return (d.getDay() + 6) % 7;
}

/** 数值 → 颜色档。⚠️ 相对**这张图的最大值**分四档（不写死阈值：一天 300 字和一天 3000 字都该有自己的深浅）。 */
function level(value2: number, mostLarge: number): 0 | 1 | 2 | 3 | 4 {
  if (value2 <= 0) return 0;
  if (mostLarge <= 0) return 1;
  if (value2 * 4 <= mostLarge) return 1;
  if (value2 * 2 <= mostLarge) return 2;
  if (value2 * 4 <= mostLarge * 3) return 3;
  return 4;
}

/**
 * 把记录铺成格子。
 *
 * `止` 是窗口右端那一天（`YYYY-MM-DD`），`周数` 是窗口有几列（夹在 8~53，
 * 认不出来用 26）。`止` 认不出来时退到**记录里最晚的那一天**——两张都认不出来
 * 就是一张空图（`列` 是空数组，渲染层不画）。
 */
export function computeHeatmap(recordRecord: HotForceRecordRecord[], end2: string, weekNumber: number): HotForceImage {
  const emptyValue: HotForceImage = { column: [], mostLarge: 0, totalCount: 0, dayNumber: 0, start5: "", end2: "" };
  const table2 = new Map(recordRecord.map((r) => [r.date, r.value2]));

  let endDate = dateNumber(end2);
  if (!endDate) {
    for (const r of recordRecord) {
      const d = dateNumber(r.date);
      if (d && (!endDate || d > endDate)) endDate = d;
    }
  }
  if (!endDate) return emptyValue;

  const columnCount = Math.min(weekNumberLimit, Math.max(weekNumberBelowLimit, Math.floor(weekNumber) || defaultWeekCount));
  // 末列的**周一**：今天是周三就退回两天，好让最后一列还是"周一到周日"。
  const endColumnStart = move2(endDate, -starPeriodHowMany(endDate));
  const firstColumnStart = move2(endColumnStart, -(columnCount - 1) * 7);

  const column: HotForceColumn[] = [];
  let mostLarge = 0;
  let totalCount = 0;
  let dayNumber = 0;
  let aboveItemLabel = "";
  for (let c = 0; c < columnCount; c++) {
    const localColumnStart = move2(firstColumnStart, c * 7);
    const cell2: HotForceCell[] = [];
    for (let r = 0; r < 7; r++) {
      const localDate = move2(localColumnStart, r);
      if (localDate > endDate) break; // 最后一列：未来的那几天不画（`break` 不是 `continue`）
      const key = dateString(localDate);
      const value2 = table2.get(key) ?? 0;
      if (value2 > mostLarge) mostLarge = value2;
      totalCount += value2;
      if (value2 > 0) dayNumber += 1;
      cell2.push({ date: key, value2, level: 0 }); // 档要等最大出来才知道，下面补
    }
    // ⚠️ 标签先算进一个局部量再 push：`列[列.length - 1]` 那种写法在
    // `noUncheckedIndexedAccess` 下是"可能没有"，而且它读的正是刚写进去的东西。
    const localLabel = monthLabel(localColumnStart, aboveItemLabel);
    column.push({ month: localLabel, cell2 });
    aboveItemLabel = localLabel || aboveItemLabel;
  }

  // ⚠️ **两遍**：深浅是相对最大值的，而最大值要等所有格子都数完才知道。
  for (const oneColumn of column) {
    for (const value of oneColumn.cell2) value.level = level(value.value2, mostLarge);
  }

  return { column, mostLarge, totalCount, dayNumber, start5: dateString(firstColumnStart), end2: dateString(endDate) };
}

/**
 * 那一列表头要写哪个月（`9月` / `Sep`）。**同一个月只标一次**（写在它出现的第一列上）。
 *
 * ⚠️ 判据是"与**上一列的标签**不同"，不是"与上一列的日子不同"：跨月的那一列
 * 常常是半截（上个月的最后几天 ＋ 这个月的头几天），拿日子比会在两个月之间
 * 来回跳着标。
 *
 * ⚠️ `month: "short"` 是**唯一**能同时给出「9月」和「Sep」的档：`"long"` 在中文
 * 里还是「9月」、在英文里变成「September」（26 列里挤不下），`"narrow"` 在英文
 * 里退化成一个字母「S」（9 月和 11 月长得一模一样）。
 */
function monthLabel(localColumnStart: Date, aboveItem: string): string {
  const local = monthName(localColumnStart);
  return local === aboveItem ? "" : local;
}

/** 月份名随界面语言走。**按语言缓存一个**——26 列会问 26 次，而语言几乎不变。 */
let monthCellStyle: { language: string; device: Intl.DateTimeFormat } | null = null;

function monthName(d: Date): string {
  const language2 = language();
  if (!monthCellStyle || monthCellStyle.language !== language2) {
    monthCellStyle = { language: language2, device: new Intl.DateTimeFormat(language2, { month: "short" }) };
  }
  return monthCellStyle.device.format(d);
}
