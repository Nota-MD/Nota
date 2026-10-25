import type { EditorState } from "@milkdown/kit/prose/state";
import { Plugin } from "@milkdown/kit/prose/state";
import type { EditorView } from "@milkdown/kit/prose/view";

const cursorClass = "nota-blink-caret";
const showClass = "nota-blink-caret-on";

/** 当前选区是否应该由正文层绘制插入光标。 */
export function isNoShowCursor(state: EditorState): boolean {
  const selection = state.selection;
  if (!selection.empty) return false;
  const parent = selection.$head.parent;
  return !(parent.type.spec.code || parent.type.spec.atom);
}

function hideCursor(cursor: HTMLElement): void {
  cursor.classList.remove(showClass);
}

function arrangeCursor(cursor: HTMLElement, view: EditorView): void {
  if (view.isDestroyed || !view.hasFocus() || !isNoShowCursor(view.state)) {
    hideCursor(cursor);
    return;
  }

  try {
    const coordinate = view.coordsAtPos(view.state.selection.head, 1);
    const editorArea = view.dom.getBoundingClientRect();
    if (coordinate.bottom < editorArea.top || coordinate.top > editorArea.bottom) {
      hideCursor(cursor);
      return;
    }
    cursor.style.left = `${Math.round(coordinate.left)}px`;
    cursor.style.top = `${Math.round(coordinate.top)}px`;
    cursor.style.height = `${Math.max(12, coordinate.bottom - coordinate.top)}px`;
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
      const refreshNewValue = () => {
        frame = 0;
        if (!view.isDestroyed) arrangeCursor(cursor, view);
      };
      const safeArrange = () => {
        if (!frame) frame = requestAnimationFrame(refreshNewValue);
      };
      const windowBlur = () => hideCursor(cursor);
      const rollActionContainer = view.dom.closest(".editor-pane");
      const rulerInchWatchListen =
        typeof ResizeObserver === "undefined" ? null : new ResizeObserver(safeArrange);

      view.dom.addEventListener("focusin", safeArrange);
      view.dom.addEventListener("focusout", safeArrange);
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
          view.dom.removeEventListener("focusin", safeArrange);
          view.dom.removeEventListener("focusout", safeArrange);
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
