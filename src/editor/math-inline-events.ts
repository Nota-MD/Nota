/**
 * Native source-control events for inline and fallback math editors.
 *
 * WebKitGTK emits `input` events while an IME is still composing. Dispatching
 * the document on every composition update interrupts candidate selection and
 * can visibly duplicate partial text. Keep the native value and width live,
 * but write to ProseMirror only after `compositionend`.
 */

type MathSourceControl = HTMLInputElement | HTMLTextAreaElement;

export interface InlineMathSourceEvents {
  updateLayout: () => void;
  dispatchSource: (value: string) => void;
  feed: (value: string, cursor: number) => void;
  preserveFocus: (cursor: number) => void;
}

export function bindInlineMathSourceEvents(
  input: MathSourceControl,
  events: InlineMathSourceEvents,
): void {
  let composing = false;

  const commit = () => {
    if (!input.isConnected) return;
    const inputOwnedFocus = document.activeElement === input;
    events.updateLayout();
    const cursor = input.selectionStart ?? input.value.length;
    events.dispatchSource(input.value);
    if (inputOwnedFocus) events.preserveFocus(cursor);
    events.feed(input.value, cursor);
  };

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
    commit();
  });
  input.addEventListener("compositionstart", () => {
    composing = true;
  });
  input.addEventListener("compositionend", () => {
    composing = false;
    commit();
    queueMicrotask(commit);
    globalThis.requestAnimationFrame?.(commit);
  });
}

/** A composed key belongs to the IME, not to editor navigation. */
export function isImeComposingKey(event: KeyboardEvent): boolean {
  return event.isComposing || event.keyCode === 229 || event.key === "Process";
}
