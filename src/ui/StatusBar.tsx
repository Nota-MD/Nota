/**
 * 状态栏。对标 Typora 底栏：左侧文件信息，右侧字数统计。
 *
 * # 2026-09-24：补了「现在是什么模式」
 *
 * 评审指出来的毛病——**当前是源码、分屏还是所见即所得，外壳上一点提示都没有**，
 * 只有「视图」菜单里那个勾知道。而这三者的差别不是口味问题：源码模式里
 * 光标停在文本原文上、分屏的右半是只读预览。用户常常是"打了半天字才发现
 * 自己在哪"。
 *
 * 两条口径：
 *
 * | 显示什么 | 什么时候显示 | 为什么 |
 * |---|---|---|
 * | 模式名 | **恒显** | 它不是是非题，三个值里总有一个是真的，藏着反而要用猜 |
 * | 「严格」 | **只在开着时** | 它是少数派口径（默认关），常驻一个"没开"等于把状态栏开成开关清单 |
 *
 * ⚠️ 这两个都是**只读指示，不是开关**。点一下切模式看着很顺，但那会变成
 * 「视图」菜单、「偏好设置 → 编辑器」之外的**第三个切换入口**，而切换要
 * 落到 `App.tsx` 的 `updateSettings({ view_mode })`——指示器不该有副作用。
 *
 * ⚠️ 模式名从 `ui/view-modes.ts` 取，**不在这儿再写一遍**：偏好设置里那个
 * 下拉用的是同一份，两处各写一份迟早会对不上。
 */

import { useMemo } from "react";

import type { Document, ViewMode } from "@/bridge/ipc";
import { countText } from "@/ui/outline";
import { VIEW_MODE_LABELS } from "@/ui/view-modes";

export function StatusBar({
  doc,
  mode,
  strict,
}: {
  doc: Document | null;
  /** 当前编辑模式（`settings.view_mode`）。 */
  mode: ViewMode;
  /** 严格模式（`settings.strict_markdown`）。**关着时这一格不画。** */
  strict: boolean;
}) {
  const counts = useMemo(() => countText(doc?.text ?? ""), [doc?.text]);

  if (!doc) {
    // 没文档时**不画模式**：那时候没有编辑区，说出"现在是源码模式"是句空话。
    return (
      <footer className="statusbar">
        <span className="status-left">就绪</span>
      </footer>
    );
  }

  return (
    <footer className="statusbar">
      <span className="status-left" title={doc.path ?? "尚未保存"}>
        {doc.path ?? "未保存"}
        {doc.dirty && <span className="status-dirty">● 已修改</span>}
      </span>

      <span className="status-right">
        {/* 摆在这一组的**最前面**：右边那四格是"这份文档有多少字"，
            这两格是"应用现在怎么摆"，先应用后文档读起来才不串。 */}
        {/* ⚠️ 取 `short` 那一列，不是 `full`：这一格右边还挤着四个统计数字，
            写「分屏预览」会把状态栏顶宽。两份名字在同一张表里，见 `view-modes.ts`。 */}
        <span className="status-mode" title={`编辑模式：${VIEW_MODE_LABELS[mode].full}——在「视图」菜单里换`}>
          {VIEW_MODE_LABELS[mode].short}
        </span>
        {strict && (
          <span
            className="status-strict"
            title="严格模式开着：井号后面必须有空格才算标题，「#标题」不算。"
          >
            严格
          </span>
        )}
        <span title="词数（中文按字计）">{counts.words} 词</span>
        <span title="字符数（按码点计）">{counts.characters} 字符</span>
        <span title="行数">{counts.lines} 行</span>
        <span title="按每分钟 250 词粗略估算">
          约 {counts.readingMinutes} 分钟
        </span>
      </span>
    </footer>
  );
}
