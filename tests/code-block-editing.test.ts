/**
 * `src/editor/code-block-cm.ts` 里那**几个纯函数**的判据
 * （backlog 第 101 项：代码块换成 CodeMirror 之后的编辑手感；
 * 第五组是 2026-10-07 补的空选区复制/剪切）。
 *
 * 跑法（不装任何包，`esbuild` 与 `node` 仓库里都现成）：
 *
 * ```sh
 * cd <仓库>
 * npx esbuild tests/code-block-editing.test.ts --bundle --platform=node --format=esm \
 *   --outfile=/tmp/nota-code-block-editing/code-block-editing.test.mjs
 * node /tmp/nota-code-block-editing/code-block-editing.test.mjs
 * ```
 *
 * # 为什么只测这三件
 *
 * 手感类的东西（配对、`Tab`、光标跳不跳）**只能开窗量**，这一份不假装能证。
 * 但下面这三件是**纯字符串算术**，而它们各自的边界条件正好是"错了也不会响、
 * 只会偶尔出一个怪字符"的那一类：
 *
 * - `算最小改动`：改动的起止**不许切在半个字符中间**（`"😀"` → `"😁"` 这种
 *   两版的高位码元相同，逐码元比就正好停在中间）。
 * - `分色`：区间要**拼回原文**（少一个字符就是高亮与文字错位一格，
 *   而且在深色主题下未必看得出来）。
 * - `回车续行`：缩进、再进一级、空括号展开三档的**光标落点**。
 * - `行界` / `整行剪贴`：空选区按复制/剪切拿走的是哪一段——**那个换行符带不带**
 *   是这一族唯一的难点（见第五组）。
 *
 * ⚠️ 它证明不了的（一律算未验）：CodeMirror 真的有没有装上、
 * 配对真的有没有发生、与 ProseMirror 的双向同步会不会抖。那些是开窗目检。
 */

import {
  shareColor,
  returnCarContinueLine,
  computeMostSmallChangeAction,
  wholeLineCutPaste,
  lineBoundary,
  needWantDelayDelayActiveColor,
} from "../src/editor/code-block-cm";
import {
  bootstrapCodeBlockExit,
  codeBlockExitTransaction,
  codeBlockSourceEdge,
  moveBootstrapCodeBlockCaret,
} from "../src/editor/code-block-boundary";
import { Schema } from "@milkdown/kit/prose/model";
import { EditorState, TextSelection } from "@milkdown/kit/prose/state";
import { readFileSync } from "node:fs";

/* ── 工装（与 `hints.test.ts` 同一套长相）────────────────────────────── */

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

/**
 * 相等断言。⚠️ 对象走 `JSON` 比：`{入, 出}` / `{from, to}` 那一族是**每次新建**
 * 的普通对象，用 `===` 的话每条都是红的，而报错信息里两边打印出来一模一样。
 */
function equal(actual: unknown, expected: unknown, description: string): void {
  const valueStyle =
    actual !== null && typeof actual === "object"
      ? JSON.stringify(actual) === JSON.stringify(expected)
      : actual === expected;
  if (!valueStyle) {
    throw new Error(`${description}：期望 ${JSON.stringify(expected)}，实际 ${JSON.stringify(actual)}`);
  }
}

function assertValue(condition: unknown, description: string): void {
  if (!condition) throw new Error(description);
}

/** 照 `算最小改动` 的结果把旧文变成新文——**这一条是所有用例的总判据**。 */
function heavyRelease(oldText: string, newText: string): string {
  const { deleteStart, deleteEnd, insert } = computeMostSmallChangeAction(oldText, newText);
  return oldText.slice(0, deleteStart) + insert + oldText.slice(deleteEnd);
}

/* ── 用例 ─────────────────────────────────────────────────────────────── */

group("一、算最小改动：朴素的四种");

testCase("两版一样 → 空改动（删起＝删到＝长度）", () => {
  const r = computeMostSmallChangeAction("abc", "abc");
  equal(r.deleteStart, 3, "删起");
  equal(r.deleteEnd, 3, "删到");
  equal(r.insert, "", "插入");
});

testCase("尾巴上加字", () => {
  const r = computeMostSmallChangeAction("ab", "abc");
  equal(r.deleteStart, 2, "删起");
  equal(r.deleteEnd, 2, "删到");
  equal(r.insert, "c", "插入");
});

