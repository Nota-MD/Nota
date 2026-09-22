/**
 * 即时渲染：光标所在块的 Markdown 标记，浅灰画在块的左边。
 *
 * # 为什么要有这个
 *
 * Milkdown 默认是"**标记一敲完就吃掉**"：打 `## ` 立刻变成二级标题，
 * 那两个井号**从这个世界上消失了**。光标再挪回标题上，也不回来。
 *
 * Typora 不是这么干的。它的行为是：**标记一直都在，只是淡化**——
 * 光标在当前块里时，`##` 以浅灰画在块左边（用户 2026-09-22 的原话：
 * "只输入了两个 ## 则只半透明哦，不是消失"）；光标一离开，标记**连着
 * 它占的宽度一起**收掉。差别不只是好看：**"这段到底是什么语法"随时看得见**，
 * 不用去猜"我刚才那个 `>` 到底生效没有"。
 *
 * # 为什么是 Decoration，不是"自己插一段 DOM"
 *
 * 直接 `appendChild` 的东西会被 ProseMirror 重绘时冲掉——**所有"只改显示
 * 不改文档"的事都得走 Decoration**，这是它的定义，不是可选项。
 * 社区里还有人用假节点硬塞行内标记（`**`），结果是"打出来的字跑到标记
 * 前面去了"、光标进不去、退格删不掉。⚠️ 我们这里没踩那个坑，是因为
 * **块级标记本来就该在文档外面**：Typora 里光标本就不能单独钻进 `##` 中间。
 * 行内标记（`**`、反引号）是另一回事——那个必须让符号真的存在于文档里
 * （要改 schema），见 `docs/07` backlog 第 37 项。
 *
 * # ⚠️ 为什么是 `Decoration.node` 而不是 `Decoration.widget`
 *
 * **踩过。** 第一版用的是 widget，把标记的 `<span>` 插在块内部开头
 * （`$from.before(d) + 1`），指望它跟着块走。结果：
 *
 * - 标题、引用、代码块都正常；
 * - **列表项错位**——光标在第 1 个列表项里，标记画到了**第 2 个列表项**上。
 *
 * 位置在块边界上的 widget，落点不由我们说了算（ProseMirror 要处理
 * "这个位置在哪个 DOM 节点里"的映射，而块首那种位置是有歧义的）。
 *
 * 换成 `Decoration.node` 之后就没有这个问题了：**它是给块本身加 class 和
 * 属性**，没有第二个元素、没有位置歧义。标记文字交给 CSS 的
 * `::before { content: attr(...) }` 去画——**定位祖先就是块自己**，
 * 这是"块级标记画在块左边"最直接的表达方式。顺带还白捡了两样：
 * 少一个 DOM 节点；状态变化时 CSS 过渡能生效（伪元素的显隐是连续的）。
 */

import { $prose } from "@milkdown/kit/utils";
import { Plugin, PluginKey } from "@milkdown/kit/prose/state";
import { Decoration, DecorationSet } from "@milkdown/kit/prose/view";
import type { Node as PMNode } from "@milkdown/kit/prose/model";

/** 加在块上的 class。CSS 见 `src/styles/app.css`。 */
const MARK_CLASS = "nota-srcmark";

/** 标记文字走这个属性，CSS 里 `content: attr(data-srcmark)` 取它。 */
export const MARK_ATTR = "data-srcmark";

/**
 * 这个块该在左边显示什么标记。**返回 null = 不显示**（段落、表格等）。
 *
 * `parent` / `index` 只对列表项有用：有序列表的序号得知道"我是第几项"，
 * 而那是**父节点和同级位置**的信息，node 自己身上没有。
 */
function markerOf(node: PMNode, parent: PMNode | null, index: number): string | null {
  switch (node.type.name) {
    case "heading":
      return "#".repeat(Number(node.attrs.level ?? 1));

    case "blockquote":
      return ">";

    case "list_item": {
      if (parent?.type.name === "ordered_list") {
        // `order` 是列表的起始号（Markdown 允许从 3 开始），默认 1。
        return `${Number(parent.attrs.order ?? 1) + index}.`;
      }
      // 无序列表（bullet_list）。任务项也走这里——它的短横照样要显示。
      return "-";
    }

    case "code_block": {
      const lang = node.attrs.language;
      return lang ? "```" + String(lang) : "```";
    }

    default:
      return null;
  }
}

/** 按当前光标位置算出装饰集。 */
function buildDecorations(state: { selection: unknown; doc: PMNode }): DecorationSet {
  const sel = state.selection as {
    empty: boolean;
    $from: {
      depth: number;
      before: (d: number) => number;
      node: (d: number) => PMNode;
      index: (d: number) => number;
    };
  };
  // 只有"光标是一个点"时才显示。框选一片时不显示——Typora 也是。
  if (!sel.empty) return DecorationSet.empty;

  const { $from } = sel;
  const decos: Decoration[] = [];

  // 从最内层往外走，`d` 是这个祖先在 `$from` 里的深度。
  // 一层都不漏：光标在引用里的段落上，`>` 要出来；光标在嵌套列表深处，
  // 外层内层的短横都要出来。
  for (let d = $from.depth; d > 0; d--) {
    const node = $from.node(d);
    const parent = d > 1 ? $from.node(d - 1) : null;
    const mark = markerOf(node, parent, parent ? $from.index(d - 1) : 0);
    if (!mark) continue;

    const from = $from.before(d);
    decos.push(
      // ⚠️ 给**块本身**挂 class 和属性，不插新元素。理由见文件头那一段。
      Decoration.node(from, from + node.nodeSize, {
        class: MARK_CLASS,
        [MARK_ATTR]: mark,
      }),
    );
  }

  return decos.length ? DecorationSet.create(state.doc, decos) : DecorationSet.empty;
}

/**
 * 插件本体。
 *
 * ⚠️ 装饰在**每次 state 变化**时重算（含光标移动）。这看着很勤，但代价是
 * O(光标深度) ——最多四五个节点，比一次字符输入的解析便宜得多。
 * 故意**不做缓存**：缓存要自己判断"这次变化影响不影响结果"，判错的代价是
 * 标记不跟着光标走，而"跟着光标走"正是这个功能唯一要做对的事。
 */
export const instantRender = $prose(
  () =>
    new Plugin({
      key: new PluginKey("nota-instant-render"),
      props: {
        decorations: (state) => buildDecorations(state as never),
      },
    }),
);
