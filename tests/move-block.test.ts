/**
 * `src/editor/move-block.ts` 那两条命令（`Alt+↑` / `Alt+↓`，2026-10-07）的判据。
 *
 * # 跑法（不装任何包：`esbuild` 与 `node` 仓库里都现成）
 *
 * ```sh
 * cd <仓库>
 * npx esbuild tests/move-block.test.ts --bundle --platform=node --format=esm \
 *   --alias:@=./src --outfile=/tmp/nota-测试/move-block.mjs
 * node /tmp/nota-测试/move-block.mjs
 * ```
 *
 * ⚠️ **两个开关都不要**（本批现场核过一遍）：这条链上没有一个 `@/…`
 * （`move-block.ts` 只从 `@milkdown/kit/…` 进），也没有一个 svg。所以它就是
 * `docs/06` §6.3 那个 `for` 循环里的普通一份。
 *
 * # 这一份测得到什么
 *
 * | 层 | 测法 |
 * |---|---|
 * | {@link 算移动}（纯算术） | 手搭文档 → 断言 `删` / `插到` / `光标` |
 * | {@link 移动块视图}（落地那一笔） | **真的** `EditorState` ＋ 一颗只够跑逻辑的假 view |
 * | {@link 建移动键位}（那颗键位插件） | 直接调 `spec.props.handleKeyDown(假视图, 假事件)` |
 *
 * ⚠️ **`EditorState` 在 node 里建得出来**（`prosemirror-state` 不吃 DOM），所以
 * "删了再插"那一笔可以真派、真 `apply`、真读出结果文档——这比只断言三个数字
 * 强得多。⚠️ 但**真的 `EditorView` 建不出来**（本仓没有 jsdom，见
 * `tests/fake-dom.ts` 文件头），所以"按下去到底哪颗键先跑""光标在屏幕上跳不跳"
 * 一律是开窗目检（`docs/06`）。
 *
 * # ⚠️ 这份测试里**好几条是写完当场抓到的错**（2026-10-07）
 *
 * 每一处都留了"写错会怎样"的症状在用例名/注释里——那是这一族命令最容易犯、
 * 而且**都不报错**的三类：
 *
 * - **顶层块整体偏一格**（`doc` 没有"开括号"，孩子从位置 0 就开始了）；
 * - **往下搬时插点算成"块自己"的身高**（两块不等高时内容落进邻块里面——第六组
 *   那条直接翻一条分隔线，写错的话 `insert` 当场越界抛出来）；
 * - **搬列表项落成 `NodeSelection`**（整项被选中，用户接着一敲字一整项就没了）。
 *
 * # 三条边界是这份测试的重点（都写在 `move-block.ts` 文件头）
 *
 * ① **表格里不做**（做"整个表格上移"比不做更坏）；
 * ② **两头顶住就是不动**（不绕回去、列表项不掉出列表）；
 * ③ **列表里搬的是列表项**，不是整个列表。
 */

import { Schema } from "@milkdown/kit/prose/model";
import type { Node as PMNode } from "@milkdown/kit/prose/model";
import { EditorState, NodeSelection, TextSelection } from "@milkdown/kit/prose/state";
import type { Transaction } from "@milkdown/kit/prose/state";
import type { EditorView } from "@milkdown/kit/prose/view";
import { createMoveKeymap, moveBlockView, computeMoveAction } from "../src/editor/move-block";

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

/**
 * 相等断言。⚠️ 对象走 `JSON` 比：`{from, to}` 那一族是**每次新建**的普通对象，
 * 用 `===` 的话每条都是红的，而报错信息里两边打印出来一模一样（很难看出是
 * 判据本身的问题）。
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

/* ── 一颗 Schema（段落 / 列表 / 表格 / 一条分隔线）────────────────────── */

const schema = new Schema({
  nodes: {
    doc: { content: "block+" },
    paragraph: { group: "block", content: "inline*" },
    text: { group: "inline" },
    bullet_list: { group: "block", content: "list_item+" },
    list_item: { content: "paragraph block*" },
    // 表格：只要能形成"祖先链里有一个叫 table 的节点"就够了（那条判据只看祖先）。
    table: { group: "block", content: "table_row+" },
    table_row: { content: "table_cell+" },
    table_cell: { content: "paragraph" },
    // 原子块（分隔线那一档）：**不是**文本块 —— 搬完之后落的是 `NodeSelection`。
    hr: { group: "block", atom: true },
  },
});

