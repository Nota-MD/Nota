/**
 * `src/editor/math-input.ts`（行内公式的两条**打字**规则）的**可运行**测试集。
 *
 * # 跑法（不装任何包：`esbuild` 与 `node` 仓库里都现成）
 *
 * ```sh
 * cd <仓库>
 * npx esbuild tests/math-input.test.ts --bundle --platform=node --format=esm \
 *   --outfile=/tmp/nota-math-input-test/math-input.test.mjs
 * node /tmp/nota-math-input-test/math-input.test.mjs
 * ```
 *
 * 全过退出码 0；有不过的退出码 1，并把名字列出来。
 *
 * # 这份测试是为什么写的（2026-09-26）
 *
 * 用户要的是「LaTeX 不必独占一行，`$$…$$` 也可以行内」。**加载那一路本来是好的**
 * （解析器照 `remark-math` 读，`$$x$$` 就是行内公式，已经无头目检过）；坏的是
 * **打字那一路**：上游 `mathInlineInputRule` 的正则 `/(?:\$)([^$]+)(?:\$)$/`
 * 在用户敲到 `A$$bb$` 那一下就把尾巴上的 `$bb$` 变成公式了，等他把最后一个 `$`
 * 补上，文档里已经是一段**别的文字**（无头目检里落盘成了 `A\$$$bb B` 这种四不像）。
 *
 * 所以这份测试盯的是"**一个字符一个字符敲下去，文档长成什么样**"：
 *
 * - 用的是**真规则**（`公式输入` 里那两条 `$inputRule`，跑一遍插件体把
 *   `.inputRule` 掏出来）、**真节点规格**（`plugin-math` 的 `math_inline`）、
 *   **真排版器**（`EditorState` ＋ 真 `Schema`）。没有一行是这个测试自己编的。
 * - 「敲一下」那支函数是**照抄** `prosemirror-inputrules` 的 `run()`
 *   （`dist/index.js`，函数 `run`）：只留段落这一路，`MAX_MATCH`、
 *   "匹配必须包住刚敲的那个字符"、"handler 返回 `null` 就接着试下一条"三条都照抄。
 *
 * # ⚠️ 这份测试**证明不了**什么
 *
 * 它证明不了：真浏览器里敲键走的确实还是这条路（`handleTextInput` 与 IME 的
 * `compositionend` 那两处入口、中文输入法把 `$` 送进来的样子）、`math-view.ts`
 * 的 NodeView 在我们转换后画成什么样、光标最终落在哪一格、KaTeX 排出来对不对。
 * 那些一律是**目检**的事（`docs/06` §5.9 起的开窗目检一节）。
 *
 * 另外它**不测**上游那条规则还在不在 `inputRulesCtx` 里——"摘掉"这件事发生在
 * `create.ts` 的 `.use(math.filter(...))`，要建整个 `Editor` 才看得见。这里只测
 * 换上去的那两条（摘掉那一步靠 `create.ts` 里那一行 + 无头目检兜着）。
 */

import { Container, Ctx } from "@milkdown/kit/ctx";
import { inputRulesCtx, prosePluginsCtx, schemaCtx } from "@milkdown/kit/core";
import { Schema } from "@milkdown/kit/prose/model";
import type { Node as PMNode } from "@milkdown/kit/prose/model";
import { EditorState, NodeSelection, TextSelection } from "@milkdown/kit/prose/state";
import type { Transaction } from "@milkdown/kit/prose/state";
import type { InputRule } from "@milkdown/kit/prose/inputrules";
import type { EditorView } from "@milkdown/kit/prose/view";
import {
  katexOptionsCtx,
  math,
  mathBlockInputRule,
  mathBlockSchema,
  mathInlineInputRule,
  mathInlineSchema,
} from "@milkdown/plugin-math";
import { unified } from "unified";
import remarkStringify from "remark-stringify";
import remarkMath from "remark-math";
import {
  公式输入,
  公式块回车,
  单美元,
  双美元,
  该变公式,
  回车成公式块,
  空块头,
} from "../src/editor/math-input";
import { 行内公式处理器, 行内公式规格, 读美元数 } from "../src/editor/math-delim";

/* ── 一支极小的测试工装（与 `math-view.test.ts` / `mark-hint.test.ts` 同一套长相）── */

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

