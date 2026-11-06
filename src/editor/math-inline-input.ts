/**
 * Boundary and focus helpers for the inline LaTeX source control.
 *
 * WebKitGTK can report a collapsed source caret through nullable selection
 * properties. Treating those as "not at the edge" makes Right/Left appear
 * stuck even though the visible caret is already beside the closing `$`.
 */

export const inlineMathInputFocusClass = "nota-inline-math-input-focused";
export const inlineMathEditingClass = "nota-inline-math-editing";

export function inlineMathInputAtEdge(
  input: Pick<HTMLInputElement, "value" | "selectionStart" | "selectionEnd">,
  side: "start" | "end",
): boolean {
  const start = input.selectionStart;
  const end = input.selectionEnd;
  if (start === null || end === null || start !== end) return false;
  return side === "start" ? start <= 0 : start >= input.value.length;
}

export function setInlineMathInputFocus(
  editorRoot: HTMLElement,
  focused: boolean,
): void {
  editorRoot.classList.toggle(inlineMathInputFocusClass, focused);
}

export function setInlineMathEditing(
  editorRoot: HTMLElement,
  editing: boolean,
): void {
  editorRoot.classList.toggle(inlineMathEditingClass, editing);
  if (editing) {
    const overlay = editorRoot.parentElement?.querySelector?.(".nota-blink-caret");
    overlay?.classList.remove("nota-blink-caret-on");
  }
}
