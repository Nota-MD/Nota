/**
 * Every modal dialog must expose the same top-right close control.
 *
 * Visual review is insufficient: Escape and backdrop clicks can hide a missing
 * close button without an error. Check each dialog implementation by contract.
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";

let pass = 0;
let fail = 0;

function testCase(name: string, body3: () => void): void {
  try {
    body3();
    pass++;
    console.log(`  ✔ ${name}`);
  } catch (e) {
    fail++;
    console.log(`  ✘ ${name}`);
    console.log(`      ${e instanceof Error ? e.message : String(e)}`);
  }
}

function assertValue(value2: unknown, description: string): asserts value2 {
  if (!value2) throw new Error(description);
}

const dialog = [
  "src/ui/AboutDialog.tsx",
  "src/ui/ConfirmDialog.tsx",
  "src/ui/EmojiDialog.tsx",
  "src/ui/FilePickerDialog.tsx",
  "src/ui/FocusSummaryDialog.tsx",
  "src/ui/ImageDialog.tsx",
  "src/ui/LicenseDialog.tsx",
  "src/ui/LinkDialog.tsx",
  "src/ui/PandocPanel.tsx",
  "src/ui/PromptDialog.tsx",
  "src/ui/settings/SettingsDialog.tsx",
  "src/ui/settings/SettingsExportDialog.tsx",
];

console.log("\n[Dialog close controls]");

testCase("every modal dialog renders DialogClose", () => {
  for (const path of dialog) {
    const source3 = readFileSync(join(process.cwd(), path), "utf8");
    assertValue(
      source3.includes('from "@/ui/DialogClose"') && source3.includes("<DialogClose"),
      `${path} does not import and render DialogClose`,
    );
  }
});

testCase("DialogClose has an accessible name, tooltip and shared icon", () => {
  const source3 = readFileSync(join(process.cwd(), "src/ui/DialogClose.tsx"), "utf8");
  assertValue(source3.includes('aria-label={t("Close")}'), "aria-label is missing");
  assertValue(source3.includes('title={t("Close")}'), "title is missing");
  assertValue(source3.includes('name="nota-close-symbolic"'), "the shared close icon is missing");
  assertValue(source3.includes("size={16}"), "the close icon is not 16px");
});

testCase("standalone dialog shells provide positioning context for absolute close buttons", () => {
  const overlay = readFileSync(join(process.cwd(), "src/styles/overlay.css"), "utf8");
  const close = readFileSync(join(process.cwd(), "src/styles/dialog-close.css"), "utf8");
  const picker = readFileSync(join(process.cwd(), "src/styles/file-picker.css"), "utf8");
  const settings = readFileSync(join(process.cwd(), "src/styles/settings.css"), "utf8");
  const shape = readFileSync(join(process.cwd(), "src/styles/theme/shape.css"), "utf8");
  assertValue(/\.confirm-dialog\s*\{[^}]*position:\s*relative/s.test(overlay), "confirm dialog lacks position");
  assertValue(/\.file-picker\s*\{[^}]*position:\s*relative/s.test(picker), "file picker lacks position");
  assertValue(/\.settings-shell\s*\{[^}]*position:\s*relative/s.test(settings), "settings shell lacks position");
  assertValue(/\.dialog-close\s*\{[^}]*position:\s*absolute/s.test(close), "the close button is not absolute");
  assertValue(/\.dialog-close\s*\{[^}]*width:\s*var\(--dialog-close-size\)/s.test(close), "close-button size is not theme-controlled");
  assertValue(/\.dialog-close\s*\{[^}]*border-radius:\s*var\(--dialog-close-radius\)/s.test(close), "close-button radius is not theme-controlled");
  assertValue(/\[data-ui-style="adwaita"\]\s*\{[^}]*--dialog-close-radius:\s*999px/s.test(shape), "Adwaita lacks a round close control");
  assertValue(/\[data-ui-style="windows10"\]\s*\{[^}]*--dialog-close-radius:\s*0/s.test(shape), "Windows 10 lacks a square close control");
  assertValue(/\.dialog-close:focus-visible\s*\{[^}]*outline:\s*2px solid var\(--accent\)/s.test(close), "the close button lacks a focus ring");
});

console.log(`\n${pass} passed, ${fail} failed`);
if (fail > 0) process.exitCode = 1;
