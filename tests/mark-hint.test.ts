/**
 * `src/editor/mark-hint.ts` 里 `扫一段`（"光标所在的那一整段带标记的文字
 * 是哪一段"）的**可运行**测试集。
 *
 * # 跑法（不装任何包：`esbuild` 与 `node` 仓库里都现成）
 *
 * ```sh
 * cd <仓库>
 * npx esbuild tests/mark-hint.test.ts --bundle --platform=node --format=esm \
 *   --outfile=/tmp/nota-mark-hint-test/mark-hint.test.mjs
 * node /tmp/nota-mark-hint-test/mark-hint.test.mjs
 * ```
 *
 * 全过退出码 0；有不过的退出码 1，并把名字列出来。
 *
 * # 为什么单开一份（而不是塞进 `math-view.test.ts`）
 *
 * 那一份要假 DOM + 假 EditorView（它测的是 NodeView 那一层）。这里要测的是
 * **纯位置算术**：建一颗真 `Schema`、拼几颗真文本节点、问 `扫一段` 要哪一段。
 * 一行 DOM 都不碰，跑起来是毫秒级。
 *
 * # 这份测试是为什么写的（2026-09-26）
 *
 * 用户要的是"光标在黑体/斜体里就半透明显示 `*`"。第一版 `扫一段` 直接拿
 * `doc.resolve(p).marks()` 当"第 p 个字符的标记"用，于是**两端的标记都画在
 * 全段右移一格的地方**——无头目检里 `一二三四五`（加粗）显示成了
 * `一**二三四五***`。根因是 ProseMirror 的 `marks()` 问的是"**在 p 这个位置
 * 打字会拿到什么 mark**"（即左边那个字符的），不是"从 p 开始那个字符的"。
 * 下面「第 3 组」那几条就是照这个复发场景写的。
 *
 * # ⚠️ 这份测试**证明不了**什么
 *
 * 它证明不了：装饰有没有真的挂到 DOM 上、`::before` / `::after` 画成什么样、
 * 淡入动画、符号占不占宽度、光标进出时那一行会不会横向跳。那些一律是
 * **目检**的事（见 `docs/06` §5.9 起的开窗目检一节）。
 */

import { Schema } from "@milkdown/kit/prose/model";
import type { MarkType, Node as PMNode } from "@milkdown/kit/prose/model";
import { EditorState, TextSelection } from "@milkdown/kit/prose/state";
import { emphasisSchema, inlineCodeSchema, strongSchema } from "@milkdown/preset-commonmark";
import { readFileSync } from "node:fs";
import {
  findActiveMarkRange,
  createMarkHintPlugin,
  listSyntaxMarkers,
  scanOneParagraph,
  splitMarkCharacter,
  noticeTable,
} from "../src/editor/mark-hint";

/* ── 极小的测试工装（与 `math-view.test.ts` 同一套长相）───────────────── */

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

function contains(actual: string, fragment: string, description: string): void {
  if (!actual.includes(fragment)) {
    throw new Error(`${description}：${JSON.stringify(actual)} 里没有 ${JSON.stringify(fragment)}`);
  }
}

function read(path: string): string {
  return readFileSync(path, "utf8");
}

function renderDocument(node: PMNode): string {
  if (node.isText) return node.text ?? "";
  if (node.type.name === "notaSyntax") return String(node.attrs.symbol ?? "*");
  const output2: string[] = [];
  node.forEach((child) => output2.push(renderDocument(child)));
  return output2.join("");
}

/* ── 一颗够用的真 Schema（只要 strong / em 两个 mark）────────────────── */

const schema = new Schema({
  nodes: {
    doc: { content: "block+" },
    paragraph: { group: "block", content: "inline*" },
    text: { group: "inline" },
    // 行内原子的形状（`math_inline` / `image` 都是这一档）：`inline: true` +
    // `atom: true`，占**一个**位置，带不了 mark。
    atom: { group: "inline", inline: true, atom: true, selectable: false },
  },
  marks: {
    strong: {},
    em: {},
  },
});

const strong = schema.marks.strong as MarkType;
const slant = schema.marks.em as MarkType;
const paragraph2 = schema.nodes.paragraph;

/**
 * 拼一段：`甲 **一一一** 乙` 这种。`片段` 里每项是"文字 + 带哪些 mark"。
 *
 * ⚠️ 文本节点**只能**走 `schema.text()`——`schema.nodes.text.create(...)`
 * 会抛 `NodeType.create can't construct text nodes`（第一次跑就撞上了）。
 */
