/**
 * `src/editor/inline-marks.ts`（高亮 / 上标 / 下标 / 下划线）的**可运行**测试集。
 * 2026-09-27 写，与那个文件同批落地。
 *
 * # 跑法（不装任何包：`esbuild` 与 `node` 仓库里都现成）
 *
 * ```sh
 * cd <仓库>
 * npx esbuild tests/inline-marks.test.ts --bundle --platform=node --format=esm \
 *   --outfile=/tmp/nota-测试/inline-marks.mjs
 * node /tmp/nota-测试/inline-marks.mjs
 * ```
 *
 * 全过退出码 0；有不过的退出码 1，并把名字列出来。
 *
 * # 这份测试盯的是什么
 *
 * 这四种标记**每一层漏掉都是静默的**（见 `inline-marks.ts` 文件头那张表）：
 * 屏幕上看起来只是"高亮没了"，而源文可能已经被改写。所以要钉的判据是
 * **「打开再存，字节不变」**，而不是"看起来对不对"。三组各钉一层：
 *
 * - 一、`切文本`（纯函数）——扫描器的窗口与边界；
 * - 二、`行内标记转换器`——mdast 上真的换成了自造节点；关掉的语法**一个都不换**；
 * - 三、往返——真 `unified()` ＋ 真 `ParserState`/`SerializerState` ＋ 真 schema。
 *
 * # ⚠️ 这份测试**证明不了**什么
 *
 * - **建整个 `Editor` 的那条路没验**：`$remark` 那一层有没有真的挂上 `remarkCtx`、
 *   `.use()` 的先后顺序对不对、输入规则抢不抢得过 `gfm` 的删除线——那要
 *   `Editor.make()` ＋ 真 DOM（本仓没有 jsdom，也不许为这件事装包）。**这一条
 *   是这份文件最大的空白**，它只能在开窗目检里验（`docs/06` §5 那一节的做法）。
 * - **`parseDOM` / `toDOM` 没验**：粘贴、拖拽、导出的样式——这里一颗 DOM 都没有。
 * - **样式没验**：`<mark>`/`<u>`/`<sup>`/`<sub>` 长什么样是 CSS 的事
 *   （`src/styles/editor.css` 那几条）。
 * - ⚠️ schema 是**手搓的最小版**（只有 `doc`/`paragraph`/`text` ＋ 四条 mark），
 *   少了 `emphasis`/`strong` 这类节点。所以"套嵌别的行内标记"那一条**测不了**
 *   （`**粗**` 在这里只是两个字面星号）——而它恰恰是 `inline-marks.ts` 明写在
 *   文件头里的**已知边界**，这里如实空着，不假装盖住。
 */

import { Container, Ctx } from "@milkdown/kit/ctx";
import { marksCtx } from "@milkdown/kit/core";
import { Schema } from "@milkdown/kit/prose/model";
import type { Node as PMNode } from "@milkdown/kit/prose/model";
import { ParserState, SerializerState } from "@milkdown/kit/transformer";
import type { MarkdownNode } from "@milkdown/kit/transformer";
import { strikethroughSchema } from "@milkdown/preset-gfm";
import { unified } from "unified";
import remarkGfm from "remark-gfm";
import remarkParse from "remark-parse";
import remarkStringify from "remark-stringify";
import {
  切文本,
  行内标记处理器,
  行内标记转换器,
  高亮规格,
  上标规格,
  下标规格,
  下划线规格,
  type 行内扩展开关,
  不转义行首等号,
  不转义孤立波浪号,
  GFM选项,
} from "../src/editor/inline-marks";

/* ── 一支极小的测试工装（与 `math-delim.test.ts` 同一套长相）── */

let 过 = 0;
let 败 = 0;
const 败的: string[] = [];

