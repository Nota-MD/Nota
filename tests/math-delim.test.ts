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
  numberOpenHeadDollarDollar,
  markDollarDollarNumberPlugin,
  notConvertMeaningDollarDollar,
  dollarCountAttribute,
  countDollars,
  inlineMathHandler,
  inlineMathSpec,
  readDollarCount,
} from "../src/editor/math-delim";

/* ── 一支极小的测试工装（与 `math-input.test.ts` / `math-view.test.ts` 同一套长相）── */

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

/* ── 真规格 → 真 Schema → 真两台状态机 ─────────────────────────────────── */

const ctx = new Ctx(new Container(), {} as never);
ctx.inject(nodesCtx);
katexOptionsCtx(ctx);
mathInlineSchema.ctx(ctx);
// ⚠️ 上游那份也注入一份：`行内公式规格` 是**在它的基础上**改出来的，本文件要能
// 对比"改了哪几处、没动哪几处"（下面第二组就是干这个的）。
mathBlockSchema.ctx(ctx);
// 本仓那份的切片也要登记，`ctx.get(行内公式规格.key)` 才取得到。
inlineMathSpec.ctx(ctx);

/** 上游那份 `math_inline` 规格。 */
const upstreamSpec = ctx.get(mathInlineSchema.key)(ctx);
/** **本仓**那份（加了 `dollars`、换了两个 `runner`）。 */
const inlineSpec = ctx.get(inlineMathSpec.key)(ctx);

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
const getNameSingle = (): string[] => (ctx.get(nodesCtx) as [string, unknown][]).map(([id]) => id);

let runOfBefore: string[] = [];
let runOfAfter: string[] = [];
let replacePassOfThatPart: unknown = null;
let pluginRunFailed = "";
try {
  const upstreamPlugin = (mathInlineSchema as unknown as { node: (c: Ctx) => () => Promise<void> }).node;
  await upstreamPlugin(ctx)();
  runOfBefore = getNameSingle();

  const builtinPlugin = (inlineMathSpec as unknown as { node: (c: Ctx) => () => Promise<void> }).node;
  await builtinPlugin(ctx)();
  runOfAfter = getNameSingle();
  replacePassOfThatPart = (ctx.get(nodesCtx) as [string, unknown][]).find(([id]) => id === "math_inline")?.[1];
} catch (e) {
  pluginRunFailed = e instanceof Error ? e.message : String(e);
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
    math_inline: inlineSpec,
    math_block: ctx.get(mathBlockSchema.key)(ctx),
  },
});

/**
 * 一台真处理机：**与 `create.ts` 那条链同形**——`remark-parse` ＋ `remark-math`
 * ＋ 本仓那个标注插件（排在 `remark-math` **后面**，转换器按注册顺序跑），
 * 序列化那一侧挂着本仓那条 handler。
 */
const placeManageMachine = unified()
  .use(remarkParse)
  .use(remarkMath)
  .use(markDollarDollarNumberPlugin)
  .use(remarkStringify, {
    handlers: { inlineMath: inlineMathHandler() },
  });

const parse = ParserState.create(schema, placeManageMachine);
const serialize = SerializerState.create(schema, placeManageMachine);

/** 一整趟：markdown → 文档 → markdown。**两个方向都是真代码**。 */
const roundtrip = (source3: string): string => serialize(parse(source3));

/** 文档里第一颗 `math_inline`（没有就 `null`）。 */
function headOneTokenInline(doc: PMNode): PMNode | null {
  let findTo: PMNode | null = null;
  doc.descendants((node) => {
    if (!findTo && node.type.name === "math_inline") {
      findTo = node;
      return false;
    }
    return true;
  });
  return findTo;
}

/* ── 一、数源码里那几个 `$`（纯函数）──────────────────────────────────── */

group("一、`数开头美元`（纯函数）");

testCase("`$$x$$` 数出 2、`$x$` 数出 1", () => {
  equal(numberOpenHeadDollarDollar("$$x$$", 0), 2, "两个 `$`");
  equal(numberOpenHeadDollarDollar("$x$", 0), 1, "一个 `$`");
});

