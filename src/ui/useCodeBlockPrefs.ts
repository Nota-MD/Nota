/**
 * 代码块那四条外观偏好，**落到 `<html>` 的 `data-*` 上**：
 *
 * ```text
 * <html data-code-line-numbers="on" data-code-wrap="off"
 *       data-code-toolbar="off" data-code-lang-picker="off">
 * ```
 *
 * | 开关（都在 `[markdown]` 表） | 属性 | 默认 | 管什么 |
 * |---|---|---|---|
 * | `code_line_numbers` | `data-code-line-numbers` | **关** | 块内左边那条行号装订线 |
 * | `code_wrap` | `data-code-wrap` | 开 | 长行自动换行（关掉则横向滚动） |
 * | `code_toolbar` | `data-code-toolbar` | 开 | 块**下面**那条「折叠 / 复制」，在左 |
 * | `code_language_picker` | `data-code-lang-picker` | 开 | 块**下面**那颗语言选择框，在右 |
 *
 * ⚠️ 四条**都在 `[markdown]` 表**、也**都画在「Markdown」页那组「代码块」里**——
 * 它们是同一组设置，落地方式也是同一个（本文件）。1980 行那句话——
 * "一组设置住一起"——在这里指的是**表、界面、消费者三处同页**。
 *
 * # 为什么是 DOM 属性，不是编辑器参数
 *
 * ⚠️ **拨这四条开关不重建编辑器**。走 `createEditor` 的参数就得进
 * `EditorPane` 那个 effect 的依赖，一进依赖就是"拨一下开关 = 拆掉重装"——
 * 撤销栈清空、光标回到文首。而这四条是**边看边调**的东西：用户会开着代码块
 * 把行号试着打开看看合不合适。所以状态落在 DOM 上，由 CSS 当场生效
 * （同 `ui/useAppearance.ts` 那两条轴、`ui/useChromeVisibility.ts` 那几个开关
 * 的做法）。
 *
 * ⚠️ **行号那条不是纯 CSS**：行号的 DOM（`.nota-code-gutter`）由 NodeView
 * 常驻生成（`editor/code-block.ts`），本文件只决定它显不显示——NodeView 里
 * 不去读设置，也就没有"设置变了要重建编辑器"的问题。
 *
 * # 为什么默认值**不落属性**
 *
 * 默认态一律 `removeAttribute`，HTML 上是干净的 `<html>`。两个好处：
 * ① 一份"没动过设置"的界面在 DOM 上与"这几条还没接线时"逐字节一样，
 * 排障时不用去分辨"属性没写"和"属性写了默认值"；
 * ② CSS 只需要判 `="on"` / `="off"` 这两种值，不必写
 * `:not([…="off"])` 那种绕的写法。
 * 代价是**默认值在两边各写一份**（`settings/markdown.rs::Default` 与下面那张表）——
 * 改默认值时两处一起改（`markdown.rs` 那边那组注释里也写着这一条）。
 */

import { useEffect } from "react";

import type { Settings } from "@/bridge/ipc";

/** 一条开关的落法：属性名、当前值、默认值。 */
interface OneItemFlag {
  /** `data-` 后面那半截（kebab-case，与 CSS 里逐字对应）。 */
  attribute: string;
  current: boolean;
  default: boolean;
}

export function useCodeBlockPrefs(settings: Settings | null): void {
  useEffect(() => {
    const m = settings?.markdown ?? null;
    // ⚠️ `settings` 为 `null`（还没读回来 / 读失败）时**按默认值落**，
    // 也就是把属性全摘掉。不要"什么都不做"——那会让上一份设置的属性留在
    // `<html>` 上：换设置文件（或恢复默认）之后界面还带着老值，"设置没生效"
    // 的症状里最难查的那一种。
    const flags: OneItemFlag[] = [
      { attribute: "code-line-numbers", current: m?.code_line_numbers ?? false, default: false },
      { attribute: "code-wrap", current: m?.code_wrap ?? true, default: true },
      { attribute: "code-toolbar", current: m?.code_toolbar ?? true, default: true },
      { attribute: "code-lang-picker", current: m?.code_language_picker ?? true, default: true },
    ];

    const root = document.documentElement;
    for (const item4 of flags) {
      const name3 = `data-${item4.attribute}`;
      if (item4.current === item4.default) root.removeAttribute(name3);
      else root.setAttribute(name3, item4.current ? "on" : "off");
    }
  }, [settings]);
}
