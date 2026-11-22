














































import { Plugin } from "@milkdown/kit/prose/state";
import type { EditorState } from "@milkdown/kit/prose/state";
import { $prose } from "@milkdown/kit/utils";







export interface SelectionSnapshot {









  text: string;







  empty: boolean;
}








export function readSelectionSnapshot(state: EditorState): SelectionSnapshot {
  const sel = state.selection;
  if (sel.empty) return { text: "", empty: true };
  return { text: state.doc.textBetween(sel.from, sel.to, "\n"), empty: false };
}












export function selectionSnapshotPlugin(onChange: (snapshot: SelectionSnapshot) => void) {
  return $prose(() => createSelectionSnapshotPlugin(onChange));
}








export function createSelectionSnapshotPlugin(onChange: (snapshot: SelectionSnapshot) => void) {
  return new Plugin({
    view: (view: { state: EditorState }) => {
      let aboveCount: string | null = null;
      const report = (state: EditorState) => {
        const now = readSelectionSnapshot(state);
        const sig = `${now.empty ? 1 : 0}|${now.text}`;
        if (sig === aboveCount) return;
        aboveCount = sig;
        onChange(now);
      };

      report(view.state);
      return {
        update: (view: { state: EditorState }) => {
          report(view.state);



          return false;
        },
      };
    },
  });
}
