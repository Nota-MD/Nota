/**
 * 强制专注的**这一轮总结**（2026-09-27，用户点名）。
 *
 * 用户原话：「还有就是记得做一下专注模式结束后的总结功能就是将这一次专注模式的
 * 情况显示出来，并且像心电图那样也支持导出。」
 *
 * # 它算的都是**前端手上已经有的东西**
 *
 * ⚠️ 宿主那一侧**一行都没改**，而且这是有意的：计时线程每秒把一整份快照广播给
 * 所有窗口（`focus/mod.rs::起` → `EVENT_FOCUS`），里面已经有 `elapsed_ms` /
 * `focused_ms` / `away_total_ms` / `alarms` / `balance_ms`——**这一轮的全部账目**。
 * 结束那一下（`nota_focus_stop`）宿主会把账本清成空快照（`focus::停下`），
 * 所以真正需要前端自己留的只有**一条曲线**（余额随时间怎么走），
 * 而那条曲线就是"每秒那一个余额"攒起来的——见 [`记一笔`]。
 *
 * ⚠️ 代价如实记：**快照是 1 秒一发的**，所以总结里的每个时长都是"最后那一拍"
 * 的读数，最坏差 1 秒。不值得为这一秒去改宿主的命令签名（那要让 `停下` 拿得到
 * 设置、还要多一份"最后一份快照"的状态），而秒级误差在这张卡上读不出来。
 *
 * # 分享卡为什么在这儿造
 *
 * 用户要的"导出"就是写作统计那张 1080×1350 的分享卡（`ui/share-card.ts`），
 * 而那张卡只认一个 [`PanelShare`]（插件给字段、宿主说怎么画）。强制专注是
 * **核心功能不是插件**（用户原话），所以没有插件来递字段——这份活落在这里：
 * 本模块把 [`总结`] 摊成一份 `PanelShare`，画的那一半仍然只有一份实现。
 *
 * 于是"强制的卡"和"统计的卡"**共用同一个渲染器**，改版式只改一处。
 */

import type { FocusState } from "@/bridge/types";
import { t } from "@/i18n";
import type { tick } from "@/ui/chart-ticks";
import type { PanelShare, PanelShareStat } from "@/ui/panel-nodes";
import { sayTimeLength } from "@/ui/useForceFocus";

/** 一次采样：这一轮开始后的第几秒，余额还剩几秒。 */
export interface AdoptStylePoint {
  /** 距开始多少秒（`elapsed_ms` 取整）。 */
  seconds: number;
  /** 当时余额多少秒（`balance_ms` 取整）。 */
  balance: number;
}

/**
 * 采样序列最多留几个点。
 *
 * ⚠️ 900 = **15 分钟**（一秒一个点）。比这更长的轮次不是丢掉最早那一段，
 * 而是把间隔**翻倍**——见 [`抽稀`]。上限本身只是个内存阀门：每个点两个数，
 * 900 个点是十几 KB。
 */
export const adoptStyleLimit = 900;

/**
 * 这一轮的**硬下限**：短于它就不弹总结。
 *
 * ⚠️ 5 秒这个数是拍的，但**这条规矩本身不是**：菜单那颗按钮是"开/关"两态，
 * 用户点错了、或者只是想看看这个功能长什么样，一开一关之间弹一张"你专注了
 * 3 秒"的卡，是在嘲弄他。而这条线以下本来也没有可看的东西——
 * 一次采样都没有（第一拍要到 1 秒后才有）。
 */
export const mostShortTotalJoinSeconds = 5;

/**
 * 记一笔（每秒那一个事件调一次）。
 *
 * ⚠️ 同一秒里来两帧时**就地更新，不追加**：这一路上有两个来源（计时线程的
 * 每秒广播 ＋ 命令的即时回执广播），同一秒撞上两次是常态。追加的话曲线的横轴
 * 会比真实时间密——而"多密"正是这条曲线要传达的东西，它不是装饰。
 *
 * ⚠️ `running = false` 时**把序列清掉**：那是"这一轮结束了"，留着一轮的采样
 * 会让下一轮的第一秒接在上一轮的尾巴上（曲线里会出现一根从 0 竖直跳到
 * 25 分钟前的线）。清空这件事必须发生在这里，命令层看不见它。
 */
export function recordValueStroke(oldValue: AdoptStylePoint[], state: FocusState): AdoptStylePoint[] {
  if (!state.running) {
    return oldValue.length === 0 ? oldValue : [];
  }
  const point: AdoptStylePoint = {
    seconds: Math.round(state.elapsed_ms / 1000),
    balance: Math.round(state.balance_ms / 1000),
  };
  const end = oldValue[oldValue.length - 1];
  if (end && end.seconds >= point.seconds) {
    return [...oldValue.slice(0, -1), point];
  }
  const newValue = [...oldValue, point];
  return newValue.length <= adoptStyleLimit ? newValue : extractSparse(newValue);
}

