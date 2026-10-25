/**
 * `src/editor/auto-pair.ts`（自动配对 ＋ Tab 跳出右半边）的**可运行**测试集。
 * 2026-09-28 写，与那个文件同批落地。
 *
 * # 跑法
 *
 * ```sh
 * npx esbuild tests/auto-pair.test.ts --bundle --platform=node --format=esm \
 *   --outfile=/tmp/nota-测试/auto-pair.mjs
 * node /tmp/nota-测试/auto-pair.mjs
 * ```
 *
 * # 这份测试盯的是什么
 *
 * 这一格的对错**全在判据上**：补错了字符、该跳的时候没跳、不该补的时候补了，
 * 屏幕上都不会报错——只会"手感不对"。所以下面按十二组钉：
 *
 * | 组 | 盯什么 |
 * |---|---|
 * | 一 | **两张表互为反表**（防死行：闭括号写错一颗，半年后才有人发现） |
 * | 二 | **该收的收了、不该收的没收**——文件头第 2 节那张"不收的每一个都有理由"在这里是可执行的：引号 / 反引号 / Markdown 标记一个都不许在表里，而 `[` 2026-09-28 **从"不收"挪进了"收"**（用户点名，见第 2.2 节） |
 * | 三 | `要配对` 的四种"不该补" |
 * | 四 | `要跳过`（打闭括号时右边正好有一颗一样的） |
 * | 五 | `要删成对`（夹在一对空括号里按退格） |
 * | 六 | `要跳`（`Tab` / `Shift+Tab` 跨一位） |
 * | 七 | **`[` 那一族**（2026-09-28 用户点名收的）：普通配对那几条 ＋ `[\|]` ⇒ `[[\|]]` 升级，以及"**只有那一种情况**可由它插手" |
 * | 八 | **自配对字符 `*`**（2026-09-28 用户点名加的，见 `auto-pair.ts` 第 2.1 节）——三条动作 ＋ 五条"不插手"的边界 |
 * | 九 | 装配（只能证明"挂上去了"） |
 * | 十 | **开关**：`配对处理(false)` 返回 `[]`（= 这条插件不装） |
 * | 十一 | **收尾那一下要落成真标记**（BUG-54，2026-09-29）：真 `Schema` ＋ 真 `Plugin` ＋ 一颗假视图，把 `*甲*` 走成 `emphasis` |
 * | 十二 | **收尾的三个触发时机**（2026-09-30，用户第二次报同一件事）：段首那颗用户自己敲的收尾星、自动补全那一对"打完正文就完整"、以及**输入法上屏**那条路 |
 *
 * ⚠️ 第十一、十二组是**仅有的两组**用到真 `Schema` / 真 `Plugin` 的：
 * {@link 收尾事务} 要 `state.schema.marks` 才落得下标记，纯函数那套够不着。
 * 假视图只提供 `state` / `dispatch` / `composing` 三样（`补标记` 那个落点只用
 * 得着前两样），**没有 DOM**。
 *
 * ⚠️⚠️ 第十二组那条**输入法上屏**测的是 `appendTransaction` 兜底，而
 * `appendTransaction` 是 `EditorState.apply` 按 `state.config.plugins` 挨个问
 * 的——**插件不进那份 `plugins` 数组，这一路压根不跑**，"测过了"就成了假话。
 * 两组共用的那个 `造视图` 因此显式注册了 `收尾插件`。
 *
 * # ⚠️ 这份测试**证明不了**什么
 *
 * - ⚠️⚠️ **「打 `(` 屏幕上真出现 `()`」这条主路径没验**，只验到
 *   `配对处理()` 返回了一个非空的插件描述。真跑要 `Editor.make()` ＋ 真 DOM
 *   （本仓没有 jsdom，也不许为这件事装包）。**这是最大的空白。**
 * - ⚠️ **「`Tab` 真的跨过去了、而且没被 `indent` 抢走」没验**：那是
 *   `handleKeyDown` ＋ 真键位事件的顺序问题，只能开窗目检
 *   （`docs/07` 那一项里列着）。
 * - ⚠️ **「组字期间不插手」（`view.composing`）没验**：那要真 view ＋ 真 IME。
 * - ⚠️ **「`addToHistory: false` 所以 `Ctrl+Z` 不回退一步」没验**：那是
 *   `prosemirror-history` 的事，要真 view。
 * - ⚠️ **「收尾之后盘上写出来的是 `*甲*` 而不是 `\*甲\*`」没验**：那要真的
 *   序列化流水线（`SerializerState` ＋ `mdast-util-to-markdown`）。这一组验到
 *   **文档里落的是 `emphasis`** 为止——剩下的那一步（标记 → `*甲*`）在
 *   `docs/02`／`docs/07` 里算**开窗目检**的事，别拿这一组当它。
 */

import { prosePluginsCtx } from "@milkdown/kit/core";
import { Container, Ctx } from "@milkdown/kit/ctx";
import { Schema } from "@milkdown/kit/prose/model";
import { EditorState, TextSelection } from "@milkdown/kit/prose/state";
import type { Plugin, Transaction } from "@milkdown/kit/prose/state";
import type { EditorView } from "@milkdown/kit/prose/view";
import {
  configureCorrectTable,
  closeBracketNumber,
  openBracketNumber,
  isOpenBracketNumber,
  isCloseBracketNumber,
  needsPair,
  wantJumpPass,
  wantRemoveBecomeCorrect,
  wantJump,
  selfConfigureCorrectTable,
  upgradeableTable,
  needsPairing,
  configureCorrectPlaceManage,
  type MarkAction,
  type scene,
} from "../src/editor/auto-pair";

