/**
 * 行内公式的**打字**规则：敲 `$x$` 或 `$$x$$`，当场变成一颗 `math_inline`。
 *
 * # 为什么会有这个文件（换掉了上游哪一条）
 *
 * `@milkdown/plugin-math` 只给了一条行内规则（导出的 `mathInlineInputRule`），
 * 正则 `/(?:\$)([^$]+)(?:\$)$/`。它认不出 `$$…$$`：用户敲到 `A$$bb$` 这一下，
 * 尾巴上的 `$bb$` 就够匹配了，于是当场变出「文本 `A$` ＋ 公式 `bb`」——等他
 * 把最后一个 `$` 补上，那已经是**另一段文字**了。**"行内 `$$…$$` 打不出来"
 * 的根因就在这儿**，跟解析器无关（解析器本来就认，见下）。
 *
 * 所以 `create.ts` 把那条按引用滤掉了（`math.filter((p) => p !== mathInlineInputRule)`，
 * 和标题那条 `wrapInHeadingInputRule` 是同一个手法），换成下面两条。
 *
 * # 两条规则
 *
 * | 敲什么 | 变成 | 与上游比 |
 * |---|---|---|
 * | `$$x$$` | `math_inline("x")` | **新加的**（用户 2026-09-26 要的"不必独占一行"） |
 * | `$x$` | `math_inline("x")` | 照旧，只多一条守卫 |
 *
 * ⚠️ **守卫**：`$…$` 前面紧挨着**还是 `$`** 时让它让开（`null`）。多出来的那颗
 * `$` 说明用户正在敲 `$$…$$`，此刻尾巴上的 `$bb$` 只是个中间状态。让开之后
 * PM 会照常把这颗字符插进文档，等 `$$` 齐了由上一条规则接管。
 * （`null` 在 `prosemirror-inputrules` 里是"这条不接、试下一条"
 * ——`run()` 里那一句 `if (!tr) continue`；上游那条已经被滤掉，所以这里
 * 让开就等于"这颗字符不触发任何规则"，正是想要的。）
 *
 * # 判据：与解析器同一把尺子（`table-input.ts` 那条规矩）
 *
 * 这里的口径是"解析器怎么读，我就怎么转"——本仓打开文件时走的是
 * `remark-parse` ＋ `remark-math`（micromark 的 math 扩展）。这么定不是为了
 * 好看，而是**唯一站得住的口径**：我转出来的东西，存盘再打开必须还是它。
 * 实测（`remark-parse` 11 ＋ `remark-math` 6.0.0，2026-09-26）：
 *
 * | 输入 | 解析器读成 | 本规则 |
 * |---|---|---|
 * | `A$$bb$$ B` | 文本`A` ＋ 公式`bb` ＋ 文本` B` | 同 ✔ |
 * | `x$$y$$` | 文本`x` ＋ 公式`y` | 同 ✔ |
 * | `A$$bb$ B`（没闭合） | **整段字面** | 同 ✔（守卫让开） |
 * | `C$dd$ D` | 文本`C` ＋ 公式`dd` ＋ 文本` D` | 同 ✔ |
 * | `$ a$` / `$a $` / `$ $` | 都算公式（值里带那个空格） | 同 ✔ |
 * | `$$a$b$$` | 公式`a$b` | 字面 ✘ `[^$]+` 不吃中间的 `$` |
 * | `A$$$ab$$` | **整段字面**（三个 `$` 起不来） | 文本`A$`＋公式`ab` ✘ 同上 |
 *
 * ⚠️ 那两行 ✘ 是**有意留着的**：要消掉它们就得把正则写成照抄 micromark 的
 * 美元计数状态机，而"一次敲出好几个 `$`"本身就是病态输入。真按下去的代价也
 * 只是**当场不转**，用户接着敲就是了——不会吃字（对比 `table-input.ts` 里
 * 那条"误判的代价是不对称的"）。
 *
 * ⚠️ 两条规则是**解析器的局部近似**，不是同一个东西：输入规则只看光标前
 * 最多 500 个字符那一截（`prosemirror-inputrules` 的 `MAX_MATCH`），
 * 解析器看整行。上面那两行 ✘ 就是这条差别的具体长相。
 *
 * # 存的**就是**打的：`$$x$$` 存盘还是 `$$x$$`（2026-09-27 起）
 *
 * 上面这张表只管"什么时候当场变公式"；**变出来的那颗公式记着自己是用几个 `$`
 * 写的**，存盘照原样写回去。这件事不在这个文件里（这里只负责"当场记下那个数"，
 * 见 `换成公式` 最后一个参数），全貌在 `math-delim.ts` 文件头。
 *
 * ⚠️ 在那之前是**存的不是打的**：`$$x$$` 存盘变成 `$x$`。原因是 mdast 的
 * `inlineMath` **没有"用了几个 `$`"这个字段**，写回时的美元数是
 * `mdast-util-math` **按值现算**的（`lib/index.js:241-257`）。用户 2026-09-27
 * 拍了「保留」，于是另记了一处状态。
 */

