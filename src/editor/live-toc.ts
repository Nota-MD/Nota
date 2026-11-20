import type { Node as PMNode } from "@milkdown/kit/prose/model";
import {
  Plugin,
  PluginKey,
  TextSelection,
  type EditorState,
} from "@milkdown/kit/prose/state";
import {
  Decoration,
  DecorationSet,
  type EditorView,
} from "@milkdown/kit/prose/view";
import { $prose } from "@milkdown/kit/utils";

import { t } from "@/i18n";
import { anchor } from "./toc";

interface HeadingEntry {
  level: number;
  text: string;
  position: number;
}

function collectHeadings(doc: PMNode): HeadingEntry[] {
  const headings: HeadingEntry[] = [];
  doc.descendants((node, position) => {
    if (node.type.name !== "heading") return true;
    const text = node.textContent.trim();
    if (!text) return true;
    const level = Number(node.attrs.level);
    headings.push({
      level: Number.isFinite(level) && level >= 1 && level <= 6 ? level : 1,
      text,
      position,
    });
    return true;
  });
  return headings;
}

function tocParagraph(node: PMNode): boolean {
  return (
    node.type.name === "paragraph" &&
    node.textContent.trim().toUpperCase() === "[TOC]"
  );
}

function renderToc(view: EditorView, headings: readonly HeadingEntry[]): HTMLElement {
  const root = document.createElement("span");
  root.className = "nota-live-toc";
  root.contentEditable = "false";
  root.setAttribute("aria-label", t("Table of Contents"));
  root.setAttribute("role", "navigation");

  const title = document.createElement("span");
  title.className = "nota-live-toc-title";
  title.textContent = t("Table of Contents");
  root.append(title);

  const list = document.createElement("span");
  list.className = "nota-live-toc-list";
  list.setAttribute("role", "list");
  const minimumLevel = Math.min(...headings.map((heading) => heading.level));
  const usedAnchors = new Set<string>();

  for (const heading of headings) {
    const item = document.createElement("span");
    item.className = "nota-live-toc-item";
    item.setAttribute("role", "listitem");
    item.style.setProperty("--nota-toc-depth", String(Math.max(0, heading.level - minimumLevel)));

    const link = document.createElement("a");
    link.href = `#${anchor(heading.text, usedAnchors)}`;
    link.textContent = heading.text;
    link.addEventListener("mousedown", (event) => event.preventDefault());
    link.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      const position = heading.position + 1;
      if (position <= view.state.doc.content.size) {
        view.dispatch(
          view.state.tr
            .setSelection(TextSelection.near(view.state.doc.resolve(position)))
            .scrollIntoView(),
        );
      }
      view.focus();
      const target = view.nodeDOM(heading.position);
      if (target instanceof HTMLElement) {
        target.scrollIntoView({ block: "start" });
        target.classList.remove("nota-anchor-flash");
        void target.getBoundingClientRect();
        target.classList.add("nota-anchor-flash");
        window.setTimeout(() => target.classList.remove("nota-anchor-flash"), 900);
      }
    });

    item.append(link);
    list.append(item);
  }

  root.append(list);
  return root;
}

export function createLiveTocDecorations(state: EditorState): DecorationSet {
  const { doc } = state;
  const headings = collectHeadings(doc);
  if (!headings.length) return DecorationSet.empty;

  const decorations: Decoration[] = [];
  doc.forEach((node, offset) => {
    if (!tocParagraph(node)) return;
    const from = offset;
    const to = offset + node.nodeSize;
    decorations.push(
      Decoration.node(from, to, {
        class: "nota-live-toc-slot",
        "data-type": "nota-live-toc",
      }),
    );
    const key = headings
      .map((heading) => `${heading.level}:${heading.position}:${heading.text}`)
      .join("\n");
    decorations.push(
      Decoration.widget(from, (view) => renderToc(view, headings), {
        side: -1,
        key,
        stopEvent: () => true,
        ignoreSelection: true,
      }),
    );
  });
  return DecorationSet.create(doc, decorations);
}

const liveTocKey = new PluginKey("nota-live-toc");

export const liveToc = $prose(
  () =>
    new Plugin({
      key: liveTocKey,
      props: {
        decorations: createLiveTocDecorations,
      },
    }),
);