testCase("偏移指的不是 `$`（位置算歪了）→ 退回 1，不硬猜", () => {
  // ⚠️ 退回 1 的代价只是"这一次没保留住"；要是硬按"数到几个算几个"，
  // 写出 0 个 `$` 就把公式拆成两半了。
  equal(numberOpenHeadDollarDollar("甲$$x$$", 0), 1, "开头是普通字");
  equal(numberOpenHeadDollarDollar("", 0), 1, "空源");
  equal(numberOpenHeadDollarDollar("$x$", 5), 1, "越界");
});

testCase("三个及以上的 `$` → 夹到 2（那种源码 micromark 不当公式读，到不了这里）", () => {
  equal(numberOpenHeadDollarDollar("$$$ab$$", 0), 2, "三个");
  equal(numberOpenHeadDollarDollar("$$$$ab$$", 0), 2, "四个");
});

testCase("`读美元数`：没有这个属性就是 1（老数据、粘贴、手工建节点都走这条）", () => {
  equal(readDollarCount({}), 1, "空对象");
  equal(readDollarCount({ attrs: {} }), 1, "attrs 里没有");
  equal(readDollarCount({ attrs: { [dollarCountAttribute]: 2 } }), 2, "attrs 里是 2");
  equal(readDollarCount({ data: { [dollarCountAttribute]: 2 } }), 2, "mdast 那边（data 里）也认");
  equal(readDollarCount({ attrs: { [dollarCountAttribute]: 3 } }), 1, "歪了的值 → 1");
});

/* ── 二、规格：只多了 `dollars`，别的字段一个没动 ─────────────────────── */

group("二、`行内公式规格`（真 `$nodeSchema`，两个插件都真跑了一遍）");

testCase("⚠️ 两个插件都**真的跑起来**了（不是在声明层面比比而已）", () => {
  if (pluginRunFailed) throw new Error(`跑插件时报错：${pluginRunFailed}`);
  if (!runOfBefore.includes("math_inline")) throw new Error(`上游那份没登记进去，节点名单是 ${JSON.stringify(runOfBefore)}`);
  equal(runOfAfter.length, runOfBefore.length, "登记条数没变（是替换，不是又插一条）");
});

testCase("⚠️⚠️ 替换是**就地**的：`math_inline` 在名单里的位置一个字都没动", () => {
  // 这就是"用顶层 `$nodeSchema` 而不是 plugin-math 那份 `extendSchema`"的全部理由
  // （后者会把它挪到末尾）。名单里现在只有这几个节点，但**下标相等**这条判据
  // 与"名单里有多少个"无关，是硬的。
  equal(runOfAfter.indexOf("math_inline"), runOfBefore.indexOf("math_inline"), "在 `nodesCtx` 里的下标");
  if (JSON.stringify(runOfAfter) !== JSON.stringify(runOfBefore)) {
    throw new Error(`名单整体变了：\n  跑之前 ${JSON.stringify(runOfBefore)}\n  跑之后 ${JSON.stringify(runOfAfter)}`);
  }
});

testCase("替换之后 `nodesCtx` 里那一份**就是本仓这份**（带 `dollars`、带我们的 runner）", () => {
  const replacePassOf = replacePassOfThatPart as { attrs?: Record<string, { default?: unknown }> } | null;
  equal(replacePassOf?.attrs?.[dollarCountAttribute]?.default, 1, "dollars 默认 1");
});

testCase("上游那份**没有** attrs；本仓这份多了一个 `dollars`，默认 1", () => {
  equal(upstreamSpec.attrs, undefined, "上游：连属性都没有");
  equal(inlineSpec.attrs?.[dollarCountAttribute]?.default, 1, "本仓：dollars 默认 1");
});

testCase("别的字段一个没丢：atom / inline / content / parseDOM / toDOM 都还在", () => {
  equal(inlineSpec.atom, true, "atom");
  equal(inlineSpec.inline, true, "inline");
  equal(inlineSpec.content, "text*", "content");
  equal(typeof inlineSpec.parseDOM, "object", "parseDOM");
  equal(typeof inlineSpec.toDOM, "function", "toDOM");
});

