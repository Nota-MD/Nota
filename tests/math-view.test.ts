/**
 * `src/editor/math-view.ts`（LaTeX 能就地改 ＋ `$` / `$$` 半透明）的**可运行**测试集。
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
 * - NodeView 那一层喂 `tests/fake-dom.ts` 那颗假 DOM，配一颗假 `EditorView`。
 * - 「当前」这条信号走**真插件**（`公式当前.plugin()`，真 `appendTransaction`）。
 *
 * 几条从依赖里查出来、容易做错的约定（都已实测）：
 *
 * - `$nodeSchema(...)` 的结果是 `[schemaCtx, nodeSchema]` 加几个属性：它的 `.ctx`
 *   是那个 `$ctx` 插件（`mathInlineSchema.ctx(ctx)` = "把规格注入进去"），
 *   而 `.key` 才是 `SliceType`（`ctx.get(规格.key)` 取到的是**规格函数**，
 *   再 `(ctx)` 一次才是节点规格对象）。
 * - `$prose` / `$view` 的插件体都要 `await ctx.wait(SchemaReady)`，而 `Ctx.wait`
 *   是构造函数里挂上去的**自有属性**，所以这里换成 `async () => {}`：
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

import { Container, Ctx } from "@milkdown/kit/ctx";
import { editorViewCtx, nodeViewCtx, prosePluginsCtx, schemaCtx } from "@milkdown/kit/core";
import { Schema } from "@milkdown/kit/prose/model";
import type { Node as PMNode } from "@milkdown/kit/prose/model";
import { EditorState, NodeSelection, TextSelection } from "@milkdown/kit/prose/state";
import type { Plugin, Transaction } from "@milkdown/kit/prose/state";
import type { Decoration, DecorationSet, NodeView } from "@milkdown/kit/prose/view";
import { katexOptionsCtx, mathBlockSchema, mathInlineSchema } from "@milkdown/plugin-math";
import {
  取源码,
  公式块视图,
  公式当前,
  公式行内视图,
  写入源码,
  归位选区,
  算装饰,
  认节点,
} from "../src/editor/math-view";
import { 假元素, 当前焦点, 清焦点, 装假document } from "./fake-dom";
import { 插公式块 } from "../src/editor/insert";
import { 不转义行首井号 } from "../src/editor/lax-heading";

装假document();

/* ── 一支极小的测试工装 ───────────────────────────────────────────────── */

let 过 = 0;
let 败 = 0;
const 败的: string[] = [];

async function 测(名称: string, 体: () => void | Promise<void>): Promise<void> {
  try {
    await 体();
    过++;
    console.log(`  ✔ ${名称}`);
  } catch (e) {
    败++;
    败的.push(名称);
    console.log(`  ✘ ${名称}`);
    console.log(`      ${e instanceof Error ? e.message : String(e)}`);
  }
}

function 组(名: string): void {
  console.log(`\n【${名}】`);
}

function 断言(条件: unknown, 说明: string): void {
  if (!条件) throw new Error(说明);
}

function 等(实际: unknown, 期望: unknown, 说明: string): void {
  if (实际 !== 期望) {
    throw new Error(`${说明}：期望 ${JSON.stringify(期望)}，实际 ${JSON.stringify(实际)}`);
  }
}

/** 让排好的微任务跑完（`排聚焦` 是 `queueMicrotask`）。 */
async function 冲刷(): Promise<void> {
  await Promise.resolve();
  await new Promise((r) => setTimeout(r, 0));
}

/** 在假 DOM 树上按类名找一颗元素（假 DOM 没有 CSS 选择器）。 */
function 找(根: 假元素, 类名: string): 假元素 | null {
  if (根.classList.contains(类名)) return 根;
  for (const 孩 of 根.childNodes) {
    const 命中 = 找(孩, 类名);
    if (命中) return 命中;
  }
  return null;
}

/** 数一数假 DOM 树上某个类名有几颗。 */
function 数(根: 假元素, 类名: string): number {
  let n = 根.classList.contains(类名) ? 1 : 0;
  for (const 孩 of 根.childNodes) n += 数(孩, 类名);
  return n;
}

/* ── 真规格 → 真 Schema（不建 Editor、不碰 DOM）──────────────────────── */

const ctx = new Ctx(new Container(), {} as never);
// ⚠️ 见文件头：本测试只要"注入 + 跑插件体"，不要 milkdown 的启动时序。
(ctx as unknown as { wait: () => Promise<void> }).wait = async () => {};
// 这几片得先注入（`$prose` / `$view` 的插件体会 `ctx.update(...)` 它们）。
ctx.inject(prosePluginsCtx);
ctx.inject(nodeViewCtx);
katexOptionsCtx(ctx);
mathInlineSchema.ctx(ctx);
mathBlockSchema.ctx(ctx);

/** 真插件自己那份 `math_inline` 规格。 */
const 行内规格 = ctx.get(mathInlineSchema.key)(ctx);
/** 真插件自己那份 `math_block` 规格。 */
const 块规格 = ctx.get(mathBlockSchema.key)(ctx);

const schema = new Schema({
  nodes: {
    doc: { content: "block+" },
    paragraph: { content: "inline*", group: "block", toDOM: () => ["p", 0] },
    text: { group: "inline" },
    // 一个"能把段落装进去"的容器，只给下面「插公式块」那组当反例用
    //（"光标在**嵌套**的空段落里时不许把外层整块换掉"）。别的组用不到它。
    blockquote: { content: "block+", group: "block", toDOM: () => ["blockquote", 0] },
    math_inline: 行内规格,
    math_block: 块规格,
  },
});
// ⚠️ `schemaCtx` 是**裸的 SliceType**（不是 `$ctx` 的产物），所以没有 `.key`：
//    传它本身。
ctx.inject(schemaCtx);
ctx.set(schemaCtx, schema);

