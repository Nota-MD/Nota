/**
 * `src/editor/math-commands.ts`（LaTeX **命令候选表**与三条纯判断）的**可运行**测试集。
 *
 * # 跑法（不装任何包：`esbuild` 与 `node` 仓库里都现成）
 *
 * ```sh
 * cd <仓库>
 * npx esbuild tests/math-commands.test.ts --bundle --platform=node --format=esm \
 *   --outfile=/tmp/nota-math-cmd-test/math-commands.test.mjs
 * node /tmp/nota-math-cmd-test/math-commands.test.mjs
 * ```
 *
 * 全过退出码 0；有不过的退出码 1，并把名字列出来。
 *
 * # 这份测试是为什么写的（2026-10-04）
 *
 * 用户点的第三条：**行内公式源码框里敲 `\` 弹命令候选**。这一层是那件事的
 * "判据与表"——它不碰 DOM（弹窗那一层在 `math-suggest.ts`，测在
 * `tests/math-suggest.test.ts`），所以这里全是喂字符串、比字符串。
 *
 * 三件事非用它盯住不可：
 *
 * 1. **表的自洽**（第一组）：命令名不许重（`\div` 那条真冲突就是这么抓出来的，
 *    见 `建命令表` 顶上那段）、每条都填齐了、`常用` 那几条真的在表里。
 *    表有一百多条，靠眼睛看是看不住的。
 * 2. **`找当场` 那几条边界**（第二组）：`\\` 是换行不是命令头、数字与中文不算
 *    字母、光标在词中间时右边那几个字要留着。这几条都是"错了也不报错"的那种。
 * 3. **physics 那一档的开与关**（贯穿全篇）：关着的时候 `\vb` 一条都不许露面
 *    （它是未定义命令，收下就是红字），开着的时候得从宏表现推出来。
 *
 * # ⚠️ 这份测试**证明不了**什么
 *
 * 它证明不了：KaTeX 认不认表里这些命令（表是"推荐"不是"支持"，见那个文件头）、
 * 渲染出来的预览长什么样、弹窗在屏幕上摆得对不对。那些是**目检**的事
 * （`docs/06` §5 那几节）。
 */

import { PHYSICS_MACROS } from "../src/editor/math-macros";
import {
  createCommandTable,
  findCurrent,
  setUse,
  pickCandidate,
  candidateLimit,
  type candidate,
} from "../src/editor/math-commands";

/* ── 一支极小的测试工装（与 `math-input.test.ts` / `math-view.test.ts` 同一套长相）── */

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

function assertion(condition: unknown, description: string): void {
  if (!condition) throw new Error(description);
}

function equal(actual: unknown, expected: unknown, description: string): void {
  if (actual !== expected) {
    throw new Error(`${description}：期望 ${JSON.stringify(expected)}，实际 ${JSON.stringify(actual)}`);
  }
}

/** 比字符串数组。 */
function equalColumns(actual: readonly string[], expected: readonly string[], description: string): void {
  const a = JSON.stringify(actual);
  const b = JSON.stringify(expected);
  if (a !== b) throw new Error(`${description}：期望 ${b}，实际 ${a}`);
}

/* ── 两张表 ───────────────────────────────────────────────────────────── */

const withoutPhysics = createCommandTable(false);
const hasObjectManage = createCommandTable(true);

/** 按命令名找一条（找不到返回 `undefined`，让调用处的断言去报）。 */
function get(table2: readonly candidate[], command: string): candidate | undefined {
  return table2.find((item4) => item4.command === command);
}

/** 数一个字符串里 `{}` 出现了几次。 */
function numberHole(stringValue: string): number {
  return stringValue.split("{}").length - 1;
}

/* ══ 一、表本身 ════════════════════════════════════════════════════════ */

group("一、表本身（自洽、且 physics 那一档开关分明）");

testCase("physics 关着：一百多条，全是手写那一族，一条 `physics` 都没有", () => {
  assertion(withoutPhysics.length > 100, `表太小了：${withoutPhysics.length} 条`);
  equal(withoutPhysics.filter((item4) => item4.family === "physics").length, 0, "关着时不该有 physics 条");
});

testCase("physics 开着：多出来的**正好**是宏表那些条（一条不多一条不少）", () => {
  const objectManageItem = hasObjectManage.filter((item4) => item4.family === "physics");
  // ⚠️ `\div` 那条手写的被顶掉了，所以总条数**不是**"手写 ＋ physics"简单地一加。
  equal(objectManageItem.length, Object.keys(PHYSICS_MACROS).length, "physics 条数");
});

