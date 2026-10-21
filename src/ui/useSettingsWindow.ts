/** 偏好设置窗口的开关、目标页与启动更新通知。 */

import { useCallback, useState } from "react";

import type { Settings } from "@/bridge/ipc";
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

  const openUpdateSettings = useCallback(() => {
    setInitialSection("updates");
    setOpen(true);
  }, []);

  const setOpenFromMenu = useCallback(
    (value: boolean | ((current: boolean) => boolean)) => {
      setInitialSection(null);
      setOpen(value);
    },
    [],
  );

  const close = useCallback(() => {
    setOpen(false);
    setInitialSection(null);
  }, []);

  useUpdateNotifications({ settings, toast, openUpdateSettings });

  return { open, initialSection, openUpdateSettings, setOpenFromMenu, close };
}