/** 段落（给字符串就当文本，给节点就原样放；空串丢掉，`schema.text("")` 会抛）。 */
const 段落 = (...内容: (PMNode | string)[]): PMNode =>
  schema.nodes.paragraph.create(
    null,
    内容
      .filter((x) => x !== "")
      .map((x) => (typeof x === "string" ? schema.text(x) : x)),
  );
/** 块公式。 */
const 块 = (值: string): PMNode => schema.nodes.math_block.create({ value: 值 });
/** 行内公式（空串要走 `null`：`schema.text("")` 会抛）。 */
const 行内 = (源: string): PMNode =>
  schema.nodes.math_inline.create(null, 源 === "" ? null : schema.text(源));

/** 第一个位置：前面那段"公式："之后的第一个位置（测试都用它当块的落点）。 */
const 块位置 = 段落("公式：").nodeSize;
/** 行内那颗落在第二个段落的内容起点上。 */
const 行内位置 = 块位置 + 1;

/**
 * 假序列化状态：只记下 `toMarkdown.runner` 交给 remark 的 `addNode` 三样。
 * ⚠️ 跑的是**插件自己那份真 runner**，所以"存盘读哪个字段"是它在答。
 */
function 存盘一笔(节点: PMNode): { 名: string; 值: string | undefined }[] {
  const 调用: { 名: string; 值: string | undefined }[] = [];
  const state = {
    addNode(名: string, _子: unknown, 值?: string) {
      调用.push({ 名, 值 });
      return state;
    },
  };
  const 规格 = 节点.type.name === "math_block" ? 块规格 : 行内规格;
  const runner = 规格.toMarkdown?.runner as
    | ((s: unknown, n: PMNode, 父: unknown, 序: number) => void)
    | undefined;
  if (!runner) throw new Error("插件没给 toMarkdown.runner？");
  runner(state, 节点, null, 0);
  return 调用;
}

/* ── 一、真规格的地基：两处"源码在哪"确实不一样 ─────────────────────── */

组("一、真插件规格（地基）");

await 测('math_inline：atom、inline、content="text*"，而且**连 attrs 都没有**', () => {
  等(行内规格.atom, true, "atom");
  等(行内规格.inline, true, "inline");
  等(行内规格.content, "text*", "content");
  等(行内规格.attrs, undefined, "attrs（必须是没有，不是「有个空的」）");
});

await 测("math_block：atom、isolating，源码在 attrs.value（默认空串）", () => {
  等(块规格.atom, true, "atom");
  等(块规格.isolating, true, "isolating");
  等(块规格.attrs?.value?.default, "", "attrs.value.default");
});

await 测("认节点：两个公式认得出，别的节点一律 null", () => {
  等(认节点(行内("x")), "inline", "行内");
  等(认节点(块("")), "block", "块");
  等(认节点(段落("文字")), null, "普通段落");
});

/* ── 二、取源码 / 写回：两条路 ────────────────────────────────────────── */

组("二、取源码与写回（真 Schema + 真 toMarkdown）");

await 测("取源码：行内取**内容**，块取 **attrs.value**（而且块不看内容）", () => {
  等(取源码(行内("x^2")), "x^2", "行内");
  等(取源码(块("E=mc^2")), "E=mc^2", "块");
  // ⚠️ 最容易做错的一条：块的内容里塞了字，取源码也**不许**读内容。
  const 脏块 = schema.nodes.math_block.create({ value: "" }, schema.text("掉进内容里的字"));
  等(取源码(脏块), "", "块只看 attrs.value");
  等(脏块.textContent, "掉进内容里的字", "（这条是说那个状态真能存在）");
});

await 测("写入源码（块）：改的是 attrs.value，内容一个字节不动，存盘跟着变", () => {
  const doc = schema.topNodeType.create(null, [段落("前面"), 块("旧")]);
  const 位置 = doc.child(0).nodeSize;
  const tr = EditorState.create({ doc }).tr;

  等(写入源码(tr, 位置, doc.child(1), "E=mc^2"), true, "动过手");
  const 改后 = tr.doc.child(1);
  等(改后.attrs.value, "E=mc^2", "attrs.value");
  等(改后.textContent, "", "内容（必须还是空的）");
  等(取源码(改后), "E=mc^2", "取源码读回");
  等(存盘一笔(改后)[0]?.名, "math", "真 toMarkdown 交出去的节点名");
  等(存盘一笔(改后)[0]?.值, "E=mc^2", "真 toMarkdown 交出去的 value");
});

await 测("写入源码（行内）：改的是**内容**（它根本没有 value 属性可改）", () => {
  const doc = schema.topNodeType.create(null, [段落("前面"), 段落("")]);
  const 位置 = doc.child(0).nodeSize + 1;
  const tr = EditorState.create({ doc }).tr;
  tr.insert(位置, 行内("x^2"));
  const 节点 = tr.doc.nodeAt(位置);
  if (!节点) throw new Error("行内公式没插进去");

  等(写入源码(tr, 位置, 节点, "y_1+1"), true, "动过手");
  const 改后 = tr.doc.nodeAt(位置);
  if (!改后) throw new Error("改完之后节点不见了");
  等(改后.textContent, "y_1+1", "内容");
  等("value" in 改后.attrs, false, "行内节点不许有 value 属性");
  等(取源码(改后), "y_1+1", "取源码读回");
  等(存盘一笔(改后)[0]?.名, "inlineMath", "真 toMarkdown 交出去的节点名");
  等(存盘一笔(改后)[0]?.值, "y_1+1", "真 toMarkdown 交出去的 value");
});

