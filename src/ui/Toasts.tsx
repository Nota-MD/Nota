/**
 * 右下角的临时提示。
 *
 * 自己画而不是用 `window.alert`：alert 会**阻塞整个 WebView**，
 * 在编辑器里打字打到一半弹一个 alert，输入法组合态会被打断。
 */

import { useT } from "@/i18n";
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
  // ⚠️ **这一行不只是取值**：它订阅了语言（宿主报来语言之后这一块要重画，见
  // `i18n/index.ts::useT`）。局部这个名字盖住模块级的 `t`，下面全都用它。
  // ⚠️ 它必须在下面那个提前 `return null` **之前**：hooks 不能有条件。
  const t = useT();
  if (!items.length) return null;

  return (
    <div className="toasts" role="status" aria-live="polite">
      {/* ⚠️ 这个回调参数原来叫 `t`，现在和上面那个 `t` 撞名了——参数会把它盖住，
          `t("关掉")` 会变成"拿一个 toast 对象当函数调"。所以改叫 `项`。
          ⚠️ `项.message` **不翻**：那句话是调用方**已经拼好**的（见 `useExport.ts`
          那几处 `toast(t("…"))`），这里再翻一次等于翻一条已经不认识的句子。 */}
      {items.map((项) => (
        <div key={项.id} className={`toast toast-${项.level}`}>
          <span className="toast-message">{项.message}</span>
          <button
            type="button"
            className="toast-close"
            title={t("关掉")}
            aria-label={t("关掉这条提示")}
            onClick={() => onDismiss(项.id)}
          >
            <Icon name="folio-close-symbolic" />
          </button>
        </div>
      ))}
    </div>
  );
}
