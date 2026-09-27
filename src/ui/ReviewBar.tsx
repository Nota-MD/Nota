/**
 * 就地改动预览顶上那一条细条（`nota.ui.review_diff`，2026-09-26）。
 *
 * # 它为什么是「一条细条」而不是「一个界面」
 *
 * 用户否掉的是**另开一个界面**那条路：「我的想法是直接将内容嵌入编辑区域……
 * 直接作用于编辑区域，而不是开一个独立界面」。所以改动本身画在**正文身上**
 * （`editor/review.ts`），这里只剩按钮与状态，占一行工具栏那么高。
 *
 * ⚠️ 它与编辑区是**兄弟**（都排在 `.app-main` 这个 flex 列里），不是编辑区的
 * 子节点。理由是分屏模式：`.editor-pane-split` 自己是个横向 flex，往它里面
 * 塞一条横条会把两个窗格挤到下面去。排在编辑区**上面**这一行里，三种模式
 * 都是"编辑区顶上加一条"，一格 CSS 都不用为模式分叉。
 *
 * # 三种按钮，三种归属
 *
 * | 按钮 | 谁决定 | 点了干什么 |
 * |---|---|---|
 * | 「改动对比」/「改后效果」 | **宿主**（这一层） | 只换编辑器根节点上一个 class |
 * | 「接受」/「放弃」 | **插件**（`label` + `command`） | 调插件自己的命令 |
 * | 「收起预览」 | **宿主** | 直接收起来（`nota_plugin_review_close`） |
 *
 * ⚠️ 第三条**必须由宿主提供**（与 `ReviewPane` 的「回到正文」同一条道理）：
 * 插件不该有能力让用户出不去——插件卡住、或者根本没给放弃命令时，用户手上
 * 得有一条总能走的路。它的 `title` 如实说明"改动不会因此被应用"。
 */

import { useEffect } from "react";

import { useT } from "@/i18n";
import type { PluginReviewDiff } from "@/bridge/ipc";
import type { 预览看法 } from "@/editor/review";

interface Props {
  /** 摊着的那一份改动。 */
  review: PluginReviewDiff;
  /** 现在看哪一面。状态在 `App` 手里（编辑区也要用同一份，见 `EditorPane` 那条）。 */
  看法: 预览看法;
  on看法: (看法: 预览看法) => void;
  /** 跑插件命令（接受/放弃）。错误由调用方说给用户听。 */
  onCall: (command: string) => void;
  /** 收起预览。**不动文档**。 */
  onClose: () => void;
  /**
   * 按 `Esc`。⚠️ 与 [`onClose`] **不是同一件事**：这条优先走插件给的「放弃」
   * （补丁在插件手里，只收起来的话插件仍然认为"有一份改动等着你"），
   * 与正文里那一份 `Esc`（`review-prose.ts` / `review-source.ts`）**同一条路**。
   */
  onEscape: () => void;
}

export function ReviewBar({ review, 看法, on看法, onCall, onClose, onEscape }: Props) {
  const t = useT();

  /**
   * `Esc` 在**焦点不在正文里**的时候也要管用。
   *
   * ⚠️ 这不是"顺手多做一点"：用户点完上面那两颗看法开关之后，焦点就落在按钮上
   * 了——而正文里那一份 `Esc` 处理挂在**编辑器的 DOM** 上，这时它收不到键。
   * 症状是提示条上写着「Esc 收起」、按下去**什么都不发生**（2026-09-26 无头
   * 目检时实测到的就是这个）。
   *
   * ⚠️ 这里用 `window` 的**冒泡**阶段、且不抢在编辑器前面：两个编辑器处理 `Esc`
   * 时都 `stopPropagation`（`review-prose.ts` 的 `handleKeyDown`、
   * `review-source.ts` 那条 `Prec.highest` 键位），所以焦点在正文里时这里
   * **根本收不到**——两条路互斥，同一次按键不会跑两遍（跑两遍的代价是插件的
   * 「放弃」命令被调两次）。
   */
  useEffect(() => {
    const 判 = (e: KeyboardEvent) => {
      if (e.key !== "Escape" || e.defaultPrevented) return;
      // 组字期间一概不接（同 `useMenus` / `useImmersive` 里那条判据）。
      if (e.isComposing || e.keyCode === 229) return;
      e.preventDefault();
      onEscape();
    };
    window.addEventListener("keydown", 判);
    return () => window.removeEventListener("keydown", 判);
  }, [onEscape]);

  return (
    <div className="review-bar review-bar-inline">
      {/* 标题给 `title`：插件给的措辞可能很长，条子只有一行高。 */}
      <span className="review-title" title={review.title}>
        {review.title}
      </span>

      {/* 两种看法。⚠️ `aria-pressed` 而不是 `role="tab"`：这不是两块内容之间
          的切换，是**同一个东西**的两种画法（正文一个字都没换）。 */}
      <div className="review-views" role="group">
        <button
          type="button"
          className="btn review-view"
          aria-pressed={看法 === "diff"}
          onClick={() => on看法("diff")}
        >
          {t("改动对比")}
        </button>
        <button
          type="button"
          className="btn review-view"
          aria-pressed={看法 === "result"}
          onClick={() => on看法("result")}
        >
          {t("改后效果")}
        </button>
      </div>

      <span className="review-spacer" />

      {/* 键位提示。⚠️ 写法与「查找条」那边一致：只写按什么，不解释为什么。
          ⚠️ **措辞跟着 `reject` 走，不写死**：`Esc` 走的就是插件给的「放弃」
          （理由见 `Props.onEscape`）——两条路写成一个词，屏幕上就会出现
          "提示说收起、插件那边却把改动作废了"。2026-09-26 无头目检时**实测**
          到的正是这个：按 `Esc` 之后面板上写着「这次的改动作废了」，
          而条子上还挂着「Esc 收起」。插件没给放弃命令时退到"真收起"，
          那时才写「收起」。 */}
      <span className="review-hint">{review.reject ? t("Esc 放弃") : t("Esc 收起")}</span>

      {/* 放弃在前、接受在后：破坏性的那个不放在手指最后落下的地方。 */}
      {review.reject && (
        <button
          type="button"
          className="btn"
          onClick={() => onCall(review.reject!.command)}
        >
          {review.reject.label}
        </button>
      )}
      {review.accept && (
        <button
          type="button"
          className="btn btn-primary"
          onClick={() => onCall(review.accept!.command)}
        >
          {review.accept.label}
        </button>
      )}
      <button
        type="button"
        className="btn review-back"
        title={t("收起预览，改动不会因此被应用")}
        onClick={onClose}
      >
        {t("收起预览")}
      </button>
    </div>
  );
}
