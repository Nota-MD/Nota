/**
 * GFM 表格那条防线加给**普通段落**的转义：把行首竖线前面那个反斜杠去掉。
 *
 * # 症状
 *
 * 用户 2026-09-27 原话：「切换到所见即所得模式再切换回来会自动添加「\」，表格出不来」。
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
 * # ⚠️ 2026-10-04：判据从「这一段会不会跨行」换成「**第一行 ＋ 下一行长什么样**」
 *
 * 第一版（2026-09-27）的判据是**"这一段物理上只能占一行"才去掉**（文本节点的
 * 值里没有 `\n`，**且**兄弟里没有 `break`）。用户 2026-10-04 又报「**还是会
 * 自动插入斜杠**」，截图是这两行：
 *
 * ```
 * | 1 | 2 | 3 |
 * $ 你好 $
 * ```
 *
 * ——两行在**同一段**里（`Shift+Enter` 的硬换行，或者从别的编辑器拷进来的软换行），
 * 于是那两条判据**都**成立不了，第一版一个字都不动：**病还在**。
 *
 * 第一版怕的是"下一行真有可能是分隔行"。⚠️ 这个怕**可以问下一行本人**：序列化器
 * 看不见下一行，我们看得见（这一段自己的兄弟节点就在手里）。所以判据换成——
 * **只有"这一段的第一行 ＋ 下一行像分隔行"时才把转义留下，其余一律放回去**。
 *
 * 上一版那份害怕**并没有被丢掉，只是收窄到它真正指的那一行**：
 *
 * | 这一段长这样 | 下一行 | 做法 |
 * |---|---|---|
 * | `\| 1 \| 2 \|` ＋ `break` ＋ `$ 你好 $` | `$ 你好 $` | **放**（不像分隔行） |
 * | `\| 1 \| 2 \|` ＋ `break` ＋ 一颗公式 | 公式的 `$` 不在 `[\s\|:-]` 里 | **放** |
 * | `\| 1 \| 2 \|` 是这一段的最后一行 | 空行／不在这一段里 | **放** |
 * | `\| 1 \| 2 \|`（值里带 `\n`）＋ `--- \| ---` | 像分隔行 | **留** |
 * | 那一行里夹着认不出的行内节点 | 说不准 | **留** |
 *
 * ⚠️ **别拿"这一行在第几位"当免死牌**（2026-10-04 探针验过、本来打算这么写）：
 * 我原以为"GFM 的表格必定从段落的第一行起，所以后半截的行放掉转义也拼不出表"。
 * **实测推翻了**——表格**可以**从一段的后半截起（`remark-gfm`）：
 *
 * ```
 * 甲
 * | 1 | 2 |
 * | - | - |
 * ```
 *
 * 解析出来是「段落（甲）＋ **表格**」（`tests/table-pipe.test.ts` 第四组那条
 * "长得像表格但不是表格"钉着这个形状）。所以判据只看**下一行长什么样**，
 * 不看这一行排在第几位。
 *
 * ⚠️ 而"下一行长什么样"要比**它写在文件里的样子，一个字都不预先改写**（比如
 * 那颗 `\`）——这一条是**试出来的，别再改回去**：见过一份两颗都被转义的伤文件
 *
 * ```
 * \| 1 | 2 |
 * \| --- | --- |
 * ```
 *
 * 它本来是一张表，被老毛病把**两颗**都写上了。⚠️ 要是判"像不像"之前先把下一行
 * 那颗 `\` 抹掉，第一行会判成"像分隔行"⇒**我留着**，而第二行自己的下一行是空的
 * ⇒**我放掉**，结果是一张首格被拼成 `| 1` 的**残表**（实测：`\| 1 | 2 |` ＋ 一行
 * 合法分隔行**确实是**一张表，头一格吃进那颗竖线）。不预先改写就对了：两颗一起放，
 * 重新打开得到一张**完整**的表——那正是用户本来想要的东西。
 *
 * ⚠️ **"像分隔行"是放宽过的判据**（`像分隔行` 那条正则：只有 `|`、`-`、`:`、空白，
 * 且至少一颗 `-`）。真正的分隔行还要求每个格子是 `:?-+:?`、格子数还得与表头行
 * 相等（`micromark-extension-gfm-table/dev/lib/syntax.js` 那个 `size !== sizeB`），
 * 这里**不查**——漏放走一张真表格的代价是"用户的表在重新打开时散成两行字"，
 * 多留一颗转义只是难看。**两边不对称，往难看那边倒。**
 *
 * # 边界（如实记着）
 *
 * 1. ⚠️ **表格格子里的竖线不归它管**：格子的内容由 `markdown-table` 那条路拼
 *    （`handleTableRowAsData` / `serializeData`），那里面的 `|` 必须转义，否则格子
 *    会被劈成两格。所以 `state.stack` 里有 `tableCell` 时直接原样返回——上游自己的
 *    `inlineCodeWithTable` 用的就是这一句判据。
 * 2. ⚠️ **一段的相邻两行真的拼得成表时，本层会把转义放掉**（＝重新打开时它成了
 *    一张表）。这种段落在源码里**只能是"转义已经存在"的状态**（不然解析那一步
 *    就是表格了，走不到这一段文字），也就是说：**它来自一份已经被老毛病弄脏的
 *    文件**——放掉转义正是把它修回"这张表本来该有的样子"（用户 2026-09-27 那句
 *    「表格出不来」要的就是这个）。代价说清楚：**这种文件打开再存，看到的是表，
 *    不是两行字。** ⚠️ 用户**显式**写的 `\| 1 | 2 |`（想让它永远是正文）在文档树里
 *    与裸竖线是同一个东西（都是文本 `| 1 | 2 |`），本层分不出来，也照放——与
 *    `lax-heading.ts` 那条同形。
 * 3. ⚠️ 用户那句话的**后半截（「表格出不来」）真正的病根是 BUG-51**（敲收尾竖线
 *    那条输入规则静默退场，NBSP ＋ 整段覆盖判据）——**已结清并开窗复验过**。
 *    那颗反斜杠会被分词器当转义吃掉，`\| 1 | 2 |` 该在哪格还在哪格，**表照样
 *    成形**（`tests/table-pipe.test.ts` 第四组最后一条钉着实测）。所以本层修的是
 *    「**文件里多出一颗用户没打过的字符**」（破了用户定的死规矩「存盘不要自动修复」），
 *    不是"表散架"。
 *
 * # 挂在哪
 *
 * `create.ts` 的 `.config()` 里，与另外几条文本处理器套在一起（`handlers.text`）。
 * ⚠️ **不能**挂 `$remark` 插件：`stringify()` 只调编译器、不跑转换器，
 * `atom-space.ts` 第二版就是这么静默失效的。
 */

