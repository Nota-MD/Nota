/**
 * 从 markdown 正文抽大纲。
 *
 * # 为什么在前端用正则扫，而不是问后端要
 *
 * 后端也有 markdown（镜像），但**镜像是去抖的**——打字时它会慢 300ms。
 * 大纲要跟着光标附近的标题实时跳，用那份数据会看到明显的一顿一顿。
 * 前端手里就是最新的文本，扫一遍是 O(行数)，几千行的文档也就微秒级。
 *
 * ⚠️ 这是**启发式**，不是真解析。它认不出 HTML 块里的 `#`、也认不出
 * 缩进代码块（四空格那种）里的 `#`。真解析要过 remark，而为一个侧栏列表
 * 引入完整 AST 不划算。已知误差见 `docs/07`；真出问题时再换 remark。
 */

export interface OutlineItem {
  level: number;
  text: string;
  /** 在正文里的行号（0 起），将来做"点了跳过去"要用。 */
  line: number;
}

export function extractOutline(markdown: string): OutlineItem[] {
  const out: OutlineItem[] = [];
  let inFence = false;
  let inFrontMatter = false;

  const lines = markdown.split("\n");
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!;

    // ── front matter：只在文件最开头才算，跳过整段 ──────────────────────
    if (i === 0 && line.trimEnd() === "---") {
      inFrontMatter = true;
      continue;
    }
    if (inFrontMatter) {
      const t = line.trimEnd();
      if (t === "---" || t === "...") inFrontMatter = false;
      continue;
    }

    // ── 围栏代码块：里面的 `#` 是注释，不是标题 ─────────────────────────
    const trimmed = line.trimStart();
    if (trimmed.startsWith("```") || trimmed.startsWith("~~~")) {
      inFence = !inFence;
      continue;
    }
    if (inFence) continue;

    // ── ATX 标题 ────────────────────────────────────────────────────────
    const m = /^(#{1,6})\s+(.*)$/.exec(trimmed);
    if (!m) continue;

    const text = m[2]!.trim().replace(/\s*#+\s*$/, "").trim();
    if (!text) continue;

    out.push({ level: m[1]!.length, text, line: i });
  }

  return out;
}

/**
 * 数字数。
 *
 * 口径（对齐 Typora 的状态栏）：
 * - **字符数**按**码点**算，不是 UTF-16 码元——否则一个 emoji 会被算成 2，
 *   一个字的中文倒是对的（1）。混排时两种算法的差会让人对不上数。
 * - **词数**：CJK 字符**逐字算一个词**，其余按空白切。这是中英混排下最贴近
 *   直觉的口径；纯按空白切会把整段中文算成 1 个词（显然不对）。
 */
export interface Counts {
  characters: number;
  words: number;
  lines: number;
  /** 预计阅读分钟数，至少 1。 */
  readingMinutes: number;
}

/** 粗略判一个码点算不算 CJK（含中日韩、全角标点）。 */
function isCjk(cp: number): boolean {
  return (
    (cp >= 0x3040 && cp <= 0x30ff) || // 日文假名
    (cp >= 0x3400 && cp <= 0x4dbf) || // 扩展 A
    (cp >= 0x4e00 && cp <= 0x9fff) || // 基本汉字
    (cp >= 0xf900 && cp <= 0xfaff) || // 兼容汉字
    (cp >= 0xac00 && cp <= 0xd7af) || // 谚文
    (cp >= 0x20000 && cp <= 0x2ebef) // 扩展 B~F
  );
}

export function countText(markdown: string): Counts {
  const characters = [...markdown].length;

  let words = 0;
  // 先按"非letter/数字/空白"切成块，再在块里数 CJK 与非 CJK 词。
  const runs = markdown.split(/\s+/);
  for (const run of runs) {
    if (!run) continue;
    let latinBuf = "";
    for (const ch of run) {
      const cp = ch.codePointAt(0)!;
      if (isCjk(cp)) {
        if (latinBuf) {
          words += 1;
          latinBuf = "";
        }
        words += 1;
      } else if (/[\p{L}\p{N}'’-]/u.test(ch)) {
        latinBuf += ch;
      } else {
        // 标点：把攒着的那个词收掉
        if (latinBuf) {
          words += 1;
          latinBuf = "";
        }
      }
    }
    if (latinBuf) words += 1;
  }

  const lines = markdown === "" ? 0 : markdown.split("\n").length;
  // 200 词/分钟是英文的常见估算；中文按字算的话 300 更接近。
  // 这里不细分语种，取 250 作为折中，**只当作粗略参考**。
  const readingMinutes = Math.max(1, Math.round(words / 250));

  return { characters, words, lines, readingMinutes };
}
