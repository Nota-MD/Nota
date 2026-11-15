import { useCallback, type RefObject } from "react";

import { api, type DocId, type Document, type TreeNode } from "@/bridge/ipc";
import { useT } from "@/i18n";
import type { Dialogs } from "@/ui/useDialogs";
import type { Toast } from "@/ui/Toasts";

interface WorkspaceDeleteWiring {
  docsRef: RefObject<readonly Document[]>;
  activeIdRef: RefObject<DocId | null>;
  workspaceRef: RefObject<string | null>;
  treeOptions: Parameters<typeof api.workspace.tree>[2];
  refreshDocs: () => Promise<Document[]>;
  setTree: (tree: TreeNode[]) => void;
  activateDocument: (id: DocId | null) => void;
  askConfirm: Dialogs["askConfirm"];
  toast: (message: string, level?: Toast["level"]) => void;
}

export function useWorkspaceDelete(w: WorkspaceDeleteWiring) {
  const t = useT();
  const {
    docsRef,
    activeIdRef,
    workspaceRef,
    treeOptions,
    refreshDocs,
    setTree,
    activateDocument,
    askConfirm,
    toast,
  } = w;

  return useCallback(
    async (path: string): Promise<boolean> => {
      const name = path.split(/[/\\]/).filter(Boolean).at(-1) ?? path;
      const [kind] = await api.pathKind([path]).catch(() => ["missing"] as const);
      if (kind !== "dir" && kind !== "file") {
        toast(t("That file no longer exists."), "error");
        return false;
      }
      const answer = await askConfirm({
        title: kind === "dir" ? t("Delete folder?") : t("Delete file?"),
        message:
          kind === "dir"
            ? t("Delete folder “{0}” and everything inside it? This cannot be undone.", name)
            : t("Delete “{0}” from disk? This cannot be undone.", name),
        confirmLabel: t("Delete"),
        danger: true,
      });
      if (answer !== "confirm") return false;

      const normalizedPath = path.replaceAll("\\", "/").replace(/\/+$/, "");
      const affected = docsRef.current.filter((doc) => {
        if (!doc.path) return false;
        const candidate = doc.path.replaceAll("\\", "/");
        return candidate === normalizedPath || candidate.startsWith(`${normalizedPath}/`);
      });
      try {
        await api.workspace.deletePath(path);
        for (const doc of affected) {
          await api.draft.discardDocument(doc.id).catch(() => undefined);
          await api.doc.close(doc.id).catch(() => undefined);
          await api.session.forgetRecent(doc.path!).catch(() => undefined);
        }
        const list = await refreshDocs();
        if (affected.some((doc) => doc.id === activeIdRef.current)) {
          activateDocument(list.length ? list[list.length - 1]!.id : null);
        }
        if (workspaceRef.current) {
          setTree(await api.workspace.tree(undefined, 1, treeOptions));
        }
        toast(t("Deleted “{0}”", name), "success");
        return true;
      } catch (error) {
        toast(String(error), "error");
        return false;
      }
    },
    [
      activateDocument,
      activeIdRef,
      askConfirm,
      docsRef,
      refreshDocs,
      setTree,
      t,
      toast,
      treeOptions,
      workspaceRef,
    ],
  );
}
