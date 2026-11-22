















































































































import { remarkStringifyOptionsCtx } from "@milkdown/kit/core";
import { $nodeSchema, $remark } from "@milkdown/kit/utils";
import { mathInlineSchema } from "./math-schema";
import { mathToMarkdown } from "mdast-util-math";








export const dollarCountAttribute = "dollars";







export type MathDelimiter = "dollar" | "paren" | "bracket";


export const mathDelimiterAttribute = "delimiter";


export function readMathDelimiter(holdHasActor: { attrs?: unknown; data?: unknown }): MathDelimiter {
  const alpha = (holdHasActor.attrs ?? {}) as Record<string, unknown>;
  const beta = (holdHasActor.data ?? {}) as Record<string, unknown>;
  const value2 = alpha[mathDelimiterAttribute] ?? beta[mathDelimiterAttribute];
  return value2 === "paren" || value2 === "bracket" ? value2 : "dollar";
}


export function mathDelimiterText(node: { attrs?: unknown; data?: unknown }, closing = false): string {
  const delimiter = readMathDelimiter(node);
  if (delimiter === "bracket") return closing ? "\\]" : "\\[";
  if (delimiter === "paren") return closing ? "\\)" : "\\(";
  return readDollarCount(node) >= 2 ? "$$" : "$";
}








export function numberOpenHeadDollarDollar(source3: string, start5: number): number {
  let n = 0;
  while (source3[start5 + n] === "$") n++;
  return n >= 2 ? 2 : 1;
}







export function readDollarCount(holdHasActor: { attrs?: unknown; data?: unknown }): number {
  const alpha = (holdHasActor.attrs ?? {}) as Record<string, unknown>;
  const beta = (holdHasActor.data ?? {}) as Record<string, unknown>;
  const value2 = alpha[dollarCountAttribute] ?? beta[dollarCountAttribute];
  return value2 === 2 ? 2 : 1;
}




type ConvertReplaceDeviceWorkFactory = Parameters<typeof $remark<"dollar delimiter count", undefined>>[1];



























export const markDollarDollarNumberPlugin: ReturnType<ConvertReplaceDeviceWorkFactory> = () => (tree, textItem) => {
  const source3 = typeof textItem?.value === "string" ? textItem.value : "";
  if (!source3) return;

  const walk = (node: (typeof tree)["children"][number]): void => {
    if (node.type === "inlineMath") {
      const start5 = node.position?.start?.offset;
      if (typeof start5 === "number") {
        const delimiter: MathDelimiter = source3.startsWith("\\[", start5)
          ? "bracket"
          : source3.startsWith("\\(", start5)
            ? "paren"
            : "dollar";
        node.data = {
          ...node.data,
          [dollarCountAttribute]: numberOpenHeadDollarDollar(source3, start5),
          [mathDelimiterAttribute]: delimiter,
        };
      }
    }


    if ("children" in node) for (const child2 of node.children ?? []) walk(child2);
  };

  for (const child2 of tree.children ?? []) walk(child2);
};


const markDollarDollarNumberWorkFactory: ConvertReplaceDeviceWorkFactory = () => markDollarDollarNumberPlugin;


export const markDollarDollarNumber = $remark("dollar delimiter count", markDollarDollarNumberWorkFactory);



type MdastMathNode = {
  type: string;
  value?: string;
  data?: Record<string, unknown>;
  children?: MdastMathNode[];
  position?: {
    start?: { offset?: number };
    end?: { offset?: number };
  };
};

function belongsToConvertMeaning(source3: string, index: number): boolean {
  let slash = 0;
  for (let i = index - 1; i >= 0 && source3[i] === "\\"; i--) slash++;
  return slash % 2 === 1;
}


