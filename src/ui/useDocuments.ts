








































import { useCallback, useRef } from "react";
import type { RefObject } from "react";
import { open as openDialog, save as saveDialog } from "@/ui/file-picker";

import {
  api,
  type DocId,
  type Document,
  type Settings,
  type TreeNode,
  type ViewMode,
} from "@/bridge/ipc";
import { markdownExtensions } from "@/editor/file-kind";
import { useT } from "@/i18n";
import type { EditorPaneHandle } from "@/ui/EditorPane";
import { optionKey, readMouthPath } from "@/ui/tree-options";
import { useAutosave } from "@/ui/useAutosave";
import type { Dialogs } from "@/ui/useDialogs";
import { useQuitGuard } from "@/ui/useQuitGuard";
import { placeAtItemRecord, combinePath } from "@/ui/useExport";
import type { Toast } from "@/ui/Toasts";
import { debugError, debugEvent } from "@/ui/debug-log";
import { savingTextOf } from "@/ui/document-save-text";
import { useWorkspaceDelete } from "@/ui/useWorkspaceDelete";
import {
  clearTableExtensionContent,
  hasExtensionTableContent,
} from "@/ui/table-computed";













let aboveCountOtherSaveItemRecord: string | null = null;





















function otherSaveDropPoint(doc: { path: string | null; title: string }): string {
  if (doc.path) return doc.path;
  const name = `${doc.title}.md`;
  return aboveCountOtherSaveItemRecord ? combinePath(aboveCountOtherSaveItemRecord, name) : name;
}








function recordOtherSaveItemRecord(picked: string): void {
  const dir = placeAtItemRecord(picked);
  if (dir) aboveCountOtherSaveItemRecord = dir;
}

export interface documentWiring {

  docs: readonly Document[];

  setActiveId: (id: DocId | null) => void;

  activeIdRef: RefObject<DocId | null>;

  workspace: string | null;

  refreshDocs: () => Promise<Document[]>;
  setWorkspace: (path: string | null) => void;
  setTree: (tree: TreeNode[]) => void;
  editorRef: RefObject<EditorPaneHandle | null>;

  settings: Settings | null;





  modePreference: ViewMode;
  toast: (message: string, level?: Toast["level"]) => void;

  askConfirm: Dialogs["askConfirm"];

  askPrompt: Dialogs["askPrompt"];
}

export interface documentApi {












  openPath: (path: string) => Promise<boolean>;






  newDoc: (workspaceFileName?: string, directory?: string) => Promise<void>;
  /** Create a folder in the requested directory, or at the workspace root. */
  newFolder: (directory?: string) => Promise<void>;






  newDocWithText: (text: string, titleHint: string | null) => Promise<boolean>;

  openViaDialog: () => Promise<void>;






  connectAboveCurrentHas: () => Promise<boolean>;











  openFolder: (path?: string) => Promise<void>;

  loadDir: (subPath: string) => Promise<TreeNode[]>;
  /** Delete a file or directory selected in the workspace tree. */
  deletePath: (path: string) => Promise<boolean>;

  saveDoc: (id: DocId, forceDialog?: boolean, quiet?: boolean) => Promise<boolean>;
  /** Persist an independent recovery copy without touching the source file. */
  saveDraft: (id: DocId) => Promise<boolean>;
  /** Restore every recovery copy into tabs and switch to the newest one. */
  restoreDrafts: () => Promise<void>;




  switchDocument: (id: DocId | null) => Promise<void>;

  recordActivity: () => void;

  closeDoc: (id: DocId) => Promise<void>;

  reloadDoc: (id: DocId) => Promise<void>;

  renameDoc: (id: DocId) => Promise<void>;

  moveDoc: (id: DocId) => Promise<void>;
  /** Move a tab to another running Nota process after the target acknowledges it. */
  transferDocToWindow: (id: DocId, targetId: number, focusTarget: boolean) => Promise<boolean>;
}