testCase("⚠️ 命令名不许重（physics 开与关都不许）——`\\div` 那条真冲突就是这么抓出来的", () => {
  for (const [whichValueLevel, table2] of [
    ["关", withoutPhysics],
    ["开", hasObjectManage],
  ] as const) {
    const see = new Map<string, number>();
    for (const item4 of table2) see.set(item4.command, (see.get(item4.command) ?? 0) + 1);
    const heavy = [...see.entries()].filter(([, count2]) => count2 > 1).map(([command]) => command);
    equalColumns(heavy, [], `${whichValueLevel}着时重了的命令`);
  }
});

testCase("⚠️ `\\div` 这条冲突：physics 关着是「除号」（手写的），开着让位给 physics 那条", () => {
  const close4 = get(withoutPhysics, "\\div");
  assertion(close4, "关着时该有 `\\div`");
  equal(close4?.family, "命令", "关着时是手写那条");
  equal(close4?.description, "除号 ÷", "关着时说的是除号");

  const open2 = hasObjectManage.filter((item4) => item4.command === "\\div");
  equal(open2.length, 1, "开着时 `\\div` 只能有一条");
  equal(open2[0]?.family, "physics", "开着时顶上的是 physics 那条");
  // ⚠️ 这一条正是"让位"的理由：开着的时候 `\div` 在 KaTeX 眼里**已经不是除号**了
  //    （`macros` 压过内置命令），再摆一条写着"除号"的候选就是骗人。
  equal(open2[0]?.insert, "\\div", "physics 的 `\\div` 是零参宏（它是个算子名，不吃参数）");
});

testCase("每一条都填齐了：命令带反斜杠、余下全是字母、插入/样本/说明都不空", () => {
  for (const item4 of hasObjectManage) {
    assertion(item4.command.startsWith("\\"), `${item4.command} 没有反斜杠`);
    assertion(/^\\[A-Za-z]+$/.test(item4.command), `${item4.command} 不是"反斜杠＋字母"`);
    assertion(item4.insert.length > 0, `${item4.command} 的插入是空的`);
    assertion(item4.sample.length > 0, `${item4.command} 的样本是空的`);
    assertion(item4.description.length > 0, `${item4.command} 的说明是空的`);
    // ⚠️ 插入总是**以命令名起头**（`\frac{}{}` / `\times` / `\left(\right)`）：
    //    不是的话，收下之后源码框里会出现一个跟候选名字对不上的东西。
    assertion(item4.insert.startsWith(item4.command), `${item4.command} 的插入 ${item4.insert} 不是以命令名起头`);
  }
});

testCase("`常用` 那几条真的都在表里，且**一条都不会被上限挡在外面**", () => {
  const normal = withoutPhysics.filter((item4) => item4.normalUse).map((item4) => item4.command);
  equal(normal.length, 10, "常用条数");
  // ⚠️ 顺序就是**表里的先后**（结构那一段在前，希腊那一段在后），不是按常用度。
  equalColumns(
    normal,
    ["\\frac", "\\sqrt", "\\sum", "\\int", "\\lim", "\\left", "\\right", "\\text", "\\alpha", "\\theta"],
    "常用那几条",
  );
  // ⚠️ 这一条是**故意**的（`候选上限` 就是照"常用有几条"定的）：写在 `常用名`
  //    里却被上限切掉的名字，等于白写——用户永远看不见它，而代码里看着"有"。
  assertion(normal.length <= candidateLimit, `常用 ${normal.length} 条 > 上限 ${candidateLimit}`);
});

testCase("样本必须**单独立得住**：`\\right` 出来了就得有 `\\left` 配着（BUG-64）", () => {
  // ⚠️ 这条管的是"弹窗里那一格画成什么样"。KaTeX 里 `\right` 必须跟一个 `\left`
  //    配对才画得出来，所以**离开配对就标不出东西**的命令，样本不能吃
  //    `手写候选` 那条"空串就跟名字一样"的兜底——兜底出来的 `\right` 会让那一行
  //    变成**一句红色的报错**（2026-10-04 开窗目检抓到的，`docs/07` BUG-64）。
  //    ⚠️ 判据只查**配对**这一条 KaTeX 规矩，不是"渲染得成不成功"——
  //    真渲染要真 DOM，这颗假 DOM 里跑不了 `katex.render`（见 `tests/fake-dom.ts`）。
  // ⚠️ **不能用 `includes("\\right")`**：`\rightarrow` 里就含着 `\right` 这六个字符
  //    （第一版这么写，当场把 `\rightarrow` 判成了"有 \right 却没有 \left"）。
  //    命令名的边界在**后面那个字母**上：`\right` 后面跟着字母就是别的命令了。
  //    （同 `tools/doc-sync-check.sh` ⑤ 那条"子串匹配会把自己的说明文字也当命中"。）
  const has = (source3: string, command: string): boolean =>
    new RegExp(`\\\\${command}(?![A-Za-z])`).test(source3);
  for (const item4 of hasObjectManage) {
    if (!has(item4.sample, "right")) continue;
    assertion(has(item4.sample, "left"), `${item4.command} 的样本里有 \\right 却没有 \\left：${item4.sample}`);
  }
  equal(get(withoutPhysics, "\\right")?.sample, "\\left. x \\right)", "`\\right` 的样本换成了一条能独立渲染的");
});

