/**
 * `src/editor/table-tab.ts`（表格里的 `Tab` / `Shift+Tab`）的**可运行**测试集。
 * 2026-10-04 写，与那个文件同批落地（`docs/07` §3 第 55 项 ②③）。
 *
 * # 跑法
 *
 * ```sh
 * npx esbuild tests/table-tab.test.ts --bundle --platform=node --format=esm \
 *   --outfile=/tmp/nota-测试/table-tab.mjs
 * node /tmp/nota-测试/table-tab.mjs
 * ```
 *
 * # 这份测试盯的是什么
 *
 * ②③ 两个病的对错全在**坐标**上：走错一格、加出来的行少一格、光标落在格外面，
 * 屏幕上都不会报错——只会"手感不对"。所以七组：
 *
 * | 组 | 盯什么 |
 * |---|---|
 * | 一 | 两个纯函数（`新行起点` / `首格落点`）—— `+2` 那一下 |
 * | 二 | 中格 `Tab` / `Shift+Tab` 各挪一格（真 schema、真坐标） |
 * | 三 | **最后一格 `Tab` 加一行**：行数 +1、格数不变、光标在新行第一格 |
 * | 四 | 第一格 `Shift+Tab`：**吃掉这颗键**、文档与选区一个字节都不动 |
 * | 五 | 表格**外**一律放行（返回 `false`）——缩进该发生的时候照旧发生 |
 * | 六 | **表头行**那一格：加出来的是 `table_row` ＋ `table_cell`（不是 `table_header`） |
 * | 七 | 装配（只能证明"挂上去了"）＋ 别的键 / 带修饰键放行 |
 *
 * # ⚠️ 这份测试**证明不了**什么
 *
 * - ⚠️⚠️ **「真窗口里按 `Tab` 真的走过去了」没验**：那是
 *   `handleKeyDown` ＋ 真键位事件的**顺序**问题（能不能抢在 `indent` 前面），
 *   只有开窗目检抓得住——`docs/06` 那边记着跑法。第 55 项结清时补了这一步。
 * - ⚠️ **「`Shift+Tab` 不再把焦点移出编辑器」没验**：那要真浏览器。
 * - ⚠️ **组字期间不插手**（`view.composing`）没验：那要真 view ＋ 真 IME。
 * - ⚠️ 这里的 schema 是**照 `@milkdown/preset-gfm` 的形状搭的**（同样的
 *   `tableNodes` 规格：`cellContent: "paragraph"`、表头是独立节点
 *   `table_header` ＋ 独立行 `table_header_row`），但**不是**那份 preset 本身。
 *   万一 preset 哪天改了形状，这一组不会红——`docs/09` §3 的口径是
 *   "测试只能证明它测的那件事"。
 */

import { Schema } from "@milkdown/kit/prose/model";
import type { Node as PMNode } from "@milkdown/kit/prose/model";
import { EditorState, TextSelection } from "@milkdown/kit/prose/state";
import { tableNodes } from "@milkdown/kit/prose/tables";
import {
  createTableTabPlugin,
  newValueLineStart,
  firstCellDrop,
  tableTab,
  handleTableTab,
  tableTabKey2,
  tableTabKey,
} from "../src/editor/table-tab";
import { tableEnter, tableEnterKey } from "../src/editor/table-enter";

let pass = 0;
let fail = 0;
const failure: string[] = [];

function assertion(name3: string, actual2: unknown, period: unknown): void {
  const a = JSON.stringify(actual2);
  const b = JSON.stringify(period);
  if (a === b) {
    pass += 1;
  } else {
    fail += 1;
    failure.push(`${name3}\n    实际 ${a}\n    期望 ${b}`);
  }
}

// ── 造一份"形状跟 preset-gfm 一样"的表 ────────────────────────
// ⚠️ `cellContent: "paragraph"` 与 `cellAttributes.alignment` 都是抄 preset 的
// （`node_modules/@milkdown/preset-gfm/lib/index.js:88`）。
const tableSpec = tableNodes({
  tableGroup: "block",
  cellContent: "paragraph",
  cellAttributes: { alignment: { default: "left" } },
});

