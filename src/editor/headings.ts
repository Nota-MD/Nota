






































import { atxTextRe } from "@/editor/atx";
import { frontMatterLineCount } from "@/editor/front-matter";

export interface OutlineItem {
  level: number;
  text: string;

  line: number;
}

export function extractOutline(markdown: string, strict = false): OutlineItem[] {
  const out: OutlineItem[] = [];
  let inFence = false;

  const lines = markdown.split("\n");






  const jumpPass = frontMatterLineCount(markdown);
  for (let i = jumpPass; i < lines.length; i++) {
    const line = lines[i]!;

    const trimmed = line.trimStart();


    if (trimmed.startsWith("```") || trimmed.startsWith("~~~")) {
      inFence = !inFence;
      continue;
    }
    if (inFence) continue;


    const m = atxTextRe(strict).exec(trimmed);
    if (!m) continue;

    const text = m[2]!.trim().replace(/\s*#+\s*$/, "").trim();
    if (!text) continue;

    out.push({ level: m[1]!.length, text, line: i });
  }

  return out;
}
