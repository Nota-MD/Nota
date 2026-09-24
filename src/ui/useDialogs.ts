/**
 * **两个自绘对话框的"谁在等答案"状态**：确认框与单行输入框。
 *
 * 从 `App.tsx` 搬出来的（2026-09-24，那边顶着 1000 行上限，见 `AGENTS.md` §0.4）。
 * 搬的理由是这一块**和外壳骨架无关**：它是一对"问一句、等回答"的 Promise
 * 拼接器，谁在问（关文档、退出、填链接地址）它一概不知道。
 *
 * # 为什么不用 `window.confirm` / `window.prompt`
 *
 * - `confirm` 会**阻塞 WebView**，把中文输入法的组合态打断；
 * - `prompt` 在 WebKitGTK 上**默认被关掉**，调用**静默返回 null**——
 *   「格式 → 超链接」点下去什么都不发生，看起来就是那个菜单项坏了。
 *
 * 两条完整理由分别在 `ui/ConfirmDialog.tsx` 与 `ui/PromptDialog.tsx` 顶上。
 *
 * # ⚠️ 一次只可能有一个
 *
 * 每个框后面是**单个** ref（不是队列）。今天所有调用点都是用户动作直接
 * 触发的，不存在并发；真要并发弹两个，后来者会把前一个的 Promise 永远挂着
 * ——那时再改成队列。
 */

import { useCallback, useRef, useState } from "react";

/** 确认框要问的话。`hideCancel` 用于只报信不问事的场合（「关于 Nota」）。 */
export interface ConfirmRequest {
  title: string;
  message: string;
  confirmLabel?: string;
  danger?: boolean;
  hideCancel?: boolean;
}

/** 输入框要问的话。给了 `secondLabel` 才会有第二个字段。 */
export interface PromptRequest {
  title: string;
  label: string;
  placeholder?: string;
  hint?: string;
  secondLabel?: string;
  secondPlaceholder?: string;
  /**
   * 遮住输入的内容。
   *
   * ⚠️ 给的是**插件面板的 `prompt`**（`ui/panel-nodes.ts` 里的 `secret`）：
   * AI 插件的 API key 要用户当场填进去，那是屏幕上一个活生生的密钥，
   * 明文摆着会被旁边的人看走。填完就写进 `~/.config/nota/plugin-settings/`
   * （明文，见 `lua/api/settings.rs` 顶上那段"为什么不做加密"）。
   */
  secret?: boolean;
}

export interface Dialogs {
  /** 现在要不要显示确认框，显示什么。`null` = 不显示。 */
  confirmReq: ConfirmRequest | null;
  /** 弹确认框，返回用户点的是不是"确定"。 */
  askConfirm: (req: ConfirmRequest) => Promise<boolean>;
  /** 用户回答了（`ui/ConfirmDialog` 的 `onAnswer` 接这个）。 */
  answerConfirm: (ok: boolean) => void;

  promptReq: PromptRequest | null;
  /** 弹输入框，返回他填的值；取消给 `null`。 */
  askPrompt: (req: PromptRequest) => Promise<{ value: string; second: string } | null>;
  /** 用户回答了（`ui/PromptDialog` 的 `onAnswer` 接这个）。 */
  answerPrompt: (value: string | null, second?: string) => void;
}

export function useDialogs(): Dialogs {
  const [confirmReq, setConfirmReq] = useState<ConfirmRequest | null>(null);
  const confirmResolve = useRef<((ok: boolean) => void) | null>(null);

  const [promptReq, setPromptReq] = useState<PromptRequest | null>(null);
  const promptResolve = useRef<
    ((r: { value: string; second: string } | null) => void) | null
  >(null);

  const askConfirm = useCallback((req: ConfirmRequest) => {
    return new Promise<boolean>((resolve) => {
      confirmResolve.current = resolve;
      setConfirmReq(req);
    });
  }, []);

  const answerConfirm = useCallback((ok: boolean) => {
    setConfirmReq(null);
    const resolve = confirmResolve.current;
    confirmResolve.current = null;
    resolve?.(ok);
  }, []);

  const askPrompt = useCallback((req: PromptRequest) => {
    return new Promise<{ value: string; second: string } | null>((resolve) => {
      promptResolve.current = resolve;
      setPromptReq(req);
    });
  }, []);

  const answerPrompt = useCallback((value: string | null, second?: string) => {
    setPromptReq(null);
    const resolve = promptResolve.current;
    promptResolve.current = null;
    resolve?.(value === null ? null : { value, second: second ?? "" });
  }, []);

  return { confirmReq, askConfirm, answerConfirm, promptReq, askPrompt, answerPrompt };
}
