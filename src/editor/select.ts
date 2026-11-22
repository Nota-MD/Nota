















































import { editorViewCtx } from "@milkdown/kit/core";
import type { Editor } from "@milkdown/kit/core";
import type { Node as PMNode } from "@milkdown/kit/prose/model";
import { TextSelection } from "@milkdown/kit/prose/state";
import type { EditorView } from "@milkdown/kit/prose/view";


export interface range {
  from: number;
  to: number;
}




const atomPlaceholder = "￼";









let shareParagraphDevice: Intl.Segmenter | null | undefined;

function getShareParagraphDevice(): Intl.Segmenter | null {
  if (shareParagraphDevice !== undefined) return shareParagraphDevice;
  try {
    shareParagraphDevice = typeof Intl.Segmenter === "function" ? new Intl.Segmenter(undefined, { granularity: "word" }) : null;
  } catch {

    shareParagraphDevice = null;
  }
  return shareParagraphDevice;
}


const wordCorrectRule = /[\p{L}\p{N}_]+/gu;

function clamp(value2: number, below: number, above: number): number {
  return Math.max(below, Math.min(value2, above));
}

















function pickWord(candidate: Iterable<range>, position3: number): range | null {
  let before2: range | null = null;
  for (const word of candidate) {
    if (position3 >= word.from && position3 < word.to) return word;




    if (word.to <= position3) before2 = word;
    else if (word.from > position3) return before2 ?? word;
  }
  return before2;
}


function* shareWordDeviceCandidate(text2: string, paragraph2: Intl.Segmenter): Generator<range> {
  for (const value of paragraph2.segment(text2)) {
    if (value.isWordLike) yield { from: value.index, to: value.index + value.segment.length };
  }
}


function* correctRuleCandidate(text2: string): Generator<range> {
  for (const match2 of text2.matchAll(wordCorrectRule)) {
    yield { from: match2.index, to: match2.index + match2[0].length };
  }
}


export function wordRange(text2: string, position2: number): range | null {
  if (!text2) return null;
  const position3 = clamp(position2, 0, text2.length);
  const paragraph2 = getShareParagraphDevice();
  return pickWord(paragraph2 ? shareWordDeviceCandidate(text2, paragraph2) : correctRuleCandidate(text2), position3);
}









const sentenceReadCollection = new Set(["。", "！", "？", "…", "；", "!", "?", ";", "\n"]);

function isNumberCharacter(character2: string | undefined): boolean {
  return character2 !== undefined && character2 >= "0" && character2 <= "9";
}









function isSentenceRead(text2: string, i: number): boolean {
  const character2 = text2[i];
  if (character2 === undefined) return false;
  if (character2 === ".") return !(isNumberCharacter(text2[i - 1]) && isNumberCharacter(text2[i + 1]));
  return sentenceReadCollection.has(character2);
}

function isWhitespace(character2: string | undefined): boolean {
  return character2 !== undefined && /\s/.test(character2);
}







function receiveEdge(text2: string, start5: number, end3: number): range | null {
  let head2 = start5;
  let tail = end3;
  while (head2 < tail && isWhitespace(text2[head2])) head2++;
  while (tail > head2 && isWhitespace(text2[tail - 1])) tail--;
  return tail > head2 ? { from: head2, to: tail } : null;
}


function towardReturnOneSentence(text2: string, sentenceTail: number): range | null {
  let start5 = 0;
  for (let i = sentenceTail - 2; i >= 0; i--) {
    if (isSentenceRead(text2, i)) {
      start5 = i + 1;
      break;
    }
  }
  return receiveEdge(text2, start5, sentenceTail);
}











export function sentenceRange(text2: string, position2: number): range | null {
  if (!text2) return null;
  const position3 = clamp(position2, 0, text2.length);
  if (position3 > 0 && isSentenceRead(text2, position3 - 1)) {
    const returnHead = towardReturnOneSentence(text2, position3);
    if (returnHead) return returnHead;

  }
  let start5 = 0;
  for (let i = position3 - 1; i >= 0; i--) {
    if (isSentenceRead(text2, i)) {
      start5 = i + 1;
      break;
    }
  }
  let end3 = text2.length;
  for (let j = position3; j < text2.length; j++) {
    if (isSentenceRead(text2, j)) {

      end3 = text2[j] === "\n" ? j : j + 1;
      break;
    }
  }
  return receiveEdge(text2, start5, end3);
}









function expandBlock(doc: PMNode, position2: number): { block: PMNode; text4: string; position3: number; start4: number } | null {
  const $pos = doc.resolve(clamp(position2, 0, doc.content.size));
  const block = $pos.parent;
  if (!block.isTextblock || block.type.spec.code) return null;
  const text4 = block.textBetween(0, block.content.size, undefined, (leaf) =>
    leaf.type.name === "hardbreak" ? "\n" : atomPlaceholder,
  );
  return { block, text4, position3: $pos.parentOffset, start4: $pos.start() };
}


export function lineRange(doc: PMNode, position2: number): range | null {
  const flatten = expandBlock(doc, position2);
  if (!flatten || flatten.block.content.size === 0) return null;
  return { from: flatten.start4, to: flatten.start4 + flatten.block.content.size };
}


export function wordRange2(doc: PMNode, position2: number): range | null {
  const flatten = expandBlock(doc, position2);
  if (!flatten) return null;
  const area = wordRange(flatten.text4, flatten.position3);
  return area && { from: flatten.start4 + area.from, to: flatten.start4 + area.to };
}


export function sentenceRange2(doc: PMNode, position2: number): range | null {
  const flatten = expandBlock(doc, position2);
  if (!flatten) return null;
  const area = sentenceRange(flatten.text4, flatten.position3);
  return area && { from: flatten.start4 + area.from, to: flatten.start4 + area.to };
}







function dropSelection(view: EditorView, area: range | null): void {
  if (!area || area.from >= area.to) return;
  const { state } = view;
  view.dispatch(state.tr.setSelection(TextSelection.create(state.doc, area.from, area.to)));
}


export function selectLine(editor: Editor): void {
  editor.action((ctx) => {
    const view = ctx.get(editorViewCtx);
    dropSelection(view, lineRange(view.state.doc, view.state.selection.from));
  });
}


export function selectWord(editor: Editor): void {
  editor.action((ctx) => {
    const view = ctx.get(editorViewCtx);
    dropSelection(view, wordRange2(view.state.doc, view.state.selection.from));
  });
}


export function selectSentence(editor: Editor): void {
  editor.action((ctx) => {
    const view = ctx.get(editorViewCtx);
    dropSelection(view, sentenceRange2(view.state.doc, view.state.selection.from));
  });
}








export function removeWord(editor: Editor): void {
  editor.action((ctx) => {
    const view = ctx.get(editorViewCtx);
    const { state } = view;
    const select = state.selection;
    const area = select.empty ? wordRange2(state.doc, select.from) : { from: select.from, to: select.to };
    if (!area || area.from >= area.to) return;


    const tr = state.tr.delete(area.from, area.to);
    view.dispatch(tr.setSelection(TextSelection.near(tr.doc.resolve(area.from))));
  });
}
