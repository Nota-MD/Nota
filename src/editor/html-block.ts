/**
 * **块级裸 HTML** 与 **HTML 注释**（`<div>…</div>` / `<!-- … -->`）。
 *
 * 用户 2026-09-27 的原话是「所有的未开始全部写完」，`docs/10-feature-matrix.md`
 * §3 里「HTML 标签」与「注释」各占一格。两格共用一个文件，因为它们**在 mdast
 * 里是同一种东西**——`remark-parse` 对两者都产出 `html` 节点，区别只在正文里
 * 长什么样（`<!--` 开头就是注释）。
 *
 * # 为什么行内的那一半不用管，块级这一半非管不可
 *
 * `preset-commonmark` 自带一个 `htmlSchema`，但它是
 * **`group: "inline", inline: true, atom: true`**——只能待在段落**里面**。
 * 而 `remark-parse` 把**独占一行**的 `<div>x</div>` 或 `<!-- 注 -->` 产成
 * **root 的直属孩子**（mdast 里那叫块级 html），于是：
 *
 * ```
 * doc 的 content 是 "block+"      ← preset-commonmark/lib/index.js:414
 * 而块级 html 是一个 inline 节点   ← 放不进去
 * ```
 *
 * 症状**不是**"这段 HTML 没显示"，是**整篇文档打不开**——`createAndFill`
 * 失败、`Cannot create node for doc`。而且触发门槛低到离谱：**一份文件只要以
 * 一行裸 HTML 开头**（哪怕后面还有一大段正常正文）就够了。这不是本仓自己
 * 造出来的边界，是上游的形状；但**用户会当成我们的 bug**，所以由本仓补上。
 *
 * 补法就是给它一个**自己的块级节点**：转换器把"块级位置上的 `html` 节点"
 * 改写成自造的 mdast 类型，schema 里再给它一颗 `group: "block"` 的原子节点。
 * 行内那些**一个字节都不动**，照旧走 preset 的 `htmlSchema`。
 *
 * # ⚠️ 它显示成"源码"，不是渲染出来的 HTML
 *
 * 编辑区里这两种节点画出来的都是**源码原样**（`<div>x</div>` 就是这十个字符，
 * 灰底、等宽）。**这不是没做完，是故意的**：
 *
 * 1. **渲染得先有 schema**。`<b>粗</b>` 在 mdast 里是"一颗 html ＋ 一颗 text ＋
 *    一颗 html"，而 PostMirror 的**原子节点装不下后面那颗 text**——真渲染就必须
 *    把三颗合成一颗带内容的节点，那是重写一遍 HTML 解析器，不是补一个节点。
 * 2. **渲染等于把用户写的标签交给浏览器执行**。`<script>`、`onerror=`、
 *    `<iframe>` 都会跟着进来（编辑区是活文档，不是沙箱 iframe）。
 * 3. 对照 Typora：那边**真渲染**。这是本仓与它的**已知差别**，写在
 *    `docs/10` §3 那一格上，不假装一样。
 *
 * ⚠️ **导出与打印那一侧不受影响**：导出走的是**序列化后的 Markdown**，
 * 原样的 `<div>` 交给那边，出来就是真的 HTML 元素——所以"写进文件里的 HTML
 * 是有效的"这件事仍然成立，代价只落在编辑区的观感上。
 *
 * # 注释为什么和普通 HTML 共用一个节点
 *
 * 因为它们在 mdast 里本来就是同一种东西，而"是不是注释"是一个**纯函数**
 * （[`是注释`]），DOM 上挂个 `data-comment="true"` 就够了，CSS 按属性选。
 * 为它单开一个节点类型要多一整套 parse/serialize/规格，换不来任何东西。
 */

import type { MilkdownPlugin } from "@milkdown/kit/ctx";
import type { MarkdownNode, ParserState, SerializerState } from "@milkdown/kit/transformer";
import type { Node as PMNode } from "@milkdown/kit/prose/model";
import { $nodeSchema, $remark } from "@milkdown/kit/utils";

/* ── 第一格：mdast（把块级位置上的 html 节点换个类型名）────────────────── */

/**
 * 本仓自造的 mdast 节点类型（同 `inline-marks.ts` 那四个的来路：只在
 * **这一次解析与这一次序列化之间**活着，不进文件、不进剪贴板）。
 *
 * ⚠️ 名字里的 `nota` 前缀是为了将来不与上游撞名——上游真要给块级 html 一个
 * 节点类型时，那个名字**不会**叫这个。
 */