function combine2(fragment: readonly (readonly [string, readonly MarkType[]])[]): PMNode {
  const block: PMNode[] = fragment.map(([character2, mark]) => schema.text(character2, mark.map((m) => m.create())));
  return schema.nodes.doc.create(null, paragraph2.create(null, block));
}

/** 这一段的**内容**从哪个位置开始（绝对位置 1：doc 里第 0 个段落的内容起点）。 */
const blockFirst = 1;

/** 把"相对块首的偏移"翻成绝对位置。 */
function place(offset: number): number {
  return blockFirst + offset;
}

/** 把 `扫一段` 的结果翻成"相对块首的 [从, 到)"，好读。 */
function scan(doc: PMNode, offset: number, type: MarkType): [number, number] | null {
  const paragraphBoundary = scanOneParagraph(doc, place(offset), type);
  return paragraphBoundary ? [paragraphBoundary.from - blockFirst, paragraphBoundary.to2 - blockFirst] : null;
}

/** 把结果写成好读的字符串，失败信息里能一眼看出窗口挪到哪儿去了。 */
function show(result2: [number, number] | null): string {
  return result2 ? `[${result2[0]}, ${result2[1]})` : "null";
}

/* ── 用例 ─────────────────────────────────────────────────────────────── */

group("一、光标落在加粗段**里面**：整段两头都要包住");

//  位置: 0   1   2   3   4   5   6   7
//        │   一   二   三   四   五   │
//       甲   └─────── strong ──────┘   乙
//  上面那一行是**位置**（`位置` 落在哪个字符之前），不是字符本身。
//  ⚠️ 别照"第几个字"数偏移——`甲  前` 那种带空格的写法上一次就是在这里数错了一位。
const lengthAddCoarse = combine2([
  ["甲", []],
  ["一二三四五", [strong]],
  ["乙", []],
]);
const wholeParagraph: [number, number] = [1, 6];

testCase("光标在段首那个字之前（位置 1，紧贴段首）→ 整段", () => {
  equal(show(scan(lengthAddCoarse, 1, strong)), show(wholeParagraph), "紧贴段首也算落在里面");
});

testCase("光标在段中间（位置 3）→ 整段", () => {
  //  ⚠️ 这一格就是 2026-09-26 无头目检里复发的那一处：曾经答 [2, 7)
  //     （两端各右移一格，右端还吃掉了「乙」）。
  equal(show(scan(lengthAddCoarse, 3, strong)), show(wholeParagraph), "曾经答 [2, 7)");
});

testCase("光标在段尾那个字之后（位置 6，紧贴段尾）→ 整段", () => {
  // ⚠️ 这一格 2026-10-05 当天**翻过去又翻回来**：先改成"不画"，被用户拿 Typora
  //    的两张图推翻——**那边是照常显示的**，光标能在右符号两侧移动（`docs/07` BUG-65）。
  //    真正要改的是**画法**（右符号走 widget ＋ `side:-1`），不是"躲开不画"。
  equal(show(scan(lengthAddCoarse, 6, strong)), show(wholeParagraph), "刚打完 `**粗**` 时就是这个位置");
});

testCase("四个内部位置逐个走一遍，答案都一样", () => {
  for (const position3 of [1, 2, 3, 4, 5, 6]) {
    equal(show(scan(lengthAddCoarse, position3, strong)), show(wholeParagraph), `位置 ${position3}`);
  }
});

group("二、光标不在这一段里 → 什么都不显示");

testCase("光标在段首那个字**之前**（位置 0）→ null", () => {
  equal(show(scan(lengthAddCoarse, 0, strong)), "null", "位置 0 在「甲」之前");
});

testCase("光标在段尾那个字**之后**（位置 7，块尾）→ null", () => {
  equal(show(scan(lengthAddCoarse, 7, strong)), "null", "位置 7 在「乙」之后，不属于任何字符");
});

testCase("光标在段后面那个普通字之后 → null", () => {
  //  位置 6 是"紧贴段尾"（算），位置 7 是"跨过「乙」之后"（不算）——
  //  这两条差一格，正是最容易糊在一起的地方。
  equal(show(scan(lengthAddCoarse, 6, strong)), show(wholeParagraph), "位置 6 算");
  equal(show(scan(lengthAddCoarse, 7, strong)), "null", "位置 7 不算");
});

group("三、⚠️ 两端各有一个紧邻的另一段标记（最容易差一格）");

