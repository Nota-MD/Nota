/**
 * `src/editor/syntax-escape.ts`（**行首那两种「Nota 不认识的语法」别被加上反斜杠**）
 * 的**可运行**测试集。2026-10-04 写，与那个文件同批落地（`docs/07` 第 56 项那一族的
 * 最后两条）。
 *
 * # 跑法
 *
 * ```sh
 * npx esbuild tests/syntax-escape.test.ts --bundle --platform=node --format=esm \
 *   --outfile=/tmp/nota-测试/syntax-escape.mjs && node /tmp/nota-测试/syntax-escape.mjs
 * ```
 *
 * # 这份测试盯的是什么
 *
 * 上游 `mdast-util-to-markdown` 的 unsafe 表里有一条 `{character: '[',
 * inConstruct: 'phrasing'}`——**文本节点里的每一颗 `[` 都转义**（"它可能起一个
 * 链接"）。于是 `[TOC]` 存成 `\[TOC]`、`> [!NOTE]` 存成 `> \[!NOTE]`，
 * **用户没打过那颗反斜杠**。本层把它们放回来。
 *
 * 三件事必须同时成立，所以分三组钉：
 *
 * 1. **该放回来的放回来了**（`[TOC]` / 五种 `[!TYPE]` / 引用块里那种行首）；
 * 2. **不该碰的一个字节都不碰**（行中间的 `[TOC]`、`[foo]`、脚注、真链接、
 *    别的层管的那些字符）——⚠️ **"该转义的被放过"是这一族最容易做错的地方**：
 *    做一次大赦（"凡是 `[` 都不转义"）当场就会把真链接语法拆掉；
 * 3. **"有配对定义时根本走不到这一层"**——⚠️ **这一条是本层判据的立足点**：
 *    CommonMark 的 shortcut reference link 是**解析期**配对的，文档里只要有
 *    `[TOC]: http://…`，正文里的 `[TOC]` 就成了 `link` 节点、压根不是文本，
 *    所以"能看见这个文本节点"本身就证明了"没有与之配对的定义"。
 *    ⚠️ 这一条**不成立的话整个第一组都是错的**，所以它必须自己有一条用例。
 *
 * # ⚠️ 这是端到端往返，不是纯函数
 *
 * 每一组都走**真 `unified()` ＋ 真 `remark-parse` ＋ 真 `remark-stringify`**，
 * 而且序列化那一步挂的是**真的整条 `文本处理器链`**（七层，`text-handlers.ts`）
 * ——⚠️ **不是只挂本层**：这条链是套着的，哪一层把原文弄丢都会让别的层写出坏字节
 *（`text-handlers.ts` 文件头最后一段记着），只挂一层的测法看不出那件事。
 * 文本处理器用的是 `mdast-util-to-markdown` 自己的 `defaultHandlers.text`。
 *
 * # ⚠️ 这份测试**证明不了**什么
 *
 * - **真编辑器里的往返没验**：这里没有 PM 文档、没有 schema、没有 `Editor.make()`
 *   （本仓没有 jsdom），走的是 mdast → mdast。⚠️ 与 `table-pipe.test.ts` /
 *   `math-delim.test.ts` 同一条边界（那两份也只到 mdast 这一层）。
 * - **`[TOC]` 在 Nota 里仍然什么都不做**：本层只管"存回去的字节"，
 *   **不给它任何渲染**（Nota 的目录是侧栏那条，不是 Typora 的 `[TOC]`）。
 * - **别的几层没被回归**：这里只覆盖 `[`。加层那一批把
 *   `tests/table-pipe.test.ts` / `tests/math-delim.test.ts` /
 *   `tests/atom-space.test.ts` 各跑过一遍（全绿），但"它们与本层互不干扰"
 *   这件事**是那三份证出来的，不是这一份**。
 */

import { defaultHandlers } from "mdast-util-to-markdown";
import remarkGfm from "remark-gfm";
import remarkParse from "remark-parse";
import remarkStringify from "remark-stringify";
import { unified } from "unified";

import { textHandlerChain } from "../src/editor/text-handlers";

/* ── 一支极小的测试工装（与 `tree-options.test.ts` 同一套长相）── */

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

/**
 * 真解析 ＋ 真序列化，序列化那一步挂**整条七层链**。
 *
 * ⚠️ `text` 那一条**必须**把 `defaultHandlers.text` 传进去：不传的话本仓那几层
 * 会把上游的转义一起省掉，测出来的东西与产品不一致（"别把原文弄丢"那条）。
 */
function roundtrip(source3: string): string {
  const tree = unified().use(remarkParse).use(remarkGfm).parse(source3);
  return unified()
    .use(remarkStringify, {
      bullet: "-" as const,
      rule: "-" as const,
      handlers: { text: textHandlerChain(defaultHandlers.text as never) as never },
    })
    .use(remarkGfm)
    .stringify(tree as never);
}

/* ── 一、该放回来的放回来了 ─────────────────────────────────────────── */

group("一、行首那两种语法不再被加反斜杠");

testCase("`[TOC]` 独占一行 ⇒ 一个字节都不多", () => {
  equal(roundtrip("[TOC]\n"), "[TOC]\n", "Typora 的目录标记");
});

testCase("`[toc]` 小写也认（大小写两种写法都常见）", () => {
  equal(roundtrip("[toc]\n"), "[toc]\n", "小写");
});

testCase("`> [!NOTE]` 不再变成 `> \\[!NOTE]`", () => {
  // ⚠️ 文本节点自己那个字符串是从 `[` 开始的（`>` 是引用块的外壳），
  // 所以"行首"这条判据在文本节点上仍然成立——与 `不转义行首等号` 那条注解同理。
  equal(roundtrip("> [!NOTE]\n> 内容\n"), "> [!NOTE]\n> 内容\n", "GitHub 提示块");
});

