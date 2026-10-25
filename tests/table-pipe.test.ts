/**
 * `src/editor/table-pipe.ts`（行首竖线前面那颗多余的反斜杠）的**可运行**测试集。
 * 2026-09-27 写、2026-10-04 随判据改版重写了一遍。
 *
 * # 跑法（不装任何包：`esbuild` 与 `node` 仓库里都现成）
 *
 * ```sh
 * cd <仓库>
 * npx esbuild tests/table-pipe.test.ts --bundle --platform=node --format=esm \
 *   --outfile=/tmp/nota-table-pipe-test/table-pipe.test.mjs
 * node /tmp/nota-table-pipe-test/table-pipe.test.mjs
 * ```
 *
 * 全过退出码 0；有不过的退出码 1，并把名字列出来。
 * ⚠️ esbuild 报错时旧 bundle 还在，`node` 跑出来的是上一版结果——先看 esbuild
 * 那行有没有 `error`（`inline-marks.test.ts` 的文件头记过这个坑）。
 *
 * # 这份测试盯的是什么
 *
 * 用户 2026-09-27 与 2026-10-04 两次报的：「切换模式/存盘会自动添加「\」」。
 * 那颗反斜杠是 `mdast-util-gfm-table` 的 unsafe 表加给**普通段落**的（判据与
 * 理由写在 `table-pipe.ts` 文件头），所以这里分四层验：
 *
 * - **一、判据**（纯函数 `下一行像分隔行` / `紧接的那一行`）：真分隔行、普通行、
 *   段尾、行内节点、`parent` 为 `undefined`、节点不在兄弟里——各种形状；
 * - **二、包装那一层**：真的调 `不转义行首竖线(原文)` 返回的那个函数，
 *   拿假节点/假父节点/假 `state` 验各个出口；
 * - **三、逐字节往返**：真 `unified()`（`remark-parse` ＋ **`remark-gfm`**）＋
 *   真 `SerializerState`——判据是"**打开再存，字节不变**"。⚠️ 不挂 `remark-gfm`
 *   的话那颗反斜杠压根不会被写出来，这一层就成了假绿；
 * - **四、真表格那一路**：只用 remark（**不经 PM schema**），拿真表格、真格子验
 *   "**解析结构不变**"——表格没散架、格子没被劈开。⚠️ 第三层那个最小 schema
 *   里没有表格那几颗节点，真表格的源**在解析那一步就抛**
 *   （`Cannot match target parser for node: {"type":"table",…}`），所以表格只能
 *   在这一层验。
 *
 * # ⚠️ 2026-10-04 改版：判据从「这一段会不会跨行」换成「下一行长什么样」
 *
 * 第一版问的是"这一段能不能占两行以上"（`段落会跨行`），**太粗**：用户的形状
 * （`| 1 | 2 | 3 |` ＋ 硬换行 ＋ `$ 你好 $`）两行在同一段里，于是第一版一个字都
 * 不动、病还在。现在的判据只看**紧跟着的下一行像不像分隔行**，所以第一组量的
 * 是 `下一行像分隔行`，不再是 `段落会跨行`。
 *
 * ⚠️ 一并记下两条**探针验过的**事实（都影响判据，别再凭直觉改）：
 *
 * 1. **表格可以从一段的后半截起**：`甲\n| 1 | 2 |\n| - | - |` 解析出来是
 *    「段落（甲）＋ **表格**」（第四组那条钉着它）。所以"这一行不是段落的
 *    第一行 ⇒ 放掉转义也拼不出表"是**错的**，判据里不许拿位次当免死牌。
 * 2. **行首那颗反斜杠挡不住表格**：`\| 1 | 2 |` ＋ 一行合法分隔行**照样**是一张
 *    表，只是头一格被吃成 `| 1`。所以"留一颗转义"救不了表——它只让那一行留在
 *    正文里（第四组最后一条钉着）。
 *
 * # ⚠️ 写这份测试时踩到的四个坑（都踩过一遍才跑通，别重蹈）
 *
 * 1. ⚠️⚠️ **`不转义行首竖线()` 不传 `原文` = 假绿**。`原文` 缺席时它按本仓惯例
 *    （`lax-heading.ts` 那几条也是这个写法）把**节点原值**交出去——那不是"少做
 *    一点"，那是**连上游的转义一起省了**。第一版就是这个样子，于是"表格格子里
 *    那颗竖线"这一条**根本没验到**，而且它会在真表格上写出坏字节：格子里的 `|`
 *    不再转义，重新解析时一行被劈成三格。所以下面一律用真原文
 *    （`mdast-util-to-markdown` 的 `defaultHandlers.text`，也就是
 *    `state.safe(node.value, info)` 那一句，`remark-stringify` 的默认值）。
 * 2. ⚠️ schema 里**不给 `hardBreak`**：含硬换行的源在**解析**那一步就抛
 *    （`Cannot match target parser for node: {"type":"break"}`），于是
 *    `break` 那一支永远测不到。
 * 3. ⚠️ 那颗节点上 **`inline: true` 不能漏**：只写 `group: "inline"` 是"属于行内
 *    那一组"、没说"我自己就是行内的"，漏了建 schema 就抛
 *    `Mixing inline and block content`。
 * 4. ⚠️ **两处引号陷阱**：`"甲\\|乙"` 是"反斜杠＋竖线"（用户手写的那颗），
 *    `"甲 | 乙"` 才是解析之后的形状。探针里混过一次，结论就反了。
 *
 * # ⚠️ 这份测试**证明不了**什么
 *
 * - **建整个 `Editor` 那条路没验**：`create.ts` 里那条链有没有真的挂上这个处理器、
 *   挂在哪一层（顺序）——那要 `Editor.make()` ＋ 真 DOM。⚠️ 这正是
 *   `atom-space.ts` 第二版栽过的地方（挂 `$remark` 是静默空操作），所以这一条
 *   只能靠开窗目检（`docs/06` §6.3 那段"盲区"）：**打两行、切一次模式、读落盘字节**。
 * - **七种单元格对齐、表格里套行内代码**这些组合没验：`table-pipe.ts` 一个字都没碰
 *   它们，但"没碰"这件事只有开窗才看得见。
 * - ⚠️ **用户那句「表格出不来」的后半截，本文件复现不出来**（第四组最后一条钉着
 *   实测）：那颗反斜杠会被分词器当转义吃掉，`| 1 | 2 |` 该在哪格还在哪格，
 *   表照样成形。所以这一层修的是"**文件里多出一颗用户没打过的字符**"，
 *   而不是"表散架"。另一半的嫌疑是**所见即所得里没有"手打一行分隔行就成表"
 *   这条输入规则**（`preset-gfm` 的 `inputRules` 只有 `|3x2|` 与任务列表两条）
 *   ——那要问用户他心里的表格动作是哪一种，别自己定。
 */

