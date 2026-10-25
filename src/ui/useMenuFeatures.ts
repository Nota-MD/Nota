/** 菜单里那些跨文档、跨侧栏的小型工作流。 */

import { useCallback, useMemo, useState } from "react";

import { api, type DocId, type Document } from "@/bridge/ipc";
import { useT } from "@/i18n";
import { pathDirectory } from "@/ui/file-picker";
import type { SidebarTab } from "@/ui/Sidebar";
import type { Toast } from "@/ui/Toasts";
import type { Dialogs } from "@/ui/useDialogs";

export interface menuFeatureWiring {
  docs: readonly Document[];
  activeDoc: Document | null;
  activeId: DocId | null;
  workspace: string | null;
  setActiveId: (id: DocId | null) => void;
  setSidebarOpen: (open: boolean) => void;
  setSidebarTab: (tab: SidebarTab) => void;
  refreshDocs: () => Promise<Document[]>;
  saveDoc: (id: DocId, forceDialog?: boolean, quiet?: boolean) => Promise<boolean>;
  openFolder: (path?: string) => Promise<void>;
  openViaDialog: () => Promise<void>;
  openNewWindow: (path?: string) => Promise<void>;
  askConfirm: Dialogs["askConfirm"];
  toast: (message: string, level?: Toast["level"]) => void;
}

export interface menuFeatureApi {
  readOnly: boolean;
  searchRequest: number;
  newWindow: () => void;
  quickOpen: () => void;
  saveAll: () => void;
  revealActive: () => void;
  showActiveInSidebar: () => void;
  deleteActive: () => void;
  search: () => void;
  toggleReadOnly: () => void;
}

export function useMenuFeatures(w: menuFeatureWiring): menuFeatureApi {
  const t = useT();
  const [readOnly, setReadOnly] = useState(false);
  const [searchRequest, setSearchRequest] = useState(0);

  const search = useCallback(() => {
    w.setSidebarOpen(true);
    w.setSidebarTab("tree");
    setSearchRequest((n) => n + 1);
  }, [w.setSidebarOpen, w.setSidebarTab]);

  const quickOpen = useCallback(() => {
    if (w.workspace) search();
    else void w.openViaDialog();
  }, [search, w.openViaDialog, w.workspace]);

  const saveAll = useCallback(() => {
    void (async () => {
      const list = [...w.docs];
      const active = w.activeId ? list.find((doc) => doc.id === w.activeId) : undefined;
      const ordered = active ? [active, ...list.filter((doc) => doc.id !== active.id)] : list;
      let saved = 0;
      for (const doc of ordered) {
        if (!doc.dirty) continue;
        if (!(await w.saveDoc(doc.id))) return;
        saved++;
      }
      w.toast(
        saved ? t("Saved {0} documents.", saved) : t("There are no unsaved changes."),
        "success",
      );
    })();
  }, [t, w.activeId, w.docs, w.saveDoc, w.toast]);

  const revealActive = useCallback(() => {
    const path = w.activeDoc?.path;
    if (!path) {
      w.toast(t("Save the document before opening its location."), "info");
      return;
    }
    void api.export.reveal(path).catch((e: unknown) => w.toast(String(e), "error"));
  }, [t, w.activeDoc?.path, w.toast]);

  const showActiveInSidebar = useCallback(() => {
    const path = w.activeDoc?.path;
    if (!path) {
      w.toast(t("Save the document before revealing it in the sidebar."), "info");
      return;
    }
    const directory = pathDirectory(path);
    void (async () => {
      if (directory && directory !== w.workspace) await w.openFolder(directory);
      w.setSidebarOpen(true);
      w.setSidebarTab("tree");
    })();
  }, [t, w.activeDoc?.path, w.openFolder, w.setSidebarOpen, w.setSidebarTab, w.toast, w.workspace]);

  const deleteActive = useCallback(() => {
    const doc = w.activeDoc;
    if (!doc) return;
    if (!doc.path) {
      w.toast(t("Use Close for a document that has not been saved."), "info");
      return;
    }
    void (async () => {
      const answer = await w.askConfirm({
        title: t("Delete file?"),
        message: t("Delete “{0}” from disk? This cannot be undone.", doc.title),
        confirmLabel: t("Delete"),
        danger: true,
      });
      if (answer !== "confirm") return;
      try {
        await api.doc.delete(doc.id);
        const list = await w.refreshDocs();
        w.setActiveId(list.length ? list[list.length - 1]!.id : null);
      } catch (e) {
        w.toast(String(e), "error");
      }
    })();
  }, [t, w.activeDoc, w.askConfirm, w.refreshDocs, w.setActiveId, w.toast]);

  const newWindow = useCallback(() => {
    void w.openNewWindow();
  }, [w.openNewWindow]);

  const toggleReadOnly = useCallback(() => setReadOnly((value) => !value), []);

  return useMemo(
    () => ({
      readOnly,
      searchRequest,
      newWindow,
      quickOpen,
      saveAll,
      revealActive,
      showActiveInSidebar,
      deleteActive,
      search,
      toggleReadOnly,
    }),
    [
      deleteActive,
      newWindow,
      quickOpen,
      readOnly,
      revealActive,
      saveAll,
      search,
      searchRequest,
      showActiveInSidebar,
      toggleReadOnly,
    ],
  );
}
