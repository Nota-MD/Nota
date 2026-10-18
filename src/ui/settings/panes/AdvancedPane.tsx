/**
 * 调试模式开启后才出现的「高级设置」。
 *
 * 这里放两类东西：普通用户不需要理解的下载地址替换规则，以及调试模式下
 * 才有意义的构建/运行信息。入口不在通用页，而是「关于」里的版本号连点五下。
 */

import { useEffect, useState } from "react";

import { api, type Diagnostics } from "@/bridge/ipc";
import { useT } from "@/i18n";
import {
  ActionButton,
  SettingRow,
  SettingsGroup,
  TextArea,
  Value,
} from "../primitives";
import { paneWriter, type PaneProps } from "./props";

export function AdvancedPane({ settings, onChange, onOpenConfigDir, onResetSettings }: PaneProps) {
  const t = useT();
  const 写 = paneWriter(settings, onChange, "download");
  const [诊断, set诊断] = useState<Diagnostics | null>(null);

  useEffect(() => {
    let 还在 = true;
    void api.diagnostics
      .collect()
      .then((value) => {
        if (还在) set诊断(value);
      })
      .catch(() => {
        /* 这一页其余部分不依赖诊断信息。 */
      });
    return () => {
      还在 = false;
    };
  }, []);

  return (
    <>
      <SettingsGroup title={t("Debug mode")}>
        <SettingRow
          label={t("Debug mode is enabled")}
          description={t(
            "Debug mode reveals this page and enables internal diagnostic log output. Environment logs remain unchanged.",
          )}
        >
          <ActionButton
            onClick={() =>
              onChange({
                general: { ...settings.general, debug_mode: false },
              })
            }
          >
            {t("Disable Debug Mode")}
          </ActionButton>
        </SettingRow>
      </SettingsGroup>

      <SettingsGroup title={t("Download replacement rules")}>
        <SettingRow
          label={t("Address replacements")}
          description={t(
            "One rule per line, using original prefix => replacement prefix. Example: github.com/ => gh-proxy.net/github.com/. Rules apply to manifest and package downloads; the rewritten address must still use HTTPS.",
          )}
        >
          <TextArea
            value={settings.download.replacements}
            rows={5}
            mono
            spellCheck={false}
            placeholder={"github.com/ => gh-proxy.net/github.com/"}
            onChange={(replacements) => 写({ replacements })}
          />
        </SettingRow>
      </SettingsGroup>

      <SettingsGroup title={t("Runtime information")}>
        <SettingRow label={t("Package version")}>
          <Value>{诊断?.version || "—"}</Value>
        </SettingRow>
        <SettingRow label={t("Build profile")}>
          <Value>{诊断?.profile || "—"}</Value>
        </SettingRow>
        <SettingRow label={t("Target triple")}>
          <Value>{诊断?.target || "—"}</Value>
        </SettingRow>
        <SettingRow label={t("Operating system")}>
          <Value>{诊断?.os_pretty || "—"}</Value>
        </SettingRow>
        <SettingRow label={t("Architecture")}>
          <Value>{诊断?.arch || "—"}</Value>
        </SettingRow>
      </SettingsGroup>

      <SettingsGroup title={t("Advanced")}>
        <SettingRow label={t("Settings file")}>
          <ActionButton onClick={onOpenConfigDir}>{t("Open Folder…")}</ActionButton>
        </SettingRow>
        <SettingRow label={t("Reset to Defaults")}>
          <ActionButton onClick={onResetSettings}>{t("Reset")}</ActionButton>
        </SettingRow>
      </SettingsGroup>
    </>
  );
}
