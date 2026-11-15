import type { DocId } from "@/bridge/ipc";

/**
 * Select the body that belongs to the document being saved.
 *
 * Only the active tab can read the live editor. Every other tab must use its
 * own backend mirror; otherwise Save All writes the active body into each tab.
 */
export function savingTextOf(
  id: DocId,
  activeId: DocId | null,
  editorText: string | undefined,
  mirroredText: string,
): string {
  return id === activeId && editorText !== undefined ? editorText : mirroredText;
}