testCase("带洞的命令：`{}` 的个数与它该收的参数个数对得上", () => {
  equal(numberHole(get(withoutPhysics, "\\frac")?.insert ?? ""), 2, "`\\frac` 两个参数");
  equal(numberHole(get(withoutPhysics, "\\sqrt")?.insert ?? ""), 1, "`\\sqrt` 一个参数");
  equal(numberHole(get(withoutPhysics, "\\sum")?.insert ?? ""), 2, "`\\sum` 上下两个（不是参数，但一样要留洞）");
  equal(numberHole(get(withoutPhysics, "\\left")?.insert ?? ""), 0, "`\\left(\\right)` 不留洞");
  equal(get(withoutPhysics, "\\times")?.insert, "\\times", "纯符号：插入就是命令本身");
});

testCase("physics 那族的插入是**从宏定义数出来的**参数个数", () => {
  // `\dv` 的展开式是 `\frac{d#1}{d#2}` ⇒ 两个参数。
  equal(get(hasObjectManage, "\\dv")?.insert, "\\dv{}{}", "`\\dv` 两个参数");
  // `\dd` 是零参宏（`\mathrm{d}`），插入不许给它挂洞——挂了就会吃掉后面一个字符。
  equal(get(hasObjectManage, "\\dd")?.insert, "\\dd", "`\\dd` 零参数");
  equal(get(hasObjectManage, "\\abs")?.insert, "\\abs{}", "`\\abs` 一个参数");
});

testCase("physics 那族的样本来自宏表那份用例（不是命令名顶上去的）", () => {
  const item4 = get(hasObjectManage, "\\dv");
  assertion(item4, "有 `\\dv`");
  assertion(item4.sample !== item4.command, "样本不该是命令名本身（那说明用例表里没这条）");
  // ⚠️ 反查一下：样本必须在那个宏的**展开式**里出现过的命令名，否则说明两处岔了。
  assertion(item4.sample.includes("\\dv"), `样本 ${item4.sample} 里没有 \\dv`);
});

testCase("空的词挑出来的那几条**全部**是 `常用`（不是「表的前几条」）", () => {
  const column = pickCandidate(withoutPhysics, "");
  equal(column.length, 10, "十条常用都露脸（没超过上限）");
  assertion(column.every((item4) => item4.normalUse), "有不常用的混进来了");
});

testCase("⚠️ physics 关着时 `\\vb` 一条都不许露面（收下就是红字）", () => {
  equalColumns(pickCandidate(withoutPhysics, "vb").map((item4) => item4.command), [], "关着时挑 `vb`");
  const open2 = pickCandidate(hasObjectManage, "vb").map((item4) => item4.command);
  assertion(open2.includes("\\vb"), `开着时该挑得到 \`\\vb\`：${JSON.stringify(open2)}`);
  assertion(open2.every((command) => command.startsWith("\\vb")), "挑出来的该全是 `vb` 开头的");
});

/* ══ 二、找当场 ════════════════════════════════════════════════════════ */

group("二、找当场（光标是不是停在一个命令里）");

testCase("`\\fr` 光标在末尾 → 起在 0、词是 `fr`", () => {
  const scene2 = findCurrent("\\fr", 3);
  assertion(scene2, "该有当场");
  equal(scene2?.start5, 0, "反斜杠的位置");
  equal(scene2?.word, "fr", "已敲的字母");
});

testCase("刚敲下 `\\`（词还空着）也算当场——就是这一下把列表弹出来的", () => {
  const scene2 = findCurrent("\\", 1);
  assertion(scene2, "该有当场");
  equal(scene2?.start5, 0, "反斜杠的位置");
  equal(scene2?.word, "", "词是空串");
});

