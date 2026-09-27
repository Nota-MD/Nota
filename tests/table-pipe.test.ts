/**
 * `src/editor/table-pipe.ts`（行首竖线前面那颗多余的反斜杠）的**可运行**测试集。
 * 2026-09-27 写，与那个文件同批落地。
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
 * 用户 2026-09-27 报的：「切换到所见即所得模式再切换回来会自动添加「\」，
 * 表格出不来」。那颗反斜杠是 `mdast-util-gfm-table` 的 unsafe 表加给**普通段落**
 * 的（判据与理由写在 `table-pipe.ts` 文件头），所以这里分四层验：
 *
 * - **一、判据**（纯函数 `段落会跨行`）：值里带换行、兄弟里有 `break`、
 *   `parent` 为 `undefined` 三种形状；
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
 *    `段落会跨行` 的 `break` 那一支永远测不到。
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
 *   只能靠开窗目检（`docs/06` §6.3 那段"盲区"）：**插一张表、切一次模式、读落盘字节**。
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

import { 不转义行首竖线, 段落会跨行 } from "../src/editor/table-pipe";

/* ── 一支极小的测试工装（与 `atom-space.test.ts` / `math-delim.test.ts` 同一套长相）── */

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
  if (a !== b) throw new Error(`${说明}：拿到 ${a}，期望 ${b}`);
}

/** 本仓那条处理器的**真原文**（就是 `remark-stringify` 的默认文本处理器）。 */
const 真原文 = defaultHandlers.text;

/* ── 一、判据 ─────────────────────────────────────────────────────────── */

组("一、`段落会跨行`：什么时候一个字都不许动");

测("一段普通的单行文字 → 不跨行（可以放回竖线）", () => {
  等(段落会跨行({ type: "text", value: "| 1 | 2 |" }, { type: "paragraph", children: [] }), false, "单行");
});

测("值里带换行 → 跨行", () => {
  等(段落会跨行({ type: "text", value: "甲\n| 1 |" }, { type: "paragraph", children: [] }), true, "带 \\n");
});

测("兄弟里有 `break`（硬换行）→ 跨行", () => {
  const 文本 = { type: "text", value: "| 1 | 2 |" };
  等(段落会跨行(文本, { type: "paragraph", children: [{ type: "text", value: "甲" }, { type: "break" }, 文本] }), true, "有 break");
});

测("⚠️ 那个兄弟节点叫 `break`，不叫 `html`——写错不报错、只是一直不生效", () => {
  const 文本 = { type: "text", value: "| 1 | 2 |" };
  等(段落会跨行(文本, { type: "paragraph", children: [{ type: "html", value: "<br />" }, 文本] }), false, "html 不算换行");
});

测("`parent` 是 `undefined`（`mdast-util-to-markdown` 处理根节点时那一次）→ 不跨行、也不抛", () => {
  等(段落会跨行({ type: "text", value: "| 1 |" }, undefined), false, "没有 parent");
});

测("没有 `value` 的节点 → 按空串算，不抛", () => {
  等(段落会跨行({ type: "text" }, { type: "paragraph", children: [] }), false, "没有 value");
});

/* ── 二、包装那一层 ──────────────────────────────────────────────────── */

组("二、`不转义行首竖线`：各个出口");

/** 假 `原文`：把喂进去的值按上游那条 unsafe 的样子转义一下（只认行首那颗）。 */
const 假原文 = ((node: { value?: string }) =>
  (node.value ?? "").replace(/^\|(?=[\t :-])/, "\\|")) as never;

/** 假 `state`：这一层只读 `stack`（真 `SerializerState` 上也是这个字段）。 */
const 假state = (栈: string[] = ["root", "paragraph"]) => ({ stack: 栈 }) as never;

function 跑(
  值: string,
  栈: string[] = ["root", "paragraph"],
  父: unknown = { type: "paragraph", children: [] },
  节点?: unknown,
): string {
  const 处理器 = 不转义行首竖线(假原文);
  const 节 = 节点 ?? { type: "text", value: 值 };
  return 处理器(节 as never, 父 as never, 假state(栈) as never, {} as never);
}

测("段落里行首那颗竖线被放回来（用户报的那一条）", () => {
  等(跑("| 1 | 2 | 3 |"), "| 1 | 2 | 3 |", "反斜杠没了");
});

测("竖线后面跟 `-` / `:` 也放回来（上游的 after 就是这三个字符）", () => {
  等(跑("|- 甲"), "|- 甲", "跟减号");
  等(跑("|: 甲"), "|: 甲", "跟冒号");
});

测("⚠️ 表格格子里**不放**（那一颗是格子的分界线，`state.stack` 里有 `tableCell`）", () => {
  等(跑("\\| 甲", ["root", "table", "tableRow", "tableCell"]), "\\| 甲", "原样");
});

