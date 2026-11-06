/**
 * Keep the inline-math source control focused across its ProseMirror write.
 *
 * A native input event dispatches a document transaction. On some WebKitGTK
 * input paths that transaction gives focus back to the document, allowing the
 * body caret overlay to paint after the closing `$`. Capture this invariant at
 * the start of the input event and restore it after the synchronous write and
 * the following layout frames.
 */

export function restoreInlineMathSourceFocus(
  input: HTMLInputElement,
  cursor: number,
  onRestored: () => void,
): void {
  if (!input.isConnected) return;
  if (document.activeElement !== input) input.focus({ preventScroll: true });
  if (input.selectionStart !== cursor || input.selectionEnd !== cursor) {
    input.setSelectionRange(cursor, cursor);
  }
  onRestored();
}

export function preserveInlineMathSourceFocus(
  input: HTMLInputElement,
  cursor: number,
  onRestored: () => void,
): void {
  const restore = () => restoreInlineMathSourceFocus(input, cursor, onRestored);
  restore();
  queueMicrotask(restore);
  globalThis.requestAnimationFrame?.(restore);
}

export interface InlineMathFocusSchedule {
  shouldOpen: () => boolean;
  focusBlockEditor: () => boolean;
  input: HTMLInputElement;
  sourceLength: () => number;
  beforeInputFocus: () => void;
}

/** Focus the inline source after ProseMirror finishes its current update. */
export function scheduleInlineMathFocus(schedule: InlineMathFocusSchedule): void {
  const focus = () => {
    if (!schedule.shouldOpen()) return;
    if (schedule.focusBlockEditor()) return;
    if (!schedule.input.isConnected) return;
    schedule.beforeInputFocus();
    if (document.activeElement === schedule.input) return;
    schedule.input.focus();
    const length = schedule.sourceLength();
    schedule.input.setSelectionRange(length, length);
  };
  queueMicrotask(focus);
  globalThis.requestAnimationFrame?.(focus);
}
