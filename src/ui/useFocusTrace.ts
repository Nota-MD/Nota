/**
 * 攒下这一轮的**轨迹**，并在它结束时交出一份总结（2026-09-27，用户点名）。
 *
 * 用户原话：「还有就是记得做一下专注模式结束后的总结功能就是将这一次专注模式的
 * 情况显示出来，并且像心电图那样也支持导出。」
 *
 * # 它为什么必须"记着上一条"
 *
 * ⚠️ 这是这个 hook 存在的全部理由，别把它改掉：宿主停掉一轮的时候
 * （`focus/mod.rs::停下`）**会把账本清成空快照再广播**。也就是说前端收到的
 * 第一份 `running: false` 的快照里，`elapsed_ms` / `focused_ms` / `alarms`
 * 全被抹成 0 —— 拿它去造总结，只会得到一张"你专注了 0 秒"的卡。
 *
 * 所以这里留一份 [`末状态`]（最后一份**在跑**的快照）。它是这一轮的唯一读数
 * 来源，`running: false` 那一份只当"结束了"这个信号用。
 *
 * # ⚠️ 曲线存在 ref 里，不进 state
 *
 * 两个理由。① 序列每秒都变，进 state 就是每秒一次 `setState`——而它**只**在
 * 结束时才被读一次，中间那几百次重画全是白跑的（主窗每秒本来就在重画，再加一条
 * 只会让那条链更长）。② 更要命的是依赖：`useEffect` 里 `setState` 出来的值一旦
 * 进了依赖数组，就会"effect 改 state → 重跑 effect → 再改"转成死循环，
 * 而 [`记一笔`] 对同一秒是**返回新数组**的（不是返回原引用），正好触发它。
 *
 * 代价如实记：中间过程的曲线**没有**任何界面在看（总结框只在结束后出现），
 * 所以"不进 state"没有丢任何东西。
 *
 * # 结束那一刻的顺序
 *
 * 先抓走序列、再清空，最后才造总结。反过来的话 [`记一笔`] 会先把序列清掉
 * （它见 `running: false` 就清，那是它自己的规矩），总结里就只剩一条空曲线。
 */

import { useCallback, useEffect, useRef, useState } from "react";

import type { FocusState } from "@/bridge/types";
import {
  createTotalJoin,
  valueObtainTotalJoin,
  recordValueStroke,
  type AdoptStylePoint,
  type TotalJoin,
} from "@/ui/focus-summary";

export interface DedicatedNoteTrackTrace {
  /**
   * 刚刚结束的那一轮的总结；**没有就是 `null`**。
   *
   * ⚠️ `null` 有三种来源，调用方不需要分辨：还没跑过、这一轮太短
   * （[`值得总结`]）、以及用户已经把它看过了（[`收起`]）。
   */
  joinCompute: TotalJoin | null;
  /** 结算发生的时刻。卡片右上角那个时间戳用它，**不是**"现在"。 */
  joinComputeAt: Date | null;
  /** 用户把总结关掉了。下一轮开始之前不会再有新的。 */
  collapse: () => void;
}

export function useFocusTrace(state: FocusState | null): DedicatedNoteTrackTrace {
  const orderColumn = useRef<AdoptStylePoint[]>([]);
  const endState = useRef<FocusState | null>(null);
  const atRun = useRef(false);

  const [joinCompute, setJoinCompute] = useState<TotalJoin | null>(null);
  const [joinComputeAt, setJoinComputeAt] = useState<Date | null>(null);

  useEffect(() => {
    if (!state) return;

    if (!state.running) {
      // ⚠️ `在跑` 这个 ref 是必需的，不是防守性代码：主窗挂载时会拉一次
      // `nota_focus_get`（`useForceFocus` 那个 effect），没跑过的人拿到的就是
      // 一份 `running: false` 的空快照。没有它的话每一次 app 启动都会"结束
      // 一轮"，而那一轮什么都没发生过——总结框会弹出一张全 0 的卡。
      if (!atRun.current) return;
      atRun.current = false;

      const snapshot = endState.current;
      endState.current = null;
      const point = orderColumn.current; // ← 清空**之前**那一条
      orderColumn.current = [];

      if (!snapshot) return;
      const total = createTotalJoin(snapshot, point);
      // ⚠️ 太短就不弹（`focus-summary.ts::最短总结秒` 那段注释记了理由）：
      // 点错按钮、或者只是想看看这功能长什么样，不该收到一张"你专注了 3 秒"。
      if (!valueObtainTotalJoin(total)) return;
      setJoinCompute(total);
      setJoinComputeAt(new Date());
      return;
    }

    orderColumn.current = recordValueStroke(orderColumn.current, state);
    endState.current = state;
    atRun.current = true;
  }, [state]);

  const collapse = useCallback(() => {
    setJoinCompute(null);
    setJoinComputeAt(null);
  }, []);

  return { joinCompute, joinComputeAt, collapse };
}
