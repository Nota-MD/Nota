










export interface DeferredSnapshot {

  touch: () => void;

  flush: () => void;

  cancel: () => void;
}

export interface DeferredSnapshotOptions {

  read: () => string | null;

  deliver: (markdown: string) => void;
  delayMs: number;

  setTimer?: (callback: () => void, delayMs: number) => number;
  clearTimer?: (timer: number) => void;
}

export function createDeferredSnapshot({
  read,
  deliver,
  delayMs,
  setTimer = (callback, delay) => window.setTimeout(callback, delay),
  clearTimer = (timer) => window.clearTimeout(timer),
}: DeferredSnapshotOptions): DeferredSnapshot {
  let timer: number | null = null;

  const cancel = () => {
    if (timer === null) return;
    clearTimer(timer);
    timer = null;
  };

  const flush = () => {
    if (timer === null) return;
    cancel();
    const markdown = read();
    if (markdown !== null) deliver(markdown);
  };

  return {
    touch: () => {
      cancel();
      timer = setTimer(flush, delayMs);
    },
    flush,
    cancel,
  };
}
