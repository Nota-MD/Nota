




































export const white = "#ffffff";








export const nearBlack = "#10131a";












export function parseAccent(raw: string): string | null {
  const s = raw.trim().replace(/^#/, "");



  if (/^[0-9a-fA-F]{3}$/.test(s)) return `#${s.replace(/./g, (c) => c + c)}`.toLowerCase();
  if (/^[0-9a-fA-F]{6}$/.test(s)) return `#${s.toLowerCase()}`;
  return null;
}









export function RelativeLuminance(hex: string): number {
  const n = Number.parseInt(hex.slice(1), 16);



  const throughWay = (v: number): number => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  };
  return (
    0.2126 * throughWay((n >> 16) & 0xff) + 0.7152 * throughWay((n >> 8) & 0xff) + 0.0722 * throughWay(n & 0xff)
  );
}









export function correctCompareDegree(a: number, b: number): number {
  const [height, low] = a > b ? [a, b] : [b, a];
  return (height + 0.05) / (low + 0.05);
}





























const luminanceCutoff = 0.25;












export function accentFg(accent: string): string {
  return RelativeLuminance(accent) < luminanceCutoff ? white : nearBlack;
}








export function hue(hex: string): number {
  return toHsl(hex).h;
}










const darkCardAccent = "#4f82fb";
const lightCardAccent = "#2f63d8";


















const cardSliceDarkBackgroundBelowLimit = 0.2;
const cardSliceLightBackgroundLimit = 0.28;


export function toHsl(hex: string): { h: number; s: number; l: number } {
  const n = Number.parseInt(hex.slice(1), 16);
  const r = ((n >> 16) & 0xff) / 255;
  const g = ((n >> 8) & 0xff) / 255;
  const b = (n & 0xff) / 255;
  const large = Math.max(r, g, b);
  const small = Math.min(r, g, b);
  const and = large + small;
  const difference = large - small;
  const l = and / 2;
  if (difference === 0) return { h: 0, s: 0, l };
  const s = l > 0.5 ? difference / (2 - and) : difference / and;


  let h: number;
  if (large === r) h = ((g - b) / difference + (g < b ? 6 : 0)) / 6;
  else if (large === g) h = ((b - r) / difference + 2) / 6;
  else h = ((r - g) / difference + 4) / 6;
  return { h: h * 360, s, l };
}


function toHex(h: number, s: number, l: number): string {
  const hue = ((h % 360) + 360) % 360 / 360;
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
  const p = 2 * l - q;
  const shareMeasure = (t0: number): number => {
    let t = t0;
    if (t < 0) t += 1;
    if (t > 1) t -= 1;
    if (t < 1 / 6) return p + (q - p) * 6 * t;
    if (t < 1 / 2) return q;
    if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
    return p;
  };
  const get = (v: number) => Math.round(Math.min(1, Math.max(0, v)) * 255);
  const twoDigits = (v: number) => get(v).toString(16).padStart(2, "0");
  return `#${twoDigits(shareMeasure(hue + 1 / 3))}${twoDigits(shareMeasure(hue))}${twoDigits(shareMeasure(hue - 1 / 3))}`;
}















export function cardAccent(accent: string | null, darkBackground: boolean): string {
  const start5 = accent ? parseAccent(accent) : null;
  if (!start5) return darkBackground ? darkCardAccent : lightCardAccent;

  const target = darkBackground ? cardSliceDarkBackgroundBelowLimit : cardSliceLightBackgroundLimit;
  if (darkBackground ? RelativeLuminance(start5) >= target : RelativeLuminance(start5) <= target) return start5;

  const { h, s, l } = toHsl(start5);


  let currentValue = start5;
  for (let i = 1; i <= 100; i++) {
    const belowValue = l + (darkBackground ? i : -i) / 100;
    if (belowValue > 1 || belowValue < 0) break;
    currentValue = toHex(h, s, belowValue);
    if (darkBackground ? RelativeLuminance(currentValue) >= target : RelativeLuminance(currentValue) <= target) return currentValue;
  }
  return currentValue;
}








export function uiAccent(): string | null {
  try {
    const value2 = getComputedStyle(document.documentElement).getPropertyValue("--accent");
    return value2.trim() || null;
  } catch {
    return null;
  }
}













































export function accentVars(raw: string): Record<string, string> | null {
  const hex = parseAccent(raw);
  if (!hex) return null;



  return { "--accent": hex, "--accent-fg": accentFg(hex), "--switch-on": hex };
}
