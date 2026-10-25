/**
 * `src/styles/accent.ts`（「主题色」这条轴）的**可运行**测试集。
 *
 * # 跑法（不装任何包：`esbuild` 与 `node` 仓库里都现成）
 *
 * ```sh
 * cd <仓库>
 * npx esbuild tests/accent.test.ts --bundle --platform=node --format=esm \
 *   --outfile=/tmp/nota-accent-test/accent.test.mjs
 * node /tmp/nota-accent-test/accent.test.mjs
 * ```
 *
 * 全过退出码 0；有不过的退出码 1，并把名字列出来。
 *
 * # 这份测试是为什么写的（2026-09-26）
 *
 * 用户当天提了「可不可以让用户自行选择主题色？」，随后补了一句设想：
 * 「这个主题只包含一个 UI 的设计样式，比如说圆角的半径，而不包含主题颜色，
 * 这样用户可以根据自己的喜好来定制。」于是有了第三条外观轴。
 *
 * 这条轴上**唯一一处"看着差不多、其实会错"的判断**就是"强调色上面那行字
 * 用黑还是白"。第一版写的是"两个对比度比大小"，跑一下 `color.css` 那 13 对
 * 才发现**和出厂的取舍有 7 对不一致**——包括 Adwaita 那个旗舰蓝（照第一版
 * 会把白字改成黑字）。这条线因此改成从出厂值里"读"出来的一个亮度阈值，
 * 而**下面第 2 组就是钉这件事的**：它直接读 `color.css`，而不是抄一份表。
 *
 * # 这份测试测什么、不测什么
 *
 * - 测：`parseAccent` 认哪几种写法、`accentFg` 的黑白分界、`accentVars` 的
 *   两变量输出与"认不出来返回 null"。
 * - **不测**：`applyTheme` 到底有没有把这两个变量写进 `<html>`、以及
 *   `AppearancePane` 有没有接上。⚠️ 那是**纯函数测试永远够不着的盲区**，
 *   本仓为此栽过（`tests/atom-space.test.ts` 的文件头写着那次教训）。
 *   那一层的判据只有一条：**开窗 + 看颜色**（`docs/06` §5.26 那一套截图配方）。
 */

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  accentFg,
  accentVars,
  parseAccent,
  correctCompareDegree,
  cardAccent,
  hue,
  RelativeLuminance,
  white,
  nearBlack,
} from "../src/styles/accent";

/* ── 一支极小的测试工装（与 `atom-space.test.ts` / `math-input.test.ts` 同一套长相）── */

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

function assertion(condition: unknown, description: string): void {
  if (!condition) throw new Error(description);
}

function equal(actual: unknown, expected: unknown, description: string): void {
  if (actual !== expected) {
    throw new Error(`${description}：期望 ${JSON.stringify(expected)}，实际 ${JSON.stringify(actual)}`);
  }
}

/** 两个数差得在容差以内。⚠️ 只给"会有定点舍入"的那类量用（色相、坐标）。 */
function near(actual: number, expected: number, containDifference: number, description: string): void {
  if (!(Math.abs(actual - expected) <= containDifference)) {
    throw new Error(`${description}：期望 ${JSON.stringify(expected)}±${containDifference}，实际 ${JSON.stringify(actual)}`);
  }
}

/* ── 一、`parseAccent`：认哪几种写法 ─────────────────────────────────── */

group("一、parseAccent 认这几种，其余一律 null（= 跟随风格）");

testCase("标准六位，原样（并统一成小写）", () => {
  equal(parseAccent("#3584e4"), "#3584e4", "六位小写");
  equal(parseAccent("#3584E4"), "#3584e4", "大写要归一成小写");
  // ⚠️ 归一成小写不是为了好看：它是**落盘值**，而盘上大小写两种都读得回来。
  // 不归一的话，"用户选了个红"和"用户选了个红"在设置文件里会长得不一样。
});

