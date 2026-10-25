/**
 * 启动时的一次更新检查。
 *
 * 这条 hook 只在首份设置到岸时检查一次；用户运行中打开或关闭这个开关不会立刻
 * 再联网，下一次启动才按新值执行。检查失败在启动阶段保持安静——用户没有主动
 * 点“检查更新”，网络错误不该变成开机噪音；手动检查页仍会如实显示错误。
 */

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
        // 启动检查是后台动作；失败留给手动检查页说明。
      });
  }, [settings, t, toast, openUpdateSettings]);
}
