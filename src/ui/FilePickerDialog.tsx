/** 应用内文件选择器：打开、保存与目录选择共用。 */

import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";

import { api, type PickerEntry, type PickerPlace } from "@/bridge/ipc";
import { useT } from "@/i18n";
import { Icon } from "@/ui/Icon";
import { DialogClose } from "@/ui/DialogClose";
import { useModalTrap } from "@/ui/useModalTrap";
import {
  currentFilePicker,
  matchesFileFilters,
  parentPath,
  pathBase,
  pathDirectory,
  resolveSavePath,
  settleFilePicker,
  subscribeFilePicker,
} from "@/ui/file-picker";

function placeName(kind: string, t: (text: string) => string): string {
  if (kind === "home") return t("Home");
  if (kind === "desktop") return t("Desktop");
  if (kind === "documents") return t("Documents");
  if (kind === "downloads") return t("Downloads");
  if (kind === "root") return t("File System");
  if (kind.startsWith("drive:")) return kind.slice(6) + ":";
  return kind;
}

function formatSize(bytes: number): string {
  if (!bytes) return "—";
  const units = ["B", "KB", "MB", "GB"];
  let value = bytes;
  let index = 0;
  while (value >= 1024 && index < units.length - 1) {
    value /= 1024;
    index += 1;
  }
  return `${value >= 10 || index === 0 ? value.toFixed(0) : value.toFixed(1)} ${units[index]}`;
}

