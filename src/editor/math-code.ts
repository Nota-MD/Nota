/**
 * `math` / `latex` / `tex` 围栏代码块的数学语义。
 *
 * 文件里的 Markdown 字节不改，仍然是普通围栏代码块；编辑器、HTML 导出和
 * Pandoc 出口在读取时把这些围栏按 LaTeX 数学处理。
 */

import type { KatexOptions } from "katex";

import { t } from "@/i18n";
import { 渲染公式 } from "./katex-runtime";

const 数学语言 = new Set(["math", "latex", "tex"]);

export function 是数学代码语言(language: string): boolean {
  return 数学语言.has(language.trim().toLowerCase());
}

export interface 数学代码输出 {
  readonly 元素: HTMLElement;
  同步: (source: string) => void;
}

/** 建一块用于代码块编辑器的 KaTeX 输出。 */
export function 建数学代码输出(options: KatexOptions = {}): 数学代码输出 {
  const 元素 = document.createElement("div");
  元素.className = "nota-code-math-preview";
  元素.contentEditable = "false";
  const 输出 = document.createElement("div");
  输出.className = "nota-code-math-render";
  元素.append(输出);
  let 代号 = 0;

  return {
    元素,
    同步: (source) => {
      const 源码 = source.trim();
      const 我的代号 = ++代号;
      if (!源码) {
        元素.dataset.state = "empty";
        输出.textContent = `< ${t("Empty Math Block")} >`;
        return;
      }
      元素.dataset.state = "loading";
      输出.textContent = "";
      void 渲染公式(源码, 输出, { ...options, displayMode: true, throwOnError: false })
        .then(() => {
          if (我的代号 === 代号) 元素.dataset.state = "ready";
        })
        .catch(() => {
          if (我的代号 !== 代号) return;
          元素.dataset.state = "error";
          输出.textContent = 源码;
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
export function 数学代码块转公式(markdown: string): string {
  const 行们 = markdown.split("\n");
  const 输出: string[] = [];

  for (let i = 0; i < 行们.length; i += 1) {
    const 行 = 行们[i] ?? "";
    const 开 = 行.match(/^\s*(`{3,}|~{3,})\s*([^\s{]+)?/);
    const fence = 开?.[1];
    const language = 开?.[2] ?? "";
    if (!fence || !是数学代码语言(language)) {
      输出.push(行);
      continue;
    }

    const fenceChar = fence[0] === "\u0060" ? "\u0060" : "~";
    const close = new RegExp(`^\\s*${fenceChar}{${fence.length},}\\s*$`);
    let end = i + 1;
    while (end < 行们.length && !close.test(行们[end] ?? "")) end += 1;
    if (end >= 行们.length) {
      输出.push(行);
      continue;
    }

    输出.push("$$", ...行们.slice(i + 1, end), "$$");
    i = end;
  }

  return 输出.join("\n");
}