import { Schema } from "@milkdown/kit/prose/model";
import { ParserState, SerializerState } from "@milkdown/kit/transformer";
import { defaultHandlers } from "mdast-util-to-markdown";
import remarkGfm from "remark-gfm";
import remarkParse from "remark-parse";
import remarkStringify from "remark-stringify";
import { unified } from "unified";

import { notConvertMeaningLineFirstVerticalLine, belowValueLineLikeSeparatorLine } from "../src/editor/table-pipe";

/* ── 一支极小的测试工装（与 `atom-space.test.ts` / `math-delim.test.ts` 同一套长相）── */

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
  if (a !== b) throw new Error(`${description}：拿到 ${a}，期望 ${b}`);
}

/** 本仓那条处理器的**真原文**（就是 `remark-stringify` 的默认文本处理器）。 */
const assertValueSource = defaultHandlers.text;

/* ── 一、判据 `下一行像分隔行` ────────────────────────────────────────── */

group("一、`下一行像分隔行`：什么时候才需要留着转义");

/** 造一颗段落节点（`children` 就是给的那几颗）。 */
const paragraph2 = (...children: unknown[]) => ({ type: "paragraph", children });

testCase("下一行是正经分隔行 → `true`（留着）", () => {
  const text2 = { type: "text", value: "| 1 | 2 |" };
  equal(belowValueLineLikeSeparatorLine(text2, paragraph2(text2, { type: "break" }, { type: "text", value: "--- | ---" })), true, "像");
});