testCase("中间换一个字", () => {
  const r = computeMostSmallChangeAction("abc", "aXc");
  equal(r.deleteStart, 1, "删起");
  equal(r.deleteEnd, 2, "删到");
  equal(r.insert, "X", "插入");
});

testCase("整段换掉", () => {
  const r = computeMostSmallChangeAction("abc", "xyz");
  equal(r.deleteStart, 0, "删起");
  equal(r.deleteEnd, 3, "删到");
  equal(r.insert, "xyz", "插入");
});

testCase("空 ↔ 非空", () => {
  const add = computeMostSmallChangeAction("", "x");
  equal(add.deleteStart, 0, "加：删起");
  equal(add.deleteEnd, 0, "加：删到");
  equal(add.insert, "x", "加：插入");

  const reduce = computeMostSmallChangeAction("x", "");
  equal(reduce.deleteStart, 0, "减：删起");
  equal(reduce.deleteEnd, 1, "减：删到");
  equal(reduce.insert, "", "减：插入");
});

group("二、算最小改动：字符边界（**错了只会偶尔出一个怪字**）");

testCase("换一个 emoji：不许切在高低位中间", () => {
  const r = computeMostSmallChangeAction("😀", "😁");
  equal(r.deleteStart, 0, "删起（要退到完整字符上）");
  equal(r.deleteEnd, 2, "删到（两码元一起换）");
  equal(r.insert, "😁", "插入");
});

testCase("同一个 emoji 后面再加一个：前缀停在中间也要退回来", () => {
  // ⚠️ 这一格的**前缀会一路走到第 2 个码元**（两个 emoji 的高低位都一样），
  // 真正断在第 3 个码元（`B` vs 第二个 emoji 的高位）——所以起点 2 是
  // **两边都合法的字符边界**（第一个 emoji 之后），改动是"在那儿插一个 emoji"。
  // 判据落在两个地方：重放要回新文、插入的那一段必须是一个**完整**的 emoji。
  equal(heavyRelease("😀B", "😀😀B"), "😀😀B", "重放");
  const r = computeMostSmallChangeAction("😀B", "😀😀B");
  equal(r.deleteStart, 2, "删起（第一个 emoji 之后，两边都合法）");
  equal(r.deleteEnd, 2, "删到（不删任何东西）");
  equal(r.insert, "😀", "插入");
});

testCase("末尾同一个 emoji 再补一个", () => {
  equal(heavyRelease("a😀", "a😀😀"), "a😀😀", "重放");
  const r = computeMostSmallChangeAction("a😀", "a😀😀");
  equal(r.deleteStart, 3, "删起");
  equal(r.deleteEnd, 3, "删到");
  equal(r.insert, "😀", "插入");
});

testCase("穷举一批配对：重放都要回到新文，且**不许剩下半个字符**", () => {
  const single = ["a", "b", "\n", " ", "😀", "😁", "你", "好"];
  const sample: string[] = ["", "a", "ab", "😀", "😀B", "你 好", "a\nb", "😀😀"];
  for (const x of single) for (const y of single) sample.push(x + y);
  for (const oldText of sample) {
    for (const newText of sample) {
      const obtain = heavyRelease(oldText, newText);
      equal(obtain, newText, `重放 ${JSON.stringify(oldText)} → ${JSON.stringify(newText)}`);
      // 孤立的代理码元（切在半个字符上）→ 就说明边界退得不对。
      for (let i = 0; i < obtain.length; i++) {
        const c = obtain.charCodeAt(i);
        const isHeightPosition = c >= 0xd800 && c <= 0xdbff;
        const isLowPosition = c >= 0xdc00 && c <= 0xdfff;
        if (!isHeightPosition && !isLowPosition) continue;
        const configure2 = isHeightPosition ? obtain.charCodeAt(i + 1) : obtain.charCodeAt(i - 1);
        assertValue(
          (isHeightPosition && configure2 >= 0xdc00 && configure2 <= 0xdfff) ||
            (isLowPosition && configure2 >= 0xd800 && configure2 <= 0xdbff),
          `结果里有孤立的代理码元：${JSON.stringify(obtain)} @${i}`,
        );
      }
    }
  }
});

group("三、分色：区间要能拼回原文");

