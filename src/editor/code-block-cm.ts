
























































import { closeBrackets, closeBracketsKeymap } from "@codemirror/autocomplete";
import {
  cursorCharLeft,
  cursorCharRight,
  cursorLineDown,
  cursorLineUp,
  defaultKeymap,
  indentWithTab,
  selectLine,
} from "@codemirror/commands";
import { indentUnit } from "@codemirror/language";
import {
  Compartment,
  EditorSelection,
  EditorState,
  StateEffect,
  StateField,
} from "@codemirror/state";
import {
  Decoration,
  EditorView,
  ViewPlugin,
  highlightActiveLine,
  keymap,
  lineNumbers,
  type Command,
  type DecorationSet,
  type KeyBinding,
  type ViewUpdate,
} from "@codemirror/view";
import { refractor } from "refractor";
import { ensureFullLanguageTable } from "./refractor-runtime";
import { isMathCodeLanguage } from "./math-code";
import { CodeMirrorVimController } from "./code-vim";
import type { VimInputConfig, VimInputHooks } from "./plugin-vim-types";



import { wordRange, type range } from "./select";
import { codeBlockSourceEdge } from "./code-block-boundary";

export { codeBlockSourceEdge } from "./code-block-boundary";









const shrinkEnterWidthDegree = "    ";









import { computeMostSmallChangeAction } from "./code-block-change";

export { computeMostSmallChangeAction } from "./code-block-change";


type ShareWordNode = {
  type: string;
  value?: string;
  children?: ShareWordNode[];
  properties?: { className?: unknown };
};

export type ColorBlock = { from: number; to2: number; class: string };












export function shareColor(text2: string, language: string): ColorBlock[] {
  if (!text2 || !language) return [];
  const languageAlias: Readonly<Record<string, string>> = {
    gfm: "markdown",
    md: "markdown",
    mkd: "markdown",
    latex: "latex",
  };
  const resolvedLanguage = languageAlias[language.toLowerCase()] ?? language;
  if (!refractor.listLanguages().includes(resolvedLanguage)) return [];

  let tree: ShareWordNode;
  try {
    tree = refractor.highlight(text2, resolvedLanguage) as unknown as ShareWordNode;
  } catch {
    return [];
  }

  const output2: ColorBlock[] = [];
  let position3 = 0;
  const walk = (nodes: ShareWordNode[], tokenClasses: string[]): void => {
    for (const node of nodes) {
      if (node.type === "element") {
        const name3 = Array.isArray(node.properties?.className)
          ? (node.properties.className as string[])
          : [];
        walk(node.children ?? [], [...tokenClasses, ...name3]);
      } else if (typeof node.value === "string") {
        const to2 = position3 + node.value.length;
        if (tokenClasses.length && node.value.length) {
          output2.push({ from: position3, to2, class: tokenClasses.join(" ") });
        }
        position3 = to2;
      }
    }
  };
  walk(tree.children ?? [], []);
  return output2;
}


const openBracketNumber = "([{";
const closeBracketNumber = ")]}";















export function returnCarContinueLine(
  prefixText: string,
  afterText: string,
  singlePosition: string,
): { removeManyLess: number; insert: string; cursor: number } {
  const blankOnly = /^[ \t]*$/.test(prefixText);
  const shrinkEnter = /^[ \t]*/.exec(prefixText)?.[0] ?? "";

  const nonWhitespaceTail = prefixText.replace(/[ \t]+$/, "");
  const endCharacter = nonWhitespaceTail.slice(-1);




  const position2 = endCharacter === "" ? -1 : openBracketNumber.indexOf(endCharacter);
  const expectedClose = position2 >= 0 ? closeBracketNumber.charAt(position2) : "";

  const afterTextHead = /^[ \t]*/.exec(afterText)?.[0] ?? "";
  const afterTextFirst = afterText.charAt(afterTextHead.length);
  const receiveTail = expectedClose !== "" && afterTextFirst === expectedClose;

  if (receiveTail) {
    const insideShrinkEnter = shrinkEnter + singlePosition;
    return { removeManyLess: blankOnly ? prefixText.length : 0, insert: `\n${insideShrinkEnter}\n${shrinkEnter}`, cursor: 1 + insideShrinkEnter.length };
  }

  const newValueShrinkEnter = expectedClose !== "" ? shrinkEnter + singlePosition : shrinkEnter;
  return { removeManyLess: blankOnly ? prefixText.length : 0, insert: `\n${newValueShrinkEnter}`, cursor: 1 + newValueShrinkEnter.length };
}








