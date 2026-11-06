/**
 * Cross-editor caret coordinates.
 *
 * ProseMirror node positions and CodeMirror document offsets are not
 * interchangeable in general. Both are monotonic selections over the active
 * document, so remembering them per document and per editor mode is safe.
 */
export interface EditorSelectionRange {
  anchor: number;
  head: number;
}

export function clampSelectionRange(
  selection: EditorSelectionRange,
  maximum: number,
): EditorSelectionRange {
  const limit = Math.max(0, maximum);
  return {
    anchor: Math.min(Math.max(0, selection.anchor), limit),
    head: Math.min(Math.max(0, selection.head), limit),
  };
}
