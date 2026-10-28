/**
 * 行内标记的提示：光标落在任一行内标记里时，把该标记的真实左右源码符号
 * 画在那段文字的左右两边。
 *
 * 用户 2026-09-26 的原话：「我认为如果光标在黑体/斜体内容内，可否半透明显示*？」
 *
 * # 和 `instant-render.ts` 的分工
 *
 * `instant-render.ts` 管**块级**标记（`#` / `>` / `-` / ` ``` `）：那些标记画在
 * 块的**左边那条 56px 装订线**里，不占正文宽度。本文件管**行内**标记——
 * 它没有装订线可用，标记只能画在字与字之间，所以是**另一份**插件、**另一条**
 * CSS 规则（`.nota-markhint`，在 `src/styles/marks.css` 里紧挨着 `.nota-srcmark`）。
 *
 * ⚠️ `instant-render.ts` 的文件头里写着"行内标记是另一回事，必须让符号真的
 * 存在于文档里（要改 schema）"——那句话说的是**第五版之前**的思路：那是要
 * 让 `**` 变成可点、可退格、可把光标停进去的真字符（`docs/07` backlog 第 37 项）。
 * 用户要的是"看得见的实体符号"，不是"把定界符变成可编辑的结构字符"。
 * 所以这里走的是**纯显示**（左右各一颗 `Decoration.widget`），
 * 不动 schema、不动文档，一个字节都不写回。
 *
 * # 左右符号都是**真实文本节点**（2026-10-23，2026-10-24 扩展到全部行内标记）
 *
 * 两颗各是一个带文字内容的 `<span>`，由 `Decoration.widget` 放进编辑器 DOM。
 * 左侧 `side:-1` 放在标记起点之前，光标落在它右边；右侧同样 `side:-1` 放在
 * 标记终点之前，光标落在它右边。这样既保留 BUG-65 定下的光标手感，又不让
 * 符号成为粗体／斜体文字的伪元素。
 *
 * ⚠️ **不能再用 `Decoration.inline` + `::before` 画左符号**（2026-10-23，用户
 * 看截图报「这两个星号不是实体。事实上它们应该是半透明的实体」）：伪元素挂在
 * 被加粗／倾斜的文本上，会继承宿主的字形与字重；视觉上仍是正文的一部分。
 * widget 自带真实文字，并通过 `marks: []` 明确不套任何行内 mark。
 *
 * ⚠️ 中途试过、**被推翻**的一条：把"光标贴段尾"那一格整个不画（`扫一段` 收紧）。
 * 那是"躲开问题"不是解决——Typora 那里是**照常显示**的。别再走回去。
 *
 * ⚠️ **widget 只插 DOM、不进文档**：它没有文档位置，一个字节都不写回，
 * 与 `instant-render.ts` 那个"插 `<span>` 被当成正文"的坑**不是一回事**——
 * 那边错在把元素插进了文本节点流里当正文，这边是 ProseMirror 认得的装饰。
 *
 * # 长相：widget 内的真实文字
 *
 * 符号直接写进 `textContent`。字体与字号跟随正文，默认颜色与正文相同、
 * 完全不透明，是清楚的实体字符。主题可以通过 `--mark-hint-fg` 与
 * `--mark-hint-opacity` 调整语法提示的强弱。每个符号字符各是一颗 widget，
 * `**` / `</u>` 不再被当成一个不可分的文字块。
 *
 * ⚠️ **代价讲清楚**：这两个符号是**占宽度**的（它们是文档流里的真实 `<span>`，
 * 不是绝对定位的浮标）。所以光标进出加粗段时，那一行会横向动
 * 两个字符的宽度。选它是因为用户反复拿 Typora 当参照（那边就是把 `**` 原样
 * 显示出来），而"看得见自己写的是 `**` 还是 `_`"正是他要的信息。
 * 想改成不占位的浮标（`position: absolute` + `right: 100%`，像 `.nota-srcmark`
 * 那样）的话，只改 CSS 那一条就够——**这个文件一行都不用动**。
 * 没这么做是因为行内没有装订线，绝对定位的符号会**压在前一个字上面**。
 *
 * # 只对**可编辑**实例装（`create.ts` 里那句 `readOnly ? [] : [...]`）
 *
 * 这是编辑时的提示，不是文档的一部分。只读实例有两个：应用里的分屏预览、
 * 导出 HTML 用的那个离屏实例。前者装上了会在预览里多出 `**`，后者会把它
 * 带进导出文件。
 *
 * ⚠️ 所以**压根不给只读实例装**（`create.ts` 那句 `readOnly ? [] : [markHint]`）
 * ——这也是为什么 `editor/export.ts` 的 `摘掉的属性` 里**没有** `.nota-markhint`：
 * 那个清单是给"装上了、但导出时要洗掉"的东西用的（`data-srcmark` 就是，
 * `instantRender` 是恒挂的）。本文件没挂上去，就没有第二个地方要记。
 * 将来真改成恒挂，**先在那边登记 `提示属性`**，否则环星号会跟着进导出文件。
 */

