/**
 * `src/ui/useTablistKeys.ts` 页签方向键**纯逻辑**（`页签下一个`）的可运行测试集。
 * 2026-10-04 写，与那个文件同批落地（`docs/07` backlog 第 50 项）。
 *
 * # 跑法（不装任何包）
 *
 * ```sh
 * npx esbuild tests/tablist-keys.test.ts --bundle --platform=node --format=esm \
 *   --outfile=/tmp/nota-测试/tablist-keys.mjs
 * node /tmp/nota-测试/tablist-keys.mjs
 * ```
 *
 * # 这份测试盯的是什么
 *
 * 方向键的**下标算术**：绕圈、头尾、不认的键。口诀与菜单漫游（`findNextEnabled`）
 * 不同处在于页签没有"灰"这一说（`TabBar` / `Sidebar` 的页签永远可用），
 * 所以这里只有纯下标——复杂度全在"绕圈要不要回 0"那一处。
 *
 * # ⚠️ 这份测试**证明不了**什么
 *
 * - **钩子真的监听了容器、真的把焦点挪了**没验：那要真 DOM ＋ 真
 *   `document.activeElement`（本仓没有 jsdom）。接线由 `npx tsc --noEmit`
 *   与开窗目检兜着（`docs/06` §5 的本批那格）。
 * - **「手动激活」的口径没验**（方向键只挪焦点、Enter 由 `<button>` 自己点）：
 *   那是 `useTablistKeys` 压根没接 `onSelect` 这件事，纯函数层面无从验证。
 * - **两颗落点（`TabBar` 的页签里包着标签钮＋关闭钮）走哪个**没验：
 *   `落点()` 是 DOM 查询的活。
 */

/* ── 最小工装（与 `toc.test.ts` 同一套，本仓没有测试框架）──────────────── */

let 通过 = 0;
let 失败 = 0;
const 失败清单: string[] = [];
let 当前组 = "";

function 组(名: string): void {
  当前组 = 名;
  console.log(`\n── ${名} ${"─".repeat(Math.max(0, 56 - 名.length))}`);
}

function 测(名称: string, 体: () => void): void {
  try {
    体();
    通过++;
    console.log(`  ✔ ${名称}`);
  } catch (e) {
    失败++;
    失败清单.push(`${当前组} / ${名称}`);
    console.log(`  ✘ ${名称}`);
    console.log(`      ${e instanceof Error ? e.message : String(e)}`);
  }
}

function 等(实际: unknown, 期望: unknown, 说明: string): void {
  const a = JSON.stringify(实际);
  const b = JSON.stringify(期望);
  if (a !== b) throw new Error(`${说明}：期望 ${b}，实际 ${a}`);
}

/* ── 被测 ─────────────────────────────────────────────────────────────── */

import { 页签下一个 } from "../src/ui/useTablistKeys";

/* ── 一、边界 ─────────────────────────────────────────────────────────── */

组("一、边界");

测("没有页签 → -1", () => {
  等(页签下一个(0, 0, "ArrowRight"), -1, "空 tablist");
});

测("不认的键 → -1（调用方据此早退，不拦）", () => {
  等(页签下一个(3, 1, "ArrowDown"), -1, "方向键只有左右");
  等(页签下一个(3, 1, "Escape"), -1, "别的键更不该接");
});

/* ── 二、Home / End ───────────────────────────────────────────────────── */

组("二、Home / End 跳头尾");

测("Home 回第一颗、End 到最后一颗（不管现在在哪）", () => {
  等(页签下一个(5, 3, "Home"), 0, "Home");
  等(页签下一个(5, 0, "End"), 4, "End");
});

/* ── 三、左右与绕圈 ───────────────────────────────────────────────────── */

组("三、左右与绕圈");

测("右/左各走一步", () => {
  等(页签下一个(5, 1, "ArrowRight"), 2, "向右");
  等(页签下一个(5, 3, "ArrowLeft"), 2, "向左");
});

测("两端绕圈：最后一颗再往右回第一颗，第一颗往左到最后一颗", () => {
  等(页签下一个(5, 4, "ArrowRight"), 0, "尾部绕回头部");
  等(页签下一个(5, 0, "ArrowLeft"), 4, "头部绕到尾部");
});

测("只有一颗：怎么按都还在原地（下标 0）", () => {
  等(页签下一个(1, 0, "ArrowRight"), 0, "右");
  等(页签下一个(1, 0, "ArrowLeft"), 0, "左");
});

/* ── 收尾 ─────────────────────────────────────────────────────────────── */

console.log(`\n${"═".repeat(56)}`);
console.log(`通过 ${通过}，失败 ${失败}`);
if (失败 > 0) {
  console.log(`失败清单：\n  ${失败清单.join("\n  ")}`);
  process.exit(1);
}
