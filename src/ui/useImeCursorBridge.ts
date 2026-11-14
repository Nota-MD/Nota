import { useEffect } from "react";

import { api } from "@/bridge/ipc";

export interface ImeCaretRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

function textControl(target: EventTarget | null): HTMLElement | null {
  if (!(target instanceof Element)) return null;
  const control = target.closest<HTMLElement>(
    "input, textarea, [contenteditable='true'], [contenteditable='plaintext-only']",
  );
  if (!control) return null;
  if (
    (control instanceof HTMLInputElement || control instanceof HTMLTextAreaElement) &&
    (control.disabled || control.readOnly)
  ) {
    return null;
  }
  return control;
}

function caretRect(control: HTMLElement): ImeCaretRect | null {
  const selection = document.getSelection();
  if (
    control.isContentEditable &&
    selection?.focusNode &&
    control.contains(selection.focusNode)
  ) {
    const range = document.createRange();
    try {
      range.setStart(selection.focusNode, selection.focusOffset);
      range.collapse(true);
      const rects = range.getClientRects();
      const rect = rects.item(rects.length - 1) ?? range.getBoundingClientRect();
      if (rect.width > 0 || rect.height > 0) {
        return normalizeRect(rect);
      }
    } catch {
      // Fall back to the editor box when the browser exposes a transient range.
    }
  }

  const rect = control.getBoundingClientRect();
  return normalizeRect(rect);
}

export function normalizeRect(rect: {
  left: number;
  top: number;
  width: number;
  height: number;
}): ImeCaretRect | null {
  const values = [rect.left, rect.top, rect.width, rect.height];
  if (!values.every(Number.isFinite)) return null;
  return {
    x: Math.round(rect.left),
    y: Math.round(rect.top),
    width: Math.max(1, Math.round(rect.width)),
    height: Math.max(1, Math.round(rect.height)),
  };
}

/**
 * WebKitGTK can keep IME candidates at a stale document position after the
 * editor scrolls. Send the current viewport caret rectangle to the native
 * input context whenever the caret can move or the page can shift.
 */
export function useImeCursorBridge(): void {
  useEffect(() => {
    if (!("__TAURI_INTERNALS__" in window)) return;

    let focused: HTMLElement | null = null;
    let frame = 0;
    let last = "";
    let unavailable = false;
    const viewport = window.visualViewport;

    const send = () => {
      frame = 0;
      if (!focused?.isConnected || unavailable) return;
      const rect = caretRect(focused);
      if (!rect) return;
      const key = `${rect.x}:${rect.y}:${rect.width}:${rect.height}`;
      if (key === last) return;
      last = key;
      void api.webview.imeCursor(rect).catch(() => {
        // Browser previews and non-WebKit platforms may not expose this hook.
        unavailable = true;
      });
    };

    const schedule = () => {
      if (!focused || frame) return;
      frame = requestAnimationFrame(send);
    };

    const focusIn = (event: FocusEvent) => {
      focused = textControl(event.target);
      last = "";
      schedule();
    };
    const focusOut = (event: FocusEvent) => {
      const next = textControl(event.relatedTarget);
      focused = next;
      last = "";
      if (next) schedule();
    };
    const composition = (event: CompositionEvent) => {
      const control = textControl(event.target);
      if (control) {
        focused = control;
        last = "";
        schedule();
      }
    };

    document.addEventListener("focusin", focusIn, true);
    document.addEventListener("focusout", focusOut, true);
    document.addEventListener("selectionchange", schedule, true);
    document.addEventListener("compositionstart", composition, true);
    document.addEventListener("compositionupdate", composition, true);
    document.addEventListener("compositionend", composition, true);
    document.addEventListener("input", schedule, true);
    document.addEventListener("scroll", schedule, true);
    window.addEventListener("resize", schedule);
    viewport?.addEventListener("scroll", schedule);
    viewport?.addEventListener("resize", schedule);
    focused = textControl(document.activeElement);
    schedule();

    return () => {
      if (frame) cancelAnimationFrame(frame);
      document.removeEventListener("focusin", focusIn, true);
      document.removeEventListener("focusout", focusOut, true);
      document.removeEventListener("selectionchange", schedule, true);
      document.removeEventListener("compositionstart", composition, true);
      document.removeEventListener("compositionupdate", composition, true);
      document.removeEventListener("compositionend", composition, true);
      document.removeEventListener("input", schedule, true);
      document.removeEventListener("scroll", schedule, true);
      window.removeEventListener("resize", schedule);
      viewport?.removeEventListener("scroll", schedule);
      viewport?.removeEventListener("resize", schedule);
    };
  }, []);
}
