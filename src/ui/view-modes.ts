/**
 * 三种编辑模式的**显示名**，以及它们的出厂顺序。
 *
 * ⚠️ **只有这一份**。状态栏（`ui/StatusBar.tsx`）与偏好设置（`ui/settings/panes/EditorPane.tsx`）
 * 都要写这三个名字，各写一份的话，哪天改口径（比如「分屏预览」想叫「双栏」）
 * 就会出现"状态栏和设置里叫得不一样"——这种不一致没人会当成 bug 报上来，
 * 只会觉得这软件毛糙。
 *
 * ⚠️ 这个文件**不碰 `Settings` 也不碰编辑器**，纯粹是名字。谁想在里面加
 * "顺带把模式也切了"的逻辑，就会把状态栏和偏好设置这两个不相干的组件
 * 绑到同一条通路上——要切换走 `App.tsx` 的 `updateSettings({ view_mode })`。
 */

import type { ViewMode } from "@/bridge/ipc";

/**
 * 显示名，**一长一短两个**。
 *
 * ⚠️ 不是"两套名字"，是同一句话的两种长度：状态栏那格只有一格宽、右边还挤着
 * 四个统计数字，写「分屏预览」会把状态栏顶宽；而下拉框里「分屏」孤零零两个字
 * 又看不出它和源码模式什么关系。所以同表里两列，**词是同一批词**。
 *
 * ⚠️ 写成 `Record` 而不是数组：`ViewMode` 加一个值这里就编译不过。
 */
export const VIEW_MODE_LABELS: Record<ViewMode, { short: string; full: string }> = {
  wysiwyg: { short: "所见即所得", full: "所见即所得" },
  source: { short: "源码", full: "源码模式" },
  split: { short: "分屏", full: "分屏预览" },
};

/** 下拉里的顺序（也是「视图」菜单里的顺序）。**常用程度**排的，不是字母序。 */
export const VIEW_MODE_ORDER: ViewMode[] = ["wysiwyg", "source", "split"];
