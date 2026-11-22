


































import type { Node as pMNode } from "@milkdown/kit/prose/model";
import { DOMSerializer } from "@milkdown/kit/prose/model";
import type { EditorState } from "@milkdown/kit/prose/state";
import { Plugin, PluginKey } from "@milkdown/kit/prose/state";
import type { EditorView } from "@milkdown/kit/prose/view";
import { Decoration, DecorationSet } from "@milkdown/kit/prose/view";
import { parserCtx, serializerCtx } from "@milkdown/kit/core";
import { $prose } from "@milkdown/kit/utils";
import type { KatexOptions } from "katex";

import {
  removeClass,
  differenceException,
  createIncreaseBox,
  inlineDifference,
  inlineIncreaseClass,
  type changePreview,
} from "./review";
import { katexOptionsCtx } from "./math-schema";
import { drawLatestMath } from "./math-render-target";









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

function isPlainTextBlock(node: pMNode): boolean {
  if (!node.isTextblock) return false;
  let plain = true;
  node.forEach((child) => {
    if (!child.isText) plain = false;
  });
  return plain;
}

function textMarkSequence(node: pMNode): string[] {
  const sequence: string[] = [];
  node.forEach((child) => {
    sequence.push(
      child.marks
        .map((mark) => `${mark.type.name}:${JSON.stringify(mark.attrs)}`)
        .sort()
        .join("|"),
    );
  });
  return sequence;
}

function renderedInlineSlice(node: pMNode, from: number, to: number): HTMLElement {
  const shell = document.createElement("span");
  shell.className = inlineIncreaseClass;
  const serializer = DOMSerializer.fromSchema(node.type.schema);
  let offset = 0;
  node.forEach((child) => {
    if (!child.isText) return;
    const text = child.text ?? "";
    const start = offset;
    const end = start + text.length;
    offset = end;
    const localFrom = Math.max(from, start);
    const localTo = Math.min(to, end);
    if (localFrom >= localTo) return;
    const piece = text.slice(localFrom - start, localTo - start);
    const rendered = serializer.serializeNode(node.type.schema.text(piece, child.marks));
    shell.append(rendered);
  });
  if (!shell.firstChild) shell.textContent = "";
  return shell;
}

function appendInlineChange(
  oldBlock: WithPositionBlock,
  newBlock: WithPositionBlock,
  decoration: Decoration[],
  keyPrefix: string,
): boolean {
  if (oldBlock.node.type !== newBlock.node.type) return false;
  if (!isPlainTextBlock(oldBlock.node) || !isPlainTextBlock(newBlock.node)) return false;
  if (
    textMarkSequence(oldBlock.node).join("\n") !==
    textMarkSequence(newBlock.node).join("\n")
  ) {
    return false;
  }
  const oldText = oldBlock.node.textContent;
  const newText = newBlock.node.textContent;
  const difference = inlineDifference(oldText, newText);
  if (!difference?.length) return false;

  const contentStart = oldBlock.start5 + 1;
  let insertIndex = 0;
  for (const part of difference) {
    if (part.kind === "insert") {
      decoration.push(
        Decoration.widget(
          contentStart + part.at,
          () => renderedInlineSlice(newBlock.node, part.from, part.to),
          {
            side: 1,
            ignoreSelection: true,
            key: `${keyPrefix}-inline-${insertIndex}`,
          },
        ),
      );
      insertIndex += 1;
      continue;
    }
    if (part.kind === "delete" && part.to > part.from) {
      decoration.push(
        Decoration.inline(contentStart + part.from, contentStart + part.to, {
          class: removeClass,
        }),
      );
    }
  }
  return true;
}

function addBlockIncrease(
  blocks: readonly WithPositionBlock[],
  position: number,
  decoration: Decoration[],
  key: string,
  katexOptions: KatexOptions,
): void {
  if (!blocks.length) return;
  decoration.push(
    Decoration.widget(position, () => drawIncreaseBox([...blocks], katexOptions), {
      side: 1,
      ignoreSelection: true,
      key,
    }),
  );
}








function computeDecorations(
  serialize: (n: pMNode) => string,
  parse: (md: string) => pMNode,
  document: pMNode,
  preview: changePreview,
  katexOptions: KatexOptions,
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

  for (let index = 0; index < singleDollar.length; index += 1) {
    const item5 = singleDollar[index]!;
    if (item5.class === "same") {
      DropPoint = oldValue[item5.position3]?.end2 ?? document.content.size;
      newValueNavigateMark++;
    } else if (item5.class === "delete") {
      const deleted: WithPositionBlock[] = [];
      while (index < singleDollar.length) {
        const current = singleDollar[index];
        if (current?.class !== "delete") break;
        const block = oldValue[current.position3];
        if (block) deleted.push(block);
        index += 1;
      }
      index -= 1;

      const next = singleDollar[index + 1];
      const inserted =
        next?.class === "add"
          ? newValue.slice(newValueNavigateMark, newValueNavigateMark + next.line3.length)
          : [];
      const paired = Math.min(deleted.length, inserted.length);
      const replacementBlocks: WithPositionBlock[] = [];
      for (let pair = 0; pair < paired; pair += 1) {
        const oldBlock = deleted[pair]!;
        const newBlock = inserted[pair]!;
        if (!appendInlineChange(
          oldBlock,
          newBlock,
          decoration,
          `nota-review-${oldBlock.start5}-${newBlock.start5}`,
        )) {
          decoration.push(
            Decoration.node(oldBlock.start5, oldBlock.end2, { class: removeClass }),
          );
          replacementBlocks.push(newBlock);
        }
      }
      for (let pair = paired; pair < deleted.length; pair += 1) {
        const block = deleted[pair]!;
        decoration.push(Decoration.node(block.start5, block.end2, { class: removeClass }));
      }
      const anchor = deleted.at(-1)?.end2 ?? (DropPoint < 0 ? 0 : DropPoint);
      const added = [...replacementBlocks];
      if (next?.class === "add") {
        added.push(...inserted.slice(paired));
        newValueNavigateMark += next.line3.length;
        index += 1;
      }
      addBlockIncrease(
        added,
        anchor,
        decoration,
        `nota-review-replace-${anchor}-${newValueNavigateMark}`,
        katexOptions,
      );
      DropPoint = anchor;
    } else {
      const number2 = item5.line3.length;
      const wantDrawOf = newValue.slice(newValueNavigateMark, newValueNavigateMark + number2);
      newValueNavigateMark += number2;
      const position3 = DropPoint < 0 ? 0 : DropPoint;
      addBlockIncrease(
        wantDrawOf,
        position3,
        decoration,
        `nota-review-add-${position3}-${newValueNavigateMark}`,
        katexOptions,
      );
      DropPoint = position3;
    }
  }

  return decoration.length ? DecorationSet.create(document, decoration) : null;
}


function drawIncreaseBox(
  blockPlural: WithPositionBlock[],
  katexOptions: KatexOptions,
): HTMLElement {
  return createIncreaseBox(
    blockPlural.map((block) => {
      if (block.node.type.name === "math_block") {
        const shell = document.createElement("div");
        shell.className = "nota-math nota-math-block md-math-block nota-math-readonly";
        const render = document.createElement("div");
        render.className = "nota-math-render";
        shell.append(render);
        drawLatestMath(render, String(block.node.attrs.value ?? ""), katexOptions);
        return shell;
      }
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
                ctx.get(katexOptionsCtx.key),
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
                ctx.get(katexOptionsCtx.key),
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
