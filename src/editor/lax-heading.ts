
























































import { remarkStringifyOptionsCtx } from "@milkdown/kit/core";








type StringConvertOption = ReturnType<typeof remarkStringifyOptionsCtx._typeInfo>;

type textHandler = NonNullable<NonNullable<StringConvertOption["handlers"]>["text"]>;







const isConvertMeaningOfLineFirstHashNumber = /(^|\n)\\(#{1,6})(?=[^\s#])/g;







export function notConvertMeaningLineFirstHashNumber(source?: textHandler): textHandler {
  return (node, parent, state, info) => {
    if (!source) return node.value ?? "";
    return source(node, parent, state, info).replace(isConvertMeaningOfLineFirstHashNumber, "$1$2");
  };
}
