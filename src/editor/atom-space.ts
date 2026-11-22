

































































































































import { remarkStringifyOptionsCtx } from "@milkdown/kit/core";





export const Nbsp = "\u00a0";








type StringConvertOption = ReturnType<typeof remarkStringifyOptionsCtx._typeInfo>;

type textHandler = NonNullable<NonNullable<StringConvertOption["handlers"]>["text"]>;


interface MdastNode {
  type?: string;
  value?: string;
  children?: MdastNode[];
}





















const inlineAtom = new Set(["inlineMath", "image", "break"]);










export function ReplaceNbspAfterInlineAtom(value2: string, beforeValueBrotherBrotherType: string | undefined): string {
  if (
    value2.startsWith(Nbsp) &&
    beforeValueBrotherBrotherType !== undefined &&
    inlineAtom.has(beforeValueBrotherBrotherType)
  ) {
    return " " + value2.slice(Nbsp.length);
  }
  return value2;
}







function beforeValueBrotherBrotherType(node: MdastNode, parent: MdastNode | undefined): string | undefined {
  const brotherBrother = parent?.children;
  if (!Array.isArray(brotherBrother)) return undefined;
  const position3 = brotherBrother.indexOf(node);
  if (position3 <= 0) return undefined;
  return brotherBrother[position3 - 1]?.type;
}












export function SpaceAfterAtom(source?: textHandler): textHandler {
  return (node, parent, state, info) => {
    if (!source) return node.value ?? "";
    const value2 = node.value ?? "";
    const newValueValue = ReplaceNbspAfterInlineAtom(
      value2,
      beforeValueBrotherBrotherType(node as MdastNode, parent as MdastNode | undefined),
    );


    if (newValueValue === value2) return source(node, parent, state, info);
    return source({ ...node, value: newValueValue }, parent, state, info);
  };
}
