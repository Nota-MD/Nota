import { useRef, useState } from "react";
import { createPortal } from "react-dom";

import { api } from "@/bridge/ipc";
import type {
  SettingsImportReport,
  SettingsPackageInventory,
} from "@/bridge/types-settings-export";
import { useT } from "@/i18n";
import { DialogClose } from "@/ui/DialogClose";
import { open } from "@/ui/file-picker";
import { useModalTrap } from "@/ui/useModalTrap";

interface Props {
  onClose: () => void;
  onImported: (report: SettingsImportReport) => void;
  onError: (message: string) => void;
  presentation?: "embedded" | "full";
}

function prettyBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KiB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MiB`;
}

export function SettingsImportDialog({
  onClose,
  onImported,
  onError,
  presentation = "embedded",
}: Props) {
  const t = useT();
  const dialogRef = useRef<HTMLDivElement>(null);
  const [packagePath, setPackagePath] = useState<string | null>(null);
  const [inventory, setInventory] = useState<SettingsPackageInventory | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  useModalTrap(dialogRef, { onEscape: () => !busy && onClose() });

  const label = (id: string): string => {
    const names: Record<string, string> = {
      settings: t("Program settings"),
      session: t("Session and recent files"),
      "table-widths": t("Table column widths"),
      "plugin-state": t("Extension enabled states"),
      "trusted-keys": t("Trusted extension signing keys"),
      "image-upload": t("Image upload credentials"),
      themes: t("User document themes"),
      "ui-styles": t("User interface styles"),
      dictionaries: t("Spell-check dictionaries and user words"),
    };
    if (names[id]) return names[id];
    if (id.startsWith("plugin-settings:")) {
      return t("Extension settings: {0}", id.slice("plugin-settings:".length));
    }
    if (id.startsWith("plugin-data:")) {
      return t("Extension data: {0}", id.slice("plugin-data:".length));
    }
    return id;
  };

  const choosePackage = async () => {
    if (busy) return;
    const path = await open({
      title: t("Choose settings package"),
      multiple: false,
      filters: [
        { name: t("Nota settings package"), extensions: ["nota-backup", "zip"] },
      ],
    }).catch(() => null);
    if (!path) return;
    setBusy(true);
    setMessage(null);
    try {
      const next = await api.settings.importInspect(path);
      setPackagePath(path);
      setInventory(next);
      setSelected(
        new Set(next.items.filter((item) => !item.sensitive).map((item) => item.id)),
      );
    } catch (error) {
      onError(t("Could not inspect the settings package: {0}", String(error)));
    } finally {
      setBusy(false);
    }
  };

  const toggle = (id: string) => {
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const importPackage = async () => {
    if (busy || !packagePath || selected.size === 0) {
      if (selected.size === 0) {
        setMessage(t("Select at least one settings or data item to import."));
      }
      return;
    }
    setBusy(true);
    setMessage(null);
    try {
      const report = await api.settings.importPackage({
        package: packagePath,
        include: [...selected],
      });
      onImported(report);
    } catch (error) {
      const text = t("Could not import the settings package: {0}", String(error));
      setMessage(text);
      onError(text);
    } finally {
      setBusy(false);
    }
  };

  return createPortal(
    <div
      className="confirm-backdrop"
      data-window-presentation={presentation}
      onMouseDown={(event) => {
        if (event.target === event.currentTarget && !busy) onClose();
      }}
    >
      <div
        ref={dialogRef}
        className="confirm-dialog settings-export-dialog settings-import-dialog"
        data-window-presentation={presentation}
        data-modal-layer="true"
        role="dialog"
        aria-modal="true"
        aria-label={t("Import settings package")}
        tabIndex={-1}
        onMouseDown={(event) => event.stopPropagation()}
      >
        <DialogClose onClose={() => !busy && onClose()} />
        <h2 className="confirm-title">{t("Import settings package")}</h2>
        <p className="settings-export-lead">
          {t(
            "Choose a Nota settings package, inspect its contents, and restore only the items you select.",
          )}
        </p>

        {!inventory ? (
          <div className="settings-import-empty">
            <button type="button" className="btn btn-primary" disabled={busy} onClick={() => void choosePackage()}>
              {busy ? t("Reading…") : t("Choose settings package…")}
            </button>
          </div>
        ) : (
          <>
            <p className="settings-import-source">
              <strong>{packagePath}</strong>
              <small>
                {t("Exported by Nota {0}", inventory.app_version || t("Unknown"))}
              </small>
            </p>
            <div className="settings-export-scroll">
              <h3>{t("Settings and data in this package")}</h3>
              <div className="settings-export-list">
                {inventory.items.map((item) => (
                  <label
                    key={item.id}
                    className="settings-export-item settings-import-item"
                  >
                    <input
                      type="checkbox"
                      checked={selected.has(item.id)}
                      disabled={busy}
                      onChange={() => toggle(item.id)}
                    />
                    <span>
                      <strong>{label(item.id)}</strong>
                      <small>
                        {item.files} {t("files")} / {prettyBytes(item.bytes)}
                        {item.sensitive ? ` / ${t("May contain credentials or private data")}` : ""}
                        {item.restart_required ? ` / ${t("Restart required")}` : ""}
                      </small>
                    </span>
                  </label>
                ))}
              </div>
            </div>
          </>
        )}

        {message && <p className="settings-import-message" role="status">{message}</p>}

        <div className="confirm-actions">
          <button type="button" className="btn" onClick={onClose} disabled={busy}>
            {t("Cancel")}
          </button>
          {inventory && (
            <>
              <button type="button" className="btn" onClick={() => void choosePackage()} disabled={busy}>
                {t("Choose Another…")}
              </button>
              <button type="button" className="btn btn-primary" onClick={() => void importPackage()} disabled={busy}>
                {busy ? t("Importing…") : t("Import")}
              </button>
            </>
          )}
        </div>
      </div>
    </div>,
    document.body,
  );
}
