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

export function countText(markdown: string, readingSpeed: number): Counts {
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
  // ⚠️ 这个除数**曾经是写死的 250**（"200 是英文、300 更贴中文，取折中"）。
  // 2026-09-25 起改用设置里的「阅读速度」（`appearance.reading_speed`，
  // 默认 382——中文常见取值）：那一条自己的说明写着"只用于把总字数换算成
  // 状态栏里的「约几分钟读完」"，而它当时**没有任何读取者**，界面上显示的
  // 是按 250 算的。现在两边是同一个数。
  //
  // ⚠️ 兜底：手改过设置文件的人可能写一个 0 进来（除以 0 会得到 Infinity，
  // 状态栏上就是「约 Infinity 分钟」）。低于 1 一律按默认值算。
  const 速度 = Number.isFinite(readingSpeed) && readingSpeed >= 1 ? readingSpeed : 382;
  const readingMinutes = Math.max(1, Math.round(words / 速度));

  return { characters, words, lines, readingMinutes };
}
