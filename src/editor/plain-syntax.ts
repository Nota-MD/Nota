import type { EditorState } from "@milkdown/kit/prose/state";
import { Decoration, DecorationSet } from "@milkdown/kit/prose/view";

/** Literal Markdown punctuation that has not become a syntax node yet. */
export const syntaxTextClass = "nota-syntax-text";

const syntaxPunctuationPattern = /([*_~=^`$])\1*/gu;

/**
 * Find delimiter runs that need a deterministic font shaping path.
 *
 * Adwaita Sans substitutes repeated punctuation through contextual alternates.
 * WebKitGTK can then rasterize adjacent glyphs with different apparent weight
 * even when their layout rectangles match. The decoration changes only the
 * font shaping path; it does not change the document or Markdown semantics.
 */
export function plainSyntaxRanges(
  text4: string,
): Array<{ from: number; to2: number }> {
  const ranges: Array<{ from: number; to2: number }> = [];
  for (const match of text4.matchAll(syntaxPunctuationPattern)) {
    const from = match.index;
    let slashes = 0;
    for (let i = from - 1; i >= 0 && text4[i] === "\\"; i--) slashes++;
    if (slashes % 2 === 1) continue;
    ranges.push({ from, to2: from + match[0].length });
  }
  return ranges;
}

/** Decorate delimiter runs only in the text block holding the selection. */
export function inlineSyntaxDecorations(state: EditorState): DecorationSet {
  const decorations: Decoration[] = [];
  const { $from } = state.selection;
  let depth = $from.depth;
  while (depth > 0 && !$from.node(depth).isTextblock) depth--;
  const block = $from.node(depth);
  if (!block.isTextblock) return DecorationSet.empty;

  const blockStart = $from.start(depth);
  let offset = 0;
  block.forEach((child2) => {
    const excluded = child2.marks.some(
      (mark) => mark.type.name === "inlineCode" || mark.type.name === "link",
    );
    if (child2.isText && !excluded) {
      const text4 = child2.text ?? "";
      for (const range of plainSyntaxRanges(text4)) {
        decorations.push(
          Decoration.inline(
            blockStart + offset + range.from,
            blockStart + offset + range.to2,
            { class: syntaxTextClass },
          ),
        );
      }
    }
    offset += child2.nodeSize;
  });
  return DecorationSet.create(state.doc, decorations);
}
