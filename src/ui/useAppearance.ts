/**
 * 「外观」那两条轴的接线：**界面主题落进 `<html>`** ＋ **缩放落到 webview**。
 *
 * # 为什么这两件合成一处
 *
 * 它们是同一页（偏好设置 → 外观）的两条轴，落点却完全不同——一条写 DOM 属性、
 * 一条调 webview。分开住的时候，改「外观」这一页的人要在 `App.tsx` 里找两处，
 * 而两处离得很远。合成一个 hook 之后，"外观这一页在代码里对应的就是这里"。
 *
 * ⚠️ **`appearance` 那半张表不在这里**（状态栏、格式化工具栏、阅读速度、
 * 深色主题那一对…）：那些各有各的读者，散在
 * `styles/applyTheme.ts` / `ui/useChromeVisibility.ts` / `ui/StatusBar.tsx`。
 * 本文件只管**两条轴**：界面主题与缩放。
 *
 * ⚠️ **「字体大小」是半条例外**（2026-09-26）：那个值平时仍然由
 * `styles/applyTheme.ts` 落进 `<html>`（它要处理"自动 / 自定义"两档），
 * 但 **Ctrl+滚轮把目标选成字号**时，`ui/useZoom.ts` 会**立刻**再写一遍那格
 * 变量、并把 `custom_font_size` 打开。两处的分工写在 `ui/useZoom.ts` 头上。
 *
 * ⚠️ **文档主题（`.editor-pane` 底下那套）不在这里**，那是
 * `ui/useDocTheme.ts`。2026-09-23 划的线：界面风格与文档风格是两件事，
 * 混进一个 hook 就是那条线在代码里的又一次糊掉。
 *
 * 位置约束（写在调用处）：**必须在 `updateSettings` 之后**——缩放那一档
 * （Ctrl+滚轮）要落盘。
 */

import { useEffect } from "react";

import type { Settings } from "@/bridge/ipc";
import { applyTheme } from "@/styles/applyTheme";
import { useZoom, type 缩放动作 } from "@/ui/useZoom";

export function useAppearance(
  settings: Settings | null,
  updateSettings: (patch: Partial<Settings>) => Promise<void>,
): 缩放动作 {
  useEffect(() => {
    // ⚠️ 必须把 `applyTheme` 返回的退订函数交出去。`ui_mode = "auto"` 时它挂了一个
    // `matchMedia` 监听，不接返回值就等于每次 settings 变化都再挂一个、旧的从不移除
    //（BUG-7）。`paint()` 幂等所以症状不明显，只是监听器越积越多。
    if (settings) return applyTheme(settings);
  }, [settings]);

  // 缩放与字号（`appearance.zoom` / `ui_font_size` ＋ Ctrl+滚轮那一档）。
  // 为什么走 `webview.setZoom()` 而不是 CSS、滚轮为什么得自己写、
  // **滚轮改的是字号还是缩放**，都在 `ui/useZoom.ts` 的文件头。
  //
  // ⚠️ 传的是**整份 settings**、不是 `settings.appearance`：滚轮改字号那一档要
  // 读**顶层**的 `ui_font_size`（2026-09-26 加第二条轴时改的形参）。
  //
  // ⚠️ 返回值**原样交出去**（不在这里拆成三个函数再拼一个对象）：`useZoom`
  // 那边是 `useMemo` 出来的，身份已经稳定；在这儿再拼一层就等于每帧一个新对象，
  // 而它要进 `ui/useCommandTable.ts` 那张表的依赖数组。为什么**这里**可以传一个
  // 对象、而剪贴板那四件必须拆开（`useCommandTable.ts` 的 `命令表输入` 里写着），
  // 差别就在这一行：那个对象的身份不稳，这个稳。
  return useZoom(settings, updateSettings);
}
