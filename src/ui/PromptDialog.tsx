




















import { useEffect, useRef, useState } from "react";

import { useT } from "@/i18n";
import { DialogClose } from "@/ui/DialogClose";
import { useModalTrap } from "@/ui/useModalTrap";

interface Props {
  title: string;

  label: string;

  initial?: string;
  placeholder?: string;

  confirmLabel?: string;




  hint?: string;

  secondLabel?: string;
  secondInitial?: string;
  secondPlaceholder?: string;







  secret?: boolean;

  onAnswer: (value: string | null, second?: string) => void;
}

export function PromptDialog({
  title,
  label,
  initial = "",
  placeholder,
  confirmLabel,
  hint,
  secondLabel,
  secondInitial = "",
  secondPlaceholder,
  secret = false,
  onAnswer,
}: Props) {




  const t = useT();
  const [value, setValue] = useState(initial);
  const [second, setSecond] = useState(secondInitial);
  const inputRef = useRef<HTMLInputElement>(null);


  const dialogRef = useRef<HTMLDivElement>(null);




  useEffect(() => {
    inputRef.current?.focus();
    inputRef.current?.select();
  }, []);








  useModalTrap(dialogRef, { onEscape: () => onAnswer(null) });










  const submit = () => onAnswer(value.trim() === "" ? null : value, second);

  return (
    <div className="confirm-backdrop" onMouseDown={() => onAnswer(null)}>
      <div
        ref={dialogRef}
        className="confirm-dialog prompt-dialog"
        role="dialog"
        aria-modal="true"
        aria-label={title}
        tabIndex={-1}
        onMouseDown={(e) => e.stopPropagation()}
      >
        <DialogClose onClose={() => onAnswer(null)} />
        <h2 className="confirm-title">{title}</h2>
        <label className="prompt-label" htmlFor="nota-prompt-main">
          {label}
        </label>
        <input
          id="nota-prompt-main"
          ref={inputRef}
          className="prompt-input"




          type={secret ? "password" : "text"}
          autoComplete="off"
          value={value}
          placeholder={placeholder}
          spellCheck={false}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              submit();
            } else if (e.key === "Escape") {
              e.preventDefault();
              onAnswer(null);
            }
          }}
        />
        {secondLabel && (
          <>
            <label className="prompt-label" htmlFor="nota-prompt-second">
              {secondLabel}
            </label>
            <input
              id="nota-prompt-second"
              className="prompt-input"
              type="text"
              value={second}
              placeholder={secondPlaceholder}
              spellCheck={false}
              onChange={(e) => setSecond(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  submit();
                } else if (e.key === "Escape") {
                  e.preventDefault();
                  onAnswer(null);
                }
              }}
            />
          </>
        )}
        {hint && <p className="prompt-hint">{hint}</p>}
        <div className="confirm-actions">
          <button type="button" className="btn" onClick={() => onAnswer(null)}>
            {t("Cancel")}
          </button>
          <button type="button" className="btn btn-primary" onClick={submit}>
            {confirmLabel ?? t("OK")}
          </button>
        </div>
      </div>
    </div>
  );
}
