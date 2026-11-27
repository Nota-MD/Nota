/**
 * Close-control contracts for dismissible bars.
 *
 * The tests verify appearance consistency, shared setters and menu grouping.
 * They do not replace a real React click test or visual CSS review.
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";

import { MENUS } from "@/ui/commands";

/* Minimal test harness shared with the source-contract tests. */

let pass = 0;
let fail = 0;
const failed: string[] = [];

function testCase(name: string, body3: () => void): void {
  try {
    body3();
    pass++;
    console.log(`  ✔ ${name}`);
  } catch (e) {
    fail++;
    failed.push(name);
    console.log(`  ✘ ${name}`);
    console.log(`      ${e instanceof Error ? e.message : String(e)}`);
  }
}

function group(name3: string): void {
  console.log(`\n[${name3}]`);
}

function equal(actual: unknown, expected: unknown, description: string): void {
  if (actual !== expected) {
    throw new Error(`${description}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
  }
}

function assertValue(condition: boolean, description: string): void {
  if (!condition) throw new Error(description);
}

/** Read a source file below `src/`. Paths resolve from the repository root. */
function read(...paragraph2: string[]): string {
  return readFileSync(join("src", ...paragraph2), "utf8");
}

/** Extract the complete `<button>` block carrying a particular class. */
function pickPressButton(source3: string, className: string): string {
  const place = source3.indexOf(`className="${className}"`);
  // Some buttons carry more than one class token.
  const position3 = place >= 0 ? place : source3.indexOf(className);
  if (position3 < 0) throw new Error(`class \`${className}\` was not found`);
  const start5 = source3.lastIndexOf("<button", position3);
  const end = source3.indexOf("</button>", position3);
  if (start5 < 0 || end < 0) throw new Error(`the <button> for class \`${className}\` could not be extracted`);
  return source3.slice(start5, end);
}

/** Count className strings containing a `close` token. */
function crossOfTokenNumber(source3: string): number {
  return (source3.match(/className="[^"]*\bclose\b[^"]*"/g) ?? []).length;
}

/* 1. Close controls use consistent markup. */

group("1. Dismissible bars have one consistent close control");

/** Current close-control surfaces. */
const twoColumns = [
  { name3: "status bar", textItem: ["ui", "StatusBar.tsx"], className: "statusbar-close", css: ["styles", "tabs-status.css"] },
] as const;

const sourceTable = new Map(twoColumns.map((bar) => [bar.className, read(...bar.textItem)]));

testCase("each dismissible surface has exactly one close class", () => {
  for (const bar of twoColumns) {
    equal(crossOfTokenNumber(sourceTable.get(bar.className)!), 1, `close-class count in the ${bar.name3}`);
  }
});

testCase("the retained status-bar close control uses the shared icon", () => {
  for (const bar of twoColumns) {
    const block = pickPressButton(sourceTable.get(bar.className)!, bar.className);
    assertValue(
      block.includes('name="nota-close-symbolic"'),
      `${bar.name3} close control does not use nota-close-symbolic:\n${block}`,
    );
  }
});

testCase("the status-bar title and aria-label use the same key", () => {
  for (const bar of twoColumns) {
    const block = pickPressButton(sourceTable.get(bar.className)!, bar.className);
    const notice = /title=\{t\("([^"]+)"\)\}/.exec(block);
    const ideaOutput = /aria-label=\{t\("([^"]+)"\)\}/.exec(block);
    if (!notice || !ideaOutput) throw new Error(`${bar.name3} close control lacks title or aria-label:\n${block}`);
    equal(ideaOutput[1], notice[1], `${bar.name3} close-control aria-label and title`);
  }
});

testCase("the status-bar close label remains translated", () => {
  const middleTextTable = read("i18n", "zh-ui.ts");
  const key: string[] = [];
  for (const bar of twoColumns) {
    const block = pickPressButton(sourceTable.get(bar.className)!, bar.className);
    const m = /title=\{t\("([^"]+)"\)\}/.exec(block);
    assertValue(!!m, `${bar.name3} close-control title could not be extracted`);
    key.push(m![1]);
    const translateText = new RegExp(`"${m![1].replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}":\\s*"([^"]+)"`).exec(middleTextTable);
    assertValue(!!translateText, `Chinese translations do not contain \`${m![1]}\``);
    assertValue(
      translateText![1].startsWith("收起"),
      `\`${m![1]}\` translates to ${JSON.stringify(translateText![1])}; close labels should use the same phrasing`,
    );
  }
  equal(new Set(key).size, 1, "status-bar close-key count");
});

testCase("the close class has a rule in its surface stylesheet", () => {
  for (const bar of twoColumns) {
    assertValue(
      read(...bar.css).includes(`.${bar.className}`),
      `${bar.css.join("/")} has no .${bar.className}; the close control is unstyled`,
    );
  }
});

/* 2. Every entry point uses the same state setter. */

group("2. Menu actions and close controls use the same setter");

const cellStyleBarSource = read("ui", "FormatBar.tsx");
const stateBarSource = sourceTable.get("statusbar-close")!;
const wiringSource = read("ui", "EditorArea.tsx");
const barFlagSource = read("ui", "useChromeVisibility.ts");
const commandTableSource = read("ui", "useCommandTable.ts");
const stateBarHookChildSource = read("ui", "useStatusBar.ts");
const appSource = read("App.tsx");

testCase("the formatting toolbar hides through the shared `view.toolbarNever` action", () => {
  assertValue(
    cellStyleBarSource.includes('id: "view.toolbarNever"'),
    "the More menu does not reuse `view.toolbarNever`",
  );
  assertValue(
    cellStyleBarSource.includes('label: "Hide the formatting toolbar"'),
    "the More menu lacks an explicit hide-toolbar label",
  );
  assertValue(!cellStyleBarSource.includes("onHide"), "the toolbar still has a second hide callback");
});

testCase("formatting-toolbar menu commands reach the App command table", () => {
  assertValue(
    wiringSource.includes("onMenuCommand={runMenuCommand}"),
    "`EditorArea.tsx` does not pass menu commands to `<FormatBar>`",
  );
  assertValue(
    wiringSource.includes("runMenuCommand: (id: string) => void;"),
    "the `EditorArea.tsx` wiring interface lacks `runMenuCommand`",
  );
  assertValue(
    appSource.includes("runMenuCommand: (id) => menuHandlers[id]?.()"),
    "`App.tsx` does not pass the menu-command table to the editor",
  );
  assertValue(
    commandTableSource.includes('"view.toolbarNever": () => setChrome({ toolbar: "never" })'),
    "`view.toolbarNever` does not reach the shared toolbar setter",
  );
});

testCase("the toolbar close path and `view.toolbarNever` use identical state", () => {
  assertValue(
    barFlagSource.includes('hideToolbar = useCallback(() => setChrome({ toolbar: "never" })'),
    "`hideToolbar` no longer uses `setChrome({ toolbar: \"never\" })`",
  );
  assertValue(
    commandTableSource.includes('"view.toolbarNever": () => setChrome({ toolbar: "never" })'),
    '`view.toolbarNever` no longer uses `setChrome({ toolbar: "never" })`; the entry points diverged',
  );
});

testCase("the status-bar close control only closes while the menu item toggles", () => {
  const block = pickPressButton(stateBarSource, "statusbar-close");
  assertValue(block.includes("onClick={onHide}"), `the status-bar close control is not wired to onHide:\n${block}`);
  assertValue(
    stateBarHookChildSource.includes("onHide: () => setUi({ show_status_bar: false })"),
    "`onHide` no longer uses `setUi({ show_status_bar: false })`",
  );
  assertValue(
    !/onHide:\s*\(\)\s*=>\s*setUi\(\{\s*show_status_bar:\s*!/.test(stateBarHookChildSource),
    "`onHide` uses a negated value and accidentally toggles",
  );
});

testCase("the status-bar close chain ends at `setChrome`", () => {
  assertValue(
    stateBarHookChildSource.includes("setUi: (patch: Partial<Settings[\"appearance\"]>) => void"),
    "`useStatusBar.ts` no longer accepts `setUi`",
  );
  assertValue(
    appSource.includes("setUi: setChrome"),
    "`App.tsx` does not pass `setChrome` as `setUi`, so the close control uses another setter",
  );
  assertValue(
    commandTableSource.includes('"view.statusBar": () => setChrome({ show_status_bar: !statusBarOpen })'),
    "`view.statusBar` changed and no longer shares `setChrome` with the close control",
  );
});

/* 3. Shell-visibility menu entries stay grouped. */

group("3. View-menu shell visibility entries stay adjacent");

/** Split a menu into sections at separator entries. */
function splitParagraph(items: readonly unknown[]): string[][] {
  const paragraph2: string[][] = [[]];
  for (const e of items) {
    if (e === "sep") {
      paragraph2.push([]);
      continue;
    }
    paragraph2[paragraph2.length - 1].push((e as { id: string }).id);
  }
  return paragraph2;
}

const viewMenu = MENUS.find((m) => m.id === "view");
assertValue(!!viewMenu, "`MENUS` has no menu with id `view`");
const viewSection = splitParagraph(viewMenu!.items);

testCase("shell visibility entries form one contiguous section", () => {
  const containsStateBar = viewSection.find((s) => s.includes("view.statusBar"));
  assertValue(!!containsStateBar, "`view.statusBar` is missing from the View menu");
  equal(
    JSON.stringify(containsStateBar),
    JSON.stringify(["view.toggleDock", "view.toolbar", "view.statusBar", "view.menuBar"]),
    "shell-visibility section contents",
  );
});

testCase("writing modes stay outside the shell-visibility section", () => {
  const containsStateBar = viewSection.find((s) => s.includes("view.statusBar"))!;
  for (const id of ["view.focusMode", "view.typewriter", "view.readOnly", "view.modeWysiwyg"]) {
    assertValue(
      !containsStateBar.includes(id),
      `\`${id}\` is in the shell-visibility section; a separator should keep writing modes separate`,
    );
  }
});

testCase("the sidebar group remains in its own section", () => {
  const containsSideBar = viewSection.find((s) => s.includes("view.toggleSidebar"))!;
  assertValue(!containsSideBar.includes("view.toggleDock"), "the separator between sidebar and dock disappeared");
  assertValue(!containsSideBar.includes("view.statusBar"), "the status bar moved into the sidebar section");
});

/* Cleanup. */

console.log(`\n${pass} passed, ${fail} failed`);
if (fail) {
  console.log(`Failed: ${failed.join(", ")}`);
  process.exitCode = 1;
}
