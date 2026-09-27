/**
 * 行内标记的提示：光标落在**加粗**／*斜体* 里时，把那两个 `**` / `*`
 * 半透明画在那段文字的左右两边。
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
 * 用户这次要的**不是那个**：他要的是"看得见"，不是"能编辑这个符号"。
 * 所以这里走的是**纯显示**（`Decoration.inline` + `::before`/`::after`），
 * 不动 schema、不动文档，一个字节都不写回。
 *
 * # ⚠️ 为什么不用 widget 把 `**` 插进去
 *
 * 那正是 `instant-render.ts` 试过的第一版，症状写在那儿：插进去的 `<span>`
 * 会被 ProseMirror 当成正文的一部分，于是"打出来的字跑到标记前面去"、
 * 光标进不去、退格删不掉。**只改显示不改文档的事一律走 Decoration**。
 *
 * # 长相：`content: attr()` 画在 `::before` / `::after` 上
 *
 * 符号走属性（`data-markhint`），CSS 里 `content: attr(data-markhint)` 取它——
 * 与 `.nota-srcmark` 同一条路子，于是**淡入动画、不可选中、不吃鼠标事件、
 * 颜色跟着 `--fg-faint`** 这几条可以照抄同一张配方（`marks.css` 里那段）。
 *
 * ⚠️ **代价讲清楚**：这两个符号是**占宽度**的（它们是真真切切的 `::before` /
 * `::after`，不是绝对定位的浮标）。所以光标进出加粗段时，那一行会横向动
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
 * ——这也是为什么 `editor/export.ts` 的 `摘掉的属性` 里**没有** `data-markhint`：
 * 那个清单是给"装上了、但导出时要洗掉"的东西用的（`data-srcmark` 就是，
 * `instantRender` 是恒挂的）。本文件没挂上去，就没有第二个地方要记。
 * 将来真改成恒挂，**先在那边登记 `提示属性`**，否则环星号会跟着进导出文件。
 */

import { $prose } from "@milkdown/kit/utils";
import { Plugin, PluginKey } from "@milkdown/kit/prose/state";
import { Decoration, DecorationSet } from "@milkdown/kit/prose/view";
import type { MarkType, Node as PMNode } from "@milkdown/kit/prose/model";

/** 加在**那一段文字**上的 class。CSS 见 `src/styles/marks.css`。 */
export const 提示类 = "nota-markhint";

/** 符号文字走这个属性，CSS 里 `content: attr(data-markhint)` 取它。 */
export const 提示属性 = "data-markhint";

/**
 * 提示哪几种标记、各画什么符号。**就这一张表**——加第三种（行内代码、链接）
 * 只需要在这儿添一行，插件本体一个字都不用改。
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
 * ⚠️ 符号**一律写星号**，不写 `_` / `__`：本仓存盘走的是 milkdown 那套
 * serializer，加粗/斜体它一律输出星号（`**` / `*`）。写了别的就是"屏幕上的
 * 和存出来的不一样"——那正是这一整个功能要消掉的东西。
 *
 * ⚠️ 反引号（行内代码）**没进这张表**：用户这次只点了加粗与斜体两样
 *（「在黑体/斜体内容内」）。要加的话是加 `{ 名: "inlineCode", 符号: "`" }`
 *（同样先照上面那条核实 id），但还要先确认 serializer 到底用几个反引号
 *（源码里出现反引号时要加成对的两个），别照着印象填。
 *
 * 📌 导出只给 `tests/mark-hint.test.ts` 用（它拿真 preset 的 id 对这张表）。
 */
