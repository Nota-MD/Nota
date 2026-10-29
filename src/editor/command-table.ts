/**
 * 命令白名单的**实体**：`EditorCommand` 的每一项落到哪个 Milkdown 命令上。
 *
 * # 它为什么单独一个文件（2026-09-28）
 *
 * **搬的原因只有行数一个**：`create.ts` 到 1010 行、越过了 1000 行硬上限，
 * 于是把这一段整段搬出来，内容一个字节没改——同 2026-09-26 那次
 * （`create-types.ts`，那次是 1036 行）。
 *
 * ⚠️ 挑中它是因为它**没有线头**：谁都不认识它、它也不认识谁（只吃一个
 * `editor` 与一个 payload），搬走之后 `create.ts` 那边只剩一个
 * {@link 跑命令} 的调用点。换成搬别的（比如 `.use()` 那条链）就得把十来个
 * 上下文一起带走。
 *
 * # 它是什么
 *
 * 一张 `Record<EditorCommand, …>`：键是**编辑器命令**的名字（`bold` / `ul` /
 * `tableRowBelow`…），值是"怎么把它派给 Milkdown"。`h1`~`h6` 不在这张表里
 * ——它们共用一条命令、只是层数不同，见 {@link 跑命令} 里那个分支。
 *
 * ⚠️ **加一条新命令要改两处**：`create-types.ts` 的 `EditorCommand`（类型）
 * 与这里的表（实现）。⚠️ 少改前者的症状是"命令根本传不进来"，少改后者的
 * 症状是**编译错**（`Record` 缺键）——后者反而好办。⚠️ 斜杠菜单那张表
 * （`editor/slash.ts`）的 id 与这里的键**同名**，加命令时它也要看一眼。
 *
 * ⚠️ 表里存的是 `$Command` 的**回调**而不是 `$Command` 本身：Milkdown 的
 * `callCommand` 要的是 `slice.key`，直接传 `$Command` 过不了类型
 *（`$Command<T>` 是个带 `run`/`key` 的插件对象，不是 `CmdKey`）。
 * 包成"吃一个 editor"的闭包之后，调用点也不必再碰 Milkdown 的类型。
 *
 * ⚠️ **真相只有这一份**：界面那一侧（`ui/commands.ts`）是另一张表，两张表
 * 的桥在 `ui/useCommandTable.ts`，口径写在 `docs/05`。
 */

import { editorViewCtx, type Editor } from "@milkdown/kit/core";
import {
  toggleStrongCommand,
  toggleEmphasisCommand,
  wrapInHeadingCommand,
  turnIntoTextCommand,
  wrapInBlockquoteCommand,
  wrapInBulletListCommand,
  wrapInOrderedListCommand,
  createCodeBlockCommand,
  insertHrCommand,
  insertImageCommand,
  toggleLinkCommand,
} from "@milkdown/kit/preset/commonmark";
import {
  toggleStrikethroughCommand,
  insertTableCommand,
  addRowBeforeCommand,
  addRowAfterCommand,
  addColBeforeCommand,
  addColAfterCommand,
} from "@milkdown/kit/preset/gfm";
import { undoCommand, redoCommand } from "@milkdown/kit/plugin/history";
import { lift } from "@milkdown/kit/prose/commands";
import { liftListItem } from "@milkdown/kit/prose/schema-list";
import type { EditorState, Transaction } from "@milkdown/kit/prose/state";
import type { NodeType } from "@milkdown/kit/prose/model";
import type { EditorView } from "@milkdown/kit/prose/view";
import { callCommand } from "@milkdown/kit/utils";