/* ── 一支极小的测试工装（与 `auto-correct.test.ts` 同一套长相）── */

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

/** 逐颗比一串字符串（`等` 是 `!==`，内容一样的两串数组在它眼里永远不相等）。 */
function equalColumns(actual: readonly string[], expected: readonly string[], description: string): void {
  const a = JSON.stringify(actual);
  const b = JSON.stringify(expected);
  if (a !== b) throw new Error(`${description}：期望 ${b}，实际 ${a}`);
}

/** 造一份现场，只写要变的那几格。默认：行首、行尾、正文、没选东西。 */
function scene2(partShare: Partial<scene> = {}): scene {
  return {
    before2: "", after: "", afterTwo: "", code: false, codeBlock: false, emptySelection: true,
    beforeIsParagraphFirst: false, prefixText: "",
    ...partShare,
  };
}

/* ── 一、两张表 ─────────────────────────────────────────────────────── */

group("一、两张表（防死行）");

testCase("`配对表` 里每一条都能被 `闭括号` 查出来", () => {
  const bad: string[] = [];
  for (const [open2, close3] of Object.entries(configureCorrectTable)) {
    if (closeBracketNumber(open2) !== close3) bad.push(`${open2} → ${close3}（实际 ${closeBracketNumber(open2)}）`);
  }
  if (bad.length) throw new Error(`有 ${bad.length} 条不生效：${bad.join("、")}`);
});

testCase("反表与正表严格互逆（左右一一对应）", () => {
  // ⚠️ 这一条是**这份文件里最要紧的断言**：`开括号` 与 `闭括号` 要是对不上，
  // 症状是"跳得进去跳不出来"这类莫名其妙的手感问题。
  const bad: string[] = [];
  for (const [open2, close3] of Object.entries(configureCorrectTable)) {
    if (openBracketNumber(close3) !== open2) bad.push(`${close3} 反查得到 ${openBracketNumber(close3)}，该是 ${open2}`);
  }
  if (bad.length) throw new Error(`反表有 ${bad.length} 条不对：${bad.join("；")}`);
});

testCase("表外的字符一律给 null（不是 undefined）", () => {
  // ⚠️ 这份名单里**曾经有 `[` 与 `]`**——2026-09-28 起两颗都在表里了（第七组），
  // 于是换成了别的真·表外字符。加字符进表时，这里和第七组要一起动。
  for (const character2 of ["a", "`", "#", "-", "*", "」x", "", " "]) {
    equal(closeBracketNumber(character2), null, `闭括号(${JSON.stringify(character2)})`);
    equal(openBracketNumber(character2), null, `开括号(${JSON.stringify(character2)})`);
    equal(isOpenBracketNumber(character2), false, `是开括号(${JSON.stringify(character2)})`);
    equal(isCloseBracketNumber(character2), false, `是闭括号(${JSON.stringify(character2)})`);
  }
});

testCase("是多字符的整串不算（`（）` 那种两字符串）", () => {
  // ⚠️ 判据吃的是**一颗**字符；整串进来必须落空，不能把首字符挑出来。
  equal(isOpenBracketNumber("（)"), false, "两字符串");
});

/* ── 二、收哪些、不收哪些（文件头第 2 节的可执行版）──────────────────── */

group("二、该收的收了、不该收的没收");

testCase("该收的：`(` `{` `[` 与中文那一族", () => {
  for (const [open2, close3] of [
    ["(", ")"],
    ["{", "}"],
    ["[", "]"],
    ["（", "）"],
    ["【", "】"],
    ["「", "」"],
    ["『", "』"],
    ["《", "》"],
    ["〈", "〉"],
  ]) {
    equal(closeBracketNumber(open2 as string), close3, `${open2}配${close3}`);
  }
});

testCase("⚠️ `[` 2026-09-28 起**在表里**了（用户点名，文件头第 2.2 节）", () => {
  // ⚠️ 这一条**原来是反的**（`等(配对表["["], undefined)`，"不收"）。用户
  // 2026-09-28 原话：「自动补全 `*`、`[` 这种在设置中搞一个选项」——点的是
  // 这颗字符本身。当年挡它的理由（`[文字](地址)` 会被弄坏）靠三件事压住，
  // 逐条写在 `auto-pair.ts` 第 2.2 节；能打通的证据就是下面第七组。
  equal(configureCorrectTable["["], "]", "`[` 在表里，配 `]`");
  equal(isOpenBracketNumber("["), true, "`[` 是开括号");
  equal(isCloseBracketNumber("]"), true, "`]` 是闭括号");
});

testCase("⚠️ 不收直引号：智能标点管着它们", () => {
  // `smart-punctuation.ts` 的输入规则按前一个字符决定弯成 `“` 还是 `”`。
  // 这里再补一颗 = 同一颗按键两套规则。
  for (const character2 of ['"', "'", "“", "”", "‘", "’"]) {
    equal(isOpenBracketNumber(character2), false, `${character2} 不该在表里`);
    equal(isCloseBracketNumber(character2), false, `${character2} 不该在闭表里`);
  }
});

testCase("⚠️ 反引号不进括号表；它由自配对逻辑直接落成行内代码", () => {
  equal(isOpenBracketNumber("`"), false, "反引号不在表里");
  equal(isCloseBracketNumber("`"), false, "闭表里也没有");
});

