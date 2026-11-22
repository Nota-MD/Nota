

































import { $prose } from "@milkdown/kit/utils";
import { Plugin, PluginKey } from "@milkdown/kit/prose/state";
import type { Transaction } from "@milkdown/kit/prose/state";
import { splitListItem } from "@milkdown/kit/prose/schema-list";
import type { EditorView } from "@milkdown/kit/prose/view";


const GUTTER_FALLBACK = 22;


const TASK_ITEM_SELECTOR = 'li[data-item-type="task"]';






function gutterWidth(view: EditorView): number {
  const raw = window.getComputedStyle(view.dom).getPropertyValue("--task-check-gutter");
  const n = Number.parseFloat(raw);
  return Number.isFinite(n) ? n : GUTTER_FALLBACK;
}








function toggleTaskItem(view: EditorView, itemElement: HTMLElement): boolean {
  const $pos = view.state.doc.resolve(view.posAtDOM(itemElement, 0));

  let depth = $pos.depth;
  while (depth > 0 && $pos.node(depth).type.name !== "list_item") depth--;
  if (depth === 0) return false;

  const node = $pos.node(depth);
  if (node.attrs.checked == null) return false;

  const nodePos = $pos.before(depth);
  view.dispatch(
    view.state.tr.setNodeMarkup(nodePos, undefined, {
      ...node.attrs,
      checked: !node.attrs.checked,
    }),
  );
  return true;
}






function listItemDepthAt(pos: { depth: number; node: (d: number) => { type: { name: string } } }): number {
  for (let d = pos.depth; d > 0; d--) {
    if (pos.node(d).type.name === "list_item") return d;
  }
  return -1;
}
























function enterInTaskItem(view: EditorView): boolean {
  const { state } = view;
  const { $from, empty } = state.selection;
  if (!empty) return false;

  const depth = listItemDepthAt($from);
  if (depth < 0) return false;

  const item = $from.node(depth);
  if (item.attrs.checked == null) return false;



  const box: { tr: Transaction | null } = { tr: null };
  if (!splitListItem(item.type)(state, (t) => (box.tr = t))) return false;

  const split = box.tr;
  if (!split) return false;

  const $sel = split.selection.$from;
  const newDepth = listItemDepthAt($sel);
  if (newDepth > 0) {
    const fresh = $sel.node(newDepth);


    if (fresh.attrs.checked === true) {
      split.setNodeMarkup($sel.before(newDepth), undefined, {
        ...fresh.attrs,
        checked: false,
      });
    }
  }

  view.dispatch(split);
  return true;
}










export const taskList = $prose(
  () =>
    new Plugin({
      key: new PluginKey("nota-task-list"),
      props: {
        handleKeyDown: (view, event) => {


          if (event.key !== "Enter" || event.shiftKey || event.ctrlKey || event.metaKey || event.altKey) {
            return false;
          }
          return enterInTaskItem(view);
        },

        handleDOMEvents: {
          mousedown: (view, event) => {

            if (event.button !== 0 || event.ctrlKey || event.metaKey || event.shiftKey) {
              return false;
            }

            const gutter = gutterWidth(view);
            const items = view.dom.querySelectorAll<HTMLElement>(TASK_ITEM_SELECTOR);

            for (const itemElement of Array.from(items)) {
              const rect = itemElement.getBoundingClientRect();
              const inRow = event.clientY >= rect.top && event.clientY <= rect.bottom;
              const inGutter =
                event.clientX < rect.left && event.clientX >= rect.left - gutter;
              if (inRow && inGutter) {
                event.preventDefault();
                return toggleTaskItem(view, itemElement);
              }
            }
            return false;
          },
        },
      },
    }),
);