testCase("省略开头/结尾的竖线也算像（`:-:` / `-` 这几种写法）", () => {
  for (const line3 of ["--- | ---", ":--- | ---:", "-", " :- | - "]) {
    const text2 = { type: "text", value: "| 1 |" };
    equal(belowValueLineLikeSeparatorLine(text2, paragraph2(text2, { type: "break" }, { type: "text", value: line3 })), true, line3);
  }
});

testCase("下一行是普通文字 → `false`（放掉）", () => {
  const text2 = { type: "text", value: "| 1 | 2 |" };
  equal(belowValueLineLikeSeparatorLine(text2, paragraph2(text2, { type: "break" }, { type: "text", value: "正文" })), false, "不像");
});

testCase("⚠️ 下一行没有 `-` 的一律不像（空行、`| 1 |`、`|` 都不行）", () => {
  for (const line3 of ["", "| 1 |", "|", " : | : "]) {
    const text2 = { type: "text", value: "| 1 |" };
    equal(belowValueLineLikeSeparatorLine(text2, paragraph2(text2, { type: "break" }, { type: "text", value: line3 })), false, JSON.stringify(line3));
  }
});

testCase("这一颗就是这一段最后一行（后面没有兄弟）→ 下一行是空行 ⇒ `false`", () => {
  const text2 = { type: "text", value: "| 1 | 2 |" };
  equal(belowValueLineLikeSeparatorLine(text2, paragraph2({ type: "text", value: "甲" }, { type: "break" }, text2)), false, "段尾");
});

testCase("⚠️ 下一行上夹着一颗**行内节点** ⇒ `false`（一定不像）", () => {
  // 分隔行整行只有 `|`、`-`、`:`、空白，而每种行内节点的写法里都有别的字符
  // （公式的 `$`、粗体的 `*`、图片的 `!`…）——所以这一支是**确凿的**，不是"说不准"。
  const text2 = { type: "text", value: "| 1 | 2 |" };
  for (const token of [
    { type: "inlineMath", value: "你好" },
    { type: "html", value: "<b>" },
    { type: "emphasis", children: [{ type: "text", value: "甲" }] },
  ]) {
    equal(belowValueLineLikeSeparatorLine(text2, paragraph2(text2, { type: "break" }, token)), false, token.type);
  }
});

testCase("⚠️ 同一行里跟在我后面的兄弟**与我无关**（判的是下一行）", () => {
  const text2 = { type: "text", value: "| 1 | 2 |" };
  // `**粗**` 挨在我后面（同一行），再往后才是换行与分隔行：**照样像**。
  equal(
    belowValueLineLikeSeparatorLine(text2, paragraph2(text2, { type: "emphasis", children: [] }, { type: "break" }, { type: "text", value: "---" })),
    true,
    "跳过同一行",
  );
});

testCase("⚠️ 同一行里那颗兄弟**自己带着换行**（`**甲  \\n乙**`）⇒ `null`（说不准）", () => {
  const text2 = { type: "text", value: "| 1 | 2 |" };
  const coarse = { type: "strong", children: [{ type: "text", value: "甲" }, { type: "break" }] };
  equal(belowValueLineLikeSeparatorLine(text2, paragraph2(text2, coarse)), null, "说不准");
});

testCase("换行藏在兄弟的 `value` 里（软换行）→ 照样读得出下一行", () => {
  const text2 = { type: "text", value: "| 1 |" };
  equal(belowValueLineLikeSeparatorLine(text2, paragraph2(text2, { type: "text", value: "甲\n--- | ---" })), true, "带 \\n 的兄弟");
  equal(belowValueLineLikeSeparatorLine(text2, paragraph2(text2, { type: "text", value: "甲\n正文" })), false, "带 \\n 的兄弟（普通行）");
});

testCase("本行之后的第二行才是分隔行 → 只看**紧接着**那一行", () => {
  const text2 = { type: "text", value: "| 1 |" };
  equal(belowValueLineLikeSeparatorLine(text2, paragraph2(text2, { type: "break" }, { type: "text", value: "甲\n---" })), false, "下一行是甲");
});