testCase("两个 runner 还在，而且**源码那条没写错**：行内的源码在**内容**里", () => {
  // ⚠️ 这是 `math-view.ts` 文件头点名的那个坑：行内取 `content`、块取 `attrs.value`。
  // 换 runner 时最怕"顺手改成读属性"——那个错**不报错、只丢字**。
  const node = schema.nodes.math_inline.create({ [dollarCountAttribute]: 2 }, schema.text("x^2"));
  equal(node.textContent, "x^2", "内容里是源码");
  equal(node.attrs[dollarCountAttribute], 2, "属性里是那个数");
});

/* ── 三、解析那一趟：源码里那几个 `$` 真的标上去了 ─────────────────────── */

group("三、解析（真 `remark-parse` ＋ `remark-math` ＋ 真 `ParserState`）");

testCase("`$$x$$` → 那颗节点上标着 2；`$x$` → 1", () => {
  equal(readDollarCount(headOneTokenInline(parse("$$x$$"))!), 2, "两个 `$`");
  equal(readDollarCount(headOneTokenInline(parse("$x$"))!), 1, "一个 `$`");
});

testCase("标的是**源码里那几个字节**，跟公式里写什么无关", () => {
  equal(readDollarCount(headOneTokenInline(parse("$$\\frac{a}{b}$$"))!), 2, "反斜杠与花括号");
  equal(readDollarCount(headOneTokenInline(parse("$$a=b \\text{ 甲 }$$"))!), 2, "值里有空格与中文");
  equal(readDollarCount(headOneTokenInline(parse("$$𝒜$$"))!), 2, "星光面字符（按字节偏移数，不看长度）");
});

testCase("行内公式夹在文字中间、段首、段尾都标得到", () => {
  equal(readDollarCount(headOneTokenInline(parse("甲 $$x$$ 乙"))!), 2, "夹在中间");
  equal(readDollarCount(headOneTokenInline(parse("$$x$$ 乙"))!), 2, "段首");
  equal(readDollarCount(headOneTokenInline(parse("甲 $$x$$"))!), 2, "段尾");
});

testCase("同一段里好几颗，各标各的（**不是只看第一颗**）", () => {
  const doc = parse("甲 $a$ 乙 $$b$$ 丙");
  const numbers: number[] = [];
  doc.descendants((node) => {
    if (node.type.name === "math_inline") numbers.push(readDollarCount(node));
    return true;
  });
  const expected = [1, 2];
  if (JSON.stringify(numbers) !== JSON.stringify(expected)) {
    throw new Error(`期望 ${JSON.stringify(expected)}，实际 ${JSON.stringify(numbers)}`);
  }
});

testCase("不是公式的 `$`（没闭合、三个 `$`）一个都不标——本来就没节点", () => {
  equal(headOneTokenInline(parse("甲 $x 乙")), null, "没闭合");
  equal(headOneTokenInline(parse("甲 $$$ab$$ 乙")), null, "三个 `$` 起不来（整段字面）");
});

/* ── 四、存盘那一趟：按那个数写回去 ───────────────────────────────────── */

group("四、存盘（真 `SerializerState` ＋ 本仓那条 handler）");

testCase("`dollars = 2` 写出两个 `$`；`1` 写回一个（**这就是用户要的那件事**）", () => {
  const twoTokens = schema.topNodeType.create(null, [
    schema.nodes.paragraph.create(null, schema.nodes.math_inline.create({ [dollarCountAttribute]: 2 }, schema.text("x"))),
  ]);
  const oneToken = schema.topNodeType.create(null, [
    schema.nodes.paragraph.create(null, schema.nodes.math_inline.create({ [dollarCountAttribute]: 1 }, schema.text("x"))),
  ]);
  equal(serialize(twoTokens).trim(), "$$x$$", "两颗");
  equal(serialize(oneToken).trim(), "$x$", "一颗");
});

testCase("手工建出来的节点（没有那个属性）→ 按 1 写，不会凭空多出一个 `$`", () => {
  const doc = schema.topNodeType.create(null, [
    schema.nodes.paragraph.create(null, schema.nodes.math_inline.create(null, schema.text("x"))),
  ]);
  equal(serialize(doc).trim(), "$x$", "默认值那条路");
});