export function useDocuments(w: documentWiring): documentApi {


  const t = useT();
  const {
    docs,
    setActiveId,
    activeIdRef,
    workspace,
    refreshDocs,
    setWorkspace,
    setTree,
    editorRef,
    settings,
    modePreference,
    toast,
    askConfirm,
    askPrompt,
  } = w;
  const workspaceRef = useRef(workspace);
  workspaceRef.current = workspace;
  const settingsRef = useRef(settings);
  settingsRef.current = settings;

















  const docsRef = useRef(docs);
  docsRef.current = docs;



















  const saveDoc = useCallback(
    async (id: DocId, forceDialog = false, quiet = false): Promise<boolean> => {
      const doc = docsRef.current.find((d) => d.id === id);
      if (!doc) return false;

      let target: string | undefined;
      if (forceDialog || !doc.path) {
        const picked = await saveDialog({
          title: t("Save As"),

          defaultPath: otherSaveDropPoint(doc),
          filters: [{ name: "Markdown", extensions: ["md", "markdown", "mdx"] }],
        });
        if (!picked) return false;
        recordOtherSaveItemRecord(picked);
        target = picked;
      }

      try {


        const mirrored = await api.doc.get(id);
        const text = savingTextOf(
          id,
          activeIdRef.current,
          editorRef.current?.getMarkdown(),
          mirrored.text,
        );
        await api.doc.sync(id, text);

        const written = await api.doc.save(id, target);
        await refreshDocs();




        if (!quiet) {
          toast(
            hasExtensionTableContent(Number(id))
              ? t(
                  "Saved to {0}. Table content is rendered by extensions; the Markdown source is unchanged.",
                  written,
                )
              : t("Saved to {0}", written),
            "success",
          );
        }
        debugEvent("document", "save finished", {
          document: doc.path ?? "untitled",
          save_as: Boolean(target),
          chars: text?.length ?? 0,
        });
        return true;
      } catch (e) {
        debugError("document", "save failed", e, {
          document: doc.path ?? "untitled",
          save_as: Boolean(target),
        });
        toast(String(e), "error");
        return false;
      }
    },
    [activeIdRef, editorRef, refreshDocs, toast],
  );

  const saveDraft = useCallback(
    async (id: DocId): Promise<boolean> => {
      if (activeIdRef.current !== id) return false;
      const text = editorRef.current?.getMarkdown();
      if (text === undefined) return false;
      try {
        return await api.draft.save(id, text);
      } catch (e) {
        debugError("document", "draft save failed", e, { document: id });
        return false;
      }
    },
    [activeIdRef, editorRef],
  );

  const activateDocument = useCallback(
    (id: DocId | null) => {
      activeIdRef.current = id;
      setActiveId(id);
    },
    [activeIdRef, setActiveId],
  );

  const deletePath = useWorkspaceDelete({
    docsRef,
    activeIdRef,
    workspaceRef,
    treeOptions: readMouthPath(settingsRef.current),
    refreshDocs,
    setTree,
    activateDocument,
    askConfirm,
    toast,
  });

















  const switchDocument = useCallback(
    async (id: DocId | null) => {
      const current = activeIdRef.current;
      const splitPageBeforeFirstSave = settingsRef.current?.files.autosave_on_switch ?? false;
      if (splitPageBeforeFirstSave && current !== null && current !== id) {
        const doc = docsRef.current.find((d) => d.id === current);
        const activeText = editorRef.current?.getMarkdown();
        const changed =
          Boolean(doc?.dirty) ||
          (activeText !== undefined && activeText !== doc?.text);
        if (activeText !== undefined) {
          try {
            await api.doc.sync(current, activeText);
          } catch (e) {
            toast(String(e), "error");
          }
        }
        const saved = Boolean(changed && doc?.path && (await saveDoc(current, false, true)));
        if (!saved) await saveDraft(current);
      } else if (current !== null && current !== id) {
        const activeText = editorRef.current?.getMarkdown();
        if (activeText !== undefined) {
          try {
            await api.doc.sync(current, activeText);
          } catch (e) {
            toast(String(e), "error");
          }
        }
        await saveDraft(current);
      }
      activateDocument(id);
    },
    [activateDocument, activeIdRef, editorRef, saveDoc, saveDraft, toast],
  );
  const switchDocumentRef = useRef(switchDocument);
  switchDocumentRef.current = switchDocument;







  const openPath = useCallback(
    async (path: string) => {
      try {
        const id = await api.doc.open(path);
        await refreshDocs();
        await switchDocument(id);
        return true;
      } catch (e) {
        debugError("document", "open failed", e, { path });
        toast(String(e), "error");
        return false;
      }
    },
    [refreshDocs, switchDocument, toast],
  );


















  const treePointTexture = optionKey(readMouthPath(settings));
  const loadDir = useCallback(
    (subPath: string) => api.workspace.tree(subPath, 1, readMouthPath(settings)),

    [treePointTexture],
  );

  const newDoc = useCallback(async (workspaceFileName?: string, directory?: string) => {
    // Some generic UI callbacks pass their click event here despite the public
    // signature accepting only a filename. Treat every non-string as absent;
    // otherwise the event object reaches `.trim()` and every click creates an
    // error toast instead of a new document.
    let requestedName =
      typeof workspaceFileName === "string" ? workspaceFileName.trim() : "";
    const targetDirectory = directory ?? workspaceRef.current;
    if (!requestedName && directory) {
      const answer = await askPrompt({
        title: t("New File"),
        label: t("File name"),
        initial: "Untitled.md",
        confirmLabel: t("Create"),
      });
      if (!answer) return;
      requestedName = answer.value.trim();
    }
    let id: DocId | null = null;
    try {
      id = await api.doc.create();

      if (requestedName && targetDirectory) {
        let textItemName = requestedName;
        if (!textItemName || /[\\/]/.test(textItemName) || textItemName === "." || textItemName === "..") {
          throw new Error(t("Enter a valid file name."));
        }
        if (!markdownExtensions.some((ext) => textItemName.toLowerCase().endsWith(`.${ext}`))) {
          textItemName += ".md";
        }
        const DropPoint = combinePath(targetDirectory, textItemName);
        const [savedAt] = await api.pathKind([DropPoint]);
        if (savedAt !== "missing") {
          throw new Error(t("A file with this name already exists."));
        }
        await api.doc.save(id, DropPoint);
        setTree(await api.workspace.tree(undefined, 1, readMouthPath(settingsRef.current)));
      }

      await refreshDocs();
      await switchDocumentRef.current(id);
    } catch (e) {
      if (id !== null) {
        await api.doc.close(id).catch(() => undefined);
        await refreshDocs().catch(() => undefined);
      }
      debugError("document", "new document failed", e, {
        has_workspace_name: Boolean(requestedName),
      });
      toast(String(e), "error");
    }
  }, [askPrompt, refreshDocs, setTree, t, toast]);

  const connectAboveCurrentHas = useCallback(async (): Promise<boolean> => {
    const list = await refreshDocs();
    const mostAfterOneDocument = list.at(-1);
    if (!mostAfterOneDocument) return false;
    activateDocument(mostAfterOneDocument.id);
    return true;
  }, [activateDocument, refreshDocs]);

  const newFolder = useCallback(async (directory?: string) => {
    const root = workspaceRef.current;
    if (!root) return;
    const answer = await askPrompt({
      title: t("New Folder"),
      label: t("Folder name"),
      confirmLabel: t("Create"),
    });
    if (!answer) return;
    try {
      await api.picker.createDir(directory ?? root, answer.value.trim());
      setTree(await api.workspace.tree(undefined, 1, readMouthPath(settingsRef.current)));
    } catch (e) {
      toast(String(e), "error");
    }
  }, [askPrompt, setTree, t, toast]);

  const newDocWithText = useCallback(
    async (text: string, titleHint: string | null) => {
      try {
        const id = await api.doc.createWithText(text, titleHint);
        await refreshDocs();
        await switchDocument(id);
        return true;
      } catch (e) {
        toast(String(e), "error");
        return false;
      }
    },
    [refreshDocs, switchDocument, toast],
  );

  const restoreDrafts = useCallback(async () => {
    try {
      const drafts = await api.draft.list();
      if (drafts.length === 0) {
        toast(t("No unsaved drafts were found."), "info");
        return;
      }
      const answer = await askConfirm({
        title: t("Restore unsaved drafts"),
        message: t(
          "Restore {0} unsaved draft(s)? Each draft opens in a tab; source files are not changed until you save.",
          drafts.length,
        ),
        confirmLabel: t("Restore"),
      });
      if (answer !== "confirm") return;

      const restored: DocId[] = [];
      for (const draft of drafts) {
        try {
          restored.push(await api.draft.restore(draft.id));
        } catch (e) {
          debugError("document", "draft restore failed", e, { draft: draft.id });
        }
      }
      await refreshDocs();
      const newest = restored[0];
      if (newest !== undefined) await switchDocumentRef.current(newest);
      if (restored.length === drafts.length) {
        toast(t("Restored {0} draft(s).", restored.length), "success");
      } else {
        toast(
          t("Restored {0} of {1} drafts.", restored.length, drafts.length),
          "warn",
        );
      }
    } catch (e) {
      debugError("document", "draft listing failed", e);
      toast(String(e), "error");
    }
  }, [askConfirm, refreshDocs, t, toast]);

  const openViaDialog = useCallback(async () => {
    const picked = await openDialog({
      title: t("Open"),
      multiple: false,





      filters: [{ name: "Markdown", extensions: [...markdownExtensions] }],
    });
    if (typeof picked === "string") await openPath(picked);
  }, [openPath]);

  const openFolder = useCallback(
    async (path?: string) => {

      let picked = path;
      if (picked === undefined) {
        const selectOf = await openDialog({ title: t("Open Folder"), directory: true });
        if (typeof selectOf !== "string") return;
        picked = selectOf;
      }
      try {
        const canonical = await api.workspace.open(picked);
        setWorkspace(canonical);
        setTree(await api.workspace.tree(undefined, 1, readMouthPath(settings)));
      } catch (e) {


        toast(String(e), "error");
      }
    },


    [setTree, setWorkspace, t, toast, treePointTexture],
  );

  const closeDoc = useCallback(
    async (id: DocId) => {
      let doc = docs.find((d) => d.id === id);
      if (id === activeIdRef.current) {
        const text = editorRef.current?.getMarkdown();
        if (text !== undefined) {
          try {
            await api.doc.sync(id, text);
            doc = (await refreshDocs()).find((item) => item.id === id);
          } catch (e) {
            toast(String(e), "error");
            return;
          }
        }
      }
      let discardDraft = false;
      if (doc?.dirty && settings?.confirm_unsaved) {




        const answer = await askConfirm({
          title: t("Has unsaved changes"),
          message: t("“{0}” has unsaved changes — closing it discards them.", doc.title),


          extraLabel: t("Save and Close"),
          confirmLabel: t("Discard and Close"),
          danger: true,
        });
        if (answer === "cancel") return;



        if (answer === "extra" && !(await saveDoc(id))) return;
        discardDraft = answer === "confirm";
      }
      try {
        if (discardDraft) await api.draft.discardDocument(id);
        else if (doc?.dirty) await saveDraft(id);
        await api.doc.close(id);
        clearTableExtensionContent(Number(id));
        const list = await refreshDocs();
        if (list.length === 0) {
          await api.window.quit();
          return;
        }
        activateDocument(list[list.length - 1]!.id);
      } catch (e) {
        toast(String(e), "error");
      }
    },
    [
      docs,
      settings,
      activeIdRef,
      editorRef,
      refreshDocs,
      activateDocument,
      toast,
      askConfirm,
      saveDoc,
      saveDraft,
    ],
  );













  const Wysiwyg = modePreference === "wysiwyg";

  const reloadDoc = useCallback(
    async (id: DocId) => {







      //



      let columnTable = docsRef.current;
      if (id === activeIdRef.current) {
        const handHead = editorRef.current?.getMarkdown();
        if (handHead !== undefined) {
          try {
            await api.doc.sync(id, handHead);
          } catch (e) {
            console.warn("[nota] Could not sync text before reload:", e);
          }
          columnTable = await refreshDocs();
        }
      }
      if (columnTable.find((d) => d.id === id)?.dirty) {


        const answer = await askConfirm({
          title: t("Has unsaved changes"),
          message: t("Reloading from disk discards the current changes."),
          confirmLabel: t("Discard and Reload"),
          danger: true,
        });
        if (answer !== "confirm") return;
      }
      try {
        const fresh = await api.doc.reload(id);

        if (id === activeIdRef.current) {
          const editor = editorRef.current;
          editor?.setMarkdown(fresh.text);







          //








          if (Wysiwyg) {
            const ruleScopeConvert = editor?.getMarkdown();
            if (ruleScopeConvert !== undefined && ruleScopeConvert !== fresh.text) {
              try {
                await api.doc.settle(id, ruleScopeConvert);
              } catch (e) {
                console.warn("[nota] Could not claim text after reload:", e);
              }
            }
          }
        }
        await refreshDocs();
      } catch (e) {
        toast(String(e), "error");
      }
    },


    [activeIdRef, editorRef, askConfirm, refreshDocs, toast, Wysiwyg],
  );














  const renameDoc = useCallback(
    async (id: DocId) => {
      const doc = docsRef.current.find((d) => d.id === id);
      if (!doc) return;
      if (!doc.path) {

        toast(t("This document has not been saved yet — use Save As to give it a location first"), "error");
        return;
      }
      const currentName = doc.path.split("/").pop() ?? doc.path;
      const answer = await askPrompt({
        title: t("Rename"),
        label: t("New name"),
        initial: currentName,
        confirmLabel: t("Rename"),
      });
      if (!answer) return;
      const newValueName = answer.value.trim();



      if (newValueName === currentName) return;
      try {
        await api.doc.rename(id, newValueName);



        await refreshDocs();
        toast(t("Renamed to “{0}”", newValueName), "success");
      } catch (e) {
        toast(String(e), "error");
      }
    },
    [askPrompt, refreshDocs, t, toast],
  );








  const moveDoc = useCallback(
    async (id: DocId) => {
      const doc = docsRef.current.find((d) => d.id === id);
      if (!doc) return;
      if (!doc.path) {
        toast(t("This document has not been saved yet — use Save As to give it a location first"), "error");
        return;
      }
      const selectOf = await openDialog({ title: t("Move to Folder…"), directory: true });
      if (typeof selectOf !== "string") return;
      try {
        await api.doc.move(id, selectOf);
        await refreshDocs();
        toast(t("Moved to “{0}”", selectOf), "success");
      } catch (e) {
        toast(String(e), "error");
      }
    },
    [refreshDocs, t, toast],
  );

  const transferDocToWindow = useCallback(
    async (id: DocId, targetId: number, focusTarget: boolean) => {
      const doc = docsRef.current.find((item) => item.id === id);
      if (!doc) return false;
      const activeText = id === activeIdRef.current ? editorRef.current?.getMarkdown() : undefined;
      let path = doc.path;
      const text = path ? null : (activeText ?? doc.text);
      if (path) {
        const changed = doc.dirty || (activeText !== undefined && activeText !== doc.text);
        if (changed && !(await saveDoc(id, false, true))) return false;
        path = docsRef.current.find((item) => item.id === id)?.path ?? path;
      }
      try {
        await api.window.transfer({
          targetId,
          path,
          text,
          titleHint: path ? null : doc.title,
          focusTarget,
        });
        if (doc.dirty) await api.draft.discardDocument(id);
        await api.doc.close(id);
        const list = await refreshDocs();
        activateDocument(list.length ? list[list.length - 1]!.id : null);
        return true;
      } catch (e) {
        toast(String(e), "error");
        return false;
      }
    },
    [activateDocument, activeIdRef, docsRef, editorRef, refreshDocs, saveDoc, toast],
  );











  const recordActivity = useAutosave({
    seconds: settings?.autosave_seconds ?? 0,
    docs,
    activeIdRef,
    saveDoc: (id) => saveDoc(id, false, true),
    saveDraft,
  });










  useQuitGuard({ docs, saveDoc: (id) => saveDoc(id), toast, askConfirm });

  return {
    openPath,
    newDoc,
    newDocWithText,
    newFolder,
    connectAboveCurrentHas,
    openViaDialog,
    openFolder,
    loadDir,
    deletePath,
    saveDoc,
    saveDraft,
    restoreDrafts,
    switchDocument,
    recordActivity,
    closeDoc,
    reloadDoc,
    renameDoc,
    moveDoc,
    transferDocToWindow,
  };
}