testCase("`parent` 是 `undefined`（`mdast-util-to-markdown` 处理根节点时那一次）→ `null`，也不抛", () => {
  equal(belowValueLineLikeSeparatorLine({ type: "text", value: "| 1 |" }, undefined), null, "没有 parent");
});

testCase("⚠️ 这颗节点压根不在兄弟里（认不出这一段）⇒ `null`（一个字都不许动）", () => {
  const text2 = { type: "text", value: "| 1 | 2 |" };
  equal(belowValueLineLikeSeparatorLine(text2, paragraph2({ type: "text", value: "甲" })), null, "找不到我");
});

testCase("没有 `value` 的节点 → 按空串算，不抛", () => {
  const emptyValue = { type: "text" };
  equal(belowValueLineLikeSeparatorLine(emptyValue, paragraph2(emptyValue)), false, "没有 value");
});

/* ── 二、包装那一层 ──────────────────────────────────────────────────── */

group("二、`不转义行首竖线`：各个出口");

/** 假 `原文`：把喂进去的值按上游那条 unsafe 的样子转义一下（只认**行首**那颗，`\n` 后也算）。 */
const fakeSource = ((node: { value?: string }) =>
  (node.value ?? "").replace(/(^|\n)\|(?=[\t :-])/g, "$1\\|")) as never;

/** 假 `state`：这一层只读 `stack`（真 `SerializerState` 上也是这个字段）。 */
const fakestate = (stack: string[] = ["root", "paragraph"]) => ({ stack: stack }) as never;

/**
 * 跑一遍这一层。⚠️ `父` 不给时**必须自己造一个真装着这颗节点的**——给个空
 * `children` 的假父，判据看到的是"认不出这一段"，那就是另一个出口了。
 */
function run(
  value2: string,
  stack: string[] = ["root", "paragraph"],
  parent?: unknown,
  node?: unknown,
): string {
  const PlaceManageDevice = notConvertMeaningLineFirstVerticalLine(fakeSource);
  const section = (node ?? { type: "text", value: value2 }) as { type: string; value?: string };
  return PlaceManageDevice(section as never, (parent ?? paragraph2(section)) as never, fakestate(stack) as never, {} as never);
}

testCase("段落里行首那颗竖线被放回来（用户报的那一条）", () => {
  equal(run("| 1 | 2 | 3 |"), "| 1 | 2 | 3 |", "反斜杠没了");
});

testCase("竖线后面跟 `-` / `:` 也放回来（上游的 after 就是这三个字符）", () => {
  equal(run("|- 甲"), "|- 甲", "跟减号");
  equal(run("|: 甲"), "|: 甲", "跟冒号");
});

testCase("⚠️ 表格格子里**不放**（那一颗是格子的分界线，`state.stack` 里有 `tableCell`）", () => {
  equal(run("\\| 甲", ["root", "table", "tableRow", "tableCell"]), "\\| 甲", "原样");
});

testCase("⚠️ 跨行 ＋ 下一行**不是**分隔行 ⇒ **放**（用户 2026-10-04 报的那一条）", () => {
  // 用户那两行（硬换行 ＋ 一颗公式）在这一层长这样：我这颗后面跟着 `break`
  // 再跟一颗公式节点——上一版看到"有 break"就一个字不动，病就一直留着。
  const text2 = { type: "text", value: "| 1 | 2 | 3 |" };
  const parent = paragraph2(text2, { type: "break" }, { type: "inlineMath", value: "你好" });
  equal(run("", [], parent, text2), "| 1 | 2 | 3 |", "放回来了");
});

testCase("⚠️ 跨行 ＋ 下一行**像分隔行** ⇒ 仍**不放**（保守那一支，钉住它）", () => {
  const text2 = { type: "text", value: "| 1 | 2 |" };
  const parent = paragraph2(text2, { type: "break" }, { type: "text", value: "--- | --- | ---" });
  equal(run("", [], parent, text2), "\\| 1 | 2 |", "保守：留着");
});

