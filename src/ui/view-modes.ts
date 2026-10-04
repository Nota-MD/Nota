/**
 * 三种编辑模式的**显示名**，以及它们的出厂顺序。
 *
 * ⚠️ **只有这一份**。偏好设置（`ui/settings/panes/EditorPane.tsx`）那个下拉要写
 * 这三个名字，别处再写一份的话，哪天改口径（比如「分屏预览」想叫「双栏」）
 * 就会出现"设置里和菜单里叫得不一样"——这种不一致没人会当成 bug 报上来，
 * 只会觉得这软件毛糙。
 *
 * ⚠️ 这个文件**不碰 `Settings` 也不碰编辑器**，纯粹是名字。谁想在里面加
 * "顺带把模式也切了"的逻辑，就会把设置和状态栏这两个不相干的组件绑到同一条
 * 通路上——要切换走 `App.tsx` 的 `updateSettings({ view_mode })`。
 */

import type { ViewMode } from "@/bridge/ipc";

/**
 * 显示名。
 *
 * ⚠️ **2026-09-30 之前这里是一长一短两列**（`{ short, full }`）：短的那一列
 * 专给状态栏那格字用（它右边挤着四个统计数字，「分屏预览」四个字会把那条顶宽）。
 * 用户那天照 Typora 把下栏重做之后，状态栏**不再写模式名，改成一颗 `</>`
 * 图标**，短名那一列就没有读者了——于是删掉，只留 `full`。
 *
 * ⚠️ **别再往这里加第二列**：两列名字的前提是"有两个不同的宽度约束"，
 * 而现在的约束只有一个（设置里那个下拉，宽度随便）。真需要短名时，
 * 先问那个"短"是给谁看的——只为一个临时的排版问题多养一列名字，
 * 下次改口径就得记着改两处。
 *
 * ⚠️ 写成 `Record` 而不是数组：`ViewMode` 加一个值这里就编译不过。
 */
export const VIEW_MODE_LABELS: Record<ViewMode, string> = {
  wysiwyg: "WYSIWYG",
  source: "Source Mode",
  split: "Split Preview",
};

/** 下拉里的顺序（也是「视图」菜单里的顺序）。**常用程度**排的，不是字母序。 */
export const VIEW_MODE_ORDER: ViewMode[] = ["wysiwyg", "source", "split"];
