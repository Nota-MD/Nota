/**
 * GitHub Markdown 提示块（Alerts）。
 *
 * `> [!NOTE]`、`[!TIP]`、`[!IMPORTANT]`、`[!WARNING]`、`[!CAUTION]`
 * 在源码里仍是普通引用块。这里只加装饰，不改 schema、不改序列化，因此打开再存
 * 不会多出任何字符。
 */

import { Plugin, PluginKey, type EditorState } from "@milkdown/kit/prose/state";
import type { Node as PMNode } from "@milkdown/kit/prose/model";
import { Decoration, DecorationSet } from "@milkdown/kit/prose/view";
import { $prose } from "@milkdown/kit/utils";

export const gitHubNoticeType = [
  "note",
  "abstract",
  "info",
  "todo",
  "tip",
  "important",
  "success",
  "question",
  "warning",
  "caution",
  "failure",
  "danger",
  "bug",
  "example",
  "quote",
] as const;
export type GitHubNotice = (typeof gitHubNoticeType)[number];

export const gitHubNoticeAlias: Readonly<Record<string, GitHubNotice>> = {
  note: "note",
  abstract: "abstract",
  summary: "abstract",
  tldr: "abstract",
  info: "info",
  todo: "todo",
  tip: "tip",
  hint: "tip",
  important: "important",
  success: "success",
  check: "success",
  done: "success",
  question: "question",
  help: "question",
  faq: "question",
  warning: "warning",
  caution: "caution",
  attention: "warning",
  failure: "failure",
  fail: "failure",
  missing: "failure",
  danger: "danger",
  error: "danger",
  bug: "bug",
  example: "example",
  quote: "quote",
  cite: "quote",
};

const noticeMark = /^\[!([A-Za-z][A-Za-z0-9_-]*)\](?:\s+.*)?$/;

/** Recognize Obsidian callouts and GitHub alerts, including optional titles. */
export function recognizeDistinguishGitHubNotice(value2: string): GitHubNotice | null {
  const firstLine = value2.split(/\r?\n/, 1)[0]!.trim();
  const match = noticeMark.exec(firstLine);
  return match ? (gitHubNoticeAlias[match[1]!.toLowerCase()] ?? null) : null;
}

/** Which GitHub Alert a blockquote represents, if any. */
export function gitHubAlertOf(node: PMNode): GitHubNotice | null {
  if (node.type.name !== "blockquote") return null;
  const first = node.firstChild;
  if (!first || first.type.name !== "paragraph") return null;
  return recognizeDistinguishGitHubNotice(first.textContent);
}

export function createGitHubAlertDecorations(state: EditorState): DecorationSet {
  const { doc, selection } = state;
  const decoration: Decoration[] = [];
  doc.descendants((node, pos) => {
    const type = gitHubAlertOf(node);
    if (!type) return;
    const firstParagraph = node.firstChild;
    if (!firstParagraph) return;
    const titleStart = pos + 1;
    const titleSource = firstParagraph.textContent.trimStart();
    const rawMarker = /^\[![^\]]+\]/.exec(titleSource)?.[0] ?? "";
    const markerStart = pos + 2 + firstParagraph.textContent.length - titleSource.length;
    const markerEnd = markerStart + rawMarker.length;
    const titleEditing =
      selection.$from.parent === firstParagraph &&
      selection.from <= markerEnd &&
      selection.to >= markerStart;
    decoration.push(
      Decoration.node(pos, pos + node.nodeSize, {
        class: `nota-github-alert nota-github-alert-${type}${
          titleEditing ? " nota-github-alert-editing-title" : ""
        }`,
        "data-github-alert": type,
      }),
    );
    decoration.push(
      Decoration.node(titleStart, titleStart + firstParagraph.nodeSize, {
        class: "nota-github-alert-title",
      }),
    );
    const firstToken = firstParagraph.firstChild;
    if (firstToken?.isText) {
      const text2 = firstToken.text ?? "";
      const beforeGuideWhitespace = text2.length - text2.trimStart().length;
      const markLengthDegree = rawMarker.length;
      decoration.push(
        Decoration.inline(pos + 2 + beforeGuideWhitespace, pos + 2 + beforeGuideWhitespace + markLengthDegree, {
          class: `nota-github-alert-marker nota-github-alert-marker-${type}`,
          "data-github-alert-label": type,
        }),
      );
    }
  });
  return DecorationSet.create(doc, decoration);
}

const pluginKey = new PluginKey<DecorationSet>("nota-github-alert");

/**
 * 装饰只影响屏幕。文件里仍然是标准的 `> [!TYPE]` GitHub 语法。
 */
export const gitHubNoticePlugin = $prose(
  () =>
    new Plugin<DecorationSet>({
      key: pluginKey,
      state: {
        init: (_ConfigurePlace, state) => createGitHubAlertDecorations(state),
        apply: (tr, oldValue, _OldValueState, newValueState) =>
          tr.docChanged || tr.selectionSet ? createGitHubAlertDecorations(newValueState) : oldValue,
      },
      props: {
        decorations(state) {
          return pluginKey.getState(state);
        },
      },
    }),
);