import { $nodeSchema, $prose } from "@milkdown/kit/utils";
import { Plugin, PluginKey } from "@milkdown/kit/prose/state";
import {
  Fragment,
  Mark,
  type MarkType,
  type Node as PMNode,
  type NodeType,
} from "@milkdown/kit/prose/model";
import type { MilkdownPlugin } from "@milkdown/kit/ctx";

import { markTable } from "./inline-marks";

/** 真实语法字符节点上的 class。CSS 见 `src/styles/marks.css`。 */
export const noticeClass = "nota-syntax-marker";

/**
 * 提示哪几种标记、各画什么左右符号。**就这一张表**；本仓自造的高亮 / 上下标 /
 * 下划线从 `inline-marks.ts` 的标记表取源码符号，避免第二份真相源。
 *
 * ⚠️ `名` 是 **schema 里那个 mark 的 id**，不是中文、不是节点名、也**不是
 * Markdown 语法里的名字**。取不到就跳过那一行（`state.schema.marks[名]` 为
 * `undefined`），所以写错名字的症状是"**那一种标记的提示不出现**"，不报错。
 * 2026-09-26 就栽在这儿：斜体那一行写的是 `"em"`，而
 * `@milkdown/preset-commonmark` 里那个 mark 的 id 是 **`"emphasis"`**
 * （见 `node_modules/@milkdown/preset-commonmark` 里 `$markSchema("emphasis", …)`；
 * 本仓 `src/editor/command-state.ts` 早就在用 `有("emphasis")`）。
 * 于是"加粗的 `**` 出来了、斜体的 `*` 怎么都不出来"，悄悄错了一版。
 * 现在有两道防线：`tests/mark-hint.test.ts` 拿**真 preset** 的 id 对一遍，
 * 运行期取不到会 `console.warn`（见 `算提示`）。
 *
 * ⚠️ 每行的左右符号要与 serializer 一致：加粗/斜体为 `**`/`*`，行内代码为
 * 反引号，删除线 `~~`，高亮 `==`，上下标 `^`/`~`，下划线 `<u>`/`</u>`。
 * 左右分开声明，不能假设两边相同。
 *
 * 📌 导出只给 `tests/mark-hint.test.ts` 用（它拿真 preset 的 id 对这张表）。
 */
export const noticeTable: readonly { name3: string; left: string; right: string }[] = [
  { name3: "strong", left: "**", right: "**" },
  { name3: "emphasis", left: "*", right: "*" },
  { name3: "inlineCode", left: "`", right: "`" },
  { name3: "strike_through", left: "~~", right: "~~" },
  ...markTable.map((spec) => ({
    name3: spec.label,
    left: spec.left,
    right: spec.right,
  })),
];

interface SyntaxNodeAttribute {
  syntax: string;
  side: "left" | "right";
  symbol: string;
}

/**
 * 临时语法字符节点。
 *
 * 每个星号是一颗独立行内原子节点：它有真实文档位置，光标可以停在任意两颗
 * 星号之间，但它自己**不能承载输入文字**。这一点必须用 atom；带内容的行内
 * 节点会把外层边界的输入吸进星号节点，导致“在右星号后面打字”反而钻进标记。
 * `toMarkdown.runner` 不 `addNode`，所以它不会被重复写回文件。
 */