import { inlineMarkCommand } from "./inline-marks";
import { convertBecomeTaskTaskColumnTable, clearRemoveCellStyle, deleteTableRow, deleteTableColumn, deleteWholeTable, insertCommonStyleBlock, insertItemRecord, toggleTableRowHeaders } from "./insert";
import { insertFootNote } from "./footnote";
import { githubAlertNode } from "./github-alert-edit";
import { selectLine, selectWord, selectSentence, removeWord } from "./select";
import { moveBlock } from "./move-block";
import { installLink, removeLink } from "./link-edit";
import {
  duplicateCurrentTable,
  alignCurrentTableColumn,
  formatCurrentTable,
  resizeCurrentTable,
  moveCurrentTableColumn,
  moveCurrentTableRow,
} from "./table-context";
import type { CommandPayload, EditorCommand } from "./create-types";

/** `h1`~`h6`。它们共用一条命令，只是层数不同，所以单独一族。 */
type HeadingCommand = `h${1 | 2 | 3 | 4 | 5 | 6}`;

/**
 * ⚠️ `frontMatter` 也**不在下面那张表里**（`docs/07` 第 64 项）：它换的是**文档树
 * 之外**的那一段（`front-matter.ts`），而这张表的每一项只拿得到 `(editor, payload)`
 * ——没有那段文本、也没有 `onChange`，写不出正确实现。它的实现落在
 * `create.ts::跑一条命令` 里（`Exclude` 是**编译期**的保证：谁要把它塞进
 * `COMMANDS`，这里当场报缺键/多键）。
 */
type BlockCommand = Exclude<EditorCommand, HeadingCommand | "frontMatter">;

/**
 * 下面那张表**吃得下**的命令名。`跑命令` 收这个，不收整个 `EditorCommand`：
 * 调用方（`create.ts::跑一条命令`）先把 `frontMatter` 那一条拦走，剩下的才能
 * 进来——这个类型让"拦没拦"在编译期就查得出来。
 */
export type tableCommand = Exclude<EditorCommand, "frontMatter">;

const HEADING_RE = /^h([1-6])$/;

/**
 * ⚠️ 类型谓词而不是 `as`。写成 `HEADING_RE.test(name)` 的话 TS 收窄不了，
 * 后面查表就得 `as` 一下——而那个 `as` 会把"表里漏了一项"这种错误也一起放过去。
 * 写成谓词，两个分支各自拿到准确类型，漏项仍然是编译错。
 */
function isHeading(name: EditorCommand): name is HeadingCommand {
  return HEADING_RE.test(name);
}

/**
 * 光标所在块是不是**同一级标题**。
 *
 * 菜单和工具栏上的 H1/H2/H3 是开关：已经在 H1 时再点 H1 应退回正文；
 * 在 H2 时点 H1 仍应改成 H1。判据只看当前最内层文本块，列表/引用里的标题也成立。
 */
export function sameLayerMarkTitle(state: EditorState, level: number): boolean {
  const { $from } = state.selection;
  return $from.parent.type.name === "heading" && $from.parent.attrs.level === level;
}

/** 光标当前是否落在代码块里（含代码块里的 NodeSelection）。 */
export function cursorAtCodeBlock(state: EditorState): boolean {
  const { $from } = state.selection;
  for (let depth = $from.depth; depth > 0; depth--) {
    if ($from.node(depth).type.name === "code_block") return true;
  }
  return false;
}

/**
 * 行内代码是**开关型标记**，并且必须支持“没有选区”的工具栏点击。
 *
 * 上游 `toggleInlineCodeCommand` 在空选区直接返回 `false`，于是工具栏那颗按钮
 * 看着能按、命令却立刻被报成“当前模式不可用”。这里按编辑器通行语义处理：
 * 空选区时改 `storedMarks`，下一次输入带行内代码；再点一次则取消待输入标记。
 */