function 测(名称: string, 体: () => void): void {
  try {
    体();
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

function 等(实际: unknown, 期望: unknown, 说明: string): void {
  if (实际 !== 期望) {
    throw new Error(`${说明}：期望 ${JSON.stringify(期望)}，实际 ${JSON.stringify(实际)}`);
  }
}

/**
 * 比数组用。⚠️ **不能拿 `等` 去比数组**：`!==` 比的是引用，两个内容一模一样的
 * 数组也会判不等——而报错信息里 `JSON.stringify` 之后两边**看起来完全一样**，
 * 是那种"盯着看半天不知道哪里错"的假红。写这份测试时先踩过一次。
 */
function 等列(实际: unknown, 期望: unknown, 说明: string): void {
  const a = JSON.stringify(实际);
  const b = JSON.stringify(期望);
  if (a !== b) throw new Error(`${说明}：期望 ${b}，实际 ${a}`);
}

/* ── 真规格 → 真 Schema → 真两台状态机 ─────────────────────────────────── */

const ctx = new Ctx(new Container(), {} as never);
ctx.inject(marksCtx);
for (const 一 of [高亮规格, 上标规格, 下标规格, 下划线规格]) 一.ctx(ctx);
// ⚠️ gfm 的删除线也要**真规格**（BUG-48 那张矩阵里有 `~~下<u>下</u>下~~`，
// 而"`~下~` 会不会被改写成 `~~下~~`"那条判据正是它说了算）。
strikethroughSchema.ctx(ctx);

/** 五条 mark 的**真**规格（`$markSchema` 注入进去的那一份）。 */
const 四规格 = {
  highlight: ctx.get(高亮规格.key)(ctx),
  superscript: ctx.get(上标规格.key)(ctx),
  subscript: ctx.get(下标规格.key)(ctx),
  underline: ctx.get(下划线规格.key)(ctx),
  strike_through: ctx.get(strikethroughSchema.key)(ctx),
};

/** 全开的那一份开关。 */
const 全开: 行内扩展开关 = { highlight: true, superscript: true, subscript: true };

/**
 * 一台够用的 schema：`doc` / `paragraph` / `text` 三个**照上游那份抄形状**
 *（与 `math-delim.test.ts` 里那台同一个来历），marks 那一份用**本仓的真规格**。
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
        match: (node) => node.type === "paragraph",
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
    /**
     * 裸 HTML 那一颗。**真编辑器里有它**（`preset-commonmark` 的 `htmlSchema`：
     * 一个 `atom` 行内节点，把源码原样显示在 `data-type="html"` 的 span 里），
     * 这里按同一形状手搓一份最小的——少了它，`单着一个 <u> 标签` 那种文本
     * 会在解析那一步就抛「Cannot match target parser for node: html」，
     * 而那是**这份测试的**局限，不是产品的行为。
     */
    html: {
      atom: true,
      group: "inline",
      inline: true,
      attrs: { value: { default: "" } },
      parseMarkdown: {
        match: ({ type }) => type === "html",
        // ⚠️ 解析这一侧交出去的是 **PM 的 NodeType**（`type`），不是字符串
        // `"html"`——`ParserState.addNode` 的入口是 `nodeType.createAndFill(...)`，
        // 传字符串当场 `TypeError`；而它偏偏**把异常 `console.error` 吞掉**
        //（`@milkdown/transformer/lib/index.js:107-113`），症状是那一颗节点
        // **静默消失**（`<u>` 没了），只在控制台留一行红字。写这份测试时踩过。
        // 序列化那一侧（下面 `toMarkdown`）恰好相反，收的就是字符串。
        runner: (state, node, type) => state.addNode(type, { value: node.value }),
      },
      toMarkdown: {
        match: (node) => node.type.name === "html",
        runner: (state, node) => state.addNode("html", undefined, node.attrs.value as string),
      },
    },
  },
  marks: {
    highlight: 四规格.highlight,
    superscript: 四规格.superscript,
    subscript: 四规格.subscript,
    underline: 四规格.underline,
    strike_through: 四规格.strike_through,
  },
});

/**
 * `mdast-util-to-markdown` 的**默认**文本处理器，一字不差地照抄
 * （`lib/handle/text.js`：`export function text(node, _, state, info) { return state.safe(node.value, info) }`）。
 *
 * ⚠️ 它在 `@milkdown/transformer` 的类型里是**私有**的（`SerializerState` 的
 * 声明只有 `openNode/closeNode/addNode/withMark/...`，没有 `safe`），所以这里
 * 只能 `as` 一下。产品代码不用抄这一手——`create.ts` 那边拿到的是
 * `prev.handlers?.text`，**真的默认实现**。
 */
const 默认文本 = ((node: MarkdownNode, _父: unknown, 状态: unknown, info: unknown) =>
  (状态 as { safe(值: string, i: unknown): string }).safe(node.value ?? "", info)) as never;

