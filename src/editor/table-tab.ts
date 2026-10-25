//! **表格里的 `Tab` / `Shift+Tab`**（`docs/07` §3 第 55 项 ②③）。
//!
//! | 现场 | 敲 | 旧行为（病） | 新行为 |
//! |---|---|---|---|
//! | 中间那一格 | `Tab` | 往**格子里**插两个空格 | 走到下一格（上游办的） |
//! | **最后一格** | `Tab` | 同上——那两颗空格**会写进文件**（`\| 甲 | 乙␣␣ |`） | 在下面**加一行**，光标落在新行第一格 |
//! | 中间那一格 | `Shift+Tab` | 走到上一格（上游办的） | 不变（上游办的） |
//! | **第一格** | `Shift+Tab` | **焦点静默飞出编辑器**，接着打的字落到别处 | 什么都不做，但**把这颗键吃掉** |
//!
//! # 谁已经在管，我接的是掉下来的那两种现场
//!
//! `preset-gfm` 的 `tableKeymap`（走 `prosemirror-keymap`，排在本条前面）**已经绑了
//! 这两颗键**：`NextCell` = `["Mod-]", "Tab"]`、`PrevCell` = `["Mod-[", "Shift-Tab"]`，
//! 各自只是转手调一次上游的 `goToNextCell(±1)`。所以**"中间那一格"两个方向本来就
//! 有人办**，本文件一个字都不用管。上游那两条命令各有一种现场会返回 `false`
//! 撂挑子——"最后一格再往右"、"第一格再往左"（`TableMap.nextCell` 越界给 `null`）。
//! 键于是继续往后走，**病就出在这两种掉下来的现场**：
//!
//! - **最后一格 `Tab`**：接着它的是 `@milkdown/plugin-indent`（`create.ts` 里的
//!   `.use(indent)`），实现就一句 `tr.insertText("  ", to)`：**不看选区在哪、
//!   也不看有没有选区**，只要有位置就往里塞两颗空格——那两颗**会写进文件**。
//!   所以②不是"缩进写错了"，是**缩进本就不该管表格**。
//! - **第一格 `Shift+Tab`**：**没有任何人接**（`indent` 只绑 `Tab`），键落到浏览器
//!   手里，而它给 `Shift+Tab` 的默认动作是"**把焦点移出编辑器**"。页面上看不出
//!   任何变化，人以为还在格子里——接着打的字却落到了别处。
//!   ⚠️ 这条当场目检抓过两次：`docs/06` §5.x 里那次"按完 `Shift+Tab` 再打一个
//!   `9`，文件一个字节都没动"就是它。
//!
//! ⚠️ **这是 `Tab` 这颗键的第二次争夺**：`auto-pair.ts::配对处理` 抢的是
//! "`Tab` 跨过刚补出来的闭括号"。三份判据都窄，所以顺序定成
//! **括号 → 表格 → 缩进**（见下面「位置」那一段）；而上游 keymap 排在最前，
//! 它接住的现场本条就不必重复判。
//!
//! # 加的那一行是怎么拼的
//!
//! 用上游 `goToNextCell(方向)` 走"上一格 / 下一格"——它认得 `TableMap`、
//! 也认得 `CellSelection`，那一半没有理由自己写。**只有"最后一格再加一行"
//! 那一支自己拼**：**永远是一条 `table_row`，装一排空 `table_cell`**。
//! 新行的对齐不用管——`preset-gfm` 自己那条 `keepTableAlignPlugin` 每次都会把
//! 表头的 `alignment` 抄给每一格。
//!
//! ## 为什么不用上游的 `addRow`
//!
//! ⚠️ **主要理由是"它按角色名找节点，而角色名在 `preset-gfm` 里是有歧义的"**。
//! 角色表（`tableNodeTypes()`）按 `tableRole` 索引，而 `preset-gfm` 比上游多一条
//! 独立的表头行 **`table_header_row`**，那条又是 `...originalSchema.table_row`
//! 摊出来的——于是两个节点的 `tableRole` **都是 `"row"`**，抢同一个槽位、
//! **谁在 `schema.nodes` 里靠后谁赢**。那个次序由 Milkdown 内部组合插件的
//! 顺序决定，本仓管不着。真落到表头行上，`addRow` 拼出来的就是
//! "一条表头行装着一排数据格"——**schema 不合法的文档**。
//! → 所以 {@link 表格Tab处理} 走 {@link 行格类型}：**先认名字**
//! （`table_row` / `table_cell`，与 `preset-gfm` 源码同名），**认不到才退回角色表**。
//!
//! ⚠️ 次要的一条，也记着：`addRow` 的新格类型是**从"上面那一行"抄的**
//! （`refRow = -1`）。在"表头没有独立行"的上游形状里那是对的；`preset-gfm`
//! 给表头单起了行之后，这条规则**只剩一种抄法是对的**，而它并没有为此加判断。
//!
//! ⚠️ **一条如实记下的边界**：`addRow` 里还有半截代码是抄上面那一行的
//! `rowspan`（合并格），而 GFM 表格压根表达不出合并格（`cellAttributes` 里只有
//! `alignment`），所以那半截**在本仓永远走不到**。同理，"在表头行最后一格按
//! `Tab` 要加行"这件事在真 schema 下**也走不到**：`table` 的内容表达式是
//! `"table_header_row table_row+"`，表头行后面**必然还有数据行**，
//! `goToNextCell` 总会先找到下一格。所以上面那条"歧义"是个**潜在**的坑
//! （靠的是一个本仓管不着的内部次序），而不是今天就在冒烟的病。
//!
//! # 位置（`create.ts` 里 `.use()` 的顺序）
//!
//! **排在 `配对处理` 后面、`indent` 前面。** ProseMirror 按 `state.plugins`
//! 顺序问 `handleKeyDown`，第一个返回 `true` 的赢：
//!
//! - 排在 `配对处理` **后面**：那边"跳出右半边"的判据最窄（光标右边正好是
//!   一颗**空的**闭括号，`(|)` 那种），让它先问；表格这一条接住其余所有情形。
//! - 排在 `indent` **前面**：它正是这条键位争夺的病根，必须抢在它前面。
//!
//! ⚠️ 表格之外一律放行（返回 `false`），所以表格外的 `Tab` 照旧缩进、列表里
//! 照旧缩进——这一条只管"选区确实落在某个表格的某一行里"那一种情形。
//!
//! # 不做的事（如实记着）
//!
//! - **不碰源码模式**：`source.ts`（CodeMirror）那边 `Tab` 没有任何人绑，
//!   按下去浏览器把焦点移走。第 55 项说的是表格，本条也只动了所见即所得这一边。
//! - **第一格按 `Shift+Tab` 不退出表格**：它**吃掉这颗键**、什么都不做。
//!   吃掉是有意的——不吃的话焦点会静默飞出编辑器（③ 的病根就是这个），
//!   而那比"没反应"更糟：人以为还在格子里，接着打的字却落到了别处。
//! - **不改上游 `tableKeymap` 的行为**：`Mod-]` / `Mod-[` 那两条一个字没动，
//!   本条只在上游那两条撂挑子的现场出手。
//! - **不给 `CellSelection` 写特例**（拖选了多格）：那一半 `goToNextCell`
//!   自己认得，这里一行都没多写。
//! - **不改 `indent` 的行为**：表格外的缩进一个字没动。

