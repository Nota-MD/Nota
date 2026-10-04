/**
 * `src/editor/math-delim.ts`（**行内公式用几个 `$`：用户敲几个就存几个**）的
 * **可运行**测试集。2026-09-27 写，同批落地的三件事见那个文件的文件头。
 *
 * ⚠️ **2026-10-04 又加了三组**（六、七、八）：那个文件里新长出来的第四格
 * `不转义美元`——用户第二次报「还是会自动插入斜杠」，这回那颗反斜杠是上游
 * `mdast-util-math` 给**正文里每一颗 `$`** 加的（`价格 100$ 起` ⇒ `价格 100\$ 起`，
 * 所见即所得里看不出来）。判据、代价与"哪些形状**故意**不动手"都在那边文件头，
 * 这里只放机器判据：第六组量那把尺子（`数美元`），第七组拿假原文量判据本身，
 * 第八组才上真机器（并与"不挂这一层"拍对照）。
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
import { defaultHandlers } from "mdast-util-to-markdown";
import { unified } from "unified";
import remarkParse from "remark-parse";
import remarkStringify from "remark-stringify";
import remarkMath from "remark-math";
import {
  数开头美元,
  标美元数插件,
  不转义美元,
  美元数属性,
  数美元,
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

/* ── 六、`数美元`（判据 2 那把尺子，纯函数）────────────────────────────── */

组("六、`数美元`（判据 2 那把尺子）");

测("字符串：数得准，而且**不挑是谁的字段**", () => {
  等(数美元("$ 你好 $"), 2, "一对");
  等(数美元("价格 100$ 起"), 1, "一颗");
  等(数美元("没有"), 0, "没有");
  等(数美元("$$x$$"), 4, "源码里四颗");
});

测("递归下去：数组、缩在 `children` 里的字符串都数", () => {
  等(数美元([{ type: "text", value: "甲$" }, { type: "text", value: "$乙" }]), 2, "分在兄弟里");
  等(数美元({ type: "paragraph", children: [{ type: "text", value: "a$$b" }] }), 2, "缩在 children 里");
});

测("⚠️ 公式节点的分隔符**不在任何字段里**，要按 `dollars` 现补回来", () => {
  // 不补的话"兄弟是一颗公式"会被数成 0 颗 ⇒ 判据 2 放行 ⇒ 替用户改字节。这条钉住它。
  等(数美元({ type: "inlineMath", value: "x" }), 2, "默认一颗 ⇒ 补 2");
  等(数美元({ type: "inlineMath", value: "x", data: { dollars: 2 } }), 4, "mdast 上的 `data.dollars`");
  等(数美元({ type: "inlineMath", value: "x", attrs: { dollars: 2 } }), 4, "搬进 PM 之后的 `attrs.dollars`");
  等(数美元({ type: "math", value: "x" }), 0, "块公式走另一条路（`type` 不是 `inlineMath`），不补");
});

测("不像话的输入 → 0，不抛", () => {
  等(数美元(undefined), 0, "undefined");
  等(数美元(null), 0, "null");
  等(数美元(7), 0, "数字");
});

/* ── 七、`不转义美元`：判据（假原文，不动真机器）───────────────────────── */

组("七、`不转义美元`（判据 1 ＋ 判据 2）");

/** 假装的上游那条 `handlers.text`：把每一颗 `$` 都转义（与 `mdast-util-math` 同形）。 */
const 假原文 = (node: { value?: string }): string => (node.value ?? "").replace(/\$/g, "\\$");

/** 跑一趟这一层：`父` 不给就是"认不出父节点"那一档。 */
const 跑美元 = (值: string, 父?: unknown): string =>
  不转义美元(假原文)(
    { type: "text", value: 值 } as never,
    父 as never,
    {} as never,
    {} as never,
  );

const 段 = (...children: unknown[]) => ({ type: "paragraph", children });

测("一对 ⇒ 放回 `$`（用户打它就是想写公式）", () => {
  等(跑美元("$ 你好 $", 段({ type: "text", value: "$ 你好 $" })), "$ 你好 $", "段落里的一对");
});

测("一颗孤立 ⇒ **也**放回（一颗拼不成公式，字节守恒）", () => {
  等(跑美元("价格 100$ 起", 段({ type: "text", value: "价格 100$ 起" })), "价格 100$ 起", "一颗");
});

测("判据 1：标题、表格格子也算认得的父", () => {
  等(跑美元("$ 甲 $", { type: "heading", children: [{ type: "text", value: "$ 甲 $" }] }), "$ 甲 $", "标题");
  等(跑美元("$ 甲 $", { type: "tableCell", children: [{ type: "text", value: "$ 甲 $" }] }), "$ 甲 $", "表格格子");
});

