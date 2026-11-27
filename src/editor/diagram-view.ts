




























































import type { Node as PMNode } from "@milkdown/kit/prose/model";
import { redo, undo } from "@milkdown/kit/prose/history";
import type { EditorView, NodeView } from "@milkdown/kit/prose/view";
import { $view } from "@milkdown/kit/utils";







import { t } from "@/i18n";
import { writeClipboard } from "@/editor/code-block";
import type { codeBlockEditor } from "@/editor/code-block-cm";
import {
  bootstrapCodeBlockExit,
  codeBlockExitTransaction,
  moveBootstrapCodeBlockCaret,
  type CodeBlockExitSide,
} from "@/editor/code-block-boundary";

import { imageTableSpec, mermaidSourceForLanguage } from "@/editor/diagram-node";
import {
  checkBufferSave,
  distinguishAgainFollowDone,
  followAboveTheme,
  readDiagramTheme,
  render,
  writeBufferSave,
  type RenderResult,
} from "./diagram-render";
import { fitDiagramSize } from "./diagram-size";
import { vimInputConfig, vimInputHooks } from "./plugin-vim-input";


const nodeName = "diagram";


const guardDebounceMilliSeconds = 250;

function readSource(node: PMNode): string {
  const value2: unknown = node.attrs.value;
  return typeof value2 === "string" ? value2 : "";
}








function getBodyPart(node: PMNode): string {
  const value2: unknown = node.attrs.identity;
  return typeof value2 === "string" ? value2 : "";
}

