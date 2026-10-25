/**
 * 数学公式（`$x$` / `$$ … $$`）的 NodeView：**能就地改**。
 *
 * # 长相：正文里没有框，块公式编辑时是源码框加下方预览框
 *
 * 用户 2026-09-26 的原话：
 *
 * > 事实上LaTex还是有问题。应该是**行内直接渲染，而不是搞一个框框**。是
 * > **输入时仍然正常文本**，`$` 用**灰色渲染（类似 `#`）**，下方有一个
 * > **悬浮框用来实时预览**。
 *
 * 于是这一版是**两态**：
 *
 * | 态 | 正文里那一段 | 渲染出来的公式 |
 * |---|---|---|
 * | 不在编辑（光标不在它上面） | KaTeX 的排版结果，**行内直接渲染**，一根线都没有 | —— |
 * | 编辑中（整块选中／源码框拿着焦点） | **源码原文**；块公式上方是浅色源码区，下面独立一块预览区 | 块公式的 `.nota-math-preview` 在文档流里占位；行内公式仍用浮层，避免把一行正文拆开 |
 *
 * ⚠️ **源码框不是"框"**：它是一颗 `<input>` / `<textarea>`，但样式上
 * `border: none`、`background: transparent`、`font: inherit`、`padding: 0`
 * ——看上去与旁边的正文逐像素相同（`math.css` 里那几条是**给眼睛看的**那一半，
 * 这个文件负责的另一半是：宽度/高度跟着源码走，让它永远不长出滚动条）。
 * ⚠️ 上一版不是这样：那版给源码框画了边框和底色、块级还给了 `border` +
 * `background` 的卡片，用户看到的就是"一个框框"。改这一版时**先读 `math.css`
 * 的文件头**——那里面写着"哪些线是有意不加的"。
 *
 * ⚠️ 预览区 **`pointer-events: none`**（`math.css`）：它没有交互——要改就回
 * 源码框里改。块公式那块现在参与文档流，不再盖住下一段正文。
 *
 * # 为什么这个文件非得存在（用户 2026-09-26 报的 bug）
 *
 * `@milkdown/plugin-math` 只给了两个节点和两条输入规则，**一个 NodeView 都没有**
 * （`lib/index.es.js` 里那两份 `toDOM` 只画 KaTeX，没有一处能改）。于是：
 *
 * 1. 敲 `$$` + 空格 → `mathBlockInputRule` 建出一个 `attrs.value = ""`、内容也为
 *    空的 `math_block`；
 * 2. KaTeX 把空串渲染成**完全空白**（空串进 `katex.render` 出来是一棵空壳，
 *    一个墨点都没有）；
 * 3. 这个节点是 `atom`，可 ProseMirror **接受了一个落在它内容里的光标**——
 *    2026-09-26 用真依赖实测：敲完 `$$␣` 之后选区是 `TextSelection at 1`，
 *    而 `$from.parent.type.name === "math_block"`；
 * 4. 接着敲的字落进了**节点的内容**（`content="E=mc^2"`），而
 *    `attrs.value` 还是 `""`——**`toMarkdown` 读的正是 `attrs.value`**（见下表）。
 *
 * 所以症状是"输入之后直接消失"，而且**存盘时会被静默丢掉**（所见非所存）。
 * 这个文件就是补上"这个节点由我来画、由我来改"这一步。
 *
 * # ⚠️ 两处"源码在哪"不一样——这是本任务最容易做错的地方
 *
 * | 节点          | 源码在哪儿                     | 谁读它                                                       |
 * | ------------- | ------------------------------ | ------------------------------------------------------------ |
 * | `math_inline` | **节点的内容**（`textContent`） | `toMarkdown`：`addNode("inlineMath", void 0, a.textContent)`   |
 * | `math_block`  | **属性** `attrs.value`          | `toMarkdown`：`addNode("math", void 0, a.attrs.value)`         |
 *
 * `math_inline` **没有 `value` 属性**（2026-09-27 之前它连 `attrs` 都是空的；
 * 那天起多了一个 `dollars`——"用户敲了几个 `$`"，见 `math-delim.ts`，**源码仍然
 * 在内容里、不在属性里**），`math_block` 反而不看内容。写错那一边的症状不是报错，
 * 是**存盘时静默丢字**：
 * 屏幕上改得好好的，存出来还是旧的。所以写回是**两条路**（见 `写入源码`），
 * 一条都不能省，而且认哪条路要看**节点类型**、不能看"公式"这个概念。
 *
 * # 抄的哪几条判据（都不是自创）
 *
 * - **结构**抄 `diagram-view.ts`：同样是 `atom` 节点 + 自己的输入控件
 *   （那边是 `<textarea>`）+ `stopEvent`（"是不是我的挂件"那种判法）+
 *   `ignoreMutation: () => true` + **只读实例一个编辑器都不给**。
 * - **「当前」这个信号**抄 `instant-render.ts`：走 `Decoration.node` 给节点挂
 *   class，**不插 widget**（块边界上的 widget 落点不由本仓决定，那边为这个返过工）。
 * - **「只淡化、不消失」**也是那条：`$` / `$$` 用 `--fg-faint` 画（同
 *   `editor.css` 里 `.nota-srcmark` 那张配方），用户 2026-09-22 的原话是
 *   "只输入了两个 ## 则只半透明哦，不是消失"。
 * - **颜色、控件外观**全走 `styles/theme.css` 的 token，一个写死的色值都没有。
 *
 * # 「当前」靠装饰发，而且是**边沿触发**的（2026-09-26 通读过 prosemirror-view 证实）
 *
 * 链路（行号都在 `node_modules/prosemirror-view/dist/index.js`）：
 * 状态一变 → `EditorView.update` 里 `docView.matchesNode` 因为**插件装饰集变了**
 * 而为假（`DecorationSet.eq` 比的是值，不是引用）→ `updateChildren` → 装饰被压进
 * **那一层的子集合**（`buildTree`/`forChild`；行内公式那条落在段落的子集合里，
 * 块公式那条落在文档层的子集合里，两条都实测过）→ `iterDeco` 把盖住这个节点的
 * 装饰当成 `outerDeco` 交给它（叶子原子走 `active.slice()` 那条）→
 * `findNodeMatch` 因为 `sameOuterDeco` 为假而失败 → `updateNextNode` →
 * `CustomNodeViewDesc.update` → **`spec.update(node, outerDeco, innerDeco)`**。
 *
 * ⚠️ `sameOuterDeco` **只比装饰的 `type.eq`**，而 `NodeType.eq` 是
 * `compareObjs(this.attrs, other.attrs)`（**按值比**，另建一份同样的 attrs 也算相等）。
 * 结论有两面，两面都要：
 *
 * - 类名没变 → `eq` 为真 → 视图**不会**叫 `update`。所以"当前"是**边沿触发**的，
 *   不是每敲一个字都来一次；
 * - 类名变了（有 ↔ 无）→ `eq` 为假 → 叫一次 `update`。所以信号一定会到。
 *
 * 挂这个 class 的是 ProseMirror 自己（`updateOuterDeco` → `patchAttributes`，
 * 只动 `class` 的增删，本视图自己的类名不动），本文件不用手动 toggle。
 *
 * ⚠️ 即便如此，本地还是留了一份 `框里有焦点`——因为**焦点是 DOM 事件、不经过选区**：
 * 用户点到侧栏、再点回源码框这些来回，装饰那边一动不动。面板只要在用户手底下，
 * 就不许被收走（收到一半的输入框会连内容一起消失）。
 *
 * # 与 diagram-view 的**一处故意不同**：不防抖，敲一个字就写回一次
 *
 * 那边防抖 250ms 是因为 **mermaid 渲染是异步且昂贵的**（一次解析要排进串行链，
 * 见它的 `排队`）。KaTeX 是**同步**的、毫秒级，而"每敲一个字就一笔事务"正是
 * ProseMirror 本来就在做的事（在正文里打字就是每个字一笔）。不防抖换来三样：
 * 文档永远与屏幕一致（没有"最后 250ms 还没落盘"的窗口）、不用在 `destroy` 里
 * 补派定时器（那边那个补派在"整篇文档被换掉"时是会撞上
 * `Calls to EditorView.update are not allowed while an update is in progress` 的）、
 * 也没有"撤销一次只撤掉半条公式"的粒度问题——`history` 自带 `newGroupDelay`，
 * 连着敲的字本来就会被并成一步。
 *
 * # 光标不许掉进块公式的**内容**里（`归位选区`）
 *
 * 上面第 3 条那个"光标落在 atom 内容里"的状态，本文件用一条 `appendTransaction`
 * **就地改掉**：只要选区**整段**落在一个 `math_block` 的内容里，就把它改成
 * "整块选中"（`NodeSelection`）。这样做的三样好处：
 *
 * - 那个状态**根本存不下来**，于是"字被打进内容里、存盘丢掉"这条路被堵死在
 *   状态层，而不是靠"面板正好开着"这种时序巧合；
 * - 空公式块选中之后按退格**整块删掉**，正是"打错了想撤销"的手感
 *   （落在内容里的光标按退格只会把块并进上一段，更怪）；
 * - 「当前」于是只剩一条判据（"选中了这个节点"，见 `算装饰`），行内块外全一样。
 *
 * ⚠️ 只管 `math_block`，**不管 `math_inline`**：行内公式的源码就在内容里，
 * 掉进去也不会丢字（`toMarkdown` 读 `textContent`），而把它改成整块选中反而会
 * 让"接着敲一个字"变成"整条公式被替换掉"（正是 `docs/07` 第 53 项报的那个）。
 *
 * # 只读实例（分屏预览、导出）
 *
 * `create.ts` 用 `editorViewOptionsCtx` 的 `editable: () => !readOnly` 区分
 * （`src/editor/create.ts` 里那一行），所以本文件**不需要 create.ts 多传任何东西**：
 * `view.editable` 就是那个布尔。只读时：
 *
 * - **面板与悬浮预览都不往 DOM 上挂**（分隔符、输入框、尺子**建了也不挂**，
 *   于是 ProseMirror 永远收不到它们的事件），根上再挂一个 `nota-math-readonly`
 *   （同 `diagram-view.ts` 的 `.nota-diagram-readonly`）；
 * - 画的是**上游 `toDOM` 的那棵树**（`画上游`），含 `data-type` / `data-value`，
 *   与今天预览格、导出所见**逐字节相同**。
 *
 * 反过来，**可编辑**实例的树上**不许带 `data-type` / `data-value`**（同
 * `diagram-view.ts` 的规矩）：真相只有一份，不留第二个入口给 DOMObserver 读回去。
 * （`parseRule()` 那条路实测不会读 `getAttrs`，但规矩是规矩，且 CSS 也按类名找它。）
 *
 * # 代价（讲清楚，别以为白拿）
 *
 * - `selectNode` / `deselectNode` 被覆盖成"只挂高亮 class、**不挂 `draggable`**"：
 *   ProseMirror 的默认实现是 `this.nodeDOM.draggable = true`（`NodeViewDesc`
 *   1502 行：`this.contentDOM || !this.node.type.spec.draggable` 时挂），本节点
 *   没有 contentDOM、spec 也没写 `draggable`，正好命中那条，于是**在这个块里
 *   拖选文字会变成拖整块公式**（浏览器拖的是最近的 `draggable` 祖先）。
 *   代价是这个节点**不能再拖着搬家**（今天是能的），换来的是源码框里拖选不闯祸。
 *   要还回去就把那两行删掉（默认实现会把 class 与 draggable 一起管）。
 * - 空源码按退格 = **删掉整个节点**。这是为了"敲了 `$$␣` 又不想要"这一步有条退路
 *   （光标在源码框里时退格到不了 ProseMirror）；副作用是"清空源码后再按一下退格"
 *   也会把节点删掉。
 * - 公式块空着又不在编辑态时，画一张**占位说明**（不然文档里那一块是彻底空白的
 *   一片，正是用户报的"消失"）。
 */

