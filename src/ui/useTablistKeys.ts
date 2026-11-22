






















import { useEffect, type RefObject } from "react";







export function pageKeyBelowValueItem(totalNumber: number, current: number, key: string): number {
  if (totalNumber <= 0) return -1;
  switch (key) {
    case "Home":
      return 0;
    case "End":
      return totalNumber - 1;
    case "ArrowRight":
      return (current + 1) % totalNumber;
    case "ArrowLeft":
      return (current - 1 + totalNumber) % totalNumber;
    default:
      return -1;
  }
}


function DropPoint(tab: HTMLElement): HTMLElement {
  if (tab.matches("button, a[href], [tabindex]:not([tabindex='-1'])")) return tab;
  return (
    tab.querySelector<HTMLElement>("button, a[href], [tabindex]:not([tabindex='-1'])") ?? tab
  );
}





export function useTablistKeys(ref: RefObject<HTMLElement | null>): void {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.isComposing || e.keyCode === 229) return;
      if (e.key !== "ArrowRight" && e.key !== "ArrowLeft" && e.key !== "Home" && e.key !== "End")
        return;

      const container = ref.current;
      if (!container) return;
      const pageKey = Array.from(container.querySelectorAll<HTMLElement>('[role="tab"]'));
      const active = document.activeElement;
      const current = active ? pageKey.findIndex((tab) => tab === active || tab.contains(active)) : -1;

      if (current < 0) return;

      const belowMark = pageKeyBelowValueItem(pageKey.length, current, e.key);
      const target = belowMark >= 0 ? pageKey[belowMark] : undefined;
      if (!target || belowMark === current) return;
      e.preventDefault();
      DropPoint(target).focus();
    };

    const container = ref.current;
    if (!container) return;
    container.addEventListener("keydown", onKey);
    return () => container.removeEventListener("keydown", onKey);


  }, [ref]);
}
