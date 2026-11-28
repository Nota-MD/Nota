








































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


export const focusPathClass = "nota-focus-path";

export const focusContainerClass = "nota-focus-container";

export const focusModeClass = "nota-focus-mode";







export const dedicatedNoteClass = "nota-focus";
export const brightLineClass = "nota-focus-on";

export const typewriterClass = "nota-typewriter";

export const typewriterPaddingCssProperty = "--nota-typewriter-padding";

const centerFrames = new WeakMap<EditorView, number>();


export function typewriterPaddingForViewport(clientHeight: number): number {
  if (!Number.isFinite(clientHeight) || clientHeight <= 0) return 0;
  return Math.ceil(clientHeight / 2);
}









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










function computeFocusPath(state: EditorState): DecorationSet {
  const $from = state.selection.$from;
  const classes = new Map<number, Set<string>>();
  const addClass = (position: number, className: string) => {
    const current = classes.get(position) ?? new Set<string>();
    current.add(className);
    classes.set(position, current);
  };

  for (let depth = 1; depth <= $from.depth; depth++) {
    const node = $from.node(depth);
    if (node.isText || node.isInline) continue;
    addClass($from.before(depth), focusPathClass);

    const parent = $from.node(depth - 1);
    if (depth > 1 && !parent.isTextblock && !parent.isInline && !parent.isLeaf) {
      addClass($from.before(depth - 1), focusContainerClass);
    }
  }

  const decoration = [...classes].flatMap(([position, names]) => {
    const node = state.doc.nodeAt(position);
    if (!node) return [];
    return [
      Decoration.node(position, position + node.nodeSize, {
        class: [...names].join(" "),
      }),
    ];
  });
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
            return m?.focus ? computeFocusPath(state) : null;
          },
        },
        view: (editorView) => {
          const syncFocusClass = (state: EditorState) => {
            editorView.dom.classList.toggle(
              focusModeClass,
              Boolean(writingModeKey.getState(state)?.focus),
            );
          };
          syncFocusClass(editorView.state);
          return {
            update: (view, prevState) => {
              const current2 = writingModeKey.getState(view.state);
              if (!current2) return;
              syncFocusClass(view.state);
              const before2 = writingModeKey.getState(prevState);
              const wantRoll =
                current2.typewriter &&
                (!before2?.typewriter ||
                  view.state.selection.head !== prevState.selection.head ||
                  view.state.doc !== prevState.doc);
              if (wantRoll) scheduleCurrentLineCenter(view);
              return false;
            },
            destroy: () => {
              editorView.dom.classList.remove(focusModeClass);
            },
          };
        },
      }),
  );
}


export function rollToCurrentLine(view: EditorView): void {
  if (!view.dom.isConnected) return;
  const position3 = view.coordsAtPos(view.state.selection.head);
  rollToCorrectMiddle(findScrollContainer(view.dom), position3.top, position3.bottom);
}

export function scheduleCurrentLineCenter(view: EditorView): void {
  const pending = centerFrames.get(view);
  if (pending !== undefined) cancelAnimationFrame(pending);
  const frame = requestAnimationFrame(() => {
    centerFrames.delete(view);
    rollToCurrentLine(view);
  });
  centerFrames.set(view, frame);
}


export function setWritingMode(view: EditorView, mode2: WritingMode): void {
  view.dispatch(view.state.tr.setMeta(writingModeDollar, mode2));
  if (mode2.typewriter) scheduleCurrentLineCenter(view);
}
