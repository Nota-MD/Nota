import { forwardRef } from "react";

import { useT } from "@/i18n";
import { Icon } from "@/ui/Icon";

interface Props {
  onClose: () => void;
}

/**
 * 对话框右上角的统一关闭按钮。
 *
 * 所有模态窗口都提供同一位置、同一图标和同一可读名称。按钮留在 DOM
 * 内而不是由宿主画标题栏，因此网页层、Windows WebView2 与各界面主题
 * 都能得到一致行为。
 */
export const DialogClose = forwardRef<HTMLButtonElement, Props>(function DialogClose(
  { onClose },
  ref,
) {
  const t = useT();

  return (
    <button
      ref={ref}
      type="button"
      className="dialog-close"
      onClick={onClose}
      aria-label={t("Close")}
      title={t("Close")}
    >
      <Icon name="folio-close-symbolic" />
    </button>
  );
});