// ⚠️⚠️ **这里刻意照抄 preset-gfm 那三处别扭**，因为它们正是实现里那两个决定的
// 理由（`table-tab.ts` 文件头）：
//
// ① 它比上游多一条独立的 **`table_header_row`**，而那条是**从 `table_row`
//    摊出来的**——于是两个节点的 `tableRole` 都是 `"row"`，在上游那张按角色
//    索引的表里**抢同一个槽位、靠后者赢**。本测试把它**排在 `table_row` 后面**
//    （在 Milkdown 里那是个内部次序问题，本仓管不着），于是
//    `tableNodeTypes().row` 在这里指向**表头行**——「新行照样是 `table_row`」
//    那几条断言就是钉这件事的。
// ② `table_row` 的内容表达式是 **`"(table_cell)*"`**（上游是
//    `"(table_cell | table_header)*"`）：所以"`table_row` 里装着 `table_header`"
//    在这份 schema 下**是非法文档**，本测试会当场把它顶出来。
// ③ `table` 的内容是 **`"table_header_row table_row+"`**：表头行**是必需的、
//    而且必须第一条**，数据行至少一条。所以这份测试里每张表都有表头行——
//    "只有表头行的表"在真 schema 里**根本不存在**。
const headerRowSpec: Record<string, unknown> = {
  ...tableSpec.table_row,
  content: "(table_header)*",
};

const schema = new Schema({
  nodes: {
    doc: { content: "block+" },
    paragraph: { group: "block", content: "inline*" },
    text: { group: "inline" },
    table: { ...tableSpec.table, content: "table_header_row table_row+" },
    table_row: { ...tableSpec.table_row, content: "(table_cell)*" },
    table_header_row: headerRowSpec,
    table_cell: tableSpec.table_cell,
    table_header: tableSpec.table_header,
  } as never,
  marks: {},
});

const paragraph2 = (t: string): PMNode =>
  schema.nodes.paragraph.create(null, t ? schema.text(t) : null);
const cell2 = (t: string): PMNode => schema.nodes.table_cell.create(null, paragraph2(t));
const headCell = (t: string): PMNode => schema.nodes.table_header.create(null, paragraph2(t));
const line3 = (...cells: PMNode[]): PMNode => schema.nodes.table_row.create(null, cells);
const headLine = (...cells: PMNode[]): PMNode => schema.nodes.table_header_row.create(null, cells);
const table2 = (...rows: PMNode[]): PMNode => schema.nodes.table.create(null, rows);

/** 光标放进"写着这段文字的那一格"。 */
function createState2(doc: PMNode, text3: string): EditorState {
  let drop = -1;
  doc.descendants((node, pos) => {
    if (node.isText && node.text === text3 && drop < 0) {
      drop = pos;
      return false;
    }
    return true;
  });
  if (drop < 0) throw new Error(`造状态：文档里没有写着「${text3}」的那一格`);
  return EditorState.create({
    schema,
    doc,
    selection: TextSelection.near(doc.resolve(drop)),
  });
}

/** 光标所在那一格（没有就是 `null`）。 */
function placeAtCell(state: EditorState): PMNode | null {
  const head = state.selection.$head;
  for (let d = head.depth; d > 0; d--) {
    const n = head.node(d);
    const corner = n.type.spec.tableRole;
    if (corner === "cell" || corner === "header_cell") return n;
  }
  return null;
}

/** 文档里第一张表。 */
function ordinalOneImageTable(doc: PMNode): PMNode {
  let find: PMNode | null = null;
  doc.descendants((node) => {
    if (!find && node.type.spec.tableRole === "table") {
      find = node;
      return false;
    }
    return true;
  });
  if (!find) throw new Error("文档里没有表");
  return find;
}

/** 按下 `Tab`（`反向` 为真则是 `Shift+Tab`），把事务真 apply 一遍。 */
function pressTab(state: EditorState, reverseToward = false): { connected: boolean; state: EditorState } {
  let newValue = state;
  const connected = handleTableTab(state, (tr) => {
    newValue = state.apply(tr);
  }, reverseToward);
  return { connected, state: newValue };
}

function pressReturnCar(state: EditorState): { connected: boolean; state: EditorState } {
  let newValue = state;
  const connected = tableEnter(state, (tr) => {
    newValue = state.apply(tr);
  });
  return { connected, state: newValue };
}

// ── 造几张"合法性照真 schema"的表 ─────────────────────────────
// ⚠️ 真 schema 里**表头行是必需的、且必须第一条**，数据行至少一条
// （`table` 的内容表达式是 `"table_header_row table_row+"`）——所以下面每张表
// 都有表头行，"只有表头行的表"那种东西在真 schema 里根本不存在。
const text4 = (...block: PMNode[]): PMNode => schema.nodes.doc.create(null, block);
const twoColumnsTable = (...dataRow: PMNode[]): PMNode => table2(headLine(headCell("h1"), headCell("h2")), ...dataRow);
const threeColumnsTable = (...dataRow: PMNode[]): PMNode =>
  table2(headLine(headCell("h1"), headCell("h2"), headCell("h3")), ...dataRow);

