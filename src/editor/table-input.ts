/**
 * 表格的**打字**建表：敲出「表头行 ＋ 分隔行」，这两段当场变成真表格。
 *
 * # 为什么需要这个文件
 *
 * 上游（`@milkdown/preset-gfm`）确实带了一条建表的输入规则，但它只认 `|3x2|`
 * 这种**速记**（`node_modules/@milkdown/preset-gfm/src/node/table/input.ts:29-55`，
 * 正则 `/^\|(?<col>\d+)[xX](?<row>\d+)\|\s$/`），**标准 Markdown 表格语法一个都
 * 不认**——用户敲
 *
 * ```
 * | a | b |
 * | --- | --- |
 * ```
 *
 * 得到的是**两行普通文字**（`docs/07` 第 55 项 ①）。表格节点、`tableEditing`、
 * 打开/存盘（`parseMarkdown`/`toMarkdown`）都是好的，**缺的只有这一条输入法**：
 * 在那之前，插表格只有菜单里写死的 3×3 一条路。
 *
 * # 判据：与解析器同一把尺子
 *
 * 这里的判据是**照 `micromark` 的 GFM 表格扩展写的**，也就是本仓打开文件时
 * `parseMarkdown` 走的那条路（`node_modules/micromark-extension-gfm-table/dev/lib/syntax.js`，
 * 分隔行的状态机在 `headDelimiterBefore` … `headDelimiterCellAfter`，那一行
 * `if (!seen || size !== sizeB) return headDelimiterNok(code)` 是关键）。这不是
 * 抄近路，而是**唯一站得住的口径**：
 *
 * - 我认的，remark 也一定认 ⇒ 这次转换只是把「存盘再打开**本来就会**变成的事」
 *   提前到眼前，用户看到的和文件里的是同一张表；
 * - remark 不认的，我也不认 ⇒ 不会出现"我建了表、存盘再打开却散成两行字"的错位。
 *
 * 一条条对应过来：
 * - 分隔行每个格子必须是 `:?-+:?`（至少一个减号，两侧可带对齐冒号）；
 * - 分隔行**至少要有一个 `|` 或 `:`**（`syntax.js` 里那个 `seen`）。少了这条，
 *   `| a |` 下面跟一行 `---` 就会被吃成表——而那是**分隔线**（thematic break），
 *   不是表格；
 * - **分隔行的格子数必须等于表头行的格子数**（`size !== sizeB` 那条）；
 * - 两行都允许省略两侧竖线（`a | b` ＋ `--- | ---` 是合法表格），也允许空格、
 *   允许 `\t`；这是 GFM 的规矩，不是我放宽的；
 * - 缩进 ≥ 4 列的行**不算**：那在 markdown 里是缩进代码块，到不了表格这条语法；
 * - 表头行必须是**一整行**：段里有硬换行（`Shift+Enter`）或行内原子节点
 *   （图片、公式）时**不转**。后者的理由很实在——搬运表头文字靠的是
 *   "文字偏移 ＝ 文档位置"，而这类节点在 `textContent` 里不占位，偏移会算错，
 *   算错的后果是**搬错字**。
 *
 * ⚠️ **误判的代价是不对称的**：该转没转，用户看到的是"没反应"，再按一次回车
 * 或去用菜单就行；**认错**则会**吃掉用户的两行正文**，还得 Ctrl+Z 才回得来。
 * 所以凡是拿不准的写法一律**不认**：宁可不转，不吃字。
 *
 * # 对齐的三个值：`null` 不是 `'left'`
 *
 * gfm 的 `table_header`/`table_cell` 带一个 `alignment` attr
 * （`node_modules/@milkdown/preset-gfm/src/node/table/schema.ts:13-21`，
 * `cellAttributes.alignment`，**默认值 `'left'`**）。但解析器给"没写冒号"的列
 * 填的是 **`null`**，不是 `'left'`：micromark 判出来的是字符串 `'none'`
 * （`micromark-extension-gfm-table/dev/lib/infer.js` 的 `gfmTableAlign`），
 * `mdast-util-gfm-table` 把 `'none'` 翻成 `null`（`lib/index.js:72`
 * `return d === 'none' ? null : d`），`schema.ts` 再把它原样塞进 attr。
 *
 * ⚠️ 这两个值**存盘写出来的字节不一样**：`markdown-table` 把 `'left'` 画成
 * `:---`、把 `null` 画成 `---`（`node_modules/markdown-table/index.js:248-252`，
 * 那里 `code === 108`（也就是字符 `l`）时 `before = ':'`）。图省事全填默认值的话，
 * 用户敲的 `| --- | --- |` 一存盘就变成 `| :--- | :--- |`——**往文件里加了冒号**，
 * 正是 `docs/07` 第 56 项那一类"打开再存，字节变了"。所以这里**照分隔行原样翻**：
 * `:--`→`left`、`:-:`→`center`、`--:`→`right`、`---`→`null`。
 *
 * # 两条触发路（缺一不可）
 *
 * 1. **分隔行敲完那一下**（`$inputRule`）：收尾那个 `|` 一落下去就换。
 *    判据要求那一行**以 `|` 收尾**——用户还想接着打第四列时不会被抢走
 *    （`| --- | ---` 这种没收尾的不算数，交给第 2 条）。
 *    ⚠️ 与上游那条速记规则一样走 `$inputRule`，于是**输入法（IME）那条路也顺带
 *    有了**：`prosemirror-inputrules` 在 `compositionend` 里会再跑一次匹配
 *    （`inputrules.ts:98-104`），而中文输入法把 `|` 走组合键送进来时，只有这一路
 *    看得见。
 * 2. **按回车**（`$prose` 的 `handleKeyDown`）：收尾竖线省略了的写法
 *    （`| --- | ---`）由这一路兜住，转换后光标直接落进第一行数据格。
 *    ⚠️ **必须是 `handleKeyDown`，不能写成 `$useKeymap` 抢 priority**：合并键位表
 *    里 `Enter` 已经被占着了（`baseKeymap` 的 `chainCommands(newlineInCode,
 *    createParagraphNear, liftEmptyBlock, splitBlock)`，由
 *    `@milkdown/core/src/internal-plugin/editor-state.ts:94-95` 的
 *    `km.addBaseKeymap()` 加进来），走那条路要跟一堆命令抢优先级；而 `handleKeyDown`
 *    在 props 顺序上**天然排在合并键位表前面**——`editor-state.ts:100-113` 的
 *    `const plugins = [...prosePlugins, …, createInputRules({rules}), createKeymap(km.build())]`，
 *    而 `prosemirror-view` 的 `someProp` 按 `state.plugins` 顺序取**第一个**非空返回
 *    （`node_modules/prosemirror-view/dist/index.js:5692-5709`）。`task-list.ts` 里
 *    那条 `handleKeyDown` 走的就是同一条路。
 *
 * # 边界（不做的事）
 *
 * - **只认顶层块**（`depth === 1`）。列表项/引用里那两段**不转**：markdown 表达
 *   不了"列表项里的表格"，引用里那两行中间会多出一层 `>`，remark 也不会把它们
 *   当成相邻两行——转了就是造一份**打开就散**的文档。`insert.ts` 里那条
 *   转任务列表也是同样的边界。
 * - **不动 Tab**：`docs/07` 第 55 项 ②③（末格 Tab 塞两个空格、`Shift+Tab`
 *   没反应）归 `@milkdown/kit/plugin/indent`，与本文件无关，这里一个字节没碰。
 * - **不动空单元格那个已知 bug**：第 56 项"空单元格存盘成字面 `<br />`"照旧。
 *   新建的数据格就是**一个空段落**，与菜单那条 `insertTableCommand` 造出来的
 *   完全同形（`preset-gfm` 的 `utils/create-table.ts:13-31` 也是 `createAndFill()`
 *   出来的空段落），所以既没修好也没弄坏。
 * - **不动 `create.ts`**：接线由调用方加（要加的那几行见 `create.ts` 里
 *   `.use(taskList)` 那一段附近）。
 *
 * # 已知的口径差别（不打算修，记一笔）
 *
 * 1. 表头格子里**行内代码里的竖线**（`` | `a|b` | c | ``）按 GFM 的规矩是**分隔符**
 *    （GFM 里只有 `\|` 才算转义）。这里跟着 GFM 拆成 3 格——与"存盘再打开"拆出来
 *    的格子数一致，但**行内代码那两个反引号会留在文字里**（活文档里它们是 mark）。
 *    数格子一致才是要紧的事，这个差别不动它。
 * 2. 表头里打了 `\|`（写一个**字面**竖线）时，文字是**原样**搬进格子的
 *    （格子里就是 `a\|b`），而解析器读同一个文件会解成 `a|b`。差别只在**内存里
 *    的活文字**，落盘字节是一样的：`markdown-table`（`mdast-util-gfm-table/lib/index.js:33`
 *    引的就是它，preset-gfm 的表格序列化最终走这里）对 `a\|b` 原样输出 `| a\|b | c |`。
 *    之所以不在这里把 `\|` 解成 `|`：解码得**重建文字节点**，那就把"整块搬、标记
 *    一起搬"的做法丢了，为一个罕见的写法冒丢标记的险不划算。
 * 3. 与它相邻的一个**既有**问题，本文件不碰：`markdown-table` 不给格子里的**裸**
 *    `|` 加转义（实测 `["a|b","c"]` → `| a|b | c |`），所以"格子里真的存了一个
 *    裸竖线"的表，存盘再接回去会被拆成多一格。这跟打字这条路无关（裸 `|` 在这里
 *    就是分隔符，进不了格子），是存盘那条路自己的事。
 */

