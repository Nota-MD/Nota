/**
 * 图表（` ```mermaid ` 围栏）的**节点**：remark 转换、schema、输入规则、命令。
 * 2026-10-04 落地（`docs/07` 第 27 项）。
 *
 * # 为什么这个文件把 `@milkdown/plugin-diagram` 整个替掉了
 *
 * 那个包干四件事：把 ` ```mermaid ` 围栏转成 `diagram` 节点（remark 那一步）、
 * 给这个节点 schema、一条输入规则、一条命令。**但它顺带在模块顶上
 * `import mermaid from "mermaid"`**——而它自己**一处都没调过** `mermaid.render`
 * （渲染是 `diagram-view.ts` 补的）。也就是说：**装它就得把 mermaid 的
 * 几百 KB 静态打进首屏**，换来的只是上面那四件不含 mermaid 的小活。
 * 本仓如今自己把这四件写在这里（判据与上游逐行对齐，见下面各条），
 * 依赖里只剩 `mermaid` 本体，并且它改成**动态 import**（`diagram-view.ts`）：
 * `index-*.js` 里那坨静态 mermaid 从此消失，有图才加载。
 *
 * # 与上游 `@milkdown/plugin-diagram@7.7.0` 的对照（逐件）
 *
 * - **remark 转换**：`code{lang === "mermaid"}` → `{ type: "diagram", value }`，
 *   原地改（不重建树，理由同 `html-block.ts` 文件头）。上游用 `unist-util-visit`
 *   递归；这里自己写了一颗**十几行**的遍历（引用、列表项里也认），省一个
 *   显式依赖。
 * - **schema**：`content: "text*"`, `group: "block"`, `marks: ""`, `defining`,
 *   `atom`, `isolating`，属性 `value`（源码）与 `identity`（随机 id）——
 *   **一个字段都没动**：`diagram-view.ts` 靠 `attrs.value` / `attrs.identity`
 *   干活，序列化走 `toMarkdown`，换形状就是静默失效。
 * - **parseDOM / toDOM**：`div[data-type="diagram"]` ＋ `data-id`/`data-value`，
 *   与上游一致（本视图平时不画这些属性，但粘贴/导出那些不挂 NodeView 的路
 *   会走到；两边不一样的话，复制出去的图粘回来会变空块）。
 * - **identity**：上游是 `nanoid` 的 `customAlphabet("abcdefg", 8)`。这里
 *   不引 nanoid（就为一个 8 字符缓存键），用同字母表同长度的本地随机；
 *   消费者只有缓存键与 `data-id`，语义（"跟着节点走的唯一 id"）不变。
 * - **输入规则**：`` ^```mermaid$ `` → 整段换成空 `diagram` 节点（打
 *   ` ```mermaid ` 出图框），上游怎么判的这里怎么判。
 * - **命令**：`InsertDiagramCommand` ＝ `setBlockType(diagram, { identity })`。
 *   仓里今天没有调用点，留它是为了与上游的能力面一致（菜单要接就有）。
 *
 * # ⚠️ 上游有、这里**故意没有**的一件事
 *
 * 上游的 schema 工厂第一行是 `mermaid.initialize({ startOnLoad: false })`——
 * 那要求 mermaid **在编辑器构建时就已经加载**，正是首屏那坨体积的来路。
 * 这里不初始化：`diagram-view.ts` 每次渲染前都会带全配置 `initialize` 一遍
 *（`startOnLoad: false` ＋ 当前明暗的主题），构建期那一次从没有过存在的必要。
 */

import type { MilkdownPlugin } from "@milkdown/kit/ctx";
import type { Node as PMNode } from "@milkdown/kit/prose/model";
import { InputRule } from "@milkdown/prose/inputrules";
import { setBlockType } from "@milkdown/prose/commands";
import type { MarkdownNode, ParserState, SerializerState } from "@milkdown/kit/transformer";
import { $command, $inputRule, $nodeSchema, $prose, $remark } from "@milkdown/kit/utils";
import {
  Plugin,
  PluginKey,
  type EditorState,
  type Transaction,
} from "@milkdown/kit/prose/state";


/** 节点名。**不能改**：`diagram-view.ts` 的 `$view`、缓存判型、`stopEvent` 都认它。 */
export const imageTableNodeName = "diagram";

/* ── identity ─────────────────────────────────────────────────────────── */

/**
 * 跟着节点走的随机 id（8 字符、`abcdefg` 字母表，与上游 nanoid 同参）。
 * 消费者只有两处：渲染缓存的键、`toDOM` 的 `data-id`。
 */
