/**
 * Textus-style in-place Markdown source editing for links.
 *
 * A linked run is replaced by one code-like inline node while the caret is on
 * it, then parsed back when the caret leaves. The replacement is a real
 * document transaction, so native selection, Ctrl+A, IME and undo all operate
 * on ordinary text instead of an overlay input.
 */

import { $nodeSchema, $prose } from "@milkdown/kit/utils";
import {
  Fragment,
  type Mark,
  type Node as PMNode,
  type NodeType,
} from "@milkdown/kit/prose/model";
import {
  Plugin,
  PluginKey,
  TextSelection,
  type EditorState,
  type Transaction,
} from "@milkdown/kit/prose/state";
import {
  Decoration,
  DecorationSet,
  type EditorView,
} from "@milkdown/kit/prose/view";

const linkSourceName = "notaLinkSource";

interface LinkRun {
  from: number;
  to: number;
  link: Mark;
}

export const linkSourceSpec = $nodeSchema(linkSourceName, () => ({
  content: "text*",
  group: "inline",
  inline: true,
  marks: "",
  code: true,
  selectable: false,
  attrs: {
    href: { default: "" },
    title: { default: "" },
    label: { default: "" },
  },
  parseDOM: [{ tag: 'span[data-type="nota-link-source"]', preserveWhitespace: "full" }],
  toDOM: () => [
    "span",
    {
      "data-type": "nota-link-source",
      class: "nota-link-source",
      spellcheck: "false",
    },
    0,
  ],
  parseMarkdown: { match: () => false, runner: () => {} },
  toMarkdown: {
    match: (node: PMNode) => node.type.name === linkSourceName,
    runner: (state, node) => {
      const source = node.textContent;
      if (source) state.addNode("html", undefined, source);
    },
  },
}));

export const linkSourceNodePlugins = linkSourceSpec.flat();

function linkRunAt(doc: PMNode, position: number): LinkRun | null {
  const linkType = doc.type.schema.marks.link;
  if (!linkType) return null;
  const resolved = doc.resolve(Math.max(0, Math.min(position, doc.content.size)));
  let depth = resolved.depth;
  while (depth > 0 && !resolved.node(depth).isTextblock) depth--;
  const parent = resolved.node(depth);
  if (!parent.isTextblock || parent.type.spec.code) return null;
  const start = resolved.start(depth);
  let at = start;
  let current: LinkRun | null = null;
  let found: LinkRun | null = null;
  const touches = (run: LinkRun | null): boolean =>
    run !== null && run.from <= position && position <= run.to;

  parent.forEach((child) => {
    if (found) return;
    const from = at;
    const to = from + child.nodeSize;
    const link = child.marks.find((mark) => mark.type === linkType) ?? null;
    if (
      link &&
      current &&
      current.link.eq(link)
    ) {
      current.to = to;
    } else {
      if (touches(current)) found = current;
      current = link ? { from, to, link } : null;
    }
    at = to;
  });
  return found ?? (touches(current) ? current : null);
}

function quoteTitle(title: string): string {
  if (!title) return "";
  return ` "${title.replaceAll('"', '\\"')}"`;
}

function linkSourceForRun(doc: PMNode, run: LinkRun): string {
  const href = String(run.link.attrs.href ?? "");
  const title = String(run.link.attrs.title ?? "");
  const label = doc.textBetween(run.from, run.to, "");
  return `[${label}](${href}${quoteTitle(title)})`;
}

function caretInSource(visible: string, source: string, offset: number): number {
  let at = source.startsWith("[") ? 1 : 0;
  for (const character of visible.slice(0, offset)) {
    const found = source.indexOf(character, at);
    if (found < 0) break;
    at = found + character.length;
  }
  return at;
}

function parseSource(
  source: string,
): { label: string; href: string; title: string } | null {
  const match = /^\[([^\]]*)\]\((\S+?)(?:\s+"((?:[^"\\]|\\.)*)")?\)$/.exec(source);
  if (!match) return null;
  return {
    label: match[1] ?? "",
    href: (match[2] ?? "").replaceAll('\\"', '"'),
    title: (match[3] ?? "").replaceAll('\\"', '"'),
  };
}