function sourceTextValue(source3: string): string {
  return source3.replace(/\\([!-/:-@[-`{-~])/g, "$1");
}

function latexMathChildren(node: MdastMathNode, source3: string): MdastMathNode[] {
  const start5 = node.position?.start?.offset;
  const end = node.position?.end?.offset;
  if (typeof start5 !== "number" || typeof end !== "number") return [node];
  const raw = source3.slice(start5, end);
  const output2: MdastMathNode[] = [];
  let textStart = 0;
  let i = 0;

  while (i < raw.length - 1) {
    const opener = raw.slice(i, i + 2);
    if ((opener !== "\\(" && opener !== "\\[") || belongsToConvertMeaning(raw, i)) {
      i++;
      continue;
    }
    const closer = opener === "\\(" ? "\\)" : "\\]";
    let close = i + 2;
    while (close < raw.length - 1) {
      if (raw.slice(close, close + 2) === closer && !belongsToConvertMeaning(raw, close)) break;
      close++;
    }
    if (close >= raw.length - 1) break;

    if (i > textStart) output2.push({ type: "text", value: sourceTextValue(raw.slice(textStart, i)) });
    output2.push({
      type: "inlineMath",
      value: raw.slice(i + 2, close),
      data: {
        [dollarCountAttribute]: 1,
        [mathDelimiterAttribute]: opener === "\\(" ? "paren" : "bracket",
      },
      position: {
        start: { offset: start5 + i },
        end: { offset: start5 + close + 2 },
      },
    });
    i = close + 2;
    textStart = i;
  }

  if (!output2.length) return [node];
  if (textStart < raw.length) output2.push({ type: "text", value: sourceTextValue(raw.slice(textStart)) });
  return output2;
}








type LatexMathDelimiterWorkFactory = Parameters<
  typeof $remark<"latex-math-delimiters", undefined>
>[1];

export const latexMathDelimiterPlugin: ReturnType<LatexMathDelimiterWorkFactory> = () => (tree, textItem) => {
  const source3 = typeof textItem?.value === "string" ? textItem.value : "";
  if (!source3) return;
  const walk = (node: MdastMathNode): void => {
    if (node.type === "text") return;
    if (!node.children) return;
    node.children = node.children.flatMap((child2) =>
      child2.type === "text" ? latexMathChildren(child2, source3) : (walk(child2), [child2]),
    );
  };
  walk(tree as MdastMathNode);
};

const latexMathDelimiterWorkFactory: LatexMathDelimiterWorkFactory = () => latexMathDelimiterPlugin;


export const latexMathDelimiter = $remark("latex-math-delimiters", latexMathDelimiterWorkFactory);







































export const inlineMathSpec = $nodeSchema("math_inline", (ctx) => {
  mathInlineSchema.ctx(ctx);
  const original = ctx.get(mathInlineSchema.key)(ctx);
  return {
    ...original,
    attrs: {
      ...original.attrs,
      [dollarCountAttribute]: { default: 1 },
      [mathDelimiterAttribute]: { default: "dollar" },
    },
    parseMarkdown: {
      ...original.parseMarkdown,
      runner: (state, node, type) => {
        const value = String(node.value ?? "");
        // `closeNode()` resets every active mark in Milkdown's parser. Add the
        // inline atom directly so an enclosing strong/emphasis survives it.
        state.addNode(
          type,
          {
            [dollarCountAttribute]: readDollarCount({ data: node.data }),
            [mathDelimiterAttribute]: readMathDelimiter({ data: node.data }),
          },
          value ? [state.schema.text(value)] : undefined,
        );
      },
    },
    toMarkdown: {
      ...original.toMarkdown,
      runner: (state, node) => {
        state.addNode("inlineMath", undefined, node.textContent, {
          data: {
            [dollarCountAttribute]: readDollarCount(node),
            [mathDelimiterAttribute]: readMathDelimiter(node),
          },
        });
      },
    },
  };
});




type StringConvertOption = ReturnType<typeof remarkStringifyOptionsCtx._typeInfo>;

type InlinePlaceManageDevice = NonNullable<NonNullable<StringConvertOption["handlers"]>["inlineMath"]>;


const upstreamSingleDollarDollar = mathToMarkdown();

const upstreamDoubleDollarDollar = mathToMarkdown({ singleDollarTextMath: false });

const escapedDollarSentinel = "\uE000";

function maskEscapedDollars(value: string): string {
  let output2 = "";
  let slashes = 0;
  for (const character of value) {
    if (character === "\\") {
      slashes++;
      output2 += character;
      continue;
    }
    output2 += character === "$" && slashes % 2 === 1 ? escapedDollarSentinel : character;
    slashes = 0;
  }
  return output2;
}








export function inlineMathHandler(): InlinePlaceManageDevice {
  return (node, parent, state, info) => {
    const delimiter = readMathDelimiter(node);
    const value2 = String(node.value ?? "");
    if (delimiter === "paren") return `\\(${value2}\\)`;
    if (delimiter === "bracket") return `\\[${value2}\\]`;
    const single = readDollarCount(node) < 2;
    const select = single ? upstreamSingleDollarDollar : upstreamDoubleDollarDollar;
    const placeManage = select.handlers?.inlineMath;
    if (!placeManage) return "";
    if (!single) return placeManage(node, parent, state, info);

    const maskedValue = maskEscapedDollars(value2);
    if (maskedValue === value2) return placeManage(node, parent, state, info);
    const maskedNode = { ...node, value: maskedValue };
    return placeManage(maskedNode, parent, state, info).replaceAll(escapedDollarSentinel, "$");
  };
}








































































type textHandler = NonNullable<NonNullable<StringConvertOption["handlers"]>["text"]>;


type MdastNode = { type: string; value?: string; children?: MdastNode[] };


const recognizeObtainOfParent = new Set(["paragraph", "heading", "tableCell"]);








export function countDollars(item3: unknown): number {
  if (typeof item3 === "string") return item3.split("$").length - 1;
  if (Array.isArray(item3)) return item3.reduce<number>((and, token) => and + countDollars(token), 0);
  if (item3 && typeof item3 === "object") {
    const section = item3 as { type?: string };
    let and = 0;
    for (const value2 of Object.values(item3)) and += countDollars(value2);
    if (section.type === "inlineMath") and += 2 * readDollarCount(item3 as { attrs?: unknown; data?: unknown });
    return and;
  }
  return 0;
}


const isConvertMeaningOfDollarDollar = /(^|[^\\])\\\$/g;






export function notConvertMeaningDollarDollar(source?: textHandler): textHandler {
  return (node, parent, state, info) => {
    if (!source) return node.value ?? "";
    const output = source(node, parent, state, info);
    if (!output.includes("\\$")) return output;
    const parentNode = parent as MdastNode | undefined;
    if (!parentNode || !recognizeObtainOfParent.has(parentNode.type)) return output;
    const children = parentNode.children ?? [];
    const index = children.indexOf(node as MdastNode);
    const previous = index > 0 ? children[index - 1] : undefined;
    const next = index >= 0 ? children[index + 1] : undefined;
    const htmlWrappedDollar =
      String((node as MdastNode).value ?? "").trim() === "$" &&
      previous?.type === "html" &&
      next?.type === "html" &&
      /^<[A-Za-z][^>]*>$/.test(String(previous.value ?? "").trim()) &&
      /^<\//.test(String(next.value ?? "").trim());
    if (htmlWrappedDollar) return output.replace(isConvertMeaningOfDollarDollar, "$1$");
    if (countDollars(parentNode.children) !== countDollars((node as MdastNode).value)) return output;
    return output.replace(isConvertMeaningOfDollarDollar, "$1$");
  };
}
