

























import { useEffect, type RefObject } from "react";

export { useDevBridgePreview } from "./useDevBridgeHost";

import {
  api,
  on,
  events,
  type DocId,
  type DocumentChangedPayload,
  type DocumentEditPayload,
  type NotifyPayload,
  type OpenDocumentPayload,
  type SecondInstancePayload,
  type Settings,
} from "@/bridge/ipc";



import { t } from "@/i18n";
import type { EditorPaneHandle } from "@/ui/EditorPane";
import type { Toast } from "@/ui/Toasts";

export interface EventWiring {
  toast: (message: string, level?: Toast["level"], ttlMs?: number) => void;
  refreshDocs: () => Promise<unknown>;




  openPath: (path: string) => Promise<unknown>;

  activeId: DocId | null;

  activeIdRef: RefObject<DocId | null>;

  editorRef: RefObject<EditorPaneHandle | null>;
  setSettings: (settings: Settings) => void;
}

export function useAppEvents(w: EventWiring): void {
  const { toast, refreshDocs, openPath, activeId, activeIdRef, editorRef, setSettings } = w;


  useEffect(() => {
    const unlisteners: Array<() => void> = [];
    let alive = true;

    (async () => {
      const subs = await Promise.all([
        on<NotifyPayload>(events.notify, (p) => toast(p.message, p.level)),
        on<Settings>(events.settingsChanged, (next) => setSettings(next)),




        //




        on<DocumentChangedPayload>(events.documentChanged, (p) => {
          if (p.origin !== "plugin" && p.origin !== "mcp") return;

          if (p.id === activeIdRef.current) {
            editorRef.current?.setMarkdown(p.text);
            return;
          }





          void refreshDocs();
        }),


        //




        //




        on<DocumentEditPayload>(events.documentEdit, (p) => {
          if (p.id !== activeIdRef.current) return;





          if (p.op !== "insert-at-cursor") return;



          editorRef.current?.insertAtCursorPlace(p.text);
        }),

        // A plugin graph or index can ask to open a document it already listed
        // through `nota.fs`. The backend validated that the path remains inside
        // the workspace fence; tab reuse and unsaved work stay in `openPath`.
        on<OpenDocumentPayload>(events.openDocument, (p) => {
          void openPath(p.path);
        }),


        //




        //



        on<SecondInstancePayload>(events.secondInstance, (p) => {
          if (p.error) {
            toast(t("The path from the second Nota launch is unusable: {0}", p.error), "error");
            return;
          }
          if (!p.path) return;
          void openPath(p.path);
        }),






      ]);

      if (alive) unlisteners.push(...subs);
      else subs.forEach((u) => u());
    })();

    return () => {
      alive = false;
      unlisteners.forEach((u) => u());
    };


  }, [toast, refreshDocs, openPath, activeIdRef, editorRef, setSettings]);


  useEffect(() => {
    activeIdRef.current = activeId;
    if (activeId === null) return;
    void api.doc.setActive(activeId).catch((e) => {
      toast(t("Could not switch the active document: {0}", String(e)), "error");
    });
  }, [activeId, toast, activeIdRef]);
}
