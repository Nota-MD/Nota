





















































































































import { remarkStringifyOptionsCtx } from "@milkdown/kit/core";


type StringConvertOption = ReturnType<typeof remarkStringifyOptionsCtx._typeInfo>;

type textHandler = NonNullable<NonNullable<StringConvertOption["handlers"]>["text"]>;


type MdastNode = {
  type: string;
  value?: string;
  children?: MdastNode[];
};








const isConvertMeaningOfLineFirstVerticalLine = /(^|\n)\\(\|)(?=[\t :-])/g;


const hardReplaceLine = "break";







const likeSeparatorLine = /^[\s|:-]*-[\s|:-]*$/;


export type BelowValueLineDetermineFixed =
  | { shape: "known"; line3: string }
  | { shape: "never a separator row" }
  | { shape: "uncertain" };







function meetingNotMeetingCrossLine(section: MdastNode): boolean {
  if (section.type === hardReplaceLine) return true;
  if ((section.value ?? "").includes("\n")) return true;
  return (section.children ?? []).some(meetingNotMeetingCrossLine);
}







export function tightConnectOfThatValueLine(node: MdastNode, parent: MdastNode | undefined): BelowValueLineDetermineFixed {
  const brotherBrother = parent?.children;
  if (!Array.isArray(brotherBrother)) return { shape: "uncertain" };
  let toDone = false;
  let localLineNotComplete = true;
  let output2 = "";
  for (const child2 of brotherBrother) {
    if (child2 === node) {
      toDone = true;
      continue;
    }
    if (!toDone) continue;
    if (child2.type === hardReplaceLine) {
      if (localLineNotComplete) {
        localLineNotComplete = false;
        output2 = "";
        continue;
      }
      return { shape: "known", line3: output2 };
    }
    if (child2.type !== "text") {


      if (localLineNotComplete) {
        if (meetingNotMeetingCrossLine(child2)) return { shape: "uncertain" };
        continue;
      }





      return { shape: "never a separator row" };
    }
    const value2 = child2.value ?? "";
    if (localLineNotComplete) {
      const breakValue = value2.indexOf("\n");
      if (breakValue < 0) continue;
      localLineNotComplete = false;
      const remaining = value2.slice(breakValue + 1);
      const againBreak = remaining.indexOf("\n");
      if (againBreak >= 0) return { shape: "known", line3: remaining.slice(0, againBreak) };
      output2 = remaining;
    } else {
      const breakValue = value2.indexOf("\n");
      if (breakValue >= 0) return { shape: "known", line3: output2 + value2.slice(0, breakValue) };
      output2 += value2;
    }
  }

  if (!toDone) return { shape: "uncertain" };


  return { shape: "known", line3: localLineNotComplete ? "" : output2 };
}






export function belowValueLineLikeSeparatorLine(node: MdastNode, parent: MdastNode | undefined): boolean | null {
  const determine = tightConnectOfThatValueLine(node, parent);
  if (determine.shape === "uncertain") return null;
  if (determine.shape === "never a separator row") return false;
  return likeSeparatorLine.test(determine.line3);
}







export function notConvertMeaningLineFirstVerticalLine(source?: textHandler): textHandler {
  return (node, parent, state, info) => {
    if (!source) return node.value ?? "";
    const output = source(node, parent, state, info);

    if (state.stack.includes("tableCell")) return output;
    if (!output.includes("\\|")) return output;
    const localLine = output.split("\n");


    if (localLine.length !== ((node as MdastNode).value ?? "").split("\n").length) return output;
    const parentNode = parent as MdastNode | undefined;
    return output.replace(isConvertMeaningOfLineFirstVerticalLine, (wholeString, before2: string, verticalLine: string, offset: number) => {


      const lineNumber = output.slice(0, offset + before2.length + 1).split("\n").length - 1;


      const localNodeInsideOfBelowValueLine = localLine[lineNumber + 1];
      const like = localNodeInsideOfBelowValueLine === undefined
        ? belowValueLineLikeSeparatorLine(node as MdastNode, parentNode)
        : likeSeparatorLine.test(localNodeInsideOfBelowValueLine);
      return like === false ? before2 + verticalLine : wholeString;
    });
  };
}
