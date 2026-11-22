




















































































import { $inputRule, $prose } from "@milkdown/kit/utils";
import { InputRule } from "@milkdown/kit/prose/inputrules";
import type { NodeType } from "@milkdown/kit/prose/model";
import type { EditorState, Transaction } from "@milkdown/kit/prose/state";
import { NodeSelection, Plugin, PluginKey } from "@milkdown/kit/prose/state";
import type { EditorView } from "@milkdown/kit/prose/view";
import { mathBlockSchema, mathInlineSchema } from "./math-schema";

import {
  dollarCountAttribute,
  mathDelimiterAttribute,
  type MathDelimiter,
} from "./math-delim";
import { inlineMathFocusRequest } from "./math-current";






export const singleDollarDollar = /(?:\$)([^$]+)(?:\$)$/;


export const doubleDollarDollar = /\$\$([^$]+)\$\$$/;


export const latexParenMath = /\\\(([\s\S]*?)\\\)$/;


export const latexBracketMath = /\\\[([\s\S]*?)\\\]$/;










export function shouldChangeCommonStyle(before2: string): boolean {
  return before2 !== "$";
}

export interface MathAroundCursor {
  source: string;
  start: number;
  end: number;
  dollars: number;
  delimiter: MathDelimiter;
}

function escapedAt(text: string, index: number): boolean {
  let slashes = 0;
  for (let cursor = index - 1; cursor >= 0 && text[cursor] === "\\"; cursor--) {
    slashes += 1;
  }
  return slashes % 2 === 1;
}

/** Recognize a formula whose closing delimiter is to the right of the caret. */
export function mathSourceAroundCursor(
  text: string,
  cursor: number,
): MathAroundCursor | null {
  const right = text.slice(cursor);
  const left = text.slice(0, cursor);
  const closes: Array<{
    close: string;
    open: string;
    delimiter: MathDelimiter;
    dollars: number;
  }> = [
    { close: "$$", open: "$$", delimiter: "dollar", dollars: 2 },
    { close: "$", open: "$", delimiter: "dollar", dollars: 1 },
    { close: "\\)", open: "\\(", delimiter: "paren", dollars: 1 },
    { close: "\\]", open: "\\[", delimiter: "bracket", dollars: 1 },
  ];
  for (const candidate of closes) {
    if (!right.startsWith(candidate.close)) continue;
    const start = left.lastIndexOf(candidate.open);
    if (start < 0 || start + candidate.open.length >= cursor) continue;
    if (escapedAt(text, start)) continue;
    const source3 = text.slice(start + candidate.open.length, cursor);
    if (!source3) continue;
    return {
      source: source3,
      start,
      end: cursor + candidate.close.length,
      dollars: candidate.dollars,
      delimiter: candidate.delimiter,
    };
  }
  return null;
}








function previousChar(state: EditorState, start: number): string {
  if (state.doc.resolve(start).parentOffset === 0) return "";
  return state.doc.textBetween(start - 1, start);
}














function replaceBecomeCommonStyle(
  spec: NodeType,
  state: EditorState,
  start5: number,
  end: number,
  source3: string,
  dollarDollar: number,
  delimiter: MathDelimiter = "dollar",
): Transaction | null {
  const node = spec.createAndFill({
    [dollarCountAttribute]: dollarDollar,
    [mathDelimiterAttribute]: delimiter,
  });
  if (!node) return null;
  const tr = state.tr.replaceRangeWith(start5, end, node);
  tr.insertText(source3, start5 + 1);
  tr.setMeta(inlineMathFocusRequest, start5);
  return tr;
}








export const commonStyleInput = [
  $inputRule((ctx) =>
    new InputRule(latexBracketMath, (state, match, start, end) =>
      replaceBecomeCommonStyle(mathInlineSchema.type(ctx), state, start, end, match[1] ?? "", 1, "bracket"),
    ),
  ),
  $inputRule((ctx) =>
    new InputRule(latexParenMath, (state, match, start, end) =>
      replaceBecomeCommonStyle(mathInlineSchema.type(ctx), state, start, end, match[1] ?? "", 1, "paren"),
    ),
  ),
  $inputRule((ctx) =>
    new InputRule(doubleDollarDollar, (state, match, start, end) =>
      replaceBecomeCommonStyle(mathInlineSchema.type(ctx), state, start, end, match[1] ?? "", 2, "dollar"),
    ),
  ),
  $inputRule((ctx) =>
    new InputRule(singleDollarDollar, (state, match, start, end) =>
      shouldChangeCommonStyle(previousChar(state, start))
        ? replaceBecomeCommonStyle(mathInlineSchema.type(ctx), state, start, end, match[1] ?? "", 1, "dollar")
        : null,
    ),
  ),
];







