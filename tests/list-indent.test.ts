/**
 * **列表里的缩进对齐**（`docs/07` backlog 第 47 项）——**判据的量法**，2026-10-04 写。
 *
 * # 这一项原来卡在哪儿
 *
 * 严格模式那两条差异，第一条（ATX 井号后必须有空格）2026-09-24 就做完了；
 * 第二条记的是「**列表内新块的缩进对齐更严格**」，一直挂着，原话是
 * 「⚠️ 动手前需先定判据（是改 schema 的 `list_item` 的 content 表达式，还是在
 * `Enter` 上挂一条命令），**不能照着现象硬凑**」。
 *
 * 用户 2026-10-04 的口径是「照 Typora 做：**列表项里新起块，缩进跟内容首列对齐、
 * 不跟标记对齐**，只在严格模式下生效」。
 *
 * # 量完的结论：**那条行为已经在，而且不可能做成"只在严格模式下"**
 *
 * 三句话，每一句下面都有钉住它的用例：
 *
 * 1. **子列表那一例，Nota 本来就是严格档口径**：`10. aaa` 后面接 **2 格**的
 *    `1. ccc` **不是子列表**（它成了同级项，编号还被重排成 `11.`），接 **4 格**
 *    才是。⚠️ 2 < 4 = `10. ` 的内容首列，这正是 Typora 严格档那句话。
 * 2. **序列化那一侧永远缩到内容首列**：`1.` / `10.` / `100.` 三档分别是
 *    3 / 4 / 5 格（标记宽度是 2 / 3 / 4 格）——**不是按标记宽度缩的**。
 *    ⚠️ 这一层是 `mdast-util-to-markdown` 算的，本仓没有一行代码参与。
 * 3. **"只在严格模式下生效"做不到，也不该做**：宽松那一档要"不生效"，就得把
 *    上面两条**故意放宽**（缩进不到内容列也算进列表）——那是**新造一个和
 *    CommonMark 不一样的解析器**。而严格那一档的行为**已经无条件成立**，
 *    所以这一项**没有可加的东西**：加开关不会多出任何一个字节的行为。
 *
 * ⚠️ **判据为什么不是那两条猜的路**：缩进**不是文档树里的量**。`list_item` 的
 * content 表达式是 `paragraph block*`（量在下面第三组），里面没有"缩到第几格"
 * 这个东西；`1. aaa` ＋ 2 格和 ＋ 3 格**解析出的是同一棵树**（第二组最后两条
 * 钉着这件事）。所以"改 content 表达式"和"在 `Enter` 上挂命令"两条路都够不着
 * 这个量——缩进是**序列化那一刻算出来的**，不是存着的。
 *
 * # ⚠️ 顺带量出来的三条「打开再存，字节变了」（**不是本项的病**）
 *
 * 同一个根（缩进不存，是算出来的）带出来三条，都属于 `docs/07` 第 56 项那一族，
 * 第四组逐条钉着：
 *
 * | 源 | 打开再存 | 改了什么 |
 * |---|---|---|
 * | `1. aaa` ＋ 2 格 `bbb` | 3 格 | 缩进被对齐到内容首列 |
 * | `10. aaa` ＋ 2 格 `正文` | 4 格 | 同上 |
 * | `10. aaa` ＋ 2 格 `1. ccc` | `11. ccc` | 那一行判成同级项，**编号被重排** |
 *
 * # ⚠️ 比 Typora 严格档**宽松**的那一处（如实记，不修）
 *
 * `1. aaa` 后面接 2 格 `bbb`：Typora 严格档说"不在同一列表里"，而 Nota 把它
 * 当**同一段落的续行**（CommonMark 的 lazy continuation）——`bbb` 不会掉出列表。
 * ⚠️ 要在这里"变严格"就得判死懒续行，那是**改解析结果**，而且**字节照样会变**
 * （那一行还是会从 2 格对齐到 3 格 / 4 格），所以那一边**只有代价没有收益**。
 *
 * # 跑法（不装任何包：`esbuild` 与 `node` 仓库里都现成）
 *
 * ```sh
 * cd <仓库>
 * npx esbuild tests/list-indent.test.ts --bundle --platform=node --format=esm \
 *   --outfile=/tmp/nota-list-indent-test/list-indent.test.mjs
 * node /tmp/nota-list-indent-test/list-indent.test.mjs
 * ```
 *
 * 全过退出码 0；有不过的退出码 1，并把名字列出来。
 * ⚠️ esbuild 报错时旧 bundle 还在，`node` 跑出来的是上一版结果——先看 esbuild
 * 那行有没有 `error`（`inline-marks.test.ts` 的文件头记过这个坑）。
 *
 * # 每一组跑的都是真代码，一段都不替它实现
 *
 * - 解析与序列化用**真的 milkdown 那两台状态机**（`ParserState` / `SerializerState`）。
 * - 处理机是**真 `unified()`**：`remark-parse` ＋ **`remark-gfm`**（`preset-gfm`
 *   那一侧也在真链上），序列化选项照 `create.ts` 里那份（`bullet: "-"` / `rule: "-"`，
 *   「列表记号照用户写的存回去」那条死规矩的落点）。
 * - schema 是**手搓的最小版**：`doc` / `paragraph` / `text` ＋ 三种列表节点，
 *   每一颗的 `content` / `attrs` / mdast 处理器都**照抄** `preset-commonmark`
 *   （`node_modules/@milkdown/preset-commonmark/lib/index.js` 里逐条找得到）。
 *   ⚠️ 少了引用/代码块/表格那一堆——**"少了某个节点就报错"是这份测试的局限**，
 *   别当成产品行为。
 *
 * # ⚠️ 这份测试**证明不了**什么
 *
 * - **开窗目检没做**：真窗口里敲一段带子列表的清单、`Ctrl+S`、`cat` 文件比字节
 *   （`docs/06` §5 的做法）。这里一颗 DOM 都没有。
 * - **源码模式（CodeMirror）那一侧的自动缩进一个字没验**：那是另一套编辑模型，
 *   本文件量的是 **mdast ↔ 文档树** 这一条路。
 * - **第五组是读源码文本**量出来的（`create.ts` 里 `strict` 出现在哪些行），
 *   不是把 `createEditor` 真跑起来——`.use()` 的先后与参数由 milkdown 的插件
 *   登记决定，那要建整个 `Editor` 才验得了（`math-currency.test.ts` 第六组同形）。
 * - **粘贴**那一路没单独验：它走的是同一个解析器，但"粘进来之后那棵树的形状"
 *   没有可断言的东西（本文件只量"给一段源码、树长什么样"）。
 */