import type { Ctx } from "@milkdown/kit/ctx";
import type { Node as PMNode } from "@milkdown/kit/prose/model";
import { DOMSerializer, Fragment } from "@milkdown/kit/prose/model";
import type { EditorState, Transaction } from "@milkdown/kit/prose/state";
import { NodeSelection, Plugin, PluginKey, TextSelection } from "@milkdown/kit/prose/state";
import type { EditorView, NodeView, NodeViewConstructor } from "@milkdown/kit/prose/view";
import { Decoration, DecorationSet } from "@milkdown/kit/prose/view";
import { $prose, $view } from "@milkdown/kit/utils";
import { katexOptionsCtx, mathBlockSchema, mathInlineSchema } from "./math-schema";
import type { KatexOptions } from "katex";

import { t } from "@/i18n";
import { renderCommonStyle } from "./katex-runtime";
import { createCommandTable, type ReceiveBelow } from "./math-commands";
import { createCreateProposalBox, useOptionDrawPreview } from "./math-suggest";

/** 行内公式的节点名（与 plugin 里 `const c = "math_inline"` 一致）。 */
const inlineName = "math_inline";

/** 块公式的节点名（与 plugin 里 `const p = "math_block"` 一致）。 */
const blockName = "math_block";

/**
 * 「当前」这个 class。装饰把它挂到节点上（由 ProseMirror 自己 patch），
 * CSS 按它决定面板显不显示。样式只此一处：`src/styles/math.css`。
 */
