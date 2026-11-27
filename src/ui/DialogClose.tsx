import { forwardRef } from "react";

import { useT } from "@/i18n";
import { Icon } from "@/ui/Icon";

interface Props {
  onClose: () => void;
}








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
      <Icon name="nota-close-symbolic" size={16} />
    </button>
  );
});
