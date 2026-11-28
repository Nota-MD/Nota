
























import { codeBlockSchema } from "@milkdown/kit/preset/commonmark";
import { katexOptionsCtx } from "./math-schema";
import { redo, undo } from "@milkdown/kit/prose/history";
import type { Node as PMNode } from "@milkdown/kit/prose/model";
import { Plugin, PluginKey, type Command } from "@milkdown/kit/prose/state";
import { TextSelection } from "@milkdown/kit/prose/state";
import type { EditorView, NodeView } from "@milkdown/kit/prose/view";
import { $prose, $view } from "@milkdown/kit/utils";
import type { KatexOptions } from "katex";
import { refractor } from "refractor";
import { t } from "@/i18n";

import { computeMostSmallChangeAction } from "./code-block-change";
import type { codeBlockEditor } from "./code-block-cm";
import { liftCodeBlockToParagraphs } from "./code-block-lift";
import {
  bootstrapCodeBlockExit,
  codeBlockKeyboardEntryPosition,
  codeBlockExitTransaction,
  moveBootstrapCodeBlockCaret,
  type CodeBlockExitSide,
} from "./code-block-boundary";
import { createHTMLPreview } from "./code-preview";
import { createLanguagePicker } from "./lang-picker";
import { hasDedicatedBelongIcon } from "./lang-icon";
import {
  ensureLanguageIcons,
  languageIconsReady,
  relatedIconLanguages,
  representTableLanguage,
} from "./lang-icon-registry";
import {
  createNumberLearnCodeOutput,
  isMathCodeLanguage,
  normalizeMathCodeLanguage,
} from "./math-code";
import {
  ensureFullLanguageTable,
  languageTableReady,
} from "./refractor-runtime";
import { vimInputConfig, vimInputHooks } from "./plugin-vim-input";
import { shouldHydrateNearViewport } from "./large-doc";
import { requestCodeBlockHighlight } from "./lazy-prism";
import { observeNearViewport } from "./viewport-visibility";


const NO_LANGUAGE = "";


const codeBlockFocusEvent = "nota-code-block-focus";





export function requestCodeBlockFocus(view: EditorView, pos: number): boolean {
  const dom = view.nodeDOM(pos);
  if (!(dom instanceof HTMLElement)) return false;
  dom.dispatchEvent(new Event(codeBlockFocusEvent));
  return true;
}


export const codeBlockKeyboardEntry = $prose(
  () =>
    new Plugin({
      key: new PluginKey("nota-code-block-keyboard-entry"),
      view: (editorView) => {
        const onKeyDown = (event: KeyboardEvent) => {
          if (
            editorView.composing ||
            event.ctrlKey ||
            event.metaKey ||
            event.altKey ||
            event.shiftKey
          ) {
            return;
          }
          const position = codeBlockKeyboardEntryPosition(editorView.state, event.key);
          if (position === null || !requestCodeBlockFocus(editorView, position)) return;
          event.preventDefault();
          event.stopPropagation();
        };
        editorView.dom.addEventListener("keydown", onKeyDown, true);
        return {
          destroy: () => editorView.dom.removeEventListener("keydown", onKeyDown, true),
        };
      },
    }),
);


const numberLearnLanguageDistinguishName = "math";


let sortedLanguages: string[] | null = null;


























export { languageTableReady };


export function awaitLanguageTable(): Promise<void> {
  return Promise.all([ensureFullLanguageTable(), ensureLanguageIcons()]).then(() => {

    sortedLanguages = null;
    searchableLanguages = null;
  });
}


















export function allLanguages(): string[] {
  if (sortedLanguages === null) {
    const languages = refractor.listLanguages();
    if (!languageIconsReady()) {
      return [...new Set([...languages.filter((name3) => name3.trim() !== ""), numberLearnLanguageDistinguishName])].sort(
        (a, b) => a.localeCompare(b),
      );
    }
    sortedLanguages = languages
      .filter((name3) => hasDedicatedBelongIcon(name3) || name3 === numberLearnLanguageDistinguishName)








      .filter((name3) => representTableLanguage(name3) === name3)
      .sort((a, b) => a.localeCompare(b));
  }
  return sortedLanguages;
}

let searchableLanguages: string[] | null = null;