const currentClass = "nota-math-current";

/**
 * 装饰 `spec` 上的标记。
 *
 * ⚠️ 认"这条装饰是不是我的"用它，**不认 class 字面量**：class 是给 CSS 看的，
 * 会随设计改；而 `outerDeco` 里还会混着别的插件给这个节点的装饰
 * （`instant-render` 给块挂的那条就长得很像），按字符串比会认错人。
 */
const currentMark = "数学当前";

/** 面板的 class。`是我的挂件` 按它判"这个事件归不归我"。 */
const panelClass = "nota-math-panel";

/** 输入控件的 class（`<input>` 或 `<textarea>`，行内与块只差这一个）。 */
const sourceClass = "nota-math-source";

/** 分隔符的 class。 */
const separatorClass = "nota-math-delim";

/** 渲染出来的公式那棵树的 class。 */
const renderClass = "nota-math-render";

/** 只读实例里那棵"上游树"的标记（仅供 CSS 与调试辨认）。 */
const upstreamClass = "nota-math-upstream";

/** 空源码占位卡的 class。 */
const occupyPositionClass = "nota-math-note";

/**
 * 悬浮预览框的 class（编辑时挂在下面那一格）。
 *
 * ⚠️ 它和 `渲染类` 那棵**是两棵独立的 KaTeX 树**：一边编辑一边重画同一棵树
 * 会让"正文里那棵"和"预览里那棵"互相牵扯（`katex.render` 是**直接改**元素，
 * 不返回字符串）。KaTeX 是同步的、毫秒级，一个键敲两棵树不心疼。
 */
const previewClass = "nota-math-preview";

/** 块公式源码区右上角的类型标签。行内公式不画。 */
const numberLearnLabelClass = "nota-math-kind";

/**
 * 量文字宽度用的隐藏尺子（行内公式的输入框宽度跟它走）。
 *
 * ⚠️ 为什么不能用 `ch`：那是"0"的宽度，而源码框现在用的是**正文字体**
 * （比例字体），一个 `\frac` 和一个"中文"占的宽度差得远，按字符数估出来的
 * 宽度不是偏宽就是偏窄，而偏窄会出现横向滚动条——那正是"看着像个框"。
 */
const rulerClass = "nota-math-ruler";

/* ── 一、纯函数：认节点、取源码、写回 ────────────────────────────────────
   这几条是**这个 bug 的全部**（源码在哪、写回哪去），所以它们不碰 DOM、
   不碰 view，能被 `tests/math-view.test.ts` 直接喂真节点验证。 */

/** 公式的种类。认不出来返回 `null`（别的节点类型走到这里就当没看见）。 */
export function recognizeNode(node: PMNode): "inline" | "block" | null {
  if (node.type.name === inlineName) return "inline";
  if (node.type.name === blockName) return "block";
  return null;
}

/**
 * 取节点里的源码。
 *
 * ⚠️ **行内与块不是一处**——这是本任务最容易做错的地方：
 * 行内在 `node.textContent`（`toMarkdown` 读 `a.textContent`），
 * 块在 `attrs.value`（`toMarkdown` 读 `a.attrs.value`）。
 */
export function readSource(node: PMNode): string {
  if (node.type.name === blockName) {
    const value2: unknown = node.attrs.value;
    return typeof value2 === "string" ? value2 : "";
  }
  return node.textContent;
}

/**
 * 把一份源码写进节点。**改的是传进来的那笔事务**，返回它有没有动过手。
 *
 * ⚠️ 两条路（见文件头那张表），认的是**节点类型**：
 *
 * - 行内：`replaceWith(内容起点, 内容终点, 文本)`。`位置 + 1` 是节点内容的起点、
 *   `位置 + node.nodeSize - 1` 是终点（首尾那两个位置是节点自己的开闭 token）。
 * - 块：`setNodeMarkup(位置, undefined, {...attrs, value})`。属性要**整个展开**，
 *   不然别的属性会被抹掉（今天只有 `value`，将来不一定）。
 *
 * ⚠️ 行内的空串要取 `Fragment.empty` 当内容：`replaceWith` 收的就是"片段/节点"，
 * 而 `schema.text("")` 会直接抛（ProseMirror 不接受空文本节点）。
 */
export function writeEnterSource(tr: Transaction, position2: number, node: PMNode, source2: string): boolean {
  if (readSource(node) === source2) return false;

  if (node.type.name === blockName) {
    tr.setNodeMarkup(position2, undefined, { ...node.attrs, value: source2 });
    return true;
  }

  const fragment = source2 === "" ? Fragment.empty : tr.doc.type.schema.text(source2);
  tr.replaceWith(position2 + 1, position2 + node.nodeSize - 1, fragment);
  return true;
}

/* ── 二、「当前」这件事：装饰 + 归位 ───────────────────────────────────── */

/** 造一条"当前"装饰。 */
function createCurrentDecoration(position2: number, rulerInch: number): Decoration {
  return Decoration.node(position2, position2 + rulerInch, { class: currentClass }, { [currentMark]: true });
}

/**
 * 按当前选区算出装饰集。**这是「当前」唯一的判据**——发了是它、收也是它
 * （消费端是 `读装饰`，按 `当前标记` 认）。
 *
 * ⚠️ 判据只有一条：**整块选中**（`NodeSelection`，且整块正好是这一个公式）。
 * 没有第二条："光标在块的内容里也算"那条被 `归位选区` 堵掉了（见文件头）。
 *
 * ⚠️ 故意**不认**"光标紧挨着公式"：`$x^2$` 一打完光标就在它后面，那时弹出源码框
 * 会让人以为公式坏了；方向键在段落里来回走也会把面板开关个不停。
 *
 * ⚠️ 每次 state 变化都重算，**不做缓存**（同 `instant-render.ts` 的理由：
 * 缓存要自己判断"这次变化影响不影响结果"，判错就是面板不跟着选区走，
 * 而那正是这个插件唯一要做对的事）。代价是 O(1)：只看选区，不扫文档。
 */
export function computeDecorations(state: EditorState): DecorationSet {
  const select = state.selection;
  if (!(select instanceof NodeSelection)) return DecorationSet.empty;
  if (recognizeNode(select.node) === null) return DecorationSet.empty;
  return DecorationSet.create(state.doc, [createCurrentDecoration(select.from, select.node.nodeSize)]);
}

