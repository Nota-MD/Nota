/**
 * 开发者模式专用页。
 *
 * 它只回答问题“开发者模式现在开着没有、怎么关”，调试信息的查看和其它工具
 * 放在独立的「高级设置」页。这样版本号五连点打开的是开发者模式，而左栏会同时
 * 出现「高级设置」和「开发者模式」两项，二者职责不混。
 */

import { useEffect, useState } from "react";

import { api } from "@/bridge/ipc";
import type { DevBridgeStatus } from "@/bridge/types";
import { useT } from "@/i18n";
import {
  DeveloperBridgeDialog,
  DeveloperBridgeStatusRow,
} from "@/ui/DeveloperBridgeDialog";
import { ActionButton, SettingRow, SettingsGroup, Toggle, Value } from "../primitives";
import type { PaneProps } from "./props";

export function DebugPane({ settings, onChange, onOpenConfigDir }: PaneProps) {
  const t = useT();
  const [bridgeStatus, setBridgeStatus] = useState<DevBridgeStatus | null>(null);
  const [bridgeOpen, setBridgeOpen] = useState(false);

  const refreshBridge = () => {
    void api.devBridge.status().then(setBridgeStatus).catch(() => setBridgeStatus(null));
  };

  useEffect(() => {
    refreshBridge();
    const timer = window.setInterval(refreshBridge, 2000);
    return () => window.clearInterval(timer);
  }, []);

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
          label={t("Debug log")}
          description={t(
            "Opens a live terminal-style backend log in a separate window. The log window is intentionally unstyled and untranslated.",
          )}
        >
          <ActionButton onClick={() => void api.window.openDebugLog()}>
            {t("Open Log")}
          </ActionButton>
        </SettingRow>
        <SettingRow
          label={t("Element hover inspector")}
          description={t(
            "Show the computed font, colors, box size and padding below the interface element under the pointer.",
          )}
        >
          <Toggle
            checked={settings.general.element_inspector}
            onChange={(element_inspector) =>
              onChange({
                general: { ...settings.general, element_inspector },
              })
            }
          />
        </SettingRow>
        <SettingRow
          label={t("Lua extension auto-reload")}
          description={t(
            "Watch installed extension folders and reload after Lua or plugin.toml changes. Failed reloads keep the previous working extension.",
          )}
        >
          <Toggle
            checked={settings.general.lua_hot_reload}
            onChange={(lua_hot_reload) =>
              onChange({
                general: { ...settings.general, lua_hot_reload },
              })
            }
          />
        </SettingRow>
        <SettingRow
          label={t("Selectable interface text")}
          description={t(
            "Allow dragging to select labels and other interface text. Document content and input fields remain selectable either way.",
          )}
        >
          <Toggle
            checked={settings.general.select_ui_text ?? false}
            onChange={(select_ui_text) =>
              onChange({
                general: { ...settings.general, select_ui_text },
              })
            }
          />
        </SettingRow>
        <SettingRow
          label={t("Developer bridge")}
          description={t(
            "Expose the authenticated Host Control API to Nota DevKit. Access is protected by a password, a five-step confirmation and an IP whitelist.",
          )}
        >
          <DeveloperBridgeStatusRow
            status={bridgeStatus}
            onEnable={() => setBridgeOpen(true)}
            onDisable={() => {
              void api.devBridge.disable().then(setBridgeStatus);
              onChange({
                general: { ...settings.general, dev_bridge_enabled: false },
              });
            }}
            onRevoke={() => {
              void api.devBridge.revoke().then(setBridgeStatus);
            }}
          />
        </SettingRow>
        <SettingRow label={t("Settings file")}>
          <ActionButton onClick={onOpenConfigDir}>{t("Open Folder…")}</ActionButton>
        </SettingRow>
        <SettingRow label={t("Disable developer mode")}>
          <ActionButton
            onClick={() => {
              onChange({
                general: {
                  ...settings.general,
                  debug_mode: false,
                  lua_hot_reload: false,
                  dev_bridge_enabled: false,
                },
              });
              void api.devBridge.disable().then(setBridgeStatus);
            }}
          >
            {t("Disable")}
          </ActionButton>
        </SettingRow>
      </SettingsGroup>
      {bridgeOpen ? (
        <DeveloperBridgeDialog
          general={settings.general}
          passwordSet={bridgeStatus?.password_set ?? false}
          onChange={(general) => {
            onChange({ general });
            refreshBridge();
          }}
          onClose={() => setBridgeOpen(false)}
        />
      ) : null}
    </>
  );
}
