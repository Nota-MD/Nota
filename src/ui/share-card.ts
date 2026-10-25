/**
 * 写作统计的**分享卡**：一张 1080×1350 的图（2026-09-27）。
 *
 * 用户 2026-09-26：「结束后可以制作分享图分享打字数据（存盘或者复制到剪贴板）。
 * 分享图要包含 Nota 和其标识（顺带推广产品）」，然后 2026-09-27：「分享支持
 * 全日状态，也应该支持某一次的记录的状态」。
 *
 * # 谁画这张图，为什么是这里
 *
 * ⚠️ **插件画不了**：Lua 沙箱里没有剪贴板、也生成不了图片（`docs/10` §11.2 那张
 * 边界表）。所以插件只**给字段**（`kind = "share"`：标题、大数字、三格数、点、
 * 横轴刻度），画成什么样在这里——与"宿主不认识 Markdown"同一条理由：插件说
 * **什么**，宿主说**怎么显示**。
 *
 * 于是这张图的每一处像素都由本文件说了算，插件改了文案/数字它跟着变，插件想
 * 换版式得改宿主。
 *
 * # 版式来自哪儿
 *
 * 出处是用户看过的设计图：`plugins/stats/design/分享图-深色.html` /
 * `分享图-浅色.html`（深浅两版，1080×1350，那条 `pow(v/MAX, 0.42)` 的曲线也在
 * 那份 HTML 里）。本文件是那份 HTML 的**移植**，不是重新设计一遍——
 * 所以下面那些坐标都是照那份 CSS 量的，改版式请连着设计稿一起改。
 *
 * ⚠️ **两处与设计稿有意不同**，都是用户后来点名加的：
 *
 * 1. **横轴刻度**（设计稿上没有）——「横纵坐标的刻度要标」；
 * 2. **纵轴刻度**（同样没有）——为此把图区左边让出 60px 给那几个数字，
 *    并把曲线高度从 340 收到 320（下面那排横轴标签要地方）。
 *
 * ⚠️ 设计稿页脚那句「Nota · 专心写作」**没上**：一句话只能有一种语言，而插件
 * 给的 `foot`（「这一轮，你写下了 1284 个字」）是**会翻译**的。左边放它、
 * 右边只留产品名 "Nota"，两边都不至于中英混排。
 *
 * # 为什么是 SVG，不是 canvas 直接画
 *
 * 一张图两种用途（存 PNG / 进剪贴板）都要**像素**，但画的过程用 SVG 有三个好处：
 * 版式是声明式的、改一个数不用重排代码；测试能在 node 里断言那一串 SVG
 * （`tests/share-card.test.ts`，不需要真画）；光栅化那一跳由浏览器做，字体、
 * 圆角、渐变都不用自己实现。代价是多一步"SVG → 位图"，那一步见 `光栅化`。
 *
 * ⚠️ 卡片里**没有一处外链**（图标是内联的 `ui/nota-mark.ts`）：外链会把 canvas
 * 弄脏，`toBlob` 直接抛——那是"图做出来了但存不下去"。
 */

import type { tick } from "@/ui/chart-ticks";
import type { HotForceImage } from "@/ui/heatmap";
import type { PanelShare } from "@/ui/panel-nodes";
import { markRecognize } from "@/ui/nota-mark";
import { cardAccent, uiAccent } from "@/styles/accent";

/** 卡片尺寸（设计稿就是这两个数）。 */
export const cardWidth = 1080;
export const cardHeight = 1350;

/** 字体：与界面同一套（只用系统装了的，不捆字体，见 `docs/10` §11.2）。 */
const characterBody = `"Noto Sans CJK SC","Source Han Sans SC","PingFang SC","Microsoft YaHei",sans-serif`;

// ── 配色 ─────────────────────────────────────────────────────────────────
//
// 底色 / 字色 / 线色照抄设计稿（深色那版的底色带一点蓝，不是纯黑；浅色那版不是纯白）。
// ⚠️ **强调色（`主`）2026-09-27 起跟随用户自己的主题色**——用户原话是
// 「分享卡颜色强调是跟随自己的主题」＋「可以稍微调整一下，视觉上美观就可以」。
// 所以 `深色卡` / `浅色卡` 里那个值是**设计稿的兜底**，真正用哪一个由
// `当前卡色()` 现问 `--accent`（见 `styles/accent.ts::卡片主色`：跟随 + 按底色
// 把亮度挪到看得清的那一段，色相与饱和度不动）。
// ⚠️ **深色那套是更亮的 `#4f82fb`**（不是浅色那套的 `#2f63d8`）：设计稿两个文件里
// 的 `--accent` 本来就不是同一个值，深底上要更亮才看得清。2026-09-27 目检时发现
// 这里两套都写成了浅色那个值，深色卡的大数字与曲线**比设计稿暗了一档**——照设计稿
// 改回来了（看 `plugins/stats/design/分享图-深色.png` 里那个 124 的颜色就知道）。

/** 一张卡片的配色。 */
export interface cardColor {
  bottom1: string;
  bottom2: string;
  character2: string;
  faint: string;
  line2: string;
  /** 那三格指标的底色，配合 `块透` 用（半透明靠 `fill-opacity`，不用 8 位 hex）。 */
  block: string;
  blockTransparent: number;
  /** 强调色：大数字与曲线。 */
  main: string;
}