/**
 * 把"光标掉进块公式内容里"这个状态改掉（见文件头那一段）。
 *
 * ⚠️ 只在**整段选区都落在同一个块内容里**时才动：跨到块外面的选区不动
 * （那可能是用户在框选一段文字，不该被本插件搅和）。
 * ⚠️ 改完之后的选区是 `NodeSelection`，本函数下次就不匹配了，不会来回改
 * （而且 ProseMirror 只在插件返回了非空事务时才再跑一轮 `appendTransaction`）。
 */
export function returnPositionSelection(state: EditorState): Transaction | null {
  const select = state.selection;
  if (select instanceof NodeSelection) return null;

  const fromValue = select.$from;
  for (let d = fromValue.depth; d > 0; d--) {
    const node = fromValue.node(d);
    if (node.type.name !== blockName) continue;

    const position2 = fromValue.before(d);
    if (select.from <= position2 || select.to >= position2 + node.nodeSize) return null;
    return state.tr.setSelection(NodeSelection.create(state.doc, position2));
  }
  return null;
}

/**
 * 「当前」插件：一边发装饰（给 NodeView 与 CSS 看），一边把掉进块内容的选区归位。
 *
 * 两条都放在同一个插件里，是因为它们**必须是同一份判据的两个使用者**：
 * 归位把选区变成"整块选中"，装饰就按"整块选中"发信号；分成两个插件的话，
 * 两边各写一遍判断，早晚会岔开。
 */
export const commonStyleCurrent = $prose(
  () =>
    new Plugin({
      key: new PluginKey("nota-math-current"),
      props: {
        decorations: (state) => computeDecorations(state),
      },
      appendTransaction: (_Transactions, _OldValueState, newValueState) => returnPositionSelection(newValueState),
    }),
);

/* ── 三、NodeView ─────────────────────────────────────────────────────── */

/** 从异常里抠一句人能读的话。`katex` 的解析错是 `ParseError`，但别赌它。 */
function raiseGetClearMessage(e: unknown): string {
  if (e instanceof Error && e.message) return e.message;
  if (typeof e === "string") return e;
  return String(e);
}

/**
 * 只读实例里那棵树：**上游 `toDOM` 画什么就是什么**。
 *
 * ⚠️ 走 `DOMSerializer.renderSpec` 而不是直接拿 `toDOM` 的返回值，是照
 * ProseMirror 自己的做法（没有自定义视图时 `NodeViewDesc` 就是这么画的）：
 * `toDOM` 允许返回"元素"或"描述数组"两种形状，这一步两种都吃。
 * 结果与今天预览格里的**逐字节相同**（含 `data-type` / `data-value`，
 * 而且上游 `toDOM` 自己会按同一份 `katexOptions` 调一次 `katex.render`）。
 */
function drawUpstream(node: PMNode): HTMLElement {
  try {
    const traceDescribe = node.type.spec.toDOM?.(node);
    if (traceDescribe) {
      const { dom } = DOMSerializer.renderSpec(document, traceDescribe);
      dom.classList.add(upstreamClass);
      return dom;
    }
  } catch {
    // 上游的画法炸了就退回一句原文：宁可难看，也别在预览格里留一块空白。
  }
  const fallback = document.createElement(node.isInline ? "span" : "div");
  fallback.className = upstreamClass;
  fallback.textContent = readSource(node);
  return fallback;
}

const drawEnterRepresentNumber = new WeakMap<HTMLElement, number>();

/**
 * 建一个公式的 NodeView。行内与块共用这一份，只差输入控件和写回路径。
 *
 * ⚠️ 选项（KaTeX 的宏表）在**建视图时**读一次：`create.ts` 的 `.config()` 里
 * `ctx.set(katexOptionsCtx.key, katexOptionsFor(physics))` 早就设好了，
 * 而 `$view` 的外层工厂是在 `SchemaReady` 之后才跑的。读不到就退回空选项——
 * 那会让 physics 那套宏失效（KaTeX 会把不认识的宏原样画出来/标红），
 * 但**不会**让编辑器整个建不起来；两害相权，这个更轻。
 */