// ── 一、两个纯函数 ────────────────────────────────────────────
// ⚠️ **这一组才是 `+2` 的判据**。第三组那几条"光标落在新行第一格"**证不了 `+2`**：
// `TextSelection.near()` 带容差，落点差一位它会自己挪进最近的那个文字位置
// （实测把 `+2` 改成 `+1`，第三组照样全绿、只有这一组红）。算术归算术、容差归
// 容差，两件事分开钉着。
assertion("新行起点＝表内容起点＋前面各行高", newValueLineStart(10, [5, 7]), 22);
assertion("前面没有行时就是表内容起点", newValueLineStart(10, []), 10);
assertion("首格落点＝新行起点＋2（进格、进段）", firstCellDrop(10, [5, 7]), 24);
assertion("两行高一样时落点只跟序号走", firstCellDrop(0, [3, 3]), 8);

// ── 二、中格挪一格 ────────────────────────────────────────────
{
  const state = createState2(text4(twoColumnsTable(line3(cell2("a"), cell2("b")))), "a");
  const r = pressTab(state);
  assertion("中格按 Tab 接了", r.connected, true);
  assertion("中格按 Tab 落到下一格", placeAtCell(r.state)?.textContent, "b");
  assertion("中格按 Tab 不动文档", r.state.doc.eq(state.doc), true);
}
{
  const state = createState2(text4(twoColumnsTable(line3(cell2("a"), cell2("b")))), "b");
  const r = pressTab(state, true);
  assertion("中格按 Shift+Tab 接了", r.connected, true);
  assertion("中格按 Shift+Tab 落到上一格", placeAtCell(r.state)?.textContent, "a");
  assertion("中格按 Shift+Tab 不动文档", r.state.doc.eq(state.doc), true);
}
{
  // 跨行：数据行末格按 Tab 该落到**下一行第一格**（不是原地加行）。
  const state = createState2(text4(twoColumnsTable(line3(cell2("a"), cell2("b")), line3(cell2("c"), cell2("d")))), "b");
  const r = pressTab(state);
  assertion("行末按 Tab 跨到下一行行首", placeAtCell(r.state)?.textContent, "c");
  assertion("跨行时没多出一行", ordinalOneImageTable(r.state.doc).childCount, 3);
}
{
  // ⚠️ 表头行**最后一格**按 `Tab` 走的是同一条路（下游还有数据行）。
  // 这一格正是"上游 `addRow` 会去抄上面那行"的那种现场，而它在这里**根本走不到**
  // 加行那一支——加行只可能发生在最后一条数据行上。
  const state = createState2(text4(twoColumnsTable(line3(cell2("a"), cell2("b")))), "h2");
  const r = pressTab(state);
  assertion("表头末格按 Tab 落到数据行第一格", placeAtCell(r.state)?.textContent, "a");
  assertion("表头末格按 Tab 没加行", ordinalOneImageTable(r.state.doc).childCount, 2);
}

// ── 三、最后一格（＝最后一条数据行的末格）：加一行 ────────────
{
  const state = createState2(text4(twoColumnsTable(line3(cell2("a"), cell2("b")))), "b");
  const r = pressTab(state);
  assertion("末格按 Tab 接了", r.connected, true);
  assertion("末格按 Tab 多出一行", ordinalOneImageTable(r.state.doc).childCount, 3);
  assertion("新行格数与原行一致", ordinalOneImageTable(r.state.doc).lastChild?.childCount, 2);
  assertion("新行那一行是 table_row", ordinalOneImageTable(r.state.doc).lastChild?.type.name, "table_row");
  assertion("新行里的格子是 table_cell", ordinalOneImageTable(r.state.doc).lastChild?.firstChild?.type.name, "table_cell");
  assertion("新行不在表头的位置（表头还在最上面）", ordinalOneImageTable(r.state.doc).firstChild?.type.name, "table_header_row");
  assertion("光标落在新行第一格", placeAtCell(r.state)?.textContent, "");
  assertion("光标那一格是空的 table_cell", placeAtCell(r.state)?.type.name, "table_cell");
  // ⚠️ 这条是"光标真的在新行里"的硬判据：它必须**晚于**原来那个 `b` 的位置。
  let originalb = -1;
  state.doc.descendants((node, pos) => {
    if (node.isText && node.text === "b") originalb = pos;
    return true;
  });
  assertion("光标位置在原来那一格之后", r.state.selection.from > originalb, true);
}
{
  // 三列表：新行也得是三格（要是写成"照抄当前行的格子数"就看不出来，
  // 但写成"永远两格"会当场红）。
  const state = createState2(text4(threeColumnsTable(line3(cell2("a"), cell2("b"), cell2("c")))), "c");
  const r = pressTab(state);
  assertion("三列表加出来还是三格", ordinalOneImageTable(r.state.doc).lastChild?.childCount, 3);
}
{
  // 两条数据行：光标在**最后一条**的末格时，新行加在表尾（不是插到第一条后面）。
  const state = createState2(text4(twoColumnsTable(line3(cell2("a"), cell2("b")), line3(cell2("c"), cell2("d")))), "d");
  const r = pressTab(state);
  const newTable = ordinalOneImageTable(r.state.doc);
  assertion("加在表尾", newTable.childCount, 4);
  assertion("表头还在最上面", newTable.firstChild?.type.name, "table_header_row");
  assertion("表尾那一行是 table_row", newTable.lastChild?.type.name, "table_row");
  assertion("表尾那一行的格子是 table_cell", newTable.lastChild?.firstChild?.type.name, "table_cell");
}

