/**
 * `src/editor/math-view.ts`（LaTeX 能就地改 ＋ `$` / `$$` 半透明）的**可运行**测试集。
 *
 * # 这份测什么、不测什么（2026-10-07 拆过一刀，`docs/07` 第 89 项）
 *
 * 这一份管**公式节点自己**：真插件规格（源码在哪、存盘读哪个字段）、取源码与写回、
 * 用户报的那串 `$$␣`、真插件的两条线（装饰 ＋ `appendTransaction`）、NodeView 的
 * 面板开合与写回——一～五组。
 *
 * ⚠️ **公式之外围**的那三组（插公式块那条命令、序列化不给行首井号加反斜杠、
 * 命令补全弹窗的接线）拆去了 `tests/math-wiring.test.ts`；两份共用的地基
 * （真 `Schema` ＋ 造假视图 ＋ `建`）在 `tests/math-fixture.ts`，`找` / `数`
 * 两个小工具在 `tests/fake-dom.ts`。拆的理由是那份文件涨到 1024 行、
 * 而 ① 闸的扫描面当时又不含 `tests/`（同样的东西拆完就得能被闸看见）。
 *
 * # 跑法（不装任何包：`esbuild` 与 `node` 仓库里都现成）
 *
 * ```sh
 * cd <仓库>
 * npx esbuild tests/math-view.test.ts --bundle --platform=node --format=esm \
 *   --outfile=/tmp/nota-math-test/math-view.test.mjs
 * node /tmp/nota-math-test/math-view.test.mjs
 * ```
 *
 * 全过退出码 0；有不过的退出码 1，并把名字列出来。
 *
 * # 为什么这么写（本仓没有测试框架，也不许为这件事装包）
 *
 * `package.json` 里没有 vitest / jsdom / happy-dom。所以：
 *
 * - **不建 Editor、不开窗、不碰真 DOM**：用一颗真 `Ctx` 只做"注入 + 取值"，
 *   把**真插件自己那份节点规格**（`math_inline` / `math_block`）取出来，
 *   再用它建一颗**真的 ProseMirror `Schema`**。于是"源码在内容里还是在属性里"
 *   "存盘时 `toMarkdown` 读哪一个"这两条全是**真代码**在答（真 `toMarkdown.runner`）。
 * - NodeView 那一层喂 `tests/fake-dom.ts` 那颗假 DOM，配一颗假 `EditorView`
 *   （两样都在 `tests/math-fixture.ts` 里装配好再交出来）。
 * - ⚠️ 假 `document` 由 `math-fixture.ts` 在**模块顶层**装上（`装假document()`）：
 *   本文件不再自己调——ESM 的 import 先于本文件任何一行执行，所以那一步一定
 *   赶在下面那些 `await 测(...)` 之前。
 * - 「当前」这条信号走**真插件**（`公式当前.plugin()`，真 `appendTransaction`）。
 *
 * 几条从依赖里查出来、容易做错的约定（都已实测）：
 *
 * - `$nodeSchema(...)` 的结果是 `[schemaCtx, nodeSchema]` 加几个属性：它的 `.ctx`
 *   是那个 `$ctx` 插件（`mathInlineSchema.ctx(ctx)` = "把规格注入进去"），
 *   而 `.key` 才是 `SliceType`（`ctx.get(规格.key)` 取到的是**规格函数**，
 *   再 `(ctx)` 一次才是节点规格对象）。
 * - `$prose` / `$view` 的插件体都要 `await ctx.wait(SchemaReady)`，而 `Ctx.wait`
 *   是构造函数里挂上去的**自有属性**，所以 `math-fixture.ts` 里换成 `async () => {}`：
 *   本测试只要"注入 + 跑插件体"，不跑 milkdown 的启动时序。
 * - `DecorationSet.forChild(偏移, 父节点)` 交出来的子集合用的是**相对坐标**
 *   （`buildTree` 里 `moveSpans(..., -offset)`），`iterDeco` 正是这么往下走的。
 *
 * # ⚠️ 这套测试**证明不了**什么（别拿它当目检）
 *
 * CSS 长什么样、`$` / `$$` 到底半透明了没有、KaTeX 排出来的公式对不对、点击 /
 * 拖拽 / 焦点在真浏览器里的行为、ProseMirror 与真 DOM 的同步——**一律未验**。
 * 报告里那部分如实记着"没验"。
 */


