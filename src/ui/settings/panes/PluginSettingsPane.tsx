/**
 * 「插件设置」页：只画插件在清单里通过 `[[settings]]` 声明、请宿主代画的控件。
 *
 * 与「拓展管理」分开后，两个页签各自只回答一个问题：这里回答“这个插件能调
 * 什么”，管理页回答“装了哪些、从哪来、怎么更新或卸载”。页面仍不认插件 id，
 * 只认声明里的 `kind`，所以新插件只要写清单就会自动出现。
 */

import type { PluginInfo } from "@/bridge/ipc";
import { useT } from "@/i18n";
import type { 插件动作 } from "@/ui/usePlugins";
import {
  Note,
  Range,
  SettingRow,
  SettingsGroup,
  TextInput,
  Toggle,
} from "../primitives";

export function PluginSettingsPane({
  plugins,
  动作,
}: {
  plugins: PluginInfo[];
  动作: 插件动作;
}) {
  const t = useT();
  const 有设置的 = plugins.filter((plugin) => plugin.settings.length > 0);

  if (有设置的.length === 0) {
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
      {有设置的.map((plugin) => (
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
                  onChange={(value) => void 动作.设置(plugin.id, setting.key, value)}
                />
              ) : setting.kind === "toggle" ? (
                <Toggle
                  checked={setting.on}
                  onChange={(value) => void 动作.设置(plugin.id, setting.key, value)}
                />
              ) : (
                <TextInput
                  value={setting.text}
                  secret={setting.secret}
                  width="lg"
                  placeholder={setting.placeholder || undefined}
                  title={setting.help || undefined}
                  onChange={(value) => void 动作.设置(plugin.id, setting.key, value)}
                />
              )}
            </SettingRow>
          ))}
        </SettingsGroup>
      ))}
    </>
  );
}