testCase("⚠️ 括号表不收 Markdown 标记字符（它们走自配对表）", () => {
  // ⚠️ `*` 在这条断言里仍然为假：它**没有**进 `配对表`，进的是 `自配对表`
  // （第 2.1 节）。这条留着是为了别让后来的人"顺手把它也加进配对表"——
  // 那会同时放开 `要跳过` / `要删成对` / `要跳` 三条对它的规则，而那些规则
  // 在自配对字符上没说清要什么。
  for (const character2 of ["*", "_", "~", "=", "#", ">", "|"]) {
    equal(isOpenBracketNumber(character2), false, `${character2} 不该在配对表里`);
  }
});

/* ── 三、要配对 ─────────────────────────────────────────────────────── */

group("三、要配对");

testCase("正文里打 `(`：补 `)`", () => {
  equal(needsPair(scene2(), "("), ")", "空行打左括号");
  equal(needsPair(scene2({ before2: "甲" }), "("), ")", "字后面打");
});

testCase("⚠️ 代码块 / 行内代码里不补", () => {
  equal(needsPair(scene2({ code: true }), "("), null, "代码里");
});

testCase("⚠️ 前面紧挨着反斜杠不补（用户在转义）", () => {
  equal(needsPair(scene2({ before2: "\\" }), "("), null, "转义");
  equal(needsPair(scene2({ before2: "甲" }), "("), ")", "隔着一颗别的字照补");
});

testCase("⚠️ 右边已经就是那颗闭括号、又没选东西：不补（否则成 `())`）", () => {
  equal(needsPair(scene2({ after: ")" }), "("), null, "光标在 `)` 前面");
  equal(needsPair(scene2({ after: "】" }), "【"), null, "全角同理");
  equal(needsPair(scene2({ after: "]" }), "("), ")", "右边是别的闭括号，照补");
});

testCase("⚠️ 选中东西时右边那颗闭括号**正**是我们要的：照补（包起来）", () => {
  equal(needsPair(scene2({ after: ")", emptySelection: false }), "("), ")", "有选区");
});

testCase("表外字符一个都不补", () => {
  for (const character2 of ["a", "]", "*", "「」"]) {
    equal(needsPair(scene2(), character2), null, `打 ${character2}`);
  }
});

/* ── 四、跳过 / 删成对 / 跳 ─────────────────────────────────────────── */

group("四、跳过（打闭括号时右边正好有一颗一样的）");

testCase("右边是同一颗、左边确有未闭合的开符号：跳", () => {
  equal(wantJumpPass(scene2({ prefixText: "(", after: ")" }), ")"), true, "`)`");
  equal(wantJumpPass(scene2({ prefixText: "（", after: "）" }), "）"), true, "全角");
});

testCase("⚠️ 右边虽相同，但左边没有未闭合开符号：不许吞掉", () => {
  equal(wantJumpPass(scene2({ prefixText: "正文", after: ")" }), ")"), false, "零散 `)`");
  equal(wantJumpPass(scene2({ prefixText: "\\(甲", after: ")" }), ")"), false, "转义过的 `(` 不算");
  equal(wantJumpPass(scene2({ prefixText: "(甲)", after: ")" }), ")"), false, "已经配平");
});

testCase("右边是**别的**闭括号：不跳（要老老实实插进去）", () => {
  // ⚠️ 这条是"括号嵌套"的正解：`([])` 里光标在 `[` 后面打 `]`，
  // 右边是 `)`，必须插进去（成 `[]` ），跳过去就把 `)` 当 `]` 用了。
  equal(wantJumpPass(scene2({ after: ")" }), "]"), false, "`]` 对上 `)`");
  equal(wantJumpPass(scene2({ after: ")" }), "("), false, "开括号不跳");
});

testCase("有选区时一律不跳", () => {
  equal(wantJumpPass(scene2({ after: ")", emptySelection: false }), ")"), false, "选中了一段");
});

group("五、删成对（光标夹在一对空括号中间按退格）");

testCase("夹在一对**空**的中间：两颗一起删", () => {
  equal(wantRemoveBecomeCorrect(scene2({ before2: "(", after: ")" })), true, "`()` 中间");
  equal(wantRemoveBecomeCorrect(scene2({ before2: "「", after: "」" })), true, "全角");
  equal(wantRemoveBecomeCorrect(scene2({ before2: "*", after: "*" })), true, "`*|*`");
  equal(wantRemoveBecomeCorrect(scene2({ before2: "`", after: "`" })), true, "`` `|` ``");
});

testCase("中间有字（前一颗不是开括号）：只删一颗", () => {
  equal(wantRemoveBecomeCorrect(scene2({ before2: "甲", after: ")" })), false, "`甲)`");
  equal(wantRemoveBecomeCorrect(scene2({ before2: "(", after: "甲" })), false, "`(甲`");
});

testCase("配不上的那一对：不删", () => {
  // ⚠️ **只看相邻两颗**，不回头找配对（那要扫一遍文档，而"就近"才是手感）。
  equal(wantRemoveBecomeCorrect(scene2({ before2: "(", after: "]" })), false, "`(]`");
});

testCase("有选区时不删", () => {
  equal(wantRemoveBecomeCorrect(scene2({ before2: "(", after: ")", emptySelection: false })), false, "选中了一段");
});

group("六、跳（Tab 跳出右半边 / Shift+Tab 跳回左半边）");