export function splitReplaceInlineCode(
  state: EditorState,
  dispatch?: (tr: Transaction) => void,
): boolean {
  const type = state.schema.marks.inlineCode;
  if (!type) return false;
  const { from, to, empty, $from } = state.selection;

  if (empty) {
    const alreadyOpen = (state.storedMarks ?? $from.marks()).some((m) => m.type === type);
    const tr = state.tr;
    if (alreadyOpen) {
      tr.removeStoredMark(type);
    } else {
      for (const mark of Object.values(state.schema.marks)) {
        if (mark !== type) tr.removeStoredMark(mark);
      }
      tr.addStoredMark(type.create());
    }
    dispatch?.(tr.scrollIntoView());
    return true;
  }

  if (state.doc.rangeHasMark(from, to, type)) {
    dispatch?.(state.tr.removeMark(from, to, type).scrollIntoView());
    return true;
  }

  const tr = state.tr;
  for (const mark of Object.values(state.schema.marks)) {
    if (mark !== type) tr.removeMark(from, to, mark);
  }
  dispatch?.(tr.addMark(from, to, type.create()).scrollIntoView());
  return true;
}

/**
 * 命令白名单的**实体**。
 *
 * ⚠️ 存的是 `$Command` 的**回调**而不是 `$Command` 本身：Milkdown 的
 * `callCommand` 要的是 `slice.key`，直接传 `$Command` 过不了类型
 *（`$Command<T>` 是个带 `run`/`key` 的插件对象，不是 `CmdKey`）。
 * 包成"吃一个 editor"的闭包之后，调用点也不必再碰 Milkdown 的类型。
 */
