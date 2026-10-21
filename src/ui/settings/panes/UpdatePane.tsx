/**
 * 「更新设置」页。
 *
 * 启动检查、可用更新通知与通知位置是设置项；具体的下载和安装仍由
 * `SoftwareUpdatePane` 展示。前端不接收更新 URL，也不能替换宿主选中的安装包。
 */

import type { NotificationPosition } from "@/bridge/ipc";
import { useT } from "@/i18n";
import { SoftwareUpdatePane } from "@/ui/SoftwareUpdatePane";
import { Select, SettingRow, SettingsGroup, Toggle } from "../primitives";
import { paneWriter, type PaneProps } from "./props";

export function UpdatePane({ settings, onChange }: PaneProps) {
  const t = useT();
  const 写 = paneWriter(settings, onChange, "updates");
  const u = settings.updates;

  const POSITIONS: Array<{ value: NotificationPosition; label: string }> = [
    { value: "bottom-right", label: t("Bottom right") },
    { value: "top-center", label: t("Top center") },
  ];

  return (
    <>
      <SettingsGroup title={t("Update checks")}>
        <SettingRow
          label={t("Check for updates at startup")}
          description={t(
            "Runs one update check in the background after Nota starts. Nota never downloads or installs an update without confirmation.",
          )}
        >
          <Toggle
            checked={u.check_on_startup}
            onChange={(check_on_startup) => 写({ check_on_startup })}
          />
        </SettingRow>
        <SettingRow
          label={t("Notify me when an update is available")}
          description={t(
            "Shows a persistent notification when the startup check finds a newer version. This option is available only when startup checks are enabled.",
          )}
        >
          <Toggle
            checked={u.notify_when_available}
            disabled={!u.check_on_startup}
            onChange={(notify_when_available) => 写({ notify_when_available })}
          />
        </SettingRow>
      </SettingsGroup>

      <SettingsGroup title={t("Notifications")}>
        <SettingRow
          label={t("Notification position")}
          description={t("Applies to all in-app notifications.")}
        >
          <Select
            value={u.notification_position}
            options={POSITIONS}
            onChange={(notification_position) => 写({ notification_position })}
          />
        </SettingRow>
      </SettingsGroup>

      <SettingsGroup title={t("Manual update check")}>
        <SettingRow
          label={t("Check for updates now")}
          description={t(
            "Checks the fixed official release manifest and shows the package selected for this installation.",
          )}
        >
          <div className="stg-update-panel">
            <SoftwareUpdatePane autoCheck={false} />
          </div>
        </SettingRow>
      </SettingsGroup>
    </>
  );
}
