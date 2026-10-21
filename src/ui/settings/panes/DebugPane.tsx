/**
 * 开发者模式专用页。
 *
 * 它只回答问题“开发者模式现在开着没有、怎么关”，调试信息的查看和其它工具
 * 放在独立的「高级设置」页。这样版本号五连点打开的是开发者模式，而左栏会同时
 * 出现「高级设置」和「开发者模式」两项，二者职责不混。
 */

import { api } from "@/bridge/ipc";
import { useT } from "@/i18n";
import { ActionButton, SettingRow, SettingsGroup, Value } from "../primitives";
import type { PaneProps } from "./props";

export function DebugPane({ settings, onChange, onOpenConfigDir }: PaneProps) {
  const t = useT();

  return (
    <>
      <SettingsGroup title={t("Developer Mode")}>
        <SettingRow
          label={t("Developer mode is enabled")}
          description={t(
            "Developer mode reveals diagnostics and advanced tools. Internal log output remains disabled unless explicitly requested.",
          )}
        >
          <Value>{t("Enabled")}</Value>
        </SettingRow>
        <SettingRow
          label={t("Diagnostic information")}
          description={t(
            "Runtime and build information is formatted in English for issue reports and developer handoff.",
          )}
        >
          <ActionButton onClick={() => void api.window.openDebugInfo()}>
            {t("Open in a New Window")}
          </ActionButton>
        </SettingRow>
        <SettingRow label={t("Settings file")}>
          <ActionButton onClick={onOpenConfigDir}>{t("Open Folder…")}</ActionButton>
        </SettingRow>
        <SettingRow label={t("Disable developer mode")}>
          <ActionButton
            onClick={() =>
              onChange({
                general: { ...settings.general, debug_mode: false },
              })
            }
          >
            {t("Disable")}
          </ActionButton>
        </SettingRow>
      </SettingsGroup>
    </>
  );
}
