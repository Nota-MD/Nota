/**
 * `src/editor/footnote.ts`（脚注的编号分配 ＋ 插入事务）的**可运行**测试集。
 * 2026-09-27 写，与那个文件同批落地。
 *
 * # 跑法（不装任何包：`esbuild` 与 `node` 仓库里都现成）
 *
 * ```sh
 * cd <仓库>
 * npx esbuild tests/footnote.test.ts --bundle --platform=node --format=esm \
 *   --outfile=/tmp/nota-测试/footnote.mjs
 * node /tmp/nota-测试/footnote.mjs
 * ```
 *
 * ⚠️ **esbuild 报错时旧 bundle 还在**，`node` 跑出来的是上一版结果。先看
 * esbuild 那行有没有 `error`（`inline-marks.test.ts` 的文件头记过这个坑）。
 *
 * # 这份测试盯的是什么
 *
 * 脚注这一格**不缺节点**——`footnote_reference` / `footnote_definition` 是
 * `preset-gfm` 给的，解析与序列化都是上游的。缺的是"从零插一条"，所以判据分三层：
 *
 * - **一、编号分配**（纯函数）：最小未用、删过之后补洞、非数字标签只占位；
 * - **二、往返**：真 `unified()` ＋ 真 `ParserState`/`SerializerState` ＋ 真
 *   schema，判据是**「打开再存，字节不变」**；
 * - **三、插入事务**：真 `EditorState` ＋ 真事务，验**文档树**变成了什么样
 *   （引用插在光标处、定义落在文末、定义里有一个空段落、光标在定义里），
 *   以及**插完取出来的 markdown**是不是 `[^1]` 而不是六个字面字符。
 *
 * # ⚠️ 这份测试**证明不了**什么
 *
 * - **真编辑器的 schema 没验**（这里 `doc`/`paragraph`/`text`/那两颗脚注节点是
 *   手搓的最小版，少了标题、列表、引用、表格那一堆）。所以"**与别的块混排**"
 *   只测了段落这一种；`脚注事务` 拿真 schema 跑也不在这里。
 * - **`toDOM` 没验**：一颗 DOM 都没有，所以"角标画成上标、定义画成小一号"
 *   是 CSS 的事（`src/styles/editor.css` 的「脚注」那一节）。
 * - **DOM 点击跳转没验**：位置查找这一半在这里验；真点击事件仍要开窗。
 * - **源码模式那条路没验**：`src/editor/source.ts` 的 `case "footnote"` 动的是
 *   纯文本，与这里的事务是两套实现——它只共用**编号分配**（`扫源文标签` ＋
 *   `下一个脚注标签`），那两样在第一组里验了。
 */

import { Schema } from "@milkdown/kit/prose/model";
import type { Node as PMNode } from "@milkdown/kit/prose/model";
import { EditorState, TextSelection } from "@milkdown/kit/prose/state";
import { ParserState, SerializerState } from "@milkdown/kit/transformer";
import type { MarkdownNode } from "@milkdown/kit/transformer";
import remarkGfm from "remark-gfm";
import remarkParse from "remark-parse";
import remarkStringify from "remark-stringify";
import { unified } from "unified";

import {
  belowValueItemFootNoteLabel,
  scanFootNoteLabel,
  scanSourceTextLabel,
  footNoteTransaction,
  footNoteFixedMeaningName,
  footNoteReferenceUseName,
  footnotePosition,
} from "../src/editor/footnote";

/* ── 最小工装 ─────────────────────────────────────────────────────────── */

let passed = 0;
let failure = 0;
const failureList: string[] = [];
let currentGroup = "";

function group(name3: string): void {
  currentGroup = name3;
  console.log(`\n── ${name3} ${"─".repeat(Math.max(0, 56 - name3.length))}`);
}

function testCase(name: string, body3: () => void): void {
  try {
    body3();
    passed++;
    console.log(`  ✔ ${name}`);
  } catch (e) {
    failure++;
    failureList.push(`${currentGroup} / ${name}`);
    console.log(`  ✘ ${name}`);
    console.log(`      ${e instanceof Error ? e.message : String(e)}`);
  }
}

function equal(actual: unknown, expected: unknown, description: string): void {
  const a = JSON.stringify(actual);
  const b = JSON.stringify(expected);
  if (a !== b) throw new Error(`${description}：期望 ${b}，实际 ${a}`);
}

function assertValue(value2: boolean, description: string): void {
  if (!value2) throw new Error(description);
}

/* ── schema：**形状与 preset-gfm 那两颗逐条对齐**（少了别的块）────────── */