function 断言(条件: unknown, 说明: string): void {
  if (!条件) throw new Error(说明);
}

function 等(实际: unknown, 期望: unknown, 说明: string): void {
  if (实际 !== 期望) {
    throw new Error(`${说明}：期望 ${JSON.stringify(期望)}，实际 ${JSON.stringify(实际)}`);
  }
}

/** 逐字比一串字符串（`等` 是 `!==`，两串内容一样的数组在它眼里永远不相等）。 */
function 等列(实际: readonly string[], 期望: readonly string[], 说明: string): void {
  const a = JSON.stringify(实际);
  const b = JSON.stringify(期望);
  if (a !== b) throw new Error(`${说明}：期望 ${b}，实际 ${a}`);
}

/* ── 真规格 → 真 Schema → 真规则 ─────────────────────────────────────── */

const ctx = new Ctx(new Container(), {} as never);
// ⚠️ 见文件头：本测试只要"注入 + 跑插件体"，不要 milkdown 的启动时序。
(ctx as unknown as { wait: () => Promise<void> }).wait = async () => {};
// `$inputRule` 的插件体会 `ctx.update(inputRulesCtx, …)`，所以这一片得先注入。
ctx.inject(inputRulesCtx);
// 同理，`$prose` 那一份（块公式的回车）要 `prosePluginsCtx`。
ctx.inject(prosePluginsCtx);
katexOptionsCtx(ctx);
mathInlineSchema.ctx(ctx);
mathBlockSchema.ctx(ctx);

// ⚠️ **本仓那份**（`math-delim.ts` 里加了 `dollars`、换了两个 `runner` 的那份），
// 不是上游那份——⚠️⚠️ 2026-09-27 起 `$$x$$` 存盘**不再**变成 `$x$` 了，所以这一组
// 断言必须跑在**真的会搬 `dollars`** 的那份规格上，否则测的还是老行为（`createAndFill`
// 对陌生的属性名是**静默忽略**的，拿上游那份跑不会报错、只会一直"通过"）。
行内公式规格.ctx(ctx);
const 行内规格 = ctx.get(行内公式规格.key)(ctx);

const schema = new Schema({
  nodes: {
    doc: { content: "block+" },
    paragraph: { content: "inline*", group: "block", toDOM: () => ["p", 0] },
    text: { group: "inline" },
    math_inline: 行内规格,
    math_block: ctx.get(mathBlockSchema.key)(ctx),
  },
});
ctx.inject(schemaCtx);
ctx.set(schemaCtx, schema);

/** 真规则：跑一遍每条插件的插件体（`await ctx.wait(SchemaReady)` 是假的），掏 `.inputRule`。 */
const 规则: InputRule[] = [];
for (const 插件 of 公式输入) {
  // ⚠️ `插件(ctx)` 只是**拿到**那个内层 async 函数，`.inputRule` 要等它跑完
  //    （`await ctx.wait(SchemaReady)` 之后那一句）才挂上去——不 await 就是
  //    一串 `undefined`（第一版就是这么错的）。
  await 插件(ctx)();
  规则.push(插件.inputRule);
}

/**
 * ⚠️ **块公式那条也真的建一次**（同上面那两条输入规则）：`$prose` 要到工厂跑完
 * 才把 `.plugin` / `.key` 挂上去，不 build 一次的话"插件挂上了没有"这句话
 * 就**没有量过**（下面第四组最后一条要读 `公式块回车.key()`）。
 */
let 块插件炸了: unknown = null;
try {
  await 公式块回车(ctx)();
} catch (e) {
  块插件炸了 = e;
}

/* ── 打字模拟：照抄 `prosemirror-inputrules` 的 `run()` ──────────────── */

/** 光标前最多看这么多字符（上游 `const MAX_MATCH = 500`）。 */
const 最长看 = 500;

/**
 * 敲一个字符，返回新的状态。
 *
 * ⚠️ 上游那条 `if (!match || match[0].length < text.length) continue` 不能漏：
 * 匹配必须**把刚敲的那个字符包进去**，否则 `$$` 里的第一颗 `$` 就会去匹配
 * 尾巴上别的 `$…$`。
 * ⚠️ 上游那条 `if (!tr) continue`（handler 返回 `null` 就接着试下一条）也不能漏，
 * 守卫就是靠它让开的。
 */