import { $prose } from "@milkdown/kit/utils";
import type { Node as PMNode, NodeType, Schema } from "@milkdown/kit/prose/model";
import type { EditorState } from "@milkdown/kit/prose/state";
import type { Transaction } from "@milkdown/kit/prose/state";
import { Plugin, PluginKey, TextSelection } from "@milkdown/kit/prose/state";
import { goToNextCell, isInTable, selectedRect, tableNodeTypes } from "@milkdown/kit/prose/tables";

export const tableTabKey2 = new PluginKey("nota-table-tab");

/**
 * **新行（那条 `table_row` 节点）自己的起点**：表内容起点往后越过 `前面各行高`
 * 那几行。⚠️ 与 `selectedRect().tableStart` 同一套坐标（都是"表内容里的偏移"）。
 */
export function newValueLineStart(tableContentStart: number, beforeSurfaceEachLineHeight: readonly number[]): number {
  let walk = tableContentStart;
  for (const height of beforeSurfaceEachLineHeight) walk += height;
  return walk;
}

/**
 * **新行第一格"能把光标放进去"的那个位置** = {@link 新行起点} `+ 2`：
 * **`+1` 进格、`+2` 进段落**（行 → 格 → 段，GFM 的格子里是一个段落）。
 *
 * ⚠️ 这个 `+2` 是这条路上**唯一**容易写错的一处（差一就落到格外面去，
 * 症状是"加了新行、光标却在原地"），所以单独拆成纯函数，由
 * `tests/table-tab.test.ts` 拿真 schema 的坐标钉着——不是算着好看。
 */
