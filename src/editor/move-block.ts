/**
 * 「上移 / 下移」那两颗键（`Alt+↑` / `Alt+↓`，2026-10-07 接上）。
 *
 * # 搬的是什么
 *
 * 光标所在那**一块**，在它的兄弟之间换一个位置。分两层看：
 *
 * | 光标在哪儿 | 搬的是 |
 * |---|---|
 * | 列表项里 | **那一个列表项**（在它所属的列表里换位） |
 * | 别处 | **顶层块**（整段/整标题/整张表/整个代码块/整个引用/整个列表） |
 *
 * ⚠️ 列表那一格是**特意**的：列表项是最常上下调的东西，而"在列表里按 `Alt+↑`
 * 结果**整个列表**跳走了"是那种用户想不明白的错（屏幕上明明只动了一行字）。
 * 找的是**最深**的那一层列表——嵌套列表里搬的自然是光标所在的那一层。
 *
 * # ⚠️ 表格里**什么都不做**
 *
 * `Alt+↑` 在表格里的常见语义是"把**这一行**往上挪一行"。本仓没做行/列的挪动
 * （那是另一件事：要认单元格、要重排对齐那一行），这时**照做"整个表格上移"
 * 才是最坏的**：用户想挪一行，跳走的是整张表。所以认了 `table` 就返回——菜单
 * 里那一条点了没反应，与"这一格没做"如实对上（`docs/07` 记着这笔账）。
 *
 * # 两头到边就是**不动**（不是绕回去、也不报错）
 *
 * 第一块再往上、最后一块再往下 → 给 `null`，调用方什么都不派。⚠️ 不做"绕到
 * 另一头"：那会让"按住 `Alt+↑` 连按几下"把内容送到文档的另一端，而用户看不出来
 * 是哪一下越过去的。⚠️ 列表项也走同一条：第一项往上不会**掉出列表**变成普通
 * 段落——那是"提升层级"的动作，不是"上移"。
 *
 * # 三条路，一份实现
 *
 * | 路 | 入口 | 到实现的桥 |
 * |---|---|---|
 * | 菜单 / 斜杠 | `command-table.ts` 的 `moveLineUp` / `moveLineDown` | {@link 移动块} |
 * | 这颗键（所见即所得） | {@link 建移动键位} 的 `handleKeyDown` | {@link 移动块视图} |
 * | 这颗键（源码模式） | `source-commands.ts` 的 `applyCommand`（调 CodeMirror 自己那条） | 见那个文件 |
 *
 * ⚠️ 所见即所得那条键位**必须自己接**（理由写在 {@link 建移动键位} 的注释里：
 * `baseKeymap` 把它绑给了 `joinUp`）。
 *
 * # 为什么分两层（纯算术 ＋ 落地）
 *
 * 与 `select.ts` 同一个理由：本仓没有 jsdom，测试里建不出真的 `EditorView`，
 * 但**算得出来**——{@link 算移动} 只吃一棵 `ProseMirror` 文档和一个位置，
 * `tests/move-block.test.ts` 拿 `Schema` 手搭一棵就能把每条边界钉住。
 */

import { editorViewCtx } from "@milkdown/kit/core";
import type { Editor } from "@milkdown/kit/core";
import type { Node as PMNode } from "@milkdown/kit/prose/model";
import { NodeSelection, Plugin, PluginKey, TextSelection } from "@milkdown/kit/prose/state";
import type { EditorView } from "@milkdown/kit/prose/view";
import { $prose } from "@milkdown/kit/utils";

/** 光标落在列表里的那种容器（见文件头那张表）。 */
const columnTableName = new Set(["bullet_list", "ordered_list"]);

/**
 * 一次上移/下移要做的**全部算术**——调用方照着它派一笔事务即可。
 *
 * ⚠️ 三个坐标属于**两个不同的时刻**：{@link 删} 是原文档坐标（那个时刻它也
 * 就是"当前文档"），而 {@link 插到} 与 {@link 光标} 是**删掉之后**的坐标。
 * 混起来用的症状是"往下移一格之后，内容落到了隔着一块的地方"——不报错，只是
 * 位置不对。⚠️ 一笔事务里 `delete` 之后再 `insert`，第二个位置的基准就是
 * **删完之后**那棵树（`Transform` 的既有语义），所以这里算出来的正是它要的。
 */
export interface movePlan {
  /** 把哪一段从原地删掉（原文档坐标）。 */
  remove: { from: number; to: number };
  /** 插到哪里（**删掉之后**的坐标）。 */
  insertTo: number;
  /** 搬完之后光标落在哪（**删＋插之后**的坐标）。 */
  cursor: number;
  /** 要搬走的那一块本身。 */
  block: PMNode;
}

