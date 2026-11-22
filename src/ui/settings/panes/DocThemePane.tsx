



































import { useT } from "@/i18n";
import {
  ActionButton,
  NumberInput,
  Select,
  SettingRow,
  SettingsGroup,
  Toggle,
  Value,
} from "../primitives";
import { useUiMode } from "@/ui/useUiMode";
import { generateEffectOfDocumentTheme, darkDedicatedUseAtGenerateEffect } from "@/ui/useDocTheme";
import { paneWriter, type PaneProps } from "./props";

export function DocThemePane({
  settings,
  docThemes,
  onOpenThemesDir,
  onRefreshThemes,
  onImportTheme,
  onChange,
}: PaneProps) {


  const t = useT();



  const d = settings.document;
  const write = paneWriter(settings, onChange, "document");




  //


  const mode = useUiMode(settings.ui_mode);
  const generateEffectid = generateEffectOfDocumentTheme(settings, mode);
  const darkThatValueSetAtGenerateEffect = darkDedicatedUseAtGenerateEffect(settings, mode);



  const showName = (id: string) => {
    if (!id) return t("No Theme (Built-in)");
    const has = docThemes.find((t) => t.id === id);
    if (has) return has.name;

    //




    //


    return t("{0} (theme not found — showing No Theme instead)", id);
  };

  const themeOptions = [
    { value: "", label: t("No Theme (Built-in)") },
    ...docThemes.map((theme) => ({ value: theme.id, label: theme.name })),
    ...(generateEffectid && !docThemes.some((theme) => theme.id === generateEffectid)
      ? [{ value: generateEffectid, label: showName(generateEffectid) }]
      : []),
  ];

  const chooseTheme = (id: string) => {
    if (darkThatValueSetAtGenerateEffect) {
      onChange({
        appearance: {
          ...settings.appearance,
          dark_document_theme: id,
        },
      });
    } else {
      onChange({ document_theme: id });
    }
  };

  return (
    <>
    <SettingsGroup title={t("Document Themes")}>
      <SettingRow label={t("Current theme")}>
        <Select
          value={generateEffectid}
          options={themeOptions}
          onChange={chooseTheme}
        />
      </SettingRow>

      <SettingRow label={t("Document themes folder")}>
        {
                                                       }
        <div className="stg-inline stg-theme-actions">
          <ActionButton onClick={onOpenThemesDir}>{t("Document themes folder…")}</ActionButton>
          <ActionButton onClick={onRefreshThemes}>{t("Refresh")}</ActionButton>
          <ActionButton onClick={onImportTheme}>{t("Import ZIP or CSS…")}</ActionButton>
        </div>
      </SettingRow>
    </SettingsGroup>

    {








                                        }
    <SettingsGroup title={t("Line height")}>
      <SettingRow>
        <Toggle
          checked={d.custom_line_height}
          onChange={(custom_line_height) => write({ custom_line_height })}
        />
      </SettingRow>
      <SettingRow label={t("Line-height multiple")}>
        <NumberInput
          value={d.line_height}
          min={100}
          max={300}
          step={5}
          suffix="%"
          disabled={!d.custom_line_height}
          onChange={(line_height) => write({ line_height })}
        />
      </SettingRow>
    </SettingsGroup>

    <SettingsGroup title={t("Paragraph spacing")}>
      <SettingRow>
        <Toggle
          checked={d.custom_paragraph_gap}
          onChange={(custom_paragraph_gap) => write({ custom_paragraph_gap })}
        />
      </SettingRow>
      <SettingRow label={t("Spacing size")}>
        <NumberInput
          value={d.paragraph_gap}
          min={0}
          max={300}
          step={5}
          suffix="%"
          disabled={!d.custom_paragraph_gap}
          onChange={(paragraph_gap) => write({ paragraph_gap })}
        />
      </SettingRow>
    </SettingsGroup>

    <SettingsGroup title={t("Body font")}>
      <SettingRow>
        <Toggle checked={d.custom_font} onChange={(custom_font) => write({ custom_font })} />
      </SettingRow>
      <SettingRow label={t("Font family")}>
        <Select
          value={d.font}
          options={[
            { value: "sans", label: t("Sans-serif") },
            { value: "serif", label: t("Serif") },
            { value: "mono", label: t("Monospace") },
          ]}
          disabled={!d.custom_font}
          onChange={(font) => write({ font })}
        />
      </SettingRow>
    </SettingsGroup>

    <SettingsGroup title={t("Body font size")}>
      <SettingRow>
        <Toggle
          checked={d.custom_font_size}
          onChange={(custom_font_size) => write({ custom_font_size })}
        />
      </SettingRow>
      <SettingRow label={t("Size multiple")}>
        <NumberInput
          value={d.font_size}
          min={80}
          max={200}
          step={2}
          suffix="%"
          onChange={(font_size) =>
            write({ font_size, custom_font_size: true })
          }
        />
      </SettingRow>
    </SettingsGroup>

    {





                                                  }
    <SettingsGroup title={t("Scope of the four items above")}>
      <SettingRow label={t("Scope")}>
        <Value>{t("Display only — the file is untouched")}</Value>
      </SettingRow>
    </SettingsGroup>

    {darkThatValueSetAtGenerateEffect && (
      <SettingsGroup title={t("Dark mode uses a separate set of settings")}>
        {

                                      }
        <SettingRow label={t("Light mode uses")}>
          <Value>{showName(settings.document_theme)}</Value>
        </SettingRow>
      </SettingsGroup>
    )}
    </>
  );
}