export const 块HTML节点名 = "notaHtmlBlock";

/**
 * mdast 里**哪些父节点的孩子算"块级位置"**。
 *
 * ⚠️ 这张表是**穷举**的，不是"举几个例子"：mdast 里能装块级孩子的容器就这四种
 * （`root` 文档根、`blockquote` 引用、`listItem` 列表项、`footnoteDefinition`
 * 脚注定义）。判断写成"在表里就是块级、不在就是行内"，**新出的容器类型会落到
 * 行内那一支**——那正是安全的方向：行内 html 有 preset 的原生支持，放错了顶多
 * 是显示成一行源码，而放反了就是**整篇打不开**。
 */
export const 块级容器: ReadonlySet<string> = new Set([
  "root",
  "blockquote",
  "listItem",
  "footnoteDefinition",
]);

/**
 * 这是不是一条 HTML 注释。
 *
 * ⚠️ 判据只有"开头"，**不看结尾**：`<!-- 没写完` 也是注释（用户写到一半存过盘
 * 的文件长这样），按注释画比按 HTML 画更接近他的意图。前后空白先吃掉——
 * remark-parse 给的 `value` 一般不带，但那是它的实现细节，本仓不靠它。
 */
export function 是注释(值: string): boolean {
  return /^\s*<!--/.test(值);
}

/**
 * 一棵 mdast：把**块级位置**上的 `html` 节点改写成 [`块HTML节点名`]。
 *
 * ⚠️ 原地改（`节点.type = …`），不重建树：mdast 的节点在 unified 那条链上是
 * **共享**的，重建一份会让后面按引用找节点的插件扑空（`math-delim.ts` 那条
 * 标数就吃过这个亏）。
 *
 * ⚠️ 只认 `type === "html"` 且 `typeof value === "string"`：remark 家族里
 * `html` 节点必带 `value`，但上游哪天换个形状，这里的 `typeof` 会让它**原样
 * 留给 preset 的 `htmlSchema`**（那边的 `match` 也认 `type === "html"`），
 * 而不是被本文件的节点接走、然后序列化出一个空串。
 */
export function 块HTML转换(树: MarkdownNode): void {
  const 走 = (节点: MarkdownNode): void => {
    const 孩子 = 节点.children;
    if (!Array.isArray(孩子)) return;
    for (const 一 of 孩子 as MarkdownNode[]) {
      if (
        一.type === "html" &&
        typeof 一.value === "string" &&
        块级容器.has(节点.type)
      ) {
        一.type = 块HTML节点名;
      }
      // ⚠️ 递归要在**改完类型之后**仍然进行：`html` 是原子节点、没有孩子，
      // 但别的容器（引用、列表项）里面有，而且那里面**还可能**有块级 html。
      走(一);
    }
  };
  走(树);
}

/** `$remark` 工厂的类型（照 `inline-marks.ts` 的写法，从它自己的参数反推）。 */
type 转换器工厂 = Parameters<typeof $remark<"nota块HTML", undefined>>[1];

/**
 * 挂进 `.use()` 的那一条。
 *
 * ⚠️ 拆成"插件本体 ＋ 工厂"两步，**理由与 `inline-marks.ts` 那段一字不差**
 * （`转换器工厂` 的返回类型是**插件**不是转换器，写成一体会让 `树` 被推断成
 * 选项的类型，而报错要到断言那一行才出现）。这里不再抄一遍那段话。
 *
 * ⚠️ **必须排在 `gfm` 之后**：它看的是解析完的树，早于 `gfm` 就等于对着还没
 * 铺开的树干活。与 `行内标记解析` 同一个位置、同一个理由。
 */
export function 块HTML解析() {
  const 转换器插件: ReturnType<转换器工厂> = () => (树) => {
    块HTML转换(树 as MarkdownNode);
  };
  const 工厂: 转换器工厂 = () => 转换器插件;
  return $remark("nota块HTML", 工厂);
}

/* ── 第二格：schema（一颗块级原子节点）＋ 命令 ────────────────────────── */

/** 节点属性。`value` 就是那段 HTML 的**原文**，一个字节都不改。 */
interface 块属性 {
  value: string;
}

