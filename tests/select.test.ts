/**
 * `src/editor/select.ts` 那**两组纯函数**的测试集（「选择」这一族命令的判据，
 * 2026-10-07 接上 `Ctrl+L` / `Ctrl+D` / `Ctrl+E` / `Ctrl+Shift+D` 那天）。
 *
 * # 跑法（不装任何包：`esbuild` 与 `node` 仓库里都现成）
 *
 * ```sh
 * cd <仓库>
 * npx esbuild tests/select.test.ts --bundle --platform=node --format=esm \
 *   --alias:@=./src --outfile=/tmp/nota-测试/select.mjs
 * node /tmp/nota-测试/select.mjs
 * ```
 *
 * ⚠️ **两个开关都不要**（本批现场核过一遍）：这条链上没有一个 `@/…`（`select.ts`
 * 只从 `@milkdown/kit/…` 进），也没有一个 svg。所以它就是 `docs/06` §6.3 那个
 * `for` 循环里的普通一份。
 *
 * # 测的是哪两组
 *
 * | 组 | 吃什么 | 用例在哪 |
 * |---|---|---|
 * | 一：`选词区间` / `选句区间` | 一段**纯文本** ＋ 一个字符偏移 | 第一、二组 |
 * | 二：`行区间` / `词区间` / `句区间` | 一棵 **ProseMirror 文档** ＋ 一个位置 | 第三组 |
 *
 * ⚠️ **第三组是"薄薄一层换算"**（块首那几个字符的差），真正"哪个字算一个词"
 * 的判据全在第一组——两种模式共用它（`select.ts` 文件头）。
 *
 * # ⚠️ 这份测试**证明不了**什么
 *
 * - **键按下去真的选上了没有**：`选行` / `选词` / `选句` / `删词` 四条要一份
 *   真的 `EditorView`（`editor.action` 得拿到 `editorViewCtx`），本仓没有
 *   jsdom（见 `tests/fake-dom.ts` 文件头），建不出来。这里测的是**判据**：
 *   该选的区间是哪一个。开窗那一次在 `docs/06`。
 * - **`Intl.Segmenter` 的分词结果**：它是**环境**给的（ICU 版本不同会变），
 *   所以 ASCII 那几条按本机实测钉死（`Intl.Segmenter` 对 `"hello world"` 这种
 *   是稳的），中文只钉"包含关系"（选的区间**落在**那个词里、且**包含**那个字），
 *   不钉"到底是几个字"。
 * - **源码模式那一侧**：那边调的是同一组纯函数（`source-commands.ts`），
 *   所以判据一样；但"光标在源码里第几行"那一步要真的 CodeMirror（也要 DOM）。
 */

import { Schema } from "@milkdown/kit/prose/model";
import type { Node as PMNode } from "@milkdown/kit/prose/model";
import { sentenceRange2, lineRange, wordRange2, sentenceRange, wordRange } from "../src/editor/select";

/* ── 极小的测试工装（与 `heading-on-enter.test.ts` 同一套长相）───────────── */

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

function assertValue(condition: unknown, description: string): void {
  if (!condition) throw new Error(description);
}

/** 区间 → `"from-to"`（用例里写起来短，读起来也不绕）。 */
function shape2(area: { from: number; to: number } | null): string {
  return area ? `${area.from}-${area.to}` : "null";
}

/** 把一段文字切片出来（"选中的到底是哪几个字"）。 */
function split(text2: string, area: { from: number; to: number } | null): string | null {
  return area ? text2.slice(area.from, area.to) : null;
}

/* ── 第一组：选词 ─────────────────────────────────────────────────────── */

group("一、选词区间：三条判据（词里 / 贴词尾 / 空白里）");

const englishText = "hello world";

testCase("光标在词**里面** → 就是它", () => {
  equal(shape2(wordRange(englishText, 2)), "0-5", "hello");
  equal(shape2(wordRange(englishText, 8)), "6-11", "world");
});

