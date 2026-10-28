/**
 * 把一张图弄进文档的**两条路**：对话框（菜单 / 工具栏 / 快捷键）与**粘贴**。
 *
 * ⚠️ **第三条路（拖入）2026-09-27 搬走了**，搬到 `ui/useFileDrop.ts`：
 * 拖进来的东西**不一定是图片**——还有 Markdown、文件夹、别的文件，而它们
 * 各自该做什么是另一份账（`files.drop_folder` / `drop_markdown` /
 * `drop_importable`）。两条路各挂一个 `onDragDropEvent`，同一个东西就会被
 * 处理两遍（拖一张图插两次）。所以**窗口级的拖放只留一个订阅者**，在那边；
 * 这一份把"把一张图弄进去"这个动作**导出去**（`落一张`）给它用。
 * 判据是"拖进来的东西归谁管"：**图片归这里，其余归那里**。
 *
 * 两条路共用下面那一个 `落一张`：问清楚"哪张图" → 交给宿主落地
 * （`api.image.place`，算式全在 `src-tauri/src/image.rs`）→ 把回来的地址插进正文。
 * 所以"复制到 ./assets"在两条路上的行为必然一致，而不是各写一遍。
 *
 * # ⚠️ 为什么它从 `useEditorCommands` 里分出来
 *
 * 那一块是"菜单命令 → 编辑器动作"的跑腿（见它的文件头），进去的是**一句用户
 * 看得懂的话**；这里进去的是**一段图片字节或一个文件路径**，多两道宿主往返，
 * 而且它还要挂一个**全局**监听（粘贴）。混在一起的话，`useEditorCommands`
 * 就得同时知道剪贴板和文件对话框。
 *
 * # 粘贴为什么挂在 `document` 上（捕获阶段）
 *
 * 编辑器自己是 ProseMirror / CodeMirror 的 DOM，它们对"剪贴板里是图片"这件事
 * 的处理是**把这坨二进制丢掉**（能落进文档树的是文本）。要拦住它只有一条路：
 * 在**捕获阶段**先拿到事件。⚠️ 所以只在粘贴目标是编辑区里时才动手
 * （`在编辑区里`）——不然在设置页的输入框里粘一张图，会把图片插进正文，
 * 而用户的焦点在别处。其余情况一律**放行**，不 `preventDefault`。
 *
 * # 拖入进来的路径**不是字节**
 *
 * `tauri.conf.json` 里 `dragDropEnabled: true`（默认值），窗口的拖放由 Tauri
 * 在**系统层**接管，WebView 里那个 `drop` 事件根本不会带 `dataTransfer.files`。
 * 所以走 `onDragDropEvent`——它给的是**路径**，正好：拖进来的多数是磁盘上
 * 已有的文件，宿主直接读原文件就行，不必过 IPC 传字节。
 *（订阅那一段现在在 `ui/useFileDrop.ts`，见上。）
 * # 上传（2026-09-26 加）
 *
 * 「传上去」有两种触发方式，只有对话框那条路能**手动**发起：
 *
 * | 路 | 谁决定传 | 什么时候传 |
 * |---|---|---|
 * | 对话框 | 用户勾「插入后上传」 | 插入**之前**（传成了就直接写网址，不落地） |
 * | 拖入 / 粘贴 / 对话框 | **文档**的前件 + 设置（`nota-auto-upload`） | 落地**之后**，在宿主里 |
 *
 * ⚠️ 粘贴与拖入**没有勾选框**：那两条路是"手上正拿着一坨东西、直接扔进来"，
 * 中间插一个对话框等于把最顺手的两个动作变慢。要上传就在设置里开自动上传，
 * 或者走了菜单那条路。
 *
 * ⚠️ 自动上传**永远只对本地来源**（拖入、粘贴、对话框选了文件）发生：
 * 网络图片自动去取等于替用户访问一个第三方，见 `commands/image.rs` 文件头。
 */

import { useCallback, useEffect } from "react";

import { api, type DocId, type ImageSourceArg } from "@/bridge/ipc";
import { useT } from "@/i18n";
import type { Dialogs } from "@/ui/useDialogs";
import type { CommandPayload, EditorCommand } from "@/editor/create";
import { imageExtensionFromMime } from "@/editor/image-kind";
import type { Toast } from "@/ui/Toasts";

