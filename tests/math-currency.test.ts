/**
 * `src/editor/math-currency.ts`（**`$` 当钱写的时候不算公式**，`docs/07` backlog
 * 第 54 项）的**可运行**测试集。2026-10-04 写。
 *
 * ⚠️ 那条规则的判据、为什么不能照"`$` 后紧跟数字就不认"那个简单写法、以及
 * **这一层认不出的形状**，全在源文件文件头那张真值表里。这里只做两件事：
 * ① 把那张表**逐行量一遍**；② 把"挂上去这件事本身"钉住（顺序错一点就静默失效）。
 *
 * # 跑法（不装任何包：`esbuild` 与 `node` 仓库里都现成）
 *
 * ```sh
 * cd <仓库>
 * npx esbuild tests/math-currency.test.ts --bundle --platform=node --format=esm \
 *   --outfile=/tmp/nota-math-currency-test/math-currency.test.mjs
 * node /tmp/nota-math-currency-test/math-currency.test.mjs
 * ```
 *
 * 全过退出码 0；有不过的退出码 1，并把名字列出来。
 *
 * # 每一组跑的都是真代码，一段都不替它实现
 *
 * - 解析与序列化用**真的 milkdown 那两台状态机**（`ParserState` / `SerializerState`）。
 * - 处理机是**真 `unified()`**：`remark-parse` ＋ `remark-math` ＋ 本仓那两个插件，
 *   序列化那一侧挂着本仓那两条处理器（`inlineMath` / `text`）。
 * - **上游那条构造是真的**：`收严美元插件` 是从处理机的 `micromarkExtensions` 里
 *   **现场**把 `remark-math` 挂的那条取出来包的（`找上游美元`），测试里量的是同一件事。
 * - schema 是**手搓的最小版**（`doc`/`paragraph`/`text`/两种公式），与
 *   `math-delim.test.ts` 那份同形——⚠️ 所以"少了某个节点就报错"这类现象是**这份
 *   测试的**局限，别当成产品行为。
 *
 * # ⚠️ 这份测试**证明不了**什么
 *
 * - **开窗目检**没做：真浏览器里敲 `价格 $100 和 $200 元`、看着它不冒公式、
 *   `Ctrl+S` 再 `cat` 文件——那是另一件事（`docs/06` §5 的做法）。这里一颗 DOM 都没有。
 * - **打字那条路**（`math-input.ts` 的两条输入规则）是另一套判据，不经过这一层。
 * - **`remark-math` 换成 `singleDollarTextMath: false` 之类**：那时上游那条构造换了，
 *   我们照样跟着它（这是"现场取"换来的），但**这份测试没盖那种配置**。
 * - 第六组那条"顺序"是**读源码文本**量出来的，不是把 `create.ts` 真跑起来——
 *   `.use()` 的先后由 milkdown 的插件登记顺序决定，那要建整个 `Editor` 才验得了。
 */

import { Container, Ctx } from "@milkdown/kit/ctx";
import { nodesCtx } from "@milkdown/kit/core";
import { Schema } from "@milkdown/kit/prose/model";
import type { Node as PMNode } from "@milkdown/kit/prose/model";
import { ParserState, SerializerState } from "@milkdown/kit/transformer";
import { katexOptionsCtx, mathBlockSchema, mathInlineSchema } from "@milkdown/plugin-math";
import { defaultHandlers } from "mdast-util-to-markdown";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { unified } from "unified";
import remarkParse from "remark-parse";
import remarkStringify from "remark-stringify";
import remarkMath from "remark-math";
import { markDollarDollarNumberPlugin, notConvertMeaningDollarDollar, inlineMathHandler, inlineMathSpec } from "../src/editor/math-delim";
import {
  findUpstreamDollarDollar,
  receiveStrictDollarDollar,
  receiveStrictDollarDollarPlugin,
  receiveNarrowDollarDollarCommonStyle,
  isProse,
  isNumberCharacter,
  isWhitespace,
  type shape,
  type ConstructCreate,
} from "../src/editor/math-currency";

/* ── 一支极小的测试工装（与 `math-delim.test.ts` 同一套长相）── */

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

/* ── 真规格 → 真 Schema → 真两台状态机（照抄 `math-delim.test.ts` 的工装）── */