function collapseSource(
  schema: EditorState["schema"],
  node: PMNode,
): Fragment {
  const parsed = parseSource(node.textContent);
  if (!parsed) {
    return Fragment.from(node.textContent ? schema.text(node.textContent) : []);
  }
  const linkType = schema.marks.link;
  if (!linkType) return Fragment.from(schema.text(parsed.label || parsed.href));
  return Fragment.from(
    schema.text(parsed.label || parsed.href, [
      linkType.create({
        href: parsed.href,
        ...(parsed.title ? { title: parsed.title } : {}),
      }),
    ]),
  );
}

function revealRun(
  tr: Transaction,
  run: LinkRun,
  caret: number,
  source: string,
  syntaxType: NodeType,
): number {
  const { schema } = tr.doc.type;
  const href = String(run.link.attrs.href ?? "");
  const title = String(run.link.attrs.title ?? "");
  const label = tr.doc.textBetween(run.from, run.to, "");
  const node = syntaxType.create(
    { href, title, label },
    source ? schema.text(source) : null,
  );
  tr.replaceWith(run.from, run.to, node);
  const at =
    caret <= run.from
      ? run.from
      : caret >= run.to
        ? run.from + node.nodeSize
        : run.from + 1 + caretInSource(label, source, caret - run.from);
  tr.setSelection(TextSelection.create(tr.doc, at));
  return at;
}

interface LinkSourceState {
  positions: number[];
}

interface SettleResult {
  tr: Transaction;
  revealedCaret: number | null;
}

export const linkSourceRevealKey = new PluginKey<LinkSourceState>(
  "nota-link-source-reveal",
);

function trackSources(tr: Transaction, previous: number[]): number[] {
  if (!tr.docChanged) return previous;
  const positions = new Set<number>();
  for (const position of previous) {
    const mapped = tr.mapping.map(position, 1);
    if (tr.doc.nodeAt(mapped)?.type.name === linkSourceName) positions.add(mapped);
  }
  tr.doc.descendants((node, position) => {
    if (node.type.name === linkSourceName) {
      positions.add(position);
      return false;
    }
    return true;
  });
  return Array.from(positions).sort((a, b) => a - b);
}

function settleLinks(
  state: EditorState,
  syntaxType: NodeType,
  reveal: boolean,
  caretOverride?: number,
): SettleResult | null {
  const positions = linkSourceRevealKey.getState(state)?.positions ?? [];
  const tr = state.tr;
  let touching = false;
  let revealedCaret: number | null = null;
  for (const position of [...positions].reverse()) {
    const node = state.doc.nodeAt(position);
    if (!node || node.type.name !== linkSourceName) continue;
    const end = position + node.nodeSize;
    if (
      state.selection.from >= position &&
      state.selection.to <= end
    ) {
      touching = true;
      continue;
    }
    tr.replaceWith(position, end, collapseSource(state.schema, node));
  }
  if (reveal && !touching && state.selection.empty) {
    const caret = tr.mapping.map(caretOverride ?? state.selection.from);
    const run = linkRunAt(tr.doc, caret);
    if (run) {
      revealedCaret = revealRun(
        tr,
        run,
        caret,
        linkSourceForRun(tr.doc, run),
        syntaxType,
      );
    }
  }
  return tr.docChanged
    ? {
        tr: tr.setMeta(linkSourceRevealKey, "settle"),
        revealedCaret,
      }
    : null;
}

export function linkSourceDecorations(state: EditorState): DecorationSet {
  const positions = linkSourceRevealKey.getState(state)?.positions ?? [];
  const decorations: Decoration[] = [];
  for (const position of positions) {
    const node = state.doc.nodeAt(position);
    if (node?.type.name !== linkSourceName) continue;
    const source = node.textContent;
    const bracket = source.indexOf("](");
    if (source.startsWith("[")) {
      decorations.push(
        Decoration.inline(position + 1, position + 2, {
          class: "nota-link-source-syntax",
        }),
      );
    }
    if (bracket >= 0) {
      decorations.push(
        Decoration.inline(position + 1 + bracket, position + node.nodeSize - 1, {
          class: "nota-link-source-syntax",
        }),
      );
    }
  }
  return DecorationSet.create(state.doc, decorations);
}