export const darkCard: cardColor = {
  bottom1: "#0b0f16",
  bottom2: "#151d2b",
  character2: "#f2f5fa",
  faint: "#8b97ab",
  line2: "#222c3d",
  block: "#ffffff",
  blockTransparent: 0.045,
  main: "#4f82fb",
};

export const lightCard: cardColor = {
  bottom1: "#f7f9fc",
  bottom2: "#eef2f8",
  character2: "#131922",
  faint: "#6b7688",
  line2: "#dde4ee",
  block: "#131922",
  blockTransparent: 0.035,
  main: "#2f63d8",
};

/**
 * 此刻该用哪一套：底色跟着界面深浅走，**强调色跟着用户自己的主题色走**。
 *
 * ⚠️ 直接读 `<html data-ui-mode>` 与 `--accent` 的**计算值**，**不走 props**：
 * 那是 `styles/applyTheme.ts` 写的、全应用唯一的那一份真相（`ui/useUiMode.ts`
 * 文件头写着它为什么只该有一份）。卡片是**点下去那一刻**现做的，不是每一帧
 * 都要跟着重画的东西——为它把设置从 `App.tsx` 一层层传到面板里，多出来的
 * 那串 props 全是噪音。
 *
 * ⚠️ 两套底色各自那一份 `主` 会被**覆盖掉**（返回的是新对象，不动常量）——
 * 直接改常量的话，同一个页面里先做浅色卡再做深色卡就会串味。
 */
export function currentCardColor(): cardColor {
  const mode2 = document?.documentElement?.dataset?.uiMode;
  const bottom = mode2 === "light" ? lightCard : darkCard;
  return { ...bottom, main: cardAccent(uiAccent(), mode2 !== "light") };
}

// ── 版式（照设计稿量的）──────────────────────────────────────────────────

const pageEdge = 80;
/** 图区四边。左边界让开了 60px 给纵轴那几个数字（见文件头第 2 条）。 */
const imageLeft = 140;
const imageRight = cardWidth - pageEdge;
const imageAbove = 551;
const imageBelow = 871;
/** 曲线**不贴边**：斜率大的那一段贴着上下边会看不清哪里是峰（设计稿也是 8）。 */
const imageInsideEdge = 8;
/** 页脚那条横线的高度。 */
const pageFootLine = 1226;

// ── 一段一段拼 ───────────────────────────────────────────────────────────

