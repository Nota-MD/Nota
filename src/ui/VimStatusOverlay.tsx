import { useLayoutEffect, useState, type CSSProperties, type RefObject } from "react";
import { createPortal } from "react-dom";

import type { VimInputStatus } from "@/editor/plugin-vim-types";

/**
 * Vim mode badge.
 *
 * It lives in a body portal so the editor's scroll container cannot move it.
 * The position follows the visible editor pane's lower-left corner, keeping
 * the indicator above the tab and status bars instead of covering them.
 */
export function VimStatusOverlay({
  status,
  anchor,
}: {
  status: VimInputStatus | null;
  anchor: RefObject<HTMLElement | null>;
}) {
  const [placement, setPlacement] = useState<CSSProperties | null>(null);

  useLayoutEffect(() => {
    if (!status) {
      setPlacement(null);
      return;
    }
    const place = (): void => {
      const rect = anchor.current?.getBoundingClientRect();
      if (!rect || rect.width <= 0 || rect.height <= 0) {
        setPlacement(null);
        return;
      }
      setPlacement({
        left: Math.max(12, rect.left + 16),
        bottom: Math.max(12, window.innerHeight - rect.bottom + 10),
      });
    };
    place();
    window.addEventListener("resize", place);
    const observer = new ResizeObserver(place);
    if (anchor.current) observer.observe(anchor.current);
    return () => {
      window.removeEventListener("resize", place);
      observer.disconnect();
    };
  }, [anchor, status]);

  if (!status || !placement) return null;
  return createPortal(
    <div
      className={`nota-vim-status nota-vim-status-${status.mode}`}
      style={placement}
      aria-live="polite"
    >
      {status.label}
    </div>,
    document.body,
  );
}