/**
 * 一台真处理机：**与 `create.ts` 那条链同形**——`remark-parse` ＋ 本仓那个
 * 转换器（排在后面），序列化那一侧挂着本仓那四条 handler ＋ 文本那一条兜底。
 *
 * ⚠️ `text` 那一条是**必须的**：`create.ts` 里它是
 * `不转义行首等号(原子后的空格(不转义行首井号(prev.handlers?.text)))`。
 * 少了它，"关掉高亮之后存盘多出两个反斜杠"那个病在测试里**看不见**
 *（第三组最后一条就是钉这个的）。
 *
 * ⚠️ 每条往返都用**新的一台**：转换器是建实例时捕获开关的（`行内标记转换器`），
 * 来回换开关时共用一台会把上一轮的状态带过来。
 */
function 造处理机(开关: 行内扩展开关) {
  return unified()
    .use(remarkParse)
    // ⚠️ gfm **必须排在本题那个转换器前面**（`create.ts` 里 `.use(gfm)` 在
    // `.use(行内标记解析(...))` 之前）：删除线是 gfm 在解析阶段就从文本里拿走的，
    // 拿不走的话 `~~x~~` 会先被本仓下标那条正则咬掉一层。
    //
    // ⚠️ **选项与产品用的是同一个常量**（`GFM选项`，`create.ts` 的 `.config()`
    // 里 `ctx.update(remarkGFMPlugin.options, …)` 喂的就是它）。两边各写一份
    // 字面量的话，改了一边另一边不会跟着变——这份测试就成了自说自话。
    .use(remarkGfm, GFM选项)
    .use(() => 行内标记转换器(开关))
    .use(remarkStringify, {
      // ⚠️ 与 `create.ts` 的 `.config()` **同一串**（顺序也一样）：
      // `不转义孤立波浪号(不转义行首等号(原子后的空格(不转义行首井号(…))))`。
      // 这里省掉的 `原子后的空格` / `不转义行首井号` 只认 U+00A0 与 `#`，
      // 本文件一个都不碰——但**波浪号那一条必须在**，BUG-48 就是它。
      handlers: { ...行内标记处理器(), text: 不转义孤立波浪号(不转义行首等号(默认文本)) },
    });
}

/** 一整趟：markdown → 文档 → markdown。**两个方向都是真代码**。 */
function 往返(源: string, 开关: 行内扩展开关 = 全开): string {
  const 机 = 造处理机(开关);
  return SerializerState.create(schema, 机)(ParserState.create(schema, 机)(源));
}

/* ── 一、`切文本`（纯函数）────────────────────────────────────────────── */

组("一、`切文本`（纯函数：一个文本节点怎么切成几段）");

测("四种写法各切一刀", () => {
  等(切文本("==重点==", new Set(["notaHighlight"]))?.length, 1, "一整段就是一颗高亮");
  等(切文本("甲==重点==乙", new Set(["notaHighlight"]))?.length, 3, "前中后三段");
  等(切文本("X^2^", new Set(["notaSuperscript"]))?.length, 2, "文字 ＋ 上标");
  等(切文本("H~2~O", new Set(["notaSubscript"]))?.length, 3, "H ＋ 下标 ＋ O");
});

测("⚠️ 两边贴空白不转换（`2 == 3` 这种普通文字不许变半截高亮）", () => {
  等(切文本("== 重点 ==", new Set(["notaHighlight"])), null, "两边都有空格");
  等(切文本("==重点 ==", new Set(["notaHighlight"])), null, "只有右边有");
  等(切文本("== 重点==", new Set(["notaHighlight"])), null, "只有左边有");
});

测("⚠️ 内容里不许再出现同一个符号（`a == b == c` 不许从中间切走一段）", () => {
  等(切文本("==a=b==", new Set(["notaHighlight"])), null, "内容里有 `=`");
});

测("⚠️⚠️ 下标不许咬删除线：`~~x~~` 里一个 `notaSubscript` 都不许出现", () => {
  // 这一条是那份 `(?<!~)…(?!~)` 断言的机器判据。没有它，`~~x~~` 会被从
  // 第二个波浪号开始咬出一个下标（"+一个下标里包着一个波浪号"）。
  const 片 = 切文本("张~~三~~", new Set(["notaSubscript"]));
  等(片, null, "整串没被切");
});