testCase("值里带换行 ＋ 下一行不是分隔行 ⇒ **放**", () => {
  const text2 = { type: "text", value: "甲\n| 1 |" };
  equal(run("", [], paragraph2(text2), text2), "甲\n| 1 |", "放回来了");
});

testCase("⚠️ 认不出这一段（这颗节点不在兄弟里）⇒ **不放**", () => {
  const text2 = { type: "text", value: "甲\n| 1 |" };
  // ⚠️ 这条同时钉着"行号从**竖线自己**的位置数"：`\n` 之后那颗要是按 `偏移` 数，
  // 行号会少一行、读到的就是它**自己**那一行（`\| 1 |` 不像分隔行 ⇒ 会误放）。
  equal(run("", [], paragraph2({ type: "text", value: "甲" }), text2), "甲\n\\| 1 |", "说不准：留着");
});

testCase("⚠️ 上游万一加/减了换行（行数对不上）⇒ 一个字都不动", () => {
  // 这条量的是那道"我算错了就停手"的闸：真假原文给的值多一行。
  const manyValueLine = ((node: { value?: string }) => (node.value ?? "").replace(/^/, "\n")) as never;
  const PlaceManageDevice = notConvertMeaningLineFirstVerticalLine(manyValueLine);
  const section = { type: "text", value: "\\| 1 | 2 |" };
  equal(PlaceManageDevice(section as never, paragraph2(section) as never, fakestate() as never, {} as never), "\n\\| 1 | 2 |", "不动");
});

testCase("竖线后面不是空白/`-`/`:` 的（`\\|甲`）——上游没转义它，这边也就不认", () => {
  equal(run("\\|甲"), "\\|甲", "不动");
});

testCase("行中间那颗竖线不归它管（只认行首）", () => {
  equal(run("甲 \\| 乙"), "甲 \\| 乙", "不动");
});

testCase("`原文` 缺席 → 把节点原值交出去，既不自造一条、也不自己转义", () => {
  // ⚠️ 本仓几条包装（`lax-heading.ts` 那些）都是这个写法：**没有原文就什么都不做**。
  // ⚠️ 但代价要记牢：它连上游的转义也一并省了（真表格里会写出坏字节）——
  // 所以测试和真链路上都必须把原文传进来，文件头第 1 条踩的就是这个坑。
  const PlaceManageDevice = notConvertMeaningLineFirstVerticalLine(undefined);
  equal(PlaceManageDevice({ value: "| 1 |" } as never, undefined as never, fakestate() as never, {} as never), "| 1 |", "原样");
});

/* ── 三、逐字节往返（真解析 ＋ 真序列化 ＋ 真 PM 文档树）────────────────── */

group("三、往返回合：真 `unified()` ＋ 真 `SerializerState`");

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
    // ⚠️ 硬换行那一颗**必须给**（坑 2）：`段落会跨行` 的判据之一就是"兄弟里有没有
    // `break`"，而少了这颗节点，含硬换行的源**在解析那一步就抛**。
    hardBreak: {
      // ⚠️ `inline: true` 不能漏（坑 3）：只写 `group: "inline"` 会被 ProseMirror
      // 当**块**节点，建 schema 时就抛 `Mixing inline and block content`。
      inline: true,
      group: "inline",
      parseMarkdown: {
        match: ({ type }) => type === "break",
        runner: (state, _node, type) => state.addNode(type),
      },
      toMarkdown: {
        match: (node) => node.type.name === "hardBreak",
        runner: (state) => state.addNode("break"),
      },
    },
  },
});

/**
 * 一台真处理机：**与 `create.ts` 那条链同形**——`remark-parse` ＋ `remark-gfm`
 * （竖线那颗转义就是它带来的）＋ `remark-stringify`（挂本仓那条 handler）＋
 * `remark-gfm` 再来一次（给序列化那一侧用）。
 */
function createMachine(withLocalRepositoryThatLayer = true) {
  const machine = unified().use(remarkParse).use(remarkGfm);
  machine.use(remarkStringify, withLocalRepositoryThatLayer ? { handlers: { text: notConvertMeaningLineFirstVerticalLine(assertValueSource) } } : {});
  return machine.use(remarkGfm);
}

