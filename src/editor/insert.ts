/**
 * 「插进去 / 改结构」这一族命令的**实现**：任务列表、清除格式、表格的行列。
 *
 * # 为什么单开一个文件，而不是塞进 `create.ts`
 *
 * `create.ts` 里那张 `COMMANDS` 表是一行一条的**映射**（命令名 → 一个
 * `callCommand`），读起来是一张清单。而这里这几条做不到一行：它们要么要先
 * 看一眼光标在哪、要么要**一笔事务里改两处**（包一层列表再把列表项标成未勾）。
 * 把这些混进那张清单，读的人就得在"清单"和"算法"之间来回切。
 *
 * ⚠️ 但**入口仍然只有 `create.ts` 一个**：本文件不许被界面层直接调用。
 * 「别处不许自己去摸 `editorViewCtx` 派事务」那条纪律（见 `create.ts` 顶上）
 * 说的是**调用点**，`create.ts` 是那个唯一的调用点，这里是它的下游。
 *
 * # 这一族为什么不能用 `callCommand` 打发
 *
 * `@milkdown/kit` 的现成命令里没有这几条：
 * - **任务列表**：gfm 只给了输入规则（敲 `- [ ] ` 那一下），没有"把当前这段
 *   变成任务项"的命令。而 Typora 的 `Ctrl+Shift+X` 恰恰是**保留原有文字**
 *   地转换，不是插一段新文字进去。
 * - **清除格式**：`clearTextInCurrentBlockCommand` 清的是**文字**，不是标记，
 *   跟 Typora 的「清除样式」不是一回事。
 * - **删表/删行/删列**：gfm 只给了 `deleteSelectedCellsCommand`，它要求选区
 *   是 `CellSelection`（整行整列被选中）。而用户是按菜单点的，光标多半只是
 *   停在某个格子里——用 `prosemirror-tables` 的 `deleteRow` 一族正好对得上
 *   （光标本就在格子里时，它们删的就是**这一行/这一列**）。
 */

import { editorViewCtx } from "@milkdown/kit/core";
import type { Editor } from "@milkdown/kit/core";
import { TextSelection } from "@milkdown/kit/prose/state";
import { deleteColumn, deleteRow, deleteTable } from "@milkdown/kit/prose/tables";

/**
 * 从 `$pos` 往上找第一层名字叫 `name` 的祖先，返回它的**深度**（找不到返回 -1）。
 *
 * ⚠️ 返回深度而不是节点：调用方通常还要 `$pos.before(depth)` 拿位置。
 * `task-list.ts` 里有一份同形的（只找 `list_item`）——两份没有合并，是因为
 * 那边是插件内部的热路径，这边是菜单命令，合并的话得把 `$pos` 的类型也抽出来，
 * 换来的只是少十行。
 */
function 祖先深度($pos: { depth: number; node: (d: number) => { type: { name: string } } }, name: string): number {
  for (let d = $pos.depth; d > 0; d--) {
    if ($pos.node(d).type.name === name) return d;
  }
  return -1;
}

/**
 * 把当前这一段变成**任务列表项**（Typora 的 `Ctrl+Shift+X`）。
 *
 * 两种情况：
 * 1. **光标已经在列表项里** → 只翻 `checked` 属性（`null` 是普通列表项）。
 *    于是同一条命令可以来回切：普通项 → 任务项 → 又切回去。
 * 2. **普通段落** → 包一层 `bullet_list`，**文字一个不动**，再把包出来的那个
 *    列表项标成「未勾」。
 *
 * # 为什么第 2 种不用 `wrapInBulletListCommand`
 *
 * 那条命令改完就派事务了，而我们要在**同一笔**里再改一次属性——分两笔的话
 * 用户按一次 Ctrl+Z 只会退掉"标成未勾"那半步，得到一个"任务列表里有个普通
 * 列表项"的中间态。
 *
 * # `attrs.checked` 与节点类型的来源
 *
 * 类型一律从 `state.schema` **现取**（`state.schema.nodes.list_item`），
 * 不能用 `preset-commonmark` 导出的那个常量：gfm 的
 * `extendListItemSchemaForTask` 造的是**另一个**同名节点对象，拿旧的那个去
 * `canReplaceWith` 会被拒（`task-list.ts` 顶上记过这条坑）。
 */