/**
 * ⚠️ 那两颗脚注节点的 `group` / `inline` / `atom` / `content` / `defining` / `attrs`
 * 是**照抄** `preset-gfm/lib/index.js:688`（定义）与 `:743`（引用）的，一个字
 * 没改——`脚注事务` 靠 `state.schema.nodes[…]` 现取，形状不对的话"能不能插"
 * 这件事在这里验不出真结果。
 *
 * ⚠️ `code_block` 是**为了验那条守卫**才放进来的（`脚注事务` 在代码块里返回
 * `null`），它的形状抄的是 `preset-commonmark` 那份（`content: "text*"`）。
 */
const schema = new Schema({
  nodes: {
    doc: {
      content: "block+",
      parseMarkdown: {
        match: ({ type }: MarkdownNode) => type === "root",
        runner: (state: ParserState, node: MarkdownNode, type: unknown) =>
          state.injectRoot(node, type as never),
      },
      toMarkdown: {
        match: (node: PMNode) => node.type.name === "doc",
        /**
         * ⚠️ **这里不许有 `closeNode()`**（`root` 那一层归
         * `SerializerState.build()` 自己收）——`html-block.test.ts` 里记着这条
         * 踩过的坑：自己收一次会让**每一条往返**都抛
         * `Stack over flow, cannot pop on an empty stack.`，而产品代码没毛病。
         */
        runner: (state: SerializerState, node: PMNode) => {
          state.openNode("root");
          state.next(node.content);
        },
      },
    },
    paragraph: {
      content: "inline*",
      group: "block",
      parseMarkdown: {
        match: ({ type }: MarkdownNode) => type === "paragraph",
        runner: (state: ParserState, node: MarkdownNode, type: unknown) => {
          state.openNode(type as never);
          state.next(node.children);
          state.closeNode();
        },
      },
      toMarkdown: {
        match: (node: PMNode) => node.type.name === "paragraph",
        runner: (state: SerializerState, node: PMNode) => {
          state.openNode("paragraph");
          state.next(node.content);
          state.closeNode();
        },
      },
    },
    /** 定义：`group:"block"` ＋ `content:"block+"` ＋ `defining`。 */
    [footNoteFixedMeaningName]: {
      group: "block",
      content: "block+",
      defining: true,
      attrs: { label: { default: "" } },
      parseMarkdown: {
        match: ({ type }: MarkdownNode) => type === "footnoteDefinition",
        runner: (state: ParserState, node: MarkdownNode, type: unknown) => {
          state.openNode(type as never, { label: node.label }).next(node.children).closeNode();
        },
      },
      toMarkdown: {
        match: (node: PMNode) => node.type.name === footNoteFixedMeaningName,
        runner: (state: SerializerState, node: PMNode) => {
          state
            .openNode("footnoteDefinition", undefined, {
              label: node.attrs.label,
              identifier: node.attrs.label,
            })
            .next(node.content)
            .closeNode();
        },
      },
    },
    /** 引用：行内 ＋ 原子。 */
    [footNoteReferenceUseName]: {
      group: "inline",
      inline: true,
      atom: true,
      attrs: { label: { default: "" } },
      parseMarkdown: {
        match: ({ type }: MarkdownNode) => type === "footnoteReference",
        runner: (state: ParserState, node: MarkdownNode, type: unknown) =>
          state.addNode(type as never, { label: node.label }),
      },
      toMarkdown: {
        match: (node: PMNode) => node.type.name === footNoteReferenceUseName,
        runner: (state: SerializerState, node: PMNode) => {
          state.addNode("footnoteReference", undefined, undefined, {
            label: node.attrs.label,
            identifier: node.attrs.label,
          });
        },
      },
    },
    /** 只为验守卫而存在：`脚注事务` 在它里面必须给 `null`。 */
    code_block: {
      content: "text*",
      group: "block",
      code: true,
      attrs: { language: { default: "" } },
      parseMarkdown: {
        match: ({ type }: MarkdownNode) => type === "code",
        runner: (state: ParserState, node: MarkdownNode, type: unknown) => {
          state.openNode(type as never, { language: node.lang ?? "" });
          state.addText(String(node.value ?? ""));
          state.closeNode();
        },
      },
      toMarkdown: {
        match: (node: PMNode) => node.type.name === "code_block",
        runner: (state: SerializerState, node: PMNode) => {
          state.openNode("code", undefined, { lang: node.attrs.language });
          state.next(node.content);
          state.closeNode();
        },
      },
    },
    text: {
      group: "inline",
      parseMarkdown: {
        match: ({ type }: MarkdownNode) => type === "text",
        runner: (state: ParserState, node: MarkdownNode) => state.addText(node.value as string),
      },
      toMarkdown: {
        match: (node: PMNode) => node.type.name === "text",
        runner: (state: SerializerState, node: PMNode) =>
          state.addNode("text", undefined, node.text as string),
      },
    },
  },
  marks: {},
});

