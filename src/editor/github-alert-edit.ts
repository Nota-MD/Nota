














import { editorViewCtx, type Editor } from "@milkdown/kit/core";
import { TextSelection, type EditorState, type Transaction } from "@milkdown/kit/prose/state";

import type { GitHubNotice } from "./github-alert";

export function githubAlertNode(
  editor: Editor,
  kind: GitHubNotice,
) {
  editor.action((ctx) => {
    const view = ctx.get(editorViewCtx);
    const tr = githubAlertTransaction(view.state, kind);
    if (!tr) return;
    view.dispatch(tr);
    view.focus();
  });
}





export function githubAlertTransaction(
  state: EditorState,
  kind: GitHubNotice,
): Transaction | null {
  const blockquote = state.schema.nodes.blockquote;
  const paragraph = state.schema.nodes.paragraph;
  if (!blockquote || !paragraph) return null;

  const { $from } = state.selection;
  if (!$from.parent.isTextblock) return null;

  const marker = paragraph.create(
    null,
    state.schema.text(`[!${kind.toUpperCase()}]`),
  );
  const body = paragraph.create();
  const alert = blockquote.create(null, [marker, body]);
  const depth = $from.depth;
  const from = $from.before(depth);
  const to = $from.after(depth);
  const replaceEmpty = $from.parent.content.size === 0;
  const at = replaceEmpty ? from : to;
  const tr = replaceEmpty
    ? state.tr.replaceWith(from, to, alert)
    : state.tr.insert(to, alert);
  const bodyAt = at + 1 + marker.nodeSize + 1;
  return tr.setSelection(TextSelection.near(tr.doc.resolve(bodyAt))).scrollIntoView();
}
