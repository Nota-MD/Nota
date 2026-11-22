


























































































import type { Ctx } from "@milkdown/kit/ctx";
import type { Node as PMNode } from "@milkdown/kit/prose/model";
import { NodeSelection, TextSelection } from "@milkdown/kit/prose/state";
import { redo, undo } from "@milkdown/kit/prose/history";
import type { EditorView, NodeView, NodeViewConstructor } from "@milkdown/kit/prose/view";
import { Decoration } from "@milkdown/kit/prose/view";
import { $view } from "@milkdown/kit/utils";
import { katexOptionsCtx, mathBlockSchema, mathInlineSchema } from "./math-schema";
import type { KatexOptions } from "katex";

import { t } from "@/i18n";
import { debugEvent } from "@/ui/debug-log";
import type { codeBlockEditor } from "./code-block-cm";
import { createCommandTable, type ReceiveBelow } from "./math-commands";
import { createCreateProposalBox, useOptionDrawPreview } from "./math-suggest";
import { mathDelimiterText } from "./math-delim";
import { fitMathSourceSize, redrawAfterMount, watchFontMetrics } from "./math-inline-measure";
import { mountInlinePreview, type InlinePreviewController } from "./math-inline-preview";
import { inlineMathInputAtEdge, setInlineMathEditing, setInlineMathInputFocus } from "./math-inline-input";
import { createEmptyMathPosition, drawLatestMath } from "./math-render-target";
import { createInlineMathHitZones, inlineMathBoundaryEditing, inlineMathHitCaret, releaseInlineMathNodeSelection } from "./math-inline-boundary";
import {
  commonStyleCurrent,
  commonStyleCurrentKey,
  inlineMathFocusConsumed,
  pendingInlineMathFocus,
  readDecoration,
  recognizeNode,
} from "./math-current";
import { exactTextSelection } from "./inline-caret";
import { drawUpstream, readSource, writeEnterSource } from "./math-view-source";
import { preserveInlineMathSourceFocus, scheduleInlineMathFocus } from "./math-inline-focus";
import { createCodeBlockExitNavigator } from "./code-block-boundary";
import { bindInlineMathSourceEvents, isImeComposingKey } from "./math-inline-events";
import { vimInputConfig, vimInputHooks } from "./plugin-vim-input";

export { commonStyleCurrent, computeDecorations, recognizeNode, returnPositionSelection } from "./math-current";
export { readSource, writeEnterSource } from "./math-view-source";




const panelClass = "nota-math-panel";


const sourceClass = "nota-math-source";


const separatorClass = "nota-math-delim";


const renderClass = "nota-math-render";








const previewClass = "nota-math-preview";


const numberLearnLabelClass = "nota-math-kind";








const rulerClass = "nota-math-ruler";