testCase("`Tab`：右边紧挨着闭括号就跳", () => {
  equal(wantJump(scene2({ after: ")" }), 1), true, "`)`");
  equal(wantJump(scene2({ after: "*" }), 1), true, "`*` 自配对");
  equal(wantJump(scene2({ after: "a" }), 1), false, "普通字符");
  equal(wantJump(scene2({ after: "" }), 1), false, "行尾");
});

testCase("`Shift+Tab`：左边紧挨着开括号就跳", () => {
  equal(wantJump(scene2({ before2: "(" }), -1), true, "`(`");
  equal(wantJump(scene2({ before2: "a" }), -1), false, "普通字符");
  equal(wantJump(scene2({ before2: "" }), -1), false, "行首");
});

testCase("错开的方向不跳（右半边只认闭括号、左半边只认开括号）", () => {
  equal(wantJump(scene2({ after: "(" }), 1), false, "右边是开括号");
  equal(wantJump(scene2({ before2: ")" }), -1), false, "左边是闭括号");
});

testCase("⚠️ 代码块 / 行内代码里不跳（那颗 `Tab` 留给缩进）", () => {
  equal(wantJump(scene2({ after: ")", code: true }), 1), false, "代码里 Tab");
  equal(wantJump(scene2({ before2: "(", code: true }), -1), false, "代码里 Shift+Tab");
});

testCase("有选区时不跳", () => {
  equal(wantJump(scene2({ after: ")", emptySelection: false }), 1), false, "选中了一段");
});

/* ── 七、`[` ────────────────────────────────────────────────────────── */

group("七、`[`（2026-09-28 用户点名收进来的）");

testCase("正文里打 `[`：补 `]`（与 `(` 那一族逐条同源）", () => {
  equal(needsPair(scene2(), "["), "]", "空行打");
  equal(needsPair(scene2({ before2: "甲" }), "["), "]", "字后面打");
  equal(needsPair(scene2({ code: true }), "["), null, "代码里不补");
  equal(needsPair(scene2({ before2: "\\" }), "["), null, "前面是反斜杠不补");
  equal(needsPair(scene2({ after: "]" }), "["), null, "右边已经是 `]`：不补（否则成 `[]]`）");
  equal(needsPair(scene2({ after: "]", emptySelection: false }), "["), "]", "有选区时照补（把选中的包起来）");
});

testCase("`]` 那一侧的三种键位行为（跳过 / 删成对 / Tab 跨过去）", () => {
  equal(wantJumpPass(scene2({ prefixText: "[", after: "]" }), "]"), true, "打 `]` 而右边正好一颗：跳过去");
  equal(wantJumpPass(scene2({ after: ")" }), "]"), false, "右边是别的闭括号：老老实实插");
  equal(wantRemoveBecomeCorrect(scene2({ before2: "[", after: "]" })), true, "`[]` 中间按退格：两颗一起删");
  equal(wantJump(scene2({ after: "]" }), 1), true, "`Tab` 跳出 `]`");
  equal(wantJump(scene2({ before2: "[" }), -1), true, "`Shift+Tab` 跳回 `[`");
});

testCase("⚠️ 只有那一种情况由 `要补标记` 插手，其余一律交回 `要配对`", () => {
  // 可升级表（`[` ⇒ 只在那一种现场里升级），别的现场**必须返回 `null`**——
  // 一旦它顺手也管了普通补对/包选区，同一套判断就有了两份实现，改一处漏一处。
  equal(needsPairing(scene2({ before2: "甲" }), "["), null, "正文里普通位置（交给要配对）");
  equal(needsPairing(scene2(), "["), null, "行首（交给要配对）");
  equal(needsPairing(scene2({ before2: "[", after: "甲" }), "["), null, "`[甲`：右边不是 `]`");
  equal(needsPairing(scene2({ before2: "[", after: "]" }), "["), null, "`[|]` 但右边只有一颗 `]`（后二不是）");
  equal(needsPairing(scene2({ before2: "甲", after: "]", afterTwo: "]" }), "["), null, "左边不是 `[`：不是升级的那一种");
  equal(needsPairing(scene2({ before2: "[", after: "]", afterTwo: "]", code: true }), "["), null, "代码里不升级");
  equal(
    needsPairing(scene2({ before2: "[", after: "]", afterTwo: "]", emptySelection: false }), "["),
    null,
    "有选区不升级",
  );
});

testCase("可升级表里今天只有 `[`，而且它配 `]`", () => {
  equal(Object.keys(upgradeableTable).join(","), "[", "表里只有方括号");
  equal(upgradeableTable["["], "]", "配 `]`");
  // ⚠️ `*` **不在**这张表里：它是自配对（开=闭），走第八组那条路。
  equal(upgradeableTable["*"], undefined, "`*` 不该进可升级表");
  equal(upgradeableTable["("], undefined, "`(` 也不该：它没有「撑成双层」这回事");
});

testCase("`[|]` 里再打一颗 `[`：升级成 `[[|]]`（Wiki 链接打得出来了）", () => {
  // ⚠️ 没有这一条的话，第二次敲 `[` 会得到 `[[]`——**少一颗闭括号**：
  // 第一颗是被我们补的，用户敲的那颗 `]` 会被「跳过」吃掉，
  // 于是 `[[页面]]` 这种 Wiki 链接**根本打不出来**（文件头第 2.2 节 ②）。
  equal(needsPairing(scene2({ before2: "[", after: "]", afterTwo: "]" }), "["), "升级", "`[|]` 里再打一颗");
});