function 敲一下(state: EditorState, 字符: string): EditorState {
  const from = state.selection.from;
  const $from = state.doc.resolve(from);
  const 尾 =
    $from.parent.textBetween(Math.max(0, $from.parentOffset - 最长看), $from.parentOffset, null, "￼") +
    字符;
  for (const 一条 of 规则) {
    const match = 一条.match.exec(尾);
    if (!match || match[0].length < 字符.length) continue;
    const startPos = from - (match[0].length - 字符.length);
    const tr = 一条.handler(state, match, startPos, from);
    if (!tr) continue;
    return state.apply(tr);
  }
  return state.apply(state.tr.insertText(字符));
}

/** 一个字一个字敲完一整串。 */
function 敲完(文本: string, 已有?: PMNode): EditorState {
  const 空段 = schema.nodes.paragraph.create(null, 已有 ? 已有 : null);
  let state = EditorState.create({ schema, doc: schema.nodes.doc.create(null, 空段) });
  for (const 字符 of 文本) state = 敲一下(state, 字符);
  return state;
}

/** 第一段的子节点，写成好读的样子：`文(A)` / `math_inline(bb)`。 */
function 长相(state: EditorState): string[] {
  const 段 = state.doc.firstChild;
  if (!段) throw new Error("文档里没有第一段？");
  return 段.content.content.map((n) =>
    n.isText ? `文(${JSON.stringify(n.text)})` : `${n.type.name}(${JSON.stringify(n.textContent)})`,
  );
}

/** 第一段里那颗公式节点的源码（没有就抛）。 */
function 公式源(state: EditorState): string {
  const 段 = state.doc.firstChild;
  const 找 = 段?.content.content.find((n) => n.type.name === "math_inline");
  if (!找) throw new Error(`第一段里没有 math_inline：${JSON.stringify(长相(state))}`);
  return 找.textContent;
}

/** 第一段里那颗公式**节点**（没有就 `null`）——`dollars` 那个属性在它身上。 */
function 头一颗公式(state: EditorState): PMNode | null {
  const 段 = state.doc.firstChild;
  return 段?.content.content.find((n) => n.type.name === "math_inline") ?? null;
}

/**
 * 存盘：屏幕上的文档 → Markdown 文本。**与 `create.ts` 那条链同形**——
 * `存成mdast` 走**真规格的 `toMarkdown.runner`**，序列化那一侧挂着**本仓那条
 * `inlineMath` 处理器**（`math-delim.ts` 里按 `dollars` 选上游处理器的那条）。
 *
 * ⚠️ 少了 `handlers` 那一项，测的就是**上游默认行为**（一律一个 `$`）——第一版
 * 就是这么写的，于是"`$$` 保留"那条一直失败，看着像产品没改。
 */
function 存盘(state: EditorState): string {
  const 段 = { type: "paragraph", children: 存成mdast(state) };
  return unified()
    .use(remarkStringify, { handlers: { inlineMath: 行内公式处理器() } })
    .use(remarkMath)
    .stringify({ type: "root", children: [段] } as never)
    .trim();
}

/** 把一段文档按**真规格的 `toMarkdown.runner`** 翻译成 mdast 的 `children`。 */
function 存成mdast(state: EditorState): Record<string, unknown>[] {
  const 段 = state.doc.firstChild;
  if (!段) throw new Error("文档里没有第一段？");
  const 子: Record<string, unknown>[] = [];
  for (const n of 段.content.content) {
    if (n.isText) {
      子.push({ type: "text", value: n.text ?? "" });
      continue;
    }
    const runner = 行内规格.toMarkdown?.runner as
      | ((s: unknown, n: PMNode, 父: unknown, 序: number) => void)
      | undefined;
    if (!runner) throw new Error("插件没给 toMarkdown.runner？");
    const state2 = {
      // ⚠️⚠️ **第四个参数不能扔**：本仓的 `toMarkdown.runner` 把"用了几个 `$`"
      // 放进那里（`{ data: { dollars } }`），`SerializerState` 那边是原样摊到
      // mdast 节点上的（`#createMarkdownNode(element)` 摊 `element.props`）。
      // 第一版这个假工装只收前三个参数，于是 `dollars` **静默丢掉**——测试看
      // 着"跑了真 runner"，其实那一步的信息根本没出来。
      addNode(名: string, _子2: unknown, 值?: string, 属性?: Record<string, unknown>) {
        const 节点: Record<string, unknown> = { type: 名, value: 值 ?? "" };
        if (属性) Object.assign(节点, 属性);
        子.push(节点);
        return state2;
      },
    };
    runner(state2, n, null, 0);
  }
  return 子;
}

