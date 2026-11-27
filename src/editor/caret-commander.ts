export type CaretCommand =
  | { type: "focus"; position?: number }
  | {
      type: "move";
      key: "ArrowLeft" | "ArrowRight" | "ArrowUp" | "ArrowDown" | "Home" | "End";
    }
  | { type: "delete"; key: "Backspace" | "Delete" }
  | { type: "insertText"; text: string }
  | { type: "commit"; direction?: "before" | "after" }
  | { type: "escape" };

export interface CaretSurfaceHandler {
  element: Element;
  kind: string;
  handle(command: CaretCommand, event?: Event): boolean;
}

const handlers = new Map<Element, CaretSurfaceHandler[]>();

export function registerCaretSurface(handler: CaretSurfaceHandler): () => void {
  const current = handlers.get(handler.element) ?? [];
  handlers.set(handler.element, [...current, handler]);
  return () => {
    const remaining = (handlers.get(handler.element) ?? []).filter(
      (candidate) => candidate !== handler,
    );
    if (remaining.length > 0) handlers.set(handler.element, remaining);
    else handlers.delete(handler.element);
  };
}

function registeredOwner(target: unknown): Element | null {
  if (target && handlers.has(target as Element)) return target as Element;
  let element =
    typeof Element !== "undefined" && target instanceof Element
      ? target
      : (target as { parentElement?: Element | null } | null)?.parentElement ?? null;
  while (element) {
    if (handlers.has(element)) return element;
    element = element.parentElement;
  }
  return null;
}

export function registeredCaretOwner(target: unknown): Element | null {
  return registeredOwner(target);
}

export function dispatchCaretCommand(
  command: CaretCommand,
  event?: Event,
): boolean {
  const target =
    event?.target ??
    (typeof document === "undefined" ? null : document.activeElement);
  const owner = registeredOwner(target);
  if (!owner) return false;
  const stack = handlers.get(owner) ?? [];
  for (let index = stack.length - 1; index >= 0; index -= 1) {
    if (stack[index]?.handle(command, event)) return true;
  }
  return false;
}

export function runWithCaretOwnerPreserved(action: () => void): void {
  const active =
    typeof document === "undefined" ? null : document.activeElement;
  const owner = registeredOwner(active);
  const selection = owner instanceof HTMLInputElement || owner instanceof HTMLTextAreaElement
    ? {
        start: owner.selectionStart,
        end: owner.selectionEnd,
      }
    : null;
  action();
  if (!owner?.isConnected) return;
  const restore = () => {
    if (!owner.isConnected) return;
    (owner as HTMLElement).focus({ preventScroll: true });
    if (
      selection &&
      (owner instanceof HTMLInputElement || owner instanceof HTMLTextAreaElement)
    ) {
      owner.setSelectionRange(selection.start, selection.end);
    }
  };
  restore();
  queueMicrotask(restore);
  globalThis.requestAnimationFrame?.(restore);
}

export function caretCommandFromKeyboard(
  event: Pick<
    KeyboardEvent,
    "key" | "ctrlKey" | "metaKey" | "altKey"
  >,
): CaretCommand | null {
  if (event.ctrlKey || event.metaKey || event.altKey) return null;
  if (
    event.key === "ArrowLeft" ||
    event.key === "ArrowRight" ||
    event.key === "ArrowUp" ||
    event.key === "ArrowDown" ||
    event.key === "Home" ||
    event.key === "End"
  ) {
    return { type: "move", key: event.key };
  }
  if (event.key === "Backspace" || event.key === "Delete") {
    return { type: "delete", key: event.key };
  }
  if (event.key === "Escape") return { type: "escape" };
  if (event.key === "Enter") return { type: "commit", direction: "after" };
  if (event.key === "\\") return { type: "insertText", text: "\\" };
  return null;
}