测("⚠️ 但**单个**波浪号照切（`H~2~O` 是下标的写法）", () => {
  const 片 = 切文本("H~2~O", new Set(["notaSubscript"]));
  等(片?.length, 3, "三段");
  等(片?.[1]?.类型, "notaSubscript", "中间那颗是下标");
});

测("⚠️ 前缀重叠时**先中的赢**（`==` 排在表里第一个）", () => {
  // `==x==` 里没有 `^`/`~`，所以这条现在只会命中高亮；钉的是"扫描器按表顺序试"
  // 这件事实本身——将来加一条前缀重叠的语法时，这一条会当场变红。
  等(切文本("==x==", new Set(["notaHighlight", "notaSuperscript"]))?.[0]?.类型, "notaHighlight", "高亮");
});

测("内容是空的时候不算（`====` 不是一对空高亮）", () => {
  等(切文本("====", new Set(["notaHighlight"])), null, "四个等号");
});

测("内容里套着另一种标记：递归一层", () => {
  const 片 = 切文本("==a^2^==", new Set(["notaHighlight", "notaSuperscript"]));
  等(片?.[0]?.类型, "notaHighlight", "外层是高亮");
  等(片?.[0]?.孩子们?.[1]?.类型, "notaSuperscript", "里头那颗是上标");
});

测("这一段里一个都没有 → 返回 `null`（好让调用方**原样保留**那个文本节点）", () => {
  // ⚠️ 返回空数组与返回 `null` 不是一回事：空数组会把原来那颗文本节点
  // 连同它的 `position` 一起丢掉，而 `position` 是 `math-delim.ts` 那边
  // 数源码偏移时要用的东西。
  等(切文本("一句普通话", new Set(["notaHighlight"])), null, "没命中");
});

/* ── 二、`行内标记转换器`（mdast 上真的换了节点）───────────────────────── */

组("二、`行内标记转换器`（mdast 上的节点类型）");

/**
 * 手搓一小棵 mdast 树，跑一遍转换器，回读**带内容**的类型序列。
 *
 * ⚠️ 纯类型名不够用：`text` 在这棵树里会出现在好几个位置（外层的"甲"、"乙"、
 * 标记**里面**那一颗），只回读 `type` 的话"少了一颗 / 多了一颗"要靠数个数才
 * 看得出来，而这条正是最容易写错的那种断言。所以叶子上带内容：`text:甲`、
 * `html:<u>`。写这份测试时先栽过一次（期望里漏了标记内部那颗 `text`，
 * 盯着两串"看起来差不多"的名字看了半天）。
 */
function 转换(源: MarkdownNode[], 开关: 行内扩展开关 = 全开): string[] {
  const 树: MarkdownNode = { type: "root", children: 源 } as unknown as MarkdownNode;
  行内标记转换器(开关)(树);
  const 出: string[] = [];
  const 走 = (节: MarkdownNode): void => {
    const 值 = (节 as { value?: string }).value;
    if (节.type === "text" || 节.type === "html") 出.push(`${节.type}:${值 ?? ""}`);
    else 出.push(节.type);
    const 孩子们 = (节 as { children?: MarkdownNode[] }).children;
    if (Array.isArray(孩子们)) for (const 孩 of 孩子们) 走(孩);
  };
  走(树);
  return 出;
}

测("文本里的 `==x==` 换成了一颗 `notaHighlight`", () => {
  等列(
    转换([{ type: "paragraph", children: [{ type: "text", value: "甲==重点==乙" }] } as never]),
    ["root", "paragraph", "text:甲", "notaHighlight", "text:重点", "text:乙"],
    "类型序列（高亮**里面**那颗 `text:重点` 也是它的一部分）",
  );
});

测("⚠️ 关掉高亮 → **一个 `notaHighlight` 都不出现**（原样留成文字）", () => {
  等列(
    转换([{ type: "paragraph", children: [{ type: "text", value: "甲==重点==乙" }] } as never], {
      highlight: false,
      superscript: true,
      subscript: true,
    }),
    ["root", "paragraph", "text:甲==重点==乙"],
    "关掉之后原样",
  );
});

