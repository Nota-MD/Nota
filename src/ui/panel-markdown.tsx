import { useMemo, type ReactNode } from "react";
import { openUrl } from "@tauri-apps/plugin-opener";

export type PanelInline =
  | { type: "text"; text: string }
  | { type: "code"; text: string }
  | { type: "math"; text: string }
  | { type: "strong"; children: PanelInline[] }
  | { type: "emphasis"; children: PanelInline[] }
  | { type: "strike"; children: PanelInline[] }
  | { type: "link"; href: string; children: PanelInline[] };

export type PanelMarkdownBlock =
  | { type: "paragraph"; children: PanelInline[] }
  | { type: "heading"; level: number; children: PanelInline[] }
  | { type: "code"; language: string; text: string }
  | { type: "quote"; blocks: PanelMarkdownBlock[] }
  | { type: "list"; ordered: boolean; start: number; items: { depth: number; children: PanelInline[] }[] }
  | { type: "table"; header: string[]; rows: string[][] }
  | { type: "rule" };

function safeHref(raw: string): string | null {
  const href = raw.trim();
  if (!href) return null;
  if (href.startsWith("#")) return href;
  if (/^(?:https?:|mailto:)/i.test(href)) return href;
  return null;
}

function unescapeMarkdown(text: string): string {
  return text.replace(/\\([\\`*_[\]{}()#+\-.!~$])/g, "$1");
}

export function parsePanelInline(source: string): PanelInline[] {
  const output: PanelInline[] = [];
  let rest = source;
  let plain = "";

  const flush = () => {
    if (!plain) return;
    output.push({ type: "text", text: unescapeMarkdown(plain) });
    plain = "";
  };

  while (rest) {
    const candidates: { index: number; length: number; node: PanelInline }[] = [];
    const code = /`([^`\n]+)`/.exec(rest);
    if (code?.index !== undefined) {
      candidates.push({
        index: code.index,
        length: code[0].length,
        node: { type: "code", text: code[1] ?? "" },
      });
    }
    const math = /\$([^$\n]+)\$/.exec(rest);
    if (math?.index !== undefined) {
      candidates.push({
        index: math.index,
        length: math[0].length,
        node: { type: "math", text: math[1] ?? "" },
      });
    }
    const link = /\[([^\]]+)\]\(([^)\s]+)\)/.exec(rest);
    if (link?.index !== undefined) {
      const href = safeHref(link[2] ?? "");
      candidates.push({
        index: link.index,
        length: link[0].length,
        node: href
          ? { type: "link", href, children: parsePanelInline(link[1] ?? "") }
          : { type: "text", text: link[0] },
      });
    }
    const strong = /\*\*([\s\S]+?)\*\*/.exec(rest);
    if (strong?.index !== undefined) {
      candidates.push({
        index: strong.index,
        length: strong[0].length,
        node: { type: "strong", children: parsePanelInline(strong[1] ?? "") },
      });
    }
    const strike = /~~([\s\S]+?)~~/.exec(rest);
    if (strike?.index !== undefined) {
      candidates.push({
        index: strike.index,
        length: strike[0].length,
        node: { type: "strike", children: parsePanelInline(strike[1] ?? "") },
      });
    }
    const emphasis = /(^|[^*])\*([^*\n]+)\*(?!\*)/.exec(rest);
    if (emphasis?.index !== undefined) {
      const prefix = emphasis[1] ?? "";
      candidates.push({
        index: emphasis.index + prefix.length,
        length: emphasis[0].length - prefix.length,
        node: { type: "emphasis", children: parsePanelInline(emphasis[2] ?? "") },
      });
    }

    if (!candidates.length) {
      plain += rest;
      break;
    }
    candidates.sort((left, right) => left.index - right.index || right.length - left.length);
    const next = candidates[0]!;
    plain += rest.slice(0, next.index);
    flush();
    output.push(next.node);
    rest = rest.slice(next.index + next.length);
  }

  flush();
  return output.length ? output : [{ type: "text", text: "" }];
}

function tableCells(line: string): string[] {
  let value = line.trim();
  if (value.startsWith("|")) value = value.slice(1);
  if (value.endsWith("|")) value = value.slice(0, -1);
  const cells: string[] = [];
  let cell = "";
  let escaped = false;
  for (const character of value) {
    if (escaped) {
      cell += character;
      escaped = false;
      continue;
    }
    if (character === "\\") {
      escaped = true;
      cell += character;
      continue;
    }
    if (character === "|") {
      cells.push(cell.trim());
      cell = "";
      continue;
    }
    cell += character;
  }
  cells.push(cell.trim());
  return cells;
}

function tableSeparator(line: string): boolean {
  const cells = tableCells(line);
  return cells.length > 0 && cells.every((cell) => /^:?-{3,}:?$/.test(cell.trim()));
}

function blockOpener(line: string): boolean {
  return (
    /^ {0,3}(?:```|~~~)/.test(line) ||
    /^ {0,3}#{1,6}\s+/.test(line) ||
    /^ {0,3}>/.test(line) ||
    /^\s*(?:[-+*]|\d+\.)\s+/.test(line) ||
    /^ {0,3}(?:---+|\*\*\*+|___+)\s*$/.test(line)
  );
}

export function parsePanelMarkdown(source: string): PanelMarkdownBlock[] {
  const lines = source.replace(/\r\n?/g, "\n").split("\n");
  const blocks: PanelMarkdownBlock[] = [];
  let index = 0;

  while (index < lines.length) {
    const line = lines[index] ?? "";
    if (!line.trim()) {
      index++;
      continue;
    }

    const fence = /^ {0,3}(```+|~~~+)\s*([^\s`]*)/.exec(line);
    if (fence) {
      const marker = fence[1] ?? "```";
      const language = fence[2] ?? "";
      const body: string[] = [];
      index++;
      while (index < lines.length && !new RegExp(`^ {0,3}${marker[0]}{${marker.length},}\\s*$`).test(lines[index] ?? "")) {
        body.push(lines[index] ?? "");
        index++;
      }
      if (index < lines.length) index++;
      blocks.push({ type: "code", language, text: body.join("\n") });
      continue;
    }

    const heading = /^ {0,3}(#{1,6})\s+(.*)$/.exec(line);
    if (heading) {
      blocks.push({
        type: "heading",
        level: heading[1]!.length,
        children: parsePanelInline(heading[2] ?? ""),
      });
      index++;
      continue;
    }

    if (/^ {0,3}(?:---+|\*\*\*+|___+)\s*$/.test(line)) {
      blocks.push({ type: "rule" });
      index++;
      continue;
    }

    if (/^ {0,3}>/.test(line)) {
      const quoteLines: string[] = [];
      while (index < lines.length && /^ {0,3}>/.test(lines[index] ?? "")) {
        quoteLines.push((lines[index] ?? "").replace(/^ {0,3}>\s?/, ""));
        index++;
      }
      blocks.push({ type: "quote", blocks: parsePanelMarkdown(quoteLines.join("\n")) });
      continue;
    }

    const list = /^\s*([-+*]|\d+\.)\s+(.*)$/.exec(line);
    if (list) {
      const ordered = /\d+\./.test(list[1] ?? "");
      const start = ordered ? Number.parseInt(list[1] ?? "1", 10) || 1 : 1;
      const items: { depth: number; children: PanelInline[] }[] = [];
      while (index < lines.length) {
        const current = /^(\s*)([-+*]|\d+\.)\s+(.*)$/.exec(lines[index] ?? "");
        if (!current) break;
        items.push({
          depth: Math.min(3, Math.floor((current[1]?.length ?? 0) / 2)),
          children: parsePanelInline(current[3] ?? ""),
        });
        index++;
      }
      blocks.push({ type: "list", ordered, start, items });
      continue;
    }

    if (
      line.includes("|") &&
      index + 1 < lines.length &&
      tableSeparator(lines[index + 1] ?? "")
    ) {
      const header = tableCells(line);
      const rows: string[][] = [];
      index += 2;
      while (index < lines.length && (lines[index] ?? "").includes("|") && (lines[index] ?? "").trim()) {
        rows.push(tableCells(lines[index] ?? ""));
        index++;
      }
      blocks.push({ type: "table", header, rows });
      continue;
    }

    const paragraph: string[] = [line];
    index++;
    while (
      index < lines.length &&
      (lines[index] ?? "").trim() &&
      !blockOpener(lines[index] ?? "") &&
      !(lines[index] ?? "").includes("|") &&
      index + 1 < lines.length &&
      !tableSeparator(lines[index + 1] ?? "")
    ) {
      paragraph.push(lines[index] ?? "");
      index++;
    }
    blocks.push({ type: "paragraph", children: parsePanelInline(paragraph.join("\n")) });
  }

  return blocks;
}

function inlineNodes(nodes: readonly PanelInline[], keyPrefix: string): ReactNode[] {
  return nodes.map((node, index) => {
    const key = `${keyPrefix}-${index}`;
    if (node.type === "text") return node.text;
    if (node.type === "code") return <code key={key}>{node.text}</code>;
    if (node.type === "math") {
      return (
        <code key={key} className="panel-md-math">
          {node.text}
        </code>
      );
    }
    if (node.type === "strong") return <strong key={key}>{inlineNodes(node.children, key)}</strong>;
    if (node.type === "emphasis") return <em key={key}>{inlineNodes(node.children, key)}</em>;
    if (node.type === "strike") return <del key={key}>{inlineNodes(node.children, key)}</del>;
    return (
      <a
        key={key}
        href={node.href}
        onClick={(event) => {
          event.preventDefault();
          if (!node.href.startsWith("#")) void openUrl(node.href);
        }}
      >
        {inlineNodes(node.children, key)}
      </a>
    );
  });
}

function blockNodes(blocks: readonly PanelMarkdownBlock[], keyPrefix: string): ReactNode[] {
  return blocks.map((block, index) => {
    const key = `${keyPrefix}-${index}`;
    if (block.type === "paragraph") return <p key={key}>{inlineNodes(block.children, key)}</p>;
    if (block.type === "heading") {
      return (
        <p key={key} className="panel-md-heading" data-level={block.level}>
          {inlineNodes(block.children, key)}
        </p>
      );
    }
    if (block.type === "code") {
      return (
        <pre key={key} className="panel-md-code" data-language={block.language || undefined}>
          <code>{block.text}</code>
        </pre>
      );
    }
    if (block.type === "quote") {
      return <blockquote key={key}>{blockNodes(block.blocks, key)}</blockquote>;
    }
    if (block.type === "list") {
      const Tag = block.ordered ? "ol" : "ul";
      return (
        <Tag key={key} start={block.ordered ? block.start : undefined}>
          {block.items.map((item, itemIndex) => (
            <li key={`${key}-${itemIndex}`} data-depth={item.depth}>
              {inlineNodes(item.children, `${key}-${itemIndex}`)}
            </li>
          ))}
        </Tag>
      );
    }
    if (block.type === "table") {
      return (
        <div key={key} className="panel-md-table-wrap">
          <table>
            <thead>
              <tr>
                {block.header.map((cell, cellIndex) => (
                  <th key={`${key}-h-${cellIndex}`}>{inlineNodes(parsePanelInline(cell), `${key}-h-${cellIndex}`)}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {block.rows.map((row, rowIndex) => (
                <tr key={`${key}-r-${rowIndex}`}>
                  {row.map((cell, cellIndex) => (
                    <td key={`${key}-r-${rowIndex}-${cellIndex}`}>
                      {inlineNodes(parsePanelInline(cell), `${key}-r-${rowIndex}-${cellIndex}`)}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      );
    }
    return <hr key={key} />;
  });
}

export function PanelMarkdown({ text }: { text: string }) {
  const blocks = useMemo(() => parsePanelMarkdown(text), [text]);
  return <div className="panel-msg-markdown">{blockNodes(blocks, "md")}</div>;
}
