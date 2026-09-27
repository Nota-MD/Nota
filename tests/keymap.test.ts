/**
 * `ui/accel.ts::accelToText` 与 `ui/commands.ts::应用键位覆盖` 的**可运行**测试集。
 * 2026-09-27 写，与「设置里加一块『快捷键』」那批同批落地（用户点名要的）。
 *
 * # 跑法（不装任何包：`esbuild` 与 `node` 仓库里都现成）
 *
 * ```sh
 * cd <仓库>
 * npx esbuild tests/keymap.test.ts --bundle --platform=node --format=esm \
 *   --alias:@=./src --outfile=/tmp/nota-测试/keymap.mjs
 * node /tmp/nota-测试/keymap.mjs
 * ```
 *
 * ⚠️ `--alias:@=./src` 不能省：这两个模块都从 `@/…` 进。也**只有**它——
 * 不需要假 DOM，这里的每一个函数都是纯的（`eventAccel` 要 `KeyboardEvent`，
 * 但这一份测的是"已经解析好的一条 `Accel` 怎么变回文本"，不经过事件）。
 *
 * # 三组判据
 *
 * - **一、写回设置的文本**：`accelToText` 出来的串必须**能被 `parseAccel` 读回来**
 *   且读回同一个键位（这条是承重的：读不回来 ＝ 用户改完重启就静默失效）；
 * - **二、三种"不该绑"**：光按修饰键、写不回去的键名、不带修饰的单字符；
 * - **三、覆盖表怎么叠到菜单上**：没改过 / 换成别的 / 空串＝摘掉 / 认不出的 id。
 *
 * # ⚠️ 这份测试**证明不了**什么
 *
 * - **真按一下键会怎么样没验**：录制那段是 `ShortcutsPane` 里的一个
 *   `window.addEventListener("keydown", …)`，要真 DOM ＋ 真键盘事件。
 *   这里只验"从 `Accel` 到文本"这半截，另一半（`eventAccel`）是 `ui/accel.ts`
 *   自己的老代码、另有 `tools/menu-harness` 那份试验台在管。
 * - **界面那一格画得对不对没验**：撞车提示、录制态的样式、按钮该不该出现，
 *   都是开窗目检的事。
 * - **存盘没验**：这里不碰 `settings.toml`；那一侧是 `settings/keys.rs` 的
 *   四条 Rust 测试在管。
 */

import { accelSig, accelToText, parseAccel, type Accel } from "@/ui/accel";
import { 应用键位覆盖, type MenuSpec } from "@/ui/commands";

let 过 = 0;
let 败 = 0;
const 失败明细: string[] = [];

function 判(条件: boolean, 说明: string) {
  if (条件) {
    过++;
  } else {
    败++;
    失败明细.push(说明);
  }
}

function 等于(实际: unknown, 期望: unknown, 说明: string) {
  判(
    JSON.stringify(实际) === JSON.stringify(期望),
    `${说明}：期望 ${JSON.stringify(期望)}，实际 ${JSON.stringify(实际)}`,
  );
}

/** 手搓一条 `Accel`。省得每个用例都写全四个字段。 */
function A(key: string, mods: { ctrl?: boolean; shift?: boolean; alt?: boolean } = {}): Accel {
  return { ctrl: !!mods.ctrl, shift: !!mods.shift, alt: !!mods.alt, key };
}

// ── 一、写回设置的文本 ────────────────────────────────────────────────────

// ⚠️ **这一组是承重的**：`accelToText` 的返回值会被存进 `settings.toml`，
// 下次启动由 `parseAccel` 读回来。这一对但凡有一边不闭合，用户改完之后
// 重启，那条快捷键就**静默失效**——不报错、界面上还写着新键位。
for (const a of [
  A("s", { ctrl: true }),
  A("s", { ctrl: true, shift: true }),
  A("k", { ctrl: true, alt: true }),
  A("5", { alt: true, shift: true }),
  A("f8"),
  A("f11"),
  A("arrowup", { alt: true }),
  A("escape"),
  A("backspace", { ctrl: true }),
]) {
  const 文本 = accelToText(a);
  判(文本 !== null, `这一条该是可写的：${JSON.stringify(a)}`);
  if (文本 === null) continue;
  const 回来 = parseAccel(文本);
  判(回来 !== null, `写出来的 "${文本}" 必须能被 parseAccel 读回来`);
  if (回来) 等于(accelSig(回来), accelSig(a), `"${文本}" 读回来该是同一个键位`);
}

等于(accelToText(A("s", { ctrl: true, shift: true })), "Ctrl+Shift+S", "基本写法");
// ⚠️ 顺序**写死**在这里：`formatAccel`（显示）在 mac 上是 ⌥⇧⌘，而存盘那串
// 必须是**哪台机器都读得回来**的。顺序一旦摇摆，同一份设置在两台机器上
// 会存出两个样子，diff 起来一片噪音。
等于(accelToText(A("k", { ctrl: true, shift: true, alt: true })), "Ctrl+Shift+Alt+K", "顺序");
等于(accelToText(A("f8")), "F8", "功能键原样大写");
等于(accelToText(A("arrowup", { alt: true })), "Alt+ArrowUp", "方向键写词不写字形");
等于(accelToText(A(",", { ctrl: true })), "Ctrl+,", "逗号这类单字符");

