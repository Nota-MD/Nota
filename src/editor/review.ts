/**
 * 编辑区里的**就地改动预览**：把一份"改完之后该长什么样"的文本，直接在编辑区里
 * 画成 diff（用户 2026-09-26 点名的做法）。
 *
 * # 为什么不是"另开一个界面"
 *
 * 在此之前，插件的改动预览走的是 `nota.ui.review(面板)`：把某个面板整个摊到
 * 编辑区的位置上，正文**让位**（`styles/review.css` 里 `.editor-pane` 被
 * `display:none`）。用户否掉了那个形态：「我的想法是直接将内容嵌入编辑区域。
 * 有几个：显示diff对比，显示修改后的效果。直接作用于编辑区域，而不是开一个
 * 独立界面」。
 *
 * 于是这一版把改动画在**正文自己身上**——正文一个字都不动，画的是**装饰**：
 *
 * | 单元 | 怎么画 | 文档动没动 |
 * |---|---|---|
 * | 删掉的行/块 | 装饰（`lines` 或 `node` 上加一个 class） | 没动 |
 * | 新增的行/块 | **块级 widget**（插在锚点之后的一段只读 DOM） | 没动 |
 * | 没变的 | 不画 | 没动 |
 *
 * 这是 Folio 那条做法在 Nota 这边的对应物：Folio 那边删除侧走 CSS Custom
 * Highlight API（DOM 一字不动），新增侧把节点 `insertBefore` 进正文流。
 * 本仓这半边的落地方式见 `review-prose.ts`（所见即所得）与 `source.ts`
 * 里 `预览扩展`（源码模式）——**这个文件里一行编辑器 API 都没有**，
 * 两种模式共用下面的算法与 DOM。
 *
 * # 两种看法（用户说的那两件事）
 *
 * 「显示diff对比」与「显示修改后的效果」是**同一份装饰的两种画法**：
 *
 * | 看法 | 删掉的那些 | 新增的那些 |
 * |---|---|---|
 * | `diff` | 划掉 + 红底（知道自己丢了什么） | 绿底（知道自己多了什么） |
 * | `result` | **`display:none`**（藏掉） | 只留左边那条竖线，**底色去掉** |
 *
 * ⚠️ 切换看法**只换根节点上的一个 class，不重算装饰、不派事务**——两条看法
 * 的差别全在 CSS 里（`styles/review.css`）。这就是为什么 `result` 那一栏"藏掉"
 * 能成立：藏掉所有被删的、留着所有新增的，屏幕上剩下的**正好就是目标文本**。
 * 新增那些在 `result` 里去掉底色也是同一个道理：绿底留着的话，那就不叫
 * "改后的效果"了，叫"改后的效果外加一块绿"。
 *
 * # 只有 dispatch 才进撤销栈
 *
 * 预览期间文档一个字节都没变，所以整段预览**不在撤销栈里**——和 Folio 同一条
 * 语义（那边也是"预览不进撤销栈，接受才是 `execCommand` 一笔"）。接受走插件的
 * 命令（插件自己 `nota.document.set_text`），那就是**一笔**编辑，Ctrl+Z 一次退回。
 */

/* ── 类型 ─────────────────────────────────────────────────────────────── */

/** 一个「接受 / 放弃」按钮：**措辞归插件**（i18n），前端只负责画和点。 */
export interface PreviewAction {
  /** 按钮上写什么。插件给的是 `T("接受改动")` 那一套。 */
  label: string;
  /** 点下去要调的命令名，配 `plugin.call(插件, 命令)` 用。 */
  command: string;
}

/**
 * 一格改动预览。宿主那边是 `ReviewState` 的 `Diff` 形态（`plugin/mod.rs`）。
 *
 * ⚠️ 里面**没有"接受之后是什么样"以外的任何语义**：`text` 是完整的目标文本，
 * 不是补丁、不是 hunk。补丁怎么打是插件自己的事（`plugins/ai/main.lua` 的
 * `apply_changes`），宿主与编辑器只认"整篇该长什么样"这一种说法——多一种说法
 * 就多一处对不齐的地方。
 */
export interface changePreview {
  /** 标题。摊在编辑区顶上那条细条里。 */
  title: string;
  /** **目标文本**：应用之后文档该长什么样。 */
  text: string;
  /** 「接受」。`null` = 插件没给，不画（那就只能靠 Esc / 那条细条上的「收起」）。 */
  accept: PreviewAction | null;
  /** 「放弃」。`null` 同理。 */
  reject: PreviewAction | null;
}

/** 两种看法。用户说的"显示diff对比 / 显示修改后的效果"。 */
export type previewMode = "diff" | "result";

/* ── 类名。⚠️ 只有一处定义：CSS、两种编辑器的适配层都引这些 ───────────── */

