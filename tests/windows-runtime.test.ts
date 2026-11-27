/** Independent windows and on-demand entry points on Windows/WebView2. */

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

function contains(text: string, part: string, description: string): void {
  if (!text.includes(part)) throw new Error(`${description}: missing ${JSON.stringify(part)}`);
}

function assertValue(value: unknown, message: string): asserts value {
  if (!value) throw new Error(message);
}

const read = (path: string) => readFileSync(path, "utf8");

console.log("\n[Windows runtime entry points]");

testCase("Utility windows use dedicated HTML entries", () => {
  for (const [path, marker] of [
    ["focus-alarm.html", 'data-window="focus-alarm"'],
  ]) {
    const html = read(path);
    contains(html, marker, path);
    contains(html, 'src="/src/main.tsx"', `${path} shared frontend entry`);
  }
  const debugLog = read("debug-log.html");
  contains(debugLog, 'data-window="debug-log"', "debug-log.html");
  contains(debugLog, 'src="/src/debug-log.tsx"', "lightweight debug-log entry");
  contains(read("src/debug-log.tsx"), "<DebugLogWindow />", "debug-log entry mount");
  const settings = read("settings.html");
  contains(settings, 'data-window="settings"', "settings.html");
  contains(settings, 'src="/src/settings-window.tsx"', "lightweight settings entry");
  contains(read("src/settings-window.tsx"), "<SettingsWindow />", "settings entry mount");
  const about = read("about.html");
  contains(about, 'data-window="about"', "about.html");
  contains(about, 'src="/src/about-window.tsx"', "lightweight About entry");
  contains(read("src/about-window.tsx"), "<AboutWindow />", "About entry mount");
  contains(
    read("src/ui/useDocThemeInventory.ts"),
    "useEffect(() => {",
    "utility windows do not scan document themes",
  );
  contains(
    read("src/ui/SettingsWindow.tsx"),
    "api.frontendReady()",
    "standalone Settings does not start the extension discovery handshake",
  );
  const windowCommand = read("src-tauri/src/commands/window.rs");
  const runtime = read("src-tauri/src/lib.rs");
  const host = read("src-tauri/src/window_host.rs");
  for (const role of ["Editor", "Settings", "About", "DebugLog"]) {
    contains(host, role, `shared window role is missing ${role}`);
  }
  contains(
    host,
    "Self::About => (420.0, 500.0)",
    "About window has no dedicated minimum height",
  );
  contains(host, "READY_ENV", "utility windows lack the ready handshake");
  contains(host, "READY_TIMEOUT", "utility windows lack a ready timeout");
  contains(host, "NOTA_WINDOW_ROLE", "utility windows lack an environment role fallback");
  contains(host, "background_command", "the shared window module does not use the background launcher");
  contains(windowCommand, "window_host::launch(WindowRole::Settings", "the Settings command bypasses the shared window module");
  contains(
    read("src/ui/useSettingsWindow.ts"),
    "if (openingExternal.current) return;",
    "rapid Settings commands can spawn duplicate windows",
  );
  const hostSource = read("src-tauri/src/window_host.rs");
  assertValue(
    hostSource.indexOf("settings_window_host::focus_existing()") <
      hostSource.indexOf("let program = std::env::current_exe()"),
    "opening Settings does not focus an existing Settings process first",
  );
  assertValue(
    runtime.indexOf("if standalone_settings_window {") <
      runtime.indexOf("crate::debug_log!(\"[nota] debug mode enabled"),
    "direct Settings launches do not focus an existing window before boot",
  );
  contains(windowCommand, "window_host::launch(WindowRole::About", "the About command bypasses the shared window module");
  contains(windowCommand, "window_host::launch(WindowRole::DebugLog", "the log command bypasses the shared window module");
  contains(windowCommand, "window_host::launch(WindowRole::Editor", "new editor windows bypass the shared module");
  if (windowCommand.includes("WebviewWindowBuilder")) {
    throw new Error("utility-window commands still create WebviewWindow directly");
  }
  contains(
    windowCommand,
    "pub fn nota_window_prepare_settings(_app: tauri::AppHandle)",
    "Windows Settings prewarm is not a no-op",
  );
  contains(
    windowCommand,
    "pub fn nota_window_prepare_about(_app: tauri::AppHandle)",
    "Windows About prewarm is not a no-op",
  );
  contains(runtime, "window_host::current_role", "the runtime does not read the shared window role");
  contains(runtime, "window_host::signal_ready", "child pages do not report ready");
  contains(
    runtime,
    "role.page()",
    "child processes do not select a page by window role",
  );
  if (runtime.includes("index.html?settings=1")) {
    throw new Error("the Settings process still boots the full editor page");
  }
  contains(
    runtime,
    "standalone_settings_window",
    "the Settings process has no minimal initialization branch",
  );
  contains(
    runtime,
    'PathBuf::from("nota-settings-webview")',
    "the Settings child shares WebView2 data with the main process",
  );
  contains(
    runtime,
    'utility_window && window.label() == "main"',
    "the native close button does not exit the Settings process",
  );
  contains(read("src-tauri/src/settings_watch.rs"), "settings reloaded from external window", "Settings changes do not synchronize back to the main process");
  const alarm = read("src-tauri/src/focus/alarm.rs");
  contains(alarm, 'WebviewUrl::App("focus-alarm.html"', "the alarm window must not depend on a fragment");
});