export function 转成任务列表(editor: Editor): void {
  editor.action((ctx) => {
    const view = ctx.get(editorViewCtx);
    const { state } = view;
    const { $from } = state.selection;

    // ── 情况 1：已经在列表项里 ──────────────────────────────────────────
    const itemDepth = 祖先深度($from, "list_item");
    if (itemDepth > 0) {
      const item = $from.node(itemDepth);
      view.dispatch(
        state.tr.setNodeMarkup($from.before(itemDepth), undefined, {
          ...item.attrs,
          // `null` = 普通列表项。切过去给 `false`（未勾），切回来给 `null`。
          checked: item.attrs.checked == null ? false : null,
        }),
      );
      return;
    }

    // ── 情况 2：普通段落 → 裹一层无序列表 ───────────────────────────────
    // ⚠️ 只处理**顶层块**（`depth === 1`）。跨多段选择时 Typora 会一段段都转，
    // 这里没做——`$from` 只告诉我们光标在哪一段，剩余那几段要按 range 扫，
    // 而"选区跨了好几段"和"选区在表格单元格里"这些情况各有各的边界。
    // 如实只做当前这一段，比做一半错一半强。
    const blockDepth = 1;
    const block = $from.node(blockDepth);
    const bulletListType = state.schema.nodes.bullet_list;
    const listItemType = state.schema.nodes.list_item;
    if (!block || !bulletListType || !listItemType) return;

    const before = $from.before(blockDepth);
    const after = $from.after(blockDepth);
    const item = listItemType.create({ checked: false }, block);
    const list = bulletListType.create(null, item);

    const tr = state.tr.replaceWith(before, after, list);
    // ⚠️ **用 mapping 翻译光标**，不要自己算偏移：段落被裹进"列表 → 项 →
    // 段落"之后，中间多出来的那几个位置随结构而变，`map` 是唯一说得清的做法。
    tr.setSelection(TextSelection.near(tr.doc.resolve(tr.mapping.map($from.pos))));
    view.dispatch(tr.scrollIntoView());
  });
}

/**
 * 清除选区里的**行内标记**（粗体、斜体、行内代码、删除线、链接）。
 *
 * ⚠️ 只清标记，**不动文字**——Typora 的「清除样式」也是这个语义。
 * 光标是空的（没有选中任何东西）时什么都不做：那时光标的位置不代表"要清哪一段"，
 * 顺手清掉整段更容易被人当成误操作。
 */
export function 清除格式(editor: Editor): void {
  editor.action((ctx) => {
    const view = ctx.get(editorViewCtx);
    const { state } = view;
    const { from, to, empty } = state.selection;
    if (empty) return;
    view.dispatch(state.tr.removeMark(from, to).scrollIntoView());
  });
}

/**
 * 表格三删。光标停在某个格子里时删的就是**那一行 / 那一列 / 整张表**。
 *
 * ⚠️ 这三条用 `prosemirror-tables` 的裸函数，不走 `callCommand`：
 * gfm 包出来的那条 `deleteSelectedCellsCommand` 要求选区是 `CellSelection`
 * （整行整列被选中），而从菜单点下来时光标就是个光标。裸函数正好是
 * "按选区覆盖到的行列来删"，光标在格子里 → 删一行/一列，正合意。
 *
 * ⚠️ 传 `view.dispatch` 时要包一层箭头函数：`dispatch` 是视图上的方法，
 * 直接把它当函数传出去 `this` 就丢了（有些实现里它是绑过的，有些不是——
 * 不赌这个）。
 */
export function 表格删行(editor: Editor): void {
  editor.action((ctx) => {
    const view = ctx.get(editorViewCtx);
    deleteRow(view.state, (tr) => view.dispatch(tr));
  });
}

export function 表格删列(editor: Editor): void {
  editor.action((ctx) => {
    const view = ctx.get(editorViewCtx);
    deleteColumn(view.state, (tr) => view.dispatch(tr));
  });
}

export function 表格删表(editor: Editor): void {
  editor.action((ctx) => {
    const view = ctx.get(editorViewCtx);
    deleteTable(view.state, (tr) => view.dispatch(tr));
  });
}
