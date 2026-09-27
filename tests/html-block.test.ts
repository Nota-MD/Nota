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

import { 块HTML转换, 块HTML节点名, 块级容器, 是注释 } from "../src/editor/html-block";

/* ── 最小工装 ─────────────────────────────────────────────────────────── */

let 通过 = 0;
let 失败 = 0;
const 失败清单: string[] = [];
let 当前组 = "";

function 组(名: string): void {
  当前组 = 名;
  console.log(`\n── ${名} ${"─".repeat(Math.max(0, 56 - 名.length))}`);
}

function 测(名: string, 体: () => void): void {
  try {
    体();
    通过++;
    console.log(`  ✔ ${名}`);
  } catch (e) {
    失败++;
    失败清单.push(`${当前组} / ${名}`);
    console.log(`  ✘ ${名}\n      ${(e as Error).message.split("\n").join("\n      ")}`);
  }
}

function 等<T>(实: T, 期: T, 说明 = ""): void {
  const a = JSON.stringify(实);
  const b = JSON.stringify(期);
  if (a !== b) throw new Error(`${说明}\n      实际：${a}\n      期望：${b}`);
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
        match: ({ type }: MarkdownNode) => type === 块HTML节点名,
        runner: (state: ParserState, node: MarkdownNode, type: unknown) =>
          state.addNode(type as never, { value: node.value ?? "" }),
      },
      toMarkdown: {
        match: (node: PMNode) => node.type.name === 块HTML节点名,
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
function 造处理机() {
  return unified()
    .use(remarkParse)
    .use(() => (树: unknown) => 块HTML转换(树 as MarkdownNode))
    .use(remarkStringify);
}

/** 一整趟：markdown → 文档 → markdown。两个方向都是真代码。 */
function 往返(源: string): string {
  const 机 = 造处理机();
  return SerializerState.create(schema, 机)(ParserState.create(schema, 机)(源));
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
function 解析(源: string): MarkdownNode {
  const 机 = 造处理机();
  return 机.runSync(机.parse(源), 源) as unknown as MarkdownNode;
}

/** 树里所有节点的类型名（深度优先）。 */
function 类型们(树: MarkdownNode): string[] {
  const 出: string[] = [];
  const 走 = (节点: MarkdownNode): void => {
    出.push(节点.type);
    const 孩子 = 节点.children;
    if (Array.isArray(孩子)) for (const 一 of 孩子 as MarkdownNode[]) 走(一);
  };
  走(树);
  return 出;
}

/* ── 一、`是注释`（纯函数）──────────────────────────────────────────────── */

组("一、`是注释`（纯函数：一段 HTML 是不是注释）");

测("四种写法", () => {
  等(是注释("<!-- x -->"), true, "标准写法");
  等(是注释("<!-->"), true, "只认开头，不看结尾");
  等(是注释("  <!-- 前面有空白 -->"), true, "前导空白先吃掉");
  等(是注释("<div>x</div>"), false, "普通标签");
  等(是注释("<p><!-- 在里面 --></p>"), false, "注释在**标签之后**的，按 HTML 画");
});

/* ── 二、`块HTML转换`（纯函数）────────────────────────────────────────── */

组("二、`块HTML转换`（纯函数：哪些位置该换类型）");

测("独占一行的 HTML → 自造类型（**这就是那个 bug 的补丁**）", () => {
  const 树 = 解析("<div>x</div>\n");
  等(类型们(树), ["root", 块HTML节点名], "root 底下那颗换了类型");
});

测("⚠️ 段落里的 HTML **一个字节都不动**（那是 preset 的行内节点）", () => {
  const 树 = 解析("甲<u>乙</u>丙\n");
  等(类型们(树), ["root", "paragraph", "text", "html", "text", "html", "text"], "行内那几颗还是 html");
});

测("注释与普通 HTML 走同一条路（mdast 里本来就是同一种东西）", () => {
  等(类型们(解析("<!-- 甲 -->\n")), ["root", 块HTML节点名], "块级注释");
  等(类型们(解析("甲 <!-- 乙 --> 丙\n")), ["root", "paragraph", "text", "html", "text"], "行内注释仍留 html");
});

测("引用里、列表项里也算块级（`块级容器` 那四个都算）", () => {
  等(块级容器.has("blockquote") && 块级容器.has("listItem"), true, "表里有它们");
  const 树 = 解析("> <div>x</div>\n");
  等(类型们(树).includes(块HTML节点名), true, "引用里的那颗换掉了");
});

测("⚠️ 一处都没命中时，树**原样**（不重建、不乱动）", () => {
  const 树 = 解析("甲\n\n乙\n");
  等(类型们(树), ["root", "paragraph", "text", "paragraph", "text"], "纯文字");
});

/* ── 三、往返（真 unified ＋ 真 schema）────────────────────────────────── */

组("三、往返（打开再存，一个字节都不许变）");

测("块级 HTML：`<div>x</div>` 存回去还是它", () => {
  等(往返("<div>x</div>\n"), "<div>x</div>\n", "整篇只有一个裸 HTML 块——这正是原来打不开的那一份");
});

测("块级注释", () => {
  等(往返("<!-- 甲 -->\n"), "<!-- 甲 -->\n", "注释原样");
});

测("HTML 块 ＋ 段落混排（顺序与空行都不许挪）", () => {
  const 源 = "甲\n\n<div>x</div>\n\n乙\n";
  等(往返(源), 源, "三块，两两之间一个空行");
});

测("HTML 块在**最前面**（原来是「整篇打不开」的典型形状）", () => {
  const 源 = "<div>x</div>\n\n甲\n";
  等(往返(源), 源, "开头就是 HTML");
});

测("行内 HTML 仍然走 preset 那一颗（本仓不碰）", () => {
  const 源 = "甲<u>乙</u>丙\n";
  等(往返(源), 源, "一字不差");
});

测("多行的一块 HTML：换行照原样留着", () => {
  const 源 = "<div>\n  <span>甲</span>\n</div>\n";
  等(往返(源), 源, "块里的缩进与换行都还在");
});

测("⚠️ 一行里前后都有 HTML 标签，中间夹中文", () => {
  const 源 = "<span>甲</span>乙<span>丙</span>\n";
  等(往返(源), 源, "三颗行内节点串起来");
});

测("空串、纯空白：不许抛", () => {
  for (const 源 of ["", "\n", "   \n"]) {
    const 出 = 往返(源);
    等(typeof 出, "string", `输入 ${JSON.stringify(源)} 应给出字符串`);
  }
});

/* ── 汇总 ─────────────────────────────────────────────────────────────── */

console.log(`\n${"─".repeat(64)}`);
if (失败) {
  console.log(`通过 ${通过} 条，失败 ${失败} 条：`);
  for (const 名 of 失败清单) console.log(`  · ${名}`);
  process.exit(1);
}
console.log(`通过 ${通过} 条，失败 0 条`);