export interface InsertImageWiring {
  /**
   * 转交一条编辑命令（`useEditorCommands` 那条）。
   *
   * ⚠️ 插入走的是它（`run("image", {src, alt})`），**不直接碰 `EditorPaneHandle`**：
   * "这条命令在当前编辑模式下有没有实现"那个判据在 `run` 里（源码模式插不了图，
   * 它会如实说一句），绕过它就等于把那个提示丢掉。
   */
  run: (c: EditorCommand, payload?: CommandPayload) => void;
  /** 当前文档。`null` = 一份都没打开（那时「插入图像」什么都不做）。 */
  docId: DocId | null;
  /** 当前文档存过盘没有（对话框里据此提醒一句）。 */
  docSaved: boolean;
  askImage: Dialogs["askImage"];
  toast: (message: string, level?: Toast["level"]) => void;
}

export interface InsertImageOutputMouth {
  /** 「图像」：问来源与替代文字，交给宿主落地，再把地址插进正文。 */
  insertImageLike: () => Promise<void>;
  /**
   * **把一张图插到当前光标**——三样东西的共用动作（对话框那条路内部也用它）。
   *
   * ⚠️ **导出去是给 `ui/useFileDrop.ts` 用的**（拖一张图进来）：那边是窗口级
   * 拖放的**唯一订阅者**，图片这一支派回这里（见文件头）。
   *
   * `要上传` = 用户手动勾的"插入后上传"，**只有对话框那条路会传 `true`**
   *（拖入是"手上正拿着一坨东西、直接扔进来"，中间插一个对话框等于把最顺手的
   * 那个动作变慢，理由见 `settings` 那一头）。自动上传不归它管。
   */
  dropOneImage: (source: ImageSourceArg, alt: string, wantAbovePass?: boolean) => Promise<void>;
}

/** 事件的目标在编辑区里吗。 */
function atEditorAreaInside(target: EventTarget | null): boolean {
  const el = target as HTMLElement | null;
  return !!el?.closest?.(".editor-pane");
}

