

















import type { Node as PMNode } from "@milkdown/kit/prose/model";
import { redo, undo } from "@milkdown/kit/prose/history";
import type { EditorView, NodeView } from "@milkdown/kit/prose/view";
import { Plugin } from "@milkdown/kit/prose/state";
import { $prose, $view } from "@milkdown/kit/utils";

import { api } from "@/bridge/ipc";
import { t } from "@/i18n";
import { debugEvent } from "@/ui/debug-log";
import type { codeBlockEditor } from "./code-block-cm";
import { blockHTMLSpec, isNoteRelease } from "./html-block";
import { localLocalImageSliceAbsoluteCorrectPath } from "./video-view";

export {
  allowedHtmlAttributes,
  allowedHtmlTags,
  clearManageHTMLAddress,
  hTMLCleanConvertConfigurePlace,
  isSafeHtmlUrl,
} from "./html-sanitize-policy";

interface BlockAttribute {
  value: string;
}

interface PendingReadImageSlice {
  element: HTMLImageElement;
  path: string;
}

const remoteHtmlImageLimit = 32;
const remoteHtmlImages = new Map<string, string>();
const remoteHtmlImagePending = new Set<string>();
const htmlImageFallbackClass = "nota-html-image-fallback";

function remoteHtmlAddress(image: HTMLImageElement): string | null {
  const address = image.getAttribute("src")?.trim() ?? "";
  return /^(?:https?:)?\/\//i.test(address) ? address : null;
}

function rememberRemoteHtmlImage(image: HTMLImageElement): void {
  const address = remoteHtmlAddress(image);
  if (!address || !image.complete || image.naturalWidth <= 0) return;
  if (remoteHtmlImages.has(address) || remoteHtmlImagePending.has(address)) return;




  remoteHtmlImagePending.add(address);
  void fetch(address, {
    mode: "cors",
    credentials: "omit",
    cache: "force-cache",
  })
    .then((response) => {
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      return response.blob();
    })
    .then(
      (blob) =>
        new Promise<string>((resolve, reject) => {
          const reader = new FileReader();
          reader.addEventListener("load", () => resolve(String(reader.result)), { once: true });
          reader.addEventListener("error", () => reject(reader.error), { once: true });
          reader.readAsDataURL(blob);
        }),
    )
    .then((dataUrl) => {
      remoteHtmlImages.delete(address);
      remoteHtmlImages.set(address, dataUrl);
      while (remoteHtmlImages.size > remoteHtmlImageLimit) {
        const oldest = remoteHtmlImages.keys().next().value;
        if (oldest === undefined) break;
        remoteHtmlImages.delete(oldest);
      }
    })
    .catch(() => {

    })
    .finally(() => remoteHtmlImagePending.delete(address));
}

function rememberRemoteHtmlImages(root: ParentNode): void {
  for (const image of Array.from(root.querySelectorAll("img"))) {
    if (image instanceof HTMLImageElement) rememberRemoteHtmlImage(image);
  }
}

function restoreRemoteHtmlImages(root: ParentNode): void {
  for (const image of Array.from(root.querySelectorAll("img"))) {
    if (!(image instanceof HTMLImageElement)) continue;
    const address = remoteHtmlAddress(image);
    if (!address) continue;
    const cached = remoteHtmlImages.get(address);
    if (!cached) continue;
    image.setAttribute("src", cached);
    remoteHtmlImages.delete(address);
    remoteHtmlImages.set(address, cached);
  }
}

function clearHtmlImageFallback(image: HTMLImageElement): void {
  const fallback = image.nextElementSibling;
  if (fallback?.classList.contains(htmlImageFallbackClass)) fallback.remove();
  image.hidden = false;
}

function showHtmlImageFallback(image: HTMLImageElement): void {
  const fallback = image.nextElementSibling;
  if (fallback?.classList.contains(htmlImageFallbackClass)) return;
  image.hidden = true;
  const label =
    image.alt.trim() ||
    image.getAttribute("title")?.trim() ||
    t("Image");
  const replacement = document.createElement("span");
  replacement.className = htmlImageFallbackClass;
  replacement.textContent = label;
  replacement.setAttribute("role", "img");
  replacement.setAttribute("aria-label", label);
  image.after(replacement);
}

function observeHtmlImage(
  image: HTMLImageElement,
  active: () => boolean,
): void {
  if (image.dataset.notaImageObserved === "true") return;
  image.dataset.notaImageObserved = "true";
  const timeout = window.setTimeout(() => {
    if (!active() || !image.isConnected || image.naturalWidth > 0) return;
    showHtmlImageFallback(image);
  }, 2200);
  const settle = (): void => {
    if (!active() || !image.isConnected) return;
    window.clearTimeout(timeout);
    if (image.naturalWidth > 0) clearHtmlImageFallback(image);
    else showHtmlImageFallback(image);
  };
  image.addEventListener(
    "load",
    () => {
      window.clearTimeout(timeout);
      if (active()) clearHtmlImageFallback(image);
    },
    { once: true },
  );
  image.addEventListener("error", settle, { once: true });
  if (image.complete) queueMicrotask(settle);
}


