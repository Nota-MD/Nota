/** Update settings and interactive notification contracts. */

import { readFileSync } from "node:fs";
import { join } from "node:path";

let pass = 0;
let fail = 0;

function testCase(name3: string, body3: () => void): void {
  try {
    body3();
    pass += 1;
    console.log(`  ✔ ${name3}`);
  } catch (error) {
    fail += 1;
    console.log(`  ✘ ${name3}`);
    console.log(`      ${error instanceof Error ? error.message : String(error)}`);
  }
}

function assertValue(value2: unknown, description: string): asserts value2 {
  if (!value2) throw new Error(description);
}

function read(...paragraph2: string[]): string {
  return readFileSync(join(...paragraph2), "utf8");
}

console.log("\n[Update settings and notifications]");

testCase("update settings are persisted", () => {
  const rust = read("src-tauri", "src", "settings", "updates.rs");
  const types = read("src", "bridge", "types-settings.ts");
  const dialog = read("src", "ui", "settings", "SettingsDialog.tsx");
  const general = read("src", "ui", "settings", "panes", "GeneralPane.tsx");
  const windowHook = read("src", "ui", "useSettingsWindow.ts");
  const command = read("src-tauri", "src", "commands", "settings.rs");
  assertValue(rust.includes("check_on_startup"), "Rust lacks the startup-check field");
  assertValue(rust.includes("notify_when_available"), "Rust lacks the update-notification field");
  assertValue(rust.includes("notification_position"), "Rust lacks the notification-position field");
  assertValue(types.includes("export interface UpdateSettings"), "the frontend lacks update-settings types");
  assertValue(!dialog.includes('| "updates"'), "the settings sidebar still has a standalone Updates page");
  assertValue(!dialog.includes("<UpdatePane"), "the standalone Updates page is still wired");
  assertValue(general.includes('title={t("Updates")}'), "the General page lacks the updates group");
  assertValue(
    general.includes("<SoftwareUpdatePane autoCheck={false} />"),
    "the General page lacks the manual update action",
  );
  assertValue(windowHook.includes('setInitialSection("general")'), "update notifications do not open General");
  assertValue(!windowHook.includes('setInitialSection("updates")'), "update notifications still open the old page");
  assertValue(
    command.includes("*current = next.clone();") &&
      command.indexOf("*current = next.clone();") < command.indexOf("current.save()"),
    "saving settings does not publish the new settings object to shared state",
  );
});

testCase("notification toggle depends on startup checks", () => {
  const general = read("src", "ui", "settings", "panes", "GeneralPane.tsx");
  assertValue(
    general.includes("disabled={!settings.updates.check_on_startup}"),
    "the notification switch is not dependent on startup checks",
  );
  assertValue(!general.includes('title={t("License")}'), "the General page still duplicates the license group");
});

testCase("notifications support position and actions", () => {
  const general = read("src", "ui", "settings", "panes", "GeneralPane.tsx");
  const toasts = read("src", "ui", "Toasts.tsx");
  const css = read("src", "styles", "toast.css");
  assertValue(general.includes('label={t("Notification position")}'), "notification position is missing from General");
  assertValue(toasts.includes("data-position"), "notification container has no position attribute");
  assertValue(toasts.includes("ToastAction"), "notifications have no action type");
  assertValue(toasts.includes("toast-action"), "notifications have no action button");
  assertValue(css.includes('[data-position="top-center"]'), "top-centered notification styles are missing");
});

testCase("startup checks run once after settings load", () => {
  const hook = read("src", "ui", "useUpdateNotifications.ts");
  assertValue(hook.includes("started.current"), "duplicate startup checks are not prevented");
  assertValue(hook.includes("check_on_startup"), "the startup-check switch is not read");
  assertValue(hook.includes("notify_when_available"), "the notification switch is not read");
});

testCase("app language command matches the frontend bridge", () => {
  const command = read("src-tauri", "src", "commands", "settings.rs");
  const bridge = read("src", "bridge", "ipc.ts");
  assertValue(bridge.includes('invoke<AppLang>("nota_app_lang")'), "the frontend language command changed");
  assertValue(
    command.includes('#[tauri::command(rename = "nota_app_lang")]'),
    "the backend language command does not match the frontend command",
  );
});