import { EditorState, NodeSelection, TextSelection } from "@milkdown/kit/prose/state";
import type { Decoration, NodeView } from "@milkdown/kit/prose/view";
import type { Node as PMNode } from "@milkdown/kit/prose/model";
import { readFileSync } from "node:fs";

import {
  readSource,
  commonStyleCurrent,
  writeEnterSource,
  returnPositionSelection,
  computeDecorations,
  recognizeNode,
} from "../src/editor/math-view";
import { currentFocusPoint, find, number2 } from "./fake-dom";
import {
  saveToDiskValueStroke,
  block,
  blockPosition,
  blockSpec,
  create,
  paragraph,
  inline,
  inlinePosition,
  inlineSpec,
  ctx,
  schema,
} from "./math-fixture";

/* ── 一支极小的测试工装 ───────────────────────────────────────────────── */

let pass = 0;
let fail = 0;
const failed: string[] = [];

async function testCase(name: string, body3: () => void | Promise<void>): Promise<void> {
  try {
    await body3();
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

/** 让排好的微任务跑完（`排聚焦` 是 `queueMicrotask`）。 */
async function flushRefresh(): Promise<void> {
  await Promise.resolve();
  await new Promise((r) => setTimeout(r, 0));
}



/* ── 一、真规格的地基：两处"源码在哪"确实不一样 ─────────────────────── */

group("一、真插件规格（地基）");

await testCase('math_inline：atom、inline、content="text*"，而且**连 attrs 都没有**', () => {
  equal(inlineSpec.atom, true, "atom");
  equal(inlineSpec.inline, true, "inline");
  equal(inlineSpec.content, "text*", "content");
  equal(inlineSpec.attrs, undefined, "attrs（必须是没有，不是「有个空的」）");
});

await testCase("math_block：atom、isolating，源码在 attrs.value（默认空串）", () => {
  equal(blockSpec.atom, true, "atom");
  equal(blockSpec.isolating, true, "isolating");
  equal(blockSpec.attrs?.value?.default, "", "attrs.value.default");
});

await testCase("认节点：两个公式认得出，别的节点一律 null", () => {
  equal(recognizeNode(inline("x")), "inline", "行内");
  equal(recognizeNode(block("")), "block", "块");
  equal(recognizeNode(paragraph("文字")), null, "普通段落");
});

/* ── 二、取源码 / 写回：两条路 ────────────────────────────────────────── */

group("二、取源码与写回（真 Schema + 真 toMarkdown）");

await testCase("取源码：行内取**内容**，块取 **attrs.value**（而且块不看内容）", () => {
  equal(readSource(inline("x^2")), "x^2", "行内");
  equal(readSource(block("E=mc^2")), "E=mc^2", "块");
  // ⚠️ 最容易做错的一条：块的内容里塞了字，取源码也**不许**读内容。
  const dirtyBlock = schema.nodes.math_block.create({ value: "" }, schema.text("掉进内容里的字"));
  equal(readSource(dirtyBlock), "", "块只看 attrs.value");
  equal(dirtyBlock.textContent, "掉进内容里的字", "（这条是说那个状态真能存在）");
});

await testCase("写入源码（块）：改的是 attrs.value，内容一个字节不动，存盘跟着变", () => {
  const doc = schema.topNodeType.create(null, [paragraph("前面"), block("旧")]);
  const position2 = doc.child(0).nodeSize;
  const tr = EditorState.create({ doc }).tr;

  equal(writeEnterSource(tr, position2, doc.child(1), "E=mc^2"), true, "动过手");
  const changed = tr.doc.child(1);
  equal(changed.attrs.value, "E=mc^2", "attrs.value");
  equal(changed.textContent, "", "内容（必须还是空的）");
  equal(readSource(changed), "E=mc^2", "取源码读回");
  equal(saveToDiskValueStroke(changed)[0]?.name3, "math", "真 toMarkdown 交出去的节点名");
  equal(saveToDiskValueStroke(changed)[0]?.value2, "E=mc^2", "真 toMarkdown 交出去的 value");
});

await testCase("写入源码（行内）：改的是**内容**（它根本没有 value 属性可改）", () => {
  const doc = schema.topNodeType.create(null, [paragraph("前面"), paragraph("")]);
  const position2 = doc.child(0).nodeSize + 1;
  const tr = EditorState.create({ doc }).tr;
  tr.insert(position2, inline("x^2"));
  const node = tr.doc.nodeAt(position2);
  if (!node) throw new Error("行内公式没插进去");

  equal(writeEnterSource(tr, position2, node, "y_1+1"), true, "动过手");
  const changed = tr.doc.nodeAt(position2);
  if (!changed) throw new Error("改完之后节点不见了");
  equal(changed.textContent, "y_1+1", "内容");
  equal("value" in changed.attrs, false, "行内节点不许有 value 属性");
  equal(readSource(changed), "y_1+1", "取源码读回");
  equal(saveToDiskValueStroke(changed)[0]?.name3, "inlineMath", "真 toMarkdown 交出去的节点名");
  equal(saveToDiskValueStroke(changed)[0]?.value2, "y_1+1", "真 toMarkdown 交出去的 value");
});

await testCase("写入源码（行内）清空：写成空内容，不抛", () => {
  const doc = schema.topNodeType.create(null, [paragraph("a"), paragraph("")]);
  const position2 = doc.child(0).nodeSize + 1;
  const tr = EditorState.create({ doc }).tr;
  tr.insert(position2, inline("x"));
  const node = tr.doc.nodeAt(position2);
  if (!node) throw new Error("没插进去");
  equal(writeEnterSource(tr, position2, node, ""), true, "动过手");
  equal(tr.doc.nodeAt(position2)?.textContent, "", "内容被清空");
});

await testCase("写入源码：源码没变时返回 false（不白派一笔事务）", () => {
  const doc = schema.topNodeType.create(null, [block("E=mc^2")]);
  const tr = EditorState.create({ doc }).tr;
  equal(writeEnterSource(tr, 0, doc.child(0), "E=mc^2"), false, "块");

  const paragraph2 = paragraph(inline("x"));
  const tr2 = EditorState.create({ doc: schema.topNodeType.create(null, [paragraph2]) }).tr;
  equal(writeEnterSource(tr2, 1, paragraph2.child(0), "x"), false, "行内");
});

/* ── 三、用户报的那一串：复现 + 修好之后的样子 ────────────────────────── */

group("三、`$$␣` 之后那串（用户报的 bug）");

/** 造一个"敲完 `$$␣`"的状态：空 `math_block`，光标落在它的**内容**里。 */
function typedBlockCommonStyleOpenHead(): { state: EditorState; position2: number; node: PMNode } {
  const doc = schema.topNodeType.create(null, [paragraph("公式："), block("")]);
  const position2 = blockPosition;
  const state = EditorState.create({ doc, selection: TextSelection.create(doc, position2 + 1) });
  return { state, position2, node: doc.child(1) };
}

await testCase("复现：光标真的能落在 math_block 的**内容**里（`$from.parent` 就是它）", () => {
  const { state } = typedBlockCommonStyleOpenHead();
  equal(state.selection.$from.parent.type.name, "math_block", "光标的父节点");
});

await testCase("复现：那一块屏幕上什么都没有（取源码是空串 → KaTeX 画出来是空壳）", () => {
  const { node } = typedBlockCommonStyleOpenHead();
  equal(readSource(node), "", "取源码");
  equal(node.textContent, "", "内容");
});

await testCase("复现：接着敲的字进了**内容**，而 attrs.value 还是空的", () => {
  const { state, position2 } = typedBlockCommonStyleOpenHead();
  const ofAfter = state.apply(state.tr.insertText("E=mc^2", position2 + 1));
  equal(ofAfter.doc.child(1).textContent, "E=mc^2", "内容里进了字");
  equal(ofAfter.doc.child(1).attrs.value, "", "attrs.value 还是空的");
});

await testCase("复现（最狠）：这时存盘，真 toMarkdown 交出去的是**空串**（静默丢字）", () => {
  const { state, position2 } = typedBlockCommonStyleOpenHead();
  const ofAfter = state.apply(state.tr.insertText("E=mc^2", position2 + 1));
  const handoffOutput = saveToDiskValueStroke(ofAfter.doc.child(1));
  equal(handoffOutput[0]?.name3, "math", "节点名");
  equal(handoffOutput[0]?.value2, "", "⚠️ 屏幕上写着 E=mc^2，存出去的是空");
});

await testCase("归位选区：整段落在块内容里的选区 → 改成整块选中", () => {
  const { state, position2 } = typedBlockCommonStyleOpenHead();
  const tr = returnPositionSelection(state);
  assertion(tr, "应当返回一笔事务");
  const fixGood = state.apply(tr);
  assertion(fixGood.selection instanceof NodeSelection, "选区应当是整块选中");
  equal((fixGood.selection as NodeSelection).from, position2, "整块选中的起点");
  equal((fixGood.selection as NodeSelection).node.type.name, "math_block", "选中的是哪一块");
});

await testCase("归位选区：光标在正文里 / 选区跨出块 / 已经是整块选中 —— 一律不动", () => {
  const headParagraph = paragraph("正文");
  const doc = schema.topNodeType.create(null, [headParagraph, block("E"), paragraph("尾")]);
  const blockPosition2 = headParagraph.nodeSize;
  const tailStart = blockPosition2 + doc.child(1).nodeSize + 1;

  equal(
    returnPositionSelection(EditorState.create({ doc, selection: TextSelection.create(doc, 2) })),
    null,
    "光标在正文",
  );
  // 从块内容里起手、一路框到后面那段正文里：整段不落在块里，不许动它。
  equal(
    returnPositionSelection(EditorState.create({ doc, selection: TextSelection.create(doc, blockPosition2 + 1, tailStart) })),
    null,
    "选区跨出块",
  );
  equal(
    returnPositionSelection(EditorState.create({ doc, selection: NodeSelection.create(doc, blockPosition2) })),
    null,
    "已经是整块选中",
  );
});

/* ── 四、把真插件跑起来：装饰 + appendTransaction 两条线都要通 ────────── */

await commonStyleCurrent(ctx)();
const currentPlugin = commonStyleCurrent.plugin();

group("四、真插件的两条线（装饰 + appendTransaction）");

await testCase("真插件身上挂着 decorations 与 appendTransaction 两样（接线对）", () => {
  assertion(typeof currentPlugin.spec.props?.decorations === "function", "decorations 没接上");
  assertion(typeof currentPlugin.spec.appendTransaction === "function", "appendTransaction 没接上");
});

await testCase("真 appendTransaction：把光标派进块内容，回来时选区已经是整块选中", () => {
  const { state, position2 } = typedBlockCommonStyleOpenHead();
  const withPlugin = EditorState.create({
    doc: state.doc,
    selection: state.selection,
    plugins: [currentPlugin],
  });
  // ⚠️ `applyTransaction` 返回的是 `{ state, transactions }`，不是状态本身。
  const ofAfter = withPlugin.applyTransaction(
    withPlugin.tr.setSelection(TextSelection.create(withPlugin.doc, position2 + 1)),
  ).state;
  assertion(ofAfter.selection instanceof NodeSelection, "appendTransaction 没把选区归位");
  equal((ofAfter.selection as NodeSelection).from, position2, "整块选中的起点");
});

await testCase("算装饰：整块选中时**正好一条**，class 与区间都对；没选中时一条没有", () => {
  // ⚠️ 末尾留一段正文，好让"紧跟其后"的光标落在文本块里（落在文档末尾那个
  //    位置上，prosemirror-state 自己会 `console.warn` 一句，与本视图无关）。
  const doc = schema.topNodeType.create(null, [paragraph("公式："), block("E=mc^2"), paragraph("后面")]);
  const rulerInch = doc.child(1).nodeSize;

  equal(computeDecorations(EditorState.create({ doc })).find().length, 0, "没选中时的装饰数");

  const selected = EditorState.create({ doc, selection: NodeSelection.create(doc, blockPosition) });
  const decoration = computeDecorations(selected).find();
  equal(decoration.length, 1, "选中时的装饰数");
  equal(decoration[0]?.from, blockPosition, "装饰起点");
  equal(decoration[0]?.to, blockPosition + rulerInch, "装饰终点");
  equal(decoration[0]?.type.attrs.class, "nota-math-current", "装饰挂的 class");

  // 光标紧挨着它**不算**当前（不然 `$x$` 一打完面板就弹）。
  const sideEdge = EditorState.create({
    doc,
    selection: TextSelection.create(doc, blockPosition + rulerInch + 1),
  });
  equal(computeDecorations(sideEdge).find().length, 0, "光标在旁边时的装饰数");
});

await testCase("算装饰：行内那条会落进**段落的子集**里（视图就是从那一层拿到 outerDeco 的）", () => {
  const paragraph2 = paragraph("前", inline("x^2"), "后");
  const doc = schema.topNodeType.create(null, [paragraph2]);
  const insidePosition = 1 + paragraph2.child(0).nodeSize;
  const state = EditorState.create({ doc, selection: NodeSelection.create(doc, insidePosition) });
  const collection = computeDecorations(state);

  equal(collection.find().length, 1, "整份文档里找到的装饰数");
  equal(collection.find()[0]?.from, insidePosition, "文档坐标下的装饰起点");

  // `forChild(在父内容里的偏移, 父节点)` 交出来的子集合用的是**相对坐标**
  //（`buildTree` 里 `moveSpans(..., -offset)`）；`iterDeco` 正是这么往下走的。
  const paragraphCollection = collection.forChild(0, paragraph2).find();
  equal(paragraphCollection.length, 1, "段落子集里的装饰数");
  equal(paragraphCollection[0]?.from, insidePosition - 1, "段落子集里的装饰起点（相对坐标）");
  equal(paragraphCollection[0]?.to, insidePosition - 1 + paragraph2.child(1).nodeSize, "段落子集里的装饰终点");
});

/* ── 五、NodeView：面板开合、写回、按键（假 DOM，只跑逻辑）─────────────── */

// ⚠️ 这一组用的工装——真插件那份 `$view` 构造器、假 `EditorView`、`建`——2026-10-07
//    搬去了 `tests/math-fixture.ts`：本组与 `math-wiring.test.ts` 用的是**同一套**
//    地基（复制一份的话两份 Schema 迟早分家，而且不会报错）。这里只 import。

group("五、NodeView 的逻辑（⚠️ 假 DOM：证明不了视觉，只证明「写回哪、面板开不开」）");


await testCase("块：装饰说当前 → 面板开、两根 `$$`、源码框是 textarea、焦点排进框末尾", async () => {
  const { perspective, getState } = create(block("E=mc^2"), blockPosition);
  const dom = perspective.view?.dom;
  if (!dom) throw new Error("没建出 dom");
  equal(getState().doc.nodeAt(blockPosition)?.type.name, "math_block", "文档里那颗就是块公式");
  assertion(dom.classList.contains("nota-math-block"), "根上的类");
  assertion(dom.classList.contains("nota-math-editing"), "面板该开着");
  assertion(!dom.classList.contains("nota-math-readonly"), "可编辑实例不该有只读标记");

  const separator2 = dom.childNodes
    .flatMap((c) => c.childNodes)
    .filter((c) => c.classList.contains("nota-math-delim"));
  equal(separator2.length, 2, "分隔符个数");
  equal(separator2[0]?.textContent, "$$", "前分隔符");
  equal(separator2[1]?.textContent, "$$", "后分隔符");
  // ⚠️ "半透明"是 CSS（`math.css` 里走 `--fg-faint` 加淡入），假 DOM **验不了**：
  //    这里只能确认那两颗元素在场、类名与无障碍标记对得上（真透明度算未验）。
  equal(separator2[0]?.getAttribute("aria-hidden"), "true", "分隔符是纯装饰、不念给读屏器");

  const box2 = find(dom, "nota-math-source");
  assertion(box2, "有源码框");
  equal(box2?.tagName, "TEXTAREA", "块用的是 textarea");
  equal(box2?.value, "E=mc^2", "框里是当前源码");

  await flushRefresh();
  equal(currentFocusPoint(), box2, "焦点排进了源码框");
  equal(box2?.selection[0], "E=mc^2".length, "光标在末尾（接着写，不插到最前面）");
});

await testCase("块：在框里敲字 → 写进 attrs.value（不碰内容），存盘跟着变", () => {
  const { perspective, getState } = create(block("E=mc^2"), blockPosition);
  const box2 = find(perspective.view!.dom, "nota-math-source");
  if (!box2) throw new Error("没有源码框");

  box2.value = "F=ma";
  box2.dispatch("input");

  const changed = getState().doc.nodeAt(blockPosition);
  if (!changed) throw new Error("改完之后节点不见了");
  equal(changed.attrs.value, "F=ma", "attrs.value");
  equal(changed.textContent, "", "内容必须还是空的");
  equal(box2.value, "F=ma", "框里的内容没被写回去（光标没被拽走）");
  equal(saveToDiskValueStroke(changed)[0]?.value2, "F=ma", "存盘时交出去的是新源码");
});

await testCase("块：空源码里按退格 → 整块删掉（敲错 `$$␣` 的退路）", () => {
  const { perspective, getState } = create(block(""), blockPosition);
  const box2 = find(perspective.view!.dom, "nota-math-source");
  if (!box2) throw new Error("没有源码框");
  equal(getState().doc.childCount, 3, "起手是三块");

  const event = box2.dispatch("keydown", { key: "Backspace" });
  equal(event.defaultPrevented, true, "该拦下这一下退格");
  equal(getState().doc.childCount, 2, "块被删掉了");
  equal(getState().doc.child(0).type.name, "paragraph", "第一块还是前面那段");
  equal(getState().doc.child(1).type.name, "paragraph", "后面那段没跟着走");
});

await testCase("块：按 Escape → 光标搬到块后面那段正文里、面板收起、正文拿回焦点", async () => {
  const { perspective, getState } = create(block("E=mc^2"), blockPosition);
  const box2 = find(perspective.view!.dom, "nota-math-source");
  if (!box2) throw new Error("没有源码框");
  box2.focus();
  assertion(getState().selection instanceof NodeSelection, "起手是整块选中");

  box2.dispatch("keydown", { key: "Escape" });

  const select = getState().selection;
  assertion(select instanceof TextSelection, "Escape 之后应当是文本光标");
  // 落点是"后面那段正文的开头"（`TextSelection.near` 找的是最近的文本位置）。
  equal(
    select.from,
    blockPosition + getState().doc.nodeAt(blockPosition)!.nodeSize + 1,
    "光标落在块后面那段正文的开头",
  );
  equal(getState().doc.childCount, 3, "文档没被改（Escape 不动文档）");
  await flushRefresh();
  equal(currentFocusPoint(), null, "焦点回到正文（假 DOM 里就是「没有控件拿着」）");
  assertion(!perspective.view!.dom.classList.contains("nota-math-editing"), "面板该收起来");
});

await testCase("块：公式块是文档最后一块时按 Escape → 照样有条退路（别退化成「还选着它」）", () => {
  const { perspective, getState } = create(block("E=mc^2"), blockPosition, false, true, false);
  const box2 = find(perspective.view!.dom, "nota-math-source");
  if (!box2) throw new Error("没有源码框");
  equal(getState().doc.childCount, 2, "公式块就是最后一块");

  // ⚠️ 这一条**故意**会踩到 prosemirror-state 的那句
  //    `TextSelection endpoint not pointing into a node with inline content`：
  //    文档末尾本来就没有"下一个文本块"，本视图这时只能给一个文档末尾的文本光标
  //    （它比"什么都没做"强）。那是它的提醒，不是错误，这里就按住不刷屏。
  const originalWarnInform = console.warn;
  console.warn = () => {};
  try {
    box2.dispatch("keydown", { key: "Escape" });
  } finally {
    console.warn = originalWarnInform;
  }

  const select = getState().selection;
  // ⚠️ 文档末尾没有"下一个文本位置"，`TextSelection.near` 会退回"选中这一块"，
  //    那时本视图改用落在文档末尾的文本光标（浏览器放不放得下是未验的事）。
  assertion(select instanceof TextSelection, "应当是文本光标，而不是又选中了它自己");
  equal(select.from, blockPosition + getState().doc.nodeAt(blockPosition)!.nodeSize, "落在文档末尾");
});

await testCase("块：渲染区不把 KaTeX 的错冒出来（`重画` 自己兜住）", () => {
  const { perspective } = create(block("E=mc^2"), blockPosition);
  const render = find(perspective.view!.dom, "nota-math-render");
  assertion(render, "有渲染区");
  // ⚠️ 假 DOM 不够 KaTeX 用（它要 `insertBefore` / `createElementNS` 那一整套），
  //    所以这里**只断言"没抛出来"**：`重画` 必须自己兜住，异常绝不许冒进 PM。
  //    真 KaTeX 排版成什么样属于未验（见文件头）。
  // ⚠️ 这条实例是**编辑态**（`建` 的默认），所以渲染结果这一版落在悬浮预览里、
  //    `渲染` 那格按设计是空的（`重画` 清成 `""`）——别把空字符串当成"没画"。
  const preview = find(perspective.view!.dom, "nota-math-preview");
  console.log(
    `      （编辑态：渲染区 data-state=${render.dataset.state || "（空＝按设计不画）"}` +
      `、预览 data-state=${preview?.dataset.state || "（空）"}；真 KaTeX 的排版未验）`,
  );
});

await testCase("⚠️ 两态：编辑时**正文那格空着**、渲染结果去悬浮预览（2026-09-26 改的长相）", () => {
  // 用户原话是「行内直接渲染，而不是搞一个框框；输入时仍然正常文本，下方有一个
  // 悬浮框用来实时预览」。所以编辑态与非编辑态**画的地方不一样**：两边都画的话，
  // 行内公式夹在文字里会凭空长出一截——那正是被否掉的那一版。
  const editEditMiddle = create(block("E=mc^2"), blockPosition, false, true).perspective.view!.dom;
  const render = find(editEditMiddle, "nota-math-render");
  const preview = find(editEditMiddle, "nota-math-preview");
  assertion(render && preview, "两格都在树上（可编辑实例）");
  equal(render.dataset.state, "", "编辑态下正文那格是空的（正文显示的是源码）");
  assertion(preview.dataset.state !== "", "编辑态下渲染结果在悬浮预览里");

  const noneEditEdit = create(block("E=mc^2"), blockPosition, false, false).perspective.view!.dom;
  equal(find(noneEditEdit, "nota-math-preview")?.dataset.state, "", "不编辑时悬浮预览是空的");
  assertion(
    find(noneEditEdit, "nota-math-render")?.dataset.state !== "",
    "不编辑时公式画在**正文**里（行内直接渲染）",
  );
});

await testCase("块公式编辑面板有可点击的结束编辑按钮，行内公式没有", () => {
  const blockView = create(block("E=mc^2"), blockPosition, false, true);
  const blockPanel = find(blockView.perspective.view!.dom, "nota-math-panel");
  if (!blockPanel) throw new Error("块公式没有编辑面板");
  const label = find(blockPanel, "nota-math-kind");
  equal(label?.textContent, "Formula", "块公式类型标签");
  equal(label?.tagName, "BUTTON", "结束编辑必须是按钮");
  equal(label?.getAttribute("aria-label"), "Finish editing", "按钮语义");
  label?.dispatch("click");
  assertion(blockView.getState().selection instanceof TextSelection, "点击后退出公式编辑");

  const inlinePanel = find(create(inline("x^2"), inlinePosition, false, true).perspective.view!.dom, "nota-math-panel");
  if (!inlinePanel) throw new Error("行内公式没有编辑面板");
  equal(number2(inlinePanel, "nota-math-kind"), 0, "行内公式不画类型标签");
});

await testCase("公式与 HTML 源码框恢复可见的原生光标", () => {
  const math = readFileSync("src/styles/math.css", "utf8");
  const inline = readFileSync("src/styles/editor-inline.css", "utf8");
  assertion(/\.nota-math-source\s*\{[^}]*caret-color:\s*var\(--accent\)/s.test(math), "公式源码框光标仍透明");
  assertion(/\.nota-html-source\s*\{[^}]*caret-color:\s*var\(--accent\)/s.test(inline), "HTML 源码框光标仍透明");
});

await testCase("行内那一棵也有悬浮预览（两种公式一套长相）", () => {
  const dom = create(inline("x^2"), inlinePosition, false, true).perspective.view!.dom;
  assertion(find(dom, "nota-math-preview"), "行内也要有悬浮预览那一格");
  equal(find(dom, "nota-math-render")?.dataset.state, "", "编辑态：行内正文那格同样空着");
});

await testCase("空公式在编辑态：占位卡落在**悬浮预览**里，正文那格仍然是空的", () => {
  const dom = create(block(""), blockPosition, false, true).perspective.view!.dom;
  equal(number2(dom, "nota-math-note"), 1, "空源码要有一张占位卡（不然屏幕上一片空）");
  equal(number2(find(dom, "nota-math-render")!, "nota-math-note"), 0, "正文那格不许有卡");
  equal(number2(find(dom, "nota-math-preview")!, "nota-math-note"), 1, "卡在悬浮预览里");
});

await testCase("行内：面板开、源码框是 input、整体是行内元素、敲字写进**内容**", () => {
  const { perspective, getState } = create(inline("x^2"), inlinePosition);
  const dom = perspective.view!.dom;
  assertion(dom.classList.contains("nota-math-inline"), "根上的类");
  assertion(dom.classList.contains("nota-math-editing"), "面板该开着");
  equal(dom.tagName, "SPAN", "行内整体必须是行内元素（div 会把段落劈开）");

  const box2 = find(dom, "nota-math-source");
  equal(box2?.tagName, "INPUT", "行内用的是 input");
  equal(box2?.value, "x^2", "框里是当前源码");
  const separator2 = box2?.parentNode?.childNodes.filter((c) => c.classList.contains("nota-math-delim"));
  equal(separator2?.length, 2, "行内也是两颗分隔符");
  equal(separator2?.[0]?.textContent, "$", "行内分隔符是单个 `$`");

  box2!.value = "y_1+1";
  box2!.dispatch("input");
  const changed = getState().doc.nodeAt(inlinePosition);
  if (!changed) throw new Error("改完之后节点不见了");
  equal(changed.textContent, "y_1+1", "内容");
  equal("value" in changed.attrs, false, "行内节点不许有 value 属性");
  equal(saveToDiskValueStroke(changed)[0]?.value2, "y_1+1", "存盘时交出去的是新源码");
});

await testCase("行内：Enter 当「确认」，别的键不拦", () => {
  const { perspective, getState } = create(inline("x"), inlinePosition);
  const box2 = find(perspective.view!.dom, "nota-math-source");
  if (!box2) throw new Error("没有源码框");
  equal(box2.dispatch("keydown", { key: "a" }).defaultPrevented, false, "普通键不许拦");
  equal(box2.dispatch("keydown", { key: "Enter" }).defaultPrevented, true, "Enter 要拦");
  equal(getState().doc.nodeAt(inlinePosition)?.textContent, "x", "文档没变");
});

await testCase("只读实例：**不给面板**（连挂件都不挂），也不抢焦点", async () => {
  const { perspective, getState } = create(block("E=mc^2"), blockPosition, true);
  const dom = perspective.view!.dom;
  assertion(dom.classList.contains("nota-math-readonly"), "根上该有只读标记");
  equal(number2(dom, "nota-math-panel"), 0, "只读实例不许把面板挂上树");
  equal(number2(dom, "nota-math-source"), 0, "只读实例不许把源码框挂上树");
  equal(number2(dom, "nota-math-preview"), 0, "只读实例也不许把悬浮预览挂上树");
  equal(dom.classList.contains("nota-math-editing"), false, "只读实例不许进编辑态");
  equal(number2(dom, "nota-math-upstream"), 1, "只读实例该画上游那棵树");
  await flushRefresh();
  equal(currentFocusPoint(), null, "只读实例不许抢焦点");
  equal(getState().doc.child(1).attrs.value, "E=mc^2", "只读实例不改文档");
});

await testCase("没被选中（装饰没来）时：进不了编辑态，也不抢焦点", () => {
  const { perspective } = create(block("E=mc^2"), blockPosition, false, false);
  const dom = perspective.view!.dom;
  equal(dom.classList.contains("nota-math-editing"), false, "面板不该开");
  equal(number2(dom, "nota-math-panel"), 1, "面板元素在（可编辑实例），只是 CSS 收着");
  equal(currentFocusPoint(), null, "没当前就不许抢焦点");
});


/* ── 收尾 ─────────────────────────────────────────────────────────────── */

console.log(`\n${"─".repeat(64)}`);
console.log(`通过 ${pass} 条，失败 ${fail} 条`);
if (fail) {
  console.log(`失败的：\n  - ${failed.join("\n  - ")}`);
  process.exitCode = 1;
}
