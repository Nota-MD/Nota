/**
 * 数字数。
 *
 * ⚠️ 本文件**原来还有另一半**：`extractOutline`（扫标题）与 `OutlineItem`。
 * 2026-09-27 搬去了 `editor/headings.ts`，理由写在那边文件头——一句话是
 * **依赖方向**：`docs/10` §1 的「目录（TOC）」那条命令也要同一份判据，
 * 而它在编辑器那一侧，`src/editor/` 里从不 import `@/ui/`。
 * 只剩数数之后这里确实"名不副实"了一点，但 `outline` 这个名字还与侧栏
 * 那一页（`Sidebar.tsx`）对得上，改名要连带动 `docs/02` / `docs/09` 两张
 * 登记表，不值当。
 *
 * 口径：
 * - **字符数**按**码点**算，不是 UTF-16 码元——否则一个 emoji 会被算成 2，
 *   一个字的中文倒是对的（1）。混排时两种算法的差会让人对不上数。
 * - **词数**：follow Typora's word counter exactly. CJK code points in its
 *   configured ranges count one each; other text is split by Typora's
 *   punctuation and whitespace rules. This keeps the same document at the
 *   same count in Nota and Typora.
 */
export interface Counts {
  characters: number;
  words: number;
  lines: number;
  /** 预计阅读分钟数，至少 1。⚠️ 按调用者给的**阅读速度**算（`countText` 的第二个参数）。 */
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
    // 代理对算一个码点。只有这一支需要合并两个 UTF-16 码元；绝大多数
    // 中英文文档仍走整数比较，不调用 codePointAt 或构造字符。
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
  // ⚠️ 这个除数**曾经是写死的 250**（"200 是英文、300 更贴中文，取折中"）。
  // 2026-09-25 起改用设置里的「阅读速度」（`appearance.reading_speed`，
  // 默认 382——中文常见取值）：那一条自己的说明写着"只用于把总字数换算成
  // 状态栏里的「约几分钟读完」"，而它当时**没有任何读取者**，界面上显示的
  // 是按 250 算的。现在两边是同一个数。
  //
  // ⚠️ 兜底：手改过设置文件的人可能写一个 0 进来（除以 0 会得到 Infinity，
  // 状态栏上就是「约 Infinity 分钟」）。低于 1 一律按默认值算。
  const speedDegree = Number.isFinite(readingSpeed) && readingSpeed >= 1 ? readingSpeed : 382;
  const readingMinutes = Math.max(1, Math.round(words / speedDegree));

  return { characters, words, lines, readingMinutes };
}
