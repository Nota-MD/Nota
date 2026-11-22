















import { useEffect } from "react";

import { api } from "@/bridge/ipc";
import type { EditorSelectionRange } from "@/editor/selection-range";

const EDITOR_READY_EVENT = "nota-editor-ready";
const DOCUMENT_THEME_READY_EVENT = "nota-document-theme-ready";
const STARTUP_READY_EVENT = "nota-startup-ready";


export function markEditorReady(): void {
  document.documentElement.dataset.editorReady = "true";
  window.dispatchEvent(new Event(EDITOR_READY_EVENT));
}

export function finishEditorBootstrap(
  root: ParentNode,
  editor: {
    focusAtStart(): void;
    restoreSelection(selection: EditorSelectionRange): void;
  } | null,
  rememberedSelection: EditorSelectionRange | null,
  requireEditable = true,
): void {
  if (!editor) throw new Error("editor handle did not mount");
  if (rememberedSelection) editor.restoreSelection(rememberedSelection);
  else editor.focusAtStart();
  const inputSurface = requireEditable
    ? root.querySelector<HTMLElement>(
        '.ProseMirror[contenteditable="true"], .ProseMirror[contenteditable="plaintext-only"], ' +
          '.cm-content[contenteditable="true"]',
      )
    : root.querySelector<HTMLElement>(".ProseMirror, .cm-content");
  if (!inputSurface) throw new Error("editor input surface did not mount");
  markEditorReady();
}

/** The active document theme is either injected or definitively unavailable. */
export function markDocumentThemeReady(): void {
  document.documentElement.dataset.documentThemeReady = "true";
  window.dispatchEvent(new Event(DOCUMENT_THEME_READY_EVENT));
}


export function markStartupReady(): void {
  document.documentElement.dataset.startupReady = "true";
  window.dispatchEvent(new Event(STARTUP_READY_EVENT));
}

export function useBootReveal(ready: boolean): void {
  useEffect(() => {
    if (!ready) return;
    let cancelled = false;
    let timer = 0;
    const listeners: Array<[string, () => void]> = [];
    const reveal = () => {
      if (cancelled) return;
      for (const [event, fn] of listeners) window.removeEventListener(event, fn);
      if (timer) window.clearTimeout(timer);
      document.documentElement.dataset.booted = "true";
      void api.window
        .showMain()
        .then(() => {


          document.documentElement.dataset.windowShown = "true";
          window.dispatchEvent(new Event("nota-window-shown"));
          const preheatOptionalEditors = () => {
            if (cancelled) return;
            void Promise.allSettled([
              import("@/editor/katex-runtime").then((m) => m.preHotKatex()),
              import("@/editor/code-block-cm"),
              import("@/editor/source"),
              import("@/editor/html-sanitize"),
              import("@/editor/lang-icons-real"),
            ]);
          };
          const idleWindow = window as Window & {
            requestIdleCallback?: (callback: () => void, options?: { timeout: number }) => number;
          };
          if (idleWindow.requestIdleCallback) {
            idleWindow.requestIdleCallback(preheatOptionalEditors, { timeout: 500 });
          } else {
            window.setTimeout(preheatOptionalEditors, 120);
          }
        })
        .catch((error) => {
          console.error("[nota] Could not show the main window:", error);
          document.documentElement.dataset.windowShown = "true";
          window.dispatchEvent(new Event("nota-window-shown"));
        });
    };
    const maybeReveal = () => {
      // The interactive surface and the document theme must both be settled.
      // Session restoration is independent: the active document is already
      // editable, and waiting for every tab would slow startup without benefit.
      if (
        document.documentElement.dataset.editorReady === "true" &&
        document.documentElement.dataset.documentThemeReady === "true"
      ) {
        reveal();
      }
    };
    for (const event of [EDITOR_READY_EVENT, DOCUMENT_THEME_READY_EVENT, STARTUP_READY_EVENT]) {
      listeners.push([event, maybeReveal]);
      window.addEventListener(event, maybeReveal);
    }
    maybeReveal();


    timer = window.setTimeout(reveal, 5000);
    return () => {
      cancelled = true;
      if (timer) window.clearTimeout(timer);
      for (const [event, fn] of listeners) window.removeEventListener(event, fn);
    };
  }, [ready]);
}
