/**
 * 「专注模式压多暗」那条轴的**可运行**测试集：五个地方的名字逐个对齐。
 * 2026-10-04 写，与 `ui/useFocusDim.ts` ＋ `settings/appearance.rs::FocusDim` 同批落地
 * （`docs/07` 第 45 项，照 VMark 的窗口版加的）。
 *
 * # 跑法
 *
 * ```sh
 * npx esbuild tests/focus-dim.test.ts --bundle --platform=node --format=esm \
 *   --outfile=/tmp/nota-焦点档/focus-dim.mjs
 * node /tmp/nota-焦点档/focus-dim.mjs
 * ```
 *
 * 全过退出码 0；有不过的退出码 1，并把名字列出来。
 *
 * ⚠️ **要在仓库里跑**（不 `cd` 的话读不到源码）：这份测试读五个**源码文件**，
 * 路径是相对 `process.cwd()` 的（与 `status-metric.test.ts` 同一套长相）。
 *
 * # 为什么是"读源码对名字"，而不是"跑一遍看看"
 *
 * 这一条轴上的值有**五个名字**，分居五个文件、三种语言，而它们之间
 * **没有任何编译期或运行期的联系**：
 *
 * | 谁 | 在哪 | 写了什么 |
 * |---|---|---|
 * | Rust 枚举 | `settings/appearance.rs` | `Standard` / `Strong` / `Stronger` ＋ `#[default]` |
 * | Rust 序列化 | 同上（`#[serde(rename_all = "snake_case")]`） | `"standard"` / `"strong"` / `"stronger"` |
 * | 前端类型 | `bridge/types-settings.ts` | `"standard" \| "strong" \| "stronger"` |
 * | 设置页单选框 | `ui/settings/panes/AppearancePane.tsx` | 三项的排列与写回去的值 |
 * | CSS | `styles/editor.css` | `--focus-dim` 那三个数 |
 *
 * ⚠️ 对不上的**症状全是静默的**，一条都不会报错：
 *
 * 1. 名字拼错（`"stronger"` 写成 `"strongest"`）→ 用户在设置里选了它，
 *    落盘、重启、读回来时 `serde` **认不出那个值**，整份设置读不进来
 *    （枚举那条路的代价，`FocusDim` 的注释里写着为什么这里可以这样）；
 * 2. `useFocusDim.ts` 的 `默认档` 与 Rust 的 `#[default]` 不一致 →
 *    启动那一瞬间（设置还没读回来）压暗强度先按一个值画，读回来之后自己跳一下；
 * 3. CSS 里少写一档（只有两行 `html[data-focus-dim=…]`）→ 选了那一档
 *    **界面什么都不变**，而设置里那个单选框看着是好的；
 * 4. 两条选择器有一条忘了改 `var(--focus-dim)` → **只有一半模式跟着变**
 *    （所见即所得变了、源码模式没变），而两边切换着看才发现得了。
 *
 * 这四条的代价都比"写一份读源码的测试"高，所以这份文件量的是**名字有没有对上**，
 * 而不是"颜色好不好看"（那是眼睛的事，`docs/06` §5 的目检）。
 *
 * # ⚠️ 这份测试**证明不了**什么
 *
 * - **压暗效果本身一帧都没看**：三档在真窗口里长什么样、最暗那一档还看不看得清
 *   ——那是目检（`FOLIO_SNAPSHOT` 那一套在这里对应 `docs/06` §5 的截图流程）。
 *   这里只保证"选了哪一档、CSS 里有那一档、值是多少"这条线是通的。
 * - **`data-focus-dim` 真的落到了 `<html>` 上**没验：那要挂载 React 组件
 *   （`useFocusDim` 里那三行）。这里读的是它的源码文本。
 * - **设置页那三颗单选真的点得动**没验：需要一颗 DOM。
 */

import { readFileSync } from "node:fs";

/* ── 一支极小的测试工装（与 `status-metric.test.ts` 同一套长相）── */

let pass = 0;
let fail = 0;
const failed: string[] = [];

function group(name3: string): void {
  console.log(`\n${name3}`);
}

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

function equal(actual: unknown, expected: unknown, description: string): void {
  const a = JSON.stringify(actual);
  const b = JSON.stringify(expected);
  if (a !== b) throw new Error(`${description}\n      实际：${a}\n      期望：${b}`);
}

function assertValue(value2: unknown, description: string): void {
  if (!value2) throw new Error(description);
}

/** 读一份仓库里的源码。⚠️ 路径相对 `process.cwd()`（见文件头"要在仓库里跑"）。 */
function read(phaseCorrect: string): string {
  return readFileSync(phaseCorrect, "utf8");
}

const threeItemWord = ["standard", "strong", "stronger"] as const;

/* ── 组一：Rust 那一侧 ─────────────────────────────────────────────── */

group("组一 Rust：枚举三个变体、默认标准、落盘三个词");

const rust = read("src-tauri/src/settings/appearance.rs");