/* ── 一、纯判断：正则与守卫 ─────────────────────────────────────────── */

组("一、正则与守卫");

测("单美元 / 双美元 的正则与上游`mathInlineInputRule`同源（正则是拿掉它之后补上的）", () => {
  等(单美元.source, "(?:\\$)([^$]+)(?:\\$)$", "单美元正则");
  等(双美元.source, "\\$\\$([^$]+)\\$\\$$", "双美元正则");
});

测("守卫（只剩守卫一）：前面紧挨着 `$` 就让开；别的（含段落最前面）都放行", () => {
  等(该变公式("$"), false, "前面是 $ 要让开");
  等(该变公式(""), true, "段落最前面没有前一个字符 ⇒ 放行");
  等(该变公式("A"), true, "普通文字 ⇒ 放行");
  等(该变公式(" "), true, "前面是空格也放行——⚠️ 值两端有没有空格**不归它管**");
});

测("⚠️ 守卫二**已撤回**（2026-10-04 当天加、当天撤）：值里带空格也照转", () => {
  // 那一条曾经是"值两端紧挨着空白就不转"（照 Typora）。用户下午在分屏预览里
  // 发现它把 `$ \LaTeX $` 这种带空格的常见写法也判成了普通文字，拍了「整条撤回」。
  // ⚠️ **打字这条路与解析那条路是同一把尺子**：解析那一侧的第五格（
  //    `math-delim.ts`）一起撤了，`tests/math-delim.test.ts` 第九组量的是撤回后的行为。
  //    只撤一边的症状是"打字不转、打开文件又渲染成公式"——两边对不上。
  //
  // 这条测法很笨但够用：函数签名的第二个参数**已经没有了**，所以"值"根本进不来
  // ——留下这几行是为了让下一个人**看见这里曾经有过什么**（以及为什么撤）。
  等(该变公式("A"), true, "`$ a$` / `$a $` / `$ a $` 现在都照转（值不再参与判断）");
});

测("**上游那条为什么会坏**：`$$bb$` 在没收尾时就已经能匹配单美元那条", () => {
  // 这一条就是根因本身：用户敲到 `A$$bb$` 那一下，尾巴上的 `$bb$` 够匹配了，
  // 于是当场变出「文(A$) ＋ 公式(bb)」——最后一个 `$` 敲下去时已经晚了。
  等(单美元.test("A$$bb$"), true, "上游那条认得出 `A$$bb$`（所以必须加守卫）");
  等(单美元.test("$$bb$"), true, "同上");
  // 收尾齐了反而配不出——正因如此，光靠上游那一条永远等不到 `$$bb$$`。
  等(单美元.test("$$bb$$"), false, "`$$bb$$` 单美元那条配不出");
  等(单美元.test("A$$bb$$"), false, "带前缀也配不出");
  等(双美元.test("$$bb$$"), true, "`$$bb$$` 该被双美元那条认出来");
  等(双美元.test("A$$bb$$"), true, "带前缀也算");
  等(双美元.test("A$$bb$"), false, "没收尾不算");
});

/* ── 二、一个字一个字敲下去 ─────────────────────────────────────────── */

组("二、打字：一个字一个字敲下去，文档长成什么样");

测("用户的原句：`**牛顿-莱布尼茨公式**是这样的：$$…$$ 也是可以的。`", () => {
  const state = 敲完("**牛顿-莱布尼茨公式**是这样的：$$\\int_{a}^{b} f(x) \\,\\mathrm{d}x = F(x) \\bigg|_{a}^{b}$$ 也是可以的。");
  const 取 = 长相(state);
  等(取[取.length - 1], '文(" 也是可以的。")', "尾巴那几个字要留在公式**后面**");
  等(公式源(state), "\\int_{a}^{b} f(x) \\,\\mathrm{d}x = F(x) \\bigg|_{a}^{b}", "公式源码");
  断言(取.some((x) => x.startsWith("文(") && x.includes("是这样的：")), `前缀那段话要在：${JSON.stringify(取)}`);
});

