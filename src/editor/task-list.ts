/**
 * 任务列表的复选框：`- [x] 做完了` 要真的画出一个能点的方框。
 *
 * # 先纠正一条记错的根因
 *
 * `docs/07` backlog 第 36 项原本写的根因是"Milkdown **没给** `list_item` 写带
 * `checked` 的 `toDOM`，于是 DOM 里只剩一个光板 `<li>`，CSS 压根没有钩子可挂"。
 *
 * ⚠️ **那是错的**，已按源码改正：`@milkdown/preset-gfm` 的
 * `extendListItemSchemaForTask` 里明明有一句
 * `if (baseSchema.toDOM && node.attrs.checked == null) return baseSchema.toDOM(node);`
 * 跟着一个输出 `data-item-type: "task"` + `data-checked` 的 `toDOM`，
 * 而且那个 `$node` 就在 `gfm` 的 `schema` 数组里、`create.ts` 也确实 `.use(gfm)` 了。
 * 也就是说 **DOM 钩子一直都有**，缺的两样是：
 *
 * 1. **一份 CSS 都没有**——所以那个 `<li>` 画出来跟普通列表项一模一样；
 * 2. **点它不会勾上**——`preset-gfm` 只给了输入规则（敲 `[x] ` 那一下），
 *    没有任何点击处理。
 *
 * 记这一笔是因为它和本仓反复出现的那个病是同一个：**"代码里有没有那块逻辑"
 * 和"最后一公里接没接"是两件事**。这次错在反过来——先入为主地认定
 * "库没给"，于是没去读它的源码。
 *
 * # 为什么勾选要自己写
 *
 * `checked` 是 `list_item` 的一个 attr（不是 mark），所以改它就是
 * `setNodeMarkup` 一句。真正要小心的是**命中判定**：复选框是伪元素画的，
 * 它在 li 的**盒子外面**（左外侧的装订线里），于是点击的 `event.target`
 * 是 li 的**祖先**（`ul` 或 `.ProseMirror`），`closest("li")` 抓不到。
 * 所以下面按**几何**判：先量出每一条任务项的矩形，再看这一击落没落在
 * 它左边那条装订线里。装订线宽度**只写在 CSS 里**（`--task-check-gutter`），
 * 这里读回同一个变量——两个文件里的同一个数最容易改漏一个。
 */

import { $prose } from "@milkdown/kit/utils";
import { Plugin, PluginKey } from "@milkdown/kit/prose/state";
import type { Transaction } from "@milkdown/kit/prose/state";
import { splitListItem } from "@milkdown/kit/prose/schema-list";
import type { EditorView } from "@milkdown/kit/prose/view";

/** 装订线宽度的兜底值。CSS 变量读不出来时才用它。 */
const GUTTER_FALLBACK = 22;

/** 任务项的 DOM 选择器。与 `preset-gfm` 的 `toDOM` 输出对齐。 */
const TASK_ITEM_SELECTOR = 'li[data-item-type="task"]';

/**
 * 读 CSS 里那一格装订线宽度。
 *
 * ⚠️ 读的是**编辑器根元素**上的计算值——变量定义在 `.ProseMirror` 那一条规则里。
 */
function gutterWidth(view: EditorView): number {
  const raw = window.getComputedStyle(view.dom).getPropertyValue("--task-check-gutter");
  const n = Number.parseFloat(raw);
  return Number.isFinite(n) ? n : GUTTER_FALLBACK;
}

/**
 * 把这一条任务项的勾选状态翻过来。
 *
 * 位置要从 DOM 找到文档：`posAtDOM` 给的落点**在 li 内部**（多半已经进了第一段），
 * 所以要往上退到 `list_item` 那一层再取 `before(depth)`。直接拿 `posAtDOM` 的
 * 返回值去 `nodeAt` 会在"光标已进段落"时拿到段落而不是列表项。
 */
function toggleTaskItem(view: EditorView, li: HTMLElement): boolean {
  const $pos = view.state.doc.resolve(view.posAtDOM(li, 0));

  let depth = $pos.depth;
  while (depth > 0 && $pos.node(depth).type.name !== "list_item") depth--;
  if (depth === 0) return false;

  const node = $pos.node(depth);
  if (node.attrs.checked == null) return false; // 普通列表项，不是任务项

  const nodePos = $pos.before(depth);
  view.dispatch(
    view.state.tr.setNodeMarkup(nodePos, undefined, {
      ...node.attrs,
      checked: !node.attrs.checked,
    }),
  );
  return true;
}

/**
 * 找出光标所在的那一层 `list_item`。找不到返回 -1。
 *
 * 抽出来是因为下面两处都要它（回车那条、和将来别的地方）。
 */
function listItemDepthAt(pos: { depth: number; node: (d: number) => { type: { name: string } } }): number {
  for (let d = pos.depth; d > 0; d--) {
    if (pos.node(d).type.name === "list_item") return d;
  }
  return -1;
}

