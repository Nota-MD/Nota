import type { Node as PMNode } from "@milkdown/kit/prose/model";
import { Plugin, PluginKey } from "@milkdown/kit/prose/state";
import type { EditorView } from "@milkdown/kit/prose/view";
import { Decoration, DecorationSet } from "@milkdown/kit/prose/view";
import { $prose } from "@milkdown/kit/utils";
import { refractor } from "refractor";

import { shouldHydrateNearViewport } from "./large-doc";

interface HighlightNode {
  children?: HighlightNode[];
  properties?: { className?: string[] };
  type: string;
  value?: string;
}

function flatNodes(
  nodes: HighlightNode[],
  className: string[] = [],
): Array<{ text: string; className: string[] }> {
  return nodes.flatMap((node) =>
    node.type === "element"
      ? flatNodes(node.children ?? [], [
          ...className,
          ...(node.properties?.className ?? []),
        ])
      : [{ text: node.value ?? "", className }],
  );
}

function blockDecorations(
  node: PMNode,
  position: number,
): Decoration[] {
  const language =
    typeof node.attrs.language === "string" ? node.attrs.language : "";
  if (!language || !refractor.listLanguages().includes(language)) return [];

  const decorations: Decoration[] = [];
  let from = position + 1;
  const tree = refractor.highlight(node.textContent, language) as HighlightNode;
  for (const child of flatNodes(tree.children ?? [])) {
    const to = from + child.text.length;
    if (child.className.length) {
      decorations.push(
        Decoration.inline(from, to, { class: child.className.join(" ") }),
      );
    }
    from = to;
  }
  return decorations;
}

const prismKey = new PluginKey<DecorationSet>("nota-lazy-prism");
const pendingRequests = new WeakMap<EditorView, Map<number, Decoration[]>>();
const pendingTimers = new WeakMap<EditorView, ReturnType<typeof setTimeout>>();
const highlightDelayMs = 80;

function flushHighlights(view: EditorView): void {
  pendingTimers.delete(view);
  const requests = pendingRequests.get(view);
  pendingRequests.delete(view);
  if (!requests || view.isDestroyed) return;
  view.dispatch(
    view.state.tr.setMeta(
      prismKey,
      [...requests].map(([requestPosition, decorations]) => {
        const requestNode = view.state.doc.nodeAt(requestPosition);
        return {
          from: requestPosition + 1,
          to:
            requestPosition +
            (requestNode?.nodeSize ?? 1) -
            1,
          decorations,
        };
      }),
    ),
  );
}

export function requestCodeBlockHighlight(
  view: EditorView,
  position: number,
): void {
  if (!shouldHydrateNearViewport(view.state.doc.content.size)) return;
  const node = view.state.doc.nodeAt(position);
  if (!node || node.type.name !== "code_block") return;
  const pending = pendingRequests.get(view);
  if (pending) {
    pending.set(position, blockDecorations(node, position));
    clearTimeout(pendingTimers.get(view));
    pendingTimers.set(view, setTimeout(() => flushHighlights(view), highlightDelayMs));
    return;
  }
  const requests = new Map<number, Decoration[]>();
  requests.set(position, blockDecorations(node, position));
  pendingRequests.set(view, requests);
  pendingTimers.set(view, setTimeout(() => flushHighlights(view), highlightDelayMs));
}

export function lazyPrism() {
  return $prose(() => {
    return new Plugin<DecorationSet>({
      key: prismKey,
      state: {
        init: (_config, state) => {
          if (shouldHydrateNearViewport(state.doc.content.size)) {
            return DecorationSet.empty;
          }
          const decorations: Decoration[] = [];
          state.doc.descendants((node, position) => {
            if (node.type.name !== "code_block") return true;
            decorations.push(...blockDecorations(node, position));
            return false;
          });
          return DecorationSet.create(state.doc, decorations);
        },
        apply: (transaction, previous, _oldState, state) => {
          let decorations = transaction.docChanged
            ? previous.map(transaction.mapping, transaction.doc)
            : previous;
          const requests = transaction.getMeta(prismKey) as
            | Array<{
                from: number;
                to: number;
                decorations: Decoration[];
              }>
            | undefined;
          if (requests) {
            for (const request of requests) {
              decorations = decorations
                .remove(decorations.find(request.from, request.to))
                .add(transaction.doc, request.decorations);
            }
            return decorations;
          }
          if (!transaction.docChanged) return decorations;

          const changed = new Map<number, PMNode>();
          transaction.steps.forEach((step) => {
            step.getMap().forEach((_oldStart, _oldEnd, newStart, newEnd) => {
              const from = Math.max(0, Math.min(state.doc.content.size, newStart));
              const to = Math.max(from, Math.min(state.doc.content.size, newEnd));
              state.doc.nodesBetween(from, to, (node, position) => {
                if (node.type.name === "code_block") {
                  changed.set(position, node);
                  return false;
                }
                return true;
              });
            });
          });
          if (changed.size === 0) return decorations;
          for (const [position, node] of changed) {
            const from = position + 1;
            const to = position + node.nodeSize - 1;
            decorations = decorations
              .remove(decorations.find(from, to))
              .add(transaction.doc, blockDecorations(node, position));
          }
          return decorations;
        },
      },
      props: {
        decorations(state) {
          return prismKey.getState(state) ?? DecorationSet.empty;
        },
      },
    });
  });
}