/* ── 八、Markdown 自配对字符 ─────────────────────────────────────────── */

group("八、Markdown 自配对字符（2026-10-17 扩展）");

/** 把动作写成字面量，读测试的时候不用回去翻类型。 */
function action(scene: Partial<scene>): MarkAction | null {
  return needsPairing(scene2(scene), "*");
}

testCase("Markdown 标记都配自己，普通字符与引号不在表里", () => {
  for (const character2 of ["*", "_", "~", "`", "="]) {
    equal(selfConfigureCorrectTable[character2], character2, `${character2} 配自己`);
  }
  for (const character2 of ["'", '"', "#", "("]) {
    equal(selfConfigureCorrectTable[character2], undefined, `${character2} 不该在自配对表里`);
  }
});

testCase("正文里打 `*`：补一对（`*|*`）", () => {
  equal(action({ before2: "甲" }), "补一对", "字后面打");
  equal(action({ before2: "甲", after: "乙" }), "补一对", "夹在文字中间打");
  equal(action({ before2: "）" }), "补一对", "紧跟别的闭括号照补");
});

testCase("光标夹在一对空星号里再打一颗：升级成粗体（`**|**`）", () => {
  equal(action({ before2: "*", after: "*", afterTwo: "" }), "升级", "`*|*` 里再打一颗");
});

testCase("收尾：右边有星号、而左边不是——不插，跳过去", () => {
  // 斜体收尾：`*粗|*`
  equal(action({ before2: "粗", after: "*", afterTwo: "" }), "跳过", "`*粗|*`");
  // 粗体收尾：`**粗|**`（右边两颗）
  equal(action({ before2: "粗", after: "*", afterTwo: "*" }), "跳过", "`**粗|**`");
  // 三颗那一族：`***粗|***`
  equal(action({ before2: "粗", after: "*", afterTwo: "*" }), "跳过", "`***粗|***`");
});

testCase("⚠️ 段首打 `*` 不补：那是项目符号", () => {
  // 补了会变成 `*|* 项目`，一个列表项当场废掉。
  equal(action({ before2: "" }), null, "段首");
  equal(action({ before2: "", after: "项目" }), null, "段首（后面有字）");
});

testCase("⚠️⚠️ 段首那颗星之后紧接着再打一颗：**两边各补齐**（`**|**`）", () => {
  // 2026-10-16 修的用户报的缺陷，原话：「按下两次星号键**另一边只补全出了一个**」。
  // 现场：第一颗在段首、被当成项目符号**故意没补**（上一条），于是第二颗来时
  // 是 `*|`。落到「补一对」那一支就只补右边一颗 ⇒ 屏幕上留着 `**|*`。
  equal(action({ before2: "*", after: "", beforeIsParagraphFirst: true }), "补齐", "段首 `*|` 再打一颗");
  // ⚠️ 判据里那个 `前是段首` **不能省**：不在段首的同一副现场是另一回事
  //（接着句尾那颗星再打一颗），那里"补一对"才是对的。
  equal(action({ before2: "*", after: "", beforeIsParagraphFirst: false }), "补一对", "不在段首，照旧补一对");
});

testCase("⚠️ 有选区时不补（星号上的「包起来」是替用户按了斜体）", () => {
  equal(action({ before2: "甲", after: "乙", emptySelection: false }), null, "选中了一段");
});

testCase("代码里 / 转义后不补", () => {
  equal(action({ before2: "甲", code: true }), null, "代码块或行内代码里");
  equal(action({ before2: "\\" }), null, "上一颗是反斜杠");
});

testCase("更多 Markdown 标记：`_` / `~` 可升级，反引号行内代码，`=` 第二颗才成对", () => {
  equal(needsPairing(scene2({ before2: "甲" }), "_"), "补一对", "斜体下划线");
  equal(needsPairing(scene2({ before2: "_", after: "_" }), "_"), "升级", "粗体下划线");
  equal(needsPairing(scene2({ before2: "my" }), "_"), null, "ASCII 单词内部下划线保持字面");
  equal(needsPairing(scene2({ before2: "甲" }), "~"), "补一对", "下标");
  equal(needsPairing(scene2({ before2: "~", after: "~" }), "~"), "升级", "删除线");
  equal(needsPairing(scene2({ before2: "甲" }), "`"), "补一对", "行内代码");
  equal(needsPairing(scene2({ before2: "" }), "`"), "补一对", "空位置先补一对");
  equal(needsPairing(scene2({ before2: "甲" }), "="), null, "单个等号没有标记");
  equal(needsPairing(scene2({ before2: "=" }), "="), "补齐", "第二个等号补成 `==|==`");
});

testCase("不是自配对字符一律给 null", () => {
  for (const character2 of ["a", "(", "）", "\"", ""]) {
    equal(needsPairing(scene2({ before2: "甲" }), character2), null, `要补标记(${JSON.stringify(character2)})`);
  }
});

/* ── 九、装配 ───────────────────────────────────────────────────────── */

group("九、装配");

testCase("`配对处理()` 给出一个非空的插件描述", () => {
  // ⚠️ 只能验到这一步：`$prose` 那一层要真 `Editor.make()` 才会把工厂跑起来
  //（那时才建 `Plugin` 实例）。这条断言的用处是**防"忘了 return"**那种死法。
  const attach = configureCorrectPlaceManage() as unknown;
  if (attach === null || attach === undefined) throw new Error("配对处理() 返回了空");
});

