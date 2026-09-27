/**
 * **编辑区上面那一份预览的"形态与看法"**（2026-09-27 从 `App.tsx` 搬出，
 * 那时它 1017 行、硬上限 1000）。
 *
 * # 为什么搬
 *
 * 判据是老规矩（见 `App.tsx` 文件头）：**这一块自己有一份完整的理由可写**——
 * 它回答的是同一个问题："宿主推来的那一份预览，此刻该以**哪种形态**画在编辑区，
 * 以及用户在看它的**哪一面**"。三件事（分派形态、记住看法、`Esc` 之后干什么）
 * 都挂在这一份数据上，散在外壳文件里的时候要读三段才能拼出全貌。
 *
 * # 三件事各自的围栏（都是踩过的）
 *
 * 1. **分派只做一次**（`活跃预览` / `面板预览`）。`kind` 那种东西散在渲染里
 *    到处判，就有几处要跟着改；而"加第三种形态时忘改一处"的症状是"那块界面
 *    什么都不显示"，不会报错；
 * 2. **看法（"对比" / "改后"）归这一层**，不归 `EditorPane` 也不归
 *    `ReviewBar`：一个在编辑区身上画 class、一个画按钮，两边都得知道现在哪
 *    一面，那就只能放在它们共同的那一层；
 * 3. **`Esc` 优先走插件给的「放弃」**。那一份补丁在插件手里
 *    （`plugins/ai/main.lua` 的 `chat.patch`），只把编辑区收起来的话，插件仍然
 *    认为"有一份改动等着你"，下次开面板它还在。插件**没给**放弃命令时才退到
 *    "直接收起来"——那时收的就是纯显示，没有别的状态要清。
 */

import { useCallback, useEffect, useState } from "react";

import type { 预览看法 } from "@/editor/review";
import type { PluginReview, PluginReviewDiff, PluginReviewPanel } from "@/bridge/types";

export interface 预览看法接线 {
  /** 宿主推来的那一份预览（`ui/usePlugins.ts` 的 `review`）。`null` = 没有。 */
  预览: PluginReview | null;
  /**
   * 跑一条插件命令（`ui/usePlugins.ts` 的 `调`）。**签名是 `(插件, 命令)`
   * 不是 `(命令)`**：命令名只在插件内部唯一。
   */
  调插件: (plugin: string, command: string) => void;
  /** 把预览收起来（`ui/usePlugins.ts` 的 `收预览`）。 */
  收预览: () => void;
}

export interface 预览看法出口 {
  /**
   * `kind === "diff"` 的那一份（图画在编辑区自己身上）。没有就是 `null`。
   *
   * ⚠️ 类型是**窄的那个**（`PluginReviewDiff`），不是整条联合：调用方拿到它
   * 之后直接用 `.text` / `.accept` / `.reject`，而联合类型上这些字段不存在
   *（`PluginReviewPanel` 一个都没有）。写成宽的那种，每个用它的地方都要自己
   * 再判一次 `kind`——那就等于把"分派只做一次"这条规矩原地作废。
   */
  活跃预览: PluginReviewDiff | null;
  /** `kind === "panel"` 的那一份（占编辑区的一块面板）。类型同理是窄的那个。 */
  面板预览: PluginReviewPanel | null;
  /** 现在看哪一面。传给 `EditorPane` 与 `ReviewBar`（**两处必须同源**）。 */
  看法: 预览看法;
  set看法: (v: 预览看法) => void;
  /** 用户在正文里按了 `Esc`，或在预览那条细条上点了叉/按了 `Esc`。 */
  退出预览: () => void;
}

export function useReviewView(w: 预览看法接线): 预览看法出口 {
  const { 预览, 调插件, 收预览 } = w;

  // ⚠️ 分派**只做一次、就在这里**（见文件头第 1 条）。
  const 活跃预览 = 预览?.kind === "diff" ? 预览 : null;
  const 面板预览 = 预览?.kind === "panel" ? 预览 : null;

  const [看法, set看法] = useState<预览看法>("diff");

  /** 现在这份改动的目标文本。**只用来判"换了一份改动"**，见下面那个 effect。 */
  const 改动文本 = 活跃预览?.text ?? null;
  useEffect(() => {
    // 换了一份改动 → 回到「改动对比」。用户点开预览第一眼要看的是"改了哪儿"，
    // 而上一份留下的"改后"会让人以为没什么变化。
    //
    // ⚠️ 依赖是**文本**不是 `预览` 那个对象：宿主每拉一次都给一个新对象
    //（`api.plugin.review()` 的返回值），拿对象当依赖会在"同一份改动被重拉
    // 一次"时把用户切过去的那一面顶回来。
    set看法("diff");
  }, [改动文本]);

  const 退出预览 = useCallback(() => {
    const 放弃 = 活跃预览?.reject;
    if (放弃 && 活跃预览) void 调插件(活跃预览.plugin, 放弃.command);
    else void 收预览();
  }, [活跃预览, 调插件, 收预览]);

  return { 活跃预览, 面板预览, 看法, set看法, 退出预览 };
}
