/**
 * 四种**非 CommonMark** 的行内标记：高亮、上标、下标、下划线。
 *
 * 用户 2026-09-27 的原话是「所有的未开始全部写完」，这四样在
 * `docs/10-feature-matrix.md` §3 里各占一格，而设置页（`MarkdownPane.tsx`
 * 的「Markdown 扩展语法」组）**早在它们之前就把开关和写法都写好了**：
 *
 * | 设置里的标签 | 帮助文字 | 语法 |
 * |---|---|---|
 * | 下标 | `` `H~2~O`。 `` | `~x~` |
 * | 上标 | `` `X^2^`。 `` | `^x^` |
 * | 高亮 | `` `==重点==`。 `` | `==x==` |
 * | （无开关） | —— | `<u>x</u>` |
 *
 * 也就是说：**文案与字段早就存在，缺的只是"谁读它"**。这个文件就是那个消费者。
 * 下划线没有开关（用户没点它），所以它恒开——与 Typora 一致，那边也是
 * `<u></u>` 一直认。
 *
 * # 一个标记要穿过三层
 *
 * ```
 * markdown 源文 ──(remark-parse ＋ 本文件的 $remark)──▶ mdast
 *               ──(mark schema 的 parseMarkdown runner)──▶ PM 文档树
 * PM 文档树     ──(mark schema 的 toMarkdown runner)──▶ mdast
 *               ──(remark-stringify ＋ 本文件的 handlers)──▶ markdown 源文
 * ```
 *
 * 四层缺一层，症状都是**静默**的：
 *
 * - 缺 `$remark` → 打开文件时 `==重点==` 原样显示成六个字（不报错）；
 * - 缺 `parseMarkdown.match` → 认不出；
 * - 缺 `toMarkdown.runner` → 存盘时**标记整个消失**（文字还在，六个字符没了
 *   —— 那是最难发现的一种：文档看起来只是"高亮没了"，而实际上源文已经被改了）；
 * - 缺 stringify handler → `mdast-util-to-markdown` 对未知节点类型**直接抛错**，
 *   所以这一条反而最容易发现。
 *
 * ⚠️ 这条链子**必须两头同时接上**，不能只接一头：只解析不序列化 = 打开就毁字节；
 * 只序列化不解析 = 存下去就再也读不回来。`tests/inline-marks.test.ts` 拿真
 * `unified()` ＋ 真 `ParserState`/`SerializerState` 跑的就是这个往返。
 *
 * # ⚠️ 为什么自己造 mdast 节点类型，而不是借用现成的
 *
 * 唯一现成的近亲是 GFM 的 `delete`（`~~x~~`），而它**已经名花有主**——
 * `preset-gfm` 的 `strike_through` 占着它。上标/下标/高亮/下划线在 mdast 里
 * **没有**标准节点（CommonMark 与 GFM 都不含），所以只能自造四个类型名，
 * 前缀 `nota` 避免将来与上游撞名。它们只在**这一次解析与这一次序列化之间**
 * 存在，不进文件、不进剪贴板。
 *
 * # ⚠️ 四条边界，都是刻意的
 *
 * 1. **不套嵌别的行内节点**：`==**重点**==` 里的 `**重点**` 是另一颗 mdast
 *    节点，拆文本的扫描器只在一个**文本节点内部**找成对的符号，跨不过去。
 *    于是 `==**重点**==` 会原样显示成字面。想支持套嵌得写一台真的行内
 *    解析器（那是另一个量级的东西）。**这一条在报告里如实记着，不假装支持。**
 * 2. **符号两边不能贴空白**：`== 重点 ==` 不转换（Pandoc 与 Typora 都是
 *    这条规矩）。理由不是学它们，是这条规矩让"`2 == 3` 这样的普通文字"
 *    不会突然变成半截高亮。
 * 3. **内容里不能再出现同一个符号**：`==a=b==` **不**转换（正则把 `=` 排除在
 *    内容外）。放宽了的话 `a == b == c` 会被从中间切走一段。
 * 4. **`~x~` 与删除线 `~~x~~` 的分界靠"邻居不是波浪号"**，且本文件的输入规则
 *    **必须排在 `gfm` 前面**——理由写在 `行内标记输入规则` 那一格。
 *    ⚠️ **光靠顺序只够管"打字"那条路**（BUG-48，2026-09-27 补）：`gfm` 的
 *    `singleTilde` 默认把单个波浪号也当删除线，而"打开/存盘"走的是 micromark
 *    分词，抢不过顺序 ⇒ 打的时候是下标、存下去变成 `~~下~~`。那一半由本文件
 *    末尾的 `GFM选项`（交给解析）＋ `不转义孤立波浪号`（管序列化）治。
 *
 * # 输出给谁
 *
 * - `行内标记规格` 四条 `$markSchema` → `create.ts` 的 `.use()`；
 * - `行内标记输入规则` 四条 `$inputRule` → 同上，**排在 `gfm` 前面**；
 * - `行内标记解析(开关)` 一条 `$remark` → 排在 `gfm` **后面**；
 * - `行内标记处理器()` 返回四条序列化 handler → 写进 `create.ts` 的
 *   `remarkStringifyOptionsCtx.handlers`（与 `行内公式处理器()` 同一处）；
 * - `GFM选项` 与 `不转义孤立波浪号` → **不给 `preset/gfm` 用，是把 `gfm` 拉回本仓
 *   语义的两件东西**（关掉单波浪号删除线；正文里的孤立 `\~` 不加反斜杠）。
 *   两处都在 `create.ts` 的 `.config()` 里，见那一节；
 * - `行内标记命令` 四条 toggle 命令 → `command-table.ts` 的 `COMMANDS` 表按
 *   `命令名表` 派发（那张表 2026-09-28 从 `create.ts` 搬了出去）。
 */

import { remarkStringifyOptionsCtx } from "@milkdown/kit/core";
import type { Ctx } from "@milkdown/kit/ctx";
import { remarkGFMPlugin } from "@milkdown/kit/preset/gfm";
import type { MilkdownPlugin } from "@milkdown/kit/ctx";
import { $command, $inputRule, $markSchema, $remark } from "@milkdown/kit/utils";
import { markRule } from "@milkdown/kit/prose";
import { toggleMark } from "@milkdown/kit/prose/commands";
import type { MarkdownNode, ParserState, SerializerState } from "@milkdown/kit/transformer";
import type { MarkType } from "@milkdown/kit/prose/model";

