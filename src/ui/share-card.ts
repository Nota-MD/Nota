/**
 * International-style 1080×1350 writing report.
 *
 * The layout is intentionally typographic rather than app-like: a strict grid,
 * oversized numerals, flat rules, little decoration, and no gradient or
 * rounded "floating card" language. The plugin still supplies facts only.
 */

import type { PanelShare } from "@/ui/panel-nodes";
import { markRecognize } from "@/ui/nota-mark";
import { cardAccent, uiAccent } from "@/styles/accent";
import { t } from "@/i18n";
import {
  shareInitials,
  type ShareCardIdentity,
} from "@/ui/share-card-identity";

export const cardWidth = 1080;
export const cardHeight = 1350;

const fontFamily =
  `"Helvetica Neue","Helvetica Neue LT Std",Helvetica,Arial,` +
  `"Noto Sans CJK SC","Source Han Sans SC","PingFang SC","Microsoft YaHei",sans-serif`;

export interface cardColor {
  bottom1: string;
  bottom2: string;
  character2: string;
  faint: string;
  line2: string;
  block: string;
  blockTransparent: number;
  main: string;
}

export const darkCard: cardColor = {
  bottom1: "#11120f",
  bottom2: "#11120f",
  character2: "#f1efe7",
  faint: "#9b9c94",
  line2: "#393b35",
  block: "#f1efe7",
  blockTransparent: 0.06,
  main: "#d8ff43",
};

export const lightCard: cardColor = {
  bottom1: "#f2f0e9",
  bottom2: "#f2f0e9",
  character2: "#11120f",
  faint: "#62655c",
  line2: "#c8c8bf",
  block: "#11120f",
  blockTransparent: 0.05,
  main: "#d4382d",
};

export function currentCardColor(): cardColor {
  const mode2 =
    typeof document === "undefined" ? "light" : document.documentElement.dataset.uiMode;
  const base = mode2 === "light" ? lightCard : darkCard;
  return { ...base, main: cardAccent(uiAccent(), mode2 !== "light") };
}

export type MeasureWidthDevice = (
  text4: string,
  number: number,
  coarse: number,
) => number;

export type ShareQrMatrix = boolean[][];

export interface ShareCardDecoration {
  identity: ShareCardIdentity;
  qr?: ShareQrMatrix | null;
}

const emptyIdentity: ShareCardIdentity = {
  name: "",
  avatar: "",
  includePromotion: false,
};

