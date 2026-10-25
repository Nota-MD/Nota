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
 * # ⚠️ 判据把 U+00A0 当空白（BUG-51）
 *
 * 症状：手打一张表，最后那根收尾竖线敲下去**什么都不发生**。
 *
 * 来路：WebKit 在**行末**插空格时会改用不换行空格（U+00A0）。手打一行表格时，
 * 每颗空格敲下去的那一刻都在行末——于是判据拿到的那一行里，空格**全是** NBSP。
 * 而 markdown 里 NBSP 任何位置都不算空白（实测：分隔行末尾带一颗，remark 就
 * 认不出表格了），所以 `[ \t]` 那套判据一颗都匹配不上。
 *
 * 口径：这里把 NBSP 当空白用，**只放宽判据**。建表时格子内容是从 `起点`/`终点`
 * 之间取的（见 `拆单元格`），两侧那些 padding 连同 NBSP 一起丢掉——所以
 * **NBSP 进不了文件**，落盘字节与 remark 那边完全一致（实测存盘 42 字节全 ASCII）。
 * 反过来说：放宽判据**不会**造出"我认得出、remark 认不出"的表，因为认出来的那一
 * 刻原文就被表格节点替换掉了。`atom-space.ts` 是同一族问题的另一份账（行内原子
 * 后面那颗 NBSP，那边的结论是"文档里换不掉、只能存盘时换"）。
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
// 全仓这个码点只在 `atom-space.ts` 写一次，要用就引这个名字（那个文件头的规矩）。
import { Nbsp } from "./atom-space";

/** 一列的对齐。这三个字符串就是 gfm 的 `alignment` attr 的取值域。 */
export type alignmentValue = "left" | "center" | "right";

/**
 * 一列在 attr 里**真正要填**的值。
 *
 * ⚠️ `null` 是第四个可能值（分隔行里没写冒号），**不是 `'left'`**——填错的后果
 * 是存盘多出冒号，见文件头。
 */
export type columnAlignment = alignmentValue | null;

/** 从一行里拆出来的一个格子。`文本` 是去掉两侧空白后的内容，`起点`/`终点` 是**相对这一行**的字符偏移。 */
export type cell = { text2: string; start4: number; endPoint: number };

/** 判据成立时给出的东西：表头每格的内容，以及每列的对齐。 */
export type tablePredicate = { header: cell[]; align: columnAlignment[] };

/**
 * 表格行内算**空白**的字符。
 *
 * ⚠️ NBSP 必须算进来，@see 文件头那一节。这里只服务于**判据**：拆格子时两侧
 * 用来 trim 的就是它，放宽之后 WebKit 塞的那一串 NBSP 才吃得掉。
 */
function isWhitespace(character: string): boolean {
  return character === " " || character === "\t" || character === Nbsp;
}

/**
 * 只在**比对"覆盖没覆盖整段"**时用的归一：把 NBSP 看成普通空格。
 *
 * ⚠️ 这不是"把 NBSP 当空白"的又一处——`是空白` 管的是拆格子，这里管的是一次
 * 字符串比较。来路见 `表格输入规则` 里那道闸的注释（BUG-51 的真凶）。
 */
const normalizeWhitespace = (text4: string): string => text4.replaceAll(Nbsp, " ");

/**
 * 输入规则那道闸的判据：**匹配有没有盖住整段**（导出只为测试）。
 *
 * 为什么不是简单的 `匹配.startsWith(段文)`：见 `表格输入规则` 里那道闸的注释。
 */
export function matchCoverHoldWholeParagraph(match2: string, paragraphText: string): boolean {
  return normalizeWhitespace(match2).startsWith(normalizeWhitespace(paragraphText));
}

/**
 * 缩进 ≥ 4 列的行在 markdown 里是**缩进代码块**，根本到不了表格这条语法
 * （`micromark` 是在 flow 那一层把行前缀吃掉的）。这边自己判一遍，免得把用户
 * 缩进过的两行正文吃成表格。
 */
