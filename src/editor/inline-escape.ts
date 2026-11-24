import { $nodeSchema, $remark } from "@milkdown/kit/utils";
import type { MilkdownPlugin } from "@milkdown/kit/ctx";
import type { Node as PMNode } from "@milkdown/kit/prose/model";

export const escapeCharacterClass = "nota-escape-char";
export const escapeSlashClass = "nota-escape-slash";

interface MarkdownPosition {
  start?: { offset?: number };
  end?: { offset?: number };
}

interface MarkdownNode {
  type: string;
  value?: string;
  children?: MarkdownNode[];
  position?: MarkdownPosition;
}

interface MarkdownFile {
  value?: unknown;
  toString(): string;
}

const escapablePunctuation = new Set(
  Array.from("!\"#$%&'()*+,-./:;<=>?@[\\]^_`{|}~"),
);

function positionOf(start: number, end: number): MarkdownPosition {
  return {
    start: { offset: start },
    end: { offset: end },
  };
}

function escapeTextNode(node: MarkdownNode, source: string): MarkdownNode[] | null {
  const start = node.position?.start?.offset;
  const end = node.position?.end?.offset;
  const value = node.value;
  if (start === undefined || end === undefined || value === undefined) return null;
  const raw = source.slice(start, end);
  if (!raw.includes("\\")) return null;

  const children: MarkdownNode[] = [];
  let rawAt = 0;
  let valueAt = 0;
  let rawTextAt = 0;
  let valueTextAt = 0;
  while (rawAt < raw.length) {
    const symbol = raw[rawAt + 1];
    if (
      raw[rawAt] === "\\" &&
      symbol !== undefined &&
      escapablePunctuation.has(symbol) &&
      value[valueAt] === symbol
    ) {
      if (valueAt > valueTextAt) {
        children.push({
          type: "text",
          value: value.slice(valueTextAt, valueAt),
          position: positionOf(start + rawTextAt, start + rawAt),
        });
      }
      children.push({
        type: "notaEscape",
        value: symbol,
        position: positionOf(start + rawAt, start + rawAt + 2),
      });
      rawAt += 2;
      valueAt += 1;
      rawTextAt = rawAt;
      valueTextAt = valueAt;
      continue;
    }
    if (raw[rawAt] !== value[valueAt]) return null;
    rawAt += 1;
    valueAt += 1;
  }
  if (valueAt !== value.length) return null;
  if (valueAt > valueTextAt) {
    children.push({
      type: "text",
      value: value.slice(valueTextAt),
      position: positionOf(start + rawTextAt, end),
    });
  }
  return children.length > 1 || children[0]?.type === "notaEscape"
    ? children
    : null;
}

export function preserveInlineEscapes(tree: MarkdownNode, source: string): void {
  if (!tree.children) return;
  for (let index = 0; index < tree.children.length; index += 1) {
    const child = tree.children[index]!;
    const replacements = child.type === "text" ? escapeTextNode(child, source) : null;
    if (replacements) {
      tree.children.splice(index, 1, ...replacements);
      index += replacements.length - 1;
      continue;
    }
    preserveInlineEscapes(child, source);
  }
}

type RemarkFactory = Parameters<typeof $remark<"inline escapes", undefined>>[1];

const preserveInlineEscapeNodes: RemarkFactory = () => () => (tree, file) => {
  const markdown = file as MarkdownFile;
  const source =
    typeof markdown.value === "string" ? markdown.value : markdown.toString();
  preserveInlineEscapes(tree as MarkdownNode, source);
};

export const remarkInlineEscapes = $remark(
  "inline escapes",
  preserveInlineEscapeNodes,
);

export const remarkInlineEscapePlugins =
  remarkInlineEscapes.flat() as unknown as MilkdownPlugin[];

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
      state.addNode("text", undefined, `\\${symbol}`);
    },
  },
}));

export const inlineEscapeNodePlugins = [
  ...inlineEscapeSpec.flat(),
] as unknown as MilkdownPlugin[];
