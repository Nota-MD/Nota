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
 * 塞在一起的话，改一次界面主题会一并重取一次文档主题的 CSS。
 *
 * ⚠️ **只碰 `.editor-pane` 底下的东西**，外壳一点都不动。保证它的不是
 * 这里的代码，是 `styles/doc-theme.ts` 里那道机械限域——改那个文件
 * 把主题变量提升到全局，正是上一版让整个应用跟着变色的原因
 *（用户 2026-09-23 点名的：「这是文档风格，不是界面风格」）。
 */

import { useCallback, useEffect } from "react";

import { api, type DocThemeInfo, type Settings } from "@/bridge/ipc";
import { useT } from "@/i18n";
import { characterBodyCanUse, canSelectCharacterBody } from "@/ui/font-check";
import type { Dialogs } from "@/ui/useDialogs";
import { applyDocTheme } from "@/styles/doc-theme";
import type { Toast } from "@/ui/Toasts";
import { useUiMode } from "@/ui/useUiMode";
import { debugError, debugEvent } from "@/ui/debug-log";

/**
 * 这一帧**该用**的文档主题 id，以及**该写**到哪个槽。
 *
 * # 为什么"写"要跟着"用"走
 *
 * `appearance.dark_theme_separate` 打开之后，深色下生效的是
 * `appearance.dark_document_theme` 那一套、而不是顶层的 `document_theme`。
 * 于是「主题」菜单那一个入口就必须**改你正在看的这一套**：否则用户在深色下
 * 从菜单选一套，写进去的是浅色那份，屏幕上一个像素都不动，而提示还说
 * 「文档主题已换成 X」——一个当场就能看见的假话。
 *
 * ⚠️ 所以判据是"现在生效的是哪一份"，不是"哪一份更常见"。两份槽的**形状也不同**
 * （浅色那份在顶层 `document_theme`，深色那份在 `appearance` 表里），
 * 这就是这里连同 `写` 一起给出去的原因——调用方不该知道这个形状差异。
 *
 * ⚠️ `useUiMode` 是**订阅过系统明暗**的（`ui_mode = "auto"` 时用户在系统里
 * 切了深浅，这里要跟着换槽），别改成直接读 `settings.ui_mode`。
 */
export interface themeSlot {
  /** 现在生效的那套。**空串 = 无主题**（不是 `null`，两处口径要对齐）。 */
  id: string;
  /** 把主题换成 `新id`——**写进当前生效的那个槽**。 */
  write: (newValueid: string) => void;
}

export function useDocThemeSlot(
  settings: Settings | null,
  updateSettings: (patch: Partial<Settings>) => Promise<void>,
): themeSlot {
  const mode = useUiMode(settings?.ui_mode ?? "auto");
  const darkThatValueSetAtGenerateEffect = darkDedicatedUseAtGenerateEffect(settings, mode);

  const id = generateEffectOfDocumentTheme(settings, mode);
  const a = settings?.appearance ?? null;

  const write = useCallback(
    (newValueid: string) => {
      if (darkThatValueSetAtGenerateEffect && a) {
        void updateSettings({ appearance: { ...a, dark_document_theme: newValueid } });
      } else {
        void updateSettings({ document_theme: newValueid });
      }
    },
    [darkThatValueSetAtGenerateEffect, a, updateSettings],
  );

  return { id, write };
}

/**
 * 深色专用的那一套**此刻在不在生效**。三条同时成立才算：开关开着、指定了具体
 * 一套、而且此刻确实是深色（空串那一档界面上写着「跟随浅色主题」，等于没指定）。
 *
 * ⚠️ 抽成纯函数是给**读的一方**用的：偏好设置 →「文档主题」那一页要显示
 * "现在生效的是哪一套"，它不该为了这个走一遍 hook（更不该自己再写一遍这条判据——
 * 两处一旦分叉，那一页会用很确定的口气报一个错的主题名）。
 */
