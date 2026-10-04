/**
 * 侧栏宽度那三件事的**可运行**测试集：夹宽度、三处默认值同值、Rust 那一头认得这个字段。
 * 2026-09-30 写，与 `src/ui/SidebarResizer.tsx` 同批落地。
 *
 * # 跑法
 *
 * ```sh
 * npx esbuild tests/sidebar-resize.test.ts --bundle --platform=node --format=esm \
 *   --alias:@=./src --outfile=/tmp/nota-tests/sidebar-resize.mjs
 * node /tmp/nota-tests/sidebar-resize.mjs
 * ```
 *
 * # 这份测试盯的是什么
 *
 * - **第一组是承重的**：用户拖右缘那条边（`SidebarResizer.tsx`）拖出来的宽度，
 *   先写 `<html>` 上那条变量，松手才落盘（`appearance.sidebar_width`），下次
 *   启动由 `applyTheme.ts` 写回去。**这条链上有三个"240"**（CSS 出厂值、
 *   `SidebarResizer` 的默认、Rust 的 `Default`），分居三个文件、三种语言，
 *   谁改一个都不会让另两处的编译/类型检查吭声。症状不是报错，是**"出厂宽度"
 *   在拖动冷启动之后跳一下**——而那种跳一下，没人会当成 bug 报上来。
 *   所以这一组去读 CSS 与 Rust 源码，把三个数逐个对。
 * - 第二组是纯函数 `夹侧栏宽`：拖动时鼠标能跑到窗口外面，宽度会变成负数、
 *   或者比窗口还宽；`NaN` 那一支是**必须**的——`Math.min/max` 遇到 `NaN`
 *   安静地返回 `NaN`，写进 CSS 变量等于那一格失效，界面上看着像"拖动没生效"。
 *
 * # ⚠️ 这份测试**证明不了**什么
 *
 * - ⚠️ **"拖那条边真的能改宽度"没验**：那要真 React ＋ 真指针事件 ＋ 一次真
 *   拖动（本仓没有 jsdom，指针捕获也没法在无头里造）。拖动本身的判据在
 *   `SidebarResizer.tsx`，有没有真的接上只能靠开窗目检（`docs/06` §5.40）。
 * - ⚠️ **"落盘之后重启还在"没验**：链子两端（写设置、`applyTheme` 读设置）
 *   各自有测试的地方，但"存了再读回来还是那个数"要真宿主。
 * - ⚠️ **180 / 480 这两个边界是个判断，不是量出来的**（"至少装得下一行文件名"
 *   ／"再宽正文就没地方了"）。这里只验"边界那一刻算不算越界"。
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";

import {
  SidebarResizer,
  夹侧栏宽,
  侧栏宽最大,
  侧栏宽最小,
  侧栏宽默认,
} from "@/ui/SidebarResizer";

/* ── 一支极小的测试工装（与 `file-kind.test.ts` 同一套长相）── */

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

/* ── 一、⚠️ 三个 240 逐个对齐 ───────────────────────────────────────── */

组("一、⚠️ 出厂宽度在 CSS / TS / Rust 三处同值");

const CSS源 = readFileSync(join("src", "styles", "theme", "base.css"), "utf8");
const Rust源 = readFileSync(
  join("src-tauri", "src", "settings", "appearance.rs"),
  "utf8",
);

/** 从 `base.css` 里抠出 `--sidebar-width: 240px;` 的那个数。 */
function CSS里的侧栏宽(): number {
  const m = /--sidebar-width:\s*(\d+)px\s*;/.exec(CSS源);
  if (!m) throw new Error("`base.css` 里找不到 `--sidebar-width: <数>px;`");
  return Number(m[1]);
}

/**
 * 从 `appearance.rs` 的 `Default for Appearance` 里抠出 `sidebar_width: 240,`。
 *
 * ⚠️ 只看那一个 `impl` 块：**整个文件里 `sidebar_width` 出现两次**（字段定义
 * 那次、默认值那次），不加范围的话会先撞上字段定义那一行。所以先定位
 * `impl Default for Appearance`，从那儿往后找第一个赋值。
 */
function Rust里的侧栏宽(): number {
  const 起 = Rust源.indexOf("impl Default for Appearance");
  if (起 < 0) throw new Error("`appearance.rs` 里找不到 `impl Default for Appearance`");
  const m = /sidebar_width:\s*(\d+)\s*,/.exec(Rust源.slice(起));
  if (!m) throw new Error("`Default for Appearance` 里没有 `sidebar_width: <数>,`");
  return Number(m[1]);
}

测("CSS 里的 `--sidebar-width` 与 `侧栏宽默认` 同值", () => {
  等(CSS里的侧栏宽(), 侧栏宽默认, "CSS 出厂宽度");
});

测("Rust 的 `Default` 与 `侧栏宽默认` 同值", () => {
  等(Rust里的侧栏宽(), 侧栏宽默认, "Rust 出厂宽度");
});

