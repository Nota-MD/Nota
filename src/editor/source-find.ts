/**
 * 源码模式的**查找**（CodeMirror 6）：一份状态、一组效果、一层装饰。
 *
 * # 它为什么单独一个文件
 *
 * 2026-09-28 从 `source.ts` 里**整块**搬出来的：那天给"插入表格"的模板套
 * `t()`，`source.ts` 顶到了 1001 行，撞上 `tools/doc-sync-check.sh` 的
 * 1000 行硬上限。搬的是一整块职责（查找的全部机制），不是为凑行数随便切一刀
 * ——对外只有 [`查找字段`]、[`查找装饰`]、三条效果、[`查找状态`]、[`源码选中`]
 * 这几个名字，`source.ts` 原样 import 回去，用法一字未改。
 *
 * ⚠️ **自己写的，因为 `@codemirror/search` 不在 `node_modules` 里**
 * （`package.json` 没列，而这台机器上没有网——见 `find.ts` 文件头）。
 *
 * 结构上刻意与 `find.ts` 那套**同形**：一份状态（查询 + 命中表 + 当前下标）、
 * 一组效果（设/走/清）、一层装饰（只改 class，不进文档）。两个编辑器长得像，
 * 读的人就不用为"同一个功能"记两套心智模型。
 *
 * ⚠️ 唯一的实质差别：这里的偏移量**就是文档偏移**（整篇就是一条字符串），
 * 不必像 ProseMirror 那边逐节点换算。匹配本身仍然调 `在文本里找匹配`。
 */

import { StateEffect, StateField } from "@codemirror/state";
import { Decoration, EditorView } from "@codemirror/view";

import {
  在文本里找匹配,
  默认查找选项,
  type FindOptions,
  type FindStatus,
  type 文本命中,
} from "@/editor/find";

export interface 源码查找状态 {
  query: string;
  options: FindOptions;
  matches: 文本命中[];
  index: number;
}

export const 空查找: 源码查找状态 = {
  query: "",
  options: 默认查找选项,
  matches: [],
  index: -1,
};

export const 设查找效果 = StateEffect.define<{ query: string; options: FindOptions }>();
export const 走查找效果 = StateEffect.define<1 | -1>();
export const 清查找效果 = StateEffect.define<null>();

export const 查找字段 = StateField.define<源码查找状态>({
  create: () => 空查找,
  update(value, tr) {
    if (tr.effects.some((e) => e.is(清查找效果))) return 空查找;

    const 设 = tr.effects.find((e) => e.is(设查找效果));
    const 走 = tr.effects.find((e) => e.is(走查找效果));

    const query = 设 ? 设.value.query : value.query;
    const options = 设 ? 设.value.options : value.options;
    const 要重算 = Boolean(设) || tr.docChanged;
    const matches = 要重算 ? 在文本里找匹配(tr.state.doc.toString(), query, options) : value.matches;

    let index = value.index;
    if (matches.length === 0) index = -1;
    else if (设) {
      const hit = matches.findIndex((m) => m.start >= tr.state.selection.main.from);
      index = hit === -1 ? 0 : hit;
    } else if (走) {
      const n = matches.length;
      index = 走.value > 0 ? (index + 1 + n) % n : (index - 1 + n) % n;
    } else if (要重算) {
      index = Math.min(Math.max(index, 0), matches.length - 1);
    }

    return { query, options, matches, index };
  },
});

/** 命中高亮的 class，与所见即所得那一侧**同名**（`find.ts` 里的常量）。 */
const 命中类 = "nota-find-hit";
const 当前类 = "nota-find-current";

export const 查找装饰 = EditorView.decorations.compute([查找字段], (state) => {
  const s = state.field(查找字段);
  if (s.matches.length === 0) return Decoration.none;
  return Decoration.set(
    s.matches.map((m, i) =>
      Decoration.mark({
        class: i === s.index ? `${命中类} ${当前类}` : 命中类,
      }).range(m.start, m.end),
    ),
    // ⚠️ `sort: true`：`Decoration.set` 要求区间按位置排好，而命中表本身
    // 就是有序的——写出来是防着以后有人改匹配顺序，那时不排会**抛异常**
    //（不是画错，是直接崩）。
    true,
  );
});

/** 从状态算一份给界面看的东西。 */
export function 查找状态(s: 源码查找状态): FindStatus {
  return { query: s.query, total: s.matches.length, current: s.index + 1 };
}

/** 把光标送到某个命中上，并滚动到可见。 */
export function 源码选中(view: EditorView, m: 文本命中): void {
  view.dispatch({
    selection: { anchor: m.start, head: m.end },
    scrollIntoView: true,
  });
}
