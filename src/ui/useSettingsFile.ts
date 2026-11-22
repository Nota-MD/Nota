





















import { useCallback } from "react";

import { api, type Settings } from "@/bridge/ipc";
import { useT } from "@/i18n";
import type { Toast } from "@/ui/Toasts";

export interface settingsFileWiring {

  setSettings: (settings: Settings) => void;
  toast: (message: string, level?: Toast["level"]) => void;
}

export interface settingsFileApi {

  openConfigDir: () => Promise<void>;

  resetSettings: () => Promise<void>;
}

export function useSettingsFile(w: settingsFileWiring): settingsFileApi {


  const t = useT();
  const { setSettings, toast } = w;

  const openConfigDir = useCallback(async () => {
    try {




      await api.settings.openDir();
    } catch (e) {
      toast(t("Could not open the settings folder: {0}", String(e)), "error");
    }
  }, [toast]);

  const resetSettings = useCallback(async () => {
    try {
      setSettings(await api.settings.reset());
      toast(t("Settings reset to defaults."), "success");
    } catch (e) {
      toast(t("Could not reset to defaults: {0}", String(e)), "error");
    }
  }, [setSettings, toast]);

  return { openConfigDir, resetSettings };
}
