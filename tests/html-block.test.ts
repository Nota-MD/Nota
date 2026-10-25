/**
 * `src/editor/html-block.ts`（块级裸 HTML ＋ HTML 注释）的**可运行**测试集。
 * 2026-09-27 写，与那个文件同批落地。
 *
 * # 跑法（不装任何包：`esbuild` 与 `node` 仓库里都现成）
 *
 * ```sh
 * cd <仓库>
 * npx esbuild tests/html-block.test.ts --bundle --platform=node --format=esm \
 *   --outfile=/tmp/nota-测试/html-block.mjs
 * node /tmp/nota-测试/html-block.mjs
 * ```
 *
 * ⚠️ **esbuild 报错时旧 bundle 还在**，`node` 跑出来的是上一版结果。先看
 * esbuild 那行有没有 `error`（`inline-marks.test.ts` 的文件头记过这个坑）。
 *
 * # 这份测试盯的是什么
 *
 * 这一颗节点存在的**唯一理由**是"块级 html 在 mdast 里是 root 的直属孩子，
 * 而 `doc.content` 是 `block+`，于是整篇文档打不开"（见那个文件头）。所以判据
 * 分两层：
 *
 * - **一、转换器**（纯函数）：哪些位置上的 `html` 该改写成自造类型、哪些**必须
 *   一个字节都不动**（行内那些还归 preset 的 `htmlSchema` 管，抢过来会让
 *   `甲<u>乙</u>丙` 变成三个块）；
 * - **二、往返**：真 `unified()` ＋ 真 `ParserState`/`SerializerState` ＋ 真
 *   schema，判据是**「打开再存，字节不变」**——`<div>x</div>` 存回去还得是
 *   `<div>x</div>`，注释存回去还得是注释。
 *
 * # ⚠️ 这份测试**证明不了**什么
 *
 * - **真编辑器的 schema 没验**（这里 `doc`/`paragraph`/`text` 是手搓的最小版，
 *   少了标题、列表、引用、表格那一堆）。所以"**与别的块混排**"只测了段落这一种。
 * - **"整篇打不开"那个原始 bug 没在这里重现**：重现它需要 preset 的
 *   `doc`/`htmlSchema` 与真 `Editor.make()`，而本仓没有 jsdom、也不许为这件事
 *   装包。**这一条只能在开窗目检里验**（`docs/06` §5 那一节的做法），
 *   测试里能证明的是"补齐之后那颗节点有地方放"。
 * - **`toDOM` 没验**：一颗 DOM 都没有，所以"画出来是不是灰底等宽"是 CSS 的事。
 */

import { Schema } from "@milkdown/kit/prose/model";
import type { Node as PMNode } from "@milkdown/kit/prose/model";
import { ParserState, SerializerState } from "@milkdown/kit/transformer";
import type { MarkdownNode } from "@milkdown/kit/transformer";
import remarkParse from "remark-parse";
import remarkStringify from "remark-stringify";
import { unified } from "unified";

import {
  blockHTMLConvertReplace,
  blockHtmlNodeName,
  blockHTMLSpec,
  blockLevelContainer,
  isNoteRelease,
} from "../src/editor/html-block";

/* ── 最小工装 ─────────────────────────────────────────────────────────── */

let passed = 0;
let failure = 0;
const failureList: string[] = [];
let currentGroup = "";

function group(name3: string): void {
  currentGroup = name3;
  console.log(`\n── ${name3} ${"─".repeat(Math.max(0, 56 - name3.length))}`);
}

function testCase(name3: string, body3: () => void): void {
  try {
    body3();
    passed++;
    console.log(`  ✔ ${name3}`);
  } catch (e) {
    failure++;
    failureList.push(`${currentGroup} / ${name3}`);
    console.log(`  ✘ ${name3}\n      ${(e as Error).message.split("\n").join("\n      ")}`);
  }
}

function equal<T>(actual2: T, period: T, description = ""): void {
  const a = JSON.stringify(actual2);
  const b = JSON.stringify(period);
  if (a !== b) throw new Error(`${description}\n      实际：${a}\n      期望：${b}`);
}