测("下划线走的是**另一边**：三颗节点（html ＋ text ＋ html）并成一颗", () => {
  // ⚠️ remark-parse 把 `<u>` 认成裸 HTML，所以它在 mdast 上是三颗节点。
  // 这一条钉的就是"配对成功了"，不是"正则匹配上了"。
  等列(
    转换([
      {
        type: "paragraph",
        children: [
          { type: "html", value: "<u>" },
          { type: "text", value: "重点" },
          { type: "html", value: "</u>" },
        ],
      } as never,
    ]),
    ["root", "paragraph", "notaUnderline", "text:重点"],
    "并成一颗",
  );
});

测("⚠️ 只有 `<u>` 没有 `</u>` → 原样留下，不许吃掉", () => {
  // 半截 HTML 保持它的本来面目，比把它吞掉强：用户可能真的在写 HTML。
  等列(
    转换([
      {
        type: "paragraph",
        children: [{ type: "html", value: "<u>" }, { type: "text", value: "重点" }],
      } as never,
    ]),
    ["root", "paragraph", "html:<u>", "text:重点"],
    "配不成对",
  );
});

测("⚠️ 中间隔着块级节点（换段了）→ 不配", () => {
  等列(
    转换([
      {
        type: "blockquote",
        children: [
          { type: "paragraph", children: [{ type: "html", value: "<u>" }] },
          { type: "paragraph", children: [{ type: "text", value: "另一段" }] },
        ],
      } as never,
    ]),
    ["root", "blockquote", "paragraph", "html:<u>", "paragraph", "text:另一段"],
    "跨段不配",
  );
});

测("⚠️ 下划线里夹一层**行内**标记 → 照样配成下划线（BUG-48 那一族，2026-09-27 修）", () => {
  // ⚠️ 这一条钉的是一个**真缺陷**：配对原来的判据是"有 `children` 就算边界"，
  // 而 `notaHighlight`（以及 `strong` / `link`）**也带 children** ⇒ 配不成，
  // `<u>` 与 `</u>` 退回成两颗裸 HTML 节点，真下划线 mark 一颗都没有。
  // 症状比"字节变了"更阴：**字节没变**（两颗 atom 被原样保着，第三组那条
  // "打开再存字节不变"照样绿），丢的是编辑器里那一层——用户看到的是字面的
  // `<u>` 与 `</u>`。而本仓自己就写得出这种源文（下划线＋高亮合法），
  // 于是"自己写的文件读不回来"。
  等列(
    转换([
      {
        type: "paragraph",
        children: [
          { type: "html", value: "<u>" },
          { type: "text", value: "下" },
          { type: "notaHighlight", children: [{ type: "text", value: "高" }] },
          { type: "html", value: "</u>" },
        ],
      } as never,
    ]),
    ["root", "paragraph", "notaUnderline", "text:下", "notaHighlight", "text:高"],
    "行内节点不算边界",
  );
});

测("⚠️ 反过来：`**粗**` 这种上游行内节点（`strong`）也不算边界", () => {
  // 与上一条同一个根因（`strong` 也带 children），只是它来自 remark-parse
  // 而不是本仓——这里用 mdast 直接喂一颗 `strong`，钉住"判据看的是块级，
  // 不是看谁造的"。
  等列(
    转换([
      {
        type: "paragraph",
        children: [
          { type: "html", value: "<u>" },
          { type: "strong", children: [{ type: "text", value: "粗" }] },
          { type: "html", value: "</u>" },
        ],
      } as never,
    ]),
    ["root", "paragraph", "notaUnderline", "strong", "text:粗"],
    "上游行内节点也不算边界",
  );
});

/* ── 三、往返：打开再存，字节不变 ─────────────────────────────────────── */

组("三、往返（真 `unified()` ＋ 真 `ParserState`/`SerializerState`）");

测("高亮：`==重点==` 一字不差地存回来", () => {
  等(往返("==重点==").trim(), "==重点==", "独占一段");
  等(往返("甲 ==重点== 乙").trim(), "甲 ==重点== 乙", "夹在中间");
});

测("上标 / 下标：`X^2^` 与 `H~2~O` 一字不差", () => {
  等(往返("X^2^").trim(), "X^2^", "上标");
  等(往返("H~2~O").trim(), "H~2~O", "下标");
});