testCase("值里有孤立 `$` 时照旧往上加（上游那套还在，没被我们盖掉）", () => {
  // `$$a$b$$` 的值是 `a$b`——两个 `$` 挨着会提前闭合，所以 mdast 那边算出来还是 2。
  // 这一条是"我们没有把上游那两段边界处理弄丢"的机器判据。
  const doc = schema.topNodeType.create(null, [
    schema.nodes.paragraph.create(null, schema.nodes.math_inline.create({ [dollarCountAttribute]: 2 }, schema.text("a$b"))),
  ]);
  equal(serialize(doc).trim(), "$$a$b$$", "值里有 `$`");
});

/* ── 五、端到端：打开再存，字节不变 ───────────────────────────────────── */

group("五、往返（解析 → 文档 → 序列化）");

testCase("用户举的那个例子（`docs/07` 第 53 项）：一整句夹着公式，逐字节回来", () => {
  // ⚠️ 这里**没写**用户原话里的 `**粗体**`——粗体不在本文件这份最小 schema 里，
  // 它会被当成两个字面 `*`。那是"最小 schema 少了个节点"，不是公式的事；
  // 所以源码里去掉它，剩下的部分要求一字不差。
  const source3 = "牛顿-莱布尼茨公式是这样的：$$\\int_a^b f(x)dx=F(x)\\big|_a^b$$ 也是可以的。";
  equal(roundtrip(source3).trim(), source3, "带反斜杠命令的长行内公式");
});

testCase("行内 `$$x$$` / `$x$` / 夹在文字里：三种都一字不差", () => {
  equal(roundtrip("$$x$$").trim(), "$$x$$", "独占一段的 `$$`");
  equal(roundtrip("$x$").trim(), "$x$", "独占一段的 `$`");
  equal(roundtrip("甲 $$x$$ 乙").trim(), "甲 $$x$$ 乙", "夹在中间");
  equal(roundtrip("甲 $x$ 乙").trim(), "甲 $x$ 乙", "单美元夹在中间");
});

testCase("⚠️ 这条是用户 2026-09-26 撞见过的那个现象：`$$E=mc^2$$` 挤在一行里，**现在原样存回**", () => {
  // 那时它存出去变成 `$E=mc^2$`（看着像"块级被降级成行内"）。判据是"用户写了什么
  // 就存什么"：挤在一行的 `$$…$$` 本来就是**行内**公式（块级要两个 `$$` 各占一行），
  // 而"行内的 `$$`"现在保留得住，所以这一条自己就对了。
  equal(roundtrip("$$E=mc^2$$").trim(), "$$E=mc^2$$", "一行里的 `$$…$$`");
});

testCase("块公式（`$$` 各占一行）走的是另一条路，同样不变", () => {
  equal(roundtrip("$$\nE=mc^2\n$$").trim(), "$$\nE=mc^2\n$$", "块公式");
});

testCase("一段里混着两种写法，各回各的", () => {
  equal(roundtrip("甲 $a$ 乙 $$b$$ 丙").trim(), "甲 $a$ 乙 $$b$$ 丙", "混着");
});

/* ── 六、`数美元`（判据 2 那把尺子，纯函数）────────────────────────────── */

group("六、`数美元`（判据 2 那把尺子）");

testCase("字符串：数得准，而且**不挑是谁的字段**", () => {
  equal(countDollars("$ 你好 $"), 2, "一对");
  equal(countDollars("价格 100$ 起"), 1, "一颗");
  equal(countDollars("没有"), 0, "没有");
  equal(countDollars("$$x$$"), 4, "源码里四颗");
});

testCase("递归下去：数组、缩在 `children` 里的字符串都数", () => {
  equal(countDollars([{ type: "text", value: "甲$" }, { type: "text", value: "$乙" }]), 2, "分在兄弟里");
  equal(countDollars({ type: "paragraph", children: [{ type: "text", value: "a$$b" }] }), 2, "缩在 children 里");
});

testCase("⚠️ 公式节点的分隔符**不在任何字段里**，要按 `dollars` 现补回来", () => {
  // 不补的话"兄弟是一颗公式"会被数成 0 颗 ⇒ 判据 2 放行 ⇒ 替用户改字节。这条钉住它。
  equal(countDollars({ type: "inlineMath", value: "x" }), 2, "默认一颗 ⇒ 补 2");
  equal(countDollars({ type: "inlineMath", value: "x", data: { dollars: 2 } }), 4, "mdast 上的 `data.dollars`");
  equal(countDollars({ type: "inlineMath", value: "x", attrs: { dollars: 2 } }), 4, "搬进 PM 之后的 `attrs.dollars`");
  equal(countDollars({ type: "math", value: "x" }), 0, "块公式走另一条路（`type` 不是 `inlineMath`），不补");
});

