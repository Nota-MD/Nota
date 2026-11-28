






const bufferSaveLimit = 50;


type mode = "light" | "dark";

export interface ImageTableTheme {
  mode: mode;
  accent: string;
  fontFamily: string;
  fontSize: number;

  key: string;
}




export type RenderResult =
  | { state: "ok"; imageShape: string }
  | { state: "error"; clearMessage: string };

interface BufferSaveItem {

  source2: string;
  result2: RenderResult;
}


const bufferSave = new Map<string, BufferSaveItem>();

export function checkBufferSave(key: string, source2: string): RenderResult | null {
  const match = bufferSave.get(key);
  if (!match || match.source2 !== source2) return null;

  bufferSave.delete(key);
  bufferSave.set(key, match);
  return match.result2;
}

export function writeBufferSave(key: string, source2: string, result2: RenderResult): void {
  bufferSave.delete(key);
  bufferSave.set(key, { source2, result2 });
  while (bufferSave.size > bufferSaveLimit) {
    const mostOld = bufferSave.keys().next();
    if (mostOld.done) break;
    bufferSave.delete(mostOld.value);
  }
}


let renderIndex = 0;


let renderChain: Promise<unknown> = Promise.resolve();

let initializedThemeKey = "";

export function mermaidConfigurationKey(theme: ImageTableTheme, mindmap: boolean): string {
  return `${theme.key}|${mindmap ? "mindmap" : "diagram"}`;
}

function arrangeQueue<T>(taskTask: () => Promise<T>): Promise<T> {

  const result2 = renderChain.then(taskTask, taskTask);
  renderChain = result2.then(
    () => undefined,
    () => undefined,
  );
  return result2;
}















export async function render(source2: string, theme: ImageTableTheme): Promise<RenderResult> {
  return arrangeQueue(async () => {
    const mermaid = (await import("mermaid")).default;
    const mindmap = imageTableType(source2) === "mindmap";
    const diagramText = theme.mode === "dark" ? "#f4f2ee" : "#202124";
    const diagramPaper = theme.mode === "dark" ? "#202327" : "#ffffff";
    const labelCss = `
      .edgeLabel,
      .edgeLabel p,
      .edgeLabel span,
      .edgeLabel foreignObject div {
        color: ${diagramText} !important;
        fill: ${diagramText} !important;
        opacity: 1 !important;
        visibility: visible !important;
      }
      .edgeLabel rect,
      .edgeLabel .labelBkg {
        fill: ${diagramPaper} !important;
        opacity: 1 !important;
      }
      foreignObject > div,
      .nodeLabel,
      .labelBkg {
        overflow: visible !important;
      }
    `;




    const configurationKey = mermaidConfigurationKey(theme, mindmap);
    if (initializedThemeKey !== configurationKey) {
      mermaid.initialize({
        startOnLoad: false,
        theme: "base",
        fontFamily: theme.fontFamily,
        fontSize: theme.fontSize,
        flowchart: {
          // WebKitGTK can keep a zero-sized foreignObject for edge labels even
          // when Chrome reports a valid box. Native SVG text follows the same
          // viewBox and remains visible across WebViews and document themes.
          htmlLabels: false,
        },
        themeVariables: mindmap
          ? thinkDimensionGuideImageConfigureColor(theme.mode, theme.accent)
          : diagramThemeVariables(theme),
        themeCSS: mindmap
          ? `${labelCss}
             .mindmap-edges path, .mindmap-edges .edge {
               stroke: ${theme.mode === "dark" ? "#9dadbf" : "#60768c"} !important;
               stroke-width: 3px !important;
             }
             .mindmap-node text,
             .mindmap-node tspan {
               text-anchor: middle !important;
               dominant-baseline: middle;
             }
             .mindmap-node foreignObject > div,
             .mindmap-node .nodeLabel,
             .mindmap-node .labelBkg {
               text-align: center !important;
               justify-content: center !important;
             }`
          : labelCss,
      });
      initializedThemeKey = configurationKey;
    }

    const editNumber = `nota-mermaid-${++renderIndex}`;
    try {


      const { svg } = await mermaid.render(editNumber, source2);
      return { state: "ok", imageShape: svg };
    } catch (e) {
      clearRemoveRemnantKeep(editNumber);
      return { state: "error", clearMessage: raiseGetClearMessage(e) };
    }
  });
}











