/**
 * 自己画的确认框。
 *
 * # 为什么不用 `window.confirm`
 *
 * 和 `Toasts.tsx` 避开 `alert` 是同一个理由，而且更强：`confirm` 会**阻塞整个
 * WebView**。用户正在打字、输入法还在组合态的时候弹出它，那一段组合就被打断了——
 * 中文输入是 Nota 的主力场景，"关掉一份没存盘的文档"又正好是随时会发生的动作
 * （`Ctrl+W`）。见 `docs/07` backlog 第 29 项。
 *
 * # 用法
 *
 * 组件本身只认"现在要不要显示、显示什么"和"用户点了哪个"，**不认识谁在等答案**。
 * 把 `confirm` 包成 Promise 的活在 `App.tsx` 里做（那边才有状态）。
 *
 * ⚠️ 按钮顺序按桌面惯例：**确认在右**，而且默认焦点给它。Esc 一律等于取消——
 * 半路想反悔的人比想确认的人多。
 *
 * # 第三个按钮（2026-09-25）
 *
 * 给了 `extraLabel` 就有三个按钮：取消 / extra / 确认。它的来历是"关掉一份
 * 没存盘的文档"——那时用户想要的是**先存再关**，而原来的两个按钮只能让他
 * 关掉对话框、自己去存、再回来关一遍。
 *
 * ⚠️ 有第三个按钮时，**默认焦点给 extra**（不给出确认键）。理由：确认键在这种
 * 框里是"丢弃"那种后悔不来的动作，而 Enter 是打字打到一半最容易误触的键——
 * 没得选的时候只能接受这个风险，有了安全的那条路就不该再赌。
 */

import { useEffect, useRef } from "react";

import { useT } from "@/i18n";
import type { ConfirmAnswer } from "@/ui/useDialogs";

interface Props {
  title: string;
  message: string;
  /** 确认按钮上的字。默认「确定」。 */
  confirmLabel?: string;
  /** 危险动作（丢改动、删东西）时把确认键画红。 */
  danger?: boolean;
  /**
   * 只报信、不问事时把「取消」藏掉（比如「关于 Nota」）。
   *
   * ⚠️ 这种情况下面两个按钮是**同一个答案**，留着「取消」会让人以为
   * 关掉它和点确定有区别——一个不存在的选择比少一个按钮更让人犹豫。
   */
  hideCancel?: boolean;
  /** 第三个按钮的字（「保存并关闭」）。给了才画，并且拿默认焦点。 */
  extraLabel?: string;
  onAnswer: (answer: ConfirmAnswer) => void;
}

export function ConfirmDialog({
  title,
  message,
  confirmLabel,
  danger,
  hideCancel,
  extraLabel,
  onAnswer,
}: Props) {
  // ⚠️ **这一行不只是取值**：它订阅了语言（宿主报来语言之后这一块要重画，见
  // `i18n/index.ts::useT`）。局部这个名字盖住模块级的 `t`，下面全都用它。
  const t = useT();
  const okRef = useRef<HTMLButtonElement>(null);
  const extraRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    // ⚠️ 默认焦点跟着"默认答案"走（见文件头）：有第三条路时焦点在它身上。
    (extraLabel ? extraRef : okRef).current?.focus();
  }, [extraLabel]);

  // 键盘：Esc 取消、Enter 走**默认那条**。绑在 window 上而不是对话框上，
  // 因为焦点可能还没落进来（用户在它出现前就把手放在键盘上了）。
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        onAnswer("cancel");
      } else if (e.key === "Enter") {
        e.preventDefault();
        onAnswer(extraLabel ? "extra" : "confirm");
      }
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [onAnswer, extraLabel]);

  return (
    // 点遮罩 = 取消。这是**约定**，不是随手加的——想取消的人会去点旁边。
    <div className="confirm-backdrop" onMouseDown={() => onAnswer("cancel")}>
      <div
        className="confirm-dialog"
        role="alertdialog"
        aria-modal="true"
        aria-label={title}
        // 点在框里不该冒到遮罩上去，否则点标题也会把框关掉。
        onMouseDown={(e) => e.stopPropagation()}
      >
        <h2 className="confirm-title">{title}</h2>
        <p className="confirm-message">{message}</p>
        <div className="confirm-actions">
          {!hideCancel && (
            <button type="button" className="btn" onClick={() => onAnswer("cancel")}>
              {t("取消")}
            </button>
          )}
          {/* ⚠️ 第三条路画在**中间**（取消和确认之间），而且用 `btn-primary`：
              蓝色（"这就是该按的那个"）落在安全的那条上，危险的那条保持红色。
              两条挨着放会把"放弃改动"塞到用户手指下面。 */}
          {extraLabel && (
            <button
              ref={extraRef}
              type="button"
              className="btn btn-primary"
              onClick={() => onAnswer("extra")}
            >
              {extraLabel}
            </button>
          )}
          <button
            ref={okRef}
            type="button"
            className={`btn ${danger ? "btn-danger" : "btn-primary"}`}
            onClick={() => onAnswer("confirm")}
          >
            {confirmLabel ?? t("确定")}
          </button>
        </div>
      </div>
    </div>
  );
}
