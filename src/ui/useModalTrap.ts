





















































import { useEffect, type RefObject } from "react";







export function focusable(panel: HTMLElement): HTMLElement[] {
  return Array.from(
    panel.querySelectorAll<HTMLElement>(
      'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]),' +
        ' textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
    ),
  ).filter((el) => el.offsetParent !== null);
}


const floatingLayerMark = "[data-context-menu]";








export function atFloatingLayerInside(node: Node | null): boolean {
  return !!(node as Element | null)?.closest?.(floatingLayerMark);
}


export type PitTrapDetermineFixed =

  | { action: "natural motion" }

  | { action: "stay in place" }

  | { action: "send to"; target: HTMLElement };













export function pitTrapDropPoint(cell: HTMLElement[], current: Element | null, reverseToward: boolean): PitTrapDetermineFixed {
  if (cell.length === 0) return { action: "stay in place" };

  const first = cell[0];
  const last = cell[cell.length - 1];

  if (!first || !last) return { action: "stay in place" };




  const atPanelInside = !!current && cell.includes(current as HTMLElement);
  if (!atPanelInside) return { action: "send to", target: reverseToward ? last : first };

  if (reverseToward && current === first) return { action: "send to", target: last };
  if (!reverseToward && current === last) return { action: "send to", target: first };
  return { action: "natural motion" };
}

export interface PopupSealCloseOption {

  onEscape?: () => void;
}








export function useModalTrap(
  panelRef: RefObject<HTMLElement | null>,
  { onEscape, enabled = true }: PopupSealCloseOption & { enabled?: boolean } = {},
): void {
  useEffect(() => {
    if (!enabled) return;
    const onKey = (e: KeyboardEvent) => {




      if (e.isComposing || e.keyCode === 229) return;



      const mostInsideLayer = document.querySelector<HTMLElement>('[data-modal-layer="true"]');
      if (mostInsideLayer && mostInsideLayer !== panelRef.current && !panelRef.current?.contains(mostInsideLayer)) {
        return;
      }



      const expandedCombobox = (e.target as Element | null)?.closest?.(
        '[role="combobox"][aria-haspopup="listbox"][aria-expanded="true"]',
      );
      if (expandedCombobox instanceof HTMLElement && e.key === "Escape") {
        e.preventDefault();
        e.stopPropagation();
        expandedCombobox.click();
        return;
      }




      if (atFloatingLayerInside(document.activeElement)) return;
      if (e.key === "Escape") {
        if (!onEscape) return;
        e.preventDefault();








        e.stopPropagation();
        onEscape();
        return;
      }
      if (e.key !== "Tab") return;

      const panel = panelRef.current;
      if (!panel) return;
      const determineFixed = pitTrapDropPoint(focusable(panel), document.activeElement, e.shiftKey);
      if (determineFixed.action !== "natural motion") e.preventDefault();
      if (determineFixed.action === "send to") determineFixed.target.focus();
    };

    const onFocusIn = (e: FocusEvent) => {
      const panel = panelRef.current;
      const target = e.target as Node | null;
      if (!panel || !target || panel.contains(target)) return;
      // Portal-based descendants of the dialog are still part of its focus
      // scope. Without this, the color picker pulls focus back to the settings
      // panel on the first click and its input cannot receive typing.
      if ((target as Element).closest?.('[data-modal-layer="true"]')) return;


      if (atFloatingLayerInside(target)) return;
      panel.focus();
    };

    window.addEventListener("keydown", onKey, true);
    document.addEventListener("focusin", onFocusIn, true);
    return () => {
      window.removeEventListener("keydown", onKey, true);
      document.removeEventListener("focusin", onFocusIn, true);
    };
  }, [enabled, onEscape, panelRef]);
}