const COMMANDS: Record<BlockCommand, (editor: Editor, payload?: CommandPayload) => void> = {
  undo: (e) => e.action(callCommand(undoCommand.key)),
  redo: (e) => e.action(callCommand(redoCommand.key)),
  bold: (e) => e.action(callCommand(toggleStrongCommand.key)),
  italic: (e) => e.action(callCommand(toggleEmphasisCommand.key)),
  inlineCode: (e) =>
    e.action((ctx) => {
      const view = ctx.get(editorViewCtx);
      return splitReplaceInlineCode(view.state, (tr) => view.dispatch(tr));
    }),
  strike: (e) => e.action(callCommand(toggleStrikethroughCommand.key)),
  // 行内标记四条（高亮 / 上标 / 下标 / 下划线）。**不跟开关走**：命令表是
  // 静态的，而"这条命令能不能跑"取决于开关的话，菜单项的灰/亮就得跟着设置变
  // ——那是另一件事（`ui/commands.ts` 的 `命令能否用`）。关掉高亮的用户
  // 从格式化工具栏点一下，读到的是"这条通路上没实现"，那是个谎。
  // 真相是：**关掉的是解析与输入，不是这条能力**。
  highlight: (e) => e.action(callCommand(inlineMarkCommand[0]!.key)),
  superscript: (e) => e.action(callCommand(inlineMarkCommand[1]!.key)),
  subscript: (e) => e.action(callCommand(inlineMarkCommand[2]!.key)),
  underline: (e) => e.action(callCommand(inlineMarkCommand[3]!.key)),
  kbd: (e) => e.action(callCommand(inlineMarkCommand[4]!.key)),
  comment: (e) =>
    e.action((ctx) => {
      const view = ctx.get(editorViewCtx);
      const { from, to } = view.state.selection;
      const text = view.state.doc.textBetween(from, to, "\n");
      const html = view.state.schema.nodes.html;
      if (!html) return;
      const tr = view.state.tr.replaceSelectionWith(
        html.create({ value: `<!-- ${text} -->` }),
      );
      view.dispatch(tr);
      view.focus();
    }),
  text: (e) => e.action(callCommand(turnIntoTextCommand.key)),
  // ⚠️⚠️ **这三条是「切换」不是「再包一层」**（2026-10-16 修的用户报的缺陷）：
  // 上游那三条（`wrapInBlockquote` / `wrapInBulletList` / `wrapInOrderedList`）
  // 走的是 `prosemirror-commands` 的 `wrapIn`，那个**无条件往外面再裹一层**
  // ——用户连点五下「引用」，正文里就长出五层引用（他报的截图正是那样：
  // 左边一排套着的竖线）。菜单/工具栏那一颗按钮的语义是**开关**，不是"再包一层"。
  quote: (e) => splitReplacePackageWrap(e, "blockquote", () => e.action(callCommand(wrapInBlockquoteCommand.key))),
  ul: (e) => splitReplacePackageWrap(e, "bullet_list", () => e.action(callCommand(wrapInBulletListCommand.key))),
  ol: (e) => splitReplacePackageWrap(e, "ordered_list", () => e.action(callCommand(wrapInOrderedListCommand.key))),
  task: (e) => convertBecomeTaskTaskColumnTable(e),
  // 与其他块级按钮一致：在代码块里再按一次退回普通段落。上游
  // `createCodeBlockCommand` 在“已经是代码块”时返回 false，图标看着能点却完全没有
  // 反馈；工具栏按钮必须始终是一次可见的切换。
  codeBlock: (e) =>
    e.action(
      callCommand(
        (cursorAtCodeBlock(e.ctx.get(editorViewCtx).state)
          ? turnIntoTextCommand
          : createCodeBlockCommand
        ).key,
      ),
    ),
  hr: (e) => e.action(callCommand(insertHrCommand.key)),
  // 公式块：`plugin-math` 没有插入命令，见 `insert.ts` 的 `插公式块`（2026-09-26）。
  mathBlock: (e) => insertCommonStyleBlock(e),
  // 内容目录：插一段普通 markdown 列表，两头用注释夹住；已有就原地更新。
  // ⚠️ `strict` 由上面带进来（缺省 = 宽松），编辑器实例自己不知道这个设置——
  // 理由写在 `create-types.ts::CommandPayload.strict`。
  toc: (e, p) => insertItemRecord(e, p?.strict ?? false),
  // 脚注：gfm 给了节点与解析/序列化，缺"从零插一条"，见 `footnote.ts`（2026-09-27）。
  footnote: (e) => insertFootNote(e),
  alertNote: (e) => githubAlertNode(e, "note"),
  alertTip: (e) => githubAlertNode(e, "tip"),
  alertImportant: (e) => githubAlertNode(e, "important"),
  alertWarning: (e) => githubAlertNode(e, "warning"),
  alertCaution: (e) => githubAlertNode(e, "caution"),

  // ⚠️ **表格插的是 3 × 3**，而不是"先弹个框问行列数"。
  // `insertTableCommand` 的 `row`/`col` 缺省也能用，但缺省值不写出来就成了
  // 一个说不出所以然的数；菜单上那一项的标签也照这个数写了，两处一致。
  table: (e) => e.action(callCommand(insertTableCommand.key, { row: 3, col: 3 })),
  tableRowAbove: (e) => e.action(callCommand(addRowBeforeCommand.key)),
  tableRowBelow: (e) => e.action(callCommand(addRowAfterCommand.key)),
  tableColLeft: (e) => e.action(callCommand(addColBeforeCommand.key)),
  tableColRight: (e) => e.action(callCommand(addColAfterCommand.key)),
  tableDelRow: (e) => deleteTableRow(e),
  tableDelCol: (e) => deleteTableColumn(e),
  tableDel: (e) => deleteWholeTable(e),
  tableAlignLeft: (e) => alignCurrentTableColumn(e, "left"),
  tableAlignCenter: (e) => alignCurrentTableColumn(e, "center"),
  tableAlignRight: (e) => alignCurrentTableColumn(e, "right"),
  tableResize: (e, p) => resizeCurrentTable(e, p?.columns ?? 3, p?.rows ?? 3),
  tableMoveRowUp: (e) => moveCurrentTableRow(e, -1),
  tableMoveRowDown: (e) => moveCurrentTableRow(e, 1),
  tableMoveColLeft: (e) => moveCurrentTableColumn(e, -1),
  tableMoveColRight: (e) => moveCurrentTableColumn(e, 1),
  tableCopy: (e) => duplicateCurrentTable(e),
  tableFormat: (e) => formatCurrentTable(e),
  tableRowHeaders: (e) => toggleTableRowHeaders(e),

  // 这两条**必须有 payload**：地址从外面进来（界面先问用户，见 `ui/ImageDialog.tsx`）。
  // 缺省值给空串而不是"不执行"——空串的语义是"插一个还没填地址的链接/图片"，
  // 而那正是用户点完之后马上要补的东西。
  //
  // ⚠️ `link` 这条**界面今天一条路都不走**（菜单里那条走 `linkSet`，见下）。
  // 留着是因为它是上游的 toggle 语义本身，删掉就等于把"再点一次去掉链接"
  // 这条能力的**另一种形态**从白名单里抹掉；而 `docs/10` 的矩阵里那一条
  // 说的正是"已经是一条链接时再点一次"。真要删，先想清楚谁来顶它。
  link: (e, p) => e.action(callCommand(toggleLinkCommand.key, { href: p?.href ?? "" })),
  image: (e, p) =>
    e.action(callCommand(insertImageCommand.key, { src: p?.src ?? "", alt: p?.alt ?? "" })),

  // 「插入链接」与「去掉链接」那两条（`docs/07` 第 96 / 102 项，2026-10-07）。
  // ⚠️ 实现全在 `link-edit.ts`（找光标处那条链接、把新文字拼出来），这里只挂名。
  linkSet: (e, p) => installLink(e, p),
  linkRemove: (e) => removeLink(e),

  clearFormat: (e) => clearRemoveCellStyle(e),

  // 「选择」这一族（2026-10-07）。⚠️ 四条共用 `select.ts` 第一组那几个纯函数
  // （哪个字算一个词、哪一段算一句），**那边实现、这里只挂名**——判据塞进这张
  // 表就成了"清单里夹着算法"（`select.ts` 文件头）。⚠️ 源码模式走的是**同一套
  // 判据**（`source-commands.ts`），别在那里另写一份。
  selectLine: (e) => selectLine(e),
  selectWord: (e) => selectWord(e),
  selectSentence: (e) => selectSentence(e),
  deleteWord: (e) => removeWord(e),
  // `Alt+↑` / `Alt+↓`（2026-10-07）。⚠️ 搬的是**列表项**（光标在列表里时）或
  // **顶层块**，表格里不做、到边不动——理由在 `move-block.ts` 文件头。
  moveLineUp: (e) => moveBlock(e, -1),
  moveLineDown: (e) => moveBlock(e, 1),

  /**
   * 用文本替换当前选区（空串 = 删掉选区）。
   *
   * 两个用家：「粘贴」（`ui/useClipboard.ts` 读到剪贴板文本之后插进来）、
   * 「剪切」（复制成功之后删掉选中的那段）。
   *
   * ⚠️ 非空那一支**走 ProseMirror 自己的 `pasteText`**，不自己拼事务：
   * 多行文本要按行拆成多个段落、代码块和表格里不能塞段落——这些规矩 PM
   * 那边有一份现成的。自己写一份的话，"菜单粘贴"和"按 Ctrl+V"插出来的
   * 东西迟早不一样，而那种差别没人会想到去查。
   */
  insertText: (e, p) => {
    const text = p?.text ?? "";
    e.action((ctx) => {
      const view = ctx.get(editorViewCtx);
      view.focus();
      if (text) view.pasteText(text);
      else view.dispatch(view.state.tr.deleteSelection());
    });
  },
};