测("⚠️ 判据 1：父是粗体/链接 ⇒ **一个字都不动**（跨过行内节点的配对是真的）", () => {
  等(跑美元("$ 你好 $", { type: "strong", children: [{ type: "text", value: "$ 你好 $" }] }), "\\$ 你好 \\$", "粗体");
  等(跑美元("$ 你好 $", { type: "link", children: [{ type: "text", value: "$ 你好 $" }] }), "\\$ 你好 \\$", "链接");
});

测("判据 1：`parent` 没到手 ⇒ 不动", () => {
  等(跑美元("$ 你好 $"), "\\$ 你好 \\$", "没有父");
});

测("⚠️ 判据 2：兄弟里还有带 `$` 的文本 ⇒ 不动（看不清就别替用户改）", () => {
  等(
    跑美元("甲 $ 乙", 段({ type: "text", value: "甲 $ 乙" }, { type: "text", value: "丙 $ 丁" })),
    "甲 \\$ 乙",
    "兄弟里还有一颗",
  );
});

测("⚠️ 判据 2：兄弟是一颗公式 ⇒ 不动（那两颗由 `dollars` 补回来，别数漏）", () => {
  等(
    跑美元("甲 $ 乙", 段({ type: "text", value: "甲 $ 乙" }, { type: "inlineMath", value: "x" })),
    "甲 \\$ 乙",
    "公式也算 `$`",
  );
});

测("输出里没有 `\\$` ⇒ 原样（顺带：`$` 由上一层的产物决定，本层不加）", () => {
  等(跑美元("甲 乙", 段({ type: "text", value: "甲 乙" })), "甲 乙", "没有美元");
});

测("⚠️ 前面已经是反斜杠的不碰（`\\\\$` 那种是文件里本来就有的字节）", () => {
  // 真字节：`甲 \ \ $ 乙` —— 那颗 `$` 前面紧挨着反斜杠，正则不认它。
  const 带反斜杠 = (): string => "甲\\\\$乙";
  const 出 = 不转义美元(带反斜杠 as never)(
    { type: "text", value: "" } as never,
    段() as never,
    {} as never,
    {} as never,
  );
  等(出, "甲\\\\$乙", "不重复处理");
});

测("没有原文 ⇒ 交节点原值（本仓惯例）", () => {
  等(
    不转义美元()({ type: "text", value: "$ 甲 $" } as never, undefined as never, {} as never, {} as never),
    "$ 甲 $",
    "原值",
  );
});

/* ── 八、端到端：正文里的 `$`（真两台状态机 ＋ 本仓那层）──────────────── */

组("八、端到端：正文里的 `$` 不要被写进文件");

/**
 * 与上面那台**同形**，只多了 `handlers.text` 这一条（＝ `text-handlers.ts` 里
 * 套在行首竖线那层里面的那一层）。两台并排放着，是为了能拍出"挂了 / 不挂"的对照。
 */
const 处理机带文本层 = unified()
  .use(remarkParse)
  .use(remarkMath)
  .use(标美元数插件)
  .use(remarkStringify, {
    handlers: { inlineMath: 行内公式处理器(), text: 不转义美元(defaultHandlers.text) },
  });

const 解析带 = ParserState.create(schema, 处理机带文本层);
const 序列化带 = SerializerState.create(schema, 处理机带文本层);
const 往返带 = (源: string): string => 序列化带(解析带(源));

测("⚠️ 对照：**没有**这一层时，一颗孤立的 `$` 真的会被写成 `\\$`", () => {
  等(往返("商品 100$ 起\n").trim(), "商品 100\\$ 起", "上游那条 unsafe 的原样");
});

测("挂着这一层：`商品 100$ 起` 逐字节不变（一颗拼不成公式）", () => {
  等(往返带("商品 100$ 起\n").trim(), "商品 100$ 起", "一颗");
});

测("挂着这一层：`甲 $ 乙` 逐字节不变", () => {
  等(往返带("甲 $ 乙\n").trim(), "甲 $ 乙", "一颗夹在中间");
});

测("⚠️ 伤文件自愈：`\\$ 你好 \\$` ⇒ 放回来，**第二趟才收敛**", () => {
  // 两颗放回来会重新配成一对 `$`——那正是"用户本来想写的东西"（见文件头那张表）。
  const 一次 = 往返带("\\$ 你好 \\$\n").trim();
  等(一次, "$ 你好 $", "放回来");
  // ⚠️ **第二趟还会再变一次**：这一趟写出去的是正文（`\$ 你好 \$` 被放回来），
  // 重新打开时那对 `$` 就成了**公式**（第五格 2026-10-04 撤回之后就是它了），
  // 而公式的值两端被上游 trim ⇒ `$你好$`。**这是两趟、不是一趟**，如实钉住：
  // 用户看到的是"打开、存一次、再打开，里外两个空格没了"。
  等(往返带(`${一次}\n`).trim(), "$你好$", "第二趟：成了公式，空格被 trim");
  等(往返带("$你好$\n").trim(), "$你好$", "第三趟起稳定");
  等(往返带("$你好$\n").trim(), "$你好$", "贴着写的仍是公式，不抖");
});

