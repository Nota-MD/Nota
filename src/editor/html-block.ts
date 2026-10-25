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
 * # 它由 NodeView 安全渲染，源码保持原样
 *
 * 编辑区里不把整段 HTML 当纯文字展示。`html-block-view.ts` 使用受控标签与
 * 属性白名单生成预览，脚本、iframe、内联样式、事件属性与危险协议不会进入
 * 活动 DOM。源码仍只存在 `attrs.value`，序列化时逐字写回；点击悬浮出现的
 * `HTML` 按钮可在块内修改源码。
 *
 * 这一拆分解决了两个独立问题：schema 负责“文档能打开并且字节不变”，
 * NodeView 负责“GitHub README 风格的 HTML 能被看见”。渲染结果不进入文档树，
 * 因此不能把浏览器规范化后的 DOM 反向写成另一份 Markdown。
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
import { debugEvent } from "@/ui/debug-log";

/* ── 第一格：mdast（把块级位置上的 html 节点换个类型名）────────────────── */

/**
 * 本仓自造的 mdast 节点类型（同 `inline-marks.ts` 那四个的来路：只在
 * **这一次解析与这一次序列化之间**活着，不进文件、不进剪贴板）。
 *
 * ⚠️ 名字里的 `nota` 前缀是为了将来不与上游撞名——上游真要给块级 html 一个
 * 节点类型时，那个名字**不会**叫这个。
 */
export const blockHtmlNodeName = "notaHtmlBlock";

/**
 * mdast 里**哪些父节点的孩子算"块级位置"**。
 *
 * ⚠️ 这张表是**穷举**的，不是"举几个例子"：mdast 里能装块级孩子的容器就这四种
 * （`root` 文档根、`blockquote` 引用、`listItem` 列表项、`footnoteDefinition`
 * 脚注定义）。判断写成"在表里就是块级、不在就是行内"，**新出的容器类型会落到
 * 行内那一支**——那正是安全的方向：行内 html 有 preset 的原生支持，放错了顶多
 * 是显示成一行源码，而放反了就是**整篇打不开**。
 */
