







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
      getContent: (node: Node, schema: Schema) => {
        const value = (node as HTMLElement).dataset.value ?? "";
        return value ? Fragment.from(schema.text(value)) : Fragment.empty;
      },
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
      const value = String(node.value ?? "");
      // Inline atoms must not close a nested parser node here: Milkdown clears
      // active marks after every closeNode. Closing math would split
      // `**a$x$b**` into `**a**$x$b`.
      state.addNode(
        type,
        undefined,
        value ? [state.schema.text(value)] : undefined,
      );
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


export const math = [remarkMathPlugin, katexOptionsCtx, mathInlineSchema, mathBlockSchema].flat();
