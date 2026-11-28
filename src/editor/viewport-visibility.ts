import type { EditorView } from "@milkdown/kit/prose/view";

import { findScrollContainer } from "./scroll-into-view";

type VisibilityCallback = (near: boolean) => void;

interface ObserverEntry {
  callbacks: Map<Element, VisibilityCallback>;
  observer: IntersectionObserver;
}

const observers = new WeakMap<Element, ObserverEntry>();
const observedScrollers = new WeakSet<Element>();
const pendingVisibility = new Map<VisibilityCallback, boolean>();
let visibilityFrame = 0;
let lastScrollAt = 0;
const scrollSettleMs = 80;
const frameBudgetMs = 8;

function watchScroller(scroll: Element | null): void {
  if (!scroll || observedScrollers.has(scroll)) return;
  observedScrollers.add(scroll);
  scroll.addEventListener(
    "scroll",
    () => {
      lastScrollAt = performance.now();
    },
    { passive: true },
  );
}

function scheduleVisibilityFlush(): void {
  if (visibilityFrame) return;
  visibilityFrame = requestAnimationFrame(function flush() {
    visibilityFrame = 0;
    if (performance.now() - lastScrollAt < scrollSettleMs) {
      window.setTimeout(scheduleVisibilityFlush, scrollSettleMs);
      return;
    }
    const started = performance.now();
    for (const [callback, near] of pendingVisibility) {
      pendingVisibility.delete(callback);
      callback(near);
      if (performance.now() - started >= frameBudgetMs) break;
    }
    if (pendingVisibility.size > 0) scheduleVisibilityFlush();
  });
}

function deliverVisibility(callback: VisibilityCallback, near: boolean): void {
  if (!near) {
    pendingVisibility.delete(callback);
    return;
  }
  pendingVisibility.set(callback, true);
  scheduleVisibilityFlush();
}
const pendingRegistrations = new Set<{
  cancel: () => void;
  run: () => void;
}>();
let registrationFrame = 0;

function scheduleRegistration(run: () => void): () => void {
  const item = {
    cancel: () => {},
    run,
  };
  item.cancel = () => {
    pendingRegistrations.delete(item);
  };
  pendingRegistrations.add(item);
  if (registrationFrame === 0) {
    registrationFrame = requestAnimationFrame(() => {
      registrationFrame = 0;
      const items = [...pendingRegistrations];
      pendingRegistrations.clear();
      for (const pending of items) pending.run();
    });
  }
  return item.cancel;
}

function observerFor(root: Element | null, key: Element): ObserverEntry {
  const existing = observers.get(key);
  if (existing) return existing;
  const callbacks = new Map<Element, VisibilityCallback>();
  const observer = new IntersectionObserver(
    (entries) => {
      for (const entry of entries) {
        const callback = callbacks.get(entry.target);
        if (callback) deliverVisibility(callback, entry.isIntersecting);
      }
    },
    {
      root,
      rootMargin: "100% 0px",
    },
  );
  const entry = { callbacks, observer };
  observers.set(key, entry);
  return entry;
}

/** Observe one NodeView against its editor scroller with a one-screen margin. */
export function observeNearViewport(
  element: Element,
  view: EditorView,
  callback: VisibilityCallback,
): () => void {
  if (typeof IntersectionObserver === "undefined") {
    queueMicrotask(() => callback(true));
    return () => {};
  }
  let stop: (() => void) | null = null;
  const cancelRegistration = scheduleRegistration(() => {
    if (!element.isConnected) return;
    const scroll = findScrollContainer(view.dom);
    const target = scroll ?? view.dom.ownerDocument.documentElement;
    watchScroller(scroll);
    const entry = observerFor(scroll, target);
    entry.callbacks.set(element, callback);
    entry.observer.observe(element);
    stop = () => {
      pendingVisibility.delete(callback);
      entry.callbacks.delete(element);
      entry.observer.unobserve(element);
      if (entry.callbacks.size === 0) entry.observer.disconnect();
    };
  });
  return () => {
    cancelRegistration();
    stop?.();
    stop = null;
  };
}

export function preserveElementAnchor(
  scroller: HTMLElement | null,
  element: Element,
  mutate: () => void,
): void {
  if (!scroller || !element.isConnected) {
    mutate();
    return;
  }
  const before = element.getBoundingClientRect();
  const viewport = scroller.getBoundingClientRect();
  const affectsViewport =
    before.top < viewport.top ||
    (before.bottom >= viewport.top && before.top <= viewport.bottom);
  mutate();
  if (!affectsViewport || !element.isConnected) return;
  const after = element.getBoundingClientRect();
  const difference = after.top - before.top;
  if (Math.abs(difference) >= 1) scroller.scrollTop += difference;
}
