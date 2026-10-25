/**
 * 强制专注：**状态订阅 + 四条命令**。主窗和警报窗共用这一份。
 *
 * # 它只管"现在怎么样"，不管"现在该说什么"
 *
 * 返回的是宿主那份 `FocusState` 的原样（余额、阶段、累计），**一个字的文案
 * 都没有**。措辞归调用点——两个窗口要说的话不一样（主窗说"余额还剩 12 分钟"，
 * 警报窗说"立刻回来写作"），在 hook 里选一种就是替另一个做决定。
 *
 * # ⚠️ 它就是"读 + 转发"，不含任何判断
 *
 * 什么时候扣钱、什么时候响，全在宿主那个计时线程里（`focus/mod.rs`），
 * 那是**唯一**的真相源。前端在这里再判一次（比如"余额小于零我自己也弹一个"）
 * 就会出现两边不一致，而那种故障用户完全没法排查。
 *
 * # 声音为什么不在这里
 *
 * 出声走 [`useFocusAlarmSound`]（同一个目录）：它要跟 Web Audio 打交道、
 * 还要有一条"合成不出来就叫宿主兜底"的路，那是另一件事。这里订阅的是
 * **状态**（每秒一发），声音订阅的是**事件**（响的那一下）——
 * 两条频道分工写在 `bridge/ipc.ts::events.focusBeep`。
 */

import { useCallback, useEffect, useState } from "react";
import type { UnlistenFn } from "@tauri-apps/api/event";

import { api, events, on } from "@/bridge/ipc";
import type { FocusState } from "@/bridge/types";

export interface StrongMakeDedicatedNoteOutputMouth {
  /**
   * 此刻的状态。**还没拉到是 `null`**——不是"没在跑"。
   *
   * ⚠️ 这两个要分开：`null` 时界面该画"正在读"，而 `running: false` 该画
   * "开始专注"。合成一个的话，挂载那一瞬间会闪一下"开始专注"，
   * 而用户其实正在专注中（余额眼看就要跳出来）。
   */
  state: FocusState | null;
  /** 开始一轮。⚠️ 已经在跑时宿主**不重置**余额（连点两下是安全的）。 */
  start: () => Promise<void>;
  /** 停掉这一轮。 */
  stop: () => Promise<void>;
  /** 警报上那颗「我回来了」。 */
  ack: () => Promise<void>;
}

export function useForceFocus(): StrongMakeDedicatedNoteOutputMouth {
  const [state, setState] = useState<FocusState | null>(null);

  useEffect(() => {
    let alreadyUninstall = false;
    let unsubscribe: UnlistenFn | null = null;

    // 先拉一次：窗口可能是**会话开始之后**才建的（警报窗就是这样），
    // 只靠事件的话它会一直显示"正在读"。
    api.focus
      .get()
      .then((s) => {
        // ⚠️ 拉到之前可能已经有事件到了（那几拍比这一枪新）。别覆盖回去。
        if (!alreadyUninstall) setState((oldValue) => oldValue ?? s);
      })
      .catch(() => {
        // 拉不到就当"没在跑"（`null` 留给"正在读"，但这里已经确定读不到了）。
        // 不弹错误：这个功能拉不到不该在界面上占一行，用户按一下开始就知道了。
        if (!alreadyUninstall) setState((oldValue) => oldValue ?? { ...emptyState });
      });

    on<FocusState>(events.focusState, setState).then((f) => {
      // ⚠️ 竞态：`on` 是异步的，挂载后马上卸载的话，退订函数到手时组件已经没了。
      if (alreadyUninstall) f();
      else unsubscribe = f;
    });

    return () => {
      alreadyUninstall = true;
      unsubscribe?.();
    };
  }, []);

  // ⚠️ 三条命令**都不拿返回值去 setState**：宿主在命令里已经广播了一份
  //（`commands/focus.rs::广播`），走事件那条路到得更准（它经过了计时线程的
  // 同一把锁）。这里再 set 一次就是"两个来源往同一个格子里写"，先后不定。
  const start = useCallback(async () => {
    await api.focus.start();
  }, []);
  const stop = useCallback(async () => {
    await api.focus.stop();
  }, []);
  const ack = useCallback(async () => {
    await api.focus.ack();
  }, []);

  return { state, start, stop, ack };
}

/** 读不到宿主状态时的占位（形状对、值全是 0）。 */
const emptyState: FocusState = {
  running: false,
  balance_ms: 0,
  cap_ms: 0,
  phase: "focusing",
  away_ms: 0,
  grace_ms: 0,
  elapsed_ms: 0,
  focused_ms: 0,
  away_total_ms: 0,
  alarms: 0,
};

/**
 * 把毫秒说成 `12:34` 或 `1:02:03`。
 *
 * ⚠️ **不是时钟时间，是一段时长**：两小时以上才带小时那一段。用它去显示
 * "现在几点"是错的（那是另一件事，别把这两个函数合并）。
 *
 * ⚠️ 负数按 0 算：余额在警报那一刻正好是 0，但浮点累加或某一拍的顺序
 * 都可能让它短暂地探到 -1 毫秒，而界面上显示 `-0:01` 会让人以为欠了钱。
 */
export function sayTimeLength(milliSeconds: number): string {
  const totalSeconds = Math.max(0, Math.floor(milliSeconds / 1000));
  const time = Math.floor(totalSeconds / 3600);
  const share = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  const fill = (n: number) => String(n).padStart(2, "0");
  return time > 0 ? `${time}:${fill(share)}:${fill(seconds)}` : `${share}:${fill(seconds)}`;
}
