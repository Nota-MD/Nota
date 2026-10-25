/**
 * 源码模式里**行内标记的开关**（BUG-57）：选中的文字已经加粗时再按 Ctrl+B
 * 应当**摘掉**那两颗星，而不是再包一层。2026-09-30 与
 * `src/editor/source-mark.ts` ＋ `src/editor/source.ts` 同批落地。
 * ⚠️ 2026-10-07：第四组读的那份源文件从 `source.ts` 换成了
 * `source-commands.ts`（命令那一块整块搬去了那边，`docs/07` 第 89 项）——
 * "八族都换、链接没换"这条断言管的是**命令落点**，跟着那一块走。
 *
 * # 跑法
 *
 * ```sh
 * npx esbuild tests/source-mark.test.ts --bundle --platform=node --format=esm \
 *   --alias:@=./src --outfile=/tmp/nota-tests/source-mark.mjs
 * node /tmp/nota-tests/source-mark.mjs
 * ```
 *
 * # 用户报的原话（判据就是照它写的）
 *
 * > 现在选中已经加粗的文本，再按 Ctrl+B，会再加两个 `*`。应该是去掉。
 * > 类似的，Ctrl+I、U，排查代码。此问题仅源码或分栏模式有。
 *
 * # 这份测试盯的是什么
 *
 * - **第一组是承重的**：把八族行内标记各拨一遍，判据不是"改动列表长得对"，
 *   而是**把改动真的套回字符串之后，盘上是那几个字**（`套改动` 那一支）。
 *   改动列表本身是中间产物，用户看到的只有文本。
 * - **第二组盯"嵌套一律不动"**：`***甲***` 那种，文本层分不清该摘哪一对。
 *   这一组的期望是**一个字符都不改**——它比"摘对一对"更该被钉住，因为
 *   改错方向（包一层）会得到 `*****甲*****` 那种垃圾，而那是**回不去**的。
 * - 第三组是边界：空选区、只有半边定界符、跨行、以及"拨两下回到原样"。
 * - 第四组读 `source.ts` 的源码文本，钉住"八族都换成了开关、而链接没换"。
 *   那一处**没有任何类型检查能兜住**：谁把某一行改回 `wrapSelection`，
 *   编译、`tsc`、四道闸全都不吭声，只有开窗按一下才知道。
 *
 * # ⚠️ 这份测试**证明不了**什么
 *
 * - ⚠️ **"按了 Ctrl+B 真的会走到这里"没验**。那是按键到命令的那条链
 *   （`ui/useMenus.ts` 的 `defaultPrevented` 判据 ＋ 命令表），要真窗口。
 * - ⚠️ **`view.dispatch` 那一下没验**（本仓没有 jsdom，造不出真 CodeMirror
 *   视图）。这份测试量的是"该派什么"，不是"派下去之后盘上是不是那样"。
 *   后者只能开窗目检（`docs/06`）。
 * - ⚠️ **分栏模式只是"同一条路"这个判断**（左窗格就是 `createSourceEditor`），
 *   没有单独验。
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";

import {
  tryRemoveFixedBoundarySymbol,
  type TextChangeAction,
  type SelectionScopeEnclose,
  type RemoveFixedBoundary,
} from "@/editor/source-mark";

/* ── 一支极小的测试工装（与 `sidebar-resize.test.ts` 同一套长相）── */

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

function equalDark(actual: unknown, expected: unknown, description: string): void {
  const a = JSON.stringify(actual);
  const b = JSON.stringify(expected);
  if (a !== b) throw new Error(`${description}：期望 ${b}，实际 ${a}`);
}

/* ── 两个小工具：把改动套回字符串、把选区包一层 ─────────────────────── */

/**
 * 按 `CodeMirror` 的语义套改动。
 *
 * ⚠️ **从后往前套**：改动里的偏移量全部按**原文档**算（`source-mark.ts` 的
 * 类型注释里写着），正着套的话前面那条一改，后面那条的偏移量就偏了。
 * 这一步跑通，才说明"两条改动"的偏移量没算错。
 */
function setChangeAction2(text4: string, changeAction: TextChangeAction[]): string {
  let result2 = text4;
  for (const c of [...changeAction].sort((a, b) => b.from - a.from)) {
    result2 = result2.slice(0, c.from) + c.insert + result2.slice(c.to);
  }
  return result2;
}

/** 把选区包进一对定界符（`wrapSelection` 的纯文本版，用来验"拨两下回到原样"）。 */
function packageValueLayer(text4: string, selection: SelectionScopeEnclose, before: string, after: string): string {
  return (
    text4.slice(0, selection.anchor) +
    before +
    text4.slice(selection.anchor, selection.head) +
    after +
    text4.slice(selection.head)
  );
}