testCase("the menu bar defaults to Nota rendering and can use the native menu", () => {
  const rust = read("src-tauri", "src", "settings", "appearance.rs");
  const types = read("src", "bridge", "types-settings.ts");
  const pane = read("src", "ui", "settings", "panes", "AppearancePane.tsx");
  const hooks = read("src", "ui", "useMenus.ts");
  assertValue(rust.includes("MenuBarRenderer"), "Rust lacks the menu renderer enum");
  assertValue(rust.includes("menu_renderer: MenuBarRenderer::Nota"), "the default is not Nota rendering");
  assertValue(types.includes('export type MenuBarRenderer = "nota" | "system"'), "frontend renderer type is wrong");
  assertValue(pane.includes('label={t("Menu bar rendering")}'), "Appearance lacks the menu rendering option");
  assertValue(pane.includes("<Select") && pane.includes('{ value: "system", label: t("System native") }'), "menu rendering must use a select");
  assertValue(pane.includes('label: t("Nota (self-drawn)")'), "the default option does not identify Nota rendering");
  assertValue(hooks.includes('menuRenderer === "system"'), "the menu hook ignores the renderer setting");
  assertValue(hooks.includes("nativeMenuSignature"), "the native menu has no stable signature and can flicker");
  assertValue(hooks.includes("appliedNativeMenu"), "the native menu does not skip duplicate applications");
  assertValue(hooks.includes("window.setTimeout"), "native menu changes are not coalesced into one frame");
});

testCase("maximized and fullscreen windows can force the Nota menu by setting", () => {
  const rust = read("src-tauri", "src", "settings", "appearance.rs");
  const types = read("src", "bridge", "types-settings.ts");
  const pane = read("src", "ui", "settings", "panes", "AppearancePane.tsx");
  const immersive = read("src", "ui", "useImmersive.ts");
  const hooks = read("src", "ui", "useMenus.ts");
  const app = read("src", "App.tsx");
  const appCss = read("src", "styles", "app.css");
  assertValue(
    rust.includes("force_nota_menu_when_expanded: true"),
    "Rust does not enable the expanded-window menu fallback by default",
  );
  assertValue(
    types.includes("force_nota_menu_when_expanded: boolean"),
    "frontend settings lack the expanded-window menu fallback",
  );
  assertValue(
    pane.includes('label={t("Force Nota menu when maximized or full screen")}'),
    "Appearance lacks the expanded-window menu fallback switch",
  );
  assertValue(immersive.includes("isMaximized()"), "window maximized state is not read");
  assertValue(hooks.includes("effectiveMenuRenderer"), "there is no shared menu-renderer override");
  assertValue(hooks.includes("zenChromeActive"), "forced Nota menus do not bypass zen chrome");
  assertValue(
    app.includes("maximized || fullscreen") || app.includes("expandedWindow"),
    "maximized or fullscreen state is not connected to the renderer",
  );
  assertValue(app.includes("zenChromeActive"), "forced Nota menus are not connected to the zen predicate");
  assertValue(
    appCss.includes(".app[data-zen=\"true\"] .zen-top:hover .toolbar"),
    "reaching the top edge does not reveal the custom toolbar in fullscreen",
  );
});

testCase("Settings supports full-window, embedded and standalone presentation", () => {
  const rust = read("src-tauri", "src", "settings", "appearance.rs");
  const types = read("src", "bridge", "types-settings.ts");
  const pane = read("src", "ui", "settings", "panes", "AppearancePane.tsx");
  const dialog = read("src", "ui", "settings", "SettingsDialog.tsx");
  const css = read("src", "styles", "settings.css");
  const windowCommand = read("src-tauri", "src", "commands", "window.rs");
  assertValue(rust.includes("SettingsWindowStyle"), "Rust lacks the settings presentation enum");
  assertValue(
    rust.includes("settings_window_style: SettingsWindowStyle::Embedded"),
    "Settings does not default to the embedded card",
  );
  assertValue(
    types.includes('export type SettingsWindowStyle = "full" | "embedded" | "external"'),
    "frontend settings lack all three presentations",
  );
  for (const label of ["Full window", "Embedded card", "Separate window"]) {
    assertValue(pane.includes(`t("${label}")`), `Appearance lacks ${label}`);
  }
  assertValue(dialog.includes("standalone"), "Settings has no standalone mode");
  assertValue(css.includes('.settings-shell[data-settings-window-style="full"]'), "full-window styles are missing");
  assertValue(windowCommand.includes("nota_window_open_settings"), "the standalone Settings command is missing");
  assertValue(
    windowCommand.includes("window_host::launch(WindowRole::Settings"),
    "standalone Settings bypasses the shared window host",
  );
  assertValue(
    !windowCommand.includes("create_settings_window"),
    "Windows still creates the settings WebView in the main process",
  );
  assertValue(windowCommand.includes("nota_window_open_about"), "About does not reuse the presentation mode");
  assertValue(windowCommand.includes("nota_window_prepare_about"), "About has no prewarm path");
  assertValue(
    read("src-tauri", "src", "window_host.rs").includes(
      'Self::Settings => "settings.html"',
    ),
    "the shared window host has no Settings page entry",
  );
  assertValue(
    read("src-tauri", "src", "lib.rs").includes('window.label() == "about"'),
    "closing About still destroys instead of hiding for reuse",
  );
  assertValue(
    dialog.includes("{!standalone && <DialogClose"),
    "standalone Settings still shows a duplicate inline close button",
  );
  assertValue(
    read("src", "ui", "AboutDialog.tsx").includes("{!standalone && ("),
    "standalone About still shows a duplicate inline close button",
  );
  assertValue(
    read("src", "ui", "settings", "panes", "AppearancePane.tsx").includes(
      "Changes take effect the next time Preferences opens.",
    ),
    "the settings presentation note does not say it applies next time",
  );
});