import { InputRule } from "@milkdown/kit/prose/inputrules";
import type { Node as PMNode, ResolvedPos, Schema } from "@milkdown/kit/prose/model";
import { Plugin, PluginKey, TextSelection } from "@milkdown/kit/prose/state";
import type { EditorState, Transaction } from "@milkdown/kit/prose/state";
import { $inputRule, $prose } from "@milkdown/kit/utils";

/** 一列的对齐。这三个字符串就是 gfm 的 `alignment` attr 的取值域。 */
export type 对齐值 = "left" | "center" | "right";

/**
 * 一列在 attr 里**真正要填**的值。
 *
 * ⚠️ `null` 是第四个可能值（分隔行里没写冒号），**不是 `'left'`**——填错的后果
 * 是存盘多出冒号，见文件头。
 */
export type 列对齐 = 对齐值 | null;

/** 从一行里拆出来的一个格子。`文本` 是去掉两侧空白后的内容，`起点`/`终点` 是**相对这一行**的字符偏移。 */
export type 格子 = { 文本: string; 起点: number; 终点: number };

/** 判据成立时给出的东西：表头每格的内容，以及每列的对齐。 */
export type 表格判据 = { 表头: 格子[]; 对齐: 列对齐[] };

function 是空白(字符: string): boolean {
  return 字符 === " " || 字符 === "\t";
}

