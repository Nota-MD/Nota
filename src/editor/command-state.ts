/**
 * 「光标现在处在什么状态」——格式化工具栏的高亮、以及**菜单项的可用性**
 * 都要问它。
 *
 * # 为什么需要它
 *
 * 在它之前，菜单栏只有一种判据：`App.tsx` 里有没有这条命令的处理函数
 * （`ui/commands.ts` 顶上那段）。那个判据回答的是"这个功能做了没有"，
 * **回答不了"现在这一刻能不能用"**——比如「删除行」在光标不在表格里时
 * 按下去什么都没有，而菜单上它是亮的。同一句"界面不该撒谎"的口径，
 * 在这里要求第二层判据。
 *
 * # 它从哪儿读
 *
 * 一个 ProseMirror 插件（`$prose`），在**每一次视图更新**时读一遍当前
 * state，变了才通知外面（用一整条签名字符串比对，见 `签名`）。不比对的话，
 * 每敲一个字都会 `setState` 一次，`App` 整棵树跟着重渲染——那是会让
 * 打字变钝的写法。
 *
 * ⚠️ **只读，不写**。这里不派任何事务、不加装饰——它在"改文档"这件事上
 * 是个纯粹的观察者。工具栏的高亮是它的**唯一**产物。
 *
 * # ⚠️ 它只描述**所见即所得**那一侧
 *
 * 源码模式（CodeMirror）没有文档树，`**加粗**` 在它那里就是四个字符
 * 加两个星号，谈不上"当前选区是不是粗体"。所以源码模式下这份状态是
 * **缺的**（调用方传 `null`），工具栏相应地**一颗都不高亮**——那比如实
 * 多、比猜一个强。这一条写在 `ui/FormatBar.tsx` 顶上，别以为是漏了。
 */

import { Plugin } from "@milkdown/kit/prose/state";
import type { EditorState } from "@milkdown/kit/prose/state";
import { $prose } from "@milkdown/kit/utils";

import { 覆写开着 } from "./overtype";

/**
 * 光标所在块属于哪一族。**同一时刻只有一个**——工具栏那一排块级按钮
 * （标题 / 引用 / 列表 / 代码块）是互斥的，用 `BlockKind` 一个字段就能表达，
 * 不必给每一族各开一个布尔（那样会出现"既要又要"的非法组合）。
 */
export type BlockKind =
  | "text"
  | "h1"
  | "h2"
  | "h3"
  | "h4"
  | "h5"
  | "h6"
  | "quote"
  | "ul"
  | "ol"
  | "task"
  | "codeBlock";