//  位置: 0   1   2   3   4   5   6
//       甲   一   二   三   乙   丙
//           └ strong ┘   └ strong ┘   ← 中间隔着「三」这个不带标记的字
const twoParagraphsAddCoarse = combine2([
  ["甲", []],
  ["一二", [strong]],
  ["三", []],
  ["乙丙", [strong]],
]);

testCase("光标在一段里时，**不许**越过中间那个不带标记的字", () => {
  equal(show(scan(twoParagraphsAddCoarse, 1, strong)), "[1, 3)", "第一段（紧贴段首）");
  equal(show(scan(twoParagraphsAddCoarse, 2, strong)), "[1, 3)", "第一段中间");
  equal(show(scan(twoParagraphsAddCoarse, 3, strong)), "[1, 3)", "第一段的段尾那一处");
  equal(show(scan(twoParagraphsAddCoarse, 4, strong)), "[4, 6)", "第二段（紧贴段首）");
  equal(show(scan(twoParagraphsAddCoarse, 6, strong)), "[4, 6)", "第二段的段尾那一处");
});

group("四、一个 mark 都没有的段落 → null（不许报错）");

const withoutMark = combine2([["甲 乙 丙", []]]);

testCase("普通段落里问加粗 → null", () => {
  for (const position3 of [0, 2, 5]) equal(show(scan(withoutMark, position3, strong)), "null", `位置 ${position3}`);
});

group("五、整段都是加粗（块首 / 块尾那两个边界）");

const allBold = combine2([["一二三", [strong]]]);

testCase("整段加粗：块首和块尾都算在里面", () => {
  equal(show(scan(allBold, 0, strong)), "[0, 3)", "块首");
  equal(show(scan(allBold, 2, strong)), "[0, 3)", "中间");
  equal(show(scan(allBold, 3, strong)), "[0, 3)", "块尾");
});

group("六、又粗又斜（两个 mark 叠在同一段上）");

const againCoarseAgainSlant = combine2([
  ["甲", []],
  ["一二三", [strong, slant]],
  ["乙", []],
]);

testCase("两个 mark 各扫各的，扫出来的是**同一段**", () => {
  equal(show(scan(againCoarseAgainSlant, 2, strong)), "[1, 4)", "粗");
  equal(show(scan(againCoarseAgainSlant, 2, slant)), "[1, 4)", "斜");
});

testCase("只带一个 mark 的段：另一个 mark 问出来是 null", () => {
  //  ⚠️ 这只是"两个 mark 各自扫出来是同一段"的**逻辑**侧。两个装饰落在
  //     同一段上时，ProseMirror 会把它们并成一颗 span、属性只剩一个赢家，
  //     所以 `***又粗又斜***` 画不出 `***`（画出来的长相见 `mark-hint.ts` 文件头）。
  equal(show(scan(lengthAddCoarse, 3, slant)), "null", "只有 strong，问 em 应该没有");
});

group("七、行内原子（公式 / 图片）占一格、且一律不带标记");

//  位置: 0   1   2   3
//       甲   [原子]   乙
//  上面是**位置**；`乙` 落在位置 2 到 3 之间那一格，所以它是偏移 2。
//  「原子」占一格（位置 1 到 2 之间），本身带不了 mark。
const withOriginalChild = schema.nodes.doc.create(
  null,
  paragraph2.create(null, [
    schema.text("甲"),
    schema.nodes.atom.create(null),
    schema.text("乙", [strong.create()]),
  ]),
);

testCase("问加粗：只扫出「乙」，原子不会被算进去", () => {
  equal(show(scan(withOriginalChild, 3, strong)), "[2, 3)", "位置 3 紧贴在「乙」之后（段尾）");
  equal(show(scan(withOriginalChild, 2, strong)), "[2, 3)", "位置 2 是「乙」的段首");
});

testCase("问加粗：原子自己那一格不算（它是节点不是字）", () => {
  equal(show(scan(withOriginalChild, 1, strong)), "null", "位置 1 是原子的起点");
});

group("八、⚠️ 提示表里的 mark 名字要和**真 preset** 对得上");

/**
 * 从 preset 导出的那一片里抠出 mark 的 id。
 *
 * ⚠️ 这几片**没有** `.id`（本仓装的这一版里是 `undefined`），真正带名字的是
 * ctx 的 key：`String(strongSchema.key.id)` = `"Symbol(Context-strong)"`。
 * 这个形状是**照着实际情况写的**，不是文档承诺的——哪天 milkdown 改了，
 * 这一条会红，那时候改的是这个函数，**不是删掉这一组用例**：
 * 它挡的是"名字写错、提示悄悄不出现"这种没有任何报错的坏法。
 */
