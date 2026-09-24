/**
 * 导出与打印的接线（从 `App.tsx` 搬出来的，2026-09-24）。
 *
 * 搬出来的理由和 `useSlidev.ts` 一样：这是一块**自己能讲完**的编排——
 * "取正文 → 取主题 → 生成 HTML → 问用户存哪/交给系统打开 → 说一句结果"，
 * 跟外壳骨架没关系。留在 `App.tsx` 里只会把"取数据、派事件、拼布局"
 * 这三件事淹掉，而那个文件本来就贴着行数上限。
 *
 * # ⚠️ 两个"从哪拿"的判断，错了都不会报错
 *
 * 1. **正文必须从编辑器拿，不是从 `doc.text` 拿**。后者是 300ms 去抖之后的
 *    镜像（backlog 第 32 项那笔账），用户刚敲的那个字会不在里面。屏幕上和
 *    导出里不一致，是最容易被当成"导出坏了"的那种 bug。
 * 2. **主题取不到不算失败**。`settings` 里记着一个 id、而那份 `.css` 被删了，
 *    是很平常的事（换机器、清理磁盘）——为它中断一次导出不值。退回"不带主题"
 *    继续导，只在控制台留一句。
 *
 * # ⚠️ 打印为什么不是"在应用里打印"
 *
 * 写成一份 HTML 交给系统默认程序，用户在那边按 `Ctrl+P`。**如实把两步都说给
 * 用户听**——假装在应用里完成才是撒谎。理由（WebKitGTK 的 `window.print()`
 * 在容器里点不出来、而且它不是同步返回）写在 `commands/export.rs` 文件头。
 */

import { useCallback } from "react";
import { save as saveDialog } from "@tauri-apps/plugin-dialog";

import { api, type DocId, type Document } from "@/bridge/ipc";
import { 导出HTML, 默认导出名 } from "@/editor/export";
import type { Toast } from "@/ui/Toasts";

export interface 导出接线 {
  /** 当前活动文档的 id。 */
  activeId: DocId | null;
  /** 全部文档。用来把 id 换成对象（拿标题与路径）。 */
  docs: Document[];
  /** 编辑器句柄里那个"取当前 markdown"的方法。取不到文档时返回 `undefined`。 */
  getMarkdown: () => string | undefined;
  /** 文档主题 id（空串 = 无主题）。 */
  themeId: string;
  /** 严格模式。**解析口径必须和屏幕上一致**，否则同一段 `#标签` 两边不一样。 */
  strict: boolean;
  toast: (message: string, level?: Toast["level"]) => void;
}

export interface 导出出口 {
  /** 导出 HTML。`styled` 决定含不含样式。 */
  导出: (styled: boolean) => Promise<void>;
  /** 打印（= 导出含样式的那份 + 交给系统默认程序）。 */
  打印: () => Promise<void>;
}

export function useExport(w: 导出接线): 导出出口 {
  const { activeId, docs, getMarkdown, themeId, strict, toast } = w;

  /** 主题 CSS 的**原始**文本。限域在 `editor/export.ts` 里做，那边统一。 */
  const 取主题CSS = useCallback(async (): Promise<string | undefined> => {
    if (!themeId) return undefined;
    try {
      return await api.theme.css(themeId);
    } catch (e) {
      console.warn("[nota] 导出时取文档主题失败，这一份不带主题：", e);
      return undefined;
    }
  }, [themeId]);

  /**
   * 导出 HTML。两档只差一个布尔，**故意合成一条路**——分成两个函数的话，
   * "另一种也顺手改一下"迟早会漏一次。
   */
  const 导出 = useCallback(
    async (styled: boolean) => {
      const doc = docs.find((d) => d.id === activeId);
      const text = getMarkdown();
      if (!doc || text === undefined) return;

      try {
        const picked = await saveDialog({
          title: styled ? "导出 HTML（含样式）" : "导出 HTML（不含样式）",
          // ⚠️ 默认名**保留原文件名、只换后缀**：用户认得自己那份文档叫什么。
          defaultPath: 默认导出名(doc.title, "html"),
          filters: [{ name: "HTML", extensions: ["html", "htm"] }],
        });
        if (!picked) return; // 用户取消了，不是错误

        const html = await 导出HTML(text, {
          strict,
          styled,
          themeCss: styled ? await 取主题CSS() : undefined,
          title: doc.title,
        });
        const written = await api.export.write(picked, html);
        // 报**真实写出去的路径**：对话框可能改了它（补后缀、换目录）。
        toast(`已导出到 ${written}`, "success");
      } catch (e) {
        toast(`导出失败：${e}`, "error");
      }
    },
    [activeId, docs, getMarkdown, strict, 取主题CSS, toast],
  );

  const 打印 = useCallback(async () => {
    const doc = docs.find((d) => d.id === activeId);
    const text = getMarkdown();
    if (!doc || text === undefined) return;

    try {
      const html = await 导出HTML(text, {
        strict,
        styled: true,
        themeCss: await 取主题CSS(),
        title: doc.title,
      });
      // ⚠️ 落点由后端按 `doc.path` 的**父目录**决定，不是随便找个临时目录：
      // 正文里 `![](./img.png)` 是相对路径，换个目录图片就全没了。
      const path = await api.export.print(doc.path, doc.title, html);
      toast(`已用系统默认程序打开，在那边按 Ctrl+P 打印（文件在 ${path}）`, "info");
    } catch (e) {
      toast(`打印失败：${e}`, "error");
    }
  }, [activeId, docs, getMarkdown, strict, 取主题CSS, toast]);

  return { 导出, 打印 };
}
