/**
 * 「状态栏显示哪一个统计量」那条轴的**可运行**测试集：四处名字逐个对齐。
 * 2026-09-30 写，与 `src/ui/StatusBar.tsx` 那个小菜单同批落地。
 *
 * # 跑法
 *
 * ```sh
 * npx esbuild tests/status-metric.test.ts --bundle --platform=node --format=esm \
 *   --outfile=/tmp/nota-tests/status-metric.mjs
 * node /tmp/nota-tests/status-metric.mjs
 * ```
 *
 * 全过退出码 0；有不过的退出码 1，并把名字列出来。
 *
 * ⚠️ **要在仓库里跑**（不 `cd` 的话读不到源码）：这份测试读四个**源码文件**，
 * 路径是相对 `process.cwd()` 的（与 `sidebar-resize.test.ts` 同一套）。
 *
 * # 这份测试盯的是什么
 *
 * 这一条轴上的值有**四个名字**，分居四个文件、两种语言，而它们之间
 * **没有任何编译期或运行期的联系**：
 *
 * | 谁 | 在哪 | 写了什么 |
 * |---|---|---|
 * | Rust 枚举 | `settings/appearance.rs` | `Words` / `Characters` / `Lines` / `Minutes` ＋ `#[default]` |
 * | Rust 序列化 | 同上（`#[serde(rename_all = "snake_case")]`） | `"words"` / `"characters"` / … |
 * | 前端类型 | `bridge/types-settings.ts` | `"words" \| "characters" \| "lines" \| "minutes"` |
 * | 菜单顺序 | `ui/StatusBar.tsx` | 四项的排列（图里是分钟、行、词、字符） |
 * | 读回来的兜底 | `ui/useStatusBar.ts` | `?? "words"` |
 *
 * ⚠️ 对不上的**症状全是静默的**，一条都不会报错：
 *
 * 1. 名字拼错（`"characters"` 写成 `"character"`）→ 用户在菜单里选了它，
 *    落盘、重启、读回来时 `serde` 认不出那个值，**整份设置读不进来**
 *    （枚举那条路的代价，`StatusMetric` 的注释里写着为什么这里可以这样）；
 * 2. `菜单次序` 里少一项 → 那一项在菜单里**根本没有**，而其余三项都好用，
 *    用户只会以为"这个功能就是没有分钟"；
 * 3. 兜底那个 `"words"` 与 Rust 的 `#[default]` 不一致 → 启动那一瞬间
 *    （设置还没读回来）显示的是**另一个统计量**，随后自己跳一下。
 *
 * # ⚠️ 这份测试**证明不了**什么
 *
 * - **"鼠标移进去那两颗按钮真的会出现"**没验：那是 CSS `:hover` 的事，
 *   本仓没有 jsdom（`tests/fake-dom.ts` 只够 `math-view.test.ts` 用），
 *   要真浏览器 ＋ 真指针。判据写在 `styles/tabs-status.css` 里，有没有真的
 *   生效只能靠开窗目检。
 * - **"点一下菜单真的改了显示"**没验：那要真 React 渲染。链子两端各自有测试
 *   （这一份管名字，`settings/appearance.rs` 管存取），中间那一跳算未验。
 * - **"菜单长得跟图4 一样"**没验：宽度、间距、往上弹还是往下弹，全在 CSS 里。
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";

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

function 相同(实际: readonly string[], 期望: readonly string[], 说明: string): void {
  const a = [...实际].sort().join(",");
  const b = [...期望].sort().join(",");
  if (a !== b) {
    throw new Error(`${说明}：期望 {${b}}，实际 {${a}}`);
  }
}

/* ── 四个源码文件 ─────────────────────────────────────────────────── */

const Rust源 = readFileSync(
  join("src-tauri", "src", "settings", "appearance.rs"),
  "utf8",
);
const 类型源 = readFileSync(join("src", "bridge", "types-settings.ts"), "utf8");
const 状态栏源 = readFileSync(join("src", "ui", "StatusBar.tsx"), "utf8");
// ⚠️ 读的是 `useStatusBar.ts` 而**不是** `App.tsx`：那一格 2026-09-30 晚从
// App 搬到了这个 hook 里（`App.tsx` 那天越过了 1000 行硬线）。搬到别处时
// **这份测试要跟着改**，症状是它报"找不到 `appearance.status_metric ?? …`"
// ——那句红不是误报，是搬家的人忘了带它。
const 接线源 = readFileSync(join("src", "ui", "useStatusBar.ts"), "utf8");