function pickName(slice: { key?: { id?: unknown } }): string {
  const original = String(slice.key?.id);
  const match = /Context-(.*)\)$/.exec(original);
  if (!match) throw new Error(`认不出这个 ctx key 里的 mark 名：${original}`);
  return match[1] as string;
}

const assertValueName = new Set([
  pickName(strongSchema as unknown as { key?: { id?: unknown } }),
  pickName(emphasisSchema as unknown as { key?: { id?: unknown } }),
  pickName(inlineCodeSchema as unknown as { key?: { id?: unknown } }),
]);

testCase("先把 preset 的 id 认对（认错的话下面那两条就是假的）", () => {
  equal([...assertValueName].sort().join("、"), "emphasis、inlineCode、strong", "preset 里这三个 mark 的 id");
});

testCase("每一个名字都是当前 schema 真有的 mark id", () => {
  //  ⚠️ 这一组是**唯一**能挡住"名字写错、提示悄悄不出现"的东西。
  //     2026-09-26 就是这么错的：斜体写成 `"em"`，而 preset 里的 id 是
  //     `"emphasis"`——加粗的 `**` 出来了，斜体的 `*` 死活不出来，不报错。
  for (const { name3, left, right } of noticeTable) {
    assertion(
      assertValueName.has(name3) || ["strike_through", "highlight", "superscript", "subscript", "underline", "kbd"].includes(name3),
      `提示表里的「${name3}」（画 ${left}…${right}）不是已知 mark id`,
    );
  }
});

testCase("`em` 那种写法确实不在 preset 里（把这一课钉住）", () => {
  assertion(!assertValueName.has("em"), "`em` 不该是 preset 的 mark id——它是 `emphasis`");
});

testCase("所有行内标记都有真实左右符号，包括 `==`、`~~`、反引号与上下标", () => {
  const symbolNumber = noticeTable.map((line3) => `${line3.left}${line3.right}`).join(" ");
  contains(symbolNumber, "****", "加粗");
  contains(symbolNumber, "**", "斜体");
  contains(symbolNumber, "``", "行内代码");
  contains(symbolNumber, "~~~~", "删除线");
  contains(symbolNumber, "====", "高亮");
  contains(symbolNumber, "^^", "上标");
  contains(symbolNumber, "~~", "下标");
  contains(symbolNumber, "<u></u>", "下划线");
});

testCase("多字符标记拆成独立字符，`**` 不是一颗不可分的文字块", () => {
  equal(splitMarkCharacter("**").join("|"), "*|*", "加粗开闭符号");
  equal(splitMarkCharacter("<u>").join("|"), "<|u|>", "下划线开符号");
  equal(splitMarkCharacter("</u>").join("|"), "<|/|u|>", "下划线闭符号");
  for (const { left, right } of noticeTable) {
    for (const character of [...splitMarkCharacter(left), ...splitMarkCharacter(right)]) {
      equal(Array.from(character).length, 1, `${left} / ${right} 里有非单字符项`);
    }
  }
});

testCase("行内标记默认是正文实色的实体字符，不是灰色鬼影", () => {
  const css = read("src/styles/marks.css");
  const block = /\.nota-syntax-marker\s*\{([\s\S]*?)\}/.exec(css)?.[1] ?? "";
  assertion(block.includes("color: var(--mark-hint-fg, inherit);"), "标记仍使用弱化前景色");
  assertion(block.includes("opacity: var(--mark-hint-opacity, 1);"), "标记默认透明度不是 1");
  assertion(!block.includes("animation:"), "标记仍会从透明淡入成鬼影");
  assertion(!block.includes("pointer-events: none"), "标记仍不可点击");
  assertion(!block.includes("user-select: none"), "标记仍不可选中");
});

