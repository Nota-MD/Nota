




































import { useRef } from "react";

import { useT } from "@/i18n";


export const sideBarWidthDefault = 240;

export const sideBarWidthMostSmall = 180;

export const sideBarWidthMostLarge = 480;





export function clampSidebarWidth(width: number): number {



  if (!Number.isFinite(width)) return sideBarWidthDefault;
  return Math.min(sideBarWidthMostLarge, Math.max(sideBarWidthMostSmall, Math.round(width)));
}

/** Whether dragging has crossed the collapse threshold at the left edge. */
export function shouldCollapseSidebar(width: number, canCollapse: boolean): boolean {
  return canCollapse && Number.isFinite(width) && width < sideBarWidthMostSmall;
}




export function SidebarResizer({
  onCommit,
  onCollapse,
}: {
  onCommit: (width: number) => void;
  onCollapse?: () => void;
}) {
  const t = useT();


  const mostAfter = useRef(sideBarWidthDefault);

  function pressBelow(e: React.PointerEvent<HTMLDivElement>) {
    e.preventDefault();
    const takeHand = e.currentTarget;
    takeHand.setPointerCapture(e.pointerId);
    document.body.classList.add("resizing-col");


    const box2 = takeHand.parentElement?.getBoundingClientRect();
    const leftEdge = box2?.left ?? 0;
    const previousWidth = clampSidebarWidth(box2?.width ?? sideBarWidthDefault);
    mostAfter.current = previousWidth;
    let collapseArmed = false;

    function move(ev: PointerEvent) {
      const rawWidth = ev.clientX - leftEdge;
      collapseArmed = shouldCollapseSidebar(rawWidth, Boolean(onCollapse));
      document.body.classList.toggle("sidebar-collapse-armed", collapseArmed);
      const width = clampSidebarWidth(rawWidth);
      mostAfter.current = width;
      document.documentElement.style.setProperty("--sidebar-width", `${width}px`);
    }

    function receive(commit: boolean) {
      takeHand.removeEventListener("pointermove", move);
      takeHand.removeEventListener("pointerup", finish);
      takeHand.removeEventListener("pointercancel", cancel);
      document.body.classList.remove("resizing-col");
      document.body.classList.remove("sidebar-collapse-armed");
      if (commit && collapseArmed) {
        document.documentElement.style.setProperty("--sidebar-width", `${previousWidth}px`);
        onCollapse?.();
      } else if (commit) {
        onCommit(mostAfter.current);
      } else {
        document.documentElement.style.setProperty("--sidebar-width", `${previousWidth}px`);
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
      className="sidebar-resizer"
      role="separator"
      aria-orientation="vertical"


      aria-label={t("Resize the sidebar")}
      onPointerDown={pressBelow}
    />
  );
}