function clearRemoveRemnantKeep(editNumber: string): void {


  for (const id of [`d${editNumber}`, `i${editNumber}`, editNumber]) {
    document.getElementById(id)?.remove();
  }
}








function raiseGetClearMessage(e: unknown): string {
  if (e instanceof Error && e.message) return e.message;
  if (typeof e === "string") return e;

  const shapeLikeError = e as { message?: unknown; str?: unknown } | null;
  if (shapeLikeError) {
    if (typeof shapeLikeError.message === "string" && shapeLikeError.message) return shapeLikeError.message;
    if (typeof shapeLikeError.str === "string" && shapeLikeError.str) return shapeLikeError.str;
  }
  return String(e);
}








function normalizeColor(value2: string): [number, number, number] | null {
  if (!value2) return null;
  const aboveBelowText = document.createElement("canvas").getContext("2d");
  if (!aboveBelowText) return null;



  aboveBelowText.fillStyle = "#010203";
  aboveBelowText.fillStyle = value2;
  const normalize = aboveBelowText.fillStyle;
  if (normalize === "#010203") return null;


  const tenSix = /^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(normalize);
  if (tenSix) {
    const [, r, g, b] = tenSix;
    if (r && g && b) {
      return [parseInt(r, 16) / 255, parseInt(g, 16) / 255, parseInt(b, 16) / 255];
    }
  }
  const functionNumberStyle = /^rgba?\((\d+)[,\s]+(\d+)[,\s]+(\d+)/.exec(normalize);
  if (functionNumberStyle) {
    const [, r, g, b] = functionNumberStyle;
    if (r && g && b) {
      return [Number(r) / 255, Number(g) / 255, Number(b) / 255];
    }
  }
  return null;
}

function twoDigits(value2: number): string {
  return Math.round(Math.min(1, Math.max(0, value2)) * 255)
    .toString(16)
    .padStart(2, "0");
}

function colorHex(throughWay: [number, number, number]): string {
  const [r, g, b] = throughWay;
  return `#${twoDigits(r)}${twoDigits(g)}${twoDigits(b)}`;
}

function colorToHsl(throughWay: [number, number, number]): { h: number; s: number; l: number } {
  const [r, g, b] = throughWay;
  const large = Math.max(r, g, b);
  const small = Math.min(r, g, b);
  const difference = large - small;
  const l = (large + small) / 2;
  if (difference === 0) return { h: 0, s: 0, l };
  const s = l > 0.5 ? difference / (2 - large - small) : difference / (large + small);
  let h: number;
  if (large === r) h = (g - b) / difference + (g < b ? 6 : 0);
  else if (large === g) h = (b - r) / difference + 2;
  else h = (r - g) / difference + 4;
  return { h: h * 60, s, l };
}

function hslColor(h: number, s: number, l: number): string {
  const hue = (((h % 360) + 360) % 360) / 360;
  const saturation = Math.max(0, Math.min(1, s));
  const lightness = Math.max(0, Math.min(1, l));
  if (saturation === 0) return colorHex([lightness, lightness, lightness]);
  const q = lightness < 0.5 ? lightness * (1 + saturation) : lightness + saturation - lightness * saturation;
  const p = 2 * lightness - q;
  const shareMeasure = (offset: number): number => {
    let t = hue + offset;
    if (t < 0) t += 1;
    if (t > 1) t -= 1;
    if (t < 1 / 6) return p + (q - p) * 6 * t;
    if (t < 1 / 2) return q;
    if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
    return p;
  };
  return colorHex([shareMeasure(1 / 3), shareMeasure(0), shareMeasure(-1 / 3)]);
}





function imageTableType(source2: string): string {
  let configurePlaceBlock = false;
  for (const originalLine of source2.split(/\r?\n/)) {
    const line3 = originalLine.trim();
    if (!line3 || line3.startsWith("%%")) continue;
    if (line3 === "---") {
      configurePlaceBlock = !configurePlaceBlock;
      continue;
    }
    if (configurePlaceBlock) continue;
    return line3.split(/\s+/, 1)[0]?.toLowerCase() ?? "";
  }
  return "";
}














function thinkDimensionGuideImageConfigureColor(mode: mode, accent: string): Record<string, string | boolean> {
  const throughWay = normalizeColor(accent) ?? [0.208, 0.518, 0.894];
  const { h, s } = colorToHsl(throughWay);
  const saturation = Math.min(0.42, Math.max(0.2, s * 0.72 + 0.08));
  const dark = mode === "dark";
  const branchHue = [-32, 0, 26, -54, 48, 72, -74, 14, 38, -44, 58, -16];
  const lightLuminance = [0.76, 0.81, 0.78, 0.84, 0.79, 0.82, 0.77, 0.83, 0.8, 0.75, 0.82, 0.78];
  const darkLuminance = [0.23, 0.27, 0.2, 0.29, 0.25, 0.22, 0.31, 0.24, 0.28, 0.19, 0.26, 0.21];
  const text3 = dark ? "#f4f2ee" : "#202124";
  const border = dark ? "#718094" : "#9aa9b8";
  const rootBottom = hslColor(h, Math.min(0.48, saturation + 0.08), dark ? 0.38 : 0.68);
  const rootCharacter = text3;
  const paper = dark ? "#202327" : "#ffffff";
  const surface = dark ? "#292e34" : "#f5f7f9";
  const changeMeasure: Record<string, string | boolean> = {
    darkMode: dark,
    fontFamily: "sans-serif",
    fontSize: "14px",
    background: "transparent",
    primaryColor: rootBottom,
    primaryTextColor: text3,
    primaryBorderColor: border,
    mainBkg: surface,
    nodeBkg: surface,
    nodeBorder: border,
    nodeTextColor: text3,
    lineColor: dark ? "#9dadbf" : "#60768c",
    defaultLinkColor: dark ? "#9dadbf" : "#60768c",
    edgeLabelBackground: paper,
    clusterBkg: surface,
    clusterBorder: border,
    titleColor: text3,
    secondaryColor: hslColor(h + 24, saturation, dark ? 0.22 : 0.8),
    secondaryTextColor: text3,
    secondaryBorderColor: border,
    tertiaryColor: hslColor(h - 28, saturation, dark ? 0.26 : 0.8),
    tertiaryTextColor: text3,
    tertiaryBorderColor: border,
    noteBkgColor: dark ? "#393b2c" : "#fff7c9",
    noteTextColor: dark ? "#f7f1c7" : "#3d3420",
    noteBorderColor: dark ? "#77734d" : "#d8ca82",
    textColor: text3,
    labelTextColor: text3,
    scaleLabelColor: text3,
    git0: rootBottom,
    gitBranchLabel0: rootCharacter,
    git1: hslColor(h + 24, saturation, dark ? 0.64 : 0.7),
    git2: hslColor(h - 28, saturation, dark ? 0.56 : 0.74),
  };

  for (let i = 0; i < branchHue.length; i += 1) {
    const hue = h + (branchHue[i] ?? 0);
    const targetLightness = (dark ? darkLuminance : lightLuminance)[i] ?? (dark ? 0.24 : 0.8);
    const inputLightness = dark ? targetLightness + 0.75 : targetLightness + 0.25;
    changeMeasure[`cScale${i}`] = hslColor(hue, saturation, inputLightness);
    changeMeasure[`cScaleInv${i}`] = hslColor(hue, Math.min(0.48, saturation + 0.08), dark ? 0.72 : 0.34);
    changeMeasure[`cScaleLabel${i}`] = text3;
  }
  return changeMeasure;
}

/** Shared flowchart/sequence palette derived from the active document theme. */
function diagramThemeVariables(theme: ImageTableTheme): Record<string, string | boolean> {
  const throughWay = normalizeColor(theme.accent) ?? [0.208, 0.518, 0.894];
  const { h, s } = colorToHsl(throughWay);
  const dark = theme.mode === "dark";
  const text3 = dark ? "#f4f2ee" : "#202124";
  const paper = dark ? "#202327" : "#ffffff";
  const surface = dark ? "#292e34" : hslColor(h, Math.min(0.42, s * 0.35 + 0.08), 0.94);
  const primary = dark ? hslColor(h, Math.min(0.48, s * 0.65 + 0.1), 0.28) : surface;
  const border = dark ? hslColor(h, 0.32, 0.58) : hslColor(h, 0.42, 0.48);
  return {
    darkMode: dark,
    fontFamily: theme.fontFamily,
    fontSize: `${theme.fontSize}px`,
    background: "transparent",
    primaryColor: primary,
    primaryTextColor: text3,
    primaryBorderColor: border,
    secondaryColor: surface,
    secondaryTextColor: text3,
    secondaryBorderColor: border,
    tertiaryColor: surface,
    tertiaryTextColor: text3,
    tertiaryBorderColor: border,
    mainBkg: primary,
    nodeBkg: primary,
    nodeBorder: border,
    nodeTextColor: text3,
    textColor: text3,
    lineColor: dark ? "#9dadbf" : hslColor(h, 0.26, 0.42),
    defaultLinkColor: dark ? "#9dadbf" : hslColor(h, 0.26, 0.42),
    edgeLabelBackground: paper,
    clusterBkg: paper,
    clusterBorder: border,
    titleColor: text3,
    labelTextColor: text3,
    noteBkgColor: dark ? "#393b2c" : "#fff7c9",
    noteTextColor: dark ? "#f7f1c7" : "#3d3420",
    noteBorderColor: dark ? "#77734d" : "#d8ca82",
  };
}










function readChangeMeasure(element: HTMLElement | null | undefined, name3: string): string {
  if (!element || !element.isConnected) return "";
  return getComputedStyle(element).getPropertyValue(name3).trim();
}
















function readMode(selfSelfOfRoot: HTMLElement, viewRoot: HTMLElement | null | undefined): mode {
  const bottomColor =
    readChangeMeasure(selfSelfOfRoot, "--doc-bg") ||
    readChangeMeasure(viewRoot, "--doc-bg") ||
    readChangeMeasure(selfSelfOfRoot, "--bg-color") ||
    readChangeMeasure(viewRoot, "--bg-color") ||
    readChangeMeasure(selfSelfOfRoot, "--surface-color") ||
    readChangeMeasure(viewRoot, "--surface-color") ||
    readChangeMeasure(selfSelfOfRoot, "--bg") ||
    readChangeMeasure(viewRoot, "--bg");
  const throughWay = normalizeColor(bottomColor);
  if (!throughWay) return "light";
  const [r, g, b] = throughWay;

  return 0.2126 * r + 0.7152 * g + 0.0722 * b < 0.5 ? "dark" : "light";
}





export function readDiagramTheme(selfSelfOfRoot: HTMLElement, viewRoot: HTMLElement): ImageTableTheme {
  const mode = readMode(selfSelfOfRoot, viewRoot);
  const strongConfigure =
    normalizeColor(readChangeMeasure(selfSelfOfRoot, "--accent")) ??
    normalizeColor(readChangeMeasure(viewRoot, "--accent")) ??
    normalizeColor(readChangeMeasure(selfSelfOfRoot, "--link-color")) ??
    normalizeColor(readChangeMeasure(viewRoot, "--link-color")) ??
    ([0.208, 0.518, 0.894] as [number, number, number]);
  const accent = colorHex(strongConfigure);
  const style =
    selfSelfOfRoot.isConnected
      ? getComputedStyle(selfSelfOfRoot)
      : getComputedStyle(viewRoot);
  const fontFamily =
    readChangeMeasure(selfSelfOfRoot, "--font-doc") ||
    readChangeMeasure(viewRoot, "--font-doc") ||
    readChangeMeasure(selfSelfOfRoot, "--font-family") ||
    readChangeMeasure(viewRoot, "--font-family") ||
    style.fontFamily ||
    "sans-serif";
  const fontSize = Math.max(10, Number.parseFloat(style.fontSize) || 16);
  return {
    mode,
    accent,
    fontFamily,
    fontSize,
    key: `${mode}|${accent}|${fontFamily}|${fontSize}`,
  };
}















const activityView = new Set<() => void>();
let themeObserver: MutationObserver | null = null;

export function followAboveTheme(returnConfigure: () => void): void {
  activityView.add(returnConfigure);
  if (themeObserver) return;

  themeObserver = new MutationObserver(() => {
    for (const returnConfigure of activityView) returnConfigure();
  });
  themeObserver.observe(document.documentElement, {
    attributes: true,
    attributeFilter: ["data-ui-mode", "data-ui-style", "style"],
  });
  themeObserver.observe(document.head, { childList: true, subtree: true });
}

export function distinguishAgainFollowDone(returnConfigure: () => void): void {
  activityView.delete(returnConfigure);
  if (activityView.size === 0) {
    themeObserver?.disconnect();
    themeObserver = null;
  }
}
