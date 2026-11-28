







import type { KatexOptions } from "katex";

let katexPromise: Promise<typeof import("katex").default> | null = null;
let windowShownPromise: Promise<void> | null = null;

function awaitWindowShown(): Promise<void> {
  if (typeof window === "undefined") return Promise.resolve();
  if (document.documentElement.dataset.windowShown === "true") return Promise.resolve();
  windowShownPromise ??= new Promise((resolve) => {
    window.addEventListener("nota-window-shown", () => resolve(), { once: true });
  });
  return windowShownPromise;
}

function getKatex(afterWindow = false): Promise<typeof import("katex").default> {
  katexPromise ??= (afterWindow ? awaitWindowShown() : Promise.resolve()).then(() =>
    // KaTeX does not publish declarations for its mhchem side-effect module.
    // @ts-expect-error The runtime module exists even though its types do not.
    Promise.all([import("katex/dist/contrib/mhchem.mjs"), import("katex")]).then(
      ([, module]) => module.default,
    ),
  );
  return katexPromise;
}





export function preHotKatex(): void {
  void getKatex(true).catch((e: unknown) => {
    console.warn("[nota] KaTeX preload failed; rendering will retry on demand:", e);
    katexPromise = null;
  });
}


export async function renderCommonStyle(
  source2: string,
  target: HTMLElement,
  option: KatexOptions = {},
): Promise<void> {
  // A requested formula is already a definite demand. Do not let a missed
  // startup reveal event leave the preview stuck on "loading" forever.
  const katex = await getKatex(false);
  target.replaceChildren();
  katex.render(source2, target, option);
}

export async function renderCommonStyleHtml(
  source2: string,
  option: KatexOptions = {},
): Promise<string> {
  const katex = await getKatex(false);
  return katex.renderToString(source2, option);
}
