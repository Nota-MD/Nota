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
 * - **跳转没验**：它压根没做（见那个文件头的第 2 条边界）。
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
  下一个脚注标签,
  扫脚注标签,
  扫源文标签,
  脚注事务,
  脚注定义名,
  脚注引用名,
} from "../src/editor/footnote";

/* ── 最小工装 ─────────────────────────────────────────────────────────── */

let 通过 = 0;
let 失败 = 0;
const 失败清单: string[] = [];
let 当前组 = "";

function 组(名: string): void {
  当前组 = 名;
  console.log(`\n── ${名} ${"─".repeat(Math.max(0, 56 - 名.length))}`);
}

function 测(名称: string, 体: () => void): void {
  try {
    体();
    通过++;
    console.log(`  ✔ ${名称}`);
  } catch (e) {
    失败++;
    失败清单.push(`${当前组} / ${名称}`);
    console.log(`  ✘ ${名称}`);
    console.log(`      ${e instanceof Error ? e.message : String(e)}`);
  }
}

function 等(实际: unknown, 期望: unknown, 说明: string): void {
  const a = JSON.stringify(实际);
  const b = JSON.stringify(期望);
  if (a !== b) throw new Error(`${说明}：期望 ${b}，实际 ${a}`);
}

function 真(值: boolean, 说明: string): void {
  if (!值) throw new Error(说明);
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
    [脚注定义名]: {
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
        match: (node: PMNode) => node.type.name === 脚注定义名,
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
    [脚注引用名]: {
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
        match: (node: PMNode) => node.type.name === 脚注引用名,
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
function 造处理机() {
  return unified().use(remarkParse).use(remarkGfm).use(remarkStringify).use(remarkGfm);
}

/** 一整趟：markdown → 文档 → markdown。两个方向都是真代码。 */
function 往返(源: string): string {
  const 机 = 造处理机();
  return SerializerState.create(schema, 机)(ParserState.create(schema, 机)(源));
}

/** 把一棵 PM 文档树写回 markdown。 */
function 写回(doc: PMNode): string {
  return SerializerState.create(schema, 造处理机())(doc);
}

/** 只解析：markdown → ProseMirror 文档。 */
function 造文档(源: string): PMNode {
  return ParserState.create(schema, 造处理机())(源);
}

/** 一份光标停在**文档开头**的编辑器状态（`atStart` 落在第一段段内第 1 个位置）。 */
function 造状态(源: string): EditorState {
  return EditorState.create({ schema, doc: 造文档(源) });
}

/** 文档树的紧凑长相，断言用（比 JSON 好读）。 */
function 树(doc: PMNode): string {
  const 画 = (节点: PMNode): string => {
    if (节点.isText) return JSON.stringify(节点.text);
    const 头 = 节点.type.name + (节点.attrs.label ? `<${节点.attrs.label}>` : "");
    if (!节点.childCount) return 头;
    return `${头}(${节点.content.content.map(画).join(", ")})`;
  };
  return doc.content.content.map(画).join(", ");
}

/* ── 一、编号分配 ─────────────────────────────────────────────────────── */

组("编号分配：最小未用正整数");

测("空文档 → 1", () => 等(下一个脚注标签([]), "1", "第一条"));

测("1 用过了 → 2", () => 等(下一个脚注标签(["1"]), "2", "顺延"));

测("连着三条 → 4", () => 等(下一个脚注标签(["1", "2", "3"]), "4", "顺延"));

测("⚠️ 删过第二条（1、3 在）→ 2，不是 4", () =>
  等(下一个脚注标签(["1", "3"]), "2", "补洞"));

测("⚠️ 非数字标签只占位、不参与计数", () =>
  等(下一个脚注标签(["note", "参考"]), "1", "`[^note]` 存在时下一条仍是 1"));

测("非数字标签也不会被撞上", () => 等(下一个脚注标签(["1", "note"]), "2", "跳过 1"));

测("重复的标签不影响答案（Set 收口）", () =>
  等(下一个脚注标签(["1", "1", "1"]), "2", "去重后仍是 2"));

组("源文扫描：引用与定义都算");

测("引用与定义各一条 → 两个（不去重）", () =>
  等(扫源文标签("甲[^1]乙\n\n[^1]: 这是注\n"), ["1", "1"], "不去重"));

测("命名标签也认", () =>
  等(扫源文标签("甲[^goo]乙\n\n[^goo]: 注\n"), ["goo", "goo"], "`[^goo]`"));

测("⚠️ 标签里有空白的不算脚注", () =>
  等(扫源文标签("甲[^goo bar]乙\n"), [], "`[^goo bar]` 是普通方括号文字"));

测("没有脚注 → 空", () => 等(扫源文标签("甲[1]乙\n"), [], "普通方括号"));

/* ── 二、往返：这一格真正的地基 ───────────────────────────────────────── */

组("往返：打开再存，字节不变");

测("引用 ＋ 文末定义", () =>
  等(往返("甲[^1]乙\n\n[^1]: 这是注\n"), "甲[^1]乙\n\n[^1]: 这是注\n", "来回一趟"));

测("命名标签", () =>
  等(往返("甲[^goo]乙\n\n[^goo]: 注\n"), "甲[^goo]乙\n\n[^goo]: 注\n", "来回一趟"));

测("⚠️ 定义排在引用**前面**也照旧（markdown 允许任意位置）", () =>
  等(
    往返("[^1]: 注一\n\n甲[^1]乙[^2]丙\n\n[^2]: 注二\n"),
    "[^1]: 注一\n\n甲[^1]乙[^2]丙\n\n[^2]: 注二\n",
    "来回一趟",
  ));

测("⚠️ 空的定义不炸解析（milkdown 会用空段落兜住）", () =>
  等(
    树(造文档("甲[^1]乙\n\n[^1]:\n")),
    'paragraph("甲", footnote_reference<1>, "乙"), footnote_definition<1>(paragraph)',
    "文档树",
  ));

测("⚠️ 空定义存回去会多一个尾随空格（上游如此，如实记着）", () =>
  等(往返("甲[^1]乙\n\n[^1]:\n"), "甲[^1]乙\n\n[^1]: \n", "差一个字节"));

组("扫脚注标签：从文档树上捞");

测("引用与定义各一条 → 两个", () =>
  等(扫脚注标签(造文档("甲[^1]乙\n\n[^1]: 注\n")), ["1", "1"], "不去重"));

测("空定义也数得到（标签在 definition 上，不在它里面）", () =>
  等(扫脚注标签(造文档("甲[^7]乙\n\n[^7]:\n")), ["7", "7"], "引用的 7 ＋ 定义的 7"));

/* ── 三、插入事务：真 EditorState ＋ 真事务 ───────────────────────────── */

组("插入事务：引用插在光标处、定义补在文末");

测("从空段落（光标在开头）插一条", () =>
  等(
    树(脚注事务(造状态("正文\n"))!.doc),
    'paragraph(footnote_reference<1>, "正文"), footnote_definition<1>(paragraph)',
    "文档树",
  ));

测("⚠️ 引用落在**光标处**，不是文末", () => {
  const 文档 = 造文档("甲乙丙\n");
  // 2 = 第一段段内第 2 个位置（"甲" 之后）。
  const 状态 = EditorState.create({ schema, doc: 文档, selection: TextSelection.create(文档, 2) });
  等(
    树(脚注事务(状态)!.doc),
    'paragraph("甲", footnote_reference<1>, "乙丙"), footnote_definition<1>(paragraph)',
    "引用在 甲 与 乙 之间",
  );
});

测("⚠️ 选区被引用**换掉**（选中一段字再插）", () => {
  const 文档 = 造文档("甲乙丙\n");
  const 状态 = EditorState.create({ schema, doc: 文档, selection: TextSelection.create(文档, 2, 4) });
  等(
    树(脚注事务(状态)!.doc),
    'paragraph("甲", footnote_reference<1>), footnote_definition<1>(paragraph)',
    "乙丙 被换掉",
  );
});

测("⚠️ 已有 `[^1]` 时下一条叫 2", () =>
  等(
    树(脚注事务(造状态("甲[^1]乙\n\n[^1]: 注一\n"))!.doc),
    // 光标在段首，所以**新的那条 2 排在最前**——编号是按"最小未用"取的，
    // 与插在哪儿无关。这正是这一条要验的：已有 1 的时候下一条得叫 2。
    'paragraph(footnote_reference<2>, "甲", footnote_reference<1>, "乙"), footnote_definition<1>(paragraph("注一")), footnote_definition<2>(paragraph)',
    "新那条叫 2",
  ));

测("定义里那个段落是空的（等着用户打字）", () => {
  const 定义 = 脚注事务(造状态("正文\n"))!.doc.lastChild!;
  等(定义.type.name, 脚注定义名, "最后一个是定义");
  等(定义.childCount, 1, "一条子节点");
  等(定义.firstChild!.type.name, "paragraph", "是段落");
  等(定义.firstChild!.content.size, 0, "空段落");
});

测("定义带 label，且与引用一致", () => {
  const 新文档 = 脚注事务(造状态("正文\n"))!.doc;
  等(新文档.lastChild!.attrs.label, "1", "定义的 label");
  等(新文档.firstChild!.child(0).type.name, 脚注引用名, "引用节点");
  等(新文档.firstChild!.child(0).attrs.label, "1", "引用的 label");
});

测("光标落进定义那个空段落里（用户接着就打在这儿）", () => {
  const tr = 脚注事务(造状态("正文\n"))!;
  等(tr.selection.from, tr.doc.content.size - 2, "光标位置（定义末尾往前两格）");
  const 链: string[] = [];
  for (let d = tr.selection.$from.depth; d > 0; d--) 链.push(tr.selection.$from.node(d).type.name);
  真(链.includes(脚注定义名), `光标应当在定义里，实际父链 ${JSON.stringify(链)}`);
});

测("连插两条 → 1 与 2（⚠️ 第二条引用嵌在**第一条定义里**）", () => {
  const 第一次 = 脚注事务(造状态("正文\n"))!;
  const 第二次 = 脚注事务(
    EditorState.create({ schema, doc: 第一次.doc, selection: 第一次.selection }),
  )!;
  // ⚠️ 这不是 bug，是"光标在哪儿就插哪儿"的直接后果：第一次插完光标落在第一条
  // 定义的空段落里，所以第二次的引用就落在那儿。想插在正文里，得先把光标挪回
  // 正文再点菜单——**没有为它做特判**（"光标在定义里就改插到正文去"那种规则
  // 会在用户真想嵌一条引用时帮倒忙，而且和所有别的插入命令的口径不一致）。
  等(
    树(第二次.doc),
    'paragraph(footnote_reference<1>, "正文"), footnote_definition<1>(paragraph(footnote_reference<2>)), footnote_definition<2>(paragraph)',
    "文档树",
  );
});

测("⚠️ 插完取出来的 markdown 真是脚注（不是六个字面字符）", () => {
  const 源 = 写回(脚注事务(造状态("正文\n"))!.doc);
  等(源, "[^1]正文\n\n[^1]: \n", "存出来的字节");
  等(往返(源), 源, "存出来再打开再存，仍然一样");
});

测("⚠️ 定义里写上一句之后，取出来是 `[^1]: 说明`", () => {
  const tr = 脚注事务(造状态("正文\n"))!;
  // 往那个空段落里塞一句话：光标已经在里面（`tr.selection.from`）。
  tr.insertText("说明", tr.selection.from);
  等(写回(tr.doc), "[^1]正文\n\n[^1]: 说明\n", "存出来的字节");
});

/** 一份**没有**那两颗脚注节点的最小 schema（＝没挂 gfm 的编辑器）。 */
const 无脚注schema = new Schema({
  nodes: {
    doc: { content: "block+" },
    paragraph: { content: "inline*", group: "block" },
    text: { group: "inline" },
  },
  marks: {},
});

const 无脚注文档 = 无脚注schema.nodes.doc!.create(null, [无脚注schema.nodes.paragraph!.create()]);

组("做不了的时候要**说得出来**（返回 null，不抛）");

测("⚠️ 光标在代码块里 → null（`code_block` 的 content 是 `text*`，插不进去）", () => {
  const 文档 = 造文档("```\n甲\n```\n");
  等(树(文档), 'code_block("甲")', "先确认真造出了代码块");
  const 状态 = EditorState.create({ schema, doc: 文档, selection: TextSelection.create(文档, 2) });
  等(脚注事务(状态), null, "返回 null");
});

测("schema 里没有那两颗节点（没挂 gfm）→ null", () =>
  等(脚注事务(EditorState.create({ schema: 无脚注schema, doc: 无脚注文档 })), null, "返回 null"));
/* ── 收尾 ─────────────────────────────────────────────────────────────── */

console.log(`\n${"═".repeat(60)}`);
console.log(`通过 ${通过} 条，失败 ${失败} 条`);
if (失败) {
  console.log("失败清单：");
  for (const 名 of 失败清单) console.log(`  · ${名}`);
  process.exitCode = 1;
}
