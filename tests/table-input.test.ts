/**
 * `table-input.ts` 的**判据**（纯函数那几件）。
 *
 * 这里能证明的：一行文字在这边的判据下算不算表格行。这里**不能**证明的：
 * 真窗口里敲下去到底会不会建表——那要 `docs/06` §5.36 那套目检（BUG-51 就是
 * "单测都对、真窗口不动"的典型，所以两边都要跑）。
 *
 * 六组：一 拆单元格、二 判分隔行（含"别把 `---` 当分隔行"那道闸）、
 * 三 判两行、四 **NBSP（BUG-51 的回归）**、五 那道「匹配盖住整段」的闸、
 * 六 输入规则的正则。
 */
import {
  splitTableCells,
  matchCoverHoldWholeParagraph,
  isTwoRowTable,
  isHeaderRow,
  determineSeparatorLine,
  shrinkEnterPassDark,
  receiveTailOfSeparatorLine,
  type cell,
} from "../src/editor/table-input";
// 码点只在 `atom-space.ts` 写一次，测试这边同样引名字，不在本文件里手敲那颗字符。
import { Nbsp } from "../src/editor/atom-space";

let pass = 0;
let fail = 0;
const failure: string[] = [];

function assertion(name3: string, actual2: unknown, period: unknown): void {
  const a = JSON.stringify(actual2);
  const b = JSON.stringify(period);
  if (a === b) {
    pass += 1;
  } else {
    fail += 1;
    failure.push(`${name3}\n    实际 ${a}\n    期望 ${b}`);
  }
}

/** 拆出来的格子只看文字（偏移那一组另有断言）。 */
const text3 = (cell2: cell[]): string[] => cell2.map((g) => g.text2);

// ── 一、拆单元格 ──────────────────────────────────────────────
assertion("两侧边框不算格子", text3(splitTableCells("| a | b |")), ["a", "b"]);
assertion("边框是可选的", text3(splitTableCells("a | b")), ["a", "b"]);
assertion("末尾那个空格子要留着（`| a ||` 是 2 格）", text3(splitTableCells("| a ||")), ["a", ""]);
assertion("一根光秃秃的竖线不成行", text3(splitTableCells("|")), []);
assertion("`\\|` 是内容里的竖线", text3(splitTableCells("| a \\| b | c |")), ["a \\| b", "c"]);
assertion("格子两侧的空白去掉", text3(splitTableCells("|   a   |  b  |")), ["a", "b"]);
assertion("偏移指回原行（含两侧空白）", splitTableCells("| a | b |"), [
  { text2: "a", start4: 2, endPoint: 3 },
  { text2: "b", start4: 6, endPoint: 7 },
]);

// ── 二、判分隔行 ──────────────────────────────────────────────
assertion("`---` 自己不是分隔行（交给分割线）", determineSeparatorLine("---"), null);
assertion("带冒号的认得出", determineSeparatorLine("| :-: | - |"), ["center", null]);
assertion("⚠️ 没冒号是 null 不是 'left'", determineSeparatorLine("| - | - |"), [null, null]);
assertion("`:--` 是左对齐", determineSeparatorLine("| :-- | --: |"), ["left", "right"]);
assertion("格子里有别的字就不算", determineSeparatorLine("| -x | - |"), null);
assertion("缩进 4 列是代码块", determineSeparatorLine("    | - | - |"), null);
assertion("空行不算表头行", isHeaderRow(""), null);
assertion("只有竖线的行不算表头行", isHeaderRow("|"), null);
assertion("缩进宽度 Tab 算 4", shrinkEnterPassDark("\t| a |"), true);
assertion("两列空格不算缩进", shrinkEnterPassDark("  | a |"), false);

// ── 三、判两行 ────────────────────────────────────────────────
assertion("列数一致才成表", isTwoRowTable("| a | b |", "| - | - |") !== null, true);
assertion("列数对不上不成表", isTwoRowTable("| a | b |", "| - |"), null);
assertion("表头搬进来的是格子文字", isTwoRowTable("| a | b |", "| - | - |")?.header, [
  { text2: "a", start4: 2, endPoint: 3 },
  { text2: "b", start4: 6, endPoint: 7 },
]);