测("`A$$bb$$ B` ⇒ 文(A) ＋ 公式(bb) ＋ 文( B)", () => {
  等列(长相(敲完("A$$bb$$ B")), ['文("A")', 'math_inline("bb")', '文(" B")'], "整段长相");
});

测("`x$$y$$` ⇒ 文(x) ＋ 公式(y)", () => {
  等列(长相(敲完("x$$y$$")), ['文("x")', 'math_inline("y")'], "整段长相");
});

测("`$$ab$$`（段落最前面）⇒ 就是一颗公式", () => {
  等列(长相(敲完("$$ab$$")), ['math_inline("ab")'], "整段长相");
});

测("`C$dd$ D`（单美元那条照旧能用）⇒ 文(C) ＋ 公式(dd) ＋ 文( D)", () => {
  等列(长相(敲完("C$dd$ D")), ['文("C")', 'math_inline("dd")', '文(" D")'], "整段长相");
});

测("**敲到一半**：`A$$bb$` 停手 ⇒ 全是字面文字，一颗公式都没有", () => {
  const state = 敲完("A$$bb$");
  等列(长相(state), ['文("A$$bb$")'], "没闭合就不许动它");
});

测("**敲到一半**：`A$bb` 停手 ⇒ 也是字面文字", () => {
  等列(长相(敲完("A$bb")), ['文("A$bb")'], "单美元收了尾才算数");
});

测("光标落在公式**后面**（接着敲的是正文，不是往公式里塞）", () => {
  const state = 敲完("A$$bb$$ B");
  等(state.selection.from, state.doc.content.size - 1, "光标应该在段尾");
  等(state.doc.firstChild?.lastChild?.textContent, " B", "最后那个节点是正文");
});

测("`$ a$` / `$a $` / `$ $`：**照旧当场转**（守卫二 2026-10-04 当天撤回）", () => {
  // ⚠️ 这一条**改过两回**，都是同一天：2026-10-04 早些时候按 Typora 改成"当场不转、
  // 原样留在正文里"（守卫二），当天下午用户拍了「整条撤回」，于是又回到上游口径：
  // 值里带空格也算公式。⚠️ 撤回的代价（值两端那两颗空格存盘会被 trim 掉）在
  // `math-delim.ts` 文件头那段 ⚠️ 与 `tests/math-delim.test.ts` 第九组里。
  等列(长相(敲完("$ a$")), ['math_inline(" a")'], "前导空格");
  等列(长相(敲完("$a $")), ['math_inline("a ")'], "收尾空格");
  等列(长相(敲完("$ $")), ['math_inline(" ")'], "只有空格");
  // 中间的空格本来就不参与判断，跟上游同。
  等列(长相(敲完("$a b$")), ['math_inline("a b")'], "中间的空格不算");
  // ⚠️ **打字这条路不吃空格、解析那条路会 trim**——两条路在这一点上本来就
  // 不一致（上游行为，2026-10-04 那道守卫想对齐、当天又撤了）。存盘走的是
  // "值原样写出去"，所以敲出来的还是原来那几个字符。
  等(存盘(敲完("$ a$")), "$ a$", "敲完就存：那两颗空格留着");
});

测("连着敲两次：`$$a$$ 和 $$b$$` ⇒ 两颗公式，中间是正文", () => {
  等列(长相(敲完("$$a$$ 和 $$b$$")), ['math_inline("a")', '文(" 和 ")', 'math_inline("b")'], "整段长相");
});

/* ── 三、存的就是打的 ───────────────────────────────────────────────── */

组("三、存的就是打的（`$$x$$` 落盘还是 `$$x$$`）");

测("敲完 `A$$bb$$ B` ⇒ 那颗节点上标着 2（`双美元` 那条规则当场盖的章）", () => {
  const state = 敲完("A$$bb$$ B");
  等(读美元数(头一颗公式(state)!), 2, "双美元那条");
});

测("敲完 `C$dd$ D` ⇒ 标着 1（`单美元` 那条）", () => {
  等(读美元数(头一颗公式(敲完("C$dd$ D"))!), 1, "单美元那条");
});