function paragraph2(character2: string): PMNode {
  return schema.node("paragraph", null, character2 ? [schema.text(character2)] : []);
}

function columnTable(...item5: string[]): PMNode {
  return schema.node("bullet_list", null, item5.map((character2) => schema.node("list_item", null, [paragraph2(character2)])));
}

function table2(character2: string): PMNode {
  return schema.node("table", null, [
    schema.node("table_row", null, [schema.node("table_cell", null, [paragraph2(character2)])]),
  ]);
}

function document(...block: PMNode[]): PMNode {
  return schema.node("doc", null, block);
}

/** 按顺序累加前面几块的尺寸 —— 手搭用例时用它算"第 n 块从哪开始"。 */
function ordinalHowManyBlockStart(document: PMNode, index: number): number {
  let start5 = 0;
  for (let i = 0; i < index; i++) start5 += document.child(i).nodeSize;
  return start5;
}

/**
 * 文档纯文本（块之间 `\n`，叶子给 U+FFFC），用来一眼看出"搬成什么样了"。
 *
 * ⚠️ `leafText` 这里给**函数**（每个叶子都算一个替身字符），与 `select.ts::摊开块`
 * 同一个口径：叶子在文档里各占**一个位置**，不给替身的话文本长度和位置数对不上。
 */
function fullText(document: PMNode): string {
  return document.textBetween(0, document.content.size, "\n", () => "￼");
}

/** 一颗只够跑逻辑的假 view：`移动块视图` 要的只有 `state` 与 `dispatch`。 */
function createFakeView(document: PMNode, cursor: number, nodeSelection = false) {
  const initial = EditorState.create({
    doc: document,
    selection: nodeSelection ? NodeSelection.create(document, cursor) : TextSelection.create(document, cursor),
  });
  const dispatched: Transaction[] = [];
  let current = initial;
  const view = {
    get state() {
      return current;
    },
    composing: false,
    dispatch(tr: Transaction) {
      dispatched.push(tr);
      current = current.apply(tr);
    },
  } as unknown as EditorView;
  return { view, dispatched, now: () => current };
}

/** 假事件。⚠️ 只给插件真正读过的那几个字段。 */
function createEvent(change2: Partial<Record<string, unknown>> = {}) {
  return {
    key: "ArrowUp",
    altKey: true,
    ctrlKey: false,
    metaKey: false,
    shiftKey: false,
    defaultPrevented: false,
    ...change2,
  } as unknown as KeyboardEvent;
}

/** 调那颗插件的 `handleKeyDown`（`spec.props` 是公开字段）。 */
function keypress(view: EditorView, event: KeyboardEvent): boolean | void {
  const plugin = createMoveKeymap();
  return plugin.spec.props!.handleKeyDown!(view, event);
}

/* ── 一、算移动：顶层块换位 ───────────────────────────────────────────── */

group("一、算移动：顶层块换位（三个坐标不许差一格）");

const threeParagraph = document(paragraph2("a"), paragraph2("b"), paragraph2("c"));
// 每段 nodeSize = 1（文字）+ 2（括号）= 3；第二段从位置 3 开始，内容从 4 开始
// ——光标放 5，也就是 `b` 之后那一格。
const twoMiddle = ordinalHowManyBlockStart(threeParagraph, 1) + 2;
const threeMiddle = ordinalHowManyBlockStart(threeParagraph, 2) + 1;

testCase("光标在第二段、往上搬 → 删的是它自己，插到第一段前面", () => {
  const plan = computeMoveAction(threeParagraph, twoMiddle, -1)!;
  assertValue(plan !== null, "该算得出来");
  equal(plan.remove, { from: 3, to: 6 }, "删的范围（第二段）");
  equal(plan.insertTo, 0, "插到最前");
  equal(plan.cursor, 2, "光标（搬完之后仍在 `b` 的那一格）");
  equal(plan.block.textContent, "b", "搬的是第二段");
});