/** 断言"这一下是**摘**"，并顺手把文本与选区都验一遍。 */
function shouldRemove(
  text4: string,
  from: number,
  to: number,
  before: string,
  after: string,
  expectedText: string,
  expectedSelection: SelectionScopeEnclose,
): void {
  const result3: RemoveFixedBoundary | null = tryRemoveFixedBoundarySymbol(text4, from, to, before, after);
  if (result3 === null) throw new Error(`判成了"没带标记"（会去包一层），但应当摘：${text4}`);
  if (result3.result2 === "不动") throw new Error(`判成了"不动"，但应当摘：${text4}`);
  equal(setChangeAction2(text4, result3.changeAction), expectedText, `${text4} 摘完的文本`);
  equalDark(result3.selection, expectedSelection, `${text4} 摘完的选区`);
}

/** 断言"这一下**不动**"（嵌套那几种）。 */
function shouldNotAction(text4: string, from: number, to: number, before: string, after: string): void {
  const result3 = tryRemoveFixedBoundarySymbol(text4, from, to, before, after);
  if (result3 === null) throw new Error(`判成了"没带标记"，但应当"不动"：${text4}`);
  equal(result3.result2, "不动", `${text4} 的判定`);
}

/** 断言"没带这一对定界符"（调用方会去包一层）。 */
function shouldNoneWith(text4: string, from: number, to: number, before: string, after: string): void {
  equal(tryRemoveFixedBoundarySymbol(text4, from, to, before, after), null, `${text4} 的判定`);
}

/* ── 一、八族各拨一遍（承重） ───────────────────────────────────────── */

group("一、选中的文字已经带着这一对 ⇒ 摘掉");

// ⚠️ 每一行都是「双击选中正文」（星号**不**进选区）——那是默认手势，
// 也是用户报的那一下。`|` 标出选区两端。
testCase("`**|甲|**` ＋ Ctrl+B ⇒ `甲`", () => {
  shouldRemove("**甲**", 2, 3, "**", "**", "甲", { anchor: 0, head: 1 });
});

testCase("`*|甲|*` ＋ Ctrl+I ⇒ `甲`", () => {
  shouldRemove("*甲*", 1, 2, "*", "*", "甲", { anchor: 0, head: 1 });
});

testCase("`~~|甲|~~` ＋ Ctrl+Shift+X ⇒ `甲`", () => {
  shouldRemove("~~甲~~", 2, 3, "~~", "~~", "甲", { anchor: 0, head: 1 });
});

testCase("`` `|甲|` `` ＋ Ctrl+E ⇒ `甲`", () => {
  shouldRemove("`甲`", 1, 2, "`", "`", "甲", { anchor: 0, head: 1 });
});

testCase("`==|甲|==` ＋ 高亮 ⇒ `甲`", () => {
  shouldRemove("==甲==", 2, 3, "==", "==", "甲", { anchor: 0, head: 1 });
});

testCase("`^|甲|^` ＋ 上标 ⇒ `甲`", () => {
  shouldRemove("^甲^", 1, 2, "^", "^", "甲", { anchor: 0, head: 1 });
});

testCase("`~|甲|~` ＋ 下标 ⇒ `甲`", () => {
  shouldRemove("~甲~", 1, 2, "~", "~", "甲", { anchor: 0, head: 1 });
});

// ⚠️ 下划线是**唯一不同形**的一对（`<u>` / `</u>`）：上面七族 `before === after`，
// 判据里凡是用"两端同一串"偷懒的地方，这一族都会露馅。
testCase("`<u>|甲|</u>` ＋ Ctrl+U ⇒ `甲`", () => {
  shouldRemove("<u>甲</u>", 3, 4, "<u>", "</u>", "甲", { anchor: 0, head: 1 });
});

testCase("用户把星号**一起框进来**也算带标记（`|**甲**|`）", () => {
  shouldRemove("**甲**", 0, 5, "**", "**", "甲", { anchor: 0, head: 1 });
});

testCase("`|<u>甲</u>|` 全选 ＋ Ctrl+U ⇒ `甲`", () => {
  shouldRemove("<u>甲</u>", 0, 8, "<u>", "</u>", "甲", { anchor: 0, head: 1 });
});

testCase("标记在句子中间（选区两端是空格，不是文首文末）", () => {
  // `词 **甲** 词`：选中的 `甲` 落在 4..5，摘掉的两对是 2..4 与 5..7。
  shouldRemove("词 **甲** 词", 4, 5, "**", "**", "词 甲 词", { anchor: 2, head: 3 });
});

testCase("⚠️ 跨行的标记也认得（选区里那一行只是其中一段）", () => {
  shouldRemove("**甲\n乙**", 2, 5, "**", "**", "甲\n乙", { anchor: 0, head: 3 });
});

