/**
 * 文档主题的三件事：**应用**、**切换**、**打开主题文件夹**（从 `App.tsx`
 * 搬出来的，2026-09-24）。
 *
 * ⚠️ 搬出来的直接理由是行数，但这里确实有一份完整的理由可写——这三件事
 * 共用同一个前提：**文档主题只作用于编辑区**。把它摆在一起，那条约束就有
 * 一个看得见的落点；散在外壳文件里时，它只存在于 `doc-theme.ts` 的注释里。
 *
 * # 这条通道为什么和 `applyTheme` 分家
 *
 * 界面主题是**纯写属性**的（`applyTheme` 同步改 `data-*`），文档主题要
 * **取回来 + 限域**才能注入，是异步的。节奏不一样就不塞进同一个 effect——
 * 塞在一起的话，改一次界面主题会顺手重取一次文档主题的 CSS。
 *
 * ⚠️ **只碰 `.editor-pane` 底下的东西**，一根头发都动不了外壳。保证它的不是
 * 这里的代码，是 `styles/doc-theme.ts` 里那道机械限域——所以别去改那个文件
 * 让自己"顺手"把主题变量提升到全局，那正是上一版让整个应用跟着变色的原因
 *（用户 2026-09-23 点名的：「这是文档风格，不是界面风格」）。
 */

import { useCallback, useEffect } from "react";
import { openPath as openWithSystem } from "@tauri-apps/plugin-opener";

import { api, type DocThemeInfo, type Settings } from "@/bridge/ipc";
import { applyDocTheme } from "@/styles/doc-theme";
import type { Toast } from "@/ui/Toasts";

export interface 主题接线 {
  /** 设置里的文档主题 id。**空串 = 无主题**（不是 `null`，两处口径要对齐）。 */
  themeId: string;
  /**
   * 主题清单。
   *
   * ⚠️ **它进 effect 依赖是有意的**：清单重扫之后（第 41 项）要能重取一次 CSS，
   * 否则"用户在主题文件夹里改了同名文件、回来一看没变"。今天清单只在启动时拉，
   * 所以这条依赖暂时不会响——留着它是为了让那个动作将来接上时不必回来改这里。
   */
  themes: DocThemeInfo[];
  updateSettings: (patch: Partial<Settings>) => Promise<void>;
  toast: (message: string, level?: Toast["level"]) => void;
}

export interface 主题出口 {
  /** 换一套文档主题。**存进设置的是 id，提示里用的是显示名**。 */
  pickTheme: (id: string) => void;
  /** 打开（必要时先建出来的）用户主题目录。 */
  openThemesDir: () => Promise<void>;
}

export function useDocTheme(w: 主题接线): 主题出口 {
  const { themeId, themes, updateSettings, toast } = w;

  useEffect(() => {
    let alive = true;

    (async () => {
      try {
        // 空串 = 无主题，直接把 style 摘掉，编辑区回中性样式。
        const css = themeId ? await api.theme.css(themeId) : null;
        if (alive) applyDocTheme(css);
      } catch (e) {
        // ⚠️ **安静地退回无主题，不弹错**：settings 里记着一个 id、而那份
        // `.css` 被删了，是很平常的事（换机器、清理磁盘），不是需要打断
        // 用户的错误。用户看到的是"主题回到了中性样式"，那正是事实。
        if (alive) console.warn("[nota] 应用文档主题失败：", e);
      }
    })();

    // ⚠️ `alive` 标志必须有：快速连点两套主题时，先发出去的那次 IPC 可能
    // 后回来，不挡住就会用**旧的那份** CSS 覆盖新的——而且看起来像"点错了"。
    return () => {
      alive = false;
    };
  }, [themeId, themes]);

  const pickTheme = useCallback(
    (id: string) => {
      void updateSettings({ document_theme: id });
      // ⚠️ 提示里用**显示名**（中文），存进设置的是 id。两者别混——
      // 混了就变成"提示里说换成「素纸」，设置里存着一个 `paper`"。
      const name = id ? (themes.find((t) => t.id === id)?.name ?? id) : "";
      toast(name ? `文档主题已换成「${name}」` : "文档主题已关闭", "success");
    },
    [updateSettings, toast, themes],
  );

  const openThemesDir = useCallback(async () => {
    try {
      // ⚠️ 打开的是 **`api.theme.dir()` 的返回值**，不是自己拼的路径：
      // 后端会把目录**建出来**再返回——首次使用时它多半还不存在，
      // 而打开一个不存在的路径会被文件管理器直接拒掉。
      await openWithSystem(await api.theme.dir());
    } catch (e) {
      toast(`打开主题文件夹失败：${e}`, "error");
    }
  }, [toast]);

  return { pickTheme, openThemesDir };
}