function followMachineMarkRecognize(): string {
  const characterMotherTable = "abcdefg";
  let s = "";
  for (let i = 0; i < 8; i++) s += characterMotherTable[Math.floor(Math.random() * characterMotherTable.length)];
  return s;
}

/** 上游的 `getId`：**已有的标识原样用**（改源码不换 id），没有才发新的。 */
function getMarkRecognize(node?: PMNode): string {
  const value2: unknown = (node as { attrs?: { identity?: unknown } } | undefined)?.attrs?.identity;
  return typeof value2 === "string" && value2 !== "" ? value2 : followMachineMarkRecognize();
}

/* ── 第一件：remark 转换（围栏 → diagram 节点）────────────────────────── */

/**
 * 一棵 mdast：把所有 `code{lang === "mermaid"}` 改写成 [`图表节点名`]。
 *
 * ⚠️ **原地改**（`一.type = …`），不重建树——理由与 `html-block.ts` 那段一字
 * 不差：mdast 节点在 unified 链上是共享的，重建会让按引用找节点的插件扑空。
 *
 * ⚠️ 引用、列表项**里面**的围栏也要认（块级容器里哪都有），所以遍历要递归；
 * 换完型的不用再进（`diagram` 节点没有孩子）。
 */
export function imageTableConvertReplace(tree: MarkdownNode): void {
  const walk = (node: MarkdownNode): void => {
    const child = node.children;
    if (!Array.isArray(child)) return;
    for (let i = 0; i < child.length; i++) {
      const value = child[i] as MarkdownNode | undefined;
      if (!value) continue;
      if (value.type === "code" && (value as { lang?: unknown }).lang === "mermaid") {
        child[i] = { type: imageTableNodeName, value: value.value };
        continue;
      }
      walk(value);
    }
  };
  walk(tree);
}

/** `$remark` 工厂的类型（照 `html-block.ts` 的写法，从它自己的参数反推）。 */
type ConvertReplaceDeviceWorkFactory = Parameters<typeof $remark<"nota图表", undefined>>[1];

/**
 * 挂进 `.use()` 的那一条。
 *
 * ⚠️ 拆成"插件本体 ＋ 工厂"两步的理由在 `html-block.ts`（`转换器工厂` 的
 * 返回类型是**插件**不是转换器），那里写过，不抄。
 *
 * ⚠️ **排在 `gfm` 之后**：它看的是解析完的树，与 `块HTML解析` / `行内标记解析`
 * 同一个位置、同一个理由。
 */
export function imageTableParse() {
  const convertReplaceDevicePlugin: ReturnType<ConvertReplaceDeviceWorkFactory> = () => (tree) => {
    imageTableConvertReplace(tree as MarkdownNode);
  };
  const workFactory: ConvertReplaceDeviceWorkFactory = () => convertReplaceDevicePlugin;
  return $remark("nota图表", workFactory);
}

/* ── 第二件：schema ───────────────────────────────────────────────────── */

/** 节点属性。`value` 是 Mermaid 源码；`identity` 是跟着节点走的随机 id。 */
interface ImageTableAttribute {
  value: string;
  identity: string;
}

/**
 * `diagram` 那颗节点。形状与上游**逐字段对齐**（为什么一个都不能动，
 * 见文件头"schema"那条）。
 *
 * ⚠️ `atom: true` → 没有 contentDOM，源码在 `attrs.value` 里；
 * 「平时看图、点一下改源码」是 `diagram-view.ts` 的 NodeView 在管。
 */
export const imageTableSpec = $nodeSchema(imageTableNodeName, () => ({
  content: "text*",
  group: "block",
  marks: "",
  defining: true,
  atom: true,
  isolating: true,
  attrs: {
    value: { default: "" },
    identity: { default: "" },
  },
  parseDOM: [
    {
      tag: `div[data-type="${imageTableNodeName}"]`,
      preserveWhitespace: "full" as const,
      getAttrs: (dom: HTMLElement | string) => {
        // 上游在这里对非 HTMLElement 抛 `expectDomTypeError`（让 ProseMirror
        // 的 DOMParser 走既有的报错路）。这里只需要那个**形状**，不需要那个
        // 异常类本身——类型只引不举，运行时零依赖。
        if (typeof dom === "string") {
          throw new Error(`Unexpected DOM ${JSON.stringify(dom)}`);
        }
        return {
          value: dom.dataset.value ?? "",
          identity: dom.dataset.id ?? "",
        };
      },
    },
  ],
  toDOM: (node: PMNode) => {
    const attribute = node.attrs as ImageTableAttribute;
    return [
      "div",
      {
        "data-type": imageTableNodeName,
        "data-id": getMarkRecognize(node),
        "data-value": attribute.value,
      },
      attribute.value,
    ] as const;
  },
  parseMarkdown: {
    match: ({ type }: MarkdownNode) => type === imageTableNodeName,
    runner: (state: ParserState, node: MarkdownNode, type: unknown) => {
      // ⚠️ 第三个参数是 **PM 的 NodeType**（`html-block.ts` 那条注释：
      // 传字符串会被 `console.error` 吞掉、节点静默消失）。
      state.addNode(type as never, {
        value: node.value ?? "",
        identity: followMachineMarkRecognize(),
      });
    },
  },
  toMarkdown: {
    match: (node: PMNode) => node.type.name === imageTableNodeName,
    runner: (state: SerializerState, node: PMNode) => {
      // 序列化这一侧收的是**字符串**类型名（与解析那侧相反，同 `html-block.ts`）。
      // ⚠️ `mdast-util-to-markdown` 的 code 处理器自己会算围栏长度（源码里
      // 出现 ``` 时自动加长）——这就是"文档里的真相永远是源码"那条路的出口。
      state.addNode("code", undefined, (node.attrs as ImageTableAttribute).value || "", {
        lang: "mermaid",
      });
    },
  },
}));

