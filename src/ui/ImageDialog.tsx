import { useEffect, useRef, useState, type KeyboardEvent } from "react";
import { open as selectTextItem } from "@/ui/file-picker";

import { imageSliceExtension } from "@/editor/image-kind";
import { useT } from "@/i18n";
import { DialogClose } from "@/ui/DialogClose";
import type { ImageAnswer, ImageRequest } from "@/ui/useDialogs";
import { useTablistKeys } from "@/ui/useTablistKeys";


function textItemName(path: string): string {
  const paragraph2 = path.split(/[\\/]/);
  return paragraph2[paragraph2.length - 1] || path;
}

export function ImageDialog({
  request,
  onAnswer,
}: {
  request: ImageRequest;
  onAnswer: (answer: ImageAnswer | null) => void;
}) {


  const t = useT();
  const [comeSource, setComeSource] = useState<"path" | "url">("path");
  const [address, setAddress] = useState("");
  const [replaceRepresentText, setReplaceRepresentText] = useState("");


  const [wantAbovePass, setWantAbovePass] = useState(false);
  const inputBox = useRef<HTMLInputElement>(null);

  const pageKeyBar = useRef<HTMLDivElement>(null);
  useTablistKeys(pageKeyBar);

  useEffect(() => {
    inputBox.current?.focus();
  }, []);


  const browseView = async () => {
    const selectOf = await selectTextItem({
      multiple: false,
      directory: false,
      filters: [{ name: t("Images"), extensions: imageSliceExtension }],
    });
    if (typeof selectOf !== "string") return;
    setComeSource("path");
    setAddress(selectOf);
    if (replaceRepresentText.trim() === "") {

      setReplaceRepresentText(textItemName(selectOf).replace(/\.[^.]+$/, ""));
    }
  };


  const raiseHandoff = () => {
    const a = address.trim();
    if (a === "") return onAnswer(null);
    onAnswer({
      source: comeSource === "url" ? { kind: "url", url: a } : { kind: "path", path: a },
      alt: replaceRepresentText,
      abovePass: wantAbovePass,
    });
  };

  const returnCarOrBackOutput = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      e.preventDefault();
      raiseHandoff();
    } else if (e.key === "Escape") {
      e.preventDefault();
      onAnswer(null);
    }
  };

  return (
    <div className="confirm-backdrop" onMouseDown={() => onAnswer(null)}>
      <div
        className="confirm-dialog prompt-dialog"
        role="dialog"
        aria-modal="true"
        aria-label={t("Insert Image")}
        onMouseDown={(e) => e.stopPropagation()}
      >
        <DialogClose onClose={() => onAnswer(null)} />
        <h2 className="confirm-title">{t("Insert Image")}</h2>

        <div ref={pageKeyBar} className="image-src-tabs" role="tablist" aria-label={t("Where the image comes from")}>
          <button
            type="button"
            role="tab"
            aria-selected={comeSource === "path"}
            className={`btn ${comeSource === "path" ? "btn-primary" : ""}`}
            onClick={() => setComeSource("path")}
          >
            {t("Local file")}
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={comeSource === "url"}
            className={`btn ${comeSource === "url" ? "btn-primary" : ""}`}
            onClick={() => setComeSource("url")}
          >
            {t("Web address")}
          </button>
        </div>

        <label className="prompt-label" htmlFor="nota-image-src">
          {comeSource === "url" ? t("Image URL") : t("Image file")}
        </label>
        <div className="image-src-row">
          <input
            id="nota-image-src"
            ref={inputBox}
            className="prompt-input"
            type="text"
            autoComplete="off"
            spellCheck={false}
            value={address}
            placeholder={
              comeSource === "url"
                ? t("https://example.com/image.png")
                : t("Full path to the file, or a path relative to this document's folder")
            }
            onChange={(e) => setAddress(e.target.value)}
            onKeyDown={returnCarOrBackOutput}
          />
          {comeSource === "path" && (
            <button type="button" className="btn" onClick={() => void browseView()}>
              {t("Browse…")}
            </button>
          )}
        </div>

        <label className="prompt-label" htmlFor="nota-image-alt">
          {t("Alt text (optional)")}
        </label>
        <input
          id="nota-image-alt"
          className="prompt-input"
          type="text"
          autoComplete="off"
          value={replaceRepresentText}
          placeholder={t("Shown when the image cannot be loaded")}
          onChange={(e) => setReplaceRepresentText(e.target.value)}
          onKeyDown={returnCarOrBackOutput}
        />


        <p className="prompt-hint">
          {t("Where it lands after inserting depends on Settings → Image → When inserting an image.")}
          {!request.documentSaved && (
            <>
              <br />


              {t("This document has no saved location. The “Copy to…” actions require the document folder. Save the document (Ctrl+S), then try again.")}
            </>
          )}
        </p>


        {request.meetingSelfActionAbovePass ? (
          <p className="prompt-hint">


            {t("The document YAML specifies")}{" "}
            <code>nota-auto-upload</code>
            {t(", and settings allow automatic upload — the image is uploaded right after inserting and the document gets the returned URL (delete that line from the YAML to turn this off).")}
          </p>
        ) : (
          request.ableAbovePass && (
            <label className="image-upload-row">
              <input
                type="checkbox"
                checked={wantAbovePass}
                onChange={(e) => setWantAbovePass(e.target.checked)}
              />
              {t("Upload after inserting (the document gets the returned URL)")}
            </label>
          )
        )}
        {!request.meetingSelfActionAbovePass && request.ableAbovePass && wantAbovePass && (
          <p className="prompt-hint">
              {t("If upload fails, the document uses the local file path instead. The failure is reported separately.")}
          </p>
        )}

        <div className="confirm-actions">
          <button type="button" className="btn" onClick={() => onAnswer(null)}>
            {t("Cancel")}
          </button>
          <button type="button" className="btn btn-primary" onClick={raiseHandoff}>
            {t("Insert")}
          </button>
        </div>
      </div>
    </div>
  );
}