export const diagramView = $view(




  imageTableSpec.node,
  () =>
    (initialNode: PMNode, view: EditorView, getPos: () => number | undefined): NodeView => {

      // <div class="nota-diagram">
      //   <div class="nota-diagram-body">


      //






      const dom = document.createElement("div");
      dom.className = "nota-diagram md-diagram-panel md-fences-adv-panel";

      const body = document.createElement("div");
      body.className = "nota-diagram-body";

      const sourceShell = document.createElement("pre");
      sourceShell.className =
        "nota-diagram-source-shell nota-source-surface md-fences ty-contain-cm";

      const sourceBox = document.createElement("div");
      sourceBox.className = "nota-diagram-source nota-diagram-cm";
      const sourceBootstrap = document.createElement("textarea");
      sourceBootstrap.className = "nota-diagram-source-bootstrap";
      sourceBootstrap.value = readSource(initialNode);
      sourceBootstrap.rows = Math.max(3, sourceBootstrap.value.split("\n").length);
      sourceBootstrap.spellcheck = false;
      sourceBootstrap.setAttribute("aria-label", t("Diagram source"));
      sourceBox.append(sourceBootstrap);

      const preview = document.createElement("pre");
      preview.className =
        "nota-diagram-preview nota-code-theme-surface nota-source-surface md-fences ty-contain-cm";

      const sourceBar = document.createElement("div");
      sourceBar.className = "nota-diagram-source-bar";

      const collapse2 = document.createElement("button");
      collapse2.type = "button";
      collapse2.className = "nota-code-btn";
      collapse2.textContent = t("Collapse");
      collapse2.title = t("Collapse this diagram source");

      const copy = document.createElement("button");
      copy.type = "button";
      copy.className = "nota-code-btn";
      copy.textContent = t("Copy");
      copy.title = t("Copy diagram source");

      const language = document.createElement("span");
      language.className = "nota-diagram-language";
      language.textContent = String(initialNode.attrs.language ?? "mermaid");

      sourceBar.append(collapse2, copy, language);
      sourceShell.append(sourceBox, sourceBar);
      body.append(sourceShell, preview);
      dom.append(body);







      let current = initialNode;

      let mostAfterDispatch = readSource(initialNode);

      let rendered = false;

      let renderedTheme = "";

      let representNumber = 0;

      let guardDebounce: number | null = null;
      let codeEditor: codeBlockEditor | null = null;
      let editorDisposed = false;
      let editorStarted = false;
      let previewStarted = false;
      let visibilityObserver: IntersectionObserver | null = null;
      let diagramImage: SVGSVGElement | null = null;

      function fitDiagramToPreview(): void {
        const image = diagramImage;
        if (!image || !image.isConnected) return;

        const style = getComputedStyle(preview);
        const horizontalPadding =
          (Number.parseFloat(style.paddingLeft) || 0) +
          (Number.parseFloat(style.paddingRight) || 0);
        const verticalPadding =
          (Number.parseFloat(style.paddingTop) || 0) +
          (Number.parseFloat(style.paddingBottom) || 0);
        const availableWidth = Math.max(1, preview.clientWidth - horizontalPadding);
        const availableHeight = Math.max(1, preview.clientHeight - verticalPadding);
        const viewBoxWidth = image.viewBox.baseVal.width;
        const viewBoxHeight = image.viewBox.baseVal.height;
        const attributeWidth = Number.parseFloat(image.getAttribute("width") ?? "");
        const attributeHeight = Number.parseFloat(image.getAttribute("height") ?? "");
        const naturalWidth =
          viewBoxWidth > 0
            ? viewBoxWidth
            : Number.isFinite(attributeWidth) && attributeWidth > 0
              ? attributeWidth
              : availableWidth;
        const naturalHeight =
          viewBoxHeight > 0
            ? viewBoxHeight
            : Number.isFinite(attributeHeight) && attributeHeight > 0
              ? attributeHeight
              : availableHeight;
        const fitted = fitDiagramSize(
          naturalWidth,
          naturalHeight,
          availableWidth,
          availableHeight,
        );

        image.style.setProperty("width", `${fitted.width}px`, "important");
        image.style.setProperty("height", `${fitted.height}px`, "important");
        image.style.setProperty("max-width", "100%", "important");
        image.style.setProperty("max-height", "100%", "important");
        image.setAttribute("preserveAspectRatio", "xMidYMid meet");
      }

      const previewResizeObserver =
        typeof ResizeObserver === "undefined" ? null : new ResizeObserver(fitDiagramToPreview);
      previewResizeObserver?.observe(preview);


      /**
       * The diagram mirrors a math block: the rendered result is the resting
       * state, and the source editor is only visible while this block owns
       * focus. Clicking the preview is an explicit request to edit.
       */
      function enterEditing(): void {
        if (!view.editable) return;
        dom.classList.add("nota-diagram-editing");
        ensureDiagramEditor();
      }

      function leaveEditing(): void {
        firstDispatch();
        dom.classList.remove("nota-diagram-editing");
        sourceShell.classList.remove("is-collapsed");
        collapse2.textContent = t("Collapse");
        collapse2.title = t("Collapse this diagram source");
      }

      function focusSource(): void {
        enterEditing();
        requestAnimationFrame(() => {
          if (editorDisposed) return;
          if (codeEditor) codeEditor.clusterFocus();
          else {
            ensureDiagramEditor();
            sourceBootstrap.focus();
          }
        });
      }


      function descriptionCard(markTitle: string, body2: string, PressButton: string | null): HTMLElement {
        const card = document.createElement("div");
        card.className = "nota-diagram-note";

        const title = document.createElement("div");
        title.className = "nota-diagram-note-title";
        title.textContent = markTitle;
        card.append(title);





        const text4 = document.createElement("div");
        text4.className = "nota-diagram-note-detail";
        text4.textContent = body2;
        card.append(text4);

        if (PressButton) {
          const press = document.createElement("button");
          press.type = "button";
          press.className = "nota-code-btn nota-diagram-note-btn";
          press.textContent = PressButton;
          press.addEventListener("mousedown", (e) => e.preventDefault());
          press.addEventListener("click", () => codeEditor?.clusterFocus() ?? sourceBootstrap.focus());
          card.append(press);
        }
        return card;
      }







      function draw(result2: RenderResult | null): void {
        rendered = true;
        diagramImage = null;
        preview.replaceChildren();

        if (result2 === null) {
          preview.dataset.state = "empty";
          preview.append(
            descriptionCard(
              t("There is no diagram source here yet"),
              t("Write Mermaid in the code box above, for example:\ngraph TD; A[Start] --> B[End]"),
              null,
            ),
          );
          return;
        }

        if (result2.state === "error") {
          preview.dataset.state = "error";
          preview.append(
            descriptionCard(
              t("The diagram has a syntax error and cannot be drawn (your source is untouched in the document)."),
              result2.clearMessage,
              null,
            ),
          );
          return;
        }

        preview.dataset.state = "ok";



        preview.innerHTML = result2.imageShape;
        const image = preview.querySelector("svg");
        if (image instanceof SVGSVGElement) {
          diagramImage = image;
          fitDiagramToPreview();
        }
      }

      function drawExternal(languageName: string, source2: string): void {
        rendered = true;
        preview.dataset.state = "source";
        preview.replaceChildren(
          descriptionCard(
            t("{0} diagrams use the diagram frame, but this build has no local renderer.", languageName),
            source2,
            t("Edit source"),
          ),
        );
      }


      function drawMiddle(): void {
        preview.dataset.state = "loading";
        preview.replaceChildren(descriptionCard(t("Rendering the diagram…"), t("Mermaid is parsing this source."), null));
      }






      async function sameStep(): Promise<void> {
        const source2 = readSource(current);
        const languageName = String(current.attrs.language ?? "mermaid");
        language.textContent = languageName;
        const theme = readDiagramTheme(dom, view.dom);
        renderedTheme = theme.key;

        if (source2.trim() === "") {


          representNumber++;
          draw(null);
          return;
        }

        if (languageName === "plantuml" || languageName === "graphviz") {
          representNumber++;
          drawExternal(languageName, source2);
          return;
        }




        const renderSource = mermaidSourceForLanguage(languageName, source2);
        const key = `${getBodyPart(current)}|${languageName}|${theme.key}`;
        const match = checkBufferSave(key, renderSource);
        if (match) {
          representNumber++;
          draw(match);
          return;
        }

        const selfOfRepresentNumber = ++representNumber;

        if (!rendered) drawMiddle();

        const result2 = await render(renderSource, theme);

        if (selfOfRepresentNumber !== representNumber) return;
        writeBufferSave(key, renderSource, result2);
        renderedTheme = theme.key;
        draw(result2);
      }







      function dispatch(newValueSource: string): void {
        const pos = getPos();
        if (typeof pos !== "number") return;

        const node = view.state.doc.nodeAt(pos);
        if (!node || node.type.name !== nodeName) return;
        if (readSource(node) === newValueSource) return;

        mostAfterDispatch = newValueSource;
        view.dispatch(
          view.state.tr.setNodeMarkup(pos, undefined, { ...node.attrs, value: newValueSource }),
        );
      }


      function firstDispatch(): void {
        if (guardDebounce === null) return;
        window.clearTimeout(guardDebounce);
        guardDebounce = null;
        dispatch(codeEditor?.getText() ?? sourceBootstrap.value);
      }

      function leaveDiagram(side: CodeBlockExitSide): void {
        firstDispatch();
        const pos = getPos();
        if (typeof pos !== "number") return;
        const node = view.state.doc.nodeAt(pos);
        if (!node || node.type.name !== nodeName) return;
        const transaction = codeBlockExitTransaction(view.state, pos, node, side);
        if (!transaction) return;
        leaveEditing();
        view.dispatch(transaction.scrollIntoView());
        view.focus();
      }

      const leaveHeadCell = () => leaveDiagram("before");
      const leaveTailCell = () => leaveDiagram("after");





      const convertSource = (newText: string) => {
        sourceBootstrap.rows = Math.max(3, newText.split("\n").length);
        if (guardDebounce !== null) window.clearTimeout(guardDebounce);
        guardDebounce = window.setTimeout(() => {
          guardDebounce = null;
          dispatch(newText);
        }, guardDebounceMilliSeconds);
      };
      sourceBootstrap.addEventListener("input", () => convertSource(sourceBootstrap.value));
      sourceBootstrap.addEventListener("focusin", () => ensureDiagramEditor());
      sourceBootstrap.addEventListener("keydown", (event) => {
        if (event.key === "Escape") {
          event.preventDefault();
          firstDispatch();
          leaveEditing();
          view.focus();
          return;
        }
        if (event.isComposing || event.shiftKey || event.ctrlKey || event.metaKey || event.altKey) return;
        const caret = sourceBootstrap.selectionStart;
        if (caret === null || caret !== sourceBootstrap.selectionEnd) return;
        const exit = bootstrapCodeBlockExit(sourceBootstrap.value, caret, event.key);
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
          const next = moveBootstrapCodeBlockCaret(sourceBootstrap.value, caret, event.key);
          sourceBootstrap.setSelectionRange(next, next);
        }
      });

      function ensureDiagramEditor(): void {
        if (editorStarted || editorDisposed) return;
        editorStarted = true;
        visibilityObserver?.disconnect();
        visibilityObserver = null;
        void import("@/editor/code-block-cm")
          .then(({ createCodeBlockEditor }) => {
            if (editorDisposed || !dom.isConnected) return;
            const editor = createCodeBlockEditor({
              initialStartText: readSource(current),
              initialStartLanguage:
                String(current.attrs.language ?? "mermaid") === "mermaid"
                  ? "mermaid"
                  : "plaintext",
              nativeLineNumbers: true,
              textChangeConvert: convertSource,
              clusterFocus: () => {

              },
              loseFocus: firstDispatch,
              undoCancel: () => undo(view.state, view.dispatch, view),
              heavyDo: () => redo(view.state, view.dispatch, view),
              openHeadBackCell: () => view.focus(),
              leaveHeadCell,
              leaveTailCell,
              vimInput: vimInputConfig(view.state),
              vimHooks: vimInputHooks(view),
            });
            codeEditor = editor;
            sourceBox.replaceChildren(editor.view.dom);
            editor.view.contentDOM.setAttribute("aria-label", t("Diagram source"));
            editor.view.dom.addEventListener("keydown", (event) => {
              if (event.key !== "Escape") return;
              event.preventDefault();
              firstDispatch();
              leaveEditing();
              view.focus();
            });
          })
          .catch((error: unknown) => {
            console.error("[nota] diagram source editor failed to load", error);
            sourceBootstrap.classList.add("nota-code-bootstrap-error");
          });
      }

      const revealDiagram = () => {
        previewStarted = true;
        void sameStep();
      };
      if (!view.editable) queueMicrotask(revealDiagram);
      else if (typeof IntersectionObserver === "undefined") queueMicrotask(revealDiagram);
      else {
        visibilityObserver = new IntersectionObserver(
          (entries) => {
            if (entries.some((entry) => entry.isIntersecting)) revealDiagram();
          },
          { rootMargin: "600px 0px" },
        );
        visibilityObserver.observe(dom);
      }



      for (const PressButton of [collapse2, copy]) {
        PressButton.addEventListener("mousedown", (e) => e.preventDefault());
      }

      preview.addEventListener("mousedown", (event) => {
        if (!view.editable) return;
        event.preventDefault();
        event.stopPropagation();
        focusSource();
      });

      sourceShell.addEventListener("focusin", enterEditing);
      sourceShell.addEventListener("focusout", () => {
        window.setTimeout(() => {
          if (!dom.contains(document.activeElement)) leaveEditing();
        }, 0);
      });

      collapse2.addEventListener("click", () => {
        const collapsed = sourceShell.classList.toggle("is-collapsed");
        collapse2.textContent = collapsed ? t("Expand") : t("Collapse");
        collapse2.title = collapsed ? t("Expand this diagram source") : t("Collapse this diagram source");
      });

      copy.addEventListener("click", () => {
        void writeClipboard(codeEditor?.getText() ?? sourceBootstrap.value ?? readSource(current)).then((ok) => {
          if (!ok) return;
          copy.textContent = t("Copied");
          window.setTimeout(() => {
            copy.textContent = t("Copy");
          }, 1200);
        });
      });










      const isSelfOfAttachItem = (target: EventTarget | null): boolean =>
        target instanceof Element &&
        (sourceShell.contains(target) || target.closest("button") !== null);



      const followTheme = (): void => {
        if (previewStarted && readDiagramTheme(dom, view.dom).key !== renderedTheme) void sameStep();
      };
      followAboveTheme(followTheme);


      function sameStepEditable(): void {
        dom.classList.toggle("nota-diagram-readonly", !view.editable);
        if (!view.editable) dom.classList.remove("nota-diagram-editing");
      }

      sameStepEditable();

      return {
        dom,

        update: (afterUpdate: PMNode): boolean => {

          if (afterUpdate.type !== initialNode.type) return false;

          const newValueSource = readSource(afterUpdate);



          const externalSurfaceChangeOf = newValueSource !== mostAfterDispatch;
          current = afterUpdate;
          codeEditor?.setVimInput(vimInputConfig(view.state));

          if (externalSurfaceChangeOf) {
            mostAfterDispatch = newValueSource;
            if (codeEditor && codeEditor.getText() !== newValueSource) codeEditor.setText(newValueSource);
            else if (!codeEditor && sourceBootstrap.value !== newValueSource) {
              sourceBootstrap.value = newValueSource;
            }
          }

          sameStepEditable();
          if (view.editable) {
            const position = getPos();
            const selection = view.state.selection;
            if (typeof position === "number") {
              const inside =
                selection.from >= position &&
                selection.to <= position + afterUpdate.nodeSize;
              if (!inside && !dom.contains(document.activeElement)) {
                leaveEditing();
              }
            }
          }

          if (previewStarted) void sameStep();
          return true;
        },



        stopEvent: (e) => isSelfOfAttachItem(e.target),






        ignoreMutation: () => true,

        destroy: () => {
          editorDisposed = true;
          visibilityObserver?.disconnect();
          previewResizeObserver?.disconnect();

          representNumber++;


          firstDispatch();
          codeEditor?.cancelDestroy();
          distinguishAgainFollowDone(followTheme);
        },
      };
    },
);
