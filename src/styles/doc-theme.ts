














































import { replaceInlineStyle } from "./inline-style";


const ANCHOR = ".editor-pane";
const CONTENT = `${ANCHOR} .editor-mount .ProseMirror`;


const STYLE_ID = "nota-doc-theme";


const ROOT_LIKE_RE = /^(:root|html|body)$/i;


const LEADING_ROOT_RE = /^(?:html|body)\b\s*/i;

const TYPORA_CODE_TOKEN_SELECTORS: readonly [RegExp, string][] = [
  [/\.cm-keyword\b/g, ".token.keyword"],
  [/\.cm-operator\b/g, ".token.operator"],
  [/\.cm-tag\b/g, ".token.tag"],
  [/\.cm-attr-name\b/g, ".token.attr-name"],
  [/\.cm-attribute\b/g, ".token.attr-value"],
  [/\.cm-property\b/g, ".token.property"],
  [/\.cm-builtin\b/g, ".token.builtin"],
  [/\.cm-def\b/g, ".token.function"],
  [/\.cm-qualifier\b/g, ".token.class-name"],
  [/\.cm-string(?:-2)?\b/g, ".token.string"],
  [/\.cm-number\b/g, ".token.number"],
  [/\.cm-atom\b/g, ".token.constant"],
  [/\.cm-variable-(?:2|3)\b/g, ".token.class-name"],
  [/\.cm-variable\b/g, ".token.variable"],
  [/\.cm-type\b/g, ".token.class-name"],
  [/\.cm-comment\b/g, ".token.comment"],
  [/\.cm-meta\b/g, ".token.comment"],
  [/\.cm-link\b/g, ".token.url"],
  [/\.cm-punctuation\b/g, ".token.punctuation"],
  [/\.cm-positive\b/g, ".token.inserted"],
  [/\.cm-negative\b/g, ".token.deleted"],
];

/**
 * Stable Typora structural aliases.
 *
 * These are DOM-shape differences, not theme-specific patches. Keep this list
 * narrow: a selector that cannot be mapped without guessing is left unchanged.
 */
const TYPORA_STRUCTURE_SELECTORS: readonly [RegExp, string][] = [
  // Milkdown keeps the GFM header row inside <tbody>, marked as data-is-header.
  [/\bthead\b(?:\s*>?\s*tr\b)?/g, "tr[data-is-header]"],
  [/\.md-inline-math\b/g, ".nota-math-inline"],
  [/\.md-task-list-item\b/g, '[data-item-type="task"]'],
  [/\.md-table-wrap\b/g, ".tableWrapper"],
  [/\.md-alert\b/g, ".nota-github-alert"],
  [/\.md-htmlblock\b/g, ".nota-html-block"],
  [/\.md-rawblock-container\b/g, ".nota-html-render"],
];

/**
 * Typora themes publish their document colours under Typora's own variable
 * names. Nota's editor chrome consumes a smaller semantic set. Keep the
 * source CSS untouched, then alias the variables only inside the document
 * scope so third-party colours cannot leak into the application shell.
 */
export function typoraCompatibilityCss(css: string): string {
  const hasTyporaVariables =
    /--(?:bg-color|text-color|code-bg-color|syntax-keyword-color)\s*:/.test(css);
  if (!hasTyporaVariables) return "";

  return `${ANCHOR} {
  --doc-bg: var(--bg-color, var(--surface-color, #ffffff));
  --doc-fg: var(--text-color, #000000);
  --fg: var(--text-color, #000000);
  --fg-muted: var(--muted-text-color, var(--text-color, #4d4d4d));
  --fg-faint: var(--meta-text-color, var(--muted-text-color, #707070));
  --border: var(--line-color, var(--code-border-color, rgba(0, 0, 0, 0.16)));
  --border-strong: var(--strong-line-color, var(--line-color, rgba(0, 0, 0, 0.32)));
  --bg-subtle: var(--code-bg-color, var(--surface-color, #fbfaf7));
  --bg-raised: var(--surface-color, var(--code-bg-color, #f7f4ee));
  --accent: var(--link-color, var(--text-color, #1d12e2));
  --link: var(--link-color, var(--accent));
  --font-doc: var(--font-family, serif);
  --font-mono: var(--monospace, monospace);
  --font-math: var(--math-font, var(--monospace, serif));
  --code-comment: var(--syntax-comment-color, var(--muted-text-color));
  --code-keyword: var(--syntax-keyword-color, var(--text-color));
  --code-string: var(--syntax-string-color, var(--text-color));
  --code-number: var(--syntax-number-color, var(--text-color));
  --code-function: var(--syntax-type-color, var(--syntax-keyword-color, var(--text-color)));
  --code-attr: var(--syntax-type-color, var(--syntax-keyword-color, var(--text-color)));
  --code-tag: var(--syntax-keyword-color, var(--text-color));
}

${ANCHOR} .editor-mount .ProseMirror :is(p, li, blockquote, td, th) {
  text-align: start;
}`;
}

