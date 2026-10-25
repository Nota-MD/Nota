/**
 * **覆写模式**（`Insert` 键）。朋友 2026-10-16 报的清单里那条「**INSERT 键无法使用**」
 * ——在那之前这一颗键在 Nota 里**什么都不做**（浏览器默认行为是空操作）。
 *
 * # 为什么是"覆写"而不是别的
 *
 * `Insert` 这颗键在桌面软件里只有**一个**约定俗成的意思：**在"插入"与"覆写"
 * 之间切换**（DOS 时代的编辑器起就这样，Windows 的记事本、Word、VS Code
 * 今天都还是）。用户说"无法使用"，指的正是这个——他按了，没反应。
 *
 * # 三件事的边界
 *
 * | 现场 | 做什么 |
 * |---|---|
 * | 按 `Insert` | 翻这个开关（**不插字**） |
 * | 覆写开着、光标右边**有字**、敲一个**普通字符** | 用敲进去的那个字**顶掉右边那一个** |
 * | 覆写开着，但在**行尾** / 敲的是**回车、多字上屏、粘贴** | 照常插入（右边没东西可顶） |
 *
 * ⚠️ **只顶"一个字符"**，不是"一个词"：覆写卡住不动的原因十有八九是
 * "它把整段吞了"，而用户只想改一个字。
 *
 * ⚠️ **输入法组字期间一概不管**（`视图.composing` ＋ 上屏串长度 > 1 都放行）：
 * 中文一次上屏一串，"顶掉右边一个"在这里没有意义，还会把候选框里那句话打乱
 * ——与 `auto-pair.ts` 那条"组字期间一律不动"是同一条纪律。
 *
 * ⚠️ **状态住在插件里**（`PluginKey<boolean>`），不是模块级变量：模块级的话
 * "开关开着"这件事**不进 EditorState**，`读命令状态` 读不到、状态栏也就没法
 * 显示它；而且一个窗口里好几个编辑器实例会**共用一个开关**（正文/源码/分屏
 * 三份），关掉一边、另一边还覆写着——那种错没人查得动。
 *
 * # 怎么让用户知道它开着
 *
 * 状态栏那一格会多出一个 **`OVR`** 小标（`ui/StatusBar.tsx`）。⚠️ **不做"只有
 * 光标变样子"那种反馈**：ProseMirror 的光标是浏览器画的细竖线（本仓没有为
 * 正文装 `drawSelection`），改不出"方块光标"；而"没反馈的覆写模式"比没有这个
 * 功能更糟——用户会以为自己打错了字（他敲一个字、屏幕上少一个字）。
 */

import { Plugin, PluginKey } from "@milkdown/kit/prose/state";
import type { EditorState } from "@milkdown/kit/prose/state";

/** 覆写开着没有。⚠️ 存的是**布尔**（`false` 与"没建起来"都按关着算）。 */
export const coverWriteKey = new PluginKey<boolean>("notaOvertype");

/** 这一刻覆写开着没有。`读命令状态`（`command-state.ts`）与状态栏都用它。 */
export function coverWriteOpen(state: EditorState): boolean {
  return coverWriteKey.getState(state) === true;
}

/**
 * 光标右边**那一颗字符**（按**码位**取，不是码元）。
 *
 * ⚠️ 用 `textBetween` 取两个码元再看第一个是不是"半个代理对"：
 * emoji（😀 这类）在 JS 字符串里是两个码元，只取一个的话切出来的是**半个字符**
 * ——`delete` 那种范围会把右边那颗 emoji 拆成乱码。这一格只有六七行，
 * 但写错了就是"覆写模式下打一个字，旁边那个 emoji 变成方块"。
 */
function rightEdgeOneToken(state: EditorState, position2: number): string {
  const position = state.doc.resolve(position2);
  if (!position.parent.inlineContent) return "";
  const start5 = position.parentOffset;
  const end2 = start5 + 2;
  if (start5 >= position.parent.content.size) return "";
  const two2 = position.parent.textBetween(start5, Math.min(end2, position.parent.content.size), "");
  if (two2.length === 0) return "";
  const value = two2.codePointAt(0);
  if (value === undefined) return "";
  return String.fromCodePoint(value);
}

/** 覆写那一层。⚠️ 只有 `Insert` 与 `handleTextInput` 两条路，别加别的。 */
export function coverWritePlugin(): Plugin<boolean> {
  return new Plugin<boolean>({
    key: coverWriteKey,
    state: {
      init: () => false,
      apply(tr, oldValue) {
        // ⚠️ 开关只由**这一颗键**翻（meta），文档怎么变都不影响它。
        const flip = tr.getMeta(coverWriteKey) as boolean | undefined;
        return flip === undefined ? oldValue : flip;
      },
    },
    props: {
      handleKeyDown(view, event) {
        if (event.key !== "Insert") return false;
        // ⚠️ 组字期间不抢键（那时候 Insert 可能正在输入法里干活）。
        if (view.composing) return false;
        const newValue = !coverWriteOpen(view.state);
        view.dispatch(view.state.tr.setMeta(coverWriteKey, newValue).setMeta("addToHistory", false));
        return true;
      },
      handleTextInput(view, from, to2, text2) {
        if (!coverWriteOpen(view.state)) return false;
        // 组字期间 / 一次上屏好几个字（输入法）/ 换行：都交给上游照常插入。
        if (view.composing) return false;
        if (text2.length === 0 || text2.length > 1 || text2.includes("\n")) return false;
        const { selection } = view.state;
        if (!selection.empty || from !== to2) return false;
        const top = rightEdgeOneToken(view.state, from);
        if (top === "") return false; // 行尾：没东西可顶，照常插入
        const transaction = view.state.tr.insertText(text2, from, to2 + top.length);
        view.dispatch(transaction);
        return true;
      },
    },
  });
}