function createCommonStyleView(kindClass: "inline" | "block", option: KatexOptions): NodeViewConstructor {
  const inline = kindClass === "inline";
  const separatorText = inline ? "$" : "$$";

  // ⚠️ 命令候选表**在这里建一次**（工厂那一层），不是每个 NodeView 建一次：
  //    宏表（`选项.macros`）在编辑器装配时就定了，`enable_physics` 一开一关
  //    要重启才生效（`math-macros.ts`），所以同一份表在整场会话里都成立。
  //    判据就用"宏表空不空"——physics 那九十来条是**唯一**往 `macros` 里塞东西的
  //    地方（`katexOptionsFor`），空表就意味着没开。
  const table2 = createCommandTable(Object.keys(option.macros ?? {}).length > 0);

  return (
    initialStart: PMNode,
    view: EditorView,
    getPos: () => number | undefined,
    decorations: readonly Decoration[],
  ): NodeView => {
    // ── 骨架 ──────────────────────────────────────────────────────────
    // 块：                                  行内：
    //   <div .nota-math .nota-math-block>     <span .nota-math .nota-math-inline>
    //     <div .nota-math-render>…katex…</div>  <span .nota-math-render>…</span>
    //     <div .nota-math-panel>                <span .nota-math-panel>
    //       <span .nota-math-delim>$$</span>      <span .nota-math-delim>$</span>
    //       <textarea .nota-math-source>          <input .nota-math-source>
    //       <span .nota-math-delim>$$</span>      <span .nota-math-delim>$</span>
    //       <span .nota-math-ruler>（隐藏）</span> <span .nota-math-ruler>（隐藏）</span>
    //       <… .nota-math-suggest>（命令补全，绝对定位，闲着时 hidden）
    //     </div>                                  </span>
    //     <div .nota-math-preview>…katex…</div>   <span .nota-math-preview>…</span>
    //   </div>                                </span>
    //
    // ⚠️ **两态**（不在编辑 / 编辑中）谁显谁隐由 `math.css` 按根上那个
    //    `nota-math-editing` 类决定，`重画` 只负责往两棵树里画对内容。
    // ⚠️ 行内那棵整体必须是**行内元素**：它待在段落里，`div` 会把段落劈成两半。
    //    所以行内用 `span`、块用 `div`，面板、渲染区、悬浮预览同理。
    // ⚠️ **一个 `data-type` / `data-value` 都不给可编辑实例的树**（只读那棵给，
    //    因为那棵要的就是"与上游相同"，见 `画上游`）。
    const dom = document.createElement(inline ? "span" : "div");
    dom.className = `nota-math nota-math-${inline ? "inline" : "block"}`;
    if (!inline) dom.classList.add("md-math-block");
    dom.classList.toggle("nota-math-readonly", !view.editable);

    const render = document.createElement(inline ? "span" : "div");
    render.className = renderClass;

    /** 预览那一格。块公式在文档流中占位；行内公式仍是浮层。 */
    const preview = document.createElement(inline ? "span" : "div");
    preview.className = previewClass;
    // 给浏览器看的：这几颗元素不是正文。ProseMirror 那边另有 `stopEvent`。
    preview.contentEditable = "false";

    const panel = document.createElement(inline ? "span" : "div");
    panel.className = panelClass;
    panel.contentEditable = "false";

    const numberLearnLabel = document.createElement("button");
    numberLearnLabel.type = "button";
    numberLearnLabel.className = numberLearnLabelClass;
    numberLearnLabel.textContent = t("Formula");
    numberLearnLabel.title = t("Finish editing");
    numberLearnLabel.setAttribute("aria-label", t("Finish editing"));

    const createSeparator = (): HTMLElement => {
      const el = document.createElement("span");
      el.className = separatorClass;
      el.textContent = separatorText;
      // 是给眼睛看的方位指示、不是内容：读屏器不必念它。
      el.setAttribute("aria-hidden", "true");
      return el;
    };

    const input: HTMLInputElement | HTMLTextAreaElement = inline
      ? document.createElement("input")
      : document.createElement("textarea");
    input.className = sourceClass;
    input.spellcheck = false;
    input.setAttribute("aria-label", t("Math Source (LaTeX)"));
    input.placeholder = inline ? t("e.g. E=mc^2") : t("e.g. \\frac{a}{b}");
    if (inline) (input as HTMLInputElement).type = "text";
    else (input as HTMLTextAreaElement).rows = 1;

    const ruler = document.createElement("span");
    ruler.className = rulerClass;
    ruler.setAttribute("aria-hidden", "true");

    // ── 命令补全弹窗 ──────────────────────────────────────────────────
    /**
     * 把一条补全结果落到源码框里。
     *
     * ⚠️ **两条路共用这一处**：鼠标点一条（弹窗的 `收下后` 回调）与键盘收下
     * （下面 keydown 里那个 `果.收下`）。两处各写一遍的话，改其中一条时另一条
     * 会悄悄留下旧行为。
     * ⚠️ 写回文档的唯一口子是 `派发`（它维护 `最后派发` 那条"是不是我派的"）。
     *    弹窗只给"源码框该换成什么"，一个字都不碰文档。
     */
    function shouldUseCreateProposal(result3: ReceiveBelow): void {
      input.value = result3.source3;
      input.setSelectionRange(result3.cursor, result3.cursor);
      followSourceChangeRulerInch();
      dispatch(result3.source3);
    }

    // ⚠️ **挂在面板里**（不是 `document.body`，像 `lang-picker.ts` 那样）：
    //    理由、白拿的三样、代价那一处，都写在 `math-suggest.ts` 的文件头。
    const createProposal = createCreateProposalBox({
      table2,
      inline,
      // 预览用**同一份** KaTeX 选项：宏表跟着 `enable_physics` 走，弹窗里
      // 画出来的 `\vb` 与正文里画出来的得是同一个东西。
      drawPreview: useOptionDrawPreview(option),
      receiveBelowAfter: shouldUseCreateProposal,
      reportActivity: (id) => {
        // 焦点始终在源码框里，所以 `aria-activedescendant` 得写在**它**上面
        // （弹窗那一层碰不到这个元素，只能把 id 报回来）。
        if (id) input.setAttribute("aria-activedescendant", id);
        else input.removeAttribute("aria-activedescendant");
      },
    });

    panel.append(createSeparator(), input, createSeparator(), ruler, createProposal.element);
    if (!inline) panel.append(numberLearnLabel);

    dom.append(render);
    // ⚠️ 只读实例**不挂面板、也不挂悬浮预览**（连挂件都不给它）。元素照样
    //    建出来只是为了少写一堆 `null` 判断：没挂进文档的元素收不到任何事件，
    //    `面板.contains()` 也永远为假，而下面的 `面板该开()` 又硬性要求
    //    `view.editable`。
    if (view.editable) dom.append(panel, preview);

    // ── 这个视图的状态（都不进文档）──────────────────────────────────
    /** 当前服务的节点。**必须是活的**（拿住旧节点是这类视图的经典坑）。 */
    let current = initialStart;
    /** 最近一次**由本视图**写进文档的源码：用来分清"这变化是我派的还是外面改的"。 */
    let mostAfterDispatch = readSource(initialStart);
    /** 装饰说"当前"。⚠️ 只给下面那条"是不是刚变当前"的边沿判断用。 */
    let decorationCurrent = readDecoration(decorations);
    /** 输入框是不是拿着焦点。第二道保险，理由见文件头。 */
    let boxInsideHasFocusPoint = false;

    // ── 画 ────────────────────────────────────────────────────────────

    /**
     * 面板该不该开。⚠️ 只读实例永远是"不开"。
     *
     * 两条判据缺一不可：装饰（选区）说当前 → 用户点了公式；焦点在框里 →
     * 用户正在框里写字，这期间**不许**因为选区动了（比如点了别处又点回来）
     * 把框收走。
     */
    function panelShouldOpen(): boolean {
      return view.editable && (decorationCurrent || boxInsideHasFocusPoint);
    }

    /** 空源码时那张占位卡：文档里那一块不能是彻底空白的一片。 */
    function createOccupyPosition(): HTMLElement {
      const card = document.createElement(inline ? "span" : "div");
      card.className = occupyPositionClass;
      card.textContent = inline ? t("Empty inline math") : t("Empty math block — click to write LaTeX");
      return card;
    }

    /**
     * 往某一格（正文那格 `渲染` / 悬浮那格 `预览`）里画一次 KaTeX。
     *
     * ⚠️ `data-state` 的值是**英文**（CSS 要按它选），卡里的字才是中文——
     * 这条分界与全仓一致（同 `diagram-view.ts`）。
     */
    function drawEnter(target: HTMLElement, source2: string): void {
      const representNumber = (drawEnterRepresentNumber.get(target) ?? 0) + 1;
      drawEnterRepresentNumber.set(target, representNumber);
      target.dataset.state = "loading";
      void renderCommonStyle(source2, target, option)
        .then(() => {
          if (drawEnterRepresentNumber.get(target) === representNumber) target.dataset.state = "ok";
        })
        .catch((e: unknown) => {
          if (drawEnterRepresentNumber.get(target) !== representNumber) return;
          target.dataset.state = "error";
          target.textContent = raiseGetClearMessage(e);
        });
    }

    /**
     * 按节点当前的样子重画这两格。**只碰 `渲染` 与 `预览`**，输入框一个字节都不动。
     *
     * ⚠️ 编辑态与非编辑态**画的地方不一样**（见文件头那张表）：编辑时正文里
     * 显示的是源码本身（面板那三件），所以正文那格必须**空着**——两边都画的话
     * 就成了"源码和公式一起显示"，那正是用户否掉的"搞一个框框"（行内公式
     * 夹在文字里，凭空多出一截，后面的字全得重排）。渲染结果那时只在悬浮框里。
     *
     * ⚠️ 每次重画**两格都要清**：`替换` 只清当前这条分支管的那一格，另一格里
     * 还留着上一次的 KaTeX 树（`katex.render` 是追加式的，不清就会越叠越多）。
     */
    function heavyDraw(): void {
      render.replaceChildren();
      preview.replaceChildren();
      // `data-state` 是给 CSS 看的，每轮跟着重定，不然会留下上一轮的值。
      render.dataset.state = "";
      preview.dataset.state = "";

      if (!view.editable) {
        const upstream = drawUpstream(current);
        render.append(upstream);
        drawEnter(upstream, readSource(current));
        return;
      }

      const source2 = readSource(current);
      const emptyValue = source2.trim() === "";

      if (panelShouldOpen()) {
        // 编辑态：正文那一格空着（源码由面板顶上来），渲染结果去悬浮预览。
        // ⚠️ 空源码时摆**占位卡**而不是什么都不画：那一格是用户唯一的反馈
        //    （`$$␣` 敲下去之后正文里那两个 `$$` 之间是空的，不必再添乱）。
        if (emptyValue) {
          preview.dataset.state = "empty";
          preview.append(createOccupyPosition());
        } else {
          drawEnter(preview, source2);
        }
        return;
      }

      if (emptyValue) {
        render.dataset.state = "empty";
        render.append(createOccupyPosition());
        return;
      }

      drawEnter(render, source2);
    }

    /**
     * 行内：输入框宽度跟着源码走；块：高度跟着源码走。
     *
     * 两样都是**为了"看着不像个框"**：宽度不跟，长公式会在框里横向滚；高度不跟，
     * 多行推导会竖着滚。滚动条就是"这是个控件"最明显的信号，而这一版要的正是
     * "它就是正文"。
     *
     * ⚠️ 宽度用隐藏的**尺子**（`尺`）量，不用 `ch`：源码框现在用的是正文字体
     *   （比例字体），`\frac{a}{b}` 和 `中文` 的"字符数"一样但宽度差一倍。
     * ⚠️ 空源码时量 `placeholder`：不量的话框会缩成 0 宽，用户连点都点不到。
     */
    function followSourceChangeRulerInch(): void {
      if (inline) {
        ruler.textContent = input.value || input.placeholder || "";
        input.style.width = `${ruler.getBoundingClientRect().width + 1}px`;
        return;
      }
      // 块：`<textarea>` 自己不会长个。先归零再读 `scrollHeight`——不归零的话
      // 上一轮设的高度就是这一轮的下限，删字时高度不会收回去。
      const box2 = input as HTMLTextAreaElement;
      box2.style.height = "0px";
      const height = box2.scrollHeight;
      // ⚠️ 假 DOM（`tests/fake-dom.ts`）量出来是 0，那时不写高度——
      //    写一个 `NaNpx` / `0px` 进去只会把测试里的断言弄得没法读。
      if (typeof height === "number" && Number.isFinite(height) && height > 0) box2.style.height = `${height}px`;
    }

    // ── 开合 ──────────────────────────────────────────────────────────

    /**
     * 把光标排进源码框。
     *
     * ⚠️ 必须**排到本次更新之后**（微任务）：`spec.update` 是在
     * `EditorView.update` 的中间跑的，那之后 ProseMirror 还要走一遍选区同步
     * （`selectionToDOM`），同步 `focus()` 会被那一下顶掉。
     * ⚠️ 建视图那一帧更极端：视图描述还没建好、DOM 也还没插进文档
     * （`createViewDesc` 是先调工厂、后 `renderDescs`），所以这里要再判一次
     * `isConnected`。
     */
    function arrangeClusterFocus(): void {
      const clusterFocus = () => {
        if (!panelShouldOpen()) return;
        if (!input.isConnected) return;
        // ProseMirror 在本次更新末尾还会同步一次 DOM 选区；若它刚刚把焦点
        // 抢回正文，第二次聚焦会把焦点稳定地交给源码框。已经在框里时不重置
        // 选区，避免用户第一帧就输入后光标被拽回末尾。
        if (document.activeElement === input) return;
        input.focus();
        // 光标放到**末尾**：点一下公式通常是要接着写，放开头会让下一个字插在最前面。
        const length = input.value.length;
        input.setSelectionRange(length, length);
      };
      queueMicrotask(clusterFocus);
      globalThis.requestAnimationFrame?.(clusterFocus);
    }

    /**
     * 让面板的开合跟上状态。`要到焦点` 只在"**刚**变成当前"那一帧给真。
     *
     * ⚠️ `view.hasFocus()` 是"焦点就在 `view.dom` 上"（`activeElement === view.dom`），
     * 源码框拿着焦点时它是**假**——这正好：那时不用再抢一次焦点，也不会把焦点
     * 从别处抢回来。点一下公式这条路上它是**真**（点 contenteditable 会先聚焦
     * 正文，`handleSingleClick` 才建 `NodeSelection`），于是接着敲的字落进源码框，
     * 而不是像上游那样把整块公式替换掉。
     */
    function sameStepPanel(wantToFocusPoint: boolean): void {
      const open2 = panelShouldOpen();
      dom.classList.toggle("nota-math-editing", open2);
      if (open2) {
        followSourceChangeRulerInch();
        if (wantToFocusPoint && view.hasFocus()) arrangeClusterFocus();
      } else {
        // ⚠️ 面板一收，弹窗必须跟着收：它俩是**一棵树**，留着一个没有框的
        //    候选列表，下一次开面板会看到上次那几条还挂在那儿。
        createProposal.close4();
        if (input.value !== readSource(current)) {
          // 收起来时把框里的内容对齐文档（正常路径下两者本就一样，这条是兜底）。
          input.value = readSource(current);
        }
      }
      heavyDraw();
    }

    // ── 写回 ──────────────────────────────────────────────────────────

    /** 把源码框里的内容写回节点。⚠️ 走 `写入源码`，两条路都在那边。 */
    function dispatch(newValueSource: string): void {
      const position2 = getPos();
      if (typeof position2 !== "number") return;

      const node = view.state.doc.nodeAt(position2);
      if (!node || recognizeNode(node) !== kindClass) return;

      // ⚠️ 先记下来再派：事务回来时 `update` 要靠它分清"这次是我派的"
      //    （是的话就不能把源码框里的内容再写一遍——每敲一个字把光标拽回开头，
      //     那个框就没法用了，同 `diagram-view.ts` 那条）。
      mostAfterDispatch = newValueSource;

      const tr = view.state.tr;
      if (!writeEnterSource(tr, position2, node, newValueSource)) return;
      view.dispatch(tr);
    }

    /** 退出编辑：把光标搬到节点**后面**，面板随之收起来。 */
    function backOutputEditEdit(): void {
      const position2 = getPos();
      if (typeof position2 !== "number") return;
      const node = view.state.doc.nodeAt(position2);
      if (!node) return;

      // ⚠️ 顺序：先搬选区（装饰随之灭掉），再 focus 回正文。
      //    反过来的话面板会因为"装饰还说当前"而留在屏幕上。
      //
      // ⚠️ "后面"得落到**下一个文本块里**（`TextSelection.near` 干的正是"找最近
      //    一个能放光标的地方"）：直接给一个"两块之间"的位置，它的 parent 是文档、
      //    没有行内内容，浏览器把光标放在哪儿是不定的（prosemirror-state 自己都会
      //    为这种选区 warn 一句）。
      // ⚠️ 文档末尾那一块公式后面**没有**这样的位置，`near` 会退回"选中它自己"
      //    （等于 Escape 白按），所以那时用落在文档末尾的文本光标。
      const to2 = position2 + node.nodeSize;
      const findOf = TextSelection.near(view.state.doc.resolve(to2), 1);
      view.dispatch(
        view.state.tr.setSelection(findOf instanceof TextSelection ? findOf : TextSelection.create(view.state.doc, to2)),
      );
      view.focus();
    }

    /** 整块删掉（源码空着时按退格用）。 */
    function removeRemoveSelfSelf(): void {
      const position2 = getPos();
      if (typeof position2 !== "number") return;
      const node = view.state.doc.nodeAt(position2);
      if (!node) return;

      const tr = view.state.tr.delete(position2, position2 + node.nodeSize);
      // ⚠️ 光标退回**前**一处：用户是在"退格"，视觉上就不该往前跳。
      tr.setSelection(TextSelection.near(tr.doc.resolve(position2), -1));
      view.dispatch(tr);
      view.focus();
    }

    // ── 事件 ──────────────────────────────────────────────────────────

    input.addEventListener("input", () => {
      followSourceChangeRulerInch();
      // ⚠️ 光标位置要**在派发之前**读：`派发` 会同步跑一趟 `update`，
      //    眼下那条路不会碰 `输入.value`，但把"读光标"压在它前面就不必
      //    依赖那个前提（`?? 长度` 兜的是"框还没量过选区"那一帧）。
      const cursor = input.selectionStart ?? input.value.length;
      dispatch(input.value);
      // 补全跟着**正文**走：敲 `\` 弹、接着敲字母一条条筛、删到空就收。
      createProposal.feed(input.value, cursor);
    });

    input.addEventListener("focus", () => {
      boxInsideHasFocusPoint = true;
      sameStepPanel(false);
    });

    input.addEventListener("blur", () => {
      boxInsideHasFocusPoint = false;
      // ⚠️ 先收弹窗再收面板：`同步面板` 里那条"关了就对齐内容"不该被
      //    一个还开着的列表挡着（视觉上就是"框没了、候选还挂在半空"）。
      createProposal.close4();
      sameStepPanel(false);
    });

    // ⚠️ 收件人写成 `HTMLElement` 是为了让 `keydown` 那颗 `e` 有 `KeyboardEvent`
    //    类型：`输入` 是 `HTMLInputElement | HTMLTextAreaElement` 的联合，
    //    联合上按 `addEventListener` 的重载会退化成 `Event`，`e.key` 就没法读。
    (input as HTMLElement).addEventListener("keydown", (e) => {
      // ⚠️ **弹窗优先于下面每一条**。开着的时候：`Escape` 是"收候选"而不是
      //    "退出编辑"、`Enter` 是"收下这条命令"而不是（行内的）"退出编辑"。
      //    顺序反过来的话这两个键全走偏——用户按 Enter 想补全，面板却关了。
      // ⚠️ `按键` 自己不碰事件（它只认键名），`preventDefault` 归这里；
      //    收下的那一条由 `收下后` 那一路落进源码框（见 `应用建议`）。
      const result3 = createProposal.keypress(e.key);
      if (result3.consume) {
        e.preventDefault();
        return;
      }

      if (e.key === "Escape") {
        e.preventDefault();
        backOutputEditEdit();
        return;
      }
      // 行内公式没有"多行"这回事：Enter 当"确认"（同 `diagram-view.ts` 那条）。
      if (inline && e.key === "Enter") {
        e.preventDefault();
        backOutputEditEdit();
        return;
      }
      // ⚠️ 块公式的 Enter **不拦**：`$$ … $$` 里的换行是常态（多行推导）。
      // 空源码里按退格 = 删掉这一块：`$$␣` 敲错之后总要有一条退路，
      // 而光标在这个框里时退格到不了 ProseMirror（`stopEvent` 拦着）。
      if (e.key === "Backspace" && input.value === "") {
        e.preventDefault();
        removeRemoveSelfSelf();
      }
    });

    // 点分隔符也当"点源码框"：那两个 `$` 是唯一"看着能点、其实是挂件"的地方
    //（CSS 给了它们 `pointer-events: none`，所以事件目标是面板自己）。
    panel.addEventListener("mousedown", (e) => {
      if (e.target === input) return;
      if (numberLearnLabel.contains(e.target as Node | null)) return;
      // ⚠️ 必须 preventDefault：不拦的话浏览器会把焦点交给正文，
      //    面板下一帧就收走了（用户会觉得"点一下框就没了"）。
      e.preventDefault();
      input.focus();
    });

    numberLearnLabel.addEventListener("mousedown", (e) => e.preventDefault());
    numberLearnLabel.addEventListener("click", (e) => {
      e.preventDefault();
      e.stopPropagation();
      backOutputEditEdit();
    });

    // ⚠️ **渲染区不在面板里**（见上面那棵树），所以它得有自己的那一条
    //    （2026-09-26 无头窗口实测，`docs/07` §2 BUG-37）。
    //
    // 症状：编辑态下**再点一下自己那块渲染区**（用户改到一半想点回去确认一下），
    // 浏览器的默认聚焦会把焦点从源码框挪到正文，而**选区还停在 `NodeSelection`
    // （整块）上**——于是接着敲的第一个字**把整块公式替换掉**，整块没了。
    // 实测那条夹具（`$$ / E=mc^27 / $$`）敲一个 `9`：文档从 48 字符掉到 36，
    // 公式块消失、原地剩一个 `9`。
    //
    // ⚠️ `stopEvent`（下面 `是我的挂件` 那条）**管不到这里**：它只决定
    // ProseMirror 处不处理这个事件，管不住**浏览器自己的焦点行为**。
    // 所以要在 mousedown 上 `preventDefault` 并显式把焦点收回源码框。
    //
    // ⚠️ **非编辑态一定要放行**：那一下该由 ProseMirror 接手（把这个原子节点
    // 整块选中），而那正是"当前"的信号（同 `diagram-view.ts` 的判据——那边
    // 反过来，预览区**永远**不算挂件，点图就是选块，因为图表的源码框常驻、
    // 没有"编辑态"这回事）。
    render.addEventListener("mousedown", (e) => {
      if (!decorationCurrent) return;
      e.preventDefault();
      input.focus();
    });

    // 块公式的预览区现在参与文档流；点它等价于回到上方源码框，不能把焦点
    // 丢给正文后让下一颗字替换整块公式。
    preview.addEventListener("mousedown", (e) => {
      if (inline || !panelShouldOpen()) return;
      e.preventDefault();
      input.focus();
    });

    // ── 与 ProseMirror 的边界 ─────────────────────────────────────────

    /**
     * 判据是「这颗元素是不是我的挂件」。
     *
     * ⚠️ 面板之外**还多一条**：这块公式**已经是当前**时，点在渲染出来的公式上
     * 也算我的。不拦的话浏览器会把焦点从源码框挪到正文，用户接着敲的字就变成
     * "替换掉整块公式"（`NodeSelection` 上打字就是这个后果，也是 `docs/07` 第 53
     * 项报的那个）。还不是当前时返回假，让 ProseMirror 去点——它会把这个原子
     * 节点整块选中，那正是"当前"的信号（同 `diagram-view.ts` 那条）。
     */
    const isSelfOfAttachItem = (target: EventTarget | null): boolean => {
      if (!(target instanceof Node)) return false;
      if (panel.contains(target)) return true;
      if (!inline && panelShouldOpen() && preview.contains(target)) return true;
      return decorationCurrent && render.contains(target);
    };

    // ── 起手 ──────────────────────────────────────────────────────────

    input.value = readSource(initialStart);
    // 建视图那一帧就"刚变当前"（敲 `$$␣` 那条路正是如此）→ 该排一次聚焦。
    sameStepPanel(decorationCurrent);

    return {
      dom,

      update: (afterUpdate, newDecorations) => {
        const newValueSource = readSource(afterUpdate);
        // ⚠️ 这条判据是"**外面**改的"：撤销、源码模式里手改文档、插件改文档、
        //    整篇被换掉……都会走到这儿。只认这一类，因为本视图自己派的那次
        //    不能再写回源码框（每敲一个字把光标拽回开头，那个框没法用）。
        const externalSurfaceChangeOf = newValueSource !== mostAfterDispatch;
        current = afterUpdate;

        if (externalSurfaceChangeOf) {
          mostAfterDispatch = newValueSource;
          if (input.value !== newValueSource) input.value = newValueSource;
        }

        const newValueDecorationCurrent = readDecoration(newDecorations);
        const justChangeCurrent = newValueDecorationCurrent && !decorationCurrent;
        decorationCurrent = newValueDecorationCurrent;

        sameStepPanel(justChangeCurrent);
        return true;
      },

      // 这一条和底下那条是**两件事**（同 `code-block.ts`）：`stopEvent` 管一进来
      // 就拦下（点、按键、滚轮）；`ignoreMutation` 管已经发生的 DOM 变更要不要
      // 告诉 ProseMirror。少了后者，"KaTeX 重画了一遍"会被当成"用户在编辑区里
      // 改了东西"，PM 接着去重解析这段 DOM——而它认得的 `data-type` 一个都没有，
      // 结果是节点被判成脏的、光标乱飞。
      stopEvent: (e) => isSelfOfAttachItem(e.target),

      ignoreMutation: () => true,

      // ⚠️ 覆盖这两个钩子**只为一件事**：不挂 `draggable`（理由与代价见文件头
      //    的「代价」那一段）。ProseMirror 的默认实现是"加高亮 class" + 在
      //    `this.contentDOM || !this.node.type.spec.draggable` 时给根挂上
      //    `draggable="true"`，本节点两个条件都占，所以默认会挂。
      selectNode: () => dom.classList.add("ProseMirror-selectednode"),
      deselectNode: () => dom.classList.remove("ProseMirror-selectednode"),

      destroy: () => {
        // 本文件没有定时器、没有全局监听器（不像 `diagram-view.ts` 那个
        // MutationObserver），所以这里没有要撤的东西。⚠️ 也**不能**在这儿补派
        // 事务：`destroy` 常常是在 `EditorView.update` 的中间被调的
        // （`updateChildren` → `destroyBetween`），那时派事务会抛
        // `Calls to EditorView.update are not allowed while an update is in progress`。
        // 不防抖（见文件头）正是为了不必在这里补救。
        boxInsideHasFocusPoint = false;
        // 弹窗里没有定时器、也没有全局监听器（它只听自己那几行元素的
        // mousedown，树一散就跟着没了），所以这里只把内容清掉——
        // 免得一个正要被丢掉的行元素上还挂着闭包。
        createProposal.close4();
      },
    };
  };
}