/**
 * 一台真处理机：`remark-parse` ＋ **`remark-gfm`**（脚注是 GFM 的东西，
 * 不挂它的话 `[^1]` 只是普通文字）＋ `remark-stringify` ＋ **`remark-gfm` 再来一次**
 * ——最后那一次是给**序列化**用的（`mdast-util-to-markdown` 靠它才知道
 * `footnoteDefinition` 该写成 `[^1]: `）。
 */
function createPlaceManageMachine() {
  return unified().use(remarkParse).use(remarkGfm).use(remarkStringify).use(remarkGfm);
}

/** 一整趟：markdown → 文档 → markdown。两个方向都是真代码。 */
function roundtrip(source3: string): string {
  const machine = createPlaceManageMachine();
  return SerializerState.create(schema, machine)(ParserState.create(schema, machine)(source3));
}

/** 把一棵 PM 文档树写回 markdown。 */
function writeReturn(doc: PMNode): string {
  return SerializerState.create(schema, createPlaceManageMachine())(doc);
}

/** 只解析：markdown → ProseMirror 文档。 */
function createDocument(source3: string): PMNode {
  return ParserState.create(schema, createPlaceManageMachine())(source3);
}

/** 一份光标停在**文档开头**的编辑器状态（`atStart` 落在第一段段内第 1 个位置）。 */
function createState2(source3: string): EditorState {
  return EditorState.create({ schema, doc: createDocument(source3) });
}

/** 文档树的紧凑长相，断言用（比 JSON 好读）。 */
function tree(doc: PMNode): string {
  const draw = (node: PMNode): string => {
    if (node.isText) return JSON.stringify(node.text);
    const head2 = node.type.name + (node.attrs.label ? `<${node.attrs.label}>` : "");
    if (!node.childCount) return head2;
    return `${head2}(${node.content.content.map(draw).join(", ")})`;
  };
  return doc.content.content.map(draw).join(", ");
}

/* ── 一、编号分配 ─────────────────────────────────────────────────────── */

group("编号分配：最小未用正整数");

testCase("空文档 → 1", () => equal(belowValueItemFootNoteLabel([]), "1", "第一条"));

testCase("1 用过了 → 2", () => equal(belowValueItemFootNoteLabel(["1"]), "2", "顺延"));

testCase("连着三条 → 4", () => equal(belowValueItemFootNoteLabel(["1", "2", "3"]), "4", "顺延"));

testCase("⚠️ 删过第二条（1、3 在）→ 2，不是 4", () =>
  equal(belowValueItemFootNoteLabel(["1", "3"]), "2", "补洞"));

testCase("⚠️ 非数字标签只占位、不参与计数", () =>
  equal(belowValueItemFootNoteLabel(["note", "参考"]), "1", "`[^note]` 存在时下一条仍是 1"));

testCase("非数字标签也不会被撞上", () => equal(belowValueItemFootNoteLabel(["1", "note"]), "2", "跳过 1"));

testCase("重复的标签不影响答案（Set 收口）", () =>
  equal(belowValueItemFootNoteLabel(["1", "1", "1"]), "2", "去重后仍是 2"));

group("源文扫描：引用与定义都算");

testCase("引用与定义各一条 → 两个（不去重）", () =>
  equal(scanSourceTextLabel("甲[^1]乙\n\n[^1]: 这是注\n"), ["1", "1"], "不去重"));

testCase("命名标签也认", () =>
  equal(scanSourceTextLabel("甲[^goo]乙\n\n[^goo]: 注\n"), ["goo", "goo"], "`[^goo]`"));

testCase("⚠️ 标签里有空白的不算脚注", () =>
  equal(scanSourceTextLabel("甲[^goo bar]乙\n"), [], "`[^goo bar]` 是普通方括号文字"));

testCase("没有脚注 → 空", () => equal(scanSourceTextLabel("甲[1]乙\n"), [], "普通方括号"));

/* ── 二、往返：这一格真正的地基 ───────────────────────────────────────── */

group("往返：打开再存，字节不变");

testCase("引用 ＋ 文末定义", () =>
  equal(roundtrip("甲[^1]乙\n\n[^1]: 这是注\n"), "甲[^1]乙\n\n[^1]: 这是注\n", "来回一趟"));

