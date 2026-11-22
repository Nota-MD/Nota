























import type { InsertImageAction } from "@/bridge/ipc";
import { useT } from "@/i18n";
import { Select, SettingRow, SettingsGroup, TextInput, Toggle } from "../primitives";
import { ImageUploadGroup } from "./ImageUploadGroup";
import { paneWriter, type PaneProps } from "./props";

export function ImagePane(props: PaneProps) {


  const t = useT();
  const { settings, onChange } = props;
  const write = paneWriter(settings, onChange, "image");
  const i = settings.image;










  const INSERT: Array<{ value: InsertImageAction; label: string }> = [
    { value: "none", label: t("Nothing special") },
    { value: "copy-to-current-dir", label: t("Copy to the current folder") },
    { value: "copy-to-assets", label: t("Copy to ./assets") },
    { value: "copy-to-doc-assets", label: t("Copy to ./$(filename).assets") },
    { value: "copy-to-custom", label: t("Copy to a custom path") },
  ];

  return (
    <>
      {








        }
      <SettingsGroup title={t("When inserting an image")}>
        <SettingRow>
          <Select
            value={i.insert_action}
            options={INSERT}
            onChange={(insert_action) => write({ insert_action })}
          />
        </SettingRow>

        {i.insert_action === "copy-to-custom" && (
          <SettingRow label={t("Custom path")}>
            <TextInput
              value={i.custom_dir}
              width="lg"
              placeholder={t("e.g. /home/me/Pictures, or ./img")}
              onChange={(custom_dir) => write({ custom_dir })}
            />
          </SettingRow>
        )}
      </SettingsGroup>

      <SettingsGroup title={t("Which images the rule above applies to")}>
        <SettingRow label={t("Images from local paths")}>
          <Toggle
            checked={i.apply_to_local}
            onChange={(apply_to_local) => write({ apply_to_local })}
          />
        </SettingRow>

        <SettingRow label={t("Images from web URLs")}>
          <Toggle
            checked={i.apply_to_remote}
            onChange={(apply_to_remote) => write({ apply_to_remote })}
          />
        </SettingRow>
      </SettingsGroup>

      <SettingsGroup title={t("Image syntax preferences")}>
        <SettingRow label={t("Prefer relative paths")}>
          <Toggle
            checked={i.prefer_relative}
            onChange={(prefer_relative) => write({ prefer_relative })}
          />
        </SettingRow>

        <SettingRow label={t("Add ./ to relative paths")}>
          <Toggle checked={i.add_dot_slash} onChange={(add_dot_slash) => write({ add_dot_slash })} />
        </SettingRow>

        <SettingRow label={t("Escape URLs when inserting")}>
          <Toggle checked={i.escape_url} onChange={(escape_url) => write({ escape_url })} />
        </SettingRow>
      </SettingsGroup>

      <ImageUploadGroup {...props} />
    </>
  );
}
