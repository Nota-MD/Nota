/**
 * **编辑区里那三个实例各传哪些选项**（2026-10-07 从 `ui/EditorPane.tsx` 搬出来的，
 * `docs/07` 第 89 项）。
 *
 * 一句话职责：`EditorPane` 只说"现在是什么模式、这些设置是什么"，**哪一侧要
 * `physics`、哪一侧不传 `自动更正`、预览那一份为什么必须跟主编辑器一致**——
 * 这些判断全在这一份里。搬出来是因为它们原来是三段各二十来行、夹着大段理由的
 * 实参列表，把那个 effect 淹掉了；而"哪一侧传什么"本身是一件**成体系**的事，
 * 值得有一个自己的落点。
 *
 * # 三份实例，三种口径
 *
 * | 谁 | 建法 | 它是什么 |
 * |---|---|---|
 * | 主窗格（所见即所得） | [`建所见即所得编辑器`] | Milkdown，可编辑 |
 * | 主窗格（源码 / 分屏左） | [`建源码编辑器`] | CodeMirror，可编辑 |
 * | 分屏右格 | [`建预览编辑器`] | Milkdown，**只读**显示端 |
 *
 * ⚠️ **三种模式与它们的组合见 `EditorPane.tsx` 文件头那张表**，这一份只管
 * "建出来"。
 *
 * # ⚠️ 造了不负责拆
 *
 * 三个函数都只是 `createEditor` / `createSourceEditor` 的**装配**：谁建的谁拆
 * （`handle.destroy()`）是调用方的事——拆的时机（`disposed` 那两道闸）与
 * 实例本身一样是 `EditorPane` 生命周期的一部分。
 *
 * # ⚠️ 为什么收一个参数对象，不收一长串位置参数
 *
 * 十几个参数按位置传，调用点会变成一行读不出来的东西，而且**加一个参数就得
 * 数一遍位置**（漏一个不报错、只是那个值悄悄换了个人）。收对象的话，每个字段
 * 都有名字，调用点一眼看得出"这一格喂的是谁"。同一条理由与 `editor/assemble.ts`
 * 的 `装配参数` 逐字相同。
 */

import type { PluginReviewDiff } from "@/bridge/ipc";
import type { 选区快照 } from "@/editor/caret-snapshot";
import type { CommandState } from "@/editor/command-state";
import { createEditor, type EditorHandle } from "@/editor/create";
import type { FindStatus } from "@/editor/find";
import type { 行内扩展开关 } from "@/editor/inline-marks";
import { createSourceEditor, type SourceHandle } from "@/editor/source";
import type { 标点设置 } from "@/editor/smart-punctuation";
import type { 写作模式 } from "@/editor/writing-modes";
import type { 一张表的列宽 } from "@/ui/table-widths";

/** 主窗格那两份建法**都要**的那几样。 */
export interface 主窗格公共 {
  /** 挂载点（React 从不往里渲染的那块空 div）。 */
  root: HTMLElement;
  /** 初始文本。⚠️ 是"最后一次知道的文本"，**不是** `doc.text`（理由见 `EditorPane` 文件头第 1 条）。 */
  initial: string;
  /** 严格模式。⚠️ 两边都要传，但管的**不是同一件事**，见各自那一条。 */
  strict: boolean;
  /** 专注模式 / 打字机模式的初值（拨开关走 `setWritingModes`，不重建）。 */
  写作模式: 写作模式;
  /** 就地改动预览的初值（活的走 `setReview`）。 */
  预览: PluginReviewDiff | null;
  onReviewEscape: () => void;
  onFindStatus: (s: FindStatus) => void;
  /** 选区快照（`docs/07` 第 14 项）。两边都一样。 */
  onSelection: (快照: 选区快照) => void;
  onChange: (markdown: string) => void;
}

