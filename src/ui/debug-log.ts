







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
