/**
 * **退出前把没存的那几份问一遍**（2026-10-16 新建，朋友清单第 7／16 条：
 * 「功能:退出软件时对更改进行保存/弹窗」）。
 *
 * # 它为什么长在 `useDocuments` 里，而不是 `App.tsx`
 *
 * 它要的四样东西——**文档表、哪几份是脏的、存盘那个函数、问一句那个框**——
 * 全都已经在 `useDocuments` 手里了。挂在 `App.tsx` 上要再从外面接四根线进来，
 * 而那个文件常年贴着 1000 行硬线（`docs/09` §4）。放这儿不算跑题：
 * **关一份文档**（`closeDoc`）与**退出时把全部文档一起处理**，是同一个问题的
 * 两个尺度。
 *
 * # 两段式：宿主拦下来，这里决定
 *
 * ```text
 * 用户点叉 ──▶ 宿主 CloseRequested
 *                ├── 设置关着「关闭前先问我」  ──▶ 直接退
 *                ├── 镜像里没有未保存的改动    ──▶ 直接退
 *                └── 两条都成立 ──▶ prevent_close ＋ nota:close-requested
 *                                        └──▶ 本文件：问 → 存 → api.window.quit()
 * ```
 *
 * ⚠️ **"取消"这条路就是"什么都不做"**：窗口那一关已经被宿主挡回去了，
 * 前端不收尾，应用就停在原地——不必再往宿主发一条"我不退了"的请求
 * （真发一条的话，宿主那边就得记一个每关一次都要清一遍的状态）。
 *
 * ⚠️ **它与 `closeDoc` 那条路是两件事，别合并**：那条问的是"这一份"，走的是
 * 「保存并关闭 / 丢弃并关闭 / 取消」；这条问的是"全部"，走的是
 * 「全部保存并退出 / 不保存直接退出 / 取消」。文案与按钮名都不一样，
 * 合成的代价是用户分不清自己刚才答应的是哪一种。
 *
 * ⚠️ **存不上就不退**（与 `closeDoc` 同一条判据）：`saveDoc` 给 `false` 的三种
 * 情况里有两种是"什么都没写"（另存为被取消、写盘报错）。照退等于把
 * 「全部保存并退出」偷偷降级成「不保存直接退出」——用户以为存住了，文件里是旧的。
 */

import { useEffect, useRef } from "react";

import { api, events, on, type Document, type DocId } from "@/bridge/ipc";
import { t } from "@/i18n";
import type { Toast } from "@/ui/Toasts";
import type { Dialogs } from "@/ui/useDialogs";

export function useQuitGuard(w: {
  /** ⚠️ **只读**：`useDocuments` 那份列表是 `readonly`（同那些 hook 的口径）。 */
  docs: readonly Document[];
  saveDoc: (id: DocId) => Promise<boolean>;
  toast: (message: string, level?: Toast["level"]) => void;
  askConfirm: Dialogs["askConfirm"];
}): void {
  const { docs, saveDoc, toast, askConfirm } = w;
  /**
   * ⚠️ **订阅只挂一次**（依赖数组空着），所以回调里读到的必须是"这一刻"的值——
   * 文档表、存盘函数、问框都经 ref 走。不这么做的话，每打一个字
   *（`docs` 换一个新对象）都要退订重订一次，而重订的那个缝隙里来的关窗请求
   * 会被丢掉（静默：窗口挡住了、却没人问）。
   *
   * ⚠️ **文案不进 ref**：它用的是模块级的 `t(...)`（`i18n/index.ts`），
   * 那个函数**在调用的那一刻**读当前语言——所以事件来了再取，取的必然是当时的
   * 那一门。⚠️ 这里**不该**用 `useT()`：这一层什么都不画，订阅只会让它在
   * 语言一变时重挂一次监听（而"挂一次"正是上面那条的要点）。
   */
  const 最新 = useRef({ docs, saveDoc, toast, askConfirm });
  最新.current = { docs, saveDoc, toast, askConfirm };

  useEffect(() => {
    let 退订: (() => void) | undefined;
    let 卸载了 = false;
    /**
     * 正在问的那一轮的闸。⚠️ 弹框那次 `await` 期间用户完全可能再点一次叉，
     * 不防的话就是**两个确认框摞在一起**，而用户点完上面那个、下面那个还在问。
     */
    let 正在进行 = false;
    void on(events.quitRequested, () => {
      if (正在进行) return;
      正在进行 = true;
      void (async () => {
        const { docs: 表, saveDoc: 存, toast: 提示, askConfirm: 问 } = 最新.current;
        const 脏的 = 表.filter((d) => d.dirty);
        try {
          // ⚠️ **没有脏的就直接退**，一个字都不问。宿主那边已经用镜像判过一遍
          // 了（`lib.rs::关窗前要问`），这里再判一次不是重复：两份东西不同源
          //（镜像 vs 编辑器树上那份），而"多问一句"比"少问一句"的代价小得多。
          if (脏的.length) {
            const 答 = await 问({
              title: t("Has unsaved changes"),
              message: t("Still unsaved: {0}. Save before quitting?", 名单(脏的)),
              extraLabel: t("Save All and Quit"),
              confirmLabel: t("Discard and Quit"),
              danger: true,
            });
            if (答 === "cancel") return;
            if (答 === "extra") {
              for (const d of 脏的) {
                if (!(await 存(d.id))) {
                  提示(
                    t("Could not save “{0}”, so Nota is staying open", d.title),
                    "error",
                  );
                  return;
                }
              }
            }
          }
          await api.window.quit();
        } finally {
          // ⚠️ **成败都要把闸放开**：一直关着的话，用户下一次点叉就再也没有
          // 反应了。真退成了的那一路无所谓——进程都没了。
          正在进行 = false;
        }
      })();
    }).then((fn) => {
      退订 = fn;
      // ⚠️ **订阅是异步的**：那一下 `await` 期间组件已经卸载的话，清理函数早跑过
      // 了、`退订` 这时候才拿到——不补这一枪就漏一个监听者（热重载几轮之后，
      // 一次关窗弹好几个框）。
      if (卸载了) fn();
    });
    return () => {
      卸载了 = true;
      退订?.();
    };
  }, []);
}

/** 把脏的那几份列成一句人话。⚠️ **最多点三个名字**，多了就写"等 N 份"。 */
function 名单(脏的: readonly Document[]): string {
  const 名字 = 脏的.map((d) => d.title);
  if (名字.length <= 3) return 名字.join("、");
  // ⚠️ 第二个数是**还有几份**，不是一共几份——写错的话用户会去数标签。
  return t("{0} and {1} more", 名字.slice(0, 3).join("、"), 名字.length - 3);
}
