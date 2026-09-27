/**
 * `src/editor/math-delim.ts`（**行内公式用几个 `$`：用户敲几个就存几个**）的
 * **可运行**测试集。2026-09-27 写，同批落地的三件事见那个文件的文件头。
 *
 * # 跑法（不装任何包：`esbuild` 与 `node` 仓库里都现成）
 *
 * ```sh
 * cd <仓库>
 * npx esbuild tests/math-delim.test.ts --bundle --platform=node --format=esm \
 *   --outfile=/tmp/nota-math-delim-test/math-delim.test.mjs
 * node /tmp/nota-math-delim-test/math-delim.test.mjs
 * ```
 *
 * 全过退出码 0；有不过的退出码 1，并把名字列出来。
 *
 * # 这份测试盯的是"**打开再存，字节不变**"
 *
 * 用户 2026-09-27 拍了「`$$` 要保留」，而那件事**跨了三个环节**——解析（remark
 * 插件标数）、中间（节点属性搬来搬去）、序列化（按数选处理器）。**任何一环漏掉
 * 都是静默的**：屏幕上一点变化都看不出来，只有"把文件读出来数字节"才知道。
 * 所以这里的每一组都跑**真代码**，一段都不替它实现：
 *
 * - 解析与序列化用的是**真的 milkdown 那两台状态机**（`ParserState` /
 *   `SerializerState`，`@milkdown/kit/transformer` 导出），而它们正是
 *   `create.ts` 建 `parserCtx` / `serializerCtx` 时用的那两个类。
 * - 处理机是**真 `unified()`**：`remark-parse` ＋ `remark-math` ＋ 本仓那个插件，
 *   序列化那一侧挂着**本仓那条 handler**（与 `create.ts` 里 `.config()` 写进去的
 *   是同一个函数）。
 * - schema 里的 `math_inline` 是**本仓 `extendSchema` 出来的那一份**
 *   （`行内公式规格`），不是上游那份、也不是这里手写的。
 *
 * # ⚠️ 这份测试**证明不了**什么
 *
 * - **建整个 `Editor` 的那条路没验**：`$remark` 那一层（插件有没有真的挂上
 *   `remarkCtx`）、`.use()` 的先后顺序对不对——那要 `Editor.make()` ＋ 真 DOM。
 *   ⚠️ 不过"本仓那份规格真的替掉了上游那份、而且**位置没挪**"这一条**是验了的**：
 *   下面第二组把两个插件**真的跑起来**，然后拿 `nodesCtx` 里的名单逐项对比
 *   （不用建 Editor，`ctx.inject(nodesCtx)` 就够）。
 * - **粘贴/拖拽**那条路（`parseDOM`，拿不到数、落到默认 1）、**剪贴板 JSON**
 *   （`nodeFromJSON`）没验。
 * - **开窗目检**：真浏览器里敲 `$$x$$`、`Ctrl+S`、再 `cat` 文件——那是另一件事
 *   （`docs/06` §5 那一节的做法）。
 * - 上游 `mathToMarkdown` 那两段边界处理（值首尾补空格、值里的换行防块级陷阱）
 *   这里只顺带盖了一条，**没有逐条盖**——它们是上游的测试集在管。
 * - ⚠️ 这里那台 schema 是**手搓的最小版**（只有 `doc`/`paragraph`/`text`/两种公式），
 *   不是编辑器真正用的 commonmark 预设。所以"少了某个节点就报错"这类现象是**这份
 *   测试的**局限，别当成产品的行为（写的时候已经栽过一次：少了 `inlineCode`，
 *   解析那条链当场炸，后面几条跟着报假错）。
 */

import { Container, Ctx } from "@milkdown/kit/ctx";
import { nodesCtx } from "@milkdown/kit/core";
import { Schema } from "@milkdown/kit/prose/model";
import type { Node as PMNode } from "@milkdown/kit/prose/model";
import { ParserState, SerializerState } from "@milkdown/kit/transformer";
import { katexOptionsCtx, mathBlockSchema, mathInlineSchema } from "@milkdown/plugin-math";
import { unified } from "unified";
import remarkParse from "remark-parse";
import remarkStringify from "remark-stringify";
import remarkMath from "remark-math";
import {
  数开头美元,
  标美元数插件,
  美元数属性,
  行内公式处理器,
  行内公式规格,
  读美元数,
} from "../src/editor/math-delim";

