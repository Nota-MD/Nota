/**
 * Native source-control events for inline and fallback math editors.
 *
 * WebKitGTK emits `input` events while an IME is still composing. Dispatching
 * the document on every composition update interrupts candidate selection and
 * can visibly duplicate partial text. Keep the native value and width live,
 * but write to ProseMirror only after `compositionend`.
 */

import {
  registerCaretSurface,
  type CaretCommand,
} from "./caret-commander";

type MathSourceControl = HTMLInputElement | HTMLTextAreaElement;
type BackslashControl = Pick<
  HTMLInputElement,
  "value" | "selectionStart" | "selectionEnd" | "setRangeText" | "setSelectionRange"
>;

export interface InlineMathSourceEvents {
  updateLayout: () => void;
  dispatchSource: (value: string) => void;
  feed: (value: string, cursor: number) => void;
  preserveFocus: (cursor: number) => void;
  handleCommand: (command: CaretCommand, event?: Event) => boolean;
}

/**
 * Insert one backslash and return the authoritative caret position.
 *
 * WebKitGTK may leave `selectionStart` stale until after the key event even
 * though `setRangeText(..., "end")` has already changed the value. Reading the
 * selection back at that point can restore the caret before the slash and make
 * it appear to sit on the closing `$`.
 */
export function insertBackslashAtSelection(input: BackslashControl): number {
  const start = input.selectionStart ?? input.value.length;
  const end = input.selectionEnd ?? start;
  input.setRangeText("\\", start, end, "end");
  const cursor = start + 1;
  input.setSelectionRange(cursor, cursor);
  return cursor;
}

export function bindInlineMathSourceEvents(
  input: MathSourceControl,
  events: InlineMathSourceEvents,
): () => void {
  let composing = false;
  let expectedCursor: number | null = null;

  const unregister = registerCaretSurface({
    element: input,
    kind: "math-source",
    handle: events.handleCommand,
  });

  const commit = (requestedCursor: number | null = expectedCursor) => {
    if (!input.isConnected) return;
    const inputOwnedFocus = document.activeElement === input;
    events.updateLayout();
    const cursor = requestedCursor ?? input.selectionStart ?? input.value.length;
    events.dispatchSource(input.value);
    if (inputOwnedFocus || requestedCursor !== null) events.preserveFocus(cursor);
    events.feed(input.value, cursor);
    expectedCursor = null;
  };

  input.addEventListener("beforeinput", (event) => {
    const inputEvent = event as InputEvent;
    if (inputEvent.inputType !== "insertText" || typeof inputEvent.data !== "string") {
      expectedCursor = null;
      return;
    }
    const start = input.selectionStart ?? input.value.length;
    expectedCursor = start + inputEvent.data.length;
  });

  input.addEventListener("input", (event) => {
    events.updateLayout();
    const inputEvent = event as InputEvent;
    if (
      composing ||
      inputEvent.isComposing ||
      inputEvent.inputType === "insertCompositionText"
    ) {
      return;
    }
    commit(expectedCursor);
  });
  input.addEventListener("compositionstart", () => {
    composing = true;
  });
  input.addEventListener("compositionend", () => {
    composing = false;
    expectedCursor = null;
    commit();
    queueMicrotask(commit);
    globalThis.requestAnimationFrame?.(commit);
  });
  return unregister;
}

/** A composed key belongs to the IME, not to editor navigation. */
export function isImeComposingKey(event: KeyboardEvent): boolean {
  return event.isComposing || event.keyCode === 229 || event.key === "Process";
}
