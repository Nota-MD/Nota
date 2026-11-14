import { Plugin } from "@milkdown/kit/prose/state";
import type { EditorView } from "@milkdown/kit/prose/view";
import { $prose } from "@milkdown/kit/utils";

interface AncestorLink {
  node: Node;
  parent: Node;
  previous: Node | null;
  next: Node | null;
}

function compositionAncestry(view: EditorView): AncestorLink[] {
  const selection = view.dom.ownerDocument.getSelection();
  let node: Node | null = selection?.anchorNode ?? null;
  if (node?.nodeType === Node.TEXT_NODE) node = node.parentNode;

  const links: AncestorLink[] = [];
  while (node && node !== view.dom && node.parentNode) {
    links.push({
      node,
      parent: node.parentNode,
      previous: node.previousSibling,
      next: node.nextSibling,
    });
    node = node.parentNode;
  }
  return node === view.dom ? links : [];
}

function isStandIn(child: Node, original: Node): boolean {
  if ((child as { pmViewDesc?: unknown }).pmViewDesc) return false;
  return (
    child.nodeName === "BR" ||
    (child.nodeType === Node.TEXT_NODE && !child.textContent) ||
    (child.nodeName === original.nodeName && !child.textContent)
  );
}

function reattach({ node, parent, previous, next }: AncestorLink): void {
  const hasPrevious = previous === null || previous.parentNode === parent;
  const hasNext = next === null || next.parentNode === parent;
  if (!hasPrevious && !hasNext) return;

  const afterPrevious = () => (previous ? previous.nextSibling : parent.firstChild);
  const gap: Node[] = [];
  if (hasPrevious && hasNext) {
    for (let child = afterPrevious(); child && child !== next; child = child.nextSibling) {
      gap.push(child);
    }
  } else {
    const beside = hasPrevious
      ? afterPrevious()
      : next
        ? next.previousSibling
        : parent.lastChild;
    if (beside) gap.push(beside);
  }
  for (const child of gap) {
    if (isStandIn(child, node)) parent.removeChild(child);
  }
  parent.insertBefore(node, hasNext ? next : afterPrevious());
}

function restorePrunedComposition(view: EditorView, links: AncestorLink[]): void {
  const block = links[0]?.node;
  if (!block || block.isConnected) return;

  for (let index = links.length - 1; index >= 0; index -= 1) {
    const link = links[index];
    if (link && link.node.parentNode !== link.parent) reattach(link);
  }

  for (const { node, previous, next } of links) {
    const before = node.previousSibling;
    if (before && before !== previous && before.nodeName === "BR" && isStandIn(before, node)) {
      before.remove();
    }
    const after = node.nextSibling;
    if (after && after !== next && after.nodeName === "BR" && isStandIn(after, node)) {
      after.remove();
    }
  }
  if (!block.isConnected) return;

  (block as Element).replaceChildren(document.createElement("br"));
  view.dom.ownerDocument.getSelection()?.collapse(block, 0);
}

/**
 * WebKit commits an IME preedit as deleteCompositionText followed by an
 * insert. If the delete removes the empty textblock that owns the composition,
 * restoring it before the insert keeps the committed text in the same line.
 */
export const compositionPruneGuard = $prose(
  () =>
    new Plugin({
      view(view) {
        let links: AncestorLink[] = [];
        const beforeInput = (rawEvent: Event) => {
          const event = rawEvent as InputEvent;
          if (
            event.inputType === "deleteCompositionText" &&
            view.dom.contains(event.target as Node)
          ) {
            links = compositionAncestry(view);
          }
        };
        const input = (rawEvent: Event) => {
          const event = rawEvent as InputEvent;
          if (event.inputType !== "deleteCompositionText") return;
          restorePrunedComposition(view, links);
          links = [];
        };
        const win = view.dom.ownerDocument.defaultView ?? window;
        win.addEventListener("beforeinput", beforeInput, true);
        win.addEventListener("input", input, true);
        return {
          destroy() {
            win.removeEventListener("beforeinput", beforeInput, true);
            win.removeEventListener("input", input, true);
          },
        };
      },
    }),
);

const linuxWebKit =
  typeof navigator !== "undefined" &&
  /Linux/.test(navigator.userAgent) &&
  /AppleWebKit/.test(navigator.userAgent);

interface ViewInput {
  input?: { compositionEndedAt?: number };
}

/**
 * ProseMirror applies Safari's post-composition key grace period to
 * WebKitGTK, where it can swallow a genuine Enter. A key still marked as IME
 * input is left alone; a real key clears only that private timestamp.
 */
export const linuxImeEnterGuard = $prose(
  () =>
    new Plugin({
      props: {
        handleDOMEvents: {
          keydown(view, event) {
            if (!linuxWebKit || view.composing) return false;
            if (event.isComposing || event.keyCode === 229 || event.key === "Process") {
              return false;
            }
            const input = (view as unknown as ViewInput).input;
            if (input?.compositionEndedAt !== undefined) {
              input.compositionEndedAt = -2e8;
            }
            return false;
          },
        },
      },
    }),
);