testCase("空文、没给语言、不认识的语言 → 一个区间都没有（且不抛）", () => {
  equal(shareColor("", "javascript").length, 0, "空文");
  equal(shareColor("const a = 1", "").length, 0, "没给语言");
  equal(shareColor("const a = 1", "这门语言不存在").length, 0, "不认识的语言");
});

testCase("javascript：区间拼回去要逐字等于原文", () => {
  const text4 = "const a = 1; // 注释\nfunction f(x) { return \"s\"; }";
  const range = shareColor(text4, "javascript");
  assertValue(range.length > 0, "至少要分出几个区间来");
  let combine2 = "";
  let aboveTo = 0;
  for (const block of range) {
    assertValue(block.from >= aboveTo, `区间不许重叠/倒序：${JSON.stringify(block)} 跟在 ${aboveTo} 后面`);
    combine2 += text4.slice(aboveTo, block.from);
    combine2 += text4.slice(block.from, block.to2);
    aboveTo = block.to2;
  }
  combine2 += text4.slice(aboveTo);
  equal(combine2, text4, "拼回去");
});

testCase("类名是 prism 那一套（`token` 打头），CSS 才认得", () => {
  const range = shareColor("const a = 1", "javascript");
  for (const block of range) assertValue(/(^| )token( |$)/.test(block.class), `类名不认识：${block.class}`);
});

testCase("截断的代码也不许抛", () => {
  equal(Array.isArray(shareColor("{", "json")), true, "半个对象");
  equal(Array.isArray(shareColor("def f(:", "python")), true, "半截函数头");
});

group("四、回车续行：缩进 / 再进一级 / 空括号展开");

testCase("上一行没有缩进 → 新行也没有", () => {
  const r = returnCarContinueLine("abc", "", "    ");
  equal(r.insert, "\n", "插入");
  equal(r.cursor, 1, "光标");
  equal(r.removeManyLess, 0, "删多少");
});

testCase("延续上一行的缩进", () => {
  const r = returnCarContinueLine("    abc", "", "    ");
  equal(r.insert, "\n    ", "插入");
  equal(r.cursor, 5, "光标");
});

testCase("上一行以 `{` / `(` / `[` 结尾 → 再进一级", () => {
  for (const open2 of ["{", "(", "["]) {
    const r = returnCarContinueLine(`    if x ${open2}`, "", "    ");
    equal(r.insert, "\n        ", `${open2}：插入`);
    equal(r.cursor, 9, `${open2}：光标`);
  }
});

testCase("上一行以别的字符结尾 → **不**多进一级（`a +` 这种）", () => {
  const r = returnCarContinueLine("    let x = a +", "", "    ");
  equal(r.insert, "\n    ", "插入");
});

testCase("光标正好夹在一对空括号中间 → 展开成三行", () => {
  const r = returnCarContinueLine("  f(", ")", "    ");
  equal(r.insert, "\n      \n  ", "插入（中间那行再进一级）");
  equal(r.cursor, 7, "光标（落在中间那一行）");
});

testCase("后括号前面有空白也算夹在中间", () => {
  const r = returnCarContinueLine("f(", "   )", "    ");
  equal(r.insert, "\n    \n", "插入");
});

testCase("括号不配对就不展开（`f(` 后面跟的是别的字）", () => {
  const r = returnCarContinueLine("  f(", "x", "    ");
  equal(r.insert, "\n      ", "插入（还是进了那一级，但不展开）");
});

testCase("停在纯空白后面 → 那截空白并进新行（上一行不留尾随空白）", () => {
  const r = returnCarContinueLine("    ", "", "    ");
  equal(r.removeManyLess, 4, "删多少（把旧行那截空白删掉）");
  equal(r.insert, "\n    ", "插入");
  equal(r.cursor, 5, "光标");
});

/* ── 五、行界 / 整行剪贴（空选区按复制/剪切）──────────────────────────── */

group("五、行界：一行的边界（不含换行符）");

const threeRows = "aa\nbb\ncc";

testCase("行中间的格子 → 整行，`出` 不含换行", () => {
  const { enter, output2 } = lineBoundary(threeRows, 4);
  equal(enter, 3, "入（`bb` 的开头）");
  equal(output2, 5, "出（`bb` 的后面那个换行**不算**）");
  equal(threeRows.slice(enter, output2), "bb", "切出来就是这一行");
});

