/**
 * 强制专注结束后那张**总结**（2026-09-27，用户点名）。
 *
 * 用户原话：「还有就是记得做一下专注模式结束后的总结功能就是将这一次专注模式的
 * 情况显示出来，并且像心电图那样也支持导出。」
 *
 * 左边是四个数（这一轮到底怎么样了），右边是那张分享卡的预览，底下三颗按钮：
 * 存成 PNG / 进剪贴板 / 知道了。导出那一半和写作统计走的是**同一份实现**
 * （`ui/ShareCard.tsx`），所以"像心电图那样"这件事不必再实现第二遍。
 *
 * # ⚠️ 它不是 `useDialogs` 那一族
 *
 * `useDialogs` 里那四个框（确认 / 输入 / 图像 / Emoji）都是**问一句、等一个
 * 答案**：`askXxx` 返回 Promise，`answerXxx` 兑现它。这个框**不问任何事**——
 * 它是一份报告，用户看完点掉就完了，没有"答案"要交回给谁。硬塞进那个 Promise
 * 形状里，就得凭空造一个谁也不读的返回值。
 *
 * 所以它由 `App.tsx` 直接持有（`useFocusTrace` 给的 `结算`），不走 `askXxx`。
 *
 * # 外壳借的是 `.confirm-*`
 *
 * 遮罩、居中、圆角、最大宽度、按钮排布（`confirm.css`）和别的框**一模一样**，
 * 没有理由再写一套。⚠️ 但 `role` 是 `dialog` 而不是 `alertdialog`：
 * `alertdialog` 是"打断你、必须回答"（关掉没存盘的文档那种），而这一份是
 * 用户自己按了"停止专注"之后的回执——它不该在读屏软件里表现成一次打断。
 */

import { useEffect, useMemo, useRef } from "react";

import { useT } from "@/i18n";
import { DialogClose } from "@/ui/DialogClose";
import { dedicatedNoteRate, createShareEnjoyCard, type TotalJoin } from "@/ui/focus-summary";
import { ShareCardPreview, useShareCard } from "@/ui/ShareCard";
import { sayTimeLength } from "@/ui/useForceFocus";

export function FocusSummaryDialog({
  total,
  now,
  onClose,
}: {
  total: TotalJoin;
  /**
   * 这一轮结束的时刻。
   *
   * ⚠️ 传进来而不是在这里 `new Date()`：卡片上那个时间戳要说的是"**这一轮**是
   * 什么时候结束的"。在渲染里现取的话，用户把框开着放十分钟再截图，卡上印的是
   * 十分钟后——而卡片是要拿出去给人看的，那个时刻得是真的。
   */
  now: Date;
  onClose: () => void;
}) {
  const t = useT();
  const okRef = useRef<HTMLButtonElement>(null);

  const card = useMemo(() => createShareEnjoyCard(total, now), [total, now]);
  const { image, busy, result2, saveAsImageSlice, enterCutPasteBoard } = useShareCard(card);

  // 默认焦点给「知道了」：这是唯一一条"看完就走"的路，而用户在按完"停止专注"
  // 之后手还在键盘上，回车就该收工（另两颗是"还要再做点什么"，不该抢默认）。
  useEffect(() => {
    okRef.current?.focus();
  }, []);

  // ⚠️ 只接 Esc，**不接 Enter**：Enter 交给按钮自己
  //（焦点在「知道了」上就是关掉、在「保存分享图」上就是存图——那正是用户的意思）。
  // 这里再抢一次 Enter 会让存图那颗按钮按不动，或者一次按键走两条路。
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        onClose();
      }
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [onClose]);

  const rate = dedicatedNoteRate(total);
  const fourCells = [
    { k: t("Session Length"), v: sayTimeLength(total.timeLengthSeconds * 1000) },
    { k: t("Focus"), v: sayTimeLength(total.dedicatedNoteSeconds * 1000) },
    { k: t("Away"), v: sayTimeLength(total.leaveOpenSeconds * 1000) },
    // ⚠️ 这里**不补单位**（不写 `t("{0} 次")`）：格子上面那行小字已经写着「警报」
    // 了，再补一个量词是同一句话说两遍；而且英文那边 "1 times" 是错的，
    // 为了避开它还得再加一条单复数分支——不值。卡片上那一格不一样（那三个数
    // 并排、没有各自的抬头），所以那边**要**单位，见 `focus-summary.ts`。
    { k: t("Alarm"), v: String(total.warnReport) },
  ];

  return (
    // 点遮罩 = 关掉。与别的框同一个约定。
    <div className="confirm-backdrop" onMouseDown={onClose}>
      <div
        className="confirm-dialog focus-summary"
        role="dialog"
        aria-modal="true"
        aria-label={t("This Session Has Ended")}
        // 点在框里不该冒到遮罩上去，否则点标题也会把框关掉。
        onMouseDown={(e) => e.stopPropagation()}
      >
        <DialogClose onClose={onClose} />
        <h2 className="confirm-title">{t("This Session Has Ended")}</h2>

        <div className="focus-summary-body">
          <div className="focus-summary-stats">
            {fourCells.map((cell2) => (
              <div className="focus-summary-cell" key={cell2.k}>
                <span className="focus-summary-k">{cell2.k}</span>
                {/* ⚠️ 等宽数字：四个数并排，宽度不一会让整块看着像没对齐。 */}
                <span className="focus-summary-v">{cell2.v}</span>
              </div>
            ))}
            {/* ⚠️ 专注率**没在卡片的三格里**（那边是"本轮时长 / 专注占比 / 警报"），
                但它是这一轮最值得瞥一眼的那个数，所以摆在这里。
                `null` 画破折号而不是 0%——理由见 `focus-summary.ts::专注率`。 */}
            <div className="focus-summary-cell">
              <span className="focus-summary-k">{t("Focus Share")}</span>
              <span className="focus-summary-v">
                {rate === null ? t("—") : t("{0}%", rate)}
              </span>
            </div>
          </div>

          <div className="focus-summary-card">
            <ShareCardPreview spec={card} image={image} className="focus-summary-img" />
          </div>
        </div>

        {/* ⚠️ 结果留在**框里**、就在按钮下面（不是 toast）：存完还想再存一次、
            剪贴板那次失败想改按"保存分享图"，用户的眼睛不用离开这里。
            与面板里那一块同一个理由（`ui/ShareCard.tsx::useShareCard`）。 */}
        {result2 && (
          <p className="panel-share-note focus-summary-note" role="status">
            {result2}
          </p>
        )}

        <div className="confirm-actions">
          <button
            type="button"
            className="btn"
            disabled={busy !== ""}
            onClick={() => void saveAsImageSlice()}
          >
            {t("Save share image")}
          </button>
          <button
            type="button"
            className="btn"
            disabled={busy !== ""}
            onClick={() => void enterCutPasteBoard()}
          >
            {t("Copy Share Image")}
          </button>
          <button ref={okRef} type="button" className="btn btn-primary" onClick={onClose}>
            {t("Got It")}
          </button>
        </div>
      </div>
    </div>
  );
}
