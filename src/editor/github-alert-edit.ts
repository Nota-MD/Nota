/**
 * GitHub Alerts 的插入动作。
 *
 * 解析、屏幕样式与源码往返由 `github-alert.ts` 负责；这里只负责从菜单或斜杠
 * 菜单凭空造出一块合法的引用块。源码仍是标准的：
 *
 * ```md
 * > [!NOTE]
 * >
 * > 正文
 * ```
 *
 * 新块先放一行标记和一段空正文，光标落在正文段，用户可以直接打字。
 */

import { editorViewCtx, type Editor } from "@milkdown/kit/core";
import { TextSelection } from "@milkdown/kit/prose/state";

import type { GitHubNotice } from "./github-alert";

export function githubAlertNode(
  editor: Editor,
  kind: GitHubNotice,
) {
  editor.action((ctx) => {
    const view = ctx.get(editorViewCtx);
    const { state } = view;
    const blockquote = state.schema.nodes.blockquote;
    const paragraph = state.schema.nodes.paragraph;
    if (!blockquote || !paragraph) return;

    const { $from } = state.selection;
    if ($from.depth !== 1) return;

    const marker = paragraph.create(
      null,
      state.schema.text(`[!${kind.toUpperCase()}]`),
    );
    const body = paragraph.create(null, state.schema.text(""));
    const alert = blockquote.create(null, [marker, body]);
    const replaceEmpty =
      $from.parent.isTextblock && $from.parent.content.size === 0;
    const from = $from.before(1);
    const to = $from.after(1);
    const at = replaceEmpty ? from : to;
    const tr = replaceEmpty
      ? state.tr.replaceWith(from, to, alert)
      : state.tr.insert(to, alert);
    const bodyAt = at + 1 + marker.nodeSize + 1;
    tr.setSelection(TextSelection.near(tr.doc.resolve(bodyAt)));
    view.dispatch(tr.scrollIntoView());
    view.focus();
  });
}