testCase("前导 `#` 可省", () => {
  equal(parseAccent("3584e4"), "#3584e4", "没写 # 也认");
  // ⚠️ 这一条是给**手改 `settings.toml`** 的人留的。界面上的取色器永远带 `#`。
  equal(parseAccent("  #3584E4  "), "#3584e4", "两头的空白要吃掉");
});

testCase("三位短写法按 CSS 的规矩**逐位翻倍**", () => {
  equal(parseAccent("#abc"), "#aabbcc", "`#abc` → `#aabbcc`");
  equal(parseAccent("#f00"), "#ff0000", "`#f00` → `#ff0000`");
  // ⚠️ 不是补零（`#abc000`）。补零是"看着也能跑"的那类错：颜色当场变成另一个。
});

testCase("认不出来的都是 null，不抛异常", () => {
  for (const broken of ["", "   ", "#12345", "#1234567", "#gggggg", "red", "rgb(1,2,3)", "hsl(0 0% 0%)", "#", "#12"]) {
    equal(parseAccent(broken), null, `「${broken}」该认不出来`);
  }
  // ⚠️ **颜色名故意不认**（`red` / `rebeccapurple`）。理由在 `accent.ts` 里：
  // 界面上那个 `<input type="color">` 只产出 `#rrggbb`，再放宽只会让
  // "我手写的 red 为什么没生效"变成一个需要排查的问题。
});

testCase("空串是**正常值**，不是错误", () => {
  // ⚠️ 空串 = 跟随当前风格，是默认值。它和"敲错了"必须能分辨——界面靠
  // `raw !== "" && parseAccent(raw) === null` 判断要不要报「（认不出…）」，
  // 判据反了的话默认状态下就会一直挂着一句警告。
  equal(parseAccent(""), null, "空串解析不出来");
  assertion(!"".length, "而它是空串——所以界面那条判据必须两个条件一起看");
  equal(accentVars(""), null, "空串 ⇒ 不写任何变量");
});

/* ── 二、黑字还是白字：**必须重现出厂那 13 对** ─────────────────────── */

/**
 * 从 `theme/color.css` 里读出厂那几对 `--accent` / `--accent-fg`。
 *
 * ⚠️⚠️ **读真文件，不在这里抄一份表**。抄一份的症状是：改了颜色而忘了改这份
 * 测试，于是"测试全绿"和"判据对不上出厂值"同时成立——那正是这条判据第一版
 * 栽的地方（7 对不一致，测试却是绿的）。同一件事的先例见
 * `tests/atom-space.test.ts` 顶上那段"判据只有一个：读落盘字节"。
 */
