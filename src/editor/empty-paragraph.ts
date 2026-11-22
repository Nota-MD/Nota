

















































































































import { nodesCtx } from "@milkdown/kit/core";
import { paragraphSchema } from "@milkdown/kit/preset/commonmark";
import { $nodeSchema } from "@milkdown/kit/utils";









export const paragraphWithoutBlankLine = paragraphSchema.extendSchema(
  (aboveValueVersion) => (ctx) => {
    const original = aboveValueVersion(ctx);
    return {
      ...original,
      toMarkdown: {
        ...original.toMarkdown,
        runner: (state, node) => {
          // Skip empty root paragraphs and table cells. List items and
          // blockquotes still need their paragraph node for structural output.


          const parentType = (
            state as unknown as { top?: () => { type?: string } | undefined }
          ).top?.()?.type;
          if (
            (parentType === "root" || parentType === "tableCell") &&
            (!node.content || node.content.size === 0)
          ) {
            return;
          }
          return original.toMarkdown.runner(state, node);
        },
      },
    };
  },
);






































export const documentMustNotExportEmptyRoot = $nodeSchema("doc", (ctx) => {
  const upstream = ctx.get(nodesCtx).find(([id]) => id === "doc")?.[1];
  if (!upstream) {


    throw new Error("[nota] Refusing to export an empty root: the registry has no doc node");
  }


  type SerializeState = Parameters<typeof upstream.toMarkdown.runner>[0];
  type documentNode = Parameters<typeof upstream.toMarkdown.runner>[1];


  const allParagraphsEmpty = (doc: documentNode): boolean => {
    if (doc.content.size === 0) return true;
    let allEmpty = true;
    doc.content.forEach((block) => {
      if (block.type.name !== "paragraph" || block.content.size !== 0) allEmpty = false;
    });
    return allEmpty;
  };

  return {
    ...upstream,
    toMarkdown: {
      ...upstream.toMarkdown,
      runner: (state: SerializeState, node: documentNode) => {



        state.openNode("root");
        if (!allParagraphsEmpty(node)) {
          state.next(node.content);
          return;
        }








        state.addNode("html", undefined, "");
      },
    },
  };
});
