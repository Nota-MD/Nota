/**
 * 「通用」那一页。
 *
 * ⚠️⚠️ **本页只有两组，另加三段说明。** 逐条说明为什么，
 * 而且这些理由**出现在界面上**（「对话框」「快捷键」两组里各有一段，
 * 页尾还有一段）——不是"偷偷不做"，而是"明说这一条为什么不该有"：
 *
 * | 没做的那一项 | 理由 |
 * |---|---|
 * | 语言（重启后生效） | **做了**（2026-09-25，用户要求）。⚠️ 但要说实话：**英文翻译现在只覆盖插件那一面**（插件栏、面板内容块、编辑区预览），应用其余部分仍是中文。两者一起换才不会出现"界面英文、插件中文"的中间态。 |
 * | 许可证信息 | **改为直接显示许可证**。Nota 是 BSD-2-Clause，没有"激活"这回事。 |
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

import { api, type AppLang } from "@/bridge/ipc";
import { useT } from "@/i18n";
import { ActionButton, Note, SettingRow, SettingsGroup, Select, Toggle, Value } from "../primitives";
import { paneWriter, type PaneProps } from "./props";

export function GeneralPane({ settings, onChange, onOpenConfigDir, onResetSettings }: PaneProps) {
  // 订阅语言（宿主报来语言之后这一块要重画，见 `i18n/index.ts::useT`）。
  // 局部这个名字盖住模块级的 `t`，下面全都用它。
  const t = useT();
  const 写 = paneWriter(settings, onChange, "general");

  // 可选的语言**由宿主给**（`nota_app_lang.available`），前端不列第二份。
  // 拉不到就只画「自动」——下拉少几项比画错标签好。
  const [语言表, set语言表] = useState<AppLang | null>(null);
  useEffect(() => {
    let 还活着 = true;
    void api
      .appLang()
      .then((r) => {
        if (还活着) set语言表(r);
      })
      .catch(() => {
        // 拉不到不算错误：这一页其余部分照常能用，下拉里就只剩「自动」。
      });
    return () => {
      还活着 = false;
    };
  }, []);

  return (
    <>
      <SettingsGroup
        title={t("Interface language")}
        help={t(
          "⚠️ Takes effect after a restart. Because extensions read their own text tables (lang/<tag>.toml) at startup, switching language while running would mean reinstalling every extension (running on_unload / on_load, some of which do git and HTTP). Change this, then restart once.",
        )}
      >
        <SettingRow
          label={t("Language")}
          help={t(
            "“Automatic” follows the system (LC_ALL / LC_MESSAGES / LANG). ⚠ A system language that is not in the list falls back to English.",
          )}
          description={
            语言表
              ? t("In use right now: {0} (this cell stores the setting, which may be “Automatic”)", 语言表.effective)
              : t("Reading available languages…")
          }
        >
          <Select
            value={settings.general.language}
            onChange={(language) => 写({ language })}
            options={[
              { value: "auto", label: t("Automatic (follow the system)") },
              // ⚠️ `l.label` **不包 `t()`**：那是宿主送来的数据（`nota_app_lang`
              // 的 `available`），语言名要用**它自己那门语言**写，见
              // `src-tauri/src/lang.rs::语言名`。
              ...(语言表?.available ?? []).map((l) => ({ value: l.tag, label: l.label })),
            ]}
          />
        </SettingRow>

        {/* ⚠️ 2026-09-26 改的：这一段原来写的是「英文翻译**现在还只覆盖插件那一面**」。
            英文表当天铺到了整个界面，那句话就成了**界面在撒谎**——用户读完会以为
            菜单、设置那些地方还是中文，于是根本不去试。这类"曾经为真"的说明句
            没有东西会提醒它过期，只能靠改语言这件事**同批**改掉。 */}
        <Note>
          {t("The English translation")}
          <strong>{t("now covers the whole interface")}</strong>
          {t(": the menu bar, settings, status bar, sidebar, dialogs and the extension dock are all included. Both halves follow the same rules and switch together, so they are always changed as a pair.")}
        </Note>
      </SettingsGroup>

      <SettingsGroup
        title={t("Debug mode")}
        help={t(
          "Also print internal diagnostics to the console (Developer Tools → Console). ⚠ It only adds logging and changes no behaviour — any design where turning debug mode on switches to a different code path makes “works for me” reports worthless. Off by default: most users never open the console and would only notice the app feeling slower.",
        )}
      >
        <SettingRow>
          <Toggle checked={settings.general.debug_mode} onChange={(debug_mode) => 写({ debug_mode })} />
        </SettingRow>
      </SettingsGroup>

      <SettingsGroup
        title={t("Advanced")}
        help={t(
          "Nota's settings are a plain-text TOML file — there is no second interface. To change an option the UI does not expose, edit that file; if you break it, use the button below to restore the defaults.",
        )}
      >
        <SettingRow
          label={t("Settings file")}
          help={t(
            "Save the file and restart Nota for changes to take effect. ⚠ When editing by hand: scalars must come before all [tables]. A scalar placed after a table is silently ignored (the default is used instead, with no error).",
          )}
        >
          <ActionButton onClick={onOpenConfigDir}>{t("Open Folder…")}</ActionButton>
        </SettingRow>

        <SettingRow
          label={t("Reset to Defaults")}
          help={t(
            "Reset every setting to its default at once. ⚠ Settings only — documents are untouched, including their content, files and theme CSS.",
          )}
        >
          <ActionButton onClick={onResetSettings}>{t("Reset")}</ActionButton>
        </SettingRow>
      </SettingsGroup>

      <SettingsGroup title={t("License")}>
        <SettingRow label="Nota">
          <Value>BSD-2-Clause</Value>
        </SettingRow>
        <SettingRow label={t("Interface icons")}>
          <Value>{t("BSD-2-Clause (Folio, same author)")}</Value>
        </SettingRow>

        <Note>
          {t("The complete list of third-party components, with versions and licenses, is in")}
          {" "}
          <code>THIRD-PARTY.md</code>
          {" "}
          {t("at the root of the repository. Nota")}
          {" "}
          <strong>{t("makes no network requests")}</strong>
          {t(", has no telemetry, and needs no activation.")}
        </Note>
      </SettingsGroup>

      <SettingsGroup title={t("Dialogs")}>
        <Note>
          {t(
            "There is no “Reset all warning dialogs” here: that would need a record of “don't show again” choices, and Nota has no mutable dialog yet. It will be added once one exists — a button that does nothing is worse than no button.",
          )}
        </Note>
      </SettingsGroup>

      <SettingsGroup title={t("Shortcuts")}>
        <Note>
          {t("The list of key bindings is on the")}
          <strong>{t("Shortcuts")}</strong>
          {t(" page on the left — it is read from the menu, so it cannot disagree with the menu.")}
        </Note>
      </SettingsGroup>

      <Note>
        {t("This page")}
        <strong>{t("deliberately")}</strong>
        {t("leaves out three items: license information (see the License group above), anonymous usage data (there is no telemetry), and online server settings (Nota makes no network requests) — each reason is written up in")}
        {" "}
        <code>docs/10-feature-matrix.md</code>
        {t("and")}
        <code>settings/general.rs</code>
        {t(" at the top.")}
      </Note>
    </>
  );
}