/* ── 十、开关（智能符号补全）────────────────────────────────────────── */

group("十、开关：智能符号补全（`Settings.editor.smart_symbols`）");

testCase("⚠️ 关掉时 `配对处理(false)` 给的是**空数组**（= 这条插件不装）", () => {
  // ⚠️ 这是那个开关**唯一**的落点：Milkdown 的 `.use([])` 是合法的"什么都不装"
  //（`smart-punctuation.ts` 的 `标点输入` 也是这个做法）。
  // ⚠️ 四件事（补一对 / 跳过 / 空对退格 / `Tab` 跳出）**只能一起关**：它们互相
  // 咬着——只关"补一对"的话，`Tab` 会去跳一颗根本没被补出来的括号。
  const close4 = configureCorrectPlaceManage(false) as unknown as unknown[];
  equal(Array.isArray(close4), true, "关掉时返回的该是个数组");
  equal(close4.length, 0, "关掉时长度是 0");
});

testCase("开着 / 不传参数时是一条插件（默认开，与 Rust 那边一致）", () => {
  const open2 = configureCorrectPlaceManage(true) as unknown as unknown[];
  equal(Array.isArray(open2), false, "开着时给的不是空数组");
  const defaultPlace = configureCorrectPlaceManage() as unknown as unknown[];
  equal(Array.isArray(defaultPlace), false, "不传参数 = 开（默认值就是 `true`）");
});

/* ── 十一、收尾落标记（BUG-54）──────────────────────────────────────── */

group("十一、收尾那一下：这一对定界符要落成**真标记**（BUG-54）");

/**
 * 第十一、十二组要**真 schema**：{@link 收尾事务} 落标记时要
 * `state.schema.marks`。
 *
 * ⚠️ 两个 id 必须是 `emphasis` / `strong`（上游 `preset-commonmark` 起的名字），
 * 本仓从前到后都写的是这两个（`command-state.ts` 的 `有("emphasis")`、
 * `mark-hint.ts` 顶上那段）。**写错成 `em` / `b` 的症状是静默不落标记**。
 */
const receiveTailschema = new Schema({
  nodes: {
    doc: { content: "block+" },
    paragraph: { content: "inline*", group: "block", toDOM: () => ["p", 0] },
    text: { group: "inline" },
  },
  marks: {
    emphasis: { toDOM: () => ["em", 0] },
    strong: { toDOM: () => ["strong", 0] },
    subscript: { toDOM: () => ["sub", 0] },
    strike_through: { toDOM: () => ["del", 0] },
    inlineCode: { code: true, toDOM: () => ["code", 0] },
    highlight: { toDOM: () => ["mark", 0] },
  },
});

/**
 * 跑一遍插件体、把**真** `Plugin` 掏出来。
 *
 * ⚠️ `$prose` 返回的是一个**函数**（`plugin(ctx) => async () => 卸载`），
 * 内层那个 `Plugin` 要等工厂体跑完才挂到 `plugin.plugin()` 上
 *（`node_modules/@milkdown/utils/lib/index.js` 的 `$prose`）。本仓没有 milkdown
 * 的启动时序，所以把 `ctx.wait` 换成立刻返回（`math-input.test.ts` 同一套）。
 */
const receiveTailPlugin = await (async () => {
  const ctx = new Ctx(new Container(), {} as never);
  (ctx as unknown as { wait: () => Promise<void> }).wait = async () => {};
  // ⚠️ 插件体会 `ctx.update(prosePluginsCtx, …)`，那一片得先注入
  //（`math-input.test.ts` 那边注的是 `inputRulesCtx`，同一个道理）。
  ctx.inject(prosePluginsCtx);
  // ⚠️ **不是数组**：开着的时候 `配对处理` 直接给那个 `$prose`（一个**函数**），
  // 关着的时候才给 `[]`（第十组钉着这一条）。
  const workFactory = configureCorrectPlaceManage(true) as unknown as ((ctx: unknown) => () => Promise<() => void>) & {
    plugin: () => Plugin;
  };
  if (typeof workFactory !== "function") throw new Error("配对处理(true) 没给出插件");
  await workFactory(ctx)();
  return workFactory.plugin();
})();

/** 一颗**只够跑逻辑**的假视图：`补标记` 那个落点只用 `state` 与 `dispatch`。 */
interface FakeView {
  state: EditorState;
  dispatch(tr: Transaction): void;
  composing: boolean;
}

/** 造一份视图：一段文字，光标摆在段内第 `偏移` 颗字符处（默认段末）。 */
function createView(initialText = "", offset?: number): FakeView {
  const paragraph2 = receiveTailschema.nodes.paragraph.create(null, initialText ? receiveTailschema.text(initialText) : null);
  const doc = receiveTailschema.nodes.doc.create(null, paragraph2);
  const view: FakeView = {
    // ⚠️ **插件必须进 `state.plugins`**：第十二组那条兜底走的是
    // `appendTransaction`，而那是 `EditorState.apply` 按 `state.config.plugins`
    // 挨个问的——不注册它，兜底那一路在这份测试里**压根不会跑**，
    // 而"测过了"就成了假话。
    state: EditorState.create({ schema: receiveTailschema, doc, plugins: [receiveTailPlugin] }),
    composing: false,
    dispatch(tr) {
      view.state = view.state.apply(tr);
    },
  };
  // ⚠️ 这里**没有** `Math.max(1, …)`：初文是空串时段落里只有一个位置（1），
  // 硬抬到 2 就跑到段落外面去了（`TextSelection endpoint not pointing into a
  // node with inline content`）。空段落那条判据（第十二组 ①）就栽在这。
  const to2 = Math.max(0, Math.min(offset ?? initialText.length, initialText.length));
  view.state = view.state.apply(
    view.state.tr.setSelection(TextSelection.create(view.state.doc, 1 + to2)),
  );
  return view;
}

