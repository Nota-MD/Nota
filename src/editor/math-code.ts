






import type { KatexOptions } from "katex";

import { t } from "@/i18n";
import { renderCommonStyle } from "./katex-runtime";

const numberLearnLanguage = new Set(["math", "latex", "tex"]);

export function isMathCodeLanguage(language: string): boolean {
  return numberLearnLanguage.has(language.trim().toLowerCase());
}

/** Canonical math fence language used by new and edited blocks. */
export function normalizeMathCodeLanguage(language: string): string {
  return isMathCodeLanguage(language) ? "math" : language;
}

export interface NumberLearnCodeOutput {
  readonly element: HTMLElement;
  sameStep: (source: string) => void;
}


export function createNumberLearnCodeOutput(options: KatexOptions = {}): NumberLearnCodeOutput {
  const element = document.createElement("pre");
  element.className =
    "nota-code-math-preview nota-code-theme-surface nota-source-surface md-fences ty-contain-cm";
  element.contentEditable = "false";
  const output = document.createElement("div");
  output.className = "nota-code-math-render";
  element.append(output);
  let representNumber = 0;

  return {
    element,
    sameStep: (source) => {
      const source2 = source.trim();
      const selfOfRepresentNumber = ++representNumber;
      if (!source2) {
        element.hidden = true;
        element.dataset.state = "empty";
        output.textContent = `< ${t("Empty Math Block")} >`;
        return;
      }
      element.hidden = false;
      element.dataset.state = "loading";
      output.textContent = "";
      void renderCommonStyle(source2, output, { ...options, displayMode: true, throwOnError: false })
        .then(() => {
          if (selfOfRepresentNumber === representNumber) element.dataset.state = "ready";
        })
        .catch(() => {
          if (selfOfRepresentNumber !== representNumber) return;
          element.dataset.state = "error";
          output.textContent = source2;
        });
    },
  };
}







export function numberLearnCodeBlockConvertCommonStyle(markdown: string): string {
  const rows = markdown.split("\n");
  const output: string[] = [];

  for (let i = 0; i < rows.length; i += 1) {
    const line3 = rows[i] ?? "";
    const open2 = line3.match(/^\s*(`{3,}|~{3,})\s*([^\s{]+)?/);
    const fence = open2?.[1];
    const language = open2?.[2] ?? "";
    if (!fence || !isMathCodeLanguage(language)) {
      output.push(line3);
      continue;
    }

    const fenceChar = fence[0] === "\u0060" ? "\u0060" : "~";
    const close = new RegExp(`^\\s*${fenceChar}{${fence.length},}\\s*$`);
    let end = i + 1;
    while (end < rows.length && !close.test(rows[end] ?? "")) end += 1;
    if (end >= rows.length) {
      output.push(line3);
      continue;
    }

    output.push("$$", ...rows.slice(i + 1, end), "$$");
    i = end;
  }

  return output.join("\n");
}
