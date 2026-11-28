























































import { imageSchema } from "@milkdown/kit/preset/commonmark";
import type { Node as PMNode } from "@milkdown/kit/prose/model";
import { TextSelection } from "@milkdown/kit/prose/state";
import type { EditorView, NodeView } from "@milkdown/kit/prose/view";
import { $view } from "@milkdown/kit/utils";
import {
  htmlImageSource,
  type ImageSourceAttributes,
} from "./image-source-schema";
import { imageFromHtmlOnly } from "./image-attrs";

import { api } from "@/bridge/ipc";
import { t } from "@/i18n";
import { extension } from "./file-kind";
import { automaticImageName } from "./image-kind";
import { shouldHydrateNearViewport } from "./large-doc";
import { observeNearViewport } from "./viewport-visibility";










export const visionFrequencyExtension: readonly string[] = ["mp4", "m4v", "webm", "ogv"];









export function IsVideoSource(address: string): boolean {
  const clean = address.split(/[?#]/, 1)[0] ?? "";
  return visionFrequencyExtension.includes(extension(clean));
}


function text2(value2: unknown): string {
  return typeof value2 === "string" ? value2 : "";
}


function isExternalPartAddress(address: string): boolean {
  return /^(?:https?:|data:|blob:|asset:)/i.test(address.trim());
}


export function localLocalImageSliceAbsoluteCorrectPath(address: string, documentPath: string | null): string | null {
  const original = address.trim();
  if (!original || isExternalPartAddress(original)) return null;
  if (original.toLowerCase().startsWith("file://")) {
    try {
      const url = new URL(original);
      let pathname = decodeURIComponent(url.pathname);
      if (/^\/[A-Za-z]:\//.test(pathname)) pathname = pathname.slice(1);
      if (url.hostname && url.hostname !== "localhost") {
        return `//${url.hostname}${pathname}`;
      }
      return pathname;
    } catch {
      return original.slice("file://".length);
    }
  }

  const windowsAbsoluteCorrect = /^[a-zA-Z]:[\\/]/.test(original);
  const unixAbsoluteCorrect = original.startsWith("/");
  const UNC = original.startsWith("\\\\");
  if (windowsAbsoluteCorrect || unixAbsoluteCorrect || UNC) return original;
  if (!documentPath) return null;

  const slantBar = documentPath.includes("\\") ? "\\" : "/";
  const split = documentPath.lastIndexOf(slantBar);
  if (split < 0) return null;
  const itemRecord = documentPath.slice(0, split);
  const paragraph2 = `${itemRecord}${slantBar}${original}`.split(/[\\/]+/);
  const returnAnd: string[] = [];
  for (const value of paragraph2) {
    if (!value || value === ".") continue;
    if (value === "..") {
      returnAnd.pop();
      continue;
    }
    returnAnd.push(value);
  }
  const body2 = returnAnd.join(slantBar);
  if (UNC) return `\\\\${body2}`;
  return documentPath.startsWith("/") ? `/${body2}` : body2;
}


interface viewItem {

  dom: HTMLElement;

  mediaBody: HTMLImageElement | HTMLVideoElement;

  sourceBody: HTMLTextAreaElement | null;

  errorBody: HTMLSpanElement;

  deleteBody: HTMLButtonElement;

  isVisionFrequency: boolean;

  represent: number;
}





function createElement(isVisionFrequency: boolean): viewItem {
  const errorBody = document.createElement("span");
  errorBody.className = "nota-media-error";
  errorBody.hidden = true;
  const deleteBody = document.createElement("button");
  deleteBody.type = "button";
  deleteBody.className = "nota-media-delete";
  deleteBody.title = isVisionFrequency ? t("Delete video") : t("Delete image");
  deleteBody.setAttribute("aria-label", deleteBody.title);
  deleteBody.textContent = "×";

  if (!isVisionFrequency) {


    const box = document.createElement("span");
    box.className = "nota-image";
    const sourceIcon = document.createElement("span");
    sourceIcon.className = "nota-image-source-icon";
    sourceIcon.setAttribute("aria-hidden", "true");
    const img = document.createElement("img");
    box.append(sourceIcon, img, errorBody, deleteBody);
    return {
      dom: box,
      mediaBody: img,
      sourceBody: null,
      errorBody,
      deleteBody,
      isVisionFrequency: false,
      represent: 0,
    };
  }





  const box = document.createElement("span");
  box.className = "nota-video";
  const video = document.createElement("video");


  video.preload = "metadata";
  video.controls = true;

  video.setAttribute("draggable", "false");
  box.append(video, errorBody, deleteBody);
  return {
    dom: box,
    mediaBody: video,
    sourceBody: null,
    errorBody,
    deleteBody,
    isVisionFrequency: true,
    represent: 0,
  };
}

function setMediaError(item3: viewItem, message: string | null): void {
  const text = message ?? "";
  if (item3.errorBody.textContent !== text) item3.errorBody.textContent = text;
  if (item3.errorBody.hidden !== !message) item3.errorBody.hidden = !message;
  const hasError = Boolean(message);
  if (item3.dom.classList.contains("has-media-error") !== hasError) {
    item3.dom.classList.toggle("has-media-error", hasError);
  }
}













function writeAttribute(
  item3: viewItem,
  node: PMNode,
  documentPath: string | null,
  loadMedia = true,
): void {
  const src = text2(node.attrs.src);
  const alt = text2(node.attrs.alt);
  const title = text2(node.attrs.title);
  const represent = ++item3.represent;
  item3.mediaBody.hidden = false;
  item3.deleteBody.hidden = false;
  item3.dom.classList.remove("has-invalid-source");
  item3.mediaBody.dataset.notaSource = src;
  item3.mediaBody.dataset.notaImageSyntax = text2(node.attrs.syntax) || "markdown";
  const zoom = Number(node.attrs.zoom ?? 100);
  item3.mediaBody.dataset.notaImageZoom = String(zoom);
  item3.dom.style.setProperty(
    "--nota-image-zoom",
    String(Number.isFinite(zoom) && zoom > 0 ? zoom / 100 : 1),
  );

  const localLocal = localLocalImageSliceAbsoluteCorrectPath(src, documentPath);
  if (!loadMedia) {
    item3.represent += 1;
    item3.mediaBody.removeAttribute("src");
    return;
  }
  if (!localLocal) {
    setMediaError(item3, null);
    item3.mediaBody.setAttribute("src", src);
  } else {


    item3.mediaBody.removeAttribute("src");
    setMediaError(item3, null);
    void api.image
      .dataUrl(localLocal)
      .then((address) => {
        if (item3.represent === represent) item3.mediaBody.setAttribute("src", address);
      })
      .catch(() => {

        if (item3.represent === represent) {
          item3.mediaBody.removeAttribute("src");
          setMediaError(item3, t("Image could not be loaded: {0}", src));
        }
      });
  }
 item3.mediaBody.setAttribute("title", title);
  if (item3.isVisionFrequency) {
    if (alt) item3.mediaBody.setAttribute("aria-label", alt);
    else item3.mediaBody.removeAttribute("aria-label");
  } else {
    item3.mediaBody.setAttribute("alt", alt);
    if (item3.sourceBody && document.activeElement !== item3.sourceBody) {
      item3.sourceBody.value = imageMarkdownSource(node);
      resizeImageSource(item3.sourceBody);
    }
  }
}

function resizeImageSource(source: HTMLTextAreaElement): void {
  if (!source.isConnected) return;
  source.style.height = "0px";
  if (source.scrollHeight > 0) {
    source.style.height = `${source.scrollHeight}px`;
  }
}

export function imageSourceSelectionRange(
  source: string,
  attributes: { alt?: unknown; syntax?: unknown; zoom?: unknown },
): { start: number; end: number } {
  if (
    attributes.syntax === "html" ||
    Number(attributes.zoom ?? 100) !== 100
  ) {
    return { start: 0, end: source.length };
  }
  const selectedAlt = text2(attributes.alt).replaceAll("]", "\\]");
  return { start: 2, end: 2 + selectedAlt.length };
}


export function imageMarkdownSource(node: PMNode): string {
  const attributes: ImageSourceAttributes = {
    src: text2(node.attrs.src),
    alt: text2(node.attrs.alt),
    title: text2(node.attrs.title),
    syntax: node.attrs.syntax === "html" ? "html" : "markdown",
    zoom: Number(node.attrs.zoom ?? 100),
  };
  if (attributes.syntax === "html" || attributes.zoom !== 100) {
    return htmlImageSource(attributes);
  }
  const src = attributes.src;
  const alt = attributes.alt.replaceAll("]", "\\]");
  const title = attributes.title.replaceAll('"', '\\"');
  return title ? `![${alt}](${src} "${title}")` : `![${alt}](${src})`;
}


export function parseImageMarkdownSource(
  source: string,
): ImageSourceAttributes | null {
  const html = imageFromHtmlOnly(source);
  if (html) return html;
  const match = /^\s*!\[((?:\\.|[^\]])*)\]\(\s*(\S+?)(?:\s+["']((?:\\.|[^"'])*)["'])?\s*\)\s*$/.exec(source);
  if (!match) return null;
  return {
    alt: match[1]!.replaceAll("\\]", "]"),
    src: match[2]!,
    title: (match[3] ?? "").replaceAll('\\"', '"'),
    syntax: "markdown",
    zoom: 100,
  };
}







export function visionFrequencyView(documentPath: string | null = null) {
  return $view(
    imageSchema.node,
    () =>
      (
        initialNode: PMNode,
        view: EditorView,
        getPos: () => number | undefined,
      ): NodeView => {
      const initial = createElement(IsVideoSource(text2(initialNode.attrs.src)));
      const isVisionFrequency = initial.isVisionFrequency;
      const viewportManaged = shouldHydrateNearViewport(view.state.doc.content.size);
      let near = !viewportManaged;
      let stopViewportObserver: (() => void) | null = null;
      writeAttribute(initial, initialNode, documentPath, near);
      let currentNode = initialNode;
      const focusEditorWithoutScroll = () => {
        view.dom.focus({ preventScroll: true });
      };

      const removeMedia = (): void => {
        const position2 = getPos();
        if (position2 === undefined) return;
        const node = view.state.doc.nodeAt(position2);
        if (!node || node.type.name !== "image") return;
        const tr = view.state.tr.delete(position2, position2 + node.nodeSize);
        tr.setSelection(TextSelection.near(tr.doc.resolve(position2), -1));
        view.dispatch(tr);
        focusEditorWithoutScroll();
      };

      initial.deleteBody.addEventListener("mousedown", (event) => event.preventDefault());
      initial.deleteBody.addEventListener("click", (event) => {
        event.preventDefault();
        event.stopPropagation();
        removeMedia();
      });
      initial.mediaBody.addEventListener("error", () => {
        setMediaError(
          initial,
          t("Image could not be loaded: {0}", text2(currentNode.attrs.src)),
        );
      });
      initial.mediaBody.addEventListener("load", () => setMediaError(initial, null));

      if (viewportManaged) {
        stopViewportObserver = observeNearViewport(initial.dom, view, (isNear) => {
          if (!isNear || near) return;
          near = true;
          writeAttribute(initial, currentNode, documentPath, true);
          stopViewportObserver?.();
          stopViewportObserver = null;
        });
      }

      const ensureSourceBody = (): HTMLTextAreaElement => {
        if (initial.sourceBody) return initial.sourceBody;
        const source = document.createElement("textarea");
        source.rows = 1;
        source.wrap = "soft";
        source.className = "nota-image-source";
        source.spellcheck = false;
        source.autocomplete = "off";
        source.setAttribute("aria-label", "Image Markdown source");
        initial.dom.insertBefore(source, initial.mediaBody);
        initial.sourceBody = source;
        bindSourceBodyEvents(source);
        return source;
      };

      const showSource = (): void => {
        initial.dom.classList.add("is-selected");
        const sourceBody = ensureSourceBody();
        if (!text2(currentNode.attrs.alt)) {
          const position2 = getPos();
          if (position2 !== undefined) {
            view.dispatch(
              view.state.tr.setNodeMarkup(position2, undefined, {
                ...currentNode.attrs,
                alt: automaticImageName(text2(currentNode.attrs.src)),
              }),
            );
          }
        }
        const sourceValue = imageMarkdownSource(currentNode);
        sourceBody.value = sourceValue;
        resizeImageSource(sourceBody);
        const selection = imageSourceSelectionRange(
          sourceValue,
          currentNode.attrs,
        );
        requestAnimationFrame(() => {
          if (!sourceBody.isConnected) return;
          sourceBody.focus({ preventScroll: true });
          sourceBody.setSelectionRange(selection.start, selection.end);
        });
      };

      initial.mediaBody.addEventListener("mousedown", (event) => {
        if (initial.isVisionFrequency || !(event instanceof MouseEvent) || event.button !== 0) return;
        event.preventDefault();
        showSource();
      });

      const commitSource = (returnFocus = false): void => {
        const source = initial.sourceBody;
        if (!source) return;
        const parsed = parseImageMarkdownSource(source.value);
        if (!parsed) {
          const position2 = getPos();
          if (position2 === undefined) return;
          const text4 = source.value;
          const transaction = view.state.tr.replaceWith(
            position2,
            position2 + currentNode.nodeSize,
            text4 ? view.state.schema.text(text4) : [],
          );
          transaction.setSelection(
            TextSelection.near(
              transaction.doc.resolve(position2 + text4.length),
              -1,
            ),
          );
          view.dispatch(transaction);
          if (returnFocus) focusEditorWithoutScroll();
          return;
        }
        const position2 = getPos();
        if (position2 === undefined) return;
        view.dispatch(
          view.state.tr.setNodeMarkup(position2, undefined, {
            ...currentNode.attrs,
            ...parsed,
          }),
        );
        if (returnFocus) focusEditorWithoutScroll();
      };

      const removeImageFromEmptySource = (): void => {
        removeMedia();
      };

      function bindSourceBodyEvents(source: HTMLTextAreaElement): void {
        source.addEventListener("keydown", (event) => {
          if (event.key === "Enter") {
            event.preventDefault();
            commitSource(true);
          } else if (event.key === "Escape") {
            event.preventDefault();
            source.value = imageMarkdownSource(currentNode);
            resizeImageSource(source);
            focusEditorWithoutScroll();
          }
        });
        source.addEventListener("input", () => {
          resizeImageSource(source);
          if (source.value.trim() === "") {
            removeImageFromEmptySource();
            return;
          }
          const parsed = parseImageMarkdownSource(source.value);
          if (!parsed) {
            initial.represent++;
            setMediaError(initial, null);
            initial.mediaBody.hidden = true;
            initial.deleteBody.hidden = true;
            initial.dom.classList.add("has-invalid-source");
            return;
          }
          initial.mediaBody.hidden = false;
          initial.deleteBody.hidden = false;
          initial.dom.classList.remove("has-invalid-source");
          const position2 = getPos();
          if (position2 === undefined) return;
          view.dispatch(
            view.state.tr.setNodeMarkup(position2, undefined, {
              ...currentNode.attrs,
              ...parsed,
            }),
          );
        });
        source.addEventListener("blur", () => commitSource(false));
        source.addEventListener("blur", () => {
          queueMicrotask(() => {
            if (
              initial.dom.isConnected &&
              !initial.dom.contains(document.activeElement)
            ) {
              initial.dom.classList.remove("is-selected");
            }
          });
        });
      }

      return {
        dom: initial.dom,
        update: (newValueNode: PMNode): boolean => {






          if (IsVideoSource(text2(newValueNode.attrs.src)) !== isVisionFrequency) return false;
          currentNode = newValueNode;
          writeAttribute(initial, newValueNode, documentPath, near);
          return true;
        },
        stopEvent: (event) =>
          event.target === initial.sourceBody ||
          event.target === initial.deleteBody ||
          (!initial.isVisionFrequency && event.target === initial.mediaBody),



        ignoreMutation: () => true,
        // Programmatic focusAtStart / reload may create a NodeSelection at an
        // image without any user intent. Keep the source editor closed in that
        // case; only an explicit click on the image opens it.
        selectNode: () => {
          initial.dom.classList.remove("is-selected");
        },
        deselectNode: () => {
          initial.dom.classList.remove("is-selected");
          if (initial.sourceBody) {
            initial.sourceBody.value = imageMarkdownSource(currentNode);
            resizeImageSource(initial.sourceBody);
          }
        },
        destroy: () => {
          stopViewportObserver?.();
          stopViewportObserver = null;
        },
        };
      },
  );
}
