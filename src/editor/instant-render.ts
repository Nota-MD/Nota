/**
 * 即时渲染：光标所在块的 Markdown 标记，浅灰画在块的左边。
 *
 * # 为什么要有这个
 *
 * Milkdown 默认是"**标记一敲完就吃掉**"：打 `## ` 立刻变成二级标题，
 * 那两个井号**从这个世界上消失了**。光标再挪回标题上，也不回来。
 *
 * 本仓要的行为是：**标记一直都在，只是淡化**——
 * 光标在当前块里时，`##` 以浅灰画在块左边（用户 2026-09-22 的原话：
 * "只输入了两个 ## 则只半透明哦，不是消失"）；光标一离开，标记**连着
 * 它占的宽度一起**收掉。差别不只是好看：**"这段到底是什么语法"随时看得见**，
 * 不用去猜刚打的那个 `>` 到底生效没有。
 *
 * # 为什么是 Decoration，不是"自己插一段 DOM"
 *
 * 直接 `appendChild` 的东西会被 ProseMirror 重绘时冲掉——**所有"只改显示
 * 不改文档"的事都得走 Decoration**，这是它的定义，不是可选项。
 * 社区里还有人用假节点硬塞行内标记（`**`），结果是"打出来的字跑到标记
 * 前面去了"、光标进不去、退格删不掉。⚠️ 本仓这里没有那个问题，是因为
 * **块级标记本来就该在文档外面**：光标本就不能单独钻进 `##` 中间。
 * 行内标记（`**`、反引号）是另一回事——那个必须让符号真的存在于文档里
 * （要改 schema），见 `docs/07` backlog 第 37 项。
 *
 * # ⚠️ 为什么是 `Decoration.node` 而不是 `Decoration.widget`
 *
 * **第一版就是 widget，症状如下。** 它把标记的 `<span>` 插在块内部开头
 * （`$from.before(d) + 1`），指望它跟着块走。结果：
 *
 * - 标题、引用、代码块都正常；
 * - **列表项错位**——光标在第 1 个列表项里，标记画到了**第 2 个列表项**上。
 *
 * 位置在块边界上的 widget，落点不由本仓决定（ProseMirror 要处理
 * "这个位置在哪个 DOM 节点里"的映射，而块首那种位置是有歧义的）。
 *
 * 换成 `Decoration.node` 之后就没有这个问题了：**它是给块本身加 class 和
 * 属性**，没有第二个元素、没有位置歧义。标记文字交给 CSS 的
 * `::before { content: attr(...) }` 去画——**定位祖先就是块自己**，
 * 这是"块级标记画在块左边"最直接的表达方式。顺带还有两样好处：
 * 少一个 DOM 节点；状态变化时 CSS 过渡能生效（伪元素的显隐是连续的）。
 */

import { $prose } from "@milkdown/kit/utils";
import { Plugin, PluginKey } from "@milkdown/kit/prose/state";
import { Decoration, DecorationSet } from "@milkdown/kit/prose/view";
import type { Node as PMNode } from "@milkdown/kit/prose/model";

/** 加在块上的 class。CSS 见 `src/styles/marks.css`。 */
const MARK_CLASS = "nota-srcmark";

/**
 * 标题那一档额外挂的 class（**只它一个**）。CSS 见 `src/styles/marks.css`。
 * 它把标记画成一颗 `H1`/`H2` 的**徽标**，而不是一排井号。
 */
const MARK_CLASS_标题 = "nota-srcmark-h";

/** 标记文字走这个属性，CSS 里 `content: attr(data-srcmark)` 取它。 */
export const MARK_ATTR = "data-srcmark";

