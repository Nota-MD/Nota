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
export const selectionMarkTable: Readonly<Record<string, string>> = {
  "*": "*",
  _: "_",
  "~": "~",
  "^": "^",
  "=": "==",
  "`": "`",
};

export interface SelectionMarkAbleForce {
  superscript?: boolean;
  highlight?: boolean;
}

const allOpen: Readonly<SelectionMarkAbleForce> = {
  superscript: true,
  highlight: true,
};

/** 一对包裹标记；没有这种标记时给 `null`。 */
export function selectionMark(character2: string): string | null {
  return selectionMarkTable[character2] ?? null;
}

function atCodeInside(state: EditorState, position2: number): boolean {
  const position = state.doc.resolve(position2);
  for (let layer = position.depth; layer > 0; layer -= 1) {
    if (position.node(layer).type.spec.code) return true;
  }
  return position.marks().some((mark) => mark.type.spec.code);
}

/**
 * 这个选区能不能安全地用一对行内标记包起来。
 *
 * 两端必须在同一个 `inlineContent` 父节点里；代码块和行内代码里保持字面输入；
 * 空选区不属于这里（由自动配对插件的“补一对”负责）。
 */
export function shouldPackageWrapSelection(
  state: EditorState,
  from: number,
  to: number,
  character2: string,
  ableForce: SelectionMarkAbleForce = allOpen,
): boolean {
  if (to <= from || !selectionMark(character2)) return false;
  if (character2 === "^" && ableForce.superscript === false) return false;
  if (character2 === "=" && ableForce.highlight === false) return false;
  const fromPosition = state.doc.resolve(from);
  const toPosition = state.doc.resolve(to);
  if (!fromPosition.parent.inlineContent || !fromPosition.sameParent(toPosition)) return false;
  return !(atCodeInside(state, from) || atCodeInside(state, to));
}

/**
 * 生成包裹事务，并保留原来的选区。
 *
 * 先插右侧、再插左侧，避免前一次插入把后一个坐标顶偏。选中状态继续保留，
 * 所以紧接着再按一次 `*` 或 `_` 会继续包第二层，直接得到粗体/删除线。
 */
export function packageWrapSelectionTransaction(
  state: EditorState,
  from: number,
  to: number,
  character2: string,
  ableForce: SelectionMarkAbleForce = allOpen,
): Transaction | null {
  const mark = selectionMark(character2);
  if (!mark || !shouldPackageWrapSelection(state, from, to, character2, ableForce)) return null;

  const tr = state.tr;
  tr.insertText(mark, to, to);
  tr.insertText(mark, from, from);
  tr.setSelection(
    TextSelection.create(tr.doc, from + mark.length, to + mark.length),
  );
  return tr.scrollIntoView();
}

/** 插件键。 */
export const selectionMarkKey = new PluginKey("nota-selection-marks");

/**
 * 建立一个只认“有选区的单一文本块”的输入插件。
 *
 * `smart_symbols` 关闭时不安装，与自动配对插件共用同一个用户开关。
 */
export function createSelectionMarkPlugin(ableForce: SelectionMarkAbleForce = allOpen): Plugin {
  return new Plugin({
    key: selectionMarkKey,
    props: {
      handleTextInput: (view: EditorView, from, to, text4) => {
        if (view.composing || text4.length !== 1) return false;
        const tr = packageWrapSelectionTransaction(view.state, from, to, text4, ableForce);
        if (!tr) return false;
        view.dispatch(tr);
        return true;
      },
    },
  });
}

/** 挂进 Milkdown 的插件工厂；关掉智能符号时返回空数组。 */
export function selectionMarkFillAll(enable2 = true, ableForce: SelectionMarkAbleForce = allOpen) {
  if (!enable2) return [];
  return $prose(() => createSelectionMarkPlugin(ableForce));
}
