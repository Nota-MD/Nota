/**
 * 「强制专注」的**首次说明**：第一次打开这个模式时拦一次，把话说完再放行。
 *
 * # 为什么必须有它（不是礼貌，是必要条件）
 *
 * 用户 2026-09-26 点名要的。原话：
 *
 * > 首次打开强制专注模式的时候，弹窗提示用户，这是个什么东西。明确的告诉用户
 * > 这可能会用到什么系统权限，并且保证不会窃取你的任何数据。同时呢告诉用户，
 * > 你可以很轻松的通过各种系统工具或者其他奇迹影响来破解这个超级专注模式。
 * > 但是如果这样的话，你设置这个超级专注模式，那也便失去了意义。所以请好好
 * > 对待自己的信用，如果决定了，那就执行到底。
 *
 * 下面那段话是**那句话的重组**：四件事一件不少，顺序按"用户会先问哪个"排
 * ——是什么 → 动用什么 → 保证什么 → 你随时能推翻它。
 *
 * ⚠️ **它冒的风险是真实的、说清楚的**：这个模式会弹一个**置顶、全屏、抢焦点**
 * 的窗口压在你正在用的任何程序上面。不事先讲明白就弹，那是恶意软件的行为；
 * 讲了再弹，那是用户自己签的字。这两者的差别全在这个弹窗上。
 *
 * ⚠️ 同一份话在设置页里**还有一份**（`settings/panes/FocusPane.tsx` 末尾那个
 * `Note`），那是"事后还能查"的那一份。两处措辞要一致，**改一处要改两处**。
 *
 * # ⚠️ 它只在第一次出现，所以那个位要落盘
 *
 * 判据是 `settings.focus.introduced`（`settings/focus.rs` 那一格）。只在内存里
 * 的话每次重启都要再拦一次，用户很快就学会闭眼点掉——**那正好把这次说明的
 * 意义抵消掉**，还多了一个每天要点一下的烦人框。
 *
 * ⚠️ 取消它 = **不开始**。这不是"关掉一个提示"，是"我看完了，但我不打算这么干"。
 * 顺手开始才是错的：那段话的最后一句就是"决定了，那就执行到底"，
 * 而一个点确定/点取消都会开始的功能，等于没问。
 */

import { useCallback } from "react";

import type { Settings } from "@/bridge/ipc";
import { t } from "@/i18n";
import { paneWriter } from "@/ui/settings/panes/props";
import type { ConfirmAnswer, ConfirmRequest } from "@/ui/useDialogs";

/**
 * @param askConfirm `ui/useDialogs.ts` 的「问一句」。
 * @param 设置 当前的设置。⚠️ 必须是**这一次 render 的那一份**：下面那条补丁
 *   要拿它展开（`focus` 那一格有七个字段，漏掉的就是被打回默认值）。
 * @param onChange 改设置（`App.tsx` 的 `updateSettings`）。只用来写
 *   `focus.introduced`——**这个 hook 不改别的任何设置**。
 */
export function useFocusIntro(
  askConfirm: (req: ConfirmRequest) => Promise<ConfirmAnswer>,
  设置: Settings | null,
  onChange: (patch: Partial<Settings>) => void,
) {
  /**
   * 把 `开始` 包一层：没看过说明就先弹一次，看过了（或这次看完点了确定）才跑。
   *
   * ⚠️ 这里**不缓存**"已经看过了"这个判断，每次都从传进来的 `设置` 现读——
   * 落盘是异步的，用户完全可能在它写完之前又点一次，那时读到的是旧值、
   * 于是会再弹一遍。**可以接受**（多问一遍比"该问的没问"强）；
   * 反过来缓存一个本地 `true`，就会在落盘失败时**永久**跳过这段说明。
   */
  return useCallback(
    async (开始: () => Promise<void>) => {
      if (!设置) return;
      if (!设置.focus.introduced) {
        const 答 = await askConfirm({
          title: t("Force Focus: Let Us Be Clear First"),
          message: [
            t(
              "This is an account of attention. While you sit at the editor the balance goes up; when you switch elsewhere it goes down. When the balance runs out, it calls you back with a full red screen and a sharp sound.",
            ),
            "",
            t("It needs three things:"),
            t("① Whether Nota's own window is the active window;"),
            t("② putting up an always-on-top, full-screen window — the red screen;"),
            t("③ making a sound."),
            "",
            t(
              "Those three, only while it is running. It does not read the keyboard, take screenshots, watch what you do in other programs, or send anything of yours anywhere.",
            ),
            "",
            t(
              "One last thing that has to be said plainly: you can stop this mode at any time, and you can bypass it with system tools — it is not a lock, and it will not hold anyone who really wants out. But if you bypass it, setting it up in the first place means nothing. So please take this promise you made to yourself seriously: once you decide, follow through.",
            ),
          ].join("\n"),
          confirmLabel: t("I Understand — Start"),
          // ⚠️ 「取消」**留着**，而且它就是"算了，不开了"（见文件头最后一段）。
          // 这里**不能**用 `hideCancel`：那会让"我知道了"和"我要开始"变成同一个
          // 答案，用户没有任何办法在看完之后反悔。
        });

        if (答 !== "confirm") return;

        // ⚠️ 这一枪**不 await**（`paneWriter` 的返回值是 `void`），而这没关系：
        // 它写的是一个"以后别再问了"的标志位，用户点过"我明白了"之后这一枪
        // 早发晚发都不影响这次开始。万一它没写成功（盘满了、权限坏了），
        // 后果只是**下次再问一遍**——那恰恰是这类失败里最轻的一种。
        //
        // ⚠️ 反过来说：**绝不能**让它挡住开始。因为写不进配置文件而拒绝启动，
        // 是拿一个用户看不见的故障去惩罚他，而他刚刚才答应要好好写。
        //
        // ⚠️ 合并用 `paneWriter`，**不要手写 `{ focus: { introduced: true } }`**：
        // 那样写会把其余六格悄悄打回默认值（用户明明把警报时长调成了 45 分钟，
        // 一进说明弹窗就变回 20）。为什么是整份替换，见 `panes/props.ts`。
        paneWriter(设置, onChange, "focus")({ introduced: true });
      }
      await 开始();
    },
    [askConfirm, 设置, onChange],
  );
}
