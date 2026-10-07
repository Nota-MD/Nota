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

import { 公式块视图, 公式行内视图, 算装饰 } from "../src/editor/math-view";
import { 假元素, 当前焦点, 清焦点, 装假document } from "./fake-dom";

装假document();

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
export const 行内规格 = ctx.get(mathInlineSchema.key)(ctx);
/** 真插件自己那份 `math_block` 规格。 */
export const 块规格 = ctx.get(mathBlockSchema.key)(ctx);

export const schema = new Schema({
  nodes: {
    doc: { content: "block+" },
    paragraph: { content: "inline*", group: "block", toDOM: () => ["p", 0] },
    text: { group: "inline" },
    // 一个"能把段落装进去"的容器，只给「插公式块」那组当反例用
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
export const 段落 = (...内容: (PMNode | string)[]): PMNode =>
  schema.nodes.paragraph.create(
    null,
    内容
      .filter((x) => x !== "")
      .map((x) => (typeof x === "string" ? schema.text(x) : x)),
  );
/** 块公式。 */
export const 块 = (值: string): PMNode => schema.nodes.math_block.create({ value: 值 });
/** 行内公式（空串要走 `null`：`schema.text("")` 会抛）。 */
export const 行内 = (源: string): PMNode =>
  schema.nodes.math_inline.create(null, 源 === "" ? null : schema.text(源));

/** 第一个位置：前面那段"公式："之后的第一个位置（测试都用它当块的落点）。 */
export const 块位置 = 段落("公式：").nodeSize;
/** 行内那颗落在第二个段落的内容起点上。 */
export const 行内位置 = 块位置 + 1;

/**
 * 假序列化状态：只记下 `toMarkdown.runner` 交给 remark 的 `addNode` 三样。
 * ⚠️ 跑的是**插件自己那份真 runner**，所以"存盘读哪个字段"是它在答。
 */
export function 存盘一笔(节点: PMNode): { 名: string; 值: string | undefined }[] {
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

/* ── 假 NodeView 支架 ──────────────────────────────────────────────────── */

// ⚠️ 见文件头第 3 条：这两个 `$view` 的插件体不跑完就摸不到 `.view` 构造器。
await 公式行内视图(ctx)();
await 公式块视图(ctx)();
export const 造行内视图 = 公式行内视图.view;
export const 造块视图 = 公式块视图.view;

/**
 * 一颗假 `EditorView`：`state` 是真的，`dispatch` 真的把事务应用回去，
 * 然后照 ProseMirror 的做法（`CustomNodeViewDesc.update`）把新节点与新装饰
 * 交给 NodeView。
 */
export function 造假视图(doc: PMNode, 位置: number, 只读: boolean, 选中: boolean, 类: PMNode["type"]) {
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
export function 建(节点: PMNode, 位置: number, 只读 = false, 选中 = true, 尾段 = true) {
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

/** ⚠️ 给读的人：`假元素` 在 `fake-dom.ts` 里，这里只 re-export 一下——
 *  两份测试的 import 表里不必再分别写 `./fake-dom` 与 `./math-fixture` 两行。 */
export type { 假元素 };
