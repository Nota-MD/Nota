/**
 * **选区快照**——插件（Lua）能看见的那一小块「光标状态」（`docs/07` 第 14 项，
 * 2026-10-04 落地）。
 *
 * # 它解决的是哪件事
 *
 * `nota.document` 从前只有**整篇替换**语义（`set_text` / `append_text`），
 * 插件想"在光标处插一段"只能 `get_text()` 拿全文自己拼。这条缺口的另一半是
 * **读**：插件想知道"用户此刻选中了什么"。
 *
 * # ⚠️ 为什么快照里**没有偏移量**——这是量出来的，不是省事
 *
 * 最自然的设计本来是"给插件一对 `from` / `to`（markdown 里的字符偏移），
 * 它就能自己切片"。2026-10-04 用本仓已有那套工装（真 ProseMirror 模型 ＋
 * 真 milkdown 序列化器，见 `tests/caret-snapshot.test.ts`）量了一遍，
 * **这条路是错的**：
 *
 * | 光标在哪 | 往那个位置插 `ZZZ`，序列化出来是 |
 * |---|---|
 * | 段落中间（行内） | `甲ZZZ乙` ——可直接拼 |
 * | **两段之间** | `…丙\n\nZZZ\n\n- 一…` ——**多出一个段落** |
 * | **列表项开头** | `- ZZZ一` ——**多出一个 `- ` 标记** |
 * | **引用块开头** | `> ZZZ一段` ——**多出一个 `> `** |
 *
 * 也就是说：在块边界上，"往 markdown 的第 N 个字符处插一段"**重现不了**
 * "往文档的那个位置插一段"——插入会**改变结构**（多一个标记、多一个空行），
 * 而字符串拼接改不了结构。⚠️ 更要命的是第一种情形与第二种**看不出区别**：
 * 一个只按偏移拼的实现在段落中间全对、在段落之间把两段粘成一段，
 * 而"粘成一段"是**存盘之后才看得见**的那种坏。
 *
 * 所以本模块只交出**两种坐标里都成立**的东西：
 *
 * * `empty` / `text` —— 选中了什么（跟"在哪儿"无关，序列化不参与）；
 * * ⚠️ 至于"往光标处写"那件事，走的是另一条路：**让编辑器自己落一笔事务**
 *   （`nota.document.insert_at_cursor` → `nota:document-edit` → 前端
 *   `插入在光标处`）。那份决定写在 `docs/05` §4.8。
 *
 * # 这个文件里有两半
 *
 * 1. [`读选区快照`] —— **纯函数**，从一份 `EditorState` 里读出快照。测试打的就是它；
 * 2. [`选区快照插件`] —— 那条"选区一变就报一次"的插件，形状与
 *    `command-state.ts::光标状态插件` 一模一样（同一套去重写法）。
 *
 * ⚠️ 两半分开放，是因为只有第一半能在测试里跑（本仓没有 jsdom，
 * `Editor.make()` 那条路走不通——同 `empty-doc-save.test.ts` 顶上那条边界）。
 */

import { Plugin } from "@milkdown/kit/prose/state";
import type { EditorState } from "@milkdown/kit/prose/state";
import { $prose } from "@milkdown/kit/utils";

/**
 * 一份选区快照。**只有两个字段**，两个都是"跟位置无关"的。
 *
 * ⚠️ 别往这里加 `from` / `to`：本文件顶上那张表说明了为什么那种坐标
 * 在块边界上根本不存在。
 */
export interface SelectionSnapshot {
  /**
   * 选中的**纯文本**。
   *
   * ⚠️ 是**纯文本**，不是 markdown：`**粗**` 这一段选出来是 `粗`。
   * 想拿带标记的那一份是另一件事（序列化一段片段），本轮没做。
   *
   * ⚠️ 段落之间用 `\n` 连（`textBetween` 的 `blockSeparator`），
   * 所以跨段的选区读出来是**一行一段**，不是原样的空行。
   */
  text: string;
  /**
   * 选区**空不空**（空 = 只是一个插入点，没有选中任何东西）。
   *
   * ⚠️ **它不等于 `text === ""`**：选中一颗**原子**（图片、公式、硬换行）
   * 时 `textBetween` 给不出文字（没传 `leafText`），于是
   * `empty=false` 而 `text=""`。所以要两个字段，别拿一个去推另一个。
   */
  empty: boolean;
}

/**
 * 从一份编辑器状态里读出选区快照。**纯函数**，不碰 DOM、不碰视图。
 *
 * ⚠️ `textBetween` 的第三个参数是**块分隔符**（`"\n"`）。不传的话跨段的选区
 * 会被**静默地粘成一行**——"第一段末尾"连上"第二段开头"，看起来像一句话，
 * 而那是错的。
 */
export function readSelectionSnapshot(state: EditorState): SelectionSnapshot {
  const sel = state.selection;
  if (sel.empty) return { text: "", empty: true };
  return { text: state.doc.textBetween(sel.from, sel.to, "\n"), empty: false };
}

/**
 * "选区一变就报一次"的插件。形状抄 `command-state.ts::光标状态插件`（同一套
 * `$prose` ＋ 签名去重 ＋ `update` 里一律 `return false`）。
 *
 * ⚠️ **它只报"变了的"**：ProseMirror 每敲一颗字都会派一次事务，不去重的话
 * 前端每一颗字都要跨一次 IPC。去重的键就是快照本身（`empty` ＋ `text`）。
 *
 * ⚠️ **挂载那一刻先报一次初值**（同 `光标状态插件` 那条注解）：不报的话，
 * "打开文档、什么都没选、插件读 `get_selection()`"会读到上一个文档留下的
 * 那一份。
 */
export function selectionSnapshotPlugin(onChange: (snapshot: SelectionSnapshot) => void) {
  return $prose(() => createSelectionSnapshotPlugin(onChange));
}

/**
 * 那条插件的**本体**。与上面的 `选区快照插件` 分成两个是**为了能测**：
 * `$prose(...)` 的产物要有个 `EditorView` 才会被跑起来，而本仓没有 jsdom
 * （`Editor.make()` 那条路走不通）。拆出这一层之后，测试可以直接
 * `建选区快照插件(cb).spec.view(假视图)` 把它驱动起来——
 * 覆盖到的是去重那一段（"每一颗字都跨一次 IPC"就栽在那里）。
 */
export function createSelectionSnapshotPlugin(onChange: (snapshot: SelectionSnapshot) => void) {
  return new Plugin({
    view: (view: { state: EditorState }) => {
      let aboveCount: string | null = null;
      const report = (state: EditorState) => {
        const now = readSelectionSnapshot(state);
        const sig = `${now.empty ? 1 : 0}|${now.text}`;
        if (sig === aboveCount) return;
        aboveCount = sig;
        onChange(now);
      };
      // ⚠️ 挂载那一刻先报一次初值（见上面那条注解）。
      report(view.state);
      return {
        update: (view: { state: EditorState }) => {
          report(view.state);
          // ⚠️ **一律返回 `false`**：本插件不改 DOM。返回 `true` 会让
          // ProseMirror 以为视图需要重读，每次事务都多一轮无谓的工作
          //（与 `光标状态插件` 同一个理由）。
          return false;
        },
      };
    },
  });
}
