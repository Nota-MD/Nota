import { useEffect, useSyncExternalStore } from "react";

import { useT } from "@/i18n";
import {
  currentZoomHud,
  dismissZoomHud,
  subscribeZoomHud,
} from "@/ui/zoom-hud-state";

export function ZoomHud() {
  const t = useT();
  const hud = useSyncExternalStore(subscribeZoomHud, currentZoomHud, currentZoomHud);

  useEffect(() => {
    if (!hud) return;
    const timer = window.setTimeout(() => dismissZoomHud(hud.serial), 1600);
    return () => window.clearTimeout(timer);
  }, [hud]);

  if (!hud) return null;
  return (
    <div className="zoom-hud" role="status" aria-live="polite">
      <output>{hud.label}</output>
      <button
        type="button"
        className="zoom-hud-minus"
        title={t("Zoom Out")}
        aria-label={t("Zoom Out")}
        onClick={hud.onMinus}
      >
        −
      </button>
      <button
        type="button"
        className="zoom-hud-plus"
        title={t("Zoom In")}
        aria-label={t("Zoom In")}
        onClick={hud.onPlus}
      >
        +
      </button>
      <button type="button" className="zoom-hud-reset" onClick={hud.onReset}>
        {t("Reset zoom controls")}
      </button>
    </div>
  );
}