/**
 * 点太多时把间隔**翻倍**：相邻两点合成一点，取**余额大的那个**。
 *
 * ⚠️ 取大的那个（而不是平均数、也不是后一个）是**为了保住峰**：这条曲线说的是
 * "余额什么时候被扣空、什么时候攒回上限"，两个方向的尖角都在极值上，平均一下
 * 就把它磨圆了。代价是"扣到底"的那一刻可能被记成"还没到底"——所以卡片上还有
 * 一个**警报次数**，那才是"到底了没有"的判据。
 *
 * ⚠️ 单数的尾巴**原样留着**（不是丢掉）：丢掉的话横轴末尾会缺一小段，
 * 而"最后余额是多少"正是用户最想看的那个数。
 */
export function extractSparse(point: AdoptStylePoint[]): AdoptStylePoint[] {
  const output2: AdoptStylePoint[] = [];
  for (let i = 0; i < point.length; i += 2) {
    const before2 = point[i]!;
    const after = point[i + 1];
    if (!after) {
      output2.push(before2);
      break;
    }
    output2.push(after.balance >= before2.balance ? after : before2);
  }
  return output2;
}

/** 这一轮的全部读数（卡片、对话框都从它出发）。 */
export interface TotalJoin {
  /** 这一轮总共持续多少秒（含警报冻住的那段）。 */
  timeLengthSeconds: number;
  /** 真的在写的秒数。 */
  dedicatedNoteSeconds: number;
  /** 走开被扣的秒数（**不含宽限期**，宽限那几秒不算离开也不欠账）。 */
  leaveOpenSeconds: number;
  /** 响了几次警报。 */
  warnReport: number;
  /** 余额曲线。 */
  adoptStyle: AdoptStylePoint[];
}

/**
 * 把"最后那一拍"的读数摊成一份总结。
 *
 * ⚠️ `时长秒` 兜到至少 1：`elapsed_ms` 理论上不会是 0（有 [`最短总结秒`] 拦着），
 * 但它是宿主来的数，而这里拿它当除法的分母（专注率），0 会让那一格变成 `NaN`。
 */
export function createTotalJoin(state: FocusState, adoptStyle: AdoptStylePoint[]): TotalJoin {
  return {
    timeLengthSeconds: Math.max(1, Math.round(state.elapsed_ms / 1000)),
    dedicatedNoteSeconds: Math.max(0, Math.round(state.focused_ms / 1000)),
    leaveOpenSeconds: Math.max(0, Math.round(state.away_total_ms / 1000)),
    warnReport: state.alarms,
    adoptStyle,
  };
}

/** 够不够长到值得弹一张总结。见 [`最短总结秒`]。 */
export function valueObtainTotalJoin(total: TotalJoin): boolean {
  return total.timeLengthSeconds >= mostShortTotalJoinSeconds;
}

/**
 * 专注率（0~100 的整数）。
 *
 * ⚠️ 分母是**专注 ＋ 离开**，不是 `时长`：警报响着的那段时间账本冻住，
 * 用户既没在写也没被扣——把它算进分母等于因为"警报响了"而拉低专注率，
 * 而警报恰恰是他**回来过**的证据。
 * ⚠️ 两个都是 0 时返回 `null`（**"这一格没数"**，不是 0%）：卡片上那一格
 * 会画成破折号，而画成 0% 是在说他一次都没专注过——那是假话。
 */
export function dedicatedNoteRate(total: TotalJoin): number | null {
  const shareMother = total.dedicatedNoteSeconds + total.leaveOpenSeconds;
  if (shareMother <= 0) return null;
  return Math.round((total.dedicatedNoteSeconds / shareMother) * 100);
}

/**
 * 卡片右上角那个时刻（`2026年9月27日 22:07`）。
 *
 * ⚠️ 格式串本身**走 `t()`**（与写作统计那张卡同一个手法：`plugins/stats/ticks.lua`
 * 的 `date_text` 把整个格式串交给插件的文案表）。**不自己按语言写 if**——
 * 那样加第三种语言时这里是第二处要改的地方。
 * ⚠️ 时分**在这里补好零**再传进去（`{3}` 是 `22:07` 不是 `22:7`）：
 * `t()` 只做占位符替换，不做数字格式化。
 */
export function sayTimeMoment(now: Date): string {
  const fill = (n: number) => String(n).padStart(2, "0");
  return t(
    "{0}-{1}-{2} {3}",
    String(now.getFullYear()),
    String(now.getMonth() + 1),
    String(now.getDate()),
    `${fill(now.getHours())}:${fill(now.getMinutes())}`,
  );
}

