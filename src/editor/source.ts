












































import { defaultKeymap, history, historyKeymap } from "@codemirror/commands";
import { markdown } from "@codemirror/lang-markdown";
import { HighlightStyle, syntaxHighlighting } from "@codemirror/language";
import {
  Compartment,
  EditorState,
  StateEffect,
  StateField,
  type Extension,
} from "@codemirror/state";
import {
  Decoration,
  EditorView,
  drawSelection,
  highlightActiveLine,
  keymap,
  placeholder,
} from "@codemirror/view";


import { tags } from "@lezer/highlight";




import type { SelectionSnapshot } from "@/editor/caret-snapshot";


import { collideCarKeyPosition } from "@/editor/key-conflicts";
import type { CommandPayload, EditorCommand, SelectionContent } from "@/editor/create";
import {
  clampSelectionRange,
  type EditorSelectionRange,
} from "@/editor/selection-range";



import { type FindOptions, type FindStatus } from "@/editor/find";



import {
  setFindEffect,
  clearFindEffect,
  findField,
  findDecoration,
  findState,
  sourceSelection,
  findStepEffect,
} from "@/editor/source-find";



import { applyCommand } from "@/editor/source-commands";


import {
  dedicatedNoteClass,
  brightLineClass,
  rollToCorrectMiddle,
  defaultWritingModes,
  type WritingMode,
} from "@/editor/writing-modes";



import { removeViewMode, setViewMode2, type changePreview, type previewMode } from "@/editor/review";

import { previewExtensionExtendCollection, previewEffectResult } from "@/editor/review-source";


import { t } from "@/i18n";


export interface SourceHandle {

  getMarkdown: () => string;

  setMarkdown: (markdown: string) => void;
  focus: () => void;










  focusAtStart: () => void;

  setWritingModes: (mode2: WritingMode) => void;




  setReview: (preview: changePreview | null, viewMode: previewMode) => void;

  runCommand: (name: EditorCommand, payload?: CommandPayload) => boolean;









  insertAtCursorPlace: (text: string) => boolean;


  setFind: (query: string, options: FindOptions) => void;
  findStep: (direction: 1 | -1) => void;
  clearFind: () => void;
  replaceCurrent: (text: string) => boolean;
  replaceAll: (text: string) => number;

  selection: () => SelectionContent | null;

  selectionRange: () => EditorSelectionRange;

  restoreSelection: (selection: EditorSelectionRange) => void;








  jumpToMarkTitle: (target: { line: number; index: number }) => void;
  destroy: () => void;
}

export interface CreateSourceOptions {
  root: HTMLElement;
  initialMarkdown: string;







  onChange?: (markdown: string) => void;






  onDocumentActivity?: () => void;








  onSelection?: (snapshot: SelectionSnapshot) => void;

  writingModes?: WritingMode;




  review?: changePreview | null;

  onReviewEscape?: () => void;

  readOnly?: boolean;











  strict?: boolean;




  onFindStatus?: (status: FindStatus) => void;












  plainText?: boolean;
}







const notaHighlight = HighlightStyle.define([
  { tag: tags.heading, color: "var(--accent)" },
  { tag: tags.strong, fontWeight: "700" },
  { tag: tags.emphasis, fontStyle: "italic" },
  { tag: tags.strikethrough, textDecoration: "line-through" },
  { tag: tags.link, color: "var(--accent)", textDecoration: "underline" },
  { tag: tags.url, color: "var(--code-string)" },
  { tag: tags.quote, color: "var(--fg-muted)" },
  { tag: tags.list, color: "var(--accent)" },
  { tag: tags.monospace, color: "var(--code-string)" },
  { tag: tags.comment, color: "var(--code-comment)", fontStyle: "italic" },
  { tag: tags.keyword, color: "var(--code-keyword)" },
  { tag: tags.string, color: "var(--code-string)" },
  { tag: tags.number, color: "var(--code-number)" },
  { tag: tags.function(tags.variableName), color: "var(--code-function)" },
  { tag: tags.typeName, color: "var(--code-tag)" },
  { tag: tags.attributeName, color: "var(--code-attr)" },


  { tag: tags.processingInstruction, color: "var(--fg-faint)" },
  { tag: tags.contentSeparator, color: "var(--fg-faint)" },
]);





