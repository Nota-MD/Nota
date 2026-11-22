


























import { useEffect } from "react";

import { useT } from "@/i18n";
import type { PluginReviewDiff } from "@/bridge/ipc";
import type { previewMode } from "@/editor/review";

interface Props {

  review: PluginReviewDiff;

  viewMode: previewMode;
  onViewMode: (viewMode: previewMode) => void;

  onCall: (command: string) => void;

  onClose: () => void;





  onEscape: () => void;
}

export function ReviewBar({ review, viewMode, onViewMode, onCall, onClose, onEscape }: Props) {
  const t = useT();















  useEffect(() => {
    const determine = (e: KeyboardEvent) => {
      if (e.key !== "Escape" || e.defaultPrevented) return;

      if (e.isComposing || e.keyCode === 229) return;
      e.preventDefault();
      onEscape();
    };
    window.addEventListener("keydown", determine);
    return () => window.removeEventListener("keydown", determine);
  }, [onEscape]);

  return (
    <div className="review-bar review-bar-inline">
      {                                     }
      <span className="review-title" title={review.title}>
        {review.title}
      </span>

      {
                                           }
      <div className="review-views" role="group">
        <button
          type="button"
          className="btn review-view"
          aria-pressed={viewMode === "diff"}
          onClick={() => onViewMode("diff")}
        >
          {t("Diff")}
        </button>
        <button
          type="button"
          className="btn review-view"
          aria-pressed={viewMode === "result"}
          onClick={() => onViewMode("result")}
        >
          {t("Result")}
        </button>
      </div>

      <span className="review-spacer" />

      {





                      }
      <span className="review-hint">{review.reject ? t("Esc to discard") : t("Esc to close")}</span>

      {                                   }
      {review.reject && (
        <button
          type="button"
          className="btn"
          onClick={() => onCall(review.reject!.command)}
        >
          {review.reject.label}
        </button>
      )}
      {review.accept && (
        <button
          type="button"
          className="btn btn-primary"
          onClick={() => onCall(review.accept!.command)}
        >
          {review.accept.label}
        </button>
      )}
      <button
        type="button"
        className="btn review-back"
        title={t("Close the preview (this does not apply the changes)")}
        onClick={onClose}
      >
        {t("Close preview")}
      </button>
    </div>
  );
}
