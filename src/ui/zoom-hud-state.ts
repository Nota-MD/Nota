export interface ZoomHudState {
  serial: number;
  label: string;
  onPlus: () => void;
  onMinus: () => void;
  onReset: () => void;
}

let current: ZoomHudState | null = null;
let serial = 0;
const listeners = new Set<() => void>();

function emit(): void {
  for (const listener of listeners) listener();
}

export function showZoomHud(
  label: string,
  onPlus: () => void,
  onMinus: () => void,
  onReset: () => void,
): void {
  current = { serial: ++serial, label, onPlus, onMinus, onReset };
  emit();
}

export function dismissZoomHud(atSerial: number): void {
  if (current?.serial !== atSerial) return;
  current = null;
  emit();
}

export function subscribeZoomHud(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function currentZoomHud(): ZoomHudState | null {
  return current;
}
