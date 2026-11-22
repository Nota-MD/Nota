










import type { Node as PMNode } from "@milkdown/kit/prose/model";
import {
  Plugin,
  PluginKey,
  TextSelection,
  type EditorState,
  type Transaction,
} from "@milkdown/kit/prose/state";
import { lift, liftEmptyBlock } from "@milkdown/kit/prose/commands";
import { liftListItem } from "@milkdown/kit/prose/schema-list";
import { deleteTable, findTable } from "@milkdown/kit/prose/tables";
import { $prose } from "@milkdown/kit/utils";
import { debugEvent } from "@/ui/debug-log";
import { VIM_ALLOW_STRUCTURE_META } from "./plugin-vim-ops";


export function atReferenceUseMostOpenHead(state: EditorState): boolean {
  const { selection } = state;
  if (!selection.empty) return false;
  const $from = selection.$from;
  const emptyLine = $from.parent.isTextblock &&
    $from.parent.content.size === 0 &&
    $from.parentOffset === 0;
  if (!emptyLine && $from.parentOffset !== 0) return false;
  let hasReferenceUse = false;
  for (let layer = 1; layer <= $from.depth; layer += 1) {
    if ($from.node(layer).type.name !== "blockquote") continue;
    hasReferenceUse = true;

    if (!emptyLine && $from.index(layer - 1) !== 0) return false;
  }
  return hasReferenceUse;
}


export function exitEmptyListItem(
  state: EditorState,
  dispatch?: (tr: Transaction) => void,
): boolean {
  const { selection } = state;
  if (!selection.empty || selection.$from.parent.content.size !== 0) return false;
  const $from = selection.$from;
  let depth = $from.depth;
  while (depth > 0 && $from.node(depth).type.name !== "list_item") depth--;
  if (depth === 0) return false;
  return liftListItem($from.node(depth).type)(state, dispatch);
}








export function getClearAllReferenceUse(
  state: EditorState,
  dispatch?: (tr: Transaction) => void,
): boolean {
  if (!atReferenceUseMostOpenHead(state)) return false;
  if (!dispatch) return true;

  const { $from } = state.selection;
  const quoteDepth = $from.depth - 1;
  if (
    $from.parent.content.size === 0 &&
    quoteDepth > 0 &&
    $from.node(quoteDepth).type.name === "blockquote"
  ) {
    const quote = $from.node(quoteDepth);
    const paragraph = state.schema.nodes.paragraph?.createAndFill();
    if (paragraph) {
      const paragraphStart = $from.before($from.depth);
      const quoteStart = $from.before(quoteDepth);
      const firstLine = quote.firstChild?.textContent.trim() ?? "";
      const markerOnlyAlert =
        quote.childCount === 2 &&
        /^\[!(?:NOTE|TIP|IMPORTANT|WARNING|CAUTION)\]$/.test(firstLine) &&
        $from.index(quoteDepth) === 1 &&
        $from.parent.content.size === 0;
      if (markerOnlyAlert) {
        const tr = state.tr.replaceWith(
          quoteStart,
          quoteStart + quote.nodeSize,
          paragraph,
        );
        tr.setSelection(TextSelection.create(tr.doc, quoteStart + 1));
        tr.scrollIntoView();
        tr.setMeta(VIM_ALLOW_STRUCTURE_META, true);
        dispatch(tr);
        return true;
      }
      if (quote.childCount === 1) {
        const tr = state.tr
          .replaceWith(quoteStart, quoteStart + quote.nodeSize, paragraph);
        tr.setSelection(TextSelection.create(tr.doc, quoteStart + 1));
        tr.scrollIntoView();
        tr.setMeta(VIM_ALLOW_STRUCTURE_META, true);
        dispatch(tr);
        return true;
      }
      const tr = state.tr.delete(paragraphStart, paragraphStart + $from.parent.nodeSize);
      const quoteEnd = tr.mapping.map(quoteStart + quote.nodeSize, 1);
      tr.insert(quoteEnd, paragraph);
      tr.setSelection(TextSelection.create(tr.doc, quoteEnd + 1));
      tr.setMeta(VIM_ALLOW_STRUCTURE_META, true);
      dispatch(tr.scrollIntoView());
      return true;
    }
  }

  let current = state;
  let changed = false;
  const emptyLine = state.selection.$from.parent.content.size === 0;
  for (let count2 = 0; count2 < 32; count2 += 1) {
    let liftOutput: Transaction | null = null;
    const liftOne = emptyLine ? liftEmptyBlock : lift;
    const lifted = liftOne(current, (tr) => (liftOutput = tr));
    debugEvent("editor", "blockquote lift probe", {
      lifted,
      has_transaction: liftOutput !== null,
    });
    if (!lifted) break;
    if (!liftOutput) break;
    const output = liftOutput as Transaction;
    output.setMeta(VIM_ALLOW_STRUCTURE_META, true);
    dispatch(output);
    changed = true;
    current = current.apply(output);
    const $from = current.selection.$from;
    let returnHasReferenceUse = false;
    for (let layer = 1; layer <= $from.depth; layer += 1) {
      if ($from.node(layer).type.name === "blockquote") {
        returnHasReferenceUse = true;
        break;
      }
    }
    if (!returnHasReferenceUse) break;
  }
  return changed;
}

