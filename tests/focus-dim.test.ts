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

let 过 = 0;
let 败 = 0;
const 败的: string[] = [];

function 组(名: string): void {
  console.log(`\n${名}`);
}

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

function 等(实际: unknown, 期望: unknown, 说明: string): void {
  const a = JSON.stringify(实际);
  const b = JSON.stringify(期望);
  if (a !== b) throw new Error(`${说明}\n      实际：${a}\n      期望：${b}`);
}

function 真(值: unknown, 说明: string): void {
  if (!值) throw new Error(说明);
}

/** 读一份仓库里的源码。⚠️ 路径相对 `process.cwd()`（见文件头"要在仓库里跑"）。 */
function 读(相对: string): string {
  return readFileSync(相对, "utf8");
}

const 三个词 = ["standard", "strong", "stronger"] as const;

/* ── 组一：Rust 那一侧 ─────────────────────────────────────────────── */

组("组一 Rust：枚举三个变体、默认标准、落盘三个词");

const rust = 读("src-tauri/src/settings/appearance.rs");

测("`FocusDim` 三个变体在（大小写照 Rust 的写法）", () => {
  for (const 变体 of ["Standard", "Strong", "Stronger"]) {
    真(new RegExp(`\\b${变体},`).test(rust), `枚举里该有 \`${变体}\``);
  }
});

测("`#[default]` 在 `Standard` 那一档上（不是 Stronger）", () => {
  // ⚠️ 挪到 `Stronger` 上就是"升级之后专注模式突然更暗了"，而用户没做过这个选择。
  const 段 = rust.slice(rust.indexOf("pub enum FocusDim"));
  const 到默认 = 段.indexOf("#[default]");
  真(到默认 >= 0, "该有 `#[default]`");
  const 默认之后 = 段.slice(到默认, 段.indexOf("Strong,"));
  真(/Standard,/.test(默认之后), "`#[default]` 该紧挨着 `Standard`");
});

测("枚举上有 `rename_all = \"snake_case\"`（否则落盘是 `\"Standard\"`）", () => {
  const 段 = rust.slice(rust.indexOf("/// **专注模式下非聚焦内容压多暗**"));
  const 到枚举 = 段.slice(0, 段.indexOf("pub enum FocusDim"));
  真(/rename_all = "snake_case"/.test(到枚举), "那一行 `serde` 属性该在枚举前面");
});

测("`Appearance` 上有 `focus_mode_dim` 这一格，默认是标准", () => {
  真(/pub focus_mode_dim: FocusDim,/.test(rust), "字段该在 `Appearance` 上");
  const 默认段 = rust.slice(rust.indexOf("impl Default for Appearance"));
  真(
    /focus_mode_dim: FocusDim::Standard,/.test(默认段),
    "默认值该写 `FocusDim::Standard`",
  );
});

测("它**不在** `[focus]` 那张表里（那是强制专注那本账）", () => {
  // ⚠️ 两件同名不同物的事：`[focus]` 是番茄钟/余额那套记账（`settings/focus.rs`），
  // 这一档是 `F8` 那条写作模式的外观。放进 `[focus]` 会让"改外观"去动一本账。
  const 焦点表 = 读("src-tauri/src/settings/focus.rs");
  真(
    !/focus_mode_dim/.test(焦点表),
    "`focus.rs` 里不该出现 `focus_mode_dim`（它是 `[appearance]` 的字段）",
  );
});

/* ── 组二：前端类型与默认值的兜底 ─────────────────────────────────── */

组("组二 前端：类型三个词、兜底与 Rust 默认同值");

const 类型 = 读("src/bridge/types-settings.ts");

测("`FocusModeDim` 就是那三个词", () => {
  const m = /export type FocusModeDim = ([^;]+);/.exec(类型);
  真(m, "该有 `export type FocusModeDim = …`");
  for (const 词 of 三个词) {
    真(m![1]!.includes(`"${词}"`), `类型里该有 \`"${词}"\``);
  }
});

测("`AppearanceSettings` 上有这一格，且类型是 `FocusModeDim`", () => {
  真(/focus_mode_dim: FocusModeDim;/.test(类型), "字段该在 `AppearanceSettings` 上");
});

测("`useFocusDim.ts` 的兜底档与 Rust 的默认**同名**", () => {
  // ⚠️ 兜底那条走的是 `settings` 还没读回来（`null`）那一瞬间：两边不一致的话，
  // 启动第一帧按一个值画、读回来再跳一下——那种"闪一下"用户说得出症状，
  // 但没人会想到是这两处对不上。
  const hook = 读("src/ui/useFocusDim.ts");
  const m = /const 默认档 = "([a-z_]+)"/.exec(hook);
  真(m, "该有 `const 默认档 = \"…\"`");
  等(m![1], "standard", "兜底档该是标准那一档");
});

测("hook 把非默认档写成 `data-focus-dim`（属性名与 CSS 逐字对应）", () => {
  const hook = 读("src/ui/useFocusDim.ts");
  真(/setAttribute\("data-focus-dim", 档\)/.test(hook), "该往 `<html>` 上写 `data-focus-dim`");
  真(/removeAttribute\("data-focus-dim"\)/.test(hook), "默认档该把属性摘掉（DOM 才干净）");
});

