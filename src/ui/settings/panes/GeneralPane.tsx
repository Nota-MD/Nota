/**
 * 「通用」那一页。
 *
 * ⚠️⚠️ **2026-10-04 起本页只有五组，一段说明都没有。** 用户那一轮的总口径是
 * 「删掉各种菜单下面大段大段的无用ai味描述」，删的尺度选的是**全删**
 * （"只留设置名 ＋ 控件"）。以前这里有**三段**说明落在界面上——「对话框」组
 * 里一段（讲"为什么不做一个『重置全部警告提示』"）、「快捷键」组里一段
 * （讲快捷键那一页在哪）、页尾一段（把七项"没做的"逐条给理由）——**三段全没了**。
 *
 * ⚠️ **那两段说明消失之后，「对话框」与「快捷键」两组自己也空了**（组里一行都
 * 没有、只剩一个组标题），所以那两组**整个去掉了**。整组只有标题、没有行时，
 * `styles/settings.css` 那条 `.stg-group:not(:has(.stg-row))` 本来就会把它
 * `display: none` 掉——那是个**兜底**（防"写了但画不出来"），不是给"空组"用的：
 * 留着两段空 JSX 只会让下一个人以为这里有东西没渲染出来。
 *
 * ⚠️ **那七条理由没有消失，只是不再显示给用户**，改记在这儿（`docs/10`
 * 的「不做的事与理由」表里也有）：
 *
 * | 没做的那一项 | 理由 |
 * |---|---|
 * | 语言（重启后生效） | **做了**（2026-09-25，用户要求）。 |
 * | 许可证信息 | **只放在「关于 → 法律信息」**。通用设置不重复展示同一份许可证；全文仍由 `ui/LicenseDialog.tsx` 提供。 |
 * | 快捷键 | 有，但不在这页——**独立的「快捷键」页**。 |
 * | 重置全部警告提示对话框 | **不做**。它要的是一份"用户点过不再提示"的记录，而 Nota 目前一个可静音的对话框都没有。留一个按了没反应的按钮更糟。 |
 * | 高级设置 | **做**，落法不同：见下面「高级设置」那一组。 |
 * | 发送匿名使用数据 | **不做**。`docs/10-feature-matrix.md` 的「不做的事与理由」表里写着：无遥测、无许可证校验。 |
 * | 在线服务器设置 | **不适用**。Nota 不发任何网络请求。 |
 *
 * ⚠️ 「高级设置」在别处是**另开一个窗口**编辑一份配置文件。
 * Nota 不做第二个设置界面——设置本身就是一份 TOML，直接打开那个文件夹、
 * 或者一键恢复默认，比再造一个窗口更简单。
 */

import { useEffect, useState } from "react";

import { api, type AppLang, type NotificationPosition } from "@/bridge/ipc";
import type { SettingsExportReport } from "@/bridge/types-settings-export";
import { useT } from "@/i18n";
import { ActionButton, SettingRow, SettingsGroup, Select, TextArea, Value } from "../primitives";
import { SettingsExportDialog } from "../SettingsExportDialog";
import { paneWriter, type PaneProps } from "./props";

export function GeneralPane({ settings, onChange, onResetSettings }: PaneProps) {
  // 订阅语言（宿主报来语言之后这一块要重画，见 `i18n/index.ts::useT`）。
  // 局部这个名字盖住模块级的 `t`，下面全都用它。
  const t = useT();
  const write = paneWriter(settings, onChange, "general");
  const writeBelowLoad = paneWriter(settings, onChange, "download");
  const writeUpdate = paneWriter(settings, onChange, "updates");

  // 可选的语言**由宿主给**（`nota_app_lang.available`），前端不列第二份。
  // 拉不到就只画「自动」——下拉少几项比画错标签好。
  const [languageTable, setLanguageTable] = useState<AppLang | null>(null);
  const [exportPackageOpen, setExportPackageOpen] = useState(false);
  const [exportResult, setExportResult] = useState<SettingsExportReport | null>(null);
  const [exportError, setExportError] = useState<string | null>(null);
  useEffect(() => {
    let returnActiveActive = true;
    void api
      .appLang()
      .then((r) => {
        if (returnActiveActive) setLanguageTable(r);
      })
      .catch(() => {
        // 拉不到不算错误：这一页其余部分照常能用，下拉里就只剩「自动」。
      });
    return () => {
      returnActiveActive = false;
    };
  }, []);

  const POSITIONS: Array<{ value: NotificationPosition; label: string }> = [
    { value: "bottom-right", label: t("Bottom right") },
    { value: "top-center", label: t("Top center") },
  ];

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
              // ⚠️ `l.label` **不包 `t()`**：那是宿主送来的数据（`nota_app_lang`
              // 的 `available`），语言名要用**它自己那门语言**写，见
              // `src-tauri/src/lang.rs::语言名`。
              ...(languageTable?.available ?? []).map((l) => ({ value: l.tag, label: l.label })),
            ]}
          />
        </SettingRow>
      </SettingsGroup>

      <SettingsGroup title={t("Notifications")}>
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
            "Choose program settings, user data, and each extension's settings or data independently. The result is a ZIP-based settings package, not an application installer.",
          )}
        >
          <ActionButton onClick={() => setExportPackageOpen(true)}>
            {t("Export settings package…")}
          </ActionButton>
        </SettingRow>
        {exportResult && (
          <SettingRow label={t("Last export")}>
            <Value>{exportResult.path}</Value>
          </SettingRow>
        )}
        {exportError && (
          <SettingRow label={t("Export failed")}>
            <Value>{exportError}</Value>
          </SettingRow>
        )}
      </SettingsGroup>

      {exportPackageOpen && (
        <SettingsExportDialog
          onClose={() => setExportPackageOpen(false)}
          onExported={(report) => {
            setExportResult(report);
            setExportError(null);
            setExportPackageOpen(false);
          }}
          onError={(message) => setExportError(message)}
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