export const 提示表: readonly { 名: string; 符号: string }[] = [
  { 名: "strong", 符号: "**" },
  { 名: "emphasis", 符号: "*" },
];

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
export function 扫一段(
  doc: PMNode,
  位置: number,
  类型: MarkType,
): { 从: number; 到: number } | null {
  const $位 = doc.resolve(位置);
  const 父 = $位.parent;
  // 光标不落在能装文字的那一层（比如嵌在图片/公式这类原子节点里）就没得扫。
  if (!父.inlineContent) return null;

  /** 每个行内孩子从哪个位置起、带不带这个标记。 */
  const 各孩: { 从: number; 带: boolean }[] = [];
  let 长 = 0;
  for (let i = 0; i < 父.childCount; i++) {
    const 孩 = 父.child(i);
    const 宽 = 孩.isText === true ? ((孩.text as string).length) : 孩.nodeSize;
    // ⚠️ `MarkType.isInSet` 的类型是 `Mark | undefined`（**不是** `boolean`），
    //    所以这里判"带不带"要比 `undefined`，不能写 `&&`/`=== true`——
    //    写成后者过不了 `tsc --noEmit`（`Mark | undefined` 与 `boolean` 没有交集）。
    //    行内原子（公式 / 图片）的 `marks` 是空集，问出来就是 `undefined`，
    //    所以**不用**再单独判 `isText`。
    各孩.push({ 从: 长, 带: 类型.isInSet(孩.marks) !== undefined });
    长 += 宽;
  }
  if (长 <= 0) return null;

  /** 第 `j` 个位置（`0 <= j < 长`）带不带这个标记。 */
  const 带 = (j: number): boolean => {
    for (let i = 各孩.length - 1; i >= 0; i--) {
      const 孩 = 各孩[i];
      if (孩 && j >= 孩.从) return 孩.带;
    }
    return false;
  };

  const 块首 = $位.start();
  const 光标 = Math.min(Math.max(位置 - 块首, 0), 长);
  // 光标落在这一段里（第 `光标` 个位置带标记），或者**紧贴在段尾**
  // （刚打完 `**粗**`，光标停在最后一个字后面，那时它后面已经没有带标记的字了）。
  // 只看前者的话，最常见的那个瞬间（刚写完）反而什么都不显示。
  if (!((光标 < 长 && 带(光标)) || (光标 > 0 && 带(光标 - 1)))) return null;

  let 从 = 光标;
  let 到 = 光标;
  while (从 > 0 && 带(从 - 1)) 从--;
  while (到 < 长 && 带(到)) 到++;
  return { 从: 块首 + 从, 到: 块首 + 到 };
}

/**
 * 提示表里那些名字，有哪些在**当前这颗 schema** 里找不到。
 *
 * ⚠️ 这是"名字写错就悄悄不显示"那道防线的**运行期**一半（另一半是
 * `tests/mark-hint.test.ts` 拿真 preset 的 id 对表）。只报一次：这个函数
 * 每次光标动都会跑，逐次 `console.warn` 会把控制台刷爆（而且 `NOTA_DEBUG`
 * 那套日志本来就只在调试时看）。
 */
let 报过缺名字 = false;

function 查缺名字(marks: Record<string, MarkType | undefined>): void {
  if (报过缺名字) return;
  const 缺 = 提示表.filter(({ 名 }) => !marks[名]).map(({ 名 }) => 名);
  if (!缺.length) return;
  报过缺名字 = true;
  console.warn(
    `[nota] 行内标记提示：schema 里没有这几个 mark，对应的提示不会出现：${缺.join("、")}` +
      `（提示表在 src/editor/mark-hint.ts）。斜体那个 mark 的 id 是 \`emphasis\`，不是 \`em\`。`,
  );
}

/**
 * 按当前选区算装饰集。
 *
 * ⚠️ 只有"光标是一个点"时才显示（`sel.empty`）。框选一片时不显示——
 * 那时候用户的注意力在"选中了什么"，多两个符号只会让选区看起来变长。
 * 这条判据与 `instant-render.ts` 一致。
 */
function 算提示(state: { selection: unknown; doc: PMNode; schema: unknown }): DecorationSet {
  const 选 = state.selection as { empty: boolean; from: number };
  if (!选.empty) return DecorationSet.empty;

  const doc = state.doc;
  const 位置 = 选.from;
  const marks = (state.schema as { marks: Record<string, MarkType | undefined> }).marks;
  const 装饰: Decoration[] = [];
  查缺名字(marks);

  for (const { 名, 符号 } of 提示表) {
    const 类型 = marks[名];
    if (!类型) continue;

    // "光标在这一段里 / 紧贴在段尾"两条判据都在 `扫一段` 里（见那一格）。
    const 段 = 扫一段(doc, 位置, 类型);
    if (!段 || 段.从 >= 段.到) continue;

    // ⚠️ 给**那一段文字**挂 class 和属性，不插新元素（理由见文件头）。
    //    一个 mark 一条装饰：`***又粗又斜***` 会拿到两条，符号并排画出来
    //    正好是 `***`，不用为嵌套另写逻辑。
    装饰.push(
      Decoration.inline(段.从, 段.到, { class: 提示类, [提示属性]: 符号 }),
    );
  }

  return 装饰.length ? DecorationSet.create(doc, 装饰) : DecorationSet.empty;
}

/**
 * 插件本体。
 *
 * ⚠️ 装饰在**每次 state 变化**时重算（含光标移动），不做缓存——理由与
 * `instant-render.ts` 那条一字不差：缓存要自己判断"这次变化影响不影响结果"，
 * 判错的代价是提示不跟着光标走，而"跟着光标走"是这个功能唯一要做对的事。
 * 代价是 O(1)：只看光标那两处相邻位置。
 */
export const markHint = $prose(
  () =>
    new Plugin({
      key: new PluginKey("nota-mark-hint"),
      props: {
        decorations: (state) => 算提示(state as never),
      },
    }),
);
