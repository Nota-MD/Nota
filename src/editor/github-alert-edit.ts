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

/**
 * 在当前文本块的位置建立 Alert。把事务构造单独拿出来，测试才能在无 DOM
 * 的 ProseMirror state 上验证列表、引用等嵌套上下文，不必只相信菜单接线。
 */
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