const ctx = new Ctx(new Container(), {} as never);
ctx.inject(nodesCtx);
katexOptionsCtx(ctx);
mathInlineSchema.ctx(ctx);
mathBlockSchema.ctx(ctx);
inlineMathSpec.ctx(ctx);

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
    math_inline: ctx.get(inlineMathSpec.key)(ctx),
    math_block: ctx.get(mathBlockSchema.key)(ctx),
  },
});

/** 序列化那一侧的两条处理器：与 `create.ts` 里挂的是**同一个函数**。 */
const stringConvert = {
  handlers: { inlineMath: inlineMathHandler(), text: notConvertMeaningDollarDollar(defaultHandlers.text) },
};

/** **挂着这一层**的处理机（顺序照 `create.ts`：`remark-math` 在前，我们那条在后）。 */
const placeManageMachine = unified()
  .use(remarkParse)
  .use(remarkMath)
  .use(markDollarDollarNumberPlugin)
  .use(receiveStrictDollarDollarPlugin)
  .use(remarkStringify, stringConvert);

/** ⚠️ **对照**：同一个处理机，只少了我们这一条（下面第四组靠它证明"量的是我们这层"）。 */
const correctAccordingPlaceManageMachine = unified()
  .use(remarkParse)
  .use(remarkMath)
  .use(markDollarDollarNumberPlugin)
  .use(remarkStringify, stringConvert);

const parse = ParserState.create(schema, placeManageMachine);
const serialize = SerializerState.create(schema, placeManageMachine);
const roundtrip = (source3: string): string => serialize(parse(source3));

const correctAccordingParse = ParserState.create(schema, correctAccordingPlaceManageMachine);

/** 文档里那几颗行内公式的**值**（按出现顺序）。 */
function commonStylePlural(doc: PMNode): string[] {
  const output2: string[] = [];
  doc.descendants((node) => {
    if (node.type.name === "math_inline") output2.push(node.textContent);
    return true;
  });
  return output2;
}

/** 拿一段源码量出"文档里那几颗公式的值"，用 JSON 比（数组不能拿 `等` 比）。 */
function measureCommonStyle(source3: string, expected: string[], description: string): void {
  const actual = commonStylePlural(parse(source3));
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw new Error(`${description}：期望 ${JSON.stringify(expected)}，实际 ${JSON.stringify(actual)}`);
  }
}

/* ── 一、判据（纯函数，不做任何分词）──────────────────────────────────── */

group("一、`该判成正文`（判据本身，逐行对着文件头那张真值表）");

/** 造一个"形状"，省得每行都写全。 */
function shape2(partShare: Partial<shape>): shape {
  return { openHowManyToken: 1, openRightNeighbor: 49, closeLeftNeighbor: 32, closeLocalBody: 36, closeRightNeighbor: 32, ...partShare };
}

testCase("门槛：`$` 右边**不是**数字 ⇒ 一律当公式（`$ \\LaTeX $` 就是靠这一条活下来的）", () => {
  equal(isProse(shape2({ openRightNeighbor: 32 })), false, "右边是空格");
  equal(isProse(shape2({ openRightNeighbor: 92 })), false, "右边是反斜杠");
  equal(isProse(shape2({ openRightNeighbor: 120 })), false, "右边是字母");
});

testCase("`$$…$$` 起头的一律当公式（钱不会那么写）", () => {
  equal(isProse(shape2({ openHowManyToken: 2, closeLeftNeighbor: 32 })), false, "两颗");
  equal(isProse(shape2({ openHowManyToken: 3, closeLeftNeighbor: 32 })), false, "三颗");
});

testCase("闭定界符右边紧跟数字 ⇒ 正文（`$100 和 $200` 那一条）", () => {
  // ⚠️ 这三条要把**另一条**（闭的左邻）按住不动：默认那个 `32` 是空格，
  // 光是它就能让判据成立，量出来的就不是"右边那颗"起的作用了。
  equal(isProse(shape2({ openRightNeighbor: 49, closeLeftNeighbor: 49, closeRightNeighbor: 50 })), true, "右边是 `2`");
  equal(isProse(shape2({ openRightNeighbor: 49, closeLeftNeighbor: 49, closeRightNeighbor: 32 })), false, "右边是空格 ⇒ 不动手");
  equal(isProse(shape2({ openRightNeighbor: 49, closeLeftNeighbor: 49, closeRightNeighbor: null })), false, "右边没了（段尾）⇒ 不动手");
});

