







export interface Rgb {
  r: number;
  g: number;
  b: number;
}

const namedColor: Record<string, Rgb> = {
  black: { r: 0, g: 0, b: 0 },
  white: { r: 255, g: 255, b: 255 },
  gray: { r: 128, g: 128, b: 128 },
  grey: { r: 128, g: 128, b: 128 },
};

function byte(value: string, scale = 255): number | null {
  const raw = value.trim();
  if (!raw) return null;
  const number = raw.endsWith("%")
    ? (Number.parseFloat(raw.slice(0, -1)) / 100) * scale
    : Number.parseFloat(raw);
  if (!Number.isFinite(number)) return null;
  return Math.max(0, Math.min(255, number));
}


export function parseCssColor(value: string): Rgb | null {
  const text = value.trim().toLowerCase();
  const named = namedColor[text];
  if (named) return named;

  const hex = text.match(/^#([0-9a-f]{3,8})$/i)?.[1];
  if (hex) {
    const digits = hex.length === 3 || hex.length === 4
      ? [...hex.slice(0, 3)].map((c) => c + c).join("")
      : hex.slice(0, 6);
    if (digits.length !== 6) return null;
    return {
      r: Number.parseInt(digits.slice(0, 2), 16),
      g: Number.parseInt(digits.slice(2, 4), 16),
      b: Number.parseInt(digits.slice(4, 6), 16),
    };
  }

  const rgb = text.match(/^rgba?\((.*)\)$/i)?.[1];
  if (!rgb) return null;
  const parts = rgb.replaceAll(",", " ").split("/")[0]?.trim().split(/\s+/) ?? [];
  if (parts.length < 3) return null;
  const r = byte(parts[0] ?? "");
  const g = byte(parts[1] ?? "");
  const b = byte(parts[2] ?? "");
  return r === null || g === null || b === null ? null : { r, g, b };
}


export function relativeLuminance({ r, g, b }: Rgb): number {
  const channel = (value: number) => {
    const x = value / 255;
    return x <= 0.04045 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
}

function lastDeclaration(css: string, property: string): string | null {
  const escaped = property.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const pattern = new RegExp(`(?:^|[;{])\\s*${escaped}\\s*:\\s*([^;}]+)`, "gi");
  let found: string | null = null;
  for (const match of css.matchAll(pattern)) found = match[1]?.trim() ?? null;
  return found;
}

function lastColor(css: string, properties: string[]): Rgb | null {
  for (const property of properties) {
    const value = lastDeclaration(css, property);
    if (!value) continue;
    const color = parseCssColor(value);
    if (color) return color;
  }
  return null;
}







export function documentThemeLooksDark(css: string): boolean {
  if (!css.trim()) return false;
  const scheme = lastDeclaration(css, "color-scheme");
  if (scheme && /\bdark\b/i.test(scheme) && !/\blight\b/i.test(scheme)) return true;

  const background = lastColor(css, ["--doc-bg", "--bg-color", "background-color"]);
  if (background) return relativeLuminance(background) < 0.42;

  const foreground = lastColor(css, ["--doc-fg", "--fg", "color"]);
  return foreground !== null && relativeLuminance(foreground) > 0.68;
}
