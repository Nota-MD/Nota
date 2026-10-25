/**
 * 把一个**正文位置**滚到视野顶部（`docs/07` backlog 第 48 项：点大纲跳过去）。
 *
 * # 为什么不用 ProseMirror 自带的 `tr.scrollIntoView()`
 *
 * 试过，**在这条路上它会静默不滚**。2026-09-25 无头实测（`docs/06` §5.20）：
 * 点大纲里的一节，视图一动不动；**紧接着再点一次同一节，才滚过去**。
 *
 * 根因不在事务上，在 ProseMirror 怎么决定滚到哪：
 * `EditorView.scrollToSelection()` 不是拿事务里的位置去算坐标，而是先读
 * **浏览器当前选区**——`domSelectionRange().focusNode`，那个节点不在编辑器里
 * 就整段跳过。而点侧栏按钮那一刻浏览器焦点已经跑到按钮上，
 * `selectionToDOM()` 开头的 `editorOwnsSelection()` 为假、直接早退，
 * 于是 DOM 选区根本没被写进编辑器，该滚的东西一个都没滚。
 * 连点第二次之所以能滚，是因为上一次的 `view.focus()` 已经替它把 DOM 选区
 * 放回正文里了——**同一个动作第一次不灵第二次灵**，正是这个机理。
 *
 * ⚠️ 所以这里**不看浏览器选区**：直接找那个位置的 DOM 元素，再自己找
 * 最近的可滚祖先去滚。这样和焦点在谁手上无关。
 *
 * # 顺带对齐手感
 *
 * 滚完标题正好落在视野**顶部**，和 VSCode / Typora 点大纲一致。
 * PM 那套只是"滚到能看见为止"，标题会贴在视野底边——跳过去还是要自己再滚。
 *
 * ⚠️ **不用 `元素.scrollIntoView()`**：那个会一路往上滚**所有**可滚祖先，
 * 包括整个 WebView 的文档。Nota 的菜单栏和标签栏是 `position: static`，
 * 会被一起推出窗口。这里**只动最近的那一个**滚动容器。
 *
 * ⚠️ **只有所见即所得那一侧需要它**。源码模式（`source.ts`）用的是 CodeMirror
 * 自己的滚动，那套按行高算，没有这个问题。
 *
 * # 两个入口，两种"滚到哪"
 *
 * - `滚动到位置`：把目标**顶到视野顶部**。用于点大纲跳标题（第 48 项），
 *   和 VSCode / Typora 的手感一致。
 * - `滚动到可见`：**只在该看见而看不见时才滚**。用于查找的命中
 *   （`find.ts::选中`）——查找是连续动作，每敲一个字都重设一次查询，
 *   顶到最上面会让正文跟着每个字乱跳。
 *
 * # 顺带：`找滚动容器` 也搬到了这里（2026-09-25）
 *
 * 它原先在 `writing-modes.ts`（打字机模式要用它找"往哪儿滚"）。上面的
 * 两个入口同样需要它，而两份的判据已经开始漂了——**同一件事两个真相源**，
 * 出问题时在界面上只表现为"有时候不滚"。合并到这一份，`writing-modes.ts`
 * 改为从这儿 import。
 */

import type { EditorView } from "@milkdown/kit/prose/view";

/** 滚到位之后标题离容器顶部留的空隙（px）。纯粹为好看：贴边像被裁掉了一截。 */
const topPartIntervalGap = 8;

