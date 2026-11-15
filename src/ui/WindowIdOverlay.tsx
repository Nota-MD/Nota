import { useT } from "@/i18n";

export function WindowIdOverlay({ id }: { id: string }) {
  const t = useT();
  return (
    <div className="window-id-overlay" role="status" aria-live="polite">
      <div className="window-id-overlay-copy">
        <div className="window-id-overlay-label">{t("Current Nota window")}</div>
        <div className="window-id-overlay-caption">
          {t("Use this ID when moving a tab to another window.")}
        </div>
      </div>
      <div className="window-id-overlay-number">{id}</div>
    </div>
  );
}