export const inlineSyntaxNodeSpec = $nodeSchema("notaSyntax", () => ({
  inline: true,
  group: "inline",
  atom: true,
  marks: "",
  selectable: false,
  attrs: {
    syntax: { default: "" },
    side: { default: "left" },
    symbol: { default: "*" },
  },
  parseDOM: [
    {
      tag: `span.${noticeClass}`,
      getAttrs: (dom: HTMLElement | string) => ({
        syntax: typeof dom === "string" ? dom : (dom.dataset.syntax ?? ""),
        side: typeof dom === "string" ? "left" : (dom.dataset.side ?? "left"),
        symbol: typeof dom === "string" ? "*" : dom.textContent ?? "*",
      }),
    },
  ],
  toDOM: (node: PMNode) => {
    const attrs = node.attrs as SyntaxNodeAttribute;
    return [
      "span",
      {
        class: noticeClass,
        "data-syntax": attrs.syntax,
        "data-side": attrs.side,
      },
      attrs.symbol,
    ];
  },
  parseMarkdown: {
    match: () => false,
    runner: () => {},
  },
  toMarkdown: {
    match: (node: PMNode) => node.type.name === "notaSyntax",
    runner: () => {},
  },
}));

/** `$nodeSchema` 的两元组必须整份摊平，同其他 schema。 */
export const inlineSyntaxNodePlugins = inlineSyntaxNodeSpec.flat() as unknown as MilkdownPlugin[];

/**
 * 从 `位置` 往两边扫，找出**连续带这个标记**的那一整段。扫不到返回 `null`。
 *
 * ⚠️ 边界只看**所在的文本块**（`$位.start()` / `$位.end()`）：mark 本来就
 * 不跨块，但 `doc.resolve()` 在块外面也能问出东西来——不夹这个边界的话，
 * 段落末尾的加粗会把下一段的字符也扫进来（两段的 mark 恰好相同时看不出来，
 * 隔着别的块时就是一根跨越块边界的高亮）。
 *
 * ⚠️⚠️ **不要拿 `doc.resolve(p).marks()` 当"第 p 个字符的标记"用。**
 * 它答的是"**在 p 这个位置打字会拿到什么 mark**"，也就是**左边那个字符**的
 * mark，而且在节点边界上还会给出 `undefined`。2026-09-26 的第一版就是这么
 * 写的，无头目检里量出来的症状是**两端的标记都画在全段右移一格的地方**：
 * 加粗的 `一二三四五` 显示成了 `一**二三四五***`（左边那个 `**` 落在第二个
 * 字前面，右边那个落到了段外）。原因是 `marks()` 取的是左邻居：
 *
 * - 在"加粗段的**起点**"那一处问，左边是没加粗的字 → 答"没有" → 左边界
 *   只肯退到 `起点 + 1`（**晚一格**）；
 * - 在"加粗段的**终点**"那一处问，左边是加粗的字 → 答"有" → 右边界
 *   一直走出去（**远一格**）。
 *
 * 所以下面**自己数**：把这一块的行内孩子挨个摊平成一串位置区间，直接问
 * "第 j 个位置落在哪个孩子里、那个孩子带不带这个标记"。行内原子（行内公式、
 * 图片、软换行）各占**一个**位置、一律算"不带标记"——它们本来就不能带 mark。
 *
 * 这段是**线性**的（每个位置都要从后往前扫一遍孩子表），但 n 是"这一块里
 * 行内孩子的个数"，一段文字最多几十个，而且只在光标所在的那一块上跑。
 */