import { Container, Ctx } from "@milkdown/kit/ctx";
import { nodesCtx } from "@milkdown/kit/core";
import { Schema } from "@milkdown/kit/prose/model";
import type { Node as PMNode } from "@milkdown/kit/prose/model";
import { ParserState, SerializerState } from "@milkdown/kit/transformer";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { unified } from "unified";
import remarkParse from "remark-parse";
import remarkGfm from "remark-gfm";
import remarkStringify from "remark-stringify";

/* ── 一支极小的测试工装（与 `math-currency.test.ts` 同一套长相）── */

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

/* ── 真 Schema → 真两台状态机 ─────────────────────────────────────────── */

const ctx = new Ctx(new Container(), {} as never);
ctx.inject(nodesCtx);

/**
 * 最小 schema：`doc` / `paragraph` / `text` ＋ `bullet_list` / `ordered_list` /
 * `list_item`。⚠️ 三颗列表节点**照抄** `preset-commonmark` 的
 * `bulletListSchema` / `orderedListSchema` / `listItemSchema`——`content`、`attrs`、
 * 两个 runner 的每一个字段都对着那一份抄的（本文件头那张表就是这么量出来的）。
 */
const schema = new Schema({
  nodes: {
    doc: {
      content: "block+",
      parseMarkdown: {
        match: ({ type }) => type === "root",
        runner: (state, node, type) => state.injectRoot(node, type),
      },
      toMarkdown: {
        match: (node) => node.type.name === "doc",
        // ⚠️ **这里不许有 `closeNode()`**：`root` 那一层归 `SerializerState.build()`
        // 自己收，多收一次当场 `Stack over flow, cannot pop on an empty stack.`
        // （`toc.test.ts` 与 `html-block.test.ts` 都记着这条踩过的坑）。
        runner: (state, node) => {
          state.openNode("root");
          state.next(node.content);
        },
      },
    },
    paragraph: {
      content: "inline*",
      group: "block",
      parseMarkdown: {
        match: ({ type }) => type === "paragraph",
        runner: (state, node, type) => {
          state.openNode(type);
          if (node.children) state.next(node.children);
          state.closeNode();
        },
      },
      toMarkdown: {
        match: (node) => node.type.name === "paragraph",
        runner: (state, node) => {
          state.openNode("paragraph");
          state.next(node.content);
          state.closeNode();
        },
      },
    },
    text: {
      group: "inline",
      parseMarkdown: {
        match: ({ type }) => type === "text",
        runner: (state, node) => state.addText(node.value as string),
      },
      toMarkdown: {
        match: (node) => node.type.name === "text",
        runner: (state, node) => state.addNode("text", undefined, node.text as string),
      },
    },
    bullet_list: {
      content: "list_item+",
      group: "block",
      attrs: { spread: { default: false } },
      parseMarkdown: {
        match: ({ type, ordered }) => type === "list" && !ordered,
        runner: (state, node, type) => {
          state.openNode(type, { spread: (node.spread as boolean) ?? false });
          state.next(node.children);
          state.closeNode();
        },
      },
      toMarkdown: {
        match: (node) => node.type.name === "bullet_list",
        runner: (state, node) => {
          state.openNode("list", undefined, { ordered: false, spread: node.attrs.spread });
          state.next(node.content);
          state.closeNode();
        },
      },
    },
    ordered_list: {
      content: "list_item+",
      group: "block",
      attrs: { order: { default: 1 }, spread: { default: false } },
      parseMarkdown: {
        match: ({ type, ordered }) => type === "list" && !!ordered,
        runner: (state, node, type) => {
          state.openNode(type, {
            spread: (node.spread as boolean) ?? true,
            order: (node.start as number) ?? 1,
          });
          state.next(node.children);
          state.closeNode();
        },
      },
      toMarkdown: {
        match: (node) => node.type.name === "ordered_list",
        runner: (state, node) => {
          state.openNode("list", undefined, {
            ordered: true,
            start: node.attrs.order,
            spread: node.attrs.spread,
          });
          state.next(node.content);
          state.closeNode();
        },
      },
    },
    list_item: {
      group: "listItem",
      content: "paragraph block*",
      defining: true,
      attrs: {
        label: { default: "•" },
        listType: { default: "bullet" },
        spread: { default: true },
      },
      parseMarkdown: {
        match: ({ type }) => type === "listItem",
        runner: (state, node, type) => {
          state.openNode(type, {
            label: node.label != null ? `${node.label}.` : "•",
            listType: node.label != null ? "ordered" : "bullet",
            spread: (node.spread as boolean) ?? true,
          });
          state.next(node.children);
          state.closeNode();
        },
      },
      toMarkdown: {
        match: (node) => node.type.name === "list_item",
        runner: (state, node) => {
          state.openNode("listItem", undefined, { spread: node.attrs.spread });
          state.next(node.content);
          state.closeNode();
        },
      },
    },
  },
});

