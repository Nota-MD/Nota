

















import { useRef } from "react";

import { useT } from "@/i18n";


export const rightBarWidthDefault = 260;

export const rightBarWidthMostSmall = 200;

export const rightBarWidthMostLarge = 560;





export function clampRightBarWidth(width: number): number {



  if (!Number.isFinite(width)) return rightBarWidthDefault;
  return Math.min(rightBarWidthMostLarge, Math.max(rightBarWidthMostSmall, Math.round(width)));
}

/** Whether dragging has crossed the collapse threshold at the right edge. */
export function shouldCollapseRightBar(width: number, canCollapse: boolean): boolean {
  return canCollapse && Number.isFinite(width) && width < rightBarWidthMostSmall;
}


export function DockResizer({
  onCommit,
  onCollapse,
}: {
  onCommit: (width: number) => void;
  onCollapse?: () => void;
}) {
  const t = useT();
  const mostAfter = useRef(rightBarWidthDefault);

  function pressBelow(e: React.PointerEvent<HTMLDivElement>) {
    e.preventDefault();
    const takeHand = e.currentTarget;
    takeHand.setPointerCapture(e.pointerId);
    document.body.classList.add("resizing-col");
    const box2 = takeHand.parentElement?.getBoundingClientRect();
    const rightEdge = box2?.right ?? window.innerWidth;
    const previousWidth = clampRightBarWidth(box2?.width ?? rightBarWidthDefault);
    mostAfter.current = previousWidth;
    let collapseArmed = false;

    function move(ev: PointerEvent) {
      const rawWidth = rightEdge - ev.clientX;
      collapseArmed = shouldCollapseRightBar(rawWidth, Boolean(onCollapse));
      document.body.classList.toggle("dock-collapse-armed", collapseArmed);
      const width = clampRightBarWidth(rawWidth);
      mostAfter.current = width;
      document.documentElement.style.setProperty("--dock-width", `${width}px`);
    }

    function receive(commit: boolean) {
      takeHand.removeEventListener("pointermove", move);
      takeHand.removeEventListener("pointerup", finish);
      takeHand.removeEventListener("pointercancel", cancel);
      document.body.classList.remove("resizing-col");
      document.body.classList.remove("dock-collapse-armed");
      if (commit && collapseArmed) {
        document.documentElement.style.setProperty("--dock-width", `${previousWidth}px`);
        onCollapse?.();
      } else if (commit) {
        onCommit(mostAfter.current);
      } else {
        document.documentElement.style.setProperty("--dock-width", `${previousWidth}px`);
      }
    }
    const finish = () => receive(true);
    const cancel = () => receive(false);

    takeHand.addEventListener("pointermove", move);
    takeHand.addEventListener("pointerup", finish);
    takeHand.addEventListener("pointercancel", cancel);
  }

  return (
    <div
      className="dock-resizer"
      role="separator"
      aria-orientation="vertical"
      aria-label={t("Resize the extension dock")}
      onPointerDown={pressBelow}
    />
  );
}
