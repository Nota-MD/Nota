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

export const GitHub提示类型 = ["note", "tip", "important", "warning", "caution"] as const;
export type GitHub提示 = (typeof GitHub提示类型)[number];

const 提示标记 = /^\[!(NOTE|TIP|IMPORTANT|WARNING|CAUTION)\]$/;

/** 识别 GitHub Alert 的首行标记；标记后面同一行还有内容时不算。 */
export function 识别GitHub提示(值: string): GitHub提示 | null {
  const 首行 = 值.split(/\r?\n/, 1)[0]!.trim();
  const 命中 = 提示标记.exec(首行);
  return 命中 ? (命中[1]!.toLowerCase() as GitHub提示) : null;
}

function 造装饰(doc: PMNode): DecorationSet {
  const 装饰: Decoration[] = [];
  doc.descendants((node, pos) => {
    if (node.type.name !== "blockquote") return;
    const 首段 = node.firstChild;
    if (!首段 || 首段.type.name !== "paragraph") return;
    const 类型 = 识别GitHub提示(首段.textContent);
    if (!类型) return;
    装饰.push(
      Decoration.node(pos, pos + node.nodeSize, {
        class: `nota-github-alert nota-github-alert-${类型}`,
        "data-github-alert": 类型,
      }),
    );
    const 首颗 = 首段.firstChild;
    if (首颗?.isText) {
      const 文本 = 首颗.text ?? "";
      const 前导空白 = 文本.length - 文本.trimStart().length;
      const 标记长度 = `[!${类型.toUpperCase()}]`.length;
      装饰.push(
        Decoration.inline(pos + 2 + 前导空白, pos + 2 + 前导空白 + 标记长度, {
          class: "nota-github-alert-marker",
        }),
      );
    }
  });
  return DecorationSet.create(doc, 装饰);
}

const 插件键 = new PluginKey<DecorationSet>("nota-github-alert");

/**
 * 装饰只影响屏幕。文件里仍然是标准的 `> [!TYPE]` GitHub 语法。
 */
export const GitHub提示插件 = $prose(
  () =>
    new Plugin<DecorationSet>({
      key: 插件键,
      state: {
        init: (_配置, state) => 造装饰(state.doc),
        apply: (tr, 旧, _旧状态, 新状态) =>
          tr.docChanged ? 造装饰(新状态.doc) : 旧,
      },
      props: {
        decorations(state) {
          return 插件键.getState(state);
        },
      },
    }),
);