/**
 * 光标所在的那一块**已经在**这类容器里了吗（含它自己与所有祖先）。
 *
 * ⚠️ 判据看**祖先链**而不是"父节点是不是它"：`> > x` 这种套着的引用里也要算"在"，
 * 否则第二次点就成了"再包一层"，正是要修的那个缺陷。
 */
function atPackageWrapInside(state: EditorState, type: NodeType): boolean {
  const { $from } = state.selection;
  for (let layer = $from.depth; layer >= 0; layer--) {
    if ($from.node(layer).type === type) return true;
  }
  return false;
}

/**
 * **切换**一层块级包裹：已经在里面就**抬出去一层**，不在就包一层。
 *
 * ⚠️ 用户朋友 2026-10-16 报的：「多次点击工具栏的引用按钮会导致这种结果」——
 * 截图里是**八层套着的引用**。根因是那三条命令直接调了上游的
 * `wrapInBlockquote` / `wrapInBulletList` / `wrapInOrderedList`，而它们底下是
 * `prosemirror-commands` 的 `wrapIn`：**它无条件往外面再裹一层**（源码里那段
 * `findWrapping(range, nodeType)` → `tr.wrap`，没有任何"已经在了"的判断）。
 * 菜单/工具栏上那一颗按钮显然是**开关**（点一下开、再点一下关），不是"再包一层"。
 *
 * ⚠️ **抬出去用 `lift`**（同一个包里那条），它抬的是"选区所在的那一块"、
 * 一次只抬**一层**：套了八层时点八下能一层层退回来，而不是"啪"地掉成一个段落
 * （那会把用户多做的几次都吃掉，而他正是想一层层退）。
 *
 * ⚠️ 抬不动时（`lift` 给 `false`，比如光标在文档最外层的引用里、再往上没地方了）
 * **什么都不做**：那时"再包一层"更不是用户要的。
 */
