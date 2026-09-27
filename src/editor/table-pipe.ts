/**
 * GFM 表格那条防线加给**普通段落**的转义：把行首竖线前面那个反斜杠去掉。
 *
 * # 症状（用户 2026-09-27 原话）
 *
 * > 切换到所见即所得模式再切换回来会自动添加「\」，表格出不来
 *
 * 一份文档里有一行 `| 1 | 2 | 3 |`——**普通段落**，不是表格（表头行后面没有
 * 分隔行），在所见即所得和源码模式之间来回切一次，它就成了 `\| 1 | 2 | 3 |`：
 * 用户一个字节都没打过的反斜杠落进了文档。再切几次不会继续加（稳定在这一颗），
 * 但表格从此出不来——那一行成了正文。
 *
 * # 那颗反斜杠是谁写的
 *
 * 不是本仓，是 **GFM 表格那套序列化规则的防御**：`mdast-util-gfm-table` 的
 * `gfmTableToMarkdown().unsafe` 表里有一条（`lib/index.js:160-176`）：
 *
 * ```js
 * // A pipe, when followed by a tab or space (padding), or a dash or colon
 * // (unpadded delimiter row), could result in a table.
 * {atBreak: true, character: '|', after: '[\t :-]'},
 * ```
 *
 * 「行首一颗竖线、后面跟空白或 `-`/`:`，**可能**拼成一张表格」，所以先转义掉。
 *
 * ⚠️ **它保守得有道理**：markdown 的表格是**两行**拼出来的（表头行 ＋ 分隔行），
 * 而序列化器**一行一行**地写，写到这一行时看不见下一行是什么。所以只要"行首
 * 一颗竖线后面跟空白"就一律转义——代价正是用户报的这一条。
 *
 * # 为什么这边可以放心去掉
 *
 * 那条转义**只在一种情况下有用**：这一段的**下一行**真的是分隔行。而那种情况
 * 只有"这一段自己跨了两行以上"才可能发生（GFM 解析器认的表格，表头行与分隔行
 * 必须**相邻**，中间不能空行）。
 *
 * ⚠️ 所以判据收得很紧——**只有"这一段能不能占两行以上"答得出"不能"时才去掉**：
 *
 * - 文本节点的值里**没有换行**（`\n`），**并且**
 * - 兄弟里**没有 `break`**（硬换行是 `break` 节点、不是 `html`——与
 *   `atom-space.ts` 那张表同一个坑：写错不报错，只是一直不生效）。
 *
 * 两条都过 = 这一段物理上只能占一行 = 下一行**不可能是它的分隔行**，那颗反斜杠
 * 纯属多余。只要有一点说不准，**一个字都不动**（宁可留着多余的转义，也不能让
 * 一张真表格在重新打开时散架）。
 *
 * ⚠️ **表格格子里的竖线不归它管**：格子的内容由 `markdown-table` 那条路拼
 *（`handleTableRowAsData` / `serializeData`），那里面的 `|` 必须转义，否则格子
 * 会被劈成两格。所以 `state.stack` 里有 `tableCell` 时直接原样返回——上游自己的
 * `inlineCodeWithTable` 用的就是这一句判据。
 *
 * ⚠️ 已知的、可接受的一处残留（与 `lax-heading.ts` 那条同形）：用户**显式**写的
 * `\| 1 | 2 |`（想让它永远是正文）在文档树里与裸竖线是同一个东西（都是文本
 * `| 1 | 2 |`），去掉反斜杠之后重新打开还是普通段落（后面没有分隔行）——两边的
 * 解析结果一样，差别只在字节上。
 *
 * ⚠️ 用户那句话的**后半截（「表格出不来」）不在这一层**：那颗反斜杠会被分词器
 * 当转义吃掉，`\| 1 | 2 |` 该在哪格还在哪格，**表照样成形**（`tests/table-pipe.test.ts`
 * 第四组最后一条钉着实测）。所以这一层修的是"**文件里多出一颗用户没打过的字符**"
 * （破了用户定的死规矩「存盘不要自动修复」），不是"表散架"。
 * 另一半的嫌疑有两条，都**没**在这一层里解决：
 *   1. 所见即所得里**手打一行分隔行**想让上面那行变成表——`@milkdown/preset-gfm`
 *      里压根没有这条输入规则（`inputRules` 只有 `|3x2|` 与任务列表两条），
 *      要用菜单或粘贴。⚠️ 用户心里那套动作是哪一种（Typora 那套？）要问他；
 *   2. 拿真文件复现。
 *
 * # 挂在哪
 *
 * `create.ts` 的 `.config()` 里，与另外三条文本处理器套在一起（`handlers.text`）。
 * ⚠️ **不能**挂 `$remark` 插件：`stringify()` 只调编译器、不跑转换器，
 * `atom-space.ts` 第二版就是这么静默失效的。
 */

