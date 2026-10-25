/**
 * `src/editor/caret-snapshot.ts`（**选区快照**，`docs/07` 第 14 项）的
 * **可运行**测试集。2026-10-04 写，与那个文件同批落地。
 *
 * # 跑法
 *
 * ```sh
 * npx esbuild tests/caret-snapshot.test.ts --bundle --platform=node --format=esm \
 *   --outfile=/tmp/nota-测试/caret-snapshot.mjs && node /tmp/nota-测试/caret-snapshot.mjs
 * ```
 *
 * # 用的是真代码
 *
 * 真 ProseMirror 模型（`@milkdown/kit/prose/model`）＋ 真 milkdown 序列化器
 * （`@milkdown/kit/transformer` 的 `SerializerState`），与
 * `empty-doc-save.test.ts` 同一套工装——**这一段不需要 DOM**，所以本仓
 * 没有 jsdom 也跑得起来。
 *
 * ✅ **2026-10-04 这条工装是现学的**：写这份测试之前不知道 PM 模型能在 Node 里
 * 跑起来（`empty-doc-save.test.ts` 已经这么用了，但那次只当"序列化器"用）。
 * 第三组那张量测表就是靠它量出来的。
 *
 * # 三组
 *
 * 1. **读选区快照**（正题）：选中一段 / 跨段 / 空选区 / 选中的是原子。
 * 2. **插件只报"变了的"**：ProseMirror 每敲一颗字派一次事务，不去重
 *    就要每次跨一趟 IPC。
 * 3. ⚠️ **事实记录**：为什么快照里**没有**偏移量。这一组**不是要求**，
 *    是"当初量到的结果"——哪天它红了，说明序列化器的行为变了，
 *    那时要回来重读 `caret-snapshot.ts` 顶上那张表，**别急着改断言**。
 *
 * # ⚠️ 这份测试**证明不了**什么
 *
 * - **真编辑器里那一步没验**：没有 `EditorView`、没有 DOM、没有 IPC。
 *   走的是"真 state ＋ 手搓的假视图"，`Editor.make()` 那条路一个字都没碰。
 * - **窗口里的行为没验**（敲字时光标状态对不对、插件拿到的是不是刚落的那一份）。
 * - **后端那一段没验**（`nota_doc_cursor` / `nota.document.get_selection()`
 *   是 Rust 的，见 `src-tauri/src/lua/api/document.rs` 里那几条 `#[test]`）。
 */

import { Container, Ctx } from "@milkdown/kit/ctx";
import { editorViewCtx, marksCtx, nodesCtx, remarkStringifyOptionsCtx } from "@milkdown/kit/core";
import { Schema } from "@milkdown/kit/prose/model";
import { EditorState, TextSelection } from "@milkdown/kit/prose/state";
import { Transform } from "@milkdown/kit/prose/transform";
import { ParserState, SerializerState } from "@milkdown/kit/transformer";
import {
  blockquoteSchema,
  bulletListSchema,
  docSchema,
  emphasisSchema,
  listItemSchema,
  paragraphSchema,
  strongSchema,
} from "@milkdown/kit/preset/commonmark";
import { unified } from "unified";
import remarkParse from "remark-parse";
import remarkStringify from "remark-stringify";

import { createSelectionSnapshotPlugin, readSelectionSnapshot } from "../src/editor/caret-snapshot";

/* ── 一支极小的测试工装（与 `empty-doc-save.test.ts` 同一套长相）── */

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

/* ── 真规格 → 真 Schema → 真两台状态机（抄 `empty-doc-save.test.ts`）───── */

const ctx = new Ctx(new Container(), {} as never);
ctx.inject(nodesCtx);
ctx.inject(marksCtx);
/** ⚠️ 上游段落那条 runner 会去问 `editorViewCtx`，见 `empty-doc-save.test.ts`。 */
ctx.inject(editorViewCtx, { state: undefined } as never);
ctx.inject(remarkStringifyOptionsCtx, { bullet: "-", rule: "-" } as never);

