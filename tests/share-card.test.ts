/**
 * `src/ui/share-card.ts`（写作统计的分享卡）的**可运行**测试集。
 *
 * # 跑法（⚠️ 比别的前端测试**多两个开关**）
 *
 * ```sh
 * cd <仓库>
 * npx esbuild tests/share-card.test.ts --bundle --platform=node --format=esm \
 *   --loader:.svg=text --alias:@=./src \
 *   --outfile=/tmp/nota-share-card/share-card.test.mjs
 * node /tmp/nota-share-card/share-card.test.mjs
 * ```
 *
 * ⚠️ **`--loader:.svg=text`**：卡片头上那块标识是 `import … from
 * "../../src-tauri/icons/nota.svg?raw"`（`ui/nota-mark.ts`，Vite 的写法）。esbuild
 * 认这个查询串、但默认把 `.svg` 当**文件**处理不了，于是要告诉它"当文本读"。
 * ⚠️ **`--alias:@=./src`**：`share-card.ts` 内部用的是 `@/ui/…` 这种路径（Vite 的
 * 另一个别名）。**这两个开关只有这一份测试要加**，别的几份仍然两条命令就跑得起来
 * （它们都是相对路径 import）。
 *
 * # 挡的是什么
 *
 * 这张图是**给人看的、也是给人转的**（存盘 / 发出去），所以错的种类比别的模块多：
 *
 * 1. **刻度上的数是错的**——标着 30 的那条横线不在 30 应该在的高度上。图还是那张
 *    图，只是读出来的数不对，而没有人会去怀疑刻度（`chart-ticks.test.ts` 挡的是
 *    面板那一半，这一份挡卡片那一半）。
 * 2. **两个图标的 id 撞车**——同一张图上放了两个 Nota 标识，SVG 里同名的 `id`
 *    只认第一个。两个图标恰好长得一样，所以**表现上看不出来**，但这靠的是运气。
 * 3. **有东西是外链的**（图标、字体文件）——那会把 canvas 弄脏，`toBlob` 直接抛：
 *    症状是"卡片画得出来、存不下去"。所以有一条用例**逐个核对 `url(#…)` 都有定义**。
 * 4. **存出来的文件名不对**：隐藏文件（`.png`）、没有后缀、带着 `../`。名字是
 *    插件给的，不能信。
 *
 * ⚠️ 这一份**不画图**（node 里没有 canvas / Image），所以它证明的只有"那串 SVG
 * 文本对不对"。**真光栅化出来好不好看、字体落没落上、PNG 有多糊，一律算未验**。
 */

import {
  shareCardSvg,
  SafeFileName,
  toBase64,
  cardWidth,
  cardHeight,
  darkCard,
  lightCard,
} from "../src/ui/share-card";
import type { PanelShare } from "../src/ui/panel-nodes";
import { computeHeatmap } from "../src/ui/heatmap";
import { setLanguage } from "../src/i18n";

/* ── 极小的测试工装（与前几份同一套，只多一个 `测异步`）───────────────── */

let pass = 0;
let fail = 0;
const failed: string[] = [];

