/**
 * 「插入图像」这个框（三个字段：来源、地址、替代文字）。
 *
 * # 为什么不是 `PromptDialog`
 *
 * 那个框是**一行输入**，而插图有两条来路（磁盘上的文件、一条网址），
 * 走哪条路决定后面要问什么。硬塞进两个字段里的话，用户看到的是
 * 「图片地址」一个框，得自己知道"这里既能填路径也能填网址"——
 * 而**它填进去之后会发生什么**（复制？留在原处？复制到哪儿？）在框里
 * 一个字都没有。这一页的设置项恰恰全是关于这件事的。
 *
 * # ⚠️ 这个框**不自己算路径**
 *
 * 「复制到 ./assets」该写成 `assets/x.png` 还是 `./assets/x.png`、
 * 名字撞了怎么办、网络图片要不要下载——**全在宿主**
 * （`src-tauri/src/image.rs`，那边有 25 条用例）。这个框只负责问清楚
 * "哪张图、什么替代文字"，然后把两样交给 `api.image.place`。
 * 在这儿再算一遍路径 = 两份实现，而它们迟早不一样。
 *
 * ⚠️ 所以下面那句说明**只讲设置现在是什么**，不预告最后会写成哪条地址：
 * 预告就得在这儿复算一遍。真落了盘，宿主回一条事实、界面报一句（见 `useImageInsert`）。
 *
 * ⚠️ 按钮顺序、Esc = 取消、点遮罩 = 取消，三条和 `ConfirmDialog` /
 * `PromptDialog` 一致：同一个应用里三个长得一样的框，行为不该有三套。
 */

import { useEffect, useRef, useState, type KeyboardEvent } from "react";
import { open as selectTextItem } from "@/ui/file-picker";

import { useT } from "@/i18n";
import { DialogClose } from "@/ui/DialogClose";
import type { ImageAnswer, ImageRequest } from "@/ui/useDialogs";
import { useTablistKeys } from "@/ui/useTablistKeys";

/** 文件对话框的过滤器。⚠️ 与 `src-tauri/src/image.rs` 的 `认得的后缀` 同一套。 */
const imageSliceExtension = ["png", "jpg", "jpeg", "gif", "webp", "bmp", "svg", "avif"];

/** 从一条路径上取文件名（不带目录）。 */
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
  // ⚠️ **这一行不只是取值**：它订阅了语言（宿主报来语言之后这一块要重画，见
  // `i18n/index.ts::useT`）。局部这个名字盖住模块级的 `t`，下面全都用它。
  const t = useT();
  const [comeSource, setComeSource] = useState<"path" | "url">("path");
  const [address, setAddress] = useState("");
  const [replaceRepresentText, setReplaceRepresentText] = useState("");
  /**
   * 勾了「插入后上传」。
   *
   * ⚠️ 默认**不勾**：这一下是"把字节送出这台机器"，默认值不该替用户做这个决定
   * （与设置里 `enabled` 默认关同一条口径）。也**不记住上次的勾选**——
   * 记住就得有个地方存它，而那个地方迟早会被人当成"设置"去找。
   */
  const [wantAbovePass, setWantAbovePass] = useState(false);
  const inputBox = useRef<HTMLInputElement>(null);
  // 来源页签的方向键（第 50 项，2026-10-04）。
  const pageKeyBar = useRef<HTMLDivElement>(null);
  useTablistKeys(pageKeyBar);

  useEffect(() => {
    inputBox.current?.focus();
  }, []);

  /** 浏览按钮：选完把路径填进输入框，替代文字留空时顺手用文件名补上。 */
  const browseView = async () => {
    const selectOf = await selectTextItem({
      multiple: false,
      directory: false,
      filters: [{ name: t("Images"), extensions: imageSliceExtension }],
    });
    if (typeof selectOf !== "string") return; // 用户取消了，不是错误
    setComeSource("path");
    setAddress(selectOf);
    if (replaceRepresentText.trim() === "") {
      // 去掉后缀当替代文字：**只是默认值**，用户改得动。
      setReplaceRepresentText(textItemName(selectOf).replace(/\.[^.]+$/, ""));
    }
  };

  // ⚠️ **主字段为空 = 当作取消**，与 `PromptDialog` 同一条口径：
  // 一个 `![]()` 在正文里看不出坏、也点不开，而用户会以为是自己哪一步做错了。
  // 「改主意了、把框清空再点确定」是个很自然的取消方式。
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

        {/*
          ⚠️ 这句话**只说设置现在是什么**，不预告落点（见文件头）。
          ⚠️ 文档没存盘时补一句：四个"复制到…"的动作都要文档目录，
          那时宿主会**报错**（不会猜一个目录），先说出来比让用户撞一次好。
        */}
        <p className="prompt-hint">
          {t("Where it lands after inserting depends on Settings → Image → When inserting an image.")}
          {!request.documentSaved && (
            <>
              <br />
              {/*
                ⚠️ 这一条的键里**中间有一个空格**（「目录，」与「先保存」之间）——
                那是最初 JSX 换行渲染出来的那一个空格，原样带进键里。往 `en.ts`
                里加英文时**别把这个空格抹掉**，抹掉就成了废键（`tools/i18n-check.sh`
                会判 FAIL）。写成两截包是另一种做法，但那会把一句话拆成两个键。
              */}
              {t("This document has no saved location. The “Copy to…” actions require the document folder. Save the document (Ctrl+S), then try again.")}
            </>
          )}
        </p>

        {/*
          ⚠️ 上传那一行有三种样子，分别对应三种事实（都由宿主算好带进来，
          前端不自己推——推就多一处"界面说会传、实际没传"）：
            ① 会自动传（三道闸都过）：**不给勾选框**，只说明。摆一个勾了也没用、
               不勾也没用的框，只会让人以为自己能在这儿改主意。
            ② 配了服务器但不是这份文档要传：给勾选框。
            ③ 没配服务器：整行不出现。
        */}
        {request.meetingSelfActionAbovePass ? (
          <p className="prompt-hint">
            {/* ⚠️ 「写着」后面那个 `{" "}` 是**原来就在的**一个空格（JSX 文本在
                `<code>` 前面留的空），拆成两截之后得显式补回来，不然会粘在一起。 */}
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