测("⚠️ 这一层**没有**碰公式：那几条一字不差（`inlineMath` 的处理器照旧）", () => {
  等(往返带("甲 $x$ 乙\n").trim(), "甲 $x$ 乙", "行内公式");
  等(往返带("$$x$$\n").trim(), "$$x$$", "行内 `$$`");
  等(往返带("甲 $a$ 乙 $$b$$ 丙\n").trim(), "甲 $a$ 乙 $$b$$ 丙", "混着");
});

测("⚠️ 算不清的形状照旧带着 `\\$`（如实钉住，别自欺）", () => {
  // `公式 $x$ 和 100$`：兄弟里有公式 ⇒ 判据 2 不成立 ⇒ 那一颗不动。
  等(往返带("公式 $x$ 和 100$\n").trim(), "公式 $x$ 和 100\\$", "挨着公式的那一颗");
});

测("⚠️ 第五格撤回之后：「挨着空格的 `$…$`」＋「真公式」这一段也逐字节稳定", () => {
  // 撤回了第五格，第一对 `$` 就**是**公式了（值两端被 trim），于是这一段里
  // 一颗反斜杠都不该冒出来——**这正是用户要的**（他要的是 `$ \LaTeX $` 能渲染）。
  等(
    往返带("甲 $ 你好 $ 和 $x$\n").trim(),
    "甲 $你好$ 和 $x$",
    "两对 `$` 都是公式，谁也不用转义",
  );
});

/* ── 九、第五格**已撤回**：贴空格的 `$…$` 照旧是公式（2026-10-04 用户拍板）── */

组("九、第五格已撤回：贴空格的 `$…$` 照旧是公式");

// 2026-10-04 早些时候照 Typora/Pandoc 加过一格「值两边紧挨空格的 `$…$` 不算公式」，
// 当天下午用户就在分屏预览里发现它把 `$ \LaTeX $` 这种**带空格的常见写法**也判成了
// 普通文字，当场拍了「整条撤回」。这一组量的是**撤回之后**的行为，它同时钉两件事：
// ① 这类写法**是**公式（预览里渲染得出来，那正是用户要的）；② 代价：存盘会把值两端
// 那两颗空格 trim 掉——**知情接受**的，记成已知差别。
// ⚠️ 谁要再照 Typora 加回来，先看 `src/editor/math-delim.ts` 文件头最后那段 ⚠️：
// 那里写着当天为什么加、为什么撤、以及再想加得先解决什么。

测("⚠️ 解析那一趟：`$ 你好 $` 与 `$ \\LaTeX $` **都是**公式节点", () => {
  for (const [源, 值] of [
    ["$ 你好 $", "你好"],
    ["$ \\LaTeX $", "\\LaTeX"],
  ] as const) {
    const 文档 = 解析(源);
    let 公式 = 0;
    let 拿到 = "";
    文档.descendants((节点) => {
      if (节点.type.name === "math_inline") {
        公式++;
        拿到 = 节点.textContent;
      }
      return true;
    });
    等(公式, 1, `${JSON.stringify(源)} 该是一颗公式（撤回之后就是它了）`);
    等(拿到, 值, `${JSON.stringify(源)} 的值——两端空白被**上游** trim 掉，不是本仓干的`);
  }
});

测("⚠️ 代价（已知差别）：存盘会把值两端那两颗空格 trim 掉", () => {
  // 加第五格之前就是这个行为，撤回等于回到它——**不是新 bug**，但也确实改了字节。
  // 真要保住那两颗空格，只有"另记一处状态"那条路（`dollars` 的做法，用户这次没要）。
  等(往返带("$ 你好 $\n"), "$你好$\n", "`$ 你好 $` → 里外两个空格没了");
  等(往返带("$ \\LaTeX $\n"), "$\\LaTeX$\n", "`$ \\LaTeX $` 同理——这正是用户报的那条");
  // ⚠️ 再存一次**不再变**：只漂一次，不会一路漂下去。
  等(往返带(往返带("$ 你好 $\n")), "$你好$\n", "第二趟稳定");
});

测("本来就贴着实心的那些，一个字都不动", () => {
  for (const 源 of ["$x$", "$E=mc^2$", "$\\LaTeX$", "甲 $E=mc^2$ 乙", "$$x$$"]) {
    等(往返带(`${源}\n`), `${源}\n`, `往返：${JSON.stringify(源)}`);
  }
});

/* ── 收尾 ─────────────────────────────────────────────────────────────── */

console.log(`\n${"─".repeat(64)}`);
console.log(`通过 ${过} 条，失败 ${败} 条`);
if (败) {
  console.log(`失败的：\n  - ${败的.join("\n  - ")}`);
  process.exitCode = 1;
}