/**
 * 缩进 ≥ 4 列的行在 markdown 里是**缩进代码块**，根本到不了表格这条语法
 * （`micromark` 是在 flow 那一层把行前缀吃掉的）。这边自己判一遍，免得把用户
 * 缩进过的两行正文吃成表格。
 */
export function 缩进过深(行: string): boolean {
  let 宽 = 0;
  for (let i = 0; i < 行.length; i++) {
    const 字符 = 行.charAt(i);
    if (字符 === " ") 宽 += 1;
    else if (字符 === "\t") 宽 += 4;
    else break;
    if (宽 >= 4) return true;
  }
  return false;
}

/**
 * 按 GFM 的规矩把一行拆成格子。
 *
 * 两条容易写错的：
 * - **`\|` 是内容里的竖线，不是分隔符**（`syntax.js` 的 `headRowEscape`）。
 *   GFM 只认这一个例外，行内代码里的竖线**照样分隔**（见文件头末段）。
 * - 首尾那两根竖线是**边框**，不算格子：`| a | b |` 是 2 格不是 4 格。
 *   ⚠️ 但 `| a ||` 是 **2** 格（末尾那个空格子要留着），所以判据是"切出来那段
 *   空白才算边框"，而不是"切出来是空串才算"。
 */
export function 拆单元格(行: string): 格子[] {
  const 区间: { 起: number; 止: number }[] = [];
  let 起 = 0;
  for (let i = 0; i < 行.length; i++) {
    const 字符 = 行.charAt(i);
    if (字符 === "\\") {
      i += 1; // 转义：连着的下一个字符属于内容
      continue;
    }
    if (字符 === "|") {
      区间.push({ 起, 止: i });
      起 = i + 1;
    }
  }
  区间.push({ 起, 止: 行.length });

  const 是空白段 = (段: { 起: number; 止: number }) => 行.slice(段.起, 段.止).trim() === "";

  // 首尾那两根竖线是**边框**：切出来是空白的那一头不算格子（`| a | b |` 是 2 格）。
  // ⚠️ 两头要**各判各的**，不能"丢了一头就收手"：孤零零一根 `|` 切出两段空白，
  //    两头都丢干净才是 0 格 —— GFM 里 `|` 自己不成行，不是"一个空格子"
  //    （这一条是拿 remark 逐例对出来的：`|` ＋ `| --- |` 那边不认）。
  if (区间.length > 0 && 是空白段(区间[0]!)) 区间.shift();
  if (区间.length > 0 && 是空白段(区间[区间.length - 1]!)) 区间.pop();

  return 区间.map((段) => {
    let 左 = 段.起;
    let 右 = 段.止;
    while (左 < 右 && 是空白(行.charAt(左))) 左 += 1;
    while (右 > 左 && 是空白(行.charAt(右 - 1))) 右 -= 1;
    return { 文本: 行.slice(左, 右), 起点: 左, 终点: 右 };
  });
}