/* ── 一张表：四种标记的全部差异都在这里 ─────────────────────────────── */

/** 本仓自造的四个 mdast 节点类型名。 */
export type 标记节点名 =
  | "notaHighlight"
  | "notaSuperscript"
  | "notaSubscript"
  | "notaUnderline";

/**
 * 一种行内标记的规格。
 *
 * ⚠️ 三个名字字段**各是各的**，别合并：
 * - `mdast` 是本仓自造的 mdast 节点类型名（只在这一次解析/序列化之间活着）；
 * - `标签` 是 PM schema 里 mark 的 id（`command-state.ts` 的 `有("highlight")`、
 *   `FormatBar` 的 `on` 字段都用它）；
 * - `html标签` 是编辑区里渲染出来的那个真正的 HTML 元素（CSS 按它写）。
 *
 * 后两个常常同名（上标叫 `superscript` 也渲染成 `<sup>`），那是巧合、不是同一个
 * 概念——高亮就是反例：mark 名 `highlight`、HTML 标签 `<mark>`。曾经把它们
 * 合成一个字段，代价是编辑区里出现 `<highlight>` 这种浏览器不认识的元素，
 * 2026-09-27 拆开（详见 [`标记规格.html标签`] 上那段）。
 */
interface 标记规格 {
  /** PM schema 里的 mark 名，也是 `CommandState` / `FormatBar` 的键。 */
  标签: string;
  /**
   * 编辑区里真正渲染出来的 HTML 标签名（`parseDOM` / `toDOM` 认的那个）。
   *
   * ⚠️ **它和上面的 `标签` 不是一回事**，只是四条里恰好有三条"最自然的那个
   * 词"是同一个词而已。高亮那一枚就明确不同：mark 名取 `highlight`（因为它
   * 同时是设置项 `highlight`、命令 `ToggleHighlight` 的词根），而 HTML 标签
   * 必须是 `<mark>`——**写 CSS 用的是这一个**。
   *
   * 曾经这里直接拿 `标签` 当 HTML 标签用，于是编辑区里渲染出 `<highlight>` /
   * `<superscript>` 这种浏览器不认识的元素：画得出、但 CSS 里得跟着写
   * `highlight { … }` 这种没人读得懂的规则，而且 `<sup>` / `<sub>` 自带的那套
   * 上下标排版也全丢了（自己写一遍必然和浏览器的对不齐）。2026-09-27 拆开。
   */
  html标签: string;
  /** 本仓自造的 mdast 节点类型。 */
  mdast: 标记节点名;
  /** 源码里的左符号。 */
  左: string;
  /** 源码里的右符号。 */
  右: string;
  /**
   * 在**一个文本节点的内部**找一对符号。**sticky（`y` 标志）**，理由见
   * `切文本` 顶上那段——`y` 让 `lastIndex` 说了算，于是下标那条用到的
   * `(?<!~)` **能看到前一个真实字符**。
   */
  正则: RegExp;
  /** 对应 `settings/markdown.rs` 里哪一个开关；`null` = 恒开（下划线）。 */
  设置键: keyof 行内扩展开关 | null;
}

/**
 * ⚠️ **顺序要紧**：扫描器在同一个位置上**按这张表的顺序**试，先中的赢。
 * 四条的正则互不相交（符号各不相同），所以现在换顺序也不会有差别——
 * 但将来若加一条前缀重叠的（比如有人想要 `~~~x~~~`），就得想清楚谁先。
 */
export const 标记表: readonly 标记规格[] = [
  {
    标签: "highlight",
    html标签: "mark",
    mdast: "notaHighlight",
    左: "==",
    右: "==",
    // 内容里不许出现 `=`，也不许跨行（一个文本节点本来也不跨行）。
    正则: /==(?=\S)([^=\n]*?\S)==/y,
    设置键: "highlight",
  },
  {
    标签: "superscript",
    html标签: "sup",
    mdast: "notaSuperscript",
    左: "^",
    右: "^",
    正则: /\^(?=\S)([^\^\n]*?\S)\^/y,
    设置键: "superscript",
  },
  {
    标签: "subscript",
    html标签: "sub",
    mdast: "notaSubscript",
    左: "~",
    右: "~",
    // ⚠️ 前后各一个"邻居不是 `~`"的断言：没有它，删除线的 `~~x~~` 会被本仓
    // 这条从中间咬掉一层（退化成"一个下标里包着一个波浪号"）。删除线是
    // `preset-gfm` 的 `delete` 节点，**在解析阶段就已经从文本里拿走了**，
    // 正常情况下根本轮不到这里；这个断言防的是"没被 gfm 认出来的那种写法"
    //（比如前后贴着中文的 `张~~三~~`——`\w` 不含中文，gfm 那条漏得掉）。
    正则: /(?<!~)~(?=\S)([^~\n]*?\S)~(?!~)/y,
    设置键: "subscript",
  },
  {
    标签: "underline",
    html标签: "u",
    mdast: "notaUnderline",
    左: "<u>",
    右: "</u>",
    // 下划线走 HTML 标签（Typora 也是这个写法）。⚠️ **它这一条根本不经过
    // `切文本`**：remark-parse 把 `<u>` 认成**裸 HTML 节点**，所以
    // `x</u>` 的左右两半在 mdast 里是两颗 `html` 节点、中间夹着文本。
    // 这里那条正则只给**输入规则**用（用户现敲 `<u>x</u>`）。解析那一侧
    // 走的是 `并下划线`，见下面。
    正则: /<u>(?=\S)([^<\n]*?\S)<\/u>/y,
    设置键: null,
  },
];

/** PM mark 名 → 规格。`command-state.ts` / `FormatBar` 那一侧要按键查。 */
export function 按标签查(标签: string): 标记规格 | undefined {
  return 标记表.find((一) => 一.标签 === 标签);
}