export interface 所见即所得参数 extends 主窗格公共 {
  /** 这份文档**以前记过的**表格列宽（侧车，见 `ui/table-widths.ts`）。 */
  列宽: Record<string, number[]>;
  onTableResize: (表: 一张表的列宽[]) => void;
  /** 光标状态。⚠️ 只有这一侧读得出来（源码模式没有文档树）。 */
  onCommandState: (s: CommandState | null) => void;
  physics: boolean;
  行内扩展: 行内扩展开关;
  标点: 标点设置;
  自动更正: boolean;
  emoji: boolean;
  智能符号: boolean;
}

export interface 源码参数 extends 主窗格公共 {
  /** 这一份不是 Markdown（`editor/file-kind.ts::认文件类型`），别套 Markdown 文法与配色。 */
  纯文本: boolean;
}

/**
 * 所见即所得那一侧（Milkdown）。
 *
 * ⚠️ `readOnly` **不在这里**：这个实例永远是可编辑的，只读的那一份走
 * [`建预览编辑器`]。
 */
export async function 建所见即所得编辑器(参数: 所见即所得参数): Promise<EditorHandle> {
  const {
    root,
    initial,
    列宽,
    onTableResize,
    strict,
    physics,
    行内扩展,
    标点,
    自动更正,
    emoji,
    智能符号,
    写作模式,
    预览,
    onReviewEscape,
    onCommandState,
    onFindStatus,
    onSelection,
    onChange,
  } = 参数;
  return createEditor({
    root,
    initialMarkdown: initial,
    tableWidths: 列宽,
    // ⚠️ 拖完一次就把**这一刻所有拖过的表**整体报一遍（为什么这样报、以及
    // "没有 `doc.path` 就一个字都不存"，见 `ui/table-widths.ts`）。
    onTableResize,
    // **严格模式**。⚠️ 所见即所得这一侧**要传**：它换的是正文里"`#你好` 算不算
    // 标题的写法"（`heading-on-enter.ts`）。这里原来写着"没有 `strict`，两种模式
    // 已经完全一样了"——那是 2026-09-26 删掉显示层之后的实情，**2026-09-29 又加
    // 回来了**（用户报"严格模式关闭后 `#标题` 还是无法正常显示"），见 `atx.ts` 文件头。
    //
    // ⚠️ **2026-09-30 起它管的还是这一件事，长相却换了**：宽松档下 `#你好` 与
    // `# 你好` 走**同一条路**——没按回车时都只加粗，按下回车都变成标题块（字号
    // 这时才跳）。用户原话：「类似 `# 你好`。就是不回车只是显示加粗，回车变成
    // 标题。」所以这一侧传 `strict` 现在的效果是：**严格档下 `#你好` 一个字节、
    // 一个像素都不动**（既不进装饰、也不成块），宽松档下它和 `# 你好` 完全一样。
    //
    // ⚠️ 反过来说：**只传这一侧**。导出那条路（`export.ts`）不传——那里的
    // `nota-` 前缀规则会把这类装饰整个摘掉，导出结果与严格与否无关，这是有意的
    //（见 `导出选项` 那段注释）。
    strict,
    physics,
    // 三种行内扩展的开关。⚠️ 所见即所得这一侧才传：源码模式是 CodeMirror，
    // 它只显示 Markdown 源码，没有"这条算不算标记"这回事。
    inlineMarks: 行内扩展,
    // 智能标点那一组 ＋ 自动更正。⚠️ **所见即所得这一侧才传**，理由见
    // `create-types.ts` 的 `标点` 那一格（导出那条路不许传）；分屏预览那一侧
    // **要传**（见 [`建预览编辑器`]），那一边只有标点、没有自动更正。
    标点,
    自动更正,
    // Emoji 输入辅助（短代码替换 ＋ 补全面板）。⚠️ **所见即所得这一侧才传**
    //（源码模式没有"短代码"这回事）；分屏预览那一侧**不传**——它是只读的，
    // 补全面板在只读里弹出来只是噪声（`create.ts` 里另有一道 `readOnly` 兜底）。
    emoji,
    // **智能符号补全**（`settings.editor.smart_symbols`，默认开）。⚠️ **所见即
    // 所得这一侧才传**（源码模式是 CodeMirror，它没有"打一颗字符顺手补另一半"
    // 这回事）；分屏预览那一侧**不传**——它是只读的，补进来也只是噪声。
    智能符号,
    writingModes: 写作模式,
    // 预览那一份，理由见 `EditorPane` 里 `预览Ref`。
    review: 预览,
    onReviewEscape,
    // 光标状态只在这一侧读得出来（源码模式没有文档树）。
    onCommandState,
    onFindStatus,
    onSelection,
    onChange,
  });
}