/* ── 一支极小的测试工装（与 `math-input.test.ts` / `math-view.test.ts` 同一套长相）── */

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

/* ── 真规格 → 真 Schema → 真两台状态机 ─────────────────────────────────── */

const ctx = new Ctx(new Container(), {} as never);
ctx.inject(nodesCtx);
katexOptionsCtx(ctx);
mathInlineSchema.ctx(ctx);
// ⚠️ 上游那份也注入一份：`行内公式规格` 是**在它的基础上**改出来的，本文件要能
// 对比"改了哪几处、没动哪几处"（下面第二组就是干这个的）。
mathBlockSchema.ctx(ctx);
// 本仓那份的切片也要登记，`ctx.get(行内公式规格.key)` 才取得到。
行内公式规格.ctx(ctx);

/** 上游那份 `math_inline` 规格。 */
const 上游规格 = ctx.get(mathInlineSchema.key)(ctx);
/** **本仓**那份（加了 `dollars`、换了两个 `runner`）。 */
const 行内规格 = ctx.get(行内公式规格.key)(ctx);

/* ── 把它俩**真的跑一遍**，看 `nodesCtx` 里换成了哪一份、位置有没有挪 ──── */

/**
 * ⚠️ 这一小段是这份测试里**最值钱**的一条，别删。
 *
 * `math_inline` 那份规格登记进 `nodesCtx` 靠的是插件**跑起来**去 `update`，不是
 * 声明一下就行；而"**就地替换还是挪到末尾**"决定了 ProseMirror 建 schema 时
 * content-match 走哪个节点（顶层 utils 的 `upsertById` 那段注释就是为这件事写的）。
 * 换成顶层 `$nodeSchema` 的理由全在这里，所以这里**量出来**。
 *
 * 用顶层 `await`（这个文件打成 ESM 跑，node 支持）——两个插件体都是 `async`。
 */
const 取名单 = (): string[] => (ctx.get(nodesCtx) as [string, unknown][]).map(([id]) => id);

let 跑之前: string[] = [];
let 跑之后: string[] = [];
let 换过的那份: unknown = null;
let 跑插件炸了 = "";
try {
  const 上游插件 = (mathInlineSchema as unknown as { node: (c: Ctx) => () => Promise<void> }).node;
  await 上游插件(ctx)();
  跑之前 = 取名单();

  const 本仓插件 = (行内公式规格 as unknown as { node: (c: Ctx) => () => Promise<void> }).node;
  await 本仓插件(ctx)();
  跑之后 = 取名单();
  换过的那份 = (ctx.get(nodesCtx) as [string, unknown][]).find(([id]) => id === "math_inline")?.[1];
} catch (e) {
  跑插件炸了 = e instanceof Error ? e.message : String(e);
}


/**
 * 一台够用的 schema：`doc` / `paragraph` / `text` 三个是**照上游 `preset-commonmark`
 * 那份抄的形状**（`src/node/doc.ts` / `paragraph.ts` / `text.ts`，只留跑 markdown
 * 必需的那几个字段，`toDOM` 一律省掉——本文件不碰 DOM）。
 *
 * ⚠️ 段落那个 `toMarkdown` **故意用最简单的 `state.next(node.content)`**：
 * 上游那一版会去问 `editorViewCtx`（"最后一段是不是空的、要不要写 `<br />`"），
 * 而那是另一件事（`empty-paragraph.ts`）。这里要的是"公式那几个字节"。
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
    math_inline: 行内规格,
    math_block: ctx.get(mathBlockSchema.key)(ctx),
  },
});

/**
 * 一台真处理机：**与 `create.ts` 那条链同形**——`remark-parse` ＋ `remark-math`
 * ＋ 本仓那个标注插件（排在 `remark-math` **后面**，转换器按注册顺序跑），
 * 序列化那一侧挂着本仓那条 handler。
 */