const CODE_SURFACE_PROPERTIES = [
  "background",
  "background-color",
  "color",
  "border",
  "border-color",
  "border-radius",
  "box-shadow",
] as const;

function targetsPreElement(selector: string): boolean {
  return splitTop(selector).some(
    (part) =>
      !/:hover\b/.test(part) &&
      /(?:^|[\s>+~])pre(?:[.#:[][^,\s>+~]*)?\s*$/.test(part.trim()),
  );
}

function codeSurfaceThemeCss(css: string): string {
  const cleaned = css.replace(AT_IMPORT_RE, "");
  if (!cleaned.trim()) return "";
  const sheet = new CSSStyleSheet();
  try {
    sheet.replaceSync(cleaned);
  } catch {
    return "";
  }
  const declarations = new Map<string, string>();
  for (const rule of Array.from(sheet.cssRules)) {
    if (rule.type !== CSSRule.STYLE_RULE) continue;
    const styleRule = rule as CSSStyleRule;
    if (!targetsPreElement(styleRule.selectorText)) continue;
    for (const property of CODE_SURFACE_PROPERTIES) {
      const value = styleRule.style.getPropertyValue(property).trim();
      if (value) declarations.set(property, value);
    }
  }
  if (!declarations.size) return "";
  return `${ANCHOR} .editor-mount .ProseMirror :is(pre, .nota-code-theme-surface) {
${Array.from(declarations, ([property, value]) => `  ${property}: ${value} !important;`).join("\n")}
}`;
}

export interface RgbaColor {
  r: number;
  g: number;
  b: number;
  a: number;
}

export interface SelectionPalette {
  background: RgbaColor;
  ink: RgbaColor;
  outline: RgbaColor;
  backgroundContrast: number;
  inkContrast: number;
  outlineContrast: number;
}

const DARK_SELECTION_INK: RgbaColor = { r: 22, g: 22, b: 22, a: 1 };
const LIGHT_SELECTION_INK: RgbaColor = { r: 244, g: 244, b: 244, a: 1 };
const MIN_SELECTION_BACKGROUND_CONTRAST = 2.5;

function clampChannel(value: number): number {
  return Math.max(0, Math.min(255, Math.round(value)));
}

function channel(value: string, scale: number): number {
  return value.endsWith("%")
    ? (Number.parseFloat(value) / 100) * 255
    : Number.parseFloat(value) * scale;
}

export function parseColor(value: string): RgbaColor | null {
  const text = value.trim().toLowerCase();
  const hex = /^#([0-9a-f]{3,8})$/.exec(text);
  if (hex) {
    let digits = hex[1] ?? "";
    if (digits.length === 3 || digits.length === 4) {
      digits = digits
        .slice(0, 3)
        .split("")
        .map((digit) => digit + digit)
        .join("");
    }
    if (digits.length === 6 || digits.length === 8) {
      return {
        r: Number.parseInt(digits.slice(0, 2), 16),
        g: Number.parseInt(digits.slice(2, 4), 16),
        b: Number.parseInt(digits.slice(4, 6), 16),
        a: digits.length === 8 ? Number.parseInt(digits.slice(6, 8), 16) / 255 : 1,
      };
    }
  }
  const rgb = /^rgba?\((.*)\)$/.exec(text);
  if (!rgb) return null;
  const parts = (rgb[1] ?? "")
    .replaceAll(",", " ")
    .replace("/", " ")
    .split(/\s+/)
    .filter(Boolean);
  if (parts.length < 3) return null;
  const alpha = parts[3]?.endsWith("%")
    ? Number.parseFloat(parts[3]) / 100
    : parts[3] === undefined
      ? 1
      : Number.parseFloat(parts[3]);
  return {
    r: clampChannel(channel(parts[0] ?? "0", 1)),
    g: clampChannel(channel(parts[1] ?? "0", 1)),
    b: clampChannel(channel(parts[2] ?? "0", 1)),
    a: Number.isFinite(alpha) ? Math.max(0, Math.min(1, alpha)) : 1,
  };
}

export function contrastRatio(a: RgbaColor, b: RgbaColor): number {
  const luminance = (color: RgbaColor): number => {
    const linear = (value: number): number => {
      const unit = value / 255;
      return unit <= 0.03928 ? unit / 12.92 : ((unit + 0.055) / 1.055) ** 2.4;
    };
    return (
      0.2126 * linear(color.r) +
      0.7152 * linear(color.g) +
      0.0722 * linear(color.b)
    );
  };
  const left = luminance(a);
  const right = luminance(b);
  return (Math.max(left, right) + 0.05) / (Math.min(left, right) + 0.05);
}

function blend(base: RgbaColor, top: RgbaColor, amount: number): RgbaColor {
  const alpha = Math.max(0, Math.min(1, amount));
  return {
    r: clampChannel(base.r + (top.r - base.r) * alpha),
    g: clampChannel(base.g + (top.g - base.g) * alpha),
    b: clampChannel(base.b + (top.b - base.b) * alpha),
    a: 1,
  };
}

function over(background: RgbaColor, foreground: RgbaColor): RgbaColor {
  return foreground.a >= 1 ? { ...foreground, a: 1 } : blend(background, foreground, foreground.a);
}

function betterInk(background: RgbaColor, preferred: RgbaColor): RgbaColor {
  if (contrastRatio(background, preferred) >= 4.5) return preferred;
  return contrastRatio(background, DARK_SELECTION_INK) >= contrastRatio(background, LIGHT_SELECTION_INK)
    ? DARK_SELECTION_INK
    : LIGHT_SELECTION_INK;
}

function ensureOutline(accent: RgbaColor, background: RgbaColor): RgbaColor {
  if (contrastRatio(accent, background) >= 3) return { ...accent, a: 1 };
  const target =
    contrastRatio(DARK_SELECTION_INK, background) >=
    contrastRatio(LIGHT_SELECTION_INK, background)
      ? DARK_SELECTION_INK
      : LIGHT_SELECTION_INK;
  let result = { ...accent, a: 1 };
  for (let step = 1; step <= 20; step += 1) {
    result = blend(accent, target, step / 20);
    if (contrastRatio(result, background) >= 3) return result;
  }
  return target;
}

export function adaptiveSelectionPalette(
  pageBackground: RgbaColor,
  accent: RgbaColor,
  requestedBackground = accent,
  requestedInk = DARK_SELECTION_INK,
): SelectionPalette {
  const requested = over(pageBackground, requestedBackground);
  let background =
    contrastRatio(requested, pageBackground) >= MIN_SELECTION_BACKGROUND_CONTRAST &&
    contrastRatio(requested, requestedInk) >= 4.5
      ? requested
      : pageBackground;
  let ink = betterInk(background, requestedInk);

  if (background === pageBackground) {
    for (let step = 1; step <= 16; step += 1) {
      const candidate = blend(pageBackground, accent, step / 25);
      const candidateInk = betterInk(candidate, requestedInk);
      if (
        contrastRatio(candidate, pageBackground) >= MIN_SELECTION_BACKGROUND_CONTRAST &&
        contrastRatio(candidate, candidateInk) >= 4.5
      ) {
        background = candidate;
        ink = candidateInk;
        break;
      }
    }
  }

  if (contrastRatio(background, pageBackground) < MIN_SELECTION_BACKGROUND_CONTRAST) {
    background = accent.a > 0 ? { ...accent, a: 1 } : LIGHT_SELECTION_INK;
    ink = betterInk(background, requestedInk);
  }
  const outline = ensureOutline(accent, pageBackground);
  return {
    background,
    ink,
    outline,
    backgroundContrast: contrastRatio(background, pageBackground),
    inkContrast: contrastRatio(background, ink),
    outlineContrast: contrastRatio(outline, pageBackground),
  };
}

function cssColor(color: RgbaColor): string {
  return `rgb(${color.r}, ${color.g}, ${color.b})`;
}

function resolveCssColor(value: string, anchor: HTMLElement): RgbaColor | null {
  const direct = parseColor(value);
  if (direct) return direct;
  if (!value.trim()) return null;
  const probe = document.createElement("span");
  probe.style.color = value;
  probe.style.display = "none";
  anchor.appendChild(probe);
  const resolved = getComputedStyle(probe).color;
  probe.remove();
  return parseColor(resolved);
}

export function applyAdaptiveSelectionTheme(
  anchor = document.querySelector<HTMLElement>(".editor-pane"),
): SelectionPalette | null {
  if (!anchor) return null;
  const root = document.documentElement;
  for (const property of [
    "--nota-selection-bg",
    "--nota-selection-ink",
    "--nota-selection-outline",
    "--nota-result-ink",
    "--nota-sheet-selection-bg",
  ]) {
    anchor.style.removeProperty(property);
    root.style.removeProperty(property);
  }
  const style = getComputedStyle(anchor);
  const pageBackground =
    resolveCssColor(style.getPropertyValue("--doc-bg"), anchor) ??
    parseColor(style.backgroundColor) ??
    parseColor("rgb(255, 255, 255)")!;
  const accent =
    resolveCssColor(style.getPropertyValue("--accent"), anchor) ??
    resolveCssColor(style.getPropertyValue("--link"), anchor) ??
    parseColor(style.color) ??
    parseColor("rgb(47, 111, 208)")!;
  const requestedBackground =
    resolveCssColor(style.getPropertyValue("--selection-bg"), anchor) ??
    resolveCssColor(style.getPropertyValue("--select-text-bg-color"), anchor) ??
    accent;
  const requestedInk =
    resolveCssColor(style.getPropertyValue("--selection-ink"), anchor) ??
    resolveCssColor(style.getPropertyValue("--select-text-font-color"), anchor) ??
    resolveCssColor(style.getPropertyValue("--doc-fg"), anchor) ??
    parseColor(style.color) ??
    DARK_SELECTION_INK;
  const resultInk =
    resolveCssColor(style.getPropertyValue("--doc-fg"), anchor) ??
    parseColor(style.color) ??
    DARK_SELECTION_INK;
  const palette = adaptiveSelectionPalette(
    pageBackground,
    accent,
    requestedBackground,
    requestedInk,
  );
  root.style.setProperty("--nota-selection-bg", cssColor(palette.background));
  root.style.setProperty("--nota-selection-ink", cssColor(palette.ink));
  root.style.setProperty("--nota-selection-outline", cssColor(palette.outline));
  root.style.setProperty("--nota-result-ink", cssColor(resultInk));
  root.style.setProperty("--nota-sheet-selection-bg", cssColor(palette.background));
  window.dispatchEvent(new Event("nota-selection-theme-changed"));
  return palette;
}

let adaptiveSelectionFrame = 0;

export function scheduleAdaptiveSelectionTheme(): void {
  if (adaptiveSelectionFrame) cancelAnimationFrame(adaptiveSelectionFrame);
  adaptiveSelectionFrame = requestAnimationFrame(() => {
    adaptiveSelectionFrame = 0;
    applyAdaptiveSelectionTheme();
  });
}






export function scopeDocThemeCss(css: string): string {


  const cleaned = css.replace(AT_IMPORT_RE, "");

  const sheet = new CSSStyleSheet();
  try {
    sheet.replaceSync(cleaned);
  } catch {

    return "";
  }

  const out: string[] = [];
  walk(sheet.cssRules, out);
  return out.join("\n");
}

const AT_IMPORT_RE = /@(?:import|charset)\s+[^;]*;/gi;


function walk(rules: CSSRuleList, out: string[]): void {
  for (let i = 0; i < rules.length; i++) {
    const rule = rules[i];
    if (!rule) continue;

    switch (rule.type) {
      case CSSRule.STYLE_RULE:
        emitStyleRule(rule as CSSStyleRule, out);
        break;


      case CSSRule.MEDIA_RULE: {
        const media = rule as CSSMediaRule;
        const inner: string[] = [];
        walk(media.cssRules, inner);
        if (inner.length) out.push(`@media ${media.conditionText} {\n${inner.join("\n")}\n}`);
        break;
      }

      case CSSRule.SUPPORTS_RULE: {
        const sup = rule as CSSSupportsRule;
        const inner: string[] = [];
        walk(sup.cssRules, inner);
        if (inner.length) out.push(`@supports ${sup.conditionText} {\n${inner.join("\n")}\n}`);
        break;
      }


      case CSSRule.FONT_FACE_RULE:
      case CSSRule.KEYFRAMES_RULE:
      case CSSRule.PAGE_RULE:
        out.push(rule.cssText);
        break;


      default:
        break;
    }
  }
}


function emitStyleRule(rule: CSSStyleRule, out: string[]): void {
  const selectors = splitTop(rule.selectorText).map(scopeDocThemeSelector).filter(Boolean);
  if (!selectors.length) return;
  out.push(`${selectors.join(", ")} {\n  ${rule.style.cssText}\n}`);
}




export function scopeDocThemeSelector(sel: string): string {
  let s = sel.trim();
  if (!s) return "";
  if (s.includes(ANCHOR)) return s;
  if (ROOT_LIKE_RE.test(s)) {
    return s.toLowerCase() === ":root"
      ? ANCHOR
      : `${ANCHOR}, ${CONTENT}`;
  }



  for (const [pattern, replacement] of TYPORA_STRUCTURE_SELECTORS) {
    s = s.replace(pattern, replacement);
  }
  // Typora HTML export always adds this helper class to #write. Its selector
  // means "use the theme's first-line indent", not a Nota-owned state.
  s = s.replace(/#write\.first-line-indent\b/g, "#write");
  // Typora wraps tables in <figure>; ProseMirror uses div.tableWrapper.
  if (/\btable\b/.test(s)) s = s.replace(/\bfigure\b/g, ".tableWrapper");
  s = s
    .replace(/ul\.task-list(?=[\s>+~,:.#\[]|$)/g, 'ul:has(> li[data-item-type="task"])')
    .replace(/li\.task-list-item\.task-list-done(?=[\s>+~,:.#\[]|$)/g, 'li[data-checked="true"]')
    .replace(/li\.task-list-item(?=[\s>+~,:.#\[]|$)/g, 'li[data-item-type="task"]')
    .replace(/\.md-math-block(?=[\s>+~,:.#\[]|$)/g, ".nota-math-block")
    .replace(/\.mathjax-block(?=[\s>+~,:.#\[]|$)/g, ".nota-math-block")
    .replace(/\.md-diagram-panel(?=[\s>+~,:.#\[]|$)/g, ".nota-diagram");
  for (const [pattern, replacement] of TYPORA_CODE_TOKEN_SELECTORS) {
    s = s.replace(pattern, replacement);
  }




  if (/(^|[\s>+~,(])#write(?![\w-])/.test(s)) {
    const replaced = s.replace(/(^|[\s>+~,(])#write(?![\w-])/g, `$1${CONTENT}`);
    return replaced.includes(ANCHOR) ? replaced : `${ANCHOR} ${replaced}`;
  }


  let rest = s;
  let replaced = false;
  for (;;) {
    const m = rest.match(LEADING_ROOT_RE);
    if (!m) break;
    replaced = true;
    rest = rest.slice(m[0].length);
    if (!rest) break;
  }
  if (replaced) {
    return rest
      ? `${CONTENT} ${rest.trimStart()}`
      : `${ANCHOR}, ${CONTENT}`;
  }

  return `${CONTENT} ${s}`;
}





function splitTop(text: string): string[] {
  const out: string[] = [];
  let depth = 0;
  let quote = "";
  let cur = "";

  for (const ch of text) {
    if (quote) {
      cur += ch;
      if (ch === quote) quote = "";
      continue;
    }
    if (ch === '"' || ch === "'") {
      quote = ch;
      cur += ch;
      continue;
    }
    if (ch === "(" || ch === "[") depth++;
    else if (ch === ")" || ch === "]") depth--;
    else if (ch === "," && depth === 0) {
      out.push(cur);
      cur = "";
      continue;
    }
    cur += ch;
  }
  out.push(cur);
  return out;
}











const paintedThemeCache = new Map<string, string>();
// Imported themes can contain several megabytes. Retain only the latest painted
// copy so StrictMode reuse stays cheap without multiplying memory by four.
const paintedThemeCacheLimit = 1;

function paintThemeCss(css: string): string {
  const cached = paintedThemeCache.get(css);
  if (cached !== undefined) {
    paintedThemeCache.delete(css);
    paintedThemeCache.set(css, cached);
    return cached;
  }
  const compatibility = typoraCompatibilityCss(css);
  const painted =
    scopeDocThemeCss(css) +
    (compatibility ? `\n${compatibility}` : "") +
    `\n${codeSurfaceThemeCss(css)}` +
    `\n${SELECTION_RULE}`;
  paintedThemeCache.set(css, painted);
  while (paintedThemeCache.size > paintedThemeCacheLimit) {
    const oldest = paintedThemeCache.keys().next().value;
    if (oldest === undefined) break;
    paintedThemeCache.delete(oldest);
  }
  return painted;
}

export function applyDocTheme(css: string | null): void {
  replaceInlineStyle(
    STYLE_ID,
    css ? paintThemeCss(css) : null,
  );
  scheduleAdaptiveSelectionTheme();
}












const SELECTION_RULE = `${ANCHOR} .ProseMirror::selection,
${ANCHOR} .ProseMirror *::selection {
  background: var(--nota-selection-bg, var(--select-text-bg-color, highlight));
  color: var(--nota-selection-ink, var(--select-text-font-color, highlighttext));
}`;