/**
 * 从 `appearance.rs` 里抠出 `pub enum StatusMetric { … }` 那一段的**变体名**
 * （Rust 侧的大驼峰写法，如 `Characters`）。
 *
 * ⚠️ 三条要防的：①**注释里的中文**（那个枚举头上有一大段，里面出现了
 * `Words` 这种词）；②`#[default]` 那一行不是变体；③下一格那个枚举
 * （`ToolbarMode` 在它**前面**，而 `StatusMetric` 之后紧跟的是
 * `Appearance` 结构体）不能被吃进来。
 */
function Rust变体(): string[] {
  const m = /pub enum StatusMetric\s*\{([\s\S]*?)\n\}/.exec(Rust源);
  if (!m) throw new Error("`appearance.rs` 里找不到 `pub enum StatusMetric { … }`");
  const 名: string[] = [];
  for (const 行 of m[1].split("\n")) {
    // 去掉行尾注释（注释里写过 `Words` 这种词，留着会被当成变体）。
    const 净 = 行.split("//")[0].trim();
    const v = /^([A-Z][A-Za-z0-9]*)\s*,?$/.exec(净);
    if (v) 名.push(v[1]);
  }
  return 名;
}

/** 大驼峰 → snake_case（`Characters` → `characters`）。 */
function 下划线(名: string): string {
  return 名.replace(/([a-z0-9])([A-Z])/g, "$1_$2").toLowerCase();
}

/** 从 `types-settings.ts` 里抠出 `export type StatusMetric = "…" | …;` 的字面量。 */
function TS字面量(): string[] {
  const m = /export type StatusMetric =([^;]+);/.exec(类型源);
  if (!m) throw new Error("`types-settings.ts` 里找不到 `export type StatusMetric = …;`");
  return [...m[1].matchAll(/"([a-z_]+)"/g)].map((x) => x[1]);
}

/** 从 `StatusBar.tsx` 里抠出 `菜单次序: StatusMetric[] = [ … ]` 的四个字面量。 */
function 菜单次序(): string[] {
  const m = /const 菜单次序: StatusMetric\[\] = \[([^\]]+)\]/.exec(状态栏源);
  if (!m) throw new Error("`StatusBar.tsx` 里找不到 `const 菜单次序: StatusMetric[] = […]`");
  return [...m[1].matchAll(/"([a-z_]+)"/g)].map((x) => x[1]);
}

/* ── 一、名字的两头 ─────────────────────────────────────────────────── */

组("一、Rust 枚举与前端类型逐字对齐");

测("`StatusMetric` 的四个变体与 TS 那四个字面量同集合", () => {
  // ⚠️ 这一条是**承重的**：对不上的症状是"菜单里选了没反应"或者"整份设置
  // 读不进来"，两种都不报错、不在控制台留痕（见文件头）。
  相同(
    Rust变体().map(下划线),
    TS字面量(),
    "Rust `StatusMetric` 的变体（转 snake_case 后）与 TS 的字面量",
  );
});

测("`StatusMetric` 上有 `#[serde(rename_all = \"snake_case\")]`", () => {
  // ⚠️ 没有这一条的话，序列化出来是 `"Words"`（大驼峰），而前端读写的是
  // `"words"`——**落盘的值前端认不出**，表现是"选完重启又弹回默认"，
  // 而设置文件里明明躺着 `status_metric = "Words"`。
  const 段 = /#\[serde\(rename_all = "snake_case"\)\]\s*pub enum StatusMetric/.test(Rust源);
  等(段, true, "`StatusMetric` 头上的 `rename_all`");
});

测("`Appearance` 上有 `#[serde(default)]`", () => {
  // 加字段才不会把老设置文件读崩（结构体级那个 `#[serde(default)]`）。
  等(
    /#\[serde\(default[^)]*\)\]\s*pub struct Appearance/.test(Rust源),
    true,
    "`Appearance` 头上的 `#[serde(default)]`",
  );
});

测("`Appearance` 里那一格叫 `status_metric`（前后端同名字段）", () => {
  // 字段名是 JSON 的键，两边必须逐字相同。
  等(
    /pub status_metric:\s*StatusMetric\s*,/.test(Rust源),
    true,
    "Rust 侧的字段声明",
  );
  等(
    /^\s*status_metric: StatusMetric;/m.test(类型源),
    true,
    "TS 侧的字段声明",
  );
});

