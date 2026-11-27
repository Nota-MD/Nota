














































import type { MilkdownPlugin } from "@milkdown/kit/ctx";
import type { MarkdownNode, ParserState, SerializerState } from "@milkdown/kit/transformer";
import type { Node as PMNode } from "@milkdown/kit/prose/model";
import { $nodeSchema, $remark } from "@milkdown/kit/utils";
import { debugEvent } from "@/ui/debug-log";
import { imageFromHtmlOnly } from "./image-attrs";










export const blockHtmlNodeName = "notaHtmlBlock";










export const blockLevelContainer: ReadonlySet<string> = new Set([
  "root",
  "blockquote",
  "listItem",
  "footnoteDefinition",
]);








export function isNoteRelease(value2: string): boolean {
  return /^\s*<!--/.test(value2);
}









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













export function blockHTMLConvertReplace(tree: MarkdownNode): void {
  const walk = (node: MarkdownNode): void => {
    const child = node.children;
    if (!Array.isArray(child)) return;
    const children = child as MarkdownNode[];
    for (const [index, value] of children.entries()) {
      const imageValue =
        value.type === "html" && typeof value.value === "string"
          ? imageFromHtmlOnly(value.value)
          : null;
      if (imageValue) {
        const image = {
          type: "image",
          url: imageValue.src,
          alt: imageValue.alt,
          title: imageValue.title,
          zoom: imageValue.zoom,
          syntax: "markdown",
        };
        children[index] =
          node.type === "root" ? { type: "paragraph", children: [image] } : image;
        continue;
      }
      if (
        value.type === "html" &&
        typeof value.value === "string" &&
        blockLevelContainer.has(node.type) &&
        imageFromHtmlOnly(value.value) === null
      ) {
        value.type = blockHtmlNodeName;
      } else if (blockLevelContainer.has(node.type)) {
        const paragraphSource = pureHTMLParagraphSource(value);
        if (paragraphSource !== null) {
          const imageValue = imageFromHtmlOnly(paragraphSource);
          if (imageValue) {
            const image = {
              type: "image",
              url: imageValue.src,
              alt: imageValue.alt,
              title: imageValue.title,
              zoom: imageValue.zoom,
              syntax: "markdown",
            };
            children[index] =
              node.type === "root"
                ? { type: "paragraph", children: [image] }
                : image;
            continue;
          }
          value.type = blockHtmlNodeName;
          value.value = paragraphSource;
          delete value.children;
        }
      }


      walk(value);
    }
  };
  walk(tree);
}


type ConvertReplaceDeviceWorkFactory = Parameters<typeof $remark<"nota HTML block", undefined>>[1];











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
  return $remark("nota HTML block", workFactory);
}




interface BlockAttribute {
  value: string;
}
















export const blockHTMLSpec = $nodeSchema(blockHtmlNodeName, () => ({
  group: "block",
  atom: true,
  defining: true,
  attrs: { value: { default: "", validate: "string" } },





  parseDOM: [
    {
      tag: "div[data-type='html-block']",
      getAttrs: (dom: HTMLElement | string) => ({
        value: typeof dom === "string" ? "" : (dom.dataset.value ?? ""),
      }),
    },
  ],




  toDOM: (node: PMNode) => {
    const value2 = (node.attrs as BlockAttribute).value;
    return [
      "div",
      {
        "data-type": "html-block",
        "data-value": value2,

        ...(isNoteRelease(value2) ? { "data-comment": "true" } : {}),
      },
      value2,
    ] as const;
  },
  parseMarkdown: {
    match: ({ type }: MarkdownNode) => type === blockHtmlNodeName,
    runner: (state: ParserState, node: MarkdownNode, type: unknown) => {





      state.addNode(type as never, { value: node.value ?? "" });
    },
  },
  toMarkdown: {
    match: (node: PMNode) => node.type.name === blockHtmlNodeName,
    runner: (state: SerializerState, node: PMNode) => {



      state.addNode("html", undefined, (node.attrs as BlockAttribute).value);
    },
  },
}));







blockHTMLSpec.node.id = blockHtmlNodeName;

















export const blockHTMLSpecPlugin: MilkdownPlugin[] = [
  blockHTMLSpec.ctx as unknown as MilkdownPlugin,
  blockHTMLSpec[1],
];