function convertMeaning(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

interface CharacterParameter {
  size: number;
  weight?: number;
  color: string;
  anchor?: "start" | "middle" | "end";
  spacing?: number;
  opacity?: number;
}

function character(
  content: string,
  x: number,
  y: number,
  parameter: CharacterParameter,
): string {
  if (!content) return "";
  const anchor = parameter.anchor ? ` text-anchor="${parameter.anchor}"` : "";
  const spacing = parameter.spacing ? ` letter-spacing="${parameter.spacing}"` : "";
  const opacity = parameter.opacity === undefined ? "" : ` opacity="${parameter.opacity}"`;
  return (
    `<text x="${x.toFixed(1)}" y="${y.toFixed(1)}" font-family='${fontFamily}'` +
    ` font-size="${parameter.size}" font-weight="${parameter.weight ?? 400}"` +
    ` fill="${parameter.color}"${anchor}${spacing}${opacity}>${convertMeaning(content)}</text>`
  );
}

const estimateWidth: MeasureWidthDevice = (text4, size, weight) => {
  let width = 0;
  for (const item2 of text4) {
    width += /[0-9.,:/+\-]/.test(item2) ? 0.52 : /[A-Z]/.test(item2) ? 0.68 : 0.61;
  }
  return width * size * (weight >= 700 ? 1.02 : 1);
};

function defaultMeasureWidth(): MeasureWidthDevice {
  try {
    const ctx = document.createElement("canvas").getContext("2d");
    if (!ctx) return estimateWidth;
    return (text4, size, weight) => {
      ctx.font = `${weight} ${size}px ${fontFamily}`;
      return ctx.measureText(text4).width;
    };
  } catch {
    return estimateWidth;
  }
}

function fitText(
  value: string,
  maxWidth: number,
  size: number,
  weight: number,
  measure: MeasureWidthDevice,
): string {
  if (!value || measure(value, size, weight) <= maxWidth) return value;
  const chars = Array.from(value);
  while (chars.length > 1) {
    chars.pop();
    const candidate = `${chars.join("")}…`;
    if (measure(candidate, size, weight) <= maxWidth) return candidate;
  }
  return "…";
}

function rule(
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  color: string,
  width = 1,
  dash = "",
): string {
  return `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="${color}" stroke-width="${width}"${dash ? ` stroke-dasharray="${dash}"` : ""}/>`;
}

function profilePart(
  identity: ShareCardIdentity,
  card: PanelShare,
  color: cardColor,
  measure: MeasureWidthDevice,
): string {
  const author = identity.name || t("Nota writer");
  const avatarX = 64;
  const avatarY = 108;
  const avatarSize = 82;
  const part = [
    character((card.subtitle || t("Writing report")).toUpperCase(), 64, 64, {
      size: 18,
      weight: 700,
      color: color.main,
      spacing: 3.2,
    }),
    character(card.date, 1016, 64, {
      size: 20,
      weight: 500,
      color: color.faint,
      anchor: "end",
    }),
    rule(64, 88, 1016, 88, color.line2, 1),
    `<circle cx="${avatarX + avatarSize / 2}" cy="${avatarY + avatarSize / 2}" r="${avatarSize / 2}" fill="none" stroke="${color.line2}" stroke-width="1.5"/>`,
  ];
  if (identity.avatar) {
    part.push(
      `<clipPath id="avatar-clip"><circle cx="${avatarX + avatarSize / 2}" cy="${avatarY + avatarSize / 2}" r="${avatarSize / 2}"/></clipPath>`,
      `<image href="${convertMeaning(identity.avatar)}" x="${avatarX}" y="${avatarY}" width="${avatarSize}" height="${avatarSize}" preserveAspectRatio="xMidYMid slice" clip-path="url(#avatar-clip)"/>`,
    );
  } else if (!identity.name) {
    part.push(markRecognize(avatarX + 16, avatarY + 16, 50, "顶"));
  } else {
    part.push(
      character(shareInitials(author), avatarX + avatarSize / 2, avatarY + 53, {
        size: 27,
        weight: 700,
        color: color.character2,
        anchor: "middle",
      }),
    );
  }
  part.push(
    character(fitText(author, 660, 36, 700, measure), 174, 153, {
      size: 36,
      weight: 700,
      color: color.character2,
    }),
    character(card.title.toUpperCase(), 174, 184, {
      size: 17,
      weight: 600,
      color: color.faint,
      spacing: 2.4,
    }),
    rule(64, 220, 1016, 220, color.line2, 1),
  );
  return part.join("");
}

function metricPart(
  card: PanelShare,
  color: cardColor,
  measure: MeasureWidthDevice,
): string {
  const value = card.value || "—";
  let numberSize = 228;
  while (numberSize > 140 && measure(value, numberSize, 800) > 720) numberSize -= 8;
  const numberWidth = measure(value, numberSize, 800);
  return [
    character(card.label.toUpperCase(), 64, 278, {
      size: 20,
      weight: 700,
      color: color.faint,
      spacing: 2.5,
    }),
    character(value, 64, 494, {
      size: numberSize,
      weight: 800,
      color: color.main,
      spacing: -7,
    }),
    character(card.unit, 64 + numberWidth + 18, 445, {
      size: 32,
      weight: 650,
      color: color.character2,
    }),
    rule(64, 527, 1016, 527, color.character2, 4),
  ].join("");
}

const verticalStepCandidates = [1, 2, 5, 10, 20, 25, 40, 50, 100, 200, 250, 500, 1000, 2000];

interface VerticalAxis {
  ticks: number[];
  low: number;
  high: number;
}

function verticalAxis(points: number[]): VerticalAxis {
  const values = points.filter(Number.isFinite);
  if (values.length === 0) return { ticks: [0], low: 0, high: 1 };
  let low = Math.min(...values);
  let high = Math.max(...values);
  if (!(high > low)) {
    const pad = Math.max(1, Math.abs(high) * 0.12);
    low -= pad;
    high += pad;
  }
  for (const step of verticalStepCandidates) {
    const below = Math.floor(low / step) * step;
    const above = Math.ceil(high / step) * step;
    const count = Math.round((above - below) / step) + 1;
    if (count > 6 || (above - high) / Math.max(1, high) > 0.35) continue;
    const ticks: number[] = [];
    for (let value = below; value <= above + step * 0.01; value += step) ticks.push(value);
    return { ticks, low: below, high: above };
  }
  return { ticks: [low, high], low, high };
}

const chartLeft = 128;
const chartRight = 1016;
const chartTop = 560;
const chartBottom = 840;

function yPosition(value: number, axis: VerticalAxis): number {
  const ratio = (value - axis.low) / Math.max(1e-9, axis.high - axis.low);
  const pressed = Math.pow(Math.max(0, Math.min(1, ratio)), 0.58);
  return chartBottom - pressed * (chartBottom - chartTop);
}

function xPosition(index: number, count: number): number {
  return chartLeft + (count <= 1 ? 0.5 : index / (count - 1)) * (chartRight - chartLeft);
}

function chartTitle(color: cardColor): string {
  return [
    character(`01 — ${t("Timeline").toUpperCase()}`, 1016, 548, {
      size: 15,
      weight: 600,
      color: color.faint,
      anchor: "end",
      spacing: 1.6,
    }),
  ].join("");
}

function curvePart(
  card: PanelShare,
  color: cardColor,
): string {
  const part = [chartTitle(color)];
  const axis = verticalAxis(card.points);
  for (const value of axis.ticks) {
    const y = yPosition(value, axis);
    part.push(
      rule(chartLeft, y, chartRight, y, color.line2, 1, value === axis.low ? "" : "2 8"),
      character(String(Math.round(value)), chartLeft - 16, y + 6, {
        size: 17,
        weight: 500,
        color: color.faint,
        anchor: "end",
      }),
    );
  }
  const points = card.points;
  if (points.length === 1) {
    part.push(
      `<circle cx="${xPosition(0, 1).toFixed(1)}" cy="${yPosition(points[0] ?? 0, axis).toFixed(1)}" r="8" fill="${color.main}"/>`,
    );
  } else if (points.length > 1) {
    let path = "";
    for (let index = 0; index < points.length; index++) {
      const x = xPosition(index, points.length).toFixed(1);
      const y = yPosition(points[index] ?? 0, axis).toFixed(1);
      path += `${index === 0 ? "M" : "L"}${x} ${y} `;
    }
    part.push(
      `<path class="curve-line" d="${path.trim()}" fill="none" stroke="${color.main}" stroke-width="7" stroke-linejoin="round" stroke-linecap="round"/>`,
    );
  }
  for (const tick of card.xTicks) {
    const x = chartLeft + Math.max(0, Math.min(1, tick.at)) * (chartRight - chartLeft);
    const anchor = tick.at <= 0.04 ? "start" : tick.at >= 0.96 ? "end" : "middle";
    part.push(
      rule(x, chartBottom, x, chartBottom + 8, color.character2, 1.5),
      character(tick.label, x, chartBottom + (tick.largeSinglePosition ? 36 : 32), {
        size: tick.largeSinglePosition ? 22 : 17,
        weight: 550,
        color: color.faint,
        anchor,
      }),
    );
  }
  for (let index = 0; index + 1 < card.xTicks.length; index++) {
    const start = card.xTicks[index];
    const end = card.xTicks[index + 1];
    if (!start || !end || card.xMinor <= 0) continue;
    for (let minor = 1; minor <= card.xMinor; minor++) {
      const at = start.at + ((end.at - start.at) * minor) / (card.xMinor + 1);
      const x = chartLeft + at * (chartRight - chartLeft);
      part.push(`<line class="share-x-minor" x1="${x.toFixed(1)}" y1="${chartBottom}" x2="${x.toFixed(1)}" y2="${chartBottom + 4}" stroke="${color.line2}" stroke-width="1"/>`);
    }
  }
  return part.join("");
}

function heatPart(card: PanelShare, color: cardColor, measure: MeasureWidthDevice): string {
  const image = card.heat;
  const part = [chartTitle(color)];
  if (!image || image.column.length === 0) return part.join("");
  const columns = image.column;
  const seam = columns.length > 30 ? 3 : 5;
  const availableWidth = chartRight - chartLeft;
  const availableHeight = chartBottom - chartTop - 26;
  const cell = Math.min(
    (availableWidth - (columns.length - 1) * seam) / columns.length,
    (availableHeight - 6 * seam) / 7,
  );
  const left = chartLeft + (availableWidth - (columns.length * cell + (columns.length - 1) * seam)) / 2;
  const top = chartTop + 28;
  let lastMonth = "";
  for (let columnIndex = 0; columnIndex < columns.length; columnIndex++) {
    const column = columns[columnIndex];
    if (!column) continue;
    const month = column.month;
    if (month && month !== lastMonth) {
      const x = left + columnIndex * (cell + seam);
      if (x + measure(month, 15, 500) < chartRight) {
        part.push(character(month, x, chartTop + 16, { size: 15, weight: 500, color: color.faint }));
        lastMonth = month;
      }
    }
    for (let row = 0; row < column.cell2.length; row++) {
      const level = column.cell2[row]?.level ?? 0;
      const x = (left + columnIndex * (cell + seam)).toFixed(1);
      const y = (top + row * (cell + seam)).toFixed(1);
      const fill = level === 0 ? color.line2 : color.main;
      const opacity = level === 0 ? "" : ` opacity="${[0, 0.2, 0.42, 0.66, 0.92][level] ?? 0.92}"`;
      part.push(
        `<rect class="heat-cell" x="${x}" y="${y}" width="${cell.toFixed(1)}" height="${cell.toFixed(1)}" fill="${fill}"${opacity}/>`,
      );
    }
  }
  const legendY = chartBottom + 12;
  const legendSize = 15;
  let legendX = chartRight - 5 * (legendSize + 4) - 54;
  if (card.less) {
    part.push(character(card.less, legendX - 32, legendY + 13, { size: 15, weight: 500, color: color.faint, anchor: "end" }));
  }
  for (let level = 0; level < 5; level++) {
    part.push(
      `<rect x="${legendX}" y="${legendY}" width="${legendSize}" height="${legendSize}" fill="${level === 0 ? color.line2 : color.main}"${level === 0 ? "" : ` opacity="${[0, 0.2, 0.42, 0.66, 0.92][level]}"`}/>`,
    );
    legendX += legendSize + 4;
  }
  if (card.more) part.push(character(card.more, legendX + 4, legendY + 13, { size: 15, weight: 500, color: color.faint }));
  return part.join("");
}

function statsPart(card: PanelShare, color: cardColor, measure: MeasureWidthDevice): string {
  const count = Math.max(1, Math.min(3, card.stats.length));
  const width = (1016 - 64) / count;
  const part = [
    rule(64, 914, 1016, 914, color.character2, 3),
    rule(64, 1082, 1016, 1082, color.line2, 1),
  ];
  for (let index = 0; index < count; index++) {
    const stat = card.stats[index];
    if (!stat) continue;
    const left = 64 + width * index;
    if (index > 0) part.push(rule(left, 914, left, 1082, color.line2, 1));
    const valueSize = stat.v.length > 9 ? 45 : 62;
    part.push(
      character(stat.k.toUpperCase(), left + 18, 956, {
        size: 16,
        weight: 650,
        color: color.faint,
        spacing: 1.4,
      }),
      character(fitText(stat.v, width - 40, valueSize, 750, measure), left + 18, 1038, {
        size: valueSize,
        weight: 750,
        color: color.character2,
      }),
      character(stat.small, left + width - 18, 1038, {
        size: 17,
        weight: 500,
        color: color.faint,
        anchor: "end",
      }),
    );
  }
  return part.join("");
}

function qrPart(
  qr: ShareQrMatrix,
  x: number,
  y: number,
  size: number,
  color: cardColor,
): string {
  const modules = qr.length;
  if (modules === 0) return "";
  const quiet = 4;
  const cell = size / (modules + quiet * 2);
  let path = "";
  for (let row = 0; row < modules; row++) {
    for (let column = 0; column < modules; column++) {
      if (!qr[row]?.[column]) continue;
      const px = (x + (column + quiet) * cell).toFixed(2);
      const py = (y + (row + quiet) * cell).toFixed(2);
      path += `M${px} ${py}h${cell.toFixed(2)}v${cell.toFixed(2)}h-${cell.toFixed(2)}z`;
    }
  }
  return [
    `<rect x="${x}" y="${y}" width="${size}" height="${size}" fill="#ffffff" stroke="${color.line2}" stroke-width="1"/>`,
    `<path class="share-qr" d="${path}" fill="#10110e" shape-rendering="crispEdges"/>`,
  ].join("");
}

function footerPart(
  card: PanelShare,
  identity: ShareCardIdentity,
  qr: ShareQrMatrix | null | undefined,
  color: cardColor,
  measure: MeasureWidthDevice,
): string {
  const part = [rule(64, 1162, 1016, 1162, color.line2, 1)];
  /**
   * The QR belongs to the same optical row as the two-line footer text.
   *
   * Its previous 126px box started at y=1208 and ended only 16px above the
   * canvas edge, making the right side feel dragged down. Keep the QR on the
   * footer's centre line and leave a normal bottom margin instead.
   */
  const qrSize = qr ? 112 : 0;
  const footWidth = qr ? 720 : 830;
  part.push(
    character(fitText(card.foot, footWidth, 21, 500, measure), 64, 1212, {
      size: 21,
      weight: 500,
      color: color.faint,
    }),
    character(t("Nota / Writing system").toUpperCase(), 64, 1260, {
      size: 14,
      weight: 700,
      color: color.character2,
      spacing: 1.8,
    }),
  );
  if (identity.includePromotion && qr) {
    part.push(
      character(t("Write with Nota").toUpperCase(), 1016, 1176, {
        size: 13,
        weight: 700,
        color: color.character2,
        anchor: "end",
        spacing: 1.8,
      }),
      qrPart(qr, 904, 1186, qrSize, color),
    );
  } else {
    part.push(
      `<g opacity="0.95">${markRecognize(950, 1220, 34, "脚")}</g>`,
      character("NOTA", 1016, 1250, {
        size: 25,
        weight: 750,
        color: color.character2,
        anchor: "end",
        spacing: 1.4,
      }),
    );
  }
  return part.join("");
}

export function shareCardSvg(
  card: PanelShare,
  color: cardColor,
  measure?: MeasureWidthDevice,
  decoration?: ShareCardDecoration,
): string {
  const measureWidth = measure ?? defaultMeasureWidth();
  const identity = decoration?.identity ?? emptyIdentity;
  const body = [
    `<rect width="${cardWidth}" height="${cardHeight}" fill="${color.bottom1}"/>`,
    `<rect width="${cardWidth}" height="16" fill="${color.main}"/>`,
    profilePart(identity, card, color, measureWidth),
    metricPart(card, color, measureWidth),
    card.shape === "heat"
      ? heatPart(card, color, measureWidth)
      : curvePart(card, color),
    statsPart(card, color, measureWidth),
    footerPart(card, identity, decoration?.qr, color, measureWidth),
  ].join("");
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" width="${cardWidth}" height="${cardHeight}"` +
    ` viewBox="0 0 ${cardWidth} ${cardHeight}" data-share-style="international-grid">${body}</svg>`
  );
}

