/** First-run guide contract. */

import { readFileSync } from "node:fs";
import { join } from "node:path";

let passed = 0;
let failed = 0;

function test(name: string, body: () => void): void {
  try {
    body();
    passed += 1;
    console.log(`  ok ${name}`);
  } catch (error) {
    failed += 1;
    console.log(`  FAIL ${name}`);
    console.log(`       ${error instanceof Error ? error.message : String(error)}`);
  }
}

function assert(value: unknown, message: string): asserts value {
  if (!value) throw new Error(message);
}

function source(path: string): string {
  return readFileSync(join(process.cwd(), path), "utf8");
}

console.log("\n[First-run guide]");

test("settings default to unseen and deserialize old files", () => {
  const rust = source("src-tauri/src/settings/general.rs");
  assert(rust.includes("pub onboarding_seen: bool"), "missing persisted flag");
  assert(rust.includes("onboarding_seen: false"), "first run must default to unseen");
  assert(rust.includes("old.onboarding_seen"), "missing old-settings regression");
});

test("startup waits for the native window to be shown", () => {
  const startup = source("src/ui/useStartup.ts");
  const unseen = startup.indexOf("if (!s.general.onboarding_seen)");
  const shown = startup.indexOf('dataset.windowShown === "true"', unseen);
  const event = startup.indexOf('"nota-window-shown"', unseen);
  assert(unseen >= 0, "startup does not check the first-run flag");
  assert(shown > unseen && event > unseen, "guide does not wait for reveal");
});

test("guide stays compact at three pages", () => {
  const guide = source("src/ui/FirstRunGuide.tsx");
  assert(guide.includes("const pageCount = 3"), "guide must stay at three pages");
  assert(guide.includes('t("Formatting appears in place while you type.")'), "missing feature page");
  assert(guide.includes('t("A short notice")'), "missing notice page");
  assert(guide.includes('t("License and third-party notices")'), "missing license page");
});

test("notice page embeds the proofread Chinese text and an English translation", () => {
  const guide = source("src/ui/FirstRunGuide.tsx");
  const zh = source("src/ui/first-run-notice.zh.html");
  const en = source("src/ui/first-run-notice.en.html");
  const css = source("src/styles/overlay.css");
  assert(guide.includes("first-run-notice.zh.html?raw"), "Chinese notice is not bundled");
  assert(guide.includes("first-run-notice.en.html?raw"), "English notice is not bundled");
  assert(guide.includes("uiLanguage.startsWith(\"zh\")"), "notice does not follow UI language");
  assert(
    guide.includes("dangerouslySetInnerHTML") && guide.includes('role="document"'),
    "notice is not rendered as embedded HTML",
  );
  assert(zh.includes("<h1"), "missing Chinese notice title");
  assert(zh.includes("作者仍是一名初中生"), "Chinese notice is not the proofread version");
  assert(zh.includes("<pre"), "Chinese license block is not semantic HTML");
  assert(!zh.includes("```"), "raw Markdown fence leaked into the Chinese notice");
  assert(en.includes("<h1"), "missing English notice title");
  assert(en.includes("the author is still a junior-high student"), "English notice is truncated");
  assert(en.includes("<ul>"), "English notice lost its semantic list");
  assert(!en.includes("```"), "raw Markdown fence leaked into the English notice");
  assert(css.includes(".first-run-notice-text"), "notice text box has no layout");
  assert(css.includes(".first-run-notice-text h1"), "embedded notice HTML has no typography");
});

test("license opens inside the guide", () => {
  const guide = source("src/ui/FirstRunGuide.tsx");
  assert(guide.includes("LicenseDialog"), "guide does not reuse the in-app license view");
  assert(guide.includes("setLicenseOpen(true)"), "license button is not connected");
});

test("dismissal persists the one-time marker", () => {
  const app = source("src/App.tsx");
  const dialogs = source("src/ui/AppDialogs.tsx");
  assert(app.includes("onboarding_seen: true"), "dismissal does not persist");
  assert(dialogs.includes("firstRunSeen"), "dialogs do not receive the seen state");
  assert(dialogs.includes("onFirstRunDone"), "dialogs cannot commit dismissal");
});

test("About can reopen the guide", () => {
  const about = source("src/ui/AboutDialog.tsx");
  const dialogs = source("src/ui/AppDialogs.tsx");
  assert(about.includes("onOpenGuide"), "About has no guide entry point");
  assert(dialogs.includes("openFirstRun()"), "About cannot open the first-run guide");
});

test("all user-facing guide strings have Chinese translations", () => {
  const guide = source("src/ui/FirstRunGuide.tsx");
  const translations = source("src/i18n/zh-ui.ts");
  const keys = Array.from(guide.matchAll(/\bt\("([^"]+)"/g), (match) => match[1]).filter(
    (key): key is string => Boolean(key),
  );
  for (const key of new Set(keys)) {
    assert(translations.includes(`"${key}"`), `missing Chinese translation: ${key}`);
  }
});

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) process.exitCode = 1;