testCase("不像话的输入 → 0，不抛", () => {
  equal(countDollars(undefined), 0, "undefined");
  equal(countDollars(null), 0, "null");
  equal(countDollars(7), 0, "数字");
});

/* ── 七、`不转义美元`：判据（假原文，不动真机器）───────────────────────── */

group("七、`不转义美元`（判据 1 ＋ 判据 2）");

/** 假装的上游那条 `handlers.text`：把每一颗 `$` 都转义（与 `mdast-util-math` 同形）。 */
const fakeSource = (node: { value?: string }): string => (node.value ?? "").replace(/\$/g, "\\$");

/** 跑一趟这一层：`父` 不给就是"认不出父节点"那一档。 */
const runDollarDollar = (value2: string, parent?: unknown): string =>
  notConvertMeaningDollarDollar(fakeSource)(
    { type: "text", value: value2 } as never,
    parent as never,
    {} as never,
    {} as never,
  );

const paragraph2 = (...children: unknown[]) => ({ type: "paragraph", children });

testCase("一对 ⇒ 放回 `$`（用户打它就是想写公式）", () => {
  equal(runDollarDollar("$ 你好 $", paragraph2({ type: "text", value: "$ 你好 $" })), "$ 你好 $", "段落里的一对");
});

testCase("一颗孤立 ⇒ **也**放回（一颗拼不成公式，字节守恒）", () => {
  equal(runDollarDollar("价格 100$ 起", paragraph2({ type: "text", value: "价格 100$ 起" })), "价格 100$ 起", "一颗");
});

testCase("判据 1：标题、表格格子也算认得的父", () => {
  equal(runDollarDollar("$ 甲 $", { type: "heading", children: [{ type: "text", value: "$ 甲 $" }] }), "$ 甲 $", "标题");
  equal(runDollarDollar("$ 甲 $", { type: "tableCell", children: [{ type: "text", value: "$ 甲 $" }] }), "$ 甲 $", "表格格子");
});

testCase("⚠️ 判据 1：父是粗体/链接 ⇒ **一个字都不动**（跨过行内节点的配对是真的）", () => {
  equal(runDollarDollar("$ 你好 $", { type: "strong", children: [{ type: "text", value: "$ 你好 $" }] }), "\\$ 你好 \\$", "粗体");
  equal(runDollarDollar("$ 你好 $", { type: "link", children: [{ type: "text", value: "$ 你好 $" }] }), "\\$ 你好 \\$", "链接");
});

testCase("判据 1：`parent` 没到手 ⇒ 不动", () => {
  equal(runDollarDollar("$ 你好 $"), "\\$ 你好 \\$", "没有父");
});

testCase("⚠️ 判据 2：兄弟里还有带 `$` 的文本 ⇒ 不动（看不清就别替用户改）", () => {
  equal(
    runDollarDollar("甲 $ 乙", paragraph2({ type: "text", value: "甲 $ 乙" }, { type: "text", value: "丙 $ 丁" })),
    "甲 \\$ 乙",
    "兄弟里还有一颗",
  );
});

testCase("⚠️ 判据 2：兄弟是一颗公式 ⇒ 不动（那两颗由 `dollars` 补回来，别数漏）", () => {
  equal(
    runDollarDollar("甲 $ 乙", paragraph2({ type: "text", value: "甲 $ 乙" }, { type: "inlineMath", value: "x" })),
    "甲 \\$ 乙",
    "公式也算 `$`",
  );
});

testCase("输出里没有 `\\$` ⇒ 原样（顺带：`$` 由上一层的产物决定，本层不加）", () => {
  equal(runDollarDollar("甲 乙", paragraph2({ type: "text", value: "甲 乙" })), "甲 乙", "没有美元");
});

