import { useEffect, useRef, useState } from "react";

import { useT } from "@/i18n";
import { DialogClose } from "@/ui/DialogClose";
import type { WindowPickerRequest } from "@/ui/useDialogs";
import { useModalTrap } from "@/ui/useModalTrap";
import { formatWindowId, windowIdWidth, windowPickerError } from "@/ui/window-picker";

export function WindowPickerDialog({
  request,
  onAnswer,
}: {
  request: WindowPickerRequest;
  onAnswer: (id: number | null) => void;
}) {
  const t = useT();
  const [value, setValue] = useState("");
  const root = useRef<HTMLDivElement>(null);
  const input = useRef<HTMLInputElement>(null);
  const width = windowIdWidth(request.ids);
  const error = windowPickerError(value, request.ids, request.currentId);
  const available = request.ids
    .filter((id) => id !== request.currentId)
    .map((id) => formatWindowId(id, request.ids))
    .join(", ");

  useEffect(() => {
    input.current?.focus();
    const frame = requestAnimationFrame(() => input.current?.focus());
    return () => cancelAnimationFrame(frame);
  }, []);
  useModalTrap(root, { onEscape: () => onAnswer(null) });

  const submit = (next: string) => {
    if (windowPickerError(next, request.ids, request.currentId) !== null) return;
    onAnswer(Number(next));
  };

  return (
    <div className="confirm-backdrop" onMouseDown={() => onAnswer(null)}>
      <div
        ref={root}
        className="confirm-dialog prompt-dialog"
        role="dialog"
        aria-modal="true"
        aria-label={t("Move tab to another window")}
        tabIndex={-1}
        onMouseDown={(event) => event.stopPropagation()}
      >
        <DialogClose onClose={() => onAnswer(null)} />
        <h2 className="confirm-title">{t("Move tab to another window")}</h2>
        <label className="prompt-label" htmlFor="nota-window-picker">
          {t("Window ID")}
        </label>
        <input
          id="nota-window-picker"
          ref={input}
          autoFocus
          className="prompt-input"
          inputMode="numeric"
          autoComplete="off"
          maxLength={width}
          spellCheck={false}
          value={value}
          onChange={(event) => {
            const next = event.target.value.replace(/\s+/g, "").slice(0, width);
            setValue(next);
            if (next.length === width && windowPickerError(next, request.ids, request.currentId) === null) {
              onAnswer(Number(next));
            }
          }}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              event.preventDefault();
              submit(value);
            } else if (event.key === "Escape") {
              event.preventDefault();
              onAnswer(null);
            }
          }}
        />
        <p className="prompt-hint">
          {t("Current window: {0}. Available windows: {1}.", formatWindowId(request.currentId, request.ids), available || t("None"))}
        </p>
        <p className="prompt-hint">{t("Hold Ctrl+Alt+I to show window IDs.")}</p>
        {error && (
          <p className="prompt-hint prompt-error" role="alert">
            {error === "digits"
              ? t("Window IDs contain digits only.")
              : error === "width"
                ? t("Enter exactly {0} digits.", width)
                : error === "self"
                  ? t("This is the current window.")
                  : t("No open window has this ID.")}
          </p>
        )}
        <div className="confirm-actions">
          <button type="button" className="btn" onClick={() => onAnswer(null)}>
            {t("Cancel")}
          </button>
          <button
            type="button"
            className="btn btn-primary"
            disabled={error !== null || value.length !== width}
            onClick={() => submit(value)}
          >
            {t("Move")}
          </button>
        </div>
      </div>
    </div>
  );
}