testCase("`**` 是文档里的真实文本，光标可以停在标记与正文之间", () => {
  const markerSchema = new Schema({
    nodes: {
      text: { group: "inline" },
      paragraph: { group: "block", content: "inline*" },
      notaSyntax: {
        inline: true,
        group: "inline",
        atom: true,
        marks: "",
        attrs: {
          syntax: { default: "" },
          side: { default: "left" },
          symbol: { default: "*" },
        },
      },
      doc: { content: "block+" },
    },
    marks: {
      strong: {},
    },
  });
  const strong = markerSchema.marks.strong!;
  const syntax = markerSchema.nodes.notaSyntax!;
  const marker = (text4: string, side: "left" | "right") =>
    Array.from(text4).map((symbol) =>
      syntax.create({ syntax: "strong", side, symbol }),
    );
  const document = markerSchema.node("doc", null, [
    markerSchema.node("paragraph", null, [
      markerSchema.text("甲"),
      ...marker("**", "left"),
      markerSchema.text("1111", [strong.create()]),
      ...marker("**", "right"),
      markerSchema.text("乙"),
    ]),
  ]);

  equal(listSyntaxMarkers(document, syntax).length, 2, "左右语法文本不是真实节点");
  const active = findActiveMarkRange(document, 4, strong, syntax);
  assertion(active !== null, "光标停在标记与正文之间时没有识别到活动标记");
  equal(active.from, 4, "正文起点");
  equal(active.to2, 8, "正文终点");
  equal(active.leftMarker?.text4, "**", "左标记不是实体文本");
  equal(active.rightMarker?.text4, "**", "右标记不是实体文本");
  assertion(
    findActiveMarkRange(document, 2, strong, syntax) !== null,
    "光标停在左标记左侧时不应立即收起",
  );
  assertion(
    findActiveMarkRange(document, 11, strong, syntax) === null,
    "光标已经进入后面正文时右标记仍显示",
  );
});

testCase("真实语法文字通过 mark serializer 排除，不会重复写进 Markdown", () => {
  const source = read("src/editor/mark-hint.ts");
  const assembly = read("src/editor/assemble.ts");
  contains(source, "match: (node: PMNode) => node.type.name === \"notaSyntax\"", "语法节点没有序列化匹配");
  contains(source, "atom: true", "语法节点仍能吸收边界输入");
  contains(source, "symbol: { default: \"*\" }", "语法节点没有真实星号字形");
  contains(assembly, "[...inlineSyntaxNodePlugins, markHint]", "语法节点没有装进可编辑实例");
});

testCase("左键移出标记后不会把光标映射回起点并立刻重插", () => {
  const source = read("src/editor/mark-hint.ts");
  contains(source, "interface MarkHintState", "没有记录边界抑制状态");
  contains(source, "suppressedAt", "没有保存已收起的边界位置");
  contains(source, "selection.from !== suppressedAt", "收起后的边界仍会立刻重插");
  contains(source, "tr.selectionSet || tr.docChanged", "光标再次移动或输入时没有解除抑制");
});

testCase("真实 EditorState 连续按左键：标记只收起一次，不在边界来回闪动", () => {
  const markerSchema = new Schema({
    nodes: {
      text: { group: "inline" },
      paragraph: { group: "block", content: "inline*" },
      notaSyntax: {
        inline: true,
        group: "inline",
        atom: true,
        marks: "",
        attrs: {
          syntax: { default: "" },
          side: { default: "left" },
          symbol: { default: "*" },
        },
      },
      doc: { content: "block+" },
    },
    marks: {
      strong: {},
    },
  });
  const strong = markerSchema.marks.strong!;
  const syntax = markerSchema.nodes.notaSyntax!;
  const doc = markerSchema.node("doc", null, [
    markerSchema.node("paragraph", null, [
      markerSchema.text("甲"),
      markerSchema.text("1111", [strong.create()]),
    ]),
  ]);
  let state = EditorState.create({
    schema: markerSchema,
    doc,
    selection: TextSelection.create(doc, 4),
    plugins: [createMarkHintPlugin(syntax)],
  });
  state = state.apply(state.tr.setSelection(TextSelection.create(state.doc, 4)));
  equal(listSyntaxMarkers(state.doc, syntax).length, 2, "光标进入加粗段后没有生成左右实体标记");

  const counts: number[] = [2];
  for (let step = 0; step < 8 && state.selection.from > 1; step++) {
    state = state.apply(
      state.tr.setSelection(TextSelection.create(state.doc, state.selection.from - 1)),
    );
    counts.push(listSyntaxMarkers(state.doc, syntax).length);
  }
  const firstHidden = counts.indexOf(0);
  assertion(firstHidden >= 0, `连续左移没有收起标记：${counts.join(",")}`);
  assertion(
    counts.slice(firstHidden).every((count) => count === 0),
    `左移越过边界后标记又闪回来了：${counts.join(",")}`,
  );

  const beforeReturn = state.selection.from;
  state = state.apply(
    state.tr.setSelection(TextSelection.create(state.doc, beforeReturn + 1)),
  );
  equal(listSyntaxMarkers(state.doc, syntax).length, 2, "右移回到加粗段时没有重新显示实体标记");

  const rightMarker = listSyntaxMarkers(state.doc, syntax).find((item) => item.side === "right");
  assertion(!!rightMarker, "右侧星号节点不存在");
  state = state.apply(
    state.tr.setSelection(TextSelection.create(state.doc, rightMarker.to2)),
  );
  const rightSteps: number[] = [];
  for (let step = 0; step < 4; step++) {
    state = state.apply(
      state.tr.setSelection(TextSelection.create(state.doc, state.selection.from - 1)),
    );
    rightSteps.push(state.selection.from);
  }
  equal(
    JSON.stringify(rightSteps),
    JSON.stringify([
      rightMarker.to2 - 1,
      rightMarker.to2 - 2,
      rightMarker.to2 - 3,
      rightMarker.to2 - 4,
    ]),
    "从右侧星号向左必须逐格经过 `文本|**`，不能吸附回星号末尾",
  );
});

