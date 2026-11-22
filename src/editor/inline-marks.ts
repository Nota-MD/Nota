















































































import { remarkStringifyOptionsCtx } from "@milkdown/kit/core";
import type { Ctx } from "@milkdown/kit/ctx";
import { remarkGFMPlugin } from "@milkdown/kit/preset/gfm";
import type { MilkdownPlugin } from "@milkdown/kit/ctx";
import { $command, $inputRule, $markSchema, $remark } from "@milkdown/kit/utils";
import { markRule } from "@milkdown/kit/prose";
import { toggleMark } from "@milkdown/kit/prose/commands";
import type { MarkdownNode, ParserState, SerializerState } from "@milkdown/kit/transformer";
import type { MarkType } from "@milkdown/kit/prose/model";




export type MarkNodeName =
  | "notaHighlight"
  | "notaSuperscript"
  | "notaSubscript"
  | "notaUnderline"
  | "notaKbd";















interface MarkSpec {

  label: string;













  htmlLabel: string;

  mdast: MarkNodeName;

  left: string;

  right: string;





  correctRule: RegExp;

  settingKey: keyof InlineExtensionFlags | null;
}






export const markTable: readonly MarkSpec[] = [
  {
    label: "highlight",
    htmlLabel: "mark",
    mdast: "notaHighlight",
    left: "==",
    right: "==",

    correctRule: /==(?=\S)([^=\n]*?\S)==/y,
    settingKey: "highlight",
  },
  {
    label: "superscript",
    htmlLabel: "sup",
    mdast: "notaSuperscript",
    left: "^",
    right: "^",
    correctRule: /\^(?=\S)([^\^\n]*?\S)\^/y,
    settingKey: "superscript",
  },
  {
    label: "subscript",
    htmlLabel: "sub",
    mdast: "notaSubscript",
    left: "~",
    right: "~",





    correctRule: /(?<!~)~(?=\S)([^~\n]*?\S)~(?!~)/y,
    settingKey: "subscript",
  },
  {
    label: "underline",
    htmlLabel: "u",
    mdast: "notaUnderline",
    left: "<u>",
    right: "</u>",





    correctRule: /<u>(?=\S)([^<\n]*?\S)<\/u>/y,
    settingKey: null,
  },
  {
    label: "kbd",
    htmlLabel: "kbd",
    mdast: "notaKbd",
    left: "<kbd>",
    right: "</kbd>",
    correctRule: /<kbd>(?=\S)([^<\n]*?\S)<\/kbd>/y,
    settingKey: null,
  },
];


export function pressLabelCheck(label: string): MarkSpec | undefined {
  return markTable.find((value) => value.label === label);
}




















export interface InlineExtensionFlags {
  highlight: boolean;
  superscript: boolean;
  subscript: boolean;
}









export const DefaultInlineExtensionFlags: InlineExtensionFlags = {
  highlight: true,
  superscript: true,
  subscript: true,
};


type StringConvertOption = ReturnType<typeof remarkStringifyOptionsCtx._typeInfo>;










type PlaceManageDevice = NonNullable<NonNullable<StringConvertOption["handlers"]>["text"]>;

type ConvertReplaceDeviceWorkFactory = Parameters<typeof $remark<"inline marks", undefined>>[1];




export interface fragment {
  type?: MarkNodeName;
  text4?: string;
  children?: fragment[];
}
















export function splitText(text4: string, want: ReadonlySet<MarkNodeName>): fragment[] | null {
  let output2: fragment[] | null = null;
  let pendingSplit = 0;
  let i = 0;

  while (i < text4.length) {
    let middleDone: { spec: MarkSpec; to2: number; content: string } | null = null;
    for (const spec of markTable) {

      if (spec.settingKey === null || !want.has(spec.mdast)) continue;
      spec.correctRule.lastIndex = i;
      const m = spec.correctRule.exec(text4);
      if (m) {
        middleDone = { spec, to2: spec.correctRule.lastIndex, content: m[1] ?? "" };
        break;
      }
    }

    if (!middleDone) {
      i++;
      continue;
    }

    output2 ??= [];
    if (i > pendingSplit) output2.push({ text4: text4.slice(pendingSplit, i) });
    output2.push({
      type: middleDone.spec.mdast,
      children: splitText(middleDone.content, want) ?? [{ text4: middleDone.content }],
    });
    i = middleDone.to2;
    pendingSplit = i;
  }

  if (output2 && pendingSplit < text4.length) output2.push({ text4: text4.slice(pendingSplit) });
  return output2;
}




function createNode(slice: fragment): MarkdownNode {
  if (slice.type) {
    return {
      type: slice.type,
      children: (slice.children ?? []).map(createNode),
    } as unknown as MarkdownNode;
  }
  return { type: "text", value: slice.text4 ?? "" };
}


interface HasChild extends MarkdownNode {
  children: MarkdownNode[];
}

function isContainer(section: MarkdownNode): section is HasChild {
  return Array.isArray((section as HasChild).children);
}