testCase("同一格往下搬 → 插点在**删完之后**的坐标系里", () => {
  const plan = computeMoveAction(threeParagraph, twoMiddle, 1)!;
  equal(plan.remove, { from: 3, to: 6 }, "删的范围（第二段）");
  equal(plan.insertTo, 6, "插到第三段后面");
  equal(plan.cursor, 8, "光标");
});

testCase("⚠️ 真派一笔事务：`delete` ＋ `insert` 之后的内容和光标都对", () => {
  const { view, now, dispatched } = createFakeView(threeParagraph, twoMiddle);
  equal(moveBlockView(view, -1), true, "搬成了");
  equal(dispatched.length, 1, "**只派一笔**（分两笔的话 Ctrl+Z 只退半程）");
  equal(fullText(now().doc), "b\na\nc", "往上搬之后");
  equal(now().selection.from, 2, "光标跟着那一块走");
  // 再往回搬一次，应当回到原样（同一个函数、另一头）。
  const again = createFakeView(now().doc, now().selection.from);
  moveBlockView(again.view, 1);
  equal(fullText(again.now().doc), "a\nb\nc", "再搬回来");
});

testCase("第一段往上 / 最后一段往下 → null（不绕回去）", () => {
  equal(computeMoveAction(threeParagraph, 1, -1), null, "第一段往上");
  equal(computeMoveAction(threeParagraph, threeMiddle, 1), null, "最后一段往下");
});

testCase("到头了**什么都不派**（不是派一笔空事务）", () => {
  const { view, dispatched } = createFakeView(threeParagraph, 1);
  equal(moveBlockView(view, -1), false, "没搬成");
  equal(dispatched.length, 0, "一笔都不该派");
});

/* ── 二、不等高（插点跟**邻**的身高走）────────────────────────────────── */

group("二、两块不等高：插点跟邻的身高走，不是块自己的");

// a(3) / bb(4) / ccc(5)：第二段从 3 开始、长 4，第三段从 7 开始。
const heightShort = document(paragraph2("a"), paragraph2("bb"), paragraph2("ccc"));

testCase("段落往下翻过一段更长的 → 落在它**后面**，不是并进它里面", () => {
  const plan = computeMoveAction(heightShort, 4, 1)!;
  equal(plan.remove, { from: 3, to: 7 }, "删的是 `bb`");
  equal(plan.insertTo, 8, "第三段的身高是 5：3 ＋ 5 ＝ 8");
  const { view, now } = createFakeView(heightShort, 4);
  moveBlockView(view, 1);
  // ⚠️ 插点若写成"块自己"的身高（3 ＋ 4 ＝ 7），`bb` 会插进 `ccc` 中间：
  // 结果是 `a / cc / bb / c`（拆成两段），而且**不报错**。
  equal(fullText(now().doc), "a\nccc\nbb", "翻过去了");
});

testCase("往上搬同理（邻没动过，插点就是邻的起点）", () => {
  const plan = computeMoveAction(heightShort, 4, -1)!;
  equal(plan.insertTo, 0, "插到 `a` 前面");
  const { view, now } = createFakeView(heightShort, 4);
  moveBlockView(view, -1);
  equal(fullText(now().doc), "bb\na\nccc", "搬上来了");
});

/* ── 三、列表：搬的是列表项 ───────────────────────────────────────────── */

group("三、列表里搬的是**列表项**（不掉出列表、光标跟着走）");

const oneColumn = document(columnTable("a", "b"), paragraph2("c"));
// 列表 [0,12)：第一项 [1,6)、第二项 [6,11)；第二项里那段文字从 8 开始，光标放 8。
const twoItemMiddle = ordinalHowManyBlockStart(oneColumn, 0) + 1 + 5 + 1 + 1;

testCase("光标在第二个列表项里 → 搬的是**那一项**，不是整个列表", () => {
  const plan = computeMoveAction(oneColumn, twoItemMiddle, -1)!;
  equal(plan.block.type.name, "list_item", "搬的是一整个列表项");
  equal(plan.remove, { from: 6, to: 11 }, "删的是第二项");
  equal(plan.insertTo, 1, "插到第一项前面");
  equal(plan.cursor, 3, "光标跟到搬完之后的同一格（`b` 前面）");
});

