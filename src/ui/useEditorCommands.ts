/**
 * "把一条菜单命令送进编辑器"这一段（从 `App.tsx` 搬出来的，2026-09-24）。
 *
 * # 为什么这几条要待在一起
 *
 * 它们回答的是同一个问题：**一条菜单命令（一句用户看得懂的话）怎么变成编辑器
 * 上的一次动作**。`run` 直接转交；「插入链接」多一步——先问出**名称与地址**，
 * 再把命令和参数一起交过去。
 *
 * ⚠️ **「插入链接」那颗按钮和别的不一样：它走的是"先问再落笔"**（2026-10-07，
 * `docs/07` 第 96 ＋ 102 项）。命令表里那个 `link` 是上游的 toggle 语义
 * （只挂标记、**一个字符都不插**），所以 `run` 见着 `link` 会**改道**到
 * `插入链接`（格式化工具栏那颗 🔗 走的正是这条 `cmd` 路）。⛔ 别把那一条删掉
 * 当成"顺手清理"：它一没，工具栏那颗按钮就又变成"按下去什么都不出现"。
 *
 * ⚠️ 「插入图像」**曾经**也在这里，2026-09-26 搬去了 `ui/useImageInsert.ts`：
 * 它不只是"问一句话再转交"——它还要把图片交给宿主落盘（一回 IPC）、
 * 挂上粘贴与拖入两条全局监听，而且它先是图片再是命令。留在这里的话，
 * 这个文件就得同时知道剪贴板、Tauri 的窗口事件和文件对话框。
 *
 * ⚠️ 这一段和"插入菜单"那条链路正好是**两个方向**：`ui/commands.ts` 定义
 * 菜单长什么样，`editor/insert.ts` 定义插进去的是什么，本文件在中间跑腿。
 * 把它留在外壳文件里，读的人会以为菜单项和编辑器还有别的耦合。
 *
 * # ⚠️ 返回值那句话不能省
 *
 * `runCommand` 的返回值与"改了没有"无关：`false` 说的是**这条命令在当前的
 * 编辑模式下没有对应的实现**（源码模式下表格那十条、以及没填地址的链接/图片）。
 * 转交时不看返回值的话，用户看到的是"点了没反应"——而原因（这个模式做不到）
 * 是看不出来的。
 */

import { useCallback, type RefObject } from "react";

import { useT } from "@/i18n";
import type { EditorPaneHandle } from "@/ui/EditorPane";
import type { Dialogs } from "@/ui/useDialogs";
import { cursorPlaceThatItemLink } from "@/ui/useLinkClick";
import type { CommandPayload, EditorCommand } from "@/editor/create";
import type { Toast } from "@/ui/Toasts";

export interface commandWiring {
  /** 编辑区句柄。⚠️ 传 **ref 本体**（身份稳定），不是 `ref.current`。 */
  editorRef: RefObject<EditorPaneHandle | null>;
  /** ⚠️ 类型**从 `useDialogs` 借**，不在这里另写一份：另写的那份迟早少一个字段。 */
  askLink: Dialogs["askLink"];
  toast: (message: string, level?: Toast["level"]) => void;
}

export interface commandApi {
  /** 转交一条编辑命令，做不到时如实提示。 */
  run: (c: EditorCommand, payload?: CommandPayload) => void;
  /** 「超链接」：先问地址，再连地址一起交给编辑器。 */
  insertLink: () => Promise<void>;
}

export function useEditorCommands(w: commandWiring): commandApi {
  // ⚠️ **这一行不只是取值**：它订阅了语言（宿主报来语言之后这一块要重画，见
  // `i18n/index.ts::useT`）。局部这个名字盖住模块级的 `t`，下面全都用它。
  const t = useT();
  const { editorRef, askLink, toast } = w;

  /** 把一条命令交给编辑器；这一侧没有实现时如实提示（两条路共用这一份）。 */
  const handoffCommand = useCallback(
    (c: EditorCommand, payload?: CommandPayload) => {
      if (!editorRef.current?.runCommand(c, payload)) {
        toast(t("This action is not available in the current editing mode."), "info");
      }
    },
    [editorRef, toast],
  );

  /**
   * 「插入链接」：先开那个框（两个字段），再按答案落笔。
   *
   * 三件事各有一处判据：
   * - **预填**：光标处已经是一条链接时填它的现值（`editing` 也跟着为真，框里
   *   于是多一颗「去掉链接」）；否则拿**当前选中的文字**当显示名称
   *   （"选中一段字再按 Ctrl+K"是这件事最常见的起手式）；
   * - **答案三档**：取消一个字都不动、`remove` 摘标记留文字、`set` 写进去；
   * - **落笔**交给编辑器（`linkSet` / `linkRemove`），判据全在 `editor/link-edit.ts`
   *   ——两种模式各有一份实现，但"哪段是这条链接、地址危险了怎么办"是同一份。
   */
  const insertLink = useCallback(async () => {
    const current2 = cursorPlaceThatItemLink();
    const answer = await askLink({
      label: current2?.label ?? editorRef.current?.selection()?.text ?? "",
      href: current2?.href ?? "",
      editing: current2 !== null,
    });
    if (!answer) return; // 用户取消了，不是错误
    if (answer.kind === "remove") handoffCommand("linkRemove");
    else handoffCommand("linkSet", { href: answer.href, label: answer.label });
  }, [askLink, handoffCommand, editorRef]);

  const run = useCallback(
    (c: EditorCommand, payload?: CommandPayload) => {
      // ⚠️ 工具栏那颗 🔗 走的是 `cmd` 这条路（`FormatBar` 的 `按钮.cmd`），而它
      // 与菜单里那条「插入链接」是同一件事——所以在这里改道到"先问再落笔"。
      // ⛔ 不改道的后果：空 href 的 toggle 会给选中的文字挂上一条点不动的链接。
      if (c === "link") {
        void insertLink();
        return;
      }
      handoffCommand(c, payload);
    },
    [handoffCommand, insertLink],
  );

  return { run, insertLink };
}