export function lineBoundary(text2: string, position2: number): { enter: number; output2: number } {
  const position3 = Math.max(0, Math.min(text2.length, position2));
  const enter = text2.lastIndexOf("\n", position3 - 1) + 1;
  let output2 = text2.indexOf("\n", enter);
  if (output2 < 0) output2 = text2.length;
  return { enter, output2 };
}


















export function wholeLineCutPaste(
  text2: string,
  position2: number,
  isCutSplit: boolean,
): { text2: string; remove: { from: number; to: number } | null; cursor: number } | null {
  if (!text2) return null;
  const { enter, output2 } = lineBoundary(text2, position2);
  const hasBelowLine = output2 < text2.length;
  const lineText = text2.slice(enter, output2);
  const remove = isCutSplit
    ? {


        from: hasBelowLine ? enter : Math.max(0, enter - 1),
        to: hasBelowLine ? output2 + 1 : output2,
      }
    : null;
  return { text2: lineText + (hasBelowLine ? "\n" : ""), remove, cursor: remove ? remove.from : enter };
}




const setLanguageEffectResult = StateEffect.define<string>();

const languageField = StateField.define<string>({
  create: () => "",
  update(value2, transaction) {
    for (const EffectResult of transaction.effects) if (EffectResult.is(setLanguageEffectResult)) return EffectResult.value;
    return value2;
  },
});


const heavyComputeEffectResult = StateEffect.define<null>();


export function needWantDelayDelayActiveColor(lengthDegree: number): boolean {
  return lengthDegree > 2_000;
}

const lengthBlockActiveColorEqualPendingMilliSeconds = 80;

function computeDecorations(state: EditorState): DecorationSet {
  const text2 = state.doc.toString();
  const language = state.field(languageField, false) ?? "";
  const range = shareColor(text2, language).map((block) =>
    Decoration.mark({ class: block.class }).range(block.from, block.to2),
  );



  return Decoration.set(range, true);
}

const shareColorPlugin = ViewPlugin.fromClass(
  class {
    decorations: DecorationSet;
    private countTime: number | null = null;
    private activeActive = true;
    constructor(private view: EditorView) {
      this.decorations = computeDecorations(view.state);
    }
    update(u: ViewUpdate) {
      const languageChanged = u.startState.field(languageField, false) !== u.state.field(languageField, false);
      const wantHeavyCompute = u.transactions.some((transaction) =>
        transaction.effects.some((EffectResult) => EffectResult.is(heavyComputeEffectResult)),
      );
      if (languageChanged || wantHeavyCompute) {
        if (this.countTime !== null) window.clearTimeout(this.countTime);
        this.countTime = null;
        this.decorations = computeDecorations(u.state);
        return;
      }
      if (!u.docChanged) return;
      if (!needWantDelayDelayActiveColor(u.state.doc.length)) {
        if (this.countTime !== null) window.clearTimeout(this.countTime);
        this.countTime = null;
        this.decorations = computeDecorations(u.state);
        return;
      }



      this.decorations = this.decorations.map(u.changes);
      if (this.countTime !== null) window.clearTimeout(this.countTime);
      this.countTime = window.setTimeout(() => {
        this.countTime = null;
        if (!this.activeActive) return;
        this.view.dispatch({ effects: heavyComputeEffectResult.of(null) });
      }, lengthBlockActiveColorEqualPendingMilliSeconds);
    }
    destroy() {
      this.activeActive = false;
      if (this.countTime !== null) window.clearTimeout(this.countTime);
      this.countTime = null;
    }
  },
  { decorations: (v) => v.decorations },
);

