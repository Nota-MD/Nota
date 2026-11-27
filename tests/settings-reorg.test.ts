/** Settings information architecture and developer-mode contracts. */

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

function read(...paragraph2: string[]): string {
  return readFileSync(join(...paragraph2), "utf8");
}

console.log("\n[Settings organization]");

testCase("extension management and extension settings are separate pages", () => {
  const dialog = read("src", "ui", "settings", "SettingsDialog.tsx");
  assertValue(dialog.includes('| "pluginSettings"'), "pluginSettings page is missing");
  assertValue(dialog.includes('pluginSettings: t("Extension Settings")'), "extension settings has no page label");
  assertValue(dialog.includes('extensions: t("Extension Management")'), "extension management has no page label");
  assertValue(dialog.includes("<PluginSettingsPane"), "extension settings page is not wired");
  assertValue(dialog.includes("<ExtensionsPane"), "extension management page is not wired");
});

testCase("extension cards stack controls below descriptive content", () => {
  const extensions = read("src", "ui", "settings", "panes", "ExtensionsPane.tsx");
  const primitives = read("src", "ui", "settings", "primitives.tsx");
  const styles = read("src", "styles", "settings.css");
  assertValue(extensions.includes('layout="stacked"'), "extension rows still use side-by-side controls");
  assertValue(primitives.includes('data-layout={layout}'), "stacked setting-row layout is not rendered");
  assertValue(
    styles.includes('.stg-row[data-layout="stacked"] .stg-row-control'),
    "stacked extension rows have no layout rule",
  );
});

testCase("standalone settings confirms destructive actions with Nota dialogs", () => {
  const window = read("src", "ui", "SettingsWindow.tsx");
  assertValue(!window.includes("window.confirm"), "standalone settings still opens the WebView confirm dialog");
  assertValue(window.includes("<ConfirmDialog"), "standalone settings has no in-app confirm dialog");
  assertValue(window.includes("askConfirm({"), "destructive actions do not use the shared confirmation path");
});

testCase("developer mode appears only when enabled and the empty advanced page is gone", () => {
  const dialog = read("src", "ui", "settings", "SettingsDialog.tsx");
  assertValue(
    dialog.includes('debugMode ? [...ORDER, "debug"] : ORDER'),
    "the developer page is not gated by developer mode",
  );
  assertValue(!dialog.includes("AdvancedPane"), "the old advanced settings page is still wired");
  const general = read("src", "ui", "settings", "panes", "GeneralPane.tsx");
  assertValue(!general.includes("debug_mode"), "the General page still exposes a debug switch");
  assertValue(general.includes("onResetSettings"), "the General page lacks factory reset");
});

testCase("five version clicks toggle developer mode", () => {
  const about = read("src", "ui", "AboutDialog.tsx");
  assertValue(about.includes("versionClicks"), "version click counting is missing");
  assertValue(about.includes("length < 5"), "the five-click threshold is missing");
  assertValue(about.includes("onSetDebugMode"), "the debug-mode callback is missing");
});

testCase("download replacement rules live on the General page", () => {
  const general = read("src", "ui", "settings", "panes", "GeneralPane.tsx");
  assertValue(general.includes("settings.download.replacements"), "download replacement input is missing");
});

testCase("Developer mode owns diagnostics, config access and disabling the mode", () => {
  const debug = read("src", "ui", "settings", "panes", "DebugPane.tsx");
  assertValue(debug.includes("debug_mode: false"), "there is no way to disable developer mode");
  assertValue(debug.includes("openDebugLog"), "the debug log entry is missing");
  assertValue(debug.includes("onOpenConfigDir"), "the config-directory entry is missing");
});

testCase("application and extension updates both use replacement rules", () => {
  const remote = read("src-tauri", "src", "remote.rs");
  const appUpdate = read("src-tauri", "src", "update.rs");
  const pluginUpdate = read("src-tauri", "src", "plugin", "updater.rs");
  assertValue(remote.includes("settings::download::rewrite_address"), "the download layer does not apply replacement rules");
  assertValue(appUpdate.includes("replacements"), "application updates do not pass replacement rules");
  assertValue(pluginUpdate.includes("replacements"), "extension updates do not pass replacement rules");
});