testCase("⚠️ 搬列表项落的是**文字光标**，不是 `NodeSelection`", () => {
  const { view, now, dispatched } = createFakeView(oneColumn, twoItemMiddle);
  equal(moveBlockView(view, -1), true, "搬成了");
  equal(fullText(now().doc), "b\na\nc", "两项换了位，列表本身没动");
  const select = dispatched[0]!.selection;
  // ⚠️ 按"搬的那一块是不是文本块"判的话，这里会落成 `NodeSelection`：
  // 整项被高亮选中，用户接着一敲字**一整项就没了**。
  assertValue(select instanceof TextSelection, "列表项搬完该落在它自己的文字里");
  equal(select.from, 3, "落点就在 `b` 前面");
});

testCase("列表项**不会掉出列表**（第一项往上、最后一项往下都是 null）", () => {
  equal(computeMoveAction(oneColumn, 3, -1), null, "第一项往上");
  equal(computeMoveAction(oneColumn, twoItemMiddle, 1), null, "最后一项往下（不是「提升层级」）");
});

testCase("整条列表被选中（`NodeSelection`，光标在列表**前面**）→ 搬的是整个列表", () => {
  const plan = computeMoveAction(oneColumn, 0, 1)!;
  equal(plan.block.type.name, "bullet_list", "搬的是整个列表");
  equal(plan.remove, { from: 0, to: 12 }, "整条都是它");
  equal(plan.insertTo, 3, "插到后面那段的身高（3）之后");
  const { view, now, dispatched } = createFakeView(oneColumn, 0, true);
  equal(moveBlockView(view, 1), true, "搬成了");
  equal(fullText(now().doc), "c\na\nb", "列表挪到后面那段下面");
  assertValue(dispatched[0]!.selection instanceof NodeSelection, "整条列表仍然是被「选中」的状态");
});

/* ── 四、表格：里面什么都不做 ─────────────────────────────────────────── */

group("四、表格里 → null（做「整个表格上移」比不做更坏）");

testCase("光标在单元格里：往上往下都是 null", () => {
  const doc = document(table2("x"), paragraph2("y"));
  // 单元格里那段文字从位置 4 开始（table 0 → row 1 → cell 2 → paragraph 3 → 文字 4）。
  equal(computeMoveAction(doc, 5, -1), null, "往上");
  equal(computeMoveAction(doc, 5, 1), null, "往下");
  const { view, dispatched } = createFakeView(doc, 5);
  equal(moveBlockView(view, -1), false, "没搬成");
  equal(dispatched.length, 0, "一笔都不该派");
});

testCase("⚠️ 整张表被选中（光标在表**外面**）→ 照搬不误，落 `NodeSelection`", () => {
  const doc = document(table2("x"), paragraph2("y"));
  const plan = computeMoveAction(doc, 0, 1)!;
  equal(plan.block.type.name, "table", "搬的是整张表");
  equal(plan.remove, { from: 0, to: 9 }, "整张表（1 ＋ 7 ＋ 1）");
  equal(plan.insertTo, 3, "后面那段的身高");
  const { view, now, dispatched } = createFakeView(doc, 0, true);
  equal(moveBlockView(view, 1), true, "搬成了");
  // ⚠️ 单元格里那个段落也是**文本块**，所以它会连人带字一起摊出来（`y` 在前）。
  equal(fullText(now().doc), "y\nx", "整张表挪到了后面那段下面");
  assertValue(dispatched[0]!.selection instanceof NodeSelection, "整张表该是「被选中」的");
});

/* ── 五、原子块（分隔线）──────────────────────────────────────────────── */

group("五、原子块（分隔线）：搬完落 `NodeSelection`");

testCase("段落往下翻过一条分隔线（身高 1，差得最多的那一档）", () => {
  const doc = document(paragraph2("a"), schema.node("hr"));
  const plan = computeMoveAction(doc, 1, 1)!;
  equal(plan.block.type.name, "paragraph", "搬的是段落");
  equal(plan.insertTo, 1, "分隔线身高 1：0 ＋ 1 ＝ 1");
  const { view, now } = createFakeView(doc, 1);
  equal(moveBlockView(view, 1), true, "搬成了");
  // ⚠️ 插点若写成"块自己"的身高（0 ＋ 3 ＝ 3），删完之后文档只剩 1 个位置，
  // `insert(3, …)` 当场抛越界——这条是那块写错时**唯一会响**的一声。
  equal(fullText(now().doc), "￼\na", "分隔线上来了，段落到下面");
});