/**
 * 三个开关（来自 `settings/markdown.rs` 的「Markdown 扩展语法」组）。
 *
 * ⚠️ **解析跟着开关走**（设置页那句「按普通文字显示」就得是字面意思），
 * 而**序列化恒开**。为什么这么切：
 *
 * - 解析关掉 → 老文件里的 `==x==` 是普通文字，存回去还是 `==x==`，字节不动；
 * - 解析开着 → 是 highlight 标记，序列化器也在，存回去还是 `==x==`，字节不动；
 * - **解析开着而序列化器不在** → 才是灾难：六个字符连同标记一起消失
 *   （用户开着高亮打开一份文件，中途关掉开关，再存盘 —— 解析那一趟早就跑完了）。
 *
 * 所以"序列化恒开"是兜底，"解析跟着开关走"是让设置说实话，两条都要。
 *
 * ⚠️ 但"关掉解析"会引出**第二个**病灶：`==重点==` 退回成普通文字之后，
 * `mdast-util-to-markdown` 会把行首的 `=` 转义成 `\=`（它的 unsafe 表里那条
 * `{atBreak: true, character: '='}`，注释写的是"等号能起 setext 标题下划线"），
 * 于是关掉高亮之后存盘会多出两个反斜杠——**又是一次"自动修复"**。
 * 这一半由本文件的 `不转义行首等号` 兜住，理由见那个函数。
 */
export interface 行内扩展开关 {
  highlight: boolean;
  superscript: boolean;
  subscript: boolean;
}

/**
 * 三项**默认全开**——与后端 `settings/markdown.rs` 里那三个字段的默认值
 * 一致（那边也是 `true`）。它只在"建实例时没拿到设置"时兜底
 *（`ui/EditorPane.tsx` 里 `settings` 还没读出来的第一帧）。
 *
 * ⚠️ 下划线**不在这张表里**：它没有开关，恒开。理由见文件头那段
 *（与 Typora 一致，`<u>x</u>` 本来就是裸 HTML，关掉它等于关掉 HTML 标签）。
 */
export const 默认行内扩展开关: 行内扩展开关 = {
  highlight: true,
  superscript: true,
  subscript: true,
};

/** 四条序列化 handler 的类型。**从 ctx 反推**（与 `math-delim.ts` 同一套写法）。 */
type 串化选项 = ReturnType<typeof remarkStringifyOptionsCtx._typeInfo>;
/**
 * 一条序列化处理器。
 *
 * ⚠️ 取的是 `["text"]` 那一条，**不是 `[string]`**：`Handlers` 的类型是
 * `Record<Nodes["type"], Handle>`（`mdast-util-to-markdown/lib/types.d.ts:468`），
 * 键是那串字面量联合，**没有**字符串索引签名——写 `[string]` 过不了
 * `tsc --noEmit`（"has no matching index signature"）。四条自造 mdast 节点
 * 的名字当然不在那个联合里，但它们与 `text` 是**同一个** `Handle` 形状
 * （`Handlers` 里每个值都是 `Handle`），拿 `text` 那一条当代表是准的。
 */
type 处理器 = NonNullable<NonNullable<串化选项["handlers"]>["text"]>;
/** `$remark` 工厂的类型（从它自己的参数反推，不引额外类型）。 */
type 转换器工厂 = Parameters<typeof $remark<"行内标记", undefined>>[1];

/* ── 第一格：文本 → mdast 片段（把一个文本节点切成几段）─────────────── */

/** 切出来的一段：要么是纯文字，要么是"某种标记包着几段"。 */
export interface 片段 {
  类型?: 标记节点名;
  文?: string;
  孩子们?: 片段[];
}

/**
 * 把一个**文本节点**按四种语法切成若干片段。`要` 是这一刻**启用着**的节点名。
 *
 * ⚠️ **用 sticky 正则 ＋ `lastIndex`，不用 `String.slice` 之后再匹配**：
 * 下标那条依赖 `(?<!~)`，而断言看的是**原串里真实的前一个字符**。
 * 先 `slice(i)` 再匹配的话，那个位置前面什么都没有，断言恒成立——
 * `~~x~~` 就会被咬掉一层，而症状是"删除线里多出一个下标"，很难联想到滑动窗口。
 *
 * ⚠️ 返回 `null` 表示"这一段里一个都没找到"（调用方据此**原样保留**那个文本
 * 节点，顺带把它上面原有的 `position` 等信息一起留住——那不是可有可无的：
 * `math-delim.ts` 的 `标美元数` 就靠源码偏移吃饭）。
 *
 * ⚠️ 递归一层：内容里还能套着**别的**标记（`==a^2^==`）。深度由内容长度兜着，
 * 每次递归都吃掉至少一个字符，有限。
 */
export function 切文本(文: string, 要: ReadonlySet<标记节点名>): 片段[] | null {
  let 出: 片段[] | null = null;
  let 待切 = 0;
  let i = 0;

  while (i < 文.length) {
    let 中了: { 规格: 标记规格; 到: number; 内容: string } | null = null;
    for (const 规格 of 标记表) {
      // 下划线不走这里（它是 HTML 节点，见 `并下划线`）。
      if (规格.设置键 === null || !要.has(规格.mdast)) continue;
      规格.正则.lastIndex = i;
      const m = 规格.正则.exec(文);
      if (m) {
        中了 = { 规格, 到: 规格.正则.lastIndex, 内容: m[1] ?? "" };
        break;
      }
    }

    if (!中了) {
      i++;
      continue;
    }

    出 ??= [];
    if (i > 待切) 出.push({ 文: 文.slice(待切, i) });
    出.push({
      类型: 中了.规格.mdast,
      孩子们: 切文本(中了.内容, 要) ?? [{ 文: 中了.内容 }],
    });
    i = 中了.到;
    待切 = i;
  }

  if (出 && 待切 < 文.length) 出.push({ 文: 文.slice(待切) });
  return 出;
}

/* ── 第二格：mdast 树 → 换成自造节点（$remark）──────────────────────── */

/** 从一条片段造一条 mdast 节点。 */
function 造节点(片: 片段): MarkdownNode {
  if (片.类型) {
    return {
      type: 片.类型,
      children: (片.孩子们 ?? []).map(造节点),
    } as unknown as MarkdownNode;
  }
  return { type: "text", value: 片.文 ?? "" };
}

/** 有 `children` 的那种节点。 */
interface 有孩子 extends MarkdownNode {
  children: MarkdownNode[];
}

function 是容器(节: MarkdownNode): 节 is 有孩子 {
  return Array.isArray((节 as 有孩子).children);
}

/**
 * 读一条节点的 `value`（`text` 与 `html` 两种靠它吃饭）。
 *
 * ⚠️ **不能写 `节.value ?? ""`**：`MarkdownNode` 上的 `value` 是
 * `[x: string]: unknown` 那一格兜下来的，类型是 `unknown`——`?? ""` 收窄不了它，
 * `tsc --noEmit` 会连着报好几处 "Type '{}' is not assignable to type 'string'"。
 * 这里收一次，全文件都用它。
 */