export interface CommandState {
  /** 行内标记。可以同时成立（比如粗体 + 斜体），所以是一串布尔。 */
  bold: boolean;
  italic: boolean;
  strike: boolean;
  inlineCode: boolean;
  /**
   * 三种**扩展**行内标记（`editor/inline-marks.ts`）。
   *
   * ⚠️ 名字是 **schema 里 mark 的 id**，与设置页那三个开关**同名但不是
   * 同一个东西**：那边是"解不解析这种写法"，这边是"光标现在在不在这个
   * 标记里"。关掉高亮的用户打开一份老文件，光标落在 `==x==` 上时这一项
   * 照旧是 `true`——因为那颗 mark **真的在文档里**。
   */
  highlight: boolean;
  superscript: boolean;
  subscript: boolean;
  /** 下划线没有设置开关，恒有（写法是裸 HTML `<u>x</u>`）。 */
  underline: boolean;
  /** 所在块。见 `BlockKind`。 */
  block: BlockKind;
  /**
   * **覆写模式开着没有**（`Insert` 键，2026-10-16）。
   *
   * ⚠️ 它**不在文档里**（那是插件的 state，见 `editor/overtype.ts`），但它是
   * "光标那一位的状态"，与这一份里别的格子同源：状态栏据此画那个 `OVR` 小标。
   * ⚠️ 不加它的话，用户**没有任何办法知道覆写开着**——症状是"我敲一个字，
   * 屏幕上少一个字"，而他会以为是自己打错了。
   */
  overtype: boolean;
  /**
   * 光标在表格里。
   *
   * ⚠️ 表格那十条命令（插行/插列/删行/删列/删表/对齐）**只有这一条判据**：
   * 不在表格里时它们点了没反应（`prosemirror-tables` 的裸函数找不到格子就
   * 直接返回），所以菜单必须据此变灰，否则就是让用户白点。
   */
  inTable: boolean;
  /** 有选区（选中了东西）。「清除样式」据此变灰。 */
  hasSelection: boolean;
  /**
   * 这篇文档里**至少有一个标题**。「内容目录」据此变灰。
   *
   * ⚠️ 这是本表里唯一一处**看整篇文档**而不是看光标附近的判据，所以它只扫
   * **顶层**节点（`doc.forEach`，不是 `descendants`）——与 `editor/headings.ts`
   * 的 [`extractOutline`] 同一片视野：那份正则也认不出引用块里的 `#`。
   * 两边只要有一边放宽，这里就会出现"菜单亮着、点下去目录是空的"。
   *
   * 代价是每敲一个字多走一遍顶层块（几十次比较），换来的是菜单项不撒谎
   * （`docs/10` §1「内容目录」那一格：一个标题都没有时插一份空目录没有意义）。
   */
  hasHeadings: boolean;
}

/** 什么都没有的初始值。编辑器还没建好时用它。 */
export const 空状态: CommandState = {
  overtype: false,
  bold: false,
  italic: false,
  strike: false,
  inlineCode: false,
  highlight: false,
  superscript: false,
  subscript: false,
  underline: false,
  block: "text",
  inTable: false,
  hasSelection: false,
  hasHeadings: false,
};

/** 从文档树里读块族。`inTable` 单独一条路径（它和中途遇到的块无关）。 */
function 读块(state: EditorState): { block: BlockKind; inTable: boolean } {
  const { $from } = state.selection;
  let block: BlockKind = "text";
  let inTable = false;
  let 定过 = false;

  // ⚠️ **从光标往上走**，不是只看 `$from.node(1)`：块可以嵌在任何深度
  // （引用里的段落、列表项里的第二段、表格单元格里的段落……），
  // 只看顶层的话，光标在 `<引用><段落>` 里时读出来是"text"——
  // 工具栏上「引用」那颗不亮，而它明明就是当前这一块。
  for (let d = $from.depth; d > 0; d--) {
    const node = $from.node(d);
    const name = node.type.name;

    // 表格只是"在不在里面"，不参与块族的判定——单元格里的块才是。
    if (name === "table_cell" || name === "table_header") inTable = true;

    if (定过) continue;
    switch (name) {
      case "code_block":
        block = "codeBlock";
        定过 = true;
        break;
      case "blockquote":
        block = "quote";
        定过 = true;
        break;
      case "heading":
        // `level` 是 schema 里的属性，理论上可能是 1–6 之外的数（自定义
        // schema 能改），越界就老实当正文，不要 `as` 出一个不存在的层级。
        block = (node.attrs.level >= 1 && node.attrs.level <= 6
          ? `h${node.attrs.level}`
          : "text") as BlockKind;
        定过 = true;
        break;
      case "list_item": {
        // ⚠️ 有序/无序要从**父节点**认（列表项自己不带这个信息），
        // 而父节点正好在上面一层（`d - 1`）。
        const 父 = d > 1 ? $from.node(d - 1).type.name : "";
        // `checked != null` = 任务项（`null` 是普通项，见 `insert.ts` 里那段）。
        block =
          node.attrs.checked != null ? "task" : 父 === "ordered_list" ? "ol" : "ul";
        定过 = true;
        break;
      }
      default:
        break;
    }
  }

  return { block, inTable };
}

