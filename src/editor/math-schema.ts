/**
 * 数学节点的轻量 schema。
 *
 * 这里只保留 Markdown ⇄ ProseMirror 的节点形状与 remark 转换，不引 KaTeX。
 * KaTeX 的 JS/CSS 由 `katex-runtime.ts` 在实际要画公式时动态加载，避免空白
 * 文档的冷启动先支付整套数学排版引擎。
 */

import { $ctx, $nodeSchema, $remark } from "@milkdown/kit/utils";
import { Fragment, type Schema } from "@milkdown/kit/prose/model";
import remarkMath from "remark-math";

const inlineName = "math_inline";
const blockName = "math_block";

export const katexOptionsCtx = $ctx({}, "katexOptions");

export const remarkMathPlugin = $remark("remarkMath", () => remarkMath);

export const mathInlineSchema = $nodeSchema(inlineName, () => ({
  group: "inline",
  content: "text*",
  inline: true,
  atom: true,
  parseDOM: [
    {
      tag: `span[data-type="${inlineName}"]`,
      getContent: (node: Node, schema: Schema) =>
        Fragment.from(schema.text((node as HTMLElement).dataset.value ?? "")),
    },
  ],
  toDOM: (node) => {
    const dom = document.createElement("span");
    dom.dataset.type = inlineName;
    dom.dataset.value = node.textContent;
    dom.textContent = node.textContent;
    return dom;
  },
  parseMarkdown: {
    match: (node) => node.type === "inlineMath",
    runner: (state, node, type) => {
      state.openNode(type).addText(String(node.value ?? "")).closeNode();
    },
  },
  toMarkdown: {
    match: (node) => node.type.name === inlineName,
    runner: (state, node) => {
      state.addNode("inlineMath", undefined, node.textContent);
    },
  },
}));

export const mathBlockSchema = $nodeSchema(blockName, () => ({
  content: "text*",
  group: "block",
  marks: "",
  defining: true,
  atom: true,
  isolating: true,
  attrs: {
    value: { default: "" },
  },
  parseDOM: [
    {
      tag: `div[data-type="${blockName}"]`,
      preserveWhitespace: "full" as const,
      getAttrs: (dom: HTMLElement) => ({ value: dom.dataset.value ?? "" }),
    },
  ],
  toDOM: (node) => {
    const dom = document.createElement("div");
    dom.dataset.type = blockName;
    dom.dataset.value = String(node.attrs.value ?? "");
    dom.textContent = String(node.attrs.value ?? "");
    return dom;
  },
  parseMarkdown: {
    match: (node) => node.type === "math",
    runner: (state, node, type) => {
      state.addNode(type, { value: node.value });
    },
  },
  toMarkdown: {
    match: (node) => node.type.name === blockName,
    runner: (state, node) => {
      state.addNode("math", undefined, String(node.attrs.value ?? ""));
    },
  },
}));

/** 与上游 `math` 导出的数组兼容；输入规则由本仓 `math-input.ts` 接管。 */
export const math = [remarkMathPlugin, katexOptionsCtx, mathInlineSchema, mathBlockSchema].flat();
