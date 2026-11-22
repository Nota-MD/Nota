









































import { $prose } from "@milkdown/kit/utils";
import { Plugin, PluginKey } from "@milkdown/kit/prose/state";
import { Decoration, DecorationSet } from "@milkdown/kit/prose/view";
import type { Node as PMNode } from "@milkdown/kit/prose/model";


const MARK_CLASS = "nota-srcmark";


export const MARK_ATTR = "data-srcmark";







export function blockMark(node: PMNode, _parent: PMNode | null, _index: number): string | null {
  switch (node.type.name) {
    case "heading":

      return null;

    case "blockquote":
      // Typora expresses quotations with the block's own left rule. Drawing a
      // second `>` source marker beside it makes a plain quote and an Alert in
      // progress look like two nested gutters.
      return null;

    case "list_item":
      // Keep the native circle/number in both states. Replacing it with a
      // pseudo source marker made the marker jump on the focus frame.
      return null;

    case "code_block":








      return "```";

    default:
      return null;
  }
}


function buildDecorations(state: { selection: unknown; doc: PMNode }): DecorationSet {
  const sel = state.selection as {
    empty: boolean;
    $from: {
      depth: number;
      before: (d: number) => number;
      node: (d: number) => PMNode;
      index: (d: number) => number;
    };
  };

  if (!sel.empty) return DecorationSet.empty;

  const { $from } = sel;
  const decos: Decoration[] = [];




  for (let d = $from.depth; d > 0; d--) {
    const node = $from.node(d);
    const parent = d > 1 ? $from.node(d - 1) : null;
    const mark = blockMark(node, parent, parent ? $from.index(d - 1) : 0);
    if (!mark) continue;

    const from = $from.before(d);
    decos.push(

      Decoration.node(from, from + node.nodeSize, {
        class: MARK_CLASS,
        [MARK_ATTR]: mark,
      }),
    );
  }

  return decos.length ? DecorationSet.create(state.doc, decos) : DecorationSet.empty;
}









export const instantRender = $prose(
  () =>
    new Plugin({
      key: new PluginKey("nota-instant-render"),
      props: {
        decorations: (state) => buildDecorations(state as never),
      },
    }),
);
