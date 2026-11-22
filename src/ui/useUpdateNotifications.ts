







import { useEffect, useRef } from "react";

import { api, type Settings } from "@/bridge/ipc";
import { useT } from "@/i18n";
import type { Toast, ToastAction } from "@/ui/Toasts";

interface wiring {
  settings: Settings | null;
  toast: (
    message: string,
    level?: Toast["level"],
    ttlMs?: number,
    action?: ToastAction,
  ) => void;
  openUpdateSettings: () => void;
}

export function useUpdateNotifications({ settings, toast, openUpdateSettings }: wiring): void {
  const t = useT();
  const started = useRef(false);

  useEffect(() => {
    if (!settings || started.current) return;
    started.current = true;
    if (!settings.updates.check_on_startup) return;

    void api.update
      .check()
      .then((status) => {
        if (!status.available || !settings.updates.notify_when_available) return;
        toast(
          t("Nota {0} is available.", status.latestVersion),
          "info",
          0,
          {
            label: t("Review Update"),
            onClick: openUpdateSettings,
          },
        );
      })
      .catch(() => {

      });
  }, [settings, t, toast, openUpdateSettings]);
}
