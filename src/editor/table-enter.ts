/**
 * 表格里的普通回车。
 *
 * Milkdown 的 GFM 表格键位把裸 `Enter` 和 `Mod-Enter` 都绑成“退出表格”，
 * 于是一张正在填的表里每按一次回车，光标都会跑到表后的新段落。Nota 改成：
 *
 * - 普通 `Enter`：走到下一格；已经在最后一格时加一行并落到新行第一格；
 * - `Shift+Enter`：仍由文档层处理软换行；
 * - `Mod+Enter`：仍由上游退出表格。
 *
 * 复用 `table-tab.ts` 的加行与坐标计算，避免 Tab 和 Enter 走出两套表格结构。
 */

import { $shortcut } from "@milkdown/kit/utils";
import type { Command } from "@milkdown/kit/prose/state";
import { isInTable } from "@milkdown/kit/prose/tables";

import { 表格Tab处理 } from "./table-tab";

/**
 * 表格内的普通回车命令。
 *
 * 不在表格里返回 `false`，让列表、标题、段落和代码块继续使用各自原有的回车。
 */
export const 表格回车: Command = (state, dispatch) => {
  if (!isInTable(state)) return false;
  return 表格Tab处理(state, dispatch, false);
};

/**
 * 用高优先级接管表格里的 `Enter`。
 *
 * GFM 的 `ExitTable` 没写 priority（按 50 计）。这里给 110，既压过退出表格，
 * 也高于表格自己的 `NextCell`（100）；守卫仍由 {@link 表格回车} 收到表格范围。
 */
export const 表格回车键 = $shortcut(() => ({
  Enter: { key: "Enter", onRun: () => 表格回车, priority: 110 },
}));