await 测("写入源码（行内）清空：写成空内容，不抛", () => {
  const doc = schema.topNodeType.create(null, [段落("a"), 段落("")]);
  const 位置 = doc.child(0).nodeSize + 1;
  const tr = EditorState.create({ doc }).tr;
  tr.insert(位置, 行内("x"));
  const 节点 = tr.doc.nodeAt(位置);
  if (!节点) throw new Error("没插进去");
  等(写入源码(tr, 位置, 节点, ""), true, "动过手");
  等(tr.doc.nodeAt(位置)?.textContent, "", "内容被清空");
});

await 测("写入源码：源码没变时返回 false（不白派一笔事务）", () => {
  const doc = schema.topNodeType.create(null, [块("E=mc^2")]);
  const tr = EditorState.create({ doc }).tr;
  等(写入源码(tr, 0, doc.child(0), "E=mc^2"), false, "块");

  const 段 = 段落(行内("x"));
  const tr2 = EditorState.create({ doc: schema.topNodeType.create(null, [段]) }).tr;
  等(写入源码(tr2, 1, 段.child(0), "x"), false, "行内");
});

/* ── 三、用户报的那一串：复现 + 修好之后的样子 ────────────────────────── */

组("三、`$$␣` 之后那串（用户报的 bug）");

/** 造一个"敲完 `$$␣`"的状态：空 `math_block`，光标落在它的**内容**里。 */
function 敲完块公式开头(): { state: EditorState; 位置: number; 节点: PMNode } {
  const doc = schema.topNodeType.create(null, [段落("公式："), 块("")]);
  const 位置 = 块位置;
  const state = EditorState.create({ doc, selection: TextSelection.create(doc, 位置 + 1) });
  return { state, 位置, 节点: doc.child(1) };
}

await 测("复现：光标真的能落在 math_block 的**内容**里（`$from.parent` 就是它）", () => {
  const { state } = 敲完块公式开头();
  等(state.selection.$from.parent.type.name, "math_block", "光标的父节点");
});

await 测("复现：那一块屏幕上什么都没有（取源码是空串 → KaTeX 画出来是空壳）", () => {
  const { 节点 } = 敲完块公式开头();
  等(取源码(节点), "", "取源码");
  等(节点.textContent, "", "内容");
});

await 测("复现：接着敲的字进了**内容**，而 attrs.value 还是空的", () => {
  const { state, 位置 } = 敲完块公式开头();
  const 之后 = state.apply(state.tr.insertText("E=mc^2", 位置 + 1));
  等(之后.doc.child(1).textContent, "E=mc^2", "内容里进了字");
  等(之后.doc.child(1).attrs.value, "", "attrs.value 还是空的");
});

await 测("复现（最狠）：这时存盘，真 toMarkdown 交出去的是**空串**（静默丢字）", () => {
  const { state, 位置 } = 敲完块公式开头();
  const 之后 = state.apply(state.tr.insertText("E=mc^2", 位置 + 1));
  const 交出 = 存盘一笔(之后.doc.child(1));
  等(交出[0]?.名, "math", "节点名");
  等(交出[0]?.值, "", "⚠️ 屏幕上写着 E=mc^2，存出去的是空");
});

await 测("归位选区：整段落在块内容里的选区 → 改成整块选中", () => {
  const { state, 位置 } = 敲完块公式开头();
  const tr = 归位选区(state);
  断言(tr, "应当返回一笔事务");
  const 修好 = state.apply(tr);
  断言(修好.selection instanceof NodeSelection, "选区应当是整块选中");
  等((修好.selection as NodeSelection).from, 位置, "整块选中的起点");
  等((修好.selection as NodeSelection).node.type.name, "math_block", "选中的是哪一块");
});

await 测("归位选区：光标在正文里 / 选区跨出块 / 已经是整块选中 —— 一律不动", () => {
  const 头段 = 段落("正文");
  const doc = schema.topNodeType.create(null, [头段, 块("E"), 段落("尾")]);
  const 块位 = 头段.nodeSize;
  const 尾起 = 块位 + doc.child(1).nodeSize + 1;

  等(
    归位选区(EditorState.create({ doc, selection: TextSelection.create(doc, 2) })),
    null,
    "光标在正文",
  );
  // 从块内容里起手、一路框到后面那段正文里：整段不落在块里，不许动它。
  等(
    归位选区(EditorState.create({ doc, selection: TextSelection.create(doc, 块位 + 1, 尾起) })),
    null,
    "选区跨出块",
  );
  等(
    归位选区(EditorState.create({ doc, selection: NodeSelection.create(doc, 块位) })),
    null,
    "已经是整块选中",
  );
});

/* ── 四、把真插件跑起来：装饰 + appendTransaction 两条线都要通 ────────── */

await 公式当前(ctx)();
const 当前插件 = 公式当前.plugin();

组("四、真插件的两条线（装饰 + appendTransaction）");

await 测("真插件身上挂着 decorations 与 appendTransaction 两样（接线对）", () => {
  断言(typeof 当前插件.spec.props?.decorations === "function", "decorations 没接上");
  断言(typeof 当前插件.spec.appendTransaction === "function", "appendTransaction 没接上");
});

await 测("真 appendTransaction：把光标派进块内容，回来时选区已经是整块选中", () => {
  const { state, 位置 } = 敲完块公式开头();
  const 带插件 = EditorState.create({
    doc: state.doc,
    selection: state.selection,
    plugins: [当前插件],
  });
  // ⚠️ `applyTransaction` 返回的是 `{ state, transactions }`，不是状态本身。
  const 之后 = 带插件.applyTransaction(
    带插件.tr.setSelection(TextSelection.create(带插件.doc, 位置 + 1)),
  ).state;
  断言(之后.selection instanceof NodeSelection, "appendTransaction 没把选区归位");
  等((之后.selection as NodeSelection).from, 位置, "整块选中的起点");
});