testCase("`FocusDim` 三个变体在（大小写照 Rust 的写法）", () => {
  for (const changeBody of ["Standard", "Strong", "Stronger"]) {
    assertValue(new RegExp(`\\b${changeBody},`).test(rust), `枚举里该有 \`${changeBody}\``);
  }
});

testCase("`#[default]` 在 `Standard` 那一档上（不是 Stronger）", () => {
  // ⚠️ 挪到 `Stronger` 上就是"升级之后专注模式突然更暗了"，而用户没做过这个选择。
  const paragraph2 = rust.slice(rust.indexOf("pub enum FocusDim"));
  const toDefault = paragraph2.indexOf("#[default]");
  assertValue(toDefault >= 0, "该有 `#[default]`");
  const afterDefault = paragraph2.slice(toDefault, paragraph2.indexOf("Strong,"));
  assertValue(/Standard,/.test(afterDefault), "`#[default]` 该紧挨着 `Standard`");
});

testCase("枚举上有 `rename_all = \"snake_case\"`（否则落盘是 `\"Standard\"`）", () => {
  const paragraph2 = rust.slice(rust.indexOf("/// **专注模式下非聚焦内容压多暗**"));
  const toTokenEnumerate = paragraph2.slice(0, paragraph2.indexOf("pub enum FocusDim"));
  assertValue(/rename_all = "snake_case"/.test(toTokenEnumerate), "那一行 `serde` 属性该在枚举前面");
});

testCase("`Appearance` 上有 `focus_mode_dim` 这一格，默认是标准", () => {
  assertValue(/pub focus_mode_dim: FocusDim,/.test(rust), "字段该在 `Appearance` 上");
  const defaultParagraph = rust.slice(rust.indexOf("impl Default for Appearance"));
  assertValue(
    /focus_mode_dim: FocusDim::Standard,/.test(defaultParagraph),
    "默认值该写 `FocusDim::Standard`",
  );
});

testCase("它**不在** `[focus]` 那张表里（那是强制专注那本账）", () => {
  // ⚠️ 两件同名不同物的事：`[focus]` 是番茄钟/余额那套记账（`settings/focus.rs`），
  // 这一档是 `F8` 那条写作模式的外观。放进 `[focus]` 会让"改外观"去动一本账。
  const focusPointTable = read("src-tauri/src/settings/focus.rs");
  assertValue(
    !/focus_mode_dim/.test(focusPointTable),
    "`focus.rs` 里不该出现 `focus_mode_dim`（它是 `[appearance]` 的字段）",
  );
});

/* ── 组二：前端类型与默认值的兜底 ─────────────────────────────────── */

group("组二 前端：类型三个词、兜底与 Rust 默认同值");

const type = read("src/bridge/types-settings.ts");

testCase("`FocusModeDim` 就是那三个词", () => {
  const m = /export type FocusModeDim = ([^;]+);/.exec(type);
  assertValue(m, "该有 `export type FocusModeDim = …`");
  for (const word of threeItemWord) {
    assertValue(m![1]!.includes(`"${word}"`), `类型里该有 \`"${word}"\``);
  }
});

testCase("`AppearanceSettings` 上有这一格，且类型是 `FocusModeDim`", () => {
  assertValue(/focus_mode_dim: FocusModeDim;/.test(type), "字段该在 `AppearanceSettings` 上");
});

testCase("`useFocusDim.ts` 的兜底档与 Rust 的默认**同名**", () => {
  // ⚠️ 兜底那条走的是 `settings` 还没读回来（`null`）那一瞬间：两边不一致的话，
  // 启动第一帧按一个值画、读回来再跳一下——那种"闪一下"用户说得出症状，
  // 但没人会想到是这两处对不上。
  const hook = read("src/ui/useFocusDim.ts");
  const m = /const defaultLevel = "([a-z_]+)"/.exec(hook);
  assertValue(m, "该有 `const defaultLevel = \"…\"`");
  equal(m![1], "standard", "兜底档该是标准那一档");
});

testCase("hook 把非默认档写成 `data-focus-dim`（属性名与 CSS 逐字对应）", () => {
  const hook = read("src/ui/useFocusDim.ts");
  assertValue(/setAttribute\("data-focus-dim", level\)/.test(hook), "该往 `<html>` 上写 `data-focus-dim`");
  assertValue(/removeAttribute\("data-focus-dim"\)/.test(hook), "默认档该把属性摘掉（DOM 才干净）");
});

/* ── 组三：设置页那三颗单选 ───────────────────────────────────────── */

group("组三 设置页：三颗单选的**值**与**顺序**");