testCase("⚠️ 前面已经是反斜杠的不碰（`\\\\$` 那种是文件里本来就有的字节）", () => {
  // 真字节：`甲 \ \ $ 乙` —— 那颗 `$` 前面紧挨着反斜杠，正则不认它。
  const withReverseSlantBar = (): string => "甲\\\\$乙";
  const output2 = notConvertMeaningDollarDollar(withReverseSlantBar as never)(
    { type: "text", value: "" } as never,
    paragraph2() as never,
    {} as never,
    {} as never,
  );
  equal(output2, "甲\\\\$乙", "不重复处理");
});

testCase("没有原文 ⇒ 交节点原值（本仓惯例）", () => {
  equal(
    notConvertMeaningDollarDollar()({ type: "text", value: "$ 甲 $" } as never, undefined as never, {} as never, {} as never),
    "$ 甲 $",
    "原值",
  );
});

/* ── 八、端到端：正文里的 `$`（真两台状态机 ＋ 本仓那层）──────────────── */

group("八、端到端：正文里的 `$` 不要被写进文件");

/**
 * 与上面那台**同形**，只多了 `handlers.text` 这一条（＝ `text-handlers.ts` 里
 * 套在行首竖线那层里面的那一层）。两台并排放着，是为了能拍出"挂了 / 不挂"的对照。
 */
const placeManageMachineWithTextLayer = unified()
  .use(remarkParse)
  .use(remarkMath)
  .use(markDollarDollarNumberPlugin)
  .use(remarkStringify, {
    handlers: { inlineMath: inlineMathHandler(), text: notConvertMeaningDollarDollar(defaultHandlers.text) },
  });

const parseWith = ParserState.create(schema, placeManageMachineWithTextLayer);
const serializeWith = SerializerState.create(schema, placeManageMachineWithTextLayer);
const roundtripWith = (source3: string): string => serializeWith(parseWith(source3));

testCase("⚠️ 对照：**没有**这一层时，一颗孤立的 `$` 真的会被写成 `\\$`", () => {
  equal(roundtrip("商品 100$ 起\n").trim(), "商品 100\\$ 起", "上游那条 unsafe 的原样");
});

testCase("挂着这一层：`商品 100$ 起` 逐字节不变（一颗拼不成公式）", () => {
  equal(roundtripWith("商品 100$ 起\n").trim(), "商品 100$ 起", "一颗");
});

testCase("挂着这一层：`甲 $ 乙` 逐字节不变", () => {
  equal(roundtripWith("甲 $ 乙\n").trim(), "甲 $ 乙", "一颗夹在中间");
});

testCase("⚠️ 伤文件自愈：`\\$ 你好 \\$` ⇒ 放回来，**第二趟才收敛**", () => {
  // 两颗放回来会重新配成一对 `$`——那正是"用户本来想写的东西"（见文件头那张表）。
  const once = roundtripWith("\\$ 你好 \\$\n").trim();
  equal(once, "$ 你好 $", "放回来");
  // ⚠️ **第二趟还会再变一次**：这一趟写出去的是正文（`\$ 你好 \$` 被放回来），
  // 重新打开时那对 `$` 就成了**公式**（第五格 2026-10-04 撤回之后就是它了），
  // 而公式的值两端被上游 trim ⇒ `$你好$`。**这是两趟、不是一趟**，如实钉住：
  // 用户看到的是"打开、存一次、再打开，里外两个空格没了"。
  equal(roundtripWith(`${once}\n`).trim(), "$你好$", "第二趟：成了公式，空格被 trim");
  equal(roundtripWith("$你好$\n").trim(), "$你好$", "第三趟起稳定");
  equal(roundtripWith("$你好$\n").trim(), "$你好$", "贴着写的仍是公式，不抖");
});

testCase("⚠️ 这一层**没有**碰公式：那几条一字不差（`inlineMath` 的处理器照旧）", () => {
  equal(roundtripWith("甲 $x$ 乙\n").trim(), "甲 $x$ 乙", "行内公式");
  equal(roundtripWith("$$x$$\n").trim(), "$$x$$", "行内 `$$`");
  equal(roundtripWith("甲 $a$ 乙 $$b$$ 丙\n").trim(), "甲 $a$ 乙 $$b$$ 丙", "混着");
});

