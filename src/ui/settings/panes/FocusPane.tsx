



























import { useT } from "@/i18n";
import {
  ActionButton, NumberInput, SettingRow, SettingsGroup, Toggle,
} from "../primitives";
import { paneWriter, type PaneProps } from "./props";

export function FocusPane({ settings, onChange }: PaneProps) {
  const t = useT();
  const write = paneWriter(settings, onChange, "focus");
  const f = settings.focus;

  return (
    <>
      <SettingsGroup title={t("Account")}>
        <SettingRow label={t("Total focus time")}>
          <NumberInput
            value={f.total_minutes}
            min={1}
            max={600}
            suffix={t("min")}
            onChange={(total_minutes) => write({ total_minutes })}
          />
        </SettingRow>

        <SettingRow label={t("Alarm time")}>
          <NumberInput
            value={f.alarm_minutes}
            min={1}
            max={600}
            suffix={t("min")}
            onChange={(alarm_minutes) => write({ alarm_minutes })}
          />
        </SettingRow>
      </SettingsGroup>

      <SettingsGroup title={t("Weights")}>
        <SettingRow label={t("Focus credit per minute")}>
          <NumberInput
            value={f.gain_per_minute}
            min={0}
            max={10}
            step={0.5}
            suffix={t("min")}
            onChange={(gain_per_minute) => write({ gain_per_minute })}
          />
        </SettingRow>

        <SettingRow label={t("Charge per minute away")}>
          <NumberInput
            value={f.drain_per_minute}
            min={0}
            max={10}
            step={0.5}
            suffix={t("min")}
            onChange={(drain_per_minute) => write({ drain_per_minute })}
          />
        </SettingRow>
      </SettingsGroup>

      <SettingsGroup title={t("Grace period")}>
        <SettingRow label={t("Grace before charging")}>
          <NumberInput
            value={f.grace_seconds}
            min={0}
            max={300}
            suffix={t("sec")}
            onChange={(grace_seconds) => write({ grace_seconds })}
          />
        </SettingRow>

        {

                                             }
        <SettingRow label={t("These apps do not count as slacking")}>
          {






                                                       }
          <ActionButton disabled title={t("Decided against: it would have to read other applications' active window, and this feature is not worth crossing the application boundary for.")}>
            {t("Not enabled")}
          </ActionButton>
        </SettingRow>
      </SettingsGroup>

      <SettingsGroup title={t("Alarm")}>
        <SettingRow label={t("Play the alarm")}>
          <Toggle checked={f.sound} onChange={(sound) => write({ sound })} />
        </SettingRow>
      </SettingsGroup>

      {



                                             }
    </>
  );
}