测("⭐ 敲完 `A$$bb$$ B` 存盘 ⇒ **`A$$bb$$ B`**（一字不差地原样回去）", () => {
  // ⚠️ 2026-09-27 之前这一条期望的是 `A$bb$ B`（那时 mdast 的 `inlineMath` 没地方
  // 记"用了几个 `$`"，信息在解析那一步就丢了）。用户拍了「保留」之后，`dollars`
  // 一路带到序列化，所以现在是原样。判据见 `src/editor/math-delim.ts`。
  等(存盘(敲完("A$$bb$$ B")), "A$$bb$$ B", "存盘结果");
});

测("敲单美元那半边**没被带歪**：`C$dd$ D` 存盘还是 `C$dd$ D`", () => {
  // ⚠️ 这条是防"一律写两个 `$`"那种过度修正的——两条规则各按各的数走。
  等(存盘(敲完("C$dd$ D")), "C$dd$ D", "存盘结果");
});

测("值里有孤立 `$` 时照旧升到 2（`mdast-util-math` 自己那圈 `while`，不是我们做的）", () => {
  // ⚠️ 这一条走的**不是**我们的处理器（直接 `remarkStringify` ＋ `remarkMath`），
  // 量的是上游那圈 `while (…'\\$'.repeat(size)…') size++`。留在这里是为了说明
  // "值里有 `$`"与"用户敲了几个 `$`"**是两件事**，别把前者当成后者的判据。
  const 段 = { type: "paragraph", children: [{ type: "inlineMath", value: "a$b" }] };
  const 文件 = unified().use(remarkStringify).use(remarkMath).stringify({ type: "root", children: [段] } as never);
  等(文件.trim(), "$$a$b$$", "存盘结果");
});

测("⚠️ 两条规则**都是**本仓那份（守卫也还在）：`A$$bb$` 停手仍然只是字面文字", () => {
  // 换了规格之后重验一遍：`dollars` 是**属性**，不是新规则，所以正则与守卫的
  // 行为不该有任何变化。这一条是"换规格没把打字那半边弄坏"的回归哨。
  等列(长相(敲完("A$$bb$")), ['文("A$$bb$")'], "没收尾不许动它");
  等(读美元数(头一颗公式(敲完("$$ab$$"))!) , 2, "段首那颗也是两个 `$`");
});

/* ── 四、块公式：`$$` ＋回车（2026-10-04）────────────────────────────── */

组("四、块公式：`$$` ＋回车才建块（换掉了上游那道「`$$` ＋空格」）");

/**
 * 一条够用的**假视图**：`回车成公式块` 只碰视图的三样东西
 * （`editable` / `state` / `dispatch`），所以这三样给真货就够跑完整条逻辑。
 *
 * ⚠️ **它证明不了**：面板真的开了、输入框真的拿到焦点——那要真 DOM
 * （`docs/06` 开窗目检那一节）。这里证明的是**判据与事务**：
 * 什么时候认、产出的文档长什么样、选区落在哪。
 */
function 假视图(初始: EditorState, 可编辑 = true) {
  const 盒 = {
    state: 初始,
    editable: 可编辑,
    dispatch: (tr: Transaction) => {
      盒.state = 盒.state.apply(tr);
    },
  };
  return 盒 as unknown as EditorView & typeof 盒;
}

/** 一段文字 ＋ 光标在**末尾**（回车那一下一般就是这个位置）。 */
function 段尾(text: string, 可编辑 = true) {
  const 文档 = schema.nodes.doc.create(null, schema.nodes.paragraph.create(null, schema.text(text)));
  const state = EditorState.create({
    schema,
    doc: 文档,
    selection: TextSelection.near(文档.resolve(1 + text.length)),
  });
  return 假视图(state, 可编辑);
}

测("`$$` ＋回车 ⇒ 这一段**变成**一块空的 `math_block`，值空着", () => {
  const view = 段尾("$$");
  等(回车成公式块(view, schema.nodes.math_block), true, "认了这一下回车");
  const 块 = view.state.doc.firstChild;
  等(块?.type.name, "math_block", "块类型");
  等(块?.attrs.value, "", "值是空的（等用户敲）");
  等(view.state.doc.childCount, 1, "还是只有一块（不是又插了一块）");
});

