/**
 * **把「拼写检查」那两格接到引擎上**：开关 ＋ 语言（2026-09-27 起，2026-10-11 大改）。
 *
 * # 它为什么需要一个 hook
 *
 * 设置里那个 `editor.spellcheck` 从 2026-09-26 起就在界面上，**全仓没有一处读它**
 * ——一个"拨了不生效"的开关，比没有这个开关更糟（用户会以为自己写的东西没问题，
 * 或者以为设置文件没存上）。同理 `spellcheck_langs`。
 *
 * # ⚠️⚠️ 2026-10-11：这条线**不再拨浏览器内核**
 *
 * 用户原话：「拼写检查不应该依赖于浏览器内核，而是真正可拆分的内核模块」。
 * 于是引擎换成了我们自己的（`src-tauri/src/spell/`：zspell ＋ 词典是数据），
 * 而这一份从那一天起只做两件事：
 *
 * 1. **拨开关 / 语言**——拨的是**编辑器里那条插件**（`editor/spell-check.ts`
 *    的 `设拼写开关` / `设拼写语言`），不是 WebKitGTK 的
 *    `spell-checking-enabled`。⚠️ 于是**内核那条路要关掉**（否则它会自己再画
 *    一套原生波浪线，和我们那套叠在一起、还各有各的语言）。
 *    [`api.webview.spellcheckSet`] 现在**只在启动时被叫一次、参数恒为 `false`**。
 * 2. **这台机器上有没有这本词典**——⚠️ 这一格的判据**反过来了**：
 *    从前是"设完之后读内核的词典列表，少了谁就说谁"（内核会跳过没装的），
 *    现在是**直接问 `nota_spell_dictionaries`**（列的是我们真读得了的那些）。
 *    ⚠️ 「跟随系统」那一档从前有个尴尬：空列表是我们**故意**不说话，
 *    于是"这台机器一本词典都没有"是**一声不吭**的——现在改成按"这一格实际
 *    会用哪个标签"去比（`当前语言标签`），于是那一档也说得出话。
 *
 * # 为什么失败要**重试**（2026-10-10 实测修的那条，留着）
 *
 * 关内核那一条（`spellcheckSet(false)`）是**过主线程**去问 WebKitGTK 的
 * （`commands/webview.rs`），而那边等回话只给 800 毫秒——启动那一下主线程最忙
 * （建窗、加载插件、跑 `on_page_load`），打空是常事。**打空的后果是内核的
 * 拼写检查一直开着**（它出厂是关的，但"关一次没成功"和"压根没关"在下一次
 * 引擎设置变化时是两回事），于是屏幕上会多出第二条波浪线。
 * 重试的代价只有几百毫秒；不重试的代价是"偶发的一屏双波浪线"。
 */

import { useEffect } from "react";

import { api } from "@/bridge/ipc";
import { 当前语言标签, 设拼写开关, 设拼写语言 } from "@/editor/spell-check";
import { useT } from "@/i18n";
import type { Toast } from "@/ui/Toasts";

export interface 拼写接线 {
  /** 设置里那个开关（`settings.editor.spellcheck`）。`null` = 设置还没读回来。 */
  开: boolean | null;
  /**
   * 设置里那几门语言（`settings.editor.spellcheck_langs`，`en_US` 那种标签）。
   * **空数组 = 跟随系统**（那是**有含义的一档**）；`null` = 设置还没读回来。
   *
   * ⚠️ 依赖是**这一串本身**，所以调用方要给一个稳定的身份（`App.tsx` 直接传
   * `settings.editor.spellcheck_langs`）。每帧现造一个 `["en_US"]` 会让下面那条
   * effect 每帧重跑一次（每次都过一次 IPC）。
   */
  语言: string[] | null;
  toast: (message: string, level?: Toast["level"]) => void;
}

/** 语言标签的归一化：`en-US` 与 `en_US` 是同一门（与 `spell/store.rs::归一` 一致）。 */
function 归一(标签: string): string {
  return 标签.toLowerCase().replace(/-/g, "_");
}

