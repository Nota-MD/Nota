/**
 * **窗口标题长什么样**（`ui/useWindowTitle.ts::窗口标题`）——第 51 项那条轴，
 * 加上 2026-10-04 那个开关（`appearance.show_filename_in_titlebar`，第 45 项）。
 *
 * # 跑法
 *
 * ```sh
 * npx esbuild tests/window-title.test.ts --bundle --platform=node --format=esm \
 *   --outfile=/tmp/nota-窗口标题/window-title.mjs
 * node /tmp/nota-窗口标题/window-title.mjs
 * ```
 *
 * 全过退出码 0；有不过的退出码 1，并把名字列出来。
 *
 * ⚠️ **要在仓库里跑**（不 `cd` 的话读不到 `src-tauri/tauri.conf.json`）：
 * 第三组读那份配置。
 *
 * # 为什么这条轴值得一份测试
 *
 * ⚠️ **它测不了**：`setTitle` 的结果是**窗口管理器画出来的文字**，无头流程里
 * 截图上读不到（`docs/06` §5.34 那一套能拍窗口，但标题栏那几颗字归 WM 管，
 * 拍下来的位置与字体都不由我们定）。所以那条链路唯一能钉住的就是这个**纯函数**
 * ——文件头当年就是为这句话把它单拆出来的（"好单独验"）。
 *
 * ⚠️ 三个**静默**的坏法：
 *
 * 1. 拼法变了（` •` 与 ` — ` 之间少一个空格、破折号换成短横）→ 用户说不出哪儿
 *    不对，只觉得"标题看着怪怪的"；
 * 2. 开关为假时**拼出一个半截标题**（` — Nota`，前面空着）→ 看着像 bug；
 * 3. 没开文档时漏掉那条 `null` 分支 → 标题成了 `null — Nota`（在 Rust 里会
 *    是 `"null — Nota"` 这种字符串，因为模板串照拼不误）。
 *
 * # ⚠️ 这份测试**证明不了**什么
 *
 * - **`setTitle` 真发出去了**没验：这里一行 IPC 都没有，量的是"该拼成什么"。
 * - **标题栏上真长这样**没验（见上：归窗口管理器管）。
 * - **脏标志与标签页那颗点是不是同步的**没验：那个 `•` 在标题里、
 *   `.tab-dot` 在标签栏上（`ui/TabBar.tsx`），两处都读同一个 `dirty`，
 *   但"两处都画"这件事要挂载组件才验得了。
 */

import { readFileSync } from "node:fs";

import { 窗口标题, 应用名 } from "../src/ui/useWindowTitle";

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
  if (实际 !== 期望) {
    throw new Error(`${说明}\n      实际：${JSON.stringify(实际)}\n      期望：${JSON.stringify(期望)}`);
  }
}

function 真(值: unknown, 说明: string): void {
  if (!值) throw new Error(说明);
}

/* ── 组一：开着（默认，也就是加这一项之前的样子）────────────────── */

组("组一 带文件名：`标题 • — Nota`（脏的时候多一个 `•`）");

测("没改过：`我的笔记 — Nota`", () => {
  等(窗口标题("我的笔记", false), "我的笔记 — Nota", "标题 + 破折号 + 应用名");
});

测("改过：`我的笔记 • — Nota`（`•` 与 `—` 之间是一个空格）", () => {
  // ⚠️ 那个 `•` 是**脏标志**（第 51 项："也要看得出哪一份有未保存的改动"）。
  // 拼法里两个分隔符的空格数是这条轴唯一的"格式细节"，所以逐字钉住。
  等(窗口标题("我的笔记", true), "我的笔记 • — Nota", "多一个 `•`");
});

测("标题是空串 → 也算没开文档（不留一个空荡荡的破折号）", () => {
  // ⚠️ `""` 与 `null` 是两回事：后端 `derive_title` 保证不出空串，但前端这一层
  // 不该指望它——空串拼出来是 ` • — Nota`，看着像坏了。
  等(窗口标题("", true), 应用名, "空串走「没有文档」那一支");
});

/* ── 组二：关掉之后（`show_filename_in_titlebar = false`）────────── */

组("组二 不带文件名：恒为 `Nota`");

测("有文档、脏着，也只写应用名", () => {
  // ⚠️ 关掉之后**脏标志也一起看不见了**（它拼在标题里）——这是如实的行为，
  // 已记在 `settings/appearance.rs` 那个字段上：未保存的另一处落点是
  // 标签页上那颗点（`ui/TabBar.tsx` 的 `.tab-dot`）。
  等(窗口标题("我的笔记", true, false), 应用名, "整句就是应用名");
});

测("有文档、不脏，也一样", () => {
  等(窗口标题("我的笔记", false, false), 应用名, "整句就是应用名");
});

测("没文档时两种开关值给的是**同一个**答案", () => {
  // ⚠️ 这一条盯的是"关掉那一支别拼半截"：写成 `${标题 ?? ""}${…} — Nota`
  // 那种改法，在没文档时会得到 ` — Nota`（前面空着），看着像 bug。
  等(窗口标题(null, false, false), 窗口标题(null, false, true), "两边都该是应用名");
});

测("三个参数的缺省值就是「带文件名」（老调用点一个都不用改）", () => {
  // ⚠️ `useWindowTitle` 的第三个形参有 `= true`，`窗口标题` 也有——否则
   // 别处（比如以后某个只传两个参数的调用点）会静默丢掉文件名。
  等(窗口标题("我的笔记", false), 窗口标题("我的笔记", false, true), "缺省＝带");
});

/* ── 组三：`应用名` 与 `tauri.conf.json` 必须同值 ─────────────────── */

组("组三 初值对得上：`应用名` 就是建窗时那个标题");

测("`应用名` 与 `src-tauri/tauri.conf.json` 的 `title` 逐字相同", () => {
  // ⚠️ 这两处**必须同值**：`tauri.conf.json` 那个 `title` 是**建窗时**交给窗口
  // 系统的一份拷贝，用户看到的第一个标题就是它。不一致的话，窗口一建出来写着
  // 一个名字、第一帧之后被 `useWindowTitle` 改成另一个——一个看得见的闪。
  真(
    readFileSync("src-tauri/tauri.conf.json", "utf8").includes(`"title": "${应用名}"`),
    `\`tauri.conf.json\` 里该写着 \`"title": "${应用名}"\``,
  );
});

/* ── 收尾 ─────────────────────────────────────────────────────────── */

console.log(`\n过 ${过}，败 ${败}`);
if (败 > 0) {
  console.log("没过的：");
  for (const 名 of 败的) console.log(`  · ${名}`);
  process.exit(1);
}
