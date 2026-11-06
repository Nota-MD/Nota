/**
 * Viewport-attached inline-math preview.
 *
 * The preview must not participate in the editor's layout or scrollable
 * overflow. An absolutely positioned descendant can still enlarge an editor's
 * scroll range, which leaves an apparently empty row below the formula. Keep
 * the preview on the document body, position it with viewport coordinates, and
 * center it over the inline math node.
 */

const floatingClass = "nota-math-preview-floating";
const visibleClass = "nota-math-preview-visible";
const previewGap = 7;

export interface InlinePreviewController {
  setVisible(visible: boolean): void;
  reposition(): void;
  destroy(): void;
}

export function inlinePreviewCenter(anchor: DOMRect): { left: number; top: number } {
  return {
    left: anchor.left + anchor.width / 2,
    top: anchor.bottom + previewGap,
  };
}

export function mountInlinePreview(
  preview: HTMLElement,
  anchor: HTMLElement,
): InlinePreviewController {
  const doc = preview.ownerDocument;
  const host = doc.body ?? anchor.parentElement;
  preview.classList.add(floatingClass);
  host?.appendChild(preview);

  let visible = false;
  let frame: number | null = null;

  const placeNow = (): void => {
    if (!visible || !anchor.isConnected || !preview.isConnected) return;
    const center = inlinePreviewCenter(anchor.getBoundingClientRect());
    preview.style.left = `${center.left}px`;
    preview.style.top = `${center.top}px`;
    preview.classList.add(visibleClass);
  };

  const schedule = (): void => {
    if (!visible || frame !== null) return;
    const run = () => {
      frame = null;
      placeNow();
    };
    frame =
      globalThis.requestAnimationFrame?.(run) ??
      Number(globalThis.setTimeout?.(run, 0));
  };

  const onViewportChange = (): void => schedule();
  globalThis.addEventListener?.("resize", onViewportChange);
  globalThis.addEventListener?.("scroll", onViewportChange, true);

  return {
    setVisible(nextVisible: boolean): void {
      visible = nextVisible;
      if (visible) {
        placeNow();
        schedule();
      } else {
        preview.classList.remove(visibleClass);
        if (frame !== null) {
          globalThis.cancelAnimationFrame?.(frame);
          globalThis.clearTimeout?.(frame);
          frame = null;
        }
        preview.style.left = "";
        preview.style.top = "";
      }
    },
    reposition: schedule,
    destroy(): void {
      globalThis.removeEventListener?.("resize", onViewportChange);
      globalThis.removeEventListener?.("scroll", onViewportChange, true);
      if (frame !== null) {
        globalThis.cancelAnimationFrame?.(frame);
        globalThis.clearTimeout?.(frame);
        frame = null;
      }
      preview.remove();
    },
  };
}
