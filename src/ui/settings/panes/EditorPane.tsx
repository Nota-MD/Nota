






















import type { LineEnding } from "@/bridge/ipc";
import { useT } from "@/i18n";
import {
  NumberInput,
  Radio,
  Range,
  SettingRow,
  SettingsGroup,
  Toggle,
} from "../primitives";
import { paneWriter, type PaneProps } from "./props";
import { SpellLangPicker } from "./SpellLangPicker";

export function EditorPane({ settings, onChange }: PaneProps) {


  const t = useT();
  const write = paneWriter(settings, onChange, "editor");
  const e = settings.editor;





  const LINE_ENDINGS: Array<{ value: LineEnding; label: string }> = [
    { value: "lf", label: t("LF (\\n)") },
    { value: "crlf", label: t("CRLF (\\r\\n)") },
  ];

  return (
    <>
      <SettingsGroup title={t("Text width")}>
        <SettingRow label={t("Limit text width")}>
          <Toggle
            checked={settings.limit_text_width}
            onChange={(limit_text_width) => onChange({ limit_text_width })}
          />
        </SettingRow>
        {
                                 }
        {settings.limit_text_width && (
          <SettingRow>
            <Range
              value={settings.content_width}
              min={480}
              max={1200}
              step={20}
              suffix="px"
              onChange={(content_width) => onChange({ content_width })}
            />
          </SettingRow>
        )}
      </SettingsGroup>

      <SettingsGroup title={t("Default indent")}>
        <SettingRow>
          <NumberInput
            value={e.default_indent}
            min={1}
            max={8}
            onChange={(default_indent) => write({ default_indent })}
          />
        </SettingRow>
      </SettingsGroup>

      <SettingsGroup title={t("First-line indent")}>
        <SettingRow>
          <Toggle
            checked={e.paragraph_indent}
            onChange={(paragraph_indent) => write({ paragraph_indent })}
          />
        </SettingRow>
        <SettingRow label={t("Indent width")}>
          <NumberInput
            value={e.paragraph_indent_chars}
            min={1}
            max={8}
            disabled={!e.paragraph_indent}
            onChange={(paragraph_indent_chars) => write({ paragraph_indent_chars })}
          />
        </SettingRow>
      </SettingsGroup>

      <SettingsGroup title={t("Auto pair")}>
        <SettingRow label={t("Pair brackets, quotes and Markdown markers while typing")}>
          <Toggle checked={e.auto_pair} onChange={(auto_pair) => write({ auto_pair })} />
        </SettingRow>
      </SettingsGroup>

      <SettingsGroup title={t("Keyboard experience optimization")}>
        <SettingRow
          label={t("Reveal link and image source at the caret")}
          description={t(
            "Show Markdown around links and images when the caret reaches them. Clicking a link also stays in the editor instead of opening the link dialog.",
          )}
        >
          <Toggle
            checked={e.keyboard_experience}
            onChange={(keyboard_experience) => write({ keyboard_experience })}
          />
        </SettingRow>
      </SettingsGroup>

      <SettingsGroup title={t("Emoji autocomplete")}>
        <SettingRow>
          <Toggle
            checked={e.emoji_autocomplete}
            onChange={(emoji_autocomplete) => write({ emoji_autocomplete })}
          />
        </SettingRow>
      </SettingsGroup>

      <SettingsGroup title={t("Line endings")}>
        <SettingRow>
          <Radio
            value={e.line_ending}
            options={LINE_ENDINGS}
            onChange={(line_ending) => write({ line_ending })}
          />
        </SettingRow>
      </SettingsGroup>

      <SettingsGroup title={t("Spell check")}>
        <SettingRow>
          <Toggle checked={e.spellcheck} onChange={(spellcheck) => write({ spellcheck })} />
        </SettingRow>
        {
                                                   }
        {e.spellcheck && (



          <SettingRow
            label={t("Languages")}
            description={t(
              "More than one can be checked at once — words are checked against all of them. Nota ships no dictionaries; if a language has none on this machine, it will say so.",
            )}
          >
            <SpellLangPicker
              value={e.spellcheck_langs}
              onChange={(spellcheck_langs) => write({ spellcheck_langs })}
            />
          </SettingRow>
        )}
      </SettingsGroup>

    </>
  );
}