/**
 * 块级 HTML / 注释那一颗节点。
 *
 * ⚠️ **`atom: true` ＋ 没有 `content`**：它是一颗"死"节点，里面不让放东西。
 * 想改内容请切源码模式——这条与 `math_block`（公式块）的口径一样。
 * 给它 `content` 的话，编辑区里那段 HTML 文本就会被 ProseMirror 当成
 * **可以编辑的正文**，用户在源码上敲一个字，序列化出去就变成两样东西
 * （标签本体 ＋ 被改过的文本），那种文件再打开已经不是他写的那份了。
 *
 * ⚠️ **`group: "block"` 是这件事的全部意义**（见文件头：`doc.content` 是
 * `"block+"`）。别顺手把它改成 `inline`——那样这份文件又打不开了。
 *
 * ⚠️ `defining: true`：与 `footnote_definition` 那类"自成一体"的块同一档。
 * 它的作用是让"整块选中/删除"这类操作把节点当一个单位看，而不是试图进去。
 */
export const 块HTML规格 = $nodeSchema(块HTML节点名, () => ({
  group: "block",
  atom: true,
  defining: true,
  attrs: { value: { default: "", validate: "string" } },
  /**
   * ⚠️ 走**属性**而不是"让 ProseMirror 看见真标签"：`data-value` 里装的是源码。
   * 粘贴/拖拽回来时按同一对属性认（下面 `parseDOM`）——两处必须同时改，
   * 只改一处的话，复制一段 HTML 块到别处再粘回来会变成**空块**。
   */
  parseDOM: [
    {
      tag: "div[data-type='html-block']",
      getAttrs: (dom: HTMLElement | string) => ({
        value: typeof dom === "string" ? "" : (dom.dataset.value ?? ""),
      }),
    },
  ],
  /**
   * 画出来是什么样：一个 `<div>`，里面是**源码本身**。
   *
   * ⚠️ `textContent`（也就是数组第三项那个字符串）而**不是** `innerHTML`：
   * ProseMirror 收数组形状 `[标签, 属性, 孩子]` 时，字符串孩子会被当作**文本**
   * 插进去，正好是我们要的"原样显示"。⚠️ 别改成"把 value 解析成元素"——
   * 那就等于在编辑区里执行用户写的 HTML（文件头第 2 条）。
   */
  toDOM: (node: PMNode) => {
    const 值 = (node.attrs as 块属性).value;
    return [
      "div",
      {
        "data-type": "html-block",
        "data-value": 值,
        // 注释单独标一格，CSS 按它换一副长相（`editor.css`）。
        ...(是注释(值) ? { "data-comment": "true" } : {}),
      },
      值,
    ] as const;
  },
  parseMarkdown: {
    match: ({ type }: MarkdownNode) => type === 块HTML节点名,
    runner: (state: ParserState, node: MarkdownNode, type: unknown) => {
      // ⚠️ 解析这一侧交出去的是 **PM 的 NodeType**（`runner` 的第三个参数），
      // 不是字符串——`ParserState.addNode` 内部是
      // `nodeType.createAndFill(...)`，传字符串当场 `TypeError`，而它**把异常
      // `console.error` 吞掉**（`@milkdown/transformer/lib/index.js:107-113`），
      // 症状是那颗节点**静默消失**。`inline-marks.ts` 的测试里踩过一次。
      state.addNode(type as never, { value: node.value ?? "" });
    },
  },
  toMarkdown: {
    match: (node: PMNode) => node.type.name === 块HTML节点名,
    runner: (state: SerializerState, node: PMNode) => {
      // ⚠️ 序列化这一侧收的是**字符串**（`state.addNode(type: string, …)`），
      // 与上面正好相反。`"html"` 是 mdast 的类型名，`mdast-util-to-markdown`
      // 自带它的处理器（`lib/handle/html.js`），原样把 value 写出去。
      state.addNode("html", undefined, (node.attrs as 块属性).value);
    },
  },
}));

/**
 * 这一颗节点的插件元组（`$nodeSchema` 返回 `[ctx, 插件]` 两元组，
 * 照 `inline-marks.ts` 的 `行内标记规格插件` 那样摊平）。
 *
 * ⚠️ 用法是 `.use(块HTML规格插件)`；`$nodeSchema` 的返回值**不是**
 * `MilkdownPlugin`，直接 `.use(块HTML规格)` 过不了类型。
 */
export const 块HTML规格插件: MilkdownPlugin[] = [块HTML规格[1]];
