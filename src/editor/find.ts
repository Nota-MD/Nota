































import { Plugin, PluginKey, TextSelection } from "@milkdown/kit/prose/state";
import type { EditorState, Transaction } from "@milkdown/kit/prose/state";
import type { EditorView } from "@milkdown/kit/prose/view";
import { Decoration, DecorationSet } from "@milkdown/kit/prose/view";
import type { Node as PMNode } from "@milkdown/kit/prose/model";
import { $prose } from "@milkdown/kit/utils";



import { rollActionToCanSee } from "./scroll-into-view";


export interface FindOptions {
  caseSensitive: boolean;

  wholeWord: boolean;

  regex: boolean;







  wildcard: boolean;
}

export const defaultFindOptions: FindOptions = {
  caseSensitive: false,
  wholeWord: false,
  regex: false,
  wildcard: false,
};


export interface TextMatch {
  start: number;
  end: number;
}



const wordCharacter = /[\p{L}\p{N}_]/u;


const dollarCharacter = /[.*+?^${}()|[\]\\]/g;














function throughConfigureSymbolConvertCorrectRule(query: string): string {
  return query
    .replace(dollarCharacter, "\\$&")
    .replace(/\\\*/g, ".*")
    .replace(/\\\?/g, ".");
}

function editTranslate(query: string, opts: FindOptions): RegExp | null {
  let source: string;
  if (opts.regex) {
    source = query;
  } else if (opts.wildcard) {
    source = throughConfigureSymbolConvertCorrectRule(query);
  } else {
    source = query.replace(dollarCharacter, "\\$&");
  }


  try {
    return new RegExp(source, opts.caseSensitive ? "gu" : "giu");
  } catch {
    return null;
  }
}


























export function correctRuleWriteBrokenDone(query: string, opts: FindOptions): boolean {
  return opts.regex && query !== "" && editTranslate(query, opts) === null;
}











export function findMatchesInText(
  text: string,
  query: string,
  opts: FindOptions,
): TextMatch[] {
  if (query === "") return [];
  const re = editTranslate(query, opts);
  if (!re) return [];

  const out: TextMatch[] = [];
  for (;;) {
    const m = re.exec(text);
    if (!m) break;

    if (m[0].length === 0) {

      re.lastIndex += 1;
      if (re.lastIndex > text.length) break;
      continue;
    }
    const start = m.index;
    const end = start + m[0].length;
    if (!opts.wholeWord || isWholeWord(text, start, end)) out.push({ start, end });
  }
  return out;
}


function isWholeWord(text: string, start: number, end: number): boolean {
  const left = start > 0 ? text[start - 1]! : "";
  const right = end < text.length ? text[end]! : "";
  return !(left && wordCharacter.test(left)) && !(right && wordCharacter.test(right));
}




export function computeMatch(doc: PMNode, query: string, opts: FindOptions): TextMatch[] {
  if (query === "") return [];
  const out: TextMatch[] = [];
  doc.descendants((node, pos) => {



    if (!node.isText || !node.text) return true;
    for (const m of findMatchesInText(node.text, query, opts)) {

      //



      //






      //


      out.push({ start: pos + m.start, end: pos + m.end });
    }
    return true;
  });
  return out;
}




export interface FindStatus {
  query: string;

  total: number;

  current: number;
}

interface pluginState {
  query: string;
  options: FindOptions;
  matches: TextMatch[];

  index: number;
}

const emptyState: pluginState = { query: "", options: defaultFindOptions, matches: [], index: -1 };








export const emptyFindState: FindStatus = { query: "", total: 0, current: 0 };

export const findKey = new PluginKey<pluginState>("nota-find");


export const settingsQueryMetadata = "nota-find-set";

export const walkActionDollar = "nota-find-step";

export const clearRemoveDollar = "nota-find-clear";


function thenNearMatch(s: pluginState, pos: number): number {
  if (s.matches.length === 0) return -1;
  const hit = s.matches.findIndex((m) => m.start >= pos);
  return hit === -1 ? 0 : hit;
}








function selected(view: EditorView, m: TextMatch): void {
  const tr = view.state.tr.setSelection(TextSelection.create(view.state.doc, m.start, m.end));
  view.dispatch(tr);






  rollActionToCanSee(view, m.start, m.end);
}

