









import type { Node as PMNode, Schema } from "@milkdown/kit/prose/model";

export function liftCodeBlockToParagraphs(block: PMNode, schema: Schema): PMNode[] | null {
  if (block.type.name !== "code_block") return null;
  const paragraphType = schema.nodes.paragraph;
  if (!paragraphType) return null;

  return block.textContent.split("\n").map((line3) => {
    const text3 = line3 ? schema.text(line3) : null;
    return paragraphType.create(null, text3);
  });
}
