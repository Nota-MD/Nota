/** 偏好设置窗口的开关、目标页与启动更新通知。 */

import { useCallback, useState } from "react";

import { api, type Settings } from "@/bridge/ipc";
import { t } from "@/i18n";
import type { SectionId } from "@/ui/settings/SettingsDialog";
import type { Toast, ToastAction } from "@/ui/Toasts";
import { useUpdateNotifications } from "@/ui/useUpdateNotifications";

export function useSettingsWindow({
  settings,
  toast,
}: {
  settings: Settings | null;
  toast: (
    message: string,
    level?: Toast["level"],
    ttlMs?: number,
    action?: ToastAction,
  ) => void;
}) {
  const [open, setOpen] = useState(false);
  const [initialSection, setInitialSection] = useState<SectionId | null>(null);
  const style = settings?.appearance.settings_window_style ?? "embedded";

  const openExternal = useCallback(() => {
    void api.window.openSettings().catch((error) => {
      toast(t("Could not open the Preferences window: {0}", String(error)), "error");
    });
  }, [toast]);

  const openUpdateSettings = useCallback(() => {
    if (style === "external") {
      openExternal();
      return;
    }
    setInitialSection("updates");
    setOpen(true);
  }, [openExternal, style]);

  const setOpenFromMenu = useCallback(
    (value: boolean | ((current: boolean) => boolean)) => {
      const next = typeof value === "function" ? value(open) : value;
      if (next && style === "external") {
        openExternal();
        return;
      }
      setInitialSection(null);
      setOpen(next);
    },
    [open, openExternal, style],
  );

  const close = useCallback(() => {
    setOpen(false);
    setInitialSection(null);
  }, []);

  useUpdateNotifications({ settings, toast, openUpdateSettings });

  return { open, initialSection, openUpdateSettings, setOpenFromMenu, close };
}
