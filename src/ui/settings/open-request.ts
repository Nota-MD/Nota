/**
 * **"把设置窗开到某一页"的一次性请求**（2026-10-11）。
 *
 * # 它为什么存在（而不是走 props）
 *
 * 状态栏那个「选择拼写检查语言」菜单底下多了一条「全局设置…」（用户点名照 Typora
 * 做的那份菜单）：点它要打开设置窗、并**直接落在「编辑器」那一页**。
 *
 * 打开设置窗那一半是现成的（`App.tsx` 的 `setSettingsOpen`），但"落在哪一页"
 * 是 `SettingsDialog` **自己的** `useState`（那是对的：切页是一次交互，不该进
 * settings 文件）。要把"哪一页"从状态栏送进去，只有三条路：
 *
 * 1. 一路加 props：状态栏 → `useStatusBar` → `EditorArea` → `App` → `SettingsDialog`
 *    ——⚠️ 中间那几层**一个都不关心**这件事，而且 `App.tsx` 当时 **998 行**
 *    （硬线 1000），加不动；
 * 2. 把"哪一页"塞进 `Settings`：那是**多一份真相**，还会跟着落盘；
 * 3. **一个一次性信箱**：请求方投一条，`SettingsDialog` 挂载时取走一条。
 *
 * 选 3。⚠️ **它是一次性的**（取走就清空），所以"上次从哪儿点的"不会留在内存里
 * 影响下一次：用户下次用菜单打开设置时，看到的仍是默认的「外观」那一页。
 *
 * ⚠️ 这个文件**故意小得可怜**：它不是状态管理器，是"一次点击到一次挂载"之间
 * 的一段路。要传第二件事之前先问"是不是该把那一件事也做成 props"。
 */

import type { SectionId } from "@/ui/settings/SettingsDialog";

/** 还没被取走的那一条请求。`null` = 没有（下次开设置窗落在默认页）。 */
let 待取: SectionId | null = null;

/** 投一条请求：下一次设置窗打开时落在这一页。 */
export function 请求设置页(页: SectionId): void {
  待取 = 页;
}

/** 取走（并清空）那一条请求。`null` = 没人在等这一页。 */
export function 取设置页请求(): SectionId | null {
  const 值 = 待取;
  待取 = null;
  return 值;
}
