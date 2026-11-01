import { $nodeSchema } from "@milkdown/kit/utils";
import type { MilkdownPlugin } from "@milkdown/kit/ctx";
import type { Node as PMNode } from "@milkdown/kit/prose/model";

export const escapeCharacterClass = "nota-escape-char";
export const escapeSlashClass = "nota-escape-slash";

/**
 * A punctuation character explicitly escaped in Markdown.
 *
 * The atom keeps the escape visible in the model, so saving cannot turn a
 * literal `\*` into a formatting delimiter. Its slash is hidden while the
 * caret is elsewhere and revealed when the caret touches the escape.
 */
export const inlineEscapeSpec = $nodeSchema("notaEscape", () => ({
  inline: true,
  group: "inline",
  atom: true,
  attrs: {
    symbol: { default: "\\" },
  },
  parseDOM: [
    {
      tag: `span.${escapeCharacterClass}`,
      getAttrs: (dom: HTMLElement | string) => ({
        symbol:
          typeof dom === "string"
            ? "*"
            : dom.dataset.symbol ?? dom.textContent ?? "*",
      }),
    },
  ],
  toDOM: (node: PMNode) => {
    const symbol = String(node.attrs.symbol ?? "*");
    return [
      "span",
      {
        class: escapeCharacterClass,
        "data-symbol": symbol,
      },
      ["span", { class: escapeSlashClass, "aria-hidden": "true" }, "\\"],
      symbol,
    ];
  },
  parseMarkdown: {
    match: (node: { type: string }) => node.type === "notaEscape",
    runner: (state, node, type) => {
      const value2 = (node as { value?: string }).value;
      state.addNode(type, { symbol: value2 ?? "*" });
    },
  },
  toMarkdown: {
    match: (node: PMNode) => node.type.name === "notaEscape",
    runner: (state, node: PMNode) => {
      const symbol = String(node.attrs.symbol ?? "*");
      state.addNode("html", undefined, `\\${symbol}`);
    },
  },
}));

export const inlineEscapeNodePlugins =
  inlineEscapeSpec.flat() as unknown as MilkdownPlugin[];