export function firstCellDrop(tableContentStart: number, beforeSurfaceEachLineHeight: readonly number[]): number {
  return newValueLineStart(tableContentStart, beforeSurfaceEachLineHeight) + 2;
}

/**
 * 新行要用的那两个节点类型：**先认名字**（`table_row` / `table_cell`，
 * 与 `preset-gfm` 的源码同名），**认不到才退回上游那张角色表**。
 *
 * ⚠️ 为什么不能只用角色表：`table_row` 与 `table_header_row` 的 `tableRole`
 * 都是 `"row"`，两个抢一个槽位、**靠后者赢**，而那个次序不归本仓管
 * （详见文件头那段）。名字是死的，角色表是活的。
 *
 * ⚠️ `NodeType` 是惰性取的吗？不是——`schema.nodes.x` 在 `Schema` 建好那一刻
 * 就有，所以这里随手取也来得及。
 */
export function rowCellType(schema: Schema): { line3: NodeType; cell2: NodeType } {
  const cornerColor = tableNodeTypes(schema);
  return {
    line3: schema.nodes.table_row ?? cornerColor.row,
    cell2: schema.nodes.table_cell ?? cornerColor.cell,
  };
}

/**
 * 表格里按 `Tab`（`反向` 为真则是 `Shift+Tab`）该做的事。
 *
 * 返回 `true` ＝ **这颗键我要了**（ProseMirror 的 `handleKeyDown` 就是按这个
 * 约定接键的），`false` ＝ 放行给后面的插件（于是表格外照旧缩进）。
 *
 * 四种现场：
 *
 * | 现场 | 结果 |
 * |---|---|
 * | 不在表格里 | `false`（放行） |
 * | 中间某格 | `goToNextCell` 挪过去，`true` |
 * | 最后一格 `Tab` | 加一行、光标进新行第一格，`true` |
 * | 第一格 `Shift+Tab` | 不动文档、只吃掉这颗键，`true` |
 *
 * ⚠️ `dispatch` 可以缺省（ProseMirror 问"这颗键接不接"时会不带它调一次）：
 * 缺省时只回答接不接，**一个字节都不改**。
 */
export function handleTableTab(
  state: EditorState,
  dispatch: ((tr: Transaction) => void) | undefined,
  reverseToward: boolean,
): boolean {
  if (!isInTable(state)) return false;
  if (goToNextCell(reverseToward ? -1 : 1)(state, dispatch)) return true;
  // 落到这儿只剩两种现场：最后一格（正向）与第一格（反向）。
  if (reverseToward) return true;
  if (!dispatch) return true;
  const table2 = selectedRect(state);
  const beforeSurfaceEachLineHeight: number[] = [];
  for (let i = 0; i < table2.bottom; i++) beforeSurfaceEachLineHeight.push(table2.table.child(i).nodeSize);
  const { line3: rowType2, cell2: cellType2 } = rowCellType(state.schema);
  const newValueCell: PMNode[] = [];
  for (let i = 0; i < table2.map.width; i++) {
    const valueCell = cellType2.createAndFill();
    // ⚠️ 造不出空格子就**别动手**：`createAndFill()` 只在"内容表达式填不满"时
    // 给 `null`（GFM 的格子填得满，所以这一支正常走不到）——真走到了，
    // 加一行半截格子更糟，这里吃掉这颗键、什么都不做。
    if (!valueCell) return true;
    newValueCell.push(valueCell);
  }
  const tr = state.tr.insert(
    newValueLineStart(table2.tableStart, beforeSurfaceEachLineHeight),
    rowType2.create(null, newValueCell),
  );
  // ⚠️ 选区要用**插完之后**的 `tr.doc` 解析：新行之后的那些位置全被这次插入
  // 推后了，拿旧 doc 去 resolve 会落到别的地方。
  tr.setSelection(TextSelection.near(tr.doc.resolve(firstCellDrop(table2.tableStart, beforeSurfaceEachLineHeight))));
  dispatch(tr.scrollIntoView());
  return true;
}