const 处理机 = unified()
  .use(remarkParse)
  .use(remarkMath)
  .use(标美元数插件)
  .use(remarkStringify, {
    handlers: { inlineMath: 行内公式处理器() },
  });

const 解析 = ParserState.create(schema, 处理机);
const 序列化 = SerializerState.create(schema, 处理机);

/** 一整趟：markdown → 文档 → markdown。**两个方向都是真代码**。 */
const 往返 = (源: string): string => 序列化(解析(源));

/** 文档里第一颗 `math_inline`（没有就 `null`）。 */
function 头一颗行内(doc: PMNode): PMNode | null {
  let 找到: PMNode | null = null;
  doc.descendants((节点) => {
    if (!找到 && 节点.type.name === "math_inline") {
      找到 = 节点;
      return false;
    }
    return true;
  });
  return 找到;
}

/* ── 一、数源码里那几个 `$`（纯函数）──────────────────────────────────── */

组("一、`数开头美元`（纯函数）");

测("`$$x$$` 数出 2、`$x$` 数出 1", () => {
  等(数开头美元("$$x$$", 0), 2, "两个 `$`");
  等(数开头美元("$x$", 0), 1, "一个 `$`");
});

测("偏移指的不是 `$`（位置算歪了）→ 退回 1，不硬猜", () => {
  // ⚠️ 退回 1 的代价只是"这一次没保留住"；要是硬按"数到几个算几个"，
  // 写出 0 个 `$` 就把公式拆成两半了。
  等(数开头美元("甲$$x$$", 0), 1, "开头是普通字");
  等(数开头美元("", 0), 1, "空源");
  等(数开头美元("$x$", 5), 1, "越界");
});

测("三个及以上的 `$` → 夹到 2（那种源码 micromark 不当公式读，到不了这里）", () => {
  等(数开头美元("$$$ab$$", 0), 2, "三个");
  等(数开头美元("$$$$ab$$", 0), 2, "四个");
});

测("`读美元数`：没有这个属性就是 1（老数据、粘贴、手工建节点都走这条）", () => {
  等(读美元数({}), 1, "空对象");
  等(读美元数({ attrs: {} }), 1, "attrs 里没有");
  等(读美元数({ attrs: { [美元数属性]: 2 } }), 2, "attrs 里是 2");
  等(读美元数({ data: { [美元数属性]: 2 } }), 2, "mdast 那边（data 里）也认");
  等(读美元数({ attrs: { [美元数属性]: 3 } }), 1, "歪了的值 → 1");
});

/* ── 二、规格：只多了 `dollars`，别的字段一个没动 ─────────────────────── */

组("二、`行内公式规格`（真 `$nodeSchema`，两个插件都真跑了一遍）");

测("⚠️ 两个插件都**真的跑起来**了（不是在声明层面比比而已）", () => {
  if (跑插件炸了) throw new Error(`跑插件时报错：${跑插件炸了}`);
  if (!跑之前.includes("math_inline")) throw new Error(`上游那份没登记进去，节点名单是 ${JSON.stringify(跑之前)}`);
  等(跑之后.length, 跑之前.length, "登记条数没变（是替换，不是又插一条）");
});

测("⚠️⚠️ 替换是**就地**的：`math_inline` 在名单里的位置一个字都没动", () => {
  // 这就是"用顶层 `$nodeSchema` 而不是 plugin-math 那份 `extendSchema`"的全部理由
  // （后者会把它挪到末尾）。名单里现在只有这几个节点，但**下标相等**这条判据
  // 与"名单里有多少个"无关，是硬的。
  等(跑之后.indexOf("math_inline"), 跑之前.indexOf("math_inline"), "在 `nodesCtx` 里的下标");
  if (JSON.stringify(跑之后) !== JSON.stringify(跑之前)) {
    throw new Error(`名单整体变了：\n  跑之前 ${JSON.stringify(跑之前)}\n  跑之后 ${JSON.stringify(跑之后)}`);
  }
});

