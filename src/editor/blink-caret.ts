import type { EditorState } from "@milkdown/kit/prose/state";
import { Plugin } from "@milkdown/kit/prose/state";
import type { EditorView } from "@milkdown/kit/prose/view";

const cursorClass = "nota-blink-caret";
const showClass = "nota-blink-caret-on";
const dimClass = "nota-blink-caret-dim";
const imeComposingClass = "nota-ime-composing";
const blinkHalfPeriodMs = 530;

/**
 * Keep carets inside a text line.
 *
 * Headings keep the caret proportional to their own text metrics. Inline
 * images and other tall atoms can make `coordsAtPos` report the whole atom
 * height; that is not a caret, so pathological heights fall back to one body
 * text line.
 */
export function caretHeightInLine(
  _nodeType: string,
  naturalHeight: number,
  baseFontSize: number,
): number {
  const safeHeight = Number.isFinite(naturalHeight) ? Math.max(12, naturalHeight) : 12;
  if (!Number.isFinite(baseFontSize) || baseFontSize <= 0) {
    return safeHeight;
  }
  const bodyLineHeight = Math.max(12, baseFontSize * 1.2);
  if (safeHeight > Math.max(64, baseFontSize * 3)) {
    return Math.round(Math.min(safeHeight, bodyLineHeight));
  }
  return safeHeight;
}

/**
 * Pathological caret heights are anchored at the top of the atom instead of
 * being centered inside it. Centering a text-height caret in a tall image puts
 * it halfway down the image, far from the text boundary the user is editing.
 */
export function caretTopInLine(
  naturalHeight: number,
  caretHeight: number,
  coordinateTop: number,
  baseFontSize: number,
): number {
  if (
    !Number.isFinite(naturalHeight) ||
    !Number.isFinite(baseFontSize) ||
    baseFontSize <= 0 ||
    naturalHeight > Math.max(64, baseFontSize * 3)
  ) {
    return coordinateTop;
  }
  return coordinateTop + (naturalHeight - caretHeight) / 2;
}

export interface CaretCoordinate {
  left: number;
  top: number;
  bottom: number;
}

export interface InlineMathBoundary {
  position: number;
  side: "before" | "after";
}

/** Locate a collapsed caret immediately before or after inline math. */
export function inlineMathBoundary(state: EditorState): InlineMathBoundary | null {
  if (!state.selection.empty) return null;
  const { $from } = state.selection;
  const before = $from.nodeBefore;
  if (before?.type.name === "math_inline") {
    return { position: state.selection.from - before.nodeSize, side: "after" };
  }
  const after = $from.nodeAfter;
  if (after?.type.name === "math_inline") {
    return { position: state.selection.from, side: "before" };
  }
  return null;
}

/** Pick the first coordinate that has a real horizontal and vertical box. */
export function usableCaretCoordinate(
  candidates: readonly (CaretCoordinate | null | undefined)[],
): CaretCoordinate | null {
  for (const coordinate of candidates) {
    if (!coordinate) continue;
    if (![coordinate.left, coordinate.top, coordinate.bottom].every(Number.isFinite)) {
      continue;
    }
    if (coordinate.bottom > coordinate.top) return coordinate;
  }
  return null;
}

/** 当前选区是否应该由正文层绘制插入光标。 */
export function isNoShowCursor(state: EditorState): boolean {
  const selection = state.selection;
  if (!selection.empty) return false;
  const parent = selection.$head.parent;
  // Link source text is code-like so Markdown punctuation stays literal, but
  // it is edited directly in the document and still needs the body caret.
  if (parent.type.spec.code && parent.type.name !== "notaLinkSource") return false;
  // `notaSyntax` is an inline marker atom owned by the paragraph. The caret
  // legitimately sits between two marker characters there, so it must still
  // be drawn by the document layer.
  return !parent.type.spec.atom || parent.type.name === "notaSyntax";
}

