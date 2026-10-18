/**
 * 用户导入的**界面风格**：清单、注入、打开目录。
 *
 * # 它和 `useAppearance` / `useDocTheme` 的分工
 *
 * - `useAppearance`：把两条轴（`ui_style` / `ui_mode`）**同步**写进 `<html>`。
 *   它管的是内置档——那些 CSS 已经打包在样式表里了，写个属性就生效。
 * - **本文件**：管**用户导入**的那一半。清单要问后端、CSS 要取回来，是**异步**的，
 *   所以按 `useDocTheme` 的先例单独一个 hook（那边文件头写着"节奏不一样就不塞进
 *   同一个 effect"）。
 * - `useDocTheme`：文档主题，与这里**没有关系**（一个管外壳、一个管编辑区）。
 *   两者的注入方式还正好相反：那边必须限域，这边原样注入（`styles/ui-style.ts`）。
 *
 * # 什么时候才去取 CSS
 *
 * **判据是"这一档有没有文件"，不是"是不是内置档之一"**——因为用户放一个
 * `adwaita.css` 就是**覆盖内置**（同名覆盖，与文档主题同一条规则），那时
 * `data-ui-style` 仍然是 `adwaita`，但那份 CSS 得取回来。这个信息只有
 * `nota_ui_styles` 的 `builtin` 那一格有，所以清单必须先拿到手。
 *
 * ⚠️ 清单是**状态不是事件**（同 `panels`、`themes` 的先例）：用户在应用运行期间
 * 往那个目录里丢文件**不会**触发通知，想让新风格出现就重开应用。
 * 做「重扫」这个动作的钩子留着（清单进 effect 依赖），但今天没有调用点。
 *
 * ⚠️ 取失败**安静地退回内置那套**，不弹错：settings 里记着一个 id、而那份
 * `.css` 被删了，是很平常的事（换机器、清理磁盘）。用户看到的是"风格回到了
 * 内置那套"，而那正是事实——`docs/theme` 那边对同一种情况是同一个处置。
 */

import { useCallback, useEffect, useState } from "react";

import { api, type Settings, type UiStyleInfo } from "@/bridge/ipc";
import { useT } from "@/i18n";
import { applyUiStyleCss } from "@/styles/ui-style";
import type { Toast } from "@/ui/Toasts";

export interface 风格出口 {
  /** 清单：内置的 ＋ 用户导入的。**空数组 = 还没拉到（或拉失败了）**。 */
  styles: UiStyleInfo[];
  /** 打开（必要时先建出来的）用户风格目录。 */
  openStylesDir: () => Promise<void>;
}

export function useUiStyles(
  settings: Settings | null,
  toast: (message: string, level?: Toast["level"]) => void,
): 风格出口 {
  // ⚠️ **这一行不只是取值**：它订阅了语言（宿主报来语言之后这一块要重画）。
  const t = useT();
  const [styles, setStyles] = useState<UiStyleInfo[]>([]);

  // 清单：启动时拉一次。理由（状态不是事件）写在文件头。
  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const list = await api.uiStyle.list();
        if (alive) setStyles(list);
      } catch (e) {
        // ⚠️ **拉不到不是空清单，是"不知道"**：这两种状态下拉里都只剩内置那几档
        // （见 `AppearancePane` 的兜底），但只有"拉到了"才允许判断某个 id 是不是
        // 内置的。所以这里保持空数组、**不做任何"那就当没有导入档"的推断**。
        console.warn("[nota] 读取界面风格清单失败：", e);
      }
    })();
    return () => {
      alive = false;
    };
  }, []);

  const id = settings?.ui_style ?? "";
  // 这一档在清单里、而且清单说它**有文件**（用户新加的，或用户覆盖了内置的）。
  const 有文件 = styles.some((s) => s.id === id && !s.builtin);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const css = 有文件 ? await api.uiStyle.css(id) : null;
        if (alive) applyUiStyleCss(css);
      } catch (e) {
        // 见文件头：文件被删了就退回内置那套，不打断用户。
        // ⚠️ 退回时要**真的把注入的那份撤掉**，否则旧的文件内容还挂在 `<head>` 里，
        // 用户会看到"我删了文件，风格还在"。
        if (alive) {
          console.warn("[nota] 应用导入的界面风格失败：", e);
          applyUiStyleCss(null);
        }
      }
    })();
    // ⚠️ `alive` 标志必须有：快速连点两档时，先发出去的那次 IPC 可能后回来，
    // 不挡住就会用旧的那份 CSS 盖掉新的（`useDocTheme` 同一条）。
    return () => {
      alive = false;
    };
  }, [id, 有文件, styles]);

  const openStylesDir = useCallback(async () => {
    try {
      // ⚠️ 路径与"打开"都在后端那一条命令里：它会先把目录**建出来**再打开
      // ——首次使用时它多半还不存在（`commands/ui_style.rs`）。
      await api.uiStyle.openDir();
    } catch (e) {
      toast(t("Could not open the styles folder: {0}", String(e)), "error");
    }
  }, [toast, t]);

  return { styles, openStylesDir };
}
