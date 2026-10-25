/**
 * 公式那两份测试（`math-view.test.ts` / `math-wiring.test.ts`）**共用的工装**：
 * 一颗用**真插件规格**搭出来的真 `Schema`，加一套假 NodeView 支架。
 *
 * # 它为什么存在（2026-10-07 拆出来的）
 *
 * `tests/math-view.test.ts` 那天涨到 1024 行（`docs/07` 第 89 项）。拆的时候
 * 发现的不是"两份测试各要一半代码"，而是**两份要的是同一套地基**：
 *
 * - 一颗真 `Ctx` ＋ 真 `math_inline` / `math_block` 规格 → 真 `Schema`
 *   （"源码在内容里还是在属性里""存盘读哪个字段"这两条全靠它才是**真代码**在答）；
 *   ＋ `段落` / `块` / `行内` / 两个落点位置这几个造文档的小工具；
 * - `造假视图` ＋ `建`：真 NodeView 构造器 ＋ 假 `EditorView`（`state` 是真的、
 *   `dispatch` 真的把事务应用回去），NodeView 那两组全靠它。
 *
 * 这两块**复制一份**（而不是抽出来）的代价是两份 Schema 迟早分家——那种分家
 * 不会报错，只会让两份测试量出不一样的结论。所以整块搬来这里，两份 import。
 *
 * ⚠️ **搬的是整块职责，不是搬行**（`docs/09` §4）：这个文件的判据是
 * "不认识任何一个具体用例"——它只搭台子，一条断言都没有。
 *
 * # 装配顺序有讲究（别调）
 *
 * 1. `装假document()` **必须最先**：`$view` 的插件体与后面的 NodeView 都要
 *    `document.createElement`，而本仓没有 jsdom（理由在 `fake-dom.ts` 文件头）。
 * 2. `$prose` / `$view` 的插件体都要 `await ctx.wait(SchemaReady)`，而 `Ctx.wait`
 *    是构造函数里挂上去的自有属性——这里换成 `async () => {}`：本测试只要
 *    "注入 ＋ 跑插件体"，不跑 milkdown 的启动时序。
 * 3. `公式行内视图(ctx)()` / `公式块视图(ctx)()` 是**模块级 await**（下面那两行）：
 *    `建` 要拿它们的 `.view` 当构造器，而那两个 `$view` 的插件体不跑完是拿不到的。
 *    ESM 的顶层 await 在这里正好够用。
 */

import { Container, Ctx } from "@milkdown/kit/ctx";
import { nodeViewCtx, prosePluginsCtx, schemaCtx } from "@milkdown/kit/core";
import { Schema } from "@milkdown/kit/prose/model";
import type { Node as PMNode } from "@milkdown/kit/prose/model";
import { EditorState, NodeSelection, TextSelection } from "@milkdown/kit/prose/state";
import type { Transaction } from "@milkdown/kit/prose/state";
import type { Decoration, NodeView } from "@milkdown/kit/prose/view";
import { katexOptionsCtx, mathBlockSchema, mathInlineSchema } from "@milkdown/plugin-math";

import { commonStyleBlockView, commonStyleInlineView, computeDecorations } from "../src/editor/math-view";
import { fakeElement, currentFocusPoint, clearFocusPoint, installFakedocument } from "./fake-dom";

installFakedocument();

/* ── 真规格 → 真 Schema（不建 Editor、不碰 DOM）──────────────────────── */

export const ctx = new Ctx(new Container(), {} as never);
// ⚠️ 见文件头：本测试只要"注入 + 跑插件体"，不要 milkdown 的启动时序。
(ctx as unknown as { wait: () => Promise<void> }).wait = async () => {};
// 这几片得先注入（`$prose` / `$view` 的插件体会 `ctx.update(...)` 它们）。
ctx.inject(prosePluginsCtx);
ctx.inject(nodeViewCtx);
katexOptionsCtx(ctx);
mathInlineSchema.ctx(ctx);
mathBlockSchema.ctx(ctx);

/** 真插件自己那份 `math_inline` 规格。 */
export const inlineSpec = ctx.get(mathInlineSchema.key)(ctx);
/** 真插件自己那份 `math_block` 规格。 */
export const blockSpec = ctx.get(mathBlockSchema.key)(ctx);

export const schema = new Schema({
  nodes: {
    doc: { content: "block+" },
    paragraph: { content: "inline*", group: "block", toDOM: () => ["p", 0] },
    text: { group: "inline" },
    // 一个"能把段落装进去"的容器，只给「插公式块」那组当反例用
    //（"光标在**嵌套**的空段落里时不许把外层整块换掉"）。别的组用不到它。
    blockquote: { content: "block+", group: "block", toDOM: () => ["blockquote", 0] },
    math_inline: inlineSpec,
    math_block: blockSpec,
  },
});
// ⚠️ `schemaCtx` 是**裸的 SliceType**（不是 `$ctx` 的产物），所以没有 `.key`：
//    传它本身。
ctx.inject(schemaCtx);
ctx.set(schemaCtx, schema);

/** 段落（给字符串就当文本，给节点就原样放；空串丢掉，`schema.text("")` 会抛）。 */
export const paragraph = (...content: (PMNode | string)[]): PMNode =>
  schema.nodes.paragraph.create(
    null,
    content
      .filter((x) => x !== "")
      .map((x) => (typeof x === "string" ? schema.text(x) : x)),
  );
