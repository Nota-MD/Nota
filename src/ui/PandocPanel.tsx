import { useEffect, useRef } from "react";

import type { PandocFormatInfo, PandocProbe } from "@/bridge/ipc";
import { useT } from "@/i18n";
import { DialogClose } from "@/ui/DialogClose";

interface Props {

  probe: PandocProbe | null;

  format: PandocFormatInfo | null;

  onExport: () => void;
  onRecheck: () => void;
  onClose: () => void;
}

export function PandocPanel({
  probe,
  format,
  onExport,
  onRecheck,
  onClose,
}: Props) {


  const t = useT();
  const busy = probe === null;
  const okRef = useRef<HTMLButtonElement>(null);

  const cellStyleName = format?.name ?? t("This file");

  const hasBuiltInPdf = probe?.fallback_pdf === true && format?.id === "pdf";


  const primary =
    probe?.state === "ready"
      ? { label: t("Exporting {0}", cellStyleName), run: onExport }
      : probe?.state === "missing"
        ? hasBuiltInPdf
          ? { label: t("Typeset and export with Nota itself"), run: onExport }
          : { label: t("Try Anyway"), run: onExport }
        : probe?.state === "unknown"
          ? { label: t("Try Anyway"), run: onExport }
          : null;


  useEffect(() => {
    if (!busy) okRef.current?.focus();
  }, [busy, primary?.label]);


  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        onClose();
      } else if (e.key === "Enter" && primary !== null) {
        e.preventDefault();
        primary.run();
      }
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [onClose, primary]);

  const mark = busy
    ? { className: "is-busy", glyph: "" }
    : probe.state === "ready"
      ? { className: "is-ok", glyph: "✓" }
      : probe.state === "missing"
        ? { className: "is-warn", glyph: "!" }
        : { className: "is-ask", glyph: "?" };

  return (

    <div className="confirm-backdrop" onMouseDown={onClose}>
      <div
        className="confirm-dialog gate-panel"
        role="dialog"
        aria-modal="true"
        aria-label={t("Export {0}", cellStyleName)}
        onMouseDown={(e) => e.stopPropagation()}
      >
        <DialogClose onClose={onClose} />
        <h2 className="confirm-title">{t("Export {0}", cellStyleName)}</h2>

        <div className="gate-status">
          <span className={`gate-mark ${mark.className}`} aria-hidden="true">
            {mark.glyph}
          </span>
          <p className="gate-message">
            {busy ? t("Checking for pandoc on this system…") : probe.message}
          </p>
        </div>


        {probe !== null && probe.detail !== "" && (
          <pre className="gate-detail">{probe.detail}</pre>
        )}







        {probe !== null && probe.command !== "" && (
          <dl className="gate-facts">
            <dt>{t("Command")}</dt>
            <dd>{probe.command}</dd>
            {probe.version !== null && (
              <>
                <dt>{t("Version")}</dt>
                <dd>{probe.version}</dd>
              </>
            )}
            {format?.id === "pdf" && (
              <>
                <dt>{t("Typesetting engine")}</dt>


                <dd>{probe.pdf_engine ?? t("Not found in PATH")}</dd>
              </>
            )}
          </dl>
        )}

        <div className="confirm-actions">

          <div className="gate-side">
            <button type="button" className="btn" onClick={onRecheck} disabled={busy}>
              {t("Check Again")}
            </button>
          </div>
          <button type="button" className="btn" onClick={onClose}>
            {t("Cancel")}
          </button>
          {primary !== null ? (
            <button
              ref={okRef}
              type="button"
              className="btn btn-primary"
              onClick={primary.run}
            >
              {primary.label}
            </button>
          ) : (
            <button type="button" className="btn btn-primary" disabled>
              {t("Checking…")}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