testCase("闭定界符左边是空白 ⇒ 正文（`$50，公式 $x+y$` 那一条）", () => {
  equal(isProse(shape2({ openRightNeighbor: 53, closeLeftNeighbor: 32 })), true, "左边是空格");
  equal(isProse(shape2({ openRightNeighbor: 53, closeLeftNeighbor: -4 })), true, "左边是换行（负数那颗）");
  equal(isProse(shape2({ openRightNeighbor: 53, closeLeftNeighbor: 49 })), false, "左边是 `1` ⇒ 不动手（`$0 < x < 1$`）");
});

testCase("形状没认对（收尾那颗不是 `$`）⇒ 不动手", () => {
  equal(isProse(shape2({ closeLocalBody: 49, closeRightNeighbor: 50 })), false, "闭本身不是 `$`");
  equal(isProse(shape2({ closeLocalBody: null, closeRightNeighbor: 50 })), false, "闭本身没了");
});

testCase("`是数字` / `是空白` 两把尺子", () => {
  for (const [code2, should] of [
    [48, true],
    [57, true],
    [47, false],
    [58, false],
    [null, false],
    [-1, false],
  ] as const) {
    equal(isNumberCharacter(code2), should, `是数字(${String(code2)})`);
  }
  for (const [code2, should] of [
    [32, true],
    [-1, true],
    [-2, true],
    [-4, true],
    [48, false],
    [null, false],
  ] as const) {
    equal(isWhitespace(code2), should, `是空白(${String(code2)})`);
  }
});

/* ── 二、找上游那条构造（挂得成不成，全靠它）────────────────────────── */

group("二、`找上游美元`（认名字，不认身份）");

testCase("真处理机的表里找得到那条 `mathText`，而且它带着 `tokenize` 与 `previous`", () => {
  const machine = unified().use(remarkParse).use(remarkMath);
  machine.freeze();
  const table2 = machine.data("micromarkExtensions") as unknown[];
  const upstream = findUpstreamDollarDollar(table2);
  if (!upstream) throw new Error("没找到——`remark-math` 那条构造改名了？");
  equal(upstream.name, "mathText", "名字");
  equal(typeof upstream.tokenize, "function", "tokenize");
  equal(typeof upstream.previous, "function", "previous（空行/缩进那些角落靠它）");
});

testCase("表是空的、或里面没有那条 ⇒ `undefined`（调用方什么都不做）", () => {
  equal(findUpstreamDollarDollar([]), undefined, "空表");
  equal(findUpstreamDollarDollar([{ text: { 36: { name: "别的", tokenize: () => undefined } } }]), undefined, "名字不对");
  equal(findUpstreamDollarDollar([{}, null, 3]), undefined, "杂物里也没有");
});

testCase("挂上之后：表里多了一条，而且它**把上游按名字停掉**了", () => {
  const machine = unified().use(remarkParse).use(remarkMath).use(receiveStrictDollarDollarPlugin);
  machine.freeze();
  const table2 = machine.data("micromarkExtensions") as unknown[];
  const mostAfter = table2[table2.length - 1] as {
    text?: Record<number, ConstructCreate>;
    disable?: { null?: string[] };
  };
  if (!mostAfter?.text?.[36]) throw new Error("最后那一条里没有 `text[36]`");
  equal(mostAfter.disable?.null?.includes("mathText"), true, "按名字停掉上游那条");
  equal(mostAfter.text[36].name, undefined, "⚠️ 我们自己那条**不能**叫 `mathText`（会把自己也停掉）");
});