/**
 * 序列化选项**照 `create.ts` 那一份**（只留下本文件量得到的两条）：
 * `bullet` / `rule` 都钉成 `-`——那是"列表记号与分隔线**照用户写的那个存回去**"
 * 那条死规矩的落点。⚠️ 不设它的话 remark 的默认是 `*`，`- 甲` 会变成 `* 甲`，
 * 本文件量出来的字节就与产品无关了。
 */
const stringConvert = { bullet: "-" as const, rule: "-" as const };

const placeManageMachine = unified().use(remarkParse).use(remarkGfm).use(remarkStringify, stringConvert);

const parse = ParserState.create(schema, placeManageMachine);
const serialize = SerializerState.create(schema, placeManageMachine);

/** 一份源码 → 文档树 → 再序列化出去的字节。 */
const roundtrip = (source3: string): string => serialize(parse(source3));

/** 把那棵树画成缩进文本，用来**逐字**钉结构（比一串下标好读、也好改）。 */
function treeShape(node: PMNode, dark2 = 0): string {
  const head2 = `${"  ".repeat(dark2)}${node.type.name}`;
  const selfSelf = node.isText ? `${head2}(${JSON.stringify(node.text)})` : head2;
  const children: string[] = [];
  for (let i = 0; i < node.childCount; i++) children.push(treeShape(node.child(i), dark2 + 1));
  return [selfSelf, ...children].join("\n");
}

/** 顶层那一颗列表节点（本文件每个形状都只有一颗顶层块）。 */
function firstBlock(doc: PMNode): PMNode {
  if (doc.childCount !== 1) throw new Error(`顶层块数不是 1，是 ${doc.childCount}`);
  return doc.child(0);
}

/* ── 一、子列表那一例（Typora 文档里那个 `10.` 例）──────────────────── */

group("一、`10. aaa` 后面接几格才算子列表（Typora 严格档那个例子）");

testCase("接 **2 格** ⇒ **不是子列表**：两个同级项（编号顺排成 `11.`）", () => {
  const doc = parse("10. aaa\n  1. ccc");
  equal(
    treeShape(doc),
    [
      "doc",
      "  ordered_list",
      "    list_item",
      "      paragraph",
      '        text("aaa")',
      "    list_item",
      "      paragraph",
      '        text("ccc")',
    ].join("\n"),
    "2 格 < 内容首列（4）⇒ 那一行不在第一项里面",
  );
  equal(firstBlock(doc).childCount, 2, "同级项数");
});