export function darkDedicatedUseAtGenerateEffect(settings: Settings | null, mode: "light" | "dark"): boolean {
  const a = settings?.appearance;
  return !!a && a.dark_theme_separate && a.dark_document_theme !== "" && mode === "dark";
}

/**
 * 此刻**生效**的文档主题 id。与 `深色专用在生效` 是同一套判据的正面。
 *
 * ⚠️ **不做隐式深色配对**。用户选了 `adwaita`，即使界面是深色，文档也使用
 * `adwaita`；要深色文档必须显式选择 `adwaita-dark`，或打开「深色模式下单独
 * 用一套」并指定那一套。主题 id 原样生效，避免“选浅色却得到深色”的假状态。
 */
export function generateEffectOfDocumentTheme(settings: Settings | null, _Mode: "light" | "dark"): string {
  if (darkDedicatedUseAtGenerateEffect(settings, _Mode)) return settings?.appearance.dark_document_theme ?? "";
  return settings?.document_theme ?? "";
}

export interface themeWiring {
  /** 设置里的文档主题 id。**空串 = 无主题**（不是 `null`，两处口径要对齐）。 */
  themeId: string;
  /** 选主题时写哪一份——由 `useDocThemeSlot` 给出，见那边文件头那段。 */
  writeTheme: (id: string) => void;
  /**
   * 主题清单。
   *
   * ⚠️ **它进 effect 依赖是有意的**：清单重扫之后（第 41 项，2026-10-04 接上）
   * 要能重取一次 CSS，否则"用户在主题文件夹里改了同名文件、回来一看没变"。
   * 重扫这个动作本身见下面 `重扫` 那条。
   */
  themes: DocThemeInfo[];
  /**
   * 重新扫一遍主题文件夹（第 41 项）：「打开主题文件夹…」**成功回来之后**调。
   * 用户多半刚往里丢了一份新 `.css`，而菜单吃的还是启动时那份旧清单——
   * 不重扫的话，新主题要重启应用才出现。
   * ⚠️ **不做轮询**——主题是"用户偶尔动一次"的东西（`docs/07` 第 41 项的口径）。
   */
  heavyScan: () => void;
  toast: (message: string, level?: Toast["level"]) => void;
  /**
   * 问一句（2026-10-17）：**首选字体没装时弹一条**。
   * ⚠️ 借确认框那条"只报信"的用法（`hideCancel`）：这不是选择，是告知。
   */
  askConfirm: Dialogs["askConfirm"];
}

export interface themeApi {
  /** 换一套文档主题。**存进设置的是 id，提示里用的是显示名**。 */
  pickTheme: (id: string) => void;
  /** 打开（必要时先建出来的）用户主题目录。 */
  openThemesDir: () => Promise<void>;
}

/**
 * 已经提示过的"缺字体"（`主题 id → 字体名`）。
 * ⚠️ 挂在**模块级**：用户来回切主题时不该每分钟被同一句话说一次；而换一支字体
 * （主题更新了）仍然要重新提示，所以键是 `id|字体` 而不是只有 id。
 */
const sayPassOfMissingCharacterBody = new Set<string>();