/**
 * 把一段图片字节编成 base64（不带 `data:` 前缀）。
 *
 * ⚠️ **分块**是有原因的：`String.fromCharCode(...buf)` 在几 MB 的图上会因为
 * 参数太多直接爆栈（`RangeError: Maximum call stack size exceeded`），
 * 而那个报错出现在"粘贴一张大截图"时，看起来跟图片本身有关。
 */
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
  // ⚠️ **这一行不只是取值**：它订阅了语言（宿主报来语言之后这一块要重画，见
  // `i18n/index.ts::useT`）。局部这个名字盖住模块级的 `t`，下面全都用它。
  const t = useT();
  const { run, docId, docSaved, askImage, toast } = w;

  /**
   * 把一张图交给宿主落地，然后把回来的地址插进正文。
   *
   * ⚠️ 提示语**在这里拼**（不在宿主里）：宿主回的是事实（`did` / `action` /
   * `src` / `upload`），说成哪句话是界面的事——宿主说中文的话，界面换语言时
   * 它说不出口。
   *
   * `要上传` 是**对话框里那个勾**（手动上传）。它和自动上传**不是一回事**，
   * 方向也不同：
   * - 手动：**先试上传，失败了才走落地**——用户此刻要的是那条网址；
   * - 自动：**先落地，成了才换地址**——那是宿主在 `nota_image_place` 尾巴上
   *   做的事，这里只管把结果说给用户听（见 `r.upload`）。
   * 两条路的结果一样：**正文里总有一条能用的地址**。
   */
  const dropOneImage = useCallback(
    async (source: ImageSourceArg, alt: string, wantAbovePass = false) => {
      // ── 手动上传：勾了才走这一步 ──────────────────────────────────────
      if (wantAbovePass) {
        try {
          const { url } = await api.image.uploadOne(docId, source);
          run("image", { src: url, alt });
          toast(t("Image uploaded to {0}", url), "info");
          // ⚠️ **传成了就到此为止**：不再落地。代价是磁盘上不会多出一份
          // `assets/` 里的副本（不传的时候那份是给"文档换台机器也能看"用的，
          // 而地址已经是网址了，副本没有用处）。
          return;
        } catch (e) {
          // ⚠️ 传失败**不是插入失败**：下面照常落地，图照样进文档。
          toast(t("Upload failed — inserting as usual: {0}", String(e)), "error");
        }
      }
      try {
        const r = await api.image.place(docId, source);
        run("image", { src: r.src, alt });
        // 只有**真的动了磁盘**才报一句：设置是「无特殊操作」时那一下本来
        // 就是用户要的，再弹一条"图片留在原处"是噪音。
        // ⚠️ 这张表的**键**是宿主回的原始值（`r.did`），值才是给用户看的话——
        // 所以中文只出现在右边，而且必须在这一层（组件渲染期间）现翻。
        const oneSentence: Record<string, string> = {
          copied: t("Image copied to {0}", r.src),
          downloaded: t("Image downloaded from the web to {0}", r.src),
          written: t("Image written to {0}", r.src),
          existing: t("{0} already has this image, so it is referenced directly (nothing was saved twice).", r.src),
        };
        const speech = oneSentence[r.did];
        if (speech) toast(speech, "info");
        // ⚠️ 剪贴板来的图**必须落盘**：设置是「无特殊操作」时宿主退回了
        // 「复制到 ./assets」。这是全仓唯一一处"设置说的和做的不一样"，
        // 所以要说出来——不说的话，用户会以为设置没生效。
        if (r.action === "copy-to-assets" && r.did === "written") {
          toast(t("An image from the clipboard has to be written to disk first — handled as “Copy to ./assets”."), "info");
        }
        // ── 自动上传那一步的结果 ────────────────────────────────────────
        // ⚠️ **两种情况都要说话**：自动上传是"把用户的字节发出去"，
        // 静默成功比失败更糟——用户不知道该不该担心。也**不能只说成功**：
        // 失败时正文里写的是本地地址，不说的话用户会以为已经传上去了
        // （`src` 那时候没换，见 `commands/image.rs`）。
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

  /** 剪贴板里那张图 → 落盘 → 插进正文。⚠️ 这条路**没有手动上传**（见文件头）。 */
  const receiveBelowCutPasteBoard = useCallback(
    async (blob: Blob) => {
      if (!docId) {
        toast(t("Open a document before pasting an image."), "info");
        return;
      }
      try {
        const data = await editBecome_base64(blob);
        await dropOneImage({ kind: "base64", data, ext: imageExtensionFromMime(blob.type) }, "");
      } catch (e) {
        toast(t("Could not read the image from the clipboard: {0}", String(e)), "error");
      }
    },
    [docId, dropOneImage, toast],
  );

  // ── 粘贴 ────────────────────────────────────────────────────────────────
  useEffect(() => {
    const onPaste = (e: ClipboardEvent) => {
      if (!atEditorAreaInside(e.target)) return;
      const item5 = Array.from(e.clipboardData?.items ?? []);
      const image = item5.find((i) => i.kind === "file" && i.type.startsWith("image/"));
      const blob = image?.getAsFile();
      if (!blob) return; // 不是图片：放行，让编辑器按它自己的规矩处理文本
      // ⚠️ 必须拦住：不拦的话编辑器会把这次粘贴当成"没有可插入的内容"，
      // 而我们已经异步去落盘了——两条路都在跑，谁先到看运气。
      e.preventDefault();
      void receiveBelowCutPasteBoard(blob);
    };
    document.addEventListener("paste", onPaste, true);
    return () => document.removeEventListener("paste", onPaste, true);
  }, [receiveBelowCutPasteBoard]);

  const insertImageLike = useCallback(async () => {
    // ⚠️ 先问一次宿主"这台机器配了上传服务器吗、这份文档要不要自动传"，
    // 再拿它决定框里那一行长什么样（`ImageRequest` 那两条注释）。读失败
    // **不让插图这条整体挂掉**：当成没配服务器——最坏是勾选框不出现，
    // 而插图本身照旧能用（这条路上唯一"绝不能失败"的事是插图）。
    let ableAbovePass = false;
    let meetingSelfActionAbovePass = false;
    try {
      const s = await api.image.uploadGet(docId);
      ableAbovePass = s.canUpload;
      meetingSelfActionAbovePass = s.willAutoUpload;
    } catch (e) {
      console.warn("[nota] 读上传设置失败，按没配服务器处理：", e);
    }
    const a = await askImage({ documentSaved: docSaved, ableAbovePass, meetingSelfActionAbovePass });
    if (!a) return; // 用户取消了，不是错误
    await dropOneImage(a.source as ImageSourceArg, a.alt, a.abovePass);
  }, [askImage, docId, docSaved, dropOneImage]);

  return { insertImageLike, dropOneImage };
}