testCase("debug settings dynamically control the backend log gate", () => {
  const settings = read("src-tauri", "src", "commands", "settings.rs");
  const logs = read("src-tauri", "src", "log.rs");
  assertValue(settings.includes("log::set_debug_mode"), "saving settings does not synchronize the log gate");
  assertValue(logs.includes("pub fn set_debug_mode"), "the log module has no runtime switch");
});

testCase("workspace commands synchronize in-memory state", () => {
  const workspace = read("src-tauri", "src", "commands", "workspace.rs");
  assertValue(
    workspace.includes("*state.workspace.lock().unwrap() = Some(canonical.clone())"),
    "opening a workspace does not update in-memory state",
  );
  assertValue(
    workspace.includes("*state.workspace.lock().unwrap() = None"),
    "closing a workspace does not clear in-memory state",
  );
});

testCase("Lua hot reload is an opt-in developer setting", () => {
  const debug = read("src", "ui", "settings", "panes", "DebugPane.tsx");
  const general = read("src-tauri", "src", "settings", "general.rs");
  const settings = read("src-tauri", "src", "commands", "settings.rs");
  const watcher = read("src-tauri", "src", "plugin", "watch.rs");
  assertValue(debug.includes('t("Lua extension auto-reload")'), "developer pane is missing the hot-reload switch");
  assertValue(debug.includes("settings.general.lua_hot_reload"), "switch does not write the setting");
  assertValue(general.includes("pub lua_hot_reload: bool"), "Rust setting field is missing");
  assertValue(general.includes("lua_hot_reload: false"), "hot reload is not disabled by default");
  assertValue(settings.includes("previous.general.debug_mode && previous.general.lua_hot_reload"), "developer mode is not part of listener control");
  assertValue(settings.includes("watch.set_enabled(app, lua_hot_reload)"), "settings do not control the listener");
  assertValue(watcher.includes("host.reload_dir(&dir)"), "watcher is not connected to transactional reload");
});

testCase("the extension master switch hides entries, stops runtime work and preserves install state", () => {
  const general = read("src", "ui", "settings", "panes", "GeneralPane.tsx");
  assertValue(general.includes('t("Enable extensions")'), "the General page lacks the extension master switch");
  assertValue(general.includes("settings.general.extensions_enabled"), "the master switch is not connected to settings");

  const dialog = read("src", "ui", "settings", "SettingsDialog.tsx");
  assertValue(dialog.includes("extensionsEnabled ||"), "settings pages are not gated by the master switch");
  assertValue(dialog.includes('id !== "pluginSettings"'), "extension settings remains visible when disabled");
  assertValue(dialog.includes('id !== "extensions"'), "extension management remains visible when disabled");

  const plugins = read("src", "ui", "usePlugins.ts");
  assertValue(plugins.includes("if (!extensionsEnabled)"), "disabling extensions does not clear runtime state");
  assertValue(plugins.includes("withPluginDock(MENUS, extensionsEnabled ? menuItems : [], extensionsEnabled)"), "extension menus are not gated");
  assertValue(plugins.includes("useEditorInput(extensionsEnabled ? plugins : [])"), "editor input adapters remain active when extensions are disabled");

  const app = read("src", "App.tsx");
  assertValue(
    app.includes("{extensionsEnabled && (") && app.includes("open={dockOpen}"),
    "the extension dock can still render while extensions are disabled",
  );
  assertValue(app.includes("showDock={extensionsEnabled}"), "the dock entry remains visible when extensions are disabled");

  const host = read("src-tauri", "src", "plugin", "mod.rs");
  assertValue(host.includes("pub fn set_extensions_enabled"), "the host has no global extension switch");
  assertValue(host.includes("self.extensions_enabled && self.installed.is_enabled(id)"), "the master switch is not part of callability");
  assertValue(
    host.includes("LuaPlugin::disabled(manifest, &self.base.application_language)"),
    "disabling extensions does not unload Lua states",
  );
  assertValue(host.includes("self.installed.is_enabled(&id)"), "re-enabling does not restore the saved enabled state");

  const settings = read("src-tauri", "src", "settings", "general.rs");
  assertValue(settings.includes("extensions_enabled: true"), "extensions do not default to enabled");
});

if (fail > 0) {
  console.error(`\n${fail} failed`);
  process.exitCode = 1;
} else {
  console.log(`\n${pass} passed, 0 failed`);
}