function clamp(value2: number, below: number, above: number): number {
  return Math.max(below, Math.min(value2, above));
}

/**
 * 容器里第 `序号` 个孩子**在文档里的起点**（`内容起` ＋ 前面各孩子的尺寸）。
 *
 * ⚠️ `内容起` 由调用方算，因为**只有 `doc` 没有那个"开括号"**：节点容器的内容
 * 从它自己的起点 **＋1** 开始（那一格是开括号），而顶层块从位置 **0** 就开始了。
 * 差这一格的话顶层块搬家会**整体错一格**——删到半段、插进去也错位，而且不报错。
 */
function childStart(contentStart2: number, container: PMNode, index: number): number {
  let start4 = contentStart2;
  for (let i = 0; i < index; i++) start4 += container.child(i).nodeSize;
  return start4;
}

/**
 * 算这一次移动（纯函数，见文件头）。做不了（在表格里、到边了、位置不合法）给 `null`。
 *
 * `位置` 取的是**选区的起点**（`state.selection.from`）：跨多块选中时搬的是
 * 起点那一段，剩下的原样留着——如实记在这儿，别指望它"搬一整片"。
 */
export function computeMoveAction(doc: PMNode, position2: number, direction: -1 | 1): movePlan | null {
  const $pos = doc.resolve(clamp(position2, 0, doc.content.size));

  // ── 表格里不做（文件头那段）。⚠️ 只看祖先链，不看选中了什么：整张表被
  // 选中时（`NodeSelection`）光标落在表**外面**（深度 0），那种该照搬不误。
  for (let d = $pos.depth; d > 0; d--) {
    if ($pos.node(d).type.name === "table") return null;
  }

  // ── 挑容器：光标在列表里就搬列表项，否则搬顶层块。
  let container: PMNode = doc;
  let containerStart = 0;
  let layer = 0;
  for (let d = $pos.depth; d > 0; d--) {
    if (columnTableName.has($pos.node(d).type.name)) {
      container = $pos.node(d);
      containerStart = $pos.before(d);
      layer = d;
      break;
    }
  }
  const index = $pos.index(layer);
  const neighborNumber = index + direction;
  if (neighborNumber < 0 || neighborNumber >= container.childCount) return null;

  const block = container.child(index);
  const neighbor = container.child(neighborNumber);
  // ⚠️ 容器是 `doc` 时孩子从位置 0 开始，别的容器要从它自己 +1 开始（见 孩子起点）。
  const blockStart = childStart(layer === 0 ? 0 : containerStart + 1, container, index);
  // ⚠️ 两头的插点都跟着**邻**的身高走，不是"块自己"：事务里是**先删后插**，
  // 而 `插到` 是删完之后那棵树里的坐标。往下搬时邻往前挪了整整一个块的身位
  // （腾出来的正好是被删掉的那一块），所以"邻的后面"＝ `块起点 + 邻.nodeSize`；
  // 往上搬时邻一点没动过，插点就是它自己的起点。写成 `块.nodeSize` 的症状是
  // **两块不等高时内容落进邻块里面**（段落翻过一个代码块那种）——不报错，只是
  // 并进去了。
  const insertTo = direction < 0 ? blockStart - neighbor.nodeSize : blockStart + neighbor.nodeSize;
  // 光标在块**里**的相对位置（块自己那个开括号占一个位置，所以减 1）。
  const blockInside = clamp(position2 - blockStart - 1, 0, block.content.size);

  return {
    remove: { from: blockStart, to: blockStart + block.nodeSize },
    insertTo,
    cursor: insertTo + 1 + blockInside,
    block,
  };
}

/**
 * 落地的那个动作：算一次、派一笔事务。给 `true` 表示**这一颗键归我们了**
 * （包括"到边了没动"和"表格里不做"——见 {@link 建移动键位}）。
 *
 * ⚠️ 只派**一笔**事务：分两笔的话按一次 `Ctrl+Z` 只会退掉半程（删了没插回去，
 * 或者插重了），那是这条命令最不该有的后果——同 `insert.ts` 的 `转成任务列表`
 * 那一段。
 */