testCase("⚠️ `收窄美元公式` 是**包**上游那条，不是抄一份：`previous` / `resolve` 原样带过来", () => {
  const machine = unified().use(remarkParse).use(remarkMath);
  machine.freeze();
  const upstream = findUpstreamDollarDollar(machine.data("micromarkExtensions") as unknown[]);
  if (!upstream) throw new Error("没找到上游那条");
  const packagePassOf = receiveNarrowDollarDollarCommonStyle(upstream);
  equal(packagePassOf.previous, upstream.previous, "previous 是同一个函数");
  equal(packagePassOf.resolve, upstream.resolve, "resolve 是同一个函数");
  equal(packagePassOf.name, undefined, "名字必须去掉");
  const has = typeof packagePassOf.tokenize === "function";
  equal(has, true, "tokenize 是新的（就它一个换了）");
});

/* ── 三、端到端：每一行的形状（真两台状态机）──────────────────────────── */

group("三、端到端：该当钱的一段公式都不冒");

testCase("用户报的那一条：`价格 $100 和 $200 元` ⇒ 零颗公式", () => {
  measureCommonStyle("价格 $100 和 $200 元", [], "两颗 `$` 之间不再成公式");
});

testCase("其它钱的写法：`$5 到 $10`、`$20,000 和 $30,000`、单颗 `$100` 都零颗", () => {
  measureCommonStyle("$5 到 $10 不好说", [], "闭的右边是 `1`");
  measureCommonStyle("账单 $20,000 和 $30,000 都记着", [], "带千分位");
  measureCommonStyle("这东西 $100", [], "单颗（本来也配不成）");
});

testCase("钱后面还跟着真公式：钱当正文，公式照旧渲染", () => {
  measureCommonStyle("$50，公式 $x+y$ 里", ["x+y"], "闭定界符左边是空白那条");
  measureCommonStyle("$100 降到 $50，公式 $x+y$", ["x+y"], "第二颗钱被否掉之后，重扫认得第三颗");
});

testCase("⚠️ 该渲染的一个都不能少（这条规则的门槛就是为它们设的）", () => {
  measureCommonStyle("$2+2$", ["2+2"], "以数字开头的公式");
  measureCommonStyle("$0 < x < 1$", ["0 < x < 1"], "以数字开头、里面还有空格");
  measureCommonStyle("$2 + 2$", ["2 + 2"], "同上，另一种写法");
  measureCommonStyle("$x$", ["x"], "普通的一颗");
  measureCommonStyle("$ \\LaTeX $", ["\\LaTeX"], "两边贴着空格（BUG-62 撤回之后就该这样）");
  measureCommonStyle("$$100$$", ["100"], "`$$` 起头的一律是公式");
  measureCommonStyle("甲 $E=mc^2$ 乙", ["E=mc^2"], "夹在正文里");
  measureCommonStyle("$2+2$ 和 $x$", ["2+2", "x"], "⚠️ 两颗都在（门槛挡住了「把 `2+2$ 和 ` 吃进公式」）");
});

testCase("⚠️ 故意不动手的形状（已知差别，别自欺）", () => {
  // `$100 和 200$ 元`：闭定界符右边不是数字、左边也不是空白。它与 `$0 < x < 1$`
  // 逐条都长一样，这一层分不开，所以宁可不动——行为与改动前一模一样。
  measureCommonStyle("$100 和 200$ 元", ["100 和 200"], "照旧是公式");
  measureCommonStyle("$1$2", [], "`$1$` 后面紧跟数字 ⇒ 判成正文（它本来也像钱）");
});

/* ── 四、对照：不挂这一层的时候，用户报的那条真的会冒公式 ─────────────── */

group("四、⚠️ 对照（没有这一层时是什么样）");

testCase("`价格 $100 和 $200 元` 在没有这一层时**确实**是一颗公式（值 `100 和 `）", () => {
  const actual = commonStylePlural(correctAccordingParse("价格 $100 和 $200 元"));
  if (JSON.stringify(actual) !== JSON.stringify(["100 和 "])) {
    throw new Error(`对照该冒一颗公式（值 "100 和 "），实际 ${JSON.stringify(actual)}`);
  }
});

testCase("`$50，公式 $x+y$ 里` 在没有这一层时被吃成一颗（值 `50，公式 `）", () => {
  equal(commonStylePlural(correctAccordingParse("$50，公式 $x+y$ 里")).length, 1, "一颗");
});

/* ── 五、往返：字节口径与"不抖" ───────────────────────────────────────── */

