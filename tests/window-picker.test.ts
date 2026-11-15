import { readFileSync } from "node:fs";
import { join } from "node:path";

import {
  formatWindowId,
  windowIdWidth,
  windowPickerError,
} from "../src/ui/window-picker";

let pass = 0;
let fail = 0;

function test(name: string, body: () => void): void {
  try {
    body();
    pass++;
    console.log(`  ok ${name}`);
  } catch (error) {
    fail++;
    console.log(`  FAIL ${name}`);
    console.log(`       ${error instanceof Error ? error.message : String(error)}`);
  }
}

function equal(actual: unknown, expected: unknown, message: string): void {
  if (actual !== expected) {
    throw new Error(`${message}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
  }
}

const read = (path: string) => readFileSync(join(process.cwd(), path), "utf8");

console.log("\n[Window picker]");

test("IDs keep one digit until a two-digit window exists", () => {
  equal(windowIdWidth([1, 9]), 1, "single-digit width");
  equal(formatWindowId(1, [1, 9]), "1", "single-digit ID");
  equal(windowIdWidth([1, 10]), 2, "two-digit width");
  equal(formatWindowId(1, [1, 10]), "01", "earlier ID gains a leading zero");
  equal(formatWindowId(10, [1, 10]), "10", "ten keeps two digits");
});

test("picker validation enforces width, self, and live IDs", () => {
  equal(windowPickerError("1", [1, 10], 2), "width", "one digit is incomplete at width two");
  equal(windowPickerError("01", [1, 10], 2), null, "01 is valid");
  equal(windowPickerError("02", [1, 10], 2), "self", "current window is rejected");
  equal(windowPickerError("03", [1, 10], 2), "missing", "missing window is rejected");
  equal(windowPickerError("ab", [1, 10], 2), "digits", "non-digits are rejected");
});

test("exact-width valid input submits without Enter", () => {
  const dialog = read("src/ui/WindowPickerDialog.tsx");
  if (!dialog.includes("next.length === width") || !dialog.includes("onAnswer(Number(next))")) {
    throw new Error("auto-submit branch is missing");
  }
});

test("both tab actions have shortcuts and menu wiring", () => {
  const commands = read("src/ui/commands.ts");
  const table = read("src/ui/useCommandTable.ts");
  if (!commands.includes('"tab.openInNewWindow"') || !commands.includes("Ctrl+Alt+N")) {
    throw new Error("open-in-new-window shortcut is missing");
  }
  if (!commands.includes('"tab.moveToWindow"') || !commands.includes("Ctrl+Alt+M")) {
    throw new Error("move-to-window shortcut is missing");
  }
  if (!table.includes('"tab.openInNewWindow"') || !table.includes('"tab.moveToWindow"')) {
    throw new Error("tab window commands are not in the command table");
  }
  if (!read("src/ui/TabBar.tsx").includes('t("Move to Another Window…")')) {
    throw new Error("tab context menu has no move action");
  }
});

test("tab context menu escapes the tab strip's overflow", () => {
  const tabbar = read("src/ui/TabBar.tsx");
  const css = read("src/styles/tabs-status.css");
  if (!tabbar.includes("createPortal") || !tabbar.includes("document.body")) {
    throw new Error("tab context menu is still rendered inside the scrolling tab strip");
  }
  const rule = /\.tab-menu-anchor\s*\{([\s\S]*?)\}/.exec(css)?.[1] ?? "";
  if (!rule.includes("z-index: var(--z-context-menu)")) {
    throw new Error("portaled tab context menu is not above the document");
  }
  if (!tabbar.includes('name="nota-tab-close-symbolic"')) {
    throw new Error("tab close still uses the platform theme's filled close glyph");
  }
  if (!css.includes('[data-ui-style="macos"] .tab-close')) {
    throw new Error("macOS tab close has no light neutral treatment");
  }
  if (!tabbar.includes("openUp: window.innerHeight - y < 96")) {
    throw new Error("tab context menu does not flip above the tab strip near the window bottom");
  }
  const upRule = /\.tab-menu-anchor\[data-open-up\] \.menu-popup\s*\{([\s\S]*?)\}/.exec(css)?.[1] ?? "";
  if (!upRule.includes("bottom: 5px") || !upRule.includes("top: auto")) {
    throw new Error("upward tab context menu has no upward anchor");
  }
});

test("ID reveal is hold-to-show and transfer focus is configurable", () => {
  const commands = read("src/ui/commands.ts");
  const table = read("src/ui/useCommandTable.ts");
  const registry = read("src/ui/useWindowRegistry.ts");
  const shortcuts = read("src/ui/settings/panes/ShortcutsPane.tsx");
  const translations = read("src/i18n/zh-settings.ts");
  const css = read("src/styles/settings-widgets.css");
  if (!commands.includes('id: "view.windowId"') || !commands.includes('accel: "Ctrl+Alt+I"')) {
    throw new Error("window ID reveal is not a configurable menu shortcut");
  }
  if (!table.includes('"view.windowId": showWindowId')) {
    throw new Error("window ID menu command has no implementation");
  }
  if (!registry.includes("windowIdAccel") || !registry.includes("eventAccel(event)") || !registry.includes("setPeek(false)")) {
    throw new Error("hold-to-show ID shortcut is missing");
  }
  if (!registry.includes("showWindowId") || !registry.includes("window.setTimeout")) {
    throw new Error("menu invocation does not show the window ID briefly");
  }
  if (!registry.includes("pickerMode(true)") || !registry.includes("pickerMode(false)")) {
    throw new Error("picker title mode is not scoped to the dialog");
  }
  if (!read("src/ui/settings/panes/AppearancePane.tsx").includes("focus_after_window_transfer")) {
    throw new Error("target focus setting is missing");
  }
  if (!shortcuts.includes('className="stg-keys-value"') || !shortcuts.includes('className="stg-keys-actions"')) {
    throw new Error("shortcut values and actions are not separate right-aligned groups");
  }
  if (!translations.includes('"Change": "更改"')) {
    throw new Error("shortcut action still uses the abbreviated label");
  }
  if (!css.includes("--stg-col-title: 160px")) {
    throw new Error("shortcut page still reserves the full-width group title column");
  }
  const cell = /\.stg-keys-cell\s*\{([\s\S]*?)\}/.exec(css)?.[1] ?? "";
  if (!cell.includes("width: 100%") || !cell.includes("justify-content: flex-end")) {
    throw new Error("shortcut detail group is not right-aligned");
  }
});

test("ID reveal dims the window but keeps the centered number opaque", () => {
  const css = read("src/styles/window-id.css");
  if (!css.includes(".window-id-overlay::before") || !css.includes("opacity: 0.72")) {
    throw new Error("window content dim layer is missing");
  }
  if (!css.includes("place-items: center") || !css.includes("font-variant-numeric: tabular-nums")) {
    throw new Error("ID number is not centered with stable numerals");
  }
  if (!css.includes("opacity: 1")) {
    throw new Error("ID number must remain fully opaque");
  }
  if (!css.includes(".window-id-overlay-caption")) {
    throw new Error("ID overlay needs a short explanatory caption");
  }
});

console.log(`\n${pass} passed, ${fail} failed`);
if (fail > 0) process.exitCode = 1;

