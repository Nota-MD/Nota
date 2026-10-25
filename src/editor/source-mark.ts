/**
 * 源码模式里**行内标记能不能摘掉**这一件事（纯函数，不碰 CodeMirror）。
 *
 * # 它为什么单独一个文件
 *
 * 用户 2026-09-30 报的（BUG-57）：
 *
 * > 现在选中已经加粗的文本，再按 Ctrl+B，会再加两个 `*`。应该是去掉。
 * > 类似的，Ctrl+I、U，排查代码。此问题仅源码或分栏模式有。
 *
 * 病灶在 `wrapSelection`（今天在 `source-commands.ts`，2026-10-07 从 `source.ts`
 * 搬过去的）：它**只包不摘**，不管选中的文字
 * 是不是已经被同一对定界符包着了。而这段判断（"到底算不算已经包上了"）
 * 是**纯字符串**的事——与 CodeMirror 无关，与视图无关。分出来是为了让它
 * 能被 `tests/source-mark.test.ts` 直接测：那几条嵌套的边界（`***甲***`）
 * 靠开窗手敲是试不全的，而它们恰恰是最容易改坏的地方。
 *
 * # 判据：三种结果，不是一个开关
 *
 * [`试摘定界符`] 的返回值有三种，调用方按这三种分别处理：
 *
 * ```text
 * { 结果: "摘" }  → 已经带着这一对，**摘掉**（连"摘完该选中哪儿"一起给了）
 * { 结果: "不动" }→ 认出来了，但**一颗字都不动**（嵌套，见下）
 * null            → 不是"已带标记"的形态，调用方照旧**包一层**
 * ```
 *
 * ⚠️ **"不动" ≠ null**，这两个别合并。合并的话，嵌套那种情况会落到"包一层"
 * 那一支上，而它包出来的正是用户报的那种垃圾（`***甲***` 里选中 `甲` 按
 * Ctrl+B，会变成 `*****甲*****`）。**分不清就不动**，比猜一个强。
 *
 * ⚠️ "摘完选中哪儿"也在这里算，不在调用方：那是一道**偏移量算术**
 * （摘外面那对时选区要左移一个定界符那么长），算错了症状是"按一下，光标
 * 跳到了别处"。放在纯函数里，`tests/source-mark.test.ts` 才量得到。
 *
 * # ⚠️ 嵌套为什么"不动"
 *
 * 判据全在字符上，没有文档树，所以 `***甲***` 那三颗星**分不清**该摘哪两颗
 * （摘外面那对剩 `*甲*`、摘里面那对也是 `*甲*`，`**甲**` 那两颗更是与"斜体"
 * 同形）。三种做法里：
 *
 * - 摘一对 ⇒ 得**赌**一颗不存在的"哪一对"信息；
 * - 包一层 ⇒ 得到 `*****甲*****`，比不做更糟；
 * - **一颗字都不动** ⇒ 用户看到"这一下没生效"，盘上的字**没坏**。
 *
 * 第三种是唯一不会改坏用户正文的，所以选它。
 *
 * ⚠️ 代价如实记着：`***甲***` 里选中 `甲` 按 Ctrl+B **取消不掉加粗**。要摘
 * 得先手动删两颗星，或者把整段连星一起选中（那也落在"嵌套"上，同样不动）。
 * 所见即所得那边没有这个限制（它有文档树，`command-state.ts` 读得出来
 * "当前选区是不是粗体"）——这一条正在 `command-state.ts` 文件头那句
 * "源码模式这份状态是缺的"底下，不是新缺口。
 *
 * # 为什么先判"外面"再判"里面"
 *
 * 两种形态都常见，但**外面**那种（`**|甲|**`）是双击选词的默认结果——
 * 双击只选中"词"，星号不进来。里面那种（`|**甲**|`）要用户自己把星号也框
 * 进去，是拖选的结果。先判外面只是顺序，不影响正确性（两种形态不会同时成立：
 * 外面的要求是选区两端紧贴着定界符、里面那对要求选区两端**是**定界符本身）。
 */

/**
 * 一次文本改动。
 *
 * ⚠️ `from` / `to` 是**原文档**里的偏移量，不是"改完之后"的——`CodeMirror`
 * 的 `changes` 就是这么收的（一次派发里几条改动各按原文档算，前后不互相
 * 挪位），所以摘外面那对定界符时，右半边那条不必减去左边删掉的字符数。
 */
export type TextChangeAction = { from: number; to: number; insert: string };

/** 摘完之后选区该落在哪儿（`CodeMirror` 的选区形状）。 */
export type SelectionScopeEnclose = { anchor: number; head: number };

