




































import { useCallback, useEffect, useRef, useState } from "react";

import { api, type ImageUploadSettings, type ImageUploadMethod } from "@/bridge/ipc";
import { useT } from "@/i18n";
import {
  ActionButton,
  Note,
  Select,
  SettingRow,
  SettingsGroup,
  TextArea,
  TextInput,
  Toggle,
} from "../primitives";
import type { PaneProps } from "./props";

export function ImageUploadGroup({ onOpenConfigDir }: PaneProps) {


  const t = useT();










  const squareMethodTable: Array<{ value: ImageUploadMethod; label: string }> = [

    { value: "post", label: t("POST (multipart/form-data)") },
    { value: "put", label: t("PUT (raw bytes)") },
  ];



  const [settings, setSettings] = useState<ImageUploadSettings | null>(null);


  const current = useRef<ImageUploadSettings | null>(null);













  const [readError, setReadError] = useState<string | null>(null);
  const [writeError, setWriteError] = useState<string | null>(null);

  useEffect(() => {
    let splitDone = false;



    api.image
      .uploadGet(null)
      .then((s) => {
        if (splitDone) return;
        current.current = s.settings;
        setSettings(s.settings);
      })
      .catch((e: unknown) => {
        if (splitDone) return;
        setReadError(String(e));
      });
    return () => {
      splitDone = true;
    };
  }, []);









  const write = useCallback((fillSmall: Partial<ImageUploadSettings>) => {
    const oldValue = current.current;
    if (!oldValue) return;
    const newValue = { ...oldValue, ...fillSmall };
    current.current = newValue;
    setSettings(newValue);
    api.image
      .uploadSet(newValue)
      .then(() => setWriteError(null))
      .catch((e: unknown) => {


        current.current = oldValue;
        setSettings(oldValue);


        setWriteError(String(e));
      });
  }, []);

  if (!settings) {



    if (readError === null) return null;
    return <Note>{t("Could not read the upload settings: ") + readError}</Note>;
  }

  return (
    <SettingsGroup title={t("Upload server")}>
      {writeError !== null && <Note>{t("That last save did not work: ") + writeError}</Note>}
      <SettingRow label={t("Enable upload")}>
        <Toggle checked={settings.enabled} onChange={(enabled) => write({ enabled })} />
      </SettingRow>

      {settings.enabled && (
        <>
          <SettingRow label={t("Server URL")}>
            <TextInput
              value={settings.url}
              width="lg"
              placeholder={t("https://images.example.com/upload")}
              onChange={(url) => write({ url })}
            />
          </SettingRow>

          <SettingRow label={t("Upload method")}>
            <Select value={settings.method} options={squareMethodTable} onChange={(method) => write({ method })} />
          </SettingRow>

          {settings.method === "post" && (
            <SettingRow label={t("File field name")}>
              <TextInput value={settings.field} onChange={(field) => write({ field })} />
            </SettingRow>
          )}

          <SettingRow label={t("Request headers")}>
            <TextArea
              value={settings.headers}
              mono
              rows={4}
              placeholder={t("Authorization: Bearer your-token")}
              onChange={(headers) => write({ headers })}
            />
          </SettingRow>

          <SettingRow label={t("Read the URL from the response")}>
            <TextInput
              value={settings.url_path}
              width="lg"
              placeholder="data.url"
              onChange={(url_path) => write({ url_path })}
            />
          </SettingRow>

          <SettingRow label={t("Field name for remote images")}>
            <TextInput
              value={settings.remote_field}
              placeholder="src"
              onChange={(remote_field) => write({ remote_field })}
            />
          </SettingRow>

          <SettingRow label={t("Allow automatic upload via YAML")}>
            <Toggle checked={settings.auto} onChange={(auto) => write({ auto })} />
          </SettingRow>
        </>
      )}

      {
                                              }
      <SettingRow label={t("Open the folder holding the settings file")}>
        <ActionButton onClick={onOpenConfigDir}>{t("Open in the file manager")}</ActionButton>
      </SettingRow>
    </SettingsGroup>
  );
}
