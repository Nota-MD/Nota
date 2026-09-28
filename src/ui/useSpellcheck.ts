/**
 * **把「拼写检查」那个开关接到引擎上**（2026-09-27）。
 *
 * # 它为什么需要一个 hook
 *
 * 设置里那个 `editor.spellcheck` 从 2026-09-26 起就在界面上，**全仓没有一处读它**
 * ——一个"拨了不生效"的开关，比没有这个开关更糟（用户会以为自己写的东西没问题，
 * 或者以为设置文件没存上）。真正干活的是 WebKitGTK，所以这件事得跨一次 IPC
 * （`api.webview.spellcheckSet`，实现与理由见 `commands/webview.rs`）。
 *
 * # ⚠️ 状态**从引擎读回来**，不信我们请求的那个值
 *
 * 与 `ui/useImmersive.ts`（全屏）和 `ui/useWindowControls.ts`（置顶）同一条口径：
 * 命令返回的是**改完之后引擎说的值**。两者不一致时如实说一句——不说的话，
 * 用户看到的是一个"拨过去又弹回来"的开关，而他会去怀疑设置文件。
 *
 * ⚠️ 平台差别也在这条上露出来：非 Linux 上命令**直接报错**（那边没接口），
 * 于是这里弹一句"这个平台上还改不了拼写检查"。**不假装成功**。
 *
 * # 它只在**开关本身变了**的时候跑一次
 *
 * 依赖是那一个布尔。⚠️ 每次渲染都调一遍是**不行**的：`with_webview` 要过一次
 * 主线程（见 `commands/webview.rs` 文件头），而设置页在打字时会频繁重渲染。
 */

import { useEffect } from "react";

import { api } from "@/bridge/ipc";
import { useT } from "@/i18n";
import type { Toast } from "@/ui/Toasts";

export interface 拼写接线 {
  /** 设置里那个开关（`settings.editor.spellcheck`）。`null` = 设置还没读回来。 */
  开: boolean | null;
  toast: (message: string, level?: Toast["level"]) => void;
}

export function useSpellcheck(w: 拼写接线): void {
  // ⚠️ **这一行不只是取值**：它订阅了语言（宿主报来语言之后这一块要重画，
  // 见 `i18n/index.ts::useT`）。
  const t = useT();
  const { 开, toast } = w;

  useEffect(() => {
    // 设置还没读回来（启动那一小会儿）：**什么都别做**。拿一个假设的默认值去
    // 拨引擎，等真值到了再拨一次，中间那一拨是用户的设置文件说了不算的一瞬间。
    if (开 === null) return;

    let 算了 = false;
    void (async () => {
      try {
        const 实际 = await api.webview.spellcheckSet(开);
        // ⚠️ **只在不一致时说话**：一致是常态，每次都弹一条"已生效"就是噪音。
        if (算了 || 实际 === 开) return;
        toast(t("Spell checking did not end up the way you asked; the engine stayed as it was"), "error");
      } catch (e) {
        if (算了) return;
        // 报错的原因是"这个平台没接口"或"等引擎回话超时"，两种都在这一句里
        // 说得过去（宿主那边回来的原文带着具体原因，原样接上）。
        toast(t("Could not change spell checking: {0}", String(e)), "error");
      }
    })();

    // ⚠️ **卸载/下一次变化之后不许再弹**：用户连拨两下开关，第一下的回话
    // 晚到时会替第二下弹一条已经不对的提示。
    return () => {
      算了 = true;
    };
  }, [开, t, toast]);
}