export async function lightGridConvert(
  card: PanelShare,
  color: cardColor,
  decoration?: ShareCardDecoration,
): Promise<Blob> {
  const svg = shareCardSvg(card, color, undefined, decoration);
  const address = URL.createObjectURL(new Blob([svg], { type: "image/svg+xml;charset=utf-8" }));
  try {
    const image = new Image();
    image.width = cardWidth;
    image.height = cardHeight;
    image.src = address;
    await image.decode();
    const canvas = document.createElement("canvas");
    canvas.width = cardWidth;
    canvas.height = cardHeight;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Could not create a 2D canvas");
    ctx.drawImage(image, 0, 0, cardWidth, cardHeight);
    const block = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/png"));
    if (!block) throw new Error("PNG encoding returned no image");
    return block;
  } finally {
    URL.revokeObjectURL(address);
  }
}

export async function toBase64(block: Blob): Promise<string> {
  const byte = new Uint8Array(await block.arrayBuffer());
  const slice: string[] = [];
  const eachSlice = 0x8000;
  for (let index = 0; index < byte.length; index += eachSlice) {
    slice.push(String.fromCharCode(...byte.subarray(index, index + eachSlice)));
  }
  return btoa(slice.join(""));
}

export function SafeFileName(name3: string): string {
  const clean = (name3 || "")
    .split(/[\\/]/)
    .pop()!
    .replace(/[\\/]/g, "-")
    .replace(/[:*?"<>|]/g, "-")
    .replace(/[\u0000-\u001f\u007f]/g, "")
    .replace(/^\.+/, "")
    .trim();
  const base = clean.replace(/\.png$/i, "");
  if (!base) return "nota-stats.png";
  return `${base.slice(0, 115)}.png`;
}