/**
 * 从 `节点` 往上找**第一层真正能滚**的祖先。找不到给 `null`（那说明是整页在滚）。
 *
 * ⚠️ **这是全仓唯一一份**。原来的第二份在 `writing-modes.ts`（打字机模式要用），
 * 2026-09-25 合并到这儿——两份的判据已经开始漂了（一份有 1px 容差、一份没有），
 * 而"两边算出不一样的滚动容器"这种毛病在界面上只表现为"有时候不滚"。
 * ⚠️ 容器**不写死选择器**：所见即所得那边是 React 的空 div（`.editor-mount`）
 * 在滚，源码那边是 CodeMirror 自己的 `scrollDOM`——写死一个，另一种模式就会
 * 静默不滚，而"不滚"看起来跟"没做这个功能"一模一样。
 *
 * ⚠️ 两个条件都要：`overflow-y` 是 `auto`/`scroll`（否则 `scrollTop` 写了也白写），
 * **而且**内容确实超出了（`scrollHeight > clientHeight`）——编辑器的滚动外壳
 * 一直挂着 `overflow: auto`，文档短到不用滚的时候写 `scrollTop` 是空操作，
 * 但真去滚它会把这一层也算进去，白折腾一遍。
 * ⚠️ 那个 `+ 1` 是**容差**，不是笔误：亚像素的溢出（`scrollHeight` 比
 * `clientHeight` 大 0.4px 之类）算不出滚动量，当成"能滚"会让调用方白滚一趟。
 */
export function findRollActionContainer(el: HTMLElement | null): HTMLElement | null {
  for (let current = el?.parentElement ?? null; current; current = current.parentElement) {
    if (ableRollQuestion(current)) return current;
  }
  return null;
}

/** 这一层现在真的能滚吗（`overflow-y` 允许 + 内容确实溢出）。 */
function ableRollQuestion(el: HTMLElement): boolean {
  const styleStyle = getComputedStyle(el);
  return /^(auto|scroll)$/.test(styleStyle.overflowY) && el.scrollHeight > el.clientHeight + 1;
}

/**
 * 从编辑区的**挂载点**（`.editor-mount`）找那个真正在滚的元素。
 *
 * ⚠️ 与 [`找滚动容器`] 的区别是**找的方向**：那一条是"从这个元素往上找祖先"
 * （给"把光标滚进视野"用的，那时手里是一个文档节点），而这里是"从挂载点
 * 找它自己或它的内部"（给"记住/恢复滚动位置"用的，那时手里只有挂载点）。
 *
 * ⚠️ 两种模式各滚各的，这一条要把两边都认出来：
 * - **源码模式**：CodeMirror 自己的 `.cm-scroller` 在滚，它**在挂载点里面**
 *   （所以往上找是找不到它的）；
 * - **所见即所得 / 分屏**：`.editor-mount` 自己就是滚动壳。
 *
 * ⚠️ **短文档也给容器、不返回 `null`**：那时它虽然滚不动，但"这份文档的位置
 * 就是顶上"是个有意义的值（见 [`读滚动比例`]）。所以这里第二档只看
 * `overflow-y`，不看溢没溢出——溢出与否是调用方的事。
 */
export function findEditorAreaRollActionContainer(attachLoadPoint: HTMLElement | null): HTMLElement | null {
  if (!attachLoadPoint) return null;
  const sourceShell = attachLoadPoint.querySelector<HTMLElement>(".cm-scroller");
  if (sourceShell && ableRollQuestion(sourceShell)) return sourceShell;
  if (/^(auto|scroll)$/.test(getComputedStyle(attachLoadPoint).overflowY)) return attachLoadPoint;
  const first = attachLoadPoint.firstElementChild as HTMLElement | null;
  return findRollActionContainer(first);
}

/**
 * 现在滚到哪儿了：**比例**（`0.0` = 顶上、`1.0` = 底下）。滚不动时给 `null`。
 *
 * ⚠️ 存的是比例**不是像素**（`docs/07` 第 76 项那格的判据）：换字号、改正文
 * 宽度、开分屏之后，同一个像素偏移指向的是完全不同的地方，而比例在这些
 * 情况下都还对得上。代价是很长的文档里会有小偏差——"大致回到刚才那儿"够用了。
 *
 * ⚠️ **用 `scrollHeight - clientHeight` 当分母**，不是 `scrollHeight`：前者才是
 * "能滚多远"，后者在 `scrollTop = 0` 时永远算不出 `0`，两端就对不上了。
 */
