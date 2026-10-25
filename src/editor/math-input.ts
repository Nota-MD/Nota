/**
 * 行内公式的**打字**规则：敲 `$x$` 或 `$$x$$`，当场变成一颗 `math_inline`。
 *
 * 另有第三条规则不在这个文件里，是**块**公式那条：`$$` 那一段按回车建一块空的
 * `math_block`（上游原来是"`$$` ＋空格"就建，2026-10-04 换掉了，见下）。
 *
 * # 为什么会有这个文件（换掉了上游哪两条）
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
 * ⚠️ **2026-10-04 又摘了第二条**：上游的 `mathBlockInputRule`（正则 `/^\$\$\s$/`）
 * ——"`$$` ＋**空格**"当场把整段变成一块**空**的公式块。它自己的注释写的是
 * 「type `$$` and press **enter**」，实现却是"吃掉一颗空白"，于是一个空格就
 * 让人**误**建出一块空公式（屏幕上是一块空白，用户报的就是这个）。
 * 现在那条摘掉，改成**回车**才建块（见 [`公式块回车`]）——回车是明确的动作。
 *
 * # 三条规则
 *
 * | 敲什么 | 变成 | 与上游比 |
 * |---|---|---|
 * | `$$x$$` | `math_inline("x")` | **新加的**（用户 2026-09-26 要的"不必独占一行"） |
 * | `$x$` | `math_inline("x")` | 照旧，只多两道守卫 |
 * | `$$` ＋**回车** | 一块**空**的 `math_block`，源码框当场打开 | **换掉上游那条**（原来是"`$$` ＋空格"就建，见上） |
 *
 * ⚠️ **守卫一**：`$…$` 前面紧挨着**还是 `$`** 时让它让开（`null`）。多出来的那颗
 * `$` 说明用户正在敲 `$$…$$`，此刻尾巴上的 `$bb$` 只是个中间状态。让开之后
 * PM 会照常把这颗字符插进文档，等 `$$` 齐了由上一条规则接管。
 * （`null` 在 `prosemirror-inputrules` 里是"这条不接、试下一条"
 * ——`run()` 里那一句 `if (!tr) continue`；上游那条已经被滤掉，所以这里
 * 让开就等于"这颗字符不触发任何规则"，正是想要的。）
 *
 * ⚠️ **曾经有过守卫二**（2026-10-04 当天加了又**当天撤回**）：那一条是"值紧挨着
 * 空格不算公式"（`$ x$` / `$x $` / `$ x $` 原样留在正文里）。用户下午在分屏预览里
 * 发现它顺手把 `$ \LaTeX $` 这种带空格的常见写法也判成了普通文字，拍了「整条撤回」
 * ——于是 `math-delim.ts` 那一格与本文件这道守卫**一起删掉**（两条路同一把尺子，
 * 只删一边就成了"打字不转、打开又渲染"）。代价（存盘会把值两端的空格 trim 掉）
 * 记在 `math-delim.ts` 文件头那段 ⚠️ 里。
 *
 * # 判据：与解析器同一把尺子（`table-input.ts` 那条规矩）
 *
 * 这里的口径是"解析器怎么读，我就怎么转"——本仓打开文件时走的是
 * `remark-parse` ＋ `remark-math`（micromark 的 math 扩展）＋ 本仓那几层
 * 转换器。这么定不是为了好看，而是**唯一站得住的口径**：我转出来的东西，
 * 存盘再打开必须还是它。
 * 实测（`remark-parse` 11 ＋ `remark-math` 6.0.0，2026-09-26；2026-10-04 那天
 * 加过第五格、当天撤回，这份表**已按撤回后的行为重核过**）：
 *
 * | 输入 | 解析器读成 | 本规则 |
 * |---|---|---|
 * | `A$$bb$$ B` | 文本`A` ＋ 公式`bb` ＋ 文本` B` | 同 ✔ |
 * | `x$$y$$` | 文本`x` ＋ 公式`y` | 同 ✔ |
 * | `A$$bb$ B`（没闭合） | **整段字面** | 同 ✔（守卫一让开） |
 * | `C$dd$ D` | 文本`C` ＋ 公式`dd` ＋ 文本` D` | 同 ✔ |
 * | `$ a$` / `$a $` / `$ x $` | 公式（值两端被 trim 掉，存盘写 `$a$`） | 同 ✔ |
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

import { $inputRule, $prose } from "@milkdown/kit/utils";
import { InputRule } from "@milkdown/kit/prose/inputrules";
import type { NodeType } from "@milkdown/kit/prose/model";
import type { EditorState, Transaction } from "@milkdown/kit/prose/state";
import { NodeSelection, Plugin, PluginKey } from "@milkdown/kit/prose/state";
import type { EditorView } from "@milkdown/kit/prose/view";
import { mathBlockSchema, mathInlineSchema } from "./math-schema";

import { dollarCountAttribute } from "./math-delim";

/**
 * `$…$` 的正则。
 * ⚠️ 与上游 `mathInlineInputRule` 那条**逐字一样**（好对照）：判断"哪一截算公式"
 * 这件事没有变，变的只是前面多了一道守卫。
 */
