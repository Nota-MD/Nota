








































import { Plugin, PluginKey } from "@milkdown/kit/prose/state";
import type { EditorState } from "@milkdown/kit/prose/state";
import type { EditorView } from "@milkdown/kit/prose/view";
import { Decoration, DecorationSet } from "@milkdown/kit/prose/view";
import { $prose } from "@milkdown/kit/utils";


import { findScrollContainer } from "./scroll-into-view";


export interface WritingMode {
  focus: boolean;
  typewriter: boolean;
}

export const defaultWritingModes: WritingMode = { focus: false, typewriter: false };


export const writingModeDollar = "nota-writing-modes";

export const writingModeKey = new PluginKey<WritingMode>("nota-writing-modes");


export const pressDarkClass = "nota-dim";







export const dedicatedNoteClass = "nota-focus";
export const brightLineClass = "nota-focus-on";









export function rollToCorrectMiddle(container: HTMLElement | null, above: number, below: number): void {
  if (!container) {

    const biasDifference = (above + below) / 2 - window.innerHeight / 2;
    if (Math.abs(biasDifference) >= 1) window.scrollBy(0, biasDifference);
    return;
  }
  const box2 = container.getBoundingClientRect();
  const biasDifference = (above + below) / 2 - (box2.top + box2.height / 2);
  if (Math.abs(biasDifference) < 1) return;
  container.scrollTop += biasDifference;
}










function computePressDark(state: EditorState): DecorationSet {
  const $from = state.selection.$from;
  const decoration: Decoration[] = [];

  for (let d = $from.depth; d >= 1; d--) {
    const parent = $from.node(d - 1);
    const currentChildBelowMark = $from.index(d - 1);


    const start4 = $from.start(d - 1);
    parent.forEach((child3, offset, belowMark) => {

      if (belowMark === currentChildBelowMark || child3.isText || child3.isInline) return;
      decoration.push(
        Decoration.node(start4 + offset, start4 + offset + child3.nodeSize, { class: pressDarkClass }),
      );
    });
  }

  return DecorationSet.create(state.doc, decoration);
}







export function writingModePlugin(initialStart: WritingMode = defaultWritingModes) {
  return $prose(
    () =>
      new Plugin<WritingMode>({
        key: writingModeKey,
        state: {
          init: () => initialStart,
          apply: (tr, prev) => (tr.getMeta(writingModeDollar) as WritingMode | undefined) ?? prev,
        },
        props: {
          decorations(state) {
            const m = writingModeKey.getState(state);
            return m?.focus ? computePressDark(state) : null;
          },
        },
        view: () => ({
          update: (view, prevState) => {
            const current2 = writingModeKey.getState(view.state);
            if (!current2) return;
            const before2 = writingModeKey.getState(prevState);


            const wantRoll =
              current2.typewriter &&
              (!before2?.typewriter ||
                view.state.selection.head !== prevState.selection.head ||
                view.state.doc !== prevState.doc);
            if (wantRoll) rollToCurrentLine(view);


            return false;
          },
        }),
      }),
  );
}


export function rollToCurrentLine(view: EditorView): void {
  const position3 = view.coordsAtPos(view.state.selection.head);
  rollToCorrectMiddle(findScrollContainer(view.dom), position3.top, position3.bottom);
}


export function setWritingMode(view: EditorView, mode2: WritingMode): void {
  view.dispatch(view.state.tr.setMeta(writingModeDollar, mode2));
}
