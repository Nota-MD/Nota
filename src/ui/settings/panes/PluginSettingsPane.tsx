







import type { PluginInfo } from "@/bridge/ipc";
import { useT } from "@/i18n";
import type { pluginAction } from "@/ui/usePlugins";
import {
  Note,
  Range,
  SettingRow,
  SettingsGroup,
  TextArea,
  TextInput,
  Toggle,
} from "../primitives";

export function PluginSettingsPane({
  plugins,
  action,
}: {
  plugins: PluginInfo[];
  action: pluginAction;
}) {
  const t = useT();
  const hasSettingsOf = plugins.filter((plugin) => plugin.settings.length > 0);

  if (hasSettingsOf.length === 0) {
    return (
      <Note>
        {t(
          "No installed extension has declared settings for Nota to display. Extensions can add these controls in their own plugin.toml.",
        )}
      </Note>
    );
  }

  return (
    <>
      {hasSettingsOf.map((plugin) => (
        <SettingsGroup key={plugin.id} title={plugin.name}>
          {plugin.settings.map((setting) => (
            <SettingRow
              key={`${plugin.id}:${setting.key}`}
              label={setting.label}
              searchText={`${plugin.id} ${plugin.name} ${setting.key}`}
              description={
                setting.help ? (
                  <span className="plugin-desc">{setting.help}</span>
                ) : undefined
              }
            >
              {setting.kind === "range" ? (
                <Range
                  value={setting.value}
                  min={setting.min}
                  max={setting.max}
                  step={setting.step}
                  suffix={setting.unit}
                  title={setting.help || undefined}
                  onChange={(value) => void action.settings(plugin.id, setting.key, value)}
                />
              ) : setting.kind === "toggle" ? (
                <Toggle
                  checked={setting.on}
                  onChange={(value) => void action.settings(plugin.id, setting.key, value)}
                />
              ) : setting.multiline ? (
                <TextArea
                  value={setting.text}
                  rows={6}
                  placeholder={setting.placeholder || undefined}
                  title={setting.help || undefined}
                  onChange={(value) => void action.settings(plugin.id, setting.key, value)}
                />
              ) : (
                <TextInput
                  value={setting.text}
                  secret={setting.secret}
                  width="lg"
                  placeholder={setting.placeholder || undefined}
                  title={setting.help || undefined}
                  onChange={(value) => void action.settings(plugin.id, setting.key, value)}
                />
              )}
            </SettingRow>
          ))}
        </SettingsGroup>
      ))}
    </>
  );
}
