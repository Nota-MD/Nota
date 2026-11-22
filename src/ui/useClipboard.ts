











































import { useCallback } from "react";
import type { RefObject } from "react";

import type { EditorPaneHandle } from "@/ui/EditorPane";
import type { CommandPayload, EditorCommand, SelectionContent } from "@/editor/create";
import { readText, writeImage } from "@tauri-apps/plugin-clipboard-manager";
import { Image as ClipboardImage } from "@tauri-apps/api/image";

import { writeClipboard } from "@/editor/code-block";
import { useT } from "@/i18n";
import type { Toast } from "@/ui/Toasts";

export interface CutPasteBoardWiring {

  editorRef: RefObject<EditorPaneHandle | null>;

  run: (c: EditorCommand, payload?: CommandPayload) => void;
  toast: (message: string, level?: Toast["level"]) => void;

  pasteImage: () => Promise<boolean>;
}

export interface CutPasteBoardOutputMouth {

  copy: () => Promise<boolean>;

  cutSplit: () => Promise<void>;

  pastePaste: () => Promise<void>;

  copyAsMarkdown: () => Promise<void>;

  copyAsPlainText: () => Promise<void>;

  copyAsHTML: () => Promise<void>;






  copyImageSlice: (target?: HTMLImageElement | null) => Promise<void>;
}









async function writeCutPasteBoard(content: SelectionContent): Promise<boolean> {
  if (content.html && typeof ClipboardItem !== "undefined" && navigator.clipboard?.write) {
    try {
      await navigator.clipboard.write([
        new ClipboardItem({
          "text/plain": new Blob([content.text], { type: "text/plain" }),
          "text/html": new Blob([content.html], { type: "text/html" }),
        }),
      ]);
      return true;
    } catch {


    }
  }
  return writeClipboard(content.text);
}


async function writeImageNative(image: HTMLImageElement): Promise<void> {
  if (!image.complete) await image.decode();
  const width = image.naturalWidth || image.width;
  const height = image.naturalHeight || image.height;
  if (!width || !height) throw new Error("Image has no bitmap size");

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d", { willReadFrequently: true });
  if (!context) throw new Error("Canvas 2D context is unavailable");
  context.drawImage(image, 0, 0, width, height);
  const rgba = context.getImageData(0, 0, width, height).data;

  const imageResource = await ClipboardImage.new(new Uint8Array(rgba.buffer), width, height);
  try {
    await writeImage(imageResource);
  } finally {
    await imageResource.close();
  }
}

export function useClipboard(w: CutPasteBoardWiring): CutPasteBoardOutputMouth {


  const t = useT();
  const { editorRef, run, toast, pasteImage } = w;

  const copy = useCallback(async () => {
    const content = editorRef.current?.selection() ?? null;
    if (!content) {


      toast(t("Select some text first."), "info");
      return false;
    }
    if (await writeCutPasteBoard(content)) {


      toast(t("Copied to clipboard"), "success");
      return true;
    }
    toast(t("Could not copy: the system refused to write to the clipboard."), "error");
    return false;
  }, [editorRef, toast]);

  const cutSplit = useCallback(async () => {



    if (!(await copy())) return;
    run("insertText", { text: "" });
  }, [copy, run]);

  const pastePaste = useCallback(async () => {



    if (await pasteImage()) return;




    let text = "";
    try {




      text = await readText();
    } catch {


    }
    if (text) {
      run("insertText", { text });
      return;
    }
    toast(t("There is no text or image in the clipboard."), "info");
  }, [pasteImage, run, t, toast]);








  const copyAsMarkdown = useCallback(async () => {
    const text = editorRef.current?.getMarkdown();
    if (text === undefined) return;
    try {
      await navigator.clipboard.writeText(text);
      toast(t("Copied the Markdown source."), "success");
    } catch (e) {
      toast(t("Could not copy: {0}", String(e)), "error");
    }
  }, [editorRef, toast]);


















  const copyAsPlainText = useCallback(async () => {
    const content = editorRef.current?.selection() ?? null;
    if (!content) {
      toast(t("Select some text first."), "info");
      return;
    }
    const become = await writeClipboard(content.text);
    toast(
      become ? t("Copied to clipboard") : t("Could not copy: the system refused to write to the clipboard."),
      become ? "success" : "error",
    );
  }, [editorRef, toast]);

  const copyAsHTML = useCallback(async () => {
    const content = editorRef.current?.selection() ?? null;
    if (!content) {
      toast(t("Select some text first."), "info");
      return;
    }



    if (!content.html) {
      toast(t("That selection has no HTML to copy."), "info");
      return;
    }
    const become = await writeClipboard(content.html);
    toast(
      become ? t("Copied to clipboard") : t("Could not copy: the system refused to write to the clipboard."),
      become ? "success" : "error",
    );
  }, [editorRef, toast]);

  const copyImageSlice = useCallback(
    async (target?: HTMLImageElement | null) => {
      let image = target ?? null;
      if (!image) {
        const selection = window.getSelection();
        const anchor = selection?.anchorNode;
        const start4 = anchor instanceof Element ? anchor : anchor?.parentElement;
        image = start4?.closest("img") ?? null;
        if (!image && selection && selection.rangeCount) {
          const range = selection.getRangeAt(0);
          const common = range.commonAncestorContainer;
          const root = common instanceof Element ? common : common.parentElement;
          const found = root?.querySelectorAll("img") ?? [];
          if (found.length === 1) image = found[0] ?? null;
        }
      }
      if (!image) {
        toast(t("Place the cursor on an image or select exactly one image first."), "info");
        return;
      }

      let nativeError: unknown = null;
      try {
        await writeImageNative(image);
        toast(t("Copied the image to the clipboard."), "success");
        return;
      } catch (error) {
        nativeError = error;
      }

      try {
        const response = await fetch(image.currentSrc || image.src);
        if (!response.ok) throw new Error(`${response.status} ${response.statusText}`);
        const blob = await response.blob();
        const type = blob.type.startsWith("image/") ? blob.type : "image/png";
        await navigator.clipboard.write([new ClipboardItem({ [type]: blob })]);
        toast(t("Copied the image to the clipboard."), "success");
      } catch (browserError) {
        toast(
          t(
            "Could not copy the image: {0}",
            nativeError ? String(nativeError) : String(browserError),
          ),
          "error",
        );
      }
    },
    [t, toast],
  );

  return { copy, cutSplit, pastePaste, copyAsMarkdown, copyAsPlainText, copyAsHTML, copyImageSlice };
}