function readValue(section: MarkdownNode): string {
  return typeof section.value === "string" ? section.value : "";
}


function plainText2(section: MarkdownNode): string {
  if (section.type === "text") return readValue(section);
  const children = (section as HasChild).children;
  if (!Array.isArray(children)) return "";
  return children.map(plainText2).join("");
}






























const blockLevelNode: ReadonlySet<string> = new Set([
  "paragraph",
  "heading",
  "blockquote",
  "list",
  "listItem",
  "code",
  "thematicBreak",
  "table",
  "tableRow",
  "tableCell",
  "footnoteDefinition",
  "definition",
  "yaml",
]);

function andBelowDrawLine(child: MarkdownNode[]): MarkdownNode[] {
  const output2: MarkdownNode[] = [];
  let i = 0;
  while (i < child.length) {
    const head2 = child[i]!;
    const htmlSpec = markTable.find(
      (spec) =>
        spec.left.startsWith("<") &&
        head2.type === "html" &&
        new RegExp(`^${escapeRegExp(spec.left)}\\s*$`, "i").test(
          readValue(head2),
        ),
    );
    if (htmlSpec) {
      let j = i + 1;
      let findActive = -1;
      for (; j < child.length; j++) {
        const value = child[j]!;
        if (
          value.type === "html" &&
          new RegExp(`^${escapeRegExp(htmlSpec.right)}\\s*$`, "i").test(
            readValue(value),
          )
        ) {
          findActive = j;
          break;
        }

        if (blockLevelNode.has(value.type)) break;
      }
      if (findActive > i + 1) {
        const middle = child.slice(i + 1, findActive);
        output2.push({
          type: htmlSpec.mdast,
          children: middle,
        } as unknown as MarkdownNode);
        i = findActive + 1;
        continue;
      }
    }
    output2.push(head2);
    i++;
  }
  return output2;
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}


function heavyWrite(child: MarkdownNode[], want: ReadonlySet<MarkNodeName>): MarkdownNode[] {
  const output2: MarkdownNode[] = [];
  for (const child2 of child) {
    if (child2.type === "text") {
      const slice = splitText(readValue(child2), want);
      if (slice) {
        for (const value of slice) output2.push(createNode(value));
        continue;
      }
      output2.push(child2);
      continue;
    }
    if (isContainer(child2)) child2.children = heavyWrite(child2.children, want);
    output2.push(child2);
  }
  return andBelowDrawLine(output2);
}









export function inlineMarkTransformer(flag: InlineExtensionFlags) {
  const want = new Set<MarkNodeName>(
    markTable
      .filter((value) => value.settingKey === null || flag[value.settingKey])
      .map((value) => value.mdast),
  );
  return (tree: MarkdownNode): void => {
    tree.children = heavyWrite(tree.children ?? [], want);
  };
}










export function inlineMarkParse(flag: InlineExtensionFlags) {






  const convertReplaceDevicePlugin: ReturnType<ConvertReplaceDeviceWorkFactory> = () => (tree, file) => {
    void file;
    // CommonMark/GFM already applied the standard left/right-flanking
    // delimiter-run algorithm while parsing. Keep that tree intact instead of
    // replacing it with an editor-specific nearest-delimiter interpretation.
    inlineMarkTransformer(flag)(tree as MarkdownNode);
  };
  const workFactory: ConvertReplaceDeviceWorkFactory = () => convertReplaceDevicePlugin;
  return $remark("inline marks", workFactory);
}




function createSpec(value: MarkSpec) {
  return {
    parseDOM: [{ tag: value.htmlLabel }],
    toDOM: () => [value.htmlLabel, 0] as [string, 0],
    parseMarkdown: {
      match: (node: MarkdownNode) => node.type === value.mdast,
      runner: (state: ParserState, node: MarkdownNode, type: MarkType) => {
        state.openMark(type);
        state.next(node.children);
        state.closeMark(type);
      },
    },
    toMarkdown: {
      match: (mark: { type: { name: string } }) => mark.type.name === value.label,
      runner: (state: SerializerState, mark: unknown) => {
        state.withMark(mark as never, value.mdast);
      },
    },
  };
}

export const highlightSpec = $markSchema("highlight", () => createSpec(markTable[0]!));
export const superscriptSpec = $markSchema("superscript", () => createSpec(markTable[1]!));
export const subscriptSpec = $markSchema("subscript", () => createSpec(markTable[2]!));
export const underlineSpec = $markSchema("underline", () => createSpec(markTable[3]!));
export const kbdSpec = $markSchema("kbd", () => createSpec(markTable[4]!));





export const inlineMarkSpec = [highlightSpec, superscriptSpec, subscriptSpec, underlineSpec, kbdSpec];
































export const inlineMarkSpecPlugin = inlineMarkSpec.flat() as unknown as MilkdownPlugin[];


