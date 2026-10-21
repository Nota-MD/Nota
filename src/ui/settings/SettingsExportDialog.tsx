import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { save as saveDialog } from "@/ui/file-picker";

import { api } from "@/bridge/ipc";
import type {
  PluginSettingsExportItem,
  SettingsExportInventory,
  SettingsExportItem,
  SettingsExportReport,
} from "@/bridge/types-settings-export";
import { useT } from "@/i18n";
import { DialogClose } from "@/ui/DialogClose";
import { useModalTrap } from "@/ui/useModalTrap";

interface Props {
  onClose: () => void;
  onExported: (report: SettingsExportReport) => void;
  onError: (message: string) => void;
}

function prettyBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KiB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MiB`;
}

function defaultPackageName(): string {
  const now = new Date();
  const stamp = [
    now.getFullYear(),
    String(now.getMonth() + 1).padStart(2, "0"),
    String(now.getDate()).padStart(2, "0"),
  ].join("-");
  return `Nota-settings-${stamp}.nota-backup`;
}

export function SettingsExportDialog({ onClose, onExported, onError }: Props) {
  const t = useT();
  const dialogRef = useRef<HTMLDivElement>(null);
  const [inventory, setInventory] = useState<SettingsExportInventory | null>(null);
  const [program, setProgram] = useState<Set<string>>(new Set());
  const [plugins, setPlugins] = useState<Record<string, { settings: boolean; data: boolean }>>({});
  const [busy, setBusy] = useState(false);
  const programCopy: Record<string, { label: string; help: string }> = {
    settings: { label: t("Program settings"), help: "settings.toml" },
    session: { label: t("Session and recent files"), help: "session.toml" },
    "table-widths": { label: t("Table column widths"), help: "table-widths.toml" },
    "plugin-state": { label: t("Extension enabled states"), help: "plugins.toml" },
    "trusted-keys": { label: t("Trusted extension signing keys"), help: "trusted-keys.toml" },
    "image-upload": {
      label: t("Image upload credentials"),
      help: t("Contains server headers and tokens"),
    },
    themes: { label: t("User document themes"), help: t("Includes theme assets") },
    "ui-styles": {
      label: t("User interface styles"),
      help: t("Includes theme icons, fonts and other assets"),
    },
    dictionaries: {
      label: t("Spell-check dictionaries and user words"),
      help: t("Includes imported .aff/.dic files and user-words.txt"),
    },
  };

  useModalTrap(dialogRef, { onEscape: () => !busy && onClose() });

  useEffect(() => {
    let alive = true;
    void api.settings
      .exportInventory()
      .then((next) => {
        if (!alive) return;
        setInventory(next);
        setProgram(
          new Set(
            next.program
              .filter((item) => item.available && !item.sensitive)
              .map((item) => item.id),
          ),
        );
        setPlugins(
          Object.fromEntries(
            next.plugins.map((plugin) => [
              plugin.id,
              { settings: plugin.settings_bytes > 0, data: plugin.data_files > 0 },
            ]),
          ),
        );
      })
      .catch((error) => {
        if (alive) onError(t("Could not read exportable settings and data: {0}", String(error)));
      });
    return () => {
      alive = false;
    };
  }, [onError, t]);

  const toggleProgram = (item: SettingsExportItem) => {
    if (!item.available) return;
    setProgram((current) => {
      const next = new Set(current);
      if (next.has(item.id)) next.delete(item.id);
      else next.add(item.id);
      return next;
    });
  };

  const togglePlugin = (plugin: PluginSettingsExportItem, part: "settings" | "data") => {
    if (part === "settings" && plugin.settings_bytes === 0) return;
    if (part === "data" && plugin.data_files === 0) return;
    setPlugins((current) => {
      const selected = current[plugin.id] ?? { settings: false, data: false };
      return { ...current, [plugin.id]: { ...selected, [part]: !selected[part] } };
    });
  };

  const selectAll = () => {
    if (!inventory) return;
    setProgram(new Set(inventory.program.filter((item) => item.available).map((item) => item.id)));
    setPlugins(
      Object.fromEntries(
        inventory.plugins.map((plugin) => [
          plugin.id,
          { settings: plugin.settings_bytes > 0, data: plugin.data_files > 0 },
        ]),
      ),
    );
  };

  const selectNone = () => {
    setProgram(new Set());
    setPlugins({});
  };

  const startExport = async () => {
    if (busy || !inventory) return;
    const chosenPlugins = inventory.plugins
      .map((plugin) => ({
        id: plugin.id,
        settings: plugins[plugin.id]?.settings ?? false,
        data: plugins[plugin.id]?.data ?? false,
      }))
      .filter((plugin) => plugin.settings || plugin.data);
    if (program.size === 0 && chosenPlugins.length === 0) {
      onError(t("Select at least one settings or data item to export."));
      return;
    }

    const destination = await saveDialog({
      title: t("Export settings package"),
      defaultPath: defaultPackageName(),
      filters: [
        { name: t("Nota settings package"), extensions: ["nota-backup", "zip"] },
      ],
    });
    if (!destination) return;
    setBusy(true);
    try {
      const report = await api.settings.exportPackage({
        destination,
        include: [...program],
        plugins: chosenPlugins,
      });
      onExported(report);
    } catch (error) {
      onError(t("Could not export the settings package: {0}", String(error)));
    } finally {
      setBusy(false);
    }
  };

  return createPortal(
    <div
      className="confirm-backdrop"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget && !busy) onClose();
      }}
    >
      <div
        ref={dialogRef}
        className="confirm-dialog settings-export-dialog"
        data-modal-layer="true"
        role="dialog"
        aria-modal="true"
        aria-label={t("Export settings package")}
        tabIndex={-1}
        onMouseDown={(event) => event.stopPropagation()}
      >
        <DialogClose onClose={() => !busy && onClose()} />
        <h2 className="confirm-title">{t("Export settings package")}</h2>
        <p className="settings-export-lead">
          {t(
            "Select what to include. The result is a ZIP-based settings package, not an application installer.",
          )}
        </p>

        <div className="settings-export-tools">
          <button type="button" className="btn" onClick={selectAll} disabled={busy}>
            {t("Select all")}
          </button>
          <button type="button" className="btn" onClick={selectNone} disabled={busy}>
            {t("Select none")}
          </button>
        </div>

        <div className="settings-export-scroll">
          {inventory === null ? (
            <p className="settings-export-empty">{t("Reading settings and data…")}</p>
          ) : (
            <>
              <h3>{t("Program settings and user data")}</h3>
              <div className="settings-export-list">
                {inventory.program.map((item) => {
                  const copy = programCopy[item.id] ?? { label: item.id, help: item.id };
                  return (
                  <label
                    key={item.id}
                    className={`settings-export-item ${!item.available ? "is-disabled" : ""}`}
                  >
                    <input
                      type="checkbox"
                      checked={program.has(item.id)}
                      disabled={busy || !item.available}
                      onChange={() => toggleProgram(item)}
                    />
                    <span>
                      <strong>{copy.label}</strong>
                      <small>
                        {copy.help}
                        {item.available
                          ? ` · ${item.files} ${t("files")} · ${prettyBytes(item.bytes)}`
                          : ` · ${t("Not available")}`}
                        {item.sensitive ? ` · ${t("Contains credentials")}` : ""}
                      </small>
                    </span>
                  </label>
                  );
                })}
              </div>

              <h3>{t("Extension settings and data")}</h3>
              {inventory.plugins.length === 0 ? (
                <p className="settings-export-empty">
                  {t("No extension settings or data were found.")}
                </p>
              ) : (
                <div className="settings-export-list">
                  {inventory.plugins.map((plugin) => (
                    <div className="settings-export-plugin" key={plugin.id}>
                      <div className="settings-export-plugin-name">
                        <strong>{plugin.name}</strong>
                        <small>{plugin.id}</small>
                      </div>
                      <label>
                        <input
                          type="checkbox"
                          checked={plugins[plugin.id]?.settings ?? false}
                          disabled={busy || plugin.settings_bytes === 0}
                          onChange={() => togglePlugin(plugin, "settings")}
                        />
                        {t("Settings")}
                        <small>{prettyBytes(plugin.settings_bytes)}</small>
                      </label>
                      <label>
                        <input
                          type="checkbox"
                          checked={plugins[plugin.id]?.data ?? false}
                          disabled={busy || plugin.data_files === 0}
                          onChange={() => togglePlugin(plugin, "data")}
                        />
                        {t("Data")}
                        <small>
                          {plugin.data_files} {t("files")} · {prettyBytes(plugin.data_bytes)}
                        </small>
                      </label>
                    </div>
                  ))}
                </div>
              )}
            </>
          )}
        </div>

        <div className="confirm-actions">
          <button type="button" className="btn" onClick={onClose} disabled={busy}>
            {t("Cancel")}
          </button>
          <button
            type="button"
            className="btn btn-primary"
            disabled={busy || inventory === null}
            onClick={() => void startExport()}
          >
            {busy ? t("Exporting…") : t("Export…")}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
