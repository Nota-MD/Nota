/**
 * 强制专注的**警报声**。前端合成，这是主路径。
 *
 * # 为什么声音在前端而不是宿主
 *
 * 宿主那边要出声，就得**先合成一个 WAV、写到磁盘、再找一个播放器**——
 * 三件事都要处理平台差异（`focus/alarm.rs::系统提示音` 那条兜底路就是
 * 这么走的，它是备用方案，不是主方案）。而 Web Audio 这边几行就写完了，
 * 音色还能当场调。用户要的是"尖锐"，这是个耳朵说了算的事，
 * 不该隔着一个磁盘文件和三个外部程序去猜。
 *
 * # ⚠️ WebKit 可能把没有用户手势的 `AudioContext` 摁住
 *
 * 浏览器的自动播放策略要求"先有用户手势"，否则 `AudioContext` 建出来就是
 * `suspended`。Tauri 的 WebView 里这条策略**不是关着的**，所以：
 *
 * 1. 用户点「开始专注」那一下去调 [`预热音频`]——那是个真手势，
 *    建好的 context 之后就一直是 `running`；
 * 2. 万一还是播不出来（比如这个窗从头到尾没人点过），
 *    [`响警报`] 返回 `false`，调用方转去叫宿主兜底（`api.focus.beep()`）。
 *
 * ⚠️ **本机（无声卡的 Xvfb）验不了"有没有声音"**。验得了的是：这条路的代码
 * 跑到了、没抛异常、返回值符合预期。实机要耳朵听一次。
 *
 * # 音色
 *
 * 一个方波（`square`，谐波最丰富，听起来"尖"）× 在两个频率之间来回跳
 * （880 / 1245 Hz，A5 和 D#6 的一个不协和音程），每 0.22 秒一跳，
 * 共 11 跳 ≈ 2.4 秒。这是欧洲那种楼宇警报器的节奏——**不是一声"哔"**，
 * 而是一段"停不下来"的东西，因为要叫醒的是个正在看别处的人。
 *
 * ⚠️ 音量封顶在 0.28。再大在笔记本内置喇叭上会**削波**，听起来是破音
 * 而不是更响，反而更容易被当成"这软件有毛病"。
 */

import { useEffect } from "react";
import type { UnlistenFn } from "@tauri-apps/api/event";

import { api, events, on } from "@/bridge/ipc";

/** 响一段多久（秒）。 */
const 时长 = 2.4;
/** 频率来回跳的间隔（秒）。 */
const 跳间隔 = 0.22;
/** 两个频率（Hz）。⚠️ 别用八度关系（2:1）——那听起来是"悦耳的和弦"，不是警报。 */
const 甲 = 880;
const 乙 = 1245;
/** 峰值音量。见文件头最后一段。 */
const 音量 = 0.28;

/** 复用同一个 context。⚠️ 每次新建会在几轮之后撞上浏览器的 context 数量上限。 */
let 音频: AudioContext | null = null;

function 取音频(): AudioContext | null {
  if (音频) return 音频;
  try {
    // ⚠️ 只认标准的 `AudioContext`。WebKitGTK 支持它，而 `webkitAudioContext`
    // 那个前缀写法是给老 Safari 的——多写一条路就多一条没人测过的分支。
    音频 = new AudioContext();
    return 音频;
  } catch {
    return null;
  }
}

/**
 * 在**用户手势里**调一次，把 `AudioContext` 建好并唤醒。
 *
 * ⚠️ 调它的时机很讲究：必须在 `click` 的同步段里（Tauri 命令的 `await` 之后
 * 就算晚了，手势已经过期）。所以调用点写的是 `预热音频(); await api.focus.start();`
 * ——**顺序反过来就白预热了**。
 *
 * 失败了不报错、不提示：它只是"让后面那一声更可能响"，不响还有宿主的兜底路。
 */
export function 预热音频(): void {
  const ctx = 取音频();
  if (!ctx) return;
  if (ctx.state === "suspended") {
    void ctx.resume().catch(() => {});
  }
}

/**
 * 响一段警报。**返回它到底响没响**——调用方据此决定要不要叫宿主兜底。
 *
 * ⚠️ 返回 `false` 不等于"用户听不见"：那意味着"这一条路没走通"。
 * 别把它当成错误弹提示——用户此刻在别的窗口，弹什么他都看不见。
 */
export async function 响警报(): Promise<boolean> {
  const ctx = 取音频();
  if (!ctx) return false;

  // ⚠️ `resume()` 是异步的，而且**可能解不开**（没有手势时就是解不开）。
  // 解不开就如实返回 false，别硬着头皮 `start()`——那样得到的是一段
  // 从来没被播放过的时间线，`onended` 却照样会触发，看起来"响过了"。
  if (ctx.state === "suspended") {
    try {
      await ctx.resume();
    } catch {
      return false;
    }
  }
  if (ctx.state !== "running") return false;

  try {
    const 起 = ctx.currentTime;
    const 振荡 = ctx.createOscillator();
    const 增益 = ctx.createGain();
    振荡.type = "square";
    振荡.connect(增益);
    增益.connect(ctx.destination);

    // 频率在两个音之间来回跳。
    for (let i = 0; i * 跳间隔 < 时长; i++) {
      振荡.frequency.setValueAtTime(i % 2 === 0 ? 甲 : 乙, 起 + i * 跳间隔);
    }

    // 包络：猛起（30 毫秒）→ 保持 → 收尾淡出（200 毫秒）。
    // ⚠️ 两头都要渐变：直接 `start()` / `stop()` 会在波形中间切一刀，
    // 那一下是"啪"的一声爆音，比警报本身还吓人。
    增益.gain.setValueAtTime(0, 起);
    增益.gain.linearRampToValueAtTime(音量, 起 + 0.03);
    增益.gain.setValueAtTime(音量, 起 + 时长 - 0.2);
    增益.gain.linearRampToValueAtTime(0, 起 + 时长);

    振荡.start(起);
    振荡.stop(起 + 时长 + 0.02);
    return true;
  } catch {
    return false;
  }
}

/**
 * 挂上"该响了"那条频道。**只在主窗挂**。
 *
 * ⚠️⚠️ **警报窗千万不要挂它**。宿主那一枪 `emit` 是发给**所有**窗口的
 *（`alarm.rs::响`），两边都订阅就是**同一段警报响两遍**，而且两个
 * `AudioContext` 各播一份、相位还对不齐，听起来是一团糊的东西。
 *
 * 为什么选主窗播而不是警报窗播：**主窗一定在**，警报窗是响的那一刻才建的，
 * 它加载完可能已经过了几百毫秒（那时 `emit` 早发完了）。
 */
export function useFocusAlarmSound(): void {
  useEffect(() => {
    let 已卸载 = false;
    let 退订: UnlistenFn | null = null;

    on(events.focusBeep, () => {
      void 响警报().then((成功) => {
        // ⚠️ 前端播不出来才叫宿主。两条都响（比如前端其实响了、
        // 只是返回值不对）也只是"响两遍"，而漏响是这个功能里最糟的失败。
        if (!成功) void api.focus.beep().catch(() => {});
      });
    }).then((f) => {
      if (已卸载) f();
      else 退订 = f;
    });

    return () => {
      已卸载 = true;
      退订?.();
    };
  }, []);
}