export function shrinkEnterPassDark(line3: string): boolean {
  let width = 0;
  for (let i = 0; i < line3.length; i++) {
    const character = line3.charAt(i);
    if (character === " ") width += 1;
    else if (character === "\t") width += 4;
    else break;
    if (width >= 4) return true;
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
export function splitTableCells(line3: string): cell[] {
  const range: { start5: number; end2: number }[] = [];
  let start5 = 0;
  for (let i = 0; i < line3.length; i++) {
    const character = line3.charAt(i);
    if (character === "\\") {
      i += 1; // 转义：连着的下一个字符属于内容
      continue;
    }
    if (character === "|") {
      range.push({ start5, end2: i });
      start5 = i + 1;
    }
  }
  range.push({ start5, end2: line3.length });

  const isWhitespaceParagraph = (paragraph2: { start5: number; end2: number }) => line3.slice(paragraph2.start5, paragraph2.end2).trim() === "";

  // 首尾那两根竖线是**边框**：切出来是空白的那一头不算格子（`| a | b |` 是 2 格）。
  // ⚠️ 两头要**各判各的**，不能"丢了一头就收手"：孤零零一根 `|` 切出两段空白，
  //    两头都丢干净才是 0 格 —— GFM 里 `|` 自己不成行，不是"一个空格子"
  //    （这一条是拿 remark 逐例对出来的：`|` ＋ `| --- |` 那边不认）。
  if (range.length > 0 && isWhitespaceParagraph(range[0]!)) range.shift();
  if (range.length > 0 && isWhitespaceParagraph(range[range.length - 1]!)) range.pop();

  return range.map((paragraph2) => {
    let left = paragraph2.start5;
    let right = paragraph2.end2;
    while (left < right && isWhitespace(line3.charAt(left))) left += 1;
    while (right > left && isWhitespace(line3.charAt(right - 1))) right -= 1;
    return { text2: line3.slice(left, right), start4: left, endPoint: right };
  });
}

/**
 * 一行能不能当**表头行**。能就给出拆好的格子（带偏移，用来搬运文字）。
 *
 * 表头行本身几乎没有限制（GFM 里就是"一行文字"，格子可以是空的），只有两条：
 * 不能是空行（空行在 markdown 里不是段落），以及不能缩进成代码块。
 */
export function isHeaderRow(line3: string): cell[] | null {
  if (shrinkEnterPassDark(line3)) return null;
  if (line3.trim() === "") return null;
  const cell = splitTableCells(line3);
  return cell.length > 0 ? cell : null;
}

/** 一行 pipe 文本能否直接成为表头。至少两列，避免把普通 `|` 正文当成表格。 */
export function isSingleLineTable(line3: string): cell[] | null {
  if (determineSeparatorLine(line3) !== null) return null;
  const cell2 = isHeaderRow(line3);
  return cell2 && cell2.length >= 2 ? cell2 : null;
}

/**
 * 一行能不能当**分隔行**。能就给出每列的对齐。
 *
 * 三件事同时成立才算数（与 `micromark` 的 `headDelimiter*` 状态机一一对应）：
 * 格子数 ≥ 1、每个格子是 `:?-+:?`、整行至少有一个 `|` 或 `:`。
 * ⚠️ 最后那一条是"别把分隔线当表格"的那道闸：`---` 自己不是分隔行。
 */
export function determineSeparatorLine(line3: string): columnAlignment[] | null {
  if (shrinkEnterPassDark(line3)) return null;
  if (!line3.includes("|") && !line3.includes(":")) return null;

  const cell = splitTableCells(line3);
  if (cell.length === 0) return null;

  const align: columnAlignment[] = [];
  for (const cell2 of cell) {
    const match = /^(:?)(-+)(:?)$/.exec(cell2.text2);
    if (!match) return null;
    const hasLeftEmergeNumber = match[1] === ":";
    const hasRightEmergeNumber = match[3] === ":";
    // ⚠️ 没冒号是 `null` 不是 `'left'`（存盘字节不同，见文件头）。
    align.push(hasLeftEmergeNumber && hasRightEmergeNumber ? "center" : hasLeftEmergeNumber ? "left" : hasRightEmergeNumber ? "right" : null);
  }
  return align;
}

/**
 * 两行合起来能不能成一张表。列数对不上就 `null`——remark 那边也不认
 * （`syntax.js` 的 `size !== sizeB`）。
 */
export function isTwoRowTable(headerRow: string, separatorLine: string): tablePredicate | null {
  const header = isHeaderRow(headerRow);
  const align = determineSeparatorLine(separatorLine);
  if (!header || !align) return null;
  if (header.length !== align.length) return null;
  return { header, align };
}

/** 一段是不是**纯文字**（没有硬换行、图片、公式这类非文字的行内节点）。理由见文件头。 */
function allPlainText(paragraph2: PMNode): boolean {
  for (let i = 0; i < paragraph2.childCount; i++) {
    if (!paragraph2.child(i).isText) return false;
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
function getType(schema: Schema) {
  const { table, table_header_row, table_header, table_row, table_cell, paragraph } = schema.nodes;
  if (!table || !table_header_row || !table_header || !table_row || !table_cell || !paragraph) {
    return null;
  }
  return {
    table2: table,
    headerRow: table_header_row,
    header: table_header,
    line3: table_row,
    cell2: table_cell,
    paragraph: paragraph,
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
function tryConvertTable(state: EditorState, separator: ResolvedPos, separatorLine: string): Transaction | null {
  // 只认顶层块，见文件头"边界"。
  if (separator.depth !== 1) return null;

  const localParagraph = separator.parent;
  if (!localParagraph.isTextblock || !allPlainText(localParagraph)) return null;

  const paragraphBefore = separator.before(1);
  if (paragraphBefore <= 0) return null; // 顶上没有上一段
  const aboveParagraph = state.doc.resolve(paragraphBefore).nodeBefore;
  if (!aboveParagraph || aboveParagraph.type.name !== "paragraph" || !allPlainText(aboveParagraph)) return null;

  const determineEvidence = isTwoRowTable(aboveParagraph.textContent, separatorLine);
  if (!determineEvidence) return null;

  const type = getType(state.schema);
  if (!type) return null;

  const aboveParagraphStart = paragraphBefore - aboveParagraph.nodeSize;
  // ⚠️ 是**上段**的内容起点，不是 `段前 + 1`（那是分隔段自己的内容起点）。
  //    这两者差一个段落的宽度，混了就会拿分隔行的字去当表头文字——
  //    无头测试里真踩过：`| --- | ---` 被切出 `-` 和 `|` 两格。
  const aboveParagraphContentStart = aboveParagraphStart + 1;

  // 表头格：把原来那一段里对应格子的**行内内容**（含标记）整块搬过来。
  // ⚠️ 用 `doc.slice` 取，不自己拼文字：拼文字会把粗体/斜体/链接丢掉，
  //    而"丢字"正是这里最不能出的错。
  // ⚠️ `?? null` 是给类型看的（`noUncheckedIndexedAccess` 下索引可能缺），
  //    等长由 `判两行` 保证；真要缺了，也宁可当"没写冒号"，不能退化成 `'left'`。
  const headerCell = determineEvidence.header.map((cell2, order) =>
    type.header.create(
      { alignment: determineEvidence.align[order] ?? null },
      type.paragraph.create(
        null,
        state.doc.slice(aboveParagraphContentStart + cell2.start4, aboveParagraphContentStart + cell2.endPoint).content,
      ),
    ),
  );

  const dataCell = determineEvidence.align.map((align) =>
    type.cell2.create({ alignment: align }, type.paragraph.create()),
  );

  const headerRowNode = type.headerRow.create(null, headerCell);
  const table = type.table2.create(null, [headerRowNode, type.line3.create(null, dataCell)]);

  const tr = state.tr.replaceWith(aboveParagraphStart, separator.after(1), table);

  // 光标进第一行数据格：进 table（+1）→ 跨过表头行 → 进 table_row/table_cell/
  // paragraph（各 +1）。⚠️ 用 `表头行节点.nodeSize` 而不是魔法数字，行高变了也不会错。
  const dataCellContentStart = aboveParagraphStart + 1 + headerRowNode.nodeSize + 3;
  tr.setSelection(TextSelection.near(tr.doc.resolve(dataCellContentStart)));
  return tr.scrollIntoView();
}

/**
 * 把一行 `| 1 | 2 |` 直接换成两列表格。
 *
 * 这是用户 2026-10-21 指定的快捷输入：回车前只有表头行，分隔行由 Nota 补成
 * 无对齐（`null`），并额外生成一行空数据格。输入仍然先经过
 * {@link 判单行表格}，所以普通段落里的竖线不会触发。
 */
export function trySingleLineTable(state: EditorState, line: ResolvedPos): Transaction | null {
  if (line.depth !== 1) return null;
  const localParagraph = line.parent;
  if (!localParagraph.isTextblock || !allPlainText(localParagraph)) return null;

  const cell2 = isSingleLineTable(localParagraph.textContent);
  if (!cell2) return null;
  const type = getType(state.schema);
  if (!type) return null;

  const paragraphStart = line.before(1);
  const contentStart = paragraphStart + 1;
  const headerCell = cell2.map((valueCell) =>
    type.header.create(
      { alignment: null },
      type.paragraph.create(
        null,
        state.doc.slice(contentStart + valueCell.start4, contentStart + valueCell.endPoint).content,
      ),
    ),
  );
  const dataCell = cell2.map(() => type.cell2.create({ alignment: null }, type.paragraph.create()));
  const headerRowNode = type.headerRow.create(null, headerCell);
  const table = type.table2.create(null, [
    headerRowNode,
    type.line3.create(null, dataCell),
  ]);

  const tr = state.tr.replaceWith(paragraphStart, line.after(1), table);
  const dataCellContentStart = paragraphStart + 1 + headerRowNode.nodeSize + 3;
  tr.setSelection(TextSelection.near(tr.doc.resolve(dataCellContentStart)));
  return tr.scrollIntoView();
}

/**
 * 一条**完整的**分隔行（以 `|` 收尾）。
 *
 * 守在这里只是为了让 `InputRule` 有条正则可用；判据的真相在 `判分隔行` 里
 * （正则只管"值不值得再看一眼"）。`[ \t]` 而不是 `\s`：段落里没有换行，
 * 但硬换行/原子节点会以 `￼` 的形式出现在匹配串里，`\s` 收不住它们。
 *
 * ⚠️ 那几个 `\u00a0` 就是 `atom-space.ts` 的 `不换行空格`——正则字面量里引不进
 * 常量名，所以这里**破例**写码点。少了它这条规则在这台机器上根本不会响
 * （手打的表格行里空格全是 NBSP，@see 文件头 BUG-51 那一节）。
 *
 * 导出只为测试（`tests/table-input.test.ts` 逐字对 NBSP 那几例）。
 */
export const receiveTailOfSeparatorLine = /^[ \t\u00a0]*\|?[ \t\u00a0]*(?::?-+:?[ \t\u00a0]*\|[ \t\u00a0]*)+$/;

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
export const tableInputRule = $inputRule(
  () =>
    new InputRule(receiveTailOfSeparatorLine, (state, match, _start, end) => {
      const separator = state.doc.resolve(end);
      if (separator.depth !== 1) return null;
      if (separator.parentOffset !== separator.parent.content.size) return null;
      // ⚠️ **归一之后再比**：这一闸问的是"匹配有没有覆盖整段"，而 `match[0]` 是
      //    `prosemirror-inputrules` 拿「文档文字 ＋ 刚敲进去那颗字符」拼出来的
      //    （`dist/index.js` 的 `run()`）。手打的分隔行里，文档那一颗在**行末**
      //    会是不换行空格、拼进去的这颗是普通字符——逐字比就会在**正当**的情况下
      //    翻车，规则静默退场（BUG-51 的真凶：探针实测「段=`| ---\u00a0`、
      //    配=`| --- |`」两个串只差这一颗）。归一之后它照样挡得住它本来要挡的
      //    事：段落长过 500 字时窗口从中间截断，`match[0]` 只是尾巴，长度对不上。
      if (!matchCoverHoldWholeParagraph(match[0], separator.parent.textContent)) return null;
      return tryConvertTable(state, separator, match[0]);
    }),
);

/**
 * 路 2：按回车。收尾竖线省略了的写法（`| --- | ---`）靠这一路。
 *
 * ⚠️ 为什么不是键位表：见文件头。这里只认**光秃秃的回车**——Shift+Enter
 * （软换行）的绑定在 `commonmark` 那边，别抢（`task-list.ts` 同一句话）。
 */
export const tableInput = $prose(
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
          const separator = selection.$from;
          if (separator.depth !== 1) return false;
          if (separator.parentOffset !== separator.parent.content.size) return false;

          const separator2 = determineSeparatorLine(separator.parent.textContent);
          const tr =
            (separator2 ? tryConvertTable(state, separator, separator.parent.textContent) : null) ??
            trySingleLineTable(state, separator);
          if (!tr) return false;
          view.dispatch(tr);
          return true;
        },
      },
    }),
);