export function useDocTheme(w: themeWiring): themeApi {
  // ⚠️ **这一行不只是取值**：它订阅了语言（宿主报来语言之后这一块要重画，见
  // `i18n/index.ts::useT`）。局部这个名字盖住模块级的 `t`，下面全都用它。
  const t = useT();
  const { themeId, writeTheme, themes, heavyScan, toast, askConfirm } = w;

  useEffect(() => {
    let alive = true;

    (async () => {
      try {
        // 空串 = 无主题，直接把 style 摘掉，编辑区回中性样式。
        const css = themeId ? await api.theme.css(themeId) : null;
        if (alive) {
          applyDocTheme(css);
          debugEvent("theme", "document theme applied", {
            theme: themeId || "none",
            css_bytes: css?.length ?? 0,
          });
        }

        // ── 首选字体在不在（2026-10-17，用户点名要的那句提示）────────────
        // ⚠️ 查的是**主题自己写的** `--font-doc` 第一项，不是生效的计算值：
        // 计算值里已经是"候选, 兜底…"整串，查不出"谁是首选"。
        // ⚠️ 判的是"**这一族**里有没有一支能用"，不是只看第一支：字体栈本来就是
        // "首选不在就用下一个"的语义（2026-10-17：装了 Zpix 的机器不该被
        // 因为没装文泉驿点阵宋而报警）。一支都没有才叫"退回系统字体"。
        const candidate = css ? canSelectCharacterBody(css) : [];
        const first = candidate[0] ?? null;
        if (alive && first && !candidate.some(characterBodyCanUse)) {
          const key = `${themeId}|${first}`;
          if (!sayPassOfMissingCharacterBody.has(key)) {
            sayPassOfMissingCharacterBody.add(key);
            const name3 = themes.find((x) => x.id === themeId)?.name ?? themeId;
            void askConfirm({
              title: t("Missing font"),
              message: t(
                "The “{0}” theme prefers “{1}”, which is not installed on this machine. The editor is using a fallback font.",
                name3,
                first,
              ),
              confirmLabel: t("OK"),
              hideCancel: true,
            });
          }
        }
      } catch (e) {
        // ⚠️ **安静地退回无主题，不弹错**：settings 里记着一个 id、而那份
        // `.css` 被删了，是很平常的事（换机器、清理磁盘），不是需要打断
        // 用户的错误。用户看到的是"主题回到了中性样式"，那正是事实。
        if (alive) {
          debugError("theme", "document theme failed", e, { theme: themeId || "none" });
        }
      }
    })();

    // ⚠️ `alive` 标志必须有：快速连点两套主题时，先发出去的那次 IPC 可能
    // 后回来，不挡住就会用**旧的那份** CSS 覆盖新的——而且看起来像"点错了"。
    return () => {
      alive = false;
    };
  }, [themeId, themes, askConfirm, t]);

  const pickTheme = useCallback(
    (id: string) => {
      // ⚠️ 走的**不是** `updateSettings({ document_theme })`：深色专用那套在生效时
      // 要写 `appearance.dark_document_theme`。选哪一份由 `useDocThemeSlot` 判，
      // 理由（以及"写错槽会当场撒什么谎"）写在那边。
      writeTheme(id);
      // ⚠️ 提示里用**显示名**（中文），存进设置的是 id。两者别混——
      // 混了就变成"提示里说换成「极简」，设置里存着一个 `minimal`"。
      const name = id ? (themes.find((x) => x.id === id)?.name ?? id) : "";
      toast(name ? t("Document theme switched to “{0}”", name) : t("Document theme turned off."), "success");
    },
    [writeTheme, toast, themes],
  );

  const openThemesDir = useCallback(async () => {
    try {
      // ⚠️ 路径与"打开"都在后端那一条命令里：它会先把目录**建出来**再打开
      // ——首次使用时它多半还不存在，而打开一个不存在的路径会被文件管理器
      // 直接拒掉。前端既不该拼这个路径（`paths.rs` 的文件头），也不该自己
      // 拿路径去调 plugin-opener（Tauri 的 ACL，见 BUG-27）。
      await api.theme.openDir();
      // ⚠️ 第 41 项：打开**成功**才重扫（失败时多半目录都没开成，白拉一把）。
      // 只要把新清单拉回来就行——`themes` 进了上面那个 effect 的依赖，
      // CSS 那一步会自己跟着重取，这里不用管。
      heavyScan();
    } catch (e) {
      toast(t("Could not open the themes folder: {0}", String(e)), "error");
    }
  }, [toast, heavyScan]);

  return { pickTheme, openThemesDir };
}
