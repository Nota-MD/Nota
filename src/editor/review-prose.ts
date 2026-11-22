


































import type { Node as pMNode } from "@milkdown/kit/prose/model";
import { DOMSerializer } from "@milkdown/kit/prose/model";
import type { EditorState } from "@milkdown/kit/prose/state";
import { Plugin, PluginKey } from "@milkdown/kit/prose/state";
import type { EditorView } from "@milkdown/kit/prose/view";
import { Decoration, DecorationSet } from "@milkdown/kit/prose/view";
import { parserCtx, serializerCtx } from "@milkdown/kit/core";
import { $prose } from "@milkdown/kit/utils";

import { removeClass, differenceException, createIncreaseBox, type changePreview } from "./review";









interface PreviewState {
  preview: changePreview | null;

  decoration: DecorationSet | null;
}

const emptyState2: PreviewState = { preview: null, decoration: null };


export const previewDollar = "nota-review";

export const previewKey = new PluginKey<PreviewState>("nota-review");


export function previewMiddleQuestion(state: EditorState): boolean {
  return Boolean(previewKey.getState(state)?.preview);
}




interface WithPositionBlock {
  node: pMNode;
  start5: number;
  end2: number;
}







function topLayerBlock(document: pMNode): WithPositionBlock[] {
  const output2: WithPositionBlock[] = [];
  document.forEach((node, offset) => {
    output2.push({ node, start5: offset, end2: offset + node.nodeSize });
  });
  return output2;
}


function blockText(serialize: (n: pMNode) => string, node: pMNode): string {
  try {
    const singleBlock = node.type.schema.topNodeType.create(null, node);
    return serialize(singleBlock).trim();
  } catch {



    return node.textContent.trim();
  }
}












function pinchTailEmptyBlock(block: WithPositionBlock[], serialize: (n: pMNode) => string): WithPositionBlock[] {
  let tail = block.length;
  while (tail > 0 && blockText(serialize, block[tail - 1]!.node) === "") tail--;
  return block.slice(0, tail);
}








function computeDecorations(
  serialize: (n: pMNode) => string,
  parse: (md: string) => pMNode,
  document: pMNode,
  preview: changePreview,
): DecorationSet | null {
  const oldValue = pinchTailEmptyBlock(topLayerBlock(document), serialize);
  const newValue = pinchTailEmptyBlock(topLayerBlock(parse(preview.text)), serialize);
  if (oldValue.length === 0 && newValue.length === 0) return null;

  const singleDollar = differenceException(
    oldValue.map((b) => blockText(serialize, b.node)),
    newValue.map((b) => blockText(serialize, b.node)),
  );

  const decoration: Decoration[] = [];

  let DropPoint = -1;

  let newValueNavigateMark = 0;

  for (const item5 of singleDollar) {
    if (item5.class === "same") {
      DropPoint = item5.position3;
      newValueNavigateMark++;
    } else if (item5.class === "delete") {
      const block = oldValue[item5.position3];
      if (block) decoration.push(Decoration.node(block.start5, block.end2, { class: removeClass }));
      DropPoint = item5.position3;
    } else {
      const number2 = item5.line3.length;
      const wantDrawOf = newValue.slice(newValueNavigateMark, newValueNavigateMark + number2);
      newValueNavigateMark += number2;
      const position3 = DropPoint < 0 ? 0 : (oldValue[DropPoint]?.end2 ?? document.content.size);
      decoration.push(
        Decoration.widget(position3, () => drawIncreaseBox(wantDrawOf), {


          side: 1,

          ignoreSelection: true,



          key: `nota-review-add-${DropPoint}-${newValueNavigateMark}`,
        }),
      );
    }
  }

  return decoration.length ? DecorationSet.create(document, decoration) : null;
}


function drawIncreaseBox(blockPlural: WithPositionBlock[]): HTMLElement {
  return createIncreaseBox(
    blockPlural.map((block) => {
      const dom = DOMSerializer.fromSchema(block.node.type.schema).serializeNode(
        block.node,
      );
      if (dom instanceof HTMLElement) return dom;
      const shell = document.createElement("div");
      shell.append(dom);
      return shell;
    }),
  );
}


















export function previewPlugin(
  initialStart: changePreview | null,
  backOutput: () => void,
): ReturnType<typeof $prose> {
  return $prose(
    (ctx) =>
      new Plugin<PreviewState>({
        key: previewKey,
        state: {






          init: (cfg): PreviewState => {
            if (!initialStart || !cfg.doc) return emptyState2;
            return {
              preview: initialStart,
              decoration: computeDecorations(
                (n) => ctx.get(serializerCtx)(n),
                (md) => ctx.get(parserCtx)(md) as unknown as pMNode,
                cfg.doc,
                initialStart,
              ),
            };
          },
          apply: (tr, prev) => {
            const loadLoad = tr.getMeta(previewDollar) as changePreview | null | undefined;
            if (loadLoad === undefined) {



              return tr.docChanged ? emptyState2 : prev;
            }
            if (loadLoad === null) return emptyState2;
            return {
              preview: loadLoad,
              decoration: computeDecorations(
                (n) => ctx.get(serializerCtx)(n),
                (md) => ctx.get(parserCtx)(md) as unknown as pMNode,
                tr.doc,
                loadLoad,
              ),
            };
          },
        },

        //




        //


        filterTransaction: (tr, state) => !(previewMiddleQuestion(state) && tr.docChanged),
        props: {
          decorations(state) {
            return previewKey.getState(state)?.decoration ?? null;
          },
          handleKeyDown(view, event) {
            if (event.key !== "Escape") return false;
            if (!previewMiddleQuestion(view.state)) return false;

            if (event.isComposing || event.keyCode === 229) return false;
            event.preventDefault();
            event.stopPropagation();
            backOutput();
            return true;
          },
        },
      }),
  );
}


export function setPreview(view: EditorView, preview: changePreview | null): void {
  view.dispatch(view.state.tr.setMeta(previewDollar, preview));
}
