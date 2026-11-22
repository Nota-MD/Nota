





















import { StateEffect, StateField } from "@codemirror/state";
import { Decoration, EditorView } from "@codemirror/view";

import {
  findMatchesInText,
  defaultFindOptions,
  type FindOptions,
  type FindStatus,
  type TextMatch,
} from "@/editor/find";

export interface sourceFindState {
  query: string;
  options: FindOptions;
  matches: TextMatch[];
  index: number;
}

export const emptyFind: sourceFindState = {
  query: "",
  options: defaultFindOptions,
  matches: [],
  index: -1,
};

export const setFindEffect = StateEffect.define<{ query: string; options: FindOptions }>();
export const findStepEffect = StateEffect.define<1 | -1>();
export const clearFindEffect = StateEffect.define<null>();

export const findField = StateField.define<sourceFindState>({
  create: () => emptyFind,
  update(value, tr) {
    if (tr.effects.some((e) => e.is(clearFindEffect))) return emptyFind;

    const set = tr.effects.find((e) => e.is(setFindEffect));
    const walk = tr.effects.find((e) => e.is(findStepEffect));

    const query = set ? set.value.query : value.query;
    const options = set ? set.value.options : value.options;
    const wantHeavyCompute = Boolean(set) || tr.docChanged;
    const matches = wantHeavyCompute ? findMatchesInText(tr.state.doc.toString(), query, options) : value.matches;

    let index = value.index;
    if (matches.length === 0) index = -1;
    else if (set) {
      const hit = matches.findIndex((m) => m.start >= tr.state.selection.main.from);
      index = hit === -1 ? 0 : hit;
    } else if (walk) {
      const n = matches.length;
      index = walk.value > 0 ? (index + 1 + n) % n : (index - 1 + n) % n;
    } else if (wantHeavyCompute) {
      index = Math.min(Math.max(index, 0), matches.length - 1);
    }

    return { query, options, matches, index };
  },
});


const matchClass = "nota-find-hit";
const currentClass = "nota-find-current";

export const findDecoration = EditorView.decorations.compute([findField], (state) => {
  const s = state.field(findField);
  if (s.matches.length === 0) return Decoration.none;
  return Decoration.set(
    s.matches.map((m, i) =>
      Decoration.mark({
        class: i === s.index ? `${matchClass} ${currentClass}` : matchClass,
      }).range(m.start, m.end),
    ),



    true,
  );
});


export function findState(s: sourceFindState): FindStatus {
  return { query: s.query, total: s.matches.length, current: s.index + 1 };
}


export function sourceSelection(view: EditorView, m: TextMatch): void {
  view.dispatch({
    selection: { anchor: m.start, head: m.end },
    scrollIntoView: true,
  });
}
