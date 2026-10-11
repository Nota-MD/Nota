/**
 * **把「拼写检查」那两格接到引擎上**：开关（2026-09-27）＋ 语言（2026-10-10）。
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
 * # ⚠️⚠️ 语言那一格（2026-10-10，当天晚些从"一门"改成"多门"）有一条**与开关相反**的规矩
 *
 * 开关那边"引擎说的 != 我请求的"就是要报的错。语言这边**不是**：
 *
 * - **空数组 = 跟随系统**，这时引擎自己会挑一本（机器上装着的那个，比如 `en_US`），
 *   挑出来的**当然和我们请求的空列表不一样**——那是**正确结果**，不许当成不一致；
 * - 反过来，点名要了一门机器上**没这本词典**的语言时，引擎会**跳过它**
 *   （`TextCheckerEnchant::updateSpellCheckingLanguages` 里那个
 *   `enchant_broker_dict_exists()` 判不过就跳过），读回来的列表里没有它。
 *   那一门**一个字都不会被检查**——这件事必须说出来：用户会以为"我勾了中文，
 *   它应该在检查中文"，而真相是"这台机器没有中文词典，中文那一半没人看"。
 *   Nota 一个词典字节都不带（`THIRD-PARTY.md` §7 那条链子），所以这不是 bug，
 *   是**得让用户知道的一件事**。
 *
 * ⚠️ **多门时这条要逐门说**（2026-10-10 晚）：读回来的列表里少的那几门才是
 * "没词典"的（`en_GB` 挂着而 `zh_CN` 没挂上 ⇒ 只说 `zh_CN` 那一句）。
 * **不能**再拿"读回来是空的"当判据——那是单门时的写法，多门时会漏报
 * （挂上了 `en_US` 就永远不空，于是中文那句永远不说）。
 *
 * # 两条各自只在**自己那一格变了**的时候跑一次
 *
 * 依赖是那一个布尔。⚠️ 每次渲染都调一遍是**不行**的：`with_webview` 要过一次
 * 主线程（见 `commands/webview.rs` 文件头），而设置页在打字时会频繁重渲染。
 */

import { useEffect } from "react";

import { api } from "@/bridge/ipc";
import { 设拼写语言 } from "@/editor/spell-check";
import { useT } from "@/i18n";
import type { Toast } from "@/ui/Toasts";

export interface 拼写接线 {
  /** 设置里那个开关（`settings.editor.spellcheck`）。`null` = 设置还没读回来。 */
  开: boolean | null;
  /**
   * 设置里那几门语言（`settings.editor.spellcheck_langs`，enchant 那套 `zh_CN`）。
   * **空数组 = 跟随系统**（那是**有含义的一档**，见文件头）；`null` = 设置还没读回来。
   *
   * ⚠️ 依赖是**这一串本身**，所以 `useSpellcheck` 的调用方要给它一个稳定的身份
   * （`App.tsx` 直接传 `settings.editor.spellcheck_langs`，设置没变就是同一个数组）。
   * 每帧现造一个 `["en_US"]` 会让下面那条 effect 每帧重跑一次（每次都过一遍主线程）。
   */
  语言: string[] | null;
  toast: (message: string, level?: Toast["level"]) => void;
}

