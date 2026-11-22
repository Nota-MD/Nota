


















export interface Counts {
  characters: number;
  words: number;
  lines: number;

  readingMinutes: number;
}

/**
 * Typora's documented-style word counter, kept byte-for-byte compatible with
 * its JavaScript implementation. The two sentinel words make empty tokens at
 * either edge harmless; the prefix punctuation pass prevents a standalone
 * markdown marker from becoming a word.
 */
function countTyporaWords(markdown: string): number {
  if (markdown.trim().length === 0) return 0;

  let cjk = 0;
  const normalized = markdown
    .replace(/[\u3040-\uABFF\uD7A4-\uFAFF]/gi, () => {
      cjk += 1;
      return " ";
    })
    .replace(/['’]\w+/g, "b")
    .replace(/(^|\s+)[(\u3000-\u303F)!-\/:-@\[-`{-~]+(\s+|$)/gm, " ");
  const tokens = ["d", normalized, "d"]
    .join(" ")
    .split(/[(\u3000-\u303F)\s!-,\\:-@\[-`{-~]+/g);
  return cjk + tokens.length - 2;
}

export function countText(markdown: string, readingSpeed: number): Counts {
  let characters = 0;
  let lines = markdown === "" ? 0 : 1;

  // Count code points and lines in one pass. Word counting follows Typora's
  // regex contract below so both editors report the same value.
  for (let i = 0; i < markdown.length; i += 1) {
    let cp = markdown.charCodeAt(i);
    characters += 1;


    if (cp >= 0xd800 && cp <= 0xdbff && i + 1 < markdown.length) {
      const low = markdown.charCodeAt(i + 1);
      if (low >= 0xdc00 && low <= 0xdfff) {
        cp = 0x10000 + ((cp - 0xd800) << 10) + (low - 0xdc00);
        i += 1;
      }
    }

    if (cp === 0x0a) {
      lines += 1;
    }
  }
  const words = countTyporaWords(markdown);





  //


  const speedDegree = Number.isFinite(readingSpeed) && readingSpeed >= 1 ? readingSpeed : 382;
  const readingMinutes = Math.max(1, Math.round(words / speedDegree));

  return { characters, words, lines, readingMinutes };
}