const notaTheme = EditorView.theme({
  "&": {
    height: "100%",
    backgroundColor: "var(--doc-bg)",
    color: "var(--doc-fg)",
    fontSize: "var(--editor-font-size, var(--ui-font-size, 15px))",
  },
  ".cm-scroller": {
    fontFamily: "var(--font-mono)",
    lineHeight: "1.65",
    overflow: "auto",
  },
  ".cm-content": {
    padding: "24px 28px 120px",
    caretColor: "var(--accent)",
  },
  "&.cm-focused": { outline: "none" },
  ".cm-cursor, .cm-dropCursor": { borderLeftColor: "var(--accent)" },






  "&.cm-focused > .cm-scroller > .cm-selectionLayer .cm-selectionBackground, .cm-selectionBackground, ::selection": {
    backgroundColor: "var(--bg-active)",
  },























  "& .cm-activeLine": { backgroundColor: "transparent" },
  "&.cm-focused .cm-activeLine": {
    backgroundColor: "color-mix(in srgb, var(--fg) 5%, transparent)",
  },
  ".cm-gutters": {
    backgroundColor: "transparent",
    color: "var(--fg-faint)",
    border: "none",
  },
  ".cm-placeholder": { color: "var(--fg-faint)" },
});









const writingModeEffectResult = StateEffect.define<WritingMode>();








function writingModeExtensionExtend(initialStart: WritingMode): { field: StateField<WritingMode>; extensionExtend: Extension[] } {
  const field = StateField.define<WritingMode>({
    create: () => initialStart,
    update(v, tr) {
      let output2 = v;
      for (const e of tr.effects) if (e.is(writingModeEffectResult)) output2 = e.value;
      return output2;
    },
  });

  const decoration = EditorView.decorations.compute([field], (state) => {
    const m = state.field(field);
    if (!m.focus) return Decoration.none;



    const line3 = state.doc.lineAt(state.selection.main.head);
    return Decoration.set([Decoration.line({ class: brightLineClass }).range(line3.from)]);
  });

  return { field, extensionExtend: [field, decoration] };
}