function roundtrip(source3: string, withLocalRepositoryThatLayer = true): string {
  const machine = createMachine(withLocalRepositoryThatLayer);
  return SerializerState.create(schema, machine)(ParserState.create(schema, machine)(source3));
}

testCase("⚠️ 对照：**没有**这一层时，用户报的那颗反斜杠真的会被写出来", () => {
  const output2 = roundtrip("| 1 | 2 | 3 |\n\n正文\n", false);
  if (!output2.includes("\\|")) throw new Error(`对照没复现出病：${JSON.stringify(output2)}`);
});

testCase("挂着这一层：`| 1 | 2 | 3 |` 这一段**逐字节不变**（用户报的那一条）", () => {
  equal(roundtrip("| 1 | 2 | 3 |\n"), "| 1 | 2 | 3 |\n", "存盘");
});

testCase("整篇（多段、正文里也有竖线）逐字节不变", () => {
  const source3 = "| 1 | 2 | 3 |\n\n甲 | 乙\n\n| 单 |\n";
  equal(roundtrip(source3), source3, "整篇");
});

testCase("⚠️ 跨行那两段（软换行/硬换行）**逐字节不变**：上游会转义，本仓放回来", () => {
  // ⚠️ 这一条 2026-10-04 翻了面：第一版在这里断言的是「挂上 === 不挂」（＝认了上游
  // 那颗转义）。现在判据看的是**下一行**——这两段的下一行分别是段尾与空行，
  // 都不像分隔行，所以**放**，结果是"打开再存，一个字节都不差"。
  for (const source3 of ["甲\n| 1 | 2 |\n", "甲\\\n| 1 | 2 |\n"]) {
    const notAttach = roundtrip(source3, false);
    if (!notAttach.includes("\\|")) throw new Error(`上游本该在这儿转义：${JSON.stringify(notAttach)}`);
    equal(roundtrip(source3, true), source3, `逐字节不变：${JSON.stringify(source3)}`);
  }
});

testCase("⚠️ 用户 2026-10-04 的两行（硬换行 ＋ 正文行）**逐字节不变**", () => {
  // 截图里那一版（`$ 你好 $` 那一行会走公式那条路、把首尾空格吃掉，所以这里换成
  // 普通正文行来量"竖线那一半"；`$` 那一半在 `math-delim.test.ts` 里量）。
  // ⚠️ 硬换行用**行尾反斜杠**写（行尾两空格那种上游会改写成反斜杠——那是上游
  // 自己的口径、与这一层无关，见下一条）。
  const source3 = "| 1 | 2 | 3 |\\\n正文\n";
  const notAttach = roundtrip(source3, false);
  if (!notAttach.includes("\\|")) throw new Error(`上游本该在这儿转义：${JSON.stringify(notAttach)}`);
  equal(roundtrip(source3, true), source3, "逐字节不变");
});

testCase("⚠️ 行尾两空格那种硬换行：上游会改写成反斜杠（**与这一层无关**），竖线不许被转义", () => {
  const source3 = "| 1 | 2 | 3 |  \n正文\n";
  const output2 = roundtrip(source3, true);
  equal(output2, "| 1 | 2 | 3 |\\\n正文\n", "只剩上游那一处改写");
  if (output2.includes("\\|")) throw new Error(`竖线那颗没放回来：${JSON.stringify(output2)}`);
});

testCase("⚠️ 用户那两行的**对照**：不挂这一层，落盘的正是用户报的那颗反斜杠", () => {
  const source3 = "| 1 | 2 | 3 |  \n$ 你好 $\n";
  const notAttach = roundtrip(source3, false);
  if (!notAttach.includes("\\| 1")) throw new Error(`对照没复现出病：${JSON.stringify(notAttach)}`);
});

