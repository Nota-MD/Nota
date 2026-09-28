/**
 * 状态栏里那一格「强制专注」的余额表。
 *
 * # 为什么这个功能需要一格常驻的显示
 *
 * 账户模型下，余额是**一直在一个方向上走**的数：人在写它就涨，人走了它就掉。
 * 没有这一格的话，这个功能在"响之前"是完全隐形的——用户开着它、切出去十来分钟，
 * 心里没有任何参照，于是它就从"自律工具"变成了"随机弹红屏的怪东西"。
 *
 * ⚠️ 用户 2026-09-26 定的模型里，**看不到余额这个功能就不成立**（见
 * `settings/focus.rs` 文件头那三张旋钮）。所以这一格是承重的，不是装饰。
 *
 * # ⚠️ 它是**只读指示，不是开关**（同 `StatusBar.tsx` 文件头那条口径）
 *
 * 点一下就能停，看着很顺——但那会让"停掉专注"多出一个**没有确认**的入口，
 * 而这个动作是不可逆的（余额清零、这一轮白坐）。起停走「视图 → 强制专注」。
 *
 * # 什么时候画
 *
 * **只在跑的时候画**。没跑时状态栏一个字都不占——状态栏是给"此刻的这份文档
 * 和应用现在怎么摆"用的，一个"没在专注"的常驻标签等于把状态栏开成开关清单
 * （同 `StatusBar.tsx` 里「严格」那一格的判据）。
 */

import type { FocusState } from "@/bridge/types";
import { useT } from "@/i18n";
import { 说时长 } from "@/ui/useForceFocus";

export function FocusMeter({ state }: { state: FocusState | null }) {
  // ⚠️ **这一行不只是取值**：它订阅了语言（宿主报来语言之后这一块要重画，见
  // `i18n/index.ts::useT`）。
  const t = useT();
  if (!state?.running) return null;

  const 上限 = Math.max(1, state.cap_ms);
  // ⚠️ 夹到 [0,1]：宿主那边余额已经不会越界，但这一格是**按比例画宽度**的——
  // 哪天宿主改了口径（比如允许透支），这里不能跟着画出一条超出容器的红条。
  const 比例 = Math.min(1, Math.max(0, state.balance_ms / 上限));

  const 警报中 = state.phase === "alarm";
  const 走神中 = state.phase === "away";

  // ⚠️ 三个阶段的**颜色语义**要能一眼分开：
  // - 专注：平常色，不抢眼；
  // - 走神：黄的，而且**在宽限期内**说"还没扣"——不写这句的话，用户切出去
  //   看到黄的会以为已经在扣了，而这几秒其实是白送的（`焦点/mod.rs` 的
  //   `走神` 那一支：宽限内一分不扣）。
  // - 警报：红的。⚠️ 这时警报窗已经盖在屏幕上了，这一格是**背景**不是主提示。
  const 类名 = 警报中
    ? "status-focus status-focus-alarm"
    : 走神中
      ? "status-focus status-focus-away"
      : "status-focus";

  const 说明 = 警报中
    ? t("Force Focus: the balance hit zero and the alarm has sounded.")
    : 走神中
      ? state.away_ms < state.grace_ms
        ? t("Force Focus: you switched away, still inside the {0}-second grace period — these seconds are free.", 说时长(state.grace_ms - state.away_ms))
        : t("Force Focus: the balance is being charged. Come back to Nota and the charge stops.")
      : t("Force Focus: you are writing, the balance is rising (cap {0}). Start and stop it under View → Force Focus.", 说时长(state.cap_ms));

  return (
    <span className={类名} title={说明}>
      {/* ⚠️ 用「专注」两个字而不是「强制专注」：状态栏右边挤着四格统计，
          四个字会把整条顶宽（同 `StatusBar.tsx` 里模式名取 `short` 那一列的理由）。
          全名在 `title` 里。 */}
      <span className="status-focus-name">{t("Focus")}</span>
      <span className="status-focus-bar" aria-hidden="true">
        <span className="status-focus-fill" style={{ width: `${比例 * 100}%` }} />
      </span>
      <span className="status-focus-num">{说时长(state.balance_ms)}</span>
    </span>
  );
}
