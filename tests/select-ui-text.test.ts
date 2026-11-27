/** Developer-only “selectable interface text” setting and CSS bridge. */

import { readFileSync } from "node:fs";

import { isSelectableUiTextEnabled } from "../src/ui/useSelectableUiText";

let pass = 0;
let fail = 0;

function testCase(name: string, body: () => void): void {
  try {
    body();
    pass++;
    console.log(`  ✔ ${name}`);
  } catch (error) {
    fail++;
    console.log(`  ✘ ${name}`);
    console.log(`      ${error instanceof Error ? error.message : String(error)}`);
  }
}

function assertion(condition: unknown, description: string): asserts condition {
  if (!condition) throw new Error(description);
}

console.log("\n[Developer: selectable interface text]");

testCase("both developer mode and the switch must be enabled", () => {
  assertion(!isSelectableUiTextEnabled(false, false), "disabled inputs must not enable selection");
  assertion(!isSelectableUiTextEnabled(false, true), "non-developer mode must not enable selection");
  assertion(!isSelectableUiTextEnabled(true, false), "the switch alone must not enable selection");
  assertion(isSelectableUiTextEnabled(true, true), "both inputs should enable selection");
});

testCase("the developer page exposes a persistent switch", () => {
  const pane = readFileSync(`${process.cwd()}/src/ui/settings/panes/DebugPane.tsx`, "utf8");
  assertion(pane.includes('t("Selectable interface text")'), "the developer page lacks the switch label");
  assertion(pane.includes("settings.general.select_ui_text"), "the switch does not read the setting");
  assertion(pane.includes("general: { ...settings.general, select_ui_text }"), "the switch does not write the setting");
});

testCase("Rust defaults the setting off and backfills old configurations", () => {
  const settings = readFileSync(`${process.cwd()}/src-tauri/src/settings/general.rs`, "utf8");
  assertion(settings.includes("pub select_ui_text: bool"), "Rust settings lacks the field");
  assertion(settings.includes("select_ui_text: false"), "the default is not off");
  assertion(settings.includes("!old.select_ui_text"), "old-config backfill is not tested");
});

testCase("the root data attribute overrides chrome selection rules", () => {
  const css = readFileSync(`${process.cwd()}/src/styles/app.css`, "utf8");
  assertion(
    /html\[data-ui-text-selectable="true"\] body,[\s\S]*?html\[data-ui-text-selectable="true"\] body \*\s*\{[^}]*user-select:\s*text\s*!important/s.test(css),
    "enabling the setting does not override user-select across the interface",
  );
});

testCase("standalone Preferences applies the selectable-text bridge", () => {
  const window = readFileSync(`${process.cwd()}/src/ui/SettingsWindow.tsx`, "utf8");
  assertion(
    window.includes("useSelectableUiText(settings"),
    "standalone Preferences does not apply the selectable-text setting",
  );
});

console.log(`\n${pass} passed, ${fail} failed`);
if (fail) process.exitCode = 1;
