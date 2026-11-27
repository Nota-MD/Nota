import { useT } from "@/i18n";
import { Icon } from "@/ui/Icon";

interface Props {
  x: number;
  y: number;
  path: string | null;
  deletePath: string | null;
  targetDirectory: string | null;
  workspace: string | null;
  listMode: boolean;
  onClose: () => void;
  onNewFile: (directory?: string) => void;
  onNewFolder: (directory?: string) => void;
  onSearch: () => void;
  onOpenFolder: () => void;
  onRefresh: () => void;
  onList: () => void;
  onTree: () => void;
  onCopyPath: (path: string) => void;
  onReveal: (path: string) => void;
  onDelete: (path: string) => void;
}

export function SidebarContextMenu(props: Props) {
  const t = useT();
  const {
    x,
    y,
    path,
    deletePath,
    targetDirectory,
    workspace,
    listMode,
    onClose,
    onNewFile,
    onNewFolder,
    onSearch,
    onOpenFolder,
    onRefresh,
    onList,
    onTree,
    onCopyPath,
    onReveal,
    onDelete,
  } = props;

  const closeThen = (action: () => void) => () => {
    onClose();
    action();
  };
  const itemRecordName = workspace?.replaceAll("\\", "/").replace(/\/+$/, "").split("/").pop() ?? "";
  const targetName =
    targetDirectory?.replaceAll("\\", "/").replace(/\/+$/, "").split("/").pop() ??
    itemRecordName;

  return (
    <div
      className="sidebar-context-menu"
      role="menu"
      aria-label={t("Operations")}
      style={{ left: x, top: y }}
      onPointerDown={(event) => event.stopPropagation()}
    >
      <div className="sidebar-context-head">
        <span>{t("Operations")}</span>
        <button
          type="button"
          className="sidebar-context-close"
          title={t("Close")}
          aria-label={t("Close")}
          onClick={onClose}
        >
          <Icon name="nota-close-symbolic" size={14} />
        </button>
      </div>
      {targetDirectory && (
        <div className="sidebar-context-target" title={targetDirectory}>
          <span>{t("Target folder")}</span>
          <strong>{targetName}</strong>
        </div>
      )}

      <div className="sidebar-context-section" role="group">
        <button
          type="button"
          role="menuitem"
          onClick={closeThen(() => onNewFile(targetDirectory ?? undefined))}
        >
          {t("New File")}
        </button>
        <button
          type="button"
          role="menuitem"
          disabled={!workspace}
          onClick={closeThen(() => onNewFolder(targetDirectory ?? undefined))}
        >
          {t("New Folder")}
        </button>
        <button
          type="button"
          role="menuitem"
          disabled={!workspace}
          onClick={closeThen(onSearch)}
        >
          {t("Search")}
        </button>
        <button type="button" role="menuitem" onClick={closeThen(onOpenFolder)}>
          {t("Open Folder…")}
        </button>
        <button
          type="button"
          role="menuitem"
          disabled={!workspace}
          onClick={closeThen(onRefresh)}
        >
          {t("Refresh")}
        </button>
      </div>

      <div className="sidebar-context-sep" role="separator" />

      <div className="sidebar-context-title">{t("View")}</div>
      <div className="sidebar-context-icons" role="group" aria-label={t("View")}>
        <button
          type="button"
          data-on={listMode}
          title={t("Document List")}
          aria-label={t("Document List")}
          aria-pressed={listMode}
          onClick={closeThen(onList)}
        >
          <Icon name="nota-view-list-bullet-symbolic" size={16} />
        </button>
        <button
          type="button"
          data-on={!listMode}
          title={t("Document Tree")}
          aria-label={t("Document Tree")}
          aria-pressed={!listMode}
          onClick={closeThen(onTree)}
        >
          <Icon name="nota-tree-folder-symbolic" size={16} />
        </button>
      </div>

      {workspace && (
        <>
          <div className="sidebar-context-sep" role="separator" />
          <div className="sidebar-context-title">{t("Recent Directories")}</div>
          <div className="sidebar-context-folder" title={workspace}>
            <Icon name="nota-tree-folder-symbolic" size={15} />
            <span>{itemRecordName}</span>
            <i aria-hidden="true" />
          </div>
        </>
      )}

      <div className="sidebar-context-sep" role="separator" />
      <div className="sidebar-context-section" role="group">
        <button
          type="button"
          role="menuitem"
          disabled={!path}
          onClick={() => {
            if (path) onCopyPath(path);
            onClose();
          }}
        >
          {t("Copy File Path")}
        </button>
        <button
          type="button"
          role="menuitem"
          disabled={!path}
          onClick={() => {
            if (path) onReveal(path);
            onClose();
          }}
        >
          {t("Open File Location")}
        </button>
        <button
          type="button"
          role="menuitem"
          className="sidebar-context-danger"
          disabled={!deletePath}
          onClick={() => {
            if (deletePath) onDelete(deletePath);
            onClose();
          }}
        >
          {t("Delete…")}
        </button>
      </div>
    </div>
  );
}