testCase("光标**正好落在换行符上** → 还是它自己那一行", () => {
  equal(lineBoundary(threeRows, 2), { enter: 0, output2: 2 }, "`aa` 和换行之间");
});

testCase("⚠️ 光标贴着换行**后面**（行首）→ 算**下一行**的开头", () => {
  // `lastIndexOf` 的起点是 `位 - 1`，正好捡到光标前面那个 `\n`。反过来的话，
  // 光标停在行首按 Ctrl+C 会拿到**上面**那一行——用户完全看不懂。
  equal(lineBoundary(threeRows, 3), { enter: 3, output2: 5 }, "`bb` 那一行");
});

testCase("最后一行 / 位置越界都夹回两端", () => {
  equal(lineBoundary(threeRows, 7), { enter: 6, output2: 8 }, "最后一行");
  equal(lineBoundary(threeRows, 999), { enter: 6, output2: 8 }, "超出长度");
  equal(lineBoundary(threeRows, -5), { enter: 0, output2: 2 }, "负数");
});

group("五之二、整行剪贴：中间的行带换行，末尾那一行不带");

testCase("复制**中间**那一行 → 文本连换行一起带走（粘到别处还是一行）", () => {
  const r = wholeLineCutPaste(threeRows, 4, false)!;
  assertValue(r !== null, "该算得出来");
  equal(r.text2, "bb\n", "带走的那一段");
  equal(r.remove, null, "复制不删东西");
  equal(r.cursor, 3, "什么都不做时光标不动（这里给的是行首）");
});

testCase("复制**末尾**那一行 → 不带换行（凭空补一个会让粘贴处多出空行）", () => {
  equal(wholeLineCutPaste(threeRows, 7, false)!.text2, "cc", "最后一行没有换行可带");
});

testCase("剪切中间那一行 → 连它后面那个换行一起删", () => {
  const r = wholeLineCutPaste(threeRows, 4, true)!;
  equal(r.text2, "bb\n", "复制走的那一段");
  equal(r.remove, { from: 3, to: 6 }, "删 `bb` ＋ 它后面的换行");
  equal(threeRows.slice(0, r.remove!.from) + threeRows.slice(r.remove!.to), "aa\ncc", "删完剩两行");
  equal(r.cursor, 3, "光标落在原来那一行的行首");
});

testCase("⚠️ 剪切**末尾**那一行 → 删的是它**前面**那个换行（否则留下一个空行）", () => {
  const r = wholeLineCutPaste(threeRows, 7, true)!;
  equal(r.remove, { from: 5, to: 8 }, "`\\ncc` 整段");
  equal(threeRows.slice(0, r.remove!.from) + threeRows.slice(r.remove!.to), "aa\nbb", "末尾不留空行");
  equal(r.cursor, 5, "光标接到 `bb` 后面");
});

testCase("只有一段的文档：剪切时没有「前面那个换行」，删它自己", () => {
  const r = wholeLineCutPaste("xyz", 1, true)!;
  equal(r.remove, { from: 0, to: 3 }, "整段");
  equal(r.cursor, 0, "光标回到开头");
});

testCase("空文 → null（交回 CodeMirror 自己那份默认行为）", () => {
  equal(wholeLineCutPaste("", 0, false), null, "空文");
});

/* ── 六、长代码块着色节流 ─────────────────────────────────────────────── */

group("六、长代码块着色：短块即时、长块攒帧");

testCase("2,000 字符以内仍即时重算", () => {
  equal(needWantDelayDelayActiveColor(0), false, "空块");
  equal(needWantDelayDelayActiveColor(2_000), false, "边界仍即时");
});

testCase("超过 2,000 字符才进入 80ms 合并", () => {
  equal(needWantDelayDelayActiveColor(2_001), true, "刚过长块线");
  equal(needWantDelayDelayActiveColor(100_000), true, "超长块");
});

group("七、代码块首尾方向键显式退出");

testCase("按源码绝对首尾判断：只有偏移 0 和末尾退出", () => {
  const empty = { length: 0 };
  equal(codeBlockSourceEdge(empty, 0), "both", "空源码同时属于首尾");

  const source = { length: 12 };
  equal(codeBlockSourceEdge(source, 0), "head", "绝对开头");
  equal(codeBlockSourceEdge(source, 1), null, "第一行中间不放行");
  equal(codeBlockSourceEdge(source, 11), null, "最后一行中间不放行");
  equal(codeBlockSourceEdge(source, 12), "tail", "绝对末尾");
});