import { $inputRule } from "@milkdown/kit/utils";
import { InputRule } from "@milkdown/kit/prose/inputrules";
import type { NodeType } from "@milkdown/kit/prose/model";
import type { EditorState, Transaction } from "@milkdown/kit/prose/state";
import { mathInlineSchema } from "@milkdown/plugin-math";

import { 美元数属性 } from "./math-delim";

/**
 * `$…$` 的正则。
 * ⚠️ 与上游 `mathInlineInputRule` 那条**逐字一样**（好对照）：判断"哪一截算公式"
 * 这件事没有变，变的只是前面多了一道守卫。
 */
export const 单美元 = /(?:\$)([^$]+)(?:\$)$/;

/** `$$…$$` 的正则。 */
export const 双美元 = /\$\$([^$]+)\$\$$/;

/**
 * 尾巴上这一截该不该变成公式？
 *
 * @param 前 紧挨着这一截**前面**的那一个字符（段落最前面就是空串）。
 *   ⚠️ 只判一个字符：`A$$bb$` 里那个候选是 `$bb$`，前面是 `$` ⇒ 让开。
 */
export function 该变公式(前: string): boolean {
  return 前 !== "$";
}

/**
 * `start` 前面那一个字符。
 *
 * ⚠️ `start` 落在段落最前面时**没有**前一个字符（`parentOffset === 0`），
 * 这时不能去 `textBetween(start - 1, start)`——那个位置已经出了这一段，
 * 拿到的是空串或者上一块的边界，判出来没意义。
 */
function 前一个字符(state: EditorState, start: number): string {
  if (state.doc.resolve(start).parentOffset === 0) return "";
  return state.doc.textBetween(start - 1, start);
}

/**
 * 把 `起…end` 那一截换成一颗公式节点，源码插进去当内容。
 *
 * ⚠️ 与上游**同一个手法**：`createAndFill()` 出来的是**空**节点（`math_inline`
 * 的内容是 `text*`，没有必填内容），源码靠 `insertText` 补进去——这是为了让
 * 光标最终落在节点**后面**，用户接着敲的字是正文，而不是接着往公式里塞。
 * （节点里那个位置是"节点内"，光标映射出去就落到节点后。）
 *
 * ⚠️ `美元` 是**用户敲了几个 `$`**（1 或 2），当场就知道，所以直接写进属性——
 * 那一条信息**在 mdast 里没有地方存**（`math-delim.ts` 文件头那段），打字这条路
 * 顺手记下来，存盘才写得回去。⚠️ 别把 `createAndFill()` 写回空的：那等于把
 * `$$x$$` 又降级一次，而且**没有任何报错**。
 */
function 换成公式(
  规格: NodeType,
  state: EditorState,
  起: number,
  end: number,
  源: string,
  美元: number,
): Transaction | null {
  const 节点 = 规格.createAndFill({ [美元数属性]: 美元 });
  if (!节点) return null;
  const tr = state.tr.replaceRangeWith(起, end, 节点);
  tr.insertText(源, 起 + 1);
  return tr;
}

/**
 * 两条规则。`.use()` 收数组。
 *
 * ⚠️ **顺序有讲究**：`$$…$$` 在前。`$…$` 那条的正则配不出 `$$bb$$` 这种尾巴
 * （`[^$]+` 中间的 `$` 过不去），所以两条其实撞不上——但万一以后有人放宽了
 * 正则，"长的先试"是唯一不会出错的那种排法。
 */
export const 公式输入 = [
  $inputRule((ctx) =>
    new InputRule(双美元, (state, match, start, end) =>
      换成公式(mathInlineSchema.type(ctx), state, start, end, match[1] ?? "", 2),
    ),
  ),
  $inputRule((ctx) =>
    new InputRule(单美元, (state, match, start, end) =>
      该变公式(前一个字符(state, start))
        ? 换成公式(mathInlineSchema.type(ctx), state, start, end, match[1] ?? "", 1)
        : null,
    ),
  ),
];