/** XML 里那几个不能直接写的字符。⚠️ `&` 必须第一个换，不然会把别处换出来的 `&` 再换一遍。 */
function convertMeaning(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

interface CharacterParameter {
  number: number;
  coarse?: number;
  color?: string;
  anchor2?: "start" | "middle" | "end";
  /** 字距（设计稿里副标题与页脚那两处是散开的）。 */
  distance?: number;
}

/** 一行字。坐标是**基线**（SVG 的规矩），不是左上角。 */
function character2(content: string, x: number, y: number, parameter2: CharacterParameter): string {
  if (!content) return "";
  const anchor2 = parameter2.anchor2 && parameter2.anchor2 !== "start" ? ` text-anchor="${parameter2.anchor2}"` : "";
  const distance = parameter2.distance ? ` letter-spacing="${parameter2.distance}"` : "";
  return (
    `<text x="${x}" y="${y}" font-family='${characterBody}' font-size="${parameter2.number}"` +
    ` font-weight="${parameter2.coarse ?? 400}" fill="${parameter2.color ?? "#000"}"${anchor2}${distance}>${convertMeaning(content)}</text>`
  );
}

/** 量一段字有多宽（大数字后面那颗单位要紧挨着它，SVG 自己排不了版）。 */
export type MeasureWidthDevice = (text4: string, number: number, coarse: number) => number;

/**
 * 量不到字宽时的估法：数字与小数点窄一点，别的按"一个全角"算。
 * ⚠️ 是**估**的：真量不到时（没有 canvas）位置会差几个像素，而差几像素的后果
 * 只是大数字和单位之间宽一点或挤一点——比"不画单位"轻得多。
 */
const estimateWidth: MeasureWidthDevice = (text4, number, coarse) => {
  let width = 0;
  for (const item2 of text4) width += /[0-9.\-]/.test(item2) ? 0.55 : 0.62;
  return width * number * (coarse >= 700 ? 1.02 : 1);
};

/** 用 canvas 量，量不到退回 `估宽`。 */
function defaultMeasureWidth(): MeasureWidthDevice {
  try {
    const ctx = document.createElement("canvas").getContext("2d");
    if (!ctx) return estimateWidth;
    return (text4, number, coarse) => {
      ctx.font = `${coarse} ${number}px ${characterBody}`;
      return ctx.measureText(text4).width;
    };
  } catch {
    return estimateWidth;
  }
}

/**
 * 纵轴的三个位置怎么算。
 *
 * ⚠️ 卡片的纵轴是**压过的**（`pow(比, 0.42)`，设计稿那条）：不压的话，一片
 * 20–30 字/分钟的平台会贴着底压成一条直线，而那正是这张图最常出现的形状。
 * 压过之后刻度**位置**是不等距的，但每一个位置都还对应一个**真的值**——
 * 这跟对数轴是一回事，不是"随便摆三个数"。
 */
function verticalPosition(v: number, large: number, small: number): number {
  const cross = large - small;
  const compare = cross > 0 ? (v - small) / cross : 0.5;
  const press2 = Math.pow(Math.min(1, Math.max(0, compare)), 0.42);
  const y = imageBelow - imageInsideEdge - press2 * (imageBelow - imageAbove - 2 * imageInsideEdge);
  // ⚠️ 就地**收到一位小数**：这一个数会被用两次（刻度线画在哪、那行字画在哪），
  // 不收敛的话两处各带一串 17 位小数——线和对它的字可能差出半像素，而且那串
  // 数字白白进 SVG（一张图 3 档，进 PNG 之前先长了几百个字节）。
  return Math.round(y * 10) / 10;
}

/** 横轴一档刻度摆在哪（`at` 是 0~1 的比例）。 */
const horizontalPosition = (at: number) => imageLeft + at * (imageRight - imageLeft);

/**
 * 横轴标签的锚点：贴左端那档左对齐、贴右端那档右对齐，免得文字跑出卡片。
 *
 * ⚠️ 左端那条线是 **4.5%** 不是 2%：一档居中摆在 4% 的位置时，`09:00` 这种四个
 * 字符的标签（24px 下约 62px 宽）会有一半跑到图区外面——它不会出卡片，但会**压到
 * 纵轴那几个数上**。左对齐就没这个问题（文字往右长）。
 */
function horizontalAnchor(at: number): CharacterParameter["anchor2"] {
  if (at <= 0.045) return "start";
  if (at >= 0.955) return "end";
  return "middle";
}

/**
 * 纵轴那条**标尺**。
 *
 * 用户 2026-09-27：「打字数量应该是整数…你可以大概参考一下温度计、弹簧测力计
 * 这样的测量仪器的标尺」。这句话是两个要求：
 *
 * 1. **整数**——档上的数必须是人读得出来的整数。在这之前是三档"极大 / 中 / 极小"
 *    直接过 `格式化数`，于是范围 57~112 时中间那档会原样写上 **84.5**；
 * 2. **标尺**——仪器上不是几个孤零零的数字，数字之间还有一排**没字的短线**，
 *    而且**量程要把被测的东西整个罩住**：温度计的水银柱不会伸到刻度外面去。
 *
 * 所以这里做三件事：取一个"人会写在纸上"的**整数步长**（`1/2/5/10/…`）、把
 * 量程**撑到步长的整数倍**、再在相邻两档之间细分出没字的短线。
 *
 * ⚠️⚠️ **撑量程之后，曲线必须按撑过的上下界归一化**（`曲线段` 用的是返回的
 * `上`/`下`，不是数据的极值）——否则刻度按 0~200 画、曲线按 0~195 画，**最高的
 * 那条线就不在它标的高度上**。这正是 `tests/share-card.test.ts` 文件头第 1 条
 * 挡的那种错：图还是那张图，读出来的数不对，而没人会去怀疑刻度。
 *
 * ⚠️ 撑上去会让曲线**够不到顶**（最多约三成）。选步长时因此加了一条"离峰顶不许
 * 超过三成"的约束，而纵轴本身是压过的（`pow(比, 0.42)`），三成的高度差落到画面上
 * 只有约 9%——比"峰值伸到刻度外面"划算得多。
 *
 * ⚠️ 步长**从候选里挑**而不是 `跨 ÷ 目标` 算出来：算出来会是 24 这种数，档位
 * 就成了 0、24、48——那串数字在仪器上不会出现。
 */
const verticalStepLengthCandidate = [1, 2, 5, 10, 20, 25, 40, 50, 100, 200, 250, 500, 1000, 2000];
/** 纵轴最多几档有字的。再多就是一排竖着的数字了。 */
const verticalMainLevelLimit = 6;
/** 相邻两档之间分几小格（仪器上那种没字的短线）。 */
const verticalThinShare = 5;
/** 量程最多撑到峰顶之上这么多。再多就是"曲线缩在图上头半截"。 */
const verticalSupportLimit = 0.3;

/** 一条纵轴：标尺本身 ＋ 画曲线要用的上下界。 */
interface VerticalAxis {
  main: { y: number; text4: string }[];
  /** 没字那几档的位置（仪器上的小格）。 */
  count2: number[];
  /** 量程上界（≥ 数据最大值）。曲线按它归一化。 */
  above: number;
  /** 量程下界（≤ 数据最小值）。 */
  below: number;
}

/** 步长的整数倍里，第一个 ≥ `大` 的那个（`上界`）。 */
const aboveBoundary = (large: number, step: number) => Math.ceil(large / step - 1e-9) * step;
const belowBoundary = (small: number, step: number) => Math.floor(small / step + 1e-9) * step;

function verticalTickRuler(large: number, small: number): VerticalAxis {
  // 一段一直平着（极值相等）时只给一档、摆在中间：给两档相同的数会让人以为
  // 上下差着点什么（与 `chart-ticks.ts::推纵刻度` 同一条规矩）。
  if (!(large > small)) {
    return { main: [{ y: verticalPosition(large, large, small), text4: String(Math.round(large)) }], count2: [], above: large, below: small };
  }

  /** 按这个步长，量程撑开之后一共几档。 */
  const levelNumber = (step: number) => Math.round((aboveBoundary(large, step) - belowBoundary(small, step)) / step) + 1;

  // 挑**最小的那个够用的步长**（= 档最密），但要"撑得不过分"。
  //
  // ⚠️ 撑多少**不随步长单调变**：`上界` 是"往步长的整数倍上取整"，`大 = 195` 时
  // 步长 40/50/100/200 都撑到 200（2.6%），而步长 250 撑到 250（28%）、500 撑到
  // 500（156%）。所以撑过头的那一档要 `continue` 跳过、**不能 `break`**——
  // 后面还可能有一个刚好合适的。
  let step = 0;
  let support = false;
  for (const s of verticalStepLengthCandidate) {
    if (levelNumber(s) > verticalMainLevelLimit) continue;
    if (aboveBoundary(large, s) / large - 1 > verticalSupportLimit) continue;
    step = s;
    support = true;
    break;
  }
  // 一个都撑不了（峰顶跟哪个整数倍都差着三成以上）→ 退一步：**不撑**，只要档够密。
  if (!step) step = verticalStepLengthCandidate.find((s) => large / s < verticalMainLevelLimit) ?? 1;

  const above = support ? Math.max(large, aboveBoundary(large, step)) : large;
  const below = support ? Math.min(small, belowBoundary(small, step)) : small;

  const main: { y: number; text4: string }[] = [];
  // ⚠️ 起点算 `ceil(小 ÷ 步 − 1e-9)` 而**不是** `ceil(小 ÷ 步)`：浮点的 `小 ÷ 步`
  // 在正好整除时可能算出 `2.0000000000000004`，于是**恰好落在极值上的那一档被
  // 自己跳过去**，标尺最下面凭空空出一格。
  for (let k = Math.ceil(below / step - 1e-9); k * step <= above + 1e-9; k++) {
    const v = k * step;
    main.push({ y: verticalPosition(v, above, below), text4: String(Math.round(v)) });
  }

  // 一条线都取不到（步长比量程还大）：退回原来那三档并**收成整数**。总比整张图
  // 一条刻度线都没有强——那样看着像图画坏了。
  if (main.length === 0) {
    const three = [large, (large + small) / 2, small];
    return {
      main: three.map((v) => ({ y: verticalPosition(v, large, small), text4: String(Math.round(v)) })),
      count2: [],
      above: large,
      below: small,
    };
  }

  // 细分：步长太小（`< 纵细分`）时**不细分**——0.2 一格对"字/分钟"这种整数
  // 物理量没有意义，画出来只是一排糊在一起的短线。
  const count2: number[] = [];
  if (step >= verticalThinShare) {
    const smallStep = step / verticalThinShare;
    for (let k = Math.ceil(below / smallStep - 1e-9); k * smallStep <= above + 1e-9; k++) {
      const v = k * smallStep;
      // 主档上已经有线了就不再来一条：同位置叠两条线只是白费字节。
      if (Math.abs(v / step - Math.round(v / step)) < 1e-9) continue;
      count2.push(verticalPosition(v, above, below));
    }
  }
  return { main, count2, above, below };
}

/**
 * 曲线那一段。点太少（0 / 1 个）时只画一个点，不画线——
 * 一个点的"线"是一条横贯卡片的直线，看着像"速度恒定"。
 *
 * ⚠️ 平滑用设计稿那套"相邻点取中点做二次贝塞尔"：采样点之间本来是折线，
 * 折线在 200 点的图上看不出差别，在卡片这种大尺寸上能看出棱角。
 */
function curveLineParagraph(point: number[], color: cardColor, ticks: tick[], horizontalThinShare: number): string {
  if (point.length === 0) return "";
  const large = Math.max(...point);
  const small = Math.min(...point);
  const cross = point.length - 1;
  // 纵轴那条标尺（先画，被曲线压着）。
  //
  // ⚠️ **一个点都没有**时整段返回空（连两轴刻度一起不画）：只有刻度没有曲线，
  // 那几个时间和数摆在一片空白里看着像"图画坏了"。
  // ⚠️ 但**恰好一个点**时两轴照画：这时那颗点需要一个框（"开始那一刻是 20 字/分"
  // 是读得出来的），而"一直平着"那种横贯全图的假曲线才是要躲的
  // （对比 `PanelChartBlock`：少于两个点不画图，那边没有横轴刻度这回事）。
  const ruler = verticalTickRuler(large, small);
  // ⚠️⚠️ 曲线**按标尺的量程**归一化（`尺.上` / `尺.下`），**不是**按数据的极值：
  // 标尺会把量程撑到步长的整数倍上，两个上下界一旦不同，刻度线就不在它标的高度
  // 上——那正是本文件最该躲的那种错（见 `纵刻度尺` 那段）。
  const axisLarge = ruler.above;
  const axisSmall = ruler.below;
  const x = (i: number) => (cross > 0 ? imageLeft + (i * (imageRight - imageLeft)) / cross : (imageLeft + imageRight) / 2);
  const y = (v: number) => verticalPosition(v, axisLarge, axisSmall);

  const part: string[] = [];

  // 没字的短线（仪器上那一排小格）：**只贴在图区左边**，不横贯——横贯的那几条
  // 已经有主档了，再画满短线会把曲线切成一段段看不清。
  for (const y of ruler.count2) {
    part.push(
      `<line x1="${imageLeft}" y1="${y}" x2="${imageLeft + 12}" y2="${y}"` +
        ` stroke="${color.line2}" stroke-width="2"/>`,
    );
  }
  for (const k of ruler.main) {
    part.push(
      `<line x1="${imageLeft}" y1="${k.y}" x2="${imageRight}" y2="${k.y}"` +
        ` stroke="${color.line2}" stroke-width="2" stroke-dasharray="6 8"/>`,
      // 纵轴那几个数：右对齐贴在图区左边那条线上。
      character2(k.text4, imageLeft - 16, k.y + 7, { number: 24, color: color.faint, anchor2: "end" }),
    );
  }

  // 横轴刻度（插件给的）：位置是比例，文字是插件的话（`开始` / `22:04` / `现在`）。
  //
  // ⚠️ 两档主刻度之间的**没字短线**：用户要的"标尺"是两轴都要的，横轴这一半
  // 靠 `x_minor`（插件说"一格主刻度里再分几格"——一格是几分钟只有插件知道）。
  // 段内**均匀分**：卡片横轴是按"第几个点"等距画的，两档主刻度之间是线性的。
  // ⚠️ 只在两档之间分，**两头不补**：主刻度是插件摆的，往两头续就得假设
  // "主刻度是等距的"，而插件完全可以摆一组不等距的（"开始 / 峰值 / 结束"）。
  if (horizontalThinShare > 0) {
    for (let i = 0; i + 1 < ticks.length; i++) {
      const a = ticks[i];
      const b = ticks[i + 1];
      if (!a || !b) continue;
      const left = horizontalPosition(a.at);
      const right = horizontalPosition(b.at);
      for (let k = 1; k < horizontalThinShare; k++) {
        const px = left + ((right - left) * k) / horizontalThinShare;
        part.push(
          `<line x1="${px.toFixed(1)}" y1="${imageBelow}" x2="${px.toFixed(1)}" y2="${imageBelow + 10}"` +
            ` stroke="${color.line2}" stroke-width="2"/>`,
        );
      }
    }
  }
  for (const t of ticks) {
    // ⚠️ **大单位那一档画大一号**：用户原话「到小时就用稍微大一点的字体标出来是
    // 几小时」。字号是宿主定的（插件只说"这一档是大单位"，见 `chart-ticks.ts`
    // 的 `大单位` 那段）；颜色照旧用淡色——"稍微大一点"，不是"变成重点"。
    part.push(
      character2(t.label, horizontalPosition(t.at), imageBelow + 34, {
        number: t.largeSinglePosition ? 30 : 24,
        color: color.faint,
        anchor2: horizontalAnchor(t.at),
      }),
    );
  }

  if (point.length === 1) {
    part.push(`<circle cx="${x(0)}" cy="${y(point[0] ?? 0).toFixed(1)}" r="9" fill="${color.main}"/>`);
    return part.join("");
  }

  let d = `M ${x(0).toFixed(1)} ${y(point[0] ?? 0).toFixed(1)}`;
  for (let i = 0; i < cross; i++) {
    const x0 = x(i);
    const y0 = y(point[i] ?? 0);
    const x1 = x(i + 1);
    const y1 = y(point[i + 1] ?? 0);
    d += ` Q ${x0.toFixed(1)} ${y0.toFixed(1)} ${((x0 + x1) / 2).toFixed(1)} ${((y0 + y1) / 2).toFixed(1)}`;
  }
  const endx = x(cross).toFixed(1);
  const endy = y(point[cross] ?? 0).toFixed(1);
  d += ` Q ${endx} ${endy} ${endx} ${endy}`;

  part.push(
    `<path d="${d} L ${imageRight} ${imageBelow} L ${imageLeft} ${imageBelow} Z" fill="url(#卡面)"/>`,
    `<path d="${d}" fill="none" stroke="${color.main}" stroke-width="6"` +
      ` stroke-linejoin="round" stroke-linecap="round"/>`,
  );
  return part.join("");
}

// ── 热力图那一段（长期那本账）─────────────────────────────────────────────
//
// 2026-09-27 加：用户要「分享图包含热力图和写作图」。**共用同一张卡的其余部分**
// （标题 / 大数字 / 三格指标 / 页脚），只在图区那一块换画法——它们是同一件事的
// 两个尺度："这次写了多快"和"这半年写得勤不勤"。
//
// ⚠️ 与 `曲线段` 一样，这里**只画**："哪一格是哪一天、什么深浅"在 `ui/heatmap.ts`
// 里算好了（那份是纯函数，单独测）。这里只把格子摆进图区。

/** 热力图占的版面：顶上让出月份那行、底下让出深浅标尺那排。 */
const hotLeft = imageLeft;
const hotRight = imageRight;
const hotAbove = imageAbove + 32;
const hotBelow = imageBelow - 44;

/**
 * 深的那四档：**用强调色的透明度分**，不写死四个颜色。
 *
 * ⚠️ 卡片的主色是跟随用户主题色的（`当前卡色`），写死四个蓝只在默认主题下对。
 * ⚠️ `0` 是"没写"那一档，它不用主色——用**线色**：一层淡淡的底灰，与"写了
 * 一点点"（0.20）一眼能分开，这才是这张图要读的东西。
 */
const levelTransparentClear = [0, 0.2, 0.42, 0.66, 0.92];

/**
 * 图区里那一块小方格。
 *
 * `少` / `多` 是右下角那排标尺两头的字（插件给的、会翻译）；空串那一边不画。
 *
 * ⚠️ 格子边长是**反着推**的：宽度和高度都是限制，取更紧的那个（列数多了由宽度
 * 说了算，列数少了由高度说了算），然后**两个方向都居中**——不然列数一变，整块
 * 图就在图区里跳来跳去。
 * ⚠️ 一个月只标一次（`月` 是空串就是"不标"），靠右那几个标签放不下就**不标**：
 * 宁可少一个月份，也不要它压出卡片右页边。
 */
function hotForceParagraph(
  image: HotForceImage,
  color: cardColor,
  less: string,
  many: string,
  measureWidth: MeasureWidthDevice,
): string {
  const columns = image.column;
  if (columns.length === 0) return "";

  const width = hotRight - hotLeft;
  const height = hotBelow - hotAbove;
  const seam = columns.length > 30 ? 4 : 6;
  const edge = Math.min(
    (width - (columns.length - 1) * seam) / columns.length,
    (height - 6 * seam) / 7,
  );
  const left0 = hotLeft + (width - (columns.length * edge + (columns.length - 1) * seam)) / 2;
  const above0 = hotAbove + (height - (7 * edge + 6 * seam)) / 2;
  const circleCorner = Math.max(2, Math.min(6, edge * 0.28)).toFixed(1);

  const part: string[] = [];

  // 月份那行（在图区顶上）。
  //
  // ⚠️⚠️ **两个标签不许叠在一起**，而它们**真的会叠**：一列只有 `边 + 缝`（30 来个
  // 像素）宽，而「3月」两个字是 48 像素。窗口的第一列落在上个月的月末时尤甚——
  // 那一列标「3月」、紧挨着的下一列标「4月」，两个标签就挤在同一处（第一版出的
  // 宣传图上印着 `MaApr`，就是这么来的）。所以分成两步：先把摆得下的挑出来，
  // 再**从右往左**定谁留下。
  const candidate: { x: number; width: number; month: string }[] = [];
  for (let c = 0; c < columns.length; c++) {
    const oneColumn = columns[c];
    if (!oneColumn) continue;
    const month = oneColumn.month;
    if (!month) continue;
    const x = left0 + c * (edge + seam);
    const width = measureWidth(month, 24, 400);
    if (x > hotRight - width) continue; // 右端戳出图区就整个不画
    candidate.push({ x, width, month });
  }
  // 从右往左定：挤不下就丢**左边**那个。理由是月份标签标在它那一段格子的**左端**，
  // 丢掉右边那个的话，它左边那一整月就没标签了；丢掉左边这个（多半只是上个月的
  // 一两天）损失最小。
  const keepBelow: typeof candidate = [];
  let rightBelow = Infinity;
  for (let i = candidate.length - 1; i >= 0; i--) {
    const item5 = candidate[i];
    if (!item5) continue;
    if (item5.x + item5.width > rightBelow - 8) continue;
    keepBelow.push(item5);
    rightBelow = item5.x;
  }
  for (const item5 of keepBelow.reverse()) {
    part.push(character2(item5.month, item5.x, hotAbove - 12, { number: 24, color: color.faint }));
  }

  // 格子。⚠️ 最后一列常常不满 7 格（今天才周三就是 3 格）——那不是"没数据"，
  // 是**还没到**，所以下面那几行**不画**（`heatmap.ts` 那边就没生成）。
  for (let c = 0; c < columns.length; c++) {
    const oneColumn = columns[c];
    if (!oneColumn) continue;
    for (let r = 0; r < oneColumn.cell2.length; r++) {
      const level = oneColumn.cell2[r]?.level ?? 0;
      const x = (left0 + c * (edge + seam)).toFixed(1);
      const y = (above0 + r * (edge + seam)).toFixed(1);
      // ⚠️ `class` 是**给测试认的**（卡片里没有任何样式表，它不会影响好看不好看）：
      // 这串 SVG 里还有两个 Nota 标识，它们自己也画方块，光数 `<rect>` 数不清。
      const square = `<rect class="heat-cell" x="${x}" y="${y}" width="${edge.toFixed(1)}"` +
        ` height="${edge.toFixed(1)}" rx="${circleCorner}"`;
      part.push(
        level === 0
          ? `${square} fill="${color.line2}"/>`
          : `${square} fill="${color.main}" fill-opacity="${levelTransparentClear[level]}"/>`,
      );
    }
  }

  // 右下角那排标尺：少 ▢▢▢▢▢ 多。
  const mark2 = 22;
  const markSeam = 6;
  const number = 24;
  const keepWhite = 14;
  const lessWidth = less ? measureWidth(less, number, 400) : 0;
  const manyWidth = many ? measureWidth(many, number, 400) : 0;
  let x = hotRight - (lessWidth + (less ? keepWhite : 0) + 5 * mark2 + 4 * markSeam + (many ? keepWhite : 0) + manyWidth);
  const y = imageBelow - mark2 - 2;
  if (less) {
    part.push(character2(less, x, y + mark2 - 4, { number, color: color.faint }));
    x += lessWidth + keepWhite;
  }
  for (let i = 0; i <= 4; i++) {
    part.push(
      i === 0
        ? `<rect class="heat-legend" x="${x.toFixed(1)}" y="${y}" width="${mark2}" height="${mark2}" rx="5" fill="${color.line2}"/>`
        : `<rect class="heat-legend" x="${x.toFixed(1)}" y="${y}" width="${mark2}" height="${mark2}" rx="5" fill="${color.main}" fill-opacity="${levelTransparentClear[i]}"/>`,
    );
    x += mark2 + markSeam;
  }
  if (many) part.push(character2(many, x - markSeam + keepWhite, y + mark2 - 4, { number, color: color.faint }));

  return part.join("");
}

/**
 * 整张卡片的 SVG 文本。
 *
 * 中间那块图有两种形态（`卡.shape`）：`"curve"` 是**写作图**（速度曲线），
 * `"heat"` 是**热力图**（长期那本账）。其余部分两张卡共用。
 *
 * @param 量 量字宽用的（大数字后面那颗单位要紧挨着它）。测试传一个固定的，
 *   线上不传（用 canvas 真量）。
 */
export function shareCardSvg(card: PanelShare, color: cardColor, measure?: MeasureWidthDevice): string {
  const point = card.points;
  const measureWidth = measure ?? defaultMeasureWidth();

  const part: string[] = [];

  // 底：一条 160° 的渐变（设计稿是 `linear-gradient(160deg,…)`，≈ 从左上下到右下）。
  part.push(
    `<defs><linearGradient id="卡底" x1="0" y1="0" x2="0.36" y2="1">` +
      `<stop offset="0" stop-color="${color.bottom1}"/><stop offset="1" stop-color="${color.bottom2}"/>` +
      `</linearGradient>` +
      `<linearGradient id="卡面" x1="0" y1="0" x2="0" y2="1">` +
      `<stop offset="0" stop-color="${color.main}" stop-opacity="0.30"/>` +
      `<stop offset="1" stop-color="${color.main}" stop-opacity="0"/>` +
      `</linearGradient></defs>`,
    `<rect width="${cardWidth}" height="${cardHeight}" fill="url(#卡底)"/>`,
  );

  // 顶行：图标 ＋ 产品名 ＋ 右边那个日期时间。
  const topLineMiddle = 76 + 58 / 2;
  part.push(
    markRecognize(pageEdge, 76, 58, "顶"),
    character2("Nota", pageEdge + 58 + 18, topLineMiddle + 12, { number: 34, coarse: 700, color: color.character2 }),
    character2(card.date, cardWidth - pageEdge, topLineMiddle + 9, { number: 24, color: color.faint, anchor2: "end" }),
    // 标题与副标题
    character2(card.title, pageEdge, 250, { number: 52, coarse: 700, color: color.character2, distance: 2 }),
    // ⚠️ **转大写是在这里做的**，不是让插件送大写：设计稿那句副标题在 CSS 里是
    // `text-transform:uppercase`（`分享图-深色.html` 第 30 行），而 SVG 的
    // `<text>` 不吃 `text-transform`（SVG 1.1 没这个属性），照原样送就少了那一档。
    // 插件继续送人能读的 `Writing Stats`——将来真翻译成中文时，转大写是个空操作。
    character2(card.subtitle.toUpperCase(), pageEdge, 301, { number: 24, color: color.faint, distance: 3 }),
  );

  // 大数字 ＋ 单位（单位紧跟在大数字右边、基线抬高 22px——设计稿那套 `align-items:flex-end`）。
  const largeNumber = 210;
  const numberWidth = measureWidth(card.value || "—", largeNumber, 800);
  part.push(
    character2(card.value || "—", pageEdge, 500, { number: largeNumber, coarse: 800, color: color.main }),
    character2(card.unit, pageEdge + numberWidth + 20, 478, { number: 40, coarse: 600, color: color.faint }),
  );

  // 图区那一整段（含两轴刻度 / 月份那行）。**两种形态只在这里分岔**——
  // 上面的大数字、下面的三格指标与页脚两张卡一模一样。
  if (card.shape === "heat" && card.heat) {
    part.push(hotForceParagraph(card.heat, color, card.less, card.more, measureWidth));
  } else {
    part.push(curveLineParagraph(point, color, card.xTicks, card.xMinor));
  }

  // 三格指标。
  const cellCount = Math.max(1, Math.min(3, card.stats.length));
  const cellWidth = (imageRight - pageEdge - (cellCount - 1) * 20) / cellCount;
  for (let i = 0; i < cellCount; i++) {
    const item5 = card.stats[i];
    if (!item5) continue;
    const left = pageEdge + i * (cellWidth + 20);
    const above = 935;
    part.push(
      `<rect x="${left.toFixed(1)}" y="${above}" width="${cellWidth.toFixed(1)}" height="150" rx="22"` +
        ` fill="${color.block}" fill-opacity="${color.blockTransparent}" stroke="${color.line2}" stroke-width="2"/>`,
      character2(item5.k, left + 30, above + 50, { number: 23, color: color.faint, distance: 1 }),
      character2(item5.v, left + 30, above + 112, { number: 52, coarse: 700, color: color.character2 }),
      character2(item5.small, left + 30 + measureWidth(item5.v, 52, 700) + 6, above + 112, { number: 24, color: color.faint }),
    );
  }

  // 页脚：左边那句话（插件给的、会翻译），右边品牌「图标 ＋ Nota」。
  //
  // ⚠️⚠️ **这一组是右对齐的，所以字必须写 `锚: "end"`**。2026-09-27 用户报
  // 「右下角图标和 nota 字差的有点远」——那之前字是**默认左对齐**画在
  // `卡宽 - 页边` 上的：它从右页边往**右**长，于是
  //   · 图标被推到"页边 − 字宽 − 12"之外的更左边（多让出了一整个字宽），
  //   · 而字本身越过了右页边（与顶行那个日期不再对齐，卡边窄一点就被切掉）。
  // `品牌宽` 那个算式本来是对的，只是从来没被用对——图标的位置要**减去**它。
  const productCard = "Nota";
  const productCardWidth = measureWidth(productCard, 26, 600);
  const markerWidth = 30;
  part.push(
    `<line x1="${pageEdge}" y1="${pageFootLine}" x2="${cardWidth - pageEdge}" y2="${pageFootLine}" stroke="${color.line2}" stroke-width="2"/>`,
    character2(card.foot, pageEdge, 1280, { number: 25, color: color.faint }),
    markRecognize(cardWidth - pageEdge - productCardWidth - 12 - markerWidth, 1256, markerWidth, "脚"),
    character2(productCard, cardWidth - pageEdge, 1280, { number: 26, coarse: 600, color: color.character2, anchor2: "end" }),
  );

  return (
    `<svg xmlns="http://www.w3.org/2000/svg" width="${cardWidth}" height="${cardHeight}"` +
    ` viewBox="0 0 ${cardWidth} ${cardHeight}">${part.join("")}</svg>`
  );
}

// ── SVG → PNG ────────────────────────────────────────────────────────────

/**
 * 把这串 SVG 画成一张 PNG。
 *
 * ⚠️ **必须有 `width`/`height`**（`分享图SVG` 里那两个属性）：只有 `viewBox`
 * 的 SVG 当图片用**没有固有尺寸**，WebKit 会按 300×150 那种默认值光栅化——
 * 表现是"存出来的图糊得离谱"，而不是报错。
 *
 * ⚠️ 用 `img.decode()` 等**解码完**再画：`onload` 早于解码完成的实现（老
 * WebKit）会让 `drawImage` 画出空白图。
 */
export async function lightGridConvert(card: PanelShare, color: cardColor): Promise<Blob> {
  const svg = shareCardSvg(card, color);
  const address = URL.createObjectURL(new Blob([svg], { type: "image/svg+xml;charset=utf-8" }));
  try {
    const image = new Image();
    image.width = cardWidth;
    image.height = cardHeight;
    image.src = address;
    await image.decode();

    const distribute = document.createElement("canvas");
    distribute.width = cardWidth;
    distribute.height = cardHeight;
    const ctx = distribute.getContext("2d");
    if (!ctx) throw new Error("拿不到 2d 画布");
    ctx.drawImage(image, 0, 0, cardWidth, cardHeight);

    const block = await new Promise<Blob | null>((good) => distribute.toBlob(good, "image/png"));
    if (!block) throw new Error("toBlob 没给出图片");
    return block;
  } finally {
    // ⚠️ 用完就放：一张 1080×1350 的 SVG 对象 URL 留着只是占内存。
    URL.revokeObjectURL(address);
  }
}

/**
 * 二进制变成 base64（IPC 只能传字符串）。
 *
 * ⚠️ 分块拼 `String.fromCharCode`：一次传整个数组给 `apply` 会顶到引擎的
 * 参数个数上限，而那个失败**取决于图多大**——偶尔能过、偶尔抛，最难查。
 */
export async function toBase64(block: Blob): Promise<string> {
  const byte = new Uint8Array(await block.arrayBuffer());
  const slice: string[] = [];
  const eachSlice = 0x8000;
  for (let i = 0; i < byte.length; i += eachSlice) {
    slice.push(String.fromCharCode(...byte.subarray(i, i + eachSlice)));
  }
  return btoa(slice.join(""));
}

/**
 * 建议的文件名消毒。
 *
 * ⚠️ 名字是**插件给的**（`nota-stats-day-2026-09-27.png`），所以不能信：它会被
 * 当作"另存为"对话框的默认名，而那里出现 `../` 或 `:` 是能真的写到别处去的。
 * 只留文件名那一段，再砍掉路径分隔符与那几个在 Windows 上是保留字符的符号。
 */
export function SafeFileName(name3: string): string {
  const doClean = (name3 || "")
    // ⚠️ 先**只留最后一段**，再把剩下的符号换掉。顺序不能反：反了的话
    // `../../x.png` 会先变成 `..-..-x.png` ——安全是安全（没有分隔符了），
    // 但名字里那串莫名其妙的东西用户看不懂，而这里本来就知道该留哪一段。
    .split(/[\\/]/)
    .pop()!
    .replace(/[\\/]/g, "-")
    .replace(/[:*?"<>|]/g, "-")
    // 控制字符（含 `\n`）：文件名里出现它们，症状是对话框里那一行看着是断的。
    .replace(/[\u0000-\u001f\u007f]/g, "")
    // 开头的点：`.` 与 `..` 是目录，不是文件；`.png` 那种则是**看不见的文件**。
    .replace(/^\.+/, "")
    .trim();

  // ⚠️ 先把后缀摘掉再判空，最后**一定**把 `.png` 加回去。这一段有两个坑：
  //   · 忘了判空 → `""` 与 `"..."` 拼出 `.png`——一个点号开头的**隐藏文件**，
  //     用户按下"保存"之后在文件夹里找不到它；
  //   · 先拼后缀再截长度 → 截到 120 时可能**把 `.png` 截掉**，存出来的文件
  //     没有后缀，双击它没有任何程序认领。
  // 所以：判空看的是**基名**，截长度截的也是**基名**（115 + 4 ≤ 120）。
  const base = doClean.replace(/\.png$/i, "");
  if (!base) return "nota-stats.png";
  return `${base.slice(0, 115)}.png`;
}