// ── 四、NBSP（BUG-51 的回归）───────────────────────────────────
// 真窗口里手打的表格行，空格**全是** NBSP（WebKit 在行末插空格会换成它）。
const head2 = `|${Nbsp}1${Nbsp}|${Nbsp}2${Nbsp}|${Nbsp}3${Nbsp}|`;
const separate = `|${Nbsp}---${Nbsp}|${Nbsp}---${Nbsp}|${Nbsp}---${Nbsp}|`;

assertion("NBSP 当空白：格子拆得出来", text3(splitTableCells(separate)), ["---", "---", "---"]);
assertion("NBSP 当空白：分隔行认得出", determineSeparatorLine(separate), [null, null, null]);
assertion("NBSP 当空白：两行成表（BUG-51 本体）", isTwoRowTable(head2, separate) !== null, true);
assertion("NBSP 当空白：表头文字干净（NBSP 不进格子）", text3(isTwoRowTable(head2, separate)!.header), [
  "1",
  "2",
  "3",
]);
assertion("表头格子文字里没有 NBSP（padding 被丢掉）", splitTableCells(head2).some((g) => g.text2.includes(Nbsp)), false);
assertion("旧行为没变：ASCII 空格照样行", isTwoRowTable("| 1 | 2 | 3 |", "| --- | --- | --- |") !== null, true);
assertion("半 NBSP 半 ASCII 也认（用户打了一半的样子）", isTwoRowTable("| 1 | 2 | 3 |", separate) !== null, true);
// ⚠️ 三列的表头配两列的分隔行**不该**成表——两列那条是**对**的（`| --- | --- |`
//    首尾竖线是边框，只有 2 格；这条以前在真窗口里误导过一次排查）。
assertion("列数对不上就是不成表（三列头配两组横线）", isTwoRowTable(head2, "| --- | --- |"), null);

// ── 五、那道「匹配盖住整段」的闸（BUG-51 的真凶） ──────────────
// 匹配串是 `prosemirror-inputrules` 拿「文档文字 ＋ 刚敲进去那颗字符」拼的，
// 而文档那颗在行末会是不换行空格——逐字比会在**正当**情况下翻车。
assertion("ASCII：匹配盖住整段", matchCoverHoldWholeParagraph("| --- | --- | --- |", "| --- | --- | --- "), true);
assertion("⚠️ NBSP：文档那颗是 NBSP、匹配串那颗是竖线，也算盖住", matchCoverHoldWholeParagraph(`| ---${Nbsp}|`, `| ---${Nbsp}`), true);
assertion("NBSP 在半路也算盖住", matchCoverHoldWholeParagraph(`|${Nbsp}1${Nbsp}|${Nbsp}2${Nbsp}|`, `|${Nbsp}1${Nbsp}|`), true);
assertion("没盖住（匹配短一截）就不算", matchCoverHoldWholeParagraph("| --- |", "| --- | --- | --- "), false);
assertion("段落长过窗口时匹配只是尾巴：照样挡住（这道闸的本意）", matchCoverHoldWholeParagraph("| --- |", "甲".repeat(600) + "| --- |"), false);

// ── 六、输入规则那条正则 ──────────────────────────────────────
assertion("完整的分隔行（ASCII）", receiveTailOfSeparatorLine.test("| --- | --- |"), true);
assertion("完整的分隔行（全 NBSP）", receiveTailOfSeparatorLine.test(separate), true);
assertion("开头带冒号的也认", receiveTailOfSeparatorLine.test("| :---: | --- |"), true);
assertion("少了收尾竖线不认（那一路归回车）", receiveTailOfSeparatorLine.test("| --- | ---"), false);
assertion("`---` 不认（交给分割线）", receiveTailOfSeparatorLine.test("---"), false);
assertion("普通文字不认", receiveTailOfSeparatorLine.test("| 甲 | 乙 |"), false);

console.log(`通过 ${pass} 条，失败 ${fail} 条`);
if (fail) {
  for (const f of failure) console.log(`  ✗ ${f}`);
  process.exit(1);
}