/** 从 `update` / 工厂给的那串装饰里，读"这个节点当前不当前"。 */
function readDecoration(decorations: readonly Decoration[]): boolean {
  return decorations.some((d) => d.spec?.[currentMark] === true);
}

/* ── 四、挂到编辑器上 ─────────────────────────────────────────────────── */

/** 读 KaTeX 选项（宏表）。读不到就退回空选项，理由见 `建公式视图` 顶上那段。 */
function readOption(ctx: Ctx): KatexOptions {
  try {
    return ctx.get(katexOptionsCtx.key) ?? {};
  } catch {
    return {};
  }
}

/** 行内公式的 NodeView。 */
export const commonStyleInlineView = $view(mathInlineSchema.node, (ctx) =>
  createCommonStyleView("inline", readOption(ctx)),
);

/** 块公式的 NodeView。 */
export const commonStyleBlockView = $view(mathBlockSchema.node, (ctx) => createCommonStyleView("block", readOption(ctx)));

/**
 * 这一整套（两个 NodeView + 「当前」插件）。
 *
 * ⚠️ 给 `create.ts` 的那一行是 `.use(mathView)`，位置紧跟在 `.use(diagramView)`
 * 后面：`$view` 的工厂要等 `SchemaReady`（插件自己会等），而 `.use()` 收数组，
 * 所以整包挂一处就够。
 */
export const mathView = [commonStyleInlineView, commonStyleBlockView, commonStyleCurrent];
