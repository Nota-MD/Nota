/**
 * Apply the developer-only "selectable interface text" switch.
 *
 * The shell denies text selection by default. This hook exposes a persistent
 * setting as one root data attribute so the CSS override is reversible and
 * survives component rebuilds without mutating individual controls.
 */

import { useEffect } from "react";

import type { Settings } from "@/bridge/ipc";

export function isSelectableUiTextEnabled(debugMode: boolean, selectUiText: boolean): boolean {
  return debugMode && selectUiText;
}

export function useSelectableUiText(settings: Settings | null): void {
  const debugMode = settings?.general.debug_mode ?? false;
  const selectUiText = settings?.general.select_ui_text ?? false;

  useEffect(() => {
    const enabled = isSelectableUiTextEnabled(debugMode, selectUiText);
    document.documentElement.dataset.uiTextSelectable = enabled ? "true" : "false";
    return () => {
      delete document.documentElement.dataset.uiTextSelectable;
    };
  }, [debugMode, selectUiText]);
}