/** 块公式。 */
export const block = (value2: string): PMNode => schema.nodes.math_block.create({ value: value2 });
/** 行内公式（空串要走 `null`：`schema.text("")` 会抛）。 */
export const inline = (source3: string): PMNode =>
  schema.nodes.math_inline.create(null, source3 === "" ? null : schema.text(source3));

/** 第一个位置：前面那段"公式："之后的第一个位置（测试都用它当块的落点）。 */
export const blockPosition = paragraph("公式：").nodeSize;
/** 行内那颗落在第二个段落的内容起点上。 */
export const inlinePosition = blockPosition + 1;

/**
 * 假序列化状态：只记下 `toMarkdown.runner` 交给 remark 的 `addNode` 三样。
 * ⚠️ 跑的是**插件自己那份真 runner**，所以"存盘读哪个字段"是它在答。
 */
export function saveToDiskValueStroke(node: PMNode): { name3: string; value2: string | undefined }[] {
  const invoke: { name3: string; value2: string | undefined }[] = [];
  const state = {
    addNode(name3: string, _Child: unknown, value2?: string) {
      invoke.push({ name3, value2 });
      return state;
    },
  };
  const spec = node.type.name === "math_block" ? blockSpec : inlineSpec;
  const runner = spec.toMarkdown?.runner as
    | ((s: unknown, n: PMNode, parent: unknown, order: number) => void)
    | undefined;
  if (!runner) throw new Error("插件没给 toMarkdown.runner？");
  runner(state, node, null, 0);
  return invoke;
}

/* ── 假 NodeView 支架 ──────────────────────────────────────────────────── */

// ⚠️ 见文件头第 3 条：这两个 `$view` 的插件体不跑完就摸不到 `.view` 构造器。
await commonStyleInlineView(ctx)();
await commonStyleBlockView(ctx)();
export const createInlineView = commonStyleInlineView.view;
export const createBlockView = commonStyleBlockView.view;

/**
 * 一颗假 `EditorView`：`state` 是真的，`dispatch` 真的把事务应用回去，
 * 然后照 ProseMirror 的做法（`CustomNodeViewDesc.update`）把新节点与新装饰
 * 交给 NodeView。
 */
export function createFakeView3(
  doc: PMNode,
  position2: number,
  onlyRead: boolean,
  selected: boolean,
  nodeType: PMNode["type"],
) {
  let state = EditorState.create({
    doc,
    selection: selected ? NodeSelection.create(doc, position2) : TextSelection.create(doc, position2),
  });
  const perspective: { view: NodeView | null } = { view: null };
  const view = {
    editable: !onlyRead,
    // ⚠️ 与真 PM 一致：`hasFocus()` = "焦点就在 `view.dom` 上"。这里用假 DOM 的
    //    全局焦点代表它——源码框拿着焦点时，正文就不算拿着。
    hasFocus: () => currentFocusPoint() === null,
    focus: () => currentFocusPoint()?.blur(),
    get state() {
      return state;
    },
    dispatch: (tr: Transaction): void => {
      state = state.apply(tr);
      const newValueNode = state.doc.nodeAt(position2);
      // ⚠️ 节点被删掉、或者位置上换成了**别的类型**时，真 ProseMirror 是把
      //    这个视图 `destroy` 掉另建一个（`updateNextNode` 认的是同一个类型），
      //    所以这里绝不能拿新节点去喂 `update`。
      if (!newValueNode || newValueNode.type !== nodeType) return;
      const decoration = computeDecorations(state).find(position2, position2 + newValueNode.nodeSize) as readonly Decoration[];
      perspective.view?.update?.(newValueNode, decoration);
    },
  };
  return { view, perspective, getState: () => state };
}

/** 建一个 NodeView（真构造器，只是喂进去的 view 与 document 是假的）。 */
export function create(node: PMNode, position2: number, onlyRead = false, selected = true, tailParagraph = true) {
  clearFocusPoint();
  // ⚠️ 默认在块后面留一段正文：`退出编辑` 把光标搬到"块后面"时，落在文本块里
  //    才是常规情形（`尾段 = false` 用来试"公式块是文档最后一块"那条路）。
  //    行内那颗在段落里，后面有没有别的段落都一样。
  const doc = schema.topNodeType.create(
    null,
    node.type.name === "math_block"
      ? tailParagraph
        ? [paragraph("公式："), node, paragraph("后面")]
        : [paragraph("公式："), node]
      : [paragraph("公式："), paragraph(node), paragraph("后面")],
  );
  const assertValueNode = doc.nodeAt(position2);
  if (!assertValueNode) throw new Error(`位置 ${position2} 上没有节点`);
  const { view, perspective, getState } = createFakeView3(doc, position2, onlyRead, selected, assertValueNode.type);
  const decoration = computeDecorations(getState()).find(position2, position2 + assertValueNode.nodeSize) as readonly Decoration[];
  const ConstructCreate = assertValueNode.type.name === "math_block" ? createBlockView : createInlineView;
  perspective.view = ConstructCreate(assertValueNode, view as never, () => position2, decoration, null as never);
  return { view, perspective, getState, position2 };
}

/** ⚠️ 给读的人：`假元素` 在 `fake-dom.ts` 里，这里只 re-export 一下——
 *  两份测试的 import 表里不必再分别写 `./fake-dom` 与 `./math-fixture` 两行。 */
export type { fakeElement };