const caretBeforeClass = "nota-code-caret-before";
const caretAfterClass = "nota-code-caret-after";
const emptyCaretClass = "nota-code-empty-caret";

/**
 * Bind the caret to a real character in CodeMirror's text flow.
 *
 * A widget at the exact end position is ambiguous in WebKit: CodeMirror accepts
 * it, but the browser can lay the zero-width box out on the following visual
 * line. Mark decorations have no such ambiguity. The caret bar is painted from
 * the neighbouring character, while an empty line uses a line decoration.
 */
class CodeBlockCaret {
  decorations: DecorationSet;

  constructor(readonly view: EditorView) {
    this.decorations = this.build(view);
  }

  update(update: ViewUpdate): void {
    if (
      update.focusChanged ||
      update.selectionSet ||
      update.docChanged ||
      update.viewportChanged
    ) {
      this.decorations = this.build(update.view);
    }
  }

  private build(view: EditorView): DecorationSet {
    const selection = view.state.selection.main;
    if (!view.hasFocus || !selection.empty || view.composing) {
      return Decoration.none;
    }
    const line = view.state.doc.lineAt(selection.head);
    if (line.length === 0) {
      return Decoration.set([
        Decoration.line({ class: emptyCaretClass }).range(line.from),
      ]);
    }
    if (selection.head === line.to) {
      return Decoration.set([
        Decoration.mark({ class: caretAfterClass }).range(line.to - 1, line.to),
      ]);
    }
    return Decoration.set([
      Decoration.mark({ class: caretBeforeClass }).range(
        selection.head,
        selection.head + 1,
      ),
    ]);
  }
}

const codeBlockCaret = ViewPlugin.fromClass(CodeBlockCaret, {
  decorations: (value) => value.decorations,
});

const transparentCaret = "rgba(0, 0, 0, 0)";
const imeComposingClass = "nota-ime-composing";

/**
 * CodeMirror owns composition state, but its native caret is suppressed by the
 * custom glyph-height decoration. Give the native caret back for the preedit so
 * it follows IME candidates, then restore the decoration after the edit lands.
 */
const imeNativeCaret = EditorView.domEventHandlers({
  compositionstart(_event, view) {
    view.contentDOM.classList.add(imeComposingClass);
    view.contentDOM.style.setProperty("caret-color", "var(--accent)", "important");
    return false;
  },
  compositionupdate(_event, view) {
    view.contentDOM.classList.add(imeComposingClass);
    return false;
  },
  compositionend(_event, view) {
    const contentDOM = view.contentDOM;
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        if (!contentDOM.isConnected) return;
        contentDOM.classList.remove(imeComposingClass);
        contentDOM.style.setProperty("caret-color", transparentCaret, "important");
      });
    });
    return false;
  },
});










const theme = EditorView.theme({
  "&": { backgroundColor: "transparent", color: "inherit", height: "auto" },
  "&.cm-focused": { outline: "none" },
  ".cm-scroller": {
    fontFamily: "var(--font-mono)",
    lineHeight: "inherit",



    overflow: "visible",
  },
  ".cm-content": {
    padding: "0 !important",
    minHeight: "0",
    fontFamily: "var(--font-mono)",
    caretColor: "transparent",


    outline: "none !important",
  },
  ".cm-line": { padding: "0", fontFamily: "var(--font-mono)" },




  "&.cm-focused > .cm-scroller > .cm-selectionLayer .cm-selectionBackground, .cm-selectionBackground, .cm-content ::selection": {
    backgroundColor: "color-mix(in srgb, var(--fg) 16%, transparent)",
  },

  //



  //





  //

  //








  "& .cm-activeLine": { backgroundColor: "transparent" },
  "&.cm-focused .cm-activeLine": { backgroundColor: "color-mix(in srgb, var(--fg) 5%, transparent)" },
});

/**
 * Keep only structural brackets and quotes in the automatic pairing table.
 * A backtick stays literal so one keystroke never becomes a template string
 * or an unintended Markdown code span.
 */