testCase("临时星号两侧仍是正常可输入的正文边界", () => {
  const markerSchema = new Schema({
    nodes: {
      text: { group: "inline" },
      paragraph: { group: "block", content: "inline*" },
      notaSyntax: {
        inline: true,
        group: "inline",
        atom: true,
        marks: "",
        attrs: {
          syntax: { default: "" },
          side: { default: "left" },
          symbol: { default: "*" },
        },
      },
      doc: { content: "block+" },
    },
    marks: { strong: {} },
  });
  const strong = markerSchema.marks.strong!;
  const syntax = markerSchema.nodes.notaSyntax!;
  const doc = markerSchema.node("doc", null, [
    markerSchema.node("paragraph", null, [
      markerSchema.text("1111", [strong.create()]),
    ]),
  ]);
  let state = EditorState.create({
    schema: markerSchema,
    doc,
    selection: TextSelection.create(doc, 3),
    plugins: [createMarkHintPlugin(syntax)],
  });
  state = state.apply(state.tr.setSelection(TextSelection.create(state.doc, 3)));
  const existing = listSyntaxMarkers(state.doc, syntax);
  const left = existing.find((item) => item.side === "left");
  const right = existing.find((item) => item.side === "right");
  assertion(!!left && !!right, "没有生成左右星号");

  const before = state;
  state = state.apply(state.tr.insertText("前", left.from));
  assertion(
    renderDocument(state.doc).includes("前**1111**"),
    `左星号之前无法输入：${renderDocument(state.doc)}`,
  );

  const leftInside = before.apply(
    before.tr.setSelection(TextSelection.create(before.doc, left.to2)),
  );
  const innerRange = findActiveMarkRange(
    leftInside.doc,
    leftInside.selection.from,
    strong,
    syntax,
  );
  assertion(
    innerRange?.from === leftInside.selection.from,
    `左内侧没有识别成正文起点：${JSON.stringify(innerRange)} / ${leftInside.selection.from}`,
  );
  assertion(
    leftInside.storedMarks?.some((mark) => mark.type === strong) === true,
    `左内侧没有设置相邻格式：${JSON.stringify(leftInside.storedMarks?.map((mark) => mark.type.name))}`,
  );
  state = leftInside.apply(leftInside.tr.insertText("内"));
  assertion(
    renderDocument(state.doc).includes("**内1111**"),
    `正文开头无法输入：${renderDocument(state.doc)}`,
  );

  const rightInside = before.apply(
    before.tr.setSelection(TextSelection.create(before.doc, right.from)),
  );
  state = rightInside.apply(rightInside.tr.insertText("尾"));
  assertion(
    renderDocument(state.doc).includes("**1111尾**"),
    `正文结尾无法输入：${renderDocument(state.doc)}`,
  );

  state = before.apply(before.tr.insertText("后", right.to2));
  assertion(
    renderDocument(state.doc).includes("**1111**后"),
    `右星号之后无法输入：${renderDocument(state.doc)}`,
  );
});

/* ── 收尾 ─────────────────────────────────────────────────────────────── */

console.log(`\n${"─".repeat(64)}`);
console.log(`通过 ${pass} 条，失败 ${fail} 条`);
if (fail) {
  console.log(`失败的：\n  - ${failed.join("\n  - ")}`);
  process.exitCode = 1;
}

// ℹ️ 这份文件里 `断言` 只有个别用例用得上（大部分是"等"），留着是为了与
//    `math-view.test.ts` 同一套工装长相——别因为"没人用"就删掉。
void assertion;
