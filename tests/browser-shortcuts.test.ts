import { readFileSync } from "node:fs";

import {
  isDeveloperToolsShortcut,
  shouldBlockBrowserShortcut,
} from "@/ui/browser-shortcuts";

let passed = 0;
let failed = 0;

function testCase(name: string, body: () => void): void {
  try {
    body();
    passed += 1;
    console.log(`  PASS ${name}`);
  } catch (error) {
    failed += 1;
    console.log(`  FAIL ${name}`);
    console.log(`       ${error instanceof Error ? error.message : String(error)}`);
  }
}

function assert(value: unknown, message: string): asserts value {
  if (!value) throw new Error(message);
}

const event = (
  key: string,
  extra: Partial<Parameters<typeof shouldBlockBrowserShortcut>[0]> = {},
) => ({
  key,
  ctrlKey: false,
  metaKey: false,
  shiftKey: false,
  altKey: false,
  ...extra,
});

console.log("\n[Browser shortcuts]");

testCase("reload and browser find/download/source shortcuts are blocked", () => {
  for (const shortcut of [
    event("F5"),
    event("r", { ctrlKey: true }),
    event("g", { ctrlKey: true }),
    event("j", { ctrlKey: true }),
    event("u", { ctrlKey: true }),
    event("g", { metaKey: true }),
  ]) {
    assert(shouldBlockBrowserShortcut(shortcut, false), `${shortcut.key} was not blocked`);
  }
});

testCase("WebView shortcuts require the developer setting", () => {
  assert(
    shouldBlockBrowserShortcut(event("F12"), false),
    "F12 escaped in production",
  );
  assert(
    shouldBlockBrowserShortcut(
      event("I", { ctrlKey: true, shiftKey: true }),
      false,
    ),
    "Ctrl+Shift+I escaped",
  );
  assert(
    !shouldBlockBrowserShortcut(event("F12"), true),
    "enabled WebView shortcuts still blocked F12",
  );
  assert(isDeveloperToolsShortcut(event("F12")), "F12 is not recognized as DevTools");
  const rust = readFileSync("src-tauri/src/settings/general.rs", "utf8");
  const pane = readFileSync("src/ui/settings/panes/DebugPane.tsx", "utf8");
  assert(
    rust.includes("pub webview_default_shortcuts: bool"),
    "WebView shortcut setting is missing from Rust",
  );
  assert(
    pane.includes('t("Enable WebView default shortcuts")'),
    "developer settings toggle is missing",
  );
  const menus = readFileSync("src/ui/useMenus.ts", "utf8");
  const nativeKeys = readFileSync("src-tauri/src/format_keys.rs", "utf8");
  const webviewSecurity = readFileSync("src-tauri/src/webview_security.rs", "utf8");
  assert(
    menus.includes('item.id === "view.devtools" && !developerMode'),
    "Developer Tools menu item is not gated by developer mode",
  );
  assert(
    nativeKeys.includes("is_devtools_key") &&
      nativeKeys.includes('EVENT, "devtools"'),
    "native F12 handling can bypass the developer setting",
  );
  assert(
    menus.includes('name2 === "devtools"') &&
      menus.includes("developerMode && webviewDefaultShortcuts") &&
      /events\.formatKey[\s\S]*?\[[\s\S]*?developerMode,[\s\S]*?webviewDefaultShortcuts,[\s\S]*?\]/.test(
        menus,
      ),
    "native DevTools shortcut is not gated by settings",
  );
  assert(
    webviewSecurity.includes("SetAreBrowserAcceleratorKeysEnabled") &&
      webviewSecurity.includes("SetAreDevToolsEnabled"),
    "Windows browser accelerator/DevTools policy is not applied",
  );
  assert(
    webviewSecurity.includes("set_enable_developer_extras(developer_mode)"),
    "Linux WebKit DevTools policy is not applied",
  );
});

testCase("ordinary editor shortcuts remain available", () => {
  for (const shortcut of [
    event("f", { ctrlKey: true }),
    event("b", { ctrlKey: true }),
    event("s", { ctrlKey: true }),
    event("z", { ctrlKey: true }),
    event("Tab"),
    event("ArrowLeft"),
  ]) {
    assert(!shouldBlockBrowserShortcut(shortcut, false), `${shortcut.key} was blocked`);
  }
});

testCase("native internal DevTools toggle is not granted", () => {
  const capabilities = readFileSync("src-tauri/capabilities/default.json", "utf8");
  assert(
    !capabilities.includes("core:webview:allow-internal-toggle-devtools"),
    "WebView-native DevTools bypasses the developer setting",
  );
  const menus = readFileSync("src/ui/useMenus.ts", "utf8");
  assert(
    menus.includes('menuHandlers["view.devtools"]?.()'),
    "F12 is not routed through the explicit DevTools command",
  );
});

testCase("rendered HTML stays inside the app context-menu boundary", () => {
  const htmlBlock = readFileSync("src/editor/html-block-view.ts", "utf8");
  const contextMenu = readFileSync("src/ui/ContextMenu.tsx", "utf8");
  assert(!htmlBlock.includes("<iframe"), "HTML preview uses an iframe escape hatch");
  assert(
    contextMenu.includes('window.addEventListener("contextmenu", listen, true)'),
    "application context menu does not intercept early",
  );
});

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) process.exitCode = 1;
