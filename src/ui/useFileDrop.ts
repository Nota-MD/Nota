

















































import { useEffect } from "react";
import { getCurrentWebview } from "@tauri-apps/api/webview";

import { api, type ImageSourceArg, type PathKindClass } from "@/bridge/ipc";
import type { FilesSettings } from "@/bridge/types";
import { t as FlipTranslate, useT } from "@/i18n";
import type { Toast } from "@/ui/Toasts";
import { isMarkdownExtension } from "@/editor/file-kind";
import { isImageSliceTextItem } from "@/editor/image-kind";


const maxPerCall = 12;













const textExtension = [
  "md", "markdown", "mdown", "mkd", "mdx",
  "txt", "text", "log", "csv", "tsv",
  "json", "json5", "toml", "yaml", "yml", "ini", "conf", "env",
  "sh", "bash", "zsh", "py", "rs", "c", "h", "cc", "cpp", "hpp",
  "js", "jsx", "ts", "tsx", "css", "html", "htm", "xml", "sql", "lua",
];












function isTextTextItem(path: string): boolean {
  const name3 = path.split("/").pop() ?? "";
  if (!name3.includes(".")) return true;
  return textExtension.includes(name3.split(".").pop()?.toLowerCase() ?? "");
}

export interface DragReleaseWiring {

  openPath: (path: string) => Promise<boolean>;




  openFolder: (path?: string) => Promise<void>;

  dropOneImage: (source: ImageSourceArg, alt: string, wantAbovePass?: boolean) => Promise<void>;

  files: FilesSettings | null;

  hasDoc: boolean;
  toast: (message: string, level?: Toast["level"]) => void;
}

export function useFileDrop(w: DragReleaseWiring): void {


  const t = useT();
  const { openPath, openFolder, dropOneImage, files, hasDoc, toast } = w;

  useEffect(() => {




    const receiveBelowBatch = async (paths: string[]) => {
      if (paths.length === 0) return;

      let kindClass: PathKindClass[];
      try {
        kindClass = await api.pathKind(paths);
      } catch (e) {

        toast(t("Could not tell what was dropped in: {0}", String(e)), "error");
        return;
      }
      if (kindClass.length !== paths.length) {


        console.warn("[nota] nota_paths_kind length mismatch; drop skipped");
        return;
      }

      const textItemClamp: string[] = [];
      const imageSlice: string[] = [];
      const document: { path: string; markdown: boolean }[] = [];
      const loseDone: string[] = [];

      paths.forEach((path, i) => {
        const k = kindClass[i];
        if (k === "missing") return void loseDone.push(path);
        if (k === "dir") return void textItemClamp.push(path);
        if (isImageSliceTextItem(path)) return void imageSlice.push(path);



        document.push({ path: path, markdown: isMarkdownExtension(path) });
      });


      if (loseDone.length > 0) {



        const headOneItem = loseDone[0];


        if (!headOneItem) return;
        const name3 = headOneItem.split("/").pop() ?? headOneItem;
        toast(
          loseDone.length === 1
            ? t("The dropped “{0}” is gone (moved or deleted?)", name3)
            : t("{0} of the dropped items are gone (starting with “{1}”)", loseDone.length, name3),
          "error",
        );
      }


      const firstImage = imageSlice[0];
      if (firstImage) {
        if (!hasDoc) {
          toast(t("Open a document first so the picture has somewhere to go"), "info");
        } else {



          if (!atEditorAreaInsideHasFocusPoint()) {
            toast(t("Click into the text first, then drop the picture — otherwise there is no place to put it"), "info");
          }
          await dropOneImage({ kind: "path", path: firstImage }, "");
        }
      }


      const firstFolder = textItemClamp[0];
      if (firstFolder) {
        const select = files?.drop_folder ?? "open-in-app";
        if (select === "open-in-app") {
          if (textItemClamp.length > 1) {
            toast(
              t("Only one workspace can be open at a time; opened “{0}”", firstFolder.split("/").pop() ?? firstFolder),
              "info",
            );
          }
          await openFolder(firstFolder);
        } else if (select === "open-in-file-manager") {
          await handoffGiveTextItemManageManageDevice(firstFolder, t, toast);
        }

      }


      const openOf = document.slice(0, maxPerCall);
      if (document.length > maxPerCall) {
        toast(
          t("At most {0} files are opened at once; {1} were left unopened this time", maxPerCall, document.length - maxPerCall),
          "info",
        );
      }




      for (const oneDocument of openOf) {
        const select = oneDocument.markdown ? (files?.drop_markdown ?? "open-in-app") : (files?.drop_importable ?? "import-file");
        if (select === "ignore") continue;
        if (select === "open-in-file-manager") {
          await handoffGiveTextItemManageManageDevice(oneDocument.path, t, toast);
          continue;
        }
        if (!oneDocument.markdown && !isTextTextItem(oneDocument.path)) {




          toast(
            t("“{0}” is not a text file, and Nota does not convert formats, so it cannot open it", oneDocument.path.split("/").pop() ?? oneDocument.path),
            "info",
          );
          continue;
        }
        await openPath(oneDocument.path);
      }
    };

    let getClear: (() => void) | undefined;
    let splitDone = false;
    void getCurrentWebview()
      .onDragDropEvent((e) => {
        if (e.payload.type !== "drop") return;
        void receiveBelowBatch(e.payload.paths);
      })
      .then((un) => {


        if (splitDone) un();
        else getClear = un;
      })
      .catch((e) => {

        console.warn("[nota] Could not subscribe to drag events:", e);
      });
    return () => {
      splitDone = true;
      getClear?.();
    };
  }, [openFolder, openPath, dropOneImage, files, hasDoc, t, toast]);
}


function atEditorAreaInsideHasFocusPoint(): boolean {
  const el = document.activeElement as HTMLElement | null;
  return !!el?.closest?.(".editor-pane");
}










async function handoffGiveTextItemManageManageDevice(
  path: string,
  t: typeof FlipTranslate,
  toast: (message: string, level?: Toast["level"]) => void,
): Promise<void> {
  try {
    await api.export.reveal(path);
  } catch (e) {
    toast(t("Could not open “{0}” in the file manager: {1}", path.split("/").pop() ?? path, String(e)), "error");
  }
}