/** 编辑器根节点上的 class：**有预览**时挂上（两种看法共用一个）。 */
export const previewRootClass = "nota-review";
/** 看法 = 对比。 */
export const correctCompareViewModeClass = "nota-review-diff";
/** 看法 = 改后。 */
export const resultViewModeClass = "nota-review-result";

/** 被删掉的那一行（源码）/ 那一块（所见即所得）。 */
export const removeClass = "nota-review-del";
/** 新增的那一串：块级 widget 的外框。 */
export const increaseClass = "nota-review-add";
/** 新增外框里的单行（源码模式一行一个 `div`；所见即所得里是渲染出来的块）。 */
export const increaseLineClass = "nota-review-add-line";

/* ── 差异算法 ─────────────────────────────────────────────────────────── */

/**
 * 一个差异单元。
 *
 * ⚠️ `位` 是**旧文本里的下标**（`同` / `删` 才有），新增的没有位——它靠
 * "**排在它前面最近的那个 `同` / `删`**"定位。这条约定是给两种编辑器共用的：
 * 两边都是"顺着单元表走一遍，记住上一个落点，遇到新增就在那儿插一个 widget"。
 */
export type DifferenceExceptionSingleDollar =
  | { class: "同"; text2: string; position3: number }
  | { class: "删"; text2: string; position3: number }
  | { class: "增"; line3: string[] };

/**
 * 两条文本之间，按**单元**（行、或块）做差异。
 *
 * # 算法
 *
 * 先掐掉公共前缀 / 后缀，中间那块跑最长公共子序列（LCS），再回溯出单元表。
 * 掐头去尾不是优化小把戏：AI 改一处、git 比一版，改动通常只占全文很小一段，
 * 掐完剩下的常常只有几行，这一步把"要不要算得动"这件事基本消掉了。
 *
 * # ⚠️ 有意的降级：单元格上限
 *
 * LCS 要一张 `(旧+1)×(新+1)` 的表。掐头去尾之后还是超大时（比如两份完全
 * 不同的万行文本），这张表能把界面卡住好几秒——而"预览一下改动"不值得这个
 * 代价。所以超过 [`单元格上限`] 就**退化成"整块换掉"**：旧的全算删、新的全算增。
 *
 * 这是**降级不是 bug**，而且降级后的结果仍然是对的（用户看到的确实是"这一大段
 * 全换了"），只是没有逐行对齐那么精细。
 */
export function differenceException(oldValue: string[], newValue: string[]): DifferenceExceptionSingleDollar[] {
  const output2: DifferenceExceptionSingleDollar[] = [];

  // 公共前缀。
  let head2 = 0;
  while (head2 < oldValue.length && head2 < newValue.length && oldValue[head2] === newValue[head2]) head2++;
  // 公共后缀。⚠️ 上界是 `length - 头`：前缀吃掉的部分不能再被后缀吃一次。
  let tail = 0;
  while (
    tail < oldValue.length - head2 &&
    tail < newValue.length - head2 &&
    oldValue[oldValue.length - 1 - tail] === newValue[newValue.length - 1 - tail]
  ) {
    tail++;
  }

  const middleOldValue = oldValue.slice(head2, oldValue.length - tail);
  const middleNewValue = newValue.slice(head2, newValue.length - tail);

  for (let i = 0; i < head2; i++) output2.push({ class: "同", text2: oldValue[i]!, position3: i });

  /** 攒着的新增。⚠️ 连续的增要合成**一串**：一串画一个 widget，不是一行一个。 */
  let pendingIncrease: string[] = [];
  const receiveIncrease = () => {
    if (pendingIncrease.length) {
      output2.push({ class: "增", line3: pendingIncrease });
      pendingIncrease = [];
    }
  };

  if (middleOldValue.length * middleNewValue.length > singleDollarCellLimit) {
    for (let i = 0; i < middleOldValue.length; i++) {
      output2.push({ class: "删", text2: middleOldValue[i]!, position3: head2 + i });
    }
    pendingIncrease = middleNewValue.slice();
    receiveIncrease();
  } else {
    const n = middleOldValue.length;
    const m = middleNewValue.length;
    const width = m + 1;
    // `表[i * 宽 + j]` = `中旧[i..]` 与 `中新[j..]` 的最长公共子序列长度。
    // 从后往前填，回溯才能从前往后走（这样输出天然是正序的）。
    //
    // ⚠️ 下面那些 `!` 不是偷懒：这张表的每个下标都是 `i ∈ [0, n]`、`j ∈ [0, m]`
    // 算出来的，永远在范围内；而 `tsconfig` 开着 `noUncheckedIndexedAccess`，
    // 类型系统认不出这一点（与 `find.ts` / `outline.ts` 里那些 `!` 同一个理由）。
    const table2 = new Int32Array((n + 1) * width);
    for (let i = n - 1; i >= 0; i--) {
      for (let j = m - 1; j >= 0; j--) {
        const above = table2[(i + 1) * width + j]!;
        const right = table2[i * width + (j + 1)]!;
        table2[i * width + j] = middleOldValue[i] === middleNewValue[j] ? above + 1 : Math.max(above, right);
      }
    }

    let i = 0;
    let j = 0;
    while (i < n && j < m) {
      if (middleOldValue[i] === middleNewValue[j]) {
        receiveIncrease(); // ⚠️ 先收再换向：`增` 之后紧跟 `同` 时，widget 得落在那一行之前。
        output2.push({ class: "同", text2: middleOldValue[i]!, position3: head2 + i });
        i++;
        j++;
      } else if (table2[(i + 1) * width + j]! >= table2[i * width + (j + 1)]!) {
        receiveIncrease();
        output2.push({ class: "删", text2: middleOldValue[i]!, position3: head2 + i });
        i++;
      } else {
        pendingIncrease.push(middleNewValue[j]!);
        j++;
      }
    }
    while (i < n) {
      receiveIncrease();
      output2.push({ class: "删", text2: middleOldValue[i]!, position3: head2 + i });
      i++;
    }
    while (j < m) {
      pendingIncrease.push(middleNewValue[j]!);
      j++;
    }
    receiveIncrease();
  }

  for (let i = tail; i > 0; i--) {
    const position3 = oldValue.length - i;
    output2.push({ class: "同", text2: oldValue[position3]!, position3 });
  }
  return output2;
}

