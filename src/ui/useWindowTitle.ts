





































import { useEffect } from "react";
import { getCurrentWindow } from "@tauri-apps/api/window";

import { distributionName } from "@/distribution";

export const shouldUseName = distributionName();









export function windowTitle(
  markTitle: string | null,
  dirty: boolean,
  withTextItemName = true,
  windowId: string | null = null,
): string {
  const title = !markTitle || !withTextItemName
    ? shouldUseName
    : `${markTitle}${dirty ? " •" : ""} — ${shouldUseName}`;
  return windowId ? `(${windowId}) ${title}` : title;
}








export function useWindowTitle(
  markTitle: string | null,
  dirty: boolean,
  withTextItemName = true,
  windowId: string | null = null,
): void {
  useEffect(() => {
    void getCurrentWindow()
      .setTitle(windowTitle(markTitle, dirty, withTextItemName, windowId))
      .catch(() => {

      });
  }, [markTitle, dirty, withTextItemName, windowId]);
}