export function completeInlineMathAtCursor(state: EditorState, spec: NodeType): Transaction | null {
  const { empty, $from } = state.selection;
  if (!empty || !$from.parent.inlineContent) return null;
  if ($from.marks().some((mark) => mark.type.spec.code)) return null;
  for (let depth = $from.depth - 1; depth > 0; depth--) {
    if ($from.node(depth).type.spec.code) return null;
  }

  const before2 = $from.parent.textBetween(0, $from.parentOffset, "\n", "\n");
  let source3 = "";
  let dollars = 0;
  let delimiter: MathDelimiter = "dollar";
  let startInParagraph = -1;

  const latexBracket = latexBracketMath.exec(before2);
  const latexParen = latexParenMath.exec(before2);
  const double = doubleDollarDollar.exec(before2);
  if (latexBracket?.index !== undefined) {
    source3 = latexBracket[1] ?? "";
    dollars = 1;
    delimiter = "bracket";
    startInParagraph = latexBracket.index;
  } else if (latexParen?.index !== undefined) {
    source3 = latexParen[1] ?? "";
    dollars = 1;
    delimiter = "paren";
    startInParagraph = latexParen.index;
  } else if (double?.index !== undefined) {
    source3 = double[1] ?? "";
    dollars = 2;
    delimiter = "dollar";
    startInParagraph = double.index;
  } else {
    const single = singleDollarDollar.exec(before2);
    if (
      single?.index !== undefined &&
      shouldChangeCommonStyle(startInParagraph === 0 ? "" : before2[single.index - 1] ?? "")
    ) {
      source3 = single[1] ?? "";
      dollars = 1;
      delimiter = "dollar";
      startInParagraph = single.index;
    }
  }
  if (startInParagraph < 0) {
    const whole = $from.parent.textBetween(
      0,
      $from.parent.content.size,
      "\n",
      "\n",
    );
    const around = mathSourceAroundCursor(whole, $from.parentOffset);
    if (!around) return null;
    return replaceBecomeCommonStyle(
      spec,
      state,
      $from.start() + around.start,
      $from.start() + around.end,
      around.source,
      around.dollars,
      around.delimiter,
    );
  }

  const start5 = $from.start() + startInParagraph;
  const end = $from.start() + $from.parentOffset;
  return replaceBecomeCommonStyle(spec, state, start5, end, source3, dollars, delimiter);
}

export const commonStyleCommit = $prose(
  (ctx) =>
    new Plugin({
      key: new PluginKey("nota-math-inline-commit"),
      appendTransaction: (transactions, _oldState, newState) => {
        if (!transactions.some((tr) => tr.docChanged)) return null;
        return completeInlineMathAtCursor(newState, mathInlineSchema.type(ctx));
      },
    }),
);












export const emptyBlockHeader = /^\$\$\s*$/;




























export function returnCarBecomeCommonStyleBlock(view: EditorView, blockType: NodeType): boolean {
  if (!view.editable) return false;

  const { state } = view;
  const { $from, empty } = state.selection;
  if (!empty) return false;

  const paragraph2 = $from.parent;
  if (paragraph2.type.name !== "paragraph") return false;

  for (let d = $from.depth - 1; d > 0; d--) {
    const name3 = $from.node(d).type.name;
    if (name3 === "table_cell" || name3 === "table_header") return false;
  }

  if (!emptyBlockHeader.test(paragraph2.textContent)) return false;


  if ($from.parentOffset !== paragraph2.content.size) return false;

  const emptyBlock = blockType.createAndFill({ value: "" });
  if (!emptyBlock) return false;

  const start5 = $from.before($from.depth);
  const tr = state.tr.replaceWith(start5, start5 + paragraph2.nodeSize, emptyBlock);
  tr.setSelection(NodeSelection.create(tr.doc, start5));
  tr.scrollIntoView();
  view.dispatch(tr);
  return true;
}

















export const commonStyleBlockReturnCar = $prose(
  (ctx) =>
    new Plugin({
      key: new PluginKey("nota-math-block-on-enter"),
      props: {
        handleKeyDown: (view, event) => {
          if (
            event.key !== "Enter" ||
            event.shiftKey ||
            event.ctrlKey ||
            event.metaKey ||
            event.altKey ||
            view.composing
          ) {
            return false;
          }
          return returnCarBecomeCommonStyleBlock(view, mathBlockSchema.type(ctx));
        },
      },
    }),
);
