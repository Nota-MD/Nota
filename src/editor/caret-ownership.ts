export const textCaretOwnerSelector = [
  "input",
  "textarea",
  ".cm-content",
  ".nota-math-source",
  ".nota-math-inline",
  ".nota-keyboard-link-source",
  ".nota-code-lang-input",
  ".nota-html-source",
  ".nota-diagram-source",
].join(",");

interface ClosestElement {
  closest(selector: string): Element | null;
}

/**
 * Return the inner editable surface that owns text-caret navigation.
 *
 * Document-level caret plugins and table navigation must not intercept
 * Arrow, Delete, Backspace or composition events when this returns an element.
 */
export function textCaretOwner(target: ClosestElement | null): Element | null {
  const registered = registeredCaretOwner(target as Node | null);
  return registered ?? target?.closest(textCaretOwnerSelector) ?? null;
}

export function eventTextCaretOwner(event: Event): Element | null {
  return textCaretOwner(event.target as unknown as ClosestElement | null);
}
import { registeredCaretOwner } from "@/editor/caret-commander";

