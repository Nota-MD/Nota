/**
 * 写作模式：**专注模式**与**打字机模式**（`docs/07` backlog 第 6 项）。
 *
 * # ⚠️ 专注模式只有一半在这里（2026-09-25 改）
 *
 * 这个文件管的是它**作用在正文上的那一半**——压暗非当前段落。另一半是
 * "把外壳收起来"（菜单栏、侧栏、插件栏、标签栏、状态栏），那一条在
 * `App.tsx`（`沉浸 = 专注 ∨ 全屏`）与 `styles/app.css` 里。
 *
 * 两边合起来才是用户按 `F8` 看到的那个东西。改这一半时**别去猜那一半**：
 * 各自的判据都写在各自那里，而这里对"外壳还在不在"一无所知。
 *
 * # 它们为什么放一起
 *
 * 两条都是**视图层的写作辅助**：不改文档、不进撤销栈、不影响存盘的字节。
 * 而且它们共享同一件事——"光标现在在哪儿"。分成两个文件的话，那段
 * "从光标往上找祖先链"的代码要写两遍，两边一定会有一天算出不一样的块。
 *
 * # 专注模式：压暗的是**兄弟**，不是"除当前块以外的所有块"
 *
 * 从光标那一层往上走，每一层把**同层的兄弟**压暗，所在的那一条链一律不压。
 *
 * ⚠️ 这条写法是有讲究的。另一种写法是"把所有顶层块压暗、当前那块加个亮
 * class"——那种写法**嵌套就错了**：`opacity` 不会因为子元素又亮回来而恢复，
 * 父块被压到 0.3，里面的当前块最多也只能是 0.3。按兄弟压暗则天然正确：
 * 被压暗的块**永远不包含光标**。
 *
 * ⚠️ 只压**块级**兄弟（`child.isText` 那些跳过）：段落里的文本节点之间没有
 * "兄弟块"可言，而且 `Decoration.node` 的语义就是"给一个节点加属性"。
 *
 * # 打字机模式：把光标那一行滚到**容器正中**
 *
 * ⚠️ 容器**不写死选择器**（`找滚动容器`，2026-09-25 起住在
 * `scroll-into-view.ts`——那份滚动逻辑要用同一份判据）：所见即所得那边是 React 的空 div
 * （`.editor-mount`）在滚，源码那边是 CodeMirror 自己的 `scrollDOM`。写死
 * 一个，另一种模式就会静默不滚——而"不滚"看起来跟"没做这个功能"一样。
 *
 * ⚠️ 只在**光标动了或者文档变了**的那一次滚（`view.update` 里判的条件）。
 * 每次事务都滚的话，改个窗口大小、点一下鼠标都会把正文拽走，比不滚更烦。
 */

import { Plugin, PluginKey } from "@milkdown/kit/prose/state";
import type { EditorState } from "@milkdown/kit/prose/state";
import type { EditorView } from "@milkdown/kit/prose/view";
import { Decoration, DecorationSet } from "@milkdown/kit/prose/view";
import { $prose } from "@milkdown/kit/utils";
// ⚠️ `找滚动容器` 2026-09-25 搬去了 `scroll-into-view.ts`（那份滚动逻辑同样要用它，
// 两份判据已经开始漂）——这里改成引进来，**别在本地再写一份**。
import { findRollActionContainer } from "./scroll-into-view";

/** 两个开关。**都是"看的时候的状态"**，不进设置、不落盘（同 `FormatBar`）。 */
export interface WritingMode {
  focus: boolean;
  typewriter: boolean;
}

export const defaultWritingModes: WritingMode = { focus: false, typewriter: false };

/** 改模式的元。走事务而不是改一个闭包变量：状态的东西就该在状态里。 */
export const writingModeDollar = "nota-writing-modes";

export const writingModeKey = new PluginKey<WritingMode>("nota-writing-modes");

/** 被压暗的块。⚠️ 颜色/透明度写在 `styles/editor.css` 里，这里只给名字。 */
export const pressDarkClass = "nota-dim";

/**
 * 源码模式那两个名字。⚠️ 源码那边**不能照搬**上面那条"压暗兄弟"的写法：
 * CodeMirror 里的内容是**平的行**（一行一个 `.cm-line`），没有块级父子，
 * 所以那边改成"根节点挂一个 class、当前行挂一个 class"，压暗交给 CSS 的
 * `:not()`——装饰仍然只有**一颗**（当前行），不随文档长度增长。
 */
export const dedicatedNoteClass = "nota-focus";
export const brightLineClass = "nota-focus-on";

