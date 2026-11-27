/** Settings selects are theme-controlled comboboxes instead of native select elements. */

import { readFileSync } from "node:fs";

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

function assertValue(value: unknown, message: string): asserts value {
  if (!value) throw new Error(message);
}

const primitives = readFileSync("src/ui/settings/primitives.tsx", "utf8");
const controls = readFileSync("src/styles/settings-controls.css", "utf8");
const theme = readFileSync("src/styles/theme/base.css", "utf8");
const modalTrap = readFileSync("src/ui/useModalTrap.ts", "utf8");
const pluginPane = readFileSync("src/ui/settings/panes/PluginSettingsPane.tsx", "utf8");
const pluginState = readFileSync("src/ui/usePlugins.ts", "utf8");

console.log("\n[Custom settings select]");

testCase("Select no longer renders a native select", () => {
  const selectStart = primitives.indexOf("export function Select");
  const toggleStart = primitives.indexOf("export function Toggle", selectStart);
  const component = primitives.slice(selectStart, toggleStart);
  assertValue(selectStart >= 0 && toggleStart > selectStart, "Select component bounds were not found");
  assertValue(!component.includes("<select"), "Select still renders a native select");
  assertValue(!component.includes("<option"), "Select still renders native options");
  assertValue(component.includes('role="combobox"'), "the trigger lacks combobox semantics");
  assertValue(component.includes('role="listbox"'), "the popup lacks listbox semantics");
  assertValue(component.includes('role="option"'), "options lack option semantics");
});

testCase("the custom select preserves portal, controlled value, disabled state and keyboard input", () => {
  const selectStart = primitives.indexOf("export function Select");
  const toggleStart = primitives.indexOf("export function Toggle", selectStart);
  const component = primitives.slice(selectStart, toggleStart);
  assertValue(component.includes("createPortal("), "the list is not portaled and can be clipped by scrollers");
  assertValue(component.includes("onChange(option.value)"), "choosing an option does not update the controlled value");
  assertValue(component.includes('"ArrowDown"'), "ArrowDown is missing");
  assertValue(component.includes('"ArrowUp"'), "ArrowUp is missing");
  assertValue(component.includes('"Home"'), "Home is missing");
  assertValue(component.includes('"End"'), "End is missing");
  assertValue(component.includes('"Escape"'), "Escape is missing");
  assertValue(component.includes("typeaheadRef"), "first-letter navigation is missing");
  assertValue(
    component.includes("popup.scrollTop") && component.includes("getBoundingClientRect()"),
    "keyboard navigation does not scroll the popup when the active option leaves view",
  );
  assertValue(
    component.includes("contentWidth") &&
      component.includes("option.label.length") &&
      component.includes('document.createElement("span")'),
    "the popup does not expand to the longest option",
  );
  assertValue(
    primitives.includes("OWN_CONTROLS") && primitives.includes("  Select,"),
    "SettingRow no longer treats Select as a labelable control",
  );
  assertValue(
    modalTrap.includes('[role="combobox"][aria-haspopup="listbox"][aria-expanded="true"]'),
    "Escape bypasses the open select and closes Settings",
  );
});

testCase("trigger, popup, active and selected states are controlled by theme CSS", () => {
  for (const selector of [
    ".stg-select-trigger",
    ".stg-select-popup",
    ".stg-select-option",
    '.stg-select-option[data-active="true"]',
    '.stg-select-option[aria-selected="true"]',
  ]) {
    assertValue(controls.includes(selector), `CSS is missing ${selector}`);
  }
  for (const variable of [
    "--select-bg",
    "--select-fg",
    "--select-popup-bg",
    "--select-popup-fg",
    "--select-option-hover-bg",
    "--select-option-selected-bg",
    "--select-option-selected-fg",
  ]) {
    assertValue(theme.includes(variable), `theme variable is missing ${variable}`);
  }
  assertValue(!controls.includes(".stg-select-native"), "legacy native select styles remain");
});

testCase("extension settings can render command-backed selects", () => {
  assertValue(
    pluginPane.includes('setting.kind === "select"') &&
      pluginPane.includes("<SelectManager"),
    "plugin setting selects do not render their list manager",
  );
  assertValue(
    pluginPane.includes("if (setting.options.length === 0) return null;"),
    "a select with missing management commands can disappear entirely",
  );
  assertValue(
    pluginPane.includes("plugin-setting-manager-delete") &&
      pluginPane.includes('name="nota-delete-symbolic"') &&
      pluginPane.includes("New persona"),
    "the persona list lacks edit, delete or create affordances",
  );
  assertValue(
    pluginState.includes('setting.kind === "select"') &&
      pluginState.includes("if (refreshOptions) await heavyPull()"),
    "select changes do not refresh command-backed options and values",
  );
});

console.log(`\n${pass} passed, ${fail} failed`);
if (fail > 0) process.exitCode = 1;
