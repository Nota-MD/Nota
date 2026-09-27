/**
 * 解析后的**明暗**，`auto` 已经落成 `light` / `dark`，而且**跟着系统变**。
 *
 * # 为什么要有个 hook
 *
 * `applyTheme` 会把结果写进 `<html data-ui-mode>`，但**读的一方**要是也想知道
 * "现在到底是亮还是暗"，就得自己再订阅一次 `matchMedia`。自己写一遍必然分叉：
 * `ui_mode = "auto"` 时用户在系统里切了深浅，应用跟着变了、而读的那一方不知道
 * （或者反过来，两边对"什么算暗"的口径不一致）。
 *
 * 所以订阅这件事只在这里做一份，需要的那两处都拿它：
 *
 * | 谁 | 拿它干什么 |
 * |---|---|
 * | 偏好设置 → 外观 | 那两张缩略图要跟应用真的长成什么样一致（2026-09-25 起） |
 * | `ui/useDocTheme.ts` | `appearance.dark_theme_separate`：深色下要不要换一套文档主题 |
 *
 * ⚠️ 判据在 `styles/applyTheme.ts` 的 `resolveMode` 里，**这里不重写**——
 * 把 `prefers-color-scheme` 再问一遍就等于第二份口径，而这两处**必须**一致：
 * 否则会出现"界面是深的、文档主题按浅色那套选"这种谁都看不懂的状态。
 */

import { useEffect, useState } from "react";

import type { UiMode } from "@/bridge/ipc";
import { resolveMode } from "@/styles/applyTheme";

export function useUiMode(mode: UiMode): "light" | "dark" {
  const [当前, set当前] = useState(() => resolveMode(mode));

  useEffect(() => {
    const paint = () => set当前(resolveMode(mode));
    paint();

    const mq = window.matchMedia?.("(prefers-color-scheme: dark)");
    // 显式选了亮 / 暗时系统偏好不算数，不必订阅（订阅了也只会白跑几趟 paint）。
    if (!mq || mode !== "auto") return;
    mq.addEventListener("change", paint);
    return () => mq.removeEventListener("change", paint);
  }, [mode]);

  return 当前;
}
