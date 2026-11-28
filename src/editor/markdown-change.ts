import { serializerCtx } from "@milkdown/kit/core";
import type { Node as PMNode } from "@milkdown/kit/prose/model";
import { Plugin, PluginKey } from "@milkdown/kit/prose/state";
import { $prose } from "@milkdown/kit/utils";

const delayMs = 200;

export function markdownChangeListener(
  onChange: (markdown: string, previous: string | null) => void,
) {
  return $prose((ctx) => {
    const serialize = ctx.get(serializerCtx);
    let previousDoc: PMNode | null = null;
    let previousMarkdown: string | null = null;
    let latestDoc: PMNode | null = null;
    let timer: ReturnType<typeof setTimeout> | undefined;

    const flush = (): void => {
      timer = undefined;
      const doc = latestDoc;
      latestDoc = null;
      if (!doc || (previousDoc && previousDoc.eq(doc))) return;
      const markdown = serialize(doc);
      onChange(markdown, previousMarkdown);
      previousDoc = doc;
      previousMarkdown = markdown;
    };

    return new Plugin({
      key: new PluginKey("nota-markdown-change"),
      state: {
        init: (_config, state) => {
          previousDoc = state.doc;
          previousMarkdown = null;
          return null;
        },
        apply: (transaction) => {
          if (
            !(transaction.docChanged || transaction.storedMarksSet) ||
            transaction.getMeta("addToHistory") === false
          ) {
            return null;
          }
          latestDoc = transaction.doc;
          clearTimeout(timer);
          timer = setTimeout(flush, delayMs);
          return null;
        },
      },
      view: () => ({
        destroy: () => {
          clearTimeout(timer);
          timer = undefined;
          latestDoc = null;
        },
      }),
    });
  });
}