testCase("接 **4 格** ⇒ **是子列表**（4 = `10. ` 的内容首列）", () => {
  const doc = parse("10. aaa\n    1. ccc");
  equal(
    treeShape(doc),
    [
      "doc",
      "  ordered_list",
      "    list_item",
      "      paragraph",
      '        text("aaa")',
      "      ordered_list",
      "        list_item",
      "          paragraph",
      '            text("ccc")',
    ].join("\n"),
    "4 格 = 内容首列 ⇒ 那一行是第一项里的第二块",
  );
  equal(firstBlock(doc).childCount, 1, "同级项数");
});

testCase("无序列表同理：`- ` 的内容首列是 2，**2 格**算子列表、**1 格**不算", () => {
  const twoCells = parse("- aaa\n  - bbb");
  equal(firstBlock(twoCells).childCount, 1, "2 格：一个项");
  equal(firstBlock(twoCells).child(0).childCount, 2, "2 格：项里两块（正文 ＋ 子列表）");
  const valueCell = parse("- aaa\n - bbb");
  equal(firstBlock(valueCell).childCount, 2, "1 格：两个同级项");
  equal(firstBlock(valueCell).child(0).childCount, 1, "1 格：第一项里只有正文");
});

testCase("⚠️ 那一格不够时**不只是「不成列表」**：编号会被重排（`1.` → `11.`）", () => {
  equal(roundtrip("10. aaa\n  1. ccc"), "10. aaa\n11. ccc\n", "同级项按 start 顺排");
});

/* ── 二、缩进**不在文档树里**（所以"改 content 表达式"这条路够不着）──── */

group("二、缩进不是文档树里的量：同一棵树、两种缩进");

testCase("`1. aaa` 接 2 格与接 3 格的 **`bbb` 解析出同一棵树**", () => {
  const two = parse("1. aaa\n  bbb");
  const three = parse("1. aaa\n   bbb");
  equal(treeShape(two), treeShape(three), "2 格与 3 格在树里长得一模一样");
  equal(
    treeShape(two),
    [
      "doc",
      "  ordered_list",
      "    list_item",
      "      paragraph",
      '        text("aaa\\nbbb")',
    ].join("\n"),
    "续行是**同一个段落里的一个换行**，不是第二个块",
  );
});

testCase("`list_item` 的 content 表达式里没有「缩到第几格」这个量", () => {
  equal(schema.nodes.list_item.spec.content, "paragraph block*", "照 `preset-commonmark` 抄的那一句");
  equal(schema.nodes.list_item.spec.attrs?.indent, undefined, "没有 `indent` 这个属性");
  equal(schema.nodes.doc.spec.content, "block+", "文档那一层也没有");
});

testCase("⚠️ 所以 Nota 在「续行」这一例上比 Typora 严格档**宽松**：`bbb` 不掉出列表", () => {
  // Typora 严格档说 2 格的那一行"不在同一列表里"；Nota 这里是同一段落的一部分
  // （CommonMark 的 lazy continuation）。事实如实钉住，**不修**——理由在文件头。
  equal(firstBlock(parse("1. aaa\n  bbb")).childCount, 1, "还是一个项");
  equal(firstBlock(parse("1. aaa\n  bbb")).child(0).childCount, 1, "项里还只有一块");
});

/* ── 三、序列化：缩进 = **内容首列**，不是标记宽度 ──────────────────── */

group("三、序列化那一侧：子块缩到**内容首列**（标记宽度 ＋ 1），不是标记宽度");

/** 手造一棵"某一项里挂着子列表"的真文档，`order` 就是那一层的编号。 */
function create2(order: number): PMNode {
  return schema.node("doc", null, [
    schema.node("ordered_list", { order, spread: false }, [
      schema.node("list_item", { spread: false, listType: "ordered", label: `${order}.` }, [
        schema.node("paragraph", null, [schema.text("aaa")]),
        schema.node("ordered_list", { order: 1, spread: false }, [
          schema.node("list_item", { spread: false, listType: "ordered", label: "1." }, [
            schema.node("paragraph", null, [schema.text("ccc")]),
          ]),
        ]),
      ]),
    ]),
  ]);
}

testCase("`1.` 那一档：标记 2 格宽，子块缩 **3** 格", () => {
  equal(serialize(create2(1)), "1. aaa\n   1. ccc\n", "3 = 「1. 」那一列的下一格");
});