const nodeDollarGroup = [paragraphSchema, bulletListSchema, listItemSchema, blockquoteSchema];
const markDollarGroup = [strongSchema, emphasisSchema];
for (const s of [...nodeDollarGroup, ...markDollarGroup]) {
  (s as unknown as { ctx: (c: unknown) => void }).ctx(ctx);
}

const runNodePlugin = async (support2: unknown): Promise<void> => {
  await (support2 as { node: (c: Ctx) => () => Promise<void> }).node(ctx)();
};
/** ⚠️ 标记那份挂的是 `.mark` 不是 `.node`——`$markSchema` 与 `$nodeSchema` 不同形。 */
const runMarkPlugin = async (support2: unknown): Promise<void> => {
  await (support2 as { mark: (c: Ctx) => () => Promise<void> }).mark(ctx)();
};

await (docSchema as unknown as (c: Ctx) => () => Promise<void>)(ctx)();
for (const s of nodeDollarGroup) await runNodePlugin(s);
for (const s of markDollarGroup) await runMarkPlugin(s);

const getNode = (id: string): never => {
  const findTo = (ctx.get(nodesCtx) as [string, unknown][]).find(([n]) => n === id);
  if (!findTo) throw new Error(`注册表里没有 ${id}`);
  return findTo[1] as never;
};
const getMark = (id: string): never => {
  const findTo = (ctx.get(marksCtx) as [string, unknown][]).find(([n]) => n === id);
  if (!findTo) throw new Error(`标记表里没有 ${id}`);
  return findTo[1] as never;
};

const schema = new Schema({
  nodes: {
    doc: getNode("doc"),
    paragraph: getNode("paragraph"),
    bullet_list: getNode("bullet_list"),
    list_item: getNode("list_item"),
    blockquote: getNode("blockquote"),
    // ⚠️ text 是**手写的最小版**（同 `empty-doc-save.test.ts`）：上游那份是个
    // `$node`，得整个 ctx 才拿得到；而这里只需要 `group: "inline"` 加两条
    // 解析/序列化 runner。
    text: {
      group: "inline",
      parseMarkdown: {
        match: ({ type }: { type: string }) => type === "text",
        runner: (state: { addText: (t: string) => void }, node: { value: string }) =>
          state.addText(node.value),
      },
      toMarkdown: {
        match: (node: { type: { name: string } }) => node.type.name === "text",
        runner: (state: { addNode: (t: string, a: unknown, v: string) => void }, node: { text: string }) =>
          state.addNode("text", undefined, node.text),
      },
    },
  },
  marks: { strong: getMark("strong"), emphasis: getMark("emphasis") },
}) as unknown as Schema;

const placeManageMachine = unified().use(remarkParse).use(remarkStringify, { bullet: "-" as const, rule: "-" as const });
const parse = ParserState.create(schema, placeManageMachine);
const serialize = SerializerState.create(schema, placeManageMachine);
const output2 = (doc: unknown): string => String(serialize(doc as never));
const codePointLength = (s: string): number => [...s].length;

/**
 * 拿一段 markdown 真解析成一份文档，再套一个真 `EditorState`。
 *
 * ⚠️ `EditorState.create` **要 DOM 吗**？不要——`prosemirror-state` 是纯的
 * （只有 `prosemirror-view` 才碰 DOM）。这一条是 2026-10-04 现学的，
 * 有了它"选区"才进得了测试。
 */
const createState = (source3: string, selection?: { from: number; to?: number }): EditorState => {
  const doc = parse(source3) as never;
  return EditorState.create({
    schema,
    doc: doc as never,
    selection:
      selection === undefined
        ? undefined
        : TextSelection.create(doc as never, selection.from, selection.to ?? selection.from),
  });
};

/* ── 一、读选区快照 ─────────────────────────────────────────────────── */

group("一、读选区快照");

testCase("空选区：empty，且 text 是空串", () => {
  const s = readSelectionSnapshot(createState("甲乙丙\n", { from: 2 }));
  equal(s.empty, true, "空选区");
  equal(s.text, "", "空选区没有文本");
});