// ── 四、第一格 Shift+Tab：吃掉但不许动文档 ────────────────────
{
  // ⚠️ 真 schema 下的"第一格"就是**表头行第一格**（表头行永远是第一条）。
  const state = createState2(text4(twoColumnsTable(line3(cell2("a"), cell2("b")))), "h1");
  const r = pressTab(state, true);
  assertion("第一格 Shift+Tab 也要吃掉这颗键（否则焦点飞出编辑器）", r.connected, true);
  assertion("第一格 Shift+Tab 不加行", ordinalOneImageTable(r.state.doc).childCount, 2);
  assertion("第一格 Shift+Tab 光标不动", r.state.selection.from, state.selection.from);
  assertion("第一格 Shift+Tab 文档一个字节没动", r.state.doc.eq(state.doc), true);
}
{
  // 数据行的第一格按 Shift+Tab 要回到**表头行的最后一格**（跨行回头）。
  const state = createState2(text4(twoColumnsTable(line3(cell2("a"), cell2("b")))), "a");
  const r = pressTab(state, true);
  assertion("数据行行首按 Shift+Tab 回到表头行行尾", placeAtCell(r.state)?.textContent, "h2");
}
{
  const state = createState2(text4(twoColumnsTable(line3(cell2("a"), cell2("b")), line3(cell2("c"), cell2("d")))), "c");
  const r = pressTab(state, true);
  assertion("第二条数据行行首按 Shift+Tab 回到上一行行尾", placeAtCell(r.state)?.textContent, "b");
}

// ── 五、表格外一律放行 ────────────────────────────────────────
{
  const state = createState2(text4(paragraph2("一段普通的正文")), "一段普通的正文");
  assertion("表格外按 Tab 放行", pressTab(state).connected, false);
  assertion("表格外按 Shift+Tab 放行", pressTab(state, true).connected, false);
}
{
  // 表**后面**那一段也是"表格外"（`isInTable` 看的是选区所在的祖先链）。
  const state = createState2(text4(twoColumnsTable(line3(cell2("a"), cell2("b"))), paragraph2("表后正文")), "表后正文");
  assertion("表格后面那一段按 Tab 放行", pressTab(state).connected, false);
}
{
  // 表**前面**那一段同理（祖先链里没有 `tableRole: "row"` 的东西）。
  const state = createState2(text4(paragraph2("表前正文"), twoColumnsTable(line3(cell2("a"), cell2("b")))), "表前正文");
  assertion("表格前面那一段按 Tab 放行", pressTab(state).connected, false);
}

// ── 六、表头行 ────────────────────────────────────────────────
{
  const state = createState2(text4(twoColumnsTable(line3(cell2("a"), cell2("b")))), "h1");
  const r = pressTab(state);
  assertion("表头第一格按 Tab 落到表头第二格", placeAtCell(r.state)?.textContent, "h2");
  assertion("表头里按 Tab 没多出行", ordinalOneImageTable(r.state.doc).childCount, 2);
}

