
























import { useEffect, useRef, useState, type KeyboardEvent } from "react";

import { useT } from "@/i18n";
import { DialogClose } from "@/ui/DialogClose";
import type { LinkAnswer, LinkRequest } from "@/ui/useDialogs";

export function LinkDialog({
  request,
  onAnswer,
}: {
  request: LinkRequest;
  onAnswer: (answer: LinkAnswer | null) => void;
}) {


  const t = useT();
  const [name, setName] = useState(request.label);
  const [address, setAddress] = useState(request.href);
  const nameBox = useRef<HTMLInputElement>(null);






  useEffect(() => {
    nameBox.current?.focus();
    nameBox.current?.select();
  }, []);



  const raiseHandoff = () => {
    const a = address.trim();
    if (a === "") return onAnswer(null);
    onAnswer({ kind: "set", label: name, href: a });
  };

  const returnCarOrBackOutput = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      e.preventDefault();
      raiseHandoff();
    } else if (e.key === "Escape") {


      e.preventDefault();
      onAnswer(null);
    }
  };

  return (
    <div className="confirm-backdrop" onMouseDown={() => onAnswer(null)}>
      <div
        className="confirm-dialog prompt-dialog"
        role="dialog"
        aria-modal="true"
        aria-label={t("Link")}
        onMouseDown={(e) => e.stopPropagation()}
      >
        <DialogClose onClose={() => onAnswer(null)} />
        <h2 className="confirm-title">{t("Link")}</h2>

        <label className="prompt-label" htmlFor="nota-link-label">
          {t("Link display name")}
        </label>
        <input
          id="nota-link-label"
          ref={nameBox}
          className="prompt-input"
          type="text"
          autoComplete="off"
          spellCheck={false}
          value={name}
          placeholder={t("Shown in the document")}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={returnCarOrBackOutput}
        />

        <label className="prompt-label" htmlFor="nota-link-href">
          {t("Link URL")}
        </label>
        <input
          id="nota-link-href"
          className="prompt-input"
          type="text"
          autoComplete="off"
          spellCheck={false}
          value={address}
          placeholder={t("https://example.com, or #anchor-on-this-page")}
          onChange={(e) => setAddress(e.target.value)}
          onKeyDown={returnCarOrBackOutput}
        />

        <div className="confirm-actions">
          {




                                                  }
          {request.editing && (
            <button
              type="button"
              className="btn"
              onClick={() => onAnswer({ kind: "remove" })}
            >
              {t("Remove Link")}
            </button>
          )}
          <button type="button" className="btn" onClick={() => onAnswer(null)}>
            {t("Cancel")}
          </button>
          <button type="button" className="btn btn-primary" onClick={raiseHandoff}>
            {request.editing ? t("OK") : t("Insert")}
          </button>
        </div>
      </div>
    </div>
  );
}
