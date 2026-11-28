
































import { useEffect, useState } from "react";

import { api, type AppLang, type NotificationPosition } from "@/bridge/ipc";
import type { SettingsExportReport } from "@/bridge/types-settings-export";
import { useT } from "@/i18n";
import {
  ActionButton,
  SettingRow,
  SettingsGroup,
  Select,
  TextArea,
  Toggle,
  Value,
} from "../primitives";
import { SettingsExportDialog } from "../SettingsExportDialog";
import { SettingsImportDialog } from "../SettingsImportDialog";
import { SoftwareUpdatePane } from "@/ui/SoftwareUpdatePane";
import { open } from "@/ui/file-picker";
import { paneWriter, type PaneProps } from "./props";

export function GeneralPane({
  settings,
  settingsPresentation,
  onChange,
  onResetSettings,
}: PaneProps) {


  const t = useT();
  const write = paneWriter(settings, onChange, "general");
  const writeBelowLoad = paneWriter(settings, onChange, "download");
  const writeUpdate = paneWriter(settings, onChange, "updates");



  const [languageTable, setLanguageTable] = useState<AppLang | null>(null);
  const [exportPackageOpen, setExportPackageOpen] = useState(false);
  const [importPackagePath, setImportPackagePath] = useState<string | null>(null);
  const [exportResult, setExportResult] = useState<SettingsExportReport | null>(null);
  const [exportError, setExportError] = useState<string | null>(null);
  const [importResult, setImportResult] = useState<{
    path: string;
    restartRequired: boolean;
  } | null>(null);
  const [importError, setImportError] = useState<string | null>(null);
  useEffect(() => {
    let returnActiveActive = true;
    void api
      .appLang()
      .then((r) => {
        if (returnActiveActive) setLanguageTable(r);
      })
      .catch(() => {

      });
    return () => {
      returnActiveActive = false;
    };
  }, []);

  const POSITIONS: Array<{ value: NotificationPosition; label: string }> = [
    { value: "bottom-right", label: t("Bottom right") },
    { value: "top-center", label: t("Top center") },
  ];

  const chooseImportPackage = async () => {
    const path = await open({
      title: t("Choose settings package"),
      multiple: false,
      filters: [
        { name: t("Nota settings package"), extensions: ["nota-backup", "zip"] },
      ],
    }).catch(() => null);
    if (path) setImportPackagePath(path);
  };

  return (
    <>
      <SettingsGroup title={t("Interface language")}>
        <SettingRow
          label={t("Language")}
          description={
            languageTable
              ? t("In use right now: {0} (this cell stores the setting, which may be “Automatic”)", languageTable.effective)
              : t("Reading available languages…")
          }
        >
          <Select
            value={settings.general.language}
            onChange={(language) => write({ language })}
            options={[
              { value: "auto", label: t("Automatic (follow the system)") },



              ...(languageTable?.available ?? []).map((l) => ({ value: l.tag, label: l.label })),
            ]}
          />
        </SettingRow>
      </SettingsGroup>

      <SettingsGroup title={t("Extensions")}>
        <SettingRow
          label={t("Enable extensions")}
          description={t(
            "When off, every extension stops running and its menus, panels and settings pages are hidden. Installed extensions and their individual enabled states are kept.",
          )}
        >
          <Toggle
            checked={settings.general.extensions_enabled}
            onChange={(extensions_enabled) => write({ extensions_enabled })}
          />
        </SettingRow>
      </SettingsGroup>

      <SettingsGroup title={t("Updates")}>
        <SettingRow
          label={t("Check for updates at startup")}
          description={t(
            "Runs one update check in the background after Nota starts. Nota never downloads or installs an update without confirmation.",
          )}
        >
          <Toggle
            checked={settings.updates.check_on_startup}
            onChange={(check_on_startup) => writeUpdate({ check_on_startup })}
          />
        </SettingRow>
        <SettingRow
          label={t("Notify me when an update is available")}
          description={t(
            "Shows a persistent notification when the startup check finds a newer version. This option is available only when startup checks are enabled.",
          )}
        >
          <Toggle
            checked={settings.updates.notify_when_available}
            disabled={!settings.updates.check_on_startup}
            onChange={(notify_when_available) => writeUpdate({ notify_when_available })}
          />
        </SettingRow>
        <SettingRow
          label={t("Notification position")}
          description={t("Applies to all in-app notifications.")}
        >
          <Select
            value={settings.updates.notification_position}
            options={POSITIONS}
            onChange={(notification_position) => writeUpdate({ notification_position })}
          />
        </SettingRow>
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

      <SettingsGroup title={t("Downloads")}>
        <SettingRow
          label={t("Download replacement rules")}
          description={t(
            "One rule per line, using original prefix => replacement prefix. Example: github.com/ => gh-proxy.net/github.com/. Rules apply to application and extension update downloads; the rewritten address must still use HTTPS.",
          )}
        >
          <TextArea
            value={settings.download.replacements}
            rows={5}
            mono
            spellCheck={false}
            placeholder={"github.com/ => gh-proxy.net/github.com/"}
            onChange={(replacements) => writeBelowLoad({ replacements })}
          />
        </SettingRow>
      </SettingsGroup>

      <SettingsGroup title={t("Settings package")}>
        <SettingRow
          label={t("Export settings and data")}
          description={t(
            "Choose program settings, user data, and each extension's settings, data, or installation package independently. The result is a ZIP-based settings package, not an application installer.",
          )}
        >
          <ActionButton onClick={() => setExportPackageOpen(true)}>
            {t("Export settings package…")}
          </ActionButton>
        </SettingRow>
        <SettingRow
          label={t("Import settings and data")}
          description={t(
            "Inspect a Nota settings package before restoring safely selected settings, data, themes, and extension files.",
          )}
        >
          <ActionButton onClick={() => void chooseImportPackage()}>
            {t("Import settings package…")}
          </ActionButton>
        </SettingRow>
        {exportResult && (
          <SettingRow label={t("Last export")}>
            <Value>{exportResult.path}</Value>
          </SettingRow>
        )}
        {importResult && (
          <SettingRow label={t("Last import")}>
            <Value>
              {importResult.path}
              {importResult.restartRequired ? ` / ${t("Restart required")}` : ""}
            </Value>
          </SettingRow>
        )}
        {exportError && (
          <SettingRow label={t("Export failed")}>
            <Value>{exportError}</Value>
          </SettingRow>
        )}
        {importError && (
          <SettingRow label={t("Import failed")}>
            <Value>{importError}</Value>
          </SettingRow>
        )}
      </SettingsGroup>

      {exportPackageOpen && (
        <SettingsExportDialog
          presentation={settingsPresentation}
          onClose={() => setExportPackageOpen(false)}
          onExported={(report) => {
            setExportResult(report);
            setExportError(null);
            setExportPackageOpen(false);
          }}
          onError={(message) => setExportError(message)}
        />
      )}

      {importPackagePath && (
        <SettingsImportDialog
          initialPackagePath={importPackagePath}
          presentation={settingsPresentation}
          onClose={() => setImportPackagePath(null)}
          onImported={(report) => {
            setImportResult({
              path: report.package,
              restartRequired: report.restart_required,
            });
            setImportError(null);
            setImportPackagePath(null);
            if (report.settings) onChange(report.settings);
          }}
          onError={(message) => setImportError(message)}
        />
      )}

      <SettingsGroup title={t("Reset")}>
        <SettingRow
          label={t("Reset to Defaults")}
          description={t("Restore program settings to their factory values.")}
        >
          <ActionButton onClick={onResetSettings}>{t("Reset")}</ActionButton>
        </SettingRow>
      </SettingsGroup>
    </>
  );
}
