/**
 * 把代码块拆回普通正文。
 *
 * 用户 2026-10-24 的约束是：光标停在代码框最开头按 Backspace，**只移除
 * 代码框标记，不丢内容**。Markdown 代码块是一整块文本，搬到正文时按行拆成
 * 段落；空行保留成空段落。这样一次事务就能撤销回原代码块。
 *
 * 这里只算节点，不碰 EditorView，便于在无 DOM 的测试里钉住“一个字都不丢”。
 */

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
