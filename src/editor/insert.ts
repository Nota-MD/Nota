/**
 * 「插进去 / 改结构」这一族命令的**实现**：任务列表、清除格式、表格的行列、公式块。
 *
 * # 为什么单开一个文件，而不是塞进 `create.ts`
 *
 * `command-table.ts` 里那张 `COMMANDS` 表是一行一条的**映射**（命令名 → 一个
 * `callCommand`），读起来是一张清单。而这里这几条做不到一行：它们要么要先
 * 看一眼光标在哪、要么要**一笔事务里改两处**（包一层列表再把列表项标成未勾）。
 * 把这些混进那张清单，读的人就得在"清单"和"算法"之间来回切。
 *
 * ⚠️ 但**入口仍然只有一个**：本文件不许被界面层直接调用。「别处不许直接摸
 * `editorViewCtx` 派事务」那条纪律（见 `create.ts` 顶上）说的是**调用点**，
 * 那边唯一的调用点就是 `command-table.ts` 那张表（它 2026-09-28 从
 * `create.ts` 搬了出去），这里是它的下游。
 *
 * # 这一族为什么不能用 `callCommand` 打发
 *
 * `@milkdown/kit` 的现成命令里没有这几条：
 * - **任务列表**：gfm 只给了输入规则（敲 `- [ ] ` 那一下），没有"把当前这段
 *   变成任务项"的命令。本仓要的语义是 `Ctrl+Shift+X` 那样的**保留原有文字**
 *   地转换，不是插一段新文字进去。
 * - **清除格式**：`clearTextInCurrentBlockCommand` 清的是**文字**，不是标记，
 *   与「清除样式」要的语义不是一回事。
 * - **删表/删行/删列**：gfm 只给了 `deleteSelectedCellsCommand`，它要求选区
 *   是 `CellSelection`（整行整列被选中）。而用户是按菜单点的，光标多半只是
 *   停在某个格子里——用 `prosemirror-tables` 的 `deleteRow` 一族正好对得上
 *   （光标本就在格子里时，它们删的就是**这一行/这一列**）。
 * - **公式块**：`plugin-math` 只给了输入规则（`$$` + 空格），没有"插一个空
 *   公式块"的命令。它渲染、编辑那一整套都是现成的，缺的就这一条。
 */

import { editorViewCtx, parserCtx, serializerCtx } from "@milkdown/kit/core";
import type { Editor } from "@milkdown/kit/core";
import type { Node as PMNode } from "@milkdown/kit/prose/model";
import { NodeSelection, TextSelection } from "@milkdown/kit/prose/state";
import type { EditorState, Transaction } from "@milkdown/kit/prose/state";
import { deleteColumn, deleteRow, deleteTable } from "@milkdown/kit/prose/tables";

import { blockHtmlNodeName } from "./html-block";
import { tocEndMarker, tocStartMarker, computeItemRecordBlock } from "./toc";

/**
 * 从 `$pos` 往上找第一层名字叫 `name` 的祖先，返回它的**深度**（找不到返回 -1）。
 *
 * ⚠️ 返回深度而不是节点：调用方通常还要 `$pos.before(depth)` 拿位置。
 * `task-list.ts` 里有一份同形的（只找 `list_item`）——两份没有合并，是因为
 * 那边是插件内部的热路径，这边是菜单命令，合并的话得把 `$pos` 的类型也抽出来，
 * 换来的只是少十行。
 */
function ancestorFirstDarkDegree($pos: { depth: number; node: (d: number) => { type: { name: string } } }, name: string): number {
  for (let d = $pos.depth; d > 0; d--) {
    if ($pos.node(d).type.name === name) return d;
  }
  return -1;
}

