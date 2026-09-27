/**
 * **窗口自身的两件事**（2026-09-27）：置顶 ＋ 开发者工具。
 *
 * 为什么单独一份文件、为什么是这两件凑一起：它们都是**"动的是窗口，不是文档、
 * 也不是界面"**的那一类。缩放（`ui/useZoom.ts`）动的是 webview 里的内容，
 * 全屏/专注（`ui/useImmersive.ts`）动的是外壳 ＋ 窗口尺寸——而这两件一个像素
 * 的正文都不碰。放一起，以后再有同类（比如"透明标题栏"）照着这一个文件加。
 *
 * # ⚠️ 置顶的状态**从窗口读回来**，不在内存里自己记
 *
 * 与全屏那条**一模一样**的理由（`ui/useImmersive.ts` 文件头）：用户完全可能
 * 在窗口管理器里给这个窗勾上"总在最前"，那时内存里那个 `false` 就和窗口分叉了
 * ——症状是**菜单里没有勾、窗口却浮在所有东西上面**，而用户会以为菜单坏了。
 *
 * ⚠️ **没有现成的"置顶变了"事件**（`onResized` 接得住全屏，因为全屏一定改
 * 尺寸；置顶不改）。所以这里两处同步：**挂载时读一次** ＋ **窗口每次拿到焦点
 * 时再读一次**。选焦点事件是因为——用户要开菜单，就得先让窗口有焦点；
 * 也就是说**在他看那个勾之前，账已经对过一遍了**。
 *
 * # ⚠️ 开发者工具**不留勾**
 *
 * 「开发者工具开着没有」WebKitGTK 没有可读的接口。硬记一个内存状态一定会
 * 和实际分叉，而分叉的症状是"菜单说开着、屏幕上没有"或者反过来。所以菜单里
 * 那一条是**动作不是状态**（`commands.ts` 里没有 `checkable`）。
 * 再按一次是把它**调到前面**，不是关掉——这也是 WebKitGTK 自己的行为。
 */

import { useCallback, useEffect, useState } from "react";
import { getCurrentWindow } from "@tauri-apps/api/window";

import { api } from "@/bridge/ipc";
import { useT } from "@/i18n";

export interface 窗口控制接线 {
  /** 出错时弹一条。**只用于用户发起的那两个动作**，读回来的失败不弹（见下）。 */
  toast: (text: string, kind?: "info" | "error") => void;
}

export interface 窗口控制出口 {
  /** 窗口现在是不是置顶。菜单那个勾的判据。 */
  置顶: boolean;
  /** 切换置顶。 */
  切换置顶: () => Promise<void>;
  /** 打开开发者工具。 */
  开开发者工具: () => Promise<void>;
}

export function useWindowControls(w: 窗口控制接线): 窗口控制出口 {
  const { toast } = w;
  // ⚠️ **这一行不只是取值**：它订阅了语言（宿主报来语言之后这一块要重画，
  // 见 `i18n/index.ts::useT`）。下面两处失败文案都走它。
  const t = useT();

  const [置顶, set置顶] = useState(false);

  /**
   * 读一次窗口，把上面那个镜像对齐。读不出来（窗口还没建好 / 已经没了）就维持现状。
   *
   * ⚠️ **故意不弹提示**：这不是用户发起的动作，报错也无从补救，弹出来只是
   * 多一条他关不掉的信息（与 `ui/useImmersive.ts::同步全屏` 同一条口径）。
   */
  const 同步置顶 = useCallback(async () => {
    try {
      set置顶(await getCurrentWindow().isAlwaysOnTop());
    } catch {
      // 见上：安静。
    }
  }, []);

  useEffect(() => {
    void 同步置顶();
    let 退订: (() => void) | null = null;
    void getCurrentWindow()
      .onFocusChanged(() => void 同步置顶())
      .then((f) => {
        退订 = f;
      })
      .catch(() => {
        // 订不上就退化成"只在挂载时同步一次"，界面仍然能用。
      });
    return () => 退订?.();
  }, [同步置顶]);

  const 切换置顶 = useCallback(async () => {
    const win = getCurrentWindow();
    try {
      await win.setAlwaysOnTop(!(await win.isAlwaysOnTop()));
    } catch (e) {
      toast(t("切换窗口置顶失败：{0}", String(e)), "error");
    } finally {
      // ⚠️ **成败都要同步**（与全屏那条同理）：失败时窗口没动，同步一次是白做的；
      // 成功时这一下才是让勾跟上的那个。写成"成功才同步"要多一个分支，
      // 而那个分支正好是唯一会漏更新的一条路。
      void 同步置顶();
    }
  }, [toast, t, 同步置顶]);

  const 开开发者工具 = useCallback(async () => {
    try {
      await api.window.openDevtools();
    } catch (e) {
      toast(t("打开开发者工具失败：{0}", String(e)), "error");
    }
  }, [toast, t]);

  return { 置顶, 切换置顶, 开开发者工具 };
}