testCase("⚠️ 两颗都被转义的伤文件（老毛病留下的）⇒ 放回来，重新解析是**一张完整的表**", () => {
  // 这是本层**修回来的**那一档：老毛病把表头行与分隔行**两颗**都写上了转义，
  // 于是那份文件既没有表、又多两颗脏字符。两颗一起放之后，重新打开是表，
  // 头一格是干净的 `1`（只放后一颗会得到首格 `| 1` 的残表——判据不许预先改写
  // 下一行那颗 `\`，就是为了这一条）。
  const source3 = "\\| 1 | 2 |\n\\| --- | --- |\n";
  const output2 = roundtrip(source3, true);
  equal(output2, "| 1 | 2 |\n| --- | --- |\n", "两颗都放回来");
  const tree = unified().use(remarkParse).use(remarkGfm).parse(output2) as { children: { type: string }[] };
  equal(tree.children[0]?.type, "table", "重新解析是表");
});

testCase("⚠️ 行中间那颗竖线**不归它管**：挂着与不挂，输出一字不差", () => {
  // 背景事实，不是本次改动的功劳：行中间的 `\|` 在解析时就已经还原成 `|` 了
  // （反斜杠是给**分词器**看的），重新写出来时它不在行首、上游不需要再转义它
  // ——所以 `甲 \| 乙` 存盘会变成 `甲 | 乙`。⚠️ 这事**早于**本次改动、与它无关；
  // 钉在这里是为了别让人日后把这笔账记到这一层头上。
  const source3 = "甲 \\| 乙\n";
  equal(roundtrip(source3, true), roundtrip(source3, false), "两边一致");
});

/* ── 四、真表格那一路（只用 remark：PM 那套最小 schema 装不下表格）──────── */

group("四、真表格：解析结构不变");

/** 只跑 remark：拿 mdast（**真表格**也能跑，不需要 PM schema）。 */
function readJoinConstruct(source3: string): unknown {
  return unified().use(remarkParse).use(remarkGfm).parse(source3);
}

/** 去掉位置信息再比结构（列宽对齐会让偏移量合法地变掉，位置不该参与比较）。 */
function goPosition(n: unknown): unknown {
  if (Array.isArray(n)) return n.map(goPosition);
  if (n && typeof n === "object") {
    const correctImage = n as Record<string, unknown>;
    delete correctImage.position;
    for (const k of Object.keys(correctImage)) correctImage[k] = goPosition(correctImage[k]);
  }
  return n;
}

function joinConstruct(source3: string): string {
  return JSON.stringify(goPosition(readJoinConstruct(source3)));
}

/** 只用 remark 串一遍（不经 PM schema，所以真表格也能跑）。 */
function remarkRoundtrip(source3: string, withLocalRepositoryThatLayer = true): string {
  const machine = unified().use(remarkParse).use(remarkGfm);
  machine.use(remarkStringify, withLocalRepositoryThatLayer ? { handlers: { text: notConvertMeaningLineFirstVerticalLine(assertValueSource) } } : {});
  machine.use(remarkGfm);
  return String(machine.processSync(source3));
}

testCase("⚠️ 真表格逐字节不变（三行、两列）", () => {
  const source3 = "| a | b |\n| - | - |\n| 1 | 2 |\n";
  equal(remarkRoundtrip(source3), source3, "表格");
});

testCase("⚠️ 格子里那颗竖线**必须留着**：`\\|` 没了，一行就被劈成三格", () => {
  const source3 = "| a\\|b | c |\n| - | - |\n";
  // 分隔行会被按列宽补成等长（`markdown-table` 自己的排版），所以判据是
  // **结构不变**，不是字节不变——但格子里的转义必须一个不少。
  const output2 = remarkRoundtrip(source3);
  if (!output2.includes("a\\|b")) throw new Error(`格子里那颗竖线被放回来了：${JSON.stringify(output2)}`);
  equal(joinConstruct(output2), joinConstruct(source3), "结构不变（还是两列）");
  const table = readJoinConstruct(output2) as { children: { type: string; children: unknown[] }[] };
  equal(table.children[0].type, "table", "还是表格");
  equal((table.children[0].children[0] as { children: unknown[] }).children.length, 2, "还是两格");
});

