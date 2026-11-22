




























































import { $inputRule, $prose } from "@milkdown/kit/utils";
import { InputRule } from "@milkdown/kit/prose/inputrules";
import {
  Plugin,
  PluginKey,
  type EditorState,
} from "@milkdown/kit/prose/state";
import { Decoration, DecorationSet } from "@milkdown/kit/prose/view";
import type { Node as PMNode } from "@milkdown/kit/prose/model";




export type PunctuationTimeMachine = "off" | "render" | "input";


export type ReferenceNumberCharacterShape = "curly" | "straight";


export type DashWindCell = "en-em" | "em";





export interface punctuationSettings {
  mode2: PunctuationTimeMachine;
  referenceNumber: boolean;

  doubleReferenceNumber: ReferenceNumberCharacterShape;

  singleReferenceNumber: ReferenceNumberCharacterShape;
  dash: boolean;
  windCell: DashWindCell;









  saveOmitNumber: boolean;
}


export const DefaultPunctuationSettings: punctuationSettings = {
  mode2: "input",
  referenceNumber: true,
  doubleReferenceNumber: "curly",
  singleReferenceNumber: "curly",
  dash: true,
  windCell: "en-em",
  saveOmitNumber: true,
};












export function curveReferenceNumber(previous: string, isDoubleReferenceNumber: boolean, characterShape: ReferenceNumberCharacterShape): string {
  const open2 = previous === "" || /[\s([{<（【「『“‘]/.test(previous);
  if (characterShape === "straight") return isDoubleReferenceNumber ? '"' : "'";
  return isDoubleReferenceNumber ? (open2 ? "“" : "”") : open2 ? "‘" : "’";
}










export function dash(windCell: DashWindCell, itemNumber: number): string {
  if (itemNumber >= 3) return "—";
  return windCell === "en-em" ? "–" : "—";
}


function isApostropheNumber(prefixText: string): boolean {
  return /[\p{L}\p{N}]$/u.test(prefixText);
}




export interface PunctuationMatch {
  start6: number;
  end3: number;

  replace: string;
}











export function scanPunctuation(text4: string, settings: punctuationSettings): PunctuationMatch[] {
  if (settings.mode2 === "off") return [];
  const output2: PunctuationMatch[] = [];
  let i = 0;
  while (i < text4.length) {
    const character2 = text4[i]!;

    if (settings.dash && character2 === "-" && text4[i + 1] === "-") {
      let n = 0;
      while (text4[i + n] === "-") n++;


      if (n <= 3) {
        output2.push({ start6: i, end3: i + n, replace: dash(settings.windCell, n) });
        i += n;
        continue;
      }
      i += n;
      continue;
    }

    if (settings.dash && settings.saveOmitNumber && character2 === "." && text4[i + 1] === "." && text4[i + 2] === ".") {
      output2.push({ start6: i, end3: i + 3, replace: "…" });
      i += 3;
      continue;
    }

    if (settings.referenceNumber && (character2 === '"' || character2 === "'")) {
      const isDouble = character2 === '"';
      const characterShape = isDouble ? settings.doubleReferenceNumber : settings.singleReferenceNumber;
      const prefixText = text4.slice(0, i);
      const replace =
        characterShape === "straight"
          ? character2
          : !isDouble && isApostropheNumber(prefixText)
            ? "’"
            : curveReferenceNumber(prefixText.slice(-1), isDouble, characterShape);
      if (replace !== character2) output2.push({ start6: i, end3: i + 1, replace });
      i++;
      continue;
    }
    i++;
  }
  return output2;
}























const ruleRuleOption = { inCodeMark: false } as const;































export function onlyHasHorizontalLineBoneFrame(prefixText: string): boolean {
  return /^[\s|:-]*$/.test(prefixText);
}


function isHorizontalLineBoneFrameLine(state: EditorState, start6: number): boolean {
  const start = state.doc.resolve(start6);
  return onlyHasHorizontalLineBoneFrame(start.parent.textBetween(0, start.parentOffset, "", ""));
}


function dashRuleRule(settings: punctuationSettings) {
  const oneItem = (itemNumber: 2 | 3) =>
    $inputRule(() =>
      new InputRule(
        new RegExp(`-{${itemNumber}}$`),


        (state, _m, start6, end3) =>
          isHorizontalLineBoneFrameLine(state, start6) ? null : replaceRemove(state, start6, end3, dash(settings.windCell, itemNumber)),
        ruleRuleOption,
      ),
    );
  return [oneItem(3), oneItem(2)];
}

function saveOmitNumberRuleRule() {
  return $inputRule(() =>
    new InputRule(/\.{3}$/, (state, _m, start6, end3) => replaceRemove(state, start6, end3, "…"), ruleRuleOption),
  );
}


function replaceRemove(state: EditorState, start6: number, end3: number, replace: string) {
  return state.tr.insertText(replace, start6, end3);
}



























export function punctuationInput(settings: punctuationSettings) {
  if (settings.mode2 !== "input") return [];
  const output2 = [];
  if (settings.referenceNumber) {
    output2.push(referenceNumberRule(settings, true), referenceNumberRule(settings, false));
  }

  if (settings.dash) {
    output2.push(...dashRuleRule(settings));
    if (settings.saveOmitNumber) output2.push(saveOmitNumberRuleRule());
  }
  return output2;
}

function atCodeInside(state: EditorState, position2: number): boolean {
  const position = state.doc.resolve(position2);
  for (let layer = position.depth; layer > 0; layer -= 1) {
    if (position.node(layer).type.spec.code) return true;
  }
  return position.marks().some((mark) => mark.type.spec.code);
}


function referenceNumberRule(settings: punctuationSettings, isDouble: boolean) {
  const character = isDouble ? '"' : "'";
  const pattern = isDouble ? /"$/ : /'$/;
  return $inputRule(() =>
    new InputRule(pattern, (state, _match, start6, end3) => {
      if (atCodeInside(state, start6)) return null;
      const resolved = state.doc.resolve(start6);
      if (!resolved.parent.inlineContent) return null;
      const prefixText = resolved.parent.textBetween(0, resolved.parentOffset, "");
      if (prefixText.endsWith("\\")) return null;
      const characterShape = isDouble ? settings.doubleReferenceNumber : settings.singleReferenceNumber;
      const replace =
        !isDouble && isApostropheNumber(prefixText)
          ? "’"
          : curveReferenceNumber(prefixText.slice(-1), isDouble, characterShape);
      return replace === character ? null : replaceRemove(state, start6, end3, replace);
    }, ruleRuleOption),
  );
}



export const punctuationDecorationKey = new PluginKey("notaSmartPunct");


export interface DecorationItem {
  from: number;
  to2: number;
  replace: string;
}













export function decorationClearSingle(document: PMNode, settings: punctuationSettings): DecorationItem[] {
  const output2: DecorationItem[] = [];
  document.descendants((node, position2) => {
    if (!node.isText || !node.text) return;
    for (const match of scanPunctuation(node.text, settings)) {
      output2.push({ from: position2 + match.start6, to2: position2 + match.end3, replace: match.replace });
    }
  });
  return output2;
}


function computeDecorations(state: EditorState, settings: punctuationSettings): DecorationSet {
  const install: Decoration[] = [];
  for (const item5 of decorationClearSingle(state.doc, settings)) {


    install.push(Decoration.inline(item5.from, item5.to2, { class: "nota-smart-hide" }));
    install.push(
      Decoration.widget(
        item5.from,
        () => {
          const box = document.createElement("span");
          box.className = "nota-smart-show";
          box.textContent = item5.replace;


          box.setAttribute("aria-hidden", "true");
          return box;
        },
        { side: -1 },
      ),
    );
  }
  return DecorationSet.create(state.doc, install);
}








export function punctuationDecoration(settings: punctuationSettings) {
  if (settings.mode2 !== "render") return [];
  return [
    $prose(
      () =>
        new Plugin({
          key: punctuationDecorationKey,
          state: {
            init: (_c, state) => computeDecorations(state, settings),
            apply: (tr, _OldValue, _Old, newValue) => (tr.docChanged ? computeDecorations(newValue, settings) : _OldValue),
          },
          props: { decorations: (state) => punctuationDecorationKey.getState(state) },
        }),
    ),
  ];
}