testCase("选中一段：读出的是**纯文本**（标记不在里面）", () => {
  // 文档：`甲**粗**乙` —— 文档位置 1 是段落内容起点。
  const s = readSelectionSnapshot(createState("甲**粗**乙\n", { from: 2, to: 3 }));
  equal(s.empty, false, "有选区");
  equal(s.text, "粗", "纯文本");
});

testCase("跨段选区：块之间用 `\\n` 连（不是静默粘成一行）", () => {
  const s = readSelectionSnapshot(createState("第一段\n\n第二段\n", { from: 1, to: 9 }));
  // ⚠️ 不传分隔符的话这里会是 `第一段第二段`——看起来像一句话，而那是错的。
  equal(s.text, "第一段\n第二段", "块分隔符");
});

testCase("选中一整块（含节点边界）也不抛", () => {
  const s = readSelectionSnapshot(createState("甲\n\n- 一\n- 二\n", { from: 1, to: 7 }));
  equal(s.empty, false, "有选区");
  console.log(`      （实际读出来：${JSON.stringify(s.text)}）`);
});

testCase("引用块里的选区照样读得出来（块结构不影响这一层）", () => {
  const s = readSelectionSnapshot(createState("> 引用\n", { from: 2, to: 4 }));
  equal(s.text, "引用", "引用块内");
});

/* ── 二、插件只报"变了的" ───────────────────────────────────────────── */

group("二、插件只报变了的");

testCase("挂载时报一次初值，重复的事务不重复报", () => {
  const reportPassOf: string[] = [];
  const p = createSelectionSnapshotPlugin((k) => reportPassOf.push(`${k.empty ? "空" : "选"}:${k.text}`));
  const view = { state: createState("甲乙丙\n", { from: 2 }) } as never;

  // `Plugin.spec.view` 是本仓自己写的那一支（不是上游的），直接驱动它。
  const pluginView = (p.spec.view as unknown as (v: unknown) => { update: (v: unknown) => boolean })(view);
  // ⚠️ 挂载那一刻**必须**先报一次：不报的话"打开文档、什么都没选"会读到
  // 上一个文档留下的那一份（见 `caret-snapshot.ts` 里那条注解）。
  equal(reportPassOf.length, 1, "挂载时先报一次");
  equal(reportPassOf[0], "空:", "初值就是空选区");

  // 同一份状态再 update 一次：签名没变 ⇒ 不再报。
  equal(pluginView.update(view), false, "update 一律返回 false");
  equal(reportPassOf.length, 1, "没变就不报");

  // 选区变了：报。
  view.state = createState("甲乙丙\n", { from: 2, to: 3 });
  pluginView.update(view);
  equal(reportPassOf.length, 2, "变了就报");
  equal(reportPassOf[1], "选:乙", "报的是新的那一份");
});

/* ── 三、事实记录：为什么快照里没有偏移量 ───────────────────────────── */

group("三、⚠️ 事实记录：按 markdown 偏移拼接**重建不出**光标处插入（2026-10-04 量）");

/** 只用 ASCII 字母 —— 序列化器一个字都不会给它加转义。 */
const sentinelSoldier = "QqZxMarker";

/** 把哨兵插在 PM 位置 `p` 上再序列化，返回它在 markdown 里的**码点**下标。 */
function sentinelSoldierOffset(doc: never, p: number): number {
  const tr = new Transform(doc);
  tr.insert(p, (schema as unknown as { text: (s: string) => never }).text(sentinelSoldier));
  const withValue = output2(tr.doc);
  const i = withValue.indexOf(sentinelSoldier);
  if (i < 0) throw new Error("哨兵没出现在序列化结果里");
  return codePointLength(withValue.slice(0, i));
}

/** 真值：把 `ZZZ` 真插进 PM 文档再序列化（**编辑器真的会写出来的那串字节**）。 */
function assertValueInsertOneParagraph(doc: never, p: number): string {
  const tr = new Transform(doc);
  tr.insert(p, (schema as unknown as { text: (s: string) => never }).text("ZZZ"));
  return output2(tr.doc);
}

/** 按偏移拼：`全文[0..off] + "ZZZ" + 全文[off..]`。 */
function combineConnectOneParagraph(fullText: string, off: number): string {
  return fullText.slice(0, off) + "ZZZ" + fullText.slice(off);
}

