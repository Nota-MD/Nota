/** Versioned KaTeX rendering into one reusable preview/render target. */

import type { KatexOptions } from "katex";

import { renderCommonStyleHtml } from "./katex-runtime";
import { raiseGetClearMessage } from "./math-view-source";

const renderVersions = new WeakMap<HTMLElement, number>();

export function createEmptyMathPosition(inline: boolean, text: string): HTMLElement {
  const card = document.createElement(inline ? "span" : "div");
  card.className = "nota-math-note";
  card.textContent = text;
  return card;
}

export function drawLatestMath(
  target: HTMLElement,
  source: string,
  option: KatexOptions,
): Promise<void> {
  if (target.dataset.source === source && target.dataset.state !== "") {
    return Promise.resolve();
  }
  target.dataset.source = source;
  const version = (renderVersions.get(target) ?? 0) + 1;
  renderVersions.set(target, version);
  target.dataset.state = "loading";
  return renderCommonStyleHtml(source, option)
    .then((html) => {
      if (renderVersions.get(target) !== version) return;
      target.innerHTML = html;
      target.dataset.state = "ok";
    })
    .catch((error: unknown) => {
      if (renderVersions.get(target) !== version) return;
      target.dataset.state = "error";
      target.textContent = raiseGetClearMessage(error);
    });
}

export function clearLatestMath(target: HTMLElement): void {
  renderVersions.set(target, (renderVersions.get(target) ?? 0) + 1);
  target.replaceChildren();
  target.dataset.state = "";
  delete target.dataset.source;
}