// ── 七、按键那一道门 与 装配 ──────────────────────────────────
{
  const state = createState2(text4(twoColumnsTable(line3(cell2("a"), cell2("b")))), "a");
  const key = (
    change2: Partial<{
      key: string;
      keyCode: number;
      shiftKey: boolean;
      ctrlKey: boolean;
      altKey: boolean;
      metaKey: boolean;
    }> = {},
  ) => ({
    key: "Tab",
    keyCode: 9,
    shiftKey: false,
    ctrlKey: false,
    altKey: false,
    metaKey: false,
    ...change2,
  });
  const press = (change2 = {}, composing = false): boolean => {
    let newValue = state;
    return tableTabKey(state, (tr) => {
      newValue = state.apply(tr);
    }, key(change2), composing);
  };
  assertion("门：表格里普通 Tab 接", press(), true);
  assertion("门：`Shift+Tab` 也接（Shift 不算修饰键）", press({ shiftKey: true }), true);
  assertion("门：`Ctrl+Tab` 放行（那是窗口管理器的）", press({ ctrlKey: true }), false);
  assertion("门：`Alt+Tab` 放行", press({ altKey: true }), false);
  assertion("门：`Cmd+Tab` 放行", press({ metaKey: true }), false);
  assertion("门：别的键放行", press({ key: "Enter", keyCode: 13 }), false);
  assertion("门：组字期间一律放行", press({}, true), false);
  assertion("门：组字期间 Shift+Tab 也放行", press({ shiftKey: true }, true), false);
  // ⚠️ 下面这几条是 **GTK/X11 上真发生的事**，不是假想（`docs/06` §5.x 目检）：
  // `Shift+Tab` 在 X 里发的是 `ISO_Left_Tab`，WebKit 给不出名字，
  // `event.key` 是 `"Unidentified"`，只有 `keyCode` 还是 9。
  assertion(
    "门：X11 的 `Shift+Tab`（key=Unidentified, keyCode=9）必须接住",
    press({ key: "Unidentified", keyCode: 9, shiftKey: true }),
    true,
  );
  assertion(
    "门：`key` 认不出来、`keyCode` 也不是 9 的，放行",
    press({ key: "Unidentified", keyCode: 65 }),
    false,
  );
  assertion("门：字母 a 放行（keyCode 65）", press({ key: "a", keyCode: 65 }), false);
}
{
  // ⚠️ dry-run（`dispatch` 缺省）时只回答接不接，**一个字节都不改**：
  // ProseMirror 问"这颗键接不接"时会不带 `dispatch` 调一次。
  const state = createState2(text4(twoColumnsTable(line3(cell2("a"), cell2("b")))), "b");
  const before2 = state.doc;
  assertion("dry-run 也回答接", handleTableTab(state, undefined, false), true);
  assertion("dry-run 没加行", state.doc.child(0).childCount, 2);
  assertion("dry-run 之后文档还是原来那一个", state.doc.eq(before2), true);
}
{
  // 装配：只能证明"插件造得出来、键位是那一个"——真挂进编辑器要靠开窗目检。
  const plugin = createTableTabPlugin();
  assertion("插件造得出来", typeof plugin === "object" && plugin !== null, true);
  assertion("槽位名对上", plugin.spec.key, tableTabKey2);
  assertion("工厂每次给新的一份", createTableTabPlugin() === plugin, false);
  assertion("`$prose` 那条也造得出来", typeof tableTab(), "function");
}

// ── 八、普通回车：下一格 / 表尾加行 ───────────────────────────
{
  const state = createState2(text4(twoColumnsTable(line3(cell2("a"), cell2("b")))), "a");
  const r = pressReturnCar(state);
  assertion("中格按回车接了", r.connected, true);
  assertion("中格按回车走到下一格", placeAtCell(r.state)?.textContent, "b");
  assertion("中格按回车不动文档", r.state.doc.eq(state.doc), true);
}
{
  const state = createState2(text4(twoColumnsTable(line3(cell2("a"), cell2("b")))), "b");
  const r = pressReturnCar(state);
  assertion("末格按回车接了", r.connected, true);
  assertion("末格按回车加一行", ordinalOneImageTable(r.state.doc).childCount, 3);
  assertion("末格按回车落到新行第一格", placeAtCell(r.state)?.textContent, "");
  assertion("加出来的是数据行", ordinalOneImageTable(r.state.doc).lastChild?.type.name, "table_row");
}
{
  const state = createState2(text4(paragraph2("表格外")), "表格外");
  assertion("表格外按回车放行", pressReturnCar(state).connected, false);
  assertion("回车键位对象造得出来", typeof tableEnterKey, "function");
}

// ── 汇总 ──────────────────────────────────────────────────────
if (failure.length) {
  console.log(failure.join("\n"));
}
console.log(`${fail === 0 ? "通过" : "有失败"} ${pass} 条，失败 ${fail} 条`);