await 测("算装饰：整块选中时**正好一条**，class 与区间都对；没选中时一条没有", () => {
  // ⚠️ 末尾留一段正文，好让"紧跟其后"的光标落在文本块里（落在文档末尾那个
  //    位置上，prosemirror-state 自己会 `console.warn` 一句，与本视图无关）。
  const doc = schema.topNodeType.create(null, [段落("公式："), 块("E=mc^2"), 段落("后面")]);
  const 尺寸 = doc.child(1).nodeSize;

  等(算装饰(EditorState.create({ doc })).find().length, 0, "没选中时的装饰数");

  const 选中 = EditorState.create({ doc, selection: NodeSelection.create(doc, 块位置) });
  const 装饰 = 算装饰(选中).find();
  等(装饰.length, 1, "选中时的装饰数");
  等(装饰[0]?.from, 块位置, "装饰起点");
  等(装饰[0]?.to, 块位置 + 尺寸, "装饰终点");
  等(装饰[0]?.type.attrs.class, "nota-math-current", "装饰挂的 class");

  // 光标紧挨着它**不算**当前（不然 `$x$` 一打完面板就弹）。
  const 旁边 = EditorState.create({
    doc,
    selection: TextSelection.create(doc, 块位置 + 尺寸 + 1),
  });
  等(算装饰(旁边).find().length, 0, "光标在旁边时的装饰数");
});

await 测("算装饰：行内那条会落进**段落的子集**里（视图就是从那一层拿到 outerDeco 的）", () => {
  const 段 = 段落("前", 行内("x^2"), "后");
  const doc = schema.topNodeType.create(null, [段]);
  const 里位置 = 1 + 段.child(0).nodeSize;
  const state = EditorState.create({ doc, selection: NodeSelection.create(doc, 里位置) });
  const 集 = 算装饰(state);

  等(集.find().length, 1, "整份文档里找到的装饰数");
  等(集.find()[0]?.from, 里位置, "文档坐标下的装饰起点");

  // `forChild(在父内容里的偏移, 父节点)` 交出来的子集合用的是**相对坐标**
  //（`buildTree` 里 `moveSpans(..., -offset)`）；`iterDeco` 正是这么往下走的。
  const 段集 = 集.forChild(0, 段).find();
  等(段集.length, 1, "段落子集里的装饰数");
  等(段集[0]?.from, 里位置 - 1, "段落子集里的装饰起点（相对坐标）");
  等(段集[0]?.to, 里位置 - 1 + 段.child(1).nodeSize, "段落子集里的装饰终点");
});

/* ── 五、NodeView：面板开合、写回、按键（假 DOM，只跑逻辑）─────────────── */

await 公式行内视图(ctx)();
await 公式块视图(ctx)();
const 造行内视图 = 公式行内视图.view;
const 造块视图 = 公式块视图.view;

组("五、NodeView 的逻辑（⚠️ 假 DOM：证明不了视觉，只证明「写回哪、面板开不开」）");

/**
 * 一颗假 `EditorView`：`state` 是真的，`dispatch` 真的把事务应用回去，
 * 然后照 ProseMirror 的做法（`CustomNodeViewDesc.update`）把新节点与新装饰
 * 交给 NodeView。
 */
function 造假视图(doc: PMNode, 位置: number, 只读: boolean, 选中: boolean, 类: PMNode["type"]) {
  let state = EditorState.create({
    doc,
    selection: 选中 ? NodeSelection.create(doc, 位置) : TextSelection.create(doc, 位置),
  });
  const 视角: { 视图: NodeView | null } = { 视图: null };
  const 视图 = {
    editable: !只读,
    // ⚠️ 与真 PM 一致：`hasFocus()` = "焦点就在 `view.dom` 上"。这里用假 DOM 的
    //    全局焦点代表它——源码框拿着焦点时，正文就不算拿着。
    hasFocus: () => 当前焦点() === null,
    focus: () => 当前焦点()?.blur(),
    get state() {
      return state;
    },
    dispatch: (tr: Transaction): void => {
      state = state.apply(tr);
      const 新节点 = state.doc.nodeAt(位置);
      // ⚠️ 节点被删掉、或者位置上换成了**别的类型**时，真 ProseMirror 是把
      //    这个视图 `destroy` 掉另建一个（`updateNextNode` 认的是同一个类型），
      //    所以这里绝不能拿新节点去喂 `update`。
      if (!新节点 || 新节点.type !== 类) return;
      const 装饰 = 算装饰(state).find(位置, 位置 + 新节点.nodeSize) as readonly Decoration[];
      视角.视图?.update?.(新节点, 装饰);
    },
  };
  return { 视图, 视角, 取state: () => state };
}