testCase("选项表里就是那三个词，顺序是 标准 → 强 → 更强", () => {
  // ⚠️ 顺序也要钉（截图里就是这三档由浅到深），而且在 `AppearancePane.tsx` 里
  // 逐个写出来的字面量**没有类型约束**——拼错一个是静默的（选了没反应）。
  const pane = read("src/ui/settings/panes/AppearancePane.tsx");
  const paragraph2 = pane.slice(pane.indexOf("focus_mode_dim"));
  const m = /options=\{\[([\s\S]*?)\]\}/.exec(paragraph2);
  assertValue(m, "该能找到 `focus_mode_dim` 那个 `Radio` 的 `options`");
  const values = [...m![1]!.matchAll(/value: "([a-z_]+)"/g)].map((x) => x[1]);
  equal(values, [...threeItemWord], "三个值逐字对上、顺序也一样");
});

testCase("写回去的是同一格（`写({ focus_mode_dim })`）", () => {
  const pane = read("src/ui/settings/panes/AppearancePane.tsx");
  assertValue(
    /onChange=\{\(focus_mode_dim\) => write\(\{ focus_mode_dim \}\)\}/.test(pane),
    "单选框的 `onChange` 该原样写回那一格",
  );
});

/* ── 组四：CSS 那三个数 ───────────────────────────────────────────── */

group("组四 CSS：三档都有值，两条选择器都读同一个变量");

const css = read("src/styles/editor.css");

testCase("标准那一档写在 `:root` 上（默认态不落属性，值只写这一份）", () => {
  const m = /:root \{\s*--focus-dim: ([\d.]+);\s*\}/.exec(css);
  assertValue(m, "该有 `:root { --focus-dim: …; }`");
  const value2 = Number(m![1]);
  assertValue(value2 > 0 && value2 <= 1, `该是个透明度（0~1），实际 ${value2}`);
});

testCase("另两档各有一条 `html[data-focus-dim=\"…\"]`，三个数由大到小", () => {
  // ⚠️ "由大到小"就是"由浅到深"：`opacity` 越大越不暗。标准 > 强 > 更强
  // 这个次序反了的话，用户选"更强"会看到变浅——而那看着像功能坏了。
  const markAccurate = Number(/:root \{\s*--focus-dim: ([\d.]+);/.exec(css)![1]);
  const strong = Number(/html\[data-focus-dim="strong"\] \{\s*--focus-dim: ([\d.]+);/.exec(css)![1]);
  const moreStrong = Number(
    /html\[data-focus-dim="stronger"\] \{\s*--focus-dim: ([\d.]+);/.exec(css)![1],
  );
  assertValue(markAccurate > strong, `标准（${markAccurate}）该比强（${strong}）浅`);
  assertValue(strong > moreStrong, `强（${strong}）该比更强（${moreStrong}）浅`);
  assertValue(moreStrong > 0, "最暗那一档也**看得见**（压到 0 就成了另一回事）");
});

testCase("`data-focus-dim` 的三条规则都用**同一个**属性名（拼错就是整档失灵）", () => {
  for (const word of ["strong", "stronger"]) {
    assertValue(
      css.includes(`html[data-focus-dim="${word}"]`),
      `CSS 里该有 \`html[data-focus-dim="${word}"]\``,
    );
  }
});

testCase("两条压暗选择器都读 `var(--focus-dim)`（不能一条写死数值）", () => {
  // ⚠️ 这是本组最要紧的一条：`.nota-dim`（所见即所得）与
  // `.cm-editor.nota-focus .cm-line:not(.nota-focus-on)`（源码模式）**各写一个
  // 数**的话，症状是"拨了开关只有一半跟着变"——用户得把同一条路走两遍才发现。
  //
  // ⚠️ **不按"从哪儿到哪儿"切片**（第一版就是那么写的，切错了）：`--focus-dim`
  // 那一节与两条选择器之间还隔着注释，而 `.nota-focus-on` 这个名字**先**出现在
  // 第二条选择器的 `:not(…)` 里——按名字找尾，切出来只有一条，测试自己会误报。
  // 改成全文件数数：这个文件里 `var(--focus-dim)` 只该有那两处。
  const useChangeMeasure = [...css.matchAll(/opacity: var\(--focus-dim\);/g)].length;
  equal(useChangeMeasure, 2, "两条选择器都该读变量");
  // 原来那两个写死的 `0.32` 一个都不该剩（只剩 `:root` 那一处声明，
   // 那一处的写法是 `--focus-dim: 0.32;`，不是 `opacity: 0.32`）。
  assertValue(!/opacity: 0\.\d+;/.test(css), "不该再有写死的 `opacity: 0.x`");
  // 标准那一档的数值只该出现**一次**（`:root` 那行）。多出来的那一次就是
  // 有人把它又抄进了某条选择器里。
  equal([...css.matchAll(/0\.32/g)].length, 1, "`0.32` 只该在 `:root` 那一行出现");
});

/* ── 收尾 ─────────────────────────────────────────────────────────── */

console.log(`\n过 ${pass}，败 ${fail}`);
if (fail > 0) {
  console.log("没过的：");
  for (const name3 of failed) console.log(`  · ${name3}`);
  process.exit(1);
}
