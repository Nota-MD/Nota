























































import { extractOutline, type OutlineItem } from "@/editor/headings";


export const tocStartMarker = "<!-- nota:toc -->";

export const tocEndMarker = "<!-- /nota:toc -->";







export function isItemRecordMark(source: string): boolean {
  const clean = source.trim();
  return clean === tocStartMarker || clean === tocEndMarker;
}




















export function anchor(text2: string, alreadyUse: Set<string>): string {
  const clean = text2
    .trim()
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\p{M}\s_-]/gu, "")
    .replace(/\s+/g, "-");
  const bottom = clean === "" ? "section" : clean;

  let name3 = bottom;
  for (let n = 1; alreadyUse.has(name3); n++) name3 = `${bottom}-${n}`;
  alreadyUse.add(name3);
  return name3;
}















export function generateBecomeItemRecord(headings: readonly OutlineItem[]): string | null {
  if (headings.length === 0) return null;
  const mostLight = Math.min(...headings.map((t) => t.level));
  const alreadyUse = new Set<string>();
  return headings
    .map((t) => {
      const shrinkEnter = "  ".repeat(Math.max(0, t.level - mostLight));
      const name3 = t.text.replace(/[[\]]/g, "\\$&");
      return `${shrinkEnter}- [${name3}](#${anchor(t.text, alreadyUse)})`;
    })
    .join("\n");
}












export function tocBlockText(columnTable: string): string {
  return `${tocStartMarker}\n\n${columnTable}\n\n${tocEndMarker}`;
}










export function computeItemRecordBlock(markdown: string, strict: boolean): string | null {
  const columnTable = generateBecomeItemRecord(extractOutline(markdown, strict));
  return columnTable === null ? null : tocBlockText(columnTable);
}












export function findItemRecord(markdown: string): { start5: number; end2: number } | null {
  const start5 = markdown.indexOf(tocStartMarker);
  if (start5 === -1) return null;
  const tailStart = markdown.indexOf(tocEndMarker, start5 + tocStartMarker.length);
  if (tailStart === -1) return null;
  return { start5, end2: tailStart + tocEndMarker.length };
}







export function replaceReplaceItemRecord(markdown: string, newValueBlock: string): string | null {
  const range = findItemRecord(markdown);
  if (!range) return null;
  return markdown.slice(0, range.start5) + newValueBlock + markdown.slice(range.end2);
}