function createCommonStyleView(kindClass: "inline" | "block", option: KatexOptions): NodeViewConstructor {
  const inline = kindClass === "inline";


  const table2 = createCommandTable(Object.keys(option.macros ?? {}).length > 0);

  return (
    initialStart: PMNode,
    view: EditorView,
    getPos: () => number | undefined,
    decorations: readonly Decoration[],
  ): NodeView => {




















    const dom = document.createElement(inline ? "span" : "div");
    dom.className = `nota-math nota-math-${inline ? "inline" : "block"}`;
    if (!inline) dom.classList.add("md-math-block");
    dom.classList.toggle("nota-math-readonly", !view.editable);

    const render = document.createElement(inline ? "span" : "div");
    render.className = renderClass;


    const preview = document.createElement(inline ? "span" : "div");
    preview.className = previewClass;

    preview.contentEditable = "false";

    const panel = document.createElement(inline ? "span" : "div");
    panel.className = panelClass;
    panel.contentEditable = "false";

    const numberLearnLabel = document.createElement("button");
    numberLearnLabel.type = "button";
    numberLearnLabel.className = `${numberLearnLabelClass} nota-block-kind`;
    numberLearnLabel.textContent = t("Formula");
    numberLearnLabel.title = t("Finish editing");
    numberLearnLabel.setAttribute("aria-label", t("Finish editing"));


    let current = initialStart;

    const createSeparator = (closing = false): HTMLElement => {
      const el = document.createElement("span");
      el.className = separatorClass;
      if (inline && closing) el.classList.add("nota-math-delim-close");
      el.textContent = inline ? mathDelimiterText(current, closing) : "$$";

      el.setAttribute("aria-hidden", "true");
      return el;
    };

    const input: HTMLInputElement | HTMLTextAreaElement = inline
      ? document.createElement("input")
      : document.createElement("textarea");
    input.className = sourceClass;
    if (!inline) input.classList.add("nota-diagram-source-bootstrap");
    input.spellcheck = false;
    input.setAttribute("aria-label", t("Math Source (LaTeX)"));
    input.placeholder = inline ? "" : t("e.g. \\frac{a}{b}");
    if (inline) (input as HTMLInputElement).type = "text";
    else (input as HTMLTextAreaElement).rows = 1;

    const ruler = document.createElement("span");
    ruler.className = rulerClass;
    ruler.setAttribute("aria-hidden", "true");
    const { before: hitBefore, after: hitAfter } = createInlineMathHitZones();
    const inlinePreview: InlinePreviewController | null =
      inline && view.editable ? mountInlinePreview(preview, panel) : null;

    const blockSourceShell = document.createElement("pre");
    blockSourceShell.className =
      "md-fences ty-contain-cm nota-source-surface nota-math-source-shell nota-diagram-source nota-diagram-cm";
    blockSourceShell.contentEditable = "false";
    blockSourceShell.append(input);


    let blockCodeEditor: codeBlockEditor | null = null;
    let blockEditorStarted = false;

    const editingSource = () => blockCodeEditor?.getText() ?? input.value;
    const refreshInlineEdge = () => {
      dom.classList.toggle(
        "nota-math-trailing-backslash",
        inline && input.value.endsWith("\\"),
      );
    };

    const replaceEditingSource = (text: string, cursor?: number) => {
      input.value = text;
      if (blockCodeEditor && blockCodeEditor.getText() !== text) {
        blockCodeEditor.setText(text);
      }
      if (cursor !== undefined && !blockCodeEditor) input.setSelectionRange(cursor, cursor);
    };











    function shouldUseCreateProposal(result3: ReceiveBelow): void {
      replaceEditingSource(result3.source3, result3.cursor);
      blockCodeEditor?.setSelection(result3.cursor, result3.cursor);
      followSourceChangeRulerInch();
      dispatch(result3.source3);
    }

    const createProposal = createCreateProposalBox({
      table2,
      inline,
      position: inline
        ? (element) => {
            const anchor = input.getBoundingClientRect();
            const popup = element.getBoundingClientRect();
            const width = popup.width || 320;
            const height = popup.height || 260;
            const viewportWidth = typeof window === "undefined" ? 1024 : window.innerWidth;
            const viewportHeight = typeof window === "undefined" ? 768 : window.innerHeight;
            const left = Math.max(8, Math.min(anchor.left, viewportWidth - width - 8));
            const below = anchor.bottom + 4;
            const top = below + height <= viewportHeight - 8
              ? below
              : Math.max(8, anchor.top - height - 6);
            element.style.left = `${left}px`;
            element.style.top = `${top}px`;
          }
        : undefined,


      drawPreview: useOptionDrawPreview(option),
      receiveBelowAfter: shouldUseCreateProposal,
      reportActivity: (id) => {


        const activeTarget = blockCodeEditor?.view.contentDOM ?? input;
        if (id) activeTarget.setAttribute("aria-activedescendant", id);
        else activeTarget.removeAttribute("aria-activedescendant");
      },
    });

    if (inline) {



      document.body.append(createProposal.element);
      panel.append(
        hitBefore,
        createSeparator(),
        input,
        createSeparator(true),
        ruler,
        hitAfter,
      );
    } else {
      panel.append(
        createSeparator(),
        blockSourceShell,
        createSeparator(true),
        ruler,
        createProposal.element,
      );
    }
    dom.append(render);




    if (view.editable) {
      dom.append(panel);
      if (!inline) dom.append(preview, numberLearnLabel);
    }



    let mostAfterDispatch = readSource(initialStart); let decorationCurrent = readDecoration(decorations);

    let nodeSelected = view.state.selection instanceof NodeSelection; let boxInsideHasFocusPoint = false;








    function panelShouldOpen(): boolean {
      return view.editable && (decorationCurrent || boxInsideHasFocusPoint);
    }


    const createOccupyPosition = (): HTMLElement =>
      createEmptyMathPosition(inline, inline ? t("Empty inline math") : t("Empty math block — click to write LaTeX"));







    const drawEnter = (target: HTMLElement, source2: string) => drawLatestMath(target, source2, option);


    function heavyDraw(): void {
      if (!view.editable) {
        render.replaceChildren(); preview.replaceChildren();
        render.dataset.state = ""; preview.dataset.state = "";
        delete render.dataset.source; delete preview.dataset.source;
        const upstream = drawUpstream(current);
        render.append(upstream); drawEnter(upstream, readSource(current));
        return;
      }

      const source2 = readSource(current);
      const emptyValue = source2.trim() === "";

      if (panelShouldOpen()) {
        render.replaceChildren(); render.dataset.state = ""; delete render.dataset.source;

        if (emptyValue) {
          if (inline) {
            preview.replaceChildren(); preview.dataset.state = "";
            preview.dataset.source = source2;
            inlinePreview?.setVisible(false);
          } else if (preview.dataset.source !== source2 || preview.dataset.state !== "empty") {
            preview.replaceChildren(createOccupyPosition());
            preview.dataset.state = "empty";
            preview.dataset.source = source2;
          }
        } else {
          if (inline) inlinePreview?.setVisible(true);
          drawEnter(preview, source2);
        }
        return;
      }

      preview.replaceChildren();
      preview.dataset.state = "";
      delete preview.dataset.source;
      if (emptyValue) {
        if (render.dataset.source !== source2 || render.dataset.state !== "empty") {
          render.replaceChildren(createOccupyPosition());
          render.dataset.state = "empty";
          render.dataset.source = source2;
        }
        return;
      }

      drawEnter(render, source2);
    }












    function followSourceChangeRulerInch(): void {
      fitMathSourceSize(
        input,
        ruler,
        inline,
        editingSource(),
        input.placeholder || "",
        blockCodeEditor !== null,
      );
      inlinePreview?.reposition();
    }

    const remeasureInlineAfterFonts = () => {
      if (dom.isConnected) followSourceChangeRulerInch();
    };
    const stopWatchingFonts = inline
      ? watchFontMetrics(remeasureInlineAfterFonts)
      : () => {};












    function arrangeClusterFocus(): void {
      scheduleInlineMathFocus({
        shouldOpen: panelShouldOpen,
        focusBlockEditor: () => {
          if (!blockCodeEditor) return false;
          blockCodeEditor.clusterFocus();
          return true;
        },
        input: input as HTMLInputElement,
        sourceLength: () => editingSource().length,
        beforeInputFocus: () => {
          if (inline) releaseInlineMathNodeSelection(view, getPos);
        },
      });
    }






    function ensureBlockCodeEditor(): void {
      if (inline || blockEditorStarted) return;
      blockEditorStarted = true;
      void import("./code-block-cm")
        .then(({ createCodeBlockEditor }) => {
          if (!dom.isConnected) return;
          const exit = createCodeBlockExitNavigator(view, getPos, "math_block");
          const editor = createCodeBlockEditor({
            initialStartText: readSource(current),
            initialStartLanguage: "latex",
            nativeLineNumbers: true,
            textChangeConvert: (newText) => {
              input.value = newText;
              followSourceChangeRulerInch();
              dispatch(newText);
              createProposal.feed(newText, editor.getCursor());
            },
            clusterFocus: () => {
              markMathSourceFocused();
            },
            loseFocus: () => {
              boxInsideHasFocusPoint = false;
              createProposal.close4();
              sameStepPanel(false);
            },
            undoCancel: () => undo(view.state, view.dispatch, view),
            heavyDo: () => redo(view.state, view.dispatch, view),
            openHeadBackCell: () => view.focus(),
            vimInput: vimInputConfig(view.state),
            vimHooks: vimInputHooks(view),
            ...exit,
          });
          blockCodeEditor = editor;
          blockSourceShell.replaceChildren(editor.view.dom);
          editor.view.contentDOM.setAttribute(
            "aria-label",
            t("Math Source (LaTeX)"),
          );
          editor.view.dom.addEventListener("keydown", (event) => {
            if (createProposal.keypress(event.key).consume) {
              event.preventDefault();
              event.stopPropagation();
              return;
            }
            if (event.key === "Escape") {
              event.preventDefault();
              backOutputEditEdit();
              return;
            }
            if (event.key === "Backspace" && editor.getText() === "") {
              event.preventDefault();
              removeRemoveSelfSelf();
            }
          }, true);
          if (panelShouldOpen()) {
            requestAnimationFrame(() => {
              if (editor.view.hasFocus) return;
              editor.clusterFocus();
            });
          }
        })
        .catch((error: unknown) => {
          console.error("[nota] math source editor failed to load", error);
        });
    }

    function markMathSourceFocused(): void {
      boxInsideHasFocusPoint = true;
      sameStepPanel(false);
    }










    function sameStepPanel(wantToFocusPoint: boolean): void {
      refreshInlineEdge();
      const open2 = panelShouldOpen();
      dom.classList.toggle("nota-math-editing", open2);
      if (inline) setInlineMathEditing(view.dom, open2 && boxInsideHasFocusPoint);
      inlinePreview?.setVisible(open2);
      if (open2) {
        if (!inline) ensureBlockCodeEditor();
        followSourceChangeRulerInch();
        if (inline && editingSource().trim() === "") inlinePreview?.setVisible(false);
        if (inline) globalThis.requestAnimationFrame?.(remeasureInlineAfterFonts);
        if (wantToFocusPoint && (inline ? view.state.selection instanceof NodeSelection : view.hasFocus())) {
          arrangeClusterFocus();
        }
      } else {


        createProposal.close4();
        if (editingSource() !== readSource(current)) {

          replaceEditingSource(readSource(current));
        }
      }
      heavyDraw();
    }




    function dispatch(newValueSource: string): void {
      const position2 = getPos();
      if (typeof position2 !== "number") return;

      const node = view.state.doc.nodeAt(position2);
      if (!node || recognizeNode(node) !== kindClass) return;




      mostAfterDispatch = newValueSource;

      const tr = view.state.tr;
      if (!writeEnterSource(tr, position2, node, newValueSource)) return;
      view.dispatch(tr);
    }


    function backOutputEditEdit(side: "before" | "after" = "after"): void {
      const position2 = getPos();
      if (typeof position2 !== "number") return;
      const node = view.state.doc.nodeAt(position2);
      if (!node) return;
      if (inline) {
        setInlineMathEditing(view.dom, false);
        setInlineMathInputFocus(view.dom, false);
      }


      const to2 = side === "after" ? position2 + node.nodeSize : position2;

      const selection = inline
        ? exactTextSelection(view.state, to2)
        : (() => {
            const findOf = TextSelection.near(view.state.doc.resolve(to2), side === "after" ? 1 : -1);
            return findOf instanceof TextSelection ? findOf : TextSelection.create(view.state.doc, to2);
          })();
      const tr = view.state.tr.setSelection(selection);
      if (inline && side === "after") {
        const resolved = view.state.doc.resolve(to2);
        const beforeMarks = resolved.nodeBefore?.marks ?? [];
        tr.setStoredMarks(
          beforeMarks.length ? beforeMarks : (resolved.nodeAfter?.marks ?? []),
        );
      }
      tr.setMeta(commonStyleCurrentKey, selection.from);
      view.dispatch(tr);
      view.focus();
    }


    function removeRemoveSelfSelf(): void {
      const position2 = getPos();
      if (typeof position2 !== "number") return;
      const node = view.state.doc.nodeAt(position2);
      if (!node) return;

      const tr = view.state.tr.delete(position2, position2 + node.nodeSize);

      tr.setSelection(TextSelection.near(tr.doc.resolve(position2), -1));
      view.dispatch(tr);
      view.focus();
    }



    bindInlineMathSourceEvents(input, {
      updateLayout: () => {
        refreshInlineEdge();
        followSourceChangeRulerInch();
      },
      dispatchSource: (value) => {
        debugEvent("editor", "inline source dispatch", {
          length: value.length,
          ends_with_backslash: value.endsWith("\\"),
          active: document.activeElement === input,
        });
        dispatch(value);
      },
      feed: (value, cursor) => createProposal.feed(value, cursor),
      preserveFocus: (cursor) => {
        if (!inline) return;
        preserveInlineMathSourceFocus(input as HTMLInputElement, cursor, () => {
          setInlineMathInputFocus(view.dom, true);
        });
      },
    });

    input.addEventListener("focus", () => {
      boxInsideHasFocusPoint = true;
      if (inline) setInlineMathInputFocus(view.dom, true);
      if (inline) releaseInlineMathNodeSelection(view, getPos);
      sameStepPanel(false);
    });

    input.addEventListener("blur", () => {
      boxInsideHasFocusPoint = false;
      if (inline) setInlineMathInputFocus(view.dom, false);


      createProposal.close4();
      sameStepPanel(false);
    });




    (input as HTMLElement).addEventListener("keydown", (e) => {
      if (isImeComposingKey(e)) return;





      const result3 = createProposal.keypress(e.key);
      if (result3.consume) {
        e.preventDefault();
        return;
      }

      if (e.key === "Escape") {
        e.preventDefault();
        backOutputEditEdit();
        return;
      }

      if (
        inline &&
        e.key === "ArrowLeft" &&
        inlineMathInputAtEdge(input as HTMLInputElement, "start")
      ) {
        e.preventDefault();
        e.stopPropagation();
        backOutputEditEdit("before");
        return;
      }
      if (
        inline &&
        e.key === "ArrowRight" &&
        inlineMathInputAtEdge(input as HTMLInputElement, "end")
      ) {
        e.preventDefault();
        e.stopPropagation();
        backOutputEditEdit("after");
        return;
      }

      if (inline && e.key === "Enter") {
        e.preventDefault();
        backOutputEditEdit();
        return;
      }



      if (e.key === "Backspace" && input.value === "") {
        e.preventDefault();
        removeRemoveSelfSelf();
      }
    });



    panel.addEventListener("mousedown", (e) => {
      if (blockSourceShell.contains(e.target as Node | null)) return;
      if (numberLearnLabel.contains(e.target as Node | null)) return;
      if (inline && (e.target === input || input.contains(e.target as Node | null))) return;


      e.preventDefault();
      if (blockCodeEditor) blockCodeEditor.clusterFocus();
      else {
        input.focus();
        const caret = inlineMathHitCaret(e.target, hitBefore, hitAfter, input.value.length);
        if (caret !== null) input.setSelectionRange(caret, caret);
      }
    });

    numberLearnLabel.addEventListener("mousedown", (e) => e.preventDefault());
    numberLearnLabel.addEventListener("click", (e) => {
      e.preventDefault();
      e.stopPropagation();
      if (panelShouldOpen()) {
        backOutputEditEdit();
        return;
      }
      const position2 = getPos();
      if (typeof position2 !== "number") return;
      const node = view.state.doc.nodeAt(position2);
      if (!node) return;
      view.dispatch(
        view.state.tr
          .setSelection(NodeSelection.create(view.state.doc, position2))
          .scrollIntoView(),
      );
      view.focus();
    });


















    render.addEventListener("mousedown", (e) => {
      if (!decorationCurrent) return;
      e.preventDefault();
      if (blockCodeEditor) blockCodeEditor.clusterFocus();
      else input.focus();
    });



    preview.addEventListener("mousedown", (e) => {
      if (inline || !panelShouldOpen()) return;
      e.preventDefault();
      if (blockCodeEditor) blockCodeEditor.clusterFocus();
      else input.focus();
    });












    const isSelfOfAttachItem = (target: EventTarget | null): boolean => {
      if (!(target instanceof Node)) return false;
      if (panel.contains(target)) return true;
      if (!inline && numberLearnLabel.contains(target)) return true;
      if (!inline && panelShouldOpen() && preview.contains(target)) return true;
      return decorationCurrent && render.contains(target);
    };



    input.value = readSource(initialStart);
    refreshInlineEdge();

    sameStepPanel(decorationCurrent);
    const focusRequest = pendingInlineMathFocus(view.state);
    const focusPosition = getPos();
    if (inline && focusPosition !== undefined && focusRequest === focusPosition) {
      arrangeClusterFocus();
      queueMicrotask(() => {
        globalThis.requestAnimationFrame?.(() => {
          if (!dom.isConnected || getPos() !== focusPosition) return;
          if (pendingInlineMathFocus(view.state) !== focusPosition) return;
          view.dispatch(view.state.tr.setMeta(inlineMathFocusConsumed, true));
        });
      });
    }

    redrawAfterMount(() => dom.isConnected, () => {
      if (blockCodeEditor?.view.hasFocus || document.activeElement === input) boxInsideHasFocusPoint = true;
      sameStepPanel(false);
      inlinePreview?.reposition();
    });

    return {
      dom,

      update: (afterUpdate, newDecorations) => {
        const newValueSource = readSource(afterUpdate);



        const externalSurfaceChangeOf = newValueSource !== mostAfterDispatch; current = afterUpdate;
        blockCodeEditor?.setVimInput(vimInputConfig(view.state));

        if (externalSurfaceChangeOf) {
          mostAfterDispatch = newValueSource;
          if (editingSource() !== newValueSource) replaceEditingSource(newValueSource);
        }

        const newValueDecorationCurrent = readDecoration(newDecorations); const nextNodeSelected = view.state.selection instanceof NodeSelection;
        const justChangeCurrent =
          (newValueDecorationCurrent && !decorationCurrent) ||
          (inline && nextNodeSelected && !nodeSelected);
        nodeSelected = nextNodeSelected;
        decorationCurrent = newValueDecorationCurrent;

        sameStepPanel(justChangeCurrent);
        return true;
      },






      stopEvent: (e) => isSelfOfAttachItem(e.target),

      ignoreMutation: () => true,





      selectNode: () => dom.classList.add("ProseMirror-selectednode"),
      deselectNode: () => dom.classList.remove("ProseMirror-selectednode"),

      destroy: () => {






        boxInsideHasFocusPoint = false;
        if (inline) setInlineMathInputFocus(view.dom, false);
        if (inline) setInlineMathEditing(view.dom, false);
        stopWatchingFonts();
        inlinePreview?.destroy();
        blockCodeEditor?.cancelDestroy();
        blockCodeEditor = null;



        createProposal.close4();
        if (inline) createProposal.element.remove();
      },
    };
  };
}




function readOption(ctx: Ctx): KatexOptions {
  try {
    return ctx.get(katexOptionsCtx.key) ?? {};
  } catch {
    return {};
  }
}


export const commonStyleInlineView = $view(mathInlineSchema.node, (ctx) =>
  createCommonStyleView("inline", readOption(ctx)),
);

export const commonStyleBlockView = $view(mathBlockSchema.node, (ctx) => createCommonStyleView("block", readOption(ctx)));








export const mathView = [commonStyleInlineView, commonStyleBlockView, commonStyleCurrent, inlineMathBoundaryEditing];