export const singleDollarDollar = /(?:\$)([^$]+)(?:\$)$/;

/** `$$…$$` 的正则。 */
export const doubleDollarDollar = /\$\$([^$]+)\$\$$/;

/**
 * 尾巴上这一截该不该变成公式？（**目前只有一道守卫**，见文件头「守卫一」）
 *
 * @param 前 紧挨着这一截**前面**的那一个字符（段落最前面就是空串）。
 *   ⚠️ 只判一个字符：`A$$bb$` 里那个候选是 `$bb$`，前面是 `$` ⇒ 让开。
 *
 * ⚠️ 曾经还有第二个参数 `值`（2026-10-04 的"守卫二"：值两端紧挨空格就不转），
 * 当天与解析那一侧的第五格一起撤回了——留着这个参数会让两边尺子重新分家。
 */
export function shouldChangeCommonStyle(before2: string): boolean {
  return before2 !== "$";
}

/**
 * `start` 前面那一个字符。
 *
 * ⚠️ `start` 落在段落最前面时**没有**前一个字符（`parentOffset === 0`），
 * 这时不能去 `textBetween(start - 1, start)`——那个位置已经出了这一段，
 * 拿到的是空串或者上一块的边界，判出来没意义。
 */
function previousChar(state: EditorState, start: number): string {
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
function replaceBecomeCommonStyle(
  spec: NodeType,
  state: EditorState,
  start5: number,
  end: number,
  source3: string,
  dollarDollar: number,
): Transaction | null {
  const node = spec.createAndFill({ [dollarCountAttribute]: dollarDollar });
  if (!node) return null;
  const tr = state.tr.replaceRangeWith(start5, end, node);
  tr.insertText(source3, start5 + 1);
  return tr;
}

/**
 * 两条规则。`.use()` 收数组。
 *
 * ⚠️ **顺序有讲究**：`$$…$$` 在前。`$…$` 那条的正则配不出 `$$bb$$` 这种尾巴
 * （`[^$]+` 中间的 `$` 过不去），所以两条其实撞不上——但万一以后有人放宽了
 * 正则，"长的先试"是唯一不会出错的那种排法。
 */
export const commonStyleInput = [
  $inputRule((ctx) =>
    new InputRule(doubleDollarDollar, (state, match, start, end) =>
      replaceBecomeCommonStyle(mathInlineSchema.type(ctx), state, start, end, match[1] ?? "", 2),
    ),
  ),
  $inputRule((ctx) =>
    new InputRule(singleDollarDollar, (state, match, start, end) =>
      shouldChangeCommonStyle(previousChar(state, start))
        ? replaceBecomeCommonStyle(mathInlineSchema.type(ctx), state, start, end, match[1] ?? "", 1)
        : null,
    ),
  ),
];

/* ── 块公式：回车才建（2026-10-04）────────────────────────────────────── */

/**
 * 「这一行就是个空块公式的头」的判据：`$$`，**后面最多跟空白**。
 *
 * ⚠️ 尾巴上那颗空白是**故意留的**：上游那条被打掉的规则（见文件头 ⚠️）触发的
 * 条件正是"`$$` ＋一颗空白"，于是「`$$ ` 之后按回车」是顺着老肌肉记忆的写法；
 * 这一版把"建块"挪到回车，但**没有把那颗空格定义成"不算"**——两种写法都认。
 * （行内那条守卫二（"值的两边有空格 ⇒ 这不是公式"）2026-10-04 当天撤回，
 * 这条判据不受影响：这里根本没有"值"，`$$` 是**块的开头**。）
 */
export const emptyBlockHeader = /^\$\$\s*$/;

/**
 * 回车：把「一行光秃秃的 `$$`」变成一块**空的**块公式，并且**当场打开源码框**。
 *
 * ⚠️ 上游为什么不行（文件头 ⚠️ 那段）：它的触发条件是"`$$` ＋一颗空白"，
 * 于是用户想空一行/想打个空格，屏幕上就**凭空多出一块空白**——而且是**误**建。
 * 它自己的注释写的是「type `$$` and press **enter**」，实现却跟注释不符。
 * 这一版把触发键**退回注释说的那个**：回车是明确动作，敲错了能看见、能撤销。
 *
 * 四道守卫，缺一道就是"抢了别人的活"：
 *
 * 1. **空选区**。框选着东西按回车不该建块。
 * 2. **只在行尾**。`$$` 后面还有字的时候（`$$abc`）按回车是拆段，不是建块。
 * 3. **表格格子里不干**。格子里的回车归 `table-input.ts`（敲表头那两行时它要
 *    把两段吃成一张表），与 `heading-on-enter.ts::回车成标题` 同一条。
 * 4. **只读实例不干**。分屏右边那个预览窗格用的是同一个编辑器，它不可编辑。
 *
 * ⚠️ 建完块**必须设 `NodeSelection`**（而不是像上游那样把光标留在块内容里）：
 * `math-view.ts` 判"要不要开源码框"的**唯一判据**就是整块选中（那个文件里
 * `算装饰` 那一条）。设成 `NodeSelection` 之后 `公式当前` 那条装饰立刻挂上，
 * NodeView 的 `重画()` 当场把输入框 `focus()`——用户按下回车就能直接敲 LaTeX。
 * （上游那版把光标留在内容里，靠 `归位选区` 的 `appendTransaction` 再补一刀
 * 变成 `NodeSelection`，绕一圈到同一个地方。这里直接到位，少一次事务往返。）
 *
 * ⚠️ 块公式的源码存在 **`attrs.value`**，不是 `textContent`（行内才是）
 * ——`math-view.ts::取源码` 那里有一整段讲这个差别。所以新建的这块是
 * `value: ""`，源码框里空着，占位卡由 NodeView 自己画。
 */
export function returnCarBecomeCommonStyleBlock(view: EditorView, blockType: NodeType): boolean {
  if (!view.editable) return false;

  const { state } = view;
  const { $from, empty } = state.selection;
  if (!empty) return false;

  const paragraph2 = $from.parent;
  if (paragraph2.type.name !== "paragraph") return false;

  for (let d = $from.depth - 1; d > 0; d--) {
    const name3 = $from.node(d).type.name;
    if (name3 === "table_cell" || name3 === "table_header") return false;
  }

  if (!emptyBlockHeader.test(paragraph2.textContent)) return false;

  // 守卫 2（见上）。`parentOffset` 就是光标在这一段里的偏移。
  if ($from.parentOffset !== paragraph2.content.size) return false;

  const emptyBlock = blockType.createAndFill({ value: "" });
  if (!emptyBlock) return false;

  const start5 = $from.before($from.depth);
  const tr = state.tr.replaceWith(start5, start5 + paragraph2.nodeSize, emptyBlock);
  tr.setSelection(NodeSelection.create(tr.doc, start5));
  tr.scrollIntoView();
  view.dispatch(tr);
  return true;
}

/**
 * 把 [`回车成公式块`] 挂到回车上。
 *
 * ⚠️ **上游那条键位必须一起摘掉**（`create.ts` 里 `math.filter(...)` 现在已经
 * 滤掉了 `mathBlockInputRule`）——不摘的话"`$$` ＋空格"那条还在，用户打一颗
 * 空格照样凭空多出一块空公式，这条新规则再对也没用。两处**成对改**。
 *
 * ⚠️ 与 `heading-on-enter.ts::标题回车成块` 同一个手法（`$prose` ＋
 * `props.handleKeyDown`），但**不需要 `$shortcut` ＋ `priority`**：那边要压过
 * 上游的 keymap，这边上游那条根本不是 keymap——它挂在**输入规则**上
 * （`InputRule` 只吃 `textInput`，跟回车这条路撞不上）。所以按普通插件挂，
 * 顺序上没有讲究；`create.ts` 里挨着标题那条 `.use()` 就行。
 *
 * ⚠️ 光秃秃的回车才认（Shift+Enter 是硬换行、Ctrl/Alt+Enter 各有绑定、
 * 输入法组合中的那一下是"选词"），与标题那条**逐字相同**的一套守卫。
 */
export const commonStyleBlockReturnCar = $prose(
  (ctx) =>
    new Plugin({
      key: new PluginKey("nota-math-block-on-enter"),
      props: {
        handleKeyDown: (view, event) => {
          if (
            event.key !== "Enter" ||
            event.shiftKey ||
            event.ctrlKey ||
            event.metaKey ||
            event.altKey ||
            view.composing
          ) {
            return false;
          }
          return returnCarBecomeCommonStyleBlock(view, mathBlockSchema.type(ctx));
        },
      },
    }),
);
