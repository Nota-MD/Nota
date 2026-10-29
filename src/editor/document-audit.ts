/**
 * Markdown 文档检查：只读、非阻塞，不修改用户字节。
 *
 * 第一版覆盖 GitHub 风格指南里最适合机器判断、且一旦漏掉会直接影响发布或
 * 无障碍阅读的项目：图片替代文字、空链接、标题跳级/重名、脚注引用与定义配对、
 * 危险链接协议、`{% rowheaders %}` 边界配对。语气、术语和长短句仍留给作者。
 */

export type DocumentAuditCode =
  | "image-alt-missing"
  | "link-label-empty"
  | "heading-level-skip"
  | "heading-duplicate"
  | "footnote-missing-definition"
  | "footnote-missing-reference"
  | "dangerous-link"
  | "rowheaders-unbalanced";

export interface DocumentIssue {
  code: DocumentAuditCode;
  line: number;
  detail: string;
}

const dangerousProtocol = /(?:javascript|vbscript|data|file|blob):/i;

function visibleLines(markdown: string): { line: number; text: string }[] {
  const output: { line: number; text: string }[] = [];
  let fence = false;
  markdown.split(/\r?\n/).forEach((text, index) => {
    if (/^\s*(```|~~~)/.test(text)) {
      fence = !fence;
      return;
    }
    if (!fence) output.push({ line: index + 1, text });
  });
  return output;
}

export function auditMarkdown(markdown: string): DocumentIssue[] {
  const issues: DocumentIssue[] = [];
  const headings = new Map<string, number>();
  let lastHeading = 0;
  let rowheaders = false;

  for (const { line, text } of visibleLines(markdown)) {
    const heading = /^(#{1,6})[ \t]+(.+?)\s*#*\s*$/.exec(text);
    if (heading) {
      const level = heading[1]!.length;
      const label = heading[2]!.trim();
      if (lastHeading > 0 && level > lastHeading + 1) {
        issues.push({
          code: "heading-level-skip",
          line,
          detail: `H${lastHeading} → H${level}`,
        });
      }
      lastHeading = level;
      const key = `${level}:${label.toLocaleLowerCase()}`;
      if (headings.has(key)) {
        issues.push({ code: "heading-duplicate", line, detail: label });
      } else {
        headings.set(key, line);
      }
    }

    for (const image of text.matchAll(/!\[([^\]]*)]\(([^)\s]+)(?:\s+["'][^"']*["'])?\)/g)) {
      if (!image[1]?.trim()) {
        issues.push({ code: "image-alt-missing", line, detail: image[2] ?? "" });
      }
    }
    for (const image of text.matchAll(/<img\b([^>]*)>/gi)) {
      const attributes = image[1] ?? "";
      const alt = /\balt\s*=\s*(["'])(.*?)\1/i.exec(attributes)?.[2]?.trim();
      if (!alt) {
        const src = /\bsrc\s*=\s*(["'])(.*?)\1/i.exec(attributes)?.[2] ?? "";
        issues.push({ code: "image-alt-missing", line, detail: src });
      }
    }
    for (const link of text.matchAll(/\[([^\]]*)]\(([^)\s]+)(?:\s+["'][^"']*["'])?\)/g)) {
      if (!link[1]?.trim()) {
        issues.push({ code: "link-label-empty", line, detail: link[2] ?? "" });
      }
      if (dangerousProtocol.test(link[2] ?? "")) {
        issues.push({ code: "dangerous-link", line, detail: link[2] ?? "" });
      }
    }
    if (/^\s*\{%\s*rowheaders\s*%\}\s*$/.test(text)) rowheaders = true;
    if (/^\s*\{%\s*endrowheaders\s*%\}\s*$/.test(text)) {
      if (!rowheaders) {
        issues.push({ code: "rowheaders-unbalanced", line, detail: "end without start" });
      }
      rowheaders = false;
    }
  }
  if (rowheaders) {
    issues.push({ code: "rowheaders-unbalanced", line: 1, detail: "missing end" });
  }

  const references = new Set(
    [...markdown.matchAll(/\[\^([^\]\s]+)](?!:)/g)].map((match) => match[1]!),
  );
  const definitions = new Set(
    [...markdown.matchAll(/^\[\^([^\]\s]+)]:/gm)].map((match) => match[1]!),
  );
  for (const label of references) {
    if (!definitions.has(label)) {
      issues.push({ code: "footnote-missing-definition", line: 1, detail: label });
    }
  }
  for (const label of definitions) {
    if (!references.has(label)) {
      issues.push({ code: "footnote-missing-reference", line: 1, detail: label });
    }
  }

  return issues.sort((a, b) => a.line - b.line || a.code.localeCompare(b.code));
}
