






































































export function atxTextRe(strict: boolean): RegExp {
  return strict ? /^(#{1,6})\s+(.*)$/ : /^(#{1,6})\s*(.*)$/;
}








export function atxPrefixRe(strict: boolean): RegExp {
  return strict ? /^#{1,6} +/ : /^#{1,6} ?/;
}























export function atxPrefix(text2: string, strict: boolean): { layerNumber: number; lengthDegree: number } | null {
  const m = atxTextRe(strict).exec(text2);
  if (!m) return null;
  return { layerNumber: m[1]!.length, lengthDegree: m[0].length - (m[2] ?? "").length };
}
