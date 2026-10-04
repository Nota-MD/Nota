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
  toggleInlineCodeCommand,
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
  setAlignCommand,
} from "@milkdown/kit/preset/gfm";
import { undoCommand, redoCommand } from "@milkdown/kit/plugin/history";
import { callCommand } from "@milkdown/kit/utils";

import { 行内标记命令 } from "./inline-marks";
import { 转成任务列表, 清除格式, 表格删行, 表格删列, 表格删表, 插公式块, 插目录 } from "./insert";
import { 插脚注 } from "./footnote";
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
export type 表内命令 = Exclude<EditorCommand, "frontMatter">;

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
  inlineCode: (e) => e.action(callCommand(toggleInlineCodeCommand.key)),
  strike: (e) => e.action(callCommand(toggleStrikethroughCommand.key)),
  // 行内标记四条（高亮 / 上标 / 下标 / 下划线）。**不跟开关走**：命令表是
  // 静态的，而"这条命令能不能跑"取决于开关的话，菜单项的灰/亮就得跟着设置变
  // ——那是另一件事（`ui/commands.ts` 的 `命令能否用`）。关掉高亮的用户
  // 从格式化工具栏点一下，读到的是"这条通路上没实现"，那是个谎。
  // 真相是：**关掉的是解析与输入，不是这条能力**。
  highlight: (e) => e.action(callCommand(行内标记命令[0]!.key)),
  superscript: (e) => e.action(callCommand(行内标记命令[1]!.key)),
  subscript: (e) => e.action(callCommand(行内标记命令[2]!.key)),
  underline: (e) => e.action(callCommand(行内标记命令[3]!.key)),
  text: (e) => e.action(callCommand(turnIntoTextCommand.key)),
  quote: (e) => e.action(callCommand(wrapInBlockquoteCommand.key)),
  ul: (e) => e.action(callCommand(wrapInBulletListCommand.key)),
  ol: (e) => e.action(callCommand(wrapInOrderedListCommand.key)),
  task: (e) => 转成任务列表(e),
  codeBlock: (e) => e.action(callCommand(createCodeBlockCommand.key)),
  hr: (e) => e.action(callCommand(insertHrCommand.key)),
  // 公式块：`plugin-math` 没有插入命令，见 `insert.ts` 的 `插公式块`（2026-09-26）。
  mathBlock: (e) => 插公式块(e),
  // 内容目录：插一段普通 markdown 列表，两头用注释夹住；已有就原地更新。
  // ⚠️ `strict` 由上面带进来（缺省 = 宽松），编辑器实例自己不知道这个设置——
  // 理由写在 `create-types.ts::CommandPayload.strict`。
  toc: (e, p) => 插目录(e, p?.strict ?? false),
  // 脚注：gfm 给了节点与解析/序列化，缺"从零插一条"，见 `footnote.ts`（2026-09-27）。
  footnote: (e) => 插脚注(e),

  // ⚠️ **表格插的是 3 × 3**，而不是"先弹个框问行列数"。
  // `insertTableCommand` 的 `row`/`col` 缺省也能用，但缺省值不写出来就成了
  // 一个说不出所以然的数；菜单上那一项的标签也照这个数写了，两处一致。
  table: (e) => e.action(callCommand(insertTableCommand.key, { row: 3, col: 3 })),
  tableRowAbove: (e) => e.action(callCommand(addRowBeforeCommand.key)),
  tableRowBelow: (e) => e.action(callCommand(addRowAfterCommand.key)),
  tableColLeft: (e) => e.action(callCommand(addColBeforeCommand.key)),
  tableColRight: (e) => e.action(callCommand(addColAfterCommand.key)),
  tableDelRow: (e) => 表格删行(e),
  tableDelCol: (e) => 表格删列(e),
  tableDel: (e) => 表格删表(e),
  tableAlignLeft: (e) => e.action(callCommand(setAlignCommand.key, "left")),
  tableAlignCenter: (e) => e.action(callCommand(setAlignCommand.key, "center")),
  tableAlignRight: (e) => e.action(callCommand(setAlignCommand.key, "right")),

  // 这两条**必须有 payload**：地址从外面进来（界面先问用户，见 `ui/PromptDialog.tsx`）。
  // 缺省值给空串而不是"不执行"——空串的语义是"插一个还没填地址的链接/图片"，
  // 而那正是用户点完之后马上要补的东西。
  link: (e, p) => e.action(callCommand(toggleLinkCommand.key, { href: p?.href ?? "" })),
  image: (e, p) =>
    e.action(callCommand(insertImageCommand.key, { src: p?.src ?? "", alt: p?.alt ?? "" })),

  clearFormat: (e) => 清除格式(e),

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
export function 跑命令(editor: Editor, name: 表内命令, payload?: CommandPayload): void {
  if (isHeading(name)) {
    editor.action(callCommand(wrapInHeadingCommand.key, Number(HEADING_RE.exec(name)![1])));
  } else {
    COMMANDS[name](editor, payload);
  }
}
