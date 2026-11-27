/** Developer-mode element hover inspector contracts. */

import { readFileSync } from "node:fs";

import {
  compactInspectorValue,
  inspectorPlacement,
  inspectorRows,
  inspectorSelector,
} from "@/ui/element-inspector";

let pass = 0;
let fail = 0;

function check(label: string, condition: unknown): void {
  if (condition) {
    pass++;
    console.log(`  ✔ ${label}`);
  } else {
    fail++;
    console.log(`  ✘ ${label}`);
  }
}

function equal(actual: unknown, expected: unknown, label: string): void {
  check(label, JSON.stringify(actual) === JSON.stringify(expected));
}

console.log("\n[Element hover inspector]");

equal(compactInspectorValue("  sans-serif\n  system-ui  "), "sans-serif system-ui", "whitespace is compacted");
check(
  compactInspectorValue("甲".repeat(80), 10) === `${"甲".repeat(9)}…`,
  "long values are truncated with an ellipsis",
);

const fakeElement = {
  tagName: "BUTTON",
  id: "save",
  classList: ["btn", "btn-primary", "ignored"],
} as unknown as Element;
equal(
  inspectorSelector(fakeElement),
  "button#save.btn.btn-primary",
  "the selector includes tag, id and the first two classes",
);

const rows = inspectorRows(
  {
    fontFamily: "Adwaita Sans, sans-serif",
    fontSize: "15px",
    fontWeight: "600",
    lineHeight: "22px",
    color: "rgb(31, 35, 40)",
    backgroundColor: "rgb(246, 248, 250)",
    padding: "4px 10px",
    borderRadius: "6px",
    display: "inline-flex",
  },
  118.4,
  32.2,
);
equal(rows, [
  { label: "font", value: "15px / 22px / 600" },
  { label: "font-family", value: "Adwaita Sans, sans-serif" },
  { label: "color", value: "rgb(31, 35, 40)" },
  { label: "background", value: "rgb(246, 248, 250)" },
  { label: "box", value: "118 × 32 / inline-flex" },
  { label: "padding", value: "4px 10px" },
  { label: "radius", value: "6px" },
], "font, color, box size and padding are all reported");

const below = inspectorPlacement(
  { left: 120, top: 100, right: 240, bottom: 140, width: 120 },
  1000,
  800,
);
equal(below.side, "below", "the panel appears below when there is room");
equal(below.style.top, 148, "the below-gap is 8px");
equal(below.style.width, 380, "wide windows keep the compact panel width");

const above = inspectorPlacement(
  { left: 900, top: 700, right: 980, bottom: 730, width: 80 },
  1000,
  800,
);
equal(above.side, "above", "the panel flips above when there is no room below");
equal(above.style.left, 612, "the panel is clamped for right-edge elements");

const app = readFileSync("src/App.tsx", "utf8");
check(
  app.includes(
    "<ElementInspector enabled={(settings?.general.debug_mode ?? false) && (settings?.general.element_inspector ?? false)} />",
  ),
  "the inspector mounts only when developer mode and its switch are both enabled",
);

const pane = readFileSync("src/ui/settings/panes/DebugPane.tsx", "utf8");
check(pane.includes('t("Element hover inspector")'), "the developer page exposes the inspector switch");
check(pane.includes("element_inspector"), "the switch writes the general setting");
const settingsWindow = readFileSync("src/ui/SettingsWindow.tsx", "utf8");
check(
  settingsWindow.includes("<ElementInspector") &&
    settingsWindow.includes("settings.general.element_inspector"),
  "standalone Preferences does not mount the element inspector",
);

const css = readFileSync("src/styles/element-inspector.css", "utf8");
check(css.includes("pointer-events: none"), "the inspector does not participate in hit testing");
check(css.includes("position: fixed"), "the inspector uses viewport coordinates");

const host = readFileSync("src-tauri/src/settings/general.rs", "utf8");
check(host.includes("pub element_inspector: bool"), "the Rust setting field exists");
check(host.includes("element_inspector: false"), "the inspector defaults off");

console.log(`\n${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