function 读值(节: MarkdownNode): string {
  return typeof 节.value === "string" ? 节.value : "";
}

/** 读一条节点的纯文字（配不成对时要用它把内容退回去）。 */
function 纯文字(节: MarkdownNode): string {
  if (节.type === "text") return 读值(节);
  const 孩子们 = (节 as 有孩子).children;
  if (!Array.isArray(孩子们)) return "";
  return 孩子们.map(纯文字).join("");
}

/**
 * 把一段孩子里的 `<u>` … `</u>` 并成一颗 `notaUnderline`。
 *
 * ⚠️ **为什么是"并"而不是"切"**：remark-parse（CommonMark 那一层）先跑，
 * 它看到 `<u>重点</u>` 时**不会**给你一个文本节点——它按裸 HTML 切成三颗：
 * `html("<u>")` ＋ `text("重点")` ＋ `html("</u>")`。所以下划线这一条要在
 * mdast 上做**配对**，不是做正则替换。
 *
 * ⚠️ 配对失败（只有 `<u>` 没有 `</u>`，或者中间隔着块级节点）时**原样留下**，
 * 什么都不做——半截 `<u>` 保持它作为裸 HTML 的本来面目，比把它吃掉强。
 * 中途夹着块级节点也一律不配（那是"用户真的在写 HTML"，不是打错了）。
 *
 * ⚠️⚠️ **"隔着块级节点"的判据曾经写成"有 `children`"，那是个真缺陷**
 *（2026-09-27 量出来并修掉，属于 BUG-48 那一族）。原因是**行内节点也带
 * `children`**：`emphasis`（`*斜*`）、`strong`（`**粗**`）、`link`，以及本仓
 * 自造的 `notaHighlight` / `notaSuperscript` / `notaSubscript` 全都算。于是
 * `<u>下==高==下</u>` 这种"下划线里夹一层标记"**配不成**，`<u>` 与 `</u>`
 * 退回成两颗裸 HTML 节点、原样显示在编辑器里，真下划线 mark 一颗都没有。
 * 而**本仓自己就会写出这种源文**——下划线＋高亮是完全合法的组合，序列化那
 * 一侧吐出来的就是 `<u>下==高==下</u>`（见 `tests/inline-marks.test.ts` 第五组），
 * 于是"自己写的文件自己读不回来"：字节还在（那两颗 html atom 被原样保着，
 * 所以"打开再存字节不变"那条判据**照样绿**），丢的是 **WYSIWYG 的那一层**。
 * 换成 `块级节点` 这张表之后，行内节点（哪怕带 children）不再算边界。
 *
 * ⚠️ 表里**故意没有 `html`**：行内 `<u>` / `<br>` 本身就是 `html` 类型，
 * 列进去会把 `<u>a<br>b</u>` 也当跨界。块级 html 在块级位置上，与这一段
 * 文字不在同一个 `children` 里（`html-block.ts` 那张 `块级容器` 表管的就是它）。
 */
/** mdast 里**确定是块级**的节点名。见 `并下划线` 里那段注释。 */
const 块级节点: ReadonlySet<string> = new Set([
  "paragraph",
  "heading",
  "blockquote",
  "list",
  "listItem",
  "code",
  "thematicBreak",
  "table",
  "tableRow",
  "tableCell",
  "footnoteDefinition",
  "definition",
  "yaml",
]);

function 并下划线(孩子: MarkdownNode[]): MarkdownNode[] {
  const 出: MarkdownNode[] = [];
  let i = 0;
  while (i < 孩子.length) {
    const 头 = 孩子[i]!;
    if (头.type === "html" && /^<u>\s*$/i.test(读值(头))) {
      let j = i + 1;
      let 找着 = -1;
      for (; j < 孩子.length; j++) {
        const 一 = 孩子[j]!;
        if (一.type === "html" && /^<\/u>\s*$/i.test(读值(一))) {
          找着 = j;
          break;
        }
        // ⚠️ **判据是"块级"而不是"有 `children`"**（2026-09-27 修，见下面那段）。
        if (块级节点.has(一.type)) break;
      }
      if (找着 > i + 1) {
        const 中 = 孩子.slice(i + 1, 找着);
        出.push({
          type: "notaUnderline",
          children: 中,
        } as unknown as MarkdownNode);
        i = 找着 + 1;
        continue;
      }
    }
    出.push(头);
    i++;
  }
  return 出;
}

/** 走一遍整棵树：文本节点切片、相邻的 `<u>` 配对。 */
function 重写(孩子: MarkdownNode[], 要: ReadonlySet<标记节点名>): MarkdownNode[] {
  const 出: MarkdownNode[] = [];
  for (const 孩 of 孩子) {
    if (孩.type === "text") {
      const 片 = 切文本(读值(孩), 要);
      if (片) {
        for (const 一 of 片) 出.push(造节点(一));
        continue;
      }
      出.push(孩);
      continue;
    }
    if (是容器(孩)) 孩.children = 重写(孩.children, 要);
    出.push(孩);
  }
  return 并下划线(出);
}

/**
 * 解析转换器。**导出来是给测试用的**（走 `$remark` 那一层只有建整个 `Editor`
 * 才跑得到，测试直接把它挂到一台真 `unified()` 上）。
 *
 * ⚠️ `开关` 在**建实例时**捕获（`create.ts` 的 `.use()` 那一刻），所以改设置
 * 要**重建编辑器**才生效——这与 `physics` / `strict` 是同一条口径，理由也一样
 *（"设置像没生效"的毛病最难被当成 bug 报上来）。
 */
export function 行内标记转换器(开关: 行内扩展开关) {
  const 要 = new Set<标记节点名>(
    标记表
      .filter((一) => 一.设置键 === null || 开关[一.设置键])
      .map((一) => 一.mdast),
  );
  return (树: MarkdownNode): void => {
    树.children = 重写(树.children ?? [], 要);
  };
}

/**
 * 挂给 milkdown 的那一份。⚠️ 位置：**排在 `gfm` 后面**（见 `create.ts`）。
 *
 * ⚠️ 三层是 `$remark` 要的形状（**与 `math-delim.ts` 的 `标美元数` 一模一样**）：
 * 选项 → 转换器工厂 → 转换器。这里选项是 `undefined`（没有外层参数）。
 * 写成 `() => (树: MarkdownNode) => …` 一行也过不了类型——`RemarkPluginRaw`
 * 的树参数是 unified 的 `Root`，与 `MarkdownNode` 不是同一个东西，得让
 * 推断自己去接（所以下面那条箭头函数**不写参数类型**）。
 */