testCase("⚠️ 算不清的形状照旧带着 `\\$`（如实钉住，别自欺）", () => {
  // `公式 $x$ 和 100$`：兄弟里有公式 ⇒ 判据 2 不成立 ⇒ 那一颗不动。
  equal(roundtripWith("公式 $x$ 和 100$\n").trim(), "公式 $x$ 和 100\\$", "挨着公式的那一颗");
});

testCase("⚠️ 第五格撤回之后：「挨着空格的 `$…$`」＋「真公式」这一段也逐字节稳定", () => {
  // 撤回了第五格，第一对 `$` 就**是**公式了（值两端被 trim），于是这一段里
  // 一颗反斜杠都不该冒出来——**这正是用户要的**（他要的是 `$ \LaTeX $` 能渲染）。
  equal(
    roundtripWith("甲 $ 你好 $ 和 $x$\n").trim(),
    "甲 $你好$ 和 $x$",
    "两对 `$` 都是公式，谁也不用转义",
  );
});

/* ── 九、第五格**已撤回**：贴空格的 `$…$` 照旧是公式（2026-10-04 用户拍板）── */

group("九、第五格已撤回：贴空格的 `$…$` 照旧是公式");

// 2026-10-04 早些时候照 Typora/Pandoc 加过一格「值两边紧挨空格的 `$…$` 不算公式」，
// 当天下午用户就在分屏预览里发现它把 `$ \LaTeX $` 这种**带空格的常见写法**也判成了
// 普通文字，当场拍了「整条撤回」。这一组量的是**撤回之后**的行为，它同时钉两件事：
// ① 这类写法**是**公式（预览里渲染得出来，那正是用户要的）；② 代价：存盘会把值两端
// 那两颗空格 trim 掉——**知情接受**的，记成已知差别。
// ⚠️ 谁要再照 Typora 加回来，先看 `src/editor/math-delim.ts` 文件头最后那段 ⚠️：
// 那里写着当天为什么加、为什么撤、以及再想加得先解决什么。

testCase("⚠️ 解析那一趟：`$ 你好 $` 与 `$ \\LaTeX $` **都是**公式节点", () => {
  for (const [source3, value2] of [
    ["$ 你好 $", "你好"],
    ["$ \\LaTeX $", "\\LaTeX"],
  ] as const) {
    const document = parse(source3);
    let commonStyle = 0;
    let takeTo = "";
    document.descendants((node) => {
      if (node.type.name === "math_inline") {
        commonStyle++;
        takeTo = node.textContent;
      }
      return true;
    });
    equal(commonStyle, 1, `${JSON.stringify(source3)} 该是一颗公式（撤回之后就是它了）`);
    equal(takeTo, value2, `${JSON.stringify(source3)} 的值——两端空白被**上游** trim 掉，不是本仓干的`);
  }
});

testCase("⚠️ 代价（已知差别）：存盘会把值两端那两颗空格 trim 掉", () => {
  // 加第五格之前就是这个行为，撤回等于回到它——**不是新 bug**，但也确实改了字节。
  // 真要保住那两颗空格，只有"另记一处状态"那条路（`dollars` 的做法，用户这次没要）。
  equal(roundtripWith("$ 你好 $\n"), "$你好$\n", "`$ 你好 $` → 里外两个空格没了");
  equal(roundtripWith("$ \\LaTeX $\n"), "$\\LaTeX$\n", "`$ \\LaTeX $` 同理——这正是用户报的那条");
  // ⚠️ 再存一次**不再变**：只漂一次，不会一路漂下去。
  equal(roundtripWith(roundtripWith("$ 你好 $\n")), "$你好$\n", "第二趟稳定");
});

testCase("本来就贴着实心的那些，一个字都不动", () => {
  for (const source3 of ["$x$", "$E=mc^2$", "$\\LaTeX$", "甲 $E=mc^2$ 乙", "$$x$$"]) {
    equal(roundtripWith(`${source3}\n`), `${source3}\n`, `往返：${JSON.stringify(source3)}`);
  }
});

/* ── 收尾 ─────────────────────────────────────────────────────────────── */

console.log(`\n${"─".repeat(64)}`);
console.log(`通过 ${pass} 条，失败 ${fail} 条`);
if (fail) {
  console.log(`失败的：\n  - ${failed.join("\n  - ")}`);
  process.exitCode = 1;
}
