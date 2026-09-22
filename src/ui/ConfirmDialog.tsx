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
 */

import { useEffect, useRef } from "react";

interface Props {
  title: string;
  message: string;
  /** 确认按钮上的字。默认「确定」。 */
  confirmLabel?: string;
  /** 危险动作（丢改动、删东西）时把确认键画红。 */
  danger?: boolean;
  onAnswer: (ok: boolean) => void;
}

export function ConfirmDialog({ title, message, confirmLabel, danger, onAnswer }: Props) {
  const okRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    okRef.current?.focus();
  }, []);

  // 键盘：Esc 取消、Enter 确认。绑在 window 上而不是对话框上，因为焦点
  // 可能还没落进来（用户在它出现前就把手放在键盘上了）。
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        onAnswer(false);
      } else if (e.key === "Enter") {
        e.preventDefault();
        onAnswer(true);
      }
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [onAnswer]);

  return (
    // 点遮罩 = 取消。这是**约定**，不是"顺手加的"——想取消的人会去点旁边。
    <div className="confirm-backdrop" onMouseDown={() => onAnswer(false)}>
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
          <button type="button" className="btn" onClick={() => onAnswer(false)}>
            取消
          </button>
          <button
            ref={okRef}
            type="button"
            className={`btn ${danger ? "btn-danger" : "btn-primary"}`}
            onClick={() => onAnswer(true)}
          >
            {confirmLabel ?? "确定"}
          </button>
        </div>
      </div>
    </div>
  );
}