testCase("CodeMirror 加载前的 textarea 使用同一套按行判断", () => {
  equal(bootstrapCodeBlockExit("abc", 0, "ArrowLeft"), "before", "开头 Left");
  equal(bootstrapCodeBlockExit("abc", 0, "ArrowUp"), "before", "开头 Up");
  equal(bootstrapCodeBlockExit("abc", 1, "ArrowLeft"), null, "中间 Left 不放行");
  equal(bootstrapCodeBlockExit("abc", 1, "ArrowUp"), null, "中间 Up 不放行");
  equal(bootstrapCodeBlockExit("abc", 3, "ArrowRight"), "after", "末尾 Right");
  equal(bootstrapCodeBlockExit("abc", 3, "ArrowDown"), "after", "末尾 Down");
  equal(bootstrapCodeBlockExit("abc", 1, "ArrowRight"), null, "中间 Right 不放行");
  equal(bootstrapCodeBlockExit("abc", 1, "ArrowDown"), null, "中间 Down 不放行");
  equal(bootstrapCodeBlockExit("a\nb", 1, "ArrowUp"), null, "第一行末尾但非源码开头不放行");
  equal(bootstrapCodeBlockExit("a\nb", 3, "ArrowDown"), "after", "源码末尾 Down");
});

testCase("加载前的 textarea 在块内按原生方向键移动", () => {
  equal(moveBootstrapCodeBlockCaret("abc", 1, "ArrowLeft"), 0, "Left");
  equal(moveBootstrapCodeBlockCaret("abc", 1, "ArrowRight"), 2, "Right");
  equal(moveBootstrapCodeBlockCaret("abc", 1, "ArrowUp"), 0, "首行 Up 停在行首");
  equal(moveBootstrapCodeBlockCaret("abc", 1, "ArrowDown"), 3, "末行 Down 停到行尾");
  equal(moveBootstrapCodeBlockCaret("abcd\nefgh", 6, "ArrowUp"), 1, "跨行 Up 保留列");
  equal(moveBootstrapCodeBlockCaret("abcd\nefgh", 2, "ArrowDown"), 7, "跨行 Down 保留列");
});

testCase("ArrowLeft / ArrowUp / ArrowRight / ArrowDown 接到正确边界", () => {
  const editor = readFileSync("src/editor/code-block-cm.ts", "utf8");
  assertValue(editor.includes('key: "ArrowLeft"'), "ArrowLeft 没有接边界动作");
  assertValue(editor.includes('key: "ArrowUp"'), "ArrowUp 没有接边界动作");
  assertValue(editor.includes('key: "ArrowRight"'), "ArrowRight 没有接块尾动作");
  assertValue(editor.includes('key: "ArrowDown"'), "ArrowDown 没有接块尾动作");
  assertValue(editor.includes("option.leaveHeadCell()"), "边界键没有调用退出钩子");
  assertValue(editor.includes("option.leaveTailCell()"), "块尾键没有调用退出钩子");
  assertValue(!editor.includes("stayInsideCodeBlock"), "旧的“留在块内”分支仍存在");
});

testCase("NodeView 把首尾退出接到同一套文档选区事务", () => {
  const node = readFileSync("src/editor/code-block.ts", "utf8");
  const boundary = readFileSync("src/editor/code-block-boundary.ts", "utf8");
  assertValue(node.includes('const leaveCodeBlock = (side: CodeBlockExitSide)'), "NodeView 没有首尾退出实现");
  assertValue(node.includes('leaveHeadCell = () => leaveCodeBlock("before")'), "块首没有退出到块前");
  assertValue(node.includes('leaveTailCell = () => leaveCodeBlock("after")'), "块尾没有退出到块后");
  assertValue(boundary.includes("TextSelection.near("), "退出时没有移动 ProseMirror 选区");
  assertValue(node.includes("codeBlockExitTransaction(view.state, pos, current, side)"), "NodeView 没有使用统一退出事务");
  assertValue(node.includes("leaveHeadCell,"), "退出钩子没有传给 CodeMirror");
  assertValue(node.includes("leaveTailCell,"), "块尾钩子没有传给 CodeMirror");
  assertValue(node.includes('bootstrap.addEventListener("keydown"'), "加载中的代码块没有边界键");
});