/** 建一个 NodeView（真构造器，只是喂进去的 view 与 document 是假的）。 */
function 建(节点: PMNode, 位置: number, 只读 = false, 选中 = true, 尾段 = true) {
  清焦点();
  // ⚠️ 默认在块后面留一段正文：`退出编辑` 把光标搬到"块后面"时，落在文本块里
  //    才是常规情形（`尾段 = false` 用来试"公式块是文档最后一块"那条路）。
  //    行内那颗在段落里，后面有没有别的段落都一样。
  const doc = schema.topNodeType.create(
    null,
    节点.type.name === "math_block"
      ? 尾段
        ? [段落("公式："), 节点, 段落("后面")]
        : [段落("公式："), 节点]
      : [段落("公式："), 段落(节点), 段落("后面")],
  );
  const 真节点 = doc.nodeAt(位置);
  if (!真节点) throw new Error(`位置 ${位置} 上没有节点`);
  const { 视图, 视角, 取state } = 造假视图(doc, 位置, 只读, 选中, 真节点.type);
  const 装饰 = 算装饰(取state()).find(位置, 位置 + 真节点.nodeSize) as readonly Decoration[];
  const 构造 = 真节点.type.name === "math_block" ? 造块视图 : 造行内视图;
  视角.视图 = 构造(真节点, 视图 as never, () => 位置, 装饰, null as never);
  return { 视图, 视角, 取state, 位置 };
}

await 测("块：装饰说当前 → 面板开、两根 `$$`、源码框是 textarea、焦点排进框末尾", async () => {
  const { 视角, 取state } = 建(块("E=mc^2"), 块位置);
  const dom = 视角.视图?.dom;
  if (!dom) throw new Error("没建出 dom");
  等(取state().doc.nodeAt(块位置)?.type.name, "math_block", "文档里那颗就是块公式");
  断言(dom.classList.contains("nota-math-block"), "根上的类");
  断言(dom.classList.contains("nota-math-editing"), "面板该开着");
  断言(!dom.classList.contains("nota-math-readonly"), "可编辑实例不该有只读标记");

  const 分隔 = dom.childNodes
    .flatMap((c) => c.childNodes)
    .filter((c) => c.classList.contains("nota-math-delim"));
  等(分隔.length, 2, "分隔符个数");
  等(分隔[0]?.textContent, "$$", "前分隔符");
  等(分隔[1]?.textContent, "$$", "后分隔符");
  // ⚠️ "半透明"是 CSS（`math.css` 里走 `--fg-faint` 加淡入），假 DOM **验不了**：
  //    这里只能确认那两颗元素在场、类名与无障碍标记对得上（真透明度算未验）。
  等(分隔[0]?.getAttribute("aria-hidden"), "true", "分隔符是纯装饰、不念给读屏器");

  const 框 = 找(dom, "nota-math-source");
  断言(框, "有源码框");
  等(框?.tagName, "TEXTAREA", "块用的是 textarea");
  等(框?.value, "E=mc^2", "框里是当前源码");

  await 冲刷();
  等(当前焦点(), 框, "焦点排进了源码框");
  等(框?.选区[0], "E=mc^2".length, "光标在末尾（接着写，不插到最前面）");
});

await 测("块：在框里敲字 → 写进 attrs.value（不碰内容），存盘跟着变", () => {
  const { 视角, 取state } = 建(块("E=mc^2"), 块位置);
  const 框 = 找(视角.视图!.dom, "nota-math-source");
  if (!框) throw new Error("没有源码框");

  框.value = "F=ma";
  框.派发("input");

  const 改后 = 取state().doc.nodeAt(块位置);
  if (!改后) throw new Error("改完之后节点不见了");
  等(改后.attrs.value, "F=ma", "attrs.value");
  等(改后.textContent, "", "内容必须还是空的");
  等(框.value, "F=ma", "框里的内容没被写回去（光标没被拽走）");
  等(存盘一笔(改后)[0]?.值, "F=ma", "存盘时交出去的是新源码");
});

await 测("块：空源码里按退格 → 整块删掉（敲错 `$$␣` 的退路）", () => {
  const { 视角, 取state } = 建(块(""), 块位置);
  const 框 = 找(视角.视图!.dom, "nota-math-source");
  if (!框) throw new Error("没有源码框");
  等(取state().doc.childCount, 3, "起手是三块");

  const 事件 = 框.派发("keydown", { key: "Backspace" });
  等(事件.defaultPrevented, true, "该拦下这一下退格");
  等(取state().doc.childCount, 2, "块被删掉了");
  等(取state().doc.child(0).type.name, "paragraph", "第一块还是前面那段");
  等(取state().doc.child(1).type.name, "paragraph", "后面那段没跟着走");
});

await 测("块：按 Escape → 光标搬到块后面那段正文里、面板收起、正文拿回焦点", async () => {
  const { 视角, 取state } = 建(块("E=mc^2"), 块位置);
  const 框 = 找(视角.视图!.dom, "nota-math-source");
  if (!框) throw new Error("没有源码框");
  框.focus();
  断言(取state().selection instanceof NodeSelection, "起手是整块选中");

  框.派发("keydown", { key: "Escape" });

  const 选 = 取state().selection;
  断言(选 instanceof TextSelection, "Escape 之后应当是文本光标");
  // 落点是"后面那段正文的开头"（`TextSelection.near` 找的是最近的文本位置）。
  等(
    选.from,
    块位置 + 取state().doc.nodeAt(块位置)!.nodeSize + 1,
    "光标落在块后面那段正文的开头",
  );
  等(取state().doc.childCount, 3, "文档没被改（Escape 不动文档）");
  await 冲刷();
  等(当前焦点(), null, "焦点回到正文（假 DOM 里就是「没有控件拿着」）");
  断言(!视角.视图!.dom.classList.contains("nota-math-editing"), "面板该收起来");
});