const measureTestCaseSource = "甲**粗**乙 丙\n\n- 一\n- 二\n\n> 引用一段\n";

testCase("行内光标：拼接**对了**（这也正是当初以为整条路都能走通的原因）", () => {
  const doc = parse(measureTestCaseSource) as never;
  const fullText = output2(doc);
  // 位置 3 = 段落里 `甲**粗**` 之后、`乙` 之前。
  // ⚠️ 真值先自己钉一下（断言"能对上"要有个基准，不能拿拼接自己对自己）。
  equal(assertValueInsertOneParagraph(doc, 3), "甲**粗**ZZZ乙 丙\n\n- 一\n- 二\n\n> 引用一段\n", "PM 真插的结果");
  equal(combineConnectOneParagraph(fullText, sentinelSoldierOffset(doc, 3)), assertValueInsertOneParagraph(doc, 3), "行内：拼出来一样");
});

testCase("⚠️ 块与块之间：拼接**错了**——少了一个段落", () => {
  const doc = parse(measureTestCaseSource) as never;
  const fullText = output2(doc);
  // 位置 7 = 第一段末尾之后、列表之前（一个"两段之间"的位置）。
  const assertValue = assertValueInsertOneParagraph(doc, 7);
  const combine2 = combineConnectOneParagraph(fullText, sentinelSoldierOffset(doc, 7));
  equal(assertValue, "甲**粗**乙 丙\n\nZZZ\n\n- 一\n- 二\n\n> 引用一段\n", "PM 真插：**多出一个段落**");
  equal(combine2, "甲**粗**乙 丙\n\nZZZ- 一\n- 二\n\n> 引用一段\n", "拼接：把 ZZZ 粘进了列表");
  // ⚠️ 这一条是**反过来**断言的：两者**必须不一样**。哪天它们一样了，
  // 说明序列化器改了行为，那时要回来重判"偏移量这条路能不能走"。
  if (combine2 === assertValue) throw new Error("两者竟然一样了——序列化器的结构规则变了，回来重判设计");
});

testCase("⚠️ 列表项开头：拼接**错了**——少了一个 `- ` 标记", () => {
  const doc = parse(measureTestCaseSource) as never;
  const fullText = output2(doc);
  // 位置 8 = 第一个列表项的内容起点。
  const assertValue = assertValueInsertOneParagraph(doc, 8);
  const combine2 = combineConnectOneParagraph(fullText, sentinelSoldierOffset(doc, 8));
  equal(assertValue, "甲**粗**乙 丙\n\n- ZZZ\n- 一\n- 二\n\n> 引用一段\n", "PM 真插：新内容成了新的一行");
  equal(combine2, "甲**粗**乙 丙\n\n- ZZZ一\n- 二\n\n> 引用一段\n", "拼接：粘成了同一项");
  if (combine2 === assertValue) throw new Error("两者竟然一样了——回来重判设计");
});

testCase("⚠️ 引用块里那个换行：拼接**错了**——两段被粘成了一句", () => {
  const doc = parse(measureTestCaseSource) as never;
  const fullText = output2(doc);
  // 位置 20 = 引用块内部的段末（引用里"再开一段"的那个位置）。
  const assertValue = assertValueInsertOneParagraph(doc, 20);
  const combine2 = combineConnectOneParagraph(fullText, sentinelSoldierOffset(doc, 20));
  equal(assertValue, "甲**粗**乙 丙\n\n- 一\n- 二\n\n> ZZZ\n>\n> 引用一段\n", "PM 真插：引用里多出一段");
  equal(combine2, "甲**粗**乙 丙\n\n- 一\n- 二\n\n> ZZZ引用一段\n", "拼接：粘进了引用的正文");
  if (combine2 === assertValue) throw new Error("两者竟然一样了——回来重判设计");
});

/* ── 收尾 ───────────────────────────────────────────────────────────── */

console.log(`\n———— 通过 ${pass} 条，失败 ${fail} 条 ————`);
if (fail) {
  console.log("失败清单：");
  for (const name3 of failed) console.log(`  · ${name3}`);
  process.exit(1);
}
