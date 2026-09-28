/**
 * 剪贴板四件（剪切 / 复制 / 粘贴 / 复制为 Markdown）的**菜单实现**（2026-09-25）。
 *
 * # 为什么单独一份，而不是加到 `EditorCommand` 里
 *
 * 「剪切」「复制」「复制为 Markdown」**不改文档**——它们读一段内容、写进系统
 * 剪贴板，就完了。`EditorCommand` 那张白名单的判据是"编辑动作"（作用在文档上、
 * 进撤销栈，见 `editor/create.ts` 那段），把只读的东西混进去，那张表的含义就散了。
 *
 * 「粘贴」确实改文档，但它的一半活（读系统剪贴板）在编辑器外面，编辑器
 * 无从下手。所以这里的分工是：**本文件读写出编辑区的部分**（拿选区、
 * 写系统剪贴板、读系统剪贴板），**真正落到文档上的那一下**转交给
 * `EditorCommand` 里的 `insertText`（那条命令两种模式都实现得了）。
 *
 * # ⚠️ 「复制为 Markdown」和前三条不是一回事
 *
 * 它拿的是**整篇文档的 Markdown 源码**（`getMarkdown()`），不是选区，也不进
 * 系统剪贴板的富文本那一路——用户要的就是可以贴进 issue / 邮件 / 代码仓库的
 * 那串纯文本。所以它**不看选区、不转 `insertText`**，是四条里最独立的一条；
 * 放在这里只是因为它的动作**恰好也是"往系统剪贴板写一串字"**（2026-09-25 从
 * `App.tsx` 搬来——那边当时顶着行数上限）。
 *
 * # ⚠️ 这三条原来是不接的（灰的），为什么现在必须接
 *
 * Ctrl+X / Ctrl+C / Ctrl+V 由 WebView 自己处理，所以**快捷键一直是好的**；
 * 而菜单项因为查不到处理器，被判成"没实现"、画成灰的。结果菜单上同时出现
 * 两句互相拆台的话："这一项是灰的（按不了）"和"它的快捷键写着 Ctrl+C"。
 * 用户没法判断哪个算数。两条出路里我们选了**让它真的能用**（另一条是把
 * 快捷键一起拿掉，那等于把已经好用的功能藏起来）：
 *
 * | 动作 | 点击菜单时怎么做到 |
 * |---|---|
 * | 复制 | 问编辑器要选区 → 写进系统剪贴板 |
 * | 剪切 | 同上，**写成功之后**再让编辑器删掉那段 |
 * | 粘贴 | 读系统剪贴板 → `insertText` |
 *
 * # ⚠️ 读系统剪贴板这条不一定被允许
 *
 * WebKit 把 `navigator.clipboard.readText()` 挡在权限后面，而宿主（Tauri）
 * 没有为它开权限，所以**它可能被拒**。被拒时给的话是"请按 Ctrl+V"——
 * 那条路走的是 WebView 自己的粘贴通路，不需要任何权限，**永远可用**。
 * 这不是"失败了"，是"这条路走不通、旁边那条一直开着"。
 */

import { useCallback } from "react";
import type { RefObject } from "react";

import type { EditorPaneHandle } from "@/ui/EditorPane";
import type { CommandPayload, EditorCommand, 选区内容 } from "@/editor/create";
import { writeClipboard } from "@/editor/code-block";
import { useT } from "@/i18n";
import type { Toast } from "@/ui/Toasts";

export interface 剪贴板接线 {
  /** 编辑区句柄。⚠️ 传 **ref 本体**（身份稳定），不是 `ref.current`。 */
  editorRef: RefObject<EditorPaneHandle | null>;
  /** 把文本落到文档上（`ui/useEditorCommands.ts` 的 `run`）。 */
  run: (c: EditorCommand, payload?: CommandPayload) => void;
  toast: (message: string, level?: Toast["level"]) => void;
}

export interface 剪贴板出口 {
  /** 「复制」。返回**有没有真的复制到**——「剪切」据此决定删不删。 */
  复制: () => Promise<boolean>;
  /** 「剪切」。 */
  剪切: () => Promise<void>;
  /** 「粘贴」。 */
  粘贴: () => Promise<void>;
  /** 「复制为 Markdown」：整篇源码进剪贴板。见文件头最后那一节。 */
  复制为Markdown: () => Promise<void>;
}