import { remarkStringifyOptionsCtx } from "@milkdown/kit/core";

/** remark 序列化选项的类型：**从 ctx 反推出来**（同 `lax-heading.ts`）。 */
type StringConvertOption = ReturnType<typeof remarkStringifyOptionsCtx._typeInfo>;
/** mdast 的文本处理器（`handlers.text` 那一条）。 */
type textHandler = NonNullable<NonNullable<StringConvertOption["handlers"]>["text"]>;

/** mdast 节点里我们真正会读的那几个字段（不引 `@types/mdast`，够用就好）。 */
type MdastNode = {
  type: string;
  value?: string;
  children?: MdastNode[];
};

/**
 * 行首（或整串开头）被转义掉的那颗竖线。`m[2]` 是竖线本身。
 *
 * ⚠️ `(?=[\t :-])` 是照抄上游那条 unsafe 的 `after` —— 只有"竖线后面跟空白或
 * `-`/`:`"才会被上游转义，也只把那一类还回去。别的形状（`\|甲`）本仓不碰：
 * 上游没转义它，说明它压根不会拼成表格。
 */
const isConvertMeaningOfLineFirstVerticalLine = /(^|\n)\\(\|)(?=[\t :-])/g;

/** 硬换行的节点名。⚠️ 是 `break`，不是 `html`（写错不报错、只是一直不生效）。 */
const hardReplaceLine = "break";

