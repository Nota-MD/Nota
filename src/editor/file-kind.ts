













































import type { ViewMode } from "@/bridge/ipc";











export const markdownExtensions: readonly string[] = [
  "md",
  "markdown",
  "mdown",
  "mkd",
  "mdx",
  "txt",
];













export const largeTextItemThresholdValue = 200_000;


export function extension(path: string): string {
  const name3 = path.split(/[/\\]/).pop() ?? "";
  const point = name3.lastIndexOf(".");


  if (point <= 0) return "";
  return name3.slice(point + 1).toLowerCase();
}


export function isMarkdownExtension(path: string): boolean {
  return markdownExtensions.includes(extension(path));
}


export type TextItemType = "markdown" | "text";

export function recognizeTextItemType(path: string): TextItemType {
  return isMarkdownExtension(path) ? "markdown" : "text";
}


export function isLargeTextItem(characterNumber: number): boolean {
  return characterNumber > largeTextItemThresholdValue;
}










export type LowerLevelReason = "text" | "large";







export function lowerLevelReason(path: string | null, characterNumber: number): LowerLevelReason | null {
  if (path !== null && recognizeTextItemType(path) === "text") return "text";
  if (isLargeTextItem(characterNumber)) return "large";
  return null;
}














export function actualMode(preference: ViewMode, reason: LowerLevelReason | null): ViewMode {
  return reason === null ? preference : "source";
}