export function moveBlockView(view: EditorView, direction: -1 | 1): boolean {
  const { state } = view;
  const plan = computeMoveAction(state.doc, state.selection.from, direction);
  if (!plan) return false;
  const tr = state.tr.delete(plan.remove.from, plan.remove.to).insert(plan.insertTo, plan.block);
  // ⚠️ 判据是"**落点**接不接文字光标"，不是"搬的那一块是不是文本块"：列表项、
  // 引用这些**容器块**自己不是文本块，可落点一般正落在它第一个段落里——那里能落
  // 文字光标。按"块是不是文本块"判的话，搬一个列表项会落成 `NodeSelection`
  // （整项被高亮选中），用户接着一敲字**一整项就没了**。
  // ⚠️ 另一头：原子块（分隔线、整张表）的落点压根不接文字，`TextSelection.create`
  // 会当场抛，所以判成 `NodeSelection`（它们本来就只能被"选中"）。
  const DropPoint = tr.doc.resolve(plan.cursor);
  tr.setSelection(
    DropPoint.parent.isTextblock
      ? TextSelection.create(tr.doc, plan.cursor)
      : NodeSelection.create(tr.doc, plan.insertTo),
  );
  // 搬出去的那一块可能已经在屏幕外面了（长文档里连按几下）——跟着它滚。
  tr.scrollIntoView();
  view.dispatch(tr);
  return true;
}

/** 菜单 / 斜杠菜单那条路（`command-table.ts` 那张表的下游）。 */
export function moveBlock(editor: Editor, direction: -1 | 1): void {
  editor.action((ctx) => {
    moveBlockView(ctx.get(editorViewCtx), direction);
  });
}

/**
 * `Alt+↑` / `Alt+↓` 的键位插件（所见即所得那一侧）。
 *
 * # ⚠️ 为什么必须自己接这一颗键，而不是等 `ui/useMenus.ts` 那条全局 accel
 *
 * 因为 **ProseMirror 的 `baseKeymap` 已经绑了这两颗**（`Alt-ArrowUp` → `joinUp`、
 * `Alt-ArrowDown` → `joinDown`，由 `@milkdown/core` 的 `keymap` 内部插件
 * `addBaseKeymap()` 装进来）。它会**先**跑、跑完调 `preventDefault()`，
 * 于是 `ui/useMenus.ts` 那条 `if (e.defaultPrevented) return;`（BUG-49 的正主）
 * 把整颗键放行——用户按 `Alt+↑` 看到的不是"没反应"，而是**这一段和上一段被并
 * 成了一段**（`joinUp` 干的事），比没反应难查十倍。这与 `Ctrl+U` 那次
 * （BUG-58）是同一族：**编辑器抢先处理 + 全局那条被放行**。
 *
 * # 为什么是 `handleKeyDown` 而不是 `.use()` 链里的键位表
 *
 * 同 `table-input.ts` 文件头那条：`handleKeyDown` 在 props 顺序上天然排在合并
 * 键位表**前面**（`editor-state.ts` 的 `[...prosePlugins, …, createKeymap(…)]`，
 * 而 `someProp` 取第一个说了算的），不必去和 `baseKeymap` 抢 priority。
 *
 * # ⚠️ 两条"认下但不动"的分支
 *
 * - **`event.defaultPrevented`**：说明这棵文档**里面**已经有人处理了——代码块
 *   里那颗 `CodeMirror` 有自己的 `Alt+↑`（`code-block-cm.ts` 没摘它），它先跑、
 *   已经 preventDefault 了。这时若返回 `false`，事件会继续往合并键位表走，
 *   `joinUp` 又会跑一遍（把两段代码块并起来那种）。所以**认下、什么都不做**。
 * - **到边了 / 表格里**（{@link 算移动} 给 `null`）：同样认下。放行的话
 *   `joinUp` 就会接管——用户在第一段按 `Alt+↑`，看到的会是两段被合并。
 *
 * ⚠️ 组字期间（`view.composing`）一概不碰：中文输入法在组字时会用方向键挑候选，
 * 那时候动文档是抢键盘（`auto-pair.ts` / `table-tab.ts` 同一条纪律）。
 */
export function createMoveKeymap(): Plugin {
  return new Plugin({
    key: new PluginKey("nota-move-block"),
    props: {
      handleKeyDown: (view, event) => {
        if (event.key !== "ArrowUp" && event.key !== "ArrowDown") return false;
        if (!event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return false;
        if (view.composing) return false;
        if (event.defaultPrevented) return true; // 代码块里那颗 CodeMirror 已处理，见上
        moveBlockView(view, event.key === "ArrowUp" ? -1 : 1);
        return true;
      },
    },
  });
}

/** {@link 建移动键位} 的 `$prose` 外壳——`.use()` 收的是这一种（`assemble.ts`）。 */
export const moveKeymap = $prose(() => createMoveKeymap());
