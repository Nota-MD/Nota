/**
 * 状态栏：左侧文件信息，右侧字数统计。
 *
 * # 2026-09-24：补了「现在是什么模式」
 *
 * 评审指出来的毛病——**当前是源码、分屏还是所见即所得，外壳上一点提示都没有**，
 * 只有「视图」菜单里那个勾知道。而这三者的差别不是口味问题：源码模式里
 * 光标停在文本原文上、分屏的右半是只读预览。用户常常是"打了半天字才发现
 * 模式不对"。
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
 *
 * # 2026-09-27：「没文档」那一支也得画强制专注的余额
 *
 * 开窗目检的时候发现的：**在主页（没打开文档）开着强制专注，状态栏一个字都没有**
 * ——因为下面那个 `if (!doc)` 直接返回了一个只有「就绪」的栏。而
 * `ui/FocusMeter.tsx` 头上写着「看不到余额这个功能就不成立」，菜单里那一条又是
 * 任何时候都能点的，所以这是**实质上的漏洞**：用户在主页开着专注、切走去干别的，
 * 手上没有任何参照，最后被红屏叫回来——正是那一格要避免的情形。
 *
 * ⚠️ 判据是「**这一格说的是应用在记什么账，不是这份文档有多少字**」。所以它跟着
 * `doc` 一起消失是错的；跟着 `focus.running` 出现才对（`FocusMeter` 自己判）。
 */

import { useMemo } from "react";

import type { Document, ViewMode } from "@/bridge/ipc";
import type { FocusState } from "@/bridge/types";
import { useT } from "@/i18n";
import { FocusMeter } from "@/ui/FocusMeter";
import { countText } from "@/ui/outline";
import { VIEW_MODE_LABELS } from "@/ui/view-modes";

export function StatusBar({
  doc,
  mode,
  strict,
  readingSpeed,
  focus,
}: {
  doc: Document | null;
  /** 当前编辑模式（`settings.view_mode`）。 */
  mode: ViewMode;
  /** 严格模式（`settings.strict_markdown`）。**关着时这一格不画。** */
  strict: boolean;
  /**
   * 阅读速度（词/分钟，`settings.appearance.reading_speed`），只用来算右边那格
   * 「约几分钟读完」。
   *
   * ⚠️ **必须传进来，不能在下面写一个常量**：2026-09-25 之前这里用的是
   * `countText` 里写死的 250，于是偏好设置里那一项**拨了没有任何效果**，
   * 而它自己的说明写着"只用于把总字数换算成状态栏里的「约几分钟读完」"。
   */
  readingSpeed: number;
  /**
   * 强制专注此刻的状态（`ui/useForceFocus.ts`）。**没在跑就是 `null` 或
   * `running: false`，两种都不画那一格。**
   *
   * ⚠️ **必须传进来，不能在这一层自己订阅**：订阅是 `App.tsx` 那一层做的
   *（菜单项也要它），在这里再订一次就是同一个事件两个听众，
   * 而这个数每秒都在变——两处各存一份迟早会显示成两个不同的数。
   */
  focus: FocusState | null;
}) {
  // ⚠️ **这一行不只是取值**：它订阅了语言（宿主报来语言之后这一块要重画，见
  // `i18n/index.ts::useT`）。局部这个名字盖住模块级的 `t`，下面全都用它。
  // ⚠️ 必须在下面那个 `if (!doc)` **之前**：hooks 不能有条件。
  const t = useT();
  const counts = useMemo(
    () => countText(doc?.text ?? "", readingSpeed),
    [doc?.text, readingSpeed],
  );

  if (!doc) {
    // 没文档时**不画模式**：那时候没有编辑区，说出"现在是源码模式"是句空话。
    return (
      <footer className="statusbar">
        <span className="status-left">{t("Ready")}</span>
        {/* ⚠️ 余额那一格**要画**——理由见文件头「没文档那一支也得画强制专注的
            余额」。它跟的是"应用在记什么账"，不是"这份文档有多少字"。 */}
        <span className="status-right">
          <FocusMeter state={focus} />
        </span>
      </footer>
    );
  }

  return (
    <footer className="statusbar">
      <span className="status-left" title={doc.path ?? t("Not saved yet")}>
        {doc.path ?? t("Unsaved")}
        {doc.dirty && <span className="status-dirty">{t("● Modified")}</span>}
      </span>

      <span className="status-right">
        {/* 摆在这一组的**最前面**：右边那四格是"这份文档有多少字"，
            这两格是"应用现在怎么摆"，先应用后文档读起来才不串。 */}
        {/* ⚠️ 取 `short` 那一列，不是 `full`：这一格右边还挤着四个统计数字，
            写「分屏预览」会把状态栏顶宽。两份名字在同一张表里，见 `view-modes.ts`。
            ⚠️ `VIEW_MODE_LABELS` 那张表里存的是**键**（英文原文），**渲染时才现翻**
            ——所以这两个名字由本行包一层 `t(...)`，表本身一个字都不动。 */}
        <span
          className="status-mode"
          title={t("Editing mode: {0} — switch it in the View menu", t(VIEW_MODE_LABELS[mode].full))}
        >
          {t(VIEW_MODE_LABELS[mode].short)}
        </span>
        {strict && (
          <span
            className="status-strict"
            title={t("Strict mode is on: a heading needs a space after the hashes, so “#title” does not count.")}
          >
            {t("Strict")}
          </span>
        )}
        <span title={t("Words (CJK counted per character)")}>{t("{0} words", counts.words)}</span>
        <span title={t("Characters (by code point)")}>{t("{0} characters", counts.characters)}</span>
        <span title={t("Lines")}>{t("{0} lines", counts.lines)}</span>
        {/* ⚠️ 提示里那个数是**从设置来的**，所以它必须跟着变——写死"每分钟 250 词"
            的话，用户把阅读速度改成 500，提示会当着面撒谎。 */}
        <span title={t("Rough estimate at {0} words per minute (change it in Settings → Appearance)", readingSpeed)}>
          {t("about {0} min", counts.readingMinutes)}
        </span>
        {/* ⚠️ 摆在这一组**最后**：前面几格是"这份文档有多少字"，这一格是
            "应用现在在替你记什么账"——两种东西，别插在中间把它们切开。
            运行中才有它，理由见 `ui/FocusMeter.tsx` 文件头。 */}
        <FocusMeter state={focus} />
      </span>
    </footer>
  );
}