/** Inner editors (formula input, code-block CodeMirror) draw their own caret. */
export function innerEditorOwnsCaret(
  active: Element | null,
  root: HTMLElement,
): boolean {
  if (
    root.classList.contains("nota-inline-math-input-focused") ||
    root.classList.contains("nota-inline-math-editing") ||
    (root.ownerDocument.querySelector?.(".nota-inline-math-editing") ?? null) !== null
  ) {
    return true;
  }
  if (!active || active === root || !root.contains(active)) return false;
  return (
    active.matches("input, textarea, .cm-content, .nota-keyboard-link-source") ||
    active.closest("input, textarea, .cm-content, .nota-keyboard-link-source") !== null
  );
}

function hideCursor(cursor: HTMLElement): void {
  cursor.classList.remove(showClass);
}

function arrangeCursor(cursor: HTMLElement, view: EditorView): void {
  const active = view.dom.ownerDocument.activeElement;
  if (
    view.isDestroyed ||
    view.dom.classList.contains(imeComposingClass) ||
    !view.hasFocus() ||
    innerEditorOwnsCaret(active, view.dom) ||
    !isNoShowCursor(view.state)
  ) {
    hideCursor(cursor);
    return;
  }

  try {
    const mathBoundary = inlineMathBoundary(view.state);
    if (mathBoundary) {
      const element = view.nodeDOM(mathBoundary.position);
      if (element instanceof Element) {
        const rects = Array.from(element.getClientRects());
        const rect = mathBoundary.side === "after" ? rects.at(-1) : rects[0];
        if (rect && rect.height > 0) {
          const baseFontSize = Number.parseFloat(getComputedStyle(element).fontSize);
          const height = caretHeightInLine("paragraph", rect.height, baseFontSize);
          cursor.style.left = `${Math.round(mathBoundary.side === "after" ? rect.right : rect.left)}px`;
          cursor.style.top = `${Math.round(rect.top)}px`;
          cursor.style.height = `${height}px`;
          cursor.classList.add(showClass);
          return;
        }
      }
    }

    const head = view.state.selection.head;
    const candidates: (CaretCoordinate | null | undefined)[] = [];
    for (const assoc of [1, -1]) {
      try {
        candidates.push(view.coordsAtPos(head, assoc));
      } catch {
        candidates.push(null);
      }
    }
    // Inline syntax atoms use `display: contents`, so the exact boundary can
    // have no DOM box in WebKit. Walk onto the nearest real text character.
    for (let delta = 1; delta <= 4; delta++) {
      for (const [position2, assoc] of [
        [head - delta, -1],
        [head + delta, 1],
      ] as const) {
        if (position2 < 0 || position2 > view.state.doc.content.size) continue;
        try {
          candidates.push(view.coordsAtPos(position2, assoc));
        } catch {
          candidates.push(null);
        }
      }
    }
    const coordinate = usableCaretCoordinate(candidates);
    if (!coordinate) {
      hideCursor(cursor);
      return;
    }
    const editorArea = view.dom.getBoundingClientRect();
    if (coordinate.bottom < editorArea.top || coordinate.top > editorArea.bottom) {
      hideCursor(cursor);
      return;
    }
    const naturalHeight = Math.max(12, coordinate.bottom - coordinate.top);
    const baseFontSize = Number.parseFloat(getComputedStyle(view.dom).fontSize);
    const height = caretHeightInLine(
      view.state.selection.$head.parent.type.name,
      naturalHeight,
      baseFontSize,
    );
    const top = caretTopInLine(
      naturalHeight,
      height,
      coordinate.top,
      baseFontSize,
    );
    const boundedTop = Math.max(
      editorArea.top,
      Math.min(top, editorArea.bottom - height),
    );
    cursor.style.left = `${Math.round(coordinate.left)}px`;
    cursor.style.top = `${Math.round(boundedTop)}px`;
    cursor.style.height = `${height}px`;
    cursor.classList.add(showClass);
  } catch {
    hideCursor(cursor);
  }
}

