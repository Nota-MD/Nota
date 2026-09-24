/**
 * "把一条菜单命令送进编辑器"这一段（从 `App.tsx` 搬出来的，2026-09-24）。
 *
 * # 为什么这三条要待在一起
 *
 * 它们回答的是同一个问题：**一条菜单命令（一句用户看得懂的话）怎么变成编辑器
 * 上的一次动作**。`run` 直接转交；「插入链接」「插入图像」多一步——先问出参数，
 * 再把命令和参数一起交过去。
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

import type { EditorPaneHandle } from "@/ui/EditorPane";
import type { Dialogs } from "@/ui/useDialogs";
import type { CommandPayload, EditorCommand } from "@/editor/create";
import type { Toast } from "@/ui/Toasts";

export interface 命令接线 {
  /** 编辑区句柄。⚠️ 传 **ref 本体**（身份稳定），不是 `ref.current`。 */
  editorRef: RefObject<EditorPaneHandle | null>;
  /** ⚠️ 类型**从 `useDialogs` 借**，不在这里另写一份：另写的那份迟早少一个字段。 */
  askPrompt: Dialogs["askPrompt"];
  toast: (message: string, level?: Toast["level"]) => void;
}

export interface 命令出口 {
  /** 转交一条编辑命令，做不到时如实提示。 */
  run: (c: EditorCommand, payload?: CommandPayload) => void;
  /** 「超链接」：先问地址，再连地址一起交给编辑器。 */
  插入链接: () => Promise<void>;
  /** 「图像」：两个字段（地址、替代文字）。 */
  插入图像: () => Promise<void>;
}

export function useEditorCommands(w: 命令接线): 命令出口 {
  const { editorRef, askPrompt, toast } = w;

  const run = useCallback(
    (c: EditorCommand, payload?: CommandPayload) => {
      if (!editorRef.current?.runCommand(c, payload)) {
        toast("当前编辑模式下还没有这个操作", "info");
      }
    },
    [editorRef, toast],
  );

  /**
   * ⚠️ 已经是一条链接时再点一次，它的语义是**去掉链接**（命令本身是 toggle）。
   * Typora 那一下是"弹框改地址"，我们这一版不是——如实记在 `docs/07` 里，
   * 别以为这是没做完。
   */
  const 插入链接 = useCallback(async () => {
    const r = await askPrompt({
      title: "超链接",
      label: "链接地址",
      placeholder: "https://example.com，或 #本页锚点",
    });
    if (!r) return; // 用户取消了，不是错误
    run("link", { href: r.value });
  }, [askPrompt, run]);

  const 插入图像 = useCallback(async () => {
    const r = await askPrompt({
      title: "图像",
      label: "图片地址",
      placeholder: "相对文档目录的路径，或 https:// 开头的地址",
      secondLabel: "替代文字（可留空）",
      secondPlaceholder: "图片加载不出来时会显示这段文字",
    });
    if (!r) return;
    run("image", { src: r.value, alt: r.second });
  }, [askPrompt, run]);

  return { run, 插入链接, 插入图像 };
}