const codeBracketLanguageData = EditorState.languageData.of(() => [
  { closeBrackets: { brackets: ["(", "[", "{", "'", '"'], before: ")]}:;>" } },
]);
























const keypressNoneHandle = new WeakSet<EditorView>();



















const recordKeypress: Command = (target) => {
  keypressNoneHandle.add(target);
  return false;
};

function dropCutPasteBoard(event: ClipboardEvent, view: EditorView, isCutSplit: boolean): boolean {



  if (!keypressNoneHandle.has(view)) {
    event.preventDefault();
    return true;
  }
  keypressNoneHandle.delete(view);

  const selectionPlural = view.state.selection.ranges;
  if (selectionPlural.length !== 1 || !selectionPlural[0]!.empty) return false;
  const plan = wholeLineCutPaste(view.state.doc.toString(), selectionPlural[0]!.head, isCutSplit);
  if (!plan) return false;
  if (!event.clipboardData) return false;
  event.clipboardData.setData("text/plain", plan.text2);
  event.preventDefault();
  if (plan.remove) {
    view.dispatch({
      changes: { from: plan.remove.from, to: plan.remove.to },
      selection: EditorSelection.cursor(plan.cursor),
      scrollIntoView: true,
    });
  }
  return true;
}

















const wholeLineCutPastePlaceManage = EditorView.domEventHandlers({
  copy: (event, view) => dropCutPasteBoard(event, view, false),
  cut: (event, view) => dropCutPasteBoard(event, view, true),
});


export type codeBlockEditor = {

  view: EditorView;
  getText: () => string;
  getCursor: () => number;

  setText: (text4: string) => void;
  setLanguage2: (language2: string) => void;
  setSelection: (anchor2: number, head2: number) => void;
  setVimInput: (config: VimInputConfig | null) => void;
  clusterFocus: () => void;
  hasFocusPoint: () => boolean;
  cancelDestroy: () => void;
};

export type codeBlockEditorOptions = {
  initialStartText: string;
  initialStartLanguage: string;
  /** Use CodeMirror's native gutter for embedded editors without a host gutter. */
  nativeLineNumbers?: boolean;

  textChangeConvert: (newText: string, cursor: number) => void;
  clusterFocus: () => void;
  loseFocus: () => void;

  undoCancel: () => void;
  heavyDo: () => void;






  openHeadBackCell?: () => void;
  /** Move the document caret before this block when Left/Up is pressed at offset zero. */
  leaveHeadCell?: () => void;
  /** Move the document caret after this block when Right/Down is pressed at the end. */
  leaveTailCell?: () => void;
  /** Vim input supplied by a loaded editor.input extension. */
  vimInput?: VimInputConfig | null;
  vimHooks?: VimInputHooks;
};