testCase("前面有别的字：反斜杠在哪，`起` 就在哪", () => {
  const scene2 = findCurrent("x+y=\\al", 7);
  equal(scene2?.start5, 4, "反斜杠的位置");
  equal(scene2?.word, "al", "已敲的字母");
});

testCase("⚠️ `\\\\`（矩阵里那个换行）**不是**命令头，不弹", () => {
  // ⚠️ 下面几串的字面量要**两两对**着看：源码里写 `\\\\` 出来是两个反斜杠。
  equal(findCurrent("a\\\\", 3), null, "两颗反斜杠之后");
  equal(findCurrent("\\\\frac", 6), null, "`\\\\frac`：前面是换行，不是命令");
  // ⚠️ 奇数颗就不一样了：三颗 = 一个换行 ＋ 一个真命令头。
  const scene2 = findCurrent("a\\\\\\fr", 6);
  assertion(scene2, "三颗反斜杠之后该有当场");
  equal(scene2?.start5, 3, "起在最后那颗反斜杠上");
  equal(scene2?.word, "fr", "已敲的字母");
});

testCase("段首那一颗反斜杠照常弹（`起` 可以是 0）", () => {
  equal(findCurrent("\\frac", 5)?.start5, 0, "段首");
});

testCase("光标在命令**后面**（`\\frac{a}{b}|`）→ 不弹", () => {
  equal(findCurrent("\\frac{a}{b}", 10), null, "光标在 `}` 后面");
});

testCase("光标**不挨着**反斜杠（中间隔了别的符号）→ 不弹", () => {
  equal(findCurrent("\\frac{a}", 7), null, "光标在 `}` 后面");
  equal(findCurrent("\\frac+", 6), null, "光标在 `+` 后面");
  equal(findCurrent("\\frac{a}{b} + x", 13), null, "光标在正文中间");
});

testCase("⚠️ 数字与中文不算命令字母", () => {
  equal(findCurrent("\\frac1", 6), null, "`1` 不是字母");
  equal(findCurrent("\\text{好", 6), null, "中文不是字母");
  // 但**字母后面**跟着这些符号时，光标那一侧照旧算（词到字母为止）。
  equal(findCurrent("\\frac1", 5)?.word, "frac", "光标停在 `1` 前面时还认");
});

testCase("光标在词**中间**：词只取到光标为止（右边那几个字要留着，收下时不能吃掉）", () => {
  const scene2 = findCurrent("\\frac", 3);
  equal(scene2?.start5, 0, "反斜杠的位置");
  equal(scene2?.word, "fr", "只取光标左边那几个字母");
});

testCase("越界的光标一律不弹（`find` 挂在这一层，不在调用方）", () => {
  equal(findCurrent("\\fr", 0), null, "光标在 0");
  equal(findCurrent("\\fr", -1), null, "负光标");
  equal(findCurrent("\\fr", 4), null, "光标超过串长");
  // 正好等于长度是**合法**的（光标在末尾）。
  assertion(findCurrent("\\fr", 3), "正好在末尾该认");
});

/* ══ 三、挑候选 ════════════════════════════════════════════════════════ */

group("三、挑候选（前缀匹配、短的在前、有上限）");

testCase("前缀匹配：`fr` 挑得到 `\\frac`，挑不到 `\\frown` 这种不存在的", () => {
  const column = pickCandidate(withoutPhysics, "fr");
  equal(column[0]?.command, "\\frac", "头一条是 `\\frac`");
  assertion(column.every((item4) => item4.command.slice(1).toLowerCase().startsWith("fr")), "有不匹配的混进来");
});

testCase("短的在前（`\\in` 比 `\\infty` 更像「想打 in」）", () => {
  const column = pickCandidate(withoutPhysics, "in").map((item4) => item4.command);
  const short = column.indexOf("\\in");
  const length = column.indexOf("\\infty");
  assertion(short >= 0 && length >= 0, `两条都该在：${JSON.stringify(column)}`);
  assertion(short < length, "短的该排在前面");
});

testCase("大小写不敏感（`FR` 也要挑得到 `\\frac`）", () => {
  const column = pickCandidate(withoutPhysics, "FR");
  equal(column[0]?.command, "\\frac", "大写照样匹配");
  // ⚠️ 挑的是**大小写不敏感**，挑出来的却是**原样那一条**：敲 `Ga` 时
  //    `\Gamma` 与 `\gamma` 都在候选里（两个都是 6 个字符，同长时按名字排）。
  const add = pickCandidate(withoutPhysics, "Ga").map((item4) => item4.command);
  assertion(add.includes("\\Gamma") && add.includes("\\gamma"), `两条都该在：${JSON.stringify(add)}`);
});

