


























import { useEffect, useMemo, useRef } from "react";

import { useT } from "@/i18n";
import { DialogClose } from "@/ui/DialogClose";
import { dedicatedNoteRate, createShareEnjoyCard, type TotalJoin } from "@/ui/focus-summary";
import { ShareCardPreview, useShareCard } from "@/ui/ShareCard";
import { sayTimeLength } from "@/ui/useForceFocus";

export function FocusSummaryDialog({
  total,
  now,
  onClose,
}: {
  total: TotalJoin;







  now: Date;
  onClose: () => void;
}) {
  const t = useT();
  const okRef = useRef<HTMLButtonElement>(null);

  const card = useMemo(() => createShareEnjoyCard(total, now), [total, now]);
  const { image, busy, result2, saveAsImageSlice, enterCutPasteBoard } = useShareCard(card);



  useEffect(() => {
    okRef.current?.focus();
  }, []);




  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        onClose();
      }
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [onClose]);

  const rate = dedicatedNoteRate(total);
  const fourCells = [
    { k: t("Session Length"), v: sayTimeLength(total.timeLengthSeconds * 1000) },
    { k: t("Focus"), v: sayTimeLength(total.dedicatedNoteSeconds * 1000) },
    { k: t("Away"), v: sayTimeLength(total.leaveOpenSeconds * 1000) },




    { k: t("Alarm"), v: String(total.warnReport) },
  ];

  return (

    <div className="confirm-backdrop" onMouseDown={onClose}>
      <div
        className="confirm-dialog focus-summary"
        role="dialog"
        aria-modal="true"
        aria-label={t("This Session Has Ended")}

        onMouseDown={(e) => e.stopPropagation()}
      >
        <DialogClose onClose={onClose} />
        <h2 className="confirm-title">{t("This Session Has Ended")}</h2>

        <div className="focus-summary-body">
          <div className="focus-summary-stats">
            {fourCells.map((cell2) => (
              <div className="focus-summary-cell" key={cell2.k}>
                <span className="focus-summary-k">{cell2.k}</span>
                {                                   }
                <span className="focus-summary-v">{cell2.v}</span>
              </div>
            ))}
            {

                                                                  }
            <div className="focus-summary-cell">
              <span className="focus-summary-k">{t("Focus Share")}</span>
              <span className="focus-summary-v">
                {rate === null ? t("—") : t("{0}%", rate)}
              </span>
            </div>
          </div>

          <div className="focus-summary-card">
            <ShareCardPreview spec={card} image={image} className="focus-summary-img" />
          </div>
        </div>

        {

                                                              }
        {result2 && (
          <p className="panel-share-note focus-summary-note" role="status">
            {result2}
          </p>
        )}

        <div className="confirm-actions">
          <button
            type="button"
            className="btn"
            disabled={busy !== ""}
            onClick={() => void saveAsImageSlice()}
          >
            {t("Save share image")}
          </button>
          <button
            type="button"
            className="btn"
            disabled={busy !== ""}
            onClick={() => void enterCutPasteBoard()}
          >
            {t("Copy Share Image")}
          </button>
          <button ref={okRef} type="button" className="btn btn-primary" onClick={onClose}>
            {t("Got It")}
          </button>
        </div>
      </div>
    </div>
  );
}