export function useSpellcheck(w: 拼写接线): void {
  // ⚠️ **这一行不只是取值**：它订阅了语言（宿主报来语言之后这一块要重画，
  // 见 `i18n/index.ts::useT`）。
  const t = useT();
  const { 开, 语言, toast } = w;

  // ── 内核那条路：**关掉**，并且顺手关掉它的平滑滚动 ──────────────────────
  //
  // ⚠️ 这两件是**一次性的**（不随设置变），所以依赖是空的。它们都是"引擎身上的
  // 设置、都得过一次主线程"，所以搭在同一条线上叫。
  useEffect(() => {
    // ⚠️ 触摸板那条（用户 2026-10-11：「触摸板上下滑动速度貌似居然是贝塞尔曲线，
    // 而且有延迟。改成硬滑动」）：失败无所谓（旧引擎没有那个设置项，手感退回原来
    // 的样子，不影响别的）。
    void api.webview.scrollHard().catch(() => {});

    // ⚠️ **内核的拼写检查从今天起一律关**（理由见文件头）：波浪线由我们自己画。
    // 重试的理由也在文件头（启动那一枪打空是常事）。
    let 算了 = false;
    void (async () => {
      for (let i = 1; i <= 6 && !算了; i++) {
        try {
          const 实际 = await api.webview.spellcheckSet(false);
          if (实际 === false) return; // 关上了
        } catch {
          // 非 Linux 上没有这个接口 —— 那也**没问题**：那边本来就没有内核画线。
          return;
        }
        if (i < 6) await new Promise((r) => setTimeout(r, 500));
      }
    })();

    return () => {
      算了 = true;
    };
  }, []);

  // ── 开关那一条 ────────────────────────────────────────────────────────
  useEffect(() => {
    // 设置还没读回来（启动那一小会儿）：**什么都别做**。拿一个假设的默认值去
    // 拨，等真值到了再拨一次，中间那一拨是用户的设置文件说了不算的一瞬间。
    if (开 === null) return;
    设拼写开关(开);
  }, [开]);

  // ── 语言那一条 ────────────────────────────────────────────────────────
  useEffect(() => {
    // 同上面那一条：设置还没读回来时**什么都别做**。
    if (语言 === null) return;
    // ⚠️ 同一门语言还要给**编辑器里那条插件**（它自己画波浪线）。
    // `""` = 跟随系统（那时插件按界面语言猜一个，见 `当前语言标签`）。
    设拼写语言(语言[0] ?? "");

    let 算了 = false;
    void (async () => {
      let 有: Awaited<ReturnType<typeof api.spell.dictionaries>>;
      try {
        有 = await api.spell.dictionaries();
      } catch {
        // 列不出来（命令没接上、配置目录读不了）：**不说话**。
        // ⚠️ 这里不能猜——猜错了会让用户看到一句"你没有这本词典"而它明明有。
        return;
      }
      if (算了) return;
      const 装着的 = new Set(有.map((d) => 归一(d.tag)));
      // ⚠️ **"跟随系统"那一档也要比**（2026-10-10 补的那条的修正版）：
      // 那一档实际用的是界面语言猜出来的标签（`当前语言标签()`），所以问的是
      // 同一个问题。从前那版**故意**在空列表时不说话，于是"这台机器一本词典
      // 都没有"是一声不吭的——而那是用户最需要被告知的一种状态。
      //
      // ⚠️⚠️ **但"跟随系统"那一档只在"一本词典都没有"时才说话**（2026-10-11
      // 定的这条）。理由是一台中文环境的机器：跟随系统猜出来的是 `zh_CN`，
      // 而 hunspell 那套**根本没有中文词典**（`store.rs` 文件头写着为什么）——
      // 逐门比的话**每次启动都弹一句"没有 zh_CN 的词典"**，而用户什么都没选，
      // 那也不是他能修的一件事。他真勾了中文才该说（下面那个分支）。
      const 没有的 =
        语言.length > 0
          ? 语言.filter((tag) => !装着的.has(归一(tag)))
          : 有.length === 0
            ? [当前语言标签()]
            : [];
      if (没有的.length > 0) {
        toast(
          t(
            "This machine has no dictionary for {0}, so words in that language will not be checked. Nota ships no dictionaries of its own — install one, or import a .zip under Settings → Editor → Spell check.",
            没有的.join(", "),
          ),
          "error",
        );
      }
    })();

    return () => {
      算了 = true;
    };
  }, [语言, t, toast]);
}
