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
  建表格Tab插件,
  新行起点,
  首格落点,
  表格Tab,
  表格Tab处理,
  表格Tab键,
  表格Tab按键,
} from "../src/editor/table-tab";

let 过 = 0;
let 败 = 0;
const 失败: string[] = [];

function 断言(名: string, 实: unknown, 期: unknown): void {
  const a = JSON.stringify(实);
  const b = JSON.stringify(期);
  if (a === b) {
    过 += 1;
  } else {
    败 += 1;
    失败.push(`${名}\n    实际 ${a}\n    期望 ${b}`);
  }
}

// ── 造一份"形状跟 preset-gfm 一样"的表 ────────────────────────
// ⚠️ `cellContent: "paragraph"` 与 `cellAttributes.alignment` 都是抄 preset 的
// （`node_modules/@milkdown/preset-gfm/lib/index.js:88`）。
const 表格规格 = tableNodes({
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
const 表头行规格: Record<string, unknown> = {
  ...表格规格.table_row,
  content: "(table_header)*",
};

const schema = new Schema({
  nodes: {
    doc: { content: "block+" },
    paragraph: { group: "block", content: "inline*" },
    text: { group: "inline" },
    table: { ...表格规格.table, content: "table_header_row table_row+" },
    table_row: { ...表格规格.table_row, content: "(table_cell)*" },
    table_header_row: 表头行规格,
    table_cell: 表格规格.table_cell,
    table_header: 表格规格.table_header,
  } as never,
  marks: {},
});

const 段 = (t: string): PMNode =>
  schema.nodes.paragraph.create(null, t ? schema.text(t) : null);
const 格 = (t: string): PMNode => schema.nodes.table_cell.create(null, 段(t));
const 头格 = (t: string): PMNode => schema.nodes.table_header.create(null, 段(t));
const 行 = (...格们: PMNode[]): PMNode => schema.nodes.table_row.create(null, 格们);
const 头行 = (...格们: PMNode[]): PMNode => schema.nodes.table_header_row.create(null, 格们);
const 表 = (...行们: PMNode[]): PMNode => schema.nodes.table.create(null, 行们);

/** 光标放进"写着这段文字的那一格"。 */
function 造状态(doc: PMNode, 文字: string): EditorState {
  let 落 = -1;
  doc.descendants((node, pos) => {
    if (node.isText && node.text === 文字 && 落 < 0) {
      落 = pos;
      return false;
    }
    return true;
  });
  if (落 < 0) throw new Error(`造状态：文档里没有写着「${文字}」的那一格`);
  return EditorState.create({
    schema,
    doc,
    selection: TextSelection.near(doc.resolve(落)),
  });
}

/** 光标所在那一格（没有就是 `null`）。 */
function 所在格(state: EditorState): PMNode | null {
  const $头 = state.selection.$head;
  for (let d = $头.depth; d > 0; d--) {
    const n = $头.node(d);
    const 角 = n.type.spec.tableRole;
    if (角 === "cell" || 角 === "header_cell") return n;
  }
  return null;
}

/** 文档里第一张表。 */
function 第一张表(doc: PMNode): PMNode {
  let 找: PMNode | null = null;
  doc.descendants((node) => {
    if (!找 && node.type.spec.tableRole === "table") {
      找 = node;
      return false;
    }
    return true;
  });
  if (!找) throw new Error("文档里没有表");
  return 找;
}

/** 按下 `Tab`（`反向` 为真则是 `Shift+Tab`），把事务真 apply 一遍。 */
function 按Tab(state: EditorState, 反向 = false): { 接了: boolean; 状态: EditorState } {
  let 新 = state;
  const 接了 = 表格Tab处理(state, (tr) => {
    新 = state.apply(tr);
  }, 反向);
  return { 接了, 状态: 新 };
}

// ── 造几张"合法性照真 schema"的表 ─────────────────────────────
// ⚠️ 真 schema 里**表头行是必需的、且必须第一条**，数据行至少一条
// （`table` 的内容表达式是 `"table_header_row table_row+"`）——所以下面每张表
// 都有表头行，"只有表头行的表"那种东西在真 schema 里根本不存在。
const 文 = (...块: PMNode[]): PMNode => schema.nodes.doc.create(null, 块);
const 两列表 = (...数据行: PMNode[]): PMNode => 表(头行(头格("h1"), 头格("h2")), ...数据行);
const 三列表 = (...数据行: PMNode[]): PMNode =>
  表(头行(头格("h1"), 头格("h2"), 头格("h3")), ...数据行);

// ── 一、两个纯函数 ────────────────────────────────────────────
// ⚠️ **这一组才是 `+2` 的判据**。第三组那几条"光标落在新行第一格"**证不了 `+2`**：
// `TextSelection.near()` 带容差，落点差一位它会自己挪进最近的那个文字位置
// （实测把 `+2` 改成 `+1`，第三组照样全绿、只有这一组红）。算术归算术、容差归
// 容差，两件事分开钉着。
断言("新行起点＝表内容起点＋前面各行高", 新行起点(10, [5, 7]), 22);
断言("前面没有行时就是表内容起点", 新行起点(10, []), 10);
断言("首格落点＝新行起点＋2（进格、进段）", 首格落点(10, [5, 7]), 24);
断言("两行高一样时落点只跟序号走", 首格落点(0, [3, 3]), 8);

// ── 二、中格挪一格 ────────────────────────────────────────────
{
  const 状态 = 造状态(文(两列表(行(格("a"), 格("b")))), "a");
  const r = 按Tab(状态);
  断言("中格按 Tab 接了", r.接了, true);
  断言("中格按 Tab 落到下一格", 所在格(r.状态)?.textContent, "b");
  断言("中格按 Tab 不动文档", r.状态.doc.eq(状态.doc), true);
}
{
  const 状态 = 造状态(文(两列表(行(格("a"), 格("b")))), "b");
  const r = 按Tab(状态, true);
  断言("中格按 Shift+Tab 接了", r.接了, true);
  断言("中格按 Shift+Tab 落到上一格", 所在格(r.状态)?.textContent, "a");
  断言("中格按 Shift+Tab 不动文档", r.状态.doc.eq(状态.doc), true);
}
{
  // 跨行：数据行末格按 Tab 该落到**下一行第一格**（不是原地加行）。
  const 状态 = 造状态(文(两列表(行(格("a"), 格("b")), 行(格("c"), 格("d")))), "b");
  const r = 按Tab(状态);
  断言("行末按 Tab 跨到下一行行首", 所在格(r.状态)?.textContent, "c");
  断言("跨行时没多出一行", 第一张表(r.状态.doc).childCount, 3);
}
{
  // ⚠️ 表头行**最后一格**按 `Tab` 走的是同一条路（下游还有数据行）。
  // 这一格正是"上游 `addRow` 会去抄上面那行"的那种现场，而它在这里**根本走不到**
  // 加行那一支——加行只可能发生在最后一条数据行上。
  const 状态 = 造状态(文(两列表(行(格("a"), 格("b")))), "h2");
  const r = 按Tab(状态);
  断言("表头末格按 Tab 落到数据行第一格", 所在格(r.状态)?.textContent, "a");
  断言("表头末格按 Tab 没加行", 第一张表(r.状态.doc).childCount, 2);
}

// ── 三、最后一格（＝最后一条数据行的末格）：加一行 ────────────
{
  const 状态 = 造状态(文(两列表(行(格("a"), 格("b")))), "b");
  const r = 按Tab(状态);
  断言("末格按 Tab 接了", r.接了, true);
  断言("末格按 Tab 多出一行", 第一张表(r.状态.doc).childCount, 3);
  断言("新行格数与原行一致", 第一张表(r.状态.doc).lastChild?.childCount, 2);
  断言("新行那一行是 table_row", 第一张表(r.状态.doc).lastChild?.type.name, "table_row");
  断言("新行里的格子是 table_cell", 第一张表(r.状态.doc).lastChild?.firstChild?.type.name, "table_cell");
  断言("新行不在表头的位置（表头还在最上面）", 第一张表(r.状态.doc).firstChild?.type.name, "table_header_row");
  断言("光标落在新行第一格", 所在格(r.状态)?.textContent, "");
  断言("光标那一格是空的 table_cell", 所在格(r.状态)?.type.name, "table_cell");
  // ⚠️ 这条是"光标真的在新行里"的硬判据：它必须**晚于**原来那个 `b` 的位置。
  let 原b = -1;
  状态.doc.descendants((node, pos) => {
    if (node.isText && node.text === "b") 原b = pos;
    return true;
  });
  断言("光标位置在原来那一格之后", r.状态.selection.from > 原b, true);
}
{
  // 三列表：新行也得是三格（要是写成"照抄当前行的格子数"就看不出来，
  // 但写成"永远两格"会当场红）。
  const 状态 = 造状态(文(三列表(行(格("a"), 格("b"), 格("c")))), "c");
  const r = 按Tab(状态);
  断言("三列表加出来还是三格", 第一张表(r.状态.doc).lastChild?.childCount, 3);
}
{
  // 两条数据行：光标在**最后一条**的末格时，新行加在表尾（不是插到第一条后面）。
  const 状态 = 造状态(文(两列表(行(格("a"), 格("b")), 行(格("c"), 格("d")))), "d");
  const r = 按Tab(状态);
  const 表新 = 第一张表(r.状态.doc);
  断言("加在表尾", 表新.childCount, 4);
  断言("表头还在最上面", 表新.firstChild?.type.name, "table_header_row");
  断言("表尾那一行是 table_row", 表新.lastChild?.type.name, "table_row");
  断言("表尾那一行的格子是 table_cell", 表新.lastChild?.firstChild?.type.name, "table_cell");
}

// ── 四、第一格 Shift+Tab：吃掉但不许动文档 ────────────────────
{
  // ⚠️ 真 schema 下的"第一格"就是**表头行第一格**（表头行永远是第一条）。
  const 状态 = 造状态(文(两列表(行(格("a"), 格("b")))), "h1");
  const r = 按Tab(状态, true);
  断言("第一格 Shift+Tab 也要吃掉这颗键（否则焦点飞出编辑器）", r.接了, true);
  断言("第一格 Shift+Tab 不加行", 第一张表(r.状态.doc).childCount, 2);
  断言("第一格 Shift+Tab 光标不动", r.状态.selection.from, 状态.selection.from);
  断言("第一格 Shift+Tab 文档一个字节没动", r.状态.doc.eq(状态.doc), true);
}
{
  // 数据行的第一格按 Shift+Tab 要回到**表头行的最后一格**（跨行回头）。
  const 状态 = 造状态(文(两列表(行(格("a"), 格("b")))), "a");
  const r = 按Tab(状态, true);
  断言("数据行行首按 Shift+Tab 回到表头行行尾", 所在格(r.状态)?.textContent, "h2");
}
{
  const 状态 = 造状态(文(两列表(行(格("a"), 格("b")), 行(格("c"), 格("d")))), "c");
  const r = 按Tab(状态, true);
  断言("第二条数据行行首按 Shift+Tab 回到上一行行尾", 所在格(r.状态)?.textContent, "b");
}

// ── 五、表格外一律放行 ────────────────────────────────────────
{
  const 状态 = 造状态(文(段("一段普通的正文")), "一段普通的正文");
  断言("表格外按 Tab 放行", 按Tab(状态).接了, false);
  断言("表格外按 Shift+Tab 放行", 按Tab(状态, true).接了, false);
}
{
  // 表**后面**那一段也是"表格外"（`isInTable` 看的是选区所在的祖先链）。
  const 状态 = 造状态(文(两列表(行(格("a"), 格("b"))), 段("表后正文")), "表后正文");
  断言("表格后面那一段按 Tab 放行", 按Tab(状态).接了, false);
}
{
  // 表**前面**那一段同理（祖先链里没有 `tableRole: "row"` 的东西）。
  const 状态 = 造状态(文(段("表前正文"), 两列表(行(格("a"), 格("b")))), "表前正文");
  断言("表格前面那一段按 Tab 放行", 按Tab(状态).接了, false);
}

// ── 六、表头行 ────────────────────────────────────────────────
{
  const 状态 = 造状态(文(两列表(行(格("a"), 格("b")))), "h1");
  const r = 按Tab(状态);
  断言("表头第一格按 Tab 落到表头第二格", 所在格(r.状态)?.textContent, "h2");
  断言("表头里按 Tab 没多出行", 第一张表(r.状态.doc).childCount, 2);
}

// ── 七、按键那一道门 与 装配 ──────────────────────────────────
{
  const 状态 = 造状态(文(两列表(行(格("a"), 格("b")))), "a");
  const 键 = (
    改: Partial<{
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
    ...改,
  });
  const 按 = (改 = {}, composing = false): boolean => {
    let 新 = 状态;
    return 表格Tab按键(状态, (tr) => {
      新 = 状态.apply(tr);
    }, 键(改), composing);
  };
  断言("门：表格里普通 Tab 接", 按(), true);
  断言("门：`Shift+Tab` 也接（Shift 不算修饰键）", 按({ shiftKey: true }), true);
  断言("门：`Ctrl+Tab` 放行（那是窗口管理器的）", 按({ ctrlKey: true }), false);
  断言("门：`Alt+Tab` 放行", 按({ altKey: true }), false);
  断言("门：`Cmd+Tab` 放行", 按({ metaKey: true }), false);
  断言("门：别的键放行", 按({ key: "Enter", keyCode: 13 }), false);
  断言("门：组字期间一律放行", 按({}, true), false);
  断言("门：组字期间 Shift+Tab 也放行", 按({ shiftKey: true }, true), false);
  // ⚠️ 下面这几条是 **GTK/X11 上真发生的事**，不是假想（`docs/06` §5.x 目检）：
  // `Shift+Tab` 在 X 里发的是 `ISO_Left_Tab`，WebKit 给不出名字，
  // `event.key` 是 `"Unidentified"`，只有 `keyCode` 还是 9。
  断言(
    "门：X11 的 `Shift+Tab`（key=Unidentified, keyCode=9）必须接住",
    按({ key: "Unidentified", keyCode: 9, shiftKey: true }),
    true,
  );
  断言(
    "门：`key` 认不出来、`keyCode` 也不是 9 的，放行",
    按({ key: "Unidentified", keyCode: 65 }),
    false,
  );
  断言("门：字母 a 放行（keyCode 65）", 按({ key: "a", keyCode: 65 }), false);
}
{
  // ⚠️ dry-run（`dispatch` 缺省）时只回答接不接，**一个字节都不改**：
  // ProseMirror 问"这颗键接不接"时会不带 `dispatch` 调一次。
  const 状态 = 造状态(文(两列表(行(格("a"), 格("b")))), "b");
  const 前 = 状态.doc;
  断言("dry-run 也回答接", 表格Tab处理(状态, undefined, false), true);
  断言("dry-run 没加行", 状态.doc.child(0).childCount, 2);
  断言("dry-run 之后文档还是原来那一个", 状态.doc.eq(前), true);
}
{
  // 装配：只能证明"插件造得出来、键位是那一个"——真挂进编辑器要靠开窗目检。
  const 插件 = 建表格Tab插件();
  断言("插件造得出来", typeof 插件 === "object" && 插件 !== null, true);
  断言("槽位名对上", 插件.spec.key, 表格Tab键);
  断言("工厂每次给新的一份", 建表格Tab插件() === 插件, false);
  断言("`$prose` 那条也造得出来", typeof 表格Tab(), "function");
}

// ── 汇总 ──────────────────────────────────────────────────────
if (失败.length) {
  console.log(失败.join("\n"));
}
console.log(`${败 === 0 ? "通过" : "有失败"} ${过} 条，失败 ${败} 条`);