测("⚠️ 跨行的那一段**不放**（下一行真有可能是分隔行）", () => {
  const 文本 = { type: "text", value: "| 1 | 2 |" };
  const 父 = { type: "paragraph", children: [{ type: "text", value: "甲" }, { type: "break" }, 文本] };
  等(跑("", [], 父, 文本), "\\| 1 | 2 |", "保守：留着");
});

测("值里带换行的那一颗也**不放**", () => {
  等(跑("甲\n\\| 1 |"), "甲\n\\| 1 |", "保守：留着");
});

测("竖线后面不是空白/`-`/`:` 的（`\\|甲`）——上游没转义它，这边也就不认", () => {
  等(跑("\\|甲"), "\\|甲", "不动");
});

测("行中间那颗竖线不归它管（只认行首）", () => {
  等(跑("甲 \\| 乙"), "甲 \\| 乙", "不动");
});

测("`原文` 缺席 → 把节点原值交出去，既不自造一条、也不自己转义", () => {
  // ⚠️ 本仓几条包装（`lax-heading.ts` 那些）都是这个写法：**没有原文就什么都不做**。
  // ⚠️ 但代价要记牢：它连上游的转义也一并省了（真表格里会写出坏字节）——
  // 所以测试和真链路上都必须把原文传进来，文件头第 1 条踩的就是这个坑。
  const 处理器 = 不转义行首竖线(undefined);
  等(处理器({ value: "| 1 |" } as never, undefined as never, 假state() as never, {} as never), "| 1 |", "原样");
});

/* ── 三、逐字节往返（真解析 ＋ 真序列化 ＋ 真 PM 文档树）────────────────── */

组("三、往返回合：真 `unified()` ＋ 真 `SerializerState`");

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
function 造机(带本仓那层 = true) {
  const 机 = unified().use(remarkParse).use(remarkGfm);
  机.use(remarkStringify, 带本仓那层 ? { handlers: { text: 不转义行首竖线(真原文) } } : {});
  return 机.use(remarkGfm);
}

function 往返(源: string, 带本仓那层 = true): string {
  const 机 = 造机(带本仓那层);
  return SerializerState.create(schema, 机)(ParserState.create(schema, 机)(源));
}

测("⚠️ 对照：**没有**这一层时，用户报的那颗反斜杠真的会被写出来", () => {
  const 出 = 往返("| 1 | 2 | 3 |\n\n正文\n", false);
  if (!出.includes("\\|")) throw new Error(`对照没复现出病：${JSON.stringify(出)}`);
});

测("挂着这一层：`| 1 | 2 | 3 |` 这一段**逐字节不变**（用户报的那一条）", () => {
  等(往返("| 1 | 2 | 3 |\n"), "| 1 | 2 | 3 |\n", "存盘");
});

测("整篇（多段、正文里也有竖线）逐字节不变", () => {
  const 源 = "| 1 | 2 | 3 |\n\n甲 | 乙\n\n| 单 |\n";
  等(往返(源), 源, "整篇");
});

测("跨行那两段（软换行/硬换行）**一个字都不动**：挂着与不挂，输出一致", () => {
  // 保守那一条的判据（`段落会跨行`）在真管道上的样子：上游在这两个位置**会**
  // 把竖线转义掉，本仓这层也**认了**（不碰）——所以 挂上 === 不挂。
  for (const 源 of ["甲\n| 1 | 2 |\n", "甲\\\n| 1 | 2 |\n"]) {
    const 不挂 = 往返(源, false);
    等(往返(源, true), 不挂, `一字不动：${JSON.stringify(源)}`);
    if (!不挂.includes("\\|")) throw new Error(`上游本该在这儿转义：${JSON.stringify(不挂)}`);
  }
});

测("⚠️ 行中间那颗竖线**不归它管**：挂着与不挂，输出一字不差", () => {
  // 背景事实，不是本次改动的功劳：行中间的 `\|` 在解析时就已经还原成 `|` 了
  // （反斜杠是给**分词器**看的），重新写出来时它不在行首、上游不需要再转义它
  // ——所以 `甲 \| 乙` 存盘会变成 `甲 | 乙`。⚠️ 这事**早于**本次改动、与它无关；
  // 钉在这里是为了别让人日后把这笔账记到这一层头上。
  const 源 = "甲 \\| 乙\n";
  等(往返(源, true), 往返(源, false), "两边一致");
});

/* ── 四、真表格那一路（只用 remark：PM 那套最小 schema 装不下表格）──────── */

组("四、真表格：解析结构不变");

/** 只跑 remark：拿 mdast（**真表格**也能跑，不需要 PM schema）。 */
function 读结构(源: string): unknown {
  return unified().use(remarkParse).use(remarkGfm).parse(源);
}