/**
 * 把当前这一段变成**任务列表项**。
 *
 * 两种情况：
 * 1. **光标已经在列表项里** → 只翻 `checked` 属性（`null` 是普通列表项）。
 *    于是同一条命令可以来回切：普通项 → 任务项 → 又切回去。
 * 2. **普通段落** → 包一层 `bullet_list`，**文字一个不动**，再把包出来的那个
 *    列表项标成「未勾」。
 *
 * # 为什么第 2 种不用 `wrapInBulletListCommand`
 *
 * 那条命令改完就派事务了，而本条要在**同一笔**里再改一次属性——分两笔的话
 * 用户按一次 Ctrl+Z 只会退掉"标成未勾"那半步，得到一个"任务列表里有个普通
 * 列表项"的中间态。
 *
 * # `attrs.checked` 与节点类型的来源
 *
 * 类型一律从 `state.schema` **现取**（`state.schema.nodes.list_item`），
 * 不能用 `preset-commonmark` 导出的那个常量：gfm 的
 * `extendListItemSchemaForTask` 造的是**另一个**同名节点对象，拿旧的那个去
 * `canReplaceWith` 会被拒（`task-list.ts` 顶上记过这一条）。
 */
export function convertBecomeTaskTaskColumnTable(editor: Editor): void {
  editor.action((ctx) => {
    const view = ctx.get(editorViewCtx);
    const { state } = view;
    const { $from } = state.selection;

    // ── 情况 1：已经在列表项里 ──────────────────────────────────────────
    const itemDepth = ancestorFirstDarkDegree($from, "list_item");
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
    // ⚠️ 只处理**顶层块**（`depth === 1`）。跨多段选择本仓不整段转换——`$from`
    // 只给出光标在哪一段，剩余那几段要按 range 扫，
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
 * ⚠️ 只清标记，**不动文字**——「清除样式」也是这个语义。
 * 光标是空的（没有选中任何东西）时什么都不做：那时光标的位置不代表"要清哪一段"，
 * 直接清掉整段更容易被当成误操作。
 */
export function clearRemoveCellStyle(editor: Editor): void {
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
export function deleteTableRow(editor: Editor): void {
  editor.action((ctx) => {
    const view = ctx.get(editorViewCtx);
    deleteRow(view.state, (tr) => view.dispatch(tr));
  });
}

export function deleteTableColumn(editor: Editor): void {
  editor.action((ctx) => {
    const view = ctx.get(editorViewCtx);
    deleteColumn(view.state, (tr) => view.dispatch(tr));
  });
}

export function deleteWholeTable(editor: Editor): void {
  editor.action((ctx) => {
    const view = ctx.get(editorViewCtx);
    deleteTable(view.state, (tr) => view.dispatch(tr));
  });
}

/**
 * 插一个**空公式块**，并把光标落成"整块选中"。
 *
 * # 为什么要有这一条（`docs/07` 第 52 项）
 *
 * `$$` 的解析、渲染、编辑面板**本来都在**（`math-view.ts` + `plugin-math`），
 * 缺的只是"插一个空公式块"这一条命令：`plugin-math` 只给了输入规则，
 * 全仓没有任何地方能凭空建一个 `math_block`。于是菜单里那一项写着快捷键、
 * 按下去却什么都不发生（菜单项是灰的，因为 `App.tsx` 里没有它的处理函数）。
 *
 * # 落的选区为什么是 `NodeSelection`
 *
 * 那是 `math-view.ts` 里"这个公式正在被编辑"的**唯一判据**（见那边的
 * 「编辑态」一节）：整块选中 → 源码框自动打开、焦点进去。所以这条命令
 * 插完必须**顺手把选区挪到新块上**——不然用户看到的是一个空的、点不开的
 * 公式块，还得自己再点一下。
 *
 * ⚠️ 这里**不**走 `setBlockType`（`plugin-math` 的输入规则用的是它）：那条路
 * 会把当前段落里已有的文字**留着当内容**，而 `math_block` 的 markdown 输出
 * 读的是 `attrs.value`、不看内容——于是用户写的那段字**从文件里消失**，
 * 屏幕上却还在。空段落那一路用 `replaceWith` 换掉整块，正是为了避开这个。
 */
export function insertCommonStyleBlock(editor: Editor): void {
  editor.action((ctx) => {
    const view = ctx.get(editorViewCtx);

    // ⚠️ **先聚焦正文，再算位置、再派事务**（2026-09-26 在无头窗口里试出来的）。
    //
    // 原因在 `math-view.ts::同步面板` 那条判据上：`if (要到焦点 && view.hasFocus()) 排聚焦()`
    // ——**只有焦点已经在正文上时**，那块新公式的 NodeView 才会把焦点排进源码框。
    // 而"从菜单点下来"这条路，那一刻 DOM 焦点还在**菜单按钮**上（点击的默认行为
    // 就是聚焦按钮），于是 NodeView 建面板时 `view.hasFocus()` 是假 → 不排聚焦。
    // 面板照样画出来（`面板该开()` 只看装饰），可接着敲的字**进正文不进框**——
    // 用户看到的是一个"打开着却敲不进去"的源码框。
    // 走 `Ctrl+Shift+M` 没有这个毛病（那时焦点本来就在正文里），所以这个坑只在
    // 鼠标这条路上露头，而且看起来像"面板坏了"。
    //
    // ⚠️ **顺序不能反**：`view.focus()` 自己可能派一笔事务（空文档补尾段那类），
    // 先算位置的话算出来的可能是旧文档里的位置。
    view.focus();

    const { state } = view;
    const type = state.schema.nodes.math_block;
    // schema 里没有这个名字（插件被摘掉之类）→ 静默不动。菜单项那时本来
    // 也不该能点到，这里只是不让它炸。
    if (!type) return;

    const { $from } = state.selection;
    // "光标孤零零地待在一个空的顶层段落里"→ 就地变成公式块。
    // ⚠️ 必须限定 `depth === 1`：列表项里那个空段落若也走这一路，
    // `before(1)` 指的是**整个列表**的起点，`replaceWith` 会把整张列表
    // 连内容一起换成公式块。
    const thenPosition =
      $from.depth === 1 && $from.parent.type.name === "paragraph" && $from.parent.content.size === 0;

    const tr = state.tr;
    // 插在**当前所在的那个顶层块之后**（不是"光标之后"）：光标在段中间时，
    // 公式块不该把那句话劈成两半。
    const position2 = thenPosition ? $from.before(1) : $from.after(1);
    const commonStyle = type.create({ value: "" });
    if (thenPosition) tr.replaceWith($from.before(1), $from.after(1), commonStyle);
    else tr.insert(position2, commonStyle);

    tr.setSelection(NodeSelection.create(tr.doc, position2));
    view.dispatch(tr.scrollIntoView());
  });
}

/**
 * 在文档树里找现有的那份目录，返回**要换掉的那一段**的起止位置。
 *
 * 判据是**两头那对注释节点**（`toc.ts` 顶上解释过为什么用注释夹）：
 * 从头扫顶层节点，先撞见「开始标记」、再撞见它后面的「结束标记」，中间那一段
 * 就是目录。找不到（还没有，或者用户删掉了一头）返回 `null` —— 那时调用方
 * 走"插入"，而不是去猜那半份该补在哪。
 *
 * ⚠️ **只认顶层**（`doc.forEach` 走的就是顶层）：`blockquote` 里嵌一份目录的
 * 情形本仓不支持。放宽到 `descendants` 的话，"更新"会去改引用块里面的东西，
 * 而用户点的菜单项在引用块外面——两件事对不上。真需要时再说。
 *
 * ⚠️ 返回的 `起`/`止` 是**位置**不是下标：`起` 是开始标记那颗节点的**末尾**
 * （列表该从这儿起），`止` 是结束标记那颗节点的**开头**。两者相等（空目录，
 * 用户把中间删光了）是合法情形，`replaceWith(起, 止, …)` 在那时就是插入。
 */
function findItemRecordParagraph(doc: PMNode): { start5: number; end2: number } | null {
  let start5 = -1;
  let end2 = -1;
  doc.forEach((node, offset) => {
    if (end2 !== -1 || node.type.name !== blockHtmlNodeName) return;
    const value2 = (node.attrs as { value?: unknown }).value;
    if (typeof value2 !== "string") return;
    const clean = value2.trim();
    if (clean === tocStartMarker && start5 === -1) start5 = offset + node.nodeSize;
    else if (clean === tocEndMarker && start5 !== -1) end2 = offset;
  });
  // ⚠️ `止 < 起` 说明两颗标记的**顺序**反了（用户手工把结尾那条挪到了开头
  // 上面），那不是一份目录。按"没有"处理——这里若硬来，`replaceWith` 会抛。
  if (start5 === -1 || end2 === -1 || end2 < start5) return null;
  return { start5, end2 };
}

/**
 * 「内容目录」的**全部动作**（纯粹从 state 算一个事务，不碰 DOM）。
 *
 * 两种走法，一条命令：
 * - 文档里**还没有**目录 → 把算好的那一块整段插在**光标所在顶层块之后**
 *   （与 [`插公式块`] 同一条规矩：插在"当前这一块"后面，不是"光标之后"——
 *   光标在段中间时，目录不该把那句话劈成两半）。
 * - 已经**有**了 → 只换掉两头标记之间那段，别处一个字不动。这就是
 *   "再点一次 = 更新"（`toc.ts` 顶上解释了为什么不做自动更新）。
 *
 * `序列化` / `解析` 由调用方从 `ctx` **现取**（`serializerCtx` / `parserCtx`）——
 * 理由与 `review-prose.ts` 那边一字不差：那两样是 Milkdown 在 Init 阶段填进
 * ctx 的，不能在别处提前捕获。
 *
 * 返回 `null` 的三种情形（都**不是错误**，是"这条路走不了"）：
 * 1. 一个标题都没有（`算目录块` 给 `null`）——那时菜单项本来就是灰的；
 * 2. schema 里没有块级 HTML 节点（`html-block` 插件没挂）——标记放不进去；
 * 3. 解析出来的东西不是"标记 ＋ 列表 ＋ 标记"三颗（上游换了写法）——
 *    与其插半份，不如不动。
 */
export function tocTransaction(
  state: EditorState,
  serialize: (node: PMNode) => string,
  parse: (markdown: string) => PMNode,
  strict: boolean,
): Transaction | null {
  const block = computeItemRecordBlock(serialize(state.doc), strict);
  if (block === null) return null;
  if (!state.schema.nodes[blockHtmlNodeName]) return null;

  const newValuedoc = parse(block);
  const newNodes = newValuedoc.content.content;
  // 首尾各一颗标记，中间是列表。少一颗就说明解析出来的形状与预期不符。
  if (newNodes.length < 3) return null;
  const newValueMiddleParagraph = newValuedoc.content.cut(newNodes[0]!.nodeSize, newValuedoc.content.size - newNodes[newNodes.length - 1]!.nodeSize);

  const paragraph2 = findItemRecordParagraph(state.doc);
  const tr = state.tr;

  if (paragraph2) {
    // ⚠️ **一样就不派事务**：`tr.replaceWith` 换成一模一样的内容照样会写进
    // 撤销栈，用户按一次 Ctrl+Z 会看到"什么都没变"——一次白按的撤销。
    if (state.doc.slice(paragraph2.start5, paragraph2.end2).content.eq(newValueMiddleParagraph)) return null;
    tr.replaceWith(paragraph2.start5, paragraph2.end2, newValueMiddleParagraph);
    return tr.scrollIntoView();
  }

  const { $from } = state.selection;
  const position2 = $from.depth >= 1 ? $from.after(1) : state.doc.content.size;
  tr.insert(position2, newValuedoc.content);
  return tr.scrollIntoView();
}

/**
 * 菜单那条命令的**唯一入口**。
 *
 * ⚠️ 与其余几条同一条纪律：界面层不许自己 `ctx.get(editorViewCtx)` 派事务，
 * 一律走 `command-table.ts` 的 `COMMANDS` 表派进来。
 *
 * ⚠️ **先聚焦正文再算位置**（与 [`插公式块`] 同一个理由的弱化版）：不聚焦的话，
 * 从菜单点下来的那一刻焦点还在按钮上，`scrollIntoView` 与收尾都会怪。这里没有
 * 公式块那种"NodeView 看焦点"的死结，所以只是顺着同一条规矩做。
 */
export function insertItemRecord(editor: Editor, strict: boolean): void {
  editor.action((ctx) => {
    const view = ctx.get(editorViewCtx);
    view.focus();
    const tr = tocTransaction(
      view.state,
      (n) => ctx.get(serializerCtx)(n),
      (md) => ctx.get(parserCtx)(md) as unknown as PMNode,
      strict,
    );
    if (!tr) return;
    view.dispatch(tr);
  });
}