/**
 * 跑 LCS 的单元格上限：400 万格（`Int32Array` 一张 16MB）。
 *
 * ⚠️ 定这个数是按"掐头去尾之后还剩多少"想的。整篇 5000 行的两份完全不同的
 * 文本是 2500 万格（100MB）——那不该让它算。而正常情况下掐完只剩下几十行，
 * 离这个上限远得很。
 */
export const singleDollarCellLimit = 4_000_000;

/**
 * 按**行**差异两条 markdown 文本。
 *
 * ⚠️ 行尾的空串要保留（`text.split("\n")` 的原样）：末尾有没有换行、末尾那个
 * 空行，都是**用户文本的一部分**——存盘存的就是这个。这里不做任何"顺手清理"。
 */
export function pressLineDifferenceException(oldValue: string, newValue: string): DifferenceExceptionSingleDollar[] {
  return differenceException(oldValue.split("\n"), newValue.split("\n"));
}

/* ── 共用 DOM ─────────────────────────────────────────────────────────── */

/**
 * 造一个"新增"的块级外框。
 *
 * ⚠️ `行` 是**已经拼好的一串内容行**，不是 markdown 原文——两种模式下这两者
 * 不是一回事：源码模式给的是原文（一行一个），所见即所得给的是**渲染好的
 * 块 DOM**（`review-prose.ts` 那边用 `DOMSerializer` 把新增块画出来）。
 * 所以这个函数只负责"套个框、把内容摆进去"，不认识 markdown。
 */
export function createIncreaseBox(line3: (string | HTMLElement)[]): HTMLElement {
  const box2 = document.createElement("div");
  box2.className = increaseClass;
  // ⚠️ 标记给**编辑器**看：块级 widget 在 CodeMirror 里是垫在文档流里的一个
  // 普通元素，它没有"我是谁"的语义，靠这个属性让 CSS 与将来的调试认出来。
  box2.setAttribute("data-nota-review", "add");
  for (const item5 of line3) {
    const item4 = document.createElement("div");
    item4.className = increaseLineClass;
    if (typeof item5 === "string") item4.textContent = item5;
    else item4.append(item5);
    box2.append(item4);
  }
  return box2;
}

/**
 * 把编辑器根节点上的"看法"class 换掉。**很轻**——不碰文档、不派事务。
 *
 * ⚠️ 两个 class 都要显式开一个关一个（不是只 toggle 一个）：看法是一个二选一
 * 的量，只 toggle 一个的话，"连着切两次到同一个看法"就会漏掉一次。
 */
export function setViewMode2(root: HTMLElement, viewMode: previewMode): void {
  root.classList.add(previewRootClass);
  root.classList.toggle(correctCompareViewModeClass, viewMode === "diff");
  root.classList.toggle(resultViewModeClass, viewMode === "result");
}

/** 摘掉预览那三个 class（收起来时调）。 */
export function removeViewMode(root: HTMLElement): void {
  root.classList.remove(previewRootClass, correctCompareViewModeClass, resultViewModeClass);
}
