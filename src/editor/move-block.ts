















































import { editorViewCtx } from "@milkdown/kit/core";
import type { Editor } from "@milkdown/kit/core";
import type { Node as PMNode } from "@milkdown/kit/prose/model";
import { NodeSelection, Plugin, PluginKey, TextSelection } from "@milkdown/kit/prose/state";
import type { EditorView } from "@milkdown/kit/prose/view";
import { $prose } from "@milkdown/kit/utils";


const columnTableName = new Set(["bullet_list", "ordered_list"]);










export interface movePlan {

  remove: { from: number; to: number };

  insertTo: number;

  cursor: number;

  block: PMNode;
}

function clamp(value2: number, below: number, above: number): number {
  return Math.max(below, Math.min(value2, above));
}








function childStart(contentStart2: number, container: PMNode, index: number): number {
  let start4 = contentStart2;
  for (let i = 0; i < index; i++) start4 += container.child(i).nodeSize;
  return start4;
}







export function computeMoveAction(doc: PMNode, position2: number, direction: -1 | 1): movePlan | null {
  const $pos = doc.resolve(clamp(position2, 0, doc.content.size));



  for (let d = $pos.depth; d > 0; d--) {
    if ($pos.node(d).type.name === "table") return null;
  }


  let container: PMNode = doc;
  let containerStart = 0;
  let layer = 0;
  for (let d = $pos.depth; d > 0; d--) {
    if (columnTableName.has($pos.node(d).type.name)) {
      container = $pos.node(d);
      containerStart = $pos.before(d);
      layer = d;
      break;
    }
  }
  const index = $pos.index(layer);
  const neighborNumber = index + direction;
  if (neighborNumber < 0 || neighborNumber >= container.childCount) return null;

  const block = container.child(index);
  const neighbor = container.child(neighborNumber);

  const blockStart = childStart(layer === 0 ? 0 : containerStart + 1, container, index);






  const insertTo = direction < 0 ? blockStart - neighbor.nodeSize : blockStart + neighbor.nodeSize;

  const blockInside = clamp(position2 - blockStart - 1, 0, block.content.size);

  return {
    remove: { from: blockStart, to: blockStart + block.nodeSize },
    insertTo,
    cursor: insertTo + 1 + blockInside,
    block,
  };
}









export function moveBlockView(view: EditorView, direction: -1 | 1): boolean {
  const { state } = view;
  const plan = computeMoveAction(state.doc, state.selection.from, direction);
  if (!plan) return false;
  const tr = state.tr.delete(plan.remove.from, plan.remove.to).insert(plan.insertTo, plan.block);






  const DropPoint = tr.doc.resolve(plan.cursor);
  tr.setSelection(
    DropPoint.parent.isTextblock
      ? TextSelection.create(tr.doc, plan.cursor)
      : NodeSelection.create(tr.doc, plan.insertTo),
  );

  tr.scrollIntoView();
  view.dispatch(tr);
  return true;
}


export function moveBlock(editor: Editor, direction: -1 | 1): void {
  editor.action((ctx) => {
    moveBlockView(ctx.get(editorViewCtx), direction);
  });
}
































export function createMoveKeymap(): Plugin {
  return new Plugin({
    key: new PluginKey("nota-move-block"),
    props: {
      handleKeyDown: (view, event) => {
        if (event.key !== "ArrowUp" && event.key !== "ArrowDown") return false;
        if (!event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return false;
        if (view.composing) return false;
        if (event.defaultPrevented) return true;
        moveBlockView(view, event.key === "ArrowUp" ? -1 : 1);
        return true;
      },
    },
  });
}


export const moveKeymap = $prose(() => createMoveKeymap());