testCase("命名标签", () =>
  equal(roundtrip("甲[^goo]乙\n\n[^goo]: 注\n"), "甲[^goo]乙\n\n[^goo]: 注\n", "来回一趟"));

testCase("⚠️ 定义排在引用**前面**也照旧（markdown 允许任意位置）", () =>
  equal(
    roundtrip("[^1]: 注一\n\n甲[^1]乙[^2]丙\n\n[^2]: 注二\n"),
    "[^1]: 注一\n\n甲[^1]乙[^2]丙\n\n[^2]: 注二\n",
    "来回一趟",
  ));

testCase("⚠️ 空的定义不炸解析（milkdown 会用空段落兜住）", () =>
  equal(
    tree(createDocument("甲[^1]乙\n\n[^1]:\n")),
    'paragraph("甲", footnote_reference<1>, "乙"), footnote_definition<1>(paragraph)',
    "文档树",
  ));

testCase("⚠️ 空定义存回去会多一个尾随空格（上游如此，如实记着）", () =>
  equal(roundtrip("甲[^1]乙\n\n[^1]:\n"), "甲[^1]乙\n\n[^1]: \n", "差一个字节"));

group("扫脚注标签：从文档树上捞");

testCase("引用与定义各一条 → 两个", () =>
  equal(scanFootNoteLabel(createDocument("甲[^1]乙\n\n[^1]: 注\n")), ["1", "1"], "不去重"));

testCase("空定义也数得到（标签在 definition 上，不在它里面）", () =>
  equal(scanFootNoteLabel(createDocument("甲[^7]乙\n\n[^7]:\n")), ["7", "7"], "引用的 7 ＋ 定义的 7"));

/* ── 三、插入事务：真 EditorState ＋ 真事务 ───────────────────────────── */

group("插入事务：引用插在光标处、定义补在文末");

testCase("从空段落（光标在开头）插一条", () =>
  equal(
    tree(footNoteTransaction(createState2("正文\n"))!.doc),
    'paragraph(footnote_reference<1>, "正文"), footnote_definition<1>(paragraph)',
    "文档树",
  ));

testCase("⚠️ 引用落在**光标处**，不是文末", () => {
  const document = createDocument("甲乙丙\n");
  // 2 = 第一段段内第 2 个位置（"甲" 之后）。
  const state = EditorState.create({ schema, doc: document, selection: TextSelection.create(document, 2) });
  equal(
    tree(footNoteTransaction(state)!.doc),
    'paragraph("甲", footnote_reference<1>, "乙丙"), footnote_definition<1>(paragraph)',
    "引用在 甲 与 乙 之间",
  );
});

testCase("⚠️ 选区被引用**换掉**（选中一段字再插）", () => {
  const document = createDocument("甲乙丙\n");
  const state = EditorState.create({ schema, doc: document, selection: TextSelection.create(document, 2, 4) });
  equal(
    tree(footNoteTransaction(state)!.doc),
    'paragraph("甲", footnote_reference<1>), footnote_definition<1>(paragraph)',
    "乙丙 被换掉",
  );
});

testCase("⚠️ 已有 `[^1]` 时下一条叫 2", () =>
  equal(
    tree(footNoteTransaction(createState2("甲[^1]乙\n\n[^1]: 注一\n"))!.doc),
    // 光标在段首，所以**新的那条 2 排在最前**——编号是按"最小未用"取的，
    // 与插在哪儿无关。这正是这一条要验的：已有 1 的时候下一条得叫 2。
    'paragraph(footnote_reference<2>, "甲", footnote_reference<1>, "乙"), footnote_definition<1>(paragraph("注一")), footnote_definition<2>(paragraph)',
    "新那条叫 2",
  ));

testCase("定义里那个段落是空的（等着用户打字）", () => {
  const fixedMeaning = footNoteTransaction(createState2("正文\n"))!.doc.lastChild!;
  equal(fixedMeaning.type.name, footNoteFixedMeaningName, "最后一个是定义");
  equal(fixedMeaning.childCount, 1, "一条子节点");
  equal(fixedMeaning.firstChild!.type.name, "paragraph", "是段落");
  equal(fixedMeaning.firstChild!.content.size, 0, "空段落");
});

testCase("定义带 label，且与引用一致", () => {
  const newTextLevel = footNoteTransaction(createState2("正文\n"))!.doc;
  equal(newTextLevel.lastChild!.attrs.label, "1", "定义的 label");
  equal(newTextLevel.firstChild!.child(0).type.name, footNoteReferenceUseName, "引用节点");
  equal(newTextLevel.firstChild!.child(0).attrs.label, "1", "引用的 label");
});

