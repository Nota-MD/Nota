















































import type { EditorView } from "@milkdown/kit/prose/view";


const topPartIntervalGap = 8;


















export function findScrollContainer(el: HTMLElement | null): HTMLElement | null {
  for (let current = el?.parentElement ?? null; current; current = current.parentElement) {
    if (canScrollVertically(current)) return current;
  }
  return null;
}


function canScrollVertically(el: HTMLElement): boolean {
  const styleStyle = getComputedStyle(el);
  return /^(auto|scroll)$/.test(styleStyle.overflowY) && el.scrollHeight > el.clientHeight + 1;
}

















export function findEditorAreaScrollContainer(attachLoadPoint: HTMLElement | null): HTMLElement | null {
  if (!attachLoadPoint) return null;
  const sourceShell = attachLoadPoint.querySelector<HTMLElement>(".cm-scroller");
  if (sourceShell && canScrollVertically(sourceShell)) return sourceShell;
  if (/^(auto|scroll)$/.test(getComputedStyle(attachLoadPoint).overflowY)) return attachLoadPoint;
  const first = attachLoadPoint.firstElementChild as HTMLElement | null;
  return findScrollContainer(first);
}











export function readScrollRatio(attachLoadPoint: HTMLElement | null): number | null {
  const container = findEditorAreaScrollContainer(attachLoadPoint);
  if (!container) return null;
  return readElementScrollRatio(container);
}


export function readElementScrollRatio(container: {
  scrollHeight: number;
  clientHeight: number;
  scrollTop: number;
}): number {
  const scrollable = container.scrollHeight - container.clientHeight;


  if (scrollable <= 0) return 0;
  return container.scrollTop / scrollable;
}









export function restoreScrollRatio(attachLoadPoint: HTMLElement | null, ratio: number): void {
  const container = findEditorAreaScrollContainer(attachLoadPoint);
  if (!container) return;
  const scrollable = container.scrollHeight - container.clientHeight;
  if (scrollable <= 0) return;
  const clamp = Math.min(1, Math.max(0, ratio));
  container.scrollTop = scrollable * clamp;
}







export function scrollPositionIntoView(view: EditorView, pos: number): void {
  if (pos < 0 || pos > view.state.doc.content.size) return;
  const { node } = view.domAtPos(pos);
  const element = node.nodeType === Node.ELEMENT_NODE ? (node as HTMLElement) : node.parentElement;
  if (!element) return;
  const container = findScrollContainer(element);
  if (!container) return;
  const difference = element.getBoundingClientRect().top - container.getBoundingClientRect().top;
  container.scrollTop += difference - topPartIntervalGap;
}








export function scrollRangeIntoView(view: EditorView, from: number, to: number): void {
  const container = findScrollContainer(view.dom);
  if (!container) return;
  const above = view.coordsAtPos(from, 1).top;
  const below = view.coordsAtPos(to, -1).bottom;
  const box2 = container.getBoundingClientRect();
  if (above < box2.top + topPartIntervalGap) {
    container.scrollTop -= box2.top + topPartIntervalGap - above;
  } else if (below > box2.bottom - topPartIntervalGap) {
    container.scrollTop += below - box2.bottom + topPartIntervalGap;
  }
}
