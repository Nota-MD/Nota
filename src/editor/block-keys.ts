/**
 * 块容器开头的三个退出动作。
 *
 * - 引用块最开头按空格：拆掉光标外的**全部**引用层，空格本身不再插入；
 * - 引用块最开头按退格：同样拆掉全部引用层，光标留在正文原来的位置；
 * - 空表格里任一空段落开头按退格：删掉整张表。
 *
 * 两件事都是 ProseMirror 的命令判据，不按主题或文档内容写特殊分支。键位挂在
 * `handleKeyDown`，因此在输入规则和 `baseKeymap` 之前决定是否消费这一下。
 */

import type { Node as PMNode } from "@milkdown/kit/prose/model";
import {
  Plugin,
  PluginKey,
  type EditorState,
  type Transaction,
} from "@milkdown/kit/prose/state";
import { lift } from "@milkdown/kit/prose/commands";
import { deleteTable, findTable } from "@milkdown/kit/prose/tables";
import { $prose } from "@milkdown/kit/utils";
import { debugEvent } from "@/ui/debug-log";
import { VIM_ALLOW_STRUCTURE_META } from "./plugin-vim-ops";

/** 光标是否在最外层引用框的绝对开头。 */
export function atReferenceUseMostOpenHead(state: EditorState): boolean {
  const { selection } = state;
  if (!selection.empty || selection.$from.parentOffset !== 0) return false;
  const $from = selection.$from;
  let hasReferenceUse = false;
  for (let layer = 1; layer <= $from.depth; layer += 1) {
    if ($from.node(layer).type.name !== "blockquote") continue;
    hasReferenceUse = true;
    // 当前段落、内层引用等每一级都必须是父节点的第一个孩子，才算“引用开头”。
    if ($from.index(layer - 1) !== 0) return false;
  }
  return hasReferenceUse;
}

/**
 * 取消光标外全部引用层。
 *
 * `lift` 一次只抬一层。循环在同一个 `EditorState` 上依次 apply 捕获到的事务并
 * 交给 view；这样嵌套引用会全部退出，而列表等别的容器只在确实挡住引用时参与
 * `lift` 的合法性判断。
 */
export function getClearAllReferenceUse(
  state: EditorState,
  dispatch?: (tr: Transaction) => void,
): boolean {
  if (!atReferenceUseMostOpenHead(state)) return false;
  if (!dispatch) return true;

  let current = state;
  let changed = false;
  for (let count2 = 0; count2 < 32; count2 += 1) {
    let liftOutput: Transaction | null = null;
    const lifted = lift(current, (tr) => (liftOutput = tr));
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

/** 单元格、行、段落等容器是否完全没有文字或原子内容。 */
function nodeAsEmpty(node: PMNode): boolean {
  if (node.isText) return node.text?.trim() === "";
  if (node.isLeaf) return false;
  let emptyValue = true;
  node.forEach((child3) => {
    if (!nodeAsEmpty(child3)) emptyValue = false;
  });
  return emptyValue;
}

/** 光标是否在空表格的一个空段落开头。 */
export function atEmptyTableCellOpenHead(state: EditorState): boolean {
  const { selection } = state;
  if (!selection.empty || selection.$from.parentOffset !== 0) return false;
  if (selection.$from.parent.content.size !== 0) return false;
  const table2 = findTable(selection.$from);
  return table2 !== null && nodeAsEmpty(table2.node);
}

/** 在空表格开头退格时删掉整张表。 */
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
            if (!atReferenceUseMostOpenHead(view.state)) return false;
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
          return false;
        },
      },
    }),
);