testCase("`10.` 那一档：标记 3 格宽，子块缩 **4** 格（⚠️ 不是 3）", () => {
  equal(serialize(create2(10)), "10. aaa\n    1. ccc\n", "4 = 「10. 」的内容首列");
});

testCase("`100.` 那一档：标记 4 格宽，子块缩 **5** 格（⚠️ 不是 4）", () => {
  equal(serialize(create2(100)), "100. aaa\n     1. ccc\n", "5 = 「100. 」的内容首列");
});

/* ── 四、往返：逐字节不变的那两条 ＋ 改字的那三条（第 56 项那一族）──── */

group("四、打开再存：哪些逐字节不变、哪些会改字");

testCase("✅ 对齐到内容首列的那两条：**逐字节不变**", () => {
  equal(roundtrip("10. aaa\n    1. ccc\n"), "10. aaa\n    1. ccc\n", "4 格进、4 格出");
  equal(roundtrip("- aaa\n  - bbb\n"), "- aaa\n  - bbb\n", "2 格进、2 格出");
});

testCase("⚠️ 改字①：`1. aaa` ＋ 2 格续行 ⇒ 出 3 格", () => {
  equal(roundtrip("1. aaa\n  bbb\n"), "1. aaa\n   bbb\n", "对齐到内容首列（3）");
});

testCase("⚠️ 改字②：`10. aaa` ＋ 2 格续行 ⇒ 出 4 格", () => {
  equal(roundtrip("10. aaa\n  正文\n"), "10. aaa\n    正文\n", "对齐到内容首列（4）");
});

testCase("⚠️ 改字③：`10. aaa` ＋ 2 格 `1. ccc` ⇒ 那一行成了 `11. ccc`", () => {
  // 这三种都归 `docs/07` 第 56 项那一族（「打开再存，字节变了」的遗留四条）。
  // 根只有一个：**缩进不存，是序列化算出来的**。
  equal(roundtrip("10. aaa\n  1. ccc\n"), "10. aaa\n11. ccc\n", "同级项顺排");
});

/* ── 五、结构性证据：`strict` 没有一处接到列表 / 缩进 ────────────────── */

group("五、为什么没有第二个开关：`assemble.ts` 里 `strict` 就没往这一族接");

/**
 * ⚠️ 这一组量的是**源码文本**，不是把 `createEditor` 跑起来（那要建整个
 * `Editor` ＋ 真 DOM）。判据是"`strict` 出现的每一行分别管什么"——
 * `math-currency.test.ts` 第六组也是这个做法（量 `.use()` 的先后）。
 *
 * ⚠️ 与那条测试一样，这份测试跑之前**必须先 `cd <仓库>`**（`process.cwd()`）。
 */
// ⚠️ 2026-10-07：读的文件从 `create.ts` 换成了 `assemble.ts`——`.use(标题回车成块(strict))`
//    那一整段装配搬去了那边（`docs/07` 第 89 项），判据跟着它走。
const createSource = readFileSync(resolve(process.cwd(), "src/editor/assemble.ts"), "utf8");
const containsstrictOfLine = createSource
  .split("\n")
  .map((line3, i) => [i + 1, line3] as const)
  .filter(([, line3]) => /strict/i.test(line3));

testCase("`strict` 确实在 `assemble.ts` 里被用着（不然这一组就是空转）", () => {
  const hasMarkTitleOf = containsstrictOfLine.filter(([, line3]) =>
    line3.includes("markTitleReturnCarBecomeBlock"),
  );
  if (hasMarkTitleOf.length === 0) {
    throw new Error("没找到 `.use(markTitleReturnCarBecomeBlock(strict))`——这一组的判据失效了");
  }
});

testCase("⚠️ 没有一行同时提到 `strict` 与列表 / 缩进（所以没有「第二个开关」）", () => {
  const wiring = containsstrictOfLine.filter(([, line3]) =>
    /(indent|list_item|bullet_list|ordered_list)/.test(line3),
  );
  // ⚠️ 数组不能直接喂 `等`（两个空数组也不 `===`），比 JSON 串。
  equal(
    JSON.stringify(wiring.map(([number, line3]) => `${number}: ${line3.trim()}`)),
    "[]",
    "`strict` 的落点只该有标题那几处",
  );
});

/* ── 收尾 ─────────────────────────────────────────────────────────────── */

console.log(`\n${pass} 过 / ${fail} 败`);
if (fail > 0) {
  console.log("不过的：");
  for (const name3 of failed) console.log(`  - ${name3}`);
  process.exit(1);
}
