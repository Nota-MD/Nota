/**
 * `src/editor/auto-correct.ts`（自动更正）的**可运行**测试集。
 * 2026-09-27 写，与那个文件同批落地。
 *
 * # 跑法（不装任何包：`esbuild` 与 `node` 仓库里都现成）
 *
 * ```sh
 * cd <仓库>
 * npx esbuild tests/auto-correct.test.ts --bundle --platform=node --format=esm \
 *   --outfile=/tmp/nota-测试/auto-correct.mjs
 * node /tmp/nota-测试/auto-correct.mjs
 * ```
 *
 * 全过退出码 0；有不过的退出码 1，并把名字列出来。
 *
 * # 这份测试盯的是什么
 *
 * 这一格与"智能标点"最大的不同是：**它的对错由一张表决定**，而表里的错
 * 不会在屏幕上显示成"异常"——只显示成"用户打对了的词被改错了"。所以四组判据：
 *
 * - 一、**遍历整张表**：每一条的键都能被改出它自己的值。⚠️ 这一条是**防死行**
 *   的（键大小写写歪、键与值写反、值里混进大写字母，都会在这儿现形）；
 * - 二、`改词` 的大小写三档，以及**混着写的不猜**；
 * - 三、**入表判据**：那批"本身是合法英文词"的一个都不许在表里；
 * - 四、`词尾正则` 的边界——触发字符只有空格与制表符、中文不碰、
 *   `xthe` 不会被挑成 `the`。
 *
 * # ⚠️ 这份测试**证明不了**什么
 *
 * - ⚠️⚠️ **「打完 `teh` 再敲空格，屏幕上当场变成 `the`」这条主路径没验**，
 *   只验到「`自动更正输入(true)` 挂了 1 条规则」。真跑要 `Editor.make()` ＋
 *   真 DOM（本仓没有 jsdom，也不许为这件事装包）。**这是最大的空白。**
 * - ⚠️ **「`Ctrl+Z` 能退回去」没验**：那是 `prosemirror-inputrules` 的插件
 *   状态 ＋ 真 history 插件的事，两者都要真 view。文件头把"可撤销"写成了
 *   这条口径的**代价上限**，所以它在 `docs/07` 那一项里列为开窗目检的一条
 *   （敲 `teh` → 空格 → `Ctrl+Z`，看是不是回到 `teh`）。
 * - **行内代码里不触发**没验（`inCodeMark: false` 那一句走的是真 view 的分支）。
 * - **它猜错了会怎样**只能靠上面那条目检——`词尾正则` 与 `改词` 能保证
 *   "只在那几种情况下动手"，保证不了"用户本来就想打那个错词"。
 */

import {
  errorCombineTable,
  replaceWord,
  wordTailCorrectRule,
  selfActionMoreCorrectInput,
} from "../src/editor/auto-correct";

/* ── 一支极小的测试工装（与 `inline-marks.test.ts` 同一套长相）── */

let pass = 0;
let fail = 0;
const failed: string[] = [];

function testCase(name: string, body3: () => void): void {
  try {
    body3();
    pass++;
    console.log(`  ✔ ${name}`);
  } catch (e) {
    fail++;
    failed.push(name);
    console.log(`  ✘ ${name}`);
    console.log(`      ${e instanceof Error ? e.message : String(e)}`);
  }
}

function group(name3: string): void {
  console.log(`\n【${name3}】`);
}

function equal(actual: unknown, expected: unknown, description: string): void {
  if (actual !== expected) {
    throw new Error(`${description}：期望 ${JSON.stringify(expected)}，实际 ${JSON.stringify(actual)}`);
  }
}

/* ── 一、整张表 ─────────────────────────────────────────────────────── */

group("一、整张表（防死行）");