/**
 * 用编辑器外的一层覆盖物画闪烁光标。
 *
 * 不能改成 `Decoration.widget`：ProseMirror 会给这类 widget 写
 * `contenteditable=false`，而 WebKitGTK 在紧邻这种节点的折叠选区上无法正常
 * 接收输入。覆盖物不进入文档 DOM，因此不参与解析、选择、撤销或导出。
 */
export function flashSparkCursor(): Plugin {
  return new Plugin({
    view(view) {
      const cursor = document.createElement("span");
      cursor.className = cursorClass;
      cursor.setAttribute("aria-hidden", "true");
      const host2 = view.dom.parentElement ?? document.body;
      host2.append(cursor);

      let frame = 0;
      let blinkTimer = 0;
      const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      const stopBlink = () => {
        if (blinkTimer) window.clearInterval(blinkTimer);
        blinkTimer = 0;
        cursor.classList.remove(dimClass);
      };
      const restartBlink = () => {
        stopBlink();
        if (reducedMotion || !cursor.classList.contains(showClass)) return;
        blinkTimer = window.setInterval(() => {
          cursor.classList.toggle(dimClass);
        }, blinkHalfPeriodMs);
      };
      const refreshNewValue = () => {
        frame = 0;
        if (!view.isDestroyed) {
          arrangeCursor(cursor, view);
          restartBlink();
        }
      };
      const safeArrange = () => {
        if (!frame) frame = requestAnimationFrame(refreshNewValue);
      };
      const windowBlur = () => {
        hideCursor(cursor);
        stopBlink();
      };
      // The detached overlay cannot track IME preedits reliably. WebKit may
      // keep the DOM selection at composition start while candidates advance,
      // leaving the custom caret behind. Use the native caret until the IME
      // commits, then resume the stable overlay for ordinary typing.
      const beginComposition = () => {
        view.dom.classList.add(imeComposingClass);
        hideCursor(cursor);
        stopBlink();
      };
      const endComposition = () => {
        if (frame) cancelAnimationFrame(frame);
        frame = requestAnimationFrame(() => {
          frame = 0;
          if (view.isDestroyed) return;
          view.dom.classList.remove(imeComposingClass);
          arrangeCursor(cursor, view);
          restartBlink();
        });
      };
      const rollActionContainer = view.dom.closest(".editor-pane");
      const rulerInchWatchListen =
        typeof ResizeObserver === "undefined" ? null : new ResizeObserver(safeArrange);

      view.dom.addEventListener("focusin", safeArrange);
      view.dom.addEventListener("focusout", safeArrange);
      view.dom.addEventListener("compositionstart", beginComposition);
      view.dom.addEventListener("compositionupdate", beginComposition);
      view.dom.addEventListener("compositionend", endComposition);
      rollActionContainer?.addEventListener("scroll", safeArrange, { passive: true });
      window.addEventListener("resize", safeArrange);
      window.addEventListener("scroll", safeArrange, true);
      window.addEventListener("blur", windowBlur);
      window.addEventListener("focus", safeArrange);
      document.addEventListener("selectionchange", safeArrange);
      rulerInchWatchListen?.observe(view.dom);
      safeArrange();

      return {
        update: safeArrange,
        destroy() {
          if (frame) cancelAnimationFrame(frame);
          stopBlink();
          view.dom.removeEventListener("focusin", safeArrange);
          view.dom.removeEventListener("focusout", safeArrange);
          view.dom.removeEventListener("compositionstart", beginComposition);
          view.dom.removeEventListener("compositionupdate", beginComposition);
          view.dom.removeEventListener("compositionend", endComposition);
          view.dom.classList.remove(imeComposingClass);
          rollActionContainer?.removeEventListener("scroll", safeArrange);
          window.removeEventListener("resize", safeArrange);
          window.removeEventListener("scroll", safeArrange, true);
          window.removeEventListener("blur", windowBlur);
          window.removeEventListener("focus", safeArrange);
          document.removeEventListener("selectionchange", safeArrange);
          rulerInchWatchListen?.disconnect();
          cursor.remove();
        },
      };
    },
  });
}