测("下划线：`<u>x</u>` 一字不差（**这是最容易漏的一格**）", () => {
  // 它的左半边是 html 节点、右半边也是，中间夹着文本——两头都得顾上。
  等(往返("<u>重点</u>").trim(), "<u>重点</u>", "独占一段");
  等(往返("甲 <u>重点</u> 乙").trim(), "甲 <u>重点</u> 乙", "夹在中间");
});

测("一段里四种混着，各回各的", () => {
  const 源 = "甲 ==高== 乙 X^2^ 丙 H~2~O 丁 <u>下</u> 戊";
  等(往返(源).trim(), 源, "四种混排");
});

测("⚠️ 文案里带标记符号但不成对 → 一个字都不动", () => {
  // 这类文本在真实文档里到处都是（`a == b`、`2^3`、`x ~ y`、`<u>` 单着写）。
  // 它们**必须**原样回来——序列化器不许"顺手修一下"。
  for (const 源 of ["a == b == c", "2^3 与 2^4", "甲 ~ 乙", "单着一个 <u> 标签"]) {
    等(往返(源).trim(), 源, `原样：${源}`);
  }
});

测("⚠️ 关掉某项之后，**序列化仍然认得它**（这是不丢字节的兜底）", () => {
  // 场景：用户开着高亮打开一份老文件（已经是 highlight 标记了），中途把开关
  // 关掉，再存盘。这条链子上"解析"已经跑完了，只剩序列化——如果它跟着开关走，
  // 六个字符连同标记一起消失。本文件的开关只管解析与输入，序列化恒开。
  const 关掉: 行内扩展开关 = { highlight: false, superscript: true, subscript: true };
  等(往返("==重点==", 关掉).trim(), "==重点==", "关掉解析之后，已经是标记的那一段仍存得回来");
});

测("空段落、纯空白、超短串、半截符号：不许抛", () => {
  for (const 源 of ["", " ", "== ", " ==", "^", "~", "==^~"]) {
    往返(源);
  }
});

/*
 * ── ⚠️ 一个**没有**被上面那条盖住的输入，与这四种标记无关，如实记在这儿 ──
 *
 * `"<u>"`（或 `"</u>"`，或 `"<div>x</div>"`）**单独构成一整篇文档**时，解析会抛
 * `Cannot create node for doc`。原因是两级的，一级都不是本文件的：
 *
 * 1. `remark-parse` 把单独一行的 `<u>` 判成 **HTML 块**（CommonMark 的
 *    HTML block 类型 7），所以它落在 **root 的直属孩子**上，不裹在段落里；
 * 2. `preset-commonmark` 的 `htmlSchema` 是**行内**节点（`atom, group: "inline"`），
 *    而 `docSchema` 的 `content` 写死 `"block+"` —— 行内节点塞不进 doc
 *    （`@milkdown/preset-commonmark/lib/index.js:414` 与 `:1510`，两处都照抄过）。
 *
 * 判据是 **`<div>x</div>` 一模一样地抛**（那串里一个本文件的符号都没有），
 * 所以这是**上游**的边界：任何"整篇只有一个裸 HTML 块"的文档在 Nota 里都打不开，
 * 与本轮这四种标记**无关**。这条测试的 schema 是照 `docSchema` 手搓的极小版
 * （同样的 `content: "block+"` ＋ `injectRoot`），所以它忠实复现了同一个失败，
 * 不是工装的失真。
 *
 * 📌 已登记进 `docs/07` 的 backlog（"整篇只有一个裸 HTML 块的文档打不开"），
 * 不在本轮范围内——修它要动 preset 的 schema，属于"决定一万行代码的大方向"。
 */

/* ── 四、叠加：BUG-48 那张矩阵（2026-09-27 晚补）───────────────────────── */

组("四、叠加（BUG-48：两种标记叠在一起时，打开再存字节不变）");

/**
 * ⚠️ 这一组是 **BUG-48 的验收判据**，来源是 2026-09-27 开窗按一张组合矩阵量出来的
 * 那五行（`docs/07` §2 BUG-48 那一行）。**别把它们当成"古怪的边角料"删掉**：
 * 单个标记的文件往返是正常的（下面第一条对照就是），所以这个病**极易被
 * "我随手试了一下，没事"放过**——而它丢的是用户写的东西。
 *
 * ⚠️ 判据仍旧是**字节**（`.trim()` 只抹掉段落末尾那个换行，与第三组同一口径）。
 */