function splitReplacePackageWrap(e: Editor, containerName: string, packageValue: () => void): void {
  const view = e.ctx.get(editorViewCtx);
  const type = view.state.schema.nodes[containerName];
  if (type && atPackageWrapInside(view.state, type)) {
    liftValueLayer(view, containerName);
    return;
  }
  packageValue();
}

/**
 * 把光标所在的那一块**抬出**它现在这一层包裹。
 *
 * ⚠️ **两种容器两条路，别合并**（2026-10-16 实测出来的）：
 * - **引用**用 `lift`：选区的 `blockRange` 在引用块里，`lift` 正好把那一块挪到
 *   引用外面 ✓（实测：连点五下 = 一开一关一开一关一开，最后只剩**一层**）。
 * - **列表**要用 `liftListItem`：`lift` 对着列表项**给 `false`**（列表项不能凭空
 *   挪进文档根——那是非法结构），于是第一版改完"点第二下什么都不发生"，
 *   而 `liftListItem` 正是为这一格准备的（顶层的项会被拆成普通段落＝关掉列表，
 *   嵌套的项会抬到上一层）。两者都来自 prosemirror 那一套。
 */
function liftValueLayer(view: EditorView, containerName: string): void {
  if (containerName === "blockquote") {
    lift(view.state, view.dispatch);
    return;
  }
  const item5 = view.state.schema.nodes.list_item;
  if (item5) liftListItem(item5)(view.state, view.dispatch);
}

/**
 * 跑一条编辑命令，**只管命令、不管焦点**。
 *
 * ⚠️ 焦点那件事留在 `create.ts` 里（两个用家的焦点处境正好相反：菜单栏点出来
 * 的要把焦点交回正文，斜杠菜单那边焦点本来就在编辑区），这里只管派发。
 *
 * ⚠️ `h1`~`h6` 走的是**另一条命令**（`wrapInHeadingCommand` 带一个层数参数），
 * 所以它们不在 {@link COMMANDS} 表里，得先在这里分一下。
 *
 * ⚠️ 类型谓词而不是 `as`（见 {@link isHeading}）——写成 `as` 的话，表里漏了
 * 一项这种错误也会被一起放过去。
 */
export function runCommand(editor: Editor, name: tableCommand, payload?: CommandPayload): void {
  if (isHeading(name)) {
    const level = Number(HEADING_RE.exec(name)![1]);
    const view = editor.ctx.get(editorViewCtx);
    if (sameLayerMarkTitle(view.state, level)) {
      editor.action(callCommand(turnIntoTextCommand.key));
    } else {
      editor.action(callCommand(wrapInHeadingCommand.key, level));
    }
  } else {
    COMMANDS[name](editor, payload);
  }
}
