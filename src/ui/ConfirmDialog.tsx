




























import { useEffect, useRef } from "react";

import { useT } from "@/i18n";
import { DialogClose } from "@/ui/DialogClose";
import type { ConfirmAnswer } from "@/ui/useDialogs";
import { useModalTrap } from "@/ui/useModalTrap";

interface Props {
  title: string;
  message: string;

  confirmLabel?: string;

  danger?: boolean;






  hideCancel?: boolean;

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


  const t = useT();
  const okRef = useRef<HTMLButtonElement>(null);
  const extraRef = useRef<HTMLButtonElement>(null);


  const dialogRef = useRef<HTMLDivElement>(null);

  useEffect(() => {

    (extraLabel ? extraRef : okRef).current?.focus();
  }, [extraLabel]);


  //





  useModalTrap(dialogRef, { onEscape: () => onAnswer("cancel") });

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Enter") {
        e.preventDefault();
        onAnswer(extraLabel ? "extra" : "confirm");
      }
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [onAnswer, extraLabel]);

  return (

    <div className="confirm-backdrop" onMouseDown={() => onAnswer("cancel")}>
      <div
        ref={dialogRef}
        className="confirm-dialog"
        role="alertdialog"
        aria-modal="true"
        aria-label={title}

        tabIndex={-1}

        onMouseDown={(e) => e.stopPropagation()}
      >
        <DialogClose onClose={() => onAnswer("cancel")} />
        <h2 className="confirm-title">{title}</h2>
        <p className="confirm-message">{message}</p>
        <div className="confirm-actions">
          {!hideCancel && (
            <button type="button" className="btn" onClick={() => onAnswer("cancel")}>
              {t("Cancel")}
            </button>
          )}
          {

                                       }
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
            {confirmLabel ?? t("OK")}
          </button>
        </div>
      </div>
    </div>
  );
}