/**
 * 标题在装订线里显示的那颗**徽标**：`H1` … `H6`。
 *
 * ⚠️ **2026-09-26 用户要求改的**，原话：「标题输入后，前面的半透明 “#” 改成
 * H 几的这样的小图标吧」。改之前是 `"#".repeat(level)`，即**照原样显示井号**。
 *
 * ⚠️ 这与本文件的主旨有一处**故意的不一致**，写下来免得后人当成 bug 改回去：
 * 这个插件的立身之本是"**把编辑器吃掉的那个标记还给用户看**"（见文件头），
 * 而 `H1` 并不是用户敲进去的东西——它是一层**翻译**。换它的理由有两条：
 * ① 用户要的是"一眼看出这是几级"，数井号是**读**，`H1` 是**直接答**；
 * ② 井号数一多（`######`）在 56px 的装订线里挤成一条虚线，本来也不好认。
 * 代价讲清楚：**标题这一档不再告诉你"源码里是几个井号"**——要那个信息就切
 * 源码模式（`Ctrl+/`），那边一个字都不改。
 *
 * ⚠️ 层级**只认 1~6**（CommonMark 就六档，`node.attrs.level` 理论上也可能是
 * `null`／字符串）。越界一律并到边界那一档，不显示 `H0` / `H7` 这种文档里
 * 不存在的层级——徽标是个**标识**，它撒谎比它缺失更糟。
 */
export function 标题徽标(level: unknown): string {
  const n = Math.floor(Number(level));
  const 档 = Number.isFinite(n) && n >= 1 ? Math.min(6, n) : 1;
  return `H${档}`;
}

/**
 * 这个块该在左边显示什么标记。**返回 null = 不显示**（段落、表格等）。
 *
 * `parent` / `index` 只对列表项有用：有序列表的序号得知道"我是第几项"，
 * 而那是**父节点和同级位置**的信息，node 自己身上没有。
 */
function markerOf(node: PMNode, parent: PMNode | null, index: number): string | null {
  switch (node.type.name) {
    case "heading":
      return 标题徽标(node.attrs.level);

    case "blockquote":
      return ">";

    case "list_item": {
      // 任务项（`- [x] …`）**不给短横**：它的方框已经画在同一个装订线里了
      //（见 `task-list.ts` 与 `app.css`），再叠一个 `-` 就得二选一地挪位，
      // 而挪出来的读序（`☐ -`）和 markdown 的（`- [x]`）是反的。
      // 方框本身就是 `- [ ]` 这个结构渲染出来的样子。
      if (node.attrs.checked != null) return null;

      if (parent?.type.name === "ordered_list") {
        // `order` 是列表的起始号（Markdown 允许从 3 开始），默认 1。
        return `${Number(parent.attrs.order ?? 1) + index}.`;
      }
      // 无序列表（bullet_list）。
      return "-";
    }

    case "code_block":
      // ⚠️ **只画三个反引号，不带语言名**（2026-09-22 改的，原来是 ```` + 语言名）。
      // 理由是**宽度**：这条标记画在正文列的左外侧，而左边那条空位是固定的
      // 56px（见 `editor.css` 里 `.milkdown` 的 `padding`），语言名一长
      //（`javascript`、`markup-templating`）标记就**顶出正文列、被编辑区的
      // `overflow` 从左边裁掉**——实测抓到过只剩一个「st」的样子。
      // 想给语言名留位置就得把左边距按最长的语言名来定，那是几十个像素买
      // 一个信息量很低的东西：**语言名就在代码块右下角的选择器里摆着**，
      // 用户要的是"这一块是代码"，不是"再读一遍语言名"。
      return "```";

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
  // 只有"光标是一个点"时才显示。框选一片时不显示。
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
    // 标题那一档多挂一个 class（它要画成徽标，见 `标题徽标` 的注释）。
    // ⚠️ 判据写成 `node.type.name` 而不是"看 mark 长什么样"：徽标的样子在 CSS
    // 里定，这里只回答"这是不是标题"，两边各管一段，不互相猜。
    const 类 = node.type.name === "heading" ? `${MARK_CLASS} ${MARK_CLASS_标题}` : MARK_CLASS;
    decos.push(
      // ⚠️ 给**块本身**挂 class 和属性，不插新元素。理由见文件头那一段。
      Decoration.node(from, from + node.nodeSize, {
        class: 类,
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
