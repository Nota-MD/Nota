import type { PluginInfo, PluginUpdateInfo, trustRecord } from "@/bridge/ipc";
import { useT } from "@/i18n";
import { comeSourceDescription, ableForceName, languageMismatch, languageHint, languageTag } from "@/ui/pluginText";
import { pluginApiHintKey } from "@/ui/plugin-api";
import type { pluginAction } from "@/ui/usePlugins";
import { ActionButton, Note, SettingRow, SettingsGroup, Value } from "../primitives";


export interface ExpandExtendPageEnterParameter {

  plugins: PluginInfo[];

  messageTask: trustRecord[];

  updates: PluginUpdateInfo[];

  action: pluginAction;
}

export function ExtensionsPane({ plugins, messageTask, updates, action }: ExpandExtendPageEnterParameter) {


  const t = useT();


  const busy = action.busy;
  const disabled2 = busy !== null;
  const updateTable = new Map(updates.map((update) => [update.id, update]));
  const updatable = updates.filter((update) => update.available);

  return (
    <>
      <SettingsGroup title={t("Extensions")}>
        <SettingRow
          label={t("Extension updates")}
          description={t(
            "Installed extensions can declare a trusted latest.json repository. Updates use the same package validation and atomic replacement as file installation.",
          )}
        >
          <div className="stg-inline">
            <ActionButton disabled={disabled2} onClick={() => void action.checkForUpdates()}>
              {busy === "check for updates" ? t("Checking…") : t("Check for Updates")}
            </ActionButton>
            <ActionButton disabled={disabled2 || updatable.length === 0} onClick={() => void action.updateAll()}>
              {busy === "update all"
                ? t("Updating…")
                : t("Update All ({0})", updatable.length)}
            </ActionButton>
          </div>
        </SettingRow>

        <SettingRow label={t("Install from file…")}>
          <ActionButton disabled={disabled2} onClick={() => void action.install()}>
            {busy === "install" ? t("Installing…") : t("Choose an extension package…")}
          </ActionButton>
        </SettingRow>

        <SettingRow label={t("Extension folder")}>
          <ActionButton disabled={disabled2} onClick={() => void action.openDirectory2()}>
            {t("Open Folder…")}
          </ActionButton>
        </SettingRow>
      </SettingsGroup>

      {

                                                 }
      {plugins.length === 0 ? (
        <Note>
          {t("No extensions are installed. Use “Install from file…” to install one. An extension package includes plugin.toml and its entry file, and is available immediately after installation.")}
        </Note>
      ) : (
        <SettingsGroup title={t("Installed extensions")}>
          {plugins.map((p) => (
            <SettingRow
              key={p.id}
              label={p.name}


              searchText={`${p.id} ${p.version} ${p.api}`}
              description={<ExpandExtendDescription p={p} update={updateTable.get(p.id)} />}
            >
              <div className="stg-inline">
                {updateTable.get(p.id)?.available && (
                  <ActionButton
                    disabled={disabled2}
                    title={t(
                      "Replace {0} with version {1} from its declared update repository.",
                      p.name,
                      updateTable.get(p.id)?.latestVersion ?? "",
                    )}
                    onClick={() => void action.update(p.id)}
                  >
                    {busy === p.id
                      ? t("Updating…")
                      : t("Update to {0}", updateTable.get(p.id)?.latestVersion ?? "")}
                  </ActionButton>
                )}
                <ActionButton
                  disabled={disabled2}
                  onClick={() => void action.toggle(p.id, p.state === "disabled")}
                >
                  {busy === p.id ? t("Working…") : p.state === "disabled" ? t("Enable") : t("Disable")}
                </ActionButton>
                <ActionButton
                  disabled={disabled2}
                  title={t("Save as a .nota-plugin package — to hand to someone else to install, or as a backup.")}
                  onClick={() => void action.export(p.id)}
                >
                  {t("Export…")}
                </ActionButton>





                {p.removable && (
                  <ActionButton
                    danger
                    disabled={disabled2}
                    title={t("Delete this extension from disk. Its settings file is kept.")}
                    onClick={() => void action.unload(p.id)}
                  >
                    {t("Uninstall")}
                  </ActionButton>
                )}

                {p.signature === "unknown" && (
                  <ActionButton
                    disabled={disabled2}
                    title={t("Trust {0}", p.key_id ?? t("this signer"))}
                    onClick={() => void action.messageTask(p.id, p.key_id)}
                  >
                    {t("Trust")}
                  </ActionButton>
                )}
              </div>
            </SettingRow>
          ))}
        </SettingsGroup>
      )}







      {messageTask.length > 0 && (
        <SettingsGroup title={t("Trusted signers")}>
          {messageTask.map((k) => (
            <SettingRow key={k.key_id} label={k.name}>


              <Value>
                <code>{k.key_id}</code>
              </Value>
            </SettingRow>
          ))}
        </SettingsGroup>
      )}
    </>
  );
}


function ExpandExtendDescription({ p, update }: { p: PluginInfo; update?: PluginUpdateInfo }) {
  const t = useT();
  const apiHint = pluginApiHintKey(p.api, p.host_api);
  return (
    <>
      <span className="plugin-id">
        {p.id} {p.version} / API {p.api}


        <span className="plugin-origin">{comeSourceDescription(p)}</span>
      </span>

      {p.description && <span className="plugin-desc">{p.description}</span>}

      {update?.error && (
        <span className="plugin-error">
          {t("Update check failed: {0}", update.error)}
        </span>
      )}

      {update?.available && update.notes && (
        <span className="plugin-desc">{update.notes}</span>
      )}


      {languageMismatch(p) && (
        <span className="plugin-lang">
          {languageHint()}
          <span className="plugin-lang-now">
            {languageTag(p.lang ?? "en") ?? (p.lang ?? "en")}
          </span>
        </span>
      )}


      {p.error && <span className="plugin-error">{p.error}</span>}
      {!p.api_supported && apiHint === "update" && (
        <span className="plugin-error">{t("Please check for a software update or contact the developer.")}</span>
      )}
      {!p.api_supported && apiHint === "contact" && (
        <span className="plugin-error">{t("Please contact the developer.")}</span>
      )}

      {p.capabilities.length > 0 ? (
        <span className="plugin-caps">
          {p.capabilities.map((c) => (


            <span key={c} className="cap" title={c}>
              {ableForceName(c) ?? c}
            </span>
          ))}
        </span>
      ) : (


        <span className="plugin-desc">{t("It asks for no capabilities.")}</span>
      )}
    </>
  );
}