function removeOutputLocalLocalImageSlice(root: DocumentFragment, documentPath: string | null): PendingReadImageSlice[] {
  const result2: PendingReadImageSlice[] = [];
  for (const element of Array.from(root.querySelectorAll("img[src]"))) {
    if (!(element instanceof HTMLImageElement)) continue;
    const originalAddress = element.getAttribute("src") ?? "";
    const path = localLocalImageSliceAbsoluteCorrectPath(originalAddress, documentPath);
    if (!path) continue;
    element.removeAttribute("src");
    element.setAttribute("data-nota-local-image", "true");
    result2.push({ element, path });
  }
  return result2;
}

function writeImageSlice(imageSlice: PendingReadImageSlice, path: string, afterWrite: () => boolean): void {
  void api.image
    .dataUrl(path)
    .then((address) => {
      if (!afterWrite()) return;
      imageSlice.element.setAttribute("src", address);
      imageSlice.element.removeAttribute("data-nota-local-image");
      observeHtmlImage(imageSlice.element, afterWrite);
    })
    .catch(() => {
      if (!afterWrite()) return;
      imageSlice.element.removeAttribute("src");
      imageSlice.element.removeAttribute("data-nota-local-image");
      showHtmlImageFallback(imageSlice.element);
    });
}


export function blockHTMLView(documentPath: string | null = null) {
  let alreadyReportNoteBook = false;
  let alreadyReportConstructCreate = false;
  return $view(
    blockHTMLSpec.node,
    (ctx) => {
      if (!alreadyReportNoteBook) {
        alreadyReportNoteBook = true;
        debugEvent("editor", "HTML block NodeView registered", {
          id: blockHTMLSpec.node.id,
          schema_name: blockHTMLSpec.type(ctx).name,
        });
      }
      return (initialNode: PMNode, view: EditorView, getPos: () => number | undefined): NodeView => {
        if (!alreadyReportConstructCreate) {
          alreadyReportConstructCreate = true;
          debugEvent("editor", "HTML block NodeView constructed");
        }
        let current = initialNode;
        let represent = 0;
        let sourceMode = false;
        let sanitizeRuntime: Promise<typeof import("./html-sanitize")> | null = null;

        const root = document.createElement("div");
        root.className = "nota-html-block";
        root.setAttribute("data-type", "html-block");

        const show = document.createElement("div");
        show.className = "nota-html-render";

        const source2 = document.createElement("div");
        source2.className =
          "nota-html-source md-fences ty-contain-cm nota-source-surface";
        source2.setAttribute("aria-label", t("HTML source"));

        const writeReturnSource = (newValueValue: string): void => {
          const position2 = getPos();
          if (position2 === undefined) return;
          view.dispatch(
            view.state.tr.setNodeMarkup(position2, undefined, {
              ...current.attrs,
              value: newValueValue,
            }),
          );
        };

        let sourceEditing: codeBlockEditor | null = null;
        let sourceLoading: Promise<void> | null = null;

        const ensureSourceEditor = (): void => {
          if (sourceEditing || sourceLoading) return;
          source2.textContent = t("Loading code editor…");
          sourceLoading = import("./code-block-cm")
            .then(({ createCodeBlockEditor }) => {
              if (!root.isConnected) return;
              const editor = createCodeBlockEditor({
                initialStartText: (current.attrs as BlockAttribute).value,
                initialStartLanguage: "html",
                nativeLineNumbers: true,
                textChangeConvert: writeReturnSource,
                clusterFocus: () => {
                  sourceMode = true;
                  root.classList.add("nota-html-source-mode");
                },
                loseFocus: () => {
                  // Focus moving to the HTML toggle is still inside this block.
                  queueMicrotask(() => {
                    if (!root.isConnected || root.contains(document.activeElement)) return;
                    if (sourceMode) setSourceMode(false);
                  });
                },
                undoCancel: () => undo(view.state, view.dispatch, view),
                heavyDo: () => redo(view.state, view.dispatch, view),
              });
              sourceEditing = editor;
              source2.replaceChildren(editor.view.dom);
              editor.setText((current.attrs as BlockAttribute).value);
              if (sourceMode) editor.clusterFocus();
            })
            .catch((error: unknown) => {
              sourceLoading = null;
              console.error("[nota] HTML source editor failed to load", error);
              source2.textContent = t("The HTML source editor could not be loaded.");
            });
        };

        const splitReplace = document.createElement("button");
        splitReplace.type = "button";
        splitReplace.className = "nota-html-source-toggle nota-block-kind";
        splitReplace.textContent = "HTML";
        splitReplace.setAttribute("aria-pressed", "false");
        splitReplace.title = t("Edit HTML source");

        const writeAttribute = (node: PMNode): void => {
          const value2 = (node.attrs as BlockAttribute).value;
          root.setAttribute("data-value", value2);
          root.toggleAttribute("data-comment", isNoteRelease(value2));
        };

        const draw = (): void => {
          if (sourceMode) return;
          const value2 = (current.attrs as BlockAttribute).value;
          const localCount = ++represent;
          const activeActive = (): boolean => localCount === represent && root.isConnected;

          if (isNoteRelease(value2)) {
            show.textContent = value2;
            show.classList.add("nota-html-comment");
            return;
          }
          show.classList.remove("nota-html-comment");
          show.dataset.state = "loading";
          show.textContent = t("Rendering HTML…");
          sanitizeRuntime ??= import("./html-sanitize");
          void sanitizeRuntime
            .then(({ safeHtmlFragment }) => {
              if (!activeActive()) return;
              const fragment = safeHtmlFragment(value2);
              const imageSlice = removeOutputLocalLocalImageSlice(fragment, documentPath);
              rememberRemoteHtmlImages(show);
              restoreRemoteHtmlImages(fragment);
              show.replaceChildren(fragment);
              show.dataset.state = "ready";
              for (const image of Array.from(show.querySelectorAll("img"))) {
                if (!(image instanceof HTMLImageElement)) continue;
                if (image.hasAttribute("data-nota-local-image")) continue;
                observeHtmlImage(image, activeActive);
                if (remoteHtmlAddress(image)) {
                  image.addEventListener(
                    "load",
                    () => rememberRemoteHtmlImage(image),
                    { once: true },
                  );
                }
              }
              for (const oneImage of imageSlice) writeImageSlice(oneImage, oneImage.path, activeActive);
            })
            .catch((error: unknown) => {
              if (!activeActive()) return;
              show.dataset.state = "error";
              show.textContent = t("The HTML preview could not be loaded.");
              console.error("[nota] HTML sanitizer failed to load", error);
            });
        };

        function setSourceMode(open2: boolean): void {
          sourceMode = open2;
          root.classList.toggle("nota-html-source-mode", open2);
          sourceEditing?.setText((current.attrs as BlockAttribute).value);
          splitReplace.textContent = "HTML";
          splitReplace.title = open2 ? t("Finish editing") : t("Edit HTML source");
          splitReplace.setAttribute("aria-pressed", open2 ? "true" : "false");
          if (open2) {
            ensureSourceEditor();
            sourceEditing?.clusterFocus();
          } else {
            draw();
          }
        }

        splitReplace.addEventListener("mousedown", (event) => {
          if (event.button === 0) event.preventDefault();
        });
        splitReplace.addEventListener("click", (event) => {
          event.preventDefault();
          event.stopPropagation();
          if (sourceMode) {
            setSourceMode(false);
            view.focus();
          } else {
            setSourceMode(true);
          }
        });





        show.addEventListener("mousedown", (event) => {
          if (event.button !== 0) return;
          const target = event.target;
          if (target instanceof Element && target.closest("a[href], button")) return;
          event.preventDefault();
          if (!sourceMode) setSourceMode(true);
        });

        source2.addEventListener("keydown", (event) => {
          if (event.isComposing) return;
          if (event.key === "Escape") {
            event.preventDefault();
            event.stopPropagation();
            setSourceMode(false);
            view.focus();
          }
        }, true);



        root.addEventListener("click", (event) => {
          if (event.button !== 0) return;
          const target = event.target;
          if (!(target instanceof Element)) return;
          if (target.closest("button, textarea")) return;


          if (target.closest("a[href]")) return;
          if (sourceMode) return;
          event.preventDefault();
          event.stopPropagation();
          if (!sourceMode) setSourceMode(true);
        });

        root.append(show, source2, splitReplace);
        writeAttribute(current);
        draw();

        return {
          dom: root,
          update: (newValueNode: PMNode): boolean => {
            const valueChangeDone =
              (current.attrs as BlockAttribute).value !== (newValueNode.attrs as BlockAttribute).value;
            current = newValueNode;
            writeAttribute(current);
            if (sourceMode) {
              const newValueValue = (current.attrs as BlockAttribute).value;
              if (sourceEditing && sourceEditing.getText() !== newValueValue) {
                sourceEditing.setText(newValueValue);
              }
            } else if (valueChangeDone) {
              draw();
            }
            return true;
          },
          stopEvent: (event: Event): boolean => {
            const target = event.target;
            return (
              target instanceof Node &&
              (source2.contains(target) ||
                splitReplace.contains(target) ||
                (show.contains(target) && event.type === "mousedown"))
            );
          },
          ignoreMutation: () => true,
          destroy: () => {
            represent++;
            rememberRemoteHtmlImages(show);
            sourceEditing?.cancelDestroy();
          },
        };
      };
    },
  );
}


export const blockHTMLDiagnostics = $prose(
  () =>
    new Plugin({
      view: (view) => {
        let blocks = 0;
        let inline = 0;
        view.state.doc.descendants((node) => {
          if (node.type.name === blockHTMLSpec.node.id) blocks += 1;
          if (node.type.name === "html") inline += 1;
        });
        debugEvent("editor", "document node inventory", {
          html_blocks: blocks,
          inline_html: inline,
          top_level: view.state.doc.firstChild?.type.name ?? "",
        });
        return {};
      },
    }),
);