export function FilePickerDialog() {
  const t = useT();
  const pending = useSyncExternalStore(subscribeFilePicker, currentFilePicker, currentFilePicker);
  const request = pending?.request ?? null;
  const root = useRef<HTMLDivElement>(null);
  useModalTrap(root, { onEscape: () => settleFilePicker(null), enabled: request !== null });

  const [places, setPlaces] = useState<PickerPlace[]>([]);
  const [directory, setDirectory] = useState("");
  const [pathText, setPathText] = useState("");
  const [entries, setEntries] = useState<PickerEntry[]>([]);
  const [selected, setSelected] = useState<PickerEntry | null>(null);
  const [fileName, setFileName] = useState("");
  const [showHidden, setShowHidden] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [newFolder, setNewFolder] = useState("");
  const [overwrite, setOverwrite] = useState<string | null>(null);
  const requestKey = request ? `${request.mode}:${request.title ?? ""}:${request.defaultPath ?? ""}` : "";

  const filters = useMemo(() => request?.filters ?? [], [request]);

  const navigate = async (path: string): Promise<PickerEntry[] | null> => {
    setBusy(true);
    setError(null);
    try {
      const list = await api.picker.list(path, showHidden);
      setDirectory(path);
      setPathText(path);
      setEntries(list);
      setSelected(null);
      setOverwrite(null);
      return list;
    } catch (e) {
      setError(String(e));
      return null;
    } finally {
      setBusy(false);
    }
  };

  useEffect(() => {
    if (!request) return;
    let alive = true;
    setError(null);
    setCreating(false);
    setNewFolder("");
    setOverwrite(null);
    const initial = request.defaultPath?.trim() ?? "";
    let start = initial;
    let name = "";
    if (request.mode === "save" && initial) {
      name = pathBase(initial);
      start = pathDirectory(initial);
    } else if (request.mode === "open" && initial && initial.includes(".")) {
      start = pathDirectory(initial);
    }
    setFileName(name);
    void api.picker.places().then((list) => {
      if (!alive) return;
      setPlaces(list);
      const fallback = list.find((p) => p.kind === "home")?.path ?? list[0]?.path ?? "";
      void navigate(start || fallback);
    });
    return () => {
      alive = false;
    };
  }, [requestKey]);

  useEffect(() => {
    if (directory) void navigate(directory);
  }, [showHidden]);

  if (!pending || !request) return null;

  const visible = entries.filter((entry) => entry.isDir || matchesFileFilters(entry.name, filters));
  const resolvedSave = resolveSavePath(directory, fileName, filters);
  const canConfirm =
    request.mode === "save"
      ? Boolean(resolvedSave)
      : request.mode === "directory"
        ? Boolean(selected?.isDir || directory)
        : Boolean(selected && !selected.isDir);

  const confirmLabel =
    request.confirmLabel ??
    (request.mode === "save"
      ? t("Save")
      : request.mode === "directory"
        ? t("Select Folder")
        : t("Open"));

  const confirm = () => {
    if (!canConfirm) return;
    if (request.mode === "save") {
      if (entries.some((entry) => !entry.isDir && entry.path === resolvedSave)) {
        setOverwrite(resolvedSave);
        return;
      }
      settleFilePicker(resolvedSave);
    }
    else if (request.mode === "directory") settleFilePicker(selected?.isDir ? selected.path : directory);
    else if (selected && !selected.isDir) settleFilePicker(selected.path);
  };

  const createFolder = async () => {
    if (!newFolder.trim()) return;
    try {
      const created = await api.picker.createDir(directory, newFolder);
      setCreating(false);
      setNewFolder("");
      const list = await navigate(directory);
      const entry = list?.find((e) => e.path === created) ?? null;
      if (entry) setSelected(entry);
    } catch (e) {
      setError(String(e));
    }
  };

  const activate = (entry: PickerEntry) => {
    if (entry.isDir) {
      void navigate(entry.path);
      return;
    }
    if (request.mode === "open") {
      settleFilePicker(entry.path);
      return;
    }
    if (request.mode === "save") {
      setSelected(entry);
      setFileName(entry.name);
      setOverwrite(entry.path);
    }
  };

  const moveSelection = (direction: -1 | 1) => {
    if (!visible.length) return;
    const current = selected ? visible.findIndex((entry) => entry.path === selected.path) : -1;
    const next = Math.min(
      visible.length - 1,
      Math.max(0, current < 0 ? (direction > 0 ? 0 : visible.length - 1) : current + direction),
    );
    setSelected(visible[next] ?? null);
  };

  return (
    <div className="file-picker-backdrop" onMouseDown={() => settleFilePicker(null)}>
      <div
        ref={root}
        className="file-picker"
        data-modal-layer="true"
        role="dialog"
        aria-modal="true"
        aria-label={request.title ?? confirmLabel}
        tabIndex={-1}
        onMouseDown={(e) => e.stopPropagation()}
      >
        <header className="file-picker-head">
          <strong>{request.title ?? confirmLabel}</strong>
          <DialogClose onClose={() => settleFilePicker(null)} />
        </header>
        <div className="file-picker-body">
          <aside className="file-picker-places">
            {places.map((place) => (
              <button
                type="button"
                key={place.kind}
                className="file-picker-place"
                data-active={directory === place.path}
                onClick={() => void navigate(place.path)}
              >
                <Icon name="folio-document-open-symbolic" size={16} />
                <span>{placeName(place.kind, t)}</span>
              </button>
            ))}
          </aside>
          <section className="file-picker-main">
            <div className="file-picker-toolbar">
              <button
                type="button"
                className="btn"
                disabled={!parentPath(directory)}
                onClick={() => {
                  const parent = parentPath(directory);
                  if (parent) void navigate(parent);
                }}
                title={t("Parent folder")}
              >
                ↑
              </button>
              <input
                className="file-picker-path"
                value={pathText}
                onChange={(e) => setPathText(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") void navigate(pathText);
                }}
                aria-label={t("Path")}
              />
              <button type="button" className="btn" onClick={() => void navigate(pathText)}>
                {t("Go")}
              </button>
              <label className="file-picker-hidden">
                <input
                  type="checkbox"
                  checked={showHidden}
                  onChange={(e) => setShowHidden(e.target.checked)}
                />
                {t("Hidden files")}
              </label>
              <button type="button" className="btn" onClick={() => setCreating(true)}>
                {t("New Folder")}
              </button>
            </div>
            {creating && (
              <div className="file-picker-create">
                <input
                  autoFocus
                  value={newFolder}
                  placeholder={t("Folder name")}
                  onChange={(e) => setNewFolder(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") void createFolder();
                    if (e.key === "Escape") setCreating(false);
                  }}
                />
                <button type="button" className="btn btn-primary" onClick={() => void createFolder()}>
                  {t("Create")}
                </button>
              </div>
            )}
            <div className="file-picker-columns" aria-hidden="true">
              <span>{t("Name")}</span>
              <span>{t("Size")}</span>
              <span>{t("Modified")}</span>
            </div>
            <div
              className="file-picker-list"
              role="listbox"
              tabIndex={0}
              onKeyDown={(event) => {
                if (event.key === "ArrowDown" || event.key === "ArrowUp") {
                  event.preventDefault();
                  moveSelection(event.key === "ArrowDown" ? 1 : -1);
                } else if (event.key === "Enter" && selected) {
                  event.preventDefault();
                  activate(selected);
                } else if (event.key === "Home" && visible[0]) {
                  event.preventDefault();
                  setSelected(visible[0]);
                } else if (event.key === "End" && visible.at(-1)) {
                  event.preventDefault();
                  setSelected(visible.at(-1) ?? null);
                }
              }}
            >
              {visible.map((entry) => (
                <button
                  type="button"
                  role="option"
                  key={entry.path}
                  className="file-picker-row"
                  data-dir={entry.isDir}
                  data-selected={selected?.path === entry.path}
                  aria-selected={selected?.path === entry.path}
                  onClick={() => {
                    setSelected(entry);
                    if (request.mode === "save" && !entry.isDir) {
                      setFileName(entry.name);
                      setOverwrite(null);
                    }
                  }}
                  onDoubleClick={() => activate(entry)}
                >
                  <span className="file-picker-name">
                    <Icon
                      name={entry.isDir ? "folio-document-open-symbolic" : "folio-edit-symbolic"}
                      size={16}
                    />
                    {entry.name}
                  </span>
                  <span>{entry.isDir ? "—" : formatSize(entry.size)}</span>
                  <span>
                    {entry.modifiedMs
                      ? new Date(entry.modifiedMs).toLocaleString(undefined, {
                          month: "short",
                          day: "numeric",
                          hour: "2-digit",
                          minute: "2-digit",
                        })
                      : "—"}
                  </span>
                </button>
              ))}
              {!visible.length && <p className="file-picker-empty">{t("This folder is empty")}</p>}
            </div>
            {error && <p className="file-picker-error">{error}</p>}
          </section>
        </div>
        <footer className="file-picker-foot">
          {request.mode === "save" && (
            <label className="file-picker-name-field">
              <span>{t("File name")}</span>
              <input
                value={fileName}
                onChange={(e) => {
                  setFileName(e.target.value);
                  setOverwrite(null);
                }}
                autoFocus
              />
            </label>
          )}
          <span className="file-picker-status">
            {overwrite
              ? t("A file with this name already exists. Overwrite it?")
              : busy
                ? t("Reading…")
                : request.mode === "directory"
                  ? directory
                  : (selected?.path ?? "")}
          </span>
          {overwrite ? (
            <>
              <button type="button" className="btn" onClick={() => setOverwrite(null)}>
                {t("Back")}
              </button>
              <button
                type="button"
                className="btn btn-danger"
                onClick={() => settleFilePicker(overwrite)}
              >
                {t("Overwrite")}
              </button>
            </>
          ) : (
            <>
              <button type="button" className="btn" onClick={() => settleFilePicker(null)}>
                {t("Cancel")}
              </button>
              <button
                type="button"
                className="btn btn-primary"
                disabled={!canConfirm}
                onClick={confirm}
              >
                {confirmLabel}
              </button>
            </>
          )}
        </footer>
      </div>
    </div>
  );
}
