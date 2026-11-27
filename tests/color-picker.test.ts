/** Self-drawn accent color picker contracts. */

import { readFileSync } from "node:fs";

import { accentPalette } from "@/ui/settings/ColorPicker";

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

console.log("\n[Self-drawn accent color picker]");

testCase("the palette is a valid, unique 9x5 color grid", () => {
  assertValue(accentPalette.length === 45, "the palette is not 9x5");
  assertValue(
    accentPalette.every((color) => /^#[0-9a-f]{6}$/.test(color)),
    "the palette contains an invalid color",
  );
  assertValue(new Set(accentPalette).size === accentPalette.length, "the palette contains duplicate colors");
});

testCase("the native color input is not used", () => {
  const picker = readFileSync("src/ui/settings/ColorPicker.tsx", "utf8");
  const appearance = readFileSync(
    "src/ui/settings/panes/AppearancePane.tsx",
    "utf8",
  );
  assertValue(!picker.includes('type="color"'), "ColorPicker still uses the native color input");
  assertValue(!appearance.includes('type="color"'), "Appearance still contains a native color input");
  assertValue(picker.includes("createPortal("), "the custom palette is not rendered in a viewport layer");
});

testCase("the custom palette preserves selection, keyboard input and custom colors", () => {
  const picker = readFileSync("src/ui/settings/ColorPicker.tsx", "utf8");
  for (const key of ['"ArrowLeft"', '"ArrowRight"', '"ArrowUp"', '"ArrowDown"', '"Escape"']) {
    assertValue(picker.includes(key), `the palette is missing ${key}`);
  }
  assertValue(picker.includes("parseAccent(draft)"), "custom colors do not use the shared parser");
  assertValue(picker.includes("onChange(color)"), "clicking a swatch does not write the accent color");
  assertValue(picker.includes('role="radio"'), "swatches are missing radio semantics");
  assertValue(picker.includes('aria-checked={index === selected}'), "the selected color is not exposed to assistive technology");
});

testCase("inline dots use the active theme accent list", () => {
  const picker = readFileSync("src/ui/settings/ColorPicker.tsx", "utf8");
  const base = readFileSync("src/styles/theme/base.css", "utf8");
  const macos = readFileSync("src/styles/theme/color.css", "utf8");
  assertValue(
    picker.includes("--accent-choice-${index + 1}"),
    "picker does not read theme-provided accent choices",
  );
  assertValue(
    picker.includes("defaultAccentDots"),
    "picker has no fallback accent list",
  );
  for (let index = 1; index <= 8; index += 1) {
    assertValue(
      base.includes(`--accent-choice-${index}:`),
      `default accent choice ${index} is missing`,
    );
    assertValue(
      macos.includes(`--accent-choice-${index}:`),
      `macOS accent choice ${index} is missing`,
    );
  }
});

testCase("the palette styles and entry point are connected", () => {
  const css = readFileSync("src/styles/color-picker.css", "utf8");
  const main = readFileSync("src/main.tsx", "utf8");
  const appearance = readFileSync(
    "src/ui/settings/panes/AppearancePane.tsx",
    "utf8",
  );
  assertValue(css.includes(".stg-color-dots"), "inline color-dot styles are missing");
  assertValue(css.includes(".stg-color-add"), "custom-color add-button styles are missing");
  assertValue(css.includes("position: fixed"), "the palette is still clipped by the settings scroller");
  assertValue(main.includes('import "./styles/color-picker.css";'), "palette styles are not loaded");
  assertValue(appearance.includes("<ColorPicker"), "Appearance does not use the custom palette");
});

console.log(`\n${pass} passed, ${fail} failed`);
if (fail) process.exitCode = 1;
