































import type { DocFont, DocumentSettings } from "@/bridge/types";












const characterBodyStack: Record<DocFont, string> = {
  sans: 'system-ui, "Noto Sans CJK SC", "Source Han Sans SC", "PingFang SC", "Microsoft YaHei", sans-serif',
  serif: 'Georgia, "Noto Serif CJK SC", "Source Han Serif SC", "Times New Roman", serif',



  mono: "var(--font-mono)",
};


export const lineDistanceScopeEnclose = { min: 100, max: 300 } as const;

export const paragraphDistanceScopeEnclose = { min: 0, max: 300 } as const;

export const characterNumberScopeEnclose = { min: 80, max: 200 } as const;


function clamp(value2: number, scopeEnclose: { min: number; max: number }): number {
  const whole = Math.round(value2);
  if (!Number.isFinite(whole)) return scopeEnclose.max;
  return Math.min(scopeEnclose.max, Math.max(scopeEnclose.min, whole));
}








export function DocumentTypographyVars(document: DocumentSettings | undefined): Record<string, string> {
  if (!document) return {};
  const output2: Record<string, string> = {};
  if (document.custom_line_height) {

    output2["--doc-line-height"] = number2(clamp(document.line_height, lineDistanceScopeEnclose) / 100);
  }
  if (document.custom_paragraph_gap) {
    output2["--doc-para-gap"] = `${number2(clamp(document.paragraph_gap, paragraphDistanceScopeEnclose) / 100)}em`;
  }
  if (document.custom_font) {
    output2["--font-doc"] = characterBodyStack[document.font] ?? characterBodyStack.sans;
  }
  if (document.custom_font_size) {
    output2["--doc-font-size"] = `${number2(clamp(document.font_size, characterNumberScopeEnclose) / 100)}em`;
  }
  return output2;
}


function number2(x: number): string {
  return String(Math.round(x * 100) / 100);
}