测("替换之后 `nodesCtx` 里那一份**就是本仓这份**（带 `dollars`、带我们的 runner）", () => {
  const 换过的 = 换过的那份 as { attrs?: Record<string, { default?: unknown }> } | null;
  等(换过的?.attrs?.[美元数属性]?.default, 1, "dollars 默认 1");
});

测("上游那份**没有** attrs；本仓这份多了一个 `dollars`，默认 1", () => {
  等(上游规格.attrs, undefined, "上游：连属性都没有");
  等(行内规格.attrs?.[美元数属性]?.default, 1, "本仓：dollars 默认 1");
});

测("别的字段一个没丢：atom / inline / content / parseDOM / toDOM 都还在", () => {
  等(行内规格.atom, true, "atom");
  等(行内规格.inline, true, "inline");
  等(行内规格.content, "text*", "content");
  等(typeof 行内规格.parseDOM, "object", "parseDOM");
  等(typeof 行内规格.toDOM, "function", "toDOM");
});

测("两个 runner 还在，而且**源码那条没写错**：行内的源码在**内容**里", () => {
  // ⚠️ 这是 `math-view.ts` 文件头点名的那个坑：行内取 `content`、块取 `attrs.value`。
  // 换 runner 时最怕"顺手改成读属性"——那个错**不报错、只丢字**。
  const 节点 = schema.nodes.math_inline.create({ [美元数属性]: 2 }, schema.text("x^2"));
  等(节点.textContent, "x^2", "内容里是源码");
  等(节点.attrs[美元数属性], 2, "属性里是那个数");
});

/* ── 三、解析那一趟：源码里那几个 `$` 真的标上去了 ─────────────────────── */

组("三、解析（真 `remark-parse` ＋ `remark-math` ＋ 真 `ParserState`）");

测("`$$x$$` → 那颗节点上标着 2；`$x$` → 1", () => {
  等(读美元数(头一颗行内(解析("$$x$$"))!), 2, "两个 `$`");
  等(读美元数(头一颗行内(解析("$x$"))!), 1, "一个 `$`");
});

测("标的是**源码里那几个字节**，跟公式里写什么无关", () => {
  等(读美元数(头一颗行内(解析("$$\\frac{a}{b}$$"))!), 2, "反斜杠与花括号");
  等(读美元数(头一颗行内(解析("$$a=b \\text{ 甲 }$$"))!), 2, "值里有空格与中文");
  等(读美元数(头一颗行内(解析("$$𝒜$$"))!), 2, "星光面字符（按字节偏移数，不看长度）");
});

测("行内公式夹在文字中间、段首、段尾都标得到", () => {
  等(读美元数(头一颗行内(解析("甲 $$x$$ 乙"))!), 2, "夹在中间");
  等(读美元数(头一颗行内(解析("$$x$$ 乙"))!), 2, "段首");
  等(读美元数(头一颗行内(解析("甲 $$x$$"))!), 2, "段尾");
});

测("同一段里好几颗，各标各的（**不是只看第一颗**）", () => {
  const doc = 解析("甲 $a$ 乙 $$b$$ 丙");
  const 数们: number[] = [];
  doc.descendants((节点) => {
    if (节点.type.name === "math_inline") 数们.push(读美元数(节点));
    return true;
  });
  const 期望 = [1, 2];
  if (JSON.stringify(数们) !== JSON.stringify(期望)) {
    throw new Error(`期望 ${JSON.stringify(期望)}，实际 ${JSON.stringify(数们)}`);
  }
});

测("不是公式的 `$`（没闭合、三个 `$`）一个都不标——本来就没节点", () => {
  等(头一颗行内(解析("甲 $x 乙")), null, "没闭合");
  等(头一颗行内(解析("甲 $$$ab$$ 乙")), null, "三个 `$` 起不来（整段字面）");
});

/* ── 四、存盘那一趟：按那个数写回去 ───────────────────────────────────── */

组("四、存盘（真 `SerializerState` ＋ 本仓那条 handler）");