测("对照：单个标记往返正常（所以这不是「整体不工作」）", () => {
  等(往返("普通 ==高亮== 普通").trim(), "普通 ==高亮== 普通", "夹在中间的单个高亮");
});

测("`==高^上^亮==`（高亮里套上标）", () => {
  等(往返("==高^上^亮==").trim(), "==高^上^亮==", "高亮套上标");
});

测("`==^高上^==`（上标外再包高亮）", () => {
  等(往返("==^高上^==").trim(), "==^高上^==", "上标外包高亮");
});

测("`^上<u>下</u>上^`（上标里夹一段下划线）", () => {
  等(往返("^上<u>下</u>上^").trim(), "^上<u>下</u>上^", "上标夹下划线");
});

测("`<u>下==高==下</u>`（下划线里夹一段高亮）", () => {
  等(往返("<u>下==高==下</u>").trim(), "<u>下==高==下</u>", "下划线夹高亮");
});

测("`F ~~下<u>下</u>下~~ F`（删除线里夹一段下划线）", () => {
  等(往返("F ~~下<u>下</u>下~~ F").trim(), "F ~~下<u>下</u>下~~ F", "删除线夹下划线");
});

测("⚠️ `~下~` 不许被改写成 `~~下~~`（这是数据被改了，不只是显示不对）", () => {
  等(往返("~下~").trim(), "~下~", "单个波浪号的下标");
});

测("`==高==^上^`（并排相邻、不嵌套）", () => {
  等(往返("==高==^上^").trim(), "==高==^上^", "两种标记并排");
});

/* ── 五、"打字"那条路：PM 上真的叠了两层 mark，存盘会吐成什么 ────────────── */

组("五、手工建的叠加文档（用户在窗口里打字时落到的形状）");

/**
 * ⚠️ **这一组与第四组测的是两条不同的路，别以为重复**：
 *
 * - 第四组是「**打开**再存」——源文本先进 `切文本`／`并下划线` 变成 mdast，
 *   再变 PM。那条路上叠加是**嵌套的**（一颗套一颗）。
 * - 本组是「**打字**」——输入规则一条一条落下 mark，PM 里就是一个**按 run 存的
 *   mark 集合**（`高` 只有高亮、`上` 有高亮＋上标）。存盘时 `state.withMark`
 *   要自己决定"这几层怎么收放"，那才是用户真撞到的那条路（BUG-48 是开窗
 *   打字量出来的）。
 *
 * 两种形状**在文件里长得一样**（同一串 markdown），所以两边都得钉。
 */
function 段落(...跑: [string, string[]][]): PMNode {
  return schema.node("paragraph", null, 跑.map(([文, 标记]) =>
    schema.text(文, 标记.map((名) => schema.marks[名]!.create())),
  ));
}

function 存盘(...跑: [string, string[]][]): string {
  const 机 = 造处理机(全开);
  const 文档 = schema.node("doc", null, [段落(...跑)]);
  return String(SerializerState.create(schema, 机)(文档)).trim();
}

测("高亮 ＋ 上标叠在中间那一个字上 → `==高^上^亮==`", () => {
  等(存盘(["高", ["highlight"]], ["上", ["highlight", "superscript"]], ["亮", ["highlight"]]),
     "==高^上^亮==", "高亮套上标（打字那条路）");
});

测("上标里夹一段下划线 → `^上<u>下</u>上^`", () => {
  等(存盘(["上", ["superscript"]], ["下", ["superscript", "underline"]], ["上", ["superscript"]]),
     "^上<u>下</u>上^", "上标夹下划线（打字那条路）");
});

测("下划线里夹一段高亮 → `<u>下==高==下</u>`", () => {
  等(存盘(["下", ["underline"]], ["高", ["underline", "highlight"]], ["下", ["underline"]]),
     "<u>下==高==下</u>", "下划线夹高亮（打字那条路）");
});

测("删除线里夹一段下划线 → `~~下<u>下</u>下~~`", () => {
  等(存盘(["下", ["strike_through"]], ["下", ["strike_through", "underline"]], ["下", ["strike_through"]]),
     "~~下<u>下</u>下~~", "删除线夹下划线（打字那条路）");
});