export function createCodeBlockEditor(option: codeBlockEditorOptions): codeBlockEditor {
  let alreadyCancelDestroy = false;
  const vimController = new CodeMirrorVimController(
    option.vimInput ?? null,
    option.vimHooks ?? {},
  );










  const returnCarWithShrinkEnter: Command = ({ state, dispatch }) => {
    const main = state.selection.main;
    const line3 = state.doc.lineAt(main.from);
    const prefixText = state.sliceDoc(line3.from, main.from);
    const afterText = state.sliceDoc(main.to, line3.to);
    const { removeManyLess, insert, cursor } = returnCarContinueLine(prefixText, afterText, shrinkEnterWidthDegree);
    const from = main.from - removeManyLess;
    dispatch(
      state.update({
        changes: { from: from, to: main.to, insert: insert },
        selection: EditorSelection.cursor(from + cursor),
        scrollIntoView: true,
        userEvent: "input",
      }),
    );
    return true;
  };

  const undoCancelKey = { key: "Mod-z", run: () => (option.undoCancel(), true) };
  const heavyDoKey = [
    { key: "Shift-Mod-z", run: () => (option.heavyDo(), true) },
    { key: "Mod-y", run: () => (option.heavyDo(), true) },
  ];








  const cursorPlaceWord = (state: EditorState): range | null => {
    const head2 = state.selection.main.head;
    const line3 = state.doc.lineAt(head2);
    const word = wordRange(line3.text, head2 - line3.from);
    return word && { from: line3.from + word.from, to: line3.from + word.to };
  };


  const selectWordKey: Command = ({ state, dispatch }) => {
    const area = cursorPlaceWord(state);
    if (!area) return false;
    dispatch(state.update({ selection: EditorSelection.range(area.from, area.to), scrollIntoView: true }));
    return true;
  };


  const removeWordKey: Command = ({ state, dispatch }) => {
    const area = cursorPlaceWord(state);
    if (!area) return false;
    dispatch(
      state.update({
        changes: { from: area.from, to: area.to },
        selection: EditorSelection.cursor(area.from),
        scrollIntoView: true,
      }),
    );
    return true;
  };

  const selectChooseKey: KeyBinding[] = [



    {
      key: "Mod-l",
      run: (target) => {



        selectLine(target);
        return true;
      },
    },
    { key: "Mod-d", run: selectWordKey },
    { key: "Mod-Shift-d", run: removeWordKey },
  ];

  const leaveHeadCodeBlock: KeyBinding[] = [
    {
      key: "ArrowLeft",
      run: (target) => {
        const { state } = target;
        const selection = state.selection.main;
        const edge = codeBlockSourceEdge(state.doc, selection.head);
        if (selection.empty && (edge === "head" || edge === "both") && option.leaveHeadCell) {
          option.leaveHeadCell();
          return true;
        }
        return cursorCharLeft(target);
      },
    },
    {
      key: "ArrowUp",
      run: (target) => {
        const { state } = target;
        const selection = state.selection.main;
        const edge = codeBlockSourceEdge(state.doc, selection.head);
        if (selection.empty && (edge === "head" || edge === "both") && option.leaveHeadCell) {
          option.leaveHeadCell();
          return true;
        }
        cursorLineUp(target);
        return true;
      },
    },
  ];

  const leaveTailCodeBlock: KeyBinding[] = [
    {
      key: "ArrowRight",
      run: (target) => {
        const { state } = target;
        const selection = state.selection.main;
        const edge = codeBlockSourceEdge(state.doc, selection.head);
        if (selection.empty && (edge === "tail" || edge === "both") && option.leaveTailCell) {
          option.leaveTailCell();
          return true;
        }
        return cursorCharRight(target);
      },
    },
    {
      key: "ArrowDown",
      run: (target) => {
        const { state } = target;
        const selection = state.selection.main;
        const edge = codeBlockSourceEdge(state.doc, selection.head);
        if (selection.empty && (edge === "tail" || edge === "both") && option.leaveTailCell) {
          option.leaveTailCell();
          return true;
        }
        cursorLineDown(target);
        return true;
      },
    },
  ];






  const replaceLineCabin = new Compartment();
  const wantReplaceLine = () => document.documentElement.dataset.codeWrap !== "off";
  const lineNumberCabin = new Compartment();
  const wantLineNumbers = () =>
    option.nativeLineNumbers === true &&
    document.documentElement.dataset.codeLineNumbers === "on";

  const view = new EditorView({
    state: EditorState.create({
      doc: option.initialStartText,
      extensions: [
        codeBracketLanguageData,
        vimController.extension(),


        keymap.of([
          { key: "Enter", run: returnCarWithShrinkEnter },
          { key: "Shift-Enter", run: returnCarWithShrinkEnter },



          {
            key: "Backspace",
            run: (target) => {
              const area = target.state.selection.main;
              if (!area.empty || area.from !== 0) return false;
              option.openHeadBackCell?.();
              return true;
            },
          },
          undoCancelKey,
          ...heavyDoKey,
          ...selectChooseKey,
          ...leaveHeadCodeBlock,
          ...leaveTailCodeBlock,


          { key: "Mod-c", run: recordKeypress },
          { key: "Mod-x", run: recordKeypress },
          ...closeBracketsKeymap,
          ...defaultKeymap,
          indentWithTab,
        ]),
        closeBrackets(),
        indentUnit.of(shrinkEnterWidthDegree),
        EditorState.tabSize.of(shrinkEnterWidthDegree.length),
        languageField.init(() => option.initialStartLanguage),
        shareColorPlugin,
        wholeLineCutPastePlaceManage,



        EditorView.editorAttributes.of({ class: "nota-code-cm" }),


        highlightActiveLine(),
        lineNumberCabin.of(wantLineNumbers() ? lineNumbers() : []),
        replaceLineCabin.of(wantReplaceLine() ? EditorView.lineWrapping : []),
        theme,
        imeNativeCaret,
        codeBlockCaret,
        EditorView.updateListener.of((u) => {
          if (u.docChanged) {
            option.textChangeConvert(
              u.state.doc.toString(),
              u.state.selection.main.head,
            );
          }
          if (u.focusChanged) (u.view.hasFocus ? option.clusterFocus : option.loseFocus)();
        }),
      ],
    }),
  });

  // WebView2 can retain a platform-drawn native caret even when an author
  // stylesheet sets transparent. Inline !important is the final precedence
  // layer above document themes and editor.css, and forced-color-adjust keeps
  // Windows accessibility palettes from restoring it.
  for (const element of [view.contentDOM, view.scrollDOM]) {
    element.style.setProperty("caret-color", transparentCaret, "important");
    element.style.setProperty("forced-color-adjust", "none", "important");
  }
  view.contentDOM.dataset.notaCaretBuild = "inline-mark-v8";

  const watchSettings = new MutationObserver(() => {
    if (alreadyCancelDestroy) return;
    view.dispatch({
      effects: [
        replaceLineCabin.reconfigure(
          wantReplaceLine() ? EditorView.lineWrapping : [],
        ),
        lineNumberCabin.reconfigure(wantLineNumbers() ? lineNumbers() : []),
      ],
    });
  });
  watchSettings.observe(document.documentElement, {
    attributes: true,
    attributeFilter: ["data-code-wrap", "data-code-line-numbers"],
  });



  const initialLanguage = option.initialStartLanguage;
  if (
    initialLanguage &&
    !isMathCodeLanguage(initialLanguage) &&
    !refractor.registered(initialLanguage)
  ) {
    void ensureFullLanguageTable().then(() => {
      if (alreadyCancelDestroy) return;
      try {
        view.dispatch({ effects: heavyComputeEffectResult.of(null) });
      } catch {

      }
    });
  }

  return {
    view,
    getText: () => view.state.doc.toString(),
    getCursor: () => view.state.selection.main.head,
    setText: (text4) => {
      const oldValue = view.state.doc.toString();
      if (oldValue === text4) return;
      const { deleteStart, deleteEnd, insert } = computeMostSmallChangeAction(oldValue, text4);
      view.dispatch({ changes: { from: deleteStart, to: deleteEnd, insert: insert } });
    },
    setLanguage2: (language2) => {
      if (view.state.field(languageField) === language2) return;
      view.dispatch({ effects: setLanguageEffectResult.of(language2) });
    },
    setSelection: (anchor2, head2) => {
      const length = view.state.doc.length;
      const clamp = (n: number) => Math.max(0, Math.min(length, n));
      const newValue = EditorSelection.range(clamp(anchor2), clamp(head2));
      const oldValue = view.state.selection.main;
      if (oldValue.anchor === newValue.anchor && oldValue.head === newValue.head) return;
      view.dispatch({ selection: newValue });
    },
    setVimInput: (config) => {
      vimController.setConfig(view, config);
    },
    clusterFocus: () => {
      view.requestMeasure();
      view.focus();
      requestAnimationFrame(() => {
        if (!alreadyCancelDestroy) view.requestMeasure();
      });
    },
    hasFocusPoint: () => view.hasFocus,
    cancelDestroy: () => {
      alreadyCancelDestroy = true;
      watchSettings.disconnect();
      view.destroy();
    },
  };
}
