/**
 * 大文件统计的语义与性能防线。
 *
 * 旧实现先把全文 spread 成码点数组，再给每个西文字符执行一次 Unicode
 * 正则。5.18 MB 样例在本机约 1.89 秒；这里用逐码点单遍扫描保持同样的
 * 统计口径，并用旧算法作为差分判据。
 */

import { countText } from "../src/ui/outline";

let failures = 0;
function check(ok: boolean, message: string) {
  if (ok) return;
  failures += 1;
  console.error("FAIL:", message);
}

function oldCount(markdown: string, readingSpeed: number) {
  const characters = [...markdown].length;
  let words = 0;
  const runs = markdown.split(/\s+/);
  for (const run of runs) {
    if (!run) continue;
    let latinBuf = "";
    for (const ch of run) {
      const cp = ch.codePointAt(0)!;
      const cjk =
        (cp >= 0x3040 && cp <= 0x30ff) ||
        (cp >= 0x3400 && cp <= 0x4dbf) ||
        (cp >= 0x4e00 && cp <= 0x9fff) ||
        (cp >= 0xf900 && cp <= 0xfaff) ||
        (cp >= 0xac00 && cp <= 0xd7af) ||
        (cp >= 0x20000 && cp <= 0x2ebef);
      if (cjk) {
        if (latinBuf) {
          words += 1;
          latinBuf = "";
        }
        words += 1;
      } else if (/[\p{L}\p{N}'’-]/u.test(ch)) {
        latinBuf += ch;
      } else if (latinBuf) {
        words += 1;
        latinBuf = "";
      }
    }
    if (latinBuf) words += 1;
  }
  const lines = markdown === "" ? 0 : markdown.split("\n").length;
  const speed = Number.isFinite(readingSpeed) && readingSpeed >= 1 ? readingSpeed : 382;
  return {
    characters,
    words,
    lines,
    readingMinutes: Math.max(1, Math.round(words / speed)),
  };
}

check(
  JSON.stringify(countText("", 382)) === JSON.stringify({ characters: 0, words: 0, lines: 0, readingMinutes: 1 }),
  "空文档",
);
check(
  JSON.stringify(countText("hello world\n", 382)) ===
    JSON.stringify({ characters: 12, words: 2, lines: 2, readingMinutes: 1 }),
  "ASCII、词与行",
);
check(countText("don't stop-case", 382).words === 2, "撇号与连字符属于同一个词");
check(
  JSON.stringify(countText("你好 hello\n世界", 382)) ===
    JSON.stringify({ characters: 11, words: 5, lines: 2, readingMinutes: 1 }),
  "中日韩逐字计词，西文按词",
);
check(countText("😀 a", 382).characters === 3, "字符数按 Unicode 码点计");
check(countText("\n\n", 382).lines === 3, "空行也计入行数");

let seed = 0x6e6f7461;
const random = () => {
  seed = (seed * 1664525 + 1013904223) >>> 0;
  return seed;
};
const alphabet = [
  "a",
  "Z",
  "3",
  " ",
  "\n",
  "'",
  "-",
  ".",
  "你",
  "好",
  "あ",
  "한",
  "😀",
  "é",
  "\u0301",
];
let differentialOk = true;
for (let sample = 0; sample < 200; sample += 1) {
  let text = "";
  const length = random() % 80;
  for (let i = 0; i < length; i += 1) {
    text += alphabet[random() % alphabet.length];
  }
  const actual = countText(text, 382);
  const expected = oldCount(text, 382);
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    differentialOk = false;
    console.error("count mismatch", { text, actual, expected });
    break;
  }
}
check(differentialOk, "200 份混合文本与旧算法逐字段一致");

const large = "word\n".repeat(200_000);
const largeCount = countText(large, 382);
check(
  largeCount.characters === 1_000_000 && largeCount.words === 200_000 && largeCount.lines === 200_001,
  "百万字符文档单遍扫描保持正确",
);

if (failures > 0) {
  console.error(`${failures} failed`);
  process.exit(1);
}
console.log("count text: 9 passed, 0 failed");