export const blockLevelContainer: ReadonlySet<string> = new Set([
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
export function isNoteRelease(value2: string): boolean {
  return /^\s*<!--/.test(value2);
}

/**
 * Milkdown 的解析链有时把一块裸 HTML 包成 `paragraph(html)`，而普通
 * `remark-parse` 给的是 root 直属 `html`。两种形状都要收进同一个块级节点。
 *
 * 判据：段落里至少有一颗 `html`，所有孩子只允许 `html` 或文本；拼起来的
 * 非空白内容必须以 `<` 开头、以 `>` 结尾。这样 `<span>甲</span>` 独占一段会
 * 成为 HTML 块，而 `甲 <span>乙</span> 丙` 仍是普通段落。
 */
function pureHTMLParagraphSource(node: MarkdownNode): string | null {
  if (node.type !== "paragraph" || !Array.isArray(node.children)) return null;
  let hasHTML = false;
  let source = "";
  for (const child of node.children as MarkdownNode[]) {
    if (child.type === "html" && typeof child.value === "string") {
      hasHTML = true;
      source += child.value;
      continue;
    }
    if (child.type === "text" && typeof child.value === "string") {
      source += child.value;
      continue;
    }
    return null;
  }
  const clean = source.trim();
  if (!hasHTML || !clean.startsWith("<") || !clean.endsWith(">")) return null;
  return source;
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
export function blockHTMLConvertReplace(tree: MarkdownNode): void {
  const walk = (node: MarkdownNode): void => {
    const child = node.children;
    if (!Array.isArray(child)) return;
    for (const value of child as MarkdownNode[]) {
      if (
        value.type === "html" &&
        typeof value.value === "string" &&
        blockLevelContainer.has(node.type)
      ) {
        value.type = blockHtmlNodeName;
      } else if (blockLevelContainer.has(node.type)) {
        const paragraphSource = pureHTMLParagraphSource(value);
        if (paragraphSource !== null) {
          value.type = blockHtmlNodeName;
          value.value = paragraphSource;
          delete value.children;
        }
      }
      // ⚠️ 递归要在**改完类型之后**仍然进行：`html` 是原子节点、没有孩子，
      // 但别的容器（引用、列表项）里面有，而且那里面**还可能**有块级 html。
      walk(value);
    }
  };
  walk(tree);
}

/** `$remark` 工厂的类型（照 `inline-marks.ts` 的写法，从它自己的参数反推）。 */
type ConvertReplaceDeviceWorkFactory = Parameters<typeof $remark<"nota块HTML", undefined>>[1];

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
export function blockHTMLParse() {
  let alreadyReport = false;
  const convertReplaceDevicePlugin: ReturnType<ConvertReplaceDeviceWorkFactory> = () => (tree) => {
    const rootTypes =
      Array.isArray((tree as MarkdownNode).children)
        ? ((tree as MarkdownNode).children as MarkdownNode[])
            .slice(0, 12)
            .map((value) => value.type)
            .join(",")
        : "";
    blockHTMLConvertReplace(tree as MarkdownNode);
    if (!alreadyReport && typeof window !== "undefined") {
      alreadyReport = true;
      let blocks = 0;
      let inline = 0;
      const walk = (node: MarkdownNode): void => {
        if (node.type === blockHtmlNodeName) blocks += 1;
        if (node.type === "html") inline += 1;
        const child = node.children;
        if (Array.isArray(child)) {
          for (const value of child as MarkdownNode[]) walk(value);
        }
      };
      walk(tree as MarkdownNode);
      debugEvent("editor", "HTML markdown transform complete", {
        html_blocks: blocks,
        inline_html: inline,
        root_types: rootTypes,
      });
    }
  };
  const workFactory: ConvertReplaceDeviceWorkFactory = () => convertReplaceDevicePlugin;
  return $remark("nota块HTML", workFactory);
}

/* ── 第二格：schema（一颗块级原子节点）＋ 命令 ────────────────────────── */

/** 节点属性。`value` 就是那段 HTML 的**原文**，一个字节都不改。 */
interface BlockAttribute {
  value: string;
}

/**
 * 块级 HTML / 注释那一颗节点。
 *
   * ⚠️ **`atom: true` ＋ 没有 `content`**：它是一颗"死"节点，里面不让放东西。
   * 块内源码编辑由 `html-block-view.ts` 的 textarea 写入 `attrs.value`。
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
export const blockHTMLSpec = $nodeSchema(blockHtmlNodeName, () => ({
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
   * `toDOM` 是复制/粘贴与没有 NodeView 时的安全回退：只放源码文本。
   * 屏幕上的渲染由 `html-block-view.ts` 接管。
   */
  toDOM: (node: PMNode) => {
    const value2 = (node.attrs as BlockAttribute).value;
    return [
      "div",
      {
        "data-type": "html-block",
        "data-value": value2,
        // 注释单独标一格，CSS 按它换一副长相（`editor.css`）。
        ...(isNoteRelease(value2) ? { "data-comment": "true" } : {}),
      },
      value2,
    ] as const;
  },
  parseMarkdown: {
    match: ({ type }: MarkdownNode) => type === blockHtmlNodeName,
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
    match: (node: PMNode) => node.type.name === blockHtmlNodeName,
    runner: (state: SerializerState, node: PMNode) => {
      // ⚠️ 序列化这一侧收的是**字符串**（`state.addNode(type: string, …)`），
      // 与上面正好相反。`"html"` 是 mdast 的类型名，`mdast-util-to-markdown`
      // 自带它的处理器（`lib/handle/html.js`），原样把 value 写出去。
      state.addNode("html", undefined, (node.attrs as BlockAttribute).value);
    },
  },
}));

/**
 * `$view` 用节点插件的 `id` 作为 NodeView 注册键，而 `$nodeSchema` 在模块
 * 初始化时返回的 `.node.id` 尚未由异步插件体赋值。HTML 节点是在本轮新增视图
 * 的类型，显式固定 id，确保 `html-block-view.ts` 注册的是 `notaHtmlBlock`
 * 而不是一个尚未赋值的键。
 */
blockHTMLSpec.node.id = blockHtmlNodeName;

/**
 * 这一颗节点的插件元组。用法是 `.use(块HTML规格插件)`。
 *
 * ⚠️⚠️ **`[ctx, 插件]` 两格都要，别只留第二格**（2026-09-27 修，BUG-46）。
 * 与 `inline-marks.ts` 的 `行内标记规格插件` 是**同一个坑的两处**：
 * `$nodeSchema(id, …)` 内部是 `ctx.get(schemaCtx.key)(ctx)`
 *（`@milkdown/utils` 的 `lib/index.js`），第一格那个 `$Ctx` 就是一格
 * `MilkdownPlugin`，登记它才把名字（`"notaHtmlBlock"`）挂进 ctx 容器。
 * 少了它 ⇒ `Context "notaHtmlBlock" not found` ⇒ **`editor.create()` 整个失败**。
 * ⚠️ 那一处修完，错误只是从这个名字换成另一个名字——**两条要一起改**。
 *
 * ⚠️ 为什么不能直接 `.use(块HTML规格)`：`$nodeSchema` 的返回值是个**数组**
 *（两元组），不是 `MilkdownPlugin`，过不了类型；所以这里摊平成
 * `[第一格, 第二格]`，与上游 `preset-commonmark/lib/index.js:1597` 那个
 * `[…].flat()` 等效。
 */
export const blockHTMLSpecPlugin: MilkdownPlugin[] = [
  blockHTMLSpec.ctx as unknown as MilkdownPlugin,
  blockHTMLSpec[1],
];