/** Turn an empty paragraph containing only `>` into a blockquote. */
export function quoteFromTypedPrefix(
  state: EditorState,
  dispatch?: (tr: Transaction) => void,
): boolean {
  const { selection } = state;
  if (!selection.empty) return false;
  const { $from } = selection;
  if (!$from.parent.isTextblock || $from.parent.textContent !== ">") return false;
  if ($from.parentOffset !== 1) return false;
  if (!$from.parent.type.name.startsWith("paragraph")) return false;

  const blockquote = state.schema.nodes.blockquote;
  const paragraph = state.schema.nodes.paragraph?.createAndFill();
  if (!blockquote || !paragraph) return false;
  if (!dispatch) return true;

  const from = $from.before($from.depth);
  const to = $from.after($from.depth);
  const tr = state.tr.replaceWith(
    from,
    to,
    blockquote.create(null, paragraph),
  );
  tr.setSelection(TextSelection.create(tr.doc, from + 2));
  tr.scrollIntoView();
  dispatch(tr);
  return true;
}


function nodeAsEmpty(node: PMNode): boolean {
  if (node.isText) return node.text?.trim() === "";
  if (node.isLeaf) return false;
  let emptyValue = true;
  node.forEach((child3) => {
    if (!nodeAsEmpty(child3)) emptyValue = false;
  });
  return emptyValue;
}


export function atEmptyTableCellOpenHead(state: EditorState): boolean {
  const { selection } = state;
  if (!selection.empty || selection.$from.parentOffset !== 0) return false;
  if (selection.$from.parent.content.size !== 0) return false;
  const table2 = findTable(selection.$from);
  return table2 !== null && nodeAsEmpty(table2.node);
}


export function deleteEmptyTable(
  state: EditorState,
  dispatch?: (tr: Transaction) => void,
): boolean {
  if (!atEmptyTableCellOpenHead(state)) return false;
  return deleteTable(state, dispatch
    ? (tr) => {
        tr.setMeta(VIM_ALLOW_STRUCTURE_META, true);
        dispatch(tr);
      }
    : undefined);
}

export const blockContainerKeypress = $prose(
  () =>
    new Plugin({
      key: new PluginKey("nota-block-container-keys"),
      props: {
        handleKeyDown: (view, event) => {
          if (event.isComposing || event.ctrlKey || event.metaKey || event.altKey) {
            return false;
          }
          if (event.key === " " && !event.shiftKey) {
            if (!atReferenceUseMostOpenHead(view.state)) {
              if (!quoteFromTypedPrefix(view.state, (tr) => view.dispatch(tr))) {
                return false;
              }
              event.preventDefault();
              return true;
            }
            event.preventDefault();
            getClearAllReferenceUse(view.state, (tr) => view.dispatch(tr));
            return true;
          }
          if (event.key === "Backspace" && !event.shiftKey) {
            if (atReferenceUseMostOpenHead(view.state)) {
              debugEvent("editor", "blockquote backspace accepted", {
                depth: view.state.selection.$from.depth,
              });
              event.preventDefault();
              return getClearAllReferenceUse(view.state, (tr) => view.dispatch(tr));
            }
            if (!atEmptyTableCellOpenHead(view.state)) return false;
            event.preventDefault();
            return deleteEmptyTable(view.state, (tr) => view.dispatch(tr));
          }
          if (event.key === "Enter" && !event.shiftKey) {
            return exitEmptyListItem(view.state, (tr) => view.dispatch(tr));
          }
          return false;
        },
      },
    }),
);