/**
 * 「这一行像不像一张表格的分隔行」：整行只有 `|`、`-`、`:`、空白，且至少一颗 `-`。
 *
 * ⚠️ **放宽过**：真分隔行还要求每个格子是 `:?-+:?`、格子数与表头行相等——这里不查。
 * 判错了（把不像的判成像）只是多留一颗转义；反过来会把真表格放走。
 */
const likeSeparatorLine = /^[\s|:-]*-[\s|:-]*$/;

/** `紧接的那一行` 的结论。⚠️ 三档，别把"一定不是"和"说不准"合成一档。 */
export type BelowValueLineDetermineFixed =
  | { shape: "已知"; line3: string }
  | { shape: "一定不是分隔行" }
  | { shape: "说不准" };

/**
 * 这颗节点**自己会不会吃掉换行**（它写出来会不会占两行以上）。
 *
 * ⚠️ 只有包着行内内容的那些（`emphasis` / `strong` / `delete` / `link`）才可能，
 * 而且得里面真有一颗 `break` 或带 `\n` 的文本才算数（`**甲  \n乙**`）。
 */
function meetingNotMeetingCrossLine(section: MdastNode): boolean {
  if (section.type === hardReplaceLine) return true;
  if ((section.value ?? "").includes("\n")) return true;
  return (section.children ?? []).some(meetingNotMeetingCrossLine);
}

/**
 * 我这颗节点**之后紧跟着的那一行**是什么（只在这一段里找）。
 *
 * ⚠️ 判据只看**这一颗所在的那一行结束之后**的内容：同一行里跟在我后面的兄弟
 * 与我无关（我们判的是"下一行"），所以那一截要跳过（`本行未完` 那一支）。
 */
export function tightConnectOfThatValueLine(node: MdastNode, parent: MdastNode | undefined): BelowValueLineDetermineFixed {
  const brotherBrother = parent?.children;
  if (!Array.isArray(brotherBrother)) return { shape: "说不准" };
  let toDone = false;
  let localLineNotComplete = true;
  let output2 = "";
  for (const child2 of brotherBrother) {
    if (child2 === node) {
      toDone = true;
      continue;
    }
    if (!toDone) continue;
    if (child2.type === hardReplaceLine) {
      if (localLineNotComplete) {
        localLineNotComplete = false;
        output2 = "";
        continue;
      }
      return { shape: "已知", line3: output2 }; // 下一行也到头了
    }
    if (child2.type !== "text") {
      // 还在我们这一行上：它归这一行，与"下一行"无关。⚠️ 除非它自己就把这一行
      // 结束了，那下一行的开头在它肚子里——那是说不准。
      if (localLineNotComplete) {
        if (meetingNotMeetingCrossLine(child2)) return { shape: "说不准" };
        continue;
      }
      // ⚠️ 落在下一行上 ⇒ **一定不像分隔行**：分隔行整行只有 `|`、`-`、`:`、空白，
      // 而每一种行内节点的写法里都至少有一个别的字符（公式的 `$`、粗体的 `*`、
      // 删除线的 `~`、行内代码的 `` ` ``、图片的 `!`、链接的 `[]()`、行内 HTML 的
      // `<>`…）。⚠️ 这条靠的是"没有哪种行内节点只写得出 `[\s|:-]`"——本仓自己加的
      // 行内节点只有公式（`inlineMath` → `$`），也在这个集合外面。
      return { shape: "一定不是分隔行" };
    }
    const value2 = child2.value ?? "";
    if (localLineNotComplete) {
      const breakValue = value2.indexOf("\n");
      if (breakValue < 0) continue; // 还在同一行：与我们无关
      localLineNotComplete = false;
      const remaining = value2.slice(breakValue + 1);
      const againBreak = remaining.indexOf("\n");
      if (againBreak >= 0) return { shape: "已知", line3: remaining.slice(0, againBreak) };
      output2 = remaining;
    } else {
      const breakValue = value2.indexOf("\n");
      if (breakValue >= 0) return { shape: "已知", line3: output2 + value2.slice(0, breakValue) };
      output2 += value2;
    }
  }
  // ⚠️ 压根没找到这颗节点（这一段里没有我）是说不准，一个字都不许动。
  if (!toDone) return { shape: "说不准" };
  // ⚠️ 兄弟走完还停在同一行 ⇒ 我这颗是这一段最后的东西，下一行是空行（或者已经
  // 在别的块里了）——空行**不可能**是分隔行（分隔行至少要一颗 `-`）。
  return { shape: "已知", line3: localLineNotComplete ? "" : output2 };
}