testCase("Mermaid 图表源码框接入同一套首尾退出", () => {
  const diagram = readFileSync("src/editor/diagram-view.ts", "utf8");
  assertValue(diagram.includes("const leaveHeadCell = () => leaveDiagram(\"before\")"), "Mermaid 块首没有退出");
  assertValue(diagram.includes("const leaveTailCell = () => leaveDiagram(\"after\")"), "Mermaid 块尾没有退出");
  assertValue(diagram.includes("leaveHeadCell,"), "Mermaid 块首钩子没有传给 CodeMirror");
  assertValue(diagram.includes("leaveTailCell,"), "Mermaid 块尾钩子没有传给 CodeMirror");
  assertValue(diagram.includes("bootstrapCodeBlockExit"), "Mermaid 加载中的 textarea 没有边界键");
});

const boundarySchema = new Schema({
  nodes: {
    doc: { content: "block+" },
    paragraph: {
      group: "block",
      content: "inline*",
      parseDOM: [{ tag: "p" }],
      toDOM: () => ["p", 0],
    },
    code_block: {
      group: "block",
      content: "text*",
      code: true,
      parseDOM: [{ tag: "pre" }],
      toDOM: () => ["pre", 0],
    },
    text: { group: "inline" },
  },
});

function boundaryDocument(blocks: readonly ReturnType<typeof boundarySchema.node>[]) {
  return boundarySchema.node("doc", null, blocks);
}

function applyExit(document: ReturnType<typeof boundaryDocument>, position: number, side: "before" | "after") {
  const node = document.nodeAt(position);
  assertValue(node?.type.name === "code_block", "测试位置不是代码块");
  const state = EditorState.create({
    schema: boundarySchema,
    doc: document,
    selection: TextSelection.create(document, position + 1),
  });
  const transaction = codeBlockExitTransaction(state, position, node, side);
  assertValue(transaction, "边界退出事务没有生成");
  return state.apply(transaction);
}

testCase("代码块前后都有正文时，块首退到前文末尾、块尾退到后文开头", () => {
  const before = boundarySchema.node("paragraph", null, boundarySchema.text("before"));
  const code = boundarySchema.node("code_block", null, boundarySchema.text("x"));
  const after = boundarySchema.node("paragraph", null, boundarySchema.text("after"));
  const document = boundaryDocument([before, code, after]);
  const codePosition = before.nodeSize;

  const atHead = applyExit(document, codePosition, "before");
  equal(atHead.selection.from, codePosition - 1, "块首 Left/Up 没有落到前文末尾");
  equal(atHead.selection.$from.parent.type.name, "paragraph", "块首退出仍停在代码块里");

  const atTail = applyExit(document, codePosition, "after");
  equal(atTail.selection.from, codePosition + code.nodeSize + 1, "块尾 Right/Down 没有落到后文开头");
  equal(atTail.selection.$from.parent.type.name, "paragraph", "块尾退出仍停在代码块里");
});

testCase("代码块是首块或末块时创建一个空段落作为真实退出落点", () => {
  const code = boundarySchema.node("code_block", null, boundarySchema.text("x"));
  const onlyCode = boundaryDocument([code]);

  const atHead = applyExit(onlyCode, 0, "before");
  equal(atHead.doc.childCount, 2, "首块退出没有创建落点段落");
  equal(atHead.doc.child(0).type.name, "paragraph", "首块前面没有空段落");
  equal(atHead.selection.from, 1, "首块退出后光标不在新段落里");

  const atTail = applyExit(onlyCode, 0, "after");
  equal(atTail.doc.childCount, 2, "末块退出没有创建落点段落");
  equal(atTail.doc.child(1).type.name, "paragraph", "末块后面没有空段落");
  equal(atTail.selection.from, code.nodeSize + 1, "末块退出后光标不在新段落里");
});

/* ── 汇总 ─────────────────────────────────────────────────────────────── */

console.log("\n" + "─".repeat(64));
console.log(`通过 ${pass} 条，失败 ${fail} 条`);
if (fail) {
  console.log("失败的：");
  for (const n of failed) console.log(`  - ${n}`);
  process.exit(1);
}
