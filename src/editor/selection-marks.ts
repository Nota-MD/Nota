/**
 * 选中文字后直接输入 Markdown 标记时的包裹行为。
 *
 * 自动配对插件管的是“光标旁补出另一边”；本文件管的是另一个入口：先选中一段，
 * 再按 `*` / `_` / `~` / `^` / `` ` ``。此时用户要的是把选区变成对应标记，
 * 而不是用一颗字符覆盖整个选区。
 *
 * 规则刻意只作用于同一个文本块。跨段落选区先插入标记会被 ProseMirror 拆成
 * 两个半截结构，结果通常比不处理更糟；这种选区继续交给浏览器默认输入。
 */

import { $prose } from "@milkdown/kit/utils";
import type { EditorState, Transaction } from "@milkdown/kit/prose/state";
import { Plugin, PluginKey, TextSelection } from "@milkdown/kit/prose/state";
import type { EditorView } from "@milkdown/kit/prose/view";

/**
 * 选区两侧要插入的标记。
 *
 * `=` 在 Markdown 里没有单颗语义，所以第一次就包成 `==…==`。其余标记先包一层；
 * 选区会留在原文字上，用户再按一次同一个标记便能自然叠成双颗。
 */
export const 选区标记表: Readonly<Record<string, string>> = {
  "*": "*",
  _: "_",
  "~": "~",
  "^": "^",
  "=": "==",
  "`": "`",
};

/** 一对包裹标记；没有这种标记时给 `null`。 */
export function 选区标记(字: string): string | null {
  return 选区标记表[字] ?? null;
}

function 在代码里(state: EditorState, 位置: number): boolean {
  const $位 = state.doc.resolve(位置);
  for (let 层 = $位.depth; 层 > 0; 层 -= 1) {
    if ($位.node(层).type.spec.code) return true;
  }
  return $位.marks().some((标记) => 标记.type.spec.code);
}

/**
 * 这个选区能不能安全地用一对行内标记包起来。
 *
 * 两端必须在同一个 `inlineContent` 父节点里；代码块和行内代码里保持字面输入；
 * 空选区不属于这里（由自动配对插件的“补一对”负责）。
 */
export function 应包裹选区(
  state: EditorState,
  from: number,
  to: number,
  字: string,
): boolean {
  if (to <= from || !选区标记(字)) return false;
  const $从 = state.doc.resolve(from);
  const $到 = state.doc.resolve(to);
  if (!$从.parent.inlineContent || !$从.sameParent($到)) return false;
  return !(在代码里(state, from) || 在代码里(state, to));
}

/**
 * 生成包裹事务，并保留原来的选区。
 *
 * 先插右侧、再插左侧，避免前一次插入把后一个坐标顶偏。选中状态继续保留，
 * 所以紧接着再按一次 `*` 或 `_` 会继续包第二层，直接得到粗体/删除线。
 */
export function 包裹选区事务(
  state: EditorState,
  from: number,
  to: number,
  字: string,
): Transaction | null {
  const 标记 = 选区标记(字);
  if (!标记 || !应包裹选区(state, from, to, 字)) return null;

  const tr = state.tr;
  tr.insertText(标记, to, to);
  tr.insertText(标记, from, from);
  tr.setSelection(
    TextSelection.create(tr.doc, from + 标记.length, to + 标记.length),
  );
  return tr.scrollIntoView();
}

/** 插件键。 */
export const 选区标记键 = new PluginKey("nota-selection-marks");

/**
 * 建立一个只认“有选区的单一文本块”的输入插件。
 *
 * `smart_symbols` 关闭时不安装，与自动配对插件共用同一个用户开关。
 */
export function 建选区标记插件(): Plugin {
  return new Plugin({
    key: 选区标记键,
    props: {
      handleTextInput: (view: EditorView, from, to, 文) => {
        if (view.composing || 文.length !== 1) return false;
        const tr = 包裹选区事务(view.state, from, to, 文);
        if (!tr) return false;
        view.dispatch(tr);
        return true;
      },
    },
  });
}

/** 挂进 Milkdown 的插件工厂；关掉智能符号时返回空数组。 */
export function 选区标记补全(启用 = true) {
  if (!启用) return [];
  return $prose(() => 建选区标记插件());
}