group("五、往返（解析 → 文档 → 序列化，两个方向都是真代码）");

testCase("判成正文的那些：**逐字节不变**，也不会有反斜杠冒出来", () => {
  for (const source3 of [
    "价格 $100 和 $200 元",
    "$5 到 $10 不好说",
    "账单 $20,000 和 $30,000 都记着",
    "这东西 $100",
    "$100 和 200$ 元",
  ]) {
    equal(roundtrip(`${source3}\n`), `${source3}\n`, `往返：${JSON.stringify(source3)}`);
  }
});

testCase("⚠️ 两边都稳定：存一次、再打开再存，一模一样（不会一路漂）", () => {
  for (const source3 of [
    "价格 $100 和 $200 元",
    "$50，公式 $x+y$ 里",
    "$100 降到 $50，公式 $x+y$",
    "$2+2$ 和 $x$",
  ]) {
    const onePass = roundtrip(`${source3}\n`);
    const twoPass = roundtrip(onePass);
    equal(twoPass, onePass, `第二趟：${JSON.stringify(source3)}`);
  }
});

testCase("该渲染的那几条照旧一比一（`dollars` 那几个字节也没被碰）", () => {
  for (const source3 of ["$x$", "$2+2$", "$0 < x < 1$", "$$100$$", "甲 $a$ 乙 $$b$$ 丙"]) {
    equal(roundtrip(`${source3}\n`), `${source3}\n`, `往返：${JSON.stringify(source3)}`);
  }
});

testCase("⚠️ 已知差别：`$ \\LaTeX $` 存盘之后里外两颗空格没了（本项**没动**这条）", () => {
  equal(roundtrip("$ \\LaTeX $\n"), "$\\LaTeX$\n", "上游 trim 值的两端，与本项无关");
});

/* ── 六、挂法：顺序错一点就静默失效 ───────────────────────────────────── */

group("六、挂法（读 `assemble.ts` 量登记顺序）");

testCase("`assemble.ts` 里：`.use(math…)` → `.use(标美元数)` → `.use(收严美元)`", () => {
  // ⚠️ 用 `process.cwd()` 而不是 `import.meta.url`：这份测试**先被 esbuild 打成
  // 一个 `.mjs` 再跑**，那一步之后 `import.meta.url` 指的是 `/tmp` 里那个文件
  // （`lang-icons.test.ts` 的文件头记着同一件事）。跑法里写明了 `cd <仓库>`。
  // ⚠️ 2026-10-07：读的文件从 `create.ts` 换成了 `assemble.ts`——整条 `.use()`
  //    链搬去了那边（`docs/07` 第 89 项）。顺序的判据在哪儿都成立，但"哪一行
  //    在哪一行前面"只有真挂着那条链的文件答得了。
  const source3 = readFileSync(resolve(process.cwd(), "src/editor/assemble.ts"), "utf8");
  const numberLearn = source3.indexOf(".use(math.filter(");
  const mark2 = source3.indexOf(".use(markDollarDollarNumber)");
  const receive = source3.indexOf(".use(receiveStrictDollarDollar)");
  if (numberLearn < 0 || mark2 < 0 || receive < 0) {
    throw new Error(`三条里缺了一条：math=${numberLearn} mark=${mark2} receive=${receive}`);
  }
  if (!(numberLearn < mark2 && mark2 < receive)) {
    throw new Error(`顺序不对：math=${numberLearn} 标美元数=${mark2} 收严美元=${receive}`);
  }
});

testCase("`收严美元` 是 `$remark` 的产物（挂错了就是「静默空操作」）", () => {
  const item3 = receiveStrictDollarDollar as unknown as { plugin?: unknown; id?: unknown };
  if (typeof item3?.plugin !== "function") throw new Error("没有 `.plugin`：不是 `$remark` 造出来的");
  if (!item3.id) throw new Error("没有 `.id`：挂载点不明确");
});

/* ── 收尾 ─────────────────────────────────────────────────────────────── */

console.log(`\n${"─".repeat(64)}`);
console.log(`通过 ${pass} 条，失败 ${fail} 条`);
if (fail) {
  console.log(`失败的：\n  - ${failed.join("\n  - ")}`);
  process.exitCode = 1;
}