testCase("光标**贴着词尾**（刚敲完那个词）→ 还是它", () => {
  // ⚠️ 这一条是 `Ctrl+D` 最常撞上的位置：半开区间 `[from, to)` 里，词尾那一点
  // **不在**词里，少了这条判据就会去选下一个词（见 `选词区间` 的注释）。
  equal(shape2(wordRange(englishText, 5)), "0-5", "hello 的尾巴");
  equal(shape2(wordRange(englishText, 11)), "6-11", "world 的尾巴");
});

testCase("光标在空白里 → 拿**前一个**词", () => {
  // ⚠️ 半开区间 `[from, to)`：`"hello world"` 里的空格只有第 5 那一格，
  // 而第 6 格**已经是 `world` 的第一个字符**（`选词区间(英文, 6)` 该给 world）。
  // 所以"落在空白里"这一条要用双空格的串来验。
  equal(shape2(wordRange("hello  world", 6)), "0-5", "两个空格之间（前一个词是 hello）");
  equal(shape2(wordRange(englishText, 6)), "6-11", "第 6 格是 world 的开头，不是空白");
});

testCase("前面没有词（行首的空白里）→ 拿后面那一个", () => {
  equal(shape2(wordRange("  hello", 0)), "2-7", "行首两个空格处");
  equal(shape2(wordRange("  hello", 1)), "2-7", "第二个空格处");
});

testCase("空文 / 纯空白 / 纯标点 → 没有词", () => {
  equal(shape2(wordRange("", 0)), "null", "空文");
  equal(shape2(wordRange("   ", 1)), "null", "纯空白");
  equal(shape2(wordRange("。，！", 1)), "null", "纯标点");
});

testCase("位置越界 → 夹回两端（不抛）", () => {
  equal(shape2(wordRange(englishText, -5)), "0-5", "负数");
  equal(shape2(wordRange(englishText, 999)), "6-11", "超出长度");
});

testCase("连字符两边是两个词（`a-b`：光标落在 `-` 上算 a）", () => {
  equal(shape2(wordRange("a-b", 1)), "0-1", "贴着 a 的尾巴");
  equal(shape2(wordRange("a-b", 2)), "2-3", "b 的开头");
});

testCase("数字串与小数点不分家（`3.14` 是一个词）", () => {
  equal(split("3.14 is pi", wordRange("3.14 is pi", 2)), "3.14", "小数点那一点");
});

testCase("中文：选的区间**包含**那个字，且落在同一个词里（不钉几个字——那是 ICU 的事）", () => {
  const text4 = "你好世界";
  const area = wordRange(text4, 1);
  assertValue(area !== null, "中文该选得出词来");
  assertValue(area!.from <= 1 && area!.to > 1, "要包含光标那一个字");
  assertValue(area!.from >= 0 && area!.to <= text4.length, "不能越界");
});

testCase("下划线连成一个词（`snake_case`）", () => {
  equal(split("snake_case 名", wordRange("snake_case 名", 4)), "snake_case", "下划线那一段");
});

/* ── 第二组：选句 ─────────────────────────────────────────────────────── */

group("二、选句区间：句读、刚写完那一句、小数点要躲开");

const middleSentence = "你好。再见。";

testCase("光标在句**里面** → 往两边找到句读（含结尾那个）", () => {
  equal(split(middleSentence, sentenceRange(middleSentence, 4)), "再见。", "第二句");
  equal(split(middleSentence, sentenceRange(middleSentence, 0)), "你好。", "第一句");
});

testCase("光标**正好贴着句读后面**（刚写完一句）→ 收**刚过去**那一句", () => {
  // ⚠️ 这是 `Ctrl+E` 最常撞上的位置：敲完 `你好。` 立刻按，选的必须是刚写完的
  // 那句，而不是下一句（见 `选句区间` 的注释）。
  equal(split(middleSentence, sentenceRange(middleSentence, 3)), "你好。", "`。` 的后面");
  equal(split(middleSentence, sentenceRange(middleSentence, 6)), "再见。", "最后那个 `。` 的后面");
});

testCase("半角 `!` / `?` / `;` 也算句读（用户可能中英混排）", () => {
  equal(split("a!b?", sentenceRange("a!b?", 0)), "a!", "感叹号");
  equal(split("a;b;", sentenceRange("a;b;", 3)), "b;", "分号（光标在 b 上）");
  equal(split("a;b;", sentenceRange("a;b;", 2)), "a;", "光标贴着分号后面 → 刚过去那一句");
});