/**
 * 把一份选区写进系统剪贴板。
 *
 * ① 有 HTML 时优先 `clipboard.write`：一次带上两份数据，粘到别的富文本编辑器
 *    里还留着格式（表格、加粗、列表），粘到纯文本的地方自动降级成 `text/plain`；
 * ② 拿不到 HTML（源码模式）或 `write` 不可用/被拒时，走 `writeClipboard`
 *    那条纯文本路（`editor/code-block.ts` 里那份，与代码块的复制按钮同一份实现）。
 */
async function 写剪贴板(内容: 选区内容): Promise<boolean> {
  if (内容.html && typeof ClipboardItem !== "undefined" && navigator.clipboard?.write) {
    try {
      await navigator.clipboard.write([
        new ClipboardItem({
          "text/plain": new Blob([内容.text], { type: "text/plain" }),
          "text/html": new Blob([内容.html], { type: "text/html" }),
        }),
      ]);
      return true;
    } catch {
      // 落到下面那条纯文本路。⚠️ **不往上抛**：富文本那一半失败不该让
      // "复制"整个失败——用户要的首先是那几个字。
    }
  }
  return writeClipboard(内容.text);
}

export function useClipboard(w: 剪贴板接线): 剪贴板出口 {
  // ⚠️ **这一行不只是取值**：它订阅了语言（宿主报来语言之后这一块要重画，见
  // `i18n/index.ts::useT`）。局部这个名字盖住模块级的 `t`，下面全都用它。
  const t = useT();
  const { editorRef, run, toast } = w;

  const 复制 = useCallback(async () => {
    const 内容 = editorRef.current?.选区() ?? null;
    if (!内容) {
      // ⚠️ 空选区**不是错误**，是"还没选中东西"。给 `info` 而不是 `error`：
      // 用户只是少做了一步，没做错什么。
      toast(t("Select some text first."), "info");
      return false;
    }
    if (await 写剪贴板(内容)) {
      // 和下面「复制为 Markdown」一样给一句回执：剪贴板是**看不见**的地方，
      // 不给回执的话用户只能靠"粘一下试试"来确认。
      toast(t("Copied to clipboard"), "success");
      return true;
    }
    toast(t("Could not copy: the system refused to write to the clipboard."), "error");
    return false;
  }, [editorRef, toast]);

  const 剪切 = useCallback(async () => {
    // ⚠️ **顺序不能反**：先复制、成功了再删。反过来（先删后复制）一旦写剪贴板
    // 失败，用户选中的那段字就**没了**，而且撤销栈里也拿不回来原文之外的
    // 任何东西——那是"剪切"最不该有的后果。
    if (!(await 复制())) return;
    run("insertText", { text: "" }); // 空串 = 删掉选区（见 `CommandPayload.text`）
  }, [复制, run]);

  const 粘贴 = useCallback(async () => {
    // ⚠️ `navigator.clipboard` 本身可能不存在（不是安全上下文时整个对象都没有），
    // 所以连属性访问都要包在 try 里，不能写成 `navigator.clipboard?.readText`
    // 之后再单独 catch 一次——那样漏掉的就是"对象不存在"这一种。
    let text: string;
    try {
      text = await navigator.clipboard.readText();
    } catch {
      toast(t("The system does not allow reading the clipboard from the menu — press Ctrl+V to paste."), "warn");
      return;
    }
    if (!text) {
      toast(t("There is no text in the clipboard."), "info");
      return;
    }
    run("insertText", { text });
  }, [run, toast]);

  /**
   * 「复制为 Markdown」。
   *
   * ⚠️ `getMarkdown()` 返回 `undefined` 表示**现在没有编辑区**（首页、还没打开
   * 文档）。那不是失败，所以**静默返回**——这时候菜单项本身也是灰的，正常路径
   * 上根本点不到这里；真点到了，弹一句"没有文档"也只是在说用户已经看见的事。
   */
  const 复制为Markdown = useCallback(async () => {
    const text = editorRef.current?.getMarkdown();
    if (text === undefined) return;
    try {
      await navigator.clipboard.writeText(text);
      toast(t("Copied the Markdown source."), "success");
    } catch (e) {
      toast(t("Could not copy: {0}", String(e)), "error");
    }
  }, [editorRef, toast]);

  return { 复制, 剪切, 粘贴, 复制为Markdown };
}
