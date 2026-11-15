import { useCallback, useState, type PointerEvent as ReactPointerEvent, type RefObject } from "react";

/** Reorder items by moving one id before or after another id. */
export function reorderTabs<Id extends string | number, T extends { id: Id }>(
  items: readonly T[],
  sourceId: Id,
  targetId: Id,
  place: "before" | "after",
): T[] {
  if (sourceId === targetId) return [...items];
  const moving = items.find((item) => item.id === sourceId);
  if (!moving) return [...items];
  const rest = items.filter((item) => item.id !== sourceId);
  const target = rest.findIndex((item) => item.id === targetId);
  if (target < 0) return [...items];
  rest.splice(place === "before" ? target : target + 1, 0, moving);
  return rest;
}

export interface TabDragRect {
  id: string;
  left: number;
  right: number;
  top: number;
  bottom: number;
}

export interface TabDropTarget {
  id: string;
  place: "before" | "after";
}

/**
 * Pick the nearest non-source tab for a pointer position.
 *
 * Rows are weighted more heavily than columns so wrapped dock tabs stay on the
 * row the pointer is actually over. The source tab is removed from candidates
 * because dropping onto itself must be a no-op.
 */
export function nearestTabDropTarget(
  rects: readonly TabDragRect[],
  sourceId: string,
  x: number,
  y: number,
): TabDropTarget | null {
  let best: { target: TabDropTarget; score: number } | null = null;
  for (const rect of rects) {
    if (rect.id === sourceId) continue;
    const dx = x < rect.left ? rect.left - x : x > rect.right ? x - rect.right : 0;
    const dy = y < rect.top ? rect.top - y : y > rect.bottom ? y - rect.bottom : 0;
    const score = dy * 4 + dx;
    if (best && score >= best.score) continue;
    best = {
      score,
      target: {
        id: rect.id,
        place: x < (rect.left + rect.right) / 2 ? "before" : "after",
      },
    };
  }
  return best?.target ?? null;
}

interface PointerTabReorderOptions {
  container: RefObject<HTMLElement | null>;
  onReorder: (sourceId: string, targetId: string, place: "before" | "after") => void;
}

/**
 * Pointer-based tab reordering for Tauri WebViews.
 *
 * HTML5 drag events are not reliable here because the window owns file drop.
 * This hook starts only after a four-pixel movement, so ordinary tab clicks and
 * close buttons keep their native behavior.
 */
export function usePointerTabReorder({ container, onReorder }: PointerTabReorderOptions) {
  const [dragId, setDragId] = useState<string | null>(null);
  const [dropTarget, setDropTarget] = useState<TabDropTarget | null>(null);

  const begin = useCallback(
    (sourceId: string, event: ReactPointerEvent<HTMLElement>) => {
      if (event.button !== 0 || (event.target as Element | null)?.closest?.("[data-no-tab-drag]")) {
        return;
      }

      const startX = event.clientX;
      const startY = event.clientY;
      const pointerId = event.pointerId;
      const dragHandle = event.currentTarget;
      let active = false;
      let latestTarget: TabDropTarget | null = null;

      const removeClickGuard = () => {
        window.removeEventListener("click", suppressClick, true);
      };
      const suppressClick = (click: MouseEvent) => {
        if (!active) return;
        click.preventDefault();
        click.stopImmediatePropagation();
        removeClickGuard();
      };

      const cleanup = (commit: boolean) => {
        window.removeEventListener("pointermove", move, true);
        window.removeEventListener("pointerup", finish, true);
        window.removeEventListener("pointercancel", cancel, true);
        document.body.classList.remove("tab-reordering");
        if (commit && active && latestTarget) {
          onReorder(sourceId, latestTarget.id, latestTarget.place);
        }
        setDragId(null);
        setDropTarget(null);
        window.setTimeout(removeClickGuard, 0);
      };
      const finish = () => cleanup(true);
      const cancel = () => cleanup(false);

      const move = (pointer: PointerEvent) => {
        if (pointer.pointerId !== pointerId) return;
        if (!active && Math.hypot(pointer.clientX - startX, pointer.clientY - startY) < 4) {
          return;
        }
        if (!active) {
          active = true;
          try {
            dragHandle.setPointerCapture?.(pointerId);
          } catch {
            // Synthetic pointer events do not own a native pointer stream.
          }
          document.body.classList.add("tab-reordering");
          setDragId(sourceId);
        }
        pointer.preventDefault();
        const rects = Array.from(
          container.current?.querySelectorAll<HTMLElement>("[data-tab-id]") ?? [],
          (element): TabDragRect => {
            const rect = element.getBoundingClientRect();
            return {
              id: element.dataset.tabId ?? "",
              left: rect.left,
              right: rect.right,
              top: rect.top,
              bottom: rect.bottom,
            };
          },
        );
        latestTarget = nearestTabDropTarget(rects, sourceId, pointer.clientX, pointer.clientY);
        setDropTarget(latestTarget);
      };

      window.addEventListener("pointermove", move, { capture: true, passive: false });
      window.addEventListener("pointerup", finish, true);
      window.addEventListener("pointercancel", cancel, true);
      window.addEventListener("click", suppressClick, true);
    },
    [container, onReorder],
  );

  return { dragId, dropTarget, begin };
}