export function 行内标记解析(开关: 行内扩展开关) {
  // ⚠️ 拆成"插件本体 ＋ 工厂"两步，**照抄 `math-delim.ts` 的
  // `标美元数插件` ＋ `标美元数工厂`**。⚠️ 别把它简化成
  // `const 工厂: 转换器工厂 = (树) => …`——`转换器工厂` 的返回类型是**插件**
  // （`Plugin<[选项], Root>`，吃的是**选项**），不是转换器，写成那样 `树`
  // 会被推断成选项的类型（这里是 `undefined`），而报错要到 `树 as MarkdownNode`
  // 那一行才出现，看着像"类型断言写错了"。写这份时踩过一次。
  const 转换器插件: ReturnType<转换器工厂> = () => (树) => {
    行内标记转换器(开关)(树 as MarkdownNode);
  };
  const 工厂: 转换器工厂 = () => 转换器插件;
  return $remark("行内标记", 工厂);
}

/* ── 第三格：schema（四条 mark）＋ 命令 ＋ 输入规则 ──────────────────── */

/** 四条 mark 的公共规格：认 HTML 标签、跟 mdast 节点互相翻译。 */
function 造规格(一: 标记规格) {
  return {
    parseDOM: [{ tag: 一.html标签 }],
    toDOM: () => [一.html标签, 0] as [string, 0],
    parseMarkdown: {
      match: (node: MarkdownNode) => node.type === 一.mdast,
      runner: (state: ParserState, node: MarkdownNode, type: MarkType) => {
        state.openMark(type);
        state.next(node.children);
        state.closeMark(type);
      },
    },
    toMarkdown: {
      match: (mark: { type: { name: string } }) => mark.type.name === 一.标签,
      runner: (state: SerializerState, mark: unknown) => {
        state.withMark(mark as never, 一.mdast);
      },
    },
  };
}

export const 高亮规格 = $markSchema("highlight", () => 造规格(标记表[0]!));
export const 上标规格 = $markSchema("superscript", () => 造规格(标记表[1]!));
export const 下标规格 = $markSchema("subscript", () => 造规格(标记表[2]!));
export const 下划线规格 = $markSchema("underline", () => 造规格(标记表[3]!));

/**
 * 四条 `$markSchema`（`[ctx, 插件]` 那种两元组）。**测试要它**——测试直接
 * `一.ctx(ctx)` 把规格登记进一颗手搓的 Ctx，见 `tests/inline-marks.test.ts`。
 */
export const 行内标记规格 = [高亮规格, 上标规格, 下标规格, 下划线规格];

/**
 * 交给 `create.ts` 的 `.use()` 那一份。
 *
 * ⚠️⚠️ **两元组要整份摊平，不能只取第二格**（2026-09-27 修，BUG-46）。
 *
 * `$markSchema(id, …)` 返回的是 `[schemaCtx, plugin]`（`@milkdown/utils` 的
 * `lib/index.js:319-334`），里面**两样都得上**：
 *
 * - `plugin`（第二格）建那颗 mark；
 * - `schemaCtx`（第一格）是一个 `$Ctx`——**它本身就是一个 `MilkdownPlugin`**
 *   （`$Ctx<T, N> = MilkdownPlugin & { key: SliceType<T, N> }`，
 *   同目录 `lib/composable/$ctx.d.ts`），登记它的唯一作用是把**名字**
 *   （这里是 `"highlight"`）挂进 ctx 容器。
 *
 * 建 mark 那一步要按名字取回自己的规格：`$markSchema` 内部是
 * `ctx.get(schemaCtx.key)(ctx)`。**少了第一格，`ctx.get("highlight")`
 * 当场抛 `Context "highlight" not found, do you forget to inject it?`**
 * ——`editor.create()` 整个失败，界面上是"正在准备编辑器…"永远不停
 * ＋ 一条「编辑器启动失败」的提示条。⚠️ 本仓四条一次全中，因为这里原来写的是
 * `行内标记规格.map((一) => 一[1])`：`一[1]` 正是 plugin、`一[0]` 被丢掉了。
 *
 * ⚠️ **为什么当时看不出错**：`.map` 那版**类型上是过的**（`$MarkSchema` 的
 * 第二格确实是 `MilkdownPlugin`），测试也全绿——`tests/inline-marks.test.ts`
 * 走的是 `一.ctx(ctx)`（直接调第一格），**根本不经过 `.use()`**。
 * 所以这一条只有**真开一次窗**才暴露得出来（第 71 项当时如实标着"没开窗点过"）。
 *
 * ⚠️ `.flat()` 与上游同一个写法（`preset-commonmark/lib/index.js:1597`
 * 那个 `[…schema 元组…].flat()`）。类型那一关过不去（`$MarkSchema` 是数组、
 * 不是 `MilkdownPlugin`），所以这里显式 `as unknown as` ——**别把它当成
 * 可疑的强转删掉**，上下游的元组类型本来就不是同一个。
 */
export const 行内标记规格插件 = 行内标记规格.flat() as unknown as MilkdownPlugin[];

/** 四条 toggle 命令。名字与 `命令名表` 一一对应。 */
export const 行内标记命令 = [
  $command("ToggleHighlight", (ctx) => () => toggleMark(高亮规格.type(ctx))),
  $command("ToggleSuperscript", (ctx) => () => toggleMark(上标规格.type(ctx))),
  $command("ToggleSubscript", (ctx) => () => toggleMark(下标规格.type(ctx))),
  $command("ToggleUnderline", (ctx) => () => toggleMark(下划线规格.type(ctx))),
];

/** PM mark 名 → toggle 命令的名字。`command-table.ts` 的 `COMMANDS` 表按它派发。 */
export const 命令名表: Record<string, string> = {
  highlight: "ToggleHighlight",
  superscript: "ToggleSuperscript",
  subscript: "ToggleSubscript",
  underline: "ToggleUnderline",
};

