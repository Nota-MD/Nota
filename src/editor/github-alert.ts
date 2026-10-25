/**
 * GitHub Markdown 提示块（Alerts）。
 *
 * `> [!NOTE]`、`[!TIP]`、`[!IMPORTANT]`、`[!WARNING]`、`[!CAUTION]`
 * 在源码里仍是普通引用块。这里只加装饰，不改 schema、不改序列化，因此打开再存
 * 不会多出任何字符。
 */

import type { Node as PMNode } from "@milkdown/kit/prose/model";
import { Plugin, PluginKey } from "@milkdown/kit/prose/state";
import { Decoration, DecorationSet } from "@milkdown/kit/prose/view";
import { $prose } from "@milkdown/kit/utils";

export const gitHubNoticeType = ["note", "tip", "important", "warning", "caution"] as const;
export type GitHubNotice = (typeof gitHubNoticeType)[number];

const noticeMark = /^\[!(NOTE|TIP|IMPORTANT|WARNING|CAUTION)\]$/;

/** 识别 GitHub Alert 的首行标记；标记后面同一行还有内容时不算。 */
export function recognizeDistinguishGitHubNotice(value2: string): GitHubNotice | null {
  const firstLine = value2.split(/\r?\n/, 1)[0]!.trim();
  const match = noticeMark.exec(firstLine);
  return match ? (match[1]!.toLowerCase() as GitHubNotice) : null;
}

function createDecoration(doc: PMNode): DecorationSet {
  const decoration: Decoration[] = [];
  doc.descendants((node, pos) => {
    if (node.type.name !== "blockquote") return;
    const firstParagraph = node.firstChild;
    if (!firstParagraph || firstParagraph.type.name !== "paragraph") return;
    const type = recognizeDistinguishGitHubNotice(firstParagraph.textContent);
    if (!type) return;
    decoration.push(
      Decoration.node(pos, pos + node.nodeSize, {
        class: `nota-github-alert nota-github-alert-${type}`,
        "data-github-alert": type,
      }),
    );
    const firstToken = firstParagraph.firstChild;
    if (firstToken?.isText) {
      const text2 = firstToken.text ?? "";
      const beforeGuideWhitespace = text2.length - text2.trimStart().length;
      const markLengthDegree = `[!${type.toUpperCase()}]`.length;
      decoration.push(
        Decoration.inline(pos + 2 + beforeGuideWhitespace, pos + 2 + beforeGuideWhitespace + markLengthDegree, {
          class: "nota-github-alert-marker",
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
        init: (_ConfigurePlace, state) => createDecoration(state.doc),
        apply: (tr, oldValue, _OldValueState, newValueState) =>
          tr.docChanged ? createDecoration(newValueState.doc) : oldValue,
      },
      props: {
        decorations(state) {
          return pluginKey.getState(state);
        },
      },
    }),
);
