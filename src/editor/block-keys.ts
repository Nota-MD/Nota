/**
 * 块容器开头的两个退出动作。
 *
 * - 引用块最开头按空格：拆掉光标外的**全部**引用层，空格本身不再插入；
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

/** 光标是否在最外层引用框的绝对开头。 */
export function 在引用最开头(state: EditorState): boolean {
  const { selection } = state;
  if (!selection.empty || selection.$from.parentOffset !== 0) return false;
  const $from = selection.$from;
  let 有引用 = false;
  for (let 层 = 1; 层 <= $from.depth; 层 += 1) {
    if ($from.node(层).type.name !== "blockquote") continue;
    有引用 = true;
    // 当前段落、内层引用等每一级都必须是父节点的第一个孩子，才算“引用开头”。
    if ($from.index(层 - 1) !== 0) return false;
  }
  return 有引用;
}

/**
 * 取消光标外全部引用层。
 *
 * `lift` 一次只抬一层。循环在同一个 `EditorState` 上依次 apply 捕获到的事务并
 * 交给 view；这样嵌套引用会全部退出，而列表等别的容器只在确实挡住引用时参与
 * `lift` 的合法性判断。
 */
export function 取消全部引用(
  state: EditorState,
  dispatch?: (tr: Transaction) => void,
): boolean {
  if (!在引用最开头(state)) return false;
  if (!dispatch) return true;

  let 当前 = state;
  for (let 次 = 0; 次 < 32; 次 += 1) {
    let 抬出: Transaction | null = null;
    if (!lift(当前, (tr) => (抬出 = tr))) break;
    if (!抬出) break;
    dispatch(抬出);
    当前 = 当前.apply(抬出);
    const $from = 当前.selection.$from;
    let 还有引用 = false;
    for (let 层 = 1; 层 <= $from.depth; 层 += 1) {
      if ($from.node(层).type.name === "blockquote") {
        还有引用 = true;
        break;
      }
    }
    if (!还有引用) break;
  }
  return true;
}

/** 单元格、行、段落等容器是否完全没有文字或原子内容。 */
function 节点为空(node: PMNode): boolean {
  if (node.isText) return node.text?.trim() === "";
  if (node.isLeaf) return false;
  let 空 = true;
  node.forEach((子) => {
    if (!节点为空(子)) 空 = false;
  });
  return 空;
}

/** 光标是否在空表格的一个空段落开头。 */
export function 在空表格开头(state: EditorState): boolean {
  const { selection } = state;
  if (!selection.empty || selection.$from.parentOffset !== 0) return false;
  if (selection.$from.parent.content.size !== 0) return false;
  const 表 = findTable(selection.$from);
  return 表 !== null && 节点为空(表.node);
}

/** 在空表格开头退格时删掉整张表。 */
export function 删除空表格(
  state: EditorState,
  dispatch?: (tr: Transaction) => void,
): boolean {
  if (!在空表格开头(state)) return false;
  return deleteTable(state, dispatch);
}

export const 块容器按键 = $prose(
  () =>
    new Plugin({
      key: new PluginKey("nota-block-container-keys"),
      props: {
        handleKeyDown: (view, event) => {
          if (event.isComposing || event.ctrlKey || event.metaKey || event.altKey) {
            return false;
          }
          if (event.key === " " && !event.shiftKey) {
            if (!在引用最开头(view.state)) return false;
            event.preventDefault();
            取消全部引用(view.state, (tr) => view.dispatch(tr));
            return true;
          }
          if (event.key === "Backspace" && !event.shiftKey) {
            if (!在空表格开头(view.state)) return false;
            event.preventDefault();
            return 删除空表格(view.state, (tr) => view.dispatch(tr));
          }
          return false;
        },
      },
    }),
);
