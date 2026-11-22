
























import { useCallback, useLayoutEffect, useRef, useState, type KeyboardEvent as ReactKeyboardEvent } from "react";


export interface RovingItem {
  disabled?: boolean;
}









export function findNextEnabled(
  items: readonly RovingItem[],
  current: number,
  direction: 1 | -1,
): number {
  const total = items.length;
  if (total === 0) return -1;
  let index = current;
  for (let step = 0; step < total; step++) {
    index = (index + direction + total) % total;
    if (!items[index]?.disabled) return index;
  }

  return current;
}










export function findEdgeEnabled(items: readonly RovingItem[], direction: 1 | -1): number {
  const index =
    direction === 1 ? findNextEnabled(items, items.length - 1, 1) : findNextEnabled(items, 0, -1);
  return index >= 0 && !items[index]?.disabled ? index : -1;
}








function isImeKey(event: KeyboardEvent): boolean {
  return event.isComposing || event.keyCode === 229;
}

export interface UseMenuRovingFocusOptions<T extends RovingItem> {

  items: readonly T[];

  onActivate: (item: T, index: number) => void;

  onDismiss: () => void;







  onCancel?: () => void;





  onRight?: (item: T, index: number) => void;

  onLeft?: () => void;

  enabled?: boolean;


  resetKey?: unknown;
}

export interface UseMenuRovingFocusResult {
  focusedIndex: number;








  setFocusedIndex: (index: number) => void;










  focusItem: (index: number) => void;

  handleKeyDown: (event: ReactKeyboardEvent<HTMLElement>) => void;

  registerItem: (index: number, node: HTMLElement | null) => void;

  itemProps: (index: number) => {
    tabIndex: number;
    onFocus: () => void;
    onMouseEnter: () => void;
  };
}

export function useMenuRovingFocus<T extends RovingItem>({
  items,
  onActivate,
  onDismiss,
  onCancel,
  onRight,
  onLeft,
  enabled = true,
  resetKey,
}: UseMenuRovingFocusOptions<T>): UseMenuRovingFocusResult {
  const [focusedIndex, setFocusedIndex] = useState(-1);
  const itemRefs = useRef<Array<HTMLElement | null>>([]);






  useLayoutEffect(() => {
    const next = enabled ? findEdgeEnabled(items, 1) : -1;
    setFocusedIndex(next);
    if (next >= 0) itemRefs.current[next]?.focus();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, resetKey]);


  useLayoutEffect(() => {
    if (focusedIndex < 0) return;
    itemRefs.current[focusedIndex]?.focus();
  }, [focusedIndex]);

  const handleKeyDown = useCallback(
    (event: ReactKeyboardEvent<HTMLElement>) => {
      if (isImeKey(event.nativeEvent)) return;


      //







      //



      const handled = () => {
        event.preventDefault();
        event.stopPropagation();
      };

      switch (event.key) {
        case "ArrowDown":
          handled();
          setFocusedIndex((i) => findNextEnabled(items, i, 1));
          return;
        case "ArrowUp":
          handled();
          setFocusedIndex((i) => findNextEnabled(items, i, -1));
          return;
        case "Home":
          handled();
          setFocusedIndex(findEdgeEnabled(items, 1));
          return;
        case "End":
          handled();
          setFocusedIndex(findEdgeEnabled(items, -1));
          return;
        case "Escape":
          handled();
          (onCancel ?? onDismiss)();
          return;
        case "Tab":


          handled();
          onDismiss();
          return;
        case "ArrowRight": {

          handled();
          const item = items[focusedIndex];
          if (item) onRight?.(item, focusedIndex);
          return;
        }
        case "ArrowLeft":
          handled();
          onLeft?.();
          return;
        case "Enter":
        case " ": {
          handled();
          const item = items[focusedIndex];
          if (item && !item.disabled) onActivate(item, focusedIndex);
          return;
        }
        default:
          return;
      }
    },
    [items, focusedIndex, onActivate, onDismiss, onCancel, onRight, onLeft],
  );

  const registerItem = useCallback((index: number, node: HTMLElement | null) => {
    itemRefs.current[index] = node;
  }, []);

  const itemProps = useCallback(
    (index: number) => ({
      tabIndex: focusedIndex === index ? 0 : -1,
      onFocus: () => setFocusedIndex(index),


      onMouseEnter: () => {
        if (!items[index]?.disabled) setFocusedIndex(index);
      },
    }),
    [items, focusedIndex],
  );


  const focusItem = useCallback((index: number) => {
    setFocusedIndex(index);
    itemRefs.current[index]?.focus();
  }, []);

  return { focusedIndex, setFocusedIndex, focusItem, handleKeyDown, registerItem, itemProps };
}