await 测("块：公式块是文档最后一块时按 Escape → 照样有条退路（别退化成「还选着它」）", () => {
  const { 视角, 取state } = 建(块("E=mc^2"), 块位置, false, true, false);
  const 框 = 找(视角.视图!.dom, "nota-math-source");
  if (!框) throw new Error("没有源码框");
  等(取state().doc.childCount, 2, "公式块就是最后一块");

  // ⚠️ 这一条**故意**会踩到 prosemirror-state 的那句
  //    `TextSelection endpoint not pointing into a node with inline content`：
  //    文档末尾本来就没有"下一个文本块"，本视图这时只能给一个文档末尾的文本光标
  //    （它比"什么都没做"强）。那是它的提醒，不是错误，这里就按住不刷屏。
  const 原警告 = console.warn;
  console.warn = () => {};
  try {
    框.派发("keydown", { key: "Escape" });
  } finally {
    console.warn = 原警告;
  }

  const 选 = 取state().selection;
  // ⚠️ 文档末尾没有"下一个文本位置"，`TextSelection.near` 会退回"选中这一块"，
  //    那时本视图改用落在文档末尾的文本光标（浏览器放不放得下是未验的事）。
  断言(选 instanceof TextSelection, "应当是文本光标，而不是又选中了它自己");
  等(选.from, 块位置 + 取state().doc.nodeAt(块位置)!.nodeSize, "落在文档末尾");
});

await 测("块：渲染区不把 KaTeX 的错冒出来（`重画` 自己兜住）", () => {
  const { 视角 } = 建(块("E=mc^2"), 块位置);
  const 渲染 = 找(视角.视图!.dom, "nota-math-render");
  断言(渲染, "有渲染区");
  // ⚠️ 假 DOM 不够 KaTeX 用（它要 `insertBefore` / `createElementNS` 那一整套），
  //    所以这里**只断言"没抛出来"**：`重画` 必须自己兜住，异常绝不许冒进 PM。
  //    真 KaTeX 排版成什么样属于未验（见文件头）。
  // ⚠️ 这条实例是**编辑态**（`建` 的默认），所以渲染结果这一版落在悬浮预览里、
  //    `渲染` 那格按设计是空的（`重画` 清成 `""`）——别把空字符串当成"没画"。
  const 预览 = 找(视角.视图!.dom, "nota-math-preview");
  console.log(
    `      （编辑态：渲染区 data-state=${渲染.dataset.state || "（空＝按设计不画）"}` +
      `、预览 data-state=${预览?.dataset.state || "（空）"}；真 KaTeX 的排版未验）`,
  );
});

await 测("⚠️ 两态：编辑时**正文那格空着**、渲染结果去悬浮预览（2026-09-26 改的长相）", () => {
  // 用户原话是「行内直接渲染，而不是搞一个框框；输入时仍然正常文本，下方有一个
  // 悬浮框用来实时预览」。所以编辑态与非编辑态**画的地方不一样**：两边都画的话，
  // 行内公式夹在文字里会凭空长出一截——那正是被否掉的那一版。
  const 编辑中 = 建(块("E=mc^2"), 块位置, false, true).视角.视图!.dom;
  const 渲染 = 找(编辑中, "nota-math-render");
  const 预览 = 找(编辑中, "nota-math-preview");
  断言(渲染 && 预览, "两格都在树上（可编辑实例）");
  等(渲染.dataset.state, "", "编辑态下正文那格是空的（正文显示的是源码）");
  断言(预览.dataset.state !== "", "编辑态下渲染结果在悬浮预览里");

  const 没编辑 = 建(块("E=mc^2"), 块位置, false, false).视角.视图!.dom;
  等(找(没编辑, "nota-math-preview")?.dataset.state, "", "不编辑时悬浮预览是空的");
  断言(
    找(没编辑, "nota-math-render")?.dataset.state !== "",
    "不编辑时公式画在**正文**里（行内直接渲染）",
  );
});

await 测("行内那一棵也有悬浮预览（两种公式一套长相）", () => {
  const dom = 建(行内("x^2"), 行内位置, false, true).视角.视图!.dom;
  断言(找(dom, "nota-math-preview"), "行内也要有悬浮预览那一格");
  等(找(dom, "nota-math-render")?.dataset.state, "", "编辑态：行内正文那格同样空着");
});

await 测("空公式在编辑态：占位卡落在**悬浮预览**里，正文那格仍然是空的", () => {
  const dom = 建(块(""), 块位置, false, true).视角.视图!.dom;
  等(数(dom, "nota-math-note"), 1, "空源码要有一张占位卡（不然屏幕上一片空）");
  等(数(找(dom, "nota-math-render")!, "nota-math-note"), 0, "正文那格不许有卡");
  等(数(找(dom, "nota-math-preview")!, "nota-math-note"), 1, "卡在悬浮预览里");
});

await 测("行内：面板开、源码框是 input、整体是行内元素、敲字写进**内容**", () => {
  const { 视角, 取state } = 建(行内("x^2"), 行内位置);
  const dom = 视角.视图!.dom;
  断言(dom.classList.contains("nota-math-inline"), "根上的类");
  断言(dom.classList.contains("nota-math-editing"), "面板该开着");
  等(dom.tagName, "SPAN", "行内整体必须是行内元素（div 会把段落劈开）");

  const 框 = 找(dom, "nota-math-source");
  等(框?.tagName, "INPUT", "行内用的是 input");
  等(框?.value, "x^2", "框里是当前源码");
  const 分隔 = 框?.parentNode?.childNodes.filter((c) => c.classList.contains("nota-math-delim"));
  等(分隔?.length, 2, "行内也是两颗分隔符");
  等(分隔?.[0]?.textContent, "$", "行内分隔符是单个 `$`");

  框!.value = "y_1+1";
  框!.派发("input");
  const 改后 = 取state().doc.nodeAt(行内位置);
  if (!改后) throw new Error("改完之后节点不见了");
  等(改后.textContent, "y_1+1", "内容");
  等("value" in 改后.attrs, false, "行内节点不许有 value 属性");
  等(存盘一笔(改后)[0]?.值, "y_1+1", "存盘时交出去的是新源码");
});

