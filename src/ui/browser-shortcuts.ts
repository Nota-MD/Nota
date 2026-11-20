export interface BrowserShortcutEvent {
  key: string;
  ctrlKey: boolean;
  metaKey: boolean;
  shiftKey: boolean;
  altKey: boolean;
}

export function isDeveloperToolsShortcut(event: BrowserShortcutEvent): boolean {
  const key = event.key.toLowerCase();
  const command = event.ctrlKey || event.metaKey;
  return (
    key === "f12" ||
    (command && event.shiftKey && ["i", "j", "c"].includes(key))
  );
}

/**
 * Return true when the WebView would perform an application-unsafe browser
 * action. Developer tools remain available through the explicit menu command
 * when developer mode is enabled.
 */
export function shouldBlockBrowserShortcut(
  event: BrowserShortcutEvent,
  allowWebviewShortcuts: boolean,
): boolean {
  const key = event.key.toLowerCase();
  const command = event.ctrlKey || event.metaKey;

  if (!allowWebviewShortcuts) {
    if (isDeveloperToolsShortcut(event)) return true;
  }

  if (allowWebviewShortcuts) return false;
  if (key === "f5") return true;
  if (!command || event.altKey) return false;
  return key === "r" || key === "g" || key === "j" || key === "u";
}