testCase("每一条的键都能被改出它自己的值", () => {
  // ⚠️ 防死行：键写歪了、值写反了、值里混进大写字母，都会在这里现形。
  // 一张"看着有四十条、其实十条不生效"的表是最难被发现的坏法。
  const bad: string[] = [];
  for (const [error2, correct2] of Object.entries(errorCombineTable)) {
    if (replaceWord(error2) !== correct2) bad.push(`${error2} → ${correct2}（实际 ${replaceWord(error2)}）`);
  }
  if (bad.length) throw new Error(`表里有 ${bad.length} 条不生效：\n      ${bad.join("\n      ")}`);
});

testCase("键一律小写、值一律小写", () => {
  // ⚠️ 这两条是硬约定（文件头写了"键一律小写、值一律小写"），
  // 破了不会报错，只会静默失效——因为查表用的是 `词.toLowerCase()`：
  // 一个含大写的**键**永远查不到，一个含大写的**值**会在首字母大写那一档
  // 被拼出 `The` 这种半截大写的怪东西。
  const bad = Object.entries(errorCombineTable).filter(([error2, correct2]) => error2 !== error2.toLowerCase() || correct2 !== correct2.toLowerCase());
  if (bad.length) throw new Error(`有 ${bad.length} 条不是全小写：${JSON.stringify(bad)}`);
});

testCase("没有一条是把自己改成自己", () => {
  const sameOf = Object.entries(errorCombineTable).filter(([error2, correct2]) => error2 === correct2).map(([error2]) => error2);
  if (sameOf.length) throw new Error(`自己改自己：${sameOf.join("、")}`);
});

testCase("表不是空的，而且规模在「几十条」这个量级", () => {
  // ⚠️ 上界那一半是**防手滑**：这张表是"固定的一小张"，不是词库。
  // 真有人想把英文字典搬进来时，这一条会先拦住他。
  const n = Object.keys(errorCombineTable).length;
  if (n < 20) throw new Error(`只有 ${n} 条，是不是被误删了？`);
  if (n > 120) throw new Error(`有 ${n} 条，这张表该是"一小张固定表"，不是词库`);
});

/* ── 二、改词：大小写三档 ───────────────────────────────────────────── */

group("二、改词：大小写跟着原词走");

testCase("全小写：照搬表里的值", () => {
  equal(replaceWord("teh"), "the", "teh");
  equal(replaceWord("dont"), "don't", "dont");
});

testCase("只有首字母大写：值的首字母也大写", () => {
  equal(replaceWord("Teh"), "The", "Teh");
  equal(replaceWord("Dont"), "Don't", "Dont");
  equal(replaceWord("Recieve"), "Receive", "Recieve");
});

testCase("全大写：值整个大写", () => {
  equal(replaceWord("TEH"), "THE", "TEH");
  equal(replaceWord("DOESNT"), "DOESN'T", "DOESNT");
});

testCase("大小写混着写的不猜（原样放过）", () => {
  // `tEh` 是用户**故意**写的（驼峰标识符、玩梗）。把它改成 `The` 是这份表
  // 最不该做的事，所以这一档恒为 null。
  equal(replaceWord("tEh"), null, "tEh");
  equal(replaceWord("TeH"), null, "TeH");
  equal(replaceWord("DonT"), null, "DonT");
});

testCase("不在表里的词原样放过", () => {
  equal(replaceWord("the"), null, "the 本来就是对的不该再改");
  equal(replaceWord("hello"), null, "hello");
  equal(replaceWord(""), null, "空串");
  equal(replaceWord("123"), null, "数字");
});

/* ── 三、入表判据 ─────────────────────────────────────────────────── */

group("三、入表判据：小写形式是合法英文词的一个都不收");

