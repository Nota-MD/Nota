/**
 * 专注模式的**压暗强度**（`appearance.focus_mode_dim`，三档）落到 `<html>` 上：
 *
 * ```text
 * <html data-focus-dim="strong">      ← 只有非标准那两档才落
 * ```
 *
 * 三档的实际数值在 `styles/editor.css`（`--focus-dim`），**不在这里**——
 * 这个 hook 只负责"把用户选的那一档告诉 CSS"，一处判默认值、一处判属性名。
 *
 * # 为什么是 DOM 属性，不是编辑器参数
 *
 * 同 `ui/useCodeBlockPrefs.ts` 那段：拨这一档**不重建编辑器**。它是**边看边调**
 * 的东西（用户会开着专注模式把三档挨个试一遍看哪档合适），走 `createEditor`
 * 的参数就得进 `EditorPane` 那个 effect 的依赖，一进依赖就是"拨一下 = 拆掉
 * 重装"——撤销栈清空、光标回到文首。
 *
 * # ⚠️ 默认那一档**不落属性**
 *
 * 同 `useCodeBlockPrefs` 的取舍：默认态 HTML 上是干净的 `<html>`（CSS 里
 * `:root` 那行写的就是标准档）。好处是排障时不必分辨"属性没写"与"属性写了
 * 默认值"。代价是默认值在两边各写一份（`settings/appearance.rs::Default`
 * 与 `styles/editor.css` 的 `:root`）——**改默认值时两处一起改**。
 *
 * # ⚠️ 它只管正文那一半
 *
 * 专注模式另有一半是"把外壳收起来"（菜单栏/侧栏/插件栏/标签栏/状态栏），
 * 那一条在 `ui/useImmersive.ts` 与 `styles/app.css` 的「沉浸模式」那一节，
 * **与压暗强度无关**（收不收外壳不改变"别处的字压多暗"）。
 * 两半的划分写在 `editor/writing-modes.ts` 的文件头。
 */

import { useEffect } from "react";

import type { Settings } from "@/bridge/ipc";

/** 默认那一档。⚠️ 必须与 `settings/appearance.rs::FocusDim::default()` 同值。 */
const defaultLevel = "standard";

export function useFocusDim(settings: Settings | null): void {
  useEffect(() => {
    // ⚠️ `settings` 为 `null`（还没读回来 / 读失败）时**按默认值落**，
    // 也就是把属性摘掉。不要"什么都不做"——那会让上一份设置的属性留在
    // `<html>` 上：换设置文件（或恢复默认）之后界面还带着老值，
    // "设置没生效"的症状里最难查的那一种。
    const level = settings?.appearance.focus_mode_dim ?? defaultLevel;
    const root = document.documentElement;
    if (level === defaultLevel) root.removeAttribute("data-focus-dim");
    else root.setAttribute("data-focus-dim", level);
  }, [settings]);
}