testCase("逗号**不算**句读（它分的是短语）", () => {
  equal(split("一，二，三。", sentenceRange("一，二，三。", 4)), "一，二，三。", "整句一起");
});

testCase("小数点不算句读（`3.14` 不许在中间断开）", () => {
  equal(split("3.14 是圆周率。", sentenceRange("3.14 是圆周率。", 2)), "3.14 是圆周率。", "小数点躲开了");
});

testCase("换行算句读，但**不跟着选进去**（`\\n` 不留在区间里）", () => {
  const text4 = "第一行\n第二行";
  const two = sentenceRange(text4, 5);
  equal(split(text4, two), "第二行", "第二行（不含前面那个换行）");
  // 光标贴着换行后面 → 收刚过去那一行（同样不带那个换行）。
  const value = sentenceRange(text4, 4);
  equal(split(text4, value), "第一行", "刚过换行 → 上一行");
});

testCase("全是空白 / 空文 → 没有句子", () => {
  equal(shape2(sentenceRange("", 0)), "null", "空文");
  equal(shape2(sentenceRange("   ", 2)), "null", "纯空白");
});

testCase("两头的空白切干净（区间不含首尾空白）", () => {
  const text4 = "  你好。  ";
  const area = sentenceRange(text4, 3);
  equal(split(text4, area), "你好。", "首尾的空白都不进区间");
});

/* ── 第三组：ProseMirror 层的换算 ─────────────────────────────────────── */

group("三、行 / 词 / 句区间：块内偏移 → 文档位置");

const schema = new Schema({
  nodes: {
    doc: { content: "block+" },
    paragraph: { group: "block", content: "inline*" },
    text: { group: "inline" },
    // 代码块（`spec.code`）——`行区间` 那一族认了它就返回 `null`（见 `select.ts`
    // 文件头：那一段的选区归块里那颗 CodeMirror 管）。
    code_block: { content: "text*", group: "block", marks: "", code: true, defining: true },
    // 换行叶子：在文档里占**一个**位置（`leafText` 那一格要它）。
    hardbreak: { inline: true, group: "inline", selectable: false },
    // 行内原子（图片 / 行内公式那一档）：同样占一个位置，`leafText` 给 U+FFFC。
    atom: { group: "inline", inline: true, atom: true, selectable: false },
  },
});

/** 一棵"一个段落"的文档。 */
function oneParagraph(character2: string): PMNode {
  return schema.node("doc", null, [schema.node("paragraph", null, [schema.text(character2)])]);
}

/**
 * 把文档第一段摊成一段纯文本——**与 `select.ts::摊开块` 用同一个口径**
 * （硬换行给 `"\n"`、别的行内叶子给 U+FFFC 那个替身）。⚠️ 用例里要是自己
 * 另写一个口径（比如叶子给空串），算出来的偏移就和选区对不上了——而那种错
 * **不会报错，只会切错位置**，正好是这份测试要抓的东西。
 */
function flattenFlat(doc: PMNode): string {
  const block = doc.firstChild!;
  return block.textBetween(0, block.content.size, undefined, (leaf) =>
    leaf.type.name === "hardbreak" ? "\n" : "￼",
  );
}

/**
 * 把某个**文档位置**区间里的文字切出来。
 *
 * ⚠️ 段落的内容从文档位置 **1** 开始（0 是 doc 起点，段落自己那个开括号占 1），
 * 所以换算时要减掉这个"块首那几个字符的差"——这正是 `词区间` 那一族在做的
 * 唯一一件事。
 */
function splitParagraph(doc: PMNode, area: { from: number; to: number } | null): string | null {
  const text4 = flattenFlat(doc);
  return area ? text4.slice(area.from - 1, area.to - 1) : null;
}

testCase("段落里：行区间是整段（不含两头）", () => {
  const doc = oneParagraph("hello world");
  // ⚠️ 段落的**内容**从位置 1 开始（doc 起点 0、段落开括号占 1、内容长度 11）。
  equal(shape2(lineRange(doc, 3)), "1-12", "整段文字");
  const text4 = doc.textBetween(1, 12, undefined, () => "");
  equal(text4, "hello world", "切出来正好是那段文字");
});

