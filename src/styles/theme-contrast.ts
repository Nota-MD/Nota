/**
 * 判断一份文档主题是否会产出深色纸面。
 *
 * 打印和 PDF 只接受浅色主题。这里不按主题 id 或某套内置主题写分支，只看
 * 主题 CSS 自己声明的 `color-scheme`、`--doc-bg` 与 `--doc-fg/--fg`：
 * 用户从主题仓库安装的主题与内置主题走同一条判据。
 */

export interface Rgb {
  r: number;
  g: number;
  b: number;
}

const 具名颜色: Record<string, Rgb> = {
  black: { r: 0, g: 0, b: 0 },
  white: { r: 255, g: 255, b: 255 },
  gray: { r: 128, g: 128, b: 128 },
  grey: { r: 128, g: 128, b: 128 },
};

function 字节(value: string, scale = 255): number | null {
  const raw = value.trim();
  if (!raw) return null;
  const number = raw.endsWith("%")
    ? (Number.parseFloat(raw.slice(0, -1)) / 100) * scale
    : Number.parseFloat(raw);
  if (!Number.isFinite(number)) return null;
  return Math.max(0, Math.min(255, number));
}

/** 解析主题里最常见的 CSS 颜色写法；认不出时返回 `null`，不猜。 */
export function parseCssColor(value: string): Rgb | null {
  const text = value.trim().toLowerCase();
  const named = 具名颜色[text];
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
  const r = 字节(parts[0] ?? "");
  const g = 字节(parts[1] ?? "");
  const b = 字节(parts[2] ?? "");
  return r === null || g === null || b === null ? null : { r, g, b };
}

/** WCAG 相对亮度；0 = 黑，1 = 白。 */
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

/**
 * 这份主题是否应以深色纸面处理。
 *
 * 判据顺序：显式 `color-scheme: dark`；能解析的 `--doc-bg` 亮度；最后才用
 * 前景色兜底。无法解析时不阻止，避免把一份浅色主题误判成深色。
 */
export function documentThemeLooksDark(css: string): boolean {
  if (!css.trim()) return false;
  const scheme = lastDeclaration(css, "color-scheme");
  if (scheme && /\bdark\b/i.test(scheme) && !/\blight\b/i.test(scheme)) return true;

  const background = lastColor(css, ["--doc-bg", "--bg-color", "background-color"]);
  if (background) return relativeLuminance(background) < 0.42;

  const foreground = lastColor(css, ["--doc-fg", "--fg", "color"]);
  return foreground !== null && relativeLuminance(foreground) > 0.68;
}
