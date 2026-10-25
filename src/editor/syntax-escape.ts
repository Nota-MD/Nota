/**
 * **Nota 不认识的两种「块首语法」不许被加上反斜杠**（`docs/07` backlog 第 56 项那一族的
 * 最后两条，2026-10-04）。
 *
 * # 病灶
 *
 * `mdast-util-to-markdown` 的 unsafe 表里有三条管 `[` 的规则
 *（`lib/unsafe.js:121-123`）：
 *
 * ```js
 * { atBreak: true, character: '[' },
 * { character: '[', inConstruct: 'phrasing', notInConstruct: fullPhrasingSpans },
 * { character: '[', inConstruct: ['label', 'reference'] },
 * ```
 *
 * 中间那条的意思是**只要是文本节点里的 `[`，一律转义**（"它可能起一个链接"。）
 * 于是用户写的 `[TOC]`（Typora 的目录标记）与 `> [!NOTE]`（GitHub 的提示块）
 * 存盘就变成 `\[TOC]` / `> \[!NOTE]` —— **用户没打过那颗反斜杠**。
 *
 * ⚠️ 这与 `lax-heading.ts` 治的 `\#标签`、`inline-marks.ts` 的
 * `不转义行首等号` 治的 `\==重点==` 是**同一个病**（"Nota 往用户写的东西上加字符"），
 * 只不过那两条已经在，这一条是同一族的第三个成员。
 *
 * # 为什么可以放心去掉它（⚠️ 这一条是判据的立足点，别删）
 *
 * **能看见这个文本节点，就说明它没被解析成链接。** CommonMark 的
 * shortcut reference link 是**解析期**就配对的：文档里只要有 `[TOC]: http://…`
 * 这样的定义，正文里的 `[TOC]` 打开时就成了一条链接（`link` 节点），
 * **根本走不到文本处理器这儿**。所以"这一段是文本"这件事本身，
 * 就已经证明了"文档里没有与之配对的定义"。
 *
 * ⚠️ 实测（`tests/syntax-escape.test.ts` 第三组）：
 *
 * | 源码 | 出来 | 为什么 |
 * |---|---|---|
 * | `[TOC]`（文档里没有定义） | `[TOC]` | 本层去掉反斜杠 |
 * | `[TOC]` ＋ 文末 `[TOC]: http://x` | `[TOC]` | **解析期就成链接了**，本层碰不到 |
 * | `甲 [TOC] 乙`（行中间） | 照旧 `\[TOC]` | 见下面那条"只在行首" |
 * | `[foo]` / `[随便什么]` | 照旧 `\[foo]` | **不在认识的名字里**，不做大赦 |
 * | `\#标签` / `[1]` 这类别的 | 一个字节都不动 | 每条只认自己那一种 |
 *
 * ⚠️ **代价如实记**：用户**特意**写成 `\[TOC]`（就是不想让它被认成语法）时，
 * 打开再存会变成 `[TOC]` —— 与 `不转义行首等号` 那一条的代价**一模一样**
 *（那颗反斜杠本来就多余：没有定义的时候 `[TOC]` 与 `\[TOC]` 在 CommonMark 里
 * 是同一件事）。⚠️ 这是"知情接受的字节改动"，与第 56 项那一族同一个性质。
 *
 * # ⚠️ 只认行首，而且只认**名字在册**的那几个
 *
 * 两条都收得紧，理由各一条：
 *
 * 1. **只在行首**（`(^|\n)`）：这两种语法**本来就是块首语法**——
 *    Typora 的 `[TOC]` 要独占一行才有用，GitHub 的 `[!NOTE]` 要在一段引用
 *    的第一行。行中间那颗 `[TOC]` 不是语法，**照旧转义**。
 *    ⚠️ 引用块与列表项里"行首"仍然成立：文本节点自己那个字符串是从 `^` 开始的
 *    （输出是 `> [!NOTE]`），判据在文本节点上、不在最终字节上——
 *    与 `不转义行首等号` 那条注解说的是同一件事。
 * 2. **名字在册**：只认 `TOC`（大小写两种）与 GitHub 那五种提示块
 *    （`NOTE` / `TIP` / `IMPORTANT` / `WARNING` / `CAUTION`）。
 *    **不做"凡是 `[` 都不转义"那种大赦**——那会把真的链接语法、脚注引用
 *    与用户自己写的转义一起放过。
 *
 * # 挂在哪
 *
 * `create.ts` 的 `.config()` 里那条链的**第七层**（`text-handlers.ts`，
 * 与 `不转义行首等号` 挨着——两条都是"行首那个标记别被转义"）。
 * **恒挂**，不分模式、不分开关：它只在"本来就是普通文字"的那种写法上生效。
 * ⚠️ 只能挂 `handlers.text`，不能挂 `$remark`——理由见 `text-handlers.ts`
 * 文件头（unified 的 `stringify()` **不跑转换器**）。
 */

import type { textHandler } from "./text-handlers";

/**
 * 行首被转义掉的那两种语法。`m[2]` 是整个 `[...]`。
 *
 * ⚠️ 名字表**一个都不能多**：多放一个进去，那种写法的反斜杠就再也回不来了
 *（而"该转义的被放过"正是这一族最容易做错的地方，见 `docs/07` 第 56 项）。
 */
const isConvertMeaningOfAlreadyKnownLanguageMethod =
  /(^|\n)\\(\[(?:TOC|toc)\]|\[!(?:NOTE|TIP|IMPORTANT|WARNING|CAUTION)\])/g;

/**
 * 包一层：把行首那个多余的 `\` 去掉（只去掉上面那张名字表认得的）。
 *
 * ⚠️ `原文` 缺失时按本仓惯例**原值交出**（不自己拼），否则连上游的转义
 * 一起省了——那会写出坏字节（`text-handlers.ts` 文件头最后一段记着）。
 */
export function notConvertMeaningAlreadyKnownLanguageMethod(source?: textHandler): textHandler {
  return (node, parent, state, info) => {
    if (!source) return node.value ?? "";
    return source(node, parent, state, info).replace(isConvertMeaningOfAlreadyKnownLanguageMethod, "$1$2");
  };
}
