/**
 * `math` / `latex` / `tex` 围栏代码块的数学语义。
 *
 * 文件里的 Markdown 字节不改，仍然是普通围栏代码块；编辑器、HTML 导出和
 * Pandoc 出口在读取时把这些围栏按 LaTeX 数学处理。
 */

import type { KatexOptions } from "katex";

import { t } from "@/i18n";
import { renderCommonStyle } from "./katex-runtime";

const numberLearnLanguage = new Set(["math", "latex", "tex"]);

export function isMathCodeLanguage(language: string): boolean {
  return numberLearnLanguage.has(language.trim().toLowerCase());
}

export interface NumberLearnCodeOutput {
  readonly element: HTMLElement;
  sameStep: (source: string) => void;
}

/** 建一块用于代码块编辑器的 KaTeX 输出。 */
export function createNumberLearnCodeOutput(options: KatexOptions = {}): NumberLearnCodeOutput {
  const element = document.createElement("div");
  element.className = "nota-code-math-preview";
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
        element.dataset.state = "empty";
        output.textContent = `< ${t("Empty Math Block")} >`;
        return;
      }
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

/**
 * 把 Pandoc 输入里的数学围栏转成标准 `$$…$$`。
 *
 * 只改围栏的类型，不改里面一个字符；未闭合的数学围栏保持原样，避免把后续
 * 整篇正文吞进公式。
 */
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
