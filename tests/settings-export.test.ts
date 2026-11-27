/** Settings packages are not installers: selection, ZIP manifest, security and IPC wiring. */

import { readFileSync } from "node:fs";

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

function contains(text4: string, slice: string, description: string): void {
  assertValue(text4.includes(slice), `${description}: missing ${JSON.stringify(slice)}`);
}

const rust = readFileSync("src-tauri/src/settings_export.rs", "utf8");
const importRust = readFileSync("src-tauri/src/settings_import.rs", "utf8");
const importClassify = readFileSync("src-tauri/src/settings_import/classify.rs", "utf8");
const importFiles = readFileSync("src-tauri/src/settings_import/files.rs", "utf8");
const dialog = readFileSync("src/ui/settings/SettingsExportDialog.tsx", "utf8");
const importDialog = readFileSync("src/ui/settings/SettingsImportDialog.tsx", "utf8");
const settingsDialog = readFileSync("src/ui/settings/SettingsDialog.tsx", "utf8");
const general = readFileSync("src/ui/settings/panes/GeneralPane.tsx", "utf8");
const dialogCss = readFileSync("src/styles/settings-export.css", "utf8");
const ipc = readFileSync("src/bridge/ipc.ts", "utf8");
const lib = readFileSync("src-tauri/src/lib.rs", "utf8");

console.log("\n[Settings and data package]");

testCase("the package is a standard ZIP with a format manifest", () => {
  contains(rust, "ZipWriter", "ZIP writer");
  contains(rust, 'FORMAT: &str = "nota-settings-package"', "package format marker");
  contains(rust, '"manifest.json"', "manifest file");
  contains(rust, 'CompressionMethod::Deflated', "deflate compression");
});

testCase("program settings and extension settings or data are independently selectable", () => {
  contains(rust, '"settings"', "program settings");
  contains(rust, '"session"', "session");
  contains(rust, '"themes"', "theme assets");
  contains(rust, '"dictionaries"', "dictionaries");
  contains(rust, "pub settings: bool", "extension settings toggle");
  contains(rust, "pub data: bool", "extension data toggle");
  contains(dialog, 'part: "settings" | "data"', "frontend toggles settings and data separately");
});

testCase("sensitive items start unselected but remain manually selectable", () => {
  contains(dialog, "item.available && !item.sensitive", "sensitive items are excluded by default");
  contains(dialog, "Contains credentials", "the UI labels credentials explicitly");
  contains(rust, '"image-upload" => (SourceKind::File, "program/image-upload.toml", true)', "backend marks the item sensitive");
});

testCase("loading the inventory cannot overwrite checkbox toggles", () => {
  contains(dialog, "onErrorRef.current = onError", "callback ref");
  contains(dialog, "}, []);", "inventory loads only once");
  assertValue(!dialog.includes("}, [onError, t]);"), "inventory reload still resets selections");
});

testCase("standalone Preferences expands the settings package surface", () => {
  contains(settingsDialog, 'standalone ? "full" : openingWindowStyle === "full" ? "full" : "embedded"', "presentation mapping");
  contains(general, "presentation={settingsPresentation}", "general pane wiring");
  contains(dialog, 'presentation = "embedded"', "dialog default presentation");
  contains(dialogCss, '.settings-export-dialog[data-window-presentation="full"]', "full presentation styles");
  contains(dialogCss, "height: 100vh", "full presentation height");
});

testCase("directory export skips symlinks and dependency caches", () => {
  contains(rust, "ft.is_symlink()", "symlinks are skipped while measuring");
  contains(rust, "meta.file_type().is_symlink()", "symlinks are skipped while collecting");
  contains(rust, 'name == ".git" || name == "node_modules"', "dependency caches are skipped");
  contains(rust, "skipped_symlinks", "the manifest records skipped symlinks");
  contains(rust, "*skipped_symlinks += 1", "skipped symlinks are not counted");
});

testCase("settings package commands are registered and the suffix is not an installer", () => {
  contains(lib, "nota_settings_export_inventory", "inventory command");
  contains(lib, "nota_settings_export,", "export command");
  contains(ipc, 'invoke<SettingsExportInventory>("nota_settings_export_inventory")', "inventory IPC bridge");
  contains(dialog, ".nota-backup", "settings package suffix");
  assertValue(!dialog.toLowerCase().includes("installer.exe"), "the frontend still generates an installer name");
});

testCase("settings packages can be inspected and imported without trusting archive paths", () => {
  contains(lib, "nota_settings_import_inspect", "import inspection command");
  contains(lib, "nota_settings_import,", "import command");
  contains(ipc, 'invoke<SettingsPackageInventory>("nota_settings_import_inspect"', "inspection IPC bridge");
  contains(ipc, 'invoke<SettingsImportReport>("nota_settings_import"', "import IPC bridge");
  contains(importClassify, "normalize_archive_path", "archive path validation");
  contains(importFiles, "symbolic link", "symlink rejection");
  contains(importRust, "import-backups", "pre-import backup");
  contains(importRust, "self.rollback()", "rollback integration");
  contains(importDialog, "item.sensitive", "sensitive item handling");
  contains(general, "report.restart_required", "restart result");
});

console.log(`\n${pass} passed, ${fail} failed`);
if (fail > 0) process.exitCode = 1;