/**
 * 一行能不能当**表头行**。能就给出拆好的格子（带偏移，用来搬运文字）。
 *
 * 表头行本身几乎没有限制（GFM 里就是"一行文字"，格子可以是空的），只有两条：
 * 不能是空行（空行在 markdown 里不是段落），以及不能缩进成代码块。
 */
export function 判表头行(行: string): 格子[] | null {
  if (缩进过深(行)) return null;
  if (行.trim() === "") return null;
  const 格子 = 拆单元格(行);
  return 格子.length > 0 ? 格子 : null;
}

/**
 * 一行能不能当**分隔行**。能就给出每列的对齐。
 *
 * 三件事同时成立才算数（与 `micromark` 的 `headDelimiter*` 状态机一一对应）：
 * 格子数 ≥ 1、每个格子是 `:?-+:?`、整行至少有一个 `|` 或 `:`。
 * ⚠️ 最后那一条是"别把分隔线当表格"的那道闸：`---` 自己不是分隔行。
 */
export function 判分隔行(行: string): 列对齐[] | null {
  if (缩进过深(行)) return null;
  if (!行.includes("|") && !行.includes(":")) return null;

  const 格子 = 拆单元格(行);
  if (格子.length === 0) return null;

  const 对齐: 列对齐[] = [];
  for (const 格 of 格子) {
    const 命中 = /^(:?)(-+)(:?)$/.exec(格.文本);
    if (!命中) return null;
    const 有左冒号 = 命中[1] === ":";
    const 有右冒号 = 命中[3] === ":";
    // ⚠️ 没冒号是 `null` 不是 `'left'`（存盘字节不同，见文件头）。
    对齐.push(有左冒号 && 有右冒号 ? "center" : 有左冒号 ? "left" : 有右冒号 ? "right" : null);
  }
  return 对齐;
}