async function testCase(name: string, body3: () => void | Promise<void>): Promise<void> {
  try {
    await body3();
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

/** `子` 在 `串` 里出现几次（用来数"画了几格 / 几档"）。 */
function count(stringValue: string, child3: string): number {
  return stringValue.split(child3).length - 1;
}

/** 正则里要用的字面量。 */
function reference(text4: string): string {
  return text4.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

interface OnePlaceCharacter {
  x: number;
  y: number;
  number: number;
  color: string;
  anchor2: string;
}

/**
 * 找出`内容`那几个字画在哪（卡片里的字全是 `<text>`）。
 *
 * ⚠️ 返回**列表**：同一句话可能出现不止一次（"Nota" 顶上一个、页脚一个），
 * 而"出现两次"本身就是要断言的东西之一。
 */
function findCharacter(svg: string, content: string): OnePlaceCharacter[] {
  const re = new RegExp(
    `<text x="([-\\d.]+)" y="([-\\d.]+)"[^>]*?font-size="([\\d.]+)" font-weight="[\\d.]+"` +
      ` fill="([^"]+)"( text-anchor="([^"]+)")?[^>]*>${reference(content)}</text>`,
    "g",
  );
  const output2: OnePlaceCharacter[] = [];
  for (const m of svg.matchAll(re)) {
    output2.push({ x: +m[1], y: +m[2], number: +m[3], color: m[4], anchor2: m[6] ?? "start" });
  }
  return output2;
}

/** 必须恰好找到一处，省得每处都写一遍 `[0]!`。 */
function onePlace(svg: string, content: string): OnePlaceCharacter {
  const plural = findCharacter(svg, content);
  if (plural.length !== 1) throw new Error(`「${content}」应该刚好画一处，实际 ${plural.length} 处`);
  return plural[0]!;
}

/**
 * 曲线上每个采样点的**纵坐标**。
 *
 * ⚠️ 从描线那条 `path` 的 `Q` 段里取**控制点**：那条曲线是"相邻两点取中点做二次
 * 贝塞尔"（`曲线段`），每一段 `Q cx cy mx my` 里的 `cx/cy` 正好就是**第 i 个
 * 采样点**自己，`mx/my` 是中点。最后那段收口把控制点与终点写成同一个数，所以
 * 取出来的个数和点数一样，顺序也一样。
 */
function curveLineVertical(svg: string): number[] {
  const line2 = svg.match(/<path d="([^"]+)" fill="none"/)?.[1];
  if (!line2) throw new Error("没找到描线那条 path");
  return [...line2.matchAll(/Q [\d.-]+ ([\d.-]+) /g)].map((m) => +m[1]!);
}

/**
 * 量字宽的替身。
 *
 * ⚠️ 测试里**必须**传一个：线上那个用 canvas 真量（node 里没有 canvas），不传就
 * 走 `估宽`。用一个写死的比例，量出来的位置才是可复现的——它只影响"大数字和单位
 * 之间隔多远"，不影响任何一条要断言的坐标。
 */
const measureWidth = (text4: string, number: number, coarse: number) => text4.length * number * 0.6 * (coarse >= 700 ? 1.02 : 1);

/* ── 夹具（三本账各一张，字段是插件真给的那几个）──────────────────────── */

/** 「本轮」那张：插件给的三档是**开始 / N 分 / 结束**。 */
function roundCard(): PanelShare {
  return {
    title: "写作统计",
    subtitle: "Writing Stats",
    date: "2026年9月27日 22:07",
    label: "本轮平均速度",
    value: "13",
    unit: "字 / 分钟",
    // 这两张是**写作图**（速度曲线）：`curve` ＋ 没有格子 ＋ 不画深浅标尺。
    shape: "curve",
    heat: null,
    less: "",
    more: "",
    // 真形状：前两分钟在写（20）、中间停笔（0）、最后又起来。
    points: [20, 20, 0, 0, 0, 0, 0, 20],
    xTicks: [
      { at: 0, label: "开始" },
      { at: 0.571, label: "4 分" },
      { at: 1, label: "结束" },
    ],
    // 一格主刻度里再分四格（`x_minor`）。⚠️ 宿主**只管均分**：这一格是几分钟
    // 只有插件知道，所以"一格 = 一分钟"是插件摆出来的效果，不是宿主算的。
    xMinor: 4,
    stats: [
      { k: "本轮字数", v: "100", small: "字" },
      { k: "净打字时间", v: "7", small: "分 30 秒" },
      { k: "峰值速度", v: "18", small: "字/分" },
    ],
    foot: "这一轮，你写下了 100 个字",
    file: "nota-stats-round-20260927-2207.png",
  };
}

/** 「全日」那张：三档是**时刻**，曲线是 0–30 的起伏。 */
function allDateCard(): PanelShare {
  return {
    title: "写作统计",
    subtitle: "Writing Stats · 全天",
    date: "2026年9月27日 22:07",
    label: "今日平均速度",
    value: "13",
    unit: "字 / 分钟",
    shape: "curve",
    heat: null,
    less: "",
    more: "",
    points: [12, 18, 25, 30, 22, 15],
    xTicks: [
      { at: 0, label: "22:00" },
      { at: 0.571, label: "22:04" },
      { at: 1, label: "22:07" },
    ],
    // ⚠️ 这一份**不摆**横轴小格：纵轴那几条用例全都用它，横轴各自多画几条线只会
    // 让"虚线横线数了几条"这种断言跟着横轴一起动（两轴各管各的）。
    xMinor: 0,
    stats: [
      { k: "今日字数", v: "1284", small: "字" },
      { k: "净打字时间", v: "96", small: "分" },
      { k: "峰值速度", v: "41", small: "字/分" },
    ],
    foot: "今天，你写下了 1284 个字",
    file: "nota-stats-day-2026-09-27.png",
  };
}

/** 「长期」那张：**热力图**（`shape = "heat"`），格子由 `算热力` 现铺。 */
function hotForceCard(): PanelShare {
  return {
    title: "写作统计",
    subtitle: "Writing Stats",
    date: "2026年9月27日 22:07",
    label: "近半年总字数",
    value: "128,400",
    unit: "字",
    // ⚠️ 热力图这张**没有曲线**：`points` / 两轴刻度都是空的，画的是格子。
    shape: "heat",
    // 8 列 × 7 行（09-27 是周日，最后一列是满的），里头两天有字。
    heat: computeHeatmap(
      [
        { date: "2026-09-27", value2: 100 },
        { date: "2026-09-26", value2: 50 },
      ],
      "2026-09-27",
      8,
    ),
    less: "少",
    more: "多",
    points: [],
    xTicks: [],
    xMinor: 0,
    stats: [
      { k: "有字的天数", v: "173", small: "天" },
      { k: "日均", v: "742", small: "字/天" },
      { k: "单日最多", v: "3,820", small: "字" },
    ],
    foot: "近半年，你在 173 天里写下了 128,400 个字",
    file: "nota-stats-long-2026-09-27.png",
  };
}

/* ── 用例 ─────────────────────────────────────────────────────────────── */

async function main() {
  group("卡片的骨架");

  await testCase("尺寸、根元素、结尾都照设计稿", () => {
    const svg = shareCardSvg(roundCard(), darkCard, measureWidth);
    assertion(
      svg.startsWith(
        `<svg xmlns="http://www.w3.org/2000/svg" width="1080" height="1350" viewBox="0 0 1080 1350">`,
      ),
      `根元素不对：${svg.slice(0, 120)}`,
    );
    assertion(svg.endsWith("</svg>"), "没有收尾");
    // ⚠️ `width` / `height` 这两个属性是**光栅化的前提**：只有 viewBox 的 SVG
    // 当图片用没有固有尺寸，WebKit 会按 300×150 那种默认值画——表现是"存出来的
    // 图糊得离谱"，而不是报错。
    assertion(svg.includes(`width="${cardWidth}"`) && svg.includes(`height="${cardHeight}"`), "缺固有尺寸");
  });

  await testCase("文案该在的都在（标题 / 副标题 / 日期 / 大数字 / 单位 / 页脚）", () => {
    const svg = shareCardSvg(roundCard(), darkCard, measureWidth);
    for (const text4 of ["写作统计", "WRITING STATS", "2026年9月27日 22:07", "字 / 分钟"]) {
      onePlace(svg, text4);
    }
    const large = onePlace(svg, "13");
    equal(large.number, 210, "大数字的字号（设计稿 210）");
    equal(large.color, darkCard.main, "大数字用强调色");
    onePlace(svg, "这一轮，你写下了 100 个字");
  });

  await testCase("产品名顶部一处、页脚一处（一共两处）", () => {
    const svg = shareCardSvg(roundCard(), darkCard, measureWidth);
    equal(findCharacter(svg, "Nota").length, 2, "两处 Nota");
    equal(count(svg, "<svg x="), 2, "两处标识");
  });

  await testCase("三格指标画三格，只有一格时不会补齐成三格", () => {
    const three = shareCardSvg(roundCard(), darkCard, measureWidth);
    equal(count(three, 'height="150"'), 3, "三格");
    for (const text4 of ["本轮字数", "净打字时间", "峰值速度"]) onePlace(three, text4);

    const value = shareCardSvg({ ...roundCard(), stats: [{ k: "本轮字数", v: "100", small: "字" }] }, darkCard, measureWidth);
    equal(count(value, 'height="150"'), 1, "一格");
    // ⚠️ 一格的宽度是"整幅"（设计稿是三格均分），不然右边会空着一大片。
    assertion(value.includes('width="920.0"'), `一格的宽度不对：${value.match(/<rect x="80\.0" y="935"[^>]*/)?.[0]}`);
  });

  group("转义");

  await testCase("插件给的文字里那几个符号一律转义（且 & 先换）", () => {
    const svg = shareCardSvg(
      { ...roundCard(), title: 'a<b>&"c', foot: "&lt;" },
      darkCard,
      measureWidth,
    );
    // ⚠️ `&` 必须**第一个**换：反过来的话 `&lt;` 会先变成 `<lt;`、再被 `<` 那一步
    // 换成 `&lt;lt;`——双重转义，屏幕上会多出字来。
    assertion(svg.includes("a&lt;b&gt;&amp;&quot;c"), "title 没转义全");
    assertion(svg.includes("&amp;lt;"), `& 不是先换的：${svg.slice(svg.indexOf("foot") - 200)}`);
    assertion(!svg.includes("a<b>"), "原样的尖括号进了 SVG");
  });

  group("纵轴刻度（仪器的标尺：整数步长、量程罩住数据、没字的小格）");

  await testCase("档上的数是**整数**、按固定步长排（不是极值直接过格式化）", () => {
    const svg = shareCardSvg(allDateCard(), darkCard, measureWidth);
    // 点 [12,18,25,30,22,15] → 步长 5、量程 10~30 → 10/15/20/25/30。
    for (const text4 of ["10", "15", "20", "25", "30"]) onePlace(svg, text4);
    // ⚠️ 曲线自己的那几个值**不上刻度**：在这之前是"极大 / 中 / 极小"直接过
    // `格式化数`，于是范围 57~112 时中间那档会原样写上 **84.5**。用户要的是
    // 「参考一下温度计、弹簧测力计这样的测量仪器的标尺」——仪器上是一排整数。
    for (const text4 of ["12", "18", "22"]) equal(findCharacter(svg, text4).length, 0, `数据值 ${text4} 混进刻度了`);
  });

  await testCase("量程撑到步长的整数倍上（最低那档比数据最小的还低）", () => {
    const svg = shareCardSvg(allDateCard(), darkCard, measureWidth);
    // 图区 551–871，上下各让 8px；标签的 y 是**基线**，所以再抬 7px。
    equal(onePlace(svg, "30").y, 566, "最高那档贴在图区上内边");
    equal(onePlace(svg, "10").y, 870, "最低那档贴在下内边");
    // ⚠️ 数据最小是 **12**，最低那档却是 **10**——这就是"量程要罩住被测的东西"：
    // 温度计的水银柱不会伸到刻度外面去，所以刻度得比水银柱还长一点。
    assertion(10 < 12, "用例本身写错了");
  });

  await testCase("⚠️ 曲线按**撑过的量程**归一化（不然刻度线不在它标的高度上）", () => {
    const svg = shareCardSvg(allDateCard(), darkCard, measureWidth);
    const verticals = curveLineVertical(svg);
    equal(verticals.length, 6, "六个采样点");
    // ⚠️ 刻度的**线**在 `纵位置(v)` 那个高度上，**字**比它低 7px（基线），所以
    // 拿曲线跟字比要减掉这 7px。
    // 峰（30 字/分）和标着「30」的那条线**是同一个高度**——这条是本组最要紧的：
    // 刻度按 30 画、曲线按 30 画，两处必须用**同一个**上下界。
    equal(Math.min(...verticals), onePlace(svg, "30").y - 7, "峰值与「30」那档对不上");
    // 谷（12 字/分）：按数据极值归一化会落在 863（贴着量程底），按撑过的量程
    // 归一化才落在 747.4（「10」那档之上）。差这 116px 就是"量程撑过没有"。
    equal(verticals[0], 747.4, "最低那个点没按撑过的量程摆");
    assertion(verticals[0]! < onePlace(svg, "10").y - 7, "曲线跑到量程外面去了");
  });

  await testCase("主刻度是一整条虚线、小格只贴左边一小段", () => {
    const svg = shareCardSvg(allDateCard(), darkCard, measureWidth);
    equal(count(svg, 'stroke-dasharray="6 8"'), 5, "五档主刻度线");
    // 没字的短线（仪器上那排小格）：步长 5、细分成 5 → 每两档之间 4 格，四段 16 格。
    // ⚠️ 小格**只从图左伸出 12px**、不横贯：横贯的那几条已经有主档了，再画满
    // 短线会把曲线切成一段段看不清。
    equal(count(svg, 'x2="152"'), 16, "十六格小格");
  });

  await testCase("刻度位置**不等距**（纵轴压过了 pow(比, 0.42)）", () => {
    const svg = shareCardSvg(allDateCard(), darkCard, measureWidth);
    const position3 = ["30", "25", "20", "15", "10"].map((t) => onePlace(svg, t).y);
    const difference = position3.slice(1).map((y, i) => +(y - position3[i]!).toFixed(1));
    // 等距的话相邻两档该差 76（(863−559)÷4）。实际上面密、下面疏。
    //
    // ⚠️ 这一条钉的是设计稿那条压缩：不压的话，一片 20–30 字/分钟的平台会贴着
    // 底压成一条直线，而那是这张图最常见的形状。压过之后刻度**位置**不等距，
    // 但每一档标的仍然是**真值**——跟对数轴是一回事，不是"随便摆五个数"。
    equal(difference.join(","), "34.6,42.2,57.4,169.8", "相邻两档的间距");
  });

  await testCase("所有的点都一样高时只画一档，不画五条重叠的线", () => {
    const flat = shareCardSvg({ ...allDateCard(), points: [20, 20, 20, 20] }, darkCard, measureWidth);
    equal(count(flat, 'stroke-dasharray="6 8"'), 1, "平的时候只有一档");
    // ⚠️ 大 === 小时 `纵位置` 的比取 0.5（摆中间），不是贴底：贴着底容易读成
    // "掉到零了"，而事实是"一直平着"。
    equal(onePlace(flat, "20").y, 642.8, "平的时候那档摆中间");
  });

  group("横轴刻度（插件给的：位置是比例、文字是插件的话）");

  await testCase("首档左对齐贴左边、末档右对齐贴右边，免得跑出卡片", () => {
    const svg = shareCardSvg(roundCard(), darkCard, measureWidth);
    const start3 = onePlace(svg, "开始");
    equal(start3.x, 140, "首档贴图区左边（让开纵轴那几个数）");
    equal(start3.anchor2, "start", "首档左对齐");
    const joinBundle = onePlace(svg, "结束");
    equal(joinBundle.x, 1000, "末档贴图区右边");
    equal(joinBundle.anchor2, "end", "末档右对齐");
    equal(onePlace(svg, "4 分").anchor2, "middle", "中间那档居中");
  });

  await testCase("两本账的横轴是两种话（轮：开始/N 分/结束；日：时刻）", () => {
    const wheel = shareCardSvg(roundCard(), darkCard, measureWidth);
    assertion(wheel.includes(">开始<") && wheel.includes(">4 分<") && wheel.includes(">结束<"), "本轮那三档");
    const date = shareCardSvg(allDateCard(), darkCard, measureWidth);
    assertion(date.includes(">22:00<") && date.includes(">22:04<") && date.includes(">22:07<"), "全日那三档");
    assertion(!date.includes(">开始<"), "全日那张不该出现「开始」");
  });

  await testCase("横轴贴着图区下边一行（y = 905），不压在曲线上", () => {
    const svg = shareCardSvg(roundCard(), darkCard, measureWidth);
    // 图区下边界 871 ＋ 34。
    equal(onePlace(svg, "开始").y, 905, "横轴那一行的位置");
  });

  await testCase("两档主刻度之间画小格（`x_minor`），主刻度两头不补", () => {
    const svg = shareCardSvg(roundCard(), darkCard, measureWidth);
    // 三档主刻度 → 两段，每段 `横细分 − 1` = 3 条（小格画在**段内**，两端是主刻度
    // 自己那两条竖线要占的位置）。
    const smallCell = [...svg.matchAll(/<line x1="([\d.]+)" y1="871"/g)].map((m) => +m[1]!);
    equal(smallCell.length, 6, "两段各三格");
    assertion(
      smallCell.every((x) => x > 140 && x < 1000),
      `小格跑到主刻度外面了：${smallCell}`,
    );
    // ⚠️ **两头不补**：主刻度是插件摆的（"开始 / 峰值 / 结束"完全可以不等距），
    // 往两端续就得先假设它等距——那是一条宿主没有的假设。
    equal(onePlace(svg, "开始").x, 140, "首档还在图区左边");
    equal(onePlace(svg, "结束").x, 1000, "末档还在图区右边");
  });

  await testCase("`x_minor` 没给或为 0 时不画小格（老插件是这条路）", () => {
    for (const thin of [0, undefined]) {
      const svg = shareCardSvg({ ...roundCard(), xMinor: thin }, darkCard, measureWidth);
      equal(count(svg, 'y2="881"'), 0, `xMinor = ${String(thin)} 时不该有小格`);
      onePlace(svg, "开始"); // 主刻度照旧
    }
  });

  await testCase("大单位那一档画大一号（小时比分钟显眼）", () => {
    const svg = shareCardSvg(
      {
        ...roundCard(),
        // 一轮跨过一小时：分钟那档是小字，"几小时"那两档是大字。
        xTicks: [
          { at: 0, label: "开始" },
          { at: 0.5, label: "1 小时", largeSinglePosition: true },
          { at: 1, label: "2 小时", largeSinglePosition: true },
        ],
      },
      darkCard,
      measureWidth,
    );
    equal(onePlace(svg, "1 小时").number, 30, "大单位那档的字号");
    equal(onePlace(svg, "2 小时").number, 30, "大单位那档的字号");
    equal(onePlace(svg, "开始").number, 24, "普通档照旧");
    // ⚠️ **颜色不变**：用户要的是「稍微大一点的字体标出来」——是"换档了"的提示，
    // 不是"这一档更重要"。所以字号由宿主定，颜色两档一样。
    equal(onePlace(svg, "1 小时").color, darkCard.faint, "大单位不改颜色");
  });

  await testCase("插件没给横刻度时，纵刻度照画（两轴各管各的）", () => {
    const svg = shareCardSvg({ ...allDateCard(), xTicks: [] }, darkCard, measureWidth);
    equal(count(svg, 'stroke-dasharray="6 8"'), 5, "纵刻度还在");
    equal(onePlace(svg, "30").y, 566, "纵刻度的位置不受影响");
  });

  group("曲线");

  await testCase("每个点之间一段二次贝塞尔（平滑），末尾补一段收口", () => {
    const svg = shareCardSvg(roundCard(), darkCard, measureWidth);
    // ⚠️ 只数**那一条描线的 path**：面积那一层用的是同一个 `d`（收口在它后面），
    // 整串里数会正好翻倍。
    const line2 = svg.match(/<path d="([^"]+)" fill="none"/)?.[1];
    assertion(line2, "没找到描线那条 path");
    // 8 个点 → 7 段 + 收尾 1 段。
    equal(count(line2!, " Q "), 8, "贝塞尔段数");
    assertion(/^M [\d.-]+ [\d.-]+ Q/.test(line2!), "曲线不是从 M 起、Q 接的");
  });

  await testCase("曲线下面那层面积收口到右下角再回到左下角", () => {
    const svg = shareCardSvg(roundCard(), darkCard, measureWidth);
    assertion(svg.includes(`L 1000 871 L 140 871 Z`), "面积那一层的收口不对");
    assertion(svg.includes('fill="url(#卡面)"'), "面积那层没引用渐变");
  });

  await testCase("只有一个点就画一颗点，不画线，但两轴刻度照画", () => {
    const svg = shareCardSvg({ ...roundCard(), points: [13] }, darkCard, measureWidth);
    equal(count(svg, "<circle"), 1, "一颗点");
    equal(count(svg, " Q "), 0, "没有线");
    // ⚠️ 这一颗点**要**那个框：有横轴才知道它是哪一刻、有纵轴才知道 13 是多高。
    // 要躲的是"一个点画成一条横贯全图的直线"（那看着像速度恒定）。
    onePlace(svg, "开始");
    equal(count(svg, 'stroke-dasharray="6 8"'), 1, "只有一个值时纵轴只画一档");
  });

  await testCase("一个点都没有时整块图区都不画，只剩大数字与三格", () => {
    const svg = shareCardSvg({ ...roundCard(), points: [] }, darkCard, measureWidth);
    equal(count(svg, "<circle"), 0, "没有点");
    equal(count(svg, " Q "), 0, "没有线");
    equal(count(svg, ">开始<"), 0, "没有横轴刻度");
    equal(count(svg, 'stroke-dasharray="6 8"'), 0, "没有纵轴刻度");
    // 但卡片该有的东西一样不少（只有曲线那块的位置空着）。
    onePlace(svg, "写作统计");
    onePlace(svg, "13");
    equal(count(svg, 'height="150"'), 3, "三格还在");
  });

  group("⚠️ 没有外链、没有撞名的 id（不然光栅化会失败）");

  await testCase("两个标识的 id 各带前缀，没有裸 id=\"drop\"", () => {
    const svg = shareCardSvg(roundCard(), darkCard, measureWidth);
    // ⚠️ 同名的 `id` 在同一份文档里只认第一个。两个图标长得一模一样，所以撞名
    // **表现上看不出来**——这一条就是不让它靠运气。
    equal(count(svg, 'id="drop"'), 0, "有裸 id");
    assertion(svg.includes('id="顶drop"') && svg.includes('id="脚drop"'), "两个前缀没带上");
  });

  await testCase("每一个 url(#…) 都在这一串里定义过", () => {
    const svg = shareCardSvg(roundCard(), darkCard, measureWidth);
    const fixedMeaning = new Set([...svg.matchAll(/\bid="([^"]+)"/g)].map((m) => m[1]!));
    const referenceUse = [...svg.matchAll(/url\(#([^)]+)\)/g)].map((m) => m[1]!);
    assertion(referenceUse.length >= 4, `引用太少，用例本身有问题：${referenceUse}`);
    for (const r of referenceUse) {
      assertion(fixedMeaning.has(r), `引用了一个没定义的 id：${r}`);
    }
  });

  await testCase("卡片里没有 href / image / @import 这类外链", () => {
    const svg = shareCardSvg(roundCard(), darkCard, measureWidth);
    for (const ban of ["href", "<image", "@import", "xlink"]) {
      equal(count(svg, ban), 0, `出现了 ${ban}`);
    }
  });

  group("两套配色（跟着界面深浅走）");

  await testCase("浅色与深色用的是各自那套字色，两张不相等", () => {
    const dark2 = shareCardSvg(roundCard(), darkCard, measureWidth);
    const light = shareCardSvg(roundCard(), lightCard, measureWidth);
    assertion(dark2 !== light, "两套配色画出来一样");
    equal(onePlace(dark2, "写作统计").color, darkCard.character2, "深色的标题色");
    equal(onePlace(light, "写作统计").color, lightCard.character2, "浅色的标题色");
    // ⚠️ 这里找的是**大写**那句：设计稿的副标题在 CSS 里带 `text-transform:uppercase`，
    // 而 SVG 的 `<text>` 不吃 `text-transform`，所以是渲染层自己转的
    // （`share-card.ts` 的 `分享图SVG`）。插件送的仍然是 `Writing Stats`。
    equal(onePlace(dark2, "WRITING STATS").color, darkCard.faint, "深色的副标题色");
    equal(onePlace(light, "WRITING STATS").color, lightCard.faint, "浅色的副标题色");
  });

  await testCase("⚠️ 深色那套的强调色与浅色**不是同一个值**（照设计稿）", () => {
    // 2026-09-27 目检时发现的：两套都写成了浅色那个 `#2f63d8`，于是深色卡的
    // 大数字与曲线比设计稿暗一档。设计稿两个 HTML 里的 `--accent` 本来就不同。
    equal(darkCard.main, "#4f82fb", "深色的强调色");
    equal(lightCard.main, "#2f63d8", "浅色的强调色");
    assertion(darkCard.main !== lightCard.main, "两套强调色不该是同一个值");
  });

  await testCase("大数字空串画破折号（不是画 0），单位空串不画", () => {
    const emptyValue = shareCardSvg({ ...roundCard(), value: "", unit: "" }, darkCard, measureWidth);
    onePlace(emptyValue, "—");
    equal(count(emptyValue, 'font-size="40"'), 0, "单位那格不该画");
  });

  await testCase("日期空串不画（拿不到时间来源时就是这个样子）", () => {
    // ⚠️ 不能拿 `text-anchor="end"` 去数：纵轴那三档也是 `end`，末档横刻度也是。
    // 用这一行自己的基线位置（右上角那格 y=114）来判。
    equal(count(shareCardSvg(roundCard(), darkCard, measureWidth), 'y="114"'), 1, "有日期时画一处");
    equal(count(shareCardSvg({ ...roundCard(), date: "" }, darkCard, measureWidth), 'y="114"'), 0, "日期空就不画");
  });

  group("安全文件名（插件给的，不能信）");

  await testCase("正常名字原样留下", () => {
    equal(SafeFileName("nota-stats-day-2026-09-27.png"), "nota-stats-day-2026-09-27.png", "正常名字");
    equal(SafeFileName("nota-stats-round-20260927-2207.png"), "nota-stats-round-20260927-2207.png", "本轮名字");
  });

  await testCase("路径分隔符：只留最后一段（不是换成横杠）", () => {
    // ⚠️ 顺手换掉也"安全"，但名字里会多出一串 `..-..-` 让人看不懂。
    equal(SafeFileName("../../etc/x.png"), "x.png", "上跳路径");
    equal(SafeFileName("/tmp/a/b.png"), "b.png", "绝对路径");
    equal(SafeFileName("C:\\Users\\a\\b.png"), "b.png", "反斜杠");
  });

  await testCase("Windows 上那几个保留字符换掉", () => {
    const output2 = SafeFileName('a:b*c?d"e<f>g|h.png');
    equal(output2, "a-b-c-d-e-f-g-h.png", "保留字符");
  });

  await testCase("控制字符（含换行）直接去掉", () => {
    equal(SafeFileName("a\nb\u0000c.png"), "abc.png", "控制字符");
  });

  await testCase("开头的点去掉（`.` 与 `..` 是目录）", () => {
    equal(SafeFileName("..hidden.png"), "hidden.png", "前导点");
  });

  await testCase("⚠️ 洗成空的时候给一个能看见的兜底名", () => {
    // ⚠️ 这是本组最要紧的一条：`""` 与 `"..."` 如果只是补个后缀，拼出来的是
    // `.png`——一个点号开头的**隐藏文件**。用户按下"保存"，然后在文件夹里找不到它。
    // （`清文件名` 在 Rust 那边是同一个道理，`commands/export.rs`。）
    for (const original of ["", "   ", "...", "///"]) {
      const output2 = SafeFileName(original);
      assertion(!output2.startsWith("."), `「${original}」→ ${output2}（隐藏文件）`);
      equal(output2, "nota-stats.png", `「${original}」`);
    }
  });

  await testCase("名字只剩一个后缀时不是隐藏文件，也不再往下剥", () => {
    // ⚠️ `.png` 剥掉前导点之后剩 `png`、后缀又剥不掉，于是补成 `png.png`。
    // 这个结果**不好看但安全**（不是隐藏文件、有后缀），而它本来也不可能出现
    // ——插件给的名字一直是 `nota-stats-day-YYYY-MM-DD.png` 那个形状。
    // 这里钉住它是为了下一次改这个函数时，**别顺手把它变成 `.png`**。
    equal(SafeFileName(".png"), "png.png", "只剩后缀");
    equal(SafeFileName(".hidden"), "hidden.png", "只剩一个隐藏名");
  });

  await testCase("没有后缀补上，大写后缀也认，长名字截断后后缀还在", () => {
    equal(SafeFileName("心电图"), "心电图.png", "补后缀");
    equal(SafeFileName("a.PNG"), "a.png", "大写后缀");
    const length = SafeFileName("x".repeat(400));
    assertion(length.length <= 120, `太长了：${length.length}`);
    assertion(length.endsWith(".png"), "后缀被截掉了");
  });

  group("转 base64（IPC 只能传字符串）");

  await testCase("小数据与逐字节对照一致", async () => {
    const byte = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x00, 0xff, 0x80]);
    const output2 = await toBase64(new Blob([byte]));
    equal(output2, Buffer.from(byte).toString("base64"), "和参照实现一致");
  });

  await testCase("⚠️ 大块数据也拼得出来（分片拼，不顶参数个数上限）", async () => {
    // ⚠️ 这条钉的是"一次把整个数组展开成 `String.fromCharCode(...)`"那个坑：
    // 它**取决于图多大**——图小的时候能过、图一大就抛，最难查。0x8000 是分片
    // 大小，这里故意超过它一个字节。
    const byte = new Uint8Array(0x8000 + 1).fill(65);
    const output2 = await toBase64(new Blob([byte]));
    equal(output2, Buffer.from(byte).toString("base64"), "大块一致");
  });

  /* ── 热力图那张（`shape = "heat"`）────────────────────────────────────── */

  group("热力图那张：格子、标尺、没有曲线");

  await testCase("8 列 × 7 行 = 56 格全画出来（最后一列是满的）", () => {
    const svg = shareCardSvg(hotForceCard(), lightCard, measureWidth);
    // ⚠️ 按 `class` 数，不按 `<rect>` 数：卡片里还有两个 Nota 标识，它们自己也画方块。
    equal(count(svg, 'class="heat-cell"'), 56, "格子数");
    equal(count(svg, 'class="heat-legend"'), 5, "标尺五格");
  });

  await testCase("⚠️ 有字的那格用强调色、按档分透明度；没写的那格用线色（不是同一个灰）", () => {
    const svg = shareCardSvg(hotForceCard(), lightCard, measureWidth);
    // ⚠️ 只数**格子**：右下角那排标尺用的是同一套颜色与同一个透明度（它就是
    // 这把尺子的图例），光数颜色会把它一起数进来。
    const cellCount = (attachAdd: string) =>
      (svg.match(new RegExp(`<rect class="heat-cell"[^>]*${reference(attachAdd)}`, "g")) ?? []).length;
    // 最大值 100 → 满档 4；50 是它的一半 → 2 档。
    equal(cellCount('fill-opacity="0.92"'), 1, "满档一格");
    equal(cellCount('fill-opacity="0.42"'), 1, "一半那格");
    equal(cellCount(`fill="${lightCard.line2}"`), 54, "剩下 54 格是「没写」那个灰");
    equal(cellCount(`fill="${lightCard.main}"`), 2, "有字的两格用强调色");
    // ⚠️ 浅色这张卡上，格子用的是**浅色卡**那个蓝。⚠️ 只能按格子数：标识里面那个
    // 小方块是写死的深色卡蓝（`nota-mark` 那份图标），它会混进全串的计数里。
    equal(cellCount(`fill="${darkCard.main}"`), 0, "格子不该用深色卡那套的蓝");
  });

  await testCase("右下角那排标尺：五格由浅到深，两头那两个字是插件给的（会翻译）", () => {
    const svg = shareCardSvg(hotForceCard(), lightCard, measureWidth);
    const less = onePlace(svg, "少");
    const many = onePlace(svg, "多");
    assertion(less.x < many.x, `「少」该在「多」左边：${less.x} / ${many.x}`);
    // 五格标尺夹在两个字中间。
    assertion(less.x + 24 < many.x, "标尺那五格夹在中间");
  });

  await testCase("⚠️ 热力图那张**不画曲线**（没有描线那条 path、也没有曲线下面那层面积）", () => {
    const svg = shareCardSvg(hotForceCard(), lightCard, measureWidth);
    equal(count(svg, '<path d="'), 0, "一条 path 都不该有");
    equal(count(svg, "url(#卡面)"), 0, "那张渐变的面积也不再被引用");
  });

  await testCase("月份标签画出来了，而且**跟着界面语言走**", () => {
    setLanguage("zh-CN");
    const middleText = shareCardSvg(hotForceCard(), lightCard, measureWidth);
    assertion(middleText.includes(">8月<") && middleText.includes(">9月<"), "中文那版标的是 8月 / 9月");
    setLanguage("en");
    const englishText = shareCardSvg(hotForceCard(), lightCard, measureWidth);
    assertion(englishText.includes(">Aug<") && englishText.includes(">Sep<"), "英文那版标的是 Aug / Sep");
    // ⚠️ 只查**月份那两行字**：这张卡上别的中文（日期、少 / 多）是插件给的原文，
    // 与月份标签走的是两条路（一个 `Intl`、一个插件文案表），不该混在一条断言里。
    equal(englishText.includes(">8月<") || englishText.includes(">9月<"), false, "月份那行不该剩中文");
    setLanguage("zh-CN");
  });

  await testCase("⚠️ 一条记录都没有时不画格子、也不画标尺（但大数字与三格照旧）", () => {
    const emptyValue = { ...hotForceCard(), heat: computeHeatmap([], "", 26) };
    const svg = shareCardSvg(emptyValue, lightCard, measureWidth);
    equal(count(svg, 'class="heat-cell"'), 0, "一格都没有");
    equal(count(svg, 'class="heat-legend"'), 0, "标尺也不画");
    assertion(svg.includes("128,400"), "大数字还在");
    assertion(svg.includes("有字的天数"), "三格指标还在");
  });

  await testCase("⚠️ 今天才周三：最后一列只画三格（不是补出四格「0 字」）", () => {
    const weekThree = { ...hotForceCard(), heat: computeHeatmap([], "2026-09-23", 8) };
    const svg = shareCardSvg(weekThree, lightCard, measureWidth);
    equal(count(svg, 'class="heat-cell"'), 7 * 7 + 3, "前七列各 7 格 ＋ 最后一列 3 格");
  });

  /* ── 收尾 ───────────────────────────────────────────────────────────── */

  console.log(`\n${"─".repeat(64)}`);
  console.log(`通过 ${pass} 条，失败 ${fail} 条`);
  if (fail) {
    console.log(`失败的：\n  - ${failed.join("\n  - ")}`);
    process.exitCode = 1;
  }
}

void main();