testCase("本身是合法英文词的一律不在表里", () => {
  // ⚠️ 这是本文件**最要紧**的一条：收进去的症状是"把对的改成错的"，
  // 而那是这份表唯一不能犯的错（`wont` 是"习惯"、`wether` 是"阉羊"、
  // `cant` 是"伪善的言语"、`lets` 是"出租"、`its` 是"它的"）。
  const ban = [
    "cant",
    "wont",
    "wether",
    "lets",
    "its",
    "were",
    "where",
    "then",
    "form",
    "from",
    "alot",
  ];
  const leakOf = ban.filter((w) => w in errorCombineTable);
  if (leakOf.length) throw new Error(`这些是合法英文词（或不是"一词换一词"），不该入表：${leakOf.join("、")}`);
});

testCase("表里没有「一变二」的条目", () => {
  // 判据：值里不含空格。`alot` → `a lot` 那种会让"换了几个字符"和
  // "插入了几个字符"分开算，处理器得为它改形状（见文件头）。
  const withEmpty = Object.entries(errorCombineTable).filter(([, correct2]) => /\s/.test(correct2)).map(([error2]) => error2);
  if (withEmpty.length) throw new Error(`"一变二"的条目：${withEmpty.join("、")}`);
});

/* ── 四、词尾正则的边界 ─────────────────────────────────────────────── */

group("四、词尾正则的边界");

/** 取匹配到的那个词（没匹配上给 null）。 */
function match(text4: string): string | null {
  const m = wordTailCorrectRule.exec(text4);
  return m ? m[1]! : null;
}

testCase("空格与制表符触发", () => {
  equal(match("teh "), "teh", "空格");
  equal(match("teh\t"), "teh", "制表符");
  equal(match("I said teh "), "teh", "在一句话末尾");
});

testCase("没有词尾空白就不触发", () => {
  equal(match("teh"), null, "还没打空格");
  equal(match(""), null, "空串");
  equal(match(" "), null, "只有空格");
});

testCase("逗号句号那一族不触发（已知边界）", () => {
  // ⚠️ 这条是**有意**挡住的：触发字符只有空格与制表符，所以 `teh,` 得
  // 等用户敲空格才更正。文件头"已知边界"第一条写的就是它。
  equal(match("teh,"), null, "逗号");
  equal(match("teh."), null, "句号");
  equal(match("teh)"), null, "右括号");
});

testCase("更长的字母串整个算一个词，查表会落空", () => {
  // ⚠️ **不加 `\b`** 的后果就是这个：`xthe ` 拿出的是 `xthe`，
  // 查表落空、什么都不做。这正是想要的（加了 `\b` 反而会挑出里面的 `the`）。
  equal(match("xthe "), "xthe", "前缀");
  equal(replaceWord("xthe"), null, "查表落空");
});

testCase("中文不碰", () => {
  equal(match("中文 "), null, "纯中文");
  equal(
    match("说teh "),
    "teh",
    "⚠️ 中文紧挨着也算一个词（中文之间没有空格，所以这里不额外挡——"
      + "挡了会让「打完中文接着打英文」时永远不更正）",
  );
});

testCase("带撇号的词整个算一个词", () => {
  equal(match("don't "), "don't", "已有撇号");
  equal(replaceWord("don't"), null, "已经在表之外");
});

testCase("很长的一串也照拿（由 `改词` 落空，不在这里挡）", () => {
  equal(match("aaaaaaaaaaaaaaaaaaaaaaaaaaaaaa "), "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaa", "长串");
});

/* ── 五、装配 ───────────────────────────────────────────────────────── */

group("五、装配");

testCase("关着的时候一条规则都不挂", () => {
  equal(selfActionMoreCorrectInput(false).length, 0, "关");
});

testCase("开着的时候挂 1 条", () => {
  equal(selfActionMoreCorrectInput(true).length, 1, "条数");
});

/* ── 收尾 ─────────────────────────────────────────────────────────────── */

console.log(`\n${"─".repeat(64)}`);
console.log(`通过 ${pass} 条，失败 ${fail} 条`);
if (fail) {
  console.log(`失败的：\n  - ${failed.join("\n  - ")}`);
  process.exitCode = 1;
}