/** 去掉位置信息再比结构（列宽对齐会让偏移量合法地变掉，位置不该参与比较）。 */
function 去位置(n: unknown): unknown {
  if (Array.isArray(n)) return n.map(去位置);
  if (n && typeof n === "object") {
    const 对象 = n as Record<string, unknown>;
    delete 对象.position;
    for (const k of Object.keys(对象)) 对象[k] = 去位置(对象[k]);
  }
  return n;
}

function 结构(源: string): string {
  return JSON.stringify(去位置(读结构(源)));
}

/** 只用 remark 串一遍（不经 PM schema，所以真表格也能跑）。 */
function remark往返(源: string, 带本仓那层 = true): string {
  const 机 = unified().use(remarkParse).use(remarkGfm);
  机.use(remarkStringify, 带本仓那层 ? { handlers: { text: 不转义行首竖线(真原文) } } : {});
  机.use(remarkGfm);
  return String(机.processSync(源));
}

测("⚠️ 真表格逐字节不变（三行、两列）", () => {
  const 源 = "| a | b |\n| - | - |\n| 1 | 2 |\n";
  等(remark往返(源), 源, "表格");
});

测("⚠️ 格子里那颗竖线**必须留着**：`\\|` 没了，一行就被劈成三格", () => {
  const 源 = "| a\\|b | c |\n| - | - |\n";
  // 分隔行会被按列宽补成等长（`markdown-table` 自己的排版），所以判据是
  // **结构不变**，不是字节不变——但格子里的转义必须一个不少。
  const 出 = remark往返(源);
  if (!出.includes("a\\|b")) throw new Error(`格子里那颗竖线被放回来了：${JSON.stringify(出)}`);
  等(结构(出), 结构(源), "结构不变（还是两列）");
  const 表格 = 读结构(出) as { children: { type: string; children: unknown[] }[] };
  等(表格.children[0].type, "table", "还是表格");
  等((表格.children[0].children[0] as { children: unknown[] }).children.length, 2, "还是两格");
});

测("⚠️ 那句「表格出不来」的**后半截不在这颗反斜杠上**（如实钉住，别自欺）", () => {
  // 我原以为的走法是「病发时多一颗反斜杠 → 再补一行分隔行 → 表就出不来」。
  // **实测推翻了**：分词器把那颗反斜杠当转义吃掉，`\| 1 | 2 |` 里的 `1` 该在哪个
  // 格子还在哪个格子，所以表照样成形（结构一模一样）。
  const 头 = "| 1 | 2 | 3 |\n";
  const 分隔 = "| - | - | - |\n";
  const 坏 = remark往返(头, false) + 分隔;
  const 取类型 = (源: string) => (读结构(源) as { children: { type: string }[] }).children[0]?.type;
  等(取类型(坏), "table", "带着那颗反斜杠，表**也**成得出来");
  等(取类型(坏), 取类型(remark往返(头, true) + 分隔), "两边一样");
  // ⚠️ 所以这一层修的到底是什么：**文件里多出一颗用户没打过的字符**
  // （用户定的死规矩「存盘不要自动修复」被破了），不是"表散架"。
  // 「表格出不来」那一半的两个真嫌疑另行记着：
  //   1. 所见即所得里**手打一行分隔行**想让上面那行变成表——`preset-gfm` 里
  //      压根没有这条输入规则（`inputRules` 只有 `|3x2|` 与任务列表两条），
  //      要问用户他心里的表格动作是哪一种（Typora 那套？）；
  //   2. 待用户拿真文件复现。
  if (!坏.includes("\\|")) throw new Error(`病没复现出来：${JSON.stringify(坏)}`);
});

测("⚠️ 各种「长得像表格但不是表格」的形状：结构一律不变", () => {
  for (const 源 of [
    "| 单 |\n",
    "| - |\n",
    "| 1 | 2 |\n| - | - |\n",
    "甲\n| 1 | 2 |\n| - | - |\n", // 探针验过：解析出来是「段落 ＋ 表格」，那句「甲」不许被并进表里
    "| a | b |\n| :- | -: |\n| 1 | 2 |\n",
    "| a | b |\n| - | - |\n| 1 | 2 |\n| 3 | 4 |\n",
  ]) {
    等(结构(remark往返(源)), 结构(源), `结构不变：${JSON.stringify(源)}`);
  }
});

测("⚠️ 七种对齐那一列不许散：`align` 原样回来", () => {
  const 源 = "| a | b | c |\n| :- | :-: | -: |\n| 1 | 2 | 3 |\n";
  const 出 = 读结构(remark往返(源)) as { children: { align?: unknown }[] };
  等(出.children[0].align, ["left", "center", "right"], "对齐");
});

/* ── 收尾 ─────────────────────────────────────────────────────────────── */

console.log(`\n${"═".repeat(60)}`);
console.log(`通过 ${通过} 条，失败 ${失败} 条`);
if (失败) console.log(`失败的是：\n  · ${失败清单.join("\n  · ")}`);
process.exit(失败 ? 1 : 0);