export function scanOneParagraph(
  doc: PMNode,
  position2: number,
  type: MarkType,
): { from: number; to2: number } | null {
  const position = doc.resolve(position2);
  const parent = position.parent;
  // 光标不落在能装文字的那一层（比如嵌在图片/公式这类原子节点里）就没得扫。
  if (!parent.inlineContent) return null;

  /** 每个行内孩子从哪个位置起、带不带这个标记。 */
  const children2: { from: number; withValue: boolean }[] = [];
  let length = 0;
  for (let i = 0; i < parent.childCount; i++) {
    const child2 = parent.child(i);
    const width = child2.isText === true ? ((child2.text as string).length) : child2.nodeSize;
    // ⚠️ `MarkType.isInSet` 的类型是 `Mark | undefined`（**不是** `boolean`），
    //    所以这里判"带不带"要比 `undefined`，不能写 `&&`/`=== true`——
    //    写成后者过不了 `tsc --noEmit`（`Mark | undefined` 与 `boolean` 没有交集）。
    //    行内原子（公式 / 图片）的 `marks` 是空集，问出来就是 `undefined`，
    //    所以**不用**再单独判 `isText`。
    children2.push({ from: length, withValue: type.isInSet(child2.marks) !== undefined });
    length += width;
  }
  if (length <= 0) return null;

  /** 第 `j` 个位置（`0 <= j < 长`）带不带这个标记。 */
  const withValue = (j: number): boolean => {
    for (let i = children2.length - 1; i >= 0; i--) {
      const child2 = children2[i];
      if (child2 && j >= child2.from) return child2.withValue;
    }
    return false;
  };

  const blockFirst = position.start();
  const cursor = Math.min(Math.max(position2 - blockFirst, 0), length);
  // 光标落在这一段里（第 `光标` 个位置带标记），或者**紧贴在段尾**
  // （刚打完 `**粗**`，光标停在最后一个字后面，那时它后面已经没有带标记的字了）。
  //
  // ⚠️⚠️ **后一支 2026-10-05 一度被去掉过，当天就收回来了**（BUG-65）：
  //   当时想的是"光标在标记外面就不画"（连注释都写成了"光标的位置在撒谎"）。
  //   用户拿 **Typora 的两张图**当场推翻了它——**Typora 是照常显示的**：
  //   光标能停在右符号的**左边**（`*你好|*`）、也能停在**右边**（`*你好*|`），
  //   两种位置符号都在。躲开不画不是它的做法。
  //
  //   真正要修的是**画的位置**：右符号改走 `Decoration.widget(…, {side:-1})`
  //   之后，段尾那一格光标画在右符号**右边**，于是"看得见"与"光标不撒谎"
  //   两件事同时成立。**别再退回"不画"那一版。**
  if (!((cursor < length && withValue(cursor)) || (cursor > 0 && withValue(cursor - 1)))) return null;

  let from = cursor;
  let to2 = cursor;
  while (from > 0 && withValue(from - 1)) from--;
  while (to2 < length && withValue(to2)) to2++;
  return { from: blockFirst + from, to2: blockFirst + to2 };
}

/**
 * 提示表里那些名字，有哪些在**当前这颗 schema** 里找不到。
 *
 * ⚠️ 这是"名字写错就悄悄不显示"那道防线的**运行期**一半（另一半是
 * `tests/mark-hint.test.ts` 拿真 preset 的 id 对表）。只报一次：这个函数
 * 每次光标动都会跑，逐次 `console.warn` 会把控制台刷爆（而且 `NOTA_DEBUG`
 * 那套日志本来就只在调试时看）。
 */
let reportPassMissingName = false;

function checkMissingName(marks: Record<string, MarkType | undefined>): void {
  if (reportPassMissingName) return;
  const missing2 = noticeTable.filter(({ name3 }) => !marks[name3]).map(({ name3 }) => name3);
  if (!missing2.length) return;
  reportPassMissingName = true;
  console.warn(
    `[nota] 行内标记提示：schema 里没有这几个 mark，对应的提示不会出现：${missing2.join("、")}` +
      `（提示表在 src/editor/mark-hint.ts）。斜体那个 mark 的 id 是 \`emphasis\`，不是 \`em\`。`,
  );
}

/**
 * 建一颗标记 widget 元素。
 *
 * ⚠️ 这个函数**只在真渲染那一刻**才被调（`Decoration.widget` 收的是构造函数），
 * 所以 `tests/mark-hint.test.ts` 在 node 里 import 本模块、跑 `扫一段` 时
 * **不会**碰到 `document`——这是"纯位置算术能在无 DOM 环境里测"的前提，
 * 别图省事把 `document.createElement` 挪到模块顶层。
 */
export function splitMarkCharacter(symbolNumber: string): string[] {
  return Array.from(symbolNumber);
}

interface SyntaxMarkerRange {
  from: number;
  to2: number;
  text4: string;
  syntax: string;
  side: "left" | "right";
}

interface ActiveMarkRange {
  name: string;
  left: string;
  right: string;
  from: number;
  to2: number;
  leftMarker: SyntaxMarkerRange | null;
  rightMarker: SyntaxMarkerRange | null;
}

interface MarkHintState {
  /** 收起标记后，暂不重新显示的那个折叠光标位置。 */
  suppressedAt: number | null;
}

const markHintKey = new PluginKey<MarkHintState>("nota-mark-hint");

