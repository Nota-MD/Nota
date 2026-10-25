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
 * - **词数**：CJK 字符**逐字算一个词**，其余按空白切。这是中英混排下最贴近
 *   直觉的口径；纯按空白切会把整段中文算成 1 个词（显然不对）。
 */
export interface Counts {
  characters: number;
  words: number;
  lines: number;
  /** 预计阅读分钟数，至少 1。⚠️ 按调用者给的**阅读速度**算（`countText` 的第二个参数）。 */
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

/**
 * 非 ASCII 文字与数字的判断。ASCII 在扫描器里走整数快路径，避免为大文件
 * 每个字符构造临时字符串并执行 Unicode 正则。
 */
const nonASCIISingleWordCharacter = /[\p{L}\p{N}'’-]/u;

export function countText(markdown: string, readingSpeed: number): Counts {
  let characters = 0;
  let words = 0;
  let lines = markdown === "" ? 0 : 1;
  let inWord = false;

  // 一遍扫描同时得到码点数、词数与行数。大文件上不能先 spread 成数组，
  // 也不能给每个 ASCII 字母创建一个临时字符串。
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
      if (inWord) {
        words += 1;
        inWord = false;
      }
    } else if (isCjk(cp)) {
      if (inWord) {
        words += 1;
        inWord = false;
      }
      words += 1;
    } else if (
      cp < 0x80
        ? (cp >= 0x30 && cp <= 0x39) ||
          (cp >= 0x41 && cp <= 0x5a) ||
          (cp >= 0x61 && cp <= 0x7a) ||
          cp === 0x27 ||
          cp === 0x2d
        : nonASCIISingleWordCharacter.test(String.fromCodePoint(cp))
    ) {
      inWord = true;
    } else if (inWord) {
      words += 1;
      inWord = false;
    }
  }
  if (inWord) words += 1;
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