/**
 * 四条输入规则（现敲现转）。
 *
 * ⚠️⚠️ **必须 `.use()` 在 `gfm` 前面**。`gfm` 自带一条删除线输入规则
 * `/…(~{1,2})(.+?)\1(?!\w|\/)$/`，它只要求"第一个 `~` 前面不是 `\w`"，
 * 而 JS 正则里的 `\w` **不含中文**——于是 `张~2~` 会先被它抢成删除线。
 * 输入规则是**按注册顺序试、先中者赢**的（`$inputRule` 往 `inputRulesCtx`
 * 追加），所以只要本仓这条排在前面，`~2~` 就归下标、`~~2~~` 才归删除线。
 *
 * ⚠️ 正则**末尾必须有 `$`**：输入规则拿的是"光标之前那一段文本"，没有 `$`
 * 就会在句子中间乱触发。⚠️ 也不能直接把 `标记表` 里那条拿来用——那是
 * **sticky 的扫描正则**（`lastIndex` 说话），两个用途对不上，所以这里另建一份。
 */
export function 行内标记输入规则(开关: 行内扩展开关) {
  return 标记表
    .filter((一) => 一.设置键 === null || 开关[一.设置键])
    .map((一) =>
      $inputRule((ctx) => {
        const 类型 =
          一.标签 === "highlight"
            ? 高亮规格.type(ctx)
            : 一.标签 === "superscript"
              ? 上标规格.type(ctx)
              : 一.标签 === "subscript"
                ? 下标规格.type(ctx)
                : 下划线规格.type(ctx);
        const 源 = 一.正则.source.replace(/\$$/, "");
        return markRule(new RegExp(`${源}$`), 类型);
      }),
    );
}

/* ── 第四格：mdast → markdown 源文（序列化 handler）────────────────── */

/**
 * 造一条序列化 handler。
 *
 * ⚠️ **照 `mdast-util-gfm-strikethrough` 的 `handleDelete` 的形状改写**
 *（`node_modules/mdast-util-gfm-strikethrough/lib/index.js:88-101`）：那里有
 * `createTracker` / `tracker.move` 这两样，它们管的是"符号与相邻内容之间的
 * 空格要不要补、补几个"。自己拼字符串的代价在 `math-delim.ts` 的文件头里
 * 已经记过一次（值首尾补空格、值里的换行防块级陷阱），这里同理——
 * 内容以空格开头时源文会变成 `== 重点==`，下次打开就被 `(?=\S)` 那条判据
 * 挡住，**标记静默消失一轮**。
 *
 * ⚠️ `state.enter` 要一个 `ConstructName`（那个接口是给扩展用
 * `declare module` 打开的，见 `mdast-util-to-markdown/lib/types.d.ts:54`）。
 * 本仓不为它开一次模块增强：那个名字唯一的用处是让 `unsafe` 表里
 * `inConstruct` 的那几条能认出来，而 `unsafe` 表里没有任何一条提到我们的
 * 四个名字——所以这一格是**空转**。留着它是为了与 `handleDelete` 保持同一
 * 个形状（将来真要用 unsafe 规则时不必回来补），转一下类型比开一处
 * `declare module` 轻。
 */
function 造处理器(一: 标记规格): 处理器 {
  return (node, _父, state, info) => {
    const tracker = state.createTracker(info);
    const 入栈 = state.enter as unknown as (名: string) => () => void;
    const exit = 入栈(一.mdast);
    let 值 = tracker.move(一.左);
    值 += state.containerPhrasing(node, {
      ...tracker.current(),
      before: 值,
      after: 一.右[0] ?? " ",
    });
    值 += tracker.move(一.右);
    exit();
    return 值;
  };
}

/**
 * 四条 handler，交给 `create.ts` 的 `remarkStringifyOptionsCtx`。
 *
 * ⚠️ 返回的是一个**新对象**（不是模块级常量）：`create.ts` 里那句
 * `handlers: { ...prev.handlers, ...行内标记处理器() }` 每次建实例都要一份，
 * 共用一个对象在将来"某个实例想改一条"时会串味。
 */
export function 行内标记处理器(): Record<string, 处理器> {
  const 出: Record<string, 处理器> = {};
  for (const 一 of 标记表) 出[一.mdast] = 造处理器(一);
  return 出;
}

/* ── 第五格：关掉语法之后那一条字节兜底（`handlers.text`）───────────── */

/** mdast 的文本处理器（`handlers.text` 那一条）。 */
type 文本处理器 = NonNullable<NonNullable<串化选项["handlers"]>["text"]>;

/**
 * 行首被转义掉的那个 `==…==`。`m[2]` 是整个 `==重点==`。
 *
 * ⚠️ 与 `lax-heading.ts` 里那条收得一样紧，理由也一样：只认**真的成对、
 * 内容不含 `=`、两边不贴空白**的那种。别的写法（`===`、`a == b`、
 * `== 空格 ==`）**照旧转义**——不做"凡是 `=` 都不转义"那种大赦，
 * 那会把 setext 标题下划线的防线拆掉。
 */
const 被转义的行首等号 = /(^|\n)\\(==(?=\S)[^=\n]*?\S==)/g;

/**
 * 包一层：把行首那个多余的 `\` 去掉。
 *
 * # 病灶
 *
 * `mdast-util-to-markdown` 的 unsafe 表里有一条 `{atBreak: true, character: '='}`
 *（`lib/unsafe.js:114`，注释："An equals to can start setext heading underlines"）。
 * 于是**行首**的 `=` 一律转义。而用户把高亮那一项关掉之后，`==重点==` 退回成
 * 普通文字，存盘就变成 `\==重点==` —— 用户没打那个反斜杠。这与
 * `lax-heading.ts` 治的 `\#标签` 是**同一个病**（那边文件头有完整的一段）。
 *
 * # 为什么可以放心去掉它
 *
 * 唯一的风险是"去掉之后这一段会被重新解析成 setext 标题下划线"。不可能：
 * setext 下划线只在**紧跟一个段落行**时才有意义，而 `toMarkdown` 在段落之间
 * 一律补空行（flow 的 join 就是 `\n\n`）。所以一行以 `==` 起的段落，前面
 * 必定是空行或块的开头——**在 CommonMark 里当不成下划线**。这也正是
 * 用户原文能解析成"一个段落"的原因（能解析成标题的话，源代码里那一段
 * 早就不是段落了）。
 *
 * ⚠️ 区间内还可能是引用块 / 列表项的第一行（输出是 `> ==重点==`、`- ==重点==`）。
 * 那两种情况下正文并不在行首（前面有 `> ` / `- `），但**文本节点自己的那个
 * 字符串**是从 `^` 开始的——所以这条规则照样适用，而重新解析时 `> ==重点==`
 * 仍然是一段引用里的普通文字。两边一致。
 *
 * # 挂在哪
 *
 * `create.ts` 的 `.config()` 里，与 `不转义行首井号` / `原子后的空格` **同一处**
 * 串起来（顺序见那里）。**恒挂**，不分模式、不分开关：它只在"本来就该是
 * 普通文字"的那种写法上生效，开关打开时压根碰不到。
 */