testCase("分隔线自己往上（`NodeSelection` 在它身上）→ 落 `NodeSelection`", () => {
  const doc = document(paragraph2("a"), schema.node("hr"));
  const plan = computeMoveAction(doc, 3, -1)!;
  equal(plan.block.type.name, "hr", "搬的是分隔线");
  equal(plan.remove, { from: 3, to: 4 }, "它自己那一个位置");
  equal(plan.insertTo, 0, "插到段落前面");
  const { view, now, dispatched } = createFakeView(doc, 3, true);
  equal(moveBlockView(view, -1), true, "搬成了");
  equal(fullText(now().doc), "￼\na", "分隔线到了最前");
  const select = dispatched[0]!.selection;
  assertValue(select instanceof NodeSelection, "原子块落不了文字光标（那个位置不接文字）");
  equal(select.from, 0, "选中的正是搬过去的那条线");
});

/* ── 六、键位插件那四条闸 ─────────────────────────────────────────────── */

group("六、建移动键位：四条闸（内容物 / 修饰键 / 组字 / 已经有人处理）");

testCase("只管 `ArrowUp` / `ArrowDown` 这两颗", () => {
  const { view } = createFakeView(threeParagraph, twoMiddle);
  for (const key of ["ArrowLeft", "ArrowRight", "a", "Enter"]) {
    equal(keypress(view, createEvent({ key })), false, `\`${key}\` 不该被吃掉`);
  }
});

testCase("必须**只有** `Alt`（`Ctrl` / `Meta` / `Shift` / 不按 Alt 一律放行）", () => {
  const { view, dispatched } = createFakeView(threeParagraph, twoMiddle);
  equal(keypress(view, createEvent({ altKey: false })), false, "不按 Alt");
  equal(keypress(view, createEvent({ ctrlKey: true })), false, "Ctrl+Alt+↑（那是 CM 的加光标）");
  equal(keypress(view, createEvent({ shiftKey: true })), false, "Shift+Alt+↑");
  equal(keypress(view, createEvent({ metaKey: true })), false, "Meta+Alt+↑");
  equal(dispatched.length, 0, "这四条一笔都不该派");
});

testCase("组字期间一概不碰（输入法在拿方向键挑候选）", () => {
  const { view, dispatched } = createFakeView(threeParagraph, twoMiddle);
  (view as unknown as { composing: boolean }).composing = true;
  equal(keypress(view, createEvent()), false, "组字期间放行");
  equal(dispatched.length, 0, "不动文档");
});

testCase("⚠️ `defaultPrevented` → **认下但不动**（代码块里那颗 CM 已经处理了）", () => {
  const { view, dispatched } = createFakeView(threeParagraph, twoMiddle);
  // 放行的话事件会继续走到 `baseKeymap` 的 `joinUp`，把两段并成一段。
  equal(keypress(view, createEvent({ defaultPrevented: true })), true, "要认下");
  equal(dispatched.length, 0, "但一个字都不许动");
});

testCase("正常那一下：认下 ＋ 真搬", () => {
  const { view, dispatched, now } = createFakeView(threeParagraph, twoMiddle);
  equal(keypress(view, createEvent()), true, "认下");
  equal(dispatched.length, 1, "派了一笔");
  equal(fullText(now().doc), "b\na\nc", "搬上去了");
  equal(keypress(view, createEvent({ key: "ArrowDown" })), true, "往下也认下");
  equal(fullText(now().doc), "a\nb\nc", "又搬回去了");
});

/* ── 汇总 ─────────────────────────────────────────────────────────────── */

console.log("\n" + "─".repeat(64));
console.log(`通过 ${pass} 条，失败 ${fail} 条`);
if (fail) {
  console.log("失败的：");
  for (const n of failed) console.log(`  - ${n}`);
  process.exit(1);
}