// ── 二、三种"不该绑" ──────────────────────────────────────────────────────

// 光按修饰键：`eventKey` 对 ControlLeft 给的就是 "control"。
for (const k of ["control", "shift", "alt", "meta", "os"]) {
  等于(accelToText(A(k)), null, `光按 ${k} 不算一个键位`);
}

// 写不回去的键名。⚠️ 空格这一条尤其要紧：`parseAccel` 的词法是 `+` 分隔，
// 而它会 `trim` 每一段——所以 `"Ctrl+ "` 读回来只剩 `Ctrl`，是个残废。
等于(accelToText(A(" ")), null, "空格键写不回去");
等于(accelToText(A(" ", { ctrl: true })), null, "Ctrl+空格 也写不回去");
等于(accelToText(A("+", { ctrl: true })), null, "加号键写不回去");

// 不带修饰键的单个可见字符 —— 打字就触发的那种。
等于(accelToText(A("a")), null, "光一个 a 不该能绑");
等于(accelToText(A("1")), null, "光一个 1 不该能绑");
// ⚠️ 反过来的那一半：**功能键不带修饰是正当的**。全仓默认键位里就有
// `F8` / `F9` / `F11` 三条，所以判据不能写成"必须带修饰键"。
等于(accelToText(A("f9")), "F9", "F 键不带修饰是正当的");
等于(accelToText(A("escape")), "Escape", "Escape 同理");

// ── 三、覆盖表怎么叠到菜单上 ──────────────────────────────────────────────

const 假菜单: MenuSpec[] = [
  {
    id: "file",
    label: "文件",
    items: [
      { id: "file.save", label: "保存", accel: "Ctrl+S" },
      { id: "file.saveAs", label: "另存为…", accel: "Ctrl+Shift+S" },
      { id: "file.noKey", label: "没有键位的命令" },
      { id: "file.export", label: "导出", submenu: [{ id: "file.exportHtml", label: "HTML", accel: "Ctrl+E" }] },
    ],
  },
];

// ⚠️ 没改过时**原样返回同一个引用**：`App.tsx` 靠它的身份喂原生菜单栏，
// 每次都换一个新数组等于每帧往系统菜单推一遍。
判(应用键位覆盖(假菜单, {}) === 假菜单, "没改过时该原样返回入参（引用相同）");

const 改过 = 应用键位覆盖(假菜单, { "file.save": "Ctrl+Alt+S" });
等于(改过[0].items[0].accel, "Ctrl+Alt+S", "改过的换成新键位");
等于(改过[0].items[1].accel, "Ctrl+Shift+S", "没改过的保持默认");
判(改过 !== 假菜单, "改过时该返回新表");
等于(假菜单[0].items[0].accel, "Ctrl+S", "原表**一个字节都不能动**（纯函数）");

// ⚠️ 空串 ＝ "这条不要快捷键"。摘掉 `accel` 字段，不是设成空串——
// 空串会被 `parseAccel` 判成 null，两条路看着一样，但菜单上那颗
// `formatAccel("")` 会画出一个空格子（`formatAccel` 对认不出的原样返回）。
const 摘掉 = 应用键位覆盖(假菜单, { "file.save": "" });
判(!("accel" in 摘掉[0].items[0]), "空串该把 accel 整个摘掉");
等于(摘掉[0].items[0].label, "保存", "摘 accel 不该碰别的字段");

// 认不出的 id：静默丢弃，不报错、也不往表里凭空加东西。
const 多余 = 应用键位覆盖(假菜单, { "file.已经没有了": "Ctrl+Q" });
等于(多余[0].items.length, 假菜单[0].items.length, "认不出的 id 不该改出新的条目");

// 子菜单里的项照样能改（`walkMenuItems` 走深度优先，覆盖是按 id 查的）。
const 子 = 应用键位覆盖(假菜单, { "file.exportHtml": "Ctrl+Alt+E" });
const 父项 = 子[0].items[3] as { id: string; submenu?: Array<{ id: string; accel?: string }> };
等于(父项.submenu?.[0].accel, "Ctrl+Alt+E", "子菜单里的项也能改");

// ⚠️ 顺带钉住一件事：**顶层那条带 submenu 的项自己不该被当成命令**。
// `ShortcutsPane` 靠 `可绑定()` 把它筛掉，而那个判据依赖的是 `submenu` 字段
// 还在——上面那次 `{...叠一项(e), ...(e.submenu ? … : {})}` 展开时不能把它弄丢。
判(Array.isArray(父项.submenu) && 父项.submenu.length === 1, "展开时 submenu 不能丢");

// ── 汇总 ──────────────────────────────────────────────────────────────────

if (失败明细.length) {
  console.log("失败明细：");
  for (const 条 of 失败明细) console.log("  · " + 条);
}
console.log(`通过 ${过} 条，失败 ${败} 条`);
if (败 > 0) process.exitCode = 1;