/** 文件名里的时刻：`20260927-2207`。⚠️ 纯 ASCII——它要进文件系统。 */
export function textItemTimeMoment(now: Date): string {
  const fill = (n: number) => String(n).padStart(2, "0");
  return (
    `${now.getFullYear()}${fill(now.getMonth() + 1)}${fill(now.getDate())}` +
    `-${fill(now.getHours())}${fill(now.getMinutes())}`
  );
}

/**
 * 横轴刻度：开始 / 中间 / 结束三档。
 *
 * ⚠️ **按"点在序列里的位置"摆，不按秒摆**：卡片那条曲线的横轴是**序号**
 *（`ui/share-card.ts` 就按序号等距画点），所以刻度也必须等距，否则读数会对不上
 * 线。等距成立的前提是采样间隔均匀——[`抽稀`] 是整对整对合的，间隔翻倍之后
 * 仍然均匀（单数尾巴差半格，那是这条路上唯一的偏差，秒级的）。
 *
 * ⚠️ 只有**两档以上的点**才给刻度：一个点时摆三档等于摆三个一样的数。
 */
export function horizontalTick(adoptStyle: AdoptStylePoint[]): tick[] {
  if (adoptStyle.length < 2) return [];
  const totalSeconds = adoptStyle[adoptStyle.length - 1]!.seconds;
  return [
    { at: 0, label: sayTimeLength(0) },
    { at: 0.5, label: sayTimeLength((totalSeconds / 2) * 1000) },
    { at: 1, label: sayTimeLength(totalSeconds * 1000) },
  ];
}

/**
 * 把一份总结摊成一张分享卡的字段。
 *
 * ⚠️ 文案全走 `t()`，但**格式与图例的取舍不走**（那是宿主的事——同
 * `ui/share-card.ts` 头上"插件说什么、宿主说怎么显示"）。所以这里只决定
 * **填哪些字段**：大数字是"专注了多久"，三格是时长 / 离开 / 警报。
 *
 * ⚠️ 大数字选**专注时长**而不是总时长：用户关心的是"我写了多久"，
 * 而总时长里含他走开的时间——那张卡要能拿去给人看。
 */
export function createShareEnjoyCard(total: TotalJoin, now: Date): PanelShare {
  // ⚠️ 曲线至少要两个点才画得出来。采样空/只有一个点时**兜成一条平线**：
  // 卡片那一侧按"点的序号"算横轴，一个点会让刻度与纵轴范围一起退化。
  const balanceSeconds = total.adoptStyle.map((p) => p.balance);
  const point = balanceSeconds.length >= 2 ? balanceSeconds : [balanceSeconds[0] ?? 0, balanceSeconds[0] ?? 0];

  const rate = dedicatedNoteRate(total);
  const threeCells: PanelShareStat[] = [
    { k: t("Session Length"), v: sayTimeLength(total.timeLengthSeconds * 1000), small: "" },
    { k: t("Focus Share"), v: rate === null ? "" : String(rate), small: rate === null ? "" : "%" },
    // ⚠️ 单位写进**抬头**（「警报次数」）而不是单独一格 `small`（原来是「次」）。
    // 理由只有一条，但它是硬的：`small` 是个裸字符串，**表达不了单复数**——
    // 英文那边会印出 `Alarm 1 times`（真印出来过，见 `docs/06` §5.28 那一批）。
    // 挪进抬头之后两边都成立：`Alarms 1` / `警报次数 1`。
    // ⚠️ 顺带把三格的抬头拉齐成四字（本轮时长 / 专注占比 / 警报次数），
    // 它们本来就是并列的三格。
    { k: t("Alarms"), v: String(total.warnReport), small: "" },
  ];

  return {
    title: t("Force Focus"),
    // ⚠️ **不过 `t()`**：卡片上那行小字是英文的，与写作统计那张卡同一个口径
    //（`plugins/stats/main.lua` 里 `subtitle = "Writing Stats"` 是个字面量）。
    // 包一层 `t()` 会凭空多出一个"原文即译文"的键，那是给翻译表添噪音。
    subtitle: "Focus Session",
    date: sayTimeMoment(now),
    label: t("You Focused For"),
    value: sayTimeLength(total.dedicatedNoteSeconds * 1000),
    unit: "",
    points: point,
    xTicks: horizontalTick(total.adoptStyle),
    xMinor: 0,
    shape: "curve",
    heat: null,
    less: "",
    more: "",
    stats: threeCells,
    foot: t("This session you were away for {0}.", sayTimeLength(total.leaveOpenSeconds * 1000)),
    file: `nota-focus-${textItemTimeMoment(now)}.png`,
  };
}