/** 读一份完整的状态。导出来是为了让用例/别的调用点能直接问，不必建插件。 */
export function 读状态(state: EditorState): CommandState {
  const { $from, empty } = state.selection;
  // ⚠️ `storedMarks` 优先：光标刚落在某个位置、用户还没打字时，选区位置上的
  // marks 是**空的**，而下一次输入会用什么 mark 存在 `storedMarks` 里。
  // 只看 `$from.marks()` 的话，"按了 Ctrl+B 还没打字"这段时间工具栏不亮。
  const marks = state.storedMarks ?? (empty ? [] : $from.marks());
  const 有 = (name: string) => marks.some((m) => m.type.name === name);
  const { block, inTable } = 读块(state);

  // 「内容目录」那一项：整篇里有没有标题。⚠️ 只走**顶层**，理由见
  // `CommandState.hasHeadings` 那段（要与 `extractOutline` 同一片视野）。
  let hasHeadings = false;
  state.doc.forEach((节点) => {
    if (节点.type.name === "heading") hasHeadings = true;
  });

  return {
    overtype: 覆写开着(state),
    bold: 有("strong"),
    italic: 有("emphasis"),
    strike: 有("strike_through"),
    inlineCode: 有("inlineCode"),
    highlight: 有("highlight"),
    superscript: 有("superscript"),
    subscript: 有("subscript"),
    underline: 有("underline"),
    block,
    inTable,
    hasSelection: !empty,
    hasHeadings,
  };
}

/**
 * 一条签名。**只用来比对"变了没有"**，不参与任何判断。
 *
 * ⚠️ 顺序必须与 `读状态` 一一对应；加字段时**两边一起加**，漏了的话症状是
 * "某一项的高亮永远不更新"——因为签名没变，通知就没发出去。
 */
function 签名(s: CommandState): string {
  // ⚠️ `overtype` 也在签名里（2026-10-16）：它是**唯一**一格"与文档无关、
  // 却要驱动界面"的字段（`Insert` 只翻插件的 meta，不改文档）。漏掉它的症状
  // 很典型：状态栏那个 `OVR` **永远不出现**——因为签名没变，通知就没发出去
  // （这正是上面那条"加字段时两边一起加"的告诫说的那种情况）。
  return `${s.overtype ? 1 : 0}${s.bold ? 1 : 0}${s.italic ? 1 : 0}${s.strike ? 1 : 0}${s.inlineCode ? 1 : 0}` +
    `${s.highlight ? 1 : 0}${s.superscript ? 1 : 0}${s.subscript ? 1 : 0}${s.underline ? 1 : 0}` +
    `|${s.block}|${s.inTable ? 1 : 0}${s.hasSelection ? 1 : 0}${s.hasHeadings ? 1 : 0}`;
}

/**
 * 建那条"盯着光标看"的插件。
 *
 * `onChange` 在**建实例时**就会被调一次（`view` 钩子在挂载时跑），
 * 所以调用方不需要自己再读一遍初始值。
 */
export function 光标状态插件(onChange: (state: CommandState) => void) {
  return $prose(() => {
    let 上次 = "";
    const 报 = (state: EditorState) => {
      const now = 读状态(state);
      const sig = 签名(now);
      if (sig === 上次) return;
      上次 = sig;
      onChange(now);
    };
    return new Plugin({
      view: (view) => {
        // ⚠️ **挂载那一刻先报一次**。只挂 `update` 的话，初值要等到用户
        // 第一次敲键/点鼠标才会送到界面——那之前工具栏是"全灭"的，
        // 而用户看到的第一眼正是那一段时间。
        报(view.state);
        return {
          update: (view) => {
            报(view.state);
            // ⚠️ **一律返回 `false`**：这个插件不改 DOM。返回 `true` 会让
            // ProseMirror 以为视图需要重读，每次事务都多一轮无谓的工作。
            return false;
          },
        };
      },
    });
  });
}