testCase("source mode forces a monospace font", () => {
  const css = read("src", "styles", "editor.css");
  const source = read("src", "editor", "source.ts");
  assertValue(
    /\.editor-pane-source \.editor-mount \.cm-scroller[\s\S]*?font-family:\s*var\(--font-mono\)\s*!important/s.test(
      css,
    ),
    "source mode can still inherit a serif document font",
  );
  assertValue(source.includes("EditorView.lineWrapping"), "source mode still produces a horizontal scroller");
  assertValue(
    /\.editor-pane-source \.editor-mount \.cm-scroller\s*\{[^}]*overflow-x:\s*hidden\s*!important/s.test(
      css,
    ),
    "source mode does not hide the horizontal scrollbar",
  );
});

testCase("preset exporter arguments are editable and the template picker is custom", () => {
  const pane = read("src", "ui", "settings", "panes", "ExportPane.tsx");
  const rust = read("src-tauri", "src", "settings", "export.rs");
  assertValue(rust.includes("pub base_args: String"), "custom exporters lack editable base arguments");
  assertValue(pane.includes("currentCustom.base_args"), "preset exporter arguments are not editable");
  assertValue(!pane.includes("<select"), "adding from a template still uses a native select");
  assertValue(pane.includes("<Select"), "adding from a template does not use the custom select");
  const colorPicker = read("src", "ui", "settings", "ColorPicker.tsx");
  const controls = read("src", "styles", "settings-controls.css");
  assertValue(
    colorPicker.includes('className="stg-input"') &&
      /\.stg-input\s*\{[^}]*color:\s*var\(--fg\)/s.test(controls),
    "accent hex values do not use the settings foreground color",
  );
});

testCase("Adwaita control, switch and surface sizes match the design", () => {
  const shape = read("src", "styles", "theme", "shape.css");
  const color = read("src", "styles", "theme", "color.css");
  for (const token of [
    "--control-height: 34px",
    "--switch-w: 48px",
    "--switch-h: 26px",
    "--switch-knob: 22px",
    "--radius-lg: 12px",
    "--radius-sm: 6px",
  ]) {
    assertValue(shape.includes(token), `Adwaita design token is missing: ${token}`);
  }
  assertValue(color.includes("--accent: #1c71d8"), "Adwaita light accent is not #1c71d8");
  assertValue(color.includes("--sidebar-surface: #28282c"), "Adwaita dark sidebar surface is wrong");
  assertValue(color.includes("--settings-window-bg: #242424"), "Adwaita dark Settings background is wrong");
});

testCase("Yaru dark and system windows share one orange accent", () => {
  const color = read("src", "styles", "theme", "color.css");
  const controls = read("src", "styles", "settings-controls.css");
  const yaruDark = color.slice(
    color.indexOf('[data-ui-style="yaru"][data-ui-mode="dark"]'),
    color.length,
  );
  assertValue(yaruDark.includes("--accent: #e95420"), "Yaru dark accent is not the system orange");
  assertValue(yaruDark.includes("--radio-on: #e95420"), "Yaru dark radios use another orange");
  assertValue(
    controls.includes('.stg-radio-item input[type="radio"]:checked') &&
      controls.includes("radial-gradient"),
    "radio controls still use WebKitGTK rendering and can split their rings",
  );
});

if (fail > 0) {
  console.error(`\n${fail} failed`);
  process.exitCode = 1;
} else {
  console.log(`\n${pass} passed, 0 failed`);
}