await 测("行内：Enter 当「确认」，别的键不拦", () => {
  const { 视角, 取state } = 建(行内("x"), 行内位置);
  const 框 = 找(视角.视图!.dom, "nota-math-source");
  if (!框) throw new Error("没有源码框");
  等(框.派发("keydown", { key: "a" }).defaultPrevented, false, "普通键不许拦");
  等(框.派发("keydown", { key: "Enter" }).defaultPrevented, true, "Enter 要拦");
  等(取state().doc.nodeAt(行内位置)?.textContent, "x", "文档没变");
});

await 测("只读实例：**不给面板**（连挂件都不挂），也不抢焦点", async () => {
  const { 视角, 取state } = 建(块("E=mc^2"), 块位置, true);
  const dom = 视角.视图!.dom;
  断言(dom.classList.contains("nota-math-readonly"), "根上该有只读标记");
  等(数(dom, "nota-math-panel"), 0, "只读实例不许把面板挂上树");
  等(数(dom, "nota-math-source"), 0, "只读实例不许把源码框挂上树");
  等(数(dom, "nota-math-preview"), 0, "只读实例也不许把悬浮预览挂上树");
  等(dom.classList.contains("nota-math-editing"), false, "只读实例不许进编辑态");
  等(数(dom, "nota-math-upstream"), 1, "只读实例该画上游那棵树");
  await 冲刷();
  等(当前焦点(), null, "只读实例不许抢焦点");
  等(取state().doc.child(1).attrs.value, "E=mc^2", "只读实例不改文档");
});

await 测("没被选中（装饰没来）时：进不了编辑态，也不抢焦点", () => {
  const { 视角 } = 建(块("E=mc^2"), 块位置, false, false);
  const dom = 视角.视图!.dom;
  等(dom.classList.contains("nota-math-editing"), false, "面板不该开");
  等(数(dom, "nota-math-panel"), 1, "面板元素在（可编辑实例），只是 CSS 收着");
  等(当前焦点(), null, "没当前就不许抢焦点");
});

/* ── 命令：插一个空公式块（`insert.ts` 的 `插公式块`）─────────────────── */
//
// 这一组要的是"菜单里那一下到底改了什么"。工装只有两件：一颗真 `EditorState`
// （真的是它算的位置与选区）＋一颗**只记 `dispatch` 的假 view**——
// `插公式块` 用到的 view 只有 `state` 与 `dispatch` 两样。
//
// ⚠️ **没验的**：真浏览器里那块 KaTeX 排出来长什么样、面板有没有自动打开
// （面板的判据是"整块被选中"，这里只验到**选区确实是 `NodeSelection`**——
// 从它到"面板开了"那一步在下面第一组的 NodeView 测试里，两边合起来才算严丝合缝）。

ctx.inject(editorViewCtx);

/** 跑一次 `插公式块`，把光标放在 `光标`（必须是文本位置）。返回改完的 state。 */
function 跑插公式块(文档: PMNode, 光标: number) {
  const 视图 = {
    state: EditorState.create({ doc: 文档, selection: TextSelection.create(文档, 光标) }),
    dispatch(tr: Transaction) {
      调用.push("dispatch");
      视图.state = 视图.state.apply(tr);
    },
    // ⚠️ 只记顺序，不做真的聚焦（假 DOM 里没有焦点这回事）。
    focus() {
      调用.push("focus");
    },
  };
  const 调用: string[] = [];
  ctx.set(editorViewCtx, 视图 as never);
  // `Editor` 那一层只用得上 `action`（它就是把 ctx 交回调）。
  插公式块({ action: (体: (c: unknown) => void) => 体(ctx) } as never);
  return { state: 视图.state, 调用 };
}

组("六、插公式块（`docs/07` 第 52 项那条菜单）");

await 测("空段落里 → **就地**变成公式块（不留下一个空段落），并整个选中它", () => {
  const 文档 = schema.topNodeType.create(null, [段落()]);
  const { state: 改完 } = 跑插公式块(文档, 1);
  等(改完.doc.childCount, 1, "还是只有一块（就地换，不是插一块新的）");
  等(改完.doc.child(0).type.name, "math_block", "那一段自己变成了公式块");
  等(改完.doc.child(0).attrs.value, "", "源码为空（用户马上要自己写）");
  断言(改完.selection instanceof NodeSelection, "选区是 NodeSelection——这是『正在编辑』的判据");
  等(改完.selection.from, 0, "选中的正是新块");
});

await 测("有字的段落里 → 插在**这一段之后**，那一段的字一个不动", () => {
  const 文档 = schema.topNodeType.create(null, [段落("甲"), 段落("乙")]);
  const { state: 改完 } = 跑插公式块(文档, 2);
  等(改完.doc.childCount, 3, "多出来一块");
  等(改完.doc.child(0).textContent, "甲", "原段落一个字不动（`setBlockType` 那条路会把这字吃掉）");
  等(改完.doc.child(1).type.name, "math_block", "新块落在它后面");
  等(改完.doc.child(2).textContent, "乙", "后面的段落也没被顶掉");
  断言(改完.selection instanceof NodeSelection, "新块被选中");
  等(改完.selection.from, 段落("甲").nodeSize, "选中的是新块的位置");
});

await 测("嵌套的空段落里（引用块内）→ 只插一块，**外层整块不许被换掉**", () => {
  const 引用 = schema.nodes.blockquote.create(null, [段落()]);
  const 文档 = schema.topNodeType.create(null, [引用, 段落("尾")]);
  const { state: 改完 } = 跑插公式块(文档, 2);
  等(改完.doc.childCount, 3, "引用块还在，只多出一块");
  等(改完.doc.child(0).type.name, "blockquote", "⚠️ 外层引用块必须原样在（`$from.before(1)` 那个坑）");
  等(改完.doc.child(0).childCount, 1, "引用块里的空段落也还在");
  等(改完.doc.child(1).type.name, "math_block", "新块插在这一整个顶层块之后");
  等(改完.doc.child(2).textContent, "尾", "后面的照旧");
});