export const linkSourceReveal = $prose((ctx) => {
  const syntaxType = linkSourceSpec.type(ctx);
  let view: EditorView | null = null;
  let settling = false;
  let correctionFrame = 0;
  const correctRevealedCaret = (editorView: EditorView, caret: number) => {
    const correct = () => {
      if (editorView.isDestroyed || !editorView.hasFocus()) return;
      const { state } = editorView;
      if (caret > state.doc.content.size) return;
      const source = state.doc.resolve(caret).nodeBefore;
      if (source?.type !== syntaxType) return;
      const start = caret - source.nodeSize;
      if (
        state.selection.empty &&
        state.selection.from >= start &&
        state.selection.from < caret
      ) {
        editorView.dispatch(
          state.tr
            .setSelection(TextSelection.create(state.doc, caret))
            .setMeta(linkSourceRevealKey, "settle"),
        );
      }
    };
    queueMicrotask(correct);
    cancelAnimationFrame(correctionFrame);
    correctionFrame = requestAnimationFrame(correct);
  };
  const dispatchSettle = (
    editorView: EditorView,
    reveal: boolean,
  ): void => {
    if (settling || editorView.isDestroyed) return;
    settling = true;
    try {
      const result = settleLinks(editorView.state, syntaxType, reveal);
      if (result) {
        editorView.dispatch(result.tr);
        if (result.revealedCaret !== null) {
          correctRevealedCaret(editorView, result.revealedCaret);
        }
      }
    } finally {
      settling = false;
    }
  };
  return new Plugin<LinkSourceState>({
    key: linkSourceRevealKey,
    state: {
      init: () => ({ positions: [] }),
      apply: (tr, previous) => ({
        positions: trackSources(tr, previous.positions),
      }),
    },
    appendTransaction(transactions, oldState, state) {
      if (
        !view ||
        view.composing ||
        transactions.some(
          (tr) => tr.getMeta(linkSourceRevealKey) === "settle",
        )
      ) {
        return null;
      }
      const oldLink =
        oldState.selection.empty
          ? linkRunAt(
              oldState.doc,
              Math.max(0, Math.min(state.selection.from, oldState.doc.content.size)),
            )
          : null;
      const browserSteppedIntoLink =
        oldLink !== null &&
        oldLink.to === oldState.selection.from &&
        state.selection.empty &&
        state.selection.from === oldLink.to - 1;
      const result = settleLinks(
        state,
        syntaxType,
        view.hasFocus(),
        browserSteppedIntoLink ? oldLink.to : undefined,
      );
      if (result !== null && result.revealedCaret !== null && view) {
        correctRevealedCaret(view, result.revealedCaret);
      }
      return result?.tr ?? null;
    },
    view(editorView) {
      view = editorView;
      return {
        destroy() {
          cancelAnimationFrame(correctionFrame);
          view = null;
        },
      };
    },
    props: {
      decorations: linkSourceDecorations,
      handleDOMEvents: {
        compositionend: () => {
          if (!view) return false;
          const editorView = view;
          window.setTimeout(() => {
            if (!editorView.isDestroyed) {
              dispatchSettle(editorView, editorView.hasFocus());
            }
          }, 60);
          return false;
        },
      },
      handleKeyDown(editorView, event) {
        if (
          event.shiftKey ||
          event.ctrlKey ||
          event.metaKey ||
          event.altKey ||
          (event.key !== "ArrowLeft" && event.key !== "ArrowRight")
        ) {
          return false;
        }
        if (!editorView.state.selection.empty) return false;
        const { $from, from } = editorView.state.selection;
        let start: number;
        if ($from.parent.type === syntaxType) start = $from.before();
        else if ($from.nodeAfter?.type === syntaxType) start = from;
        else if ($from.nodeBefore?.type === syntaxType) {
          start = from - $from.nodeBefore.nodeSize;
        } else {
          return false;
        }
        const node = editorView.state.doc.nodeAt(start);
        if (!node) return false;
        const end = start + node.nodeSize;
        if (event.key === "ArrowLeft" && from === start + 1) {
          event.preventDefault();
          editorView.dispatch(
            editorView.state.tr.setSelection(
              TextSelection.create(editorView.state.doc, start),
            ),
          );
          editorView.focus();
          return true;
        }
        if (event.key === "ArrowRight" && from === end - 1) {
          event.preventDefault();
          editorView.dispatch(
            editorView.state.tr.setSelection(
              TextSelection.create(editorView.state.doc, end),
            ),
          );
          editorView.focus();
          return true;
        }
        return false;
      },
    },
  });
});