/**
 * 下一行**像不像**一张表格的分隔行。`null` = 说不准（调用方按"像"处理，留着）。
 *
 * ⚠️ 单独导出来是给测试用的：`tests/table-pipe.test.ts` 第一条判据组量的就是它。
 */
export function belowValueLineLikeSeparatorLine(node: MdastNode, parent: MdastNode | undefined): boolean | null {
  const determine = tightConnectOfThatValueLine(node, parent);
  if (determine.shape === "说不准") return null;
  if (determine.shape === "一定不是分隔行") return false;
  return likeSeparatorLine.test(determine.line3);
}

/**
 * 包一层：把这个文本节点输出里行首的 `\|` 放回 `|`。
 *
 * `原文` 是 Milkdown 自己那条文本处理器（`remarkStringifyOptionsCtx` 的默认值里
 * 就有）；**没有它就原样返回**，不自己造一条——序列化是核心路径，宁可什么都不做。
 */
export function notConvertMeaningLineFirstVerticalLine(source?: textHandler): textHandler {
  return (node, parent, state, info) => {
    if (!source) return node.value ?? "";
    const output = source(node, parent, state, info);
    // 表格格子里那颗竖线必须留着（见文件头边界 1）。
    if (state.stack.includes("tableCell")) return output;
    if (!output.includes("\\|")) return output;
    const localLine = output.split("\n");
    // ⚠️ 转义只在同一行里加字符、不加换行；行数对不上说明我对这一段形状的判断是
    // 错的（比如上游那条处理器换了个写法），那时一个字都不动。
    if (localLine.length !== ((node as MdastNode).value ?? "").split("\n").length) return output;
    const parentNode = parent as MdastNode | undefined;
    return output.replace(isConvertMeaningOfLineFirstVerticalLine, (wholeString, before2: string, verticalLine: string, offset: number) => {
      // ⚠️ 行号要从**那颗竖线自己**的位置数：正则的 `(^|\n)` 把换行也吃进了匹配，
      // 直接用 `偏移` 数出来的行号会**少一行**（量到的是上一行）——踩过一次。
      const lineNumber = output.slice(0, offset + before2.length + 1).split("\n").length - 1;
      // 下一行在**这颗节点自己**肚子里（值里带的 `\n`）就直接读；
      // 到了最后一颗才去问兄弟（`紧接的那一行`）。⚠️ 两条路都得"确凿地不像"才放。
      const localNodeInsideOfBelowValueLine = localLine[lineNumber + 1];
      const like = localNodeInsideOfBelowValueLine === undefined
        ? belowValueLineLikeSeparatorLine(node as MdastNode, parentNode)
        : likeSeparatorLine.test(localNodeInsideOfBelowValueLine);
      return like === false ? before2 + verticalLine : wholeString;
    });
  };
}