export function useSpellcheck(w: 拼写接线): void {
  // ⚠️ **这一行不只是取值**：它订阅了语言（宿主报来语言之后这一块要重画，
  // 见 `i18n/index.ts::useT`）。
  const t = useT();
  const { 开, 语言, toast } = w;

  useEffect(() => {
    // 设置还没读回来（启动那一小会儿）：**什么都别做**。拿一个假设的默认值去
    // 拨引擎，等真值到了再拨一次，中间那一拨是用户的设置文件说了不算的一瞬间。
    if (开 === null) return;

    let 算了 = false;

    // ⚠️ 顺手关掉引擎的"平滑滚动"（用户 2026-10-11：「触摸板上下滑动速度貌似居然是
    // 贝塞尔曲线，而且有延迟……改成硬滑动」）。它和拼写开关是**同一类**东西
    // （引擎身上的设置、都得过一次主线程），所以搭在这条线上叫一次；失败无所谓
    // （旧引擎没有那个设置项，手感退回原来的样子，不影响别的）。
    void api.webview.scrollHard().catch(() => {});

    // ⚠️⚠️ **失败要重试，不能只试一次**（2026-10-10 实测修的那条）。
    //
    // 这条命令是**过主线程**去问 WebKitGTK 的（`commands/webview.rs`），而那边
    // 等回话只给 **800 毫秒**——超时就报错。启动那一下主线程最忙（建窗、加载
    // 插件、跑 `on_page_load`），于是**这一枪打空是常事**；而 WebKitGTK 的
    // `spell-checking-enabled` **出厂就是关的**，打空一次就等于**这一次运行
    // 永远没有拼写检查**（用户看到的：打一串错字，一个红波浪线都没有）。
    // 实测证据：容器里 `hunspell-en-US` 是装着的，而开窗打
    // `helllo wrold thiss is a mispelled sentance.` 一个波浪线都没有。
    //
    // 重试的代价只有几百毫秒；不重试的代价是"这个开关压根不生效"。
    const 次数 = 6;
    void (async () => {
      for (let i = 1; i <= 次数 && !算了; i++) {
        try {
          const 实际 = await api.webview.spellcheckSet(开);
          // ⚠️ **只在不一致时说话**：一致是常态，每次都弹一条"已生效"就是噪音。
          if (算了 || 实际 === 开) return;
          if (i < 次数) {
            await new Promise((r) => setTimeout(r, 500));
            continue;
          }
          toast(t("Spell checking did not end up the way you asked; the engine stayed as it was"), "error");
        } catch (e) {
          if (算了) return;
          if (i < 次数) {
            await new Promise((r) => setTimeout(r, 500));
            continue;
          }
          // 报错的原因是"这个平台没接口"或"等引擎回话超时"，两种都在这一句里
          // 说得过去（宿主那边回来的原文带着具体原因，原样接上）。
          toast(t("Could not change spell checking: {0}", String(e)), "error");
        }
      }
    })();

    // ⚠️ **卸载/下一次变化之后不许再弹**：用户连拨两下开关，第一下的回话
    // 晚到时会替第二下弹一条已经不对的提示。
    return () => {
      算了 = true;
    };
  }, [开, t, toast]);

  // ── 语言那一条 ────────────────────────────────────────────────────────
  useEffect(() => {
    // 同上面那一条：设置还没读回来时**什么都别做**。
    if (语言 === null) return;
    // ⚠️ 同一门语言还要给**编辑器里那条插件**（它自己画波浪线，
    // 见 `editor/spell-check.ts`）：`""` = 跟随系统。
    设拼写语言(语言[0] ?? "");

    let 算了 = false;
    void (async () => {
      try {
        // ⚠️ 空数组发过去就是"跟随系统"那一档（不是"不发"）。
        const 实际 = await api.webview.spellcheckLanguagesSet([...语言]);
        if (算了) return;
        // ⚠️ **逐门比**：读回来的那串里没有的那几门才是"这台机器没这本词典"
        // （理由见文件头那段）。⚠️ 拿"读回来是空的"当判据是**单门时的写法**——
        // 多门时挂上了一门就永远不空，中文那句就永远不说了。
        // 跟随系统那一档（`语言` 是空的）不管引擎挑了什么，都不说话。
        const 没挂上的 = 语言.filter((l) => !实际.includes(l));
        if (没挂上的.length > 0) {
          toast(
            t(
              "This machine has no dictionary for {0}, so words in that language will not be checked. Nota ships no dictionaries of its own.",
              没挂上的.join(", "),
            ),
            "error",
          );
        } else if (语言.length === 0 && 实际.length === 0) {
          // ⚠️ **"跟随系统"这一档也要能自报病情**（2026-10-10 加的）。
          //
          // 引擎读回来一本词典都没有 ⇒ **不管你怎么打都不会有红线**，而这一档
          // 从前是**一声不吭**的（空列表我们刻意不说话）。于是用户只看到
          // "拼写检查没用"，却没有任何线索指向"这台机器没装词典"——
          // 这正是本仓最忌讳的那种静默失败。装一个词典包就能好，那就得说出来。
          toast(
            t(
              "This machine has no spell-check dictionary at all, so nothing will be checked in any language. Install one (hunspell / enchant) on the system first.",
            ),
            "error",
          );
        }
      } catch (e) {
        if (算了) return;
        toast(t("Could not change the spell-check language: {0}", String(e)), "error");
      }
    })();

    return () => {
      算了 = true;
    };
  }, [语言, t, toast]);
}