await 测("插进去那块是**真能存盘**的（走插件自己那份 toMarkdown）", () => {
  const { state: 改完 } = 跑插公式块(schema.topNodeType.create(null, [段落()]), 1);
  等(JSON.stringify(存盘一笔(改完.doc.child(0))), JSON.stringify([{ 名: "math", 值: "" }]), "存盘读 attrs.value，落成一条 math");
});

await 测("**先聚焦、再派事务**（从菜单点下来时源码框才抢得到焦点）", () => {
  const { 调用 } = 跑插公式块(schema.topNodeType.create(null, [段落()]), 1);
  // ⚠️ 这条钉的是一个**无头窗口里才露头**的毛病（2026-09-26）：菜单点下来那一刻
  //    DOM 焦点还在菜单按钮上，`math-view.ts::同步面板` 的判据 `view.hasFocus()`
  //    为假 → 面板画出来却不把焦点给源码框 → 接着敲的字进了正文。
  //    （走 `Ctrl+Shift+M` 时焦点本就在正文里，所以只在鼠标这条路上出问题。）
  等(JSON.stringify(调用), JSON.stringify(["focus", "dispatch"]), "顺序：先 focus 再 dispatch");
});

/* ── 七、序列化时不给行首井号加反斜杠（`lax-heading.ts`）───────────────── */
//
// 这一组接的是第七组原来的位置：那一组钉的是 `宽松标题显示`（把 `#你好` 按
// `h1` 排版的那个装饰），**2026-09-26 那条装饰被删掉了**——用户裁定
// `#你好` 不许变位置变大小（他的原话与完整理由在 `lax-heading.ts` 文件头）。
// 装饰没了就没什么可测的，于是这一格换成**同一个文件里剩下那一半**：
// `不转义行首井号`——它原来**一条用例都没有**（判据只写在注释里）。
//
// ⚠️ 这一组**测不到 remark 真的会怎么转义**：那边是 `mdast-util-to-markdown`
// 的内部行为，这里递进去的是一份**假的**原文处理器（`假转义`），所以钉的是
// **本函数的判据**（哪几种能脱、哪几种一个字节都不许动），不是"上游行为没变"。
// 上游行为要变，得靠端到端那条（`docs/06` §5.9 的"存前存后比字节"）。

/**
 * 假装自己是 remark 那条文本处理器：把**行首**的井号转义掉。
 *
 * ⚠️ 只做这一件事，因为 `被转义的行首井号` 这条正则只认这一个形状。
 */
function 假转义(值: string): string {
  return 值.replace(/^(#{1,6})/, "\\$1");
}

/** 拿一个"原文处理器"：`脱` 是假的，用来验脱得对不对。 */
function 假原文(值: string) {
  return (() => 假转义(值)) as never;
}

/** 跑一遍：拿真函数包住假原文，喂一个假的 mdast 文本节点。 */
function 串化(值: string): string {
  const 处理 = 不转义行首井号(假原文(值));
  return 处理({ value: 值 } as never, null as never, null as never, null as never);
}

组("七、序列化不给行首井号加反斜杠（`lax-heading.ts`）");

await 测("`#标签`：反斜杠要脱掉（存盘存回用户写的那几个字符）", () => {
  等(串化("#标签 不是标题"), "#标签 不是标题", "`\\#标签` 要变回 `#标签`");
  等(串化("###三层"), "###三层", "一到六个井号都算");
});

await 测("⚠️ `# 有空格`：**一个字节都不许动**（它本来就得转义）", () => {
  // 这是整条规则**最容易改错**的一处：CommonMark 里"井号 + 空格"是真标题，
  // 那个反斜杠是**有用的**，脱掉之后重新打开就变成标题了。
  等(串化("# 有空格"), "\\# 有空格", "井号后有空白 → 不许脱");
  等(串化("#"), "\\#", "光一个井号 → 不许脱");
  等(串化("##"), "\\##", "连着两个井号（后面什么都没）→ 不许脱");
});

await 测("`#` 不在行首（段中间、或行内代码里那种）→ 不许动", () => {
  // 只有**行首**那个才有多余转义的问题；段中间的井号 remark 本来就不转义，
  // 这里给的是"假原文已经转了"的输入，函数也不该去动它（判据里没有行首就返回原样）。
  等(串化("甲#标签"), "甲#标签", "不在行首：原样返回");
});

await 测("多行文本：每一行的行首都算（`(^|\n)` 那一段）", () => {
  等(串化("甲\n#标签"), "甲\n#标签", "第二行的行首也要脱");
});

await 测("没有原文处理器时**原样返回**，不自己造一条", () => {
  // `create.ts` 传的是 `prev.handlers?.text`，它可能没有——那时宁可什么都不做，
  // 也不能在这里自己拼一份转义规则出来（序列化器是核心路径）。
  const 处理 = 不转义行首井号(undefined);
  等(处理({ value: "#标签" } as never, null as never, null as never, null as never), "#标签");
});

/* ── 收尾 ─────────────────────────────────────────────────────────────── */

console.log(`\n${"─".repeat(64)}`);
console.log(`通过 ${过} 条，失败 ${败} 条`);
if (败) {
  console.log(`失败的：\n  - ${败的.join("\n  - ")}`);
  process.exitCode = 1;
}
