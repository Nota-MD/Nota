

import type { Node as PMNode } from "@milkdown/kit/prose/model";
import { NodeSelection, TextSelection } from "@milkdown/kit/prose/state";
import { redo, undo } from "@milkdown/kit/prose/history";
import type {
  EditorView,
  NodeView,
  NodeViewConstructor,
} from "@milkdown/kit/prose/view";
import { Decoration } from "@milkdown/kit/prose/view";
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
import {
  caretCommandFromKeyboard,
  dispatchCaretCommand,
  type CaretCommand,
} from "./caret-commander";
import {
  clearLatestMath,
  createEmptyMathPosition,
  drawLatestMath,
} from "./math-render-target";
import {
  inlineMathHitCaret,
  removeInlineMathDelimiter,
} from "./math-inline-boundary";
import {
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
import {
  bindInlineMathSourceEvents,
  insertBackslashAtSelection,
  isImeComposingKey,
} from "./math-inline-events";
import { vimInputConfig, vimInputHooks } from "./plugin-vim-input";
import { createMathViewElements } from "./math-view-dom";
import { createDeferredMathView } from "./math-view-deferred";
import { shouldHydrateNearViewport } from "./large-doc";
import { findScrollContainer } from "./scroll-into-view";
import {
  observeNearViewport,
  preserveElementAnchor,
} from "./viewport-visibility";

export { commonStyleCurrent, computeDecorations, recognizeNode, returnPositionSelection } from "./math-current";
export { readSource, writeEnterSource } from "./math-view-source";

function createFullCommonStyleView(
  kindClass: "inline" | "block",
  option: KatexOptions,
): NodeViewConstructor {
  const inline = kindClass === "inline";

  const table2 = createCommandTable(Object.keys(option.macros ?? {}).length > 0);

  return (
    initialStart: PMNode,
    view: EditorView,
    getPos: () => number | undefined,
    decorations: readonly Decoration[],
  ): NodeView => {

    let current = initialStart;
    const {
      dom,
      render,
      preview,
      panel,
      numberLabel,
      input,
      ruler,
      hitBefore,
      hitAfter,
      blockSourceShell,
      createSeparator,
    } = createMathViewElements(inline, view.editable, () => current);
    const inlinePreview: InlinePreviewController | null =
      inline && view.editable ? mountInlinePreview(preview, panel) : null;

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
      if (!inline) dom.append(preview, numberLabel);
    }

    let mostAfterDispatch = readSource(initialStart); let decorationCurrent = readDecoration(decorations);

    let nodeSelected = view.state.selection instanceof NodeSelection; let boxInsideHasFocusPoint = false;
    let virtualized = false;
    let stopViewportObserver: (() => void) | null = null;

    function panelShouldOpen(): boolean {
      return view.editable && (decorationCurrent || boxInsideHasFocusPoint);
    }

    const createOccupyPosition = (): HTMLElement =>
      createEmptyMathPosition(inline, inline ? t("Empty inline math") : t("Empty math block — click to write LaTeX"));

    const drawEnter = (target: HTMLElement, source2: string) => drawLatestMath(target, source2, option);

    function drawVirtualPlaceholder(width = 0, height = 0): void {
      clearLatestMath(render);
      const placeholder = document.createElement(inline ? "span" : "div");
      placeholder.className = "nota-math-virtual";
      if (inline && width > 0) placeholder.style.width = `${Math.ceil(width)}px`;
      if (height > 0) placeholder.style.height = `${Math.ceil(height)}px`;
      render.dataset.state = "virtual";
      render.append(placeholder);
      virtualized = true;
      dom.dataset.notaVirtual = "true";
    }

    function virtualize(): void {
      if (
        virtualized ||
        !view.editable ||
        panelShouldOpen() ||
        readSource(current).trim() === ""
      ) {
        return;
      }
      const rect = render.getBoundingClientRect();
      const scroller = findScrollContainer(view.dom);
      preserveElementAnchor(scroller, dom, () => {
        drawVirtualPlaceholder(rect.width, rect.height);
      });
    }

    function hydrate(): void {
      if (!virtualized) return;
      virtualized = false;
      dom.dataset.notaVirtual = "false";
      heavyDraw();
    }

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

      void drawEnter(render, source2);
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
        beforeInputFocus: () => {},
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

    function sameStepPanel(wantToFocusPoint: boolean, renderNow = true): void {
      refreshInlineEdge();
      if (inline) {
        dom.dataset.notaMathMarkdown = `${mathDelimiterText(current)}${editingSource()}${mathDelimiterText(current, true)}`;
      }
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
      if (open2) virtualized = false;
      if ((renderNow || open2) && (!virtualized || open2)) {
        heavyDraw();
      }
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

    const handleCaretCommand = (
      command: CaretCommand,
      event?: Event,
    ): boolean => {
      if (command.type === "insertText") {
        if (command.text !== "\\" || event instanceof KeyboardEvent && event.isComposing) {
          return false;
        }
        const control = input as HTMLInputElement;
        const cursor = insertBackslashAtSelection(control);
        refreshInlineEdge();
        followSourceChangeRulerInch();
        dispatch(control.value);
        createProposal.feed(control.value, cursor);
        preserveInlineMathSourceFocus(control, cursor, () => {
          setInlineMathInputFocus(view.dom, true);
        });
        return true;
      }
      if (command.type === "escape") {
        backOutputEditEdit();
        return true;
      }
      if (
        command.type === "delete" &&
        inline &&
        typeof getPos() === "number"
      ) {
        const position2 = getPos()!;
        if (
          command.key === "Delete" &&
          inlineMathInputAtEdge(input as HTMLInputElement, "end")
        ) {
          removeInlineMathDelimiter(view, position2, "closing");
          return true;
        }
        if (
          command.key === "Backspace" &&
          input.value !== "" &&
          inlineMathInputAtEdge(input as HTMLInputElement, "start")
        ) {
          removeInlineMathDelimiter(view, position2, "opening");
          return true;
        }
      }
      if (
        command.type === "move" &&
        inline &&
        (command.key === "ArrowLeft" || command.key === "ArrowRight")
      ) {
        if (
          command.key === "ArrowLeft" &&
          inlineMathInputAtEdge(input as HTMLInputElement, "start")
        ) {
          backOutputEditEdit("before");
          return true;
        }
        if (
          command.key === "ArrowRight" &&
          inlineMathInputAtEdge(input as HTMLInputElement, "end")
        ) {
          backOutputEditEdit("after");
          return true;
        }
      }
      if (command.type === "commit" && inline) {
        backOutputEditEdit();
        return true;
      }
      if (
        command.type === "delete" &&
        command.key === "Backspace" &&
        input.value === ""
      ) {
        removeRemoveSelfSelf();
        return true;
      }
      return false;
    };

    const unbindInlineMathSource = bindInlineMathSourceEvents(input, {
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
      handleCommand: handleCaretCommand,
    });

    input.addEventListener("focus", () => {
      boxInsideHasFocusPoint = true;
      if (inline) setInlineMathInputFocus(view.dom, true);
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

      const command = caretCommandFromKeyboard(e);
      if (command && dispatchCaretCommand(command, e)) {
        e.preventDefault();
        e.stopPropagation();
        return;
      }
    });

    panel.addEventListener("mousedown", (e) => {
      if (blockSourceShell.contains(e.target as Node | null)) return;
      if (numberLabel.contains(e.target as Node | null)) return;
      if (inline && (e.target === input || input.contains(e.target as Node | null))) return;

      e.preventDefault();
      if (blockCodeEditor) blockCodeEditor.clusterFocus();
      else {
        input.focus();
        const caret = inlineMathHitCaret(e.target, hitBefore, hitAfter, input.value.length);
        if (caret !== null) input.setSelectionRange(caret, caret);
      }
    });

    numberLabel.addEventListener("mousedown", (e) => e.preventDefault());
    numberLabel.addEventListener("click", (e) => {
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
      if (!decorationCurrent) {
        if (!view.editable) return;
        const position2 = getPos();
        if (typeof position2 !== "number") return;
        e.preventDefault();
        e.stopPropagation();
        view.dispatch(
          view.state.tr.setSelection(
            NodeSelection.create(view.state.doc, position2),
          ),
        );
        const focusSource = () => {
          if (input.isConnected) input.focus();
        };
        focusSource();
        queueMicrotask(focusSource);
        requestAnimationFrame(focusSource);
        return;
      }
      e.preventDefault();
      e.stopPropagation();
      if (blockCodeEditor) blockCodeEditor.clusterFocus();
      else input.focus();
    });
    const containInlineFollowupPointer = (event: Event) => {
      if (!inline) return;
      event.preventDefault();
      event.stopPropagation();
    };
    render.addEventListener("mouseup", containInlineFollowupPointer, true);
    render.addEventListener("click", containInlineFollowupPointer, true);

    preview.addEventListener("mousedown", (e) => {
      if (inline || !panelShouldOpen()) return;
      e.preventDefault();
      e.stopPropagation();
      if (blockCodeEditor) blockCodeEditor.clusterFocus();
      else input.focus();
    });
    preview.addEventListener("mouseup", containInlineFollowupPointer, true);
    preview.addEventListener("click", containInlineFollowupPointer, true);

    const isSelfOfAttachItem = (target: EventTarget | null): boolean => {
      if (!(target instanceof Node)) return false;
      if (panel.contains(target)) return true;
      if (!inline && numberLabel.contains(target)) return true;
      if (!inline && panelShouldOpen() && preview.contains(target)) return true;
      return decorationCurrent && render.contains(target);
    };

    input.value = readSource(initialStart);
    refreshInlineEdge();

    const viewportManaged = shouldHydrateNearViewport(view.state.doc.content.size);
    sameStepPanel(decorationCurrent, !viewportManaged);
    if (viewportManaged && !panelShouldOpen()) {
      drawVirtualPlaceholder();
      stopViewportObserver = observeNearViewport(dom, view, (near) => {
        dom.dataset.notaViewport = near ? "near" : "far";
        if (near) {
          hydrate();
          return;
        }
        virtualize();
      });
    }
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
            if (virtualized) drawVirtualPlaceholder();
        }

        const newValueDecorationCurrent = readDecoration(newDecorations); const nextNodeSelected = view.state.selection instanceof NodeSelection;
        const justChangeCurrent =
          (newValueDecorationCurrent && !decorationCurrent) ||
          (inline && nextNodeSelected && !nodeSelected);
        nodeSelected = nextNodeSelected;
        decorationCurrent = newValueDecorationCurrent;

        if (
          virtualized &&
          !newValueDecorationCurrent &&
          !(inline && nextNodeSelected)
        ) {
          return true;
        }
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
        unbindInlineMathSource();
        stopWatchingFonts();
        stopViewportObserver?.();
        stopViewportObserver = null;
        inlinePreview?.destroy();
        blockCodeEditor?.cancelDestroy();
        blockCodeEditor = null;

        createProposal.close4();
        if (inline) createProposal.element.remove();
      },
    };
  };
}

export function createCommonStyleView(
  kindClass: "inline" | "block",
  option: KatexOptions,
): NodeViewConstructor {
  const full = createFullCommonStyleView(kindClass, option);
  const inline = kindClass === "inline";
  return (initialNode, view, getPos, decorations, innerDecorations) => {
    if (!shouldHydrateNearViewport(view.state.doc.content.size)) {
      return full(initialNode, view, getPos, decorations, innerDecorations);
    }
    return createDeferredMathView(
      full,
      inline,
      initialNode,
      view,
      getPos,
      option,
      decorations,
      innerDecorations,
    );
  };
}
