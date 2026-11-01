/**
 * `src/editor/mark-hint*.ts` 里行内语法节点与编辑事务的可运行测试集。
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
 * # 为什么与纯位置扫描分开
 *
 * `mark-hint.test.ts` 只测纯位置算术；这里测可见语法节点、序列化排除以及
 * 输入 / 退格后的整段重解析。两份拆开是为了让各自守住 1000 行硬线。
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
  moveInlineCaret,
  scanOneParagraph,
  splitMarkCharacter,
  noticeTable,
  backspaceAfterRightMarker,
  backspaceAtLeftMarker,
  restoreStrongAfterThirdStar,
} from "../src/editor/mark-hint";
import { plainSyntaxRanges, syntaxTextClass } from "../src/editor/plain-syntax";

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
group("九、未完成的 Markdown 标点使用独立的字形整形路径");

testCase("连续的 `*` 与 `=` 各自成为一个标点段", () => {
  equal(JSON.stringify(plainSyntaxRanges("**1")), JSON.stringify([{ from: 0, to2: 2 }]), "bold opener");
  equal(
    JSON.stringify(plainSyntaxRanges("x==1==")),
    JSON.stringify([
      { from: 1, to2: 3 },
      { from: 4, to2: 6 },
    ]),
    "highlight delimiters",
  );
});

testCase("反斜杠转义的标点保持普通正文", () => {
  equal(JSON.stringify(plainSyntaxRanges("\\*")), JSON.stringify([]), "escaped star");
  equal(JSON.stringify(plainSyntaxRanges("\\\\*")), JSON.stringify([{ from: 2, to2: 3 }]), "literal backslash before star");
});

testCase("标点段使用独立的 CSS 类，不改变文档节点", () => {
  equal(syntaxTextClass, "nota-syntax-text", "syntax punctuation class");
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

testCase("已确认的行内语法标记默认半透明，普通同形字符不受影响", () => {
  const css = read("src/styles/marks.css");
  const block = /\.nota-syntax-marker\s*\{([\s\S]*?)\}/.exec(css)?.[1] ?? "";
  assertion(
    block.includes("color-mix(in srgb, var(--mark-hint-fg, currentColor) 45%, var(--doc-bg));"),
    "标记仍使用与纸面混合的弱化前景色",
  );
  assertion(block.includes("opacity: 1;"), "标记仍在创建独立透明栅格层");
  assertion(block.includes("display: contents !important;"), "语法标记仍会生成独立行盒");
  assertion(block.includes("line-height: inherit !important;"), "语法标记没有继承正文行高");
  assertion(
    block.includes("line-height: inherit !important;"),
    "语法标记没有强制继承正文实际行高，节点重建时会上下跳",
  );
  assertion(block.includes("vertical-align: baseline !important;"), "语法标记没有固定正文基线");
  assertion(block.includes("font: inherit !important;"), "语法标记没有继承完整字体度量");
  assertion(!block.includes("animation:"), "标记仍会从透明淡入成鬼影");
  assertion(!block.includes("pointer-events: none"), "标记仍不可点击");
  assertion(!block.includes("user-select: none"), "标记仍不可选中");
});

testCase("块级语法标记和待成块标题前缀也使用半透明显示", () => {
  const css = read("src/styles/marks.css");
  const source = /\.nota-srcmark::before\s*\{([\s\S]*?)\}/.exec(css)?.[1] ?? "";
  const heading = /\.nota-heading-prefix\s*\{([\s\S]*?)\}/.exec(css)?.[1] ?? "";
  assertion(source.includes("opacity: var(--source-marker-opacity, 0.55);"), "块级标记没有半透明");
  assertion(heading.includes("opacity: var(--source-marker-opacity, 0.55);"), "标题前缀没有半透明");
});

testCase("无序与有序列表使用同一尺寸的生成标记，不随光标进出跳变", () => {
  const blocks = read("src/styles/editor-blocks.css");
  const marks = read("src/styles/marks.css");
  const bullet = read("src/assets/icons/nota-source-bullet-symbolic.svg");
  contains(blocks, 'ul > li:not([data-item-type="task"])::before', "无序列没有统一生成标记");
  contains(blocks, "width: 10px;", "无序列表圆点尺寸没有统一");
  contains(blocks, "counter(nota-list-item)", "有序列表没有统一编号标记");
  contains(blocks, "font-family: inherit;", "有序编号没有沿用正文字体");
  contains(blocks, "font-size: inherit;", "有序编号没有沿用正文字号");
  contains(blocks, "margin-block: 0;", "列表仍吃浏览器默认外边距，转换时会整行下跳");
  assertion(!blocks.includes("font-variant-numeric: tabular-nums;"), "有序编号仍使用与正文不同形状的数字字形");
  contains(marks, 'data-srcmark="-"', "无序列表源码提示缺失");
  contains(marks, "width: 10px;", "源码提示的圆点尺寸没有同步");
  contains(bullet, 'r="5"', "无序列表圆点仍然过小");
  contains(blocks, "background-color: var(--fg);", "无序列表圆点不是正文纯色");
  contains(blocks, "opacity: 1;", "列表标记仍然半透明");
  contains(marks, "li.nota-srcmark::before", "源码提示没有使用列表专用基线");
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
  const syntax = read("src/editor/mark-hint-source.ts");
  const assembly = read("src/editor/assemble.ts");
  contains(source, "inlineSyntaxNodeSpec", "主插件没有接入语法节点规格");
  contains(syntax, "match: (node: PMNode) => node.type.name === \"notaSyntax\"", "语法节点没有序列化匹配");
  contains(syntax, "atom: true", "语法节点仍能吸收边界输入");
  contains(syntax, "symbol: { default: \"*\" }", "语法节点没有真实星号字形");
  contains(
    assembly,
    "[...inlineSyntaxNodePlugins, ...inlineEscapeNodePlugins, markHint]",
    "语法节点没有装进可编辑实例",
  );
});

testCase("代码块不进入行内标记重解析", () => {
  const source = read("src/editor/mark-hint.ts");
  const syntax = read("src/editor/mark-hint-source.ts");
  const guards = [
    ...source.matchAll(/!parent\.isTextblock \|\| parent\.type\.spec\.code/g),
    ...syntax.matchAll(/!parent\.isTextblock \|\| parent\.type\.spec\.code/g),
  ];
  equal(guards.length, 4, "代码块守卫没有覆盖全部四个行内重写入口");
});

testCase("左键移出标记后不会把光标映射回起点并立刻重插", () => {
  const source = read("src/editor/mark-hint.ts");
  contains(source, "interface MarkHintState", "没有记录边界抑制状态");
  contains(source, "suppressedAt", "没有保存已收起的边界位置");
  contains(source, "selection.from !== suppressedAt", "收起后的边界仍会立刻重插");
  contains(source, "if (tr.docChanged) return { suppressedAt: null };", "输入后没有解除抑制");
  contains(source, "tr.selection.from === value.suppressedAt", "同位置选区同步错误地解除抑制");
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

testCase("Left 和 Home 能跨过行内语法原子到达行首", () => {
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
  const syntax = markerSchema.nodes.notaSyntax!;
  const marker = (side: "left" | "right") =>
    syntax.create({ syntax: "strong", side, symbol: "*" });
  const doc = markerSchema.node("doc", null, [
    markerSchema.node("paragraph", null, [
      marker("left"),
      marker("left"),
      markerSchema.text("1", [markerSchema.marks.strong!.create()]),
      marker("right"),
      marker("right"),
    ]),
  ]);
  let state = EditorState.create({
    schema: markerSchema,
    doc,
    selection: TextSelection.create(doc, 2),
    plugins: [createMarkHintPlugin(syntax)],
  });

  const left = moveInlineCaret(state, syntax, "ArrowLeft");
  assertion(!!left, "Left did not cross the opening marker atom");
  state = state.apply(left);
  equal(state.selection.from, 1, "Left should reach the true paragraph start");

  state = state.apply(state.tr.setSelection(TextSelection.create(state.doc, 3)));
  const home = moveInlineCaret(state, syntax, "Home");
  assertion(!!home, "Home did not produce a line-start transaction");
  state = state.apply(home);
  equal(state.selection.from, 1, "Home should reach the true paragraph start");
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

testCase("光标在右闭标记之后按退格只删除一颗，不补回第二颗", () => {
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
    markerSchema.node("paragraph", null, [markerSchema.text("1111", [strong.create()])]),
  ]);
  let state = EditorState.create({
    schema: markerSchema,
    doc,
    selection: TextSelection.create(doc, 3),
    plugins: [createMarkHintPlugin(syntax)],
  });
  state = state.apply(state.tr.setSelection(TextSelection.create(state.doc, 3)));
  const right = listSyntaxMarkers(state.doc, syntax).find((item) => item.side === "right");
  assertion(!!right, "右侧星号节点不存在");
  state = state.apply(
    state.tr.setSelection(TextSelection.create(state.doc, right.to2)),
  );
  const tr = backspaceAfterRightMarker(state, syntax);
  assertion(!!tr, "右边界 Backspace 没有产生事务");
  state = state.apply(tr);
  equal(renderDocument(state.doc), "**1111*", "一次退格只删除一颗星号");
  equal(state.doc.firstChild?.textContent, "**1111*", "文档同步为字面 Markdown");
  equal(listSyntaxMarkers(state.doc, syntax).length, 0, "没有 emphasis schema 时整体退回字面文字");

  // 真实浏览器在 Backspace 之后还可能补一笔“只同步选区”的事务。它的位置
  // 没动，抑制状态不能因此清空；否则 appendTransaction 会把标记重新补上，
  // 下一次 Backspace 又收起，表现为两帧来回循环。
  state = state.apply(
    state.tr.setSelection(TextSelection.create(state.doc, state.selection.from)),
  );
  equal(
    renderDocument(state.doc),
    "**1111*",
    "同位置的选区同步不应补回第二颗星号",
  );

  state = state.apply(state.tr.delete(state.selection.from - 1, state.selection.from));
  equal(renderDocument(state.doc), "**1111", "第二次退格删除剩余那颗星号");
});

testCase("光标在左标记与正文之间按退格：删一颗且同一事务内完成语法降级", () => {
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
    marks: { strong: {}, emphasis: {} },
  });
  const strong = markerSchema.marks.strong!;
  const emphasis = markerSchema.marks.emphasis!;
  const syntax = markerSchema.nodes.notaSyntax!;
  const doc = markerSchema.node("doc", null, [
    markerSchema.node("paragraph", null, [markerSchema.text("1", [strong.create()])]),
  ]);
  let state = EditorState.create({
    schema: markerSchema,
    doc,
    selection: TextSelection.create(doc, 2),
    plugins: [createMarkHintPlugin(syntax)],
  });
  state = state.apply(state.tr.setSelection(TextSelection.create(state.doc, 2)));
  const left = listSyntaxMarkers(state.doc, syntax).find((item) => item.side === "left");
  assertion(!!left, "左侧星号节点不存在");
  // `**|1**`：光标在第 2 颗左星号与正文之间。
  state = state.apply(
    state.tr.setSelection(TextSelection.create(state.doc, left.to2)),
  );

  const tr = backspaceAtLeftMarker(state, syntax);
  assertion(!!tr, "左边界 Backspace 没有产生事务");
  state = state.apply(tr);
  equal(renderDocument(state.doc), "*1**", "一次退格只删除一颗左星号");
  equal(listSyntaxMarkers(state.doc, syntax).length, 0, "不完整配对退回字面文字");
  let italicOne = false;
  state.doc.firstChild?.descendants((node) => {
    if (node.isText && node.text === "1" && node.marks.some((mark) => mark.type === emphasis)) {
      italicOne = true;
      return false;
    }
    return true;
  });
  assertion(!italicOne, "`*1**` 不再由局部上下文强行解释成斜体");

  // 浏览器随后同步选区时不能把刚删掉的星号补回来。
  state = state.apply(
    state.tr.setSelection(TextSelection.create(state.doc, state.selection.from)),
  );
  equal(renderDocument(state.doc), "*1**", "同位置选区同步触发了删除／补回循环");
});

testCase("光标落在多字符右闭标记内部时，只删除光标前的一颗", () => {
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
  const syntax = markerSchema.nodes.notaSyntax!;
  const doc = markerSchema.node("doc", null, [
    markerSchema.node("paragraph", null, [markerSchema.text("1", [markerSchema.marks.strong!.create()])]),
  ]);
  let state = EditorState.create({
    schema: markerSchema,
    doc,
    selection: TextSelection.create(doc, 2),
    plugins: [createMarkHintPlugin(syntax)],
  });
  state = state.apply(state.tr.setSelection(TextSelection.create(state.doc, 2)));
  const right = listSyntaxMarkers(state.doc, syntax).find((item) => item.side === "right");
  assertion(!!right && right.to2 - right.from === 2, "右侧应有两颗星号");
  // 模拟视觉光标贴最右、模型选区却落在两颗闭星号之间：`**1*|*`。
  state = state.apply(
    state.tr.setSelection(TextSelection.create(state.doc, right.from + 1)),
  );
  const tr = backspaceAfterRightMarker(state, syntax);
  assertion(!!tr, "闭标记内部按退格没有产生事务");
  state = state.apply(tr);
  equal(renderDocument(state.doc), "**1*", "应得到 `**1*`，不能补回第二颗");
});

testCase("删除一颗后重新解析 Markdown：`**1*` 变成字面星号加斜体 1", () => {
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
    marks: { strong: {}, emphasis: {} },
  });
  const syntax = markerSchema.nodes.notaSyntax!;
  const doc = markerSchema.node("doc", null, [
    markerSchema.node("paragraph", null, [markerSchema.text("1", [markerSchema.marks.strong!.create()])]),
  ]);
  let state = EditorState.create({
    schema: markerSchema,
    doc,
    selection: TextSelection.create(doc, 2),
    plugins: [createMarkHintPlugin(syntax)],
  });
  state = state.apply(state.tr.setSelection(TextSelection.create(state.doc, 2)));
  const right = listSyntaxMarkers(state.doc, syntax).find((item) => item.side === "right");
  assertion(!!right, "右侧星号节点不存在");
  state = state.apply(state.tr.setSelection(TextSelection.create(state.doc, right.to2)));

  const tr = backspaceAfterRightMarker(state, syntax);
  assertion(!!tr, "重新解析路径没有产生事务");
  state = state.apply(tr);
  equal(state.doc.firstChild?.textContent, "*1", "文档正文应同步为 `*1`");
  equal(
    state.selection.from,
    state.doc.firstChild!.nodeSize - 1,
    "退格后光标必须落在 `**1*|`，不能在闭合星号与字面星号之间",
  );
  let italicOne = false;
  state.doc.firstChild?.descendants((node) => {
    if (node.isText && node.text?.includes("1") && node.marks.some((mark) => mark.type.name === "emphasis")) {
      italicOne = true;
      return false;
    }
    return true;
  });
  assertion(italicOne, "`**1*` 的合法格式是斜体 `*1`");
  equal(renderDocument(state.doc), "**1*", "可见提示同步为 `**1*`");

  state = state.apply(
    state.tr.insertText("*", state.selection.from),
  );
  equal(state.doc.firstChild?.textContent, "1", "第三颗星输入后应移除字面星号");
  let strongOne = false;
  state.doc.firstChild?.descendants((node) => {
    if (node.isText && node.text === "1" && node.marks.some((mark) => mark.type.name === "strong")) {
      strongOne = true;
      return false;
    }
    return true;
  });
  assertion(strongOne, "数字 1 应恢复粗体");
  equal(renderDocument(state.doc), "**1**", "最终继续显示完整标记");
  equal(
    state.selection.from,
    state.doc.firstChild!.nodeSize - 1,
    "恢复粗体后光标必须在整组闭合星号之后",
  );
});

testCase("`==1==` 连续退格：先成 `==1=`，再成 `==1`，不会被补回", () => {
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
          symbol: { default: "=" },
        },
      },
      doc: { content: "block+" },
    },
    marks: { highlight: {} },
  });
  const syntax = markerSchema.nodes.notaSyntax!;
  const doc = markerSchema.node("doc", null, [
    markerSchema.node("paragraph", null, [markerSchema.text("1", [markerSchema.marks.highlight!.create()])]),
  ]);
  let state = EditorState.create({
    schema: markerSchema,
    doc,
    selection: TextSelection.create(doc, 2),
    plugins: [createMarkHintPlugin(syntax)],
  });
  state = state.apply(state.tr.setSelection(TextSelection.create(state.doc, 2)));
  const right = listSyntaxMarkers(state.doc, syntax).find((item) => item.side === "right");
  assertion(!!right, "右侧等号节点不存在");
  state = state.apply(state.tr.setSelection(TextSelection.create(state.doc, right.to2)));

  const first = backspaceAfterRightMarker(state, syntax);
  assertion(!!first, "第一次退格没有产生事务");
  state = state.apply(first);
  equal(state.doc.firstChild?.textContent, "==1=", "第一次退格后显示 `==1=`");
  equal(listSyntaxMarkers(state.doc, syntax).length, 0, "不完整的 `==1=` 不应再生成提示标记");

  // 第二次已是普通文字，退格由原生文本删除处理，不能被提示插件补回。
  state = state.apply(state.tr.delete(state.selection.from - 1, state.selection.from));
  equal(state.doc.firstChild?.textContent, "==1", "第二次退格后显示 `==1`");
  equal(listSyntaxMarkers(state.doc, syntax).length, 0, "普通文字退格后没有语法节点");
});

testCase("连续输入 `**1**`：前三个星号不能先把 1 降级成斜体", () => {
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
    marks: { strong: {}, emphasis: {} },
  });
  const syntax = markerSchema.nodes.notaSyntax!;
  const strong = markerSchema.marks.strong!;
  const emphasis = markerSchema.marks.emphasis!;
  const empty = markerSchema.node("doc", null, [
    markerSchema.node("paragraph"),
  ]);
  let state = EditorState.create({
    schema: markerSchema,
    doc: empty,
    selection: TextSelection.create(empty, 1),
    plugins: [createMarkHintPlugin(syntax)],
  });

  const type = (character: string) => {
    state = state.apply(
      state.tr.insertText(character, state.selection.from),
    );
  };
  for (const character of ["*", "*", "1", "*", "*"]) type(character);

  let strongOne = false;
  let italicOne = false;
  state.doc.firstChild?.descendants((node) => {
    if (!node.isText || node.text !== "1") return true;
    strongOne ||= node.marks.some((mark) => mark.type === strong);
    italicOne ||= node.marks.some((mark) => mark.type === emphasis);
    return true;
  });
  equal(renderDocument(state.doc), "**1**", "最终源码应保持 `**1**`");
  assertion(strongOne, "数字 1 应识别成粗体");
  assertion(!italicOne, "数字 1 不应被错误降级成斜体");
});

testCase("`***1***` 退格一颗：变成字面星号加粗体 1", () => {
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
    marks: { strong: {}, emphasis: {} },
  });
  const syntax = markerSchema.nodes.notaSyntax!;
  const strong = markerSchema.marks.strong!;
  const emphasis = markerSchema.marks.emphasis!;
  const doc = markerSchema.node("doc", null, [
    markerSchema.node("paragraph", null, [
      markerSchema.text("1", [strong.create(), emphasis.create()]),
    ]),
  ]);
  let state = EditorState.create({
    schema: markerSchema,
    doc,
    selection: TextSelection.create(doc, 2),
    plugins: [createMarkHintPlugin(syntax)],
  });
  state = state.apply(state.tr.setSelection(TextSelection.create(state.doc, 2)));
  const right = listSyntaxMarkers(state.doc, syntax).filter((marker) => marker.side === "right").at(-1);
  assertion(!!right, "三颗星右侧闭合标记不存在");
  state = state.apply(
    state.tr.setSelection(TextSelection.create(state.doc, right.to2)),
  );
  const tr = backspaceAfterRightMarker(state, syntax);
  assertion(!!tr, "三颗星退格没有产生事务");
  state = state.apply(tr);

  equal(renderDocument(state.doc), "***1**", "应变成字面星号加粗体");
  let strongOne = false;
  let italicOne = false;
  state.doc.firstChild?.descendants((node) => {
    if (!node.isText || !node.text?.includes("1")) return true;
    strongOne ||= node.marks.some((mark) => mark.type === strong);
    italicOne ||= node.marks.some((mark) => mark.type === emphasis);
    return true;
  });
  assertion(strongOne, "退格后 1 应保持粗体");
  assertion(!italicOne, "退格后 1 不应继续保留斜体");
  equal(
    state.selection.from,
    state.doc.firstChild!.nodeSize - 1,
    "退格后光标应在整组 `***1**` 之后",
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