testCase("⚠️ 那句「表格出不来」的**后半截不在这颗反斜杠上**（如实钉住，别自欺）", () => {
  // 我原以为的走法是「病发时多一颗反斜杠 → 再补一行分隔行 → 表就出不来」。
  // **实测推翻了**：分词器把那颗反斜杠当转义吃掉，`\| 1 | 2 |` 里的 `1` 该在哪个
  // 格子还在哪个格子，所以表照样成形（结构一模一样）。
  const head2 = "| 1 | 2 | 3 |\n";
  const separator2 = "| - | - | - |\n";
  const broken = remarkRoundtrip(head2, false) + separator2;
  const getType = (source3: string) => (readJoinConstruct(source3) as { children: { type: string }[] }).children[0]?.type;
  equal(getType(broken), "table", "带着那颗反斜杠，表**也**成得出来");
  equal(getType(broken), getType(remarkRoundtrip(head2, true) + separator2), "两边一样");
  // ⚠️ 所以这一层修的到底是什么：**文件里多出一颗用户没打过的字符**
  // （用户定的死规矩「存盘不要自动修复」被破了），不是"表散架"。
  // 「表格出不来」那一半的两个真嫌疑另行记着：
  //   1. 所见即所得里**手打一行分隔行**想让上面那行变成表——`preset-gfm` 里
  //      压根没有这条输入规则（`inputRules` 只有 `|3x2|` 与任务列表两条），
  //      要问用户他心里的表格动作是哪一种（Typora 那套？）；
  //   2. 待用户拿真文件复现。
  if (!broken.includes("\\|")) throw new Error(`病没复现出来：${JSON.stringify(broken)}`);
});

testCase("⚠️ 表格**可以**从一段的后半截起（`甲` ＋ 表头行 ＋ 分隔行 ⇒ 段落 ＋ 表格）", () => {
  // ⚠️ 判据里那条"别拿位次当免死牌"就是靠这一条立的：我原以为表格必定从段落的
  // 第一行起，**探针推翻了**。
  const source3 = "甲\n| 1 | 2 |\n| - | - |\n";
  const tree = readJoinConstruct(source3) as { children: { type: string; children?: unknown[] }[] };
  equal(tree.children.map((n) => n.type), ["paragraph", "table"], "段落 ＋ 表格");
  // ⚠️ 而"分隔行比表头行多一格"就拼不出表——这正是本层能放心放掉转义的**理由**
  // 之一（放掉之后格数关系不变，还是拼不出表）。第一行那个 `\|` 只是把首格
  // 吃成 `| 1`，挡不住表格本身（上一条量过）。
  const notBecomeTable = readJoinConstruct("| 1 | 2 |\n| - | - | - |\n") as { children: { type: string }[] };
  equal(notBecomeTable.children.map((n) => n.type), ["paragraph"], "格数对不上 ⇒ 不是表");
});

testCase("⚠️ 各种「长得像表格但不是表格」的形状：结构一律不变", () => {
  for (const source3 of [
    "| 单 |\n",
    "| - |\n",
    "| 1 | 2 |\n| - | - |\n",
    "甲\n| 1 | 2 |\n| - | - |\n", // 探针验过：解析出来是「段落 ＋ 表格」，那句「甲」不许被并进表里
    "| a | b |\n| :- | -: |\n| 1 | 2 |\n",
    "| a | b |\n| - | - |\n| 1 | 2 |\n| 3 | 4 |\n",
  ]) {
    equal(joinConstruct(remarkRoundtrip(source3)), joinConstruct(source3), `结构不变：${JSON.stringify(source3)}`);
  }
});

testCase("⚠️ 七种对齐那一列不许散：`align` 原样回来", () => {
  const source3 = "| a | b | c |\n| :- | :-: | -: |\n| 1 | 2 | 3 |\n";
  const output2 = readJoinConstruct(remarkRoundtrip(source3)) as { children: { align?: unknown }[] };
  equal(output2.children[0].align, ["left", "center", "right"], "对齐");
});

/* ── 收尾 ─────────────────────────────────────────────────────────────── */

console.log(`\n${"═".repeat(60)}`);
console.log(`通过 ${passed} 条，失败 ${failure} 条`);
if (failure) console.log(`失败的是：\n  · ${failureList.join("\n  · ")}`);
process.exit(failure ? 1 : 0);