export const inlineMarkCommand = [
  $command("ToggleHighlight", (ctx) => () => toggleMark(highlightSpec.type(ctx))),
  $command("ToggleSuperscript", (ctx) => () => toggleMark(superscriptSpec.type(ctx))),
  $command("ToggleSubscript", (ctx) => () => toggleMark(subscriptSpec.type(ctx))),
  $command("ToggleUnderline", (ctx) => () => toggleMark(underlineSpec.type(ctx))),
  $command("ToggleKbd", (ctx) => () => toggleMark(kbdSpec.type(ctx))),
];


export const commandNameTable: Record<string, string> = {
  highlight: "ToggleHighlight",
  superscript: "ToggleSuperscript",
  subscript: "ToggleSubscript",
  underline: "ToggleUnderline",
  kbd: "ToggleKbd",
};














export function inlineMarkInputRuleRule(flag: InlineExtensionFlags) {
  return markTable
    .filter((value) => value.settingKey === null || flag[value.settingKey])
    .map((value) =>
      $inputRule((ctx) => {
        const type =
          value.label === "highlight"
            ? highlightSpec.type(ctx)
            : value.label === "superscript"
              ? superscriptSpec.type(ctx)
              : value.label === "subscript"
                ? subscriptSpec.type(ctx)
                : value.label === "underline"
                  ? underlineSpec.type(ctx)
                  : kbdSpec.type(ctx);
        const source3 = value.correctRule.source.replace(/\$$/, "");
        return markRule(new RegExp(`${source3}$`), type);
      }),
    );
}






















function createPlaceManageDevice(value: MarkSpec): PlaceManageDevice {
  return (node, _Parent, state, info) => {
    const tracker = state.createTracker(info);
    const enterStack = state.enter as unknown as (name3: string) => () => void;
    const exit = enterStack(value.mdast);
    let value2 = tracker.move(value.left);
    value2 += state.containerPhrasing(node, {
      ...tracker.current(),
      before: value2,
      after: value.right[0] ?? " ",
    });
    value2 += tracker.move(value.right);
    exit();
    return value2;
  };
}








export function inlineMarkHandler(): Record<string, PlaceManageDevice> {
  const output2: Record<string, PlaceManageDevice> = {};
  for (const value of markTable) output2[value.mdast] = createPlaceManageDevice(value);
  return output2;
}




type textHandler = NonNullable<NonNullable<StringConvertOption["handlers"]>["text"]>;









const isConvertMeaningOfLineFirstEqualNumber = /(^|\n)\\(==(?=\S)[^=\n]*?\S==)/g;
































export function notConvertMeaningLineFirstEqualNumber(source?: textHandler): textHandler {
  return (node, parent, state, info) => {
    if (!source) return node.value ?? "";
    return source(node, parent, state, info).replace(isConvertMeaningOfLineFirstEqualNumber, "$1$2");
  };
}






























































export const gFMOption = { singleTilde: false };
















export function closeSingleWaveWaveNumberRemoveRemoveLine(ctx: Ctx): void {


  ctx.update(remarkGFMPlugin.options.key, (prev) => ({ ...(prev ?? {}), ...gFMOption }));
}







const belowMarkLanguageMethod = new RegExp(markTable[2]!.correctRule.source);


function pasteEdgeHasWaveWaveNumberFixedBoundarySymbol(parent: unknown, node: MarkdownNode, getPrevious: boolean): boolean {
  const children = (parent as HasChild | undefined)?.children;
  if (!Array.isArray(children)) return false;
  const i = children.indexOf(node);
  if (i < 0) return false;
  const neighbor = children[getPrevious ? i - 1 : i + 1];
  return neighbor?.type === markTable[2]!.mdast;
}


function parentIsWaveWaveNumberMark(parent: unknown): boolean {
  return (parent as MarkdownNode | undefined)?.type === markTable[2]!.mdast;
}
























































export function notConvertMeaningIsolatedStandaloneWaveWaveNumber(source?: textHandler): textHandler {
  return (node, parent, state, info) => {
    if (!source) return node.value ?? "";
    const output2 = source(node, parent, state, info);
    if (!output2.includes("\\~")) return output2;
    const withoutConvertMeaning = output2.replace(/\\~/g, "~");
    if (withoutConvertMeaning.includes("~~") || belowMarkLanguageMethod.test(withoutConvertMeaning)) return output2;
    const twoHeadOtherHasFixedBoundarySymbol = parentIsWaveWaveNumberMark(parent);
    if (withoutConvertMeaning.startsWith("~") && (twoHeadOtherHasFixedBoundarySymbol || pasteEdgeHasWaveWaveNumberFixedBoundarySymbol(parent, node, true))) return output2;
    if (withoutConvertMeaning.endsWith("~") && (twoHeadOtherHasFixedBoundarySymbol || pasteEdgeHasWaveWaveNumberFixedBoundarySymbol(parent, node, false))) return output2;
    return withoutConvertMeaning;
  };
}


export { plainText2 as readPlainText };