/**
 * 两行合起来能不能成一张表。列数对不上就 `null`——remark 那边也不认
 * （`syntax.js` 的 `size !== sizeB`）。
 */
export function 判两行(表头行: string, 分隔行: string): 表格判据 | null {
  const 表头 = 判表头行(表头行);
  const 对齐 = 判分隔行(分隔行);
  if (!表头 || !对齐) return null;
  if (表头.length !== 对齐.length) return null;
  return { 表头, 对齐 };
}

/** 一段是不是**纯文字**（没有硬换行、图片、公式这类非文字的行内节点）。理由见文件头。 */
function 全为文字(段: PMNode): boolean {
  for (let i = 0; i < 段.childCount; i++) {
    if (!段.child(i).isText) return false;
  }
  return true;
}

/**
 * 表相关的六个节点类型，全部从 `state.schema` **现取**。
 *
 * ⚠️ 不 import `preset-gfm` 里的常量（`insert.ts` 顶上记过为什么：gfm 包出来的
 * 是**另一个**同名节点对象，拿旧对象去比会被拒），也不深链进包的内部路径。
 * 名字来自 `preset-gfm/src/node/table/schema.ts:24/70/130/173/207` 那五处
 * `$nodeSchema('…')` 的 id。
 */
function 取类型(schema: Schema) {
  const { table, table_header_row, table_header, table_row, table_cell, paragraph } = schema.nodes;
  if (!table || !table_header_row || !table_header || !table_row || !table_cell || !paragraph) {
    return null;
  }
  return {
    表: table,
    表头行: table_header_row,
    表头: table_header,
    行: table_row,
    格: table_cell,
    段落: paragraph,
  };
}

/**
 * 把「表头那一段 ＋ 分隔行那一段」换成一张表。
 *
 * 返回 `null` ＝ 判据不够（不是顶层块、上一段不是表头行、列数对不上……），
 * 调用方当作什么都没发生。
 *
 * 造出来的表：**表头行（文字按格子搬过来，标记一起搬）＋ 一行空数据行**，
 * 光标落在第一行数据格里——用户敲完分隔行之后本来要打的就是数据。
 */
function 试换表格(state: EditorState, $分隔: ResolvedPos, 分隔行: string): Transaction | null {
  // 只认顶层块，见文件头"边界"。
  if ($分隔.depth !== 1) return null;

  const 本段 = $分隔.parent;
  if (!本段.isTextblock || !全为文字(本段)) return null;

  const 段前 = $分隔.before(1);
  if (段前 <= 0) return null; // 顶上没有上一段
  const 上段 = state.doc.resolve(段前).nodeBefore;
  if (!上段 || 上段.type.name !== "paragraph" || !全为文字(上段)) return null;

  const 判据 = 判两行(上段.textContent, 分隔行);
  if (!判据) return null;

  const 类型 = 取类型(state.schema);
  if (!类型) return null;

  const 上段起点 = 段前 - 上段.nodeSize;
  // ⚠️ 是**上段**的内容起点，不是 `段前 + 1`（那是分隔段自己的内容起点）。
  //    这两者差一个段落的宽度，混了就会拿分隔行的字去当表头文字——
  //    无头测试里真踩过：`| --- | ---` 被切出 `-` 和 `|` 两格。
  const 上段内容起点 = 上段起点 + 1;

  // 表头格：把原来那一段里对应格子的**行内内容**（含标记）整块搬过来。
  // ⚠️ 用 `doc.slice` 取，不自己拼文字：拼文字会把粗体/斜体/链接丢掉，
  //    而"丢字"正是这里最不能出的错。
  // ⚠️ `?? null` 是给类型看的（`noUncheckedIndexedAccess` 下索引可能缺），
  //    等长由 `判两行` 保证；真要缺了，也宁可当"没写冒号"，不能退化成 `'left'`。
  const 表头格 = 判据.表头.map((格, 序) =>
    类型.表头.create(
      { alignment: 判据.对齐[序] ?? null },
      类型.段落.create(
        null,
        state.doc.slice(上段内容起点 + 格.起点, 上段内容起点 + 格.终点).content,
      ),
    ),
  );

  const 数据格 = 判据.对齐.map((对齐) =>
    类型.格.create({ alignment: 对齐 }, 类型.段落.create()),
  );

  const 表头行节点 = 类型.表头行.create(null, 表头格);
  const 表格 = 类型.表.create(null, [表头行节点, 类型.行.create(null, 数据格)]);

  const tr = state.tr.replaceWith(上段起点, $分隔.after(1), 表格);

  // 光标进第一行数据格：进 table（+1）→ 跨过表头行 → 进 table_row/table_cell/
  // paragraph（各 +1）。⚠️ 用 `表头行节点.nodeSize` 而不是魔法数字，行高变了也不会错。
  const 数据格内容起点 = 上段起点 + 1 + 表头行节点.nodeSize + 3;
  tr.setSelection(TextSelection.near(tr.doc.resolve(数据格内容起点)));
  return tr.scrollIntoView();
}

