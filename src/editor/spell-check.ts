























import { Plugin, PluginKey } from "@milkdown/prose/state";
import { Decoration, DecorationSet } from "@milkdown/prose/view";
import type { EditorState } from "@milkdown/prose/state";
import type { EditorView } from "@milkdown/prose/view";

import { api } from "@/bridge/ipc";


const SETTLE_MS = 600;


const maxPerCall = 2000;


let language = "";


let isOpen = true;


const activeActiveOf = new Set<EditorView>();


export function setCombineWriteLanguage(next: string): void {
  language = next;
}








export function setCombineWriteFlag(on: boolean): void {
  if (isOpen === on) return;
  isOpen = on;
  for (const view of activeActiveOf) rechecks.get(view)?.();
}


const className2 = "nota-spell-error";








export function findView(node: Node): EditorView | null {
  for (const view of activeActiveOf) {
    if (view.dom.contains(node)) return view;
  }
  return null;
}







const rechecks = new WeakMap<EditorView, () => void>();


export function heavyNewValueCheckCombineWrite(view: EditorView): void {
  rechecks.get(view)?.();
}


export function replaceReplaceCombineWrite(view: EditorView, from: number, to2: number, createProposal: string): void {
  view.dispatch(view.state.tr.insertText(createProposal, from, to2).scrollIntoView());
}


export function currentLanguageLabel(): string {
  if (language) return language;



  const guess = (typeof navigator !== "undefined" && navigator.language) || "";






  const likeLanguage = /^[A-Za-z]{2,3}([_-][A-Za-z0-9]+)*$/;
  const clean = guess.replace(/-/g, "_");
  return likeLanguage.test(clean) ? clean : "en_US";
}


function shouldJumpPass(nodeName: string): boolean {
  return (
    nodeName === "code_block" ||
    nodeName === "code_inline" ||
    nodeName === "math_inline" ||
    nodeName === "math_block" ||
    nodeName === "link" ||
    nodeName === "html_block"
  );
}

















function splitWord(text2: string): Array<{ word: string; start5: number; end2: number }> {
  const output2: Array<{ word: string; start5: number; end2: number }> = [];



  const wholeParagraph = /[A-Za-z][A-Za-z'’]*(?:-[A-Za-z][A-Za-z'’]*)*/g;
  const oneParagraph = /[A-Za-z][A-Za-z'’]*/g;
  for (const m of text2.matchAll(wholeParagraph)) {
    const wholeParagraphText = m[0];
    const base = m.index ?? 0;

    if (!wholeParagraphText.includes("-")) {
      const word = wholeParagraphText.replace(/['’]+$/, "");
      if (word.length >= 2) output2.push({ word, start5: base, end2: base + word.length });
      continue;
    }

    for (const p of wholeParagraphText.matchAll(oneParagraph)) {
      const word = p[0].replace(/['’]+$/, "");
      if (word.length < 3) continue;
      const start5 = base + (p.index ?? 0);
      output2.push({ word, start5, end2: start5 + word.length });
    }
  }
  return output2;
}


function getWord(state: EditorState) {
  const output2: Array<{ word: string; from: number; to2: number }> = [];
  state.doc.descendants((node, pos, parent) => {
    if (!node.isText || !node.text) return true;
    if (parent && shouldJumpPass(parent.type.name)) return false;
    for (const { word, start5, end2 } of splitWord(node.text)) {
      output2.push({ word, from: pos + start5, to2: pos + end2 });
    }
    return true;
  });
  return output2;
}

function goHeavy(list: Array<{ word: string; from: number; to2: number }>) {
  const searchReference = new Map<string, Array<{ from: number; to2: number }>>();
  for (const { word, from, to2 } of list) {
    const plural = searchReference.get(word);
    if (plural) plural.push({ from, to2 });
    else searchReference.set(word, [{ from, to2 }]);
  }
  return searchReference;
}








const key = new PluginKey<DecorationSet>("nota-spell");

export function combineWriteCheckCheckPlugin(): Plugin<DecorationSet> {
  return new Plugin<DecorationSet>({
    key: key,
    state: {
      init: () => DecorationSet.empty,
      apply(tr, oldValue) {


        const newValue = tr.getMeta(key) as DecorationSet | undefined;
        if (newValue) return newValue;

        return oldValue.map(tr.mapping, tr.doc);
      },
    },
    props: {
      decorations(state) {
        return key.getState(state) ?? DecorationSet.empty;
      },
    },
    view(view) {
      let fixedTime: number | null = null;
      let thisValueWheel = 0;


      const clearEmpty = () => {
        view.dispatch(view.state.tr.setMeta(key, DecorationSet.empty).setMeta("addToHistory", false));
      };

      const ask = async () => {

        if (!isOpen) {
          clearEmpty();
          return;
        }
        const thisOnePass = ++thisValueWheel;
        const position2 = getWord(view.state);
        if (position2.length === 0) {
          clearEmpty();
          return;
        }
        const searchReference = goHeavy(position2);
        const words = [...searchReference.keys()].slice(0, maxPerCall);
        let errorOfBelowMark: number[];
        try {
          errorOfBelowMark = await api.spell.check(currentLanguageLabel(), words);
        } catch {

          return;
        }


        if (thisOnePass !== thisValueWheel) return;
        const errorOfWord = new Set(errorOfBelowMark.map((i) => words[i]));
        const decoration: Decoration[] = [];
        for (const [word, paragraphs] of searchReference) {
          if (!errorOfWord.has(word)) continue;
          for (const { from, to2 } of paragraphs) {
            decoration.push(Decoration.inline(from, to2, { class: className2 }));
          }
        }
        const collection = DecorationSet.create(view.state.doc, decoration);




        view.dispatch(view.state.tr.setMeta(key, collection).setMeta("addToHistory", false));
      };

      const arrange = () => {
        if (fixedTime !== null) window.clearTimeout(fixedTime);
        fixedTime = window.setTimeout(() => void ask(), SETTLE_MS);
      };



      rechecks.set(view, () => {
        if (fixedTime !== null) window.clearTimeout(fixedTime);
        void ask();
      });
      activeActiveOf.add(view);


      arrange();
      return {
        update(view, oldValueState) {
          if (!view.state.doc.eq(oldValueState.doc)) arrange();
        },
        destroy() {
          if (fixedTime !== null) window.clearTimeout(fixedTime);
          rechecks.delete(view);
          activeActiveOf.delete(view);
        },
      };
    },
  });
}