testCase("the main entry reads the HTML marker before the legacy hash", () => {
  const main = read("src/main.tsx");
  contains(main, "document.documentElement.dataset.window", "standalone entry marker");
  contains(main, 'windowEntry === "focus-alarm"', "alarm entry");
});

testCase("dynamic modules use relative URLs and avoid Vite preload wrappers", () => {
  const vite = read("vite.config.ts");
  contains(vite, 'base: "./"', "relative asset base");
  contains(vite, "modulePreload: false", "unstable modulepreload is disabled");
  for (const entry of ["main", "about", "settings", "debugLog", "focusAlarm"]) {
    contains(vite, `${entry}:`, `multi-page entry ${entry}`);
  }
  if (vite.includes("help: fileURLToPath")) throw new Error("the help page is still built");
});

testCase("the Windows portable build uses an unelevated launcher and keeps updater entry", () => {
  const launcher = read("tools/windows-portable-launcher.c");
  const manifest = read("tools/windows-portable-launcher.manifest");
  const resources = read("tools/windows-portable-launcher.rc");
  const recipe = read("tools/make-windows-portable.sh");
  contains(launcher, "CreateProcessW", "the portable launcher does not start Nota");
  contains(manifest, 'requestedExecutionLevel level="asInvoker"', "the portable launcher requests elevation");
  contains(resources, 'src-tauri/icons/icon.ico', "the portable launcher lacks the Nota icon");
  contains(recipe, "windows-portable-launcher.c", "the build script does not use the custom launcher");
  contains(recipe, "NOTA_BUILD_ID", "the build script does not generate a portable cache id");
  const updateManifest = read("tools/make-update-manifest.mjs");
  contains(updateManifest, "_x64-portable\\.(?:exe|zip)", "the update manifest does not recognize the portable EXE");
});

testCase("diagnostic console build tails the shared log from an independent process", () => {
  const cargo = read("src-tauri/Cargo.toml");
  const main = read("src-tauri/src/main.rs");
  contains(cargo, "diagnostic-console = []", "diagnostic build feature");
  contains(main, "Get-Content -LiteralPath", "live log console");
  contains(main, '"-NoExit"', "console remains open after startup");
  contains(main, "set_debug_mode(true)", "diagnostic build does not enable full logging");
  contains(main, '"--settings-window"', "utility children would spawn extra consoles");
});

testCase("Linux GTK4 dialog helper keeps a Windows-targetable entry point", () => {
  const helper = read("src-tauri/src/bin/nota-gtk4-dialogs.rs");
  contains(helper, '#[cfg(target_os = "linux")]', "GTK4 implementation is not Linux-gated");
  contains(
    helper,
    '#[cfg(not(target_os = "linux"))]\nfn main()',
    "Windows compilation would produce a crate without main",
  );
});

console.log(`\n${pass} passed, ${fail} failed`);
if (fail) process.exitCode = 1;
