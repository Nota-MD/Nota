





















































import { useCallback, useEffect, useRef } from "react";

import { api, type DocId, type ImageSourceArg } from "@/bridge/ipc";
import { useT } from "@/i18n";
import type { Dialogs } from "@/ui/useDialogs";
import type { CommandPayload, EditorCommand } from "@/editor/create";
import { imageAddressOfPastedText, imageExtensionFromMime } from "@/editor/image-kind";
import { localLocalImageSliceAbsoluteCorrectPath } from "@/editor/video-view";
import type { Toast } from "@/ui/Toasts";
import { readImage } from "@tauri-apps/plugin-clipboard-manager";

export interface InsertImageWiring {







  run: (c: EditorCommand, payload?: CommandPayload) => void;

  docId: DocId | null;

  docSaved: boolean;
  askImage: Dialogs["askImage"];
  toast: (message: string, level?: Toast["level"]) => void;
}

export interface InsertImageOutputMouth {

  insertImageLike: () => Promise<void>;










  dropOneImage: (source: ImageSourceArg, alt: string, wantAbovePass?: boolean) => Promise<void>;




  pasteClipboardImage: () => Promise<boolean>;
}


function atEditorAreaInside(target: EventTarget | null): boolean {
  const el = target as HTMLElement | null;
  if (el?.closest?.(".editor-pane")) return true;
  const active = document.activeElement as HTMLElement | null;
  return !!active?.closest?.(".editor-pane");
}

/** Pick the primary image from clipboard HTML. */
export function imageOnlyFromClipboardHtml(
  html: string,
  allowVisibleText = false,
): { src: string; alt: string } | null {
  if (!html.trim()) return null;
  const parsed = new DOMParser().parseFromString(html, "text/html");
  const images = Array.from(parsed.images);
  if (
    images.length !== 1 ||
    (!allowVisibleText && (parsed.body.textContent ?? "").trim() !== "")
  ) {
    return null;
  }
  const src = images[0]?.getAttribute("src")?.trim();
  if (!src) return null;
  return { src, alt: images[0]?.getAttribute("alt") ?? "" };
}








async function editBecome_base64(blob: Blob): Promise<string> {
  const buf = new Uint8Array(await blob.arrayBuffer());
  let s = "";
  const block = 0x8000;
  for (let i = 0; i < buf.length; i += block) {
    s += String.fromCharCode(...buf.subarray(i, i + block));
  }
  return btoa(s);
}