testCase("五种 `[!TYPE]` 一个不落", () => {
  for (const typeValue2 of ["NOTE", "TIP", "IMPORTANT", "WARNING", "CAUTION"]) {
    const source3 = `> [!${typeValue2}]\n> 甲\n`;
    equal(roundtrip(source3), source3, `${typeValue2} 那一型`);
  }
});

testCase("提示块前面还有别的话、它在段落中间那一行时也认（行首是相对文本节点说的）", () => {
  const source3 = "[TOC]\n\n甲 [TOC] 乙\n";
  // ⚠️ 第二段那颗 `[TOC]` **不在行首** ⇒ 照旧转义（见第二组）。
  equal(roundtrip(source3), "[TOC]\n\n甲 \\[TOC] 乙\n", "第一段放回来、第二段照旧转义");
});

/* ── 二、不该碰的一个字节都不碰 ─────────────────────────────────────── */

group("二、名字不在册的一律照旧");

testCase("`[foo]` 这类随便什么方括号**照旧转义**（不做大赦）", () => {
  equal(roundtrip("[foo]\n"), "\\[foo]\n", "不认识就别动");
});

testCase("行中间的 `[TOC]` 照旧转义（它不是语法，是普通文字）", () => {
  equal(roundtrip("甲 [TOC] 乙\n"), "甲 \\[TOC] 乙\n", "块首语法只在块首");
});

testCase("`[!NOTE]` 少了一头/多了一头都不认", () => {
  equal(roundtrip("[!NOTE\n"), "\\[!NOTE\n", "只有左中括号");
  equal(roundtrip("[!NOPE]\n"), "\\[!NOPE]\n", "不是那五种之一");
  equal(roundtrip("[!note]\n"), "\\[!note]\n", "小写的提示块名不算（GitHub 那边也是大写）");
});

testCase("脚注引用与真链接**一个字节都不动**（它们本来就该是它们的样子）", () => {
  equal(roundtrip("文字[^1]\n\n[^1]: 注\n"), "文字[^1]\n\n[^1]: 注\n", "脚注");
  equal(roundtrip("[甲](http://x)\n"), "[甲](http://x)\n", "行内链接");
  equal(roundtrip("[甲]: http://x\n\n[甲]\n"), "[甲]: http://x\n\n[甲]\n", "引用式链接");
});

testCase("别的层管的那些字符不受影响（本层只认 `[`）", () => {
  equal(roundtrip("==重点==\n"), "==重点==\n", "行首等号那一层");
  equal(roundtrip("#标签\n"), "#标签\n", "行首井号那一层");
  equal(roundtrip("甲 ~ 乙\n"), "甲 ~ 乙\n", "孤立波浪号那一层");
});

/* ── 三、判据的立足点：有定义时根本走不到这一层 ─────────────────────── */

group("三、`[TOC]:` 有定义时它是链接，不是文本");

testCase("文档里有 `[TOC]: http://x` ⇒ 正文那颗 `[TOC]` 是 `link` 节点、本层碰不到", () => {
  const source3 = "[TOC]: http://x\n\n[TOC]\n";
  // ⚠️ 这一条**必须**逐字节相同，而且**不是靠本层**——上游的 `linkReference`
  // 处理器本来就写 `[TOC]`（它自己知道那是链接）。⚠️ 本层在这里**看不到文本**。
  equal(roundtrip(source3), source3, "定义与引用都在");

  // ⚠️ 反过来验一遍"真走到本层了"：没有定义那一份，本层动过手。
  const withoutFixedMeaning = "[TOC]\n";
  equal(roundtrip(withoutFixedMeaning), withoutFixedMeaning, "没有定义 ⇒ 是文本 ⇒ 本层去掉反斜杠");
});

testCase("⚠️ 定义一出现，**整篇**的 `[TOC]` 都成链接——连行中间那颗也是", () => {
  // ⚠️ 这一条最初被我写反了（我以为"行中间那颗仍是文本、照旧转义"）。
  // 实测：只要文档里有 `[TOC]:`，`甲 [TOC] 乙` 里那颗**也**是 `linkReference`
  // ——CommonMark 的 label 配对是**全文档**的、与位置无关。
  // ⚠️ 所以它照样逐字节相同，但**这条相同不是本层的功劳**（本层看不到文本）。
  equal(roundtrip("甲 [TOC] 乙\n\n[TOC]: http://x\n"), "甲 [TOC] 乙\n\n[TOC]: http://x\n", "行中间那颗也成链接");
});

testCase("同一份文档里三种形态：提示块（本层动手）＋ 定义 ＋ 引用（本层碰不到）", () => {
  const source3 = "> [!NOTE]\n> 甲\n\n[TOC]: http://x\n\n[TOC]\n";
  // ⚠️ 第一段走本层（`[!NOTE]` 是文本）、后两段走上游的 `definition` /
  // `linkReference` 处理器。三处答案都对，而**只有第一处是本层做的**——
  // 所以这一组才有意义：本层的动手范围就限定在"真的是文本"的那些节点上。
  equal(roundtrip(source3), source3, "三种形态各一份");
});

/* ── 收尾 ───────────────────────────────────────────────────────────── */

console.log(`\n———— 通过 ${pass} 条，失败 ${fail} 条 ————`);
if (fail) {
  console.log("失败清单：");
  for (const name3 of failed) console.log(`  · ${name3}`);
  process.exit(1);
}
