



















import { editorViewCtx, serializerCtx } from "@milkdown/kit/core";
import { replaceAll as replaceAllContent } from "@milkdown/kit/utils";
import { TextSelection } from "@milkdown/kit/prose/state";





import { splitFrontMatter, joinFrontMatter, replaceFrontMatter, newFrontMatterTemplate } from "@/editor/front-matter";





import { installConfigureActualExample } from "./assemble";
import { setVimInputConfig } from "./plugin-vim-input";




import { runCommand } from "./command-table";
import { normalizeInlineBlock } from "./mark-hint-source";
import { scrollPositionIntoView } from "./scroll-into-view";


import { removeViewMode, setViewMode2, type changePreview, type previewMode } from "./review";


import { setPreview } from "./review-prose";

import { DefaultInlineExtensionFlags } from "./inline-marks";

import { DefaultPunctuationSettings } from "./smart-punctuation";


import {
  scheduleCurrentLineCenter,
  setWritingMode,
  type WritingMode,
} from "./writing-modes";


import {
  setQuery,
  walk,
  clearRemove,
  replaceReplaceCurrent,
  replaceAll as replaceAllMatches,
  type FindOptions,
} from "./find";





//



export type {
  EditorCommand,
  CommandPayload,
  SelectionContent,
  EditorHandle,
  CreateOptions,
} from "./create-types";

import type {
  EditorCommand,
  CommandPayload,
  EditorHandle,
  CreateOptions,
} from "./create-types";
import { clampSelectionRange, type EditorSelectionRange } from "./selection-range";