export function 不转义行首等号(原文?: 文本处理器): 文本处理器 {
  return (node, parent, state, info) => {
    if (!原文) return node.value ?? "";
    return 原文(node, parent, state, info).replace(被转义的行首等号, "$1$2");
  };
}

/* ── 第六格：`gfm` 那条删除线不许抢 `~x~`（BUG-48 的波浪号那一半）─────── */

/**
 * 喂给上游那条 `gfm` remark 插件的选项：**关掉"单个波浪号也算删除线"**。
 *
 * # 病灶（2026-09-27 量出来的，`tests/inline-marks.test.ts` 里钉着）
 *
 * GFM 的删除线默认**两头都收**：`~~x~~` 与 `~x~~`…更确切地说，`remark-gfm`
 * 的 `singleTilde` 默认是 **true**，于是 `~下~` 在 micromark 那一层就成了
 * **删除线**——而本仓的设置页从第一天起就写着「下标 `` `H~2~O` ``」。两者
 * 撞在同一个字符上，谁先谁赢：
 *
 * | 走的哪条路 | 谁先看见 `~下~` | 结果 |
 * |---|---|---|
 * | **打字**（输入规则） | 本仓的规则（`.use()` 排在 `gfm` 前，先中者赢） | 下标 ✓ |
 * | **打开/存盘**（micromark 分词） | `gfm` 的删除线 | **`~~下~~`** ✗ |
 *
 * 所以症状是**用户看着好好的、存盘之后文件里多了一个波浪号**：打开再存一次，
 * `H~2~O` 变成 `H~~2~~O`、`张~2~` 变成 `张~~2~~`（中文更早暴露，因为 gfm 那条
 * 的 `\w` 不含中文，`张~~三~~` 连删除线都不算，只是两个波浪号）。**这是数据被改了，
 * 不只是显示不对**——`docs/05` 里"自动修复换了副面孔"那一族里最隐蔽的一条：
 * 打的时候一切正常。
 *
 * # 关掉它之后本仓的语义（与 Typora 一致）
 *
 * | 写法 | 意思 |
 * |---|---|
 * | `~x~` | **下标**（本仓的 `notaSubscript`） |
 * | `~~x~~` | 删除线（`gfm` 的 `delete`，照旧是 `gfm` 的） |
 *
 * 两侧不冲突：`singleTilde:false` 只要求删除线**必须成双**，`~~x~~` 一个字都没变。
 * 边界那四条（下标正则的 `(?<!~)` / `(?!~)`）本来就是照这个语义写的，现在解析
 * 那一侧终于与它对齐了。
 *
 * # 怎么送到位（**不用换插件，也不用重新注册**）
 *
 * `remarkGFMPlugin` 是 `$remark('remarkGFM', () => remarkGFM)`，它的选项存在
 * **自己那个 ctx 切片**里（`@milkdown/utils/lib/index.js:371-378`：
 * `const options = $ctx(initialOptions ?? {}, id)`，跑插件时
 * `options: ctx.get(options.key)`）。而真正喂给 unified 的是
 * `@milkdown/core/lib/index.js:139` 那一行：
 *
 * ```js
 * ctx.get(remarkPluginsCtx).reduce((acc, plug) => acc.use(plug.plugin, plug.options), remark)
 * ```
 *
 * 也就是说**上游本来就把选项当 `unified().use(plugin, options)` 的第二个参数用**，
 * 而 `remark-gfm` 正是靠这个参数把 `singleTilde` 交给 micromark 的
 * （`remark-gfm/lib/index.js` 里 `this.use(gfm, options)`，读它的是
 * `micromark-extension-gfm-strikethrough/lib/syntax.js:20` 的 `options_.singleTilde`）。
 * 所以 `create.ts` 的 `.config()` 里改这个切片就够——不必像
 * `wrapInHeadingInputRule` 那样先 `filter` 掉再自己注册一条同名的。
 *
 * ⚠️ **顺序无所谓但时机有所谓**：`.config()` 跑在 Init 之前，而那个插件体是
 * `await ctx.wait(InitReady)` 之后才 `ctx.get(options.key)` 的，所以只要写在
 * `.config()` 里就一定赶得上（写在 `.use()` 之后反而可能赶不上）。
 *
 * ⚠️ **测试那边要拿这同一个常量**（`tests/inline-marks.test.ts` 的
 * `造处理机` 用它 `.use(remarkGfm, GFM选项)`）——两边各写一份字面量的话，
 * 改了产品没改测试，或者反过来，都会让这份测试变成假的。
 */
export const GFM选项 = { singleTilde: false };

/**
 * 把 `GFM选项` 落到编辑器上（`create.ts` 的 `.config()` 里那一行调的就是它）。
 *
 * ⚠️ **为什么要包成函数而不是让 `create.ts` 自己写**：`create.ts` 已经贴着
 * 1000 行那条线（`docs/09` §4 的闸门），而这件事的解释有一整段长注释——
 * 放在那边等于为别人的上限花钱。这里本来就是这个决定的文档所在地，顺路。
 *
 * ⚠️ **时机**：`.config()` 那一批跑在 Init 之前，而这个切片的读者是
 * `remarkGFMPlugin` 自己（`await ctx.wait(InitReady)` 之后才读），所以
 * 在 `.config()` 里调一定赶得上；**写在 `.use()` 之后反而可能赶不上**。
 *
 * ⚠️ `prev ?? {}` 不是防御性编程：那个切片的类型是 `Options | null | undefined`
 * （见 `preset-gfm/lib/plugin/remark-gfm-plugin.d.ts`），直接展开一个可能是
 * `null` 的值，`tsc` 报 TS2698「Spread types may only be created from object types」。
 */
export function 关掉单波浪号删除线(ctx: Ctx): void {
  // ⚠️ 是 `.options.key` 而不是 `.options`（`$Ctx` = 插件 ＋ 钥匙，不是切片；
  // 同 `create.ts` 里 katex 那条）。少一个 `.key` 就是 TS2345。
  ctx.update(remarkGFMPlugin.options.key, (prev) => ({ ...(prev ?? {}), ...GFM选项 }));
}

