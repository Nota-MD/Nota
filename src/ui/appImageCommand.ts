import { revealItemInDir } from "@tauri-apps/plugin-opener";
import type { RefObject } from "react";

import { api, type Document, type Settings } from "@/bridge/ipc";
import { writeClipboard } from "@/editor/code-block";
import { localLocalImageSliceAbsoluteCorrectPath } from "@/editor/video-view";
import { t } from "@/i18n";
import type { EditorPaneHandle } from "@/ui/EditorPane";
import type { Toast } from "@/ui/Toasts";
import type { ConfirmAnswer, ConfirmRequest } from "@/ui/useDialogs";

function imageMarkdownPath(
  target: string,
  documentPath: string | null,
  preferRelative: boolean,
  addDotSlash: boolean,
): string {
  if (!preferRelative || !documentPath) return target;
  const slash = target.includes("\\") ? "\\" : "/";
  const docParts = documentPath.split(/[\\/]+/);
  docParts.pop();
  const targetParts = target.split(/[\\/]+/);
  const absolute = target.startsWith("/") || /^[a-zA-Z]:[\\/]/.test(target);
  if (!absolute) return target;
  let common = 0;
  while (
    common < docParts.length &&
    common < targetParts.length &&
    docParts[common] === targetParts[common]
  ) {
    common++;
  }
  const parts = [
    ...Array(Math.max(0, docParts.length - common)).fill(".."),
    ...targetParts.slice(common),
  ];
  const relative = parts.join(slash) || target;
  return addDotSlash && !relative.startsWith(".") ? `.${slash}${relative}` : relative;
}

export function createImageCommand({
  activeDoc,
  settings,
  editorRef,
  toast,
  askConfirm,
}: {
  activeDoc: Document | null;
  settings: Settings | null;
  editorRef: RefObject<EditorPaneHandle | null>;
  toast: (message: string, level?: Toast["level"], ttlMs?: number) => void;
  askConfirm: (request: ConfirmRequest) => Promise<ConfirmAnswer>;
}): (id: string, image: HTMLImageElement) => Promise<void> {
  return async (id, image) => {
    try {
      const source = image.dataset.notaSource ?? image.getAttribute("src") ?? "";
      const absolute = localLocalImageSliceAbsoluteCorrectPath(
        source,
        activeDoc?.path ?? null,
      );
      if (id.startsWith("image.zoom.")) {
        const zoom = Number(id.slice("image.zoom.".length));
        if (Number.isFinite(zoom) && zoom > 0) {
          const applied = editorRef.current?.runCommand("imageZoomSet", {
            oldSrc: source,
            zoom,
          });
          if (!applied) {
            image.parentElement?.style.setProperty(
              "--nota-image-zoom",
              String(zoom / 100),
            );
          }
        }
        return;
      }
      if (id.startsWith("image.syntax.")) {
        const syntax = id.endsWith(".html") ? "html" : "markdown";
        editorRef.current?.runCommand("imageSyntaxSet", {
          oldSrc: source,
          syntax,
        });
        return;
      }
      if (id.startsWith("image.copyAs.")) {
        const alt = image.getAttribute("alt") ?? "";
        const title = image.getAttribute("title") ?? "";
        const markdown = `![${alt.replaceAll("]", "\\]")}](${source}${
          title ? ` "${title.replaceAll('"', '\\"')}"` : ""
        })`;
        const html = `<img src="${source.replaceAll('"', "&quot;")}" alt="${alt.replaceAll(
          '"',
          "&quot;",
        )}"${title ? ` title="${title.replaceAll('"', "&quot;")}"` : ""} />`;
        const copied = await writeClipboard(id.endsWith(".html") ? html : markdown);
        toast(
          copied ? t("Copied to clipboard") : t("Could not copy to the clipboard."),
          copied ? "success" : "error",
        );
        return;
      }
      if (!absolute) {
        toast(t("This image is not a local file."), "warn");
        return;
      }
      if (id === "image.openLocation") {
        await revealItemInDir(absolute);
        return;
      }
      if (id === "image.copyTo" || id === "image.saveAs" || id === "image.moveTo") {
        const target = await api.picker.native({
          mode: "save",
          title:
            id === "image.copyTo"
              ? t("Copy Image To")
              : id === "image.moveTo"
                ? t("Rename / Move Image To")
                : t("Save Image As"),
          defaultPath: absolute,
        });
        const destination = target?.[0];
        if (!destination) return;
        if (id === "image.moveTo") {
          const moved = await api.image.moveFile(absolute, destination);
          const imageSettings = settings?.image;
          const nextSource = imageMarkdownPath(
            moved,
            activeDoc?.path ?? null,
            imageSettings?.prefer_relative ?? true,
            imageSettings?.add_dot_slash ?? true,
          );
          editorRef.current?.runCommand("imageSourceSet", {
            oldSrc: source,
            src: nextSource,
          });
          toast(t("Image moved"), "success");
        } else {
          await api.image.copyFile(absolute, destination);
          toast(t("Image copied"), "success");
        }
        return;
      }
      if (id === "image.upload") {
        if (!activeDoc) return;
        const uploaded = await api.image.uploadOne(activeDoc.id, {
          kind: "path",
          path: absolute,
        });
        editorRef.current?.runCommand("imageSourceSet", {
          oldSrc: source,
          src: uploaded.url,
        });
        toast(t("Image uploaded"), "success");
        return;
      }
      if (id === "image.deleteFile") {
        const answer = await askConfirm({
          title: t("Delete Image File"),
          message: t(
            "This permanently deletes the image file from disk and removes it from the document.",
          ),
          confirmLabel: t("Delete"),
          danger: true,
        });
        if (answer !== "confirm") return;
        await api.image.deleteFile(absolute);
        editorRef.current?.runCommand("imageRemoveSource", { oldSrc: source });
        toast(t("Image file deleted"), "success");
      }
    } catch (error) {
      toast(t("Image action failed: {0}", String(error)), "error");
    }
  };
}