/* ── 二、嵌套：一律「一颗字都不动」 ─────────────────────────────────── */

group("二、嵌套分不清该摘哪一对 ⇒ 一个字符都不改");

testCase("`***|甲|***` ＋ Ctrl+B（左边那两颗只是三颗星的后两颗）", () => {
  shouldNotAction("***甲***", 3, 4, "**", "**");
});

testCase("`|***甲***|` 全选 ＋ Ctrl+B（里面还压着一颗）", () => {
  shouldNotAction("***甲***", 0, 7, "**", "**");
});

testCase("`***|甲|***` ＋ Ctrl+I", () => {
  shouldNotAction("***甲***", 3, 4, "*", "*");
});

testCase("`|**甲**|` 全选 ＋ Ctrl+I（加粗的两颗不是斜体那一颗）", () => {
  shouldNotAction("**甲**", 0, 5, "*", "*");
});

testCase("`~~|甲|~~` ＋ 下标（`~~` 是删除线，不是两个下标）", () => {
  shouldNotAction("~~甲~~", 2, 3, "~", "~");
});

testCase("`|~~甲~~|` 全选 ＋ 下标", () => {
  shouldNotAction("~~甲~~", 0, 5, "~", "~");
});

testCase("`**粗体**` 里只选中 `*粗体*`（选区只是更长一串的一段）", () => {
  // 摘了会把"加粗"变成"斜体"——那是改意思，不是去掉。
  shouldNotAction("**粗体**", 1, 6, "*", "*");
});

/* ── 三、边界 ───────────────────────────────────────────────────────── */

group("三、边界");

testCase("空选区：没有「已经加粗」可判，交给调用方插占位词", () => {
  shouldNoneWith("**甲**", 3, 3, "**", "**");
});

testCase("没带标记：`|甲|` ＋ Ctrl+B ⇒ 去包一层", () => {
  shouldNoneWith("甲", 0, 1, "**", "**");
});

testCase("只有半边：`**|甲|`（右边没闭上）⇒ 去包一层，与今天的行为一致", () => {
  shouldNoneWith("**甲", 2, 3, "**", "**");
});

testCase("只有半边：`|甲|**` ⇒ 去包一层", () => {
  shouldNoneWith("甲**", 0, 1, "**", "**");
});

testCase("`*|甲|*` ＋ Ctrl+B：一颗星不够两颗，那是斜体不是加粗 ⇒ 去包一层", () => {
  // 包出来是 `***甲***`（加粗叠在斜体上），与所见即所得那边一致。
  shouldNoneWith("*甲*", 1, 2, "**", "**");
});

testCase("⚠️ 拨两下回到原样（摘一次、再按原样包一次）", () => {
  const text4 = "这个词**很重**要";
  const from = 5;
  const to = 7; // `很重`
  const result3 = tryRemoveFixedBoundarySymbol(text4, from, to, "**", "**");
  if (result3 === null || result3.result2 === "不动") throw new Error("第一次应当判成摘");
  const removeAfter = setChangeAction2(text4, result3.changeAction);
  equal(removeAfter, "这个词很重要", "第一次摘完的文本");
  // ⚠️ 第二次要用**第一次返回的选区**（不是原来那个）：这正是"选区也得跟着
  // 一起算"的理由，算错的话这里会包到别的地方去。
  equal(packageValueLayer(removeAfter, result3.selection, "**", "**"), text4, "再包一次的文本");
});

/* ── 四、接线：八族都换了、链接没换 ─────────────────────────────────── */

group("四、`source-commands.ts` 的接线（2026-10-07 从 `source.ts` 搬出来）");

const sourceSource = readFileSync(join("src", "editor", "source-commands.ts"), "utf8");

testCase("八族行内标记与注释走的都是 `切换行内标记`（开关）", () => {
  const match = sourceSource.match(/splitReplaceInlineMark\(view,/g) ?? [];
  equal(match.length, 9, "`splitReplaceInlineMark(view,` 的条数");
});

testCase("链接仍旧走 `wrapSelection`（「再插一次链接」算不算开关**还没拍板**）", () => {
  // ⚠️ 这一条是**故意的**：链接的右定界符里带着地址，开关语义得单独判。
  equal(sourceSource.includes('wrapSelection(view, "[", `](${payload.href})`'), true, "链接那一行");
});

testCase("`wrapSelection` 只剩「被开关函数回调」与链接两处调用点", () => {
  const match = sourceSource.match(/wrapSelection\(view,/g) ?? [];
  equal(match.length, 2, "`wrapSelection(view,` 的条数");
});

/* ── 收尾 ───────────────────────────────────────────────────────────── */

console.log(`\n${pass} 过 / ${fail} 败`);
if (fail) {
  console.log(`败的：${failed.join("、")}`);
  process.exitCode = 1;
}
