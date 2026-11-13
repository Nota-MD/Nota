import { useEffect } from "react";

import { api, type Settings } from "@/bridge/ipc";
import { t } from "@/i18n";
import { DeferredAboutDialog } from "@/ui/DeferredUi";
import type { Toast } from "@/ui/Toasts";

const params = typeof window === "undefined" ? null : new URLSearchParams(window.location.search);
export const settingsOnly = params?.get("settings") === "1";
export const aboutOnly = params?.get("about") === "1";

export function useUtilityWindows({
  settingsOnly: inSettingsWindow,
  aboutOpen,
  closeAbout,
  style,
  toast,
}: {
  settingsOnly: boolean;
  aboutOpen: boolean;
  closeAbout: () => void;
  style: Settings["appearance"]["settings_window_style"] | undefined;
  toast: (message: string, level?: Toast["level"], ttlMs?: number) => void;
}): void {
  useEffect(() => {
    if (!inSettingsWindow && style === "external") {
      void api.window.prepareSettings().catch(() => undefined);
      void api.window.prepareAbout().catch(() => undefined);
    }
  }, [inSettingsWindow, style]);

  useEffect(() => {
    if (!aboutOnly && aboutOpen && style === "external") {
      closeAbout();
      void api.window.openAbout().catch((error) => {
        toast(t("Could not open the About window: {0}", String(error)), "error");
      });
    }
  }, [aboutOpen, closeAbout, style, toast]);
}

export function StandaloneAboutWindow({
  debugMode,
  onSetDebugMode,
}: {
  debugMode: boolean;
  onSetDebugMode: (enabled: boolean) => void;
}) {
  return (
    <DeferredAboutDialog
      presentation="full"
      standalone
      onClose={() => void api.window.hideAbout()}
      debugMode={debugMode}
      onSetDebugMode={onSetDebugMode}
    />
  );
}