/**
 * 下标那一条正则的**非 sticky** 版（`切文本` 用 `lastIndex` 逐位扫，这里只问
 * "整颗文本节点里有没有能当下标的写法"，所以把 `y` 去掉照 `source` 重建一条）。
 * ⚠️ 在 `标记表` **之后**求值——`标记表` 是本模块顶部的 `const`，早于它会拿到
 * `undefined`（症状是这条恒不命中，于是转义照旧留着，看着像"补丁没生效"）。
 */
const 下标语法 = new RegExp(标记表[2]!.正则.source);

/** 文本节点的**兄弟**里，有没有会自己吐出一个裸 `~` 的那种（现在只有下标）。 */
function 贴边有波浪号定界符(parent: unknown, node: MarkdownNode, 取前一个: boolean): boolean {
  const 孩子们 = (parent as 有孩子 | undefined)?.children;
  if (!Array.isArray(孩子们)) return false;
  const i = 孩子们.indexOf(node);
  if (i < 0) return false;
  const 邻 = 孩子们[取前一个 ? i - 1 : i + 1];
  return 邻?.type === 标记表[2]!.mdast;
}

/** 这一颗文本节点**就是下标的内容**吗（那样它的两头直接贴着自己那个定界符）。 */
function 父是波浪号标记(parent: unknown): boolean {
  return (parent as MarkdownNode | undefined)?.type === 标记表[2]!.mdast;
}

/**
 * 包一层：把**孤立的** `\~` 去掉（`甲 ~ 乙` 存盘不该变成 `甲 \~ 乙`）。
 *
 * # 病灶
 *
 * `mdast-util-gfm-strikethrough` 的 `gfmStrikethroughToMarkdown()` 往序列化器的
 * unsafe 表里加了一条 `{character: '~', inConstruct: 'phrasing'}`，于是**正文里
 * 每一个波浪号**都转义——用户打的是"甲 ～ 乙"，存下去文件里多了两个反斜杠。
 * 与 `不转义行首等号` / `不转义行首井号` 是同一个病。
 *
 * ⚠️ 那条 unsafe 与 `singleTilde` **无关**（`mdast-util-gfm/lib/index.js:37,58`
 * 调 `gfmStrikethroughToMarkdown()` 时**没传参数**），所以关掉单波浪号删除线
 * 之后它照样在——两件事要分开做，别以为上面那个 `GFM选项` 顺手把它也治了。
 *
 * # 为什么不能"凡是 `\~` 都去掉"
 *
 * 因为这个反斜杠**有时候是有用的**。今天（含转义）这几条都是对的：
 *
 * | 文本节点的值 | 存出来 | 重开之后 |
 * |---|---|---|
 * | `甲 ~ 乙` | `甲 \~ 乙` | 同左 ✓（**这条是噪音，本节要治的**） |
 * | `~~甲~~` | `\~\~甲\~\~` | 同左 ✓（字面两个波浪号，不该变删除线） |
 * | `~甲~` | `\~甲\~` | 同左 ✓（下标关掉时它是普通文字；开着时它是"用户打的反斜杠"） |
 * | `甲~` ＋ 下标`乙` | `甲\~~乙~` | 同左 ✓（**这颗 `\` 是关键**：去掉就与下标那个定界符并成 `~~`） |
 *
 * 去掉了任何一条，波浪号就会与邻居**拼成一个标记**，重开时文字被吃掉或意思变了。
 * 所以这里不做大赦，只做**逐颗文本节点**的判断：把这一颗里所有 `\~` 都当去掉，
 * 然后拿三条判据问"去掉之后重新解析会变成别的东西吗"，任一命中就**整颗保持原样**
 * （宁可留着噪音，不许改数据）：
 *
 * 1. 出现 `~~` → 会变删除线；
 * 2. 命中**下标**那条正则（`下标语法`）→ 会变下标（`甲 ~乙~ 丙` 这种）；
 * 3. 这一颗的一头是个 `~`，而那一头**另有定界符**——"另有"指这两种：
 *    · **贴着**一颗下标兄弟（上表最后一行那种拼接）；
 *    · **自己就是下标的内容**（`父是波浪号标记`：那颗文本节点的两头直接贴着自己
 *      那个定界符，内容 `~` 会写成 `~~~`）。
 *
 * 判据 3 只看**下标**：别的兄弟节点要么吐的是多字符定界符（`==`、`<u>`、`~~`），
 * 要么它自己也被这条规则管着（相邻的**文本**节点只要以 `~` 收尾，按判据 2/3 的
 * 同一条口径它自己就留着转义，不会吐出一个裸 `~` 来跟我拼）。
 *
 * ⚠️ **过了这三条才去掉**，所以 `甲 ~ 乙` 通（一个波浪号不挨着谁、不成对），
 * 而上面那些行一条都不会动。
 *
 * ⚠️ 判据 3 拦不住的那一类是**内容本身就是定界符**（`~` 当内容 → `~~~`，`=`
 * 当高亮内容 → `=====`）：那是 `inline-marks.ts` 文件头**边界 3**（"内容里不能再
 * 出现同一个符号"）的直接后果——本仓那颗正则压根不认识反斜杠转义，所以这种写法
 * **本来就不往返**，与本节无关（`tests/inline-marks.test.ts` 里如实钉着现状）。
 *
 * # 挂在哪
 *
 * `create.ts` 的 `.config()` 里，**最外层**——与 `不转义行首等号` 同一个理由：
 * 它要看这一颗文本节点**最终**写出什么，得等里面那几条（`原子后的空格` 会把
 * U+00A0 换成普通空格）都改完。
 */
export function 不转义孤立波浪号(原文?: 文本处理器): 文本处理器 {
  return (node, parent, state, info) => {
    if (!原文) return node.value ?? "";
    const 出 = 原文(node, parent, state, info);
    if (!出.includes("\\~")) return 出;
    const 无转义 = 出.replace(/\\~/g, "~");
    if (无转义.includes("~~") || 下标语法.test(无转义)) return 出;
    const 两头另有定界符 = 父是波浪号标记(parent);
    if (无转义.startsWith("~") && (两头另有定界符 || 贴边有波浪号定界符(parent, node, true))) return 出;
    if (无转义.endsWith("~") && (两头另有定界符 || 贴边有波浪号定界符(parent, node, false))) return 出;
    return 无转义;
  };
}

/** 纯文字那一份也导出去（测试要拿它对比"关掉开关时是不是退回了字面"）。 */
export { 纯文字 as 读纯文字 };
