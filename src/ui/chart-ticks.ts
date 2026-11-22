
























export interface tick {

  at: number;

  label: string;











  largeSinglePosition?: boolean;
}


const tickLimit = 8;

const labelLimit = 12;








export function readTick(raw: unknown, limit: number = tickLimit): tick[] {
  if (!Array.isArray(raw)) return [];
  const out: tick[] = [];
  for (const item5 of raw) {
    if (typeof item5 !== "object" || item5 === null) continue;
    const { at, label, largeSinglePosition } = item5 as {
      at?: unknown;
      label?: unknown;
      largeSinglePosition?: unknown;
    };
    if (typeof at !== "number" || !Number.isFinite(at)) continue;
    if (typeof label !== "string") continue;
    const character2 = label.trim();
    if (!character2) continue;
    out.push({


      at: Math.min(1, Math.max(0, at)),
      label: character2.slice(0, labelLimit),


      ...(largeSinglePosition === true ? { largeSinglePosition: true } : {}),
    });
  }

  out.sort((a, b) => a.at - b.at);
  return out.slice(0, Math.max(0, limit));
}











export function pushVerticalTick(point: number[]): tick[] {
  const first = point[0];


  if (first === undefined) return [];
  let large = first;
  let small = first;
  for (const v of point) {
    if (v > large) large = v;
    if (v < small) small = v;
  }
  if (large === small) return [{ at: 0.5, label: formatNumber(large) }];


  return [
    { at: 0, label: formatNumber(large) },
    { at: 0.5, label: formatNumber((large + small) / 2) },
    { at: 1, label: formatNumber(small) },
  ];
}








export function formatNumber(v: number): string {
  if (!Number.isFinite(v)) return "";
  if (Number.isInteger(v)) return Object.is(v, -0) ? "0" : String(v);
  const a = Math.abs(v);
  const position3 = a >= 100 ? 0 : a >= 10 ? 1 : 2;






  const character2 = position3 === 0 ? v.toFixed(0) : v.toFixed(position3).replace(/\.?0+$/, "");
  return character2 === "-0" || character2 === "" ? "0" : character2;
}