测("`dollars = 2` 写出两个 `$`；`1` 写回一个（**这就是用户要的那件事**）", () => {
  const 两颗 = schema.topNodeType.create(null, [
    schema.nodes.paragraph.create(null, schema.nodes.math_inline.create({ [美元数属性]: 2 }, schema.text("x"))),
  ]);
  const 一颗 = schema.topNodeType.create(null, [
    schema.nodes.paragraph.create(null, schema.nodes.math_inline.create({ [美元数属性]: 1 }, schema.text("x"))),
  ]);
  等(序列化(两颗).trim(), "$$x$$", "两颗");
  等(序列化(一颗).trim(), "$x$", "一颗");
});

测("手工建出来的节点（没有那个属性）→ 按 1 写，不会凭空多出一个 `$`", () => {
  const doc = schema.topNodeType.create(null, [
    schema.nodes.paragraph.create(null, schema.nodes.math_inline.create(null, schema.text("x"))),
  ]);
  等(序列化(doc).trim(), "$x$", "默认值那条路");
});

测("值里有孤立 `$` 时照旧往上加（上游那套还在，没被我们盖掉）", () => {
  // `$$a$b$$` 的值是 `a$b`——两个 `$` 挨着会提前闭合，所以 mdast 那边算出来还是 2。
  // 这一条是"我们没有把上游那两段边界处理弄丢"的机器判据。
  const doc = schema.topNodeType.create(null, [
    schema.nodes.paragraph.create(null, schema.nodes.math_inline.create({ [美元数属性]: 2 }, schema.text("a$b"))),
  ]);
  等(序列化(doc).trim(), "$$a$b$$", "值里有 `$`");
});

/* ── 五、端到端：打开再存，字节不变 ───────────────────────────────────── */

组("五、往返（解析 → 文档 → 序列化）");

测("用户举的那个例子（`docs/07` 第 53 项）：一整句夹着公式，逐字节回来", () => {
  // ⚠️ 这里**没写**用户原话里的 `**粗体**`——粗体不在本文件这份最小 schema 里，
  // 它会被当成两个字面 `*`。那是"最小 schema 少了个节点"，不是公式的事；
  // 所以源码里去掉它，剩下的部分要求一字不差。
  const 源 = "牛顿-莱布尼茨公式是这样的：$$\\int_a^b f(x)dx=F(x)\\big|_a^b$$ 也是可以的。";
  等(往返(源).trim(), 源, "带反斜杠命令的长行内公式");
});

测("行内 `$$x$$` / `$x$` / 夹在文字里：三种都一字不差", () => {
  等(往返("$$x$$").trim(), "$$x$$", "独占一段的 `$$`");
  等(往返("$x$").trim(), "$x$", "独占一段的 `$`");
  等(往返("甲 $$x$$ 乙").trim(), "甲 $$x$$ 乙", "夹在中间");
  等(往返("甲 $x$ 乙").trim(), "甲 $x$ 乙", "单美元夹在中间");
});

测("⚠️ 这条是用户 2026-09-26 撞见过的那个现象：`$$E=mc^2$$` 挤在一行里，**现在原样存回**", () => {
  // 那时它存出去变成 `$E=mc^2$`（看着像"块级被降级成行内"）。判据是"用户写了什么
  // 就存什么"：挤在一行的 `$$…$$` 本来就是**行内**公式（块级要两个 `$$` 各占一行），
  // 而"行内的 `$$`"现在保留得住，所以这一条自己就对了。
  等(往返("$$E=mc^2$$").trim(), "$$E=mc^2$$", "一行里的 `$$…$$`");
});

测("块公式（`$$` 各占一行）走的是另一条路，同样不变", () => {
  等(往返("$$\nE=mc^2\n$$").trim(), "$$\nE=mc^2\n$$", "块公式");
});

测("一段里混着两种写法，各回各的", () => {
  等(往返("甲 $a$ 乙 $$b$$ 丙").trim(), "甲 $a$ 乙 $$b$$ 丙", "混着");
});

/* ── 收尾 ─────────────────────────────────────────────────────────────── */

console.log(`\n${"─".repeat(64)}`);
console.log(`通过 ${过} 条，失败 ${败} 条`);
if (败) {
  console.log(`失败的：\n  - ${败的.join("\n  - ")}`);
  process.exitCode = 1;
}
