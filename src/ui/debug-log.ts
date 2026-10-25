/**
 * 前端生命周期事件 → 宿主调试日志。
 *
 * 粒度约束：记录用户能感知的阶段变化与失败上下文，不记录按键、滚动、正文、
 * 选区文本、剪贴板或凭据。后端仍由调试模式闸门决定是否落盘；这里只负责在
 * 事件发生时追加一条可检索的英文记录。
 */

import { api } from "@/bridge/ipc";

export type DebugDetail = string | number | boolean | null | undefined;

function text4(value: DebugDetail): string {
  if (value === null || value === undefined) return "null";
  return String(value).replace(/[\r\n\t]+/g, " ").slice(0, 512);
}

export function debugEvent(
  scope: "startup" | "editor" | "document" | "theme" | "update" | "plugin" | "ui",
  event: string,
  details?: Record<string, DebugDetail>,
): void {
  const tail = details
    ? Object.entries(details)
        .map(([key, value]) => `${key}=${text4(value)}`)
        .join(" ")
    : "";
  const message = tail ? `${event} ${tail}` : event;
  void api.debugLog.write(scope, message).catch(() => {
    // 调试日志是旁路；写不进去不能影响正在诊断的应用本身。
  });
}

export function debugError(
  scope: "startup" | "editor" | "document" | "theme" | "update" | "plugin" | "ui",
  event: string,
  error: unknown,
  details?: Record<string, DebugDetail>,
): void {
  debugEvent(scope, event, {
    ...details,
    error: error instanceof Error ? error.message : String(error),
  });
}
