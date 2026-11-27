import { readFileSync } from "node:fs";

import type { DocThemeInfo } from "@/bridge/ipc";
import {
  collectCommandPaletteEntries,
  firstEnabledCommand,
  nextEnabledCommand,
  searchCommandPalette,
} from "@/ui/command-palette";
import type { MenuSpec } from "@/ui/commands";

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

function equal(actual: unknown, expected: unknown, message: string): void {
  if (actual !== expected) {
    throw new Error(`${message}: expected ${String(expected)}, got ${String(actual)}`);
  }
}

const read = (path: string) => readFileSync(path, "utf8");

const menus: MenuSpec[] = [
  {
    id: "file",
    label: "File",
    items: [
      { id: "file.command", label: "Command" },
      { id: "file.save", label: "Save", accel: "Ctrl+S" },
      {
        id: "file.export",
        label: "Export",
        submenu: [{ id: "file.exportPdf", label: "PDF", needsDoc: true }],
      },
      { id: "file.save", label: "Duplicate Save", accel: "Ctrl+S" },
    ],
  },
  {
    id: "theme",
    label: "Theme",
    items: [],
    dynamic: "themes",
  },
];

const themes: DocThemeInfo[] = [{ id: "night", name: "Night", builtin: false }];

console.log("\n[Command palette]");

testCase("collects nested leaves, deduplicates ids and includes themes", () => {
  const entries = collectCommandPaletteEntries({
    menus,
    disabled: new Set(["file.exportPdf"]),
    checks: {},
    themes,
    currentTheme: "night",
  });
  const save = entries.filter((entry) => entry.id === "file.save");
  equal(save.length, 1, "duplicate command ids should be collapsed");
  assert(entries.some((entry) => entry.id === "file.command" && entry.title === "Command"), "command label");
  const pdf = entries.find((entry) => entry.id === "file.exportPdf");
  assert(pdf, "nested command missing");
  equal(pdf.group, "File / Export", "nested group");
  equal(pdf.disabled, true, "disabled state");
  const night = entries.find((entry) => entry.id === "__theme:night");
  assert(night, "theme command missing");
  equal(night.checked, true, "current theme check");
});

testCase("search ranks titles and still matches ids and subsequences", () => {
  const entries = collectCommandPaletteEntries({
    menus,
    disabled: new Set(),
    checks: {},
    themes,
    currentTheme: "",
  });
  equal(searchCommandPalette(entries, "save")[0]?.id, "file.save", "title search");
  equal(searchCommandPalette(entries, "exportPdf")[0]?.id, "file.exportPdf", "id search");
  equal(searchCommandPalette(entries, "exppdf")[0]?.id, "file.exportPdf", "subsequence search");
  equal(searchCommandPalette(entries, "missing").length, 0, "missing query");
});

testCase("keyboard navigation skips disabled commands and wraps", () => {
  const entries = collectCommandPaletteEntries({
    menus: [
      {
        id: "test",
        label: "Test",
        items: [
          { id: "one", label: "One" },
          { id: "two", label: "Two" },
          { id: "three", label: "Three" },
        ],
      },
    ],
    disabled: new Set(["two"]),
    checks: {},
    themes: [],
    currentTheme: "",
  });
  equal(firstEnabledCommand(entries), 0, "first enabled");
  equal(nextEnabledCommand(entries, 0, 1), 2, "forward skip");
  equal(nextEnabledCommand(entries, 2, 1), 0, "wrap forward");
  equal(nextEnabledCommand(entries, 0, -1), 2, "wrap backward");
});

testCase("shortcut, handler, overlay and translations are wired", () => {
  const commands = read("src/ui/commands.ts");
  const commandTable = read("src/ui/useCommandTable.ts");
  const app = read("src/App.tsx");
  const dialogs = read("src/ui/AppDialogs.tsx");
  const palette = read("src/ui/CommandPalette.tsx");
  const paletteCss = read("src/styles/command-palette.css");
  const translations = read("src/i18n/zh-ui.ts");
  equal(
    [...commands.matchAll(/accel:\s*"Ctrl\+Shift\+P"/g)].length,
    1,
    "command palette shortcut should be unique",
  );
  assert(commands.includes('"file.commandPalette"'), "menu entry missing");
  assert(commandTable.includes('"file.commandPalette": openCommandPalette'), "handler missing");
  assert(app.includes("openCommandPalette: dialog.openCommandPalette"), "app wiring missing");
  assert(app.includes("dialog.commandPaletteOpen"), "floating-layer wiring missing");
  assert(dialogs.includes("<CommandPalette"), "overlay missing");
  assert(palette.includes('entry.id !== "file.commandPalette"'), "palette can recursively reopen itself");
  assert(translations.includes('"Command Palette…"'), "Chinese menu translation missing");
  assert(
    /\.command-palette-input\s*\{[^}]*box-sizing:\s*border-box/s.test(paletteCss),
    "command palette input padding is included outside its width",
  );
});

console.log(`\nCommand palette: ${passed} passed, ${failed} failed`);
if (failed > 0) process.exitCode = 1;
