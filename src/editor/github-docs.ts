















import type { Node as PMNode } from "@milkdown/kit/prose/model";
import { Plugin, PluginKey } from "@milkdown/kit/prose/state";
import { Decoration, DecorationSet } from "@milkdown/kit/prose/view";
import { $prose } from "@milkdown/kit/utils";

const rowHeadersStart = /^\{%\s*rowheaders\s*%\}$/;
const rowHeadersEnd = /^\{%\s*endrowheaders\s*%\}$/;
const rowDirective = /^\{%\s*(?:rowheaders|endrowheaders)\s*%\}$/;
const octiconDirective =
  /\{%\s*octicon\s+"([^"]+)"(?:\s+aria-label="([^"]*)")?\s*%\}/g;
const liquidVariable = /\{%\s*(?:data\s+variables\.[^{}%]+|reusables\.[^{}%]+)\s*%\}/g;

export const octiconGlyph: Readonly<Record<string, string>> = {
  alert: "⚠",
  check: "✓",
  "check-circle": "✓",
  info: "ℹ",
  "light-bulb": "💡",
  "no-entry": "⊘",
  note: "ℹ",
  shield: "◆",
  x: "✕",
  "x-circle": "✕",
};

export function githubOcticonGlyph(name: string): string {
  return octiconGlyph[name] ?? "◇";
}

function createGithubDocsDecorations(doc: PMNode): DecorationSet {
  if (!doc.textContent.includes("{%")) return DecorationSet.empty;
  const decorations: Decoration[] = [];
  const topLevel: { node: PMNode; position: number }[] = [];
  doc.forEach((node, offset) => topLevel.push({ node, position: offset }));

  let rowStart: number | null = null;
  for (const item of topLevel) {
    const text = item.node.textContent.trim();
    if (item.node.type.name === "paragraph" && rowHeadersStart.test(text)) {
      rowStart = item.position;
      decorations.push(
        Decoration.node(item.position, item.position + item.node.nodeSize, {
          class: "nota-github-directive",
        }),
      );
      continue;
    }
    if (rowStart !== null && item.node.type.name === "table") {
      decorations.push(
        Decoration.node(item.position, item.position + item.node.nodeSize, {
          class: "nota-github-rowheaders",
        }),
      );
      continue;
    }
    if (item.node.type.name === "paragraph" && rowHeadersEnd.test(text)) {
      rowStart = null;
      decorations.push(
        Decoration.node(item.position, item.position + item.node.nodeSize, {
          class: "nota-github-directive",
        }),
      );
    }
  }

  doc.descendants((node, position) => {
    if (!node.isText || !node.text) return;
    for (const match of node.text.matchAll(octiconDirective)) {
      const from = position + (match.index ?? 0);
      const label = match[2]?.trim() || match[1] || "Octicon";
      decorations.push(
        Decoration.inline(from, from + match[0].length, {
          class: "nota-github-octicon",
          "data-octicon": match[1] ?? "",
          role: "img",
          "aria-label": label,
        }),
      );
    }
    for (const match of node.text.matchAll(liquidVariable)) {
      const from = position + (match.index ?? 0);
      decorations.push(
        Decoration.inline(from, from + match[0].length, {
          class: "nota-github-liquid",
        }),
      );
    }
  });

  return DecorationSet.create(doc, decorations);
}

export function isGithubRowDirective(text: string): boolean {
  return rowDirective.test(text.trim());
}


export function applyGithubDocsToExport(root: Element): void {
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  const textNodes: Text[] = [];
  while (walker.nextNode()) {
    const node = walker.currentNode;
    if (node instanceof Text && octiconDirective.test(node.data)) {
      octiconDirective.lastIndex = 0;
      textNodes.push(node);
    }
    octiconDirective.lastIndex = 0;
  }
  for (const node of textNodes) {
    const parts: (string | Node)[] = [];
    let cursor = 0;
    for (const match of node.data.matchAll(octiconDirective)) {
      const at = match.index ?? 0;
      if (at > cursor) parts.push(node.data.slice(cursor, at));
      const icon = document.createElement("span");
      icon.setAttribute("role", "img");
      icon.setAttribute("aria-label", match[2]?.trim() || match[1] || "Octicon");
      icon.textContent = githubOcticonGlyph(match[1] ?? "");
      parts.push(icon);
      cursor = at + match[0].length;
    }
    if (cursor < node.data.length) parts.push(node.data.slice(cursor));
    node.replaceWith(...parts);
  }

  for (const marker of Array.from(root.querySelectorAll("p"))) {
    if (!rowHeadersStart.test(marker.textContent?.trim() ?? "")) continue;
    const end = (() => {
      for (
        let next = marker.nextElementSibling;
        next;
        next = next.nextElementSibling
      ) {
        if (rowHeadersEnd.test(next.textContent?.trim() ?? "")) return next;
      }
      return null;
    })();
    if (!end) continue;
    for (
      let item = marker.nextElementSibling;
      item && item !== end;
      item = item.nextElementSibling
    ) {
      if (item.tagName.toLowerCase() !== "table") continue;
      for (const row of Array.from(item.querySelectorAll("tr"))) {
        const first = row.firstElementChild;
        if (!first || first.tagName.toLowerCase() === "th") continue;
        const heading = document.createElement("th");
        heading.setAttribute("scope", "row");
        for (const attribute of Array.from(first.attributes)) {
          heading.setAttribute(attribute.name, attribute.value);
        }
        heading.append(...Array.from(first.childNodes));
        first.replaceWith(heading);
      }
    }
    marker.remove();
    end.remove();
  }
}

const githubDocsKey = new PluginKey<DecorationSet>("nota-github-docs");

export const githubDocsCompat = $prose(
  () =>
    new Plugin({
      key: githubDocsKey,
      state: {
        init: (_config, state) => createGithubDocsDecorations(state.doc),
        apply: (tr, old, _oldState, newState) =>
          tr.docChanged ? createGithubDocsDecorations(newState.doc) : old,
      },
      props: {
        decorations(state) {
          return githubDocsKey.getState(state);
        },
      },
    }),
);