testCase("⚠️ 只做前缀、不做模糊：`frc` 挑不到 `\\frac`", () => {
  equalColumns(pickCandidate(withoutPhysics, "frc").map((item4) => item4.command), [], "`frc` 不该匹配 `\\frac`");
});

testCase("有上限：再宽的前缀也最多弹 `候选上限` 条", () => {
  const column = pickCandidate(withoutPhysics, "a", candidateLimit);
  assertion(column.length <= candidateLimit, `超了：${column.length}`);
  // ⚠️ 上限是个可传的参数（探针/将来的"展开全部"要用），传 2 就得只有 2 条。
  equal(pickCandidate(withoutPhysics, "a", 2).length, 2, "传 2 就两条");
});

testCase("同一个词挑两次结果一样（排序是稳定的，列表不会自己跳）", () => {
  const alpha = pickCandidate(hasObjectManage, "d").map((item4) => item4.command);
  const beta = pickCandidate(hasObjectManage, "d").map((item4) => item4.command);
  equalColumns(beta, alpha, "两次结果");
});

testCase("挑出来的是**引用**不是拷贝——列表不会串（`建命令表` 每次给一份新数组）", () => {
  const value = createCommandTable(false);
  const two = createCommandTable(false);
  assertion(value !== two, "两次建出来的该是两份数组");
  value.length = 0;
  equal(two.length > 100, true, "清掉一份，另一份还在（没共用）");
});

/* ══ 四、套用 ══════════════════════════════════════════════════════════ */

group("四、套用（收下之后源码框是什么、光标在哪）");

testCase("`x=\\frac` 收下 `\\frac{}{}`：光标落进**头一个**洞", () => {
  const result3 = setUse("x=\\frac", 7, { start5: 2, word: "frac" }, get(withoutPhysics, "\\frac") as candidate);
  equal(result3.source3, "x=\\frac{}{}", "源码");
  // x0 =1 \2 f3 r4 a5 c6 {7 }8 {9 }10 → 光标在 8（第一个 `{}` 里面）
  equal(result3.cursor, 8, "光标");
});

testCase("没有洞的命令（`\\times`）：光标落在这条命令**后面**", () => {
  const result3 = setUse("a\\ti", 4, { start5: 1, word: "ti" }, get(withoutPhysics, "\\times") as candidate);
  equal(result3.source3, "a\\times", "源码");
  equal(result3.cursor, 1 + "\\times".length, "光标在末尾");
});

testCase("`\\left` 那种「不留洞但自带括号」的：也落在末尾", () => {
  const result3 = setUse("\\lef", 4, { start5: 0, word: "lef" }, get(withoutPhysics, "\\left") as candidate);
  equal(result3.source3, "\\left(\\right)", "源码");
  equal(result3.cursor, "\\left(\\right)".length, "光标在末尾");
});

testCase("⚠️ 光标在词中间：右边那几个字母**原样留着**（不许吃掉）", () => {
  // 用户在 `\fra` 后面又按了左键变成 `\f|ra`……这里用"光标在词中间"代表那种情形。
  const result3 = setUse("\\frac", 3, { start5: 0, word: "fr" }, get(withoutPhysics, "\\frac") as candidate);
  equal(result3.source3, "\\frac{}{}ac", "左边换掉、右边留着");
});

testCase("命令在段落中间：前后都原样留着", () => {
  // ⚠️ 光标在 `fr` 之后、`乙` **之前**（4）：右边那个字不该被吃掉。
  const result3 = setUse("甲\\fr乙", 4, { start5: 1, word: "fr" }, get(withoutPhysics, "\\frac") as candidate);
  equal(result3.source3, "甲\\frac{}{}乙", "源码");
  // 甲0 \1 f2 r3 a4 c5 {6 }7 → 光标在 7（第一个 `{}` 里面）。
  equal(result3.cursor, 7, "光标在第一个 `{}` 里");
});

testCase("收下 physics 那条（开着才在表里）也走同一条路", () => {
  const result3 = setUse("\\d", 2, { start5: 0, word: "d" }, get(hasObjectManage, "\\dd") as candidate);
  equal(result3.source3, "\\dd", "零参宏：就是命令本身");
  equal(result3.cursor, 3, "光标在末尾");
});

/* ── 收尾 ─────────────────────────────────────────────────────────────── */

console.log(`\n${"─".repeat(64)}`);
console.log(`通过 ${pass} 条，失败 ${fail} 条`);
if (fail) {
  console.log(`失败的：\n  - ${failed.join("\n  - ")}`);
  process.exitCode = 1;
}