/**
 * 真 schema 的最小版：**块级那一颗是本文件要验的**，行内 `html` 那一颗是
 * preset 的 `htmlSchema` 的等价物（少了它，行内 HTML 会在解析那一步抛
 * "Cannot match target parser for node: html"——那是**工装**的局限，
 * 不是产品的行为）。
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
         * ⚠️ **这里不许有 `closeNode()`**。`root` 那一层是
         * `SerializerState.build()` 自己收的（`transformer/lib/index.js:364`：
         * `do doc = this.#closeNodeAndPush(); while (this.size())`）——
         * 只有它知道"整篇到底了"。自己收一次的话，栈先被收空，
         * `build()` 的第一趟 `close()` 就落在空栈上，抛
         * `Stack over flow, cannot pop on an empty stack.`
         * （**踩过**：2026-09-27，症状是每一条往返都炸，而产品代码没有毛病）。
         *
         * preset 的原版就是这么写的（`preset-commonmark/lib/index.js:424`），
         * 本文件与它逐字对齐。
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
    /** 被测的那一颗。**形状与 `html-block.ts` 里的 `块HTML规格` 逐条对应**。 */
    notaHtmlBlock: {
      group: "block",
      atom: true,
      attrs: { value: { default: "" } },
      parseMarkdown: {
        match: ({ type }: MarkdownNode) => type === blockHtmlNodeName,
        runner: (state: ParserState, node: MarkdownNode, type: unknown) =>
          state.addNode(type as never, { value: node.value ?? "" }),
      },
      toMarkdown: {
        match: (node: PMNode) => node.type.name === blockHtmlNodeName,
        runner: (state: SerializerState, node: PMNode) =>
          state.addNode("html", undefined, node.attrs.value as string),
      },
    },
    /** preset 的 `htmlSchema` 等价物（**行内**那一颗，本文件不该碰它）。 */
    html: {
      atom: true,
      group: "inline",
      inline: true,
      attrs: { value: { default: "" } },
      parseMarkdown: {
        match: ({ type }: MarkdownNode) => type === "html",
        runner: (state: ParserState, node: MarkdownNode, type: unknown) =>
          state.addNode(type as never, { value: node.value }),
      },
      toMarkdown: {
        match: (node: PMNode) => node.type.name === "html",
        runner: (state: SerializerState, node: PMNode) =>
          state.addNode("html", undefined, node.attrs.value as string),
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

/** 一台真处理机：`remark-parse` ＋ 本仓那个转换器，序列化走默认。 */
function createPlaceManageMachine() {
  return unified()
    .use(remarkParse)
    .use(() => (tree: unknown) => blockHTMLConvertReplace(tree as MarkdownNode))
    .use(remarkStringify);
}

/** 一整趟：markdown → 文档 → markdown。两个方向都是真代码。 */
function roundtrip(source3: string): string {
  const machine = createPlaceManageMachine();
  return SerializerState.create(schema, machine)(ParserState.create(schema, machine)(source3));
}

/**
 * 只跑解析那一趟，把 mdast 拿出来看。
 *
 * ⚠️ **`runSync`，不是裸 `parse`**：`块HTML转换` 是挂在这条链上的
 * **转换器**（`$remark`），而裸 `unified().parse()` **只解析、不跑转换器**——
 * 用它的话拿到的树里那颗节点还叫 `html`，断言会以为转换器没生效。
 * `ParserState.run` 里走的也正是 `remark.runSync(remark.parse(md), md)`
 * （`transformer/lib/index.js:159`），所以这是**与产品同一条**路子。
 * （**踩过**：2026-09-27，一度以为转换器写坏了。）
 */
function parse(source3: string): MarkdownNode {
  const machine = createPlaceManageMachine();
  return machine.runSync(machine.parse(source3), source3) as unknown as MarkdownNode;
}

/** 树里所有节点的类型名（深度优先）。 */
function types(tree: MarkdownNode): string[] {
  const output2: string[] = [];
  const walk = (node: MarkdownNode): void => {
    output2.push(node.type);
    const child = node.children;
    if (Array.isArray(child)) for (const value of child as MarkdownNode[]) walk(value);
  };
  walk(tree);
  return output2;
}

/* ── 一、`是注释`（纯函数）──────────────────────────────────────────────── */

group("一、`是注释`（纯函数：一段 HTML 是不是注释）");

testCase("HTML NodeView 的注册键在模块初始化时就是节点名", () => {
  equal(blockHTMLSpec.node.id, blockHtmlNodeName, "`$view` 不能拿到 undefined 键");
});

testCase("四种写法", () => {
  equal(isNoteRelease("<!-- x -->"), true, "标准写法");
  equal(isNoteRelease("<!-->"), true, "只认开头，不看结尾");
  equal(isNoteRelease("  <!-- 前面有空白 -->"), true, "前导空白先吃掉");
  equal(isNoteRelease("<div>x</div>"), false, "普通标签");
  equal(isNoteRelease("<p><!-- 在里面 --></p>"), false, "注释在**标签之后**的，按 HTML 画");
});

/* ── 二、`块HTML转换`（纯函数）────────────────────────────────────────── */

group("二、`块HTML转换`（纯函数：哪些位置该换类型）");

testCase("独占一行的 HTML → 自造类型（**这就是那个 bug 的补丁**）", () => {
  const tree = parse("<div>x</div>\n");
  equal(types(tree), ["root", blockHtmlNodeName], "root 底下那颗换了类型");
});

testCase("Milkdown 的 paragraph(html) 形状也收成 HTML 块，原文不变", () => {
  const source = '<p align="center">\n  <img src="a.svg">\n</p>';
  const tree: MarkdownNode = {
    type: "root",
    children: [
      {
        type: "paragraph",
        children: [{ type: "html", value: source }],
      },
    ],
  };
  blockHTMLConvertReplace(tree);
  equal(tree.children?.[0]?.type, blockHtmlNodeName, "包装层要变成块级节点");
  equal(tree.children?.[0]?.value, source, "源码逐字保留");
});

testCase("内联 HTML 仍夹在正文里的段落不动", () => {
  const tree = parse("甲 <span>乙</span> 丙\n");
  equal(types(tree), ["root", "paragraph", "text", "html", "text", "html", "text"], "普通段落原样");
});

testCase("⚠️ 段落里的 HTML **一个字节都不动**（那是 preset 的行内节点）", () => {
  const tree = parse("甲<u>乙</u>丙\n");
  equal(types(tree), ["root", "paragraph", "text", "html", "text", "html", "text"], "行内那几颗还是 html");
});

testCase("注释与普通 HTML 走同一条路（mdast 里本来就是同一种东西）", () => {
  equal(types(parse("<!-- 甲 -->\n")), ["root", blockHtmlNodeName], "块级注释");
  equal(types(parse("甲 <!-- 乙 --> 丙\n")), ["root", "paragraph", "text", "html", "text"], "行内注释仍留 html");
});

testCase("引用里、列表项里也算块级（`块级容器` 那四个都算）", () => {
  equal(blockLevelContainer.has("blockquote") && blockLevelContainer.has("listItem"), true, "表里有它们");
  const tree = parse("> <div>x</div>\n");
  equal(types(tree).includes(blockHtmlNodeName), true, "引用里的那颗换掉了");
});

testCase("⚠️ 一处都没命中时，树**原样**（不重建、不乱动）", () => {
  const tree = parse("甲\n\n乙\n");
  equal(types(tree), ["root", "paragraph", "text", "paragraph", "text"], "纯文字");
});

/* ── 三、往返（真 unified ＋ 真 schema）────────────────────────────────── */

group("三、往返（打开再存，一个字节都不许变）");

testCase("块级 HTML：`<div>x</div>` 存回去还是它", () => {
  equal(roundtrip("<div>x</div>\n"), "<div>x</div>\n", "整篇只有一个裸 HTML 块——这正是原来打不开的那一份");
});

testCase("块级注释", () => {
  equal(roundtrip("<!-- 甲 -->\n"), "<!-- 甲 -->\n", "注释原样");
});

testCase("HTML 块 ＋ 段落混排（顺序与空行都不许挪）", () => {
  const source3 = "甲\n\n<div>x</div>\n\n乙\n";
  equal(roundtrip(source3), source3, "三块，两两之间一个空行");
});

testCase("HTML 块在**最前面**（原来是「整篇打不开」的典型形状）", () => {
  const source3 = "<div>x</div>\n\n甲\n";
  equal(roundtrip(source3), source3, "开头就是 HTML");
});

testCase("行内 HTML 仍然走 preset 那一颗（本仓不碰）", () => {
  const source3 = "甲<u>乙</u>丙\n";
  equal(roundtrip(source3), source3, "一字不差");
});

testCase("多行的一块 HTML：换行照原样留着", () => {
  const source3 = "<div>\n  <span>甲</span>\n</div>\n";
  equal(roundtrip(source3), source3, "块里的缩进与换行都还在");
});

testCase("GitHub README 的居中标题与徽章块", () => {
  const source3 =
    '<p align="center">\n' +
    '  <a href="https://example.com"><img src="https://img.shields.io/badge/Nota-0.9.0-blue" alt="Release"></a>\n' +
    "</p>\n\n" +
    '<h1 align="center">Nota</h1>\n';
  equal(roundtrip(source3), source3, "渲染范围扩大后，源码仍是逐字往返");
});

testCase("⚠️ 一行里前后都有 HTML 标签，中间夹中文", () => {
   const source3 = "<span>甲</span>乙<span>丙</span>\n";
  equal(roundtrip(source3), source3, "三颗行内节点串起来");
});

testCase("空串、纯空白：不许抛", () => {
  for (const source3 of ["", "\n", "   \n"]) {
    const output2 = roundtrip(source3);
    equal(typeof output2, "string", `输入 ${JSON.stringify(source3)} 应给出字符串`);
  }
});

/* ── 汇总 ─────────────────────────────────────────────────────────────── */

console.log(`\n${"─".repeat(64)}`);
if (failure) {
  console.log(`通过 ${passed} 条，失败 ${failure} 条：`);
  for (const name3 of failureList) console.log(`  · ${name3}`);
  process.exit(1);
}
console.log(`通过 ${passed} 条，失败 0 条`);