/**
 * [`试摘定界符`] 的结果。`"摘"` 带着改动与选区，`"不动"` 什么都不带。
 *
 * ⚠️ 用可辨识联合而不是"要不要用 `改动.length` 判一下"：那种判法在调用方
 * 读起来是"改动只有一条时……"，而这条**语义**（是里面那对还是外面那对）
 * 根本不该出现在调用方那一侧。
 */
export type RemoveFixedBoundary =
  | { result2: "摘"; changeAction: TextChangeAction[]; selection: SelectionScopeEnclose }
  | { result2: "不动" };

/**
 * 选区已经带着 `before` / `after` 这一对定界符了吗？是的话给出"摘掉"的改动
 * 与摘完的选区。
 *
 * @param 文 当前文档全文（判据要往选区外面看一两个字符，`sliceString` 够用，
 *           但纯函数收全文最省心；调用点每次按键才跑一遍，不是热路径）
 * @param from 选区起点（原文档偏移）
 * @param to 选区终点
 * @param before 左定界符（`**`、`*`、`~~`、`` ` ``、`==`、`^`、`~`、`<u>`）
 * @param after 右定界符（下划线与其余几家不同形：`</u>`）
 * @returns 见 {@link 摘定界}；`null` 表示"没带着这一对，照旧包一层"。
 *          三种结果的差别见文件头。
 */
export function tryRemoveFixedBoundarySymbol(
  text4: string,
  from: number,
  to: number,
  before: string,
  after: string,
): RemoveFixedBoundary | null {
  const select = text4.slice(from, to);
  // 空选区没有"已经加粗"可判（光标不在任何标记里），交给调用方插占位词。
  if (select === "") return null;
  const beforeLength = before.length;
  const afterLength = after.length;
  // 定界符**边缘那一颗**（`**` 是 `*`、`</u>` 是 `>`）：下面判"再往外/再往里
  // 还压着一颗同字符吗"用的就是它。
  // ⚠️ 用 `slice` 而不是下标取值：本仓开着 `noUncheckedIndexedAccess`，
  // `before[前 - 1]` 的类型是 `string | undefined`，而这两个串必然非空。
  const leftEdge = before.slice(-1);
  const rightEdge = after.slice(0, 1);

  // ── ① 定界符紧贴在选区**外面**：`**|甲|**` ──────────────────────────
  const externalLeft = text4.slice(Math.max(0, from - beforeLength), from);
  const externalRight = text4.slice(to, to + afterLength);
  if (externalLeft === before && externalRight === after) {
    // ⚠️ 定界符再往外还有一颗同字符的话，说明外面接着更长的一串
    //（`***甲***` 里选中 `甲`，左边那两颗只是三颗星的后两颗）——
    // 那就是"嵌套"，不动。判据用的是定界符**最后**一个字符：`**` 是 `*`、
    // `</u>` 是 `>`，两种写法都落在同一句上。
    const moreLeft = text4.slice(Math.max(0, from - beforeLength - 1), Math.max(0, from - beforeLength));
    const moreRight = text4.slice(to + afterLength, to + afterLength + 1);
    if (moreLeft === leftEdge || moreRight === rightEdge) return { result2: "不动" };
    return {
      result2: "摘",
      changeAction: [
        { from: from - beforeLength, to: from, insert: "" },
        { from: to, to: to + afterLength, insert: "" },
      ],
      // 摘掉外面那两串，选区两端各左移一个左定界符那么长（右半边那条改动
      // 在选区右侧，不会把左半边再挪一次）。
      selection: { anchor: from - beforeLength, head: to - beforeLength },
    };
  }

  // ── ② 定界符**在选区里**：`|**甲**|`（用户把星号一起框进来了） ────────
  if (select.startsWith(before) && select.endsWith(after) && select.length > beforeLength + afterLength) {
    const inside = select.slice(beforeLength, select.length - afterLength);
    // ⚠️ 两道闸，都是"这不是干净的一对、别乱摘"：
    // 里面还压着一颗同字符（`***甲***` 全选，`内` 是 `*甲*`）⇒ 嵌套；
    // 外面紧挨着一颗同字符（`**粗体**` 里只选中 `*粗体*`）⇒ 选区只是更长
    // 一串的一部分，摘掉会把"加粗"变成"斜体"。
    if (inside.startsWith(leftEdge) || inside.endsWith(rightEdge)) return { result2: "不动" };
    const beforeExternal = text4.slice(Math.max(0, from - 1), from);
    const afterExternal = text4.slice(to, to + 1);
    if (beforeExternal === leftEdge || afterExternal === rightEdge) return { result2: "不动" };
    return {
      result2: "摘",
      changeAction: [{ from, to, insert: inside }],
      // 摘的是选区自己那两端，所以选区**不挪位**，只是变短到正文那么长。
      selection: { anchor: from, head: from + inside.length },
    };
  }

  return null;
}