testCase("段落里：词 / 句区间都跟着走", () => {
  const doc = oneParagraph("hello world");
  equal(shape2(wordRange2(doc, 1 + 2)), "1-6", "hello（块首那 1 个位置补上了）");
  const sentenceText = oneParagraph("你好。再见。");
  equal(shape2(sentenceRange2(sentenceText, 1 + 4)), "4-7", "再见。");
});

testCase("空段落 → 行 / 词 / 句都是 null（没有可选的）", () => {
  const doc = schema.node("doc", null, [schema.node("paragraph")]);
  equal(shape2(lineRange(doc, 1)), "null", "空段落");
  equal(shape2(wordRange2(doc, 1)), "null", "空段落");
});

testCase("代码块 → 一律 null（那一段的选区归块里那颗 CodeMirror）", () => {
  const doc = schema.node("doc", null, [schema.node("code_block", null, [schema.text("const a = 1;")])]);
  equal(shape2(lineRange(doc, 3)), "null", "行");
  equal(shape2(wordRange2(doc, 5)), "null", "词");
  equal(shape2(sentenceRange2(doc, 5)), "null", "句");
});

testCase("行内原子**占一个字符**（`leafText` 给的替身字符），偏移不许错位", () => {
  // 段落 = [atom][text "ab"]：原子占位置 1，`a` 在位置 2，`b` 在位置 3。
  const doc = schema.node("doc", null, [
    schema.node("paragraph", null, [schema.node("atom"), schema.text("ab")]),
  ]);
  // 原子那个替身字符（U+FFFC）不是词 —— 光标贴在它后面时给的是后面那个词。
  // ⚠️ 这一条的**判据**是"位置没错位"：`ab` 必须对上文档里的位置 2-4。
  equal(shape2(wordRange2(doc, 2)), "2-4", "原子之后的 ab（若替身少算一个字符，这里会偏一格）");
});

testCase("硬换行在句读扫描里算一个换行（`\\n`），但不留在区间里", () => {
  // 段落 = [text "ab"][hardbreak][text "cd"]：a=1 b=2 换行=3 c=4 d=5。
  const doc = schema.node("doc", null, [
    schema.node("paragraph", null, [
      schema.text("ab"),
      schema.node("hardbreak"),
      schema.text("cd"),
    ]),
  ]);
  // ⚠️ 位置 4 是**换行之后那一格的"c"**——光标贴在换行后面，按"刚写完那一句"
  // 那条判据收的是**上一行**（`ab`），与 `你好。|` 那一格同一个道理：换行
  // 也是句读（见 `选句区间`）。这一条是**故意**钉住的，别看到"c"就改成 cd。
  equal(splitParagraph(doc, sentenceRange2(doc, 4)), "ab", "光标贴在换行后面 → 上一行");
  equal(splitParagraph(doc, sentenceRange2(doc, 1)), "ab", "换行之前那一句（`a` 上）");
  equal(splitParagraph(doc, sentenceRange2(doc, 5)), "cd", "`d` 上 → 换行之后那一句");
  equal(splitParagraph(doc, sentenceRange2(doc, 6)), "cd", "段落末尾（贴着 `d` 的尾巴）→ 还是那一句");
});

testCase("位置落在**非文本块**上（doc 自己那层）→ null", () => {
  // `摊开块` 那条出口：`$pos.parent.isTextblock` 为假时说"这里没有可选的文字"。
  // 位置 0 的父节点就是 doc（顶层），它不是文本块。
  const doc = oneParagraph("hello");
  equal(shape2(lineRange(doc, 0)), "null", "doc 那一层");
});

/* ── 汇总 ─────────────────────────────────────────────────────────────── */

console.log("\n" + "─".repeat(64));
console.log(`通过 ${pass} 条，失败 ${fail} 条`);
if (fail) {
  console.log("失败的：");
  for (const n of failed) console.log(`  - ${n}`);
  process.exit(1);
}