/**
 * 任务项里按回车：切出下一项，**并把它设成「未勾」**。
 *
 * # 为什么非要拦这一下
 *
 * `prosemirror-schema-list` 的 `splitListItem` 在 `itemAttrs` 缺省时给 `tr.split`
 * 的第一项传 `null`（源码 `dist/index.js:180`，`types = [itemAttrs ? {...} : null, ...]`），
 * 意思是"**新项的属性照抄被切的那一项**"。这在普通列表项上是对的（没属性可抄），
 * 在任务项上就成了：`- [x] 做完了` 一回车，**新那一项也是勾上的**。
 * Typora 的行为是给一个**没勾**的新项。
 *
 * # 为什么自己调 `splitListItem` 而不是"先让别处切完再改"
 *
 * 后者要挑一个时机——`appendTransaction` 里分不清"这一项是刚切出来的"还是
 * "用户刚勾上的空项"，`handleDOMEvents` 又已经太晚（DOM 事件先于 PM 处理）。
 * 这里是**在键盘事件里自己把这一刀切完**，切出来的事务还没派发，顺手改掉属性
 * 再一次性交出去——只有一笔事务，只有一个撤销步。
 *
 * ⚠️ 类型要用 `$from.node(depth).type` 现取，**不能用 `listItemSchema` 那个常量**：
 * `preset-gfm` 的 `extendListItemSchemaForTask` 是 `extendSchema` 出来的**另一个**
 * 节点对象（同名 `list_item`），而 `splitListItem` 第一句就是
 * `if (grandParent.type != itemType) return false`——类型对象对不上就直接不干活。
 */
function enterInTaskItem(view: EditorView): boolean {
  const { state } = view;
  const { $from, empty } = state.selection;
  if (!empty) return false;

  const depth = listItemDepthAt($from);
  if (depth < 0) return false;

  const item = $from.node(depth);
  if (item.attrs.checked == null) return false; // 普通列表项：交给原有的绑定

  // ⚠️ 用盒子接着，别用 `let tr: Transaction | null = null`：在闭包里赋值之后
  // TS 会把外面的 `tr` 收窄成 `null`，于是后面每一句都报 "possibly null"。
  const box: { tr: Transaction | null } = { tr: null };
  if (!splitListItem(item.type)(state, (t) => (box.tr = t))) return false;

  const split = box.tr;
  if (!split) return false;

  const $sel = split.selection.$from;
  const newDepth = listItemDepthAt($sel);
  if (newDepth > 0) {
    const fresh = $sel.node(newDepth);
    // 只在确实是任务项、且照抄成了真的时候改。照抄成 `null`（空项那条分支走
    // `createAndFill()`，拿的是 schema 默认值）就不用管。
    if (fresh.attrs.checked === true) {
      split.setNodeMarkup($sel.before(newDepth), undefined, {
        ...fresh.attrs,
        checked: false,
      });
    }
  }

  view.dispatch(split);
  return true;
}

/**
 * 插件本体。
 *
 * 挂了两处：
 * - `handleDOMEvents.mousedown`：点方框翻勾。挂在 `mousedown` 上而不是 `click` 上——
 *   `mousedown` 返回 `true` 会把这一击拦下来，光标**不会**跟着跳进列表项，
 *   点方框就该只是点方框。换成 `click` 的话光标已经先动过了。
 * - `handleKeyDown` 的 Enter：见 `enterInTaskItem`。
 */
export const taskList = $prose(
  () =>
    new Plugin({
      key: new PluginKey("nota-task-list"),
      props: {
        handleKeyDown: (view, event) => {
          // 只认**光秃秃的**回车。Shift+Enter（软换行）、Ctrl/Alt+Enter
          // 各有各的绑定，别抢。
          if (event.key !== "Enter" || event.shiftKey || event.ctrlKey || event.metaKey || event.altKey) {
            return false;
          }
          return enterInTaskItem(view);
        },

        handleDOMEvents: {
          mousedown: (view, event) => {
            // 只认左键、不认带修饰键的（那些是选区的活）。
            if (event.button !== 0 || event.ctrlKey || event.metaKey || event.shiftKey) {
              return false;
            }

            const gutter = gutterWidth(view);
            const items = view.dom.querySelectorAll<HTMLElement>(TASK_ITEM_SELECTOR);

            for (const li of Array.from(items)) {
              const rect = li.getBoundingClientRect();
              const inRow = event.clientY >= rect.top && event.clientY <= rect.bottom;
              const inGutter =
                event.clientX < rect.left && event.clientX >= rect.left - gutter;
              if (inRow && inGutter) {
                event.preventDefault();
                return toggleTaskItem(view, li);
              }
            }
            return false;
          },
        },
      },
    }),
);