/**
 * **按键那一道门**：先过四道"不归我管"的闸，剩下的交给 {@link 表格Tab处理}。
 *
 * 拆出来是为了**能测**——`handleKeyDown` 要真 `EditorView`（本仓没有 jsdom，
 * 也不许为这件事装包），而这条判据一个字都不需要 DOM。
 *
 * 四道闸：
 * ① **组字期间一律不碰**（`composing`）——与 `配对处理` 同一条纪律，中文输入法
 *    上屏那一下动文档会把候选框里的东西打乱；
 * ② 带修饰键的一概不碰（`Ctrl+Tab` / `Alt+Tab` 是窗口管理器的，`Cmd+Tab` 是
 *    系统的）——⚠️ **`Shift` 不算修饰键**，`Shift+Tab` 正是要接的那一条；
 * ③ **不是 `Tab` 就不碰**——⚠️ 这一条**得按 `keyCode` 认，不能只看 `event.key`**，
 *    理由见下面那段；
 * ④ 剩下的（选区在不在表格里、该走还是该加行）由 {@link 表格Tab处理} 判。
 *
 * ## ⚠️ 为什么"认键"要看 `keyCode`（2026-10-04 目检抓出来的）
 *
 * 在 GTK/X11 上，**`Shift+Tab` 送到网页里的根本不是 `Tab`**：X 发的是另一个 keysym
 * **`ISO_Left_Tab`**（`0xFE20`），WebKit 给不出名字，于是 `event.key` 是
 * **`"Unidentified"`**（`event.code` 一样是空的）。只有 `event.keyCode` 还是 `9`。
 * 上游 `prosemirror-keymap` 认键正是先查 `keyNames[event.keyCode]`，所以它认得、
 * 能挪格子；这一条要是只比 `event.key === "Tab"`，**`Shift+Tab` 根本到不了这里**
 * ——它会被放行给浏览器，而浏览器的默认动作是"把焦点移出编辑器"，
 * 表现就是"按了没反应、接着打的字却落到别处"（这一条最初就是这么翻车的）。
 *
 * ⚠️ `keyCode` 是过时的属性，这里用它是**照抄上游的判据**：本仓要跟
 * `prosemirror-keymap` 对同一颗键得出同一个结论，就不能另起一套。
 */
export function tableTabKey(
  state: EditorState,
  dispatch: ((tr: Transaction) => void) | undefined,
  event: {
    key: string;
    keyCode: number;
    shiftKey: boolean;
    ctrlKey: boolean;
    altKey: boolean;
    metaKey: boolean;
  },
  composing: boolean,
): boolean {
  if (composing) return false;
  if (event.ctrlKey || event.altKey || event.metaKey) return false;
  // ⚠️ 两道都留着：`event.key` 是"正规"判据（别的平台/别的输入栈给得出来），
  // `keyCode === 9` 是 GTK/X11 上 `Shift+Tab`（`ISO_Left_Tab`）唯一还认得的痕迹。
  if (event.key !== "Tab" && event.keyCode !== 9) return false;
  return handleTableTab(state, dispatch, event.shiftKey);
}

/**
 * 造那条 `Plugin`。**工厂不是常量**：每个编辑器实例要一份自己的插件
 * （ProseMirror 的插件带实例状态，共用一份是踩过的坑）。
 */
export function createTableTabPlugin(): Plugin {
  return new Plugin({
    key: tableTabKey2,
    props: {
      handleKeyDown: (view, event) =>
        tableTabKey(view.state, (tr) => view.dispatch(tr), event, view.composing),
    },
  });
}

/**
 * 挂进 `.use()` 的那一条。
 *
 * ⚠️ 走 `handleKeyDown`（本仓口径，`table-input.ts` 顶上写过为什么不能用
 * `$useKeymap` 抢 priority），靠 `.use()` 的顺序排在 `indent` 前面。
 */
export function tableTab() {
  return $prose(() => createTableTabPlugin());
}
