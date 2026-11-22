




































const popupSelectChooseDevice = ".menu-popup, .menu-sub, [data-context-menu]";







export function popupSelfSelfAtRoll(target: EventTarget | null): boolean {
  const el = target as Element | null;
  if (!el || typeof el.closest !== "function") return false;
  return el.closest(popupSelectChooseDevice) !== null;
}
