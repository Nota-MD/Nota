




























import { useEffect, useRef } from "react";


import licenseProveFullText from "../../LICENSE?raw";

import { useT } from "@/i18n";
import { DialogClose } from "@/ui/DialogClose";
import { useModalTrap } from "@/ui/useModalTrap";






const shortName = "BSD-2-Clause";

export const licenseShortName = shortName;

/** License body shared by the dialog and the About window's own subpage. */
export function LicenseText() {
  return <pre className="lic-text">{licenseProveFullText}</pre>;
}

export function LicenseDialog({ onClose }: { onClose: () => void }) {
  const t = useT();


  const box2 = useRef<HTMLDivElement>(null);
  const closeKey = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    closeKey.current?.focus();
  }, []);


  useModalTrap(box2, { onEscape: onClose });

  return (
    <div
      className="confirm-backdrop"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        className="confirm-dialog lic-dialog"
        role="dialog"
        aria-modal="true"
        aria-label={t("{0} License", shortName)}
        ref={box2}
        tabIndex={-1}
      >
        <DialogClose onClose={onClose} />
        <h2 className="confirm-title">{t("{0} License", shortName)}</h2>
        <LicenseText />
        <div className="confirm-actions">
          <button type="button" className="btn" ref={closeKey} onClick={onClose}>
            {t("Close")}
          </button>
        </div>
      </div>
    </div>
  );
}