export function createSourceEditor(options: CreateSourceOptions): SourceHandle {
  const {
    root,
    initialMarkdown,
    onChange,
    onDocumentActivity,
    onSelection,
    readOnly = false,
    strict = false,
    onFindStatus,
    plainText = false,
    writingModes = defaultWritingModes,
    review = null,
    onReviewEscape,
  } = options;


  let aboveCountCheckFindKeyName = "";







  let aboveCountSnapshotKeyName = "";

  let aboveCountMode: WritingMode = writingModes;
  const { field: writeWorkField, extensionExtend: writeWorkExtensionExtend } = writingModeExtensionExtend(writingModes);

  let aboveCountPreview: changePreview | null = review ?? null;
  const { extensionExtend: previewExtensionExtend } = previewExtensionExtendCollection(review ?? null, onReviewEscape);










  const onlyReadCabin = new Compartment();
  const onlyReadExtensionExtend = (lock: boolean): Extension[] => [
    EditorState.readOnly.of(lock),
    EditorView.editable.of(!lock),
  ];

  const extensions: Extension[] = [
    history(),
    drawSelection(),
    EditorView.lineWrapping,



    highlightActiveLine(),



    ...(plainText ? [] : [markdown(), syntaxHighlighting(notaHighlight)]),
    notaTheme,


    keymap.of(
      [...defaultKeymap, ...historyKeymap].filter((b) => !collideCarKeyPosition.has(b.key ?? "")),
    ),
    EditorView.updateListener.of((u) => {




      const s = u.state.field(findField, false);
      if (onFindStatus && s) {
        const status = findState(s);
        const sig = `${status.query}|${status.total}|${status.current}`;
        if (sig !== aboveCountCheckFindKeyName) {
          aboveCountCheckFindKeyName = sig;
          onFindStatus(status);
        }
      }



      const mode2 = u.state.field(writeWorkField);
      u.view.dom.classList.toggle(dedicatedNoteClass, mode2.focus);


      const justOpen = mode2.typewriter && !aboveCountMode.typewriter;
      if (mode2.typewriter && (justOpen || u.selectionSet || u.docChanged)) {


        const position3 = u.view.coordsAtPos(u.state.selection.main.head);
        if (position3) rollToCorrectMiddle(u.view.scrollDOM, position3.top, position3.bottom);
      }
      aboveCountMode = mode2;





      if (onSelection) {
        const { from, to } = u.state.selection.main;
        const text = from === to ? "" : u.state.sliceDoc(from, to);
        const sig = `${from === to ? 1 : 0}|${text}`;
        if (sig !== aboveCountSnapshotKeyName) {
          aboveCountSnapshotKeyName = sig;
          onSelection({ text, empty: from === to });
        }
      }

      if (!u.docChanged) return;



      if (onDocumentActivity) onDocumentActivity();
      else onChange?.(u.state.doc.toString());
    }),

    onlyReadCabin.of(onlyReadExtensionExtend(readOnly)),
  ];
  if (!readOnly) extensions.push(placeholder(t("Write your Markdown here…")));


  if (!readOnly && onFindStatus) extensions.push(findField, findDecoration);



  if (!readOnly) extensions.push(...writeWorkExtensionExtend);


  if (!readOnly) extensions.push(...previewExtensionExtend);

  const view = new EditorView({
    state: EditorState.create({ doc: initialMarkdown, extensions }),
    parent: root,
  });

  return {
    getMarkdown: () => view.state.doc.toString(),

    setMarkdown: (md: string) => {



      if (md === view.state.doc.toString()) return;
      view.dispatch({
        changes: { from: 0, to: view.state.doc.length, insert: md },


        selection: { anchor: 0 },
        scrollIntoView: true,
      });
    },

    focus: () => view.focus(),
    focusAtStart: () => {
      view.dispatch({ selection: { anchor: 0 }, scrollIntoView: true });
      view.focus();
    },
    setReview: (preview: changePreview | null, viewMode: previewMode) => {


      if (preview !== aboveCountPreview) {
        aboveCountPreview = preview;
        view.dispatch({
          effects: [
            previewEffectResult.of(preview),


            onlyReadCabin.reconfigure(onlyReadExtensionExtend(readOnly || preview !== null)),
          ],
        });
      }
      if (preview) setViewMode2(view.dom, viewMode);
      else removeViewMode(view.dom);
    },

    setWritingModes: (mode2: WritingMode) => {
      view.dispatch({ effects: writingModeEffectResult.of(mode2) });



      view.dom.classList.toggle(dedicatedNoteClass, mode2.focus);
      if (mode2.typewriter) {
        const position3 = view.coordsAtPos(view.state.selection.main.head);
        if (position3) rollToCorrectMiddle(view.scrollDOM, position3.top, position3.bottom);
      }
    },
    runCommand: (name: EditorCommand, payload?: CommandPayload) =>
      applyCommand(view, name, strict, payload),





    insertAtCursorPlace: (text: string) => {
      const { from, to } = view.state.selection.main;
      view.dispatch({ changes: { from, to, insert: text } });
      return true;
    },





    selection: () => {
      const { from, to } = view.state.selection.main;
      if (from === to) return null;
      return { text: view.state.sliceDoc(from, to), html: "" };
    },

    selectionRange: () => {
      const { anchor, head } = view.state.selection.main;
      return { anchor, head };
    },

    restoreSelection: (selection: EditorSelectionRange) => {
      const bounded = clampSelectionRange(selection, view.state.doc.length);
      view.dispatch({
        selection: { anchor: bounded.anchor, head: bounded.head },
        scrollIntoView: true,
      });
      view.focus();
    },

    jumpToMarkTitle: ({ line }) => {


      const n = Math.min(Math.max(line + 1, 1), view.state.doc.lines);
      const t = view.state.doc.line(n);





      view.dispatch({
        selection: { anchor: t.from },
        effects: EditorView.scrollIntoView(t.from, { y: "start", yMargin: 8 }),
      });

      view.focus();
    },



    setFind: (query: string, options: FindOptions) => {
      view.dispatch({ effects: setFindEffect.of({ query, options }) });


      const s = view.state.field(findField);
      if (s.index >= 0) sourceSelection(view, s.matches[s.index]!);
    },

    findStep: (direction: 1 | -1) => {
      if (view.state.field(findField).matches.length === 0) return;
      view.dispatch({ effects: findStepEffect.of(direction) });
      const s = view.state.field(findField);
      if (s.index >= 0) sourceSelection(view, s.matches[s.index]!);
    },

    clearFind: () => {
      view.dispatch({ effects: clearFindEffect.of(null) });
    },

    replaceCurrent: (text: string) => {
      const s = view.state.field(findField);
      if (s.index < 0) return false;
      const m = s.matches[s.index]!;
      view.dispatch({ changes: { from: m.start, to: m.end, insert: text } });

      const after = view.state.field(findField);
      if (after.index >= 0 && after.matches[after.index]) sourceSelection(view, after.matches[after.index]!);
      return true;
    },

    replaceAll: (text: string) => {
      const s = view.state.field(findField);
      if (s.matches.length === 0) return 0;



      view.dispatch({
        changes: [...s.matches].reverse().map((m) => ({
          from: m.start,
          to: m.end,
          insert: text,
        })),
      });
      return s.matches.length;
    },

    destroy: () => view.destroy(),
  };
}
