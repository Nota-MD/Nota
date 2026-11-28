import type { Node as PMNode } from "@milkdown/kit/prose/model";
import type {
  Decoration,
  DecorationSource,
  EditorView,
  NodeView,
  NodeViewConstructor,
} from "@milkdown/kit/prose/view";
import type { KatexOptions } from "katex";

import { t } from "@/i18n";
import {
  clearLatestMath,
  createEmptyMathPosition,
  drawLatestMath,
} from "./math-render-target";
import { readSource } from "./math-view-source";
import { findScrollContainer } from "./scroll-into-view";
import {
  observeNearViewport,
  preserveElementAnchor,
} from "./viewport-visibility";

export function createDeferredMathView(
  full: NodeViewConstructor,
  inline: boolean,
  initialNode: PMNode,
  view: EditorView,
  getPos: () => number | undefined,
  option: KatexOptions,
  initialDecorations: readonly Decoration[],
  initialInnerDecorations: DecorationSource,
): NodeView {
  const host = document.createElement(inline ? "span" : "div");
  host.className = `nota-math nota-math-${inline ? "inline" : "block"} nota-math-deferred`;
  host.dataset.notaMathMode = "virtual";
  const placeholder = document.createElement(inline ? "span" : "div");
  placeholder.className = "nota-math-virtual";
  host.append(placeholder);

  let current = initialNode;
  let currentDecorations = initialDecorations;
  let currentInnerDecorations = initialInnerDecorations;
  let inner: NodeView | null = null;
  let rendered: HTMLElement | null = null;
  let near = false;

  function source(): string {
    return readSource(current);
  }

  function clearRendered(): void {
    if (!rendered) return;
    clearLatestMath(rendered);
    rendered.remove();
    rendered = null;
  }

  function renderStatic(): void {
    if (!host.isConnected || inner) return;
    near = true;
    if (!rendered) {
      rendered = document.createElement(inline ? "span" : "div");
      rendered.className = "nota-math-render";
      rendered.contentEditable = "false";
    }
    host.replaceChildren(rendered);
    host.dataset.notaMathMode = "rendered";
    host.classList.remove("nota-math-deferred");
    host.style.removeProperty("min-width");
    host.style.removeProperty("min-height");
    const value = source();
    if (!value.trim()) {
      rendered.replaceChildren(
        createEmptyMathPosition(
          inline,
          inline
            ? t("Empty inline math")
            : t("Empty math block — click to write LaTeX"),
        ),
      );
      rendered.dataset.state = "empty";
      rendered.dataset.source = value;
      return;
    }
    void drawLatestMath(rendered, value, option);
  }

  function hydrateEditing(): NodeView | null {
    if (inner) return inner;
    if (!host.isConnected) return null;
    near = true;
    const rect = host.getBoundingClientRect();
    const scroller = findScrollContainer(view.dom);
    clearRendered();
    host.replaceChildren();
    inner = full(
      current,
      view,
      getPos,
      currentDecorations,
      currentInnerDecorations,
    );
    host.append(inner.dom);
    host.dataset.notaMathMode = "editing";
    host.classList.remove("nota-math-deferred");
    host.style.removeProperty("min-width");
    host.style.removeProperty("min-height");
    requestAnimationFrame(() => {
      if (!host.isConnected || !scroller) return;
      const difference = host.getBoundingClientRect().width - rect.width;
      if (inline && Math.abs(difference) >= 1) {
        host.style.setProperty(
          "--nota-math-deferred-width",
          `${Math.ceil(rect.width)}px`,
        );
      }
    });
    return inner;
  }

  function canLeaveEditing(): boolean {
    return (
      !!inner &&
      !inner.dom.classList.contains("nota-math-editing") &&
      !inner.dom.contains(document.activeElement)
    );
  }

  function leaveEditing(): void {
    if (!canLeaveEditing()) return;
    const visible = inner?.dom;
    const rect = visible?.getBoundingClientRect();
    preserveElementAnchor(findScrollContainer(view.dom), host, () => {
      inner?.destroy?.();
      inner = null;
      if (near) renderStatic();
      else if (rect) virtualize(rect.width, rect.height);
    });
  }

  function virtualize(width?: number, height?: number): void {
    if (!inner && !rendered) return;
    if (inner?.dom.contains(document.activeElement)) return;
    const measured =
      width === undefined || height === undefined
        ? host.getBoundingClientRect()
        : null;
    const targetWidth = width ?? measured?.width ?? 0;
    const targetHeight = height ?? measured?.height ?? 0;
    near = false;
    preserveElementAnchor(findScrollContainer(view.dom), host, () => {
      inner?.destroy?.();
      inner = null;
      clearRendered();
      placeholder.style.width = `${Math.ceil(targetWidth)}px`;
      placeholder.style.height = `${Math.ceil(targetHeight)}px`;
      host.style.setProperty(
        "--nota-math-deferred-width",
        `${Math.ceil(targetWidth)}px`,
      );
      host.replaceChildren(placeholder);
      host.dataset.notaMathMode = "virtual";
      host.classList.add("nota-math-deferred");
    });
  }

  const openFromStatic = (event: Event) => {
    if (
      inner ||
      !rendered ||
      !(event.target instanceof Node) ||
      !rendered.contains(event.target)
    ) {
      return;
    }
    event.preventDefault();
    event.stopPropagation();
    const sourceElement = rendered;
    const box = sourceElement.getBoundingClientRect();
    const activeInner = hydrateEditing();
    const target = activeInner?.dom.querySelector<HTMLElement>(".nota-math-render");
    if (!activeInner || !target) return;
    queueMicrotask(() => {
      if (!activeInner.dom.isConnected) return;
      const init: MouseEventInit = {
        bubbles: true,
        cancelable: true,
        button: 0,
        clientX: box.left + Math.min(4, box.width / 2),
        clientY: box.top + Math.min(4, box.height / 2),
      };
      target.dispatchEvent(new MouseEvent("mousedown", init));
      target.dispatchEvent(new MouseEvent("mouseup", init));
      target.dispatchEvent(new MouseEvent("click", init));
    });
  };
  host.addEventListener("mousedown", openFromStatic, true);

  let stopObserver = () => {};
  stopObserver = observeNearViewport(host, view, (isNear) => {
    near = isNear;
    if (isNear) {
      stopObserver();
      stopObserver = () => {};
      if (currentDecorations.length > 0) hydrateEditing();
      else renderStatic();
    }
  });

  return {
    dom: host,
    update: (node, decorations, innerDecorations) => {
      current = node;
      currentDecorations = decorations;
      currentInnerDecorations = innerDecorations;
      const updated = inner?.update?.(node, decorations, innerDecorations) ?? true;
      if (decorations.length > 0) hydrateEditing();
      else if (inner) leaveEditing();
      else if (rendered) renderStatic();
      return updated;
    },
    selectNode: () => {
      hydrateEditing();
      inner?.selectNode?.();
      host.classList.add("ProseMirror-selectednode");
    },
    deselectNode: () => {
      inner?.deselectNode?.();
      host.classList.remove("ProseMirror-selectednode");
    },
    setSelection: (anchor, head, root) => {
      hydrateEditing();
      inner?.setSelection?.(anchor, head, root);
    },
    stopEvent: (event) =>
      inner?.stopEvent?.(event) ??
      (!!rendered && event.target instanceof Node && rendered.contains(event.target)),
    ignoreMutation: (mutation) => inner?.ignoreMutation?.(mutation) ?? true,
    destroy: () => {
      stopObserver();
      host.removeEventListener("mousedown", openFromStatic, true);
      inner?.destroy?.();
      inner = null;
      clearRendered();
    },
  };
}
