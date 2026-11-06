/**
 * Inline-math source sizing and delayed font remeasurement.
 *
 * Imported document themes may load web fonts after the formula NodeView is
 * created. Measuring only once with the fallback face leaves the source input
 * much wider than its final text, pushing the closing delimiter far away.
 */

/**
 * Fit the inline source input to the rendered source text.
 *
 * Character counts are not a valid width: imported document themes use
 * proportional faces, where `\LaTeX` is much narrower than six `ch` units. The
 * old `ch` width also combined with `min-width: 2ch`, leaving a permanent gap
 * before the closing delimiter even when the formula was empty.
 */
export function fitInlineSourceWidth(
  input: HTMLElement,
  ruler: HTMLElement,
  source: string,
  placeholder: string,
): void {
  const text = source || placeholder;
  ruler.textContent = text;
  const measured = ruler.getBoundingClientRect().width;
  // One extra pixel keeps the text caret visible at the end instead of
  // clipping it against the closing `$`. Empty math therefore renders as a
  // one-pixel editable slot, with the surrounding hit zones providing a larger
  // pointer target.
  const width = Number.isFinite(measured) && measured > 0
    ? Math.ceil(measured) + 1
    : 1;
  input.removeAttribute("size");
  input.style.setProperty("--nota-math-source-width", `${width}px`);
  input.style.setProperty("width", `${width}px`, "important");
}

/** Size the visible source control without adding a scrollbar or input frame. */
export function fitMathSourceSize(
  input: HTMLInputElement | HTMLTextAreaElement,
  ruler: HTMLElement,
  inline: boolean,
  source: string,
  placeholder: string,
  hasBlockEditor: boolean,
): void {
  if (inline) {
    fitInlineSourceWidth(input, ruler, source, placeholder);
    return;
  }
  if (hasBlockEditor) return;
  const textarea = input as HTMLTextAreaElement;
  textarea.style.height = "0px";
  const height = textarea.scrollHeight;
  if (Number.isFinite(height) && height > 0) {
    textarea.style.height = `${height}px`;
  }
}

/**
 * Re-run a measurement after fonts settle and after every later font load.
 * Returns an unsubscribe function for NodeView teardown.
 */
export function watchFontMetrics(remeasure: () => void): () => void {
  const fonts = typeof document === "undefined" ? undefined : document.fonts;
  if (!fonts || typeof fonts.addEventListener !== "function") {
    return () => {};
  }
  fonts.addEventListener("loadingdone", remeasure);
  void fonts.ready.then(remeasure);
  return () => fonts.removeEventListener("loadingdone", remeasure);
}

/** Redraw once after the first committed layout, when a NodeView is connected. */
export function redrawAfterMount(
  isConnected: () => boolean,
  redraw: () => void,
): void {
  let finished = false;
  const redrawIfConnected = (remaining: number) => {
    if (finished) return;
    if (isConnected()) {
      finished = true;
      redraw();
      return;
    }
    if (remaining <= 0) return;
    const retry = () => redrawIfConnected(remaining - 1);
    if (globalThis.requestAnimationFrame) {
      globalThis.requestAnimationFrame(retry);
    } else {
      globalThis.setTimeout(retry, 0);
    }
  };
  queueMicrotask(() => redrawIfConnected(8));
}