/**
 * 源码那一侧（CodeMirror）。`source` 与 `split` 的左侧是同一个东西，只是
 * `split` 多一个预览窗格。
 *
 * ⚠️ 调用方在调它之前要**明确报一次 `null`**（不是空状态）：CodeMirror 手里
 * 就是文本，没有文档树可读，工具栏据此不画任何高亮。这一句留给调用方是因为
 * 它是"这一刻光标状态读不出来了"的对外声明，不是建实例的一部分。
 */
export function 建源码编辑器(参数: 源码参数): SourceHandle {
  const {
    root,
    initial,
    strict,
    纯文本,
    写作模式,
    预览,
    onReviewEscape,
    onFindStatus,
    onSelection,
    onChange,
  } = 参数;
  return createSourceEditor({
    root,
    initialMarkdown: initial,
    strict,
    纯文本,
    // ⚠️ 源码那一侧**没有 `physics`**：它是 CodeMirror，只显示 Markdown 原文，
    // 一个字都不渲染，宏表跟它无关（`CreateSourceOptions` 里没这项，传了编译
    // 不过）。
    writingModes: 写作模式,
    // 预览那一份，理由见 `预览Ref`（源码模式同样支持就地预览）。
    review: 预览,
    onReviewEscape,
    onFindStatus,
    onSelection,
    onChange,
  });
}

/**
 * 分屏右格那个**只读**预览（Milkdown）。
 *
 * ⚠️ 它**不接 `onChange`、不 settle、不 focus**：它是显示端，不是输入端。
 * 接了 `onChange` 就会形成回声（见 `create.ts` 里 `readOnly` 那段）。参数列表里
 * 没有那几样，是**故意的**——不是忘了传。
 */
export async function 建预览编辑器(参数: {
  root: HTMLElement;
  initial: string;
  strict: boolean;
  physics: boolean;
  行内扩展: 行内扩展开关;
  标点: 标点设置;
}): Promise<EditorHandle> {
  return createEditor({
    root: 参数.root,
    initialMarkdown: 参数.initial,
    // ⚠️ **理由同 `inlineMarks`**：预览显示的就是左边那份文档，开关不一样的话，
    // `#标题` 在左侧正文里按标题排版、在右边是一条普通段落。
    // ⚠️ 但**分屏左侧是源码模式**，那边 `#标题` 本来就是一行原文，所以实际上
    // "两边不一致"只在 `strict` 与源码模式无关这件事上自洽——传它图的是"预览
    // 永远等于所见即所得那一档的渲染结果"。
    strict: 参数.strict,
    physics: 参数.physics,
    // ⚠️ **要跟主编辑器一致**：预览显示的就是左边那份文档的渲染结果，开关不一样
    // 的话，`==甲==` 在左边是高亮、在右边是一条光秃秃的 `==甲==`——用户会以为
    // 分屏坏了。
    inlineMarks: 参数.行内扩展,
    // ⚠️ **智能标点也要跟主编辑器一致**：`Render` 档下左边把 `--` 显示成 `–`、
    // 右边还是 `--`，用户会以为分屏坏了。⚠️ 这一份的 DOM **不拿去导出**（导出走
    // `editor/export.ts` 自己另建的那个实例），所以传它不会把"仅显示时转换"漏进
    // 文件——那条边界见 `create-types.ts`。
    // ⚠️ 自动更正**不传**：预览是只读的，没有输入可言，挂上去是纯死代码。
    标点: 参数.标点,
    readOnly: true,
  });
}