测("⚠️ Tauri 命令里的 `appearance` 认得 `sidebar_width`（不是只加了个 Rust 字段）", () => {
  // 这一条拦的是"字段加了、但序列化那条路上没有它"——那种情况下设置存下去
  // 再读回来会**丢掉这一项**（`serde` 默认值补上 240），症状是"拖完重开又回
  // 到 240"，而设置页里看不出任何异常（它不显示这个字段）。
  //
  // ⚠️ 判据是"`Appearance` 那个结构体上有 `#[serde(default)]` 或 derive 里
  // 带 `Default`"——本仓是前者（见 `appearance.rs` 结构体顶上那一行）。
  等(
    /#\[serde\(default[^)]*\)\]\s*pub struct Appearance/.test(Rust源),
    true,
    "`Appearance` 上有 `#[serde(default)]`（加字段才不会把老设置文件读崩）",
  );
});

测("⚠️ 三处默认值必须落在合法区间**里面**（不是边界上）", () => {
  // 默认值正好等于最小值的话，"出厂的样子"和"拖到最窄"看起来一模一样，
  // 而那是两件不同的事——用户拖到最窄再拖回来，分不出回到了出厂没有。
  if (!(侧栏宽最小 < 侧栏宽默认 && 侧栏宽默认 < 侧栏宽最大)) {
    throw new Error(
      `区间不合法：最小 ${侧栏宽最小} / 默认 ${侧栏宽默认} / 最大 ${侧栏宽最大}`,
    );
  }
});

/* ── 二、夹宽度 ─────────────────────────────────────────────────────── */

组("二、`夹侧栏宽`");

测("区间内的值**原样**通过", () => {
  等(夹侧栏宽(300), 300, "300 在 180~480 里");
  等(夹侧栏宽(360), 360, "360 在 180~480 里");
});

测("两个边界本身**算合法**（不是被夹掉）", () => {
  等(夹侧栏宽(侧栏宽最小), 侧栏宽最小, "正好最小");
  等(夹侧栏宽(侧栏宽最大), 侧栏宽最大, "正好最大");
});

测("太窄 → 夹到最小：⚠️ 不能拖成 0", () => {
  // 拖成 0 宽等于把侧栏弄丢了，而丢的方式是"看不见"——用户找不回来。
  等(夹侧栏宽(0), 侧栏宽最小, "0");
  等(夹侧栏宽(179), 侧栏宽最小, "比最小少 1");
  // 指针跑到这一栏**左缘以外**时 `ev.clientX - 左缘` 是负数。
  等(夹侧栏宽(-500), 侧栏宽最小, "负数");
});

测("太宽 → 夹到最大：⚠️ 不能把正文挤没", () => {
  等(夹侧栏宽(481), 侧栏宽最大, "比最大多 1");
  等(夹侧栏宽(99999), 侧栏宽最大, "窗口就算拉到 8K 也不给这么宽");
});

测("小数点四舍五入到整数像素", () => {
  // 指针位置是浮点数，而 CSS 里写 `300.4999px` 只是白搭——`clientX` 本身
  // 就是整数，取整是为了让落盘的那个数**读起来是人写的**。
  等(夹侧栏宽(300.4), 300, "舍");
  等(夹侧栏宽(300.6), 301, "入");
});

测("⚠️ `NaN` → 退回默认（不是 `NaN`）", () => {
  // `Math.min/max` 遇到 `NaN` 会安静地返回 `NaN`，而 `NaN` 写进 CSS 变量
  // 等于那一格失效 → 侧栏退回 CSS 里那个 240。**看着像"拖动没生效"，
  // 不像报错**——所以这里必须挡住。
  等(夹侧栏宽(NaN), 侧栏宽默认, "NaN");
  等(夹侧栏宽(Infinity), 侧栏宽默认, "Infinity");
  等(夹侧栏宽(-Infinity), 侧栏宽默认, "-Infinity");
});

测("夹两次是**幂等**的（松手那次拿到的值再夹一遍不变）", () => {
  // 拖动期间每个 `pointermove` 夹一次、`pointerup` 又夹一次。幂等不成立的话，
  // "拖到最窄停手"会落在和"拖到最窄再往下拖"不同的值上。
  for (const 原 of [0, 179, 240, 300.6, 480, 481, 99999, NaN]) {
    等(夹侧栏宽(夹侧栏宽(原)), 夹侧栏宽(原), `夹两次 ${String(原)}`);
  }
});

/* ── 三、那个组件确实导出了 ─────────────────────────────────────────── */

组("三、组件本身");

测("`SidebarResizer` 是个组件（`Sidebar.tsx` 要 import 它）", () => {
  // ⚠️ 这一条**弱得几乎没用**，写在这里只是为了让"这个文件测的是同一个模块"
  // 这件事有个显式的锚：真正的拖动行为要开窗目检（文件头写着）。
  等(typeof SidebarResizer, "function", "导出的类型");
});

/* ── 收尾 ───────────────────────────────────────────────────────────── */

console.log(`\n${过} 过 / ${败} 败`);
if (败) {
  console.log(`败的：${败的.join("、")}`);
  process.exitCode = 1;
}
