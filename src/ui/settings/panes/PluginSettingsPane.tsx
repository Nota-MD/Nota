







import type { PluginInfo } from "@/bridge/ipc";
import { useT } from "@/i18n";
import { Icon } from "@/ui/Icon";
import type { pluginAction } from "@/ui/usePlugins";
import { useState } from "react";
import {
  Note,
  Range,
  SettingRow,
  SettingsGroup,
  TextArea,
  TextInput,
  Toggle,
} from "../primitives";

function SelectManager({
  plugin,
  setting,
  action,
}: {
  plugin: PluginInfo;
  setting: PluginInfo["settings"][number];
  action: pluginAction;
}) {
  const t = useT();
  const [editing, setEditing] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const [creating, setCreating] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);
  const canCreate = setting.create_command !== "";
  const canRename = setting.rename_command !== "";
  const canDelete = setting.delete_command !== "";

  const beginEdit = (value: string, label: string) => {
    setEditing(value);
    setDraft(label);
    setCreating(false);
    setConfirmDelete(null);
  };

  const saveEdit = async () => {
    if (editing === null || draft.trim() === "") return;
    const ok = await action.command(plugin.id, setting.rename_command, {
      id: editing,
      label: draft.trim(),
    });
    if (ok) setEditing(null);
  };

  const saveNew = async () => {
    if (draft.trim() === "") return;
    const ok = await action.command(plugin.id, setting.create_command, { label: draft.trim() });
    if (ok) {
      setCreating(false);
      setDraft("");
    }
  };

  if (setting.options.length === 0) return null;

  return (
    <div className="plugin-setting-manager">
      {setting.options.map((option) => (
        <div
          key={option.value}
          className="plugin-setting-manager-row"
          data-current={option.value === setting.text || undefined}
        >
          {editing === option.value ? (
            <>
              <input
                className="plugin-setting-manager-input"
                value={draft}
                autoFocus
                onChange={(event) => setDraft(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter") void saveEdit();
                  if (event.key === "Escape") setEditing(null);
                }}
              />
              <button
                type="button"
                className="btn plugin-setting-manager-action"
                onClick={() => void saveEdit()}
              >
                {t("Save")}
              </button>
            </>
          ) : (
            <>
              <button
                type="button"
                className="plugin-setting-manager-pick"
                onClick={() => void action.settings(plugin.id, setting.key, option.value)}
              >
                {option.label}
              </button>
              {canRename && (
                <button
                  type="button"
                  className="plugin-setting-manager-icon-action"
                  title={
                    option.editable
                      ? t("Edit {0}", option.label)
                      : t("Select {0} to edit its instructions", option.label)
                  }
                  onClick={() => {
                    if (option.editable) beginEdit(option.value, option.label);
                    else void action.settings(plugin.id, setting.key, option.value);
                  }}
                  aria-label={t("Edit {0}", option.label)}
                >
                  <Icon name="nota-edit-symbolic" size={15} />
                </button>
              )}
              {canDelete && (
                <button
                  type="button"
                  className="plugin-setting-manager-icon-action plugin-setting-manager-delete"
                  data-confirm={confirmDelete === option.value || undefined}
                  disabled={!option.deletable}
                  title={
                    !option.deletable
                      ? t("{0} cannot be deleted", option.label)
                      : confirmDelete === option.value
                      ? t("Click again to delete {0}", option.label)
                      : t("Delete {0}", option.label)
                  }
                  aria-label={
                    !option.deletable
                      ? t("{0} cannot be deleted", option.label)
                      : confirmDelete === option.value
                      ? t("Click again to delete {0}", option.label)
                      : t("Delete {0}", option.label)
                  }
                  onClick={() => {
                    if (!option.deletable) return;
                    if (confirmDelete !== option.value) {
                      setConfirmDelete(option.value);
                      return;
                    }
                    void action
                      .command(plugin.id, setting.delete_command, { id: option.value })
                      .then((ok) => {
                        if (ok) setConfirmDelete(null);
                      });
                  }}
                >
                  <Icon name="nota-delete-symbolic" size={15} />
                </button>
              )}
            </>
          )}
        </div>
      ))}

      {canCreate &&
        (creating ? (
          <div className="plugin-setting-manager-row plugin-setting-manager-create">
            <input
              className="plugin-setting-manager-input"
              value={draft}
              autoFocus
              placeholder={t("Persona name")}
              onChange={(event) => setDraft(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") void saveNew();
                if (event.key === "Escape") setCreating(false);
              }}
            />
            <button
              type="button"
              className="btn plugin-setting-manager-action"
              onClick={() => void saveNew()}
            >
              {t("Create")}
            </button>
          </div>
        ) : (
          <button
            type="button"
            className="plugin-setting-manager-new"
            onClick={() => {
              setCreating(true);
              setEditing(null);
              setDraft("");
            }}
          >
            <Icon name="nota-add-symbolic" size={14} />
            <span>{t("New persona")}</span>
          </button>
        ))}
    </div>
  );
}

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
              ) : setting.kind === "select" ? (
                <div className="plugin-setting-select">
                  <SelectManager plugin={plugin} setting={setting} action={action} />
                </div>
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