function readOutputFactoryOfAccentCorrect(): { accent: string; fg: string }[] {
  // ⚠️ 用 `process.cwd()` 而不是 `__dirname`：这份测试**先被 esbuild 打成一个
  // `.mjs` 再跑**（见文件头的跑法），`__dirname` 在 ESM 里根本不存在。
  // 所以**必须在仓库根目录跑**，同 `atom-space.test.ts` 那条。
  const path = resolve(process.cwd(), "src/styles/theme/color.css");
  const line3 = readFileSync(path, "utf8").split("\n");
  const correct: { accent: string; fg: string }[] = [];
  for (let i = 0; i < line3.length; i++) {
    const a = line3[i].match(/--accent:\s*(#[0-9a-fA-F]{3,6})/);
    if (!a) continue;
    const f = line3[i + 1]?.match(/--accent-fg:\s*(#[0-9a-fA-F]{3,6})/);
    if (f) correct.push({ accent: a[1].toLowerCase(), fg: f[1].toLowerCase() });
  }
  return correct;
}

group("二、accentFg 的分界必须重现 color.css 那 13 对（**这条是本次改动的由来**）");

testCase("出厂那 13 对，一对不落，判据都得落在同一边", () => {
  const correct = readOutputFactoryOfAccentCorrect();
  // ⚠️ 数量也断言：正则哪天读不到东西了，"零对全过"是**假绿**。
  // ⚠️ **2026-10-07 从 15 降到 13**：用户说「只需要 Yaru，不需要 Yaru Blue 了」，
  // 那个风格整档删掉（`color.css` 里少了两段，一浅一深）。⇒ 现在是
  // **7 档 × 明暗 = 14 段，其中 windows10 两段同值 ⇒ 13 对**。
  equal(correct.length, 13, "color.css 里该有 13 对（七档内置、windows10 两段同值）");
  const notValueSend: string[] = [];
  for (const { accent, fg } of correct) {
    const outputFactoryUseWhite = fg === white;
    const selfSquareUseWhite = accentFg(accent) === white;
    if (outputFactoryUseWhite !== selfSquareUseWhite) {
      notValueSend.push(`${accent}（出厂 ${fg}，我方 ${accentFg(accent)}）`);
    }
  }
  assertion(
    notValueSend.length === 0,
    `有 ${notValueSend.length} 对和出厂值落在了不同边：\n      ${notValueSend.join("\n      ")}\n` +
      `      改这条判据之前先读 accent.ts 的「分界亮度」那段。`,
  );
});

testCase("分界亮度 0.25 正好卡在出厂两边的极值中间", () => {
  const correct = readOutputFactoryOfAccentCorrect();
  const whiteThatEdge = correct.filter((p) => p.fg === white).map((p) => RelativeLuminance(p.accent));
  const darkThatEdge = correct.filter((p) => p.fg !== white).map((p) => RelativeLuminance(p.accent));
  const whiteMaximum = Math.max(...whiteThatEdge);
  const darkMinimum = Math.min(...darkThatEdge);
  assertion(whiteMaximum < 0.25 && 0.25 <= darkMinimum, `白字那侧最高 ${whiteMaximum}，深字那侧最低 ${darkMinimum}，0.25 该夹在中间`);
  // ⚠️ 这两个数就是 `分界亮度` 那段引用的那两个：`#e95420`／`#0a84ff` 与 `#f3732e`。
  // 把具体值也钉住，是为了让"0.25 是从哪来的"这句话**可查**：
  // 出厂值哪天改了，这个断言会红，然后读那段注释的人会看到需要重新取线。
  equal(whiteMaximum.toFixed(3), "0.238", "白字那侧最高的一对（Yaru 橙 #e95420 ／ macOS 深色 #0a84ff，都是 0.238）");
  // ⚠️ CDE 外置后不再计入核心出厂色。当前深字侧最低是 `#f3732e`
  // （亮度 0.315）；0.25 仍在这条线下方，余量 0.065。
  equal(darkMinimum.toFixed(3), "0.315", "深字那侧最低的一对（#f3732e）");
});

testCase("出厂 13 对里最低的对比度是 3.65:1（如实认账，不是新引入的）", () => {
  const correct = readOutputFactoryOfAccentCorrect();
  let mostLow = Infinity;
  let who = "";
  for (const { accent, fg } of correct) {
    const c = correctCompareDegree(RelativeLuminance(accent), RelativeLuminance(fg));
    if (c < mostLow) {
      mostLow = c;
      who = `${accent} / ${fg}`;
    }
  }
  console.log(`      出厂最低：${who} = ${mostLow.toFixed(2)}:1（Yaru 橙 #e95420 也是同一档）`);
  // ⚠️ 这条**不是**"我们够 AA 了"的证明——3.65 低于 WCAG AA 对正文的 4.5。
  // 它是一条**不许更坏**的底线：判据改成阈值之后，"白字可以低到多少"
  // 至少要跟出厂值一样好。哪天有人把分界亮度往上调，这里会红。
  assertion(mostLow >= 3.5, `出厂最低对比度掉到了 ${mostLow.toFixed(2)}:1（${who}），比 3.5 还低`);
  // ⚠️ 具体值也钉住：它是 `accent.ts` 里"认了白字可以低到 3.5:1"那句话的依据。
  equal(mostLow.toFixed(2), "3.65", "出厂最低那一对");
});

group("三、accentFg 本身：几个必须记牢的点");

testCase("纯黑配白字、纯白配深字", () => {
  equal(accentFg("#000000"), white, "黑底当然白字");
  equal(accentFg("#ffffff"), nearBlack, "白底当然深字");
});

testCase("**黄**是这条判据唯一真正难的地方", () => {
  // ⚠️ 这是 `accent.ts` 里那段"不能图省事用 (r+g+b)/3"的活证据：
  // `#ffd400` 用平均法算亮度是 0.83 里的另一套数，用 0.299/0.587/0.114
  // 那套近似会算出"偏亮但没那么亮"，在两套判据里都能过；但 `#e8e800`
  // 这种"又亮又黄"的色，只有 WCAG 那条公式才会干脆地判给深字。
  for (const yellow of ["#ffd400", "#ffff00", "#e8e800", "#ffe066", "#fff3b0"]) {
    equal(accentFg(yellow), nearBlack, `${yellow} 是浅色，必须配深字`);
  }
});

testCase("用户在浅色模式里最可能挑的那几个蓝，都还是白字", () => {
  // ⚠️ 这几条盯的是**别把分界调得太低**。0.25 往下调会让 Adwaita 的蓝
  // 翻成黑字（那正是第一版的问题），调回来就是要这几条绿。
  for (const blue of ["#3584e4", "#007aff", "#0969da", "#005fb8", "#0078d7"]) {
    // `#0969da` 亮度 0.152、`#0078d7` 0.183，都稳稳在白字那边。
    equal(accentFg(blue), white, `${blue} 该配白字`);
  }
});

testCase("分界线上下一格就该翻面", () => {
  // ⚠️ 不是"测 0.25 这个数"（那是实现细节），是测**它是条线**：
  // 亮度刚好在下面用白、刚好在上面用深，中间没有第三种结果。
  // 用灰阶造两个刚好骑在两边的色，这样断言不依赖任何具体色值。
  let below = "";
  let above = "";
  for (let v = 0; v <= 255; v++) {
    const hex = `#${v.toString(16).padStart(2, "0").repeat(3)}`;
    if (RelativeLuminance(hex) < 0.25) below = hex;
    else if (above === "") above = hex;
  }
  equal(accentFg(below), white, `${below} 在分界线下方，该白字`);
  equal(accentFg(above), nearBlack, `${above} 在分界线上方，该深字`);
  assertion(RelativeLuminance(above) - RelativeLuminance(below) < 0.01, "这两个灰该是紧挨着的");
});

/* ── 四、`accentVars`：要写哪两个变量 ───────────────────────────────── */

group("四、accentVars 的输出（`applyTheme` 直接拿它去 setProperty）");

testCase("认出来了就**三个变量一起**给", () => {
  const v = accentVars("#3584e4");
  assertion(v, "该有值");
  equal(v["--accent"], "#3584e4", "强调色本身");
  equal(v["--accent-fg"], white, "上面的字色");
  // ⚠️ **三个必须一起给**：
  // - 只写 `--accent` 而漏了 `--accent-fg`，用户挑一个浅黄就会得到
  //   "白字排在浅黄上"——正是这段代码要防的那件事；
  // - 漏了 `--switch-on`，就是用户 2026-09-30 报的那条「右侧开关还是
  //   橙色的」——色块变了、开关没跟（各风格在 `color.css` 里各写各的
  //   字面值，不引用 `--accent`，那条注释在 `accentVars` 上面）。
  equal(v["--switch-on"], "#3584e4", "开关也跟着（它没有字，不用换算前景色）");
  equal(Object.keys(v).length, 3, "只该有这三个键");
});

testCase("认不出来就 null（调用方据此把上一次写的**摘掉**）", () => {
  equal(accentVars(""), null, "跟随风格");
  equal(accentVars("red"), null, "敲错了");
  // ⚠️ 返回 `null` 而不是"返回原值"或"返回默认色"：调用方（`applyTheme`）
  // 必须能把上一次内联的两个变量**移除**。只写不移的症状是"改成跟随风格
  // 之后颜色没变回去"，用户会以为设置没保存。
});

/* ── 五、`卡片主色`：分享图跟随主题色 ＋ 按底色挪亮度 ────────────────── */

group("五、卡片主色（2026-09-27：用户「分享卡颜色强调是跟随自己的主题」）");

testCase("没设主题色 → 落设计稿那两个值，深底浅底各一个", () => {
  // ⚠️ 这条是**设计稿不能被改坏**的保证：用户没表达偏好时，卡片必须长得
  // 和 `plugins/stats/design/` 那两张图一样。
  equal(cardAccent(null, true), "#4f82fb", "深色卡");
  equal(cardAccent(null, false), "#2f63d8", "浅色卡");
  equal(cardAccent("", true), "#4f82fb", "空串 = 跟随风格，同 null");
  equal(cardAccent("red", true), "#4f82fb", "认不出来也落兜底");
});

testCase("两个设计稿的值**一个都不许动**（这是那两个亮度阈值的来历）", () => {
  equal(cardAccent("#4f82fb", true), "#4f82fb", "深底那个本来就够亮");
  equal(cardAccent("#2f63d8", false), "#2f63d8", "浅底那个本来就够暗");
});

testCase("用户挑的颜色在另一种底色上会被挪到看得清的那一段，**色相不动**", () => {
  // 设计稿的浅色强调色放到深色卡上：0.145 < 下限 0.20，该被抬亮。
  const liftBright = cardAccent("#2f63d8", true);
  assertion(liftBright !== "#2f63d8", "该被抬亮");
  assertion(RelativeLuminance(liftBright) >= 0.2, `抬完要够亮，实际 ${RelativeLuminance(liftBright)}`);
  // ⚠️ 色相别动了：用户挑的是那个颜色，我们只负责让它站得住。
  // ⚠️ 容差 1.5° 而不是**精确相等**：`转hex` 最后要落到 8 位整数通道上，
  // 那一步本身会把色相挪动零点几度（抬亮那一侧实测差 0.16°）。钉死相等
  // 等于在断言"定点运算不丢精度"，那是实现细节，不是这条规矩的意思。
  near(hue(liftBright), hue("#2f63d8"), 1.5, "色相不许变");

  // 黄在浅色卡上（0.684 > 上限 0.28）：白底上对比度 1.4:1，不压下去等于没画。
  const pressDark = cardAccent("#ffd400", false);
  assertion(RelativeLuminance(pressDark) <= 0.28, `压完要够暗，实际 ${RelativeLuminance(pressDark)}`);
  near(hue(pressDark), hue("#ffd400"), 1.5, "色相不许变");
  // 下限/上限是**单向**的：够亮的颜色不会再被压亮，够暗的不会再被压暗。
  equal(cardAccent("#4f82fb", true), "#4f82fb", "已经够亮就别再抬");
  equal(cardAccent("#ffd400", true), "#ffd400", "黄在深底上本来就够亮");
});

testCase("返回值一定是能认的 `#rrggbb`（它要写进 SVG 的 fill / stroke）", () => {
  for (const color of ["#2f63d8", "#ffd400", "#000000", "#ffffff", "#0a0a0a"]) {
    for (const dark2 of [true, false]) {
      const output2 = cardAccent(color, dark2);
      assertion(parseAccent(output2) !== null, `${color} 深底=${dark2} → ${output2} 该是合法颜色`);
    }
  }
});

/* ── 收尾 ──────────────────────────────────────────────────────────── */

console.log(`\n通过 ${pass}，失败 ${fail}`);
if (fail > 0) {
  console.log("失败的是：");
  for (const n of failed) console.log(`  - ${n}`);
  process.exit(1);
}
