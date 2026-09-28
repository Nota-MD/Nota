/**
 * **强制专注那一档**的接线：订阅状态、四条命令、结束后那份总结。
 *
 * 2026-09-28 从 `App.tsx` 整块搬出来——那个文件 997 行，贴着 `docs/09` §4 的
 * 1000 行硬线。⚠️ 搬的是**一整档功能**，不是随手切的几行：从"谁在跑"到
 * "点了菜单那一项之后走哪条路"，全在这一份里，`App.tsx` 那边只剩一句解构。
 * （同一次搬家的还有「关于」那一摊，见 `ui/useDialogs.ts` 顶上那段。）
 *
 * # ⚠️⚠️ 它和 `ui/useImmersive.ts` 那个「专注」毫无关系
 *
 * 尽管名字像：那边是"把外壳收起来"（沉浸模式，`focusMode`）；这边是**记账**：
 * 人在写就涨、切走就扣、扣光就弹一块红屏。用户 2026-09-26 定的模型，全部账目
 * 逻辑在宿主的 `src-tauri/src/focus/`，前端只是**读 + 转发**。
 *
 * # 四块分工
 *
 * - `useForceFocus`  —— 订阅状态 + 四条命令（主窗和警报窗共用）；
 * - `useFocusAlarmSound` —— 挂"该响了"那条频道。⚠️ **只在主窗挂**
 *   （警报窗也挂就是同一段警报响两遍，理由在那个文件头）；
 * - `useFocusIntro`  —— 第一次打开时那段说明。用户点名要的；
 * - `useFocusTrace`  —— 攒这一轮的轨迹，结束时交出一份**总结**（用户点名的
 *   "专注模式结束后的总结"，2026-09-27）。
 *
 * # ⚠️ 调用位置在 `App.tsx` 里有两道约束（搬出来之后由那边负责）
 *
 * ① 必须在 `updateSettings` 与 `askConfirm` 之后——这两个都是它的入参；
 * ② 必须**在 `useImmersive` 之前**：那边那个 `有浮层` 要数进本 hook 交出去的
 *    `专注总结`（总结框开着时 `Esc` 该归它，不该顺手把沉浸模式也退掉）。
 *    而 `有浮层` 那条口径要求**逐个列在调用处**（见 `ui/useImmersive.ts`
 *    那一格自己的注释），所以被数列的那个值只能先算出来。
 */

import { useCallback, useMemo } from "react";

import type { Settings } from "@/bridge/types";
import type { 总结 } from "@/ui/focus-summary";
import type { ConfirmAnswer, ConfirmRequest } from "@/ui/useDialogs";
import { useFocusAlarmSound, 预热音频 } from "@/ui/useFocusAlarmSound";
import { useForceFocus, type 强制专注出口 } from "@/ui/useForceFocus";
import { useFocusIntro } from "@/ui/useFocusIntro";
import { useFocusTrace } from "@/ui/useFocusTrace";

/**
 * 总结框要的两样东西合成**一个**值。
 *
 * ⚠️ 不拆成两个交出去：那样 `ui/AppDialogs.tsx` 的签名里就会出现"总有了、时刻
 * 还没有"这个中间态，而它在界面上没有意义（一张没有时间戳的卡）。合成一个
 * `null` / 非 `null` 之后，那个框只有"显示"和"不显示"两种。
 */
export interface 专注总结值 {
  总: 总结;
  现在: Date;
}

export interface 专注会话出口 {
  /** 此刻的宿主状态。**每秒都在变**（`null` = 还没拉到，见 `useForceFocus`）。 */
  专注状态: 强制专注出口["state"];
  /** 这一轮在不在跑。⚠️ 是**一个布尔**，不是上面那个对象——理由见下。 */
  专注运行中: boolean;
  /** 「视图 → 强制专注」那一颗按钮两态（在跑就停、没跑就开）。 */
  切换强制专注: () => void;
  /** 刚结束那一轮的总结；`null` = 不显示那个框。 */
  专注总结: 专注总结值 | null;
  /** 用户把总结关掉了。 */
  关掉专注总结: () => void;
}

export function useFocusSession({
  askConfirm,
  settings,
  updateSettings,
}: {
  askConfirm: (req: ConfirmRequest) => Promise<ConfirmAnswer>;
  settings: Settings | null;
  updateSettings: (patch: Partial<Settings>) => void;
}): 专注会话出口 {
  const { state: 专注状态, start: 开始专注, stop: 停止专注 } = useForceFocus();
  useFocusAlarmSound();
  const 先说明再专注 = useFocusIntro(askConfirm, settings, updateSettings);

  // ⚠️ 传进去的是**每秒都在变**的那个对象，但这个 hook 只在"这一轮结束"那一下
  // 往 state 里写东西（中间那几百拍的曲线存在 ref 里）——所以它不会让 `App.tsx`
  // 多出一次重画。理由逐条写在 `ui/useFocusTrace.ts` 的文件头。
  const { 结算: 专注结算, 结算于: 专注结算于, 收起: 收起专注结算 } =
    useFocusTrace(专注状态);

  const 专注总结 = useMemo(
    () => (专注结算 && 专注结算于 ? { 总: 专注结算, 现在: 专注结算于 } : null),
    [专注结算, 专注结算于],
  );

  /**
   * 「视图 → 强制专注」：**一颗按钮两态**（在跑就停、没跑就开）。
   *
   * ⚠️ 身份的稳定性在这里是**硬要求**（这张表要喂给原生菜单栏，见 `App.tsx`
   * 里 `useMenus` 那一段）：`专注状态` 每秒都在变，所以**不能**把它写进依赖
   * 数组——那样这张表每秒重建一次，原生菜单栏就每秒重推一遍。判据改成读一个
   * ref 之外没有别的办法，但更简单的是：**"在不在跑"由 `useMenus` 的勾去表达**，
   * 而这里只做"点了就反过来"，反转的判据用 `setState` 的函数式写法拿不到
   * ——所以下面这个 `useCallback` 依赖 `专注运行中`（一个布尔），
   * 它一秒最多翻一次，而翻的那一次本来就该让菜单重推。
   */
  const 专注运行中 = 专注状态?.running ?? false;
  const 切换强制专注 = useCallback(() => {
    if (专注运行中) {
      void 停止专注();
      return;
    }
    // ⚠️ **预热必须在这一行的位置**（`click` 的同步段里），不能挪进下面那个
    // 回调：那里已经跨过 `await`，用户手势过期了，`AudioContext` 会永远是
    // `suspended`，警报响的时候一声都没有。理由在 `ui/useFocusAlarmSound.ts`。
    //
    // ⚠️ 它排在说明弹窗**前面**：说明是**异步**的（用户可能看半天才点），
    // 而手势只在 `click` 那一瞬间有效。用户在说明里点「取消」的话，这里多建的
    // 那个 `AudioContext` 什么也不做——它不出声、不占资源，下次点还复用它
    //（`取音频` 里那个模块级变量），所以这一枪白打也不要紧。
    预热音频();
    void 先说明再专注(async () => {
      await 开始专注();
    });
  }, [专注运行中, 停止专注, 开始专注, 先说明再专注]);

  return {
    专注状态,
    专注运行中,
    切换强制专注,
    专注总结,
    关掉专注总结: 收起专注结算,
  };
}
