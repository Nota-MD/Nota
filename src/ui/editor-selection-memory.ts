import type { DocId, ViewMode } from "@/bridge/types";
import type { EditorSelectionRange } from "@/editor/selection-range";

const rememberedSelections = new Map<string, EditorSelectionRange>();

function selectionKey(documentId: DocId, mode: ViewMode): string {
  return `${documentId}:${mode}`;
}

export function rememberEditorSelection(
  documentId: DocId,
  mode: ViewMode,
  selection: EditorSelectionRange | null,
): void {
  if (selection) rememberedSelections.set(selectionKey(documentId, mode), selection);
  else rememberedSelections.delete(selectionKey(documentId, mode));
}

export function recallEditorSelection(
  documentId: DocId,
  mode: ViewMode,
): EditorSelectionRange | null {
  return rememberedSelections.get(selectionKey(documentId, mode)) ?? null;
}

export function forgetEditorSelections(documentId: DocId): void {
  const prefix = `${documentId}:`;
  for (const key of rememberedSelections.keys()) {
    if (key.startsWith(prefix)) rememberedSelections.delete(key);
  }
}
