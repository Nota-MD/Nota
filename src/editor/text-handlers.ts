/**
 * Text serialization is deliberately literal.
 *
 * Ordinary text is returned as stored. The editor never calls the upstream
 * safe serializer for text, never adds backslashes, and never replaces source
 * characters with inline atoms. Explicit user backslashes remain untouched.
 *
 * The only exception is a literal `|` in a GFM table cell: writing it raw would
 * split the cell, so it is emitted as `&#124;`. This is a character reference,
 * not a backslash escape, and does not affect ordinary paragraph text.
 *
 * The WebKit NBSP that appears immediately after a real inline atom is still
 * normalized to an ordinary space as before.
 */

import { remarkStringifyOptionsCtx } from "@milkdown/kit/core";

import { ReplaceNbspAfterInlineAtom } from "./atom-space";

/** remark 序列化选项的类型：**从 ctx 反推出来**（同 `lax-heading.ts`）。 */
type StringConvertOption = ReturnType<typeof remarkStringifyOptionsCtx._typeInfo>;
/** mdast 的文本处理器（`handlers.text` 那一条）。 */
export type textHandler = NonNullable<NonNullable<StringConvertOption["handlers"]>["text"]>;

interface TextNodeLike {
  type?: string;
  value?: string;
  children?: TextNodeLike[];
}

function previousSiblingType(
  node: TextNodeLike,
  parent: TextNodeLike | undefined,
): string | undefined {
  const siblings = parent?.children;
  if (!Array.isArray(siblings)) return undefined;
  const index = siblings.indexOf(node);
  return index > 0 ? siblings[index - 1]?.type : undefined;
}

/**
 * Text is written exactly as stored. In particular the editor never asks the
 * Markdown serializer to add backslashes and never replaces source characters
 * with inline atoms. The only normalization retained here is the WebKit NBSP
 * immediately following a real inline atom.
 */
function literalTextWithoutEscapes(): textHandler {
  return (node, parent) => {
    let value = node.value ?? "";
    const parentNode = parent as TextNodeLike | undefined;
    if (parentNode?.type === "tableCell" && value.includes("|")) {
      // A literal cell separator would split one GFM cell into several cells.
      // Use a character reference rather than inserting a backslash.
      value = value.replaceAll("|", "&#124;");
    }
    const previous = previousSiblingType(
      node as TextNodeLike,
      parentNode,
    );
    return ReplaceNbspAfterInlineAtom(value, previous);
  };
}

/** Return the literal-text policy; the old source handler is not called. */
export function textHandlerChain(_source?: textHandler): textHandler {
  return literalTextWithoutEscapes();
}