import { remarkStringifyOptionsCtx } from "@milkdown/kit/core";

/** remark 序列化选项的类型：**从 ctx 反推出来**（同 `lax-heading.ts`）。 */
type 串化选项 = ReturnType<typeof remarkStringifyOptionsCtx._typeInfo>;
/** mdast 的文本处理器（`handlers.text` 那一条）。 */
type 文本处理器 = NonNullable<NonNullable<串化选项["handlers"]>["text"]>;

/** mdast 节点里我们真正会读的那几个字段（不引 `@types/mdast`，够用就好）。 */
type Mdast节点 = {
  type: string;
  value?: string;
  children?: Mdast节点[];
};

/**
 * 行首（或整串开头）被转义掉的那颗竖线。`m[2]` 是竖线本身。
 *
 * ⚠️ `(?=[\t :-])` 是照抄上游那条 unsafe 的 `after` —— 只有"竖线后面跟空白或
 * `-`/`:`"才会被上游转义，也只把那一类还回去。别的形状（`\|甲`）本仓不碰：
 * 上游没转义它，说明它压根不会拼成表格。
 */
const 被转义的行首竖线 = /(^|\n)\\(\|)(?=[\t :-])/g;

/** 硬换行的节点名。⚠️ 是 `break`，不是 `html`（写错不报错、只是一直不生效）。 */
const 硬换行 = "break";

/**
 * 这一段**能不能占两行以上**（能就一个字都不动）。
 *
 * 判据两条，见文件头：值里带 `\n`，或者兄弟里有 `break`。
 * ⚠️ `parent` 可能是 `undefined`（`mdast-util-to-markdown` 处理根节点时会传
 * `undefined`，见它 `lib/index.js:66`），所以不能直接取 `.children`。
 */
export function 段落会跨行(node: Mdast节点, parent: Mdast节点 | undefined): boolean {
  if ((node.value ?? "").includes("\n")) return true;
  const 兄弟 = parent?.children;
  return Array.isArray(兄弟) && 兄弟.some((c) => c?.type === 硬换行);
}

/**
 * 包一层：把这个文本节点输出里行首的 `\|` 放回 `|`。
 *
 * `原文` 是 Milkdown 自己那条文本处理器（`remarkStringifyOptionsCtx` 的默认值里
 * 就有）；**没有它就原样返回**，不自己造一条——序列化是核心路径，宁可什么都不做。
 */
export function 不转义行首竖线(原文?: 文本处理器): 文本处理器 {
  return (node, parent, state, info) => {
    if (!原文) return node.value ?? "";
    const 输出 = 原文(node, parent, state, info);
    // 表格格子里那颗竖线必须留着（见文件头）。
    if (state.stack.includes("tableCell")) return 输出;
    if (段落会跨行(node as Mdast节点, parent as Mdast节点 | undefined)) return 输出;
    return 输出.replace(被转义的行首竖线, "$1$2");
  };
}