testCase("光标落进定义那个空段落里（用户接着就打在这儿）", () => {
  const tr = footNoteTransaction(createState2("正文\n"))!;
  equal(tr.selection.from, tr.doc.content.size - 2, "光标位置（定义末尾往前两格）");
  const chain: string[] = [];
  for (let d = tr.selection.$from.depth; d > 0; d--) chain.push(tr.selection.$from.node(d).type.name);
  assertValue(chain.includes(footNoteFixedMeaningName), `光标应当在定义里，实际父链 ${JSON.stringify(chain)}`);
});

testCase("连插两条 → 1 与 2（⚠️ 第二条引用嵌在**第一条定义里**）", () => {
  const ordinalOnce = footNoteTransaction(createState2("正文\n"))!;
  const ordinalTwoCount = footNoteTransaction(
    EditorState.create({ schema, doc: ordinalOnce.doc, selection: ordinalOnce.selection }),
  )!;
  // ⚠️ 这不是 bug，是"光标在哪儿就插哪儿"的直接后果：第一次插完光标落在第一条
  // 定义的空段落里，所以第二次的引用就落在那儿。想插在正文里，得先把光标挪回
  // 正文再点菜单——**没有为它做特判**（"光标在定义里就改插到正文去"那种规则
  // 会在用户真想嵌一条引用时帮倒忙，而且和所有别的插入命令的口径不一致）。
  equal(
    tree(ordinalTwoCount.doc),
    'paragraph(footnote_reference<1>, "正文"), footnote_definition<1>(paragraph(footnote_reference<2>)), footnote_definition<2>(paragraph)',
    "文档树",
  );
});

testCase("⚠️ 插完取出来的 markdown 真是脚注（不是六个字面字符）", () => {
  const source3 = writeReturn(footNoteTransaction(createState2("正文\n"))!.doc);
  equal(source3, "[^1]正文\n\n[^1]: \n", "存出来的字节");
  equal(roundtrip(source3), source3, "存出来再打开再存，仍然一样");
});

testCase("⚠️ 定义里写上一句之后，取出来是 `[^1]: 说明`", () => {
  const tr = footNoteTransaction(createState2("正文\n"))!;
  // 往那个空段落里塞一句话：光标已经在里面（`tr.selection.from`）。
  tr.insertText("说明", tr.selection.from);
  equal(writeReturn(tr.doc), "[^1]正文\n\n[^1]: 说明\n", "存出来的字节");
});

/** 一份**没有**那两颗脚注节点的最小 schema（＝没挂 gfm 的编辑器）。 */
const withoutFootNoteschema = new Schema({
  nodes: {
    doc: { content: "block+" },
    paragraph: { content: "inline*", group: "block" },
    text: { group: "inline" },
  },
  marks: {},
});

const withoutFootNoteDocument = withoutFootNoteschema.nodes.doc!.create(null, [withoutFootNoteschema.nodes.paragraph!.create()]);

group("做不了的时候要**说得出来**（返回 null，不抛）");

testCase("按 label 能找到引用与定义的位置，供双向跳转使用", () => {
  const document = createDocument("[^a] 正文\n\n[^a]: 说明\n");
  assertValue(
    footnotePosition(document, footNoteReferenceUseName, "a") !== null,
    "找不到引用位置",
  );
  assertValue(
    footnotePosition(document, footNoteFixedMeaningName, "a") !== null,
    "找不到定义位置",
  );
  equal(
    footnotePosition(document, footNoteReferenceUseName, "missing"),
    null,
    "不存在的 label 应给 null",
  );
});

testCase("⚠️ 光标在代码块里 → null（`code_block` 的 content 是 `text*`，插不进去）", () => {
  const document = createDocument("```\n甲\n```\n");
  equal(tree(document), 'code_block("甲")', "先确认真造出了代码块");
  const state = EditorState.create({ schema, doc: document, selection: TextSelection.create(document, 2) });
  equal(footNoteTransaction(state), null, "返回 null");
});

testCase("schema 里没有那两颗节点（没挂 gfm）→ null", () =>
  equal(footNoteTransaction(EditorState.create({ schema: withoutFootNoteschema, doc: withoutFootNoteDocument })), null, "返回 null"));
/* ── 收尾 ─────────────────────────────────────────────────────────────── */

console.log(`\n${"═".repeat(60)}`);
console.log(`通过 ${passed} 条，失败 ${failure} 条`);
if (failure) {
  console.log("失败清单：");
  for (const name3 of failureList) console.log(`  · ${name3}`);
  process.exitCode = 1;
}