/* ── 组三：设置页那三颗单选 ───────────────────────────────────────── */

组("组三 设置页：三颗单选的**值**与**顺序**");

测("选项表里就是那三个词，顺序是 标准 → 强 → 更强", () => {
  // ⚠️ 顺序也要钉（截图里就是这三档由浅到深），而且在 `AppearancePane.tsx` 里
  // 逐个写出来的字面量**没有类型约束**——拼错一个是静默的（选了没反应）。
  const pane = 读("src/ui/settings/panes/AppearancePane.tsx");
  const 段 = pane.slice(pane.indexOf("focus_mode_dim"));
  const m = /options=\{\[([\s\S]*?)\]\}/.exec(段);
  真(m, "该能找到 `focus_mode_dim` 那个 `Radio` 的 `options`");
  const 值们 = [...m![1]!.matchAll(/value: "([a-z_]+)"/g)].map((x) => x[1]);
  等(值们, [...三个词], "三个值逐字对上、顺序也一样");
});

测("写回去的是同一格（`写({ focus_mode_dim })`）", () => {
  const pane = 读("src/ui/settings/panes/AppearancePane.tsx");
  真(
    /onChange=\{\(focus_mode_dim\) => 写\(\{ focus_mode_dim \}\)\}/.test(pane),
    "单选框的 `onChange` 该原样写回那一格",
  );
});

/* ── 组四：CSS 那三个数 ───────────────────────────────────────────── */

组("组四 CSS：三档都有值，两条选择器都读同一个变量");

const css = 读("src/styles/editor.css");

测("标准那一档写在 `:root` 上（默认态不落属性，值只写这一份）", () => {
  const m = /:root \{\s*--focus-dim: ([\d.]+);\s*\}/.exec(css);
  真(m, "该有 `:root { --focus-dim: …; }`");
  const 值 = Number(m![1]);
  真(值 > 0 && 值 <= 1, `该是个透明度（0~1），实际 ${值}`);
});

测("另两档各有一条 `html[data-focus-dim=\"…\"]`，三个数由大到小", () => {
  // ⚠️ "由大到小"就是"由浅到深"：`opacity` 越大越不暗。标准 > 强 > 更强
  // 这个次序反了的话，用户选"更强"会看到变浅——而那看着像功能坏了。
  const 标准 = Number(/:root \{\s*--focus-dim: ([\d.]+);/.exec(css)![1]);
  const 强 = Number(/html\[data-focus-dim="strong"\] \{\s*--focus-dim: ([\d.]+);/.exec(css)![1]);
  const 更强 = Number(
    /html\[data-focus-dim="stronger"\] \{\s*--focus-dim: ([\d.]+);/.exec(css)![1],
  );
  真(标准 > 强, `标准（${标准}）该比强（${强}）浅`);
  真(强 > 更强, `强（${强}）该比更强（${更强}）浅`);
  真(更强 > 0, "最暗那一档也**看得见**（压到 0 就成了另一回事）");
});

测("`data-focus-dim` 的三条规则都用**同一个**属性名（拼错就是整档失灵）", () => {
  for (const 词 of ["strong", "stronger"]) {
    真(
      css.includes(`html[data-focus-dim="${词}"]`),
      `CSS 里该有 \`html[data-focus-dim="${词}"]\``,
    );
  }
});

测("两条压暗选择器都读 `var(--focus-dim)`（不能一条写死数值）", () => {
  // ⚠️ 这是本组最要紧的一条：`.nota-dim`（所见即所得）与
  // `.cm-editor.nota-focus .cm-line:not(.nota-focus-on)`（源码模式）**各写一个
  // 数**的话，症状是"拨了开关只有一半跟着变"——用户得把同一条路走两遍才发现。
  //
  // ⚠️ **不按"从哪儿到哪儿"切片**（第一版就是那么写的，切错了）：`--focus-dim`
  // 那一节与两条选择器之间还隔着注释，而 `.nota-focus-on` 这个名字**先**出现在
  // 第二条选择器的 `:not(…)` 里——按名字找尾，切出来只有一条，测试自己会误报。
  // 改成全文件数数：这个文件里 `var(--focus-dim)` 只该有那两处。
  const 用变量 = [...css.matchAll(/opacity: var\(--focus-dim\);/g)].length;
  等(用变量, 2, "两条选择器都该读变量");
  // 原来那两个写死的 `0.32` 一个都不该剩（只剩 `:root` 那一处声明，
   // 那一处的写法是 `--focus-dim: 0.32;`，不是 `opacity: 0.32`）。
  真(!/opacity: 0\.\d+;/.test(css), "不该再有写死的 `opacity: 0.x`");
  // 标准那一档的数值只该出现**一次**（`:root` 那行）。多出来的那一次就是
  // 有人把它又抄进了某条选择器里。
  等([...css.matchAll(/0\.32/g)].length, 1, "`0.32` 只该在 `:root` 那一行出现");
});

/* ── 收尾 ─────────────────────────────────────────────────────────── */

console.log(`\n过 ${过}，败 ${败}`);
if (败 > 0) {
  console.log("没过的：");
  for (const 名 of 败的) console.log(`  · ${名}`);
  process.exit(1);
}