export function useImageInsert(w: InsertImageWiring): InsertImageOutputMouth {


  const t = useT();
  const { run, docId, docSaved, askImage, toast } = w;















  const dropOneImage = useCallback(
    async (source: ImageSourceArg, alt: string, wantAbovePass = false) => {

      if (wantAbovePass) {
        try {
          const { url } = await api.image.uploadOne(docId, source);
          run("image", { src: url, alt });
          toast(t("Image uploaded to {0}", url), "info");



          return;
        } catch (e) {

          toast(t("Upload failed — inserting as usual: {0}", String(e)), "error");
        }
      }
      try {
        const r = await api.image.place(docId, source);
        run("image", { src: r.src, alt });




        const oneSentence: Record<string, string> = {
          copied: t("Image copied to {0}", r.src),
          downloaded: t("Image downloaded from the web to {0}", r.src),
          written: t("Image written to {0}", r.src),
          existing: t("{0} already has this image, so it is referenced directly (nothing was saved twice).", r.src),
        };
        const speech = oneSentence[r.did];
        if (speech) toast(speech, "info");



        if (r.action === "copy-to-assets" && r.did === "written") {
          toast(t("An image from the clipboard has to be written to disk first — handled as “Copy to ./assets”."), "info");
        }





        if (r.upload?.kind === "ok") {
          toast(
            r.savedTo
              ? t("Image uploaded to {0}; the local copy stays at {1}", r.upload.url, r.savedTo)
              : t("Image uploaded to {0}", r.upload.url),
            "info",
          );
        } else if (r.upload?.kind === "failed") {
          toast(
            t("Automatic upload failed: {0} (the image is not lost — the document holds the local path).", r.upload.error),
            "error",
          );
        }
      } catch (e) {
        toast(t("Could not insert the image: {0}", String(e)), "error");
      }
    },
    [docId, run, toast],
  );


  const receiveBelowCutPasteBoard = useCallback(
    async (blob: Blob, alt = "") => {
      if (!docId) {
        toast(t("Open a document before pasting an image."), "info");
        return;
      }
      try {
        const data = await editBecome_base64(blob);
        await dropOneImage({ kind: "base64", data, ext: imageExtensionFromMime(blob.type) }, alt);
      } catch (e) {
        toast(t("Could not read the image from the clipboard: {0}", String(e)), "error");
      }
    },
    [docId, dropOneImage, toast],
  );
  const pasteClipboardImageRef = useRef<() => Promise<boolean>>(async () => false);


  useEffect(() => {
    const takeRichImage = (
      data: DataTransfer | null,
      event: Event,
    ): boolean => {
      const item5 = Array.from(data?.items ?? []);
      const imageItem = item5.find((i) => i.kind === "file" && i.type.startsWith("image/"));
      const blob = imageItem?.getAsFile();
      if (blob) {
        event.preventDefault();
        event.stopPropagation();
        void receiveBelowCutPasteBoard(blob);
        return true;
      }
      if (imageItem) {
        event.preventDefault();
        event.stopPropagation();
        void pasteClipboardImageRef.current();
        return true;
      }

      // Rich image copies often expose no file item, only HTML with a temporary
      // blob URL. Route that image through the same persistent placement path.
      const html = data?.getData("text/html") ?? "";
      const fromHtml = imageOnlyFromClipboardHtml(html, true);
      const plain = data?.getData("text/plain").trim() ?? "";
      const markdownImage = /^!?\[([^\]]*)\]\(\s*(?:<([^>]+)>|([^)\s]+))\s*\)$/.exec(plain);
      const uriAddress =
        data?.getData("text/uri-list")
          .split(/\r?\n/)
          .map((line) => line.trim())
          .find((line) => line && !line.startsWith("#")) ?? "";
      const imageAddress =
        imageAddressOfPastedText(uriAddress) ??
        imageAddressOfPastedText(plain.split(/\s+/, 1)[0] ?? "");
      const imageOnly =
        fromHtml ??
        (markdownImage
          ? {
              src: markdownImage[2] ?? markdownImage[3] ?? "",
              alt: markdownImage[1] ?? "",
            }
          : imageAddress
            ? { src: imageAddress, alt: "" }
            : null);
      if (!imageOnly || !/^(?:blob:|data:|https?:|file:|\/|[A-Za-z]:[\\/])/i.test(imageOnly.src)) {
        return false;
      }
      event.preventDefault();
      event.stopPropagation();
      const localPath = localLocalImageSliceAbsoluteCorrectPath(imageOnly.src, null);
      const alt =
        imageOnly.alt.trim() &&
        !/^(?:file:|[A-Za-z]:[\\/]|\/)/i.test(imageOnly.alt.trim())
          ? imageOnly.alt
          : localPath?.split(/[/\\]/).filter(Boolean).at(-1) ?? "";
      if (localPath) {
        void dropOneImage({ kind: "path", path: localPath }, alt);
        return true;
      }
      if (/^(?:blob:|data:)/i.test(imageOnly.src)) {
        void fetch(imageOnly.src)
          .then((response) => {
            if (!response.ok) throw new Error(`HTTP ${response.status}`);
            return response.blob();
          })
          .then((richBlob) => receiveBelowCutPasteBoard(richBlob, alt))
          .catch((error: unknown) => {
            toast(t("Could not read the image from the clipboard: {0}", String(error)), "error");
          });
      } else {
        void dropOneImage({ kind: "url", url: imageOnly.src }, alt);
      }
      return true;
    };

    const onPaste = (event: ClipboardEvent) => {
      if (!atEditorAreaInside(event.target)) return;
      takeRichImage(event.clipboardData, event);
    };
    const onDrop = (event: DragEvent) => {
      if (!atEditorAreaInside(event.target)) return;
      takeRichImage(event.dataTransfer, event);
    };
    const onBeforeInput = (event: InputEvent) => {
      if (
        !atEditorAreaInside(event.target) ||
        (event.inputType !== "insertFromPaste" &&
          event.inputType !== "insertFromDrop")
      ) {
        return;
      }
      takeRichImage(event.dataTransfer, event);
    };
    document.addEventListener("paste", onPaste, true);
    document.addEventListener("drop", onDrop, true);
    document.addEventListener("beforeinput", onBeforeInput, true);
    return () => {
      document.removeEventListener("paste", onPaste, true);
      document.removeEventListener("drop", onDrop, true);
      document.removeEventListener("beforeinput", onBeforeInput, true);
    };
  }, [receiveBelowCutPasteBoard]);

  const insertImageLike = useCallback(async () => {




    let ableAbovePass = false;
    let meetingSelfActionAbovePass = false;
    try {
      const s = await api.image.uploadGet(docId);
      ableAbovePass = s.canUpload;
      meetingSelfActionAbovePass = s.willAutoUpload;
    } catch (e) {
      console.warn("[nota] Could not read upload settings; treating uploads as unconfigured:", e);
    }
    const a = await askImage({ documentSaved: docSaved, ableAbovePass, meetingSelfActionAbovePass });
    if (!a) return;
    await dropOneImage(a.source as ImageSourceArg, a.alt, a.abovePass);
  }, [askImage, docId, docSaved, dropOneImage]);

  const pasteClipboardImage = useCallback(async (): Promise<boolean> => {
    let image: Awaited<ReturnType<typeof readImage>>;
    try {
      image = await readImage();
    } catch {
      return false;
    }
    try {
      const { width, height } = await image.size();
      const rgba = await image.rgba();
      const canvas = document.createElement("canvas");
      canvas.width = width;
      canvas.height = height;
      const context = canvas.getContext("2d");
      if (!context) throw new Error("Canvas 2D context is unavailable");
      context.putImageData(new ImageData(new Uint8ClampedArray(rgba), width, height), 0, 0);
      const data = canvas.toDataURL("image/png").replace(/^data:image\/png;base64,/, "");
      await dropOneImage({ kind: "base64", data, ext: "png" }, "");
      return true;
    } catch (e) {
      toast(t("Could not read the image from the clipboard: {0}", String(e)), "error");
      return true;
    } finally {
      await image.close();
    }
  }, [dropOneImage, t, toast]);
  pasteClipboardImageRef.current = pasteClipboardImage;

  return { insertImageLike, dropOneImage, pasteClipboardImage };
}
