import {
  inlineTextSegments,
  parseInlineDelimiters,
  type InlineMarkName,
} from "./inline-delimiter";

interface PositionPoint {
  offset?: number;
}

interface Position {
  start?: PositionPoint;
  end?: PositionPoint;
}

interface MarkdownNode {
  type: string;
  value?: string;
  children?: MarkdownNode[];
  position?: Position;
}

const emphasisMarks = new Set<InlineMarkName>(["strong", "emphasis"]);

function eligibleInline(node: MarkdownNode): boolean {
  if (node.type === "text") return true;
  if (node.type !== "strong" && node.type !== "emphasis") return false;
  return (node.children ?? []).every(eligibleInline);
}

function eligibleParagraph(node: MarkdownNode): boolean {
  return (node.children ?? []).every(eligibleInline);
}

function wrap(
  nodes: MarkdownNode[],
  marks: readonly InlineMarkName[],
): MarkdownNode[] {
  let output = nodes;
  if (marks.includes("emphasis")) {
    output = [{ type: "emphasis", children: output }];
  }
  if (marks.includes("strong")) {
    output = [{ type: "strong", children: output }];
  }
  return output;
}

function normalizeParagraph(node: MarkdownNode, source: string): boolean {
  if (!eligibleParagraph(node)) return false;
  const start = node.position?.start?.offset;
  const end = node.position?.end?.offset;
  if (typeof start !== "number" || typeof end !== "number") return false;
  const raw = source.slice(start, end);
  if (!raw.includes("*") && !raw.includes("_")) return false;

  const parsed = parseInlineDelimiters(raw, emphasisMarks);
  const segments = inlineTextSegments(parsed, emphasisMarks);
  const next: MarkdownNode[] = [];
  let offset = 0;
  for (const segment of segments) {
    const children: MarkdownNode[] = [];
    let local = 0;
    while (local < segment.text.length) {
      const escape = parsed.escapes.find((item) => item.at === offset + local);
      if (escape) {
        children.push({ type: "notaEscape", value: escape.symbol });
        local++;
        continue;
      }
      const nextEscape = parsed.escapes.find(
        (item) =>
          item.at > offset + local &&
          item.at < offset + segment.text.length,
      );
      const end = nextEscape
        ? nextEscape.at - offset
        : segment.text.length;
      children.push({
        type: "text",
        value: segment.text.slice(local, end),
      });
      local = end;
    }
    next.push(...wrap(children, segment.marks));
    offset += segment.text.length;
  }
  if (next.length === 0) return false;
  node.children = next;
  return true;
}

/**
 * Replace CommonMark's nearest-opener emphasis tree with the editor's
 * outermost equal-width delimiter rule.
 *
 * Only paragraphs made from plain text and standard emphasis nodes participate;
 * links, code, images and other inline constructs keep their original AST.
 */
export function normalizeInlineDelimiterTree(tree: MarkdownNode, source: string): void {
  const walk = (node: MarkdownNode): void => {
    if (node.type === "paragraph") {
      normalizeParagraph(node, source);
      return;
    }
    for (const child of node.children ?? []) walk(child);
  };
  walk(tree);
}