/**
 * 一颗文档里段落上每一段的「文字 ＋ 标记名集合」，用来比对**再打开之后
 * 标记有没有挪窝**——只比字符串的话，"文案一样但标记换了层"这种会被漏掉。
 */
function 跑集(文档: PMNode): string[] {
  const 出: string[] = [];
  文档.firstChild?.forEach((一) => {
    出.push(`${一.text}|${一.marks.map((m) => m.type.name).sort().join("+")}`);
  });
  return 出;
}

测("⚠️ **半重叠**（不是嵌套）：拆成相邻两组，且第二趟一个字都不动", () => {
  // ⚠️ 这一条与上面几条**不是同一个形状**：上面是"一颗套一颗"（`==a^b^==`,
  // 高亮把上标整个包住），这里两层是**错开的**——高亮落在 [0,2)、上标落在 [1,3)，
  // 中间那一个字两层都有。用户在窗口里很容易造出来（选 `ab` 点高亮，再选 `bc`
  // 点粗体），而 markdown 的语法**表达不了错开**，所以序列化器必须自己拆成
  // 相邻的两组。2026-09-27 量出来的结论是：**它拆得对，而且拆完是稳定的**
  //（这一点事先没人知道，所以钉住；它不属于 BUG-48 报的那条，但同属"叠加"这一族）。
  const 例: [string, [string, string[]][], string][] = [
    ["高亮[0,2) ＋ 上标[1,3)", [["a", ["highlight"]], ["b", ["highlight", "superscript"]], ["c", ["superscript"]]], "==a^b^==^c^"],
    ["下划线[0,2) ＋ 高亮[1,3)", [["a", ["underline"]], ["b", ["underline", "highlight"]], ["c", ["highlight"]]], "<u>a==b==</u>==c=="],
    ["下标[0,2) ＋ 上标[1,3)", [["a", ["subscript"]], ["b", ["subscript", "superscript"]], ["c", ["superscript"]]], "~a^b^~^c^"],
  ];
  for (const [名, 跑, 期望源] of 例) {
    const 原 = schema.node("doc", null, [段落(...跑)]);
    const 一 = String(SerializerState.create(schema, 造处理机(全开))(原)).trim();
    等(一, 期望源, `${名} 的拆法`);
    // 再打开一趟：源文与**标记集合**都必须与原来一致。
    const 回 = ParserState.create(schema, 造处理机(全开))(一);
    等列(跑集(回), 跑集(原), `${名} 再打开后的标记集合`);
    等(往返(一).trim(), 一, `${名} 再开再存：一字不差`);
  }
});

测("⚠️ 已知边界：内容**本身就是定界符** → 不往返（文件头边界 3，钉的是现状）", () => {
  // ⚠️⚠️ 这条**不是**在断言"这样是对的"，而是把现状钉住、免得下次有人以为它好了。
  // 原因在 `inline-marks.ts` 文件头边界 3：那颗正则里内容不许再出现同一个符号，
  // 而它也不认识反斜杠转义 ⇒ **一个内容为 `~` 的下标、内容为 `=` 的高亮，
  // 根本表达不出来**。三种写法各自撞出来的是这一串：
  //   · 下标内容 `~`   → `~~~`
  //   · 高亮内容 `=`   → `=====`
  //   · 上标内容 `^`   → `^^^`
  // 共同点是"内容那几个字符被吐回去当成了定界符"。用户打不出这种文档（输入规则
  // 与切文本都不会产出它），真实的来源只有一条：**手工把源码改成这样再打开**。
  // 要真修得让那颗正则认识 `\` 转义（那是"自己写一台行内解析器"那个量级的事），
  // 不在本轮。所以这里如实钉住，并把数字写出来给后来的人当路标。
  等(存盘(["~", ["subscript"]]), "~\\~~", "下标内容为 `~`（现状：不往返）");
  等(存盘(["=", ["highlight"]]), "=====", "高亮内容为 `=`（现状：不往返）");
  等(存盘(["^", ["superscript"]]), "^^^", "上标内容为 `^`（现状：不往返）");
});

/* ── 收尾 ───────────────────────────────────────────────────────────── */

console.log(`\n${"─".repeat(64)}`);
console.log(`通过 ${过} 条，失败 ${败} 条`);
if (败) {
  console.log(`失败的：\n  - ${败的.join("\n  - ")}`);
  process.exitCode = 1;
}