/**
 * 在光标处敲一颗字符：走**真** `handleTextInput`；它不接就照 ProseMirror 的
 * 口径插进去（`prosemirror-view` 的 `editHandlers.textInput` 那一路）。
 */
function typeValue(view: FakeView, character: string): boolean {
  const from = view.state.selection.from;
  const connected = receiveTailPlugin.props.handleTextInput?.(view as unknown as EditorView, from, from, character);
  if (!connected) view.state = view.state.apply(view.state.tr.insertText(character, from, from));
  return connected === true;
}

/** 逐颗敲一串。 */
function typeValueString(view: FakeView, text4: string): void {
  for (const character2 of text4) typeValue(view, character2);
}

/**
 * **输入法上屏**：一串字直接落进文档，**不经过 `handleTextInput`**。
 *
 * ⚠️ 这不是"另一种敲法"，是**另一条真实的通路**：中文用拼音打进来时，
 * 组字上屏那一段是 `prosemirror-view` 的 DOM 观察器直接派事务落进来的，
 * `handleTextInput` 收不到。用户 2026-09-30 报的那对"`*你好*` 不渲染"就是
 * 从这条路来的，所以它必须有一条自己的判据。
 */
function aboveScreen(view: FakeView, text4: string): void {
  const from = view.state.selection.from;
  view.state = view.state.apply(view.state.tr.insertText(text4, from, from));
}

/** 第一段的样子：`文(x)` / `文(abc)@emphasis`。 */
function appearance(view: FakeView): string[] {
  const paragraph2 = view.state.doc.firstChild;
  if (!paragraph2) throw new Error("文档里没有第一段？");
  return paragraph2.content.content.map((n) => {
    const mark2 = n.marks.map((m) => `@${m.type.name}`).join("");
    return `${n.isText ? "" : n.type.name}文(${n.text ?? ""})${mark2}`;
  });
}

testCase("`x` ＋ `*abc*`（最后一颗是收尾）⇒ `abc` 落成 `emphasis`", () => {
  const view = createView("x");
  typeValueString(view, "*abc*");
  equalColumns(appearance(view), ["文(x)", "文(abc)@emphasis"], "收尾那一下该把这一对星号换成标记");
});

testCase("`甲` ＋ `**abc*` ⇒ 落成 `strong`（「打一颗就变粗体」那一路）", () => {
  // 现场：`甲*|*` 再敲一颗 ⇒ `甲**|**`（升级），打 `abc`，最后那颗是收尾。
  const view = createView("甲");
  typeValueString(view, "**abc*");
  equalColumns(appearance(view), ["文(甲)", "文(abc)@strong"], "两颗对两颗该落 `strong`");
});

testCase("`_abc` ⇒ `emphasis`；`__abc` ⇒ `strong`", () => {
  const single = createView("甲");
  typeValueString(single, "_abc");
  equalColumns(appearance(single), ["文(甲)", "文(abc)@emphasis"], "单下划线");
  const double = createView("甲");
  typeValueString(double, "__abc");
  equalColumns(appearance(double), ["文(甲)", "文(abc)@strong"], "双下划线");
});

testCase("`~2` ⇒ 下标；`~~旧~~` ⇒ 删除线", () => {
  const single = createView("x");
  typeValueString(single, "~2");
  equalColumns(appearance(single), ["文(x)", "文(2)@subscript"], "单波浪号");
  const double = createView("x");
  typeValueString(double, "~~旧");
  equalColumns(appearance(double), ["文(x)", "文(旧)@strike_through"], "双波浪号");
});

testCase("`` `code` `` ⇒ `inlineCode`；`==重点` ⇒ `highlight`", () => {
  const code = createView("x");
  typeValueString(code, "`code");
  equalColumns(appearance(code), ["文(x)", "文(code)@inlineCode"], "反引号自动成对");
  const heightBright = createView("x");
  typeValueString(heightBright, "==重点");
  equalColumns(appearance(heightBright), ["文(x)", "文(重点)@highlight"], "两个等号才成对");
});

testCase("⚠️ 收尾之后接着打的那颗字是**平**的（不继承那套标记）", () => {
  // 用户敲下那颗星号的意思是"斜体到这儿结束"，所以光标后面再打的字不该还是斜的。
  // ⚠️ 靠的是 `收尾事务` 末尾那句 `setStoredMarks([])`：ProseMirror 默认会
  // 拿前一颗字的标记接着用，少了那一句这条就会挂。
  const view = createView("x");
  typeValueString(view, "*abc*");
  typeValue(view, "乙");
  equalColumns(
    appearance(view),
    ["文(x)", "文(abc)@emphasis", "文(乙)"],
    "收尾之后接着打的字不该跟着斜",
  );
});

