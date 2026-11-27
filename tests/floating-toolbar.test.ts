/** Floating formatting toolbar layout and grouped menus. */

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

function assertValue(value: unknown, message: string): asserts value {
  if (!value) throw new Error(message);
}

const bar = readFileSync("src/ui/FormatBar.tsx", "utf8");
const css = readFileSync("src/styles/bars.css", "utf8");
const chrome = readFileSync("src/ui/useChromeVisibility.ts", "utf8");
const iconTable = readFileSync("src/ui/Icon.tsx", "utf8");

console.log("\n[Floating formatting toolbar]");

testCase("the toolbar groups paragraphs, common inline actions, media, lists and more", () => {
  for (const marker of [
    "format-selector",
    "openMenu === \"paragraph\"",
    "openMenu === \"list\"",
    "openMenu === \"more\"",
    "primaryInline.map(draw)",
    'draw(byCommand("link"))',
    'draw(byCommand("image"))',
    'draw(byCommand("quote"))',
  ]) {
    assertValue(bar.includes(marker), `toolbar is missing ${marker}`);
  }
  for (const command of [
    '"text"',
    '"h1"',
    '"h6"',
    '"ul"',
    '"ol"',
    '"task"',
    '"highlight"',
    '"codeBlock"',
    '"clearFormat"',
  ]) {
    assertValue(bar.includes(command), `grouped menu is missing command ${command}`);
  }
  for (const menuId of [
    '"para.table"',
    '"para.codeBlock"',
    '"para.mathBlock"',
    '"para.hr"',
    '"view.modeSource"',
    '"edit.copy"',
    '"edit.paste"',
    '"edit.copyAs"',
    '"edit.delete"',
  ]) {
    assertValue(bar.includes(menuId), `reference menu is missing command ${menuId}`);
  }
  assertValue(bar.includes("<MenuPopup"), "the shared menu component with shortcuts and checks is not used");
  assertValue(bar.includes("focusEditor"), "closing a menu does not restore editor focus");
});

testCase("the toolbar is out of document flow, docks at the bottom and opens menus upward", () => {
  assertValue(
    /\.app-main > \.format-bar[\s\S]*?position:\s*absolute;[\s\S]*?bottom:\s*calc\(var\(--nota-bottom-bar-height, 0px\) \+ 14px\);/.test(
      css,
    ),
    "the toolbar is not positioned above the measured bottom bar",
  );
  assertValue(css.includes("translateX(-50%)"), "the toolbar is not horizontally centered");
  assertValue(
    /\.format-menu\s*\{[\s\S]*?position:\s*absolute;[\s\S]*?bottom:\s*calc\(100% \+ 7px\)/.test(css),
    "group menus do not open above the toolbar",
  );
  assertValue(chrome.includes('"--nota-bottom-bar-height"'), "the bottom-bar height is not measured");
  assertValue(chrome.includes("ResizeObserver"), "bottom-bar height changes are not remeasured");
  assertValue(chrome.includes("MutationObserver"), "status-bar or tab-bar visibility changes are not remeasured");
});

testCase("the toolbar and controls follow theme radii instead of forcing a pill shape", () => {
  const base = readFileSync("src/styles/theme/base.css", "utf8");
  assertValue(
    base.includes("--format-bar-radius: var(--radius);"),
    "the floating toolbar does not inherit the active theme radius",
  );
  const selector = css.slice(css.indexOf(".format-selector"), css.indexOf(".format-caret"));
  const button = css.slice(
    css.indexOf(".app-main > .format-bar .format-btn"),
    css.indexOf(".app-main > .format-bar .format-btn:hover"),
  );
  assertValue(
    selector.includes("border-radius: var(--radius-sm);"),
    "the paragraph dropdown still uses a separate pill radius",
  );
  assertValue(
    button.includes("border-radius: var(--radius-sm);"),
    "toolbar buttons still use a separate pill radius",
  );
});

testCase("hover reveal starts from the bottom and ignores pointers inside open menus", () => {
  assertValue(chrome.includes("bottomPartTriggerBand"), "hover reveal still uses the top edge");
  assertValue(chrome.includes("mainArea.bottom - bottomPartTriggerBand"), "the trigger band is not tied to the main-area bottom");
  assertValue(chrome.includes('querySelectorAll(".format-menu")'), "the toolbar disappears while the pointer is inside a menu");
});

testCase("the More menu retains the hide action without a separate close icon", () => {
  assertValue(bar.includes('id: "view.toolbarNever"'), "the More menu lacks the hide action");
  assertValue(bar.includes('label: "Hide the formatting toolbar"'), "the hide action has no explicit label");
  assertValue(!bar.includes('className="format-bar-close"\n        title'), "the toolbar still has a separate close icon");
});

testCase("the list entry follows the current type and More uses an ellipsis icon", () => {
  assertValue(bar.includes("const currentListIcon"), "the list entry still uses a fixed bullet icon");
  assertValue(bar.includes('state?.block === "ol"'), "ordered lists do not switch to the numbered icon");
  assertValue(bar.includes('state?.block === "task"'), "task lists do not switch to the task icon");
  assertValue(
    bar.includes('Icon name="nota-view-more-horizontal-symbolic"'),
    "the More entry still uses three text dots",
  );
  assertValue(
    iconTable.includes('"nota-view-more-horizontal-symbolic"'),
    "the ellipsis icon is not registered",
  );
});

testCase("toolbar selected states use a restrained neutral fill", () => {
  assertValue(
    /\.app-main > \.format-bar \.format-btn\[data-on="true"\]\s*\{[\s\S]*?background:\s*var\(--bg-active\)/.test(
      css,
    ),
    "selected controls still use a large accent fill",
  );
});

testCase("the paragraph menu avoids drawing a duplicate Paragraph glyph", () => {
  assertValue(
    bar.includes('b.cmd === "text" ? null') ||
      /cmd:\s*"text"[\s\S]*?icon:/.test(bar),
    "the paragraph entry still draws both an English glyph and a localized label",
  );
});

testCase("Normal text uses Ctrl+0 and checks the current block type", () => {
  assertValue(bar.includes('"para.text": state.block === "text"'), "Normal text is not checked for text blocks");
  const translation = readFileSync("src/i18n/zh-ui.ts", "utf8");
  assertValue(translation.includes('"Normal text": "普通文字"'), "Normal text has the wrong localized label");
});

console.log(`\n${pass} passed, ${fail} failed`);
if (fail > 0) process.exitCode = 1;