/* ── 两个编辑器共用的 DOM 小工具 ───────────────────────────────────────── */

/**
 * 把一段纵向区间（视口坐标）滚到容器的**正中**。
 *
 * ⚠️ 偏差小于 1px 就不动：滚动本身会触发一次重排，抖来抖去会让打字有明显的
 * 迟滞感，而 1px 的偏差人眼看不出来。
 */
export function rollToCorrectMiddle(container: HTMLElement | null, above: number, below: number): void {
  if (!container) {
    // 整页在滚（没有可滚的祖先）。
    const biasDifference = (above + below) / 2 - window.innerHeight / 2;
    if (Math.abs(biasDifference) >= 1) window.scrollBy(0, biasDifference);
    return;
  }
  const box2 = container.getBoundingClientRect();
  const biasDifference = (above + below) / 2 - (box2.top + box2.height / 2);
  if (Math.abs(biasDifference) < 1) return;
  container.scrollTop += biasDifference;
}

/* ── 装饰 ──────────────────────────────────────────────────────────────── */

/**
 * 算出该压暗哪些块。
 *
 * ⚠️ 判据是 `$from`（选区的**起点**）。跨块选中时"当前块"取起点所在那块——
 * 这是个取舍，不是漏洞：另一种做法（整段选区都不压）在长选区下等于把专注
 * 模式关掉了，而专注模式本来就是给"正在写的那一段"用的。
 */
function computePressDark(state: EditorState): DecorationSet {
  const $from = state.selection.$from;
  const decoration: Decoration[] = [];

  for (let d = $from.depth; d >= 1; d--) {
    const parent = $from.node(d - 1);
    const currentChildBelowMark = $from.index(d - 1);
    // 父节点的第一个子节点的起点。⚠️ 用 `$from.start(d - 1)` 而不是
    // `$from.before(d - 1) + 1`：两者等价，但前者在子节点是叶子时也成立。
    const start4 = $from.start(d - 1);
    parent.forEach((child3, offset, belowMark) => {
      // 只压块级兄弟——理由见文件头。
      if (belowMark === currentChildBelowMark || child3.isText || child3.isInline) return;
      decoration.push(
        Decoration.node(start4 + offset, start4 + offset + child3.nodeSize, { class: pressDarkClass }),
      );
    });
  }

  return DecorationSet.create(state.doc, decoration);
}

/**
 * 专注 + 打字机那一条插件。
 *
 * ⚠️ **和 `find.ts` / `command-state.ts` 一样是只读观察者**：它不改文档，
 * 事务里带的那个元也只改它自己那一格状态。
 */
export function writingModePlugin(initialStart: WritingMode = defaultWritingModes) {
  return $prose(
    () =>
      new Plugin<WritingMode>({
        key: writingModeKey,
        state: {
          init: () => initialStart,
          apply: (tr, prev) => (tr.getMeta(writingModeDollar) as WritingMode | undefined) ?? prev,
        },
        props: {
          decorations(state) {
            const m = writingModeKey.getState(state);
            return m?.focus ? computePressDark(state) : null;
          },
        },
        view: () => ({
          update: (view, prevState) => {
            const current2 = writingModeKey.getState(view.state);
            if (!current2) return;
            const before2 = writingModeKey.getState(prevState);
            // ⚠️ 三种情况要滚：刚打开打字机模式（把当前行摆正）、光标动了、
            // 文档变了（换行/删行都会让当前行挪位置）。
            const wantRoll =
              current2.typewriter &&
              (!before2?.typewriter ||
                view.state.selection.head !== prevState.selection.head ||
                view.state.doc !== prevState.doc);
            if (wantRoll) rollToCurrentLine(view);
            // ⚠️ 恒 `false`：这里只读视图、不改 DOM 结构，说 `true` 会让
            // ProseMirror 白白重读一遍视图（同 `find.ts` 那条）。
            return false;
          },
        }),
      }),
  );
}

/** 把光标那一行滚到正中。⚠️ 用 `coordsAtPos` 量**真实位置**，不猜行高。 */
export function rollToCurrentLine(view: EditorView): void {
  const position3 = view.coordsAtPos(view.state.selection.head);
  rollToCorrectMiddle(findRollActionContainer(view.dom), position3.top, position3.bottom);
}

/** 改模式。走事务，插件那一格状态跟着变，装饰随之重画。 */
export function setWritingMode(view: EditorView, mode2: WritingMode): void {
  view.dispatch(view.state.tr.setMeta(writingModeDollar, mode2));
}