export function readRollActionCompareExample(attachLoadPoint: HTMLElement | null): number | null {
  const container = findEditorAreaRollActionContainer(attachLoadPoint);
  if (!container) return null;
  return readElementRollActionCompareExample(container);
}

/** 直接从**正在滚的那个元素**读比例，不反查容器、不读计算样式。 */
export function readElementRollActionCompareExample(container: {
  scrollHeight: number;
  clientHeight: number;
  scrollTop: number;
}): number {
  const scrollable = container.scrollHeight - container.clientHeight;
  // ⚠️ 可滚为 0 时**给 `0` 而不是 `null`**：这不是"读不出来"，是"这份文档短到
  // 不用滚"，它的比例就是 0。给 `null` 的话调用方会以为这种文档不该记位置。
  if (scrollable <= 0) return 0;
  return container.scrollTop / scrollable;
}

/**
 * 恢复到某个比例。**滚不动时什么都不做**——与 [`滚动到可见`] 同一条口径：
 * 这是"让用户回到刚才那儿"的辅助动作，失败不该抛错、更不该把打开文档带塌。
 *
 * ⚠️ **调用方要在布局完之后再调**：正文刚 `setMarkdown` 进去时图片还没撑开、
 * `scrollHeight` 还是初值，那时滚过去会落在错的地方，而且**看起来像没生效**
 * （滚了一下又被后面的布局拉回去）。`ui/EditorPane.tsx` 那边是隔一帧调的。
 */
export function restoreRestoreRollActionCompareExample(attachLoadPoint: HTMLElement | null, compareExample: number): void {
  const container = findEditorAreaRollActionContainer(attachLoadPoint);
  if (!container) return;
  const scrollable = container.scrollHeight - container.clientHeight;
  if (scrollable <= 0) return;
  const clamp = Math.min(1, Math.max(0, compareExample));
  container.scrollTop = scrollable * clamp;
}

/**
 * 把编辑器里 `pos` 处的那一块滚到视野顶部。
 *
 * ⚠️ 找不到就**什么也不做**（位置越界、元素还没挂上 DOM、没有可滚祖先）——
 * 这是"让用户看得见"的辅助动作，失败时不该抛错，更不该把调用方整个动作带塌。
 */
export function rollActionToPosition(view: EditorView, pos: number): void {
  if (pos < 0 || pos > view.state.doc.content.size) return;
  const { node } = view.domAtPos(pos);
  const element = node.nodeType === Node.ELEMENT_NODE ? (node as HTMLElement) : node.parentElement;
  if (!element) return;
  const container = findRollActionContainer(element);
  if (!container) return;
  const difference = element.getBoundingClientRect().top - container.getBoundingClientRect().top;
  container.scrollTop += difference - topPartIntervalGap;
}

/**
 * 只在 `[from, to]` 那一段**看不见的时候**才滚，滚到刚好能看见为止。
 *
 * ⚠️ 用 ProseMirror 的 `coordsAtPos` 取坐标，不自己去翻 DOM：它给的就是
 * **视口坐标**，和 `getBoundingClientRect()` 同一套，直接减就行。
 * `from` 取 `1` 侧、`to` 取 `-1` 侧，量的是那一段的**外沿**。
 */
export function rollActionToCanSee(view: EditorView, from: number, to: number): void {
  const container = findRollActionContainer(view.dom);
  if (!container) return;
  const above = view.coordsAtPos(from, 1).top;
  const below = view.coordsAtPos(to, -1).bottom;
  const box2 = container.getBoundingClientRect();
  if (above < box2.top + topPartIntervalGap) {
    container.scrollTop -= box2.top + topPartIntervalGap - above;
  } else if (below > box2.bottom - topPartIntervalGap) {
    container.scrollTop += below - box2.bottom + topPartIntervalGap;
  }
}
