





































import { Plugin, PluginKey } from "@milkdown/kit/prose/state";
import type { EditorState } from "@milkdown/kit/prose/state";


export const coverWriteKey = new PluginKey<boolean>("notaOvertype");


export function coverWriteOpen(state: EditorState): boolean {
  return coverWriteKey.getState(state) === true;
}









function rightEdgeOneToken(state: EditorState, position2: number): string {
  const position = state.doc.resolve(position2);
  if (!position.parent.inlineContent) return "";
  const start5 = position.parentOffset;
  const end2 = start5 + 2;
  if (start5 >= position.parent.content.size) return "";
  const two2 = position.parent.textBetween(start5, Math.min(end2, position.parent.content.size), "");
  if (two2.length === 0) return "";
  const value = two2.codePointAt(0);
  if (value === undefined) return "";
  return String.fromCodePoint(value);
}


export function coverWritePlugin(): Plugin<boolean> {
  return new Plugin<boolean>({
    key: coverWriteKey,
    state: {
      init: () => false,
      apply(tr, oldValue) {

        const flip = tr.getMeta(coverWriteKey) as boolean | undefined;
        return flip === undefined ? oldValue : flip;
      },
    },
    props: {
      handleKeyDown(view, event) {
        if (event.key !== "Insert") return false;

        if (view.composing) return false;
        const newValue = !coverWriteOpen(view.state);
        view.dispatch(view.state.tr.setMeta(coverWriteKey, newValue).setMeta("addToHistory", false));
        return true;
      },
      handleTextInput(view, from, to2, text2) {
        if (!coverWriteOpen(view.state)) return false;

        if (view.composing) return false;
        if (text2.length === 0 || text2.length > 1 || text2.includes("\n")) return false;
        const { selection } = view.state;
        if (!selection.empty || from !== to2) return false;
        const top = rightEdgeOneToken(view.state, from);
        if (top === "") return false;
        const transaction = view.state.tr.insertText(text2, from, to2 + top.length);
        view.dispatch(transaction);
        return true;
      },
    },
  });
}