/**
 * 一条**完整的**分隔行（以 `|` 收尾）。
 *
 * 守在这里只是为了让 `InputRule` 有条正则可用；判据的真相在 `判分隔行` 里
 * （正则只管"值不值得再看一眼"）。`[ \t]` 而不是 `\s`：段落里没有换行，
 * 但硬换行/原子节点会以 `￼` 的形式出现在匹配串里，`\s` 收不住它们。
 */
const 收尾的分隔行 = /^[ \t]*\|?[ \t]*(?::?-+:?[ \t]*\|[ \t]*)+$/;

/**
 * 路 1：分隔行敲完那一下（含输入法把 `|` 送进来的那条路）。
 *
 * 三道闸，缺一不可：
 * 1. 光标在**本段文字的末尾**——整段得就是这一行；
 * 2. 匹配从段落开头起（`prosemirror-inputrules` 是拿"光标前最多 500 字"去匹配的，
 *    段落一长窗口就会从中间截断，那时 `match[0]` 只是段落的一个尾巴）；
 * 3. `match[0]` 以这段文字开头——即匹配覆盖了整段（1、3 合起来才敢用 `match[0]`
 *    当"用户最终想要的那一行"）。
 */
export const 表格输入规则 = $inputRule(
  () =>
    new InputRule(收尾的分隔行, (state, match, _start, end) => {
      const $分隔 = state.doc.resolve(end);
      if ($分隔.depth !== 1) return null;
      if ($分隔.parentOffset !== $分隔.parent.content.size) return null;
      if (!match[0].startsWith($分隔.parent.textContent)) return null;
      return 试换表格(state, $分隔, match[0]);
    }),
);

/**
 * 路 2：按回车。收尾竖线省略了的写法（`| --- | ---`）靠这一路。
 *
 * ⚠️ 为什么不是键位表：见文件头。这里只认**光秃秃的回车**——Shift+Enter
 * （软换行）的绑定在 `commonmark` 那边，别抢（`task-list.ts` 同一句话）。
 */
export const 表格输入 = $prose(
  () =>
    new Plugin({
      key: new PluginKey("nota-table-input"),
      props: {
        handleKeyDown: (view, event) => {
          if (event.key !== "Enter" || event.isComposing) return false;
          if (event.shiftKey || event.ctrlKey || event.metaKey || event.altKey) return false;

          const { state } = view;
          const { selection } = state;
          if (!selection.empty) return false;
          const $分隔 = selection.$from;
          if ($分隔.depth !== 1) return false;
          if ($分隔.parentOffset !== $分隔.parent.content.size) return false;

          const tr = 试换表格(state, $分隔, $分隔.parent.textContent);
          if (!tr) return false;
          view.dispatch(tr);
          return true;
        },
      },
    }),
);