/** 当前文档里的全部临时语法字符。 */
export function listSyntaxMarkers(doc: PMNode, syntaxType: NodeType): SyntaxMarkerRange[] {
  const single: SyntaxMarkerRange[] = [];
  doc.descendants((node, position2) => {
    if (node.type !== syntaxType) return true;
    const attrs = node.attrs as Partial<SyntaxNodeAttribute>;
    single.push({
      from: position2,
      to2: position2 + node.nodeSize,
      text4: typeof attrs.symbol === "string" ? attrs.symbol : "*",
      syntax: typeof attrs.syntax === "string" ? attrs.syntax : "",
      side: attrs.side === "right" ? "right" : "left",
    });
    return false;
  });
  const output2: SyntaxMarkerRange[] = [];
  for (const marker of single) {
    const last = output2.at(-1);
    if (
      last &&
      last.to2 === marker.from &&
      last.syntax === marker.syntax &&
      last.side === marker.side
    ) {
      last.to2 = marker.to2;
      last.text4 += marker.text4;
    } else {
      output2.push({ ...marker });
    }
  }
  return output2;
}

/**
 * 找光标当前所在、且与光标相邻的那一段同一行内标记。
 *
 * 与旧的 `scanOneParagraph` 不同，这里的文档允许已经存在真实语法字符。
 * 光标停在 `**|粗体**`、`**粗体|**`、`**粗体**|` 三个位置时都算命中；
 * 只有再向外走进普通正文时，语法字符才会收起。
 */
export function findActiveMarkRange(
  doc: PMNode,
  position2: number,
  type: MarkType,
  syntaxType: NodeType,
): ActiveMarkRange | null {
  const at = doc.resolve(position2);
  let depth = at.depth;
  // 光标停在临时语法节点的文字里时，`$from.parent` 是 `notaSyntax` 自己；
  // 真正要找的带格式文本与相邻节点在上一层段落里。
  while (depth > 0 && at.node(depth).type === syntaxType) depth--;
  const parent = at.node(depth);
  if (!parent.inlineContent) return null;

  const rows: Array<{
    from: number;
    to2: number;
    marked: boolean;
    syntax: SyntaxNodeAttribute | null;
  }> = [];
  let offset = at.start(depth);
  for (let i = 0; i < parent.childCount; i++) {
    const child = parent.child(i);
    const syntax = child.type === syntaxType ? child : null;
    const attrs = syntax?.attrs as Partial<SyntaxNodeAttribute> | undefined;
    rows.push({
      from: offset,
      to2: offset + child.nodeSize,
      marked: child.isText && !syntax && type.isInSet(child.marks) !== undefined,
      syntax: syntax
        ? {
            syntax: typeof attrs?.syntax === "string" ? attrs.syntax : "",
            side: attrs?.side === "right" ? "right" : "left",
            symbol: typeof attrs?.symbol === "string" ? attrs.symbol : "*",
          }
        : null,
    });
    offset += child.nodeSize;
  }

  for (let i = 0; i < rows.length; i++) {
    if (!rows[i]!.marked) continue;
    const begin = i;
    let end = i;
    while (end + 1 < rows.length && rows[end + 1]!.marked) end++;

    const contentFrom = rows[begin]!.from;
    const contentTo = rows[end]!.to2;
    const markerGroup = (
      index: number,
      direction: -1 | 1,
      side: "left" | "right",
    ): SyntaxMarkerRange | null => {
      const first = rows[index];
      if (
        first?.syntax?.syntax !== type.name ||
        first.syntax.side !== side
      ) {
        return null;
      }
      let edge = index;
      while (
        rows[edge + direction]?.syntax?.syntax === type.name &&
        rows[edge + direction]?.syntax?.side === side
      ) {
        edge += direction;
      }
      const ordered =
        direction < 0
          ? rows.slice(edge, index + 1)
          : rows.slice(index, edge + 1);
      return {
        from: ordered[0]!.from,
        to2: ordered.at(-1)!.to2,
        text4: ordered.map((row) => row.syntax?.symbol ?? "*").join(""),
        syntax: type.name,
        side,
      };
    };
    const leftMarker = begin > 0 ? markerGroup(begin - 1, -1, "left") : null;
    const rightMarker = end + 1 < rows.length ? markerGroup(end + 1, 1, "right") : null;
    const leftBoundary = leftMarker?.from ?? contentFrom;
    const rightBoundary = rightMarker?.to2 ?? contentTo;
    if (position2 >= leftBoundary && position2 <= rightBoundary) {
      const spec = noticeTable.find((item) => item.name3 === type.name);
      if (!spec) return null;
      return {
        name: spec.name3,
        left: spec.left,
        right: spec.right,
        from: contentFrom,
        to2: contentTo,
        leftMarker,
        rightMarker,
      };
    }
    i = end;
  }
  return null;
}