export function searchLanguages(): string[] {
  if (searchableLanguages === null) {
    searchableLanguages = [
      ...new Set([
        ...refractor.listLanguages().filter((name3) => name3.trim() !== ""),
        "math",
        "latex",
        "tex",
      ]),
    ].sort((a, b) => a.localeCompare(b));
  }
  return searchableLanguages;
}








export function relatedLanguages(id: string): readonly string[] {
  return relatedIconLanguages(id);
}














export async function writeClipboard(text: string): Promise<boolean> {
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {

  }

  const scratch = document.createElement("textarea");
  scratch.value = text;

  scratch.style.position = "fixed";
  scratch.style.top = "-1000px";
  scratch.style.opacity = "0";
  document.body.appendChild(scratch);
  scratch.select();

  let ok = false;
  try {
    ok = document.execCommand("copy");
  } catch {
    ok = false;
  }
  document.body.removeChild(scratch);
  return ok;
}

export const codeBlockView = $view(



  codeBlockSchema.node,
  (ctx) => {
    let numberLearnOption: KatexOptions = {};
    try {
      numberLearnOption = ctx.get(katexOptionsCtx.key) ?? {};
    } catch {

    }
    return (initialNode: PMNode, view: EditorView, getPos: () => number | undefined): NodeView => {
























      const pre = document.createElement("pre");


      pre.className = "md-fences md-fences-with-lineno ty-contain-cm nota-source-surface";
















      pre.contentEditable = "false";
      const code = document.createElement("code");
      code.className = "nota-code-text";




      for (const [property, value] of Object.entries({
        position: "absolute",
        top: "0",
        left: "-100000px",
        display: "block",
        width: "1px",
        height: "1px",
        overflow: "hidden",
        opacity: "0",
        visibility: "hidden",
        "clip-path": "inset(50%)",
        "pointer-events": "none",
        "user-select": "none",
        "-webkit-user-select": "none",
      })) {
        code.style.setProperty(property, value, "important");
      }
      code.setAttribute("aria-hidden", "true");










      const applyLanguage = (lang: string) => {
        lang = normalizeMathCodeLanguage(lang);
        const pos = getPos();
        if (typeof pos !== "number") return;

        const current = view.state.doc.nodeAt(pos);
        if (!current || current.type.name !== "code_block") return;
        if (current.attrs.language === lang) return;

        view.dispatch(
          view.state.tr.setNodeMarkup(pos, undefined, { ...current.attrs, language: lang }),
        );
        view.focus();
      };













      const langWrap = document.createElement("span");
      langWrap.className = "nota-code-lang-wrap";
      langWrap.contentEditable = "false";










      let currentNode = initialNode;
      let codeEditor: codeBlockEditor | null = null;
      let editorDisposed = false;
      let waitingSelection: [number, number] | null = null;
      let waitingFocus = false;

      type LanguagePicker = ReturnType<typeof createLanguagePicker>;
      let languagePicker: LanguagePicker | null = null;
      const ensureLanguagePicker = (): LanguagePicker => {
        if (languagePicker) return languagePicker;
        languagePicker = createLanguagePicker({
          allLanguages: allLanguages,
          searchSearchLanguage: searchLanguages,
          prepare: awaitLanguageTable,
          distinguishName: relatedLanguages,
          currentLanguage: () => languageOf(currentNode),
          selectLanguage: applyLanguage,
          restoreFocus: () => codeEditor?.clusterFocus(),
        });
        langWrap.appendChild(languagePicker.dom);
        return languagePicker;
      };


      const numberLearn = createNumberLearnCodeOutput(numberLearnOption);
      const setNumberLearnEditEdit = (open2: boolean) => {
        wrap.classList.toggle("nota-code-math-editing", open2);
      };






      let sameStepMiddle = false;


      const walkCommand = (command: Command) => {
        command(view.state, view.dispatch, view);
      };





      const bootstrap = document.createElement("textarea");
      bootstrap.className = "nota-code-bootstrap";
      bootstrap.value = initialNode.textContent;
      bootstrap.rows = Math.max(1, bootstrap.value.split("\n").length);
      bootstrap.setAttribute("spellcheck", "false");
      bootstrap.setAttribute("aria-label", "Code");

      const openHeadCell = () => {
        const pos = getPos();
        if (typeof pos !== "number") return;
        const current = view.state.doc.nodeAt(pos);
        if (!current || current.type.name !== "code_block") return;


        const paragraph = liftCodeBlockToParagraphs(current, view.state.schema);
        if (!paragraph) return;
        const tr = view.state.tr.replaceWith(pos, pos + current.nodeSize, paragraph);
        tr.setSelection(TextSelection.near(tr.doc.resolve(pos + 1)));
        view.dispatch(tr.scrollIntoView());
        view.focus();
      };


      const leaveCodeBlock = (side: CodeBlockExitSide) => {
        const pos = getPos();
        if (typeof pos !== "number") return;
        const current = view.state.doc.nodeAt(pos);
        if (!current || current.type.name !== "code_block") return;
        const transaction = codeBlockExitTransaction(view.state, pos, current, side);
        if (!transaction) return;
        view.dispatch(transaction.scrollIntoView());
        view.focus();
      };
      const leaveHeadCell = () => leaveCodeBlock("before");
      const leaveTailCell = () => leaveCodeBlock("after");












      function pushReturnDocument(newText: string, cursorHint?: number) {
        if (sameStepMiddle) return;
        const pos = getPos();
        if (typeof pos !== "number") return;
        const liveNode = view.state.doc.nodeAt(pos);
        if (!liveNode || liveNode.type.name !== "code_block") return;
        const oldText = liveNode.textContent;
        if (oldText === newText) return;

        const { deleteStart, deleteEnd, insert } = computeMostSmallChangeAction(oldText, newText);
        if (deleteStart === deleteEnd && !insert) return;

        const base = pos + 1;
        let transaction = view.state.tr;
        if (deleteStart < deleteEnd) {
          transaction = insert
            ? transaction.replaceWith(base + deleteStart, base + deleteEnd, view.state.schema.text(insert))
            : transaction.delete(base + deleteStart, base + deleteEnd);
        } else {
          transaction = transaction.insertText(insert, base + deleteStart);
        }

        try {
          transaction = transaction.setSelection(
            TextSelection.create(transaction.doc, base + (cursorHint ?? codeEditor?.getCursor() ?? 0)),
          );
        } catch {

        }

        sameStepMiddle = true;
        try {
          view.dispatch(transaction);
        } finally {
          sameStepMiddle = false;
        }
      }









      function recognizeLeadSelection() {
        const pos = getPos();
        if (typeof pos !== "number") return;
        try {
          const to2 = pos + 1 + (codeEditor?.getCursor() ?? bootstrap.selectionStart);
          view.dispatch(
            view.state.tr
              .setSelection(TextSelection.create(view.state.doc, to2))
              .setMeta("addToHistory", false),
          );
        } catch {

        }
      }

      bootstrap.addEventListener("input", () => {
        bootstrap.rows = Math.max(1, bootstrap.value.split("\n").length);
        pushReturnDocument(bootstrap.value, bootstrap.selectionStart);
      });




      let editorStarted = false;
      let heavyPreviewStarted = false;
      let stopVisibilityObserver: (() => void) | null = null;
      const ensureCodeBlockEditor = () => {
        if (editorStarted || editorDisposed) return;
        editorStarted = true;
        stopVisibilityObserver?.();
        stopVisibilityObserver = null;
        void import("./code-block-cm")
          .then(({ createCodeBlockEditor }) => {
            if (editorDisposed) return;
            const editor = createCodeBlockEditor({
              initialStartText: currentNode.textContent,
              initialStartLanguage: languageOf(currentNode),
              nativeLineNumbers: true,
              textChangeConvert: (newText, cursor) =>
                pushReturnDocument(newText, cursor),
              clusterFocus: () => {
                setNumberLearnEditEdit(true);
                recognizeLeadSelection();
              },
              loseFocus: () => {
                queueMicrotask(() => {
                  if (!wrap.contains(document.activeElement)) setNumberLearnEditEdit(false);
                });
              },
              undoCancel: () => walkCommand(undo),
              heavyDo: () => walkCommand(redo),
              openHeadBackCell: openHeadCell,
              leaveHeadCell,
              leaveTailCell,
              vimInput: vimInputConfig(view.state),
              vimHooks: vimInputHooks(view),
            });
            codeEditor = editor;
            bootstrap.replaceWith(editor.view.dom);
            syncChrome(currentNode);
            if (waitingSelection) editor.setSelection(...waitingSelection);
            if (waitingFocus) editor.clusterFocus();
          })
          .catch((error: unknown) => {
            console.error("[nota] code editor failed to load", error);
            bootstrap.classList.add("nota-code-bootstrap-error");
            bootstrap.setAttribute("aria-label", t("Code editor failed to load"));
          });
      };
      bootstrap.addEventListener("focusin", ensureCodeBlockEditor);
      bootstrap.addEventListener("keydown", (event) => {
        if (
          event.isComposing ||
          event.shiftKey ||
          event.ctrlKey ||
          event.metaKey ||
          event.altKey ||
          bootstrap.selectionStart !== bootstrap.selectionEnd
        ) {
          return;
        }
        const caret = bootstrap.selectionStart;
        if (caret === null) return;
        const exit = bootstrapCodeBlockExit(bootstrap.value, caret, event.key);
        if (exit) {
          event.preventDefault();
          event.stopPropagation();
          if (exit === "before") leaveHeadCell();
          else leaveTailCell();
          return;
        }
        if (["ArrowLeft", "ArrowUp", "ArrowRight", "ArrowDown"].includes(event.key)) {
          event.preventDefault();
          event.stopPropagation();
          const next = moveBootstrapCodeBlockCaret(bootstrap.value, caret, event.key);
          bootstrap.setSelectionRange(next, next);
        }
      });














      const wrap = document.createElement("div");
      wrap.className = "nota-code-wrap";
      const preview = createHTMLPreview();



      pre.append(code, bootstrap, langWrap);



      wrap.append(pre, numberLearn.element, preview.element);

      let languageLayoutFrame = 0;
      let languageLayoutObserver: ResizeObserver | null = null;
      let languageLayoutStarted = false;
      const placeLanguagePicker = () => {
        languageLayoutFrame = 0;
        const parent =
          langWrap.offsetParent instanceof HTMLElement ? langWrap.offsetParent : wrap;
        if (parent === pre) {



          langWrap.style.top = `${pre.offsetHeight - pre.clientTop}px`;
          return;
        }
        const parentBox = parent.getBoundingClientRect();
        const preBox = pre.getBoundingClientRect();
        const zoom = window.visualViewport?.scale || 1;
        const parentPaddingTop = parentBox.top + parent.clientTop;
        langWrap.style.top = `${(preBox.bottom - parentPaddingTop) / zoom}px`;
      };
      const scheduleLanguageLayout = () => {
        if (!languageLayoutStarted) return;
        cancelAnimationFrame(languageLayoutFrame);
        languageLayoutFrame = requestAnimationFrame(placeLanguagePicker);
      };
      const startLanguageLayout = () => {
        if (languageLayoutStarted) return;
        languageLayoutStarted = true;
        if (typeof ResizeObserver !== "undefined") {
          languageLayoutObserver = new ResizeObserver(scheduleLanguageLayout);
          languageLayoutObserver.observe(pre);
        }
        window.addEventListener("resize", scheduleLanguageLayout);
        document.addEventListener("scroll", scheduleLanguageLayout, true);
        scheduleLanguageLayout();
      };



      const startHeavyContent = () => {
        if (heavyPreviewStarted) return;
        heavyPreviewStarted = true;
        const position = getPos();
        if (typeof position === "number") {
          requestCodeBlockHighlight(view, position);
        }
        ensureLanguagePicker();
        startLanguageLayout();
        syncChrome(currentNode);
        preview.sameStep(currentNode, true);
      };

      const requestFocus = () => {
        startHeavyContent();
        setNumberLearnEditEdit(true);
        waitingFocus = true;
        if (codeEditor) codeEditor.clusterFocus();
        else bootstrap.focus();
      };
      wrap.addEventListener(codeBlockFocusEvent, requestFocus);

      if (!view.editable) queueMicrotask(startHeavyContent);
      else if (!shouldHydrateNearViewport(view.state.doc.content.size)) {
        queueMicrotask(() => {
          startHeavyContent();
          ensureCodeBlockEditor();
        });
      } else {
        stopVisibilityObserver = observeNearViewport(wrap, view, (near) => {
          if (!near) return;
          stopVisibilityObserver?.();
          stopVisibilityObserver = null;
          startHeavyContent();
        });
      }


      numberLearn.element.addEventListener("mousedown", (event) => {
        event.preventDefault();
        startHeavyContent();
        setNumberLearnEditEdit(true);
        if (codeEditor) codeEditor.clusterFocus();
        else {
          waitingFocus = true;
          bootstrap.focus();
        }
      });




      pre.addEventListener("mousedown", (e) => {
        const target = e.target;
        if (!(target instanceof Node)) return;
        if (inChrome(target)) return;
        startHeavyContent();
        setNumberLearnEditEdit(true);
        if (codeEditor) codeEditor.clusterFocus();
        else {
          waitingFocus = true;
          bootstrap.focus();
        }
      }, true);



      const inChrome = (target: EventTarget | null) =>
        target instanceof Node &&
        (langWrap.contains(target) || numberLearn.element.contains(target));

      const syncChrome = (node: PMNode) => {
        const lang = languageOf(node);

        if (lang) pre.dataset.language = lang;
        else delete pre.dataset.language;



        languagePicker?.setLanguage2(lang);



        codeEditor?.setLanguage2(lang);
        const isMath = isMathCodeLanguage(lang);
        wrap.classList.toggle("nota-code-math", isMath);
        numberLearn.element.hidden = !isMath || !heavyPreviewStarted;
        if (isMath) {
          if (heavyPreviewStarted) numberLearn.sameStep(node.textContent);
          const pos = getPos();
          const selection = view.state.selection;
          const selectionAtBlockInside =
            typeof pos === "number" &&
            selection.from >= pos &&
            selection.to <= pos + node.nodeSize;
          if (wrap.contains(document.activeElement) || selectionAtBlockInside) setNumberLearnEditEdit(true);
          else setNumberLearnEditEdit(false);
        } else {
          setNumberLearnEditEdit(false);
        }


        if (heavyPreviewStarted) preview.sameStep(node);
        scheduleLanguageLayout();
      };




      syncChrome(initialNode);
      if (heavyPreviewStarted) preview.sameStep(initialNode, true);

      return {
        dom: wrap,
        contentDOM: code,

        update: (updated) => {

          if (updated.type !== initialNode.type) return false;


          currentNode = updated;
          syncChrome(updated);
          codeEditor?.setVimInput(vimInputConfig(view.state));




          const text4 = updated.textContent;
          if (!sameStepMiddle && bootstrap.isConnected && bootstrap.value !== text4) {
            bootstrap.value = text4;
          }
          if (codeEditor && !sameStepMiddle && text4 !== codeEditor.getText()) {
            sameStepMiddle = true;
            try {
              codeEditor.setText(text4);
            } finally {
              sameStepMiddle = false;
            }
          }
          return true;
        },













        stopEvent: (e) =>
          e.target instanceof Node &&
          (pre.contains(e.target) ||
            numberLearn.element.contains(e.target) ||
            preview.element.contains(e.target)),



        ignoreMutation: () => true,




        setSelection: (anchor2, head2) => {
          startHeavyContent();
          ensureCodeBlockEditor();
          setNumberLearnEditEdit(true);
          const length = codeEditor?.getText().length ?? currentNode.textContent.length;
          const clamp = (n: number) => Math.max(0, Math.min(length, n - 1));
          const anchor = clamp(anchor2);
          const head = clamp(head2);
          waitingSelection = [anchor, head];
          if (codeEditor) {
            codeEditor.setSelection(anchor, head);
            codeEditor.clusterFocus();
          }
        },







        destroy: () => {
          editorDisposed = true;
          stopVisibilityObserver?.();
          stopVisibilityObserver = null;
          languageLayoutObserver?.disconnect();
          cancelAnimationFrame(languageLayoutFrame);
          wrap.removeEventListener(codeBlockFocusEvent, requestFocus);
          if (languageLayoutStarted) {
            window.removeEventListener("resize", scheduleLanguageLayout);
            document.removeEventListener("scroll", scheduleLanguageLayout, true);
          }
          languagePicker?.cancelDestroy();
          codeEditor?.cancelDestroy();

          preview.cancelDestroy();
        },
      };
    };
  },
);


function languageOf(node: PMNode): string {
  const raw = node.attrs.language;
  return typeof raw === "string" ? raw : NO_LANGUAGE;
}
