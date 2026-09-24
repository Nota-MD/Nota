/**
 * 右下角的临时提示。
 *
 * 自己画而不是用 `window.alert`：alert 会**阻塞整个 WebView**，
 * 在编辑器里打字打到一半弹一个 alert，输入法组合态会被打断。
 */

import { Icon } from "@/ui/Icon";

export interface Toast {
  id: string;
  message: string;
  level: "info" | "warn" | "error" | "success";
}

interface Props {
  items: Toast[];
  onDismiss: (id: string) => void;
}

export function Toasts({ items, onDismiss }: Props) {
  if (!items.length) return null;

  return (
    <div className="toasts" role="status" aria-live="polite">
      {items.map((t) => (
        <div key={t.id} className={`toast toast-${t.level}`}>
          <span className="toast-message">{t.message}</span>
          <button
            type="button"
            className="toast-close"
            title="关掉"
            aria-label="关掉这条提示"
            onClick={() => onDismiss(t.id)}
          >
            <Icon name="folio-close-symbolic" />
          </button>
        </div>
      ))}
    </div>
  );
}