测("⚠️ 建完块当场**整块选中**（`math-view.ts` 判「要不要开源码框」的唯一判据）", () => {
  // 不设 NodeSelection 的话，选中的是"块里那个空位置"，那块装饰挂不上，
  // 用户按下回车之后源码框**不开**——屏幕上就是一块空白，正是用户报的那个现象。
  const view = 段尾("$$");
  回车成公式块(view, schema.nodes.math_block);
  const 选 = view.state.selection;
  断言(选 instanceof NodeSelection, `选区该是 NodeSelection，实际是 ${选.constructor.name}`);
  等((选 as NodeSelection).node.type.name, "math_block", "选中的就是那一块");
});

测("`$$ `（尾上多一颗空格）也认——顺着老写法的肌肉记忆", () => {
  const view = 段尾("$$ ");
  等(回车成公式块(view, schema.nodes.math_block), true, "认");
  等(view.state.doc.firstChild?.type.name, "math_block", "块类型");
});

测("⚠️ 不该抢的那几种：一段里还有别的字、光标不在行尾、只读", () => {
  等(回车成公式块(段尾("$$abc"), schema.nodes.math_block), false, "`$$abc` 不是空块头");
  等(回车成公式块(段尾("甲$$"), schema.nodes.math_block), false, "前面还有字");
  等(回车成公式块(段尾("$"), schema.nodes.math_block), false, "一颗 `$` 不算（行内那条管）");
  等(
    回车成公式块(段尾("$$", false), schema.nodes.math_block),
    false,
    "⚠️ 只读实例（分屏右边那个预览格）不许动文档",
  );

  // 光标不在行尾：那一下回车是**拆段**，不是建块（`$$` 后面还有字时同理，见上）。
  const 文档 = schema.nodes.doc.create(null, schema.nodes.paragraph.create(null, schema.text("$$")));
  const 停在开头 = EditorState.create({
    schema,
    doc: 文档,
    selection: TextSelection.near(文档.resolve(1)),
  });
  等(回车成公式块(假视图(停在开头), schema.nodes.math_block), false, "光标在段首");
});

测("⚠️ 框选着东西按回车：不建块", () => {
  const 文档 = schema.nodes.doc.create(null, schema.nodes.paragraph.create(null, schema.text("$$")));
  const 选中 = EditorState.create({
    schema,
    doc: 文档,
    selection: TextSelection.create(文档, 1, 3),
  });
  等(回车成公式块(假视图(选中), schema.nodes.math_block), false, "非空选区");
});

测("`空块头` 的正则：`$$` ＋任意空白（含没有、含制表符）", () => {
  等(空块头.test("$$"), true, "光秃秃的");
  等(空块头.test("$$ "), true, "一颗空格");
  等(空块头.test("$$\t"), true, "制表符");
  等(空块头.test("$$abc"), false, "后面有字");
  等(空块头.test("甲$$"), false, "前面有字");
  等(空块头.test("$"), false, "一颗");
  等(空块头.test("$$$"), false, "三颗（micromark 也不当块读）");
});

测("⚠️ 回车那条插件真的建得起来，PluginKey 就是那一个", () => {
  if (块插件炸了) throw new Error(`建插件时报错：${String(块插件炸了)}`);
  // ⚠️ 尾巴上那颗 `$` 是 ProseMirror 自己加的（`new PluginKey(name)` 里
  // `this.key = name + "$"`），不是笔误。
  等(公式块回车.key().key, "nota-math-block-on-enter$", "PluginKey（改名会撞上上游，这里守住）");
});

测("⚠️ 我们滤的两条**真的在 `math` 里**（上游改名的话这里会红，不是静默失效）", () => {
  // `create.ts` 里是 `math.filter((p) => p !== mathInlineInputRule && p !== mathBlockInputRule)`。
  // 上游哪天把这两条换个名字/挪个地方（而不是删掉），那个 filter 会**静默失效**：
  // 编译照过、测试照绿，而 `A$$bb$` 与「`$$` ＋空格建块」两个毛病一起回来。
  // 这条守的就是那个时刻——引用的东西必须真的是 `math` 的成员。
  断言(math.includes(mathInlineInputRule), "`mathInlineInputRule` 该是 `math` 的成员");
  断言(math.includes(mathBlockInputRule), "`mathBlockInputRule` 该是 `math` 的成员");
});

/* ── 收尾 ───────────────────────────────────────────────────────────── */

console.log(`\n${过} 过 / ${败} 败`);
if (败的.length > 0) {
  console.log("败的：");
  for (const 名 of 败的) console.log(`  - ${名}`);
  process.exit(1);
}