export async function createEditor(options: CreateOptions): Promise<EditorHandle> {
  const {
    root,
    initialMarkdown,
    onChange,
    documentPath = null,
    readOnly = false,
    physics = false,



    strict = false,
  } = options;







  const inlineExtensions = options.inlineMarks ?? DefaultInlineExtensionFlags;

  // Automatic links are enabled unless the caller explicitly passes false.
  const autoLinks = options.autoLinks ?? true;
  const autoPair = options.autoPair ?? false;
  const keyboardExperience = options.keyboardExperience ?? false;
  const defaultIndent = Math.max(1, Math.min(8, options.defaultIndent ?? 2));




  const punctuation = options.punctuation ?? DefaultPunctuationSettings;



  const selfActionMoreCorrect = options.selfActionMoreCorrect ?? true;




  const emoji = options.emoji ?? true;
  const markdownSyntaxStyle = options.markdownSyntaxStyle;


  //



  //



  const header2 = splitFrontMatter(initialMarkdown);
  let frontMatter = header2.frontMatter;





  let aboveCountPreview: changePreview | null = options.review ?? null;




  const editor = await installConfigureActualExample({
    root,
    body2: header2.body2,
    physics,
    readOnly,
    documentPath,
    strict,
    inlineExtensions,
    autoLinks,
    autoPair,
    keyboardExperience,
    defaultIndent,
    punctuation,
    selfActionMoreCorrect,
    emoji,
    markdownSyntaxStyle,
    onChange,


    getFrontMatter: () => frontMatter,
    options,
    vimInput: options.vimInput,
  });
  if (options.onViewReady) {
    editor.action((ctx) => options.onViewReady?.(ctx.get(editorViewCtx)));
  }




  if (!readOnly && options.writingModes?.typewriter) {
    editor.action((ctx) => scheduleCurrentLineCenter(ctx.get(editorViewCtx)));
  }

  const clusterFocus = () =>
    editor.action((ctx) => {
      ctx.get(editorViewCtx).focus();
    });









  function runOneItemCommand(name: EditorCommand, payload?: CommandPayload): void {



    if (name === "frontMatter") {
      writeFrontMatter(payload?.frontMatter);
      return;
    }


    runCommand(editor, name, payload);
  }


















  function writeFrontMatter(body: string | null | undefined): void {
    if (readOnly) return;
    const newValueBlock =
      body === undefined
        ? frontMatter ?? replaceFrontMatter(null, newFrontMatterTemplate)
        : replaceFrontMatter(frontMatter, body ?? "");
    if (newValueBlock === frontMatter) return;
    frontMatter = newValueBlock;


    onChange?.(
      joinFrontMatter(
        frontMatter,
        editor.action((ctx) => ctx.get(serializerCtx)(ctx.get(editorViewCtx).state.doc)),
      ),
    );
  }


  const cursorToOpenHead = () =>
    editor.action((ctx) => {
      const view = ctx.get(editorViewCtx);
      const openingSelection = () => {
        const { doc } = view.state;
        let openingPosition: number | null = null;
        doc.descendants((node, position2) => {
          if (openingPosition !== null) return false;
          if (!node.isTextblock) return true;
          let position3 = position2 + 1;
          for (let index = 0; index < node.childCount; index++) {
            const child = node.child(index);
            if (child.type.name !== "notaSyntax") break;
            position3 += child.nodeSize;
          }
          openingPosition = position3;
          return false;
        });
        return openingPosition === null
          ? TextSelection.between(doc.resolve(0), doc.resolve(0))
          : TextSelection.create(doc, openingPosition);
      };




      const opening = openingSelection();
      view.dispatch(
        view.state.tr.setSelection(opening).scrollIntoView(),
      );




      view.focus();
      requestAnimationFrame(() => {
        if (view.isDestroyed) return;
        const syntaxType = view.state.schema.nodes.notaSyntax;
        if (syntaxType) {
          const normalized = normalizeInlineBlock(
            view.state,
            syntaxType,
            view.state.schema.nodes.notaEscape,
          );
          if (normalized) view.dispatch(normalized);
        }
        view.dispatch(view.state.tr.setSelection(openingSelection()));
      });
    });

  const restoreSelection = (selection: EditorSelectionRange) => {
    editor.action((ctx) => {
      const view = ctx.get(editorViewCtx);
      const { state } = view;
      const bounded = clampSelectionRange(selection, state.doc.content.size);
      let nextSelection = TextSelection.between(
        state.doc.resolve(bounded.anchor),
        state.doc.resolve(bounded.head),
      );
      try {
        nextSelection = TextSelection.create(state.doc, bounded.anchor, bounded.head);
      } catch {
        // Atom boundaries can reject an exact text selection. `between` moves
        // those endpoints to the nearest editable text position.
      }
      view.dispatch(state.tr.setSelection(nextSelection).scrollIntoView());
      view.focus();
    });
  };

  return {


    getMarkdown: () =>
      editor.action((ctx) => {
        const view = ctx.get(editorViewCtx);
        const serializer = ctx.get(serializerCtx);
        return joinFrontMatter(frontMatter, serializer(view.state.doc));
      }),

    setMarkdown: (markdown: string) => {



      //




      //



      //




      const newValueOf = splitFrontMatter(markdown);
      frontMatter = newValueOf.frontMatter;
      const replaceReplace = replaceAllContent(newValueOf.body2);
      editor.action((ctx) => {
        replaceReplace(ctx);
        if (readOnly) return;
        const view = ctx.get(editorViewCtx);
        view.dispatch(
          view.state.tr.setSelection(TextSelection.atStart(view.state.doc)).scrollIntoView(),
        );
      });
    },

    focus: clusterFocus,
    focusAtStart: cursorToOpenHead,





    //



    //



    insertAtCursorPlace: (text: string) => {
      if (readOnly) return false;
      editor.action((ctx) => {
        const view = ctx.get(editorViewCtx);
        const { from, to } = view.state.selection;
        const resolved = view.state.doc.resolve(from);
        const adjacentMarks =
          resolved.nodeBefore?.marks.length
            ? resolved.nodeBefore.marks
            : (resolved.nodeAfter?.marks ?? []);
        const marks =
          view.state.storedMarks?.length
            ? view.state.storedMarks
            : adjacentMarks.length
              ? adjacentMarks
              : resolved.marks();
        view.dispatch(
          view.state.tr.replaceWith(
            from,
            to,
            view.state.schema.text(text, marks),
          ),
        );
      });
      return true;
    },

    setWritingModes: (mode2: WritingMode) =>
      editor.action((ctx) => setWritingMode(ctx.get(editorViewCtx), mode2)),
    setVimInput: (config) =>
      editor.action((ctx) => setVimInputConfig(ctx.get(editorViewCtx), config)),

    setReview: (preview: changePreview | null, viewMode: previewMode) =>
      editor.action((ctx) => {
        const view = ctx.get(editorViewCtx);


        if (preview !== aboveCountPreview) {
          aboveCountPreview = preview;
          setPreview(view, preview);
        }
        if (preview) setViewMode2(view.dom, viewMode);
        else removeViewMode(view.dom);
      }),



    setFind: (query: string, options: FindOptions) =>
      editor.action((ctx) => setQuery(ctx.get(editorViewCtx), query, options)),
    findStep: (direction: 1 | -1) =>
      editor.action((ctx) => walk(ctx.get(editorViewCtx), direction)),
    clearFind: () => editor.action((ctx) => clearRemove(ctx.get(editorViewCtx))),
    replaceCurrent: (text: string) =>
      editor.action((ctx) => replaceReplaceCurrent(ctx.get(editorViewCtx), text)),
    replaceAll: (text: string) =>
      editor.action((ctx) => replaceAllMatches(ctx.get(editorViewCtx), text)),




    //



    selection: () =>
      editor.action((ctx) => {
        const view = ctx.get(editorViewCtx);
        const sel = view.state.selection;
        if (sel.empty) return null;
        const { dom, text } = view.serializeForClipboard(sel.content());
        return { text, html: dom.innerHTML };
      }),

    selectionRange: () =>
      editor.action((ctx) => {
        const { anchor, head } = ctx.get(editorViewCtx).state.selection;
        return { anchor, head };
      }),

    restoreSelection,

    jumpToMarkTitle: ({ index }) =>
      editor.action((ctx) => {
        const view = ctx.get(editorViewCtx);




        let n = 0;
        let pos = -1;
        view.state.doc.descendants((node, p) => {
          if (pos >= 0) return false;
          if (node.type.name === "heading") {
            if (n === index) {
              pos = p;
              return false;
            }
            n++;
          }
          return true;
        });
        if (pos < 0) return;


        view.dispatch(
          view.state.tr.setSelection(TextSelection.create(view.state.doc, pos + 1)),
        );


        view.focus();


        scrollPositionIntoView(view, pos + 1);
      }),

    runCommand: (name: EditorCommand, payload?: CommandPayload) => {


      runOneItemCommand(name, payload);






      //





      if (name !== "frontMatter") clusterFocus();


      return true;
    },

    destroy: () => {
      editor.destroy();
    },
  };
}
