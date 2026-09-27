/**
 * `src/editor/instant-render.ts` 里 `标题徽标`（"这一块标题在左边装订线里
 * 显示成哪一个 `H几`"）的**可运行**测试集。
 *
 * # 跑法（不装任何包：`esbuild` 与 `node` 仓库里都现成）
 *
 * ```sh
 * cd <仓库>
 * npx esbuild tests/instant-render.test.ts --bundle --platform=node --format=esm \
 *   --outfile=/tmp/nota-instant-render-test/instant-render.test.mjs
 * node /tmp/nota-instant-render-test/instant-render.test.mjs
 * ```
 *
 * 全过退出码 0；有不过的退出码 1，并把名字列出来。
 *
 * # 这份测试是为什么写的（2026-09-26）
 *
 * 用户原话：「标题输入后，前面的半透明 “#” 改成 H 几的这样的小图标吧」。
 * 改之前是 `"#".repeat(level)`（照原样显示井号），改之后是 `H1`…`H6` 一颗徽标。
 *
 * ⚠️ 这是**本插件唯一一处"不照原样显示标记"**的地方（文件头写着它的立身之本
 * 是"把编辑器吃掉的标记还给用户看"）。所以这里要钉住的不是"画得好不好看"，
 * 而是**它不许撒谎**：层级越界（`0` / `7` / `null` / 字符串 / `NaN`）时宁可
 * 并到边界那一档，也不许出现文档里不存在的 `H0` / `H7`。
 *
 * # ⚠️ 这份测试**证明不了**什么
 *
 * 它证明不了：装饰有没有真挂上 DOM、徽标那颗淡色底画成什么样、位置与字号跟
 * 不跟着块走、`color-mix` 在这个 WebKitGTK 上认不认。那些一律是**目检**的事
 *（见 `docs/06` §5 那几节）。
 */

import { 标题徽标 } from "../src/editor/instant-render";

/* ── 极小的测试工装（与 `mark-hint.test.ts` 同一套长相）───────────────── */

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

/* ── 第 1 组：六档都认得出来（这是这个功能的全部用处）────────────────── */

组("六档");

for (const 档 of [1, 2, 3, 4, 5, 6]) {
  测(`level ${档} → H${档}`, () => {
    等(标题徽标(档), `H${档}`, "徽标文字");
  });
}

测("六档**各不相同**（漏掉一档的症状是「两级标题看起来一样」）", () => {
  const 全部 = [1, 2, 3, 4, 5, 6].map((档) => 标题徽标(档));
  等(new Set(全部).size, 6, "不重复的个数");
});

测("`1` 的徽标是 `H1`，不是 `#`（这条钉的是用户那次改动本身）", () => {
  //  ⚠️ 改回井号实现时**这一条会红**——那正是它存在的意思。要回退这个功能，
  //     得连这条用例一起删，而不是让它悄悄变绿。
  等(标题徽标(1), "H1", "徽标文字");
});

/* ── 第 2 组：越界的层级并到边界，不造出文档里没有的档 ───────────────── */

组("越界（徽标撒谎比徽标缺失更糟）");

测("level 7 → H6（CommonMark 只有六档）", () => {
  等(标题徽标(7), "H6", "徽标文字");
});

测("level 0 → H1", () => {
  等(标题徽标(0), "H1", "徽标文字");
});

测("level -3 → H1", () => {
  等(标题徽标(-3), "H1", "徽标文字");
});

测("`null` / `undefined` → H1（`attrs.level` 没写时的兜底）", () => {
  等(标题徽标(null), "H1", "null");
  等(标题徽标(undefined), "H1", "undefined");
});

测("`NaN` / 字符串 `\"x\"` → H1（不是 `HNaN`）", () => {
  等(标题徽标(Number.NaN), "H1", "NaN");
  等(标题徽标("x"), "H1", "字符串");
});

测("数字字符串 `\"3\"` 认（宿主/插件塞进来的是字符串时也画对）", () => {
  等(标题徽标("3"), "H3", "徽标文字");
});

测("小数 `2.8` 往下取整成 H2（不出现 `H2.8`）", () => {
  等(标题徽标(2.8), "H2", "徽标文字");
});

测("`H0` / `H7` 这两种字符串**一个都造不出来**", () => {
  const 造得出 = [null, undefined, 0, 7, -1, 99, Number.NaN, "x", 2.8]
    .map((v) => 标题徽标(v));
  for (const 文字 of 造得出) {
    if (文字 === "H0" || 文字 === "H7") throw new Error(`造出了 ${文字}`);
  }
});

/* ── 第 3 组：形状（属性值直接进 CSS 的 `content: attr()`）────────────── */

组("形状");

测("一律 `H` 开头、后面只有数字（它直接进 `content: attr(data-srcmark)`）", () => {
  for (const 档 of [1, 2, 3, 4, 5, 6]) {
    if (!/^H[1-6]$/.test(标题徽标(档))) throw new Error(`形状不对：${标题徽标(档)}`);
  }
});

/* ── 收尾 ─────────────────────────────────────────────────────────────── */

console.log(`\n${"─".repeat(64)}`);
console.log(`通过 ${过} 条，失败 ${败} 条`);
if (败) {
  console.log(`失败的：\n  - ${败的.join("\n  - ")}`);
  process.exitCode = 1;
}