function shouldUse(tr: Transaction, prev: pluginState, newValuestate: EditorState): pluginState {
  if (tr.getMeta(clearRemoveDollar)) return emptyState;

  const settings = tr.getMeta(settingsQueryMetadata) as
    | { query: string; options: FindOptions }
    | undefined;
  const walk = tr.getMeta(walkActionDollar) as number | undefined;

  let query = prev.query;
  let options = prev.options;
  if (settings) {
    query = settings.query;
    options = settings.options;
  }



  const wantHeavyCompute = settings !== undefined || tr.docChanged;
  const matches = wantHeavyCompute ? computeMatch(newValuestate.doc, query, options) : prev.matches;

  let index = prev.index;
  if (matches.length === 0) {
    index = -1;
  } else if (settings) {

    index = thenNearMatch({ query, options, matches, index: -1 }, newValuestate.selection.from);
  } else if (walk !== undefined) {

    const n = matches.length;
    index = walk > 0 ? (index + 1 + n) % n : (index - 1 + n) % n;
  } else if (wantHeavyCompute) {

    index = Math.min(Math.max(index, 0), matches.length - 1);
  }

  return { query, options, matches, index };
}


const matchClass = "nota-find-hit";
const currentClass = "nota-find-current";

export function findPlugin(onStatus: (s: FindStatus) => void) {
  return $prose(() => {
    let aboveCount = "";
    const report = (s: pluginState) => {
      const status: FindStatus = {
        query: s.query,
        total: s.matches.length,
        current: s.index + 1,
      };

      const sig = `${status.query}|${status.total}|${status.current}`;
      if (sig === aboveCount) return;
      aboveCount = sig;
      onStatus(status);
    };

    return new Plugin<pluginState>({
      key: findKey,
      state: {
        init: () => emptyState,
        apply: (tr, prev, _old, newValuestate) => shouldUse(tr, prev, newValuestate),
      },
      props: {
        decorations(state) {
          const s = findKey.getState(state);
          if (!s || s.matches.length === 0) return null;
          return DecorationSet.create(
            state.doc,
            s.matches.map((m, i) =>
              Decoration.inline(m.start, m.end, {
                class: i === s.index ? `${matchClass} ${currentClass}` : matchClass,
              }),
            ),
          );
        },
      },
      view: () => ({
        update: (view) => {
          const s = findKey.getState(view.state);
          if (s) report(s);
          return false;
        },
      }),
    });
  });
}




function state(view: EditorView): pluginState {
  return findKey.getState(view.state) ?? emptyState;
}

export function setQuery(view: EditorView, query: string, options: FindOptions): void {
  view.dispatch(view.state.tr.setMeta(settingsQueryMetadata, { query, options }));



  const s = state(view);
  if (s.index >= 0) selected(view, s.matches[s.index]!);
}


export function walk(view: EditorView, direction: 1 | -1): void {
  const before2 = state(view);
  if (before2.matches.length === 0) return;
  view.dispatch(view.state.tr.setMeta(walkActionDollar, direction));
  const after = state(view);
  if (after.index >= 0) selected(view, after.matches[after.index]!);
}

export function clearRemove(view: EditorView): void {
  view.dispatch(view.state.tr.setMeta(clearRemoveDollar, true));
}









export function replaceReplaceCurrent(view: EditorView, replaceReplaceBecome: string): boolean {
  const s = state(view);
  if (s.index < 0) return false;
  const m = s.matches[s.index]!;
  const tr = view.state.tr.insertText(replaceReplaceBecome, m.start, m.end);
  view.dispatch(tr);


  const after = state(view);
  if (after.index >= 0 && after.matches[after.index]) selected(view, after.matches[after.index]!);
  return true;
}








export function replaceAll(view: EditorView, replaceReplaceBecome: string): number {
  const s = state(view);
  if (s.matches.length === 0) return 0;
  const n = s.matches.length;
  let tr = view.state.tr;
  for (const m of [...s.matches].reverse()) {
    tr = tr.insertText(replaceReplaceBecome, m.start, m.end);
  }
  view.dispatch(tr);
  return n;
}