testCase("⚠️ 内文两头是空白 ⇒ **不落标记**，只把光标跨过去", () => {
  // `甲*|*` 里打进一颗空格，再敲一颗星号收尾：中间夹的是一颗空格。
  // CommonMark 里 `* *` 那样的星号压根不构成强调，落了标记反而是替用户改意思。
  const view = createView("甲");
  typeValue(view, "*");
  typeValue(view, " ");
  typeValue(view, "*");
  equalColumns(appearance(view), ["文(甲* *)"], "空白内文只该跨位，一个字都不该动");
});

testCase("⚠️ 左边那颗不是星号（没有开定界符）⇒ **不落标记**", () => {
  const view = createView("甲*", 1);
  typeValue(view, "*");
  equalColumns(appearance(view), ["文(甲*)"], "左边配不上对就只跨位");
});

testCase("⚠️ 开闭颗数不配（一颗对两颗）⇒ **不落标记**", () => {
  // ⚠️ 偏移是**"段内第几颗字符之后"**（内容坐标），与文档位置差 1：这里要的是
  // "乙 之后、那两颗星之前"，所以是 `3` 而不是 `2`。
  const view = createView("甲*乙**", 3);
  typeValue(view, "*");
  equalColumns(appearance(view), ["文(甲*乙**)"], "一颗星配两颗星不是一对，不许落标记");
});

testCase("⚠️ 开定界符前面是 `\\`（用户在转义）⇒ **不落标记**", () => {
  const view = createView("\\*甲*", 3);
  typeValue(view, "*");
  equalColumns(appearance(view), ["文(\\*甲*)"], "转义那一颗星号不许被卷进标记里");
});

/* ── 十二、收尾的三个触发时机（2026-09-30）────────────────────────────── */

group("十二、收尾的三个触发时机（2026-09-30，用户第二次报同一件事）");

testCase("① 段首打 `*你好*`（收尾那颗是用户自己敲的）⇒ `你好` 落成 `emphasis`", () => {
  // ⚠️ 段首那颗 `*` **不配对**（那是项目符号），所以闭星号也是用户敲的——
  // 老代码把它当成了"再补一对"，于是屏幕上多出一颗用户没打过的星号（`*你好**`）。
  const view = createView("");
  typeValueString(view, "*你好*");
  equalColumns(appearance(view), ["文(你好)@emphasis"], "收尾那颗该把这一对换成标记，不该再补一颗星");
});

testCase("③ 自动补全那一对：`x*你好`（不敲第三颗）⇒ `你好` 落成 `emphasis`", () => {
  // 这是用户报的那张截图：闭星号是**我们补的**，他没有任何理由再敲一遍。
  // ⚠️ 老代码要求"用户敲下收尾那颗"，而这一颗永远不会来。
  const view = createView("x");
  typeValueString(view, "*你好");
  equalColumns(appearance(view), ["文(x)", "文(你好)@emphasis"], "打完正文这一对就该完整了");
});

testCase("③ 输入法上屏那条路（不走 handleTextInput）⇒ 一样落成 `emphasis`", () => {
  // ⚠️ 中文的真实通路：拼音上屏不经过 `handleTextInput`，靠的是插件那条
  // `appendTransaction` 兜底。少了它，中文写的 `*你好*` 永远不渲染。
  const view = createView("x");
  typeValue(view, "*");
  aboveScreen(view, "你好");
  equalColumns(appearance(view), ["文(x)", "文(你好)@emphasis"], "上屏进来的字也该把这一对补成标记");
});

testCase("② 三颗键都敲（`x*你好*`）⇒ 第三颗**被吃掉**，不多出字面星号", () => {
  // ⚠️ 这一条钉的是"到此为止"那一岔：落完标记之后用户再敲的那颗星号，
  // 如果照旧插进文档，存盘会写成 `*你好*\*` —— 正是用户报的"自动插入斜杠"。
  const view = createView("x");
  typeValueString(view, "*你好*");
  equalColumns(appearance(view), ["文(x)", "文(你好)@emphasis"], "多余的收尾星号不许落进文档");
});

testCase("⚠️ 已落成标记的尾巴上再敲一颗 `*` ⇒ 一个字都不加（到此为止）", () => {
  const view = createView("x");
  typeValueString(view, "*你好");
  typeValue(view, "*");
  equalColumns(appearance(view), ["文(x)", "文(你好)@emphasis"], "这一颗星号是收笔，不是新字符");
});

testCase("⚠️ `* 项目`（星号后面是空白）⇒ **不落标记**，星号照旧是字面", () => {
  // 与第十一组那条同源：内文两头有空白在 CommonMark 里压根不构成强调，
  // 落了标记等于替用户改意思。（段首的项目符号也因此活得下来。）
  const view = createView("x");
  typeValueString(view, "* 项目");
  equalColumns(appearance(view), ["文(x* 项目*)"], "空白内文不许落标记");
});

testCase("⚠️ `\\*甲*`（开定界符前面是反斜杠）⇒ **不落标记**", () => {
  // ⚠️ 兜底那一路（`appendTransaction`）也要过同一份判据——它每来一次事务
  // 就问一遍，漏了这一判，光标往那一放就会被落成标记。
  const view = createView("\\*甲*", 3);
  equalColumns(appearance(view), ["文(\\*甲*)"], "转义那一颗星号不许被卷进标记里");
});

/* ── 收尾 ─────────────────────────────────────────────────────────────── */

console.log(`\n${"─".repeat(64)}`);
console.log(`通过 ${pass} 条，失败 ${fail} 条`);
if (fail) {
  console.log(`失败的：\n  - ${failed.join("\n  - ")}`);
  process.exitCode = 1;
}