/* ── 二、默认值与兜底值 ─────────────────────────────────────────────── */

组("二、默认值：Rust 的 `#[default]` 与接线里的兜底同值");

/**
 * Rust 里标着 `#[default]` 的那个变体（转 snake_case）。
 *
 * ⚠️ 那个属性写在**变体头上那一行**，所以要回头看上一行——直接找
 * `#[default]` 后面的第一个变体名是错的（它下面隔着一行注释）。
 */
function Rust默认(): string {
  const m = /pub enum StatusMetric\s*\{([\s\S]*?)\n\}/.exec(Rust源);
  if (!m) throw new Error("`appearance.rs` 里找不到 `pub enum StatusMetric { … }`");
  const 行们 = m[1].split("\n");
  for (let i = 0; i < 行们.length; i++) {
    if (!行们[i].includes("#[default]")) continue;
    for (let j = i + 1; j < 行们.length; j++) {
      const 净 = 行们[j].split("//")[0].trim();
      const v = /^([A-Z][A-Za-z0-9]*)\s*,?$/.exec(净);
      if (v) return 下划线(v[1]);
    }
  }
  throw new Error("`StatusMetric` 里没有任何变体标着 `#[default]`");
}

/** 界的兜底值：`ui/useStatusBar.ts` 里读那一格时写的那个。 */
function App兜底(): string {
  const m = /appearance\.status_metric \?\? "([a-z_]+)"/.exec(接线源);
  if (!m) throw new Error("`ui/useStatusBar.ts` 里找不到 `appearance.status_metric ?? \"…\"`");
  return m[1];
}

测("Rust 的默认项与 `useStatusBar` 的兜底项是同一个", () => {
  // ⚠️ 这两个值管的是两个时刻的同一件事：设置**读回来之前**那一瞬间显示哪一个。
  // 不一致的症状是"启动时先显示字符数、几十毫秒后跳成词数"——不报错，
  // 只在慢机器上看得见，而看见了也不会有人当成 bug。
  等(App兜底(), Rust默认(), "useStatusBar 的兜底与 Rust 的默认");
});

测("默认项是 `words`", () => {
  // 用户给的参考图里平时显示的就是「N 词」（`StatusMetric::Words` 那段）。
  // ⚠️ 这条是**意图**的钉，不是推导出来的——改默认值的人该看见它红。
  等(Rust默认(), "words", "默认统计量");
});

/* ── 三、菜单里四项齐全 ─────────────────────────────────────────────── */

组("三、菜单里四项一个不少");

测("`菜单次序` 覆盖全部四项", () => {
  // ⚠️ 少一项的症状是那一项**在菜单里根本没有**，而其余三项照常好用——
  // 用户只会以为"这个功能就是没有分钟"。多一项则永远没有对应的勾。
  相同(菜单次序(), TS字面量(), "菜单里的四项");
});

测("四项在菜单里不重复", () => {
  const 个 = 菜单次序();
  等(new Set(个).size, 个.length, "去重之后的项数");
});

测("菜单四项的 i18n 键都在代码里以字面量出现", () => {
  // ⚠️⚠️ 这一条拦的是一种**已经发生过**的坏法：把四个键收进一张表、
  // 用的时候 `t(表[m], 数)`。那样 `tools/i18n-check.sh`（它扫的是代码里的
  // 字符串字面量）再也看不见这四条，于是中文表里那四行会被判成"废键"、
  // 整个闸门 FAIL。实测踩过一次。
  for (const 名 of ["words", "characters", "lines", "minutes"]) {
    const 句 = `t("{0} ${名}"`;
    if (!状态栏源.includes(句)) {
      throw new Error(`\`StatusBar.tsx\` 里找不到字面量 ${句}…）——键别收进表里`);
    }
  }
});

测("那一格与菜单用的是同一份文案表", () => {
  // 同一件事不要两处各写一份。`四个` 既是菜单标签的来源，也是那一格的来源。
  if (!/\{\s*四个\[metric\]\s*\}/.test(状态栏源)) {
    throw new Error("`StatusBar.tsx` 里那一格没在用 `四个[metric]`——两处文案又分家了？");
  }
});

/* ── 收尾 ───────────────────────────────────────────────────────────── */

console.log(`\n${过} 通过 / ${败} 失败`);
if (败 > 0) {
  console.log(`失败的是：\n  · ${败的.join("\n  · ")}`);
  process.exit(1);
}