/**
 * 这一颗节点的插件元组，用法 `.use(图表规格插件)`。
 *
 * ⚠️⚠️ **`[ctx, 插件]` 两格都要**（BUG-46 的坑，`html-block.ts` 文件头写过
 * 全文）：少第一格 ⇒ `Context "diagram" not found` ⇒ `editor.create()` 整个失败。
 */
export const imageTableSpecPlugin: MilkdownPlugin[] = [
  imageTableSpec.ctx as unknown as MilkdownPlugin,
  imageTableSpec[1],
];

/**
 * 把已经存在的 `code_block(language="mermaid")` 转成图表节点。
 *
 * 手打围栏时，通用代码块输入规则可能先于 Mermaid 专用规则把内容变成普通代码块；
 * 从语言下拉里选 `mermaid` 也不会重新走解析器。这个插件守在所有事务之后，
 * 只要文档里出现语言为 `mermaid` 的代码块，就保留原文并换成图表节点。
 */
export const mermaidCodeBlockConvertReplace = $prose(
  () =>
    new Plugin({
      key: new PluginKey("nota-mermaid-code-block"),
      view: (view) => {
        const tr = codeBlockConvertImageTable(view.state);
        if (tr) queueMicrotask(() => view.dispatch(tr));
        return {};
      },
      appendTransaction: (transactions, _OldValue, newValue) => {
        if (!transactions.some((tr) => tr.docChanged)) return null;
        return codeBlockConvertImageTable(newValue);
      },
    }),
);

function codeBlockConvertImageTable(state: EditorState): Transaction | null {
  const imageTable = state.schema.nodes[imageTableNodeName];
  if (!imageTable) return null;
  const pendingReplace: { pos: number; end: number; node: PMNode }[] = [];
  state.doc.descendants((node, pos) => {
    if (
      node.type.name === "code_block" &&
      String(node.attrs.language ?? "").trim().toLowerCase() === "mermaid"
    ) {
      pendingReplace.push({
        pos,
        end: pos + node.nodeSize,
        node: imageTable.create({
          value: node.textContent,
          identity: followMachineMarkRecognize(),
        }),
      });
    }
    return true;
  });
  if (!pendingReplace.length) return null;
  const tr = state.tr;
  for (const { pos, end, node } of pendingReplace.reverse()) {
    tr.replaceWith(pos, end, node);
  }
  return tr;
}

/* ── 第三件：输入规则 ＋ 第四件：命令 ─────────────────────────────────── */

/**
 * 打 `` ```mermaid `` 出一颗**空图框**（上游同款判据：整段恰是这个串才认，
 * 后面跟了别的内容就不算）。
 */
export const imageTableInputRuleRule = $inputRule(
  (ctx) =>
    new InputRule(/^```mermaid$/, (state, _match, start, end) => {
      const nodeType = imageTableSpec.type(ctx);
      const $start = state.doc.resolve(start);
      if (!$start.node(-1).canReplaceWith($start.index(-1), $start.indexAfter(-1), nodeType))
        return null;
      return state.tr.delete(start, end).setBlockType(start, start, nodeType, {
        identity: followMachineMarkRecognize(),
      });
    }),
);

/** 命令：把选中的块换成空 `diagram` 节点（上游 `InsertDiagramCommand` 同款）。 */
export const imageTableCommand = $command("InsertDiagramCommand", (ctx) => () =>
  setBlockType(imageTableSpec.type(ctx), { identity: followMachineMarkRecognize() }),
);