/**
 * 插件本体。
 *
 * ⚠️ 装饰在**每次 state 变化**时重算（含光标移动），不做缓存——理由与
 * `instant-render.ts` 那条一字不差：缓存要自己判断"这次变化影响不影响结果"，
 * 判错的代价是提示不跟着光标走，而"跟着光标走"是这个功能唯一要做对的事。
 * 代价是 O(1)：只看光标那两处相邻位置。
 */
export function createMarkHintPlugin(syntaxType: NodeType): Plugin {
  return new Plugin({
      key: markHintKey,
      state: {
        init: (): MarkHintState => ({ suppressedAt: null }),
        apply: (tr, value): MarkHintState => {
          const own = tr.getMeta(markHintKey) as number | null | undefined;
          if (own !== undefined) return { suppressedAt: own };
          if (tr.selectionSet || tr.docChanged) return { suppressedAt: null };
          return value;
        },
      },
      appendTransaction: (_transactions, _oldState, newState) => {
        const { doc, selection, schema } = newState;
        const marks = schema.marks as Record<string, MarkType | undefined>;
        checkMissingName(marks);

        const targets: ActiveMarkRange[] = [];
        const suppressedAt = markHintKey.getState(newState)?.suppressedAt ?? null;
        if (selection.empty && selection.from !== suppressedAt) {
          for (const { name3 } of noticeTable) {
            const type = marks[name3];
            if (!type) continue;
            const found = findActiveMarkRange(doc, selection.from, type, syntaxType);
            if (found) targets.push(found);
          }
        }

        const markers = listSyntaxMarkers(doc, syntaxType);
        const keep = new Set<string>();
        const missing: Array<{
          position2: number;
          text4: string;
          syntax: string;
          side: "left" | "right";
        }> = [];

        for (const target of targets) {
          if (target.leftMarker?.text4 === target.left) {
            keep.add(
              `${target.leftMarker.from}:${target.leftMarker.to2}:${target.name}:left:${target.left}`,
            );
          } else {
            missing.push({
              position2: target.from,
              text4: target.left,
              syntax: target.name,
              side: "left",
            });
          }
          if (target.rightMarker?.text4 === target.right) {
            keep.add(
              `${target.rightMarker.from}:${target.rightMarker.to2}:${target.name}:right:${target.right}`,
            );
          } else {
            missing.push({
              position2: target.to2,
              text4: target.right,
              syntax: target.name,
              side: "right",
            });
          }
        }

        const boundaryMarks: Mark[] = [];
        for (const target of targets) {
          if (selection.from !== target.from && selection.from !== target.to2) continue;
          const type = marks[target.name];
          if (type) boundaryMarks.push(type.create());
        }
        const uniqueBoundaryMarks = boundaryMarks.filter(
          (mark, index, all) => all.findIndex((other) => other.eq(mark)) === index,
        );
        const storedChanged = !Mark.sameSet(newState.storedMarks ?? [], uniqueBoundaryMarks);

        const removals = markers
          .filter(
            (marker) =>
              !keep.has(`${marker.from}:${marker.to2}:${marker.syntax}:${marker.side}:${marker.text4}`),
          )
          .sort((a, b) => b.from - a.from);

        if (removals.length === 0 && missing.length === 0 && !storedChanged) return null;
        const tr = newState.tr;
        tr.setMeta("addToHistory", false);

        for (const marker of removals) tr.delete(marker.from, marker.to2);

        const removedAtCursor = removals.some(
          (marker) =>
            selection.from === marker.from || selection.from === marker.to2,
        );
        const suppressionAfterDelete = removedAtCursor
          ? tr.mapping.map(selection.from, 1)
          : null;

        const inserts = missing
          .map((item) => ({
            ...item,
            position2: tr.mapping.map(item.position2, 1),
          }))
          .sort((a, b) => b.position2 - a.position2);

        for (const item of inserts) {
          const syntaxNodes = Array.from(item.text4).map((symbol) =>
            syntaxType.create({
              syntax: item.syntax,
              side: item.side,
              symbol,
            }),
          );
          tr.insert(item.position2, Fragment.fromArray(syntaxNodes));
        }
        if (storedChanged) tr.setStoredMarks(uniqueBoundaryMarks);
        tr.setMeta(markHintKey, inserts.length > 0 ? null : suppressionAfterDelete);
        return tr.docChanged || storedChanged ? tr : null;
      },
  });
}

export const markHint = $prose((ctx) => createMarkHintPlugin(inlineSyntaxNodeSpec.type(ctx)));
